// What the AI build gives, on its upload page under the sign-in, the package or the files (the owner, 2026-11-19: people did
// not see why they would use it). Three short gains, and a row of homes that open in 3D in a new tab, so a home in Home Twin
// can be tried before paying: three of the editor's examples the owner picked (they look best; the AI-built homes the owner
// left out, 2026-11-19). Their list is the one the editor's build publishes (showcase/examples.json, D-116), read from our
// service: in Home Assistant through the integration's proxy (ai.py), as the build's other requests. The homes open on our
// site: this page's editor there, our site's in Home Assistant (the panel has no examples). No list (offline, local work):
// the row stays hidden.
import {getLang, t} from '../i18n/i18n.ts';
import {icon} from './icons.ts';
import {esc} from './ui.ts';
import {cardPicture, factsLine} from './gallery.ts';

/** Our site, where the homes open from Home Assistant's panel (as the start screen's "See example homes"). */
const ONLINE_EDITOR = 'https://twin.sync.md/';
/** The examples the row shows first, in this order (the owner, 2026-11-19): the loft, the studio, the period apartment. */
const SHOWN_EXAMPLES = ['loft', 'studio', 'altbau'];
/** How long the list is waited for before the row goes on without it. */
const FETCH_TIMEOUT_MS = 8000;
// What an example's id, render and address may be: a plain name beside the list, an address inside the editor.
const EXAMPLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EXAMPLE_RENDER = /^[a-z0-9][a-z0-9-]*\.(webp|jpg|jpeg|png)$/;
const EXAMPLE_OPEN = /^#\/example\/[a-z0-9-]+\/?$/;

/** A card of the row: its picture, name and facts, and where it opens. */
export interface ShowcaseHome {
  id: string;
  name: string;
  area: number;
  rooms: number;
  render: string | null;
  /** The address inside the editor it opens at ("#/example/loft/"). */
  open: string;
}

/** Where the lists are read and the homes opened. */
export interface ShowcasePlace {
  /** The service's address the lists are read from: '' on our site, the integration's proxy in Home Assistant. */
  api: string;
  inHa: boolean;
}

/** One gain: its icon, its title and the line under it. */
interface Gain {
  icon: string;
  title: string;
  line: string;
}

/** The three gains; in Home Assistant the last is the home's lights, on our site that it goes into Home Assistant. */
function gains(inHa: boolean): Gain[] {
  const work: Gain = {
    icon: 'clock',
    title: t('Almost nothing to do'),
    line: t('A plan photo and one video. Nothing to measure or draw.'),
  };
  const furniture: Gain = {
    icon: 'sofa',
    title: t('Your furniture, where it stands'),
    line: t('Beds, sofas, tables and lamps, as your video shows them.'),
  };
  const lights: Gain = {
    icon: 'bulb',
    title: t('Then your lights, in a few clicks'),
    line: t(
      'Place your lights in their rooms yourself, step by step. Curtains and air conditioners come linked.',
    ),
  };
  const intoHa: Gain = {
    icon: 'house',
    title: t('Ready for Home Assistant'),
    line: t('Sign in there with the same account and your home is in it.'),
  };
  return [work, furniture, inHa ? lights : intoHa];
}

/** The gains as a row of three. */
export function gainsHtml(inHa: boolean): string {
  const items = gains(inHa).map(
    gain =>
      `<li><span class="aib-gain-ic">${icon(gain.icon, 18)}</span>` +
      `<b>${esc(gain.title)}</b><small>${esc(gain.line)}</small></li>`,
  );
  return `<ul class="aib-gains" aria-label="${esc(t('What you get'))}">${items.join('')}</ul>`;
}

/** Where the editor the homes open in is: this page's on our site, our site's in Home Assistant. */
function editorAddress(inHa: boolean): string {
  if (inHa) return ONLINE_EDITOR;
  return location.origin + location.pathname;
}

