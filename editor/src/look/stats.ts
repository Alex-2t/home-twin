// “Statistics” (D-049) — the general version of the 3d_floor/apartment/smart-home/web/src/stats-data.js, stats-climate.js,
// stats-health.js and stats-sections.js section. Only what Home Assistant keeps on its own for any user:
//   Climate      — long-term statistics of room sensors (mean / min / max). HA records them for every numeric sensor with a
//                  state_class — temperature, humidity and CO₂ almost always have it, kept indefinitely: week, month, year;
//   Energy       — meters from the HA “Energy” dashboard (energy/get_prefs: grid consumption and devices), increments (change) in kWh;
//   Connectivity — raw history (history_during_period): HA has no statistics of its own for unavailability, and keeps the raw
//                  history for 10 days (purge_keep_days by default), so the window is no longer — and the caption says so plainly.
// Not carried over: lights, appliances, “who is home” and doors: HA keeps no long-term statistics for on / off, 3d_floor counts
// them with counters set up by hand in the owner's home. The integration will add them (D-015) once it sets up counters itself.
// No DOM: markup is in stats-view.js. HA layer (editor/ha.js): statistics(), stateHistory(), energy(); the demo answers the same way.
import {t, N, num, dateTime} from '../i18n/i18n.ts';
import type {
  HaEnergyPrefs,
  HaLayer,
  HaStateChange,
  HaStatisticsQuery,
  HaStatisticsRow,
} from '../core/types.ts';

/** What "Statistics" reads of the HA layer; the demo layer answers the same way. */
export type StatsHa = Partial<Pick<HaLayer, 'statistics' | 'stateHistory'>>;

/** A period of the statistics screen: a number of days back, or of months. */
export interface Period {
  id: string;
  label: string;
  days?: number;
  months?: number;
}

/** A period's window: from start to end (ms), its bars by day or by month, where each bar starts. */
export interface StatsWindow {
  period: string;
  bucket: 'day' | 'month';
  start: number;
  end: number;
  starts: number[];
}

/** A row of long-term statistics as these rules read it (HA's, or the demo's): its start and whatever values it has. */
export type StatsRow = Pick<HaStatisticsRow, 'start'> & Partial<Omit<HaStatisticsRow, 'start'>>;

/** Statistics rows by statistic id; null: none fetched. */
export type StatsRows = Partial<Record<string, StatsRow[]>>;

/** A series item: its id and statistic; the energy devices carry their name and room too. */
export interface SeriesItem {
  id: string;
  statistic: string;
  group?: string;
}

/** One bar: from start to end; covered: there is data for it; its parts by group and by item, its total. */
export interface SeriesBucket {
  start: number;
  end: number;
  covered: boolean;
  parts: Record<string, number>;
  items: Record<string, number>;
  total: number;
}

/** A group of the bars (a room) and its total. */
export interface SeriesGroup {
  id: string;
  value: number;
}

/** Bars, groups and totals of a series (buildSeries); since: the first row when it is inside the window; profile: by hour of the day. */
export interface Series<Item> {
  period: string;
  bucket: 'day' | 'month';
  buckets: SeriesBucket[];
  since: number | null;
  total: number;
  days: number;
  perDay: number;
  items: Array<Item & {value: number}>;
  groups: SeriesGroup[];
  count: number;
  empty: boolean;
  profile: number[] | null;
}

/** A room's sensors for "Climate": the entity of each quantity it has. */
export interface ClimateSource {
  room: string;
  temperature?: string;
  humidity?: string;
  co2?: string;
}

type ClimateKey = 'temperature' | 'humidity' | 'co2';

/** A quantity over the period: mean, lowest and highest hourly average; comfort: the share of hours in range; over: hours above the CO₂ limit. */
export interface ClimateStat {
  mean: number;
  min: number;
  max: number;
  comfort?: number;
  over?: number;
}

