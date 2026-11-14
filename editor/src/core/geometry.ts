// Pure 2D plan geometry: no three.js, runs both in the browser and in node (tests, fuzz).
// Plan: rooms are outlines of [x,y] in meters (x is east, y is north); openings are attached to a room edge.
import {t} from '../i18n/i18n.ts';
import pc from 'polygon-clipping';
import type {
  ClipPolygon,
  FacadeSideId,
  GlassRail,
  MultiPolygon,
  OpeningAt,
  Outline,
  PlanProblem,
  Point,
  Room,
  Segment,
  Vector,
  WallBand,
  WallOpening,
  WallPlan,
} from './types.ts';

// height: the ceiling of a plan that sets none of its own (plan.wall.height, ceilingOf below), as every plan had before.
export const WALL = {inner: 0.05, outer: 0.25, height: 2.6};
// The ceiling heights a plan may set, metres: an attic room or a basement at the low end, a loft or a grand old flat at the top.
export const CEILING_RANGE: [number, number] = [2.1, 4.5];
// The plan's ceiling height, metres: its own (plan.wall.height), or the editor's usual walls when it sets none. A value that is not a
// number gives the usual walls too (a plan from Home Assistant or the history is not checked like a file); one outside the range
// is brought into it.
export function ceilingOf(plan: {wall?: {height?: number}}): number {
  const own = plan.wall?.height;
  if (typeof own !== 'number' || !Number.isFinite(own)) return WALL.height;
  return Math.min(CEILING_RANGE[1], Math.max(CEILING_RANGE[0], own));
}
// A railing in place of a wall at a room edge (room.rail[i] = its height): an open balcony, a terrace. The usual height, m.
export const RAIL = 1.1;
// A glass railing (room.railGlass: every railing of that room, D-075): a low kerb along the edge, a pane of glass standing on it.
export const KERB = 0.06;

// polygon-clipping takes its first shape apart from the rest; the code hands it whole lists. An empty list hands it undefined,
// as spreading the empty list did.
const unionAll = (shapes: Array<ClipPolygon | MultiPolygon>): MultiPolygon =>
  pc.union(shapes[0], ...shapes.slice(1));

// ---------- small math ----------
export const dist2 = (a: Point, b: Point): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
// The distance from p to the segment a–b, and where along it the nearest point is (0 at a, 1 at b).
export function segDist(p: Point, a: Point, b: Point): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return [Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), t];
}
export const pointIn = ([x, y]: Point, ring: Outline): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
export const centroid = (p: Outline): Point =>
  p.reduce<Point>((s, v) => [s[0] + v[0] / p.length, s[1] + v[1] / p.length], [0, 0]);
// A square cell of the label search: its centre, half its side, the signed distance from its centre to the nearest edge
// (negative outside) and the best distance any point in it could have.
interface LabelCell {
  x: number;
  y: number;
  h: number;
  d: number;
  max: number;
}
// Where to put a room's label. For an L-shaped room or a room with a protrusion, the vertex average lands in a wall or a shaft,
// so we look for the point inside that is farthest from the edges and from the obstacles in holes (solid parts: shafts, columns):
// the “pole of inaccessibility”, like polylabel. A vertex average that is almost as roomy is kept: in a simple room
// the label stays centered rather than at a random point on the long axis. Precision is 2 cm.
export function labelPoint(p: Outline, holes: Outline[] = [], prec = 0.02): Point {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of p) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const c = centroid(p);
  const size = Math.min(x1 - x0, y1 - y0);
  if (!(size > 0)) return c;
  const signedDistance = (x: number, y: number): number => {
    const q: Point = [x, y];
    let m = Infinity;
    for (const g of [p, ...holes])
      for (let i = 0, j = g.length - 1; i < g.length; j = i++) m = Math.min(m, segDist(q, g[j], g[i])[0]);
    return pointIn(q, p) && !holes.some(h => pointIn(q, h)) ? m : -m;
  };
  const cell = (x: number, y: number, h: number): LabelCell => {
    const d = signedDistance(x, y);
    return {x, y, h, d, max: d + h * Math.SQRT2};
  };
  const mid = cell(c[0], c[1], 0);
  let best = mid;
  const queue: LabelCell[] = [];
  for (let x = x0; x < x1; x += size)
    for (let y = y0; y < y1; y += size) queue.push(cell(x + size / 2, y + size / 2, size / 2));
  for (let n = 0; queue.length && n < 4000; n++) {
    let k = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].max > queue[k].max) k = i;
    const cur = queue[k];
    queue[k] = queue[queue.length - 1];
    queue.pop();
    if (cur.d > best.d) best = cur;
    if (cur.max - best.d <= prec) continue;
    const h = cur.h / 2;
    queue.push(
      cell(cur.x - h, cur.y - h, h),
      cell(cur.x + h, cur.y - h, h),
      cell(cur.x - h, cur.y + h, h),
      cell(cur.x + h, cur.y + h, h),
    );
  }
  return mid.d > 0 && mid.d >= best.d * 0.85 ? c : [best.x, best.y];
}
export const r4 = (v: number): number => +v.toFixed(4);

