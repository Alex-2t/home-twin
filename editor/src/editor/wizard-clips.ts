// Each main step of the guided path has a short looping clip of its action (D-109, D-110). Every clip plays on the same
// photo of a paper plan (wizard-clip-plan.ts), as the user's own plan photo lies under the editor in step 0, and the
// editor's overlay does the step's action over it: the outline snaps onto the drawn walls, a wall goes along a drawn inner
// wall, a window lands on a drawn window. The overlay is an inline SVG posed each frame from a small timeline; its colours are
// the theme's tokens (styles.css, .clip-svg). It is still when the system asks for reduced motion (the result is shown),
// and it stops while the tab is hidden or the clip is not on screen.
import {t} from '../i18n/i18n.ts';
import {el, esc} from './ui.ts';
import {icon} from './icons.ts';
import {holdFocus} from './keyboard.ts';
import {
  INNER_WALL,
  OUTER_WALL,
  PAPER_ROOMS,
  PAPER_TURN,
  PAPER_TURN_DEGREES,
  SCALE,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  planPath,
  planPhotoUrl,
  planRect,
  planToView,
  toPaper,
  viewToPaper,
  wallsPath,
} from './wizard-clip-plan.ts';
import type {OnboardingStepId, Point} from '../core/types.ts';

/** A moment of a clip's loop, in ms from its start. */
type Ms = number;

/** A pointer's way: at each moment, where it is (in the clip's 320 × 200 view). */
type PointerKey = readonly [time: Ms, x: number, y: number];

/** The parts of one drawn clip that move, by their data-part names. */
type ClipParts = Record<string, SVGElement>;

/** One step's clip: its overlay and how each part looks at a moment of the loop. */
export interface ClipDefinition {
  /** How long one loop lasts, with the pause at its end. */
  loopMs: Ms;
  /** The moment shown when the clip is still (reduced motion): the result, before the loop fades it out. */
  stillMs: Ms;
  /** The overlay's markup inside the 320 × 200 view; uid makes its ids unique on the page. */
  markup(uid: string): string;
  /** Puts every moving part where it is at this moment. */
  pose(parts: ClipParts, time: Ms): void;
}

// A click: the pointer is pressed this long, and its ring spreads and fades in this long.
const PRESS_MS = 140;
const RIPPLE_MS = 450;
const RIPPLE_START_RADIUS = 3;
const RIPPLE_END_RADIUS = 18;
// A part appearing or going takes this long.
const APPEAR_MS = 180;
// The loop's end: the result fades out in this time, then a short pause before the next loop.
const FADE_OUT_MS = 350;
const END_PAUSE_MS = 200;
// The pointer waits here, off the bottom right corner, before it comes in; it leaves towards the corner.
const POINTER_HOME: Point = [334, 214];
const POINTER_EXIT: Point = [304, 192];
// The pointer's drawn size in the view, and a pressed pointer a bit smaller.
const POINTER_SCALE = 1.5;
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

/** A pointer key at a point of the view. */
const key = (time: Ms, point: Point): PointerKey => [time, point[0], point[1]];

/** A plan point (metres) where it is seen in the clip. */
const seen = (x: number, y: number): Point => planToView([x, y]);

// ---------- posing parts ----------

function setOpacity(part: SVGElement, opacity: number): void {
  part.style.opacity = String(Math.round(opacity * 1000) / 1000);
}

function placeAt(part: SVGElement, x: number, y: number, scale = 1, turn = 0): void {
  const turned = turn ? ` rotate(${turn})` : '';
  part.setAttribute(
    'transform',
    `translate(${x.toFixed(2)} ${y.toFixed(2)})${turned} scale(${scale.toFixed(3)})`,
  );
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
  placeAt(parts.pointer, x, y, POINTER_SCALE * (pressed ? PRESSED_SCALE : 1));
  setOpacity(parts.pointer, opacity);
}

/** A click at this moment: the press that goes with it. */
const pressAt = (clickAt: Ms): readonly [Ms, Ms] => [clickAt - PRESS_MS / 2, clickAt + PRESS_MS / 2];

/** The ring that spreads from a click and fades. */
function poseRipple(ring: SVGElement, time: Ms, clickAt: Ms, at: Point): void {
  const share = (time - clickAt) / RIPPLE_MS;
  if (share < 0 || share > 1) {
    setOpacity(ring, 0);
    return;
  }
  ring.setAttribute('cx', at[0].toFixed(2));
  ring.setAttribute('cy', at[1].toFixed(2));
  ring.setAttribute('r', mix(RIPPLE_START_RADIUS, RIPPLE_END_RADIUS, share).toFixed(2));
  setOpacity(ring, 0.9 * (1 - share));
}

/** A rectangle given by two corners in paper units, whichever corner comes first. */
function setRect(part: SVGElement, a: Point, b: Point): void {
  part.setAttribute('x', Math.min(a[0], b[0]).toFixed(2));
  part.setAttribute('y', Math.min(a[1], b[1]).toFixed(2));
  part.setAttribute('width', Math.abs(b[0] - a[0]).toFixed(2));
  part.setAttribute('height', Math.abs(b[1] - a[1]).toFixed(2));
}

// ---------- shared pictures ----------

// The pointer: an arrow with its tip at 0, 0, outlined so it reads on the paper and on the table.
const POINTER_MARKUP =
  '<path data-part="pointer" class="cl-pointer" d="M0 0V13.2L3.4 10 5.9 15.4 8.3 14.3 5.8 9H10.6Z"/>';
const RIPPLE_MARKUP = (name: string): string =>
  `<circle data-part="${name}" class="cl-ripple" r="0" style="opacity:0"/>`;
/** Markup drawn on the paper: turned with it, in paper units. */
const onPaper = (inner: string): string => `<g transform="${PAPER_TURN}">${inner}</g>`;

