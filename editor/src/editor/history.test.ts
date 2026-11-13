import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createHistory} from './history.ts';
import {createUnderlay} from './underlay.ts';
import {emptyPlan, addRoom, addOpening, scalePlan, rotatePlan} from '../core/plan.ts';
import {readPlan} from '../core/plan-file.ts';
import {mergePlanLights} from './ha.ts';
import type {Plan, PlanLight} from '../core/types.ts';
import type {StoreOp} from './idb.ts';

// Plans with only the fields a test looks at: the history keeps whatever it is given.
interface NumberedPlan {
  id?: string;
  n?: number;
  help?: boolean;
}
interface StepPlan {
  id?: string;
  rooms: never[];
  v: number;
}

let memory: Map<string, string>;
beforeEach(() => {
  memory = new Map();
  // Only the three calls the code makes.
  const storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
    getItem: k => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
    removeItem: k => memory.delete(k),
  };
  globalThis.localStorage = storage as Storage;
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
});

const apartment = (): Plan => {
  const p = emptyPlan();
  p.id = 'test';
  addRoom(
    p,
    [
      [0, 0],
      [6, 0],
      [6, 5],
      [0, 5],
    ],
    'Kitchen',
  );
  addOpening(p, p.rooms[0], 0, 2, 'door');
  p.furniture.push({id: 'bed', model: 'bed', x: 2, y: 2, w: 1.6, d: 2, h: 1, rot: 0});
  p.lights.push({
    id: 'lamp',
    entity: 'light.lamp',
    room: 'room_1',
    placed: true,
    points: [[3, 2]],
    segments: [],
    h: 2.5,
  });
  p.sensors.push({id: 'temp', entity: 'sensor.temp', room: 'room_1', at: [1, 0], label: 'Temperature', k: 1});
  return p;
};

test('rooms, openings, furniture, lights and sensors: undo/redo, reload and file all keep the same result', () => {
  const h = createHistory();
  const p = apartment();
  h.reset(p);
  const states = [structuredClone(p)];
  const edits = [
    () => (p.rooms[0].polygon[1][0] = 7),
    () => (p.openings[0].at.s1 += 0.2),
    () => (p.furniture[0].x = 4),
    () => (p.lights[0].points[0][1] = 3),
    () => (p.sensors[0].at = [2, 0]),
  ];
  for (const edit of edits) {
    edit();
    h.commit(p);
    states.push(structuredClone(p));
  }
  for (let i = states.length - 2; i >= 0; i--) {
    assert.deepEqual(h.undo(), states[i]);
    assert.deepEqual(createHistory().load(), states[i]);
    assert.deepEqual(readPlan(JSON.stringify(h.load())), states[i]);
  }
  assert.equal(h.undo(), null);
  for (let i = 1; i < states.length; i++) {
    assert.deepEqual(h.redo(), states[i]);
    assert.deepEqual(createHistory().load(), states[i]);
  }
  assert.equal(h.redo(), null);
});

test('a new edit after undo cuts off redo; mutating the returned object does not corrupt the snapshot', () => {
  const h = createHistory();
  const p = apartment();
  h.reset(p);
  p.furniture[0].x = 4;
  h.commit(p);
  const old = h.undo()!;
  old.furniture[0].x = 5;
  h.commit(old);
  assert.equal(h.redo(), null);
  assert.equal(h.undo()!.furniture[0].x, 2);
  assert.equal(h.redo()!.furniture[0].x, 5);
});

test('a housekeeping amend adds no step and does not destroy redo after undo', () => {
  const h = createHistory<NumberedPlan>();
  h.amend({n: 0});
  h.commit({n: 1});
  h.commit({n: 2});
  h.undo();
  h.amend({n: 1, help: true});
  assert.deepEqual(h.redo(), {n: 2});
  assert.deepEqual(h.undo(), {n: 1, help: true});
  assert.deepEqual(h.undo(), {n: 0});
});

test('history is capped at 200 snapshots; opening another plan starts a separate history', () => {
  const h = createHistory<NumberedPlan>();
  h.reset({n: 0});
  for (let n = 1; n <= 210; n++) h.commit({n});
  for (let n = 209; n >= 11; n--) assert.deepEqual(h.undo(), {n});
  assert.equal(h.undo(), null);
  h.reset({id: 'other'});
  assert.equal(h.undo(), null);
  assert.equal(h.redo(), null);
  assert.deepEqual(h.load(), {id: 'other'});
});

