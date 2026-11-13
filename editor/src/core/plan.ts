// The floor plan and operations on it. The plan is plain JSON (D-005), stored by the editor and then by the HA integration.
// Rooms: an outline of [x,y] in meters (x is east, y is north). Walls are not stored: geometry.js builds them from the outlines.
import {t} from '../i18n/i18n.ts';
import {
  area,
  centroid,
  attachOpening,
  openingCoords,
  pointIn,
  segDist,
  poly,
  WALL,
  OUTER,
  edgeThickness,
} from './geometry.ts';
import pc from 'polygon-clipping';
import {
  splitPieces,
  joinPieces,
  carryPieces,
  fractionAlong,
  mapFloorPieces,
  keepFloorPiecesInside,
} from './pieces.ts';
import type {
  EdgeFinish,
  EdgeRef,
  Opening,
  OpeningKind,
  Outline,
  Plan,
  PlanCore,
  PlanInput,
  Point,
  Room,
  RoomEdge,
  RoomZone,
  Segment,
  SettleMove,
  SplitPart,
  Vector,
  WallInfo,
  WallPiece,
  WallStretch,
  ZoneParts,
} from './types.ts';

export const PLAN_VERSION = 1;
export const LINK = 0.45; // edges of neighboring rooms closer than this form one wall

export const emptyPlan = (): Plan => ({
  version: PLAN_VERSION,
  units: 'm',
  rooms: [],
  openings: [],
  furniture: [],
  lights: [],
  sensors: [],
  sensorSkip: [],
  devices: [],
});
// A list from a file that should be one: anything else becomes empty.
const listOr = <Entry>(value: Entry[]): Entry[] => (Array.isArray(value) ? value : []);
// Bring old and incomplete plans up to the current shape.
export function migrate(p: PlanInput): Plan {
  const plan = {...emptyPlan(), ...p};
  plan.rooms = listOr(plan.rooms);
  plan.openings = listOr(plan.openings);
  plan.furniture = listOr(plan.furniture);
  plan.lights = listOr(plan.lights);
  plan.sensors = listOr(plan.sensors);
  plan.sensorSkip = listOr(plan.sensorSkip);
  plan.devices = listOr(plan.devices);
  for (const r of plan.rooms) delete r.sens; // readings used to live on the room (first draft of D-033); now they are plan.sensors
  plan.version = PLAN_VERSION;
  // Openings from a file may be stored as plain coordinates: attach them to room edges.
  plan.openings = plan.openings
    .map(o =>
      o.at
        ? o
        : attachOpening(plan.rooms, {
            bottom: o.kind === 'door' ? 0 : 0.85,
            top: o.kind === 'door' ? 2.1 : 2.4,
            ...o,
          }),
    )
    .filter(o => o !== null);
  for (const o of plan.openings) if (!o.id) o.id = openingId(plan);
  // the project has its own id: the editor uses it to remember what it has already asked in this project (the “Shaft or column?” hint)
  if (!plan.id) plan.id = 'plan_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  closeOuterOpen(plan);
  // every opening now sits on an edge and has an id
  return plan as Plan;
}
export const roomById = (plan: Pick<Plan, 'rooms'>, id: string | null | undefined): Room | undefined =>
  plan.rooms.find(r => r.id === id);
export const roomAt = (plan: Pick<Plan, 'rooms'>, p: Point): Room | undefined =>
  plan.rooms.find(r => pointIn(p, r.polygon));
export const cloneRooms = (plan: Pick<Plan, 'rooms'>): Room[] =>
  plan.rooms.map(r => ({...r, polygon: r.polygon.map((v): Point => [...v])}));
// Every room's outline by its id, copied: where edges start from when they are dragged.
export const snapshot = (plan: Pick<Plan, 'rooms'>): Map<string, Outline> =>
  new Map(plan.rooms.map(r => [r.id, r.polygon.map((v): Point => [...v])]));

