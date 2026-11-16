// Where a robot vacuum drives on the model while Home Assistant says it is cleaning. HA gives no map and no position, so the route
// is the robot's own: it backs off its dock, sweeps every room it can reach in lanes (the dock's room first, then the nearest one),
// and comes back. It never drives through a wall, a piece of furniture or a floor lamp: the plan is laid on a grid of 5 cm cells,
// every cell a robot's body may not cover is marked, and the robot's centre keeps its radius away from all of them.
// What a robot can drive under (a wall-hung cabinet, a radiator, a TV on the wall) is not in its way; a rug and curtains are not
// either. Balconies, shafts and the street are not cleaned. Data only: scene.ts drives the robot along the route.
import {pointIn} from './geometry.ts';
import {byId, zOf} from './catalog.ts';
import {axes, footRects, isRound} from './layout.ts';
import {isRun, runGeo} from './runs.ts';
import {roomKind} from './overview.ts';
import {formFor} from './fixtures.ts';
import type {RunGeo} from './runs.ts';
import type {
  FurnitureItem,
  MultiPolygon,
  Outline,
  PlanLight,
  Point,
  Room,
  Vector,
  WallPlan,
} from './types.ts';

/** What the route is made from besides the walls: the rooms, the furniture (a run with its shape) and the lamps. */
export interface VacuumPlan {
  rooms: Room[];
  furniture: Array<FurnitureItem & {geo?: RunGeo | null}>;
  lights?: PlanLight[];
}

/** A point of a route; reverse: the robot drives to it backwards (into its dock). */
export interface RouteStep {
  p: Point;
  reverse?: boolean;
}

/** The grid the robot drives on: which cells its centre may be in, and the room each cell is in. */
export interface VacuumMap {
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  /** 1: the robot's centre may be here (its body touches nothing) and it can get here from its dock. */
  free: Uint8Array;
  /** The room the cell is in, an index into rooms; -1: none. */
  room: Int16Array;
  /** Where the robot sits on its dock, and where it stands once it has backed off it. */
  home: Point;
  out: Point;
  /** Which way it faces on the dock (away from it), radians on the plan. */
  homeHeading: number;
  /** The robot's radius, metres. */
  radius: number;
}

export const ROBOT_VACUUM_MODEL = 'robotVacuum';
const CELL_M = 0.05;
// the robot's centre keeps this much more than its radius from anything, for the cells being 5 cm
const CLEARANCE_M = 0.03;
// a robot is about 10 cm tall: what hangs higher, it drives under
const ROBOT_HEIGHT_M = 0.11;
// the lanes it sweeps a room in: a little narrower than the robot, so they overlap
const LANE_SPACING_M = 0.3;
// a stretch of a lane shorter than this is not driven: the lanes either side of it already cover it
const SHORTEST_LANE_M = 0.15;
// how far it backs off its dock before it turns
const BACK_OFF_M = 0.3;
// how far from its dock it looks for room to turn round, when the spot in front of the dock is too tight
const TURN_ROOM_SEARCH_M = 0.5;
// a floor lamp's base
const FLOOR_LAMP_RADIUS_M = 0.17;
// rooms a robot does not clean
const NOT_CLEANED = new Set(['balcony', 'garage']);

/** The robot vacuum's size on its dock, as furniture3d.ts robotVacuum draws it: its radius and where its centre is. */
export function robotOnDock(item: Pick<FurnitureItem, 'w' | 'd'>): {radius: number; z: number} {
  const DOCK_DEPTH_M = 0.12;
  const radius = Math.min(item.w / 2, (item.d - DOCK_DEPTH_M) / 2) - 0.005;
  return {radius, z: item.d / 2 - radius - 0.005};
}

