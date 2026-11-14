// A rug's pattern drawn: the picture its top shows, made in code from a pattern spec (rug-pattern-spec.ts) — a named pattern's
// (item.pat) or the item's own (item.patSpec). Layers are painted in order over the field colour. Edges are smoothed over a
// pixel (each band's share of the pixel), so a fine pattern does not shimmer from afar; the texture's mipmaps do the rest. The
// picture is the same on every run, so a plan looks alike on every device and in the tests.
import * as THREE from 'three';
import {RUG_PRESETS, cleanRugSpec, isRugPattern, rugParam} from './rug-pattern-spec.ts';
import type {RugLayer, RugSpec} from './rug-pattern-spec.ts';

/** The rug's outline: a rectangle, or the circle or ellipse within its w × d (a frame and rings follow it). */
export type RugOutline = 'rect' | 'ellipse';

/** An sRGB colour: red, green, blue, 0–255. */
type Rgb = [number, number, number];

/** The rug a picture is drawn for: its size in metres, its outline, the picture's pixels, and which side is its length. */
interface RugCanvas {
  width: number;
  depth: number;
  outline: RugOutline;
  columns: number;
  rows: number;
  /** A pixel's size in metres, the larger of its two sides: what an edge is smoothed over. */
  pixel: number;
  /** Its length runs along x (the wider side; a square rug: x). */
  lengthAlongX: boolean;
  sharp: boolean;
}

/** A point of the rug, in metres from its corner; `edge()` is its distance in from the rug's edge (worked out once, if needed). */
interface RugPoint {
  x: number;
  y: number;
  edge: () => number;
}

/** How much of a pixel a layer's shape covers at a point, 0–1. */
type Coverage = (point: RugPoint) => number;

// The picture's pixels per metre of rug, and its smallest and largest side in pixels.
const PIXELS_PER_METRE = 96;
const LEAST_SIDE_PX = 16;
const MOST_SIDE_PX = 512;
// A checker's or a grid's squares: a whole number of them across the rug, two at least.
const LEAST_CELLS = 2;
// Patches: noise of this many octaves.
const NOISE_OCTAVES = 5;
// The closest point on an ellipse: this many steps of the iteration are within a fraction of a millimetre on a rug.
const ELLIPSE_STEPS = 4;

/** 0xrrggbb as [red, green, blue]. */
const rgbOf = (colour: number): Rgb => [(colour >> 16) & 255, (colour >> 8) & 255, colour & 255];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The share of a stretch [t - half, t + half] that lies in bands: each `width` long, starting at 0 and every `period` after.
 * A pixel's share of a band, so its edge is smooth. half 0: whether t itself is in a band.
 */
function bandShare(t: number, period: number, width: number, half: number): number {
  const inBandsUpTo = (at: number): number => {
    const whole = Math.floor(at / period);
    return whole * width + Math.min(width, Math.max(0, at - whole * period));
  };
  if (half <= 0) {
    const within = t - Math.floor(t / period) * period;
    return within < width ? 1 : 0;
  }
  return (inBandsUpTo(t + half) - inBandsUpTo(t - half)) / (2 * half);
}

/** How much of a pixel lies on the inside of an edge, given the signed distance to it (negative inside), smoothed over a pixel. */
function insideShare(signedDistance: number, canvas: RugCanvas): number {
  if (canvas.sharp) return signedDistance < 0 ? 1 : 0;
  return clamp01(0.5 - signedDistance / canvas.pixel);
}

/**
 * The distance from a point to an ellipse's outline (semi-axes a, b, centred), negative inside. The closest point by a few steps
 * of an iteration along the ellipse's evolute (a known quick method; exact for a circle).
 */
