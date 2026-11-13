// Rules of the “Whole home” dashboard — carried over from 3d_floor/apartment/smart-home/web/src/overview.js and ac-state.js (D-049):
// the day line, the “Now” chips, light and climate tiles, the second room line. No DOM; look.js lays out the markup.
// Differences from 3d_floor: translations go through the editor's t() (placeholders {0}, {1}); any home (not only the owner's apartment);
// TV, vacuum, water and alarm chips — once those devices appear in the HA layer. An open window or door is a “warn” chip.
import {t, N, getLang, num} from '../i18n/i18n.ts';
import type {Lang} from '../core/types.ts';

/** A room's readings as the dashboard rounds them (look.ts model().climate); null: no sensor or no number. */
export interface RoomReadings {
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
}

/** An air conditioner mode's icon and tone (a colour class in card.css). */
export interface ModeLook {
  icon: string;
  tone: string;
}

/** A device behind a "Now" chip: its id and its room (null: none); the lists that feed the chips carry more. */
export interface ChipDevice {
  id: string;
  room?: string | null;
}

/** What the "Now" chips are made from (look.ts nowChips); every list may be left out. */
export interface ChipSources {
  lights?: Array<ChipDevice & {on: boolean}>;
  acs?: Array<ChipDevice & {on: boolean; mode?: string}>;
  covers?: Array<ChipDevice & {open: boolean}>;
  /** Open windows and doors. */
  open?: Array<ChipDevice & {name: string; icon?: string}>;
  /** A triggered leak sensor (security.ts securityAlerts). */
  alerts?: Array<{entity: string; label: string; icon: string; room?: string | null}>;
  /** The water valve: shut off or not; null: there is none. */
  water?: {closed: boolean} | null;
  vacuum?: Array<ChipDevice & {cleaning: boolean}>;
  rooms?: Array<{id: string; short: string}>;
  climate?: Partial<Record<string, Pick<RoomReadings, 'co2'>>>;
}

/** A "Now" chip: its key, kind, icon and caption; count: how many devices (none for one); rooms: where they are. */
export interface Chip {
  key: string;
  kind: string;
  icon: string;
  label: string;
  count: number | null;
  rooms: string[];
  devices: ChipDevice[];
  tone: string | null;
}

/** An air conditioner's or a heater's state for its tile (look.ts model): see climateTile. */
export interface ClimateState {
  /** 'available', 'unavailable' or 'unbound' (no HA entity). */
  status: string;
  on?: boolean;
  mode?: string;
  action?: string;
  temperature?: number | null;
  current?: number | null;
  canTemperature?: boolean;
  /** A setpoint range from low to high instead of one temperature. */
  range?: boolean;
  low?: number | null;
  high?: number | null;
}

/** A climate tile: its state and caption, the current and target temperature; on: whether it can be adjusted, its icon and tone. */
export interface ClimateTile {
  state: 'unbound' | 'unavailable' | 'off' | 'on';
  status: string;
  current: number | null;
  target?: string | null;
  adjustable?: boolean;
  icon?: string;
  tone?: string;
}

/** A lamp for the room's light tile: its id, kind ('ceiling' is the main light), whether it is on and reachable. */
export interface TileLamp {
  id: string;
  kind?: string;
  on: boolean;
  status: string;
}

/** A room's light tile; power: what its button sends (turn these lamps on or off), null: nothing to send. */
export interface LightTile {
  state: 'unavailable' | 'on' | 'off';
  status: string;
  lit: number;
  power: {on: boolean; ids: string[]} | null;
}

/** A piece of the second room line; tone: 'stuffy' or 'bad' for CO₂ above normal. */
export interface RoomLinePart {
  text: string;
  tone: string | null;
}

export const CO2_STUFFY = 1000;
export const CO2_BAD = 1500;
const number = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const loc = (): Lang => getLang();

// Air conditioner modes: the icon is as in Home Assistant, the tone is a color class in card.css (heat is warm, cool is light blue,
// dry is lilac, fan is turquoise, auto is a sun with a snowflake, green).
export const MODE_NAMES: Record<string, string> = {
  off: N('Off'),
  cool: N('Cool'),
  heat: N('Heat'),
  auto: N('Auto'),
  heat_cool: N('Heat / cool'),
  dry: N('Dry'),
  fan_only: N('Fan|mode'),
};
const MODE_LOOK: Record<string, ModeLook> = {
  cool: {icon: 'snowflake', tone: 'cool'},
  heat: {icon: 'flame', tone: 'heat'},
  auto: {icon: 'sun-snow', tone: 'auto'},
  heat_cool: {icon: 'sun-snow', tone: 'auto'},
  dry: {icon: 'droplet', tone: 'dry'},
  fan_only: {icon: 'fan', tone: 'fan'},
};
export const modeLook = (mode: string | undefined): ModeLook =>
  (mode && MODE_LOOK[mode]) || {icon: 'wind', tone: 'cool'};

