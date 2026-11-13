// Translations (D-036): no Cyrillic in code (Russian lives in ru.json); every language has every string, with the same placeholders.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scan} from '../../tools/i18n-scan.ts';
import {LANGS, setLang, t, setFormats, num, clock} from './i18n.ts';

const {keys, bad} = scan();
const holes = (s: string): string =>
  [...s.matchAll(/\{(\d+)(?:\s*,\s*plural)?/g)]
    .map(m => m[1])
    .sort()
    .join();

test('translations: no Cyrillic in code', () => {
  assert.deepEqual(
    bad.map(b => `${b.file}:${b.line} ${b.text}`),
    [],
  );
});

for (const [id] of LANGS.filter(([id]) => id !== 'en'))
  test(`translations: ${id} — every string, placeholders in place`, () => {
    const d: Partial<Record<string, string>> = JSON.parse(
      fs.readFileSync(new URL(`./${id}.json`, import.meta.url), 'utf8'),
    );
    const allKeys: string[] = [...keys.keys()];
    const miss = allKeys.filter(k => !d[k]);
    const wrong = allKeys.filter(k => {
      const translated = d[k];
      return translated && holes(translated) !== holes(k);
    });
    assert.deepEqual(
      {miss: miss.slice(0, 10), n: miss.length, wrong: wrong.slice(0, 10)},
      {miss: [], n: 0, wrong: []},
    );
  });

test('translations: plurals and numbers follow the language; "|context" is not shown', () => {
  setLang('en');
  assert.equal(t('{0, plural, one {# light} other {# lights}}', 1), '1 light');
  assert.equal(t('Open|verb'), 'Open');
  setLang('ru');
  assert.equal(t('{0, plural, one {# light} other {# lights}}', 5), '5 ламп'); // allow-cyrillic: Russian plural form
  setLang('de');
  assert.equal(t('Open|verb'), 'Öffnen');
  setLang('en');
});

test('formats: number and time formats from the HA profile override the language', () => {
  const at = new Date(2026, 0, 1, 14, 5);
  const sp = (s: string): string => s.replace(/\s/g, ' ');
  setLang('en');
  setFormats(null);
  assert.equal(num(1234.5, 1), '1234.5');
  assert.equal(sp(clock(at)), '2:05 PM');
  setFormats({number_format: 'decimal_comma', time_format: '24'});
  assert.equal(num(12345.5, 1), '12.345,5');
  assert.equal(clock(at), '14:05');
  setFormats({number_format: 'space_comma', time_format: 'language'});
  assert.equal(sp(num(12345.5, 1)), '12 345,5');
  assert.equal(sp(clock(at)), '2:05 PM');
  setFormats({number_format: 'none'});
  assert.equal(num(12345.5, 1), '12345.5');
  setLang('de');
  setFormats({time_format: '12'});
  assert.match(sp(clock(at)), /^2:05 PM$/, "HA keeps the 12-hour clock as '12'");
  setFormats({number_format: 'comma_decimal'});
  assert.equal(num(12345.5, 1), '12,345.5');
  setLang('en');
  setFormats(null);
});
