// Each main step of the guided path has a short looping clip of its action (D-108): a mini plan, a pointer, the action and
// its result, drawn in code as an inline SVG. No text inside, so it works in every language; the colours are the theme's
// tokens (styles.css, .clip-svg), so it follows light and dark and the inverted step card. It is still when the system asks
// for reduced motion (the result is shown), and it stops while the tab is hidden or the card is not on screen.
import {t} from '../i18n/i18n.ts';
import {el, esc} from './ui.ts';
import {icon} from './icons.ts';
import {holdFocus} from './keyboard.ts';
import type {OnboardingStepId} from '../core/types.ts';

/** A moment of a clip's loop, in ms from its start. */
type Ms = number;

/** A pointer's way: at each moment, where it is (in the clip's 160 × 90 view). */
type PointerKey = readonly [time: Ms, x: number, y: number];

/** The parts of one drawn clip that move, by their data-part names. */
type ClipParts = Record<string, SVGElement>;

/** One step's clip: its picture and how each part looks at a moment of the loop. */
export interface ClipDefinition {
  /** How long one loop lasts, with the pause at its end. */
  loopMs: Ms;
  /** The moment shown when the clip is still (reduced motion): the result, before the loop fades it out. */
  stillMs: Ms;
  /** The picture's markup inside the 160 × 90 view; uid makes its gradient ids unique on the page. */
  markup(uid: string): string;
  /** Puts every moving part where it is at this moment. */
  pose(parts: ClipParts, time: Ms): void;
}

// The clip's view: 16 : 9, in its own units.
const VIEW_WIDTH = 160;
const VIEW_HEIGHT = 90;
// A click: the pointer is pressed this long, and its ring spreads and fades in this long.
const PRESS_MS = 140;
const RIPPLE_MS = 450;
const RIPPLE_START_RADIUS = 2;
const RIPPLE_END_RADIUS = 11;
// A part appearing or going takes this long.
const APPEAR_MS = 180;
// The loop's end: the result fades out in this time, then a short pause before the next loop.
const FADE_OUT_MS = 350;
const END_PAUSE_MS = 200;
// The pointer waits here, off to the corner, before it comes in and after it leaves.
const POINTER_HOME_X = 152;
const POINTER_HOME_Y = 96;
// A pressed pointer is drawn a bit smaller.
const PRESSED_SCALE = 0.85;

// ---------- timing ----------

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

// Smooth start and end, as a hand moves.
const easeInOut = (value: number): number =>
  value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;

const mix = (from: number, to: number, share: number): number => from + (to - from) * share;

/** How far from `from` to `to` the moment is: 0 before, 1 after, eased between. */
function progress(time: Ms, from: Ms, to: Ms): number {
  if (to <= from) return time >= from ? 1 : 0;
  return easeInOut(clamp01((time - from) / (to - from)));
}

/** A part that comes at `from` and, when given, goes at `until`: its opacity at this moment. */
function presence(time: Ms, from: Ms, until: Ms = Infinity): number {
  const comes = progress(time, from, from + APPEAR_MS);
  const goes = until === Infinity ? 0 : progress(time, until, until + APPEAR_MS);
  return comes * (1 - goes);
}

/** What is left of the loop's result as it fades out at the loop's end: 1, then down to 0. */
function beforeFadeOut(time: Ms, loopMs: Ms): number {
  const fadeEnd = loopMs - END_PAUSE_MS;
  return 1 - progress(time, fadeEnd - FADE_OUT_MS, fadeEnd);
}

/** Where the pointer is at this moment: eased from one key to the next, still before the first and after the last. */
export function pointerAt(keys: readonly PointerKey[], time: Ms): {x: number; y: number} {
  const first = keys[0];
  if (time <= first[0]) return {x: first[1], y: first[2]};
  for (let i = 1; i < keys.length; i++) {
    const [endTime, endX, endY] = keys[i];
    if (time > endTime) continue;
    const [startTime, startX, startY] = keys[i - 1];
    const share = progress(time, startTime, endTime);
    return {x: mix(startX, endX, share), y: mix(startY, endY, share)};
  }
  const last = keys[keys.length - 1];
  return {x: last[1], y: last[2]};
}

// ---------- posing parts ----------

function setOpacity(part: SVGElement, opacity: number): void {
  part.style.opacity = String(Math.round(opacity * 1000) / 1000);
}

