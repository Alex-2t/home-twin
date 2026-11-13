import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  edgePieces,
  edgeRuns,
  bandsAt,
  floorPieces,
  splitPieces,
  joinPieces,
  carryPieces,
  clearWallPieces,
  hasWallPieces,
  pieceFinish,
} from './pieces.js';
import {
  migrate,
  insertVertex,
  removeVertex,
  addCorner,
  splitRoom,
  mergeRooms,
  wallInfo,
  rotatePlan,
  scalePlan,
} from './plan.js';
import {bakeFinish, WALL_KINDS} from './surfaces.js';
import {readPlan} from './plan-file.js';

const anyKind = () => true;
const paint = {k: 'paintWarm'};

// A 4 × 3 m room; edge 0 runs along y = 0 from x = 0 to x = 4.
const room = extra => ({
  id: 'a',
  name: 'Kitchen',
  polygon: [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ],
  ...extra,
});

test('a piece fills in its defaults; a bad one or an unknown finish is skipped', () => {
  const r = room({
    wp: [
      [
        {k: 'tileSubway', z: [0.9, 1.5], t: [0.25, 0.75]},
        {k: 'tileSubway', z: [1.5, 0.9]},
        {k: 'nope'},
        {k: 'slatsOak'},
      ],
    ],
  });
  const pieces = edgePieces(r, 0, k => !!WALL_KINDS[k]);
  assert.equal(pieces.length, 2);
  assert.deepEqual([pieces[0].from, pieces[0].to, pieces[0].bottom, pieces[0].top], [0.25, 0.75, 0.9, 1.5]);
  assert.deepEqual([pieces[1].from, pieces[1].to, pieces[1].bottom, pieces[1].top], [0, 1, 0, Infinity]);
  assert.deepEqual(pieceFinish({k: 'tileWhite', tint: 'red', tile: [0.3, 0.6], joint: 0.003}), {
    k: 'tileWhite',
    tile: [0.3, 0.6],
    joint: 0.003,
  });
});

test('up a wall: tiles to 1.5 m, a backsplash band, later pieces on top', () => {
  const tile = {k: 'tileWhite'};
  const band = {k: 'tileSubway'};
  const pieces = [
    {from: 0, to: 1, bottom: 0, top: 1.5, finish: tile},
    {from: 0.5, to: 1, bottom: 0.9, top: 1.2, finish: band},
  ];
  const left = bandsAt(paint, pieces, 0.25);
  assert.deepEqual(
    left.map(b => [b.bottom, b.top, b.finish.k]),
    [
      [0, 1.5, 'tileWhite'],
      [1.5, Infinity, 'paintWarm'],
    ],
  );
  const right = bandsAt(paint, pieces, 0.75);
  assert.deepEqual(
    right.map(b => [b.bottom, b.finish.k]),
    [
      [0, 'tileWhite'],
      [0.9, 'tileSubway'],
      [1.2, 'tileWhite'],
      [1.5, 'paintWarm'],
    ],
  );
  const runs = edgeRuns(paint, pieces);
  assert.deepEqual(
    runs.map(run => [run.from, run.to, run.bands.length]),
    [
      [0, 0.5, 2],
      [0.5, 1, 4],
    ],
  );
  assert.equal(edgeRuns(paint, []).length, 1, 'no pieces: one run');
});

test('a floor piece is cut to the room; one outside it is not drawn', () => {
  const r = room({
    fp: [
      {
        poly: [
          [3, 1],
          [5, 1],
          [5, 2],
          [3, 2],
        ],
        k: 'tile',
      },
      {
        poly: [
          [6, 6],
          [7, 6],
          [7, 7],
        ],
        k: 'tile',
      },
    ],
  });
  const pieces = floorPieces(r, anyKind);
  assert.equal(pieces.length, 1);
  const xs = pieces[0].rings[0].map(p => p[0]);
  assert.equal(Math.max(...xs), 4, 'cut at the wall');
});

