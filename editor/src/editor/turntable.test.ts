// The turntable's arithmetic (D-114): angles and drags into frames, round the wrap, the sheet's cells, the way back.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  TURNTABLE_COLUMNS,
  TURNTABLE_FRAMES,
  TURNTABLE_ROWS,
  coast,
  frameAtAngle,
  frameIndex,
  framesForDrag,
  sheetPosition,
  spinSpeed,
  wayToStart,
  wrapFrame,
} from './turntable-math.ts';

test('24 frames, one every 15°, fill the 6 × 4 sheet', () => {
  assert.equal(TURNTABLE_FRAMES, TURNTABLE_COLUMNS * TURNTABLE_ROWS);
  assert.equal(TURNTABLE_FRAMES, 24);
});

test('an angle is the nearest frame, wrapped round both ways', () => {
  assert.equal(frameAtAngle(0), 0);
  assert.equal(frameAtAngle(15), 1);
  assert.equal(frameAtAngle(22), 1);
  assert.equal(frameAtAngle(23), 2);
  assert.equal(frameAtAngle(345), 23);
  assert.equal(frameAtAngle(355), 0, 'past the last frame is frame 0 again');
  assert.equal(frameAtAngle(360), 0);
  assert.equal(frameAtAngle(375), 1);
  assert.equal(frameAtAngle(-15), 23);
  assert.equal(frameAtAngle(-720), 0);
});

test('a position wraps into 0 … 24 and its frame is the nearest', () => {
  assert.equal(wrapFrame(25.5), 1.5);
  assert.equal(wrapFrame(-0.5), 23.5);
  assert.equal(wrapFrame(-48), 0);
  assert.equal(frameIndex(23.6), 0);
  assert.equal(frameIndex(-0.4), 0);
  assert.equal(frameIndex(-0.6), 23);
  assert.equal(frameIndex(47.2), 23);
});

test('a drag: rightwards forwards, across the picture three quarters of a turn, none on a picture of no width', () => {
  assert.equal(framesForDrag(400, 400), 18);
  assert.equal(framesForDrag(-200, 400), -9);
  assert.equal(framesForDrag(0, 400), 0);
  assert.equal(framesForDrag(50, 0), 0);
  // a long drag goes round more than once and still lands on a frame
  assert.equal(frameIndex(framesForDrag(1600, 400)), (18 * 4) % 24);
});

test('back to frame 0 the short way', () => {
  assert.equal(wayToStart(3), -3);
  assert.equal(wayToStart(21), 3);
  assert.equal(wayToStart(-2), 2);
  assert.equal(wayToStart(26), -2);
  assert.equal(wayToStart(0), -0);
});

test('a frame is a cell of the sheet: its background position in percent', () => {
  assert.deepEqual(sheetPosition(0), {x: 0, y: 0});
  assert.deepEqual(sheetPosition(5), {x: 100, y: 0});
  assert.deepEqual(sheetPosition(6), {x: 0, y: 100 / 3});
  assert.deepEqual(sheetPosition(23), {x: 100, y: 100});
});

test('turning by itself is a turn in 8 s; a coast slows down and stops', () => {
  assert.equal(spinSpeed() * 8, TURNTABLE_FRAMES);
  assert.ok(Math.abs(coast(10, 0.18) - 5) < 1e-9, 'half the speed in 0.18 s');
  assert.ok(coast(10, 1) < 0.25);
  assert.equal(Math.sign(coast(-10, 0.1)), -1, 'a coast keeps its way');
});