// The signed area: positive for an outline that runs counterclockwise.
export const area = (p: Outline): number =>
  p.reduce((s, [x, y], i) => {
    const [u, v] = p[(i + 1) % p.length];
    return s + x * v - u * y;
  }, 0) / 2;
export function offset(poly: Outline, d: number): Outline {
  poly = poly.filter((v, i, a) => {
    const w = a[(i + 1) % a.length];
    return Math.hypot(w[0] - v[0], w[1] - v[1]) > 1e-6;
  });
  const s = area(poly) > 0 ? 1 : -1;
  const n = poly.length;
  const out: Outline = [];
  const normal = (a: Point, b: Point): Vector => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    return [(s * dy) / l, (-s * dx) / l];
  };
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n];
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    const n1 = normal(p0, p1);
    const n2 = normal(p1, p2);
    const a = [p0[0] + n1[0] * d, p0[1] + n1[1] * d];
    const da = [p1[0] - p0[0], p1[1] - p0[1]];
    const b = [p1[0] + n2[0] * d, p1[1] + n2[1] * d];
    const db = [p2[0] - p1[0], p2[1] - p1[1]];
    const den = da[0] * db[1] - da[1] * db[0];
    if (Math.abs(den) < 1e-9) {
      out.push([p1[0] + n1[0] * d, p1[1] + n1[1] * d]);
      continue;
    }
    const t = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / den;
    out.push([a[0] + da[0] * t, a[1] + da[1] * t]);
  }
  return out;
}
// Offset an outline outward by a separate amount for each edge (ds[i] is for edge i → i+1): exterior walls of different thickness.
// Adjacent edges on one line with different offsets produce a step; an overly sharp corner is cut off.
export function offsetVar(poly: Outline, ds: number[]): Outline {
  const P: Outline = [];
  const D: number[] = [];
  poly.forEach((v, i) => {
    const w = poly[(i + 1) % poly.length];
    if (Math.hypot(w[0] - v[0], w[1] - v[1]) > 1e-6) {
      P.push(v);
      D.push(ds[i]);
    }
  });
  const s = area(P) > 0 ? 1 : -1;
  const n = P.length;
  const out: Outline = [];
  const normal = (a: Point, b: Point): Vector => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    return [(s * dy) / l, (-s * dx) / l];
  };
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n];
    const p1 = P[i];
    const p2 = P[(i + 1) % n];
    const d1 = D[(i - 1 + n) % n];
    const d2 = D[i];
    const n1 = normal(p0, p1);
    const n2 = normal(p1, p2);
    const a = [p0[0] + n1[0] * d1, p0[1] + n1[1] * d1];
    const da = [p1[0] - p0[0], p1[1] - p0[1]];
    const b = [p1[0] + n2[0] * d2, p1[1] + n2[1] * d2];
    const db = [p2[0] - p1[0], p2[1] - p1[1]];
    const den = da[0] * db[1] - da[1] * db[0];
    const e1: Point = [p1[0] + n1[0] * d1, p1[1] + n1[1] * d1];
    const e2: Point = [p1[0] + n2[0] * d2, p1[1] + n2[1] * d2];
    if (Math.abs(den) < 1e-9) {
      out.push(e1);
      if (Math.abs(d1 - d2) > 1e-6) out.push(e2);
      continue;
    }
    const t = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / den;
    const q: Point = [a[0] + da[0] * t, a[1] + da[1] * t];
    if (Math.hypot(q[0] - p1[0], q[1] - p1[1]) > 4 * Math.max(d1, d2, 0.05)) out.push(e1, e2);
    else out.push(q);
  }
  return out;
}
// Rounding to 1 mm: without it polygon-clipping crashes on nearly coincident points.
let STEP = 1000;
export const snap = (v: number): number => Math.round(v * STEP) / STEP;
// An outline as polygon-clipping takes it: rounded, without repeated corners, closed.
export const poly = (p: Outline): ClipPolygon => {
  const q = p
    .map(([x, y]): Point => [snap(x), snap(y)])
    .filter((v, i, a) => {
      const w = a[(i + 1) % a.length];
      return v[0] !== w[0] || v[1] !== w[1];
    });
  return [[...q, q[0]]];
};
// A strip w wide on each side of the segment a–b.
export const rect = (a: Point, b: Point, w: number): ClipPolygon => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  const nx = (-dy / l) * w;
  const ny = (dx / l) * w;
  return poly([
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ]);
};
const mpArea = (mp: MultiPolygon): number =>
  mp.reduce(
    (s, [o, ...h]) =>
      s + Math.abs(area(o.slice(0, -1))) - h.reduce((t, r) => t + Math.abs(area(r.slice(0, -1))), 0),
    0,
  );

