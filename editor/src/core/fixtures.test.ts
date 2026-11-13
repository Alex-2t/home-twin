// @ts-nocheck
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pointIn, segDist, WALL} from './geometry.ts';
import {migrate} from './plan.ts';
import {
  guessForm,
  lampCell,
  cellEdges,
  spotsLayout,
  pendantLayout,
  ceilingLayout,
  clampRay,
  keepIn,
  stripContour,
  stripRuns,
  stripSegs,
  stripCut,
  stripFill,
  stripMove,
  stripProject,
  stripAt,
  defaultSpots,
  lineLayout,
  stripLayout,
  wallLayout,
  snapWall,
  lampSpot,
  placeForm,
  relayout,
  autoPlace,
  formFor,
  center,
  furnOpts,
  syncFurnStrips,
} from './fixtures.ts';

const room = (id, P, extra = {}) => ({id, name: id, polygon: P, ...extra});
const R = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
];
const flat = () =>
  migrate({
    rooms: [
      room('bed', R, {area: 'bedroom'}),
      room(
        'k',
        [
          [4.1, 0],
          [7, 0],
          [7, 3],
          [4.1, 3],
        ],
        {area: 'kitchen'},
      ),
    ],
    openings: [
      {kind: 'window', a: [2, 3], b: [3, 3]},
      {kind: 'door', a: [0, 0.2], b: [0, 1]},
    ],
  });

