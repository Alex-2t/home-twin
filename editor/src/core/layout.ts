// Placement rules for furniture and lights: snapping to walls, overlap checks. No three.js.
import {t} from '../i18n/i18n.ts';
import {WALL, openingCoords, openingOut, pointIn, centroid} from './geometry.ts';
import {roomEdges, roomAt, uniqueName, SWING} from './plan.ts';
import {byId, zOf, lArms, nameOf} from './catalog.ts';
import {isRun, runGeo} from './runs.ts';
import type {
  CatalogEntry,
  FootRect,
  FurnitureItem,
  ItemOutline,
  LightSnap,
  Outline,
  PlacedOpening,
  Plan,
  PlanLight,
  Point,
  Room,
  RoomEdge,
  Segment,
  Vector,
  WallSnap,
  WallStrip,
} from './types.ts';

export const GRID = 0.05;
// An item's catalog entry (catalog.ts byId).
const entryOf = (f: FurnitureItem): CatalogEntry | undefined => byId(f.model);
const grid = (v: number): number => Math.round(v / GRID) * GRID;

// ---------- furniture ----------
// An item's axes on the plan: ax runs along its width, fz is where its front faces (0° is south).
export const axes = (f: FurnitureItem): [Vector, Vector] => {
  const t = (f.rot * Math.PI) / 180;
  return [
    [Math.cos(t), Math.sin(t)],
    [Math.sin(t), -Math.cos(t)],
  ];
};
export function corners(f: FurnitureItem, shrink = 0): Outline {
  const [ax, fz] = axes(f);
  const w = f.w / 2 - shrink;
  const d = f.d / 2 - shrink;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]): Point => [f.x + ax[0] * w * i + fz[0] * d * j, f.y + ax[1] * w * i + fz[1] * d * j]);
}
// The footprint on the plan is rectangles in the item's axes [x0,x1,z0,z1] (z points to the front): an L-shaped item has two, an arm along the back
// and one along the left side (mirrored: the right); the recess in front of a corner sofa is free, so a coffee table fits there.
export function footLocal(f: FurnitureItem): FootRect[] {
  const L = lArms(f);
  const W = f.w / 2;
  const D = f.d / 2;
  if (!L) return [[-W, W, -D, D]];
  const s = f.mx ? -1 : 1;
  const {back, side, u} = L;
  const R = (x0: number, x1: number, z0: number, z1: number): FootRect =>
    s > 0 ? [x0, x1, z0, z1] : [-x1, -x0, z0, z1];
  return [
    R(-W, W, -D, -D + back),
    R(-W, -W + side, -D + back, D),
    ...(u ? [R(W - side, W, -D + back, D)] : []),
  ];
} // u: U-shaped
// A point in the item's axes (x along its width, z towards its front) on the plan.
const W2 = (f: FurnitureItem, [ax, fz]: [Vector, Vector], x: number, z: number): Point => [
  f.x + ax[0] * x + fz[0] * z,
  f.y + ax[1] * x + fz[1] * z,
];
export function footRects(f: FurnitureItem, shrink = 0): Outline[] {
  const A = axes(f);
  return footLocal(f).map(([x0, x1, z0, z1]) =>
    [
      [x0 + shrink, z0 + shrink],
      [x1 - shrink, z0 + shrink],
      [x1 - shrink, z1 - shrink],
      [x0 + shrink, z1 - shrink],
    ].map(([x, z]) => W2(f, A, x, z)),
  );
}
// the polygon to draw and the front sides (for an L-shaped item, the inner corner)
// round on the plan (plant, vase, round table, round and oval rug): a circle or ellipse from width and depth, with no front
export const isRound = (f: FurnitureItem): boolean => {
  const c = entryOf(f);
  const r = c?.round;
  if (!Array.isArray(r)) return r === true;
  // round in some variants: the item's own, or the model's first one
  const variant = f.v || c?.vars?.[0][0];
  return variant !== undefined && r.includes(variant);
};
export function outline(f: FurnitureItem): ItemOutline {
  if (isRound(f)) {
    const [ax, fz] = axes(f);
    return {
      pts: Array.from({length: 32}, (_, i): Point => {
        const t = (i / 32) * Math.PI * 2;
        const x = (Math.cos(t) * f.w) / 2;
        const z = (Math.sin(t) * f.d) / 2;
        return [f.x + ax[0] * x + fz[0] * z, f.y + ax[1] * x + fz[1] * z];
      }),
      front: [],
    };
  }
  const L = lArms(f);
  if (!L) {
    const c = corners(f);
    return {pts: c, front: [c[2], c[3]]};
  }
  const A = axes(f);
  const W = f.w / 2;
  const D = f.d / 2;
  const s = f.mx ? -1 : 1;
  const {back, side, u} = L;
  if (u) {
    const q = [
      [-W, -D],
      [W, -D],
      [W, D],
      [W - side, D],
      [W - side, -D + back],
      [-W + side, -D + back],
      [-W + side, D],
      [-W, D],
    ].map(([x, z]) => W2(f, A, x, z));
    return {pts: q, front: [q[3], q[4], q[5], q[6]]};
  }
  const q = [
    [-W, -D],
    [W, -D],
    [W, -D + back],
    [-W + side, -D + back],
    [-W + side, D],
    [-W, D],
  ].map(([x, z]) => W2(f, A, x * s, z));
  return {pts: q, front: [q[2], q[3], q[4]]};
}
export const inFoot = (f: FurnitureItem, p: Point): boolean => {
  const [x, z] = localXY(f, p);
  return footLocal(f).some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
};
// A plan point in the item's axes: [along its width, towards its front], from its centre.
export function localXY(f: FurnitureItem, p: Point): [number, number] {
  const [ax, fz] = axes(f);
  const dx = p[0] - f.x;
  const dy = p[1] - f.y;
  return [dx * ax[0] + dy * ax[1], dx * fz[0] + dy * fz[1]];
}

