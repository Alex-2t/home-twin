// Devices in the model (D-048): air conditioners, curtains and blinds, window and door sensors. Data only: what the device is, what it is
// attached to, how to place it automatically, what to show in 3D and in the panel.
// plan.devices: [{id, entity, furn?, opening?, made?}]: furn is a furniture item (air conditioner, curtains, roller blind), opening is
// an opening (contact sensor); made means the item was placed together with the device: remove the device and it goes too.
// Devices and their states come from the HA layer (editor/ha.js): devices() → [{entity, name, area, domain, cls}], entity(e) → {state, attributes}.
import {t} from '../i18n/i18n.ts';
import {WALL, area, pointIn, openingCoords} from './geometry.ts';
import {byId, zOf} from './catalog.ts';
import {roomOfArea} from './sensors.ts';
import {wallInfo, OPENING} from './plan.ts';
import {roomKind} from './overview.ts';
import type {
  AcView,
  ContactView,
  CoverView,
  FurnitureItem,
  HaDevice,
  HaLayer,
  HassAttributes,
  HassEntityState,
  Opening,
  PlacedOpening,
  Plan,
  PlanDevice,
  Point,
  Room,
  Vector,
} from './types.ts';

/** What a device is (deviceKind): an air conditioner, a thermostat or boiler, a cover, a contact sensor. */
export type DeviceKind = 'ac' | 'heat' | 'cover' | 'contact';
/** An entity's state as the device views read it: its state, and its attributes when it has them. */
type EntityState = Pick<HassEntityState, 'state'> & Partial<Pick<HassEntityState, 'attributes'>>;
/** What telling a device's kind reads: its domain, and its name and class when it has them. */
type DeviceInfo = Pick<HaDevice, 'domain'> & Partial<Pick<HaDevice, 'name' | 'cls'>>;
/** What placing devices reads and changes of a plan; a plan from an older editor may have no devices yet. */
type DevicePlan = Pick<Plan, 'rooms' | 'openings' | 'furniture' | 'wall'> & Partial<Pick<Plan, 'devices'>>;
/** Edge i of a room (edge): its ends, length, direction and inward normal. */
interface RoomSide {
  i: number;
  a: Point;
  b: Point;
  L: number;
  u: Vector;
  n: Vector;
}
/** An opening on its room's face (openingSide): its room, edge, ends now, and from s0 to s1 along the edge. */
interface OpeningSide {
  o: Opening;
  r: Room;
  e: RoomSide;
  c: PlacedOpening;
  s0: number;
  s1: number;
}
/** Where a device is put by hand: an edge of a room (at t metres along it), or an opening. */
export type DeviceTarget =
  | {room: string; edge: number; t: number; opening?: undefined}
  | {opening: string; room?: undefined; edge?: undefined; t?: undefined};
/** What the 3D view shows of the devices (liveScene). */
export interface LiveScene {
  /** How open each cover's item is, 0–1, by the item's id. */
  open: Map<string, number>;
  /** Each air conditioner's airflow: its entity, its item, on, the mode's tone and the fan. */
  climate: Array<{id: string; f: FurnitureItem; on: boolean; tone?: string; fan?: string}>;
  /** Each contact sensor: its entity, its opening, open, the opening's ends and heights, the edge's inward normal. */
  contacts: Array<{
    id: string;
    opening: string;
    open: boolean;
    a: Point;
    b: Point;
    bottom?: number;
    top?: number;
    n: Vector;
  }>;
}
/** A stretch [from, to], metres along a wall. */
type Interval = [number, number];

