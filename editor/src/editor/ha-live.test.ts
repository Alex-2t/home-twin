// HA layer on a real hass (the Home Twin panel): the same answers as the demo, from HA registries and states.
import test from 'node:test';
import assert from 'node:assert/strict';
import {liveHA, hassPlans, hassPhotos} from './ha-live.ts';
import type {LocalPhotos, PhotoTodo, PlanUnsent, UnsentMark} from './ha-live.ts';
import type {Hass, HassAttributes, HassEntityState, HassMessage, UnderlayPlace} from '../core/types.ts';
import type {RemoteSaveState} from './editor-types.ts';
import type {UnderlaySave} from './underlay.ts';

globalThis.requestAnimationFrame ??= (callback: FrameRequestCallback) => setTimeout(callback, 0);
const st = (state: string, attributes: HassAttributes = {}): HassEntityState => ({
  state,
  attributes,
  last_changed: '2026-11-08T10:00:00Z',
});

interface FakeHassOptions {
  /** HA's answer to a WebSocket message; an Error: it fails. */
  ws?: (message: HassMessage) => unknown;
  hass?: Partial<Hass>;
}

interface FakeHass {
  h: Hass;
  calls: Array<[string, string, Record<string, unknown> | undefined]>;
  ws: HassMessage[];
}

function fakeHass(over: FakeHassOptions = {}): FakeHass {
  const calls: FakeHass['calls'] = [];
  const ws: HassMessage[] = [];
  // a fake: no fetchWithAuth, liveHA does not use it
  const h = {
    language: 'en',
    areas: {
      kitchen: {area_id: 'kitchen', name: 'Kitchen'},
      bed: {area_id: 'bed', name: 'Bedroom', temperature_entity_id: 'sensor.t'},
    },
    devices: {d1: {id: 'd1', area_id: 'kitchen'}, d2: {id: 'd2', area_id: 'bed'}},
    entities: {
      'light.k': {entity_id: 'light.k', device_id: 'd1'},
      'light.own': {entity_id: 'light.own', area_id: 'bed', name: 'Wall lamp'},
      'light.hidden': {entity_id: 'light.hidden', hidden: true},
      'sensor.t': {entity_id: 'sensor.t', device_id: 'd2'},
      'sensor.diag': {entity_id: 'sensor.diag', device_id: 'd2', entity_category: 'diagnostic'},
      'binary_sensor.leak': {entity_id: 'binary_sensor.leak', device_id: 'd1'},
      'sensor.leak_bat': {entity_id: 'sensor.leak_bat', device_id: 'd1'},
    },
    states: {
      'light.k': st('on', {friendly_name: 'Kitchen light'}),
      'light.own': st('off', {friendly_name: 'Wall lamp'}),
      'light.hidden': st('off'),
      'light.group': st('on', {entity_id: ['light.k', 'light.own']}),
      'sensor.t': st('21.5', {device_class: 'temperature', unit_of_measurement: '°C'}),
      'sensor.diag': st('-60', {unit_of_measurement: 'dBm'}),
      'sensor.ts': st('2026-11-08', {device_class: 'timestamp'}),
      'binary_sensor.leak': st('off', {device_class: 'moisture'}),
      'sensor.leak_bat': st('80', {device_class: 'battery', unit_of_measurement: '%'}),
      'climate.ac': st('cool', {temperature: 22}),
      'weather.home': st('cloudy', {temperature: 12, apparent_temperature: 10}),
      'sun.sun': st('above_horizon', {
        next_rising: '2026-11-09T05:05:00Z',
        next_setting: '2026-11-08T14:40:00Z',
      }),
    },
    callService: (d, s, data) => {
      calls.push([d, s, data]);
      return Promise.resolve();
    },
    callWS: msg => {
      ws.push(msg);
      const r = over.ws?.(msg);
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    },
    connection: {
      subscribeMessage: (cb, msg) => {
        ws.push(msg);
        cb({forecast: [{datetime: '2026-11-08T13:00:00Z', condition: 'rainy', temperature: 11}]});
        return Promise.resolve(() => {});
      },
    },
    hassUrl: p => 'http://ha.local:8123' + p,
    ...over.hass,
  } as Hass;
  return {h, calls, ws};
}

