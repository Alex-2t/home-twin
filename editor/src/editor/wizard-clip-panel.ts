// The step's clip beside the plan (D-110, refining D-109): a floating panel on the left, under the side panel's header (or
// right of the open side panel), 300–420 px wide, with “Watch how” and a collapse button. Collapsed, it is a small pill in
// the same place that opens it again; the choice is remembered. With no stored choice it starts open only where the plan
// keeps enough room beside it (not at 1024 px, nor beside the open catalog on a laptop). It never covers the step card or
// the toolbar below: it gets narrower, and where even the narrowest does not fit it stays a pill, which then opens the clip
// over the page. On a phone there is no panel: the card has a “Watch how” pill that opens the clip full width.
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

/** Where the panel may go: its top left corner, the container's size, and what it must keep clear of. */
export interface ClipRoom {
  left: number;
  top: number;
  containerWidth: number;
  containerHeight: number;
  keepClear: ClipBox[];
  /** Where the plan is on screen, if there is one: an open panel that would cover it starts as a pill (no stored choice). */
  planBox: ClipBox | null;
  /** Nothing of the clip is shown (the 3D preview is open). */
  hidden: boolean;
}

/** The user's choice: the panel open or collapsed; null until they choose. */
type PanelChoice = 'open' | 'closed' | null;

const CHOICE_KEY = 'home-twin-editor:step-clip';
const PHONE_QUERY = '(max-width: 600px)';
// The panel's width: about 30 % of the screen, from 360 to 420 px; narrower, down to 300 px, only to keep above the card.
const WIDTH_SHARE = 0.3;
const WIDEST = 420;
const PREFERRED_NARROWEST = 360;
const NARROWEST = 300;
const WIDTH_STEP = 20;
// The clip is 16 : 10; the header above it and the panel's padding and border.
const CLIP_RATIO = 16 / 10;
const HEAD_HEIGHT = 32;
const PANEL_PADDING = 6;
// Kept free between the panel and what it must not cover.
const GAP = 12;
// Without a stored choice the panel starts open only if this much of the screen is left beside it for the plan.
const PLAN_ROOM_TO_OPEN = 700;

/** The panel and the pill once made, and what they show now. */
interface ClipUi {
  container: HTMLElement;
  panel: HTMLElement;
  body: HTMLElement;
  hideButton: HTMLButtonElement;
  pill: HTMLButtonElement;
  step: OnboardingStepId | null;
  room: ClipRoom | null;
  /** The panel did not fit at the last placing: the pill opens the clip over the page instead. */
  noRoom: boolean;
  /** How far from the container's left the open panel reaches, with its gap; 0 when it is not open. */
  inset: number;
}

let ui: ClipUi | null = null;

// ---------- the remembered choice ----------

