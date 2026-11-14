// A rug's pattern picture (rug-pattern.ts): D-101's three patterns drawn to the very same pixels, every named pattern showing
// its colours on every outline, smooth edges, and the same picture on every run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {rugPatternPixels, rugSpecOf} from './rug-pattern.ts';
import type {RugOutline} from './rug-pattern.ts';
import {RUG_PATTERNS, RUG_PRESETS} from './rug-pattern-spec.ts';
import type {RugPattern, RugSpec} from './rug-pattern-spec.ts';

const FIELD = 0xb8b1a5;
const SECOND = 0x3a4a6b;

/** The picture's pixels (RGBA). */
const pixelsOf = (spec: RugSpec, width: number, depth: number, outline: RugOutline = 'rect'): Uint8Array =>
  rugPatternPixels(spec, width, depth, FIELD, SECOND, outline).pixels;

/** The share of the picture's pixels nearer the second colour than the field (by their red channel, far apart here). */
function secondShare(pattern: RugPattern, width = 2, depth = 1.4, outline: RugOutline = 'rect'): number {
  const pixels = pixelsOf(RUG_PRESETS[pattern], width, depth, outline);
  const middleRed = (((FIELD >> 16) & 255) + ((SECOND >> 16) & 255)) / 2;
  let second = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < middleRed) second++;
  return second / (pixels.length / 4);
}

