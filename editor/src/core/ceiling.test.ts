// The plan's ceiling height (plan.wall.height): a plan without one is drawn and edited exactly as before; with one the walls go up
// to it and what follows the ceiling follows it (core/ceiling.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import {HOMES} from '../../demo/homes.ts';
import {migrate, emptyPlan, addRoom, addOpening} from './plan.ts';
import {readPlan} from './plan-file.ts';
import {buildPlan2d, ceilingOf, WALL} from './geometry.ts';
import {planWalls, planSpots} from './plan-scene.ts';
import {byId} from './catalog.ts';
import {lightHeights, stripHeight, HEIGHTS, placeForm, lampCell} from './fixtures.ts';
import {heightLimit, fitNewItem, setCeiling, hasOwnCeiling} from './ceiling.ts';
import type {FurnitureItem, Opening, Plan, PlanInput, PlanLight, WallPlan} from './types.ts';

// The top of the walls: the highest band of any wall.
const wallTop = (g: WallPlan): number =>
  Math.max(...g.interior.map(b => b.top), ...g.sides.flatMap(s => s.bands.map(b => b.top)));

const loadHome = async (id: string): Promise<Plan> => {
  const home = HOMES.find(h => h.id === id)!; // one of the ten
  const {DEMO}: {DEMO: PlanInput} = await home.load();
  return migrate(structuredClone(DEMO));
};

// A 4 × 3 m room with a door, a window, a floor-to-ceiling window and the things that meet the ceiling.
function room(): Plan {
  const plan = emptyPlan();
  plan.id = 'plan_ceiling';
  addRoom(plan, [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ]);
  const walls = plan.rooms[0];
  addOpening(plan, walls, 0, 0.6, 'door');
  addOpening(plan, walls, 2, 2, 'window');
  const pano = addOpening(plan, walls, 1, 1.5, 'window')!; // the edge has room for it
  pano.bottom = 0;
  pano.top = WALL.height - 0.1;
  const item = (id: string, model: string, h: number, z?: number): FurnitureItem => ({
    id,
    model,
    w: 1,
    d: 0.6,
    h,
    rot: 0,
    x: 1,
    y: 1,
    ...(z === undefined ? {} : {z}),
  });
  plan.furniture = [
    item('wardrobe', 'wardrobe', 2.7),
    item('curtains', 'curtains', 2.55),
    item('sofa', 'sofa', 0.85),
    item('aircon', 'aircon', 0.29),
    item('cabinets', 'kitchenWall', 1.15, 1.45),
  ];
  const light = (id: string, form: PlanLight['form'], h: number): PlanLight => ({
    id,
    name: id,
    form,
    kind: form === 'strip' ? 'strip' : 'point',
    h,
    points: [[2, 1.5]],
    segments: [],
    placed: true,
    room: 'room_1',
  });
  plan.lights = [
    light('main', 'ceiling', HEIGHTS.ceiling),
    light('pendant', 'pendant', HEIGHTS.pendant),
    light('cove', 'strip', 2.5),
    light('sconce', 'wall', 1.6),
  ];
  return plan;
}
const byIdIn = <Entry extends {id: string}>(list: Entry[], id: string): Entry => list.find(x => x.id === id)!;

test('an old plan without a ceiling height: everything as before', async () => {
  const plan = await loadHome('euro-two');
  assert.equal(plan.wall?.height, undefined);
  assert.equal(hasOwnCeiling(plan), false);
  assert.equal(ceilingOf(plan), 2.6);
  const {g} = planWalls(plan);
  assert.equal(wallTop(g), 2.6);
  assert.equal(g.height, 2.6);
  // the same walls as built before the height was a setting
  const before = buildPlan2d(plan.rooms, planWalls(plan).ops, {outer: plan.wall?.outer ?? undefined});
  assert.deepEqual(g.interior, before.interior);
  assert.deepEqual(g.sides, before.sides);
  // saved and opened again: still no height of its own
  assert.equal(readPlan(JSON.stringify(plan)).wall?.height, undefined);
  // the limits and the heights of new lights are the old ones
  assert.equal(heightLimit(byId('wardrobe')!, plan), 2.7);
  assert.equal(heightLimit(byId('curtains')!, plan), 2.6);
  assert.deepEqual(lightHeights(ceilingOf(plan)), {
    ceiling: 2.55,
    pendant: 2,
    spots: 2.58,
    line: 2.58,
    wall: 1.6,
  });
  assert.equal(stripHeight('top', ceilingOf(plan)), 2.5);
  assert.equal(stripHeight('floor', ceilingOf(plan)), 0.1);
  const curtains: FurnitureItem = {id: 'c', model: 'curtains', w: 2, d: 0.12, h: 2.55, rot: 0, x: 1, y: 1};
  assert.deepEqual(fitNewItem(structuredClone(curtains), plan), curtains);
  // sensor labels hang where they did
  const spots = planSpots(plan, {sensors: [], state: () => null});
  assert.ok(spots.every(s => s.y <= 2.45));
});

