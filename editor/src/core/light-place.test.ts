// D-091 follow-up: one of the owner's Home Assistant lights placed in a room takes the place of a lamp of the same kind
// the AI build saw there (a light without an entity), instead of standing beside it as a second fitting.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {migrate} from './plan.ts';
import {readPlan} from './plan-file.ts';
import {placeForm, lampCell} from './fixtures.ts';
import {autoPlace, placeLight, seenLampsFor} from './light-place.ts';
import {giveSeenBack, isSeenLamp, settleSeen} from './seen-lamps.ts';
import {mergePlanLights} from '../editor/ha.ts';
import {setRoomArea} from './layout.ts';
import {createHistory} from '../editor/history.ts';
import type {Outline, Plan, PlanLight, Point} from './types.ts';

// (The ! below: each light's area has its room on these plans.)
const BEDROOM: Outline = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
];
const KITCHEN: Outline = [
  [4.1, 0],
  [7, 0],
  [7, 3],
  [4.1, 3],
];
const home = (lights: PlanLight[]): Plan => {
  const plan = migrate({
    rooms: [
      {id: 'bed', name: 'Bedroom', polygon: BEDROOM, area: 'bedroom'},
      {id: 'k', name: 'Kitchen', polygon: KITCHEN, area: 'kitchen'},
    ],
    openings: [{kind: 'door', a: [0, 0.2], b: [0, 1]}],
    furniture: [
      {id: 'bed1', model: 'bedDouble', x: 2, y: 2.1, w: 1.6, d: 2, h: 0.5, rot: 180},
      {id: 'n1', model: 'nightstand', x: 0.9, y: 2.75, w: 0.45, d: 0.4, h: 0.55, rot: 180},
      {id: 'n2', model: 'nightstand', x: 3.1, y: 2.75, w: 0.45, d: 0.4, h: 0.55, rot: 180},
    ],
  });
  plan.lights = lights;
  return plan;
};
// A lamp as the AI build makes it from the video (light.ts in the AI build): placed, switched on, no entity.
const seen = (
  id: string,
  room: string,
  form: PlanLight['form'],
  point: Point,
  more: Partial<PlanLight> = {},
): PlanLight => ({
  id,
  name: 'Seen ' + form,
  form,
  kind: 'point',
  h: 2,
  count: 1,
  points: [point],
  segments: [],
  room,
  placed: true,
  on: true,
  ...more,
});
// One of the owner's lights as Home Assistant hands it over: not on the plan yet (ha.ts haPlanLights).
const fromHA = (id: string, name: string, area: string): PlanLight => ({
  id,
  entity: 'light.' + id,
  name,
  area,
  color: '#ffce87',
  kind: 'point',
  on: false,
  placed: false,
  points: [],
  segments: [],
  room: null,
});
const byId = (plan: Plan, id: string): PlanLight => plan.lights.find(light => light.id === id)!;
const seenLeft = (plan: Plan): string[] => plan.lights.filter(isSeenLamp).map(light => light.id);

test('auto-place: an HA pendant takes the place of the pendant the AI build saw, with its shade and height', () => {
  const plan = home([
    seen('r1_i1', 'bed', 'pendant', [1.5, 1.2], {shade: 'woven', h: 1.85, body: '#2a322d'}),
    fromHA('bed_pendant', 'Bedroom pendant', 'bedroom'),
  ]);
  assert.equal(autoPlace(plan), 1);
  assert.deepEqual(seenLeft(plan), [], 'no second pendant beside the seen one');
  assert.equal(plan.lights.length, 1);
  const light = byId(plan, 'bed_pendant');
  assert.equal(light.entity, 'light.bed_pendant');
  assert.equal(light.name, 'Bedroom pendant');
  assert.equal(light.placed, true);
  assert.equal(light.room, 'bed');
  assert.equal(light.form, 'pendant');
  assert.deepEqual(light.points, [[1.5, 1.2]]);
  assert.equal(light.shade, 'woven');
  assert.equal(light.h, 1.85);
  assert.equal(light.body, '#2a322d');
  assert.equal(light.color, '#ffce87', 'its own light colour from HA stays');
  assert.equal(light.on, false, 'its own state from HA stays');
  assert.equal(light.seen?.[0].id, 'r1_i1', 'the seen lamp is kept inside it');
});

