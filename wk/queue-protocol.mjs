export const CAPABILITY = 'WKQ1 ';
export function videoIdFromUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let u; try { u = new URL(value.trim()); } catch { return null; }
  if (!['http:','https:'].includes(u.protocol) || u.username || u.password || u.port) return null;
  const host=u.hostname.toLowerCase(), parts=u.pathname.split('/').filter(Boolean);
  let id=null;
  if (['youtu.be','www.youtu.be'].includes(host) && parts.length===1) id=parts[0];
  if (['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)) {
    if (u.pathname==='/watch' && u.searchParams.getAll('v').length===1) id=u.searchParams.get('v');
    else if (parts.length===2 && ['shorts','live','embed'].includes(parts[0])) id=parts[1];
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
}
export function queueCommand(id,request,title) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id || '') || !/^[a-f0-9]{32}$/.test(request || '')) throw new Error('invalid');
  if(title!==undefined&&title!==null){
    if(typeof title!=='string'||!title.trim()||title.length>200||/[\u0000-\u001f\u007f-\u009f]/.test(title))throw new Error('invalid');
    return `WKQ2:${request}:${id}:${title.trim()}`;
  }
  return `WKQ1:${request}:${id}`;
}
export const requestId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