test('form is guessed from the name and HA hints', () => {
  const g = (name, x = {}) => guessForm({name, ...x});
  assert.equal(g('Ceiling light', {kind: 'point', h: 2.52}).form, 'ceiling');
  assert.equal(g('Pendant light', {kind: 'point', h: 2.52}).form, 'pendant');
  assert.deepEqual(g('Floor strip', {kind: 'strip', h: 0.1}), {form: 'strip', opt: 'floor'});
  assert.deepEqual(
    g('Worktop light', {kind: 'strip', h: 1.4}),
    {form: 'strip', opt: 'top'},
    'no under-cabinet option yet: ceiling',
  );
  assert.deepEqual(g('Бра над кроватью', {kind: 'point', h: 1.6}), {form: 'wall', opt: 'pair'}); // allow-cyrillic: Russian HA name, "sconce over the bed"
  assert.equal(g('Mirror', {kind: 'point', h: 1.6}).form, 'wall');
  assert.equal(g('Niche light', {kind: 'point', h: 1.6}).form, 'wall');
  // no hints: by words
  assert.equal(g('Living room spots').form, 'spots');
  assert.equal(g('Kitchen downlights').form, 'spots');
  assert.equal(g('Track light').form, 'line');
  assert.deepEqual(g('Floor lamp'), {form: 'lamp', opt: 'floor'});
  assert.deepEqual(g('Night light'), {form: 'lamp', opt: 'table'});
  assert.deepEqual(g('LED strip under bed'), {form: 'strip', opt: 'floor'});
  assert.deepEqual(g('Подсветка полки'), {form: 'strip', opt: 'top'}, '“shelf” is not “floor”'); // allow-cyrillic: Cyrillic word boundary, Russian "shelf" must not match the "floor" stem
  assert.equal(g('Собрание').form, 'ceiling', '“sconce” inside a word does not count'); // allow-cyrillic: the Russian "sconce" stem inside a word must not match
  assert.equal(g('light.0x00158d0001').form, 'ceiling');
});
test('a light’s cell is the room of its area or a part of a room', () => {
  const p = flat();
  assert.equal(lampCell(p, {area: 'kitchen'}).room.id, 'k');
  assert.equal(lampCell(p, {area: 'nope'}), null);
  const r = p.rooms[0];
  r.zone = {a: [3, 0], b: [3, 3], area: 'office', left: false};
  const z = lampCell(p, {area: 'office'}),
    m = lampCell(p, {area: 'bedroom'});
  assert.ok(z && m && z.poly !== m.poly, 'a room part has its own contour');
  assert.ok(
    cellEdges(z).every(e => !(Math.abs(e.a[0] - 3) < 1e-6 && Math.abs(e.b[0] - 3) < 1e-6)),
    'no wall on the boundary between parts',
  );
});
test('spots: grid, row, perimeter: the right count and inside the room', () => {
  for (const n of [1, 2, 4, 5, 6, 9])
    for (const lay of ['grid', 'row', 'ring']) {
      const pts = spotsLayout(R, n, lay);
      assert.equal(pts.length, n, `${lay} ${n}`);
      assert.ok(
        pts.every(q => pointIn(q, R)),
        `${lay} ${n} inside`,
      );
    }
  const g = spotsLayout(R, 6, 'grid');
  assert.equal(new Set(g.map(q => q[1])).size, 2, '6 in a 4×3 room: two rows of three');
  assert.equal(defaultSpots(R), 6, '12 m²: 6 spots');
  // L-shaped room: points do not go outside
  const Lsh = [
    [0, 0],
    [4, 0],
    [4, 1.5],
    [1.5, 1.5],
    [1.5, 4],
    [0, 4],
  ];
  assert.ok(spotsLayout(Lsh, 9).every(q => pointIn(q, Lsh)));
});
test('line, strip, sconce, floor lamp', () => {
  const p = flat(),
    cell = lampCell(p, {area: 'bedroom'});
  assert.deepEqual(lineLayout(R, 'along'), [
    [
      [0.6, 1.5],
      [3.4, 1.5],
    ],
  ]);
  assert.equal(lineLayout(R, 'frame').length, 4);
  // L-shaped corridor: the frame center is outside, yet the line is still inside, in the long part
  const H = [
    [3.26, 0],
    [7.74, 0],
    [7.74, 1.34],
    [8.29, 1.34],
    [8.29, 2.74],
    [6.44, 2.74],
    [6.44, 1.34],
    [3.26, 1.34],
  ];
  for (const pr of ['along', 'across'])
    for (const s of lineLayout(H, pr)) for (const q of s) assert.ok(pointIn(q, H), pr + ' inside');
  const [a, b] = lineLayout(H, 'along')[0];
  assert.ok(b[0] - a[0] > 3, 'along the whole corridor');
  // eight pendants in a corridor: none on a wall
  const wallD = q => Math.min(...H.map((a, i) => segDist(q, a, H[(i + 1) % H.length])[0]));
  for (const q of pendantLayout(H, 8, [6.6, 1.6]))
    assert.ok(pointIn(q, H) && wallD(q) >= 0.149, 'pendant not at a wall ' + q);
  // dragging: a line end does not pass through a wall, a body does not go into a wall, a strip end does not go past its wall's corner
  const q = clampRay(H, [4, 0.7], [12, 0.7]);
  assert.ok(pointIn(q, H) && q[0] < 7.74, 'line up to the wall ' + q);
  assert.deepEqual(clampRay(R, [1, 1], [2, 2]), [2, 2], 'inside: as is');
  assert.ok(wallD(keepIn(H, [7.74, 0.5], 0.22)) >= 0.219, 'floor lamp not in the wall');
  // two ceiling lights in a 4×3 room: at 1 and 3 m along the long side; in an L-shaped corridor: inside and not at a wall
  assert.deepEqual(ceilingLayout(R, 2), [
    [1, 1.5],
    [3, 1.5],
  ]);
  assert.deepEqual(ceilingLayout(R, 1), [[2, 1.5]]);
  for (const n of [2, 3, 6])
    for (const q of ceilingLayout(H, n))
      assert.ok(pointIn(q, H) && wallD(q) >= 0.149, 'ceiling light ' + n + ' ' + q);
  {
    const sg = stripLayout(p, cell, 'top', 'Accent light');
    assert.equal(sg.length, 1, 'one wall');
    const l = Math.hypot(sg[0][1][0] - sg[0][0][0], sg[0][1][1] - sg[0][0][1]);
    assert.ok(
      cellEdges(cell).every(e => e.l <= l + 2 * WALL.inner + 0.07),
      'the longest ' + l,
    );
  }
  assert.equal(
    stripLayout(p, cell, 'top', 'Curtain light').length,
    1,
    'for curtains: the wall with a window',
  );
  {
    // the bottom wall was removed (open passage): the strip does not run there, neither at the floor nor at the ceiling
    const r = room('k', R, {wt: [0]}),
      pl = {rooms: [r], openings: []},
      c = {room: r, poly: R, ch: null};
    for (const opt of ['top', 'floor']) {
      const K = stripContour(pl, c, opt),
        segs = stripSegs(K, {runs: [], closed: true});
      assert.ok(
        segs.length && segs.every(([a, b]) => a[1] > 0.1 || b[1] > 0.1),
        opt + ': not along the passage',
      );
    }
    const one = stripLayout(pl, c, 'top', 'Accent light');
    assert.ok(
      one.every(([a, b]) => a[1] > 2.5 && b[1] > 2.5),
      'the longest wall is not the passage',
    );
  }
  const w = wallLayout(p, cell, 2);
  assert.equal(w.length, 2);
  assert.ok(
    w.every(q => q[1] < 0.2),
    'a pair of sconces on the long wall without a window',
  );
  assert.ok(Math.abs(w[1][0] - w[0][0] - 1.6) < 1e-6, '1.6 m apart');
  assert.equal(wallLayout(p, cell, 5).length, 5);
  assert.deepEqual(snapWall(R, [2, 2.9]), [2, 2.87]);
  const lamp = lampSpot(p, cell);
  assert.ok(lamp[0] > 3, 'floor lamp in the corner away from the door');
});
test('place a form, relayout, a strip piece, old plans', () => {
  const p = flat(),
    L = {id: 'x', name: 'Spots', area: 'bedroom', points: [], segments: []},
    cell = lampCell(p, L);
  assert.ok(placeForm(p, L, 'spots', 'grid', cell));
  assert.equal(L.kind, 'point');
  assert.equal(L.points.length, L.count);
  assert.equal(L.room, 'bed');
  L.count = 6;
  L.opt = 'ring';
  relayout(p, L, cell);
  assert.equal(L.points.length, 6);
  placeForm(p, L, 'strip', 'top', cell);
  assert.equal(L.kind, 'strip');
  assert.equal(L.segments.length, 1);
  assert.equal(L.count, undefined);
  assert.equal(formFor({kind: 'point', h: 2.52}), 'ceiling');
  assert.equal(formFor({kind: 'point', h: 1.6}), 'wall');
  assert.deepEqual(center(R), [2, 1.5]);
});
test('auto-place: by guess, lights without a room stay unplaced', () => {
  const p = flat();
  p.lights = [
    {id: 'a', name: 'Ceiling light', area: 'bedroom', kind: 'point', h: 2.52, points: [], segments: []},
    {id: 'b', name: 'Worktop light', area: 'kitchen', kind: 'strip', h: 1.4, points: [], segments: []},
    {id: 'c', name: 'Somewhere', area: 'garage', points: [], segments: []},
  ];
  assert.equal(autoPlace(p), 2);
  assert.equal(p.lights[0].form, 'ceiling');
  assert.equal(p.lights[1].h, 2.5);
  assert.ok(!p.lights[2].placed);
});
test('strip is continuous along the contour: corners without breaks, doors at the floor, split, merge, ends', () => {
  const p = flat(),
    cell = lampCell(p, {area: 'bedroom'}),
    join = segs =>
      segs.every(
        (s, i) => i === 0 || Math.hypot(s[0][0] - segs[i - 1][1][0], s[0][1] - segs[i - 1][1][1]) < 1e-6,
      );
  // at the ceiling: the whole contour, segments join at corners, length equals the contour perimeter
  const T = stripContour(p, cell, 'top'),
    top = stripSegs(T, {runs: [], closed: true}),
    L = s => s.reduce((a, [x, y]) => a + Math.hypot(y[0] - x[0], y[1] - x[1]), 0);
  assert.ok(join(top) && Math.abs(L(top) - T.per) < 1e-6, 'continuous ' + L(top) + ' ' + T.per);
  assert.ok(stripRuns(T, top).closed, 'whole contour: closed');
  // at the floor: a door on the left wall (0.2…1) is a break; the strip runs up to the frame and continues after it
  const F = stripContour(p, cell, 'floor'),
    fl = stripSegs(F, {runs: [], closed: true});
  assert.equal(fl.length, 5, 'the door splits one wall in two');
  assert.ok(L(fl) < F.per - 0.79 && L(fl) > F.per - 0.91, 'without the door ~0.9 m ' + (F.per - L(fl)));
  assert.ok(stripRuns(F, fl).closed, 'a door is not a run break');
  // L-shaped room: a protrusion without breaks
  const H = [
      [0, 0],
      [4, 0],
      [4, 1.5],
      [1.5, 1.5],
      [1.5, 4],
      [0, 4],
    ],
    HC = {room: {id: 'h'}, poly: H, ch: null},
    HK = stripContour({rooms: [], openings: []}, HC, 'top'),
    hs = stripSegs(HK, {runs: [], closed: true});
  assert.equal(hs.length, 6);
  assert.ok(join(hs));
  // split and merge
  const st0 = {runs: [], closed: true},
    c1 = stripCut(T, st0, 1);
  assert.ok(
    !c1.closed && c1.runs.length === 1 && Math.abs(c1.runs[0][1] - c1.runs[0][0] - (T.per - 0.5)) < 1e-6,
    '50 cm split',
  );
  const c2 = stripCut(T, c1, 5);
  assert.equal(c2.runs.length, 2);
  const f1 = stripFill(T, c2, 5);
  assert.equal(f1.runs.length, 1, 'break closed');
  assert.ok(stripFill(T, f1, 1).closed, 'and the last one: continuous again');
  // a run end: around a corner, no shorter than 15 cm, no further than the neighbor
  const m1 = stripMove(T, c1, 0, 1, c1.runs[0][1] + 3);
  assert.ok(m1.runs[0][1] <= c1.runs[0][0] + T.per + 1e-9, 'no further than its own start');
  const m2 = stripMove(T, c1, 0, 0, c1.runs[0][1]);
  assert.ok(m2.runs[0][1] - m2.runs[0][0] >= 0.15 - 1e-9);
  // from segments: the same runs
  // a split at the ceiling above a door does not rejoin on the next split
  const dz = stripProject(T, [0, 0.6]).s,
    d1 = stripCut(T, {runs: [], closed: true}, dz),
    d2 = stripCut(T, stripRuns(T, stripSegs(T, d1)), dz + 5);
  assert.equal(stripRuns(T, stripSegs(T, d2)).runs.length, 2, 'the break above the door remains');
  const back = stripRuns(T, stripSegs(T, c2));
  assert.equal(back.runs.length, 2);
  assert.ok(Math.abs(back.runs[0][0] - c2.runs[0][0]) < 1e-3);
  // an old strip in pieces along the walls (10 cm from corners): one closed run
  const old = cellEdges(cell).map(e => [
    [e.a[0] + e.u[0] * 0.1 + e.n[0] * 0.08, e.a[1] + e.u[1] * 0.1 + e.n[1] * 0.08],
    [e.a[0] + e.u[0] * (e.l - 0.1) + e.n[0] * 0.08, e.a[1] + e.u[1] * (e.l - 0.1) + e.n[1] * 0.08],
  ]);
  assert.ok(stripRuns(T, old).closed, 'old pieces: continuous');
});