/** Where the robot sits on its dock on the plan, and which way it faces there (away from the dock), radians as furniture's are. */
export function dockSpot(dock: Pick<FurnitureItem, 'x' | 'y' | 'w' | 'd' | 'rot'>): {
  home: Point;
  heading: number;
} {
  const rot = ((dock.rot || 0) * Math.PI) / 180;
  const front: Vector = [Math.sin(rot), -Math.cos(rot)];
  const {z} = robotOnDock(dock);
  return {home: [dock.x + front[0] * z, dock.y + front[1] * z], heading: rot};
}

// ---------- the grid ----------

/** The grid's cells as an index, and back. */
interface Grid {
  x0: number;
  y0: number;
  cols: number;
  rows: number;
}
const cellOf = (grid: Grid, [x, y]: Point): number => {
  const col = Math.floor((x - grid.x0) / CELL_M);
  const row = Math.floor((y - grid.y0) / CELL_M);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return -1;
  return row * grid.cols + col;
};
const centreOf = (grid: Grid, cell: number): Point => [
  grid.x0 + ((cell % grid.cols) + 0.5) * CELL_M,
  grid.y0 + (Math.floor(cell / grid.cols) + 0.5) * CELL_M,
];

/** Calls visit for every cell whose centre is within the box [x0, y0]–[x1, y1]. */
function eachCellIn(
  grid: Grid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  visit: (cell: number, centre: Point) => void,
): void {
  const col0 = Math.max(0, Math.floor((x0 - grid.x0) / CELL_M - 0.5));
  const col1 = Math.min(grid.cols - 1, Math.ceil((x1 - grid.x0) / CELL_M - 0.5));
  const row0 = Math.max(0, Math.floor((y0 - grid.y0) / CELL_M - 0.5));
  const row1 = Math.min(grid.rows - 1, Math.ceil((y1 - grid.y0) / CELL_M - 0.5));
  for (let row = row0; row <= row1; row++)
    for (let col = col0; col <= col1; col++) {
      const cell = row * grid.cols + col;
      visit(cell, centreOf(grid, cell));
    }
}

