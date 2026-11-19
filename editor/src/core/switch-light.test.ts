// The Lights list puts the switches that look like lights first and folds the rest (switch-light.ts).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isSwitchBacklight, switchLightScore} from './switch-light.ts';

test('switch names: a light relay in each language comes first', () => {
  const lights = [
    'Основной свет', // allow-cyrillic
    'Подсветка столешницы', // allow-cyrillic
    'Свет гардероба · Юля', // allow-cyrillic
    'Бра над кроватью', // allow-cyrillic
    'Decorative Lights',
    'Hall lamp',
    'LED strip',
    'Deckenlicht',
    'Lumière du salon',
    'Luz de la cocina',
    'Luce camera',
    'Woonkamer verlichting',
    'Światło w kuchni',
    'Lâmpada da sala',
    '客厅灯',
  ];
  for (const name of lights) assert.equal(switchLightScore(name), 1, name);
});

test('switch names: an air conditioner, a socket or a sensor is folded, even with "light" in it', () => {
  const others = [
    'Кондиционер Light Sensor', // allow-cyrillic
    'Кондиционер Lights', // allow-cyrillic
    'Розетка · у кровати', // allow-cyrillic
    'Реле котла', // allow-cyrillic
    'Шторы · правые Reverse direction', // allow-cyrillic
    'Термостат батареи Smart temperature control', // allow-cyrillic
    'Вытяжка и телевизор', // allow-cyrillic
    'Полотенцесушитель', // allow-cyrillic
    'Towel warmer',
    'Coffee machine',
    'Kettle',
    'Humidifier plug',
  ];
  for (const name of others) assert.equal(switchLightScore(name), -1, name);
});

test('switch names: a relay named by its make or channel is neither', () => {
  const neither = [
    'Реле 4-канальное', // allow-cyrillic
    'Sonoff Basic',
    'Switch 2',
  ];
  for (const name of neither) assert.equal(switchLightScore(name), 0, name);
});

test("a wall switch's backlight: a light of a relay's device, only on and off, with effects", () => {
  const effects = ['Night Light', 'Party'];
  // a Sonoff T5 through SonoffLAN: light.… is the panel's glow, switch.…_1 the relay of the room's light
  assert.equal(isSwitchBacklight(['onoff'], effects, true), true);
  // a light on a channel of a relay device (a Shelly with one channel set as a light): no effects
  assert.equal(isSwitchBacklight(['onoff'], undefined, true), false);
  assert.equal(isSwitchBacklight(['onoff'], [], true), false);
  // a dimmable light with effects is a lamp (an LED strip controller with a relay)
  assert.equal(isSwitchBacklight(['brightness'], effects, true), false);
  assert.equal(isSwitchBacklight(['onoff', 'hs'], effects, true), false);
  // no relay on its device: a lamp
  assert.equal(isSwitchBacklight(['onoff'], effects, false), false);
  assert.equal(isSwitchBacklight(undefined, effects, true), false);
});