/** A room's climate over the period, by quantity. */
export interface RoomClimateStats {
  room: string;
  temperature?: ClimateStat;
  humidity?: ClimateStat;
  co2?: ClimateStat;
}

/** A bar of the temperature lines: the rooms' mean temperatures. */
export interface ClimateBucket {
  start: number;
  end: number;
  covered: boolean;
  rooms: Record<string, number>;
}

/** "Climate" (buildClimate): per room, per bar, and the home's mean temperature and comfort. */
export interface ClimateStats {
  period: string;
  bucket: 'day' | 'month';
  buckets: ClimateBucket[];
  rooms: RoomClimateStats[];
  since: number | null;
  empty: boolean;
  mean: number | null;
  comfort: number | null;
}

/** A grid meter of the "Energy" dashboard. */
export interface EnergyMeter {
  id: string;
  statistic: string;
}

/** A device of the "Energy" dashboard: its name and room (null: none). */
export interface EnergyDevice {
  id: string;
  statistic: string;
  name: string;
  room: string | null;
}

/** The meters "Energy" counts (energySources). */
export interface EnergySources {
  grid: EnergyMeter[];
  devices: EnergyDevice[];
}

/** "Energy" (buildEnergy): like a series, plus what the devices account for (tracked) and the rest; grid: there is a grid meter. */
export interface EnergyStats {
  period: string;
  bucket: 'day' | 'month';
  buckets: SeriesBucket[];
  since: number | null;
  days: number;
  total: number;
  perDay: number;
  tracked: number;
  rest: number;
  grid: boolean;
  items: Array<EnergyDevice & {value: number}>;
  groups: SeriesGroup[];
  count: number;
  empty: boolean;
  profile: number[] | null;
}

/** An entity "Connectivity" follows: its name, room and device (null: none); deviceName: the device's own name. */
export interface HealthEntity {
  entity: string;
  name: string;
  room?: string | null;
  device?: string | null;
  deviceName?: string;
}

/** A change of state from the raw history: lu (or lc), seconds. */
export type HealthRow = Pick<HaStateChange, 's'> & {lu?: number; lc?: number};

/** A time an entity was unavailable (ms); first: it was so from the window's start. */
interface Outage {
  start: number;
  end: number;
  first: boolean;
}

/** An entity's (or a device's) unavailability: hours offline, how many times it dropped out, whether it answers now (null: unknown). */
export type HealthItem = HealthEntity & {offline: number; drops: number; now: boolean | null};

/** "Connectivity" (buildHealth): what dropped out, worst first; offline hours by room. */
export interface HealthStats {
  span: {start: number; end: number};
  days: number;
  items: HealthItem[];
  total: number;
  restarts: number;
  offline: number;
  rooms: Record<string, number>;
  empty: boolean;
}

export type SectionId = 'climate' | 'energy' | 'health';

/** The sources of the sections, from the model (look.ts); null or empty: no section. */
export interface StatsSources {
  climate?: ClimateSource[];
  energy?: EnergySources | null;
  health?: HealthEntity[];
}

/** A section's data (loadSection): each section has its own. */
export type SectionData = ClimateStats | EnergyStats | HealthStats;

export const PERIODS: Period[] = [
  {id: 'week', label: N('Week'), days: 7},
  {id: 'month', label: N('Month'), days: 30},
  {id: 'year', label: N('Year'), months: 12},
];
export const DAY = 864e5;
const H = 36e5;

// Period window: from midnight (or the first of the month) back to now, plus the bar starts
export function periodWindow(period: string, now = new Date()): StatsWindow {
  const spec = PERIODS.find(p => p.id === period) || PERIODS[1];
  const starts: number[] = [];
  if (spec.months) {
    for (let i = spec.months - 1; i >= 0; i--)
      starts.push(new Date(now.getFullYear(), now.getMonth() - i, 1).getTime());
    return {period: spec.id, bucket: 'month', start: starts[0], end: now.getTime(), starts};
  }
  // a period has either months or days
  for (let i = spec.days! - 1; i >= 0; i--)
    starts.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).getTime());
  return {period: spec.id, bucket: 'day', start: starts[0], end: now.getTime(), starts};
}
export const bucketEnd = (w: StatsWindow, i: number): number =>
  i + 1 < w.starts.length ? w.starts[i + 1] : w.end;