// The editor's outline of the whole home: the rectangle drawn in step 1 takes in the balcony too, as the step's hint asks
// ("a rectangle that fits your whole home"); the rooms step then cuts the balcony off and deletes the area beside it.
const HOME_TOP = 8.95; // the balcony's glazing, the drawn home's northmost line
const FLAT_TOP = 7.6; // the flat's rooms end here; the wall between the flat and the balcony runs above it
const BALCONY_LEFT = 5.5;
const BALCONY_RIGHT = 9;
const STRIP_BOTTOM = FLAT_TOP + OUTER_WALL; // the strip between the flat's wall and the glazing
const HOME_FLOOR: [Point, Point] = [
  [0, 0],
  [10.4, HOME_TOP],
];
/** The outline's walls along the home's box; class cl-fresh draws them in the accent as they are made. */
const outlineWallsMarkup = (className: string, extra = ''): string =>
  `<rect class="${className}" ${planRect([-OUTER_WALL / 2, -OUTER_WALL / 2], [10.4 + OUTER_WALL / 2, HOME_TOP + OUTER_WALL / 2])} stroke-width="${(OUTER_WALL * SCALE).toFixed(2)}"${extra}/>`;

/** A wall as a filled band between two plan corners; class cl-wallband, or cl-freshband for one just made. */
const bandMarkup = (a: Point, b: Point, extra = '', className = 'cl-wallband'): string =>
  `<rect class="${className}" ${planRect(a, b)}${extra}/>`;
const hidden = (part: string): string => ` data-part="${part}" style="opacity:0"`;
const shown = (part: string): string => ` data-part="${part}"`;

// Every room and wall the editor has once the rooms are done (steps 3 to 6), the balcony with its parapet among them.
const BALCONY = PAPER_ROOMS.find(room => room.id === 'balcony')!; // in the drawn flat
const allRoomsMarkup = (): string =>
  PAPER_ROOMS.map(room => `<path class="cl-floor" d="${planPath(room.polygon)}"/>`).join('') +
  `<path class="cl-walls" fill-rule="evenodd" d="${wallsPath()}"/>` +
  `<path class="cl-wall" d="${planPath(BALCONY.polygon)}" stroke-width="${(INNER_WALL * SCALE).toFixed(2)}"/>`;
const LIVING_ROOM = PAPER_ROOMS.find(room => room.id === 'living')!; // in the drawn flat

/** A text's width in the view, roughly, for the pills drawn around it. */
const textWidth = (text: string, size: number): number => text.length * size * 0.56;

// ---------- the six clips ----------

// 1. Outline: a click on one corner of the drawn home, a click on the opposite one, and the walls snap over the drawing.
// The rectangle takes in the balcony: what sticks out is cut off in the next step.
const OUTLINE_A: Point = [-OUTER_WALL, HOME_TOP + OUTER_WALL];
const OUTLINE_B: Point = [10.4 + OUTER_WALL, -OUTER_WALL];
const OUTLINE_A_SEEN = seen(...OUTLINE_A);
const OUTLINE_B_SEEN = seen(...OUTLINE_B);
const OUTLINE_FIRST_CLICK: Ms = 750;
const OUTLINE_SECOND_CLICK: Ms = 2050;
const OUTLINE_LOOP: Ms = 3900;
const OUTLINE_POINTER: PointerKey[] = [
  key(0, POINTER_HOME),
  key(620, OUTLINE_A_SEEN),
  key(900, OUTLINE_A_SEEN),
  key(1920, OUTLINE_B_SEEN),
  key(2250, OUTLINE_B_SEEN),
  key(2950, POINTER_EXIT),
];
const outlineClip: ClipDefinition = {
  loopMs: OUTLINE_LOOP,
  stillMs: 3200,
  markup: () =>
    onPaper(
      `<rect data-part="band" class="cl-band" style="opacity:0"/>` +
        `<g data-part="outline" style="opacity:0"><rect class="cl-floor" ${planRect(...HOME_FLOOR)}/>${outlineWallsMarkup('cl-wall')}</g>` +
        `<rect data-part="flash" class="cl-new" ${planRect(...HOME_FLOOR)} style="opacity:0"/>` +
        outlineWallsMarkup('cl-fresh', ' data-part="fresh" style="opacity:0"'),
    ) +
    `<circle data-part="cornerA" class="cl-dot" cx="${OUTLINE_A_SEEN[0]}" cy="${OUTLINE_A_SEEN[1]}" r="3.4" style="opacity:0"/>` +
    `<circle data-part="cornerB" class="cl-dot" cx="${OUTLINE_B_SEEN[0]}" cy="${OUTLINE_B_SEEN[1]}" r="3.4" style="opacity:0"/>` +
    RIPPLE_MARKUP('ringA') +
    RIPPLE_MARKUP('ringB') +
    POINTER_MARKUP,
  pose(parts, time) {
    const kept = beforeFadeOut(time, OUTLINE_LOOP);
    const pointer = pointerAt(OUTLINE_POINTER, time);
    // between the two clicks a dashed rectangle follows the pointer from the first corner
    const drawing = time >= OUTLINE_FIRST_CLICK && time < OUTLINE_SECOND_CLICK;
    setOpacity(parts.band, drawing ? 1 : 0);
    if (drawing) setRect(parts.band, toPaper(OUTLINE_A), viewToPaper([pointer.x, pointer.y]));
    setOpacity(parts.cornerA, presence(time, OUTLINE_FIRST_CLICK, OUTLINE_SECOND_CLICK + 400) * kept);
    setOpacity(parts.cornerB, presence(time, OUTLINE_SECOND_CLICK, OUTLINE_SECOND_CLICK + 400) * kept);
    setOpacity(parts.outline, presence(time, OUTLINE_SECOND_CLICK) * kept);
    setOpacity(parts.flash, presence(time, OUTLINE_SECOND_CLICK, OUTLINE_SECOND_CLICK + 500) * kept);
    setOpacity(parts.fresh, presence(time, OUTLINE_SECOND_CLICK, OUTLINE_SECOND_CLICK + 800) * kept);
    poseRipple(parts.ringA, time, OUTLINE_FIRST_CLICK, OUTLINE_A_SEEN);
    poseRipple(parts.ringB, time, OUTLINE_SECOND_CLICK, OUTLINE_B_SEEN);
    posePointer(
      parts,
      OUTLINE_POINTER,
      time,
      [pressAt(OUTLINE_FIRST_CLICK), pressAt(OUTLINE_SECOND_CLICK)],
      kept,
    );
  },
};

