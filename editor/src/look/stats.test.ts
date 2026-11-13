// @ts-nocheck
// “Statistics”: only what HA keeps on its own for any user — climate (mean / min / max), energy (change) and connectivity
// (raw history). Rows are in the HA format; the demo layer answers the same way, so it is tested too.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  periodWindow,
  buildSeries,
  buildClimate,
  energySources,
  buildEnergy,
  buildHealth,
  availableSections,
  loadSection,
  sectionTile,
  sectionMap,
  deviceLabel,
  REST,
  NOROOM,
  HEALTH_DAYS,
  DAY,
} from './stats.ts';
import {demoStatistics, demoStateHistory} from '../editor/ha-demo.ts';
import {mockHA} from '../editor/ha.ts';

const NOW = new Date(2026, 10, 8, 15, 30);
const H = 36e5;
const day = (w, i) => w.starts[i];

test('period windows: 7 and 30 days from midnight, a year — 12 months from the first of the month', () => {
  const w = periodWindow('week', NOW),
    m = periodWindow('month', NOW),
    y = periodWindow('year', NOW);
  assert.equal(w.starts.length, 7);
  assert.equal(w.bucket, 'day');
  assert.equal(w.starts[6], new Date(2026, 10, 8).getTime());
  assert.equal(m.starts.length, 30);
  assert.equal(m.start, new Date(2026, 9, 10).getTime());
  assert.equal(y.bucket, 'month');
  assert.equal(y.starts.length, 12);
  assert.equal(y.start, new Date(2025, 11, 1).getTime());
  assert.equal(periodWindow('nope', NOW).period, 'month');
});

test('increments: bars by day, the series start (negative) is skipped, before the first row — “no data yet”', () => {
  const w = periodWindow('week', NOW),
    items = [
      {id: 'a', statistic: 's.a', room: 'r1'},
      {id: 'b', statistic: 's.b', room: 'r2'},
    ];
  const rows = {
    's.a': [
      {start: day(w, 2), change: -50},
      {start: day(w, 3), change: 2},
      {start: day(w, 4), change: 3},
    ],
    's.b': [{start: day(w, 4), change: 1}],
  };
  const s = buildSeries(items, w, rows, null, {groupOf: i => i.room});
  assert.equal(s.total, 6);
  assert.equal(s.since, day(w, 3));
  assert.deepEqual(
    s.buckets.map(b => b.covered),
    [false, false, false, true, true, true, true],
  );
  assert.deepEqual(s.groups, [
    {id: 'r1', value: 5},
    {id: 'r2', value: 1},
  ]);
  assert.equal(s.items[0].id, 'a');
  assert.ok(
    Math.abs(s.days - (NOW - day(w, 3)) / DAY) < 1e-9,
    'days with data — from the first row, today — by the elapsed fraction',
  );
  assert.equal(buildSeries(items, w, {}, null).empty, true);
});

test('climate: mean, range and comfort — by hourly averages; a year — without comfort', () => {
  const w = periodWindow('week', NOW),
    src = [
      {room: 'r1', temperature: 't1', humidity: 'h1'},
      {room: 'r2', co2: 'c2'},
      {room: 'r3', temperature: 'none'},
    ];
  const rows = {
    t1: w.starts.map(start => ({start, mean: 22, min: 11, max: 23})),
    h1: [{start: day(w, 6), mean: 50, min: 40, max: 60}],
    c2: [{start: day(w, 6), mean: 900, min: 500, max: 1500}],
  };
  const hourly = {
    t1: [
      {start: day(w, 6), mean: 19},
      {start: day(w, 6) + H, mean: 21},
      {start: day(w, 6) + 2 * H, mean: 23},
      {start: day(w, 6) + 3 * H, mean: 25},
    ],
    c2: [
      {start: day(w, 6), mean: 1200},
      {start: day(w, 6) + H, mean: 800},
    ],
  };
  const c = buildClimate(src, w, rows, hourly);
  assert.deepEqual(
    c.rooms.map(r => r.room),
    ['r1', 'r2'],
    'no statistics — no room',
  );
  assert.deepEqual(
    c.rooms[0].temperature,
    {mean: 22, min: 19, max: 25, comfort: 0.5},
    'a one-second 11° glitch does not get into the statistics min',
  );
  assert.equal(c.rooms[1].co2.over, 1);
  assert.equal(c.mean, 22);
  assert.equal(c.comfort, 0.5);
  assert.equal(c.buckets[0].rooms.r1, 22);
  const y = buildClimate(
    src,
    periodWindow('year', NOW),
    {t1: [{start: periodWindow('year', NOW).start, mean: 21, min: 20, max: 22}]},
    null,
  );
  assert.equal(y.rooms[0].temperature.comfort, undefined);
  assert.equal(buildClimate(src, w, {}, null).empty, true);
});

