// @ts-nocheck
// Items along walls (run:true in the catalog): a built-in wardrobe, kitchen base and wall cabinets. They follow the inner face of the room's walls from point a to point b
// counterclockwise and can stretch as far as needed: at a corner they turn onto the adjacent wall (L, U, all around the perimeter).
// The front is flat along each wall (the owner): recesses are filled, a column and a riser boxing are cut out of the carcass.
// The plan stores only room, a, b, d, h; the shape is recomputed from the walls every time, so when a wall moves the wardrobe follows it.
// x, y, w of such an item are derived (frame center, length along the walls): shared checks and the plan file read them.
import pc from 'polygon-clipping';
import {area, offsetVar, poly, openingCoords, WALL} from './geometry.ts';
import {roomAt} from './plan.ts';
import {byId, zOf} from './catalog.ts';

export const isRun = f => !!byId(f?.model)?.run;
export const RUN_MIN = 0.4; // any shorter is no longer a cabinet
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const mod = (s, P) => ((s % P) + P) % P;
const r4 = v => +v.toFixed(4);

// The inner face of the room's walls (the outline minus half a partition), counterclockwise: inward is to the left of the direction of travel.
export function faceOf(room) {
  const P = offsetVar(
    room.polygon,
    room.polygon.map(() => -WALL.inner),
  );
  return area(P) < 0 ? [...P].reverse() : P;
}
// The outline as a tape: edges with a start s (m from the first vertex) and the total length P.
export function ring(face) {
  const E = [];
  let s = 0;
  face.forEach((a, i) => {
    const b = face[(i + 1) % face.length],
      l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) return;
    E.push({a, b, l, s, u: [(b[0] - a[0]) / l, (b[1] - a[1]) / l]});
    s += l;
  });
  return {E, P: s};
}
export function ringAt(R, s) {
  s = mod(s, R.P);
  for (const e of R.E)
    if (s <= e.s + e.l + 1e-9) {
      const t = s - e.s;
      return [e.a[0] + e.u[0] * t, e.a[1] + e.u[1] * t];
    }
  return [...R.E[0].a];
}
export function ringProject(R, p) {
  let best = null;
  for (const e of R.E) {
    const t = Math.max(0, Math.min(e.l, dot([p[0] - e.a[0], p[1] - e.a[1]], e.u))),
      q = [e.a[0] + e.u[0] * t, e.a[1] + e.u[1] * t],
      d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (!best || d < best.d) best = {d, s: e.s + t, q};
  }
  return best;
}
// The piece of the outline from sa forward by L: pieces of edges; full is the length of the whole edge (a short edge is a protrusion, not a wall).
function stretch(R, sa, L) {
  const out = [],
    n = R.E.length;
  let left = L,
    s = mod(sa, R.P),
    i = R.E.findIndex(e => s < e.s + e.l - 1e-9);
  if (i < 0) i = 0;
  let t0 = Math.max(0, s - R.E[i].s);
  for (let k = 0; left > 1e-6 && k <= 2 * n; k++) {
    const e = R.E[i],
      len = Math.min(e.l - t0, left);
    if (len > 1e-6)
      out.push({
        a: [e.a[0] + e.u[0] * t0, e.a[1] + e.u[1] * t0],
        b: [e.a[0] + e.u[0] * (t0 + len), e.a[1] + e.u[1] * (t0 + len)],
        u: e.u,
        l: len,
        full: e.l,
        s: e.s + t0,
      });
    left -= len;
    i = (i + 1) % n;
    t0 = 0;
  }
  return out;
}
// The wardrobe's walls: long edges in one direction form one wall; the short ones between them (column, recess, riser) are its relief.
// Short means less than the wardrobe depth with a margin: the wardrobe fills such a recess and goes around such a protrusion with a cutout.
function group(ps, d) {
  const T = Math.max(0.45, d + 0.15),
    S = [];
  let pre = [];
  for (const p of ps) {
    const cur = S[S.length - 1];
    if (p.full >= T) {
      if (!cur || dot(cur.u, p.u) < 0.995) {
        S.push({u: p.u, ps: [...pre, p]});
        pre = [];
      } else cur.ps.push(p);
    } else if (cur) cur.ps.push(p);
    else pre.push(p);
  }
  if (!S.length && pre.length) {
    const m = pre.reduce((a, b) => (b.l > a.l ? b : a));
    S.push({u: m.u, ps: pre});
  }
  return S;
}
// A wardrobe wall in its own axes: u runs along it, n points into the room; ref is the main face (longest in total), out is the
// deepest recess, t0…t1 runs from start to end along u.
function sideOf(sd) {
  const u = sd.u,
    n = [-u[1], u[0]],
    pts = sd.ps.flatMap(p => [p.a, p.b]),
    g = new Map();
  for (const p of sd.ps)
    if (dot(p.u, u) > 0.995) {
      const m = dot(p.a, n),
        k = Math.round(m * 100),
        x = g.get(k) || {l: 0, m: 0};
      x.l += p.l;
      x.m += m * p.l;
      g.set(k, x);
    }
  let ref = dot(pts[0], n),
    best = -1;
  for (const x of g.values())
    if (x.l > best) {
      best = x.l;
      ref = x.m / x.l;
    }
  return {
    u,
    n,
    ref,
    out: Math.min(...pts.map(q => dot(q, n))),
    t0: dot(pts[0], u),
    t1: dot(pts[pts.length - 1], u),
  };
}
const P2 = (u, n, t, m) => [u[0] * t + n[0] * m, u[1] * t + n[1] * m];
// the intersection of the fronts of two adjacent walls (an inner corner of the wardrobe, or an outer one at a protruding room corner)
function meet(A, B, d) {
  const det = A.n[0] * B.n[1] - A.n[1] * B.n[0];
  if (Math.abs(det) < 1e-6) return null;
  const ca = A.ref + d,
    cb = B.ref + d;
  return [(ca * B.n[1] - cb * A.n[1]) / det, (A.n[0] * cb - B.n[0] * ca) / det];
}
// Fronts along the walls at depth d: on adjacent walls, up to the point where the fronts meet; range is how far the strip extends along u.
function frontsOf(S, d) {
  const J = S.slice(0, -1).map((A, i) => meet(A, S[i + 1], d)),
    last = S.length - 1;
  return S.map((s, i) => {
    const jp = i ? J[i - 1] : null,
      jn = i < last ? J[i] : null,
      fs = jp ? dot(jp, s.u) : s.t0,
      fe = jn ? dot(jn, s.u) : s.t1;
    return {
      fs,
      fe,
      front: fe - fs > 0.02 ? [P2(s.u, s.n, fs, s.ref + d), P2(s.u, s.n, fe, s.ref + d)] : null,
      range: [i ? Math.min(s.t0, fs) - 0.002 : s.t0, i < last ? Math.max(s.t1, fe) + 0.002 : s.t1],
    };
  });
}
// The carcass along the walls at depth d: for each wall a strip from the recess to the front, clipped by the room face; strips do not overlap
// each other (the corner goes to the first one).
function bodies(F, S, d) {
  let acc = null;
  return frontsOf(S, d).map((fr, i) => {
    const s = S[i],
      [a, b] = fr.range;
    const band = poly([
      P2(s.u, s.n, a, s.out - 0.02),
      P2(s.u, s.n, b, s.out - 0.02),
      P2(s.u, s.n, b, s.ref + d),
      P2(s.u, s.n, a, s.ref + d),
    ]);
    let body = [];
    try {
      body = pc.intersection(F, band);
      if (acc && body.length) body = pc.difference(body, acc);
      acc = acc ? pc.union(acc, band) : [band];
    } catch {
      body = [];
    }
    return {body, front: fr.front, range: fr.range};
  });
}
// Depth layers for 3D: how much less than d: the wardrobe plinth (5 cm), the wall cabinet carcass (2 cm) and base cabinet carcass (5 cm), the kitchen plinth (9 cm).
const LAYERS = [0.02, 0.05, 0.09];