test('unavailable storage does not break history and does not report a successful write', () => {
  const h = createHistory<NumberedPlan>();
  h.reset({n: 0});
  const set = localStorage.setItem;
  localStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  h.commit({n: 1});
  assert.ok(h.error);
  assert.deepEqual(h.load(), {n: 0});
  assert.deepEqual(h.undo(), {n: 0});
  assert.deepEqual(h.redo(), {n: 1});
  localStorage.setItem = set;
  assert.equal(h.save({n: 1}), true);
  assert.equal(h.error, null);
  assert.deepEqual(h.load(), {n: 1});
});

test('empty or corrupted storage is read without throwing', () => {
  const h = createHistory();
  assert.equal(h.load(), null);
  memory.set('home-twin-editor:plan', '{broken');
  assert.equal(h.load(), null);
  localStorage.getItem = () => {
    throw new Error('SecurityError');
  };
  assert.equal(h.load(), null);
});

test('loading keeps lights whose entity is missing in HA; a returning entity keeps its place and gets the current name', () => {
  const saved: PlanLight[] = [
    {id: 'l', name: 'Old', entity: 'light.l', area: 'old', placed: true, points: [[2, 3]], segments: []},
    {
      id: 'relay',
      name: 'Relay',
      entity: 'switch.l',
      relay: true,
      placed: true,
      points: [[1, 1]],
      segments: [],
    },
  ];
  assert.deepEqual(mergePlanLights(saved, []), saved);
  // The lamp from HA has only the fields the merge reads.
  const lamp = (fields: Partial<PlanLight>): PlanLight => fields as PlanLight;
  const merged = mergePlanLights(
    saved,
    [lamp({id: 'l', name: 'New', entity: 'light.l', area: 'new', points: []})],
    [{entity: 'switch.l', name: 'New relay', area: 'room'}],
  );
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0].points, [[2, 3]]);
  assert.equal(merged[0].area, 'new');
  assert.equal(merged[0].name, 'New');
  assert.equal(merged[1].id, 'relay');
  assert.equal(merged[1].name, 'New relay');
  assert.deepEqual(merged[1].points, [[1, 1]]);
});

test('undoing scale and rotation restores the photo along with the plan, in storage too', () => {
  const u = createUnderlay();
  Object.assign(u, {img: {complete: true}, src: 'test-image', a: [0.1, 0], b: [0, 5]});
  const h = createHistory(undefined, {capture: () => u.snapshot(), restore: s => u.restore(s)});
  const p = apartment();
  h.reset(p);
  // The photo was moved separately from the rooms, then the whole apartment was rescaled.
  u.moveBy(1, 2);
  h.captureExtra();
  const before = structuredClone(p);
  const photo = u.snapshot()!;
  scalePlan(p, [0, 0], 2);
  u.turn([0, 0], 0, 2);
  h.commit(p);
  const scaled = structuredClone(p);
  const scaledPhoto = u.snapshot();
  rotatePlan(p, [0, 0], Math.PI / 2);
  u.turn([0, 0], Math.PI / 2);
  h.commit(p);
  assert.deepEqual(h.undo(), scaled);
  assert.deepEqual(u.snapshot(), scaledPhoto);
  assert.deepEqual(h.undo(), before);
  assert.deepEqual(u.snapshot(), photo);
  assert.deepEqual(JSON.parse(memory.get('home-twin-editor:underlay')!).a, photo.a);
  assert.deepEqual(h.redo(), scaled);
  assert.deepEqual(u.snapshot(), scaledPhoto);
});

