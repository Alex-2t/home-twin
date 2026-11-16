// An opening's hole goes through its own wall and no further. A hole as wide as the thickest wall on both sides of the opening's
// line, with an end inside the wall across the edge's end (an opening pushed into a corner), cut a sliver out of that wall: on the
// plan the wall stepped in next to the window. Checked on the repository's demo and the ten typical homes, opening by opening.
import test from 'node:test';
import assert from 'node:assert/strict';
import pc from 'polygon-clipping';
import {HOMES} from '../../demo/homes.ts';
import typical from '../../demo/typical.ts';
import {migrate} from './plan.ts';
import {planWalls} from './plan-scene.ts';
import {area, openingCoords, WALL, wallsAt} from './geometry.ts';
import type {MultiPolygon, Opening, Plan, PlanInput, Point} from './types.ts';

/** How far past the wall's inner face a hole may cut into the room's side, m: its 1 cm overshoot and a millimetre of rounding. */
const INSIDE_SLACK_M = 0.012;
/** A removed piece smaller than this, m², is rounding where the hole's side lies on a wall's face. */
const SLIVER_M2 = 2e-5;

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

/** The homes' plans: the repository's demo and the ten typical homes. */
async function plans(): Promise<Array<{id: string; plan: Plan}>> {
  const demo = await typical();
  const out = [{id: 'typical', plan: quietly(() => migrate(demo.DEMO as PlanInput))}];
  for (const home of HOMES) {
    const loaded = await home.load();
    out.push({id: home.id, plan: quietly(() => migrate(loaded.DEMO))});
  }
  return out;
}

const areaOf = (mp: MultiPolygon): number =>
  mp.reduce((total, [outer, ...holes]) => {
    const holesArea = holes.reduce((sum, ring) => sum + Math.abs(area(ring.slice(0, -1))), 0);
    return total + Math.abs(area(outer.slice(0, -1))) - holesArea;
  }, 0);

/** The opening where it is, and moved along its edge right into each corner (as far as the plan's limits let it). */
function placements(plan: Plan, opening: Opening): Opening[] {
  const ring = plan.rooms.find(r => r.id === opening.at.room)?.polygon;
  if (!ring) return [];
  const a = ring[opening.at.edge];
  const b = ring[(opening.at.edge + 1) % ring.length];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const width = Math.abs(opening.at.s1 - opening.at.s0);
  const moved = (s0: number): Opening => ({...opening, at: {...opening.at, s0, s1: s0 + width}});
  return [opening, moved(0), moved(length - width)];
}

/** The walls in section at the opening's middle height, with the plan's other openings, and the opening itself if `withIt`. */
function walls(plan: Plan, opening: Opening, withIt: boolean): MultiPolygon {
  const others = plan.openings.filter(o => o.id !== opening.id);
  const openings = withIt ? [...others, opening] : others;
  const middle = ((opening.bottom ?? 0) + (opening.top ?? plan.wall?.height ?? 2.6)) / 2;
  return wallsAt(planWalls({...plan, openings}).g, middle);
}

/**
 * The strip on the room's side of the opening's edge, past the wall's inner face, along the opening: a hole has nothing to cut
 * there but a wall across the edge's end.
 */
function roomSide(plan: Plan, opening: Opening): MultiPolygon | null {
  const placed = openingCoords(plan.rooms, opening);
  const room = plan.rooms.find(r => r.id === opening.at.room);
  if (!placed || !room) return null;
  const ring = room.polygon;
  const a = ring[opening.at.edge];
  const b = ring[(opening.at.edge + 1) % ring.length];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const sign = area(ring) > 0 ? 1 : -1;
  const inward: Point = [-u[1] * sign, u[0] * sign];
  const along = (q: Point): number => (q[0] - a[0]) * u[0] + (q[1] - a[1]) * u[1];
  const from = Math.min(along(placed.a), along(placed.b));
  const to = Math.max(along(placed.a), along(placed.b));
  const near = WALL.inner + INSIDE_SLACK_M;
  const far = 1;
  const at = (s: number, k: number): [number, number] => [
    a[0] + u[0] * s + inward[0] * k,
    a[1] + u[1] * s + inward[1] * k,
  ];
  return [[[at(from, near), at(to, near), at(to, far), at(from, far), at(from, near)]]];
}

test('an opening cuts only its own wall: nothing is removed on the room side past the inner face', async () => {
  const bites: string[] = [];
  let checked = 0;
  for (const {id, plan} of await plans()) {
    for (const placed of plan.openings) {
      const before = walls(plan, placed, false);
      for (const opening of placements(plan, placed)) {
        const strip = roomSide(plan, opening);
        if (!strip) continue;
        checked++;
        const removed = pc.difference(before, walls(plan, opening, true));
        const bitten = areaOf(pc.intersection(removed, strip));
        if (bitten > SLIVER_M2)
          bites.push(`${id} ${opening.id} s0=${opening.at.s0}: ${(bitten * 1e4).toFixed(1)} cm²`);
      }
    }
  }
  assert.ok(checked > 150, `checked ${checked} openings`);
  assert.deepEqual(bites, []);
});
