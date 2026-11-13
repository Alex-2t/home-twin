// @ts-nocheck
// Pure 2D plan geometry: no three.js, runs both in the browser and in node (tests, fuzz).
// Plan: rooms are outlines of [x,y] in meters (x is east, y is north); openings are attached to a room edge.
import {t} from '../i18n/i18n.ts';
import pc from 'polygon-clipping';

export const WALL = {inner: 0.05, outer: 0.25, height: 2.6};
// A railing in place of a wall at a room edge (room.rail[i] = its height): an open balcony, a terrace. The usual height, m.
export const RAIL = 1.1;
// A glass railing (room.railGlass: every railing of that room, D-075): a low kerb along the edge, a pane of glass standing on it.
export const KERB = 0.06;

// ---------- small math ----------
export const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
export function segDist(p, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l2 = dx * dx + dy * dy || 1;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return [Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), t];
}
export const pointIn = ([x, y], ring) => {
  let r = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
};
export const centroid = p => p.reduce((s, v) => [s[0] + v[0] / p.length, s[1] + v[1] / p.length], [0, 0]);
// Where to put a room's label. For an L-shaped room or a room with a protrusion, the vertex average lands in a wall or a shaft,
// so we look for the point inside that is farthest from the edges and from the obstacles in holes (solid parts: shafts, columns):
// the “pole of inaccessibility”, like polylabel. A vertex average that is almost as roomy is kept: in a simple room
// the label stays centered rather than at a random point on the long axis. Precision is 2 cm.
export function labelPoint(p, holes = [], prec = 0.02) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of p) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const c = centroid(p),
    sz = Math.min(x1 - x0, y1 - y0);
  if (!(sz > 0)) return c;
  const sd = (x, y) => {
    const q = [x, y];
    let m = Infinity;
    for (const g of [p, ...holes])
      for (let i = 0, j = g.length - 1; i < g.length; j = i++) m = Math.min(m, segDist(q, g[j], g[i])[0]);
    return pointIn(q, p) && !holes.some(h => pointIn(q, h)) ? m : -m;
  };
  const cell = (x, y, h) => {
    const d = sd(x, y);
    return {x, y, h, d, max: d + h * Math.SQRT2};
  };
  const mid = cell(c[0], c[1], 0);
  let best = mid;
  const q = [];
  for (let x = x0; x < x1; x += sz)
    for (let y = y0; y < y1; y += sz) q.push(cell(x + sz / 2, y + sz / 2, sz / 2));
  for (let n = 0; q.length && n < 4000; n++) {
    let k = 0;
    for (let i = 1; i < q.length; i++) if (q[i].max > q[k].max) k = i;
    const cur = q[k];
    q[k] = q[q.length - 1];
    q.pop();
    if (cur.d > best.d) best = cur;
    if (cur.max - best.d <= prec) continue;
    const h = cur.h / 2;
    q.push(
      cell(cur.x - h, cur.y - h, h),
      cell(cur.x + h, cur.y - h, h),
      cell(cur.x - h, cur.y + h, h),
      cell(cur.x + h, cur.y + h, h),
    );
  }
  return mid.d > 0 && mid.d >= best.d * 0.85 ? c : [best.x, best.y];
}
export const r4 = v => +v.toFixed(4);

export const area = p =>
  p.reduce((s, [x, y], i) => {
    const [u, v] = p[(i + 1) % p.length];
    return s + x * v - u * y;
  }, 0) / 2;
