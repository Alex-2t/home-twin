// Writes this format's plans into the archive (demo/plan-archive/v<PLAN_VERSION>/, D-121, docs/plan-format.md): each home of
// the reference set (demo/homes.ts) as the editor saves it. Run it once for every new format, before the next one changes the
// code: src/core/plan-archive.test.ts then opens every plan of every format with the code of the day, so a step that loses
// anything fails a test, not a home. The plans of a format are written once and never changed after.
//   node tools/plan-archive.ts            → writes the folder of the current format (refuses if it is there already)
//   node tools/plan-archive.ts --replace  → writes it again (only while that format is not released yet)
import fs from 'node:fs';
import path from 'node:path';
import {HOMES} from '../demo/homes.ts';
import {migrate, PLAN_VERSION} from '../src/core/plan.ts';
import {centroid} from '../src/core/geometry.ts';
import {setRoomArea} from '../src/core/layout.ts';
import {autoPlace as autoLights} from '../src/core/light-place.ts';
import {recommend} from '../src/core/sensors.ts';
import {autoPlace as autoDevices} from '../src/core/devices.ts';
import {syncRuns} from '../src/core/runs.ts';
import {mockHA, haPlanLights, mergePlanLights} from '../src/editor/ha.ts';
import PARTS_EXAMPLES from '../src/core/parts.examples.json' with {type: 'json'};
import type {DemoHaData, Plan, Point, Room} from '../src/core/types.ts';

const ARCHIVE = path.resolve(import.meta.dirname, '../demo/plan-archive');
const folder = path.join(ARCHIVE, `v${PLAN_VERSION}`);
const replace = process.argv.includes('--replace');

if (fs.existsSync(folder) && !replace) {
  console.error(
    `${path.relative(process.cwd(), folder)} is there already: a format's plans are written once.`,
  );
  process.exit(1);
}
// The home every field of the format is in (the reference homes have no wall pieces, sensors, items from parts…): the two-room
// flat after the guided steps, with what the AI build and the editor's panels add. It need not look right, only be a valid plan
// that holds every kind of value, so a step that drops or misreads one is seen.
const BASE_HOME = 'euro-two';
const SQUARE_HALF_METRES = 0.4;

const squareAround = ([x, y]: Point): Point[] => [
  [x - SQUARE_HALF_METRES, y - SQUARE_HALF_METRES],
  [x + SQUARE_HALF_METRES, y - SQUARE_HALF_METRES],
  [x + SQUARE_HALF_METRES, y + SQUARE_HALF_METRES],
  [x - SQUARE_HALF_METRES, y + SQUARE_HALF_METRES],
];
const perEdge = <Value>(room: Room, first: Value): Array<Value | null> =>
  room.polygon.map((_, i) => (i === 0 ? first : null));
const roomArea = (room: Room): number =>
  Math.abs(
    room.polygon.reduce((sum, [x, y], i) => {
      const [nextX, nextY] = room.polygon[(i + 1) % room.polygon.length];
      return sum + x * nextY - nextX * y;
    }, 0) / 2,
  );

function addGuidedSteps(plan: Plan, haData: DemoHaData): void {
  const ha = mockHA(structuredClone(haData));
  for (const room of plan.rooms) {
    const areaName = haData.areas[room.id];
    if (areaName) setRoomArea(plan, room, room.id, areaName);
  }
  plan.lights = mergePlanLights(plan.lights, haPlanLights(ha), ha.switches());
  autoLights(plan);
  const sensorContext = {
    sensors: ha.sensors(),
    areas: ha.areas(),
    state: (entity: string) => ha.state(entity),
  };
  plan.sensors = recommend(plan, sensorContext).map((sensor, i) => ({id: `s${i}`, ...sensor}));
  if (plan.sensors[0]) plan.sensors[0] = {...plan.sensors[0], k: 1.25, c: '#ffcc00', label: 'Air'};
  plan.sensorSkip = ha
    .sensors()
    .slice(-1)
    .map(sensor => sensor.entity);
  autoDevices(plan, ha.devices(), entity => ha.entity(entity));
  plan.onboarding = {
    steps: {rect: 'confirmed', split: 'confirmed', lights: 'in_progress', sensors: 'deferred'},
  };
}

