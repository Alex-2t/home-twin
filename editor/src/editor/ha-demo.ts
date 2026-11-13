// HA demo layer: long-term statistics and raw history — in the form Home Assistant returns them, deterministically
// (the same date — the same bar). Preview reads them the same way as in HA (look/stats.js).
import type {DemoStats, HaSensor, HaStateChange, HaStatisticsQuery, HaStatisticsRow} from '../core/types.ts';

/** What the demo statistics read of a sensor: its entity and class; an energy meter's daily kWh and the day's shape. */
export type StatSensor = Pick<HaSensor, 'entity' | 'cls' | 'daily' | 'shape'>;

/** The day's curve of an energy meter (HaSensor shape). */
type DayShape = NonNullable<HaSensor['shape']>;

const H = 36e5;
const DAY = 864e5;
// noise 0…1 from the key and the day number
export function noise(key: string, n: number): number {
  let h = 2166136261;
  for (const c of key + ':' + n) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1e4) / 1e4;
}
const season = (x: number): number => Math.cos(((new Date(x).getMonth() + 0.5) / 12) * 2 * Math.PI); // 1 — January, −1 — July
// sensor reading at moment x: the current value with a daily cycle, season and day-to-day spread, by sensor kind
function reading(s: StatSensor, v: number, x: number, now: number): number {
  const d = new Date(x);
  const hr = d.getHours() + d.getMinutes() / 60;
  const day = Math.floor(x / DAY);
  const sn = season(x) - season(now);
  const k = s.entity;
  if (s.cls === 'temperature')
    return v - 0.9 * sn + 0.7 * Math.sin(((hr - 9) / 24) * 2 * Math.PI) + (noise(k, day) - 0.5) * 1.2;
  if (s.cls === 'humidity')
    return v + 6 * sn + 4 * Math.sin(((hr - 3) / 24) * 2 * Math.PI) + (noise(k, day) - 0.5) * 8;
  if (s.cls === 'carbon_dioxide')
    return Math.max(
      420,
      v * 0.85 + v * 0.3 * Math.cos(((hr - 6) / 24) * 2 * Math.PI) + (noise(k, day) - 0.5) * v * 0.3,
    );
  return v * (1 + 0.05 * Math.sin((hr / 24) * 2 * Math.PI) + (noise(k, day) - 0.5) * 0.1);
}
// daily shares for energy meters
const SHAPES: Record<DayShape, number[]> = {
  flat: new Array(24).fill(1),
  home: [
    0.5, 0.4, 0.35, 0.35, 0.35, 0.4, 0.7, 1.3, 1.4, 1, 0.8, 0.8, 0.9, 0.85, 0.8, 0.85, 1, 1.3, 1.7, 1.9, 1.8,
    1.5, 1.1, 0.7,
  ],
  day: [0, 0, 0, 0, 0, 0, 0, 0.1, 0.4, 1, 1.4, 1.5, 1.4, 1.2, 1, 0.8, 0.5, 0.3, 0.2, 0.1, 0, 0, 0, 0],
  evening: [
    0.1, 0, 0, 0, 0, 0, 0, 0.2, 0.3, 0.2, 0.2, 0.2, 0.3, 0.3, 0.3, 0.4, 0.6, 0.9, 1.4, 1.8, 1.9, 1.6, 1, 0.4,
  ],
};
// energy meter increment for hour x: daily — kWh per day, more in winter, more noticeable on weekends
// Called only for a meter with daily > 0 (demoStatistics checks).
function consumed(s: StatSensor, x: number): number {
  const d = new Date(x);
  const w = (s.shape && SHAPES[s.shape]) || SHAPES.home;
  const sum = w.reduce((a, b) => a + b, 0);
  const day = Math.floor(x / DAY);
  return (
    ((s.daily! * w[d.getHours()]) / sum) *
    (1 + 0.18 * season(x)) *
    ([0, 6].includes(d.getDay()) ? 1.15 : 1) *
    (0.75 + 0.5 * noise(s.entity, day))
  );
}

