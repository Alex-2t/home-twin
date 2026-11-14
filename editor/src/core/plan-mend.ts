// A plan that reaches the editor or the dashboard card without the file check (Home Assistant, the version history, the
// browser's own save, an older or newer editor) may hold values the drawing code cannot take. One bad entry must not take the
// whole home down (D-095, 2026-11-14), so migrate mends the plan first, by the file check's own rules (plan-file.ts):
// - an entry the file check would reject as meaningless — not an object, a room without an outline of three corners, an opening
//   on a wall that is not there, an item without a model or a place — is left out;
// - a field the file check would reject, where the editor has a default — a size that is not a positive number, a colour that is
//   not a colour, a rotation that is not a number — goes back to that default;
// - a value that is well formed but unknown here (a furniture model, a variant, a finish, a light's form from a newer editor) is
//   kept: the drawing code degrades it where it is drawn (an unknown model is a plain box of its size).
// A valid plan comes out exactly as it went in. What was mended is listed, for the console.
import {byId} from './catalog.ts';
import {isHex} from './color.ts';
import type {Plan} from './types.ts';

/** A JSON object: its fields are unknown until checked. */
type JsonObject = Record<string, unknown>;

/** What mendPlan changed: the list, the entry's id (when it has one) and what was done. */
export interface MendNote {
  list: string;
  id: string;
  what: string;
}

const isObject = (x: unknown): x is JsonObject => x !== null && typeof x === 'object' && !Array.isArray(x);
const isText = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isPoint = (x: unknown): x is [number, number] =>
  Array.isArray(x) && x.length === 2 && x.every(isNumber);
const isPoints = (x: unknown, least: number): boolean =>
  Array.isArray(x) && x.length >= least && x.every(isPoint);
// An item's colour as the file check takes it: a catalog colour's name or '#rrggbb'.
const isColourKey = (x: unknown): boolean => typeof x === 'string' && (isHex(x) || /^[a-z]+$/.test(x));

/** The “Preview” dashboard layout (look/layout.ts): {cards: [{id} | {id, type: 'entities', title, entities}], removed: [id]}. */
export function isPanelLayout(x: unknown): boolean {
  if (!isObject(x) || !Array.isArray(x.cards)) return false;
  const cardOk = (card: unknown): boolean =>
    isObject(card) &&
    isText(card.id) &&
    (card.type == null ||
      (card.type === 'entities' &&
        typeof (card.title ?? '') === 'string' &&
        Array.isArray(card.entities) &&
        card.entities.every(isText)));
  return (
    x.cards.every(cardOk) && (x.removed == null || (Array.isArray(x.removed) && x.removed.every(isText)))
  );
}

/** The home view in 3D as the file check takes it. */
const isHomeView = (x: unknown): boolean =>
  isObject(x) &&
  Array.isArray(x.t) &&
  x.t.length === 3 &&
  x.t.every(isNumber) &&
  isPoint(x.fit) &&
  isNumber(x.theta) &&
  isNumber(x.phi);

/** Preview scene settings as the file check takes them: {scene: {kind:id: {action}}}. */
const isScenes = (x: unknown): boolean =>
  isObject(x) &&
  Object.values(x).every(
    scene => isObject(scene) && Object.values(scene).every(v => isObject(v) && typeof v.action === 'string'),
  );

