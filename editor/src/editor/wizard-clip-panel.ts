// The step's clip in the coach panel (D-111, refining D-110). On a desktop the guided path's step card is one panel on the
// left: the progress line, the step's clip (large, 16 : 10), the hint and the buttons. This module holds the clip's part of it:
// the clip kept across redraws of the same step, the buttons that fold and unfold it, the remembered choice, and how wide the
// panel is and whether its clip is open for the room on the left.
// Folded, the panel keeps its progress line, hint and buttons (the step's buttons must stay at hand) and a “Watch how” button
// that unfolds it. The clip starts open unless the user folded it (the choice is remembered). Where even the narrowest panel with its clip does not fit above the toolbar,
// “Watch how” opens the clip over the page instead. On a phone and a tablet held upright the card stays at the bottom and its
// “Watch how” pill opens the clip over the page.
// The user may widen or narrow the panel by its bottom right corner (the clip grows with it); the width is remembered, and a
// double click on the corner gives the automatic width back. The panel also moves by its progress line, and stays where it was
// put; a double click on the line puts it back in its own place.
import {t} from '../i18n/i18n.ts';
import {el, esc} from './ui.ts';
import {icon} from './icons.ts';
import {openLargeClip, playStepClip} from './wizard-clips.ts';
import type {OnboardingStepId} from '../core/types.ts';

/** A box in the container's coordinates (px). */
export interface ClipBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The room on the left for the coach panel: its top left corner, how far down it may reach, what it holds besides the clip. */
export interface CoachRoom {
  left: number;
  top: number;
  containerWidth: number;
  /** The panel's bottom stays above this (the toolbar, the test panel, the screen's edge). */
  bottomLimit: number;
  /** The panel's height without its clip: the progress line, the hint and the buttons. */
  cardHeight: number;
}

/** How the clip is shown in the panel: open, folded by the user, or folded because no clip fits. */
export type ClipState = 'open' | 'folded' | 'no-room';

/** The panel's width and its clip's state. */
export interface CoachFit {
  width: number;
  clip: ClipState;
}

/** The user's choice: the clip open or folded; null until they choose. */
export type ClipChoice = 'open' | 'closed' | null;

/** Where the card is a panel on the left; narrower, it stays at the bottom (styles.css uses the same width). */
export const DOCK_QUERY = '(min-width: 761px)';

const CHOICE_KEY = 'home-twin-editor:step-clip';
const WIDTH_KEY = 'home-twin-editor:coach-width';
const SPOT_KEY = 'home-twin-editor:coach-spot';
const DETAIL_KEY = 'home-twin-editor:step-detail';
// The panel's width: about 30 % of the screen, from 360 to 420 px; narrower, down to 300 px, only to keep above the toolbar.
const WIDTH_SHARE = 0.3;
const WIDEST = 420;
const PREFERRED_NARROWEST = 360;
const NARROWEST = 300;
const WIDTH_STEP = 20;
// Widened by hand: up to this, and up to this share of the screen.
const WIDEST_BY_HAND = 960;
const BY_HAND_SHARE = 0.6;
// The clip is 16 : 10, as wide as the panel's inside; the panel's padding and border on each side, the gap above the clip.
const CLIP_RATIO = 16 / 10;
const PANEL_INSET = 13;
const CLIP_GAP = 8;
// Kept free between the panel and the screen's edge.
const GAP = 12;

// ---------- the remembered choice ----------

export function storedChoice(): ClipChoice {
  try {
    const saved = localStorage.getItem(CHOICE_KEY);
    return saved === 'open' || saved === 'closed' ? saved : null;
  } catch {
    return null; // storage blocked: as if never chosen
  }
}

function storeChoice(choice: 'open' | 'closed'): void {
  try {
    localStorage.setItem(CHOICE_KEY, choice);
  } catch {
    // storage blocked: the choice lasts until the page is closed only
  }
}

/** The width the user set by the corner, px; null: automatic. Read from storage once, then kept here (also while dragging). */
let handWidth: number | null | undefined;

export function coachWidth(): number | null {
  if (handWidth !== undefined) return handWidth;
  handWidth = null;
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    if (saved > 0) handWidth = saved;
  } catch {
    // storage blocked: automatic width
  }
  return handWidth;
}

function setCoachWidth(width: number | null, store: boolean): void {
  handWidth = width;
  if (!store) return;
  try {
    if (width == null) localStorage.removeItem(WIDTH_KEY);
    else localStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    // storage blocked: the width lasts until the page is closed only
  }
}