// Bars, groups and totals from increments (like buildSeries in 3d_floor). items: [{id, statistic, …}]; groupOf(item) — what
// colors a part of the bar (the room). rows: {statistic:[{start, change}]} by day (a year is summed from days), hourly —
// by hour, used for the daily profile. A negative increment is the start of a series (HA counts it from zero), not a value: skipped.
// Bars before the first row mean “no data yet”: they count neither in the sum nor in the daily average; the caption says since which day.
export function buildSeries<Item extends SeriesItem>(
  items: Item[],
  w: StatsWindow,
  rows: StatsRows | null | undefined,
  hourly: StatsRows | null = null,
  // without groupOf the groups are items' own (a series read only for its totals has none: undefined)
  {groupOf = (i: Item): string => i.group as string}: {groupOf?: (item: Item) => string} = {},
): Series<Item> {
  const buckets = w.starts.map((start, i): SeriesBucket => ({
    start,
    end: bucketEnd(w, i),
    covered: false,
    parts: {},
    items: {},
    total: 0,
  }));
  const at = (s: number): SeriesBucket | undefined => buckets.find(b => s >= b.start && s < b.end);
  let first = Infinity;
  for (const item of items) {
    const g = groupOf(item);
    for (const r of rows?.[item.statistic] || []) {
      // a row without a change (null or missing) is no data, not a zero: it does not start the series
      const change = r.change;
      if (change == null || !(change >= 0)) continue;
      const b = at(r.start);
      if (!b) continue;
      first = Math.min(first, r.start);
      b.items[item.id] = (b.items[item.id] || 0) + change;
      b.parts[g] = (b.parts[g] || 0) + change;
      b.total += change;
    }
  }
  const from = Math.max(w.start, Math.min(first, w.end));
  for (const b of buckets) b.covered = first < Infinity && b.end > from;
  const total = buckets.reduce((s, b) => s + b.total, 0);
  const days = Math.max((w.end - from) / DAY, 1 / 24); // today — by the elapsed fraction
  const totals = items
    .map(i => ({...i, value: buckets.reduce((s, b) => s + (b.items[i.id] || 0), 0)}))
    .sort((a, b) => b.value - a.value);
  const groups = [...new Set(items.map(groupOf))].map((id): SeriesGroup => ({
    id,
    value: totals.filter(i => groupOf(i) === id).reduce((s, i) => s + i.value, 0),
  }));
  return {
    period: w.period,
    bucket: w.bucket,
    buckets,
    since: first > w.start && first < Infinity ? first : null,
    total,
    days,
    perDay: total / days,
    items: totals,
    groups,
    count: items.length,
    empty: first === Infinity,
    profile: hourly && first < Infinity && items.length ? hourProfile(items, hourly, from, w.end) : null,
  };
}

// Average increment for each hour of the day, in local time: for energy — the average power in that hour, kW
export function hourProfile(
  items: SeriesItem[],
  hourly: StatsRows | null | undefined,
  start: number,
  end: number,
): number[] {
  const sums: number[] = new Array(24).fill(0);
  const n: number[] = new Array(24).fill(0);
  for (let x = new Date(start).setMinutes(0, 0, 0); x < end; x += H) n[new Date(x).getHours()]++; // the last day is partial
  for (const i of items)
    for (const r of hourly?.[i.statistic] || []) {
      // as JavaScript compares it: a null or missing change is not above 0
      const change = Number(r.change);
      if (r.start < start || !(change > 0)) continue;
      sums[new Date(r.start).getHours()] += change;
    }
  return sums.map((s, h) => (n[h] ? s / n[h] : 0));
}

