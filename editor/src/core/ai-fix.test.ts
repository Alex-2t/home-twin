// A fix of an AI-built home taken room by room (D-129): what the fix changed, what the user changed too, and what taking it
// leaves of the user's own edits.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFix,
  contentPrints,
  fixOffer,
  furnitureEdits,
  takeFinishesRound,
  takeFurnitureRound,
  untouchedChoice,
} from './ai-fix.ts';
import {emptyPlan} from './plan.ts';
import type {FurnitureItem, Plan, PlanLight, Room} from './types.ts';

const room = (id: string, name: string, x0: number, x1: number): Room => ({
  id,
  name,
  polygon: [
    [x0, 0],
    [x1, 0],
    [x1, 4],
    [x0, 4],
  ],
});
const item = (id: string, model: string, x: number, y: number, rot = 0): FurnitureItem => ({
  id,
  model,
  x,
  y,
  w: 1,
  d: 1,
  h: 1,
  rot,
});
const light = (id: string, roomId: string): PlanLight => ({id, room: roomId, points: [], segments: []});

/** The build's home the user took: a living room with a sofa and a lamp, a bedroom with a bed. */
function baseHome(): Plan {
  return {
    ...emptyPlan(),
    rooms: [room('r1', 'Living room', 0, 5), room('r2', 'Bedroom', 5, 9)],
    furniture: [item('sofa', 'sofa', 2, 2), item('bed', 'bed', 7, 2)],
    lights: [light('ceiling_1', 'r1'), light('ceiling_2', 'r2')],
  };
}

/** The fix: the sofa turned to the TV and a floor lamp added, in the living room only. */
function fixedHome(): Plan {
  const home = baseHome();
  home.furniture = [
    item('sofa', 'sofa', 2, 2, 180),
    item('lamp', 'floor-lamp', 4, 3),
    item('bed', 'bed', 7, 2),
  ];
  return home;
}

test('a room the fix changed and the user did not is taken as fixed; the rest of their edits stay', () => {
  const local = baseHome();
  // the user moved the bed and renamed the living room since
  local.furniture = [item('sofa', 'sofa', 2, 2), item('bed', 'bed', 6.5, 2)];
  local.rooms[0] = {...local.rooms[0], name: 'Lounge'};
  const offer = fixOffer(local, baseHome(), fixedHome());
  assert.deepEqual(offer, {rooms: [{room: 'r1', name: 'Lounge', changedByUser: false}], walls: null});
  const taken = applyFix(local, fixedHome(), untouchedChoice(offer));
  const byId = new Map(taken.furniture.map(thing => [thing.id, thing]));
  assert.equal(byId.get('sofa')?.rot, 180);
  assert.ok(byId.has('lamp'));
  assert.equal(byId.get('bed')?.x, 6.5, "the user's own move of the bed stays");
  assert.equal(taken.rooms[0].name, 'Lounge', "the user's name for the room stays");
});

test('a room both changed is asked, not taken; keeping it leaves the home as the user has it', () => {
  const local = baseHome();
  // the user put a chair in the living room
  local.furniture = [...local.furniture, item('chair', 'chair', 1, 3)];
  const offer = fixOffer(local, baseHome(), fixedHome());
  assert.deepEqual(offer.rooms, [{room: 'r1', name: 'Living room', changedByUser: true}]);
  assert.deepEqual(untouchedChoice(offer), {rooms: [], walls: false});
  assert.deepEqual(applyFix(local, fixedHome(), {rooms: [], walls: false}), local);
  // taken anyway: the fixed room replaces theirs (the chair goes, the history keeps it)
  const taken = applyFix(local, fixedHome(), {rooms: ['r1'], walls: false});
  assert.deepEqual(taken.furniture.map(thing => thing.id).sort(), ['bed', 'lamp', 'sofa']);
});

test("a room's finishes are its contents: a wall made white is taken with the room", () => {
  const fixed = baseHome();
  fixed.rooms[1] = {...fixed.rooms[1], wall: '#ffffff'};
  const offer = fixOffer(baseHome(), baseHome(), fixed);
  assert.deepEqual(
    offer.rooms.map(changed => changed.room),
    ['r2'],
  );
  const taken = applyFix(baseHome(), fixed, untouchedChoice(offer));
  assert.equal(taken.rooms[1].wall, '#ffffff');
});

test('walls are a part of their own: taken when the user left them, asked when they moved one', () => {
  const fixed = baseHome();
  fixed.rooms[1] = room('r2', 'Bedroom', 5, 9.5);
  assert.deepEqual(fixOffer(baseHome(), baseHome(), fixed).walls, {changedByUser: false});
  const moved = baseHome();
  moved.rooms[1] = room('r2', 'Bedroom', 5, 8.8);
  assert.deepEqual(fixOffer(moved, baseHome(), fixed).walls, {changedByUser: true});
  const local = baseHome();
  local.rooms[1] = {...local.rooms[1], name: 'Kids room'};
  const taken = applyFix(local, fixed, {rooms: [], walls: true});
  assert.equal(taken.rooms[1].polygon[1][0], 9.5);
  assert.equal(taken.rooms[1].name, 'Kids room');
});

test('a fixed item whose id the home uses elsewhere gets a free id; nothing the fix left is offered', () => {
  const local = baseHome();
  local.furniture = [...local.furniture, item('lamp', 'floor-lamp', 7, 3)];
  const taken = applyFix(local, fixedHome(), {rooms: ['r1'], walls: false});
  const ids = taken.furniture.map(thing => thing.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('lamp_2'));
  assert.deepEqual(fixOffer(baseHome(), baseHome(), baseHome()), {rooms: [], walls: null});
});

