// What the examples show untranslated (D-120). Opens each example as the company's site shows it (?show, Preview), the home
// panel and every room's panel, in English and in each language asked for, and collects every visible text, tooltip and
// accessible name, the panel's Shadow DOM included. A text a language shows exactly as English shows it is reported, and in
// Russian and Chinese also any English word inside a text (the Russian "Air out" before an English "bedroom"). Names the language keeps (Home Assistant, CO₂,
// key names) are not. The 3D labels drawn on a canvas are not seen.
//   node tools/i18n-shown.ts [--lang ru,de] [--only loft,studio]   (default: every language, every example)
// It builds the editor first. Chrome: CHROME_PATH, or the usual macOS place.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {HOMES} from '../demo/homes.ts';
import {LANGS} from '../src/i18n/i18n.ts';
import {connect, evaluate, pause, startChrome, waitFor} from './headless-chrome.ts';
import type {DevTools} from './headless-chrome.ts';

const VIEWPORT_WIDTH = 1600;
const VIEWPORT_HEIGHT = 1000;
const OPEN_TIMEOUT_MS = 90000;
const SETTLE_MS = 1200;
// Words every language keeps as they are (GLOSSARY.md, "Do not translate"), and the units of HA's own readings, which HA shows
// as its integrations give them in every language.
const KEPT = [
  'Home Assistant',
  'Home Twin',
  'HACS',
  'CO₂',
  'CO2',
  'PM2.5',
  'ppm',
  'Tab',
  'Home',
  'Shift',
  'Esc',
  'Delete',
  'kWh',
  'lx',
];
// Languages written without Latin letters: an English word inside one of their texts is a slip too.
const NON_LATIN = new Set(['ru', 'zh']);

/** A text the page shows and the first place it was seen (the home panel or a room). */
type Seen = Array<[text: string, where: string]>;

// In the page: open every room's panel in turn and collect what is visible there, in the document and in every Shadow DOM.
const COLLECT_IN_PAGE = `(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const roots = () => {
    const list = [document];
    const walk = root => {
      for (const element of root.querySelectorAll('*'))
        if (element.shadowRoot) {
          list.push(element.shadowRoot);
          walk(element.shadowRoot);
        }
    };
    walk(document);
    return list;
  };
  const all = selector => roots().flatMap(root => [...root.querySelectorAll(selector)]);
  const found = new Map();
  const shown = element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const collect = where => {
    for (const root of roots()) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent.trim();
        const element = node.parentElement;
        if (!text || !element || element.closest('script, style, template') || !shown(element)) continue;
        if (!found.has(text)) found.set(text, where);
      }
    }
    for (const element of all('[title], [aria-label], [placeholder]'))
      for (const attribute of ['title', 'aria-label', 'placeholder']) {
        const text = element.getAttribute(attribute);
        if (text && !found.has(text)) found.set(text, where + ' @' + attribute);
      }
  };
  collect('home');
  // the row of rooms (look.ts strip): each chip opens that room's panel
  const roomButtons = () => all('.room-strip .room-chip');
  const count = roomButtons().length;
  for (let index = 0; index < count; index++) {
    const button = roomButtons()[index];
    if (!button) continue;
    button.click();
    await wait(900);
    collect('room ' + (index + 1));
  }
  return [...found.entries()];
})()`;

/** Opens one example in one language in a fresh browser context and gives what it shows. */
async function shownTexts(devTools: DevTools, pageUrl: string, id: string, lang: string): Promise<Seen> {
  const {browserContextId} = await devTools.call('Target.createBrowserContext');
  const {targetId} = await devTools.call('Target.createTarget', {url: 'about:blank', browserContextId});
  const {sessionId} = (await devTools.call('Target.attachToTarget', {targetId, flatten: true})) as {
    sessionId: string;
  };
  try {
    await devTools.call(
      'Emulation.setDeviceMetricsOverride',
      {width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: false},
      sessionId,
    );
    await devTools.call('Page.enable', {}, sessionId);
    // The language is the editor's own setting (i18n/boot.ts), read when the page loads: it is put in storage before any of the
    // page's own scripts run, so the editor never opens in English first and keeps that home in the browser.
    await devTools.call(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `localStorage.setItem('home-twin-editor:ui', JSON.stringify({lang: ${JSON.stringify(lang)}}))`,
      },
      sessionId,
    );
    await devTools.call('Page.navigate', {url: `${pageUrl}?show#/example/${id}/`}, sessionId);
    await waitFor(
      devTools,
      sessionId,
      "document.body?.dataset.ready === 'true' && !!document.getElementById('loading')?.hidden",
      OPEN_TIMEOUT_MS,
    );
    await pause(SETTLE_MS);
    return await evaluate<Seen>(devTools, sessionId, COLLECT_IN_PAGE);
  } finally {
    await devTools.call('Target.closeTarget', {targetId});
    await devTools.call('Target.disposeBrowserContext', {browserContextId});
  }
}

const withoutKept = (text: string): string => KEPT.reduce((rest, word) => rest.split(word).join(' '), text);
const hasWord = (text: string): boolean => /\p{L}{3,}/u.test(withoutKept(text));
const hasLatinWord = (text: string): boolean => /[A-Za-z]{3,}/.test(withoutKept(text));

async function main(): Promise<void> {
  const argument = (name: string): string[] | null => {
    const at = process.argv.indexOf(name);
    return at > 0 ? process.argv[at + 1].split(',') : null;
  };
  const langs = argument('--lang') || LANGS.map(([id]) => id).filter(id => id !== 'en');
  const only = argument('--only');
  const ids = HOMES.map(home => home.id).filter(id => !only || only.includes(id));
  console.log('building the editor…');
  execFileSync(process.execPath, ['build.ts', '--demo=typical'], {stdio: 'ignore'});
  const pageUrl = pathToFileURL(path.resolve('dist/index.html')).href;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-shown-'));
  const chrome = await startChrome(profileDir, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  const devTools = await connect(chrome.socketUrl);
  // text → the examples it was seen in, per language
  const untranslated = new Map<string, Map<string, Set<string>>>(langs.map(lang => [lang, new Map()]));
  try {
    for (const id of ids) {
      const english = new Set((await shownTexts(devTools, pageUrl, id, 'en')).map(([text]) => text));
      for (const lang of langs) {
        const seen = await shownTexts(devTools, pageUrl, id, lang);
        const report = untranslated.get(lang)!; // one map per language, made above
        for (const [text, where] of seen) {
          const sameAsEnglish = english.has(text) && hasWord(text);
          const englishInside = NON_LATIN.has(lang) && hasLatinWord(text);
          if (!sameAsEnglish && !englishInside) continue;
          const key = `${text}  (${where.replace(/^room \d+/, 'a room')})`;
          report.set(key, (report.get(key) || new Set()).add(id));
        }
      }
      console.log(`${id}: checked`);
    }
  } finally {
    devTools.close();
    await chrome.stop();
    fs.rmSync(profileDir, {recursive: true, force: true});
  }
  let total = 0;
  for (const [lang, report] of untranslated) {
    console.log(`\n== ${lang}: ${report.size} untranslated`);
    for (const [text, homes] of report) console.log(`  ${text}  [${[...homes].join(', ')}]`);
    total += report.size;
  }
  process.exitCode = total ? 1 : 0;
}

await main();
