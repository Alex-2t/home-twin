// A corner where rooms meet is dragged as the junction's (joinCorners, moveJunction): the walls at it stay strips of one width,
// no wedge and no gap, and no room runs into another. Checked on the repository's demo and the ten typical homes: every corner of
// every room is dragged a little, each way, and every wall that bends with it is measured at both ends.
import test from 'node:test';
import assert from 'node:assert/strict';
import pc from 'polygon-clipping';
import {HOMES} from '../../demo/homes.ts';
import typical from '../../demo/typical.ts';
import {joinCorners, linkedEdges, migrate, moveJunction, tidyJunction} from './plan.ts';
import {area, attachOpening, openingCoords} from './geometry.ts';
import type {Plan, PlanInput, Point, Room} from './types.ts';

/** The drags tried at every corner, m: small, each way, so the drag alone makes no room cross another. */
const DRAGS: Point[] = [
  [0.08, 0.05],
  [-0.06, 0.07],
  [0.05, -0.08],
  [-0.07, -0.04],
];
/** How much a wall's width may differ between its two ends after a drag, m. */
const WIDTH_SLACK_M = 0.01;

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

/** A wall that bends with the drag: a junction room's edge from its junction corner, and the neighbour's facing it. */
interface BendingWall {
  room: Room;
  edge: number;
  neighbour: Room;
  theirEdge: number;
}

const ends = (room: Room, edge: number): [Point, Point] => [
  room.polygon[edge],
  room.polygon[(edge + 1) % room.polygon.length],
];

/** The walls at the junction's corners whose both sides move with it. */
function bendingWalls(plan: Plan, corners: Array<{room: Room; point: Point}>): BendingWall[] {
  const isCorner = (room: Room, point: Point): boolean =>
    corners.some(c => c.room === room && c.point === point);
  const walls: BendingWall[] = [];
  for (const corner of corners) {
    const ringNow = corner.room.polygon;
    const i = ringNow.indexOf(corner.point);
    const count = ringNow.length;
    for (const edge of [(i - 1 + count) % count, i])
      for (const [neighbour, theirEdge] of linkedEdges(plan, corner.room, edge)) {
        if (neighbour === corner.room) continue;
        const [c, d] = ends(neighbour, theirEdge);
        if (!isCorner(neighbour, c) && !isCorner(neighbour, d)) continue;
        const wall = {room: corner.room, edge, neighbour, theirEdge};
        // linkedEdges goes on along the whole wall line: only the sides right across from each other are one wall here
        if (acrossEnds(wall).length >= 2) walls.push(wall);
      }
  }
  return walls;
}

/** The wall's width at each side's ends that are across from the other side (an end past it is not). */
function acrossEnds(wall: BendingWall): number[] {
  const [a, b] = ends(wall.room, wall.edge);
  const [c, d] = ends(wall.neighbour, wall.theirEdge);
  const widths: number[] = [];
  for (const [point, from, to] of [
    [a, c, d],
    [b, c, d],
    [c, a, b],
    [d, a, b],
  ] as Array<[Point, Point, Point]>) {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (length < 1e-6) continue;
    const ux = (to[0] - from[0]) / length;
    const uy = (to[1] - from[1]) / length;
    const along = (point[0] - from[0]) * ux + (point[1] - from[1]) * uy;
    // across from the other side: within it along the wall, give or take a centimetre
    if (along < -0.01 || along > length + 0.01) continue;
    widths.push(Math.abs(-(point[0] - from[0]) * uy + (point[1] - from[1]) * ux));
  }
  return widths;
}

/** How much the wall's width differs between its ends. */
function widthSpread(wall: BendingWall): number {
  const widths = acrossEnds(wall);
  return widths.length < 2 ? 0 : Math.max(...widths) - Math.min(...widths);
}

const ring = (polygon: Point[]): [number, number][] => [...polygon, polygon[0]].map(([x, y]) => [x, y]);

/** How much two rooms cover the same floor, m², the worst pair. */
function worstOverlap(rooms: Room[]): number {
  let worst = 0;
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const shared = pc.intersection([ring(rooms[i].polygon)], [ring(rooms[j].polygon)]);
      const covered = shared.reduce((sum, [outer]) => sum + Math.abs(area(outer.slice(0, -1) as Point[])), 0);
      worst = Math.max(worst, covered);
    }
  return worst;
}

const copyPlan = (plan: Plan): Plan => structuredClone(plan);

/** A corner to drag: on its own copy of the home's plan. */
interface DragCase {
  plan: Plan;
  room: Room;
  i: number;
  drag: Point;
  where: string;
}

/** Every corner of every room, with every drag. */
function cases(home: {id: string; plan: Plan}): DragCase[] {
  const out: DragCase[] = [];
  home.plan.rooms.forEach((room, roomIndex) =>
    room.polygon.forEach((_, i) => {
      for (const drag of DRAGS) {
        const plan = copyPlan(home.plan);
        out.push({plan, room: plan.rooms[roomIndex], i, drag, where: `${home.id}: ${room.id} corner ${i}`});
      }
    }),
  );
  return out;
}

