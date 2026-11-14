// A rug's pattern of two colours (item.pat): the picture its top is drawn with. Tiles — a checker of squares about a foam
// play mat's size; stripes — bands across its length; mottled — irregular patches, as a distressed or abstract rug reads from
// a step away. The picture is made in code, the same on every run, so a plan looks alike on every device and in the tests.
import * as THREE from 'three';

/** The patterns a rug draws (catalog: the rug's pats). */
export type RugPattern = 'tiles' | 'stripes' | 'mottled';

/** An sRGB colour: red, green, blue, 0–255. */
type Rgb = [number, number, number];

/** Which of the two colours a point of the rug shows: 0 the field, 1 the second, in between where patches blend. */
type PatternAt = (x: number, y: number) => number;

// The picture's pixels per metre of rug, and its smallest and largest side in pixels.
const PIXELS_PER_METRE = 96;
const LEAST_SIDE_PX = 16;
const MOST_SIDE_PX = 512;
// A foam play mat's tile, or a checker's square: about this wide, a whole number of them across the rug, two at least.
const TILE_METRES = 0.33;
const LEAST_TILES = 2;
// The seam between tiles: this wide, this much darker.
const SEAM_METRES = 0.006;
const SEAM_SHADE = 0.86;
// Stripes across the rug's length: a band of the field this wide, then one of the second colour this wide.
const FIELD_BAND_METRES = 0.24;
const SECOND_BAND_METRES = 0.12;
// Patches: about this wide across the rug and this many times longer along it (a distressed rug's worn streaks); the second
// colour covers about this share of the rug, blending over this range of the noise (soft, worn edges).
const PATCH_METRES = 0.1;
const PATCH_STRETCH = 3;
const PATCH_SHARE = 0.4;
const PATCH_BLEND = 0.2;
const NOISE_OCTAVES = 5;

export const isRugPattern = (key: string | undefined): key is RugPattern =>
  key === 'tiles' || key === 'stripes' || key === 'mottled';

/** 0xrrggbb as [red, green, blue]. */
const rgbOf = (colour: number): Rgb => [(colour >> 16) & 255, (colour >> 8) & 255, colour & 255];

/** A checker of tiles about TILE_METRES square, with a darker seam between them. */
function tilesAt(width: number, depth: number): PatternAt {
  const across = Math.max(LEAST_TILES, Math.round(width / TILE_METRES));
  const tileWidth = width / across;
  const along = Math.max(LEAST_TILES, Math.round(depth / tileWidth));
  const tileDepth = depth / along;
  return (x, y) => {
    const column = Math.min(across - 1, Math.floor(x / tileWidth));
    const row = Math.min(along - 1, Math.floor(y / tileDepth));
    return (column + row) % 2;
  };
}

/** Whether a point lies on the seam between two tiles (tilesAt's grid). */
function onSeam(width: number, depth: number, x: number, y: number): boolean {
  const across = Math.max(LEAST_TILES, Math.round(width / TILE_METRES));
  const tileWidth = width / across;
  const along = Math.max(LEAST_TILES, Math.round(depth / tileWidth));
  const tileDepth = depth / along;
  const fromColumnEdge = Math.min(x % tileWidth, tileWidth - (x % tileWidth));
  const fromRowEdge = Math.min(y % tileDepth, tileDepth - (y % tileDepth));
  return Math.min(fromColumnEdge, fromRowEdge) < SEAM_METRES / 2;
}

/** Bands across the rug's longer side: the field, then the second colour, centred so both ends match. */
function stripesAt(width: number, depth: number): PatternAt {
  const alongWidth = width >= depth;
  const length = alongWidth ? width : depth;
  const period = FIELD_BAND_METRES + SECOND_BAND_METRES;
  const offset = (length % period) / 2 + SECOND_BAND_METRES / 2;
  return (x, y) => {
    const along = (alongWidth ? x : y) + period - offset;
    return along % period < SECOND_BAND_METRES ? 1 : 0;
  };
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
 * Irregular streaky patches, about PATCH_METRES across and PATCH_STRETCH times longer along the rug's longer side: noise of a
 * few octaves, cut so the second colour covers about PATCH_SHARE, with soft edges. Round blobs read as camouflage, not a rug.
 */
function mottledAt(width: number, depth: number): PatternAt {
  const octaves = Array.from({length: NOISE_OCTAVES}, (_, i) => valueNoise(i + 1));
  const cut = 1 - PATCH_SHARE;
  const alongWidth = width >= depth;
  return (x, y) => {
    const across = (alongWidth ? y : x) / PATCH_METRES;
    const along = (alongWidth ? x : y) / (PATCH_METRES * PATCH_STRETCH);
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
    return Math.min(1, Math.max(0, (value - cut) / PATCH_BLEND + 0.5));
  };
}

/** The picture of a rug's pattern, w × d metres, in its field colour and second colour (0xrrggbb). */
export function rugPatternTexture(
  pattern: RugPattern,
  width: number,
  depth: number,
  field: number,
  second: number,
): THREE.DataTexture {
  const columns = Math.round(Math.min(MOST_SIDE_PX, Math.max(LEAST_SIDE_PX, width * PIXELS_PER_METRE)));
  const rows = Math.round(Math.min(MOST_SIDE_PX, Math.max(LEAST_SIDE_PX, depth * PIXELS_PER_METRE)));
  const at =
    pattern === 'tiles'
      ? tilesAt(width, depth)
      : pattern === 'stripes'
        ? stripesAt(width, depth)
        : mottledAt(width, depth);
  const fieldRgb = rgbOf(field);
  const secondRgb = rgbOf(second);
  const pixels = new Uint8Array(columns * rows * 4);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = ((column + 0.5) / columns) * width;
      const y = ((row + 0.5) / rows) * depth;
      const mix = at(x, y);
      const shade = pattern === 'tiles' && onSeam(width, depth, x, y) ? SEAM_SHADE : 1;
      const index = (row * columns + column) * 4;
      for (let channel = 0; channel < 3; channel++)
        pixels[index + channel] = Math.round(
          (fieldRgb[channel] * (1 - mix) + secondRgb[channel] * mix) * shade,
        );
      pixels[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, columns, rows, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