// 2. Rooms: the outline from step 1 takes in the balcony and the empty paper beside it. A line through the pointer snaps
// onto the drawn wall above the flat (a click makes it a wall), and then, as the step's tip says (horizontal walls first,
// then vertical ones), onto the inner wall across the flat; two short cuts follow the balcony's sides and one the inner wall
// between the kids' room and the bathroom. The two pieces beside the balcony are deleted, as the step's hint says ("delete
// any extra area outside"): as in the editor's Split tool, the piece under the pointer is tinted and its bin comes up on
// hover, so the only click is on the bin.
const SPLIT_SNAP_METRES = 0.35;
const CUT_Y = FLAT_TOP + OUTER_WALL / 2; // the drawn wall between the flat and the balcony, along its middle
const MIDDLE_Y = 3.75; // the drawn inner wall across the flat: kids' room | bedroom, hallway | living room, kitchen | living room
const INNER_X = 3.45; // the drawn inner wall between the kids' room and the bathroom, below the wall across
const MIDDLE_POINTER_X = 2.2;
const INNER_POINTER_Y = 1.2;
const STRIP_MIDDLE_Y = (STRIP_BOTTOM + HOME_TOP) / 2;
const EXTRA_LEFT_MIDDLE: Point = [2.7, STRIP_MIDDLE_Y];
const EXTRA_RIGHT_MIDDLE: Point = [(BALCONY_RIGHT + 10.4) / 2, STRIP_MIDDLE_Y];
// the clicks
const CUT_ACROSS_CLICK: Ms = 1450;
const CUT_MIDDLE_CLICK: Ms = 2300;
const CUT_LEFT_CLICK: Ms = 3250;
const CUT_RIGHT_CLICK: Ms = 4150;
const CUT_INNER_CLICK: Ms = 5150;
const TRASH_LEFT_CLICK: Ms = 6600;
const TRASH_RIGHT_CLICK: Ms = 8050;
// when the pointer comes over each piece beside the balcony (no click: hovering tints it and brings up its bin)
const HOVER_LEFT_AT: Ms = 5750;
const HOVER_RIGHT_AT: Ms = 7200;
const SPLIT_LOOP: Ms = 9850;
// when the pointer sweeps for each cut, so its guide shows only then
const SWEEP_ACROSS: readonly [Ms, Ms] = [600, CUT_ACROSS_CLICK];
const SWEEP_MIDDLE: readonly [Ms, Ms] = [1900, CUT_MIDDLE_CLICK];
const SWEEP_LEFT: readonly [Ms, Ms] = [2850, CUT_LEFT_CLICK];
const SWEEP_RIGHT: readonly [Ms, Ms] = [3750, CUT_RIGHT_CLICK];
const SWEEP_INNER: readonly [Ms, Ms] = [4750, CUT_INNER_CLICK];
// the delete button that comes up under the piece under the pointer, in view units from the piece's middle
const TRASH_BELOW = 20;
const TRASH_SIZE = 18;
const trashSeen = (middle: Point): Point => {
  const [x, y] = seen(...middle);
  return [x, y + TRASH_BELOW];
};
const CUT_ACROSS_SEEN = seen(2.2, CUT_Y);
const CUT_MIDDLE_SEEN = seen(MIDDLE_POINTER_X, MIDDLE_Y);
const CUT_INNER_SEEN = seen(INNER_X, INNER_POINTER_Y);
const CUT_LEFT_SEEN = seen(BALCONY_LEFT, STRIP_MIDDLE_Y);
const CUT_RIGHT_SEEN = seen(BALCONY_RIGHT, STRIP_MIDDLE_Y);
const HOVER_LEFT_SEEN = seen(...EXTRA_LEFT_MIDDLE);
const HOVER_RIGHT_SEEN = seen(...EXTRA_RIGHT_MIDDLE);
const TRASH_LEFT_SEEN = trashSeen(EXTRA_LEFT_MIDDLE);
const TRASH_RIGHT_SEEN = trashSeen(EXTRA_RIGHT_MIDDLE);
const SPLIT_POINTER: PointerKey[] = [
  key(0, POINTER_HOME),
  key(SWEEP_ACROSS[0], seen(2.2, 6.7)),
  key(1250, CUT_ACROSS_SEEN),
  key(1600, CUT_ACROSS_SEEN),
  key(SWEEP_MIDDLE[0], seen(MIDDLE_POINTER_X, 4.4)),
  key(2150, CUT_MIDDLE_SEEN),
  key(2450, CUT_MIDDLE_SEEN),
  key(SWEEP_LEFT[0], seen(4.9, STRIP_MIDDLE_Y)),
  key(3100, CUT_LEFT_SEEN),
  key(3400, CUT_LEFT_SEEN),
  key(SWEEP_RIGHT[0], seen(8.4, STRIP_MIDDLE_Y)),
  key(4000, CUT_RIGHT_SEEN),
  key(4300, CUT_RIGHT_SEEN),
  key(SWEEP_INNER[0], seen(2.8, INNER_POINTER_Y)),
  key(5000, CUT_INNER_SEEN),
  key(5300, CUT_INNER_SEEN),
  key(5800, HOVER_LEFT_SEEN),
  key(6100, HOVER_LEFT_SEEN),
  key(6450, TRASH_LEFT_SEEN),
  key(6750, TRASH_LEFT_SEEN),
  key(7250, HOVER_RIGHT_SEEN),
  key(7550, HOVER_RIGHT_SEEN),
  key(7900, TRASH_RIGHT_SEEN),
  key(8200, TRASH_RIGHT_SEEN),
  key(8900, POINTER_EXIT),
];
const during = (time: Ms, [from, to]: readonly [Ms, Ms]): boolean => time >= from && time < to;
/** The value snapped onto `target` when it is near enough, as the editor snaps a cut onto the photo's lines. */
const snapTo = (value: number, target: number): {value: number; snapped: boolean} =>
  Math.abs(value - target) < SPLIT_SNAP_METRES ? {value: target, snapped: true} : {value, snapped: false};