// The pictures D-101's code drew (before the patterns were written as layers), as the first 16 hex digits of their sha256:
// pattern, w × d metres, field / second colour.
const D101_PICTURES: [string, string][] = [
  ['tiles 2x1.4 b8b1a5/3a4a6b', 'da6ad853f2f763fa'],
  ['tiles 2x1.4 e9e4da/1c1c1c', '46e56f87089a2cbd'],
  ['tiles 1x1 b8b1a5/3a4a6b', '8ed2b24904390e17'],
  ['tiles 1x1 e9e4da/1c1c1c', '23776196b0ec7588'],
  ['tiles 0.8x3 b8b1a5/3a4a6b', 'ef9663a265d74475'],
  ['tiles 0.8x3 e9e4da/1c1c1c', '8ebb007fe060622c'],
  ['tiles 3.2x2.3 b8b1a5/3a4a6b', '28c37b1b10bfe51b'],
  ['tiles 3.2x2.3 e9e4da/1c1c1c', '32be7ed5122fe084'],
  ['tiles 0.5x0.5 b8b1a5/3a4a6b', '622ecc0954b90782'],
  ['tiles 0.5x0.5 e9e4da/1c1c1c', 'aa6809093dc51958'],
  ['tiles 5x5 b8b1a5/3a4a6b', '88f5c30338166a7b'],
  ['tiles 5x5 e9e4da/1c1c1c', '2acbe67fdcdb3d88'],
  ['tiles 1.6x1.6 b8b1a5/3a4a6b', '05772a21c76e74d1'],
  ['tiles 1.6x1.6 e9e4da/1c1c1c', '8f1f726c4f74b929'],
  ['tiles 1.2x0.6 b8b1a5/3a4a6b', '126f2bea8cd5ede6'],
  ['tiles 1.2x0.6 e9e4da/1c1c1c', 'f391e6d67ed9d8e7'],
  ['tiles 0.37x0.91 b8b1a5/3a4a6b', '489fe96b41ca783f'],
  ['tiles 0.37x0.91 e9e4da/1c1c1c', 'f9258138ef98cf90'],
  ['stripes 2x1.4 b8b1a5/3a4a6b', 'b3c4075ad614c3ca'],
  ['stripes 2x1.4 e9e4da/1c1c1c', '986e25948799e783'],
  ['stripes 1x1 b8b1a5/3a4a6b', 'f601ae1e0fd2b6e0'],
  ['stripes 1x1 e9e4da/1c1c1c', '59218f62eef35338'],
  ['stripes 0.8x3 b8b1a5/3a4a6b', '871f30ce04ceb8f9'],
  ['stripes 0.8x3 e9e4da/1c1c1c', 'f825b85fe3baeb40'],
  ['stripes 3.2x2.3 b8b1a5/3a4a6b', '324f4a547ce74a26'],
  ['stripes 3.2x2.3 e9e4da/1c1c1c', '680936301a010736'],
  ['stripes 0.5x0.5 b8b1a5/3a4a6b', 'ae327c87afb6eb91'],
  ['stripes 0.5x0.5 e9e4da/1c1c1c', '4910d27a79b2e5b4'],
  ['stripes 5x5 b8b1a5/3a4a6b', 'f1589ce2985f80ef'],
  ['stripes 5x5 e9e4da/1c1c1c', '4f1db2cde4e2117e'],
  ['stripes 1.6x1.6 b8b1a5/3a4a6b', '075ad3df3303e4a5'],
  ['stripes 1.6x1.6 e9e4da/1c1c1c', 'e703c73e8b917fbc'],
  ['stripes 1.2x0.6 b8b1a5/3a4a6b', '4ac31e43a37d1c15'],
  ['stripes 1.2x0.6 e9e4da/1c1c1c', 'b77d24102faa0ca5'],
  ['stripes 0.37x0.91 b8b1a5/3a4a6b', 'b76bf239d097d864'],
  ['stripes 0.37x0.91 e9e4da/1c1c1c', 'cd055d65a75f1454'],
  ['mottled 2x1.4 b8b1a5/3a4a6b', 'd712c61d4512139e'],
  ['mottled 2x1.4 e9e4da/1c1c1c', 'f8786e89d1800ca4'],
  ['mottled 1x1 b8b1a5/3a4a6b', '4c142d8f1a5ae717'],
  ['mottled 1x1 e9e4da/1c1c1c', '19fdb920b6716ee9'],
  ['mottled 0.8x3 b8b1a5/3a4a6b', 'e7994a44a9786e64'],
  ['mottled 0.8x3 e9e4da/1c1c1c', '6fd32815b1cf6727'],
  ['mottled 3.2x2.3 b8b1a5/3a4a6b', 'cd5b86cd2f8ea1b0'],
  ['mottled 3.2x2.3 e9e4da/1c1c1c', '77e2c9b9cc7b570e'],
  ['mottled 0.5x0.5 b8b1a5/3a4a6b', '800c35cb14ed237f'],
  ['mottled 0.5x0.5 e9e4da/1c1c1c', 'ca833da30e2959a4'],
  ['mottled 5x5 b8b1a5/3a4a6b', 'bf87d0181d843253'],
  ['mottled 5x5 e9e4da/1c1c1c', 'de7fa403d464f324'],
  ['mottled 1.6x1.6 b8b1a5/3a4a6b', '009a983fe4174da8'],
  ['mottled 1.6x1.6 e9e4da/1c1c1c', '4f8ce3c8dd21bfab'],
  ['mottled 1.2x0.6 b8b1a5/3a4a6b', '62f3ae892d929433'],
  ['mottled 1.2x0.6 e9e4da/1c1c1c', '273eec111c62ba45'],
  ['mottled 0.37x0.91 b8b1a5/3a4a6b', 'ed049da57bb4026c'],
  ['mottled 0.37x0.91 e9e4da/1c1c1c', '39988fee1d1acacb'],
];

test("tiles, stripes and mottled draw exactly D-101's pixels", () => {
  for (const [name, digest] of D101_PICTURES) {
    const [pattern, size, colours] = name.split(' ');
    const [width, depth] = size.split('x').map(Number);
    const [field, second] = colours.split('/').map(hex => parseInt(hex, 16));
    const {pixels} = rugPatternPixels(RUG_PRESETS[pattern as RugPattern], width, depth, field, second);
    assert.equal(createHash('sha256').update(pixels).digest('hex').slice(0, 16), digest, name);
  }
});

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

// What share of a rug each new pattern gives its second colour: enough to be seen, not so much the field is lost.
const SHARES: Partial<Record<RugPattern, [number, number]>> = {
  oriental: [0.2, 0.6],
  lattice: [0.08, 0.3],
  chevron: [0.25, 0.5],
  dots: [0.05, 0.25],
  rings: [0.35, 0.65],
  plaid: [0.3, 0.85],
};