test("areas, lamps, sensors: the area is its own or the device's; no hidden or service ones", () => {
  const {h} = fakeHass();
  const ha = liveHA(h);
  assert.deepEqual(
    ha.areas().map(a => a.name),
    ['Bedroom', 'Kitchen'],
  );
  assert.equal(ha.areas()[0].temperature_entity_id, 'sensor.t');
  const L = ha.lights();
  assert.deepEqual(
    L.map(l => [l.id, l.area]),
    [
      ['group', null],
      ['k', 'kitchen'],
      ['own', 'bed'],
    ],
    "no hidden one; light.k has the device's area",
  );
  assert.deepEqual(L[0].members, ['light.k', 'light.own'], 'a light group — with members');
  assert.equal(L[1].name, 'Kitchen light');
  const S = ha.sensors();
  assert.equal(S.find(s => s.entity === 'sensor.t')?.area, 'bed');
  assert.equal(
    S.find(s => s.entity === 'sensor.diag')?.cat,
    'diagnostic',
    'a service one — flagged, core/sensors.js decides',
  );
  assert.equal(
    S.some(s => s.entity === 'sensor.ts'),
    false,
    'a timestamp is not a reading',
  );
  assert.equal(ha.state('sensor.t'), 21.5);
  assert.equal(ha.state('light.k'), null);
  assert.equal(ha.entity('climate.ac')?.attributes.temperature, 22);
  const leak = ha.devices().find(d => d.entity === 'binary_sensor.leak');
  assert.equal(leak?.battery, 'sensor.leak_bat', 'the charge is an entity of the same device');
});

test('registries not received — ready() false: an empty area list does not mean “deleted”', () => {
  assert.equal(liveHA({states: {}} as Hass).ready(), false);
  assert.equal(liveHA(fakeHass().h).ready(), true);
});

test('new states — onState once per frame; registries — onChange', async () => {
  const {h} = fakeHass();
  const ha = liveHA(h);
  let n = 0;
  let c = 0;
  ha.onState(() => n++);
  ha.onChange(() => c++);
  ha.update({...h, states: {...h.states}});
  ha.update({...h, states: {...h.states}});
  await new Promise(r => setTimeout(r, 5));
  assert.equal(n, 1, 'two events — one redraw');
  assert.equal(c, 0);
  ha.update({...h, areas: {...h.areas}});
  assert.equal(c, 1);
});

test('commands and area: HA does not give an area to an entity without its own name — write it to the device', async () => {
  const err = Object.assign(new Error('x'), {code: 'invalid_info'});
  const {h, calls, ws} = fakeHass({ws: m => (m.type === 'config/entity_registry/update' ? err : {})});
  const ha = liveHA(h);
  assert.equal(await ha.call('climate', 'set_temperature', {entity_id: 'climate.ac', temperature: 23}), true);
  assert.deepEqual(calls[0], ['climate', 'set_temperature', {entity_id: 'climate.ac', temperature: 23}]);
  await ha.setArea('light.k', 'bed');
  assert.deepEqual(ws.at(-1), {type: 'config/device_registry/update', device_id: 'd1', area_id: 'bed'});
  await assert.rejects(
    () => ha.setArea('light.own', 'kitchen'),
    'for an own entity without a device, the error goes up',
  );
});

test('weather with an hourly forecast, sunrise and sunset from sun.sun', async () => {
  const {h} = fakeHass();
  const ha = liveHA(h);
  ha.weather();
  await new Promise(r => setTimeout(r, 5));
  const w = ha.weather();
  assert.ok(w);
  assert.deepEqual([w.entity, w.condition, w.temperature, w.feels], ['weather.home', 'cloudy', 12, 10]);
  assert.deepEqual(w.hourly, [{at: Date.parse('2026-11-08T13:00:00Z'), condition: 'rainy', temperature: 11}]);
  assert.equal(w.sunset, Date.parse('2026-11-08T14:40:00Z'));
});

