// Connection to Home Assistant. The editor knows about HA only through this object, so in the HA panel a real one replaces it
// without changes to the rest of the code:
//   areas()     — areas: [{area_id, name}] (in HA: callWS {type:'config/area_registry/list'});
//   lights()    — lamps: [{id, entity, name, area, color, model?, members?}] (entity and device registries, light domain).
//                 Service ones (entity_category config/diagnostic — key backlight, hub indicator) and hidden ones are not
//                 included. members — for a light group: its members (the entity_id attribute). kind and h — demo data only (a shape hint);
//   switches()  — switches (switch domain) with an area: [{entity, name, area}] — a relay that may have a light behind it;
//   identify(e) — blink a lamp in the home to tell which one it is (in HA: light.turn_on with flash: 'short');
//   setArea(e,a) — set a lamp's area (in HA: callWS {type:'config/entity_registry/update', entity_id, area_id};
//                 on the entity, not the device — so the rest of a socket with sensors does not move; admin rights required);
//   sensors()   — numeric sensors (sensor domain): [{entity, name, area, device, cls — device_class, unit, cat — entity_category,
//                 hidden}]. area — the entity's or its device's. Which of them to write on the wall is decided by core/sensors.js (D-033);
//   state(e)    — the sensor's current number or null (unavailable, unknown, not a number);
//   onState(f)  — readings changed (in HA: subscribe_entities for the sensors); returns an unsubscribe function;
//   an area in areas() may have temperature_entity_id and humidity_entity_id — its own sensors from the HA area settings;
//   onChange(f) — areas or lamps changed (in HA: an area_registry_updated subscription); returns an unsubscribe function;
//   devicesUrl  — where to add a light fixture and set its area: in HA — '/config/devices/dashboard', outside — My Home Assistant;
//   history(e)  — the sensor's readings for the last 3 hours, a point every 5 minutes (in HA — recorder/history_during_period); none — [];
//   devices()   — devices for the model (D-048): [{entity, name, area, domain, cls}] — climate (air conditioner), cover (curtains and blinds;
//                 cls — device_class: curtain, blind, shade…), binary_sensor with cls door / window / garage_door / opening (contact sensor);
//                 for “Security” in Preview — camera, valve (water valve; cls water, gas) and binary_sensor with cls moisture (leak):
//                 it has battery — the charge sensor of the same device (device_class battery) and low — the “battery low” binary_sensor, if any;
//                 vacuum — a robot vacuum for “Cleaning” (area — where its dock is);
//   entity(e)   — the state as in HA: {state, attributes, last_changed} or null (in HA — hass.states[e]); changes — onState.
//                 For lamps — light.* and switch.* relays: on / off / unavailable; Preview shows it in 3D too;
//   call(domain, service, data) — a command (in HA — hass.callService): climate.set_hvac_mode / set_temperature / turn_on / turn_off,
//                 cover.open_cover / close_cover / set_cover_position, valve.open_valve / close_valve, light and switch — turn_on /
//                 turn_off (Preview and scene lights), vacuum.start / pause / return_to_base. The demo changes the state itself;
//   moreInfo(e) — the entity card in HA (the hass-more-info event): camera, leak sensor. Not in the demo — Preview draws its own;
//   url(path)   — the full URL for an HA path (the camera frame entity_picture; in HA — hass.hassUrl). Not in the demo;
//   weather()   — weather for the “Whole home” header: {entity, condition, temperature, feels, hourly:[{at, condition, temperature}],
//                 sunrise, sunset} or null (no weather in HA). In HA: the first weather.* entity — state (sunny, cloudy…),
//                 temperature, apparent_temperature; hourly — the weather/subscribe_forecast subscription (type: hourly); sunrise and
//                 sunset — next_rising and next_setting of sun.sun; time in ms. Changes — onState;
//   sunDown()   — the sun is below the horizon (in HA — sun.sun below_horizon; the demo — by the weather profile's sunrise and sunset;
//                 no data — false, day). Day and night in 3D follow it (D-068);
//   statistics(ids, {start, end, period, types}) — long-term statistics (in HA — callWS recorder/statistics_during_period;
//                 period: hour | day | month, types: mean / min / max / change, time in ms; HA converts energy to kWh itself —
//                 units: {energy: 'kWh'}) → Promise {id: [{start, end, mean?, min?, max?, change?}]}. HA keeps them for numeric
//                 sensors with a state_class, indefinitely; there are none for on / off (lights, relays). Preview “Statistics”;
//   stateHistory(ids, {start, end}) — raw state history (in HA — callWS history/history_during_period, minimal_response,
//                 no_attributes, include_start_time_state, significant_changes_only: false) → Promise {entity: [{s, lu — seconds}]}.
//                 HA keeps it for 10 days (purge_keep_days) — “Connectivity” in “Statistics”;
//   energy()    — the HA “Energy” dashboard (in HA — callWS energy/get_prefs) → Promise {grid: [statistic — grid consumption,
//                 flow_from of the grid source], devices: [{statistic — stat_consumption, name?, parent? — included_in_stat}]} or null;
//   entities()  — all entities for “Favorites” in Preview: [{entity, name, area, domain, cls?, unit?}] (in HA — hass.states and
//                 the entity registry: without hidden and service entity_category ones). Commands go through the same call(): toggle, scene / script
//                 turn_on, button press;
//   areasUrl    — where to add an area: in HA — '/config/areas/dashboard', outside — a My Home Assistant link,
//                 which opens the areas page in the user's own HA.
// Until HA is connected — demo data (mockHA).
import {demoStatistics, demoStateHistory} from './ha-demo.ts';
import {DEFAULT_MAX_TEMP_C, DEFAULT_MIN_TEMP_C} from '../core/devices.ts';
import type {
  DemoHaData,
  DemoHaLayer,
  DemoWeatherProfile,
  HaArea,
  HaEntityItem,
  HaLayer,
  HaSwitch,
  HaWeather,
  HaWeatherHour,
  HassAttributes,
  HassEntityState,
  PlanLight,
} from '../core/types.ts';

