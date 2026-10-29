import {LANGUAGES} from './labels.mjs?v=2.1';
export function browseCommand(query,request,language){
 if(typeof query!=='string'||!query.trim()||query.trim().length>200||/[\u0000-\u001f\u007f-\u009f]/.test(query)||!LANGUAGES.some(l=>l.code===language)||!/^[a-f0-9]{32}$/.test(request||''))throw Object.assign(new Error('invalid'),{code:'invalid'});
 return `WKF1:${request}:${language}:${query.trim()}`;
}
export function readCatalog(value){
 if(!value||value.v!==1||!Array.isArray(value.items)||value.items.length>20||value.error!==null&&!['blocked','timeout','unavailable'].includes(value.error))throw Object.assign(new Error('response'),{code:'response'});
 const ids=new Set();for(const row of value.items){
  if(!row||typeof row.id!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(row.id)||ids.has(row.id))throw Object.assign(new Error('response'),{code:'response'});ids.add(row.id);
  for(const [field,max] of [['title',200],['channel',100],['duration',30]])if(typeof row[field]!=='string'||row[field].length>max||/[\u0000-\u001f\u007f-\u009f]/.test(row[field]))throw Object.assign(new Error('response'),{code:'response'});
  if(!row.title.trim())throw Object.assign(new Error('response'),{code:'response'});
 }
 if(value.error&&value.items.length)throw Object.assign(new Error('response'),{code:'response'});
 return value;
}
