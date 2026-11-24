// Non-extractable Web Crypto keys are structured-cloned into this browser's
// IndexedDB. Only a completed transaction counts as device registration.
const dbName='neuti-manager-device-v1';
function connect(factory) {
  return new Promise((resolve,reject)=>{
    if(!factory){reject(Error('device storage unavailable'));return;}
    const request=factory.open(dbName,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('apps');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>resolve(request.result);
  });
}
async function operation(factory,mode,prepare) {
  const db=await connect(factory);
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction('apps',mode), req=prepare(tx.objectStore('apps'));
      tx.oncomplete=()=>resolve(req.result);
      tx.onabort=tx.onerror=()=>reject(tx.error||Error('device storage unavailable'));
    });
  } finally {db.close();}
}
export const registeredDevice=(factory,product)=>operation(factory,'readonly',s=>s.get(product));
export const registerDevice=(factory,product,salt,keys)=>operation(factory,'readwrite',s=>s.put({v:1,salt,keys},product));
