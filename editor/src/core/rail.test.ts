// Railings in place of exterior walls (D-071): an open balcony or terrace — and glazed doors; glass railings (D-075).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan2d, wallsAt, area, pointIn, RAIL, KERB} from './geometry.ts';
import {insertVertex, splitRoom, setRail, wallInfo, emptyPlan} from './plan.ts';
import {readPlan} from './plan-file.ts';
import type {MultiPolygon, Plan, Point, WallPlan} from './types.ts';

const mpArea = (mp: MultiPolygon): number =>
  mp.reduce(
    (s, [o, ...h]) =>
      s + Math.abs(area(o.slice(0, -1))) - h.reduce((t, r) => t + Math.abs(area(r.slice(0, -1))), 0),
    0,
  );
const inMP = (p: Point, mp: MultiPolygon): boolean =>
  mp.some(([o, ...h]) => pointIn(p, o) && !h.some(r => pointIn(p, r)));
// A room and its balcony across a 30 cm wall; the balcony's three outer edges are railings.
const home = (rail: Array<number | null> | null = [null, RAIL, RAIL, RAIL]): Plan => ({
  ...emptyPlan(),
  rooms: [
    {
      id: 'k',
      name: 'Kitchen',
      polygon: [
        [0, 0],
        [5, 0],
        [5, 6],
        [0, 6],
      ],
    },
    {
      id: 'b',
      name: 'Balcony',
      polygon: [
        [0, 6.3],
        [5, 6.3],
        [5, 8],
        [0, 8],
      ],
      ...(rail ? {rail} : {}),
    },
  ],
});

test('a railing: the wall at that edge becomes a parapet as high as the railing; walls and parapets keep the same footprint', () => {
  const g = buildPlan2d(home().rooms, []);
  const g0 = buildPlan2d(home(null).rooms, []);
  const all = (g: WallPlan): number =>
    mpArea(g.interior[0].mp) +
    g.sides.reduce((s, x) => s + mpArea(x.bands[0].mp), 0) +
    (g.rails || []).reduce((s, b) => s + mpArea(b.mp), 0);
  assert.equal(g.rails.length, 1);
  assert.equal(g.rails[0].top, RAIL);
  assert.ok(Math.abs(all(g) - all(g0)) < 0.01, `${all(g)} vs ${all(g0)}`);
  // the balcony's far edge (y = 8): parapet, no wall in the plan's section at 1.2 m; the room's own walls are still there
  assert.ok(inMP([2.5, 8.1], g.rails[0].mp) && !inMP([2.5, 8.1], wallsAt(g)));
  assert.ok(inMP([2.5, -0.1], wallsAt(g)));
});

test("the balcony's outer corner is all railing; where a railing meets a wall that goes on, the wall keeps its corner", () => {
  const g = buildPlan2d(home().rooms, []);
  assert.ok(inMP([5.1, 8.1], g.rails[0].mp), 'outer corner: parapet, not a pillar');
  assert.ok(!inMP([5.1, 8.1], wallsAt(g)));
  const side = buildPlan2d(home([null, null, RAIL, null]).rooms, []); // only the far edge is a railing: the side walls keep full height
  assert.ok(inMP([5.1, 8.1], wallsAt(side)), 'the side wall keeps the corner');
  assert.ok(inMP([2.5, 8.1], side.rails[0].mp));
});

test('railings follow the corners: a new corner, a split room; setRail sets and clears every edge on that side', () => {
  const p = home();
  const b = p.rooms[1];
  insertVertex(p, b, 2, [2.5, 8]);
  assert.deepEqual(b.rail, [null, RAIL, RAIL, RAIL, RAIL]);
  const [big, small] = splitRoom(p, b, [2.5, 6.3], [2.5, 8])!; // the line splits the balcony
  assert.ok(big.rail!.filter(Boolean).length >= 2 && small.rail!.filter(Boolean).length >= 2);
  const q = home(null);
  const w = wallInfo(q, q.rooms[1], 2);
  assert.equal(w.rail, 0);
  setRail(q, w, RAIL);
  assert.equal(q.rooms[1].rail![2], RAIL);
  assert.equal(wallInfo(q, q.rooms[1], 2).rail, RAIL);
  setRail(q, wallInfo(q, q.rooms[1], 2), 0);
  assert.equal(q.rooms[1].rail, undefined);
});

test('the plan file keeps railings and glazed doors, and refuses bad ones', () => {
  const p = {
    ...home(),
    openings: [{id: 'o1', kind: 'door', a: [1, 6.15], b: [4, 6.15], glass: true, leaf: false}],
  };
  const back = readPlan(JSON.stringify(p));
  assert.deepEqual(back.rooms[1].rail, [null, RAIL, RAIL, RAIL]);
  assert.equal(back.openings[0].glass, true);
  assert.throws(() => readPlan(JSON.stringify({...p, rooms: [p.rooms[0], {...p.rooms[1], rail: ['high']}]})));
  assert.throws(() => readPlan(JSON.stringify({...p, openings: [{...p.openings[0], glass: 'yes'}]})));
});

test('a glass railing: the wall there goes down to a kerb, and a pane stands along the middle of the strip as high as the railing', () => {
  const p = home();
  p.rooms[1].railGlass = true;
  const g = buildPlan2d(p.rooms, []);
  assert.equal(g.rails.length, 1);
  assert.equal(g.rails[0].top, KERB);
  assert.ok(inMP([2.5, 8.1], g.rails[0].mp), 'the kerb fills the strip, so no gap in the floor');
  assert.equal(g.glassRails.length, 3);
  const far = g.glassRails.find(x => Math.abs(x.a[1] - x.b[1]) < 1e-6 && x.a[1] > 8);
  assert.ok(far && far.a[1] > 8 && far.a[1] < 8.3, 'the far pane stands in the wall strip, outside the room');
  assert.equal(far.top, RAIL);
  assert.equal(far.bottom, KERB);
  assert.equal(buildPlan2d(home().rooms, []).glassRails.length, 0, 'a parapet has no glass');
});

test('glass railings: kept by the plan file, stay glass when the room is split, go with the last railing', () => {
  const p = home();
  p.rooms[1].railGlass = true;
  assert.equal(readPlan(JSON.stringify(p)).rooms[1].railGlass, true);
  assert.throws(() =>
    readPlan(JSON.stringify({...p, rooms: [p.rooms[0], {...p.rooms[1], railGlass: 'yes'}]})),
  );
  const q = home();
  q.rooms[1].railGlass = true;
  const b = q.rooms[1];
  splitRoom(q, b, [2.5, 6.3], [2.5, 8]);
  assert.ok(
    q.rooms.filter(r => r.rail).every(r => r.railGlass),
    'both parts keep glass',
  );
  const s = home([null, null, RAIL, null]);
  s.rooms[1].railGlass = true;
  setRail(s, wallInfo(s, s.rooms[1], 2), 0);
  assert.equal(s.rooms[1].railGlass, undefined);
});
