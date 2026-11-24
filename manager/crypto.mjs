const bytes = text => Uint8Array.from(atob(text),ch=>ch.charCodeAt(0));
const encode = bytes => btoa(Array.from(new Uint8Array(bytes), n=>String.fromCharCode(n)).join(''));
const utf8 = new TextEncoder();
const decode = buffer => new TextDecoder('utf-8',{fatal:true}).decode(buffer);

export async function openEnvelope(envelope, password, product) {
  if (envelope.v!==1 || envelope.product!==product || envelope.iterations!==600000)
    throw Error('잘못된 앱 파일입니다.');
  const {subtle}=crypto;
  const passwordKey=await subtle.importKey('raw',utf8.encode(password),'PBKDF2',false,['deriveBits']);
  const salt=bytes(envelope.salt);
  const master=await subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:envelope.iterations,salt},passwordKey,256);
  const root=await subtle.importKey('raw',master,'HKDF',false,['deriveKey']);
  const derive=(purpose, usages, type={name:'AES-GCM',length:256})=>subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:utf8.encode(product+'/'+purpose)},root,type,false,usages);
  const appKey=await derive('app-v1',['decrypt']);
  const aad=utf8.encode('neuti-manager/'+product+'/app-v1');
  const source=decode(await subtle.decrypt({name:'AES-GCM',iv:bytes(envelope.iv),additionalData:aad},appKey,bytes(envelope.data)));
  return {source, vaultKey:{cipher:await derive('device-v1',['encrypt','decrypt']),index:await derive('index-v1',['sign'],{name:'HMAC',hash:'SHA-256'})}};
}

export async function openVault(product, key, storage) {
  const storageName='neuti-sealed-device-v1/'+product;
  const prefix=storageName+'/', data=new Map();
  const aad=utf8.encode(storageName);
  let slots=[];
  try {for(let i=0;i<storage.length;i++) {const k=storage.key(i);if(k?.startsWith(prefix))slots.push(k);}} catch {}
  await Promise.all(slots.map(async slot=>{
    const record=storage.getItem(slot);if(!record)return;
    const {iv,box}=JSON.parse(record);
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:aad},key.cipher,bytes(box));
    const [name,value]=JSON.parse(decode(plain));data.set(name,value);
  }));
  let pending=Promise.resolve();
  function write(name,value) {
    const save=async()=>{
      if(!storage)throw Error('저장 공간을 열 수 없습니다.');
      const tag=await crypto.subtle.sign('HMAC',key.index,utf8.encode(name));
      const slot=prefix+encode(tag);
      if(value===null){storage.removeItem(slot);return;}
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const plain=utf8.encode(JSON.stringify([name,value]));
      const box=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key.cipher,plain);
      storage.setItem(slot,JSON.stringify({iv:encode(iv),box:encode(box)}));
    };
    pending=pending.catch(()=>{}).then(save);return pending;
  }
  return {
    get length(){return data.size;},key:index=>[...data.keys()][index]??null,
    getItem:name=>data.get(name)??null,
    setItem(name,value){data.set(name,value);return write(name,value);},
    removeItem(name){data.delete(name);return write(name,null);}
  };
}
