import test from 'node:test';
import assert from 'node:assert/strict';
import {
  homeEvents,
  replayEvents,
  automationRuns,
  changeOrigin,
  markAutomated,
  alertCatalog,
  linkCatalog,
  RUN_MEMORY_MS,
  SETTLE_MS,
} from './home-events.ts';
import type {AutomationRun, ChangeContext, EventItem, EventState, HistoryRow} from './home-events.ts';
import type {NoteDraft} from './notes.ts';

const catalog: EventItem[] = [
  {
    key: 'switch.kitchen',
    entity: 'switch.kitchen',
    kind: 'light',
    name: 'Main light',
    room: 'Kitchen',
    icon: 'bulb',
  },
  {
    key: 'climate.ac',
    entity: 'climate.ac',
    kind: 'climate',
    name: 'Air conditioner',
    room: 'Bedroom',
    icon: 'wind',
  },
  {
    key: 'valve.water',
    entity: 'valve.water',
    kind: 'water',
    name: 'Water',
    room: null,
    icon: 'droplet',
    source: 'Kitchen',
  },
  {
    key: 'cover.curtains',
    entity: 'cover.curtains',
    kind: 'cover',
    name: 'Curtains',
    room: 'Bedroom',
    icon: 'curtain',
  },
  {key: 'light.hall', entity: 'light.hall', kind: 'light', name: 'Hall light', room: 'Hallway', icon: 'bulb'},
  {key: 'sensor.co2', entity: 'sensor.co2', kind: 'co2', name: 'Bedroom', room: 'Bedroom', icon: 'wind'},
];
type States = Record<string, string | EventState>;
const reader =
  (states: States) =>
  (item: EventItem): EventState | null => {
    const value = item.entity ? states[item.entity] : undefined;
    if (value == null) return null;
    return typeof value === 'string' ? {state: value} : value;
  };
const base: States = {
  'switch.kitchen': 'off',
  'climate.ac': 'off',
  'valve.water': 'open',
  'cover.curtains': 'open',
  'light.hall': 'off',
  'sensor.co2': '640',
};
// live checks without settling: each change is an event at once; a notification's own time is left out
const run = (
  previous: Record<string, string | null> | null,
  states: States,
  items: EventItem[] = catalog,
  options: {runs?: Map<string, AutomationRun>} = {},
): {snapshot: Record<string, string | null>; notes: Omit<NoteDraft, 'at'>[]} => {
  const result = homeEvents(previous, reader(states), items, {settleMs: 0, now: 0, ...options});
  return {snapshot: result.snapshot, notes: result.notes.map(({at: _at, ...note}) => note)};
};

test('the first look is only remembered', () => {
  const {snapshot, notes} = run(null, base);
  assert.deepEqual(notes, []);
  assert.equal(snapshot['switch.kitchen'], 'off');
});

test('real changes become notifications with the room as the source', () => {
  const first = run(null, base).snapshot;
  const {notes} = run(first, {...base, 'switch.kitchen': 'on', 'climate.ac': 'heat'});
  assert.deepEqual(notes, [
    {icon: 'bulb', title: 'Main light: on', source: 'Kitchen', category: 'manual'},
    {icon: 'wind', title: 'Air conditioner: heat', source: 'Bedroom', category: 'manual'},
  ]);
});

test('moving covers wait for the end position; unavailable is not an event', () => {
  const first = run(null, base).snapshot;
  let result = run(first, {...base, 'cover.curtains': 'closing', 'switch.kitchen': 'unavailable'});
  assert.deepEqual(result.notes, []);
  result = run(result.snapshot, {...base, 'cover.curtains': 'closed'});
  assert.deepEqual(
    result.notes.map(note => note.title),
    ['Curtains: closed'],
  );
  // the relay came back in the same state — silence
  assert.equal(result.snapshot['switch.kitchen'], 'off');
});

test('the valve shut off is an alert; CO₂ reminds once, with a gap', () => {
  const first = run(null, base).snapshot;
  let result = run(first, {...base, 'valve.water': 'closed', 'sensor.co2': '1050'});
  assert.deepEqual(result.notes, [
    {icon: 'droplet', title: 'Water shut off', source: 'Kitchen', category: 'alert'},
    {icon: 'wind', title: 'Air out the bedroom', source: 'CO₂ sensor', category: 'hint'},
  ]);
  // around the threshold — no repeats; a reminder again only after airing
  result = run(result.snapshot, {...base, 'valve.water': 'closed', 'sensor.co2': '960'});
  result = run(result.snapshot, {...base, 'valve.water': 'closed', 'sensor.co2': '1010'});
  assert.deepEqual(result.notes, []);
  result = run(result.snapshot, {...base, 'valve.water': 'closed', 'sensor.co2': '700'});
  result = run(result.snapshot, {...base, 'valve.water': 'closed', 'sensor.co2': '1100'});
  assert.deepEqual(
    result.notes.map(note => note.title),
    ['Air out the bedroom'],
  );
});

