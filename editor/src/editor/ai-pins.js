// The AI build's pins (D-073): the owner marks spots where something is wrong, on the plan or on the home in 3D, and says
// what. This is what a spot is — its room and the item there — and what goes to the service. Data only; the screen is
// ai-review.js.
import {pointIn, segDist} from '../core/geometry.js';

// A pin on an exterior wall seen from outside lands outside its room: the nearest room within this many metres counts.
const NEAR_ROOM = 0.6;

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
    }));
}

/** How many changes the owner asks for: each pin with words, and the note for the whole home. */
export const changeCount = notes => notes.pins.filter(pin => pin.text.trim()).length + (notes.text.trim() ? 1 : 0);
