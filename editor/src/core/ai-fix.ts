// A fix of an AI-built home reaching a home already taken (D-129). After "All right" the home is the user's and they may
// have changed it, so a fix is never swapped in whole: it is taken room by room. Three versions are compared:
//   base  — the build's home the user took (plan.source.round),
//   fixed — the build's home after the developer's fix,
//   local — the home in the editor now.
// A room the fix changed and the user did not touch since the base is taken as fixed; a room both changed is the user's
// choice. The walls and openings are one more such part: a fix by a model never changes them, one by hand may.
// What the fix changed is base against fixed (two files of the service, alike). What the user changed is the home now
// against its prints taken when it came into the editor (plan.source.prints): the editor itself changes a home as it opens
// it (migrate, the lamps from HA), so the base file is not what the user started from.
// Data only; the screen is editor/ai-fix.ts.
import {pointIn} from './geometry.ts';
import type {ContentPrints, FurnitureItem, Plan, PlanLight, Room} from './types.ts';

/** A room the fix changed: its id and name, and whether the user changed it too since the version they took. */
export interface FixRoom {
  room: string;
  name: string;
  changedByUser: boolean;
}

/** What a fix would change in the home in the editor. */
export interface FixOffer {
  rooms: FixRoom[];
  /** The fix changed the walls or openings; changedByUser: the user changed them too. Null: the fix left them. */
  walls: {changedByUser: boolean} | null;
}

/** What the user takes of a fix: the rooms by id, and the walls and openings. */
export interface FixChoice {
  rooms: string[];
  walls: boolean;
}

/** The parts of a plan a fix is compared and taken by. */
type FixPlan = Pick<Plan, 'rooms' | 'openings' | 'furniture' | 'lights' | 'wall'>;

// A room's fields that are its walls (with the openings, one part of a fix), and those that are the user's own (its name,
// its HA area): neither is the room's contents. The rest is (its finishes: floor, wall colours and pieces).
const ROOM_GEOMETRY_KEYS = ['polygon', 'wt', 'rail', 'railGlass', 'solid'] as const;
const ROOM_OWN_KEYS = ['id', 'name', 'area', 'noArea'] as const;

/** A room's fields of these keys only. */
function roomPart(room: Room, keys: readonly string[]): Partial<Room> {
  const part: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(room)) if (keys.includes(key)) part[key] = value;
  return part as Partial<Room>;
}

/** A room's finishes: all but its walls and its own fields. */
function roomFinishes(room: Room): Partial<Room> {
  const part: Record<string, unknown> = {};
  const notFinishes: readonly string[] = [...ROOM_GEOMETRY_KEYS, ...ROOM_OWN_KEYS];
  for (const [key, value] of Object.entries(room)) if (!notFinishes.includes(key)) part[key] = value;
  return part as Partial<Room>;
}

/** The furniture standing in a room (its centre inside the room's outline, in this plan's own rooms). */
function furnitureIn(plan: FixPlan, room: Room): FurnitureItem[] {
  return plan.furniture.filter(item => pointIn([item.x, item.y], room.polygon));
}

/** The lights of a room (a light knows its room). */
function lightsIn(plan: FixPlan, roomId: string): PlanLight[] {
  return plan.lights.filter(light => light.room === roomId);
}

/** A list as a text that does not depend on its order: each thing's JSON, sorted. */
function unordered(things: object[]): string {
  return things
    .map(thing => JSON.stringify(thing))
    .sort()
    .join('\n');
}

/** What a room holds, as a text to compare: its furniture, its lights and its finishes. A plan without the room: nothing. */
function roomContents(plan: FixPlan, roomId: string): string {
  const room = plan.rooms.find(candidate => candidate.id === roomId);
  if (!room) return '';
  const finishes = JSON.stringify(Object.entries(roomFinishes(room)).sort());
  return [unordered(furnitureIn(plan, room)), unordered(lightsIn(plan, roomId)), finishes].join('\n--\n');
}

/** The walls and openings as a text to compare: the rooms' outlines and walls (not their names or finishes), the openings. */
function wallsOf(plan: FixPlan): string {
  const outlines = plan.rooms.map(room => ({id: room.id, ...roomPart(room, ROOM_GEOMETRY_KEYS)}));
  return JSON.stringify({
    rooms: unordered(outlines),
    openings: unordered(plan.openings),
    wall: plan.wall ?? null,
  });
}

/** The rooms' ids of all three versions, in the fixed version's order first. */
function roomIds(...plans: FixPlan[]): string[] {
  const ids: string[] = [];
  for (const plan of plans) for (const room of plan.rooms) if (!ids.includes(room.id)) ids.push(room.id);
  return ids;
}

/** A text's short print (FNV-1a, 32 bits, hex): enough to tell whether a room's contents changed. */
function printOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** The prints of a home's rooms and walls as it is now: kept with its source, to tell later what the user changed. */
export function contentPrints(plan: FixPlan): ContentPrints {
  const rooms: Record<string, string> = {};
  for (const room of plan.rooms) rooms[room.id] = printOf(roomContents(plan, room.id));
  return {rooms, walls: printOf(wallsOf(plan))};
}

