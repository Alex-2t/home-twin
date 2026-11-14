// The keyboard alone (D-096): every place of the first-run path can be reached with Tab, worked with Enter, Space and the
// arrows, and closed with Escape. The pieces shared by the editor's screens live here:
//   - which kind of input came last, so focus is moved for keyboard users only and the mouse sees nothing new;
//   - which of the editor's own keys a focused element lets through;
//   - a dialog that holds the focus: the page under it is inert, Escape closes it, the focus goes back where it came from;
//   - roving focus: a long list or grid is one Tab stop, the arrows move inside it.

// ---------- which input came last ----------

let lastInputWasKeyboard = false;

/** Starts following the last kind of input: a key (not a lone modifier) or a pointer. */
export function watchInputKind(): void {
  addEventListener(
    'keydown',
    e => {
      if (!MODIFIER_KEYS.has(e.key)) lastInputWasKeyboard = true;
    },
    true,
  );
  addEventListener(
    'pointerdown',
    () => {
      lastInputWasKeyboard = false;
    },
    true,
  );
}

// A modifier pressed alone (Shift before a click) is not keyboard use.
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

/** The last input was a key: moving the focus will not surprise a mouse user. */
export function keyboardInUse(): boolean {
  return lastInputWasKeyboard;
}

// ---------- the editor's own keys and the focused element ----------

/** What has the focus when a key is pressed, as far as the editor's own keys are concerned. */
export type KeyTarget = 'field' | 'popup' | 'control' | 'page';

// Typing goes into these: no editor key works there.
const FIELD_SELECTOR = 'input,select,textarea,[contenteditable]';
// A menu, a popup or a dialog has its own keys (Escape closes it, the arrows move in it).
const POPUP_SELECTOR = '.menu,.pop,[role=dialog],.keys,.aib';
// A control a keyboard user may have focused: a button, a link, a list row.
const CONTROL_SELECTOR = 'button,summary,a,[tabindex]';
// The keys a focused control uses itself: activation, moving the focus, moving in a list.
const CONTROL_KEYS = new Set([
  'Enter',
  ' ',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
]);

/** Sorts the focused element: a field, something inside a popup, a control, or the page itself (the plan, the body). */
export function keyTargetOf(target: Element | null): KeyTarget {
  if (!target?.closest) return 'page';
  if (target.closest(FIELD_SELECTOR)) return 'field';
  if (target.closest(POPUP_SELECTOR)) return 'popup';
  if (target.closest(CONTROL_SELECTOR) && target.tagName !== 'CANVAS') return 'control';
  return 'page';
}

/**
 * Whether one of the editor's keys (V, R, Delete, Escape, ⌘Z…) works with this focus. A focused button keeps Enter, Space,
 * Tab and the arrows for itself, and everything else still works: a keyboard user's focus is always on some button.
 */
export function editorKeyAllowed(target: KeyTarget, key: string): boolean {
  if (target === 'field' || target === 'popup') return false;
  if (target === 'control') return !CONTROL_KEYS.has(key);
  return true;
}

// ---------- a dialog that holds the focus ----------

/** A dialog holding the focus; release() gives it back. */
export interface HeldFocus {
  release(): void;
}

/** How a dialog takes the focus: the element to focus first, what Escape does (nothing when absent). */
export interface HoldFocusOptions {
  first?: HTMLElement | null;
  onEscape?: () => void;
}

// What can take the focus inside a dialog, in the order Tab goes.
const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type=hidden])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]',
]
  .map(selector => `${selector}:not([tabindex="-1"])`)
  .join(',');
// Everything that takes the focus, Tab stop or not (a roving list's other items): where a focus was, counted in these.
const FOCUS_TAKERS = FOCUSABLE.replaceAll(':not([tabindex="-1"])', '');

// Dialogs holding the focus now, the newest last: only the newest is alive, everything else on the page is inert.
const heldDialogs: HTMLElement[] = [];
// Marks an element this module made inert, so it is only ever un-made by it.
const HELD_MARK = 'data-held-inert';

/** The first element in root a keyboard user can reach, if any. */
export function firstFocusable(root: ParentNode): HTMLElement | null {
  return reachable(root)[0] || null;
}

/**
 * Makes everything on the page but the newest dialog inert: at every level from the dialog up to the body, the elements
 * beside it (a dialog inside the AI build's page leaves the rest of that page asleep too). What was made inert for an older
 * dialog wakes when it should not sleep any more. Run on every dialog opened and closed, in any order.
 */
