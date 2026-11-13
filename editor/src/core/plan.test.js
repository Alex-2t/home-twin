import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  validate,
  buildPlan2d,
  openingCoords,
  openingOut,
  wallsAt,
  area,
  labelPoint,
  pointIn as inside,
  segDist as sdist,
} from './geometry.js';
import {
  migrate,
  linkedEdges,
  moveEdges,
  snapshot,
  setEdgeLength,
  addRoom,
  wallInfo,
  setWallThickness,
  setWallOpen,
  settleRoom,
  rotatePlan,
  cutChord,
  splitRoom,
  addCorner,
  mergeRooms,
  scalePlan,
  wallAt,
  absorbRoom,
  closeOuterOpen,
  zoneParts,
  setZone,
  moveZone,
  zoneFromEdge,
  addOpening,
  setOpeningWidth,
  openingGap,
  turnDoor,
  addRoom as add2,
} from './plan.js';
import {checkItem} from './parts.js';
import {
  snapToWall,
  furnitureConflicts,
  setRoomArea,
  autoPlaceLights,
  footRects,
  stackOf,
  snapLightPoint,
  tuck,
} from './layout.js';
import {sideWall, roomWall, bakeFinish, WALL_KINDS} from './surfaces.js';

// Two rooms with a 10 cm wall and a door between them.
const two = () =>
  migrate({
    rooms: [
      {
        id: 'a',
        name: 'A',
        polygon: [
          [0, 0],
          [3, 0],
          [3, 4],
          [0, 4],
        ],
      },
      {
        id: 'b',
        name: 'B',
        polygon: [
          [3.1, 0],
          [6, 0],
          [6, 4],
          [3.1, 4],
        ],
      },
    ],
    openings: [{kind: 'door', a: [3.05, 1], b: [3.05, 1.8]}],
  });

