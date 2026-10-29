import { videoIdFromUrl, requestId } from './queue-protocol.mjs?v=2.9';
import { QUEUE_TEXT } from './queue-text.mjs?v=2.9';
export function createQueueUi({connection,getLanguage,blocked,$=id=>document.getElementById(id)}) {
  let status='hint', failed=false, pending=false, job=null;
  const input=$('queue-url'), button=$('queue-add');
  // Preserve a draft in this tab when the guest switches to YouTube and returns.
  try {input.value=sessionStorage.getItem('wk-queue-draft') || '';} catch {}
  function save(){try{sessionStorage.setItem('wk-queue-draft',input.value);}catch{}}
  function render(){
    const w=QUEUE_TEXT[getLanguage()], ready=connection.state==='ready', busy=blocked()||pending;
    for(const [id,key] of Object.entries({'queue-title':'title','queue-help':'help','queue-url-label':'label','queue-youtube':'youtube','queue-note':'note'})) $(id).textContent=w[key];
    input.placeholder='https://youtu.be/…';input.disabled=busy;
    button.disabled=!ready||!connection.queueSupported||busy||!input.value.trim();
    button.textContent=w[pending?'sending':'add'];
    let key=status;
    if(!pending && status!=='success') {if(!ready && connection.state!=='sending')key='connect';else if(!connection.queueSupported)key='update';}
    $('queue-feedback').textContent=w[key];$('queue-feedback').classList.toggle('error',failed||key==='update');
  }
  input.addEventListener('input',()=>{job=null;status='hint';failed=false;save();render();});
  button.addEventListener('click',async()=>{
    if(button.disabled||pending)return;
    const id=videoIdFromUrl(input.value);
    if(!id){status='invalid';failed=true;render();return;}
    if(!job||job.video!==id)job={video:id,request:requestId()};
    const current=job;pending=true;status='sending';failed=false;render();
    try {
      const reply=await connection.addVideo(id,current.request,getLanguage());
      if(!reply.ok)throw new Error('failed');
      status='success';input.value='';job=null;save();
    }catch{status='failed';failed=true;}
    finally{pending=false;render();}
  });
  render();return {render};
}