export function offset(poly, d) {
  poly = poly.filter((v, i, a) => {
    const w = a[(i + 1) % a.length];
    return Math.hypot(w[0] - v[0], w[1] - v[1]) > 1e-6;
  });
  const s = area(poly) > 0 ? 1 : -1,
    n = poly.length,
    out = [];
  const nrm = (a, b) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      l = Math.hypot(dx, dy);
    return [(s * dy) / l, (-s * dx) / l];
  };
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n],
      p1 = poly[i],
      p2 = poly[(i + 1) % n];
    const n1 = nrm(p0, p1),
      n2 = nrm(p1, p2);
    const a = [p0[0] + n1[0] * d, p0[1] + n1[1] * d],
      da = [p1[0] - p0[0], p1[1] - p0[1]];
    const b = [p1[0] + n2[0] * d, p1[1] + n2[1] * d],
      db = [p2[0] - p1[0], p2[1] - p1[1]];
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
export function offsetVar(poly, ds) {
  const P = [],
    D = [];
  poly.forEach((v, i) => {
    const w = poly[(i + 1) % poly.length];
    if (Math.hypot(w[0] - v[0], w[1] - v[1]) > 1e-6) {
      P.push(v);
      D.push(ds[i]);
    }
  });
  const s = area(P) > 0 ? 1 : -1,
    n = P.length,
    out = [];
  const nrm = (a, b) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      l = Math.hypot(dx, dy);
    return [(s * dy) / l, (-s * dx) / l];
  };
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n],
      p1 = P[i],
      p2 = P[(i + 1) % n],
      d1 = D[(i - 1 + n) % n],
      d2 = D[i],
      n1 = nrm(p0, p1),
      n2 = nrm(p1, p2);
    const a = [p0[0] + n1[0] * d1, p0[1] + n1[1] * d1],
      da = [p1[0] - p0[0], p1[1] - p0[1]],
      b = [p1[0] + n2[0] * d2, p1[1] + n2[1] * d2],
      db = [p2[0] - p1[0], p2[1] - p1[1]];
    const den = da[0] * db[1] - da[1] * db[0],
      e1 = [p1[0] + n1[0] * d1, p1[1] + n1[1] * d1],
      e2 = [p1[0] + n2[0] * d2, p1[1] + n2[1] * d2];
    if (Math.abs(den) < 1e-9) {
      out.push(e1);
      if (Math.abs(d1 - d2) > 1e-6) out.push(e2);
      continue;
    }
    const t = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / den,
      q = [a[0] + da[0] * t, a[1] + da[1] * t];
    if (Math.hypot(q[0] - p1[0], q[1] - p1[1]) > 4 * Math.max(d1, d2, 0.05)) out.push(e1, e2);
    else out.push(q);
  }
  return out;
}
// Rounding to 1 mm: without it polygon-clipping crashes on nearly coincident points.
let STEP = 1000;
export const snap = v => Math.round(v * STEP) / STEP;
export const poly = p => {
  const q = p
    .map(([x, y]) => [snap(x), snap(y)])
    .filter((v, i, a) => {
      const w = a[(i + 1) % a.length];
      return v[0] !== w[0] || v[1] !== w[1];
    });
  return [[...q, q[0]]];
};
export const rect = (a, b, w) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l = Math.hypot(dx, dy),
    nx = (-dy / l) * w,
    ny = (dx / l) * w;
  return poly([
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ]);
};
const mpArea = mp =>
  mp.reduce(
    (s, [o, ...h]) =>
      s + Math.abs(area(o.slice(0, -1))) - h.reduce((t, r) => t + Math.abs(area(r.slice(0, -1))), 0),
    0,
  );

