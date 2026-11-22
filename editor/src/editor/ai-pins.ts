// The AI build's pins (D-073, D-076): the owner marks spots where something is wrong, on the plan or on the home in 3D, and
// says what. This is what a spot is — its room and the item there, what the owner was looking at (view) and the photos they
// added — and what goes to the service. A pin that did not work out last time comes back with why. Data only; the screen
// is ai-review.ts.
import {pointIn, segDist} from '../core/geometry.ts';
import {N, t} from '../i18n/i18n.ts';
import type {FurnitureItem, HomeView, Point, Room} from '../core/types.ts';

/** What the pins read of a plan: its rooms, and the ids and names of its items. */
export interface PinPlan {
  rooms: Room[];
  furniture?: Array<Pick<FurnitureItem, 'id' | 'name'>>;
}

/** A spot the owner pinned: on the plan {p}, or in 3D what the view picked {p, z, inside, item} (scene.ts pick). */
export interface PinHit {
  p: Point;
  z?: number;
  /** A point a little inside the wall that was hit: the room comes from it. */
  inside?: Point;
  item?: string | null;
}

/**
 * One turn of a pin's conversation (the owner: a pin not done should be a dialog): the owner's words, or the app's answer as
 * the owner read it — how it understood the pin, why it was not done, what it asked — in their language.
 */
export interface PinTurn {
  who: 'owner' | 'app';
  text: string;
}

/** Whether the service made a pin: yes, in part, or not. */
export type PinMade = 'yes' | 'partly' | 'no';

/** A reason the service gives for a pin not made: its code (MISSED_REASON), its note for us, its words to the owner. */
export interface PinReason {
  code: string;
  text?: string;
  say?: string;
}

/** A pin as the service reads it back in its status (lastRound, rounds): the pin it got, whether it was made, and why not. */
export interface RoundPin {
  n: number;
  x: number;
  y: number;
  z?: number;
  room?: string;
  roomName?: string;
  item?: string;
  itemName?: string;
  text: string;
  view?: string;
  camera?: HomeView;
  photos?: string[];
  made: PinMade;
  why?: PinReason[];
  /** How the service understood the pin, in the owner's language. */
  understood?: string;
  /** The conversation about the pin before its words, as it was sent (the service gives it back). */
  thread?: PinTurn[];
  /** The pin needs a bigger step than one fix may spend on: what it is and its share of the package (the harness's pin-ladder.ts). */
  offer?: PinOffer;
}

/** A bigger step the service offers for a pin, beyond what one fix may spend: its level and share of the package, percent. */
export interface PinOffer {
  level: string;
  percent: number;
}

/** A round of the owner's pins as the service judged it. */
export interface PinRound {
  round: number;
  pins?: RoundPin[];
  /** The developer's round (D-129): the pin sent to them that it fixes, by its round and number; its one pin is that pin. */
  fixes?: {round: number; n: number};
}

/**
 * What comes back with a pin not made (retryOf): the round and the pin's number there (none in pins kept before rounds
 * numbered them), made in part or not, the reasons' codes, what the service told the owner, how it understood the pin, and
 * whether the owner sent it to the developer.
 */
export interface PinRetry {
  round?: number;
  n?: number;
  made: PinMade;
  codes: string[];
  told?: Array<{code: string; say: string}>;
  understood?: string;
  reported?: boolean;
  /** The bigger step the service offered for it, the owner's to say yes to. */
  offer?: PinOffer;
}

/**
 * A pin the owner puts: the spot (z: in 3D), its room and item, the words, the view kept when it was put and the photos added
 * (their names at the service), the camera it was put from in 3D, and why it came back (retry).
 */
