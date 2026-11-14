// Pattern parameters of finishes (D-NEXT): what each finish takes, how a value that is not well formed is left out, the
// floor's repeat, the wall table the shader reads, and that the plan file keeps them through loading and a split.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {finishKey, floorPieces, pieceFinish, wellFormedPattern} from './pieces.ts';
import {migrate, splitRoom} from './plan.ts';
import {readPlan} from './plan-file.ts';
import {
  bakeFinish,
  FLOOR_KINDS,
  floorRepeat,
  patternSpec,
  roomFloor,
  roomWall,
  sideWall,
  usedPattern,
  WALL_KINDS,
} from './surfaces.ts';
import type {Room} from './types.ts';

// A 4 × 3 m room.
const room = (extra?: Partial<Room>): Room => ({
  id: 'a',
  name: 'Living room',
  polygon: [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ],
  ...extra,
});

test('pattern: only well-formed values are kept', () => {
  assert.deepEqual(
    wellFormedPattern({
      tile: [0.2, 1.2],
      joint: 0.003,
      grout: '#334455',
      tint2: '#aabbcc',
      lay: 'bond',
    }),
    {tile: [0.2, 1.2], joint: 0.003, grout: '#334455', tint2: '#aabbcc', lay: 'bond'},
  );
  const bad = {tile: [0.2], joint: -1, grout: 'grey', tint2: '#abc', lay: 'diagonal'} as never;
  assert.deepEqual(wellFormedPattern(bad), {});
  assert.deepEqual(wellFormedPattern({tile: [0, 1]}), {}, 'a tile of no size');
  assert.deepEqual(wellFormedPattern({tile: [3, 1]}), {}, 'a tile past the limit');
  assert.deepEqual(wellFormedPattern(null), {});
});

test('pattern: each finish keeps only what it uses', () => {
  const all = {
    tile: [0.1, 0.1] as [number, number],
    joint: 0.004,
    grout: '#222222',
    tint2: '#ff0000',
    lay: 'bond' as const,
  };
  // planks: their width and length, nothing else
  assert.deepEqual(usedPattern('floor', 'wood', all), {tile: [0.1, 0.1]});
  // floor tiles: size, joint, grout, layout; no second colour
  assert.deepEqual(usedPattern('floor', 'tile', all), {
    tile: [0.1, 0.1],
    joint: 0.004,
    grout: '#222222',
    lay: 'bond',
  });
  // a checkerboard: size, grout and the second colour
  assert.deepEqual(usedPattern('floor', 'checker', all), {
    tile: [0.1, 0.1],
    grout: '#222222',
    tint2: '#ff0000',
  });
  // carpet, paint, plaster: nothing
  assert.deepEqual(usedPattern('floor', 'carpet', all), {});
  assert.deepEqual(usedPattern('wall', 'paintWarm', all), {});
  // wall tiles: size, joint, grout, layout; brick: no layout; stripes: width and the second colour; slats: width, gap, its colour
  assert.deepEqual(usedPattern('wall', 'tileSubway', all), {
    tile: [0.1, 0.1],
    joint: 0.004,
    grout: '#222222',
    lay: 'bond',
  });
  assert.deepEqual(usedPattern('wall', 'brickRed', all), {tile: [0.1, 0.1], joint: 0.004, grout: '#222222'});
  assert.deepEqual(usedPattern('wall', 'wallpaperStripe', all), {tile: [0.1, 0.1], tint2: '#ff0000'});
  assert.deepEqual(usedPattern('wall', 'slatsOak', all), {tile: [0.1, 0.1], joint: 0.004, grout: '#222222'});
  // a key the editor does not have: nothing
  assert.deepEqual(usedPattern('wall', 'toString', all), {});
});