const boxOf = (points: Outline): [number, number, number, number] => {
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

// Marks the cells whose centres are inside a multipolygon (each polygon an outline and its holes) with mark(cell).
function eachCellInShape(grid: Grid, shape: MultiPolygon, mark: (cell: number) => void): void {
  for (const [outline, ...holes] of shape) {
    if (!outline?.length) continue;
    const [x0, y0, x1, y1] = boxOf(outline);
    eachCellIn(grid, x0, y0, x1, y1, (cell, centre) => {
      if (pointIn(centre, outline) && !holes.some(hole => pointIn(centre, hole))) mark(cell);
    });
  }
}

// What the robot cannot drive into or under: the floor footprints of furniture standing on the floor, and floor lamps' bases.
// → shapes, each tested by inside(point).
interface Obstacle {
  box: [number, number, number, number];
  inside(point: Point): boolean;
}
function obstacles(plan: VacuumPlan, dock: FurnitureItem): Obstacle[] {
  const list: Obstacle[] = [];
  const polygon = (outline: Outline): Obstacle => ({
    box: boxOf(outline),
    inside: point => pointIn(point, outline),
  });
  const circle = (centre: Point, radius: number): Obstacle => ({
    box: [centre[0] - radius, centre[1] - radius, centre[0] + radius, centre[1] + radius],
    inside: point => Math.hypot(point[0] - centre[0], point[1] - centre[1]) <= radius,
  });
  for (const item of plan.furniture) {
    if (item.id === dock.id) continue;
    if (zOf(item) >= ROBOT_HEIGHT_M) continue;
    if (byId(item.model)?.soft) continue;
    if (isRun(item)) {
      const geo = item.geo ?? runGeo(plan, item);
      for (const side of geo?.sides || []) list.push(polygon(side.quad));
      continue;
    }
    if (isRound(item)) {
      const [across, front] = axes(item);
      const halfW = item.w / 2;
      const halfD = item.d / 2;
      const reach = Math.max(halfW, halfD);
      list.push({
        box: [item.x - reach, item.y - reach, item.x + reach, item.y + reach],
        inside: ([x, y]) => {
          const dx = x - item.x;
          const dy = y - item.y;
          const u = (dx * across[0] + dy * across[1]) / halfW;
          const v = (dx * front[0] + dy * front[1]) / halfD;
          return u * u + v * v <= 1;
        },
      });
      continue;
    }
    for (const rect of footRects(item)) list.push(polygon(rect));
  }
  // its own dock is in its way; the spot in front of the dock where it sits is not
  const [across, front] = axes(dock);
  const dockHalfWidth = Math.min(dock.w, 0.3) / 2;
  const dockBack = -dock.d / 2;
  const dockFront = dockBack + 0.12;
  const corner = (x: number, z: number): Point => [
    dock.x + across[0] * x + front[0] * z,
    dock.y + across[1] * x + front[1] * z,
  ];
  list.push(
    polygon([
      corner(-dockHalfWidth, dockBack),
      corner(dockHalfWidth, dockBack),
      corner(dockHalfWidth, dockFront),
      corner(-dockHalfWidth, dockFront),
    ]),
  );
  for (const light of plan.lights || []) {
    if (!light.placed || formFor(light) !== 'lamp' || (light.opt ?? 'floor') !== 'floor') continue;
    for (const point of light.points) list.push(circle(point, FLOOR_LAMP_RADIUS_M));
  }
  return list;
}

// The squared distance, in cells, from each cell to the nearest blocked one (Felzenszwalb and Huttenlocher's exact transform).
function distanceToBlocked(blocked: Uint8Array, cols: number, rows: number): Float64Array {
  const FAR = 1e12;
  const field = new Float64Array(cols * rows);
  for (let i = 0; i < field.length; i++) field[i] = blocked[i] ? 0 : FAR;
  const longest = Math.max(cols, rows);
  const values = new Float64Array(longest);
  const out = new Float64Array(longest);
  const hull = new Int32Array(longest);
  const bounds = new Float64Array(longest + 1);
  const pass = (count: number): void => {
    let k = 0;
    hull[0] = 0;
    bounds[0] = -Infinity;
    bounds[1] = Infinity;
    for (let q = 1; q < count; q++) {
      let s = (values[q] + q * q - (values[hull[k]] + hull[k] * hull[k])) / (2 * q - 2 * hull[k]);
      while (s <= bounds[k]) {
        k--;
        s = (values[q] + q * q - (values[hull[k]] + hull[k] * hull[k])) / (2 * q - 2 * hull[k]);
      }
      k++;
      hull[k] = q;
      bounds[k] = s;
      bounds[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < count; q++) {
      while (bounds[k + 1] < q) k++;
      out[q] = (q - hull[k]) ** 2 + values[hull[k]];
    }
  };
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) values[row] = field[row * cols + col];
    pass(rows);
    for (let row = 0; row < rows; row++) field[row * cols + col] = out[row];
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) values[col] = field[row * cols + col];
    pass(cols);
    for (let col = 0; col < cols; col++) field[row * cols + col] = out[col];
  }
  return field;
}

const NEIGHBOURS: Array<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

// Every cell reachable from start over open cells, with how far it is (in cells along the way); -1: not reachable.
function distancesFrom(grid: Grid, open: Uint8Array, start: number): Float64Array {
  const distance = new Float64Array(grid.cols * grid.rows).fill(-1);
  if (start < 0 || !open[start]) return distance;
  const heap = new MinHeap();
  distance[start] = 0;
  heap.push(start, 0);
  while (heap.size) {
    const [cell, at] = heap.pop();
    if (at > distance[cell]) continue;
    const col = cell % grid.cols;
    const row = Math.floor(cell / grid.cols);
    for (const [dc, dr, cost] of NEIGHBOURS) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
      const next = r * grid.cols + c;
      if (!open[next]) continue;
      // a diagonal step does not cut a blocked corner
      if (dc && dr && (!open[row * grid.cols + c] || !open[r * grid.cols + col])) continue;
      const via = at + cost;
      if (distance[next] >= 0 && distance[next] <= via) continue;
      distance[next] = via;
      heap.push(next, via);
    }
  }
  return distance;
}