const CONTACT = new Set<string | null | undefined>(['door', 'window', 'garage_door', 'opening']);
// What the device is: ac is an air conditioner, heat is a thermostat or boiler (heating only: not in the model, a setpoint in the panel),
// cover is curtains or blinds, contact is a window or door contact sensor; null means not ours. x is the HA state (entity), if any:
// for climate, the modes tell whether it cools; without a state, go by the name.
// heat_cool (holds a range) also occurs on boilers, so it does not mean an air conditioner by itself (live HA: “Boiler thermostat” has off, heat_cool, heat)
const COOLS = ['cool', 'dry', 'fan_only'];
const AC_NAME = /кондиц|сплит|air ?con|a\/c|\bac\b|klima|climatis|aire acond|condizion|airco|klimatyz|空调/i;
const HEAT_NAME =
  /термостат|кот[её]л|батаре|радиатор|отоплен|т[её]пл\S* пол|thermostat|boiler|radiator|heating|heater|floor heat|heizung|heizkörper|fußboden|chaudière|radiateur|chauffage|caldera|calefacc|radiador|caldaia|termosifone|riscaldamento|ketel|verwarming|kocioł|grzejnik|ogrzewanie|caldeira|aquecimento|暖气|锅炉|地暖|温控/i;
export function deviceKind(d: DeviceInfo, x?: EntityState | null): DeviceKind | null {
  if (d.domain === 'climate') {
    const m = x?.attributes?.hvac_modes;
    if (Array.isArray(m) && m.length) return m.some(k => COOLS.includes(k)) ? 'ac' : 'heat';
    return HEAT_NAME.test(d.name || '') && !AC_NAME.test(d.name || '') ? 'heat' : 'ac';
  }
  if (d.domain === 'cover') return coverModel(d) ? 'cover' : null;
  return d.domain === 'binary_sensor' && CONTACT.has(d.cls) ? 'contact' : null;
}
// which of these are placed in the model (a thermostat has no model)
export const PLACEABLE = new Set<DeviceKind | null>(['ac', 'cover', 'contact']);
// The thermostat of a central system (ecobee, Nest: heat, cool, heat_cool) cools, yet it has no unit on a wall: auto-place does not hang
// a split air conditioner for it (it can still be placed by hand)
const THERMO = /термостат|thermostat|thermostaat|termostat|ecobee|\bnest\b|温控/i;
export const isCentral = (d: DeviceInfo): boolean =>
  d.domain === 'climate' && THERMO.test(d.name || '') && !AC_NAME.test(d.name || '');
// The cover model: roller blinds, venetian blinds, shutters are “Roller blind”; curtains are “Curtains”. Gates, a wicket gate, a garage door, a damper,
// a window motor and an awning are not window covers: null. No class: go by the name.
const BLINDS =
  /рулон|жалюз|ставн|blind|venetian|roller|shade|shutter|jalousie|rollo|store|volet|persiana|estor|tapparella|veneziana|rolgordijn|jaloezie|rolet|żaluzj|卷帘|百叶/i;
const NOT_WINDOW =
  /ворот|гараж|калитк|шлагбаум|заслонк|маркиз|garage|gate|damper|awning|\btor\b|einfahrt|markise|portail|store banne|portón|toldo|cancello|tenda da sole|poort|brama|markiz|车库|大门|遮阳篷/i;
// A motorized valve often arrives in HA as a cover without a class (the owner's live HA: cover.sonoff_… “Water shutoff valve”, open / closed).
// It must not count as a curtain: the “Curtains” button and the “Night” scene would shut off the water. It belongs in “Security” (isWaterValve).
// the lookbehind keeps the Russian word for “tap” from matching inside the word for “screen” (a projector screen is also a cover); the Russian “valve” is spelled so that “ventilation” does not match
const VALVE =
  /(?<![а-яё])кран|вентиль|клапан|задвижк|valve|faucet|\btap\b|wasserhahn|absperr|robinet|vanne|válvula|llave de paso|rubinetto|valvola|waterkraan|afsluiter|zawór|kurek|阀/i;
const GAS = /газ|\bgas\b|\bgaz\b|燃气/i;
// (A device without a class looks up '': in no list, as with undefined. The same in placeOn and moveTo.)
export const coverModel = (d: Partial<Pick<HaDevice, 'name' | 'cls'>>): 'blind' | 'curtains' | null =>
  ['garage', 'gate', 'door', 'damper', 'window', 'awning'].includes(d.cls ?? '')
    ? null
    : ['blind', 'shade', 'shutter'].includes(d.cls ?? '')
      ? 'blind'
      : d.cls === 'curtain'
        ? 'curtains'
        : NOT_WINDOW.test(d.name || '') || VALVE.test(d.name || '')
          ? null
          : BLINDS.test(d.name || '')
            ? 'blind'
            : 'curtains';