function ellipseSignedDistance(x: number, y: number, a: number, b: number): number {
  const px = Math.abs(x);
  const py = Math.abs(y);
  let tx = Math.SQRT1_2;
  let ty = Math.SQRT1_2;
  for (let step = 0; step < ELLIPSE_STEPS; step++) {
    const ex = ((a * a - b * b) * tx ** 3) / a;
    const ey = ((b * b - a * a) * ty ** 3) / b;
    const rx = a * tx - ex;
    const ry = b * ty - ey;
    const qx = px - ex;
    const qy = py - ey;
    const r = Math.hypot(rx, ry);
    const q = Math.max(1e-9, Math.hypot(qx, qy));
    tx = clamp01(((qx * r) / q + ex) / a);
    ty = clamp01(((qy * r) / q + ey) / b);
    const length = Math.max(1e-9, Math.hypot(tx, ty));
    tx /= length;
    ty /= length;
  }
  const distance = Math.hypot(px - a * tx, py - b * ty);
  const inside = (px / a) ** 2 + (py / b) ** 2 < 1;
  return inside ? -distance : distance;
}

/** A point's distance in from the rug's edge: the rectangle's nearest side, or the circle's or ellipse's outline. */
function edgeDistance(x: number, y: number, canvas: RugCanvas): number {
  const {width, depth} = canvas;
  if (canvas.outline === 'rect') return Math.min(x, width - x, y, depth - y);
  return -ellipseSignedDistance(x - width / 2, y - depth / 2, width / 2, depth / 2);
}

/** A point's place along the rug's length (from its start) and across it (from its middle), and the length's extent. */
function lengthAndAcross(point: RugPoint, canvas: RugCanvas): {along: number; across: number} {
  return canvas.lengthAlongX
    ? {along: point.x, across: point.y - canvas.depth / 2}
    : {along: point.y, across: point.x - canvas.width / 2};
}

/** The rug's length and width (the longer side first). */
const lengthOf = (canvas: RugCanvas): number => (canvas.lengthAlongX ? canvas.width : canvas.depth);
const widthOf = (canvas: RugCanvas): number => (canvas.lengthAlongX ? canvas.depth : canvas.width);

/**
 * Squares of a checker about `size` wide, a whole number across the rug (two at least), as close to square as fits along it.
 * The same cells for a grid's lines.
 */
function cellsOf(
  size: number,
  canvas: RugCanvas,
): {cellWidth: number; cellDepth: number; across: number; along: number} {
  const across = Math.max(LEAST_CELLS, Math.round(canvas.width / size));
  const cellWidth = canvas.width / across;
  const along = Math.max(LEAST_CELLS, Math.round(canvas.depth / cellWidth));
  return {cellWidth, cellDepth: canvas.depth / along, across, along};
}

/** A checker: the second colour on every other square. Sharp: exactly D-101's tiles. */
function checksCoverage(layer: RugLayer, canvas: RugCanvas): Coverage {
  const {cellWidth, cellDepth, across, along} = cellsOf(rugParam(layer, 'size'), canvas);
  if (canvas.sharp)
    return ({x, y}) => {
      const column = Math.min(across - 1, Math.floor(x / cellWidth));
      const row = Math.min(along - 1, Math.floor(y / cellDepth));
      return (column + row) % 2;
    };
  const half = canvas.pixel / 2;
  return ({x, y}) => {
    const oddColumn = bandShare(x - cellWidth, 2 * cellWidth, cellWidth, half);
    const oddRow = bandShare(y - cellDepth, 2 * cellDepth, cellDepth, half);
    return oddColumn * (1 - oddRow) + oddRow * (1 - oddColumn);
  };
}

