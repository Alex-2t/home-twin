// The turntable's arithmetic (D-114): 72 steps in three interleaved sheets, the frames either side of a position among the
// loaded sheets and the next one's share, drags, the wrap, the way back, the sheet's cells.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  TURNTABLE_COLUMNS,
  TURNTABLE_FRAMES,
  TURNTABLE_ROWS,
  TURNTABLE_SHEETS,
  TURNTABLE_STEPS,
  blendAt,
  cellOfStep,
  coast,
  frameAtAngle,
  frameIndex,
  framesForDrag,
  nearestLoaded,
  sheetPosition,
  sheetSuffix,
  spinSpeed,
  wayToStart,
  wrapFrame,
} from './turntable-math.ts';

const ALL = [true, true, true];
const A_ONLY = [true, false, false];

/** Close enough for a share. */
const near = (actual: number, expected: number): void =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test('72 steps of 5°: three sheets of 24 frames, each a 6 × 4 grid', () => {
  assert.equal(TURNTABLE_FRAMES, TURNTABLE_COLUMNS * TURNTABLE_ROWS);
  assert.equal(TURNTABLE_STEPS, 72);
  assert.equal(TURNTABLE_SHEETS, 3);
  assert.deepEqual([0, 1, 2].map(sheetSuffix), ['', '-b', '-c']);
});

test('an angle is a step; a step is a sheet and a cell: a 0°, 15° …, b 5°, 20° …, c 10°, 25° …', () => {
  assert.equal(frameAtAngle(0), 0);
  assert.equal(frameAtAngle(5), 1);
  assert.equal(frameAtAngle(15), 3);
  assert.equal(frameAtAngle(358), 0, 'past the last step is step 0 again');
  assert.equal(frameAtAngle(-5), 71);
  assert.deepEqual(cellOfStep(0), {sheet: 0, cell: 0});
  assert.deepEqual(cellOfStep(1), {sheet: 1, cell: 0}, '5° is sheet b, its first cell');
  assert.deepEqual(cellOfStep(2), {sheet: 2, cell: 0}, '10° is sheet c');
  assert.deepEqual(cellOfStep(3), {sheet: 0, cell: 1}, '15° is sheet a, its second cell');
  assert.deepEqual(cellOfStep(71), {sheet: 2, cell: 23});
});

test('with every sheet loaded: the frames 5° apart round the position and the next one’s share', () => {
  assert.deepEqual(blendAt(0, ALL), {from: 0, to: 1, weight: 0});
  const between = blendAt(4.25, ALL);
  assert.deepEqual([between.from, between.to], [4, 5]);
  near(between.weight, 0.25);
  const wrapped = blendAt(71.5, ALL);
  assert.deepEqual([wrapped.from, wrapped.to], [71, 0], 'over the end it blends into step 0');
  near(wrapped.weight, 0.5);
  const behind = blendAt(-0.25, ALL);
  assert.deepEqual([behind.from, behind.to], [71, 0]);
  near(behind.weight, 0.75);
});

test('with sheet a alone: the frames 15° apart, the share over three steps', () => {
  const blend = blendAt(4, A_ONLY);
  assert.deepEqual([blend.from, blend.to], [3, 6]);
  near(blend.weight, 1 / 3);
  const end = blendAt(70.5, A_ONLY);
  assert.deepEqual([end.from, end.to], [69, 0]);
  near(end.weight, 0.5);
});

test('with sheets a and c: the gaps are 10° and 5° in turn', () => {
  const loaded = [true, false, true];
  const first = blendAt(1, loaded);
  assert.deepEqual([first.from, first.to], [0, 2]);
  near(first.weight, 0.5);
  const second = blendAt(2.5, loaded);
  assert.deepEqual([second.from, second.to], [2, 3]);
  near(second.weight, 0.5);
});

test('the nearest loaded step; nothing loaded is step 0', () => {
  assert.equal(nearestLoaded(4.2, ALL), 4);
  assert.equal(nearestLoaded(4.6, ALL), 5);
  assert.equal(nearestLoaded(4, A_ONLY), 3);
  assert.equal(nearestLoaded(5, A_ONLY), 6);
  assert.equal(nearestLoaded(71, A_ONLY), 0);
  assert.deepEqual(blendAt(10, [false, false, false]), {from: 0, to: 0, weight: 0});
});

test('a position wraps into 0 … 72, never negative or -0', () => {
  assert.equal(wrapFrame(73.5), 1.5);
  assert.equal(wrapFrame(-0.5), 71.5);
  assert.ok(Object.is(wrapFrame(-144), 0));
  assert.equal(frameIndex(71.6), 0);
  assert.equal(frameIndex(-0.6), 71);
});

test('a drag: rightwards forwards, across the picture three quarters of a turn', () => {
  assert.equal(framesForDrag(400, 400), 54);
  assert.equal(framesForDrag(-200, 400), -27);
  assert.equal(framesForDrag(50, 0), 0);
  assert.equal(frameIndex(framesForDrag(1600, 400)), (54 * 4) % 72);
});

test('back to step 0 the short way', () => {
  assert.equal(wayToStart(9), -9);
  assert.equal(wayToStart(63), 9);
  assert.equal(wayToStart(-6), 6);
  assert.equal(wayToStart(78), -6);
});

test('a cell is a background position in percent', () => {
  assert.deepEqual(sheetPosition(0), {x: 0, y: 0});
  assert.deepEqual(sheetPosition(5), {x: 100, y: 0});
  assert.deepEqual(sheetPosition(6), {x: 0, y: 100 / 3});
  assert.deepEqual(sheetPosition(23), {x: 100, y: 100});
});

test('turning by itself is a turn in 8 s; a coast slows down and stops', () => {
  assert.equal(spinSpeed() * 8, TURNTABLE_STEPS);
  near(coast(10, 0.18), 5);
  assert.ok(coast(10, 1) < 0.25);
  assert.equal(Math.sign(coast(-10, 0.1)), -1);
});
