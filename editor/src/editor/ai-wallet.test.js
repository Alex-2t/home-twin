// The AI build's package (ai-wallet.js): shares shown as percents, never money.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {walletPercents, walletMeter, priceText} from './ai-wallet.js';

test('a little used is at least 1 %; not used up is at most 99 %', () => {
  assert.deepEqual(walletPercents({used: 0, left: 1, empty: false}), {used: 0, left: 100});
  assert.deepEqual(walletPercents({used: 0.001, left: 0.999, empty: false}), {used: 1, left: 99});
  assert.deepEqual(walletPercents({used: 0.36, left: 0.64, empty: false}), {used: 36, left: 64});
  assert.deepEqual(walletPercents({used: 0.998, left: 0.002, empty: false}), {used: 99, left: 1});
  assert.deepEqual(walletPercents({used: 1, left: 0, empty: true}), {used: 100, left: 0});
});

test('the meter fills with what is used and says what is left; nothing without a package', () => {
  const html = walletMeter({used: 0.36, left: 0.64, empty: false});
  assert.match(html, /width:36%/);
  assert.match(html, /64% left/);
  assert.match(html, /Package: 36% used, 64% left/);
  assert.doesNotMatch(html, /\$/);
  assert.match(walletMeter({used: 1, left: 0, empty: true}), /aib-wallet empty/);
  assert.equal(walletMeter(null), '');
});

test('a price reads in the language: whole amounts without cents', () => {
  assert.equal(priceText({amount: 20, currency: 'USD'}), '$20');
  assert.equal(priceText({amount: 19.5, currency: 'USD'}), '$19.50');
  assert.equal(priceText(null), '');
});