test('a scene changing many devices is one summary; it does not swallow an alert', () => {
  const first = run(null, base).snapshot;
  const result = run(first, {
    ...base,
    'switch.kitchen': 'on',
    'climate.ac': 'cool',
    'cover.curtains': 'closed',
    'light.hall': 'on',
    'valve.water': 'closed',
  });
  assert.deepEqual(result.notes, [
    {icon: 'droplet', title: 'Water shut off', source: 'Kitchen', category: 'alert'},
    {icon: 'home', title: '4 changes at home', source: 'Kitchen, Bedroom and 1 more', category: 'manual'},
  ]);
});

test('origin: a person through HA, an automation, or the device itself', () => {
  const runs = new Map<string, AutomationRun>([['run-1', {at: 0, name: 'Good morning'}]]);
  const origin = (context: ChangeContext | null): string => changeOrigin(context, runs);
  assert.equal(origin(null), 'device');
  assert.equal(origin({id: 'a', user_id: 'u1'}), 'user');
  assert.equal(origin({id: 'b', parent_id: 'p'}), 'automation');
  assert.equal(origin({id: 'run-1'}), 'automation');
  assert.equal(origin({id: 'c'}), 'device');
});

test('automation runs: current contexts stay, past ones expire', () => {
  let runs = automationRuns(null, [{contextId: 'c1', name: 'Night'}], 0);
  runs = automationRuns(runs, [{contextId: 'c2', name: 'Night'}], RUN_MEMORY_MS - 1);
  assert.deepEqual([...runs.keys()], ['c1', 'c2']);
  runs = automationRuns(runs, [{contextId: 'c2', name: 'Night'}], RUN_MEMORY_MS + 1);
  assert.deepEqual([...runs.keys()], ['c2']);
});

test('a change by an automation carries its name; many of them fold under it', () => {
  const runs = new Map<string, AutomationRun>([['run-1', {at: 0, name: 'Good morning'}]]);
  const byRun = (state: string): EventState => ({state, context: {id: 'run-1'}});
  const first = run(null, base).snapshot;
  let result = run(first, {...base, 'cover.curtains': byRun('closed')}, catalog, {runs});
  assert.deepEqual(result.notes, [
    {
      icon: 'curtain',
      title: 'Curtains: closed',
      source: 'Bedroom',
      category: 'automation',
      by: 'Good morning',
    },
  ]);
  result = run(
    first,
    {
      ...base,
      'switch.kitchen': byRun('on'),
      'climate.ac': byRun('cool'),
      'cover.curtains': byRun('closed'),
      'light.hall': byRun('on'),
    },
    catalog,
    {runs},
  );
  assert.deepEqual(
    result.notes.map(note => [note.title, note.category]),
    [['Good morning: 4 devices', 'automation']],
  );
});

test('live: clicks in a row settle into one event, back-and-forth into none', () => {
  const read = (states: States) => reader(states);
  let result = homeEvents(null, read(base), catalog, {now: 0});
  result = homeEvents(result.snapshot, read({...base, 'switch.kitchen': 'on'}), catalog, {
    now: 100,
    pending: result.pending,
  });
  result = homeEvents(result.snapshot, read({...base, 'switch.kitchen': 'off'}), catalog, {
    now: 300,
    pending: result.pending,
  });
  result = homeEvents(result.snapshot, read({...base, 'switch.kitchen': 'on'}), catalog, {
    now: 500,
    pending: result.pending,
  });
  assert.deepEqual(result.notes, []);
  assert.equal(result.pending.size, 1);
  result = homeEvents(result.snapshot, read({...base, 'switch.kitchen': 'on'}), catalog, {
    now: 500 + SETTLE_MS,
    pending: result.pending,
  });
  assert.deepEqual(
    result.notes.map(note => note.title),
    ['Main light: on'],
  );
  // on and back off within the settling — nothing at all
  result = homeEvents(result.snapshot, read({...base, 'switch.kitchen': 'off'}), catalog, {
    now: 9000,
    pending: result.pending,
  });
  result = homeEvents(result.snapshot, read({...base, 'switch.kitchen': 'on'}), catalog, {
    now: 9100,
    pending: result.pending,
  });
  result = homeEvents(result.snapshot, read({...base, 'switch.kitchen': 'on'}), catalog, {
    now: 9100 + SETTLE_MS,
    pending: result.pending,
  });
  assert.deepEqual(result.notes, []);
});