// A wardrobe on face: from sa forward by L, depth d. sides, per wall: body (the carcass multipolygon), plinth (the plinth
// recessed by 5 cm), front [a,b] is the front, u/n, ry is where it faces (for 3D), quad is the rectangle for the overlap check.
export function runShape(face, sa, L, d) {
  const R = ring(face);
  if (R.P < 0.5) return null;
  L = Math.max(0.05, Math.min(L, R.P - 0.05));
  const ps = stretch(R, sa, L);
  if (!ps.length) return null;
  const S = group(ps, d).map(sideOf),
    F = poly(face),
    B = bodies(F, S, d),
    Ls = Object.fromEntries(LAYERS.map(k => [k, bodies(F, S, Math.max(0.05, d - k))]));
  const sides = S.map((s, i) => {
    const [a, b] = B[i].range,
      k = 0.01;
    return {
      u: s.u,
      n: s.n,
      ref: s.ref,
      ry: Math.atan2(s.n[0], -s.n[1]),
      body: B[i].body,
      front: B[i].front,
      plinth: Ls[0.05][i].body,
      layer: Object.fromEntries(LAYERS.map(x => [x, {body: Ls[x][i].body, front: Ls[x][i].front}])),
      quad: [
        P2(s.u, s.n, a + k, s.ref + k),
        P2(s.u, s.n, b - k, s.ref + k),
        P2(s.u, s.n, b - k, s.ref + d - k),
        P2(s.u, s.n, a + k, s.ref + d - k),
      ],
      box: [
        P2(s.u, s.n, a, s.ref),
        P2(s.u, s.n, b, s.ref),
        P2(s.u, s.n, b, s.ref + d),
        P2(s.u, s.n, a, s.ref + d),
      ],
    };
  }); // quad is shrunk by 1 cm for the overlap check; box is exact, for snapping neighbors
  let outline = [];
  try {
    const all = sides.filter(s => s.body.length).map(s => s.body);
    outline = all.length ? pc.union(...all) : [];
  } catch {
    outline = sides.flatMap(s => s.body);
  }
  const len = S.reduce((t, s) => t + Math.max(0, s.t1 - s.t0), 0),
    fr = sides.filter(s => s.front);
  // handles: the ends are at the middle of the end panels, the depth is at the middle of the longest front
  const end = (s, q) => [q[0] - (s.n[0] * d) / 2, q[1] - (s.n[1] * d) / 2],
    flen = s => Math.hypot(s.front[1][0] - s.front[0][0], s.front[1][1] - s.front[0][1]);
  const ds = fr.length ? fr.reduce((a, b) => (flen(b) > flen(a) ? b : a)) : null;
  const handles = fr.length
    ? {
        a: end(fr[0], fr[0].front[0]),
        b: end(fr[fr.length - 1], fr[fr.length - 1].front[1]),
        d: {
          p: [(ds.front[0][0] + ds.front[1][0]) / 2, (ds.front[0][1] + ds.front[1][1]) / 2],
          u: ds.u,
          n: ds.n,
          ref: dot(ds.front[0], ds.n) - d,
        },
      }
    : null;
  return {sides, outline, len, handles, R, S};
}
// Lines along the fronts at depth dd from the wall (light strips under the fronts and under wall cabinets), the ends are set back by e.
export function runLines(g, dd, e = 0.02) {
  const fr = frontsOf(g.S, dd),
    last = fr.length - 1;
  return fr
    .map(
      (x, i) =>
        x.front &&
        [
          [x.front[0], i ? 0 : e],
          [x.front[1], i < last ? 0 : e],
        ].map(([q, k], j) => {
          const s = g.S[i],
            t = j ? -k : k;
          return [q[0] + s.u[0] * t, q[1] + s.u[1] * t];
        }),
    )
    .filter(Boolean);
}

