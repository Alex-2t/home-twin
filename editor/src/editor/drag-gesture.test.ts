// @ts-nocheck
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {axisCursor, createDragGesture, DRAG_HOLD_MS} from './drag-gesture.ts';

const pointer = (x = 100, y = 100, id = 1) => ({pointerId: id, clientX: x, clientY: y});
function setup(t) {
  t.mock.timers.enable({apis: ['setTimeout']});
  let cursor = null;
  const g = createDragGesture(c => {
    cursor = c;
  });
  return {g, cursor: () => cursor, tick: ms => t.mock.timers.tick(ms)};
}
test('a short click and mouse jitter do not start a drag', t => {
  const {g, cursor, tick} = setup(t);
  g.begin(pointer(), 'ns-resize');
  assert.equal(g.move(pointer(102, 102)), false);
  assert.equal(cursor(), null);
  g.end();
  tick(DRAG_HOLD_MS + 1);
  assert.equal(cursor(), null);
});
test('a hold shows the direction but does not lift the movement threshold', t => {
  const {g, cursor, tick} = setup(t);
  g.begin(pointer(), 'ns-resize');
  tick(DRAG_HOLD_MS - 1);
  assert.equal(cursor(), null);
  tick(1);
  assert.equal(cursor(), 'ns-resize');
  assert.equal(g.move(pointer(102, 100)), false);
  assert.equal(g.move(pointer(100, 104)), true);
  g.end();
  assert.equal(cursor(), null);
});
test('a fast move starts the grab without waiting; returning to the start point does not end it', t => {
  const {g, cursor} = setup(t);
  g.begin(pointer(), 'move');
  assert.equal(g.move(pointer(104, 100)), true);
  assert.equal(cursor(), 'move');
  assert.equal(g.move(pointer()), true);
});
test('another pointer does not start the gesture; cancel removes the pending cursor', t => {
  const {g, cursor, tick} = setup(t);
  g.begin(pointer(), 'move');
  assert.equal(g.move(pointer(140, 140, 2)), false);
  g.end();
  tick(1000);
  assert.equal(cursor(), null);
  assert.equal(g.move(pointer(140, 140)), false);
});
test('a new gesture does not inherit the previous timer; a click action does not promise a move', t => {
  const {g, cursor, tick} = setup(t);
  g.begin(pointer(), 'move');
  tick(200);
  g.begin(pointer(), null);
  tick(1000);
  assert.equal(cursor(), null);
  assert.equal(g.move(pointer(110, 100)), true);
});
test('arrows match the movement axis on the plan, including for rotated furniture', () => {
  for (const [axis, cursor] of [
    [[1, 0], 'ew-resize'],
    [[0, 1], 'ns-resize'],
    [[1, 1], 'nesw-resize'],
    [[1, -1], 'nwse-resize'],
  ]) {
    assert.equal(axisCursor(axis), cursor);
    assert.equal(axisCursor(axis.map(x => -x)), cursor);
  }
  assert.equal(axisCursor([1, 0.1]), 'ew-resize');
  assert.equal(axisCursor([0.1, 1]), 'ns-resize');
});
