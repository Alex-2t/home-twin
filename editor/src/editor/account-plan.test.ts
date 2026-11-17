// The plan kept on the account (account-plan.ts, D-134): read back when there is one, nothing when there is none or nobody is
// signed in, and saved as JSON.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchAccountPlan, saveAccountPlan} from './account-plan.ts';
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

test('the plan kept on the account is read back; none, or signed out, is nothing', async () => {
  const plan = {rooms: [{name: 'Kitchen'}]};
  await withFetch(200, {plan, at: 5}, async seen => {
    assert.deepEqual(await fetchAccountPlan('/ha/ai/k'), {plan, at: 5});
    assert.equal(seen[0].url, '/ha/ai/k/api/account-plan');
  });
  await withFetch(404, {error: 'NO_PLAN'}, async () => assert.equal(await fetchAccountPlan(''), null));
  await withFetch(401, {error: 'SIGNED_OUT'}, async () => assert.equal(await fetchAccountPlan(''), null));
  await withFetch(200, {plan: {walls: []}, at: 5}, async () =>
    assert.equal(await fetchAccountPlan(''), null),
  );
});

test('the plan is saved on the account as JSON; a refusal throws', async () => {
  const plan = {rooms: []} as unknown as Plan;
  await withFetch(200, {at: 7}, async seen => {
    assert.equal(await saveAccountPlan('', plan), 7);
    assert.equal(seen[0].method, 'PUT');
    assert.deepEqual(JSON.parse(seen[0].body), {plan});
  });
  await withFetch(413, {error: 'TOO_LARGE'}, async () => {
    await assert.rejects(() => saveAccountPlan('', plan));
  });
});