// The wardrobe's room: its own, or if that is gone (split, merged), the one whose face is closest to the wardrobe's start.
export function runRoom(plan, f) {
  const own = plan.rooms.find(r => r.id === f.room);
  if (own) return own;
  let best = null;
  for (const r of plan.rooms) {
    const pr = ringProject(ring(faceOf(r)), f.a);
    if (pr && (!best || pr.d < best.d)) best = {d: pr.d, r};
  }
  return best?.r || null;
}
const cache = new WeakMap();
export function runGeo(plan, f) {
  if (f && (!f.a || !f.b)) fromRect(plan, f);
  const r = f?.a && f?.b && runRoom(plan, f);
  if (!r) return null;
  const key = JSON.stringify([r.polygon, f.a, f.b, f.d]),
    c = cache.get(f);
  if (c?.key === key) return c.geo;
  const face = faceOf(r),
    R = ring(face),
    sa = ringProject(R, f.a).s,
    L = mod(ringProject(R, f.b).s - sa, R.P);
  const geo = L > 0.01 ? runShape(face, sa, L, f.d) : null;
  if (geo) Object.assign(geo, {key, room: r, sa, L});
  cache.set(f, {key, geo});
  return geo;
}
// An old straight item (base and wall cabinets used to be a rectangle x, y, w, rot): the ends come from its back side.
function fromRect(plan, f) {
  if (![f.x, f.y, f.w, f.d].every(Number.isFinite)) return;
  const t = ((f.rot || 0) * Math.PI) / 180,
    ax = [Math.cos(t), Math.sin(t)],
    fz = [Math.sin(t), -Math.cos(t)];
  const bk = [f.x - (fz[0] * f.d) / 2, f.y - (fz[1] * f.d) / 2],
    p0 = [bk[0] - (ax[0] * f.w) / 2, bk[1] - (ax[1] * f.w) / 2],
    p1 = [bk[0] + (ax[0] * f.w) / 2, bk[1] + (ax[1] * f.w) / 2];
  let room = roomAt(plan, [f.x, f.y]),
    best = null;
  for (const r of room ? [room] : plan.rooms) {
    const R = ring(faceOf(r)),
      q = ringProject(R, bk);
    if (q && (!best || q.d < best.d)) best = {d: q.d, r, R};
  }
  if (!best) return;
  const {r, R} = best,
    s0 = ringProject(R, p0).s,
    s1 = ringProject(R, p1).s,
    fw = mod(s1 - s0, R.P),
    [a, b] = Math.abs(fw - f.w) <= Math.abs(R.P - fw - f.w) ? [p0, p1] : [p1, p0];
  f.room = r.id;
  f.a = ringAt(R, ringProject(R, a).s).map(r4);
  f.b = ringAt(R, ringProject(R, b).s).map(r4);
}
// Derived fields (frame center, length along the walls) and the room, after any plan edit.
export function syncRun(plan, f) {
  const g = runGeo(plan, f);
  if (!g) return;
  const xs = [],
    ys = [];
  for (const P of g.outline)
    for (const q of P[0]) {
      xs.push(q[0]);
      ys.push(q[1]);
    }
  if (xs.length) {
    f.x = r4((Math.min(...xs) + Math.max(...xs)) / 2);
    f.y = r4((Math.min(...ys) + Math.max(...ys)) / 2);
  }
  f.w = +g.len.toFixed(3);
  f.rot = 0;
  if (f.room !== g.room.id) f.room = g.room.id;
}
export const syncRuns = plan => {
  for (const f of plan.furniture) if (isRun(f)) syncRun(plan, f);
};
// Place a wardrobe: the room, a start sa and a length L along the outline of its face.
export function runSet(plan, f, room, R, sa, L) {
  L = Math.max(RUN_MIN, Math.min(R.P - 0.05, L));
  f.room = room.id;
  f.a = ringAt(R, sa).map(r4);
  f.b = ringAt(R, sa + L).map(r4);
  syncRun(plan, f);
}