// ---------- Climate ----------
// Comfort — the share of hours whose hourly average was within range; CO₂ — how many hours were above 1000 ppm (time to air out).
// Computed by hour, so there is none for a year: that is 8760 rows per sensor — too many for a dashboard.
export const COMFORT: {temperature: [number, number]; humidity: [number, number]; co2?: [number, number]} = {
  temperature: [20, 24],
  humidity: [40, 60],
};
export const CO2_LIMIT = 1000;
const KEYS: ClimateKey[] = ['temperature', 'humidity', 'co2'];
// a row with a mean
type MeanRow = StatsRow & {mean: number};
const hasMean = (r: StatsRow): r is MeanRow => Number.isFinite(r.mean);
// a source's rows of one quantity; a quantity without a sensor has none
const rowsOf = (all: StatsRows | null | undefined, id: string | undefined): StatsRow[] =>
  (id === undefined ? undefined : all?.[id]) || [];
// sources: [{room, temperature?, humidity?, co2?}] — room sensor entities, the same as in the overview
export async function loadClimate(
  ha: StatsHa | null | undefined,
  sources: ClimateSource[],
  w: StatsWindow,
): Promise<ClimateStats> {
  const ids = sources.flatMap(s => KEYS.map(k => s[k]).filter((id): id is string => Boolean(id)));
  if (!ids.length || !ha?.statistics) return buildClimate(sources, w, {}, null);
  const ask = (
    period: HaStatisticsQuery['period'],
    types: HaStatisticsQuery['types'],
  ): Promise<Record<string, HaStatisticsRow[]>> =>
    // checked above; TypeScript does not carry the check into the arrow
    ha.statistics!(ids, {start: w.start, end: w.end, period, types});
  const [rows, hourly] = await Promise.all([
    ask(w.bucket, ['mean', 'min', 'max']),
    w.bucket === 'day' ? ask('hour', ['mean']) : null,
  ]);
  return buildClimate(sources, w, rows, hourly);
}
// Per-room summary and per-bar averages. rows: {id:[{start, mean, min, max}]} on the window grid; hourly: {id:[{start, mean}]}
export function buildClimate(
  sources: ClimateSource[],
  w: StatsWindow,
  rows: StatsRows | null | undefined,
  hourly: StatsRows | null | undefined,
): ClimateStats {
  const buckets = w.starts.map((start, i): ClimateBucket => ({
    start,
    end: bucketEnd(w, i),
    covered: false,
    rooms: {},
  }));
  const at = (s: number): ClimateBucket | undefined => buckets.find(b => s >= b.start && s < b.end);
  let first = Infinity;
  const rooms = sources
    .map(s => {
      const out: RoomClimateStats = {room: s.room};
      for (const key of KEYS) {
        const list = rowsOf(rows, s[key]).filter(hasMean);
        if (!list.length) continue;
        first = Math.min(first, list[0].start);
        // the period average is by hour, if available: days with gaps do not outweigh the rest
        const hours = rowsOf(hourly, s[key]).filter(hasMean);
        const src = hours.length ? hours : list;
        // the range is by hourly averages: a one-second sensor glitch (23 → 11 → 23°) gets into the statistics min / max, but not into the hourly average
        const means = src.map(r => r.mean);
        const v: ClimateStat = {
          mean: means.reduce((a, b) => a + b, 0) / means.length,
          min: Math.min(...means),
          max: Math.max(...means),
        };
        const comfortRange = COMFORT[key];
        if (hours.length && comfortRange) {
          const [lo, hi] = comfortRange;
          v.comfort = hours.filter(r => r.mean >= lo && r.mean <= hi).length / hours.length;
        }
        if (hours.length && key === 'co2') v.over = hours.filter(r => r.mean > CO2_LIMIT).length;
        out[key] = v;
        if (key === 'temperature')
          for (const r of list) {
            const b = at(r.start);
            if (b) {
              b.rooms[s.room] = r.mean;
              b.covered = true;
            }
          }
      }
      return out;
    })
    .filter(r => r.temperature || r.humidity || r.co2);
  const warm = rooms.filter((r): r is RoomClimateStats & {temperature: ClimateStat} =>
    Boolean(r.temperature),
  );
  const cf = warm.filter(r => r.temperature.comfort != null);
  return {
    period: w.period,
    bucket: w.bucket,
    buckets,
    rooms,
    since: first > w.start && first < Infinity ? first : null,
    empty: first === Infinity,
    mean: warm.length ? warm.reduce((a, r) => a + r.temperature.mean, 0) / warm.length : null,
    // cf: the rooms with a comfort share
    comfort: cf.length ? cf.reduce((a, r) => a + r.temperature.comfort!, 0) / cf.length : null,
  };
}

