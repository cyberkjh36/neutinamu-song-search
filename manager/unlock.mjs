import {openEnvelope,openRegisteredEnvelope,openVault} from './crypto.mjs?v=2';
import {registeredDevice,registerDevice} from './device.mjs?v=2';
const product=document.documentElement.dataset.product;
const form=document.getElementById('unlock'), field=document.getElementById('password');
const status=document.getElementById('unlock-status'), button=form.querySelector('button');
const deviceStatus=document.getElementById('device-status') || document.createElement('p');
if(!deviceStatus.isConnected)form.before(deviceStatus);
form.hidden=true;
let loading, factory; try {factory=window.indexedDB;} catch {}
function envelope() {
  if(!loading)loading=fetch('./manager.sealed.json?v=2',{credentials:'same-origin'}).then(r=>{
    if(!r.ok)throw Error('앱 파일을 불러오지 못했습니다.');return r.json();
  }).catch(e=>{loading=null;throw e;});
  return loading;
}
async function launch(source,keys,warning='') {
  const payload=JSON.parse(source);
  let storage;try {storage=window.localStorage;} catch {}
  const vault=await openVault(product,keys.vaultKey,storage);
  const url=URL.createObjectURL(new Blob([payload.module],{type:'text/javascript'}));
  try {
    const manager=await import(url);
    Object.defineProperty(window,'NeutiManager',{value:Object.freeze({...manager,vault,registrationWarning:warning}),configurable:true});
    document.open();document.write(payload.shell);document.close();
  } finally {URL.revokeObjectURL(url);}
}
function promptRegistration(message) {
  deviceStatus.textContent=message;form.hidden=false;button.disabled=false;
}
function retryStart() {
  form.hidden=true;deviceStatus.textContent='등록한 앱을 열 수 없습니다. 인터넷 연결을 확인해 주세요.';
  const retry=document.createElement('button');retry.type='button';retry.textContent='다시 열기';
  retry.onclick=()=>location.reload();deviceStatus.after(retry);
}
async function start() {
  void envelope().catch(()=>{});
  const saved=await registeredDevice(factory,product).catch(()=>null);
  if(!saved){promptRegistration('처음 한 번만 등록하면 다음부터 바로 방을 선택할 수 있습니다.');return;}
  let sealed;
  try {sealed=await envelope();} catch {retryStart();return;}
  if(saved.v!==1 || saved.salt!==sealed.salt){promptRegistration('새 비밀번호로 이 휴대폰을 다시 등록해 주세요.');return;}
  try {await launch(await openRegisteredEnvelope(sealed,saved.keys,product),saved.keys);}
  catch {retryStart();}
}
form.addEventListener('submit',async event=>{
  event.preventDefault(); if(form.hidden || button.disabled || !field.value)return;
  button.disabled=true;status.textContent='휴대폰을 등록하고 있습니다…';
  let stage='download';
  try {
    const sealed=await envelope();stage='password';
    const {source,keys}=await openEnvelope(sealed,field.value,product);
    field.value='';stage='device';
    let warning='';
    try {await registerDevice(factory,product,sealed.salt,keys);}
    catch {warning='이 브라우저는 기기 등록을 저장하지 못했습니다. 일반 Chrome 또는 Safari에서 열어 주세요.';}
    await launch(source,keys,warning);
  } catch {
    if(stage==='password'){status.textContent='비밀번호를 확인하고 다시 입력해 주세요.';field.select();field.focus();}
    else status.textContent='앱을 열 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.';
    button.disabled=false;
  }
});
void start();
