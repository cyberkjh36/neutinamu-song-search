export function playlistCommand(page,request){
 if(!Number.isInteger(page)||page<0||page>99999||typeof request!=='string'||!/^[a-f0-9]{32}$/.test(request))throw Object.assign(Error('invalid'),{code:'invalid'});
 return `WKL1:${request}:${page}`;
}
export function readPlaylist(value){
 const invalid=()=>{throw Object.assign(Error('response'),{code:'response'});};
 if(!value||value.v!==1||value.kind!=='queue'||!Number.isInteger(value.total)||value.total<0||value.total>2000000||!Number.isInteger(value.page)||value.page<0||value.page>Math.max(0,Math.ceil(value.total/20)-1)||!Array.isArray(value.items)||value.items.length!==Math.min(20,value.total-value.page*20))invalid();
 const items=value.items.map((row,i)=>{
  if(!row||typeof row.id!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(row.id)||typeof row.title!=='string'||!row.title.trim()||row.title.length>200||/[\u0000-\u001f\u007f-\u009f]/.test(row.title)||row.position!==value.page*20+i+1||!['current','paused','queued'].includes(row.state)||row.state!=='queued'&&row.position!==1)invalid();
  return {id:row.id,title:row.title,position:row.position,state:row.state};
 });
 return {v:1,kind:'queue',page:value.page,total:value.total,items};
}