test('a snapshot of another photo does not move the new underlay; a corrupted placement does not break loading', async () => {
  const u = createUnderlay();
  Object.assign(u, {img: {complete: true}, src: 'new', a: [0.2, 0], b: [2, 3]});
  // The snapshot of another photo, taken as undo takes it: its fingerprint is not this photo's.
  const old = createUnderlay();
  Object.assign(old, {img: {complete: true}, src: 'old', a: [1, 0], b: [0, 0]});
  u.restore(old.snapshot());
  assert.deepEqual(u.a, [0.2, 0]);
  assert.deepEqual(u.b, [2, 3]);
  // The same photo's snapshot does move it: the fingerprint is what told the two apart.
  const same = createUnderlay();
  Object.assign(same, {img: {complete: true}, src: 'new', a: [1, 0], b: [0, 0]});
  u.restore(same.snapshot());
  assert.deepEqual(u.a, [1, 0]);
  memory.set('home-twin-editor:underlay', '{broken');
  assert.equal(await u.load(), false);
  memory.set('home-twin-editor:underlay', JSON.stringify({a: [0, 0], b: [0, 0]}));
  assert.equal(await u.load(), false);
});

// Undo survives a reload: steps are in per-project storage (here in memory instead of IndexedDB).
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
const plan = (v: number, id = 'p1'): StepPlan => ({id, rooms: [], v});
// What the history wrote under a key: an array (the index) or a project's steps.
const stored = <Value>(store: ReturnType<typeof mem>, key: string): Value => store.m.get(key) as Value;

test('undo steps and “Redo” are the same after a reload', async () => {
  const store = mem();
  const h = createHistory<StepPlan>(null, {store});
  h.reset(plan(0));
  await h.ready;
  h.commit(plan(1));
  h.commit(plan(2));
  h.undo();
  await h.flush();
  const h2 = createHistory<StepPlan>(null, {store});
  h2.reset(plan(1));
  await h2.ready;
  assert.deepEqual(h2.size(), {steps: 3, pos: 1}, 'plan matches a saved step — the whole history');
  assert.equal(h2.redo()!.v, 2);
  assert.equal(h2.undo()!.v, 1);
  assert.equal(h2.undo()!.v, 0);
  assert.equal(h2.undo(), null);
});

test('plan changed without steps (file, failed write) — it becomes a new step after the saved ones, undo leads to them', async () => {
  const store = mem();
  const h = createHistory<StepPlan>(null, {store});
  h.reset(plan(0));
  await h.ready;
  h.commit(plan(1));
  await h.flush();
  const h2 = createHistory<StepPlan>(null, {store});
  h2.reset(plan(9));
  await h2.ready;
  assert.deepEqual(h2.size(), {steps: 3, pos: 2});
  assert.equal(h2.undo()!.v, 1);
});

test('a new edit after undo — the undone branch is erased from storage too', async () => {
  const store = mem();
  const h = createHistory<StepPlan>(null, {store});
  h.reset(plan(0));
  await h.ready;
  h.commit(plan(1));
  h.commit(plan(2));
  await h.flush();
  const before = [...store.m.keys()].filter(k => /^hist:p1:/.test(k)).length;
  h.undo();
  h.undo();
  h.commit(plan(5));
  await h.flush();
  const keys = [...store.m.keys()].filter(k => /^hist:p1:/.test(k));
  assert.equal(before, 3);
  assert.equal(keys.length, 2, 'steps 1 and 2 deleted, 0 and 5 remain');
  assert.deepEqual(stored<{ns: number[]}>(store, 'hist:p1').ns.length, 2);
});

test('another project has its own history; the last six projects are kept', async () => {
  const store = mem();
  const h = createHistory<StepPlan>(null, {store});
  for (let i = 0; i < 7; i++) {
    h.reset(plan(0, 'p' + i));
    await h.ready;
    h.commit(plan(1, 'p' + i));
    await h.flush();
    store.m.set('ver:p' + i, [1]);
  }
  h.reset(plan(1, 'p6'));
  await h.ready;
  assert.equal(store.m.has('hist:p0'), false, 'the oldest project has no history');
  assert.equal(store.m.has('ver:p0'), false, 'and no versions');
  assert.equal(
    [...store.m.keys()].some(k => k.startsWith('hist:p0:')),
    false,
  );
  assert.equal(store.m.has('hist:p1'), true);
  assert.deepEqual(stored<string[]>(store, 'hist:index').length, 6);
});

test('without storage — as before, in memory only', () => {
  const h = createHistory<StepPlan>();
  h.reset(plan(0));
  h.commit(plan(1));
  assert.equal(h.undo()!.v, 0);
  assert.equal(h.redo()!.v, 1);
});
