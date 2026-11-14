// UI bits: an input field on the plan, the hint bar at the top, collapsible sections.
import {t, num} from '../i18n/i18n.ts';
import {icon} from './icons.ts';
import {keyboardInUse, menuKeys, focusMenuStart} from './keyboard.ts';
import type {AskNumberOptions, AskOptions, AskTextOptions, BannerItem} from './editor-types.ts';
// Our own markup always has the ids the code asks for, so the element is typed as present; a missing one fails at its
// first use, as it always did. Code that checks for a missing element (`$('x')?.…`) still works.
export const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
// One element from a piece of our own markup; the caller names the element's type when it needs more than HTMLElement.
export function el<ElementType extends HTMLElement = HTMLElement>(html: string): ElementType {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as ElementType;
}
// The characters esc replaces, and with what.
const HTML_ESCAPES: Record<string, string> = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'};
export const esc = (s: unknown): string => String(s).replace(/[&<>"]/g, c => HTML_ESCAPES[c]);
// An element of our own markup inside root, typed as present like $ (a missing one fails at its first use); the caller names
// the element's type when it needs more than HTMLElement.
export function find<ElementType extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): ElementType {
  return root.querySelector(selector) as ElementType;
}

// An input field right on the plan at point (x, y) relative to the canvas.
// Length is entered in centimetres (a decimal comma is fine); ok for a field of type 'len' receives metres.
export function parseLen(raw: unknown): number | null {
  const v = parseFloat(String(raw).trim().replace(',', '.'));
  return v > 0 ? v / 100 : null;
}
export function ask(
  x: number,
  y: number,
  label: string,
  value: string | number | undefined,
  options: AskNumberOptions,
): void;
export function ask(
  x: number,
  y: number,
  label: string,
  value: string | number | undefined,
  options?: AskTextOptions,
): void;
export function ask(
  x: number,
  y: number,
  label: string,
  value: string | number | undefined,
  options: AskOptions = {},
): void {
  const {type = 'text', cancel} = options;
  // ok gets a number for 'len' and 'number' and text otherwise: the overloads above keep the two apart.
  const ok = options.ok as ((value: string | number) => void) | undefined;
  const box = $('ask');
  const inp = find<HTMLInputElement>(box, 'input');
  const hint = find(box, '.ask-hint');
  find(box, 'span').textContent = label;
  const isLen = type === 'len';
  inp.type = isLen ? 'text' : type;
  inp.inputMode = isLen ? 'decimal' : '';
  // a number shows its digits; no value (a room from an older file has no name) leaves the field empty
  inp.value = value === undefined ? '' : String(value);
  hint.hidden = true;
  Object.assign(box.style, {left: x + 'px', top: y + 'px', display: 'flex'});
  inp.focus({preventScroll: true});
  inp.select();
  const done = (v: string | number | null): void => {
    box.style.display = 'none';
    inp.onkeydown = inp.onblur = null;
    v == null ? cancel?.() : ok?.(v);
  };
  inp.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      // what ok() does may put the focus on a button: this Enter must not press it too
      e.preventDefault();
      const raw = inp.value.trim();
      if (isLen) {
        done(parseLen(raw));
        return;
      }
      if (type === 'number') {
        const v = parseFloat(raw.replace(',', '.'));
        done(v > 0 ? v : null);
      } else done(raw || null);
    }
    if (e.key === 'Escape') done(null);
  };
  // The same click that opened the field may still take focus away: for the first 250 ms a blur does not count as cancel.
  const opened = performance.now();
  inp.onblur = () => {
    if (performance.now() - opened < 250) {
      setTimeout(() => inp.focus({preventScroll: true}));
      return;
    }
    done(null);
  };
}
// The bar above the plan: a wizard step or a hint, with buttons.
export function banner(text?: string | null, buttons: BannerItem[] = []): void {
  const b = $('banner');
  if (!text) {
    b.hidden = true;
    b.innerHTML = '';
    return;
  }
  b.hidden = false;
  b.innerHTML = `<span>${text}</span>`;
  for (const it of buttons) {
    if (it instanceof Element) {
      b.appendChild(it);
      continue;
    }
    const [label, fn, primary] = it;
    const x = el(`<button class="${primary === true ? 'primary' : primary || ''}">${esc(label)}</button>`);
    x.onclick = fn;
    b.appendChild(x);
  }
}