// ---------- Energy ----------
// prefs — the HA “Energy” dashboard: {grid:[statistic] — grid consumption, devices:[{statistic, name?, parent?}] — devices}.
// A device already counted in another one (parent — included_in_stat) is not added twice. room(statistic) → a room or null.
// → {grid:[{id, statistic}], devices:[{id, statistic, name, room}]} or null — no meters
// A device without a name in the dashboard gets the sensor name without a trailing “Energy”: for a device entity HA writes “<device> <sensor>”
// (“Refrigerator Energy”), and in the device list the word “energy” is redundant
const ENERGY_WORD =
  /\s+(энергия|потребление|расход|energy|consumption|energie|verbrauch|énergie|consommation|energía|consumo|energia|zużycie|verbruik)$/i;
export const deviceLabel = (n: unknown): string => {
  const s = String(n || '')
    .replace(ENERGY_WORD, '')
    .trim();
  return s || String(n || '');
};
export function energySources(
  prefs: HaEnergyPrefs | null | undefined,
  {
    room = () => null,
    name = s => s,
  }: {room?: (statistic: string) => {id: string} | null; name?: (statistic: string) => string} = {},
): EnergySources | null {
  if (!prefs) return null;
  const grid = (prefs.grid || [])
    .filter(Boolean)
    .map((s, i): EnergyMeter => ({id: 'grid' + i, statistic: s}));
  const devices = (prefs.devices || [])
    .filter(d => d?.statistic && !d.parent)
    .map((d): EnergyDevice => ({
      id: d.statistic,
      statistic: d.statistic,
      name: d.name || deviceLabel(name(d.statistic)),
      room: room(d.statistic)?.id || null,
    }));
  return grid.length || devices.length ? {grid, devices} : null;
}
export async function loadEnergy(
  ha: StatsHa | null | undefined,
  src: EnergySources,
  w: StatsWindow,
): Promise<EnergyStats> {
  const ids = [...src.grid, ...src.devices].map(i => i.statistic);
  if (!ids.length || !ha?.statistics) return buildEnergy(src, w, {}, null);
  const ask = (period: HaStatisticsQuery['period']): Promise<Record<string, HaStatisticsRow[]>> =>
    // checked above; TypeScript does not carry the check into the arrow
    ha.statistics!(ids, {start: w.start, end: w.end, period, types: ['change']});
  const [rows, hourly] = await Promise.all([ask('day'), w.bucket === 'day' ? ask('hour') : null]);
  return buildEnergy(src, w, rows, hourly);
}
// A bar is grid consumption (no grid meter — the sum of devices), its parts are the device rooms and “Other”: grid minus
// devices, like “Untracked consumption” in the “Energy” dashboard. A device without a room goes into the “No room” part.
export const REST = 'rest';
export const NOROOM = 'none';
export function buildEnergy(
  src: EnergySources,
  w: StatsWindow,
  rows: StatsRows | null | undefined,
  hourly: StatsRows | null,
): EnergyStats {
  const dev = buildSeries(src.devices, w, rows, null, {groupOf: i => i.room || NOROOM});
  const grid = src.grid.length ? buildSeries(src.grid, w, rows, hourly, {groupOf: () => REST}) : null;
  const base = grid && !grid.empty ? grid : dev;
  const profile =
    grid && !grid.empty
      ? grid.profile
      : src.devices.length && hourly
        ? buildSeries(src.devices, w, rows, hourly, {groupOf: () => REST}).profile
        : null;
  const buckets = base.buckets.map((b, i): SeriesBucket => {
    const d = dev.buckets[i];
    const parts = {...d.parts};
    if (base === grid) parts[REST] = Math.max(0, b.total - d.total);
    return {
      ...b,
      covered: b.covered || d.covered,
      parts,
      total: base === grid ? Math.max(b.total, d.total) : d.total,
    };
  });
  const total = buckets.reduce((s, b) => s + b.total, 0);
  const tracked = dev.total;
  const rest = base === grid ? Math.max(0, total - tracked) : 0;
  const groups: SeriesGroup[] = [
    ...dev.groups.filter(g => g.value > 0),
    ...(base === grid ? [{id: REST, value: rest}] : []),
  ];
  return {
    period: w.period,
    bucket: w.bucket,
    buckets,
    since: base.since,
    days: base.days,
    total,
    perDay: total / base.days,
    tracked,
    rest,
    grid: base === grid,
    items: dev.items,
    groups,
    count: src.devices.length,
    empty: base.empty && dev.empty,
    profile,
  };
}

