import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {validate,snapshot} from '../scripts/sync-favorites.mjs';
const countries=['ko','th','fil','vi','ne','mn','id','lo','my','zh-CN','ja','und'];
const row=(extra={})=>({country:'ko',id:'abcdefghijk',title:'노래 · เพลง · Bài hát',url:'https://www.youtube.com/watch?v=abcdefghijk',count:5,lastPlayed:'2026-11-01T00:00:00.0000000Z',...extra});
const exportData=rows=>({format:'WorldKaraoke.CloudFavorites',version:1,updatedAt:'2026-11-01T00:00:00Z',countries,rows});
test('snapshot ranks by play count and exports exactly the public fields',()=>{
 const data=validate(exportData([row({count:1}),row({id:'zyxwvutsrqp',url:'https://www.youtube.com/watch?v=zyxwvutsrqp',count:20,origin:'private',key:'secret',pcName:'private'})]));
 assert.equal(data.rows[0].count,20);assert.ok(!JSON.stringify(data).includes('private'));assert.ok(!JSON.stringify(data).includes('secret'));
});
test('snapshot rejects malformed, duplicate and unsafe counts',()=>{
 for(const rows of [[row(),row()],[row({count:-1})],[row({count:1.5})],[row({count:Number.MAX_SAFE_INTEGER+1})],[row({url:'javascript:alert(1)'})],[row({country:'xx'})]])assert.throws(()=>validate(exportData(rows)));
});
test('writes all country files, retains Unicode, leaves prior backup on outage/reset',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'wk-snapshot-'));
 try{
  const fetchImpl=async()=>Response.json(exportData(countries.map(country=>row({country}))));
  const result=await snapshot({directory:dir,fetchImpl});assert.equal(result.files,13);assert.equal(result.videos,12);
  const previous=await readFile(path.join(dir,'all.json'),'utf8');assert.ok(previous.includes('Bài hát'));
  for(const country of countries){const data=JSON.parse(await readFile(path.join(dir,country+'.json'),'utf8'));assert.equal(data.rows.length,1);assert.equal(data.rows[0].country,country);}
  await assert.rejects(snapshot({directory:dir,fetchImpl:async()=>new Response('offline',{status:503})}));
  await assert.rejects(snapshot({directory:dir,fetchImpl:async()=>Response.json(exportData([]))}));
  assert.equal(await readFile(path.join(dir,'all.json'),'utf8'),previous);
 }finally{await rm(dir,{recursive:true,force:true});}
});