/** A demo entity: HA's state, and the timer of a move it is making (a robot going home, a script running). */
type DemoEntity = HassEntityState & {_t?: ReturnType<typeof setTimeout>};

/**
 * The attributes the demo's commands read and change. The demo's climate entities have all of their numbers and its covers a
 * position (demo/kit.ts); _last: the mode an air conditioner goes back to when turned on.
 */
type DemoAttributes = HassAttributes & {
  _last?: string;
  temperature: number;
  current_temperature: number;
  current_position: number;
};

/** The fields of a command's data the demo reads: each service's call has the ones it needs (the editor makes them). */
type DemoCallData = {
  entity_id: string;
  hvac_mode: string;
  temperature: number;
  fan_mode: string;
  position: number;
};

/** A lamp of a saved plan as the merge reads it: an older file's lamp may lack its points or segments. */
type SavedLamp = Omit<PlanLight, 'points' | 'segments'> & Partial<Pick<PlanLight, 'points' | 'segments'>>;

/** The demo's weather always has its numbers. */
export type DemoWeather = HaWeather & {temperature: number; feels: number; sunrise: number; sunset: number};

// An entity that is missing right now is no reason to erase its placement from the saved file.
// HA lamps as plan lamps, not placed yet. An HA light group (it has a member list) whose lamps are also in the list is not placed
// on the plan — the lamps themselves are.
export function haPlanLights(ha: Pick<HaLayer, 'lights'>): PlanLight[] {
  const all = ha.lights();
  const ids = new Set(all.map(l => l.entity));
  return all
    .filter(l => !l.members?.some(id => ids.has(id)))
    .map(l => ({...l, on: true, placed: false, points: [], segments: [], room: null}));
}

export function mergePlanLights(
  saved: PlanLight[],
  current: PlanLight[],
  switches: HaSwitch[] = [],
): PlanLight[] {
  const live = [
    ...current,
    ...saved
      .filter(s => s.relay && !current.some(l => l.id === s.id))
      .flatMap(s => {
        const w = switches.find(w => w.entity === s.entity);
        return w ? [{...s, name: w.name, area: w.area}] : [];
      }),
  ];
  const ids = new Set(live.map(l => l.id));
  return [
    ...live.map(h => {
      const s = saved.find(l => l.id === h.id);
      return s ? {...h, ...s, name: h.name, entity: h.entity, area: h.area} : h;
    }),
    // a lamp from an older file may lack its points or segments: they default to none
    ...saved
      .filter(s => !ids.has(s.id))
      .map((s: SavedLamp) => ({name: s.id, points: [], segments: [], ...s})),
  ];
}

