// 3D view: walls, floor and glass from buildPlan2d, furniture and lights. Walls are rebuilt in full when rooms are edited.
// Floor, wall shading, soft light and Neutral tone mapping — D-028 (the render used to match the walls-from-json sketch, D-006).
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {WALL, pointIn} from './geometry.ts';
import {trimBoxes} from './trim.ts';
import {formFor, lineForm, shadeOf, housingOf} from './fixtures.ts';
import {makeObject} from './furniture3d.ts';
import {partsKey} from './parts.ts';
import {createAirflow} from './airflow.ts';
import {createRoomGlow} from './room-glow.ts';
import {zOf, byId} from './catalog.ts';
import {LABEL, itemH} from './sensors.ts';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
// Lighting is a copy of the card code from 3d_floor (card/), D-006.
import {buildDeviceLights, setDeviceLighting} from './card/lighting.ts';
import {installRoomLightMask} from './card/room-light-mask.ts';
import {
  floorKind,
  FLOOR_KINDS,
  floorTexture,
  floorUV,
  bakeAO,
  bakeFinish,
  aoUniforms,
  withAO,
} from './surfaces.ts';
import {floorPieces} from './pieces.ts';
import type {LightDevice} from './card/lighting.ts';
import type {Item3d} from './furniture3d.ts';
import type {
  FacadeSideId,
  FurnitureItem,
  HomeView,
  LightForm,
  MultiPolygon,
  Outline,
  PlacedOpening,
  PlanLight,
  Point,
  Room,
  Vec3,
  Vector,
  WallPlan,
} from './types.ts';
export {floorColor} from './surfaces.ts';

/** One line of a reading on a wall: its caption, its number as text, its level (0 normal, 1 attention, 2 bad), digit size, colour. */
export interface SensorLabelItem {
  label: string;
  text: string;
  lvl?: number;
  k?: number;
  c?: string;
}

/**
 * A reading on a wall (sensors.ts layoutSensors, D-033): its sensor and room; c and n, the point on the wall face and the normal
 * into the room (plan); its width w and scale; its centre's height y (none: LABEL.y); its size; what it says; the wall's colour.
 */
export interface SensorSpot {
  id: string;
  room: string;
  c: Point;
  n: Vector;
  w: number;
  scale: number;
  y?: number;
  size: {w: number; h: number; ws: number[]};
  items: SensorLabelItem[];
  base?: string | null;
}

/** The airflow of an air conditioner (airflow.ts). */
type Airflow = ReturnType<typeof createAirflow>;

/** An air conditioner from HA (devices.ts liveScene): its entity, its item on the plan, and what its airflow shows. */
export type ClimateSpot = {id: string; f: FurnitureItem} & Parameters<Airflow['set']>[0];

/** A contact sensor from HA (devices.ts liveScene): its entity, the opening's ends, heights and normal into the room, open or not. */
export interface ContactSpot {
  id: string;
  a: Point;
  b: Point;
  /** The opening's sill and head, metres; older files may lack them (see setContacts). */
  bottom?: number;
  top?: number;
  n: Vector;
  open: boolean;
}

/** An angle to look from: round the vertical and down from it (radians); how much of the room it shows. */
export interface ViewAngle {
  theta: number;
  phi: number;
  score?: number;
  vis?: number;
}

/** What is under the pointer (pick): where on the plan and how high, a point a little back towards the camera, the item hit. */
export interface PickHit {
  p: Point;
  z: number;
  inside: Point;
  item: string | null;
}

/** The 3D view (createView): what the editor's screens and the dashboard card do with it. */
export interface SceneView {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  /** The sky light and the sun. */
  lights: {hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight};
  /** The shading uniforms the walls and the floor read (surfaces.ts aoUniforms). */
  ao: ReturnType<typeof aoUniforms>;
  /** Out of sight: no frames until resume. */
  pause(): void;
  resume(): void;
  /** Gone for good: the GPU context and the listeners are let go. */
  dispose(): void;
  /** Compiles the scene's shaders off the page's thread. */
  warm(): Promise<unknown>;
  /** Draws the next frames. */
  redraw(): void;
  /** Panels cover l pixels on the left, r on the right and b at the bottom: the model fits into the rest. */
  setInsets(l: number, r?: number, b?: number): void;
  setTheme(dark: boolean): void;
  setSensors(list: SensorSpot[]): void;
  /** The home view's direction on the plan, [x, y]. */
  homeCam(): [number, number];
  /** To the home view, smoothly. */
  home(): void;
  getView(): HomeView;
  setHome(view: HomeView | null | undefined): void;
  /** Called when the view is moved by hand (true) or goes back to the home view (false). */
  onMoved(listener: (moved: boolean) => void): void;
  moved(): boolean;
  /** Turns the camera round the target by an angle in radians; false while a flight is on. */
  spin(angle: number): boolean;
  setClimate(list: ClimateSpot[]): void;
  setContacts(list: ContactSpot[]): void;
  /** To a saved view, smoothly; none: home. */
  flyTo(view?: HomeView | null): void;
  /** Outlines a room on the floor (none: no outline). */
  setOutline(id: string | null | undefined): void;
  /** These rooms glow from the floor; pulse: three waves. */
  setGlow(ids?: string[], options?: {pulse?: boolean}): void;
  /** The next walls fit the whole plan again. */
  reframe(): void;
  /** Shows an outline (plan metres) in the middle of the view, from the angle that sees most of it; none: the whole model. */
  focus(poly: Outline | null | undefined, options?: {pad?: number}): ViewAngle | undefined;
  /** The walls, the floors and the glass; null: an empty scene. */
  set(plan2d: null): void;
  set(plan2d: WallPlan, rooms: Room[], openings: PlacedOpening[], selected?: string | null): void;
  setFurniture(items: Item3d[], selected?: string | null): void;
  setLights(list: PlanLight[], rooms: Room[]): void;
  /** Keeps each lamp's light inside its room; the time it took, ms. */
  applyMask(rooms: Room[]): number;
  setLightOn(id: string, on: boolean | undefined): void;
  /** A lamp's brightness 0–1 while it blinks; null: as it is. */
  setLightLevel(id: string, level: number | null): void;
  /** A lamp shines for a moment (selected, placed or changed). */
  shine(id: string, t0?: number): void;
  /** Light only in this room (null: everywhere); with ids, only these lamps, in a darkened scene. */
  setSolo(roomId: string | null | undefined, ids?: string[] | null): void;
  setNight(night: boolean): void;
  lightCount(): number;
  /** How long the last shading map took, ms. */
  aoMs(): number;
  /** Highlights a room's floor. */
  select(id: string | null | undefined): void;
  pick(clientX: number, clientY: number): PickHit | null;
  /** A point of the plan at height z, in the view's pixels. */
  project(point: Point, z?: number): [number, number];
  /** The view as it is now, drawn once more. */
  snapshot(): HTMLCanvasElement;
}

/** A lamp in the view: placed, so it has its height. */
type PlacedLamp = PlanLight & {h: number};

/** A fixture's part: its own mesh with a standard material. */
type LampMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

/** A light source the view keeps in its fixed set. */
type PoolLight = THREE.PointLight | THREE.RectAreaLight | THREE.SpotLight;

/** A fixture's probe for its facade side (userData.probe): the room's outline and the fixture's height. */
type FixtureProbe = [poly: Outline, h: number];

/** A facade side in the view: its walls' group and the direction its outer face points. */
interface FacadeGroup {
  id: FacadeSideId;
  grp: THREE.Group;
  out: THREE.Vector3;
}

/** A lamp in the view: the plan lamp, the one it shines as (its host for a part of another fixture), its parts and its state. */
interface Dev {
  L: PlanLight;
  src: PlacedLamp;
  form: LightForm;
  device: LightDevice;
  lights: PoolLight[];
  meshes: LampMesh[];
  glow: LampMesh[];
  halos: THREE.Sprite[];
  room: {id: string; polygon: Outline; center: Point};
  on: boolean | undefined;
  /** Its brightness while it blinks; null: not blinking. */
  blink: number | null;
  /** How much it is lit by the "own room" fade, 0–1. */
  solo: number;
}

/** A highlight of a lamp's shine: a halo, a ring spreading on the floor, or a spot of the wave along a strip. */
type ShinePart =
  | {o: THREE.Sprite; kind: 'halo'; big: number}
  | {o: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; kind: 'ring'; at: number; big: number}
  | {o: THREE.Sprite; kind: 'run'; s: number; total: number};

/** A lamp's shine: when it started, its highlights, its colour now, from and towards, and how strong it is now (m, e). */
interface Shine {
  t0: number;
  parts: ShinePart[];
  col: THREE.Color;
  base: THREE.Color;
  hot: THREE.Color;
  m: number;
  e: number;
}

/** A reading's label on a wall: its canvas, texture and plane; drawn dim or not, for what; the spot it is on and its facade side. */
interface SensorLabel {
  cv: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  dim: boolean | null;
  key: string;
  data: SensorSpot;
  sp?: SensorSpot;
  /** The wall colour it was painted for. */
  pb?: string;
  side?: FacadeSideId | null;
}

/** Where the camera is: its target, its angles, its distance and its frame [w, h]. */
interface CameraPose {
  t: THREE.Vector3;
  theta: number;
  phi: number;
  r: number;
  fit: number[];
}

/** A camera flight: when it started, how long it takes, how far it turns, from and to. */
interface Tween {
  t0: number;
  dur: number;
  turn: number;
  from: CameraPose;
  to: CameraPose;
}

const isMesh = (object: THREE.Object3D): object is THREE.Mesh => (object as THREE.Mesh).isMesh === true;
const isPointLight = (light: PoolLight): light is THREE.PointLight =>
  (light as THREE.PointLight).isPointLight === true;
const isSpotLight = (light: PoolLight): light is THREE.SpotLight =>
  (light as THREE.SpotLight).isSpotLight === true;

// Shading near walls and in corners: one map per scene (surfaces.js); walls and floor read it in the shader.
const AOU = aoUniforms();
// walls are warm white; the inner side of exterior walls has the same color as partitions
const wallMat = withAO(new THREE.MeshStandardMaterial({color: 0xf0ece5, roughness: 0.92}), AOU, true);
// skirting boards and door and window trim: white satin paint (D-080)
const trimMat = new THREE.MeshStandardMaterial({color: 0xf3f1ec, roughness: 0.5});
const facadeMat = withAO(new THREE.MeshStandardMaterial({color: 0xece8e0, roughness: 0.95}), AOU, true);
const capMat = new THREE.MeshStandardMaterial({color: 0x4a4f57, roughness: 0.8});
const slabMat = new THREE.MeshStandardMaterial({color: 0xb7b1a7, roughness: 0.9});
// Daylight: sky (h), sun (s), reflections (e). The sun is high (SUN.up m above the center, SUN.back m to the side) and follows
// the camera: it shines from over the viewer's left shoulder (SUN.turn), so visible walls are lit at any rotation instead of sinking into gray
// shadow. SOFT is the shadow edge blur.
// Day (2026-11-07, the owner: “the model is so bright that turning on a light is barely noticeable”): overall light is weaker than before
// (sky 1.4 → 0.82, sun 1.6 → 1.15, ambient 0.6 → 0.34). Lamps by day at 55% (D-067: their light is local now, so it no longer floods
// the room with peach; it was 42%, before that 20%).
const DAY = {h: 0.82, s: 1.15, e: 0.34};
const SUN = {up: 14, back: 6.5, turn: THREE.MathUtils.degToRad(40)};
const SOFT = 3;
const SIDE_AO: Record<FacadeSideId, number> = {S: 0, E: 1, N: 2, W: 3};
const DAY_LAMPS = 0.75;
// Lamp light (D-067, the owner: “I don't like how the light works”). It used to be one point under the ceiling per lamp reaching 4.5 m in amber
// (#ffce87): every lamp lit the whole flat evenly and turning it on tinted the walls yellow instead of lighting a place. Now:
//  - the colour: a lamp's colour mixed halfway with white — a warm white keeps the finishes their own colour, a coloured lamp stays coloured;
//  - pools, not a flood: pendants and spots shine down in a cone (a pool on the table, on the floor), lamps and sconces light about 2.5 m around
//    them, a ceiling light the room; strips are about 2.5 times softer;
//  - the fixture shows it is on: a soft halo at the shade or bulb, stronger by day (when the room light hardly shows) than at night.
const LAMP_TINT = 0.5;
const STRIP_POWER = 75;
const WHITE = new THREE.Color(0xffffff);
// a cone per spot, up to CONE_MAX; a fixture with more — one wide cone in the middle (each source costs every pixel: a wall tablet with the card)
const CONE: Partial<Record<LightForm, {power: number; angle: number}>> = {
  pendant: {power: 72, angle: 0.8},
  spots: {power: 60, angle: 0.62},
};
const CONE_MAX = 2;
const NEAR: Partial<Record<LightForm, number>> = {lamp: 2.6, wall: 2.6, ceiling: 4.5};
const HALO: {day: number; night: number; size: Record<string, number | undefined>} = {
  day: 0.85,
  night: 0.5,
  size: {pendant: 0.7, spots: 0.34, ceiling: 0.9, wall: 0.55, lamp: 0.62, table: 0.6},
};
const glassMat = new THREE.MeshStandardMaterial({
  color: 0xcfe6f2,
  roughness: 0.05,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const railMat = new THREE.MeshStandardMaterial({color: 0xb9bec4, roughness: 0.3, metalness: 0.7}); // a glass railing's handrail
const OUT: Record<FacadeSideId, THREE.Vector3> = {
  S: new THREE.Vector3(0, 0, 1),
  E: new THREE.Vector3(1, 0, 0),
  N: new THREE.Vector3(0, 0, -1),
  W: new THREE.Vector3(-1, 0, 0),
};

const toShapes = (mp: MultiPolygon): THREE.Shape[] =>
  mp.map(([outer, ...holes]) => {
    const shape = new THREE.Shape(outer.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)));
    holes.forEach(h =>
      shape.holes.push(new THREE.Path(h.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)))),
    );
    return shape;
  });