// The open cell nearest to a point (within reach metres), or -1.
function nearestOpen(grid: Grid, open: Uint8Array, point: Point, reach: number): number {
  let best = -1;
  let bestDistance = Infinity;
  eachCellIn(grid, point[0] - reach, point[1] - reach, point[0] + reach, point[1] + reach, (cell, centre) => {
    if (!open[cell]) return;
    const distance = Math.hypot(centre[0] - point[0], centre[1] - point[1]);
    if (distance <= reach && distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  });
  return best;
}

// The walls a robot bumps into: everything standing at its height, a parapet too.
function wallsUnder(walls: WallPlan): MultiPolygon {
  const bands = [...walls.interior, ...walls.sides.flatMap(side => side.bands), ...walls.rails];
  return bands
    .filter(band => band.bottom <= ROBOT_HEIGHT_M / 2 && band.top > ROBOT_HEIGHT_M / 2)
    .flatMap(band => band.mp);
}

/**
 * The grid a robot vacuum drives on, for the dock item `dock`, from the plan and its walls (plan-scene.ts planWalls); null when it cannot leave its dock (no room in front of it).
 */
export function vacuumMap(plan: VacuumPlan, walls: WallPlan, dock: FurnitureItem): VacuumMap | null {
  const cleaned = plan.rooms.filter(
    room => !room.solid && room.polygon.length >= 3 && !NOT_CLEANED.has(roomKind(room.name)),
  );
  if (!cleaned.length) return null;
  const [minX, minY, maxX, maxY] = boxOf(cleaned.flatMap(room => room.polygon));
  const MARGIN_M = 0.5;
  const grid: Grid = {
    x0: minX - MARGIN_M,
    y0: minY - MARGIN_M,
    cols: Math.ceil((maxX - minX + 2 * MARGIN_M) / CELL_M),
    rows: Math.ceil((maxY - minY + 2 * MARGIN_M) / CELL_M),
  };
  const count = grid.cols * grid.rows;
  // The floor is the building's footprint without its walls at the robot's height (a door is a gap in them, a window is not);
  // the rooms a robot does not clean are blocked too. Each cell knows its room, for sweeping the rooms one by one.
  const blocked = new Uint8Array(count).fill(1);
  eachCellInShape(grid, walls.footprint, cell => {
    blocked[cell] = 0;
  });
  eachCellInShape(grid, wallsUnder(walls), cell => {
    blocked[cell] = 1;
  });
  const roomOfCell = new Int16Array(count).fill(-1);
  plan.rooms.forEach((room, index) => {
    if (room.polygon.length < 3) return;
    const isCleaned = cleaned.includes(room);
    const [x0, y0, x1, y1] = boxOf(room.polygon);
    eachCellIn(grid, x0, y0, x1, y1, (cell, centre) => {
      if (!pointIn(centre, room.polygon)) return;
      if (isCleaned) roomOfCell[cell] = index;
      else blocked[cell] = 1;
    });
  });
  for (const obstacle of obstacles(plan, dock)) {
    const [x0, y0, x1, y1] = obstacle.box;
    eachCellIn(grid, x0, y0, x1, y1, (cell, centre) => {
      if (obstacle.inside(centre)) blocked[cell] = 1;
    });
  }
  // the robot's centre keeps its radius away from every blocked cell (a cell's centre is half a cell from its edge)
  const {radius} = robotOnDock(dock);
  const distance = distanceToBlocked(blocked, grid.cols, grid.rows);
  const keepCells = (radius + CLEARANCE_M) / CELL_M + 0.5;
  const open = new Uint8Array(count);
  for (let cell = 0; cell < count; cell++) open[cell] = distance[cell] >= keepCells * keepCells ? 1 : 0;
  // its spot on the dock, and where it can turn once it has backed off
  const [, front] = axes(dock);
  const {home, heading} = dockSpot(dock);
  const backedOff: Point = [home[0] + front[0] * BACK_OFF_M, home[1] + front[1] * BACK_OFF_M];
  const start = nearestOpen(grid, open, backedOff, TURN_ROOM_SEARCH_M);
  if (start < 0) return null;
  // only what it can get to from there
  const reach = distancesFrom(grid, open, start);
  const free = new Uint8Array(count);
  for (let cell = 0; cell < count; cell++) free[cell] = reach[cell] >= 0 ? 1 : 0;
  return {
    ...grid,
    free,
    room: roomOfCell,
    home,
    out: centreOf(grid, start),
    homeHeading: heading,
    radius,
  };
}

// ---------- paths ----------

// Whether the robot's centre can go straight from a to b: every point on the way is in a free cell.
function clearLine(map: VacuumMap, a: Point, b: Point): boolean {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(length / (CELL_M / 2)));
  for (let i = 0; i <= steps; i++) {
    const at: Point = [a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps];
    const cell = cellOf(map, at);
    if (cell < 0 || !map.free[cell]) return false;
  }
  return true;
}

