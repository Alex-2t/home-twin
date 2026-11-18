// The plans kept on the account (account-plan.ts, D-134): read back when there are some, nothing when there are none or
// nobody is signed in, and saved as JSON with this browser's id.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchAccountPlans, saveAccountPlan} from './account-plan.ts';
import type {Plan} from '../core/types.ts';

/** fetch answering with status and data while run runs; the requests it got are in seen. */
async function withFetch(
  status: number,
  data: unknown,
  run: (seen: {url: string; method: string; body: string}[]) => Promise<void>,
): Promise<void> {
  const real = globalThis.fetch;
  const seen: {url: string; method: string; body: string}[] = [];
  globalThis.fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    seen.push({url: String(input), method: init.method || 'GET', body: String(init.body || '')});
    return new Response(JSON.stringify(data), {status});
  };
  try {
    await run(seen);
  } finally {
    globalThis.fetch = real;
  }
}

test('the plans kept on the account are read back; none, or signed out, is nothing', async () => {
  const plan = {rooms: [{name: 'Kitchen'}]};
  const other = {rooms: [{name: 'Room 1'}]};
  await withFetch(
    200,
    {
      plan,
      at: 5,
      plans: [
        {plan, at: 5},
        {plan: other, at: 3},
      ],
    },
    async seen => {
      assert.deepEqual(await fetchAccountPlans('/ha/ai/k'), [
        {plan, at: 5},
        {plan: other, at: 3},
      ]);
      assert.equal(seen[0].url, '/ha/ai/k/api/account-plan');
    },
  );
  // a service from before the list: its one plan
  await withFetch(200, {plan, at: 5}, async () =>
    assert.deepEqual(await fetchAccountPlans(''), [{plan, at: 5}]),
  );
  await withFetch(404, {error: 'NO_PLAN'}, async () => assert.deepEqual(await fetchAccountPlans(''), []));
  await withFetch(401, {error: 'SIGNED_OUT'}, async () => assert.deepEqual(await fetchAccountPlans(''), []));
  await withFetch(200, {plan: {walls: []}, at: 5}, async () =>
    assert.deepEqual(await fetchAccountPlans(''), []),
  );
});

test('the plan is saved on the account as JSON with the browser it came from; a refusal throws', async () => {
  const plan = {rooms: []} as unknown as Plan;
  await withFetch(200, {at: 7}, async seen => {
    assert.equal(await saveAccountPlan('', plan, 'browser-a'), 7);
    assert.equal(seen[0].method, 'PUT');
    assert.deepEqual(JSON.parse(seen[0].body), {plan, device: 'browser-a'});
  });
  await withFetch(413, {error: 'TOO_LARGE'}, async () => {
    await assert.rejects(() => saveAccountPlan('', plan));
  });
});
