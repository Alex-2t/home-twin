// The catalog car (D-062): a fastback electric sedan and a large luxury SUV.
// Glazing, panel lines, recessed lights and machined wheels stay readable from the home overview; furniture3d.js batches details by material.
// The body is one smooth lofted surface, not boxes: sections along the length, each a superellipse sized by the side profile
// (the top: nose, hood, beltline, deck; the bottom: sills, bumpers) and the plan (rounded nose and tail); the wheel arches are cut
// out of it. The glass house is a second loft set in from the shoulders, narrowing upwards. Lights, the grille, seams and handles
// are thin patches lying on the body's surface. Sizes come from the item: everything is laid out in shares of its length and height.
import * as THREE from 'three';
import {CAR_COLORS, hexOf} from './catalog.js';

// y(x) through points [[x,y],…] with x ascending: a monotone cubic, so a profile never overshoots between its points
function curve(P) {
  const n = P.length,
    h = [],
    s = [],
    m = [];
  for (let i = 0; i < n - 1; i++) {
    h[i] = P[i + 1][0] - P[i][0];
    s[i] = (P[i + 1][1] - P[i][1]) / h[i];
  }
  m[0] = s[0];
  m[n - 1] = s[n - 2];
  for (let i = 1; i < n - 1; i++)
    m[i] =
      s[i - 1] * s[i] <= 0
        ? 0
        : (3 * (h[i - 1] + h[i])) / ((2 * h[i] + h[i - 1]) / s[i - 1] + (h[i] + 2 * h[i - 1]) / s[i]);
  return x => {
    if (x <= P[0][0]) return P[0][1];
    if (x >= P[n - 1][0]) return P[n - 1][1];
    let i = 0;
    while (x > P[i + 1][0]) i++;
    const t = (x - P[i][0]) / h[i],
      t2 = t * t,
      t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * P[i][1] +
      (t3 - 2 * t2 + t) * h[i] * m[i] +
      (3 * t2 - 2 * t3) * P[i + 1][1] +
      (t3 - t2) * h[i] * m[i + 1]
    );
  };
}

// Profiles: u along the length (−1 the tail, 1 the nose), y in meters for the reference height H (scaled to the item's height).
// top/bot — the body's top and bottom on the center line; glass — the glass house's top; wheels at uf/ur, radius R, arch gap;
// the plan rounds the last af/ar meters of the nose/tail with exponent pf/pr (2 — round, 4 — squarish);
// NT/NB — how square the section is above/below its middle; inset — the glass house's foot in from the shoulder, tum — how much
// it narrows to the roof, GT — how flat the roof is.
const SPEC = {
  sedan: {
    H: 1.44,
    L: 4.7,
    uf: 0.62,
    ur: -0.6,
    R: 0.355,
    gap: 0.045,
    tw: 0.245,
    af: 0.46,
    pf: 2.2,
    ar: 0.34,
    pr: 3,
    NT: 3.8,
    NB: 5,
    inset: 0.1,
    tum: 0.22,
    GT: 5,
    fend: 0.016,
    top: [
      [-1, 0.8],
      [-0.99, 0.9],
      [-0.965, 0.96],
      [-0.92, 0.99],
      [-0.8, 1],
      [-0.55, 0.985],
      [-0.2, 0.965],
      [0.2, 0.945],
      [0.44, 0.905],
      [0.56, 0.85],
      [0.72, 0.775],
      [0.85, 0.72],
      [0.93, 0.68],
      [0.975, 0.63],
      [1, 0.55],
    ],
    bot: [
      [-1, 0.5],
      [-0.99, 0.4],
      [-0.96, 0.3],
      [-0.9, 0.2],
      [-0.82, 0.15],
      [0.8, 0.15],
      [0.9, 0.19],
      [0.96, 0.25],
      [0.99, 0.31],
      [1, 0.36],
    ],
    glass: [
      [0.45, 0.87],
      [0.36, 1.035],
      [0.26, 1.2],
      [0.14, 1.345],
      [0.02, 1.425],
      [-0.12, 1.44],
      [-0.3, 1.43],
      [-0.48, 1.34],
      [-0.63, 1.2],
      [-0.75, 1.07],
      [-0.83, 0.985],
    ],
  },
  suv: {
    H: 1.8,
    L: 4.9,
    uf: 0.62,
    ur: -0.6,
    R: 0.415,
    gap: 0.055,
    tw: 0.275,
    af: 0.22,
    pf: 3.2,
    ar: 0.22,
    pr: 4,
    NT: 5,
    NB: 6,
    inset: 0.07,
    tum: 0.1,
    GT: 6,
    fend: 0.012,
    roof: true,
    top: [
      [-1, 1],
      [-0.99, 1.1],
      [-0.97, 1.16],
      [-0.93, 1.19],
      [-0.85, 1.2],
      [-0.4, 1.195],
      [0.1, 1.185],
      [0.36, 1.17],
      [0.42, 1.14],
      [0.6, 1.11],
      [0.85, 1.095],
      [0.95, 1.08],
      [0.985, 1.05],
      [1, 0.98],
    ],
    bot: [
      [-1, 0.56],
      [-0.985, 0.46],
      [-0.95, 0.34],
      [-0.88, 0.25],
      [-0.8, 0.23],
      [0.8, 0.23],
      [0.9, 0.28],
      [0.96, 0.34],
      [0.99, 0.42],
      [1, 0.48],
    ],
    glass: [
      [0.4, 1.13],
      [0.33, 1.32],
      [0.26, 1.5],
      [0.2, 1.64],
      [0.14, 1.72],
      [0.04, 1.76],
      [-0.6, 1.75],
      [-0.84, 1.735],
      [-0.885, 1.68],
      [-0.915, 1.52],
      [-0.94, 1.34],
      [-0.955, 1.18],
    ],
  },
};