test('energy: sources — the “Energy” dashboard; a nested device is not added; the name — without “Energy”', () => {
  assert.equal(energySources(null), null);
  assert.equal(energySources({grid: [], devices: []}), null);
  const src = energySources(
    {
      grid: ['sensor.meter'],
      devices: [
        {statistic: 'sensor.fridge_energy'},
        {statistic: 'sensor.pc', name: 'PC'},
        {statistic: 'sensor.pc_monitor', parent: 'sensor.pc'},
      ],
    },
    {
      room: s => (s === 'sensor.fridge_energy' ? {id: 'kitchen'} : null),
      name: s => ({'sensor.fridge_energy': 'Refrigerator Energy'})[s] || s,
    },
  );
  assert.deepEqual(src.grid, [{id: 'grid0', statistic: 'sensor.meter'}]);
  assert.deepEqual(
    src.devices.map(d => [d.name, d.room]),
    [
      ['Refrigerator', 'kitchen'],
      ['PC', null],
    ],
  );
  assert.equal(deviceLabel('Fridge Energy'), 'Fridge');
  assert.equal(deviceLabel('Energie'), 'Energie', 'a single word — left alone');
  assert.equal(deviceLabel('Water meter'), 'Water meter');
});

test('energy: the bar is from the grid, parts are device rooms, “Other” is the remainder; no grid — the sum of devices', () => {
  const w = periodWindow('week', NOW),
    src = {
      grid: [{id: 'grid0', statistic: 'm'}],
      devices: [
        {id: 'f', statistic: 'f', name: 'Refrigerator', room: 'kitchen'},
        {id: 'x', statistic: 'x', name: 'Water heater', room: null},
      ],
    };
  const rows = {
    m: [
      {start: day(w, 5), change: 10},
      {start: day(w, 6), change: 2},
    ],
    f: [
      {start: day(w, 5), change: 1},
      {start: day(w, 6), change: 1},
    ],
    x: [
      {start: day(w, 5), change: 3},
      {start: day(w, 6), change: 2},
    ],
  };
  const s = buildEnergy(src, w, rows, null);
  assert.deepEqual(s.buckets[5].parts, {kitchen: 1, [NOROOM]: 3, [REST]: 6});
  assert.equal(
    s.buckets[6].total,
    3,
    'devices showed more than the grid — the bar follows the devices, “Other” is 0',
  );
  assert.equal(s.buckets[6].parts[REST], 0);
  assert.equal(s.total, 13);
  assert.equal(s.tracked, 7);
  assert.equal(s.rest, 6);
  assert.equal(s.grid, true);
  assert.deepEqual(sectionMap('energy', s), {kitchen: {label: '2.0 kWh'}}, 'on the model — rooms only');
  const d = buildEnergy({grid: [], devices: src.devices}, w, rows, null);
  assert.equal(d.grid, false);
  assert.equal(d.total, 7);
  assert.equal(
    d.groups.some(g => g.id === REST),
    false,
  );
});

test('connectivity: hours and occurrences offline; an HA restart does not count; entities of one device — one row', () => {
  const span = {start: 0, end: 10 * DAY},
    s = x => x / 1e3,
    ents = [];
  for (let i = 0; i < 10; i++) ents.push({entity: 'light.l' + i, name: 'Lamp ' + i});
  ents.push(
    {entity: 'sensor.th_t', name: 'Bathroom sensor Temperature', room: 'bath', device: 'th'},
    {entity: 'sensor.th_h', name: 'Bathroom sensor Humidity', room: 'bath', device: 'th'},
    {entity: 'climate.ac', name: 'Air conditioner', room: 'kitchen'},
  );
  const restart = 3 * DAY,
    hist = {};
  for (const e of ents)
    hist[e.entity] = [
      {s: 'on', lu: 0},
      {s: 'unavailable', lu: s(restart)},
      {s: 'on', lu: s(restart + 40e3)},
    ];
  hist['climate.ac'].push(
    {s: 'unavailable', lu: s(5 * DAY)},
    {s: 'cool', lu: s(5 * DAY + 2 * H)},
    {s: 'unavailable', lu: s(9 * DAY)},
  );
  hist['sensor.th_h'].push({s: 'unavailable', lu: s(6 * DAY)}, {s: '40', lu: s(6 * DAY + H)});
  const h = buildHealth(ents, hist, span);
  assert.equal(h.restarts, 1);
  assert.equal(h.total, 12, 'a sensor with two entities — one device');
  assert.deepEqual(
    h.items.map(i => [i.name, +i.offline.toFixed(2), i.drops, i.now]),
    [
      ['Air conditioner', 26, 2, false],
      ['Bathroom sensor', 1, 1, true],
    ],
  );
  assert.deepEqual(Object.keys(h.rooms), ['kitchen', 'bath']);
  const first = buildHealth(
    [{entity: 'a', name: 'A'}],
    {
      a: [
        {s: 'unavailable', lu: 0},
        {s: 'on', lu: s(H)},
      ],
    },
    span,
  );
  assert.deepEqual(
    [first.items[0].offline, first.items[0].drops],
    [1, 0],
    'unavailable from the window start — hours count, a “dropout” does not',
  );
});

