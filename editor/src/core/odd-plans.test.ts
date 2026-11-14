// A plan with one odd thing in it (demo/odd-plans.ts: an unknown model, a size that is not a number, an opening on a wall that is
// not there…) on every typical home: the file check rejects what makes the plan meaningless and opens the rest; whichever way a
// plan arrives (a checked file, or unchecked from Home Assistant, the history, the browser), what draws it — the plan, the 3D's
// furniture and walls, the readings, the dashboard card's walls — does not throw, and the odd thing degrades on its own (D-NEXT).
// The browser half (the 3D view, the 2D plan, Preview and the card in the built editor) is checked by hand with the same plans.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {HOMES} from '../../demo/homes.ts';
import typical from '../../demo/typical.ts';
import {oddPlans} from '../../demo/odd-plans.ts';
import type {OddPlan} from '../../demo/odd-plans.ts';
import {migrate, swingOf, SWING} from './plan.ts';
import {mendPlan} from './plan-mend.ts';
import {readPlan} from './plan-file.ts';
import {syncRuns} from './runs.ts';
import {formFor, heightOf, lampCell, shadeOf, syncFurnStrips} from './fixtures.ts';
import {validate} from './geometry.ts';
import {corners, footRects, furnitureConflicts, outline} from './layout.ts';
import {drawableRooms, planFurniture, planSpots, planWalls, tryPlanWalls} from './plan-scene.ts';
import {liveScene} from './devices.ts';
import {makeObject} from './furniture3d.ts';
import {trimBoxes} from './trim.ts';
import {overview} from './overview.ts';
import {floorColor, floorKind, roomWall, sideWall, wallBase} from './surfaces.ts';
import {CATALOG, modelOf, nameOf, UNKNOWN_KIND} from './catalog.ts';
import {mockHA, haPlanLights, mergePlanLights} from '../editor/ha.ts';
import type {DemoHaData, DemoHaLayer, Plan, PlanInput, PlanLight} from './types.ts';
import type {Item3d} from './furniture3d.ts';

/** The homes the odd plans are made from: the repository's demo and the ten typical homes. */
interface Home {
  id: string;
  HA: DemoHaData;
  DEMO: PlanInput;
}
// (A demo home's plan is a PlanInput but for its lights, which may lack points: migrate takes them as they are.)
async function homes(): Promise<Home[]> {
  const demo = await typical();
  const out: Home[] = [{id: 'typical', HA: demo.HA, DEMO: demo.DEMO as PlanInput}];
  for (const home of HOMES) {
    const loaded = await home.load();
    out.push({id: home.id, HA: loaded.HA, DEMO: loaded.DEMO});
  }
  return out;
}

// migrate tells in the console what it mended: here that is expected, and kept out of the test's output.
function quietly<Result>(run: () => Result): Result {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
  }
}

/**
 * Everything the editor and the card run on a plan to draw it, that runs without a browser; each step's error is collected.
 * Items are built in 3D only where they differ from the plan's base (`drawnBefore`: item id → its JSON): building every item of
 * every case takes minutes, and the furniture tests build each model already. Not `full`: only up to the walls.
 */