/** A light's saved step (light.was) as the wizard reads it: its fields as JSON of [key, value] pairs. */
function isSavedStep(x: unknown): boolean {
  if (!isObject(x) || typeof x.s !== 'string') return false;
  try {
    const pairs: unknown = JSON.parse(x.s);
    return (
      Array.isArray(pairs) && pairs.every(p => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string')
    );
  } catch {
    return false;
  }
}

// An item's size when its own is not a positive number: its model's, else a parts item's own, else this.
const FALLBACK_SIZE_METRES = 0.5;
// An opening's heights when its own are not numbers, as migrate gives an opening from an older file.
const OPENING_HEIGHTS: Record<'door' | 'window', {bottom: number; top: number}> = {
  door: {bottom: 0, top: 2.1},
  window: {bottom: 0.85, top: 2.4},
};
// A sensor's size of digits outside this is not one (the panel offers 0.75 … 2).
const SENSOR_SIZE_MAX = 10;

/** Mends one plan in place; the notes say what was left out or put back to its default. */
export class PlanMender {
  notes: MendNote[] = [];
  plan: Plan;
  constructor(plan: Plan) {
    this.plan = plan;
  }

  private note(list: string, id: unknown, what: string): void {
    this.notes.push({list, id: typeof id === 'string' ? id : '', what});
  }
  // A field that fails its test is removed (the editor's default stands in for it).
  private dropField(entry: JsonObject, list: string, key: string, ok: (value: unknown) => boolean): void {
    if (entry[key] === undefined || ok(entry[key])) return;
    delete entry[key];
    this.note(list, entry.id, `${key} removed`);
  }
  // A list of entries: what is not an object is left out, then each entry is mended or left out.
  private entries(list: string, value: unknown[], keep: (entry: JsonObject) => boolean): JsonObject[] {
    const out: JsonObject[] = [];
    for (const entry of value) {
      if (!isObject(entry)) {
        this.note(list, '', 'an entry that is not an object left out');
        continue;
      }
      if (keep(entry)) out.push(entry);
    }
    return out;
  }
  // An id given twice (or missing where it is needed) gets a new one, so selecting and drawing by id finds one entry.
  private uniqueIds(list: string, entries: JsonObject[], prefix: string): void {
    const seen = new Set<string>();
    for (const entry of entries) {
      if (isText(entry.id) && !seen.has(entry.id)) {
        seen.add(entry.id);
        continue;
      }
      let k = 1;
      while (seen.has(`${prefix}${k}`) || entries.some(e => e.id === `${prefix}${k}`)) k++;
      const was = entry.id;
      const fresh = `${prefix}${k}`;
      entry.id = fresh;
      seen.add(fresh);
      this.note(list, fresh, `id ${JSON.stringify(was ?? null)} given twice or missing: renamed`);
    }
  }

  mend(): MendNote[] {
    const plan = this.plan as unknown as JsonObject;
    this.mendRooms(plan);
    this.mendOpenings(plan);
    this.mendFurniture(plan);
    this.mendLights(plan);
    this.mendSensors(plan);
    this.mendDevices(plan);
    this.mendPlanFields(plan);
    return this.notes;
  }

  private mendRooms(plan: JsonObject): void {
    const rooms = this.entries('rooms', plan.rooms as unknown[], room => {
      if (!isPoints(room.polygon, 3)) {
        this.note('rooms', room.id, 'no outline of three corners: left out');
        return false;
      }
      this.mendRoomFields(room);
      return true;
    });
    this.uniqueIds('rooms', rooms, 'room_mended_');
    plan.rooms = rooms;
  }
  private mendRoomFields(room: JsonObject): void {
    const list = 'rooms';
    this.dropField(room, list, 'name', x => typeof x === 'string');
    this.dropField(room, list, 'area', x => typeof x === 'string');
    this.dropField(room, list, 'floor', x => typeof x === 'string');
    this.dropField(room, list, 'wall', x => typeof x === 'string');
    this.dropField(room, list, 'floorTint', x => x === null || typeof x === 'string');
    this.dropField(room, list, 'wallTint', x => x === null || typeof x === 'string');
    this.dropField(room, list, 'zone', x => isObject(x) && isPoint(x.a) && isPoint(x.b));
    this.dropField(room, list, 'panel', isPanelLayout);
    this.dropField(room, list, 'railGlass', x => typeof x === 'boolean');
    // per edge: a value that is not one becomes “as the room has it” (null)
    this.mendEdgeList(room, 'wt', x => isNumber(x) && x >= 0);
    this.mendEdgeList(room, 'rail', x => isNumber(x) && x >= 0);
    this.mendEdgeList(room, 'wf', x => isObject(x) && typeof x.k === 'string');
    this.mendEdgeList(room, 'wp', x => Array.isArray(x) && x.every(isObject));
    if (room.fp !== undefined) {
      if (!Array.isArray(room.fp)) this.dropField(room, list, 'fp', () => false);
      else {
        const kept = room.fp.filter(piece => isObject(piece) && isPoints(piece.poly, 3));
        if (kept.length !== room.fp.length) {
          room.fp = kept;
          this.note(list, room.id, 'pieces of floor without an outline left out');
        }
      }
    }
  }
  private mendEdgeList(room: JsonObject, key: string, ok: (value: unknown) => boolean): void {
    const value = room[key];
    if (value === undefined) return;
    if (!Array.isArray(value)) {
      delete room[key];
      this.note('rooms', room.id, `${key} removed`);
      return;
    }
    let changed = false;
    const mended = value.map(entry => {
      if (entry == null || ok(entry)) return entry;
      changed = true;
      return null;
    });
    if (!changed) return;
    room[key] = mended;
    this.note('rooms', room.id, `${key}: values that are not ones put back to the room's`);
  }

  private mendOpenings(plan: JsonObject): void {
    const rooms = plan.rooms as JsonObject[];
    const openings = this.entries('openings', plan.openings as unknown[], opening => {
      if (opening.kind !== 'door' && opening.kind !== 'window') {
        this.note('openings', opening.id, 'neither a door nor a window: left out');
        return false;
      }
      const loose = isPoint(opening.a) && isPoint(opening.b);
      if (opening.at != null && !this.onAWall(opening.at, rooms)) {
        if (!loose) {
          this.note('openings', opening.id, 'on a wall that is not there: left out');
          return false;
        }
        // its ends are kept: migrate puts it on the nearest wall again
        delete opening.at;
        this.note('openings', opening.id, 'on a wall that is not there: put back by its ends');
      }
      if (opening.at == null && !loose) {
        this.note('openings', opening.id, 'no place: left out');
        return false;
      }
      if (isObject(opening.at)) this.dropField(opening.at, 'openings', 'd', isNumber);
      const heights = OPENING_HEIGHTS[opening.kind];
      for (const key of ['bottom', 'top'] as const)
        if (opening[key] !== undefined && !isNumber(opening[key])) {
          opening[key] = heights[key];
          this.note('openings', opening.id, `${key} put back to its kind's`);
        }
      this.dropField(opening, 'openings', 'swing', isNumber);
      this.dropField(opening, 'openings', 'glass', x => typeof x === 'boolean');
      this.dropField(opening, 'openings', 'leaf', x => typeof x === 'boolean');
      return true;
    });
    this.uniqueIds(
      'openings',
      openings.filter(o => o.id != null),
      'opening_mended_',
    );
    plan.openings = openings;
  }
  // An opening's place: a room of the plan, an edge it has, and where along it.
  private onAWall(at: unknown, rooms: JsonObject[]): boolean {
    if (!isObject(at)) return false;
    const room = rooms.find(r => r.id === at.room);
    const corners = room?.polygon as unknown[] | undefined;
    return (
      !!corners &&
      Number.isInteger(at.edge) &&
      (at.edge as number) >= 0 &&
      (at.edge as number) < corners.length &&
      isNumber(at.s0) &&
      isNumber(at.s1)
    );
  }

  private mendFurniture(plan: JsonObject): void {
    const furniture = this.entries('furniture', plan.furniture as unknown[], item => {
      if (!isText(item.model)) {
        this.note('furniture', item.id, 'no model: left out');
        return false;
      }
      if (!isNumber(item.x) || !isNumber(item.y)) {
        this.note('furniture', item.id, 'no place: left out');
        return false;
      }
      this.mendItemFields(item);
      return true;
    });
    this.uniqueIds('furniture', furniture, 'item_mended_');
    plan.furniture = furniture;
  }
  private mendItemFields(item: JsonObject): void {
    const list = 'furniture';
    const model = byId(item.model as string);
    const parts = isObject(item.parts) ? item.parts : null;
    for (const key of ['w', 'd', 'h'] as const) {
      const size = item[key];
      if (isNumber(size) && size > 0) continue;
      const own = parts?.[key];
      item[key] = model?.[key] ?? (isNumber(own) && own > 0 ? own : FALLBACK_SIZE_METRES);
      this.note(list, item.id, `${key} put back to the model's`);
    }
    if (item.rot !== undefined && !isNumber(item.rot)) {
      item.rot = 0;
      this.note(list, item.id, 'rot put back to 0');
    }
    this.dropField(item, list, 'z', isNumber);
    this.dropField(item, list, 'color', isColourKey);
    this.dropField(item, list, 'color2', isColourKey);
    this.dropField(item, list, 'top', isText);
    this.dropField(item, list, 'pat', isText);
    this.dropField(item, list, 'patSpec', isObject);
    this.dropField(item, list, 'v', x => typeof x === 'string');
    this.dropField(item, list, 'name', x => typeof x === 'string');
    this.dropField(item, list, 'room', x => typeof x === 'string');
    // a built-in run's ends: both points or neither (runs.ts then finds them from the item's place)
    if ((item.a !== undefined || item.b !== undefined) && !(isPoint(item.a) && isPoint(item.b))) {
      delete item.a;
      delete item.b;
      this.note(list, item.id, 'ends removed');
    }
  }

  private mendLights(plan: JsonObject): void {
    const lights = this.entries('lights', plan.lights as unknown[], light => {
      if (!isText(light.id)) {
        this.note('lights', '', 'no id: left out');
        return false;
      }
      this.mendLightFields(light);
      return true;
    });
    this.uniqueIds('lights', lights, 'light_mended_');
    plan.lights = lights;
  }
  private mendLightFields(light: JsonObject): void {
    const list = 'lights';
    for (const [key, ok] of [
      ['points', isPoint],
      ['segments', (s: unknown) => Array.isArray(s) && s.length === 2 && s.every(isPoint)],
    ] as const) {
      const value = light[key];
      if (value === undefined) continue;
      const kept = Array.isArray(value) ? value.filter(ok) : [];
      if (Array.isArray(value) && kept.length === value.length) continue;
      light[key] = kept;
      this.note(list, light.id, `${key} that are not ones left out`);
    }
    this.dropField(light, list, 'h', isNumber);
    this.dropField(light, list, 'count', isNumber);
    for (const key of ['form', 'opt', 'shade', 'name', 'entity', 'model', 'with'])
      this.dropField(light, list, key, x => typeof x === 'string');
    this.dropField(light, list, 'room', x => x === null || typeof x === 'string');
    this.dropField(light, list, 'body', isHex);
    this.dropField(light, list, 'color', x => typeof x === 'string');
    this.dropField(light, list, 'was', isSavedStep);
    // the lamps the AI build saw whose place an HA light took (light-place.ts): each is mended as a light, one that is not
    // one is left out
    this.dropField(light, list, 'seen', x => Array.isArray(x));
    if (Array.isArray(light.seen)) {
      const held = light.seen.filter((lamp): lamp is JsonObject => isObject(lamp) && isText(lamp.id));
      if (held.length !== light.seen.length)
        this.note(list, light.id, 'seen lamps that are not ones left out');
      for (const lamp of held) this.mendLightFields(lamp);
      if (held.length) light.seen = held;
      else delete light.seen;
    }
  }

  private mendSensors(plan: JsonObject): void {
    plan.sensors = this.entries('sensors', plan.sensors as unknown[], sensor => {
      if (!isText(sensor.id) || !isText(sensor.entity) || !isText(sensor.room)) {
        this.note('sensors', sensor.id, 'no id, entity or room: left out');
        return false;
      }
      this.dropField(sensor, 'sensors', 'at', isPoint);
      this.dropField(sensor, 'sensors', 'k', x => isNumber(x) && x > 0 && x <= SENSOR_SIZE_MAX);
      this.dropField(sensor, 'sensors', 'sc', x => isNumber(x) && x > 0);
      this.dropField(sensor, 'sensors', 'c', isHex);
      this.dropField(sensor, 'sensors', 'label', x => typeof x === 'string');
      this.dropField(sensor, 'sensors', 'under', x => typeof x === 'string');
      return true;
    });
    this.uniqueIds('sensors', plan.sensors as JsonObject[], 'sensor_mended_');
  }

  private mendDevices(plan: JsonObject): void {
    plan.devices = this.entries('devices', plan.devices as unknown[], device => {
      if (!isText(device.id) || !isText(device.entity) || !(isText(device.furn) || isText(device.opening))) {
        this.note('devices', device.id, 'no id, entity or place: left out');
        return false;
      }
      return true;
    });
    plan.sensorSkip = (plan.sensorSkip as unknown[]).filter(isText);
  }

  private mendPlanFields(plan: JsonObject): void {
    const list = 'plan';
    this.dropField(plan, list, 'name', x => typeof x === 'string');
    this.dropField(plan, list, 'docArea', isNumber);
    this.dropField(plan, list, 'view', isHomeView);
    this.dropField(plan, list, 'scenes', isScenes);
    this.dropField(plan, list, 'panel', isPanelLayout);
    this.dropField(plan, list, 'onboarding', x => isObject(x) && isObject(x.steps));
    this.dropField(plan, list, 'wall', isObject);
    if (isObject(plan.wall))
      for (const key of ['outer', 'inner']) this.dropField(plan.wall, list, key, x => isNumber(x) && x >= 0);
  }
}

/** Mends a plan in place (see the top of this file); the notes say what was left out or put back to its default. */
export const mendPlan = (plan: Plan): MendNote[] => new PlanMender(plan).mend();
