// Plans with one odd thing in them: an unknown model, a size that is not a number, an opening on a wall that is not there…
// A plan reaches the editor and the dashboard card from many places (an older or newer editor's file, Home Assistant, the
// version history, the AI build, a hand-edited JSON), and only an imported file goes through the file check (plan-file.ts).
// src/core/odd-plans.test.ts runs each of these through the file check and through what draws a plan; a browser check feeds them
// to the built editor and the card. Each case says what the file check does with it: `rejected` (the plan is meaningless as it
// is) or `opens`; either way, a plan that arrives unchecked must still be drawn, the odd thing degraded on its own.
import {migrate} from '../src/core/plan.ts';
import {byId} from '../src/core/catalog.ts';
import type {FurnitureItem, Plan, PlanInput, PlanLight, Room} from '../src/core/types.ts';

/** What the file check does with an odd plan. */
export type FileVerdict = 'rejected' | 'opens';

/** Which list of the plan holds the odd entry, and its id (none: the odd thing is the plan's own field or a whole list). */
export interface OddEntry {
  list: 'rooms' | 'openings' | 'furniture' | 'lights' | 'sensors' | 'devices';
  id: string;
}

/** One odd plan: its id, what is odd in words, what the file check does, the plan, and the odd entry. */
export interface OddPlan {
  id: string;
  what: string;
  file: FileVerdict;
  plan: PlanInput;
  entry?: OddEntry;
}

/** A plan's entries as plain JSON: an odd case writes into them whatever a broken file could hold. */
type Loose = Record<string, unknown>;

/** The entries of the base plan the cases change: found by what they are, so any home with them will do. */
interface Targets {
  item: FurnitureItem;
  withVariants: FurnitureItem | undefined;
  run: FurnitureItem | undefined;
  rug: FurnitureItem | undefined;
  worktop: FurnitureItem | undefined;
  room: Room;
  openingIndex: number;
  pointLight: PlanLight | undefined;
  lineLight: PlanLight | undefined;
}

const isGenerated = (item: FurnitureItem): boolean =>
  byId(item.model)?.kind === 'gen' && !byId(item.model)?.run;

function findTargets(plan: Plan): Targets {
  const placed = plan.lights.filter(light => light.placed);
  const item = plan.furniture.find(isGenerated) ?? plan.furniture[0];
  if (!item || !plan.rooms.length || !plan.openings.length)
    throw new Error('the base plan needs rooms, openings and furniture');
  return {
    item,
    withVariants: plan.furniture.find(f => isGenerated(f) && (byId(f.model)?.vars?.length ?? 0) > 1),
    run: plan.furniture.find(f => byId(f.model)?.run && f.room),
    rug: plan.furniture.find(f => f.model === 'rug'),
    worktop: plan.furniture.find(f => byId(f.model)?.tops),
    room: plan.rooms[0],
    openingIndex: 0,
    pointLight: placed.find(light => light.points?.length),
    lineLight: placed.find(light => light.segments?.length),
  };
}

/** A case: its id, what is odd, what the file check does, and the change to a copy of the base plan (it may return its entry). */
interface OddCase {
  id: string;
  what: string;
  file: FileVerdict;
  change: (plan: Loose & Plan, targets: Targets) => OddEntry | void;
}

// The same entry in the copy being changed: the targets were found in the base plan.
const itemIn = (plan: Plan, item: FurnitureItem): Loose =>
  plan.furniture.find(f => f.id === item.id) as unknown as Loose;
const lightIn = (plan: Plan, light: PlanLight): Loose =>
  plan.lights.find(l => l.id === light.id) as unknown as Loose;
const roomIn = (plan: Plan, room: Room): Loose => plan.rooms.find(r => r.id === room.id) as unknown as Loose;
const furnitureEntry = (item: FurnitureItem): OddEntry => ({list: 'furniture', id: item.id});
const lightEntry = (light: PlanLight): OddEntry => ({list: 'lights', id: light.id});
const roomEntry = (room: Room): OddEntry => ({list: 'rooms', id: room.id});