test('pattern: every finish says what it takes, and its own values are its own look', () => {
  for (const key of Object.keys(FLOOR_KINDS)) {
    const spec = patternSpec('floor', key);
    for (const size of [spec.width, spec.height, spec.joint])
      if (size) assert.ok(size.min <= size.own && size.own <= size.max, `${key} ${size.label}`);
  }
  for (const key of Object.keys(WALL_KINDS)) {
    const spec = patternSpec('wall', key);
    for (const size of [spec.width, spec.height, spec.joint])
      if (size) assert.ok(size.min <= size.own && size.own <= size.max, `${key} ${size.label}`);
  }
  // the labelled finishes say the size they are
  assert.deepEqual(
    [patternSpec('wall', 'tileWhite').width?.own, patternSpec('wall', 'tileWhite').height?.own],
    [0.6, 0.3],
  );
  assert.deepEqual(
    [patternSpec('floor', 'stone').width?.own, patternSpec('floor', 'stone').height?.own],
    [1.2, 0.6],
  );
  assert.equal(patternSpec('wall', 'paintWarm').width, undefined);
});

test("floor repeat: none set is the finish's own; a tile size gives whole tiles; herringbone grows with its slat", () => {
  assert.deepEqual(floorRepeat('tile'), [1.2, 1.2]);
  assert.deepEqual(
    floorRepeat('wood', {tile: [0.12, 1.8]}),
    [2.4, 2.4],
    'planks keep their repeat, more rows in it',
  );
  assert.deepEqual(floorRepeat('tile', {tile: [0.3, 0.6]}), [1.2, 1.2]);
  const [along, across] = floorRepeat('tile', {tile: [0.45, 0.45]});
  assert.ok(Math.abs(along - 1.35) < 1e-9 && Math.abs(across - 1.35) < 1e-9, '3 tiles of 45 cm');
  // a running bond needs an even number of rows to repeat
  const bond = floorRepeat('tile', {tile: [0.6, 0.6], lay: 'bond'});
  assert.ok(Math.abs(bond[1] - 1.2) < 1e-9);
  assert.deepEqual(
    floorRepeat('herringbone', {tile: [0.07, 0.42]}).map(v => +v.toFixed(3)),
    [0.84, 0.84],
  );
});

test("a room's pattern counts only with a finish of its own", () => {
  const own = room({
    floor: 'wood',
    floorPattern: {tile: [0.15, 1.5]},
    wall: 'tileWhite',
    wallPattern: {grout: '#202020'},
  });
  assert.deepEqual(roomFloor(own), {k: 'wood', tint: null, tile: [0.15, 1.5]});
  assert.deepEqual(roomWall(own), {k: 'tileWhite', tint: undefined, grout: '#202020'});
  // guessed from the name: the guess's own look
  const guessed = room({floorPattern: {tile: [0.15, 1.5]}, wallPattern: {grout: '#202020'}});
  assert.deepEqual(roomFloor(guessed), {k: 'wood', tint: null});
  assert.deepEqual(roomWall(guessed), {k: 'paintWarm', tint: null});
  // an edge's own finish with its pattern; an edge without one follows the room
  const edged = room({
    wall: 'paintWhite',
    wf: [{k: 'wallpaperStripe', tint2: '#8899aa', tile: [0.05, 0.05]}, null, null, null],
  });
  assert.deepEqual(sideWall(edged, 0), {
    k: 'wallpaperStripe',
    tint: null,
    tile: [0.05, 0.05],
    tint2: '#8899aa',
    own: true,
  });
  assert.deepEqual(sideWall(edged, 1), {k: 'paintWhite', tint: undefined, own: false});
});

test('pieces carry their pattern; equal finishes with different patterns stay apart', () => {
  assert.deepEqual(pieceFinish({k: 'tileSubway', grout: '#111111', lay: 'grid', tint2: 'nope'}), {
    k: 'tileSubway',
    grout: '#111111',
    lay: 'grid',
  });
  assert.notEqual(finishKey({k: 'tileSubway'}), finishKey({k: 'tileSubway', grout: '#111111'}));
  // without the new fields the key is as it was (the bands of old files merge as before)
  assert.equal(finishKey({k: 'tileSubway', tile: [0.1, 0.05], joint: 0.002}), 'tileSubway||0.1x0.05|0.002');
  const pieces = floorPieces(
    room({
      fp: [
        {
          k: 'tile',
          tile: [0.3, 0.3],
          poly: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        },
      ],
    }),
    () => true,
  );
  assert.deepEqual(pieces[0].pattern, {tile: [0.3, 0.3]});
});

