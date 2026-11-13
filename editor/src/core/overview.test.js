import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  overview,
  KIND_NAME,
  roomKind,
  roomClimate,
  homeRange,
  roomPower,
  roomDevices,
  kindName,
  localRoomName,
  numberAlike,
} from './overview.js';

const sq = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const sensors = [
  {entity: 'sensor.bed_t', area: 'bedroom', device: 'd1', cls: 'temperature', unit: '°C'},
  {entity: 'sensor.bed_h', area: 'bedroom', device: 'd1', cls: 'humidity', unit: '%'},
  {entity: 'sensor.bed_co2', area: 'bedroom', device: 'd2', cls: 'carbon_dioxide', unit: 'ppm'},
  {entity: 'sensor.wall_t', area: 'kitchen', device: 'd3', cls: 'temperature', unit: '°C'},
  {entity: 'sensor.kitchen_t', area: 'kitchen', device: 'd4', cls: 'temperature', unit: '°C'},
  {entity: 'sensor.fridge_t', area: 'kitchen', device: 'd5', cls: 'temperature', unit: '°C'},
];
const states = {
  'sensor.bed_t': 21.46,
  'sensor.bed_h': 37,
  'sensor.bed_co2': 1200,
  'sensor.wall_t': 23,
  'sensor.kitchen_t': 22,
  'sensor.fridge_t': 4,
};
const ctx = {sensors, areas: [{area_id: 'bedroom'}, {area_id: 'kitchen'}], state: e => states[e] ?? null};
const plan = () => ({
  rooms: [
    {id: 'r1', name: 'Bedroom', area: 'bedroom', polygon: sq(0, 0, 4, 3)},
    {id: 'r2', area: 'kitchen', polygon: sq(4, 0, 3, 3)},
    {id: 'r3', solid: true, polygon: sq(7, 0, 1, 1)},
    {id: 'r4', polygon: sq(8, 0, 1, 1)},
  ],
  lights: [
    {id: 'a', room: 'r1', placed: true, h: 2.6, on: true},
    {id: 'b', room: 'r1', placed: true, kind: 'strip', on: false},
    {id: 'c', room: 'r1', placed: true, with: 'a'},
    {id: 'd', room: 'r2', placed: true, draft: true},
    {id: 'e', room: 'r2', placed: false},
  ],
  sensors: [{id: 's1', entity: 'sensor.wall_t', room: 'r2'}],
});

test('overview: rooms in plan order, without solid and unnamed ones; lights: placed ones, without parts and drafts', () => {
  const o = overview(plan(), ctx, id => ({kitchen: 'Kitchen'})[id]);
  assert.deepEqual(
    o.map(r => [r.id, r.name, r.kind]),
    [
      ['r1', 'Bedroom', 'bed'],
      ['r2', 'Kitchen', 'kitchen'],
    ],
  );
  assert.deepEqual(
    o[0].lamps.map(l => [l.id, l.form, l.on]),
    [
      ['a', 'ceiling', true],
      ['b', 'strip', false],
    ],
  );
  assert.equal(o[0].lit, 1);
  assert.deepEqual(o[1].lamps, []);
});

test('room climate: a sensor on this room’s wall comes first, otherwise the best sensor of the area; the fridge is never picked', () => {
  const p = plan(),
    [r1, r2] = p.rooms;
  const c1 = roomClimate(p, r1, ctx);
  assert.equal(c1.t.entity, 'sensor.bed_t');
  assert.equal(c1.h.text, '37%');
  assert.equal(c1.co2.lvl, 1);
  assert.equal(roomClimate(p, r2, ctx).t.entity, 'sensor.wall_t'); // placed on the kitchen wall
  p.sensors = [];
  assert.notEqual(roomClimate(p, r2, ctx).t.entity, 'sensor.fridge_t');
  assert.deepEqual(roomClimate(p, {id: 'x', area: 'none', polygon: []}, ctx), {});
});

test('a room outdoors is named by what it is, not all "Balcony"; names that read the same are numbered', () => {
  const asIs = text => text;
  assert.equal(kindName('front garden', asIs), 'Garden');
  assert.equal(kindName('rear terrace', asIs), 'Terrace');
  assert.equal(kindName('balcony', asIs), 'Balcony');
  // a British plan's side return (home-mwdn9wlb's patio, renamed so, was built as a room with walls)
  assert.equal(roomKind('Side return'), 'balcony');
  assert.equal(kindName('Side return', asIs), 'Patio');
  assert.equal(kindName('courtyard', asIs), 'Patio');
  assert.equal(kindName('лоджия', asIs), 'Loggia'); // allow-cyrillic: a room name from a Russian plan
  assert.equal(kindName('patio', asIs), 'Patio');
  assert.equal(kindName('bedroom', asIs), 'Bedroom');
  assert.equal(localRoomName('Rear Porch/Utility', asIs), 'Porch/Utility');
  assert.equal(localRoomName('Bedroom 2', asIs), 'Bedroom 2');
  assert.deepEqual(numberAlike(['Bedroom', 'Kitchen', 'Bedroom']), ['Bedroom 1', 'Kitchen', 'Bedroom 2']);
  assert.deepEqual(numberAlike(['Garden', 'Terrace']), ['Garden', 'Terrace']);
});

