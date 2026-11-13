// The AI build's start screen (ai-build.ts): the account's builds offered on a browser that follows none.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildStartedAt, offeredBuilds} from './ai-build.ts';

test('a build is dated by its id; one named otherwise has no date', () => {
  const at = Date.UTC(2026, 10, 14, 9, 30);
  assert.equal(buildStartedAt(`home-${at.toString(36)}`), at);
  assert.equal(buildStartedAt('my-flat'), null);
  assert.equal(buildStartedAt(undefined), null);
});

test('offered: unfinished builds newest first, a finished one only if this browser never showed it', () => {
  const older = `home-${Date.UTC(2026, 10, 10).toString(36)}`;
  const newer = `home-${Date.UTC(2026, 10, 13).toString(36)}`;
  const finishedSeen = `home-${Date.UTC(2026, 10, 12).toString(36)}`;
  const finishedNew = `home-${Date.UTC(2026, 10, 11).toString(36)}`;
  const builds = [
    {id: 'named-by-hand', finished: false},
    {id: older, finished: false},
    {id: finishedSeen, finished: true},
    {id: newer, finished: false},
    {id: finishedNew, finished: true},
  ];
  const offered = offeredBuilds(builds, new Set([finishedSeen]));
  assert.deepEqual(
    offered.map(build => build.id),
    [newer, finishedNew, older, 'named-by-hand'],
  );
  assert.deepEqual(offeredBuilds([], new Set()), []);
});
