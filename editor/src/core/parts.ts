// An item described by simple parts (furniture model 'parts'): what the AI build could not match to the catalog comes as a few
// blocks, cylinders, spheres, profiles and turned shapes. The item: {w, d, h, materials: {name: {color '#rrggbb', rough 0–1, metal 0–1}},
// parts: [...]}, at most 4 materials and 60 parts after expanding repeat. Item coordinates: origin on the floor at the center of the
// footprint, x along the width, y up, z along the depth, the front faces +z, meters; the item fits in x ±w/2, y 0…h, z ±d/2.
// Parts: box {size: [w,h,d], round}, cyl {r, h, r2 (top radius), seg}, sphere {r, scale: [x,y,z]}, profile {points: [[x,y],…] in the x–y
// plane, depth along z}, lathe {points: [[r,y],…] turned around y}, repeat {count, step: [x,y,z], part}. Every part: mat, at: [x,y,z] —
// the anchor (box, cyl, sphere stand on it; profile and lathe use their own coordinates around it), tilt: [x,y,z] degrees around the anchor.
// Optional: under (true, or the height in meters up to which it slides under a table: a chair's seat) and table (true, or the
// tabletop height) — a chair from parts at a table from parts is then tucked under it, not overlapping it (layout.js), as catalog
// chairs and tables are.
// checkItem works without WebGL (plan-file.js validates with it); buildItem makes a three.js group, furniture3d.js bakes it.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import type {ExpandedPart, ItemCheck, Part, PartMaterial, PartsItem, ShapePart, Vec3} from './types.ts';

// A value from a file read as an object: its fields are unknown until checked, and a value that is not an object has none
// (reading one gives undefined, as `value?.field` always did).
type Fields = {readonly [field: string]: unknown} | null | undefined;

export const LIMITS = {parts: 60, materials: 4, tolerance: 0.02, maxSize: 6, repeat: 50};
const KINDS = ['box', 'cyl', 'sphere', 'profile', 'lathe', 'repeat'];
const HEX = /^#[0-9a-f]{6}$/i;
const isList = (x: unknown): x is unknown[] => Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const pos = (x: unknown): x is number => num(x) && x > 0;
const vec = (x: unknown, n = 3): x is number[] => Array.isArray(x) && x.length === n && x.every(num);
const pts = (x: unknown, min: number): x is Array<[number, number]> =>
  Array.isArray(x) && x.length >= min && x.every(p => vec(p, 2));
const add = (a: readonly number[], b: readonly number[], k = 1): Vec3 => [
  a[0] + b[0] * k,
  a[1] + b[1] * k,
  a[2] + b[2] * k,
];

// Repeats become plain parts, each with its own path for error messages ("parts[3].part#2": the 3rd entry, copy 2).
// The parts of a checked item come back as shapes; anything else comes back as it was, each entry unknown.
export function expand(parts: readonly Part[], path?: string): ExpandedPart[];
export function expand(
  parts: readonly unknown[] | null | undefined,
  path?: string,
): Array<{part: unknown; path: string}>;
export function expand(
  parts: readonly unknown[] | null | undefined,
  path = 'parts',
): Array<{part: unknown; path: string}> {
  const out: Array<{part: unknown; path: string}> = [];
  (parts || []).forEach((p, i) => {
    const here = `${path}[${i}]`;
    const fields = p as Fields;
    if (fields?.kind !== 'repeat') {
      out.push({part: p, path: here});
      return;
    }
    const count = fields.count;
    const n = typeof count === 'number' && Number.isInteger(count) ? Math.min(count, LIMITS.repeat) : 0;
    for (let k = 0; k < n; k++)
      for (const q of expand([fields.part], `${here}.part`)) {
        const copy = q.part as Fields;
        out.push({
          part: {
            ...copy,
            at: add(vec(copy?.at) ? copy.at : [0, 0, 0], vec(fields.step) ? fields.step : [0, 0, 0], k),
          },
          path: `${q.path}#${k + 1}`,
        });
      }
  });
  return out;
}