/** A change to the main item: one field set to a value. */
const itemField = (id: string, what: string, file: FileVerdict, field: string, value: unknown): OddCase => ({
  id,
  what,
  file,
  change: (plan, {item}) => {
    itemIn(plan, item)[field] = value;
    return furnitureEntry(item);
  },
});
/** A change to the main item: one field taken away. */
const itemWithout = (id: string, what: string, file: FileVerdict, field: string): OddCase => ({
  id,
  what,
  file,
  change: (plan, {item}) => {
    delete itemIn(plan, item)[field];
    return furnitureEntry(item);
  },
});
/** A change to the first room: one field set to a value. */
const roomField = (id: string, what: string, file: FileVerdict, field: string, value: unknown): OddCase => ({
  id,
  what,
  file,
  change: (plan, {room}) => {
    roomIn(plan, room)[field] = value;
    return roomEntry(room);
  },
});
/** A change to the first opening's place on its wall. */
const openingAt = (id: string, what: string, file: FileVerdict, field: string, value: unknown): OddCase => ({
  id,
  what,
  file,
  change: (plan, {openingIndex}) => {
    const opening = plan.openings[openingIndex];
    (opening.at as unknown as Loose)[field] = value;
    return {list: 'openings', id: opening.id};
  },
});
/** A change to the first opening itself. */
const openingField = (
  id: string,
  what: string,
  file: FileVerdict,
  field: string,
  value: unknown,
): OddCase => ({
  id,
  what,
  file,
  change: (plan, {openingIndex}) => {
    const opening = plan.openings[openingIndex];
    (opening as unknown as Loose)[field] = value;
    return {list: 'openings', id: opening.id};
  },
});
/** A change to the first placed point light: one field set to a value. */
const lightField = (id: string, what: string, file: FileVerdict, field: string, value: unknown): OddCase => ({
  id,
  what,
  file,
  change: (plan, {pointLight}) => {
    if (!pointLight) return;
    lightIn(plan, pointLight)[field] = value;
    return lightEntry(pointLight);
  },
});

// A parts item (model 'parts', parts.ts) whose parts are fine: the bad-parts cases break one thing in it.
const GOOD_PARTS = {
  w: 0.5,
  d: 0.5,
  h: 0.9,
  materials: {wood: {color: '#8a6a4a'}},
  parts: [{shape: 'box', at: [0, 0.45, 0], size: [0.5, 0.9, 0.5], mat: 'wood'}],
};
const addPartsItem = (plan: Plan, parts: unknown): OddEntry => {
  const {item} = findTargets(plan);
  const odd = {
    ...item,
    id: 'odd-parts',
    model: 'parts',
    name: 'Odd cabinet',
    parts,
  } as unknown as FurnitureItem;
  delete odd.v;
  plan.furniture.push(odd);
  return {list: 'furniture', id: odd.id};
};

