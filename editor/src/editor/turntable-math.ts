// The turntable of an example's card (D-114): the home rendered from TURNTABLE_STEPS angles round it (every 5°), in
// TURNTABLE_SHEETS interleaved sprite sheets of TURNTABLE_FRAMES each — sheet a 0°, 15°, 30° …, b 5°, 20° …, c 10°, 25° … — a
// frame per cell, row by row. Sheet a alone is a whole turn in 15° steps; b and c fill in between as they arrive. Here the
// layout and the arithmetic the card turns by; no DOM (turntable.ts draws, tools/render-examples.ts --turntable renders).

/** Frames in one sheet: one every 15°. Frame 0 of sheet a is the card's still render. */
export const TURNTABLE_FRAMES = 24;
/** Interleaved sheets, each the next 5° on. */
export const TURNTABLE_SHEETS = 3;
/** Angles round the home over all the sheets: one every 5°. A card's position counts in these steps. */
export const TURNTABLE_STEPS = TURNTABLE_FRAMES * TURNTABLE_SHEETS;
/** A sheet's grid: columns and rows of frames. */
export const TURNTABLE_COLUMNS = 6;
export const TURNTABLE_ROWS = 4;
/** One frame's size in a sheet, pixels (16 : 10, as the card's picture). */
export const TURNTABLE_FRAME_WIDTH = 480;
export const TURNTABLE_FRAME_HEIGHT = 300;
/** One turn of the home while the card turns by itself, seconds. */
export const TURN_SECONDS = 8;
/** A drag across the whole picture turns the home this share of a turn. */
export const DRAG_TURNS_PER_WIDTH = 0.75;

/** A sheet's file name after the home and the light: sheet a has none, b '-b', c '-c'. */
export const sheetSuffix = (sheet: number): string => (sheet === 0 ? '' : '-' + 'abc'[sheet]);

/** A position (fractional while turning) brought into 0 … steps. */
export function wrapFrame(position: number, steps: number = TURNTABLE_STEPS): number {
  // (… + steps) % steps: never negative, and never -0
  return (((position % steps) + steps) % steps) + 0;
}

/** The nearest whole step for a position, wrapped round. */
export function frameIndex(position: number, steps: number = TURNTABLE_STEPS): number {
  return Math.round(wrapFrame(position, steps)) % steps;
}

/** The step for an angle round the home, degrees (0: the still render's angle; growing the way the frames go). */
export function frameAtAngle(degrees: number, steps: number = TURNTABLE_STEPS): number {
  return frameIndex((degrees / 360) * steps, steps);
}

/** Where a step is: its sheet and the cell in it. */
export function cellOfStep(step: number, sheets: number = TURNTABLE_SHEETS): {sheet: number; cell: number} {
  return {sheet: step % sheets, cell: Math.floor(step / sheets)};
}

/** What to draw for a position: the loaded step at or before it, the next loaded one, and how far it is between them (0 … 1). */
export interface Blend {
  from: number;
  to: number;
  weight: number;
}

/**
 * The two loaded steps round a position and the next one's share: a step is there when its sheet is loaded (loaded[sheet]).
 * With sheet a alone the steps are 15° apart; with all three, 5°. With none, step 0 alone.
 */
export function blendAt(
  position: number,
  loaded: readonly boolean[],
  steps: number = TURNTABLE_STEPS,
  sheets: number = TURNTABLE_SHEETS,
): Blend {
  const at = wrapFrame(position, steps);
  const base = Math.floor(at);
  let from = -1;
  for (let back = 0; back < steps; back++) {
    const step = (base - back + steps) % steps;
    if (loaded[step % sheets]) {
      from = step;
      break;
    }
  }
  if (from < 0) return {from: 0, to: 0, weight: 0};
  let gap = 1;
  while (gap < steps && !loaded[(from + gap) % sheets]) gap += 1;
  const to = (from + gap) % steps;
  const past = wrapFrame(at - from, steps);
  const weight = Math.min(1, past / gap);
  return {from, to, weight};
}

/** The nearest loaded step to a position (where a still card rests). */
export function nearestLoaded(
  position: number,
  loaded: readonly boolean[],
  steps: number = TURNTABLE_STEPS,
): number {
  const blend = blendAt(position, loaded, steps);
  return blend.weight > 0.5 ? blend.to : blend.from;
}

/** How many steps a horizontal drag moves: rightwards forwards, a drag across the picture is DRAG_TURNS_PER_WIDTH turns. */
export function framesForDrag(
  deltaPixels: number,
  widthPixels: number,
  steps: number = TURNTABLE_STEPS,
): number {
  if (widthPixels <= 0) return 0;
  return (deltaPixels / widthPixels) * DRAG_TURNS_PER_WIDTH * steps;
}

/** The shortest way from a position back to step 0: negative goes back, positive goes on. */
export function wayToStart(position: number, steps: number = TURNTABLE_STEPS): number {
  const wrapped = wrapFrame(position, steps);
  return wrapped > steps / 2 ? steps - wrapped : -wrapped;
}

/** Steps per second while the card turns by itself. */
export const spinSpeed = (steps: number = TURNTABLE_STEPS): number => steps / TURN_SECONDS;

/**
 * The CSS background-position of a cell in a sheet (background-size: columns × 100 %, rows × 100 %), in percent: a cell at
 * column c is at c / (columns − 1) of the free width.
 */
export function sheetPosition(
  cell: number,
  columns: number = TURNTABLE_COLUMNS,
  rows: number = TURNTABLE_ROWS,
): {x: number; y: number} {
  const column = cell % columns;
  const row = Math.floor(cell / columns) % rows;
  const x = columns > 1 ? (column * 100) / (columns - 1) : 0;
  const y = rows > 1 ? (row * 100) / (rows - 1) : 0;
  return {x, y};
}

/** A coasting drag's speed after one more step of `seconds`: it slows down by half about every 0.18 s. */
export function coast(velocity: number, seconds: number): number {
  const kept = Math.pow(0.5, seconds / 0.18);
  return velocity * kept;
}
