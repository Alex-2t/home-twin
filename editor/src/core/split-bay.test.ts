// Splitting a room with a bay window: the split line runs along the room's main walls away from a wall (geometry.ts
// mainWallDirection), and a split may end on a slanted wall (plan.ts cutChord, splitPolygon).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {area, mainWallDirection} from './geometry.ts';
import {cutChord, splitPolygon} from './plan.ts';
import type {Outline, Room, Vector} from './types.ts';

/** Whether a direction runs along the x or the y axis (either way: the line is the same). */
function isAxisAligned(direction: Vector): boolean {
  return Math.abs(direction[0]) > 0.999 || Math.abs(direction[1]) > 0.999;
}

test('a living room with a bay window: the slanted bay sides do not tilt the main direction', () => {
  // 4.9 × 4.2 m, the bay on the bottom wall: 0.6 m deep, slanted sides at 45°
  const livingRoomWithBay: Outline = [
    [0, 0],
    [4.9, 0],
    [4.9, 4.2],
    [3.4, 4.2],
    [2.8, 4.8],
    [2.1, 4.8],
    [1.5, 4.2],
    [0, 4.2],
  ];
  assert.ok(isAxisAligned(mainWallDirection(livingRoomWithBay)));
});

test('a room drawn at an angle: its own walls set the direction, not the screen axes', () => {
  const angle = (30 * Math.PI) / 180;
  const rotate = ([x, y]: [number, number]): [number, number] => [
    x * Math.cos(angle) - y * Math.sin(angle),
    x * Math.sin(angle) + y * Math.cos(angle),
  ];
  const rotatedRoom: Outline = [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ].map(point => rotate(point as [number, number]));
  const direction = mainWallDirection(rotatedRoom);
  const degrees = (Math.atan2(direction[1], direction[0]) * 180) / Math.PI;
  assert.equal(Math.round(degrees), 30);
});

test('a corner cut at 45° in a large room still leaves the room on its axes', () => {
  const roomWithCutCorner: Outline = [
    [0, 0],
    [5, 0],
    [5, 3],
    [4, 4],
    [0, 4],
  ];
  assert.ok(isAxisAligned(mainWallDirection(roomWithCutCorner)));
});

test('a split line ending on the slanted sides of a bay splits the room', () => {
  // 4.9 × 4.2 m with a bay 1.2 m deep: its sides run at 60°, so the line's rounded ends lie a hair off them
  const livingRoomWithDeepBay: Outline = [
    [0, 0],
    [4.9, 0],
    [4.9, 4.2],
    [3.7, 4.2],
    [3.0, 5.4],
    [1.9, 5.4],
    [1.2, 4.2],
    [0, 4.2],
  ];
  const room = {id: 'living', name: 'Living room', polygon: livingRoomWithDeepBay} as Room;
  const acrossTheBay = cutChord(room, [3.13, 4.58], [1, 0]);
  assert.ok(acrossTheBay);
  const parts = splitPolygon(livingRoomWithDeepBay, null, acrossTheBay[0], acrossTheBay[1]);
  assert.ok(parts, 'the bay is cut off');
  const partAreas = parts.map(part => Math.abs(area(part.pts)));
  const wholeArea = Math.abs(area(livingRoomWithDeepBay));
  assert.ok(Math.abs(partAreas[0] + partAreas[1] - wholeArea) < 1e-3);

  const fromTheFloorToTheSlant = cutChord(room, [3.13, 4.58], [0, 1]);
  assert.ok(fromTheFloorToTheSlant);
  assert.ok(splitPolygon(livingRoomWithDeepBay, null, fromTheFloorToTheSlant[0], fromTheFloorToTheSlant[1]));
});