function drawUnchecked(
  input: PlanInput,
  ha: DemoHaLayer,
  drawnBefore: Map<string, string>,
  full: boolean,
): {plan: Plan | null; errors: string[]; wallsFailed: boolean} {
  const errors: string[] = [];
  let wallsFailed = false;
  const step = (name: string, run: () => unknown): void => {
    try {
      run();
    } catch (error) {
      errors.push(`${name}: ${(error as Error).message}`);
    }
  };
  let plan: Plan | null = null;
  step('migrate', () => {
    plan = migrate(structuredClone(input));
  });
  if (!plan) return {plan, errors, wallsFailed};
  const drawn: Plan = plan;
  const ctx = {sensors: ha.sensors?.() || [], areas: ha.areas(), state: (e: string) => ha.state?.(e) ?? null};
  step('HA lights', () => {
    drawn.lights = mergePlanLights(drawn.lights, haPlanLights(ha), ha.switches?.() || []);
  });
  step('runs', () => syncRuns(drawn));
  step('strips on furniture', () => syncFurnStrips(drawn));
  step('plan check', () => validate(drawn.rooms));
  // the editor builds the walls when the plan check passes; the card builds them for the rooms that pass it
  step('walls', () => {
    const rooms = drawableRooms(drawn.rooms);
    if (!rooms.length) return;
    const walls = tryPlanWalls({...drawn, rooms});
    if (walls) trimBoxes(rooms, walls.ops);
    else wallsFailed = true;
  });
  if (!full) return {plan: drawn, errors, wallsFailed};
  step('furniture conflicts', () => furnitureConflicts(drawn));
  let items: Item3d[] = [];
  step('3D furniture', () => {
    items = planFurniture(drawn, liveScene(drawn, ha));
  });
  for (const item of items)
    if (drawnBefore.get(item.id) !== JSON.stringify(item)) step(`3D item ${item.id}`, () => makeObject(item));
  for (const item of drawn.furniture)
    step(`2D item ${item.id}`, () => {
      outline(item);
      footRects(item);
      corners(item);
      nameOf(item);
      modelOf(item);
    });
  step('readings', () => planSpots(drawn, ctx));
  for (const light of drawn.lights)
    step(`light ${light.id}`, () => {
      lampCell(drawn, light);
      heightOf(light, formFor(light));
      shadeOf(light);
    });
  for (const room of drawn.rooms)
    step(`finishes ${room.id}`, () => {
      floorKind(room);
      floorColor(room);
      roomWall(room);
      for (let i = 0; i < room.polygon.length; i++) {
        const wall = sideWall(room, i);
        wallBase(wall.k, wall.tint);
      }
    });
  step('Preview overview', () => overview(drawn, ctx, undefined, ha));
  return {plan: drawn, errors, wallsFailed};
}

// The odd plans whose walls may fail to build (tryPlanWalls): an outline crossing itself.
const WALLS_MAY_FAIL = new Set(['room-bow-tie']);

const isGeometry = (odd: OddPlan): boolean =>
  odd.entry?.list === 'rooms' || odd.entry?.list === 'openings' || odd.id.startsWith('walls-');

const verdictOf = (odd: OddPlan): 'rejected' | 'opens' => {
  try {
    quietly(() => readPlan(JSON.stringify(odd.plan)));
    return 'opens';
  } catch {
    return 'rejected';
  }
};

test('every odd plan on every typical home: the file check as expected, and drawn whichever way it comes', async () => {
  const problems: string[] = [];
  let cases = 0;
  for (const [index, home] of (await homes()).entries()) {
    // every case on the first home; on the others the cases of rooms, openings and walls, up to the walls: each home's own
    // outlines find their own geometry (a corner given twice broke the walls of two homes and not the others)
    const full = index === 0;
    const base = quietly(() => migrate(structuredClone(home.DEMO)));
    syncRuns(base);
    const baseHa = mockHA(structuredClone(home.HA));
    const drawnBefore = new Map(
      planFurniture(base, liveScene(base, baseHa)).map(item => [item.id, JSON.stringify(item)]),
    );
    for (const odd of oddPlans(home.DEMO)) {
      if (!full && !isGeometry(odd)) continue;
      cases++;
      const verdict = verdictOf(odd);
      if (verdict !== odd.file)
        problems.push(`${home.id} ${odd.id}: the file check ${verdict}, expected ${odd.file}`);
      const ha = mockHA(structuredClone(home.HA));
      // unchecked (Home Assistant, the history, the browser's save), and as the file check opens it
      const {errors, wallsFailed} = quietly(() => drawUnchecked(odd.plan, ha, drawnBefore, full));
      for (const error of errors) problems.push(`${home.id} ${odd.id}: ${error}`);
      // the walls fail to build only where polygon-clipping gives up on a crossed outline the plan check does not see; the editor
      // and the card keep the rest of the home then
      if (wallsFailed && !WALLS_MAY_FAIL.has(odd.id))
        problems.push(`${home.id} ${odd.id}: the walls failed to build`);
    }
  }
  assert.ok(cases > 400, `only ${cases} odd plans`);
  assert.deepEqual(problems, []);
});

test('a valid plan comes out of the mending exactly as it went in', async () => {
  for (const home of await homes()) {
    const plan = migrate(structuredClone(home.DEMO));
    const before = JSON.stringify(plan);
    assert.deepEqual(mendPlan(plan), [], home.id);
    assert.equal(JSON.stringify(plan), before, home.id);
  }
});