test('history for 3 hours — 36 points 5 minutes apart; statistics and “Energy” in the demo format', async () => {
  const now = Date.now();
  const {h} = fakeHass({
    ws: m =>
      m.type === 'history/history_during_period'
        ? {
            'sensor.t': [
              {s: '20', lu: (now - 3 * 3600e3) / 1000},
              {s: '22', lu: (now - 30 * 60e3) / 1000},
              {s: 'bad', lu: (now - 10 * 60e3) / 1000},
            ],
          }
        : m.type === 'recorder/statistics_during_period'
          ? {'sensor.e': [{start: 1, end: 2, change: 3}]}
          : m.type === 'energy/get_prefs'
            ? {
                energy_sources: [{type: 'grid', flow_from: [{stat_energy_from: 'sensor.grid'}]}],
                device_consumption: [{stat_consumption: 'sensor.tv', included_in_stat: 'sensor.grid'}],
              }
            : {},
  });
  const ha = liveHA(h);
  assert.deepEqual(ha.history('sensor.t'), [], 'right away — whatever there is, the request is sent');
  await new Promise(r => setTimeout(r, 5));
  const H = ha.history('sensor.t');
  assert.equal(H.length, 36);
  assert.equal(H[0], 20);
  assert.equal(H[35], 22);
  assert.deepEqual(await ha.statistics(['sensor.e'], {start: 0, end: 1, period: 'day', types: ['change']}), {
    'sensor.e': [{start: 1, end: 2, change: 3}],
  });
  assert.deepEqual(await ha.energy(), {
    grid: ['sensor.grid'],
    devices: [{statistic: 'sensor.tv', name: undefined, parent: 'sensor.grid'}],
  });
});

test('plan in HA: written with a delay and a revision number; changed in another window — do not write, ask', async () => {
  let rev = 3;
  let conflicts = 0;
  const sent: HassMessage[] = [];
  const hass = {
    callWS: async (m: HassMessage) => {
      sent.push(m);
      if (m.type === 'home_twin/plan/get') return {plan: {rooms: []}, rev};
      if (m.rev != null && m.rev !== rev) throw Object.assign(new Error('c'), {code: 'conflict'});
      return {rev: ++rev};
    },
  };
  const P = hassPlans(() => hass, {onConflict: () => conflicts++});
  assert.deepEqual(await P.load(), {plan: {rooms: []}, rev: 3});
  P.save({rooms: [1]});
  P.save({rooms: [1, 2]});
  await P.flush();
  assert.equal(
    sent.filter(m => m.type === 'home_twin/plan/save').length,
    1,
    'two edits in a row — one write',
  );
  assert.deepEqual(sent.at(-1), {type: 'home_twin/plan/save', plan: {rooms: [1, 2]}, rev: 3});
  rev = 10; // another window wrote its own
  P.save({rooms: [9]});
  await P.flush();
  assert.equal(conflicts, 1);
  P.keepMine();
  await new Promise(r => setTimeout(r, 5));
  assert.equal(sent.at(-1)?.rev, undefined, '“Keep mine” — without a revision, on top');
});

const memMark = <Value>(v: Value | null = null): UnsentMark<Value> & {v: Value | null} => ({
  v,
  get() {
    return this.v;
  },
  set(x) {
    this.v = x;
  },
  clear() {
    this.v = null;
  },
});

test('plan in HA: no connection — retried, the state is “offline”; the plan HA already has is not written again', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let rev = 1;
  let down = true;
  const sent: HassMessage[] = [];
  const states: RemoteSaveState[] = [];
  const mark = memMark<PlanUnsent>();
  const hass = {
    callWS: async (m: HassMessage) => {
      if (down) throw new Error('lost');
      sent.push(m);
      return m.type === 'home_twin/plan/get' ? {plan: {rooms: []}, rev} : {rev: ++rev};
    },
  };
  const P = hassPlans(() => hass, {onStatus: s => states.push(s), mark});
  down = false;
  await P.load(null);
  down = true;
  P.save({rooms: []});
  assert.equal(mark.v, null, 'the same plan as in HA — nothing to send');
  P.save({rooms: [1]});
  assert.deepEqual(mark.v, {rev: 1}, 'not sent yet — marked, from revision 1');
  await P.flush();
  assert.deepEqual(states, ['offline']);
  assert.equal(P.state(), 'offline');
  down = false;
  await P.flush();
  assert.deepEqual(states, ['offline', 'saved']);
  assert.equal(mark.v, null, 'sent — the mark is gone');
  assert.deepEqual(sent.at(-1), {type: 'home_twin/plan/save', plan: {rooms: [1]}, rev: 1});
});