// ---------- Connectivity ----------
export const HEALTH_DAYS = 10;
export const healthWindow = (w: Pick<StatsWindow, 'start' | 'end'>): {start: number; end: number} => ({
  start: Math.max(w.start, w.end - HEALTH_DAYS * DAY),
  end: w.end,
});
// entities: [{entity, name, room?, device?}] — what is in Preview: lamps, appliances, room sensors; one entity — one row
export async function loadHealth(
  ha: StatsHa | null | undefined,
  entities: HealthEntity[],
  w: StatsWindow,
): Promise<HealthStats> {
  const span = healthWindow(w);
  if (!entities.length || !ha?.stateHistory) return buildHealth(entities, {}, span);
  return buildHealth(
    entities,
    await ha.stateHistory(
      entities.map(e => e.entity),
      span,
    ),
    span,
  );
}
// An HA restart makes everything unavailable for a minute at once — that is not a device dropping out. A minute in which a noticeable
// share of devices dropped out is a restart; short dropouts that started near it are not counted.
const RESTART_SHARE = 0.3;
const RESTART_NEAR = 9e4;
const RESTART_LONGEST = 15 * 6e4;
// Hours and occurrences of unavailability per device. history: {entity:[{s, lu | lc}]} — time in seconds, as HA returns it
export function buildHealth(
  entities: HealthEntity[],
  history: Partial<Record<string, HealthRow[]>> | null | undefined,
  span: {start: number; end: number},
): HealthStats {
  const outages = new Map<string, {list: Outage[]; now: boolean | null}>();
  for (const e of entities) {
    const list: Outage[] = [];
    let prev: {down: boolean; s: string} | null = null;
    for (const r of history?.[e.entity] || []) {
      // as JavaScript multiplies it: a row with neither time is not a number
      const x = Math.max(span.start, Number(r.lu ?? r.lc) * 1e3);
      const down = r.s === 'unavailable';
      if (down && (!prev || !prev.down)) list.push({start: x, end: span.end, first: !prev});
      // list is not empty: checked here
      else if (!down && prev?.down && list.length) list.at(-1)!.end = x;
      prev = {down, s: r.s};
    }
    outages.set(e.entity, {list, now: prev?.s == null ? null : !prev.down});
  }
  const minutes = new Map<number, number>();
  for (const {list} of outages.values())
    for (const o of list)
      if (!o.first) {
        const m = Math.floor(o.start / 6e4);
        minutes.set(m, (minutes.get(m) || 0) + 1);
      }
  const burst = Math.max(5, entities.length * RESTART_SHARE);
  const restarts = [...minutes].filter(([, n]) => n >= burst).map(([m]) => m * 6e4);
  const restart = (o: Outage): boolean =>
    o.end - o.start < RESTART_LONGEST && restarts.some(x => Math.abs(o.start - x) <= RESTART_NEAR);
  const items = entities.map((e): HealthItem => {
    // every entity got its outages above
    const {list, now} = outages.get(e.entity)!;
    const real = list.filter(o => !restart(o));
    return {
      ...e,
      offline: real.reduce((s, o) => s + o.end - o.start, 0) / H,
      drops: real.filter(o => !o.first).length,
      now,
    };
  });
  // several entities of one device drop out together: one row with the device name, hours — the largest, not the sum.
  // No device name — the common start of the entity names (“Bathroom sensor Temperature” and “… Humidity” → “Bathroom sensor”)
  const merged = new Map<string, HealthItem>();
  for (const i of items) {
    const key = i.device || i.entity;
    const p = merged.get(key);
    if (!p) {
      merged.set(key, i);
      continue;
    }
    merged.set(key, {
      ...p,
      name: p.deviceName || commonStart(p.name, i.name) || p.name,
      room: p.room || i.room,
      offline: Math.max(p.offline, i.offline),
      drops: Math.max(p.drops, i.drops),
      now: p.now === false || i.now === false ? false : (p.now ?? i.now),
    });
  }
  const bad = [...merged.values()]
    .filter(i => i.offline >= 0.05 || i.drops)
    .sort((a, b) => b.offline - a.offline || b.drops - a.drops);
  const rooms: Record<string, number> = {};
  for (const i of bad) if (i.room) rooms[i.room] = (rooms[i.room] || 0) + i.offline;
  return {
    span,
    days: (span.end - span.start) / DAY,
    items: bad,
    total: merged.size,
    restarts: restarts.length,
    offline: bad.reduce((s, i) => s + i.offline, 0),
    rooms,
    empty: !merged.size,
  };
}