test("live: a person's clicks are each told at once; the relay's echo of a click still settles into nothing", () => {
  const read = (states: States) => reader(states);
  const byOwner = (state: string, id: string): EventState => ({state, context: {id, user_id: 'owner'}});
  const echo = (state: string): EventState => ({state, context: {id: `device-${state}`}});
  let result = homeEvents(null, read(base), catalog, {now: 0});
  const step = (state: string | EventState, now: number): string[] => {
    result = homeEvents(result.snapshot, read({...base, 'switch.kitchen': state}), catalog, {
      now,
      pending: result.pending,
      persons: result.persons,
    });
    return result.notes.map(note => note.title);
  };
  // three clicks from the card within a second: three events, none waiting
  assert.deepEqual(step(byOwner('on', 'c1'), 100), ['Main light: on']);
  assert.deepEqual(step(byOwner('off', 'c2'), 400), ['Main light: off']);
  assert.deepEqual(step(byOwner('on', 'c3'), 700), ['Main light: on']);
  assert.equal(result.pending.size, 0);
  // the relay bounces after the last click: off and on again by itself, then the click's own context once more
  assert.deepEqual(step(echo('off'), 800), []);
  assert.deepEqual(step(echo('on'), 900), []);
  assert.deepEqual(step(byOwner('off', 'c3'), 950), []);
  assert.deepEqual(step(byOwner('on', 'c3'), 1000), []);
  assert.deepEqual(step(byOwner('on', 'c3'), 1000 + SETTLE_MS), []);
  // a wall switch (no person) still settles: on now, told only once the series ends
  assert.deepEqual(step(echo('off'), 9000), []);
  assert.deepEqual(step(echo('off'), 9000 + SETTLE_MS), ['Main light: off']);
});

test('a lamp of the plan alone (no device to bounce) is told at once, without settling', () => {
  const lamp: EventItem = {
    key: 'lamp:l1',
    entity: null,
    kind: 'light',
    name: 'Table lamp',
    room: 'Bedroom',
    icon: 'lamp',
  };
  let state = 'off';
  const read = (): EventState => ({state});
  const first = homeEvents(null, read, [lamp], {now: 0});
  state = 'on';
  const result = homeEvents(first.snapshot, read, [lamp], {now: 100});
  assert.deepEqual(
    result.notes.map(note => note.title),
    ['Table lamp: on'],
  );
  assert.equal(result.pending.size, 0);
});

test('a lamp of the plan alone is read like any other', () => {
  const lamp: EventItem = {
    key: 'lamp:L1',
    entity: null,
    kind: 'light',
    name: 'Mirror',
    room: 'Bathroom',
    icon: 'bulb',
  };
  let on = false;
  const read = (): EventState => ({state: on ? 'on' : 'off'});
  const first = homeEvents(null, read, [lamp], {settleMs: 0, now: 0});
  on = true;
  const result = homeEvents(first.snapshot, read, [lamp], {settleMs: 0, now: 0});
  assert.deepEqual(
    result.notes.map(note => [note.title, note.source, note.category]),
    [['Mirror: on', 'Bathroom', 'manual']],
  );
});

test('alert sensors: found by class, placed in the model’s room, raise and clear', () => {
  const items = alertCatalog(
    [
      {
        entity: 'binary_sensor.leak',
        domain: 'binary_sensor',
        cls: 'moisture',
        name: 'Leak sensor',
        area: 'bath',
      },
      {
        entity: 'binary_sensor.smoke',
        domain: 'binary_sensor',
        cls: 'smoke',
        name: 'Smoke sensor',
        area: 'attic',
      },
      {entity: 'binary_sensor.door', domain: 'binary_sensor', cls: 'door', name: 'Door', area: 'hall'},
      {entity: 'sensor.moisture', domain: 'sensor', cls: 'moisture', name: 'Soil', area: 'bath'},
    ],
    area => (area === 'bath' ? 'Bathroom' : null),
    area => (area === 'attic' ? 'Attic' : area),
  );
  assert.deepEqual(
    items.map(item => [item.entity, item.name, item.source]),
    [
      ['binary_sensor.leak', 'Water leak', 'Bathroom'],
      ['binary_sensor.smoke', 'Smoke detected', 'Attic'],
    ],
  );
  const states = {'binary_sensor.leak': 'off', 'binary_sensor.smoke': 'off'};
  let result = run(null, states, items);
  result = run(result.snapshot, {...states, 'binary_sensor.leak': 'on'}, items);
  assert.deepEqual(result.notes, [
    {icon: 'droplet', title: 'Water leak', source: 'Bathroom', category: 'alert'},
  ]);
  result = run(result.snapshot, states, items);
  assert.deepEqual(result.notes, [
    {icon: 'droplet', title: 'The leak is gone', source: 'Bathroom', category: 'alert', resolved: true},
  ]);
});

