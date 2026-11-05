import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';import path from 'node:path';
export const ENDPOINT='https://world-karaoke-connect.almondjoy11.chatgpt.site/api/favorites';
const countries=['ko','th','fil','vi','ne','mn','id','lo','my','zh-CN','ja','und'];
export function validate(data){
 if(data?.format!=='WorldKaraoke.CloudFavorites'||data.version!==1||!Array.isArray(data.rows)||data.rows.length>50000||
    !Array.isArray(data.countries)||JSON.stringify(data.countries)!==JSON.stringify(countries)||
    !(data.updatedAt===null||(typeof data.updatedAt==='string'&&Number.isFinite(Date.parse(data.updatedAt)))))throw Error('Invalid favorites export');
 const seen=new Set();const rows=data.rows.map(r=>{
  const k=r?.country+':'+r?.id;
  if(!countries.includes(r?.country)||typeof r.id!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(r.id)||
    !Number.isSafeInteger(r.count)||r.count<1||typeof r.title!=='string'||!r.title.trim()||r.title.length>500||
    /[\u0000-\u001f\u007f]/.test(r.title)||r.url!=='https://www.youtube.com/watch?v='+r.id||
    typeof r.lastPlayed!=='string'||!Number.isFinite(Date.parse(r.lastPlayed))||seen.has(k))throw Error('Invalid favorites row');
  seen.add(k);
  // Explicit allowlist: never copy unexpected fields from the private backend.
  return {country:r.country,id:r.id,title:r.title,url:r.url,count:r.count,lastPlayed:r.lastPlayed};
 });
 rows.sort((a,b)=>countries.indexOf(a.country)-countries.indexOf(b.country)||b.count-a.count||b.lastPlayed.localeCompare(a.lastPlayed)||a.id.localeCompare(b.id));
 return {format:data.format,version:1,updatedAt:data.updatedAt,countries,rows};
}
export async function snapshot({fetchImpl=fetch,directory=new URL('../data/favorites/',import.meta.url),endpoint=ENDPOINT}={}){
 const response=await fetchImpl(endpoint,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(45000),redirect:'error'});
 if(!response.ok)throw Error('Favorites export unavailable: '+response.status);
 const reader=response.body.getReader();let size=0;const chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32*1024*1024){await reader.cancel();throw Error('Favorites export too large');}chunks.push(value);}
 const current=validate(JSON.parse(Buffer.concat(chunks).toString('utf8')));
 const dir=directory instanceof URL?fileURLToPath(directory):directory;
 let previous;try{previous=validate(JSON.parse(await readFile(path.join(dir,'all.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
 // A bad/reset server response must not erase a valid repository backup.
 if(previous){
  const total=d=>d.rows.reduce((n,r)=>n+BigInt(r.count),0n);
  if(total(current)<total(previous))throw Error('Export would reduce the saved total; previous files retained');
 }
 await mkdir(dir,{recursive:true});
 const files=[['all.json',current],...countries.map(country=>[country+'.json',{...current,countries:[country],rows:current.rows.filter(r=>r.country===country)}])];
 for(const [name,value] of files){const target=path.join(dir,name),temp=target+'.tmp';await writeFile(temp,JSON.stringify(value,null,2)+'\n');await rename(temp,target);}
 return {videos:current.rows.length,files:files.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await snapshot();console.log(`Saved ${result.videos} country/video totals in ${result.files} files.`);
}