test('sections: sources present — the section exists; overview tiles', () => {
  assert.deepEqual(availableSections({climate: [{room: 'r'}], energy: null, health: []}), ['climate']);
  assert.deepEqual(availableSections({climate: [], energy: {grid: [], devices: [{}]}, health: [{}]}), [
    'energy',
    'health',
  ]);
  assert.deepEqual(sectionTile('climate', {mean: 21.46, comfort: 0.8}), {value: '21.5°', sub: 'comfort 80%'});
  assert.deepEqual(sectionTile('health', {items: [{offline: 3}, {offline: 0.1}]}), {
    value: '1',
    sub: 'device dropped out',
  });
  assert.deepEqual(sectionTile('health', {items: []}), {value: '✓', sub: 'all online'});
  assert.equal(sectionTile('energy', {empty: true}), null);
});

test('demo layer: statistics as in HA — sensor means, meter increments, the current hour not compiled', async () => {
  const sensors = [
    {entity: 'sensor.t', cls: 'temperature'},
    {entity: 'sensor.e', cls: 'energy', daily: 12, shape: 'flat'},
    {entity: 'sensor.x', cls: 'temperature'},
  ];
  const state = e => ({'sensor.t': 22, 'sensor.e': 100})[e] ?? null,
    now = NOW.getTime();
  const w = periodWindow('week', NOW);
  const r = demoStatistics(
    sensors,
    state,
    ['sensor.t', 'sensor.e', 'sensor.x', 'sensor.none'],
    {start: w.start, end: w.end, period: 'day', types: ['mean', 'min', 'max', 'change']},
    {now},
  );
  assert.deepEqual(Object.keys(r), ['sensor.t', 'sensor.e'], 'no reading or meter — no rows');
  assert.equal(r['sensor.t'].length, 7);
  assert.ok(r['sensor.t'].every(x => x.min <= x.mean && x.mean <= x.max && Math.abs(x.mean - 22) < 3));
  const today = r['sensor.e'].at(-1),
    full = r['sensor.e'][0];
  assert.ok(full.change > 6 && full.change < 24);
  assert.ok(today.change < full.change, 'today — only the elapsed hours');
  const hours = demoStatistics(
    sensors,
    state,
    ['sensor.e'],
    {start: now - 5 * H, end: now, period: 'hour', types: ['change']},
    {now},
  )['sensor.e'];
  assert.equal(hours.at(-1).start, Math.floor(now / H) * H - H, 'the last row is the previous hour');
  assert.deepEqual(
    demoStatistics(
      sensors,
      state,
      ['sensor.t'],
      {start: w.start, end: w.end, period: 'day', types: ['mean']},
      {now, since: now + 1},
    ),
    {},
    'before the data starts — empty',
  );
  const hist = demoStateHistory(
    ['a', 'b'],
    {start: 0, end: 10 * DAY},
    {outages: {a: {hours: 4, drops: 2}}, restart: 5 * DAY},
  );
  assert.equal(hist.a.filter(x => x.s === 'unavailable').length, 3);
  assert.equal(hist.b.filter(x => x.s === 'unavailable').length, 1);
  const b = buildHealth(
    [
      {entity: 'a', name: 'A'},
      {entity: 'b', name: 'B'},
      ...'cdef'.split('').map(e => ({entity: e, name: e})),
    ],
    demoStateHistory(
      ['a', 'b', ...'cdef'],
      {start: 0, end: 10 * DAY},
      {outages: {a: {hours: 4, drops: 2}}, restart: 5 * DAY},
    ),
    {start: 0, end: 10 * DAY},
  );
  assert.equal(b.restarts, 1);
  assert.deepEqual(
    b.items.map(i => [i.entity, Math.round(i.offline), i.drops]),
    [['a', 4, 2]],
  );
});

test('a whole section through the HA demo layer: climate, energy, connectivity', async () => {
  const ha = mockHA({
    areas: {k: 'Kitchen'},
    lights: [],
    sensors: [
      {entity: 'sensor.k_t', cls: 'temperature', area: 'k'},
      {entity: 'sensor.m', cls: 'energy', daily: 10},
    ],
    states: {'sensor.k_t': 22, 'sensor.m': 5},
    entities: {'climate.ac': {state: 'cool', attributes: {}}},
    stats: {energy: {grid: ['sensor.m'], devices: []}, outages: {'climate.ac': {hours: 5, drops: 2}}},
  });
  const src = {
    climate: [{room: 'k', temperature: 'sensor.k_t'}],
    energy: energySources(await ha.energy()),
    health: [{entity: 'climate.ac', name: 'Air conditioner', room: 'k'}],
  };
  const c = await loadSection('climate', ha, src, 'month', NOW),
    e = await loadSection('energy', ha, src, 'week', NOW),
    h = await loadSection('health', ha, src, 'year', NOW);
  assert.equal(c.rooms.length, 1);
  assert.ok(c.comfort >= 0 && c.comfort <= 1);
  assert.equal(e.grid, true);
  assert.ok(e.profile.length === 24 && e.profile.some(v => v > 0), 'a week — with the daily profile');
  assert.equal(Math.round(h.days), HEALTH_DAYS, 'a year is selected — connectivity is still over 10 days');
  assert.equal(Math.round(h.items[0].offline), 5);
  await assert.rejects(loadSection('light', ha, src, 'month', NOW));
});