test('the plan passes validation and builds walls', () => {
  const p = two();
  assert.deepEqual(validate(p.rooms), []);
  assert.equal(p.openings.length, 1);
  assert.ok(p.openings[0].at, 'the door is attached to a wall');
  const g = buildPlan2d(
    p.rooms,
    p.openings.map(o => openingCoords(p.rooms, o)),
  );
  assert.ok(g.footprint.length && g.interior.length);
});
test('room overlap is reported', () => {
  const p = two();
  p.rooms[1].polygon[0] = [2.5, 0];
  p.rooms[1].polygon[3] = [2.5, 4];
  assert.match(validate(p.rooms)[0].text, /overlaps/);
});
test('a shared wall moves in both rooms', () => {
  const p = two(),
    a = p.rooms[0],
    edges = [[a, 1], ...linkedEdges(p, a, 1)];
  assert.equal(edges.length, 2);
  moveEdges(edges, snapshot(p), [1, 0], 0.5);
  assert.equal(a.polygon[1][0], 3.5);
  assert.equal(p.rooms[1].polygon[0][0], 3.6);
});
test('edge length keeps the right angle', () => {
  const p = two(),
    a = p.rooms[0];
  setEdgeLength(p, a, 0, 2.5);
  assert.equal(a.polygon[1][0], 2.5);
  assert.equal(a.polygon[2][0], 2.5);
});
test('furniture snaps back-first to a wall and detects overlap', () => {
  const p = two(),
    f = {id: 'w', model: 'wardrobe', w: 2, d: 0.6, h: 2.4, rot: 0, x: 0, y: 0};
  Object.assign(f, snapToWall(p, f, [1.5, 0.4]));
  assert.equal(f.rot, 180);
  assert.ok(Math.abs(f.y - 0.353) < 0.01);
  p.furniture.push(f, {...f, id: 'w2', x: f.x + 0.5});
  assert.match(furnitureConflicts(p).get('w2'), /overlaps/);
});
test('a chair from parts at a table from parts is tucked under it when both say so, as catalog ones are', () => {
  const box = (w, d, h) => ({
    w,
    d,
    h,
    materials: {m: {color: '#777777'}},
    parts: [{kind: 'box', mat: 'm', size: [w, h, d], at: [0, 0, 0]}],
  });
  const p = two(),
    table = {id: 't', model: 'parts', w: 1, d: 1, h: 0.75, rot: 0, x: 1.5, y: 1.5, parts: box(1, 1, 0.75)},
    chair = {
      id: 'c',
      model: 'parts',
      w: 0.5,
      d: 0.5,
      h: 0.85,
      rot: 0,
      x: 1.5,
      y: 1.05,
      parts: box(0.5, 0.5, 0.85),
    };
  p.furniture.push(table, chair);
  assert.match(furnitureConflicts(p).get('c'), /overlaps/, 'without a word: overlapping');
  table.parts.table = true;
  chair.parts.under = 0.48;
  assert.equal(furnitureConflicts(p).size, 0, 'a seat at 0.48 m under a 0.75 m top: tucked');
  chair.parts.under = 0.8;
  assert.match(furnitureConflicts(p).get('c'), /overlaps/, 'arms higher than the top: overlapping');
  assert.deepEqual(checkItem({...box(1, 1, 0.75), table: 'high'}), [
    'table must be true or a height in meters',
  ]);
});
test('a radiator under the window goes under the top of a table standing at it; one reaching above the top does not', () => {
  const p = two(),
    table = {id: 't', model: 'diningTable', w: 1.2, d: 0.8, h: 0.75, rot: 0, x: 1.5, y: 0.6},
    radiator = {id: 'r', model: 'radiator', w: 1, d: 0.1, h: 0.5, rot: 0, x: 1.5, y: 0.3};
  p.furniture.push(table, radiator);
  assert.equal(furnitureConflicts(p).size, 0, 'its top at 0.62 m under a 0.75 m top: tucked');
  radiator.h = 0.7;
  assert.match(furnitureConflicts(p).get('r'), /overlaps/, 'its top at 0.82 m: overlapping');
  assert.equal(tuck(radiator, {...table, h: 0.9}), true, 'under a higher top');
});
test('furniture at a wall: snaps to the corner and the middle within snap (depends on zoom)', () => {
  const p = two(),
    b = {id: 'b', model: 'bed', w: 1.6, d: 2.1, h: 1, rot: 0, x: 0, y: 0},
    at = (x, snap) => snapToWall(p, b, [x, 0.4], false, snap),
    lo = at(1, 0.25).x;
  assert.equal(at(lo + 0.15, 0.25).x, lo, 'zoomed out: pulled into the corner, as before');
  assert.ok(Math.abs(at(lo + 0.15, 0.03).x - lo - 0.15) < 0.026, 'zoomed in: stays where it was put');
  const c = at(1.6, 0.25);
  assert.ok(c.mid && Math.abs(c.x - 1.5) < 1e-3, 'near the middle of the wall: centered');
  assert.ok(!at(1.6, 0.03).mid);
});
test('kitchen modules: flush with a neighbor along the wall; a wall-hung one conflicts only if it overlaps in height too', () => {
  const p = two(),
    a = {id: 'a', model: 'kitchenBase', w: 1.2, d: 0.6, h: 0.9, rot: 0, x: 0, y: 0};
  Object.assign(a, snapToWall(p, a, [1.2, 0.4], false, 0.03));
  p.furniture.push(a);
  const s = {id: 's', model: 'kitchenSink', w: 0.6, d: 0.6, h: 0.9, rot: 0, x: 0, y: 0},
    r = snapToWall(p, s, [a.x + 0.92, 0.4], false, 0.05);
  assert.ok(Math.abs(r.x - (a.x + 0.9)) < 0.004 && r.edge, 'snaps flush on the right');
  const tall = {id: 't', model: 'fridge', w: 0.6, d: 0.65, h: 1.85, rot: 0, x: a.x, y: a.y},
    up = {id: 'u', model: 'kitchenWall', w: 1.2, d: 0.35, h: 0.7, rot: 0, x: a.x, y: a.y};
  p.furniture.push(up);
  assert.ok(!furnitureConflicts(p).has('u'), 'wall cabinets above base cabinets are fine');
  p.furniture = [tall, up];
  assert.ok(furnitureConflicts(p).has('u'), 'wall cabinets below the top of the fridge overlap');
  up.z = 1.9;
  assert.ok(!furnitureConflicts(p).has('u'), 'raised above the fridge: fine');
});
test('corner sofa is L-shaped on the plan: a table in the recess does not overlap; curtains at a window are centered and conflict with nothing', () => {
  const p = migrate({
    rooms: [
      {
        id: 'r',
        name: 'R',
        polygon: [
          [0, 0],
          [5, 0],
          [5, 4],
          [0, 4],
        ],
      },
    ],
    openings: [{kind: 'window', a: [1.5, 4], b: [3.5, 4]}],
  });
  const sc = {id: 's', model: 'sofaCorner', w: 2.7, d: 1.65, h: 0.85, rot: 0, x: 2, y: 1.2},
    tc = {id: 't', model: 'tableCoffee', w: 0.8, d: 0.5, h: 0.42, rot: 0, x: 2.6, y: 0.8};
  assert.equal(footRects(sc).length, 2);
  p.furniture = [sc, tc];
  assert.equal(furnitureConflicts(p).size, 0, 'the recess is free');
  tc.x = 1;
  assert.ok(furnitureConflicts(p).has('t'), 'on the chaise: overlaps');
  sc.mx = true;
  assert.ok(!furnitureConflicts(p).has('t'), 'mirrored: the chaise is on the right');
  const cu = {id: 'c', model: 'curtains', w: 2, d: 0.14, h: 2.55, rot: 0, x: 0, y: 0},
    r = snapToWall(p, cu, [2.55, 3.8], false, 0.1);
  assert.ok(
    Math.abs(r.x - 2.5) < 1e-3 && Math.abs(r.win - 2) < 1e-6,
    'centered on the window, the window width is known',
  );
  Object.assign(cu, r);
  p.furniture = [cu, {id: 'b', model: 'bed', w: 1.6, d: 2.1, h: 1, rot: 180, x: 2.5, y: 2.9}];
  assert.ok(
    !furnitureConflicts(p).has('c') && !furnitureConflicts(p).has('b'),
    'a bed by a window with curtains is fine',
  );
});
test('U-shaped sofa: three arms, the table inside is free; a rug under furniture does not conflict', () => {
  const p = migrate({
    rooms: [
      {
        id: 'r',
        name: 'R',
        polygon: [
          [0, 0],
          [6, 0],
          [6, 5],
          [0, 5],
        ],
      },
    ],
    openings: [],
  });
  const u = {id: 'u', model: 'sofaU', w: 3.4, d: 1.7, h: 0.85, rot: 0, x: 3, y: 1.2},
    t = {id: 't', model: 'tableCoffee', w: 1, d: 0.55, h: 0.42, rot: 0, x: 3, y: 0.8};
  assert.equal(footRects(u).length, 3);
  p.furniture = [u, t, {id: 'g', model: 'rug', w: 2.5, d: 2, h: 0.012, rot: 0, x: 3, y: 1.5}];
  assert.equal(furnitureConflicts(p).size, 0);
  t.x = 1.6;
  assert.ok(furnitureConflicts(p).has('t'), 'on the left chaise: overlaps');
});
test('door: conflicts only on the leaf side; an air conditioner above the door does not', () => {
  const p = two(),
    F = (id, model, x, o = {}) => ({id, model, w: 0.5, d: 0.4, h: 0.5, rot: 0, x, y: 1.4, ...o});
  p.furniture = [F('l', 'nightstand', 2.5), F('r', 'nightstand', 3.6)];
  const c = furnitureConflicts(p);
  assert.equal(
    [c.has('l'), c.has('r')].filter(Boolean).length,
    1,
    '45 cm from the door it conflicts on one side only',
  );
  p.furniture = [F('a', 'aircon', 2.84, {w: 0.8, d: 0.22, h: 0.29, z: 2.15, rot: 270})];
  assert.ok(!furnitureConflicts(p).has('a'));
});
test('wall finish: by name, per room, per edge; the edge follows corners and splits; edge map', () => {
  const p = two(),
    [a, b] = p.rooms;
  b.name = 'Bathroom';
  assert.equal(roomWall(a).k, 'paintWarm');
  assert.equal(roomWall(b).k, 'tileWhite', 'bathroom: tiles');
  a.wall = 'paintSage';
  a.wf = a.polygon.map((_, i) => (i === 2 ? {k: 'brickRed'} : null));
  assert.equal(sideWall(a, 0).k, 'paintSage');
  assert.ok(sideWall(a, 2).own && sideWall(a, 2).k === 'brickRed');
  addCorner(p, a, 0, 0.5);
  assert.equal(a.wf.length, a.polygon.length);
  assert.equal(a.wf[4]?.k, 'brickRed', 'brick stays on the same edge after a new corner');
  const f = bakeFinish(p.rooms),
    [x0, y0, sx, sy] = f.box,
    W = f.tex.image.width,
    at = (x, y) =>
      f.tex.image.data[
        (Math.floor((y - y0) * sy * f.tex.image.height) * W + Math.floor((x - x0) * sx * W)) * 4
      ],
    tab = f.tab.image.data;
  const stacks = f.stk.image.data,
    col = stack => {
      const id = stacks[stack * 4];
      return [tab[id * 4], tab[id * 4 + 1], tab[id * 4 + 2]].join(',');
    }; // the stack's lowest finish
  assert.equal(
    col(at(1.5, 4 - 0.14)),
    WALL_KINDS.brickRed.base.join(','),
    'brick along the top wall of room A',
  );
  assert.equal(col(at(1.5, 0.14)), WALL_KINDS.paintSage.base.join(','), 'sage along the bottom one');
  assert.equal(col(at(4.5, 0.14)), WALL_KINDS.tileWhite.base.join(','), 'tiles in the bathroom');
  assert.equal(at(1.5, 2), 0, 'no finish in the middle of the room');
});
test('under a desk: a chair and a mobile pedestal slide in, a monitor stands on the desk, a loft bed goes above the desk', () => {
  const p = two(),
    desk = {id: 'd', model: 'desk', w: 1.2, d: 0.6, h: 0.75, rot: 0, x: 1.5, y: 0.4},
    F = (id, model, w, d, h, x, y, o = {}) => ({id, model, w, d, h, rot: 0, x, y, ...o});
  p.furniture = [
    desk,
    F('c', 'chairDesk', 0.62, 0.62, 1.05, 1.3, 0.6),
    F('t', 'pedestal', 0.4, 0.5, 0.58, 1.95, 0.4),
    F('m', 'monitor', 0.62, 0.2, 0.45, 1.3, 0.2),
  ];
  assert.equal(furnitureConflicts(p).size, 0, 'chair and pedestal under the desk, monitor on the desk');
  p.furniture = [desk, F('w', 'dresser', 0.6, 0.45, 0.85, 1.5, 0.5)];
  assert.ok(furnitureConflicts(p).has('w'), 'a dresser does not slide under a desk');
  p.furniture = [desk, F('l', 'loftBed', 2.05, 1, 0.55, 1.1, 0.6)];
  assert.ok(!furnitureConflicts(p).has('l'), 'loft bed above the desk');
});
test('a new room is counterclockwise', () => {
  const p = two(),
    r = addRoom(p, [
      [0, 5],
      [0, 8],
      [3, 8],
      [3, 5],
    ]);
  assert.equal(r.polygon[1][0], 3);
});

