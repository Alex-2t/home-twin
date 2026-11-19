// What the AI build gives, on its upload page under the sign-in, the package or the files (the owner, 2026-11-19: people did
// not see why they would use it). Three short gains, and a row of homes the AI built that open in 3D in a new tab, so the
// result can be tried before paying. The homes are the gallery's (gallery.ts): on our site the list beside the page, in Home
// Assistant the one on our site (the panel has no gallery of its own). No list (offline, local work): the row stays hidden.
import {t} from '../i18n/i18n.ts';
import {icon} from './icons.ts';
import {esc} from './ui.ts';
import {cardPicture, factsLine, fetchGallery} from './gallery.ts';
import type {GalleryHome} from './gallery.ts';

/** Our site, where the gallery is for Home Assistant's panel (as the start screen's "See example homes"). */
const ONLINE_EDITOR = 'https://twin.sync.md/';
/** How many homes the row shows: a row of the page's width. */
const SHOWN_HOMES = 3;

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
    title: t('Your lights in their rooms'),
    line: t('Lights, curtains and air conditioners placed and linked, ready to use.'),
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

/** Where the editor this showcase links to is: this page's on our site, our site's in Home Assistant. */
function editorAddress(inHa: boolean): string {
  if (inHa) return ONLINE_EDITOR;
  return location.origin + location.pathname;
}

/** The row of homes, empty until fillShowcase finds them; hidden until then. */
export function showcaseHtml(inHa: boolean): string {
  const all = editorAddress(inHa) + '#/gallery';
  return `<section class="aib-showcase" hidden>
      <div class="aib-showcase-head">
        <b>${esc(t('Homes built by AI'))}</b>
        <a class="aib-link" href="${esc(all)}" target="_blank" rel="noopener">${esc(t('All homes'))}${icon('right', 14)}</a>
      </div>
      <p class="aib-showcase-sub">${esc(t('Open one in 3D and look around before you try.'))}</p>
      <div class="aib-showcase-grid"></div>
    </section>`;
}

/** The homes the row shows: those with a picture, a house among them when there is one, in the list's order. */
export function showcaseHomes(homes: GalleryHome[]): GalleryHome[] {
  const pictured = homes.filter(home => home.render);
  const house = pictured.find(home => home.kind === 'house');
  const others = pictured.filter(home => home !== house);
  const chosen = others.slice(0, house ? SHOWN_HOMES - 1 : SHOWN_HOMES);
  if (house) chosen.push(house);
  return chosen;
}

/** A home's card: its picture, name and facts; a click opens it in 3D in a new tab (route.ts #/home/<id>). */
function homeCard(home: GalleryHome, inHa: boolean): string {
  const address = editorAddress(inHa) + '#/home/' + encodeURIComponent(home.id);
  return (
    `<a class="gcard aib-showcase-card" href="${esc(address)}" target="_blank" rel="noopener" title="${esc(t('Open in 3D'))}">` +
    `<span class="gcard-pic">${cardPicture(home)}</span>` +
    `<span class="aib-showcase-open">${icon('box', 12)}<span>${esc(t('Open in 3D'))}</span></span>` +
    `<span class="gcard-text"><b>${esc(home.name)}</b><span>${esc(factsLine(home))}</span></span></a>`
  );
}

// The list is asked for once a page: the upload page is drawn again on each visit, the list does not change meanwhile.
let galleryAsked: Promise<GalleryHome[]> | null = null;

/** Finds the homes and shows them in the row inside `root` (showcaseHtml); none found: the row stays hidden. */
export async function fillShowcase(root: HTMLElement, inHa: boolean): Promise<void> {
  galleryAsked ??= fetchGallery(new URL('gallery/index.json', editorAddress(inHa)).href);
  const homes = showcaseHomes(await galleryAsked);
  const box = root.querySelector<HTMLElement>('.aib-showcase');
  const grid = box?.querySelector<HTMLElement>('.aib-showcase-grid');
  if (!box || !grid || !homes.length) return;
  grid.innerHTML = homes.map(home => homeCard(home, inHa)).join('');
  box.hidden = false;
}
