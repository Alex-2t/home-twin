// The AI build's pins (D-073, D-076): the owner marks spots where something is wrong, on the plan or on the home in 3D, and
// says what. This is what a spot is — its room and the item there, what the owner was looking at (view) and the photos they
// added — and what goes to the service. A pin that did not work out last time comes back with why. Data only; the screen
// is ai-review.js.
import {pointIn, segDist} from '../core/geometry.js';
import {N} from '../i18n/i18n.js';

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
  refused: N('Not enough room there: point at another spot'),
  undone: N('It would block a door or the way through'),
  unchanged: N('It did not work, our mistake: we try again'),
  'same-place': N('Not clear where to move it: point at the spot'),
  box: N('We could not draw it yet: we try again'),
  'no-room': N('The pin is outside the home'),
  light: N('Lights are added at the next stage'),
  still: N('From where you looked it still looks wrong: we try again'),
  cannot: N('We can’t do this yet'),
  unclear: N('Not understood: say it another way or add a photo'),
};

/** The room a spot is in, else the nearest one within `near` metres; null outside the home. */
export function roomAt(plan, p, near = NEAR_ROOM) {
  const rooms = (plan.rooms || []).filter(room => !room.solid);
  const inside = rooms.find(room => pointIn(p, room.polygon));
  if (inside) return inside;
  let nearest = null;
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
export function newPin(plan, hit) {
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
export const pinLabel = (pin, outside) => [pin.itemName, pin.roomName || outside].filter(Boolean).join(' · ');

/** The pins as the service gets them: only those with words, numbered in order. */
export function pinsToSend(pins) {
  return pins
    .filter(pin => pin.text.trim())
    .map((pin, i) => ({
      n: i + 1,
      x: pin.x,
      y: pin.y,
      ...(pin.z != null ? {z: pin.z} : {}),
      ...(pin.room ? {room: pin.room, roomName: pin.roomName} : {}),
      ...(pin.item ? {item: pin.item, itemName: pin.itemName} : {}),
      text: pin.text.trim(),
      ...(pin.view ? {view: pin.view} : {}),
      ...(pin.camera ? {camera: pin.camera} : {}),
      ...(pin.photos?.length ? {photos: pin.photos.slice(0, MAX_PIN_PHOTOS)} : {}),
    }));
}

/**
 * The pins of the last round that did not work out, as pins again (the service's status lastRound): where they were, the
 * owner's words and pictures, and why (`retry`: the service's reason codes, harness owner-result.ts). The owner can add a
 * photo or say it again, or delete them.
 */
export function pinsToRetry(lastRound) {
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
      text: pin.text,
      view: pin.view || null,
      ...(pin.camera ? {camera: pin.camera} : {}),
      photos: pin.photos || [],
      retry: retryOf(lastRound.round, pin),
    }));
}

const reasonCodes = pin => [...new Set((pin.why || []).map(w => w.code))];

/**
 * What comes back with a pin not made: the round, the pin's number, made in part or not, the reasons' codes, what the service
 * said to the owner in their language (`told`: what it can't do yet and why, what it asks, what it sees now) and how it
 * understood the pin.
 */
function retryOf(round, pin) {
  const told = (pin.why || []).filter(w => w.say).map(w => ({code: w.code, say: w.say}));
  return {
    round,
    n: pin.n,
    made: pin.made,
    codes: reasonCodes(pin),
    ...(told.length ? {told} : {}),
    ...(pin.understood ? {understood: pin.understood} : {}),
  };
}

/**
 * The draft's pins that came back from the last round, checked against what the service says of that round now (its result
 * can change: a round judged again). One made now leaves the draft, or, when the owner added words or photos to it, stays
 * without its reason; one still not made shows its reason as it is now. A pin from before pins kept their number is found
 * by its words and its thing.
 */
export function refreshRetries(pins, lastRound) {
  const roundPins = lastRound?.pins || [];
  return pins.flatMap(pin => {
    if (!pin.retry || (pin.retry.round != null && pin.retry.round !== lastRound?.round)) return [pin];
    const now =
      pin.retry.n != null
        ? roundPins.find(roundPin => roundPin.n === pin.retry.n)
        : roundPins.find(roundPin => roundPin.text === pin.text && (roundPin.item || null) === (pin.item || null));
    if (!now) return [pin];
    if (now.made === 'yes') {
      const untouched = pin.text === now.text && (pin.photos || []).length === (now.photos || []).length;
      if (untouched) return [];
      const {retry, ...kept} = pin;
      return [kept];
    }
    const {told, understood, ...kept} = pin.retry;
    return [{...pin, retry: {...kept, ...retryOf(lastRound.round, now)}}];
  });
}

/** How many changes the owner asks for: each pin with words, and the note for the whole home. */
export const changeCount = notes => notes.pins.filter(pin => pin.text.trim()).length + (notes.text.trim() ? 1 : 0);
