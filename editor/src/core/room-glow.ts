// Room glow: a copy of 3d_floor/apartment/smart-home/web/src/room-glow.js (D-049). Do not edit.
import * as THREE from 'three';
import type {Outline, Point} from './types.ts';

/** A room as its glow needs it: its id, its outline and its centre on the plan. */
export interface GlowRoom {
  id: string;
  polygon: Outline;
  center: Point;
}
/** How a glow looks: the floor's height, how high the light rises, its colour, the curtains' and the floor's strength, the falloff. */
export interface GlowOptions {
  floorY?: number;
  height?: number;
  color?: THREE.ColorRepresentation;
  curtain?: number;
  floor?: number;
  power?: number;
}
/** A room's glow (createRoomGlow): the group to add to the scene, its two materials, and how strong it is now. */
export interface RoomGlow {
  group: THREE.Group;
  curtainMaterial: THREE.ShaderMaterial;
  floorMaterial: THREE.ShaderMaterial;
  set(amount: number, boost?: number): void;
}

// Room glow on hover from the panel: fake volumetric light, like the
// highlight of a selected area in strategy games and the “light pillars” in other games:
// there is no real volume, just vertical translucent curtains along the room's
// perimeter and a spot on the floor. The curtains glow additively (they only add light
// to whatever is behind them), brightest at the floor and fading towards the top, so it looks
// as if the floor itself glows and the light rises. No lid, no outline.
//
// Appearing: the light front rises from the floor to the top; disappearing: it settles
// back down. It is a single value, amount 0…1; frames are drawn only while it changes.

// Icy blue, like moonlight. Mint turned swampy when added onto beige walls,
// warm would be confused with lights being on, lavender looks neon.
export const GLOW_COLOR = 0xa3c6ff;
/** Inward offset of the curtains from the walls: on the wall itself they would flicker with its face. */
export const GLOW_INSET = 0.08;
/** Height at which the light fades out; walls are 2.6 m, cut-down ones 1.05 m. */
export const GLOW_HEIGHT = 2.3;

/**
 * Contour offset inwards by d: each edge moves along its inner
 * normal, new vertices are intersections of neighboring edges. Rooms here are
 * simple polygons of right angles and shallow bends, so this is enough.
 */
export function insetPolygon(points: Outline, d: number): Outline {
  const n = points.length;
  if (n < 3 || !d) return points.map((p): Point => [...p]);
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const sign = area > 0 ? 1 : -1; // counterclockwise: the inner normal is to the left of the edge
  const lines = points.map((p, i) => {
    const q = points[(i + 1) % n];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * sign;
    const ny = (dx / len) * sign;
    return {x: p[0] + nx * d, y: p[1] + ny * d, dx, dy};
  });
  return lines.map((b, i): Point => {
    const a = lines[(i - 1 + n) % n];
    const det = a.dx * b.dy - a.dy * b.dx;
    // Neighboring edges on one line: the vertex just moves along the normal.
    if (Math.abs(det) < 1e-9) return [b.x, b.y];
    const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / det;
    return [a.x + a.dx * t, a.y + a.dy * t];
  });
}

const curtainShader = {
  vertexShader: `uniform float floorY;uniform float height;varying float h;
    void main(){h=(position.y-floorY)/height;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  // The light front rises with amount; below it, brightness falls off towards the top.
  fragmentShader: `uniform float amount;uniform float strength;uniform float power;uniform vec3 tint;varying float h;
    void main(){
      float rise=amount*amount*(3.-2.*amount);
      float front=1.-smoothstep(rise*1.15-.35,rise*1.15,h);
      float fall=pow(1.-clamp(h,0.,1.),power);
      gl_FragColor=vec4(tint,fall*front*strength);
    }`,
};
const floorShader = {
  vertexShader:
    'varying vec2 p;void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform float amount;uniform float strength;uniform vec2 center;uniform vec3 tint;varying vec2 p;
    void main(){float d=length(p-center);gl_FragColor=vec4(tint,amount*strength*(.55+.45*exp(-d*d*.25)));}`,
};

/** Glow of one room: curtains along the perimeter and a spot on the floor. */
export function createRoomGlow(
  room: GlowRoom,
  {
    floorY = 0.03,
    height = GLOW_HEIGHT,
    color = GLOW_COLOR,
    curtain = 0.72,
    floor = 0.36,
    power = 1.25,
  }: GlowOptions = {},
): RoomGlow {
  const tint = new THREE.Color(color);
  const ring = insetPolygon(room.polygon, GLOW_INSET);
  // Plan (x, y) → world (x, z = −y), same as the light spot and the room outline.
  const positions: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const a = [x1, floorY, -y1];
    const b = [x2, floorY, -y2];
    const c = [x2, floorY + height, -y2];
    const d = [x1, floorY + height, -y1];
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const common = {
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  };
  const curtainMaterial = new THREE.ShaderMaterial({
    ...common,
    ...curtainShader,
    uniforms: {
      amount: {value: 0},
      strength: {value: curtain},
      power: {value: power},
      tint: {value: tint},
      floorY: {value: floorY},
      height: {value: height},
    },
  });
  const walls = new THREE.Mesh(geometry, curtainMaterial);
  walls.renderOrder = 3;
  const floorMaterial = new THREE.ShaderMaterial({
    ...common,
    ...floorShader,
    uniforms: {
      amount: {value: 0},
      strength: {value: floor},
      tint: {value: tint},
      center: {value: new THREE.Vector2(...room.center)},
    },
  });
  const pool = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape(ring.map(p => new THREE.Vector2(...p)))),
    floorMaterial,
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = floorY + 0.012;
  pool.renderOrder = 3;
  const group = new THREE.Group();
  group.add(pool, walls);
  group.visible = false;
  group.name = 'room_glow_' + room.id;
  return {
    group,
    curtainMaterial,
    floorMaterial,
    /** amount: strength 0…1 (also the front height), boost: a flash on top. */
    set(amount, boost = 1) {
      curtainMaterial.uniforms.amount.value = amount;
      curtainMaterial.uniforms.strength.value = curtain * boost;
      floorMaterial.uniforms.amount.value = amount;
      floorMaterial.uniforms.strength.value = floor * boost;
      group.visible = amount > 0.002;
    },
  };
}
