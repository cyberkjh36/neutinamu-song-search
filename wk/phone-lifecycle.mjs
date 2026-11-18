// Page lifecycle events can overlap (visibilitychange, pageshow and focus).
// The connection coalesces recovery and never treats app switching as Leave.
export function bindPhoneLifecycle({connection,doc=document,win=window,onSuspend=()=>{}}){
  const suspend=()=>{onSuspend();connection.suspend();};
  const resume=()=>{if(!doc.hidden)void connection.resume();};
  const visibility=()=>doc.hidden?suspend():resume();
  doc.addEventListener('visibilitychange',visibility);
  doc.addEventListener('freeze',suspend);
  doc.addEventListener('resume',resume);
  win.addEventListener('pagehide',suspend);
  win.addEventListener('pageshow',resume);
  win.addEventListener('focus',resume);
  win.addEventListener('online',resume);
  win.addEventListener('offline',()=>connection.offline());
}
