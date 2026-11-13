// Colors in the generated models: every visible catalog model has a color to choose and draws a custom #rrggbb; a rug's border takes color2.
import test from 'node:test';
import assert from 'node:assert/strict';
import type * as THREE from 'three';
import {CATALOG, byId} from './catalog.ts';
import {makeObject} from './furniture3d.ts';
import type {Item3d} from './furniture3d.ts';
import type {CatalogEntry} from './types.ts';

const isMesh = (o: THREE.Object3D): o is THREE.Mesh => (o as THREE.Mesh).isMesh === true;
// a test item: only its look, not an item placed on a plan
const itemOf = (look: Partial<Item3d>): Item3d => look as Item3d;
const colorsIn = (g: THREE.Object3D): Set<number> => {
  const s = new Set<number>();
  g.traverse(o => {
    // the generated models' materials are MeshStandardMaterial
    if (isMesh(o))
      for (const m of [o.material].flat() as THREE.MeshStandardMaterial[]) s.add(m.color.getHex());
  });
  return s;
};
// catalog.ts's entries are CatalogEntry data
const models = CATALOG.filter(c => !c.hidden && c.kind === 'gen') as CatalogEntry[];

test('every visible model has a color to choose', () => {
  assert.deepEqual(
    models.filter(c => !c.color).map(c => c.id),
    [],
  );
});
test('a custom color: every visible model in every variant builds and draws it', () => {
  const bad: string[] = [];
  for (const c of models)
    for (const v of c.vars?.map(x => x[0]) || [undefined]) {
      let g;
      try {
        g = makeObject(itemOf({model: c.id, w: c.w, d: c.d, h: c.h, color: '#3a7bd5', v}));
      } catch (e) {
        // what a generator throws is an Error
        bad.push(`${c.id} ${v ?? ''}: ${(e as Error).message}`);
        continue;
      }
      if (!colorsIn(g).has(0x3a7bd5)) bad.push(`${c.id} ${v ?? ''}: the color is not drawn`);
    }
  assert.deepEqual(bad, []);
});
test('a rug: the field in color, the border in color2; without color2 — a darker shade of the field', () => {
  const rug = {model: 'rug', w: 2, d: 1.4, h: 0.012, color: '#b8b1a5'};
  for (const v of ['rect', 'round', 'oval']) {
    const auto = colorsIn(makeObject(itemOf({...rug, v})));
    const two = colorsIn(makeObject(itemOf({...rug, v, color2: '#978e80'})));
    assert.ok(auto.has(0xb8b1a5) && !auto.has(0x978e80), v);
    assert.ok(two.has(0xb8b1a5) && two.has(0x978e80), v);
  }
});
test('a built-in wardrobe can reach the ceiling of a 2.7 m room', () => {
  // the catalog has it
  const wardrobe = byId('wardrobeRun') as CatalogEntry;
  assert.ok(wardrobe.max[2] >= 2.7);
});