export interface Pin {
  x: number;
  y: number;
  z?: number;
  room: string | null;
  roomName: string | null;
  item: string | null;
  itemName: string | null;
  text: string;
  view: string | null;
  photos: string[];
  camera?: HomeView;
  retry?: PinRetry;
  /** The owner's words the app answered last round, when the pin came back: `text` is then their answer to it. */
  said?: string;
  /** The conversation before `said`, oldest first (earlier rounds). */
  thread?: PinTurn[];
  /** The owner said yes to the bigger step offered for it (retry.offer): its level goes with the pin. */
  accept?: string;
}

/** The owner's notes on a build: the pins, and the words for the whole home. */
export interface PinNotes {
  pins: Pin[];
  text: string;
}

/** A pin as the service gets it (the answer's pins): numbered, with only what it has. */
export interface SentPin {
  n: number;
  x: number;
  y: number;
  z?: number;
  room?: string;
  roomName?: string | null;
  item?: string;
  itemName?: string | null;
  text: string;
  view?: string;
  camera?: HomeView;
  photos?: string[];
  /** The pin of an earlier round this one says again: the developer sees how many times it was tried (D-129). */
  retryOf?: {round: number; n: number};
  /** The conversation before `text`, oldest first: the owner's earlier words and the app's answers. */
  thread?: PinTurn[];
  /** The bigger step the owner said yes to (the service takes it only if it offered it for the pin named by retryOf). */
  accept?: string;
}

/** Where a pin sent to the developer stands (D-129; the service's tools/feedback.ts). */
export type ReportStatus = 'sent' | 'looking' | 'fixed' | 'cannot';

/** A pin sent to the developer as the build's status tells it: the pin by its round and number, and where it stands. */
export interface ReportView {
  round: number;
  n: number;
  status: ReportStatus;
  at: string;
  /** The developer's note: why it cannot be done, what to do by hand. */
  note?: string;
  /** The round of the build that made the fix. */
  fixRound?: number;
}

/** The report of a pin that came back, if it was sent (its retry's round and number). */
export function reportOf(
  pin: Pick<Pin, 'retry'> | null | undefined,
  reports: ReportView[],
): ReportView | null {
  const retry = pin?.retry;
  if (retry?.round == null || retry.n == null) return null;
  return reports.find(report => report.round === retry.round && report.n === retry.n) || null;
}

// A pin on an exterior wall seen from outside lands outside its room: the nearest room within this many metres counts.
const NEAR_ROOM = 0.6;
/** Photos the owner may add to one pin (the service keeps as many: the harness's owner-notes.ts). */
export const MAX_PIN_PHOTOS = 4;

/**
 * Why a pin did not work out last time, by the service's reason (the harness's OWNER_MISS_CODES in tools/types.ts; its test
 * reads this list): what happened and what helps, in a few words. A reason the owner cannot read is as good as none.
 */
export const MISSED_REASON = {
  'no-fix': N('Not understood what to change: say it another way or add a photo'),
  refused: N('We could not fit it there: drag it yourself on the plan'),
  undone: N('It ran into another thing and we could not make room: drag it yourself on the plan'),
  unchanged: N('It did not work, our mistake: we try again'),
  'same-place': N('Not clear where to move it: point at the spot, or drag it yourself on the plan'),
  'put-back': N('Our layout put it back: we try again'),
  'too-small': N('Moved too little to see: say how far, or drag it yourself on the plan'),
  swapped: N('Width and depth mixed up: we try again'),
  'left-out': N('We leave such things out: add it in the editor'),
  box: N('We could not draw it yet: we try again'),
  'no-room': N('The pin is outside the home'),
  light: N('We could not place this lamp: point at another spot'),
  still: N('From where you looked it still looks wrong: we try again'),
  cannot: N('We can’t do this yet'),
  unclear: N('Not understood: say it another way or add a photo'),
  blocked: N('Done, but it runs into the thing next to it: drag one of them on the plan'),
  // {0}: the things that went, by their names
  gone: N('{0} went missing with it: put it back in the editor or pin it'),
  'wrong-door': N('Not clear which door: put the pin right on it'),
  offer: N('This needs a bigger change than one fix may take'),
};

