// Presentation-only bilingual copies. Protocols, locale codes, speech input,
// song titles and the source translation tables never receive these glosses.
import {LANGUAGES as SOURCE_LANGUAGES} from './labels.mjs?v=2.1';
import {MESSAGES as SOURCE_MESSAGES} from './network-text.mjs?v=2.1';
import {BROWSE_TEXT as SOURCE_BROWSE} from './browse-text.mjs?v=3.0';
import {REMOTE_TEXT as SOURCE_REMOTE} from './remote-text.mjs?v=3.12';
import {PLAYLIST_TEXT as SOURCE_PLAYLIST} from './playlist-text.mjs?v=3.5';
import {QUEUE_TEXT as SOURCE_QUEUE} from './queue-text.mjs?v=2.9';
import {CHROME_TEXT as SOURCE_CHROME} from './chrome-text.mjs?v=2.2';
import {SAFARI_TEXT as SOURCE_SAFARI} from './safari-text.mjs?v=2.6';
import {NEXT_SEARCH as SOURCE_NEXT} from './search-text.mjs?v=2.3';
import {MIC_TEXT as SOURCE_MIC} from './mic-text.mjs?v=2.7';
import {PERMISSION_TEXT as SOURCE_PERMISSION} from './permission-text.mjs?v=2.8';
import {VOICE_TEXT as SOURCE_VOICE} from './voice-text.mjs?v=2.4';
import {KEYBOARD_TEXT as SOURCE_KEYBOARD,NATIVE_KEYBOARD_HELP as SOURCE_NATIVE_HELP} from './keyboard/text.mjs?v=3.7';

export function koreanGloss(text, korean, language) {
  if (language === 'ko-KR' || !text || !korean || text === korean) return text;
  // Keep action icons once, alongside the guest's language.
  const meaning = korean.replace(/^[🎙☷★＋↻]+\s*/u, '');
  return `${text}\n(${meaning})`;
}
function pair(value, korean, language, key='') {
  // These identify a country/asset, rather than translating a UI instruction.
  if (key === 'flag' || key === 'country') return value;
  if (typeof value === 'string') return koreanGloss(value, korean, language);
  if (Array.isArray(value)) return value.map((item,i)=>pair(item,korean?.[i],language));
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pair(v,korean?.[k],language,k)]));
}
function bilingual(table) {
  return Object.fromEntries(Object.entries(table).map(([language,value])=>[language,pair(value,table['ko-KR'],language)]));
}
export const LANGUAGES=SOURCE_LANGUAGES.map(language=>({...language,text:pair(language.text,SOURCE_LANGUAGES[0].text,language.code)}));
export const MESSAGES=bilingual(SOURCE_MESSAGES);
export const BROWSE_TEXT=bilingual(SOURCE_BROWSE);
export const REMOTE_TEXT=bilingual(SOURCE_REMOTE);
export const PLAYLIST_TEXT=bilingual(SOURCE_PLAYLIST);
export const QUEUE_TEXT=bilingual(SOURCE_QUEUE);
export const CHROME_TEXT=bilingual(SOURCE_CHROME);
export const SAFARI_TEXT=bilingual(SOURCE_SAFARI);
export const NEXT_SEARCH=bilingual(SOURCE_NEXT);
export const MIC_TEXT=bilingual(SOURCE_MIC);
export const PERMISSION_TEXT=bilingual(SOURCE_PERMISSION);
export const VOICE_TEXT=bilingual(SOURCE_VOICE);
export const KEYBOARD_TEXT=bilingual(SOURCE_KEYBOARD);
export const NATIVE_KEYBOARD_HELP=bilingual(SOURCE_NATIVE_HELP);
