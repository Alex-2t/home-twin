// The home's events for the notification stack (look/notes.ts, D-126): changes of the devices the panel knows. Two snapshots in a row
// are compared; the first one is only remembered, otherwise opening the page would bring a pile of “on”.
//
// Each event gets a type: an alert; a change by hand — by the card, the app, a wall switch, a voice assistant; by an automation (with
// its name); a hint of the home; or a device's connection. Nothing is dropped here: what is shown is the settings' choice.
// No DOM, no HA layer: editor/look-notes.ts hands in the catalog, a way to read a state, and the automations' runs.
import {N, t} from '../i18n/i18n.ts';
import {MODE_NAMES, CO2_STUFFY, accusative, roomInSentence} from './overview.ts';
import type {NoteCategory, NoteDraft} from './notes.ts';
import type {LogbookEntry} from '../core/types.ts';

// Below this a room is “fresh” again: without the gap a reading wandering around 1000 ppm would pour out reminders.
export const CO2_FRESH = 900;
// A scene changes many devices at once — one summary instead of a stack.
export const BURST = 3;
// How long to remember the automations' runs: an action after a delay (“turn off in 10 minutes”) comes with the context of a run
// that ended long ago.
export const RUN_MEMORY_MS = 3600e3;
// One device's changes settle first: clicks in a row and relay bounce — “on-off-on” within a second, as Sonoff relays do when the
// state comes both over the network and from the cloud — make one event with the result, and none if the device came back where it
// was. Until the series ends the notification waits. The water valve, CO₂ and alerts do not wait.
export const SETTLE_MS = 5000;

/** What a device in the catalog is, for its events. */
export type EventKind = 'light' | 'cover' | 'climate' | 'water' | 'alert' | 'link' | 'vacuum' | 'co2';

/** A device whose changes become notifications. */
export interface EventItem {
  /** Unique in the catalog: the entity, “<entity>#link” for its connection, “lamp:<id>” for a lamp with no entity. */
  key: string;
  /** Its HA entity; null — a lamp of the plan alone (the demo without HA). */
  entity: string | null;
  kind: EventKind;
  name: string;
  /** The room's name, or null. */
  room: string | null;
  icon: string;
  /** What the card says under the title, when it is not the room (an alert sensor's place, “CO₂ sensor”). */
  source?: string;
  /** An alert: what to say when it ends; none — say nothing. */
  clear?: string | null;
}

/** Who made a change, as HA says (state.context). */
export interface ChangeContext {
  id?: string;
  parent_id?: string | null;
  user_id?: string | null;
}

/** An entity's state as the comparison reads it. */
export interface EventState {
  state: string;
  context?: ChangeContext | null;
}

/** An automation's run: when it was seen and the automation's name. */
export interface AutomationRun {
  at: number;
  name: string | null;
}

/** A series of one device's changes that is still settling. */
export interface Chain {
  item: EventItem;
  from: string;
  to: string;
  at: number;
  auto: boolean;
  by: string | null;
}

/** A settled change: its notification, the device's key, its type and where it went. */
interface Settled {
  note: NoteDraft & {at: number};
  key: string;
  category: NoteCategory;
  to: string;
}

/** The comparison's result: the notifications, the snapshot for the next call, and the series still settling. */
export interface HomeEventsResult {
  snapshot: Record<string, string | null>;
  pending: Map<string, Chain>;
  notes: NoteDraft[];
}

/** The valve, alerts and CO₂ do not settle and are never folded into a summary. */
const IMMEDIATE = new Set<EventKind>(['water', 'alert', 'co2']);

/**
 * The automations' runs: context id → {at, name}. An automation, when it fires, first writes its own state (last_triggered) with a new
 * context, and then switches devices with that same context. So a run is known by the contexts of automation.*, even when it has no
 * parent_id: runs by time, by the sun, by MQTT. Current contexts never age; old ones are kept RUN_MEMORY_MS.
 */