test('plan in HA: the editor changes its plan in place — every change after a write is still sent', async () => {
  let rev = 1;
  const sent: HassMessage[] = [];
  const hass = {
    callWS: async (m: HassMessage) => {
      sent.push(structuredClone(m));
      return m.type === 'home_twin/plan/get' ? {plan: {rooms: []}, rev} : {rev: ++rev};
    },
  };
  const P = hassPlans(() => hass, {mark: memMark()});
  const plan = (await P.load(null)).plan as {rooms: number[]}; // the fake HA's plan
  plan.rooms.push(1);
  P.save(plan);
  await P.flush();
  plan.rooms.push(2);
  P.save(plan);
  await P.flush();
  assert.deepEqual(
    sent.filter(m => m.type === 'home_twin/plan/save').map(m => (m.plan as {rooms: number[]}).rooms),
    [[1], [1, 2]],
  );
});

test('plan in HA: edits that did not reach HA last time — sent at the start if HA has not changed, otherwise asked', async () => {
  let rev = 4;
  const sent: HassMessage[] = [];
  let conflicts = 0;
  const hass = {
    callWS: async (m: HassMessage) => {
      sent.push(m);
      return m.type === 'home_twin/plan/get' ? {plan: {rooms: ['ha']}, rev} : {rev: ++rev};
    },
  };
  // HA is still at revision 4 — the browser's plan wins and goes up
  let P = hassPlans(() => hass, {mark: memMark({rev: 4})});
  assert.deepEqual((await P.load({rooms: ['mine']})).plan, {rooms: ['mine']});
  await P.flush();
  assert.deepEqual(sent.at(-1), {type: 'home_twin/plan/save', plan: {rooms: ['mine']}, rev: 4});
  // another window has written since — nothing is written, the editor asks
  sent.length = 0;
  P = hassPlans(() => hass, {mark: memMark({rev: 2}), onConflict: () => conflicts++});
  assert.deepEqual((await P.load({rooms: ['mine']})).plan, {rooms: ['mine']});
  await P.flush();
  assert.equal(conflicts, 1);
  assert.equal(P.state(), 'conflict');
  assert.equal(sent.filter(m => m.type === 'home_twin/plan/save').length, 0);
  // the mark is there, but the browser has exactly what HA has (the last write did arrive) — nothing to do
  const mark = memMark({rev: 1});
  P = hassPlans(() => hass, {mark});
  assert.deepEqual((await P.load({rooms: ['ha']})).plan, {rooms: ['ha']});
  assert.equal(mark.v, null);
});

// the plan photo: a fake HA (websocket + HTTP) and a fake browser store
interface FakePhotoHa {
  photo: {id: string; type: string; place: UnderlayPlace | null} | null;
  never: boolean;
  file: Uint8Array<ArrayBuffer> | null;
  down: boolean;
  calls: string[];
  hass: Pick<Hass, 'callWS' | 'fetchWithAuth'>;
}
function photoHA(): FakePhotoHa {
  // hass is set just below: its fakes read this object
  const ha = {photo: null, never: true, file: null, down: false, calls: []} as unknown as FakePhotoHa;
  const fail = () => {
    if (ha.down) throw new Error('lost');
  };
  ha.hass = {
    callWS: async (m: HassMessage) => {
      fail();
      ha.calls.push(m.type);
      if (m.type === 'home_twin/photo/get') return {photo: ha.photo, never: ha.never};
      if (m.type === 'home_twin/photo/place') {
        if (ha.photo?.id !== m.photo) throw Object.assign(new Error('x'), {code: 'no_photo'});
        ha.photo!.place = m.place as UnderlayPlace; // the id matched, so there is a photo
        return {};
      }
      if (m.type === 'home_twin/photo/delete') {
        ha.photo = null;
        ha.never = false;
        ha.file = null;
        return {};
      }
    },
    // fake responses: only what hassPhotos reads; the photo and the file are there when they are read
    fetchWithAuth: async (path: string, init: RequestInit = {}) => {
      fail();
      ha.calls.push((init.method || 'GET') + ' ' + path);
      if (init.method === 'POST') {
        ha.file = new Uint8Array(await (init.body as Blob).arrayBuffer());
        ha.photo = {
          id: 'p' + ha.file.length,
          type: (init.headers as Record<string, string>)['Content-Type'],
          place: null,
        };
        ha.never = false;
        return {ok: true, json: async () => ({id: ha.photo!.id})} as Response;
      }
      return ha.file
        ? ({ok: true, blob: async () => new Blob([ha.file!], {type: ha.photo!.type})} as Response)
        : ({ok: false, status: 404} as Response);
    },
  };
  return ha;
}
function memPhotos(): LocalPhotos & {src: string | null; at: UnderlaySave | null} {
  const m: LocalPhotos & {src: string | null; at: UnderlaySave | null} = {
    src: null,
    at: null,
    where: () => m.at,
    load: async () => (m.src && m.at ? {src: m.src, place: m.at} : null),
    put: async s => {
      m.src = s;
    },
    place: p => {
      m.at = p;
      return true;
    },
    clear: async () => {
      m.src = null;
      m.at = null;
    },
  };
  return m;
}
// Node has no FileReader: a stand-in with what hassPhotos uses
globalThis.FileReader ??= class {
  declare result: string;
  declare onload: () => void;
  readAsDataURL(b: Blob): void {
    b.arrayBuffer().then(x => {
      this.result = `data:${b.type};base64,` + Buffer.from(x).toString('base64');
      this.onload();
    });
  }
} as unknown as typeof FileReader;
const SRC = 'data:image/png;base64,' + Buffer.from('fake-png-bytes').toString('base64');
const AT: UnderlayPlace = {a: [0.01, 0], b: [0, 5], opacity: 0.7, visible: true};