// A place along a wall an item may snap to: where (metres from the wall's start), and what it is: the middle of the wall
// ('mid'), a window's middle ('win', with the window's width) or a neighbour's edge (where that edge is).
type SnapPlace = [at: number, kind?: 'mid' | 'win' | number, width?: number];
// Snapping to a wall: the nearest edge, the item stands with its back to it; near a corner, flush with the adjacent wall; near the middle of the wall,
// centered; next to a neighbor on this wall, flush with it or aligned with its edge (kitchen modules in a row, wall cabinets above base ones).
// snap: how close (m); the editor derives it from the zoom (the owner: when zoomed in, could not place an item off-center, it kept pulling into the corner).
// Returns {x,y,rot, wall, mid, edge, win}: wall to highlight the wall, mid is the midline of the wall or window, edge is the neighbor's edge,
// win is the window width if the item is centered on it.
export function snapToWall(plan: Plan, f: FurnitureItem, p: Point, free?: boolean, snap = 0.25): WallSnap {
  if (free) return {x: p[0], y: p[1], rot: f.rot};
  // how far from a wall the pull starts: usually 55 cm behind the back; a chair, table or rug (loose) only when almost touching
  let best: (RoomEdge & {off: number; along: number}) | null = null;
  const reach = entryOf(f)?.loose ? WALL.inner + 0.1 : 0.55;
  for (const e of roomEdges(plan)) {
    if (e.l < 0.3) continue;
    const along = (p[0] - e.a[0]) * e.u[0] + (p[1] - e.a[1]) * e.u[1];
    const off = (p[0] - e.a[0]) * e.n[0] + (p[1] - e.a[1]) * e.n[1];
    if (along < -0.1 || along > e.l + 0.1 || off < -0.1 || off > f.d / 2 + reach) continue;
    if (!best || off < best.off) best = {...e, off, along};
  }
  if (!best) return {x: grid(p[0]), y: grid(p[1]), rot: f.rot};
  const {a, u, n, l} = best;
  const rot = ((Math.atan2(n[0], -n[1]) * 180) / Math.PI + 360) % 360;
  const hw = f.w / 2 + 0.003;
  const lo = WALL.inner + hw;
  const hi = l - WALL.inner - hw;
  const c = l / 2;
  // how far along (or across) the wall a point is
  const pr = (q: Point, v: Vector): number => (q[0] - a[0]) * v[0] + (q[1] - a[1]) * v[1];
  // neighbors along this wall: their corners projected onto the wall; flush left/right or with edges aligned
  const cand: SnapPlace[] = [[lo], [hi], [c, 'mid']];
  // windows in this wall: centered on the window (curtains, a radiator under the window, a desk by the window)
  for (const o of plan.openings || []) {
    if (o.kind !== 'window') continue;
    const q = openingCoords(plan.rooms, o);
    if (!q) continue;
    const pa = pr(q.a, u);
    const pb = pr(q.b, u);
    if (
      Math.abs(pr(q.a, n)) > 0.35 ||
      Math.abs(pr(q.b, n)) > 0.35 ||
      Math.max(pa, pb) < 0 ||
      Math.min(pa, pb) > l
    )
      continue;
    cand.push([(pa + pb) / 2, 'win', Math.abs(pb - pa)]);
  }
  // a built-in wardrobe, by its rectangles along each wall: a cabinet stands flush against its end
  for (const g of plan.furniture || []) {
    if (g.id === f.id) continue;
    const boxes: Outline[] = isRun(g)
      ? runGeo(plan, g)?.sides.map((side: {box: Outline}) => side.box) || []
      : [corners(g)];
    for (const cs of boxes) {
      const al = cs.map(q => pr(q, u));
      const of = cs.map(q => pr(q, n));
      if (Math.abs(Math.min(...of) - WALL.inner) > 0.03 || Math.max(...al) < 0 || Math.min(...al) > l)
        continue;
      const g0 = Math.min(...al);
      const g1 = Math.max(...al);
      cand.push([g0 - hw, g0], [g1 + hw, g1], [g0 + hw, g0], [g1 - hw, g1]);
    }
  }
  let s = hi < lo ? c : Math.max(lo, Math.min(hi, best.along));
  let hit: SnapPlace | null = null;
  // the nearest within snap; a window within snap wins over everything (the middle of the wall is often almost at the window)
  const dist = (k: SnapPlace): number => Math.abs(s - k[0]) + (k[1] === 'win' ? 0 : 1);
  if (hi >= lo) {
    for (const k of cand)
      if (
        k[0] >= lo - 1e-6 &&
        k[0] <= hi + 1e-6 &&
        Math.abs(s - k[0]) < snap &&
        (!hit || dist(k) < dist(hit))
      )
        hit = k;
    s = hit ? hit[0] : grid(s);
  }
  const back = WALL.inner + f.d / 2 + 0.003;
  const k = f.d + WALL.inner + 0.3;
  // a guide line across the wall at t along it
  const ln = (t: number): Segment => {
    const m: Point = [a[0] + u[0] * t, a[1] + u[1] * t];
    return [m, [m[0] + n[0] * k, m[1] + n[1] * k]];
  };
  return {
    x: +(a[0] + u[0] * s + n[0] * back).toFixed(4),
    y: +(a[1] + u[1] * s + n[1] * back).toFixed(4),
    rot,
    wall: [a, best.b],
    mid: hit?.[1] === 'mid' ? ln(c) : hit?.[1] === 'win' ? ln(hit[0]) : null,
    edge: typeof hit?.[1] === 'number' ? ln(hit[1]) : null,
    win: hit?.[1] === 'win' ? hit[2] : null,
  };
}
function overlap(A: Outline, B: Outline): boolean {
  for (const P of [A, B])
    for (let i = 0; i < 4; i++) {
      const a = P[i];
      const b = P[(i + 1) % 4];
      const n = [-(b[1] - a[1]), b[0] - a[0]];
      const pa = A.map(v => v[0] * n[0] + v[1] * n[1]);
      const pb = B.map(v => v[0] * n[0] + v[1] * n[1]);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  return true;
}
// Map of item id → reason: goes into a wall, blocks a door, overlaps another item.
// Height counts too: a wall-hung item (wall cabinets, TV, range hood) overlaps only if it also intrudes on another item in height:
// a TV above a TV stand is fine, but a wall cabinet below the top of the fridge conflicts.
// The item's bottom and top above the floor.
const zr = (f: FurnitureItem): [number, number] => {
  const z = zOf(f);
  return [z, z + f.h];
};
// One item is wholly above the other.
const above = (f: FurnitureItem, g: FurnitureItem): boolean => {
  const [a0, a1] = zr(f);
  const [b0, b1] = zr(g);
  return a1 <= b0 + 0.005 || b1 <= a0 + 0.005;
};
// Tucked under a table: a chair, desk chair or mobile pedestal (under) under a table (table) does not overlap if the part going under
// the tabletop is lower than it (for a chair, the seat; the backrest stays outside). A catalog model says so in the catalog; an item
// from parts says so itself (parts.under, parts.table — the same true or height in meters). true: all of it, up to its top (a
// radiator hung under the window goes under the top of a table standing at it, a tall one does not). The AI build's audit counts
// things standing in each other by this same rule.
// Truthy when one of the two tucks under the other (the value is the last test made, as before: false, undefined or true).
export const tuck = (f: FurnitureItem, g: FurnitureItem): boolean | number | undefined => {
  // what it says of itself: under (true or a height), table (true or the top's height)
  const U = (x: FurnitureItem): boolean | number | undefined => entryOf(x)?.under ?? x.parts?.under;
  const T = (x: FurnitureItem): boolean | number | undefined => entryOf(x)?.table ?? x.parts?.table;
  // how high the part that goes under reaches, and how high the top is
  const u = (x: FurnitureItem): number => {
    const under = U(x);
    return under === true ? zOf(x) + x.h : under || 0;
  };
  const t = (x: FurnitureItem): number => {
    const table = T(x);
    return table === true ? x.h : table || 0;
  };
  return (U(f) && T(g) && u(f) <= t(g) - 0.03) || (U(g) && T(f) && u(g) <= t(f) - 0.03);
}; // table as a number: the tabletop height (a dressing table has a mirror above it)
// Items stacked above each other (wall cabinets above base cabinets, a TV above a TV stand, a range hood above a cooktop, a microwave on
// the countertop): they overlap f on the plan but not in height. Bottom to top, including f; the item panel lets you switch to any of them.
export function stackOf(plan: Plan, f: FurnitureItem): FurnitureItem[] {
  const soft = (g: FurnitureItem): boolean => !!entryOf(g)?.soft;
  if (soft(f)) return [f];
  // the item's rectangles on the plan (a built-in run: along each wall)
  const R = (g: FurnitureItem): Outline[] =>
    isRun(g) ? runGeo(plan, g)?.sides.map((side: {quad: Outline}) => side.quad) || [] : footRects(g, 0.01);
  const A = R(f);
  return [
    f,
    ...plan.furniture.filter(
      g => g !== f && !soft(g) && above(f, g) && R(g).some(b => A.some(a => overlap(a, b))),
    ),
  ].sort((a, b) => zOf(a) - zOf(b));
}
export function furnitureConflicts(plan: Plan): Map<string, string> {
  // a built-in wardrobe: rectangles along each wall (by the main face; at a column the rectangle goes into it, which is not an error)
  const out = new Map<string, string>();
  const F = plan.furniture;
  const C = F.map((f): Outline[] =>
    isRun(f) ? runGeo(plan, f)?.sides.map((side: {quad: Outline}) => side.quad) || [] : footRects(f, 0.01),
  );
  const ov = (A: Outline[], B: Outline[]): boolean => A.some(a => B.some(b => overlap(a, b)));
  const soft = (f: FurnitureItem): boolean => !!entryOf(f)?.soft;
  // The door zone: on the side the leaf opens to, as deep as the door width (the leaf sweeps it); on the other side and for an opening
  // without a door, 30 cm. Something hung above the top of the door (an air conditioner over the door) does not block it.
  const doors = plan.openings
    .map(o => openingCoords(plan.rooms, o))
    .filter((o): o is PlacedOpening => !!o && o.kind === 'door')
    .map(o => {
      const l = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) || 1;
      const n = openingOut(plan.rooms, o); // n points out of the opening's room
      const leaf = !(o.leaf === false || (o.swing == null && l > 1.15));
      const inn = SWING[o.swing || 0].out ? n : [-n[0], -n[1]];
      const f = leaf ? Math.min(l, 1) + 0.05 : 0.3;
      const b = 0.3;
      const poly: Outline = [
        [o.a[0] + inn[0] * f, o.a[1] + inn[1] * f],
        [o.b[0] + inn[0] * f, o.b[1] + inn[1] * f],
        [o.b[0] - inn[0] * b, o.b[1] - inn[1] * b],
        [o.a[0] - inn[0] * b, o.a[1] - inn[1] * b],
      ];
      return {top: o.top ?? 2.1, poly};
    });
  F.forEach((f, i) => {
    const room = !isRun(f) && roomAt(plan, [f.x, f.y]);
    // a built-in wardrobe's shape follows the wall faces, so it never goes into a wall; no shape means there is no room for it
    if (
      isRun(f)
        ? !C[i].length
        : !room ||
          !footRects(f, 0.02)
            .flat()
            .every(v => pointIn(v, room.polygon))
    )
      out.set(f.id, t('goes into a wall'));
    else if (soft(f))
      return; // curtains hang in front of furniture and in front of a balcony door
    else if (doors.some(d => zOf(f) < d.top - 0.02 && ov(C[i], [d.poly]))) out.set(f.id, t('blocks a door'));
    else {
      const j = F.findIndex((g, k) => k !== i && !soft(g) && !above(f, g) && !tuck(f, g) && ov(C[i], C[k]));
      if (j >= 0) out.set(f.id, t('overlaps “{0}”', nameOf(F[j])));
    }
  });
  return out;
}

