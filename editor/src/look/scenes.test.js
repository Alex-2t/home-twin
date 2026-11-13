import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneDevices, scenePlan, sceneDraft, executeScene} from './scenes.js';

// rooms — as look.js returns them: model().rooms
const lamp = (id, kind, on = false) => ({id, name: id, kind, on, status: 'available'});
const ROOMS = [
  {
    id: 'hall',
    kind: 'hall',
    lamps: [lamp('hall_ceiling', 'ceiling'), lamp('hall_strip', 'strip', true)],
    covers: [],
    climate: [],
  },
  {
    id: 'kitchen',
    kind: 'kitchen',
    lamps: [lamp('kitchen_lamp', 'wall')],
    covers: [{entity: 'cover.k', name: 'Kitchen', pos: 0, ok: true}],
    climate: [],
  },
  {
    id: 'bed',
    kind: 'bed',
    lamps: [lamp('bed_ceiling', 'ceiling', true)],
    covers: [{entity: 'cover.b', name: 'Bedroom', pos: 100, ok: true}],
    climate: [
      {id: 'climate.bed', name: 'Air conditioner', heater: false, view: {state: 'on'}, canPower: true},
      {id: 'climate.floor', name: 'Floor heating', heater: true, view: {state: 'on'}, canPower: true},
    ],
  },
];
const D = sceneDevices(ROOMS);
const act = steps => Object.fromEntries(steps.map(s => [s.key, s.action]));

test('scene devices: lamps, curtains, air conditioners; no boiler or floor heating', () => {
  assert.deepEqual(
    D.map(d => d.key),
    [
      'light:hall_ceiling',
      'light:hall_strip',
      'light:kitchen_lamp',
      'cover:cover.k',
      'light:bed_ceiling',
      'cover:cover.b',
      'ac:climate.bed',
    ],
  );
});

test('“Home”: main lights in the hallway, in the kitchen without a ceiling light — all, curtains open', () => {
  assert.deepEqual(act(scenePlan('home', D)), {
    'light:hall_ceiling': 'on',
    'light:kitchen_lamp': 'on',
    'cover:cover.k': 'open',
    'cover:cover.b': 'open',
  });
});

test('“Away”: all lights and air conditioners off, curtains untouched', () => {
  assert.deepEqual(act(scenePlan('away', D)), {
    'light:hall_ceiling': 'off',
    'light:hall_strip': 'off',
    'light:kitchen_lamp': 'off',
    'light:bed_ceiling': 'off',
    'ac:climate.bed': 'off',
  });
});

test('“Night”: only the hallway accent light, curtains closed, climate untouched', () => {
  assert.deepEqual(act(scenePlan('night', D)), {
    'light:hall_ceiling': 'off',
    'light:hall_strip': 'on',
    'light:kitchen_lamp': 'off',
    'cover:cover.k': 'close',
    'light:bed_ceiling': 'off',
    'cover:cover.b': 'close',
  });
});

test('customized scene: only the set actions; no missing devices or foreign actions', () => {
  const s = {
    'light:bed_ceiling': {action: 'on'},
    'cover:cover.k': {action: 'on'},
    'light:gone': {action: 'off'},
    'ac:climate.bed': {action: 'keep'},
  };
  assert.deepEqual(act(scenePlan('night', D, s)), {'light:bed_ceiling': 'on'});
  assert.deepEqual(scenePlan('night', D, {}), [], 'everything “No change”');
  assert.deepEqual(scenePlan('party', D), []);
});

test('“Customize” draft: each device has an action or “No change”', () => {
  const d = sceneDraft('away', D);
  assert.equal(Object.keys(d).length, D.length);
  assert.deepEqual(d['cover:cover.k'], {action: 'keep'});
  assert.deepEqual(d['ac:climate.bed'], {action: 'off'});
  assert.deepEqual(sceneDraft('away', D, {'cover:cover.k': {action: 'close'}})['light:hall_strip'], {
    action: 'keep',
  });
});

test('running: skip unavailable, leave the desired state alone, count errors', async () => {
  const steps = [
    {kind: 'light', id: 'a', on: true, ok: true, action: 'on'}, // already on
    {kind: 'light', id: 'b', on: false, ok: true, action: 'on'}, // send
    {kind: 'cover', id: 'c', pos: 40, ok: true, action: 'open'}, // at 40 % — open fully
    {kind: 'cover', id: 'd', pos: 100, ok: true, action: 'open'}, // already open
    {kind: 'ac', id: 'e', on: true, ok: false, action: 'off'}, // unavailable
    {kind: 'ac', id: 'f', on: true, ok: true, action: 'off'}, // HA answered with an error
    {kind: 'ac', id: 'g', on: true, ok: true, action: 'off'}, // HA did not accept
  ];
  const sent = [];
  const r = await executeScene(steps, async s => {
    sent.push(s.id);
    if (s.id === 'f') throw Error('x');
    return s.id !== 'g';
  });
  assert.deepEqual(sent, ['b', 'c', 'f', 'g']);
  assert.deepEqual(r, {sent: 2, unchanged: 2, skipped: 2, failed: 1});
});