const M = new Map(),
  once = (k, f) => {
    if (!M.has(k)) M.set(k, f());
    return M.get(k);
  };
const std = (c, r, m = 0) =>
  once(`s${c}:${r}:${m}`, () => new THREE.MeshStandardMaterial({color: c, roughness: r, metalness: m}));
// car paint: metallic under a clear coat
const paint = c =>
  once(
    'p' + c,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: c,
        metalness: 0.42,
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.075,
        envMapIntensity: 1.4,
      }),
  );
const paintF = c =>
  once('pf' + c, () => {
    const m = paint(c).clone();
    Object.assign(m, {
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
    });
    return m;
  });
// patches lie a few millimeters off the body: pulled in front of it in depth so they never flicker
const flat = (c, r, m = 0, e = 0) =>
  once(
    `f${c}:${r}:${m}:${e}`,
    () =>
      new THREE.MeshStandardMaterial({
        color: c,
        roughness: r,
        metalness: m,
        emissive: e ? c : 0,
        emissiveIntensity: e,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
      }),
  );
const se = (t, n) => Math.sign(t) * Math.pow(Math.abs(t), 2 / n);

export function car(g, {w, d, h, color, v}) {
  const S = SPEC[v] || SPEC.sedan,
    L = d,
    hl = L / 2,
    sh = h / S.H,
    sl = L / S.L,
    c = CAR_COLORS[color]?.[1] ?? hexOf(color, CAR_COLORS.navy[1]);
  const prof = P => curve(P.map(([u, y]) => [u * hl, y * sh]).sort((a, b) => a[0] - b[0])),
    top = prof(S.top),
    bot = prof(S.bot),
    gtop = prof(S.glass);
  const R = Math.min(S.R * sh, h * 0.25),
    Ra = R + S.gap * sh,
    tw = (S.tw * w) / (v === 'suv' ? 1.98 : 1.85),
    zf = S.uf * hl,
    zr = S.ur * hl,
    af = S.af * sl,
    ar = S.ar * sl,
    W = w / 2;
  const add = (geo, m, cast = true) => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = cast;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  // plan: a little wider over the wheels (haunches); the last meters round into the nose and the tail
  const wide = z =>
    W * (0.972 + 0.028 * Math.max(Math.exp(-(((z - zf) / 0.75) ** 2)), Math.exp(-(((z - zr) / 0.75) ** 2))));
  const end = (t, p) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, t), p)), 1 / p);
  const hwAt = z => {
    const df = z - (hl - af),
      dr = -hl + ar - z;
    return wide(z) * (df > 0 ? end(df / af, S.pf) : dr > 0 ? end(dr / ar, S.pr) : 1);
  };
  const arch = z => {
    let y = -1;
    for (const zw of [zf, zr]) {
      const dz = Math.abs(z - zw);
      if (dz < Ra) y = Math.max(y, R - 0.03 + Math.sqrt(Ra * Ra - dz * dz));
    }
    return y;
  };
  // a body point: e — height in the section (−1 the bottom, 1 the top), ex — how far out (1 the widest), s — the side;
  // the sides lean in a touch at the shoulder and tuck under at the sill
  // over the front wheels the fenders stand above the hood, which dips between them
  const gF = Math.max(...S.glass.map(p => p[0])) * hl,
    fend = z =>
      S.fend * sh * Math.exp(-(((z - zf) / 0.7) ** 2)) * (z < gF ? Math.exp(-(((z - gF) / 0.2) ** 2)) : 1);
  const body = (z, e, ex, s) => {
    const y0 = bot(z),
      y1 = top(z),
      f =
        e > 0.2
          ? fend(z) *
            Math.min(1, (e - 0.2) / 0.6) *
            (Math.exp(-(((ex - 0.8) / 0.2) ** 2)) - 0.5 * Math.exp(-((ex / 0.42) ** 2)))
          : 0;
    return [
      s * hwAt(z) * ex * (1 - 0.035 * Math.max(0, e) ** 3 - 0.06 * (Math.max(0, -e - 0.5) / 0.5) ** 2),
      (y0 + y1) / 2 + ((y1 - y0) / 2) * e + f,
    ];
  };
  const bodyE = (z, e, s) => {
    const n = e >= 0 ? S.NT : S.NB,
      t = Math.sign(e) * Math.abs(e) ** (n / 2);
    return body(z, e, Math.pow(Math.max(0, 1 - t * t), 1 / n), s);
  };
  const ring = (z, N, f, NT, NB) => {
    const out = [];
    for (let i = 0; i < N; i++) {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / N,
        co = Math.cos(a),
        si = Math.sin(a),
        n = si >= 0 ? NT : NB;
      out.push(f(z, se(si, n), Math.pow(Math.abs(co), 2 / n), co >= 0 ? 1 : -1));
    }
    return out;
  };

  // stations: dense where the nose and the tail round off, every 3 cm between, and on the edges of the arches
  const zs = [];
  for (let i = 0; i <= 18; i++) {
    const p = ((i / 18) * Math.PI) / 2;
    zs.push(-hl + ar - ar * Math.pow(Math.cos(p), 2 / S.pr), hl - af + af * Math.pow(Math.cos(p), 2 / S.pf));
  }
  for (let z = -hl + ar; z < hl - af; z += 0.03) zs.push(z);
  for (const zw of [zf, zr]) zs.push(zw - Ra - 0.002, zw - Ra + 0.002, zw + Ra - 0.002, zw + Ra + 0.002);
  zs.sort((a, b) => a - b);
  const Z = zs.filter((z, i) => !i || z - zs[i - 1] > 1e-4);

  // the body, the arches cut out of it (the section is clipped where the arch is: the sides stay as they are)
  add(
    loft(Z, z => ring(z, 64, body, S.NT, S.NB), arch),
    paint(c),
  );
  // the glass house: its foot inside the body, in from the shoulders, narrowing to the roof
  const gu = S.glass.map(p => p[0] * hl),
    ga = Math.min(...gu),
    gb = Math.max(...gu),
    GZ = [ga, ...Z.filter(z => z > ga + 1e-4 && z < gb - 1e-4), gb];
  const hwG = z => Math.min(hwAt(z), W * 0.972) - S.inset;
  const house = (z, e, ex, s) => {
    const y0 = top(z) - 0.17,
      y1 = gtop(z),
      f = (e + 1) / 2;
    return [s * hwG(z) * ex * (1 - S.tum * f), (y0 + y1) / 2 + ((y1 - y0) / 2) * e];
  };
  const glassM = once(
    'glass',
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0x18252e,
        metalness: 0.22,
        roughness: 0.16,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.4,
      }),
  );
  add(
    loft(GZ, z => ring(z, 48, house, S.GT, 8)),
    glassM,
  );
  const black = std(0x141518, 0.35, 0.2),
    trim = flat(0x111214, 0.45),
    chrome = flat(0xc9ccd0, 0.18, 0.9);
  // wheels in the arches, the arch liners dark
  for (const zw of [zf, zr]) {
    const lg = new THREE.CylinderGeometry(Ra - 0.012, Ra - 0.012, 2 * W - 0.08, 32, 1, true, 0, Math.PI);
    lg.rotateZ(Math.PI / 2);
    lg.translate(0, R - 0.03, zw);
    add(
      lg,
      once(
        'liner',
        () => new THREE.MeshStandardMaterial({color: 0x101113, roughness: 0.9, side: THREE.DoubleSide}),
      ),
      false,
    );
    for (const s of [-1, 1]) wheel(g, s * (W - 0.03 - tw / 2), R, zw, s, R, tw, v === 'suv');
  }

  // a patch lying on a surface (lights, the grille, pillars, seams): stations z0…z1 (on the body: through the nose or the tail when it
  // reaches the tip), section heights e0…e1 (numbers or functions of z), dd off the surface. F.pt(z,e,s) — the surface, F.mid(z) — its axis
  // A surface is walked by the angle round its section (as the loft is built), so the points spread evenly even where a flat roof
  // turns sharply into its sides; heights e are turned into that angle. F.at(z,θ,s) — the surface, F.mid(z) — its axis.
  const exOf = (e, NT, NB) => {
    const n = e >= 0 ? NT : NB,
      t = Math.sign(e) * Math.abs(e) ** (n / 2);
    return Math.pow(Math.max(0, 1 - t * t), 1 / n);
  };
  const surf = (f, NT, NB) => ({
    th: e => Math.asin(Math.sign(e) * Math.abs(e) ** ((e >= 0 ? NT : NB) / 2)),
    at: (z, a, s) => {
      const si = Math.sin(a),
        n = si >= 0 ? NT : NB;
      return f(z, se(si, n), Math.pow(Math.abs(Math.cos(a)), 2 / n), s);
    },
  });
  const onBody = {
    zs: Z,
    lo: -hl,
    hi: hl,
    wrap: true,
    ...surf(body, S.NT, S.NB),
    mid: z => (top(z) + bot(z)) / 2,
  };
  const onGlass = {zs: GZ, lo: ga, hi: gb, ...surf(house, S.GT, 8), mid: z => (top(z) - 0.17 + gtop(z)) / 2};
  const patchOn = (F, z0, z1, e0, e1, m, dd = 0.003) => {
    const cl = z => Math.max(F.lo, Math.min(F.hi, z)),
      A0 = z => F.th(typeof e0 === 'function' ? e0(z) : e0),
      A1 = z => F.th(typeof e1 === 'function' ? e1(z) : e1);
    const P = (z, a, s) => {
      z = cl(z);
      const [x, y] = F.at(z, Math.max(-Math.PI / 2, Math.min(Math.PI / 2, a)), s);
      return new THREE.Vector3(x, y, z);
    };
    const off = (z, a, s) => {
      const p = P(z, a, s),
        u = P(z + 0.002, a, s).sub(P(z - 0.002, a, s)),
        w = P(z, a + 0.01, s).sub(P(z, a - 0.01, s)),
        n = u.cross(w).normalize();
      if (n.dot(p.clone().sub(new THREE.Vector3(0, F.mid(cl(z)), 0))) < 0) n.negate();
      return p.addScaledVector(n, dd);
    };
    const cols = F.zs.filter(z => z > z0 + 1e-4 && z < z1 - 1e-4);
    cols.unshift(z0);
    cols.push(z1);
    const E = Math.max(2, Math.ceil(Math.max(...cols.map(z => A1(z) - A0(z))) / 0.04));
    const strip = list => {
      const pos = [],
        idx = [];
      for (const [z, s] of list) {
        const a = A0(z),
          b = A1(z);
        for (let j = 0; j <= E; j++) {
          const p = off(z, a + ((b - a) * j) / E, s);
          pos.push(p.x, p.y, p.z);
        }
      }
      for (let i = 0; i < list.length - 1; i++)
        for (let j = 0; j < E; j++) {
          const q = i * (E + 1) + j;
          idx.push(q, q + E + 1, q + 1, q + 1, q + E + 1, q + E + 2);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      add(geo, m, false);
    };
    if (F.wrap && z1 >= hl - 1e-6)
      strip([
        ...cols.map(z => [z, -1]),
        ...cols
          .slice(0, -1)
          .reverse()
          .map(z => [z, 1]),
      ]);
    else if (F.wrap && z0 <= -hl + 1e-6)
      strip([
        ...cols
          .slice()
          .reverse()
          .map(z => [z, -1]),
        ...cols.slice(1).map(z => [z, 1]),
      ]);
    else for (const s of [-1, 1]) strip(cols.map(z => [z, s]));
  };
  const patch = (...a) => patchOn(onBody, ...a);
  // a height on the body as a section height at each station: bands that run level across a bumper instead of following its curve
  const at = y => z => Math.max(-1, Math.min(1, (2 * y * sh - bot(z) - top(z)) / (top(z) - bot(z))));
  // where the side glass comes out of the body: the window line
  const half = (z, y) => {
    const y0 = bot(z),
      y1 = top(z),
      e = (2 * y - y0 - y1) / (y1 - y0);
    return e >= 1 ? 0 : body(z, e, exOf(e, S.NT, S.NB), 1)[0];
  };
  const beltE = z => {
    for (let e = -1; e < 1; e += 0.01) {
      const [x, y] = house(z, e, exOf(e, S.GT, 8), 1);
      if (x > half(z, y) + 0.002) return e;
    }
    return 1;
  };
  const white = flat(0xe3efff, 0.25, 0, 0.65),
    red = flat(0xb51b20, 0.25, 0, 0.65),
    grille = flat(0x1a1b1e, 0.5, 0.4);
  const zA = zf - Ra * 0.82,
    zB = zr + Ra * 0.75,
    doorMid = -0.06 * hl; // door edges belong BETWEEN the wheel arches
  // a chrome line along the foot of the side windows
  patchOn(onGlass, ga + 0.25 * sl, gb - 0.22 * sl, beltE, z => Math.min(1, beltE(z) + 0.04), chrome, 0.002);
  // Deliberate panel breaks keep the window shapes legible even at the floor-plan's scale.
  const pillar = flat(0x10171b, 0.26, 0.2),
    seal = flat(0x151a1e, 0.6),
    sill = flat(0x282d32, 0.55, 0.15);
  patchOn(
    onGlass,
    doorMid - 0.045 * sl,
    doorMid + 0.045 * sl,
    beltE,
    v === 'suv' ? 0.79 : 0.655,
    pillar,
    0.006,
  );
  patchOn(
    onGlass,
    ga + 0.21 * sl,
    gb - 0.12 * sl,
    z => Math.max(-1, beltE(z) - 0.015),
    z => Math.min(1, beltE(z) + 0.018),
    seal,
    0.004,
  );
  if (v === 'suv')
    patchOn(onGlass, -0.59 * hl - 0.035 * sl, -0.59 * hl + 0.035 * sl, beltE, 0.79, pillar, 0.006);
  // Rocker panels and seams which stop clear of the wheel openings.
  patch(zB - 0.08 * sl, zA + 0.08 * sl, -0.86, -0.64, sill, 0.003);
  patch(zB, zA, -0.86, -0.82, chrome, 0.005);
  for (const z of [zA, doorMid, zB]) patch(z, z + 0.004 * sl, -0.64, 0.88, seal, 0.002);
  for (const z of [doorMid + 0.13 * sl, zB + 0.13 * sl]) {
    patch(z, z + 0.145 * sl, 0.62, 0.69, pillar, 0.003);
    patch(z + 0.012 * sl, z + 0.135 * sl, 0.645, 0.675, chrome, 0.005);
  }
  // Tight strips follow the fenders instead of oversized black rings around the wheels.
  for (const zw of [zf, zr])
    for (const side of [-1, 1]) {
      const points = [];
      for (let i = 0; i <= 48; i++) {
        const a = 0.1 + ((Math.PI - 0.2) * i) / 48,
          z = zw + Ra * Math.cos(a),
          y = R - 0.03 + Ra * Math.sin(a);
        const e = Math.max(-0.99, Math.min(0.99, (2 * y - bot(z) - top(z)) / (top(z) - bot(z))));
        const [x] = bodyE(z, e, side);
        points.push(new THREE.Vector3(x + side * 0.003, y, z));
      }
      add(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, v === 'suv' ? 0.014 : 0.009, 5, false),
        v === 'suv' ? black : paint(c),
        false,
      );
    }
  if (v === 'suv') {
    // the roof in body color over dark pillars: it seems to float; a fin at the back
    const r0 = 0.15 * hl,
      r1 = -0.885 * hl;
    patchOn(onGlass, r1, r0, 0.84, 1, paintF(c), 0.003);
    patchOn(onGlass, ga + 0.25 * sl, r0 - 0.05, 0.8, 0.82, chrome, 0.002);
    patchOn(
      onGlass,
      -0.62 * hl,
      0.08 * hl,
      0.992,
      1,
      once('roofGlass', () => {
        const m = glassM.clone();
        Object.assign(m, {
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -8,
        });
        return m;
      }),
      0.01,
    );
    patchOn(onGlass, -0.88 * hl, -0.78 * hl, 0.84, 1, paintF(c), 0.012 * sh);
    const fin = new THREE.SphereGeometry(1, 16, 10);
    fin.scale(0.035, 0.05, 0.12);
    fin.translate(0, gtop(r1 + 0.3) + 0.02 * sh, r1 + 0.3);
    add(fin, black);
    // front: a wide dark grille between slim headlights that wrap round the corners, a lower intake; the clamshell hood's shut line
    patch(hl - 0.028 * sl, hl, -0.29, 0.52, chrome);
    patch(hl - 0.02 * sl, hl, -0.25, 0.48, grille, 0.005);
    patch(hl - 0.05 * sl, hl, at(0.53), at(0.62), trim);
    for (let e = -0.17; e < 0.45; e += 0.13)
      patch(hl - 0.017 * sl, hl, e, e + 0.026, flat(0x65727b, 0.35, 0.7), 0.008);
    patch(hl - 0.28 * sl, hl - 0.022 * sl, 0.23, 0.55, trim);
    patch(hl - 0.265 * sl, hl - 0.03 * sl, 0.44, 0.48, white, 0.007);
    patch(hl - 0.265 * sl, hl - 0.03 * sl, 0.28, 0.32, white, 0.007);
    for (const z of [hl - 0.18 * sl, hl - 0.105 * sl]) patch(z, z + 0.035 * sl, 0.34, 0.42, chrome, 0.008);
    patch(zf - 0.2, hl, 0.8, 0.82, trim, 0.002);
    // back: a black band across the tailgate with the lights at its ends, a dark diffuser
    patch(-hl, -hl + 0.3 * sl, 0.36, 0.64, flat(0x0d0e10, 0.25, 0.3));
    patch(-hl + 0.06 * sl, -hl + 0.3 * sl, 0.42, 0.58, red, 0.005);
    patch(-hl, -hl + 0.08 * sl, at(0.6), at(0.66), trim);
    // sides: a vent on the front fender, door seams, flush handles
    patch(zA + 0.08 * sl, zA + 0.23 * sl, 0.32, 0.57, trim);
    patch(zA + 0.09 * sl, zA + 0.12 * sl, 0.34, 0.55, chrome, 0.005);
  } else {
    // the pillars and the roof's edges in body color: the windshield, the side windows and the glass roof read apart
    patchOn(onGlass, ga, gb, 0.68, 0.83, paintF(c), 0.003);
    patchOn(onGlass, ga + 0.2 * sl, gb - 0.15 * sl, 0.66, 0.68, chrome, 0.005);
    // Roof headers separate the windshield, panoramic roof and rear window.
    patchOn(onGlass, 0.095 * hl, 0.15 * hl, 0.81, 1, paintF(c), 0.004);
    patchOn(onGlass, -0.48 * hl, -0.43 * hl, 0.81, 1, paintF(c), 0.004);
    // Recessed LED lamps, a hood shut line and a low, wide intake.
    patch(hl - 0.47 * sl, hl - 0.1 * sl, 0.5, 0.76, trim, 0.004);
    patch(hl - 0.455 * sl, hl - 0.115 * sl, 0.7, 0.745, white, 0.008);
    patch(hl - 0.455 * sl, hl - 0.4 * sl, 0.54, 0.71, white, 0.008);
    patch(hl - 0.37 * sl, hl - 0.19 * sl, 0.56, 0.61, chrome, 0.008);
    patch(hl - 0.3 * sl, hl, at(0.29), at(0.37), trim);
    patch(hl - 0.46 * sl, hl - 0.35 * sl, -0.45, -0.12, trim);
    patch(hl - 0.3 * sl, hl, at(0.255), at(0.275), chrome, 0.004);
    patch(0.43 * hl, 0.91 * hl, 0.947, 0.952, flat(0x3d444b, 0.45, 0.25), 0.002);
    // A level tail-light blade in a dark lens; a sculpted lower bumper.
    patch(-hl, -hl + 0.36 * sl, at(0.735), at(0.8), trim, 0.004);
    patch(-hl, -hl + 0.35 * sl, at(0.756), at(0.777), red, 0.008);
    patch(-hl, -hl + 0.18 * sl, at(0.31), at(0.46), sill, 0.004);
    patch(-hl, -hl + 0.14 * sl, at(0.32), at(0.335), chrome, 0.006);
  }
  // A small recessed registration plate, without branding or text textures.
  const rearY = (v === 'suv' ? 0.77 : 0.59) * sh;
  const plateFrame = new THREE.BoxGeometry((0.43 * w) / 1.85, 0.12 * sh, 0.018);
  plateFrame.translate(0, rearY, -hl - 0.006);
  add(plateFrame, black, false);
  const plate = new THREE.BoxGeometry((0.38 * w) / 1.85, 0.085 * sh, 0.012);
  plate.translate(0, rearY, -hl - 0.012);
  add(plate, std(0xdce1df, 0.42, 0.2), false);
  for (const side of [-1, 1]) {
    const screw = new THREE.SphereGeometry(0.006, 6, 4);
    screw.translate((side * 0.16 * w) / 1.85, rearY, -hl - 0.021);
    add(screw, black, false);
  }
  // Mirrors: body-colored cap above a black housing and an inset reflective rear face.
  const zm = gb - 0.31 * sl,
    ym = top(zm) + 0.025 * sh,
    xm = hwAt(zm) * 0.95 + 0.06 * sl,
    k = v === 'suv' ? 1.15 : 1;
  for (const side of [-1, 1]) {
    const st = new THREE.BoxGeometry(0.16 * sl, 0.035 * sh, 0.05 * sl);
    st.rotateZ(side * 0.17);
    st.translate(side * (xm - 0.1 * sl), ym - 0.035 * sh, zm);
    add(st, black);
    const housing = new THREE.SphereGeometry(1, 20, 12);
    housing.scale(0.125 * k, 0.055 * k, 0.09 * k);
    housing.translate(side * xm, ym, zm);
    add(housing, black);
    const cap = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(0.126 * k, 0.06 * k, 0.091 * k);
    cap.translate(side * xm, ym, zm);
    add(cap, paint(c));
    const mirror = new THREE.CircleGeometry(1, 20);
    mirror.scale(0.09 * k, 0.033 * k, 1);
    mirror.rotateY(Math.PI);
    mirror.translate(side * xm, ym - 0.004, zm - 0.086 * k);
    add(mirror, std(0x9bacb5, 0.14, 0.95), false);
  }
}

