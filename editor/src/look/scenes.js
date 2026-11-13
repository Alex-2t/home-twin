// Scenes “Home”, “Away”, “Night” — as in 3d_floor/apartment/smart-home/web/src/scenes.js (D-049): three buttons in the
// “Whole home” dashboard, “Customize” — what each one does with each device. Differences: any home, so the default actions
// go by room kinds and lamp shapes, not by lamp ids of a single apartment; no brightness (plan lights are only on or off);
// TVs are not in the HA layer yet. Settings live in the plan (plan.scenes), not in the browser: they travel with the project into HA.
// No DOM: look.js lays out the markup.
import {N} from '../i18n/i18n.js';

export const SCENES = [
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
const ACTIONS = {light: ['on', 'off'], cover: ['open', 'close'], ac: ['on', 'off']};

// Scene devices by dashboard rooms (look.js: model().rooms): plan lamps, curtains, air conditioners (not the boiler or thermostat:
// “Away” must not turn off the heating). The settings key is kind:id.
export function sceneDevices(rooms = []) {
  return rooms
    .flatMap(r => [
      ...(r.lamps || []).map(l => ({
        kind: 'light',
        id: l.id,
        name: l.name,
        room: r.id,
        roomKind: r.kind,
        main: l.kind === 'ceiling',
        on: !!l.on,
        ok: l.status !== 'unavailable',
      })),
      ...(r.covers || []).map(c => ({
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
        .map(d => ({
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
function defaults(id, devices) {
  const lights = devices.filter(d => d.kind === 'light'),
    steps = [];
  const homeLights = new Set(),
    nightLights = new Set();
  for (const room of new Set(lights.map(d => d.room))) {
    const L = lights.filter(d => d.room === room),
      kind = L[0].roomKind;
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
export function scenePlan(id, devices, settings) {
  if (!SCENES.some(s => s.id === id)) return [];
  if (!settings) return defaults(id, devices);
  return devices.flatMap(d => {
    const a = settings[d.key]?.action;
    return ACTIONS[d.kind].includes(a) ? [{...d, action: a}] : [];
  });
}

// Draft for “Customize”: an action for each device (keep — no change).
export function sceneDraft(id, devices, settings) {
  const plan = scenePlan(id, devices, settings);
  return Object.fromEntries(
    devices.map(d => [d.key, {action: plan.find(s => s.key === d.key)?.action || 'keep'}]),
  );
}

// Run: run(step) sends one action and answers true / false (not accepted) or throws. Unavailable devices and those
// already in the desired state are left alone. The result is for the line under the buttons: {sent, unchanged, skipped, failed}.
export async function executeScene(steps, run) {
  const result = {sent: 0, unchanged: 0, skipped: 0, failed: 0};
  for (const s of steps) {
    if (!s.ok) {
      result.skipped++;
      continue;
    }
    const now =
      s.kind === 'cover' ? (s.pos >= 99 ? 'open' : s.pos <= 1 ? 'close' : null) : s.on ? 'on' : 'off'; // a curtain at 40 % is neither
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
