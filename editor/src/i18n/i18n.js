// UI translations (D-036). UI text in code is written in English; t('…') looks the string itself up in the current language's
// dictionary (like gettext): no invented keys, the English text is the source. No translation — the English text.
//   t('Done')                                     — a plain string;
//   t('Placed {0} of {1}', n, all)                — numbered placeholders;
//   t('{0, plural, one {# light} other {# lights}}', n) — plurals as in ICU (# is the number);
//   t('Open|verb')                                — "|context": the same English word with different translations; English shows
//                                                   the part before "|";
//   N('Sofa')                                     — marks data translated when shown (catalog, surfaces);
//   tr(x)                                         — translate a data string when shown.
// The check (i18n.test.js) collects keys from t() and N() and finds missing translations; Cyrillic in code is not allowed
// (Russian lives in ru.json).
import de from './de.json' with {type:'json'};
import fr from './fr.json' with {type:'json'};
import nl from './nl.json' with {type:'json'};
import es from './es.json' with {type:'json'};
import zh from './zh.json' with {type:'json'};
import it from './it.json' with {type:'json'};
import pl from './pl.json' with {type:'json'};
import pt from './pt.json' with {type:'json'};
import ru from './ru.json' with {type:'json'};

// Order — by number of HA users (D-036); English is the source.
export const LANGS=[['en','English'],['de','Deutsch'],['fr','Français'],['nl','Nederlands'],['es','Español'],['zh','简体中文'],['it','Italiano'],['pl','Polski'],['pt','Português'],['ru','Русский']]; // allow-cyrillic: endonym
const DICT={de,fr,nl,es,zh,it,pl,pt,ru};
const LOCALE={en:'en',de:'de',fr:'fr',nl:'nl',es:'es',zh:'zh-CN',it:'it',pl:'pl',pt:'pt-BR',ru:'ru'};
let lang='en';
export const getLang=()=>lang;
export const locale=()=>LOCALE[lang];
export function setLang(l){lang=LOCALE[l]?l:'en';if(typeof document!=='undefined')document.documentElement.lang=LOCALE[lang];}
// system language (later the HA language): exact match first, then by the first part (de-AT → de, pt-PT → pt, zh-TW → zh)
export function pickLang(list){for(const x of list||[]){const s=String(x).toLowerCase(),b=s.split(/[-_]/)[0];if(LOCALE[b])return b;}return 'en';}

const missing=new Set();export const missingKeys=()=>[...missing];
const plurals=new Map(),pr=()=>{if(!plurals.has(lang))plurals.set(lang,new Intl.PluralRules(LOCALE[lang]));return plurals.get(lang);};
// placeholders: {0}, {1}…; {0, plural, one {…} few {…} other {…}} — inside a form, # is the number formatted for the language
function format(s,args){
  let out='',i=0;
  while(i<s.length){const c=s[i];if(c!=='{'){out+=c;i++;continue;}
    // find the matching brace
    let d=0,j=i;for(;j<s.length;j++){if(s[j]==='{')d++;else if(s[j]==='}'&&--d===0)break;}
    const body=s.slice(i+1,j);i=j+1;
    const m=body.match(/^\s*(\d+)\s*(?:,\s*plural\s*,(.*))?$/s);
    if(!m){out+='{'+body+'}';continue;}
    const v=args[+m[1]];
    if(m[2]==null){out+=v==null?'':typeof v==='number'?num(v):String(v);continue;}
    const forms={},re=/\s*(=?\w+)\s*\{/g;let k;const src=m[2];
    while((k=re.exec(src))){let dd=1,e=re.lastIndex;for(;e<src.length&&dd;e++){if(src[e]==='{')dd++;else if(src[e]==='}')dd--;}forms[k[1]]=src.slice(re.lastIndex,e-1);re.lastIndex=e;}
    const f=forms['='+v]??forms[pr().select(+v)]??forms.other??'';out+=format(f.replace(/#/g,num(+v)),args);
  }
  return out;}
// "Open|verb" → "Open": the context after "|" is for translators only
const bare=s=>{const i=s.lastIndexOf('|');return i>0&&!s.slice(i).includes('}')?s.slice(0,i):s;};
export function t(s,...args){
  let r=bare(s);
  if(lang!=='en'){const d=DICT[lang];if(d&&s in d&&d[s])r=d[s];else missing.add(s);}
  return args.length||r.includes('{')?format(r,args):r;}
export const N=s=>s;
export const tr=s=>s==null?s:t(s);
// Number and time formats. In Home Assistant — from the user's profile (hass.locale: number_format, time_format), mapped
// the way HA's own frontend does it; outside HA (and for "language") — by the UI language.
let numberFormat='language',timeFormat='language';
export function setFormats(l){numberFormat=l?.number_format||'language';timeFormat=l?.time_format||'language';}
const NUMBER_LOCALE={comma_decimal:['en-US','en'],decimal_comma:['de','es','it'],space_comma:['fr','sv','cs'],quote_decimal:['de-CH']};
const numLocale=()=>numberFormat==='system'?undefined:NUMBER_LOCALE[numberFormat]||LOCALE[lang];
// 12-hour clock: am_pm / 24 as set; for "language" and "system" — whatever that locale does with 22:00
export const amPm=()=>timeFormat==='am_pm'||(timeFormat!=='24'&&new Date(2023,0,1,22).toLocaleString(timeFormat==='system'?undefined:LOCALE[lang]).includes('10'));
// number: 23,1 or 23.1; d — decimal places (default: as is, up to 2); grouping — 'min2' by default (1234 cm, but
// 12 345 m²), 'auto' as the locale groups; "none" in HA turns grouping off
export const num=(v,d,{grouping='min2',...o}={})=>Number.isFinite(v)?new Intl.NumberFormat(numLocale(),{useGrouping:numberFormat==='none'?false:grouping,
  ...(d==null?{maximumFractionDigits:2}:{minimumFractionDigits:d,maximumFractionDigits:d}),...o}).format(v):String(v);
// date and time in the UI language; with an hour — on the 12- or 24-hour clock from HA
export const dateTime=(at,o)=>new Intl.DateTimeFormat(LOCALE[lang],o.hour?{...o,hourCycle:amPm()?'h12':'h23'}:o).format(at);
// time of day: 14:05 or 2:05 PM
export const clock=(at,o={})=>dateTime(at,{hour:'numeric',minute:'2-digit',...o});
// Static markup (shell.html): text and tooltips are translated by the string itself, once at startup.
// Elements with translate="no" (key names, numbers) are left as they are.
export function translateDom(root){
  if(lang==='en'||!root)return;
  const d=DICT[lang]||{},skip=n=>n.parentElement?.closest('[translate=no]');
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode())){const s=n.nodeValue.trim();if(s&&d[s]&&!skip(n))n.nodeValue=n.nodeValue.replace(s,d[s]);}
  for(const e of root.querySelectorAll('[title],[placeholder],[aria-label]'))for(const a of ['title','placeholder','aria-label']){const s=e.getAttribute(a);if(s&&d[s])e.setAttribute(a,d[s]);}
}