function syncInert(): void {
  const top = heldDialogs.at(-1);
  const sleepers = new Set<HTMLElement>();
  for (
    let node: HTMLElement | null = top || null;
    node && node !== document.body;
    node = node.parentElement
  ) {
    for (const sibling of node.parentElement?.children || []) {
      const asleep = sibling instanceof HTMLElement && sibling !== node && sibling.tagName !== 'SCRIPT';
      // a tooltip, and a notice marked data-awake (the panel's “Home Twin was updated”, frontend-build.ts), stay alive over dialogs
      const awake =
        sibling instanceof HTMLElement &&
        (sibling.classList.contains('tip') || sibling.hasAttribute('data-awake'));
      if (asleep && !awake) sleepers.add(sibling);
    }
  }
  for (const element of document.querySelectorAll<HTMLElement>(`[${HELD_MARK}]`)) {
    if (sleepers.has(element)) continue;
    element.inert = false;
    element.removeAttribute(HELD_MARK);
  }
  for (const element of sleepers) {
    if (element.inert) continue;
    element.inert = true;
    element.setAttribute(HELD_MARK, '');
  }
}

/**
 * The page under a dialog (or a full-screen page such as the start screen) sleeps while it is open: Tab stays inside, a
 * keyboard user lands on its first control (a mouse user's focus is only put on the dialog itself, which shows nothing),
 * Escape does onEscape, and on release the focus goes back to what had it before, if it is still there.
 */
export function holdFocus(dialog: HTMLElement, options: HoldFocusOptions = {}): HeldFocus {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  heldDialogs.push(dialog);
  syncInert();
  if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
  // styles.css: the dialog itself shows no focus ring when it holds the focus for a mouse user
  dialog.setAttribute('data-holds-focus', '');
  const first = options.first || (keyboardInUse() ? firstFocusable(dialog) : null);
  (first || dialog).focus({preventScroll: true});
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !options.onEscape) return;
    e.preventDefault();
    e.stopPropagation();
    options.onEscape();
  };
  dialog.addEventListener('keydown', onKey);
  let released = false;
  return {
    release(): void {
      if (released) return;
      released = true;
      dialog.removeEventListener('keydown', onKey);
      const at = heldDialogs.indexOf(dialog);
      if (at >= 0) heldDialogs.splice(at, 1);
      syncInert();
      const active = document.activeElement;
      const focusLeftWithDialog = !active || active === document.body || dialog.contains(active);
      if (focusLeftWithDialog && opener?.isConnected && !opener.closest('[inert]'))
        opener.focus({preventScroll: true});
    },
  };
}

// ---------- roving focus ----------

/**
 * Where the arrows take the focus in a list or grid of count items: the index to go to, or null when the key does not move
 * it. A list moves with Up and Down; a grid of `columns` also with Left and Right. Home and End go to the ends; the ends
 * stop the movement rather than wrap.
 */
export function nextRovingIndex(index: number, count: number, key: string, columns = 1): number | null {
  if (count <= 0) return null;
  const grid = columns > 1;
  const steps: Record<string, number> = {ArrowDown: columns, ArrowUp: -columns};
  if (grid) {
    steps.ArrowRight = 1;
    steps.ArrowLeft = -1;
  }
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = steps[key];
  if (step === undefined) return null;
  return Math.max(0, Math.min(count - 1, index + step));
}

/** How a roving group lays out its items: a list (one column) or a grid (columns read from where the items stand). */
export interface RovingOptions {
  grid?: boolean;
}

// The groups that already listen for their keys (a group re-rendered keeps its listener).
const rovingGroups = new WeakMap<HTMLElement, {selector: string; grid: boolean}>();

/** How many items of a grid stand in its first row. */
function columnsOf(items: HTMLElement[]): number {
  const top = items[0]?.offsetTop;
  let columns = 0;
  while (columns < items.length && items[columns].offsetTop === top) columns++;
  return Math.max(1, columns);
}

/** The group's items, in order: the visible ones matching its selector, directly or deeper. */
function rovingItems(group: HTMLElement, selector: string): HTMLElement[] {
  return [...group.querySelectorAll<HTMLElement>(selector)].filter(
    item => item.offsetWidth || item.offsetHeight,
  );
}

/**
 * One Tab stop for the items of a group: the selected item (.sel, .on, aria-selected), else the one focused last, else the
 * first. The arrows (and Home, End) move between items; Enter and Space on an item that is not a button press it. Call it
 * again after the items are re-rendered: the listener is added once per group.
 */
