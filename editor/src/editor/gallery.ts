// The gallery of homes (D-113): a page of large cards, each a 3D render of a home with its name, area and rooms. It lists
// the editor's own examples (demo/homes.ts, their renders in assets/renders/) and, in the standalone editor, AI-built homes
// the server it is served by publishes at gallery/index.json (the AI build's tools/gallery-export.ts). Where that list
// cannot be had (offline, local work, Home Assistant) the examples alone are shown, without a word of error.
// A click opens the home as an example is opened: the user's own copy, the gallery's original never changes (flows.ts).
import {t, num} from '../i18n/i18n.ts';
import {area} from '../core/geometry.ts';
import {roomKind} from '../core/overview.ts';
import {icon} from './icons.ts';
import {el, esc} from './ui.ts';
import type {Outline} from '../core/types.ts';

/** What a home is, for the gallery's filter chips. */
export type GalleryKind = 'apartment' | 'house' | 'designer';

/** A filter chip: every home, or one kind. */
export type GalleryFilter = 'all' | GalleryKind;

/** A card of the gallery. */
export interface GalleryHome {
  /** An example's id, or a published home's id from the server's list. */
  id: string;
  /** Its name, in the user's language for an example; as published for an AI-built home. */
  name: string;
  /** Said after the name on the card ("ground floor"), already translated; none: nothing. */
  note?: string;
  /** Floor area indoors, m². */
  area: number;
  /** Rooms to live in. */
  rooms: number;
  kind: GalleryKind;
  aiBuilt: boolean;
  /** The render's address (a data URL for an example); null: a small outline of the rooms instead (outline). */
  render: string | null;
  /** The outline drawn when there is no render (an SVG of our own). */
  outline?: string;
  /** A published home's plan file: its address. Examples have their plan in the editor. */
  plan?: string;
}

/** A room as the facts read it: its name and outline. */
interface FactsRoom {
  name?: string;
  polygon: Outline;
}

// The kinds of rooms counted as rooms on a card: those lived in (overview.ts roomKind). The AI build's gallery export
// counts them the same way (its tools/gallery-export.ts homeFacts), so its homes' cards say the same of the same home.
const LIVED_IN_KINDS = new Set(['living', 'bed', 'kids', 'office', 'dining', 'room']);
// A room smaller than this is a cupboard or a wardrobe whatever its name says.
const LIVED_IN_MIN_AREA = 4;
// A kitchen this large is a kitchen-living room or a kitchen diner (roomKind calls it a kitchen): a room lived in too.
const OPEN_KITCHEN_MIN_AREA = 16;
// How long the list of published homes is waited for before the gallery goes on without it.
const FETCH_TIMEOUT_MS = 8000;
// What a published home's id and its files may be named: a plain name beside index.json, never another address.
const PUBLISHED_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PUBLISHED_FILE = /^[a-z0-9][a-z0-9-]*\.(json|webp|jpg|jpeg|png)$/;
const PUBLISHED_KINDS: readonly string[] = ['apartment', 'house'];

/**
 * The card's facts: the area indoors (a balcony, terrace or garden not counted) and the rooms lived in (4 m² or more; an
 * open kitchen of 16 m² or more is one).
 */
export function homeFacts(rooms: FactsRoom[]): {area: number; rooms: number} {
  let indoorArea = 0;
  let livedIn = 0;
  for (const room of rooms) {
    const kind = roomKind(room.name);
    if (kind === 'balcony') continue;
    const roomArea = Math.abs(area(room.polygon));
    indoorArea += roomArea;
    const livedInKind = LIVED_IN_KINDS.has(kind) && roomArea >= LIVED_IN_MIN_AREA;
    const openKitchen = kind === 'kitchen' && roomArea >= OPEN_KITCHEN_MIN_AREA;
    if (livedInKind || openKitchen) livedIn += 1;
  }
  return {area: indoorArea, rooms: livedIn};
}

/** A value of the server's list that is a record. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The server's list (gallery/index.json) read into cards; `base` is the list's own address, which the files are beside.
 * An entry that is not well formed, or names a file elsewhere, is left out; a list that is not one gives no cards.
 */
export function parseGalleryIndex(data: unknown, base: string): GalleryHome[] {
  if (!Array.isArray(data)) return [];
  const homes: GalleryHome[] = [];
  const seen = new Set<string>();
  for (const entry of data) {
    if (!isRecord(entry)) continue;
    const {id, name, area: homeArea, rooms, kind, render, plan} = entry;
    if (typeof id !== 'string' || !PUBLISHED_ID.test(id) || seen.has(id)) continue;
    if (typeof name !== 'string' || !name.trim()) continue;
    if (typeof homeArea !== 'number' || !Number.isFinite(homeArea) || homeArea <= 0) continue;
    if (typeof rooms !== 'number' || !Number.isInteger(rooms) || rooms < 0) continue;
    if (typeof kind !== 'string' || !PUBLISHED_KINDS.includes(kind)) continue;
    if (typeof plan !== 'string' || !PUBLISHED_FILE.test(plan) || !plan.endsWith('.json')) continue;
    const renderOk = typeof render === 'string' && PUBLISHED_FILE.test(render) && !render.endsWith('.json');
    seen.add(id);
    homes.push({
      id,
      name: name.trim().slice(0, 80),
      area: homeArea,
      rooms,
      kind: kind as GalleryKind, // one of PUBLISHED_KINDS, checked above
      aiBuilt: entry.aiBuilt === true,
      render: renderOk ? new URL(render, base).href : null,
      plan: new URL(plan, base).href,
    });
  }
  return homes;
}

