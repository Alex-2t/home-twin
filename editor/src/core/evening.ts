// The evening a home is shown in (D-116): night outside and only a couple of rooms lit, the light a home looks best in on the
// renders of its cards and when it opens on another site (the editor's showcase, ?show). Which rooms, of those that have a lamp:
// the main room people spend the evening in (the largest living room, kitchen or dining room) and the largest bedroom; where
// one of them is missing, the next largest room lived in, so two rooms are lit where two have lamps. Every other lamp is off.
// An AI-built home has only the lamps its video showed, often none in the living room: the rule picks among those it has.
import {area} from './geometry.ts';
import {roomKind} from './overview.ts';
import type {Room, RoomKind} from './types.ts';

// Where the evening is spent, in the order a tie is settled in.
const EVENING_KINDS: readonly RoomKind[] = ['living', 'kitchen', 'dining'];
// Where the second light is: a bedroom first, else another room lived in.
const BEDROOM_KINDS: readonly RoomKind[] = ['bed', 'kids'];
const LIVED_IN_KINDS: readonly RoomKind[] = ['office', 'room', 'living', 'kitchen', 'dining'];

const roomArea = (room: Room): number => Math.abs(area(room.polygon));

// How many rooms are lit.
const LIT_ROOMS = 2;

/** The largest of the rooms whose kind is one of these, not taken already; none: null. */
function largestOf(rooms: Room[], kinds: readonly RoomKind[], taken: Set<string>): Room | null {
  let largest: Room | null = null;
  for (const room of rooms) {
    if (taken.has(room.id)) continue;
    if (!kinds.includes(roomKind(room.name))) continue;
    if (!largest || roomArea(room) > roomArea(largest)) largest = room;
  }
  return largest;
}

/** The ids of the rooms lit in the evening (at most two), of the rooms these lamps are in. */
export function eveningRooms(rooms: Room[], lamps: Array<{room?: string | null}>): Set<string> {
  const withLamps = new Set(lamps.map(lamp => lamp.room).filter(room => !!room));
  const candidates = rooms.filter(room => !room.solid && withLamps.has(room.id));
  const lit = new Set<string>();
  const main = largestOf(candidates, EVENING_KINDS, lit);
  if (main) lit.add(main.id);
  const bedroom = largestOf(candidates, BEDROOM_KINDS, lit);
  if (bedroom) lit.add(bedroom.id);
  while (lit.size < LIT_ROOMS) {
    const next = largestOf(candidates, [...LIVED_IN_KINDS, ...BEDROOM_KINDS], lit);
    if (!next) break;
    lit.add(next.id);
  }
  return lit;
}