// A closed loft: ring(z) — the section at z, points counter-clockwise seen from the front, the same number for every z; the ends capped.
// floor(z) cuts it from below (the wheel arches): points under it go up onto it, and every point keeps the normal of the whole surface,
// so the sides round an arch shade as smoothly as anywhere else.
function loft(zs, ring, floor) {
  const R = zs.map(ring),
    n = R[0].length,
    N = zs.length,
    pos = new Float32Array((N * n + 2) * 3),
    idx = [];
  let k = 0;
  R.forEach((r, i) =>
    r.forEach(([x, y]) => {
      pos[k++] = x;
      pos[k++] = y;
      pos[k++] = zs[i];
    }),
  );
  for (let i = 0; i < N - 1; i++)
    for (let j = 0; j < n; j++) {
      const a = i * n + j,
        b = i * n + ((j + 1) % n);
      idx.push(a, b, a + n, b, b + n, a + n);
    }
  for (const [i, front, ci] of [
    [0, false, N * n],
    [N - 1, true, N * n + 1],
  ]) {
    let cx = 0,
      cy = 0;
    R[i].forEach(([x, y]) => {
      cx += x;
      cy += y;
    });
    pos.set([cx / n, cy / n, zs[i]], ci * 3);
    for (let j = 0; j < n; j++) {
      const a = i * n + j,
        b = i * n + ((j + 1) % n);
      front ? idx.push(ci, a, b) : idx.push(ci, b, a);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // a ring shrunk to a line (the nose's or the tail's tip): the surface there faces straight ahead, so it takes the next ring's normals
  // without their sideways part — no pinch down the middle
  const nm = geo.attributes.normal;
  for (const [i, j0] of [
    [0, 1],
    [N - 1, N - 2],
  ])
    if (R[i].every(([x]) => Math.abs(x) < 1e-6))
      for (let j = 0; j < n; j++) {
        const a = j0 * n + j,
          v = new THREE.Vector3(0, nm.getY(a), nm.getZ(a)).normalize();
        nm.setXYZ(i * n + j, v.x, v.y, v.z);
      }
  if (floor) {
    for (let i = 0; i < N; i++) {
      const f = floor(zs[i]);
      if (f < 0) continue;
      for (let j = 0; j < n; j++) {
        const q = i * n + j;
        if (pos[q * 3 + 1] < f) pos[q * 3 + 1] = f;
      }
    }
  }
  return geo;
}

// Wheels have a recessed barrel, machined split spokes, rounded tires and a visible brake disc.
function wheel(g, x, y, z, s, R, tw, suv) {
  const rr = R * 0.73,
    add = (geo, m) => {
      const o = new THREE.Mesh(geo, m);
      o.castShadow = o.receiveShadow = true;
      g.add(o);
      return o;
    };
  const alloy = std(0xbec7ce, 0.24, 0.8),
    dark = std(0x30373e, 0.42, 0.65),
    axle = geo => {
      geo.rotateZ(Math.PI / 2);
      return geo;
    };
  const tp = [
    [rr * 0.98, -tw / 2 + 0.012],
    [R - 0.035, -tw / 2],
    [R - 0.01, -tw / 2 + 0.022],
    [R, -tw / 2 + 0.055],
    [R, tw / 2 - 0.055],
    [R - 0.01, tw / 2 - 0.022],
    [R - 0.035, tw / 2],
    [rr * 0.98, tw / 2 - 0.012],
  ];
  const tire = axle(
    new THREE.LatheGeometry(
      tp.map(([r, a]) => new THREE.Vector2(r, a)),
      48,
    ),
  );
  tire.translate(x, y, z);
  add(tire, std(0x202226, 0.9));
  const face = x + s * (tw / 2 - 0.016);
  const barrel = axle(new THREE.CylinderGeometry(rr, rr, tw * 0.78, 40, 1, true));
  barrel.translate(x, y, z);
  add(barrel, dark);
  const disc = axle(new THREE.CylinderGeometry(rr * 0.77, rr * 0.77, 0.02, 40));
  disc.translate(face - s * 0.055, y, z);
  add(disc, std(0x788088, 0.5, 0.7));
  const cal = new THREE.BoxGeometry(0.065, rr * 0.48, 0.105);
  cal.rotateX(-0.75);
  cal.translate(face - s * 0.037, y + Math.cos(0.75) * rr * 0.63, z - Math.sin(0.75) * rr * 0.63);
  add(cal, std(suv ? 0x353d43 : 0xa82b22, 0.4, 0.35));
  const ring = (r, t, offset, m) => {
    const geo = new THREE.TorusGeometry(r, t, 6, 48);
    geo.rotateY(Math.PI / 2);
    geo.translate(face - s * offset, y, z);
    add(geo, m);
  };
  ring(rr - 0.008, 0.012, 0, alloy);
  ring(rr * 0.92, 0.009, 0.028, dark);
  ring(R - 0.035, 0.003, -0.012, std(0x303236, 0.85));
  const n = suv ? 7 : 5,
    hub = rr * 0.22;
  for (let i = 0; i < n; i++)
    for (const branch of [-1, 1]) {
      // A tapered, swept spoke with depth: its root sits behind its polished rim end.
      const shape = new THREE.Shape();
      shape.moveTo(hub, -0.017);
      shape.lineTo(rr * 0.95, branch * 0.046 - 0.018);
      shape.lineTo(rr * 0.95, branch * 0.046 + 0.018);
      shape.lineTo(hub, 0.017);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.024,
        bevelEnabled: true,
        bevelThickness: 0.003,
        bevelSize: 0.004,
        bevelSegments: 1,
        steps: 1,
      });
      const p = geo.attributes.position,
        a = (i * 2 * Math.PI) / n;
      for (let j = 0; j < p.count; j++) {
        const radial = p.getX(j),
          tangent = p.getY(j),
          depth = p.getZ(j),
          dish = 0.025 * (1 - radial / rr);
        p.setXYZ(
          j,
          face - s * (depth + dish),
          y + radial * Math.cos(a) - tangent * Math.sin(a),
          z + radial * Math.sin(a) + tangent * Math.cos(a),
        );
      }
      // The coordinate transform is a reflection for one side; reverse its winding too.
      if (s === 1) {
        for (let j = 0; j < p.count; j += 3) {
          const b = new THREE.Vector3().fromBufferAttribute(p, j + 1),
            c = new THREE.Vector3().fromBufferAttribute(p, j + 2);
          p.setXYZ(j + 1, c.x, c.y, c.z);
          p.setXYZ(j + 2, b.x, b.y, b.z);
        }
      }
      geo.computeVertexNormals();
      add(geo, alloy);
    }
  const hb = axle(new THREE.CylinderGeometry(hub, hub * 1.1, 0.028, 24));
  hb.translate(face - s * 0.025, y, z);
  add(hb, alloy);
  const cap = axle(new THREE.CylinderGeometry(hub * 0.52, hub * 0.52, 0.03, 20));
  cap.translate(face - s * 0.018, y, z);
  add(cap, dark);
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5,
      bolt = axle(new THREE.CylinderGeometry(0.008, 0.008, 0.031, 6));
    bolt.translate(face - s * 0.016, y + Math.cos(a) * hub * 0.76, z + Math.sin(a) * hub * 0.76);
    add(bolt, dark);
  }
}
