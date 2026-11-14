// The gentle line about a chosen video (video-note.ts): a hurried pass or a small upright picture gets one, a usual phone
// video or one the browser cannot read gets none, and the length together feeds the estimate.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {totalSeconds, videoConcern, videoConcernText} from './video-note.ts';
import type {VideoFacts} from './video-note.ts';

const landscapeHd: VideoFacts = {seconds: 120, width: 1920, height: 1080};
const portraitHd: VideoFacts = {seconds: 134, width: 1080, height: 1920};
// The weak homes of the paid runs: a portrait 480p phone video, and a portrait one just under HD.
const portrait480p: VideoFacts = {seconds: 96, width: 480, height: 854};
const portraitBelowHd: VideoFacts = {seconds: 84, width: 608, height: 1080};
const landscape480p: VideoFacts = {seconds: 179, width: 854, height: 480};

test('video note: a usual phone video, upright or sideways, in HD says nothing', () => {
  assert.equal(videoConcern([landscapeHd]), null);
  assert.equal(videoConcern([portraitHd]), null);
  assert.equal(videoConcern([landscape480p]), null);
});

test('video note: a small upright video says that some things may be missed', () => {
  assert.equal(videoConcern([portrait480p]), 'small-upright');
  assert.equal(videoConcern([portraitBelowHd]), 'small-upright');
  assert.equal(videoConcern([landscapeHd, portrait480p]), 'small-upright');
});

test('video note: a whole home in under half a minute is short, before anything else', () => {
  assert.equal(videoConcern([{seconds: 22, width: 1920, height: 1080}]), 'short');
  assert.equal(videoConcern([{seconds: 22, width: 480, height: 854}]), 'short');
  // Several short clips that add up to a usual pass are not short.
  assert.equal(videoConcern([{seconds: 20, width: 1920, height: 1080}, landscapeHd]), null);
});

test('video note: what the browser cannot read raises nothing', () => {
  assert.equal(videoConcern([null]), null);
  assert.equal(videoConcern([{seconds: 90, width: 0, height: 0}]), null);
  // An unknown length is not called short, but a known small upright video still is.
  assert.equal(videoConcern([null, portrait480p]), 'small-upright');
});

test('video note: the length together, unknown when one video cannot be read', () => {
  assert.equal(totalSeconds([landscapeHd, portraitHd]), 254);
  assert.equal(totalSeconds([landscapeHd, null]), null);
  assert.equal(totalSeconds([]), 0);
});

test('video note: each line says the build can go ahead', () => {
  assert.match(videoConcernText('short'), /go ahead/);
  assert.match(videoConcernText('small-upright'), /go ahead/);
});