/** The room a spot is in, else the nearest one within `near` metres; null outside the home. */
export function roomAt(plan: Pick<PinPlan, 'rooms'>, p: Point, near = NEAR_ROOM): Room | null {
  const rooms = (plan.rooms || []).filter(room => !room.solid);
  const inside = rooms.find(room => pointIn(p, room.polygon));
  if (inside) return inside;
  let nearest: Room | null = null;
  let nearestMetres = near;
  for (const room of rooms) {
    const ring = room.polygon;
    for (let i = 0; i < ring.length; i++) {
      const [metres] = segDist(p, ring[i], ring[(i + 1) % ring.length]);
      if (metres < nearestMetres) {
        nearest = room;
        nearestMetres = metres;
      }
    }
  }
  return nearest;
}

/**
 * A new pin from a spot: on the plan {p}, or in 3D what the view picked {p, z, inside, item}. The room comes from the point a
 * little inside (a wall hit), the item from the furniture hit.
 */
export function newPin(plan: PinPlan, hit: PinHit): Pin {
  const room = roomAt(plan, hit.inside || hit.p);
  const item = hit.item ? (plan.furniture || []).find(f => f.id === hit.item) : null;
  return {
    x: hit.p[0],
    y: hit.p[1],
    ...(hit.z != null ? {z: hit.z} : {}),
    room: room?.id || null,
    roomName: room?.name || null,
    item: item?.id || null,
    itemName: item?.name || null,
    text: '',
    view: null,
    photos: [],
  };
}

/** What a pin points at, as the owner reads it in the list: "Sofa · Living room". */
export const pinLabel = (
  pin: {itemName?: string | null; roomName?: string | null},
  outside: string,
): string => [pin.itemName, pin.roomName || outside].filter(Boolean).join(' · ');

// Each reason in the service's own words for this pin when it gave them (what it can't do yet and why, what it asks, what it
// sees now — in the owner's language), else the reason's usual words.
const saidFor = (retry: PinRetry | undefined, code: string): string =>
  (retry?.told || [])
    .filter(told => told.code === code)
    .map(told => told.say)
    .join(' ');
// The reasons by any code the service sends: one this list does not have reads as none.
const missedReasons: Partial<Record<string, string>> = MISSED_REASON;
const missedText = (retry: PinRetry): string =>
  (retry?.codes || []).map(code => reasonText(retry, code)).join(' · ');
// A thing gone with the round: its name is what the service says, in the reason's words.
const goneNames = (retry: PinRetry): string =>
  (retry?.told || [])
    .filter(told => told.code === 'gone')
    .map(told => told.say)
    .join(', ');
const reasonText = (retry: PinRetry, code: string): string => {
  if (code === 'gone') return t(MISSED_REASON.gone, goneNames(retry) || '?');
  return saidFor(retry, code) || t(missedReasons[code] || MISSED_REASON.unchanged);
};
/**
 * Under a pin that comes back: not done, or done in part, and why (the owner: "Last time: …" told them nothing). What the app
 * can't do yet, and what was not understood, say so plainly (the owner: "why was it unclear?" — it was understood, and the
 * app could not do it).
 */
export const retryText = (retry: PinRetry): string => {
  const codes = retry?.codes || [];
  const only = (code: string): string | false =>
    codes.length > 0 && codes.every(each => each === code) && saidFor(retry, code);
  if (only('cannot')) return t('We can’t do this yet: {0}', saidFor(retry, 'cannot'));
  if (only('unclear')) return t('Not understood: {0}', saidFor(retry, 'unclear'));
  if (only('offer') && retry.offer) return offerText(retry.offer);
  return t(retry.made === 'partly' ? 'Done in part: {0}' : 'Not done: {0}', missedText(retry));
};
/**
 * A bigger step the service offers for a pin, by its level (the harness's pin-ladder.ts levels; things and room never cost
 * more than one fix may take): what it would do and its share of the package. Another level reads as a bigger change.
 */