function storedChoice(): PanelChoice {
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

// ---------- making the panel ----------

function makeUi(container: HTMLElement): ClipUi {
  const label = t('Watch how');
  const collapse = t('Collapse');
  const panel = el(
    `<section class="clip-panel" aria-label="${esc(label)}" hidden>` +
      `<div class="clip-panel-head"><span class="clip-panel-title">${icon('play', 13)}${esc(label)}</span>` +
      `<button type="button" class="ib clip-panel-hide" title="${esc(collapse)}" aria-label="${esc(collapse)}">${icon('minus', 16)}</button></div>` +
      `<div class="clip-panel-body"></div></section>`,
  );
  const pill = el<HTMLButtonElement>(
    `<button type="button" class="clip-pill glass" hidden>${icon('play', 13)}<span>${esc(label)}</span></button>`,
  );
  container.append(panel, pill);
  const made: ClipUi = {
    container,
    panel,
    body: panel.querySelector<HTMLElement>('.clip-panel-body')!, // in the markup just written
    hideButton: panel.querySelector<HTMLButtonElement>('.clip-panel-hide')!, // in the markup just written
    pill,
    step: null,
    room: null,
    noRoom: false,
    inset: 0,
  };
  // collapsing moves the focus to the pill and opening it back to the collapse button, so the keyboard never loses it (D-096)
  made.hideButton.onclick = () => {
    storeChoice('closed');
    replace();
    if (!made.pill.hidden) made.pill.focus({preventScroll: true});
  };
  made.pill.onclick = () => {
    if (made.noRoom) {
      if (made.step) openLargeClip(made.step);
      return;
    }
    storeChoice('open');
    replace();
    if (!made.panel.hidden) made.hideButton.focus({preventScroll: true});
  };
  return made;
}

/** Places the panel again where it was last given room. */
function replace(): void {
  if (ui?.room) placeStepClip(ui.room);
}

// ---------- what the editor calls ----------

/** Shows the step's clip beside the plan, or none (null: not a main step of the guided path). The clip goes on where it was
 * when the same step's card is drawn again. Call placeStepClip after it. */
export function showStepClip(container: HTMLElement, step: OnboardingStepId | null): void {
  if (!ui && !step) return;
  ui ??= makeUi(container);
  if (step === ui.step) return;
  ui.step = step;
  ui.body.replaceChildren();
  const stage = step ? playStepClip(step) : null;
  if (stage) ui.body.append(stage);
  else ui.step = null;
  if (!ui.step) {
    ui.panel.hidden = true;
    ui.pill.hidden = true;
    ui.inset = 0;
  }
}

/** The widest panel from the preferred width down that fits above everything it must keep clear of; null if none fits. */
function fittingWidth(room: ClipRoom): number | null {
  const preferred = Math.round(
    Math.min(WIDEST, Math.max(PREFERRED_NARROWEST, room.containerWidth * WIDTH_SHARE)),
  );
  for (let width = preferred; width >= NARROWEST; width -= WIDTH_STEP) {
    const right = room.left + width;
    const height = panelHeight(width);
    let bottomLimit = room.containerHeight - GAP;
    for (const box of room.keepClear) {
      const overlapsAcross = box.left < right + GAP && box.left + box.width > room.left - GAP;
      const below = box.top + box.height > room.top;
      if (overlapsAcross && below) bottomLimit = Math.min(bottomLimit, box.top - GAP);
    }
    const fitsAcross = right + GAP <= room.containerWidth;
    if (fitsAcross && room.top + height <= bottomLimit) return width;
  }
  return null;
}

/** Whether an open panel this wide leaves the plan enough room beside it and covers none of it (the plan may have been
 * fitted while the panel was elsewhere, e.g. before the catalog opened beside it). */
function leavesPlanFree(room: ClipRoom, width: number): boolean {
  const right = room.left + width;
  if (room.containerWidth - right < PLAN_ROOM_TO_OPEN) return false;
  const plan = room.planBox;
  if (!plan) return true;
  const coversAcross = plan.left < right + GAP && plan.left + plan.width > room.left;
  const coversDown = plan.top < room.top + panelHeight(width) && plan.top + plan.height > room.top;
  return !(coversAcross && coversDown);
}

/** The panel's height for its width: the header and the 16 : 10 clip. */
const panelHeight = (width: number): number =>
  HEAD_HEIGHT + Math.round((width - 2 * PANEL_PADDING) / CLIP_RATIO) + PANEL_PADDING;

/** Puts the panel or its pill where the room given allows. */
export function placeStepClip(room: ClipRoom): void {
  if (!ui) return;
  ui.room = room;
  const phone = matchMedia(PHONE_QUERY).matches;
  if (!ui.step || phone || room.hidden) {
    ui.panel.hidden = true;
    ui.pill.hidden = true;
    ui.inset = 0;
    return;
  }
  const width = fittingWidth(room);
  ui.noRoom = width == null;
  const choice = storedChoice();
  const wantsOpen = choice ? choice === 'open' : width != null && leavesPlanFree(room, width);
  const open = wantsOpen && width != null;
  ui.panel.hidden = !open;
  ui.pill.hidden = open;
  ui.pill.setAttribute('aria-expanded', 'false');
  ui.pill.setAttribute('aria-haspopup', ui.noRoom ? 'dialog' : 'false');
  const target = open ? ui.panel : ui.pill;
  target.style.left = room.left + 'px';
  target.style.top = room.top + 'px';
  if (open) ui.panel.style.width = width + 'px';
  ui.inset = open ? room.left + width + GAP : 0;
}

/** How far from the container's left the open panel reaches (with its gap), for fitting the plan beside it; 0 if closed. */
export function stepClipInset(): number {
  return ui?.inset ?? 0;
}

/** The card's “Watch how” pill for a phone (styles.css shows it only there): it opens the clip full width. */
export function stepClipCardPill(step: OnboardingStepId): HTMLElement {
  const label = t('Watch how');
  const pill = el(
    `<button type="button" class="wizard-watch" aria-haspopup="dialog">${icon('play', 13)}<span>${esc(label)}</span></button>`,
  );
  pill.onclick = () => openLargeClip(step);
  return pill;
}
