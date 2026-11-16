// Home notifications (the owner's own card in 3d_floor, D-126): a stack in the corner of the model, like pushes on a phone — the
// newest arrives on top and moves the others down. Here: the notification types, which of them are shown, the day's counts, the
// stack's geometry and the age under each card. No DOM: editor/look-notes.ts lays the cards out by these numbers.
//
// The stack works like those of the big apps — Sonner (Vercel's, Linear's toasts), the iOS and macOS notification centres. Collapsed:
// the last few cards in full, as a list, and under the last of them two more peek out as smaller sheets. Under the pointer (on a
// phone, by a tap) the stack opens into a list that scrolls; near its bottom edge the cards shrink and fade, as on the iOS lock
// screen. Every move is on a spring: it overshoots a little and settles.
import {N, t, clock, dateTime} from '../i18n/i18n.ts';

/** What a notification is: an alert, a change by a person, by an automation, a hint of the home, or a device's connection. */
export type NoteCategory = 'alert' | 'manual' | 'automation' | 'hint' | 'link';

/** A notification as the home's events make it (look/home-events.ts); `at` in ms. */
export interface NoteDraft {
  icon: string;
  title: string;
  /** Where: the room, or the sensor. */
  source: string;
  category: NoteCategory;
  /** The automation that made the change, when it is known. */
  by?: string;
  /** An alert that has ended (no more leak): drawn without the alert's border. */
  resolved?: boolean;
  at?: number;
}

/** A notification in the log: its number and its time. */
export interface Note extends NoteDraft {
  id: number;
  at: number;
}

/** A notification type in the settings: its name, what it covers, its icon; a locked one cannot be turned off. */
export interface NoteType {
  id: NoteCategory;
  name: string;
  hint: string;
  icon: string;
  locked?: boolean;
}

// Each type has its own colour (card.css .type-*: the icon on the card and the dot on the settings button) and its own switch: what
// is shown in the corner of the model is the owner's choice. Alerts cannot be turned off: a leak must never be missed.
export const NOTE_TYPES: NoteType[] = [
  {
    id: 'alert',
    name: N('Alerts'),
    hint: N('Leak, water valve, smoke, vacuum error'),
    icon: 'alert',
    locked: true,
  },
  {id: 'manual', name: N('By hand'), hint: N('The card, the app, a wall switch'), icon: 'hand'},
  {id: 'automation', name: N('Automations'), hint: N('Scenes and rules of the home'), icon: 'sparkle'},
  {id: 'hint', name: N('Hints'), hint: N('Time to air out a room'), icon: 'leaf'},
  {id: 'link', name: N('Connection'), hint: N('A device dropped off the network'), icon: 'wifi'},
];
const TYPE_IDS: NoteCategory[] = NOTE_TYPES.map(type => type.id);

/** Which types are shown: true — shown. */
export type NoteFilter = Record<NoteCategory, boolean>;

// In a real home automations switch devices dozens of times more often than people do, and some devices drop off the network a few
// times a day — by default neither is shown. In the demo everything is: there are few events, and they are looked at for the colours.
export const LIVE_DEFAULTS: NoteFilter = {
  alert: true,
  manual: true,
  automation: false,
  hint: true,
  link: false,
};

/**
 * Which types to show: the mode's defaults, then the choice stored in this browser. Rubbish in the storage does not break the card,
 * and alerts are always on.
 */
export function noteFilter({
  stored = null,
  demo = false,
}: {stored?: unknown; demo?: boolean} = {}): NoteFilter {
  const filter: NoteFilter = demo
    ? {alert: true, manual: true, automation: true, hint: true, link: true}
    : {...LIVE_DEFAULTS};
  if (stored && typeof stored === 'object') {
    const choice = stored as Partial<Record<string, unknown>>;
    for (const id of TYPE_IDS) {
      const value = choice[id];
      if (typeof value === 'boolean') filter[id] = value;
    }
  }
  filter.alert = true;
  return filter;
}

/** How many events of each type there were in the last day: for the summary in the settings. */
export function noteStats(
  log: readonly Pick<Note, 'at' | 'category'>[],
  now = Date.now(),
): {byType: Record<NoteCategory, number>; total: number} {
  const byType: Record<NoteCategory, number> = {alert: 0, manual: 0, automation: 0, hint: 0, link: 0};
  for (const note of log) {
    const withinDay = now - note.at <= DAY_MS;
    if (withinDay && note.category in byType) byType[note.category]++;
  }
  const total = TYPE_IDS.reduce((sum, id) => sum + byType[id], 0);
  return {byType, total};
}
const DAY_MS = 864e5;

// ---------- the stack's geometry ----------

export const NOTE_FULL = 4; // how many of the last cards are seen in full while the stack is collapsed
export const NOTE_GAP = 8; // the gap between cards
export const NOTE_PEEK = 9; // how far a sheet peeks out from under the card above it
export const NOTE_DEPTH = 2; // how many sheets are seen under the last full card
export const NOTE_SPRING_MS = 600;

/** Where a card stands: y — offset from the top, s — scale (from the card's bottom edge), o — opacity, z — stacking order. */
export interface NotePlace {
  y: number;
  s: number;
  o: number;
  z: number;
  /** A sheet: its text is hidden, only its edge is seen. */
  behind: boolean;
}