const OFFER_TEXT: Partial<Record<string, string>> = {
  rooms: N(
    'This needs us to match the rooms to the plan again: about {0}% of the package, more than one fix may take',
  ),
  plan: N('This needs us to read the plan again: about {0}% of the package, more than one fix may take'),
  video: N(
    'This needs us to read this room from the video again: about {0}% of the package, more than one fix may take',
  ),
  whole: N('This needs us to build the home again: about {0}% of the package, more than one fix may take'),
};
const OFFER_OTHER = N('This needs a bigger change: about {0}% of the package, more than one fix may take');

/** What the owner reads of a bigger step offered for a pin, in their language. */
export const offerText = (offer: PinOffer): string =>
  t(OFFER_TEXT[offer.level] || OFFER_OTHER, offer.percent);

/** How the service understood a pin that came back, for the owner to read. */
export const understoodText = (retry: PinRetry | undefined): string =>
  retry?.understood ? t('Understood as: {0}', retry.understood) : '';

/** A pin's words as they go: the owner's answer, else, for a pin that came back, the words the app answered. */
export const pinWords = (pin: Pick<Pin, 'text' | 'said'>): string =>
  pin.text.trim() || pin.said?.trim() || '';

// The turns of a pin's conversation that go with it (the harness keeps as many).
const MAX_THREAD_TURNS = 8;

/**
 * A pin's conversation before the words it goes with: the earlier rounds', then, for a pin that came back, the words the app
 * answered and its answer as the owner read it (how it understood the pin, why it was not done or what it asked).
 */
export function pinThread(pin: Pick<Pin, 'said' | 'retry' | 'thread'>): PinTurn[] {
  const turns = [...(pin.thread || [])];
  if (pin.said?.trim() && pin.retry) {
    turns.push({who: 'owner', text: pin.said.trim()});
    const answer = [understoodText(pin.retry), retryText(pin.retry)].filter(Boolean).join(' ');
    if (answer) turns.push({who: 'app', text: answer});
  }
  return turns.slice(-MAX_THREAD_TURNS);
}

/** The pins as the service gets them: only those with words, numbered in order. */
export function pinsToSend(pins: Pin[]): SentPin[] {
  return pins
    .filter(pin => pinWords(pin))
    .map((pin, i) => ({
      n: i + 1,
      x: pin.x,
      y: pin.y,
      ...(pin.z != null ? {z: pin.z} : {}),
      ...(pin.room ? {room: pin.room, roomName: pin.roomName} : {}),
      ...(pin.item ? {item: pin.item, itemName: pin.itemName} : {}),
      text: pinWords(pin),
      ...(pin.view ? {view: pin.view} : {}),
      ...(pin.camera ? {camera: pin.camera} : {}),
      ...(pin.photos?.length ? {photos: pin.photos.slice(0, MAX_PIN_PHOTOS)} : {}),
      ...(pin.retry?.round != null && pin.retry.n != null
        ? {retryOf: {round: pin.retry.round, n: pin.retry.n}}
        : {}),
      ...(pinThread(pin).length ? {thread: pinThread(pin)} : {}),
      ...(pin.accept && pin.retry?.offer?.level === pin.accept ? {accept: pin.accept} : {}),
    }));
}

/**
 * The pins of the last round that did not work out, as pins again (the service's status lastRound): where they were, the
 * owner's words (`said`) and pictures, the conversation before them, and why (`retry`: the service's reason codes, harness
 * owner-result.ts). The owner answers in `text`, adds a photo, or deletes them; a pin not answered goes again as it was.
 */