export function automationRuns(
  runs: Map<string, AutomationRun> | null,
  automations: readonly {contextId: string | undefined; name: string | null}[],
  now = Date.now(),
): Map<string, AutomationRun> {
  const next = new Map<string, AutomationRun>();
  for (const [id, run] of runs || []) {
    if (now - run.at < RUN_MEMORY_MS) next.set(id, run);
  }
  for (const automation of automations) {
    if (automation.contextId) next.set(automation.contextId, {at: now, name: automation.name});
  }
  return next;
}

/**
 * Who changed a state: 'user' — a person through HA (the card, the app), 'automation' — an automation, 'device' — the device itself, a
 * wall switch or a voice assistant: those have neither a user nor a parent.
 */
export function changeOrigin(
  context: ChangeContext | null | undefined,
  runs: Map<string, AutomationRun> | null,
): 'user' | 'automation' | 'device' {
  if (!context) return 'device';
  if (context.user_id) return 'user';
  const knownRun = !!context.id && !!runs?.has(context.id);
  if (context.parent_id || knownRun) return 'automation';
  return 'device';
}

/** An alert sensor's class: the alert's title, what to say when it ends, its icon. */
interface AlertClass {
  name: string;
  clear: string;
  icon: string;
}

// Urgent sensors are found by their device class.
export const ALERT_CLASSES: Partial<Record<string, AlertClass>> = {
  moisture: {name: N('Water leak'), clear: N('The leak is gone'), icon: 'droplet'},
  smoke: {name: N('Smoke detected'), clear: N('No more smoke'), icon: 'flame'},
  gas: {name: N('Gas leak'), clear: N('No more gas'), icon: 'flame'},
  carbon_monoxide: {name: N('Carbon monoxide'), clear: N('No more carbon monoxide'), icon: 'flame'},
};

/** An entity as the alert catalog reads it: binary sensors with their class, name and area. */
export interface AlertSource {
  entity: string;
  domain: string;
  cls?: string | null;
  name: string;
  area: string | null;
}

/**
 * Urgent sensors (ALERT_CLASSES) as catalog items: a sensor that turns on is an alert. Its place is the model's room in its area,
 * otherwise the area itself, otherwise the sensor's name.
 */
export function alertCatalog(
  entities: readonly AlertSource[],
  roomName: (area: string | null) => string | null,
  areaName: (area: string) => string,
): EventItem[] {
  const items: EventItem[] = [];
  for (const entity of entities) {
    const preset = entity.domain === 'binary_sensor' && entity.cls ? ALERT_CLASSES[entity.cls] : undefined;
    if (!preset) continue;
    const room = roomName(entity.area);
    const place = room || (entity.area ? areaName(entity.area) : null) || entity.name;
    items.push({
      key: entity.entity,
      entity: entity.entity,
      kind: 'alert',
      name: t(preset.name),
      room,
      icon: preset.icon,
      source: place,
      clear: t(preset.clear),
    });
  }
  return items;
}

/**
 * The connection: one item per HA device — a lock has three sensors, but it drops off the network once. deviceOf — the entity's HA
 * device id, when known. A lamp of the plan alone has no entity and no connection.
 */
export function linkCatalog(
  items: readonly EventItem[],
  deviceOf: (entity: string) => string | null,
): EventItem[] {
  const links: EventItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item.kind === 'link' || !item.entity) continue;
    const device = deviceOf(item.entity) || item.entity;
    if (seen.has(device)) continue;
    seen.add(device);
    links.push({
      key: item.entity + '#link',
      entity: item.entity,
      kind: 'link',
      name: item.name,
      room: item.room,
      icon: 'wifi',
    });
  }
  return links;
}

const UNKNOWN = new Set(['unavailable', 'unknown']);