// ---------- wall thickness ----------
const mpA = mp =>
  mp.reduce(
    (s, [o, ...h]) =>
      s + Math.abs(area(o.slice(0, -1))) - h.reduce((t, r) => t + Math.abs(area(r.slice(0, -1))), 0),
    0,
  );
const pair = () => {
  const p = {rooms: [], openings: [], furniture: [], lights: []};
  add2(p, [
    [0, 0],
    [3, 0],
    [3, 3],
    [0, 3],
  ]);
  add2(p, [
    [3, 0],
    [6, 0],
    [6, 3],
    [3, 3],
  ]);
  return p;
};
test('shared wall: 10 cm when flush, a 20 cm thickness pushes both rooms apart equally', () => {
  const p = pair(),
    A = p.rooms[0],
    i = A.polygon.findIndex((v, k) => v[0] === 3 && A.polygon[(k + 1) % 4][0] === 3);
  const w = wallInfo(p, A, i);
  assert.equal(w.interior, true);
  assert.ok(Math.abs(w.t - 0.1) < 1e-6);
  setWallThickness(p, w, 0.2);
  const w2 = wallInfo(p, A, i);
  assert.ok(Math.abs(w2.t - 0.2) < 1e-6, w2.t);
  assert.ok(Math.abs(Math.max(...A.polygon.map(v => v[0])) - 2.95) < 1e-6);
  assert.ok(Math.abs(Math.min(...p.rooms[1].polygon.map(v => v[0])) - 3.05) < 1e-6);
});
test('a thicker exterior wall adds wall area, rooms stay the same', () => {
  const p = pair(),
    A = p.rooms[0],
    before = JSON.stringify(A.polygon),
    w0 = mpA(wallsAt(buildPlan2d(p.rooms, [])));
  const i = A.polygon.findIndex((v, k) => v[1] === 0 && A.polygon[(k + 1) % 4][1] === 0);
  setWallThickness(p, wallInfo(p, A, i), 0.64);
  assert.equal(JSON.stringify(A.polygon), before);
  assert.ok(Math.abs(wallInfo(p, A, i).t - 0.64) < 1e-6);
  assert.ok(mpA(wallsAt(buildPlan2d(p.rooms, []))) > w0 + 0.9, 'walls grew by ~3 m × 0.34 m');
});
test('remove the wall between rooms and restore it', () => {
  const p = pair(),
    A = p.rooms[0],
    i = A.polygon.findIndex((v, k) => v[0] === 3 && A.polygon[(k + 1) % 4][0] === 3),
    w0 = mpA(wallsAt(buildPlan2d(p.rooms, [])));
  setWallOpen(p, wallInfo(p, A, i), true);
  const w1 = mpA(wallsAt(buildPlan2d(p.rooms, [])));
  assert.ok(w0 - w1 > 0.25, `${w0} → ${w1}`);
  setWallOpen(p, wallInfo(p, A, i), false);
  assert.ok(Math.abs(mpA(wallsAt(buildPlan2d(p.rooms, []))) - w0) < 1e-3);
  assert.equal(A.wt, undefined);
});
test('an exterior edge without a wall gets its wall back; between rooms it stays open', () => {
  const p = pair(),
    A = p.rooms[0],
    B = p.rooms[1],
    i = A.polygon.findIndex((v, k) => v[0] === 3 && A.polygon[(k + 1) % 4][0] === 3),
    o = A.polygon.findIndex((v, k) => v[1] === 0 && A.polygon[(k + 1) % 4][1] === 0);
  setWallOpen(p, wallInfo(p, A, i), true);
  A.wt[o] = 0;
  assert.equal(closeOuterOpen(p), 1);
  assert.equal(A.wt[i], 0);
  assert.notEqual(A.wt[o], 0);
  p.rooms = p.rooms.filter(r => r !== B);
  assert.equal(closeOuterOpen(p), 1);
  assert.equal(A.wt, undefined);
});
test('an overlapping new room backs off to a 12 cm partition', () => {
  const p = pair();
  p.wall = {inner: 0.12};
  p.rooms.pop();
  const B = add2(p, [
    [2.97, 0],
    [6, 0],
    [6, 3],
    [2.97, 3],
  ]);
  settleRoom(p, B);
  assert.ok(Math.abs(Math.min(...B.polygon.map(v => v[0])) - 3.02) < 1e-6, JSON.stringify(B.polygon));
  assert.equal(validate(p.rooms).length, 0);
});
test('rotating the whole plan by 90°: same areas and thicknesses, furniture rotated', () => {
  const p = pair();
  p.furniture.push({id: 'f', model: 'bed', x: 1, y: 1, w: 1.6, d: 2, h: 1, rot: 0});
  const a0 = p.rooms.map(r => Math.abs(area(r.polygon)));
  rotatePlan(p, [3, 1.5], Math.PI / 2);
  assert.deepEqual(
    p.rooms.map(r => +Math.abs(area(r.polygon)).toFixed(4)),
    a0.map(a => +a.toFixed(4)),
  );
  assert.equal(p.furniture[0].rot, 90);
  assert.ok(Math.abs(p.furniture[0].x - 3.5) < 1e-6 && Math.abs(p.furniture[0].y + 0.5) < 1e-6);
  assert.equal(validate(p.rooms).length, 0);
});
test('new room: an edge almost in line with the neighboring one (23 cm) snaps into line', () => {
  const p = {rooms: [], openings: [], furniture: [], lights: []};
  add2(p, [
    [0, 0],
    [2.3, 0],
    [2.3, 4.2],
    [0, 4.2],
  ]);
  const B = add2(p, [
      [2.4, 1],
      [5, 1],
      [5, 3.97],
      [2.4, 3.97],
    ]),
    adj = settleRoom(p, B);
  assert.ok(Math.abs(Math.max(...B.polygon.map(v => v[1])) - 4.2) < 1e-6, JSON.stringify(B.polygon));
  assert.equal(adj.filter(x => x.kind === 'align').length, 1);
  assert.ok(Math.abs(adj[0].d - 0.23) < 1e-6);
  // the bottom of the second room is 1 m higher: that is not “almost”, left alone
  assert.ok(Math.abs(Math.min(...B.polygon.map(v => v[1])) - 1) < 1e-6);
});
test('split a room with a line: two flush rooms, a 10 cm partition, areas add up', () => {
  const p = {rooms: [], openings: [], furniture: [], lights: []};
  const A = add2(p, [
    [0, 0],
    [6, 0],
    [6, 3],
    [0, 3],
  ]);
  const ch = cutChord(A, [2, 1.5], [0, 1]);
  assert.deepEqual(ch, [
    [2, 0],
    [2, 3],
  ]);
  const [a, b] = splitRoom(p, A, ...ch);
  assert.equal(p.rooms.length, 2);
  assert.deepEqual(
    [Math.abs(area(a.polygon)), Math.abs(area(b.polygon))].sort((x, y) => x - y),
    [6, 12],
  );
  assert.equal(validate(p.rooms).length, 0);
  const i = a.polygon.findIndex((v, k) => v[0] === 2 && a.polygon[(k + 1) % a.polygon.length][0] === 2);
  const w = wallInfo(p, a, i);
  assert.equal(w.interior, true);
  assert.ok(Math.abs(w.t - 0.1) < 1e-6);
});
test('add a corner and drag half the wall: a right-angle step, the other half stays put', () => {
  const p = {rooms: [], openings: [], furniture: [], lights: []};
  const A = add2(p, [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ]);
  const top = A.polygon.findIndex((v, k) => v[1] === 3 && A.polygon[(k + 1) % 4][1] === 3);
  const k = addCorner(p, A, top, 0.5);
  assert.equal(validate(p.rooms).length, 0, 'a double point is not an error');
  // the half after the double point: edge k → k+1 (zero length), then k+1 → k+2
  const half = k + 1,
    edges = [[A, half], ...linkedEdges(p, A, half)];
  assert.equal(edges.length, 1, 'the other half is not linked');
  moveEdges(edges, snapshot(p), [0, 1], -1);
  assert.equal(validate(p.rooms).length, 0);
  assert.ok(Math.abs(Math.abs(area(A.polygon)) - 10) < 1e-6, '4×3 minus 2×1');
});
test('merge two rooms across a shared wall: one L-shaped room, named after the larger one', () => {
  const p = {rooms: [], openings: [], furniture: [], lights: []};
  const big = add2(
    p,
    [
      [4, 0],
      [6, 0],
      [6, 6],
      [4, 6],
    ],
    'Hallway',
  );
  const small = add2(
    p,
    [
      [0, 0],
      [3.9, 0],
      [3.9, 2],
      [0, 2],
    ],
    'Piece',
  );
  const i = small.polygon.findIndex(
    (v, k) => Math.abs(v[0] - 3.9) < 1e-9 && Math.abs(small.polygon[(k + 1) % 4][0] - 3.9) < 1e-9,
  );
  const r = mergeRooms(p, wallInfo(p, small, i));
  assert.ok(r);
  assert.equal(p.rooms.length, 1);
  assert.equal(r.name, 'Hallway');
  assert.ok(Math.abs(Math.abs(area(r.polygon)) - (12 + 7.8 + 0.2)) < 1e-6, String(area(r.polygon)));
  assert.equal(r.polygon.length, 6);
  assert.equal(validate(p.rooms).length, 0);
});
test('fit the plan to the photo scale: area scales by k², the wall between rooms stays the same', () => {
  const p = {rooms: [], openings: [], furniture: [], lights: []};
  const A = add2(p, [
      [0, 0],
      [12, 0],
      [12, 9],
      [0, 9],
    ]),
    B = add2(p, [
      [12, 0],
      [20, 0],
      [20, 9],
      [12, 9],
    ]);
  scalePlan(p, [0, 0], 1 / 3);
  assert.ok(Math.abs(Math.abs(area(A.polygon)) - 12) < 1e-6);
  const i = A.polygon.findIndex((v, k) => v[0] === 4 && A.polygon[(k + 1) % 4][0] === 4);
  assert.ok(Math.abs(wallInfo(p, A, i).t - 0.1) < 1e-6);
});
test('wall segment: on a wall with two neighbors “Remove wall” joins only the one under the cursor', () => {
  const p = {rooms: [], openings: [], furniture: [], lights: []};
  const A = add2(
    p,
    [
      [0, 0],
      [6, 0],
      [6, 3],
      [0, 3],
    ],
    'Bottom',
  );
  add2(
    p,
    [
      [0, 3],
      [3, 3],
      [3, 6],
      [0, 6],
    ],
    'Left',
  );
  add2(
    p,
    [
      [3, 3],
      [6, 3],
      [6, 6],
      [3, 6],
    ],
    'Right',
  );
  const i = A.polygon.findIndex((v, k) => v[1] === 3 && A.polygon[(k + 1) % 4][1] === 3);
  assert.equal(new Set(wallInfo(p, A, i).B.map(([r]) => r)).size, 2, 'the whole wall borders two rooms');
  const tLeft = A.polygon[i][0] > A.polygon[(i + 1) % 4][0] ? 0.75 : 0.25,
    w = wallAt(p, A, i, tLeft);
  assert.equal(w.neighbor.name, 'Left');
  const r = mergeRooms(p, w);
  assert.ok(r);
  assert.equal(p.rooms.length, 2);
  assert.equal(validate(p.rooms).length, 0);
});
test('deleting an enclosed strip gives its area to a neighbor, no hole', () => {
  const p = {rooms: [], openings: [], furniture: [], lights: []};
  add2(
    p,
    [
      [0, 3.3],
      [5, 3.3],
      [5, 6],
      [0, 6],
    ],
    'Top',
  );
  const s = add2(
    p,
    [
      [0, 3],
      [5, 3],
      [5, 3.3],
      [0, 3.3],
    ],
    'Strip',
  );
  add2(
    p,
    [
      [0, 0],
      [5, 0],
      [5, 3],
      [0, 3],
    ],
    'Bottom',
  );
  // a full-width strip touches exterior walls only at its ends (90% of its boundary is neighbors): it also goes to a neighbor, the apartment is not torn in half
  assert.ok(absorbRoom(p, s));
  assert.equal(p.rooms.length, 2);
  assert.equal(validate(p.rooms).length, 0);
  // a balcony (one shared wall out of four) is not a “leftover piece”: it is deleted as usual
  const b = {rooms: [], openings: [], furniture: [], lights: []};
  add2(
    b,
    [
      [0, 0],
      [5, 0],
      [5, 4],
      [0, 4],
    ],
    'Room',
  );
  const bal = add2(
    b,
    [
      [0, 4],
      [5, 4],
      [5, 5.2],
      [0, 5.2],
    ],
    'Balcony',
  );
  assert.equal(absorbRoom(b, bal), null);
  const q = {rooms: [], openings: [], furniture: [], lights: []};
  add2(
    q,
    [
      [0, 0],
      [2, 0],
      [2, 5],
      [0, 5],
    ],
    'L',
  );
  add2(
    q,
    [
      [3, 0],
      [5, 0],
      [5, 5],
      [3, 5],
    ],
    'R',
  );
  add2(
    q,
    [
      [2, 3],
      [3, 3],
      [3, 5],
      [2, 5],
    ],
    'T',
  );
  add2(
    q,
    [
      [2, 0],
      [3, 0],
      [3, 2.7],
      [2, 2.7],
    ],
    'B',
  );
  const mid = add2(
    q,
    [
      [2, 2.7],
      [3, 2.7],
      [3, 3],
      [2, 3],
    ],
    'Middle',
  );
  const r = absorbRoom(q, mid);
  assert.ok(r);
  assert.equal(q.rooms.length, 4);
  assert.equal(validate(q.rooms).length, 0);
});
test('a wall does not “see” a neighbor through a narrow room between them', () => {
  const p = {rooms: [], openings: [], furniture: [], lights: []};
  const top = add2(
    p,
    [
      [0, 1],
      [3, 1],
      [3, 4],
      [0, 4],
    ],
    'Hallway',
  );
  add2(
    p,
    [
      [0, 0.62],
      [3, 0.62],
      [3, 0.9],
      [0, 0.9],
    ],
    'Narrow',
  );
  add2(
    p,
    [
      [0, -2],
      [3, -2],
      [3, 0.52],
      [0, 0.52],
    ],
    'Bottom',
  );
  const i = top.polygon.findIndex((v, k) => v[1] === 1 && top.polygon[(k + 1) % 4][1] === 1),
    names = linkedEdges(p, top, i).map(([r]) => r.name);
  assert.deepEqual(names, ['Narrow']);
  assert.equal(wallAt(p, top, i, 0.5).neighbor.name, 'Narrow');
});
test('a solid room (shaft) stays wall mass: walls grow by exactly its area', () => {
  const p = {rooms: [], openings: [], furniture: [], lights: []};
  add2(
    p,
    [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ],
    'Kitchen',
  );
  const sh = add2(
    p,
    [
      [4, 3],
      [4.8, 3],
      [4.8, 4],
      [4, 4],
    ],
    'Shaft',
  );
  const w0 = mpA(wallsAt(buildPlan2d(p.rooms, [])));
  sh.solid = true;
  const w1 = mpA(wallsAt(buildPlan2d(p.rooms, [])));
  assert.ok(w1 - w0 > 0.5 && w1 - w0 < 0.8 + 0.01, `${w0} → ${w1}`);
});
test('window and door: placed at the click point, never overlap each other or extend past the wall', () => {
  const p = pair(),
    A = p.rooms[0],
    B = p.rooms[1];
  const bot = A.polygon.findIndex((v, k) => v[1] === 0 && A.polygon[(k + 1) % 4][1] === 0),
    mid = A.polygon.findIndex((v, k) => v[0] === 3 && A.polygon[(k + 1) % 4][0] === 3);
  const sAt = x => (A.polygon[bot][0] < x ? x - A.polygon[bot][0] : A.polygon[bot][0] - x);
  // a 140 cm window centered on the click; right at a corner it shifts to fit
  const w = addOpening(p, A, bot, sAt(1.5), 'window', {outer: true});
  assert.ok(w);
  assert.equal(+(w.at.s1 - w.at.s0).toFixed(3), 1.4);
  const w2 = addOpening(p, A, bot, sAt(2.9), 'window', {outer: true});
  assert.ok(w2);
  assert.ok(
    Math.min(w2.at.s0, w2.at.s1) >= Math.max(w.at.s0, w.at.s1) - 1e-6 ||
      Math.max(w2.at.s0, w2.at.s1) <= Math.min(w.at.s0, w.at.s1) + 1e-6,
    'no overlap',
  );
  assert.ok(w2.at.s1 - w2.at.s0 < 1.4, 'shrank to the free space');
  // a click on an existing opening does nothing
  assert.equal(addOpening(p, A, bot, sAt(1.5), 'window', {outer: true}), null);
  // a door between rooms: 80 cm; a second opening cannot take the same spot from the neighbor's side of the wall
  const d = addOpening(p, A, mid, 1.5, 'door');
  assert.ok(d);
  assert.equal(+(d.at.s1 - d.at.s0).toFixed(3), 0.8);
  const j = B.polygon.findIndex((v, k) => v[0] === 3 && B.polygon[(k + 1) % 4][0] === 3);
  const back = B.polygon[j][1] < B.polygon[(j + 1) % 4][1] ? 1.5 : 1.5;
  assert.equal(addOpening(p, B, j, back, 'door'), null);
  // width: the center stays put, it never grows beyond the free space
  setOpeningWidth(p, d, 0.9);
  assert.equal(+(d.at.s1 - d.at.s0).toFixed(3), 0.9);
  assert.equal(+((d.at.s0 + d.at.s1) / 2).toFixed(3), 1.5);
  setOpeningWidth(p, d, 10);
  const g = openingGap(p, d);
  assert.ok(Math.abs(d.at.s1 - d.at.s0 - (g[1] - g[0])) < 1e-6);
  // the door leaf cycles through 4 positions
  const s0 = d.swing;
  turnDoor(d);
  turnDoor(d);
  turnDoor(d);
  turnDoor(d);
  assert.equal(d.swing, s0);
  // splitting a room keeps every opening, and each has an id
  splitRoom(p, A, [1.5, 0], [1.5, 3]);
  assert.equal(p.openings.filter(o => openingCoords(p.rooms, o)).length, p.openings.length);
  assert.ok(migrate(p).openings.every(o => o.id));
});
test('name and HA area: lights are not placed by themselves; auto-placed ones are removed on change; a repeated name becomes “Bedroom 2”', () => {
  const p = pair(),
    [A, B] = p.rooms,
    lamp = (id, area) => ({
      id,
      area,
      kind: 'point',
      h: 2.5,
      placed: false,
      points: [],
      segments: [],
      room: null,
    });
  p.lights = [lamp('k1', 'kitchen'), lamp('k2', 'kitchen'), lamp('b1', 'bedroom')];
  setRoomArea(p, A, 'kitchen', 'Kitchen');
  assert.equal(A.name, 'Kitchen');
  assert.equal(A.area, 'kitchen');
  assert.ok(
    p.lights.every(l => !l.placed),
    'lights were not placed by themselves',
  );
  // the kitchen lights were auto-placed, then one was moved by hand; the room turned out to be a bedroom
  autoPlaceLights(p, a => (a === 'kitchen' ? A : null));
  const moved = p.lights[1];
  delete moved.auto;
  setRoomArea(p, A, 'bedroom', 'Bedroom');
  assert.equal(p.lights[0].placed, false);
  assert.equal(moved.placed, true);
  assert.equal(p.lights[2].placed, false);
  // a plain name without an area; a repeat gets a number
  setRoomArea(p, B, null, 'Bedroom');
  assert.equal(B.name, 'Bedroom 2');
  assert.equal(B.area, undefined);
});
test('two areas in a room: the boundary divides it, moves, and is recomputed when the room is edited', () => {
  const p = {rooms: [], openings: [], furniture: [], lights: []},
    r = add2(
      p,
      [
        [0, 0],
        [6, 0],
        [6, 4],
        [0, 4],
      ],
      'Kitchen-living room',
    );
  const zp = setZone(r, [
    [2, 0],
    [2, 4],
  ]);
  assert.ok(zp);
  const A = x => Math.abs(area(x));
  assert.ok(Math.abs(A(zp.zone) + A(zp.main) - 24) < 1e-6);
  assert.ok([8, 16].includes(Math.round(A(zp.zone))));
  const z0 = {...r.zone},
    was = Math.round(A(zp.zone));
  assert.ok(moveZone(r, z0, 1));
  const z1 = zoneParts(r);
  assert.ok(Math.abs(A(z1.zone) - was) > 3.9, 'the boundary moved by 1 m');
  assert.equal(moveZone(r, z0, 10), false, 'not beyond the room');
  // the room was narrowed: the boundary still divides it
  r.polygon = [
    [0, 0],
    [5, 0],
    [5, 4],
    [0, 4],
  ];
  assert.ok(zoneParts(r));
  // the boundary ended up outside: no division
  r.polygon = [
    [4, 0],
    [6, 0],
    [6, 4],
    [4, 4],
  ];
  r.zone = {...z0};
  assert.equal(zoneParts(r), null);
});
test('dragging a region edge: the strip cut off along the edge is the second part', () => {
  const p = {rooms: [], openings: [], furniture: [], lights: []},
    r = add2(
      p,
      [
        [0, 0],
        [6, 0],
        [6, 4],
        [0, 4],
      ],
      'Kitchen-living room',
    );
  const top = r.polygon.findIndex((v, k) => v[1] === 4 && r.polygon[(k + 1) % 4][1] === 4);
  assert.ok(zoneFromEdge(r, top, 1.5));
  const zp = zoneParts(r);
  assert.ok(Math.abs(Math.abs(area(zp.zone)) - 9) < 1e-6, 'a 6×1.5 strip along the top edge');
  assert.ok(zp.zone.every(q => q[1] >= 2.5 - 1e-6));
  assert.equal(zoneFromEdge(r, top, 0.1), true);
  assert.equal(r.zone, undefined, 'under 30 cm: no division');
  assert.equal(zoneFromEdge(r, top, 3.9), false, 'the second part would be narrower than 30 cm: not allowed');
});

