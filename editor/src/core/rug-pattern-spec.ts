// The language a rug's pattern is written in: a few layers, each a shape from a small fixed set with a handful of bounded
// numbers, painted one over another on the rug's field. Every named pattern (item.pat) is a spec written in it, and an item may
// carry a spec of its own (item.patSpec): the AI build describes a rug it saw that no named pattern fits. This module has no
// three.js, so the AI build imports it to clean what its model wrote; core/rug-pattern.ts draws a spec.

/** The named patterns a rug draws (catalog: the rug's pats). The first three are D-101's. */
export type RugPattern =
  'tiles' | 'stripes' | 'mottled' | 'oriental' | 'lattice' | 'chevron' | 'dots' | 'rings' | 'plaid';

/** The shapes a layer draws. */
export type RugShape =
  | 'stripes'
  | 'checks'
  | 'grid'
  | 'dots'
  | 'diamonds'
  | 'chevron'
  | 'frame'
  | 'medallion'
  | 'rings'
  | 'patches';

/** Which way bands follow one another: across (each band lies across the rug's length), along (bands run lengthwise), diagonal. */
export type RugDirection = 'across' | 'along' | 'diagonal';
/** Dots in a square grid, or every other row shifted by half (like bricks). */
export type RugLay = 'grid' | 'bond';
/** A medallion's outline. */
export type RugForm = 'diamond' | 'oval' | 'circle';

/**
 * One layer of a rug's pattern. `color` is an index into the rug's palette (0 its field colour, 1 its second colour, 2… the
 * spec's own colors); `shade` instead darkens (below 1) or lightens (above 1) what lies under the shape. `opacity` mixes the
 * layer in partly (plaid's crossing stripes); `inset` keeps it this far inside the rug's edge (a frame: its distance from the
 * edge). The other numbers belong to some shapes only (SHAPE_PARAMS); lengths are metres.
 */
export interface RugLayer {
  shape: RugShape;
  color?: number;
  shade?: number;
  opacity?: number;
  inset?: number;
  /** stripes, chevron: which way the bands follow one another. */
  dir?: RugDirection;
  /** stripes, chevron, rings: a band's width; frame: the band's width. */
  width?: number;
  /** stripes, chevron, rings: the field between two bands. */
  gap?: number;
  /** stripes, rings: moves the bands along by this much (stripes without it: centred on the rug). */
  shift?: number;
  /** checks, grid: a square's side; dots: their spacing; diamonds: a diamond's width; chevron: a zigzag's width; medallion: its
   *  share of the rug's width and length; patches: a patch's width. */
  size?: number;
  /** grid, diamonds, medallion: a line's width (diamonds and a medallion without it are filled). */
  line?: number;
  /** dots: a dot's radius. */
  radius?: number;
  /** dots: in a grid or in offset rows. */
  lay?: RugLay;
  /** diamonds: height over width; patches: how many times longer than wide, along the rug's length. */
  stretch?: number;
  /** chevron: how far each zigzag rises along the rug. */
  height?: number;
  /** medallion: its outline. */
  form?: RugForm;
  /** patches: the share of the rug they cover. */
  share?: number;
  /** patches: another arrangement of the same kind of patches. */
  seed?: number;
  /** patches: how soft their edges are (a share of the noise). */
  blend?: number;
}

/**
 * A rug's pattern: layers painted in order over the field, and up to MOST_SPEC_COLOURS colours of its own (#rrggbb), palette 2…
 * `sharp`: edges point-sampled, not smoothed — only D-101's tiles and stripes, which keep their pixels exactly.
 */
export interface RugSpec {
  layers: RugLayer[];
  colors?: string[];
  sharp?: boolean;
}

/** A number a layer may set: its smallest, its largest, and what it is when not set. */
type NumberLimits = readonly [least: number, most: number, otherwise: number];