// A water valve: valve.* of class water or without a class; cover.* without a class with a tap or valve word (VALVE) in its name. A gas valve is not water.
export const isWaterValve = (d: DeviceInfo): boolean =>
  !GAS.test(d.name || '') &&
  (d.domain === 'valve'
    ? !d.cls || d.cls === 'water'
    : d.domain === 'cover' && !d.cls && VALVE.test(d.name || ''));
export const MODEL = {ac: 'aircon'};

const nat = (a: string | undefined, b: string | undefined): number =>
  String(a).localeCompare(String(b), undefined, {numeric: true});
const newId = (plan: Pick<DevicePlan, 'furniture' | 'devices'>, p: string): string => {
  const ids = new Set([...plan.furniture, ...(plan.devices || [])].map(x => x.id));
  let k = 1;
  while (ids.has(p + k)) k++;
  return p + k;
};
const sgn = (r: Room): number => (area(r.polygon) > 0 ? 1 : -1);
// edge i of a room: start, direction, length, inward normal
const edge = (r: Room, i: number): RoomSide => {
  const P = r.polygon;
  const a = P[i];
  const b = P[(i + 1) % P.length];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const u: Vector = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const s = sgn(r);
  return {i, a, b, L, u, n: [-u[1] * s, u[0] * s]};
};
const rotTo = (n: Vector): number => +((Math.atan2(n[0], -n[1]) * 180) / Math.PI).toFixed(1); // the item's front (axes: fz) along normal n
// an item at edge e of a room: at t along it, back against the wall
// (model is an air conditioner, curtains or a blind: in the catalog, hence byId!)
function itemAt(
  plan: Pick<DevicePlan, 'furniture' | 'devices'>,
  model: string,
  e: RoomSide,
  t: number,
  extra: Partial<FurnitureItem> = {},
): FurnitureItem {
  const c = byId(model)!;
  const d = extra.d ?? c.d;
  const o = WALL.inner + d / 2;
  return {
    id: newId(plan, 'f'),
    model,
    w: c.w,
    d,
    h: c.h,
    color: c.color,
    rot: rotTo(e.n),
    x: +(e.a[0] + e.u[0] * t + e.n[0] * o).toFixed(3),
    y: +(e.a[1] + e.u[1] * t + e.n[1] * o).toFixed(3),
    ...extra,
  };
}

// A binding is alive while its item or opening exists; otherwise the device is “not in the model”. No entity: none.
export const recOf = (
  plan: Pick<DevicePlan, 'furniture' | 'openings' | 'devices'>,
  entity: string | null | undefined,
): PlanDevice | null =>
  (plan.devices || []).find(
    x =>
      x.entity === entity &&
      (x.furn ? plan.furniture.some(f => f.id === x.furn) : plan.openings.some(o => o.id === x.opening)),
  ) || null;
// The rooms of an opening: its own and the one on the other side of the wall.
export function openingRooms(plan: DevicePlan, o: Opening): Room[] {
  const r = plan.rooms.find(x => x.id === o.at.room);
  if (!r) return [];
  try {
    return [r, ...wallInfo(plan, r, o.at.edge).B.map(([x]) => x)].filter((x, i, a) => a.indexOf(x) === i);
  } catch {
    return [r];
  }
}
// An opening: the segment a–b on the room face, its edge e (of room at.room) and its position s0–s1 along it.
function openingSide(plan: DevicePlan, o: Opening): OpeningSide | null {
  const r = plan.rooms.find(x => x.id === o.at.room);
  const c = r && openingCoords(plan.rooms, o);
  if (!c) return null;
  const e = edge(r, o.at.edge % r.polygon.length);
  return {o, r, e, c, s0: Math.min(o.at.s0, o.at.s1), s1: Math.max(o.at.s0, o.at.s1)};
}
const inRoom = (f: Pick<FurnitureItem, 'x' | 'y'>, r: Room): boolean => pointIn([f.x, f.y], r.polygon);