/** An entity's state in the form worth comparing; null — nothing to compare. */
function normalize(item: EventItem, state: string | null | undefined, before: string | null): string | null {
  if (item.kind === 'link') {
    if (state == null || state === 'unknown') return null;
    return state === 'unavailable' ? 'down' : 'up';
  }
  if (state == null || UNKNOWN.has(state)) return null;
  switch (item.kind) {
    case 'light':
    case 'alert':
      return state === 'on' || state === 'off' ? state : null;
    // covers and the valve are compared by their end positions: “opening” is not an event yet
    case 'cover':
    case 'water':
      return state === 'open' || state === 'closed' ? state : null;
    case 'climate':
    case 'vacuum':
      return state;
    case 'co2': {
      const ppm = parseFloat(state);
      if (!Number.isFinite(ppm)) return null;
      if (ppm >= CO2_STUFFY) return 'high';
      if (ppm < CO2_FRESH) return 'ok';
      return before ?? 'ok';
    }
  }
}

/** A climate device's state in words, as the tile names it. */
const climateState = (state: string): string => {
  if (state === 'off') return t('Off|entity').toLowerCase();
  const mode = MODE_NAMES[state];
  return (mode ? t(mode) : state).toLowerCase();
};

/** What a change says. The type comes from what it is (the valve shut off is always an alert); otherwise from who made it (settled). */
function describe(
  item: EventItem,
  before: string,
  after: string,
): (Omit<NoteDraft, 'category'> & {category?: NoteCategory}) | null {
  const place = item.room || t('Whole home');
  switch (item.kind) {
    case 'light':
      // names differ in gender — the neutral form, as under a tile's name
      return {
        icon: item.icon,
        title: after === 'on' ? t('{0}: on', item.name) : t('{0}: off', item.name),
        source: place,
      };
    case 'cover':
      return {
        icon: item.icon,
        title: after === 'open' ? t('{0}: open', item.name) : t('{0}: closed', item.name),
        source: place,
      };
    case 'water':
      if (after === 'closed')
        return {icon: 'droplet', title: t('Water shut off'), source: item.source || place, category: 'alert'};
      return {icon: 'droplet', title: t('Water is on again'), source: item.source || place};
    case 'alert':
      if (after === 'on')
        return {icon: item.icon, title: item.name, source: item.source || place, category: 'alert'};
      if (!item.clear) return null;
      return {
        icon: item.icon,
        title: item.clear,
        source: item.source || place,
        category: 'alert',
        resolved: true,
      };
    case 'link':
      if (after === 'down')
        return {icon: 'wifi-off', title: t('{0}: offline', item.name), source: place, category: 'link'};
      return {icon: 'wifi', title: t('{0}: back online', item.name), source: place, category: 'link'};
    case 'climate':
      return {icon: item.icon, title: t('{0}: {1}', item.name, climateState(after)), source: place};
    case 'vacuum':
      if (after === 'cleaning')
        return {icon: 'vacuum', title: t('{0}: cleaning started', item.name), source: place};
      if (after === 'docked' && before !== 'docked')
        return {icon: 'vacuum', title: t('{0}: back on the dock', item.name), source: place};
      if (after === 'error')
        return {icon: 'vacuum', title: t('{0}: error', item.name), source: place, category: 'alert'};
      return null;
    case 'co2': {
      if (after !== 'high') return null;
      const room = accusative(roomInSentence(item.room || t('Room')));
      return {icon: 'wind', title: t('Air out the {0}', room), source: t('CO₂ sensor'), category: 'hint'};
    }
  }
}

/**
 * What changed between the last snapshot and now. Returns the notifications, the snapshot for the next comparison, and `pending` —
 * series of changes still settling (SETTLE_MS): hand them to the next call, and to end a series with no new events call again after
 * SETTLE_MS. An entity that is missing or unavailable keeps its old value: its coming back is an event only for its connection item.
 */
