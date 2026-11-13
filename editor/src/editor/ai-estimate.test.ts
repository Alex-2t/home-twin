// What an AI build action will about take (ai-estimate.ts): the service's answer checked, the addresses asked, a round
// counted by its pins' rooms, and the line shown — percent only, a plain warning when it is more than what is left.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEstimate,
  estimateFrom,
  estimateLine,
  estimateText,
  roundEstimate,
  roundSize,
} from './ai-estimate.ts';
import type {Pin} from './ai-pins.ts';

/** fetch answering with status and data while run runs; the addresses it was asked are listed. */
async function withService(
  status: number,
  data: unknown,
  run: (asked: string[]) => Promise<void>,
): Promise<void> {
  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    asked.push(String(input));
    return new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json'}});
  };
  try {
    await run(asked);
  } finally {
    globalThis.fetch = realFetch;
  }
}

/** A pin with words (or none) in a room. */
const pin = (room: string | null, text: string): Pin => ({
  x: 0,
  y: 0,
  room,
  roomName: null,
  item: null,
  itemName: null,
  text,
  view: null,
  photos: [],
});

test('the answer is an estimate only with whole percents, low to high', () => {
  assert.deepEqual(estimateFrom({low: 30, high: 45, short: false}), {low: 30, high: 45, short: false});
  assert.deepEqual(estimateFrom({low: 0, high: 2}), {low: 0, high: 2, short: null});
  assert.equal(estimateFrom({low: 45, high: 30}), null);
  assert.equal(estimateFrom({low: 3.5, high: 4}), null);
  assert.equal(estimateFrom({usd: 3}), null);
  assert.equal(estimateFrom(null), null);
});

test('a build is asked with its videos’ length; a round with its rooms; no estimate where the service has none', async () => {
  await withService(200, {low: 30, high: 45, short: true}, async asked => {
    assert.deepEqual(await buildEstimate('', {seconds: 133.6, videos: 1}), {low: 30, high: 45, short: true});
    await buildEstimate('https://x', {seconds: null, videos: 2});
    await roundEstimate('/api/builds/home-1', {rooms: 2, wholeHome: true});
    assert.deepEqual(asked, [
      '/api/estimate?videos=1&seconds=134',
      'https://x/api/estimate?videos=2',
      '/api/builds/home-1/estimate?rooms=2&home=1',
    ]);
  });
  await withService(404, {error: 'no such route'}, async () => {
    assert.equal(await buildEstimate('', {seconds: 60, videos: 1}), null);
  });
});

test('a round counts the rooms of the pins that say something, and words for the whole home', () => {
  const pins = [pin('r1', 'turn the sofa'), pin('r1', 'no TV here'), pin('r2', 'a plant'), pin('r3', '  ')];
  assert.deepEqual(roundSize({pins, text: ''}), {rooms: 2, wholeHome: false});
  assert.deepEqual(roundSize({pins: [], text: 'the floors are oak'}), {rooms: 0, wholeHome: true});
});

test('the line says percent of the package, never money; a plain warning when it is more than what is left', () => {
  assert.equal(estimateText({low: 30, high: 45, short: null}), 'About 30–45% of your package');
  assert.equal(estimateText({low: 0, high: 2, short: null}), 'Up to 2% of your package');
  const enough = estimateLine({low: 30, high: 45, short: false});
  assert.match(enough, /About 30–45% of your package/);
  assert.doesNotMatch(enough, /\$|aib-cost-short/);
  const short = estimateLine({low: 30, high: 45, short: true});
  assert.match(short, /aib-cost short/);
  assert.match(short, /More than is left: it pauses for a top-up/);
  assert.equal(estimateLine(null), '');
});
