// Lamps the AI build saw in the video are the plan's lights without a Home Assistant entity (D-091). When one of the owner's
// HA lights is placed in that room, it takes such a lamp's place (light-place.ts): the seen lamp leaves the plan's list and is
// kept inside the HA light (light.seen), so that it comes back as it was when the HA light leaves the place — taken off the
// plan, skipped, given another form, moved to another room, or put back by the guided step's “Discard”.
import type {PlanLight, SeenLamp} from './types.ts';

/** A lamp the AI build saw: on the plan, with no HA entity, not a relay, not a part of another fitting. */
export function isSeenLamp(light: PlanLight): boolean {
  return !light.entity && !light.relay && !!light.placed && !light.with;
}

// What the guided step keeps on a light while a room is being edited: not part of the lamp the video showed.
function asSeen(light: PlanLight): SeenLamp {
  const lamp: PlanLight = structuredClone(light);
  delete lamp.was;
  delete lamp.draft;
  delete lamp.seen;
  return lamp;
}

/**
 * The HA light takes the place of the seen lamps: they leave the list and are kept inside it. The lights that were parts of
 * a seen lamp (“It's part of another fixture”) are now parts of the HA light. Where it stands is the caller's
 * (light-place.ts takePlace).
 */
export function holdSeen(lights: PlanLight[], light: PlanLight, seen: PlanLight[]): void {
  const held = light.seen || [];
  for (const lamp of seen) {
    const index = lights.indexOf(lamp);
    if (index >= 0) lights.splice(index, 1);
    held.push(asSeen(lamp));
    for (const part of lights) if (part.with === lamp.id) part.with = light.id;
  }
  if (held.length) light.seen = held;
}

/** The seen lamps the HA light took the place of come back to the list as they were; it holds none after. */
export function giveSeenBack(lights: PlanLight[], light: PlanLight): void {
  const held = light.seen;
  delete light.seen;
  for (const lamp of held || []) {
    if (lights.some(other => other.id === lamp.id)) continue;
    lights.push(structuredClone(lamp));
  }
}

/**
 * A light's fields were put back from a snapshot (the guided step's “Discard”, a room left unsaved): what it holds now
 * leaves the list, and what it held before (heldBefore) and no longer holds comes back.
 */
export function settleSeen(lights: PlanLight[], light: PlanLight, heldBefore: SeenLamp[] | undefined): void {
  const heldNow = new Set((light.seen || []).map(lamp => lamp.id));
  for (let i = lights.length - 1; i >= 0; i--)
    if (lights[i] !== light && heldNow.has(lights[i].id)) lights.splice(i, 1);
  for (const lamp of heldBefore || []) {
    if (heldNow.has(lamp.id) || lights.some(other => other.id === lamp.id)) continue;
    lights.push(structuredClone(lamp));
  }
}
