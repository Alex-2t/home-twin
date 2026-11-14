// The arrows nudge what is selected (D-096 follow-up): a piece of furniture, a lamp (or its selected point or line), a reading
// on a wall, a window or a door. One press moves it 1 cm, with Shift 10 cm, by exactly that much: the pull to walls and the
// 5 cm grid help a pointer find a spot and are not applied, as with a typed distance. What holds while dragging holds here
// too: a lamp's body stays inside its room, a wall light on its wall, a reading on its room's outline, a window or a door on
// its wall between its neighbours. The arrows never move the camera. A burst of presses on one thing is one undo step.
import {segDist} from '../core/geometry.ts';
import type {Outline, Point, Vector} from '../core/types.ts';

/** One press, metres. */
export const NUDGE_METRES = 0.01;
/** One press with Shift, metres. */
export const NUDGE_SHIFT_METRES = 0.1;
/** Presses closer together than this are one burst: one undo step, milliseconds. */
export const NUDGE_BURST_MS = 1000;

/** An arrow as a direction on the screen: x to the right, y downwards. */
export type ScreenDirection = [x: number, y: number];

const ARROWS: Record<string, ScreenDirection> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** The key's direction on the screen; null: not an arrow. */
export function arrowOf(key: string): ScreenDirection | null {
  return ARROWS[key] || null;
}

/** The keys an arrow press comes with. */
export interface ArrowPress {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

/**
 * Where the screen's right and up point on the plan. On the plan view they are the plan's own axes; in 3D, the camera's
 * right and its view along the floor.
 */
export interface ScreenAxes {
  right: Vector;
  up: Vector;
}

/** The plan view's axes: x to the right, y upwards (view2d.ts W). */
export const PLAN_AXES: ScreenAxes = {right: [1, 0], up: [0, 1]};

/**
 * The plan's step for an arrow press: along the plan axis nearest to the arrow's direction on the screen, 1 cm (Shift:
 * 10 cm). In 3D the view is often turned: “up” is the plan axis that goes most away from the camera, so a thing moves
 * along the walls, not askew. null: not an arrow, or with ⌘, Ctrl or Alt (those belong to the system).
 */
export function nudgeStep(press: ArrowPress, axes: ScreenAxes = PLAN_AXES): Vector | null {
  const arrow = arrowOf(press.key);
  if (!arrow || press.metaKey || press.ctrlKey || press.altKey) return null;
  const length = press.shiftKey ? NUDGE_SHIFT_METRES : NUDGE_METRES;
  // the screen's down is minus up
  const x = axes.right[0] * arrow[0] - axes.up[0] * arrow[1];
  const y = axes.right[1] * arrow[0] - axes.up[1] * arrow[1];
  if (Math.abs(x) >= Math.abs(y)) return [Math.sign(x) * length, 0];
  return [0, Math.sign(y) * length];
}

/** A point moved by a step, to the millimetre (the plan's precision). */
export function moved(point: Point, step: Vector): Point {
  return [+(point[0] + step[0]).toFixed(4), +(point[1] + step[1]).toFixed(4)];
}

/**
 * How far a step goes along a direction (a wall), signed; 0 when the step is across it (more across than along): a thing
 * that slides along a wall does not move then.
 */
export function stepAlong(step: Vector, along: Vector): number {
  const length = Math.hypot(step[0], step[1]);
  const alongLength = Math.hypot(along[0], along[1]) || 1;
  const share = (step[0] * along[0] + step[1] * along[1]) / alongLength;
  if (Math.abs(share) < length * Math.SQRT1_2) return 0;
  return Math.sign(share) * length;
}

/** The side of an outline nearest to p: its ends, and where along it (0–1) p is nearest. */
export function nearestSide(outline: Outline, p: Point): {a: Point; b: Point; along: number} {
  let best = {a: outline[0], b: outline[1 % outline.length], along: 0};
  let bestDistance = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const [distance, along] = segDist(p, a, b);
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    best = {a, b, along};
  }
  return best;
}

/** The point of an outline nearest to p (a reading slides along its room's walls and round its corners). */
export function nearestOnOutline(outline: Outline, p: Point): Point {
  const {a, b, along} = nearestSide(outline, p);
  return [+(a[0] + (b[0] - a[0]) * along).toFixed(4), +(a[1] + (b[1] - a[1]) * along).toFixed(4)];
}

/**
 * A point by a wall (a wall light) moved along the wall it is nearest to by the step's share along it, at the same distance
 * from it; it stops endMargin before the wall's end, and does not move across the wall.
 */
export function slideAlongWall(outline: Outline, p: Point, step: Vector, endMargin = 0): Point {
  const {a, b} = nearestSide(outline, p);
  const wall: Vector = [b[0] - a[0], b[1] - a[1]];
  const distance = stepAlong(step, wall);
  const length = Math.hypot(wall[0], wall[1]);
  if (!distance || !length) return p;
  const along = ((p[0] - a[0]) * wall[0] + (p[1] - a[1]) * wall[1]) / length;
  const target = Math.max(endMargin, Math.min(length - endMargin, along + distance));
  const by = target - along;
  if (Math.abs(by) < 1e-9 || Math.sign(by) !== Math.sign(distance)) return p;
  return moved(p, [(wall[0] / length) * by, (wall[1] / length) * by]);
}

/** What the burst of presses so far was about, the history's step it made, and when its last press was done (ms). */
export interface NudgeBurst {
  what: string;
  step: number | null;
  at: number;
}

/**
 * A press goes on the burst before it (and changes its undo step instead of adding one): the same thing, its key went
 * down soon after the last press was done (pressedAt; earlier still when held keys queued up), and nothing else was done
 * since (the history is still on the step the burst made).
 */
export function burstGoesOn(
  burst: NudgeBurst | null,
  what: string,
  step: number | null,
  pressedAt: number,
): boolean {
  if (!burst || step === null) return false;
  return burst.what === what && burst.step === step && pressedAt - burst.at < NUDGE_BURST_MS;
}