export function pinsToRetry(lastRound: PinRound | null | undefined): Pin[] {
  // the developer's round answers a pin the owner has already (refreshRetries): nothing comes back twice
  if (lastRound?.fixes) return [];
  return (lastRound?.pins || [])
    .filter(pin => pin.made !== 'yes')
    .map(pin => ({
      x: pin.x,
      y: pin.y,
      ...(pin.z != null ? {z: pin.z} : {}),
      room: pin.room || null,
      roomName: pin.roomName || null,
      item: pin.item || null,
      itemName: pin.itemName || null,
      text: '',
      said: pin.text,
      ...(pin.thread?.length ? {thread: pin.thread} : {}),
      view: pin.view || null,
      ...(pin.camera ? {camera: pin.camera} : {}),
      photos: pin.photos || [],
      // The pins are lastRound's: it is there.
      retry: retryOf(lastRound!.round, pin),
    }));
}

const reasonCodes = (pin: RoundPin): string[] => [...new Set((pin.why || []).map(w => w.code))];

/**
 * What comes back with a pin not made: the round, the pin's number, made in part or not, the reasons' codes, what the service
 * said to the owner in their language (`told`: what it can't do yet and why, what it asks, what it sees now) and how it
 * understood the pin.
 */
function retryOf(round: number, pin: RoundPin): PinRetry {
  const told = (pin.why || [])
    .filter((w): w is PinReason & {say: string} => !!w.say)
    .map(w => ({code: w.code, say: w.say}));
  return {
    round,
    n: pin.n,
    made: pin.made,
    codes: reasonCodes(pin),
    ...(told.length ? {told} : {}),
    ...(pin.understood ? {understood: pin.understood} : {}),
    ...(pin.offer ? {offer: pin.offer} : {}),
  };
}

/**
 * The draft's pins that came back from the last round, checked against what the service says of that round now (its result
 * can change: a round judged again). One made now leaves the draft, or, when the owner added words or photos to it, stays
 * without its reason; one still not made shows its reason as it is now. A pin from before pins kept their number is found
 * by its words and its thing.
 */
export function refreshRetries(pins: Pin[], lastRound: PinRound | null | undefined): Pin[] {
  const roundPins = lastRound?.pins || [];
  return pins.flatMap((pin): Pin[] => {
    const pinRetry = pin.retry;
    if (!pinRetry) return [pin];
    // The developer's round that fixed this pin (D-129): made, the pin leaves; not made, it stays as it was, with its report.
    const fixes = lastRound?.fixes;
    if (fixes && pinRetry.round === fixes.round && pinRetry.n === fixes.n)
      return lastRound?.pins?.[0]?.made === 'yes' ? [] : [pin];
    if (pinRetry.round != null && pinRetry.round !== lastRound?.round) return [pin];
    const now =
      pinRetry.n != null
        ? roundPins.find(roundPin => roundPin.n === pinRetry.n)
        : roundPins.find(
            roundPin =>
              roundPin.text === (pin.said ?? pin.text) && (roundPin.item || null) === (pin.item || null),
          );
    if (!now) return [pin];
    if (now.made === 'yes') {
      // not answered (a pin from before the conversation: its words as they were) and no photo added
      const sameWords = pin.said != null ? !pin.text.trim() : pin.text === now.text;
      const untouched = sameWords && (pin.photos || []).length === (now.photos || []).length;
      if (untouched) return [];
      const {retry, ...kept} = pin;
      return [kept];
    }
    const {told, understood, ...kept} = pinRetry;
    // now is one of lastRound's pins: it is there.
    return [{...pin, retry: {...kept, ...retryOf(lastRound!.round, now)}}];
  });
}

/** The pins without those the developer fixed (D-129): a pin sent to them and fixed by their round no longer comes back. */
export function withoutFixed(pins: Pin[], reports: ReportView[]): Pin[] {
  return pins.filter(pin => reportOf(pin, reports)?.status !== 'fixed');
}

/** How many changes the owner asks for: each pin with words, and the note for the whole home. */
export const changeCount = (notes: PinNotes): number =>
  notes.pins.filter(pin => pin.text.trim()).length + (notes.text.trim() ? 1 : 0);