/** A place in the work area, px from its top left corner. */
export interface CoachSpot {
  x: number;
  y: number;
}

/** Where the user moved the panel by its progress line; null: its own place. Read from storage once, then kept here. */
let handSpot: CoachSpot | null | undefined;

export function coachSpot(): CoachSpot | null {
  if (handSpot !== undefined) return handSpot;
  handSpot = null;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SPOT_KEY) || 'null');
    const spot = saved as Partial<CoachSpot> | null;
    if (spot && Number.isFinite(spot.x) && Number.isFinite(spot.y)) handSpot = {x: spot.x!, y: spot.y!};
  } catch {
    // storage blocked or not a place: its own place
  }
  return handSpot;
}

function setCoachSpot(spot: CoachSpot | null, store: boolean): void {
  handSpot = spot;
  if (!store) return;
  try {
    if (spot == null) localStorage.removeItem(SPOT_KEY);
    else localStorage.setItem(SPOT_KEY, JSON.stringify(spot));
  } catch {
    // storage blocked: the place lasts until the page is closed only
  }
}

/** How far the pointer goes before a press on the progress line becomes a drag (a click on a step's dot stays a click). */
const DRAG_START_PX = 4;

/**
 * The panel on the left moves by its progress line (the step dots and the step's name): dragged, it stays where it was put, on
 * every step and after a reload; a double click on the line puts it back in its own place. The card is the banner, which stays
 * the same element across steps, so this is set up once.
 */
export function makeCoachMovable(card: HTMLElement, relayout: () => void): void {
  const handleOf = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element) || !card.classList.contains('docked')) return null;
    // a step's dot that can be opened stays a button; the ones that cannot (not reached yet) are part of the line
    if (target.closest('button:not(:disabled),a,input')) return null;
    return target.closest<HTMLElement>('.path');
  };
  card.addEventListener('pointerdown', event => {
    const handle = handleOf(event.target);
    if (!handle || event.button !== 0) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = card.offsetLeft;
    const startTop = card.offsetTop;
    let dragging = false;
    const move = (moveEvent: PointerEvent): void => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) < DRAG_START_PX) return;
      dragging = true;
      card.classList.add('moving');
      setCoachSpot({x: Math.round(startLeft + dx), y: Math.round(startTop + dy)}, false);
      relayout();
    };
    const up = (): void => {
      handle.removeEventListener('pointermove', move);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
        handle.removeEventListener(type, up);
      card.classList.remove('moving');
      if (!dragging) return;
      // keep the place the panel took (it stays inside the work area)
      setCoachSpot({x: card.offsetLeft, y: card.offsetTop}, true);
      relayout();
    };
    handle.addEventListener('pointermove', move);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      handle.addEventListener(type, up);
  });
  card.addEventListener('dblclick', event => {
    if (!handleOf(event.target)) return;
    setCoachSpot(null, true);
    relayout();
  });
}

/** Whether the step's longer hint is open in the docked panel: open unless the user folded it (one choice for every step). */
export function detailWanted(): boolean {
  try {
    return localStorage.getItem(DETAIL_KEY) !== 'closed';
  } catch {
    return true; // storage blocked: as if never chosen
  }
}

export function storeDetail(open: boolean): void {
  try {
    localStorage.setItem(DETAIL_KEY, open ? 'open' : 'closed');
  } catch {
    // storage blocked: the choice lasts until the page is closed only
  }
}

// ---------- the panel's fit ----------

/** The clip's height with the gap above it, for a panel this wide. */
const clipHeight = (width: number): number => Math.round((width - 2 * PANEL_INSET) / CLIP_RATIO) + CLIP_GAP;

/** How wide the panel is and whether its clip is open: the widest from the preferred width down whose clip fits above the
 * bottom limit; open unless the user folded it. */
export function fitCoachPanel(
  room: CoachRoom,
  choice: ClipChoice = storedChoice(),
  byHand: number | null = coachWidth(),
): CoachFit {
  let preferred = Math.round(
    Math.min(WIDEST, Math.max(PREFERRED_NARROWEST, room.containerWidth * WIDTH_SHARE)),
  );
  if (byHand != null) {
    const handLimit = Math.min(WIDEST_BY_HAND, room.containerWidth * BY_HAND_SHARE);
    preferred = Math.round(Math.max(NARROWEST, Math.min(handLimit, byHand)));
  }
  const widest = Math.max(NARROWEST, Math.min(preferred, room.containerWidth - room.left - GAP));
  let fitting: number | null = null;
  for (let width = widest; width >= NARROWEST; width -= WIDTH_STEP) {
    if (room.top + room.cardHeight + clipHeight(width) <= room.bottomLimit) {
      fitting = width;
      break;
    }
  }
  if (fitting == null) return {width: widest, clip: 'no-room'};
  const wantsOpen = choice !== 'closed';
  return wantsOpen ? {width: fitting, clip: 'open'} : {width: widest, clip: 'folded'};
}