test('connection: one item per device; dropping off and coming back; many at once fold', () => {
  const links = linkCatalog(catalog, entity =>
    entity === 'light.hall' ? 'dev-kitchen' : entity === 'switch.kitchen' ? 'dev-kitchen' : null,
  );
  assert.equal(links.length, catalog.length - 1);
  assert.ok(links.every(link => link.kind === 'link' && link.key.endsWith('#link')));
  let result = run(null, base, links);
  result = run(result.snapshot, {...base, 'climate.ac': 'unavailable'}, links);
  assert.deepEqual(result.notes, [
    {icon: 'wifi-off', title: 'Air conditioner: offline', source: 'Bedroom', category: 'link'},
  ]);
  result = run(result.snapshot, base, links);
  assert.deepEqual(
    result.notes.map(note => note.title),
    ['Air conditioner: back online'],
  );
  const down = Object.fromEntries(Object.keys(base).map(entity => [entity, 'unavailable']));
  result = run(result.snapshot, down, links);
  assert.deepEqual(
    result.notes.map(note => [note.title, note.icon]),
    [['Offline: 5 devices', 'wifi-off']],
  );
});

test('history replay: the start state is not an event; the same rules as live', () => {
  const minute = (n: number): number => 1793520000000 + n * 60000;
  const series: Record<string, HistoryRow[]> = {
    'switch.kitchen': [
      {s: 'off', t: minute(0)},
      {s: 'on', t: minute(10)},
      {s: 'unavailable', t: minute(20)},
      {s: 'on', t: minute(25)},
      {s: 'off', t: minute(40)},
    ],
    'cover.curtains': [
      {s: 'open', t: minute(0)},
      {s: 'closing', t: minute(30)},
      {s: 'closed', t: minute(31)},
    ],
    'sensor.co2': [
      {s: '700', t: minute(0)},
      {s: '1020', t: minute(5)},
      {s: '980', t: minute(6)},
      {s: '1040', t: minute(7)},
    ],
  };
  const notes = replayEvents(series, catalog);
  assert.deepEqual(
    notes.map(note => [note.title, ((note.at as number) - minute(0)) / 60000]),
    [
      ['Air out the bedroom', 5],
      ['Main light: on', 10],
      ['Curtains: closed', 31],
      ['Main light: off', 40],
    ],
  );
});

test('history: a bouncing relay is one event, a quick on-off is none', () => {
  const second = (n: number): number => 1793520000000 + n * 1000;
  const series: Record<string, HistoryRow[]> = {
    'switch.kitchen': [
      {s: 'off', t: second(0)},
      {s: 'on', t: second(100)},
      {s: 'off', t: second(100.4)},
      {s: 'on', t: second(100.8)},
    ],
    'light.hall': [
      {s: 'off', t: second(0)},
      {s: 'on', t: second(200)},
      {s: 'off', t: second(201)},
    ],
  };
  assert.deepEqual(
    replayEvents(series, catalog).map(note => note.title),
    ['Main light: on'],
  );
});

test('history: automation rows are marked from the logbook, with their names', () => {
  const at = 1793520000;
  const series: Record<string, HistoryRow[]> = {
    'cover.curtains': [
      {s: 'open', t: (at - 100) * 1000},
      {s: 'closed', t: at * 1000 + 120},
    ],
    'switch.kitchen': [
      {s: 'off', t: (at - 100) * 1000},
      {s: 'on', t: at * 1000},
    ],
  };
  markAutomated(series, [
    {
      entity_id: 'cover.curtains',
      state: 'closed',
      when: at,
      context_event_type: 'automation_triggered',
      context_name: 'Night',
    },
    {
      entity_id: 'switch.kitchen',
      state: 'on',
      when: at,
      context_user_id: 'u1',
      context_entity_id: 'automation.x',
    },
  ]);
  assert.deepEqual(series['cover.curtains'][1], {s: 'closed', t: at * 1000 + 120, auto: true, by: 'Night'});
  assert.equal(series['switch.kitchen'][1].auto, undefined);
  const notes = replayEvents(series, catalog);
  assert.deepEqual(
    notes.map(note => [note.title, note.category, note.by]),
    [
      ['Main light: on', 'manual', undefined],
      ['Curtains: closed', 'automation', 'Night'],
    ],
  );
});
