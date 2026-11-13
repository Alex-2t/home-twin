// Day / night in 3D (D-068): three modes — auto (by the sun: night after sunset, day after sunrise), always day, always night. The button
// steps through them: auto → day → night → auto. The mode and “the tip about auto was dismissed” are kept in this browser, shared by the
// editor and the HA card (in Home Assistant they share an origin): a choice made in the panel's Preview holds on the dashboard too.
import type {DayNightMode} from './types.ts';

const KEY = 'home-twin:daynight';
const TIP = 'home-twin:daynight-tip';
export const MODES: DayNightMode[] = ['auto', 'day', 'night'];
const get = (key: string): string | null => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
const put = (key: string, value: string): void => {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {}
};
export const readMode = (): DayNightMode => {
  const saved = get(KEY);
  return MODES.find(mode => mode === saved) ?? 'auto';
};
export const saveMode = (mode: DayNightMode): void => put(KEY, mode);
export const nextMode = (mode: DayNightMode): DayNightMode => MODES[(MODES.indexOf(mode) + 1) % MODES.length];
// sunDown: undefined when the HA layer cannot tell (it counts as day)
export const isNight = (mode: DayNightMode, sunDown: boolean | undefined): boolean =>
  mode === 'night' || (mode === 'auto' && !!sunDown);
export const tipWanted = (): boolean => get(TIP) !== 'off';
export const tipOff = (): void => {
  put(TIP, 'off');
  globalThis.dispatchEvent?.(new Event('daynight-tip-off'));
}; // every button puts its title back
// the mode changed in another tab or window (the editor ↔ the card): cb(mode)
export const onModeChange = (cb: (mode: DayNightMode) => void): void =>
  globalThis.addEventListener?.('storage', e => {
    if (e.key === KEY) cb(readMode());
  });
