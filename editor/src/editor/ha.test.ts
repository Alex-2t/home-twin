// @ts-nocheck
// The demo HA layer behaves like HA: lamps are light / switch entities with turn_on / turn_off commands, a valve exposed as a cover moves and reports
// a cover state. “Preview” talks to them only via entity() and call(), so the real HA layer drops in without changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mockHA} from './ha.ts';

const base = () => ({areas: {kitchen: 'Kitchen'}, lights: []});

test('demo lamps: entity state comes from the plan lamps; a light / switch command changes it and wakes subscribers', async () => {
  const ha = mockHA(base()),
    plan = [
      {id: 'a', entity: 'light.kitchen_main', on: true},
      {id: 'b', entity: 'switch.relay_1', on: false},
      {id: 'c', entity: 'switch.relay_1', with: 'a', on: false},
    ];
  ha._lightsFrom(() => plan);
  let woke = 0;
  ha.onState(() => woke++);
  assert.equal(ha.entity('light.kitchen_main').state, 'on');
  assert.equal(ha.entity('switch.relay_1').state, 'off');
  assert.equal(ha.entity('light.nope'), null);
  assert.equal(await ha.call('light', 'turn_off', {entity_id: 'light.kitchen_main'}), true);
  assert.equal(plan[0].on, false);
  assert.equal(await ha.call('switch', 'turn_on', {entity_id: 'switch.relay_1'}), true);
  assert.deepEqual([plan[1].on, plan[2].on], [true, true], 'all lamps of this entity');
  assert.equal(
    await ha.call('switch', 'turn_on', {entity_id: 'light.kitchen_main'}),
    false,
    'the domain must match the entity',
  );
  assert.equal(woke, 2);
});

test('demo valve-as-cover: closes with a cover command, state closed', async () => {
  const ha = mockHA({
    ...base(),
    entities: {'cover.water_valve': {state: 'open', attributes: {current_position: 100}}},
  });
  await ha.call('cover', 'close_cover', {entity_id: 'cover.water_valve'});
  assert.equal(ha.entity('cover.water_valve').state, 'closed');
});

test('day and night follow the sun: the demo by its weather profile, no weather — always day (D-068)', () => {
  const p = {low: 3, high: 11, sunrise: '07:05', sunset: '16:40', hours: Array(24).fill('cloudy')},
    at = (h, m = 0) => {
      const d = new Date(2026, 10, 9, h, m);
      return +d;
    };
  const ha = mockHA({...base(), weather: p});
  assert.equal(ha.sunDown(at(12)), false, 'noon');
  assert.equal(ha.sunDown(at(16, 39)), false, 'a minute before sunset');
  assert.equal(ha.sunDown(at(16, 41)), true, 'after sunset');
  assert.equal(ha.sunDown(at(3)), true, 'the small hours');
  assert.equal(ha.sunDown(at(7, 6)), false, 'after sunrise');
  assert.equal(mockHA(base()).sunDown(), false);
});