// ---------- plan validation ----------
function segX(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point): number =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
// Returns a list of errors {room, text}. An empty list means the plan can be built.
export function validate(rooms: Room[]): PlanProblem[] {
  const errs: PlanProblem[] = [];
  for (const r of rooms) {
    const p0 = r.polygon;
    const n0 = p0.length;
    if (n0 < 3) {
      errs.push({room: r.id, text: t('has fewer than 3 corners')});
      continue;
    }
    const p = p0.filter((v, i) => {
      const w = p0[(i + 1) % n0];
      return Math.hypot(w[0] - v[0], w[1] - v[1]) > 1e-6;
    });
    const n = p.length;
    if (n < 3) {
      errs.push({room: r.id, text: t('has fewer than 3 corners')});
      continue;
    }
    // a double point (a zero-length edge) is a corner in the making (“Add corner”), not an error
    for (let i = 0; i < n; i++) {
      const a = p[i];
      const b = p[(i + 1) % n];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < 0.05) errs.push({room: r.id, text: t('has a side under 5 cm')});
    }
    let self = false;
    for (let i = 0; i < n && !self; i++)
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (segX(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) {
          self = true;
          break;
        }
      }
    if (self) errs.push({room: r.id, text: t('outline crosses itself')});
    else if (Math.abs(area(p)) < 0.25) errs.push({room: r.id, text: t('is under 0.25 m²')});
  }
  if (errs.length) return errs;
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const x = pc.intersection(poly(rooms[i].polygon), poly(rooms[j].polygon));
      if (mpArea(x) > 1e-4)
        errs.push({room: rooms[j].id, other: rooms[i].id, text: t('overlaps “{0}”', rooms[i].name)});
    }
  return errs;
}

