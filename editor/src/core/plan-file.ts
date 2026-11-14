// Validate a file before it replaces the current project. Geometry errors can be fixed in the editor;
// an invalid structure or an unknown version must not turn into an empty saved plan.
import {migrate, PLAN_VERSION} from './plan.ts';
import {checkItem} from './parts.ts';
import {isHex} from './color.ts';
import {CEILING_RANGE} from './geometry.ts';
import {isPanelLayout} from './plan-mend.ts';
import type {Plan, PlanInput, Point} from './types.ts';

// A JSON object: its fields are unknown until checked.
type JsonObject = Record<string, unknown>;

const obj = (x: unknown): x is JsonObject => x !== null && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isList = (x: unknown): x is unknown[] => Array.isArray(x);
const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const point = (x: unknown): x is Point => isList(x) && x.length === 2 && x.every(Number.isFinite);
function check(ok: unknown): asserts ok {
  if (!ok) throw new Error('Invalid plan file');
}
const optional = (o: JsonObject, k: string, test: (value: unknown) => boolean): void => {
  if (o[k] != null) check(test(o[k]));
};
// An optional number is absent or a finite number: null is not one (a field that may be null says so where it is checked).
const numbers = (o: JsonObject, ks: string[]): void => {
  for (const k of ks) if (o[k] !== undefined) check(isNumber(o[k]));
};
const points = (x: unknown): x is Point[] => isList(x) && x.every(point);
// The entries of a list the id check below has found to be objects (none: the list is missing).
const objects = (list: unknown): JsonObject[] => (isList(list) ? list.filter(obj) : []);
// The ceiling height (wall.height, geometry.ts ceilingOf): none is the usual walls; one outside the range is not a home's.
function ceilingInRange(height: unknown): void {
  if (height === undefined) return;
  const [lowest, highest] = CEILING_RANGE;
  if (isNumber(height) && height >= lowest && height <= highest) return;
  throw new Error(
    `Invalid plan file: the ceiling height ${String(height)} m is not within ${lowest}–${highest} m`,
  );
}

