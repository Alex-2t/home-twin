// The room light mask's shader (card/room-light-mask.ts, D-115): a dark light costs a few instructions, not a full BRDF, and a
// fragment outside a room's box skips that room's edges — without changing what the mask gives.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {installRoomLightMask} from './card/room-light-mask.ts';
import type {Outline} from './types.ts';

const ROOM: Outline = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
];

/** The fragment shader a lit material gets with the mask installed for one room and one lamp of each kind. */
function maskedFragmentShader(polygon: Outline): string {
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const lights = [new THREE.PointLight(), new THREE.SpotLight(), new THREE.RectAreaLight()];
  scene.add(...lights);
  installRoomLightMask(scene, [{room: {polygon}, lights}], scene);
  const shader = {
    uniforms: {},
    vertexShader: '',
    fragmentShader: 'void main() {\n#include <lights_fragment_begin>\n}',
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader.fragmentShader;
}

const count = (text: string, part: string): number => text.split(part).length - 1;

test('room light mask: point and spot shading is skipped where the light adds nothing; sun and area lights as before', () => {
  const fragment = maskedFragmentShader(ROOM);
  const guarded = 'if ( directLight.visible ) { RE_Direct(';
  assert.equal(count(fragment, guarded), 2, 'one guard in the point loop, one in the spot loop');
  const pointLoop = fragment.slice(fragment.indexOf('pointLight = pointLights[ i ];'));
  assert.ok(
    pointLoop.indexOf(guarded) < pointLoop.indexOf('spotLight = spotLights[ i ];'),
    'the first is in the point loop',
  );
  const directionalLoop = fragment.slice(fragment.indexOf('directionalLight = directionalLights[ i ];'));
  assert.ok(directionalLoop.includes('\t\tRE_Direct('), 'the sun is shaded as before');
  assert.ok(
    fragment.includes('if(any(greaterThan(rectAreaLight.color,vec3(0.0))))'),
    'area lights keep their own skip',
  );
});

test('room light mask: a room returns 0 outside its box widened by the feather', () => {
  const fragment = maskedFragmentShader(ROOM);
  // the plan's y is the world's -z: the room spans x 0…4, z -3…0, widened by 2.5 cm
  const boxTest =
    'if (any(lessThan(p,vec2(-0.025000,-3.025000))) || any(greaterThan(p,vec2(4.025000,0.025000)))) return 0.0;';
  assert.ok(fragment.includes(boxTest), 'the box test comes before the edges');
  assert.ok(fragment.includes('smoothstep(0.0,0.025000,distanceToEdge)'), 'the same feather as the box');
  const degenerate = maskedFragmentShader([
    [0, 0],
    [1, 0],
  ]);
  assert.ok(
    !degenerate.includes('lessThan(p,'),
    'an outline without an area gets no box (no Infinity in the shader)',
  );
});
