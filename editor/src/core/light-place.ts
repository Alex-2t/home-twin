// Placing one of the owner's Home Assistant lights in a room (D-091 follow-up). A plan from the AI build already has the lamps
// the video showed, without an entity (seen-lamps.ts). An HA light placed in such a room takes the place of a seen lamp of the
// same kind there — a pendant of a pendant, a floor lamp of a floor lamp, a table lamp of a table lamp — with its spot,
// height, shade and body colour, instead of standing beside it as a second fitting. With no such lamp it is placed by its
// guess, as before (fixtures.ts placeForm).
import {formFor, lampCell, guessForm, placeForm, center} from './fixtures.ts';
import type {LampCell} from './fixtures.ts';
import {pointIn} from './geometry.ts';
import {holdSeen, giveSeenBack, isSeenLamp} from './seen-lamps.ts';
import type {LightForm, Plan, PlanLight, Point} from './types.ts';

/** What placing a light reads of the plan (as fixtures.ts placeForm), and its lights. */
type LightPlan = Pick<Plan, 'rooms' | 'openings' | 'furniture' | 'lights'> & Partial<Pick<Plan, 'wall'>>;

// The fields that say where a fitting is and how it looks; the HA light takes them from the seen lamp. Its own (id, entity,
// name, area, light colour, state) stay.
const PLACE_FIELDS = [
  'form',
  'opt',
  'kind',
  'shade',
  'body',
  'h',
  'count',
  'points',
  'segments',
  'loop',
  'room',
] as const;

/**
 * The kind of fitting that matches: the form, and for a lamp whether it stands on the floor or on a table (a floor lamp is
 * not a table lamp). Spots, lines and strips match by form whatever their layout: the nearest one is the one meant.
 */
export function fittingKind(
  light: Pick<PlanLight, 'form' | 'opt' | 'kind' | 'h' | 'name' | 'entity' | 'model'>,
): string {
  const form = formFor(light);
  if (form === 'lamp') return light.opt === 'table' ? 'lamp:table' : 'lamp:floor';
  return form;
}

/** The middle of a light's points and pieces on the plan; null: it has none. */
function middleOf(light: Pick<PlanLight, 'points' | 'segments'>): Point | null {
  const ends: Point[] = [...(light.points || []), ...(light.segments || []).flat()];
  if (!ends.length) return null;
  const x = ends.reduce((sum, point) => sum + point[0], 0) / ends.length;
  const y = ends.reduce((sum, point) => sum + point[1], 0) / ends.length;
  return [x, y];
}

const distance = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

// A seen lamp stands in the cell: its room, and in a room of two areas the part the light goes to.
function inCell(lamp: PlanLight, cell: LampCell): boolean {
  if (lamp.room !== cell.room.id) return false;
  if (cell.poly === cell.room.polygon) return true;
  const middle = middleOf(lamp);
  return !!middle && pointIn(middle, cell.poly);
}

/**
 * The seen lamps an HA light placed with this form in this cell takes the place of: of the same kind, the nearest to near
 * (where it was dropped) or else to where the editor would stand it by itself — that reads its name, so a “desk lamp” goes
 * to the lamp on the desk. One, or two for a pair of wall lights on one switch. None: it is placed by its guess.
 */
export function seenLampsFor(
  plan: LightPlan,
  light: PlanLight,
  form: LightForm,
  opt: string | null | undefined,
  cell: LampCell,
  near?: Point | null,
): PlanLight[] {
  const alone: PlanLight = structuredClone({...light, seen: undefined});
  placeForm(plan, alone, form, opt, cell);
  const kind = fittingKind(alone);
  const matching = plan.lights.filter(
    other => other !== light && isSeenLamp(other) && inCell(other, cell) && fittingKind(other) === kind,
  );
  if (!matching.length) return [];
  // a pair of wall lights: each of its two spots takes the nearest seen sconce left
  const targets: Point[] =
    form === 'wall' && !near && alone.points.length > 1
      ? alone.points
      : [near || middleOf(alone) || center(cell.poly)];
  const taken: PlanLight[] = [];
  for (const target of targets) {
    const left = matching.filter(lamp => !taken.includes(lamp));
    const nearest = nearestTo(left, target);
    if (nearest) taken.push(nearest);
  }
  return taken;
}

// The lamp nearest to the point; of two as near, the first in the plan.
function nearestTo(lamps: PlanLight[], target: Point): PlanLight | null {
  let best: PlanLight | null = null;
  let bestDistance = Infinity;
  for (const lamp of lamps) {
    const lampDistance = distance(middleOf(lamp) || target, target);
    if (lampDistance < bestDistance) {
      best = lamp;
      bestDistance = lampDistance;
    }
  }
  return best;
}

// The HA light stands where the seen lamps stood and looks as the first of them; several seen sconces are its points.
function takePlace(plan: LightPlan, light: PlanLight, seen: PlanLight[]): void {
  const [first] = seen;
  const fields = light as unknown as Record<string, unknown>;
  for (const key of PLACE_FIELDS) {
    delete fields[key];
    const value = first[key];
    if (value !== undefined) fields[key] = structuredClone(value);
  }
  if (seen.length > 1) {
    light.points = seen.flatMap(lamp => lamp.points || []);
    light.count = light.points.length;
  }
  light.points ??= [];
  light.segments ??= [];
  if (!light.color && first.color) light.color = first.color;
  delete light.skip;
  delete light.with;
  light.placed = true;
  holdSeen(plan.lights, light, seen);
}

/**
 * Places an HA light of this form (variant opt) in the cell: where a seen lamp of the same kind stood, or by its guess.
 * near: where the user dropped it. A light that held seen lamps gives them back first, so a light placed again (another form,
 * another room) frees the lamp it stood for. Returns whether it is on the plan.
 */
export function placeLight(
  plan: LightPlan,
  light: PlanLight,
  form: LightForm,
  opt: string | null | undefined,
  cell: LampCell,
  near?: Point | null,
): boolean {
  giveSeenBack(plan.lights, light);
  const seen = seenLampsFor(plan, light, form, opt, cell, near);
  if (!seen.length) return placeForm(plan, light, form, opt, cell);
  takePlace(plan, light, seen);
  return true;
}

/** The HA light takes the place of this one seen lamp, whatever its form (the user said which lamp it is). */
export function bindSeenLamp(plan: LightPlan, light: PlanLight, seen: PlanLight): void {
  giveSeenBack(plan.lights, light);
  takePlace(plan, light, [seen]);
}

// “Auto-place”: lights without a position go by guess, each into the cell of its own area, or where a lamp of the same kind
// the AI build saw stands there. Returns how many were placed.
export function autoPlace(plan: LightPlan): number {
  let placed = 0;
  // a copy: a light taking a seen lamp's place takes that lamp out of the list
  for (const light of [...plan.lights]) {
    if (light.placed || light.skip) continue;
    const cell = lampCell(plan, light);
    if (!cell) continue;
    const guess = guessForm(light);
    if (placeLight(plan, light, guess.form, guess.opt, cell)) {
      light.auto = true;
      placed++;
    }
  }
  return placed;
}
