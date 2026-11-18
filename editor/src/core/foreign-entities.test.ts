// A plan drawn against another Home Assistant, taken into this one (foreign-entities.ts): what ties it to entities this HA
// lacks stays behind, the rest is kept as it was.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dropForeignEntities} from './foreign-entities.ts';
import {emptyPlan} from './plan.ts';
import type {Plan, PlanDevice, PlanLight, PlanSensor} from './types.ts';

/** This HA's entities. */
const HERE = new Set(['light.kitchen', 'switch.lamp', 'sensor.kitchen_temperature', 'cover.kitchen_curtain']);
const hasEntity = (entity: string): boolean => HERE.has(entity);

function planWith(lights: PlanLight[], sensors: PlanSensor[] = [], devices: PlanDevice[] = []): Plan {
  return {
    ...emptyPlan(),
    lights,
    sensors,
    devices,
    sensorSkip: ['sensor.kitchen_temperature', 'sensor.demo_co2'],
  };
}

test('a light of another HA: never placed it goes, placed it stays as a lamp without an entity', () => {
  const plan = planWith([
    {id: 'kitchen', entity: 'light.kitchen', area: 'kitchen', placed: true, points: [], segments: []},
    {id: 'lamp', entity: 'switch.lamp', relay: true, points: [], segments: []},
    {id: 'living_main', entity: 'light.living_main', area: 'living', points: [], segments: []},
    {
      id: 'hall_spots',
      entity: 'light.hall_spots',
      area: 'hall',
      placed: true,
      points: [{x: 1, y: 2}],
      segments: [],
    },
    {id: 'cove', entity: 'light.cove', placed: true, with: 'living_main', points: [], segments: []},
    {id: 'seen', placed: true, points: [], segments: []},
  ] as PlanLight[]);
  const taken = dropForeignEntities(plan, hasEntity);
  assert.deepEqual(
    taken.lights.map(light => light.id),
    ['kitchen', 'lamp', 'hall_spots', 'cove', 'seen'],
  );
  const hall = taken.lights.find(light => light.id === 'hall_spots')!;
  assert.equal(hall.entity, undefined);
  assert.equal(hall.area, undefined);
  assert.deepEqual(hall.points, [{x: 1, y: 2}]);
  // the fitting it was a part of went: a light of its own
  assert.equal(taken.lights.find(light => light.id === 'cove')!.with, undefined);
  // this HA's own stay as they were
  assert.equal(taken.lights.find(light => light.id === 'kitchen')!.area, 'kitchen');
  // the plan given is not changed
  assert.equal(plan.lights.length, 6);
  assert.equal(plan.lights[3].entity, 'light.hall_spots');
});

test('readings and devices of another HA go; a reading below one that went starts its own column', () => {
  const plan = planWith(
    [],
    [
      {id: 'co2', entity: 'sensor.demo_co2', room: 'room_1'},
      {id: 'temperature', entity: 'sensor.kitchen_temperature', room: 'room_1', under: 'co2'},
    ],
    [
      {id: 'curtain', entity: 'cover.kitchen_curtain', furn: 'f1'},
      {id: 'aircon', entity: 'climate.demo_ac', furn: 'f2', made: true},
    ],
  );
  const taken = dropForeignEntities(plan, hasEntity);
  assert.deepEqual(
    taken.sensors.map(sensor => [sensor.id, sensor.under]),
    [['temperature', undefined]],
  );
  assert.deepEqual(
    taken.devices.map(device => device.id),
    ['curtain'],
  );
  assert.deepEqual(taken.sensorSkip, ['sensor.kitchen_temperature']);
});