test('a floor lamp does not take a table lamp’s place, nor a lamp of another room', () => {
  const tableLamp = seen('r1_i2', 'bed', 'lamp', [0.9, 2.75], {opt: 'table', h: 0.97});
  const kitchenPendant = seen('r2_i1', 'k', 'pendant', [5.5, 1.5]);
  const plan = home([
    tableLamp,
    kitchenPendant,
    fromHA('bed_floor', 'Bedroom floor lamp', 'bedroom'),
    fromHA('bed_pendant', 'Bedroom pendant', 'bedroom'),
  ]);
  const before = structuredClone(plan);
  autoPlace(plan);
  assert.deepEqual(seenLeft(plan), ['r1_i2', 'r2_i1'], 'both seen lamps stay');
  // no match: placed as before the follow-up
  for (const id of ['bed_floor', 'bed_pendant']) {
    const expected = structuredClone(byId(before, id));
    placeForm(before, expected, byId(plan, id).form!, byId(plan, id).opt, lampCell(before, expected)!);
    expected.auto = true;
    assert.deepEqual(byId(plan, id), expected);
  }
});

test('a table lamp takes the place of a seen table lamp; of two, the one nearest to where it would stand', () => {
  const plan = home([
    seen('left', 'bed', 'lamp', [0.9, 2.75], {opt: 'table', h: 0.97}),
    seen('right', 'bed', 'lamp', [3.1, 2.75], {opt: 'table', h: 0.97}),
    fromHA('bedside', 'Bedside table lamp', 'bedroom'),
  ]);
  const cell = lampCell(plan, byId(plan, 'bedside'))!;
  // where the editor would stand it without a seen lamp (on a nightstand)
  const alone = structuredClone(byId(plan, 'bedside'));
  placeForm(plan, alone, 'lamp', 'table', cell);
  const nearest = ['left', 'right'].sort(
    (a, b) =>
      Math.hypot(
        byId(plan, a).points[0][0] - alone.points[0][0],
        byId(plan, a).points[0][1] - alone.points[0][1],
      ) -
      Math.hypot(
        byId(plan, b).points[0][0] - alone.points[0][0],
        byId(plan, b).points[0][1] - alone.points[0][1],
      ),
  )[0];
  autoPlace(plan);
  assert.equal(byId(plan, 'bedside').seen?.[0].id, nearest);
  assert.equal(seenLeft(plan).length, 1, 'the other table lamp stays');
});

test('placed at a point (dragged onto the plan): the seen lamp nearest to that point', () => {
  const plan = home([
    seen('left', 'bed', 'pendant', [1, 1]),
    seen('right', 'bed', 'pendant', [3, 1]),
    fromHA('p', 'Pendant', 'bedroom'),
  ]);
  const light = byId(plan, 'p');
  assert.equal(placeLight(plan, light, 'pendant', undefined, lampCell(plan, light)!, [2.8, 1.4]), true);
  assert.equal(light.seen?.[0].id, 'right');
  assert.deepEqual(light.points, [[3, 1]]);
  assert.deepEqual(seenLeft(plan), ['left']);
});

test('a pair of wall lights on one switch takes two seen sconces', () => {
  const plan = home([
    seen('s1', 'bed', 'wall', [1.25, 0.08], {h: 1.3}),
    seen('s2', 'bed', 'wall', [2.75, 0.08], {h: 1.3}),
    seen('s3', 'bed', 'wall', [3.92, 2.4], {h: 1.6}),
    fromHA('bedside_wall', 'Bedside wall lights', 'bedroom'),
  ]);
  autoPlace(plan);
  const light = byId(plan, 'bedside_wall');
  assert.equal(light.form, 'wall');
  assert.equal(light.count, 2);
  assert.deepEqual(light.seen?.map(lamp => lamp.id).sort(), ['s1', 's2']);
  assert.deepEqual(seenLeft(plan), ['s3']);
});

test('it gives the seen lamp back when it leaves the place: another form, unplaced, another room', () => {
  const pendant = seen('r1_i1', 'bed', 'pendant', [1.5, 1.2], {shade: 'woven'});
  const plan = home([structuredClone(pendant), fromHA('p', 'Bedroom pendant', 'bedroom')]);
  const light = byId(plan, 'p');
  const cell = lampCell(plan, light)!;
  placeLight(plan, light, 'pendant', undefined, cell);
  assert.deepEqual(seenLeft(plan), []);
  // the user says it is a ceiling light: the pendant the video showed is back where it was
  placeLight(plan, light, 'ceiling', undefined, cell);
  assert.equal(light.form, 'ceiling');
  assert.equal(light.seen, undefined);
  assert.deepEqual(byId(plan, 'r1_i1'), pendant);
  // a pendant again: it takes the place again; then it is taken off the plan
  placeLight(plan, light, 'pendant', undefined, cell);
  assert.deepEqual(seenLeft(plan), []);
  giveSeenBack(plan.lights, light);
  assert.deepEqual(byId(plan, 'r1_i1'), pendant);
  assert.equal(light.seen, undefined);
  // moved into the kitchen (no pendant seen there): the bedroom's pendant comes back
  placeLight(plan, light, 'pendant', undefined, cell);
  placeLight(plan, light, 'pendant', undefined, lampCell(plan, {room: 'k'})!);
  assert.equal(light.room, 'k');
  assert.deepEqual(byId(plan, 'r1_i1'), pendant);
});

