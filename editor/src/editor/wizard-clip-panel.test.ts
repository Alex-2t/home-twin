// The coach panel's fit (D-111): how wide the step card docked on the left is and whether its clip is open.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitCoachPanel} from './wizard-clip-panel.ts';
import type {CoachRoom} from './wizard-clip-panel.ts';

/** The room on a 1440 × 900 screen under the logo, above the toolbar; a card of 90 px without its clip. */
const wide: CoachRoom = {
  left: 12,
  top: 70,
  containerWidth: 1440,
  bottomLimit: 828,
  cardHeight: 90,
  planBox: null,
};

test('on a wide screen the clip starts open, 30 % of the screen up to 420 px', () => {
  assert.deepEqual(fitCoachPanel(wide, null), {width: 420, clip: 'open'});
  assert.deepEqual(fitCoachPanel({...wide, containerWidth: 1280}, null), {width: 384, clip: 'open'});
});

test('where the plan would keep less than 700 px beside it, the clip starts folded', () => {
  assert.deepEqual(fitCoachPanel({...wide, containerWidth: 1024}, null), {width: 360, clip: 'folded'});
  // beside the open catalog on a laptop
  assert.deepEqual(fitCoachPanel({...wide, left: 304, containerWidth: 1280}, null), {
    width: 384,
    clip: 'folded',
  });
});

test('a clip that would cover the plan the user set starts folded', () => {
  const planUnder = {left: 200, top: 200, width: 600, height: 400};
  assert.equal(fitCoachPanel({...wide, planBox: planUnder}, null).clip, 'folded');
  const planBeside = {left: 600, top: 100, width: 600, height: 500};
  assert.equal(fitCoachPanel({...wide, planBox: planBeside}, null).clip, 'open');
});

test("the user's choice wins over the rule", () => {
  assert.equal(fitCoachPanel(wide, 'closed').clip, 'folded');
  assert.equal(fitCoachPanel({...wide, containerWidth: 1024}, 'open').clip, 'open');
});

test('short of height the panel narrows down to 300 px, and below that the clip has no room', () => {
  const short = fitCoachPanel({...wide, bottomLimit: 70 + 90 + 200}, 'open');
  assert.equal(short.clip, 'open');
  assert.ok(short.width < 420 && short.width >= 300, `width ${short.width}`);
  assert.deepEqual(fitCoachPanel({...wide, bottomLimit: 70 + 90 + 100}, 'open'), {
    width: 420,
    clip: 'no-room',
  });
});

test('a width set by the corner wins over 30 %, within 300 px and 60 % of the screen', () => {
  assert.deepEqual(fitCoachPanel(wide, 'open', 600), {width: 600, clip: 'open'});
  assert.equal(fitCoachPanel(wide, 'open', 200).width, 300);
  assert.equal(fitCoachPanel({...wide, containerWidth: 1280}, 'open', 2000).width, 768);
});

test('a wide panel whose clip does not fit above the toolbar narrows until it does', () => {
  // the toolbar 600 px down: a 900 px panel's clip would reach past it
  const short = {...wide, containerWidth: 1600, bottomLimit: 600};
  const fit = fitCoachPanel(short, 'open', 900);
  assert.equal(fit.clip, 'open');
  assert.ok(fit.width < 900);
  assert.ok(short.top + short.cardHeight + Math.round((fit.width - 26) / 1.6) + 8 <= short.bottomLimit);
});
