// A robot vacuum's route in the typical homes that have one (demo/homes.ts): it leaves its dock, gets into every room it can
// reach, comes back onto the dock, and its body never touches a wall or a piece of furniture standing on the floor — checked
// against the plan's own shapes, not the grid the route is made on.
import test from 'node:test';
import assert from 'node:assert/strict';
import {HOMES} from '../../demo/homes.ts';
import {emptyPlan, migrate} from './plan.ts';
import {pointIn, wallsAt} from './geometry.ts';
import {byId, zOf} from './catalog.ts';
import {outline} from './layout.ts';
import {isRun} from './runs.ts';
import {planWalls} from './plan-scene.ts';
import {cleaningRoute, placeOnRoute, routeHome, routeLength, robotOnDock, vacuumMap} from './vacuum-route.ts';
import type {Outline, Plan, Point} from './types.ts';

// the grid is 5 cm: the body may come this much closer than its radius to what it keeps clear of
const GRID_TOLERANCE_M = 0.035;
const SAMPLE_M = 0.02;

function edgeDistance(p: Point, ring: Outline): number {
  let nearest = Infinity;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const along = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (abx * abx + aby * aby || 1e-12)),
    );
    nearest = Math.min(nearest, Math.hypot(p[0] - a[0] - abx * along, p[1] - a[1] - aby * along));
  });
  return nearest;
}

// how far the robot's centre is from a shape: 0 inside it
const clearance = (p: Point, ring: Outline): number => (pointIn(p, ring) ? 0 : edgeDistance(p, ring));

for (const home of HOMES) {
  test(`robot vacuum route: ${home.id}`, async t => {
    const {DEMO} = await home.load();
    const plan: Plan = migrate(structuredClone(DEMO));
    const dock = plan.furniture.find(f => f.model === 'robotVacuum');
    if (!dock) return t.skip('no robot vacuum in this home');
    const walls = planWalls(plan).g;
    const map = vacuumMap({rooms: plan.rooms, furniture: plan.furniture, lights: plan.lights}, walls, dock);
    assert.ok(map, 'the robot can leave its dock');
    const route = cleaningRoute(map);
    const last = route[route.length - 1];
    assert.deepEqual(last.p, map.home, 'it ends on its dock');
    assert.ok(last.reverse, 'backing onto it');
    assert.ok(routeLength(route, map.home) > 5, 'it goes somewhere');

    // every room it can get to, it drives through
    const visited = new Set<string>();
    const reachable = new Set<string>();
    for (let cell = 0; cell < map.free.length; cell++)
      if (map.free[cell] && map.room[cell] >= 0) reachable.add(plan.rooms[map.room[cell]].id);
    const length = routeLength(route, map.home);
    const samples: Point[] = [];
    for (let at = 0; at <= length; at += SAMPLE_M)
      samples.push(placeOnRoute(route, map.home, map.homeHeading, at).p);
    for (const p of samples) {
      const room = plan.rooms.find(r => pointIn(p, r.polygon));
      if (room) visited.add(room.id);
    }
    assert.deepEqual(
      [...reachable].filter(id => !visited.has(id)),
      [],
      'rooms it never got into',
    );

    // its body touches no wall and nothing standing on the floor (off its dock: on it, it sits against the dock)
    const {radius} = robotOnDock(dock);
    const wallRings = wallsAt(walls, 0.05).map(polygon => polygon[0]);
    const standing = plan.furniture.filter(
      f => f.id !== dock.id && zOf(f) < 0.11 && !byId(f.model)?.soft && !isRun(f),
    );
    const offDock = samples.filter(p => Math.hypot(p[0] - map.home[0], p[1] - map.home[1]) > radius);
    for (const p of offDock) {
      for (const ring of wallRings)
        assert.ok(
          clearance(p, ring) >= radius - GRID_TOLERANCE_M,
          `the robot at ${p.map(v => v.toFixed(2))} touches a wall`,
        );
      for (const item of standing)
        assert.ok(
          clearance(p, outline(item).pts) >= radius - GRID_TOLERANCE_M,
          `the robot at ${p.map(v => v.toFixed(2))} drives into “${item.model}” ${item.id}`,
        );
    }

    // from anywhere on the way, the way home ends on the dock
    const midway = placeOnRoute(route, map.home, map.homeHeading, length / 2).p;
    const back = routeHome(map, midway);
    assert.deepEqual(back[back.length - 1].p, map.home);
  });
}

// a 3 × 3 m room with no doors, the dock against its south wall facing north
function squareRoom(): Plan {
  return migrate({
    ...emptyPlan(),
    rooms: [
      {
        id: 'r',
        name: 'Living room',
        polygon: [
          [0, 0],
          [3, 0],
          [3, 3],
          [0, 3],
        ],
      },
    ],
    furniture: [{id: 'dock', model: 'robotVacuum', x: 1.5, y: 0.31, w: 0.38, d: 0.52, h: 0.12, rot: 180}],
  });
}

test('robot vacuum route: in a room on its own it sweeps the whole floor', () => {
  const plan = squareRoom();
  const dock = plan.furniture[0];
  const map = vacuumMap({rooms: plan.rooms, furniture: plan.furniture}, planWalls(plan).g, dock);
  assert.ok(map);
  const route = cleaningRoute(map);
  // lanes 30 cm apart over about 2.5 m of free floor: some eight lanes of over 2 m each
  assert.ok(routeLength(route, map.home) > 8 * 2, `${routeLength(route, map.home)} m`);
});

test('robot vacuum route: a robot boxed in with no room in front of its dock stays on it', () => {
  const plan = squareRoom();
  const dock = plan.furniture[0];
  // a wardrobe across the room, 40 cm from the wall: too narrow a way for the robot anywhere
  plan.furniture.push({id: 'blocker', model: 'wardrobe', x: 1.5, y: 0.85, w: 3, d: 0.8, h: 2, rot: 180});
  const map = vacuumMap({rooms: plan.rooms, furniture: plan.furniture}, planWalls(plan).g, dock);
  assert.equal(map, null);
});
