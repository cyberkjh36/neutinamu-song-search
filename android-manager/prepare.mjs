import {transform} from 'esbuild';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createCipheriv,createDecipheriv,createHash,hkdfSync,pbkdf2Sync,randomBytes} from 'node:crypto';

const root=path.dirname(fileURLToPath(import.meta.url)), target='chrome74';
const compile=async(source,label)=> (await transform(source,{target,charset:'utf8',sourcefile:label,legalComments:'inline',logLevel:'silent'})).code;
const fingerprint=bytes=>createHash('sha256').update(bytes).digest('hex');
async function transformAssets(dir) {
  for(const item of await readdir(dir,{withFileTypes:true})){
    const name=path.join(dir,item.name);
    if(item.isDirectory())await transformAssets(name);
    else if(/\.(mjs|js)$/.test(name))await writeFile(name,await compile(await readFile(name,'utf8'),name));
  }
}
async function makeShell(shell){
  // Only inline classic scripts contain code. Keep deferred external scripts
  // in their existing order for the full remote initialization.
  const chunks=[];let end=0;
  for(const m of shell.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(!m[2].trim() || /\bsrc\s*=/.test(m[1]))continue;
    chunks.push(shell.slice(end,m.index),'<script'+m[1]+'>',await compile(m[2],'remote-inline.js'),'</script>');
    end=m.index+m[0].length;
  }
  return chunks.join('')+shell.slice(end);
}
const [mode,folder]=process.argv.slice(2);
if(mode==='assets')await transformAssets(folder);
else if(mode==='seal'){
  // Supply the owner's password on stdin. It is never embedded in the APK.
  const chunks=[];for await(const part of process.stdin)chunks.push(part);
  const password=Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/,'');
  if(!password)throw Error('Missing manager enrollment password');
  const native=path.join(root,'sealed');await mkdir(native,{recursive:true});
  for(const product of ['p2wifi','wk']){
    const original=await readFile(path.join(root,'..',product,'manager.sealed.json'));
    const src=JSON.parse(original), salt=Buffer.from(src.salt,'base64'), aad=Buffer.from('neuti-manager/'+product+'/app-v1');
    const master=pbkdf2Sync(password,salt,src.iterations,32,'sha256');
    const key=hkdfSync('sha256',master,salt,product+'/app-v1',32);
    const box=Buffer.from(src.data,'base64');
    const dec=createDecipheriv('aes-256-gcm',key,Buffer.from(src.iv,'base64'));
    dec.setAAD(aad);dec.setAuthTag(box.subarray(-16));
    const plain=JSON.parse(Buffer.concat([dec.update(box.subarray(0,-16)),dec.final()]));
    plain.module=await compile(plain.module,'manager.mjs');
    plain.shell=await makeShell(plain.shell);
    const iv=randomBytes(12),enc=createCipheriv('aes-256-gcm',key,iv);enc.setAAD(aad);
    const data=Buffer.concat([enc.update(JSON.stringify(plain)),enc.final(),enc.getAuthTag()]);
    await writeFile(path.join(native,product+'.json'),JSON.stringify({...src,iv:iv.toString('base64'),data:data.toString('base64'),webSha256:fingerprint(original)})+'\n');
  }
}else throw Error('Expected assets DIRECTORY or seal');
