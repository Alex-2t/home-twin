// Skirting boards and door and window trim (trim.js, D-080).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trimBoxes, TRIM} from './trim.js';

// A 4 × 3 m room, counter-clockwise from the bottom left: a door in the bottom wall, a window in the top one.
const room = {id: 'r1', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]]};
const door = {kind: 'door', a: [1, 0], b: [1.9, 0], bottom: 0, top: 2.05};
const window_ = {kind: 'window', a: [1.5, 3], b: [2.7, 3], bottom: 0.85, top: 2.3};
const xs = box => box.mp[0][0].map(point => point[0]);
const ys = box => box.mp[0][0].map(point => point[1]);

test('the skirting runs round the walls and stops at the door; the door and the window get casings, the window a sill', () => {
  const boxes = trimBoxes([room], [door, window_]);
  const skirting = boxes.filter(box => box.opening === null);
  // The bottom wall in two pieces, either side of the door and its casing; the other three walls whole (under the window too).
  assert.equal(skirting.length, 5);
  const bottomPieces = skirting.filter(box => ys(box).every(y => y < 0.1));
  assert.equal(bottomPieces.length, 2);
  assert.ok(Math.max(...xs(bottomPieces[0])) <= 1 - TRIM.casingWidth + 0.06);
  assert.ok(Math.min(...xs(bottomPieces[1])) >= 1.9 + TRIM.casingWidth - 0.06);
  assert.ok(skirting.every(box => box.bottom === 0 && box.top === TRIM.skirtingHeight));
  // The door: two sides from the floor and a head; the window: two sides, a head and a sill.
  assert.equal(boxes.filter(box => box.opening === 0).length, 3);
  assert.equal(boxes.filter(box => box.opening === 1).length, 4);
  const sill = boxes.find(box => box.opening === 1 && box.top === window_.bottom);
  assert.ok(sill);
  // Trim stands inside the room, on the wall's face.
  for (const box of boxes) for (const [x, y] of box.mp[0][0]) assert.ok(x > 0 && x < 4 && y > 0 && y < 3, `${x}, ${y}`);
});

test('no trim where the wall is taken away or is a railing', () => {
  const open = {...room, wt: [0, null, null, null], rail: [0, 0, 1.1, 0]};
  const boxes = trimBoxes([open], []);
  // Of four walls, two: the bottom one is gone, the top one is a railing.
  assert.equal(boxes.length, 2);
  assert.equal(trimBoxes([{...room, solid: true}], []).length, 0);
});
