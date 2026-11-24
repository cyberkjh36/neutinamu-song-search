import {openEnvelope,openVault} from './crypto.mjs';
const product=document.documentElement.dataset.product;
const form=document.getElementById('unlock'), field=document.getElementById('password');
const status=document.getElementById('unlock-status'), button=form.querySelector('button');
let loading;
function envelope() {
  if(!loading)loading=fetch('./manager.sealed.json',{credentials:'same-origin'}).then(r=>{
    if(!r.ok)throw Error('앱 파일을 불러오지 못했습니다.');return r.json();
  }).catch(e=>{loading=null;throw e;});
  return loading;
}
void envelope().catch(()=>{});
form.addEventListener('submit',async event=>{
  event.preventDefault(); if(button.disabled || !field.value)return;
  button.disabled=true; status.textContent='리모컨을 여는 중…';
  let stage='download', url;
  try {
    const sealed=await envelope();stage='password';
    const {source,vaultKey}=await openEnvelope(sealed,field.value,product);
    field.value='';stage='device';
    const payload=JSON.parse(source);
    let storage;try {storage=window.localStorage;} catch {}
    const vault=await openVault(product,vaultKey,storage);
    stage='module';
    url=URL.createObjectURL(new Blob([payload.module],{type:'text/javascript'}));
    const manager=await import(url);
    Object.defineProperty(window,'NeutiManager',{value:Object.freeze({...manager,vault}),configurable:true});
    document.open();document.write(payload.shell);document.close();
  } catch {
    if(stage==='password'){status.textContent='비밀번호를 확인하고 다시 입력해 주세요.';field.select();field.focus();}
    else status.textContent=stage==='device'?'이 휴대폰에 저장된 방 정보를 열 수 없습니다.':'앱을 열 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.';
    button.disabled=false;
  } finally {if(url)URL.revokeObjectURL(url);}
});