/** The row of homes, empty until fillShowcase finds them; hidden until then. */
export function showcaseHtml(inHa: boolean): string {
  const all = editorAddress(inHa) + '#/gallery';
  return `<section class="aib-showcase" hidden>
      <div class="aib-showcase-head">
        <b>${esc(t('Try it in 3D'))}</b>
        <a class="aib-link" href="${esc(all)}" target="_blank" rel="noopener">${esc(t('All homes'))}${icon('right', 14)}</a>
      </div>
      <p class="aib-showcase-sub">${esc(t('Open any home and look around before you try.'))}</p>
      <div class="aib-showcase-grid"></div>
    </section>`;
}

/** A value of a list that is a record. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** An example's name in the page's language, else in English; the list gives one per language. */
function exampleName(names: unknown): string | null {
  if (typeof names === 'string') return names.trim() || null;
  if (!isRecord(names)) return null;
  const name = names[getLang()] ?? names.en;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : null;
}

/**
 * The examples' list (showcase/examples.json) read into cards: only the ids asked for, in their order; `base` is the list's
 * own address, which the renders are beside. An entry that is not well formed is left out.
 */
export function parseShowcaseExamples(data: unknown, base: string, ids: string[]): ShowcaseHome[] {
  if (!Array.isArray(data)) return [];
  const homes: ShowcaseHome[] = [];
  for (const id of ids) {
    const entry = data.find(item => isRecord(item) && item.id === id);
    if (!isRecord(entry) || !EXAMPLE_ID.test(id)) continue;
    const name = exampleName(entry.name);
    const {area, rooms, render, open} = entry;
    if (!name) continue;
    if (typeof area !== 'number' || !Number.isFinite(area) || area <= 0) continue;
    if (typeof rooms !== 'number' || !Number.isInteger(rooms) || rooms < 0) continue;
    if (typeof open !== 'string' || !EXAMPLE_OPEN.test(open)) continue;
    const renderOk = typeof render === 'string' && EXAMPLE_RENDER.test(render);
    homes.push({
      id,
      name,
      area,
      rooms,
      render: renderOk ? new URL(render, base).href : null,
      open,
    });
  }
  return homes;
}

/** The examples' list; none (not there, offline, too slow): no cards, no error. */
async function fetchExamples(listUrl: string): Promise<ShowcaseHome[]> {
  try {
    const answer = await fetch(listUrl, {signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)});
    if (!answer.ok) return [];
    const base = answer.url || new URL(listUrl, location.href).href;
    return parseShowcaseExamples(await answer.json(), base, SHOWN_EXAMPLES);
  } catch {
    return [];
  }
}

/** A home's card: its picture, name and facts; a click opens it in 3D in a new tab. */
function homeCard(home: ShowcaseHome, inHa: boolean): string {
  const address = editorAddress(inHa) + home.open;
  return (
    `<a class="gcard aib-showcase-card" href="${esc(address)}" target="_blank" rel="noopener" title="${esc(t('Open in 3D'))}">` +
    `<span class="gcard-pic">${cardPicture(home)}</span>` +
    `<span class="aib-showcase-open">${icon('box', 12)}<span>${esc(t('Open in 3D'))}</span></span>` +
    `<span class="gcard-text"><b>${esc(home.name)}</b><span>${esc(factsLine(home))}</span></span></a>`
  );
}

// The list is asked for once a page: the upload page is drawn again on each visit, the list does not change meanwhile.
let homesAsked: Promise<ShowcaseHome[]> | null = null;

/** The row's homes: the examples, as their list gives them. */
function showcaseHomes(api: string): Promise<ShowcaseHome[]> {
  homesAsked ??= fetchExamples(`${api}/showcase/examples.json`);
  return homesAsked;
}

/** Finds the homes and shows them in the row inside `root` (showcaseHtml); none found: the row stays hidden. */
export async function fillShowcase(root: HTMLElement, place: ShowcasePlace): Promise<void> {
  const homes = await showcaseHomes(place.api);
  const box = root.querySelector<HTMLElement>('.aib-showcase');
  const grid = box?.querySelector<HTMLElement>('.aib-showcase-grid');
  if (!box || !grid || !homes.length) return;
  grid.innerHTML = homes.map(home => homeCard(home, place.inHa)).join('');
  box.hidden = false;
}
