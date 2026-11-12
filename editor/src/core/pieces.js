// Pieces of finish (D-084): parts of a room's walls and floor finished differently from the rest — a kitchen backsplash,
// tiles up to 1.5 m, slats behind the TV, a tiled entrance in a parquet hall. The AI build sets them from the video. By hand
// one picks a finish for a whole wall or a whole floor, and the pick removes the pieces it covers: the AI build may do more
// than the editor's controls, on purpose (the owner).
//
// room.wp[i] — the pieces on edge i, later ones on top. An edge key like wf: they follow the corners (plan.js).
//   [{t: [from, to] — fractions of the edge from its start corner (none: all of it),
//     z: [bottom, top] — metres above the floor (none: floor to ceiling),
//     k: a wall finish (surfaces.js WALL_KINDS), tint: '#rrggbb',
//     tile: [width, height] — metres, the tile, brick, slat or panel; joint — metres}]
// room.fp — pieces of the floor, later ones on top, drawn only inside the room:
//   [{poly: [[x, y], …] — plan metres, k: a floor finish (surfaces.js FLOOR_KINDS), tint: '#rrggbb'}]
import pc from 'polygon-clipping';
import {poly} from './geometry.js';

// At most this many pieces on one edge and on one floor; at most this many finishes up one wall (the wall shader reads four);
// heights, tiles and joints within these metres.
export const PIECE_LIMITS = {perEdge: 8, floor: 16, bands: 4, height: 5, tile: 2.5, joint: 0.05};

const HEX = /^#[0-9a-f]{6}$/i;
const EPSILON = 1e-6;

const isRange = (range, low, high) =>
  Array.isArray(range) &&
  range.length === 2 &&
  range.every(Number.isFinite) &&
  range[0] >= low - EPSILON &&
  range[1] <= high + EPSILON &&
  range[1] - range[0] > EPSILON;

const isPoint = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);

const round = value => +value.toFixed(4);

/** The finish a piece gives: its key and those of its overrides that are well formed. */
export function pieceFinish(piece) {
  const finish = {k: piece.k};
  if (HEX.test(piece.tint || '')) finish.tint = piece.tint;
  const tileOk =
    Array.isArray(piece.tile) &&
    piece.tile.length === 2 &&
    piece.tile.every(size => Number.isFinite(size) && size > 0 && size <= PIECE_LIMITS.tile);
  if (tileOk) finish.tile = [...piece.tile];
  const jointOk = Number.isFinite(piece.joint) && piece.joint >= 0 && piece.joint <= PIECE_LIMITS.joint;
  if (jointOk) finish.joint = piece.joint;
  return finish;
}

/** One string per distinct finish: equal finishes share it. */
export const finishKey = finish =>
  [finish.k, finish.tint || '', finish.tile ? finish.tile.join('x') : '', finish.joint ?? ''].join('|');

/**
 * The well-formed pieces on edge i of a room, in order: from and to along the edge, bottom and top (Infinity: up to the
 * ceiling), the finish. isKind says which finish keys exist; a piece with an unknown one is skipped.
 */
export function edgePieces(room, edge, isKind) {
  const list = room?.wp?.[edge];
  if (!Array.isArray(list)) return [];
  const pieces = [];
  for (const piece of list.slice(0, PIECE_LIMITS.perEdge)) {
    if (!piece || typeof piece !== 'object' || !isKind(piece.k)) continue;
    const along = piece.t ?? [0, 1];
    const height = piece.z ?? [0, Infinity];
    if (!isRange(along, 0, 1)) continue;
    if (piece.z != null && !isRange(height, 0, PIECE_LIMITS.height)) continue;
    pieces.push({
      from: Math.max(0, along[0]),
      to: Math.min(1, along[1]),
      bottom: Math.max(0, height[0]),
      top: height[1] >= PIECE_LIMITS.height - EPSILON ? Infinity : height[1],
      finish: pieceFinish(piece),
    });
  }
  return pieces;
}

