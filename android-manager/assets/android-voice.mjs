if (!Element.prototype.replaceChildren) {
  Element.prototype.replaceChildren=function(...nodes) {this.textContent='';this.append(...nodes);};
}
// Adapt Android's in-app recognizer to the events used by both existing remotes.
let active, sequence=0;
const send=(op,id,lang='')=>window.prompt('neuti-manager-voice',JSON.stringify({op,id,lang}));
class AndroidRecognition {
  start() {
    if(active)throw new DOMException('Recognition is already running','InvalidStateError');
    window.addEventListener('neuti-voice',fromAndroid);
    this.id=++sequence;active=this;
    if(send('start',this.id,this.lang)!=='ok'){active=null;throw new Error('Voice input unavailable');}
  }
  abort(){if(active===this){active=null;send('cancel',this.id);}}
  stop(){if(active===this)send('stop',this.id);}
}
function fromAndroid({detail}) {
  const rec=active;if(!rec || rec.id!==detail.id)return;
  const {type,words,error}=detail;
  if(type==='error'){active=null;rec.onerror?.({error});rec.onend?.();return;}
  if(type==='partial' || type==='final'){
    const row=words.map(transcript=>({transcript}));
    row.isFinal=type==='final';
    if(row.isFinal)active=null;
    if(row.length)rec.onresult?.({resultIndex:0,results:[row]});
    if(row.isFinal)rec.onend?.();
    return;
  }
  rec['on'+type]?.();
}
window.SpeechRecognition=AndroidRecognition;
