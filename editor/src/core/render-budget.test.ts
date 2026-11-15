// What the 3D view spends on the GPU (D-115): the sun's shadow map only after a change, the resolution lowered only while the
// camera moves on a GPU too slow for the full one.
import test from 'node:test';
import assert from 'node:assert/strict';
import {MOTION_RESOLUTION, MotionResolution, ShadowSchedule} from './render-budget.ts';

test('shadow map: drawn for the first frame and after a change, not for frames that only move the camera', () => {
  const shadows = new ShadowSchedule();
  assert.equal(shadows.takeUpdate(), true, 'the first frame draws it');
  assert.equal(shadows.takeUpdate(), false, 'a camera-only frame does not');
  assert.equal(shadows.takeUpdate(), false);
  shadows.markChanged();
  shadows.markChanged();
  assert.equal(shadows.takeUpdate(), true, 'a change (or several before the frame) draws it once');
  assert.equal(shadows.takeUpdate(), false);
});

const FULL = 1.65;
const MOVING = 1;
const FRAME_60_FPS = 16.7;
const FRAME_30_FPS = 33.3;

/** A camera move frame by frame: each frame waited this long after the one before; → the ratios used. */
function move(resolution: MotionResolution, start: number, frameMs: number, frames: number): number[] {
  const ratios: number[] = [];
  for (let i = 0; i < frames; i++) {
    const now = start + i * frameMs;
    const sinceDrawnMs = i === 0 ? null : frameMs;
    ratios.push(resolution.ratioFor(now, true, sinceDrawnMs));
  }
  return ratios;
}

const resolutionOf = (): MotionResolution =>
  new MotionResolution({fullRatio: FULL, movingRatio: MOVING, ...MOTION_RESOLUTION});

test('motion resolution: a fast GPU keeps the full ratio while the camera moves', () => {
  const resolution = resolutionOf();
  const ratios = move(resolution, 0, FRAME_60_FPS, 120);
  assert.ok(
    ratios.every(ratio => ratio === FULL),
    'no frame is drawn blurred',
  );
  assert.equal(resolution.isLowered, false);
});

test('motion resolution: slow moving frames lower the ratio, the still view is sharp again after settleMs', () => {
  const resolution = resolutionOf();
  const ratios = move(resolution, 0, FRAME_30_FPS, 10);
  const firstLowered = ratios.indexOf(MOVING);
  assert.equal(
    firstLowered,
    MOTION_RESOLUTION.slowFramesToDrop,
    'lowered after a few slow frames, not at once',
  );
  assert.ok(
    ratios.slice(firstLowered).every(ratio => ratio === MOVING),
    'and stays lowered for the move',
  );
  const lastMove = 9 * FRAME_30_FPS;
  assert.equal(resolution.ratioFor(lastMove + 50, false, FRAME_30_FPS), MOVING, 'still for 50 ms: not yet');
  const settled = lastMove + MOTION_RESOLUTION.settleMs;
  assert.equal(resolution.ratioFor(settled, false, null), FULL, 'still for settleMs: sharp');
});

test('motion resolution: once lowered, the next move starts lowered; another plan tries the full ratio again', () => {
  const resolution = resolutionOf();
  move(resolution, 0, FRAME_30_FPS, 10);
  assert.equal(resolution.ratioFor(5000, false, null), FULL, 'sharp at rest');
  assert.equal(
    resolution.ratioFor(6000, true, null),
    MOVING,
    'the next move is lowered from its first frame',
  );
  resolution.reset();
  assert.equal(resolution.ratioFor(7000, true, null), FULL, 'after reset the move starts sharp');
});

test('motion resolution: a pause in the input is not a slow frame; nothing changes where there is nothing to lower', () => {
  const resolution = resolutionOf();
  // the camera moves on every other frame (slow input), the page itself keeps 60 fps
  for (let i = 0; i < 20; i++) {
    const now = i * FRAME_60_FPS;
    const moving = i % 2 === 0;
    resolution.ratioFor(now, moving, FRAME_60_FPS);
  }
  assert.equal(resolution.isLowered, false);
  const sharpScreen = new MotionResolution({fullRatio: 1, movingRatio: 1, ...MOTION_RESOLUTION});
  assert.ok(
    move(sharpScreen, 0, FRAME_30_FPS, 10).every(ratio => ratio === 1),
    'a 1× screen stays at 1',
  );
});