/**
 * What the fix changed, and which of it the user changed too: against the prints taken when the home came into the editor,
 * or, without them, against the base version itself.
 */
export function fixOffer(
  local: FixPlan,
  base: FixPlan,
  fixed: FixPlan,
  prints: ContentPrints | null = null,
): FixOffer {
  const now = contentPrints(local);
  const userChangedRoom = (roomId: string): boolean =>
    prints
      ? now.rooms[roomId] !== prints.rooms[roomId]
      : roomContents(local, roomId) !== roomContents(base, roomId);
  const userChangedWalls = prints ? now.walls !== prints.walls : wallsOf(local) !== wallsOf(base);
  const rooms: FixRoom[] = [];
  for (const roomId of roomIds(fixed, base)) {
    const before = roomContents(base, roomId);
    if (roomContents(fixed, roomId) === before) continue;
    const named = fixed.rooms.find(room => room.id === roomId) || base.rooms.find(room => room.id === roomId);
    const localRoom = local.rooms.find(room => room.id === roomId);
    rooms.push({
      room: roomId,
      name: localRoom?.name || named?.name || roomId,
      changedByUser: userChangedRoom(roomId),
    });
  }
  const walls = wallsOf(fixed) === wallsOf(base) ? null : {changedByUser: userChangedWalls};
  return {rooms, walls};
}

/** One room of a home alone with what stands in it and its lights: to draw the user's and the fixed one side by side. */
export function roomView<P extends FixPlan>(plan: P, roomId: string): P | null {
  const room = plan.rooms.find(candidate => candidate.id === roomId);
  if (!room) return null;
  return {...plan, rooms: [room], furniture: furnitureIn(plan, room), lights: lightsIn(plan, roomId)};
}

/** The choice that takes all the user did not change, and asks nothing: the fix where it does not meet the user's edits. */
export function untouchedChoice(offer: FixOffer): FixChoice {
  return {
    rooms: offer.rooms.filter(room => !room.changedByUser).map(room => room.room),
    walls: !!offer.walls && !offer.walls.changedByUser,
  };
}

/**
 * The home in the editor with what the user takes of the fix: a room taken has the fixed version's furniture, lights and
 * finishes instead of its own; the walls taken have the fixed outlines and openings. A room keeps its own name and HA area
 * either way. Everything else stays as the user has it.
 */
export function applyFix<P extends FixPlan>(local: P, fixed: FixPlan, choice: FixChoice): P {
  const roomsBefore = choice.walls ? fixed.rooms : local.rooms;
  const rooms = roomsBefore.map(room => {
    const own = local.rooms.find(candidate => candidate.id === room.id);
    const fixedRoom = fixed.rooms.find(candidate => candidate.id === room.id);
    const geometry = roomPart(choice.walls || !own ? (fixedRoom ?? room) : own, ROOM_GEOMETRY_KEYS);
    const ownFields = roomPart(own ?? room, ROOM_OWN_KEYS);
    const takeFinishes = choice.rooms.includes(room.id) || !own;
    const finishes = roomFinishes(takeFinishes ? (fixedRoom ?? room) : own);
    return {...ownFields, ...geometry, ...finishes} as Room;
  });
  const openings = choice.walls ? fixed.openings : local.openings;
  const wall = choice.walls ? fixed.wall : local.wall;
  let furniture = local.furniture;
  let lights = local.lights;
  for (const roomId of choice.rooms) {
    const localRoom = local.rooms.find(room => room.id === roomId);
    const fixedRoom = fixed.rooms.find(room => room.id === roomId);
    const leaving = new Set(localRoom ? furnitureIn(local, localRoom) : []);
    furniture = furniture.filter(item => !leaving.has(item));
    lights = lights.filter(light => light.room !== roomId);
    if (fixedRoom) furniture = [...furniture, ...withFreeIds(furnitureIn(fixed, fixedRoom), furniture)];
    lights = [
      ...lights,
      ...lightsIn(fixed, roomId).filter(light => !lights.some(kept => kept.id === light.id)),
    ];
  }
  const taken: P = {...local, rooms, openings, furniture, lights};
  // a plan with no walls of its own keeps none (the defaults), rather than an empty field
  if (wall === undefined) delete taken.wall;
  else taken.wall = wall;
  return taken;
}

/** The fixed room's items, an id the home already uses elsewhere given a new one (an item moved to another room). */
function withFreeIds(items: FurnitureItem[], kept: FurnitureItem[]): FurnitureItem[] {
  const used = new Set(kept.map(item => item.id));
  return items.map(item => {
    if (!used.has(item.id)) {
      used.add(item.id);
      return item;
    }
    let copy = 2;
    while (used.has(`${item.id}_${copy}`)) copy++;
    const id = `${item.id}_${copy}`;
    used.add(id);
    return {...item, id};
  });
}