// ---------- plan validation ----------
function segX(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
// Returns a list of errors {room, text}. An empty list means the plan can be built.
export function validate(rooms) {
  const errs = [];
  for (const r of rooms) {
    const p0 = r.polygon,
      n0 = p0.length;
    if (n0 < 3) {
      errs.push({room: r.id, text: t('has fewer than 3 corners')});
      continue;
    }
    const p = p0.filter((v, i) => {
        const w = p0[(i + 1) % n0];
        return Math.hypot(w[0] - v[0], w[1] - v[1]) > 1e-6;
      }),
      n = p.length;
    if (n < 3) {
      errs.push({room: r.id, text: t('has fewer than 3 corners')});
      continue;
    }
    // a double point (a zero-length edge) is a corner in the making (“Add corner”), not an error
    for (let i = 0; i < n; i++) {
      const a = p[i],
        b = p[(i + 1) % n],
        l = Math.hypot(b[0] - a[0], b[1] - a[1]);
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
export function attachOpening(rooms, o) {
  let best = null;
  for (const r of rooms) {
    const p = r.polygon;
    for (let i = 0; i < p.length; i++) {
      const a = p[i],
        b = p[(i + 1) % p.length],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      const ux = dx / l,
        uy = dy / l;
      const pr = q => [(q[0] - a[0]) * ux + (q[1] - a[1]) * uy, -(q[0] - a[0]) * uy + (q[1] - a[1]) * ux];
      const [s0, d0] = pr(o.a),
        [s1, d1] = pr(o.b);
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
export function openingOut(rooms, o) {
  const r = rooms.find(r => r.id === o.at?.room),
    dx = o.b[0] - o.a[0],
    dy = o.b[1] - o.a[1],
    l = Math.hypot(dx, dy) || 1,
    n = [dy / l, -dx / l],
    k = Math.max(0.12, Math.abs(o.at?.d || 0) + 0.06);
  return r && !pointIn([(o.a[0] + o.b[0]) / 2 - n[0] * k, (o.a[1] + o.b[1]) / 2 - n[1] * k], r.polygon)
    ? [-n[0], -n[1]]
    : n;
}
export function openingCoords(rooms, o) {
  const r = rooms.find(r => r.id === o.at.room);
  if (!r) return null;
  const p = r.polygon,
    a = p[o.at.edge % p.length],
    b = p[(o.at.edge + 1) % p.length];
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l = Math.hypot(dx, dy) || 1,
    ux = dx / l,
    uy = dy / l;
  // If the edge was shortened, the opening shrinks to fit within it.
  const clamp = s => Math.max(0.02, Math.min(l - 0.02, s));
  const pt = s => [a[0] + ux * clamp(s) - uy * o.at.d, a[1] + uy * clamp(s) + ux * o.at.d];
  const s0 = clamp(o.at.s0),
    s1 = clamp(o.at.s1);
  // The edge became shorter than the opening: the opening disappears, and the plan reports it.
  if (Math.abs(s1 - s0) < 0.1) return null;
  return {...o, a: pt(o.at.s0), b: pt(o.at.s1)};
}

// ---------- walls from outlines (as in walls-from-json) ----------
// polygon-clipping occasionally fails to close an outline (about 0.1% of edited plans in fuzz.mjs).
// Then we build again with 2 and 5 mm rounding: there is no visible difference.
// opts.outer is the default exterior wall thickness (m); a room edge can have its own, room.wt[i]: a number is the thickness, 0 means no wall.
export function buildPlan2d(rooms, openings, opts = {}) {
  let err;
  for (const step of [1000, 500, 200]) {
    STEP = step;
    try {
      const g = buildRaw(rooms, openings, opts);
      g.step = step;
      return g;
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
export const edgeThickness = (r, i, outer = OUTER) => (r.wt?.[i] > 0 ? r.wt[i] : outer);
// No wall at the edge: cut out a strip from the room outward, as deep as the gap to the neighbor (or the exterior wall).
function openCut(rooms, r, i, outer) {
  const p = r.polygon,
    a = p[i],
    b = p[(i + 1) % p.length],
    dx = b[0] - a[0],
    dy = b[1] - a[1],
    l = Math.hypot(dx, dy);
  if (l < 0.15) return null;
  const u = [dx / l, dy / l],
    s = area(p) > 0 ? 1 : -1,
    n = [u[1] * s, -u[0] * s],
    e = WALL.inner;
  let gap = null;
  for (const o of rooms) {
    if (o === r) continue;
    const q = o.polygon;
    for (let j = 0; j < q.length; j++) {
      const c = q[j],
        f = q[(j + 1) % q.length],
        fl = Math.hypot(f[0] - c[0], f[1] - c[1]);
      if (fl < 1e-6 || Math.abs(((f[0] - c[0]) * u[0] + (f[1] - c[1]) * u[1]) / fl) < 0.995) continue;
      const off =
        ((c[0] - a[0]) * n[0] + (c[1] - a[1]) * n[1] + (f[0] - a[0]) * n[0] + (f[1] - a[1]) * n[1]) / 2;
      if (off < -0.02 || off > 0.5) continue;
      const s0 = (c[0] - a[0]) * u[0] + (c[1] - a[1]) * u[1],
        s1 = (f[0] - a[0]) * u[0] + (f[1] - a[1]) * u[1];
      if (Math.max(s0, s1) < 0.05 || Math.min(s0, s1) > l - 0.05) continue;
      gap = gap == null ? off : Math.min(gap, off);
    }
  }
  const depth = (gap ?? edgeThickness(r, i, outer) - e) + e + 0.01,
    A = [a[0] + u[0] * e, a[1] + u[1] * e],
    B = [b[0] - u[0] * e, b[1] - u[1] * e];
  return poly([
    [A[0] - n[0] * (e + 0.01), A[1] - n[1] * (e + 0.01)],
    [B[0] - n[0] * (e + 0.01), B[1] - n[1] * (e + 0.01)],
    [B[0] + n[0] * depth, B[1] + n[1] * depth],
    [A[0] + n[0] * depth, A[1] + n[1] * depth],
  ]);
}
// A railing at edge i: the strip from the room's inner face out through the wall. Along the edge it reaches across the corner
// where the next edge has a railing too (the balcony's outer corner), and stops at the inner face of a wall that goes on.
// A, B — its ends on the edge line; n — outward; it spans from `inside` in to `out` out.
function railFrame(r, i, outer) {
  const p = r.polygon,
    N = p.length,
    a = p[i],
    b = p[(i + 1) % N],
    dx = b[0] - a[0],
    dy = b[1] - a[1],
    l = Math.hypot(dx, dy);
  if (l < 0.05) return null;
  const u = [dx / l, dy / l],
    s = area(p) > 0 ? 1 : -1,
    n = [u[1] * s, -u[0] * s],
    e = WALL.inner,
    out = edgeThickness(r, i, outer) - e + 0.01;
  const ext = j => (r.rail?.[j] > 0 ? edgeThickness(r, j, outer) + 0.01 : -e),
    x0 = ext((i - 1 + N) % N),
    x1 = ext((i + 1) % N);
  return {
    A: [a[0] - u[0] * x0, a[1] - u[1] * x0],
    B: [b[0] + u[0] * x1, b[1] + u[1] * x1],
    n,
    inside: e + 0.01,
    out,
  };
}
function railStrip(r, i, outer) {
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
function railPane(r, i, outer, h) {
  const f = railFrame(r, i, outer);
  if (!f) return null;
  const {A, B, n, inside, out} = f,
    c = (out - inside) / 2;
  return {
    a: [A[0] + n[0] * c, A[1] + n[1] * c],
    b: [B[0] + n[0] * c, B[1] + n[1] * c],
    bottom: KERB,
    top: Math.min(h, WALL.height),
  };
}
function buildRaw(rooms, openings, {outer = OUTER} = {}) {
  // room.solid is a shaft, column or boxing: not cut out of the walls, it stays a solid mass at full height
  const insetRooms = rooms.filter(r => !r.solid).map(r => poly(offset(r.polygon, -WALL.inner)));
  const footprint = pc.union(
    ...rooms.map(r =>
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
    .filter(Boolean);
  if (cuts.length) walls = pc.difference(walls, ...cuts);
  // Railings: the wall at those edges becomes a parapet as high as the railing — its own solid, under no facade, never hidden.
  // A glass railing: the wall goes down to a kerb, and a pane stands on it (glassRails; scene.js draws the glass and a handrail).
  const railBy = new Map(),
    glassRails = [];
  for (const r of rooms)
    (r.rail || []).forEach((h, i) => {
      if (!(h > 0)) return;
      const q = railStrip(r, i, outer);
      if (!q) return;
      const k = r.railGlass ? KERB : Math.min(h, WALL.height);
      if (!railBy.has(k)) railBy.set(k, []);
      railBy.get(k).push(q);
      if (r.railGlass) {
        const pane = railPane(r, i, outer, h);
        if (pane) glassRails.push(pane);
      }
    });
  const rails = [];
  if (railBy.size && walls.length) {
    const all = [...railBy.values()].flat();
    for (const [h, qs] of railBy) {
      const mp = solid(pc.intersection(walls, pc.union(...qs)));
      if (mp.length) rails.push({mp, bottom: 0, top: h, last: true});
    }
    walls = pc.difference(walls, ...all);
  }
  // An exterior wall is a strip along the building outline, as thick as the wall. Its side (S, E, N, W) is where its outer face points:
  // 3D hides the side facing the camera. The rest are partitions, always visible.
  const strips = facadeStrips(footprint, rooms),
    taken = [];
  const sides = ['S', 'E', 'N', 'W'].map(id => {
    const zone = strips.filter(s => s.side === id).map(s => s.quad);
    let shape = zone.length && walls.length ? pc.intersection(walls, pc.union(...zone)) : [];
    if (shape.length && taken.length) shape = pc.difference(shape, ...taken);
    shape = solid(shape);
    if (shape.length) taken.push(shape);
    return {id, shape};
  });
  const interior = solid(taken.length && walls.length ? pc.difference(walls, ...taken) : walls);
  // an opening cuts all the way through the wall: its depth is the wall thickness at its edge
  const ops = openings.map(o => {
    const r = rooms.find(r => r.id === o.at?.room);
    return {...o, poly: rect(o.a, o.b, Math.max(0.42, r ? edgeThickness(r, o.at.edge, outer) : 0))};
  });
  // A window's glass is hidden together with the side whose wall holds most of its opening.
  const openingSide = ops.map(o => {
    let best = null,
      most = 1e-4;
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
  const hs = [
    ...new Set([
      0,
      WALL.height,
      ...ops.flatMap(o => [o.bottom, o.top]).filter(h => h > 0 && h < WALL.height),
    ]),
  ].sort((a, b) => a - b);
  // Height bands: each one subtracts the openings that span it.
  const bands = base => {
    const out = [];
    for (let i = 0; i < hs.length - 1; i++) {
      const [a, b] = [hs[i], hs[i + 1]];
      const cut = ops.filter(o => o.bottom <= a + 1e-6 && o.top >= b - 1e-6).map(o => o.poly);
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
  };
}
// Where a face points: the nearest of the four cardinal directions (x is east, y is north).
const sideOf = ([x, y]) => (Math.abs(x) > Math.abs(y) + 1e-9 ? (x > 0 ? 'E' : 'W') : y > 0 ? 'N' : 'S');
// Strips along each face of the building outline: from the face inward by the thickness of the wall behind it (to the nearest room + 1 cm).
// Adjacent strips meet along the corner bisector and butt against each other. A hole inside the outline (a gap between rooms) is not a facade: its walls are always visible.
function facadeStrips(footprint, rooms) {
  const segs = rooms.flatMap(r => r.polygon.map((c, j) => [c, r.polygon[(j + 1) % r.polygon.length]])),
    out = [];
  // The bisector passes exactly through the wall corners, and polygon-clipping breaks on that: shift the joint by a couple of millimeters.
  const SH = 2.5 / STEP,
    add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
  // The intersection of the lines of faces e1 and e2, shifted inward by d1 and d2 (a negative shift is outward).
  const meet = (e1, d1, e2, d2) => {
    const a = add(e1.a, e1.n, -d1),
      da = [e1.b[0] - e1.a[0], e1.b[1] - e1.a[1]],
      b = add(e2.a, e2.n, -d2),
      db = [e2.b[0] - e2.a[0], e2.b[1] - e2.a[1]];
    const den = da[0] * db[1] - da[1] * db[0];
    if (Math.abs(den) < 1e-9 * Math.hypot(...da) * Math.hypot(...db)) return null;
    const t = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / den;
    return [a[0] + da[0] * t, a[1] + da[1] * t];
  };
  for (const [rg] of footprint) {
    const P = rg.slice(0, -1),
      n = P.length;
    if (n < 3) continue;
    const s = Math.sign(area(P)); // counterclockwise: the building is to the left of the traversal, outward is to the right
    const E = P.map((a, i) => {
      const b = P[(i + 1) % n],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        l = Math.hypot(dx, dy) || 1,
        m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
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
      const p = E[(i - 1 + n) % n],
        q = E[(i + 1) % n];
      e.side = sideOf(e.l < 0.06 ? (p.l > q.l ? p.n : q.n) : e.n);
    });
    // The joint at vertex i: an “outside → inward” segment for the end of face i−1 (end) and the start of face i (start).
    const C = E.map((e, i) => {
      const prev = E[(i - 1 + n) % n],
        p = e.a,
        lim = 3 * Math.max(e.D, prev.D, 0.1);
      const o = meet(prev, -0.01, e, -0.01),
        q = meet(prev, prev.D, e, e.D);
      const near = x => x && Math.hypot(x[0] - p[0], x[1] - p[1]) < lim;
      if (near(o) && near(q)) {
        const l = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1,
          v = [-(q[1] - o[1]) / l, (q[0] - o[0]) / l],
          seg = [add(o, v, SH), add(q, v, SH)];
        return {end: seg, start: seg};
      }
      // Faces on one line share a cut across; at a sharp corner each gets its own cut, set back into its own face.
      const cut = (f, k) => [add(add(p, f.n, 0.01), f.u, k), add(add(p, f.n, -f.D), f.u, k)];
      if (!o && !q && prev.u[0] * e.u[0] + prev.u[1] * e.u[1] > 0) {
        const D = Math.max(prev.D, e.D),
          seg = [add(add(p, e.n, 0.01), e.u, SH), add(add(p, e.n, -D), e.u, SH)];
        return {end: seg, start: seg};
      }
      return {end: cut(prev, -SH), start: cut(e, SH)};
    });
    E.forEach((e, i) => {
      const [o0, i0] = C[i].start,
        [o1, i1] = C[(i + 1) % n].end;
      // A short face between two convex corners: the cuts meet before the wall thickness, so the strip becomes a triangle.
      if ((i1[0] - i0[0]) * e.u[0] + (i1[1] - i0[1]) * e.u[1] < 0) {
        const x = meet({a: o0, b: i0, n: [0, 0]}, 0, {a: o1, b: i1, n: [0, 0]}, 0);
        if (x) {
          out.push({side: e.side, quad: poly([o0, o1, x])});
          return;
        }
      }
      out.push({side: e.side, quad: poly([o0, o1, i1, i0])});
    });
  }
  return out;
}
// No millimeter-thin slivers: rounding leaves them where strips meet.
const solid = mp =>
  mp.filter(([o, ...h]) => {
    const A = Math.abs(area(o.slice(0, -1))) - h.reduce((t, r) => t + Math.abs(area(r.slice(0, -1))), 0);
    let L = 0;
    for (let i = 1; i < o.length; i++) L += Math.hypot(o[i][0] - o[i - 1][0], o[i][1] - o[i - 1][1]);
    return A > 1e-5 && (2 * A) / L > 0.008;
  });

// Walls in cross-section at height h (1.2 m by default, above the windowsill): both doors and windows show in them. For the plan drawing.
export function wallsAt(g, h = 1.2) {
  const at = bs => bs.filter(b => b.bottom <= h && b.top >= h && b.mp.length).map(b => b.mp);
  const parts = [...at(g.interior), ...g.sides.flatMap(s => at(s.bands))];
  return parts.length ? pc.union(...parts) : [];
}