function checkPart(value: unknown, path: string, mats: object, errors: string[]): void {
  if (!value || typeof value !== 'object') {
    errors.push(`${path}: not an object`);
    return;
  }
  const p = value as Fields & object;
  if (!KINDS.some(kind => kind === p.kind)) {
    errors.push(`${path}: unknown kind "${p.kind}" (use ${KINDS.join(', ')})`);
    return;
  }
  if (p.kind === 'repeat') {
    const count = p.count;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > LIMITS.repeat)
      errors.push(`${path}: count must be an integer 1–${LIMITS.repeat}`);
    if (!vec(p.step)) errors.push(`${path}: step must be [x, y, z]`);
    checkPart(p.part, `${path}.part`, mats, errors);
    return;
  }
  // Object.hasOwn reads any value as a key, as it always did
  if (!Object.hasOwn(mats, p.mat as PropertyKey))
    errors.push(`${path}: material "${p.mat}" is not in materials`);
  if (!vec(p.at)) errors.push(`${path}: at must be [x, y, z]`);
  if (p.tilt != null && !vec(p.tilt)) errors.push(`${path}: tilt must be [x, y, z] degrees`);
  if (p.kind === 'box') {
    if (!vec(p.size) || !p.size.every(pos)) errors.push(`${path}: size must be [w, h, d], all > 0`);
    if (p.round != null && !(num(p.round) && p.round >= 0)) errors.push(`${path}: round must be ≥ 0`);
  } else if (p.kind === 'cyl') {
    if (!pos(p.r) || !pos(p.h)) errors.push(`${path}: r and h must be > 0`);
    if (p.r2 != null && !(num(p.r2) && p.r2 >= 0)) errors.push(`${path}: r2 must be ≥ 0`);
    const seg = p.seg;
    if (seg != null && !(typeof seg === 'number' && Number.isInteger(seg) && seg >= 3 && seg <= 64))
      errors.push(`${path}: seg must be an integer 3–64`);
  } else if (p.kind === 'sphere') {
    if (!pos(p.r)) errors.push(`${path}: r must be > 0`);
    if (p.scale != null && !(vec(p.scale) && p.scale.every(pos)))
      errors.push(`${path}: scale must be [x, y, z], all > 0`);
  } else if (p.kind === 'profile') {
    if (!pts(p.points, 3)) errors.push(`${path}: points must be at least 3 [x, y] pairs`);
    if (!pos(p.depth)) errors.push(`${path}: depth must be > 0`);
  } else if (p.kind === 'lathe') {
    if (!pts(p.points, 2) || p.points.some(([r]) => r < 0))
      errors.push(`${path}: points must be at least 2 [r, y] pairs with r ≥ 0`);
  }
}

// Structural check without three.js: everything needed to build. Returns error strings (empty — buildable).
export function checkItem(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['the item must be a JSON object'];
  const item = value as Fields & object;
  const errors: string[] = [];
  for (const k of ['w', 'd', 'h']) {
    const size = item[k];
    if (!pos(size) || size > LIMITS.maxSize)
      errors.push(`${k} must be a number in meters, 0–${LIMITS.maxSize}`);
  }
  const materials = item.materials;
  const mats = materials && typeof materials === 'object' && !Array.isArray(materials) ? materials : {};
  const names = Object.keys(mats);
  if (!names.length) errors.push('materials: at least one material is needed');
  if (names.length > LIMITS.materials)
    errors.push(`materials: at most ${LIMITS.materials} (got ${names.length})`);
  for (const [n, value] of Object.entries(mats)) {
    const m = value as Fields;
    if (!HEX.test(String(m?.color || ''))) errors.push(`materials.${n}: color must be "#rrggbb"`);
    for (const k of ['rough', 'metal']) {
      const amount = m?.[k];
      if (amount != null && !(num(amount) && amount >= 0 && amount <= 1))
        errors.push(`materials.${n}: ${k} must be 0–1`);
    }
  }
  for (const k of ['under', 'table']) {
    const height = item[k];
    if (height != null && height !== true && !(num(height) && height > 0 && height <= LIMITS.maxSize))
      errors.push(`${k} must be true or a height in meters`);
  }
  const parts = item.parts;
  if (!isList(parts) || !parts.length) {
    errors.push('parts: at least one part is needed');
    return errors;
  }
  parts.forEach((p, i) => checkPart(p, `parts[${i}]`, mats, errors));
  const n = expand(parts).length;
  if (n > LIMITS.parts) errors.push(`parts: at most ${LIMITS.parts} after expanding repeat (got ${n})`);
  return errors;
}

