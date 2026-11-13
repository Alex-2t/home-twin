import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {isHex, lab, deltaE, snapColor, shadeHex} from './color.js';
import {COLORS, hexOf} from './catalog.js';

const near = (a, b, eps = 0.02) => a.every((x, i) => Math.abs(x - b[i]) < eps);
test('Lab and ΔE as the AI build measures them: white, black, the bedroom rug and linen', () => {
  assert.ok(near(lab(0xffffff), [100, 0, 0]));
  assert.ok(near(lab(0), [0, 0, 0]));
  assert.equal(+deltaE(0xb8b1a5, COLORS.linen[1]).toFixed(1), 11.7);
});
test('a picked color practically equal to a swatch (ΔE < 3) selects it; otherwise it stays custom', () => {
  const sw = ['oak', 'walnut', 'white', 'graphite'].map(k => [k, COLORS[k][1]]);
  assert.equal(snapColor('#c9a578', sw), 'oak');
  assert.equal(snapColor('#EEEBE7', sw), 'white');
  assert.equal(snapColor('#D0AA70', sw), '#d0aa70');
  assert.equal(snapColor('#3a7bd5', sw), '#3a7bd5');
  assert.equal(snapColor('#c9a578', []), '#c9a578');
});
test('a color is a named key or #rrggbb; the shade matches the 3D one', () => {
  assert.ok(
    isHex('#3a7bd5') &&
      isHex('#3A7BD5') &&
      !isHex('#3a7bd') &&
      !isHex('3a7bd5') &&
      !isHex('oak') &&
      !isHex(null),
  );
  assert.equal(hexOf('#3a7bd5'), 0x3a7bd5);
  assert.equal(hexOf('oak'), COLORS.oak[1]);
  assert.equal(hexOf('nope', 7), 7);
  assert.equal(hexOf(undefined), COLORS.white[1]);
  for (const c of [0xc8a477, 0x3a7bd5, 0x27282b, 0xeeebe6])
    assert.equal(shadeHex(c, 0.78), new THREE.Color(c).multiplyScalar(0.78).getHex());
});