test('fields put back from a snapshot (the guided step’s “Discard”) settle what the light holds', () => {
  const pendant = seen('r1_i1', 'bed', 'pendant', [1.5, 1.2]);
  const plan = home([structuredClone(pendant), fromHA('p', 'Bedroom pendant', 'bedroom')]);
  const light = byId(plan, 'p');
  const snapshot = structuredClone(light);
  placeLight(plan, light, 'pendant', undefined, lampCell(plan, light)!);
  const held = light.seen;
  for (const key of Object.keys(light)) delete (light as unknown as Record<string, unknown>)[key];
  Object.assign(light, snapshot);
  settleSeen(plan.lights, light, held);
  assert.deepEqual(byId(plan, 'r1_i1'), pendant);
  assert.equal(plan.lights.length, 2);
  // and the other way: a snapshot that holds it takes it out of the list again
  const holding = structuredClone(light);
  placeLight(plan, holding, 'pendant', undefined, lampCell(plan, holding)!);
  plan.lights.push(structuredClone(pendant));
  settleSeen(plan.lights, holding, undefined);
  assert.deepEqual(seenLeft(plan), []);
});

test('undo brings the seen lamp back', () => {
  const plan = home([seen('r1_i1', 'bed', 'pendant', [1.5, 1.2]), fromHA('p', 'Bedroom pendant', 'bedroom')]);
  const history = createHistory<Plan>();
  history.commit(plan);
  autoPlace(plan);
  history.commit(plan);
  const back = history.undo()!;
  assert.deepEqual(seenLeft(back), ['r1_i1']);
  assert.equal(byId(back, 'p').placed, false);
  const again = history.redo()!;
  assert.deepEqual(seenLeft(again), []);
});

test('old plans load unchanged: nothing takes a place by itself', () => {
  const plan = home([
    seen('r1_i1', 'bed', 'pendant', [1.5, 1.2]),
    {
      ...fromHA('p', 'Bedroom pendant', 'bedroom'),
      placed: true,
      room: 'bed',
      form: 'pendant',
      points: [[2, 1]],
    },
  ]);
  const saved = structuredClone(plan);
  assert.deepEqual(migrate(structuredClone(saved)), saved);
  const merged = mergePlanLights(saved.lights, [fromHA('p', 'Bedroom pendant', 'bedroom')]);
  assert.deepEqual(
    merged.filter(isSeenLamp).map(light => light.id),
    ['r1_i1'],
  );
});

test('a plan file with a light holding its seen lamp opens and keeps it', () => {
  const plan = home([seen('r1_i1', 'bed', 'pendant', [1.5, 1.2]), fromHA('p', 'Bedroom pendant', 'bedroom')]);
  autoPlace(plan);
  const file = JSON.parse(JSON.stringify(plan));
  assert.deepEqual(
    readPlan(JSON.stringify(file)),
    file,
    'the file check accepts it, and nothing is mended away',
  );
  // a broken one is left out, as any field that is not one
  const broken = JSON.parse(JSON.stringify(plan));
  broken.lights[0].seen = 'pendant';
  assert.equal(migrate(broken).lights[0].seen, undefined);
});

test('seenLampsFor finds nothing for an HA light when no seen lamp is there', () => {
  const plan = home([fromHA('p', 'Bedroom pendant', 'bedroom')]);
  const light = byId(plan, 'p');
  assert.deepEqual(seenLampsFor(plan, light, 'pendant', undefined, lampCell(plan, light)!), []);
});

test('a room given another area: the auto-placed HA light leaves, the lamp the video showed stays', () => {
  const pendant = seen('r1_i1', 'bed', 'pendant', [1.5, 1.2]);
  const plan = home([structuredClone(pendant), fromHA('p', 'Bedroom pendant', 'bedroom')]);
  autoPlace(plan);
  setRoomArea(plan, plan.rooms[0], 'office', 'Office');
  assert.equal(byId(plan, 'p').placed, false);
  assert.deepEqual(byId(plan, 'r1_i1'), pendant);
});
