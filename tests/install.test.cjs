const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const scripts=Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g),x=>x[1]);
function app({shortcut=false,samsung=false,ios=false,ipad=false,standalone=false,storageFailure=false}={}){
 const elements={},events={};
 function element(){return {hidden:false,textContent:'',children:[],appendChild(x){this.children.push(x);return x},removeChild(x){this.children.splice(this.children.indexOf(x),1)},get firstChild(){return this.children[0]},setAttribute(k,v){this[k]=v},style:{}}}
 const get=id=>Object.prototype.hasOwnProperty.call(elements,id)?elements[id]:(elements[id]=element());
 get('appManifest').parentNode={removeChild(){elements.appManifest=null}};
 const tags=[element(),element()];let registered=0;
 const context={location:{search:shortcut?'?shortcut=1':'',protocol:'https:'},navigator:{userAgent:ipad?'Macintosh':ios?'iPhone':samsung?'Android SamsungBrowser/7.4':'Android Chrome/65',maxTouchPoints:ipad?5:0,standalone},document:{readyState:'complete',getElementById:get,querySelectorAll:()=>tags,createElement:element},encodeURIComponent};
 context.window=context;context.matchMedia=()=>({matches:false});context.addEventListener=(n,f)=>events[n]=f;
 if(storageFailure)context.navigator.serviceWorker={register(){registered++;return Promise.reject(Error('blocked'))}};
 vm.runInNewContext(scripts[0],context);vm.runInNewContext(scripts[1],context);
 return {get,events,context,tags,registered:()=>registered};
}
test('old Galaxy without install event or service worker still offers a browser shortcut',()=>{
 const a=app();assert.equal(a.get('shortcutLink').hidden,true);assert.equal(a.get('browserButtons').hidden,true);
 a.get('installBtn').onclick();assert.equal(a.get('installHelp').hidden,false);
 assert.equal(a.get('shortcutLink').hidden,false);assert.equal(a.get('browserButtons').hidden,false);
 assert.equal(a.get('installBtn').disabled,false);
});
test('shortcut mode removes WebAPK manifest and keeps shortcut URL in browser handoff and copy',()=>{
 const a=app({shortcut:true});assert.equal(a.context.shortcutMode,true);assert.equal(a.get('appManifest'),null);
 assert.ok(a.tags.every(x=>x.content==='no'));
 assert.equal(a.get('installHelp').hidden,false);assert.equal(a.get('shortcutLink').hidden,true);
 for(const name of ['Chrome','Samsung'])assert.match(a.get('open'+name).href,/\?shortcut=1#Intent/);
 assert.match(a.get('installHelp').children.at(-1).textContent,/\?shortcut=1$/);
 a.events.beforeinstallprompt({preventDefault(){throw Error('shortcut should not intercept install')}});
});
test('Samsung shortcut guidance names the Samsung menu, and iPhone keeps regular manifest',()=>{
 const a=app({shortcut:true,samsung:true});assert.match(a.get('installHelp').children[1].children[0].textContent,/≡/);
 const b=app({ios:true});assert.ok(b.get('appManifest'));assert.equal(b.get('shortcutLink').hidden,true);
});
test('native install prompt runs within the click and old prompt without userChoice releases button',()=>{
 const a=app();let called=0,prevented=0;
 a.events.beforeinstallprompt({preventDefault(){prevented++},prompt(){called++}});
 assert.equal(prevented,1);a.get('installBtn').onclick();assert.equal(called,1);assert.equal(a.get('installBtn').disabled,false);
});
test('failed service worker does not hide the shortcut or leave install disabled',async()=>{
 const a=app({storageFailure:true});await new Promise(r=>setImmediate(r));
 assert.equal(a.registered(),1);assert.equal(a.get('installBtn').disabled,false);
 assert.match(a.get('installStatus').textContent,/바로가기/);
 a.get('installBtn').onclick();assert.equal(a.get('shortcutLink').hidden,false);
});
test('iPhone and touch iPad guide uses Safari share and the actual home-screen action',()=>{
 for(const options of [{ios:true},{ipad:true}]){
  const a=app(options);a.get('installBtn').onclick();
  assert.match(a.get('installBtn').textContent,/아이폰/);
  const steps=a.get('installHelp').children[1].children.map(x=>x.textContent).join(' ');
  assert.match(steps,/Safari/);assert.match(steps,/공유/);assert.match(steps,/홈 화면에 추가/);assert.match(steps,/동작 편집/);
  assert.equal(a.get('browserButtons').hidden,true);
 }
});
test('launch from the home screen hides add-icon prompts',()=>{
 const a=app({ios:true,standalone:true});
 assert.equal(a.get('installCTA').hidden,true);assert.equal(a.get('installHelp').hidden,true);
});
test('cancelled and failed install prompts remain retryable; accepted is not called installed',async()=>{
 for(const outcome of ['dismissed','accepted']){
  const a=app();a.events.beforeinstallprompt({preventDefault(){},prompt(){},userChoice:Promise.resolve({outcome})});
  a.get('installBtn').onclick();await new Promise(r=>setImmediate(r));
  assert.equal(a.get('installBtn').disabled,false);assert.equal(a.get('installCTA').hidden,false);
  if(outcome==='accepted')assert.match(a.get('installHelp').textContent,/요청/);
  a.events.appinstalled();assert.equal(a.get('installCTA').hidden,true);
 }
 const b=app();b.events.beforeinstallprompt({preventDefault(){},prompt(){throw Error('not available')}});
 b.get('installBtn').onclick();assert.equal(b.get('installBtn').disabled,false);assert.equal(b.get('installHelp').hidden,false);
});

test('no-APK shortcut mode gives iPhone and touch iPad Safari guidance, never Chrome steps',()=>{
 for(const options of [{ios:true},{ipad:true}]){
  const a=app({...options,shortcut:true});assert.equal(a.get('appManifest'),null);
  assert.equal(a.get('installHelp').hidden,false);assert.equal(a.get('browserButtons').hidden,true);
  const steps=a.get('installHelp').children[1].children.map(x=>x.textContent).join(' ');
  assert.match(steps,/Safari/);assert.match(steps,/공유/);assert.match(steps,/홈 화면에 추가/);assert.doesNotMatch(steps,/크롬|삼성 인터넷/);
 }
});