export function homeEvents(
  previous: Record<string, string | null> | null,
  read: (item: EventItem) => EventState | null,
  catalog: readonly EventItem[],
  {
    runs = null,
    pending = null,
    now = Date.now(),
    settleMs = SETTLE_MS,
  }: {
    runs?: Map<string, AutomationRun> | null;
    pending?: Map<string, Chain> | null;
    now?: number;
    settleMs?: number;
  } = {},
): HomeEventsResult {
  const snapshot: Record<string, string | null> = {};
  const ready: Settled[] = [];
  const chains = new Map<string, Chain>(pending || []);
  for (const item of catalog) {
    const current = read(item);
    const before = previous?.[item.key] ?? null;
    const value = normalize(item, current?.state, before);
    snapshot[item.key] = value ?? before;
    if (!previous || value == null || before == null || value === before) continue;
    const auto = item.kind !== 'link' && changeOrigin(current?.context, runs) === 'automation';
    const contextId = current?.context?.id;
    const by = auto && contextId ? runs?.get(contextId)?.name || null : null;
    if (IMMEDIATE.has(item.kind)) {
      const change = settled({item, from: before, to: value, at: now, auto, by});
      if (change) ready.push(change);
      continue;
    }
    const chain = chains.get(item.key);
    if (chain)
      chains.set(item.key, {...chain, to: value, at: now, auto: chain.auto && auto, by: by || chain.by});
    else chains.set(item.key, {item, from: before, to: value, at: now, auto, by});
  }
  for (const [key, chain] of chains) {
    if (now - chain.at < settleMs) continue;
    chains.delete(key);
    const change = settled(chain);
    if (change) ready.push(change);
  }
  return {snapshot, pending: chains, notes: fold(ready)};
}

/**
 * The result of one device's series of changes; back where it was — no event. The type is the event's own (alert, hint, connection),
 * otherwise who made it: the whole series by an automation — “automations”, any change by a person — “by hand”.
 */
function settled({item, from, to, at, auto, by}: Chain): Settled | null {
  if (from === to) return null;
  const said = describe(item, from, to);
  if (!said) return null;
  const category = said.category || (auto ? 'automation' : 'manual');
  const note: NoteDraft & {at: number} = {...said, category, at};
  if (category === 'automation' && by) note.by = by;
  return {note, key: item.key, category, to};
}

/** Changes at the same moment. More than BURST different devices of one type is a scene: one summary. Alerts are never folded. */
function fold(group: readonly Settled[]): NoteDraft[] {
  const notes: NoteDraft[] = [];
  for (const category of new Set(group.map(change => change.category))) {
    const part = group.filter(change => change.category === category);
    const devices = new Set(part.map(change => change.key)).size;
    if (category === 'alert' || devices <= BURST) notes.push(...part.map(change => change.note));
    else notes.push(summary(part, category));
  }
  return notes;
}

/** A scene's summary: what and where — “Kitchen, Bedroom and 2 more”. An automation's has its name; a connection's, lost or back. */
function summary(changes: readonly Settled[], category: NoteCategory): NoteDraft {
  const count = new Set(changes.map(change => change.key)).size;
  const places = [...new Set(changes.map(change => change.note.source).filter(Boolean))];
  const source =
    places.length > 2
      ? t('{0} and {1} more', places.slice(0, 2).join(', '), places.length - 2)
      : places.join(', ') || t('Whole home');
  const at = changes[changes.length - 1].note.at;
  const devices = t('{0, plural, one {# device} other {# devices}}', count);
  let title = t('{0, plural, one {# change at home} other {# changes at home}}', count);
  let icon = 'home';
  if (category === 'automation') {
    const names = [...new Set(changes.map(change => change.note.by).filter(Boolean))];
    const name = names.length === 1 ? names[0] : t('Automations');
    title = t('{0}: {1}', name, devices);
    icon = 'sparkle';
  } else if (category === 'link') {
    const down = changes.every(change => change.to === 'down');
    const up = changes.every(change => change.to === 'up');
    if (down) title = t('Offline: {0}', devices);
    else if (up) title = t('Back online: {0}', devices);
    else title = t('Connection: {0}', devices);
    icon = up ? 'wifi' : 'wifi-off';
  }
  return {icon, title, source, category, at};
}

// ---------- the day before the page opened, from HA's recorder ----------

