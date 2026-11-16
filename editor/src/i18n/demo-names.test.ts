// The examples' names in the UI language (D-120): the list translators work from is the examples' own, every language names
// every room, lamp, sensor, device and scene, and opening an example in a language changes its names and nothing else.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HOMES} from '../../demo/homes.ts';
import {DEMO_NAME_DICTIONARIES, demoNames, localizeDemo, translateDemo} from './demo-names.ts';
import type {DemoNamedHome} from './demo-names.ts';

const loaded: Array<{id: string; data: DemoNamedHome}> = await Promise.all(
  HOMES.map(async home => ({id: home.id, data: await home.load()})),
);
const allNames = new Set(loaded.flatMap(home => demoNames(home.data)));
const keys: Record<string, string[]> = JSON.parse(
  fs.readFileSync(new URL('./demo/keys.json', import.meta.url), 'utf8'),
);

test('demo names: keys.json lists exactly the names the examples hold (node tools/demo-names.ts writes it)', () => {
  const listed = new Set(Object.keys(keys));
  const missing = [...allNames].filter(name => !listed.has(name));
  const stale = [...listed].filter(name => !allNames.has(name));
  assert.deepEqual({missing, stale}, {missing: [], stale: []});
});

for (const [lang, dictionary] of Object.entries(DEMO_NAME_DICTIONARIES))
  test(`demo names: ${lang} names every room, lamp, sensor, device and scene of the examples`, () => {
    const missing = [...allNames].filter(name => !dictionary[name]?.trim());
    const stale = Object.keys(dictionary).filter(name => !allNames.has(name));
    assert.deepEqual(
      {missing: missing.slice(0, 10), missingCount: missing.length, stale: stale.slice(0, 10)},
      {missing: [], missingCount: 0, stale: []},
    );
  });

test('demo names: an example opened in a language has its names translated, its ids, states and units as they were', () => {
  const home: DemoNamedHome = {
    HA: {
      areas: {living: 'Living room'},
      lights: [{id: 'living_track', entity: 'light.living_track', name: 'Living room track', area: 'living'}],
      sensors: [
        {
          entity: 'sensor.room_co2',
          name: 'Room sensor CO2',
          area: 'living',
          cls: 'carbon_dioxide',
          unit: 'ppm',
        },
      ],
      entities: {'cover.blinds': {state: 'open', attributes: {current_position: 100}}},
    },
    DEMO: {rooms: [{id: 'living', name: 'Living room', polygon: []}]},
  } as unknown as DemoNamedHome;
  const original = structuredClone(home);
  const words: Record<string, string> = {
    'Living room': 'Salon',
    'Living room track': 'Rail du salon',
    'Room sensor CO2': 'Capteur CO2',
  };
  const shown = translateDemo(home, words);
  assert.equal(shown.HA.areas.living, 'Salon');
  assert.equal(shown.HA.lights[0].name, 'Rail du salon');
  assert.equal(shown.HA.lights[0].id, 'living_track');
  assert.equal(shown.HA.sensors?.[0].name, 'Capteur CO2');
  assert.equal(shown.HA.sensors?.[0].unit, 'ppm');
  assert.deepEqual(shown.HA.entities, original.HA.entities);
  assert.equal(shown.DEMO.rooms?.[0].name, 'Salon');
  assert.equal(shown.DEMO.rooms?.[0].id, 'living');
  assert.deepEqual(home, original, 'the example itself is not changed');
  assert.equal(localizeDemo(home, 'en'), home, 'English: the example as it is');
});
