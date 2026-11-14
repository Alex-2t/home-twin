// The step clips (D-109): every main step has one, and its timing holds together.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STEP_CLIPS, pointerAt} from './wizard-clips.ts';
import {MAND} from './wizard-path.ts';

test('every main step of the guided path has a clip', () => {
  const missing = MAND.map(([step]) => step).filter(step => !STEP_CLIPS[step]);
  assert.deepEqual(missing, []);
});

test('a clip loops in about 3–4.5 s and its still picture is a moment of the loop', () => {
  for (const [step, clip] of Object.entries(STEP_CLIPS)) {
    assert.ok(clip.loopMs >= 3000 && clip.loopMs <= 4500, `${step}: loop ${clip.loopMs} ms`);
    assert.ok(clip.stillMs > 0 && clip.stillMs < clip.loopMs, `${step}: still at ${clip.stillMs} ms`);
  }
});

test('the pointer stays at its ends and eases between its keys', () => {
  const keys = [
    [100, 0, 0],
    [300, 10, 20],
  ] as const;
  assert.deepEqual(pointerAt(keys, 0), {x: 0, y: 0});
  assert.deepEqual(pointerAt(keys, 200), {x: 5, y: 10});
  assert.deepEqual(pointerAt(keys, 999), {x: 10, y: 20});
});
