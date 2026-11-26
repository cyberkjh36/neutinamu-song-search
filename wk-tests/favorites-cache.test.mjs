import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';
import {createFavoritesCache} from '../wk/favorites-cache.mjs';
import {projectFavorites,listFavorites} from '../wk/favorites-classifier.mjs';
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
    assert.deepEqual(ids,listFavorites(projectFavorites(all.rows),country).sort((a,b)=>b.count-a.count||(a.lastPlayed<b.lastPlayed?1:a.lastPlayed>b.lastPlayed?-1:0)||(a.id<b.id?-1:a.id>b.id?1:0)).map(row=>row.id));
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
  assert.equal(b.page('ko-KR','이전',0,'all').catalog.items[0].title,'이전 곡');
  d.set(second);await b.refresh();
  assert.equal(b.page('ko-KR','날  비',0,'all').catalog.items[0].channel,'12');
  assert.equal(b.page('th-TH','เพลงใหม่',0,'all').catalog.items[0].title,'เพลงใหม่');
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
  assert.equal(readCatalog(cache.page('ko-KR','가',0,'all').catalog).items[0].title,'가'.repeat(199));
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

test('leaving the page cancels its download without starting a mirror request and a return can retry', async () => {
  globalThis.indexedDB = new IDBFactory();
  const calls = [];
  const latest = snapshot(12,[song('ko',1,'돌아와서 저장')]);
  const cache = createFavoritesCache({fetchList:async (url,{signal}) => {
    calls.push(url);
    if (calls.length > 1) return Response.json(latest);
    return new Promise((resolve,reject) => signal.addEventListener('abort',() => reject(Error('left page'))));
  }});
  const leaving = cache.refresh();
  cache.cancelRefresh();
  await leaving;
  assert.equal(calls.length,1);
  await cache.refresh();
  assert.deepEqual(calls,[calls[0],calls[0]]);
  assert.equal(cache.saved,true);
});

test('actual projection preserves all plays, separates Thai and MV from Filipino favorites',async()=>{
 const all=JSON.parse(await readFile(new URL('../data/favorites/all.json',import.meta.url)));
 const cache=device(all).open();await cache.refresh();
 const projected=projectFavorites(all.rows);
 assert.equal(projected.reduce((a,r)=>a+r.count,0),all.rows.reduce((a,r)=>a+r.count,0));
 assert.equal(projected.length,new Set(all.rows.map(r=>r.id)).size);
 const allIds=[];for(let p=0;;p++){const x=cache.page('fil-PH','',p,'all');allIds.push(...readCatalog(x.catalog).items.map(v=>v.id));if(!x.more)break;}
 assert.equal(allIds.length,projected.length);assert.equal(new Set(allIds).size,projected.length);
 const fixtures=[song('fil','1','เพลง คาราโอเกะ',3),song('th','1','เพลง คาราโอเกะ',2),song('fil','2','Title Official MV',4)];
 const c=device(snapshot(12,fixtures)).open();await c.refresh();
 assert.equal(c.page('fil-PH','',0).catalog.items.length,0);
 assert.equal(c.page('th-TH','',0).catalog.items[0].channel,'5');
 assert.equal(c.page('fil-PH','',0,'other').catalog.items[0].channel,'4');
 assert.equal(c.snapshot.rows.length,3);
});