test('a corner on an edge splits its pieces; removing it joins them back', () => {
  const p = migrate({
    rooms: [
      room({
        wp: [
          [
            {k: 'tileSubway', t: [0.25, 0.75], z: [0.9, 1.5]},
            {k: 'tileWhite', z: [0, 1.2]},
          ],
        ],
      }),
    ],
  });
  const [r] = p.rooms;
  insertVertex(p, r, 0, [1, 0]);
  // edge 0 is now 0…1 m: the subway band from 1 m (its end) — none there; the tiles all of it
  assert.deepEqual(
    r.wp[0].map(piece => [piece.k, piece.t]),
    [['tileWhite', undefined]],
  );
  // edge 1 is 1…4 m: the band from 1 to 3 m is 0…2/3 of it
  assert.deepEqual(
    r.wp[1].map(piece => [piece.k, piece.t]),
    [
      ['tileSubway', [0, 0.6667]],
      ['tileWhite', undefined],
    ],
  );
  removeVertex(p, r, 1);
  assert.equal(r.polygon.length, 4);
  assert.deepEqual(
    r.wp[0].map(piece => [piece.k, piece.t]),
    [
      ['tileWhite', [0, 0.25]],
      ['tileSubway', [0.25, 0.75]],
      ['tileWhite', [0.25, 1]],
    ],
  );
});

test('a double corner (to make a step) keeps the pieces where they were', () => {
  const p = migrate({rooms: [room({wp: [[{k: 'slatsOak', t: [0.5, 1]}]]})]});
  const [r] = p.rooms;
  addCorner(p, r, 0, 0.25);
  assert.equal(r.wp.length, r.polygon.length);
  assert.equal(r.wp[0], null, 'the first metre: none');
  assert.deepEqual(
    r.wp[2].map(piece => piece.t),
    [[0.3333, 1]],
    'the last three metres: from 2 m on',
  );
});

test('a split room: each part keeps the pieces on its walls and its part of the floor', () => {
  const p = migrate({
    rooms: [
      room({
        wp: [[{k: 'slatsOak', t: [0, 0.5]}], null, [{k: 'brickWhite'}]],
        fp: [
          {
            poly: [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ],
            k: 'tile',
          },
        ],
      }),
    ],
  });
  const [big, small] = splitRoom(p, p.rooms[0], [3, 0], [3, 3]);
  const all = r => (r.wp || []).flatMap(list => list || []).map(piece => piece.k);
  assert.ok(all(big).includes('slatsOak'));
  assert.ok(all(big).includes('brickWhite'));
  assert.ok(!all(small).includes('slatsOak'), 'the slats were on the first 2 m');
  assert.equal(big.fp?.length, 1);
  assert.equal(small.fp, undefined, 'the tiled corner is in the big part');
});

test('two rooms joined: their pieces on the walls that stay, their floor pieces together', () => {
  const p = migrate({
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
        wp: [[{k: 'slatsOak'}]],
        fp: [
          {
            poly: [
              [0, 0],
              [1, 0],
              [1, 1],
            ],
            k: 'tile',
          },
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
        wp: [[{k: 'brickWhite'}]],
      },
    ],
    openings: [],
  });
  const [a] = p.rooms;
  const kept = mergeRooms(p, wallInfo(p, a, 1));
  assert.ok(kept);
  const bottom = kept.polygon.findIndex((q, i) => {
    const next = kept.polygon[(i + 1) % kept.polygon.length];
    return Math.abs(q[1]) < 1e-6 && Math.abs(next[1]) < 1e-6;
  });
  const kinds = kept.wp[bottom].map(piece => piece.k).sort();
  assert.deepEqual(kinds, ['brickWhite', 'slatsOak'], 'one long wall: the pieces of both');
  assert.equal(kept.fp.length, 1);
});

