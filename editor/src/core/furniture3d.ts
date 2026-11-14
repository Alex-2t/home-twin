// Furniture in 3D: size-driven furniture generators and Kenney models. Catalog data lives in catalog.js.
// Item coordinate system: origin on the floor at the center, width along X, depth along Z, facing +Z.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CATALOG, COLORS, TOPS, isWorktop, byId, zOf, lArms, extOf, hexOf} from './catalog.ts';
import {isHex} from './color.ts';
import {runShape} from './runs.ts';
import {car as car3d} from './car3d.ts';
import {checkItem, buildItem} from './parts.ts';
import type {RunGeo, RunSide} from './runs.ts';
import type {FurnitureItem, MultiPolygon, Point, Segment, Vec3, Vector} from './types.ts';

/** A generated part: a mesh with one material. */
type Part3d = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

// generated parts each have one material
const isPart = (object: THREE.Object3D): object is Part3d => (object as THREE.Mesh).isMesh === true;
const isMesh = (object: THREE.Object3D): object is THREE.Mesh => (object as THREE.Mesh).isMesh === true;

/**
 * An item as the 3D view builds it (plan-scene.ts planFurniture): a plan item; a built-in run with its shape on the plan
 * (runs.ts runGeo); curtains or a blind as far open as HA says (0–1).
 */
export type Item3d = FurnitureItem & {geo?: RunGeo | null; open?: number};

/** What the shared builders read of an item: its size, its colour, its worktop and its variant. */
type Look = Pick<FurnitureItem, 'w' | 'd' | 'h' | 'color' | 'top' | 'v'>;

/** What a generator gets: the item with the catalog's colour and first variant filled in. */
type GenItem = Item3d & {color: string};

/** Draws an item into g at its own size, in item coordinates (see the top of the file). */
type Generator = (g: THREE.Group, p: GenItem) => void;

/** A catalog entry, as catalog.ts gives it. */
type Entry = NonNullable<ReturnType<typeof byId>>;

/** A point of a flat outline: [x, y]. */
type Flat = [number, number];

// ---------- generators ----------
const mats = new Map<string, THREE.MeshStandardMaterial>();
const mat = (color: number | string, rough = 0.62, metal = 0): THREE.MeshStandardMaterial => {
  const k = color + ':' + rough + ':' + metal;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({color, roughness: rough, metalness: metal}));
  // made just above when it was missing
  return mats.get(k)!;
};
// metal by color key: chrome and steel are shiny, the rest is painted
const finish = (k: string | undefined): THREE.MeshStandardMaterial =>
  k === 'chrome'
    ? mat(COLORS.chrome[1], 0.14, 0.9)
    : k === 'steel'
      ? mat(COLORS.steel[1], 0.3, 0.75)
      : mat(hexOf(k), k === 'black' ? 0.4 : 0.32);
const shade = (c: number | string, k: number): number => new THREE.Color(c).multiplyScalar(k).getHex();
// A named color this item draws in its own tone (an appliance white is not the furniture white); any other color, a custom #rrggbb too, as it is.
const tone = (k: string, own: Record<string, number>): number => own[k] ?? hexOf(k);
function part(
  g: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
  r = 0.006,
): THREE.Mesh {
  // y is the bottom of the part
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)),
    m,
  );
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
// Common table construction: a tabletop and four legs.
function table(g: THREE.Object3D, {w, d, h, color}: Look, thickness = 0.04): void {
  const m = mat(hexOf(color));
  part(g, w, thickness, d, m, 0, h - thickness, 0, 0.012);
  for (const x of [-1, 1])
    for (const z of [-1, 1])
      part(g, 0.045, h - thickness, 0.045, m, x * (w / 2 - 0.055), 0, z * (d / 2 - 0.055));
}
// Carcass with separate drawers; proportions are kept when resizing.
function drawers(g: THREE.Object3D, {w, d, h, color}: Look, rows = 3, base = 0.08): void {
  const c = hexOf(color);
  const m = mat(c);
  if (base) part(g, w - 0.08, base, d - 0.08, mat(shade(c, 0.6)), 0, 0, 0);
  part(g, w, h - base, d - 0.02, mat(shade(c, 0.8)), 0, base, -0.01);
  const dh = (h - base) / rows;
  for (let i = 0; i < rows; i++) {
    part(g, w - 0.008, dh - 0.006, 0.02, m, 0, base + i * dh + 0.003, d / 2 - 0.01);
    part(g, Math.min(w * 0.3, 0.3), 0.014, 0.018, mat(0x424448), 0, base + (i + 0.65) * dh, d / 2 + 0.009);
  }
}
/** A cylinder's options: the bottom radius, the sides, the axis ('y' standing; 'z', 'x' lying) and the stretch along x and z. */
interface CylOptions {
  rb?: number;
  seg?: number;
  axis?: 'x' | 'y' | 'z';
  sx?: number;
  sz?: number;
}
// Cylinder: along the y axis, the bottom is at y; along z or x, centered at (x,y,z). sx/sz stretch it into an ellipse (r=.5 → diameter = sx/sz).
function cyl(
  g: THREE.Object3D,
  r: number,
  h: number,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
  {rb = r, seg = 24, axis = 'y', sx = 1, sz = 1}: CylOptions = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, rb, h, seg), m);
  mesh.scale.set(sx, 1, sz);
  if (axis === 'z') {
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
  } else if (axis === 'x') {
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(x, y, z);
  } else mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
