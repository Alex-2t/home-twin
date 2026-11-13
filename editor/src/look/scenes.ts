// Scenes “Home”, “Away”, “Night” — as in 3d_floor/apartment/smart-home/web/src/scenes.js (D-049): three buttons in the
// “Whole home” dashboard, “Customize” — what each one does with each device. Differences: any home, so the default actions
// go by room kinds and lamp shapes, not by lamp ids of a single apartment; no brightness (plan lights are only on or off);
// TVs are not in the HA layer yet. Settings live in the plan (plan.scenes), not in the browser: they travel with the project into HA.
// No DOM: look.js lays out the markup.
import {N} from '../i18n/i18n.ts';
import type {SceneId} from '../core/types.ts';

/** A scene button: its id, name, icon and what it does by default. */
export interface Scene {
  id: SceneId;
  name: string;
  icon: string;
  description: string;
}

/** A dashboard room as the scenes read it (look.ts model().rooms): its lamps, covers and climate devices. */
export interface SceneRoom {
  id: string;
  /** Its kind (core/overview.ts roomKind): 'hall', 'kitchen'… */
  kind: string;
  lamps?: Array<{id: string; name: string; kind?: string; on?: boolean; status?: string}>;
  covers?: Array<{entity: string; name: string; pos?: number; ok?: boolean}>;
  climate?: Array<{id: string; name: string; heater?: boolean; view?: {state: string}; canPower?: boolean}>;
}

/** A device a scene can act on; key is kind:id, the key of its setting. */
export interface SceneDevice {
  kind: 'light' | 'cover' | 'ac';
  id: string;
  name: string;
  room: string;
  roomKind: string;
  /** A light: the room's main light (a ceiling one). */
  main?: boolean;
  /** A light or an air conditioner: on now. */
  on?: boolean;
  /** A cover: how open, 0–100. */
  pos?: number;
  /** It can be sent a command now. */
  ok: boolean;
  key: string;
}

/** What a scene does with one device: 'on', 'off' (lights, air conditioners), 'open', 'close' (covers); a draft also has 'keep'. */
export interface SceneChoice {
  action: string;
}

/** A scene's step: the device and what to do with it. */
export type SceneStep = SceneDevice & SceneChoice;