// ---------- openings attached to a room edge ----------
// {room, edge, s0, s1, d}: positions along the edge from its start, and the offset across it (the opening sits in the middle of the wall).
export function attachOpening<Ends extends {a: Point; b: Point}>(
  rooms: Room[],
  o: Ends,
): (Ends & {at: OpeningAt}) | null {
  let best: (OpeningAt & {score: number}) | null = null;
  for (const r of rooms) {
    const p = r.polygon;
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      const ux = dx / l;
      const uy = dy / l;
      // along the edge from its start, and across it
      const project = (q: Point): [number, number] => [
        (q[0] - a[0]) * ux + (q[1] - a[1]) * uy,
        -(q[0] - a[0]) * uy + (q[1] - a[1]) * ux,
      ];
      const [s0, d0] = project(o.a);
      const [s1, d1] = project(o.b);
      if (Math.abs(d0) > 0.35 || Math.abs(d1) > 0.35) continue;
      if (Math.max(s0, s1) < -0.05 || Math.min(s0, s1) > l + 0.05) continue;
      const score = Math.abs(d0) + Math.abs(d1);
      if (!best || score < best.score) best = {room: r.id, edge: i, s0, s1, d: (d0 + d1) / 2, score};
    }
  }
  if (!best) return null;
  const {score, ...at} = best;
  return {...o, at};
}
// Outward from the opening's room: the one of the two normals that does not face into it (which side a door's leaf is on).
// The probe goes past the middle of the wall, where the opening sits: at a fixed 12 cm a door in the middle of a 25 cm balcony wall
// probed inside the wall itself, and its side came from the order of its ends
export function openingOut(rooms: Room[], o: {a: Point; b: Point; at?: OpeningAt}): Vector {
  const r = rooms.find(r => r.id === o.at?.room);
  const dx = o.b[0] - o.a[0];
  const dy = o.b[1] - o.a[1];
  const l = Math.hypot(dx, dy) || 1;
  const n: Vector = [dy / l, -dx / l];
  const k = Math.max(0.12, Math.abs(o.at?.d || 0) + 0.06);
  return r && !pointIn([(o.a[0] + o.b[0]) / 2 - n[0] * k, (o.a[1] + o.b[1]) / 2 - n[1] * k], r.polygon)
    ? [-n[0], -n[1]]
    : n;
}
// The opening with its ends on the plan now (a, b), from its place on the edge; null when it no longer fits there.
export function openingCoords<Placed extends {at: OpeningAt}>(
  rooms: Room[],
  o: Placed,
): (Placed & {a: Point; b: Point}) | null {
  const r = rooms.find(r => r.id === o.at.room);
  if (!r) return null;
  const p = r.polygon;
  const a = p[o.at.edge % p.length];
  const b = p[(o.at.edge + 1) % p.length];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  // an edge of no length (a corner given twice in a file) holds no opening: its ends would be one point
  if (l < 1e-6) return null;
  const ux = dx / l;
  const uy = dy / l;
  // If the edge was shortened, the opening shrinks to fit within it.
  const clamp = (s: number): number => Math.max(0.02, Math.min(l - 0.02, s));
  // a file may lack the offset across the wall (the file check lets it through): the middle of the edge's line
  const across = o.at.d || 0;
  const pt = (s: number): Point => [a[0] + ux * clamp(s) - uy * across, a[1] + uy * clamp(s) + ux * across];
  const s0 = clamp(o.at.s0);
  const s1 = clamp(o.at.s1);
  // The edge became shorter than the opening: the opening disappears, and the plan reports it.
  if (Math.abs(s1 - s0) < 0.1) return null;
  return {...o, a: pt(o.at.s0), b: pt(o.at.s1)};
}

