// The turntable of an example's card (D-114): the home rendered from FRAMES angles round it into one sprite sheet, a frame per
// cell, row by row. Here the sheet's layout and the arithmetic the card turns by; no DOM (turntable.ts draws, the render tool
// tools/render-examples.ts --turntable paints the sheets).

/** How many angles round the home: one every 15°. Frame 0 is the card's still render. */
export const TURNTABLE_FRAMES = 24;
/** The sheet's grid: columns and rows of frames. */
export const TURNTABLE_COLUMNS = 6;
export const TURNTABLE_ROWS = 4;
/** One frame's size in the sheet, pixels (16 : 10, as the card's picture). */
export const TURNTABLE_FRAME_WIDTH = 480;
export const TURNTABLE_FRAME_HEIGHT = 300;
/** One turn of the home while the card turns by itself, seconds. */
export const TURN_SECONDS = 8;
/** A drag across the whole picture turns the home this share of a turn. */
export const DRAG_TURNS_PER_WIDTH = 0.75;

/** A frame position (fractional while turning) brought into 0 … frames. */
export function wrapFrame(position: number, frames: number = TURNTABLE_FRAMES): number {
  // (… + frames) % frames: never negative, and never -0
  return (((position % frames) + frames) % frames) + 0;
}

/** The frame shown for a position: the nearest one, wrapped round. */
export function frameIndex(position: number, frames: number = TURNTABLE_FRAMES): number {
  return Math.round(wrapFrame(position, frames)) % frames;
}

/** The frame for an angle round the home, degrees (0: the still render's angle; growing the way the frames go). */
export function frameAtAngle(degrees: number, frames: number = TURNTABLE_FRAMES): number {
  return frameIndex((degrees / 360) * frames, frames);
}

/** How many frames a horizontal drag moves: rightwards forwards, a drag across the picture is DRAG_TURNS_PER_WIDTH turns. */
export function framesForDrag(
  deltaPixels: number,
  widthPixels: number,
  frames: number = TURNTABLE_FRAMES,
): number {
  if (widthPixels <= 0) return 0;
  return (deltaPixels / widthPixels) * DRAG_TURNS_PER_WIDTH * frames;
}

/** The shortest way from a position back to frame 0, in frames: negative goes back, positive goes on. */
export function wayToStart(position: number, frames: number = TURNTABLE_FRAMES): number {
  const wrapped = wrapFrame(position, frames);
  return wrapped > frames / 2 ? frames - wrapped : -wrapped;
}

/** Frames per second while the card turns by itself. */
export const spinSpeed = (frames: number = TURNTABLE_FRAMES): number => frames / TURN_SECONDS;

/**
 * The CSS background-position of a frame in the sheet (background-size: columns × 100 %, rows × 100 %), in percent: a cell
 * at column c is at c / (columns − 1) of the free width.
 */
export function sheetPosition(
  frame: number,
  columns: number = TURNTABLE_COLUMNS,
  rows: number = TURNTABLE_ROWS,
): {x: number; y: number} {
  const column = frame % columns;
  const row = Math.floor(frame / columns) % rows;
  const x = columns > 1 ? (column * 100) / (columns - 1) : 0;
  const y = rows > 1 ? (row * 100) / (rows - 1) : 0;
  return {x, y};
}

/** A coasting drag's speed after one more step of `seconds`: it slows down by half about every 0.18 s. */
export function coast(velocity: number, seconds: number): number {
  const kept = Math.pow(0.5, seconds / 0.18);
  return velocity * kept;
}
