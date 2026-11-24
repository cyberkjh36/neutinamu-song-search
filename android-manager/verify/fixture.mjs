// A runner-only encrypted fixture verifies native enrollment and microphone
// wiring without the venue password, pairing codes or an active relay session.
import {randomBytes,pbkdf2Sync,hkdfSync,createCipheriv} from 'node:crypto';
const product=process.argv[2],secret=process.env.ANDROID_FIXTURE_KEY;
const salt=randomBytes(16),iv=randomBytes(12),iterations=600000;
const root=pbkdf2Sync(secret,salt,iterations,32,'sha256');
const key=hkdfSync('sha256',root,salt,product+'/app-v1',32);
const enc=createCipheriv('aes-256-gcm',key,iv);enc.setAAD(Buffer.from('neuti-manager/'+product+'/app-v1'));
const shell='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Fixture ready</h1><button id="voice">Test microphone</button><script>document.querySelector("button").onclick=function(){var r=new window.SpeechRecognition();r.lang="ko-KR";r.start();};</script></body></html>';
const data=Buffer.concat([enc.update(JSON.stringify({shell,module:'export const fixture=true;'})),enc.final(),enc.getAuthTag()]);
console.log(JSON.stringify({v:1,product,iterations,iv:iv.toString('base64'),salt:salt.toString('base64'),data:data.toString('base64')}));