const rad = (d: number): number => (d * Math.PI) / 180;
const isMesh = (o: THREE.Object3D): o is THREE.Mesh => (o as THREE.Mesh).isMesh === true;
function geometry(p: ShapePart): THREE.BufferGeometry {
  switch (p.kind) {
    case 'box': {
      const [w, h, d] = p.size;
      const r = Math.min(p.round || 0, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
      const g = r > 0.001 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
      g.translate(0, h / 2, 0);
      return g;
    }
    case 'cyl': {
      const g = new THREE.CylinderGeometry(p.r2 ?? p.r, p.r, p.h, p.seg || 24);
      g.translate(0, p.h / 2, 0);
      return g;
    }
    case 'sphere': {
      const g = new THREE.SphereGeometry(p.r, 28, 18);
      const s = p.scale || [1, 1, 1];
      g.scale(s[0], s[1], s[2]);
      g.translate(0, p.r * s[1], 0);
      return g;
    }
    case 'profile': {
      const shape = new THREE.Shape(p.points.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ExtrudeGeometry(shape, {depth: p.depth, bevelEnabled: false, curveSegments: 12});
      g.translate(0, 0, -p.depth / 2);
      return g;
    }
    case 'lathe':
      return new THREE.LatheGeometry(
        p.points.map(([r, y]) => new THREE.Vector2(r, y)),
        36,
      );
  }
}
// The part's at is its pivot: box, cyl and sphere stand on it (bottom center); profile and lathe use their own coordinates around it.
// tilt rotates the part around at.
function partObject(p: ShapePart, material: THREE.Material): THREE.Group {
  const mesh = new THREE.Mesh(geometry(p), material);
  mesh.castShadow = mesh.receiveShadow = true;
  const pivot = new THREE.Group();
  pivot.position.set(...p.at);
  if (p.tilt) pivot.rotation.set(rad(p.tilt[0]), rad(p.tilt[1]), rad(p.tilt[2]));
  pivot.add(mesh);
  return pivot;
}

// A group at the item's own size (item.w × item.h × item.d). material(m) makes a material from {color, rough, metal}:
// the editor passes its shared cache (furniture3d.js), so equal materials of different items are one.
const ownMaterial = (m: PartMaterial): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({color: m.color, roughness: m.rough ?? 0.6, metalness: m.metal ?? 0});
export function buildItem(
  item: PartsItem,
  material: (m: PartMaterial) => THREE.Material = ownMaterial,
): THREE.Group {
  const mats: Record<string, THREE.Material> = {};
  for (const [n, m] of Object.entries(item.materials)) mats[n] = material(m);
  const group = new THREE.Group();
  for (const {part, path} of expand(item.parts)) {
    const o = partObject(part, mats[part.mat]);
    o.userData.path = path;
    group.add(o);
  }
  return group;
}

// Full check: structure, then geometry — every part must stay inside the item's box (w × h × d) within the tolerance.
// Warnings do not stop drawing; errors do.
export function validateItem(value: unknown): ItemCheck {
  const errors = checkItem(value);
  if (errors.length) return {errors, warnings: []};
  const item = value as PartsItem; // checkItem found nothing wrong
  const warnings: string[] = [];
  const t = LIMITS.tolerance;
  const {w, d, h} = item;
  const group = buildItem(item);
  const all = new THREE.Box3();
  group.updateMatrixWorld(true);
  for (const o of group.children) {
    const b = new THREE.Box3().setFromObject(o);
    const out: string[] = [];
    all.union(b);
    if (b.min.x < -w / 2 - t || b.max.x > w / 2 + t)
      out.push(`x ${b.min.x.toFixed(3)}…${b.max.x.toFixed(3)} (allowed ±${(w / 2).toFixed(3)})`);
    if (b.min.y < -t || b.max.y > h + t)
      out.push(`y ${b.min.y.toFixed(3)}…${b.max.y.toFixed(3)} (allowed 0…${h.toFixed(3)})`);
    if (b.min.z < -d / 2 - t || b.max.z > d / 2 + t)
      out.push(`z ${b.min.z.toFixed(3)}…${b.max.z.toFixed(3)} (allowed ±${(d / 2).toFixed(3)})`);
    if (out.length) warnings.push(`${o.userData.path} sticks out of the item box: ${out.join('; ')}`);
  }
  const s = all.getSize(new THREE.Vector3());
  const extents: Array<[string, number, number]> = [
    ['width', s.x, w],
    ['height', s.y, h],
    ['depth', s.z, d],
  ];
  for (const [k, got, want] of extents)
    if (got < want * 0.9)
      warnings.push(
        `the parts fill only ${got.toFixed(2)} m of the ${k} ${want.toFixed(2)} m — the item will look smaller than its size`,
      );
  group.traverse(o => isMesh(o) && o.geometry.dispose());
  return {errors: [], warnings, parts: expand(item.parts).length};
}

// A short stable key of the parts for the 3D cache (scene.js rebuilds an item when its key changes): another plan may have an item
// with the same id and size but other parts. Computed once per parts object.
const keys = new WeakMap<object, string>();
export function partsKey(parts: unknown): string {
  if (!parts || typeof parts !== 'object') return '';
  let k = keys.get(parts);
  if (k == null) {
    const s = JSON.stringify(parts);
    let x = 2166136261;
    for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
    k = (x >>> 0).toString(36) + s.length.toString(36);
    keys.set(parts, k);
  }
  return k;
}