test("what the user changed is told by the prints taken when the home came in, not by the service's file", () => {
  // the editor changed the home as it opened it (here: a light from HA added to the bedroom); the user changed nothing
  const opened = baseHome();
  opened.lights = [...opened.lights, light('ha_lamp', 'r2')];
  const prints = contentPrints(opened);
  const offer = fixOffer(opened, baseHome(), fixedHome(), prints);
  assert.deepEqual(offer.rooms, [{room: 'r1', name: 'Living room', changedByUser: false}]);
  // then the user moves the sofa: the living room is theirs now too
  const moved = {...opened, furniture: [item('sofa', 'sofa', 1.5, 2), item('bed', 'bed', 7, 2)]};
  assert.equal(fixOffer(moved, baseHome(), fixedHome(), prints).rooms[0].changedByUser, true);
});

// ---------- a round of pins on a home already taken: the furniture only ----------

test('a round after the review takes the things it moved, added and removed, and nothing else of the home', () => {
  const base = baseHome();
  const fixed = structuredClone(base);
  fixed.furniture = [item('sofa', 'sofa', 3, 2), item('desk', 'desk', 6, 1)];
  // the round's own copy knows nothing of the user's: its walls, rooms and lights differ from theirs and must not come over
  fixed.rooms[0].name = 'Lounge';
  fixed.lights = [];
  const local = structuredClone(base);
  local.rooms[0].area = 'living_room';
  local.lights.push(light('strip', 'r1'));
  local.furniture.push(item('plant', 'plant', 1, 1));
  const taken = takeFurnitureRound(local, base, fixed);
  assert.deepEqual(
    taken.plan.furniture.map(thing => [thing.id, thing.x]),
    [
      ['sofa', 3],
      ['plant', 1],
      ['desk', 6],
    ],
  );
  assert.deepEqual([taken.changed, taken.added, taken.removed, taken.kept], [1, 1, 1, 0]);
  assert.equal(taken.plan.rooms[0].name, 'Living room');
  assert.equal(taken.plan.rooms[0].area, 'living_room');
  assert.deepEqual(
    taken.plan.lights.map(lamp => lamp.id),
    ['ceiling_1', 'ceiling_2', 'strip'],
  );
});

test('a thing the user moved or removed since stays theirs when the round changes it too', () => {
  const base = baseHome();
  const fixed = structuredClone(base);
  fixed.furniture = [item('sofa', 'sofa', 3, 2), item('bed', 'bed', 8, 2)];
  const local = structuredClone(base);
  local.furniture = [item('sofa', 'sofa', 2.5, 2)];
  const taken = takeFurnitureRound(local, base, fixed);
  assert.deepEqual(
    taken.plan.furniture.map(thing => [thing.id, thing.x]),
    [['sofa', 2.5]],
  );
  assert.deepEqual([taken.changed, taken.added, taken.removed, taken.kept], [0, 0, 0, 2]);
});

test("a round's fields in another order are the same thing; an added thing whose id is taken gets a free one", () => {
  const base = baseHome();
  const fixed = structuredClone(base);
  const sofa = fixed.furniture[0];
  fixed.furniture[0] = {
    rot: sofa.rot,
    h: sofa.h,
    d: sofa.d,
    w: sofa.w,
    y: sofa.y,
    x: sofa.x,
    model: sofa.model,
    id: sofa.id,
  };
  fixed.furniture.push(item('lamp', 'floorLamp', 1, 3));
  const local = structuredClone(base);
  local.furniture.push(item('lamp', 'plant', 4, 3));
  const taken = takeFurnitureRound(local, base, fixed);
  assert.deepEqual([taken.changed, taken.added, taken.removed, taken.kept], [0, 1, 0, 0]);
  assert.deepEqual(
    taken.plan.furniture.map(thing => thing.id),
    ['sofa', 'bed', 'lamp', 'lamp_2'],
  );
});

test('the things moved by hand in the review are counted, and only they: the home as it came counts none', () => {
  const base = baseHome();
  assert.equal(furnitureEdits(structuredClone(base), base), 0);
  const local = structuredClone(base);
  // the same thing with its keys in another order is no edit
  local.furniture = local.furniture.map(
    thing => Object.fromEntries(Object.entries(thing).reverse()) as FurnitureItem,
  );
  assert.equal(furnitureEdits(local, base), 0);
  local.furniture[0].x += 0.5;
  local.furniture.pop();
  local.furniture.push(item('plant', 'plant', 1, 1));
  assert.equal(furnitureEdits(local, base), 3, 'one moved, one removed, one added');
});

test("a round's floor and walls come into a room the user left as it came; a room the user finished stays theirs", () => {
  const base = baseHome();
  base.rooms[0].floor = 'wood';
  base.rooms[1].floor = 'carpet';
  const fixed = structuredClone(base);
  fixed.rooms[0].floor = 'tile';
  fixed.rooms[0].wall = 'paintNavy';
  fixed.rooms[0].wallTint = '#1c2c58';
  fixed.rooms[1].floor = 'woodLight';
  fixed.rooms[0].name = 'Lounge';
  const local = structuredClone(base);
  local.rooms[1].floor = 'marble';
  local.rooms[0].area = 'living_room';
  const taken = takeFinishesRound(local, base, fixed);
  assert.deepEqual(
    taken.plan.rooms.map(each => [each.id, each.floor, each.wall ?? null, each.wallTint ?? null]),
    [
      ['r1', 'tile', 'paintNavy', '#1c2c58'],
      ['r2', 'marble', null, null],
    ],
  );
  assert.deepEqual([taken.changed, taken.kept], [1, 1]);
  // Only the finish comes: the room's name and link stay the user's.
  assert.equal(taken.plan.rooms[0].name, 'Living room');
  assert.equal(taken.plan.rooms[0].area, 'living_room');
});