export const MOST_RUG_LAYERS = 8;
export const MOST_SPEC_COLOURS = 4;
/** Palette 0 the field, 1 the second colour; the spec's own colours follow. */
const OWN_COLOURS_FROM_INDEX = 2;

export const RUG_SHAPES: readonly RugShape[] = [
  'stripes',
  'checks',
  'grid',
  'dots',
  'diamonds',
  'chevron',
  'frame',
  'medallion',
  'rings',
  'patches',
];
const DIRECTIONS: readonly RugDirection[] = ['across', 'along', 'diagonal'];
const LAYS: readonly RugLay[] = ['grid', 'bond'];
const FORMS: readonly RugForm[] = ['diamond', 'oval', 'circle'];

// What every layer may set: how it is painted.
const COMMON_LIMITS = {
  shade: [0.2, 1.6, 1],
  opacity: [0.05, 1, 1],
  inset: [0, 2.5, 0],
} as const satisfies Record<string, NumberLimits>;

/**
 * Each shape's numbers: what it takes, within what, and its look when a number is not given. The ranges are what a real rug
 * could have — a stripe from 3 mm to 2 m, a check from 2 cm to 3 m — so nothing a model writes can make a picture of noise.
 */
export const SHAPE_PARAMS: Record<RugShape, Partial<Record<keyof RugLayer, NumberLimits>>> = {
  stripes: {width: [0.003, 2, 0.1], gap: [0.003, 3, 0.2], shift: [0, 5, 0]},
  checks: {size: [0.02, 3, 0.33]},
  grid: {size: [0.02, 3, 0.33], line: [0.002, 0.3, 0.006]},
  dots: {size: [0.02, 2, 0.2], radius: [0.002, 0.5, 0.03]},
  diamonds: {size: [0.04, 3, 0.35], stretch: [0.3, 4, 1.5], line: [0.002, 0.3, 0]},
  chevron: {width: [0.005, 1, 0.08], gap: [0.005, 2, 0.12], size: [0.04, 3, 0.3], height: [0.01, 1.5, 0.12]},
  frame: {width: [0.003, 1.5, 0.06]},
  medallion: {size: [0.05, 0.95, 0.4], line: [0.002, 0.3, 0]},
  rings: {width: [0.003, 1, 0.05], gap: [0.003, 1, 0.05], shift: [0, 5, 0]},
  patches: {
    size: [0.01, 1, 0.1],
    stretch: [0.2, 8, 3],
    share: [0.02, 0.98, 0.4],
    seed: [0, 999, 0],
    blend: [0.02, 0.6, 0.2],
  },
};

/** The words a shape takes besides numbers. */
const SHAPE_WORDS: Partial<Record<RugShape, Partial<Record<'dir' | 'lay' | 'form', readonly string[]>>>> = {
  stripes: {dir: DIRECTIONS},
  chevron: {dir: DIRECTIONS},
  dots: {lay: LAYS},
  medallion: {form: FORMS},
};

/** What a number of a shape is when the spec does not give it (diamonds' and a medallion's line: 0, filled). */
export function rugParam(layer: RugLayer, name: keyof RugLayer): number {
  const own = layer[name];
  if (typeof own === 'number') return own;
  const limits = SHAPE_PARAMS[layer.shape][name] ?? COMMON_LIMITS[name as keyof typeof COMMON_LIMITS];
  return limits ? limits[2] : 0;
}

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clamp = (value: number, least: number, most: number): number => Math.min(most, Math.max(least, value));

/** A layer as written, cleaned: its shape and what it takes, numbers brought within range; null when its shape is unknown or its
 *  colour is not in the palette. */
