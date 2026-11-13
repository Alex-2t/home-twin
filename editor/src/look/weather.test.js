import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherCondition, isDay, weatherNow, forecastSlots, degrees} from './weather.js';
import {demoWeather} from '../editor/ha.js';

const H = 3600e3,
  now = Date.UTC(2026, 10, 8, 12, 30);
const hourly = n =>
  Array.from({length: n}, (_, i) => ({
    at: now + (i + 1) * H - 30 * 60e3,
    condition: 'cloudy',
    temperature: 8 - i * 0.4,
  }));

test('HA conditions: caption and icon, the moon at night; unknown — no icon', () => {
  assert.deepEqual(weatherCondition('sunny'), {label: 'Clear', icon: 'sun'});
  assert.equal(weatherCondition('sunny', false).icon, 'moon');
  assert.equal(weatherCondition('partlycloudy', false).icon, 'moon-cloud');
  assert.equal(weatherCondition('clear-night').icon, 'moon');
  assert.equal(weatherCondition('pouring').label, 'Downpour');
  assert.deepEqual(weatherCondition('exceptional'), {label: 'Weather', icon: 'unknown'});
});

test('day and night by the nearest sunrise and sunset', () => {
  const day = {sunrise: now + 20 * H, sunset: now + 4 * H}; // sunset before sunrise — it is day now
  assert.equal(isDay(now, day), true);
  assert.equal(isDay(now + 5 * H, day), false);
  assert.equal(isDay(now + 21 * H, day), true);
  const night = {sunrise: now + 6 * H, sunset: now + 16 * H}; // sunrise before sunset — it is night now
  assert.equal(isDay(now, night), false);
  assert.equal(isDay(now + 7 * H, night), true);
  assert.equal(isDay(now + 17 * H, night), false);
  assert.equal(isDay(now, {}), true, 'no sun data — day');
});

test('weather now: no weather or temperature — no block', () => {
  assert.equal(weatherNow(null), null);
  assert.equal(weatherNow({condition: 'sunny'}), null);
  assert.deepEqual(weatherNow({condition: 'rainy', temperature: 7.4, feels: 5}, now), {
    temperature: 7.4,
    feels: 5,
    label: 'Rain',
    icon: 'rain',
  });
  assert.equal(weatherNow({condition: 'rainy', temperature: 7}).feels, null);
});

test('forecast strip: “now”, every 2 hours, sunset in its place; no forecast — empty', () => {
  const w = {
    condition: 'sunny',
    temperature: 9.6,
    hourly: hourly(24),
    sunset: now + 3.2 * H,
    sunrise: now + 19 * H,
  };
  const s = forecastSlots(w, now);
  assert.equal(s.length, 6);
  assert.deepEqual(
    s.map(x => x.kind),
    ['now', 'hour', 'hour', 'sunset', 'hour', 'hour'],
  );
  assert.equal(s[0].temperature, '10°');
  assert.equal(s[0].icon, 'sun');
  assert.equal(s[3].text, 'sunset');
  assert.ok(
    s.slice(1).every((x, i, a) => !i || a[i - 1].at < x.at),
    'by time',
  );
  assert.deepEqual(forecastSlots({condition: 'sunny', temperature: 3, hourly: []}, now), []);
  assert.deepEqual(forecastSlots(null, now), []);
});

test('degrees: typographic minus, no “−0”', () => {
  assert.equal(degrees(-3.4), '−3°');
  assert.equal(degrees(-0.3), '0°');
  assert.equal(degrees(12.5), '13°');
});

test('demo weather: forecast two days ahead, sunrise and sunset — the nearest', () => {
  const p = {low: 3, high: 11, sunrise: '07:05', sunset: '16:40', hours: Array(24).fill('cloudy')};
  const w = demoWeather(p, now);
  assert.equal(w.hourly.length, 48);
  assert.ok(w.hourly.every(h => h.at > now));
  assert.ok(w.temperature >= 3 && w.temperature <= 11);
  assert.ok(w.sunrise > now && w.sunrise - now <= 24 * H);
  assert.ok(w.sunset > now && w.sunset - now <= 24 * H);
  assert.equal(forecastSlots(w, now).length, 6);
});