test('a 3.0 m plan: the walls, the lights, the curtains and a wardrobe to the ceiling follow it', async () => {
  const plan = room();
  const change = setCeiling(plan, 3);
  assert.equal(plan.wall?.height, 3);
  assert.equal(wallTop(planWalls(plan).g), 3);
  assert.deepEqual(change, {lights: 3, furniture: 3, openings: 1});
  // lights: on the ceiling 5 cm under it, the pendant's cord 20 cm longer, the cove 10 cm under it, the sconce stays
  assert.equal(byIdIn(plan.lights, 'main').h, 2.95);
  assert.equal(byIdIn(plan.lights, 'pendant').h, 2.2);
  assert.equal(byIdIn(plan.lights, 'cove').h, 2.9);
  assert.equal(byIdIn(plan.lights, 'sconce').h, 1.6);
  // things: the curtains and the wardrobe reach the ceiling; the wall cabinets up to it grow from their bottom as far as their
  // model allows (1.2 m); the sofa and the air conditioner stay
  assert.equal(byIdIn(plan.furniture, 'curtains').h, 2.95);
  assert.equal(byIdIn(plan.furniture, 'wardrobe').h, 3);
  assert.equal(byIdIn(plan.furniture, 'cabinets').h, 1.2);
  assert.equal(byIdIn(plan.furniture, 'cabinets').z, 1.45);
  assert.equal(byIdIn(plan.furniture, 'sofa').h, 0.85);
  assert.equal(byIdIn(plan.furniture, 'aircon').z, undefined);
  // openings: the floor-to-ceiling window keeps its 10 cm, the door and the usual window stay
  const tops = plan.openings.map((o: Opening) => [o.kind, o.bottom, o.top]);
  assert.deepEqual(tops, [
    ['door', 0, 2.1],
    ['window', 0.85, 2.4],
    ['window', 0, 2.9],
  ]);
  // the limits: a floor-to-ceiling model up to 3 m, anything else as it was
  assert.equal(heightLimit(byId('wardrobe')!, plan), 3);
  assert.equal(heightLimit(byId('walkIn')!, plan), 2.4);
  // new curtains reach the ceiling; a new ceiling light is on it
  const curtains = fitNewItem({id: 'c', model: 'curtains', w: 2, d: 0.12, h: 2.55, rot: 0, x: 1, y: 1}, plan);
  assert.equal(curtains.h, 2.95);
  const lamp: PlanLight = {id: 'new', name: 'Ceiling light', room: 'room_1', points: [], segments: []};
  placeForm(plan, lamp, 'ceiling', null, lampCell(plan, lamp)!); // the room is there
  assert.equal(lamp.h, 2.95);
  placeForm(plan, lamp, 'strip', 'top', lampCell(plan, lamp)!);
  assert.equal(lamp.h, 2.9);
  placeForm(plan, lamp, 'pendant', null, lampCell(plan, lamp)!);
  assert.equal(lamp.h, 2.2);
  placeForm(plan, lamp, 'ceiling', null, lampCell(plan, lamp)!);
  assert.equal(lamp.h, 2.95);
  // saved and opened again
  const reread = readPlan(JSON.stringify(plan));
  assert.equal(reread.wall?.height, 3);
  assert.equal(ceilingOf(reread), 3);
});

test('a 2.4 m plan: a tall wardrobe is clamped, nothing stays over the ceiling', () => {
  const plan = room();
  setCeiling(plan, 2.4);
  assert.equal(wallTop(planWalls(plan).g), 2.4);
  const item = (id: string): FurnitureItem => byIdIn(plan.furniture, id);
  assert.equal(item('wardrobe').h, 2.4);
  assert.equal(item('curtains').h, 2.35);
  // the air conditioner was hung 15 cm under the old ceiling: it moves down whole; the wall cabinets keep their bottom
  assert.equal(item('aircon').h, 0.29);
  assert.equal(item('aircon').z, 2.11);
  assert.equal(item('cabinets').z, 1.45);
  assert.equal(item('cabinets').h, 0.95);
  for (const f of plan.furniture)
    assert.ok((f.z ?? byId(f.model)?.lift ?? 0) + f.h <= 2.4 + 1e-9, `${f.id} under the ceiling`);
  for (const l of plan.lights) assert.ok(l.h! < 2.4, `${l.id} under the ceiling`);
  assert.equal(byIdIn(plan.lights, 'main').h, 2.35);
  // the floor-to-ceiling window is 10 cm under the ceiling; the usual one comes 10 cm under it too (its curtains' rail above it);
  // the door fits as it is
  assert.deepEqual(
    plan.openings.map(o => o.top),
    [2.1, 2.3, 2.3],
  );
  // the height limit of a wardrobe is the ceiling, and a new one placed by hand is not taller
  assert.equal(heightLimit(byId('wardrobe')!, plan), 2.4);
  const wardrobe = fitNewItem({id: 'w', model: 'wardrobe', w: 1, d: 0.6, h: 2.7, rot: 0, x: 1, y: 1}, plan);
  assert.equal(wardrobe.h, 2.4);
  // back up to the usual height: the things that reached the ceiling reach it again
  setCeiling(plan, 2.6);
  assert.equal(item('wardrobe').h, 2.6);
  assert.equal(item('curtains').h, 2.55);
  assert.equal(byIdIn(plan.lights, 'main').h, 2.55);
});

test('a plan file: a ceiling height is a number within 2.1–4.5 m', () => {
  const file = (wall: unknown): string => JSON.stringify({rooms: [], wall});
  assert.equal(readPlan(file({height: 2.75})).wall?.height, 2.75);
  assert.equal(readPlan(file({outer: 0.3})).wall?.height, undefined);
  for (const bad of [1.5, 9, '2.7', null, true])
    assert.throws(() => readPlan(file({height: bad})), /Invalid plan file/, JSON.stringify(bad));
  // a plan that comes another way (Home Assistant, the history) is not checked like a file: a bad value is the usual walls
  assert.equal(ceilingOf({wall: {height: Number.NaN}}), 2.6);
  assert.equal(ceilingOf({wall: {height: 12}}), 4.5);
  // setCeiling keeps the range too
  const plan = room();
  setCeiling(plan, 1);
  assert.equal(plan.wall?.height, 2.1);
});