// A free upper wall for an air conditioner: the longest stretch with no windows or doors reaching the ceiling, no tall furniture and no other
// air conditioners. → {e, t}: the edge and the middle of the stretch, or null.
// (Number(c.top) and the like below: an opening's height as the operators read it, undefined in an older file staying NaN.)
function acSpot(plan: DevicePlan, r: Room): {e: RoomSide; t: number; len: number} | null {
  let best: {e: RoomSide; t: number; len: number} | null = null;
  for (let i = 0; i < r.polygon.length; i++) {
    if (r.wt?.[i] === 0 || (r.rail?.[i] ?? 0) > 0) continue;
    const e = edge(r, i);
    if (e.L < 1) continue;
    const along = (q: Point): number => (q[0] - e.a[0]) * e.u[0] + (q[1] - e.a[1]) * e.u[1];
    const off = (q: Point): number => (q[0] - e.a[0]) * e.n[0] + (q[1] - e.a[1]) * e.n[1];
    const blocks: Interval[] = [];
    for (const o of plan.openings) {
      const c = openingCoords(plan.rooms, o);
      if (!c || Number(c.top) < 2.1) continue;
      if (Math.abs(off(c.a)) > 0.45 || Math.abs(off(c.b)) > 0.45) continue;
      const s = [along(c.a), along(c.b)].sort((x, y) => x - y);
      blocks.push([s[0] - 0.15, s[1] + 0.15]);
    }
    for (const f of plan.furniture) {
      if (zOf(f) + f.h < 2.05 && f.model !== 'aircon') continue;
      if (!inRoom(f, r)) continue;
      const t = (f.rot * Math.PI) / 180;
      const ax: Vector = [Math.cos(t), Math.sin(t)];
      const fz: Vector = [Math.sin(t), -Math.cos(t)];
      const cs = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([x, z]): Point => [
        f.x + (ax[0] * x * f.w) / 2 + (fz[0] * z * f.d) / 2,
        f.y + (ax[1] * x * f.w) / 2 + (fz[1] * z * f.d) / 2,
      ]);
      if (!cs.some(q => off(q) < 0.5)) continue;
      const s = cs.map(along);
      blocks.push([Math.min(...s) - 0.1, Math.max(...s) + 0.1]);
    }
    let free: Interval[] = [[0.25, e.L - 0.25]];
    for (const [b0, b1] of blocks)
      free = free.flatMap(([f0, f1]): Interval[] =>
        b1 <= f0 || b0 >= f1
          ? [[f0, f1]]
          : (
              [
                [f0, b0],
                [b1, f1],
              ] satisfies Interval[]
            ).filter(([x, y]) => y - x > 0.05),
      );
    for (const [f0, f1] of free)
      if (f1 - f0 >= 0.9 && (!best || f1 - f0 > best.len)) best = {e, t: (f0 + f1) / 2, len: f1 - f0};
  }
  return best;
}

// Curtains for a window (or for section k of n, counting from the left as seen from the room): “Curtains” are wider than the window and reach the ceiling, a “Roller blind” matches the window, from the sill.
function coverItem(plan: DevicePlan, model: string | null, W: OpeningSide, k = 0, n = 1): FurnitureItem {
  const {e, c} = W;
  const len = W.s1 - W.s0;
  const sw = len / n;
  const lr = e.u[0] * -e.n[1] + e.u[1] * e.n[0] > 0; // does the edge run left to right?
  const s = lr ? W.s0 + sw * k + sw / 2 : W.s1 - sw * k - sw / 2;
  if (model === 'blind') {
    // a window from an older file may have no bottom or top: it is taken as a usual window (plan.ts OPENING)
    const sill = c.bottom ?? OPENING.window.bottom;
    const head = c.top ?? OPENING.window.top;
    const z = Math.max(0, +(sill - 0.04).toFixed(2));
    return itemAt(plan, 'blind', e, s, {
      w: +(sw - 0.02).toFixed(3),
      z,
      h: +(head + 0.1 - z).toFixed(2),
    });
  }
  return itemAt(plan, 'curtains', e, s, {
    w: +(sw + (n > 1 ? 0 : 0.3)).toFixed(3),
    h: +Math.min(2.55, WALL.height - 0.05).toFixed(2),
  });
}
// the room's windows from left to right, as seen from the room
export const windowsOf = (plan: DevicePlan, r: Room): OpeningSide[] =>
  plan.openings
    .filter(o => o.kind === 'window' && o.at.room === r.id)
    .map(o => openingSide(plan, o))
    .filter((W): W is OpeningSide => Boolean(W));