// ---------- lights ----------
// A light point: near the room center it snaps to the center, otherwise to the grid and to the x/y of this light's other points.
// tol is the on-screen tolerance in meters (8 px at the current zoom); the center pulls from one and a half times farther (12 px), but no more than 25 cm:
// when zoomed in, it goes anywhere (the owner: could not place lights in the bathroom, everything pulled to the center; it used to be 35 cm at any zoom).
export function snapLightPoint(
  plan: Pick<Plan, 'rooms'>,
  L: Pick<PlanLight, 'points'>,
  p: Point,
  {free, tol = 0.15, skip}: {free?: boolean; tol?: number; skip?: number} = {},
): LightSnap {
  if (free) return {p};
  const r = roomAt(plan, p);
  if (r) {
    const c = centroid(r.polygon);
    if (Math.hypot(c[0] - p[0], c[1] - p[1]) < Math.min(0.25, tol * 1.5))
      return {p: c.map(v => +v.toFixed(3)) as Point, guides: [{x: c[0]}, {y: c[1]}]};
  }
  let gx: Point | null = null;
  let gy: Point | null = null;
  L.points.forEach((q, i) => {
    if (i === skip) return;
    if (Math.abs(q[0] - p[0]) < tol) gx = q;
    if (Math.abs(q[1] - p[1]) < tol) gy = q;
  });
  const x = gx ? gx[0] : grid(p[0]);
  const y = gy ? gy[1] : grid(p[1]);
  return {p: [+x.toFixed(3), +y.toFixed(3)], guides: [gx && {x}, gy && {y}].filter(guide => guide !== null)};
}
// A strip: the whole nearest wall of the room along its surface, 10 cm in from the corners.
export function stripOnWall(plan: Pick<Plan, 'rooms'>, p: Point): WallStrip | null {
  let best: (RoomEdge & {off: number}) | null = null;
  for (const e of roomEdges(plan)) {
    if (e.l < 0.4) continue;
    const along = (p[0] - e.a[0]) * e.u[0] + (p[1] - e.a[1]) * e.u[1];
    const off = (p[0] - e.a[0]) * e.n[0] + (p[1] - e.a[1]) * e.n[1];
    if (along < 0 || along > e.l || off < -0.15 || off > 0.7) continue;
    if (!best || off < best.off) best = {...e, off};
  }
  if (!best) return null;
  const {room, a, u, n, l} = best;
  const k = WALL.inner + 0.03;
  const pt = (t: number): Point => [
    +(a[0] + u[0] * t + n[0] * k).toFixed(3),
    +(a[1] + u[1] * t + n[1] * k).toFixed(3),
  ];
  return {room: room.id, seg: [pt(0.1), pt(l - 0.1)]};
}
// Spotlights in a grid across the room, 60 cm in from the walls.
export function gridSpots(room: Room, rows: number, cols: number): Point[] {
  const xs = room.polygon.map(v => v[0]);
  const ys = room.polygon.map(v => v[1]);
  const x0 = Math.min(...xs) + 0.6;
  const x1 = Math.max(...xs) - 0.6;
  const y0 = Math.min(...ys) + 0.6;
  const y1 = Math.max(...ys) - 0.6;
  const pts: Point[] = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const q: Point = [
        +(cols > 1 ? x0 + ((x1 - x0) * j) / (cols - 1) : (x0 + x1) / 2).toFixed(3),
        +(rows > 1 ? y0 + ((y1 - y0) * i) / (rows - 1) : (y0 + y1) / 2).toFixed(3),
      ];
      if (pointIn(q, room.polygon)) pts.push(q);
    }
  return pts;
}