test('plan photo in HA: the image goes over HTTP, then its placement; another device reads both', async () => {
  const ha = photoHA();
  const local = memPhotos();
  const mark = memMark<PhotoTodo>();
  const P = hassPhotos(() => ha.hass, {local, mark});
  assert.equal(await P.load(), null, 'HA has no photo, the browser neither');
  await P.put(SRC);
  P.place(AT);
  await P.flush();
  assert.equal(ha.photo?.type, 'image/png');
  assert.deepEqual(ha.photo?.place, AT);
  assert.equal(local.src, null, 'sent — the browser copy is not needed');
  assert.equal(mark.v, null);
  P.place({...AT, opacity: 0.3});
  await P.flush();
  assert.equal(ha.photo?.place?.opacity, 0.3, 'only the placement changed — only it is sent');
  const other = hassPhotos(() => ha.hass, {local: memPhotos(), mark: memMark()});
  const r = await other.load();
  assert.ok(r);
  assert.equal(r.src, SRC);
  assert.equal((r.place as UnderlayPlace).opacity, 0.3);
  await other.clear();
  await other.flush();
  assert.equal(ha.photo, null);
  assert.equal(ha.file, null);
});

test('plan photo in HA: no connection — kept in the browser, sent on the next start; one kept before D-058 is brought over once', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const ha = photoHA();
  const local = memPhotos();
  const mark = memMark<PhotoTodo>();
  const states: RemoteSaveState[] = [];
  let P = hassPhotos(() => ha.hass, {local, mark, onStatus: s => states.push(s)});
  await P.load();
  ha.down = true;
  await P.put(SRC);
  P.place(AT);
  await P.flush();
  assert.equal(P.state(), 'offline');
  assert.deepEqual(states, ['offline']);
  assert.equal(local.src, SRC, 'not sent — the browser keeps it');
  // the tab was closed; next time HA is back
  ha.down = false;
  P = hassPhotos(() => ha.hass, {local, mark});
  assert.equal((await P.load())?.src, SRC, 'shown right away from the browser');
  await P.flush();
  assert.deepEqual(ha.photo?.place, AT);
  assert.equal(local.src, null);
  // before D-058 the photo was only in this browser and HA has never had one — it moves to HA
  const ha2 = photoHA();
  const old = memPhotos();
  await old.put(SRC);
  old.place(AT);
  P = hassPhotos(() => ha2.hass, {local: old, mark: memMark()});
  assert.equal((await P.load())?.src, SRC);
  await P.flush();
  assert.deepEqual(ha2.photo?.place, AT);
  // HA had a photo and it was removed — the old browser copy does not come back
  const ha3 = photoHA();
  ha3.never = false;
  const stale = memPhotos();
  await stale.put(SRC);
  stale.place(AT);
  P = hassPhotos(() => ha3.hass, {local: stale, mark: memMark()});
  assert.equal(await P.load(), null);
  await P.flush();
  assert.equal(ha3.photo, null);
});

test('the sun from sun.sun (D-068)', () => {
  const {h} = fakeHass();
  const ha = liveHA(h);
  assert.equal(ha.sunDown(), false);
  h.states['sun.sun'] = {...h.states['sun.sun'], state: 'below_horizon'};
  assert.equal(liveHA(h).sunDown(), true);
  assert.equal(liveHA({states: {}} as Hass).sunDown(), false, 'no sun.sun — day');
});