const rightOf = (W: OpeningSide): number => {
  const m = [(W.c.a[0] + W.c.b[0]) / 2, (W.c.a[1] + W.c.b[1]) / 2];
  return m[0] * -W.e.n[1] + m[1] * W.e.n[0];
};
// whether such a cover is already at the window (placed in “Furniture”)
const coverNear = (
  plan: Pick<DevicePlan, 'furniture'>,
  W: OpeningSide,
  model: string | null,
  used: Set<string | undefined>,
): FurnitureItem | undefined =>
  plan.furniture.find(
    f =>
      f.model === model &&
      !used.has(f.id) &&
      inRoom(f, W.r) &&
      (() => {
        const t = (f.x - W.e.a[0]) * W.e.u[0] + (f.y - W.e.a[1]) * W.e.u[1];
        const o = (f.x - W.e.a[0]) * W.e.n[0] + (f.y - W.e.a[1]) * W.e.n[1];
        return o < 0.5 && t > W.s0 - 0.3 && t < W.s1 + 0.3;
      })(),
  );

const GARAGE = /гараж|garag|garaż|车库/i;
const ENTRY =
  /входн|парадн|front|entrance|entry|main door|haustür|eingang|entrée|porte d'entrée|entrada|puerta principal|ingresso|porta d'ingresso|voordeur|wejści|入户|大门|前门|正门/i;
// A contact sensor: an opening of the right kind in the room of its area. If there are several, go by the name: “front/entrance” means the exterior door,
// “balcony” means the balcony door; otherwise only when there is just one.
function contactOpening(
  plan: DevicePlan,
  d: HaDevice,
  r: Room,
  taken: Set<string | undefined>,
): Opening | null {
  const kind = d.cls === 'window' ? 'window' : d.cls === 'opening' ? null : 'door';
  const cand = plan.openings.filter(
    o => (!kind || o.kind === kind) && !taken.has(o.id) && openingRooms(plan, o).includes(r),
  );
  if (cand.length <= 1) return cand[0] || null;
  const name = d.name || '';
  const outer = cand.filter(o => {
    const R = plan.rooms.find(x => x.id === o.at.room);
    try {
      // R! : an opening whose room is gone makes wallInfo throw, and that counts as not out
      return !wallInfo(plan, R!, o.at.edge).interior;
    } catch {
      return false;
    }
  });
  if (ENTRY.test(name) && outer.length === 1) return outer[0];
  // a garage door: the widest door out (the garage's other doors lead into the house or the garden)
  if (d.cls === 'garage_door' || GARAGE.test(name)) {
    if (outer.length)
      return outer.reduce((a, b) => (Math.abs(b.at.s1 - b.at.s0) > Math.abs(a.at.s1 - a.at.s0) ? b : a));
  }
  // a balcony, terrace, patio or garden door: the door into that room; such a room is not drawn — the room's only door out
  if (roomKind(name) === 'balcony') {
    const b = cand.filter(o =>
      openingRooms(plan, o).some(x => x !== r && roomKind(x.name, x.area, x.id) === 'balcony'),
    );
    if (b.length === 1) return b[0];
    if (!b.length && outer.length === 1) return outer[0];
  }
  return null;
}

