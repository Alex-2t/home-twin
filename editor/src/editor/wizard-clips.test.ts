// The step clips (D-109, D-110): every main step has one, its timing holds together, and its paper plan is the demo flat.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {STEP_CLIPS, pointerAt} from './wizard-clips.ts';
import {MAND} from './wizard-path.ts';
import {
  PAPER_OPENINGS,
  PAPER_ROOMS,
  planPhotoMarkup,
  planToView,
  toPaper,
  viewToPaper,
  wallBand,
} from './wizard-clip-plan.ts';

test('every main step of the guided path has a clip', () => {
  const missing = MAND.map(([step]) => step).filter(step => !STEP_CLIPS[step]);
  assert.deepEqual(missing, []);
});

// The rooms clip is longer: besides its cuts it trims the area beside the balcony that the outline took in.
test('a clip loops in about 3–4.5 s (the rooms one up to 10 s) and its still picture is a moment of the loop', () => {
  for (const [step, clip] of Object.entries(STEP_CLIPS)) {
    const longest = step === 'split' ? 10000 : 4500;
    assert.ok(clip.loopMs >= 3000 && clip.loopMs <= longest, `${step}: loop ${clip.loopMs} ms`);
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

// The paper plan under the clips (D-110) is the typical demo flat, drawn as a photo of a printed plan.
test('the paper plan is the typical demo flat: the same rooms and the same windows and doors', async () => {
  const {default: makeTypical} = await import('../../demo/typical.ts');
  const {DEMO} = await makeTypical();
  const demoRooms = DEMO.rooms.map(room => ({id: room.id, polygon: room.polygon}));
  const paperRooms = PAPER_ROOMS.map(room => ({id: room.id, polygon: room.polygon}));
  assert.deepEqual(paperRooms, demoRooms);
  const demoOpenings = (DEMO.openings ?? []).map(opening => ({
    a: opening.a,
    b: opening.b,
    kind: opening.kind,
  }));
  const paperOpenings = PAPER_OPENINGS.map(opening => ({a: opening.a, b: opening.b, kind: opening.kind}));
  assert.deepEqual(paperOpenings, demoOpenings);
});

test('a window or door in an outer wall cuts the whole outer wall, one inside cuts the 10 cm wall', () => {
  const thickness = (opening: (typeof PAPER_OPENINGS)[number]): number => {
    const [from, to] = wallBand(opening);
    return Math.round((to - from) * 100) / 100;
  };
  const frontDoor = PAPER_OPENINGS[0];
  const bathroomDoor = PAPER_OPENINGS[1];
  const kitchenWindow = PAPER_OPENINGS.find(opening => opening.a[0] === 7.9)!;
  assert.equal(thickness(frontDoor), 0.25);
  assert.equal(thickness(kitchenWindow), 0.25);
  assert.equal(thickness(bathroomDoor), 0.1);
});

test('a point seen in the clip goes back to the same place on the paper', () => {
  const paper = toPaper([3.45, 4.4]);
  const back = viewToPaper(planToView([3.45, 4.4]));
  assert.ok(Math.abs(back[0] - paper[0]) < 1e-9 && Math.abs(back[1] - paper[1]) < 1e-9);
});

test('the photo names every room and stays a small picture', () => {
  const markup = planPhotoMarkup();
  for (const name of ['HALLWAY', 'LIVING ROOM', 'BEDROOM', 'KITCHEN', 'BATHROOM', 'BALCONY'])
    assert.ok(markup.includes(name), name);
  assert.ok(markup.includes('KIDS&#39; ROOM') || markup.includes("KIDS' ROOM"));
  assert.ok(encodeURIComponent(markup).length < 20_000, `${encodeURIComponent(markup).length} bytes`);
});