/** Thin lines between a checker's squares, and along the rug's edges. Sharp: exactly D-101's tiles' seams. */
function gridCoverage(layer: RugLayer, canvas: RugCanvas): Coverage {
  const {cellWidth, cellDepth} = cellsOf(rugParam(layer, 'size'), canvas);
  const line = rugParam(layer, 'line');
  if (canvas.sharp)
    return ({x, y}) => {
      const fromColumnEdge = Math.min(x % cellWidth, cellWidth - (x % cellWidth));
      const fromRowEdge = Math.min(y % cellDepth, cellDepth - (y % cellDepth));
      return Math.min(fromColumnEdge, fromRowEdge) < line / 2 ? 1 : 0;
    };
  const half = canvas.pixel / 2;
  return ({x, y}) => {
    const onColumnLine = bandShare(x + line / 2, cellWidth, line, half);
    const onRowLine = bandShare(y + line / 2, cellDepth, line, half);
    return onColumnLine + onRowLine - onColumnLine * onRowLine;
  };
}

/**
 * Bands: across the length (the rug's leftover split between its two ends, the bands centred unless shifted), along it, or at
 * 45° through its middle. Sharp: exactly D-101's stripes.
 */
function stripesCoverage(layer: RugLayer, canvas: RugCanvas): Coverage {
  const width = rugParam(layer, 'width');
  const gap = rugParam(layer, 'gap');
  const period = gap + width;
  const direction = layer.dir ?? 'across';
  const shift = layer.shift ?? gap / 2;
  // where a band starts, on the coordinate the bands follow one another along
  const extent = direction === 'across' ? lengthOf(canvas) : widthOf(canvas);
  const offset = direction === 'diagonal' ? shift - gap / 2 - width / 2 : (extent % period) / 2 + shift;
  // the diagonal's coordinate runs from minus half the rug's diagonal; enough whole periods keep it positive
  const reach = direction === 'diagonal' ? Math.hypot(canvas.width, canvas.depth) / 2 : 0;
  const turns = Math.max(1, Math.ceil((offset + reach) / period));
  const coordinate = (point: RugPoint): number => {
    if (direction === 'diagonal')
      return (point.x - canvas.width / 2 + (point.y - canvas.depth / 2)) * Math.SQRT1_2;
    const alongX = direction === 'across' ? canvas.lengthAlongX : !canvas.lengthAlongX;
    return alongX ? point.x : point.y;
  };
  if (canvas.sharp)
    return point => {
      const along = coordinate(point) + period * turns - offset;
      return along % period < width ? 1 : 0;
    };
  const half = canvas.pixel / 2;
  return point => bandShare(coordinate(point) + period * turns - offset, period, width, half);
}

/** Zigzag bands across the length (or along it): stripes bent into a zigzag `size` wide that rises `height`. */
function chevronCoverage(layer: RugLayer, canvas: RugCanvas): Coverage {
  const width = rugParam(layer, 'width');
  const gap = rugParam(layer, 'gap');
  const size = rugParam(layer, 'size');
  const height = rugParam(layer, 'height');
  const period = gap + width;
  const across = layer.dir === 'along';
  const extent = across ? widthOf(canvas) : lengthOf(canvas);
  const offset = (extent % period) / 2 + gap / 2 - height / 2;
  const turns = Math.max(1, Math.ceil((offset + height) / period));
  // the bands' coordinate climbs this much faster than a straight one, so a pixel spans more of it
  const steepness = Math.hypot(1, (2 * height) / size);
  const half = canvas.sharp ? 0 : (canvas.pixel / 2) * steepness;
  return point => {
    const place = lengthAndAcross(point, canvas);
    const along = across ? place.across + widthOf(canvas) / 2 : place.along;
    const sideways = across ? place.along - lengthOf(canvas) / 2 : place.across;
    const zig = 2 * Math.abs(sideways / size - Math.round(sideways / size));
    return bandShare(along + height * zig + period * turns - offset, period, width, half);
  };
}