test('room kind from name and id; home temperature range; room power button', () => {
  assert.equal(roomKind('Kids bedroom'), 'kids');
  assert.equal(roomKind('Kitchen-living room'), 'kitchen');
  assert.equal(roomKind('WC'), 'bath');
  assert.equal(roomKind('', 'bathroom'), 'bath');
  assert.equal(roomKind('Living room'), 'living');
  assert.equal(roomKind('Pantry'), 'storage');
  assert.equal(roomKind('Room'), 'room');
  assert.equal(roomKind('En-suite'), 'bath');
  assert.equal(roomKind('en-suite shower room'), 'bath');
  assert.equal(roomKind('Ensuite'), 'bath');
  const o = overview(plan(), ctx);
  assert.deepEqual(homeRange(o), [21.46, 23]);
  assert.equal(homeRange([]), null);
  assert.deepEqual(
    roomPower([
      {id: 'a', on: true},
      {id: 'b', on: false},
    ]),
    {on: false, ids: ['a', 'b']},
  );
  assert.deepEqual(roomPower([{id: 'a', on: false}]), {on: true, ids: ['a']});
});

test('room devices: an air conditioner and a thermostat with a setpoint, covers in name order, a contact sensor; not from other areas', () => {
  const D = [
    {entity: 'climate.a', name: 'Air conditioner', area: 'bedroom', domain: 'climate'},
    {entity: 'climate.f', name: 'Floor heating', area: 'bedroom', domain: 'climate'},
    {entity: 'cover.2', name: 'Blind 2', area: 'bedroom', domain: 'cover', cls: 'blind'},
    {entity: 'cover.1', name: 'Blind 1', area: 'bedroom', domain: 'cover', cls: 'blind'},
    {entity: 'cover.g', name: 'Gate', area: 'bedroom', domain: 'cover', cls: 'gate'},
    {entity: 'binary_sensor.w', name: 'Window', area: 'bedroom', domain: 'binary_sensor', cls: 'window'},
    {entity: 'climate.k', name: 'Kitchen', area: 'kitchen', domain: 'climate'},
  ];
  const E = {
    'climate.a': {state: 'cool', attributes: {hvac_modes: ['off', 'cool'], temperature: 22}},
    'climate.f': {state: 'heat', attributes: {hvac_modes: ['off', 'heat'], temperature: 27}},
    'cover.1': {state: 'open', attributes: {current_position: 100}},
    'cover.2': {state: 'closed', attributes: {current_position: 0}},
    'binary_sensor.w': {state: 'on', attributes: {}},
  };
  const d = roomDevices(plan().rooms[0], {devices: () => D, entity: e => E[e] || null});
  assert.deepEqual(
    d.acs.map(a => [a.title, a.kind, a.temp, a.name]),
    [
      ['Air conditioner', 'ac', 22, 'Cool'],
      ['Floor heating', 'heat', 27, 'Heat'],
    ],
  );
  assert.deepEqual(
    d.covers.map(c => [c.name, c.pos, c.blind]),
    [
      ['Blind 1', 100, true],
      ['Blind 2', 0, true],
    ],
  );
  assert.deepEqual(
    d.contacts.map(c => [c.name, c.open]),
    [['Window', true]],
  );
});

// Every room name the editor gives, in every language, is known back as its kind (home-mwdhlwq4: a storage room named by
// the catalog category's Russian word was of no kind again; "Balcón", "Pátio", "Hal" were not known either).
test('a room named by its kind in any language is that kind again', async () => {
  const {LANGS, setLang, t} = await import('../i18n/i18n.js');
  for (const [lang] of LANGS) {
    setLang(lang);
    for (const [kind, key] of Object.entries(KIND_NAME))
      if (kind !== 'room') assert.equal(roomKind(t(key)), kind, `${lang} ${kind} ${t(key)}`);
    for (const outdoors of ['loggia', 'rear terrace', 'patio', 'front garden', 'porch'])
      assert.equal(roomKind(kindName(outdoors, t)), 'balcony', `${lang} ${kindName(outdoors, t)}`);
  }
  setLang('en');
});
