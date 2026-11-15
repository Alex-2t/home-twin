import {test} from 'node:test';
import assert from 'node:assert/strict';
import pc from 'polygon-clipping';
import {runShape, faceOf, ring, ringProject, runAt, runGeo, runSet, syncRun, runLines} from './runs.ts';
import {emptyPlan} from './plan.ts';
import type {FurnitureItem, MultiPolygon, Plan, Point, Room} from './types.ts';

// (In these tests a room's face always has edges, every wardrobe has a shape and every wall its front: the ! below.)
const areaOf = (mp: MultiPolygon): number =>
  mp.reduce(
    (t, P) =>
      t +
      P.reduce((s, r, i) => {
        let a = 0;
        for (let k = 0; k < r.length - 1; k++) a += r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1];
        return s + ((i ? -1 : 1) * Math.abs(a)) / 2;
      }, 0),
    0,
  );
const near = (a: number, b: number, e = 0.01): void => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);
// a 4×3 room measured along wall axes; the face is 5 cm inside: 0.05…3.95 × 0.05…2.95
const box: Room = {
  id: 'r',
  polygon: [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ],
};
const at = (room: Room, p: Point): number => {
  const R = ring(faceOf(room));
  return ringProject(R, p)!.s;
};

test('a wardrobe along one wall: a plain rectangle of depth d', () => {
  const face = faceOf(box);
  const R = ring(face);
  const sa = ringProject(R, [1, 0])!.s;
  const g = runShape(face, sa, 2, 0.6)!;
  assert.equal(g.sides.length, 1);
  near(areaOf(g.outline), 2 * 0.6);
  near(g.len, 2);
  const [a, b] = g.sides[0].front!;
  near(a[1], 0.65);
  near(b[1], 0.65);
  near(Math.abs(b[0] - a[0]), 2);
});
test('a wardrobe around a corner: two walls, the fronts meet at the inner corner, the carcass does not overlap', () => {
  const face = faceOf(box);
  const R = ring(face);
  const sa = ringProject(R, [2.95, 0])!.s;
  const g = runShape(face, sa, 1 + 1 + 1, 0.6)!; // 1 m to the corner + 2 m along the right wall
  assert.equal(g.sides.length, 2);
  const [f0, f1] = g.sides.map(s => s.front!);
  near(f0[1][0], 3.35);
  near(f0[1][1], 0.65);
  near(f1[0][0], 3.35);
  near(f1[0][1], 0.65);
  near(areaOf(g.outline), 1 * 0.6 + 2 * 0.6 - 0.6 * 0.6); // 1 + 2 m along the walls, the 60×60 corner counted once
  near(areaOf(pc.intersection(g.sides[0].body, g.sides[1].body)), 0, 1e-6);
});
test('a column at the wall: the front is flat, the column is cut out of the carcass', () => {
  // a 40×30 cm column protrudes into the room in the middle of the bottom wall
  const room: Room = {
    id: 'c',
    polygon: [
      [0, 0],
      [1.8, 0],
      [1.8, 0.3],
      [2.2, 0.3],
      [2.2, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ],
  };
  const face = faceOf(room);
  const R = ring(face);
  const sa = ringProject(R, [0.05, 0])!.s;
  const full = ring(face).P;
  const s1 = ringProject(R, [3.95, 0])!.s;
  const g = runShape(face, sa, s1 - sa, 0.6)!;
  assert.equal(g.sides.length, 1, 'the column is relief of the same wall');
  const [a, b] = g.sides[0].front!;
  near(a[1], 0.65);
  near(b[1], 0.65);
  near(areaOf(g.outline), 3.9 * 0.6 - 0.5 * 0.3, 0.02); // the column, 50×30 cm at the face, is cut out
  assert.ok(full > 0);
});
test('a recess in the wall: the wardrobe fills it, the front follows the main face', () => {
  const room: Room = {
    id: 'n',
    polygon: [
      [0, 0],
      [1.5, 0],
      [1.5, -0.4],
      [2.5, -0.4],
      [2.5, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ],
  };
  const face = faceOf(room);
  const R = ring(face);
  const sa = ringProject(R, [0.05, 0])!.s;
  const s1 = ringProject(R, [3.95, 0])!.s;
  const g = runShape(face, sa, s1 - sa, 0.6)!;
  assert.equal(g.sides.length, 1);
  near(g.sides[0].front![0][1], 0.65);
  near(areaOf(g.outline), 3.9 * 0.6 + 0.9 * 0.4, 0.02);
});
test('a new wardrobe spans the whole wall corner to corner, and a door shortens it', () => {
  const p: Plan = {...emptyPlan(), rooms: [structuredClone(box)]};
  let r = runAt(p, [2, 0.5], 2.4, 0.6)!;
  near(r.L, 3.9);
  p.openings = [{id: 'd', kind: 'door', at: {room: 'r', edge: 0, s0: 3, s1: 3.8, d: 0}}];
  r = runAt(p, [1.5, 0.5], 2.4, 0.6)!;
  near(r.L, 3 - 0.05 - 0.02, 0.02);
  // a new wardrobe: runSet gives it its place and length
  const f = {id: 'w', model: 'wardrobeRun', d: 0.6, h: 2.5} as FurnitureItem;
  runSet(p, f, r.room, r.R, r.sa, r.L);
  near(f.w, r.L, 0.02);
  assert.ok(runGeo(p, f));
  p.rooms[0].polygon = [
    [0, 0],
    [5, 0],
    [5, 3],
    [0, 3],
  ];
  syncRun(p, f); // the wall was moved: the wardrobe stays at its own wall
  assert.equal(runGeo(p, f)!.sides.length, 1);
});
test('a wardrobe dropped onto a window goes next to it, on the larger free stretch of the wall', () => {
  const p: Plan = {
    ...emptyPlan(),
    rooms: [structuredClone(box)],
    openings: [{id: 'w', kind: 'window', at: {room: 'r', edge: 0, s0: 1, s1: 2, d: 0}}],
  };
  const r = runAt(p, [1.5, 0.5], 2.4, 0.6)!;
  near(r.L, 1.93, 0.02);
  near(ring(faceOf(box)).E[0].a[0] + r.sa, 1.97 + 0.05, 0.02);
});
test('a protruding room corner: the wardrobe wraps around it on the outside, the fronts meet beyond the corner', () => {
  // an L-shaped room: the bottom right quarter is cut out; the corner (3,1.5) protrudes into the room
  const L: Room = {
    id: 'L',
    polygon: [
      [0, 0],
      [3, 0],
      [3, 1.5],
      [5, 1.5],
      [5, 4],
      [0, 4],
    ],
  };
  const face = faceOf(L);
  const R = ring(face);
  const sa = ringProject(R, [2, 0])!.s;
  const g = runShape(face, sa, 0.95 + 1.5 + 1, 0.5)!; // along the bottom wall to the corner, up the protrusion (1.5 m) and 1 m past the protruding corner
  assert.equal(g.sides.length, 3);
  near(areaOf(pc.intersection(g.sides[0].body, g.sides[1].body)), 0, 1e-6);
  assert.ok(
    g.sides.every(s => s.front),
    'each wall has its own front',
  );
  // at the protruding corner the fronts meet outside: the front of wall x = 2.95 − 0.5, the front of wall y = 1.55 + 0.5
  near(g.sides[1].front![1][0], 2.45);
  near(g.sides[1].front![1][1], 2.05);
  near(g.sides[2].front![0][0], 2.45);
  near(g.sides[2].front![0][1], 2.05);
});
test('kitchen: old straight cabinets become wall runs, base cabinets stop at the fridge, the strip goes around the corner', () => {
  const p: Plan = {...emptyPlan(), rooms: [structuredClone(box)]};
  // an old plan: wall cabinets as a rectangle at the bottom wall (back against it)
  const up: FurnitureItem = {
    id: 'u',
    model: 'kitchenWall',
    w: 2,
    d: 0.35,
    h: 0.7,
    rot: 0,
    x: 2,
    y: 0.05 + 0.175 + 0.003,
  };
  p.furniture.push(up);
  const g = runGeo(p, up)!;
  assert.ok(up.a && up.b, 'the ends come from the back side');
  assert.equal(g.sides.length, 1);
  near(g.len, 2, 0.01);
  // a fridge in the right corner at the bottom wall: base cabinets dropped to its left stop at it
  p.furniture = [
    {id: 'f', model: 'fridge', w: 0.6, d: 0.65, h: 1.85, rot: 0, x: 3.95 - 0.3, y: 0.05 + 0.325},
  ];
  const r = runAt(p, [1.5, 0.4], 2.4, 0.6, {z0: 0, z1: 0.9})!;
  near(r.L, 3.9 - 0.6, 0.02);
  // L-shaped wall cabinets: the strip under them is two segments meeting at the inner corner
  const f = {id: 'w', model: 'kitchenWall', d: 0.35, h: 0.7} as FurnitureItem; // runSet places it
  const R = ring(faceOf(box));
  runSet(p, f, p.rooms[0], R, ringProject(R, [2.95, 0])!.s, 1 + 1.5);
  const ln = runLines(runGeo(p, f)!, 0.35 - 0.06);
  assert.equal(ln.length, 2);
  near(ln[0][1][0], ln[1][0][0]);
  near(ln[0][1][1], ln[1][0][1]);
});
test('a wall split by points into short pieces is still one wall: base cabinets stop at its corners', () => {
  // the same 4×3 room, but every wall has points on it every 0.5 m (cuts and changes of thickness leave such points):
  // each edge is shorter than a cabinet is deep, and the cabinet used to take them for relief and go around the whole room
  const corners: Point[] = [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ];
  const polygon = corners.flatMap((a, i): Point[] => {
    const b = corners[(i + 1) % corners.length];
    const steps = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5);
    return Array.from({length: steps}, (_, k): Point => [
      a[0] + ((b[0] - a[0]) * k) / steps,
      a[1] + ((b[1] - a[1]) * k) / steps,
    ]);
  });
  const p: Plan = {...emptyPlan(), rooms: [{id: 'r', polygon}]};
  const r = runAt(p, [2, 2.5], 2.4, 0.6, {z0: 0, z1: 0.9})!;
  near(r.L, 3.9);
  // and with a 3 cm step in the middle of the top wall (a thicker piece of it): still one wall
  const stepped: Room = {
    id: 'r',
    polygon: [
      [0, 0],
      [4, 0],
      [4, 3],
      [2.3, 3],
      [2.3, 3.03],
      [1.7, 3.03],
      [1.7, 3],
      [0, 3],
    ],
  };
  p.rooms = [stepped];
  const s = runAt(p, [1, 2.5], 2.4, 0.6, {z0: 0, z1: 0.9})!;
  assert.ok(s.L < 4, `along the top wall only, not around a corner: ${s.L}`);
});
test('the room changed so that both ends of a cabinet fall on one corner: it keeps its length, does not vanish or go all around', () => {
  const p: Plan = {...emptyPlan(), rooms: [structuredClone(box)]};
  const R = ring(faceOf(box));
  const f = {id: 'k', model: 'kitchenBase', d: 0.6, h: 0.9} as FurnitureItem;
  // along the bottom wall from x = 0.5 to 2
  runSet(p, f, box, R, at(box, [0.5, 0]), 1.5);
  near(f.w, 1.5);
  // the room was cut: its left part with that stretch of wall is gone, both ends now project onto the corner at x = 2.5
  p.rooms[0].polygon = [
    [2.5, 0],
    [4, 0],
    [4, 3],
    [2.5, 3],
  ];
  // nudge an end onto the other side of the corner as rounding does: the length from the ends would be the whole room
  // (runSet gave the cabinet both its ends: the ! below)
  const a = f.a!;
  const ends: Point[] = [f.b!, [a[0] - 1e-9, a[1]], [a[0], a[1] + 1e-9]];
  for (const b of ends) {
    const g = runGeo(p, {...f, a: [a[0], a[1]], b})!;
    assert.ok(g, 'it is still there');
    near(g.L, 1.5);
  }
});
