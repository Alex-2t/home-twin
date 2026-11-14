// Colors in the generated models: every visible catalog model has a color to choose and draws a custom #rrggbb; a rug's border takes
// color2, and a rug's pattern draws both colours.
import test from 'node:test';
import assert from 'node:assert/strict';
import type * as THREE from 'three';
import {CATALOG, byId} from './catalog.ts';
import {makeObject} from './furniture3d.ts';
import type {Item3d} from './furniture3d.ts';

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
const models = CATALOG.filter(c => !c.hidden && c.kind === 'gen');

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
      // makeObject draws a model whose generator fails as a plain box (in its colour): that is a failure here
      if (g.userData.plainBox) bad.push(`${c.id} ${v ?? ''}: drawn as a plain box`);
      else if (!colorsIn(g).has(0x3a7bd5)) bad.push(`${c.id} ${v ?? ''}: the color is not drawn`);
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
// The pictures on the rugs' patterned tops: their textures, by the materials that carry one.
const texturesIn = (g: THREE.Object3D): THREE.DataTexture[] => {
  const found: THREE.DataTexture[] = [];
  g.traverse(o => {
    // the generated models' materials are MeshStandardMaterial
    if (isMesh(o))
      for (const m of [o.material].flat() as THREE.MeshStandardMaterial[])
        if (m.map) found.push(m.map as THREE.DataTexture);
  });
  return found;
};
// The colours a picture holds (0xrrggbb).
const pixelColours = (texture: THREE.DataTexture): Set<number> => {
  const pixels = texture.image.data as Uint8Array;
  const colours = new Set<number>();
  for (let i = 0; i < pixels.length; i += 4)
    colours.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
  return colours;
};
test('a rug with a pattern: its body in the field colour, its top a picture of both colours, in every shape', () => {
  const rug = {model: 'rug', w: 2, d: 1.4, h: 0.012, color: '#b8b1a5', color2: '#3a4a6b'};
  for (const pat of ['tiles', 'stripes', 'mottled'])
    for (const v of ['rect', 'round', 'oval']) {
      const drawn = makeObject(itemOf({...rug, v, pat}));
      const textures = texturesIn(drawn);
      assert.equal(textures.length, 1, `${pat} ${v}`);
      assert.ok(colorsIn(drawn).has(0xb8b1a5), `${pat} ${v}: the body`);
      const colours = pixelColours(textures[0]);
      assert.ok(colours.has(0xb8b1a5) && colours.has(0x3a4a6b), `${pat} ${v}: both colours`);
    }
});
test("a rug's pattern without color2 uses the border's darker shade; one the rug does not have draws its own look", () => {
  const rug = {model: 'rug', w: 2, d: 1.4, h: 0.012, color: '#b8b1a5', v: 'rect'};
  const plain = colorsIn(makeObject(itemOf(rug)));
  const shadeOnly = [...plain].filter(colour => colour !== 0xb8b1a5);
  const tiles = texturesIn(makeObject(itemOf({...rug, pat: 'tiles'})));
  assert.ok(
    shadeOnly.some(colour => pixelColours(tiles[0]).has(colour)),
    'the darker shade is in the tiles',
  );
  const unknown = makeObject(itemOf({...rug, pat: 'paisley'}));
  assert.deepEqual(texturesIn(unknown), []);
  assert.deepEqual(colorsIn(unknown), plain);
});
test('a worktop key from a file: an unknown one, even one every object has, is gray stone', () => {
  const base = {model: 'kitchenBase', w: 0.6, d: 0.6, h: 0.9};
  const stone = colorsIn(makeObject(itemOf(base)));
  assert.deepEqual(colorsIn(makeObject(itemOf({...base, top: 'toString'}))), stone);
  assert.deepEqual(colorsIn(makeObject(itemOf({...base, top: 'nope'}))), stone);
});
test('a worktop in a custom colour: every model with a worktop draws it', () => {
  for (const entry of CATALOG.filter(model => model.tops && !model.hidden)) {
    const unit = {model: entry.id, w: entry.w, d: entry.d, h: entry.h, top: '#3a7bd5'};
    assert.ok(colorsIn(makeObject(itemOf(unit))).has(0x3a7bd5), entry.id);
  }
});
test('a built-in wardrobe can reach the ceiling of a 2.7 m room', () => {
  // the catalog has it
  const wardrobe = byId('wardrobeRun')!; // the catalog has it
  assert.ok(wardrobe.max[2] >= 2.7);
});
