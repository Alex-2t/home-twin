// @ts-nocheck
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyPlan, migrate} from './plan.ts';
import {readPlan} from './plan-file.ts';

const plan = () =>
  migrate({
    rooms: [
      {
        id: 'r',
        name: 'Room',
        polygon: [
          [0, 0],
          [6, 0],
          [6, 5],
          [0, 5],
        ],
      },
    ],
    openings: [{kind: 'door', a: [1, 0], b: [1.8, 0]}],
  });
test('the file keeps finishes, the lights draft, sensors, the view and wizard steps', () => {
  const p = plan();
  Object.assign(p.rooms[0], {
    floor: 'oak',
    floorTint: '#123456',
    wall: 'paint',
    wf: [{k: 'tile', tint: '#eeeeee'}],
    wt: [0.2, null, 0.12],
    zone: {a: [3, 0], b: [3, 5], area: 'kitchen', left: true},
  });
  p.lights = [
    {
      id: 'l',
      room: 'r',
      points: [[2, 2]],
      segments: [],
      draft: true,
      placed: true,
      was: {
        k: 'r',
        s: JSON.stringify([
          ['id', 'l'],
          ['placed', false],
          ['points', []],
          ['segments', []],
        ]),
      },
    },
  ];
  p.sensors = [{id: 's', entity: 'sensor.temp', room: 'r', at: [1, 0], under: 'another', label: 'T', k: 1.5}];
  p.sensorSkip = ['sensor.humidity'];
  p.view = {t: [1, 0, 2], theta: 0.2, phi: 0.8, fit: [8, 5]};
  p.onboarding = {steps: {lights: {status: 'in_progress'}}};
  assert.deepEqual(readPlan(JSON.stringify(p)), p);
});
test('old files with coordinate openings and an empty plan are supported', () => {
  const p = readPlan(
    JSON.stringify({
      rooms: [
        {
          id: 'r',
          polygon: [
            [0, 0],
            [6, 0],
            [6, 5],
            [0, 5],
          ],
        },
      ],
      openings: [{kind: 'door', a: [1, 0], b: [1.8, 0]}],
    }),
  );
  assert.equal(p.openings[0].at.room, 'r');
  assert.ok(p.id);
  assert.deepEqual(readPlan(JSON.stringify(emptyPlan())).rooms, []);
});
test('foreign JSON, invalid data and future versions are rejected before opening', () => {
  for (const text of ['{', 'null', 'true', '42', '"hello"', '[]', '{}', '{"hello":"world"}'])
    assert.throws(() => readPlan(text), text);
  const bad = [
    p => (p.version = 2),
    p => (p.units = 'cm'),
    p => (p.rooms = null),
    p => p.rooms.push({...p.rooms[0]}),
    p => (p.rooms[0].polygon = [[0, 0]]),
    p => (p.rooms[0].polygon[0] = ['0', 0]),
    p => (p.furniture = [null]),
    p => (p.furniture = [{id: 'f', model: 'bed', x: '2', y: 1, w: 2, d: 1, h: 1}]),
    p => (p.lights = [{id: 'l', points: [null]}]),
    p => (p.lights = [{id: 'l', was: {s: 'broken'}}]),
    p => (p.openings[0].at.edge = 99),
    p => (p.openings[0].at.s0 = null),
    p => (p.sensors = [{id: 's', at: 1}]),
    p => (p.onboarding = {steps: null}),
    p => (p.view = {t: [0, 0, 0], fit: 2}),
  ];
  for (const change of bad) {
    const p = plan();
    change(p);
    assert.throws(() => readPlan(JSON.stringify(p)));
  }
});
test('furniture colors: named and custom #rrggbb (a rug also has a border color) are kept; malformed ones are rejected', () => {
  const rug = {id: 'f', model: 'rug', x: 2, y: 2, w: 2, d: 1.4, h: 0.012, rot: 0},
    p = plan();
  p.furniture = [
    {...rug, color: '#b8b1a5', color2: '#978E80'},
    {...rug, id: 'g', model: 'bed', color: 'oak'},
    {...rug, id: 'h', model: 'tv'},
  ];
  assert.deepEqual(readPlan(JSON.stringify(p)), p);
  for (const bad of ['#b8b1a', '#b8b1a5ff', 'b8b1a5', '#gggggg', 'rgb(1,2,3)', 'Oak', '', 5, true, {}])
    for (const k of ['color', 'color2']) {
      const q = plan();
      q.furniture = [{...rug, [k]: bad}];
      assert.throws(() => readPlan(JSON.stringify(q)), `${k}: ${JSON.stringify(bad)}`);
    }
});
test('overlapping rooms can be opened and fixed; the file check does not replace the geometry check', () => {
  const p = plan();
  p.rooms.push({...p.rooms[0], id: 'overlap'});
  assert.equal(readPlan(JSON.stringify(p)).rooms.length, 2);
});