test('every new pattern shows both colours on a rectangle, a round rug, an oval one and a runner', () => {
  for (const [pattern, [least, most]] of Object.entries(SHARES) as [RugPattern, [number, number]][])
    for (const [width, depth, outline] of [
      [2, 1.4, 'rect'],
      [1.6, 1.6, 'ellipse'],
      [2.2, 1.5, 'ellipse'],
      [0.8, 3, 'rect'],
    ] as [number, number, RugOutline][]) {
      const share = secondShare(pattern, width, depth, outline);
      assert.ok(share > least && share < most, `${pattern} ${width} × ${depth} ${outline}: ${share}`);
    }
});

test('the same picture on every run, so a plan looks alike everywhere', () => {
  for (const pattern of RUG_PATTERNS) {
    const first = pixelsOf(RUG_PRESETS[pattern], 2, 1.4, 'ellipse');
    const again = pixelsOf(RUG_PRESETS[pattern], 2, 1.4, 'ellipse');
    assert.deepEqual(first, again, pattern);
  }
});

/** The mean red of each 16 × 16 block of a picture, and how far the blocks spread (their standard deviation). */
function blockSpread(pixels: Uint8Array, columns: number, rows: number): number {
  const BLOCK = 16;
  const means: number[] = [];
  for (let top = 0; top + BLOCK <= rows; top += BLOCK)
    for (let left = 0; left + BLOCK <= columns; left += BLOCK) {
      let sum = 0;
      for (let row = top; row < top + BLOCK; row++)
        for (let column = left; column < left + BLOCK; column++) sum += pixels[(row * columns + column) * 4];
      means.push(sum / (BLOCK * BLOCK));
    }
  const mean = means.reduce((total, value) => total + value, 0) / means.length;
  return Math.sqrt(means.reduce((total, value) => total + (value - mean) ** 2, 0) / means.length);
}

test('stripes finer than a pixel blend to an even tone instead of beating into moiré', () => {
  // 7 mm bands every 2 cm on a 3 m rug: about 1.9 pixels a period
  const fine: RugSpec = {layers: [{shape: 'stripes', color: 1, dir: 'diagonal', width: 0.007, gap: 0.013}]};
  const smooth = rugPatternPixels(fine, 3, 2, FIELD, SECOND);
  const pointSampled = rugPatternPixels({...fine, sharp: true}, 3, 2, FIELD, SECOND);
  const smoothSpread = blockSpread(smooth.pixels, smooth.columns, smooth.rows);
  const sampledSpread = blockSpread(pointSampled.pixels, pointSampled.columns, pointSampled.rows);
  assert.ok(smoothSpread < 3, `smoothed: ${smoothSpread}`);
  assert.ok(sampledSpread > smoothSpread * 3, `point-sampled ${sampledSpread} vs smoothed ${smoothSpread}`);
});

test("a frame follows a round rug's edge: none in the square's corner, the band just inside the circle", () => {
  const frame: RugSpec = {layers: [{shape: 'frame', color: 1, inset: 0.05, width: 0.06}]};
  const {pixels, columns} = rugPatternPixels(frame, 2, 2, FIELD, SECOND, 'ellipse');
  const redAt = (x: number, y: number): number =>
    pixels[(Math.floor((y / 2) * columns) * columns + Math.floor((x / 2) * columns)) * 4];
  const fieldRed = (FIELD >> 16) & 255;
  const secondRed = (SECOND >> 16) & 255;
  // the square's corner, outside the circle, and the circle's middle: field
  assert.equal(redAt(0.08, 0.08), fieldRed);
  assert.equal(redAt(1, 1), fieldRed);
  // 8 cm in from the circle's edge, at its left and on its diagonal: the band
  assert.equal(redAt(0.08, 1), secondRed);
  const diagonal = 1 - (1 - 0.08) * Math.SQRT1_2;
  assert.equal(redAt(diagonal, diagonal), secondRed);
});

test('an item draws its own pattern when it is drawable, else its named one, else none', () => {
  const own = {layers: [{shape: 'dots', color: 1}]};
  assert.deepEqual(rugSpecOf('tiles', own), {layers: [{shape: 'dots', color: 1}]});
  assert.equal(rugSpecOf('tiles', {layers: [{shape: 'paisley'}]}), RUG_PRESETS.tiles);
  assert.equal(rugSpecOf('tiles', 'stripes'), RUG_PRESETS.tiles);
  assert.equal(rugSpecOf('herringbone', undefined), null);
  assert.equal(rugSpecOf(undefined, undefined), null);
});