// Automatically place everything not yet in the model: an air conditioner goes to its item in the room or onto a free upper wall;
// covers go onto the room's windows (more covers than windows and a single window: as sections from left to right, in name order);
// a contact sensor goes onto an opening. The room comes from the HA area. ent(e) is the HA state (a thermostat is told apart from an air conditioner
// by its modes). → how many were placed.
export function autoPlace(
  plan: DevicePlan,
  devs: HaDevice[],
  ent: (entity: string) => EntityState | null | undefined = () => null,
): number {
  plan.devices ??= [];
  let n = 0;
  const kind = (d: HaDevice): DeviceKind | null => deviceKind(d, ent(d.entity));
  const usedF = new Set(plan.devices.map(x => x.furn).filter(Boolean));
  const usedO = new Set(plan.devices.map(x => x.opening).filter(Boolean));
  const add = (d: HaDevice, rec: Pick<PlanDevice, 'furn' | 'opening' | 'made'>): void => {
    plan.devices = plan.devices!.filter(x => x.entity !== d.entity); // set at the top
    plan.devices.push({id: newId(plan, 'd'), entity: d.entity, ...rec});
    n++;
  };
  const todo = devs.filter(d => PLACEABLE.has(kind(d)) && !recOf(plan, d.entity));
  for (const d of todo.filter(d => kind(d) === 'ac' && !isCentral(d))) {
    const r = roomOfArea(plan, d.area);
    if (!r) continue;
    const f = plan.furniture.find(f => f.model === 'aircon' && !usedF.has(f.id) && inRoom(f, r));
    if (f) {
      usedF.add(f.id);
      add(d, {furn: f.id});
      continue;
    }
    const sp = acSpot(plan, r);
    if (!sp) continue;
    const it = itemAt(plan, 'aircon', sp.e, sp.t);
    plan.furniture.push(it);
    usedF.add(it.id);
    add(d, {furn: it.id, made: true});
  }
  const covers = new Map<Room, HaDevice[]>();
  for (const d of todo.filter(d => kind(d) === 'cover')) {
    const r = roomOfArea(plan, d.area);
    if (!r) continue;
    if (!covers.has(r)) covers.set(r, []);
    covers.get(r)!.push(d); // set just above
  }
  for (const [r, cs] of covers) {
    cs.sort((a, b) => nat(a.name, b.name));
    const busy = new Set(
      plan.devices
        .map(x => plan.furniture.find(f => f.id === x.furn))
        .filter((f): f is FurnitureItem => !!f && f.model !== 'aircon')
        .map(f => f.id),
    );
    const W = windowsOf(plan, r)
      .filter(W => !plan.furniture.some(f => busy.has(f.id) && coverNear(plan, W, f.model, new Set()) === f))
      .sort((a, b) => rightOf(a) - rightOf(b));
    if (!W.length) continue;
    // one window, more covers: sections; otherwise one per window (extra covers do not go onto the widest windows, they are placed by hand)
    const plan1 =
      W.length === 1 && cs.length > 1
        ? cs.map((d, k): [HaDevice, OpeningSide, number, number] => [d, W[0], k, cs.length])
        : cs.slice(0, W.length).map((d, k): [HaDevice, OpeningSide, number, number] => [d, W[k], 0, 1]);
    for (const [d, w, k, cnt] of plan1) {
      const model = coverModel(d);
      const near = cnt === 1 && coverNear(plan, w, model, usedF);
      if (near) {
        usedF.add(near.id);
        add(d, {furn: near.id});
        continue;
      }
      const it = coverItem(plan, model, w, k, cnt);
      plan.furniture.push(it);
      usedF.add(it.id);
      add(d, {furn: it.id, made: true});
    }
  }
  for (const d of todo.filter(d => kind(d) === 'contact')) {
    const r = roomOfArea(plan, d.area);
    if (!r) continue;
    const o = contactOpening(plan, d, r, usedO);
    if (!o) continue;
    usedO.add(o.id);
    add(d, {opening: o.id});
  }
  return n;
}