// The shortest way over free cells from one cell to another (A*), as cell centres; null: no way.
function cellPath(map: VacuumMap, from: number, to: number): number[] | null {
  if (from < 0 || to < 0 || !map.free[from] || !map.free[to]) return null;
  if (from === to) return [from];
  const count = map.cols * map.rows;
  const cost = new Float64Array(count).fill(Infinity);
  const cameFrom = new Int32Array(count).fill(-1);
  const toCol = to % map.cols;
  const toRow = Math.floor(to / map.cols);
  const guess = (cell: number): number => {
    const dc = Math.abs((cell % map.cols) - toCol);
    const dr = Math.abs(Math.floor(cell / map.cols) - toRow);
    return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
  };
  const heap = new MinHeap();
  cost[from] = 0;
  heap.push(from, guess(from));
  while (heap.size) {
    const [cell] = heap.pop();
    if (cell === to) break;
    const col = cell % map.cols;
    const row = Math.floor(cell / map.cols);
    for (const [dc, dr, step] of NEIGHBOURS) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) continue;
      const next = r * map.cols + c;
      if (!map.free[next]) continue;
      if (dc && dr && (!map.free[row * map.cols + c] || !map.free[r * map.cols + col])) continue;
      const via = cost[cell] + step;
      if (via >= cost[next]) continue;
      cost[next] = via;
      cameFrom[next] = cell;
      heap.push(next, via + guess(next));
    }
  }
  if (cameFrom[to] < 0) return null;
  const path = [to];
  while (path[path.length - 1] !== from) path.push(cameFrom[path[path.length - 1]]);
  return path.reverse();
}

// The way from a to b as few straight runs as the free cells allow (the corners a grid path has are pulled tight); null: no way.
function wayBetween(map: VacuumMap, a: Point, b: Point): Point[] | null {
  const from = cellOf(map, a);
  const to = cellOf(map, b);
  const start = from >= 0 && map.free[from] ? from : nearestOpen(map, map.free, a, 1);
  const end = to >= 0 && map.free[to] ? to : nearestOpen(map, map.free, b, 1);
  const cells = cellPath(map, start, end);
  if (!cells) return null;
  const points: Point[] = [a, ...cells.map(cell => centreOf(map, cell)), b];
  const pulled: Point[] = [points[0]];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let furthest = anchor + 1;
    for (let next = points.length - 1; next > anchor + 1; next--)
      if (clearLine(map, points[anchor], points[next])) {
        furthest = next;
        break;
      }
    pulled.push(points[furthest]);
    anchor = furthest;
  }
  return pulled;
}