function commonStart(a: unknown, b: unknown): string {
  const x = String(a).split(/\s+/);
  const y = String(b).split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < Math.min(x.length, y.length) && x[i] === y[i]; i++) out.push(x[i]);
  return out.join(' ');
}

// ---------- Sections ----------
export const SECTIONS: Array<{id: SectionId; label: string; icon: string}> = [
  {id: 'climate', label: N('Climate'), icon: 'thermometer'},
  {id: 'energy', label: N('Energy'), icon: 'bolt'},
  {id: 'health', label: N('Connectivity'), icon: 'wifi'},
];
// src: {climate, energy, health} — sources from the model; null / empty — no section
export function availableSections(src: StatsSources): SectionId[] {
  return SECTIONS.map(s => s.id).filter(id =>
    id === 'climate' ? src.climate?.length : id === 'energy' ? !!src.energy : src.health?.length,
  );
}
export function loadSection(
  id: string,
  ha: StatsHa | null | undefined,
  src: StatsSources,
  period: string,
  now = new Date(),
): Promise<SectionData> {
  const w = periodWindow(period, now);
  if (id === 'climate') return loadClimate(ha, src.climate || [], w);
  if (id === 'energy') return loadEnergy(ha, src.energy || {grid: [], devices: []}, w);
  if (id === 'health') return loadHealth(ha, src.health || [], w);
  return Promise.reject(new Error('unknown stats section ' + id));
}