// recorder/statistics_during_period: ids — sensor entities, period — hour | day | month, types — mean / min / max / change.
// Numeric sensors — means, energy meters (cls energy, daily) — increments. Data starts at since; the current hour is not compiled yet.
export function demoStatistics(
  sensors: StatSensor[],
  state: (entity: string) => number | null,
  ids: string[],
  {
    start,
    end,
    period = 'hour',
    types = ['mean'],
  }: Pick<HaStatisticsQuery, 'start' | 'end'> & Partial<Pick<HaStatisticsQuery, 'period' | 'types'>>,
  {since = 0, now = Date.now()}: {since?: number; now?: number} = {},
): Record<string, HaStatisticsRow[]> {
  const out: Record<string, HaStatisticsRow[]> = {};
  const last = Math.min(end, Math.floor(now / H) * H);
  const from = Math.max(start, since);
  const step = (x: number, dir = 1): number => {
    const d = new Date(x);
    if (period === 'month') d.setMonth(d.getMonth() + dir);
    else if (period === 'day') d.setDate(d.getDate() + dir);
    else return x + H * dir;
    return d.getTime();
  };
  const floor = (x: number): number => {
    const d = new Date(x);
    d.setMinutes(0, 0, 0);
    if (period !== 'hour') d.setHours(0);
    if (period === 'month') d.setDate(1);
    return d.getTime();
  };
  for (const id of ids) {
    const s = sensors.find(x => x.entity === id);
    const v = state(id);
    // a missing daily compares as 0: not above 0, as undefined did
    if (!s || (s.cls === 'energy' ? !((s.daily ?? 0) > 0) : v == null)) continue;
    const rows: HaStatisticsRow[] = [];
    for (let a = floor(Math.max(start, from)); a < last; a = step(a)) {
      const b = step(a);
      const hrs: number[] = [];
      for (let x = Math.max(a, from); x < Math.min(b, last); x += H) hrs.push(x);
      if (!hrs.length) continue;
      const r: HaStatisticsRow = {start: a, end: b};
      if (s.cls === 'energy') {
        if (types.includes('change')) r.change = +hrs.reduce((t, x) => t + consumed(s, x), 0).toFixed(3);
      } else {
        // not an energy meter: the check above made sure it has a reading
        const m = hrs.map(x => reading(s, v!, x + H / 2, now));
        if (types.includes('mean')) r.mean = +(m.reduce((t, y) => t + y, 0) / m.length).toFixed(2);
        if (types.includes('min')) r.min = +Math.min(...m).toFixed(2);
        if (types.includes('max')) r.max = +Math.max(...m).toFixed(2);
      }
      rows.push(r);
    }
    if (rows.length) out[id] = rows;
  }
  return out;
}

// history/history_during_period (minimal_response, no_attributes): {entity:[{s, lu — seconds}]}. outages: {entity:{hours, drops}} —
// who dropped out; restart — the HA restart time: everything is unavailable for a minute (statistics do not count its minutes).
/** What the demo's raw history needs besides the range: who dropped out, when HA restarted, an entity's state now. */
export interface DemoHistoryOptions {
  outages?: DemoStats['outages'];
  restart?: number | null;
  state?: (entity: string) => string | null | undefined;
}

export function demoStateHistory(
  ids: string[],
  {start, end}: {start: number; end: number},
  {outages = {}, restart = null, state = () => 'on'}: DemoHistoryOptions = {},
): Record<string, HaStateChange[]> {
  const out: Record<string, HaStateChange[]> = {};
  for (const e of ids) {
    const s = state(e) || 'on';
    const rows: HaStateChange[] = [{s, lu: start / 1e3}];
    const o = outages[e];
    const marks: Array<[number, number]> = [];
    if (o) {
      const n = Math.max(1, o.drops);
      const each = (o.hours / n) * H;
      const gap = (end - start) / n;
      for (let i = 0; i < n; i++) {
        const x = start + gap * (i + 0.35 + 0.3 * noise(e, i));
        marks.push([x, x + each]);
      }
    }
    // null compares as 0, before any range asked for: no restart mark
    const restartAt = restart as number;
    if (restartAt > start && restartAt < end) marks.push([restartAt, restartAt + 50e3]);
    for (const [a, b] of marks.sort((p, q) => p[0] - q[0]))
      if (b < end && a > rows.at(-1)!.lu * 1e3) rows.push({s: 'unavailable', lu: a / 1e3}, {s, lu: b / 1e3});
    out[e] = rows;
  }
  return out;
}
