// Every plan of the archive (demo/plan-archive/v<N>/, D-121) opened with today's code: a plan saved by any earlier format
// must still open, nothing in it lost. The archive gets this format's plans from tools/plan-archive.ts once, when the format
// is new; they are never changed after, so a step of a later format that drops or misreads something fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readPlan} from './plan-file.ts';
import {migrate} from './plan.ts';
import {PLAN_VERSION} from './plan-format.ts';
import {validate} from './geometry.ts';
import {planWalls} from './plan-scene.ts';

const ARCHIVE = path.resolve(import.meta.dirname, '../../demo/plan-archive');

/** A format's folder: its version and its plan files. */
interface ArchivedFormat {
  version: number;
  files: string[];
}

const formats: ArchivedFormat[] = fs
  .readdirSync(ARCHIVE)
  .filter(name => /^v\d+$/.test(name))
  .map(name => ({
    version: Number(name.slice(1)),
    files: fs
      .readdirSync(path.join(ARCHIVE, name))
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(ARCHIVE, name, file)),
  }))
  .sort((a, b) => a.version - b.version);

// The lists a plan holds: none of their entries may be lost on the way up.
const LISTS = ['rooms', 'openings', 'furniture', 'lights', 'sensors', 'devices'] as const;
const countOf = (json: Record<string, unknown>, list: string): number => {
  const entries = json[list];
  return Array.isArray(entries) ? entries.length : 0;
};

test('the archive has the plans of every format from 1 to this one', () => {
  for (let version = 1; version <= PLAN_VERSION; version++) {
    const format = formats.find(entry => entry.version === version);
    assert.ok(
      format && format.files.length,
      `demo/plan-archive/v${version} is missing: run node tools/plan-archive.ts once the format is ${version}`,
    );
  }
  assert.ok(
    formats.every(format => format.version <= PLAN_VERSION),
    'the archive has a format newer than PLAN_VERSION',
  );
});

for (const format of formats)
  for (const file of format.files)
    test(`v${format.version}/${path.basename(file)} opens with nothing lost`, () => {
      const text = fs.readFileSync(file, 'utf8');
      const given = JSON.parse(text) as Record<string, unknown>;
      const plan = readPlan(text);
      assert.equal(plan.version, PLAN_VERSION);
      for (const list of LISTS)
        assert.equal(plan[list].length, countOf(given, list), `${list} lost on the way up`);
      assert.deepEqual(
        validate(plan.rooms).map(problem => `${problem.room}: ${problem.text}`),
        [],
      );
      const walls = planWalls(plan);
      assert.ok(walls, 'the walls are built');
      // a plan of this format comes out of migrate exactly as it went in: migrate is only for older or damaged plans
      if (format.version === PLAN_VERSION) assert.deepEqual(migrate(structuredClone(plan)), plan);
    });