/** A view point as plan metres. */
const viewToPlan = (point: Point): Point => {
  const [paperX, paperY] = viewToPaper(point);
  const [originX, originY] = toPaper([0, 0]);
  return [(paperX - originX) / SCALE, (originY - paperY) / SCALE];
};
/** The delete button under the piece under the pointer: a small panel with a bin. */
const trashMarkup = (part: string, middle: Point): string => {
  const [x, y] = trashSeen(middle);
  const half = TRASH_SIZE / 2;
  return (
    `<g data-part="${part}" style="opacity:0">` +
    `<rect class="cl-panel" x="${(x - half - 3).toFixed(2)}" y="${(y - half - 3).toFixed(2)}" width="${TRASH_SIZE + 6}" height="${TRASH_SIZE + 6}" rx="6"/>` +
    `<rect data-part="${part}Button" class="cl-choice" x="${(x - half).toFixed(2)}" y="${(y - half).toFixed(2)}" width="${TRASH_SIZE}" height="${TRASH_SIZE}" rx="4"/>` +
    `<path class="cl-icon" d="M${(x - 5).toFixed(2)} ${(y - 3.5).toFixed(2)}h10M${(x - 1.8).toFixed(2)} ${(y - 3.5).toFixed(2)}v-1.6h3.6v1.6M${(x - 3.8).toFixed(2)} ${(y - 3.5).toFixed(2)}l.7 8.5h6.2l.7-8.5"/>` +
    `</g>`
  );
};
const splitClip: ClipDefinition = {
  loopMs: SPLIT_LOOP,
  stillMs: 9150,
  markup: () => {
    const w = OUTER_WALL;
    const half = INNER_WALL / 2;
    const floors =
      `<rect class="cl-floor" ${planRect([0, 0], [10.4, STRIP_BOTTOM])}/>` +
      `<rect class="cl-floor" data-part="extraLeft" ${planRect([0, STRIP_BOTTOM], [BALCONY_LEFT, HOME_TOP])}/>` +
      `<rect class="cl-floor" ${planRect([BALCONY_LEFT, STRIP_BOTTOM], [BALCONY_RIGHT, HOME_TOP])}/>` +
      `<rect class="cl-floor" data-part="extraRight" ${planRect([BALCONY_RIGHT, STRIP_BOTTOM], [10.4, HOME_TOP])}/>`;
    // the outline's walls, in pieces: those around the area beside the balcony go with it
    const walls =
      bandMarkup([-w, -w], [10.4 + w, 0]) +
      bandMarkup([-w, 0], [0, STRIP_BOTTOM]) +
      bandMarkup([10.4, 0], [10.4 + w, STRIP_BOTTOM]) +
      bandMarkup([BALCONY_LEFT - half, HOME_TOP], [BALCONY_RIGHT + half, HOME_TOP + w]) +
      bandMarkup([-w, STRIP_BOTTOM], [0, HOME_TOP + w], shown('wallsLeftA')) +
      bandMarkup([0, HOME_TOP], [BALCONY_LEFT - half, HOME_TOP + w], shown('wallsLeftB')) +
      bandMarkup([10.4, STRIP_BOTTOM], [10.4 + w, HOME_TOP + w], shown('wallsRightA')) +
      bandMarkup([BALCONY_RIGHT + half, HOME_TOP], [10.4, HOME_TOP + w], shown('wallsRightB'));
    // the five cuts: made in the accent, then plain walls
    const cuts: Array<[string, Point, Point]> = [
      ['cutAcross', [0, FLAT_TOP], [10.4, STRIP_BOTTOM]],
      ['cutMiddle', [0, MIDDLE_Y - half], [10.4, MIDDLE_Y + half]],
      ['cutInner', [INNER_X - half, 0], [INNER_X + half, MIDDLE_Y - half]],
      ['cutLeft', [BALCONY_LEFT - half, STRIP_BOTTOM], [BALCONY_LEFT + half, HOME_TOP]],
      ['cutRight', [BALCONY_RIGHT - half, STRIP_BOTTOM], [BALCONY_RIGHT + half, HOME_TOP]],
    ];
    const cutMarkup = cuts
      .map(
        ([part, a, b]) =>
          bandMarkup(a, b, hidden(part)) + bandMarkup(a, b, hidden(`${part}Fresh`), 'cl-freshband'),
      )
      .join('');
    // tinted, not selected: the editor tints the room under the pointer in Split
    const markedLeft = `<rect class="cl-tint"${hidden('markedLeft')} ${planRect([0, STRIP_BOTTOM], [BALCONY_LEFT - half, HOME_TOP])}/>`;
    const markedRight = `<rect class="cl-tint"${hidden('markedRight')} ${planRect([BALCONY_RIGHT + half, STRIP_BOTTOM], [10.4, HOME_TOP])}/>`;
    return (
      onPaper(
        floors +
          walls +
          cutMarkup +
          markedLeft +
          markedRight +
          `<line data-part="guide" class="cl-guide" style="opacity:0"/>`,
      ) +
      trashMarkup('trashLeft', EXTRA_LEFT_MIDDLE) +
      trashMarkup('trashRight', EXTRA_RIGHT_MIDDLE) +
      RIPPLE_MARKUP('ringCut') +
      RIPPLE_MARKUP('ringPick') +
      POINTER_MARKUP
    );
  },
  pose(parts, time) {
    const kept = beforeFadeOut(time, SPLIT_LOOP);
    const pointer = pointerAt(SPLIT_POINTER, time);
    const [pointerX, pointerY] = viewToPlan([pointer.x, pointer.y]);
    // the guide: across the whole outline first, then across the flat, up and down across the strip by the balcony, and
    // up and down the flat's lower half by the kids' room
    let guide: [Point, Point] | null = null;
    let snapped = false;
    if (during(time, SWEEP_ACROSS) || during(time, SWEEP_MIDDLE)) {
      const cut = snapTo(pointerY, during(time, SWEEP_ACROSS) ? CUT_Y : MIDDLE_Y);
      guide = [
        [0, cut.value],
        [10.4, cut.value],
      ];
      snapped = cut.snapped;
    } else if (during(time, SWEEP_INNER)) {
      const cut = snapTo(pointerX, INNER_X);
      guide = [
        [cut.value, 0],
        [cut.value, MIDDLE_Y - INNER_WALL / 2],
      ];
      snapped = cut.snapped;
    } else if (during(time, SWEEP_LEFT) || during(time, SWEEP_RIGHT)) {
      const cut = snapTo(pointerX, during(time, SWEEP_LEFT) ? BALCONY_LEFT : BALCONY_RIGHT);
      guide = [
        [cut.value, STRIP_BOTTOM],
        [cut.value, HOME_TOP],
      ];
      snapped = cut.snapped;
    }
    setOpacity(parts.guide, guide ? 1 : 0);
    if (guide) {
      const [x1, y1] = toPaper(guide[0]);
      const [x2, y2] = toPaper(guide[1]);
      parts.guide.setAttribute('x1', x1.toFixed(2));
      parts.guide.setAttribute('y1', y1.toFixed(2));
      parts.guide.setAttribute('x2', x2.toFixed(2));
      parts.guide.setAttribute('y2', y2.toFixed(2));
      parts.guide.classList.toggle('snap', snapped);
    }
    const cutAt: Array<[string, Ms, Point]> = [
      ['cutAcross', CUT_ACROSS_CLICK, CUT_ACROSS_SEEN],
      ['cutMiddle', CUT_MIDDLE_CLICK, CUT_MIDDLE_SEEN],
      ['cutLeft', CUT_LEFT_CLICK, CUT_LEFT_SEEN],
      ['cutRight', CUT_RIGHT_CLICK, CUT_RIGHT_SEEN],
      ['cutInner', CUT_INNER_CLICK, CUT_INNER_SEEN],
    ];
    for (const [part, clickAt] of cutAt) {
      setOpacity(parts[part], presence(time, clickAt) * kept);
      setOpacity(parts[`${part}Fresh`], presence(time, clickAt, clickAt + 700) * kept);
    }
    // a piece beside the balcony: tinted with its bin up while the pointer is over it, gone with its walls at the bin's click
    const pieces: Array<[string, Ms, Ms]> = [
      ['Left', HOVER_LEFT_AT, TRASH_LEFT_CLICK],
      ['Right', HOVER_RIGHT_AT, TRASH_RIGHT_CLICK],
    ];
    for (const [side, hoverAt, trashAt] of pieces) {
      const left = 1 - presence(time, trashAt);
      // the piece comes back as the loop's result fades out, so the next loop starts from the outline again
      const there = Math.max(left, 1 - kept);
      setOpacity(parts[`extra${side}`], there);
      setOpacity(parts[`walls${side}A`], there);
      setOpacity(parts[`walls${side}B`], there);
      setOpacity(parts[`marked${side}`], presence(time, hoverAt, trashAt));
      setOpacity(parts[`trash${side}`], presence(time, hoverAt + 120, trashAt + 120));
      parts[`trash${side}Button`].classList.toggle('on', time >= trashAt - PRESS_MS / 2);
    }
    // one ring for the cuts and one for the bins: their clicks never overlap
    const lastCut = [...cutAt].reverse().find(([, clickAt]) => time >= clickAt) ?? cutAt[0];
    poseRipple(parts.ringCut, time, lastCut[1], lastCut[2]);
    const bins: Array<[Ms, Point]> = [
      [TRASH_RIGHT_CLICK, TRASH_RIGHT_SEEN],
      [TRASH_LEFT_CLICK, TRASH_LEFT_SEEN],
    ];
    const lastBin = bins.find(([clickAt]) => time >= clickAt) ?? bins[bins.length - 1];
    poseRipple(parts.ringPick, time, lastBin[0], lastBin[1]);
    posePointer(
      parts,
      SPLIT_POINTER,
      time,
      [
        ...cutAt.map(([, clickAt]) => pressAt(clickAt)),
        pressAt(TRASH_LEFT_CLICK),
        pressAt(TRASH_RIGHT_CLICK),
      ],
      kept,
    );
  },
};

