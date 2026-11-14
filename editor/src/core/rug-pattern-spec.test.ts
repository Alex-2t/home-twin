// The rug pattern language (rug-pattern-spec.ts): what a file or a model's answer keeps of a spec, the named patterns written in
// it, and the nearest named pattern of a spec.
import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG} from './catalog.ts';
import {
  MOST_RUG_LAYERS,
  RUG_PATTERNS,
  RUG_PRESETS,
  cleanRugSpec,
  isRugPattern,
  nearestRugPreset,
} from './rug-pattern-spec.ts';

test('not a spec: nothing to draw', () => {
  for (const raw of [null, undefined, 'oriental', 3, [], {}, {layers: 'stripes'}, {layers: []}])
    assert.equal(cleanRugSpec(raw), null, JSON.stringify(raw));
});

test('a layer of an unknown shape, or one that is not an object, is left out; the rest is kept', () => {
  const spec = cleanRugSpec({layers: [{shape: 'paisley'}, 'dots', null, {shape: 'dots', color: 1}]});
  assert.deepEqual(spec, {layers: [{shape: 'dots', color: 1}]});
  assert.equal(cleanRugSpec({layers: [{shape: 'paisley'}]}), null);
});

test("numbers are brought within their ranges, words not of the shape's are left out, and so is what the shape does not take", () => {
  const spec = cleanRugSpec({
    layers: [
      {
        shape: 'stripes',
        color: 1,
        width: 0.0001,
        gap: 40,
        dir: 'sideways',
        size: 0.3,
        radius: 0.1,
        extra: true,
      },
      {shape: 'patches', shade: 0.01, seed: 12.6, share: '0.5', opacity: 7},
      {shape: 'medallion', form: 'oval', size: 2, line: Number.NaN},
    ],
  });
  assert.deepEqual(spec, {
    layers: [
      {shape: 'stripes', color: 1, width: 0.003, gap: 3},
      {shape: 'patches', shade: 0.2, seed: 13, opacity: 1},
      {shape: 'medallion', color: 1, form: 'oval', size: 0.95},
    ],
  });
});

test("a layer's colour is one of the palette: the field, the second colour, the spec's own; else the layer is left out", () => {
  const spec = cleanRugSpec({
    colors: ['#C8A2C8', '#123456'],
    layers: [
      {shape: 'frame', color: 0},
      {shape: 'frame', color: 3},
      {shape: 'frame', color: 4},
      {shape: 'frame', color: -1},
      {shape: 'frame', color: 1.5},
    ],
  });
  // 1.5 is no index: the layer falls back to the second colour
  assert.deepEqual(spec, {
    colors: ['#c8a2c8', '#123456'],
    layers: [
      {shape: 'frame', color: 0},
      {shape: 'frame', color: 3},
      {shape: 'frame', color: 1},
    ],
  });
});

test("the spec's own colours stop at the first that is not #rrggbb, at most four, and only those a layer uses are kept", () => {
  const spec = cleanRugSpec({
    colors: ['#aa0000', 'red', '#00aa00'],
    layers: [
      {shape: 'dots', color: 2},
      {shape: 'dots', color: 3},
    ],
  });
  assert.deepEqual(spec, {colors: ['#aa0000'], layers: [{shape: 'dots', color: 2}]});
  const many = cleanRugSpec({
    colors: ['#000001', '#000002', '#000003', '#000004', '#000005'],
    layers: [{shape: 'dots', color: 5}],
  });
  assert.deepEqual(many?.colors, ['#000001', '#000002', '#000003', '#000004']);
  assert.deepEqual(cleanRugSpec({colors: ['#000001'], layers: [{shape: 'dots'}]}), {
    layers: [{shape: 'dots', color: 1}],
  });
});

test('at most eight layers', () => {
  const layers = Array.from({length: 12}, () => ({shape: 'rings', color: 1}));
  assert.equal(cleanRugSpec({layers})?.layers.length, MOST_RUG_LAYERS);
});

test("every named pattern is a clean spec, its own nearest named pattern, and one of the rug model's pats", () => {
  const rug = CATALOG.find(entry => entry.id === 'rug');
  assert.deepEqual(
    rug?.pats?.map(([key]) => key),
    RUG_PATTERNS,
  );
  for (const pattern of RUG_PATTERNS) {
    assert.deepEqual(cleanRugSpec(RUG_PRESETS[pattern]), RUG_PRESETS[pattern], pattern);
    assert.equal(nearestRugPreset(RUG_PRESETS[pattern]), pattern);
    assert.ok(isRugPattern(pattern));
  }
  assert.equal(isRugPattern('toString'), false);
  assert.equal(isRugPattern(undefined), false);
});

test('the nearest named pattern of a spec of its own, for an editor that does not read it', () => {
  const nearest = (layers: unknown[]): string => nearestRugPreset(cleanRugSpec({layers})!);
  assert.equal(nearest([{shape: 'patches'}, {shape: 'medallion', form: 'circle'}]), 'oriental');
  assert.equal(nearest([{shape: 'frame', inset: 0.1}]), 'oriental');
  assert.equal(nearest([{shape: 'stripes', dir: 'diagonal'}]), 'stripes');
  assert.equal(nearest([{shape: 'stripes'}, {shape: 'stripes', dir: 'along'}]), 'plaid');
  assert.equal(nearest([{shape: 'grid'}]), 'tiles');
  assert.equal(nearest([{shape: 'diamonds'}, {shape: 'dots'}]), 'lattice');
  assert.equal(nearest([{shape: 'patches', share: 0.2}]), 'mottled');
});
