// The AI build's start screen (ai-build.ts): the account's builds offered on a browser that follows none.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  activeBuild,
  buildIdentity,
  buildStartedAt,
  buildTouchedAt,
  lineKey,
  offeredBuilds,
} from './ai-build.ts';

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

test('offered: a build stopped on a plan of several floors only until this browser showed it, as a finished one', () => {
  const stoppedSeen = `home-${Date.UTC(2026, 10, 12).toString(36)}`;
  const stoppedNew = `home-${Date.UTC(2026, 10, 11).toString(36)}`;
  const floors = {count: 2, labels: ['Ground Floor', 'First Floor']};
  const builds = [
    {id: stoppedSeen, finished: false, severalFloors: floors},
    {id: stoppedNew, finished: false, severalFloors: floors},
  ];
  const offered = offeredBuilds(builds, new Set([stoppedSeen]));
  assert.deepEqual(
    offered.map(build => build.id),
    [stoppedNew],
  );
});

test('a build on the start screen is told apart by when it was started and how many rooms it has', () => {
  const today = new Date();
  today.setHours(15, 42, 0, 0);
  const id = `home-${today.getTime().toString(36)}`;
  const identity = buildIdentity({id, rooms: [{}, {}, {}]});
  assert.match(identity, / · 3 rooms$/);
  assert.ok(!identity.startsWith('Yesterday'), identity);
  assert.equal(buildIdentity({id: 'not-a-time', rooms: [{}]}), '1 room');
  assert.equal(buildIdentity({id: 'not-a-time', rooms: []}), '');
});

test('the start screen shows one build at work on your home: the newest not finished; the rest are in the history', () => {
  const builds = [
    {id: 'home-c', finished: true},
    {id: 'home-b', finished: false},
    {id: 'home-a', finished: false},
  ];
  assert.equal(activeBuild(builds)?.id, 'home-b');
  assert.equal(activeBuild([{id: 'home-c', finished: true}]), null);
  assert.equal(activeBuild([]), null);
});

test('a hidden build line comes back once the build moves on: its key is the build and its state', () => {
  const building = {id: 'home-x', steps: [], rooms: [], has: {}, alive: true};
  const ready = {...building, waiting: 'final'};
  const waiting = {...building, paused: 'balance' as const};
  assert.equal(lineKey(building), 'home-x:running');
  assert.equal(lineKey(ready), 'home-x:ready');
  assert.equal(lineKey(waiting), 'home-x:waiting');
});

test('a build counts as touched when it was started, or opened since: the start screen shows it only if that is after your plan', () => {
  const started = Date.UTC(2026, 10, 16, 15, 0);
  const id = `home-${started.toString(36)}`;
  assert.equal(buildTouchedAt(id, {}), started);
  assert.equal(buildTouchedAt(id, {[id]: started + 5000}), started + 5000);
  assert.equal(buildTouchedAt('not-a-time', {}), 0);
});
