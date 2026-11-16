// Version history: snapshots at meaningful moments, no duplicates, at most 40, old autosaves go first.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createVersions, VER_MAX, AUTO_MS, EDITS_PER_AUTO} from './versions.ts';
import type {Plan} from '../core/types.ts';
import type {StoreOp} from './idb.ts';

// A plan with only the fields a test looks at: the versions read its id and keep the rest as JSON.
const plan = (fields: Pick<Plan, 'id'> & Record<string, unknown>): Pick<Plan, 'id'> => fields;

const mem = () => {
  const m = new Map<string, unknown>();
  return {
    m,
    get: async (k: string) => structuredClone(m.get(k)),
    batch: async (ops: StoreOp[]) => {
      for (const [op, k, v] of ops) op === 'put' ? m.set(k, structuredClone(v)) : m.delete(k);
    },
  };
};

test('a snapshot is the plan as it was at call time; an identical one in a row is not written; each project has its own versions', async () => {
  let now = 1e12;
  const store = mem();
  const V = createVersions({store, now: () => now});
  await V.open('a');
  const p = {id: 'a', rooms: [1]};
  const w = V.add(p, {kind: 'before', what: 'merge'});
  p.rooms.push(2);
  await w; // “before an edit” — taken before it
  assert.deepEqual(JSON.parse(V.list()[0].plan).rooms, [1]);
  assert.equal(await V.add(plan({id: 'a', rooms: [1]})), null, 'already exists');
  assert.equal(await V.add(plan({id: 'b', rooms: [1]})), null, 'another project is not written');
  assert.equal(
    await V.add(plan({id: 'a', rooms: [1], onboarding: {steps: {open: 'in_progress'}}})),
    null,
    'wizard marks are not a new version',
  );
  now += 1;
  await V.add(p, {kind: 'step', what: 'split'});
  assert.deepEqual(
    V.list().map(v => v.kind),
    ['step', 'before'],
  );
  now += 1;
  await V.add(plan({id: 'a', rooms: [3]}));
  assert.equal(
    (await V.add(plan({id: 'a', rooms: [3]}), {kind: 'step', what: 'open'}))!.what,
    'open',
    'an autosave with the same plan is relabelled with the step',
  );
  assert.deepEqual(
    V.list().map(v => v.kind),
    ['step', 'step', 'before'],
  );
  const V2 = createVersions({store});
  await V2.open('a');
  assert.equal(V2.list().length, 3, 'the same after a reload');
  await V2.open('b');
  assert.equal(V2.list().length, 0);
});

test('at most 100: autosaves are thinned where they are densest, steps stay, the newest stays', async () => {
  let now = 0;
  const V = createVersions({store: mem(), now: () => now});
  await V.open('a');
  await V.add(plan({id: 'a', n: -1}), {kind: 'step', what: 'rect'}); // the oldest, but not an autosave — it stays
  // a day ago: an autosave an hour for ten hours; then today, one a minute
  for (let i = 0; i < 10; i++) {
    now += 3600e3;
    await V.add(plan({id: 'a', old: i}), {kind: 'auto'});
  }
  for (let i = 0; i < VER_MAX + 5; i++) {
    now += 60e3;
    await V.add(plan({id: 'a', n: i}), {kind: 'auto'});
  }
  const L = V.list();
  assert.equal(L.length, VER_MAX);
  assert.equal(L.at(-1)!.kind, 'step');
  assert.equal(JSON.parse(L[0].plan).n, VER_MAX + 4, 'the newest stays');
  const oldKept = L.filter(v => JSON.parse(v.plan).old !== undefined).length;
  assert.equal(oldKept, 10, 'the hourly ones of long ago are kept: the dense minutes thin out first');
});

test('an autosave every third edit, or the first edit after 10 minutes', async () => {
  let now = 0;
  const V = createVersions({store: mem(), now: () => now});
  await V.open('a');
  assert.equal(V.due(), true, 'no versions — due');
  await V.add(plan({id: 'a', x: 1}));
  assert.equal(V.due(), false, 'just kept');
  for (let i = 1; i < EDITS_PER_AUTO; i++) V.edited();
  assert.equal(V.due(), false, 'two edits — not yet');
  V.edited();
  assert.equal(V.due(), true, 'the third edit');
  await V.add(plan({id: 'a', x: 2}));
  assert.equal(V.due(), false, 'kept: counted anew');
  now = AUTO_MS;
  assert.equal(V.due(), false, '10 minutes without an edit — nothing to keep');
  V.edited();
  assert.equal(V.due(), true, 'an edit after 10 minutes');
});
