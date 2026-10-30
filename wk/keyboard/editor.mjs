import {PINYIN} from './pinyin-data.mjs?v=3.4';
const L=[...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const V=[...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const T=['',...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
const vowels={'ㅗㅏ':'ㅘ','ㅗㅐ':'ㅙ','ㅗㅣ':'ㅚ','ㅜㅓ':'ㅝ','ㅜㅔ':'ㅞ','ㅜㅣ':'ㅟ','ㅡㅣ':'ㅢ'};
const finals={'ㄱㅅ':'ㄳ','ㄴㅈ':'ㄵ','ㄴㅎ':'ㄶ','ㄹㄱ':'ㄺ','ㄹㅁ':'ㄻ','ㄹㅂ':'ㄼ','ㄹㅅ':'ㄽ','ㄹㅌ':'ㄾ','ㄹㅍ':'ㄿ','ㄹㅎ':'ㅀ','ㅂㅅ':'ㅄ'};
const splitFinal=Object.fromEntries(Object.entries(finals).map(([a,b])=>[b,[...a]]));
const syllable=(l,v,t='')=>String.fromCharCode(0xac00+(L.indexOf(l)*21+V.indexOf(v))*28+T.indexOf(t));
// Modern two-set Hangul, with final-consonant migration when the next vowel arrives.
export function appendHangul(previous,key){
 if(!previous)return key;
 if(L.includes(previous)&&V.includes(key))return syllable(previous,key);
 if(V.includes(previous)&&vowels[previous+key])return vowels[previous+key];
 const n=previous.charCodeAt(0)-0xac00;if(n<0||n>=11172)return previous+key;
 const l=L[Math.floor(n/588)],v=V[Math.floor(n%588/28)],t=T[n%28];
 if(V.includes(key)){
  if(!t)return vowels[v+key]?syllable(l,vowels[v+key]):previous+key;
  const parts=splitFinal[t]||['',t];return syllable(l,v,parts[0])+syllable(parts[1],key);
 }
 if(T.includes(key)&&key){
  if(!t)return syllable(l,v,key);
  if(finals[t+key])return syllable(l,v,finals[t+key]);
 }
 return previous+key;
}
const toneMarks={'{acute}':'\u0301','{grave}':'\u0300','{hook}':'\u0309','{tilde}':'\u0303','{dot}':'\u0323','{noTone}':''};
const tonePattern=/[\u0300\u0301\u0303\u0309\u0323]/g;
function vietnameseTone(left,key){
 const match=left.match(/[^\s\d\p{P}]*$/u);if(!match)return left;
 const chars=[...match[0].normalize('NFD')];let at=-1;
 for(let i=chars.length-1;i>=0;i--)if(/[aeiouyAEIOUY]/.test(chars[i])){at=i;break;}
 if(at<0)return left;
 let end=at+1;while(end<chars.length&&/\p{M}/u.test(chars[end]))end++;
 const vowel=chars.slice(at,end).join('').replace(tonePattern,'')+toneMarks[key];
 return left.slice(0,left.length-match[0].length)+(chars.slice(0,at).join('')+vowel+chars.slice(end).join('')).normalize('NFC');
}
const smallPairs=[...'あいうえおつやゆよわかけアイウエオツヤユヨワカケ'].map((c,i)=>[c,[...'ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ'][i]]);
function kanaModifier(previous,key){
 if(key==='{small}')return smallPairs.find(p=>p.includes(previous))?.find(c=>c!==previous)||previous;
 const parts=previous.normalize('NFD'),base=[...parts][0],mark=key==='{dakuten}'?'\u3099':'\u309a';
 const permitted=key==='{dakuten}'?/[うかきくけこさしすせそたちつてとはひふへほウカキクケコサシスセソタチツテトハヒフヘホワヰヱヲ]/:/[はひふへほハヒフヘホ]/;
 if(!permitted.test(base))return previous;
 return (parts.includes(mark)?base:base+mark).normalize('NFC');
}
let segmenter;
try{if(typeof Intl.Segmenter==='function')segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});}catch{}
export function previousBoundary(value,end){
 const before=value.slice(0,end);if(!before)return 0;
 if(segmenter){let at=0;for(const part of segmenter.segment(before))at=part.index;return at;}
 // Older Safari: remove a code point plus trailing marks, without splitting surrogates.
 const chars=[...before];let last=chars.pop()||'';while(chars.length&&/[\p{M}\uFE0F]/u.test(last[0]))last=(chars.pop()||'')+last;
 return before.length-last.length;
}
export function nextBoundary(value,start){
 if(segmenter){for(const part of segmenter.segment(value.slice(start)))return start+part.segment.length;}
 const after=value.slice(start);const chars=[...after];let n=(chars.shift()||'').length;while(chars.length&&/[\p{M}\uFE0F]/u.test(chars[0]))n+=chars.shift().length;return start+n;
}
export class KeyboardEditor{
 constructor(locale='ko-KR',value='',limit=200){this.locale=locale;this.limit=limit;this.setValue(value);}
 setValue(value,start=value.length,end=start){this.value=value;this.start=start;this.end=end;this.commit();}
 setSelection(start,end=start){start=Math.max(0,Math.min(start,this.value.length));end=Math.max(start,Math.min(end,this.value.length));if(start!==this.start||end!==this.end)this.commit();this.start=start;this.end=end;}
 setLanguage(locale){this.locale=locale;this.commit();}
 commit(){this.koActive=false;this.pinyin=null;this.history=[];}
 snapshot(){return {value:this.value,start:this.start,end:this.end,koActive:this.koActive,pinyin:this.pinyin?{...this.pinyin}:null};}
 replace(start,end,text){const value=this.value.slice(0,start)+text+this.value.slice(end);if(value.length>this.limit)return false;
  const before=this.snapshot();this.value=value;this.start=this.end=start+text.length;this.history.push(before);if(this.history.length>250)this.history.shift();return true;
 }
 input(key,{native=true}={}){
  if(!key)return false;
  if(native&&this.locale==='vi-VN'&&Object.prototype.hasOwnProperty.call(toneMarks,key)){
   const left=this.value.slice(0,this.start),changed=vietnameseTone(left,key);if(left===changed)return false;
   return this.replace(0,this.end,changed);
  }
  if(native&&this.locale==='ja-JP'&&['{dakuten}','{handakuten}','{small}'].includes(key)){
   if(this.start!==this.end||!this.start)return false;const at=previousBoundary(this.value,this.start),old=this.value.slice(at,this.start),changed=kanaModifier(old,key);
   return old!==changed&&this.replace(at,this.end,changed);
  }
  if(native&&this.locale==='ko-KR'&&/^[ㄱ-ㅎㅏ-ㅣ]$/.test(key)){
   const active=this.koActive&&this.start===this.end&&this.start>0,at=active?this.start-1:this.start;
   if(!this.replace(at,this.end,appendHangul(active?this.value.slice(at,this.start):'',key)))return false;
   this.koActive=true;this.pinyin=null;return true;
  }
  if(native&&this.locale==='zh-CN'&&/^[a-zA-Z']$/.test(key)){
   const existing=this.pinyin&&this.pinyin.end===this.start&&this.start===this.end?this.pinyin:null;
   const at=existing?existing.start:this.start,raw=(existing?existing.raw:'')+key.toLowerCase();
   if(!this.replace(this.start,this.end,key.toLowerCase()))return false;
   this.pinyin={start:at,end:this.start,raw};this.koActive=false;return true;
  }
  if(key.startsWith('{'))return false;
  const changed=this.replace(this.start,this.end,key.normalize('NFC'));this.koActive=false;this.pinyin=null;return changed;
 }
 candidates(){
  if(!this.pinyin)return[];const raw=this.pinyin.raw.replace(/^'+/,'');const prefix=Object.keys(PINYIN).filter(s=>raw.startsWith(s)).sort((a,b)=>b.length-a.length)[0];
  if(!prefix)return[];const consume=this.pinyin.raw.length-raw.length+prefix.length;
  return PINYIN[prefix].map(text=>({text,consume}));
 }
 choose(candidate){
  if(!this.pinyin||!this.candidates().some(c=>c.text===candidate.text&&c.consume===candidate.consume))return false;
  const {start,raw,end}=this.pinyin,tail=raw.slice(candidate.consume).replace(/^'+/,'');
  if(!this.replace(start,end,candidate.text+tail))return false;
  this.pinyin=tail?{start:start+candidate.text.length,end:this.end,raw:tail}:null;return true;
 }
 backspace(){
  if(this.start!==this.end){const result=this.replace(this.start,this.end,'');this.commit();return result;}
  if((this.koActive||this.pinyin)&&this.history.length){Object.assign(this,this.history.pop());return true;}
  if(!this.start)return false;
  const result=this.replace(previousBoundary(this.value,this.start),this.end,'');this.commit();return result;
 }
 clear(){this.value='';this.start=this.end=0;this.commit();}
 move(direction){this.setSelection(direction<0?(this.start===this.end?previousBoundary(this.value,this.start):this.start):(this.start===this.end?nextBoundary(this.value,this.end):this.end));}
}