/** One row of an entity's history: the state, when (ms), and whether an automation made it (and which). */
export interface HistoryRow {
  s: string;
  t: number;
  auto?: boolean;
  by?: string | null;
}

/**
 * Past events from the recorder — so that after a reload the stack shows what has happened, instead of starting empty. series:
 * {entity: rows}, the first row is the state at the start of the window. The same rules as the live events: end positions, the CO₂
 * gap, series of clicks settling (settleMs), the types. Changes within burstMs of each other are one scene: with more than BURST
 * different devices of one type it folds into a summary. Returns notifications by time, oldest first.
 */
export function replayEvents(
  series: Readonly<Record<string, readonly HistoryRow[]>>,
  catalog: readonly EventItem[],
  {burstMs = 3000, settleMs = SETTLE_MS}: {burstMs?: number; settleMs?: number} = {},
): NoteDraft[] {
  const changes: Settled[] = [];
  for (const item of catalog) {
    if (!item.entity) continue;
    let before: string | null = null;
    // a series of clicks still settling (declared wide: TypeScript would narrow a null start to null for good)
    let chain = null as Chain | null;
    // a series ends: its result, if any, joins the changes
    const finish = (ended: Chain | null): null => {
      const change = ended && settled(ended);
      if (change) changes.push(change);
      return null;
    };
    for (const row of series[item.entity] || []) {
      const value = normalize(item, row.s, before);
      if (value == null) continue;
      if (before != null && value !== before) {
        const auto = item.kind !== 'link' && !!row.auto;
        const by = auto ? row.by || null : null;
        if (IMMEDIATE.has(item.kind)) {
          finish({item, from: before, to: value, at: row.t, auto, by});
        } else {
          if (chain && row.t - chain.at > settleMs) chain = finish(chain);
          if (chain) chain = {...chain, to: value, at: row.t, auto: chain.auto && auto, by: by || chain.by};
          else chain = {item, from: before, to: value, at: row.t, auto, by};
        }
      }
      before = value;
    }
    finish(chain);
  }
  changes.sort((a, b) => a.note.at - b.note.at);
  const notes: NoteDraft[] = [];
  for (let start = 0; start < changes.length;) {
    let end = start + 1;
    while (end < changes.length && changes[end].note.at - changes[start].note.at <= burstMs) end++;
    notes.push(...fold(changes.slice(start, end)));
    start = end;
  }
  return notes.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}

// A history row and a logbook row are one record of the database, with one time; the gap is only for rounding.
const MATCH_MS = 500;
const isAutomationEntry = (entry: LogbookEntry): boolean =>
  !entry.context_user_id &&
  (entry.context_event_type === 'automation_triggered' ||
    String(entry.context_entity_id || '').startsWith('automation.'));

/**
 * Marks the history rows made by automations, with their names. The recorder's history has no context, but in the logbook each change
 * says what caused it (“triggered by automation …”). Rows are matched by entity, state and time.
 */
export function markAutomated(
  series: Record<string, HistoryRow[]>,
  entries: readonly LogbookEntry[],
): Record<string, HistoryRow[]> {
  const byEntity: Record<string, {s: string; t: number; by: string | null}[]> = {};
  for (const entry of entries) {
    if (!entry.entity_id || entry.state == null || !isAutomationEntry(entry)) continue;
    const list = (byEntity[entry.entity_id] ||= []);
    list.push({s: entry.state, t: Number(entry.when) * 1000, by: entry.context_name || null});
  }
  for (const [entity, list] of Object.entries(byEntity)) {
    const rows = series[entity];
    if (!rows) continue;
    list.sort((a, b) => a.t - b.t);
    let first = 0;
    for (const row of rows) {
      while (first < list.length && list[first].t < row.t - MATCH_MS) first++;
      for (let index = first; index < list.length && list[index].t <= row.t + MATCH_MS; index++) {
        if (list[index].s !== row.s) continue;
        row.auto = true;
        row.by = list[index].by;
        break;
      }
    }
  }
  return series;
}
