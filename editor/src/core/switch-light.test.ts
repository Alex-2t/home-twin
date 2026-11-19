// The Lights list puts the switches that look like lights first and folds the rest (switch-light.ts).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {switchLightScore} from './switch-light.ts';

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
