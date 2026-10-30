import {LANGUAGES} from './labels.mjs?v=2.1';
const invalid=()=>Object.assign(new Error('invalid'),{code:'invalid'});
const validRequest=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
export function controlCommand(action,request){
 if(!['play','pause','next'].includes(action)||!validRequest(request))throw invalid();
 return `WKC1:${request}:${action}`;
}
export function favoritesCommand(query,page,request,language){
 if(typeof query!=='string'||query.length>160||/[\u0000-\u001f\u007f-\u009f]/.test(query)||!Number.isInteger(page)||page<0||page>99999||!validRequest(request)||!LANGUAGES.some(x=>x.code===language))throw invalid();
 return `WKV1:${request}:${language}:${page}:${query.trim()}`;
}
