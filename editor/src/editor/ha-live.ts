// HA layer on a real Home Assistant (the Home Twin panel). The same interface as mockHA (editor/ha.js describes each
// method), only built from the hass object that HA hands to the panel and replaces with a new one on every event:
//   registries — hass.areas / hass.entities / hass.devices (changed — onChange), states — hass.states (changed —
//   onState; events within a frame are merged into one: in a home they come constantly). History, statistics, energy — callWS, the answer comes later.
// An entity's area is its own or its device's. Setting the area: HA 2026.11 does not allow it for an entity without its own name
// (“set the area on its device instead”) — then it goes to the device.
import type {
  HaBoard,
  HaDevice,
  HaLayer,
  HaStateChange,
  HaStatisticsRow,
  HaWeatherHour,
  Hass,
  HassAttributes,
  HassEntityEntry,
  HassDeviceEntry,
  HassMessage,
} from '../core/types.ts';
import type {PhotoStore} from './underlay.ts';
import type {RemoteSaveState} from './editor-types.ts';

const HOUR = 3600e3;
const BOARD = 'home-twin-3d'; // the Home Twin dashboard (D-059); card.js and card-main.js know it too

/** The live layer has every member the demo lacks, and sets areas. */
export type LiveHaLayer = HaLayer &
  Required<Pick<HaLayer, 'ready' | 'update' | 'moreInfo' | 'url' | 'close' | 'setArea'>> & {board: HaBoard};

/** A sensor's last 3 hours as history() keeps it: when it was asked for (ms), the points, and a request in flight. */
interface HistoryCache {
  at: number;
  data: number[];
  busy: boolean;
}

/** A row of HA's history answer: the minimal form (s, lu in seconds) or the full one (state, last_updated as ISO). */
interface HassHistoryRow {
  s?: string;
  lu?: number;
  state?: string;
  last_updated?: string;
}

/** HA's answer to history/history_during_period: rows by entity. Not checked: a broken answer throws where it is read. */
type HassHistoryAnswer = Record<string, HassHistoryRow[]> | null | undefined;

/** An hour of HA's weather forecast (weather/subscribe_forecast). */
interface HassForecastRow {
  datetime: string;
  condition: string;
  temperature: number;
}

/** A period of HA's statistics answer: its times come as ms or as ISO text. */
type HassStatisticsRow = Omit<HaStatisticsRow, 'start' | 'end'> & {
  start: number | string;
  end: number | string;
};

/** HA's "Energy" dashboard settings (energy/get_prefs), only what is read. */
interface HassEnergyPrefs {
  energy_sources?: Array<{type: string; flow_from?: Array<{stat_energy_from: string}>}>;
  device_consumption?: Array<{
    stat_consumption: string;
    name?: string | null;
    included_in_stat?: string | null;
  }>;
}

// HA's own navigation from the panel's iframe or from the card in HA's page
const navigate = (path: string): void => {
  const w = window.parent !== window ? window.parent : window;
  w.history.pushState(null, '', path);
  w.dispatchEvent(new CustomEvent('location-changed'));
};
const num = (s: string | null | undefined): number =>
  s == null || s === '' || s === 'unknown' || s === 'unavailable' ? NaN : Number(s);
// binary_sensor for the model and “Security”; null is a class too (has(null) is false)
const SENSOR_DEVICE = new Set<string | null>(['door', 'window', 'garage_door', 'opening', 'moisture']);
const iso = (ms: number): string => new Date(ms).toISOString();
/** The code HA's error came with ('invalid_info', 'conflict', 'no_photo'…); none: undefined. */
const errorCode = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;

