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
import type {HassLocale, Lang} from '../core/types.ts';
import de from './de.json' with {type: 'json'};
import fr from './fr.json' with {type: 'json'};
import nl from './nl.json' with {type: 'json'};
import es from './es.json' with {type: 'json'};
import zh from './zh.json' with {type: 'json'};
import it from './it.json' with {type: 'json'};
import pl from './pl.json' with {type: 'json'};
import pt from './pt.json' with {type: 'json'};
import ru from './ru.json' with {type: 'json'};

// A language's dictionary: the English string → its translation.
type Dictionary = Partial<Record<string, string>>;

// Order — by number of HA users (D-036); English is the source.
export const LANGS: Array<[Lang, string]> = [
  ['en', 'English'],
  ['de', 'Deutsch'],
  ['fr', 'Français'],
  ['nl', 'Nederlands'],
  ['es', 'Español'],
  ['zh', '简体中文'],
  ['it', 'Italiano'],
  ['pl', 'Polski'],
  ['pt', 'Português'],
  ['ru', 'Русский'], // allow-cyrillic: endonym
];
const DICT: Record<Exclude<Lang, 'en'>, Dictionary> = {de, fr, nl, es, zh, it, pl, pt, ru};
const LOCALE: Record<Lang, string> = {
  en: 'en',
  de: 'de',
  fr: 'fr',
  nl: 'nl',
  es: 'es',
  zh: 'zh-CN',
  it: 'it',
  pl: 'pl',
  pt: 'pt-BR',
  ru: 'ru',
};
// A language the UI has: one with a locale. (Looked up as the code always did, by a truthy entry.)
const isLang = (code: string): code is Lang => Boolean((LOCALE as Partial<Record<string, string>>)[code]);
let lang: Lang = 'en';
export const getLang = (): Lang => lang;
export const locale = (): string => LOCALE[lang];
// page: also the page's lang (the editor's own document); the dashboard card lives in HA's page and leaves it alone
export function setLang(code: string, {page = true}: {page?: boolean} = {}): void {
  lang = isLang(code) ? code : 'en';
  if (page && typeof document !== 'undefined') document.documentElement.lang = LOCALE[lang];
}
// system language (later the HA language): exact match first, then by the first part (de-AT → de, pt-PT → pt, zh-TW → zh)
export function pickLang(list: readonly unknown[] | null | undefined): Lang {
  for (const candidate of list || []) {
    const code = String(candidate).toLowerCase();
    const base = code.split(/[-_]/)[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

const missing = new Set<string>();
export const missingKeys = (): string[] => [...missing];
const plurals = new Map<Lang, Intl.PluralRules>();
const pluralRules = (): Intl.PluralRules => {
  let rules = plurals.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(LOCALE[lang]);
    plurals.set(lang, rules);
  }
  return rules;
};
// placeholders: {0}, {1}…; {0, plural, one {…} few {…} other {…}} — inside a form, # is the number formatted for the language
function format(s: string, args: unknown[]): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c !== '{') {
      out += c;
      i++;
      continue;
    }
    // find the matching brace
    let depth = 0;
    let j = i;
    for (; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}' && --depth === 0) break;
    }
    const body = s.slice(i + 1, j);
    i = j + 1;
    const m = body.match(/^\s*(\d+)\s*(?:,\s*plural\s*,(.*))?$/s);
    if (!m) {
      out += '{' + body + '}';
      continue;
    }
    const v = args[+m[1]];
    if (m[2] == null) {
      out += v == null ? '' : typeof v === 'number' ? num(v) : String(v);
      continue;
    }
    const forms: Partial<Record<string, string>> = {};
    const re = /\s*(=?\w+)\s*\{/g;
    let form: RegExpExecArray | null;
    const src = m[2];
    while ((form = re.exec(src))) {
      let formDepth = 1;
      let e = re.lastIndex;
      for (; e < src.length && formDepth; e++) {
        if (src[e] === '{') formDepth++;
        else if (src[e] === '}') formDepth--;
      }
      forms[form[1]] = src.slice(re.lastIndex, e - 1);
      re.lastIndex = e;
    }
    const f = forms['=' + v] ?? forms[pluralRules().select(Number(v))] ?? forms.other ?? '';
    out += format(f.replace(/#/g, num(Number(v))), args);
  }
  return out;
}
// "Open|verb" → "Open": the context after "|" is for translators only
const bare = (s: string): string => {
  const i = s.lastIndexOf('|');
  return i > 0 && !s.slice(i).includes('}') ? s.slice(0, i) : s;
};
export function t(s: string, ...args: unknown[]): string {
  let text = bare(s);
  if (lang !== 'en') {
    const d = DICT[lang];
    const translated = d && s in d ? d[s] : undefined;
    if (translated) text = translated;
    else missing.add(s);
  }
  return args.length || text.includes('{') ? format(text, args) : text;
}
export const N = <Text extends string>(s: Text): Text => s;
export function tr(s: string): string;
export function tr(s: string | null | undefined): string | null | undefined;
export function tr(s: string | null | undefined): string | null | undefined {
  return s == null ? s : t(s);
}
// Number and time formats. In Home Assistant — from the user's profile (hass.locale: number_format, time_format), mapped
// the way HA's own frontend does it; outside HA (and for "language") — by the UI language.
let numberFormat = 'language';
let timeFormat = 'language';
export function setFormats(l: HassLocale | null | undefined): void {
  numberFormat = l?.number_format || 'language';
  timeFormat = l?.time_format || 'language';
}
const NUMBER_LOCALE: Partial<Record<string, string[]>> = {
  comma_decimal: ['en-US', 'en'],
  decimal_comma: ['de', 'es', 'it'],
  space_comma: ['fr', 'sv', 'cs'],
  quote_decimal: ['de-CH'],
};
const numLocale = (): string | string[] | undefined =>
  numberFormat === 'system' ? undefined : NUMBER_LOCALE[numberFormat] || LOCALE[lang];
// 12-hour clock: am_pm / 24 as set; for "language" and "system" — whatever that locale does with 22:00
export const amPm = (): boolean =>
  timeFormat === 'am_pm' ||
  (timeFormat !== '24' &&
    new Date(2023, 0, 1, 22)
      .toLocaleString(timeFormat === 'system' ? undefined : LOCALE[lang])
      .includes('10'));
// The options num takes: Intl's, plus grouping (Intl's useGrouping, defaulting to 'min2').
type NumOptions = Intl.NumberFormatOptions & {grouping?: Intl.NumberFormatOptions['useGrouping']};
// number: 23,1 or 23.1; d — decimal places (default: as is, up to 2); grouping — 'min2' by default (1234 cm, but
// 12 345 m²), 'auto' as the locale groups; "none" in HA turns grouping off. Anything but a finite number is printed as it is.
export const num = (v: unknown, d?: number, {grouping = 'min2', ...o}: NumOptions = {}): string =>
  typeof v === 'number' && Number.isFinite(v)
    ? new Intl.NumberFormat(numLocale(), {
        useGrouping: numberFormat === 'none' ? false : grouping,
        ...(d == null ? {maximumFractionDigits: 2} : {minimumFractionDigits: d, maximumFractionDigits: d}),
        ...o,
      }).format(v)
    : String(v);
// date and time in the UI language; with an hour — on the 12- or 24-hour clock from HA
export const dateTime = (at: Date | number, o: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat(LOCALE[lang], o.hour ? {...o, hourCycle: amPm() ? 'h12' : 'h23'} : o).format(at);
// time of day: 14:05 or 2:05 PM
export const clock = (at: Date | number, o: Intl.DateTimeFormatOptions = {}): string =>
  dateTime(at, {hour: 'numeric', minute: '2-digit', ...o});
// Static markup (shell.html): text and tooltips are translated by the string itself, once at startup.
// Elements with translate="no" (key names, numbers) are left as they are.
export function translateDom(root: Element | null | undefined): void {
  if (lang === 'en' || !root) return;
  const d = DICT[lang] || {};
  const skip = (node: Node): Element | null | undefined => node.parentElement?.closest('[translate=no]');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    // a text node's value is never null
    const s = node.nodeValue!.trim();
    const translated = d[s];
    if (s && translated && !skip(node)) node.nodeValue = node.nodeValue!.replace(s, translated);
  }
  for (const e of root.querySelectorAll('[title],[placeholder],[aria-label]'))
    for (const a of ['title', 'placeholder', 'aria-label']) {
      const s = e.getAttribute(a);
      const translated = s ? d[s] : undefined;
      if (s && translated) e.setAttribute(a, translated);
    }
}