function box(
  g: THREE.Object3D,
  geo: THREE.BufferGeometry,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
// Truncated block: bottom w×d, top tw×td, shifted along z by tz (hood dome, slanted-hood wedge); bottom at y.
function frustum(w: number, h: number, d: number, tw: number, td: number, tz: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const a = geo.attributes.position;
  for (let i = 0; i < a.count; i++) {
    if (a.getY(i) > 0) {
      a.setX(i, (a.getX(i) * tw) / w);
      a.setZ(i, (a.getZ(i) * td) / d + tz);
    }
    a.setY(i, a.getY(i) + h / 2);
  }
  geo.computeVertexNormals();
  return geo;
}
// TOP(k): the kitchen worktop (catalog TOPS, item.top): gray stone by default, white quartz, oak, walnut, black stone, or a
// custom #rrggbb (D-070 everywhere), as smooth as the stones
const CERAMIC = (): THREE.MeshStandardMaterial => mat(0xf6f5f0, 0.22);
const CHROME = (): THREE.MeshStandardMaterial => finish('chrome');
const METAL = (): THREE.MeshStandardMaterial => mat(0xb9bcc0, 0.3);
const CUSTOM_TOP_ROUGHNESS = 0.3;
const TOP = (k: string | undefined): THREE.MeshStandardMaterial => {
  if (isHex(k)) return mat(hexOf(k), CUSTOM_TOP_ROUGHNESS);
  // TOPS: a worktop key → [name, colour, roughness]; any other key is gray stone
  const [, color, rough] = isWorktop(k) ? TOPS[k] : TOPS.stone;
  return mat(color, rough);
};
// Sanitary ware (toilet, bidet, washbasin, bathtubs): white ceramic, black or any other color glazed; inside — the floor of the bowl or tub.
const glaze = (k: string | undefined): number =>
  !k || k === 'white' ? 0xf6f5f0 : k === 'black' ? 0x2a2b2e : hexOf(k);
const ceramic = (k: string | undefined): THREE.MeshStandardMaterial =>
  mat(glaze(k), !k || k === 'white' ? 0.22 : k === 'black' ? 0.3 : 0.25);
const inside = (k: string | undefined, white: number, rough?: number): THREE.MeshStandardMaterial =>
  mat(!k || k === 'white' ? white : shade(glaze(k), 1.04), rough);
// Appliances and devices: their own white, any other color painted (steel and chrome shiny); a panel on the front a little lighter.
const enamel = (k: string | undefined, white: number, rough = 0.3): THREE.MeshStandardMaterial =>
  k === 'white' ? mat(white, rough) : finish(k);
const panel = (k: string | undefined, white: number): number =>
  k === 'white' ? white : shade(hexOf(k), 1.05);
const GLASS = new THREE.MeshStandardMaterial({
  color: 0xd6e6ec,
  roughness: 0.05,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const glass = (mesh: THREE.Mesh): THREE.Mesh => {
  mesh.castShadow = false;
  return mesh;
};
// Kitchen base unit: recessed plinth, carcass, overhanging countertop — shared by all units, so a row reads as one kitchen.
const KB = {P: 0.1, T: 0.038};
/** A kitchen unit's fronts as kitBase leaves them for row: the colour, the front and handle materials, the front's z, the plinth's and the worktop's heights. */
interface KitchenFront {
  c: number;
  front: THREE.Material;
  metal: THREE.Material;
  F: number;
  y0: number;
  y1: number;
}
function kitBase(
  g: THREE.Object3D,
  {w, d, h, color = 'white', top: tk}: Look,
  {top = true, body = true} = {},
): KitchenFront {
  const c = hexOf(color);
  const {P, T} = KB;
  part(g, w, P, d - 0.09, mat(0x2c2d30, 0.7), 0, 0, -0.045, 0.002);
  if (body) part(g, w, h - T - P, d - 0.05, mat(shade(c, 0.82)), 0, P, -0.025, 0.003);
  if (top) part(g, w, T, d, TOP(tk), 0, h - T, 0, 0.004);
  return {c, front: mat(c, 0.5), metal: METAL(), F: d / 2 - 0.032, y0: P, y1: h - T};
}
// fronts in a row over width len from x0: n doors (~60 cm by default), bar handle at the top or bottom
function row(
  g: THREE.Object3D,
  {front, metal, F}: KitchenFront,
  x0: number,
  len: number,
  y: number,
  hh: number,
  hp = 'top',
  n = Math.max(1, Math.round(len / 0.6)),
): void {
  const gap = 0.004;
  const dw = (len - gap * (n + 1)) / n;
  for (let i = 0; i < n; i++) {
    const x = x0 + gap + dw / 2 + i * (dw + gap);
    part(g, dw, hh, 0.018, front, x, y, F - 0.009, 0.003);
    part(
      g,
      Math.min(0.3, dw * 0.5),
      0.012,
      0.018,
      metal,
      x,
      hp === 'top' ? y + hh - 0.067 : y + 0.042,
      F + 0.009,
      0.005,
    );
  }
}
// Oven: frame, dark glass, handle, a panel with program knobs; height 59.5 cm from y.
function oven(g: THREE.Object3D, w: number, y: number, F: number): void {
  const fr = mat(0x2a2c30, 0.3);
  part(g, w - 0.008, 0.595, 0.02, fr, 0, y, F - 0.01, 0.004);
  part(g, w - 0.12, 0.32, 0.004, mat(0x0b0c0e, 0.1), 0, y + 0.07, F, 0.002);
  part(g, w * 0.72, 0.018, 0.024, METAL(), 0, y + 0.43, F + 0.012, 0.006);
  part(g, 0.1, 0.03, 0.004, mat(0x0b0c0e, 0.1), 0, y + 0.52, F, 0.002);
  for (const s of [-1, 1])
    cyl(g, 0.02, 0.02, METAL(), s * (w / 2 - 0.1), y + 0.535, F + 0.01, {axis: 'z', seg: 16});
}
// ---------- upholstered furniture ----------
// Sofas and armchair: legs, frame rail, armrests and cushions as separate soft blocks; cushions ~70 cm each, throw pillows in a contrasting color.
// Seat at 45 cm, armrest up to 62 cm, back at the full height h.
const SOFA = {leg: 0.1, base: 0.2, seat: 0.15, back: 0.17};
/** The materials of upholstered furniture: the fabric, the frame, the cushions, the legs and two pillows. */
interface SoftMats {
  fab: THREE.Material;
  frame: THREE.Material;
  cush: THREE.Material;
  leg: THREE.Material;
  pil: THREE.Material;
  pil2: THREE.Material;
}
function softMats(color: string | undefined): SoftMats {
  // COLORS: a colour key → [name, number]
  const c: number = hexOf(color, COLORS.grey[1] as number);
  const lum = (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
  return {
    fab: mat(c, 0.95),
    frame: mat(shade(c, 0.88), 0.96),
    cush: mat(shade(c, 1.05), 0.93),
    leg: mat(0x2f2620, 0.45),
    pil: mat(lum > 0.5 ? 0x59606b : 0xe4dccd, 0.95),
    pil2: mat(lum > 0.5 ? 0xb98d55 : 0xc7b08b, 0.95),
  };
}
const sofaLegs = (g: THREE.Object3D, M: SoftMats, pts: Flat[]): void => {
  for (const [x, z] of pts) cyl(g, 0.022, SOFA.leg, M.leg, x, 0, z, {rb: 0.015, seg: 12});
};
const seatTop = SOFA.leg + SOFA.base + SOFA.seat;
function seatRow(
  g: THREE.Object3D,
  M: SoftMats,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  n = Math.max(1, Math.round((x1 - x0) / 0.72)),
): void {
  const sw = (x1 - x0) / n;
  for (let i = 0; i < n; i++)
    part(
      g,
      sw - 0.012,
      SOFA.seat,
      z1 - z0 - 0.008,
      M.cush,
      x0 + sw * (i + 0.5),
      SOFA.leg + SOFA.base,
      (z0 + z1) / 2,
      0.055,
    );
}
function backRow(
  g: THREE.Object3D,
  M: SoftMats,
  x0: number,
  x1: number,
  z: number,
  h: number,
  n = Math.max(1, Math.round((x1 - x0) / 0.72)),
): void {
  const sw = (x1 - x0) / n;
  const y = seatTop - 0.02;
  const bh = h - y - 0.015;
  for (let i = 0; i < n; i++) {
    const q = part(g, sw - 0.02, bh, 0.2, M.cush, x0 + sw * (i + 0.5), y, z + 0.1, 0.075);
    q.rotation.x = -0.12;
  }
}
function pillow(g: THREE.Object3D, m: THREE.Material, x: number, z: number, ry: number): void {
  const q = part(g, 0.42, 0.4, 0.13, m, x, seatTop - 0.04, z, 0.065);
  q.rotation.set(-0.32, ry, 0);
}
function sofaBody(
  g: THREE.Object3D,
  {w, d, h, color}: Look,
  {pillows = true, A = Math.min(0.2, Math.max(0.12, w * 0.09))} = {},
): SoftMats {
  const M = softMats(color);
  const {leg, base, back} = SOFA;
  const AH = Math.min(0.64, h - 0.08);
  const k = 0.07;
  sofaLegs(g, M, [
    [-w / 2 + k, -d / 2 + k],
    [w / 2 - k, -d / 2 + k],
    [-w / 2 + k, d / 2 - k],
    [w / 2 - k, d / 2 - k],
    ...(w > 2.2
      ? ([
          [0, -d / 2 + k],
          [0, d / 2 - k],
        ] satisfies Flat[])
      : []),
  ]);
  part(g, w, base, d, M.frame, 0, leg, 0, 0.03);
  for (const s of [-1, 1]) part(g, A, AH - leg, d, M.fab, s * (w / 2 - A / 2), leg, 0, 0.075);
  part(g, w - 2 * A, h - leg - 0.04, back, M.frame, 0, leg, -d / 2 + back / 2, 0.06);
  seatRow(g, M, -w / 2 + A, w / 2 - A, -d / 2 + back, d / 2);
  backRow(g, M, -w / 2 + A, w / 2 - A, -d / 2 + back, h);
  if (pillows && w >= 1.4) {
    pillow(g, M.pil, -(w / 2 - A - 0.27), -d / 2 + back + 0.27, 0.2);
    pillow(g, M.pil2, w / 2 - A - 0.27, -d / 2 + back + 0.27, -0.2);
  }
  return M;
}
// Pipe serpentine: rows from top to bottom, semicircular turns at the edges (“Serpentine” towel warmer).
function serpentine(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  n: number,
  z: number,
): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const V = (x: number, y: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const s = (y0 - y1) / (n - 1);
  const k = ((s / 2) * 4) / 3;
  for (let i = 0; i < n; i++) {
    const y = y0 - i * s;
    const a = i % 2 ? x1 : x0;
    const b = i % 2 ? x0 : x1;
    path.add(new THREE.LineCurve3(V(a, y), V(b, y)));
    if (i < n - 1) {
      const e = i % 2 ? -k : k;
      path.add(new THREE.CubicBezierCurve3(V(b, y), V(b + e, y), V(b + e, y - s), V(b, y - s)));
    }
  }
  return path;
}
// Pleated fabric: a panel of width pw and height hh, a wave across the width (folds — how many folds, amp — their depth).
function drape(
  g: THREE.Object3D,
  m: THREE.Material,
  x0: number,
  x1: number,
  y0: number,
  hh: number,
  z: number,
  folds: number,
  amp: number,
  shadow = true,
): THREE.Mesh {
  const pw = x1 - x0;
  const geo = new THREE.PlaneGeometry(pw, hh, Math.max(16, folds * 10), 1);
  const a = geo.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const t = a.getX(i) / pw + 0.5;
    a.setZ(
      i,
      (Math.sin(t * folds * Math.PI * 2) + 0.35 * Math.sin(t * folds * 1.7 * Math.PI * 2 + 1.3)) * amp,
    );
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set((x0 + x1) / 2, y0 + hh / 2, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
const glow = (c: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({color: c, emissive: c, emissiveIntensity: 1.1, roughness: 0.4});
// Rod from point a to point b ([x,y,z]): splayed legs, crossbars.
function rod(g: THREE.Object3D, a: Vec3, b: Vec3, r: number, m: THREE.Material, seg = 12): THREE.Mesh {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const L = A.distanceTo(B);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, seg), m);
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
// Kids' room: pastel bedding and drawer colors
const PASTEL = [0xf2c9a0, 0xa9d1c2, 0xf3e1a2, 0xb9c8e6, 0xe7b5c2];
const SOFT_BED = new Set(['beige', 'linen', 'sand', 'grey', 'olive', 'navy', 'terracotta', 'sage']); // a bed in one of these colors is upholstered all over
// Sleeping place: mattress, sheet and blanket in pastels, a pillow at the left edge (in item axes, the long side along x).
function bedding(
  g: THREE.Object3D,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  tint = 0,
): void {
  const L = x1 - x0;
  const D = z1 - z0;
  const c = PASTEL[tint % PASTEL.length];
  part(g, L, 0.13, D, mat(0xf3f1ec, 0.85), (x0 + x1) / 2, y, (z0 + z1) / 2, 0.035);
  part(g, L * 0.68, 0.04, D + 0.01, mat(c, 0.9), x1 - L * 0.34, y + 0.12, (z0 + z1) / 2, 0.02);
  part(
    g,
    Math.min(0.45, L * 0.22),
    0.1,
    D * 0.7,
    mat(0xfaf8f4, 0.85),
    x0 + Math.min(0.45, L * 0.22) / 2 + 0.05,
    y + 0.12,
    (z0 + z1) / 2,
    0.045,
  );
}
// Washing machine (front- or top-loading) and dryer: body, a panel with a drawer and a display, a door or a lid on top.
function appliance(g: THREE.Object3D, {w, d, h, color = 'white'}: Look, kind: string): void {
  const wh = color === 'white' ? mat(0xf4f4f2, 0.34) : finish(color);
  const dark = mat(0x23262a, 0.3);
  const ch = CHROME();
  const blk = color === 'black';
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    cyl(g, 0.022, 0.02, dark, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), {seg: 12});
  part(g, w, h - 0.02, d, wh, 0, 0.02, 0, 0.025);
  if (kind === 'top') {
    const lid = mat(blk ? 0x34363a : 0xe9e9e6, 0.35);
    part(g, w - 0.04, 0.012, d * 0.62, lid, 0, h, d * 0.12, 0.01);
    part(g, w * 0.5, 0.01, 0.02, dark, 0, h + 0.012, d / 2 - 0.05, 0.004);
    part(g, w - 0.04, 0.05, d * 0.22, lid, 0, h, -d / 2 + d * 0.12, 0.01);
    part(g, w * 0.36, 0.03, 0.004, dark, 0, h + 0.02, -d / 2 + d * 0.23 + 0.001, 0.002);
    cyl(g, 0.025, 0.02, ch, w / 2 - 0.08, h + 0.05, -d / 2 + d * 0.12, {seg: 20});
    return;
  }
  const py = h - 0.145;
  part(g, w - 0.04, 0.003, 0.002, mat(0xcfd0cd, 0.5), 0, py, d / 2 + 0.001, 0.001);
  part(
    g,
    w * 0.3,
    0.085,
    0.012,
    blk ? mat(0x3a3c40, 0.4) : mat(0xe9e9e6, 0.4),
    -w / 2 + 0.03 + w * 0.15,
    py + 0.035,
    d / 2 + 0.005,
    0.006,
  );
  part(g, w * 0.2, 0.045, 0.004, dark, w * 0.06, py + 0.055, d / 2 + 0.002, 0.003);
  cyl(g, 0.032, 0.025, ch, w / 2 - 0.1, py + 0.075, d / 2 + 0.012, {axis: 'z'});
  const dy = Math.min(0.43, (py - 0.04) / 2 + 0.04);
  const r = Math.min(0.19, w * 0.32);
  const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 12, 48), kind === 'dryer' ? wh : ch);
  t.position.set(0, dy, d / 2 + 0.012);
  g.add(t);
  cyl(
    g,
    r - 0.012,
    0.016,
    kind === 'dryer' ? mat(0x8e9aa3, 0.06, 0.2) : mat(0x2d3a44, 0.08),
    0,
    dy,
    d / 2 + 0.006,
    {axis: 'z', seg: 40},
  );
  if (kind === 'dryer') part(g, w * 0.22, 0.012, 0.004, dark, 0, 0.06, d / 2 + 0.002, 0.003); // grille at the bottom — air outlet
}
// Clothes on hangers along a rail from x0 to x1 (rail at height ry, garment depth dz): varying lengths and colors.
function clothes(g: THREE.Object3D, x0: number, x1: number, ry: number, dz: number): void {
  const CL = [0x3e4b60, 0xd9d1c3, 0x8d9095, 0xa8644b, 0x737c5c, 0xf3f1ec, 0x27282b];
  const ch = CHROME();
  let x = x0;
  let k = 0;
  while (x < x1) {
    const L = 0.55 + ((k * 37) % 5) * 0.12;
    const cw = 0.035 + ((k * 13) % 3) * 0.012;
    part(g, cw, L, dz, mat(CL[k % CL.length], 0.9), x, ry - 0.04 - L, 0, 0.012);
    part(g, 0.006, 0.04, Math.min(0.3, dz * 0.75), ch, x, ry - 0.04, 0, 0.002);
    x += cw + 0.025;
    k++;
  }
}
/** A worktop with a basin: its size, height and thickness, the basin's size, centre and depth, and the two materials. */
interface BowlTop {
  w: number;
  d: number;
  y: number;
  T: number;
  bw: number;
  bd: number;
  bx?: number;
  bz?: number;
  dep: number;
  top: THREE.Material;
  bowl: THREE.Material;
}
// Countertop with a basin: a w×d cutout around a bw×bd basin (center bx,bz), basin depth dep (sink, vanity unit).
function bowlTop(g: THREE.Object3D, {w, d, y, T, bw, bd, bx = 0, bz = 0, dep, top, bowl}: BowlTop): void {
  const L = bx - bw / 2 + w / 2;
  const R = w / 2 - bx - bw / 2;
  const B = bz - bd / 2 + d / 2;
  const F = d / 2 - bz - bd / 2;
  part(g, L, T, d, top, -w / 2 + L / 2, y, 0, 0.006);
  part(g, R, T, d, top, w / 2 - R / 2, y, 0, 0.006);
  part(g, bw, T, B, top, bx, y, -d / 2 + B / 2, 0.003);
  part(g, bw, T, F, top, bx, y, d / 2 - F / 2, 0.003);
  part(g, bw, 0.01, bd, bowl, bx, y + T - dep, bz, 0.004);
  for (const s of [-1, 1]) {
    part(g, 0.01, dep, bd, bowl, bx + s * (bw / 2 - 0.005), y + T - dep, bz, 0.003);
    part(g, bw, dep, 0.01, bowl, bx, y + T - dep, bz + s * (bd / 2 - 0.005), 0.003);
  }
}
// Faucet on the ledge behind the basin: base, body, forward spout, lever.
function faucet(
  g: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  reach = 0.11,
  m: THREE.Material = CHROME(),
): void {
  cyl(g, 0.02, 0.025, m, x, y, z);
  cyl(g, 0.014, 0.14, m, x, y + 0.025, z);
  cyl(g, 0.012, reach, m, x, y + 0.15, z + reach / 2, {axis: 'z'});
  cyl(g, 0.01, 0.03, m, x, y + 0.125, z + reach - 0.005);
  part(g, 0.012, 0.012, 0.07, m, x, y + 0.165, z - 0.035, 0.004);
}
const sideM = (c: string | undefined): THREE.MeshStandardMaterial =>
  c === 'chrome'
    ? CHROME()
    : c === 'black'
      ? mat(0x27282b, 0.4, 0.3)
      : c === 'white'
        ? mat(0xf2f2f0, 0.4)
        : mat(hexOf(c, 0x888888), 0.5);
const BINC = [0x6c8f5a, 0x4f6d9a, 0xc9a24a];
// Wide refrigerator: side-by-side (narrower freezer on the left, two full-height doors, dispenser) or French door (two doors on top, a drawer below).
function wideFridge(g: THREE.Object3D, {w, d, h, color = 'white', v}: Look): void {
  const c = hexOf(color);
  const mt = color === 'steel' ? 0.6 : 0;
  const side = mat(shade(c, 0.92), 0.46, mt);
  const fr = mat(c, 0.3, mt);
  const seal = mat(0x373b40, 0.8);
  const hm = mat(0xc9cdd1, 0.2, 0.8);
  const D = 0.05;
  const z = d / 2 - D / 2;
  part(g, w - 0.07, 0.035, d - 0.08, seal, 0, 0, 0, 0.008);
  part(g, w, h - 0.035, d - D, side, 0, 0.035, -D / 2, 0.02);
  part(g, w - 0.012, h - 0.05, 0.006, seal, 0, 0.04, d / 2 - D, 0.002);
  const bar = (x: number, y0: number, y1: number): void => {
    cyl(g, 0.012, y1 - y0, hm, x, y0, d / 2 + 0.03, {seg: 12});
    for (const y of [y0 + 0.01, y1 - 0.01]) cyl(g, 0.008, 0.03, hm, x, y, d / 2 + 0.012, {axis: 'z', seg: 8});
  };
  if (v === 'sbs') {
    const xl = -w / 2 + w * 0.42;
    part(g, w * 0.42 - 0.008, h - 0.05, D - 0.004, fr, (-w / 2 + xl) / 2, 0.04, z, 0.014);
    part(g, w * 0.58 - 0.008, h - 0.05, D - 0.004, fr, (xl + w / 2) / 2, 0.04, z, 0.014);
    bar(xl - 0.04, h * 0.3, h * 0.85);
    bar(xl + 0.04, h * 0.3, h * 0.85);
    part(g, 0.16, 0.26, 0.012, mat(0x1d1f22, 0.3), (-w / 2 + xl) / 2, h * 0.5, d / 2 + 0.002, 0.012);
  } else {
    const yb = h * 0.36;
    part(g, w - 0.008, yb - 0.05, D - 0.004, fr, 0, 0.04, z, 0.014);
    part(g, w / 2 - 0.008, h - yb - 0.012, D - 0.004, fr, -w / 4, yb + 0.004, z, 0.014);
    part(g, w / 2 - 0.008, h - yb - 0.012, D - 0.004, fr, w / 4, yb + 0.004, z, 0.014);
    bar(-0.04, yb + 0.25, h - 0.15);
    bar(0.04, yb + 0.25, h - 0.15);
    part(g, w * 0.6, 0.02, 0.025, hm, 0, yb - 0.08, d / 2 + 0.015, 0.008);
  }
}
const ART = [0xd9a441, 0x3e4b60, 0xa8644b, 0x98a38f, 0xe9e2d4, 0x27282b, 0x6f8fa8];
const transp = (color: number, opacity: number, rough = 0.1): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
// Ellipsoid leaf from point base in direction dir with length L (aquarium and potted plants).
function leaf(g: THREE.Object3D, m: THREE.Material, base: Vec3, dir: Vec3, L: number, wd = 0.03): THREE.Mesh {
  const v = new THREE.Vector3(...dir).normalize();
  const q = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), m);
  q.scale.set(wd, L / 2, wd * 0.25);
  q.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
  q.position.set(base[0] + (v.x * L) / 2, base[1] + (v.y * L) / 2, base[2] + (v.z * L) / 2);
  g.add(q);
  return q;
}
// Double-bowl sink: lower carcass, two bowls side by side, faucet in the middle at the back.
function sinkTwo(g: THREE.Object3D, p: Look): void {
  const {w, d, h} = p;
  const {P, T} = KB;
  const k = kitBase(g, p, {top: false, body: false});
  const body = mat(shade(k.c, 0.82));
  const steel = mat(0xb4b8bc, 0.26);
  const dep = 0.18;
  const bd = Math.min(d - 0.2, 0.42);
  const bz = 0.02;
  part(g, w, h - T - P - dep - 0.02, d - 0.05, body, 0, P, -0.025, 0.003);
  for (const s2 of [-1, 1]) part(g, 0.018, h - T - P, d - 0.05, body, s2 * (w / 2 - 0.009), P, -0.025, 0.002);
  part(g, w, h - T - P, 0.018, body, 0, P, -d / 2 + 0.009, 0.002);
  for (const x of [-w / 4, w / 4]) {
    const q = new THREE.Group();
    q.position.x = x;
    g.add(q);
    bowlTop(q, {
      w: w / 2,
      d,
      y: h - T,
      T,
      bw: Math.min(w / 2 - 0.06, 0.4),
      bd,
      bz,
      dep,
      top: TOP(p.top),
      bowl: steel,
    });
    cyl(q, 0.02, 0.003, mat(0x2a2c30, 0.4), 0, h - dep + 0.008, bz, {seg: 16});
  }
  faucet(g, 0, h, -d / 2 + 0.055, 0.16);
  row(g, k, -w / 2, w, P + 0.003, h - T - P - 0.006, 'top', 2);
}
// ---------- plants and vases ----------
// Leaves are flat outlined shapes with a bend (tip and edges drooping), double-sided; the pot and vase are solids of revolution with a
// wall and a rim. Randomness is seeded by the dimensions: rebuild the item and the plant stays the same.
const V3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);
const twoSided = new Map<string, THREE.MeshStandardMaterial>();
const leafMat = (color: number, rough = 0.62): THREE.MeshStandardMaterial => {
  const k = color + ':' + rough;
  if (!twoSided.has(k))
    twoSided.set(k, new THREE.MeshStandardMaterial({color, roughness: rough, side: THREE.DoubleSide}));
  // made just above when it was missing
  return twoSided.get(k)!;
};
const seeded = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
// Pot (or vase) from a profile [[r,y],…] going up on the outside and down on the inside; returns the soil level.
function vessel(g: THREE.Object3D, pts: Flat[], m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.LatheGeometry(
      pts.map(([x, y]) => new THREE.Vector2(x, y)),
      40,
    ),
    m,
  );
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
// style: round — tapers toward the bottom, with a rim; cyl — straight and tall; bowl — wide low bowl
function pot(g: THREE.Object3D, R: number, H: number, m: THREE.Material, style = 'round'): number {
  const t = Math.min(0.016, R * 0.1);
  const rb = style === 'cyl' ? R * 0.95 : style === 'bowl' ? R * 0.6 : R * 0.76;
  const soil = style === 'bowl' ? H * 0.84 : H - 0.04;
  vessel(
    g,
    style === 'bowl'
      ? [
          [0, 0],
          [rb, 0],
          [rb * 1.03, 0.012],
          [R * 0.9, H * 0.5],
          [R, H * 0.86],
          [R, H],
          [R - t, H],
          [R - t, H * 0.88],
          [0, soil],
        ]
      : [
          [0, 0],
          [rb, 0],
          [rb + 0.004, 0.01],
          [R * 0.985, H - 0.035],
          [R * 1.04, H - 0.03],
          [R * 1.04, H],
          [R * 1.04 - t, H],
          [R - t, H - 0.035],
          [0, soil],
        ],
    m,
  );
  cyl(g, (R - t) * 0.985, 0.008, mat(0x3a2c21, 0.95), 0, soil - 0.004, 0, {seg: 32});
  return soil;
}
function stalk(
  g: THREE.Object3D,
  pts: THREE.Vector3[],
  r: number,
  m: THREE.Material,
  seg = 12,
): THREE.Curve<THREE.Vector3> {
  const c =
    pts.length === 3
      ? new THREE.QuadraticBezierCurve3(pts[0], pts[1], pts[2])
      : new THREE.CatmullRomCurve3(pts);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(c, seg, r, 5, false), m);
  mesh.castShadow = true;
  g.add(mesh);
  return c;
}
/** How a leaf bends: the tip droops (bend), the edges (cup), it twists along its axis (twist, radians). */
interface LeafBend {
  bend?: number;
  cup?: number;
  twist?: number;
}
// Leaf by outline (x — across, y — from stalk to tip): bend droops the tip, cup — the edges, twist twists along the axis.
function leafGeo(pts: Flat[], {bend = 0, cup = 0, twist = 0}: LeafBend = {}): THREE.ShapeGeometry {
  const geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), 3);
  const a = geo.attributes.position;
  let L = 1e-6;
  let W = 1e-6;
  for (const [x, y] of pts) {
    L = Math.max(L, y);
    W = Math.max(W, Math.abs(x));
  }
  for (let i = 0; i < a.count; i++) {
    let x = a.getX(i);
    let y = a.getY(i);
    let v = Math.max(0, y) / L;
    let z = -bend * L * v * v - cup * W * (x / W) ** 2;
    if (twist) {
      const c = Math.cos(twist * v);
      const sn = Math.sin(twist * v);
      const nx = x * c - z * sn;
      z = x * sn + z * c;
      x = nx;
    }
    a.setX(i, x);
    a.setZ(i, z);
  }
  geo.computeVertexNormals();
  return geo;
}
const mirror = (half: Flat[]): Flat[] => [
  ...half,
  ...half
    .slice(1, -1)
    .reverse()
    .map(([x, y]): Flat => [-x, y]),
]; // right half from stalk to tip → the full outline
// Leaf at point base along axis dir; its face points up where possible (so the leaf does not stand edge-on)
function putLeaf(
  g: THREE.Object3D,
  geo: THREE.BufferGeometry,
  m: THREE.Material,
  base: Vec3,
  dir: Vec3,
): THREE.Mesh {
  const Y = V3(...dir).normalize();
  const X = new THREE.Vector3().crossVectors(Y, UP);
  if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
  X.normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  const mesh = new THREE.Mesh(geo, m);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  mesh.position.set(...base);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
// Monstera: a heart with slits from the edge toward the middle (more on larger leaves), lobes at the stalk
function monsteraLeaf(L: number, W: number, k: number): Flat[] {
  const half: Flat[] = [
    [0, 0],
    [W * 0.17, -L * 0.1],
    [W * 0.37, -L * 0.06],
  ];
  const N = 16;
  const step = Math.max(2, Math.floor(N / (k + 1)));
  for (let i = 1; i <= N; i++) {
    const y = L * (i / N) * 0.97 - L * 0.02;
    const hw =
      (W / 2) * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, (y + L * 0.1) / (L * 1.1)))), 0.7);
    half.push([hw, y]);
    if (k && i % step === 0 && i < N - 2) half.push([hw * 0.3, y + L * 0.026], [hw * 0.97, y + L * 0.05]);
  }
  half.push([0, L]);
  return mirror(half);
}
/** A plant's place: its spread D, height h, the pot's material and its seeded randomness. */
interface PlantArgs {
  D: number;
  h: number;
  pm: THREE.Material;
  rnd: () => number;
}
const PLANT: Record<string, (g: THREE.Group, o: PlantArgs) => void> = {
  monstera(g, {D, h, pm, rnd}) {
    const R = Math.min(0.24, D * 0.27);
    const y0 = pot(g, R, Math.min(0.38, h * 0.36), pm);
    const top = h - y0;
    const G = [0x2c5730, 0x346236, 0x29502e];
    const pet = leafMat(0x5b7d3f, 0.7);
    const n = Math.max(5, Math.round(4 + D * 7));
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = i * 2.39996 + rnd() * 0.5;
      const L = Math.min(0.44, top * 0.44, D * 0.42) * (0.78 + 0.3 * rnd());
      const tilt = ((55 - 45 * t + rnd() * 8) * Math.PI) / 180;
      const c = Math.cos(tilt);
      const sn = Math.sin(tilt);
      const yP = y0 + Math.max(0.06, top - L * sn * 0.9) * (1 - 0.5 * t);
      const rP = Math.max(0.03, D / 2 - L * c * 0.95) * (0.3 + 0.7 * t);
      const P: Vec3 = [Math.cos(a) * rP, yP, Math.sin(a) * rP];
      stalk(
        g,
        [
          V3(Math.cos(a) * 0.02, y0, Math.sin(a) * 0.02),
          V3(Math.cos(a) * rP * 0.25, yP * 0.92 + y0 * 0.08, Math.sin(a) * rP * 0.25),
          V3(...P),
        ],
        0.006,
        pet,
      );
      putLeaf(
        g,
        leafGeo(monsteraLeaf(L, L * 0.9, L > 0.3 ? 4 : L > 0.2 ? 3 : 2), {bend: 0.22, cup: 0.22}),
        leafMat(G[i % 3], 0.6),
        P,
        [c * Math.cos(a), sn, c * Math.sin(a)],
      );
    }
  },
  // fiddle-leaf fig: a curved trunk with a branch, large “fiddle” leaves (wider toward the tip, with a waist) spiraling in the upper part
  ficus(g, {D, h, pm, rnd}) {
    const R = Math.min(0.2, D * 0.3);
    const y0 = pot(g, R, Math.min(0.42, h * 0.25), pm, 'cyl');
    const bark = mat(0x6d5745, 0.85);
    const G = [0x2a5226, 0x33602c, 0x3c6a33];
    const top = h - 0.04;
    const trunk = stalk(
      g,
      [
        V3(0, y0, 0),
        V3(0.025, y0 + (top - y0) * 0.35, 0.012),
        V3(-0.018, y0 + (top - y0) * 0.7, -0.012),
        V3(0.008, top - 0.1, 0),
      ],
      0.015,
      bark,
      20,
    );
    const bp = trunk.getPoint(0.55);
    const branch = stalk(
      g,
      [
        bp,
        V3(bp.x + D * 0.12, bp.y + (top - bp.y) * 0.45, bp.z + D * 0.05),
        V3(bp.x + D * 0.2, top - (top - y0) * 0.18, bp.z + D * 0.08),
      ],
      0.01,
      bark,
      12,
    );
    const fig = (L: number, W: number): Flat[] => {
      const half: Flat[] = [[0, 0]];
      for (let k = 1; k <= 12; k++) {
        const v = k / 12;
        const hw =
          (W / 2) *
          Math.sin(Math.PI * Math.pow(v, 1.35)) *
          (1 - 0.13 * Math.exp(-(((v - 0.42) / 0.12) ** 2)));
        half.push([hw, v * L]);
      }
      return mirror(half);
    };
    const n = Math.round(14 + Math.max(0, h - 1) * 12);
    for (let i = 0; i < n; i++) {
      const onB = i % 4 === 3;
      const u = onB ? 0.25 + 0.75 * rnd() : 0.42 + 0.58 * (i / n);
      const curve = onB ? branch : trunk;
      const P = curve.getPoint(u);
      const a = i * 2.39996;
      const tilt = ((22 + 40 * u + rnd() * 10) * Math.PI) / 180;
      const L = Math.min(0.32, 0.2 + 0.12 * rnd()) * Math.min(1.1, h / 1.6);
      const reach = Math.hypot(P.x, P.z);
      const Lm = Math.max(0.12, Math.min(L, (D / 2 - reach) / Math.cos(tilt)));
      putLeaf(
        g,
        leafGeo(fig(Lm, Lm * 0.62), {bend: 0.18, cup: 0.18}),
        leafMat(G[i % 3], 0.42),
        [P.x, P.y, P.z],
        [Math.cos(tilt) * Math.cos(a), Math.sin(tilt), Math.cos(tilt) * Math.sin(a)],
      );
    }
  },
  // palm (areca): stalks arching from the center, narrow leaflets on both sides, shorter and lower toward the end
  palm(g, {D, h, pm, rnd}) {
    const R = Math.min(0.25, D * 0.26);
    const y0 = pot(g, R, Math.min(0.4, h * 0.26), pm);
    const top = h - y0;
    const cane = leafMat(0x7c8b42, 0.6);
    const pos: number[] = [];
    const n = Math.max(6, Math.round(5 + D * 6));
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = i * 2.39996 + rnd() * 0.3;
      const rT = (D / 2) * (0.55 + 0.4 * t) * (0.88 + 0.12 * rnd());
      const hT = y0 + top * (1 - 0.45 * t) * (0.92 + 0.08 * rnd());
      const b = V3(Math.cos(a) * 0.025, y0, Math.sin(a) * 0.025);
      const ctrl = V3(Math.cos(a) * rT * 0.3, y0 + top * (1.05 - 0.2 * t), Math.sin(a) * rT * 0.3);
      const tip = V3(Math.cos(a) * rT, hT - top * 0.35 * t, Math.sin(a) * rT);
      const curve = stalk(g, [b, ctrl, tip], 0.005, cane, 14);
      for (let j = 0; j < 24; j++) {
        const u = 0.22 + (0.76 * j) / 23;
        const P = curve.getPoint(u);
        const T = curve.getTangent(u);
        const side = new THREE.Vector3().crossVectors(T, UP);
        if (side.lengthSq() < 1e-6) continue;
        side.normalize();
        const len =
          (0.05 + 0.17 * Math.sin(Math.PI * Math.min(1, (u - 0.15) / 0.9))) * Math.min(1.1, D / 0.9);
        const wq = 0.007;
        for (const sg of [-1, 1]) {
          const dir = side
            .clone()
            .multiplyScalar(sg)
            .addScaledVector(T, 0.6)
            .addScaledVector(UP, -0.45)
            .normalize();
          const E = P.clone().addScaledVector(dir, len);
          const a1 = P.clone().addScaledVector(T, -wq);
          const a2 = P.clone().addScaledVector(T, wq);
          const e1 = E.clone().addScaledVector(T, wq * 0.25);
          const e2 = E.clone().addScaledVector(T, -wq * 0.25);
          pos.push(
            ...a1.toArray(),
            ...a2.toArray(),
            ...e1.toArray(),
            ...a1.toArray(),
            ...e1.toArray(),
            ...e2.toArray(),
          );
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, leafMat(0x5a8a3b, 0.6));
    m.castShadow = true;
    g.add(m);
  },
  // snake plant: straight sword leaves from the soil, slightly outward and twisted; one at the full height
  snake(g, {D, h, pm, rnd}) {
    const R = Math.min(0.22, D * 0.46);
    const y0 = pot(g, R, Math.min(0.34, h * 0.36), pm, 'cyl');
    const G = [0x2e482a, 0x3a5832, 0x46653a];
    const n = Math.max(6, Math.round(5 + D * 14));
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + rnd() * 0.6;
      const rr = R * 0.6 * Math.sqrt(rnd());
      const L = i ? (h - y0) * (0.5 + 0.45 * rnd()) : h - y0;
      const W = 0.045 + 0.03 * rnd();
      const lean = 0.05 + (0.2 * rr) / R + 0.05 * rnd();
      const half: Flat[] = [[0, 0]];
      for (let k = 1; k <= 10; k++) {
        const v = k / 10;
        half.push([
          (W / 2) *
            Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + v * 0.82)), 0.55) *
            (v > 0.85 ? (1 - v) / 0.15 + 0.02 : 1),
          v * L,
        ]);
      }
      half.push([0, L]);
      putLeaf(
        g,
        leafGeo(mirror(half), {cup: 0.4, twist: (rnd() - 0.5) * 1.6}),
        leafMat(G[i % 3], 0.5),
        [Math.cos(a) * rr, y0 - 0.01, Math.sin(a) * rr],
        [Math.cos(a) * lean, 1, Math.sin(a) * lean],
      );
    }
  },
  // hydrangea: a dome of leaves with flower heads of small blossoms on top
  flowers(g, {D, h, pm, rnd}) {
    const R = Math.min(0.22, D * 0.34);
    const y0 = pot(g, R, Math.min(0.3, h * 0.42), pm, 'bowl');
    const top = h - y0;
    const cr = D / 2;
    const G = [0x3d6b38, 0x48773f];
    const ovate = (L: number): Flat[] => {
      const half: Flat[] = [[0, 0]];
      for (let k = 1; k <= 8; k++) {
        const v = k / 8;
        half.push([L * 0.28 * Math.sin(Math.PI * Math.pow(v, 0.8)), v * L]);
      }
      return mirror(half);
    };
    for (let i = 0; i < 24; i++) {
      const t = i / 23;
      const a = i * 2.39996;
      const L = 0.09 + 0.05 * rnd();
      const rr = cr * 0.55 * Math.sqrt(t);
      const tilt = ((15 + 45 * (1 - t)) * Math.PI) / 180;
      putLeaf(
        g,
        leafGeo(ovate(L), {bend: 0.15, cup: 0.2}),
        leafMat(G[i % 2], 0.7),
        [Math.cos(a) * rr * 0.5, y0 + top * (0.45 - 0.25 * t), Math.sin(a) * rr * 0.5],
        [Math.cos(tilt) * Math.cos(a), Math.sin(tilt), Math.cos(tilt) * Math.sin(a)],
      );
    }
    const FL = [0xd8a3cc, 0xe6bfd9, 0xc6b0e0, 0xeedbe6];
    const bud = new THREE.SphereGeometry(1, 7, 5);
    const m = Math.max(4, Math.round(3 + D * 7));
    const rb = Math.min(0.09, cr * 0.32);
    for (let i = 0; i < m; i++) {
      const a = i * 2.39996 + 0.6;
      const rr = (cr - rb) * (i ? 0.35 + 0.6 * rnd() : 0);
      const c = V3(Math.cos(a) * rr, h - rb - (i ? top * 0.18 * rnd() : 0), Math.sin(a) * rr);
      const fm = mat(FL[i % 4], 0.8);
      stalk(g, [V3(0, y0, 0), V3(c.x * 0.5, (y0 + c.y) / 2, c.z * 0.5), c], 0.004, leafMat(0x557a3e, 0.7), 8);
      for (let k = 0; k < 18; k++) {
        const th = rnd() * Math.PI * 2;
        const ph = Math.acos(1 - 1.4 * rnd());
        const q = new THREE.Mesh(bud, fm);
        const r2 = rb * 0.8;
        q.scale.set(0.024, 0.012, 0.024);
        q.position.set(
          c.x + Math.sin(ph) * Math.cos(th) * r2,
          c.y + Math.cos(ph) * r2,
          c.z + Math.sin(ph) * Math.sin(th) * r2,
        );
        q.lookAt(c.x * 2 - q.position.x, c.y * 2 - q.position.y, c.z * 2 - q.position.z);
        q.castShadow = true;
        g.add(q);
      }
    }
  },
};
/** What is in a vase: up to height h, from the vase's top y0, its radius R and its seeded randomness. */
interface VaseArgs {
  h: number;
  y0: number;
  R: number;
  rnd: () => number;
}
const VASE: Record<string, (g: THREE.Group, o: VaseArgs) => void> = {
  // pampas grass: thin arching stems with fluffy plumes of several elongated puffs on top
  pampas(g, {h, y0, R, rnd}) {
    const st = leafMat(0xa48d66, 0.8);
    const pl = mat(0xe9dcc2, 1);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.39996 + rnd() * 0.4;
      const lean = ((8 + 20 * rnd()) * Math.PI) / 180;
      const L = (h - y0) * (0.82 + 0.18 * (i ? rnd() : 1));
      const tip = V3(
        Math.cos(a) * Math.sin(lean) * L,
        y0 + Math.cos(lean) * L,
        Math.sin(a) * Math.sin(lean) * L,
      );
      const c = stalk(
        g,
        [
          V3(Math.cos(a) * R * 0.15, y0 - 0.05, Math.sin(a) * R * 0.15),
          V3(tip.x * 0.3, y0 + (tip.y - y0) * 0.6, tip.z * 0.3),
          tip,
        ],
        0.003,
        st,
        12,
      );
      const pk = 0.18 + 0.12 * rnd();
      for (let k = 0; k < 3; k++) {
        const u = 1 - (pk / L) * (0.25 + 0.3 * k);
        const P = c.getPoint(Math.max(0.5, u));
        const T = c.getTangent(Math.max(0.5, u));
        const q = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), pl);
        q.scale.set(0.03 - 0.006 * k, pk * (0.45 - 0.08 * k), 0.03 - 0.006 * k);
        q.quaternion.setFromUnitVectors(UP, T);
        q.position.copy(P).addScaledVector(T, pk * 0.15);
        q.castShadow = true;
        g.add(q);
      }
    }
  },
  // eucalyptus: slanted stems with pairs of round gray-blue leaves along them
  eucalyptus(g, {h, y0, R, rnd}) {
    const st = leafMat(0x6f6a55, 0.8);
    const lm = leafMat(0x8ea493, 0.75);
    const disc = (r: number): Flat[] => {
      const p: Flat[] = [];
      for (let k = 0; k <= 12; k++) {
        const t = (k / 12) * Math.PI * 2;
        p.push([Math.sin(t) * r, r - Math.cos(t) * r]);
      }
      return p;
    };
    for (let i = 0; i < 6; i++) {
      const a = i * 2.39996 + rnd() * 0.5;
      const lean = ((14 + 28 * rnd()) * Math.PI) / 180;
      const L = (h - y0) * (0.75 + 0.25 * (i ? rnd() : 1));
      const tip = V3(
        Math.cos(a) * Math.sin(lean) * L,
        y0 + Math.cos(lean) * L,
        Math.sin(a) * Math.sin(lean) * L,
      );
      const c = stalk(
        g,
        [V3(0, y0 - 0.05, 0), V3(tip.x * 0.25, y0 + (tip.y - y0) * 0.6, tip.z * 0.25), tip],
        0.0035,
        st,
        12,
      );
      for (let u = 0.3; u <= 1; u += 0.055 / L) {
        const P = c.getPoint(u);
        const T = c.getTangent(u);
        const side = new THREE.Vector3().crossVectors(T, UP);
        if (side.lengthSq() < 1e-6) continue;
        side.normalize();
        const r = 0.016 + 0.016 * (1 - u);
        for (const sg of [-1, 1])
          putLeaf(
            g,
            leafGeo(disc(r), {cup: 0.15}),
            lm,
            P.toArray(),
            side.clone().multiplyScalar(sg).addScaledVector(UP, 0.35).toArray(),
          );
      }
    }
  },
  empty() {},
};
const GEN: Record<string, Generator> = {
  // Our own generic model: two compartments, recessed handles, no brand and no external assets.
  // The bounding box includes the doors; all parts stay within w/d/h for an accurate plan.
  fridge(g, p) {
    const {w, d, h, color = 'white', v} = p;
    if (v === 'sbs' || v === 'french') {
      wideFridge(g, p);
      return;
    }
    const c = hexOf(color);
    const mt = color === 'steel' ? 0.6 : 0;
    const enamel = mat(c, 0.38, mt);
    const side = mat(shade(c, 0.92), 0.48, mt);
    const seal = mat(0x373b40, 0.8);
    const foot = 0.035;
    const door = 0.045;
    const gap = 0.009;
    const split = h * 0.34;
    part(g, w - 0.07, foot, d - 0.08, seal, 0, 0, 0, 0.008);
    part(g, w, h - foot, d - door, side, 0, foot, -door / 2, 0.018);
    // The dark backing is visible only in the seam and in the recesses for gripping the doors.
    part(g, w - 0.018, h - foot - 0.014, 0.008, seal, 0, foot + 0.007, d / 2 - door + 0.004, 0.003);
    const front = mat(c, color === 'steel' ? 0.28 : 0.32, mt);
    const z = d / 2 - door / 2 - 0.002;
    part(g, w - 0.012, split - foot - gap / 2, door - 0.004, front, 0, foot, z, 0.012);
    part(g, w - 0.012, h - split - gap / 2, door - 0.004, front, 0, split + gap / 2, z, 0.014);
    // Shallow horizontal handles at the compartment joint, not protruding beyond the bounding box.
    const gripW = w * 0.48;
    const gripX = -w * 0.17;
    for (const y of [split - 0.039, split + 0.014]) {
      part(g, gripW, 0.022, 0.005, seal, gripX, y, d / 2 - 0.0025, 0.006);
      part(g, gripW, 0.006, 0.006, enamel, gripX, y + 0.016, d / 2 - 0.003, 0.002);
    }
  },
  dresser(g, p) {
    drawers(g, p, 3);
  },
  tvStand(g, p) {
    const {w, d, h, color} = p;
    const m = mat(hexOf(color));
    // wall-hung (above the floor) — a carcass without legs, a row of flap fronts
    if (zOf(p) > 0) {
      const c = hexOf(color);
      const n = Math.max(2, Math.round(w / 0.6));
      const gap = 0.004;
      const dw = (w - gap * (n + 1)) / n;
      part(g, w, h, d - 0.02, mat(shade(c, 0.85), 0.55), 0, 0, -0.01, 0.006);
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + gap + dw / 2 + i * (dw + gap);
        part(g, dw, h - 0.008, 0.018, m, x, 0.004, d / 2 - 0.009, 0.003);
      }
      return;
    }
    table(g, p);
    part(g, w - 0.08, 0.025, d - 0.04, m, 0, 0.12, 0);
    for (const x of [-1, 0, 1]) part(g, 0.02, h - 0.16, d - 0.04, m, x * (w / 2 - 0.05), 0.12, 0);
    part(g, w - 0.08, h - 0.16, 0.012, m, 0, 0.12, -d / 2 + 0.02);
  },
  diningTable(g, p) {
    table(g, p);
  },
  console(g, p) {
    table(g, p);
    part(g, p.w - 0.12, 0.02, p.d - 0.08, mat(hexOf(p.color)), 0, 0.18, 0);
  },
  // Bench: a wooden top on four legs; upholstered — a padded seat in the color on dark wooden legs (a hall or dining banquette)
  bench(g, p) {
    if (p.v !== 'upholstered') {
      table(g, p, 0.07);
      return;
    }
    const {w, d, h, color} = p;
    const c = hexOf(color);
    const leg = mat(0x3a2f26, 0.6);
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        part(g, 0.04, 0.12, 0.04, leg, x * (w / 2 - 0.06), 0, z * (d / 2 - 0.06), 0.01);
    part(g, w, h - 0.12, d, mat(c, 0.92), 0, 0.12, 0, 0.05);
    part(g, w - 0.02, 0.04, d - 0.02, mat(shade(c, 1.05), 0.94), 0, h - 0.04, 0, 0.02);
  },
  ottoman(g, {w, d, h, color}) {
    const c = hexOf(color);
    part(g, w - 0.08, 0.06, d - 0.08, mat(shade(c, 0.55)), 0, 0, 0);
    part(g, w, h - 0.12, d, mat(c, 0.95), 0, 0.06, 0, 0.07);
    part(g, w, 0.065, d, mat(shade(c, 1.08), 0.95), 0, h - 0.065, 0, 0.03);
  },
  shoeCabinet(g, p) {
    drawers(g, p, 3);
  },
  bathShelf(g, p) {
    const {w, d, h, color} = p;
    const m = mat(hexOf(color));
    for (const x of [-1, 1])
      for (const z of [-1, 1]) part(g, 0.025, h, 0.025, m, x * (w / 2 - 0.013), 0, z * (d / 2 - 0.013));
    for (let i = 0; i < 5; i++) part(g, w, 0.025, d, m, 0, 0.08 + (i * (h - 0.105)) / 4, 0);
  },
  // Vanity unit: two drawers, a ceramic countertop with a basin and a faucet on top; wall-hung — no plinth, the floor beneath it stays free.
  vanity(g, p) {
    const {w, d, h, v, color} = p;
    const c = hexOf(color);
    const body = mat(shade(c, 0.85));
    const front = mat(c, 0.5);
    const mt = mat(0x2b2c2f, 0.4, 0.4);
    const cer = CERAMIC();
    const wall = v === 'wall';
    const y0 = wall ? Math.min(0.35, h * 0.4) : 0.08;
    const T = 0.04;
    const dep = 0.14;
    const y = h - T;
    if (!wall) part(g, w - 0.08, 0.08, d - 0.08, mat(shade(c, 0.6)), 0, 0, 0, 0.002);
    part(g, w, y - dep - 0.01 - y0, d - 0.03, body, 0, y0, -0.015, 0.004);
    for (const s2 of [-1, 1]) part(g, 0.018, y - y0, d - 0.03, body, s2 * (w / 2 - 0.009), y0, -0.015, 0.002);
    part(g, w, y - y0, 0.018, body, 0, y0, -d / 2 + 0.009, 0.002);
    const fh = (y - y0 - 0.012) / 2;
    for (let i = 0; i < 2; i++) {
      const yy = y0 + 0.004 + i * (fh + 0.004);
      part(g, w - 0.008, fh, 0.018, front, 0, yy, d / 2 - 0.024, 0.003);
      part(g, Math.min(0.3, w * 0.4), 0.01, 0.014, mt, 0, yy + fh - 0.05, d / 2 - 0.008, 0.004);
    }
    const bk = 0.09;
    const two = w >= 1.2;
    const hw = two ? w / 2 : w;
    const bw = Math.min(hw - 0.12, 0.58);
    const bd = d - bk - 0.05;
    const bz = -d / 2 + bk + bd / 2; // from 1.2 m — two basins
    for (const x of two ? [-w / 4, w / 4] : [0]) {
      const q = new THREE.Group();
      q.position.x = x;
      g.add(q);
      bowlTop(q, {w: hw, d, y, T, bw, bd, bz, dep, top: cer, bowl: mat(0xefeee9, 0.16)});
      cyl(q, 0.017, 0.003, CHROME(), 0, y + T - dep + 0.012, bz + 0.03, {seg: 20});
      faucet(q, 0, h, -d / 2 + bk / 2);
    }
  },
  wardrobe(g, {w, d, h, color, v}) {
    const c = hexOf(color);
    const body = mat(shade(c, 0.82));
    const front = mat(c, 0.55);
    const metal = mat(0x3c3e42, 0.4);
    part(g, w - 0.04, 0.06, d - 0.05, mat(shade(c, 0.6)), 0, 0, -0.02, 0.002);
    part(g, w, h - 0.06, d - 0.02, body, 0, 0.06, -0.01, 0.004);
    // sliding: doors overlapping in two rows, rails at the top and bottom, full-height profile handles
    if (v === 'sliding') {
      const n = Math.max(2, Math.round(w / 0.9));
      const dw = (w - 0.02) / n + 0.03;
      const al = mat(0xb8bcc0, 0.3, 0.6);
      part(g, w, 0.03, 0.06, al, 0, h - 0.03, d / 2 - 0.03, 0.003);
      part(g, w, 0.02, 0.06, al, 0, 0.06, d / 2 - 0.03, 0.003);
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 0.01 + ((w - 0.02) * (i + 0.5)) / n;
        const z = d / 2 - (i % 2 ? 0.045 : 0.015);
        part(g, dw, h - 0.12, 0.018, front, x, 0.08, z, 0.003);
        for (const s of [-1, 1])
          part(g, 0.018, h - 0.12, 0.026, al, x + s * (dw / 2 - 0.009), 0.08, z, 0.003);
      }
      return;
    }
    const n = Math.max(1, Math.round(w / 0.5));
    const gap = 0.004;
    const dw = (w - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + gap + dw / 2 + i * (dw + gap);
      part(g, dw, h - 0.06 - gap * 2, 0.018, front, x, 0.06 + gap, d / 2 - 0.009, 0.003);
      const side = i % 2 ? -1 : 1;
      part(
        g,
        0.012,
        Math.min(0.35, h * 0.2),
        0.02,
        metal,
        x + side * (dw / 2 - 0.04),
        Math.min(1.0, h * 0.42),
        d / 2 + 0.01,
        0.005,
      );
    }
  },
  // Shelving unit: sides, a back, shelves every ~36 cm. Filled by variant: books — rows of colorful books; styled — muted books in groups,
  // a lying stack, ceramic vases and a basket, with air between them; boxes — storage boxes (a garage, a utility room); empty.
  shelf(g, {w, d, h, color, v = 'books'}) {
    const c = hexOf(color);
    const m = mat(c);
    const t = 0.018;
    part(g, t, h, d, m, -w / 2 + t / 2, 0, 0);
    part(g, t, h, d, m, w / 2 - t / 2, 0, 0);
    part(g, w, h, 0.006, mat(shade(c, 0.85)), 0, 0, -d / 2 + 0.003, 0.001);
    const n = Math.max(2, Math.round(h / 0.36));
    let s = Math.round(w * 1000 + h * 100);
    const rnd = () => ((s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) | 0) >>> 0) / 4294967296;
    const BOOK = [0x8c3b2e, 0x2f4f6b, 0xc9a24a, 0x4f6b4a, 0xd8d2c4, 0x6b4a6b];
    const MUTED = [0xd9d1c3, 0xc1a785, 0x3e4b60, 0xa8644b, 0x737c5c, 0x2b2c2f, 0xe9e2d4, 0x8d9095];
    const CER = [0xf1efe9, 0x2b2c2f, 0xb9a184, 0xa8644b];
    const x0 = -w / 2 + t;
    const x1 = w / 2 - t;
    const upright = (x: number, y: number, top: number, k: number, pal: number[]): number => {
      for (let j = 0; j < k && x < x1 - 0.03; j++) {
        const bw = 0.022 + rnd() * 0.024;
        const bh = Math.min(top, 0.17 + rnd() * 0.1);
        part(g, bw, bh, d * 0.72, mat(pal[Math.floor(rnd() * pal.length)], 0.8), x + bw / 2, y, 0, 0.003);
        x += bw + 0.002;
      }
      return x;
    };
    const vase = (x: number, y: number, top: number): void => {
      const R = Math.min(0.06, d * 0.25);
      const H = Math.min(top, 0.12 + rnd() * 0.12);
      const q = vessel(
        g,
        [
          [0, 0],
          [R * 0.6, 0],
          [R, H * 0.4],
          [R * 0.85, H * 0.75],
          [R * 0.45, H * 0.92],
          [R * 0.5, H],
          [R * 0.4, H],
          [0, H * 0.9],
        ],
        mat(CER[Math.floor(rnd() * CER.length)], 0.4),
      );
      q.position.set(x, y, 0);
    };
    for (let i = 0; i <= n; i++) {
      const y = i === 0 ? 0.02 : i === n ? h - t : (i * (h - t)) / n;
      part(g, w - 2 * t, t, d - 0.008, m, 0, y, 0.004);
      if (i >= n) continue;
      const top = (h - t) / n - 0.04;
      const yb = y + t;
      if (v === 'books') {
        if (rnd() < 0.7) {
          let x = x0 + 0.02 + rnd() * 0.15;
          while (x < x1 - 0.05 && rnd() < 0.93) {
            const bw = 0.02 + rnd() * 0.03;
            const bh = Math.min(top, 0.18 + rnd() * 0.12);
            part(
              g,
              bw,
              bh,
              d * 0.75,
              mat(BOOK[Math.floor(rnd() * BOOK.length)], 0.8),
              x + bw / 2,
              yb,
              0.0,
              0.003,
            );
            x += bw + 0.003;
          }
        }
      } else if (v === 'styled') {
        const kind = (i + Math.floor(rnd() * 3)) % 3;
        const left = rnd() < 0.5;
        if (kind === 0) {
          const x = upright(
            left ? x0 + 0.02 : x0 + (x1 - x0) * 0.45,
            yb,
            top,
            5 + Math.floor(rnd() * 5),
            MUTED,
          );
          vase(left ? Math.max(x + 0.1, x1 - 0.12) : x0 + 0.1, yb, top);
        } else if (kind === 1) {
          let yy = yb;
          const cx = left ? x0 + 0.16 : x1 - 0.16;
          for (let j = 0; j < 3; j++) {
            const bt = 0.025 + rnd() * 0.015;
            part(
              g,
              0.24 + rnd() * 0.04,
              bt,
              d * 0.7,
              mat(MUTED[Math.floor(rnd() * MUTED.length)], 0.8),
              cx,
              yy,
              0,
              0.003,
            );
            yy += bt;
          }
          vase(cx + (rnd() - 0.5) * 0.06, yy, top - (yy - yb));
          if (x1 - x0 > 0.6) vase(left ? x1 - 0.14 : x0 + 0.14, yb, top);
        } else {
          const bw = Math.min(0.34, (x1 - x0) * 0.5);
          const bh = Math.min(top, 0.2);
          part(
            g,
            bw,
            bh,
            d * 0.78,
            mat(rnd() < 0.5 ? 0xb08a5c : 0xd9d1c3, 0.95),
            left ? x0 + bw / 2 + 0.03 : x1 - bw / 2 - 0.03,
            yb,
            0,
            0.02,
          );
          upright(left ? x0 + bw + 0.1 : x0 + 0.04, yb, top, 3 + Math.floor(rnd() * 3), MUTED);
        }
      } else if (v === 'boxes') {
        const k = Math.max(1, Math.round((x1 - x0) / 0.4));
        const bw = (x1 - x0 - 0.02 * (k + 1)) / k;
        const bh = Math.min(top, 0.28);
        for (let j = 0; j < k; j++) {
          if (rnd() < 0.15) continue;
          const x = x0 + 0.02 + bw / 2 + j * (bw + 0.02);
          const bc = rnd() < 0.6 ? 0xb58e5f : rnd() < 0.5 ? 0x8d9095 : 0xe6e3dc;
          part(g, bw, bh, d * 0.85, mat(bc, 0.9), x, yb, 0, 0.006);
          part(
            g,
            bw * 0.35,
            0.05,
            0.004,
            mat(shade(bc, 0.75), 0.9),
            x,
            yb + bh * 0.55,
            d * 0.425 + 0.001,
            0.001,
          );
        }
      }
    }
  },
  // Bed: a base, mattress, duvet, pillows and a headboard. Upholstered (the default): in a fabric color the whole bed is upholstered
  // in it, in a wood color the frame is wood and the headboard a neutral fabric. Wooden: a solid headboard in the frame color with
  // vertical joints and a capping rail. A custom color is fabric on the upholstered bed and wood on the wooden one.
  bed(g, {w, d, h, color, v}) {
    const c = hexOf(color);
    const soft = SOFT_BED.has(color) || (isHex(color) && v !== 'wood');
    const frame = soft ? mat(c, 0.9) : mat(c);
    const fabric = soft ? mat(shade(c, 1.04), 0.92) : mat(0xd2cabb, 0.9);
    const linen = mat(0xf1eee8, 0.85);
    const duvet = mat(0xdcd6cb, 0.9);
    const leg = soft ? mat(0x3a2f26, 0.6) : mat(shade(c, 0.7));
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      part(g, 0.05, 0.08, 0.05, leg, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), 0.01);
    part(g, w, 0.24, d - 0.06, frame, 0, 0.08, 0.03, soft ? 0.03 : 0.012);
    part(g, w - 0.06, 0.2, d - 0.16, linen, 0, 0.32, 0.05, 0.05);
    part(g, w - 0.02, 0.07, (d - 0.16) * 0.66, duvet, 0, 0.47, 0.05 + (d - 0.16) * 0.17, 0.035);
    const pw = w > 1.2 ? (w - 0.24) / 2 : w - 0.2;
    for (const sx of w > 1.2 ? [-1, 1] : [0])
      part(g, pw, 0.13, 0.38, linen, sx * (pw / 2 + 0.04), 0.52, -d / 2 + 0.36, 0.06);
    if (v === 'wood') {
      const wood = soft ? mat(COLORS.oak[1], 0.55) : mat(c, 0.55);
      const seam = mat(shade(soft ? COLORS.oak[1] : c, 0.72), 0.6);
      const H = h - 0.08;
      const n = Math.max(3, Math.round(w / 0.32));
      part(g, w, H, 0.06, wood, 0, 0.08, -d / 2 + 0.03, 0.008);
      part(g, w + 0.02, 0.035, 0.08, wood, 0, 0.08 + H - 0.035, -d / 2 + 0.04, 0.006);
      for (let i = 1; i < n; i++)
        part(g, 0.006, H - 0.08, 0.004, seam, -w / 2 + (w * i) / n, 0.12, -d / 2 + 0.061, 0.001);
    } else {
      part(g, w, h - 0.08, 0.09, fabric, 0, 0.08, -d / 2 + 0.045, 0.03);
      if (soft)
        for (const sx of w > 1.2 ? [-1, 1] : [0])
          part(
            g,
            w > 1.2 ? w / 2 - 0.04 : w - 0.08,
            h - 0.32,
            0.03,
            mat(shade(c, 0.97), 0.95),
            sx * (w > 1.2 ? w / 4 : 0),
            0.3,
            -d / 2 + 0.1,
            0.015,
          );
    }
  },
  nightstand(g, p) {
    const {w, d, h, color} = p;
    const L = zOf(p) > 0 ? 0 : 0.06; // wall-hung — no legs
    const c = hexOf(color);
    const body = mat(shade(c, 0.85));
    const front = mat(c, 0.55);
    const metal = mat(0x3c3e42, 0.4);
    if (L)
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        part(g, 0.025, L, 0.025, metal, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03), 0.005);
    part(g, w, h - L, d - 0.02, body, 0, L, -0.01, 0.006);
    const fh = (h - L - 0.012) / 2;
    for (let i = 0; i < 2; i++) {
      const y = L + 0.004 + i * (fh + 0.004);
      part(g, w - 0.008, fh, 0.016, front, 0, y, d / 2 - 0.008, 0.003);
      part(g, 0.08, 0.01, 0.012, metal, 0, y + fh * 0.6, d / 2 + 0.006, 0.004);
    }
  },
  // Kitchen: plinth recessed under the fronts, overhanging countertop; fronts in ~60 cm modules, bar handles.
  // The hob is no longer part of “Base cabinets” — it is a separate unit, like the sink and the dishwasher.
  // kitchen base and wall cabinets are wall-run items: their look is in RUN_LOOK below
  tv(g, {w, d, h, color}) {
    part(g, w, h, d, color === 'black' ? mat(0x1b1c1f, 0.35) : finish(color), 0, 0, 0, 0.006);
    part(g, w - 0.024, h - 0.024, 0.004, mat(0x07080b, 0.12), 0, 0.012, d / 2, 0.001);
  },
  // Sink: a cutout in the countertop with a bowl beneath; from 80 cm — bowl on the left and a drainer on the right. The carcass is lower so the bowl is visible.
  kitchenSink(g, p) {
    if (p.v === 'two') {
      sinkTwo(g, p);
      return;
    }
    const {w, d, h} = p;
    const {P, T} = KB;
    const k = kitBase(g, p, {top: false, body: false});
    const body = mat(shade(k.c, 0.82));
    const top = TOP(p.top);
    const steel = mat(0xb4b8bc, 0.26);
    const bw = Math.min(w - 0.16, 0.5);
    const bd = Math.min(d - 0.2, 0.42);
    const bx = w >= 0.8 ? -w / 2 + 0.08 + bw / 2 : 0;
    const bz = 0.02;
    const dep = 0.18;
    part(g, w, h - T - P - dep - 0.02, d - 0.05, body, 0, P, -0.025, 0.003);
    for (const s of [-1, 1]) part(g, 0.018, h - T - P, d - 0.05, body, s * (w / 2 - 0.009), P, -0.025, 0.002);
    part(g, w, h - T - P, 0.018, body, 0, P, -d / 2 + 0.009, 0.002);
    const L = bx - bw / 2 + w / 2;
    const R = w / 2 - bx - bw / 2;
    const B = bz - bd / 2 + d / 2;
    const Fd = d / 2 - bz - bd / 2;
    part(g, L, T, d, top, -w / 2 + L / 2, h - T, 0, 0.004);
    part(g, R, T, d, top, w / 2 - R / 2, h - T, 0, 0.004);
    part(g, bw, T, B, top, bx, h - T, -d / 2 + B / 2, 0.002);
    part(g, bw, T, Fd, top, bx, h - T, d / 2 - Fd / 2, 0.002);
    part(g, bw, 0.008, bd, steel, bx, h - dep, bz, 0.002);
    for (const s of [-1, 1]) {
      part(g, 0.008, dep, bd, steel, bx + s * (bw / 2 - 0.004), h - dep, bz, 0.001);
      part(g, bw, dep, 0.008, steel, bx, h - dep, bz + s * (bd / 2 - 0.004), 0.001);
      part(g, 0.02, 0.004, bd + 0.04, steel, bx + s * (bw / 2 + 0.01), h, bz, 0.002);
      part(g, bw + 0.04, 0.004, 0.02, steel, bx, h, bz + s * (bd / 2 + 0.01), 0.002);
    }
    cyl(g, 0.022, 0.004, mat(0x2a2c30, 0.4), bx, h - dep + 0.008, bz);
    if (w >= 0.8) {
      const x0 = bx + bw / 2 + 0.03;
      const x1 = w / 2 - 0.05;
      part(g, x1 - x0, 0.004, bd, steel, (x0 + x1) / 2, h, bz, 0.002);
      for (let x = x0 + 0.03; x < x1 - 0.02; x += 0.035)
        part(g, 0.006, 0.003, bd - 0.08, mat(0x9a9ea3, 0.3), x, h + 0.004, bz, 0.001);
    }
    const ch = CHROME();
    const fz = -d / 2 + B / 2;
    cyl(g, 0.02, 0.03, ch, bx, h, fz);
    cyl(g, 0.013, 0.24, ch, bx, h + 0.03, fz);
    cyl(g, 0.012, 0.2, ch, bx, h + 0.26, fz + 0.1, {axis: 'z'});
    cyl(g, 0.012, 0.05, ch, bx, h + 0.21, fz + 0.19);
    part(g, 0.012, 0.012, 0.08, ch, bx + 0.03, h + 0.2, fz + 0.02, 0.004);
    row(g, k, -w / 2, w, P + 0.003, h - T - P - 0.006, 'top', Math.max(1, Math.round(w / 0.45)));
  },
  // Hob: glass with burners; drawers or an oven beneath it.
  kitchenHob(g, p) {
    const {w, d, h, v} = p;
    const k = kitBase(g, p);
    const hob = mat(0x121316, 0.14);
    const ring = mat(0x55585d, 0.35);
    if (v === 'oven') {
      const oh = 0.595;
      oven(g, w, k.y1 - 0.006 - oh, k.F);
      row(g, k, -w / 2, w, k.y0 + 0.003, k.y1 - k.y0 - oh - 0.012);
    } else {
      const H = k.y1 - k.y0 - 0.006;
      const hs = [0.25, 0.375, 0.375];
      let y = k.y0 + 0.003;
      for (const f of hs) {
        row(g, k, -w / 2, w, y, H * f - 0.004, 'top', 1);
        y += H * f;
      }
    }
    const pw = Math.min(0.58, w - 0.04);
    const pd = Math.min(0.52, d - 0.08);
    part(g, pw, 0.006, pd, hob, 0, h, -0.01, 0.003);
    for (const [x, z, r] of [
      [-0.13, -0.13, 0.09],
      [0.13, -0.13, 0.07],
      [-0.13, 0.11, 0.07],
      [0.13, 0.11, 0.09],
    ]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(r * Math.min(1, pw / 0.58), 0.003, 6, 40), ring);
      t.rotation.x = Math.PI / 2;
      t.position.set((x * pw) / 0.58, h + 0.006, -0.01 + (z * pd) / 0.52);
      g.add(t);
    }
  },
  // Dishwasher: semi-integrated — a control panel is visible on top, a kitchen front below.
  dishwasher(g, p) {
    const {w, h} = p;
    const k = kitBase(g, p);
    const dark = mat(0x34373c, 0.32);
    const y = k.y1 - 0.08;
    part(g, w - 0.008, 0.077, 0.02, dark, 0, y, k.F - 0.01, 0.003);
    part(g, 0.07, 0.022, 0.004, mat(0x0b0c0e, 0.1), w / 2 - 0.12, y + 0.028, k.F, 0.002);
    for (let i = 0; i < 4; i++)
      cyl(g, 0.008, 0.004, mat(0xb9bcc0, 0.3), -w / 2 + 0.08 + i * 0.045, y + 0.039, k.F + 0.002, {
        axis: 'z',
        seg: 12,
      });
    part(g, w - 0.008, y - k.y0 - 0.006, 0.018, k.front, 0, k.y0 + 0.003, k.F - 0.009, 0.003);
    part(g, Math.min(0.3, w * 0.5), 0.012, 0.018, k.metal, 0, y - 0.06, k.F + 0.009, 0.005);
  },
  // Corner cabinet: L-shaped — one arm along the back wall and one along the left (mirrored — the right), fronts facing into the corner.
  kitchenCorner(g, p) {
    const {w, d, h, color} = p;
    const c = hexOf(color);
    const {P, T} = KB;
    // the catalog gives this model its arms (foot)
    const {back: A, side: S} = lArms(p)!;
    const body = mat(shade(c, 0.82));
    const pl = mat(0x2c2d30, 0.7);
    const top = TOP(p.top);
    const front = mat(c, 0.5);
    const metal = METAL();
    const L = -w / 2;
    const B = -d / 2;
    const H = h - T - P;
    const gap = 0.004;
    part(g, w, P, A - 0.09, pl, 0, 0, B + (A - 0.09) / 2, 0.002);
    part(g, S - 0.09, P, d - A + 0.09, pl, L + (S - 0.09) / 2, 0, B + A - 0.09 + (d - A + 0.09) / 2, 0.002);
    part(g, w, H, A - 0.05, body, 0, P, B + (A - 0.05) / 2, 0.003);
    part(g, S - 0.05, H, d - A + 0.05, body, L + (S - 0.05) / 2, P, B + A - 0.05 + (d - A + 0.05) / 2, 0.003);
    part(g, w, T, A, top, 0, h - T, B + A / 2, 0.004);
    part(g, S, T, d - A, top, L + S / 2, h - T, B + A + (d - A) / 2, 0.004);
    const fb = B + A - 0.041;
    const lb = w / 2 - (L + S - 0.05);
    const n = Math.max(1, Math.round(lb / 0.6));
    const dw = (lb - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      const x = L + S - 0.05 + gap + dw / 2 + i * (dw + gap);
      part(g, dw, H - 0.006, 0.018, front, x, P + 0.003, fb, 0.003);
      part(g, Math.min(0.3, dw * 0.5), 0.012, 0.018, metal, x, h - T - 0.07, fb + 0.018, 0.005);
    }
    const fl = L + S - 0.041;
    const ls = d / 2 - (B + A - 0.05) - gap * 2;
    const zc = B + A - 0.05 + gap + ls / 2;
    part(g, 0.018, H - 0.006, ls, front, fl, P + 0.003, zc, 0.003);
    part(g, 0.018, 0.012, Math.min(0.3, ls * 0.5), metal, fl + 0.018, h - T - 0.07, zc, 0.005);
  },
  // Tall unit: a tall cabinet reaching up to the overhead storage; two doors or an oven at eye level.
  kitchenTall(g, {w, d, h, color, v}) {
    const c = hexOf(color);
    const {P} = KB;
    const F = d / 2 - 0.032;
    const body = mat(shade(c, 0.82));
    const front = mat(c, 0.5);
    const metal = METAL();
    part(g, w, P, d - 0.09, mat(0x2c2d30, 0.7), 0, 0, -0.045, 0.002);
    part(g, w, h - P, d - 0.05, body, 0, P, -0.025, 0.003);
    const door = (y0: number, y1: number, hy: number): void => {
      part(g, w - 0.008, y1 - y0 - 0.006, 0.018, front, 0, y0 + 0.003, F - 0.009, 0.003);
      part(g, 0.012, Math.min(0.25, (y1 - y0) * 0.4), 0.018, metal, w / 2 - 0.05, hy, F + 0.009, 0.005);
    };
    if (v === 'oven') {
      const oy = Math.min(0.85, h - 0.9);
      door(P, oy - 0.003, oy - 0.3);
      oven(g, w, oy, F);
      door(oy + 0.598, h, oy + 0.62);
    } else {
      const m = P + (h - P) * 0.55;
      door(P, m, m - 0.3);
      door(m, h, m + 0.04);
    }
  },
  // Range hood: dome or slanted, the chimney goes up (height is to the top of the chimney).
  hood(g, {w, d, h, v, color = 'steel'}) {
    const st = finish(color);
    const cw = Math.min(0.28, w * 0.5);
    const cd = Math.min(0.24, d * 0.6);
    const cz = -d / 2 + cd / 2;
    if (v === 'slant') {
      const H = Math.min(0.45, h - 0.05);
      const run = d - cd;
      const a = Math.atan2(H, run);
      box(g, frustum(w, H, d, w, cd, cz), st, 0, 0, 0); // wedge, black glass on the slope
      const gl = new THREE.Mesh(
        new RoundedBoxGeometry(w - 0.02, 0.008, Math.hypot(H, run) - 0.02, 2, 0.003),
        mat(0x111214, 0.1),
      );
      gl.rotation.x = a;
      gl.position.set(0, H / 2 + Math.cos(a) * 0.005, (d / 2 + cz + cd / 2) / 2 + Math.sin(a) * 0.005);
      g.add(gl);
      part(g, w - 0.02, 0.004, d - 0.04, mat(0x2a2c30, 0.5), 0, -0.004, 0, 0.001);
      part(g, cw, h - H, cd, st, 0, H, cz, 0.003);
    } else {
      part(g, w, 0.035, d, st, 0, 0, 0, 0.004);
      box(g, frustum(w, 0.16, d, cw + 0.04, cd + 0.03, cz), st, 0, 0.035, 0);
      part(g, w - 0.06, 0.004, d - 0.06, mat(0x6b6e73, 0.5), 0, -0.004, 0, 0.001);
      part(g, cw, h - 0.195, cd, st, 0, 0.195, cz, 0.003);
    }
  },
  // ---------- bathroom ----------
  // Toilet: the bowl is an ellipse sized to fit, floor-standing with a cistern or wall-hung on an installation frame box (height is the top of the cistern or box).
  toilet(g, {w, d, h, v, color = 'white'}) {
    const blk = color === 'black';
    const cer = ceramic(color);
    const seat = blk
      ? mat(0x323337, 0.35)
      : color === 'white'
        ? mat(0xfbfaf7, 0.3)
        : mat(shade(glaze(color), 1.05), 0.3);
    const ch = CHROME();
    const wall = v === 'wall';
    const back = wall ? 0.16 : 0.17;
    const z0 = -d / 2 + (wall ? back : back - 0.04);
    const bl = d / 2 - z0;
    const zc = (z0 + d / 2) / 2;
    const bw = Math.min(w, 0.4); // bowl no wider than 40 cm, the installation box spans the full width
    if (wall) {
      part(g, w, h, back, mat(0xdedbd5, 0.7), 0, 0, -d / 2 + back / 2, 0.004);
      part(
        g,
        Math.min(0.24, w * 0.65),
        0.15,
        0.01,
        ch,
        0,
        Math.max(0.45, Math.min(h - 0.2, 1)),
        -d / 2 + back + 0.005,
        0.004,
      );
      cyl(g, 0.5, 0.2, cer, 0, 0.18, zc, {rb: 0.3, sx: bw * 0.96, sz: bl});
    } else {
      cyl(g, 0.5, 0.2, cer, 0, 0, zc + 0.02, {sx: bw * 0.55, sz: bl * 0.6});
      cyl(g, 0.5, 0.2, cer, 0, 0.18, zc, {rb: 0.4, sx: bw * 0.96, sz: bl});
      part(g, w * 0.95, h - 0.39, back, cer, 0, 0.39, -d / 2 + back / 2, 0.03);
      part(g, bw * 0.6, 0.4, 0.12, cer, 0, 0, -d / 2 + 0.06, 0.02);
      cyl(g, 0.025, 0.008, ch, 0, h, -d / 2 + back / 2);
    }
    cyl(g, 0.5, 0.018, seat, 0, 0.38, zc + 0.005, {sx: bw * 0.98, sz: bl * 0.97});
    cyl(g, 0.5, 0.014, seat, 0, 0.398, zc, {sx: bw * 0.92, sz: bl * 0.9});
  },
  // Bathtub: rim, bottom and panel in one white; faucet on the rim by the wall.
  bath(g, {w, d, h, color}) {
    const cer = ceramic(color);
    const t = 0.07;
    const ch = CHROME();
    part(g, w, 0.14, d, cer, 0, 0, 0, 0.01);
    for (const s of [-1, 1]) {
      part(g, w, h - 0.14, t, cer, 0, 0.14, s * (d / 2 - t / 2), 0.02);
      part(g, t, h - 0.14, d - 2 * t, cer, s * (w / 2 - t / 2), 0.14, 0, 0.02);
    }
    part(g, w - 2 * t, 0.004, d - 2 * t, inside(color, 0xefeee9, 0.16), 0, 0.14, 0, 0.001);
    cyl(g, 0.025, 0.004, ch, w / 2 - t - 0.1, 0.144, 0);
    const x = w / 2 - 0.18;
    const z = -d / 2 + t / 2;
    cyl(g, 0.02, 0.08, ch, x, h, z);
    cyl(g, 0.014, 0.14, ch, x, h + 0.06, z + 0.07, {axis: 'z'});
    part(g, 0.1, 0.014, 0.014, ch, x, h + 0.05, z, 0.005);
  },
  // Shower cabin: tray, glass in front and on the right (walls at the back and left; mirrored — on the right), a riser rail with a hand shower at the back wall.
  shower(g, {w, d, h, v, color = 'chrome'}) {
    const cer = CERAMIC();
    const ch = finish(color);
    const T = 0.12;
    const gh = h - T - 0.03;
    const x0 = -w / 2 + 0.2 * w;
    const z0 = -d / 2 + 0.2 * d;
    const rx = 0.8 * w - 0.015;
    const rz = 0.8 * d - 0.015;
    if (v === 'round') {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, d / 2);
      s.lineTo(w / 2, d / 2);
      s.lineTo(w / 2, -z0);
      s.absellipse(x0, -z0, 0.8 * w, 0.8 * d, 0, -Math.PI / 2, true);
      s.lineTo(-w / 2, -d / 2);
      s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, {depth: T, bevelEnabled: false, curveSegments: 24});
      geo.rotateX(-Math.PI / 2);
      box(g, geo, cer, 0, 0, 0);
      const arc = (y: number, hh: number, m: THREE.Material, open = true): THREE.Mesh => {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, hh, 40, 1, open, 0, Math.PI / 2), m);
        c.scale.set(rx, 1, rz);
        c.position.set(x0, y + hh / 2, z0);
        g.add(c);
        return c;
      };
      glass(arc(T, gh, GLASS));
      arc(h - 0.03, 0.025, ch);
      glass(part(g, 0.008, gh, z0 + d / 2 - 0.015, GLASS, w / 2 - 0.015, T, (-d / 2 + z0) / 2));
      glass(part(g, x0 + w / 2 - 0.015, gh, 0.008, GLASS, (-w / 2 + x0) / 2, T, d / 2 - 0.015));
    } else {
      part(g, w, T, d, cer, 0, 0, 0, 0.015);
      const pw = w / 2 + 0.03;
      glass(part(g, pw, gh, 0.008, GLASS, -w / 2 + pw / 2 + 0.01, T, d / 2 - 0.02));
      glass(part(g, pw, gh, 0.008, GLASS, w / 2 - pw / 2 - 0.03, T, d / 2 - 0.04));
      glass(part(g, 0.008, gh, d - 0.06, GLASS, w / 2 - 0.02, T, -0.01));
      part(g, w, 0.022, 0.022, ch, 0, h - 0.03, d / 2 - 0.03, 0.004);
      part(g, 0.022, 0.022, d, ch, w / 2 - 0.02, h - 0.03, 0, 0.004);
      part(g, 0.022, gh, 0.022, ch, w / 2 - 0.02, T, d / 2 - 0.03, 0.004);
    }
    const x = -w * 0.05;
    const z = -d / 2 + 0.025;
    cyl(g, 0.011, gh - 0.35, ch, x, T + 0.6, z);
    cyl(g, 0.011, 0.22, ch, x, h - 0.25, z + 0.11, {axis: 'z'});
    cyl(g, 0.1, 0.014, ch, x, h - 0.27, z + 0.2);
    part(g, 0.16, 0.06, 0.04, ch, x, T + 0.9, z + 0.01, 0.01);
  },
  // Front-loading washing machine: a panel with a drawer, display and program knob, a door.
  washer(g, p) {
    appliance(g, p, p.v === 'top' ? 'top' : 'washer');
  },
  dryer(g, p) {
    appliance(g, p, 'dryer');
  },
  // ---------- living room: upholstered furniture ----------
  loungeSofa(g, p) {
    sofaBody(g, p);
  },
  loungeChair(g, p) {
    sofaBody(g, p, {pillows: false, A: Math.min(0.17, p.w * 0.19)});
  },
  // Corner sofa with a chaise: the main part along the back (depth foot.back), chaise on the left (width foot.side; mirrored — on the right).
  sofaCorner(g, p) {
    const {w, d, h, color} = p;
    const M = softMats(color);
    const {leg, base, back} = SOFA;
    // the catalog gives this model its arms (foot)
    const {back: B, side: S} = lArms(p)!;
    const A = Math.min(0.2, w * 0.075);
    const AH = Math.min(0.64, h - 0.08);
    const L = -w / 2;
    const Z = -d / 2;
    const k = 0.07;
    sofaLegs(g, M, [
      [L + k, Z + k],
      [w / 2 - k, Z + k],
      [w / 2 - k, Z + B - k],
      [L + S - k, Z + B + k],
      [L + S - k, d / 2 - k],
      [L + k, d / 2 - k],
      [0, Z + k],
      [0, Z + B - k],
    ]);
    part(g, w, base, B, M.frame, 0, leg, Z + B / 2, 0.03);
    part(g, S, base, d - B, M.frame, L + S / 2, leg, Z + B + (d - B) / 2, 0.03);
    part(g, A, AH - leg, B, M.fab, w / 2 - A / 2, leg, Z + B / 2, 0.075);
    part(g, A, AH - leg, d, M.fab, L + A / 2, leg, 0, 0.075);
    part(g, w - 2 * A, h - leg - 0.04, back, M.frame, 0, leg, Z + back / 2, 0.06);
    seatRow(g, M, L + S, w / 2 - A, Z + back, Z + B);
    part(
      g,
      S - A - 0.012,
      SOFA.seat,
      d - back - 0.008,
      M.cush,
      L + A + (S - A) / 2,
      leg + base,
      (Z + back + d / 2) / 2,
      0.055,
    );
    backRow(g, M, L + A, w / 2 - A, Z + back, h);
    pillow(g, M.pil, L + A + 0.27, Z + back + 0.27, 0.25);
    pillow(g, M.pil2, w / 2 - A - 0.27, Z + back + 0.27, -0.2);
  },
  // Sofa bed (pull-out): folded — a sofa; unfolded — the seat slides forward and the back lies down: a flat sleeping place with bedding.
  sofaBed(g, p) {
    const {w, d, h, color} = p;
    // its variants give how far it unfolds, metres
    const ext = extOf(p) as number;
    if (!ext) {
      sofaBody(g, p, {A: Math.min(0.18, w * 0.085)});
      return;
    }
    const M = softMats(color);
    const {leg, base, back} = SOFA;
    const A = Math.min(0.18, w * 0.085);
    const AH = Math.min(0.62, h - 0.1);
    const df = d - ext;
    const Z = -d / 2;
    const k = 0.07;
    const iw = w - 2 * A;
    sofaLegs(g, M, [
      [-w / 2 + k, Z + k],
      [w / 2 - k, Z + k],
      [-w / 2 + k, Z + df - k],
      [w / 2 - k, Z + df - k],
      [-iw / 2 + k, d / 2 - k],
      [iw / 2 - k, d / 2 - k],
    ]);
    part(g, w, base, df, M.frame, 0, leg, Z + df / 2, 0.03);
    part(g, iw - 0.01, base, ext, M.frame, 0, leg, Z + df + ext / 2, 0.03);
    for (const s of [-1, 1]) part(g, A, AH - leg, df, M.fab, s * (w / 2 - A / 2), leg, Z + df / 2, 0.075);
    part(g, iw, seatTop + 0.3 - leg, back, M.frame, 0, leg, Z + back / 2, 0.06);
    const mz0 = Z + back;
    const mz1 = d / 2;
    part(
      g,
      iw - 0.01,
      SOFA.seat,
      (mz1 - mz0) / 2 - 0.004,
      M.cush,
      0,
      leg + base,
      mz0 + (mz1 - mz0) / 4,
      0.05,
    );
    part(
      g,
      iw - 0.01,
      SOFA.seat,
      (mz1 - mz0) / 2 - 0.004,
      M.cush,
      0,
      leg + base,
      mz1 - (mz1 - mz0) / 4,
      0.05,
    );
    const sheet = mat(0xf1eee8, 0.85);
    const duvet = mat(0xdcd6cb, 0.9);
    const ln = mat(0xf6f3ee, 0.85);
    part(g, iw - 0.04, 0.012, mz1 - mz0 - 0.04, sheet, 0, seatTop, (mz0 + mz1) / 2, 0.004);
    part(
      g,
      iw - 0.02,
      0.06,
      (mz1 - mz0) * 0.62,
      duvet,
      0,
      seatTop + 0.005,
      mz1 - (mz1 - mz0) * 0.31 - 0.01,
      0.03,
    );
    const n = iw > 1.2 ? 2 : 1;
    const pw = n > 1 ? (iw - 0.16) / 2 : iw - 0.16;
    for (let i = 0; i < n; i++)
      part(
        g,
        pw,
        0.12,
        0.36,
        ln,
        n > 1 ? (i ? 1 : -1) * (pw / 2 + 0.04) : 0,
        seatTop + 0.01,
        mz0 + 0.22,
        0.06,
      );
  },
  // ---------- bathroom, continued ----------
  // Washbasin: a rectangular bowl with a faucet ledge; wall-mounted with a trap, or on a pedestal.
  basin(g, {w, d, h, v, color}) {
    const cer = ceramic(color);
    const ch = CHROME();
    const T = 0.15;
    const y = h - T;
    const t = 0.028;
    const bk = 0.09;
    const zc = (-d / 2 + bk + d / 2 - t) / 2;
    const iz = d - bk - t;
    part(g, w, 0.04, d, cer, 0, y, 0, 0.014);
    part(g, w, T, bk, cer, 0, y, -d / 2 + bk / 2, 0.02);
    part(g, w, T, t, cer, 0, y, d / 2 - t / 2, 0.014);
    for (const s of [-1, 1]) part(g, t, T, iz + 0.004, cer, s * (w / 2 - t / 2), y, zc, 0.014);
    part(g, w - 2 * t, 0.004, iz, inside(color, 0xeeede8, 0.14), 0, y + 0.04, zc, 0.001);
    cyl(g, 0.017, 0.003, ch, 0, y + 0.044, zc + 0.03, {seg: 20});
    const fz = -d / 2 + bk / 2;
    cyl(g, 0.022, 0.025, ch, 0, h, fz);
    cyl(g, 0.014, 0.13, ch, 0, h + 0.025, fz);
    cyl(g, 0.012, 0.11, ch, 0, h + 0.15, fz + 0.05, {axis: 'z'});
    cyl(g, 0.01, 0.03, ch, 0, h + 0.125, fz + 0.1);
    part(g, 0.012, 0.012, 0.07, ch, 0, h + 0.16, fz - 0.04, 0.004);
    if (v === 'pedestal') box(g, frustum(0.19, y, 0.16, 0.15, 0.12, -0.02), cer, 0, 0, -d / 2 + 0.13);
    else {
      cyl(g, 0.012, 0.07, ch, 0, y - 0.07, zc + 0.03);
      cyl(g, 0.032, 0.13, ch, 0, y - 0.2, zc + 0.03, {rb: 0.03});
      cyl(g, 0.012, zc + 0.03 + d / 2, ch, 0, y - 0.11, (zc + 0.03 - d / 2) / 2, {axis: 'z'});
    }
  },
  // Mirror cabinet: carcass, mirrored doors (one, two or three across the width), lighting underneath.
  mirrorCabinet(g, {w, d, h, color}) {
    const c = hexOf(color);
    const body = mat(shade(c, 0.9));
    const mir = mat(0xeef3f6, 0.04, 0.8);
    const n = w < 0.7 ? 1 : w < 1.05 ? 2 : 3;
    const gap = 0.004;
    const dw = (w - gap * (n + 1)) / n;
    part(g, w, h, d - 0.02, body, 0, 0, -0.01, 0.004);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + gap + dw / 2 + i * (dw + gap);
      part(g, dw, h - 0.008, 0.018, mat(c, 0.5), x, 0.004, d / 2 - 0.009, 0.003);
      part(g, dw - 0.024, h - 0.032, 0.004, mir, x, 0.016, d / 2 + 0.001, 0.001);
    }
    part(g, w - 0.06, 0.006, 0.02, glow(0xfff2dc), 0, -0.004, d / 2 - 0.05, 0.002);
  },
  // Towel warmer: a ladder (two uprights and crossbars) or a serpentine of a single pipe; wall brackets.
  towelRail(g, {w, d, h, v, color = 'chrome'}) {
    const m = finish(color);
    const r = 0.013;
    const zf = d / 2 - 0.03;
    const br = (x: number, y: number): void => {
      cyl(g, 0.009, zf + d / 2, m, x, y, (zf - d / 2) / 2, {axis: 'z', seg: 12});
      cyl(g, 0.022, 0.012, m, x, y, -d / 2 + 0.006, {axis: 'z'});
    };
    if (v === 'snake') {
      const n = Math.max(3, Math.round(h / 0.15));
      const s = (h - 0.06) / (n - 1);
      const Lx = w / 2 - s / 2 - 0.02;
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(serpentine(-Lx, Lx, h - 0.03, 0.03, n, zf), n * 48, r, 10),
        m,
      );
      tube.castShadow = true;
      g.add(tube);
      br(-Lx, h - 0.03);
      br(n % 2 ? Lx : -Lx, 0.03);
    } else {
      const Lx = w / 2 - 0.02;
      const n = Math.max(4, Math.round((h - 0.08) / 0.085));
      for (const s of [-1, 1]) {
        cyl(g, r, h, m, s * Lx, 0, zf);
        br(s * Lx, 0.08);
        br(s * Lx, h - 0.08);
      }
      for (let i = 0; i < n; i++) {
        const y = 0.04 + (i * (h - 0.08)) / (n - 1);
        cyl(g, 0.0095, 2 * Lx, m, 0, y, zf, {axis: 'x', seg: 12});
      }
    }
  },
  // ---------- climate ----------
  // Radiator: sectional (fins) or panel (smooth front, grille on top); pipes to the floor and a thermostatic head on the right.
  radiator(g, p) {
    const {w, d, h, v, color = 'white'} = p;
    const c = hexOf(color);
    const m = mat(c, 0.38);
    const dk = mat(shade(c, 0.72), 0.55);
    const ch = CHROME();
    const lift = zOf(p);
    if (v === 'panel') {
      part(g, w, h, d * 0.42, m, 0, 0, d / 2 - d * 0.21, 0.006);
      part(g, w - 0.004, h - 0.01, d * 0.4, m, 0, 0.005, -d / 2 + d * 0.2 + 0.008, 0.004);
      for (let y = 0.05; y < h - 0.03; y += 0.045)
        part(g, w - 0.012, 0.003, 0.002, dk, 0, y, d / 2 + 0.0005, 0.001);
      part(g, w - 0.02, 0.004, d - 0.02, mat(0x3a3c40, 0.6), 0, h - 0.003, 0, 0.001);
      for (const s of [-1, 1]) part(g, 0.006, h - 0.02, d - 0.01, m, s * (w / 2 - 0.003), 0.01, 0, 0.002);
    } else {
      const n = Math.max(2, Math.round(w / 0.08));
      const sw = w / n;
      for (let i = 0; i < n; i++) part(g, sw - 0.012, h, d - 0.012, m, -w / 2 + sw * (i + 0.5), 0, 0, 0.014);
      for (const y of [0.035, h - 0.035]) cyl(g, 0.016, w - 0.02, dk, 0, y, -0.005, {axis: 'x', seg: 12});
    }
    for (const s of [-1, 1])
      cyl(g, 0.011, lift + 0.02, ch, s * (w / 2 - 0.05), -lift, -d / 2 + 0.025, {seg: 12});
    cyl(g, 0.016, 0.05, ch, w / 2 - 0.05, -0.03, -d / 2 + 0.025, {axis: 'z', seg: 16});
    cyl(g, 0.026, 0.06, mat(0xf3f3f1, 0.4), w / 2 - 0.05, -0.03, -d / 2 + 0.08, {axis: 'z'});
  },
  // Wall-mounted air conditioner: rounded body, front panel, a louvered slot at the bottom, indicator, grille on top.
  aircon(g, {w, d, h, color}) {
    const wh = enamel(color, 0xf5f5f3);
    const dk = mat(0x2b2e32, 0.55);
    part(g, w, h, d, wh, 0, 0, 0, 0.04);
    part(g, w - 0.012, h * 0.6, 0.006, mat(panel(color, 0xfbfbf9), 0.22), 0, h * 0.37, d / 2 + 0.001, 0.005);
    part(g, w - 0.1, 0.03, d * 0.5, dk, 0, -0.001, d * 0.16, 0.008);
    const fl = part(g, w - 0.11, 0.006, 0.075, wh, 0, 0.012, d / 2 - 0.03, 0.002);
    fl.rotation.x = 0.45;
    part(g, 0.045, 0.01, 0.003, glow(0x7fd9ff), w / 2 - 0.11, h * 0.3, d / 2 + 0.004, 0.002);
    part(g, 0.012, 0.01, 0.003, glow(0x9cf0b0), w / 2 - 0.17, h * 0.3, d / 2 + 0.004, 0.002);
    for (let i = 0; i < 5; i++)
      part(g, w - 0.1, 0.003, 0.012, mat(0xd9dad7, 0.5), 0, h - 0.002, -d / 2 + 0.035 + i * 0.03, 0.001);
  },
  // ---------- windows ----------
  // Curtains: a rod, full-width sheer and two drapes — closed (meeting in the middle) or open (gathered at the edges). Height is to the rod.
  // open (0…1) — for curtains from HA (D-048): how far open; the drapes gather toward the edges and the folds get deeper.
  curtains(g, {w, d, h, v, color = 'linen', open}) {
    const c = hexOf(color);
    const cloth = new THREE.MeshStandardMaterial({color: c, roughness: 0.96, side: THREE.DoubleSide});
    const tulle = new THREE.MeshStandardMaterial({
      color: 0xfbfaf6,
      roughness: 0.9,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const rod = mat(0x3b3c3f, 0.35, 0.5);
    const yr = h - 0.035;
    const zr = d / 2 - 0.03;
    const zc = zr - 0.035;
    const zt = -d / 2 + 0.03;
    const drop = h - 0.07;
    cyl(g, 0.011, w, rod, 0, yr, zr, {axis: 'x', seg: 16});
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), rod);
      b.position.set(s * (w / 2 - 0.02), yr, zr);
      g.add(b);
      cyl(g, 0.007, zr + d / 2, rod, s * (w / 2 - 0.12), yr, (zr - d / 2) / 2, {axis: 'z', seg: 10});
    }
    drape(
      g,
      tulle,
      -w / 2 + 0.03,
      w / 2 - 0.03,
      0.015,
      drop - 0.01,
      zt,
      Math.max(6, Math.round(w / 0.08)),
      0.01,
      false,
    );
    const bw = Math.max(0.2, Math.min(0.45, w * 0.15));
    const k = open != null ? 1 - Math.max(0, Math.min(1, open)) : v === 'closed' ? 1 : 0;
    const pw = bw + (w / 2 - 0.014 - bw) * k; // k — how closed they are
    const n = Math.max(4, Math.round(4 + (pw / 0.12 - 4) * k));
    const amp = 0.045 - 0.017 * k;
    drape(g, cloth, -w / 2 + 0.01, -w / 2 + 0.01 + pw, 0.01, drop, zc, n, amp);
    drape(g, cloth, w / 2 - 0.01 - pw, w / 2 - 0.01, 0.01, drop, zc, n, amp);
  },
  // ---------- tables, chairs, floor lamp (instead of Kenney models: any size and color) ----------
  // Coffee table: tabletop, lower shelf, tapered legs; round — an oval sized to fit, on three legs.
  tableCoffee(g, {w, d, h, color, v}) {
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const lg = mat(shade(c, 0.78), 0.55);
    const T = 0.03;
    if (v === 'round') {
      cyl(g, 0.5, T, m, 0, h - T, 0, {sx: w, sz: d, seg: 48});
      cyl(g, 0.5, 0.018, m, 0, 0.12, 0, {sx: w * 0.78, sz: d * 0.78, seg: 40});
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3 + Math.PI / 2;
        const x = Math.cos(a) * w * 0.36;
        const z = Math.sin(a) * d * 0.36;
        cyl(g, 0.018, h - T, lg, x, 0, z, {rb: 0.013, seg: 12});
      }
    } else {
      part(g, w, T, d, m, 0, h - T, 0, 0.01);
      part(g, w - 0.12, 0.018, d - 0.1, m, 0, 0.12, 0, 0.004);
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        cyl(g, 0.019, h - T, lg, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), {rb: 0.013, seg: 12});
    }
  },
  // Round (oval) dining table on a central pedestal with a cross base.
  tableRound(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const lg = mat(shade(c, 0.8), 0.55);
    const T = 0.035;
    cyl(g, 0.5, T, m, 0, h - T, 0, {sx: w, sz: d, seg: 56});
    cyl(g, 0.5, 0.05, mat(shade(c, 0.85), 0.6), 0, h - T - 0.05, 0, {sx: w * 0.86, sz: d * 0.86, seg: 48});
    cyl(g, 0.05, h - T - 0.05, lg, 0, 0, 0, {rb: 0.065, seg: 20});
    for (let i = 0; i < 2; i++) {
      const q = part(g, Math.min(0.62, w * 0.55), 0.05, 0.07, lg, 0, 0, 0, 0.012);
      q.rotation.y = (i * Math.PI) / 2 + Math.PI / 4;
    }
  },
  // Dining chair: tapered legs, a seat with a soft cushion, a back on two posts with a curved rail.
  chairCushion(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const cu = mat(0xd7cfc1, 0.95);
    const S = 0.45;
    const T = 0.025;
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      cyl(g, 0.016, S - T, m, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03), {rb: 0.012, seg: 12});
    part(g, w, T, d, m, 0, S - T, 0, 0.008);
    part(g, w - 0.04, 0.035, d - 0.06, cu, 0, S, 0.01, 0.015);
    for (const sx of [-1, 1]) {
      const q = part(g, 0.022, h - S, 0.022, m, sx * (w / 2 - 0.03), S, -d / 2 + 0.03, 0.006);
      q.rotation.x = -0.08;
    }
    const z = -d / 2 + 0.03 - Math.sin(0.08) * (h - S) * 0.5;
    for (const [y, hh] of [
      [h - 0.12, 0.1],
      [S + 0.2, 0.035],
    ]) {
      const q = part(g, w - 0.05, hh, 0.02, m, 0, y, z + Math.sin(0.08) * (y - S), 0.007);
      q.rotation.x = -0.08;
    }
  },
  // Desk: tabletop, metal U-shaped supports, modesty panel, a drawer pedestal on the right from 1 m.
  desk(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const mt = mat(0x2d2f33, 0.45, 0.4);
    const T = 0.03;
    part(g, w, T, d, m, 0, h - T, 0, 0.006);
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.05);
      part(g, 0.04, h - T, 0.04, mt, x, 0, -d / 2 + 0.06, 0.004);
      part(g, 0.04, h - T, 0.04, mt, x, 0, d / 2 - 0.06, 0.004);
      part(g, 0.04, 0.04, d - 0.08, mt, x, 0, 0, 0.004);
      part(g, 0.03, 0.03, d - 0.08, mt, x, h - T - 0.03, 0, 0.004);
    }
    part(g, w - 0.14, 0.3, 0.016, mat(shade(c, 0.9), 0.6), 0, h - T - 0.3, -d / 2 + 0.06, 0.003);
    if (w >= 1) {
      const dw = 0.4;
      const x = w / 2 - 0.1 - dw / 2;
      const hh = 0.36;
      part(g, dw, hh, d - 0.1, mat(shade(c, 0.92), 0.6), x, h - T - hh, 0, 0.004);
      for (let i = 0; i < 2; i++) {
        const y = h - T - hh + 0.006 + (i * hh) / 2;
        part(g, dw - 0.01, hh / 2 - 0.01, 0.016, m, x, y, d / 2 - 0.05 + 0.008, 0.003);
        part(g, 0.12, 0.01, 0.012, mt, x, y + hh / 4, d / 2 - 0.05 + 0.02, 0.004);
      }
    }
  },
  // Office chair: five-caster star base, gas lift, seat, reclining back, armrests.
  chairDesk(g, {w, d, h, color}) {
    const c = hexOf(color);
    const f = mat(c, 0.92);
    const pl = mat(0x232427, 0.45, 0.3);
    const ch = CHROME();
    const R = Math.min(w, d) / 2 - 0.03;
    const S = 0.47;
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      const x = Math.cos(a) * R;
      const z = Math.sin(a) * R;
      const q = part(g, R, 0.03, 0.045, pl, x / 2, 0.06, z / 2, 0.01);
      q.rotation.y = -a;
      const wh = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), pl);
      wh.position.set(x, 0.03, z);
      g.add(wh);
    }
    cyl(g, 0.05, 0.03, pl, 0, 0.06, 0);
    cyl(g, 0.022, S - 0.16, ch, 0, 0.09, 0, {seg: 16});
    cyl(g, 0.032, 0.12, pl, 0, 0.09, 0, {seg: 16});
    part(g, 0.3, 0.04, 0.3, pl, 0, S - 0.1, 0, 0.01);
    part(g, w - 0.06, 0.09, d * 0.78, f, 0, S - 0.07, 0.03, 0.04);
    const bk = part(g, w - 0.1, h - S - 0.04, 0.07, f, 0, S + 0.06, -d / 2 + 0.07, 0.035);
    bk.rotation.x = -0.12;
    part(g, 0.06, 0.2, 0.03, pl, 0, S - 0.08, -d / 2 + 0.12, 0.01);
    for (const s of [-1, 1]) {
      part(g, 0.025, 0.2, 0.025, pl, s * (w / 2 - 0.05), S - 0.06, 0.02, 0.008);
      part(g, 0.06, 0.025, 0.26, pl, s * (w / 2 - 0.05), S + 0.14, 0.03, 0.012);
    }
  },
  // Floor lamp: heavy base, thin stand, a cone-shaped fabric shade (the color is the shade's).
  lampRoundFloor(g, {w, d, h, color}) {
    const sh = new THREE.MeshStandardMaterial({color: hexOf(color), roughness: 0.95, side: THREE.DoubleSide});
    const mt = mat(0x2b2c2f, 0.4, 0.5);
    const r = Math.min(w, d) / 2;
    const sH = Math.min(0.36, h * 0.24);
    cyl(g, r * 0.62, 0.025, mt, 0, 0, 0, {rb: r * 0.66, seg: 32});
    cyl(g, 0.011, h - sH * 0.6, mt, 0, 0.025, 0, {seg: 12});
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r, sH, 40, 1, true), sh);
    s.position.set(0, h - sH / 2, 0);
    s.castShadow = true;
    g.add(s);
    cyl(g, 0.03, 0.06, mat(0xf4efe4, 0.6), 0, h - sH * 0.75, 0, {seg: 16});
  },
  // Potted plant: a pot with a rim and soil, a rosette of ellipse leaves in different directions (golden angle), shades of green.
  // Plant: monstera, fiddle-leaf fig, palm, snake plant, hydrangea (PLANT above); w×d is the canopy width, the pot is sized from it
  pottedPlant(g, {w, d, h, color = 'white', v = 'monstera'}) {
    const c = hexOf(color);
    (PLANT[v] || PLANT.monstera)(g, {
      D: Math.min(w, d),
      h,
      pm: leafMat(c, color === 'terracotta' ? 0.85 : 0.6),
      rnd: seeded(Math.round(w * 1000) * 31 + Math.round(h * 1000)),
    });
  },
  // Floor vase: a solid of revolution with a neck; dried flowers, eucalyptus or empty (then the whole height is the vase)
  floorVase(g, {w, d, h, color = 'sand', v = 'pampas'}) {
    const D = Math.min(w, d);
    const R = Math.min(0.17, D * (v === 'eucalyptus' ? 0.36 : 0.45));
    const hv = v === 'empty' ? h : Math.min(0.65, h * 0.5);
    vessel(
      g,
      [
        [0, 0],
        [R * 0.55, 0],
        [R * 0.62, 0.01],
        [R, hv * 0.36],
        [R * 0.9, hv * 0.62],
        [R * 0.42, hv * 0.86],
        [R * 0.37, hv * 0.93],
        [R * 0.47, hv],
        [R * 0.4, hv],
        [R * 0.31, hv * 0.93],
        [0, hv * 0.88],
      ],
      leafMat(hexOf(color), 0.5),
    );
    (VASE[v] || VASE.empty)(g, {h, y0: hv, R, rnd: seeded(Math.round(w * 1000) * 17 + Math.round(h * 1000))});
  },
  // Tabletop decor: stands on furniture at its own height (f.z). Books — a stack of 3–4 lying books (covers, a spine, cream pages) with
  // a small ceramic vase on top; vase — a bud vase with eucalyptus; candles — three pillar candles on a tray; bowl — a bowl of fruit.
  // The color is the ceramic (books, vase, bowl) or the tray.
  decor(g, {w, d, h, color = 'white', v = 'books'}) {
    const c = hexOf(color);
    const cer = mat(c, color === 'terracotta' || color === 'sand' ? 0.7 : 0.35);
    const rnd = seeded(Math.round(w * 1000) * 13 + Math.round(d * 1000) * 7 + Math.round(h * 1000));
    const small = (R: number, H: number, y: number, x = 0, z = 0): void => {
      const m = vessel(
        g,
        [
          [0, 0],
          [R * 0.55, 0],
          [R * 0.6, 0.004],
          [R, H * 0.42],
          [R * 0.88, H * 0.7],
          [R * 0.36, H * 0.9],
          [R * 0.42, H],
          [R * 0.34, H],
          [0, H * 0.92],
        ],
        cer,
      );
      m.position.set(x, y, z);
    };
    if (v === 'books') {
      const BK = [0x3e4b60, 0xd9d1c3, 0xa8644b, 0x737c5c, 0x27282b, 0xe9e2d4, 0xb59a72, 0x6f8fa8];
      const pg = mat(0xf1ebdc, 0.85);
      const n = 3 + Math.floor(rnd() * 2);
      const bh = Math.min(0.045, (h * 0.55) / n);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const bw = w * (0.8 + 0.18 * rnd());
        const bd = d * (0.74 + 0.24 * rnd());
        const t = bh * (0.7 + 0.5 * rnd());
        const cv = mat(BK[Math.floor(rnd() * BK.length)], 0.72);
        const b = new THREE.Group();
        part(b, bw, 0.003, bd, cv, 0, 0, 0, 0.001);
        part(b, bw, 0.003, bd, cv, 0, t - 0.003, 0, 0.001);
        part(b, 0.004, t, bd, cv, -bw / 2 + 0.002, 0, 0, 0.001);
        part(b, bw - 0.01, t - 0.006, bd - 0.008, pg, 0.003, 0.003, 0, 0.001);
        b.position.set((rnd() - 0.5) * w * 0.06, y, (rnd() - 0.5) * d * 0.06);
        b.rotation.y = (rnd() - 0.5) * 0.3;
        g.add(b);
        y += t;
      }
      const top = h - y;
      if (top > 0.04) small(Math.min(top * 0.32, w * 0.16, d * 0.24), top, y, w * 0.12, 0);
    } else if (v === 'vase') {
      const R = Math.min(w, d) * 0.3;
      const hv = Math.min(h * 0.42, 0.28);
      vessel(
        g,
        [
          [0, 0],
          [R * 0.62, 0],
          [R * 0.68, 0.006],
          [R, hv * 0.38],
          [R * 0.94, hv * 0.66],
          [R * 0.46, hv * 0.9],
          [R * 0.5, hv],
          [R * 0.42, hv],
          [0, hv * 0.94],
        ],
        cer,
      );
      VASE.eucalyptus(g, {h, y0: hv, R, rnd});
    } else if (v === 'candles') {
      const T = 0.014;
      const rim = 0.008;
      const wax = mat(0xf3eee3, 0.85);
      const wick = mat(0x2a2522, 0.9);
      const r = Math.min(0.04, d * 0.3, w * 0.14);
      part(g, w, T, d, cer, 0, 0, 0, 0.004);
      for (const s2 of [-1, 1]) {
        part(g, w, 0.02, rim, cer, 0, T, s2 * (d / 2 - rim / 2), 0.003);
        part(g, rim, 0.02, d, cer, s2 * (w / 2 - rim / 2), T, 0, 0.003);
      }
      [
        [-0.3, 1],
        [0, 0.72],
        [0.3, 0.5],
      ].forEach(([k, f], i) => {
        const H = (h - T) * f;
        const x = (k * (w - 2 * r - 0.02)) / 0.6;
        const z = (i % 2 ? 0.18 : -0.12) * (d - 2 * r);
        cyl(g, r * (i === 1 ? 0.9 : 1), H, wax, x, T, z, {seg: 28});
        cyl(g, 0.0016, 0.012, wick, x, T + H, z, {seg: 6});
        const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 24), mat(0xe9e2d2, 0.9));
        top.rotation.x = -Math.PI / 2;
        top.position.set(x, T + H + 0.0005, z);
        g.add(top);
      });
    } else if (v === 'dish') {
      const R = Math.min(w, d) / 2;
      const H = Math.min(h, R * 0.4);
      vessel(
        g,
        [
          [0, 0],
          [R * 0.5, 0],
          [R * 0.55, 0.005],
          [R * 0.86, H * 0.5],
          [R, H],
          [R - 0.006, H],
          [R * 0.82, H * 0.55],
          [R * 0.45, H * 0.18],
          [0, H * 0.15],
        ],
        cer,
      );
    } else {
      const R = Math.min(w, d) / 2;
      const H = Math.min(h * 0.5, R * 0.55);
      vessel(
        g,
        [
          [0, 0],
          [R * 0.42, 0],
          [R * 0.46, 0.006],
          [R * 0.8, H * 0.45],
          [R, H],
          [R - 0.006, H],
          [R * 0.78, H * 0.5],
          [R * 0.4, H * 0.14],
          [0, H * 0.12],
        ],
        cer,
      );
      const F = [0xe08a2e, 0xe8cf4a, 0x9bb53f, 0xb8322f, 0xe08a2e];
      const fr = Math.min(R * 0.3, 0.045);
      F.forEach((col, i) => {
        const a = i * 2.4;
        const rr = i === 4 ? 0 : R * 0.42;
        const q = new THREE.Mesh(new THREE.SphereGeometry(fr * (i === 1 ? 0.85 : 1), 18, 14), mat(col, 0.45));
        q.scale.y = i === 1 ? 1.25 : 0.92;
        q.position.set(Math.cos(a) * rr, H * 0.35 + fr * (i === 4 ? 1.6 : 0.9), Math.sin(a) * rr);
        q.rotation.z = i === 1 ? 1.2 : 0;
        q.castShadow = true;
        g.add(q);
      });
    }
  },
  // ---------- on the wall ----------
  // Floating shelf: a board with hidden mounting, the end edge slightly lighter.
  wallShelf(g, {w, d, h, color}) {
    const c = hexOf(color);
    part(g, w, h, d, mat(c, 0.55), 0, 0, 0, 0.004);
    part(g, w - 0.004, 0.002, d - 0.004, mat(shade(c, 1.06), 0.55), 0, h - 0.001, 0.001, 0.001);
  },
  // Coat rack: a rail with hooks (every ~15 cm), with a shelf on top if selected.
  coatHooks(g, {w, d, h, color, v}) {
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const mt = mat(0x2b2c2f, 0.4, 0.5);
    const n = Math.max(2, Math.round(w / 0.15));
    const sh = v !== 'hooks';
    const ph = sh ? h - 0.025 : Math.min(0.12, h);
    const py = sh ? 0 : (h - ph) / 2;
    const y = sh ? 0.07 : py + ph / 2;
    const L = Math.min(0.1, d - 0.04); // with a shelf — hooks at the bottom of the rail, visible from under the shelf
    part(g, w, ph, 0.022, m, 0, py, -d / 2 + 0.011, 0.004);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w * (i + 0.5)) / n;
      cyl(g, 0.007, L, mt, x, y, -d / 2 + 0.022 + L / 2, {axis: 'z', seg: 10});
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), mt);
      b.position.set(x, y + 0.008, -d / 2 + 0.022 + L);
      g.add(b);
    }
    if (sh) {
      part(g, w, 0.025, d, m, 0, h - 0.025, 0, 0.004);
      for (const s2 of [-1, 1])
        box(
          g,
          frustum(0.02, 0.12, 0.02, 0.02, d - 0.04, (d - 0.04) / 2 - 0.01),
          m,
          s2 * (w / 2 - 0.06),
          h - 0.145,
          -d / 2 + 0.032,
        );
    } // brackets: narrow at the wall, under the whole shelf at the top
  },
  // Framed mirror: rectangular, round (an oval sized to fit) or arched.
  wallMirror(g, {w, d, h, color, v}) {
    const fr = color === 'chrome' ? CHROME() : mat(hexOf(color), 0.5, color === 'black' ? 0.3 : 0);
    const mir = mat(0xeef3f6, 0.04, 0.8);
    const F = Math.min(0.03, w * 0.06);
    const z = -d / 2;
    if (v === 'round') {
      cyl(g, 0.5, d, fr, 0, h / 2, 0, {axis: 'z', sx: w, sz: h, seg: 56});
      cyl(g, 0.5, 0.004, mir, 0, h / 2, d / 2, {axis: 'z', sx: w - 2 * F, sz: h - 2 * F, seg: 56});
    } else if (v === 'arch') {
      const sh = (W: number, H: number): THREE.Shape => {
        const r = W / 2;
        const s = new THREE.Shape();
        s.moveTo(-r, 0);
        s.lineTo(r, 0);
        s.lineTo(r, H - r);
        s.absarc(0, H - r, r, 0, Math.PI, false);
        s.lineTo(-r, 0);
        return s;
      };
      const a = new THREE.Mesh(
        new THREE.ExtrudeGeometry(sh(w, h), {depth: d, bevelEnabled: false, curveSegments: 32}),
        fr,
      );
      a.position.z = z;
      a.castShadow = true;
      g.add(a);
      const b = new THREE.Mesh(
        new THREE.ExtrudeGeometry(sh(w - 2 * F, h - 2 * F), {
          depth: 0.004,
          bevelEnabled: false,
          curveSegments: 32,
        }),
        mir,
      );
      b.position.set(0, F, d / 2 - 0.001);
      g.add(b);
    } else {
      part(g, w, h, d, fr, 0, 0, 0, 0.004);
      part(g, w - 2 * F, h - 2 * F, 0.004, mir, 0, F, d / 2, 0.001);
    }
  },
  // ---------- kids' room ----------
  // Crib: posts, rails, dense bars along the long sides, solid headboards, mattress at 35 cm.
  crib(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.5);
    const P = 0.045;
    const Y = 0.32;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) part(g, P, h, P, m, sx * (w / 2 - P / 2), 0, sz * (d / 2 - P / 2), 0.012);
    for (const sz of [-1, 1]) {
      part(g, w - P, 0.035, 0.035, m, 0, h - 0.04, sz * (d / 2 - 0.0175), 0.01);
      part(g, w - P, 0.05, 0.03, m, 0, Y - 0.03, sz * (d / 2 - 0.015), 0.008);
      const n = Math.max(6, Math.round((w - P * 2) / 0.075));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + P + ((i + 0.5) * (w - 2 * P)) / n;
        cyl(g, 0.011, h - 0.04 - Y - 0.02, m, x, Y + 0.02, sz * (d / 2 - 0.0175), {seg: 10});
      }
    }
    for (const sx of [-1, 1]) part(g, 0.025, h - 0.1, d - 2 * P, m, sx * (w / 2 - 0.0175), 0.08, 0, 0.01);
    part(g, w - 0.09, 0.1, d - 0.09, mat(0xf6f4ef, 0.85), 0, Y, 0, 0.03);
    part(g, (w - 0.1) * 0.5, 0.03, d - 0.1, mat(PASTEL[3], 0.9), (w - 0.1) * 0.22, Y + 0.1, 0, 0.012);
  },
  // Bunk bed: posts, two beds with bedding, guard rails on top (in front — up to the ladder), ladder at the front right.
  bunkBed(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const P = 0.06;
    const Y1 = 0.2;
    const Y2 = Math.min(1.2, h - 0.42);
    const L = -w / 2 + P;
    const R = w / 2 - P;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) part(g, P, h, P, m, sx * (w / 2 - P / 2), 0, sz * (d / 2 - P / 2), 0.012);
    for (const y of [Y1, Y2]) {
      for (const sz of [-1, 1]) part(g, w - 2 * P, 0.14, 0.03, m, 0, y, sz * (d / 2 - 0.015), 0.006);
      for (const sx of [-1, 1]) part(g, 0.03, 0.14, d - 2 * P, m, sx * (w / 2 - 0.015), y, 0, 0.006);
    }
    bedding(g, L + 0.01, R - 0.01, -d / 2 + 0.04, d / 2 - 0.04, Y1 + 0.08, 0);
    bedding(g, L + 0.01, R - 0.01, -d / 2 + 0.04, d / 2 - 0.04, Y2 + 0.08, 3);
    for (const sx of [-1, 1])
      part(g, 0.025, h - Y2 - 0.14 - 0.03, d - 2 * P, m, sx * (w / 2 - 0.0125), Y2 + 0.14, 0, 0.006); // upper bunk end panels
    for (const sx of [-1, 1]) part(g, 0.025, 0.5, d - 2 * P, m, sx * (w / 2 - 0.0125), Y1 + 0.14, 0, 0.006); // lower bunk end panels
    const gr = Y2 + 0.34;
    part(g, w - 2 * P, 0.05, 0.03, m, 0, gr, -d / 2 + 0.015, 0.008);
    const lx0 = R - 0.42;
    part(g, lx0 - L, 0.05, 0.03, m, (L + lx0) / 2, gr, d / 2 - 0.015, 0.008);
    for (const x of [lx0, R - 0.02]) part(g, 0.04, gr + 0.05, 0.035, m, x, 0, d / 2 + 0.0, 0.008);
    for (let y = 0.3; y < gr; y += 0.27)
      cyl(g, 0.014, R - 0.02 - lx0, m, (lx0 + R - 0.02) / 2, y, d / 2, {axis: 'x', seg: 12});
  },
  // Loft bed: the bed on top (bottom is “Above floor”), posts and a ladder to the floor; free space below fits a desk.
  loftBed(g, p) {
    const {w, d, h, color} = p;
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const P = 0.06;
    const Z = zOf(p);
    const L = -w / 2 + P;
    const R = w / 2 - P;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        part(g, P, Z + h, P, m, sx * (w / 2 - P / 2), -Z, sz * (d / 2 - P / 2), 0.012);
    for (const sz of [-1, 1]) part(g, w - 2 * P, 0.14, 0.03, m, 0, 0, sz * (d / 2 - 0.015), 0.006);
    for (const sx of [-1, 1]) part(g, 0.03, 0.14, d - 2 * P, m, sx * (w / 2 - 0.015), 0, 0, 0.006);
    bedding(g, L + 0.01, R - 0.01, -d / 2 + 0.04, d / 2 - 0.04, 0.08, 1);
    for (const sx of [-1, 1]) part(g, 0.025, h - 0.14, d - 2 * P, m, sx * (w / 2 - 0.0125), 0.14, 0, 0.006);
    part(g, w - 2 * P, 0.05, 0.03, m, 0, h - 0.05, -d / 2 + 0.015, 0.008);
    const lx0 = R - 0.42;
    part(g, lx0 - L, 0.05, 0.03, m, (L + lx0) / 2, h - 0.05, d / 2 - 0.015, 0.008);
    for (const x of [lx0, R - 0.02]) part(g, 0.04, Z + h, 0.035, m, x, -Z, d / 2, 0.008);
    for (let y = -Z + 0.3; y < h - 0.1; y += 0.27)
      cyl(g, 0.014, R - 0.02 - lx0, m, (lx0 + R - 0.02) / 2, y, d / 2, {axis: 'x', seg: 12});
  },
  // Changing dresser: a dresser with drawers, rails and a soft pad on top.
  changer(g, p) {
    const {w, d, h, color} = p;
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const T = 0.12;
    drawers(g, {...p, h: h - T}, 3);
    part(g, w, T, 0.02, m, 0, h - T, -d / 2 + 0.01, 0.005);
    for (const s of [-1, 1]) part(g, 0.02, T, d - 0.02, m, s * (w / 2 - 0.01), h - T, 0.01, 0.005);
    part(
      g,
      Math.min(0.72, w - 0.06),
      0.06,
      d - 0.06,
      mat(PASTEL[1], 0.9),
      -(w - 0.06 - Math.min(0.72, w - 0.06)) / 2,
      h - T,
      0.01,
      0.028,
    );
  },
  // High chair: splayed legs, seat, back, footrest, tray in front.
  highChair(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.5);
    const S = 0.56;
    const sw = 0.36;
    const sd = 0.34;
    const wh = mat(0xf7f6f2, 0.4);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        rod(
          g,
          [sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03)],
          [sx * (sw / 2 - 0.03), S, sz * (sd / 2 - 0.03) - 0.02],
          0.016,
          m,
        );
    rod(g, [-(w / 2 - 0.09), 0.24, d / 2 - 0.13], [w / 2 - 0.09, 0.24, d / 2 - 0.13], 0.014, m);
    part(g, sw, 0.035, sd, m, 0, S, -0.02, 0.01);
    part(g, sw - 0.04, 0.03, sd - 0.04, mat(PASTEL[2], 0.9), 0, S + 0.035, -0.02, 0.012);
    const bk = part(g, sw, h - S - 0.05, 0.03, m, 0, S + 0.03, -0.02 - sd / 2 + 0.02, 0.01);
    bk.rotation.x = -0.12;
    for (const s of [-1, 1]) part(g, 0.03, 0.16, sd - 0.06, m, s * (sw / 2 - 0.015), S + 0.035, 0, 0.008);
    part(g, sw + 0.1, 0.025, 0.2, wh, 0, S + 0.2, sd / 2 + 0.03, 0.01);
    part(g, sw + 0.1, 0.025, 0.02, wh, 0, S + 0.225, sd / 2 + 0.12, 0.006);
  },
  // Toy storage: a frame, pastel bins in two or three rows (open at the top), a shelf on top.
  toyStorage(g, {w, d, h, color, v}) {
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const t = 0.018;
    const n = Math.max(1, Math.round((w - 2 * t) / 0.42));
    const rows = Math.max(1, Math.round((h - 0.06) / 0.24));
    const bw = (w - 2 * t - (n - 1) * t) / n;
    const bh = (h - 0.04 - t) / rows;
    for (const s of [-1, 1]) part(g, t, h, d, m, s * (w / 2 - t / 2), 0, 0, 0.004);
    part(g, w, t, d, m, 0, h - t, 0, 0.004);
    part(g, w - 2 * t, t, d - 0.02, m, 0, 0.03, 0, 0.003);
    for (let i = 1; i < n; i++)
      part(g, t, h - t - 0.03, d - 0.02, m, -w / 2 + t + i * (bw + t) - t / 2, 0.03, 0, 0.003);
    const BINS = v === 'neutral' ? [0xd9d1c3, 0xb9a184, 0x9aa293, 0x8d9095, 0xe9e2d4] : PASTEL;
    let k = 0;
    for (let r = 0; r < rows; r++)
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + t + bw / 2 + i * (bw + t);
        const y = 0.03 + t + r * bh;
        const bc = BINS[k++ % BINS.length];
        part(g, bw - 0.02, bh - 0.03, d - 0.05, mat(bc, 0.6), x, y + 0.005, 0.01, 0.012);
        part(g, bw - 0.05, 0.004, d - 0.08, mat(shade(bc, 0.72), 0.7), x, y + bh - 0.025, 0.01, 0.002);
      }
  },
  // ---------- workspace ----------
  // Corner desk: L-shaped tabletop, supports at the corners, back panels.
  deskCorner(g, p) {
    const {w, d, h, color} = p;
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const mt = mat(0x2d2f33, 0.45, 0.4);
    const T = 0.03;
    // the catalog gives this model its arms (foot)
    const {back: A, side: S} = lArms(p)!;
    const L = -w / 2;
    const B = -d / 2;
    part(g, w, T, A, m, 0, h - T, B + A / 2, 0.006);
    part(g, S, T, d - A, m, L + S / 2, h - T, B + A + (d - A) / 2, 0.006);
    for (const [x, z] of [
      [L + 0.04, B + 0.04],
      [w / 2 - 0.04, B + 0.04],
      [w / 2 - 0.04, B + A - 0.04],
      [L + 0.04, d / 2 - 0.04],
      [L + S - 0.04, d / 2 - 0.04],
    ])
      part(g, 0.045, h - T, 0.045, mt, x, 0, z, 0.006);
    part(g, w - 0.1, 0.28, 0.016, mat(shade(c, 0.9), 0.6), 0, h - T - 0.28, B + 0.06, 0.003);
    part(g, 0.016, 0.28, d - 0.1, mat(shade(c, 0.9), 0.6), L + 0.06, h - T - 0.28, 0, 0.003);
  },
  // Height-adjustable desk: two telescopic columns on feet, a crossbar, a control panel at the side of the tabletop.
  deskStanding(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const mt = mat(0x2d2f33, 0.4, 0.45);
    const mt2 = mat(0x3d3f44, 0.4, 0.45);
    const T = 0.025;
    const fH = 0.04;
    part(g, w, T, d, m, 0, h - T, 0, 0.008);
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.12);
      part(g, 0.07, fH, d - 0.05, mt, x, 0, 0, 0.012);
      const hh = h - T - 0.03 - fH;
      const lo = Math.min(0.5, hh * 0.55);
      part(g, 0.07, lo, 0.05, mt, x, fH, 0, 0.006);
      part(g, 0.06, hh - lo + 0.02, 0.042, mt2, x, fH + lo - 0.02, 0, 0.006);
      part(g, 0.05, 0.03, d - 0.12, mt, x, h - T - 0.03, 0, 0.006);
    }
    part(g, w - 0.3, 0.04, 0.05, mt, 0, h - T - 0.06, -0.02, 0.006);
    part(g, 0.12, 0.02, 0.04, mat(0x16171a, 0.3), w / 2 - 0.2, h - T - 0.02, d / 2 - 0.02, 0.006);
  },
  // Mobile pedestal: three drawers, on casters.
  pedestal(g, {w, d, h, color}) {
    const c = hexOf(color);
    const body = mat(shade(c, 0.88), 0.55);
    const fr = mat(c, 0.5);
    const mt = mat(0x2b2c2f, 0.4, 0.4);
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const wh = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), mt);
      wh.position.set(sx * (w / 2 - 0.04), 0.022, sz * (d / 2 - 0.05));
      g.add(wh);
    }
    part(g, w, h - 0.045, d - 0.02, body, 0, 0.045, -0.01, 0.004);
    const hs = [0.25, 0.25, 0.5];
    let y = 0.045 + 0.004;
    for (const f of hs) {
      const hh = (h - 0.053) * f - 0.004;
      part(g, w - 0.008, hh, 0.016, fr, 0, y, d / 2 - 0.008, 0.003);
      part(g, Math.min(0.2, w * 0.45), 0.01, 0.012, mt, 0, y + hh - 0.035, d / 2 + 0.006, 0.004);
      y += hh + 0.004;
    }
  },
  // Monitor: a thin screen with a bezel; on a stand — a base, on an arm — a clamp at the rear edge of the desk and the arm.
  monitor(g, {w, d, h, v, color}) {
    const blk = color === 'black';
    const bd = blk ? mat(0x1b1c1f, 0.35) : finish(color);
    const sc = mat(0x07080b, 0.1);
    const mt = blk ? mat(0x2b2c2f, 0.35, 0.5) : METAL();
    const sh = h * 0.72;
    const sy = h - sh;
    const zs = d / 2 - 0.02;
    part(g, w, sh, 0.018, bd, 0, sy, zs, 0.006);
    part(g, w - 0.016, sh - 0.016, 0.003, sc, 0, sy + 0.008, zs + 0.009, 0.001);
    part(g, w * 0.4, sh * 0.5, 0.025, bd, 0, sy + sh * 0.25, zs - 0.02, 0.01);
    if (v === 'arm') {
      part(g, 0.05, 0.12, 0.06, mt, 0, -0.06, -d / 2 + 0.03, 0.008);
      cyl(g, 0.015, sy + 0.06, mt, 0, 0, -d / 2 + 0.03, {seg: 12});
      rod(g, [0, sy, -d / 2 + 0.03], [0, sy + sh * 0.4, zs - 0.035], 0.014, mt);
    } else {
      part(g, 0.24, 0.012, Math.min(0.18, d - 0.01), mt, 0, 0, 0, 0.004);
      const q = part(g, 0.04, sy + sh * 0.4, 0.025, mt, 0, 0, -0.02, 0.006);
      q.rotation.x = 0.08;
    }
  },
  // ---------- laundry ----------
  // Laundry basket: woven walls (ribs), a lid with a handle.
  // Laundry basket: a woven body narrowing to the bottom in bands of two tones (the weave), a thick rim, a linen liner folded
  // over it, a handle hole on each short side. (Vertical ribs read as a radiator.)
  laundryBasket(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.92);
    const dk = mat(shade(c, 0.84), 0.95);
    const liner = mat(color === 'linen' || color === 'white' ? 0xf1ece2 : 0xe2dccf, 0.95);
    const H = h - 0.03;
    const k = 0.86;
    box(g, frustum(w * k, H, d * k, w - 0.012, d - 0.012, 0), m, 0, 0, 0);
    for (let y = 0.03; y < H - 0.03; y += 0.045) {
      const t = y / H;
      const bw = w * k + (w - 0.012 - w * k) * t;
      const bd = d * k + (d - 0.012 - d * k) * t;
      part(g, bw + 0.006, 0.018, bd + 0.006, dk, 0, y, 0, 0.008);
    }
    part(g, w, 0.03, d, m, 0, H - 0.01, 0, 0.014);
    part(g, w + 0.012, 0.07, d + 0.012, liner, 0, H - 0.05, 0, 0.02);
    for (const s2 of [-1, 1]) {
      const q = part(g, 0.006, 0.035, 0.1, mat(0x3a332b, 0.9), s2 * (w / 2 + 0.004), H - 0.12, 0, 0.012);
    }
  },
  // Drying rack: unfolded — a center and two wings on crossed legs; folded — a flat frame.
  dryingRack(g, {w, d, h, v, color = 'white'}) {
    const m = color === 'chrome' ? CHROME() : mat(tone(color, {white: 0xf2f2f0}), 0.4);
    const r = 0.006;
    const t = 0.01;
    if (v === 'folded') {
      for (const s of [-1, 1]) cyl(g, t, h, m, s * (w / 2 - 0.02), 0, 0, {seg: 10});
      for (let y = 0.1; y < h - 0.05; y += 0.06) cyl(g, r, w - 0.04, m, 0, y, 0, {axis: 'x', seg: 8});
      return;
    }
    const cw = w * 0.5;
    const y = h - 0.02;
    for (const s of [-1, 1]) {
      rod(g, [(s * cw) / 2, y, -d / 2 + 0.02], [(s * cw) / 2, y, d / 2 - 0.02], t, m);
      rod(g, [(s * cw) / 2, y, -d / 2 + 0.02], [s * (w / 2 - 0.02), y - 0.25, -d / 2 + 0.02], t, m);
      rod(g, [(s * cw) / 2, y, d / 2 - 0.02], [s * (w / 2 - 0.02), y - 0.25, d / 2 - 0.02], t, m);
      for (const z of [-1, 1])
        rod(
          g,
          [s * (cw / 2 - 0.04), 0, z * (d / 2 - 0.02)],
          [s * (cw / 2 - 0.04), y, -z * (d / 2 - 0.02)],
          t,
          m,
        );
    }
    for (let z = -d / 2 + 0.05; z < d / 2 - 0.03; z += 0.055) cyl(g, r, cw, m, 0, y, z, {axis: 'x', seg: 8});
    for (const s of [-1, 1])
      for (let k = 0.06; k < 1; k += 0.16) {
        const x = s * (cw / 2 + (w / 2 - 0.02 - cw / 2) * k);
        const yy = y - 0.25 * k;
        cyl(g, r, d - 0.04, m, x, yy, 0, {axis: 'z', seg: 8});
      }
  },
  // Ironing board: a board with a nose on X-legs and an iron rest; folded — stands upright against the wall.
  ironingBoard(g, {w, d, h, v, color}) {
    const cv = mat(hexOf(color), 0.95);
    const mt = mat(0xc9ccd0, 0.3, 0.6);
    const T = 0.025;
    const shape = (L: number, W: number): THREE.Shape => {
      const s = new THREE.Shape();
      const r = W / 2;
      s.moveTo(-L / 2, -r);
      s.lineTo(L / 2 - W * 1.2, -r);
      s.quadraticCurveTo(L / 2, -r * 0.6, L / 2, 0);
      s.quadraticCurveTo(L / 2, r * 0.6, L / 2 - W * 1.2, r);
      s.lineTo(-L / 2, r);
      s.lineTo(-L / 2, -r);
      return s;
    };
    if (v === 'folded') {
      const b = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape(h, w), {depth: T, bevelEnabled: false, curveSegments: 20}),
        cv,
      );
      b.rotation.z = Math.PI / 2;
      b.position.set(0, h / 2, -d / 2 + 0.01);
      b.castShadow = true;
      g.add(b);
      for (const s of [-1, 1])
        rod(g, [s * 0.1, 0.02, d / 2 - 0.02], [-s * 0.1, h - 0.2, d / 2 - 0.02], 0.01, mt);
      return;
    }
    const b = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape(w - 0.02, d), {depth: T, bevelEnabled: false, curveSegments: 20}),
      cv,
    );
    b.rotation.x = -Math.PI / 2;
    b.position.set(0, h - T, 0);
    b.castShadow = true;
    g.add(b);
    for (const s of [-1, 1]) {
      rod(g, [-w * 0.3, 0, s * (d / 2 - 0.02)], [w * 0.16, h - T, s * (d / 2 - 0.1)], 0.011, mt);
      rod(g, [w * 0.16, 0, s * (d / 2 - 0.02)], [-w * 0.3, h - T, s * (d / 2 - 0.1)], 0.011, mt);
    }
    cyl(g, 0.01, d - 0.04, mt, -w * 0.3, 0.012, 0, {axis: 'z', seg: 10});
    cyl(g, 0.01, d - 0.04, mt, w * 0.16, 0.012, 0, {axis: 'z', seg: 10});
    part(g, 0.14, 0.008, d * 0.8, mt, -w / 2 + 0.07, h - T - 0.01, 0, 0.003);
  },
  // Robot vacuum with a dock: the dock at the wall, a round robot with a bumper and a top sensor in front of it.
  robotVacuum(g, {w, d, h, color}) {
    const c = tone(color, {black: 0x2a2b2e, white: 0xf3f3f1});
    const m = mat(c, 0.3);
    const dk = mat(0x1d1e21, 0.4);
    const bh = Math.max(0.1, h);
    const r = Math.min(w / 2, (d - 0.12) / 2) - 0.005;
    part(g, Math.min(w, 0.3), bh, 0.12, m, 0, 0, -d / 2 + 0.06, 0.02);
    part(g, Math.min(w, 0.3) - 0.04, 0.025, 0.004, dk, 0, bh * 0.55, -d / 2 + 0.122, 0.003);
    const z = d / 2 - r - 0.005;
    cyl(g, r, 0.08, m, 0, 0.01, z, {seg: 40});
    cyl(g, r + 0.003, 0.03, dk, 0, 0.012, z, {seg: 40});
    cyl(g, 0.04, 0.018, dk, 0, 0.09, z - r * 0.3, {seg: 24});
  },
  // ---------- storage ----------
  // Corner wardrobe: L-shaped, doors on the inner sides.
  wardrobeCorner(g, p) {
    const {w, d, h, color} = p;
    const c = hexOf(color);
    const body = mat(shade(c, 0.82));
    const front = mat(c, 0.55);
    const mt = mat(0x3c3e42, 0.4);
    // the catalog gives this model its arms (foot)
    const {back: A, side: S} = lArms(p)!;
    const L = -w / 2;
    const B = -d / 2;
    const P = 0.06;
    const gap = 0.004;
    part(g, w, h - P, A - 0.02, body, 0, P, B + (A - 0.02) / 2, 0.004);
    part(
      g,
      S - 0.02,
      h - P,
      d - A + 0.02,
      body,
      L + (S - 0.02) / 2,
      P,
      B + A - 0.02 + (d - A + 0.02) / 2,
      0.004,
    );
    part(g, w - 0.04, P, A - 0.05, mat(shade(c, 0.6)), 0, 0, B + (A - 0.05) / 2, 0.002);
    part(g, S - 0.05, P, d - A, mat(shade(c, 0.6)), L + (S - 0.05) / 2, 0, B + A + (d - A) / 2 - 0.02, 0.002);
    const lb = w / 2 - (L + S - 0.02);
    const n = Math.max(1, Math.round(lb / 0.5));
    const dw = (lb - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      const x = L + S - 0.02 + gap + dw / 2 + i * (dw + gap);
      part(g, dw, h - P - 2 * gap, 0.018, front, x, P + gap, B + A - 0.011, 0.003);
      part(g, 0.012, Math.min(0.35, h * 0.2), 0.02, mt, x - dw / 2 + 0.04, h * 0.42, B + A + 0.008, 0.005);
    }
    const ls = d / 2 - (B + A - 0.02);
    const m2 = Math.max(1, Math.round(ls / 0.5));
    const dl = (ls - gap * (m2 + 1)) / m2;
    for (let i = 0; i < m2; i++) {
      const z = B + A - 0.02 + gap + dl / 2 + i * (dl + gap);
      part(g, 0.018, h - P - 2 * gap, dl, front, L + S - 0.011, P + gap, z, 0.003);
      part(g, 0.02, Math.min(0.35, h * 0.2), 0.012, mt, L + S + 0.008, h * 0.42, z + dl / 2 - 0.04, 0.005);
    }
  },
  // Walk-in closet section: side panels, a shelf on top, a rail with clothes on hangers, a shoe shelf at the bottom.
  openWardrobe(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const t = 0.02;
    const ch = CHROME();
    for (const s of [-1, 1]) part(g, t, h, d, m, s * (w / 2 - t / 2), 0, 0, 0.004);
    part(g, w - 2 * t, t, d, m, 0, h - 0.3, 0, 0.003);
    part(g, w - 2 * t, t, d, m, 0, h - t, 0, 0.003);
    part(g, w - 2 * t, t, d, m, 0, 0.12, 0, 0.003);
    const ry = h - 0.36;
    cyl(g, 0.012, w - 2 * t, ch, 0, ry, 0, {axis: 'x', seg: 12});
    clothes(g, -w / 2 + t + 0.05, w / 2 - t - 0.05, ry, d - 0.12);
    for (let i = 0; i < Math.floor((w - 2 * t) / 0.3); i++) {
      const sx = -w / 2 + t + 0.15 + i * 0.3;
      part(g, 0.1, 0.09, 0.26, mat(i % 2 ? 0x2b2c2f : 0xa58a6a, 0.6), sx - 0.03, 0.14, 0, 0.03);
      part(g, 0.1, 0.09, 0.26, mat(i % 2 ? 0x2b2c2f : 0xa58a6a, 0.6), sx + 0.07, 0.14, 0, 0.03);
    }
  },
  // Utility cabinet: tall, doors with ventilation slots (a vacuum and mops inside).
  utilityCabinet(g, {w, d, h, color}) {
    const c = hexOf(color);
    const body = mat(shade(c, 0.82));
    const front = mat(c, 0.55);
    const dk = mat(shade(c, 0.6), 0.6);
    const mt = mat(0x3c3e42, 0.4);
    const n = w > 0.75 ? 2 : 1;
    const gap = 0.004;
    const dw = (w - gap * (n + 1)) / n;
    part(g, w - 0.04, 0.06, d - 0.05, mat(shade(c, 0.6)), 0, 0, -0.02, 0.002);
    part(g, w, h - 0.06, d - 0.02, body, 0, 0.06, -0.01, 0.004);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + gap + dw / 2 + i * (dw + gap);
      part(g, dw, h - 0.068, 0.018, front, x, 0.064, d / 2 - 0.009, 0.003);
      for (const y0 of [0.18, h - 0.35])
        for (let k = 0; k < 6; k++)
          part(g, dw * 0.6, 0.008, 0.004, dk, x, y0 + k * 0.025, d / 2 + 0.001, 0.002);
      part(g, 0.012, 0.3, 0.02, mt, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.04), h * 0.45, d / 2 + 0.01, 0.005);
    }
  },
  // Display cabinet: carcass, glass doors, shelves with dishes.
  displayCabinet(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.5);
    const t = 0.022;
    const plate = mat(0xf6f4ef, 0.25);
    const gl = mat(0xdfe8ec, 0.1);
    part(g, w, 0.08, d - 0.03, mat(shade(c, 0.7)), 0, 0, -0.01, 0.003);
    for (const s of [-1, 1]) part(g, t, h - 0.08, d, m, s * (w / 2 - t / 2), 0.08, 0, 0.004);
    part(g, w, t, d, m, 0, h - t, 0, 0.004);
    part(g, w - 2 * t, h - 0.1, 0.008, mat(shade(c, 0.62)), 0, 0.08, -d / 2 + 0.004, 0.002);
    const n = Math.max(3, Math.round((h - 0.1) / 0.38));
    for (let i = 0; i < n; i++) {
      const y = 0.08 + (i * (h - 0.1)) / n;
      if (i) glass(part(g, w - 2 * t, 0.012, d - 0.03, GLASS, 0, y, 0, 0.002));
      else part(g, w - 2 * t, 0.015, d - 0.03, m, 0, y, 0, 0.002);
      if (i) {
        for (let x = -w / 2 + t + 0.08; x < w / 2 - t - 0.06; x += 0.13) {
          cyl(g, 0.06, 0.012, plate, x, y + 0.015, -0.02, {seg: 24});
          cyl(g, 0.035, 0.09, i % 2 ? gl : plate, x + 0.05, y + 0.015, 0.06, {rb: 0.03, seg: 16});
        }
      }
    }
    const dn = w > 0.9 ? 2 : 1;
    const dw = (w - 0.01) / dn;
    for (let i = 0; i < dn; i++) {
      const x = -w / 2 + 0.005 + dw * (i + 0.5);
      glass(part(g, dw - 0.006, h - 0.12, 0.006, GLASS, x, 0.09, d / 2 - 0.004, 0.002));
      for (const s of [-1, 1])
        part(g, 0.025, h - 0.12, 0.02, m, x + s * (dw / 2 - 0.0155), 0.09, d / 2 - 0.01, 0.003);
      part(g, dw - 0.006, 0.025, 0.02, m, x, 0.09, d / 2 - 0.01, 0.003);
      part(g, dw - 0.006, 0.025, 0.02, m, x, h - 0.055, d / 2 - 0.01, 0.003);
    }
  },
  // Sideboard: on legs, a row of doors, thin handles.
  sideboard(g, p) {
    const {w, d, h, color} = p;
    const c = hexOf(color);
    const m = mat(c, 0.5);
    const body = mat(shade(c, 0.85), 0.55);
    const mt = mat(0x2b2c2f, 0.4, 0.4);
    const L = zOf(p) > 0 ? 0 : 0.16;
    const n = Math.max(2, Math.round(w / 0.42));
    const gap = 0.004;
    const dw = (w - gap * (n + 1)) / n;
    if (L)
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          rod(
            g,
            [sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06)],
            [sx * (w / 2 - 0.08), L, sz * (d / 2 - 0.08)],
            0.014,
            m,
          );
    part(g, w, h - L, d - 0.02, body, 0, L, -0.01, 0.008);
    part(g, w, 0.022, d, m, 0, h - 0.022, 0, 0.006);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + gap + dw / 2 + i * (dw + gap);
      part(g, dw, h - L - 0.03, 0.016, m, x, L + 0.004, d / 2 - 0.008, 0.003);
      part(
        g,
        0.01,
        0.12,
        0.012,
        mt,
        x + (i % 2 ? -1 : 1) * (dw / 2 - 0.035),
        L + (h - L) * 0.45,
        d / 2 + 0.006,
        0.004,
      );
    }
  },
  // Coat stand: round base, a pole, hooks in a circle at the top.
  coatStand(g, {w, d, h, color}) {
    const c = color === 'black' ? mat(0x27282b, 0.4, 0.3) : mat(hexOf(color), 0.5);
    const r = Math.min(w, d) / 2;
    cyl(g, r * 0.75, 0.03, c, 0, 0, 0, {rb: r * 0.8, seg: 36});
    cyl(g, 0.018, h - 0.03, c, 0, 0.03, 0, {seg: 14});
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), c);
    b.position.set(0, h, 0);
    g.add(b);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const y = h - 0.08 - (i % 2) * 0.12;
      rod(g, [0, y - 0.03, 0], [Math.cos(a) * r * 0.55, y + 0.06, Math.sin(a) * r * 0.55], 0.009, c, 8);
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), c);
      k.position.set(Math.cos(a) * r * 0.55, y + 0.06, Math.sin(a) * r * 0.55);
      g.add(k);
    }
  },
  // ---------- second batch: living room and bedroom ----------
  // U-shaped sofa: a full-width back, two chaises at the sides, seats in the middle.
  sofaU(g, p) {
    const {w, d, h, color} = p;
    const M = softMats(color);
    const {leg, base, back} = SOFA;
    // the catalog gives this model its arms (foot)
    const {back: B, side: S} = lArms(p)!;
    const A = Math.min(0.2, w * 0.06);
    const AH = Math.min(0.64, h - 0.08);
    const L = -w / 2;
    const R = w / 2;
    const Z = -d / 2;
    const k = 0.07;
    sofaLegs(g, M, [
      [L + k, Z + k],
      [R - k, Z + k],
      [L + k, d / 2 - k],
      [L + S - k, d / 2 - k],
      [R - k, d / 2 - k],
      [R - S + k, d / 2 - k],
      [0, Z + k],
      [0, Z + B - k],
    ]);
    part(g, w, base, B, M.frame, 0, leg, Z + B / 2, 0.03);
    for (const s2 of [-1, 1]) {
      part(g, S, base, d - B, M.frame, s2 * (w / 2 - S / 2), leg, Z + B + (d - B) / 2, 0.03);
      part(g, A, AH - leg, d, M.fab, s2 * (w / 2 - A / 2), leg, 0, 0.075);
      part(
        g,
        S - A - 0.012,
        SOFA.seat,
        d - back - 0.008,
        M.cush,
        s2 * (w / 2 - A - (S - A) / 2),
        leg + base,
        (Z + back + d / 2) / 2,
        0.055,
      );
    }
    part(g, w - 2 * A, h - leg - 0.04, back, M.frame, 0, leg, Z + back / 2, 0.06);
    seatRow(g, M, L + S, R - S, Z + back, Z + B);
    backRow(g, M, L + A, R - A, Z + back, h);
    pillow(g, M.pil, L + A + 0.27, Z + back + 0.27, 0.25);
    pillow(g, M.pil2, R - A - 0.27, Z + back + 0.27, -0.25);
    pillow(g, M.pil2, 0.35, Z + back + 0.27, 0.05);
  },
  // Side table: round on a pedestal or C-shaped (the base slides under the sofa, the top sits over the seat).
  sideTable(g, {w, d, h, color, v}) {
    const m = sideM(color);
    const mt = mat(0x2b2c2f, 0.4, 0.5);
    const T = 0.022;
    if (v === 'c') {
      part(g, w, 0.018, d, mt, 0, 0, 0, 0.006);
      part(g, w * 0.5, h - T, 0.022, mt, 0, 0, -d / 2 + 0.011, 0.006);
      part(g, w, T, d, m, 0, h - T, 0, 0.008);
    } else {
      cyl(g, 0.5, T, m, 0, h - T, 0, {sx: w, sz: d, seg: 44});
      cyl(g, 0.014, h - T, mt, 0, 0, 0, {seg: 12});
      cyl(g, 0.5, 0.012, mt, 0, 0, 0, {sx: w * 0.6, sz: d * 0.6, seg: 36});
    }
  },
  // Dressing table: a tabletop on legs with a drawer, a mirror above it, small items on the table.
  dressingTable(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.5);
    const body = mat(shade(c, 0.9), 0.55);
    const gold = mat(0xc9ad7c, 0.3, 0.7);
    const mir = mat(0xeef3f6, 0.04, 0.8);
    const H = 0.76;
    const T = 0.025;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        cyl(g, 0.018, H - 0.14, m, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), {rb: 0.012, seg: 12});
    part(g, w, 0.12, d, body, 0, H - 0.14, 0, 0.006);
    part(g, w * 0.5, 0.09, 0.016, m, 0, H - 0.125, d / 2, 0.003);
    cyl(g, 0.012, 0.012, gold, 0, H - 0.08, d / 2 + 0.012, {axis: 'z', seg: 12});
    part(g, w, T, d, m, 0, H - T - 0.0, 0, 0.006);
    const mw = Math.min(w * 0.7, 0.7);
    const mh = h - H - 0.04;
    part(g, mw, mh, 0.025, m, 0, H + 0.02, -d / 2 + 0.04, 0.012);
    part(g, mw - 0.05, mh - 0.05, 0.004, mir, 0, H + 0.045, -d / 2 + 0.054, 0.002);
    cyl(g, 0.025, 0.11, mat(0xd8c3d0, 0.15), w * 0.3, H, 0.02, {seg: 16});
    cyl(g, 0.012, 0.03, gold, w * 0.3, H + 0.11, 0.02, {seg: 10});
    part(g, 0.14, 0.05, 0.1, mat(0xe8dccb, 0.6), -w * 0.3, H, 0.04, 0.01);
  },
  // Floor mirror: tall, framed, leaning against the wall at an angle.
  floorMirror(g, {w, d, h, color}) {
    const fr = color === 'chrome' ? CHROME() : mat(hexOf(color), 0.5, color === 'black' ? 0.3 : 0);
    const mir = mat(0xeef3f6, 0.04, 0.8);
    const F = 0.035;
    const T = 0.03;
    const run = Math.max(0.05, d - 0.06);
    const a = Math.atan2(run, h);
    const L = Math.hypot(h, run);
    const q = new THREE.Group();
    q.position.set(0, 0, d / 2 - 0.04);
    q.rotation.x = -a;
    g.add(q);
    part(q, w, L, T, fr, 0, 0, 0, 0.008);
    part(q, w - 2 * F, L - 2 * F, 0.004, mir, 0, F, T / 2 + 0.001, 0.001);
  },
  // Clothes rack: two uprights on feet, a rail with clothes, a bottom shelf with a box and shoes.
  clothesRack(g, {w, d, h, color}) {
    const m = sideM(color);
    const wd = mat(COLORS.oak[1], 0.55);
    for (const s2 of [-1, 1]) {
      cyl(g, 0.014, h, m, s2 * (w / 2 - 0.03), 0, 0, {seg: 12});
      cyl(g, 0.012, d, m, s2 * (w / 2 - 0.03), 0.015, 0, {axis: 'z', seg: 10});
    }
    cyl(g, 0.013, w - 0.04, m, 0, h - 0.03, 0, {axis: 'x', seg: 14});
    part(g, w - 0.08, 0.02, d - 0.1, wd, 0, 0.2, 0, 0.004);
    clothes(g, -w / 2 + 0.08, w / 2 - 0.08, h - 0.03, Math.min(0.38, d - 0.05));
    part(g, 0.3, 0.16, 0.25, mat(0xe6dccb, 0.7), -w / 2 + 0.25, 0.22, 0, 0.008);
    for (const x of [w / 2 - 0.32, w / 2 - 0.2])
      part(g, 0.1, 0.09, 0.27, mat(0x2b2c2f, 0.6), x, 0.22, 0, 0.03);
  },
  // ---------- second batch: kitchen ----------
  // Kitchen island: fronts facing the kitchen (at the back), the countertop overhangs forward with bar stools beneath.
  kitchenIsland(g, p) {
    const {w, d, h, color} = p;
    const {P, T} = KB;
    const ov = Math.min(0.3, d * 0.32);
    const bd = d - ov;
    const q = new THREE.Group();
    q.rotation.y = Math.PI;
    q.position.z = -d / 2 + bd / 2;
    g.add(q);
    const k = kitBase(q, {w, d: bd, h, color}, {top: false});
    row(q, k, -w / 2, w, k.y0 + 0.003, k.y1 - k.y0 - 0.006);
    part(g, w, T, d, TOP(p.top), 0, h - T, 0, 0.006);
    part(g, w, h - T - P, 0.018, mat(hexOf(color), 0.5), 0, P, -d / 2 + bd - 0.009 + 0.0, 0.003);
  },
  // Cooker: an oven with a handle, a knob panel, a glass top with burners or gas burners with grates on top.
  stove(g, {w, d, h, color, v}) {
    const body = color === 'white' ? mat(0xf4f4f2, 0.32) : finish(color);
    const dk = mat(0x16171a, 0.12);
    const ch = CHROME();
    const T = h - 0.06;
    part(g, w, T - 0.06, d, body, 0, 0.06, 0, 0.012);
    part(g, w - 0.03, 0.06, d - 0.05, mat(0x2a2c30, 0.6), 0, 0, -0.015, 0.004);
    part(g, w - 0.04, 0.44, 0.016, mat(0x2a2c30, 0.3), 0, 0.12, d / 2, 0.006);
    part(g, w - 0.12, 0.3, 0.004, dk, 0, 0.17, d / 2 + 0.009, 0.003);
    part(g, w * 0.72, 0.02, 0.024, METAL(), 0, 0.58, d / 2 + 0.02, 0.006);
    part(g, w - 0.02, 0.08, 0.012, body, 0, T - 0.09, d / 2 + 0.002, 0.004);
    for (let i = 0; i < 4; i++)
      cyl(g, 0.018, 0.02, ch, -w / 2 + 0.09 + (i * (w - 0.18)) / 3, T - 0.05, d / 2 + 0.012, {
        axis: 'z',
        seg: 16,
      });
    if (v === 'gas') {
      part(g, w, 0.012, d, mat(0x2b2c2f, 0.4, 0.4), 0, T, 0, 0.006);
      for (const [x, z] of [
        [-0.14, -0.13],
        [0.14, -0.13],
        [-0.14, 0.12],
        [0.14, 0.12],
      ]) {
        const X = (x * w) / 0.6;
        const Z = (z * d) / 0.6;
        cyl(g, 0.05, 0.012, mat(0x3a3b3f, 0.5, 0.4), X, T + 0.012, Z, {seg: 20});
        cyl(g, 0.03, 0.014, mat(0x1b1c1f, 0.4), X, T + 0.024, Z, {seg: 16});
        for (const r of [0, 1]) {
          const b = part(g, 0.2, 0.012, 0.012, mat(0x18191b, 0.6), X, T + 0.04, Z, 0.003);
          b.rotation.y = (r * Math.PI) / 2;
        }
      }
    } else {
      part(g, w - 0.01, 0.008, d - 0.01, dk, 0, T, 0, 0.003);
      for (const [x, z, r] of [
        [-0.13, -0.13, 0.09],
        [0.13, -0.13, 0.07],
        [-0.13, 0.11, 0.07],
        [0.13, 0.11, 0.09],
      ]) {
        const t = new THREE.Mesh(new THREE.TorusGeometry((r * w) / 0.6, 0.003, 6, 40), mat(0x55585d, 0.35));
        t.rotation.x = Math.PI / 2;
        t.position.set((x * w) / 0.6, T + 0.008, (z * d) / 0.6);
        g.add(t);
      }
    }
  },
  // Microwave: body, a door with a dark window, a panel on the right.
  microwave(g, {w, d, h, color}) {
    const body = color === 'white' ? mat(0xf4f4f2, 0.32) : finish(color);
    const dk = mat(0x0f1013, 0.1);
    const pn = mat(0x2a2c30, 0.3);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        cyl(g, 0.012, 0.01, pn, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), {seg: 10});
    part(g, w, h - 0.01, d, body, 0, 0.01, 0, 0.014);
    part(g, w * 0.72, h - 0.04, 0.012, body, -w * 0.13, 0.03, d / 2, 0.006);
    part(g, w * 0.58, h - 0.1, 0.004, dk, -w * 0.15, 0.06, d / 2 + 0.007, 0.004);
    part(g, w * 0.2, h - 0.05, 0.006, pn, w / 2 - w * 0.12, 0.035, d / 2 + 0.002, 0.004);
    part(g, w * 0.12, 0.025, 0.003, glow(0x8fe0ff), w / 2 - w * 0.12, h - 0.075, d / 2 + 0.006, 0.002);
    cyl(g, 0.018, 0.015, CHROME(), w / 2 - w * 0.12, h * 0.38, d / 2 + 0.01, {axis: 'z', seg: 16});
  },
  // Pedal bin or a sorting unit: three containers in the item's color, lids and labels in the sorting colors.
  bin(g, {w, d, h, color, v}) {
    const m = finish(color);
    const dk = mat(0x2b2c2f, 0.45);
    if (v === 'sort') {
      const n = 3;
      const bw = (w - 0.02) / n;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 0.01 + bw * (i + 0.5);
        const c = mat(BINC[i], 0.5);
        part(g, bw - 0.012, h - 0.03, d, m, x, 0, 0, 0.02);
        part(g, bw - 0.012, 0.03, d, c, x, h - 0.03, 0, 0.012);
        part(g, bw * 0.5, 0.07, 0.004, c, x, h * 0.5, d / 2 + 0.001, 0.002);
        part(g, bw * 0.4, 0.014, 0.02, dk, x, h - 0.07, d / 2 + 0.006, 0.005);
      }
    } else {
      cyl(g, 0.5, h - 0.03, m, 0, 0, 0, {sx: w, sz: d, rb: 0.47, seg: 36});
      cyl(g, 0.5, 0.03, m, 0, h - 0.03, 0, {sx: w * 1.02, sz: d * 1.02, seg: 36});
      part(g, 0.09, 0.016, 0.06, dk, 0, 0.02, d / 2 + 0.02, 0.006);
      cyl(g, 0.5, 0.012, dk, 0, 0, 0, {sx: w * 0.95, sz: d * 0.95, seg: 36});
    }
  },
  // Extending table: a tabletop on legs with an apron; extended — longer, with a leaf in the middle.
  tableExt(g, {w, d, h, color, v}) {
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const lg = mat(shade(c, 0.85), 0.55);
    const T = 0.035;
    part(g, w, T, d, m, 0, h - T, 0, 0.01);
    part(g, w - 0.14, 0.08, d - 0.14, lg, 0, h - T - 0.08, 0, 0.006);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        part(g, 0.06, h - T, 0.06, lg, sx * (w / 2 - 0.07), 0, sz * (d / 2 - 0.07), 0.008);
    if (v === 'long') {
      const lw = Math.min(0.5, w * 0.26);
      const dk = mat(shade(c, 0.6));
      for (const s2 of [-1, 1]) part(g, 0.004, 0.002, d - 0.004, dk, (s2 * lw) / 2, h - 0.001, 0, 0.001);
      part(g, lw - 0.006, 0.001, d - 0.01, mat(shade(c, 1.05), 0.55), 0, h - 0.0005, 0, 0.0004);
    }
  },
  // Drop-leaf wall table: a wall rail, the tabletop on brackets; folded — hangs down along the wall.
  tableFold(g, {w, d, h, color, v}) {
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const mt = mat(0x2b2c2f, 0.4, 0.5);
    const T = 0.025;
    part(g, w, 0.06, 0.035, m, 0, h - 0.06, -d / 2 + 0.0175, 0.004);
    if (v === 'closed') {
      part(g, w, 0.56, T, m, 0, h - 0.62, d / 2 - T / 2, 0.006);
      return;
    }
    part(g, w, T, d, m, 0, h - T, 0, 0.008);
    for (const s2 of [-1, 1])
      rod(
        g,
        [s2 * (w / 2 - 0.08), h - 0.36, -d / 2 + 0.012],
        [s2 * (w / 2 - 0.08), h - T, d * 0.18],
        0.01,
        mt,
      );
  },
  // Bar stool: base, column, foot ring, seat and a low back.
  barStool(g, {w, d, h, color}) {
    const m = sideM(color);
    const seat = mat(color === 'black' ? 0x3a3b3f : 0xd7cfc1, 0.9);
    const r = Math.min(w, d) / 2;
    const S = Math.min(0.82, h - 0.25);
    cyl(g, r * 0.82, 0.02, m, 0, 0, 0, {seg: 36});
    cyl(g, 0.024, S - 0.06, m, 0, 0.02, 0, {seg: 16});
    const t = new THREE.Mesh(new THREE.TorusGeometry(r * 0.68, 0.01, 8, 40), m);
    t.rotation.x = Math.PI / 2;
    t.position.y = 0.3;
    g.add(t);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      rod(g, [0, 0.3, 0], [Math.cos(a) * r * 0.68, 0.3, Math.sin(a) * r * 0.68], 0.008, m, 8);
    }
    cyl(g, r * 0.95, 0.06, seat, 0, S - 0.06, 0, {seg: 32});
    const bk = part(g, w * 0.72, h - S - 0.02, 0.03, seat, 0, S, -r * 0.82, 0.014);
    bk.rotation.x = -0.15;
  },
  // Stool: round on three legs with a ring, or square on four with aprons.
  stool(g, {w, d, h, color, v}) {
    const c = hexOf(color);
    const m = mat(c, 0.5);
    const T = 0.035;
    if (v === 'square') {
      part(g, w, T, d, m, 0, h - T, 0, 0.008);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          rod(
            g,
            [sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03)],
            [sx * (w / 2 - 0.06), h - T, sz * (d / 2 - 0.06)],
            0.015,
            m,
          );
      for (const s2 of [-1, 1]) {
        part(g, w - 0.1, 0.02, 0.02, m, 0, 0.15, s2 * (d / 2 - 0.045), 0.004);
        part(g, 0.02, 0.02, d - 0.1, m, s2 * (w / 2 - 0.045), 0.15, 0, 0.004);
      }
    } else {
      const r = Math.min(w, d) / 2;
      cyl(g, r, T, m, 0, h - T, 0, {seg: 32});
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3 + 0.5;
        rod(
          g,
          [Math.cos(a) * r * 0.92, 0, Math.sin(a) * r * 0.92],
          [Math.cos(a) * r * 0.55, h - T, Math.sin(a) * r * 0.55],
          0.015,
          m,
        );
      }
      const t = new THREE.Mesh(new THREE.TorusGeometry(r * 0.8, 0.009, 8, 36), m);
      t.rotation.x = Math.PI / 2;
      t.position.y = 0.17;
      g.add(t);
    }
  },
  // ---------- second batch: bathroom ----------
  // Freestanding bathtub: an oval tub (a revolved profile) or a rectangular one on feet; a floor-standing faucet at the end.
  bathFree(g, {w, d, h, v, color}) {
    const cer = new THREE.MeshStandardMaterial({color: glaze(color), roughness: 0.2, side: THREE.DoubleSide});
    const ch = CHROME();
    const bw = w - 0.16;
    if (v === 'rect') {
      const t = 0.05;
      const y0 = 0.08;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          cyl(g, 0.022, y0, ch, sx * (bw / 2 - 0.08), 0, sz * (d / 2 - 0.08), {seg: 12});
      part(g, bw, 0.1, d, cer, -0.08, y0, 0, 0.03);
      for (const s2 of [-1, 1]) {
        part(g, bw, h - y0, t, cer, -0.08, y0, s2 * (d / 2 - t / 2), 0.02);
        part(g, t, h - y0, d - 2 * t, cer, -0.08 + s2 * (bw / 2 - t / 2), y0, 0, 0.02);
      }
    } else {
      const pr = [
        [0, 0.07],
        [0.38, 0.07],
        [0.45, 0.14],
        [0.495, h - 0.02],
        [0.5, h],
        [0.47, h],
        [0.44, h - 0.03],
        [0.41, 0.2],
        [0.33, 0.14],
        [0, 0.14],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      const b = new THREE.Mesh(new THREE.LatheGeometry(pr, 64), cer);
      b.scale.set(bw, 1, d);
      b.position.x = -0.08;
      b.castShadow = b.receiveShadow = true;
      g.add(b);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          cyl(g, 0.03, 0.08, ch, -0.08 + sx * bw * 0.3, 0, sz * d * 0.26, {rb: 0.02, seg: 14});
    }
    const x = w / 2 - 0.05;
    cyl(g, 0.03, 0.02, ch, x, 0, 0);
    cyl(g, 0.014, h + 0.25, ch, x, 0.02, 0, {seg: 12});
    rod(g, [x, h + 0.27, 0], [x - 0.16, h + 0.27, 0], 0.013, ch);
    cyl(g, 0.012, 0.04, ch, x - 0.16, h + 0.23, 0, {seg: 10});
    part(g, 0.06, 0.012, 0.012, ch, x, h + 0.05, 0, 0.004);
  },
  // Walk-in shower: tiles flush with the floor, a linear drain, a glass partition with a support bar, a rain shower head.
  walkIn(g, {w, d, h, color}) {
    const m = finish(color);
    const T = 0.02;
    const pw = w * 0.62;
    part(g, w, T, d, mat(0xd6d4cf, 0.65), 0, 0, 0, 0.004);
    part(g, w * 0.6, 0.004, 0.05, mat(0x9a9ea3, 0.3, 0.6), 0, T, -d / 2 + 0.1, 0.002);
    glass(part(g, pw, h - T - 0.02, 0.008, GLASS, -w / 2 + pw / 2 + 0.01, T, d / 2 - 0.03, 0.002));
    part(g, 0.02, h - T - 0.02, 0.03, m, -w / 2 + 0.01, T, d / 2 - 0.03, 0.004);
    rod(g, [-w / 2 + pw, h - 0.05, d / 2 - 0.03], [-w / 2 + pw, h - 0.05, -d / 2], 0.009, m);
    const hx = -w / 2 + pw * 0.55;
    rod(g, [hx, h - 0.1, -d / 2], [hx, h - 0.1, -d / 2 + 0.35], 0.012, m);
    part(g, 0.26, 0.012, 0.26, m, hx, h - 0.12, -d / 2 + 0.42, 0.006);
    part(g, 0.16, 0.12, 0.05, m, hx, 1.05, -d / 2 + 0.025, 0.012);
    cyl(g, 0.02, 0.18, m, hx + 0.22, 1.15, -d / 2 + 0.04, {seg: 12});
  },
  // Shower column: mixer, rail, an overhead shower on an arm, a hand shower in a holder.
  showerColumn(g, {w, d, h, color}) {
    const m = finish(color);
    const z = -d / 2 + 0.035;
    part(g, Math.min(0.2, w), 0.07, 0.06, m, 0, 0, z + 0.005, 0.014);
    cyl(g, 0.03, 0.03, m, 0, 0.035, z + 0.045, {axis: 'z', seg: 16});
    cyl(g, 0.013, h - 0.08, m, 0, 0.07, z, {seg: 12});
    rod(g, [0, h - 0.02, z], [0, h - 0.02, d / 2 - 0.13], 0.012, m);
    cyl(g, Math.min(0.12, w / 2), 0.014, m, 0, h - 0.045, d / 2 - 0.13, {seg: 32});
    const lh = rod(g, [0.06, 0.45, z + 0.05], [0.06, 0.62, z + 0.08], 0.016, m);
    part(g, 0.05, 0.03, 0.04, m, 0.03, 0.5, z + 0.02, 0.008);
  },
  // Bathroom tall cabinet: on legs or wall-hung; a door at the top, an open niche with towels, a door at the bottom.
  bathTall(g, {w, d, h, color, v}) {
    const c = hexOf(color);
    const body = mat(shade(c, 0.88), 0.55);
    const fr = mat(c, 0.5);
    const mt = CHROME();
    const L = v === 'wall' ? 0 : 0.1;
    const H = h - L;
    if (L)
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          cyl(g, 0.012, L, mt, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), {seg: 10});
    part(g, w, H, d - 0.02, body, 0, L, -0.01, 0.004);
    const n0 = L + H * 0.32;
    const n1 = L + H * 0.5;
    part(g, w - 0.008, n0 - L - 0.008, 0.016, fr, 0, L + 0.004, d / 2 - 0.008, 0.003);
    part(g, w - 0.008, h - n1 - 0.008, 0.016, fr, 0, n1 + 0.004, d / 2 - 0.008, 0.003);
    part(g, w - 0.04, n1 - n0 - 0.01, 0.02, mat(shade(c, 0.6)), 0, n0 + 0.005, d / 2 - 0.03, 0.002);
    for (let i = 0; i < 3; i++)
      part(
        g,
        w * 0.7,
        0.045,
        d * 0.7,
        mat(i % 2 ? 0xf3f1ec : PASTEL[1], 0.95),
        0,
        n0 + 0.012 + i * 0.046,
        0,
        0.018,
      ); // stack of towels
    for (const y of [n0 - 0.12, n1 + 0.04])
      part(g, 0.012, 0.08, 0.012, mt, w / 2 - 0.04, y, d / 2 + 0.004, 0.004);
  },
  // Water heater: a round tank with domed ends or a flat one; a panel at the bottom, pipes to the faucets.
  waterHeater(g, {w, d, h, v, color}) {
    const wh = enamel(color, 0xf4f4f2);
    const ch = CHROME();
    const dk = mat(0x2a2c30, 0.35);
    if (v === 'flat') {
      part(g, w, h, d, wh, 0, 0, 0, 0.06);
      part(g, w * 0.3, 0.05, 0.004, dk, 0, h * 0.22, d / 2 + 0.001, 0.004);
      part(g, w * 0.06, 0.015, 0.003, glow(0x8fe0ff), 0, h * 0.22 + 0.017, d / 2 + 0.003, 0.002);
    } else {
      const r = Math.min(w, d) / 2;
      const k = r * 0.32;
      cyl(g, r, h - 2 * k, wh, 0, k, 0, {seg: 40});
      for (const [y, up] of [
        [h - k, 1],
        [k, -1],
      ]) {
        const sp = new THREE.Mesh(
          new THREE.SphereGeometry(r, 40, 16, 0, Math.PI * 2, up > 0 ? 0 : Math.PI / 2, Math.PI / 2),
          wh,
        );
        sp.scale.y = k / r;
        sp.position.y = y;
        sp.castShadow = true;
        g.add(sp);
      }
      part(g, r * 0.8, 0.06, 0.004, dk, 0, k + 0.04, r - 0.004 + 0.002, 0.004);
    }
    for (const s2 of [-1, 1]) cyl(g, 0.01, 0.28, ch, s2 * 0.05, -0.28, 0, {seg: 10});
    cyl(g, 0.016, 0.03, mat(0xc0392b, 0.5), 0.05, -0.18, 0, {axis: 'z', seg: 12});
    cyl(g, 0.016, 0.03, mat(0x2f6db5, 0.5), -0.05, -0.18, 0, {axis: 'z', seg: 12});
  },
  // ---------- second batch: climate ----------
  // Air purifier: a rounded column, a grille on top, an indicator ring on the front.
  purifier(g, {w, d, h, color}) {
    const c = tone(color, {white: 0xf3f3f1});
    const m = mat(c, 0.4);
    const dk = mat(0x2b2d31, 0.5);
    part(g, w, h - 0.015, d, m, 0, 0.015, 0, Math.min(w, d) * 0.2);
    part(g, w - 0.02, 0.015, d - 0.02, dk, 0, 0, 0, 0.01);
    cyl(g, Math.min(w, d) * 0.38, 0.006, dk, 0, h - 0.004, 0, {seg: 36});
    for (let i = 1; i < 5; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, d) * 0.08 * i, 0.002, 4, 40), m);
      t.rotation.x = Math.PI / 2;
      t.position.y = h + 0.003;
      g.add(t);
    }
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 8, 32), glow(0x7fd9ff));
    t.position.set(0, h * 0.78, d / 2 + 0.002);
    g.add(t);
    for (let y = 0.08; y < h * 0.6; y += 0.03)
      part(g, w * 0.6, 0.006, 0.003, mat(shade(c, 0.85), 0.5), 0, y, d / 2 + 0.001, 0.002);
  },
  // Convector heater: a flat body, a grille on top, a slot at the bottom, a control unit on the right; on feet — for the floor.
  convector(g, p) {
    const {w, d, h, v, color} = p;
    const m = mat(tone(color, {white: 0xf4f4f2}), 0.35);
    const dk = mat(0x3a3c40, 0.55);
    const y0 = v === 'floor' ? 0.12 : 0;
    if (y0)
      for (const s2 of [-1, 1]) {
        part(g, 0.04, y0, 0.04, m, s2 * (w / 2 - 0.1), 0, 0, 0.008);
        part(g, 0.05, 0.02, Math.max(d, 0.24), m, s2 * (w / 2 - 0.1), 0, 0, 0.008);
      }
    part(g, w, h - y0, d * 0.85, m, 0, y0, -d * 0.075, 0.012);
    part(
      g,
      w - 0.02,
      h - y0 - 0.02,
      0.006,
      mat(panel(color, 0xfafaf8), 0.3),
      0,
      y0 + 0.01,
      d / 2 - 0.075 * d + d * 0.425 - 0.003 + 0.003,
      0.004,
    );
    for (let x = -w / 2 + 0.03; x < w / 2 - 0.03; x += 0.02)
      part(g, 0.008, 0.003, d * 0.6, dk, x, h - 0.002, -d * 0.075, 0.001);
    part(g, w - 0.06, 0.012, d * 0.5, dk, 0, y0 - 0.004, -d * 0.075, 0.002);
    part(g, 0.1, 0.07, 0.012, mat(0xe9e9e6, 0.4), w / 2 - 0.08, h - 0.11, d / 2 - 0.01, 0.006);
    cyl(g, 0.015, 0.012, dk, w / 2 - 0.08, h - 0.075, d / 2, {axis: 'z', seg: 14});
  },
  // Thermostat: a rounded square, a ring and a dark display with digits.
  thermostat(g, {w, d, h, color}) {
    const m = mat(tone(color, {black: 0x232427, white: 0xf6f6f4}), 0.3);
    const r = Math.min(w, h);
    part(g, w, h, d, m, 0, 0, 0, 0.012);
    const t = new THREE.Mesh(new THREE.TorusGeometry(r * 0.33, 0.0035, 8, 40), CHROME());
    t.position.set(0, h / 2, d / 2 + 0.002);
    g.add(t);
    cyl(g, r * 0.28, 0.002, mat(0x101215, 0.1), 0, h / 2, d / 2 + 0.001, {axis: 'z', seg: 32});
    part(g, r * 0.22, r * 0.1, 0.002, glow(0xffa64d), 0, h / 2 - r * 0.04, d / 2 + 0.003, 0.001);
  },
  // ---------- second batch: decor ----------
  // Rug: a border and lines in color2 (not set — a darker shade of the field), the field in color and a lighter center; rectangular,
  // round or oval. Furniture stands on top of it.
  rug(g, {w, d, h, color, color2, v}) {
    const c = hexOf(color);
    const b = mat(color2 ? hexOf(color2, shade(c, 0.78)) : shade(c, 0.78), 0.98);
    const m = mat(c, 0.98);
    const f2 = mat(shade(c, 1.12), 0.98);
    if (v === 'rect') {
      part(g, w, h, d, b, 0, 0, 0, 0.003);
      part(g, w - 0.12, 0.0015, d - 0.12, m, 0, h, 0, 0.0005);
      part(g, w - 0.4, 0.0015, d - 0.4, f2, 0, h + 0.0015, 0, 0.0005);
      for (const s2 of [-1, 1]) part(g, w - 0.5, 0.0015, 0.012, b, 0, h + 0.003, s2 * (d / 2 - 0.25), 0.0005);
    } else {
      const sx = v === 'round' ? Math.min(w, d) : w;
      const sz = v === 'round' ? Math.min(w, d) : d;
      cyl(g, 0.5, h, b, 0, 0, 0, {sx, sz, seg: 72});
      cyl(g, 0.5, 0.0015, m, 0, h, 0, {sx: sx - 0.12, sz: sz - 0.12, seg: 72});
      cyl(g, 0.5, 0.0015, f2, 0, h + 0.0015, 0, {sx: sx * 0.55, sz: sz * 0.55, seg: 60});
    }
  },
  // Roller blind (lowered to two thirds), venetian blinds (slats) or “Day-night” (stripes); a cassette on top.
  // open (0…1) — for blinds from HA (D-048): how far raised; closed — all the way down, open — rolled into the cassette.
  blind(g, {w, d, h, color, v, open}) {
    const c = hexOf(color);
    const fab = new THREE.MeshStandardMaterial({color: c, roughness: 0.92, side: THREE.DoubleSide});
    const cas = mat(0xf2f2f0, 0.4);
    const z = d / 2 - 0.02;
    const top = h - 0.07;
    const drop = open != null ? Math.max(0.03, top * (1 - Math.max(0, Math.min(1, open)))) : top * 0.68;
    part(g, w, 0.07, d, cas, 0, top, 0, 0.012);
    if (v === 'venetian') {
      const n = Math.max(4, Math.round(drop / 0.025));
      for (let i = 0; i < n; i++) {
        const q = part(g, w - 0.02, 0.002, 0.025, mat(c, 0.5), 0, top - 0.02 - (i * drop) / n, z, 0.0008);
        q.rotation.x = 0.5;
      }
      for (const s2 of [-0.3, 0.3])
        cyl(g, 0.0015, drop, mat(0xdddddd, 0.8), s2 * w, top - drop, z + 0.012, {seg: 4});
    } else if (v === 'daynight') {
      const n = Math.round(drop / 0.05);
      for (let i = 0; i < n; i++) {
        const op = i % 2 === 0;
        const q = part(
          g,
          w - 0.02,
          0.05,
          0.003,
          op
            ? fab
            : new THREE.MeshStandardMaterial({
                color: c,
                roughness: 0.9,
                transparent: true,
                opacity: 0.35,
                side: THREE.DoubleSide,
                depthWrite: false,
              }),
          0,
          top - (i + 1) * 0.05,
          z,
          0.0005,
        );
        if (!op) q.castShadow = false;
      }
    } else part(g, w - 0.02, drop, 0.003, fab, 0, top - drop, z, 0.0008);
    part(g, w - 0.02, 0.02, 0.012, cas, 0, top - drop - 0.02, z, 0.004);
  },
  // ---------- third batch (P2) ----------
  // Recliner: an armchair; reclined — the footrest is extended (deeper forward), the back tilts slightly.
  recliner(g, p) {
    const {w, d, h, color} = p;
    // its variants give how far it unfolds, metres
    const ext = extOf(p) as number;
    const df = d - ext;
    const q = new THREE.Group();
    q.position.z = -ext / 2;
    g.add(q);
    const A = Math.min(0.18, w * 0.2);
    const M = sofaBody(q, {...p, d: df}, {pillows: false, A});
    if (ext) {
      part(g, w - 2 * A - 0.04, 0.12, ext - 0.04, M.cush, 0, 0.3, d / 2 - ext / 2 + 0.0, 0.05);
      rod(g, [0, 0.12, -d / 2 + df - 0.1], [0, 0.3, d / 2 - ext / 2], 0.02, mat(0x2b2c2f, 0.4, 0.4));
    }
  },
  // Daybed: a long seat on legs, a sloping headrest on the left (mirrored — on the right), a low back at the rear, a bolster.
  chaise(g, {w, d, h, color}) {
    const M = softMats(color);
    const {leg, base} = SOFA;
    const k = 0.06;
    sofaLegs(g, M, [
      [-w / 2 + k, -d / 2 + k],
      [w / 2 - k, -d / 2 + k],
      [-w / 2 + k, d / 2 - k],
      [w / 2 - k, d / 2 - k],
    ]);
    part(g, w, base, d, M.frame, 0, leg, 0, 0.03);
    part(g, w - 0.02, SOFA.seat, d - 0.02, M.cush, 0, leg + base, 0, 0.06);
    const hb = part(g, 0.2, h - seatTop + 0.12, d - 0.03, M.fab, -w / 2 + 0.14, seatTop - 0.12, 0, 0.08);
    hb.rotation.z = 0.32;
    part(g, w * 0.5, 0.3, 0.12, M.fab, -w / 2 + w * 0.27, seatTop - 0.06, -d / 2 + 0.06, 0.05);
    cyl(g, 0.08, d - 0.12, M.pil2, -w / 2 + 0.34, seatTop + 0.05, 0, {axis: 'z', seg: 24});
  },
  // Soundbar: an elongated body, a fabric grille in front, a status light.
  soundbar(g, {w, d, h, color}) {
    const c = tone(color, {white: 0xf2f2f0, black: 0x232427});
    const m = mat(c, 0.55);
    part(g, w, h, d, m, 0, 0, 0, Math.min(0.025, h / 2 - 0.002));
    part(g, w - 0.04, h * 0.7, 0.004, mat(shade(c, 0.8), 0.95), 0, h * 0.15, d / 2 + 0.001, 0.002);
    part(g, 0.012, 0.004, 0.002, glow(0xffffff), w * 0.35, h * 0.55, d / 2 + 0.004, 0.001);
  },
  // Floor-standing speaker: a cabinet on spikes, a black baffle, a tweeter and two woofers.
  speaker(g, {w, d, h, color}) {
    const body =
      color === 'walnut'
        ? mat(COLORS.walnut[1], 0.5)
        : color === 'white'
          ? mat(0xf2f2f0, 0.4)
          : mat(tone(color, {black: 0x232427}), 0.45);
    const cone = mat(0x2b2c2f, 0.65);
    const ring = mat(0x8a8d91, 0.3, 0.6);
    const ft = mat(0x1b1c1e, 0.4);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        cyl(g, 0.012, 0.03, ft, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03), {rb: 0.004, seg: 10});
    part(g, w, h - 0.03, d, body, 0, 0.03, 0, 0.012);
    part(g, w - 0.012, h - 0.05, 0.006, ft, 0, 0.04, d / 2 + 0.001, 0.004);
    const drv = (y: number, r: number): void => {
      cyl(g, r, 0.012, cone, 0, y, d / 2 + 0.006, {axis: 'z', seg: 28});
      const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.006, 8, 32), ring);
      t.position.set(0, y, d / 2 + 0.01);
      g.add(t);
      cyl(g, r * 0.3, 0.01, ring, 0, y, d / 2 + 0.01, {axis: 'z', seg: 16});
    };
    drv(h - 0.12, 0.025);
    const r = w * 0.34;
    drv(h * 0.55, r);
    drv(h * 0.55 - 2.3 * r, r);
  },
  // Electric fireplace: a surround with a mantel, a dark firebox behind glass, logs and flames (glowing).
  fireplace(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.5);
    const dk = mat(0x141416, 0.6);
    const fw = w * 0.58;
    const fh = h * 0.5;
    const fy = 0.12;
    const pd = d - 0.05;
    part(g, w, 0.045, d, m, 0, h - 0.045, 0, 0.008);
    for (const s2 of [-1, 1])
      part(g, (w - fw) / 2, h - 0.045, pd, m, s2 * (w / 2 - (w - fw) / 4), 0, -0.025, 0.006);
    part(g, fw, h - 0.045 - fy - fh, pd, m, 0, fy + fh, -0.025, 0.004);
    part(g, fw, fy, pd, m, 0, 0, -0.025, 0.004);
    part(g, fw, fh, 0.02, dk, 0, fy, -d / 2 + 0.03, 0.002);
    for (const s2 of [-1, 1]) part(g, 0.02, fh, pd - 0.04, dk, s2 * (fw / 2 - 0.01), fy, -0.025, 0.002);
    part(g, fw, 0.01, pd - 0.04, dk, 0, fy, -0.025, 0.002);
    const lg = mat(0x5a3a26, 0.8);
    for (const [x, z, a] of [
      [-0.08, 0, 0.2],
      [0.08, 0.02, -0.25],
      [0, -0.04, 0],
    ]) {
      const q = cyl(g, 0.035, fw * 0.55, lg, x * fw, fy + 0.045, z, {axis: 'x', seg: 12});
      q.rotation.y = a;
    }
    const fl = glow(0xff8a3d);
    const fl2 = glow(0xffc46b);
    // the flames: where along the width, how tall, which glow
    const flames: Array<[number, number, THREE.Material]> = [
      [-0.12, 0.22, fl],
      [0, 0.3, fl2],
      [0.12, 0.2, fl],
      [0.06, 0.14, fl2],
    ];
    for (const [x, hh, m2] of flames) {
      const q = new THREE.Mesh(new THREE.ConeGeometry(0.045, (hh * fh) / 0.5, 12), m2);
      q.position.set(x * fw, fy + 0.07 + (hh * fh) / 1, -0.02);
      g.add(q);
    }
    glass(part(g, fw - 0.02, fh, 0.006, GLASS, 0, fy, d / 2 - 0.04, 0.002));
  },
  // Murphy bed: folded — a tall cabinet with a front; unfolded — the bed is lowered forward out of the cabinet, legs flipped down.
  wallBed(g, {w, d, h, color, v}) {
    const c = hexOf(color);
    const body = mat(shade(c, 0.86));
    const fr = mat(c, 0.5);
    const mt = mat(0x2b2c2f, 0.4, 0.4);
    const C = 0.45;
    const B = -d / 2;
    for (const s2 of [-1, 1]) part(g, 0.025, h, C, body, s2 * (w / 2 - 0.0125), 0, B + C / 2, 0.004);
    part(g, w - 0.05, 0.025, C, body, 0, h - 0.025, B + C / 2, 0.003);
    part(g, w - 0.05, h - 0.025, 0.015, mat(shade(c, 0.7)), 0, 0, B + 0.0075, 0.002);
    if (v === 'open') {
      const L = d - C + 0.12;
      const z0 = B + C - 0.12;
      const zc = z0 + L / 2;
      part(g, w - 0.06, 0.2, L, fr, 0, 0.12, zc, 0.008);
      for (const s2 of [-1, 1]) part(g, 0.04, 0.12, 0.04, mt, s2 * (w / 2 - 0.08), 0, d / 2 - 0.05, 0.006);
      part(g, w - 0.1, 0.18, L - 0.06, mat(0xf3f1ec, 0.85), 0, 0.32, zc, 0.04);
      part(g, w - 0.08, 0.05, (L - 0.06) * 0.62, mat(PASTEL[3], 0.9), 0, 0.49, zc + (L - 0.06) * 0.19, 0.025);
      const n = w > 1.2 ? 2 : 1;
      const pw = n > 1 ? (w - 0.24) / 2 : w - 0.2;
      for (let i = 0; i < n; i++)
        part(
          g,
          pw,
          0.11,
          0.34,
          mat(0xfaf8f4, 0.85),
          n > 1 ? (i ? 1 : -1) * (pw / 2 + 0.04) : 0,
          0.5,
          z0 + 0.25,
          0.05,
        );
      part(g, w - 0.06, 0.6, 0.04, body, 0, h - 0.62, B + C - 0.05, 0.004);
    } else {
      const n = 2;
      const ph = (h - 0.03) / n;
      for (let i = 0; i < n; i++)
        part(g, w - 0.056, ph - 0.006, 0.02, fr, 0, 0.003 + i * ph, B + C - 0.01, 0.003);
      part(g, w * 0.4, 0.02, 0.025, mt, 0, h * 0.48, B + C + 0.012, 0.006);
    }
  },
  // Room divider: folding panels in a frame with fabric.
  screen(g, {w, d, h, color}) {
    const wood = color === 'oak' || color === 'walnut';
    const fab = wood ? mat(0xece6da, 0.95) : mat(hexOf(color), 0.95);
    const fr = wood ? mat(hexOf(color), 0.5) : mat(0x8a6e4e, 0.5);
    const n = w > 1.2 ? 4 : 3;
    const dz = Math.max(0.02, d - 0.05);
    const sx = w / n;
    const a = Math.atan2(dz, sx);
    const pl = Math.hypot(dz, sx) - 0.01;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + sx * (i + 0.5);
      const sg = i % 2 ? -1 : 1;
      const q = new THREE.Group();
      q.position.set(x, 0, 0);
      q.rotation.y = -sg * a;
      g.add(q);
      part(q, pl, h - 0.03, 0.022, fr, 0, 0.03, 0, 0.004);
      part(q, pl - 0.06, h - 0.15, 0.026, fab, 0, 0.09, 0, 0.002);
      for (const s2 of [-1, 1]) part(q, 0.03, 0.03, 0.06, fr, s2 * (pl / 2 - 0.04), 0, 0, 0.006);
    }
  },
  // Kitchen trolley: three basket tiers on posts, casters, jars on top.
  kitchenCart(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.4, 0.15);
    const dk = mat(0x2b2c2f, 0.4, 0.4);
    const y0 = 0.05;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        cyl(g, 0.01, h - y0, m, sx * (w / 2 - 0.015), y0, sz * (d / 2 - 0.015), {seg: 10});
        const wh = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 10), dk);
        wh.position.set(sx * (w / 2 - 0.03), 0.024, sz * (d / 2 - 0.03));
        g.add(wh);
      }
    for (const y of [y0 + 0.04, y0 + (h - y0) * 0.45, h - 0.09]) {
      part(g, w - 0.02, 0.008, d - 0.02, m, 0, y, 0, 0.002);
      for (const s2 of [-1, 1]) {
        part(g, w - 0.02, 0.07, 0.004, m, 0, y, s2 * (d / 2 - 0.012), 0.001);
        part(g, 0.004, 0.07, d - 0.02, m, s2 * (w / 2 - 0.012), y, 0, 0.001);
      }
    }
    for (let i = 0; i < 3; i++)
      cyl(g, 0.035, 0.09, transp(0xdfe8ec, 0.55), -w / 2 + 0.08 + i * 0.1, h - 0.082, 0, {seg: 16});
  },
  // Coffee machine: body, a group head with a spout, a drip tray with a cup, a display, a bean container on top.
  coffee(g, {w, d, h, color}) {
    const body = color === 'white' ? mat(0xf4f4f2, 0.3) : finish(color);
    const ch = CHROME();
    const dk = mat(0x15161a, 0.3);
    const zf = d * 0.35;
    part(g, w, h, d * 0.7, body, 0, 0, -d * 0.15, 0.02);
    part(g, w, h * 0.24, d * 0.3, body, 0, h * 0.76, zf, 0.02);
    part(g, w, 0.02, d * 0.3, body, 0, 0, zf, 0.006);
    part(g, w * 0.82, 0.02, d * 0.28, ch, 0, 0.02, zf, 0.004);
    cyl(g, 0.012, 0.04, ch, 0, h * 0.76 - 0.04, zf + 0.02, {seg: 12});
    cyl(g, 0.03, 0.06, mat(0xf6f4ef, 0.3), 0, 0.04, zf + 0.02, {rb: 0.025, seg: 18});
    part(g, w * 0.55, 0.035, 0.004, dk, 0, h * 0.85, d / 2 + 0.001, 0.004);
    cyl(g, w * 0.3, 0.05, transp(0x6b4a2e, 0.6, 0.2), 0, h, -d * 0.2, {seg: 24});
  },
  // Bidet: a bowl without a cistern, faucet at the back; floor-standing or wall-hung.
  bidet(g, {w, d, h, v, color}) {
    const cer = ceramic(color);
    const ch = CHROME();
    const wall = v === 'wall';
    const back = wall ? 0.12 : 0.05;
    const z0 = -d / 2 + back;
    const bl = d / 2 - z0;
    const zc = (z0 + d / 2) / 2;
    if (wall) {
      part(g, w, h + 0.1, back, mat(0xdedbd5, 0.7), 0, 0, -d / 2 + back / 2, 0.004);
      cyl(g, 0.5, 0.2, cer, 0, h - 0.2, zc, {rb: 0.32, sx: w * 0.96, sz: bl});
    } else {
      cyl(g, 0.5, 0.2, cer, 0, 0, zc + 0.02, {sx: w * 0.55, sz: bl * 0.6});
      cyl(g, 0.5, h - 0.18, cer, 0, 0.18, zc, {rb: 0.4, sx: w * 0.96, sz: bl});
    }
    cyl(g, 0.5, 0.004, mat(0xeceae4, 0.14), 0, h, zc + 0.01, {sx: w * 0.76, sz: bl * 0.74});
    part(g, w * 0.8, 0.04, 0.08, cer, 0, h - 0.04, z0 + 0.04, 0.015);
    cyl(g, 0.014, 0.06, ch, 0, h, z0 + 0.04, {seg: 12});
    cyl(g, 0.01, 0.06, ch, 0, h + 0.055, z0 + 0.07, {axis: 'z', seg: 10});
  },
  // PC tower: case, a glass side panel with lighting inside, a button on the front.
  pcTower(g, {w, d, h, color}) {
    const c = tone(color, {white: 0xf2f2f0, black: 0x1e1f22});
    const m = mat(c, 0.4, 0.2);
    for (const sz of [-1, 1])
      part(g, w - 0.02, 0.02, 0.04, mat(0x111214, 0.5), 0, 0, sz * (d / 2 - 0.04), 0.006);
    part(g, w, h - 0.02, d, m, 0, 0.02, 0, 0.008);
    part(g, 0.004, h - 0.08, d - 0.08, transp(0x111214, 0.75, 0.05), w / 2 + 0.001, 0.05, 0, 0.002);
    part(g, 0.003, 0.006, d - 0.12, glow(0x8a7dff), w / 2 - 0.004, h - 0.09, 0, 0.001);
    part(g, 0.003, h - 0.16, 0.006, glow(0x5fd0ff), w / 2 - 0.004, 0.08, d / 2 - 0.08, 0.001);
    cyl(g, 0.01, 0.004, glow(0x9fe3ff), 0, h - 0.04, d / 2 + 0.001, {axis: 'z', seg: 16});
    for (let y = 0.06; y < h * 0.6; y += 0.02)
      part(g, w * 0.6, 0.004, 0.002, mat(shade(c, 0.75), 0.5), 0, y, d / 2 + 0.001, 0.001);
  },
  // Printer / MFP: body, scanner lid, paper tray, output slot, panel.
  printer(g, {w, d, h, color}) {
    const c = tone(color, {black: 0x2a2b2e, white: 0xf1f1ef});
    const m = mat(c, 0.4);
    const dk = mat(0x2a2c30, 0.4);
    part(g, w, h * 0.78, d, m, 0, 0, 0, 0.015);
    part(g, w - 0.004, h * 0.22, d - 0.004, mat(shade(c, 0.94), 0.35), 0, h * 0.78, 0, 0.012);
    part(g, w - 0.02, 0.003, 0.002, dk, 0, h * 0.78, d / 2 + 0.001, 0.001);
    part(g, w * 0.7, 0.022, 0.004, dk, 0, h * 0.46, d / 2 + 0.001, 0.003);
    part(g, w * 0.55, 0.008, 0.1, m, 0, h * 0.4, d / 2 - 0.05, 0.003);
    part(g, w * 0.5, 0.004, 0.12, mat(0xffffff, 0.8), 0, h * 0.41, d / 2 - 0.06, 0.001);
    const pn = part(g, w * 0.28, 0.012, 0.07, dk, w * 0.28, h - 0.006, d / 2 - 0.045, 0.004);
    pn.rotation.x = 0.35;
  },
  // Playpen: posts, soft rails, mesh on the sides, a pad and toys.
  playpen(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.55);
    const net = transp(0xf4f4f2, 0.45, 0.9);
    const pad = mat(PASTEL[3], 0.9);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) cyl(g, 0.022, h, m, sx * (w / 2 - 0.025), 0, sz * (d / 2 - 0.025), {seg: 12});
    for (const sz of [-1, 1]) {
      cyl(g, 0.022, w - 0.05, m, 0, h - 0.02, sz * (d / 2 - 0.025), {axis: 'x', seg: 12});
      part(g, w - 0.06, h - 0.08, 0.004, net, 0, 0.05, sz * (d / 2 - 0.025), 0.001);
    }
    for (const sx of [-1, 1]) {
      cyl(g, 0.022, d - 0.05, m, sx * (w / 2 - 0.025), h - 0.02, 0, {axis: 'z', seg: 12});
      part(g, 0.004, h - 0.08, d - 0.06, net, sx * (w / 2 - 0.025), 0.05, 0, 0.001);
    }
    part(g, w - 0.06, 0.05, d - 0.06, pad, 0, 0.01, 0, 0.02);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14), mat(0xe96f4c, 0.5));
    b.position.set(-w * 0.2, 0.12, d * 0.1);
    g.add(b);
    for (let i = 0; i < 3; i++)
      part(
        g,
        0.07,
        0.07,
        0.07,
        mat(PASTEL[i], 0.5),
        w * 0.15 + i * 0.06,
        0.06 + (i === 2 ? 0.07 : 0),
        -d * 0.15 + (i === 2 ? -0.03 : 0),
        0.01,
      );
  },
  // Kids' play table: a rounded tabletop on colored legs, pencils.
  kidsTable(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.5);
    const T = 0.025;
    part(g, w, T, d, m, 0, h - T, 0, 0.03);
    let i = 0;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        cyl(g, 0.025, h - T, mat(PASTEL[i++], 0.55), sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), {seg: 16});
    for (let k = 0; k < 3; k++) {
      const q = cyl(g, 0.005, 0.15, mat(ART[k], 0.5), -w * 0.15 + k * 0.025, h + 0.005, 0.05, {
        axis: 'x',
        seg: 8,
      });
      q.rotation.y = 0.3;
    }
    part(g, 0.2, 0.002, 0.28, mat(0xffffff, 0.8), w * 0.15, h, 0, 0.001);
  },
  // Humidifier: base, a transparent water tank, a lid with a mist outlet, a puff of mist.
  humidifier(g, {w, d, h, color}) {
    const wh = mat(tone(color, {white: 0xf6f6f4}), 0.3);
    const r = Math.min(w, d) / 2;
    cyl(g, r, h * 0.32, wh, 0, 0, 0, {seg: 36});
    cyl(g, r * 0.92, h * 0.5, transp(0xcfe6f2, 0.5), 0, h * 0.32, 0, {seg: 36});
    cyl(g, r * 0.86, h * 0.36, transp(0x9fd0ea, 0.35), 0, h * 0.33, 0, {seg: 32});
    cyl(g, r * 0.8, h * 0.12, wh, 0, h * 0.82, 0, {rb: r * 0.9, seg: 32});
    cyl(g, 0.016, 0.03, mat(0x2b2c2f, 0.4), 0, h * 0.94, 0, {seg: 12});
    part(g, 0.03, 0.006, 0.002, glow(0x7fd9ff), 0, h * 0.16, r + 0.001, 0.001);
    for (const [y, s2] of [
      [0.08, 0.05],
      [0.15, 0.07],
      [0.23, 0.06],
    ]) {
      const q = new THREE.Mesh(new THREE.SphereGeometry(s2, 12, 10), transp(0xffffff, 0.18, 0.9));
      q.position.set(0.01, h + y, 0);
      g.add(q);
    }
  },
  // Floor fan: base, pole, motor, a ring-and-spoke guard, blades.
  fan(g, {w, d, h, color}) {
    const m = color === 'black' ? mat(0x232427, 0.4, 0.2) : mat(tone(color, {white: 0xf3f3f1}), 0.4);
    const cg = mat(tone(color, {black: 0x2b2c2f, white: 0xdedfdd}), 0.35, 0.4);
    const r = Math.min(w / 2 - 0.01, 0.2);
    const hy = h - r - 0.01;
    const z = 0.04;
    cyl(g, Math.min(w, d) * 0.42, 0.03, m, 0, 0, 0, {seg: 36});
    cyl(g, 0.015, hy - 0.05, m, 0, 0.03, 0, {seg: 12});
    cyl(g, 0.06, 0.13, m, 0, hy, -0.04, {axis: 'z', seg: 24});
    for (const zz of [z + 0.04, z - 0.03]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 6, 48), cg);
      t.position.set(0, hy, zz);
      g.add(t);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      rod(g, [0, hy, z + 0.045], [Math.cos(a) * r, hy + Math.sin(a) * r, z + 0.04], 0.0018, cg, 4);
    }
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), transp(0xbfd8e6, 0.7, 0.3));
      b.scale.set(r * 0.42, r * 0.18, 0.008);
      const a = (i * Math.PI * 2) / 3;
      b.rotation.z = a;
      b.position.set(Math.cos(a) * r * 0.45, hy + Math.sin(a) * r * 0.45, z);
      g.add(b);
    }
    cyl(g, 0.03, 0.03, m, 0, hy, z + 0.01, {axis: 'z', seg: 16});
  },
  // Picture: a frame, a mat and an abstract composition; poster — a thin frame, the print fills the whole area.
  picture(g, {w, d, h, color, v}) {
    const fr = sideM(color);
    const F = v === 'poster' ? 0.012 : Math.min(0.04, w * 0.07);
    const T = d;
    const k = Math.round(w * 7 + h * 11) % ART.length;
    const A = (i: number): THREE.MeshStandardMaterial => mat(ART[(k + i) % ART.length], 0.7);
    part(g, w, h, T, fr, 0, 0, 0, 0.003);
    const iw = w - 2 * F;
    const ih = h - 2 * F;
    const z = T / 2 + 0.001;
    if (v === 'botanical') {
      part(g, iw, ih, 0.002, mat(0xf2ede2, 0.85), 0, F, z, 0.0005);
      const G = [0x56704a, 0x7b9160, 0x445c3b, 0x8fa070];
      const r = seeded(k * 97 + Math.round(w * 100));
      const cx = 0;
      const base = F + ih * 0.1;
      const top = F + ih * 0.88;
      part(g, 0.004, top - base, 0.001, mat(0x5a5a3e, 0.8), cx, base, z + 0.0015, 0.0004);
      const n = 7 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const u = (i + 1) / (n + 1);
        const y = base + (top - base) * u;
        const s2 = i % 2 ? 1 : -1;
        const L = Math.min(iw * 0.36, ih * 0.16) * (1.15 - u * 0.45);
        const lf = new THREE.Mesh(new THREE.CircleGeometry(1, 20), mat(G[Math.floor(r() * G.length)], 0.8));
        lf.scale.set(L, L * 0.36, 1);
        lf.rotation.z = s2 * (0.5 + r() * 0.35);
        lf.position.set(cx + s2 * L * 0.85, y, z + 0.002 + i * 0.0002);
        g.add(lf);
      }
      const tipL = Math.min(iw * 0.14, ih * 0.08);
      const tip = new THREE.Mesh(new THREE.CircleGeometry(1, 20), mat(G[0], 0.8));
      tip.scale.set(tipL * 0.4, tipL, 1);
      tip.position.set(cx, top, z + 0.0035);
      g.add(tip);
    } else if (v === 'poster') {
      part(g, iw, ih, 0.002, A(4), 0, F, z, 0.0005);
      part(g, iw, ih * 0.45, 0.002, A(1), 0, F, z + 0.0005, 0.0005);
      cyl(g, Math.min(iw, ih) * 0.2, 0.002, A(0), iw * 0.15, F + ih * 0.62, z + 0.001, {axis: 'z', seg: 40});
      part(g, iw * 0.7, 0.01, 0.002, A(5), 0, F + ih * 0.12, z + 0.001, 0.0005);
    } else {
      part(g, iw, ih, 0.003, mat(0xf6f4ef, 0.8), 0, F, z, 0.0005);
      const aw = iw - 0.08;
      const ah = ih - 0.08;
      part(g, aw, ah, 0.002, A(4), 0, F + 0.04, z + 0.002, 0.0005);
      part(g, aw * 0.5, ah * 0.6, 0.002, A(1), -aw * 0.18, F + 0.04 + ah * 0.1, z + 0.003, 0.0005);
      cyl(g, Math.min(aw, ah) * 0.18, 0.002, A(0), aw * 0.18, F + 0.04 + ah * 0.7, z + 0.004, {
        axis: 'z',
        seg: 40,
      });
      part(g, aw * 0.8, ah * 0.04, 0.002, A(2), 0, F + 0.04 + ah * 0.25, z + 0.005, 0.0005);
    }
  },
  // Piano. Upright: a tall case with a lid, side cheeks holding the keybed, 52 white and 36 black keys, a dark name board over them,
  // a kick board with three brass pedals, toe blocks. Digital: a slim case on two side panels, the keyboard, a music rest, a pedal bar.
  piano(g, {w, d, h, color, v = 'upright'}) {
    const c = hexOf(color);
    const gloss = color === 'black' || color === 'white';
    const body = mat(c, gloss ? 0.16 : 0.45);
    const dk = mat(shade(c, 0.62), gloss ? 0.2 : 0.5);
    const ivory = mat(0xf4f1ea, 0.35);
    const ebony = mat(0x141416, 0.22);
    const brass = mat(0xc9a65a, 0.25, 0.8);
    const kd = 0.15;
    const kw = Math.min(w - 0.12, 1.25);
    const ky = v === 'digital' ? h - 0.12 : 0.72;
    const keys = (z0: number): void => {
      part(g, kw, 0.022, kd, ivory, 0, ky, z0 + kd / 2, 0.002);
      const wk = kw / 52;
      for (let i = 0; i < 52; i++)
        if (i)
          part(
            g,
            0.0015,
            0.0225,
            kd - 0.004,
            mat(0xc9c5bc, 0.5),
            -kw / 2 + i * wk,
            ky + 0.0003,
            z0 + kd / 2 + 0.002,
            0.0003,
          );
      for (let i = 0; i < 51; i++) {
        const n = (i + 5) % 7;
        if (n === 2 || n === 6) continue;
        part(g, wk * 0.56, 0.018, 0.09, ebony, -kw / 2 + (i + 1) * wk, ky + 0.02, z0 + 0.045, 0.002);
      }
    };
    if (v === 'digital') {
      for (const sx of [-1, 1])
        part(g, 0.03, ky - 0.02, d - 0.04, body, sx * (w / 2 - 0.015), 0, -0.02, 0.004);
      part(g, w, 0.1, d, body, 0, ky - 0.1, 0, 0.006);
      part(g, w, 0.05, d - kd - 0.02, body, 0, ky, -d / 2 + (d - kd - 0.02) / 2, 0.006);
      keys(d / 2 - kd - 0.01);
      const r = part(g, w * 0.62, 0.24, 0.015, dk, 0, ky + 0.05, -d / 2 + 0.08, 0.004);
      r.rotation.x = -0.18;
      part(g, w - 0.06, 0.012, 0.25, body, 0, 0.1, -0.06, 0.003);
      part(g, 0.3, 0.03, 0.12, mat(0x1d1e20, 0.5), 0, 0, d / 2 - 0.12, 0.006);
      return;
    }
    const cd = d - kd - 0.035;
    const zf = -d / 2 + cd;
    part(g, w, h - 0.03, cd, body, 0, 0, -d / 2 + cd / 2, 0.008);
    part(g, w + 0.02, 0.03, cd + 0.03, body, 0, h - 0.03, -d / 2 + cd / 2 + 0.005, 0.006);
    part(g, w - 0.12, h - ky - 0.32, 0.012, dk, 0, ky + 0.2, zf + 0.004, 0.004); // the upper front panel, a shade darker
    part(g, kw, 0.07, 0.012, dk, 0, ky + 0.03, zf + 0.006, 0.003);
    keys(zf + 0.01);
    part(g, w, 0.06, kd + 0.035, body, 0, ky - 0.06, zf + (kd + 0.035) / 2, 0.006); // the keybed under the keys
    for (const sx of [-1, 1]) {
      part(g, 0.05, 0.36, kd + 0.035, body, sx * (w / 2 - 0.025), ky - 0.27, zf + (kd + 0.035) / 2, 0.008);
      part(g, 0.05, ky - 0.27, 0.06, body, sx * (w / 2 - 0.025), 0, d / 2 - 0.03, 0.006);
    }
    part(g, w - 0.1, ky - 0.1, 0.012, dk, 0, 0.04, zf + 0.007, 0.004);
    for (const x of [-0.11, 0, 0.11]) cyl(g, 0.011, 0.09, brass, x, 0.07, zf + 0.05, {axis: 'z', seg: 12});
  },
  // Staircase: a straight flight rising from the front (+z) to the back, steps ~18 cm high. Solid: steps closed down to the floor in white
  // with treads in the color, a wooden handrail on white balusters; open: floating treads on two black steel stringers and a black rail.
  // The rail is on the right (mirrored: the left).
  stairs(g, {w, d, h, color, v = 'solid'}) {
    const c = hexOf(color);
    const tread = mat(c, 0.55);
    const n = Math.max(4, Math.round(h / 0.18));
    const rise = h / n;
    const run = d / n;
    const open = v === 'open';
    const white = mat(0xeeebe6, 0.6);
    const steel = mat(0x26272a, 0.4, 0.45);
    const side = w / 2 - 0.04;
    for (let i = 0; i < n; i++) {
      const y = (i + 1) * rise;
      const z = d / 2 - run * (i + 0.5);
      if (!open)
        part(g, w, y - 0.035, run, i === n - 1 ? mat(shade(0xeeebe6, 0.96), 0.6) : white, 0, 0, z, 0.002);
      part(g, w, 0.035, run + 0.025, tread, 0, y - 0.035, z + 0.0125, 0.004);
    }
    const slope = Math.atan2(h, d);
    const len = Math.hypot(h, d);
    if (open)
      for (const sx of [-1, 1]) {
        const q = part(g, 0.03, 0.22, len, steel, sx * (w / 2 - 0.08), 0, 0, 0.004);
        q.rotation.x = slope;
        q.position.set(sx * (w / 2 - 0.08), h / 2 - 0.12, 0);
      }
    // the handrail 90 cm above the nosings, a post at the foot, balusters on every second step
    const rail = open ? steel : mat(c, 0.5);
    const bal = open ? steel : white;
    const rq = part(g, 0.05, 0.045, len + 0.1, rail, side, 0, 0, 0.015);
    rq.rotation.x = slope;
    rq.position.set(side, h / 2 + 0.9, 0);
    cyl(g, 0.035, 1.05, rail, side, 0, d / 2 - run * 0.5, {seg: 16});
    for (let i = 1; i < n; i += 2) {
      const y = (i + 1) * rise;
      const z = d / 2 - run * (i + 0.5);
      cyl(g, 0.012, 0.9, bal, side, y, z, {seg: 8});
    }
  },
  // Aquarium on a stand: a stand with doors, a glass tank with water, substrate, plants, stones, fish, a lid with lighting.
  aquarium(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.5);
    const ch = h * 0.55;
    const th = h - ch - 0.06;
    const dk = mat(shade(c, 0.7));
    part(g, w, ch, d, m, 0, 0, 0, 0.006);
    for (const s2 of [-1, 1])
      part(g, w / 2 - 0.012, ch - 0.06, 0.016, mat(shade(c, 1.05), 0.5), (s2 * w) / 4, 0.03, d / 2, 0.003);
    glass(part(g, w, th, d, GLASS, 0, ch, 0, 0.004));
    const wt = part(g, w - 0.02, th * 0.86, d - 0.02, transp(0x4fa3c7, 0.3, 0.05), 0, ch + 0.01, 0, 0.002);
    wt.castShadow = false;
    part(g, w - 0.02, 0.04, d - 0.02, mat(0xd8c49a, 0.95), 0, ch + 0.005, 0, 0.01);
    const pl = mat(0x4d7a43, 0.7);
    const pl2 = mat(0x6b9655, 0.7);
    for (let i = 0; i < 9; i++) {
      const x = -w / 2 + 0.08 + (i * (w - 0.16)) / 8;
      for (let j = 0; j < 3; j++)
        leaf(
          g,
          j % 2 ? pl : pl2,
          [x, ch + 0.04, -d / 2 + 0.08 + (i % 3) * 0.04],
          [(j - 1) * 0.25, 1, 0],
          th * (0.4 + (0.35 * ((i * 7 + j) % 3)) / 2),
          0.012,
        );
    }
    for (const [x, s2] of [
      [0.2, 0.05],
      [-0.1, 0.035],
      [0.32, 0.03],
    ]) {
      const q = new THREE.Mesh(new THREE.SphereGeometry(s2, 10, 8), mat(0x8a8d91, 0.8));
      q.scale.y = 0.6;
      q.position.set(x * w, ch + 0.05, 0.05);
      g.add(q);
    }
    for (const [x, y, c2] of [
      [-0.15, 0.45, 0xff8a3d],
      [0.1, 0.6, 0xffc46b],
      [0.25, 0.35, 0xe96f4c],
    ]) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat(c2, 0.4));
      f.scale.set(0.025, 0.012, 0.008);
      f.position.set(x * w, ch + th * y, 0.02);
      g.add(f);
    }
    part(g, w, 0.06, d, dk, 0, h - 0.06, 0, 0.006);
    part(g, w - 0.06, 0.006, d * 0.4, glow(0xe8f6ff), 0, h - 0.064, 0, 0.002);
  },
  // Cat tree: base, sisal-wrapped posts, shelves, a cubby with an entrance, a bed on top, a toy on a string.
  catTree(g, {w, d, h, color}) {
    const fab = mat(hexOf(color), 0.95);
    const sis = mat(0xcbb48a, 0.95);
    const dk = mat(0x1b1c1e, 0.6);
    part(g, w, 0.05, d, fab, 0, 0, 0, 0.015);
    const p1 = [-w * 0.25, -d * 0.22];
    const p2 = [w * 0.24, d * 0.2];
    const hm = h * 0.55;
    cyl(g, 0.045, hm - 0.05, sis, p1[0], 0.05, p1[1], {seg: 18});
    cyl(g, 0.045, h - 0.12 - 0.05, sis, p2[0], 0.05, p2[1], {seg: 18});
    for (let y = 0.1; y < h - 0.15; y += 0.05) {
      for (const [px, pz, top] of [
        [...p1, hm],
        [...p2, h - 0.12],
      ])
        if (y < top) {
          const t = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.004, 4, 24), mat(0xb9a175, 0.95));
          t.rotation.x = Math.PI / 2;
          t.position.set(px, y, pz);
          g.add(t);
        }
    }
    part(g, w * 0.6, 0.03, d * 0.55, fab, p1[0] + w * 0.1, hm, p1[1] + d * 0.05, 0.01);
    cyl(g, Math.min(w, d) * 0.24, 0.035, fab, p2[0], h - 0.12, p2[1], {seg: 28});
    const t = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, d) * 0.21, 0.03, 8, 28), fab);
    t.rotation.x = Math.PI / 2;
    t.position.set(p2[0], h - 0.06, p2[1]);
    g.add(t);
    part(g, 0.3, 0.26, 0.3, fab, w * 0.18, 0.05, -d * 0.18, 0.04);
    cyl(g, 0.07, 0.004, dk, w * 0.18, 0.18, -d * 0.18 + 0.151, {axis: 'z', seg: 20});
    cyl(g, 0.002, 0.2, mat(0xdddddd, 0.8), p1[0] + w * 0.3, hm - 0.2, p1[1] + d * 0.25, {seg: 4});
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 10), mat(0xe96f4c, 0.5));
    b.position.set(p1[0] + w * 0.3, hm - 0.22, p1[1] + d * 0.25);
    g.add(b);
  },
  // Pet bed: a soft bolster and a cushion; round (an oval sized to fit) or rectangular with a low entrance at the front.
  petBed(g, {w, d, h, color, v}) {
    const M = softMats(color);
    if (v === 'rect') {
      part(g, w, h * 0.4, d, M.frame, 0, 0, 0, 0.03);
      part(g, w, h * 0.6, 0.1, M.fab, 0, h * 0.4, -d / 2 + 0.05, 0.04);
      for (const s2 of [-1, 1])
        part(g, 0.1, h * 0.6, d - 0.1, M.fab, s2 * (w / 2 - 0.05), h * 0.4, 0.05, 0.04);
      part(g, w - 0.2, h * 0.2, 0.08, M.fab, 0, h * 0.4, d / 2 - 0.04, 0.03);
      part(g, w - 0.2, h * 0.25, d - 0.18, M.cush, 0, h * 0.35, 0, 0.05);
    } else {
      cyl(g, 0.5, h * 0.35, M.frame, 0, 0, 0, {sx: w, sz: d, seg: 40});
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.09, 12, 40), M.fab);
      t.rotation.x = Math.PI / 2;
      t.scale.set(w, d, (h / 0.18) * 0.7);
      t.position.y = h * 0.62;
      t.castShadow = true;
      g.add(t);
      cyl(g, 0.5, h * 0.25, M.cush, 0, h * 0.3, 0, {sx: w * 0.72, sz: d * 0.72, seg: 40});
    }
  },
  // Wall bars: two uprights at the wall, rungs every 25 cm; with a pull-up bar — brackets forward and a bar.
  wallBars(g, {w, d, h, color, v}) {
    const c = hexOf(color);
    const m = mat(c, 0.5);
    const mt = mat(0x2b2c2f, 0.4, 0.5);
    const z = -d / 2 + 0.05;
    for (const s2 of [-1, 1]) {
      part(g, 0.045, h, 0.07, m, s2 * (w / 2 - 0.0225), 0, z, 0.008);
      for (const y of [0.3, h - 0.3])
        part(g, 0.06, 0.06, 0.03, mt, s2 * (w / 2 - 0.0225), y, -d / 2 + 0.015, 0.006);
    }
    for (let y = 0.2; y < h - 0.05; y += 0.25) cyl(g, 0.016, w - 0.09, m, 0, y, z, {axis: 'x', seg: 14});
    if (v !== 'plain') {
      const y = h - 0.12;
      for (const s2 of [-1, 1])
        rod(g, [s2 * (w / 2 - 0.0225), y, z], [s2 * (w / 2 - 0.0225), y, d / 2 - 0.04], 0.016, mt);
      cyl(g, 0.016, w - 0.02, mt, 0, y, d / 2 - 0.04, {axis: 'x', seg: 14});
      for (const s2 of [-1, 1])
        cyl(g, 0.022, 0.12, mat(0x1b1c1e, 0.8), s2 * (w / 2 - 0.12), y, d / 2 - 0.04, {axis: 'x', seg: 12});
    }
  },
  // Custom item: a block with rounded edges or a cylinder (an oval sized to fit) — for anything not in the catalog.
  custom(g, {w, d, h, color, v}) {
    const m = finish(color === 'steel' ? 'steel' : color);
    if (v === 'cyl') cyl(g, 0.5, h, m, 0, 0, 0, {sx: w, sz: d, seg: 40});
    else part(g, w, h, d, m, 0, 0, 0, Math.min(0.015, w / 4, d / 4, h / 4));
  },
  // ---------- house: utilities, garage, outdoors ----------
  // Boiler: wall-mounted — a body with a panel and pipes going down; floor-standing — a cabinet with a panel on top.
  gasBoiler(g, {w, d, h, v, color}) {
    const wh = enamel(color, 0xf5f5f3);
    const dk = mat(0x2a2c30, 0.35);
    const ch = CHROME();
    const cu = mat(0xb87333, 0.35, 0.6);
    part(g, w, h, d, wh, 0, 0, 0, 0.03);
    part(g, w * 0.6, 0.06, 0.004, dk, 0, v === 'floor' ? h - 0.12 : h * 0.12, d / 2 + 0.001, 0.004);
    part(
      g,
      w * 0.12,
      0.02,
      0.003,
      glow(0x8fe0ff),
      0,
      v === 'floor' ? h - 0.1 : h * 0.12 + 0.02,
      d / 2 + 0.003,
      0.002,
    );
    if (v !== 'floor')
      for (let i = 0; i < 4; i++) {
        const x = -w / 2 + 0.08 + (i * (w - 0.16)) / 3;
        cyl(g, 0.011, 0.3, i === 1 ? cu : ch, x, -0.3, -d / 2 + 0.1, {seg: 10});
      }
    else
      for (let y = 0.1; y < h * 0.5; y += 0.03)
        part(g, w * 0.6, 0.006, 0.003, mat(0xdcdcd9, 0.5), 0, y, d / 2 + 0.001, 0.002);
  },
  // Electrical panel: a cabinet, a door with a window showing the breakers.
  elPanel(g, {w, d, h, color}) {
    const m = color === 'grey' ? mat(0xb9bcc0, 0.4, 0.3) : mat(tone(color, {white: 0xf3f3f1}), 0.35);
    const dk = mat(0x1d1f22, 0.4);
    part(g, w, h, d, m, 0, 0, 0, 0.008);
    part(
      g,
      w - 0.02,
      h - 0.02,
      0.006,
      mat(color === 'grey' ? 0xc5c8cc : panel(color, 0xfafaf8), 0.3),
      0,
      0.01,
      d / 2 + 0.002,
      0.003,
    );
    part(g, w * 0.75, h * 0.22, 0.004, transp(0x202226, 0.55, 0.05), 0, h * 0.55, d / 2 + 0.006, 0.002);
    for (let i = 0; i < Math.round((w * 0.75) / 0.025); i++)
      part(
        g,
        0.016,
        h * 0.12,
        0.004,
        i % 5 === 0 ? mat(0xd9483b, 0.5) : mat(0xf2f2f0, 0.5),
        -w * 0.36 + i * 0.025 + 0.012,
        h * 0.6,
        d / 2 + 0.004,
        0.001,
      );
    cyl(g, 0.008, 0.01, dk, w / 2 - 0.04, h * 0.45, d / 2 + 0.008, {axis: 'z', seg: 10});
  },
  // Network rack: a frame, a glass door, a router, a switch and a NAS with status lights inside.
  netRack(g, {w, d, h, color}) {
    const m = color === 'white' ? mat(0xf2f2f0, 0.4, 0.2) : mat(tone(color, {black: 0x1b1c1f}), 0.45, 0.3);
    const dv = mat(0x2a2c30, 0.4, 0.3);
    const L = [glow(0x5fe08a), glow(0x5fb8ff), glow(0xffb35f)];
    part(g, w, h, d, m, 0, 0, 0, 0.008);
    const n = Math.max(2, Math.floor((h - 0.12) / 0.09));
    for (let i = 0; i < n; i++) {
      const y = 0.06 + (i * (h - 0.12)) / n;
      const hh = Math.min(0.07, (h - 0.12) / n - 0.015);
      part(g, w - 0.08, hh, d - 0.12, dv, 0, y, -0.02, 0.004);
      for (let k = 0; k < 6; k++)
        part(
          g,
          0.008,
          0.006,
          0.003,
          L[(i + k) % 3],
          -w / 2 + 0.08 + k * 0.03,
          y + hh * 0.6,
          d / 2 - 0.058,
          0.001,
        );
    }
    glass(part(g, w - 0.04, h - 0.06, 0.005, transp(0x2a3038, 0.35, 0.05), 0, 0.03, d / 2 + 0.001, 0.002));
    for (let y = h - 0.05; y > h - 0.2; y -= 0.02)
      part(g, w * 0.5, 0.004, 0.003, mat(0x3a3c40, 0.6), 0, y, d / 2 + 0.004, 0.001);
  },
  // Car: a fastback electric sedan or a large luxury SUV, a smooth lofted body (car3d.js).
  car(g, o) {
    car3d(g, o);
  },
  // Bicycle: spoked wheels, a “triangle” frame, handlebar, saddle.
  bicycle(g, {w, d, h, color}) {
    const c = hexOf(color);
    const fr = mat(c, 0.35, 0.3);
    const dk = mat(0x1b1c1e, 0.7);
    const sp = mat(0xb7bbbf, 0.3, 0.6);
    const R = Math.min(0.34, (h - 0.3) / 2 + 0.05);
    const zf = d / 2 - R - 0.02;
    const zb = -d / 2 + R + 0.02;
    for (const z of [zf, zb]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(R, 0.022, 10, 40), dk);
      t.rotation.y = Math.PI / 2;
      t.position.set(0, R, z);
      t.castShadow = true;
      g.add(t);
      cyl(g, 0.03, 0.06, sp, 0, R, z, {axis: 'x', seg: 12});
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        rod(g, [0, R, z], [0, R + Math.sin(a) * R, z + Math.cos(a) * R], 0.002, sp, 4);
      }
    }
    const bb: Vec3 = [0, R - 0.02, (zf + zb) / 2 - 0.05];
    const seat: Vec3 = [0, h - 0.12, zb + 0.25];
    const head: Vec3 = [0, h - 0.08, zf - 0.18];
    rod(g, [0, R, zb], bb, 0.014, fr);
    rod(g, bb, seat, 0.016, fr);
    rod(g, [0, R, zb], seat, 0.012, fr);
    rod(g, bb, head, 0.02, fr);
    rod(g, seat, head, 0.016, fr);
    rod(g, head, [0, R, zf], 0.016, fr);
    rod(g, head, [0, h, head[2] + 0.03], 0.014, fr);
    cyl(g, 0.012, Math.min(w, 0.6), dk, 0, h, head[2] + 0.03, {axis: 'x', seg: 10});
    part(g, 0.12, 0.04, 0.26, dk, 0, h - 0.1, zb + 0.22, 0.02);
  },
  // Workbench: a thick top, legs, a lower shelf, a vise and a toolbox.
  workbench(g, {w, d, h, color}) {
    const c = hexOf(color);
    const m = mat(c, 0.6);
    const mt = mat(0x3d4f63, 0.45, 0.4);
    const T = 0.05;
    part(g, w, T, d, m, 0, h - T, 0, 0.006);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        part(g, 0.06, h - T, 0.06, mt, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.006);
    part(g, w - 0.1, 0.025, d - 0.1, m, 0, 0.18, 0, 0.004);
    part(g, 0.14, 0.08, 0.12, mt, w / 2 - 0.12, h, d / 2 - 0.08, 0.008);
    part(g, 0.4, 0.12, 0.2, mat(0xc0392b, 0.5, 0.2), -w / 2 + 0.3, h, -0.05, 0.01);
    part(g, 0.5, 0.3, 0.3, mat(0x8a6e4e, 0.8), -w * 0.15, 0.205, -0.05, 0.01);
  },
  // Chest freezer: body, a lid with a seam and a handle, feet.
  freezer(g, {w, d, h, color}) {
    const wh = enamel(color, 0xf4f4f2, 0.32);
    const dk = mat(0x2b2c2f, 0.5);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        part(g, 0.04, 0.03, 0.04, dk, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.006);
    part(g, w, h - 0.11, d, wh, 0, 0.03, 0, 0.02);
    part(g, w + 0.004, 0.08, d + 0.004, color === 'white' ? mat(0xfafaf8, 0.3) : wh, 0, h - 0.08, 0, 0.02);
    part(g, w * 0.3, 0.02, 0.025, mat(0xb7bbbf, 0.3, 0.5), 0, h - 0.07, d / 2 + 0.01, 0.006);
    part(g, 0.05, 0.012, 0.004, glow(0x7ee08a), w / 2 - 0.1, h - 0.12, d / 2 + 0.001, 0.002);
  },
  // Garden table: a metal frame, a slatted top (or a round one).
  patioTable(g, {w, d, h, color, v}) {
    const fr = sideM(color === 'oak' ? 'black' : color);
    const wd = mat(color === 'oak' ? COLORS.oak[1] : 0x9a7a55, 0.7);
    const T = 0.03;
    if (v === 'round') {
      cyl(g, 0.5, T, wd, 0, h - T, 0, {sx: w, sz: d, seg: 40});
      cyl(g, 0.02, h - T, fr, 0, 0, 0, {seg: 12});
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        rod(g, [0, 0.02, 0], [Math.cos(a) * w * 0.35, 0.01, Math.sin(a) * d * 0.35], 0.014, fr);
      }
      return;
    }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        part(g, 0.04, h - T, 0.04, fr, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.004);
    for (const sz of [-1, 1]) part(g, w - 0.06, 0.04, 0.03, fr, 0, h - T - 0.04, sz * (d / 2 - 0.05), 0.004);
    const n = Math.max(4, Math.round(d / 0.09));
    for (let i = 0; i < n; i++)
      part(g, w, T, d / n - 0.008, wd, 0, h - T, -d / 2 + ((i + 0.5) * d) / n, 0.004);
  },
  // Garden chair: a frame with armrests, slatted seat and back.
  patioChair(g, {w, d, h, color}) {
    const fr = sideM(color === 'oak' ? 'black' : color);
    const wd = mat(color === 'oak' ? COLORS.oak[1] : 0x9a7a55, 0.7);
    const S = 0.44;
    for (const sx of [-1, 1]) {
      rod(g, [sx * (w / 2 - 0.03), 0, d / 2 - 0.04], [sx * (w / 2 - 0.03), 0.66, d / 2 - 0.06], 0.014, fr);
      rod(g, [sx * (w / 2 - 0.03), 0, -d / 2 + 0.04], [sx * (w / 2 - 0.03), h, -d / 2 + 0.1], 0.014, fr);
      rod(
        g,
        [sx * (w / 2 - 0.03), 0.66, d / 2 - 0.06],
        [sx * (w / 2 - 0.03), 0.66, -d / 2 + 0.12],
        0.014,
        fr,
      );
    }
    for (let i = 0; i < 5; i++)
      part(
        g,
        w - 0.06,
        0.02,
        (d - 0.18) / 5 - 0.01,
        wd,
        0,
        S,
        d / 2 - 0.06 - ((i + 0.5) * (d - 0.18)) / 5,
        0.004,
      );
    for (let i = 0; i < 4; i++) {
      const q = part(g, w - 0.06, 0.07, 0.02, wd, 0, S + 0.08 + i * 0.09, -d / 2 + 0.075 + i * 0.007, 0.004);
      q.rotation.x = -0.12;
    }
  },
  // Sun lounger: a frame on legs, a slatted bed, a raised backrest, wheels at the head end.
  sunLounger(g, {w, d, h, color}) {
    const own = isHex(color);
    const fr = sideM(own ? color : color === 'oak' ? 'oak' : color === 'graphite' ? 'black' : 'white');
    const sl = mat(
      own ? hexOf(color) : color === 'graphite' ? 0x3a3b3f : color === 'oak' ? COLORS.oak[1] : 0xf2f2f0,
      0.6,
    );
    const Y = 0.3;
    const bl = d * 0.32;
    for (const sx of [-1, 1]) {
      part(g, 0.04, 0.04, d - 0.1, fr, sx * (w / 2 - 0.03), Y - 0.04, 0.05, 0.008);
      for (const z of [d / 2 - 0.08, -d / 2 + 0.3])
        part(g, 0.04, Y - 0.04, 0.04, fr, sx * (w / 2 - 0.03), 0, z, 0.006);
      part(g, 0.04, Y - 0.09, 0.04, fr, sx * (w / 2 - 0.03), 0.05, -d / 2 + 0.12, 0.006);
      cyl(g, 0.05, 0.03, mat(0x2b2c2f, 0.6), sx * (w / 2 - 0.03) + sx * 0.035, 0.05, -d / 2 + 0.12, {
        axis: 'x',
        seg: 16,
      });
    }
    const n = Math.round((d - bl) / 0.06);
    for (let i = 0; i < n; i++) part(g, w - 0.08, 0.02, 0.045, sl, 0, Y, d / 2 - 0.05 - i * 0.06, 0.004);
    const q = new THREE.Group();
    q.position.set(0, Y, -d / 2 + bl);
    q.rotation.x = 0.7;
    g.add(q);
    for (let i = 0; i < Math.round(bl / 0.06); i++)
      part(q, w - 0.08, 0.02, 0.045, sl, 0, 0, -0.03 - i * 0.06, 0.004);
  },
  // Grill: a bowl and a dome lid, a handle, three legs, wheels, a lower shelf.
  grill(g, {w, d, h, color}) {
    const m = color === 'steel' ? finish('steel') : mat(hexOf(color), 0.3, 0.3);
    const dk = mat(0x1b1c1e, 0.6);
    const r = Math.min(w, d) / 2 - 0.02;
    const Y = h - r * 0.95;
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      m,
    );
    b.position.y = Y;
    b.castShadow = true;
    g.add(b);
    const l = new THREE.Mesh(new THREE.SphereGeometry(r * 1.01, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.2), m);
    l.scale.y = 0.85;
    l.position.y = Y;
    l.castShadow = true;
    g.add(l);
    part(g, 0.16, 0.025, 0.03, dk, 0, Y + r * 0.82, 0, 0.01);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + Math.PI / 2;
      rod(
        g,
        [Math.cos(a) * r * 0.5, Y - r * 0.5, Math.sin(a) * r * 0.5],
        [Math.cos(a) * r * 0.95, 0, Math.sin(a) * r * 0.95],
        0.012,
        dk,
      );
    }
    for (const s2 of [-1, 1]) cyl(g, 0.06, 0.03, dk, s2 * r * 0.8, 0.06, -r * 0.4, {axis: 'x', seg: 16});
    cyl(g, r * 0.7, 0.01, mat(0x4a4b4f, 0.6, 0.4), 0, h * 0.3, 0, {seg: 24});
  },
};