export const formatDegrees = (value: unknown): string => {
  const n = number(value);
  if (n === null) return '';
  return num(Math.round(n * 10) / 10, undefined, {grouping: 'auto', maximumFractionDigits: 1}).replace(
    '-',
    '−',
  );
};
// “Sunday, November 1”
export function dayLine(now = Date.now()): string {
  const text = new Intl.DateTimeFormat(loc(), {weekday: 'long', day: 'numeric', month: 'long'}).format(now);
  return text[0].toUpperCase() + text.slice(1);
}
// “home 20–24°” from room readings; no readings — null. climate: {room: {temperature, humidity, co2}}
export function homeRange(
  climate: Partial<Record<string, Pick<RoomReadings, 'temperature'>>> | null | undefined,
): string | null {
  const temps = Object.values(climate || {})
    .map(c => number(c?.temperature))
    .filter(n => n !== null)
    .map(Math.round);
  if (!temps.length) return null;
  const low = Math.min(...temps);
  const high = Math.max(...temps);
  return t('home {0}', low === high ? `${low}°` : `${low}–${high}°`);
}
export function co2Level(value: unknown): 'bad' | 'stuffy' | 'ok' | null {
  const n = number(value);
  if (n === null) return null;
  return n >= CO2_BAD ? 'bad' : n >= CO2_STUFFY ? 'stuffy' : 'ok';
}
// Russian accusative case for “Air out the {0}” (Russian UI only): room names are either feminine (endings -a/-ya/-aya) or masculine inanimate.
// “from:to” endings as one pattern string (not UI text), in order: the first match wins
const ACC = 'ая:ую|яя:юю|я:ю|а:у'.split('|').map(p => p.split(':')); // allow-cyrillic: Russian grammar endings, used only when the UI language is Russian
export const accusative = (word: string): string => {
  if (loc() !== 'ru') return word;
  const ending = ACC.find(([from]) => word.endsWith(from));
  return ending ? word.slice(0, -ending[0].length) + ending[1] : word;
};

// “Now” chips: one per kind of running device. Alarms come first — an open door and a stuffy room matter more than
// lights that are on. Each chip has a list of rooms: the model uses it to highlight where that is.
export function activeChips({
  lights = [],
  acs = [],
  covers = [],
  open = [],
  alerts = [],
  water = null,
  vacuum = [],
  rooms = [],
  climate = {},
}: ChipSources = {}): Chip[] {
  const chips: Chip[] = [];
  const roomsOf = (list: ChipDevice[]): string[] => [
    ...new Set(list.map(d => d.room).filter((room): room is string => Boolean(room))),
  ];
  const push = (
    key: string,
    kind: string,
    icon: string,
    label: string,
    devices: ChipDevice[],
    {plural, count = true, tone = null}: {plural?: string; count?: boolean; tone?: string | null} = {},
  ): void => {
    if (!devices.length) return;
    chips.push({
      key,
      kind,
      icon,
      label: devices.length > 1 && plural ? plural : label,
      count: count && devices.length > 1 ? devices.length : null,
      rooms: roomsOf(devices),
      devices,
      tone,
    });
  };
  // a triggered leak sensor and shut-off water come first of all (look/security.js: securityAlerts)
  for (const a of alerts)
    push('alert:' + a.entity, 'alert', a.icon, a.label, [{id: a.entity, room: a.room || null}]);
  if (water?.closed) push('water', 'alert', 'droplet', t('Water shut off'), [{id: 'water', room: null}]);
  for (const d of open) push('open:' + d.id, 'warn', d.icon || 'door', t('Open: {0}', d.name), [d]);
  for (const room of rooms) {
    const level = co2Level(climate?.[room.id]?.co2);
    if (level === 'stuffy' || level === 'bad')
      push(
        'air:' + room.id,
        'warn',
        'wind',
        t('Air out the {0}', accusative(String(room.short).toLowerCase())),
        [{id: room.id, room: room.id}],
      );
  }
  push(
    'light',
    'light',
    'bulb',
    t('Lights'),
    lights.filter(d => d.on),
  );
  // all running air conditioners in one mode — the chip gets its color and icon; different modes — a generic icon and light blue
  const cooling = acs.filter(d => d.on);
  const looks = cooling.map(d => modeLook(d.mode));
  const look = new Set(looks.map(l => l.icon)).size === 1 ? looks[0] : {icon: 'wind', tone: 'cool'};
  push('climate', 'climate', look.icon, t('Air conditioner'), cooling, {
    plural: t('Air conditioners'),
    tone: look.tone,
  });
  push(
    'covers',
    'covers',
    'curtain',
    t('Curtains open'),
    covers.filter(d => d.open),
  );
  push(
    'vacuum',
    'appliance',
    'vacuum',
    t('Cleaning|section'),
    vacuum.filter(d => d.cleaning),
  ); // the robot is cleaning — as in 3d_floor
  return chips;
}