function placeAt(part: SVGElement, x: number, y: number, scale = 1): void {
  part.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(3)})`);
}

/** The pointer at its place, pressed (smaller) while any of the presses lasts, faded with the loop. */
function posePointer(
  parts: ClipParts,
  keys: readonly PointerKey[],
  time: Ms,
  presses: ReadonlyArray<readonly [from: Ms, to: Ms]>,
  opacity: number,
): void {
  const {x, y} = pointerAt(keys, time);
  const pressed = presses.some(([from, to]) => time >= from && time <= to);
  placeAt(parts.pointer, x, y, pressed ? PRESSED_SCALE : 1);
  setOpacity(parts.pointer, opacity);
}

/** A click at this moment: the press that goes with it. */
const pressAt = (clickAt: Ms): readonly [Ms, Ms] => [clickAt - PRESS_MS / 2, clickAt + PRESS_MS / 2];

/** The ring that spreads from a click and fades. */
function poseRipple(ring: SVGElement, time: Ms, clickAt: Ms, x: number, y: number): void {
  const share = (time - clickAt) / RIPPLE_MS;
  if (share < 0 || share > 1) {
    setOpacity(ring, 0);
    return;
  }
  ring.setAttribute('cx', String(x));
  ring.setAttribute('cy', String(y));
  ring.setAttribute('r', mix(RIPPLE_START_RADIUS, RIPPLE_END_RADIUS, share).toFixed(2));
  setOpacity(ring, 0.9 * (1 - share));
}

/** A rectangle's corners as its x, y, width and height, whichever corner comes first. */
function setRect(part: SVGElement, ax: number, ay: number, bx: number, by: number): void {
  part.setAttribute('x', Math.min(ax, bx).toFixed(2));
  part.setAttribute('y', Math.min(ay, by).toFixed(2));
  part.setAttribute('width', Math.abs(bx - ax).toFixed(2));
  part.setAttribute('height', Math.abs(by - ay).toFixed(2));
}

// ---------- shared pictures ----------

// The pointer: an arrow with its tip at 0, 0, outlined so it reads on any fill.
const POINTER_MARKUP =
  '<path data-part="pointer" class="cl-pointer" d="M0 0V13.2L3.4 10 5.9 15.4 8.3 14.3 5.8 9H10.6Z"/>';
const RIPPLE_MARKUP = (name: string): string =>
  `<circle data-part="${name}" class="cl-ripple" r="0" style="opacity:0"/>`;
// A plain room: its floor and its walls.
const roomMarkup = (x: number, y: number, width: number, height: number, extra = ''): string =>
  `<rect class="cl-floor" x="${x}" y="${y}" width="${width}" height="${height}"/>` +
  `<rect class="cl-wall" x="${x}" y="${y}" width="${width}" height="${height}"${extra}/>`;

// ---------- the six clips ----------

// 1. Outline: a click in one corner, a click in the opposite one, and the outline is there.
const OUTLINE_CORNER_A = {x: 30, y: 18};
const OUTLINE_CORNER_B = {x: 130, y: 72};
const OUTLINE_FIRST_CLICK: Ms = 650;
const OUTLINE_SECOND_CLICK: Ms = 1850;
const OUTLINE_LOOP: Ms = 3600;
const OUTLINE_POINTER: PointerKey[] = [
  [0, POINTER_HOME_X, POINTER_HOME_Y],
  [520, OUTLINE_CORNER_A.x, OUTLINE_CORNER_A.y],
  [800, OUTLINE_CORNER_A.x, OUTLINE_CORNER_A.y],
  [1720, OUTLINE_CORNER_B.x, OUTLINE_CORNER_B.y],
  [2050, OUTLINE_CORNER_B.x, OUTLINE_CORNER_B.y],
  [2700, 146, 84],
];
const outlineClip: ClipDefinition = {
  loopMs: OUTLINE_LOOP,
  stillMs: 2900,
  markup: () =>
    `<rect data-part="band" class="cl-band" style="opacity:0"/>` +
    `<g data-part="outline" style="opacity:0">${roomMarkup(
      OUTLINE_CORNER_A.x,
      OUTLINE_CORNER_A.y,
      OUTLINE_CORNER_B.x - OUTLINE_CORNER_A.x,
      OUTLINE_CORNER_B.y - OUTLINE_CORNER_A.y,
    )}</g>` +
    `<rect data-part="flash" class="cl-new" x="${OUTLINE_CORNER_A.x}" y="${OUTLINE_CORNER_A.y}" width="${OUTLINE_CORNER_B.x - OUTLINE_CORNER_A.x}" height="${OUTLINE_CORNER_B.y - OUTLINE_CORNER_A.y}" style="opacity:0"/>` +
    `<circle data-part="cornerA" class="cl-dot" cx="${OUTLINE_CORNER_A.x}" cy="${OUTLINE_CORNER_A.y}" r="2.6" style="opacity:0"/>` +
    `<circle data-part="cornerB" class="cl-dot" cx="${OUTLINE_CORNER_B.x}" cy="${OUTLINE_CORNER_B.y}" r="2.6" style="opacity:0"/>` +
    RIPPLE_MARKUP('ringA') +
    RIPPLE_MARKUP('ringB') +
    POINTER_MARKUP,
  pose(parts, time) {
    const kept = beforeFadeOut(time, OUTLINE_LOOP);
    const pointer = pointerAt(OUTLINE_POINTER, time);
    // between the two clicks a dashed rectangle follows the pointer from the first corner
    const drawing = time >= OUTLINE_FIRST_CLICK && time < OUTLINE_SECOND_CLICK;
    setOpacity(parts.band, drawing ? 1 : 0);
    if (drawing) setRect(parts.band, OUTLINE_CORNER_A.x, OUTLINE_CORNER_A.y, pointer.x, pointer.y);
    setOpacity(parts.cornerA, presence(time, OUTLINE_FIRST_CLICK, OUTLINE_SECOND_CLICK + 400) * kept);
    setOpacity(parts.cornerB, presence(time, OUTLINE_SECOND_CLICK, OUTLINE_SECOND_CLICK + 400) * kept);
    setOpacity(parts.outline, presence(time, OUTLINE_SECOND_CLICK) * kept);
    setOpacity(parts.flash, presence(time, OUTLINE_SECOND_CLICK, OUTLINE_SECOND_CLICK + 500) * kept);
    poseRipple(parts.ringA, time, OUTLINE_FIRST_CLICK, OUTLINE_CORNER_A.x, OUTLINE_CORNER_A.y);
    poseRipple(parts.ringB, time, OUTLINE_SECOND_CLICK, OUTLINE_CORNER_B.x, OUTLINE_CORNER_B.y);
    posePointer(
      parts,
      OUTLINE_POINTER,
      time,
      [pressAt(OUTLINE_FIRST_CLICK), pressAt(OUTLINE_SECOND_CLICK)],
      kept,
    );
  },
};

// 2. Rooms: a line through the pointer crosses the outline; a click makes it a wall, and there are two rooms.
const SPLIT_ROOM = {left: 22, top: 16, right: 138, bottom: 74};
const SPLIT_WALL_X = 92;
const SPLIT_CLICK: Ms = 1750;
const SPLIT_LOOP: Ms = 3800;
const SPLIT_POINTER: PointerKey[] = [
  [0, POINTER_HOME_X, POINTER_HOME_Y],
  [600, 56, 50],
  [1550, SPLIT_WALL_X, 46],
  [1950, SPLIT_WALL_X, 46],
  [2700, 148, 84],
];
const splitClip: ClipDefinition = {
  loopMs: SPLIT_LOOP,
  stillMs: 3100,
  markup: () => {
    const {left, top, right, bottom} = SPLIT_ROOM;
    return (
      roomMarkup(left, top, right - left, bottom - top) +
      `<rect data-part="leftRoom" class="cl-new" x="${left}" y="${top}" width="${SPLIT_WALL_X - left}" height="${bottom - top}" style="opacity:0"/>` +
      `<rect data-part="rightRoom" class="cl-new2" x="${SPLIT_WALL_X}" y="${top}" width="${right - SPLIT_WALL_X}" height="${bottom - top}" style="opacity:0"/>` +
      `<line data-part="guide" class="cl-guide" y1="${top}" y2="${bottom}" style="opacity:0"/>` +
      `<line data-part="wall" class="cl-wall" x1="${SPLIT_WALL_X}" x2="${SPLIT_WALL_X}" y1="${top}" y2="${bottom}" style="opacity:0"/>` +
      RIPPLE_MARKUP('ring') +
      POINTER_MARKUP
    );
  },
  pose(parts, time) {
    const kept = beforeFadeOut(time, SPLIT_LOOP);
    const pointer = pointerAt(SPLIT_POINTER, time);
    const inside =
      pointer.x > SPLIT_ROOM.left + 4 &&
      pointer.x < SPLIT_ROOM.right - 4 &&
      pointer.y > SPLIT_ROOM.top &&
      pointer.y < SPLIT_ROOM.bottom;
    const guideShown = inside && time < SPLIT_CLICK;
    parts.guide.setAttribute('x1', pointer.x.toFixed(2));
    parts.guide.setAttribute('x2', pointer.x.toFixed(2));
    setOpacity(parts.guide, guideShown ? 1 : 0);
    setOpacity(parts.wall, presence(time, SPLIT_CLICK) * kept);
    setOpacity(parts.leftRoom, presence(time, SPLIT_CLICK + 120) * kept);
    setOpacity(parts.rightRoom, presence(time, SPLIT_CLICK + 260) * kept);
    poseRipple(parts.ring, time, SPLIT_CLICK, SPLIT_WALL_X, 46);
    posePointer(parts, SPLIT_POINTER, time, [pressAt(SPLIT_CLICK)], kept);
  },
};

// 3. Windows and doors: a click on a wall selects it; a click on “window” among the two choices puts a window there.
const OPEN_ROOM = {left: 22, top: 20, right: 138, bottom: 76};
const OPEN_AT_X = 70;
const OPEN_HALF_WIDTH = 16;
const OPEN_CHOICE = {left: 52, top: 29, width: 36, height: 17};
const OPEN_WINDOW_BUTTON = {x: 61, y: 37.5};
const OPEN_WALL_CLICK: Ms = 800;
const OPEN_CHOICE_CLICK: Ms = 1650;
const OPEN_LOOP: Ms = 4000;
const OPEN_POINTER: PointerKey[] = [
  [0, POINTER_HOME_X, POINTER_HOME_Y],
  [620, OPEN_AT_X + 6, OPEN_ROOM.top],
  [950, OPEN_AT_X + 6, OPEN_ROOM.top],
  [1450, OPEN_WINDOW_BUTTON.x, OPEN_WINDOW_BUTTON.y],
  [1850, OPEN_WINDOW_BUTTON.x, OPEN_WINDOW_BUTTON.y],
  [2600, 146, 84],
];
const openClip: ClipDefinition = {
  loopMs: OPEN_LOOP,
  stillMs: 3300,
  markup: () => {
    const {left, top, right, bottom} = OPEN_ROOM;
    const choice = OPEN_CHOICE;
    const windowLeft = OPEN_AT_X - OPEN_HALF_WIDTH;
    const windowRight = OPEN_AT_X + OPEN_HALF_WIDTH;
    return (
      roomMarkup(left, top, right - left, bottom - top) +
      `<line data-part="selected" class="cl-selected" x1="${left}" x2="${right}" y1="${top}" y2="${top}" style="opacity:0"/>` +
      // the window: a gap in the wall with the glass's two lines
      `<g data-part="window" style="opacity:0">` +
      `<line class="cl-gap" x1="${windowLeft}" x2="${windowRight}" y1="${top}" y2="${top}"/>` +
      `<rect class="cl-window" x="${windowLeft}" y="${top - 2.2}" width="${windowRight - windowLeft}" height="4.4"/>` +
      `<line class="cl-window" x1="${windowLeft}" x2="${windowRight}" y1="${top}" y2="${top}"/>` +
      `</g>` +
      // the two choices: a window and a door, as icons
      `<g data-part="choice" style="opacity:0">` +
      `<rect class="cl-panel" x="${choice.left}" y="${choice.top}" width="${choice.width}" height="${choice.height}" rx="4"/>` +
      `<rect data-part="windowButton" class="cl-choice" x="${choice.left + 2}" y="${choice.top + 2}" width="14" height="13" rx="3"/>` +
      `<rect class="cl-icon" x="${choice.left + 5}" y="${choice.top + 5.5}" width="8" height="6" rx="0.8"/>` +
      `<line class="cl-icon" x1="${choice.left + 9}" x2="${choice.left + 9}" y1="${choice.top + 5.5}" y2="${choice.top + 11.5}"/>` +
      `<path class="cl-icon" d="M${choice.left + 23} ${choice.top + 12.5}V${choice.top + 4.5}A8 8 0 0 1 ${choice.left + 31} ${choice.top + 12.5}"/>` +
      `</g>` +
      RIPPLE_MARKUP('ringWall') +
      RIPPLE_MARKUP('ringChoice') +
      POINTER_MARKUP
    );
  },
  pose(parts, time) {
    const kept = beforeFadeOut(time, OPEN_LOOP);
    setOpacity(parts.selected, presence(time, OPEN_WALL_CLICK, OPEN_CHOICE_CLICK + 150));
    setOpacity(parts.choice, presence(time, OPEN_WALL_CLICK + 80, OPEN_CHOICE_CLICK + 150));
    parts.windowButton.classList.toggle('on', time >= OPEN_CHOICE_CLICK - PRESS_MS / 2);
    setOpacity(parts.window, presence(time, OPEN_CHOICE_CLICK + 150) * kept);
    poseRipple(parts.ringWall, time, OPEN_WALL_CLICK, OPEN_AT_X + 6, OPEN_ROOM.top);
    poseRipple(parts.ringChoice, time, OPEN_CHOICE_CLICK, OPEN_WINDOW_BUTTON.x, OPEN_WINDOW_BUTTON.y);
    posePointer(parts, OPEN_POINTER, time, [pressAt(OPEN_WALL_CLICK), pressAt(OPEN_CHOICE_CLICK)], kept);
  },
};

// 4. Link rooms: the step marks a room; a click on one of Home Assistant's areas links it, and the next room is marked.
const NAMES_LEFT_ROOM = {left: 12, top: 14, right: 64, bottom: 76};
const NAMES_RIGHT_ROOM = {left: 64, top: 14, right: 104, bottom: 76};
const NAMES_PANEL = {left: 112, top: 18, width: 40, height: 52};
const NAMES_CHIP_X = 116;
const NAMES_CHIP_WIDTH = 32;
const NAMES_CHIP_HEIGHT = 9;
const NAMES_CHIP_TOPS = [24, 36.5, 49];
const NAMES_FIRST_CLICK: Ms = 950;
const NAMES_SECOND_CLICK: Ms = 2350;
const NAMES_LOOP: Ms = 4300;
const NAMES_POINTER: PointerKey[] = [
  [0, POINTER_HOME_X, POINTER_HOME_Y],
  [750, 130, NAMES_CHIP_TOPS[0] + 5],
  [1150, 130, NAMES_CHIP_TOPS[0] + 5],
  [2150, 130, NAMES_CHIP_TOPS[1] + 5],
  [2550, 130, NAMES_CHIP_TOPS[1] + 5],
  [3200, 150, 86],
];
// The room's name once linked: a bar where its label shows.
const labelMarkup = (
  name: string,
  room: {left: number; right: number; top: number; bottom: number},
): string => {
  const width = Math.min(26, room.right - room.left - 12);
  const x = (room.left + room.right) / 2 - width / 2;
  const y = (room.top + room.bottom) / 2 - 2.5;
  return `<rect data-part="${name}" class="cl-label" x="${x}" y="${y}" width="${width}" height="5" rx="2.5" style="opacity:0"/>`;
};
const markedRoomMarkup = (
  name: string,
  room: {left: number; right: number; top: number; bottom: number},
): string =>
  `<rect data-part="${name}" class="cl-marked" x="${room.left + 2.5}" y="${room.top + 2.5}" width="${room.right - room.left - 5}" height="${room.bottom - room.top - 5}" rx="2" style="opacity:0"/>`;
const namesClip: ClipDefinition = {
  loopMs: NAMES_LOOP,
  stillMs: 3550,
  markup: () => {
    const left = NAMES_LEFT_ROOM;
    const right = NAMES_RIGHT_ROOM;
    const chips = NAMES_CHIP_TOPS.map(
      (top, i) =>
        `<rect data-part="chip${i}" class="cl-chip" x="${NAMES_CHIP_X}" y="${top}" width="${NAMES_CHIP_WIDTH}" height="${NAMES_CHIP_HEIGHT}" rx="4.5"/>`,
    ).join('');
    return (
      roomMarkup(left.left, left.top, right.right - left.left, left.bottom - left.top) +
      `<line class="cl-wall" x1="${left.right}" x2="${left.right}" y1="${left.top}" y2="${left.bottom}"/>` +
      markedRoomMarkup('markLeft', left) +
      markedRoomMarkup('markRight', right) +
      labelMarkup('labelLeft', left) +
      labelMarkup('labelRight', right) +
      `<rect class="cl-panel" x="${NAMES_PANEL.left}" y="${NAMES_PANEL.top}" width="${NAMES_PANEL.width}" height="${NAMES_PANEL.height}" rx="5"/>` +
      chips +
      RIPPLE_MARKUP('ringFirst') +
      RIPPLE_MARKUP('ringSecond') +
      POINTER_MARKUP
    );
  },
  pose(parts, time) {
    const kept = beforeFadeOut(time, NAMES_LOOP);
    const chipCenterX = NAMES_CHIP_X + NAMES_CHIP_WIDTH / 2;
    setOpacity(parts.markLeft, presence(time, 200, NAMES_FIRST_CLICK + 120));
    setOpacity(parts.labelLeft, presence(time, NAMES_FIRST_CLICK + 120) * kept);
    setOpacity(parts.markRight, presence(time, NAMES_FIRST_CLICK + 450, NAMES_SECOND_CLICK + 120));
    setOpacity(parts.labelRight, presence(time, NAMES_SECOND_CLICK + 120) * kept);
    // a chip pressed lights up, then shows as taken (another room has it)
    const firstUsed = time >= NAMES_FIRST_CLICK && kept > 0.5;
    const secondUsed = time >= NAMES_SECOND_CLICK && kept > 0.5;
    parts.chip0.classList.toggle('on', firstUsed && time < NAMES_FIRST_CLICK + 400);
    parts.chip0.classList.toggle('used', firstUsed && time >= NAMES_FIRST_CLICK + 400);
    parts.chip1.classList.toggle('on', secondUsed && time < NAMES_SECOND_CLICK + 400);
    parts.chip1.classList.toggle('used', secondUsed && time >= NAMES_SECOND_CLICK + 400);
    poseRipple(parts.ringFirst, time, NAMES_FIRST_CLICK, chipCenterX, NAMES_CHIP_TOPS[0] + 4.5);
    poseRipple(parts.ringSecond, time, NAMES_SECOND_CLICK, chipCenterX, NAMES_CHIP_TOPS[1] + 4.5);
    posePointer(parts, NAMES_POINTER, time, [pressAt(NAMES_FIRST_CLICK), pressAt(NAMES_SECOND_CLICK)], kept);
  },
};

// 5. Furniture: an item is taken from the catalog and dragged onto the plan.
const FURNITURE_ROOM = {left: 54, top: 14, right: 150, bottom: 78};
const FURNITURE_CATALOG = {left: 8, top: 12, width: 36, height: 68};
const FURNITURE_TILE_TOPS = [16, 38, 60];
const FURNITURE_TILE = {left: 12, width: 28, height: 17};
const FURNITURE_GRAB = {x: 26, y: 24};
const FURNITURE_DROP = {x: 104, y: 54};
const FURNITURE_PRESS: Ms = 750;
const FURNITURE_RELEASE: Ms = 1950;
const FURNITURE_LOOP: Ms = 4000;
const FURNITURE_POINTER: PointerKey[] = [
  [0, POINTER_HOME_X, POINTER_HOME_Y],
  [600, FURNITURE_GRAB.x, FURNITURE_GRAB.y],
  [FURNITURE_PRESS + 100, FURNITURE_GRAB.x, FURNITURE_GRAB.y],
  [FURNITURE_RELEASE - 100, FURNITURE_DROP.x, FURNITURE_DROP.y],
  [FURNITURE_RELEASE + 150, FURNITURE_DROP.x, FURNITURE_DROP.y],
  [2700, 148, 86],
];
// A sofa seen from above, centred on 0, 0: its back, two arms and the seat.
const SOFA_MARKUP =
  '<rect class="cl-item" x="-15" y="-6" width="30" height="12" rx="2"/>' +
  '<path class="cl-item-line" d="M-12 -2.5H12M-12 -2.5V6M12 -2.5V6"/>';
const furnitureClip: ClipDefinition = {
  loopMs: FURNITURE_LOOP,
  stillMs: 3300,
  markup: () => {
    const {left, top, right, bottom} = FURNITURE_ROOM;
    const catalog = FURNITURE_CATALOG;
    const tiles = FURNITURE_TILE_TOPS.map(
      (tileTop, i) =>
        `<rect ${i === 0 ? 'data-part="sofaTile" ' : ''}class="cl-tile" x="${FURNITURE_TILE.left}" y="${tileTop}" width="${FURNITURE_TILE.width}" height="${FURNITURE_TILE.height}" rx="3"/>`,
    ).join('');
    const tileMiddleX = FURNITURE_TILE.left + FURNITURE_TILE.width / 2;
    // the tiles' pictures: a sofa, a bed, a round table
    const sofaIcon = `<g transform="translate(${tileMiddleX} ${FURNITURE_TILE_TOPS[0] + 8.5}) scale(0.62)">${SOFA_MARKUP}</g>`;
    const bedIcon =
      `<rect class="cl-item" x="${tileMiddleX - 6}" y="${FURNITURE_TILE_TOPS[1] + 2.5}" width="12" height="12" rx="1.5"/>` +
      `<rect class="cl-item-line" x="${tileMiddleX - 4}" y="${FURNITURE_TILE_TOPS[1] + 4}" width="8" height="3" rx="1"/>`;
    const tableIcon = `<circle class="cl-item" cx="${tileMiddleX}" cy="${FURNITURE_TILE_TOPS[2] + 8.5}" r="5"/>`;
    return (
      roomMarkup(left, top, right - left, bottom - top) +
      `<rect class="cl-panel" x="${catalog.left}" y="${catalog.top}" width="${catalog.width}" height="${catalog.height}" rx="5"/>` +
      tiles +
      sofaIcon +
      bedIcon +
      tableIcon +
      `<g data-part="sofa" style="opacity:0">${SOFA_MARKUP}</g>` +
      RIPPLE_MARKUP('ringDrop') +
      POINTER_MARKUP
    );
  },
  pose(parts, time) {
    const kept = beforeFadeOut(time, FURNITURE_LOOP);
    const pointer = pointerAt(FURNITURE_POINTER, time);
    const dragging = time >= FURNITURE_PRESS && time < FURNITURE_RELEASE;
    const placed = time >= FURNITURE_RELEASE;
    parts.sofaTile.classList.toggle('on', dragging);
    // while dragged the sofa hangs under the pointer, see-through; dropped, it lands where it was let go
    if (dragging) {
      placeAt(parts.sofa, pointer.x + 2, pointer.y + 4);
      setOpacity(parts.sofa, 0.6 * presence(time, FURNITURE_PRESS));
    } else {
      placeAt(parts.sofa, FURNITURE_DROP.x + 2, FURNITURE_DROP.y + 4);
      setOpacity(parts.sofa, placed ? kept : 0);
    }
    poseRipple(parts.ringDrop, time, FURNITURE_RELEASE, FURNITURE_DROP.x + 2, FURNITURE_DROP.y + 4);
    posePointer(parts, FURNITURE_POINTER, time, [[FURNITURE_PRESS - 70, FURNITURE_RELEASE]], kept);
  },
};

// 6. Lights: the step puts a light where it guesses; it is dragged to its place, the room is confirmed, and it shines.
const LIGHTS_ROOM = {left: 18, top: 12, right: 142, bottom: 78};
const LIGHTS_TABLE = {x: 78, y: 46, radius: 10};
const LIGHTS_GUESS = {x: 46, y: 28};
const LIGHTS_CONFIRM = {left: 118, top: 58, width: 18, height: 14};
const LIGHTS_PRESS: Ms = 850;
const LIGHTS_RELEASE: Ms = 1750;
const LIGHTS_CONFIRM_CLICK: Ms = 2450;
const LIGHTS_LOOP: Ms = 4300;
const LIGHTS_CONFIRM_AT = {x: LIGHTS_CONFIRM.left + 9, y: LIGHTS_CONFIRM.top + 7};
const LIGHTS_POINTER: PointerKey[] = [
  [0, POINTER_HOME_X, POINTER_HOME_Y],
  [700, LIGHTS_GUESS.x, LIGHTS_GUESS.y],
  [LIGHTS_PRESS + 100, LIGHTS_GUESS.x, LIGHTS_GUESS.y],
  [LIGHTS_RELEASE - 80, LIGHTS_TABLE.x, LIGHTS_TABLE.y],
  [LIGHTS_RELEASE + 100, LIGHTS_TABLE.x, LIGHTS_TABLE.y],
  [2250, LIGHTS_CONFIRM_AT.x, LIGHTS_CONFIRM_AT.y],
  [2650, LIGHTS_CONFIRM_AT.x, LIGHTS_CONFIRM_AT.y],
  [3200, 152, 88],
];
const lightsClip: ClipDefinition = {
  loopMs: LIGHTS_LOOP,
  stillMs: 3600,
  markup: uid => {
    const {left, top, right, bottom} = LIGHTS_ROOM;
    const confirm = LIGHTS_CONFIRM;
    const glowId = `clip-glow-${uid}`;
    return (
      `<defs><radialGradient id="${glowId}">` +
      `<stop offset="0" class="cl-glow-stop" style="stop-opacity:.75"/>` +
      `<stop offset="1" class="cl-glow-stop" style="stop-opacity:0"/>` +
      `</radialGradient></defs>` +
      roomMarkup(left, top, right - left, bottom - top) +
      `<circle class="cl-item" cx="${LIGHTS_TABLE.x}" cy="${LIGHTS_TABLE.y}" r="${LIGHTS_TABLE.radius}"/>` +
      `<circle data-part="glow" cx="${LIGHTS_TABLE.x}" cy="${LIGHTS_TABLE.y}" r="34" fill="url(#${glowId})" style="opacity:0"/>` +
      `<g data-part="lamp" style="opacity:0"><circle class="cl-lamp" r="3.6"/><circle class="cl-lamp-ring" r="6"/></g>` +
      `<g data-part="confirm"><rect class="cl-confirm" x="${confirm.left}" y="${confirm.top}" width="${confirm.width}" height="${confirm.height}" rx="4"/>` +
      `<path class="cl-confirm-tick" d="M${confirm.left + 5} ${confirm.top + 7.2}l2.8 2.8 5.2-5.6"/></g>` +
      RIPPLE_MARKUP('ringConfirm') +
      POINTER_MARKUP
    );
  },
  pose(parts, time) {
    const kept = beforeFadeOut(time, LIGHTS_LOOP);
    const pointer = pointerAt(LIGHTS_POINTER, time);
    const dragging = time >= LIGHTS_PRESS && time < LIGHTS_RELEASE;
    // the light pops in at its guessed spot, follows the pointer while dragged, then stays on the table
    const popIn = progress(time, 250, 250 + APPEAR_MS * 2);
    const lampAt = dragging ? pointer : time >= LIGHTS_RELEASE ? LIGHTS_TABLE : LIGHTS_GUESS;
    placeAt(parts.lamp, lampAt.x, lampAt.y, mix(0.4, 1, popIn));
    setOpacity(parts.lamp, popIn * kept);
    parts.confirm.classList.toggle('on', time >= LIGHTS_CONFIRM_CLICK - PRESS_MS / 2 && kept > 0.5);
    setOpacity(parts.glow, presence(time, LIGHTS_CONFIRM_CLICK + 100) * kept);
    poseRipple(parts.ringConfirm, time, LIGHTS_CONFIRM_CLICK, LIGHTS_CONFIRM_AT.x, LIGHTS_CONFIRM_AT.y);
    posePointer(
      parts,
      LIGHTS_POINTER,
      time,
      [[LIGHTS_PRESS - 70, LIGHTS_RELEASE], pressAt(LIGHTS_CONFIRM_CLICK)],
      kept,
    );
  },
};

/** The clip of each main step (the six of D-041). */
export const STEP_CLIPS: Partial<Record<OnboardingStepId, ClipDefinition>> = {
  rect: outlineClip,
  split: splitClip,
  open: openClip,
  names: namesClip,
  furniture: furnitureClip,
  lights: lightsClip,
};

// ---------- playing ----------

/** A clip on the page: its picture, its parts and what keeps it running. */
interface PlayingClip {
  svg: SVGSVGElement;
  parts: ClipParts;
  clip: ClipDefinition;
  /** Shared by every clip of this step, so a card rebuilt mid-loop goes on where it was. */
  epoch: number;
  /** The clip is on screen (the card shown, not hidden or scrolled away). */
  onScreen: boolean;
  frame: number;
  observer: IntersectionObserver;
}

const playing = new Set<PlayingClip>();
const stepEpochs = new Map<OnboardingStepId, number>();
const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
let uidCounter = 0;
let pageListenersAdded = false;

/** Draws the moment it is now, and asks for the next frame while the clip may move. */
function tick(item: PlayingClip): void {
  item.frame = 0;
  if (!item.svg.isConnected) {
    forget(item);
    return;
  }
  if (reducedMotion()) {
    poseStill(item.parts, item.clip);
    return;
  }
  const time = (performance.now() - item.epoch) % item.clip.loopMs;
  item.clip.pose(item.parts, time);
  if (item.onScreen && document.visibilityState === 'visible')
    item.frame = requestAnimationFrame(() => tick(item));
}

/** The still picture for reduced motion: the result, without the pointer. */
function poseStill(parts: ClipParts, clip: ClipDefinition): void {
  clip.pose(parts, clip.stillMs);
  setOpacity(parts.pointer, 0);
}

/** Starts the clip's frames again if they stopped and it may move now. */
function wake(item: PlayingClip): void {
  if (item.frame) return;
  tick(item);
}

function forget(item: PlayingClip): void {
  if (item.frame) cancelAnimationFrame(item.frame);
  item.frame = 0;
  item.observer.disconnect();
  playing.delete(item);
}

// One listener for the page: the tab shown again or the motion setting changed wakes every clip.
function addPageListeners(): void {
  if (pageListenersAdded) return;
  pageListenersAdded = true;
  document.addEventListener('visibilitychange', () => {
    for (const item of playing) wake(item);
  });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
    for (const item of playing) wake(item);
  });
}

/** The step's clip as an SVG that plays by itself while it is on screen; null for a step without one. */
export function playStepClip(step: OnboardingStepId): SVGSVGElement | null {
  const clip = STEP_CLIPS[step];
  if (!clip) return null;
  // a card rebuilt leaves its old clip behind: stop it
  for (const item of playing) if (!item.svg.isConnected) forget(item);
  addPageListeners();
  uidCounter += 1;
  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" class="clip-svg" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" aria-hidden="true" focusable="false">${clip.markup(String(uidCounter))}</svg>`;
  const holder = document.createElement('div');
  holder.innerHTML = svgMarkup;
  const svg = holder.firstElementChild as SVGSVGElement; // the markup just written is one svg
  const parts: ClipParts = {};
  for (const part of svg.querySelectorAll<SVGElement>('[data-part]')) parts[part.dataset.part!] = part;
  if (!stepEpochs.has(step)) stepEpochs.set(step, performance.now());
  const item: PlayingClip = {
    svg,
    parts,
    clip,
    epoch: stepEpochs.get(step)!, // set just above
    onScreen: false,
    frame: 0,
    observer: new IntersectionObserver(entries => {
      item.onScreen = entries.some(entry => entry.isIntersecting);
      if (item.onScreen) wake(item);
    }),
  };
  item.observer.observe(svg);
  playing.add(item);
  // the first moment drawn at once, so a still or a first frame never shows the parts all at their start
  if (reducedMotion()) poseStill(parts, clip);
  else clip.pose(parts, (performance.now() - item.epoch) % clip.loopMs);
  return svg;
}