// Demo weather: a daily temperature cycle (minimum by 4 am, maximum by 4 pm) and hourly conditions from the profile,
// sunrise and sunset from the profile in local time. Computed from the current hour, so the forecast strip is always live.
// p: {low, high, sunrise:'07:05', sunset:'16:40', hours:[24 HA conditions, one per hour of the day]}
export function demoWeather(p: DemoWeatherProfile, now = Date.now()): DemoWeather {
  const H = 3600e3;
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  const temp = (at: number): number => {
    const d = new Date(at);
    const h = d.getHours() + d.getMinutes() / 60;
    return +(p.low + ((p.high - p.low) * (1 - Math.cos(((h - 4) / 24) * 2 * Math.PI))) / 2).toFixed(1);
  };
  const cond = (at: number): string => p.hours[new Date(at).getHours()] || 'cloudy';
  const next = (hm: string): number => {
    const [h, m] = hm.split(':').map(Number);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (+d <= now) d.setDate(d.getDate() + 1);
    return +d;
  };
  const hourly: HaWeatherHour[] = [];
  for (let i = 1; i <= 48; i++) {
    const at = +start + i * H;
    hourly.push({at, condition: cond(at), temperature: temp(at)});
  }
  const t = temp(now);
  return {
    entity: 'weather.home',
    condition: cond(now),
    temperature: t,
    feels: +(t - 2.4).toFixed(1),
    hourly,
    sunrise: next(p.sunrise),
    sunset: next(p.sunset),
  };
}

