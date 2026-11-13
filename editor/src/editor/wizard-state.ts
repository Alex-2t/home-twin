// Plan facts and the user's decision are different things: one opening does not yet mean all of them were added.
import {area} from '../core/geometry.ts';
import {zoneParts} from '../core/plan.ts';
import type {OnboardingStatus, OnboardingStepId, Plan, PlanLight, Room, RoomZone} from '../core/types.ts';
import type {PathStepStatus} from './editor-types.ts';

/** How far a step is by the plan: how many things it has to do, how many are done, whether it was started and is complete. */
export interface StepFacts {
  total: number;
  ready: number;
  started: boolean;
  complete: boolean;
}

// the HA area is on the plan (a room or part of a room)
export const areaOnPlan = (p: Pick<Plan, 'rooms'>, a: string): boolean =>
  p.rooms.some(r => r.area === a || r.zone?.area === a);
// a lamp waits for its room: its area is not on the plan — it is left out of the counters and of “done” until the room is linked
// (otherwise a three-room apartment would never get “Lights 3/15” to the end)
export const lampWaits = (p: Pick<Plan, 'rooms'>, l: PlanLight): boolean =>
  !l.placed && !l.skip && !l.with && !!l.area && !areaOnPlan(p, l.area);

export function stepFacts(p: Plan, k: OnboardingStepId): StepFacts {
  let total = 0;
  let ready = 0;
  let started = false;
  let complete = false;
  if (k === 'names') {
    const cells = p.rooms
      .filter(r => !r.solid && Math.abs(area(r.polygon)) >= 1)
      // zoneParts gives parts only to a room that has a zone
      .flatMap((r): Array<Room | RoomZone> => (zoneParts(r) ? [r, r.zone!] : [r]));
    total = cells.length;
    ready = cells.filter(c => c.area).length;
    started = cells.some(c => c.area || c.noArea);
    complete = ready === total;
  } else if (k === 'lights') {
    const L = p.lights.filter(l => !lampWaits(p, l));
    total = L.length;
    ready = L.filter(l => l.placed && !l.draft && !l.skip).length;
    started = p.lights.some(l => l.placed || l.draft || l.skip);
    complete = ready === total;
  } else {
    const items =
      k === 'rect' || k === 'split'
        ? p.rooms
        : k === 'open'
          ? p.openings
          : k === 'furniture'
            ? p.furniture
            : k === 'sensors'
              ? p.sensors
              : k === 'devices'
                ? p.devices || []
                : [];
    total = ready = items.length;
    started = ready > 0;
    complete = ready > 0;
  }
  return {total, ready, started, complete};
}

export function stepStatus(p: Plan, k: OnboardingStepId): PathStepStatus {
  const f = stepFacts(p, k);
  const saved = p.onboarding?.steps?.[k];
  if (k === 'rect') return f.complete ? 'confirmed' : saved === 'in_progress' ? 'in_progress' : 'not_started';
  if (saved === 'confirmed') return f.complete ? 'confirmed' : 'in_progress';
  if (saved === 'deferred') return 'deferred';
  return saved === 'in_progress' || f.started ? 'in_progress' : 'not_started';
}

// The “ready to finish” hint (the button pulses) — only when the step is surely finished: linking and lights have a full task list.
// Windows, doors, walls and furniture are not guessed (the owner: only when certain, not a minimum) — only the photo knows how many there are.
// k: the step the page shows now (body data-wizard), any value.
export function stepReadyToFinish(p: Plan, k: string | undefined): boolean {
  if (k !== 'names' && k !== 'lights') return false;
  const f = stepFacts(p, k);
  return f.total > 0 && f.complete;
}

export function recordStep(p: Plan, k: OnboardingStepId, status: OnboardingStatus): void {
  p.onboarding = {...p.onboarding, steps: {...p.onboarding?.steps, [k]: status}};
}