test('every corner of every typical home drags with its junction: the walls at it keep one width, no room runs in', async () => {
  let walls = 0;
  for (const home of await plans()) {
    const overlapBefore = worstOverlap(home.plan.rooms);
    for (const {plan, room, i, drag, where} of cases(home)) {
      const junction = joinCorners(plan, room, i);
      if (junction.corners.length < 2) continue;
      const bending = bendingWalls(plan, junction.corners);
      const from = junction.corners[0].from;
      moveJunction(junction, [from[0] + drag[0], from[1] + drag[1]]);
      for (const wall of bending) {
        const spread = widthSpread(wall);
        assert.ok(
          spread <= WIDTH_SLACK_M,
          `${where} → ${wall.neighbour.id}: the wall is a wedge (${(spread * 100).toFixed(1)} cm wider at one end)`,
        );
        walls += 1;
      }
      const overlap = worstOverlap(plan.rooms);
      assert.ok(
        overlap <= overlapBefore + 1e-3,
        `${where}: a room ran into another (${overlap.toFixed(4)} m²)`,
      );
    }
  }
  assert.ok(walls > 200, `walls measured: ${walls}`);
});

test('the measure sees the defect: one room’s corner dragged alone makes a wedge', async () => {
  let wedges = 0;
  for (const home of await plans())
    for (const {plan, room, i, drag} of cases(home)) {
      const junction = joinCorners(plan, room, i);
      if (junction.corners.length < 2) continue;
      const bending = bendingWalls(plan, junction.corners);
      const from = junction.corners[0].from;
      room.polygon[i] = [from[0] + drag[0], from[1] + drag[1]]; // the old way: only the dragged room's corner
      if (bending.some(wall => widthSpread(wall) > WIDTH_SLACK_M)) wedges += 1;
    }
  assert.ok(wedges > 50, `wedges: ${wedges}`);
});

test('a drag that comes back leaves no corner behind', async () => {
  for (const home of await plans()) {
    const corners = home.plan.rooms.map(room => room.polygon.length);
    for (const {plan, room, i, where} of cases(home)) {
      const junction = joinCorners(plan, room, i);
      moveJunction(junction, junction.corners[0].from);
      tidyJunction(plan, junction);
      assert.deepEqual(
        plan.rooms.map(r => r.polygon.length),
        corners,
        `${where}: corners were left in the walls`,
      );
    }
  }
});

test('a T: the room above spans two below; dragging their shared corner bends the long wall there, at one width', () => {
  // two rooms side by side below (a wall of 10 cm between them), one long room above (a wall of 10 cm under it)
  const left = {
    id: 'left',
    name: 'Left',
    polygon: [
      [0, 0],
      [3, 0],
      [3, 3],
      [0, 3],
    ],
  } as Room;
  const right = {
    id: 'right',
    name: 'Right',
    polygon: [
      [3.1, 0],
      [6, 0],
      [6, 3],
      [3.1, 3],
    ],
  } as Room;
  const top = {
    id: 'top',
    name: 'Top',
    polygon: [
      [0, 3.1],
      [6, 3.1],
      [6, 5],
      [0, 5],
    ],
  } as Room;
  const plan = {rooms: [left, right, top], openings: []} as unknown as Plan;
  const junction = joinCorners(plan, left, 2);
  assert.deepEqual(
    junction.corners.map(corner => corner.room.id).sort(),
    ['left', 'right', 'top', 'top'],
    'the right room is in the junction, and the long room with a corner across from each room below',
  );
  assert.equal(top.polygon.length, 6, 'the long wall got two corners: across from each room below');
  const bending = bendingWalls(plan, junction.corners);
  moveJunction(junction, [3.2, 3.3]);
  for (const wall of bending)
    assert.ok(widthSpread(wall) <= WIDTH_SLACK_M, `${wall.room.id} → ${wall.neighbour.id}`);
});

test('a door in a wall that gets corners for a junction stays on the piece that holds it, not on a sliver', () => {
  const top = {
    id: 'top',
    name: 'Top',
    polygon: [
      [0, 3.1],
      [6, 3.1],
      [6, 5],
      [0, 5],
    ],
  } as Room;
  const left = {
    id: 'left',
    name: 'Left',
    polygon: [
      [0, 0],
      [3, 0],
      [3, 3],
      [0, 3],
    ],
  } as Room;
  const right = {
    id: 'right',
    name: 'Right',
    polygon: [
      [3.1, 0],
      [6, 0],
      [6, 3],
      [3.1, 3],
    ],
  } as Room;
  const plan = {rooms: [top, left, right], openings: []} as unknown as Plan;
  // a 90 cm door in the long room's wall, starting just past the wall between the rooms below: the junction puts a 10 cm
  // piece into the long wall right at its start
  const door = attachOpening(plan.rooms, {
    id: 'd1',
    kind: 'door',
    a: [3.08, 3.06],
    b: [3.98, 3.06],
  } as never)!;
  plan.openings.push(door as never);
  joinCorners(plan, left, 2);
  const placed = openingCoords(plan.rooms, plan.openings[0]);
  assert.ok(placed, 'the door is still drawn');
  const width = Math.hypot(placed.b[0] - placed.a[0], placed.b[1] - placed.a[1]);
  assert.ok(width > 0.8, `the door keeps about its width: ${width.toFixed(3)} m`);
});