/** Round dots `radius` big, `size` apart, one in the rug's middle; offset rows (bond) shift every other row by half. */
function dotsCoverage(layer: RugLayer, canvas: RugCanvas): Coverage {
  const spacing = rugParam(layer, 'size');
  const radius = rugParam(layer, 'radius');
  const bond = layer.lay === 'bond';
  return point => {
    const {along, across} = lengthAndAcross(point, canvas);
    const fromMiddle = along - lengthOf(canvas) / 2;
    const nearestRow = Math.round(fromMiddle / spacing);
    let nearest = Infinity;
    // with offset rows the nearest dot may be in the next row
    for (let row = nearestRow - 1; row <= nearestRow + 1; row++) {
      const rowShift = bond && row % 2 !== 0 ? spacing / 2 : 0;
      const column = Math.round((across - rowShift) / spacing);
      const dx = across - rowShift - column * spacing;
      const dy = fromMiddle - row * spacing;
      nearest = Math.min(nearest, Math.hypot(dx, dy));
    }
    return insideShare(nearest - radius, canvas);
  };
}

/**
 * Diamonds `size` wide across the rug and `stretch` times as long along it, one in its middle: thin lines of a trellis (a
 * Berber rug) with a `line`, else every other diamond filled (a harlequin).
 */
function diamondsCoverage(layer: RugLayer, canvas: RugCanvas): Coverage {
  const size = rugParam(layer, 'size');
  const long = size * rugParam(layer, 'stretch');
  const line = rugParam(layer, 'line');
  // the diamonds' two families of lines, in units of one diamond; a metre is this many units across them
  const unitsPerMetre = Math.hypot(1 / size, 1 / long);
  return point => {
    const {along, across} = lengthAndAcross(point, canvas);
    const fromMiddle = along - lengthOf(canvas) / 2;
    const rising = across / size + fromMiddle / long + 0.5;
    const falling = across / size - fromMiddle / long + 0.5;
    if (line > 0) {
      const toRising = Math.abs(rising - Math.round(rising)) / unitsPerMetre;
      const toFalling = Math.abs(falling - Math.round(falling)) / unitsPerMetre;
      return insideShare(Math.min(toRising, toFalling) - line / 2, canvas);
    }
    const half = canvas.sharp ? 0 : (canvas.pixel / 2) * unitsPerMetre;
    const oddRising = bandShare(rising - 1, 2, 1, half);
    const oddFalling = bandShare(falling - 1, 2, 1, half);
    return oddRising * (1 - oddFalling) + oddFalling * (1 - oddRising);
  };
}

/** A band `width` wide, `inset` in from the rug's edge: a rectangle's border, or a ring along a round rug's edge. */
function frameCoverage(layer: RugLayer, canvas: RugCanvas): Coverage {
  const inset = rugParam(layer, 'inset');
  const width = rugParam(layer, 'width');
  return point => {
    const edge = point.edge();
    return insideShare(inset - edge, canvas) - insideShare(inset + width - edge, canvas);
  };
}

/** A shape in the rug's middle, `size` of its width and length: a diamond, an oval, a circle; filled, or its outline. */
function medallionCoverage(layer: RugLayer, canvas: RugCanvas): Coverage {
  const share = rugParam(layer, 'size');
  const line = rugParam(layer, 'line');
  const halfWidth = (share * canvas.width) / 2;
  const halfDepth = (share * canvas.depth) / 2;
  const radius = (share * Math.min(canvas.width, canvas.depth)) / 2;
  const form = layer.form ?? 'diamond';
  const diamondSlope = Math.hypot(1 / halfWidth, 1 / halfDepth);
  return ({x, y}) => {
    const dx = x - canvas.width / 2;
    const dy = y - canvas.depth / 2;
    const signed =
      form === 'circle'
        ? Math.hypot(dx, dy) - radius
        : form === 'oval'
          ? ellipseSignedDistance(dx, dy, halfWidth, halfDepth)
          : (Math.abs(dx) / halfWidth + Math.abs(dy) / halfDepth - 1) / diamondSlope;
    return insideShare(line > 0 ? Math.abs(signed) - line / 2 : signed, canvas);
  };
}

