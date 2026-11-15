// The plan file's format version and the steps that bring an older file up to it (docs/plan-format.md, D-121).
//
// Every plan names the format it was written in (plan.version; a file without one is version 0). A file of an older format
// is brought up here, one step per version, before anything else reads it: a step is written once and never changed, so a
// plan saved years ago still opens. A file of a newer format than this editor reads is not brought down: it is shown as far
// as it can be, and the editor does not write it back (isNewerPlan), so an older editor never spoils it.
//
// A change to the plan's shape that an older reader would take wrongly (a field renamed or moved, a meaning changed) is a new
// step here and PLAN_VERSION one up. A new optional field with a default is not: older plans simply lack it.

import {t} from '../i18n/i18n.ts';

/** A plan's JSON as a step takes it: the shape of the version the step starts from, unchecked. */
export type PlanJson = Record<string, unknown>;

/** One step of the format: brings a plan of version `to - 1` up to version `to`, in place. */
export interface FormatStep {
  to: number;
  /** What changed in the format, and the decision it came with. */
  what: string;
  run(plan: PlanJson): void;
}

const isObject = (value: unknown): value is PlanJson =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const objectsIn = (list: unknown): PlanJson[] => (Array.isArray(list) ? list.filter(isObject) : []);

/** The steps, oldest first: steps[i] brings version i up to version i + 1. */
export const FORMAT_STEPS: readonly FormatStep[] = [
  {
    to: 1,
    what: 'Readings moved from the room (room.sens) to plan.sensors (D-033).',
    run(plan) {
      for (const room of objectsIn(plan.rooms)) delete room.sens;
    },
  },
];

/** The format this editor writes and reads: the last step's version. */
export const PLAN_VERSION = FORMAT_STEPS.length;

/** The format a plan says it is in: a whole number from 0; a file without one (or with a wrong one) is version 0. */
export function versionOf(plan: unknown): number {
  if (!isObject(plan)) return 0;
  const version = plan.version;
  return typeof version === 'number' && Number.isInteger(version) && version >= 0 ? version : 0;
}

/** The plan was written by a newer editor than this one: it is shown, never written back (D-121). */
export const isNewerPlan = (plan: unknown): boolean => versionOf(plan) > PLAN_VERSION;

/**
 * Brings a plan of an older format up to PLAN_VERSION, in place, and gives the version it is in now. A plan of this
 * format is left as it is; a plan of a newer one too (its own version is kept, so the editor knows not to save it).
 */
export function upgradeFormat(plan: PlanJson): number {
  const from = versionOf(plan);
  if (from >= PLAN_VERSION) return from;
  for (const step of FORMAT_STEPS.slice(from)) step.run(plan);
  plan.version = PLAN_VERSION;
  return PLAN_VERSION;
}

/** A plan file of a newer format than this editor reads (readPlan): the user is told to update Home Twin. */
export class NewerPlanError extends Error {
  readonly version: number;
  constructor(version: number) {
    super(`The plan is format ${version}; this Home Twin reads up to format ${PLAN_VERSION}`);
    this.name = 'NewerPlanError';
    this.version = version;
  }
}

/** What the user is told when a home is of a newer format than this editor reads. */
export const newerPlanText = (): string =>
  t('This home was made in a newer version of Home Twin. Update Home Twin to open it.');