test('strip on furniture: by name, moves with the furniture, without furniture back at the wall', () => {
  const plan = flat();
  plan.lights = [];
  plan.furniture = [
    {id: 'b', model: 'kitchenBase', w: 2, d: 0.6, h: 0.9, rot: 0, x: 5.5, y: 2.68},
    {id: 'u', model: 'kitchenWall', w: 2, d: 0.35, h: 0.7, rot: 0, x: 5.5, y: 2.8},
  ];
  const L = {id: 'w', name: 'Worktop light', area: 'kitchen', points: [], segments: []},
    cell = lampCell(plan, L);
  plan.lights.push(L);
  assert.deepEqual(furnOpts(plan, cell), ['plinth', 'under']);
  placeForm(plan, L, 'strip', 'top', cell);
  assert.equal(L.opt, 'under');
  assert.equal(L.h, 1.44);
  assert.equal(L.segments.length, 1);
  const [a, b] = L.segments[0];
  assert.ok(
    Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - 1.96) < 1e-6,
    'across the full width of the cabinets',
  );
  {
    const u = plan.furniture[1];
    u.a = [u.a[0] + 0.3, u.a[1]];
    u.b = [u.b[0] + 0.3, u.b[1]];
  }
  assert.ok(syncFurnStrips(plan)); // wall cabinets are placed along walls: their ends are moved
  assert.ok(Math.abs(L.segments[0][0][0] - a[0] - 0.3) < 1e-6, 'cabinet moved: the strip follows');
  relayout(plan, L, cell, 'under');
  L.opt = 'plinth';
  relayout(plan, L, cell, 'under');
  assert.equal(L.h, 0.04, 'toe kick');
  plan.furniture = [];
  syncFurnStrips(plan);
  assert.equal(L.opt, 'floor', 'kitchen removed: at the floor');
  assert.ok(L.segments.length > 0);
  plan.furniture = [{id: 'b', model: 'kitchenBase', w: 2, d: 0.6, h: 0.9, rot: 0, x: 5.5, y: 2.68}];
  const F = {id: 'f', name: 'Floor strip', area: 'kitchen', points: [], segments: []};
  plan.lights.push(F);
  placeForm(plan, F, 'strip', 'floor', cell);
  assert.equal(F.opt, 'plinth', 'at the floor with base cabinets: toe kick');
  plan.furniture.push(
    {id: 'c', model: 'kitchenCorner', w: 1, d: 1, h: 0.9, rot: 0, x: 4.7, y: 1},
    {id: 's', model: 'kitchenSink', w: 0.6, d: 0.6, h: 0.9, rot: 0, x: 6.8, y: 2.68},
  );
  syncFurnStrips(plan);
  assert.equal(
    F.segments.length,
    4,
    'the toe kick also runs under the sink; for the corner unit, along both arms',
  );
  plan.furniture.splice(1, 2);
  syncFurnStrips(plan);
  F.opt = 'floor';
  relayout(plan, F, cell, 'plinth');
  assert.equal(F.opt, 'floor', '“Floor” chosen manually: at the wall');
  syncFurnStrips(plan);
  assert.equal(F.opt, 'floor');
  plan.furniture = [];
  const P = {id: 'p', name: 'Worktop light', area: 'kitchen', points: [], segments: []};
  placeForm(plan, P, 'strip', 'top', cell);
  assert.equal(P.opt, 'top', 'without cabinets: as before');
});
test('lighting with furniture: ceiling light and pendants above the table, spots not above a wardrobe, sconces at the headboard, floor lamp by the sofa', () => {
  const R = [
      [0, 0],
      [5, 0],
      [5, 4],
      [0, 4],
    ],
    mk = furniture => migrate({rooms: [room('r', R, {area: 'living'})], furniture}),
    cellOf = p => ({room: p.rooms[0], poly: p.rooms[0].polygon, ch: null});
  const lamp = (extra = {}) => ({id: 'l', name: 'Lamp', area: 'living', points: [], segments: [], ...extra});
  // a 1.6×0.9 table by the window, long side along x
  let p = mk([{id: 't', model: 'diningTable', w: 1.6, d: 0.9, h: 0.75, rot: 0, x: 3.5, y: 1.2}]),
    c = cellOf(p),
    L = lamp();
  placeForm(p, L, 'ceiling', null, c);
  assert.deepEqual(L.points, [[3.5, 1.2]], 'ceiling light above the table');
  placeForm(p, L, 'pendant', null, c);
  L.count = 3;
  relayout(p, L, c);
  assert.equal(L.points.length, 3);
  assert.ok(
    L.points.every(q => Math.abs(q[1] - 1.2) < 1e-6 && Math.abs(q[0] - 3.5) <= 0.651),
    'three pendants in a row along the table, no wider than it',
  );
  // a wardrobe along the whole left wall: spots and ceiling lights over the free part
  p = mk([{id: 'w', model: 'wardrobe', w: 4, d: 0.6, h: 2.4, rot: 90, x: 0.05 + 0.3, y: 2}]);
  c = cellOf(p);
  L = lamp();
  placeForm(p, L, 'spots', 'grid', c);
  assert.ok(
    L.points.length > 1 && L.points.every(q => q[0] > 0.65 + 0.05),
    'not a single spot above the wardrobe',
  );
  placeForm(p, L, 'ceiling', null, c);
  assert.ok(L.points[0][0] > 2.6, 'ceiling light in the center of the free part, right of the room center');
  // a bed with its headboard to the top wall: a pair of sconces on both sides, on that wall
  p = mk([{id: 'b', model: 'bed', w: 1.6, d: 2.1, h: 0.9, rot: 0, x: 2.5, y: 4 - 0.05 - 1.05}]);
  c = cellOf(p);
  L = lamp();
  placeForm(p, L, 'wall', 'pair', c);
  assert.equal(L.points.length, 2);
  assert.ok(
    L.points.every(q => q[1] > 3.8),
    'on the wall behind the headboard',
  );
  assert.ok(
    Math.abs(Math.abs(L.points[0][0] - L.points[1][0]) - (1.6 + 0.5)) < 0.02,
    'on both sides of the bed',
  );
  // sofa: a floor lamp beside it
  p = mk([{id: 's', model: 'loungeSofa', w: 2.1, d: 0.95, h: 0.8, rot: 180, x: 2.5, y: 0.05 + 0.475}]);
  c = cellOf(p);
  L = lamp();
  placeForm(p, L, 'lamp', 'floor', c);
  const q = L.points[0];
  assert.ok(Math.abs(Math.abs(q[0] - 2.5) - (1.05 + 0.28)) < 0.02 && q[1] < 1, 'floor lamp at the sofa edge');
});

