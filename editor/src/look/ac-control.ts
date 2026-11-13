// Air conditioner and thermostat remote on the room screen — carried over from 3d_floor/apartment/smart-home/web/src/ac-control.js and
// ac-state.js (D-049): a round setpoint dial, − / +, power, mode, fan. Translations go through the editor's t().
// s: {status, on, mode, action, temperature, current, min, max, step, unit, modes, fans, fan, canTemperature, canPower}
import {t, N, num} from '../i18n/i18n.ts';
import {MODE_NAMES} from './overview.ts';

/** The remote's state (look.ts acs makes it from devices.ts acView); temperatures in unit, the modes and fan speeds HA offers. */
export interface AcState {
  /** 'available', 'unavailable' or 'unbound' (no HA entity). */
  status: string;
  on: boolean;
  mode?: string;
  action?: string;
  temperature?: number | null;
  current?: number | null;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  modes: string[];
  fans: string[];
  fan?: string;
  canTemperature: boolean;
  canPower: boolean;
}

/** The device the remote is for: its entity id and name. */
export interface AcDevice {
  id: string;
  name: string;
}

export const ACTION_NAMES: Record<string, string> = {
  off: N('Off'),
  idle: N('Target reached'),
  cooling: N('Cooling'),
  heating: N('Heating|ac'),
  drying: N('Drying'),
  fan: N('Fan|mode'),
  preheating: N('Preparing to heat'),
  defrosting: N('Defrosting'),
};
export const OPTION_NAMES: Record<string, string> = {
  auto: N('Auto'),
  low: N('Low'),
  medium_low: N('Medium-low'),
  medium: N('Medium'),
  medium_high: N('Medium-high'),
  high: N('High'),
  turbo: N('Turbo'),
  quiet: N('Quiet'),
  on: N('On|short'),
  off: N('Off|short'),
  vertical: N('Vertical'),
  horizontal: N('Horizontal'),
  both: N('All directions'),
};
const esc = (s: unknown): string => {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(s ?? '').replace(/[&<>"']/g, c => entities[c]);
};
// num prints its decimals as is (up to 2) when it gets no count of them
const number = (n: number | null | undefined): string =>
  Number.isFinite(n) ? num(n, undefined, {grouping: 'auto', maximumFractionDigits: 1}) : '—';
// a key's name from the map in the UI language; a key not in the map as it is
const name = (map: Record<string, string>, k: string | undefined): string | undefined =>
  k !== undefined && map[k] ? t(map[k]) : k;
export const acStatus = (s: AcState): string | undefined =>
  s.status === 'unbound'
    ? t('Not linked')
    : s.status === 'unavailable'
      ? t('Unavailable')
      : s.action && ACTION_NAMES[s.action]
        ? t(ACTION_NAMES[s.action])
        : name(MODE_NAMES, s.mode);
const angle = (value: number): {x: number; y: number} => ({
  x: 120 + 92 * Math.cos(value),
  y: 120 + 92 * Math.sin(value),
});

export function renderAC(device: AcDevice, s: AcState, busy = false, demo = false): string {
  const available = s.status === 'available' && !busy;
  const disabled = !available || !s.canTemperature;
  const value = s.temperature ?? s.min ?? 16;
  const min = s.min ?? 16;
  const max = s.max ?? 30;
  const progress = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const knob = angle(((135 + 270 * progress) * Math.PI) / 180);
  const color = s.on
    ? s.mode === 'heat'
      ? '#ff7625'
      : s.mode === 'dry'
        ? '#9676cf'
        : s.mode === 'fan_only'
          ? '#48a79a'
          : '#2196e5'
    : '#a4aaa8';
  const path = 'M54.95 185.05 A92 92 0 1 1 185.05 185.05';
  const button = (action: string, label: string, content: string, off = false): string =>
    `<button class="ac-button" data-action="ac" data-id="${esc(device.id)}" data-command="${action}" aria-label="${esc(device.name)}: ${esc(label)}" ${!available || off ? 'disabled' : ''}>${content}</button>`;
  const select = (key: string, label: string, options: string[], value: string | undefined): string =>
    options.length
      ? `<label class="ac-option">${esc(label)}<select data-ac="${esc(device.id)}" data-ac-field="${key}" aria-label="${esc(device.name)}: ${esc(label)}" ${!available ? 'disabled' : ''}>${value === undefined || !options.includes(value) ? '<option value="" selected disabled>—</option>' : ''}${options.map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(name(OPTION_NAMES, o))}</option>`).join('')}</select></label>`
      : '';
  return `<section class="ac-control" data-ac-card="${esc(device.id)}" style="--ac-color:${color}" aria-label="${esc(t('Thermostat: {0}', device.name))}">
    <div class="ac-title"><strong>${esc(device.name)}</strong><span>${demo ? esc(t('Demo')) : ''}</span></div>
    <svg class="ac-dial" viewBox="0 0 240 240" data-ac-dial="${esc(device.id)}" data-unit="${esc(s.unit || '°C')}" role="slider" tabindex="${disabled ? '-1' : '0'}" aria-label="${esc(device.name)}: ${esc(t('target temperature'))}" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${value}" aria-valuetext="${number(value)} ${esc(s.unit || '°C')}" aria-disabled="${disabled}">
      <circle cx="120" cy="120" r="85" fill="var(--ac-color)" opacity=".045"/>
      <path d="${path}" class="ac-dial-track" pathLength="100"/><path d="${path}" class="ac-dial-fill" pathLength="100" stroke-dasharray="${progress * 100} 100"/>
      <circle class="ac-dial-knob" cx="${knob.x}" cy="${knob.y}" r="7"/>
      <text x="120" y="84" class="ac-dial-status" data-ac-status="${esc(device.id)}">${busy ? esc(t('Sending…')) : esc(acStatus(s))}</text>
      <text x="115" y="132" class="ac-dial-value">${number(s.temperature)}</text><text x="167" y="108" class="ac-dial-unit">${esc(s.unit || '°C')}</text>
      <text x="120" y="161" class="ac-dial-current" data-ac-current="${esc(device.id)}">${esc(t('Now {0}', `${number(s.current)} ${s.unit || '°C'}`))}</text>
    </svg>
    <div class="ac-temperature-buttons">${button('decrease', t('Cooler'), '−', !s.canTemperature || value <= min)}${button('increase', t('Warmer'), '+', !s.canTemperature || value >= max)}</div>
    <div class="ac-power-row">${button('power', s.on ? t('Turn off') : t('Turn on'), '⏻ ' + (s.on ? t('Turn off') : t('Turn on')), !s.canPower)}</div>
    <label class="ac-option">${esc(t('Mode'))}<select data-ac="${esc(device.id)}" data-ac-field="mode" aria-label="${esc(device.name)}: ${esc(t('Mode'))}" ${!available || !s.modes.length ? 'disabled' : ''}>${s.modes.map(mode => `<option value="${esc(mode)}" ${s.mode === mode ? 'selected' : ''}>${esc(name(MODE_NAMES, mode))}</option>`).join('')}</select></label>
    ${select('fan', t('Fan'), s.fans, s.fan)}
  </section>`;
}