// ---------- walls from outlines (as in walls-from-json) ----------
// polygon-clipping occasionally fails to close an outline (about 0.1% of edited plans in fuzz.mjs).
// Then we build again with 2 and 5 mm rounding: there is no visible difference.
// opts.outer is the default exterior wall thickness (m); a room edge can have its own, room.wt[i]: a number is the thickness, 0 means no wall.
// opts.height is how high the walls go: the plan's ceiling (ceilingOf), none: the usual walls.
export function buildPlan2d(
  rooms: Room[],
  openings: WallOpening[],
  opts: {outer?: number; height?: number} = {},
): WallPlan {
  let err: unknown;
  for (const step of [1000, 500, 200]) {
    STEP = step;
    try {
      const g = buildRaw(rooms, openings, opts);
      return Object.assign(g, {step});
    } catch (e) {
      err = e;
    } finally {
      STEP = 1000;
    }
  }
  throw err;
}
export const OUTER = WALL.inner + WALL.outer; // default exterior wall, 30 cm
// Exterior wall thickness at edge i: the room's own value or the shared default.
export const edgeThickness = (r: Room, i: number, outer = OUTER): number => {
  const own = r.wt?.[i];
  return own != null && own > 0 ? own : outer;
};
// No wall at the edge: cut out a strip from the room outward, as deep as the gap to the neighbor (or the exterior wall).
function openCut(rooms: Room[], r: Room, i: number, outer: number): ClipPolygon | null {
  const p = r.polygon;
  const a = p[i];
  const b = p[(i + 1) % p.length];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  if (l < 0.15) return null;
  const u = [dx / l, dy / l];
  const s = area(p) > 0 ? 1 : -1;
  const n = [u[1] * s, -u[0] * s];
  const e = WALL.inner;
  let gap: number | null = null;
  for (const o of rooms) {
    if (o === r) continue;
    const q = o.polygon;
    for (let j = 0; j < q.length; j++) {
      const c = q[j];
      const f = q[(j + 1) % q.length];
      const fl = Math.hypot(f[0] - c[0], f[1] - c[1]);
      if (fl < 1e-6 || Math.abs(((f[0] - c[0]) * u[0] + (f[1] - c[1]) * u[1]) / fl) < 0.995) continue;
      const off =
        ((c[0] - a[0]) * n[0] + (c[1] - a[1]) * n[1] + (f[0] - a[0]) * n[0] + (f[1] - a[1]) * n[1]) / 2;
      if (off < -0.02 || off > 0.5) continue;
      const s0 = (c[0] - a[0]) * u[0] + (c[1] - a[1]) * u[1];
      const s1 = (f[0] - a[0]) * u[0] + (f[1] - a[1]) * u[1];
      if (Math.max(s0, s1) < 0.05 || Math.min(s0, s1) > l - 0.05) continue;
      gap = gap == null ? off : Math.min(gap, off);
    }
  }
  const depth = (gap ?? edgeThickness(r, i, outer) - e) + e + 0.01;
  const A = [a[0] + u[0] * e, a[1] + u[1] * e];
  const B = [b[0] - u[0] * e, b[1] - u[1] * e];
  return poly([
    [A[0] - n[0] * (e + 0.01), A[1] - n[1] * (e + 0.01)],
    [B[0] - n[0] * (e + 0.01), B[1] - n[1] * (e + 0.01)],
    [B[0] + n[0] * depth, B[1] + n[1] * depth],
    [A[0] + n[0] * depth, A[1] + n[1] * depth],
  ]);
}
// Where a railing's strip lies: its ends on the edge line, the outward normal, how far it reaches in and out.
interface RailFrame {
  A: Point;
  B: Point;
  n: Vector;
  inside: number;
  out: number;
}
// A railing at edge i: the strip from the room's inner face out through the wall. Along the edge it reaches across the corner
// where the next edge has a railing too (the balcony's outer corner), and stops at the inner face of a wall that goes on.
// A, B — its ends on the edge line; n — outward; it spans from `inside` in to `out` out.
function railFrame(r: Room, i: number, outer: number): RailFrame | null {
  const p = r.polygon;
  const N = p.length;
  const a = p[i];
  const b = p[(i + 1) % N];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  if (l < 0.05) return null;
  const u = [dx / l, dy / l];
  const s = area(p) > 0 ? 1 : -1;
  const n: Vector = [u[1] * s, -u[0] * s];
  const e = WALL.inner;
  const out = edgeThickness(r, i, outer) - e + 0.01;
  // how far past corner j the strip reaches: across it when that edge is a railing too, else back to the wall's inner face
  const ext = (j: number): number => {
    const railing = r.rail?.[j];
    return railing != null && railing > 0 ? edgeThickness(r, j, outer) + 0.01 : -e;
  };
  const x0 = ext((i - 1 + N) % N);
  const x1 = ext((i + 1) % N);
  return {
    A: [a[0] - u[0] * x0, a[1] - u[1] * x0],
    B: [b[0] + u[0] * x1, b[1] + u[1] * x1],
    n,
    inside: e + 0.01,
    out,
  };
}
function railStrip(r: Room, i: number, outer: number): ClipPolygon | null {
  const f = railFrame(r, i, outer);
  if (!f) return null;
  const {A, B, n, inside, out} = f;
  return poly([
    [A[0] - n[0] * inside, A[1] - n[1] * inside],
    [B[0] - n[0] * inside, B[1] - n[1] * inside],
    [B[0] + n[0] * out, B[1] + n[1] * out],
    [A[0] + n[0] * out, A[1] + n[1] * out],
  ]);
}
// A glass railing's pane: along the middle of its strip, from the kerb up to the railing's height.
function railPane(r: Room, i: number, outer: number, h: number, ceiling: number): GlassRail | null {
  const f = railFrame(r, i, outer);
  if (!f) return null;
  const {A, B, n, inside, out} = f;
  const c = (out - inside) / 2;
  return {
    a: [A[0] + n[0] * c, A[1] + n[1] * c],
    b: [B[0] + n[0] * c, B[1] + n[1] * c],
    bottom: KERB,
    top: Math.min(h, ceiling),
  };
}
function buildRaw(
  rooms: Room[],
  openings: WallOpening[],
  {outer = OUTER, height = WALL.height}: {outer?: number; height?: number} = {},
): Omit<WallPlan, 'step'> {
  // room.solid is a shaft, column or boxing: not cut out of the walls, it stays a solid mass at full height
  const insetRooms = rooms.filter(r => !r.solid).map(r => poly(offset(r.polygon, -WALL.inner)));
  const footprint = unionAll(
    rooms.map(r =>
      poly(
        offsetVar(
          r.polygon,
          r.polygon.map((_, i) => edgeThickness(r, i, outer) - WALL.inner),
        ),
      ),
    ),
  );
  let walls = pc.difference(footprint, ...insetRooms);
  const cuts = rooms
    .flatMap(r => (r.wt || []).map((t, i) => (t === 0 ? openCut(rooms, r, i, outer) : null)))
    .filter(cut => cut !== null);
  if (cuts.length) walls = pc.difference(walls, ...cuts);
  // Railings: the wall at those edges becomes a parapet as high as the railing — its own solid, under no facade, never hidden.
  // A glass railing: the wall goes down to a kerb, and a pane stands on it (glassRails; scene.js draws the glass and a handrail).
  const railBy = new Map<number, ClipPolygon[]>();
  const glassRails: GlassRail[] = [];
  for (const r of rooms)
    (r.rail || []).forEach((h, i) => {
      if (h == null || !(h > 0)) return;
      const q = railStrip(r, i, outer);
      if (!q) return;
      const k = r.railGlass ? KERB : Math.min(h, height);
      let strips = railBy.get(k);
      if (!strips) {
        strips = [];
        railBy.set(k, strips);
      }
      strips.push(q);
      if (r.railGlass) {
        const pane = railPane(r, i, outer, h, height);
        if (pane) glassRails.push(pane);
      }
    });
  const rails: WallBand[] = [];
  if (railBy.size && walls.length) {
    const all = [...railBy.values()].flat();
    for (const [h, qs] of railBy) {
      const mp = solid(pc.intersection(walls, unionAll(qs)));
      if (mp.length) rails.push({mp, bottom: 0, top: h, last: true});
    }
    walls = pc.difference(walls, ...all);
  }
  // An exterior wall is a strip along the building outline, as thick as the wall. Its side (S, E, N, W) is where its outer face points:
  // 3D hides the side facing the camera. The rest are partitions, always visible.
  const strips = facadeStrips(footprint, rooms);
  const taken: MultiPolygon[] = [];
  const sideIds: FacadeSideId[] = ['S', 'E', 'N', 'W'];
  const sides = sideIds.map(id => {
    const zone = strips.filter(s => s.side === id).map(s => s.quad);
    let shape: MultiPolygon = zone.length && walls.length ? pc.intersection(walls, unionAll(zone)) : [];
    if (shape.length && taken.length) shape = pc.difference(shape, ...taken);
    shape = solid(shape);
    if (shape.length) taken.push(shape);
    return {id, shape};
  });
  const interior = solid(taken.length && walls.length ? pc.difference(walls, ...taken) : walls);
  // an opening cuts all the way through the wall: its depth is the wall thickness at its edge
  const ops = openings.map(o => {
    const r = rooms.find(r => r.id === o.at?.room);
    // a room found by the opening's place: the opening has one
    const depth = r ? edgeThickness(r, o.at!.edge, outer) : 0;
    return {...o, poly: rect(o.a, o.b, Math.max(0.42, depth))};
  });
  // A window's glass is hidden together with the side whose wall holds most of its opening.
  const openingSide = ops.map(o => {
    let best: FacadeSideId | null = null;
    let most = 1e-4;
    for (const s of sides) {
      if (!s.shape.length) continue;
      const a = mpArea(pc.intersection(o.poly, s.shape));
      if (a > most) {
        most = a;
        best = s.id;
      }
    }
    return best;
  });
  // Every height where a band of wall begins or ends. An opening without a bottom or a top adds none (and cuts no band below).
  const hs = [
    ...new Set([
      0,
      height,
      ...ops
        .flatMap(o => [o.bottom, o.top])
        .filter((h): h is number => h !== undefined && h > 0 && h < height),
    ]),
  ].sort((a, b) => a - b);
  // Height bands: each one subtracts the openings that span it.
  const bands = (base: MultiPolygon): WallBand[] => {
    const out: WallBand[] = [];
    for (let i = 0; i < hs.length - 1; i++) {
      const [a, b] = [hs[i], hs[i + 1]];
      const cut = ops
        .filter(
          o => o.bottom !== undefined && o.bottom <= a + 1e-6 && o.top !== undefined && o.top >= b - 1e-6,
        )
        .map(o => o.poly);
      out.push({
        mp: cut.length && base.length ? pc.difference(base, ...cut) : base,
        bottom: a,
        top: b,
        last: i === hs.length - 2,
      });
    }
    return out;
  };
  return {
    footprint,
    interior: bands(interior),
    sides: sides.map(s => ({...s, bands: bands(s.shape)})),
    rails,
    glassRails,
    openingSide,
    height,
  };
}
// Where a face points: the nearest of the four cardinal directions (x is east, y is north).
const sideOf = ([x, y]: Vector): FacadeSideId =>
  Math.abs(x) > Math.abs(y) + 1e-9 ? (x > 0 ? 'E' : 'W') : y > 0 ? 'N' : 'S';
