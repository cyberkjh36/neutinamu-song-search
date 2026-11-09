const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const data=require('../favorites-data.js');
const root=path.join(__dirname,'..');
// Parse the exact CSV representation used by the app, including quoted titles.
const script=Array.from(fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)).pop()[1];
const csvParse=vm.runInNewContext('('+script.match(/function csvParse[\s\S]*?(?=\nfunction headerKey)/)[0]+')');
const songs=new Map();
for(const file of ['catalog-20261018.csv','catalog-update-20261104.csv']){
 for(const [code,title,artist] of csvParse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''),',').slice(1))songs.set(code,{code,title,artist});
}
test('three requested categories each have 50 distinct, catalog-verified songs',()=>{
 assert.deepEqual(data.groups.map(g=>g.id),['age3040','age5060','trot']);
 for(const group of data.groups){
  assert.equal(group.songs.length,50);assert.equal(new Set(group.songs.map(s=>s.code)).size,50);
  for(const song of group.songs){assert.match(song.code,/^[1-9][0-9]{0,7}$/);assert.deepEqual({code:song.code,title:song.title,artist:song.artist},songs.get(song.code));}
 }
});
test('every recommendation has a matching captured public TJ chart number and rank',()=>{
 assert.deepEqual(data.period,{start:'2026-10-01',end:'2026-10-31'});
 assert.match(data.note,/연령별 공식 순위.*아닙니다/);
 for(const group of data.groups)for(const song of group.songs){
  assert.ok(song.evidence.length);
  for(const evidence of song.evidence){
   const chart=JSON.parse(fs.readFileSync(path.join(root,'p2-direct/research/favorites-202610-'+evidence.chart+'.json')));
   assert.ok(chart.some(row=>row.code===song.code&&row.rank===evidence.rank),song.code);
  }
 }
 assert.deepEqual(data.groups[2].songs.map(s=>s.evidence.find(e=>e.chart==='6').rank),Array.from({length:50},(_,i)=>i+1));
});