test('wall table: a joint colour, a second colour and a layout reach the shader; none set leaves the old rows', () => {
  const finishes = (r: Room): Uint8Array => bakeFinish([r])!.tab.image.data as Uint8Array;
  const plain = finishes(room({wall: 'tileSubway'}));
  // four rows of 256: colour and pattern, sizes, joint colour, second colour; the last two empty
  assert.equal(plain.length, 256 * 4 * 4);
  assert.ok(plain.slice(256 * 2 * 4).every(v => v === 0));
  assert.equal(plain[1 * 4 + 3], 2, 'subway tiles are laid offset (pattern 2)');
  const set = finishes(
    room({wall: 'tileSubway', wallPattern: {grout: '#102030', lay: 'grid', tile: [0.2, 0.1]}}),
  );
  assert.equal(set[1 * 4 + 3], 1, 'laid straight: the grid (pattern 1)');
  assert.deepEqual([...set.slice((256 + 1) * 4, (256 + 1) * 4 + 2)], [20, 10], 'the tile in centimetres');
  assert.deepEqual(
    [...set.slice((512 + 1) * 4, (512 + 1) * 4 + 4)],
    [16, 32, 48, 255],
    'the joint colour, set',
  );
  // a pattern without its own joint colour: the joints are filtered by distance, the colour stays the finish's own (alpha 128)
  const sized = finishes(room({wall: 'tileSquare', wallPattern: {tile: [0.1, 0.1], joint: 0.002}}));
  assert.deepEqual([...sized.slice((512 + 1) * 4, (512 + 1) * 4 + 4)], [0, 0, 0, 128]);
  const stripes = finishes(room({wall: 'wallpaperStripe', wallPattern: {tint2: '#ff8000'}}));
  assert.deepEqual(
    [...stripes.slice((768 + 1) * 4, (768 + 1) * 4 + 4)],
    [255, 128, 0, 255],
    'the second colour, set',
  );
});

test('plan file: patterns load, save and survive a split; a pattern that is not an object is refused', () => {
  const plan = {
    version: 1,
    rooms: [
      room({
        floor: 'wood',
        floorPattern: {tile: [0.15, 1.5]},
        wall: 'brickRed',
        wallPattern: {grout: '#444444'},
        wf: [{k: 'tileWhite', lay: 'bond'}, null, null, null],
        wp: [[{k: 'tileSubway', z: [0, 1.2], grout: '#000000'}], null, null, null],
        fp: [
          {
            k: 'tile',
            lay: 'bond',
            poly: [
              [0, 0],
              [1, 0],
              [1, 1],
            ],
          },
        ],
      }),
    ],
    openings: [],
    furniture: [],
    lights: [],
  };
  const read = readPlan(JSON.stringify(plan));
  assert.deepEqual(read.rooms[0].floorPattern, {tile: [0.15, 1.5]});
  assert.deepEqual(read.rooms[0].wallPattern, {grout: '#444444'});
  assert.deepEqual(read.rooms[0].wf?.[0], {k: 'tileWhite', lay: 'bond'});
  assert.equal(read.rooms[0].wp?.[0]?.[0].grout, '#000000');
  assert.equal(read.rooms[0].fp?.[0].lay, 'bond');
  assert.deepEqual(JSON.parse(JSON.stringify(read)).rooms[0], read.rooms[0], 'saved as JSON, the same');
  // a bad value inside a pattern is left out when drawn, not a reason to refuse the file
  const odd = structuredClone(plan);
  odd.rooms[0].floorPattern = {tile: 'wide'} as never;
  assert.doesNotThrow(() => readPlan(JSON.stringify(odd)));
  for (const pattern of ['wide', [0.2, 1], 7]) {
    const broken = structuredClone(plan);
    broken.rooms[0].wallPattern = pattern as never;
    assert.throws(() => readPlan(JSON.stringify(broken)), String(pattern));
  }
  // a split: the new part gets the room's pattern, as its own copy
  const p = migrate(structuredClone(plan));
  const [big, small] = splitRoom(p, p.rooms[0], [3, 0], [3, 3])!;
  assert.deepEqual(small.floorPattern, {tile: [0.15, 1.5]});
  assert.notEqual(small.floorPattern, big.floorPattern);
});
