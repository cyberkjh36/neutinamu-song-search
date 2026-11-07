(function(root){
  'use strict';
  var initials='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function index(c){var n=c.charCodeAt(0);return n>=0x1100&&n<=0x1112?n-0x1100:initials.indexOf(c);}
  function pattern(query){
    var found=false,source='';
    for(var c of query){var i=index(c);if(i>=0){found=true;source+='['+String.fromCharCode(0xac00+i*588)+'-'+String.fromCharCode(0xac00+(i+1)*588-1)+']';}
      else source+=c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
    if(!found)return null;
    return {any:new RegExp(source),start:new RegExp('^'+source),exact:new RegExp('^'+source+'$')};
  }
  root.Chosung={pattern:pattern};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.Chosung;
})(typeof window==='undefined'?globalThis:window);