// Where the corners (wall starts) and openings are on the room face: the wardrobe ends snap to them.
export function runStops(plan, room, R, d = 0.6) {
  const out = [];
  // walls around the whole outline, starting from the wall right after a turn: otherwise the first and last would be one wall split in two
  const long = R.E.map(e => e.l >= Math.max(0.45, d + 0.15)),
    k0 = Math.max(
      0,
      R.E.findIndex((e, i) => {
        if (!long[i]) return false;
        for (let j = 1; j < R.E.length; j++) {
          const q = (i - j + R.E.length) % R.E.length;
          if (long[q]) return dot(R.E[q].u, e.u) < 0.995;
        }
        return false;
      }),
    );
  const corners = group(stretch(R, R.E[k0]?.s || 0, R.P), d).map(sd => sd.ps[0].s);
  const gaps = [];
  for (const o of plan.openings || []) {
    const c = openingCoords(plan.rooms, o);
    if (!c) continue;
    const pa = ringProject(R, c.a),
      pb = ringProject(R, c.b);
    if (pa.d > 0.45 || pb.d > 0.45) continue;
    let s0 = pa.s,
      s1 = pb.s;
    if (mod(s1 - s0, R.P) > R.P / 2) [s0, s1] = [s1, s0];
    gaps.push([
      s0,
      s0 + mod(s1 - s0, R.P),
      o.kind,
      o.bottom ?? (o.kind === 'door' ? 0 : 0.85),
      o.top ?? (o.kind === 'door' ? 2.1 : 2.4),
    ]);
  }
  out.push(...corners);
  for (const [a, b] of gaps) out.push(mod(a, R.P), mod(b, R.P));
  return {corners, gaps, stops: out};
}
// A new wardrobe at point p: along the whole free wall under the cursor, corner to corner, up to a door or window (the owner: “a wall-to-wall
// wardrobe”). Too little free space: the catalog width, centered. Farther than 1.2 m from the walls: nowhere to put it.
export function runAt(plan, p, w, d, {z0 = 0, z1 = 3, self = null} = {}) {
  let room = roomAt(plan, p),
    R = room && ring(faceOf(room)),
    pr = R && ringProject(R, p);
  if (!room) {
    for (const r of plan.rooms) {
      const Rr = ring(faceOf(r)),
        q = ringProject(Rr, p);
      if (q && (!pr || q.d < pr.d)) {
        room = r;
        R = Rr;
        pr = q;
      }
    }
  }
  if (!room || !pr || pr.d > 1.2 || R.P < 1) return null;
  const st = runStops(plan, room, R, d),
    corners = st.corners,
    gaps = st.gaps.filter(([, , k, b, t]) => k === 'door' || (b < z1 - 0.01 && t > z0 + 0.01));
  // furniture along this wall at the same height (fridge, tall cabinet, range hood) is a boundary too: the cabinet stops at it
  for (const g of plan.furniture || []) {
    if (g === self || byId(g.model)?.soft) continue;
    if (isRun(g) ? g.room !== room.id : roomAt(plan, [g.x, g.y]) !== room) continue; // furniture behind the wall, in the neighboring room, is no obstacle
    const gz = zOf(g);
    if (gz >= z1 - 0.01 || gz + g.h <= z0 + 0.01) continue;
    const cs = isRun(g)
      ? (runGeo(plan, g)?.sides || []).flatMap(x => x.quad)
      : [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([i, j]) => {
          const t = ((g.rot || 0) * Math.PI) / 180;
          return [
            g.x + ((Math.cos(t) * g.w) / 2) * i + ((Math.sin(t) * g.d) / 2) * j,
            g.y + ((Math.sin(t) * g.w) / 2) * i - ((Math.cos(t) * g.d) / 2) * j,
          ];
        });
    const ss = cs
      .map(q => ringProject(R, q))
      .filter(q => q.d < d + 0.05)
      .map(q => q.s);
    if (ss.length < 2) continue;
    const base = ss[0],
      rel = ss.map(x => {
        const v = mod(x - base, R.P);
        return v > R.P / 2 ? v - R.P : v;
      });
    gaps.push([base + Math.min(...rel), base + Math.max(...rel), 'furn']);
  }
  // the stretch at s: from the corner behind to the corner ahead, shortened by the nearest openings; on an opening, the opening itself (gap)
  const span = s => {
    const rel = x => mod(x - s, R.P);
    let lo = -R.P,
      hi = R.P;
    for (const c of corners) {
      const f = rel(c);
      if (f < 1e-6) {
        lo = Math.max(lo, 0);
        continue;
      }
      hi = Math.min(hi, f);
      lo = Math.max(lo, f - R.P);
    }
    if (hi - lo > R.P - 0.05) hi = lo + R.P - 0.05;
    for (const [a, b] of gaps) {
      const ra = rel(a),
        end = ra + (b - a);
      if (ra < 1e-6 || end >= R.P)
        return {gap: [s + (ra < 1e-6 ? 0 : ra - R.P), s + (ra < 1e-6 ? 0 : ra - R.P) + (b - a)]};
      hi = Math.min(hi, ra - 0.02);
      lo = Math.max(lo, end - R.P + 0.02);
    }
    return {sa: s + lo, L: hi - lo};
  };
  // dropped onto a window or door: the cabinet goes next to it, on the larger of the free stretches on either side
  let r = span(pr.s);
  if (r.gap)
    r =
      [r.gap[0] - 0.05, r.gap[1] + 0.05]
        .map(span)
        .filter(x => !x.gap)
        .sort((a, b) => b.L - a.L)[0] || r;
  if (r.gap || r.L < 0.6) {
    const L = Math.min(w, R.P - 0.05);
    r = {sa: pr.s - L / 2, L};
  }
  return {room, R, sa: r.sa, L: r.L};
}