function addFinishes(plan: Plan): void {
  const [first, second] = plan.rooms;
  first.wp = perEdge(first, [
    {
      k: 'tileSubway',
      t: [0.1, 0.6],
      z: [0, 1.2],
      tile: [0.15, 0.075],
      joint: 0.003,
      grout: '#dddddd',
      lay: 'bond',
    },
  ]);
  first.fp = [{poly: squareAround(centroid(first.polygon)), k: 'tile', tint: '#c8b8a0'}];
  second.wf = perEdge(second, {k: 'paintSage', tint: '#a8b8a0'});
  second.wall = 'wallpaperStripe';
  second.wallTint = '#e8e0d0';
  second.wallPattern = {tile: [0.1, 0.1], tint2: '#d0c8b8'};
  second.floor = 'herringbone';
  second.floorTint = null;
  second.floorPattern = {tile: [0.07, 0.35]};
  const last = plan.rooms[plan.rooms.length - 1];
  last.rail = perEdge(last, 1.0);
  last.railGlass = true;
  const smallest = [...plan.rooms].sort((a, b) => roomArea(a) - roomArea(b))[0];
  smallest.solid = true;
  plan.wall = {outer: 0.3, inner: 0.1, height: 2.7};
}

function addItemsAndLamps(plan: Plan): void {
  const room = plan.rooms[1];
  const [x, y] = centroid(room.polygon);
  const sofa = PARTS_EXAMPLES.sofa as unknown as NonNullable<Plan['furniture'][number]['parts']>;
  plan.furniture.push({
    id: 'archive_parts',
    model: 'parts',
    name: 'Sofa from parts',
    x,
    y,
    w: sofa.w,
    d: sofa.d,
    h: sofa.h,
    rot: 90,
    parts: sofa,
  });
  plan.furniture.push({
    id: 'archive_rug',
    model: 'rug',
    x,
    y: y + 0.5,
    w: 1.6,
    d: 1.2,
    h: 0.01,
    rot: 0,
    color: 'sand',
    color2: '#8a5a3a',
    pat: 'stripes',
    patSpec: {layers: [{shape: 'frame', color: 1, inset: 0.05, width: 0.06}], colors: ['#334455']},
  });
  syncRuns(plan);
  const placed = plan.lights.filter(light => light.placed && light.points.length);
  const [lamp, draftLamp] = placed;
  if (lamp)
    lamp.seen = [
      {
        id: 'seen_pendant',
        form: 'pendant',
        shade: 'globe',
        body: '#222222',
        h: 2.2,
        points: [lamp.points[0]],
        segments: [],
        room: lamp.room,
        placed: true,
        auto: true,
      },
    ];
  if (draftLamp) draftLamp.draft = true;
  const doors = plan.openings.filter(opening => opening.kind === 'door');
  if (doors[0]) doors[0].leaf = false;
  if (doors[1]) Object.assign(doors[1], {glass: true, swing: 1});
}

function addPreviewSettings(plan: Plan): void {
  const lightIds = plan.lights.slice(0, 2).map(light => `light:${light.id}`);
  plan.scenes = {
    home: Object.fromEntries(lightIds.map(id => [id, {action: 'on' as const}])),
    night: Object.fromEntries(lightIds.map(id => [id, {action: 'off' as const}])),
  };
  plan.panel = {
    cards: [
      {id: 'lights'},
      {id: 'archive_fav', type: 'entities', title: 'Favourites', entities: ['light.archive']},
    ],
    removed: ['climate'],
  };
  plan.rooms[0].panel = {cards: [{id: 'lights'}]};
  plan.docArea = 54.2;
  plan.docBalcony = true;
  plan.scaleBy = 'rooms';
}

async function fullHome(): Promise<Plan> {
  const base = HOMES.find(home => home.id === BASE_HOME);
  if (!base) throw new Error(`no home ${BASE_HOME} in demo/homes.ts`);
  const {HA, DEMO} = await base.load();
  const plan = migrate(structuredClone(DEMO));
  addGuidedSteps(plan, HA);
  addFinishes(plan);
  addItemsAndLamps(plan);
  addPreviewSettings(plan);
  plan.name = 'Every field';
  return migrate(plan);
}

function write(name: string, plan: Plan): void {
  // a fixed id: the file is the same every time it is written
  plan.id = `plan_archive_${name}`;
  const file = path.join(folder, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(plan) + '\n');
  console.log(
    `${path.relative(process.cwd(), file)}: ${plan.rooms.length} rooms, ${plan.furniture.length} items`,
  );
}

fs.mkdirSync(folder, {recursive: true});
for (const home of HOMES) {
  const {DEMO} = await home.load();
  write(home.id, migrate(structuredClone(DEMO)));
}
write('full', await fullHome());