// Tooltip on an element: with a mouse — on hover (after 200 ms, without the system delay), with a finger — a tap on the info icon
// (shown until the next touch). One per page, above the element, or below it if there is no room.
let tipEl: HTMLElement | null = null;
let tipT: ReturnType<typeof setTimeout> | number = 0;
function tipShow(target: HTMLElement, text: string): void {
  tipEl ??= document.body.appendChild(el(`<div class="tip glass"></div>`));
  // The one tooltip of the page: made once, never replaced.
  const tipBox = tipEl;
  tipBox.textContent = text;
  tipBox.classList.add('on');
  const r = target.getBoundingClientRect();
  const w = tipBox.offsetWidth;
  const h = tipBox.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  tipBox.style.left = x + 'px';
  tipBox.style.top = (r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8) + 'px';
  const chk = (): void => {
    if (!tipBox.classList.contains('on')) return;
    if (!target.isConnected) {
      tipHide();
      return;
    }
    requestAnimationFrame(chk);
  };
  requestAnimationFrame(chk);
} // the panel was re-rendered — the tooltip goes away
export function tipHide(): void {
  clearTimeout(tipT);
  tipEl?.classList.remove('on');
}
// The texts given to tip(), for showing them on keyboard focus too.
const tipTexts = new WeakMap<HTMLElement, string>();
/**
 * With the keyboard, a control's tooltip (its title, or the text given to tip()) shows when it gets the focus: the keys in
 * tooltips (D-022) are for keyboard users most of all, and an icon button says what it is. The mouse sees no change.
 */
