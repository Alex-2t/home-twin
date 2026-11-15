// Linked windows (D-118): a page that embeds the editor twice, as a desktop window and as a phone beside it (the company's site,
// sync.md), opens both with the same ?link=<id>. The two are then one home: a lamp switched, a curtain moved, a scene run or
// day / night stepped in one window happens in the other too. They talk over a BroadcastChannel named by the id, so only
// windows of the same browser and the same page find each other, and nothing leaves the browser.
//   Commands — every demo HA command (ha.call) is sent as it is and the other window runs it on its own demo HA; a lamp
//              without an HA entity (look.ts lampCmd) and the day / night mode are sent as their new state.
//   Joining  — a window that has just opened its home says hello; a window that already shows the same home answers with
//              its state (every lamp, the demo entities, the day / night mode), so a phone that loaded later shows what the
//              desktop window was already switched to.
// Each message names its home (homeKey): a window that shows another home, or none yet, takes nothing from it.
import type {DayNightMode, DemoHaLayer, HassAttributes} from '../core/types.ts';
import type {Editor} from './editor-types.ts';

/** The event look.ts sends when it switches a lamp that has no HA entity (the plan's own state). */
export const LAMP_SET_EVENT = 'home-twin-lamp-set';

/** A lamp switched without HA, as the event carries it. */
export interface LampSet {
  id: string;
  on: boolean;
}

/** A demo entity's state as a joining window takes it. */
interface EntityState {
  state: string;
  attributes: HassAttributes;
}

/** What a window shows, sent to a window that has just joined. */
interface LinkState {
  lamps: Array<[string, boolean]>;
  entities: Record<string, EntityState>;
  day: DayNightMode;
}

/** A message between linked windows. */
type LinkMessage =
  | {home: string; call: {domain: string; service: string; data?: Record<string, unknown>}}
  | {home: string; lamp: LampSet}
  | {home: string; day: DayNightMode}
  | {home: string; hello: true}
  | {home: string; state: LinkState};

/** The link's id in the page's address (?link=), or null: the window is alone. */
export function linkId(search: string): string | null {
  const id = new URLSearchParams(search).get('link');
  if (!id) return null;
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

/** A short name of the home on screen: its rooms and lamps, the same in both windows that opened it. Empty: no home yet. */
export function homeKey(ed: Pick<Editor, 'plan'>): string {
  const rooms = ed.plan.rooms.map(room => room.id);
  if (!rooms.length) return '';
  const lamps = ed.plan.lights.map(lamp => lamp.id);
  return rooms.join(',') + '|' + lamps.join(',');
}

/** The demo entities a joining window takes: everything but lamps and sensors (lamps come from the plan, sensors never change). */
function entityStates(ha: DemoHaLayer): Record<string, EntityState> {
  const out: Record<string, EntityState> = {};
  for (const item of ha.entities()) {
    if (item.domain === 'sensor' || item.domain === 'light' || item.domain === 'switch') continue;
    const entity = ha.entity(item.entity);
    if (!entity) continue;
    out[item.entity] = {state: entity.state, attributes: {...entity.attributes}};
  }
  return out;
}

/**
 * Links this window to the others opened with the same ?link=; returns what closes the link. No id, or no BroadcastChannel:
 * nothing happens (null).
 */
export function linkWindows(ha: DemoHaLayer, ed: Editor, search = location.search): (() => void) | null {
  const id = linkId(search);
  if (!id || typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel('home-twin-link:' + id);
  const send = (message: LinkMessage): void => channel.postMessage(message);

  // Commands from here go to the others too; a command from another window runs on the demo HA alone, so it is not sent back.
  const runCommand = ha.call.bind(ha);
  ha.call = (domain, service, data) => {
    const home = homeKey(ed);
    if (home) send({home, call: {domain, service, data}});
    return runCommand(domain, service, data);
  };

  globalThis.addEventListener?.(LAMP_SET_EVENT, event => {
    const home = homeKey(ed);
    const lamp = (event as CustomEvent<LampSet>).detail;
    if (home) send({home, lamp: {id: lamp.id, on: lamp.on}});
  });

  const stepDayMode = ed.toggleNight;
  ed.toggleNight = () => {
    stepDayMode();
    const home = homeKey(ed);
    if (home) send({home, day: ed.dayMode()});
  };

  // A home opened later (the showcase lights it first, flows.ts): the others are asked what they show.
  const lightHome = ed.showcaseLight;
  ed.showcaseLight = () => {
    lightHome();
    const home = homeKey(ed);
    if (home) send({home, hello: true});
  };

  channel.onmessage = (event: MessageEvent<LinkMessage>) => {
    const message = event.data;
    if (!message || message.home !== homeKey(ed)) return;
    if ('call' in message) {
      runCommand(message.call.domain, message.call.service, message.call.data);
    } else if ('lamp' in message) {
      ed.setLampOn(message.lamp.id, message.lamp.on);
    } else if ('day' in message) {
      ed.setDayMode(message.day);
    } else if ('hello' in message) {
      const lamps: Array<[string, boolean]> = ed.plan.lights.map(lamp => [lamp.id, lamp.on !== false]);
      send({home: message.home, state: {lamps, entities: entityStates(ha), day: ed.dayMode()}});
    } else if ('state' in message) {
      for (const [lampId, on] of message.state.lamps) ed.setLampOn(lampId, on);
      for (const [entity, value] of Object.entries(message.state.entities))
        ha._setEntity(entity, value.state, value.attributes);
      ed.setDayMode(message.state.day);
    }
  };
  // the home is often open already (the editor opens it while it starts): the others are asked at once
  const home = homeKey(ed);
  if (home) send({home, hello: true});
  return () => channel.close();
}
