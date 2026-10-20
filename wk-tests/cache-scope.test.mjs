import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import{readFileSync}from'node:fs';
test('root cache ignores the complete karaoke scope and preserves the original app',()=>{
 const listeners={};let claimed=0;
 const context={URL,self:{location:new URL('https://cyberkjh36.github.io/neutinamu-song-search/sw.js'),addEventListener:(type,fn)=>listeners[type]=fn},caches:{open:async()=>({match:async()=>new Response('cache')})}};
 vm.runInNewContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),context);
 for(const path of ['wk/','wk/app.mjs','wk/flags/korea.png'])listeners.fetch({request:{method:'GET',url:'https://cyberkjh36.github.io/neutinamu-song-search/'+path,mode:'navigate'},respondWith:()=>claimed++});
 assert.equal(claimed,0);
 listeners.fetch({request:{method:'GET',url:'https://cyberkjh36.github.io/neutinamu-song-search/icon.svg',mode:'cors'},respondWith:()=>claimed++});assert.equal(claimed,1);
});