/** The stack laid out: each card's place, the height of the whole stack, and the bottom of the last full card. */
export interface StackLayout {
  items: NotePlace[];
  height: number;
  bottom: number;
}

/**
 * Where each card stands. heights — the cards' heights, the newest first. Collapsed: the first `full` cards as a list, in full; the
 * rest are sheets under the last full one. Expanded: the whole list. `bottom` is the bottom of the collapsed stack's last full card:
 * the extra cards hide behind it, and come out from there when the stack opens.
 */
export function stackLayout(
  heights: readonly number[],
  {
    expanded = false,
    full = NOTE_FULL,
    gap = NOTE_GAP,
    peek = NOTE_PEEK,
    depth = NOTE_DEPTH,
  }: {expanded?: boolean; full?: number; gap?: number; peek?: number; depth?: number} = {},
): StackLayout {
  if (!heights.length) return {items: [], height: 0, bottom: 0};
  const order = (index: number): number => heights.length - index;
  const tops: number[] = [];
  let y = 0;
  for (const height of heights) {
    tops.push(y);
    y += height + gap;
  }
  const last = Math.min(Math.max(1, full), heights.length) - 1;
  const bottom = tops[last] + heights[last];
  if (expanded) {
    const items = heights.map((_, index) => ({y: tops[index], s: 1, o: 1, z: order(index), behind: false}));
    return {items, height: y - gap, bottom};
  }
  const items = heights.map((height, index): NotePlace => {
    if (index <= last) return {y: tops[index], s: 1, o: 1, z: order(index), behind: false};
    // the extra ones hide behind the last visible sheet — and come out from there too
    const level = Math.min(index - last, depth + 1);
    return {
      y: bottom + level * peek - height,
      s: 1 - level * 0.05,
      o: level > depth ? 0 : 1,
      z: order(index),
      behind: true,
    };
  });
  const sheets = Math.min(heights.length - 1 - last, depth);
  return {items, height: bottom + sheets * peek, bottom};
}

/** The place behind the stack: under the bottom of the last full card, behind the sheets. */
export function tuckedPlace(
  bottom: number,
  height: number,
  {peek = NOTE_PEEK, depth = NOTE_DEPTH}: {peek?: number; depth?: number} = {},
): Pick<NotePlace, 'y' | 's' | 'o'> {
  return {y: bottom + (depth + 1) * peek - height, s: 1 - (depth + 1) * 0.05, o: 0};
}

/** How many cards fit in full into `room` together with the sheets — no more than NOTE_FULL, at least one. */
export function fullCount(
  room: number,
  cardHeight: number,
  {max = NOTE_FULL, gap = NOTE_GAP, peek = NOTE_PEEK, depth = NOTE_DEPTH} = {},
): number {
  const fitting = Math.floor((room - depth * peek + gap) / (cardHeight + gap));
  return Math.max(1, Math.min(max, fitting));
}

/**
 * The expanded list's edges while it scrolls, as on the iOS lock screen: nearing the bottom edge a card shrinks and fades; going past
 * the top it fades. top — the card's top relative to the visible area.
 */
export function edgeFade(
  top: number,
  height: number,
  viewport: number,
  {edge = 64}: {edge?: number} = {},
): {scale: number; opacity: number} {
  const below = Math.min(1, Math.max(0, (top + height - (viewport - edge)) / (edge + height * 0.5)));
  const above = Math.min(1, Math.max(0, -top / height));
  const scale = 1 - 0.08 * below - 0.05 * above;
  const opacity = Math.max(0, 1 - 0.6 * below - 0.8 * above);
  return {scale: +scale.toFixed(3), opacity: +opacity.toFixed(3)};
}

/**
 * A spring as a CSS linear() curve: a damped oscillation that overshoots the target by ~4 % and settles within `duration`. Cards move
 * so on iOS; a cubic-bezier cannot take this shape.
 */
export function springEasing({
  damping = 0.72,
  duration = NOTE_SPRING_MS / 1000,
  points = 40,
}: {damping?: number; duration?: number; points?: number} = {}): string {
  const omega = Math.log(500) / (damping * duration);
  const dampedOmega = omega * Math.sqrt(1 - damping * damping);
  const at = (time: number): number =>
    1 -
    Math.exp(-damping * omega * time) *
      (Math.cos(dampedOmega * time) + ((damping * omega) / dampedOmega) * Math.sin(dampedOmega * time));
  const values = Array.from({length: points + 1}, (_, index) =>
    index === points ? 1 : +at((index / points) * duration).toFixed(4),
  );
  return `linear(${values.join(', ')})`;
}

/** The time under a notification: “just now”, “12 min ago”, “at 14:05”, “yesterday at 21:40”, “3 November at 9:15”. */
export function noteAge(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) return t('just now');
  if (minutes < 60) return t('{0} min ago', minutes);
  const time = clock(at);
  const day = (value: number): string => new Date(value).toDateString();
  if (day(at) === day(now)) return t('at {0}', time);
  if (day(at) === day(now - DAY_MS)) return t('yesterday at {0}', time);
  return t('{0} at {1}', dateTime(at, {day: 'numeric', month: 'long'}), time);
}
