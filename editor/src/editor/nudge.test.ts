// D-096 follow-up: the arrows nudge what is selected.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  NUDGE_BURST_MS,
  burstGoesOn,
  moved,
  nearestOnOutline,
  nudgeStep,
  slideAlongWall,
  stepAlong,
  PLAN_AXES,
} from './nudge.ts';
import type {ArrowPress, ScreenAxes} from './nudge.ts';
import {nudgeKeyAllowed} from './keyboard.ts';
import {createHistory} from './history.ts';
import type {Outline, Vector} from '../core/types.ts';

const press = (key: string, more: Partial<ArrowPress> = {}): ArrowPress => ({
  key,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  ...more,
});

test('on the plan an arrow moves 1 cm along its own axis, with Shift 10 cm', () => {
  assert.deepEqual(nudgeStep(press('ArrowRight')), [0.01, 0]);
  assert.deepEqual(nudgeStep(press('ArrowLeft')), [-0.01, 0]);
  // the plan's y goes up the screen
  assert.deepEqual(nudgeStep(press('ArrowUp')), [0, 0.01]);
  assert.deepEqual(nudgeStep(press('ArrowDown')), [0, -0.01]);
  assert.deepEqual(nudgeStep(press('ArrowUp', {shiftKey: true})), [0, 0.1]);
});

test('with ⌘, Ctrl or Alt, or another key, the arrows do nothing here', () => {
  for (const modifier of ['metaKey', 'ctrlKey', 'altKey'] as const)
    assert.equal(nudgeStep(press('ArrowUp', {[modifier]: true})), null, modifier);
  assert.equal(nudgeStep(press('a')), null);
  assert.equal(nudgeStep(press('Tab')), null);
});

test('in a turned 3D view “up” is the plan axis going most away from the camera', () => {
  // the camera looks along the plan's −x, a little askew: its right is the plan's +y
  const turned: ScreenAxes = {right: [0.2, 0.98], up: [-0.98, 0.2]};
  assert.deepEqual(nudgeStep(press('ArrowUp'), turned), [-0.01, 0]);
  assert.deepEqual(nudgeStep(press('ArrowDown'), turned), [0.01, 0]);
  assert.deepEqual(nudgeStep(press('ArrowRight'), turned), [0, 0.01]);
  assert.deepEqual(nudgeStep(press('ArrowLeft'), turned), [0, -0.01]);
  // seen from the plan's side, the plan view's own axes
  assert.deepEqual(nudgeStep(press('ArrowRight'), PLAN_AXES), [0.01, 0]);
});

test('a step along a wall slides by the whole step; across it nothing moves', () => {
  const wall: Vector = [3, 0];
  assert.equal(stepAlong([0.01, 0], wall), 0.01);
  assert.equal(stepAlong([-0.1, 0], wall), -0.1);
  assert.equal(stepAlong([0, 0.01], wall), 0);
  // a wall at an angle: the arrow nearer to it slides along it
  const askew: Vector = [1, 0.5];
  assert.equal(stepAlong([0.01, 0], askew), 0.01);
  assert.equal(stepAlong([0, 0.01], askew), 0);
});

test('a reading slides along its room’s outline and round a corner', () => {
  const room: Outline = [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ];
  assert.deepEqual(nearestOnOutline(room, moved([2, 0], [0.01, 0])), [2.01, 0]);
  // across the wall: it stays where it was
  assert.deepEqual(nearestOnOutline(room, moved([2, 0], [0, 0.01])), [2, 0]);
  // at the corner a step up goes on along the next wall
  assert.deepEqual(nearestOnOutline(room, moved([4, 0], [0, 0.1])), [4, 0.1]);
});

test('a wall light slides along its wall at the same distance, never across it nor past its end', () => {
  const room: Outline = [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ];
  // 20 cm in from the bottom wall (deeper than a sconce put there by a drag: it keeps that)
  assert.deepEqual(slideAlongWall(room, [2, 0.2], [0.01, 0]), [2.01, 0.2]);
  assert.deepEqual(slideAlongWall(room, [2, 0.2], [0, 0.1]), [2, 0.2]);
  // 15 cm from the wall's end it stops
  assert.deepEqual(slideAlongWall(room, [3.8, 0.2], [0.1, 0], 0.15), [3.85, 0.2]);
  assert.deepEqual(slideAlongWall(room, [3.85, 0.2], [0.1, 0], 0.15), [3.85, 0.2]);
});

test('a point moves to the millimetre, without float dust', () => {
  assert.deepEqual(moved([0.1, 0.2], [0.01, 0.1]), [0.11, 0.3]);
});

test('arrows from a field, a menu, a list or a used press do not nudge; from the plan or a plain button they do', () => {
  const element = {parentElement: null} as unknown as Element;
  assert.equal(nudgeKeyAllowed('field', element, false), false);
  assert.equal(nudgeKeyAllowed('popup', element, false), false);
  assert.equal(nudgeKeyAllowed('page', element, false), true);
  assert.equal(nudgeKeyAllowed('control', element, false), true);
  assert.equal(nudgeKeyAllowed('control', element, true), false, 'a list on the way has used it');
  assert.equal(nudgeKeyAllowed('page', null, false), true);
});

test('a burst of presses on one thing is one undo step', () => {
  type Spot = {id: string; x: number};
  const history = createHistory<Spot>();
  const plan: Spot = {id: 'p', x: 0};
  history.commit(structuredClone(plan));
  let burst: {what: string; step: number | null; at: number} | null = null;
  let clock = 0;
  const nudge = (what: string, dx: number): void => {
    plan.x = +(plan.x + dx).toFixed(4);
    if (burstGoesOn(burst, what, history.step(), clock)) history.amend(structuredClone(plan));
    else history.commit(structuredClone(plan));
    burst = {what, step: history.step(), at: clock};
  };
  for (let i = 0; i < 5; i++) {
    clock += 80;
    nudge('furn:sofa', 0.01);
  }
  assert.equal(history.size().steps, 2, 'five presses, one step');
  // a pause: the next press is a step of its own
  clock += NUDGE_BURST_MS + 1;
  nudge('furn:sofa', 0.01);
  assert.equal(history.size().steps, 3);
  // another thing: its own step at once
  clock += 80;
  nudge('furn:bed', 0.01);
  assert.equal(history.size().steps, 4);
  // another edit in between (here an undo): the burst does not go on
  history.undo();
  clock += 80;
  nudge('furn:bed', 0.01);
  assert.equal(history.size().steps, 4);
  assert.equal(history.undo()?.x, 0.06);
  assert.equal(history.undo()?.x, 0.05);
  assert.equal(history.undo()?.x, 0);
});
