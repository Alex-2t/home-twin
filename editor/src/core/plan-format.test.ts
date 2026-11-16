// The plan's format versions (plan-format.ts, D-121, docs/plan-format.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  FORMAT_STEPS,
  PLAN_VERSION,
  NewerPlanError,
  isNewerPlan,
  upgradeFormat,
  versionOf,
} from './plan-format.ts';
import {emptyPlan, migrate} from './plan.ts';
import {readPlan} from './plan-file.ts';
import type {PlanInput} from './types.ts';

const square: PlanInput['rooms'] = [
  {
    id: 'room',
    name: 'Room',
    polygon: [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ],
  },
];

test('the steps follow each other, one per version', () => {
  FORMAT_STEPS.forEach((step, i) => assert.equal(step.to, i + 1, step.what));
  assert.equal(PLAN_VERSION, FORMAT_STEPS.length);
  assert.equal(emptyPlan().version, PLAN_VERSION);
});

test('a version that is not a whole number from 0 is read as 0', () => {
  for (const version of [undefined, null, '1', 1.5, -1, true]) assert.equal(versionOf({version}), 0);
  assert.equal(versionOf(null), 0);
  assert.equal(versionOf({version: 3}), 3);
});

test('a file from before versions comes up step by step', () => {
  const old = {rooms: [{...square[0], sens: {t: {entity: 'sensor.t'}}}]};
  const plan = migrate(structuredClone(old) as PlanInput);
  assert.equal(plan.version, PLAN_VERSION);
  assert.equal('sens' in plan.rooms[0], false);
  // migrate does not write into what it was given
  assert.equal('version' in old, false);
});

test('a plan of this format is not touched by the steps', () => {
  const plan: Record<string, unknown> = {version: PLAN_VERSION, rooms: structuredClone(square)};
  const before = structuredClone(plan);
  assert.equal(upgradeFormat(plan), PLAN_VERSION);
  assert.deepEqual(plan, before);
});

test('a plan of a newer format keeps its version and what this editor does not know', () => {
  const newer = {
    version: PLAN_VERSION + 1,
    rooms: [{...square[0], futureField: {kept: true}}],
    futureList: [1, 2, 3],
  };
  const plan = migrate(structuredClone(newer) as PlanInput);
  assert.equal(plan.version, PLAN_VERSION + 1);
  assert.equal(isNewerPlan(plan), true);
  assert.deepEqual((plan as unknown as typeof newer).futureList, [1, 2, 3]);
  assert.deepEqual((plan.rooms[0] as unknown as (typeof newer.rooms)[0]).futureField, {kept: true});
  assert.equal(isNewerPlan(migrate({rooms: square})), false);
});

test('a file of a newer format is refused with its own error, so the user is told to update', () => {
  const text = JSON.stringify({version: PLAN_VERSION + 1, rooms: square});
  assert.throws(() => readPlan(text), NewerPlanError);
  assert.doesNotThrow(() => readPlan(JSON.stringify({version: PLAN_VERSION, rooms: square})));
});

// The guard on the format: the plan file's types (types.ts, from “the plan file: rooms and openings” to “what the plan's
// geometry gives back”), comments and spacing left out. A change there is a change to the format, and someone has to decide
// what it is — this test stops it until they do.
const TYPES = path.resolve(import.meta.dirname, 'types.ts');
const FROM = '// ---------- the plan file: rooms and openings ----------';
const TO = "// ---------- what the plan's geometry gives back ----------";
const FORMAT_FINGERPRINT = '3be243dbfb0b';

function formatFingerprint(): string {
  const source = fs.readFileSync(TYPES, 'utf8');
  const start = source.indexOf(FROM);
  const end = source.indexOf(TO);
  assert.ok(start >= 0 && end > start, `types.ts no longer has the lines “${FROM}” and “${TO}”`);
  const code = source
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(code).digest('hex').slice(0, 12);
}

test('the plan file types changed only with a decision about the format', () => {
  const now = formatFingerprint();
  assert.equal(
    now,
    FORMAT_FINGERPRINT,
    [
      'The plan file types in types.ts changed. Decide which kind of change it is (docs/plan-format.md):',
      '- an older plan still reads right in the new shape (a new optional field with a default): set FORMAT_FINGERPRINT to ' +
        `'${now}' in this test;`,
      '- an older plan would read wrong (a field renamed, moved or given another meaning): add a step to FORMAT_STEPS in ' +
        'plan-format.ts, run node tools/plan-archive.ts for the new format, note it in docs/plan-format.md, then set ' +
        `FORMAT_FINGERPRINT to '${now}'.`,
    ].join('\n'),
  );
});
