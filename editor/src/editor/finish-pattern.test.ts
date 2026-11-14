// A finish's pattern set by hand (D-089): a change stays in the finish's range, the tile is written whole, and a value
// set back to the finish's own is left out, so the file stays as it was.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editPattern} from './finish-pattern.ts';
import {patternSpec} from '../core/surfaces.ts';

test('pattern by hand: a size is kept in range and written with the other side', () => {
  const planks = patternSpec('floor', 'wood');
  assert.deepEqual(editPattern({}, planks, {width: 0.15}), {tile: [0.15, 1.2]});
  assert.deepEqual(editPattern({tile: [0.15, 1.2]}, planks, {height: 1.8}), {tile: [0.15, 1.8]});
  assert.deepEqual(editPattern({}, planks, {width: 5}), {tile: [0.4, 1.2]}, 'the widest plank offered');
  // one size only (stripes): the second number is the finish's own
  const stripes = patternSpec('wall', 'wallpaperStripe');
  assert.deepEqual(editPattern({}, stripes, {width: 0.05}), {tile: [0.05, 0.1]});
});

test("pattern by hand: the finish's own values are none", () => {
  const tiles = patternSpec('wall', 'tileSubway');
  assert.deepEqual(editPattern({}, tiles, {lay: 'bond'}), {}, 'subway tiles are offset already');
  assert.deepEqual(editPattern({}, tiles, {lay: 'grid'}), {lay: 'grid'});
  assert.deepEqual(editPattern({tile: [0.2, 0.075]}, tiles, {width: 0.15}), {}, 'back to 15 × 7.5');
  assert.deepEqual(editPattern({}, tiles, {joint: 0.002}), {});
  assert.deepEqual(editPattern({}, tiles, {joint: 0.004}), {joint: 0.004});
  assert.deepEqual(editPattern({}, tiles, {grout: '#101010'}), {grout: '#101010'});
  // a change the finish does not take is ignored
  assert.deepEqual(editPattern({}, patternSpec('wall', 'paintWarm'), {width: 0.2}), {});
});