export function tipsOnFocus(): void {
  addEventListener('focusin', e => {
    const target = e.target as HTMLElement;
    const text = tipTexts.get(target) || target.getAttribute?.('title');
    if (text && keyboardInUse() && target.matches(':focus-visible')) tipShow(target, text);
    else tipHide();
  });
  addEventListener('focusout', tipHide);
}
export function tip(target: HTMLElement, text: string, info?: HTMLElement | null): void {
  tipTexts.set(target, text);
  target.addEventListener('pointerenter', e => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(tipT);
    tipT = setTimeout(() => tipShow(target, text), 200);
  });
  target.addEventListener('pointerleave', tipHide);
  target.addEventListener('pointerdown', tipHide);
  if (info)
    info.addEventListener('click', e => {
      e.stopPropagation();
      tipShow(target, text);
      setTimeout(() =>
        addEventListener(
          'pointerdown',
          function off() {
            tipHide();
            removeEventListener('pointerdown', off, true);
          },
          true,
        ),
      );
    });
}
// Popup menu at a button: items — [icon, label, action, class]. Closes on an outside click and Escape.
// A keyboard user lands on its first item, moves with the arrows, and Escape gives the focus back to the button (keyboard.ts).
let pop: HTMLElement | null = null;
let popAnchor: HTMLElement | null = null;
export function closePop(): void {
  const hadFocus = !!pop?.contains(document.activeElement);
  pop?.remove();
  pop = null;
  // the focus was in the popup (an item chosen with the keyboard): back to its button, not to the page's start
  if (hadFocus && popAnchor) anchorNow(popAnchor)?.focus({preventScroll: true});
  popAnchor = null;
}
// A pick in a popup re-renders the panel its button is on: the same button is then a new element, found by its label.
function anchorNow(anchor: HTMLElement): HTMLElement | null {
  if (anchor.isConnected) return anchor;
  const label = anchor.getAttribute('aria-label') || anchor.title;
  if (!label) return null;
  const sameKind = document.querySelectorAll<HTMLElement>(anchor.tagName);
  return [...sameKind].find(other => (other.getAttribute('aria-label') || other.title) === label) || null;
}
// The popup's keys and first focus, for both kinds of popup.
function popKeys(m: HTMLElement, anchor: HTMLElement): void {
  popAnchor = anchor;
  menuKeys(m, anchor, closePop);
  focusMenuStart(m);
}
/** A menu item: its icon, its label, what it does and its button's classes. */
export type PopoverItem = [icon: string, label: string, action: () => void, cls?: string];
export function popover(anchor: HTMLElement, items: PopoverItem[]): void {
  closePop();
  const m = el(`<div class="menu glass pop"></div>`);
  for (const [ic, label, fn, cls] of items) {
    const b = el(`<button class="${cls || ''}">${icon(ic)}${esc(label)}</button>`);
    b.onclick = () => {
      closePop();
      fn();
    };
    m.appendChild(b);
  }
  document.body.appendChild(m);
  pop = m;
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
  m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6) + 'px';
  popKeys(m, anchor);
  const off = (e: PointerEvent): void => {
    // A pointer event's target is a node.
    const target = e.target as Node | null;
    if (!m.contains(target) && target !== anchor && !anchor.contains(target)) {
      closePop();
      removeEventListener('pointerdown', off, true);
    }
  };
  setTimeout(() => addEventListener('pointerdown', off, true));
  addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') {
      closePop();
      removeEventListener('keydown', esc);
    }
  });
}
// Popup at a button with any content (all floor coverings): closes on an outside click and Escape. Returns the popup.
export let popClosedAt = 0;
export function panelPop(anchor: HTMLElement, content: Node, cls = ''): HTMLElement {
  closePop();
  const m = el(`<div class="menu glass pop panel ${cls}"></div>`);
  m.appendChild(content);
  document.body.appendChild(m);
  pop = m;
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth;
  const h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left - 8)) + 'px';
  m.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - 6 - h) : r.bottom + 6) + 'px';
  popKeys(m, anchor);
  const off = (e: PointerEvent): void => {
    if (!document.body.contains(m)) {
      removeEventListener('pointerdown', off, true);
      return;
    }
    // A pointer event's target is a node.
    const target = e.target as Node | null;
    if (!m.contains(target) && !anchor.contains(target)) {
      closePop();
      popClosedAt = performance.now();
      removeEventListener('pointerdown', off, true);
    }
  };
  setTimeout(() => addEventListener('pointerdown', off, true));
  addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') {
      closePop();
      removeEventListener('keydown', esc);
    }
  });
  return m;
}
// Collapsible section of the left panel; whether it is open is remembered between sessions.
const SEC = 'home-twin-editor:sections';
/** A section's options: the count beside its title, open the first time, and a button in its title: label, action, tooltip. */
export interface SectionOptions {
  count?: number | string | null;
  open?: boolean;
  action?: [label: string, action: () => void, title?: string];
}
// Which sections are open, by key: written only here; a value edited by hand is not checked (it never was).
type SectionsOpen = Record<string, boolean | undefined>;
export function section(
  parent: HTMLElement,
  key: string,
  title: string,
  {count, open = true, action}: SectionOptions = {},
): HTMLElement {
  const saved = JSON.parse(localStorage.getItem(SEC) || '{}') as SectionsOpen;
  const d = el<HTMLDetailsElement>(
    `<details class="sec"><summary>${icon('right', 14, 'chev')}<span>${esc(title)}</span>${count != null && count !== '' ? `<span class="count">${esc(count)}</span>` : ''}</summary><div class="sec-body"></div></details>`,
  );
  d.open = saved[key] ?? open;
  d.addEventListener('toggle', () => {
    const s = JSON.parse(localStorage.getItem(SEC) || '{}') as SectionsOpen;
    s[key] = d.open;
    localStorage.setItem(SEC, JSON.stringify(s));
  });
  if (action) {
    const b = el(`<button class="act soft" title="${esc(action[2] || '')}">${esc(action[0])}</button>`);
    b.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      action[1]();
    };
    find(d, 'summary').appendChild(b);
  }
  parent.appendChild(d);
  return find(d, '.sec-body');
}
export const fmtArea = (a: number): string => num(Math.abs(a), 1) + t(' m²');
