// A rug's pattern picture (rug-pattern.ts): how much of each colour each pattern shows, and the same picture on every run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {rugPatternTexture} from './rug-pattern.ts';
import type {RugPattern} from './rug-pattern.ts';

const FIELD = 0xb8b1a5;
const SECOND = 0x3a4a6b;

/** The share of the picture's pixels nearer the second colour than the field (by their red channel, far apart here). */
function secondShare(pattern: RugPattern, width = 2, depth = 1.4): number {
  const pixels = rugPatternTexture(pattern, width, depth, FIELD, SECOND).image.data as Uint8Array;
  const middleRed = (((FIELD >> 16) & 255) + ((SECOND >> 16) & 255)) / 2;
  let second = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < middleRed) second++;
  return second / (pixels.length / 4);
}

test('tiles: a checker, about half of each colour', () => {
  const share = secondShare('tiles');
  assert.ok(share > 0.4 && share < 0.6, `${share}`);
});
test('stripes: bands of the second colour, about a third', () => {
  const share = secondShare('stripes');
  assert.ok(share > 0.22 && share < 0.45, `${share}`);
});
test('mottled: patches of the second colour over a good part of the rug, on a round mat and a long runner too', () => {
  for (const [width, depth] of [
    [2, 1.4],
    [1, 1],
    [0.8, 3],
  ]) {
    const share = secondShare('mottled', width, depth);
    assert.ok(share > 0.2 && share < 0.6, `${width} × ${depth}: ${share}`);
  }
});
test('the same picture on every run, so a plan looks alike everywhere', () => {
  const first = rugPatternTexture('mottled', 2, 1.4, FIELD, SECOND).image.data as Uint8Array;
  const again = rugPatternTexture('mottled', 2, 1.4, FIELD, SECOND).image.data as Uint8Array;
  assert.deepEqual(first, again);
});
