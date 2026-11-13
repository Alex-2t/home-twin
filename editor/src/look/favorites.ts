// @ts-nocheck
// The “Favorites” card (D-049, “Customize panel”): any HA entities as tiles — what is not in the model: a kettle relay,
// HA scenes and scripts, a lock, a sensor in the pantry. Only the HA standard, the same for everyone: the look is by domain and device_class,
// a tap works like an HA tile: light, relay, fan, switch — toggle; scene and script — turn_on; button — press;
// curtains — open / close. The rest (sensors, lock, valve, climate, camera) opens the entity card in HA (more-info):
// a lock and a valve are not toggled from a “Favorites” tile — they have physical consequences, and HA has its own confirmation. No DOM.
import {t, N, num} from '../i18n/i18n.ts';
import {MODE_NAMES} from './overview.ts';

// domains that can be put into “Favorites”
export const FAV_DOMAINS = [
  'light',
  'switch',
  'fan',
  'input_boolean',
  'scene',
  'script',
  'button',
  'input_button',
  'cover',
  'lock',
  'climate',
  'sensor',
  'binary_sensor',
  'camera',
  'vacuum',
  'valve',
  'media_player',
  'person',
  'humidifier',
  'water_heater',
  'siren',
];
const TOGGLE = ['light', 'switch', 'fan', 'input_boolean', 'siren', 'humidifier'];
const ICON = {
  light: 'bulb',
  switch: 'power',
  fan: 'fan',
  input_boolean: 'power',
  scene: 'sparkle',
  script: 'sparkle',
  button: 'hand',
  input_button: 'hand',
  cover: 'curtain',
  lock: 'lock',
  climate: 'thermometer',
  camera: 'camera',
  vacuum: 'vacuum',
  valve: 'droplet',
  media_player: 'device',
  person: 'home',
  humidifier: 'droplet',
  water_heater: 'flame',
  siren: 'alert',
};
const SENSOR_IC = {
  temperature: 'thermometer',
  humidity: 'droplet',
  carbon_dioxide: 'eye',
  pm25: 'wind',
  power: 'power',
  energy: 'bolt',
  illuminance: 'sun',
  battery: 'device',
};
const BINARY_IC = {
  door: 'door',
  garage_door: 'door',
  opening: 'door',
  window: 'window',
  moisture: 'leak',
  motion: 'eye',
  occupancy: 'eye',
  presence: 'eye',
  smoke: 'alert',
  gas: 'alert',
  safety: 'alert',
  problem: 'alert',
};
const OPEN = ['door', 'garage_door', 'opening', 'window'],
  MOTION = ['motion', 'occupancy', 'presence'];
const VAC = {
  cleaning: N('Cleaning'),
  returning: N('Returning to dock'),
  docked: N('Docked'),
  paused: N('Cleaning paused'),
  error: N('Error — needs help'),
  idle: N('Waiting for a command'),
};

// item — {entity, name, domain, cls?, unit?}; x — the state as in HA ({state, attributes}) or null
// → {icon, on, off — unavailable, text, action: toggle | run | press | cover | info}
export function favView(item, x) {
  const d = item.domain || item.entity.split('.')[0],
    A = x?.attributes || {},
    s = x?.state,
    cls = item.cls || A.device_class;
  const icon =
    d === 'sensor'
      ? SENSOR_IC[cls] || 'device'
      : d === 'binary_sensor'
        ? BINARY_IC[cls] || 'device'
        : d === 'cover' && /blind|shade|shutter/.test(cls || '')
          ? 'blind'
          : ICON[d] || 'device';
  const action = TOGGLE.includes(d)
    ? 'toggle'
    : d === 'scene' || d === 'script'
      ? 'run'
      : d === 'button' || d === 'input_button'
        ? 'press'
        : d === 'cover'
          ? 'cover'
          : 'info';
  if (!x || s === 'unavailable' || s === 'unknown')
    return {icon, on: false, off: true, text: t('Unavailable'), action: action === 'info' ? 'info' : null};
  let on = false,
    text = s;
  if (TOGGLE.includes(d)) {
    on = s === 'on';
    text = on ? t('On|entity') : t('Off|entity');
  } else if (d === 'scene') text = t('Run');
  else if (d === 'script') {
    on = s === 'on';
    text = on ? t('Running') : t('Run');
  } else if (d === 'button' || d === 'input_button') text = t('Press');
  else if (d === 'cover') {
    on = s === 'open' || s === 'opening';
    text =
      s === 'opening'
        ? t('Opening…|plural')
        : s === 'closing'
          ? t('Closing…')
          : on
            ? t('Open|plural')
            : t('Closed|plural');
  } else if (d === 'lock') {
    on = s !== 'locked';
    text =
      s === 'locked'
        ? t('Locked')
        : s === 'jammed'
          ? t('Jammed')
          : s === 'locking'
            ? t('Locking…')
            : s === 'unlocking'
              ? t('Opening…')
              : t('Open|masculine');
  } else if (d === 'valve') {
    on = s === 'open' || s === 'opening';
    text = on ? t('Open|masculine') : t('Closed|masculine');
  } else if (d === 'climate') {
    on = s !== 'off';
    text = t(MODE_NAMES[s] || N('On'));
    if (Number.isFinite(A.current_temperature)) text += ` · ${num(A.current_temperature, 1)}°`;
  } else if (d === 'sensor') {
    const v = Number(s),
      u = item.unit ?? A.unit_of_measurement;
    text =
      Number.isFinite(v) && s !== ''
        ? `${num(Math.abs(v) < 10 && v % 1 ? Math.round(v * 10) / 10 : Math.round(v))}${u ? (u === '%' ? '' : ' ') + u : ''}`
        : s;
  } else if (d === 'binary_sensor') {
    on = s === 'on';
    text = OPEN.includes(cls)
      ? on
        ? t('Open')
        : t('Closed')
      : cls === 'moisture'
        ? on
          ? t('Leak')
          : t('Dry|leak')
        : MOTION.includes(cls)
          ? on
            ? t('Motion')
            : t('No motion')
          : on
            ? t('On|entity')
            : t('Off|entity');
  } else if (d === 'vacuum') {
    on = s === 'cleaning';
    text = t(VAC[s] || VAC.idle);
  } else if (d === 'media_player') {
    on = s !== 'off' && s !== 'standby';
    text = s === 'playing' ? t('Playing') : on ? t('On|entity') : t('Off|entity');
  } else if (d === 'person') text = s === 'home' ? t('Home') : s === 'not_home' ? t('Away|presence') : s;
  else if (d === 'camera') text = t('Camera');
  return {icon, on, off: false, text, action};
}

// command on tap → [domain, service] or null (more-info is not a command)
export function favCommand(item, x, action) {
  const d = item.domain || item.entity.split('.')[0];
  if (action === 'toggle') return [d, 'toggle'];
  if (action === 'run') return [d, 'turn_on'];
  if (action === 'press') return [d, 'press'];
  if (action === 'cover')
    return ['cover', x?.state === 'open' || x?.state === 'opening' ? 'close_cover' : 'open_cover'];
  return null;
}