function cleanLayer(raw: unknown, paletteSize: number): RugLayer | null {
  if (!isObject(raw)) return null;
  const shape = raw.shape;
  if (typeof shape !== 'string' || !(RUG_SHAPES as readonly string[]).includes(shape)) return null;
  const layer: RugLayer = {shape: shape as RugShape};
  // A colour from the palette, or a shade over what lies under it; neither — the second colour.
  const color = raw.color;
  const shade = raw.shade;
  if (typeof color === 'number' && Number.isInteger(color)) {
    if (color < 0 || color >= paletteSize) return null;
    layer.color = color;
  } else if (typeof shade === 'number' && Number.isFinite(shade))
    layer.shade = clamp(shade, COMMON_LIMITS.shade[0], COMMON_LIMITS.shade[1]);
  else layer.color = 1;
  const numbers: [string, NumberLimits][] = [
    ['opacity', COMMON_LIMITS.opacity],
    ['inset', COMMON_LIMITS.inset],
    ...(Object.entries(SHAPE_PARAMS[layer.shape]) as [string, NumberLimits][]),
  ];
  for (const [name, [least, most]] of numbers) {
    const value = raw[name];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const kept = clamp(value, least, most);
    (layer as unknown as Record<string, number>)[name] = name === 'seed' ? Math.round(kept) : kept;
  }
  for (const [name, allowed] of Object.entries(SHAPE_WORDS[layer.shape] ?? {})) {
    const value = raw[name];
    if (typeof value === 'string' && allowed.includes(value))
      (layer as unknown as Record<string, string>)[name] = value;
  }
  return layer;
}

/**
 * What can be drawn of a pattern spec from a file or a model's answer: well-formed layers (at most MOST_RUG_LAYERS), numbers
 * brought within their ranges, the spec's own colours up to the first that is not #rrggbb (a later one would change which
 * colour each index means). A bad value is left out, the spec is kept (like a finish's pattern, D-089); null when nothing
 * drawable is left or it is not an object.
 */
export function cleanRugSpec(raw: unknown): RugSpec | null {
  if (!isObject(raw) || !Array.isArray(raw.layers)) return null;
  const colors: string[] = [];
  if (Array.isArray(raw.colors))
    for (const colour of raw.colors) {
      if (typeof colour !== 'string' || !HEX_COLOUR.test(colour) || colors.length >= MOST_SPEC_COLOURS) break;
      colors.push(colour.toLowerCase());
    }
  const paletteSize = OWN_COLOURS_FROM_INDEX + colors.length;
  const layers = raw.layers
    .map(layer => cleanLayer(layer, paletteSize))
    .filter((layer): layer is RugLayer => layer !== null)
    .slice(0, MOST_RUG_LAYERS);
  if (!layers.length) return null;
  // only the colours a layer uses are kept
  const highest = Math.max(...layers.map(layer => layer.color ?? 0));
  const usedColours = colors.slice(0, Math.max(0, highest - OWN_COLOURS_FROM_INDEX + 1));
  return {
    layers,
    ...(usedColours.length ? {colors: usedColours} : {}),
    ...(raw.sharp === true ? {sharp: true} : {}),
  };
}

/**
 * The named patterns, each a spec. tiles, stripes and mottled draw exactly D-101's pictures (rug-pattern.test.ts compares the
 * pixels). The others are real rugs common in homes: an oriental (Persian) rug's borders and medallion, a Berber rug's thin
 * diamond trellis, a chevron, a dotted rug, a round braided rug's rings, a plaid.
 */