const CASES: OddCase[] = [
  // ---------- furniture ----------
  itemField('model-unknown', 'a furniture model this editor does not know', 'opens', 'model', 'hoverboard'),
  itemField('model-empty', 'a furniture item with an empty model', 'rejected', 'model', ''),
  itemWithout('model-missing', 'a furniture item without a model', 'rejected', 'model'),
  itemField('model-number', 'a model that is a number', 'rejected', 'model', 42),
  {
    id: 'run-model-unknown',
    what: 'a built-in run whose model is unknown',
    file: 'opens',
    change: (plan, {run}) => {
      if (!run) return;
      itemIn(plan, run).model = 'kitchenIsland3000';
      return furnitureEntry(run);
    },
  },
  {
    id: 'variant-unknown',
    what: 'a variant the model does not have',
    file: 'opens',
    change: (plan, {withVariants}) => {
      if (!withVariants) return;
      itemIn(plan, withVariants).v = 'hexagonal';
      return furnitureEntry(withVariants);
    },
  },
  {
    id: 'run-variant-unknown',
    what: 'a built-in run in a variant it does not have',
    file: 'opens',
    change: (plan, {run}) => {
      if (!run) return;
      itemIn(plan, run).v = 'folding';
      return furnitureEntry(run);
    },
  },
  itemField('colour-unknown', 'a colour name the catalog does not have', 'opens', 'color', 'plaid'),
  itemField('colour-not-colour', 'a colour that is not a colour', 'rejected', 'color', 'not a colour!'),
  itemField('colour-number', 'a colour that is a number', 'rejected', 'color', 12),
  {
    id: 'colour2-bad',
    what: "a rug's border colour that is not a colour",
    file: 'rejected',
    change: (plan, {rug}) => {
      if (!rug) return;
      itemIn(plan, rug).color2 = 'zz#';
      return furnitureEntry(rug);
    },
  },
  {
    id: 'top-unknown',
    what: 'a worktop the catalog does not have',
    file: 'opens',
    change: (plan, {worktop}) => {
      if (!worktop) return;
      itemIn(plan, worktop).top = 'marble';
      return furnitureEntry(worktop);
    },
  },
  itemField('size-negative', 'a negative width', 'opens', 'w', -1.2),
  itemField('size-zero', 'a height of zero', 'opens', 'h', 0),
  itemField('size-huge', 'a width of a kilometre', 'opens', 'w', 1000),
  itemField('size-null', 'a depth that is not a number (NaN in JSON is null)', 'rejected', 'd', null),
  itemField('size-nan', 'a depth that is NaN (a plan handed over in memory)', 'rejected', 'd', NaN),
  itemField('size-string', 'a width written as text', 'rejected', 'w', '2'),
  itemWithout('size-missing', 'an item without a height', 'rejected', 'h'),
  itemField('position-null', 'an item whose x is not a number', 'rejected', 'x', null),
  itemWithout('position-missing', 'an item without a y', 'rejected', 'y'),
  itemField('position-far', 'an item 10 km away', 'opens', 'x', 10000),
  itemField('rotation-text', 'a rotation written as text', 'rejected', 'rot', 'left'),
  itemField('rotation-null', 'a rotation that is not a number', 'rejected', 'rot', null),
  itemField('lift-negative', 'an item lifted below the floor', 'opens', 'z', -3),
  itemField('lift-null', 'a lift that is not a number', 'rejected', 'z', null),
  itemField('mirror-text', 'mirrored written as text', 'opens', 'mx', 'yes'),
  itemField('name-number', 'an own name that is a number', 'opens', 'name', 5),
  itemField('top-number', 'a worktop that is a number', 'rejected', 'top', 3),
  itemField('unknown-field', 'a field this editor does not know', 'opens', 'sparkle', {a: 1}),
  {
    id: 'run-room-missing',
    what: 'a built-in run in a room that is not there',
    file: 'opens',
    change: (plan, {run}) => {
      if (!run) return;
      itemIn(plan, run).room = 'nowhere';
      return furnitureEntry(run);
    },
  },
  {
    id: 'run-ends-bad',
    what: 'a built-in run whose ends are not points',
    file: 'opens',
    change: (plan, {run}) => {
      if (!run) return;
      itemIn(plan, run).a = [null, 1];
      itemIn(plan, run).b = 'there';
      return furnitureEntry(run);
    },
  },
  {
    id: 'parts-bad',
    what: 'an item from parts with a part that is not buildable',
    file: 'rejected',
    change: plan =>
      addPartsItem(plan, {...GOOD_PARTS, parts: [{shape: 'box', at: [0, 0, 0], size: 'big', mat: 'wood'}]}),
  },
  {
    id: 'parts-missing',
    what: 'an item from parts without its parts',
    file: 'rejected',
    change: plan => addPartsItem(plan, undefined),
  },
  {
    id: 'parts-not-object',
    what: 'an item from parts whose parts are text',
    file: 'rejected',
    change: plan => addPartsItem(plan, 'a chair'),
  },
  {
    id: 'parts-unknown-material',
    what: 'an item from parts whose part names a material it does not have',
    file: 'rejected',
    change: plan => addPartsItem(plan, {...GOOD_PARTS, parts: [{...GOOD_PARTS.parts[0], mat: 'gold'}]}),
  },
  {
    id: 'parts-on-catalog-model',
    what: 'a catalog item that carries bad parts',
    file: 'rejected',
    change: (plan, {item}) => {
      itemIn(plan, item).parts = {w: 1};
      return furnitureEntry(item);
    },
  },
  {
    id: 'furniture-entry-text',
    what: 'a furniture entry that is text, not an item',
    file: 'rejected',
    change: plan => {
      (plan.furniture as unknown[]).push('chair');
    },
  },
  {
    id: 'furniture-entry-null',
    what: 'a furniture entry that is null',
    file: 'rejected',
    change: plan => {
      (plan.furniture as unknown[]).push(null);
    },
  },
  {
    id: 'furniture-id-twice',
    what: 'two items with one id',
    file: 'rejected',
    change: (plan, {item}) => {
      plan.furniture.push({...item, x: item.x + 0.5});
      return furnitureEntry(item);
    },
  },
  {
    id: 'furniture-not-list',
    what: 'a furniture list that is an object',
    file: 'rejected',
    change: plan => {
      (plan as Loose).furniture = {sofa: true};
    },
  },
  // ---------- rooms ----------
  roomField('room-two-points', 'a room with two corners', 'rejected', 'polygon', [
    [0, 0],
    [3, 0],
  ]),
  roomField('room-no-points', 'a room with no corners', 'rejected', 'polygon', []),
  roomField('room-point-null', 'a room corner that is not a number', 'rejected', 'polygon', [
    [0, 0],
    [3, 0],
    [null, 3],
  ]),
  roomField('room-point-text', 'room corners written as text', 'rejected', 'polygon', [
    ['0', '0'],
    ['3', '0'],
    ['3', '3'],
  ]),
  {
    id: 'room-polygon-missing',
    what: 'a room without an outline',
    file: 'rejected',
    change: (plan, {room}) => {
      delete roomIn(plan, room).polygon;
      return roomEntry(room);
    },
  },
  {
    id: 'room-bow-tie',
    what: 'a room whose outline crosses itself',
    file: 'opens',
    change: (plan, {room}) => {
      const polygon = roomIn(plan, room).polygon as number[][];
      // the first two corners swapped: the outline crosses itself
      [polygon[0], polygon[1]] = [polygon[1], polygon[0]];
      return roomEntry(room);
    },
  },
  {
    id: 'room-corner-twice',
    what: 'a room with one corner twice (an edge of zero length)',
    file: 'opens',
    change: (plan, {room}) => {
      const polygon = roomIn(plan, room).polygon as number[][];
      polygon.splice(1, 0, [...polygon[1]]);
      return roomEntry(room);
    },
  },
  roomField('floor-unknown', 'a floor finish this editor does not know', 'opens', 'floor', 'lava'),
  roomField('wall-unknown', 'a wall finish this editor does not know', 'opens', 'wall', 'velvet'),
  roomField('floor-number', 'a floor finish that is a number', 'opens', 'floor', 7),
  roomField('floor-tint-bad', 'a floor tint that is not a colour', 'opens', 'floorTint', 'reddish'),
  roomField('wall-tint-bad', 'a wall tint that is not a colour', 'opens', 'wallTint', 12),
  roomField('edge-finish-unknown', 'an edge finish this editor does not know', 'opens', 'wf', [
    {k: 'velvet', tint: 'x'},
  ]),
  roomField('edge-finish-no-key', 'an edge finish without its key', 'opens', 'wf', [{tint: '#123456'}]),
  roomField('edge-finish-text', 'edge finishes written as text', 'rejected', 'wf', ['paint']),
  roomField('edge-thickness-negative', 'a negative wall thickness', 'opens', 'wt', [-0.2, 5]),
  roomField('edge-thickness-text', 'a wall thickness written as text', 'rejected', 'wt', ['thick']),
  roomField(
    'edge-lists-long',
    'edge lists longer than the room has edges',
    'opens',
    'wt',
    new Array(40).fill(0.2),
  ),
  roomField('wall-pieces-bad', 'pieces of wall finish with bad values', 'opens', 'wp', [
    [{k: 'velvet', t: [0.8, 0.2], z: ['a', 3]}, {k: 'tile', tile: [0, -1], joint: 'x'}, {t: 'all'}],
  ]),
  roomField('floor-pieces-bad', 'pieces of floor finish with bad values', 'opens', 'fp', [
    {
      poly: [
        [0, 0],
        [1, 0],
      ],
      k: 'lava',
    },
    {
      poly: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      k: 7,
      tint: 'x',
    },
  ]),
  roomField('railing-negative', 'a negative railing height', 'rejected', 'rail', [-1]),
  roomField('railing-huge', 'a railing 50 m high', 'opens', 'rail', [50]),
  roomField('zone-flat', 'a zone line of zero length', 'opens', 'zone', {a: [1, 1], b: [1, 1], left: true}),
  roomField('zone-bad', 'a zone line whose ends are not points', 'rejected', 'zone', {a: 'here', b: [1, 1]}),
  roomField('room-name-number', 'a room name that is a number', 'rejected', 'name', 7),
  roomField('room-solid-text', 'solid written as text', 'opens', 'solid', 'yes'),
  roomField('room-panel-bad', "a room screen's layout that is not one", 'rejected', 'panel', {cards: 'all'}),
  {
    id: 'room-entry-null',
    what: 'a room entry that is null',
    file: 'rejected',
    change: plan => {
      (plan.rooms as unknown[]).push(null);
    },
  },
  {
    id: 'room-id-missing',
    what: 'a room without an id',
    file: 'rejected',
    change: (plan, {room}) => {
      delete roomIn(plan, room).id;
      return roomEntry(room);
    },
  },
  // ---------- openings ----------
  openingAt('opening-room-missing', 'an opening on a room that is not there', 'rejected', 'room', 'nowhere'),
  openingAt('opening-edge-missing', 'an opening on an edge the room does not have', 'rejected', 'edge', 99),
  openingAt('opening-edge-text', 'an opening whose edge is text', 'rejected', 'edge', 'north'),
  openingAt('opening-place-null', 'an opening whose start is not a number', 'rejected', 's0', null),
  openingAt('opening-reversed', 'an opening whose end comes before its start', 'opens', 's0', 3.5),
  openingAt('opening-beyond', 'an opening running past the end of its wall', 'opens', 's1', 40),
  openingAt(
    'opening-off-wall-null',
    'an opening whose offset from the wall is not a number',
    'rejected',
    'd',
    null,
  ),
  openingField(
    'opening-kind-unknown',
    'an opening of a kind this editor does not know',
    'rejected',
    'kind',
    'portal',
  ),
  openingField(
    'opening-heights-reversed',
    'an opening whose top is below its bottom',
    'opens',
    'bottom',
    2.5,
  ),
  openingField('opening-bottom-null', 'an opening whose bottom is not a number', 'rejected', 'bottom', null),
  openingField('opening-swing-unknown', 'a door swing this editor does not know', 'opens', 'swing', 17),
  openingField('opening-glass-text', 'glazed written as text', 'rejected', 'glass', 'yes'),
  {
    id: 'opening-place-missing',
    what: 'an opening with no place: neither on a wall nor its ends',
    file: 'rejected',
    change: (plan, {openingIndex}) => {
      const opening = plan.openings[openingIndex] as unknown as Loose;
      delete opening.at;
      delete opening.a;
      delete opening.b;
      return {list: 'openings', id: String(opening.id)};
    },
  },
  {
    id: 'opening-entry-null',
    what: 'an opening entry that is null',
    file: 'rejected',
    change: plan => {
      (plan.openings as unknown[]).push(null);
    },
  },
  // ---------- lights ----------
  lightField(
    'light-form-unknown',
    'a light fitting this editor does not know',
    'opens',
    'form',
    'chandelier',
  ),
  lightField(
    'light-option-unknown',
    "a fitting's option this editor does not know",
    'opens',
    'opt',
    'zigzag',
  ),
  lightField('light-shade-unknown', 'a shade this editor does not know', 'opens', 'shade', 'disco'),
  lightField('light-body-bad', "a fitting's body colour that is not a colour", 'rejected', 'body', 'red'),
  lightField('light-colour-bad', "a light's colour that is not a colour", 'opens', 'color', 'warm-ish'),
  lightField('light-point-null', 'a light point that is not a number', 'rejected', 'points', [[null, 1]]),
  lightField('light-points-text', 'light points written as text', 'rejected', 'points', 'here'),
  lightField('light-height-negative', 'a light below the floor', 'opens', 'h', -1),
  lightField('light-height-null', 'a light height that is not a number', 'rejected', 'h', null),
  lightField('light-count-many', 'a fitting of a million spots', 'opens', 'count', 1e6),
  lightField('light-count-negative', 'a negative count of spots', 'opens', 'count', -3),
  lightField('light-room-missing', 'a light in a room that is not there', 'opens', 'room', 'nowhere'),
  lightField(
    'light-part-of-missing',
    'a light that is part of a fitting not on the plan',
    'opens',
    'with',
    'ghost',
  ),
  lightField('light-was-bad', "a light's saved step that is not JSON", 'rejected', 'was', {k: 'x', s: '{'}),
  {
    id: 'light-segment-bad',
    what: 'a line light whose piece has one end',
    file: 'rejected',
    change: (plan, {lineLight}) => {
      if (!lineLight) return;
      lightIn(plan, lineLight).segments = [[[0, 0]]];
      return lightEntry(lineLight);
    },
  },
  {
    id: 'line-form-unknown',
    what: 'a line light of a form this editor does not know',
    file: 'opens',
    change: (plan, {lineLight}) => {
      if (!lineLight) return;
      lightIn(plan, lineLight).form = 'neon';
      lightIn(plan, lineLight).opt = 'zigzag';
      return lightEntry(lineLight);
    },
  },
  {
    id: 'light-entry-null',
    what: 'a light entry that is null',
    file: 'rejected',
    change: plan => {
      (plan.lights as unknown[]).push(null);
    },
  },
  // ---------- sensors and devices ----------
  {
    id: 'sensor-room-missing',
    what: 'a sensor in a room that is not there',
    file: 'opens',
    change: plan => {
      plan.sensors.push({id: 'odd-sensor', entity: 'sensor.odd_temperature', room: 'nowhere'});
      return {list: 'sensors', id: 'odd-sensor'};
    },
  },
  {
    id: 'sensor-size-odd',
    what: "a sensor's size of digits below zero, pinned far off its room",
    file: 'opens',
    change: (plan, {room}) => {
      plan.sensors.push({
        id: 'odd-sensor',
        entity: 'sensor.odd_temperature',
        room: room.id,
        k: -2,
        at: [900, 900],
      });
      return {list: 'sensors', id: 'odd-sensor'};
    },
  },
  {
    id: 'device-item-missing',
    what: 'a device on an item that is not there',
    file: 'opens',
    change: plan => {
      plan.devices.push({id: 'odd-device', entity: 'cover.odd_curtain', furn: 'ghost'});
      return {list: 'devices', id: 'odd-device'};
    },
  },
  {
    id: 'device-opening-missing',
    what: 'a contact sensor on an opening that is not there',
    file: 'opens',
    change: plan => {
      plan.devices.push({id: 'odd-device', entity: 'binary_sensor.odd_window', opening: 'ghost'});
      return {list: 'devices', id: 'odd-device'};
    },
  },
  {
    id: 'device-on-unknown-model',
    what: 'an air conditioner whose item has an unknown model',
    file: 'opens',
    change: (plan, {item}) => {
      itemIn(plan, item).model = 'hoverboard';
      plan.devices.push({id: 'odd-device', entity: 'climate.odd_ac', furn: item.id});
      return furnitureEntry(item);
    },
  },
  // ---------- the plan itself ----------
  {
    id: 'walls-negative',
    what: 'negative wall thicknesses for the whole plan',
    file: 'opens',
    change: plan => {
      plan.wall = {outer: -1, inner: -0.1};
    },
  },
  {
    id: 'walls-text',
    what: 'wall thicknesses written as text',
    file: 'rejected',
    change: plan => {
      (plan as Loose).wall = {outer: 'thick'};
    },
  },
  {
    id: 'view-bad',
    what: 'a home view whose numbers are not numbers',
    file: 'rejected',
    change: plan => {
      (plan as Loose).view = {t: [null, 0, 0], theta: 'a', phi: 1, fit: [1]};
    },
  },
  {
    id: 'view-flat',
    what: 'a home view framing nothing',
    file: 'opens',
    change: plan => {
      plan.view = {t: [0, 0, 0], theta: 0, phi: 0, fit: [0, 0]};
    },
  },
  {
    id: 'scenes-bad',
    what: 'Preview scenes that are not scenes',
    file: 'rejected',
    change: plan => {
      (plan as Loose).scenes = {home: {'light:x': 'on'}};
    },
  },
  {
    id: 'panel-bad',
    what: 'an overview layout that is not one',
    file: 'rejected',
    change: plan => {
      (plan as Loose).panel = {cards: [{}]};
    },
  },
  {
    id: 'plan-unknown-fields',
    what: 'fields this editor does not know, on the plan and on every entry',
    file: 'opens',
    change: plan => {
      (plan as Loose).floors = [{level: 2}];
      for (const list of [plan.rooms, plan.openings, plan.furniture, plan.lights])
        for (const entry of list) (entry as unknown as Loose).futureField = {nested: [1, 'two']};
    },
  },
  {
    id: 'plan-version-future',
    what: 'a plan from a newer editor',
    file: 'rejected',
    change: plan => {
      plan.version = 99;
    },
  },
];

/**
 * Every odd case on a copy of the given plan (it should have rooms, openings, furniture and placed lights; a case whose kind
 * of entry the plan lacks is left out). The plans are what a broken file could hold: NaN is kept where a case puts it.
 */
export function oddPlans(base: PlanInput): OddPlan[] {
  const start = migrate(structuredClone(base));
  const targets = findTargets(start);
  const out: OddPlan[] = [];
  for (const odd of CASES) {
    const plan = structuredClone(start) as Loose & Plan;
    const changed = structuredClone(plan);
    const entry = odd.change(plan, targets);
    // a case the plan has nothing for changes nothing: left out
    if (JSON.stringify(plan) === JSON.stringify(changed)) continue;
    out.push({id: odd.id, what: odd.what, file: odd.file, plan, entry: entry || undefined});
  }
  return out;
}