// Place by hand: an air conditioner onto a room edge (at t along it), a cover onto a window, a sensor onto an opening.
// target: {room, edge, t} | {opening}. → the binding record, or null (does not fit).
export function placeOn(plan: DevicePlan, d: HaDevice, target: DeviceTarget): PlanDevice | null {
  plan.devices ??= [];
  const k = deviceKind(d);
  const prev = (plan.devices || []).find(x => x.entity === d.entity);
  if (prev) unplace(plan, prev);
  let rec: Pick<PlanDevice, 'furn' | 'opening' | 'made'> | null = null;
  if (k === 'ac' && target.room) {
    const r = plan.rooms.find(x => x.id === target.room);
    if (!r) return null;
    const e = edge(r, target.edge);
    const c = byId('aircon')!; // in the catalog
    const t = Math.max(c.w / 2 + 0.05, Math.min(e.L - c.w / 2 - 0.05, target.t));
    const it = itemAt(plan, 'aircon', e, t);
    plan.furniture.push(it);
    rec = {furn: it.id, made: true};
  } else if (target.opening) {
    const o = plan.openings.find(x => x.id === target.opening);
    if (!o) return null;
    if (k === 'contact') {
      if (
        (d.cls === 'window' && o.kind !== 'window') ||
        (['door', 'garage_door'].includes(d.cls ?? '') && o.kind !== 'door')
      )
        return null;
      rec = {opening: o.id};
    } else if (k === 'cover') {
      if (o.kind !== 'window') return null;
      const W = openingSide(plan, o);
      if (!W) return null;
      const it = coverItem(plan, coverModel(d), W);
      plan.furniture.push(it);
      rec = {furn: it.id, made: true};
    }
  }
  if (!rec) return null;
  const R: PlanDevice = {id: newId(plan, 'd'), entity: d.entity, ...rec};
  plan.devices.push(R);
  return R;
}
// Move (dragged on the plan): an air conditioner along the wall, the same item (color and size stay); a cover onto another window,
// at its width; a sensor onto another opening of its kind. Not in the model: place it (placeOn). → true if moved.
export function moveTo(plan: DevicePlan, d: HaDevice, target: DeviceTarget): boolean {
  const rec = recOf(plan, d.entity);
  if (!rec) return !!placeOn(plan, d, target);
  const k = deviceKind(d);
  const f = rec.furn && plan.furniture.find(x => x.id === rec.furn);
  if (k === 'ac' && target.room && f) {
    const r = plan.rooms.find(x => x.id === target.room);
    if (!r) return false;
    const e = edge(r, target.edge % r.polygon.length);
    const t = Math.max(f.w / 2 + 0.05, Math.min(e.L - f.w / 2 - 0.05, target.t));
    const it = itemAt(plan, f.model, e, t, {d: f.d});
    Object.assign(f, {x: it.x, y: it.y, rot: it.rot});
    return true;
  }
  if (!target.opening) return false;
  const o = plan.openings.find(x => x.id === target.opening);
  if (!o) return false;
  if (k === 'contact') {
    if (
      (d.cls === 'window' && o.kind !== 'window') ||
      (['door', 'garage_door'].includes(d.cls ?? '') && o.kind !== 'door')
    )
      return false;
    rec.opening = o.id;
    return true;
  }
  if (k === 'cover' && f && o.kind === 'window') {
    const W = openingSide(plan, o);
    if (!W) return false;
    const it = coverItem(plan, f.model, W);
    Object.assign(f, {x: it.x, y: it.y, rot: it.rot, w: it.w, h: it.h});
    if ('z' in it) f.z = it.z;
    return true;
  }
  return false;
}
// Remove from the model: the binding goes, and so does the item if it was placed together with the device.
export function unplace(plan: DevicePlan, rec: PlanDevice): void {
  plan.devices = (plan.devices || []).filter(x => x !== rec);
  if (rec.made && rec.furn) plan.furniture = plan.furniture.filter(f => f.id !== rec.furn);
}