export function rovingFocus(group: HTMLElement, selector: string, options: RovingOptions = {}): void {
  const items = [...group.querySelectorAll<HTMLElement>(selector)];
  if (!items.length) return;
  const chosen =
    items.find(item => item.matches('.sel,.on,[aria-selected=true]')) ||
    items.find(item => item.dataset.rovingLast !== undefined) ||
    items[0];
  for (const item of items) item.tabIndex = item === chosen ? 0 : -1;
  if (rovingGroups.has(group)) {
    rovingGroups.set(group, {selector, grid: !!options.grid});
    return;
  }
  rovingGroups.set(group, {selector, grid: !!options.grid});
  group.addEventListener('focusin', e => {
    const settings = rovingGroups.get(group)!; // set just above
    const item = (e.target as Element).closest<HTMLElement>(settings.selector);
    if (!item || !group.contains(item)) return;
    for (const other of group.querySelectorAll<HTMLElement>(settings.selector)) {
      other.tabIndex = other === item ? 0 : -1;
      delete other.dataset.rovingLast;
    }
    item.dataset.rovingLast = '';
  });
  group.addEventListener('keydown', e => {
    const settings = rovingGroups.get(group)!; // set just above
    // Only keys pressed on an item itself: a button or a field inside a row keeps its keys.
    const item = e.target as HTMLElement;
    if (!item.matches?.(settings.selector)) return;
    if ((e.key === 'Enter' || e.key === ' ') && item.tagName !== 'BUTTON') {
      e.preventDefault();
      item.click();
      return;
    }
    const all = rovingItems(group, settings.selector);
    const columns = settings.grid ? columnsOf(all) : 1;
    const next = nextRovingIndex(all.indexOf(item), all.length, e.key, columns);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    all[next].focus();
    all[next].scrollIntoView({block: 'nearest'});
  });
}

// ---------- menus ----------

const MENU_SIDE_KEYS: Record<string, string> = {ArrowRight: 'ArrowDown', ArrowLeft: 'ArrowUp'};
// The items the arrows move between in a menu; a field there (a select, a checkbox) is reached with Tab and keeps its arrows.
const MENU_ITEMS = 'button:not([disabled]),summary';

/**
 * A menu's keys: the arrows (and Home, End) move between its items, Escape closes it and gives the focus back to the button
 * that opened it. Keys a menu's own content has already handled (defaultPrevented) are left alone.
 */
export function menuKeys(menu: HTMLElement, opener: HTMLElement, close: () => void): void {
  menu.addEventListener('keydown', e => {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      if (opener.isConnected) opener.focus({preventScroll: true});
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest(FIELD_SELECTOR)) return;
    const items = rovingItems(menu, MENU_ITEMS);
    // in a menu Left and Right go to the previous and next item too (a row of swatches, the theme switch)
    const key = MENU_SIDE_KEYS[e.key] || e.key;
    const next = nextRovingIndex(items.indexOf(target), items.length, key);
    if (next === null) return;
    e.preventDefault();
    items[next].focus();
  });
}

/** A keyboard user who opened a menu lands on its first item; a mouse user's focus stays where it was. */
export function focusMenuStart(menu: HTMLElement): void {
  if (!keyboardInUse()) return;
  rovingItems(menu, MENU_ITEMS)[0]?.focus({preventScroll: true});
}

// ---------- a panel re-rendered under the focus ----------

/** Where the focus is in a container, counted among everything there that takes the focus; -1 when it is not inside. */
export function focusIndexIn(container: HTMLElement): number {
  const active = document.activeElement;
  if (!active || !container.contains(active)) return -1;
  return focusTakers(container).indexOf(active as HTMLElement);
}

/**
 * After a container was re-rendered (a pick re-renders its own panel), a keyboard user's focus that fell to the page goes
 * back to the element at the same place in it (or the last one, if there are fewer now). A focus that is somewhere stays.
 */
export function refocusAt(container: HTMLElement, index: number): void {
  if (index < 0 || !keyboardInUse()) return;
  const active = document.activeElement;
  if (active && active !== document.body) return;
  const items = focusTakers(container);
  items[Math.min(index, items.length - 1)]?.focus({preventScroll: true});
}

/**
 * A container its owner re-renders (the left panel, the mode's tools): where the focus is in it is followed, and after a
 * render (onRender runs first) a keyboard user's focus that fell to the page comes back to the same place.
 */
export function keepFocusThroughRenders(container: HTMLElement, onRender?: () => void): void {
  let focusAt = -1;
  addEventListener('focusin', () => {
    focusAt = focusIndexIn(container);
  });
  new MutationObserver(() => {
    onRender?.();
    refocusAt(container, focusAt);
  }).observe(container, {childList: true, subtree: true});
}

// The elements of a container that take the focus, in order (visible ones only).
function focusTakers(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUS_TAKERS)].filter(
    item => item.offsetWidth || item.offsetHeight,
  );
}

/** The last element in root a keyboard user can reach, if any. */
export function lastFocusable(root: ParentNode): HTMLElement | null {
  return reachable(root).at(-1) || null;
}

// The elements of root a keyboard user can reach, in order (visible ones only).
function reachable(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    item => item.offsetWidth || item.offsetHeight,
  );
}
