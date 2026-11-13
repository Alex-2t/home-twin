// “Security” in the overview — as in 3d_floor/apartment/smart-home/web/src (D-049): card.js — watchMarkup, updateLeaks,
// updateWatch, waterPress; overview.js — leakView, waterView, sinceText. Below “Lights & climate”: a camera frame, the water valve and
// the “Leaks” tile with a button per sensor.
// Difference from 3d_floor: devices come not from the card settings but from HA by kind — camera (camera.*), water valve (valve.* of class
// water or without a class — or a motorized valve that arrived as a curtain: a cover without a class with “valve” in its name, as at the owner's;
// a gas valve is not water; core/devices.js: isWaterValve), leak sensors (binary_sensor of class moisture) with the battery
// of their own device. None at all — no section. Time follows the browser clock, not the 3d_floor time zone. No DOM: look.js lays out the markup.
import {t, locale, clock} from '../i18n/i18n.ts';
import {isWaterValve} from '../core/devices.ts';
import type {HaLayer, HassEntityState} from '../core/types.ts';

/** What "Security" reads of the HA layer; a layer without devices has none. */
export type SecurityHa = Partial<Pick<HaLayer, 'devices' | 'entity'>>;

/** The plan room of an HA area: its id, short name and kind (core/overview.ts roomKind). */
export interface SecurityRoom {
  id: string;
  short: string;
  kind?: string;
}

/** The camera the overview shows: its frame (picture) while it answers. */
export interface SecurityCamera {
  entity: string;
  name: string;
  room: string | null;
  ok: boolean;
  picture: string | null;
}

/** A water valve: 'available', 'unavailable' or 'unbound' (no entity); value: its state in HA (open, closed, opening, closing). */
export interface SecurityWater {
  entity: string;
  /** 'valve', or 'cover' for a motorised valve that came as a cover. */
  domain: string;
  name: string;
  room: string | null;
  status: string;
  value: string | null;
}

/** A leak sensor: state as in HA ('on' water, 'off' dry, anything else offline), its battery (percent) and low-battery flag, since when (ms). */
export interface LeakSensor {
  entity: string;
  room?: string | null;
  label: string;
  state: string;
  battery?: string | number | null;
  low?: boolean;
  since?: number;
}

/** "Security" in the overview: the camera, the water valves, the leak sensors. */
export interface SecurityDevices {
  camera: SecurityCamera | null;
  water: SecurityWater[];
  leaks: LeakSensor[];
}

/** A leak sensor's button in the "Leaks" tile: its state and tooltip. */
export interface LeakItem {
  entity: string;
  room: string | null;
  label: string;
  state: 'leak' | 'offline' | 'low' | 'dry';
  tip: string;
}

/** The "Leaks" tile: the worst state, a summary and a button per sensor. */
export interface LeakView {
  state: 'leak' | 'offline' | 'warn' | 'dry';
  text: string;
  items: LeakItem[];
}

/** The water valve tile: its state, its text and what a tap asks for (null: nothing). */
export interface WaterView {
  state: string;
  text: string;
  action: 'open' | 'close' | null;
}

/** An alarm for "Now" (overview.ts activeChips). */
export interface SecurityAlert {
  entity: string;
  label: string;
  icon: string;
  room?: string | null;
}

export const LOW_BATTERY = 20;
const number = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const lost = (x: HassEntityState | null): boolean => !x || ['unavailable', 'unknown'].includes(x.state);
// the entrance camera — by name, if the room is not a hallway
const ENTRY =
  /вход|прихож|коридор|двер|front|door|entr|porch|hall|eingang|flur|haustür|entrée|porte|entrada|puerta|ingresso|porta|voordeur|hal\b|wejści|drzwi|门/i;

// “Security” devices from the HA layer: devices() → [{entity, name, area, domain, cls, battery?, low?}] (battery — charge
// percentage, low — the “battery low” flag of the same device), entity(e) → {state, attributes, last_changed}.
// room(area) → {id, short, kind} — the plan room with that area, or null.
// Several cameras — the overview shows one: at the entrance (a hallway, or “entrance”, “door” in the name), otherwise the first.
// A leak sensor's caption is its room; two sensors in one room or no room — the sensor name.
// Valve — {domain: valve | cover, …}: their commands differ (valveCommand), the states are the same — open, closed, opening, closing.
// → {camera: {entity, name, room, ok, picture} | null, water: [{entity, domain, name, room, status, value}],
//    leaks: [{entity, room, label, state, battery, low, since}]}
export function securityDevices(
  ha: SecurityHa | null | undefined,
  room: (area: string | null) => SecurityRoom | null = () => null,
): SecurityDevices {
  const out: SecurityDevices = {camera: null, water: [], leaks: []};
  if (!ha?.devices) return out;
  const ent = (e: string): HassEntityState | null => ha.entity?.(e) || null;
  const list = ha.devices();
  const cams = list.filter(d => d.domain === 'camera').map(d => ({d, r: room(d.area)}));
  const cam = cams.find(c => c.r?.kind === 'hall' || ENTRY.test(c.d.name || '')) || cams[0];
  if (cam) {
    const x = ent(cam.d.entity);
    out.camera = {
      entity: cam.d.entity,
      name: cam.d.name || cam.d.entity,
      room: cam.r?.id || null,
      ok: !lost(x),
      picture: lost(x) ? null : x?.attributes?.entity_picture || null,
    };
  }
  for (const d of list.filter(isWaterValve)) {
    const x = ent(d.entity);
    out.water.push({
      entity: d.entity,
      domain: d.domain,
      name: d.name || d.entity,
      room: room(d.area)?.id || null,
      status: x ? (lost(x) ? 'unavailable' : 'available') : 'unbound',
      value: x?.state ?? null,
    });
  }
  const leaks = list
    .filter(d => d.domain === 'binary_sensor' && d.cls === 'moisture')
    .map(d => ({d, r: room(d.area)}));
  const twice = new Set(leaks.map(l => l.r?.id).filter((id, i, a) => id && a.indexOf(id) !== i));
  for (const {d, r} of leaks) {
    const x = ent(d.entity);
    out.leaks.push({
      entity: d.entity,
      room: r?.id || null,
      label: r && !twice.has(r.id) ? r.short : d.name || d.entity,
      state: x?.state ?? 'unavailable',
      battery: d.battery ? (ent(d.battery)?.state ?? null) : null,
      low: d.low ? ent(d.low)?.state === 'on' : false,
      // no time: NaN
      since: Date.parse(x?.last_changed ?? ''),
    });
  }
  return out;
}