// “Auto-place”: unplaced lights go into the room of their HA area: a point light to the center,
// a ceiling strip along the longest wall. Countertop and baseboard strips are left to the person.
export function autoPlaceLights(
  plan: Pick<Plan, 'rooms' | 'lights'>,
  roomOfArea: (area: string | null | undefined) => Room | null | undefined,
): number {
  let n = 0;
  for (const L of plan.lights) {
    if (L.placed) continue;
    const r = roomOfArea(L.area);
    if (!r) continue;
    if (L.kind === 'point') {
      L.points = [centroid(r.polygon).map(v => +v.toFixed(3)) as Point];
    } else {
      if (L.h !== undefined && L.h < 1.8) continue;
      let best: RoomEdge | null = null;
      for (const e of roomEdges(plan)) if (e.room === r && (!best || e.l > best.l)) best = e;
      if (!best) continue;
      const longest = best;
      const k = WALL.inner + 0.03;
      const pt = (t: number): Point => [
        +(longest.a[0] + longest.u[0] * t + longest.n[0] * k).toFixed(3),
        +(longest.a[1] + longest.u[1] * t + longest.n[1] * k).toFixed(3),
      ];
      L.segments = [[pt(0.1), pt(longest.l - 0.1)]];
    }
    L.placed = true;
    L.room = r.id;
    L.auto = true;
    n++;
  }
  return n;
}

// A room gets a name and an HA area (area is its id, or null for just a name). Lights are not placed automatically: what kind of light
// (points or a strip), how many points and where is known only to the user; that is the “Lights” step. Lights of the previous area
// that were auto-placed (L.auto) and left untouched are removed from the plan, otherwise the kitchen lights would stay in the bedroom.
export function setRoomArea(
  plan: Pick<Plan, 'rooms' | 'lights'>,
  room: Room,
  area: string | null | undefined,
  name: string,
): void {
  if (room.area && room.area !== area)
    for (const L of plan.lights)
      if (L.auto && L.area === room.area && L.room === room.id) {
        L.placed = false;
        L.points = [];
        L.segments = [];
        L.room = null;
        delete L.auto;
      }
  if (area) room.area = area;
  else delete room.area;
  room.name = area ? name : uniqueName(plan, room, name); // an area keeps its name from HA as is: two pieces of a hallway are both “Hallway”
}