/** Bands following the rug's edge inwards, `width` each with a `gap` between: a braided rug's rings. */
function ringsCoverage(layer: RugLayer, canvas: RugCanvas): Coverage {
  const width = rugParam(layer, 'width');
  const gap = rugParam(layer, 'gap');
  const shift = rugParam(layer, 'shift');
  const period = width + gap;
  const turns = Math.max(1, Math.ceil(shift / period));
  const half = canvas.sharp ? 0 : canvas.pixel / 2;
  return point => bandShare(point.edge() - shift + period * turns, period, width, half);
}

/** A smooth random value 0–1 on a grid of cells, the same for the same seed (value noise, bilinear with a smooth step). */
function valueNoise(seed: number): (x: number, y: number) => number {
  const corner = (column: number, row: number): number => {
    let hash = (column * 374761393 + row * 668265263 + seed * 2147483647) | 0;
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    hash ^= hash >>> 16;
    return (hash >>> 0) / 4294967295;
  };
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  return (x, y) => {
    const column = Math.floor(x);
    const row = Math.floor(y);
    const across = smooth(x - column);
    const down = smooth(y - row);
    const top = corner(column, row) * (1 - across) + corner(column + 1, row) * across;
    const bottom = corner(column, row + 1) * (1 - across) + corner(column + 1, row + 1) * across;
    return top * (1 - down) + bottom * down;
  };
}

/**
 * Irregular streaky patches, about `size` across and `stretch` times longer along the rug's length: noise of a few octaves,
 * cut so they cover about `share`, with soft edges over `blend`. Round blobs read as camouflage, not a rug. With the defaults:
 * exactly D-101's mottled.
 */
function patchesCoverage(layer: RugLayer, canvas: RugCanvas): Coverage {
  const size = rugParam(layer, 'size');
  const stretch = rugParam(layer, 'stretch');
  const blend = rugParam(layer, 'blend');
  const seed = rugParam(layer, 'seed');
  const octaves = Array.from({length: NOISE_OCTAVES}, (_, i) => valueNoise(i + 1 + seed * NOISE_OCTAVES));
  const cut = 1 - rugParam(layer, 'share');
  const alongWidth = canvas.lengthAlongX;
  return ({x, y}) => {
    const across = (alongWidth ? y : x) / size;
    const along = (alongWidth ? x : y) / (size * stretch);
    let sum = 0;
    let weight = 0;
    octaves.forEach((noise, i) => {
      const scale = 2 ** i;
      const amplitude = 1 / scale;
      sum += noise(along * scale, across * scale) * amplitude;
      weight += amplitude;
    });
    // the sum of octaves gathers round the middle: spread it back towards 0–1 before the cut
    const value = Math.min(1, Math.max(0, (sum / weight - 0.5) * 1.8 + 0.5));
    return Math.min(1, Math.max(0, (value - cut) / blend + 0.5));
  };
}

const COVERAGE_OF: Record<RugLayer['shape'], (layer: RugLayer, canvas: RugCanvas) => Coverage> = {
  stripes: stripesCoverage,
  checks: checksCoverage,
  grid: gridCoverage,
  dots: dotsCoverage,
  diamonds: diamondsCoverage,
  chevron: chevronCoverage,
  frame: frameCoverage,
  medallion: medallionCoverage,
  rings: ringsCoverage,
  patches: patchesCoverage,
};

/** A layer ready to paint: its shape's coverage, kept within its inset (a frame's inset is its place instead), and its paint. */
interface PaintedLayer {
  coverage: Coverage;
  opacity: number;
  colour: Rgb | null;
  shade: number;
}

function paintedLayer(layer: RugLayer, canvas: RugCanvas, palette: Rgb[]): PaintedLayer {
  const shape = COVERAGE_OF[layer.shape](layer, canvas);
  const inset = layer.shape === 'frame' ? 0 : rugParam(layer, 'inset');
  const coverage: Coverage =
    inset > 0 ? point => shape(point) * insideShare(inset - point.edge(), canvas) : shape;
  return {
    coverage,
    opacity: rugParam(layer, 'opacity'),
    colour: layer.color !== undefined ? (palette[layer.color] ?? null) : null,
    shade: rugParam(layer, 'shade'),
  };
}

