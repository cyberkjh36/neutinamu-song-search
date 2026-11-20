/* Only catalog metadata is downloaded. A batch is marked complete after its rows are stored. */
(function(){
 'use strict';
 function attach({base,dbName,importBatch,refreshCount}){
  const prefix=dbName+'-tj-batch-',interval=6*60*60*1000;
  let running=null,lastSuccess=0;
  async function get(url){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
   try{
    const response=await fetch(url,{cache:'no-cache',credentials:'omit',signal:controller.signal});
    if(!response.ok)throw Error('곡 목록을 받을 수 없습니다.');
    return await response.arrayBuffer();
   }finally{clearTimeout(timer);}
  }
  async function update(){
   const decoder=new TextDecoder('utf-8',{fatal:true});
   const manifest=JSON.parse(decoder.decode(await get(base+'catalog-updates.json')));
   if(manifest.schema!==1||!Array.isArray(manifest.batches))throw Error('곡 목록 형식을 확인해 주세요.');
   for(const batch of manifest.batches){
    if(!/^catalog-update-\d{8}(?:-[a-f0-9]{12})?\.csv$/.test(batch.file)||!/^[a-f0-9]{64}$/.test(batch.sha256)||
       !Number.isSafeInteger(batch.count)||batch.count<1||batch.count>50000)throw Error('신곡 목록 정보가 올바르지 않습니다.');
    if(localStorage.getItem(prefix+batch.sha256)==='done')continue;
    const bytes=await get(base+batch.file);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(hash!==batch.sha256)throw Error('신곡 파일을 다시 받아야 합니다.');
    await importBatch(decoder.decode(bytes),batch.count,true);
    localStorage.setItem(prefix+hash,'done');
    await refreshCount();
   }
   lastSuccess=Date.now();
  }
  function check(){
   if(running||navigator.onLine===false||document.hidden||Date.now()-lastSuccess<interval)return;
   running=update().catch(()=>{}).finally(()=>{running=null;});
  }
  window.addEventListener('online',check);
  document.addEventListener('visibilitychange',check);
  setInterval(check,interval);
  check();
 }
 function clear(dbName){
  const prefix=dbName+'-tj-batch-';
  for(const k of Object.keys(localStorage))if(k.startsWith(prefix))localStorage.removeItem(k);
 }
 window.TJCatalogSync={attach,clear};
})();
