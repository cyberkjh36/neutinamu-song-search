const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../include/setup_page.h'),'utf8');
const html=source.split('R\"P2HTML(')[1].split(')P2HTML\"')[0].replace('__CSRF__','preview');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const keys=Array.from({length:10},(_,i)=>'digit_'+i).concat(['reserve','start','cancel','pause','key_up','key_down']);
 const actions=[];const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://192.168.4.1/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/status')return route.fulfill({json:{room:'12345678',ready:false,halted:false,notice:'숫자 1 버튼을 짧게 두 번 누르세요.',keys:keys.map(key=>({key,learned:false,tested:false}))}});
  if(url.pathname==='/action'){actions.push(JSON.parse(route.request().postData()));return route.fulfill({json:{ok:true,message:'요청을 받았습니다.'}});}
  return route.fulfill({contentType:'text/html',body:html});
 });
 for(const width of [360,390,768]){
  await page.setViewportSize({width,height:844});await page.goto('http://192.168.4.1/');
  await page.waitForFunction(()=>document.getElementById('room').textContent==='12345678');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('horizontal overflow '+width);
  if(await page.locator('.key').count()!==16)throw Error('missing buttons');
  await page.screenshot({path:path.join(process.env.P2_SCREENSHOTS||'/tmp','p2-setup-'+width+'.png'),fullPage:true});
 }
 await page.locator('#ssid').fill('Store Wifi');await page.locator('#password').fill('sample-test-only');
 await page.locator('#wifi button').click();await page.waitForFunction(()=>document.getElementById('password').value==='');
 await page.locator('.key').first().getByRole('button',{name:'학습',exact:true}).click();
 if(actions[0].action!=='wifi'||actions[1].key!=='digit_0')throw Error('wrong action');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: 360/390/768px layouts; 16 keys; Wi-Fi password cleared; digit learning action; no script errors');
 await browser.close();
})();