// “since 14:05” today, “since October 26” earlier
export function sinceText(at: number | undefined, now = Date.now()): string {
  if (at === undefined || !Number.isFinite(at)) return '';
  const day = (v: number): string => new Intl.DateTimeFormat(locale(), {dateStyle: 'short'}).format(v);
  return t(
    'since {0}',
    day(at) === day(now)
      ? clock(at)
      : new Intl.DateTimeFormat(locale(), {day: 'numeric', month: 'long'}).format(at),
  );
}

/**
 * The “Leaks” tile: a summary and a button per sensor. sensors — {entity, room, label, state, battery, low, since}: state
 * as in HA ('on' — water, 'off' — dry, anything else — offline), battery — percentage, low — the “battery low” flag, since — when the sensor
 * stopped responding. Worst first: water, then missing sensors, then batteries. No sensors — null, no tile.
 */
export function leakView(sensors: LeakSensor[] = [], now = Date.now()): LeakView | null {
  if (!sensors.length) return null;
  const items = sensors.map((s): LeakItem => {
    const battery = number(s.battery);
    const state: LeakItem['state'] =
      s.state === 'on'
        ? 'leak'
        : s.state !== 'off'
          ? 'offline'
          : s.low || (battery !== null && battery <= LOW_BATTERY)
            ? 'low'
            : 'dry';
    const charge = battery !== null ? ` ${Math.round(battery)} %` : '';
    const tip = {
      leak: () => t('leak!'),
      offline: () => t('offline {0}', sinceText(s.since, now)).trim(),
      low: () => t('dry, battery low{0}', charge),
      dry: () => (charge ? t('dry, battery{0}', charge) : t('dry')),
    }[state]();
    return {entity: s.entity, room: s.room || null, label: s.label, state, tip: `${s.label}: ${tip}`};
  });
  const of = (state: LeakItem['state']): LeakItem[] => items.filter(i => i.state === state);
  const wet = of('leak');
  const gone = of('offline');
  const low = of('low');
  if (wet.length) return {state: 'leak', text: t('Leak: {0}', wet.map(i => i.label).join(', ')), items};
  if (gone.length === items.length) return {state: 'offline', text: t('No connection'), items};
  if (gone.length) return {state: 'warn', text: t('Dry, {0} offline', gone.length), items};
  if (low.length) return {state: 'warn', text: t('Battery low'), items};
  return {state: 'dry', text: items.length > 1 ? t('All dry') : t('Dry|leak'), items};
}

/**
 * Water valve: what to show and what to do on tap. Water must not be shut off by an accidental touch, so the command is sent on
 * the second tap — the first one only asks (confirm). value — the valve state in HA: open, closed, opening, closing.
 */
export function waterView({
  status = 'unbound',
  value = null,
  pending = false,
  confirm = false,
}: {status?: string; value?: string | null; pending?: boolean; confirm?: boolean} = {}): WaterView {
  if (status === 'unbound') return {state: 'unbound', text: t('Not linked'), action: null};
  if (status === 'unavailable') return {state: 'unavailable', text: t('Unavailable'), action: null};
  if (pending) return {state: 'moving', text: t('Sending command…'), action: null};
  if (value === 'opening') return {state: 'moving', text: t('Opening…'), action: null};
  if (value === 'closing') return {state: 'moving', text: t('Shutting off…'), action: null};
  if (value === 'closed')
    return {state: 'closed', text: confirm ? t('Tap again to open') : t('Shut off'), action: 'open'};
  return {state: 'open', text: confirm ? t('Tap again to shut off') : t('Valve open'), action: 'close'};
}

// Valve command to HA: valve.open_valve / close_valve; for a valve that is a cover — cover.open_cover / close_cover. → [domain, service]
export const valveCommand = (w: Pick<SecurityWater, 'domain'>, action: string | null): [string, string] =>
  w.domain === 'cover'
    ? ['cover', action === 'close' ? 'close_cover' : 'open_cover']
    : ['valve', action === 'close' ? 'close_valve' : 'open_valve'];

// Alarms for “Now” — the very first chips: a triggered leak sensor and shut-off water.
// → {alerts: [{entity, label, icon, room}], water: {closed} | null}
export function securityAlerts(sec: {
  camera?: SecurityCamera | null;
  leaks: Array<Pick<LeakSensor, 'entity' | 'label' | 'state' | 'room'>>;
  water: Array<Pick<SecurityWater, 'value'>>;
}): {
  alerts: SecurityAlert[];
  water: {closed: boolean} | null;
} {
  const alerts = sec.leaks
    .filter(s => s.state === 'on')
    .map((s): SecurityAlert => ({
      entity: s.entity,
      label: t('Leak: {0}', s.label),
      icon: 'leak',
      room: s.room,
    }));
  return {alerts, water: sec.water.length ? {closed: sec.water.some(w => w.value === 'closed')} : null};
}
