// The step's clip in the coach panel (D-111, refining D-110). On a desktop the guided path's step card is one panel on the
// left: the progress line, the step's clip (large, 16 : 10), the hint and the buttons. This module holds the clip's part of it:
// the clip kept across redraws of the same step, the buttons that fold and unfold it, the remembered choice, and how wide the
// panel is and whether its clip is open for the room on the left.
// Folded, the panel keeps its progress line, hint and buttons (the step's buttons must stay at hand) and a “Watch how” button
// that unfolds it. With no stored choice the clip starts open only where the plan keeps enough room beside the panel (not at
// 1024 px, nor beside the open catalog on a laptop). Where even the narrowest panel with its clip does not fit above the toolbar,
// “Watch how” opens the clip over the page instead. On a phone and a tablet held upright the card stays at the bottom and its
// “Watch how” pill opens the clip over the page.
// The user may widen or narrow the panel by its bottom right corner (the clip grows with it); the width is remembered, and a
// double click on the corner gives the automatic width back.
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
  /** Where the plan is on screen, if there is one: with no stored choice a clip that would cover it starts folded. */
  planBox: ClipBox | null;
}

/** How the clip is shown in the panel: open, folded by the user or the rule, or folded because no clip fits. */
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
// Without a stored choice the clip starts open only if this much of the screen is left beside the panel for the plan.
const PLAN_ROOM_TO_OPEN = 700;

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

// ---------- the panel's fit ----------

/** The clip's height with the gap above it, for a panel this wide. */
const clipHeight = (width: number): number => Math.round((width - 2 * PANEL_INSET) / CLIP_RATIO) + CLIP_GAP;

/** Whether a panel this wide with its clip open leaves the plan enough room beside it and covers none of it (the plan may
 * have been fitted while the panel was elsewhere, e.g. before the catalog opened beside it). */
function leavesPlanFree(room: CoachRoom, width: number): boolean {
  const right = room.left + width;
  if (room.containerWidth - right < PLAN_ROOM_TO_OPEN) return false;
  const plan = room.planBox;
  if (!plan) return true;
  const panelBottom = room.top + room.cardHeight + clipHeight(width);
  const coversAcross = plan.left < right + GAP && plan.left + plan.width > room.left;
  const coversDown = plan.top < panelBottom && plan.top + plan.height > room.top;
  return !(coversAcross && coversDown);
}

/** How wide the panel is and whether its clip is open: the widest from the preferred width down whose clip fits above the
 * bottom limit; the user's choice, or with none the plan's room, says whether it is open. */
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
  const wantsOpen = choice ? choice === 'open' : leavesPlanFree(room, fitting);
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