// The parts of one item are merged by material (and by shadow casting): dozens of meshes become a few, fewer draw calls
// (the owner: so it doesn't lag on weak devices). It looks the same. If merging fails, it stays as it was.
const ATTR = ['position', 'normal', 'uv'];
function bake(inner: THREE.Group): THREE.Group {
  inner.updateMatrixWorld(true);
  const groups = new Map<string, {m: THREE.Material; cast: boolean; list: Part3d[]}>();
  inner.traverse(o => {
    if (!isPart(o)) return;
    const k = o.material.uuid + (o.castShadow ? '|s' : '');
    if (!groups.has(k)) groups.set(k, {m: o.material, cast: o.castShadow, list: []});
    // made just above when it was missing
    groups.get(k)!.list.push(o);
  });
  const out = new THREE.Group();
  for (const {m, cast, list} of groups.values()) {
    const geos = list.map(o => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!ATTR.includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv)
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.clearGroups();
      g.applyMatrix4(o.matrixWorld);
      return g;
    });
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) {
      geos.forEach(x => x.dispose());
      return inner;
    }
    if (geos.length > 1) geos.forEach(x => x.dispose());
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  inner.traverse(o => isPart(o) && o.geometry.dispose());
  return out;
}
// ---------- Kenney ----------
const kenney = new Map<string, THREE.Group>();
// models — {id: base64 .glb}; assembled by build.ts from assets/kenney.
export async function loadKenney(models: Record<string, string>): Promise<void> {
  const loader = new GLTFLoader();
  // a Kenney model may carry its own scale; none does yet, so every one is drawn at 2
  const entries: Array<Entry & {scale?: number}> = CATALOG.filter(c => c.kind === 'kenney');
  for (const c of entries) {
    const buf = Uint8Array.from(atob(models[c.id]), ch => ch.charCodeAt(0)).buffer;
    const scene = (await loader.parseAsync(buf, '')).scene;
    scene.traverse(o => {
      if (!isMesh(o)) return;
      o.castShadow = o.receiveShadow = true;
      // as in walls-from-json: no metalness and no gloss
      // (GLTFLoader gives a glTF model's materials as MeshStandardMaterial)
      const ms = (Array.isArray(o.material) ? o.material : [o.material]) as THREE.MeshStandardMaterial[];
      o.material = ms.map(m => {
        const k = m.clone();
        k.metalness = 0;
        k.roughness = Math.max(k.roughness ?? 1, 0.55);
        return k;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
    scene.scale.setScalar(c.scale || 2);
    const box = new THREE.Box3().setFromObject(scene);
    const ctr = box.getCenter(new THREE.Vector3());
    const holder = new THREE.Group();
    scene.position.set(-ctr.x, -box.min.y, -ctr.z);
    holder.add(scene);
    c.w = +(box.max.x - box.min.x).toFixed(3);
    c.d = +(box.max.z - box.min.z).toFixed(3);
    c.h = +(box.max.y - box.min.y).toFixed(3);
    kenney.set(c.id, holder);
  }
}
// ---------- built-in wardrobe (runs.js) ----------
// The shape comes ready-made in the plan (item.geo, x/y — plan): the carcass is a prism along the outline, the plinth is recessed, doors run along the front
// of each wall. Each wall is its own part: 3D hides the one facing away from the camera, like tall furniture (userData.ry).
// Without a shape (catalog picture) — a straight w×d wardrobe at the wall.
const P3 = (q: Point, y: number): THREE.Vector3 => new THREE.Vector3(q[0], y, -q[1]);
function prism(
  g: THREE.Object3D,
  mp: MultiPolygon | null | undefined,
  y0: number,
  y1: number,
  m: THREE.Material,
): void {
  for (const P of mp || []) {
    const ring = (r: Point[]): THREE.Vector2[] => r.slice(0, -1).map(q => new THREE.Vector2(q[0], q[1]));
    const sh = new THREE.Shape(ring(P[0]));
    sh.holes = P.slice(1).map(h => new THREE.Path(ring(h)));
    const geo = new THREE.ExtrudeGeometry(sh, {depth: y1 - y0, bevelEnabled: false});
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y0, 0);
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  }
}
// panel along u: center at plan point q, width w, height h from y, thickness t
function slab(
  g: THREE.Object3D,
  m: THREE.Material,
  q: Point,
  u: Vector,
  w: number,
  y: number,
  h: number,
  t: number,
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), m);
  mesh.position.copy(P3(q, y + h / 2));
  mesh.rotation.y = Math.atan2(u[1], u[0]);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
}
/** Hinged fronts along a wall: from y0 to y1, about step wide, the handle at the side, the top or the bottom, the materials. */
interface RunDoors {
  y0: number;
  y1: number;
  step: number;
  handle: 'side' | 'top' | 'bottom';
  front: THREE.Material;
  metal: THREE.Material;
}
// fronts along the line a→b: doors ~step wide, handle — vertical at the edge (wardrobe), bar at the top or bottom (kitchen); y0…y1 — height
function runDoors(
  g: THREE.Object3D,
  [a, b]: Segment,
  u: Vector,
  n: Vector,
  {y0, y1, step, handle, front, metal}: RunDoors,
): void {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const gap = 0.004;
  const k = Math.max(1, Math.round(L / step));
  const dw = (L - gap * (k + 1)) / k;
  const at = (s: number, z: number): Point => [a[0] + u[0] * s + n[0] * z, a[1] + u[1] * s + n[1] * z];
  for (let i = 0; i < k; i++) {
    const c = gap + dw / 2 + i * (dw + gap);
    slab(g, front, at(c, 0.009), u, dw, y0 + gap, y1 - y0 - 2 * gap, 0.018);
    if (handle === 'side') {
      const sd = i % 2 ? -1 : 1;
      slab(
        g,
        metal,
        at(c + sd * (dw / 2 - 0.04), 0.025),
        u,
        0.012,
        Math.min(1, (y1 - y0) * 0.42),
        Math.min(0.35, (y1 - y0) * 0.2),
        0.02,
      );
    } else
      slab(
        g,
        metal,
        at(c, 0.025),
        u,
        Math.min(0.3, dw * 0.5),
        handle === 'top' ? y1 - 0.07 : y0 + 0.042,
        0.012,
        0.018,
      );
  }
}
function runSliding(
  g: THREE.Object3D,
  [a, b]: Segment,
  u: Vector,
  n: Vector,
  {h, front, al}: {h: number; front: THREE.Material; al: THREE.Material},
): void {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const P = 0.06;
  const at = (s: number, k: number): Point => [a[0] + u[0] * s + n[0] * k, a[1] + u[1] * s + n[1] * k];
  const k = Math.max(1, Math.round(L / 0.9));
  const dw = (L - 0.02) / k + (k > 1 ? 0.03 : 0);
  slab(g, al, at(L / 2, 0.03), u, L, h - 0.03, 0.03, 0.06);
  slab(g, al, at(L / 2, 0.03), u, L, P, 0.02, 0.06);
  for (let i = 0; i < k; i++) {
    const c = 0.01 + ((L - 0.02) * (i + 0.5)) / k;
    const z = i % 2 ? 0.045 : 0.015;
    const w = Math.min(dw, L - 0.01);
    slab(g, front, at(c, z), u, w, P + 0.02, h - P - 0.05, 0.018);
    for (const sg of [-1, 1])
      slab(g, al, at(c + sg * (w / 2 - 0.009), z), u, 0.018, P + 0.02, h - P - 0.05, 0.026);
  }
}
/** A wall-run item's look: its height, its variant and its materials. */
interface RunLook {
  h: number;
  v: string | undefined;
  M: Record<'front' | 'body' | 'base' | 'metal' | 'al' | 'top', THREE.Material>;
}
// The look of each wall-run item: which layers (runs.js: body at depth d − layer) and what is on the front.
const RUN_LOOK: Record<string, (g: THREE.Group, s: RunSide, look: RunLook) => void> = {
  // built-in wardrobe: plinth recessed by 5 cm, full-depth carcass, sliding or hinged doors
  wardrobeRun(g, s, {h, v, M}) {
    prism(g, s.layer[0.05].body, 0, 0.06, M.base);
    prism(g, s.body, 0.06, h, M.body);
    if (s.front) {
      if (v === 'sliding') runSliding(g, s.front, s.u, s.n, {h, front: M.front, al: M.al});
      else
        runDoors(g, s.front, s.u, s.n, {
          y0: 0.06,
          y1: h,
          step: 0.5,
          handle: 'side',
          front: M.front,
          metal: M.metal,
        });
    }
  },
  // kitchen base cabinets: dark plinth recessed by 9 cm, carcass by 5 cm, full-depth countertop, ~60 cm fronts with a bar handle at the top
  kitchenBase(g, s, {h, M}) {
    const {P, T} = KB;
    prism(g, s.layer[0.09].body, 0, P, mat(0x2c2d30, 0.7));
    prism(g, s.layer[0.05].body, P, h - T, M.body);
    prism(g, s.body, h - T, h, M.top);
    const f = s.layer[0.05].front;
    if (f)
      runDoors(g, f, s.u, s.n, {y0: P, y1: h - T, step: 0.6, handle: 'top', front: M.front, metal: METAL()});
  },
  // wall cabinets: carcass 2 cm shallower than the depth, ~60 cm fronts with a bar handle at the bottom
  kitchenWall(g, s, {h, M}) {
    prism(g, s.layer[0.02].body, 0, h, M.body);
    const f = s.layer[0.02].front;
    if (f)
      runDoors(g, f, s.u, s.n, {y0: 0, y1: h, step: 0.6, handle: 'bottom', front: M.front, metal: METAL()});
  },
};
function runObject(item: Item3d, c: Entry): THREE.Group {
  const color = item.color || c.color;
  const col = hexOf(color);
  // a variant is [key, name, extra]: the first one's key
  const v = item.v || (c.vars?.[0][0] as string | undefined);
  const h = item.h;
  // a counter-clockwise “room”: the wardrobe along the whole top wall (y = d/2), its front facing −y, toward the picture camera
  const w = item.w / 2;
  const d = item.d / 2;
  const geo =
    item.geo ||
    runShape(
      [
        [-w, -3],
        [w, -3],
        [w, d],
        [-w, d],
      ],
      2 * w + 3 + d,
      item.w,
      item.d,
    );
  const M = {
    front: mat(col, c.id === 'wardrobeRun' ? 0.55 : 0.5),
    body: mat(shade(col, 0.82)),
    base: mat(shade(col, 0.6)),
    metal: mat(0x3c3e42, 0.4),
    al: mat(0xb8bcc0, 0.3, 0.6),
    top: TOP(item.top),
  };
  const out = new THREE.Group();
  const z = zOf(item);
  out.userData.parts = [];
  for (const s of geo?.sides || []) {
    const inner = new THREE.Group();
    RUN_LOOK[c.id](inner, s, {h, v, M});
    if (!inner.children.length) continue;
    const b = bake(inner);
    b.position.y = z;
    b.userData.ry = s.ry;
    out.add(b);
    out.userData.parts.push(b);
  }
  return out;
}
// ---------- an item from parts (model 'parts', parts.js) ----------
// The parts describe the item at its own size (parts.w/d/h); resized on the plan, it is stretched to the item's w/d/h along each axis.
// Shared materials (mat) and merged by material, like a generated item. Parts that do not pass checkItem (a plan from HA or the history
// is not checked by plan-file.js) — a plain box of the item's size.
function partsObject(item: Item3d): THREE.Group {
  const P = item.parts;
  const {w = P?.w, d = P?.d, h = P?.h} = item;
  const inner = new THREE.Group();
  if (P && !checkItem(P).length) {
    inner.add(buildItem(P, m => mat(m.color, m.rough ?? 0.6, m.metal ?? 0)));
    // checked parts have their size, so an item without one takes theirs
    inner.scale.set(w! / P.w, h! / P.h, d! / P.d);
  } else
    part(
      inner,
      w || 0.5,
      h || 0.5,
      d || 0.5,
      finish(item.color || 'white'),
      0,
      0,
      0,
      Math.min(0.015, (w || 0.5) / 4, (d || 0.5) / 4, (h || 0.5) / 4),
    );
  const g = new THREE.Group();
  const b = bake(inner);
  b.position.y = zOf(item);
  g.add(b);
  return g;
}
export function makeObject(item: Item3d): THREE.Group {
  // an item's model is a catalog id (an unknown one fails here)
  const c = byId(item.model)!;
  if (c.run) return runObject(item, c);
  // loadKenney has loaded every Kenney model before the first item is drawn
  if (c.kind === 'kenney') return kenney.get(c.id)!.clone(true);
  if (c.id === 'parts') return partsObject(item);
  // hanging items at their own height (f.z), left/right by mirroring across the width; parts merged by material
  const g = new THREE.Group();
  const inner = new THREE.Group();
  // every generated model has a colour in the catalog (furniture3d.test.ts); a variant is [key, name, extra]
  GEN[c.id](inner, {
    ...item,
    color: item.color || c.color!,
    v: item.v || (c.vars?.[0][0] as string | undefined),
  });
  const b = bake(inner);
  b.position.y = zOf(item);
  if (item.mx) b.scale.x = -1;
  g.add(b);
  return g;
}
// Pictures for the catalog: each item is rendered separately.
export function thumbnails(size = 112): Record<string, string> {
  const r = new THREE.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true});
  r.setSize(size, size);
  r.setPixelRatio(1);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9c8268, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
  const out: Record<string, string> = {};
  for (const c of CATALOG) {
    // a catalog picture: only the item's look, not an item placed on a plan
    const obj = makeObject({model: c.id, w: c.w, d: c.d, h: c.h, color: c.color || 'oak'} as Item3d);
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const s = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const R = Math.max(s.x, s.y, s.z) * 0.72;
    Object.assign(cam, {left: -R, right: R, top: R, bottom: -R});
    cam.updateProjectionMatrix();
    cam.position.copy(ctr).add(new THREE.Vector3(1.4, 1.1, 2).normalize().multiplyScalar(10));
    cam.lookAt(ctr);
    r.render(scene, cam);
    out[c.id] = r.domElement.toDataURL();
    scene.remove(obj);
  }
  r.dispose();
  return out;
}