/** The way back to the dock from where the robot is: to the spot in front of it, then backwards onto it. */
export function routeHome(map: VacuumMap, from: Point): RouteStep[] {
  const way = wayBetween(map, from, map.out) || [from, map.out];
  return [...way.slice(1).map((p): RouteStep => ({p})), {p: map.home, reverse: true}];
}

// A lane: a straight stretch of one room's free cells, from a to b.
interface Lane {
  a: Point;
  b: Point;
}

// One room's lanes: rows across its longer side, LANE_SPACING_M apart, each cut where something stands in the way.
function lanesOf(map: VacuumMap, roomIndex: number): Lane[] {
  const cells: number[] = [];
  for (let cell = 0; cell < map.free.length; cell++)
    if (map.free[cell] && map.room[cell] === roomIndex) cells.push(cell);
  if (!cells.length) return [];
  const cols = cells.map(cell => cell % map.cols);
  const rows = cells.map(cell => Math.floor(cell / map.cols));
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  // lanes run along the room's longer side
  const alongX = maxCol - minCol >= maxRow - minRow;
  const firstLine = alongX ? minRow : minCol;
  const lastLine = alongX ? maxRow : maxCol;
  const firstStep = alongX ? minCol : minRow;
  const lastStep = alongX ? maxCol : maxRow;
  const spacingCells = LANE_SPACING_M / CELL_M;
  const laneCount = Math.max(1, Math.round((lastLine - firstLine) / spacingCells) + 1);
  const shortest = Math.ceil(SHORTEST_LANE_M / CELL_M);
  const lanes: Lane[] = [];
  const cellAt = (line: number, step: number): number =>
    alongX ? line * map.cols + step : step * map.cols + line;
  const inRoom = (cell: number): boolean => !!map.free[cell] && map.room[cell] === roomIndex;
  for (let k = 0; k < laneCount; k++) {
    const line =
      laneCount === 1
        ? Math.round((firstLine + lastLine) / 2)
        : Math.round(firstLine + ((lastLine - firstLine) * k) / (laneCount - 1));
    let runStart = -1;
    for (let step = firstStep; step <= lastStep + 1; step++) {
      const inside = step <= lastStep && inRoom(cellAt(line, step));
      if (inside && runStart < 0) runStart = step;
      if (!inside && runStart >= 0) {
        const runEnd = step - 1;
        if (runEnd - runStart + 1 >= shortest)
          lanes.push({a: centreOf(map, cellAt(line, runStart)), b: centreOf(map, cellAt(line, runEnd))});
        runStart = -1;
      }
    }
  }
  return lanes;
}

/**
 * A whole cleaning: off the dock (or on from where the robot is), every reachable room swept in lanes — the room it is in first,
 * then always the nearest one left — and back onto the dock.
 */