export function readPlan(text: string): Plan {
  const p: unknown = JSON.parse(text);
  check(obj(p) && isList(p.rooms));
  optional(p, 'version', x => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= PLAN_VERSION);
  optional(p, 'units', x => x === 'm');
  optional(p, 'id', str);
  optional(p, 'name', x => typeof x === 'string');
  for (const k of ['rooms', 'openings', 'furniture', 'lights', 'sensors', 'sensorSkip', 'devices'])
    if (k in p) check(isList(p[k]));
  for (const k of ['rooms', 'openings', 'furniture', 'lights', 'sensors']) {
    const ids = new Set<string>();
    const list = p[k] || [];
    check(isList(list)); // checked just above
    for (const x of list) {
      check(obj(x));
      if (k === 'rooms' || x.id != null) {
        check(str(x.id) && !ids.has(x.id));
        ids.add(x.id);
      }
    }
  }
  for (const r of objects(p.rooms)) {
    check(points(r.polygon) && r.polygon.length >= 3);
    optional(r, 'name', x => typeof x === 'string');
    optional(r, 'area', str);
    optional(r, 'wt', x => isList(x) && x.every(v => v == null || Number.isFinite(v)));
    optional(r, 'wf', x => isList(x) && x.every(v => v == null || obj(v)));
    // a finish's pattern parameters (D-089): an object; a value inside it that is not well formed is left out when drawn
    optional(r, 'wallPattern', obj);
    optional(r, 'floorPattern', obj);
    // pieces of finish (pieces.js, D-084): on the walls per edge, on the floor as outlines; a bad value inside one is skipped when drawn
    optional(r, 'wp', x => isList(x) && x.every(v => v == null || (isList(v) && v.every(obj))));
    optional(r, 'fp', x => isList(x) && x.every(v => obj(v) && points(v.poly)));
    optional(r, 'rail', x => isList(x) && x.every(v => v == null || (isNumber(v) && v >= 0))); // a railing's height per edge (geometry.js RAIL)
    optional(r, 'railGlass', x => x === true); // its railings are glass (D-075)
    if (r.zone != null) {
      check(obj(r.zone) && point(r.zone.a) && point(r.zone.b));
      optional(r.zone, 'area', str);
    }
    optional(r, 'panel', isPanelLayout); // the room screen layout
  }
  for (const o of objects(p.openings)) {
    check(o.kind === 'door' || o.kind === 'window');
    numbers(o, ['bottom', 'top', 'swing']);
    optional(o, 'glass', x => typeof x === 'boolean'); // a glazed door
    if (o.at != null) {
      const a = o.at;
      // a place that is not an object has no room (and fails the check below)
      const r = obj(a) ? objects(p.rooms).find(r => r.id === a.room) : undefined;
      check(
        obj(a) &&
          r &&
          typeof a.edge === 'number' &&
          Number.isInteger(a.edge) &&
          a.edge >= 0 &&
          points(r.polygon) &&
          a.edge < r.polygon.length,
      );
      check(Number.isFinite(a.s0) && Number.isFinite(a.s1));
      numbers(a, ['d']);
    } else check(point(o.a) && point(o.b));
  }
  for (const f of objects(p.furniture)) {
    check(str(f.id) && str(f.model));
    check(['x', 'y', 'w', 'd', 'h'].every(k => Number.isFinite(f[k])));
    numbers(f, ['rot', 'z']);
    optional(f, 'top', str);
    optional(f, 'pat', str); // a pattern the model does not have is drawn as its own look
    optional(f, 'patSpec', obj); // its own pattern: what is not well formed in it is left out when drawn (rugSpecOf)
  }
  // an item's color: a named one (catalog COLORS) or a custom #rrggbb; color2 — the second one (a rug's border)
  for (const f of objects(p.furniture))
    for (const k of ['color', 'color2'])
      optional(f, k, x => typeof x === 'string' && (/^#[0-9a-f]{6}$/i.test(x) || /^[a-z]+$/.test(x)));
  for (const l of objects(p.lights)) {
    check(str(l.id));
    optional(l, 'points', points);
    optional(l, 'segments', x => isList(x) && x.every(s => points(s) && s.length === 2));
    numbers(l, ['h', 'count']);
    optional(l, 'room', str);
    optional(l, 'shade', str);
    optional(l, 'body', isHex); // the fitting's own colour (fixtures.ts BODY_COLORS)
    optional(l, 'name', x => typeof x === 'string');
    if (l.was != null) {
      check(obj(l.was) && typeof l.was.s === 'string');
      const snap: unknown = JSON.parse(l.was.s);
      check(isList(snap) && snap.every(x => isList(x) && x.length === 2 && typeof x[0] === 'string'));
    }
  }
  for (const s of objects(p.sensors)) {
    check(str(s.id) && str(s.entity) && str(s.room));
    optional(s, 'at', point);
    numbers(s, ['k']);
    optional(s, 'label', x => typeof x === 'string');
    optional(s, 'c', x => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x));
  }
  // devices are not in the id check above: here an entry must be an object too
  for (const d of isList(p.devices) ? p.devices : [])
    check(obj(d) && str(d.id) && str(d.entity) && (str(d.furn) || str(d.opening)));
  check(((p.sensorSkip || []) as unknown[]).every(str)); // a list when present (checked above)
  numbers(p, ['docArea']);
  if (p.wall != null) {
    check(obj(p.wall));
    numbers(p.wall, ['outer', 'inner', 'height']);
    ceilingInRange(p.wall.height);
  }
  if (p.onboarding != null) {
    check(obj(p.onboarding) && obj(p.onboarding.steps));
  }
  // “Preview” scene settings (look/scenes.js): {scene: {kind:id: {action}}}
  if (p.scenes != null) {
    check(
      obj(p.scenes) &&
        Object.values(p.scenes).every(
          s => obj(s) && Object.values(s).every(v => obj(v) && typeof v.action === 'string'),
        ),
    );
  }
  optional(p, 'panel', isPanelLayout); // the overview layout
  if (p.view != null) {
    check(obj(p.view));
    check(isList(p.view.t) && p.view.t.length === 3 && p.view.t.every(Number.isFinite));
    check(point(p.view.fit));
    check(Number.isFinite(p.view.theta) && Number.isFinite(p.view.phi));
  }
  // an item from parts (model 'parts', parts.js) must be buildable; the message names the item and the first problem
  for (const f of objects(p.furniture))
    if (f.model === 'parts' || f.parts != null) {
      const e = checkItem(f.parts);
      if (e.length) throw new Error(`Invalid plan file: furniture "${f.id}": ${e[0]}`);
    }
  // every part of the file checked above has the shape migrate takes
  return migrate(p as PlanInput);
}
