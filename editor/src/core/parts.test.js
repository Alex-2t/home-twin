// Items from parts (model 'parts'): validation, building at the plan's size, merging, and the plan file round trip.
// parts.examples.json — real items written by the AI build (a sofa, a round table, an office chair, a plant, a lit mirror, a TV).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {checkItem, validateItem, buildItem, expand, LIMITS, partsKey} from './parts.js';
import {makeObject} from './furniture3d.js';
import {byId, nameOf, zOf} from './catalog.js';
import {migrate} from './plan.js';
import {readPlan} from './plan-file.js';

const EX = JSON.parse(fs.readFileSync(new URL('./parts.examples.json', import.meta.url), 'utf8'));
const tiny = (parts, extra = {}) => ({w: 1, d: 1, h: 1, materials: {m: {color: '#aabbcc'}}, parts, ...extra});
const block = (size, at = [0, 0, 0]) => ({kind: 'box', mat: 'm', size, at});
const sizeOf = o => {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const meshes = o => {
  const out = [];
  o.traverse(x => x.isMesh && out.push(x));
  return out;
};

test('parts: the AI build examples are valid and fit their box', () => {
  for (const [k, item] of Object.entries(EX)) {
    assert.deepEqual(checkItem(item), [], k);
    const r = validateItem(item);
    assert.deepEqual(r.errors, [], k);
    assert.ok(!r.warnings.some(w => w.includes('sticks out')), k + ': ' + r.warnings.join('; '));
    assert.ok(r.parts <= LIMITS.parts, k);
  }
});

test('parts: typical mistakes are caught and named by path', () => {
  const has = (item, ...words) => {
    const e = checkItem(item);
    assert.ok(
      e.some(x => words.every(w => x.includes(w))),
      `${words.join(' ')} — got ${JSON.stringify(e)}`,
    );
  };
  has(tiny([{...block([1, -1, 1]), mat: 'nope', at: [0, 0]}, {kind: 'blob'}]), 'parts[0]', 'material "nope"');
  has(tiny([block([1, -1, 1])]), 'parts[0]', 'size');
  has(tiny([{...block([1, 1, 1]), at: [0, 0]}]), 'parts[0]', 'at must be');
  has(tiny([{kind: 'blob'}]), 'parts[0]', 'unknown kind');
  has(tiny([{kind: 'cyl', mat: 'm', r: 0, h: 1, at: [0, 0, 0]}]), 'r and h');
  has(tiny([{kind: 'cyl', mat: 'm', r: 0.1, h: 1, seg: 2, at: [0, 0, 0]}]), 'seg');
  has(tiny([{...block([0.1, 0.1, 0.1]), tilt: [1, 2]}]), 'tilt');
  has(
    tiny([
      {
        kind: 'profile',
        mat: 'm',
        points: [
          [0, 0],
          [1, 0],
        ],
        depth: 0.1,
        at: [0, 0, 0],
      },
    ]),
    'points',
  );
  has(
    tiny([
      {
        kind: 'lathe',
        mat: 'm',
        points: [
          [-1, 0],
          [1, 1],
        ],
        at: [0, 0, 0],
      },
    ]),
    'r ≥ 0',
  );
  has(tiny([{kind: 'repeat', count: 0, step: [0, 0, 0], part: block([0.1, 0.1, 0.1])}]), 'count');
  has(tiny([block([0.1, 0.1, 0.1])], {materials: {m: {color: 'red'}}}), 'materials.m', 'color');
  has(tiny([block([0.1, 0.1, 0.1])], {materials: {m: {color: '#aabbcc', rough: 2}}}), 'rough');
  has(tiny([block([0.1, 0.1, 0.1])], {w: 0}), 'w must be');
  has(tiny([block([0.1, 0.1, 0.1])], {h: 7}), 'h must be');
  has(tiny([]), 'at least one part');
  has(tiny([block([0.1, 0.1, 0.1])], {materials: {}}), 'at least one material');
  // a material name from the object prototype is not a material
  has(tiny([{...block([0.1, 0.1, 0.1]), mat: 'constructor'}]), 'material "constructor"');
  const mats = Object.fromEntries([1, 2, 3, 4, 5].map(i => ['m' + i, {color: '#000000'}]));
  has(tiny([{...block([0.1, 0.1, 0.1]), mat: 'm1'}], {materials: mats}), 'materials: at most');
  const rep = {kind: 'repeat', count: 31, step: [0, 0, 0], part: block([0.01, 0.01, 0.01])};
  has(tiny([rep, rep]), 'parts: at most');
  for (const x of [null, [], 'sofa', 42]) assert.deepEqual(checkItem(x), ['the item must be a JSON object']);
});

test('parts: repeat expands with steps and keeps paths', () => {
  const list = expand([{kind: 'repeat', count: 3, step: [0.1, 0, 0], part: block([0.05, 0.05, 0.05])}]);
  assert.equal(list.length, 3);
  assert.deepEqual(
    list[2].part.at.map(v => +v.toFixed(3)),
    [0.2, 0, 0],
  );
  assert.match(list[1].path, /#2$/);
});

test('parts: profile, lathe and sphere build', () => {
  const r = validateItem(
    tiny([
      {
        kind: 'profile',
        mat: 'm',
        points: [
          [-0.4, 0],
          [0.4, 0],
          [0.3, 0.5],
          [-0.3, 0.5],
        ],
        depth: 0.4,
        at: [0, 0, 0],
      },
      {
        kind: 'lathe',
        mat: 'm',
        points: [
          [0, 0.5],
          [0.2, 0.55],
          [0.1, 0.9],
          [0, 0.95],
        ],
        at: [0, 0, 0],
      },
      {kind: 'sphere', mat: 'm', r: 0.05, scale: [1, 0.6, 1], at: [0.3, 0.5, 0]},
    ]),
  );
  assert.deepEqual(r.errors, []);
});

test('parts: built at its own size, stretched to the plan size along each axis', () => {
  // a block that fills its box exactly: the bounding box is the item's w × h × d, at any size
  const full = tiny([{...block([1, 1, 1]), round: 0.05}]);
  for (const [w, d, h] of [
    [1, 1, 1],
    [2.2, 0.95, 0.82],
    [0.3, 1.6, 2.4],
  ]) {
    const b = sizeOf(makeObject({model: 'parts', parts: full, w, d, h}));
    assert.ok(
      near(b.min.x, -w / 2) &&
        near(b.max.x, w / 2) &&
        near(b.min.z, -d / 2) &&
        near(b.max.z, d / 2) &&
        near(b.min.y, 0) &&
        near(b.max.y, h),
      `${w}×${d}×${h}`,
    );
  }
  // the examples: at their own size they match their box; resized, they stretch exactly by the ratio
  for (const [k, P] of Object.entries(EX)) {
    const own = sizeOf(makeObject({model: 'parts', parts: P, w: P.w, d: P.d, h: P.h})),
      s = own.getSize(new THREE.Vector3()),
      t = LIMITS.tolerance;
    assert.ok(
      s.x <= P.w + 2 * t &&
        s.x >= P.w * 0.9 &&
        s.y <= P.h + t &&
        s.y >= P.h * 0.9 &&
        s.z <= P.d + 2 * t &&
        s.z >= P.d * 0.9,
      `${k}: ${s.toArray().map(x => x.toFixed(3))}`,
    );
    const [kw, kd, kh] = [1.3, 0.8, 1.15],
      big = sizeOf(makeObject({model: 'parts', parts: P, w: P.w * kw, d: P.d * kd, h: P.h * kh}));
    for (const [a, kk] of [
      ['x', kw],
      ['y', kh],
      ['z', kd],
    ])
      assert.ok(
        near(big.min[a], own.min[a] * kk, 1e-5) && near(big.max[a], own.max[a] * kk, 1e-5),
        `${k} ${a}`,
      );
  }
});

test('parts: merged by material, materials shared between items, the height above the floor kept', () => {
  const P = EX.sofa,
    o = makeObject({model: 'parts', parts: P, w: P.w, d: P.d, h: P.h, z: 0.3}),
    M = meshes(o);
  assert.ok(M.length <= Object.keys(P.materials).length * 2, `${M.length} meshes`); // one per material (and per shadow casting)
  assert.ok(
    near(
      sizeOf(o).min.y,
      0.3 + sizeOf(makeObject({model: 'parts', parts: P, w: P.w, d: P.d, h: P.h})).min.y,
      1e-6,
    ),
  );
  const again = meshes(makeObject({model: 'parts', parts: structuredClone(P), w: 1, d: 1, h: 1}));
  assert.ok(
    again.every(m => M.some(x => x.material === m.material)),
    'the same colors use the same materials',
  );
  // buildItem alone: one object per part, at the item's own size
  assert.equal(buildItem(P).children.length, expand(P.parts).length);
});

test('parts: broken or missing parts draw a plain box of the item size instead of failing', () => {
  for (const parts of [
    undefined,
    null,
    {w: 1},
    tiny([{kind: 'blob'}]),
    tiny([{...block([1, 1, 1]), mat: 'constructor'}]),
  ]) {
    const b = sizeOf(makeObject({model: 'parts', parts, w: 0.8, d: 0.5, h: 1.2})).getSize(
      new THREE.Vector3(),
    );
    assert.ok(near(b.x, 0.8, 1e-3) && near(b.y, 1.2, 1e-3) && near(b.z, 0.5, 1e-3), JSON.stringify(parts));
  }
});

test('parts: a hidden catalog entry — defaults, the item name, never in the picker', () => {
  const c = byId('parts');
  assert.ok(c && c.hidden && c.kind === 'gen' && !c.color && !c.vars && !c.mirror);
  assert.equal(nameOf({model: 'parts', name: 'Sofa'}), 'Sofa');
  assert.equal(zOf({model: 'parts'}), 0);
  assert.equal(zOf({model: 'parts', z: 1.2}), 1.2);
  for (const P of Object.values(EX))
    for (const [i, k] of ['w', 'd', 'h'].entries()) assert.ok(P[k] >= c.min[i] && P[k] <= c.max[i]);
});

test('parts: the key changes with the parts, not with the copy', () => {
  const P = EX.tv;
  assert.equal(partsKey(P), partsKey(structuredClone(P)));
  assert.equal(partsKey(undefined), '');
  assert.notEqual(partsKey(P), partsKey({...P, materials: {...P.materials, tv: {color: '#000000'}}}));
});

const plan = furniture =>
  migrate({
    rooms: [
      {
        id: 'r',
        name: 'Room',
        polygon: [
          [0, 0],
          [6, 0],
          [6, 5],
          [0, 5],
        ],
      },
    ],
    furniture,
  });
const item = (parts, extra = {}) => ({
  id: 'f12',
  model: 'parts',
  name: 'Sofa',
  x: 2.4,
  y: 0.6,
  w: 2.2,
  d: 0.95,
  h: 0.82,
  rot: 0,
  parts,
  ...extra,
});
test('parts: a plan file keeps parts unchanged; an invalid item rejects the file and names it', () => {
  const p = plan([
    item(EX.sofa),
    item(EX.officeChair, {id: 'f13', name: 'Office chair', z: 0, w: 0.7}),
    {id: 'f14', model: 'bed', x: 1, y: 1, w: 1.6, d: 2.1, h: 1, rot: 90},
  ]);
  const back = readPlan(JSON.stringify(p));
  assert.deepEqual(back, p);
  assert.deepEqual(back.furniture[0].parts, EX.sofa);
  assert.deepEqual(readPlan(JSON.stringify(back)), p); // and once more, as the history and versions keep it (JSON)
  const bad = [
    undefined,
    {...EX.tv, parts: []},
    {...EX.tv, materials: {}},
    {...EX.tv, parts: [{kind: 'box', mat: 'tv', size: [1, 1], at: [0, 0, 0]}]},
  ];
  for (const parts of bad)
    assert.throws(() => readPlan(JSON.stringify(plan([item(parts)]))), /Invalid plan file: furniture "f12"/);
  // parts on another model are checked too
  assert.throws(
    () =>
      readPlan(
        JSON.stringify(
          plan([{id: 'f1', model: 'custom', x: 1, y: 1, w: 1, d: 1, h: 1, rot: 0, parts: {w: 1}}]),
        ),
      ),
    /furniture "f1"/,
  );
});
