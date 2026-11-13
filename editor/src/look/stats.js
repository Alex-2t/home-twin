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
import {t, N, num, dateTime} from '../i18n/i18n.js';

export const PERIODS = [
  {id: 'week', label: N('Week'), days: 7},
  {id: 'month', label: N('Month'), days: 30},
  {id: 'year', label: N('Year'), months: 12},
];
export const DAY = 864e5;
const H = 36e5;

// Period window: from midnight (or the first of the month) back to now, plus the bar starts
export function periodWindow(period, now = new Date()) {
  const spec = PERIODS.find(p => p.id === period) || PERIODS[1],
    starts = [];
  if (spec.months) {
    for (let i = spec.months - 1; i >= 0; i--)
      starts.push(new Date(now.getFullYear(), now.getMonth() - i, 1).getTime());
    return {period: spec.id, bucket: 'month', start: starts[0], end: now.getTime(), starts};
  }
  for (let i = spec.days - 1; i >= 0; i--)
    starts.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).getTime());
  return {period: spec.id, bucket: 'day', start: starts[0], end: now.getTime(), starts};
}
export const bucketEnd = (w, i) => (i + 1 < w.starts.length ? w.starts[i + 1] : w.end);

// Bars, groups and totals from increments (like buildSeries in 3d_floor). items: [{id, statistic, …}]; groupOf(item) — what
// colors a part of the bar (the room). rows: {statistic:[{start, change}]} by day (a year is summed from days), hourly —
// by hour, used for the daily profile. A negative increment is the start of a series (HA counts it from zero), not a value: skipped.
// Bars before the first row mean “no data yet”: they count neither in the sum nor in the daily average; the caption says since which day.
export function buildSeries(items, w, rows, hourly = null, {groupOf = i => i.group} = {}) {
  const buckets = w.starts.map((start, i) => ({
    start,
    end: bucketEnd(w, i),
    covered: false,
    parts: {},
    items: {},
    total: 0,
  }));
  const at = s => buckets.find(b => s >= b.start && s < b.end);
  let first = Infinity;
  for (const item of items) {
    const g = groupOf(item);
    for (const r of rows?.[item.statistic] || []) {
      if (!(r.change >= 0)) continue;
      const b = at(r.start);
      if (!b) continue;
      first = Math.min(first, r.start);
      b.items[item.id] = (b.items[item.id] || 0) + r.change;
      b.parts[g] = (b.parts[g] || 0) + r.change;
      b.total += r.change;
    }
  }
  const from = Math.max(w.start, Math.min(first, w.end));
  for (const b of buckets) b.covered = first < Infinity && b.end > from;
  const total = buckets.reduce((s, b) => s + b.total, 0),
    days = Math.max((w.end - from) / DAY, 1 / 24); // today — by the elapsed fraction
  const totals = items
    .map(i => ({...i, value: buckets.reduce((s, b) => s + (b.items[i.id] || 0), 0)}))
    .sort((a, b) => b.value - a.value);
  const groups = [...new Set(items.map(groupOf))].map(id => ({
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
export function hourProfile(items, hourly, start, end) {
  const sums = new Array(24).fill(0),
    n = new Array(24).fill(0);
  for (let x = new Date(start).setMinutes(0, 0, 0); x < end; x += H) n[new Date(x).getHours()]++; // the last day is partial
  for (const i of items)
    for (const r of hourly?.[i.statistic] || []) {
      if (r.start < start || !(r.change > 0)) continue;
      sums[new Date(r.start).getHours()] += r.change;
    }
  return sums.map((s, h) => (n[h] ? s / n[h] : 0));
}

// ---------- Climate ----------
// Comfort — the share of hours whose hourly average was within range; CO₂ — how many hours were above 1000 ppm (time to air out).
// Computed by hour, so there is none for a year: that is 8760 rows per sensor — too many for a dashboard.
export const COMFORT = {temperature: [20, 24], humidity: [40, 60]};
export const CO2_LIMIT = 1000;
const KEYS = ['temperature', 'humidity', 'co2'];
// sources: [{room, temperature?, humidity?, co2?}] — room sensor entities, the same as in the overview
export async function loadClimate(ha, sources, w) {
  const ids = sources.flatMap(s => KEYS.map(k => s[k]).filter(Boolean));
  if (!ids.length || !ha?.statistics) return buildClimate(sources, w, {}, null);
  const ask = (period, types) => ha.statistics(ids, {start: w.start, end: w.end, period, types});
  const [rows, hourly] = await Promise.all([
    ask(w.bucket, ['mean', 'min', 'max']),
    w.bucket === 'day' ? ask('hour', ['mean']) : null,
  ]);
  return buildClimate(sources, w, rows, hourly);
}
// Per-room summary and per-bar averages. rows: {id:[{start, mean, min, max}]} on the window grid; hourly: {id:[{start, mean}]}
export function buildClimate(sources, w, rows, hourly) {
  const buckets = w.starts.map((start, i) => ({start, end: bucketEnd(w, i), covered: false, rooms: {}}));
  const at = s => buckets.find(b => s >= b.start && s < b.end);
  let first = Infinity;
  const rooms = sources
    .map(s => {
      const out = {room: s.room};
      for (const key of KEYS) {
        const list = (rows?.[s[key]] || []).filter(r => Number.isFinite(r.mean));
        if (!list.length) continue;
        first = Math.min(first, list[0].start);
        // the period average is by hour, if available: days with gaps do not outweigh the rest
        const hours = (hourly?.[s[key]] || []).filter(r => Number.isFinite(r.mean)),
          src = hours.length ? hours : list;
        // the range is by hourly averages: a one-second sensor glitch (23 → 11 → 23°) gets into the statistics min / max, but not into the hourly average
        const means = src.map(r => r.mean),
          v = {
            mean: means.reduce((a, b) => a + b, 0) / means.length,
            min: Math.min(...means),
            max: Math.max(...means),
          };
        if (hours.length && COMFORT[key]) {
          const [lo, hi] = COMFORT[key];
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
  const warm = rooms.filter(r => r.temperature),
    cf = warm.filter(r => r.temperature.comfort != null);
  return {
    period: w.period,
    bucket: w.bucket,
    buckets,
    rooms,
    since: first > w.start && first < Infinity ? first : null,
    empty: first === Infinity,
    mean: warm.length ? warm.reduce((a, r) => a + r.temperature.mean, 0) / warm.length : null,
    comfort: cf.length ? cf.reduce((a, r) => a + r.temperature.comfort, 0) / cf.length : null,
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
export const deviceLabel = n => {
  const s = String(n || '')
    .replace(ENERGY_WORD, '')
    .trim();
  return s || String(n || '');
};
export function energySources(prefs, {room = () => null, name = s => s} = {}) {
  if (!prefs) return null;
  const grid = (prefs.grid || []).filter(Boolean).map((s, i) => ({id: 'grid' + i, statistic: s}));
  const devices = (prefs.devices || [])
    .filter(d => d?.statistic && !d.parent)
    .map(d => ({
      id: d.statistic,
      statistic: d.statistic,
      name: d.name || deviceLabel(name(d.statistic)),
      room: room(d.statistic)?.id || null,
    }));
  return grid.length || devices.length ? {grid, devices} : null;
}
export async function loadEnergy(ha, src, w) {
  const ids = [...src.grid, ...src.devices].map(i => i.statistic);
  if (!ids.length || !ha?.statistics) return buildEnergy(src, w, {}, null);
  const ask = period => ha.statistics(ids, {start: w.start, end: w.end, period, types: ['change']});
  const [rows, hourly] = await Promise.all([ask('day'), w.bucket === 'day' ? ask('hour') : null]);
  return buildEnergy(src, w, rows, hourly);
}
// A bar is grid consumption (no grid meter — the sum of devices), its parts are the device rooms and “Other”: grid minus
// devices, like “Untracked consumption” in the “Energy” dashboard. A device without a room goes into the “No room” part.
export const REST = 'rest',
  NOROOM = 'none';
export function buildEnergy(src, w, rows, hourly) {
  const dev = buildSeries(src.devices, w, rows, null, {groupOf: i => i.room || NOROOM}),
    grid = src.grid.length ? buildSeries(src.grid, w, rows, hourly, {groupOf: () => REST}) : null;
  const base = grid && !grid.empty ? grid : dev,
    profile =
      grid && !grid.empty
        ? grid.profile
        : src.devices.length && hourly
          ? buildSeries(src.devices, w, rows, hourly, {groupOf: () => REST}).profile
          : null;
  const buckets = base.buckets.map((b, i) => {
    const d = dev.buckets[i],
      parts = {...d.parts};
    if (base === grid) parts[REST] = Math.max(0, b.total - d.total);
    return {
      ...b,
      covered: b.covered || d.covered,
      parts,
      total: base === grid ? Math.max(b.total, d.total) : d.total,
    };
  });
  const total = buckets.reduce((s, b) => s + b.total, 0),
    tracked = dev.total,
    rest = base === grid ? Math.max(0, total - tracked) : 0;
  const groups = [
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
export const healthWindow = w => ({start: Math.max(w.start, w.end - HEALTH_DAYS * DAY), end: w.end});
// entities: [{entity, name, room?, device?}] — what is in Preview: lamps, appliances, room sensors; one entity — one row
export async function loadHealth(ha, entities, w) {
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
const RESTART_SHARE = 0.3,
  RESTART_NEAR = 9e4,
  RESTART_LONGEST = 15 * 6e4;
// Hours and occurrences of unavailability per device. history: {entity:[{s, lu | lc}]} — time in seconds, as HA returns it
export function buildHealth(entities, history, span) {
  const outages = new Map();
  for (const e of entities) {
    const list = [];
    let prev = null;
    for (const r of history?.[e.entity] || []) {
      const x = Math.max(span.start, (r.lu ?? r.lc) * 1e3),
        down = r.s === 'unavailable';
      if (down && (!prev || !prev.down)) list.push({start: x, end: span.end, first: !prev});
      else if (!down && prev?.down && list.length) list.at(-1).end = x;
      prev = {down, s: r.s};
    }
    outages.set(e.entity, {list, now: prev?.s == null ? null : !prev.down});
  }
  const minutes = new Map();
  for (const {list} of outages.values())
    for (const o of list)
      if (!o.first) {
        const m = Math.floor(o.start / 6e4);
        minutes.set(m, (minutes.get(m) || 0) + 1);
      }
  const burst = Math.max(5, entities.length * RESTART_SHARE),
    restarts = [...minutes].filter(([, n]) => n >= burst).map(([m]) => m * 6e4);
  const restart = o =>
    o.end - o.start < RESTART_LONGEST && restarts.some(x => Math.abs(o.start - x) <= RESTART_NEAR);
  const items = entities.map(e => {
    const {list, now} = outages.get(e.entity),
      real = list.filter(o => !restart(o));
    return {
      ...e,
      offline: real.reduce((s, o) => s + o.end - o.start, 0) / H,
      drops: real.filter(o => !o.first).length,
      now,
    };
  });
  // several entities of one device drop out together: one row with the device name, hours — the largest, not the sum.
  // No device name — the common start of the entity names (“Bathroom sensor Temperature” and “… Humidity” → “Bathroom sensor”)
  const merged = new Map();
  for (const i of items) {
    const key = i.device || i.entity,
      p = merged.get(key);
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
  const rooms = {};
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

function commonStart(a, b) {
  const x = String(a).split(/\s+/),
    y = String(b).split(/\s+/),
    out = [];
  for (let i = 0; i < Math.min(x.length, y.length) && x[i] === y[i]; i++) out.push(x[i]);
  return out.join(' ');
}

// ---------- Sections ----------
export const SECTIONS = [
  {id: 'climate', label: N('Climate'), icon: 'thermometer'},
  {id: 'energy', label: N('Energy'), icon: 'bolt'},
  {id: 'health', label: N('Connectivity'), icon: 'wifi'},
];
// src: {climate, energy, health} — sources from the model; null / empty — no section
export function availableSections(src) {
  return SECTIONS.map(s => s.id).filter(id =>
    id === 'climate' ? src.climate?.length : id === 'energy' ? !!src.energy : src.health?.length,
  );
}
export function loadSection(id, ha, src, period, now = new Date()) {
  const w = periodWindow(period, now);
  if (id === 'climate') return loadClimate(ha, src.climate || [], w);
  if (id === 'energy') return loadEnergy(ha, src.energy || {grid: [], devices: []}, w);
  if (id === 'health') return loadHealth(ha, src.health || [], w);
  return Promise.reject(new Error('unknown stats section ' + id));
}

// The number above a room on the model: climate — average temperature, energy — device kWh, connectivity — hours offline
export function sectionMap(id, data) {
  const out = {};
  if (!data) return out;
  const fill = (values, label) => {
    for (const [room, v] of Object.entries(values)) if (v > 0) out[room] = {label: label(v)};
  };
  if (id === 'climate') {
    for (const r of data.rooms)
      if (r.temperature) out[r.room] = {label: formatNumber(r.temperature.mean) + '°'};
  } else if (id === 'energy')
    fill(
      Object.fromEntries(data.groups.filter(g => g.id !== REST && g.id !== NOROOM).map(g => [g.id, g.value])),
      formatEnergy,
    );
  else if (id === 'health') fill(data.rooms, formatHours);
  return out;
}
// A section tile in the overview: one number and a caption
export function sectionTile(id, data) {
  if (!data || data.empty) return null;
  if (id === 'climate')
    return data.mean == null
      ? null
      : {
          value: formatNumber(data.mean) + '°',
          sub: data.comfort != null ? t('comfort {0}%', Math.round(data.comfort * 100)) : t('on average'),
        };
  if (id === 'energy') return {value: formatEnergy(data.perDay), sub: t('per day')};
  if (id === 'health') {
    const n = data.items.filter(i => i.offline >= 0.5).length;
    return n
      ? {value: String(n), sub: t('{0, plural, one {device dropped out} other {devices dropped out}}', n)}
      : {value: '✓', sub: t('all online')};
  }
  return null;
}

// ---------- Captions ----------
const thin = s => s.replace(/ /g, ' ');
const fmt = (v, d) => num(Number(v.toFixed(d)), d, {grouping: 'auto'});
// human-readable hours: 0.4 h · 12 h · 1,234 h
export function formatHours(h) {
  if (!(h >= 0.05)) return '0 ' + t('h');
  return (h < 10 ? fmt(h, 1) : thin(num(Math.round(h), 0, {grouping: 'auto'}))) + ' ' + t('h');
}
// number: 21.6 · 8.8; from a hundred up and with digits = 0 — an integer with digit grouping
export function formatNumber(v, d = 1) {
  if (!Number.isFinite(v)) return '—';
  return Math.abs(v) < 100 && d ? fmt(v, d) : thin(num(Math.round(v), 0, {grouping: 'auto'}));
}
// energy: 0.8 kWh · 12 kWh · 1,234 kWh
export function formatEnergy(k) {
  if (!(k >= 0.05)) return '0 ' + t('kWh');
  return (k < 10 ? fmt(k, 1) : thin(num(Math.round(k), 0, {grouping: 'auto'}))) + ' ' + t('kWh');
}
export const formatPower = k => (k < 10 ? fmt(k, k < 1 ? 2 : 1) : formatNumber(k, 0)) + ' ' + t('kW');
const dt = (o, x) => dateTime(new Date(x), o);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// under a bar: weekday for a week, day of month for a month, month for a year
export const bucketLabel = (start, bucket, period) =>
  bucket === 'month'
    ? dt({month: 'short'}, start).replace(/\.$/, '')
    : period === 'week'
      ? dt({weekday: 'short'}, start)
      : String(new Date(start).getDate());
// the bar's full date for the tooltip
export const bucketTitle = (start, bucket) =>
  cap(
    bucket === 'month'
      ? dt({month: 'long', year: 'numeric'}, start)
      : dt({weekday: 'short', day: 'numeric', month: 'long'}, start),
  );
// window title: “last 7 days”, “last 30 days”, “last 12 months” — or “since October 22” if there is less data
export function periodCaption(s) {
  if (s.since != null) return t('since {0}', dt({day: 'numeric', month: 'long'}, s.since));
  return s.period === 'week'
    ? t('last 7 days')
    : s.period === 'year'
      ? t('last 12 months')
      : t('last 30 days');
}