export function liveHA(initial: Hass): LiveHaLayer {
  let hass = initial;
  let raf = 0;
  let boardMade = false;
  const subs = new Set<() => void>();
  const ssubs = new Set<() => void>();
  const hist = new Map<string, HistoryCache>();
  const forecast = new Map<string, HaWeatherHour[]>();
  const fsubs = new Map<string, (() => void) | null>();
  const reg = (entity: string): HassEntityEntry | null => hass.entities?.[entity] || null;
  const devOf = (entry: HassEntityEntry | null): HassDeviceEntry | null =>
    entry?.device_id ? hass.devices?.[entry.device_id] || null : null;
  const areaOf = (entity: string): string | null => {
    const entry = reg(entity);
    return entry?.area_id || devOf(entry)?.area_id || null;
  };
  const nameOf = (entity: string): string =>
    hass.states[entity]?.attributes?.friendly_name || reg(entity)?.name || entity;
  // hidden and service ones (config, diagnostic) are not shown; an entity without a registry entry (from YAML) is shown
  const shown = (entity: string): boolean => {
    const entry = reg(entity);
    return !entry || (!entry.hidden && !entry.entity_category);
  };
  const ofDomain = (domain: string): string[] =>
    Object.keys(hass.states)
      .filter(e => e.startsWith(domain + '.'))
      .sort();
  const pulse = (): void => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      ssubs.forEach(f => f());
    });
  };
  const ws = (message: HassMessage): Promise<unknown> => hass.callWS(message);

  // sensor history for 3 hours: 36 points 5 minutes apart, the last one is now; between records — the last value.
  // Drawn right away (whatever there is), one request per sensor every 5 minutes; when the answer arrives — redraw (onState)
  async function loadHistory(entity: string, cache: HistoryCache): Promise<void> {
    cache.busy = true;
    cache.at = Date.now();
    try {
      const end = Date.now();
      const start = end - 3 * HOUR;
      const answer = (await ws({
        type: 'history/history_during_period',
        start_time: iso(start),
        end_time: iso(end),
        entity_ids: [entity],
        minimal_response: true,
        no_attributes: true,
        include_start_time_state: true,
        significant_changes_only: false,
      })) as HassHistoryAnswer;
      // Date.parse of a missing time is NaN, as Date.parse(undefined) was
      const points = (answer?.[entity] || [])
        .map((row): [number, number] => [
          (row.lu ?? Date.parse(row.last_updated ?? '') / 1000) * 1000,
          num(row.s ?? row.state),
        ])
        .filter(point => Number.isFinite(point[1]));
      const out: number[] = [];
      let j = 0;
      let value: number | null = null;
      for (let i = 0; i < 36; i++) {
        const t = start + (i + 1) * 5 * 60e3;
        while (j < points.length && points[j][0] <= t) {
          value = points[j][1];
          j++;
        }
        if (value != null) out.push(value);
      }
      cache.data = out;
    } catch {
      cache.data = [];
    } finally {
      cache.busy = false;
    }
    pulse();
  }
  // hourly forecast — a weather/subscribe_forecast subscription, one per entity
  function watchForecast(entity: string): void {
    if (fsubs.has(entity) || !hass.connection) return;
    fsubs.set(entity, null);
    hass.connection
      .subscribeMessage(
        message => {
          // HA's forecast message; not checked
          const rows = (message as {forecast?: HassForecastRow[]} | null | undefined)?.forecast || [];
          forecast.set(
            entity,
            rows.map(row => ({
              at: Date.parse(row.datetime),
              condition: row.condition,
              temperature: row.temperature,
            })),
          );
          pulse();
        },
        {type: 'weather/subscribe_forecast', entity_id: entity, forecast_type: 'hourly'},
      )
      .then(unsubscribe => fsubs.set(entity, unsubscribe))
      .catch(() => {});
  }
  const weatherEntity = (): string | null => {
    const all = ofDomain('weather').filter(shown);
    if (!all.length) return null;
    const home = hass.config?.location_name?.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return (
      all.find(e => e === 'weather.home' || (home && e === 'weather.' + home)) ||
      all.find(e => reg(e)?.platform === 'met') ||
      all[0]
    );
  };

  const ha: LiveHaLayer = {
    demo: false,
    // registries are loaded: before that an empty area list does not mean “areas were deleted” (app.js: syncAreas)
    ready: () => !!hass.areas && !!hass.entities,
    update(next) {
      const previous = hass;
      hass = next;
      if (
        next.areas !== previous.areas ||
        next.entities !== previous.entities ||
        next.devices !== previous.devices
      )
        subs.forEach(f => f());
      if (next.states !== previous.states) pulse();
    },
    areas: () =>
      Object.values(hass.areas || {})
        .map(a => ({
          area_id: a.area_id,
          name: a.name,
          temperature_entity_id: a.temperature_entity_id || null,
          humidity_entity_id: a.humidity_entity_id || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    lights: () =>
      ofDomain('light')
        .filter(shown)
        .map(e => {
          const members = hass.states[e].attributes.entity_id;
          return {
            id: e.slice(6),
            entity: e,
            name: nameOf(e),
            area: areaOf(e),
            color: '#ffce87',
            ...(Array.isArray(members) ? {members} : {}),
          };
        }),
    switches: () =>
      ofDomain('switch')
        .filter(shown)
        .filter(areaOf)
        .map(e => ({entity: e, name: nameOf(e), area: areaOf(e)})),
    sensors: () =>
      ofDomain('sensor')
        .map(e => {
          const attributes = hass.states[e].attributes;
          const entry = reg(e);
          return {
            entity: e,
            name: nameOf(e),
            area: areaOf(e),
            device: entry?.device_id || null,
            cls: attributes.device_class || null,
            unit: attributes.unit_of_measurement || null,
            cat: entry?.entity_category || null,
            hidden: !!entry?.hidden,
          };
        })
        .filter(
          x => x.cls !== 'timestamp' && (x.unit != null || Number.isFinite(num(hass.states[x.entity].state))),
        ),
    state: e => {
      const value = num(hass.states[e]?.state);
      return Number.isFinite(value) ? value : null;
    },
    entity: e => hass.states[e] || null,
    onState: f => {
      ssubs.add(f);
      return () => ssubs.delete(f);
    },
    onChange: f => {
      subs.add(f);
      return () => subs.delete(f);
    },
    history: e => {
      let cache = hist.get(e);
      if (!cache) {
        cache = {at: 0, data: [], busy: false};
        hist.set(e, cache);
      }
      if (!cache.busy && Date.now() - cache.at > 5 * 60e3) loadHistory(e, cache);
      return cache.data;
    },
    sunDown: () => hass.states['sun.sun']?.state === 'below_horizon',
    weather: () => {
      const e = weatherEntity();
      if (!e) return null;
      watchForecast(e);
      const entityState = hass.states[e];
      const attributes = entityState.attributes;
      const sun: HassAttributes = hass.states['sun.sun']?.attributes || {};
      // Date.parse of a missing time is NaN, as Date.parse(undefined) was: then null
      return {
        entity: e,
        condition: entityState.state,
        temperature: attributes.temperature ?? null,
        feels: attributes.apparent_temperature ?? null,
        hourly: forecast.get(e) || [],
        sunrise: Date.parse(sun.next_rising ?? '') || null,
        sunset: Date.parse(sun.next_setting ?? '') || null,
      };
    },
    statistics: (ids, {start, end, period, types}) =>
      ids.length
        ? ws({
            type: 'recorder/statistics_during_period',
            start_time: iso(start),
            end_time: iso(end),
            statistic_ids: ids,
            period,
            types,
            units: {energy: 'kWh'},
          }).then(answer =>
            Object.fromEntries(
              // HA's statistics answer: rows by statistic id; not checked
              Object.entries((answer as Record<string, HassStatisticsRow[]> | null | undefined) || {}).map(
                ([id, rows]) => [
                  id,
                  rows.map(x => ({
                    ...x,
                    start: typeof x.start === 'number' ? x.start : Date.parse(x.start),
                    end: typeof x.end === 'number' ? x.end : Date.parse(x.end),
                  })),
                ],
              ),
            ),
          )
        : Promise.resolve({}),
    stateHistory: (ids, {start, end}) =>
      ids.length
        ? ws({
            type: 'history/history_during_period',
            start_time: iso(start),
            end_time: iso(end),
            entity_ids: ids,
            minimal_response: true,
            no_attributes: true,
            include_start_time_state: true,
            significant_changes_only: false,
          }).then(answer =>
            Object.fromEntries(
              Object.entries((answer as HassHistoryAnswer) || {}).map(([id, rows]) => [
                id,
                rows.map((row): HaStateChange => ({
                  // a row has one of the two forms, so one of s and state is there
                  s: (row.s ?? row.state) as string,
                  lu: row.lu ?? Date.parse(row.last_updated ?? '') / 1000,
                })),
              ]),
            ),
          )
        : Promise.resolve({}),
    energy: () =>
      ws({type: 'energy/get_prefs'})
        .then(answer => {
          // HA's settings; not checked: a missing answer throws here and the catch gives null
          const prefs = answer as HassEnergyPrefs;
          return {
            grid: (prefs.energy_sources || [])
              .filter(s => s.type === 'grid')
              .flatMap(s => (s.flow_from || []).map(f => f.stat_energy_from))
              .filter(Boolean),
            devices: (prefs.device_consumption || []).map(d => ({
              statistic: d.stat_consumption,
              name: d.name || undefined,
              parent: d.included_in_stat || undefined,
            })),
          };
        })
        .catch(() => null),
    devices: () =>
      Object.keys(hass.states)
        .sort()
        .flatMap(e => {
          const domain = e.split('.')[0];
          const attributes = hass.states[e].attributes;
          const cls = attributes.device_class || null;
          if (
            !shown(e) ||
            !(
              ['climate', 'cover', 'camera', 'valve', 'vacuum'].includes(domain) ||
              (domain === 'binary_sensor' && SENSOR_DEVICE.has(cls))
            )
          )
            return [];
          const device: HaDevice = {entity: e, name: nameOf(e), area: areaOf(e), domain, cls};
          const entry = reg(e);
          // leak sensor: charge and “battery low” are entities of the same device
          if (cls === 'moisture' && entry?.device_id) {
            // an entry came from hass.entities, so it is there
            const siblings = Object.values(hass.entities ?? {}).filter(
              o => o.device_id === entry.device_id && o.entity_id !== e,
            );
            const isBattery = (o: HassEntityEntry): boolean =>
              hass.states[o.entity_id]?.attributes.device_class === 'battery';
            const charge = siblings.find(o => o.entity_id.startsWith('sensor.') && isBattery(o));
            const low = siblings.find(o => o.entity_id.startsWith('binary_sensor.') && isBattery(o));
            if (charge) device.battery = charge.entity_id;
            if (low) device.low = low.entity_id;
          }
          return [device];
        }),
    entities: () =>
      Object.keys(hass.states)
        .filter(shown)
        .sort()
        .map(e => {
          const attributes = hass.states[e].attributes;
          return {
            entity: e,
            name: nameOf(e),
            area: areaOf(e),
            domain: e.split('.')[0],
            ...(attributes.device_class ? {cls: attributes.device_class} : {}),
            ...(attributes.unit_of_measurement ? {unit: attributes.unit_of_measurement} : {}),
          };
        }),
    call: (domain, service, data = {}) =>
      hass.callService(domain, service, data).then(
        () => true,
        () => false,
      ),
    identify: e =>
      hass.callService('light', 'turn_on', {entity_id: e, flash: 'short'}).then(
        () => e,
        () => e,
      ),
    setArea: async (e, area) => {
      try {
        await ws({type: 'config/entity_registry/update', entity_id: e, area_id: area});
      } catch (err) {
        const deviceId = reg(e)?.device_id;
        if (errorCode(err) !== 'invalid_info' || !deviceId) throw err;
        await ws({type: 'config/device_registry/update', device_id: deviceId, area_id: area});
      }
    },
    // the entity card — via an event on the HA root (the panel is in an iframe of the same origin: the parent document is accessible;
    // the dashboard card is in HA's own document)
    moreInfo: e => {
      let root: Element | null = null;
      try {
        root = (window.parent !== window ? window.parent.document : document).querySelector('home-assistant');
      } catch {}
      (root || document.body).dispatchEvent(
        new CustomEvent('hass-more-info', {detail: {entityId: e}, bubbles: true, composed: true}),
      );
    },
    url: path => (hass.hassUrl ? hass.hassUrl(path) : path),
    // The Home Twin dashboard (D-059): the whole home on the screen, in everyone's sidebar. add(title) — create it (an administrator)
    // with one panel view holding the card; one that exists is not touched. open() — go there.
    board: {
      exists: () => boardMade || !!hass.panels?.[BOARD],
      async add(title) {
        if (ha.board.exists()) return;
        await ws({
          type: 'lovelace/dashboards/create',
          url_path: BOARD,
          title,
          icon: 'mdi:home-modern',
          show_in_sidebar: true,
          require_admin: false,
          mode: 'storage',
        });
        await ws({
          type: 'lovelace/config/save',
          url_path: BOARD,
          config: {
            title,
            views: [{title, path: 'home', type: 'panel', cards: [{type: 'custom:home-twin-card'}]}],
          },
        });
        boardMade = true;
      },
      open: () => navigate(`/${BOARD}/home`),
    },
    areasUrl: '/config/areas/dashboard',
    devicesUrl: '/config/devices/dashboard',
    // no longer needed (the dashboard card was removed): forecast subscriptions end, nobody is told about changes
    close() {
      for (const unsubscribe of fsubs.values()) unsubscribe?.();
      fsubs.clear();
      cancelAnimationFrame(raf);
      raf = 0;
      subs.clear();
      ssubs.clear();
    },
  };
  return ha;
}

/** What was not sent to HA yet, kept in this browser (localStorage) so the next start sends it. */
export interface UnsentMark<Value> {
  /** What set wrote; null: nothing. */
  get(): Value | null;
  set(value: Value): void;
  clear(): void;
}

/** The plan's mark: the edits were made from this revision of HA's plan. */
export interface PlanUnsent {
  rev: number | null;
}

/** HA's answer to home_twin/plan/get: its plan (none yet: null) and the revision; save answers with the new revision. */
export interface HassPlanAnswer {
  plan: unknown;
  rev: number | null;
}

export interface HassPlansOptions {
  /** The plan was changed in another window: ask which one to keep. */
  onConflict?: () => void;
  onStatus?: (state: RemoteSaveState) => void;
  mark?: UnsentMark<PlanUnsent>;
}

/** The plan kept in HA (hassPlans). Plans are opaque here: they are sent and compared as JSON. */
export interface HassPlans {
  /** local: the browser's plan; the answer has the plan to open. */
  load(local?: unknown): Promise<HassPlanAnswer>;
  save(plan: unknown): void;
  /** “Keep mine”: our plan goes over the one in HA. */
  keepMine(): void;
  /** “Load from HA”: forget what was not sent. */
  discard(): void;
  flush(): Promise<void>;
  state(): RemoteSaveState;
}

// The plan in HA (the home_twin integration): read at startup, written with a delay after edits. rev — the revision the plan
// was changed from: if it was changed in another window, HA does not write (conflict) and reports onConflict; keepMine — write ours on top.
// No connection (HA restarts, the network dropped): the write is retried every 5 s and the state is 'offline' (onStatus). The browser
// keeps the plan (history.js) and a mark “not sent yet, edited from revision N”, so the next start sends it instead of losing it:
// load(local) — the browser's plan; HA has not changed since — ours goes up, it has — ask (D-058).
const UNSENT = 'home-twin-editor:ha-unsent';
const keep = <Value>(key: string): UnsentMark<Value> => ({
  get: () => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) || 'null');
      // what set wrote in this browser; not checked
      return value as Value | null;
    } catch {
      return null;
    }
  },
  set: value => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
  clear: () => {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
});
const json = (plan: unknown): string => JSON.stringify(plan ?? null);
export function hassPlans(
  getHass: () => Pick<Hass, 'callWS'>,
  {onConflict, onStatus, mark = keep<PlanUnsent>(UNSENT)}: HassPlansOptions = {},
): HassPlans {
  // base, last — snapshots (JSON) of the plan this browser started from and of the plan HA has: the editor changes its plan in place
  let rev: number | null = null;
  let base: string | undefined;
  let last: string | undefined;
  let timer: ReturnType<typeof setTimeout> | 0 = 0;
  let want: unknown = null;
  let sending = false;
  let stop = false;
  let state: RemoteSaveState = 'saved';
  const status = (next: RemoteSaveState): void => {
    if (next !== state) {
      state = next;
      onStatus?.(next);
    }
  };
  const conflict = (): void => {
    stop = true;
    status('conflict');
    onConflict?.();
  };
  // HA's answers to home_twin/plan/get and save; not checked
  const ws = (message: HassMessage): Promise<HassPlanAnswer> =>
    getHass().callWS(message) as Promise<HassPlanAnswer>;
  async function send(force = false): Promise<void> {
    if (sending || !want || (stop && !force)) return;
    sending = true;
    const plan = want;
    want = null;
    let wait = 700;
    try {
      // the start could not read HA: read now; HA has a plan other than the one this browser started from — ask
      if (rev == null && !force) {
        const answer = await ws({type: 'home_twin/plan/get'});
        if (answer.plan && json(answer.plan) !== base) {
          want ??= plan;
          conflict();
          return;
        }
        rev = answer.rev;
      }
      const sent = json(plan);
      const answer = await ws({type: 'home_twin/plan/save', plan, ...(force ? {} : {rev})});
      rev = answer.rev;
      last = sent;
      stop = false;
      if (want) mark.set({rev});
      else mark.clear();
      status('saved');
    } catch (e) {
      want ??= plan;
      if (errorCode(e) === 'conflict') conflict();
      else {
        status('offline');
        wait = 5000;
      }
    } finally {
      sending = false;
      if (want && !stop) schedule(wait);
    }
  }
  const schedule = (ms = 700): void => {
    clearTimeout(timer);
    timer = setTimeout(() => send(), ms);
  };
  return {
    async load(local) {
      base = json(local);
      const answer = await ws({type: 'home_twin/plan/get'});
      rev = answer.rev;
      last = json(answer.plan);
      const unsent = mark.get();
      if (!unsent || !local || base === last) {
        mark.clear();
        return answer;
      }
      // the last edits did not reach HA (no connection, the tab was closed): HA unchanged since — send them, changed — ask
      want = local;
      if (unsent.rev === answer.rev) schedule();
      else conflict();
      return {...answer, plan: local};
    },
    // the same plan HA already has (the start, an edit undone) is not written: a write would make other windows see a conflict
    save(plan) {
      if (!want && !sending && json(plan) === last) return;
      want = plan;
      mark.set({rev});
      if (!stop) schedule();
    },
    keepMine: () => {
      stop = false;
      send(true);
    },
    // “Load from HA”: forget what was not sent
    discard: () => {
      want = null;
      mark.clear();
    },
    flush: () => {
      clearTimeout(timer);
      return send();
    },
    state: () => state,
  };
}

