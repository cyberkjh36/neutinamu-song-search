const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {randomBytes, pbkdf2Sync, hkdfSync, createCipheriv} = require('node:crypto');

// Exercise the actual lock screen and the guest-to-manager integration without
// giving the build runner a venue password or access to any live room.
function fixture(product, password) {
  const salt=randomBytes(16), iv=randomBytes(12), iterations=600000;
  const root=pbkdf2Sync(password,salt,iterations,32,'sha256');
  const key=hkdfSync('sha256',root,salt,product+'/app-v1',32);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('neuti-manager/'+product+'/app-v1'));
  const shell=readFileSync(path.join(__dirname,'../..',product,'index.html'),'utf8');
  const module=`
    export function managerStorage(storage) { return storage; }
    function mounted() {
      const p=document.createElement('p');p.id='fixture-ready';p.textContent='Manager controls mounted';
      document.querySelector('main').prepend(p);return {render(){}};
    }
    export const mountWorldManager=mounted, mountP2Manager=mounted;
  `;
  const encrypted=Buffer.concat([cipher.update(JSON.stringify({shell,module})),cipher.final(),cipher.getAuthTag()]);
  return {v:1,product,iterations,salt:salt.toString('base64'),iv:iv.toString('base64'),data:encrypted.toString('base64')};
}

module.exports=async function verifyManagerLock(cx,base) {
  for(const product of ['wk','p2wifi']) {
    const tab=await cx.newPage(), password=randomBytes(18).toString('hex'), joins=[];
    try {
      const sealed=fixture(product,password);
      await tab.route('**/manager.sealed.json*',route=>route.fulfill({json:sealed}));
      await tab.route('**/api/**',route=>{
        const req=route.request();
        if(req.method()==='POST' && ['join','command','resolvePrintRoom'].includes(req.postDataJSON()?.op))joins.push(req.url());
        return route.fulfill({json:{ok:false},headers:{'Access-Control-Allow-Origin':'*'}});
      });
      await tab.goto(base+product+'/manager.html');
      const field=tab.getByLabel('매니저 비밀번호'), open=tab.getByRole('button',{name:'이 휴대폰 등록'});
      await field.fill('test-invalid');await open.click();
      await tab.getByText('비밀번호를 확인하고 다시 입력해 주세요.').waitFor();
      await field.fill(password);await open.click();
      await tab.locator('#fixture-ready').waitFor();
      assert.equal(await tab.locator('#password').count(),0);
      assert.deepEqual(joins,[]);
      await tab.reload();await tab.locator('#fixture-ready').waitFor();
      assert.equal(await field.count(),0);
      const reopened=await cx.newPage();
      try {
        await reopened.route('**/manager.sealed.json*',r=>r.fulfill({json:sealed}));
        await reopened.route('**/api/**',r=>r.fulfill({json:{ok:false},headers:{'Access-Control-Allow-Origin':'*'}}));
        await reopened.goto(base+product+'/manager.html');
        await reopened.locator('#fixture-ready').waitFor();
        assert.equal(await reopened.getByLabel('매니저 비밀번호').count(),0);
      } finally {await reopened.close();}
    } finally {await tab.close();}
  }
  console.log('Verified one-time manager enrollment, reload and reopening without a password for both mobile remotes.');
};
