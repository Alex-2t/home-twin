// @ts-nocheck
// Skirting boards and door and window trim in the 3D view (D-080). A room read flat without them: one even colour from floor
// to ceiling, nothing to tell where a wall ends and a door begins. Each room gets its own on its own face of the walls, so a
// wall between two rooms has trim on both sides. No trim where there is no wall: an edge whose wall is taken away (wt 0) or a
// railing (rail).
import {WALL, area, offset} from './geometry.ts';

/** The sizes of the trim, metres. */
export const TRIM = {
  skirtingHeight: 0.09,
  skirtingDepth: 0.014,
  casingWidth: 0.065,
  casingDepth: 0.016,
  sillDepth: 0.045,
  sillHeight: 0.025,
};

// An opening lies on a room's edge when both its ends are this close to the edge's line.
const ON_EDGE_METRES = 0.35;
// A window this low reaches the floor (a balcony door, a French window): the skirting stops at it.
const FLOOR_WINDOW_METRES = 0.1;
// Shorter than this, a piece of skirting is left out.
const SHORTEST_METRES = 0.05;

const minus = (a, b) => [a[0] - b[0], a[1] - b[1]];
const plus = (a, b) => [a[0] + b[0], a[1] + b[1]];
const times = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/**
 * A box standing on the plan: its footprint (a closed ring, as the 3D view's prism takes it), its bottom and its top, and the
 * opening it frames (its index; null for skirting).
 */
function box(start, end, inward, depth, bottom, top, opening = null) {
  const ring = [start, end, plus(end, times(inward, depth)), plus(start, times(inward, depth)), start];
  return {mp: [[ring]], bottom, top, opening};
}

/**
 * The trim of a home: boxes {mp, bottom, top, opening} on the plan (metres, the plan's x and y; heights above the floor;
 * `opening`: the index of the opening a casing frames, so it hides with its facade).
 * rooms: the plan's rooms; openings: with their ends a, b, kind, bottom and top (openingCoords).
 */
export function trimBoxes(rooms, openings) {
  const boxes = [];
  for (const room of rooms) {
    if (room.solid || room.polygon.length < 3) continue;
    const face = offset(room.polygon, -WALL.inner);
    // A room with a corner doubled: its edges and the face's do not pair up; it gets no trim rather than wrong trim.
    if (face.length !== room.polygon.length) continue;
    const turning = area(room.polygon) > 0 ? 1 : -1;
    for (let i = 0; i < room.polygon.length; i++) {
      if (room.wt?.[i] === 0 || room.rail?.[i] > 0) continue;
      const next = (i + 1) % room.polygon.length;
      boxes.push(...edgeTrim(room.polygon[i], room.polygon[next], face[i], face[next], turning, openings));
    }
  }
  return boxes;
}

/** One wall's trim on one room's side: the skirting with its doors left out, and each opening's casing. */
function edgeTrim(axisStart, axisEnd, faceStart, faceEnd, turning, openings) {
  const length = Math.hypot(...minus(faceEnd, faceStart));
  if (length < SHORTEST_METRES) return [];
  const along = times(minus(faceEnd, faceStart), 1 / length);
  const inward = [-along[1] * turning, along[0] * turning];
  const axisLength = Math.hypot(...minus(axisEnd, axisStart));
  const axisAlong = times(minus(axisEnd, axisStart), 1 / axisLength);
  const offLine = point => Math.abs(dot(minus(point, axisStart), [-axisAlong[1], axisAlong[0]]));
  const at = s => plus(faceStart, times(along, s));
  const spans = [];
  for (const [index, opening] of openings.entries()) {
    if (!opening?.a || !opening?.b) continue;
    if (Math.max(offLine(opening.a), offLine(opening.b)) > ON_EDGE_METRES) continue;
    const s0 = Math.min(dot(minus(opening.a, faceStart), along), dot(minus(opening.b, faceStart), along));
    const s1 = Math.max(dot(minus(opening.a, faceStart), along), dot(minus(opening.b, faceStart), along));
    if (s1 < 0 || s0 > length) continue;
    spans.push({opening, index, s0: Math.max(0, s0), s1: Math.min(length, s1)});
  }
  const boxes = [];
  // The skirting: the whole wall but its doors and the windows down to the floor, each with its casing's width.
  const gaps = spans
    .filter(({opening}) => opening.kind !== 'window' || (opening.bottom ?? 0) < FLOOR_WINDOW_METRES)
    .map(({s0, s1}) => [s0 - TRIM.casingWidth, s1 + TRIM.casingWidth])
    .sort((a, b) => a[0] - b[0]);
  let from = 0;
  for (const [gapStart, gapEnd] of [...gaps, [length, length]]) {
    if (gapStart - from >= SHORTEST_METRES)
      boxes.push(box(at(from), at(gapStart), inward, TRIM.skirtingDepth, 0, TRIM.skirtingHeight));
    from = Math.max(from, gapEnd);
  }
  // The casing round each opening: its sides and its head; a window also gets a sill.
  for (const {opening, index, s0, s1} of spans) {
    const bottom = opening.kind === 'window' ? Math.max(0, opening.bottom ?? 0) : 0;
    const top = opening.top ?? WALL.height - 0.5;
    const width = TRIM.casingWidth;
    const depth = TRIM.casingDepth;
    if (top - bottom < 0.2) continue;
    const casingBottom = bottom > FLOOR_WINDOW_METRES ? bottom - width : 0;
    boxes.push(box(at(s0 - width), at(s0), inward, depth, casingBottom, top + width, index));
    boxes.push(box(at(s1), at(s1 + width), inward, depth, casingBottom, top + width, index));
    boxes.push(box(at(s0), at(s1), inward, depth, top, top + width, index));
    if (opening.kind === 'window' && bottom > FLOOR_WINDOW_METRES)
      boxes.push(
        box(at(s0 - width), at(s1 + width), inward, TRIM.sillDepth, bottom - TRIM.sillHeight, bottom, index),
      );
  }
  return boxes;
}