// One face of the building outline: its ends, length, direction and outward normal, how thick the wall behind it is (D), and
// which side of the building it is on (set once all faces are known).
interface Face {
  a: Point;
  b: Point;
  l: number;
  u: Vector;
  n: Vector;
  D: number;
  side?: FacadeSideId;
}
// A strip along one face of the building and the side it belongs to.
interface FacadeStrip {
  side: FacadeSideId;
  quad: ClipPolygon;
}
// Strips along each face of the building outline: from the face inward by the thickness of the wall behind it (to the nearest room + 1 cm).
// Adjacent strips meet along the corner bisector and butt against each other. A hole inside the outline (a gap between rooms) is not a facade: its walls are always visible.
function facadeStrips(footprint: MultiPolygon, rooms: Room[]): FacadeStrip[] {
  const segs = rooms.flatMap(r =>
    r.polygon.map((c, j): Segment => [c, r.polygon[(j + 1) % r.polygon.length]]),
  );
  const out: FacadeStrip[] = [];
  // The bisector passes exactly through the wall corners, and polygon-clipping breaks on that: shift the joint by a couple of millimeters.
  const SH = 2.5 / STEP;
  const add = (p: Point, v: Vector, k: number): Point => [p[0] + v[0] * k, p[1] + v[1] * k];
  // The intersection of the lines of faces e1 and e2, shifted inward by d1 and d2 (a negative shift is outward).
  const meet = (
    e1: {a: Point; b: Point; n: Vector},
    d1: number,
    e2: {a: Point; b: Point; n: Vector},
    d2: number,
  ): Point | null => {
    const a = add(e1.a, e1.n, -d1);
    const da: Vector = [e1.b[0] - e1.a[0], e1.b[1] - e1.a[1]];
    const b = add(e2.a, e2.n, -d2);
    const db: Vector = [e2.b[0] - e2.a[0], e2.b[1] - e2.a[1]];
    const den = da[0] * db[1] - da[1] * db[0];
    if (Math.abs(den) < 1e-9 * Math.hypot(...da) * Math.hypot(...db)) return null;
    const t = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / den;
    return [a[0] + da[0] * t, a[1] + da[1] * t];
  };
  for (const [rg] of footprint) {
    const P = rg.slice(0, -1);
    const n = P.length;
    if (n < 3) continue;
    const s = Math.sign(area(P)); // counterclockwise: the building is to the left of the traversal, outward is to the right
    const E = P.map((a, i): Face => {
      const b = P[(i + 1) % n];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      const m: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const gap = Math.min(...segs.map(([c, d]) => segDist(m, c, d)[0]));
      return {
        a,
        b,
        l,
        u: [dx / l, dy / l],
        n: [(s * dy) / l, (-s * dx) / l],
        D: Math.max(0.05, Math.min(1.2, gap + WALL.inner + 0.01)),
      };
    });
    // A stub of a couple of centimeters (a joint between walls of different thickness) goes with the side of its longer neighbor.
    E.forEach((e, i) => {
      const p = E[(i - 1 + n) % n];
      const q = E[(i + 1) % n];
      e.side = sideOf(e.l < 0.06 ? (p.l > q.l ? p.n : q.n) : e.n);
    });
    // The joint at vertex i: an “outside → inward” segment for the end of face i−1 (end) and the start of face i (start).
    const C = E.map((e, i): {end: Segment; start: Segment} => {
      const prev = E[(i - 1 + n) % n];
      const p = e.a;
      const lim = 3 * Math.max(e.D, prev.D, 0.1);
      const o = meet(prev, -0.01, e, -0.01);
      const q = meet(prev, prev.D, e, e.D);
      const near = (x: Point | null): x is Point => x !== null && Math.hypot(x[0] - p[0], x[1] - p[1]) < lim;
      if (near(o) && near(q)) {
        const l = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1;
        const v: Vector = [-(q[1] - o[1]) / l, (q[0] - o[0]) / l];
        const seg: Segment = [add(o, v, SH), add(q, v, SH)];
        return {end: seg, start: seg};
      }
      // Faces on one line share a cut across; at a sharp corner each gets its own cut, set back into its own face.
      const cut = (f: Face, k: number): Segment => [
        add(add(p, f.n, 0.01), f.u, k),
        add(add(p, f.n, -f.D), f.u, k),
      ];
      if (!o && !q && prev.u[0] * e.u[0] + prev.u[1] * e.u[1] > 0) {
        const D = Math.max(prev.D, e.D);
        const seg: Segment = [add(add(p, e.n, 0.01), e.u, SH), add(add(p, e.n, -D), e.u, SH)];
        return {end: seg, start: seg};
      }
      return {end: cut(prev, -SH), start: cut(e, SH)};
    });
    E.forEach((e, i) => {
      // every face got its side in the pass above
      const side = e.side!;
      const [o0, i0] = C[i].start;
      const [o1, i1] = C[(i + 1) % n].end;
      // A short face between two convex corners: the cuts meet before the wall thickness, so the strip becomes a triangle.
      if ((i1[0] - i0[0]) * e.u[0] + (i1[1] - i0[1]) * e.u[1] < 0) {
        const x = meet({a: o0, b: i0, n: [0, 0]}, 0, {a: o1, b: i1, n: [0, 0]}, 0);
        if (x) {
          out.push({side, quad: poly([o0, o1, x])});
          return;
        }
      }
      out.push({side, quad: poly([o0, o1, i1, i0])});
    });
  }
  return out;
}
// No millimeter-thin slivers: rounding leaves them where strips meet.
const solid = (mp: MultiPolygon): MultiPolygon =>
  mp.filter(([o, ...h]) => {
    const A = Math.abs(area(o.slice(0, -1))) - h.reduce((t, r) => t + Math.abs(area(r.slice(0, -1))), 0);
    let L = 0;
    for (let i = 1; i < o.length; i++) L += Math.hypot(o[i][0] - o[i - 1][0], o[i][1] - o[i - 1][1]);
    return A > 1e-5 && (2 * A) / L > 0.008;
  });

// Walls in cross-section at height h (1.2 m by default, above the windowsill): both doors and windows show in them. For the plan drawing.
export function wallsAt(g: WallPlan, h = 1.2): MultiPolygon {
  const at = (bs: WallBand[]): MultiPolygon[] =>
    bs.filter(b => b.bottom <= h && b.top >= h && b.mp.length).map(b => b.mp);
  const parts = [...at(g.interior), ...g.sides.flatMap(s => at(s.bands))];
  return parts.length ? unionAll(parts) : [];
}