test('auto-place by the furniture: sconces by name, a table lamp on a nightstand, a mirror light above the mirror, clear of doors (homes check, D-061)', () => {
  assert.deepEqual(
    guessForm({name: 'Bedside sconces', kind: 'point', h: 1.6}),
    {form: 'wall', opt: 'pair'},
    'a sconce by name, not a table lamp',
  );
  const p = flat(),
    cell = lampCell(p, {area: 'bedroom'});
  p.furniture.push(
    {id: 'n', model: 'nightstand', x: 3.78, y: 1.5, rot: 270, w: 0.5, d: 0.4, h: 0.5},
    {id: 'm', model: 'wallMirror', x: 1, y: 0.015, rot: 180, w: 0.6, d: 0.03, h: 0.9},
  );
  const T = {id: 't', name: 'Bedside lamp', kind: 'point', area: 'bedroom'};
  assert.ok(placeForm(p, T, 'lamp', 'table', cell));
  assert.ok(
    Math.abs(T.points[0][0] - 3.78) < 0.01 && Math.abs(T.points[0][1] - 1.5) < 0.01,
    'on the nightstand',
  );
  assert.equal(T.h, 0.92, 'its base on the top');
  const M = {id: 'm1', name: 'Mirror light', kind: 'point', area: 'bedroom'};
  assert.ok(placeForm(p, M, 'wall', 'one', cell));
  assert.ok(Math.abs(M.points[0][0] - 1) < 0.01 && M.points[0][1] < 0.2, 'on the wall above the mirror');
  assert.equal(M.h, 2.08);
  // a 0.8 m door in the middle of the long wall without a window: the sconce goes to a clear wall
  const q = flat();
  q.openings.push(
    ...migrate({rooms: q.rooms, openings: [{kind: 'door', a: [1.6, 0], b: [2.4, 0]}]}).openings,
  );
  const [s] = wallLayout(q, lampCell(q, {area: 'bedroom'}), 1);
  assert.ok(!(s[1] < 0.2 && Math.abs(s[0] - 2) < 0.55), 'not in the doorway');
  assert.ok(s[0] > 3.8, 'on the wall with the longest clear stretch');
  // a wardrobe along that wall: the sconce goes beside it, not into it
  q.furniture.push({id: 'w', model: 'wardrobe', x: 3.7, y: 1.6, rot: 270, w: 2, d: 0.6, h: 2.2});
  const [s2] = wallLayout(q, lampCell(q, {area: 'bedroom'}), 1);
  assert.ok(!(s2[0] > 3.3 && s2[1] > 0.5 && s2[1] < 2.7), 'not inside the wardrobe');
  // the floor lamp's corner is taken by a sofa: another spot, not inside the sofa
  const r = flat(),
    c = lampCell(r, {area: 'bedroom'}),
    was = lampSpot(r, c);
  r.furniture.push({
    id: 's',
    model: 'loungeSofa',
    x: was[0] - 0.3,
    y: was[1] - 0.2,
    rot: 0,
    w: 1.6,
    d: 0.9,
    h: 0.85,
  });
  const now = lampSpot(r, c),
    [sx, sy] = [r.furniture[0].x, r.furniture[0].y];
  assert.ok(!(Math.abs(now[0] - sx) < 0.8 + 0.12 && Math.abs(now[1] - sy) < 0.45 + 0.12), 'outside the sofa');
});