/** The spec an item draws: its own (patSpec) when it is drawable, else its named pattern's (pat); null — none, plain. */
export function rugSpecOf(pat: string | undefined, patSpec: unknown): RugSpec | null {
  const own = patSpec === undefined ? null : cleanRugSpec(patSpec);
  if (own) return own;
  return isRugPattern(pat) ? RUG_PRESETS[pat] : null;
}

/** The picture's size in pixels for a rug w × d metres. */
function pictureSize(width: number, depth: number): {columns: number; rows: number} {
  return {
    columns: Math.round(Math.min(MOST_SIDE_PX, Math.max(LEAST_SIDE_PX, width * PIXELS_PER_METRE))),
    rows: Math.round(Math.min(MOST_SIDE_PX, Math.max(LEAST_SIDE_PX, depth * PIXELS_PER_METRE))),
  };
}

/** The pattern's pixels (RGBA, row by row) for a rug w × d metres in its field colour and second colour (0xrrggbb). */
export function rugPatternPixels(
  spec: RugSpec,
  width: number,
  depth: number,
  field: number,
  second: number,
  outline: RugOutline = 'rect',
): {pixels: Uint8Array; columns: number; rows: number} {
  const {columns, rows} = pictureSize(width, depth);
  const canvas: RugCanvas = {
    width,
    depth,
    outline,
    columns,
    rows,
    pixel: Math.max(width / columns, depth / rows),
    lengthAlongX: width >= depth,
    sharp: spec.sharp === true,
  };
  const palette: Rgb[] = [
    rgbOf(field),
    rgbOf(second),
    ...(spec.colors ?? []).map(hex => rgbOf(parseInt(hex.slice(1), 16))),
  ];
  const layers = spec.layers.map(layer => paintedLayer(layer, canvas, palette));
  const pixels = new Uint8Array(columns * rows * 4);
  const paint: [number, number, number] = [0, 0, 0];
  // the point's distance from the edge, worked out the first time a layer asks for it
  let edgeKnown = false;
  let edge = 0;
  const point: RugPoint = {
    x: 0,
    y: 0,
    edge: () => {
      if (!edgeKnown) {
        edge = edgeDistance(point.x, point.y, canvas);
        edgeKnown = true;
      }
      return edge;
    },
  };
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      point.x = ((column + 0.5) / columns) * width;
      point.y = ((row + 0.5) / rows) * depth;
      edgeKnown = false;
      for (let channel = 0; channel < 3; channel++) paint[channel] = palette[0][channel];
      for (const layer of layers) {
        const alpha = layer.coverage(point) * layer.opacity;
        if (alpha <= 0) continue;
        for (let channel = 0; channel < 3; channel++) {
          if (layer.colour) paint[channel] = paint[channel] * (1 - alpha) + layer.colour[channel] * alpha;
          else paint[channel] = paint[channel] * (1 - alpha + alpha * layer.shade);
        }
      }
      const index = (row * columns + column) * 4;
      for (let channel = 0; channel < 3; channel++)
        pixels[index + channel] = Math.min(255, Math.round(paint[channel]));
      pixels[index + 3] = 255;
    }
  }
  return {pixels, columns, rows};
}

/** The picture of a rug's pattern spec, w × d metres, in its field colour and second colour (0xrrggbb). */
export function rugPatternTexture(
  spec: RugSpec,
  width: number,
  depth: number,
  field: number,
  second: number,
  outline: RugOutline = 'rect',
): THREE.DataTexture {
  const {pixels, columns, rows} = rugPatternPixels(spec, width, depth, field, second, outline);
  const texture = new THREE.DataTexture(pixels, columns, rows, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
