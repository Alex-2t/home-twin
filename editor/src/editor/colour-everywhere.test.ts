// Colour everywhere (D-070, the owner's re-check of 2026-11-14): every place a plan holds a colour takes a custom #rrggbb and
// keeps it through the plan file, the editor's own load (migrate), undo and redo, and a version — every catalog model in every
// variant, a rug's border, a kitchen worktop, items from parts, the room's finishes and its pieces of finish, a sensor's
// digits, a lamp's light and its fitting's body. The drawing of each is checked where it is made: furniture3d.test.ts (the
// models), below (the finishes' colours).
import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG} from '../core/catalog.ts';
import {migrate} from '../core/plan.ts';
import {readPlan} from '../core/plan-file.ts';
import {FLOOR_KINDS, WALL_KINDS, floorBase, sideWall, wallBase} from '../core/surfaces.ts';
import {edgePieces, floorPieces} from '../core/pieces.ts';
import {createHistory} from './history.ts';
import {createVersions} from './versions.ts';
import type {FurnitureItem, Plan} from '../core/types.ts';
import type {StoreOp} from './idb.ts';

// A custom colour per thing, none of them one of the catalog's swatches: a step through the colour cube.
const COLOUR_STEP = 0x2f1b37;
const customColour = (i: number): string =>
  '#' + ((0x3a7bd5 + i * COLOUR_STEP) & 0xffffff).toString(16).padStart(6, '0');

// One of every visible catalog model in every variant, in its own custom colour (a rug its border in another).
function everyModel(): FurnitureItem[] {
  const items: FurnitureItem[] = [];
  for (const entry of CATALOG.filter(model => !model.hidden && model.kind === 'gen' && model.id !== 'parts'))
    for (const variant of entry.vars?.map(x => x[0]) || [undefined]) {
      const i = items.length;
      items.push({
        id: `f${i}`,
        model: entry.id,
        x: 1 + (i % 10),
        y: 1 + Math.floor(i / 10),
        w: entry.w,
        d: entry.d,
        h: entry.h,
        rot: 0,
        color: customColour(i),
        ...(entry.color2 ? {color2: customColour(i + 1000)} : {}),
        ...(entry.tops ? {top: customColour(i + 2000)} : {}),
        ...(variant ? {v: variant} : {}),
      });
    }
  return items;
}

// A room with every finish tinted: its walls and floor, one wall of its own, a piece on a wall and one on the floor.
function colourfulPlan(): Plan {
  return migrate({
    id: 'colour-check',
    rooms: [
      {
        id: 'r',
        name: 'Living room',
        polygon: [
          [0, 0],
          [12, 0],
          [12, 16],
          [0, 16],
        ],
        wall: 'paintGrey',
        wallTint: '#8d8f93',
        floor: 'woodLight',
        floorTint: '#b8916a',
        wf: [null, {k: 'wallpaperLinen', tint: '#a1b2c3'}, null, null],
        wp: [[{t: [0.1, 0.4], z: [0.9, 1.5], k: 'tileSubway', tint: '#2f3b52'}], null, null, null],
        fp: [
          {
            poly: [
              [1, 1],
              [3, 1],
              [3, 2],
              [1, 2],
            ],
            k: 'tileGraphite',
            tint: '#5c5e62',
          },
        ],
      },
    ],
    openings: [{kind: 'door', a: [1, 0], b: [1.8, 0]}],
    furniture: [
      ...everyModel(),
      {
        id: 'parts1',
        model: 'parts',
        name: 'Stool',
        x: 6,
        y: 14,
        w: 0.4,
        d: 0.4,
        h: 0.45,
        rot: 0,
        parts: {
          w: 0.4,
          d: 0.4,
          h: 0.45,
          materials: {seat: {color: '#d8b24a', rough: 0.9}, leg: {color: '#27282b', rough: 0.4, metal: 0.6}},
          parts: [
            {kind: 'box', mat: 'seat', size: [0.4, 0.05, 0.4], at: [0, 0.4, 0]},
            {kind: 'cyl', mat: 'leg', r: 0.02, h: 0.4, at: [0, 0, 0]},
          ],
        },
      },
    ],
    lights: [
      {
        id: 'lamp',
        room: 'r',
        color: '#ffb35c',
        body: '#b08d57',
        points: [[5, 5]],
        segments: [],
        h: 2.4,
        placed: true,
      },
    ],
    sensors: [{id: 's', entity: 'sensor.temp', room: 'r', c: '#c0392b'}],
  });
}