const ACTIONS: Record<string, string> = {
  heating: N('Heating'),
  cooling: N('Cooling'),
  idle: N('Comfortable'),
  drying: N('Drying'),
  fan: N('Ventilating'),
  defrosting: N('Defrosting'),
  preheating: N('Preheating'),
};
// a boiler or thermostat has a single mode — the caption says what it is doing now: heating or already at temperature
const HEATER_MODES: Record<string, string> = {heat: N('Heat'), heat_cool: N('Auto'), auto: N('Auto')};
// Climate tile: an air conditioner is captioned with its mode (“Heat”), a boiler with what it is doing. heater — always a flame and a warm color.
// s: {status: available | unavailable | unbound, on, mode, action, temperature, current, canTemperature, range, low, high}
export function climateTile(
  s: ClimateState | null | undefined,
  {action = false, heater = false}: {action?: boolean; heater?: boolean} = {},
): ClimateTile {
  const current = number(s?.current);
  if (!s || s.status === 'unbound') return {state: 'unbound', status: t('Not linked'), current: null};
  if (s.status === 'unavailable') return {state: 'unavailable', status: t('Unavailable'), current: null};
  if (!s.on) return {state: 'off', status: t('Off'), current};
  const status = t(
    (action && s.action && ACTIONS[s.action]) ||
      (heater && s.mode && HEATER_MODES[s.mode]) ||
      (s.mode && MODE_NAMES[s.mode]) ||
      N('On'),
  );
  const target =
    s.range && number(s.low) !== null && number(s.high) !== null
      ? `${formatDegrees(s.low)}–${formatDegrees(s.high)}°`
      : number(s.temperature) !== null
        ? `${formatDegrees(s.temperature)}°`
        : null;
  const {icon, tone}: ModeLook = heater ? {icon: 'flame', tone: 'heat'} : modeLook(s.mode);
  return {
    state: 'on',
    status,
    current,
    target,
    adjustable: !!s.canTemperature && !s.range && number(s.temperature) !== null,
    icon,
    tone,
  };
}

// Room light tile. lamps: {id, kind, on, status}. The power button turns off everything that is on, and in a dark room turns on
// the main light — the ceiling one; if there is none — all of them. power — what to send: {on, ids}.
export function lightTile(lamps: TileLamp[] = []): LightTile {
  const live = lamps.filter(l => l.status === 'available');
  if (!live.length) return {state: 'unavailable', status: t('Unavailable'), lit: 0, power: null};
  const lit = live.filter(l => l.on);
  if (lit.length) {
    const status =
      live.length === 1
        ? t('On')
        : lit.length === live.length
          ? t('All on')
          : t('{0} of {1} on', lit.length, live.length);
    return {state: 'on', status, lit: lit.length, power: {on: false, ids: lit.map(l => l.id)}};
  }
  const main = live.filter(l => l.kind === 'ceiling');
  return {
    state: 'off',
    status: t('Off'),
    lit: 0,
    power: {on: true, ids: (main.length ? main : live).map(l => l.id)},
  };
}

// Second room line: humidity and CO₂ if there are sensors, otherwise whether the lights are on. Segments: CO₂ above normal is colored.
export function roomLine(
  values: Pick<RoomReadings, 'humidity' | 'co2'> | null | undefined,
  {lit = 0, lights = 0}: {lit?: number; lights?: number} = {},
): RoomLinePart[] {
  const parts: RoomLinePart[] = [];
  if (values?.humidity != null) parts.push({text: `${values.humidity}%`, tone: null});
  if (values?.co2 != null) {
    const level = co2Level(values.co2);
    parts.push({text: `CO₂ ${values.co2}`, tone: level === 'ok' ? null : level});
  }
  if (parts.length) return parts;
  if (!lights) return [];
  return [{text: lit ? t('Lights on') : t('Lights off'), tone: null}];
}