/** How a scene went: commands sent, devices already as wanted, skipped (unavailable or not accepted), failed. */
export interface SceneResult {
  sent: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

export const SCENES: Scene[] = [
  {
    id: 'home',
    name: N('Home'),
    icon: 'home',
    description: N('Main lights in the hallway and kitchen · curtains open. Everything else unchanged.'),
  },
  {
    id: 'away',
    name: N('Away'),
    icon: 'door',
    description: N('All lights and air conditioners off. Curtains unchanged.'),
  },
  {
    id: 'night',
    name: N('Night'),
    icon: 'moon',
    description: N('Lights off except the hallway accent light · curtains closed. Climate unchanged.'),
  },
];
const ACTIONS: Record<SceneDevice['kind'], string[]> = {
  light: ['on', 'off'],
  cover: ['open', 'close'],
  ac: ['on', 'off'],
};

// Scene devices by dashboard rooms (look.js: model().rooms): plan lamps, curtains, air conditioners (not the boiler or thermostat:
// “Away” must not turn off the heating). The settings key is kind:id.
export function sceneDevices(rooms: SceneRoom[] = []): SceneDevice[] {
  return rooms
    .flatMap(r => [
      ...(r.lamps || []).map((l): Omit<SceneDevice, 'key'> => ({
        kind: 'light',
        id: l.id,
        name: l.name,
        room: r.id,
        roomKind: r.kind,
        main: l.kind === 'ceiling',
        on: !!l.on,
        ok: l.status !== 'unavailable',
      })),
      ...(r.covers || []).map((c): Omit<SceneDevice, 'key'> => ({
        kind: 'cover',
        id: c.entity,
        name: c.name,
        room: r.id,
        roomKind: r.kind,
        pos: c.pos,
        ok: !!c.ok,
      })),
      ...(r.climate || [])
        .filter(d => !d.heater)
        .map((d): Omit<SceneDevice, 'key'> => ({
          kind: 'ac',
          id: d.id,
          name: d.name,
          room: r.id,
          roomKind: r.kind,
          on: d.view?.state === 'on',
          ok: !!d.canPower,
        })),
    ])
    .map(d => ({...d, key: d.kind + ':' + d.id}));
}

// Default actions. “Home” — main lights (chandelier, pendant, spots, track; if none — all) in the hallway and kitchen, curtains
// open. “Away” — all lights and air conditioners off. “Night” — lights off except the accent light in the hallway (strip, sconce,
// floor lamp), curtains closed. Everything else — no change.
function defaults(id: string, devices: SceneDevice[]): SceneStep[] {
  const lights = devices.filter(d => d.kind === 'light');
  const steps: SceneStep[] = [];
  const homeLights = new Set<string>();
  const nightLights = new Set<string>();
  for (const room of new Set(lights.map(d => d.room))) {
    const L = lights.filter(d => d.room === room);
    const kind = L[0].roomKind;
    if (kind === 'hall' || kind === 'kitchen') {
      const main = L.filter(d => d.main);
      (main.length ? main : L).forEach(d => homeLights.add(d.id));
    }
    if (kind === 'hall') L.filter(d => !d.main).forEach(d => nightLights.add(d.id));
  }
  for (const d of devices) {
    if (d.kind === 'light') {
      if (id === 'home' && homeLights.has(d.id)) steps.push({...d, action: 'on'});
      else if (id === 'away') steps.push({...d, action: 'off'});
      else if (id === 'night') steps.push({...d, action: nightLights.has(d.id) ? 'on' : 'off'});
    } else if (d.kind === 'cover' && id !== 'away')
      steps.push({...d, action: id === 'home' ? 'open' : 'close'});
    else if (d.kind === 'ac' && id === 'away') steps.push({...d, action: 'off'});
  }
  return steps;
}

// Scene steps: [{kind, id, key, action, …device}]. settings — from “Customize” ({kind:id: {action}}), otherwise the defaults.
// A device that no longer exists is not in the steps; “keep” — no change.
export function scenePlan(
  id: string,
  devices: SceneDevice[],
  settings?: Partial<Record<string, SceneChoice>>,
): SceneStep[] {
  if (!SCENES.some(s => s.id === id)) return [];
  if (!settings) return defaults(id, devices);
  return devices.flatMap(d => {
    const a = settings[d.key]?.action;
    return a !== undefined && ACTIONS[d.kind].includes(a) ? [{...d, action: a}] : [];
  });
}

// Draft for “Customize”: an action for each device (keep — no change).
export function sceneDraft(
  id: string,
  devices: SceneDevice[],
  settings?: Partial<Record<string, SceneChoice>>,
): Record<string, SceneChoice> {
  const plan = scenePlan(id, devices, settings);
  return Object.fromEntries(
    devices.map(d => [d.key, {action: plan.find(s => s.key === d.key)?.action || 'keep'}]),
  );
}

// Run: run(step) sends one action and answers true / false (not accepted) or throws. Unavailable devices and those
// already in the desired state are left alone. The result is for the line under the buttons: {sent, unchanged, skipped, failed}.
export async function executeScene(
  steps: SceneStep[],
  run: (step: SceneStep) => Promise<boolean>,
): Promise<SceneResult> {
  const result: SceneResult = {sent: 0, unchanged: 0, skipped: 0, failed: 0};
  for (const s of steps) {
    if (!s.ok) {
      result.skipped++;
      continue;
    }
    // an available cover has its position (core/devices.ts coverView)
    const now =
      s.kind === 'cover' ? (s.pos! >= 99 ? 'open' : s.pos! <= 1 ? 'close' : null) : s.on ? 'on' : 'off'; // a curtain at 40 % is neither
    if (now === s.action) {
      result.unchanged++;
      continue;
    }
    try {
      result[(await run(s)) ? 'sent' : 'skipped']++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
