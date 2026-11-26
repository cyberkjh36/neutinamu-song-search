// Read-only projection of one aggregate snapshot. Language/type are candidates, not verified audio.
export function inferType(title){
 const t=title.normalize('NFKC').toLowerCase();
 const k=/\b(?:karaoke|videoke|sing[ -]?along|no vocals?|minus[ -]?one)\b|คาราโอเกะ|노래방|반주|カラオケ|伴奏/iu.test(t), i=/\binstrumental\b/iu.test(t);
 const o=[['dance',/\b(?:zumba|fitness|choreo(?:graphy)?|dance\s+(?:workout|practice))\b|줌바|댄스\s*운동|ออกกำลังกาย/iu],['remix',/\b(?:remix|megamix|non[- ]?stop)\b|แดนซ์|สายแดนซ์/iu],['mv',/\b(?:music\s+video|m\s*\/\s*v|mv)\b|뮤직비디오/iu],['audio',/\bofficial\s+audio\b/iu],['live',/\blive\s+(?:performance|concert)\b|แสดงสด/iu],['lyrics',/\b(?:lyric(?:s)?\s+video|lyrics)\b|เนื้อเพลง/iu]].filter(([,re])=>re.test(t)).map(([kind])=>kind);
 const strong=o.filter(x=>x!=='lyrics');
 if((k||i)&&strong.length||k&&/\blyric(?:s)?\s+video\b/iu.test(t))return 'unknown';
 if(k)return 'karaoke';if(i)return 'instrumental';if(strong.length>1)return 'unknown';return strong[0]??o[0]??'unknown';
}
export function inferLanguage(title){
 const t=title.normalize('NFKC').toLowerCase().replace(/\b(?:karaoke|videoke|sing[ -]?along|no vocals?|minus[ -]?one|instrumental|official|music video|lyric(?:s)? video|lyrics|remix|cover|hd|hq)\b|คาราโอเกะ|노래방|반주|カラオケ|伴奏/giu,' ');
 const s=[];
 if(/\p{Script=Hangul}/u.test(t))s.push('ko');
 if(/\p{Script=Thai}/u.test(t))s.push('th');
 if(/\p{Script=Lao}/u.test(t))s.push('lo');
 if(/\p{Script=Myanmar}/u.test(t))s.push('my');
 if(/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t))s.push('ja');else if(/\p{Script=Han}/u.test(t))s.push('ambiguous');
 if(/\p{Script=Devanagari}/u.test(t)||/\p{Script=Cyrillic}/u.test(t))s.push('ambiguous');
 if(/[ăđơưảạấầẩẫậắằẳẵặẻẽếềểễệỉĩịỏọốồổỗộớờởỡợủũụứừửữựỷỹỵ]/iu.test(t))s.push('vi');
 return s.length===1&&s[0]!=='ambiguous'?s[0]:'und';
}
function addCount(a,b){const n=a+b;if(!Number.isSafeInteger(n))throw Error('Favorites count overflow');return n;}
function rank(a,b){return b.count-a.count||Date.parse(b.lastPlayed)-Date.parse(a.lastPlayed)||a.id.localeCompare(b.id);}
export function projectFavorites(rows){
 const byId=new Map(),seen=new Set();let source=0;
 for(const r of rows){
  const key=r.country+':'+r.id;if(seen.has(key))throw Error('Duplicate source row');seen.add(key);source=addCount(source,r.count);
  let v=byId.get(r.id);
  if(!v){v={id:r.id,title:r.title,lastPlayed:r.lastPlayed,count:0,selectedCounts:Object.create(null),titles:new Set()};byId.set(r.id,v);}
  v.count=addCount(v.count,r.count);v.selectedCounts[r.country]=r.count;v.titles.add(r.title);
  if(Date.parse(r.lastPlayed)>Date.parse(v.lastPlayed)||(Date.parse(r.lastPlayed)===Date.parse(v.lastPlayed)&&r.title.localeCompare(v.title)<0)){v.title=r.title;v.lastPlayed=r.lastPlayed;}
 }
 const consensus=(titles,fn,unknown)=>{const s=new Set([...titles].map(fn));return s.size===1?[...s][0]:unknown;};
 const result=[...byId.values()].map(v=>{
  const {titles,...rest}=v;
  const inferred=consensus(titles,inferLanguage,'und');
  const language=inferred==='und'&&Object.hasOwn(titleCandidates,v.id)?titleCandidates[v.id]:inferred;
  return {...rest,language,type:consensus(titles,inferType,'unknown'),languageStatus:language==='und'?'unknown':'candidate'};
 }).sort(rank);
 if(result.reduce((n,v)=>addCount(n,v.count),0)!==source)throw Error('Favorites total changed');
 return result;
}
export function listFavorites(videos,country,mode='karaoke'){
 const belongs=v=>v.language===country||(v.language==='und'&&Object.hasOwn(v.selectedCounts,country));
 if(mode==='all')return videos;
 if(mode==='selected')return videos.filter(v=>Object.hasOwn(v.selectedCounts,country));
 if(mode==='english')return videos.filter(v=>v.language==='en'&&v.type==='karaoke'&&Object.hasOwn(v.selectedCounts,country));
 if(mode==='other')return videos.filter(v=>v.type!=='karaoke'&&v.type!=='unknown'&&(belongs(v)||v.language==='en'&&Object.hasOwn(v.selectedCounts,country)));
 if(mode==='unknown')return videos.filter(v=>(v.type==='unknown'||v.language==='und')&&(belongs(v)||Object.hasOwn(v.selectedCounts,country)));
 return videos.filter(v=>v.language===country&&v.type==='karaoke');
}
const titleCandidates={
  "7n0YrX1mXjQ": "fil",
  "FrRLQ1cCFnA": "fil",
  "0X3wq52NM8g": "fil",
  "UfMb23cmjDg": "fil",
  "YODYOcakITo": "fil",
  "mM9I6cjtwRk": "fil",
  "ZFvMl9DaqTs": "fil",
  "XjoRpoSq8lk": "fil",
  "e25XlvKe1Wk": "fil",
  "NA6SMVuNWrQ": "fil",
  "v7hRpilP2sg": "fil",
  "m8CEEkqQiiY": "en",
  "sTGFkbjK3IU": "en",
  "9sVKwwSvvLw": "en",
  "UJzU_Q8xo_U": "en",
  "JtiocB8PYPs": "en",
  "7rmxIEjMNX0": "en",
  "yNdOVUJJidg": "en",
  "oLShwvZopls": "en",
  "8qNUANocvQY": "en",
  "XGB8gmhwWzU": "en",
  "CVKZW6obgUw": "en",
  "5f15CcwlluQ": "en",
  "-U4UfQrAvbM": "en"
};
export const favoriteModeText={
  "ko-KR": [
    "노래방 후보",
    "영어 노래방 후보",
    "일반 영상 후보",
    "미분류·확인 필요",
    "선택 국가 기록",
    "전체 영상",
    "PC 기존 목록 (분류 전)"
  ],
  "th-TH": [
    "คาราโอเกะ (คาดการณ์)",
    "คาราโอเกะภาษาอังกฤษ",
    "วิดีโอทั่วไป",
    "ยังไม่จำแนก",
    "ประวัติประเทศที่เลือก",
    "วิดีโอทั้งหมด",
    "รายการเดิมจาก PC (ยังไม่จำแนก)"
  ],
  "fil-PH": [
    "Karaoke (tantya)",
    "English karaoke (tantya)",
    "Ibang video",
    "Hindi pa natukoy",
    "Record ng piniling bansa",
    "Lahat ng video",
    "Lumang listahan ng PC (hindi pa nasuri)"
  ],
  "vi-VN": [
    "Karaoke (dự đoán)",
    "Karaoke tiếng Anh",
    "Video khác",
    "Chưa phân loại",
    "Lịch sử quốc gia đã chọn",
    "Tất cả video",
    "Danh sách PC cũ (chưa phân loại)"
  ],
  "ne-NP": [
    "कराओके (अनुमान)",
    "अंग्रेजी कराओके",
    "अन्य भिडियो",
    "वर्गीकरण बाँकी",
    "छानिएको देशको रेकर्ड",
    "सबै भिडियो",
    "PC को पुरानो सूची (अवर्गीकृत)"
  ],
  "mn-MN": [
    "Караоке (таамаг)",
    "Англи караоке",
    "Бусад видео",
    "Ангилаагүй",
    "Сонгосон улсын түүх",
    "Бүх видео",
    "PC хуучин жагсаалт (ангилаагүй)"
  ],
  "id-ID": [
    "Karaoke (perkiraan)",
    "Karaoke bahasa Inggris",
    "Video lain",
    "Belum diklasifikasi",
    "Riwayat negara pilihan",
    "Semua video",
    "Daftar PC lama (belum diklasifikasi)"
  ],
  "lo-LA": [
    "ຄາຣາໂອເກະ (ຄາດຄະເນ)",
    "ຄາຣາໂອເກະອັງກິດ",
    "ວິດີໂອອື່ນ",
    "ຍັງບໍ່ຈັດປະເພດ",
    "ປະຫວັດປະເທດທີ່ເລືອກ",
    "ວິດີໂອທັງໝົດ",
    "ລາຍການ PC ເກົ່າ (ຍັງບໍ່ຈັດປະເພດ)"
  ],
  "my-MM": [
    "ကာရာအိုကေ (ခန့်မှန်း)",
    "အင်္ဂလိပ် ကာရာအိုကေ",
    "အခြားဗီဒီယို",
    "မခွဲခြားရသေး",
    "ရွေးထားသောနိုင်ငံမှတ်တမ်း",
    "ဗီဒီယိုအားလုံး",
    "PC စာရင်းဟောင်း (မခွဲခြားရသေး)"
  ],
  "zh-CN": [
    "卡拉OK（推测）",
    "英语卡拉OK（推测）",
    "其他视频",
    "待分类",
    "所选国家记录",
    "全部视频",
    "PC旧列表（未分类）"
  ],
  "ja-JP": [
    "カラオケ候補",
    "英語カラオケ候補",
    "一般動画",
    "未分類・要確認",
    "選択国の履歴",
    "すべての動画",
    "PC旧リスト（未分類）"
  ]
};
export const favoriteModes=['karaoke','english','other','unknown','selected','all'];
