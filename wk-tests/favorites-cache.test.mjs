import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';
import {createFavoritesCache} from '../wk/favorites-cache.mjs';
import {readCatalog} from '../wk/browse-protocol.mjs';

const countries = ['ko','th','fil','vi','ne','mn','id','lo','my','zh-CN','ja','und'];
const snapshot = (day, rows) => ({
  format:'WorldKaraoke.CloudFavorites', version:1, countries,
  updatedAt:`2026-11-${day}T00:00:00Z`, rows
});
function song(country, id, title, count=1) {
  return {country, id:String(id).padStart(11,'0'), title, count, lastPlayed:'2026-11-01T00:00:00Z'};
}
function device(data) {
  globalThis.indexedDB = new IDBFactory();
  let response = data;
  const fetches = [];
  const open = () => createFavoritesCache({fetchList:async (url, init) => {
    fetches.push({url, init});
    if (response instanceof Error) throw response;
    return Response.json(response);
  }});
  return {open, fetches, set(data){response=data;}};
}

test('one download on join saves the entire actual multilingual list and local paging never fetches', async () => {
  const all = JSON.parse(await readFile(new URL('../data/favorites/all.json',import.meta.url)));
  const d=device(all), cache=d.open();
  await cache.refresh();
  assert.equal(cache.snapshot.rows.length, all.rows.length);
  assert.equal(cache.saved, true);
  const reopened=d.open();
  await reopened.restore();
  assert.equal(reopened.snapshot.rows.length, all.rows.length);
  for (const lang of ['ko-KR','th-TH','fil-PH','vi-VN','ne-NP','mn-MN','id-ID','lo-LA','my-MM','zh-CN','ja-JP']) {
    const ids=[];
    for(let page=0;;page++) {
      const result=reopened.page(lang,'',page);
      ids.push(...readCatalog(result.catalog).items.map(x=>x.id));
      if(!result.more) break;
    }
    const country=lang==='zh-CN'?lang:lang.split('-')[0];
    assert.deepEqual(ids,all.rows.filter(row=>row.country===country).map(row=>row.id));
  }
  assert.equal(d.fetches.length,1);
  assert.equal(d.fetches[0].init.credentials,'omit');
});

test('reconnect updates titles, new songs, counts and removals, while failed or older snapshots keep the latest full list', async () => {
  const first=snapshot(10,[song('th',1,'เก่า'),song('ko',2,'이전 곡')]);
  const second=snapshot(11,[song('th',1,'เพลงใหม่',5),song('ko',3,'비 오는-날',12)]);
  const d=device(first), a=d.open();
  await a.refresh();
  const b=d.open();await b.restore();
  assert.equal(b.page('ko-KR','',0).catalog.items[0].title,'이전 곡');
  d.set(second);await b.refresh();
  assert.equal(b.page('ko-KR','날  비',0).catalog.items[0].channel,'12');
  assert.equal(b.page('th-TH','',0).catalog.items[0].title,'เพลงใหม่');
  for(const bad of [first,{...second,rows:[second.rows[0],second.rows[0]]},new Error('offline')]){
    d.set(bad);await a.refresh();
    const c=d.open();await c.restore();
    assert.deepEqual(c.snapshot.rows,second.rows);
  }
});

test('a late old response cannot replace a newer snapshot in either the tab or the database',async()=>{
  globalThis.indexedDB=new IDBFactory();
  const replies=[];
  const cache=createFavoritesCache({fetchList:()=>new Promise(resolve=>replies.push(resolve))});
  const old=cache.refresh(),fresh=cache.refresh();
  replies[1](Response.json(snapshot(12,[song('ko',2,'새 곡')])));
  await fresh;
  replies[0](Response.json(snapshot(11,[song('ko',1,'이전 곡')])));
  await old;
  const other=createFavoritesCache();await other.restore();
  assert.equal(cache.snapshot.rows[0].title,'새 곡');
  assert.equal(other.snapshot.rows[0].title,'새 곡');
});

test('storage denial still allows in-session browsing and long titles remain reservable',async()=>{
  globalThis.indexedDB=undefined;
  const cache=createFavoritesCache({fetchList:async()=>Response.json(snapshot(12,[
    song('ko',1,'가'.repeat(199)+'🎵가')
  ]))});
  await cache.refresh();
  assert.equal(cache.saved,false);
  assert.equal(readCatalog(cache.page('ko-KR','가',0).catalog).items[0].title,'가'.repeat(199));
});

test('a failed primary uses the published mirror without saving a partial response',async()=>{
  globalThis.indexedDB=new IDBFactory();
  let calls=0;
  const cache=createFavoritesCache({fetchList:async()=>++calls===1?Response.json({rows:[]}):Response.json(snapshot(11,[]))});
  await cache.refresh();
  assert.equal(calls,2);
  assert.equal(cache.saved,true);
  assert.deepEqual(cache.snapshot.rows,[]);
});