/** Carve [bottom, top] out of a bottom-to-top list of bands and put the finish there. */
function layBand(bands, bottom, top, finish) {
  const next = [];
  for (const band of bands) {
    if (band.top <= bottom || band.bottom >= top) {
      next.push(band);
      continue;
    }
    if (band.bottom < bottom) next.push({...band, top: bottom});
    if (band.top > top) next.push({...band, bottom: top});
  }
  next.push({bottom, top, finish});
  return next.sort((first, second) => first.bottom - second.bottom);
}

/**
 * The finishes up a wall at one point along it (a fraction of the edge), bottom to top: the wall's own finish, then each
 * piece over that point lays its finish over its heights. Equal neighbours merge. More bands than the shader reads: the
 * last one it reads goes up to the ceiling.
 */
export function bandsAt(base, pieces, along) {
  let bands = [{bottom: 0, top: Infinity, finish: base}];
  for (const piece of pieces) {
    if (along < piece.from || along > piece.to) continue;
    bands = layBand(bands, piece.bottom, piece.top, piece.finish);
  }
  const merged = [];
  for (const band of bands) {
    const last = merged[merged.length - 1];
    if (last && finishKey(last.finish) === finishKey(band.finish)) last.top = band.top;
    else merged.push({...band});
  }
  const kept = merged.slice(0, PIECE_LIMITS.bands);
  kept[kept.length - 1].top = Infinity;
  return kept;
}

const bandsKey = bands => bands.map(band => finishKey(band.finish) + '@' + band.bottom).join(';');

/** The runs along an edge: from and to (fractions) and the bands over them. No pieces: one run, the wall's own finish. */
export function edgeRuns(base, pieces) {
  const cuts = [...new Set([0, 1, ...pieces.flatMap(piece => [piece.from, piece.to])])].sort((a, b) => a - b);
  const runs = [];
  for (let j = 1; j < cuts.length; j++) {
    const from = cuts[j - 1];
    const to = cuts[j];
    if (to - from < EPSILON) continue;
    const bands = bandsAt(base, pieces, (from + to) / 2);
    const last = runs[runs.length - 1];
    if (last && bandsKey(last.bands) === bandsKey(bands)) last.to = to;
    else runs.push({from, to, bands});
  }
  return runs;
}

/**
 * The floor pieces of a room cut to its outline, in order: rings (the outer one first, then holes; not closed), the key,
 * the tint. isKind says which floor keys exist.
 */
export function floorPieces(room, isKind) {
  if (!Array.isArray(room?.fp) || !Array.isArray(room.polygon) || room.polygon.length < 3) return [];
  const outline = poly(room.polygon);
  const pieces = [];
  for (const piece of room.fp.slice(0, PIECE_LIMITS.floor)) {
    if (!piece || !isKind(piece.k)) continue;
    if (!Array.isArray(piece.poly) || piece.poly.length < 3 || !piece.poly.every(isPoint)) continue;
    let shapes;
    try {
      shapes = pc.intersection(outline, poly(piece.poly));
    } catch {
      continue;
    }
    for (const shape of shapes)
      pieces.push({
        rings: shape.map(ring => ring.slice(0, -1)),
        k: piece.k,
        tint: HEX.test(piece.tint || '') ? piece.tint : null,
      });
  }
  return pieces;
}

// ---------- edits by hand ----------

/** Whether any of these edges has pieces. */
export const hasWallPieces = (room, edges) => edges.some(edge => room?.wp?.[edge]?.length > 0);

/** Whether the floor has pieces. */
export const hasFloorPieces = room => room?.fp?.length > 0;

/** Drop an edge list that holds nothing. */
function tidyWallPieces(room) {
  if (room.wp && !room.wp.some(list => list?.length)) delete room.wp;
}

/** A finish picked by hand for these walls covers them whole: their pieces go. */
export function clearWallPieces(room, edges) {
  if (!room.wp) return;
  for (const edge of edges) if (edge < room.wp.length) room.wp[edge] = null;
  tidyWallPieces(room);
}

/** A floor picked by hand covers it whole: its pieces go. */
export function clearFloorPieces(room) {
  delete room.fp;
}

