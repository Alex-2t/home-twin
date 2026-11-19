// The pins an owner sent the developer, in their list (D-129): the words of each status with the developer's note, the dot
// on the account when one moved on, and which fix the home in the editor is offered.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixWaitingFor, reportStatusWords, reportsSeen} from './ai-reports.ts';
import type {AccountReport} from './ai-reports.ts';

const report = (more: Partial<AccountReport>): AccountReport => ({
  build: 'home-a',
  round: 1,
  n: 1,
  text: 'a door here, not a window',
  status: 'sent',
  sentAt: '2026-11-16T10:00:00Z',
  at: '2026-11-16T10:00:00Z',
  ...more,
});

test("each status says where the pin stands, with the developer's note when there is one", () => {
  assert.equal(reportStatusWords('sent'), 'Sent to the developer');
  assert.equal(reportStatusWords('looking'), 'The developer is looking at it');
  assert.equal(reportStatusWords('looking', 'this week'), 'The developer is looking at it: this week');
  assert.equal(reportStatusWords('fixed', 'check the porch'), 'Fixed by the developer: check the porch');
  assert.equal(reportStatusWords('cannot'), 'Can’t be done');
});

test('the dot: a pin that moved on since the list was opened here; a pin only sent is no news', () => {
  const sent = report({});
  const answered = report({status: 'looking', at: '2026-11-18T09:00:00Z'});
  assert.deepEqual(reportsSeen([sent], ''), {count: 1, news: false});
  assert.deepEqual(reportsSeen([sent, answered], ''), {count: 2, news: true});
  assert.deepEqual(reportsSeen([sent, answered], '2026-11-18T09:00:00Z'), {count: 2, news: false});
});

test('a fix is offered to a home of its build taken before it: the latest such fix, none for another home', () => {
  const reports = [
    report({status: 'fixed', fixRound: 3}),
    report({n: 2, status: 'fixed', fixRound: 4}),
    report({build: 'home-b', status: 'fixed', fixRound: 9}),
    report({n: 3, status: 'looking'}),
  ];
  assert.equal(fixWaitingFor(reports, {build: 'home-a', round: 2}), 4);
  assert.equal(fixWaitingFor(reports, {build: 'home-a', round: 4}), null);
  assert.equal(fixWaitingFor(reports, {build: 'home-c', round: 0}), null);
  assert.equal(fixWaitingFor(reports, null), null);
});