// stats — the “Statistics” demo: since — days of statistics, energy — the “Energy” dashboard, outages — who dropped out, restart — how many days ago HA restarted
// extra — other demo entities for “Favorites” (scenes, scripts, relays, toggles): [{entity, name, area, domain}], states are in entities
export function mockHA({
  areas,
  lights,
  switches = [],
  sensors = [],
  states = {},
  areaSensors = {},
  devices = [],
  entities = {},
  weather = null,
  stats = {},
  extra = [],
}: DemoHaData): DemoHaLayer {
  const list: HaArea[] = Object.entries(areas).map(([area_id, name]) => ({
    area_id,
    name,
    ...areaSensors[area_id],
  }));
  const subs = new Set<() => void>();
  const ssubs = new Set<() => void>();
  // Demo lamps: the entity state is L.on of the plan lamps (_lightsFrom), a light / switch command changes it. This way the bulb
  // in the Lights list and Preview see the same thing, and Preview talks to lamps only through entity() and call(), as with HA.
  let planLights = (): PlanLight[] => [];
  const lampsOf = (e: string): PlanLight[] => planLights().filter(L => L.entity === e);
  const lamp = (e: string): HassEntityState | null => {
    const L = lampsOf(e);
    return L.length ? {state: L.some(x => x.on !== false) ? 'on' : 'off', attributes: {}} : null;
  };
  return {
    demo: true, // demo data: Preview shows “Demo”; in HA — real data
    areas: () => list,
    lights: () => lights,
    switches: () => switches,
    sensors: () => sensors,
    state: e => {
      const v = states[e];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    },
    onState: f => {
      ssubs.add(f);
      return () => ssubs.delete(f);
    },
    _setState(e, v) {
      states[e] = v;
      ssubs.forEach(f => f());
    },
    // demo: a smooth curve towards the current value; the amplitude depends on the sensor kind, the pattern is unique to each (from the entity name)
    history: e => {
      const v = states[e];
      // the same as !Number.isFinite(v), which takes only numbers
      if (typeof v !== 'number' || !Number.isFinite(v)) return [];
      const cls = sensors.find(x => x.entity === e)?.cls;
      const amplitudes: Record<string, number | undefined> = {
        temperature: 0.6,
        humidity: 3.5,
        carbon_dioxide: 180,
        pm25: 3,
      };
      // String(): a missing class is looked up as 'undefined' or 'null', as before
      const amp = amplitudes[String(cls)] ?? Math.abs(v) * 0.05;
      let h = 0;
      for (const c of e) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      const out: number[] = [];
      for (let i = 0; i < 36; i++) {
        const x = i / 35;
        out.push(
          +(
            v +
            amp * (Math.sin(x * 3.1 + (h % 7)) * 0.7 + Math.sin(x * 9.7 + (h % 13)) * 0.3) * (1 - x)
          ).toFixed(2),
        );
      }
      out[35] = v;
      return out;
    },
    weather: () => (weather ? demoWeather(weather) : null),
    sunDown: (now = Date.now()) => {
      if (!weather) return false;
      const w = demoWeather(weather, now);
      return w.sunrise < w.sunset;
    }, // night: the next sunrise comes before the next sunset
    statistics: (ids, o) =>
      Promise.resolve(
        demoStatistics(sensors, e => states[e] ?? null, ids, o, {
          since: Date.now() - (stats.since ?? 400) * 864e5,
        }),
      ),
    stateHistory: (ids, o) =>
      Promise.resolve(
        demoStateHistory(ids, o, {
          outages: stats.outages,
          restart: stats.restart != null ? Date.now() - stats.restart * 864e5 : null,
          state: e =>
            entities[e]?.state ||
            (/^(light|switch)\./.test(e) ? lamp(e)?.state : null) ||
            (states[e] != null ? String(states[e]) : null),
        }),
      ),
    energy: () => Promise.resolve(stats.energy || null),
    devices: () => devices,
    entities: () => {
      const out = new Map<string, HaEntityItem>();
      const add = (x: HaEntityItem | null | undefined): void => {
        if (x?.entity && !out.has(x.entity)) out.set(x.entity, x);
      };
      for (const l of lights)
        add({entity: l.entity, name: l.name, area: l.area, domain: l.entity.split('.')[0]});
      for (const w of switches) add({entity: w.entity, name: w.name, area: w.area, domain: 'switch'});
      for (const d of devices)
        add({entity: d.entity, name: d.name, area: d.area, domain: d.domain, cls: d.cls});
      for (const s of sensors)
        if (!s.cat && !s.hidden)
          add({entity: s.entity, name: s.name, area: s.area, domain: 'sensor', cls: s.cls, unit: s.unit});
      for (const x of extra) add(x);
      // a class or a unit may be null here
      return [...out.values()];
    },
    // like hass.states: a sensor has its reading as a string, the unit and class in attributes
    entity: e => {
      if (entities[e]) return entities[e];
      if (/^(light|switch)\./.test(e)) return lamp(e);
      const s = sensors.find(x => x.entity === e);
      // the unit and the class may be null here
      return s && states[e] != null
        ? {
            state: String(states[e]),
            attributes: {unit_of_measurement: s.unit, device_class: s.cls},
          }
        : null;
    },
    _lightsFrom(f) {
      planLights = f;
    },
    call: (domain, service, callData = {}) => {
      // The editor's commands: each has the fields its service needs.
      const data = callData as DemoCallData;
      const e = data.entity_id;
      if (
        (domain === 'light' || domain === 'switch') &&
        ['turn_on', 'turn_off', 'toggle'].includes(service) &&
        !lampsOf(e).length &&
        entities[e] &&
        e.startsWith(domain + '.')
      )
        domain = 'input_boolean'; // a relay not behind a lamp — like a toggle
      if (
        (domain === 'light' || domain === 'switch') &&
        ['turn_on', 'turn_off', 'toggle'].includes(service)
      ) {
        const L = lampsOf(e);
        if (!L.length || !e.startsWith(domain + '.')) return Promise.resolve(false);
        const v = service === 'toggle' ? !L.some(x => x.on !== false) : service === 'turn_on';
        for (const x of L) x.on = v;
        return Promise.resolve(true).then(r => {
          ssubs.forEach(f => f());
          return r;
        });
      }
      const x: DemoEntity | undefined = entities[e];
      if (!x) return Promise.resolve(false);
      const A = x.attributes as DemoAttributes;
      if (domain === 'climate') {
        const last = A._last || (x.state !== 'off' ? x.state : 'cool');
        if (service === 'set_hvac_mode' && A.hvac_modes?.includes(data.hvac_mode)) x.state = data.hvac_mode;
        else if (service === 'turn_off') x.state = 'off';
        else if (service === 'turn_on') x.state = last;
        else if (service === 'set_temperature' && Number.isFinite(data.temperature)) {
          // a demo entity without its own range gets the one the controls show (core/devices.ts acView)
          const lowest = A.min_temp ?? DEFAULT_MIN_TEMP_C;
          const highest = A.max_temp ?? DEFAULT_MAX_TEMP_C;
          A.temperature = Math.max(lowest, Math.min(highest, data.temperature));
        } else if (service === 'set_fan_mode' && A.fan_modes?.includes(data.fan_mode))
          A.fan_mode = data.fan_mode;
        if (x.state !== 'off') A._last = x.state;
        A.hvac_action =
          x.state === 'off'
            ? 'off'
            : x.state === 'heat'
              ? A.current_temperature >= A.temperature
                ? 'idle'
                : 'heating'
              : x.state === 'cool'
                ? A.current_temperature <= A.temperature
                  ? 'idle'
                  : 'cooling'
                : x.state;
      } else if (domain === 'cover') {
        if (service === 'stop_cover') return Promise.resolve(true);
        const pos =
          service === 'open_cover'
            ? 100
            : service === 'close_cover'
              ? 0
              : service === 'set_cover_position'
                ? Math.max(0, Math.min(100, data.position))
                : A.current_position;
        A.current_position = pos;
        x.state = pos > 0 ? 'open' : 'closed';
      }
      // the valve moves for a couple of seconds, like a real ball-valve actuator: opening / closing → open / closed
      // robot: cleaning, pause; return to dock — it drives and docks a few seconds later
      else if (domain === 'vacuum' && ['start', 'pause', 'return_to_base', 'stop'].includes(service)) {
        x.last_changed = new Date().toISOString();
        if (service === 'return_to_base') {
          x.state = 'returning';
          clearTimeout(x._t);
          x._t = setTimeout(() => {
            if (x.state === 'returning') {
              x.state = 'docked';
              ssubs.forEach(f => f());
            }
          }, 4000);
        } else
          x.state = ({start: 'cleaning', pause: 'paused', stop: 'idle'} as Record<string, string>)[service];
      }
      // toggle, fan: on / off; scene — the activation time; a script runs for a couple of seconds; button — the press time
      else if (
        ['input_boolean', 'fan', 'siren', 'humidifier'].includes(domain) &&
        ['turn_on', 'turn_off', 'toggle'].includes(service)
      )
        x.state =
          service === 'toggle' ? (x.state === 'on' ? 'off' : 'on') : service === 'turn_on' ? 'on' : 'off';
      else if (domain === 'scene' && service === 'turn_on') x.state = new Date().toISOString();
      else if (domain === 'script' && service === 'turn_on') {
        x.state = 'on';
        clearTimeout(x._t);
        x._t = setTimeout(() => {
          x.state = 'off';
          ssubs.forEach(f => f());
        }, 2500);
      } else if ((domain === 'button' || domain === 'input_button') && service === 'press')
        x.state = new Date().toISOString();
      else if (domain === 'valve' && (service === 'open_valve' || service === 'close_valve')) {
        const to = service === 'open_valve' ? 'open' : 'closed';
        if (x.state === to) return Promise.resolve(true);
        x.state = to === 'open' ? 'opening' : 'closing';
        x.last_changed = new Date().toISOString();
        setTimeout(() => {
          x.state = to;
          x.last_changed = new Date().toISOString();
          ssubs.forEach(f => f());
        }, 1800);
      } else return Promise.resolve(false);
      return Promise.resolve(true).then(r => {
        ssubs.forEach(f => f());
        return r;
      });
    }, // as in HA — the answer and the new state come later
    _setEntity(e, state, attrs = {}) {
      const x = entities[e];
      if (!x) return;
      x.state = state;
      Object.assign(x.attributes, attrs);
      ssubs.forEach(f => f());
    },
    onChange: f => {
      subs.add(f);
      return () => subs.delete(f);
    },
    areasUrl: 'https://my.home-assistant.io/redirect/areas/',
    devicesUrl: 'https://my.home-assistant.io/redirect/devices/',
    identify: entity => Promise.resolve(entity), // demo: blinks only in the editor
    setArea: (entity, area) => {
      const l = lights.find(x => x.entity === entity) || sensors.find(x => x.entity === entity);
      if (l) l.area = area;
      return Promise.resolve().then(() => subs.forEach(f => f()));
    }, // as in HA — the answer comes later
    // for tests: as if an area was added to or removed from HA
    _add(a) {
      list.push(a);
      subs.forEach(f => f());
    },
    _addSwitch(w) {
      switches.push(w);
      subs.forEach(f => f());
    },
    _remove(id) {
      const i = list.findIndex(a => a.area_id === id);
      if (i >= 0) list.splice(i, 1);
      subs.forEach(f => f());
    },
  };
}