// The number above a room on the model: climate — average temperature, energy — device kWh, connectivity — hours offline
// data is the section's own (loadSection), so each branch reads it in its section's shape
export function sectionMap(
  id: string,
  data: SectionData | null | undefined,
): Record<string, {label: string}> {
  const out: Record<string, {label: string}> = {};
  if (!data) return out;
  const fill = (values: Record<string, number>, label: (value: number) => string): void => {
    for (const [room, v] of Object.entries(values)) if (v > 0) out[room] = {label: label(v)};
  };
  if (id === 'climate') {
    for (const r of (data as ClimateStats).rooms)
      if (r.temperature) out[r.room] = {label: formatNumber(r.temperature.mean) + '°'};
  } else if (id === 'energy')
    fill(
      Object.fromEntries(
        (data as EnergyStats).groups.filter(g => g.id !== REST && g.id !== NOROOM).map(g => [g.id, g.value]),
      ),
      formatEnergy,
    );
  else if (id === 'health') fill((data as HealthStats).rooms, formatHours);
  return out;
}
// A section tile in the overview: one number and a caption
// data is the section's own, as in sectionMap
export function sectionTile(
  id: string,
  data: SectionData | null | undefined,
): {value: string; sub: string} | null {
  if (!data || data.empty) return null;
  if (id === 'climate') {
    const climate = data as ClimateStats;
    return climate.mean == null
      ? null
      : {
          value: formatNumber(climate.mean) + '°',
          sub:
            climate.comfort != null ? t('comfort {0}%', Math.round(climate.comfort * 100)) : t('on average'),
        };
  }
  if (id === 'energy') return {value: formatEnergy((data as EnergyStats).perDay), sub: t('per day')};
  if (id === 'health') {
    const n = (data as HealthStats).items.filter(i => i.offline >= 0.5).length;
    return n
      ? {value: String(n), sub: t('{0, plural, one {device dropped out} other {devices dropped out}}', n)}
      : {value: '✓', sub: t('all online')};
  }
  return null;
}

// ---------- Captions ----------
const thin = (s: string): string => s.replace(/ /g, ' ');
const fmt = (v: number, d: number): string => num(Number(v.toFixed(d)), d, {grouping: 'auto'});
// human-readable hours: 0.4 h · 12 h · 1,234 h
export function formatHours(h: number): string {
  if (!(h >= 0.05)) return '0 ' + t('h');
  return (h < 10 ? fmt(h, 1) : thin(num(Math.round(h), 0, {grouping: 'auto'}))) + ' ' + t('h');
}
// number: 21.6 · 8.8; from a hundred up and with digits = 0 — an integer with digit grouping
export function formatNumber(v: number, d = 1): string {
  if (!Number.isFinite(v)) return '—';
  return Math.abs(v) < 100 && d ? fmt(v, d) : thin(num(Math.round(v), 0, {grouping: 'auto'}));
}
// energy: 0.8 kWh · 12 kWh · 1,234 kWh
export function formatEnergy(k: number): string {
  if (!(k >= 0.05)) return '0 ' + t('kWh');
  return (k < 10 ? fmt(k, 1) : thin(num(Math.round(k), 0, {grouping: 'auto'}))) + ' ' + t('kWh');
}
export const formatPower = (k: number): string =>
  (k < 10 ? fmt(k, k < 1 ? 2 : 1) : formatNumber(k, 0)) + ' ' + t('kW');
const dt = (o: Intl.DateTimeFormatOptions, x: number): string => dateTime(new Date(x), o);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
// under a bar: weekday for a week, day of month for a month, month for a year
export const bucketLabel = (start: number, bucket: string, period: string): string =>
  bucket === 'month'
    ? dt({month: 'short'}, start).replace(/\.$/, '')
    : period === 'week'
      ? dt({weekday: 'short'}, start)
      : String(new Date(start).getDate());
// the bar's full date for the tooltip
export const bucketTitle = (start: number, bucket: string): string =>
  cap(
    bucket === 'month'
      ? dt({month: 'long', year: 'numeric'}, start)
      : dt({weekday: 'short', day: 'numeric', month: 'long'}, start),
  );
// window title: “last 7 days”, “last 30 days”, “last 12 months” — or “since October 22” if there is less data
export function periodCaption(s: {since: number | null; period: string}): string {
  if (s.since != null) return t('since {0}', dt({day: 'numeric', month: 'long'}, s.since));
  return s.period === 'week'
    ? t('last 7 days')
    : s.period === 'year'
      ? t('last 12 months')
      : t('last 30 days');
}