test('splitting can carve out a 10 × 10 cm column', () => {
  const p = {rooms: [], openings: [], furniture: [], lights: []};
  const r = add2(p, [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
  ]);
  const first = splitRoom(p, r, [0.1, 0], [0.1, 2]);
  assert.ok(first);
  const strip = first.find(r => Math.abs(area(r.polygon)) < 0.21);
  const second = splitRoom(p, strip, [0, 0.1], [0.1, 0.1]);
  assert.ok(second);
  assert.ok(second.some(r => Math.abs(Math.abs(area(r.polygon)) - 0.01) < 1e-8));
});

const clear = (p, q, holes = []) =>
  Math.min(...[p, ...holes].flatMap(g => g.map((a, i) => sdist(q, g[(i + g.length - 1) % g.length], a)[0])));
test('room label: centered in a simple room; in an L-shaped room or one with a shaft, in the roomy part, not in a wall', () => {
  assert.deepEqual(
    labelPoint([
      [0, 0],
      [6, 0],
      [6, 2],
      [0, 2],
    ]),
    [3, 1],
  );
  // L: the wide part on the left, a narrow tail at the top right; the vertex average lies near the inner corner
  const L = [
      [0, 0],
      [4, 0],
      [4, 1],
      [1.2, 1],
      [1.2, 4],
      [0, 4],
    ],
    q = labelPoint(L);
  assert.ok(inside(q, L) && clear(L, q) > 0.5, `L: ${q}`);
  // a 1×1 shaft in the middle of a 4×3 room: the label is neither on the shaft nor right next to it
  const R = [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ],
    S = [
      [1.5, 1],
      [2.5, 1],
      [2.5, 2],
      [1.5, 2],
    ],
    w = labelPoint(R, [S]);
  assert.ok(!inside(w, S) && clear(R, w, [S]) > 0.4, `shaft: ${w}`);
});
test('stacked: wall cabinets above base cabinets get a switcher in the panel; a sofa on a rug and side-by-side nightstands do not', () => {
  const p = two(),
    base = {id: 'b', model: 'kitchenBase', w: 1.2, d: 0.6, h: 0.9, rot: 0, x: 1.5, y: 0.35},
    up = {id: 'u', model: 'kitchenWall', w: 1.2, d: 0.35, h: 0.7, rot: 0, x: 1.5, y: 0.23};
  const mw = {id: 'm', model: 'microwave', w: 0.5, d: 0.38, h: 0.3, rot: 0, x: 1.2, y: 0.3},
    n1 = {id: 'n1', model: 'nightstand', w: 0.5, d: 0.4, h: 0.55, rot: 0, x: 0.5, y: 3},
    n2 = {id: 'n2', model: 'nightstand', w: 0.5, d: 0.4, h: 0.55, rot: 0, x: 1, y: 3};
  p.furniture = [
    up,
    base,
    mw,
    n1,
    n2,
    {id: 'r', model: 'rug', w: 2, d: 1.4, h: 0.012, rot: 0, x: 1.5, y: 2.5},
    {id: 's', model: 'sofa', w: 2, d: 0.9, h: 0.8, rot: 0, x: 1.5, y: 2.5},
  ];
  assert.deepEqual(
    stackOf(p, up).map(f => f.id),
    ['b', 'm', 'u'],
    'bottom to top: base cabinets, a microwave on the countertop, wall cabinets',
  );
  assert.deepEqual(
    stackOf(p, p.furniture[6]).map(f => f.id),
    ['s'],
    'a rug under the sofa does not count',
  );
  assert.deepEqual(
    stackOf(p, n1).map(f => f.id),
    ['n1'],
    'side by side at the same height is not stacked',
  );
});
test('a chair and a table snap to a wall only when almost touching; a wardrobe snaps from afar, as before', () => {
  const p = two(),
    ch = {id: 'c', model: 'chairCushion', w: 0.45, d: 0.52, h: 0.85, rot: 30, x: 0, y: 0},
    wd = {id: 'w', model: 'wardrobe', w: 1, d: 0.6, h: 2, rot: 0, x: 0, y: 0};
  let r = snapToWall(p, ch, [1.5, 0.05 + 0.26 + 0.4], false);
  assert.equal(r.rot, 30, '40 cm from the wall: stays as it was');
  assert.ok(!r.wall);
  r = snapToWall(p, ch, [1.5, 0.05 + 0.26 + 0.05], false);
  assert.ok(r.wall, 'almost touching: snaps to the wall');
  r = snapToWall(p, wd, [1.5, 0.05 + 0.3 + 0.4], false);
  assert.ok(r.wall, 'a wardrobe is pulled to the wall even from 40 cm');
});
test('a light near the room center: pulled to the center within 12 px on screen, but no farther than 25 cm', () => {
  const p = two(),
    L = {points: [[0, 0]]},
    c = [1.5, 2]; // center of the 3×4 room A
  const far = snapLightPoint(p, L, [1.5 + 0.2, 2], {tol: 8 / 40}); // zoomed out (40 px/m): 12 px = 30 cm → capped at 25 cm
  assert.deepEqual(far.p, c, 'zoomed out: pulled in from 20 cm off center');
  const near = snapLightPoint(p, L, [1.5 + 0.2, 2], {tol: 8 / 200}); // zoomed in (200 px/m): 12 px = 6 cm
  assert.notDeepEqual(near.p, c, 'zoomed in: stays where it was put');
  assert.deepEqual(
    snapLightPoint(p, L, [1.5 + 0.3, 2], {tol: 8 / 20}).p.map(v => +v.toFixed(2)),
    [1.8, 2],
    'beyond 25 cm: not pulled even when zoomed out',
  );
});