// Every colour a plan holds, by where it is: what this test compares after each way back.
function coloursIn(plan: Plan): Record<string, string | null | undefined> {
  const colours: Record<string, string | null | undefined> = {};
  for (const item of plan.furniture) {
    // an item from parts has its colours on its materials only
    if (item.model !== 'parts') colours[`${item.id} ${item.model} ${item.v ?? ''}`] = item.color;
    if (item.color2) colours[`${item.id} border`] = item.color2;
    if (item.top) colours[`${item.id} worktop`] = item.top;
    for (const [name, material] of Object.entries(item.parts?.materials || {}))
      colours[`${item.id} ${name}`] = material.color;
  }
  for (const room of plan.rooms) {
    colours[`${room.id} wall`] = room.wallTint;
    colours[`${room.id} floor`] = room.floorTint;
    room.wf?.forEach((finish, edge) => finish && (colours[`${room.id} wall ${edge}`] = finish.tint));
    room.wp?.forEach((pieces, edge) =>
      pieces?.forEach((piece, j) => (colours[`${room.id} wall ${edge} piece ${j}`] = piece.tint)),
    );
    room.fp?.forEach((piece, j) => (colours[`${room.id} floor piece ${j}`] = piece.tint));
  }
  for (const light of plan.lights) {
    colours[`light ${light.id}`] = light.color;
    colours[`light ${light.id} body`] = light.body;
  }
  for (const sensor of plan.sensors) colours[`sensor ${sensor.id}`] = sensor.c;
  return colours;
}

// A store in memory, as idb.ts's.
function memoryStore(): {get: (key: string) => Promise<unknown>; batch: (ops: StoreOp[]) => Promise<void>} {
  const kept = new Map<string, unknown>();
  return {
    get: async key => structuredClone(kept.get(key)),
    batch: async ops => {
      for (const [op, key, value] of ops)
        op === 'put' ? kept.set(key, structuredClone(value)) : kept.delete(key);
    },
  };
}

test('every custom colour in a plan survives its file, the editor’s load and an export read back', () => {
  const plan = colourfulPlan();
  const colours = coloursIn(plan);
  assert.ok(Object.keys(colours).length > 150, 'every model and variant is in the plan');
  const notCustom = Object.entries(colours).filter(
    ([, colour]) => typeof colour !== 'string' || !/^#[0-9a-f]{6}$/.test(colour),
  );
  assert.deepEqual(notCustom, []);
  // The file as saved (localStorage, Home Assistant) and as exported (pretty-printed, flows.ts download), read back.
  assert.deepEqual(coloursIn(readPlan(JSON.stringify(plan))), colours);
  assert.deepEqual(coloursIn(readPlan(JSON.stringify(plan, null, 1))), colours);
  assert.deepEqual(coloursIn(migrate(structuredClone(plan))), colours);
});

test('a custom colour survives undo and redo, and a version opened again', async () => {
  const plan = colourfulPlan();
  const history = createHistory<Plan>(undefined, {store: memoryStore()});
  history.reset(plan);
  const before = coloursIn(plan);
  plan.furniture[0].color = '#123456';
  plan.rooms[0].wallTint = '#654321';
  history.commit(plan);
  const after = coloursIn(plan);
  assert.deepEqual(coloursIn(history.undo()!), before);
  assert.deepEqual(coloursIn(history.redo()!), after);
  const versions = createVersions({store: memoryStore()});
  await versions.open(plan.id);
  await versions.add(plan, {kind: 'before', what: 'file'});
  assert.deepEqual(coloursIn(JSON.parse(versions.list()[0].plan) as Plan), after);
});

test('the finishes draw their custom colour: walls, floor, a wall of its own and the pieces', () => {
  const plan = colourfulPlan();
  const room = plan.rooms[0];
  assert.equal(wallBase(room.wall!, room.wallTint), '#8d8f93');
  assert.equal(floorBase(room.floor!, room.floorTint), '#b8916a');
  assert.equal(sideWall(room, 1).tint, '#a1b2c3');
  const isWallKind = (key: string): boolean => Object.hasOwn(WALL_KINDS, key);
  const isFloorKind = (key: string): boolean => Object.hasOwn(FLOOR_KINDS, key);
  assert.deepEqual(
    edgePieces(room, 0, isWallKind).map(piece => piece.finish.tint),
    ['#2f3b52'],
  );
  assert.deepEqual(
    floorPieces(room, isFloorKind).map(piece => piece.tint),
    ['#5c5e62'],
  );
});

test('a malformed colour is refused with the file: a lamp body is #rrggbb as an item colour is', () => {
  for (const body of ['#abc', 'brass', '#b08d57ff', 5]) {
    const plan = colourfulPlan();
    Object.assign(plan.lights[0], {body});
    assert.throws(() => readPlan(JSON.stringify(plan)), {message: 'Invalid plan file'}, String(body));
  }
});