// 3. Windows and doors: a click on a window drawn in a wall selects the wall; a click on “window” among the two choices
// puts the editor's window over the drawn one.
const OPEN_WINDOW_FROM = 7.9;
const OPEN_WINDOW_TO = 9.5;
const OPEN_WALL_SEEN = seen((OPEN_WINDOW_FROM + OPEN_WINDOW_TO) / 2, -OUTER_WALL / 2);
// the choice: a small panel above the click, a window button and a door button
const OPEN_CHOICE = {left: OPEN_WALL_SEEN[0] - 27, top: OPEN_WALL_SEEN[1] - 46, width: 54, height: 30};
const OPEN_WINDOW_BUTTON: Point = [OPEN_CHOICE.left + 14, OPEN_CHOICE.top + 15];
const OPEN_WALL_CLICK: Ms = 850;
const OPEN_CHOICE_CLICK: Ms = 1750;
const OPEN_LOOP: Ms = 4100;
const OPEN_POINTER: PointerKey[] = [
  key(0, POINTER_HOME),
  key(680, OPEN_WALL_SEEN),
  key(1000, OPEN_WALL_SEEN),
  key(1550, OPEN_WINDOW_BUTTON),
  key(1950, OPEN_WINDOW_BUTTON),
  key(2700, POINTER_EXIT),
];
const openClip: ClipDefinition = {
  loopMs: OPEN_LOOP,
  stillMs: 3400,
  markup: () => {
    const choice = OPEN_CHOICE;
    const [wallLeft, wallY] = toPaper([7, -OUTER_WALL / 2]); // the kitchen's outer wall
    const [wallRight] = toPaper([10.4, -OUTER_WALL / 2]);
    const [, glassY] = toPaper([0, -OUTER_WALL / 2]);
    const [glassFrom] = toPaper([OPEN_WINDOW_FROM, 0]);
    const [glassTo] = toPaper([OPEN_WINDOW_TO, 0]);
    const button = 24;
    const windowButtonLeft = choice.left + 3;
    const doorButtonLeft = choice.left + choice.width - 3 - button;
    const buttonTop = choice.top + 3;
    return (
      onPaper(
        allRoomsMarkup() +
          `<line data-part="selected" class="cl-selected" x1="${wallLeft.toFixed(2)}" x2="${wallRight.toFixed(2)}" y1="${wallY.toFixed(2)}" y2="${wallY.toFixed(2)}" style="opacity:0"/>` +
          // the editor's window: across the wall, with the glass's line
          `<g data-part="window" style="opacity:0">` +
          `<rect class="cl-window" ${planRect([OPEN_WINDOW_FROM, -OUTER_WALL], [OPEN_WINDOW_TO, 0])}/>` +
          `<line class="cl-window" x1="${glassFrom.toFixed(2)}" x2="${glassTo.toFixed(2)}" y1="${glassY.toFixed(2)}" y2="${glassY.toFixed(2)}"/>` +
          `</g>`,
      ) +
      // the two choices: a window and a door, as icons
      `<g data-part="choice" style="opacity:0">` +
      `<rect class="cl-panel" x="${choice.left}" y="${choice.top}" width="${choice.width}" height="${choice.height}" rx="6"/>` +
      `<rect data-part="windowButton" class="cl-choice" x="${windowButtonLeft}" y="${buttonTop}" width="${button}" height="${button}" rx="4"/>` +
      `<rect class="cl-choice" x="${doorButtonLeft}" y="${buttonTop}" width="${button}" height="${button}" rx="4"/>` +
      `<rect class="cl-icon" x="${windowButtonLeft + 6}" y="${buttonTop + 7}" width="12" height="10" rx="1"/>` +
      `<line class="cl-icon" x1="${windowButtonLeft + 12}" x2="${windowButtonLeft + 12}" y1="${buttonTop + 7}" y2="${buttonTop + 17}"/>` +
      `<path class="cl-icon" d="M${doorButtonLeft + 7} ${buttonTop + 18}V${buttonTop + 6}A11 11 0 0 1 ${doorButtonLeft + 18} ${buttonTop + 18}"/>` +
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
    poseRipple(parts.ringWall, time, OPEN_WALL_CLICK, OPEN_WALL_SEEN);
    poseRipple(parts.ringChoice, time, OPEN_CHOICE_CLICK, OPEN_WINDOW_BUTTON);
    posePointer(parts, OPEN_POINTER, time, [pressAt(OPEN_WALL_CLICK), pressAt(OPEN_CHOICE_CLICK)], kept);
  },
};

// 4. Link rooms: a click on a room, then a click on its Home Assistant area among the chips; the room shows its area.
const NAMES_ROOM_CLICK_SEEN = seen(7.5, 5.15);
const NAMES_PANEL = {left: 8, top: 50, width: 78, height: 70};
const NAMES_CHIP = {left: 13, width: 68, height: 16, tops: [56, 76, 96]};
const NAMES_CHIP_SEEN: Point = [
  NAMES_CHIP.left + NAMES_CHIP.width / 2,
  NAMES_CHIP.tops[0] + NAMES_CHIP.height / 2,
];
const NAMES_ROOM_CLICK: Ms = 800;
const NAMES_CHIP_CLICK: Ms = 1950;
const NAMES_LOOP: Ms = 4200;
const NAMES_POINTER: PointerKey[] = [
  key(0, POINTER_HOME),
  key(650, NAMES_ROOM_CLICK_SEEN),
  key(950, NAMES_ROOM_CLICK_SEEN),
  key(1750, NAMES_CHIP_SEEN),
  key(2150, NAMES_CHIP_SEEN),
  key(2900, POINTER_EXIT),
];
const CHIP_TEXT_SIZE = 7.5;
const namesClip: ClipDefinition = {
  loopMs: NAMES_LOOP,
  stillMs: 3500,
  markup: () => {
    const areas = [t('Living room'), t('Bedroom'), t('Kitchen')];
    const chips = areas
      .map(
        (area, i) =>
          `<g data-part="chip${i}" class="cl-chip">` +
          `<rect x="${NAMES_CHIP.left}" y="${NAMES_CHIP.tops[i]}" width="${NAMES_CHIP.width}" height="${NAMES_CHIP.height}" rx="8"/>` +
          `<text x="${NAMES_CHIP.left + NAMES_CHIP.width / 2}" y="${NAMES_CHIP.tops[i] + 10.8}" font-size="${CHIP_TEXT_SIZE}" textLength="${Math.min(NAMES_CHIP.width - 10, textWidth(area, CHIP_TEXT_SIZE)).toFixed(1)}" lengthAdjust="spacingAndGlyphs">${esc(area)}</text>` +
          `</g>`,
      )
      .join('');
    // the room's area once linked: a pill with its name under the drawn one
    const [tagX, tagY] = toPaper([7.5, 5.15]);
    const tagWidth = Math.min(80, textWidth(areas[0], CHIP_TEXT_SIZE) + 14);
    const tag =
      `<g data-part="tag" style="opacity:0">` +
      `<rect class="cl-tag" x="${(tagX - tagWidth / 2).toFixed(2)}" y="${(tagY - 7).toFixed(2)}" width="${tagWidth.toFixed(2)}" height="14" rx="7"/>` +
      `<text class="cl-tag-text" x="${tagX.toFixed(2)}" y="${(tagY + 2.6).toFixed(2)}" font-size="${CHIP_TEXT_SIZE}" textLength="${(tagWidth - 14).toFixed(1)}" lengthAdjust="spacingAndGlyphs">${esc(areas[0])}</text>` +
      `</g>`;
    return (
      onPaper(
        allRoomsMarkup() +
          `<path data-part="marked" class="cl-marked" d="${planPath(LIVING_ROOM.polygon)}" style="opacity:0"/>` +
          `<path data-part="linked" class="cl-new2" d="${planPath(LIVING_ROOM.polygon)}" style="opacity:0"/>` +
          tag,
      ) +
      `<g data-part="panel" style="opacity:0">` +
      `<rect class="cl-panel" x="${NAMES_PANEL.left}" y="${NAMES_PANEL.top}" width="${NAMES_PANEL.width}" height="${NAMES_PANEL.height}" rx="7"/>` +
      chips +
      `</g>` +
      RIPPLE_MARKUP('ringRoom') +
      RIPPLE_MARKUP('ringChip') +
      POINTER_MARKUP
    );
  },
  pose(parts, time) {
    const kept = beforeFadeOut(time, NAMES_LOOP);
    setOpacity(parts.marked, presence(time, NAMES_ROOM_CLICK, NAMES_CHIP_CLICK + 120));
    setOpacity(parts.panel, presence(time, NAMES_ROOM_CLICK + 120, NAMES_CHIP_CLICK + 650));
    setOpacity(parts.linked, presence(time, NAMES_CHIP_CLICK + 120) * kept);
    setOpacity(parts.tag, presence(time, NAMES_CHIP_CLICK + 120) * kept);
    parts.chip0.classList.toggle('on', time >= NAMES_CHIP_CLICK - PRESS_MS / 2);
    poseRipple(parts.ringRoom, time, NAMES_ROOM_CLICK, NAMES_ROOM_CLICK_SEEN);
    poseRipple(parts.ringChip, time, NAMES_CHIP_CLICK, NAMES_CHIP_SEEN);
    posePointer(parts, NAMES_POINTER, time, [pressAt(NAMES_ROOM_CLICK), pressAt(NAMES_CHIP_CLICK)], kept);
  },
};

// 5. Furniture: a sofa is taken from the catalog and dragged onto the living room.
const FURNITURE_CATALOG = {left: 8, top: 36, width: 50, height: 128};
const FURNITURE_TILE = {left: 12, width: 42, height: 36, tops: [40, 80, 120]};
const FURNITURE_GRAB: Point = [FURNITURE_TILE.left + FURNITURE_TILE.width / 2, FURNITURE_TILE.tops[0] + 18];
// where the sofa is dropped (metres): in the living room, its back to the hallway
export const SOFA_SPOT: Point = [7.5, 4.75];
const FURNITURE_DROP = seen(...SOFA_SPOT);
const FURNITURE_PRESS: Ms = 800;
const FURNITURE_RELEASE: Ms = 2050;
const FURNITURE_LOOP: Ms = 4100;
const FURNITURE_POINTER: PointerKey[] = [
  key(0, POINTER_HOME),
  key(650, FURNITURE_GRAB),
  key(FURNITURE_PRESS + 100, FURNITURE_GRAB),
  key(FURNITURE_RELEASE - 100, FURNITURE_DROP),
  key(FURNITURE_RELEASE + 150, FURNITURE_DROP),
  key(2800, POINTER_EXIT),
];
// A sofa seen from above, 2.1 × 0.95 m, centred on 0, 0: its back along the bottom, two arms and the seat's cushions.
const SOFA_HALF_WIDTH = (2.1 * SCALE) / 2;
const SOFA_HALF_DEPTH = (0.95 * SCALE) / 2;
const SOFA_MARKUP = (() => {
  const w = SOFA_HALF_WIDTH;
  const d = SOFA_HALF_DEPTH;
  const arm = 3;
  const back = 4.2;
  return (
    `<rect class="cl-item" x="${-w}" y="${-d}" width="${2 * w}" height="${2 * d}" rx="2.4"/>` +
    `<path class="cl-item-line" d="M${-w + arm} ${-d}V${d - back}H${w - arm}V${-d}M${-w} ${d - back}H${w}M0 ${-d}V${d - back}"/>`
  );
})();
const sofaPlaced = (): string => {
  const [x, y] = FURNITURE_DROP;
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${PAPER_TURN_DEGREES})">${SOFA_MARKUP}</g>`;
};
const furnitureClip: ClipDefinition = {
  loopMs: FURNITURE_LOOP,
  stillMs: 3400,
  markup: () => {
    const catalog = FURNITURE_CATALOG;
    const tile = FURNITURE_TILE;
    const tiles = tile.tops
      .map(
        (tileTop, i) =>
          `<rect ${i === 0 ? 'data-part="sofaTile" ' : ''}class="cl-tile" x="${tile.left}" y="${tileTop}" width="${tile.width}" height="${tile.height}" rx="5"/>`,
      )
      .join('');
    const middleX = tile.left + tile.width / 2;
    // the tiles' pictures: a sofa, a bed, a round table
    const sofaIcon = `<g transform="translate(${middleX} ${tile.tops[0] + 18}) scale(0.82)">${SOFA_MARKUP}</g>`;
    const bedIcon =
      `<rect class="cl-item" x="${middleX - 10}" y="${tile.tops[1] + 6}" width="20" height="24" rx="2"/>` +
      `<rect class="cl-item-line" x="${middleX - 7}" y="${tile.tops[1] + 8.5}" width="14" height="5" rx="1.5"/>`;
    const tableIcon = `<circle class="cl-item" cx="${middleX}" cy="${tile.tops[2] + 18}" r="9"/>`;
    return (
      onPaper(allRoomsMarkup()) +
      `<rect class="cl-panel" x="${catalog.left}" y="${catalog.top}" width="${catalog.width}" height="${catalog.height}" rx="7"/>` +
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
    // while dragged the sofa hangs at the pointer, see-through; dropped, it lands where it was let go, turned with the plan
    if (dragging) {
      placeAt(parts.sofa, pointer.x, pointer.y);
      setOpacity(parts.sofa, 0.6 * presence(time, FURNITURE_PRESS));
    } else {
      placeAt(parts.sofa, FURNITURE_DROP[0], FURNITURE_DROP[1], 1, PAPER_TURN_DEGREES);
      setOpacity(parts.sofa, placed ? kept : 0);
    }
    poseRipple(parts.ringDrop, time, FURNITURE_RELEASE, FURNITURE_DROP);
    posePointer(parts, FURNITURE_POINTER, time, [[FURNITURE_PRESS - 70, FURNITURE_RELEASE]], kept);
  },
};

// 6. Lights: a click places a light in the living room, a click confirms it, and the room glows.
const LIGHTS_LAMP: Point = [5.5, 5.85];
const LIGHTS_LAMP_SEEN = seen(...LIGHTS_LAMP);
const LIGHTS_CONFIRM = {left: LIGHTS_LAMP_SEEN[0] + 12, top: LIGHTS_LAMP_SEEN[1] - 34, width: 26, height: 18};
const LIGHTS_CONFIRM_SEEN: Point = [
  LIGHTS_CONFIRM.left + LIGHTS_CONFIRM.width / 2,
  LIGHTS_CONFIRM.top + LIGHTS_CONFIRM.height / 2,
];
const LIGHTS_PLACE_CLICK: Ms = 850;
const LIGHTS_CONFIRM_CLICK: Ms = 1950;
const LIGHTS_LOOP: Ms = 4200;
const LIGHTS_GLOW_METRES = 3.6;
const LIGHTS_POINTER: PointerKey[] = [
  key(0, POINTER_HOME),
  key(700, LIGHTS_LAMP_SEEN),
  key(1000, LIGHTS_LAMP_SEEN),
  key(1750, LIGHTS_CONFIRM_SEEN),
  key(2150, LIGHTS_CONFIRM_SEEN),
  key(2900, POINTER_EXIT),
];
const lightsClip: ClipDefinition = {
  loopMs: LIGHTS_LOOP,
  stillMs: 3500,
  markup: uid => {
    const confirm = LIGHTS_CONFIRM;
    const glowId = `clip-glow-${uid}`;
    const roomId = `clip-room-${uid}`;
    const [lampX, lampY] = toPaper(LIGHTS_LAMP);
    const tickLeft = confirm.left + 8;
    const tickMiddle = confirm.top + 9.4;
    return (
      `<defs><radialGradient id="${glowId}">` +
      `<stop offset="0" class="cl-glow-stop" style="stop-opacity:.8"/>` +
      `<stop offset="1" class="cl-glow-stop" style="stop-opacity:0"/>` +
      `</radialGradient>` +
      `<clipPath id="${roomId}"><path d="${planPath(LIVING_ROOM.polygon)}"/></clipPath></defs>` +
      onPaper(
        allRoomsMarkup() +
          // the light shines inside its room only
          `<circle data-part="glow" cx="${lampX.toFixed(2)}" cy="${lampY.toFixed(2)}" r="${(LIGHTS_GLOW_METRES * SCALE).toFixed(2)}" fill="url(#${glowId})" clip-path="url(#${roomId})" style="opacity:0"/>`,
      ) +
      sofaPlaced() +
      `<g data-part="lamp" style="opacity:0"><circle class="cl-lamp" r="4.6"/><circle class="cl-lamp-ring" r="7.6"/></g>` +
      `<g data-part="confirm" style="opacity:0"><rect class="cl-confirm" x="${confirm.left}" y="${confirm.top}" width="${confirm.width}" height="${confirm.height}" rx="5"/>` +
      `<path class="cl-confirm-tick" d="M${tickLeft} ${tickMiddle}l3.4 3.4 6.6-7"/></g>` +
      RIPPLE_MARKUP('ringPlace') +
      RIPPLE_MARKUP('ringConfirm') +
      POINTER_MARKUP
    );
  },
  pose(parts, time) {
    const kept = beforeFadeOut(time, LIGHTS_LOOP);
    // the light pops in where it was clicked
    const popIn = progress(time, LIGHTS_PLACE_CLICK, LIGHTS_PLACE_CLICK + APPEAR_MS * 2);
    placeAt(parts.lamp, LIGHTS_LAMP_SEEN[0], LIGHTS_LAMP_SEEN[1], mix(0.4, 1, popIn));
    setOpacity(parts.lamp, popIn * kept);
    setOpacity(parts.confirm, presence(time, LIGHTS_PLACE_CLICK + 200, LIGHTS_CONFIRM_CLICK + 600) * kept);
    parts.confirm.classList.toggle('on', time >= LIGHTS_CONFIRM_CLICK - PRESS_MS / 2);
    setOpacity(parts.glow, presence(time, LIGHTS_CONFIRM_CLICK + 100) * kept);
    poseRipple(parts.ringPlace, time, LIGHTS_PLACE_CLICK, LIGHTS_LAMP_SEEN);
    poseRipple(parts.ringConfirm, time, LIGHTS_CONFIRM_CLICK, LIGHTS_CONFIRM_SEEN);
    posePointer(
      parts,
      LIGHTS_POINTER,
      time,
      [pressAt(LIGHTS_PLACE_CLICK), pressAt(LIGHTS_CONFIRM_CLICK)],
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

/** A clip on the page: its overlay, its parts and what keeps it running. */
interface PlayingClip {
  svg: SVGSVGElement;
  parts: ClipParts;
  clip: ClipDefinition;
  /** Shared by every clip of this step, so a clip drawn again mid-loop goes on where it was. */
  epoch: number;
  /** The clip is on screen (shown, not collapsed, hidden or scrolled away). */
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

/** The step's clip: the plan photo with the overlay above it, playing by itself while on screen; null for a step without one. */
export function playStepClip(step: OnboardingStepId): HTMLElement | null {
  const clip = STEP_CLIPS[step];
  if (!clip) return null;
  // a clip taken off the page is let go
  for (const item of playing) if (!item.svg.isConnected) forget(item);
  addPageListeners();
  uidCounter += 1;
  const stage = el(
    `<div class="clip-stage"><img class="clip-photo" alt="" draggable="false" src="${planPhotoUrl()}">` +
      `<svg xmlns="http://www.w3.org/2000/svg" class="clip-svg" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" aria-hidden="true" focusable="false">${clip.markup(String(uidCounter))}</svg></div>`,
  );
  const svg = stage.querySelector('svg')!; // in the markup just written
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
  return stage;
}

// ---------- the larger view (phones) ----------

/** The clip over the page, as wide as the screen allows; Escape, a click on it or beside it, or its close button closes it
 * and the focus goes back to what opened it (D-096). */
export function openLargeClip(step: OnboardingStepId): void {
  const stage = playStepClip(step);
  if (!stage) return;
  const label = t('Watch how');
  const closeLabel = t('Close');
  const veil = el(
    `<div class="clip-pop" role="dialog" aria-modal="true" aria-label="${esc(label)}">` +
      `<div class="clip-pop-box"><button type="button" class="clip-pop-close ib" title="${esc(closeLabel)}" aria-label="${esc(closeLabel)}">${icon('x', 16)}</button></div>` +
      `</div>`,
  );
  const box = veil.querySelector<HTMLElement>('.clip-pop-box')!; // in the markup just written
  box.prepend(stage);
  document.body.append(veil);
  const held = holdFocus(veil, {onEscape: () => close()});
  function close(): void {
    held.release();
    veil.remove();
  }
  veil.onclick = () => close();
}
