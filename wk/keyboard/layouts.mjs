// Touch layouts: at most ten keys per row. Script marks use logical Unicode order.
const rows = s => s.split('|').map(row => row.trim().split(/\s+/));
const chunk = s => {const keys=s.trim().split(/\s+/);return Array.from({length:Math.ceil(keys.length/10)},(_,i)=>keys.slice(i*10,i*10+10));};
const latin=rows('q w e r t y u i o p|a s d f g h j k l|z x c v b n m');
const upper=layout=>layout.map(row=>row.map(key=>key.toUpperCase()));
const thai=chunk('ๆ ไ ำ พ ะ ั ี ร น ย บ ล ฃ ฟ ห ก ด เ ้ ่ า ส ว ง ผ ป แ อ ิ ื ท ม ใ ฝ ภ ถ ุ ึ ค ต จ ข ช ฅ');
const thaiShift=chunk('๐ ๑ ๒ ๓ ๔ ๕ ๖ ๗ ๘ ๙ ฎ ฑ ธ ํ ๊ ณ ฯ ญ ฐ ฤ ฆ ฏ โ ฌ ็ ๋ ษ ศ ซ ฉ ฮ ์ ฒ ฬ ฦ ๅ ู ฺ ฿');
const nepali=chunk('क ख ग घ ङ च छ ज झ ञ ट ठ ड ढ ण त थ द ध न प फ ब भ म य र ल व श ष स ह क्ष त्र ज्ञ ् ं ँ ः ा ि ी ु ू ृ े ै ो ौ');
const nepaliMore=chunk('अ आ इ ई उ ऊ ऋ ए ऐ ओ औ ळ ॐ । ॥ ऽ ॄ ़ ङ्ग ञ्च श्र द्य द्व त्व ० १ २ ३ ४ ५ ६ ७ ८ ९');
const lao=chunk('ກ ຂ ຄ ງ ຈ ສ ຊ ຍ ດ ຕ ຖ ທ ນ ບ ປ ຜ ຝ ພ ຟ ມ ຢ ຣ ລ ວ ຫ ອ ຮ ໜ ໝ ະ ັ າ ຳ ິ ີ ຶ ື ຸ ູ ົ ເ ແ ໂ ໃ ໄ ່ ້ ໊ ໋ ໍ');
const laoMore=chunk('ຯ ໆ ໌ ໐ ໑ ໒ ໓ ໔ ໕ ໖ ໗ ໘ ໙ ຫຼ ຽ');
// Unicode Myanmar, never Zawgyi. Choose consonants before dependent vowels.
const myanmar=chunk('က ခ ဂ ဃ င စ ဆ ဇ ဈ ည ဋ ဌ ဍ ဎ ဏ တ ထ ဒ ဓ န ပ ဖ ဗ ဘ မ ယ ရ လ ဝ သ ဟ ဠ အ ဉ ဿ ် ာ ါ ိ ီ ု ူ ေ ဲ ံ ့ း ျ ြ ွ ှ ္');
const myanmarMore=chunk('ဣ ဤ ဥ ဦ ဧ ဩ ဪ ၌ ၍ ၏ ၎ င်္ ၀ ၁ ၂ ၃ ၄ ၅ ၆ ၇ ၈ ၉ ၊ ။');
const mongolian=rows('ф ц у ж э н г ш ү з|к ъ й ы б ө а х р о|л д п я ч ё с м и т|ь в ю е щ');
const hiragana=rows('あ い う え お か き く け こ|さ し す せ そ た ち つ て と|な に ぬ ね の は ひ ふ へ ほ|ま み む め も や ゆ よ わ を|ら り る れ ろ ん ー {dakuten} {handakuten} {small}');
const katakana=hiragana.map(row=>row.map(k=>/^[ぁ-ゖ]$/.test(k)?String.fromCharCode(k.charCodeAt(0)+0x60):k));
export const LAYOUTS={
 'ko-KR':{pages:[rows('ㅂ ㅈ ㄷ ㄱ ㅅ ㅛ ㅕ ㅑ ㅐ ㅔ|ㅁ ㄴ ㅇ ㄹ ㅎ ㅗ ㅓ ㅏ ㅣ|ㅋ ㅌ ㅊ ㅍ ㅠ ㅜ ㅡ'),rows('ㅃ ㅉ ㄸ ㄲ ㅆ ㅛ ㅕ ㅑ ㅒ ㅖ|ㅁ ㄴ ㅇ ㄹ ㅎ ㅗ ㅓ ㅏ ㅣ|ㅋ ㅌ ㅊ ㅍ ㅠ ㅜ ㅡ')],mode:'한글'},
 'th-TH':{pages:[thai,thaiShift],mode:'ไทย'},
 'fil-PH':{pages:[latin.concat(rows('ñ')),upper(latin).concat(rows('Ñ'))],mode:'ABC'},
 'vi-VN':{pages:[latin.concat(rows('ă â ê ô ơ ư đ|{acute} {grave} {hook} {tilde} {dot} {noTone}')),upper(latin).concat(rows('Ă Â Ê Ô Ơ Ư Đ|{acute} {grave} {hook} {tilde} {dot} {noTone}'))],mode:'Tiếng Việt'},
 'ne-NP':{pages:[nepali,nepaliMore],mode:'नेपाली'},
 'mn-MN':{pages:[mongolian,upper(mongolian)],mode:'Монгол'},
 'id-ID':{pages:[latin,upper(latin)],mode:'ABC'},
 'lo-LA':{pages:[lao,laoMore],mode:'ລາວ'},
 'my-MM':{pages:[myanmar,myanmarMore],mode:'မြန်မာ'},
 'zh-CN':{pages:[latin,upper(latin)],mode:'拼音'},
 'ja-JP':{pages:[hiragana,katakana],mode:'かな'}
};
export const LATIN=[latin,upper(latin)];
export const SYMBOLS=rows('1 2 3 4 5 6 7 8 9 0|@ # % & * ( ) - + =|. , ? ! : ; / \' " _');
export const KEY_LABELS={'{acute}':'á','{grave}':'à','{hook}':'ả','{tilde}':'ã','{dot}':'ạ','{noTone}':'a↺','{dakuten}':'゛','{handakuten}':'゜','{small}':'小↔大'};