// ---------- the card's preview and the larger view ----------

/** The small preview for the step card: a button that shows the clip larger. Null for a step without a clip. */
export function stepClipButton(step: OnboardingStepId): HTMLElement | null {
  const svg = playStepClip(step);
  if (!svg) return null;
  const label = t('Watch how');
  const button = el(
    `<button type="button" class="wizard-clip" aria-haspopup="dialog" title="${esc(label)}" aria-label="${esc(label)}"></button>`,
  );
  button.append(svg);
  button.onclick = () => openLargeClip(step);
  return button;
}

/** The clip larger, over the page; Escape, a click on it or beside it, or its close button closes it (D-096). */
function openLargeClip(step: OnboardingStepId): void {
  const svg = playStepClip(step);
  if (!svg) return;
  const label = t('Watch how');
  const closeLabel = t('Close');
  const veil = el(
    `<div class="clip-pop" role="dialog" aria-modal="true" aria-label="${esc(label)}">` +
      `<div class="clip-pop-box"><button type="button" class="clip-pop-close ib" title="${esc(closeLabel)}" aria-label="${esc(closeLabel)}">${icon('x', 16)}</button></div>` +
      `</div>`,
  );
  const box = veil.querySelector<HTMLElement>('.clip-pop-box')!; // in the markup just written
  box.prepend(svg);
  document.body.append(veil);
  const held = holdFocus(veil, {onEscape: () => close()});
  function close(): void {
    held.release();
    veil.remove();
  }
  veil.onclick = () => close();
}