/** What the photo still has to send to HA: remove it, the image, its placement. */
export interface PhotoTodo {
  clear?: boolean;
  src?: boolean;
  place?: boolean;
}

/** The photo kept in this browser (underlay.ts browserPhotos): the store, and its placement read at once. */
export interface LocalPhotos extends PhotoStore {
  /** The placement kept in this browser, unchecked; null: none. */
  where(): unknown;
}

/** HA's answer to home_twin/photo/get: the photo HA has (null: none) and whether it has never had one. */
interface HassPhotoAnswer {
  photo?: {id: string; place?: unknown} | null;
  never?: boolean;
}

export interface HassPhotosOptions {
  local: LocalPhotos;
  onStatus?: (state: RemoteSaveState) => void;
  mark?: UnsentMark<PhotoTodo>;
}

/** The plan photo kept in HA (hassPhotos): a photo store that sends what changed. */
export interface HassPhotos extends PhotoStore {
  load(): Promise<{src: string; place: unknown} | null>;
  put(src: string): Promise<void>;
  clear(): Promise<void>;
  /** Sends what waits now; nothing waits: undefined. */
  flush(): Promise<void> | undefined;
  state(): 'offline' | 'saved';
}

// The plan photo in HA (D-058): the image goes to /api/home_twin/photo over HTTP, its placement — home_twin/photo/place.
// The same interface as underlay.js: browserPhotos. Writes wait a moment (dragging) and are retried while there is no
// connection; until HA confirms them they also sit in the browser (local — browserPhotos, and the mark of what is not sent yet),
// so a closed tab does not lose them. HA has never had a photo, but this browser kept one (before D-058) — it is sent once.
const PHOTO_UNSENT = 'home-twin-editor:photo-unsent';
const PHOTO = '/api/home_twin/photo';
export function hassPhotos(
  getHass: () => Pick<Hass, 'callWS' | 'fetchWithAuth'>,
  {local, onStatus, mark = keep<PhotoTodo>(PHOTO_UNSENT)}: HassPhotosOptions,
): HassPhotos {
  // todo: {clear, src, place} — what HA does not have yet; gen grows with “Remove”: what was not sent before it is dropped
  let id: string | null = null;
  let todo: PhotoTodo = mark.get() || {};
  let gen = 0;
  let timer: ReturnType<typeof setTimeout> | 0 = 0;
  let busy = false;
  let fails = 0;
  // HA's answers to home_twin/photo/get, place and delete; not checked
  const ws = (message: HassMessage): Promise<HassPhotoAnswer> =>
    getHass().callWS(message) as Promise<HassPhotoAnswer>;
  const schedule = (ms = 400): void => {
    clearTimeout(timer);
    timer = setTimeout(sync, ms);
  };
  const need = (more: PhotoTodo): void => {
    todo = {...todo, ...more};
    mark.set(todo);
    schedule();
  };
  // photoId is null only when a sync in between dropped it
  async function image(photoId: string | null): Promise<string> {
    const response = await getHass().fetchWithAuth(PHOTO + '?v=' + photoId);
    if (!response.ok) throw new Error('plan photo: HTTP ' + response.status);
    const blob = await response.blob();
    return await new Promise((ok, err) => {
      const reader = new FileReader();
      // readAsDataURL gives the data URL as text
      reader.onload = () => ok(reader.result as string);
      reader.onerror = () => err(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  async function sync(): Promise<void> {
    if (busy) return schedule();
    busy = true;
    timer = 0;
    const sending: PhotoTodo = {...todo};
    const sendingGen = gen;
    todo = {};
    try {
      if (sending.clear) {
        await ws({type: 'home_twin/photo/delete'});
        id = null;
        sending.clear = false;
      }
      if (sending.src) {
        const stored = await local.load();
        if (stored) {
          const blob = await (await fetch(stored.src)).blob();
          const response = await getHass().fetchWithAuth(PHOTO, {
            method: 'POST',
            headers: {'Content-Type': blob.type || 'image/jpeg'},
            body: blob,
          });
          if (!response.ok) throw new Error('plan photo: HTTP ' + response.status);
          const answer: unknown = await response.json();
          // HA answers with the new photo's id; not checked
          id = (answer as {id: string}).id;
        }
        sending.src = false;
        sending.place = !!stored;
      }
      if (sending.place) {
        const place = local.where();
        if (place && id)
          try {
            await ws({type: 'home_twin/photo/place', photo: id, place});
          } catch (e) {
            if (errorCode(e) !== 'no_photo') throw e;
          } // another window replaced the photo
        sending.place = false;
      }
      if (fails) {
        fails = 0;
        onStatus?.('saved');
      }
    } catch (e) {
      console.warn('Home Twin:', e);
      if (!fails++) onStatus?.('offline');
    } finally {
      busy = false;
      const left: PhotoTodo = sendingGen === gen ? sending : {};
      todo = {
        clear: !!(left.clear || todo.clear),
        src: !!(left.src || todo.src),
        place: !!(left.place || todo.place),
      };
      if (todo.clear || todo.src || todo.place) {
        mark.set(todo);
        if (!timer) schedule(fails ? Math.min(3e5, 1e4 * 2 ** (fails - 1)) : 400);
      } else {
        todo = {};
        mark.clear();
        if (sendingGen === gen) await local.clear();
      }
    }
  }
  return {
    async load() {
      const answer = await ws({type: 'home_twin/photo/get'});
      id = answer.photo?.id || null;
      const waiting = todo;
      if (waiting.clear) {
        schedule(0);
        return null;
      }
      // not sent last time (or kept in this browser before D-058) — the browser's copy, sent now
      const stored = waiting.src || answer.never ? await local.load() : null;
      if (stored) {
        need({src: true, place: true});
        return stored;
      }
      const place = waiting.place && id ? local.where() : null;
      if (place) {
        need({place: true});
        return {src: await image(id), place};
      }
      if (waiting.src || waiting.place) {
        todo = {};
        mark.clear();
      }
      return answer.photo?.place ? {src: await image(id), place: answer.photo.place} : null;
    },
    async put(src) {
      await local.put(src);
      need({src: true, place: true, clear: false});
    },
    place(place) {
      local.place(place);
      need({place: true});
      return true;
    },
    async clear() {
      gen++;
      id = null;
      await local.clear();
      todo = {};
      need({clear: true});
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = 0;
        return sync();
      }
    },
    state: () => (fails ? 'offline' : 'saved'),
  };
}
