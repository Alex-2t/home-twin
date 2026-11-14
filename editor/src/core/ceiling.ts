// The plan's ceiling height (plan.wall.height): one for the whole home, set in the settings or by the AI build. A plan without
// one keeps the usual 2.6 m walls exactly as before. Here: how tall a thing may be under it, how a new thing fits under it, and
// what follows the ceiling when it changes (lights on it, things that reach it, floor-to-ceiling windows).
import {WALL, CEILING_RANGE, ceilingOf} from './geometry.ts';
import {byId, zOf} from './catalog.ts';
import {formFor, lightHeights} from './fixtures.ts';
import type {CatalogEntry, FurnitureItem, Opening, Plan, PlanLight} from './types.ts';

/** What a ceiling change reads and moves. */
export type CeilingPlan = Pick<Plan, 'openings' | 'furniture' | 'lights'> & Partial<Pick<Plan, 'wall'>>;

// A model allowed up to the usual ceiling or higher (wardrobes, tall units, shelves, curtains: 2.6–2.7 m) is made to go floor
// to ceiling: under a ceiling of the plan's own its limit is that ceiling, lower or higher.
const TALL_FROM_METRES = WALL.height;
// A thing whose top is this close to the ceiling (or over it) reaches it: it follows the ceiling.
const REACHES_CEILING_METRES = 0.06;
// A thing hung this close under the ceiling, or closer, moves down under a lower one; one hung lower keeps its bottom (a wall
// cabinet keeps its gap over the worktop) and gets shorter. The same rule as the AI build's.
const HUNG_NEAR_CEILING_METRES = 0.3;
// A window or a door whose head is this close under the ceiling keeps that gap when the ceiling moves (a floor-to-ceiling
// window is 10 cm under it); its glass is never shorter than the second.
const HEAD_NEAR_CEILING_METRES = 0.15;
const LEAST_OPENING_METRES = 0.3;
const HEAD_UNDER_LOWER_CEILING_METRES = 0.1;
// A ceiling strip (a cove) is within this of the ceiling.
const STRIP_NEAR_CEILING_METRES = 0.3;
// The closest under the ceiling a light may be: one on the ceiling, a pendant's shade (its cap and canopy above it), any other.
const ON_CEILING_GAP_METRES = 0.02;
const PENDANT_GAP_METRES = 0.3;
const OTHER_LIGHT_GAP_METRES = 0.1;

const round2 = (metres: number): number => +metres.toFixed(2);
const round3 = (metres: number): number => +metres.toFixed(3);

/** Does the plan set a ceiling of its own (a number)? Without one everything is as it always was. */
export const hasOwnCeiling = (plan: Partial<Pick<Plan, 'wall'>>): boolean =>
  typeof plan.wall?.height === 'number' && Number.isFinite(plan.wall.height);

/** A height brought into the range a plan may set, to the centimetre. */
export const clampCeiling = (metres: number): number =>
  round2(Math.min(CEILING_RANGE[1], Math.max(CEILING_RANGE[0], metres)));

/**
 * The tallest an item of this model may be in this plan. Without a ceiling of its own: the model's limit, as before (a built-in
 * wardrobe 2.7 m). With one: a floor-to-ceiling model up to that ceiling, anything else up to its own limit, never over it.
 */
export function heightLimit(entry: Pick<CatalogEntry, 'max'>, plan: Partial<Pick<Plan, 'wall'>>): number {
  const own = entry.max[2];
  if (!hasOwnCeiling(plan)) return own;
  const ceiling = ceilingOf(plan);
  return own >= TALL_FROM_METRES ? ceiling : Math.min(own, ceiling);
}

// A thing reaching over the ceiling comes under it: hung close under it, it moves down; else it keeps its bottom and gets
// shorter (a wall cabinet keeps its gap over the worktop, a wardrobe its floor). Returns whether it changed.
function underCeiling(item: FurnitureItem, ceiling: number): boolean {
  const bottom = zOf(item);
  if (bottom + item.h <= ceiling + 0.005) return false;
  if (bottom < ceiling - HUNG_NEAR_CEILING_METRES) {
    item.h = round3(ceiling - bottom);
    return true;
  }
  item.h = Math.min(item.h, HUNG_NEAR_CEILING_METRES);
  item.z = round3(Math.max(0, ceiling - item.h));
  return true;
}

// A model made to reach the usual ceiling as it comes (curtains, a staircase): its default top is this close to it.
const reachesUsualCeiling = (entry: CatalogEntry): boolean =>
  entry.kind !== 'kenney' && (entry.lift ?? 0) + entry.h >= WALL.height - REACHES_CEILING_METRES;

/**
 * A new item (from the catalog, or a curtain or an air conditioner placed for Home Assistant) fitted under the plan's own
 * ceiling: a model made to reach the usual ceiling (curtains) reaches this one, anything over it comes under it. Without a
 * ceiling of its own the item is left as it is.
 */