test('a door in the middle of a thick wall opens to the side its room is on, whatever the order of its ends (homes check, D-061)', () => {
  // living room and balcony 25 cm apart: the door sits 12.5 cm from the living room's edge
  for (const ends of [
    [
      [0.9, -0.125],
      [1.6, -0.125],
    ],
    [
      [1.6, -0.125],
      [0.9, -0.125],
    ],
  ]) {
    const p = migrate({
      rooms: [
        {
          id: 'liv',
          name: 'Living room',
          polygon: [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
          ],
        },
        {
          id: 'bal',
          name: 'Balcony',
          polygon: [
            [0, -1.25],
            [4, -1.25],
            [4, -0.25],
            [0, -0.25],
          ],
        },
      ],
      openings: [{kind: 'door', a: ends[0], b: ends[1]}],
      furniture: [{id: 'c', model: 'patioChair', x: 1.2, y: -0.75, rot: 0, w: 0.56, d: 0.58, h: 0.82}],
    });
    const o = p.openings[0];
    assert.equal(o.at.room, 'liv');
    const n = openingOut(p.rooms, openingCoords(p.rooms, o));
    assert.ok(n[1] < 0, 'outward points to the balcony');
    assert.equal(furnitureConflicts(p).size, 0, 'the chair on the balcony is not in the leaf’s way');
  }
});