export const RUG_PRESETS: Record<RugPattern, RugSpec> = {
  // a checker of about 33 cm squares with a thin darker seam: a foam play mat, a checked rug
  tiles: {
    sharp: true,
    layers: [
      {shape: 'checks', color: 1, size: 0.33},
      {shape: 'grid', shade: 0.86, size: 0.33, line: 0.006},
    ],
  },
  // a 24 cm band of the field, then a 12 cm band of the second colour, across the length
  stripes: {
    sharp: true,
    layers: [{shape: 'stripes', color: 1, dir: 'across', width: 0.12, gap: 0.24, shift: 0.06}],
  },
  // irregular streaky patches over about 40 %: a distressed or abstract rug from a step away
  mottled: {layers: [{shape: 'patches', color: 1, size: 0.1, stretch: 3, share: 0.4, seed: 0, blend: 0.2}]},
  // a Persian rug: an outer guard line, a wide border band with a lighter line inside it, a field with worn detail and a
  // central medallion with a lighter heart
  oriental: {
    layers: [
      {
        shape: 'patches',
        shade: 0.82,
        inset: 0.24,
        size: 0.05,
        stretch: 1,
        share: 0.35,
        seed: 3,
        blend: 0.3,
        opacity: 0.8,
      },
      {shape: 'frame', color: 1, inset: 0.025, width: 0.035},
      {shape: 'frame', color: 1, inset: 0.085, width: 0.13},
      {shape: 'frame', shade: 1.35, inset: 0.135, width: 0.025},
      {shape: 'medallion', color: 1, form: 'diamond', size: 0.42},
      {shape: 'medallion', shade: 1.45, form: 'oval', size: 0.16},
    ],
  },
  // a Berber (Beni Ourain) rug: thin lines of the second colour in a diamond trellis over the field
  lattice: {layers: [{shape: 'diamonds', color: 1, size: 0.36, stretch: 1.5, line: 0.022}]},
  // zigzag bands across the length
  chevron: {
    layers: [{shape: 'chevron', color: 1, dir: 'across', width: 0.07, gap: 0.11, size: 0.32, height: 0.13}],
  },
  // dots in offset rows
  dots: {layers: [{shape: 'dots', color: 1, size: 0.2, radius: 0.035, lay: 'bond'}]},
  // a braided rug: rings of the second colour following its edge, a darker line between them
  rings: {
    layers: [
      {shape: 'rings', color: 1, width: 0.045, gap: 0.045},
      {shape: 'rings', shade: 0.8, width: 0.006, gap: 0.084, shift: 0.042},
    ],
  },
  // a plaid: wide bands both ways, half mixed in so they darken where they cross, and thin lines between
  plaid: {
    layers: [
      {shape: 'stripes', color: 1, dir: 'across', width: 0.16, gap: 0.16, opacity: 0.55},
      {shape: 'stripes', color: 1, dir: 'along', width: 0.16, gap: 0.16, opacity: 0.55},
      {shape: 'stripes', shade: 0.75, dir: 'across', width: 0.01, gap: 0.31, shift: 0.235},
      {shape: 'stripes', shade: 0.75, dir: 'along', width: 0.01, gap: 0.31, shift: 0.235},
    ],
  },
};

export const RUG_PATTERNS = Object.keys(RUG_PRESETS) as RugPattern[];

export const isRugPattern = (key: string | undefined): key is RugPattern =>
  key !== undefined && Object.hasOwn(RUG_PRESETS, key);

/**
 * The named pattern nearest a spec, for an item's `pat` beside its own `patSpec`: an editor that does not read patSpec draws
 * that. By the layers' shapes: a medallion or a frame reads as an oriental rug, diamonds as the lattice, stripes both ways as a
 * plaid, a checker or a grid as squares; patches or nothing known as mottled.
 */
export function nearestRugPreset(spec: RugSpec): RugPattern {
  const shapes = new Set(spec.layers.map(layer => layer.shape));
  const stripeWays = new Set(
    spec.layers.filter(layer => layer.shape === 'stripes').map(layer => layer.dir ?? 'across'),
  );
  if (shapes.has('medallion') || shapes.has('frame')) return 'oriental';
  if (shapes.has('diamonds')) return 'lattice';
  if (shapes.has('chevron')) return 'chevron';
  if (shapes.has('rings')) return 'rings';
  if (stripeWays.has('across') && stripeWays.has('along')) return 'plaid';
  if (shapes.has('checks') || shapes.has('grid')) return 'tiles';
  if (shapes.has('stripes')) return 'stripes';
  if (shapes.has('dots')) return 'dots';
  return 'mottled';
}
