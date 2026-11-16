import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTE_TYPES,
  LIVE_DEFAULTS,
  NOTE_FULL,
  NOTE_GAP,
  NOTE_PEEK,
  noteFilter,
  noteStats,
  stackLayout,
  tuckedPlace,
  fullCount,
  edgeFade,
  springEasing,
  noteAge,
} from './notes.ts';
import type {NoteCategory} from './notes.ts';

test('collapsed: the latest cards in full, sheets peeking only below the last of them', () => {
  const heights = [60, 64, 60, 60, 60, 60, 60, 60];
  const {items, height, bottom} = stackLayout(heights);
  const tops = [0, 68, 140, 208];
  assert.equal(NOTE_FULL, 4);
  assert.deepEqual(
    items.slice(0, 4).map(item => [item.y, item.s, item.o, item.behind]),
    tops.map(y => [y, 1, 1, false]),
  );
  assert.equal(bottom, 208 + 60);
  assert.deepEqual(
    items.slice(4).map(item => [item.y, item.s, item.o, item.behind]),
    [
      [bottom + NOTE_PEEK - 60, 0.95, 1, true],
      [bottom + 2 * NOTE_PEEK - 60, 0.9, 1, true],
      [bottom + 3 * NOTE_PEEK - 60, 0.85, 0, true],
      [bottom + 3 * NOTE_PEEK - 60, 0.85, 0, true],
    ],
  );
  assert.equal(height, bottom + 2 * NOTE_PEEK);
  assert.deepEqual(
    items.map(item => item.z),
    [8, 7, 6, 5, 4, 3, 2, 1],
  );
  // fewer than four — just a list, no sheets
  assert.deepEqual(
    stackLayout([60, 60]).items.map(item => [item.y, item.behind]),
    [
      [0, false],
      [60 + NOTE_GAP, false],
    ],
  );
  assert.equal(stackLayout([60, 60]).height, 128);
  assert.deepEqual(stackLayout([]), {items: [], height: 0, bottom: 0});
});

test('collapsed to one card: the Sonner stack', () => {
  const {items, height} = stackLayout([60, 64, 60], {full: 1});
  assert.deepEqual(
    items.map(item => [item.y, item.s, item.behind]),
    [
      [0, 1, false],
      [60 + NOTE_PEEK - 64, 0.95, true],
      [60 + 2 * NOTE_PEEK - 60, 0.9, true],
    ],
  );
  assert.equal(height, 60 + 2 * NOTE_PEEK);
});

test('as many full cards as fit above the room strip, at most four, at least one', () => {
  assert.equal(fullCount(2000, 62), 4);
  assert.equal(fullCount(196, 62), 2);
  assert.equal(fullCount(230, 62), 3);
  assert.equal(fullCount(40, 62), 1);
});

test('expanded: a list with gaps, all in full', () => {
  const {items, height} = stackLayout([60, 64, 60], {expanded: true});
  assert.deepEqual(
    items.map(item => [item.y, item.s, item.o, item.behind]),
    [
      [0, 1, 1, false],
      [60 + NOTE_GAP, 1, 1, false],
      [124 + 2 * NOTE_GAP, 1, 1, false],
    ],
  );
  assert.equal(height, 184 + 2 * NOTE_GAP);
});

test('the tucked place is the hidden slot behind the stack', () => {
  const {items, bottom} = stackLayout([60, 60, 60, 60, 60, 60, 60, 60]);
  assert.deepEqual(tuckedPlace(bottom, 60), {y: items[7].y, s: items[7].s, o: 0});
});

test('edges: whole in the middle, shrinking at the bottom, melting above the top', () => {
  assert.deepEqual(edgeFade(100, 60, 400), {scale: 1, opacity: 1});
  const low = edgeFade(330, 60, 400);
  const lower = edgeFade(370, 60, 400);
  assert.ok(low.scale < 1 && low.opacity < 1);
  assert.ok(lower.scale < low.scale && lower.opacity < low.opacity);
  const gone = edgeFade(-60, 60, 400);
  assert.ok(gone.opacity <= 0.2 && gone.scale < 1);
});

test('the spring starts at 0, overshoots a little, ends exactly at 1', () => {
  const values = springEasing().slice('linear('.length, -1).split(', ').map(Number);
  assert.equal(values[0], 0);
  assert.equal(values[values.length - 1], 1);
  const peak = Math.max(...values);
  assert.ok(peak > 1.01 && peak < 1.08, String(peak));
});

test('filter: the mode’s defaults, then this browser’s choice; alerts stay on, rubbish is ignored', () => {
  assert.deepEqual(noteFilter(), LIVE_DEFAULTS);
  assert.ok(Object.values(noteFilter({demo: true})).every(Boolean));
  const stored = {link: true, alert: false, manual: 'yes', bogus: true};
  assert.deepEqual(noteFilter({stored}), {
    alert: true,
    manual: true,
    automation: false,
    hint: true,
    link: true,
  });
  assert.deepEqual(noteFilter({stored: 'rubbish'}), LIVE_DEFAULTS);
});

test('the day’s counts are by type, the hidden types too', () => {
  const now = 1793520000000;
  const log = [
    {category: 'automation' as NoteCategory, at: now - 1000},
    {category: 'automation' as NoteCategory, at: now - 2000},
    {category: 'manual' as NoteCategory, at: now - 3600e3},
    {category: 'manual' as NoteCategory, at: now - 90000e3},
  ];
  assert.deepEqual(noteStats(log, now), {
    byType: {alert: 0, manual: 1, automation: 2, hint: 0, link: 0},
    total: 3,
  });
});

test('every type has a name, a hint and an icon; only alerts are locked', () => {
  for (const type of NOTE_TYPES) assert.ok(type.name && type.hint && type.icon, type.id);
  assert.deepEqual(
    NOTE_TYPES.filter(type => type.locked).map(type => type.id),
    ['alert'],
  );
});

test('the age reads like a phone notification', () => {
  const now = new Date(2026, 10, 15, 14, 30).getTime();
  assert.equal(noteAge(now - 20e3, now), 'just now');
  assert.equal(noteAge(now - 12 * 60e3, now), '12 min ago');
  assert.match(noteAge(new Date(2026, 10, 15, 9, 5).getTime(), now), /^at 9:05/);
  assert.match(noteAge(new Date(2026, 10, 14, 21, 40).getTime(), now), /^yesterday at 9:40/);
  assert.match(noteAge(new Date(2026, 10, 3, 9, 15).getTime(), now), /^November 3 at 9:15/);
});
