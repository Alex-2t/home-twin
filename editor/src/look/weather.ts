// Weather in the “Whole home” header — as in 3d_floor/apartment/smart-home/web/src/weather.js (D-049): to the right of the title
// an icon, temperature and condition, below it a forecast strip — “now”, then every 2 hours, and sunrise or sunset if it
// falls within those hours. Difference: the source is not Open-Meteo by coordinates as in 3d_floor, but the weather from HA (HA layer: weather()) —
// any home, no extra outside requests. The condition follows HA conditions (sunny, partlycloudy…), not WMO codes.
// No DOM: look.js lays out the markup.
import {t, N, clock} from '../i18n/i18n.ts';
import type {HaWeather} from '../core/types.ts';

/** The weather as these rules read it: the HA layer's weather(), any part but the condition may be missing. */
export type WeatherInput = Pick<HaWeather, 'condition'> &
  Partial<Pick<HaWeather, 'temperature' | 'feels' | 'hourly' | 'sunrise' | 'sunset'>>;

/** The weather now: the temperature and feels-like (°), the caption and the icon. */
export interface WeatherNow {
  temperature: number;
  feels: number | null;
  label: string;
  icon: string;
}

/** A cell of the forecast strip: now, an hour, or a sunrise or sunset between them; at: when (ms). */
export interface ForecastSlot {
  kind: 'now' | 'hour' | 'sunrise' | 'sunset';
  at?: number;
  label: string;
  temperature?: string;
  text?: string;
  icon: string;
}

// a number that is not NaN or infinite
const finite = (v: unknown): v is number => Number.isFinite(v);

// HA condition (weather.*: state, and condition in the forecast) → the card's caption and icon; at night the moon replaces the sun
const COND: Record<string, [string, string, string]> = {
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
export function weatherCondition(condition: string, isDay = true): {label: string; icon: string} {
  const c = COND[condition];
  return c ? {label: t(c[0]), icon: isDay ? c[1] : c[2]} : {label: t('Weather'), icon: 'unknown'};
}

// day or night at moment at — by the nearest sunrise and sunset (in HA — sun.sun: next_rising, next_setting).
// The forecast covers half a day ahead, so one cycle is enough; no data — day.
export function isDay(
  at: number,
  {sunrise, sunset}: {sunrise?: number | null; sunset?: number | null} = {},
): boolean {
  if (!finite(sunrise) || !finite(sunset)) return true;
  return sunset < sunrise ? at < sunset || at >= sunrise : at >= sunrise && at < sunset;
}

export const degrees = (value: number): string =>
  `${Math.round(value) === 0 ? 0 : Math.round(value)}°`.replace('-', '−');

// Weather now: {temperature, feels, label, icon} or null — HA has no weather or it is unavailable.
// w — from the HA layer: {condition, temperature, feels, hourly:[{at, condition, temperature}], sunrise, sunset}
export function weatherNow(w: WeatherInput | null | undefined, now = Date.now()): WeatherNow | null {
  if (!w || !finite(w.temperature)) return null;
  return {
    temperature: w.temperature,
    feels: finite(w.feels) ? w.feels : null,
    ...weatherCondition(w.condition, isDay(now, w)),
  };
}

/**
 * Forecast strip: “now”, then every step hours, and between them sunrise or sunset if it falls within that
 * interval. count cells in total; no hourly forecast — no strip.
 */
export function forecastSlots(
  w: WeatherInput | null | undefined,
  now = Date.now(),
  {count = 6, step = 2}: {count?: number; step?: number} = {},
): ForecastSlot[] {
  const cur = weatherNow(w, now);
  // no weather: no weather now either
  if (!cur || !w) return [];
  const hours = (w.hourly || [])
    .filter(h => h.at > now && Number.isFinite(h.temperature))
    .filter((_, i) => i % step === 0)
    .slice(0, count - 1);
  if (!hours.length) return [];
  // not empty: checked above
  const last = hours.at(-1)!.at;
  const sunTimes: Array<['sunrise' | 'sunset', number | null | undefined]> = [
    ['sunrise', w.sunrise],
    ['sunset', w.sunset],
  ];
  const sun = sunTimes
    .filter(
      (time): time is ['sunrise' | 'sunset', number] => finite(time[1]) && time[1] > now && time[1] < last,
    )
    .sort((a, b) => a[1] - b[1])
    .slice(0, 1)
    .map(([kind, at]): ForecastSlot & {at: number} => ({
      kind,
      at,
      label: clock(at),
      text: kind === 'sunset' ? t('sunset') : t('sunrise'),
      icon: kind,
    }));
  const rest = [
    ...hours.map((h): ForecastSlot & {at: number} => ({
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