export function cleaningRoute(map: VacuumMap, from: Point = map.home): RouteStep[] {
  const steps: RouteStep[] = [];
  let at = from;
  if (from[0] === map.home[0] && from[1] === map.home[1]) {
    steps.push({p: map.out});
    at = map.out;
  }
  const driveTo = (point: Point): void => {
    const way = wayBetween(map, at, point);
    if (!way) return;
    for (const p of way.slice(1)) steps.push({p});
    at = point;
  };
  const rooms = new Set<number>();
  for (let cell = 0; cell < map.free.length; cell++)
    if (map.free[cell] && map.room[cell] >= 0) rooms.add(map.room[cell]);
  const left = new Map<number, Lane[]>();
  for (const room of rooms) {
    const lanes = lanesOf(map, room);
    if (lanes.length) left.set(room, lanes);
  }
  while (left.size) {
    // the nearest room left, by the way there
    const distance = distancesFrom(map, map.free, nearestOpen(map, map.free, at, 1));
    let nextRoom = -1;
    let nearest = Infinity;
    for (const [room, lanes] of left)
      for (const lane of lanes)
        for (const end of [lane.a, lane.b]) {
          const d = distance[cellOf(map, end)];
          if (d >= 0 && d < nearest) {
            nearest = d;
            nextRoom = room;
          }
        }
    if (nextRoom < 0) break;
    const lanes = left.get(nextRoom)!; // nextRoom is one of left's keys
    left.delete(nextRoom);
    // in the room: always the nearest end of a lane left, along the way there for the first one
    let first = true;
    while (lanes.length) {
      let best = 0;
      let bestEnd: 'a' | 'b' = 'a';
      let bestDistance = Infinity;
      lanes.forEach((lane, index) => {
        for (const end of ['a', 'b'] as const) {
          const d = first
            ? distance[cellOf(map, lane[end])]
            : Math.hypot(lane[end][0] - at[0], lane[end][1] - at[1]);
          if (d >= 0 && d < bestDistance) {
            bestDistance = d;
            best = index;
            bestEnd = end;
          }
        }
      });
      first = false;
      const [lane] = lanes.splice(best, 1);
      const start = bestEnd === 'a' ? lane.a : lane.b;
      const end = bestEnd === 'a' ? lane.b : lane.a;
      driveTo(start);
      if (at === start) {
        steps.push({p: end});
        at = end;
      }
    }
  }
  return [...steps, ...routeHome(map, at)];
}

// ---------- driving along a route ----------

/** Where a robot is on a route: the step it is heading for, its position and which way it faces. */
export interface RoutePlace {
  step: number;
  p: Point;
  heading: number;
}

/** The way a robot faces driving from a to b (backwards: the other way), radians on the plan as furniture's are. */
export function headingOf(a: Point, b: Point, reverse = false): number {
  const forward = Math.atan2(b[0] - a[0], -(b[1] - a[1]));
  return reverse ? forward + Math.PI : forward;
}

/** Where a robot is once it has driven `distance` metres along a route from its start (turns take no distance); past the end: the end. */
export function placeOnRoute(
  route: RouteStep[],
  start: Point,
  startHeading: number,
  distance: number,
): RoutePlace {
  let at = start;
  let heading = startHeading;
  let left = distance;
  for (let step = 0; step < route.length; step++) {
    const target = route[step].p;
    const length = Math.hypot(target[0] - at[0], target[1] - at[1]);
    if (length > 1e-6) heading = headingOf(at, target, route[step].reverse);
    if (left < length) {
      const k = left / length;
      return {step, p: [at[0] + (target[0] - at[0]) * k, at[1] + (target[1] - at[1]) * k], heading};
    }
    left -= length;
    at = target;
  }
  return {step: route.length, p: at, heading};
}

/** How long a route is, metres. */
export function routeLength(route: RouteStep[], start: Point): number {
  let at = start;
  let length = 0;
  for (const step of route) {
    length += Math.hypot(step.p[0] - at[0], step.p[1] - at[1]);
    at = step.p;
  }
  return length;
}

// A binary min-heap of cells by priority.
class MinHeap {
  private cells: number[] = [];
  private priorities: number[] = [];
  get size(): number {
    return this.cells.length;
  }
  push(cell: number, priority: number): void {
    this.cells.push(cell);
    this.priorities.push(priority);
    let i = this.cells.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[parent] <= this.priorities[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.cells[0], this.priorities[0]];
    const lastCell = this.cells.pop()!; // pop is only called while size > 0
    const lastPriority = this.priorities.pop()!;
    if (this.cells.length) {
      this.cells[0] = lastCell;
      this.priorities[0] = lastPriority;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.cells.length && this.priorities[left] < this.priorities[smallest]) smallest = left;
        if (right < this.cells.length && this.priorities[right] < this.priorities[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }
  private swap(i: number, j: number): void {
    [this.cells[i], this.cells[j]] = [this.cells[j], this.cells[i]];
    [this.priorities[i], this.priorities[j]] = [this.priorities[j], this.priorities[i]];
  }
}
