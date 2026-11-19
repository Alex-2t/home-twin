// The notification stack in Preview and on the dashboard card (D-126), as on the owner's own card in 3d_floor: the home's events
// (look/home-events.ts) as cards in the top corner of the model, the newest on top; under the pointer (on a phone, by a tap) the stack
// opens into a list that scrolls. The gear with coloured dots opens the settings: which types to show (look/notes.ts), how many
// events of each there were in the last day. The choice is kept in this browser.
//
// Here the model is drawn under the panel (not inside it, as in 3d_floor), so the cards lie over the model: only the cards catch
// the pointer, the gaps between them and the shadows' margins let it through to the model.
import {icon} from '../look/icons.ts';
import {t, num} from '../i18n/i18n.ts';
import {
  NOTE_TYPES,
  NOTE_DEPTH,
  NOTE_SPRING_MS,
  noteFilter,
  noteStats,
  stackLayout,
  tuckedPlace,
  fullCount,
  edgeFade,
  springEasing,
  noteAge,
} from '../look/notes.ts';
import {homeEvents, replayEvents, markAutomated, automationRuns, SETTLE_MS} from '../look/home-events.ts';
import type {Note, NoteCategory, NoteDraft, NoteFilter, NotePlace} from '../look/notes.ts';
import type {AutomationRun, Chain, EventItem, EventState, HistoryRow} from '../look/home-events.ts';
import type {HaLayer} from '../core/types.ts';

// The expanded stack: the last twenty events of the shown types, with no loading of more — with automations a day's log holds over
// a thousand entries, and there is no reason to page through them here.
const NOTE_LIST = 20;
// Hovering opens the stack almost at once — the delay only skips a pointer flying past; leaving closes it a little later, so it
// does not blink.
const NOTE_HOVER_IN_MS = 40;
const NOTE_HOVER_OUT_MS = 280;
// The log keeps a day of every type: in a real home about two thousand events, nearly all of them automations.
const NOTE_LOG = 5000;
// How far back the stack is filled from HA's recorder when the page opens.
const HISTORY_HOURS = 24;
// A spring where the browser knows linear(); otherwise a curve with a small overshoot.
const NOTE_EASE =
  typeof CSS !== 'undefined' && CSS.supports?.('transition-timing-function', 'linear(0, 1)')
    ? springEasing()
    : 'cubic-bezier(.2,.9,.25,1.05)';
const STORE_KEY = 'home-twin-notes-v1:';

/**
 * The markup the panel puts into its model area (canvas-wrap) and the settings it puts into its shell. The settings are a panel the
 * gear discloses, not a modal dialog: a tap elsewhere closes them and the model stays usable, so the page under them is not put to
 * sleep (keyboard.ts holdFocus would, in the HA dashboard too).
 */
export const NOTES_MARKUP = (): string =>
  `<div class="notifications" role="log" aria-label="${escape(t('Home notifications'))}" tabindex="0"><div class="note-track"></div></div>
  <button class="note-gear" data-note="settings" aria-controls="note-settings" aria-expanded="false" aria-label="${escape(t('Notification settings'))}"
    title="${escape(t('Which notifications to show'))}"><span class="note-dots"></span>${icon('gear')}</button>`;
export const NOTE_SETTINGS_MARKUP = (): string =>
  `<section class="note-settings" id="note-settings" aria-label="${escape(t('Notification settings'))}" hidden></section>`;
export const NOTE_EASE_STYLE = `--note-spring:${NOTE_EASE}`;

/** What the stack needs from the panel. */
export interface NotesSource {
  /** The panel's shadow root (the stack's markup is in it). */
  root: ShadowRoot;
  ha: () => HaLayer | null | undefined;
  /** The devices whose changes become notifications (rebuilt on every look: the plan and HA may have changed). */
  catalog: () => EventItem[];
  /** An item's state now; null — not known. */
  read: (item: EventItem) => EventState | null;
}