export function addRoom(plan: Pick<Plan, 'rooms'>, polygon: Outline, name?: string): Room {
  if (area(polygon) < 0) polygon = [...polygon].reverse();
  let k = 1;
  while (roomById(plan, 'room_' + k)) k++;
  const room: Room = {id: 'room_' + k, name: name || t('Room {0}', k), polygon};
  plan.rooms.push(room);
  return room;
}
export function removeRoom(plan: Pick<Plan, 'rooms' | 'openings'>, id: string): void {
  plan.rooms = plan.rooms.filter(r => r.id !== id);
  plan.openings = plan.openings.filter(o => o.at.room !== id);
}
// Inserting or removing a corner shifts edge indices: reattach openings by their previous position.
export function reattachOpenings(plan: Pick<Plan, 'rooms' | 'openings'>, beforeRooms: Room[]): void {
  plan.openings = plan.openings.map(o => {
    const c = openingCoords(beforeRooms, o);
    return c ? attachOpening(plan.rooms, c) || o : o;
  });
}
// Edge thicknesses (room.wt), edge finishes (room.wf) and railings (room.rail) follow the corners: a new edge inherits the one it
// was split from; removing a corner keeps the previous one.
export const EDGE_KEYS: Array<'wt' | 'wf' | 'rail'> = ['wt', 'wf', 'rail'];
// A new corner after corner i: the new edge takes edge i's value.
function insertEdgeValue(list: unknown[] | undefined, i: number): void {
  if (list) list.splice(i + 1, 0, list[i] ?? null);
}
// Corner i removed: its edge's value goes.
function removeEdgeValue(list: unknown[] | undefined, i: number): void {
  if (list) list.splice(i, 1);
}
// Pieces of finish on the walls (room.wp, pieces.js, D-084) follow the corners by position: a new corner splits the pieces of
// its edge between the two parts, a removed one joins the pieces of both edges.
function padWallPieces(wallPieces: Array<WallPiece[] | null>, count: number): void {
  while (wallPieces.length < count) wallPieces.push(null);
}
function tidyWallPieces(room: Room): void {
  if (room.wp && !room.wp.some(list => list?.length)) delete room.wp;
}
function splitEdgePieces(room: Room, wallPieces: Array<WallPiece[] | null>, edge: number, cut: number): void {
  padWallPieces(wallPieces, room.polygon.length - 1); // the corner is in already: one edge more than the pieces have
  const [before, after] = splitPieces(wallPieces[edge], cut);
  wallPieces.splice(edge, 1, before, after);
}
function joinEdgePieces(room: Room, wallPieces: Array<WallPiece[] | null>, corner: number): void {
  const points = room.polygon;
  const count = points.length;
  const previous = (corner - 1 + count) % count;
  const edgeLength = (j: number): number => {
    const a = points[j];
    const b = points[(j + 1) % count];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  padWallPieces(wallPieces, count);
  wallPieces[previous] = joinPieces(
    wallPieces[previous],
    wallPieces[corner],
    edgeLength(previous),
    edgeLength(corner),
  );
  wallPieces.splice(corner, 1);
}
export function insertVertex(
  plan: Pick<Plan, 'rooms' | 'openings'>,
  room: Room,
  i: number,
  p: Point,
): number {
  const before = cloneRooms(plan);
  const cut = fractionAlong(p, room.polygon[i], room.polygon[(i + 1) % room.polygon.length]);
  room.polygon.splice(i + 1, 0, p);
  for (const k of EDGE_KEYS) insertEdgeValue(room[k], i);
  if (room.wp) {
    splitEdgePieces(room, room.wp, i, cut);
    tidyWallPieces(room);
  }
  reattachOpenings(plan, before);
  return i + 1;
}
export function removeVertex(plan: Pick<Plan, 'rooms' | 'openings'>, room: Room, i: number): boolean {
  if (room.polygon.length <= 3) return false;
  const before = cloneRooms(plan);
  if (room.wp) {
    joinEdgePieces(room, room.wp, i);
    tidyWallPieces(room);
  }
  room.polygon.splice(i, 1);
  for (const k of EDGE_KEYS) removeEdgeValue(room[k], i);
  reattachOpenings(plan, before);
  return true;
}

// An edge's geometry for linking walls: its ends, length, direction and outward normal.
interface EdgeGeometry {
  a: Point;
  b: Point;
  l: number;
  u: Vector;
  n: Vector;
}
// One wall is the adjacent edges of the same room on one line (a redundant corner mid-wall) plus the parallel edges of neighbors
// closer than LINK (transitively): the nursery wall drags along both the bathroom and the hallway. A double point (“Add corner”) breaks the wall:
// the halves move separately, which makes a step.
export function linkedEdges(plan: Pick<Plan, 'rooms'>, room: Room, i: number): EdgeRef[] {
  const key = (r: Room, j: number): string => r.id + ':' + j;
  const seen = new Set([key(room, i)]);
  const out: EdgeRef[] = [];
  const queue: EdgeRef[] = [[room, i]];
  const geom = (r: Room, j: number): EdgeGeometry | null => {
    const p = r.polygon;
    const a = p[j];
    const b = p[(j + 1) % p.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) return null;
    const u: Vector = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    const s = area(p) > 0 ? 1 : -1;
    return {a, b, l, u, n: [u[1] * s, -u[0] * s]};
  };
  while (queue.length) {
    const [er, ei] = queue.shift()!; // the loop runs while the queue has an edge
    const G = geom(er, ei);
    if (!G) continue;
    for (const r of plan.rooms)
      for (let j = 0; j < r.polygon.length; j++) {
        if (seen.has(key(r, j))) continue;
        const H = geom(r, j);
        if (!H || Math.abs(H.u[0] * G.u[0] + H.u[1] * G.u[1]) < 0.995) continue;
        const off =
          ((H.a[0] - G.a[0]) * G.n[0] +
            (H.a[1] - G.a[1]) * G.n[1] +
            (H.b[0] - G.a[0]) * G.n[0] +
            (H.b[1] - G.a[1]) * G.n[1]) /
          2; // signed: outward from the edge
        if (r === er) {
          // same room: only the adjacent edge on the same line (a redundant corner mid-wall)
          if (
            Math.abs(off) > 0.005 ||
            !(j === (ei + 1) % er.polygon.length || ei === (j + 1) % r.polygon.length)
          )
            continue;
        } else {
          // neighbor: only on the other side of the wall and facing it; not through a narrow room in between
          if (H.n[0] * G.n[0] + H.n[1] * G.n[1] >= 0 || off < -0.02 || off > LINK) continue;
          const s0 = (H.a[0] - G.a[0]) * G.u[0] + (H.a[1] - G.a[1]) * G.u[1];
          const s1 = (H.b[0] - G.a[0]) * G.u[0] + (H.b[1] - G.a[1]) * G.u[1];
          const lo = Math.max(0, Math.min(s0, s1));
          const hi = Math.min(G.l, Math.max(s0, s1));
          if (hi - lo < 0.05) continue;
          const t = (lo + hi) / 2;
          const mid: Point = [
            G.a[0] + G.u[0] * t + (G.n[0] * off) / 2,
            G.a[1] + G.u[1] * t + (G.n[1] * off) / 2,
          ];
          if (off > 0.03 && plan.rooms.some(q => q !== er && q !== r && pointIn(mid, q.polygon))) continue;
        }
        seen.add(key(r, j));
        out.push([r, j]);
        queue.push([r, j]);
      }
  }
  return out;
}
// Shift edges by d along normal n from their original position orig (Map id → outline).
export function moveEdges(edges: EdgeRef[], orig: Map<string, Outline>, n: Vector, d: number): void {
  for (const [r, j] of edges) {
    const k = (j + 1) % r.polygon.length;
    for (const t of [j, k]) {
      const v = orig.get(r.id)![t]; // every room that moves is in the snapshot
      r.polygon[t] = [+(v[0] + n[0] * d).toFixed(4), +(v[1] + n[1] * d).toFixed(4)];
    }
  }
}
// Edge length: move the next edge together with its neighbors so right angles stay right.
export function setEdgeLength(plan: Pick<Plan, 'rooms'>, room: Room, i: number, L: number): void {
  const pp = room.polygon;
  const n = pp.length;
  const a = pp[i];
  const b = pp[(i + 1) % n];
  const c = pp[(i + 2) % n];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: Vector = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  const d = L - l;
  const nx = c[0] - b[0];
  const ny = c[1] - b[1];
  const nl = Math.hypot(nx, ny);
  if (Math.abs((nx * u[0] + ny * u[1]) / nl) < 0.05)
    moveEdges([[room, (i + 1) % n], ...linkedEdges(plan, room, (i + 1) % n)], snapshot(plan), u, d);
  else pp[(i + 1) % n] = [b[0] + u[0] * d, b[1] + u[1] * d];
}
// Room edges with inward normals: for snapping furniture, light strips and openings.
export function* roomEdges(plan: Pick<Plan, 'rooms'>): Generator<RoomEdge, void, undefined> {
  for (const r of plan.rooms) {
    const pp = r.polygon;
    const s = area(pp) > 0 ? 1 : -1;
    for (let i = 0; i < pp.length; i++) {
      const a = pp[i];
      const b = pp[(i + 1) % pp.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      const u: Vector = [dx / l, dy / l];
      yield {room: r, i, a, b, l, u, n: [-u[1] * s, u[0] * s]};
    }
  }
}

// ---------- wall thickness ----------
// Plan defaults: exterior walls and partitions (a partition is where rooms touch or stand with a gap).
export const wallDefaults = (plan: Pick<Plan, 'wall'>): {outer: number; inner: number} => ({
  outer: plan.wall?.outer ?? OUTER,
  inner: plan.wall?.inner ?? 2 * WALL.inner,
});
export const INNER_RANGE: [number, number] = [2 * WALL.inner, 0.54]; // interior wall: from rooms touching up to the “one wall” limit (LINK)
// The wall at edge i of a room: edges on this side (A) and on the other side (B), interior or exterior, thickness, whether it exists at all.
export function wallInfo(plan: Pick<Plan, 'rooms' | 'wall'>, room: Room, i: number): WallInfo {
  const p = room.polygon;
  const a = p[i];
  const b = p[(i + 1) % p.length];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: Vector = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  const s = area(p) > 0 ? 1 : -1;
  const n: Vector = [u[1] * s, -u[0] * s];
  const A: EdgeRef[] = [[room, i]];
  const B: EdgeRef[] = [];
  let gap: number | null = null;
  for (const [r, j] of linkedEdges(plan, room, i)) {
    const c = r.polygon[j];
    const e = r.polygon[(j + 1) % r.polygon.length];
    const off =
      ((c[0] - a[0]) * n[0] + (c[1] - a[1]) * n[1] + (e[0] - a[0]) * n[0] + (e[1] - a[1]) * n[1]) / 2;
    // a neighbor's edge facing ours is on the other side of the wall (even when flush, with zero gap)
    const rs = area(r.polygon) > 0 ? 1 : -1;
    const el = Math.hypot(e[0] - c[0], e[1] - c[1]);
    const facing = r !== room && ((e[1] - c[1]) / el) * rs * n[0] - ((e[0] - c[0]) / el) * rs * n[1] < 0;
    if (facing && off > -0.02 && off <= LINK + 0.01) {
      B.push([r, j]);
      gap = gap == null ? Math.max(0, off) : Math.min(gap, Math.max(0, off));
    } else if (!facing && Math.abs(off) <= 0.02) A.push([r, j]);
  }
  const {outer} = wallDefaults(plan);
  const interior = B.length > 0;
  const railing = room.rail?.[i];
  return {
    room,
    i,
    a,
    b,
    u,
    n,
    A,
    B,
    interior,
    gap: gap ?? 0,
    open: room.wt?.[i] === 0,
    rail: railing != null && railing > 0 ? railing : 0,
    t: interior ? (gap ?? 0) + 2 * WALL.inner : edgeThickness(room, i, outer),
  };
}
const setWt = (r: Room, j: number, v: number | null): void => {
  r.wt ||= r.polygon.map(() => null);
  while (r.wt.length < r.polygon.length) r.wt.push(null);
  r.wt[j] = v;
  if (r.wt.every(x => x == null)) delete r.wt;
};
// New thickness: an interior wall grows both ways from its axis (both rooms get slightly smaller), an exterior wall grows outward only.
export function setWallThickness(
  plan: Pick<Plan, 'rooms'>,
  info: WallInfo,
  t: number,
  orig: Map<string, Outline> = snapshot(plan),
): void {
  if (info.interior) {
    t = Math.max(INNER_RANGE[0], Math.min(INNER_RANGE[1], t));
    const d = t - 2 * WALL.inner - info.gap;
    moveEdges(info.A, orig, info.n, -d / 2);
    moveEdges(info.B, orig, info.n, d / 2);
  } else {
    t = Math.max(0.08, Math.min(1, t));
    for (const [r, j] of info.A) setWt(r, j, +t.toFixed(3));
  }
}
// Remove a wall (kitchen-living room, open balcony) or restore it.
export function setWallOpen(plan: Pick<Plan, 'wall'>, info: WallInfo, open: boolean): void {
  const {outer} = wallDefaults(plan);
  for (const [r, j] of [...info.A, ...info.B])
    setWt(r, j, open ? 0 : info.interior ? null : info.t !== outer ? info.t : null);
}
// A railing instead of the exterior wall (an open balcony, a terrace) or the wall back: h — the railing's height, 0 — a wall.
// Every edge on this side of the wall's line (info.A) changes with it.
export function setRail(plan: PlanCore, info: WallInfo, h: number): void {
  for (const [r, j] of info.A) {
    r.rail ||= r.polygon.map(() => null);
    while (r.rail.length < r.polygon.length) r.rail.push(null);
    r.rail[j] = h > 0 ? +h.toFixed(2) : null;
    if (r.rail.every(x => !x)) {
      delete r.rail;
      delete r.railGlass;
    }
  }
}
// An exterior edge without a wall (the old “Remove wall” did this to exterior walls, or the neighbor across was deleted):
// the wall comes back, since “no wall” exists only between rooms (D-021). Returns how many edges were closed.
export function closeOuterOpen(plan: Pick<Plan, 'rooms' | 'wall'>): number {
  let n = 0;
  for (const r of plan.rooms)
    (r.wt || []).forEach((t, i) => {
      if (t === 0 && !wallInfo(plan, r, i).interior) {
        setWt(r, i, null);
        n++;
      }
    });
  return n;
}
// A new room is “settled” against its neighbors and returns what it moved ([{i, d, kind}]: edge, distance along the outward normal):
// - flush with or slightly overlapping a neighbor → backs off to the default partition (kind 'gap');
// - an edge almost in line with the same-facing edge of a nearby neighbor (up to 30 cm, e.g. a back wall) → snaps into line (kind 'align'):
//   otherwise the back wall gets a step, and a gap shows at the joint in 3D.
export const ALIGN = 0.3;
export function settleRoom(plan: Pick<Plan, 'rooms' | 'wall'>, room: Room): SettleMove[] {
  const gap = Math.max(0, wallDefaults(plan).inner - 2 * WALL.inner);
  const p = room.polygon;
  const s = area(p) > 0 ? 1 : -1;
  const done: SettleMove[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 0.1) continue;
    const u: Vector = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    const n: Vector = [u[1] * s, -u[0] * s];
    let face: number | null = null;
    let line: number | null = null;
    for (const r of plan.rooms) {
      if (r === room) continue;
      const q = r.polygon;
      const rs = area(q) > 0 ? 1 : -1;
      for (let j = 0; j < q.length; j++) {
        const c = q[j];
        const e = q[(j + 1) % q.length];
        const el = Math.hypot(e[0] - c[0], e[1] - c[1]);
        if (el < 1e-6 || Math.abs(((e[0] - c[0]) * u[0] + (e[1] - c[1]) * u[1]) / el) < 0.995) continue;
        const o =
          ((c[0] - a[0]) * n[0] + (c[1] - a[1]) * n[1] + (e[0] - a[0]) * n[0] + (e[1] - a[1]) * n[1]) / 2;
        const s0 = (c[0] - a[0]) * u[0] + (c[1] - a[1]) * u[1];
        const s1 = (e[0] - a[0]) * u[0] + (e[1] - a[1]) * u[1];
        const lo = Math.min(s0, s1);
        const hi = Math.max(s0, s1);
        const same = ((e[1] - c[1]) / el) * rs * n[0] - ((e[0] - c[0]) / el) * rs * n[1] > 0; // the neighbor's edge faces the same way as ours
        if (!same && o >= -0.12 && o <= gap + 0.05 && hi > 0.1 && lo < l - 0.1)
          face = face == null ? o : Math.min(face, o);
        // the same side of the building, next to ours lengthwise (not overlapping), slightly offset: align it
        const apart = Math.max(lo - l, -hi);
        if (
          same &&
          Math.abs(o) > 0.002 &&
          Math.abs(o) <= ALIGN &&
          apart >= -0.05 &&
          apart <= 0.6 &&
          (line == null || Math.abs(o) < Math.abs(line))
        )
          line = o;
      }
    }
    if (face != null && Math.abs(face - gap) > 0.002) {
      moveEdges([[room, i]], snapshot(plan), n, face - gap);
      done.push({i, d: face - gap, kind: 'gap'});
    } else if (face == null && line != null) {
      moveEdges([[room, i]], snapshot(plan), n, line);
      done.push({i, d: line, kind: 'align'});
    }
  }
  return done;
}
// Rotate the whole plan by th (rad, counterclockwise) around point c: rooms, furniture, lights. Openings are attached to room edges and follow on their own.
export function rotatePlan(plan: Pick<Plan, 'rooms' | 'furniture' | 'lights'>, c: Point, th: number): void {
  const cs = Math.cos(th);
  const sn = Math.sin(th);
  const R = ([x, y]: Point): Point => [
    +(c[0] + (x - c[0]) * cs - (y - c[1]) * sn).toFixed(4),
    +(c[1] + (x - c[0]) * sn + (y - c[1]) * cs).toFixed(4),
  ];
  for (const r of plan.rooms) {
    r.polygon = r.polygon.map(R);
    mapFloorPieces(r, R);
  }
  for (const f of plan.furniture) {
    [f.x, f.y] = R([f.x, f.y]);
    f.rot = +(((((f.rot || 0) + (th * 180) / Math.PI) % 360) + 360) % 360).toFixed(3);
    if (f.a) f.a = R(f.a);
    if (f.b) f.b = R(f.b);
  } // a, b: the ends of a built-in wardrobe
  for (const L of plan.lights) {
    if (L.points) L.points = L.points.map(R);
    if (L.segments) L.segments = L.segments.map(s => s.map(R) as Segment); // a segment's two ends stay two
  }
}

// ---------- split a room, add a corner ----------
// Split segment: the line through point c along dir, from the nearest intersection with the outline to the nearest one on the other side.
export function cutChord(room: Room, c: Point, dir: Vector): Segment | null {
  const P = room.polygon;
  const ts: number[] = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const den = dir[0] * ey - dir[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = a[0] - c[0];
    const wy = a[1] - c[1];
    const t = (wx * ey - wy * ex) / den;
    const sp = (wx * dir[1] - wy * dir[0]) / den;
    if (sp >= -1e-9 && sp <= 1 + 1e-9) ts.push(t);
  }
  const neg = ts.filter(t => t < -1e-6);
  const pos = ts.filter(t => t > 1e-6);
  if (!neg.length || !pos.length) return null;
  const t0 = Math.max(...neg);
  const t1 = Math.min(...pos);
  const R = (v: number): number => +v.toFixed(4);
  return [
    [R(c[0] + dir[0] * t0), R(c[1] + dir[1] * t0)],
    [R(c[0] + dir[0] * t1), R(c[1] + dir[1] * t1)],
  ];
}
// Split an outline (and edge thicknesses) along p1–p2 into two parts. The parts follow the traversal order; the last edge of each is the split.
// Wall pieces (wp, pieces.js): a split point on an edge splits its pieces too.
export function splitPolygon(
  polygon: Outline,
  wt: Array<number | null> | null | undefined,
  p1: Point,
  p2: Point,
  wf?: Array<EdgeFinish | null>,
  rail?: Array<number | null>,
  wp?: Array<WallPiece[] | null>,
): [SplitPart, SplitPart] | null {
  const P = polygon.map((v): Point => [...v]);
  const W = wt ? [...wt] : null;
  const F = wf ? [...wf] : null;
  const R = rail ? [...rail] : null;
  const same = (a: Point, b: Point): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4;
  const WP = wp ? P.map((_, i) => wp[i] ?? null) : null;
  const put = (p: Point): void => {
    const k = P.findIndex(q => same(q, p));
    if (k >= 0) return;
    for (let i = 0; i < P.length; i++) {
      if (segDist(p, P[i], P[(i + 1) % P.length])[0] < 1e-5) {
        const cut = fractionAlong(p, P[i], P[(i + 1) % P.length]);
        P.splice(i + 1, 0, p);
        W?.splice(i + 1, 0, W[i] ?? null);
        F?.splice(i + 1, 0, F[i] ?? null);
        R?.splice(i + 1, 0, R[i] ?? null);
        if (WP) {
          const [before, after] = splitPieces(WP[i], cut);
          WP.splice(i, 1, before, after);
        }
        return;
      }
    }
  };
  put(p1);
  put(p2);
  const i1 = P.findIndex(q => same(q, p1));
  const i2 = P.findIndex(q => same(q, p2));
  if (i1 < 0 || i2 < 0 || i1 === i2) return null;
  const walk = (from: number, to: number): SplitPart => {
    const pts: Outline = [];
    const ws: Array<number | null> = [];
    const fs: Array<EdgeFinish | null> = [];
    const rs: Array<number | null> = [];
    const ps: Array<WallPiece[] | null> = [];
    for (let k = from; ; k = (k + 1) % P.length) {
      pts.push(P[k]);
      ws.push(k === to ? null : W ? (W[k] ?? null) : null);
      fs.push(k === to ? null : F ? (F[k] ?? null) : null);
      rs.push(k === to ? null : R ? (R[k] ?? null) : null);
      ps.push(k === to ? null : WP ? (WP[k] ?? null) : null);
      if (k === to) break;
    }
    return {pts, ws, fs, rs, ps};
  };
  const A = walk(i1, i2);
  const B = walk(i2, i1);
  if (A.pts.length < 3 || B.pts.length < 3) return null;
  return [A, B];
}
// The outward normal of edge i of a room.
const outN = (room: Room, i: number): Vector => {
  const p = room.polygon;
  const a = p[i];
  const b = p[(i + 1) % p.length];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const s = area(p) > 0 ? 1 : -1;
  return [((b[1] - a[1]) / l) * s, (-(b[0] - a[0]) / l) * s];
};
// A room's finish that the new part of a split room gets too.
const FINISH_KEYS: Array<'wall' | 'wallTint' | 'floor' | 'floorTint'> = [
  'wall',
  'wallTint',
  'floor',
  'floorTint',
];
function copyFinish<Key extends 'wall' | 'wallTint' | 'floor' | 'floorTint'>(
  from: Room,
  to: Room,
  key: Key,
): void {
  if (from[key] != null) to[key] = from[key];
}
// Split a room: two rooms flush along the split (with the default partition between them). The larger part stays this room
// (name, HA area); the smaller one is new. Openings and lights go to the part they are in.
export function splitRoom(
  plan: Pick<Plan, 'rooms' | 'openings' | 'lights' | 'wall'>,
  room: Room,
  p1: Point,
  p2: Point,
): [Room, Room] | null {
  const parts = splitPolygon(room.polygon, room.wt, p1, p2, room.wf, room.rail, room.wp);
  if (!parts) return null;
  const [A, B] = parts;
  const aA = Math.abs(area(A.pts));
  const aB = Math.abs(area(B.pts));
  if (aA < 0.01 - 1e-8 || aB < 0.01 - 1e-8) return null;
  const before = cloneRooms(plan);
  const [big, small] = aA >= aB ? [A, B] : [B, A];
  const hasWt = !!room.wt;
  room.polygon = big.pts;
  if (hasWt) room.wt = big.ws;
  if (room.wf) room.wf = big.fs;
  if (room.rail) room.rail = big.rs;
  const nr = addRoom(plan, small.pts);
  if (hasWt) nr.wt = small.ws;
  if (room.wf && small.fs.some(x => x)) nr.wf = small.fs;
  if (room.rail && small.rs.some(x => x)) nr.rail = small.rs;
  if (room.wp) {
    room.wp = big.ps;
    tidyWallPieces(room);
    if (small.ps.some(list => list?.length)) nr.wp = small.ps;
  }
  if (room.fp) nr.fp = structuredClone(room.fp); // each part keeps the floor pieces that reach into it (below, after the walls settle)
  if (room.railGlass && nr.rail) nr.railGlass = true; // glass railings stay glass on both parts (D-075)
  if (room.rail?.every(x => !x)) {
    delete room.rail;
    delete room.railGlass;
  }
  for (const k of FINISH_KEYS) copyFinish(room, nr, k); // the new part gets the same finish
  if (room.wt?.every(x => x == null)) delete room.wt;
  if (nr.wt?.every(x => x == null)) delete nr.wt;
  const gap = Math.max(0, wallDefaults(plan).inner - 2 * WALL.inner);
  if (gap > 0.001)
    for (const r of [room, nr]) {
      const i = r.polygon.length - 1;
      moveEdges([[r, i]], snapshot(plan), outN(r, i), -gap / 2);
    }
  for (const r of [room, nr]) keepFloorPiecesInside(r);
  reattachOpenings(plan, before);
  for (const L of plan.lights)
    if (L.room === room.id) {
      const q: Point | undefined =
        L.points?.[0] ||
        (L.segments?.[0] && [
          (L.segments[0][0][0] + L.segments[0][1][0]) / 2,
          (L.segments[0][0][1] + L.segments[0][1][1]) / 2,
        ]);
      const r = q && roomAt(plan, q);
      if (r) L.room = r.id;
    }
  return [room, nr];
}
// Add a corner at t (0…1) along edge i: a double point. Drag one half of the wall and you get a right-angle step.
export function addCorner(plan: Pick<Plan, 'rooms' | 'openings'>, room: Room, i: number, t: number): number {
  const p = room.polygon;
  const a = p[i];
  const b = p[(i + 1) % p.length];
  const q: Point = [+(a[0] + (b[0] - a[0]) * t).toFixed(4), +(a[1] + (b[1] - a[1]) * t).toFixed(4)];
  const k = insertVertex(plan, room, i, q);
  insertVertex(plan, room, k, [...q]);
  return k;
}

// An old edge's values, for the edges of a merged room that lie on it.
interface MergeSource {
  c: Point;
  e: Point;
  t: number | null;
  f: EdgeFinish | null;
  h: number | null;
}
// Merge two rooms across a shared wall (info is the wallInfo of an interior wall): one room without that wall; the name and area come from the larger one.
// A door in the removed wall disappears; lights and furniture stay in place.
export function mergeRooms(plan: Pick<Plan, 'rooms' | 'openings' | 'lights'>, info: WallInfo): Room | null {
  const others = [...new Set(info.B.map(([r]) => r))];
  if (!info.interior || others.length !== 1) return null;
  const A = info.room;
  const B = others[0];
  const u = info.u;
  const n = info.n;
  const a = info.a;
  const L = Math.hypot(info.b[0] - a[0], info.b[1] - a[1]);
  // the wall strip between them, along the shared stretch
  let lo = L;
  let hi = 0;
  for (const [r, j] of info.B) {
    for (const q of [r.polygon[j], r.polygon[(j + 1) % r.polygon.length]]) {
      const t = (q[0] - a[0]) * u[0] + (q[1] - a[1]) * u[1];
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
  }
  lo = Math.max(0, lo);
  hi = Math.min(L, hi);
  if (hi - lo < 0.05) return null;
  const g = info.gap;
  const e = 0.002;
  const P = (t: number, d: number): Point => [a[0] + u[0] * t + n[0] * d, a[1] + u[1] * t + n[1] * d];
  const band: Outline = [P(lo, -e), P(hi, -e), P(hi, g + e), P(lo, g + e)];
  const un = pc.union(poly(A.polygon), poly(B.polygon), poly(band));
  if (un.length !== 1 || un[0].length !== 1) return null;
  // outline without redundant points on straight runs
  let pts = un[0][0].slice(0, -1).map((q): Point => [+q[0].toFixed(4), +q[1].toFixed(4)]);
  for (let changed = true; changed && pts.length > 3;) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[(i - 1 + pts.length) % pts.length];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      const cr = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
      if (Math.abs(cr) < 1e-6) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (area(pts) < 0) pts.reverse();
  // edge thicknesses come from the edges of the old rooms that the new edges lie on
  const src = [A, B].flatMap(r =>
    r.polygon.map((c, j): MergeSource => ({
      c,
      e: r.polygon[(j + 1) % r.polygon.length],
      t: r.wt?.[j] ?? null,
      f: r.wf?.[j] ?? null,
      h: r.rail?.[j] ?? null,
    })),
  );
  const srcOf = (p: Point, i: number): MergeSource | undefined => {
    const q = pts[(i + 1) % pts.length];
    return src.find(x => segDist(p, x.c, x.e)[0] < 1e-3 && segDist(q, x.c, x.e)[0] < 1e-3);
  };
  const wt = pts.map((p, i) => srcOf(p, i)?.t ?? null);
  const wf = pts.map((p, i) => srcOf(p, i)?.f ?? null);
  const rail = pts.map((p, i) => srcOf(p, i)?.h ?? null);
  // wall pieces: from every old edge each new edge lies along (two rooms side by side: one long wall gets the pieces of both)
  const wallPiecesOf = (start: Point, end: Point): WallPiece[] | null => {
    const carried: WallPiece[] = [];
    for (const r of [A, B])
      r.polygon.forEach((c, j) =>
        carried.push(...carryPieces(r.wp?.[j], c, r.polygon[(j + 1) % r.polygon.length], start, end)),
      );
    return carried.length ? carried : null;
  };
  const wp = pts.map((p, i) => wallPiecesOf(p, pts[(i + 1) % pts.length]));
  const fp = [...(A.fp || []), ...(B.fp || [])];
  const [keep, gone] = Math.abs(area(A.polygon)) >= Math.abs(area(B.polygon)) ? [A, B] : [B, A];
  const before = cloneRooms(plan);
  // a door in the removed wall disappears
  plan.openings = plan.openings.filter(o => {
    const c = openingCoords(before, o);
    if (!c) return true;
    const m: Point = [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2];
    return !pointIn(m, band);
  });
  keep.polygon = pts;
  if (wt.some(x => x != null)) keep.wt = wt;
  else delete keep.wt;
  if (wf.some(x => x)) keep.wf = wf;
  else delete keep.wf;
  if (rail.some(x => x)) keep.rail = rail;
  else delete keep.rail;
  if (wp.some(x => x)) keep.wp = wp;
  else delete keep.wp;
  if (fp.length) keep.fp = fp;
  else delete keep.fp;
  if (keep.rail && (A.railGlass || B.railGlass)) keep.railGlass = true;
  else delete keep.railGlass;
  plan.rooms = plan.rooms.filter(r => r !== gone);
  for (const o of plan.openings) if (o.at?.room === gone.id) o.at = {...o.at, room: keep.id};
  reattachOpenings(plan, before);
  for (const L of plan.lights) if (L.room === gone.id) L.room = keep.id;
  return keep;
}

// Scale the whole plan around point c: rooms were traced over a photo at the wrong scale, so after “Set scale from a wall” they are adjusted too.
// Furniture sizes and wall thicknesses are left alone (they are already real); openings are attached to edges in meters, so they are scaled too.
export function scalePlan(plan: PlanCore, c: Point, k: number): void {
  const S = ([x, y]: Point): Point => [
    +(c[0] + (x - c[0]) * k).toFixed(4),
    +(c[1] + (y - c[1]) * k).toFixed(4),
  ];
  for (const r of plan.rooms) {
    r.polygon = r.polygon.map(S);
    mapFloorPieces(r, S);
  }
  for (const o of plan.openings) if (o.at) o.at = {...o.at, s0: o.at.s0 * k, s1: o.at.s1 * k, d: o.at.d * k};
  for (const f of plan.furniture) {
    [f.x, f.y] = S([f.x, f.y]);
    if (f.a) f.a = S(f.a);
    if (f.b) f.b = S(f.b);
  }
  for (const L of plan.lights) {
    if (L.points) L.points = L.points.map(S);
    if (L.segments) L.segments = L.segments.map(s => s.map(S) as Segment); // a segment's two ends stay two
  }
}

// ---------- wall segment and removing a “leftover” room ----------
// The wall stretch at t (0…1) along edge i: only the part shared with one neighbor (or the exterior part between neighbors).
// This way any wall can be removed: “Remove wall” joins exactly two rooms.
export function wallAt(plan: Pick<Plan, 'rooms' | 'wall'>, room: Room, i: number, t = 0.5): WallStretch {
  const W = wallInfo(plan, room, i);
  const L = Math.hypot(W.b[0] - W.a[0], W.b[1] - W.a[1]);
  const x = Math.max(0, Math.min(1, t)) * L;
  // [from, to] along our edge that another edge covers
  const iv = ([r, j]: EdgeRef): [number, number] => {
    const c = r.polygon[j];
    const e = r.polygon[(j + 1) % r.polygon.length];
    const s0 = (c[0] - W.a[0]) * W.u[0] + (c[1] - W.a[1]) * W.u[1];
    const s1 = (e[0] - W.a[0]) * W.u[0] + (e[1] - W.a[1]) * W.u[1];
    return [Math.max(0, Math.min(s0, s1)), Math.min(L, Math.max(s0, s1))];
  };
  // how far out another edge is
  const off = ([r, j]: EdgeRef): number => {
    const c = r.polygon[j];
    const e = r.polygon[(j + 1) % r.polygon.length];
    return Math.max(
      0,
      ((c[0] - W.a[0]) * W.n[0] +
        (c[1] - W.a[1]) * W.n[1] +
        (e[0] - W.a[0]) * W.n[0] +
        (e[1] - W.a[1]) * W.n[1]) /
        2,
    );
  };
  const hit: EdgeRef | undefined = W.B.filter(b => {
    const [lo, hi] = iv(b);
    return hi - lo > 1e-6 && x >= lo - 1e-6 && x <= hi + 1e-6;
  }).sort((p, q) => off(p) - off(q))[0];
  if (hit) {
    const nb = hit[0];
    const Bn = W.B.filter(([r]) => r === nb);
    const ivs = Bn.map(iv);
    const gap = Math.min(...Bn.map(off));
    return {
      ...W,
      A: [[room, i]],
      B: Bn,
      neighbor: nb,
      seg: [Math.min(...ivs.map(v => v[0])), Math.max(...ivs.map(v => v[1]))],
      interior: true,
      gap,
      t: gap + 2 * WALL.inner,
    };
  }
  let lo = 0;
  let hi = L;
  for (const [a, b] of W.B.map(iv)) {
    if (b <= x + 1e-6) lo = Math.max(lo, b);
    if (a >= x - 1e-6) hi = Math.min(hi, a);
  }
  return {
    ...W,
    A: [[room, i]],
    B: [],
    neighbor: null,
    seg: [lo, hi],
    interior: false,
    gap: 0,
    t: edgeThickness(room, i, wallDefaults(plan).outer),
  };
}
// A room surrounded by others on all sides (a leftover strip after a bad split): deleting it gives its area to the neighbor
// with the longest shared wall instead of leaving a walled-in hole. Returns the neighbor, or null (then delete as usual).
export function absorbRoom(
  plan: Pick<Plan, 'rooms' | 'openings' | 'lights' | 'wall'>,
  room: Room,
): Room | null {
  const P = room.polygon;
  let per = 0;
  let shared = 0;
  let best: {r: Room; l: number; i: number; t: number} | null = null;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    per += L;
    const W = wallInfo(plan, room, i);
    if (!W.interior) continue;
    // per neighbor: how much of this edge it shares, and from where to where
    const by = new Map<Room, {l: number; lo: number; hi: number}>();
    for (const [r, j] of W.B) {
      const c = r.polygon[j];
      const e = r.polygon[(j + 1) % r.polygon.length];
      const s0 = (c[0] - a[0]) * W.u[0] + (c[1] - a[1]) * W.u[1];
      const s1 = (e[0] - a[0]) * W.u[0] + (e[1] - a[1]) * W.u[1];
      const lo = Math.max(0, Math.min(s0, s1));
      const hi = Math.min(L, Math.max(s0, s1));
      if (hi > lo) {
        const o = by.get(r) || {l: 0, lo: L, hi: 0};
        o.l += hi - lo;
        o.lo = Math.min(o.lo, lo);
        o.hi = Math.max(o.hi, hi);
        by.set(r, o);
      }
    }
    for (const [r, o] of by) {
      shared += o.l;
      if (!best || o.l > best.l) best = {r, l: o.l, i, t: (o.lo + o.hi) / 2 / L};
    }
  }
  if (!best || shared < per * 0.9) return null;
  return mergeRooms(plan, wallAt(plan, room, best.i, best.t));
}

// ---------- windows and doors ----------
// An opening lives on a room edge: at={room,edge,s0,s1,d}, s measured from the start of the edge, in m. It is placed by clicking a wall,
// then moved along it and resized by its ends; it never leaves its wall and never overlaps neighboring openings.
// A door's swing is the leaf position; “Rotate” cycles through: hinges at the start or at the end, opening into the room or outward.
export const OPENING: Record<OpeningKind, {w: number; bottom: number; top: number}> = {
  door: {w: 0.8, bottom: 0, top: 2.1},
  window: {w: 1.4, bottom: 0.85, top: 2.4},
};
export const ENTRY_W = 0.9;
export const MIN_OPENING = 0.4;
// A door leaf's positions: hinges at the edge's start (0) or end (1), opening into the room or outward.
export const SWING: Array<{hinge: 0 | 1; out: boolean}> = [
  {hinge: 0, out: false},
  {hinge: 1, out: false},
  {hinge: 1, out: true},
  {hinge: 0, out: true},
];
export function openingId(plan: {openings: ReadonlyArray<{id?: string}>}): string {
  const ids = new Set(plan.openings.map(o => o.id));
  let k = plan.openings.length + 1;
  while (ids.has('op_' + k)) k++;
  return 'op_' + k;
}
// Edge i of a room: its start, length and direction.
const edgeOf = (room: Room, i: number): {a: Point; l: number; u: Vector} => {
  const p = room.polygon;
  const a = p[i % p.length];
  const b = p[(i + 1) % p.length];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return {a, l, u: [(b[0] - a[0]) / l, (b[1] - a[1]) / l]};
};
// Occupied stretches [s0,s1] of an edge: openings on it and the neighbor's openings on the other side of the same wall.
export function openingSpans(
  plan: Pick<Plan, 'rooms' | 'openings' | 'wall'>,
  room: Room,
  i: number,
  skip?: string,
): Array<[number, number]> {
  const {a, u, l} = edgeOf(room, i);
  const n: Vector = [-u[1], u[0]];
  const t = wallInfo(plan, room, i).t + 0.05;
  const out: Array<[number, number]> = [];
  // along the edge from its start, and across it
  const pr = (q: Point): [number, number] => [
    (q[0] - a[0]) * u[0] + (q[1] - a[1]) * u[1],
    (q[0] - a[0]) * n[0] + (q[1] - a[1]) * n[1],
  ];
  for (const o of plan.openings) {
    if (o.id === skip) continue;
    const c = openingCoords(plan.rooms, o);
    if (!c) continue;
    const [s0, d0] = pr(c.a);
    const [s1, d1] = pr(c.b);
    if (Math.abs(d0 - d1) > 0.02 || Math.abs(d0) > t) continue; // not on this wall
    const lo = Math.min(s0, s1);
    const hi = Math.max(s0, s1);
    if (hi > 0 && lo < l) out.push([lo, hi]);
  }
  return out;
}
// The free stretch around s between lo and hi; null if s is inside another opening.
function freeGap(spans: Array<[number, number]>, s: number, lo: number, hi: number): [number, number] | null {
  for (const [a, b] of spans) {
    if (s > a && s < b) return null;
    if (b <= s) lo = Math.max(lo, b);
    else if (a >= s) hi = Math.min(hi, a);
  }
  return hi - lo > 1e-6 ? [lo, hi] : null;
}
// The wall stretch an opening can move along: corner to corner (up to where a cross wall joins), minus neighboring openings.
export function openingGap(
  plan: Pick<Plan, 'rooms' | 'openings' | 'wall'>,
  o: Opening,
): [number, number] | null {
  const r = roomById(plan, o.at.room);
  if (!r) return null;
  const {l} = edgeOf(r, o.at.edge);
  const c = (o.at.s0 + o.at.s1) / 2;
  const [lo, hi] = wallAt(plan, r, o.at.edge, c / l).seg;
  return freeGap(openingSpans(plan, r, o.at.edge, o.id), c, Math.max(0.02, lo), Math.min(l - 0.02, hi));
}
// Place an opening on edge i of a room at s (ideally centered on the click point). lo/hi: the wall stretch under the click,
// outer: the wall is exterior (an entrance door is wider). Less than 40 cm of space → null.
export function addOpening(
  plan: Pick<Plan, 'rooms' | 'openings' | 'wall'>,
  room: Room,
  i: number,
  s: number,
  kind: OpeningKind,
  {lo = 0, hi, outer = false}: {lo?: number; hi?: number; outer?: boolean} = {},
): Opening | null {
  const {l} = edgeOf(room, i);
  hi = Math.min(hi ?? l, l - 0.02);
  lo = Math.max(lo, 0.02);
  const g = freeGap(openingSpans(plan, room, i), s, lo, hi);
  if (!g || g[1] - g[0] < MIN_OPENING) return null;
  const w = Math.min(kind === 'door' && outer ? ENTRY_W : OPENING[kind].w, g[1] - g[0]);
  const c = Math.max(g[0] + w / 2, Math.min(g[1] - w / 2, s));
  const o: Opening = {
    id: openingId(plan),
    kind,
    at: {room: room.id, edge: i, s0: +(c - w / 2).toFixed(3), s1: +(c + w / 2).toFixed(3), d: 0},
    bottom: OPENING[kind].bottom,
    top: OPENING[kind].top,
  };
  if (kind === 'door') o.swing = c - lo <= hi - c ? 0 : 1; // hinges at the nearer corner, the leaf opens into the room on the side that was clicked
  plan.openings.push(o);
  return o;
}
// Width keeping the center, within the opening's own wall stretch.
export function setOpeningWidth(
  plan: Pick<Plan, 'rooms' | 'openings' | 'wall'>,
  o: Opening,
  w: number,
): void {
  const g = openingGap(plan, o);
  if (!g) return;
  w = Math.max(MIN_OPENING, Math.min(w, g[1] - g[0]));
  const c = Math.max(g[0] + w / 2, Math.min(g[1] - w / 2, (o.at.s0 + o.at.s1) / 2));
  o.at = {...o.at, s0: +(c - w / 2).toFixed(3), s1: +(c + w / 2).toFixed(3)};
}
export const turnDoor = (o: Opening): void => {
  o.swing = ((o.swing || 0) + 1) % SWING.length;
};

// ---------- room names ----------
// the default name is “Room 3” in the UI language (and in Russian: the plan was started before the language was switched)
const DEF = (): RegExp =>
  new RegExp(
    '^(?:' +
      [t('Room {0}'), 'Room {0}', 'Комната {0}']
        .map(x => x.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace('{0}', '\\d+'))
        .join('|') +
      ')$',
  );
export const isDefaultName = (n: string | null | undefined): boolean => DEF().test(n || '');
// Another room already has this name: “Bedroom 2”, “Bedroom 3”.
export function uniqueName(plan: Pick<Plan, 'rooms'>, room: Room | null, name: string): string {
  const taken = new Set(plan.rooms.filter(r => r !== room).map(r => r.name));
  if (!taken.has(name)) return name;
  let k = 2;
  while (taken.has(`${name} ${k}`)) k++;
  return `${name} ${k}`;
}

// ---------- two areas in one room (kitchen-living room) ----------
// A boundary without a wall: room.zone={a,b,area,left} is a segment across the room; area is the HA area of the part to the left
// of a→b (left), the rest is room.area. When the room is edited, the boundary is recomputed from the segment's midpoint and direction;
// once it no longer crosses the room, there is no division (zoneParts → null). Walls and 3D are not affected.
const zoneDir = (z: {a: Point; b: Point}): Vector => {
  const L = Math.hypot(z.b[0] - z.a[0], z.b[1] - z.a[1]) || 1;
  return [(z.b[0] - z.a[0]) / L, (z.b[1] - z.a[1]) / L];
};
export function zoneParts(room: Room): ZoneParts | null {
  const z = room.zone;
  if (!z) return null;
  const d = zoneDir(z);
  const m: Point = [(z.a[0] + z.b[0]) / 2, (z.a[1] + z.b[1]) / 2];
  if (!pointIn(m, room.polygon)) return null;
  const ch = cutChord(room, m, d);
  if (!ch) return null;
  const parts = splitPolygon(room.polygon, null, ch[0], ch[1]);
  if (!parts) return null;
  // the part lies to the left of the boundary's direction
  const left = (pts: Outline): boolean => {
    const c = centroid(pts);
    return d[0] * (c[1] - m[1]) - d[1] * (c[0] - m[0]) > 0;
  };
  const [A, B] = parts.map(x => x.pts);
  const zA = left(A) === z.left;
  return {ch, d, n: [-d[1], d[0]], zone: zA ? A : B, main: zA ? B : A};
}
// Set the boundary along segment ch (across the room): the left side is a new area, not linked yet.
export function setZone(room: Room, ch: Segment): ZoneParts | null {
  room.zone = {a: ch[0], b: ch[1], area: null, left: true};
  return zoneParts(room);
}
// Move the boundary by t along the normal; both parts must stay at least 30 cm wide, otherwise the boundary stays put. Returns whether it moved.
export function moveZone(room: Room, z0: RoomZone, t: number): boolean {
  const d = zoneDir(z0);
  const n: Vector = [-d[1], d[0]];
  const m: Point = [(z0.a[0] + z0.b[0]) / 2 + n[0] * t, (z0.a[1] + z0.b[1]) / 2 + n[1] * t];
  return tryZone(room, m, d, z => ({...z0, ...z}));
}
// Boundary along the chord through m in direction d; both parts at least 30 cm wide, otherwise the room stays as it was. make(z) gives the new room.zone.
function tryZone(room: Room, m: Point, d: Vector, make: (z: {a: Point; b: Point}) => RoomZone): boolean {
  if (!pointIn(m, room.polygon)) return false;
  const ch = cutChord(room, m, d);
  if (!ch) return false;
  const parts = splitPolygon(room.polygon, null, ch[0], ch[1]);
  if (!parts) return false;
  const n: Vector = [-d[1], d[0]];
  // a part's width across the boundary
  const w = (pts: Outline): number => {
    const pr = pts.map(q => q[0] * n[0] + q[1] * n[1]);
    return Math.max(...pr) - Math.min(...pr);
  };
  if (parts.some(x => w(x.pts) < 0.3)) return false;
  room.zone = make({a: ch[0], b: ch[1]});
  return true;
}
// Edge i of the region was dragged inward by t: the boundary runs parallel to the edge, the strip cut off along the edge is the second part
// (no area yet), the rest is the room's area. Under 30 cm, there is no division.
export function zoneFromEdge(room: Room, i: number, t: number): boolean {
  const P = room.polygon;
  const a = P[i];
  const b = P[(i + 1) % P.length];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 1e-6) return false;
  const u: Vector = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const s = area(P) > 0 ? 1 : -1;
  const nIn: Vector = [-u[1] * s, u[0] * s];
  const em: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (t < 0.3) {
    const had = !!room.zone;
    delete room.zone;
    return had;
  }
  const m: Point = [em[0] + nIn[0] * t, em[1] + nIn[1] * t];
  return tryZone(room, m, u, z => {
    const c = [(z.a[0] + z.b[0]) / 2, (z.a[1] + z.b[1]) / 2];
    const d = zoneDir(z);
    return {...z, area: null, left: d[0] * (em[1] - c[1]) - d[1] * (em[0] - c[0]) > 0};
  });
}