function prism(mp: MultiPolygon, bottom: number, top: number): THREE.ExtrudeGeometry | null {
  if (!mp.length || top - bottom < 1e-4) return null;
  const g = new THREE.ExtrudeGeometry(toShapes(mp), {
    depth: top - bottom,
    bevelEnabled: false,
    curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bottom, 0);
  return g;
}

export function createView(host: HTMLElement): SceneView {
  let dirty = 2;
  const redraw = () => {
    dirty = 2;
  }; // frames on demand (see loop): 2 — this frame and the next
  const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => !!motion?.matches;
  const DEG0 = THREE.MathUtils.degToRad;
  RectAreaLightUniformsLib.init();
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0xe9edf1, 1);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-9, 9, 6, -6, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  renderer.domElement.style.cursor = 'grab';
  controls.addEventListener('start', () => {
    renderer.domElement.style.cursor = 'grabbing';
  });
  controls.addEventListener('end', () => {
    renderer.domElement.style.cursor = 'grab';
  });
  // Like Blender: middle button orbits, Shift + middle pans; left orbits too (a trackpad has no middle button), Shift + left pans.
  controls.mouseButtons = {LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN};
  // Trackpad like Blender: two fingers orbit, Shift + two fingers pan, pinch zooms. Mouse wheel zooms.
  renderer.domElement.addEventListener(
    'wheel',
    e => {
      if (!controls.enabled) return; // a still picture (the compact dashboard card): the page scrolls
      // wheelDeltaY: the browsers' own field, not in the standard event; a mouse wheel moves in steps of 120
      const wheelDeltaY = (e as WheelEvent & {wheelDeltaY?: number}).wheelDeltaY;
      const mouse =
        e.deltaX === 0 && wheelDeltaY !== undefined && wheelDeltaY !== 0 && wheelDeltaY % 120 === 0;
      if (e.ctrlKey || mouse) return; // OrbitControls zooms by itself
      e.preventDefault();
      e.stopImmediatePropagation();
      setMoved(true);
      tween = null;
      const off = camera.position.clone().sub(controls.target);
      if (e.shiftKey) {
        const k = 1 / (camera.zoom * 60);
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
        const d = right.multiplyScalar(e.deltaX * k).add(up.multiplyScalar(-e.deltaY * k));
        controls.target.add(d);
        camera.position.add(d);
      } else {
        const sph = new THREE.Spherical().setFromVector3(off);
        sph.theta += e.deltaX * 0.005;
        sph.phi = Math.max(
          controls.minPolarAngle + 0.01,
          Math.min(controls.maxPolarAngle, sph.phi + e.deltaY * 0.005),
        );
        camera.position.copy(controls.target).add(off.setFromSpherical(sph));
      }
      camera.lookAt(controls.target);
    },
    {passive: false, capture: true},
  );
  const onMotion = () => {
    controls.enableDamping = !reducedMotion();
  };
  onMotion();
  motion?.addEventListener('change', onMotion);
  controls.dampingFactor = 0.12;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minZoom = 0.4;
  controls.maxZoom = 6;
  // Daylight is soft, like inside an apartment, not sun through a removed roof: diffuse from above (sky and floor bounce), sun
  // high and weaker, shadow with a blurred edge. That way there are no big slanted shadows on walls, while shadows under furniture and corner shading remain.
  const hemi = new THREE.HemisphereLight(0xf6f6ff, 0xb39f88, DAY.h);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e6, DAY.s);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = SOFT;
  scene.add(sun, sun.target);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = DAY.e;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({opacity: 0.22}));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.235;
  ground.receiveShadow = true;
  scene.add(ground);
  // The background is a studio, not a void (D-032): a soft gradient towards the window edges, under the model a light platform with a 1 m grid (like the plan's
  // grid), fading towards the edges. Colors follow the theme, day and night; with a lamp selected they darken together with the overall light. Tone mapping leaves it alone.
  const NOISE = '(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.';
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {cIn: {value: new THREE.Color()}, cOut: {value: new THREE.Color()}, asp: {value: 1}},
      vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=vec4(position.xy,1.,1.);}',
      fragmentShader: `uniform vec3 cIn,cOut;uniform float asp;varying vec2 vU;
      void main(){vec2 p=(vU-vec2(.5,.6))*vec2(asp,1.)/(.5*max(asp,1.));
        gl_FragColor=vec4(mix(cIn,cOut,smoothstep(.1,1.4,length(p))),1.);
        #include <colorspace_fragment>
        gl_FragColor.rgb+=${NOISE};}`,
    }),
  );
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1e3;
  backdrop.raycast = () => {};
  scene.add(backdrop);
  const stage = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        cG: {value: new THREE.Color()},
        cL: {value: new THREE.Color()},
        aG: {value: 0},
        aL: {value: 0},
        aC: {value: 0},
        ctr: {value: new THREE.Vector2()},
        rad: {value: 10},
        htAoA: AOU.htAoA,
        htAoB: AOU.htAoB,
        htAoBox: AOU.htAoBox,
      },
      vertexShader:
        'varying vec2 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xz;gl_Position=projectionMatrix*viewMatrix*w;}',
      // shadow around the house comes from the same shading map as the walls (exterior walls, 1 m radius), ignoring hidden facades
      fragmentShader: `uniform vec3 cG,cL;uniform float aG,aL,aC,rad;uniform vec2 ctr;uniform sampler2D htAoA,htAoB;uniform vec4 htAoBox;varying vec2 vW;
      void main(){float k=1.-smoothstep(.4,1.,length(vW-ctr)/rad);k*=k;vec2 fw=fwidth(vW),g=abs(fract(vW+.5)-.5)/fw;
        float l=(1.-min(min(g.x,g.y),1.))*aL*clamp(1.4-max(fw.x,fw.y)*8.,0.,1.),a=(aG+l*(1.-aG))*k;
        vec2 uv=(vec2(vW.x,-vW.y)-htAoBox.xy)*htAoBox.zw;vec4 A=texture2D(htAoA,uv);
        float c=clamp((A.g+A.b+A.a+texture2D(htAoB,uv).r)*2.,0.,1.)*aC;float o=c+a*(1.-c);
        gl_FragColor=vec4((cG*aG*(1.-l)+cL*l)/max(aG+l*(1.-aG),1e-4)*a*(1.-c)/max(o,1e-4),o);
        #include <colorspace_fragment>
        gl_FragColor.rgb+=${NOISE};}`,
    }),
  );
  stage.rotation.x = -Math.PI / 2;
  stage.position.y = -0.238;
  stage.renderOrder = -1;
  stage.raycast = () => {};
  scene.add(stage);

  let model: THREE.Group | null = null;
  let sides: FacadeGroup[] = [];
  let floors = new Map<string, THREE.Mesh>();
  let occluders: THREE.Mesh[] = [];
  let framed = false;
  let userMoved = false;
  let aoMs = 0;
  const sunAt = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  // The shading map is recomputed with the walls (~20 ms). Edits come in a stream (dragging a corner or a wall), so the map is coarse (8 cm, 4 times
  // faster) and precise 200 ms after the last edit: the shadow always matches the walls, and the frame does not stutter.
  let aoAt = 0;
  let aoTimer: ReturnType<typeof setTimeout> | number = 0;
  function bakeShade(plan2d: WallPlan): void {
    const t0 = performance.now();
    const rush = t0 - aoAt < 300;
    aoAt = t0;
    clearTimeout(aoTimer);
    const ao = bakeAO(plan2d, rush ? {px: 0.08} : {});
    if (ao) {
      AOU.htAoA.value.dispose();
      AOU.htAoB.value.dispose();
      AOU.htAoA.value = ao.A;
      AOU.htAoB.value = ao.B;
      AOU.htAoBox.value.copy(ao.box);
    }
    aoMs = performance.now() - t0;
    if (rush)
      aoTimer = setTimeout(() => {
        aoAt = 0;
        if (model) {
          bakeShade(plan2d);
          redraw();
        }
      }, 200);
  }
  // the sun is over the viewer's left shoulder; reposition only when the camera has been rotated
  function placeSun(d: THREE.Vector3): void {
    if (sunDir.dot(d) > 0.9999) return;
    sunDir.copy(d);
    const c = Math.cos(SUN.turn);
    const s = Math.sin(SUN.turn);
    sun.position.set(
      sunAt.x + (-d.x * c + d.z * s) * SUN.back,
      SUN.up,
      sunAt.z + (-d.z * c - d.x * s) * SUN.back,
    );
  }
  // The sun follows the view once the view has settled, catching up over a few frames. Moved with the camera on every frame of a
  // turn, the shadow map was drawn from a new angle each time and shadow edges crawled and flickered along wall joints and corners.
  // → true while it is still on its way (one more frame is wanted)
  const sunNext = new THREE.Vector3();
  function sunToward(d: THREE.Vector3): boolean {
    const k = sunDir.dot(d);
    if (sunDir.lengthSq() < 0.5 || k > 0.995 || k < -0.3) {
      placeSun(d);
      return k <= 0.9999;
    } // there, nearly there, or turned right round: at once
    sunNext.copy(sunDir).lerp(d, 0.35).normalize();
    placeSun(sunNext);
    return true;
  }
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // rotated by hand: when the view really moved, not just a press: a click on the 3D window swaps the windows
  let grab = false;
  controls.addEventListener('start', () => {
    grab = true;
  });
  controls.addEventListener('end', () => {
    grab = false;
  });
  controls.addEventListener('change', () => {
    if (grab) setMoved(true);
  });
  const dir = new THREE.Vector3();
  // Wall finishes: the side map (which finish each side of a room has), rebuilt with the rooms, ~ms.
  function bakeWalls(rooms: Room[] | undefined): void {
    const f = bakeFinish(rooms || []);
    const old = [AOU.htFin.value, AOU.htFinTab.value, AOU.htFinStk.value];
    if (f) {
      AOU.htFin.value = f.tex;
      AOU.htFinTab.value = f.tab;
      AOU.htFinStk.value = f.stk;
      const [originX, originY, inverseWidth, inverseHeight] = f.box;
      AOU.htFinBox.value.set(originX, originY, inverseWidth, inverseHeight);
    } else AOU.htFinBox.value.set(0, 0, 0, 0);
    const now = [AOU.htFin.value, AOU.htFinTab.value, AOU.htFinStk.value];
    for (const t of old) if (!now.includes(t) && t.image?.width > 1) t.dispose();
  }
  // Pieces of the floor (pieces.js, D-084): a tiled kitchen area in a parquet room — over the room's floor, 1 mm up,
  // the pattern laid along the same walls as the room's.
  function addFloorPieces(room: Room, floorMesh: THREE.Mesh, selected: boolean): void {
    // FLOOR_KINDS: a floor finish key → the finish; any other key is none
    for (const piece of floorPieces(room, k => !!FLOOR_KINDS[k as keyof typeof FLOOR_KINDS])) {
      const kind = FLOOR_KINDS[piece.k as keyof typeof FLOOR_KINDS];
      const toVectors = (ring: Outline): THREE.Vector2[] => ring.map(([x, y]) => new THREE.Vector2(x, y));
      const shape = new THREE.Shape(toVectors(piece.rings[0]));
      for (const hole of piece.rings.slice(1)) shape.holes.push(new THREE.Path(toVectors(hole)));
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI / 2);
      floorUV(geometry, room.polygon, kind.size);
      const material = withAO(
        new THREE.MeshStandardMaterial({
          map: floorTexture(piece.k, aniso, piece.tint),
          roughness: kind.rough,
          emissive: 0x2f6fd0,
          emissiveIntensity: selected ? 0.35 : 0,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
        AOU,
        false,
      );
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.position.y = 0.001;
      mesh.userData.own = true;
      floorMesh.add(mesh);
    }
  }
  function set(
    plan2d: WallPlan | null,
    rooms?: Room[],
    openings?: PlacedOpening[],
    selected?: string | null,
  ): void {
    roomsNow = rooms || [];
    dropRoomFx();
    if (model) {
      scene.remove(model);
      model.traverse(o => {
        if (isMesh(o)) {
          o.geometry.dispose();
          // a mesh's own material is a single one (a floor's)
          if (o.userData.own) (o.material as THREE.Material).dispose();
        }
      });
    }
    if (!plan2d) {
      model = null;
      sides = [];
      floors = new Map();
      occluders = [];
      AOU.htAoBox.value.set(1e6, 1e6, 1, 1);
      return;
    } // empty plan means an empty scene, no shadow on the platform
    model = new THREE.Group();
    sides = [];
    floors = new Map();
    occluders = [];
    plan2dNow = plan2d;
    // walls come with their rooms and openings: set(null) is the only call without them
    const roomList = rooms!;
    const openingList = openings!;
    // null only for an empty prism: any other shape gives a mesh
    const add = (
      g: THREE.BufferGeometry | null,
      m: THREE.Material | THREE.Material[],
      parent: THREE.Object3D,
    ): THREE.Mesh | null => {
      if (!g) return null;
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    for (const r of roomList) {
      if (r.solid) continue;
      const kind = floorKind(r);
      const K = FLOOR_KINDS[kind as keyof typeof FLOOR_KINDS];
      const g = new THREE.ShapeGeometry(new THREE.Shape(r.polygon.map(([x, y]) => new THREE.Vector2(x, y))));
      g.rotateX(-Math.PI / 2);
      floorUV(g, r.polygon, K.size);
      const m = withAO(
        new THREE.MeshStandardMaterial({
          map: floorTexture(kind, aniso, r.floorTint),
          roughness: K.rough,
          emissive: 0x2f6fd0,
          emissiveIntensity: r.id === selected ? 0.35 : 0,
        }),
        AOU,
        false,
      );
      const mesh = add(g, m, model)!;
      mesh.position.y = 0.002;
      mesh.userData.own = true;
      floors.set(r.id, mesh);
      addFloorPieces(r, mesh, r.id === selected);
    }
    add(prism(plan2d.footprint, -0.22, 0), [slabMat, slabMat], model);
    for (const b of plan2d.interior) {
      const m = add(prism(b.mp, b.bottom, b.top), [b.last ? capMat : wallMat, wallMat], model);
      if (m) occluders.push(m);
    }
    for (const b of plan2d.rails || []) add(prism(b.mp, b.bottom, b.top), [capMat, facadeMat], model); // a balcony's or terrace's railing: low, never hidden
    // a glass railing: the pane on its kerb and a slim steel handrail on top (D-075)
    for (const g of plan2d.glassRails || []) {
      const l = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
      const ang = Math.atan2(g.b[1] - g.a[1], g.b[0] - g.a[0]);
      const mid = [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2];
      const pane = add(new THREE.BoxGeometry(l, g.top - g.bottom - 0.03, 0.012), glassMat, model)!;
      pane.position.set(mid[0], (g.bottom + g.top - 0.03) / 2, -mid[1]);
      pane.rotation.y = ang;
      pane.castShadow = false;
      const top = add(new THREE.BoxGeometry(l, 0.03, 0.045), railMat, model)!;
      top.position.set(mid[0], g.top - 0.015, -mid[1]);
      top.rotation.y = ang;
    }
    const sideGroup: Partial<Record<FacadeSideId, THREE.Group>> = {};
    // an opening's facade group; none: it is on no exterior wall
    const facadeOf = (side: FacadeSideId | null | undefined): THREE.Group | undefined =>
      side ? sideGroup[side] : undefined;
    for (const s of plan2d.sides) {
      const grp = new THREE.Group();
      model.add(grp);
      sides.push({id: s.id, grp, out: OUT[s.id]});
      sideGroup[s.id] = grp;
      for (const b of s.bands)
        add(prism(b.mp, b.bottom, b.top), [b.last ? capMat : facadeMat, facadeMat], grp);
    }
    // Skirting boards and door and window trim (D-080), white; a casing on an exterior wall hides with its facade.
    for (const t of trimBoxes(roomList, openingList)) {
      const facade = t.opening != null ? facadeOf(plan2d.openingSide[t.opening]) : null;
      const m = add(prism(t.mp, t.bottom, t.top), trimMat, facade ?? model);
      if (m) m.castShadow = false;
    }
    openingList.forEach((o, i) => {
      if (o.kind !== 'window' && !o.glass) return; // windows and glazed doors
      const [ax, ay] = o.a;
      const [bx, by] = o.b;
      const l = Math.hypot(bx - ax, by - ay);
      // Glass hides together with its facade side.
      // a window's heights: migrate gives an opening from a file without them its kind's own
      const bottom = o.bottom!;
      const top = o.top!;
      const m = add(
        new THREE.PlaneGeometry(l, top - bottom),
        glassMat,
        facadeOf(plan2d.openingSide[i]) ?? model!,
      )!;
      m.castShadow = false;
      m.position.set((ax + bx) / 2, (bottom + top) / 2, -(ay + by) / 2);
      m.rotation.y = Math.atan2(by - ay, bx - ax);
    });
    scene.add(model);
    bakeShade(plan2d);
    bakeWalls(roomList);
    for (const o of labels.values()) if (o.sp) o.side = sideOfLabel(o.sp);
    for (const m of fixtures.children)
      if (m.userData.probe) m.userData.side = fixtureSide(m, ...(m.userData.probe as FixtureProbe)); // the lights may come before the walls
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    sunAt.copy(c);
    sun.target.position.copy(c);
    sunDir.set(0, 0, 0);
    const r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.75 + 2;
    Object.assign(sun.shadow.camera, {left: -r, right: r, top: r, bottom: -r, near: 1, far: 50});
    sun.shadow.camera.updateProjectionMatrix();
    ground.position.x = c.x;
    ground.position.z = c.z;
    const rad = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.6 + 5;
    stage.position.x = c.x;
    stage.position.z = c.z;
    stage.scale.setScalar(rad);
    stage.material.uniforms.ctr.value.set(c.x, c.z);
    stage.material.uniforms.rad.value = rad;
    // Until the camera has been moved by hand, the view fits the whole plan.
    if (!framed || !userMoved) {
      framed = true;
      if (saved) applyView(saved);
      else frame(box);
    }
  }
  // Furniture lives apart from the walls: dragging only changes the position; an item is rebuilt when its size, color, variant, mirroring or height changes.
  const furn = new THREE.Group();
  scene.add(furn);
  const objs = new Map<string, THREE.Group>();
  function setFurniture(items: Item3d[], selected?: string | null): void {
    const keep = new Set<string>();
    for (const it of items) {
      const key = [
        it.model,
        it.w,
        it.d,
        it.h,
        it.color,
        it.color2,
        it.top,
        it.v,
        it.mx,
        it.z,
        it.geo?.key,
        it.open?.toFixed(2),
        partsKey(it.parts),
      ].join('|');
      let o = objs.get(it.id);
      if (!o || o.userData.key !== key) {
        if (o) {
          furn.remove(o);
          o.traverse(m => isMesh(m) && m.geometry.dispose());
        }
        o = makeObject(it);
        o.userData.key = key;
        objs.set(it.id, o);
        furn.add(o);
      }
      o.userData.id = it.id; // pick() names the item under the pointer
      // a built-in wardrobe (it.geo) is built directly in plan coordinates; it hides piece by piece, each wall has its own
      if (it.geo) {
        o.position.set(0, 0, 0);
        o.rotation.y = 0;
        o.userData.tall = false;
      } else {
        o.position.set(it.x, 0, -it.y);
        o.rotation.y = THREE.MathUtils.degToRad(it.rot);
        o.userData.tall = zOf(it) + it.h > 1.5 && !byId(it.model)?.free;
      }
      keep.add(it.id);
    }
    for (const [id, o] of objs)
      if (!keep.has(id)) {
        furn.remove(o);
        objs.delete(id);
      }
  }
  // ---------- lights ----------
  const fixtures = new THREE.Group();
  scene.add(fixtures);
  let devs: Dev[] = [];
  const baseOBR = scene.onBeforeRender;
  const centroid = (p: Outline): Point =>
    p.reduce<Point>((s, v) => [s[0] + v[0] / p.length, s[1] + v[1] / p.length], [0, 0]);
  // Lamp body by shape (fixtures.js): only the diffuser glows (glass, shade); cord, stand and mounts have no emissive.
  // A lamp that is part of another fixture (L.with) shines from that fixture's position and draws no body: the host owns it.
  const darkMat = new THREE.MeshStandardMaterial({color: 0x3b3b3f, roughness: 0.5, metalness: 0.35});
  const bodyMat = new THREE.MeshStandardMaterial({color: 0xe9e2d4, roughness: 0.45});
  // pendant shades that do not glow: black metal (the inside too), rattan (a woven bell with darker ribs)
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x232427,
    roughness: 0.42,
    metalness: 0.45,
    side: THREE.DoubleSide,
  });
  const rattanMat = new THREE.MeshStandardMaterial({
    color: 0xb48c5c,
    roughness: 0.92,
    side: THREE.DoubleSide,
  });
  const rattanRib = new THREE.MeshStandardMaterial({color: 0x8a6741, roughness: 0.9});
  const SHARED = new Set([darkMat, bodyMat, shellMat, rattanMat, rattanRib]);
  const cyl = (rt: number, rb: number, h: number, s = 24, open = false): THREE.CylinderGeometry =>
    new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
  const lathe = (pts: Array<[number, number]>): THREE.LatheGeometry =>
    new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(r, y)),
      36,
    );
  const UP = new THREE.Vector3(0, 1, 0);
  // wall for a sconce: the nearest side of the room, n points from the wall into the room (the sconce sits 8 cm from it)
  function wallDir(poly: Outline, p: Point): Vector {
    return wallNear(poly, p)?.n || [0, 1];
  }
  function wallNear(poly: Outline, p: Point): {d: number; n: Vector} | null {
    let best: {d: number; n: Vector} | null = null;
    const s =
      poly.reduce((a, q, i) => {
        const b = poly[(i + 1) % poly.length];
        return a + q[0] * b[1] - b[0] * q[1];
      }, 0) > 0
        ? 1
        : -1;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < 1e-6) continue;
      const u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
      const t = Math.max(0, Math.min(l, (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1]));
      const d = Math.hypot(a[0] + u[0] * t - p[0], a[1] + u[1] * t - p[1]);
      if (!best || d < best.d) best = {d, n: [-u[1] * s, u[0] * s]};
    }
    return best;
  }
  // A strip or a wall light on an exterior wall hides together with that facade when it faces the camera (like a sensor label):
  // otherwise it hangs in the air across the room. The facade side: probe 12 cm into the nearest wall at the fixture's height.
  function fixtureSide(m: THREE.Object3D, poly: Outline, h: number): FacadeSideId | null {
    if (!plan2dNow) return null;
    const p: Point = [m.position.x, -m.position.z];
    const w = wallNear(poly, p);
    if (!w || w.d > 0.35) return null;
    const q: Point = [p[0] - w.n[0] * (w.d + 0.12), p[1] - w.n[1] * (w.d + 0.12)];
    for (const sd of plan2dNow.sides) {
      const b = sd.bands.find(b => b.bottom <= h && b.top > h);
      if (b && inMP(q, b.mp)) return sd.id;
    }
    return null;
  }
  function fixtureMeshes(
    L: PlacedLamp,
    form: LightForm,
    mat: THREE.MeshStandardMaterial,
    poly: Outline | undefined,
  ): LampMesh[] {
    const out: LampMesh[] = [];
    const at = (g: THREE.BufferGeometry, p: Point, y: number, m = mat): LampMesh => {
      const o = new THREE.Mesh(g, m);
      o.position.set(p[0], y, -p[1]);
      out.push(o);
      return o;
    };
    // a linear light or track: a white body that glows, or (housingOf: black) a black rail with a narrow diffuser under it;
    // a strip: a thin aluminium profile that only shows when it glows (off, a white bar read as a beam across the room)
    if (lineForm(form))
      for (const [a, b] of L.segments) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const ry = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (form === 'line' && housingOf(L) === 'black') {
          at(new THREE.BoxGeometry(len, 0.035, 0.045), mid, L.h + 0.012, shellMat).rotation.y = ry;
          at(new THREE.BoxGeometry(len - 0.02, 0.006, 0.026), mid, L.h - 0.008).rotation.y = ry;
        } else {
          const w = form === 'line' ? 0.05 : 0.02;
          const o = at(new THREE.BoxGeometry(len, form === 'line' ? 0.018 : 0.012, w), mid, L.h);
          o.rotation.y = ry;
        }
      }
    else
      for (const p of L.points) {
        if (form === 'spots') {
          at(cyl(0.045, 0.045, 0.012, 16), p, L.h);
          at(cyl(0.052, 0.052, 0.006, 20), p, L.h + 0.009, darkMat);
        }
        // pendant (fixtures.js: shadeOf): an opal glass dome; a black metal dome with a glowing diffuser under it; an opal glass globe;
        // a rattan bell with the bulb seen through its open bottom. All: a dark cap, a cord to the ceiling and a canopy on the ceiling.
        else if (form === 'pendant') {
          const sh = shadeOf(L);
          if (sh === 'metal') {
            at(
              lathe([
                [0.03, 0.1],
                [0.06, 0.092],
                [0.13, 0.035],
                [0.185, -0.055],
                [0.195, -0.075],
                [0.19, -0.078],
              ]),
              p,
              L.h,
              shellMat,
            );
            const d = at(new THREE.CircleGeometry(0.17, 32), p, L.h - 0.06);
            d.rotation.x = Math.PI / 2;
            at(new THREE.SphereGeometry(0.04, 16, 12), p, L.h - 0.02);
          } else if (sh === 'globe') {
            at(new THREE.SphereGeometry(0.15, 32, 22), p, L.h - 0.04);
          } else if (sh === 'woven') {
            at(
              lathe([
                [0.035, 0.1],
                [0.09, 0.09],
                [0.17, 0.03],
                [0.225, -0.06],
                [0.235, -0.1],
                [0.228, -0.104],
              ]),
              p,
              L.h,
              rattanMat,
            );
            for (const y of [0.05, -0.005, -0.06])
              at(
                new THREE.TorusGeometry(y > 0.03 ? 0.12 : y > -0.03 ? 0.19 : 0.228, 0.004, 6, 40),
                p,
                L.h + y,
                rattanRib,
              ).rotation.x = Math.PI / 2;
            at(new THREE.SphereGeometry(0.05, 16, 12), p, L.h - 0.03);
          } else {
            at(
              lathe([
                [0.03, 0.085],
                [0.065, 0.075],
                [0.115, 0.04],
                [0.155, -0.02],
                [0.172, -0.08],
                [0.168, -0.085],
              ]),
              p,
              L.h,
            );
            at(new THREE.SphereGeometry(0.035, 16, 12), p, L.h - 0.02);
          }
          const top = sh === 'globe' ? 0.12 : sh === 'metal' ? 0.11 : sh === 'woven' ? 0.11 : 0.095;
          at(cyl(0.034, 0.04, 0.03, 20), p, L.h + top, darkMat);
          const c = WALL.height - L.h - top - 0.015;
          at(cyl(0.004, 0.004, c, 6), p, L.h + top + 0.015 + c / 2, darkMat);
          at(cyl(0.05, 0.055, 0.02, 24), p, WALL.height - 0.01, darkMat);
        }
        // sconce: a wall plate, a bracket, a shade flaring upwards
        else if (form === 'wall') {
          const n = poly ? wallDir(poly, p) : [0, 1];
          const w = [p[0] - n[0] * 0.08, p[1] - n[1] * 0.08];
          const d3 = new THREE.Vector3(n[0], 0, -n[1]);
          const pl = at(
            new THREE.BoxGeometry(0.09, 0.15, 0.016),
            [w[0] + n[0] * 0.008, w[1] + n[1] * 0.008],
            L.h,
            darkMat,
          );
          pl.rotation.y = Math.atan2(n[0], -n[1]);
          const arm = at(
            cyl(0.008, 0.008, 0.07, 8),
            [w[0] + n[0] * 0.045, w[1] + n[1] * 0.045],
            L.h - 0.045,
            darkMat,
          );
          arm.quaternion.setFromUnitVectors(UP, d3);
          at(cyl(0.008, 0.008, 0.05, 8), p, L.h - 0.05, darkMat);
          at(cyl(0.075, 0.05, 0.13, 28, true), p, L.h + 0.02);
          at(new THREE.SphereGeometry(0.028, 14, 10), p, L.h);
        }
        // floor and table lamp: an open shade with a bulb inside; a floor lamp has a stand and a disc base, a table lamp a ceramic base
        else if (form === 'lamp') {
          const tall = L.opt ? L.opt === 'floor' : L.h > 1.1; // a table lamp on a desk stands at 1.17 m: still a table lampat(cyl(tall?.12:.085,tall?.17:.125,tall?.26:.17,36,true),p,L.h);at(new THREE.SphereGeometry(tall?.04:.03,14,10),p,L.h-.03);
          if (tall) {
            const pole = L.h - 0.12;
            at(cyl(0.011, 0.011, pole, 10), p, L.h - 0.12 - pole / 2, darkMat);
            at(cyl(0.13, 0.14, 0.025, 32), p, 0.0125, darkMat);
          } else
            at(
              lathe([
                [0, -0.42],
                [0.06, -0.42],
                [0.075, -0.38],
                [0.08, -0.3],
                [0.06, -0.2],
                [0.025, -0.13],
                [0.02, -0.09],
                [0, -0.09],
              ]),
              p,
              L.h,
              bodyMat,
            );
        }
        // chandelier / ceiling light: a plate with a soft dome
        else
          at(
            lathe([
              [0, -0.04],
              [0.11, -0.035],
              [0.18, -0.018],
              [0.205, 0.005],
              [0.205, 0.025],
              [0, 0.025],
            ]),
            p,
            L.h,
          );
      }
    return out;
  }
  // point light brightness by shape: spots and chandeliers light the whole room, sconces and table lamps light around themselves
  const POWER: Record<string, number> = {ceiling: 36, spots: 42, pendant: 30, wall: 26, lamp: 35}; // wall and lamp: a near reach (D-067), so stronger than they were (16, 22)
  // A fixed set of light sources (D-011). The number of sources is part of the shader key: a new source recompiles every material,
  // a 0.5–1.5 s freeze (the owner: “I drag the strip and it lags terribly”: a strip segment kept appearing and disappearing). So sources
  // are never removed: extra ones fade to zero and stay in the scene, new ones are taken from a reserve. The reserve grows with headroom, so the next
  // strip segment or a new lamp no longer recompiles shaders. A lamp keeps its own objects (key “lamp:index”): the room
  // mask bound to the objects stays correct even while dragging.
  const pool: Record<string, PoolLight[]> = {PointLight: [], RectAreaLight: [], SpotLight: []};
  const SPARE: Record<string, number> = {PointLight: 2, RectAreaLight: 3, SpotLight: 2};
  function adopt(list: Array<{fresh: PoolLight; key: string}>): PoolLight[] {
    const all = Object.values(pool).flat();
    const out: PoolLight[] = new Array(list.length);
    const need: Record<string, number> = {};
    all.forEach(l => {
      l.userData.used = false;
    });
    const take = (i: number, P: PoolLight[], pick: (light: PoolLight) => boolean): boolean => {
      const l = P.find(x => !x.userData.used && pick(x));
      if (l) {
        l.userData.used = true;
        out[i] = l;
      }
      return !!l;
    };
    list.forEach(({fresh, key}, i) => take(i, pool[fresh.type], x => x.userData.key === key));
    list.forEach(({fresh}, i) => {
      if (!out[i] && !take(i, pool[fresh.type], () => true)) need[fresh.type] = (need[fresh.type] || 0) + 1;
    });
    for (const [type, n] of Object.entries(need))
      for (let k = 0; k < n + SPARE[type]; k++) {
        const l: PoolLight =
          type === 'PointLight'
            ? new THREE.PointLight(0xffffff, 0)
            : type === 'SpotLight'
              ? new THREE.SpotLight(0xffffff, 0)
              : new THREE.RectAreaLight(0xffffff, 0, 1, 0.03);
        pool[type].push(l);
        scene.add(l);
        if (isSpotLight(l)) scene.add(l.target);
      }
    list.forEach(({fresh}, i) => {
      if (!out[i]) take(i, pool[fresh.type], () => true);
    });
    list.forEach(({fresh, key}, i) => {
      const l = out[i];
      l.color.copy(fresh.color);
      l.position.copy(fresh.position);
      l.quaternion.copy(fresh.quaternion);
      // l comes from the pool of fresh's own type
      if (isPointLight(fresh) || isSpotLight(fresh)) {
        const near = l as THREE.PointLight | THREE.SpotLight;
        near.distance = fresh.distance;
        near.decay = fresh.decay;
      } else {
        const area = l as THREE.RectAreaLight;
        area.width = fresh.width;
        area.height = fresh.height;
      }
      if (isSpotLight(fresh)) {
        const spot = l as THREE.SpotLight;
        spot.angle = fresh.angle;
        spot.penumbra = fresh.penumbra;
        spot.target.position.copy(fresh.target.position);
        spot.target.updateMatrixWorld();
      }
      l.intensity = 0;
      l.userData = {...fresh.userData, key, used: true};
    });
    for (const l of all)
      if (!l.userData.used) {
        l.intensity = 0;
        l.userData.fullIntensity = 0;
      }
    return out;
  }
  // The sources of a lamp with a point form (D-067): pendants and spots — cones straight down, the rest — a point with a near reach
  function pointLights(form: LightForm, positions: Vec3[], tint: string, table: boolean): PoolLight[] {
    const c = CONE[form];
    if (c) {
      let pts: number[][] = positions;
      let k = 1;
      let angle = c.angle;
      if (pts.length > CONE_MAX) {
        const m = pts.reduce((a, p) => a.map((v, i) => v + p[i] / pts.length), [0, 0, 0]);
        pts = [m];
        k = Math.sqrt(positions.length);
        angle = Math.min(1.1, angle * 1.5);
      }
      return pts.map(p => {
        const l = new THREE.SpotLight(tint, 0, 6, angle, 0.85, 2);
        l.position.fromArray(p);
        l.target.position.set(p[0], 0, p[2]);
        l.userData.fullIntensity = c.power * k;
        return l;
      });
    }
    const m = positions.reduce<number[]>((a, p) => a.map((v, i) => v + p[i] / positions.length), [0, 0, 0]);
    const l = new THREE.PointLight(tint, 0, NEAR[form] ?? NEAR.lamp, 2);
    l.position.fromArray(m);
    l.userData.fullIntensity = POWER[form] * (table ? 0.55 : 1);
    return [l];
  }
  // a soft glow at the shade or bulb while the lamp is on (applyLevel sets how strong): faces the camera, hidden behind walls, not clickable
  let haloTex: THREE.CanvasTexture | null = null;
  function halo(tint: string, at: Vec3, size: number, more?: (m: THREE.Sprite) => void): THREE.Sprite {
    haloTex ??= (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      // a canvas always has a 2D context
      const g = c.getContext('2d')!;
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.22, 'rgba(255,255,255,.5)');
      r.addColorStop(0.55, 'rgba(255,255,255,.12)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const m = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTex,
        color: tint,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    m.position.fromArray(at);
    m.scale.set(size, size, 1);
    m.visible = false;
    m.raycast = () => {};
    m.renderOrder = 5;
    more?.(m);
    fixtures.add(m);
    return m;
  }
  function setLights(list: PlanLight[], rooms: Room[]): void {
    const was = new Map(devs.map(d => [d.L.id, d.solo]));
    for (const d of devs) {
      d.meshes.forEach(m => {
        fixtures.remove(m);
        m.geometry.dispose();
        if (!SHARED.has(m.material)) m.material.dispose();
      });
      d.halos.forEach(h => {
        fixtures.remove(h);
        h.material.dispose();
      });
    }
    devs = [];
    for (const L0 of list) {
      const host = L0.with && list.find(x => x.id === L0.with);
      // the view's lamps are placed: they have their height
      const L = (host ? {...host, id: L0.id, on: L0.on, color: L0.color} : L0) as PlacedLamp;
      const r = rooms.find(r => r.id === L.room);
      if (!r) continue;
      const room = {id: r.id, polygon: r.polygon, center: centroid(r.polygon)};
      const form: LightForm = formFor(L);
      const mat = new THREE.MeshStandardMaterial({
        color: form === 'strip' ? 0xb4b7ba : 0xf4f1ea,
        emissive: 0x000000,
        roughness: 0.4,
        metalness: form === 'strip' ? 0.3 : 0,
        side: THREE.DoubleSide,
      });
      const meshes = fixtureMeshes(L, form, mat, r.polygon);
      meshes.forEach(m => {
        if (host) m.userData.off = true;
        else if (form === 'strip' || form === 'wall') {
          m.userData.probe = [r.polygon, Math.min(L.h, 2.5)];
          m.userData.side = fixtureSide(m, ...(m.userData.probe as FixtureProbe));
        }
        m.visible = !host;
        fixtures.add(m);
      });
      fixtures.updateMatrixWorld(true);
      const glow = meshes.filter(m => m.material === mat);
      const point = !lineForm(form);
      const lift = form === 'pendant' ? -0.12 : 0;
      const tint = '#' + new THREE.Color(L.color || '#ffce87').lerp(WHITE, LAMP_TINT).getHexString();
      const device: LightDevice = {
        id: L.id,
        kind: point ? 'ceiling' : L.h >= 1.8 ? 'cove' : 'strip',
        color: tint,
        down: form === 'line',
        positions: point ? L.points.map((p): Vec3 => [p[0], L.h + lift, -p[1]]) : [],
        ...(point ? {} : {intensity: L.h < 0.5 ? STRIP_POWER / 2 : STRIP_POWER}),
      };
      // for a strip, light comes from segments of 30 cm or more (a short step in a corner glows but gets no source of its own: each costs ms per frame)
      const lit = point
        ? glow
        : (() => {
            // a strip's pieces are boxes
            const g = glow.filter(m => ((m.geometry as THREE.BoxGeometry).parameters?.width ?? 1) >= 0.3);
            return g.length ? g : glow.slice(0, 1);
          })();
      const table = form === 'lamp' && (L.opt ? L.opt !== 'floor' : L.h < 1.1);
      const lights = point
        ? pointLights(form, device.positions, tint, table)
        : buildDeviceLights(device, lit, room);
      const halos =
        point && !host
          ? L.points.map(q =>
              halo(
                tint,
                [
                  q[0],
                  L.h + (form === 'pendant' ? -0.06 : form === 'spots' || form === 'ceiling' ? -0.03 : 0),
                  -q[1],
                ],
                HALO.size[table ? 'table' : form] ?? 0.6,
                m => {
                  if (form === 'wall') {
                    m.userData.probe = [r.polygon, Math.min(L.h, 2.5)];
                    m.userData.side = fixtureSide(m, ...(m.userData.probe as FixtureProbe));
                  }
                },
              ),
            )
          : [];
      devs.push({
        L: L0,
        src: L,
        form,
        device,
        lights,
        meshes,
        glow,
        halos,
        room,
        on: L.on,
        blink: null,
        solo: was.get(L0.id) ?? soloOf({L: L0, room}),
      });
    }
    // fresh sources are only a calculation: the scene gets objects from the fixed set
    const fresh = devs.flatMap(d => d.lights.map((l, j) => ({fresh: l, key: d.L.id + ':' + j})));
    const got = adopt(fresh);
    let k = 0;
    for (const d of devs) {
      d.lights = d.lights.map(() => got[k++]);
      applyLevel(d);
    }
    for (const [id, sh] of [...shines])
      if (devs.some(d => d.L.id === id)) shine(id, sh.t0);
      else unshine(id, true);
    for (const [id, at] of [...pendingShine]) {
      pendingShine.delete(id);
      if (performance.now() - at < 1500 && devs.some(d => d.L.id === id)) shine(id);
    }
    inkSens();
  }
  // The “light does not leave the room” mask is set again after every edit: first restore the materials' original hooks.
  function applyMask(rooms: Room[]): number {
    scene.onBeforeRender = baseOBR;
    scene.traverse(o => {
      if (!isMesh(o)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if ('obc' in m.userData) {
          m.onBeforeCompile = m.userData.obc;
          m.customProgramCacheKey = m.userData.cpk;
        } else {
          m.userData.obc = m.onBeforeCompile;
          m.userData.cpk = m.customProgramCacheKey;
        }
      }
    });
    const t = performance.now();
    installRoomLightMask(
      scene,
      rooms.map(r => ({
        room: {id: r.id, polygon: r.polygon},
        lights: devs.filter(d => d.room.id === r.id).flatMap(d => d.lights),
      })),
      scene,
    );
    return performance.now() - t;
  }
  // Lamp brightness = on × “own room” (solo: light only in the room in question, the rest fade out smoothly) ×
  // blink (blink 0…1 while a new or changed lamp blinks). When a lamp is selected (ids: it and the parts of its fixture) only it
  // is lit and the whole scene darkens (amb 1 → 0): you can see exactly how it shines (the owner: “it glows like a beacon, unclear”).
  let soloRoom: string | null = null;
  let soloIds: string[] | null = null;
  let soloKey = '';
  let soloRaf = 0;
  let amb = 1;
  const soloOf = (d: Pick<Dev, 'L' | 'room'>): number =>
    soloRoom == null ? 1 : soloIds ? (soloIds.includes(d.L.id) ? 1 : 0) : d.room.id === soloRoom ? 1 : 0;
  // blinks even when off, so you can see where it is; selected in a dark scene it is twice as bright: its light on walls and floor is visible at once
  // shine (shine): when on it is sh.m times brighter and warmer; when off it lights up for the duration of the shine (so you can see where it is)
  function applyLevel(d: Dev): void {
    const sh = shines.get(d.L.id);
    const lit = d.blink != null || d.on;
    const k = d.solo * (d.blink ?? 1);
    const level = sh && !lit ? sh.e * Math.max(d.solo, 0.6) : k;
    setDeviceLighting(d.lights, d.glow, d.device, {
      on: (lit || !!sh) && level > 0,
      brightness: level * 100,
      colour: sh?.col,
    });
    const b = (soloIds?.includes(d.L.id) ? 1 + 0.6 * (1 - amb) : 1) * (sh && lit ? sh.m : 1);
    // by day a lamp is weaker (DAY_LAMPS, 42%): on top of the sun full brightness burns the room into peach; with a lamp selected (the scene
    // darkens, amb → 0) it is back to full strength
    const day = night ? 1 : DAY_LAMPS + (1 - DAY_LAMPS) * (1 - amb);
    if (b * day !== 1) for (const l of d.lights) l.intensity *= b * day;
    if (b !== 1)
      for (const m of new Set(d.glow.map(g => g.material))) if (m.emissive) m.emissiveIntensity *= b;
    // the halo: by day stronger (the room light hardly shows), at night and with the scene darkened — the night one
    const ho =
      (lit || sh) && level > 0
        ? Math.min(1, level * b) * (night ? HALO.night : HALO.night + (HALO.day - HALO.night) * amb)
        : 0;
    for (const h of d.halos) {
      h.material.opacity = ho;
      h.visible = ho > 0.01;
    }
  }
  function setLightOn(id: string, on: boolean | undefined): void {
    const d = devs.find(d => d.L.id === id);
    if (d) {
      d.on = on;
      d.blink = null;
      applyLevel(d);
      inkSens();
    }
  }
  // light only in room roomId (null means everywhere), and with ids only for these lamps and in a dark scene: they fade out and in smoothly, over 0.45 s
  function setSolo(roomId: string | null | undefined, ids: string[] | null = null): void {
    const key = roomId == null ? '' : roomId + '|' + (ids || []).join(',');
    if (key === soloKey) return;
    soloKey = key;
    soloRoom = roomId ?? null;
    soloIds = roomId != null && ids?.length ? ids : null;
    if (soloRaf) return;
    let t = performance.now();
    const step = () => {
      redraw();
      const now = performance.now();
      const dk = reducedMotion() ? 1 : (now - t) / 450;
      t = now;
      let moving = false;
      for (const d of devs) {
        const g = soloOf(d);
        if (d.solo === g) continue;
        d.solo = g > d.solo ? Math.min(g, d.solo + dk) : Math.max(g, d.solo - dk);
        applyLevel(d);
        moving = true;
      }
      const ga = soloIds ? 0 : 1;
      if (amb !== ga) {
        amb = ga > amb ? Math.min(ga, amb + dk) : Math.max(ga, amb - dk);
        applyAmb();
        for (const d of devs) if (soloIds?.includes(d.L.id)) applyLevel(d);
        moving = true;
      }
      soloRaf = moving ? requestAnimationFrame(step) : 0;
    };
    soloRaf = requestAnimationFrame(step);
  }
  // brightness 0…1 for blinking a new lamp (does not change whether it is on)
  function setLightLevel(id: string, k: number | null): void {
    const d = devs.find(d => d.L.id === id);
    if (d) {
      d.blink = k;
      applyLevel(d);
    }
  }
  // Lamp shine: when it is selected, placed or changed (the owner: “premium, not half-assed”). It does not fade out but breathes:
  // it smoothly brightens almost threefold and shifts to warm gold, then a soft echo (2.6 s). A halo around the fixture; a thin gold ring
  // spreads from it across the floor (on every breath); along a strip or line a wave of light runs there and back.
  const GOLD = new THREE.Color(0xffc56e);
  const SHINE = 2600;
  const shines = new Map<string, Shine>();
  const fx = new THREE.Group();
  fx.renderOrder = 10;
  scene.add(fx);
  let shineRaf = 0;
  let texs: {halo: THREE.CanvasTexture; ring: THREE.CanvasTexture} | null = null;
  function glowTex(ring: boolean): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    // a canvas always has a 2D context
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    if (ring) {
      r.addColorStop(0, 'rgba(255,255,255,0)');
      r.addColorStop(0.7, 'rgba(255,255,255,0)');
      r.addColorStop(0.86, 'rgba(255,255,255,1)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.18, 'rgba(255,255,255,.55)');
      r.addColorStop(0.5, 'rgba(255,255,255,.12)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
    }
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const fxMat = (map: THREE.Texture, col: THREE.Color) => ({
    map,
    color: col,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ease = (u: number): number => 1 - (1 - u) ** 3;
  const swell = (u: number): number => Math.sin(Math.PI * u) ** 2;
  // the lamp is not in 3D yet (just placed, the scene is rebuilt next): the shine starts as soon as it is built; rebuilt
  // mid-shine (moved, changed): the highlights move to the new place, time keeps running
  const pendingShine = new Map<string, number>(); // id → when requested; wait no longer than 1.5 s
  function shine(id: string, t0 = performance.now()): void {
    if (reducedMotion()) return;
    const d = devs.find(d => d.L.id === id);
    if (!d) {
      pendingShine.set(id, performance.now());
      return;
    }
    texs ??= {halo: glowTex(false), ring: glowTex(true)};
    unshine(id, true);
    const L = d.src;
    const col = new THREE.Color(L.color || '#ffce87');
    const hot = col.clone().lerp(GOLD, 0.6);
    const parts: ShinePart[] = [];
    const line = lineForm(d.form);
    if (!line) {
      const big = d.form === 'ceiling' ? 1.1 : d.form === 'spots' ? 0.5 : d.form === 'wall' ? 1 : 0.8;
      for (const [x, y, z] of d.device.positions) {
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({...fxMat(texs.halo, hot), depthTest: false}));
        halo.position.set(x, y, z);
        fx.add(halo);
        parts.push({o: halo, kind: 'halo', big});
        for (const at of [0, 0.5]) {
          const ring = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({...fxMat(texs.ring, GOLD), side: THREE.DoubleSide}),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(x, 0.02, z);
          ring.scale.setScalar(0.01);
          fx.add(ring);
          parts.push({o: ring, kind: 'ring', at, big});
        }
      }
    } else {
      const pts: Array<{p: Vec3; s: number}> = [];
      let s0 = 0;
      for (const [a, b] of L.segments) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.round(len / 0.35));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          pts.push({p: [a[0] + (b[0] - a[0]) * t, L.h, -(a[1] + (b[1] - a[1]) * t)], s: s0 + len * t});
        }
        s0 += len;
      }
      const step = Math.max(1, Math.ceil(pts.length / 48)); // at most 48 highlights per strip
      for (let i = 0; i < pts.length; i += step) {
        const q = pts[i];
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({...fxMat(texs.halo, hot), depthTest: false}));
        sp.position.set(...q.p);
        fx.add(sp);
        parts.push({o: sp, kind: 'run', s: q.s, total: s0});
      }
    }
    shines.set(id, {t0, parts, col: col.clone(), base: col, hot, m: 1, e: 0});
    if (!shineRaf) shineRaf = requestAnimationFrame(tickShine);
  }
  function unshine(id: string, quiet?: boolean): void {
    const sh = shines.get(id);
    if (!sh) return;
    for (const p of sh.parts) {
      fx.remove(p.o);
      p.o.material.dispose();
      p.o.geometry?.dispose?.();
    }
    shines.delete(id);
    if (quiet) return;
    const d = devs.find(d => d.L.id === id);
    if (d) applyLevel(d);
  }
  function tickShine(): void {
    shineRaf = 0;
    redraw();
    const now = performance.now();
    for (const [id, sh] of shines) {
      const t = (now - sh.t0) / SHINE;
      if (t >= 1 || reducedMotion()) {
        unshine(id);
        continue;
      }
      // breath and echo: 0 → 1 → 0 over the first half, 0 → 0.45 → 0 over the second
      const e = t < 0.5 ? swell(t / 0.5) : 0.45 * swell((t - 0.5) / 0.5);
      sh.e = e;
      sh.m = 1 + 0.6 * e;
      sh.col.copy(sh.base).lerp(sh.hot, Math.min(1, e * 0.8));
      for (const p of sh.parts) {
        const o = p.o;
        if (p.kind === 'halo') {
          o.material.opacity = 0.85 * e;
          o.scale.setScalar(p.big * (0.7 + 0.6 * e));
        } else if (p.kind === 'ring') {
          const u = (t - p.at) / 0.5;
          if (u < 0 || u > 1) {
            o.material.opacity = 0;
            continue;
          }
          o.scale.setScalar(p.big * (0.4 + 2.6 * ease(u)));
          o.material.opacity = (p.at ? 0.45 : 0.8) * (1 - u) ** 1.5;
        } else {
          const w = t < 0.5 ? t / 0.5 : 1 - (t - 0.5) / 0.5;
          const x = w * p.total;
          const dd = (p.s - x) / Math.max(0.6, p.total * 0.12);
          o.material.opacity =
            Math.min(1, 0.15 * e + 0.95 * Math.exp(-dd * dd)) *
            (t < 0.5 ? 1 : 0.6) *
            (1 - Math.max(0, t - 0.85) / 0.15);
          o.scale.setScalar(0.45 + 0.4 * Math.exp(-dd * dd));
        }
      }
      const d = devs.find(d => d.L.id === id);
      if (d) applyLevel(d);
    }
    if (shines.size) shineRaf = requestAnimationFrame(tickShine);
  }
  let night = false;
  // Scene background: dark at night and in the dark theme, light otherwise (D-018).
  // Overall light: day or night; with a lamp selected (amb → 0) even darker than night, background is the night one
  // night (D-067): cool and dim — moonlight — so the warm pools of the lamps stand out; it was .48/.30/.12 in the day's colours
  const NIGHT = {h: 0.32, s: 0.18, e: 0.06};
  const FOCUS = {h: 0.2, s: 0.08, e: 0.05};
  const SKY: Record<'day' | 'night', [number, number, number]> = {
    day: [0xf6f6ff, 0xb39f88, 0xfff4e6],
    night: [0xb4c3e0, 0x4a4540, 0xc9d6f0],
  }; // sky, ground, sun
  // Background: center, edges, platform (color, density), grid lines (color, density). With a lamp selected, towards FOCUS.
  const BG = Object.fromEntries(
    Object.entries<[string, string, string, number, string, number, number]>({
      light: ['#f8f9fb', '#dce2e9', '#ffffff', 0.8, '#6f7b8c', 0.14, 0.45],
      dark: ['#1d222c', '#0a0c10', '#2b313d', 0.75, '#9aabc8', 0.07, 0.75],
      night: ['#142034', '#05070c', '#1b2438', 0.7, '#7d93bd', 0.06, 0.75],
      focus: ['#10141e', '#040509', '#161b26', 0.6, '#7d93bd', 0.04, 0.7],
    }).map(([k, [i, o, g, ag, l, al, ac]]) => [
      k,
      {
        i: new THREE.Color(i),
        o: new THREE.Color(o),
        g: new THREE.Color(g),
        ag,
        l: new THREE.Color(l),
        al,
        ac,
      },
    ]),
  );
  let dark = false;
  function bg() {
    const a = BG[night ? 'night' : dark ? 'dark' : 'light'];
    const b = BG.focus;
    const t = 1 - amb;
    const U = backdrop.material.uniforms;
    const S = stage.material.uniforms;
    U.cIn.value.lerpColors(a.i, b.i, t);
    U.cOut.value.lerpColors(a.o, b.o, t);
    renderer.setClearColor(U.cOut.value, 1);
    S.cG.value.lerpColors(a.g, b.g, t);
    S.cL.value.lerpColors(a.l, b.l, t);
    S.aG.value = a.ag + (b.ag - a.ag) * t;
    S.aL.value = a.al + (b.al - a.al) * t;
    S.aC.value = a.ac + (b.ac - a.ac) * t;
  }
  bg();
  function applyAmb() {
    const b = night ? NIGHT : DAY;
    const x = (f: typeof DAY, k: keyof typeof DAY): number => FOCUS[k] + (b[k] - FOCUS[k]) * amb;
    hemi.intensity = x(b, 'h');
    sun.intensity = x(b, 's');
    scene.environmentIntensity = x(b, 'e');
    const [sky, ground, sunC] = SKY[night ? 'night' : 'day'];
    hemi.color.setHex(sky);
    hemi.groundColor.setHex(ground);
    sun.color.setHex(sunC);
    bg();
    for (const d of devs) applyLevel(d);
    inkSens();
  }
  function setNight(n: boolean): void {
    night = n;
    applyAmb();
  }
  // ---------- readings on walls (D-033) ----------
  // A label is “paint” on the wall, with no backing: a canvas with a transparent background on a plane 6 mm in front of the face. As in 3d_floor,
  // unlit (light from a neighboring room does not shine through), and the paint follows the wall: dark on a light finish, light on a dark one.
  // A room in the dark (night and its lamps are off, or the scene darkened for a selected lamp) gets light paint: otherwise it would vanish with the wall.
  // A label on an exterior wall hides together with it when the facade faces the camera.
  const sensGrp = new THREE.Group();
  scene.add(sensGrp);
  const labels = new Map<string, SensorLabel>();
  let plan2dNow: WallPlan | null = null;
  const LPX = 360;
  const LFONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  const INK = {
    dark: {ink: '#2a322d', muted: 'rgba(42,50,45,.7)', lvl: ['#2a322d', '#b5690a', '#c0392b']},
    light: {ink: '#f4f2ec', muted: 'rgba(244,242,236,.78)', lvl: ['#f4f2ec', '#ffbf5a', '#ff7b68']},
  };
  const lumOf = (h: string): number => {
    const c = new THREE.Color(h);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  };
  const inMP = (q: Point, mp: MultiPolygon): boolean =>
    mp.some(([o, ...hs]) => pointIn(q, o) && !hs.some(h => pointIn(q, h)));
  function paintLabel(o: SensorLabel): void {
    const d = o.data;
    const base = (o.sp || d).base || '#f0ece5';
    o.pb = base;
    const P = o.dim || lumOf(base) < 0.25 ? INK.light : INK.dark;
    const cv = o.cv;
    // a canvas always has a 2D context
    const g = cv.getContext('2d')!;
    cv.width = Math.round(d.size.w * LPX);
    cv.height = Math.round(d.size.h * LPX);
    g.clearRect(0, 0, cv.width, cv.height);
    g.textAlign = 'center';
    let x = LABEL.pad;
    d.items.forEach((it, i) => {
      const cx = (x + d.size.ws[i] / 2) * LPX;
      const k = it.k || 1;
      const ls = LABEL.ls * k;
      const vs = LABEL.vs * k;
      const top = (LABEL.pad + d.size.h - 2 * LABEL.pad - itemH(k)) * LPX;
      x += d.size.ws[i] + LABEL.gap;
      g.fillStyle = P.muted;
      g.font = `600 ${Math.round(ls * LPX)}px ${LFONT}`;
      if ('letterSpacing' in g) g.letterSpacing = Math.round(ls * LPX * 0.08) + 'px';
      g.fillText(it.label, cx, top + ls * LPX * 0.95);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      g.fillStyle = (it.lvl ? P.lvl[it.lvl] : it.c) || P.ink; // own color for normal values; alarming ones in yellow and red
      g.font = `600 ${Math.round(vs * LPX)}px ${LFONT}`;
      g.fillText(it.text, cx, top + (ls * 1.3 + vs * 0.9) * LPX);
    });
    o.tex.needsUpdate = true;
  }
  // A label stays put (2026-11-07, the owner): on the wall for the home view or where it was placed; it does not move when the 3D view rotates.
  function placeLabel(o: SensorLabel, sp: SensorSpot): void {
    o.sp = sp;
    o.side = sideOfLabel(sp);
    const d = o.data;
    if (sp.base && sp.base !== o.pb) paintLabel(o);
    o.mesh.scale.set(sp.w, d.size.h * sp.scale, 1);
    o.mesh.position.set(sp.c[0] + sp.n[0] * 0.006, sp.y ?? LABEL.y, -(sp.c[1] + sp.n[1] * 0.006));
    o.mesh.rotation.set(0, Math.atan2(sp.n[0], -sp.n[1]), 0);
  }
  function sideOfLabel(d: {c: Point; n: Vector; y?: number}): FacadeSideId | null {
    if (!plan2dNow) return null;
    const q: Point = [d.c[0] - d.n[0] * 0.12, d.c[1] - d.n[1] * 0.12];
    const y = d.y ?? LABEL.y;
    for (const s of plan2dNow.sides) {
      const b = s.bands.find(b => b.bottom <= y && b.top > y);
      if (b && inMP(q, b.mp)) return s.id;
    }
    return null;
  }
  function roomDark(id: string): boolean {
    if (!night && amb > 0.5) return false;
    return !devs.some(
      d => d.room.id === id && d.on && d.solo > 0.5 && (amb > 0.5 || soloIds?.includes(d.L.id)),
    );
  }
  function inkSens(): void {
    for (const o of labels.values()) {
      const dk = roomDark(o.data.room);
      if (dk !== o.dim) {
        o.dim = dk;
        paintLabel(o);
      }
    }
  }
  // list: [{id (sensor), room, c, n (point on the wall face and normal into the room, plan), w (width), scale, size {w,h,ws}, items, base (wall color), own}]
  function setSensors(list: SensorSpot[]): void {
    const keep = new Set<string>();
    for (const d of list) {
      let o = labels.get(d.id);
      const key = JSON.stringify([d.items, d.size]);
      if (!o) {
        const cv = document.createElement('canvas');
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = aniso;
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
          }),
        );
        mesh.raycast = () => {};
        sensGrp.add(mesh);
        o = {cv, tex, mesh, dim: null, key: '', data: d};
        labels.set(d.id, o);
      }
      o.data = d;
      o.dim = roomDark(d.room);
      if (o.key !== key) {
        o.key = key;
        paintLabel(o);
      }
      placeLabel(o, d);
      keep.add(d.id);
    }
    for (const [id, o] of labels)
      if (!keep.has(id)) {
        sensGrp.remove(o.mesh);
        o.mesh.geometry.dispose();
        o.mesh.material.dispose();
        o.tex.dispose();
        labels.delete(id);
      }
  }
  function setTheme(d: boolean): void {
    dark = d;
    bg();
    ground.material.opacity = d ? 0.4 : 0.22;
  }
  function select(id: string | null | undefined): void {
    for (const [k, m] of floors)
      m.traverse(o => {
        // floors and their pieces have standard materials
        if (isMesh(o)) (o.material as THREE.MeshStandardMaterial).emissiveIntensity = k === id ? 0.35 : 0;
      });
  }
  // Home view (D-035): where the apartment opens and where “Home” leads. Until the user saves their own, the old
  // angle (32° around, 58° tilt), whole model. Their own is {t (look-at target), theta, phi, fit (frame size)}, stored in the plan.
  const HOME0 = {theta: DEG0(32), phi: DEG0(58)};
  let home = HOME0;
  let saved: HomeView | null = null;
  const r3 = (v: number): number => +v.toFixed(3);
  function getView(): HomeView {
    const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    return {
      // the target's three coordinates, rounded
      t: controls.target.toArray().map(r3) as Vec3,
      theta: +s.theta.toFixed(4),
      phi: +s.phi.toFixed(4),
      fit: (camera.userData.fit || [8, 5]).map((v: number) => r3(v / camera.zoom)),
    };
  }
  function applyView(v: HomeView): void {
    controls.target.fromArray(v.t);
    camera.position.setFromSphericalCoords(24, v.phi, v.theta).add(controls.target);
    camera.lookAt(controls.target);
    camera.userData.fit = [...v.fit];
    resize();
  }
  function setHome(v: HomeView | null | undefined): void {
    saved = v?.t && v.fit ? v : null;
    home = saved ? {theta: saved.theta, phi: saved.phi} : HOME0;
  }
  // “Home”: smoothly to the saved view; with none, to the old angle with the whole model
  function goHome(): void {
    if (!saved) {
      focus(null);
      return;
    }
    const s0 = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const f0 = (camera.userData.fit || saved.fit).map((v: number) => v / camera.zoom);
    let dt = saved.theta - s0.theta;
    dt = Math.atan2(Math.sin(dt), Math.cos(dt));
    tween = {
      t0: performance.now(),
      dur: FLY(dt),
      turn: dt,
      from: {t: controls.target.clone(), theta: s0.theta, phi: s0.phi, r: s0.radius, fit: f0},
      to: {
        t: new THREE.Vector3().fromArray(saved.t),
        theta: s0.theta + dt,
        phi: saved.phi,
        r: 24,
        fit: [...saved.fit],
      },
    };
    framed = true;
    setMoved(false);
  }
  // rotated or zoomed by hand: report it (the 3D window shows “Save view”)
  let onMoved: ((moved: boolean) => void) | null = null;
  const setMoved = (m: boolean): void => {
    if (userMoved === m) return;
    userMoved = m;
    onMoved?.(m);
  };
  // Fit the model by its on-screen silhouette: frame corners are converted to camera space, center and scale come from them.
  let lastBox: THREE.Box3 | null = null;
  function frame(box: THREE.Box3): void {
    lastBox = box.clone();
    const c = box.getCenter(new THREE.Vector3());
    c.y = 0.8;
    const tilt = home.phi;
    const spin = home.theta;
    controls.target.copy(c);
    camera.position
      .set(Math.sin(tilt) * Math.sin(spin), Math.cos(tilt), Math.sin(tilt) * Math.cos(spin))
      .multiplyScalar(24)
      .add(c);
    camera.lookAt(c);
    camera.updateMatrixWorld();
    const inv = camera.matrixWorldInverse;
    const pts = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z).applyMatrix4(inv));
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    // move the target to the center of the silhouette
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const shift = right.multiplyScalar((x0 + x1) / 2).add(up.multiplyScalar((y0 + y1) / 2));
    controls.target.add(shift);
    camera.position.add(shift);
    camera.userData.fit = [(x1 - x0) / 2, (y1 - y0) / 2];
    resize();
  }
  // Show an area (outline in plan meters) centered, with neighbors around it (frame = area ×2.2, i.e. it takes
  // about 45% of the window, but not further out than the whole model). The angle is chosen by counting: 8 sides × 2 tilts, for each, what share
  // of the area's floor is visible rather than hidden by walls (rays from floor points to the camera; a facade hidden at this angle does not block).
  // The best is where more is visible; turning away from the default view and a higher tilt are penalized slightly so the model does not spin needlessly.
  // Without an outline, the whole model, as at the start. Smooth; touching the view aborts the flight.
  let tween: Tween | null = null;
  const ray = new THREE.Raycaster();
  const DEG = THREE.MathUtils.degToRad;
  const FLY = (turn: number): number => 700 + Math.abs(turn) * 100;
  // Fly to a saved view (getView): “Back” from a room in Preview returns the previous frame.
  function flyTo(v?: HomeView | null): void {
    if (!v) return goHome();
    const s0 = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const f0 = (camera.userData.fit || v.fit).map((x: number) => x / camera.zoom);
    let dt = v.theta - s0.theta;
    dt = Math.atan2(Math.sin(dt), Math.cos(dt));
    tween = {
      t0: performance.now(),
      dur: FLY(dt),
      turn: dt,
      from: {t: controls.target.clone(), theta: s0.theta, phi: s0.phi, r: s0.radius, fit: f0},
      to: {t: new THREE.Vector3().fromArray(v.t), theta: s0.theta + dt, phi: v.phi, r: 24, fit: [...v.fit]},
    };
  }
  // A room in Preview (as in 3d_floor/viewer.js): the selected one is outlined on the floor; the one hovered from the panel glows
  // (room-glow.js): the light rises from the floor over 1/6 s; a flash on chip click is three waves over 1.5 s.
  let roomsNow: Room[] = [];
  let outline: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial> | null = null;
  let outlineId: string | null = null;
  let glowPulse: number | null = null;
  const glows = new Map<string, {glow: ReturnType<typeof createRoomGlow>; amount: number; target: number}>();
  const centerOf = (P: Outline): Point => {
    const xs = P.map(q => q[0]);
    const ys = P.map(q => q[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  };
  function dropRoomFx(): void {
    if (outline) {
      scene.remove(outline);
      outline.geometry.dispose();
      outline = null;
    }
    for (const g of glows.values()) {
      scene.remove(g.glow.group);
      g.glow.group.traverse(o => {
        if (isMesh(o)) {
          o.geometry.dispose();
          // the glow's meshes have one material each
          (o.material as THREE.Material).dispose();
        }
      });
    }
    glows.clear();
    if (outlineId) setOutline(outlineId);
  }
  function setOutline(id: string | null | undefined): void {
    outlineId = id || null;
    if (outline) {
      scene.remove(outline);
      outline.geometry.dispose();
      outline = null;
    }
    const r = id && roomsNow.find(x => x.id === id);
    if (!r) return;
    outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(r.polygon.map(([x, y]) => new THREE.Vector3(x, 0.048, -y))),
      new THREE.LineBasicMaterial({color: 0x5f8b78, transparent: true, opacity: 0.8}),
    );
    scene.add(outline);
  }
  function setGlow(ids: string[] = [], {pulse = false} = {}): void {
    const want = new Set(ids);
    for (const id of want)
      if (!glows.has(id)) {
        const r = roomsNow.find(x => x.id === id);
        if (!r || r.solid) continue;
        const glow = createRoomGlow({id: r.id, polygon: r.polygon, center: centerOf(r.polygon)});
        scene.add(glow.group);
        glows.set(id, {glow, amount: 0, target: 0});
      }
    for (const [id, g] of glows) g.target = want.has(id) ? 1 : 0;
    glowPulse = pulse && want.size ? performance.now() : null;
  }
  let glowT = performance.now();
  function stepGlow(): boolean {
    const now = performance.now();
    const dt = Math.min(0.1, (now - glowT) / 1000);
    glowT = now;
    const pulse = glowPulse != null && now - glowPulse < 1500 ? (now - glowPulse) / 1500 : null;
    if (pulse === null) glowPulse = null;
    let moving = pulse !== null;
    for (const g of glows.values()) {
      const d = g.target - g.amount;
      if (Math.abs(d) > 0.001) {
        g.amount += Math.sign(d) * Math.min(Math.abs(d), reducedMotion() ? 1 : dt * 6);
        moving = true;
      } else if (g.amount !== g.target) {
        g.amount = g.target;
        moving = true;
      } else if (pulse === null) continue;
      g.glow.set(
        g.amount,
        pulse === null ? 1 : 1 + 1.1 * Math.abs(Math.sin(pulse * Math.PI * 3)) * (1 - pulse),
      );
    }
    return moving;
  }
  function bestView(poly: Outline): ViewAngle {
    const xs = poly.map(q => q[0]);
    const ys = poly.map(q => q[1]);
    const x0 = Math.min(...xs) + 0.15;
    const x1 = Math.max(...xs) - 0.15;
    const y0 = Math.min(...ys) + 0.15;
    const y1 = Math.max(...ys) - 0.15;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++) {
        const q: Point = [x0 + ((x1 - x0) * (i + 0.5)) / 6, y0 + ((y1 - y0) * (j + 0.5)) / 6];
        if (pointIn(q, poly)) pts.push(new THREE.Vector3(q[0], 0.05, -q[1]));
      }
    if (!pts.length) return {theta: DEG(32), phi: DEG(58)};
    // focus calls it only when there is a model
    model!.updateMatrixWorld(true);
    ray.near = 0.02;
    ray.far = 40;
    let best: Required<ViewAngle> | null = null;
    for (const tilt of [58, 40])
      for (let i = 0; i < 8; i++) {
        const theta = DEG(32 + 45 * i);
        const phi = DEG(tilt);
        const d = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
        const view = new THREE.Vector3(-d.x, 0, -d.z).normalize();
        const objs = [
          ...occluders,
          ...sides.filter(x => x.out.dot(view) > -0.25).flatMap(x => x.grp.children),
        ];
        let vis = 0;
        for (const p of pts) {
          ray.set(p, d);
          if (!ray.intersectObjects(objs, false).length) vis++;
        }
        const score = vis / pts.length - 0.04 * Math.min(i, 8 - i) - (tilt !== 58 ? 0.05 : 0);
        if (!best || score > best.score + 1e-9) best = {theta, phi, score, vis: vis / pts.length};
      }
    // all 16 angles were scored, the first one sets it
    return best!;
  }
  // pad is the margin around the room: 2.2 in the editor (neighbors visible), 1.25 in Preview, tight, as in the 3d_floor card
  function focus(poly: Outline | null | undefined, {pad = 2.2} = {}): ViewAngle | undefined {
    if (!model) return;
    const whole = new THREE.Box3().setFromObject(model);
    let box = whole;
    if (poly?.length) {
      box = new THREE.Box3();
      for (const [x, y] of poly) {
        box.expandByPoint(new THREE.Vector3(x, 0, -y));
        box.expandByPoint(new THREE.Vector3(x, WALL.height, -y));
      }
    }
    const c = box.getCenter(new THREE.Vector3());
    c.y = poly ? 0.6 : 0.8;
    const view: ViewAngle = poly?.length ? bestView(poly) : {theta: home.theta, phi: home.phi, score: 1};
    const {theta, phi} = view;
    const cam = camera.clone();
    const tgt = c.clone();
    cam.position.setFromSphericalCoords(24, phi, theta).add(tgt);
    cam.lookAt(tgt);
    cam.updateMatrixWorld();
    const sil = (b: THREE.Box3): [number, number, number, number] => {
      const pts = [];
      for (const x of [b.min.x, b.max.x])
        for (const y of [b.min.y, b.max.y])
          for (const z of [b.min.z, b.max.z])
            pts.push(new THREE.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse));
      const xs = pts.map(p => p.x);
      const ys = pts.map(p => p.y);
      return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    };
    const [x0, x1, y0, y1] = sil(box);
    const [w0, w1, v0, v1] = sil(whole);
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    tgt.add(right.multiplyScalar((x0 + x1) / 2).add(up.multiplyScalar((y0 + y1) / 2)));
    const k = poly ? pad : 1;
    const fit = [Math.min(((x1 - x0) / 2) * k, (w1 - w0) / 2), Math.min(((y1 - y0) / 2) * k, (v1 - v0) / 2)];
    const s0 = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const f0 = (camera.userData.fit || fit).map((v: number) => v / camera.zoom);
    let dt = theta - s0.theta;
    dt = Math.atan2(Math.sin(dt), Math.cos(dt));
    // a big rotation takes longer so you can see where the model turned
    tween = {
      t0: performance.now(),
      dur: FLY(dt),
      turn: dt,
      from: {t: controls.target.clone(), theta: s0.theta, phi: s0.phi, r: s0.radius, fit: f0},
      to: {t: tgt, theta: s0.theta + dt, phi, r: 24, fit},
    };
    if (poly)
      setMoved(true); // own view: rebuilding the walls will not reset it
    else {
      framed = true;
      setMoved(false);
    }
    return view;
  }
  // Camera flight, as in the 3d_floor card (room-camera.js): smooth acceleration and deceleration (smootherstep); a long rotation
  // lifts the camera slightly above the apartment; duration 0.7 s + 0.1 s per radian of rotation.
  function stepTween(): boolean {
    if (!tween) return false;
    const q = reducedMotion() ? 1 : Math.min(1, (performance.now() - tween.t0) / tween.dur);
    const e = q * q * q * (q * (q * 6 - 15) + 10);
    const {from: a, to: b} = tween;
    const L = (x: number, y: number): number => x + (y - x) * e;
    const lift = Math.sin(Math.PI * e) * Math.min(0.16, Math.abs(tween.turn || 0) * 0.07);
    controls.target.lerpVectors(a.t, b.t, e);
    camera.position
      .setFromSphericalCoords(L(a.r, b.r), Math.max(0.02, L(a.phi, b.phi) - lift), L(a.theta, b.theta))
      .add(controls.target);
    camera.lookAt(controls.target);
    camera.userData.fit = [L(a.fit[0], b.fit[0]), L(a.fit[1], b.fit[1])];
    resize();
    if (q >= 1) tween = null;
    return true;
  }
  controls.addEventListener('start', () => {
    tween = null;
  });
  // “How to rotate” demo (view-demo.js): rotate the camera around the target by angle a; it does not count as rotated by hand.
  // While a smooth transition to the home view is running, no (false): the demo will not disrupt it.
  function spin(a: number): boolean {
    if (tween) return false;
    const o = camera.position.clone().sub(controls.target).applyAxisAngle(UP, a);
    camera.position.copy(controls.target).add(o);
    camera.lookAt(controls.target);
    controls.update();
    return true;
  }
  // Devices from HA (D-048). Air conditioner: airflow from under the body, forward and down, color by mode; when turned on it fades
  // in smoothly. list: [{id, f (its item on the plan), on, tone, fan}]
  const airGrp = new THREE.Group();
  scene.add(airGrp);
  const airs = new Map<string, Airflow>();
  function setClimate(list: ClimateSpot[]): void {
    const keep = new Set<string>();
    for (const c of list) {
      let a = airs.get(c.id);
      if (!a) {
        a = createAirflow();
        airs.set(c.id, a);
        airGrp.add(a.group);
      }
      keep.add(c.id);
      const f = c.f;
      const r = (f.rot * Math.PI) / 180;
      const fz = [Math.sin(r), -Math.cos(r)];
      const o = f.d / 2 + 0.03;
      a.group.position.set(f.x + fz[0] * o, zOf(f) + 0.02, -(f.y + fz[1] * o));
      a.group.rotation.y = Math.atan2(-fz[0], fz[1]);
      a.set(c);
    }
    for (const [id, a] of airs)
      if (!keep.has(id)) {
        airGrp.remove(a.group);
        a.dispose();
        airs.delete(id);
      }
  }
  // Contact sensor: an open opening glows warm and breathes softly; on an exterior wall it hides together with the facade.
  // list: [{id, a, b, bottom, top, n (normal into the room), open}]
  const doorGrp = new THREE.Group();
  scene.add(doorGrp);
  const opens = new Map<string, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();
  const openMat = (): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({
      color: 0xff9a2e,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  const frameMat = new THREE.LineBasicMaterial({color: 0xff8a1a, toneMapped: false});
  function setContacts(list: ContactSpot[]): void {
    const keep = new Set<string>();
    for (const c of list) {
      if (!c.open) continue;
      keep.add(c.id);
      let m: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null | undefined = opens.get(c.id);
      const l = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
      // An opening without heights (older files) makes the numbers below NaN, as it always did.
      const bottom = c.bottom as number;
      const top = c.top as number;
      const hgt = top - bottom;
      const key = [c.a, c.b, c.bottom, c.top].join();
      if (m && m.userData.key !== key) {
        doorGrp.remove(m);
        m.geometry.dispose();
        m.material.dispose();
        // its frame
        (m.children[0] as THREE.LineSegments | undefined)?.geometry.dispose();
        m = null;
      }
      if (!m) {
        const g = new THREE.PlaneGeometry(l, hgt);
        m = new THREE.Mesh(g, openMat());
        m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), frameMat));
        m.userData.key = key;
        m.raycast = () => {};
        doorGrp.add(m);
        opens.set(c.id, m);
      }
      m.position.set((c.a[0] + c.b[0]) / 2, (bottom + top) / 2, -(c.a[1] + c.b[1]) / 2);
      m.rotation.set(0, Math.atan2(c.b[1] - c.a[1], c.b[0] - c.a[0]), 0);
      m.userData.side = sideOfLabel({
        c: [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2],
        n: c.n,
        y: bottom > 0.3 ? bottom - 0.15 : top + 0.15,
      });
    } // side comes from the wall under the window or above the door
    for (const [id, m] of opens)
      if (!keep.has(id)) {
        doorGrp.remove(m);
        m.geometry.dispose();
        m.material.dispose();
        // its frame
        (m.children[0] as THREE.LineSegments | undefined)?.geometry.dispose();
        opens.delete(id);
      }
  }
  let lastT = performance.now();
  function tickDevices(): boolean {
    const now = performance.now();
    const dt = (now - lastT) / 1000;
    lastT = now;
    let moving = false;
    for (const a of airs.values())
      if (a.group.visible) {
        a.tick(dt);
        moving = true;
      }
    const k = reducedMotion() ? 0.45 : 0.38 + 0.14 * Math.sin(now / 520);
    for (const m of opens.values()) {
      m.material.opacity = k;
      const sd = m.userData.side;
      m.visible = !sd || sides.find(s => s.id === sd)?.grp.visible !== false;
    }
    return moving || (opens.size > 0 && !reducedMotion());
  } // airflow and open windows breathing are animations: frames while they last
  // A panel can float over the 3D view: the model fits into the free part and sits in its center (camera frame offset).
  let insetL = 0;
  let insetR = 0;
  let insetB = 0;
  function resize(): void {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    const aspect = w / h;
    const [fw, fh] = camera.userData.fit || [8, 5];
    const m = 1.08;
    const L = Math.min(insetL, w * 0.5);
    const R = Math.min(insetR, w * 0.5);
    const free = (w - L - R) / w;
    const B = Math.min(insetB, h * 0.6);
    const freeV = (h - B) / h;
    const hw = Math.max((fw * m) / free, (fh * m * aspect) / freeV);
    const hh = hw / aspect;
    const off = ((L - R) * hw) / w;
    const offY = (B * hh) / h;
    Object.assign(camera, {left: -hw - off, right: hw - off, top: hh - offY, bottom: -hh - offY, zoom: 1});
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    redraw();
    backdrop.material.uniforms.asp.value = aspect;
    // read mid-change (the panes swap twice in one go: leave Preview, then 3D large again) the size can be a passing one, and the observer
    // sees no change by the next frame: look once more then
    if (!sizeCheck)
      sizeCheck = requestAnimationFrame(() => {
        sizeCheck = 0;
        if ((host.clientWidth || 1) !== w || (host.clientHeight || 1) !== h) resize();
      });
  }
  let sizeCheck = 0;
  // Panels cover L pixels on the left, R on the right and B at the bottom (the bottom one is Preview's on a narrow screen): the model fits into
  // the middle of the free part.
  const setInsets = (l: number, r = 0, b = 0): void => {
    if (Math.abs(l - insetL) < 1 && Math.abs(r - insetR) < 1 && Math.abs(b - insetB) < 1) return;
    insetL = l;
    insetR = r;
    insetB = b;
    resize();
  };
  const sizes = new ResizeObserver(resize);
  sizes.observe(host);
  // pause() — the view is out of sight (the dashboard card scrolled away or another page): no frames until resume().
  // dispose() — gone for good (the card was removed): the GPU context and everything listening are let go
  let paused = false;
  let raf = 0;
  let gone = false;
  const pause = (): void => {
    paused = true;
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const resume = (): void => {
    if (!paused || gone) return;
    paused = false;
    redraw();
    if (!raf) raf = requestAnimationFrame(loop);
  };
  // Frames on demand: a still home is not redrawn. Drawn 60–120 times a second for nothing, the scene kept the GPU busy — the page
  // stuttered (the loading bar too), so did the whole computer, and a wall tablet with the HA card ran hot. A frame is drawn when the camera
  // has moved, something animates (a fly, damping, airflow, an open window breathing, a room glow, a lamp's shine, solo) or the view was
  // changed: every function the view returns marks it (below), its own timers and animations call redraw().
  const camWas = new Float64Array(12);
  let drawnAt = 0;
  // against the last drawn frame, with a tolerance: damping ends in endless tiny steps that change no pixel
  function camMoved(): boolean {
    const c = camera;
    const p = c.position;
    const q = c.quaternion;
    const v = [p.x, p.y, p.z, q.x, q.y, q.z, q.w, c.left, c.right, c.top, c.bottom, c.zoom];
    let ch = false;
    for (let i = 0; i < 12; i++)
      if (Math.abs(v[i] - camWas[i]) > (i > 2 && i < 7 ? 1e-6 : 1e-4)) {
        ch = true;
        break;
      }
    if (ch) camWas.set(v);
    return ch;
  }
  // shaders of the current scene compiled in parallel, off the page's thread (KHR_parallel_shader_compile): the first frame does not freeze the page
  const warm = (): Promise<unknown> =>
    renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve();
  const dispose = (): void => {
    if (gone) return;
    gone = true;
    pause();
    sizes.disconnect();
    motion?.removeEventListener('change', onMotion);
    controls.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  function loop(): void {
    if (paused) {
      raf = 0;
      return;
    }
    // all of them step every frame; slow ambient motion (airflow, an open window breathing) is drawn at ~24 fps — smooth for it, and the
    // whole scene is not redrawn at the display's 60–120 Hz just for that
    const now = performance.now();
    const tweening = stepTween();
    const damping = controls.update();
    const glowing = stepGlow();
    const camChanged = camMoved();
    const calm = tickDevices();
    const fast = tweening || damping || glowing || camChanged;
    // the sun stays while the view moves (by hand, damping out or flying) and comes after it once it is still
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    if (!(grab || tweening || damping || camChanged) && sunToward(dir)) dirty = Math.max(dirty, 1);
    if (fast || (calm && now - drawnAt >= 41)) dirty = Math.max(dirty, 1);
    if (dirty <= 0) {
      raf = requestAnimationFrame(loop);
      return;
    }
    dirty--;
    drawnAt = now;
    for (const s of sides) {
      s.grp.visible = s.out.dot(dir) > -0.25;
      AOU.htAoVis.value.setComponent(SIDE_AO[s.id], s.grp.visible ? 1 : 0);
    }
    for (const o of labels.values())
      o.mesh.visible = !o.side || sides.find(s => s.id === o.side)?.grp.visible !== false;
    for (const m of fixtures.children)
      if (m.userData.side && !m.userData.off)
        m.visible = sides.find(s => s.id === m.userData.side)?.grp.visible !== false;
    // Tall furniture with its back to the camera hides like a facade: otherwise a wardrobe by an exterior wall blocks the room.
    const faces = (t: number): boolean => -(Math.sin(t) * dir.x + Math.cos(t) * dir.z) > -0.5;
    for (const o of furn.children) {
      if (o.userData.tall) o.visible = faces(o.rotation.y);
      for (const q of o.userData.parts || []) q.visible = faces(q.userData.ry);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  loop();
  // The spot under the pointer (the AI build's pins, ai-review.js): where on the plan and how high, the furniture item hit, and a
  // point a little back towards the camera — inside the room even when the hit is on its wall. Hidden facades are seen through.
  // → {p: [x, y], z, inside: [x, y], item: id | null} or null (nothing there)
  const pickRay = new THREE.Raycaster();
  const pickAt = new THREE.Vector2();
  function pick(clientX: number, clientY: number): PickHit | null {
    const box = renderer.domElement.getBoundingClientRect();
    pickAt.set(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1);
    pickRay.setFromCamera(pickAt, camera);
    const shown = (o: THREE.Object3D): boolean => {
      for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) return false;
      return true;
    };
    const hit = pickRay.intersectObjects(scene.children, true).find(h => isMesh(h.object) && shown(h.object));
    if (!hit) return null;
    let item: string | null = null;
    for (let q: THREE.Object3D | null = hit.object; q; q = q.parent)
      if (q.parent === furn) {
        item = q.userData.id ?? null;
        break;
      }
    const back = hit.point.clone().addScaledVector(pickRay.ray.direction, -0.12);
    const r3 = (v: number): number => +v.toFixed(3);
    return {
      p: [r3(hit.point.x), r3(-hit.point.z)],
      z: r3(Math.max(0, hit.point.y)),
      inside: [r3(back.x), r3(-back.z)],
      item,
    };
  }
  // The view as it is now, drawn once more and handed over at once: a WebGL canvas keeps its picture only until the frame
  // ends, so the caller copies it straight away (the AI build's pins keep what the owner was looking at, ai-review.js).
  function snapshot(): HTMLCanvasElement {
    renderer.render(scene, camera);
    return renderer.domElement;
  }
  // A spot of the plan at height z, in pixels of the view (for pins drawn over it).
  const projected = new THREE.Vector3();
  function project([x, y]: Point, z = 0): [number, number] {
    projected.set(x, z, -y).project(camera);
    return [
      ((projected.x + 1) / 2) * (host.clientWidth || 1),
      ((1 - projected.y) / 2) * (host.clientHeight || 1),
    ];
  }
  const api = {
    renderer,
    scene,
    pause,
    resume,
    dispose,
    warm,
    redraw,
    setInsets,
    setTheme,
    setSensors,
    homeCam: (): [number, number] => [+Math.sin(home.theta).toFixed(4), +(-Math.cos(home.theta)).toFixed(4)],
    home: goHome,
    getView,
    setHome,
    onMoved: (f: (moved: boolean) => void) => {
      onMoved = f;
    },
    moved: () => userMoved,
    spin,
    setClimate,
    setContacts,
    flyTo,
    setOutline,
    setGlow,
    reframe: () => {
      framed = false;
      setMoved(false);
      tween = null;
    },
    focus,
    set,
    setFurniture,
    setLights,
    applyMask,
    setLightOn,
    setLightLevel,
    shine,
    setSolo,
    setNight,
    lightCount: () => devs.reduce((s, d) => s + d.lights.length, 0),
    aoMs: () => aoMs,
    ao: AOU,
    lights: {hemi, sun},
    select,
    camera,
    controls,
    pick,
    project,
    snapshot,
  };
  // a change through the view — a frame; reading it is not one
  const READ = new Set([
    'pause',
    'resume',
    'dispose',
    'warm',
    'redraw',
    'homeCam',
    'getView',
    'onMoved',
    'moved',
    'lightCount',
    'aoMs',
    'pick',
    'project',
    'snapshot',
  ]);
  const methods: Record<string, unknown> = api;
  for (const [k, f] of Object.entries(api))
    if (typeof f === 'function' && !READ.has(k)) {
      // each method gets its own arguments, passed on as they came
      const method = f as (...args: unknown[]) => unknown;
      methods[k] = (...a: unknown[]) => {
        const r = method(...a);
        redraw();
        return r;
      };
    }
  return api;
}