// ---------- the pieces follow the corners and the plan ----------

/** A copy of a piece over [from, to] of its edge; all of it: no t. */
function alongCopy(piece, from, to) {
  const copy = JSON.parse(JSON.stringify(piece));
  if (from <= EPSILON && to >= 1 - EPSILON) delete copy.t;
  else copy.t = [round(Math.max(0, from)), round(Math.min(1, to))];
  return copy;
}

const listOrNull = list => (list.length ? list : null);

/** A corner put at a fraction of an edge splits it: the pieces before it and after it, as fractions of each part. */
export function splitPieces(list, cut) {
  if (!Array.isArray(list)) return [null, null];
  const before = [];
  const after = [];
  for (const piece of list) {
    const [from, to] = piece.t || [0, 1];
    if (cut > EPSILON && from < cut - EPSILON) before.push(alongCopy(piece, from / cut, Math.min(to, cut) / cut));
    if (cut < 1 - EPSILON && to > cut + EPSILON)
      after.push(alongCopy(piece, (Math.max(from, cut) - cut) / (1 - cut), (to - cut) / (1 - cut)));
  }
  return [listOrNull(before), listOrNull(after)];
}

/** Removing the corner between two edges joins them: the pieces of both over the joined edge, by the two lengths. */
export function joinPieces(first, second, firstLength, secondLength) {
  const total = firstLength + secondLength;
  if (!(total > EPSILON)) return first ?? null;
  const share = firstLength / total;
  const joined = [];
  for (const piece of first || []) {
    const [from, to] = piece.t || [0, 1];
    joined.push(alongCopy(piece, from * share, to * share));
  }
  for (const piece of second || []) {
    const [from, to] = piece.t || [0, 1];
    joined.push(alongCopy(piece, share + from * (1 - share), share + to * (1 - share)));
  }
  return listOrNull(joined);
}

/** Where a point falls along the line start→end: 0 at start, 1 at end; and how far off the line it is (metres). */
function onLine(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return {at: 0, off: Infinity};
  const at = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared;
  const off = Math.abs((point[0] - start[0]) * dy - (point[1] - start[1]) * dx) / Math.sqrt(lengthSquared);
  return {at, off};
}

/** The fraction of an edge at which a point lies (a corner put on it). */
export const fractionAlong = (point, start, end) => Math.max(0, Math.min(1, onLine(point, start, end).at));

/**
 * The pieces of an old edge carried onto a new edge that lies along it (two rooms joined): as fractions of the new edge,
 * only what overlaps it. Not on the same line: none.
 */
export function carryPieces(list, oldStart, oldEnd, newStart, newEnd) {
  if (!Array.isArray(list) || !list.length) return [];
  const startOn = onLine(newStart, oldStart, oldEnd);
  const endOn = onLine(newEnd, oldStart, oldEnd);
  if (startOn.off > 1e-3 || endOn.off > 1e-3 || Math.abs(endOn.at - startOn.at) < EPSILON) return [];
  const carried = [];
  for (const piece of list) {
    const [from, to] = piece.t || [0, 1];
    let low = (from - startOn.at) / (endOn.at - startOn.at);
    let high = (to - startOn.at) / (endOn.at - startOn.at);
    if (low > high) [low, high] = [high, low];
    low = Math.max(0, low);
    high = Math.min(1, high);
    if (high - low > EPSILON) carried.push(alongCopy(piece, low, high));
  }
  return carried;
}

/** Move every point of the floor pieces (the plan turned, scaled or the room dragged). */
export function mapFloorPieces(room, move) {
  if (!Array.isArray(room.fp)) return;
  for (const piece of room.fp) if (Array.isArray(piece?.poly)) piece.poly = piece.poly.map(move);
}

/** Keep only the floor pieces that reach into the room (a room split in two: each part keeps its own). */
export function keepFloorPiecesInside(room) {
  if (!Array.isArray(room.fp)) return;
  room.fp = room.fp.filter(piece => floorPieces({polygon: room.polygon, fp: [piece]}, () => true).length > 0);
  if (!room.fp.length) delete room.fp;
}