export function fitNewItem(item: FurnitureItem, plan: Partial<Pick<Plan, 'wall'>>): FurnitureItem {
  if (!hasOwnCeiling(plan)) return item;
  const ceiling = ceilingOf(plan);
  const entry = byId(item.model);
  const top = zOf(item) + item.h;
  if (entry && reachesUsualCeiling(entry) && top >= WALL.height - REACHES_CEILING_METRES) {
    const gap = Math.max(0, WALL.height - top);
    item.h = round3(Math.min(heightLimit(entry, plan), ceiling - gap - zOf(item)));
  }
  underCeiling(item, ceiling);
  return item;
}

// A light follows the ceiling: on it (a ceiling light, spots, a line) and a cove strip by all of the change, a pendant by half
// (its cord gets longer or shorter, as lightHeights places one); then nothing is over the ceiling. Returns whether it moved.
function moveLight(light: PlanLight, before: number, after: number): boolean {
  if (typeof light.h !== 'number') return false;
  const form = formFor(light);
  const change = after - before;
  let h = light.h;
  const onCeiling = form === 'ceiling' || form === 'spots' || form === 'line';
  const cove = form === 'strip' && h >= before - STRIP_NEAR_CEILING_METRES;
  if (onCeiling || cove) h += change;
  else if (form === 'pendant') h += lightHeights(after).pendant - lightHeights(before).pendant;
  const gap = onCeiling
    ? ON_CEILING_GAP_METRES
    : form === 'pendant'
      ? PENDANT_GAP_METRES
      : OTHER_LIGHT_GAP_METRES;
  h = round2(Math.max(0.1, Math.min(after - gap, h)));
  if (h === light.h) return false;
  light.h = h;
  return true;
}

// A thing that reached the ceiling keeps reaching it (a wardrobe or curtains floor to ceiling, wall cabinets up to it): its top
// moves with the ceiling, its bottom stays; a short thing hung right under the ceiling moves with it whole. A ready-made model
// has its own size and only moves. Then anything over the new ceiling comes under it. Returns whether it changed.
function moveItem(item: FurnitureItem, before: number, after: number, plan: CeilingPlan): boolean {
  const entry = byId(item.model);
  const bottom = zOf(item);
  const top = bottom + item.h;
  const was = item.h;
  const wasZ = item.z;
  if (top >= before - REACHES_CEILING_METRES) {
    const gap = Math.max(0, before - top);
    const hungUnderCeiling = bottom > 0 && bottom >= before - HUNG_NEAR_CEILING_METRES;
    if (hungUnderCeiling || entry?.kind === 'kenney') {
      if (bottom > 0) item.z = round3(Math.max(0, bottom + after - before));
    } else {
      const limit = entry ? heightLimit(entry, plan) : after;
      item.h = round3(Math.max(0.01, Math.min(limit, after - gap - bottom)));
    }
  }
  underCeiling(item, after);
  return item.h !== was || item.z !== wasZ;
}

// A window or a door with its head near the ceiling keeps its gap under it. Any other stays where it is while it fits: under a
// lower ceiling its head comes no closer to it than 10 cm (or than it was), so a curtain rail still fits above it. None is
// shorter than 30 cm. Returns whether it changed.
function moveOpening(opening: Opening, before: number, after: number): boolean {
  if (typeof opening.top !== 'number') return false;
  const gap = Math.max(0, before - opening.top);
  let top = opening.top;
  if (gap <= HEAD_NEAR_CEILING_METRES) top = after - gap;
  else top = Math.min(top, after - Math.min(gap, HEAD_UNDER_LOWER_CEILING_METRES));
  top = round2(top);
  const bottom = opening.bottom;
  const newBottom =
    typeof bottom === 'number' ? round2(Math.max(0, Math.min(bottom, top - LEAST_OPENING_METRES))) : bottom;
  if (top === opening.top && newBottom === bottom) return false;
  opening.top = top;
  if (newBottom !== undefined) opening.bottom = newBottom;
  return true;
}

/** What a ceiling change moved: how many lights, items and openings. */
export interface CeilingChange {
  lights: number;
  furniture: number;
  openings: number;
}

/**
 * The plan gets a ceiling of its own, `metres` high (brought into CEILING_RANGE); what follows the ceiling follows it. Called
 * when the ceiling height is changed in the settings; the AI build calls it once its rooms are placed under the usual walls.
 */
export function setCeiling(plan: CeilingPlan, metres: number): CeilingChange {
  const before = ceilingOf(plan);
  const after = clampCeiling(metres);
  plan.wall = {...plan.wall, height: after};
  const change: CeilingChange = {lights: 0, furniture: 0, openings: 0};
  for (const light of plan.lights) if (moveLight(light, before, after)) change.lights++;
  for (const item of plan.furniture) if (moveItem(item, before, after, plan)) change.furniture++;
  for (const opening of plan.openings) if (moveOpening(opening, before, after)) change.openings++;
  return change;
}
