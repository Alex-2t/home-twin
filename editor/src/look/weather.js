// Weather in the “Whole home” header — as in 3d_floor/apartment/smart-home/web/src/weather.js (D-049): to the right of the title
// an icon, temperature and condition, below it a forecast strip — “now”, then every 2 hours, and sunrise or sunset if it
// falls within those hours. Difference: the source is not Open-Meteo by coordinates as in 3d_floor, but the weather from HA (HA layer: weather()) —
// any home, no extra outside requests. The condition follows HA conditions (sunny, partlycloudy…), not WMO codes.
// No DOM: look.js lays out the markup.
import {t, N, clock} from '../i18n/i18n.js';

// HA condition (weather.*: state, and condition in the forecast) → the card's caption and icon; at night the moon replaces the sun
const COND = {
  sunny: [N('Clear'), 'sun', 'moon'],
  'clear-night': [N('Clear'), 'moon', 'moon'],
  partlycloudy: [N('Partly cloudy'), 'partly', 'moon-cloud'],
  cloudy: [N('Cloudy'), 'cloud', 'cloud'],
  fog: [N('Fog'), 'fog', 'fog'],
  rainy: [N('Rain'), 'rain', 'rain'],
  pouring: [N('Downpour'), 'rain', 'rain'],
  snowy: [N('Snow'), 'snow', 'snow'],
  'snowy-rainy': [N('Sleet'), 'snow', 'snow'],
  hail: [N('Hail'), 'snow', 'snow'],
  lightning: [N('Thunderstorm'), 'storm', 'storm'],
  'lightning-rainy': [N('Thunderstorm'), 'storm', 'storm'],
  windy: [N('Windy'), 'wind', 'wind'],
  'windy-variant': [N('Windy'), 'wind', 'wind'],
};
export function weatherCondition(condition, isDay = true) {
  const c = COND[condition];
  return c ? {label: t(c[0]), icon: isDay ? c[1] : c[2]} : {label: t('Weather'), icon: 'unknown'};
}

// day or night at moment at — by the nearest sunrise and sunset (in HA — sun.sun: next_rising, next_setting).
// The forecast covers half a day ahead, so one cycle is enough; no data — day.
export function isDay(at, {sunrise, sunset} = {}) {
  if (!Number.isFinite(sunrise) || !Number.isFinite(sunset)) return true;
  return sunset < sunrise ? at < sunset || at >= sunrise : at >= sunrise && at < sunset;
}

export const degrees = value => `${Math.round(value) === 0 ? 0 : Math.round(value)}°`.replace('-', '−');

// Weather now: {temperature, feels, label, icon} or null — HA has no weather or it is unavailable.
// w — from the HA layer: {condition, temperature, feels, hourly:[{at, condition, temperature}], sunrise, sunset}
export function weatherNow(w, now = Date.now()) {
  if (!w || !Number.isFinite(w.temperature)) return null;
  return {
    temperature: w.temperature,
    feels: Number.isFinite(w.feels) ? w.feels : null,
    ...weatherCondition(w.condition, isDay(now, w)),
  };
}

/**
 * Forecast strip: “now”, then every step hours, and between them sunrise or sunset if it falls within that
 * interval. count cells in total; no hourly forecast — no strip.
 */
export function forecastSlots(w, now = Date.now(), {count = 6, step = 2} = {}) {
  const cur = weatherNow(w, now);
  if (!cur) return [];
  const hours = (w.hourly || [])
    .filter(h => h.at > now && Number.isFinite(h.temperature))
    .filter((_, i) => i % step === 0)
    .slice(0, count - 1);
  if (!hours.length) return [];
  const last = hours.at(-1).at;
  const sun = [
    ['sunrise', w.sunrise],
    ['sunset', w.sunset],
  ]
    .filter(([, at]) => Number.isFinite(at) && at > now && at < last)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 1)
    .map(([kind, at]) => ({
      kind,
      at,
      label: clock(at),
      text: kind === 'sunset' ? t('sunset') : t('sunrise'),
      icon: kind,
    }));
  const rest = [
    ...hours.map(h => ({
      kind: 'hour',
      at: h.at,
      label: clock(h.at),
      temperature: degrees(h.temperature),
      icon: weatherCondition(h.condition, isDay(h.at, w)).icon,
    })),
    ...sun,
  ]
    .sort((a, b) => a.at - b.at)
    .slice(0, count - 1);
  return [{kind: 'now', label: t('Now'), temperature: degrees(cur.temperature), icon: cur.icon}, ...rest];
}