/** The stack, as the panel drives it. */
export interface NotesPanel {
  /** Compare the home with the last look and add what changed (the panel calls it whenever it redraws, with the catalog it has). */
  collect(catalog?: EventItem[]): void;
  /** The panel is shown: start the clock under the cards; the first look after this is only remembered. */
  open(): void;
  close(): void;
  /** Add notifications made elsewhere. */
  add(notes: NoteDraft[]): void;
}

/** A card in the stack: its element, its height, its place, and its state while it comes and goes. */
interface NoteNode {
  element: HTMLElement;
  category: NoteCategory;
  height: number;
  place: NotePlace & {x: number};
  fresh: boolean;
  hidden: boolean;
  retire: ReturnType<typeof setTimeout> | null;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escape = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

export function createNotes(source: NotesSource): NotesPanel {
  const {root} = source;
  const query = <ElementType extends Element = HTMLElement>(selector: string): ElementType | null =>
    root.querySelector<ElementType>(selector);
  const isDemo = (): boolean => !!source.ha()?.demo;

  let log: Note[] = [];
  let sequence = 0;
  const nodes = new Map<number, NoteNode>();
  let expanded = false;
  let maxHeight = 0;
  let skipped = false;
  let hovering = false;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let lowerTimer: ReturnType<typeof setTimeout> | undefined;
  let scrollFrame = 0;
  let settingsOpen = false;
  let filter: NoteFilter = loadFilter();
  let filterMode = isDemo();

  // the home's last look: null — the next look is only remembered
  let snapshot: Record<string, string | null> | null = null;
  let pending: Map<string, Chain> | null = null;
  let runs: Map<string, AutomationRun> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let historyLoaded = false;
  let ageTimer: ReturnType<typeof setInterval> | undefined;
  let shown = false;

  // ---------- the home's events ----------
  let lastCatalog: EventItem[] | null = null;
  function collect(given?: EventItem[]): void {
    if (!shown) return;
    // the demo and HA keep separate choices: the editor may switch from the demo to a connected HA
    if (filterMode !== isDemo()) {
      filterMode = isDemo();
      filter = loadFilter();
      updateGear();
      render();
    }
    const catalog = given || lastCatalog || source.catalog();
    lastCatalog = catalog;
    const first = !snapshot;
    runs = automationRuns(runs, automations());
    // the demo shows a change at once: its devices are ours, nothing bounces, and the visitor clicks to see what happens
    const settleMs = isDemo() ? 0 : SETTLE_MS;
    const result = homeEvents(snapshot, source.read, catalog, {runs, pending, settleMs});
    snapshot = result.snapshot;
    pending = result.pending;
    // a series of clicks has ended, and no new look comes — finish it by the clock
    clearTimeout(settleTimer);
    if (pending.size) settleTimer = setTimeout(() => collect(), settleMs + 50);
    if (result.notes.length) add(result.notes);
    if (first && !historyLoaded) {
      historyLoaded = true;
      void loadHistory(catalog, Date.now());
    }
  }
  /** The automations' current contexts, by which their runs are known (live HA only; the demo has none). */
  function automations(): {contextId: string | undefined; name: string | null}[] {
    const ha = source.ha();
    if (!ha || ha.demo) return [];
    return ha
      .entities()
      .filter(item => item.domain === 'automation')
      .map(item => ({contextId: ha.entity(item.entity)?.context?.id, name: item.name || null}));
  }
  /**
   * After a reload the log is filled with the last day's events, with their real times. The history ends at the first live look:
   * anything later comes through collect, so nothing is doubled. Live notifications that came while it loaded stay on top.
   */
  async function loadHistory(catalog: EventItem[], until: number): Promise<void> {
    const ha = source.ha();
    if (!ha || ha.demo) return;
    const ids = [...new Set(catalog.map(item => item.entity).filter((id): id is string => !!id))];
    if (!ids.length) return;
    const range = {start: until - HISTORY_HOURS * 3600e3, end: until};
    try {
      const entries = ha.logbook ? ha.logbook(ids, range).catch(() => []) : Promise.resolve([]);
      const answer = await ha.stateHistory(ids, range);
      const series: Record<string, HistoryRow[]> = {};
      for (const [entity, rows] of Object.entries(answer)) {
        series[entity] = rows
          .map(row => ({s: row.s, t: row.lu * 1000}))
          .filter(row => row.s != null && Number.isFinite(row.t));
      }
      markAutomated(series, await entries);
      add(replayEvents(series, catalog));
    } catch (error) {
      console.warn('Home Twin: the notifications history is not available', error);
    }
  }

  /** The log: every event of the day, whatever its type. The stack shows the last shown ones; the summary counts them all. */
  function add(drafts: NoteDraft[]): void {
    for (const draft of drafts) {
      const at = Number.isFinite(draft.at) ? (draft.at as number) : Date.now();
      sequence++;
      log.push({...draft, at, id: sequence});
    }
    log.sort((a, b) => a.at - b.at || a.id - b.id);
    if (log.length > NOTE_LOG) log.splice(0, log.length - NOTE_LOG);
    render();
    updateSettings();
  }

  // ---------- the stack ----------
  /** On a phone there is no stack (card.css): the log grows, there is nowhere to draw. */
  function stackHidden(list: HTMLElement): boolean {
    return !shown || list.getClientRects().length === 0;
  }
  /**
   * Collapsed: the last cards in full (up to four, as many as fit above the room strip) and two sheets under them; expanded: a list
   * of the last NOTE_LIST events of the shown types. Nodes live while needed: those already in place only move on the spring; extra
   * ones hide behind the stack, a type turned off slides out to the right. reason — where new ones come from: 'arrive' — from above,
   * a fresh event; 'expand' — from behind the stack; 'collapse' — no new ones, all go back into the stack.
   */
  function render(reason: 'arrive' | 'expand' | 'collapse' = 'arrive'): void {
    const list = query('.notifications');
    const track = query('.note-track');
    if (!list || !track) return;
    // hidden cards would measure zero — they are drawn when the stack shows
    if (stackHidden(list)) {
      skipped = true;
      return;
    }
    skipped = false;
    const anyHeight = nodes.values().next().value?.height || 62;
    const full = fullCount(stackRoom(), anyHeight);
    const limit = expanded ? NOTE_LIST : full + NOTE_DEPTH;
    const wanted: Note[] = [];
    for (let index = log.length - 1; index >= 0 && wanted.length < limit; index--) {
      if (filter[log[index].category]) wanted.push(log[index]);
    }
    const current = wanted.map((note, index) => {
      let node = nodes.get(note.id);
      if (node) {
        if (node.retire) clearTimeout(node.retire);
        node.retire = null;
        node.element.classList.remove('leaving');
        node.fresh = false;
      } else {
        node = noteNode(note);
        nodes.set(note.id, node);
        if (index === 0) track.prepend(node.element);
        else track.append(node.element);
        node.height = (node.element.firstElementChild as HTMLElement | null)?.offsetHeight || 64;
      }
      return node;
    });
    const layout = stackLayout(
      current.map(node => node.height),
      {expanded, full},
    );
    // not needed: in the open list they fade where they are, in the collapsed stack they hide behind it, a type turned off slides out
    const keep = new Set(current);
    for (const [id, node] of nodes) {
      if (keep.has(node) || node.retire) continue;
      let place: Partial<NotePlace & {x: number}>;
      if (!filter[node.category]) place = {...node.place, x: 28, o: 0};
      else if (expanded) place = {...node.place, o: 0};
      else place = {...tuckedPlace(layout.bottom, node.height), z: 0, behind: true};
      placeNote(node, place);
      node.element.classList.add('leaving');
      node.retire = setTimeout(() => {
        node.element.remove();
        nodes.delete(id);
      }, NOTE_SPRING_MS);
    }
    // a fresh event in a scrolled list: everything takes its place without moving, and the scroll shifts by the new card — what is
    // being read does not move away
    const old = current.find(node => !node.fresh);
    const scrolled = expanded && list.scrollTop > 4 && reason === 'arrive';
    const shift = scrolled && old ? layout.items[current.indexOf(old)].y - old.place.y : 0;
    let staged = false;
    const cascade = new Set<NoteNode>();
    current.forEach((node, index) => {
      const place = layout.items[index];
      // a stack card that was beyond the list's edge shows up in its place
      if (node.hidden) {
        staged = true;
        node.hidden = false;
        placeNote(node, {...place, o: 0, s: place.s * 0.97}, false);
        return;
      }
      if (!node.fresh || scrolled) return;
      staged = true;
      // a fresh event drops from above; full cards that came at once (the history after a reload) show up in place one after another;
      // the rest come out from behind the stack
      if (index === 0 && reason !== 'expand')
        placeNote(node, {y: -node.height * 0.55, s: 0.94, o: 0, z: place.z}, false);
      else if (!place.behind && reason !== 'expand') {
        cascade.add(node);
        placeNote(node, {...place, y: place.y - 12, o: 0}, false);
      } else placeNote(node, {...tuckedPlace(layout.bottom, node.height), z: place.z, behind: true}, false);
    });
    if (staged) void track.offsetHeight;
    current.forEach((node, index) => {
      // opening — a quick fan: the first cards a little before the next, the whole list in place within a tenth of a second
      let delay = 0;
      if (reason === 'expand' && index > 0) delay = Math.min(index, 8) * 12;
      else if (cascade.has(node)) delay = index * 45;
      placeNote(node, layout.items[index], !scrolled, delay);
      node.fresh = false;
      node.element.dataset.index = String(index);
    });
    track.style.height = `${layout.height}px`;
    const openHeight = Math.min(layout.height + 24, maxHeight || layout.height + 24);
    list.style.height = `${expanded ? openHeight : layout.height}px`;
    if (shift) list.scrollTop += shift;
    fadeEdges();
  }
  /** A card's place — in CSS variables; the move is on the spring, unless animate is false. */
  function placeNote(
    node: NoteNode,
    place: Partial<NotePlace & {x: number}>,
    animate = true,
    delay = 0,
  ): void {
    const {y = 0, x = 0, s = 1, o = 1, z = 1, behind = false} = place;
    const style = node.element.style;
    style.transition = animate ? '' : 'none';
    style.transitionDelay = delay ? `${delay}ms` : '';
    style.setProperty('--y', `${y}px`);
    style.setProperty('--x', `${x}px`);
    style.setProperty('--s', String(s));
    style.setProperty('--o', String(o));
    style.zIndex = String(z);
    node.element.classList.toggle('behind', behind);
    node.place = {y, x, s, o, z, behind};
  }
  /** The open list's edges (edgeFade): at the bottom a card shrinks and fades, past the top it melts. Only when the list overflows. */
  function fadeEdges(): void {
    const list = query('.notifications');
    const track = query('.note-track');
    if (!list || !track) return;
    // the target height, not the current one: while opening the list still grows, and by clientHeight every card would be “at the
    // bottom edge”
    const view = parseFloat(list.style.height) || list.clientHeight;
    const top = list.scrollTop;
    const scrolls = expanded && track.offsetHeight + 24 > view + 1;
    list.classList.toggle('scrolled', scrolls && top > 2);
    for (const node of nodes.values()) {
      const card = node.element.firstElementChild as HTMLElement | null;
      if (!card) continue;
      if (!scrolls || node.retire) {
        card.style.scale = '';
        card.style.opacity = '';
        continue;
      }
      const fade = edgeFade(node.place.y - top, node.height, view);
      card.style.scale = String(fade.scale);
      card.style.opacity = String(fade.opacity);
    }
  }
  /** How much room the open list has: down to the room strip, or to the bottom of the model. */
  function stackRoom(): number {
    const list = query('.notifications');
    const wrap = query('.canvas-wrap');
    const strip = query('.room-strip');
    if (!list || !wrap) return 160;
    const top = list.getBoundingClientRect().top;
    let bottom = wrap.getBoundingClientRect().bottom - 12;
    if (strip && getComputedStyle(strip).display !== 'none')
      bottom = Math.min(bottom, strip.getBoundingClientRect().top + 28);
    return Math.max(160, bottom - top);
  }
  /** A notification's card: its colour from its type; under the title — where, and whose decision. */
  function noteNode(note: Note): NoteNode {
    const element = document.createElement('div');
    element.className = `notification type-${note.category}${note.resolved ? ' resolved' : ''}`;
    element.dataset.id = String(note.id);
    element.dataset.at = String(note.at);
    element.dataset.type = note.category;
    const where = [note.source, note.by].filter(Boolean).join(' · ');
    element.innerHTML =
      `<div class="notification-card"><div class="notification-icon">${icon(note.icon)}</div>` +
      `<div class="notification-text"><strong>${escape(note.title)}</strong><small><span class="notification-source">${escape(where)}</span>` +
      `<span class="notification-age">${escape(noteAge(note.at))}</span></small></div></div>`;
    const place = {y: 0, x: 0, s: 1, o: 1, z: 1, behind: false};
    return {element, category: note.category, height: 64, place, fresh: true, hidden: false, retire: null};
  }
  function ageNotes(): void {
    for (const node of nodes.values()) {
      const age = node.element.querySelector('.notification-age');
      if (age) age.textContent = noteAge(Number(node.element.dataset.at));
    }
  }

  function expand(): void {
    clearTimeout(hoverTimer);
    const list = query('.notifications');
    if (!list || expanded || !nodes.size) return;
    expanded = true;
    maxHeight = stackRoom();
    // the open list is being read — it rises above the pins
    clearTimeout(lowerTimer);
    list.classList.add('expanded', 'raised');
    render('expand');
  }
  function collapse(): void {
    clearTimeout(hoverTimer);
    const list = query('.notifications');
    if (!list || !expanded) return;
    // a scrolled list collapses from where it was left: the cards shift by the scroll without moving, the scroll is reset — to the eye
    // nothing jumped, and from here the visible ones ride into the stack. Those beyond the list's edge fade at once: otherwise, once the
    // list stops clipping, they would fly across the model and the gear.
    const shift = list.scrollTop;
    const view = list.clientHeight;
    for (const node of nodes.values()) {
      const top = node.place.y - shift;
      node.hidden = top + node.height < 0 || top > view;
      placeNote(node, {...node.place, y: top, ...(node.hidden ? {o: 0} : {})}, false);
    }
    list.scrollTop = 0;
    void list.offsetHeight;
    expanded = false;
    list.classList.remove('expanded');
    render('collapse');
    // below the pins again once the cards have come together: mid-move the stack would dive with a jerk
    clearTimeout(lowerTimer);
    lowerTimer = setTimeout(() => {
      if (!expanded) list.classList.remove('raised');
    }, NOTE_SPRING_MS);
  }
  const hover = (over: boolean): void => {
    if (over === hovering) return;
    hovering = over;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(over ? expand : collapse, over ? NOTE_HOVER_IN_MS : NOTE_HOVER_OUT_MS);
  };
  const insideList = (event: Event): boolean => {
    const list = query('.notifications');
    return !!list && event.composedPath().includes(list);
  };
  const insideSettings = (event: Event): boolean =>
    event.composedPath().some(node => {
      const classes = (node as Element).classList;
      return !!classes && (classes.contains('note-settings') || classes.contains('note-gear'));
    });

  /**
   * The mouse opens the stack by hovering, with a small delay, and not with a button held — so the model is turned. The wheel over the
   * collapsed stack opens it; over the open one it scrolls the list. A finger: a tap opens, the open list scrolls natively, a tap
   * elsewhere (the model included, which is outside the panel) closes it. From the keyboard — by focus.
   */
  function bind(): void {
    const list = query('.notifications');
    if (!list) return;
    list.addEventListener('pointerover', event => {
      if (event.pointerType === 'mouse' && !event.buttons) hover(true);
    });
    list.addEventListener('pointerout', event => {
      if (event.pointerType !== 'mouse') return;
      const to = event.relatedTarget as Node | null;
      if (!to || !list.contains(to)) hover(false);
    });
    list.addEventListener(
      'wheel',
      event => {
        if (expanded) return;
        event.preventDefault();
        hovering = true;
        expand();
      },
      {passive: false},
    );
    list.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' || expanded) return;
      expand();
    });
    list.addEventListener('focusin', expand);
    list.addEventListener('focusout', event => {
      if (!list.contains(event.relatedTarget as Node | null)) collapse();
    });
    list.addEventListener(
      'scroll',
      () => {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(() => {
          scrollFrame = 0;
          if (expanded) fadeEdges();
        });
      },
      {passive: true},
    );
    root.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLElement>('[data-note]');
      if (!button) return;
      if (button.dataset.note === 'settings') toggleSettings((event as MouseEvent).detail === 0);
      else if (button.dataset.note === 'type') setType(button.dataset.type as NoteCategory);
    });
    root.addEventListener('keydown', event => {
      if ((event as KeyboardEvent).key !== 'Escape' || !settingsOpen) return;
      event.stopPropagation();
      closeSettings(true);
    });
    // the panel's size changed (a phone turned, the HA sidebar opened): the stack shows again with what has gathered meanwhile
    const resize = new ResizeObserver(() => {
      if (settingsOpen) placeSettings();
      if (skipped && !stackHidden(list)) render();
    });
    const wrap = query('.canvas-wrap');
    if (wrap) resize.observe(wrap);
  }
  // a tap elsewhere closes the open stack and the settings, as any pop-up: the model is outside the panel, so the page is listened to
  function outside(event: PointerEvent): void {
    if (settingsOpen && !insideSettings(event)) closeSettings();
    if (expanded && !insideList(event)) collapse();
  }

  // ---------- the settings ----------
  function loadFilter(): NoteFilter {
    let stored: unknown = null;
    try {
      stored = JSON.parse(localStorage.getItem(STORE_KEY + (isDemo() ? 'demo' : 'live')) || 'null');
    } catch {
      stored = null;
    }
    return noteFilter({stored, demo: isDemo()});
  }
  function setType(id: NoteCategory): void {
    if (!NOTE_TYPES.some(type => type.id === id && !type.locked)) return;
    filter = {...filter, [id]: !filter[id]};
    try {
      localStorage.setItem(STORE_KEY + (isDemo() ? 'demo' : 'live'), JSON.stringify(filter));
    } catch {
      // a private window: the choice lasts until the page is closed
    }
    render();
    updateGear();
    updateSettings();
  }
  /** The dots on the settings button — the colours of the types shown: the stack's legend at a glance. */
  function updateGear(): void {
    const dots = query('.note-dots');
    if (!dots) return;
    dots.innerHTML = NOTE_TYPES.filter(type => filter[type.id])
      .map(type => `<i class="type-${type.id}"></i>`)
      .join('');
  }
  /** keyboard — opened from the keyboard: the focus goes to the first switch, and closing brings it back to the gear. */
  function toggleSettings(keyboard: boolean): void {
    if (settingsOpen) closeSettings(keyboard);
    else openSettings(keyboard);
  }
  /** The settings window lives in the panel's shell, not in the model area (which clips): under the gear, never past the bottom. */
  function openSettings(keyboard: boolean): void {
    const panel = query('.note-settings');
    const gear = query('.note-gear');
    if (!panel || !gear) return;
    panel.innerHTML = settingsMarkup();
    panel.hidden = false;
    settingsOpen = true;
    placeSettings();
    gear.setAttribute('aria-expanded', 'true');
    gear.classList.add('open');
    updateSettings();
    if (keyboard) panel.querySelector<HTMLElement>('button.ns-row')?.focus({preventScroll: true});
  }
  function placeSettings(): void {
    const panel = query('.note-settings');
    const gear = query('.note-gear');
    const shell = query('.shell');
    if (!panel || !gear || !shell) return;
    const gearBox = gear.getBoundingClientRect();
    const box = shell.getBoundingClientRect();
    // under the gear, its right edge at the gear's; on a narrow screen with no room left of it — centred
    const right = box.right - gearBox.right;
    const left = box.width - right - panel.offsetWidth;
    panel.style.top = `${gearBox.bottom - box.top + 10}px`;
    panel.style.right = `${left < 12 ? Math.max(8, (box.width - panel.offsetWidth) / 2) : right}px`;
    panel.style.maxHeight = `${Math.max(200, box.bottom - gearBox.bottom - 22)}px`;
  }
  function closeSettings(restoreFocus = false): void {
    const panel = query('.note-settings');
    const gear = query('.note-gear');
    settingsOpen = false;
    if (panel) panel.hidden = true;
    gear?.setAttribute('aria-expanded', 'false');
    gear?.classList.remove('open');
    if (restoreFocus) gear?.focus();
  }
  function settingsMarkup(): string {
    const row = (type: (typeof NOTE_TYPES)[number]): string => {
      const body =
        `<span class="ns-tile">${icon(type.icon)}</span><span class="ns-text"><b>${escape(t(type.name))}</b>` +
        `<small>${escape(t(type.hint))}</small></span><span class="ns-count"></span>`;
      if (type.locked)
        return (
          `<div class="ns-row locked type-${type.id}" data-type="${type.id}">${body}` +
          `<span class="ns-lock" title="${escape(t('Alerts are always shown'))}">${icon('lock')}</span></div>`
        );
      return (
        `<button class="ns-row type-${type.id}" role="switch" aria-checked="false" aria-label="${escape(t(type.name))}" ` +
        `data-note="type" data-type="${type.id}">${body}<span class="ns-switch" aria-hidden="true"></span></button>`
      );
    };
    return (
      `<div class="ns-head"><div><h3>${escape(t('Notifications'))}</h3><p>${escape(t('What to show in the corner of the model'))}</p></div>` +
      `<button class="ns-close" data-note="settings" aria-label="${escape(t('Close'))}">${icon('close')}</button></div>` +
      `<div class="ns-day"><div class="ns-day-line"><b class="ns-total">0</b><span class="ns-total-word"></span></div>` +
      `<div class="ns-bar">${NOTE_TYPES.map(type => `<i class="type-${type.id}" data-type="${type.id}"></i>`).join('')}</div></div>` +
      `<div class="ns-list">${NOTE_TYPES.map(row).join('')}</div>` +
      `<p class="ns-foot">${escape(t('Kept in this browser. Alerts are always shown.'))}</p>`
    );
  }
  /** The day's counts and the switches — in place, without redrawing: the focus stays. */
  function updateSettings(): void {
    const panel = query('.note-settings');
    if (!panel || panel.hidden || !panel.firstChild) return;
    const {byType, total} = noteStats(log);
    const totalElement = panel.querySelector('.ns-total');
    const word = panel.querySelector('.ns-total-word');
    if (totalElement) totalElement.textContent = num(total);
    if (word) word.textContent = t('{0, plural, one {event} other {events}} in the last day', total);
    for (const segment of panel.querySelectorAll<HTMLElement>('.ns-bar i')) {
      const id = segment.dataset.type as NoteCategory;
      const count = byType[id];
      segment.hidden = !count;
      segment.style.flexGrow = String(count);
      segment.classList.toggle('off', !filter[id]);
    }
    for (const row of panel.querySelectorAll<HTMLElement>('.ns-row')) {
      const id = row.dataset.type as NoteCategory;
      const on = filter[id];
      row.classList.toggle('on', on);
      if (row.matches('button')) row.setAttribute('aria-checked', String(on));
      const count = row.querySelector('.ns-count');
      if (count) count.textContent = byType[id] ? num(byType[id]) : '—';
    }
  }

  bind();
  updateGear();

  return {
    collect,
    open() {
      if (shown) return;
      shown = true;
      snapshot = null;
      pending = null;
      lastCatalog = null;
      ageTimer = setInterval(ageNotes, 30e3);
      document.addEventListener('pointerdown', outside, true);
      requestAnimationFrame(() => render());
    },
    close() {
      if (!shown) return;
      shown = false;
      clearInterval(ageTimer);
      clearTimeout(settleTimer);
      clearTimeout(hoverTimer);
      document.removeEventListener('pointerdown', outside, true);
      closeSettings();
      if (expanded) collapse();
    },
    add,
  };
}