test('one odd entry is degraded on its own: the rest of the plan is all there', async () => {
  const [home] = await homes();
  const base = quietly(() => migrate(structuredClone(home.DEMO)));
  const counts = (plan: Plan): string =>
    [plan.rooms.length, plan.openings.length, plan.furniture.length, plan.lights.length].join(' ');
  for (const odd of oddPlans(home.DEMO)) {
    const plan = quietly(() => migrate(structuredClone(odd.plan)));
    const ids = (list: Array<{id: string}>): Set<string> => new Set(list.map(entry => entry.id));
    // every entry of the base plan other than the odd one is still in it
    const lost = (['rooms', 'openings', 'furniture', 'lights'] as const).flatMap(list => {
      // a list that is not one is the odd thing itself: it is empty now
      if (!Array.isArray(odd.plan[list])) return [];
      const kept = ids(plan[list]);
      return (
        base[list]
          .filter(entry => !kept.has(entry.id) && !(odd.entry?.list === list && odd.entry.id === entry.id))
          // an opening on a room that is left out goes with it
          .filter(entry => !(list === 'openings' && odd.entry?.list === 'rooms'))
          .map(entry => `${list} ${entry.id}`)
      );
    });
    assert.deepEqual(lost, [], `${odd.id} (${counts(plan)})`);
  }
});

test('an unknown model is a plain box of its size, with its name, and the furniture panel can show it', () => {
  const item = {id: 'x', model: 'hoverboard', name: '', x: 0, y: 0, w: 1.2, d: 0.4, h: 0.3, rot: 0} as Item3d;
  const object = makeObject(item);
  assert.equal(object.userData.plainBox, true);
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  assert.deepEqual(
    [size.x, size.y, size.z].map(v => +v.toFixed(3)),
    [1.2, 0.3, 0.4],
  );
  assert.equal(nameOf(item), 'hoverboard');
  assert.equal(modelOf(item).kind, UNKNOWN_KIND);
  assert.equal(modelOf({...item, model: 'bed'}).id, 'bed');
});

test('every catalog model builds itself, not a box, with a variant, colour or worktop it does not know', () => {
  // several odd values at once on one item: each is degraded on its own, so together they show the same
  const odd: Array<Partial<Item3d>> = [
    {v: 'nope', color: 'plaid', color2: 'zz', top: 'nope'},
    {v: 'toString', color: 'toString', top: 'toString', mx: true},
    {w: 0.01, d: 0.01, h: 0.01},
  ];
  const boxes: string[] = [];
  quietly(() => {
    for (const c of CATALOG.filter(entry => entry.kind === 'gen'))
      for (const change of odd) {
        const item = {id: 'x', model: c.id, x: 0, y: 0, rot: 0, w: c.w, d: c.d, h: c.h, ...change} as Item3d;
        if (makeObject(item).userData.plainBox && c.id !== 'parts')
          boxes.push(`${c.id} ${JSON.stringify(change)}`);
      }
  });
  assert.deepEqual(boxes, []);
});

test("a light's unknown form, a door's unknown swing and a light without a height fall back to what the editor knows", () => {
  const light = {id: 'l', form: 'chandelier', h: 2.55, points: [], segments: []} as unknown as PlanLight;
  assert.equal(formFor(light), 'ceiling');
  assert.equal(heightOf({h: undefined}, 'pendant'), 2);
  assert.equal(heightOf({h: undefined, opt: 'table'}, 'lamp'), 0.75);
  assert.equal(swingOf({swing: 17}), SWING[0]);
  assert.equal(swingOf({swing: 2}), SWING[2]);
});

test('the card draws the rooms the plan check passes, not nothing, when one room is drawn wrong', async () => {
  const [home] = await homes();
  const plan = quietly(() => migrate(structuredClone(home.DEMO)));
  const bowTie = plan.rooms[0];
  [bowTie.polygon[0], bowTie.polygon[1]] = [bowTie.polygon[1], bowTie.polygon[0]];
  assert.ok(validate(plan.rooms).length);
  const rooms = drawableRooms(plan.rooms);
  assert.deepEqual(
    rooms.map(room => room.id),
    plan.rooms.slice(1).map(room => room.id),
  );
  assert.ok(planWalls({...plan, rooms}).g);
});