// ---------- state ----------
// Number.isFinite is true only for numbers: read as the check it is
const finite = Number.isFinite as (value: unknown) => value is number;
export const MODES = (): Record<string, string> => ({
  off: t('Off'),
  cool: t('Cool'),
  heat: t('Heat'),
  auto: t('Auto'),
  heat_cool: t('Auto'),
  dry: t('Dry'),
  fan_only: t('Fan|mode'),
});
// the mode tone is the color of the airflow and the button: heating is warm, cooling light blue, dry lilac, fan turquoise
export const TONE: Record<string, string> = {
  cool: 'cool',
  heat: 'heat',
  auto: 'auto',
  heat_cool: 'auto',
  dry: 'dry',
  fan_only: 'fan',
};
// the setpoint range of an air conditioner or heater that does not give its own (min_temp, max_temp), °C
export const DEFAULT_MIN_TEMP_C = 7;
export const DEFAULT_MAX_TEMP_C = 35;
export function acView(x: EntityState | null | undefined): AcView {
  if (!x || ['unavailable', 'unknown'].includes(x.state)) return {ok: false, on: false};
  const A: HassAttributes = x.attributes || {};
  const mode = x.state;
  return {
    ok: true,
    on: mode !== 'off',
    mode,
    tone: TONE[mode] || 'cool',
    name: MODES()[mode] || mode,
    temp: finite(A.temperature) ? A.temperature : null,
    current: finite(A.current_temperature) ? A.current_temperature : null,
    min: finite(A.min_temp) ? A.min_temp : DEFAULT_MIN_TEMP_C,
    max: finite(A.max_temp) ? A.max_temp : DEFAULT_MAX_TEMP_C,
    step: finite(A.target_temp_step) && A.target_temp_step > 0 ? A.target_temp_step : 0.5,
    fan: A.fan_mode,
    action: A.hvac_action,
    modes: A.hvac_modes || [],
  };
}
export function coverView(x: EntityState | null | undefined): CoverView {
  if (!x || ['unavailable', 'unknown'].includes(x.state)) return {ok: false, open: 0};
  const p = x.attributes?.current_position;
  const pos = finite(p) ? p : x.state === 'open' || x.state === 'opening' ? 100 : 0;
  return {ok: true, pos, open: pos / 100, moving: x.state === 'opening' || x.state === 'closing'};
}
export const contactView = (x: EntityState | null | undefined): ContactView => ({
  ok: !!x && !['unavailable', 'unknown'].includes(x.state),
  open: x?.state === 'on',
});

// What to show in 3D: for covers, how open they are (per item); for air conditioners, the airflow; for openings, whether they are open.
// → {open: Map(furnId → 0…1), climate: [{id, f, on, tone, fan}], contacts: [{id, opening, open, a, b, bottom, top, n}]}
export function liveScene(
  plan: DevicePlan,
  ha: Pick<HaLayer, 'devices' | 'entity'> | null | undefined,
): LiveScene {
  const out: LiveScene = {open: new Map(), climate: [], contacts: []};
  if (!ha?.devices) return out;
  const byE = new Map(ha.devices().map(d => [d.entity, d]));
  for (const rec of plan.devices || []) {
    const d = byE.get(rec.entity);
    if (!d) continue;
    const x = ha.entity(rec.entity);
    const k = deviceKind(d, x);
    if (rec.furn) {
      const f = plan.furniture.find(f => f.id === rec.furn);
      if (!f) continue;
      if (k === 'cover') out.open.set(f.id, coverView(x).open);
      else if (k === 'ac') {
        const v = acView(x);
        out.climate.push({id: rec.entity, f, on: v.on, tone: v.tone, fan: v.fan});
      }
    } else if (rec.opening && k === 'contact') {
      const o = plan.openings.find(o => o.id === rec.opening);
      const W = o && openingSide(plan, o);
      if (!W) continue;
      out.contacts.push({
        id: rec.entity,
        opening: o.id,
        open: contactView(x).open,
        a: W.c.a,
        b: W.c.b,
        bottom: W.c.bottom,
        top: W.c.top,
        n: W.e.n,
      });
    }
  }
  return out;
}