/**
 * The homes the server publishes beside the editor: `indexUrl` is the address of its list. Nothing there, an answer that
 * is not the list (a server without a gallery answers with the editor's page), offline or too slow: no homes, no error.
 */
export async function fetchGallery(indexUrl: string): Promise<GalleryHome[]> {
  try {
    const answer = await fetch(indexUrl, {signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)});
    if (!answer.ok) return [];
    return parseGalleryIndex(await answer.json(), answer.url || indexUrl);
  } catch {
    return [];
  }
}

/** The homes a chip shows. */
export const homesOf = (homes: GalleryHome[], filter: GalleryFilter): GalleryHome[] =>
  filter === 'all' ? homes : homes.filter(home => home.kind === filter);

/** "62 m² · 3 rooms", and the note after it ("· ground floor"). */
export function factsLine(home: Pick<GalleryHome, 'area' | 'rooms' | 'note'>): string {
  const parts = [num(home.area, 0) + t(' m²')];
  if (home.rooms > 0) parts.push(t('{0, plural, one {# room} other {# rooms}}', home.rooms));
  if (home.note) parts.push(home.note);
  return parts.join(' · ');
}

/** The picture at the top of a card: the render, or the outline of the rooms where there is none. */
export function cardPicture(home: Pick<GalleryHome, 'render' | 'outline'>): string {
  if (home.render)
    return `<img src="${esc(home.render)}" alt="" loading="lazy" decoding="async" draggable="false">`;
  return `<span class="ex-outline">${home.outline || ''}</span>`;
}

/** The gallery page: show it the homes, it lists them under its chips; a card's click goes to `open`. */
export interface GalleryView {
  /** Lists these homes; called again, adds those not listed yet (the published ones come after the examples). */
  list(homes: GalleryHome[]): void;
}

/** The page inside `root` (shell.html #gallery: its chips and its grid). */
export function galleryView(
  root: HTMLElement,
  open: (home: GalleryHome, card: HTMLElement) => void,
): GalleryView {
  const grid = root.querySelector<HTMLElement>('.gal-grid')!; // shell.html has it
  const chips = [...root.querySelectorAll<HTMLButtonElement>('.gal-chip')];
  const listed: GalleryHome[] = [];
  let filter: GalleryFilter = 'all';
  // an example and a published home may have the same id: they are told apart by where their plan is
  const keyOf = (home: GalleryHome): string => (home.plan ? 'published:' : 'example:') + home.id;

  const card = (home: GalleryHome): HTMLElement => {
    const button = el(
      `<button type="button" class="gcard" data-kind="${home.kind}" data-id="${esc(home.id)}">` +
        `<span class="gcard-pic">${cardPicture(home)}</span>` +
        (home.aiBuilt ? `<span class="gcard-ai">${icon('sparkles', 12)}<span></span></span>` : '') +
        '<span class="gcard-text"><b></b><span></span></span></button>',
    );
    button.querySelector('.gcard-text b')!.textContent = home.name;
    button.querySelector('.gcard-text span')!.textContent = factsLine(home);
    const badge = button.querySelector('.gcard-ai span');
    if (badge) badge.textContent = t('Built by AI');
    button.title = home.name;
    button.onclick = () => open(home, button);
    return button;
  };

  const show = (): void => {
    for (const cardElement of grid.children) {
      const kind = (cardElement as HTMLElement).dataset.kind;
      (cardElement as HTMLElement).hidden = filter !== 'all' && kind !== filter;
    }
    for (const chip of chips) {
      const chipFilter = chip.dataset.f as GalleryFilter; // shell.html gives every chip its filter
      const on = chipFilter === filter;
      chip.setAttribute('aria-pressed', String(on));
      const count = homesOf(listed, chipFilter).length;
      chip.querySelector('small')!.textContent = String(count);
      // a kind with no home is not offered
      chip.hidden = chipFilter !== 'all' && count === 0;
    }
  };

  for (const chip of chips) {
    chip.onclick = () => {
      filter = chip.dataset.f as GalleryFilter;
      show();
    };
  }

  return {
    list(homes) {
      for (const home of homes) {
        if (listed.some(other => keyOf(other) === keyOf(home))) continue;
        listed.push(home);
        grid.append(card(home));
      }
      show();
    },
  };
}