test('the plan turned or scaled: the floor pieces go with it', () => {
  const p = migrate({
    rooms: [
      room({
        fp: [
          {
            poly: [
              [1, 0],
              [2, 0],
              [2, 1],
            ],
            k: 'tile',
          },
        ],
      }),
    ],
  });
  rotatePlan(p, [0, 0], Math.PI / 2);
  assert.deepEqual(p.rooms[0].fp[0].poly[0], [0, 1]);
  scalePlan(p, [0, 0], 2);
  assert.deepEqual(p.rooms[0].fp[0].poly[0], [0, 2]);
});

test('a finish picked by hand for a wall removes its pieces', () => {
  const r = room({wp: [[{k: 'slatsOak'}], [{k: 'brickWhite'}]]});
  assert.ok(hasWallPieces(r, [0]));
  clearWallPieces(r, [0]);
  assert.ok(!hasWallPieces(r, [0]));
  assert.ok(hasWallPieces(r, [1]));
  clearWallPieces(r, [1]);
  assert.equal(r.wp, undefined);
});

test('pieces split and join as fractions; carried onto a longer edge along the same line', () => {
  assert.deepEqual(splitPieces([{k: 'x', t: [0.2, 0.6]}], 0.4), [
    [{k: 'x', t: [0.5, 1]}],
    [{k: 'x', t: [0, 0.3333]}],
  ]);
  assert.deepEqual(joinPieces([{k: 'x'}], null, 1, 3), [{k: 'x', t: [0, 0.25]}]);
  assert.deepEqual(carryPieces([{k: 'x'}], [0, 0], [2, 0], [0, 0], [4, 0]), [{k: 'x', t: [0, 0.5]}]);
  assert.deepEqual(carryPieces([{k: 'x'}], [0, 0], [2, 0], [0, 1], [4, 1]), [], 'another line');
  assert.deepEqual(
    carryPieces([{k: 'x'}], [0, 0], [2, 0], [4, 0], [0, 0]),
    [{k: 'x', t: [0.5, 1]}],
    'the other way',
  );
});

test('the wall map: a backsplash band along part of a wall, by height', () => {
  const r = room({wall: 'paintWhite', wp: [[{k: 'tileSubway', t: [0.5, 1], z: [0.9, 1.5]}]]});
  const f = bakeFinish([r]);
  const [x0, y0, sx, sy] = f.box;
  const width = f.tex.image.width;
  const height = f.tex.image.height;
  const stackAt = (x, y) =>
    f.tex.image.data[(Math.floor((y - y0) * sy * height) * width + Math.floor((x - x0) * sx * width)) * 4];
  const stacks = f.stk.image.data;
  const finishes = f.tab.image.data;
  const colour = id => [finishes[id * 4], finishes[id * 4 + 1], finishes[id * 4 + 2]].join(',');
  const left = stackAt(1, 0.14);
  const right = stackAt(3, 0.14);
  assert.notEqual(left, right, 'two stacks along the wall');
  assert.equal(colour(stacks[left * 4]), WALL_KINDS.paintWhite.base.join(','));
  assert.equal(stacks[left * 4 + 1], 0, 'the left half: paint only');
  assert.equal(
    colour(stacks[right * 4 + 1]),
    WALL_KINDS.tileSubway.base.join(','),
    'the band over the paint',
  );
  assert.equal(stacks[256 * 4 + right * 4], 45, 'the band starts at 0.9 m (2 cm steps)');
  assert.equal(stacks[256 * 4 + right * 4 + 1], 75, 'and ends at 1.5 m');
});

test('a plan file with pieces reads; a broken list is refused', () => {
  const plan = {
    rooms: [
      room({
        wp: [[{k: 'tileWhite', z: [0, 1.2]}], null],
        fp: [
          {
            poly: [
              [0, 0],
              [1, 0],
              [1, 1],
            ],
            k: 'tile',
          },
        ],
      }),
    ],
  };
  assert.ok(readPlan(JSON.stringify(plan)));
  assert.throws(() => readPlan(JSON.stringify({rooms: [room({wp: [{k: 'tileWhite'}]})]})));
  assert.throws(() => readPlan(JSON.stringify({rooms: [room({fp: [{k: 'tile'}]})]})));
});