// ---------- the corner that resizes the panel ----------

/** The panel's bottom right corner (styles.css shows it only on the docked panel): dragging sets the width, a double click gives
 * the automatic width back. relayout places the panel again with the new width. */
export function coachResizeCorner(relayout: () => void): HTMLElement {
  const corner = el(`<div class="coach-resize" title="${esc(t('Drag to resize'))}"></div>`);
  corner.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    corner.setPointerCapture(event.pointerId);
    const panel = corner.parentElement;
    const startX = event.clientX;
    const startWidth = panel ? panel.offsetWidth : (coachWidth() ?? WIDEST);
    corner.classList.add('drag');
    const move = (moveEvent: PointerEvent): void => {
      setCoachWidth(Math.round(startWidth + moveEvent.clientX - startX), false);
      relayout();
    };
    const up = (): void => {
      corner.removeEventListener('pointermove', move);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
        corner.removeEventListener(type, up);
      corner.classList.remove('drag');
      // keep the width the panel took (it may be narrower than dragged: short of height, or past the limit)
      const width = corner.parentElement?.offsetWidth;
      setCoachWidth(width || coachWidth(), true);
      relayout();
    };
    corner.addEventListener('pointermove', move);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      corner.addEventListener(type, up);
  });
  corner.addEventListener('dblclick', event => {
    event.stopPropagation();
    setCoachWidth(null, true);
    relayout();
  });
  return corner;
}

// ---------- the clip and its buttons in the card ----------

/** The clip shown last, kept while the card is redrawn for the same step. */
let shown: {step: OnboardingStepId; block: HTMLElement} | null = null;

/** Whether the clip shown last is still on the page; asked before the card is redrawn. A clip off the page may have been let
 * go by the player, so it is made again. */
export function clipStillShown(): boolean {
  return !!shown?.block.isConnected;
}

/** The step's clip for the card, or null for a step without one. The same step's clip goes on where it was: kept when the card
 * is only redrawn (wasShown, from clipStillShown before the redraw), else made again on the step's clock. */
export function coachClip(step: OnboardingStepId, wasShown: boolean): HTMLElement | null {
  if (shown?.step === step && wasShown) return shown.block;
  const stage = playStepClip(step);
  if (!stage) {
    shown = null;
    return null;
  }
  const block = el('<div class="coach-clip"></div>');
  block.append(stage);
  shown = {step, block};
  return block;
}

/** The buttons that fold and unfold the clip, for the card's progress line. The card's classes (set where it is placed) say
 * which one shows: clip-open — “Collapse”; else “Watch how”, which with clip-no-room opens the clip over the page. Folding
 * moves the focus to “Watch how” and unfolding back to “Collapse”, so the keyboard never loses it (D-096). */
export function clipFoldButtons(step: OnboardingStepId, replace: () => void): HTMLElement[] {
  const watchLabel = t('Watch how');
  const collapseLabel = t('Collapse');
  const unfold = el<HTMLButtonElement>(
    `<button type="button" class="coach-unfold">${icon('play', 12)}<span>${esc(watchLabel)}</span></button>`,
  );
  const fold = el<HTMLButtonElement>(
    `<button type="button" class="ib coach-fold" title="${esc(collapseLabel)}" aria-label="${esc(collapseLabel)}">${icon('minus', 15)}</button>`,
  );
  unfold.onclick = () => {
    const card = unfold.closest('.banner');
    if (card?.classList.contains('clip-no-room')) {
      openLargeClip(step);
      return;
    }
    storeChoice('open');
    replace();
    fold.focus({preventScroll: true});
  };
  fold.onclick = () => {
    storeChoice('closed');
    replace();
    unfold.focus({preventScroll: true});
  };
  return [unfold, fold];
}

/** The card's “Watch how” pill where the card is at the bottom (styles.css shows it only there): it opens the clip over the page. */
export function stepClipCardPill(step: OnboardingStepId): HTMLElement {
  const label = t('Watch how');
  const pill = el(
    `<button type="button" class="wizard-watch" aria-haspopup="dialog">${icon('play', 13)}<span>${esc(label)}</span></button>`,
  );
  pill.onclick = () => openLargeClip(step);
  return pill;
}
