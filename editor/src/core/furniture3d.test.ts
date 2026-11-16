// Colors in the generated models: every visible catalog model has a color to choose and draws a custom #rrggbb; a rug's border takes
// color2, and a rug's pattern draws both colours.
import test from 'node:test';
import assert from 'node:assert/strict';
import type * as THREE from 'three';
import {CATALOG, byId} from './catalog.ts';
import {makeObject} from './furniture3d.ts';
import type {Item3d} from './furniture3d.ts';
import {RUG_PATTERNS} from './rug-pattern-spec.ts';

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
// Whether a picture holds a colour, each channel within this much of it.
const holdsNear = (colours: Set<number>, target: number, within: number): boolean =>
  [...colours].some(colour =>
    [16, 8, 0].every(shift => Math.abs(((colour >> shift) & 255) - ((target >> shift) & 255)) <= within),
  );
// A plaid mixes its bands in partly: where they cross is near the second colour, not the colour itself.
const PLAID_CROSSING_WITHIN = 40;
test('a rug with a pattern: its body in the field colour, its top a picture of both colours, in every shape', () => {
  const rug = {model: 'rug', w: 2, d: 1.4, h: 0.012, color: '#b8b1a5', color2: '#3a4a6b'};
  for (const pat of RUG_PATTERNS)
    for (const v of ['rect', 'round', 'oval']) {
      const drawn = makeObject(itemOf({...rug, v, pat}));
      const textures = texturesIn(drawn);
      assert.equal(textures.length, 1, `${pat} ${v}`);
      assert.ok(colorsIn(drawn).has(0xb8b1a5), `${pat} ${v}: the body`);
      const colours = pixelColours(textures[0]);
      const within = pat === 'plaid' ? PLAID_CROSSING_WITHIN : 0;
      assert.ok(colours.has(0xb8b1a5) && holdsNear(colours, 0x3a4a6b, within), `${pat} ${v}: both colours`);
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
test("a rug's own pattern draws instead of its named one; one with nothing drawable draws the named one", () => {
  const rug = {
    model: 'rug',
    w: 2,
    d: 1.4,
    h: 0.012,
    color: '#b8b1a5',
    color2: '#3a4a6b',
    v: 'round',
    pat: 'tiles',
  };
  const own = {colors: ['#c03030'], layers: [{shape: 'frame' as const, color: 2, inset: 0.05, width: 0.08}]};
  const drawnOwn = pixelColours(texturesIn(makeObject(itemOf({...rug, patSpec: own})))[0]);
  assert.ok(drawnOwn.has(0xc03030), 'its own colour');
  assert.ok(!drawnOwn.has(0x3a4a6b), 'no tiles of the second colour');
  const odd = {layers: [{shape: 'paisley'}]} as unknown as typeof own;
  const tiles = texturesIn(makeObject(itemOf(rug)))[0].image.data;
  assert.deepEqual(texturesIn(makeObject(itemOf({...rug, patSpec: odd})))[0].image.data, tiles);
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
// Curtains and blinds move in place as their motor runs (D-122): the same meshes, set to any position, not only whole percents, and
// set in place they look as built at that position.
test('curtains and blinds: set in place to any position, the same as built there', async () => {
  const THREE = await import('three');
  // every mesh's box, where it is drawn
  const extent = (g: THREE.Object3D): number[] => {
    g.updateMatrixWorld(true);
    const out: number[] = [];
    g.traverse(o => {
      if (!isMesh(o)) return;
      const box = new THREE.Box3().setFromObject(o, true);
      out.push(...[...box.min.toArray(), ...box.max.toArray()].map(x => Math.round(x * 1e5) / 1e5));
    });
    return out;
  };
  const meshes = (g: THREE.Object3D): string[] => {
    const ids: string[] = [];
    g.traverse(o => isMesh(o) && ids.push(o.uuid));
    return ids;
  };
  const covers: Array<Partial<Item3d>> = [
    ...['roller', 'venetian', 'daynight'].map(v => ({
      model: 'blind',
      w: 1.2,
      d: 0.1,
      h: 1.6,
      color: 'white',
      v,
    })),
    {model: 'curtains', w: 2, d: 0.2, h: 2.6, color: 'linen'},
  ];
  for (const cover of covers) {
    const name = `${cover.model} ${cover.v ?? ''}`;
    const g = makeObject(itemOf({...cover, open: 0}));
    const setOpen = g.userData.setOpen as (open?: number) => void;
    assert.equal(typeof setOpen, 'function', name);
    const before = meshes(g);
    setOpen(0.5);
    const half = extent(g);
    setOpen(0.503);
    assert.notDeepEqual(extent(g), half, `${name}: moves by less than a percent`);
    assert.deepEqual(meshes(g), before, `${name}: built again`);
    for (const open of [0, 0.37, 1]) {
      setOpen(open);
      assert.deepEqual(extent(g), extent(makeObject(itemOf({...cover, open}))), `${name} at ${open}`);
    }
  }
});
