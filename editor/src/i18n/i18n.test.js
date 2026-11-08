// Translations (D-036): no Cyrillic in code (Russian lives in ru.json); every language has every string, with the same placeholders.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scan} from '../../tools/i18n-scan.mjs';
import {LANGS,setLang,t} from './i18n.js';

const {keys,bad}=scan();
const holes=s=>[...s.matchAll(/\{(\d+)(?:\s*,\s*plural)?/g)].map(m=>m[1]).sort().join();

test('translations: no Cyrillic in code',()=>{
  assert.deepEqual(bad.map(b=>`${b.file}:${b.line} ${b.text}`),[]);
});

for(const [id] of LANGS.filter(([id])=>id!=='en'))test(`translations: ${id} — every string, placeholders in place`,()=>{
  const d=JSON.parse(fs.readFileSync(new URL(`./${id}.json`,import.meta.url)));
  const miss=[...keys.keys()].filter(k=>!d[k]),wrong=[...keys.keys()].filter(k=>d[k]&&holes(d[k])!==holes(k));
  assert.deepEqual({miss:miss.slice(0,10),n:miss.length,wrong:wrong.slice(0,10)},{miss:[],n:0,wrong:[]});
});

test('translations: plurals and numbers follow the language; "|context" is not shown',()=>{
  setLang('en');assert.equal(t('{0, plural, one {# light} other {# lights}}',1),'1 light');assert.equal(t('Open|verb'),'Open');
  setLang('ru');assert.equal(t('{0, plural, one {# light} other {# lights}}',5),'5 ламп'); // allow-cyrillic: Russian plural form
  setLang('de');assert.equal(t('Open|verb'),'Öffnen');
  setLang('en');
});
