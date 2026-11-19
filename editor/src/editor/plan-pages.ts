// A plan uploaded as a PDF of many pages (D-131): a designer's project, a brochure or a survey has its floor plan on one of
// them, often far from the first. The AI build's service splits the PDF and guesses the plan's page (home-twin-ai-build
// tools/plan-pages.ts); here the owner sees the pages with that one picked, confirms or picks another, and the page they
// pick becomes the plan photo the build uploads. A PDF of one page goes up as it always did.
//   POST <api>/api/plan-pages            ← the PDF's bytes → {id, pages, shown, guess: {page, floors, why} | null}
//   GET  <api>/api/plan-pages/<id>/thumb/<n>   page n small (the picker)
//   GET  <api>/api/plan-pages/<id>/page/<n>    page n large (the plan photo)
import {t} from '../i18n/i18n.ts';
import {el, esc, find} from './ui.ts';
import {holdFocus} from './keyboard.ts';
import {icon} from './icons.ts';
import {closeOnAddressChange} from './route.ts';

/** The service's guess of the plan's page. */
export interface PlanPageGuess {
  page: number | null;
  floors: number;
}

/** A PDF split by the service. */
export interface PlanPages {
  id: string;
  pages: number;
  /** The first `shown` pages are drawn (a long PDF is shown from its start). */
  shown: number;
  guess: PlanPageGuess | null;
}

/** Whether a chosen plan is a PDF (by its type, or by its name where the browser gives none). */
export const isPdfFile = (file: {name: string; type: string}): boolean =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

const pagesAddress = (api: string, id: string): string => `${api}/api/plan-pages/${encodeURIComponent(id)}`;

/** A page's small drawing's address. */
export const thumbAddress = (api: string, id: string, page: number): string =>
  `${pagesAddress(api, id)}/thumb/${page}`;

/** The PDF to the service: split into pages, its plan's page guessed. Throws when the service cannot open it. */
export async function splitPlanPdf(api: string, file: Blob): Promise<PlanPages> {
  const res = await fetch(`${api}/api/plan-pages`, {
    method: 'POST',
    headers: {'content-type': 'application/pdf'},
    body: file,
  });
  if (!res.ok) throw new Error(`plan pages: ${res.status}`);
  return (await res.json()) as PlanPages;
}

/** The page picked, drawn large, as the plan photo to upload: named after the PDF and the page. */
export async function pagePlanFile(
  api: string,
  pages: PlanPages,
  page: number,
  pdfName: string,
): Promise<File> {
  const res = await fetch(`${pagesAddress(api, pages.id)}/page/${page}`);
  if (!res.ok) throw new Error(`plan page: ${res.status}`);
  const stem = pdfName.replace(/\.pdf$/i, '') || 'plan';
  return new File([await res.blob()], `${stem}-page-${page}.jpg`, {type: 'image/jpeg'});
}

/** The page the picker opens with: the one picked before, else the guess. */
export function firstPick(pages: PlanPages, pickedBefore: number | null): number | null {
  if (pickedBefore && pickedBefore <= pages.shown) return pickedBefore;
  return pages.guess?.page ?? null;
}

/** The picker's line under its title: what was guessed, and what else the owner should know. */
export function pickerLead(pages: PlanPages): string[] {
  const lines = [
    pages.guess?.page
      ? t('We picked page {0}. Tap another if it is wrong.', pages.guess.page)
      : t('No plan found here. Tap its page, or add another file.'),
  ];
  if ((pages.guess?.floors ?? 1) > 1) lines.push(t('Several floors: we build one for now. Pick its plan.'));
  if (pages.shown < pages.pages) lines.push(t('The first {0} of {1} pages', pages.shown, pages.pages));
  return lines;
}

/**
 * The pages to pick the plan from: a grid of the pages, the guess marked and picked, the picked page larger beside them
 * (on a phone the grid alone). Resolves with the page used, or null when closed.
 */
export function openPagePicker(
  host: HTMLElement,
  {api, pages, pickedBefore = null}: {api: string; pages: PlanPages; pickedBefore?: number | null},
): Promise<number | null> {
  return new Promise(resolve => {
    let picked = firstPick(pages, pickedBefore);
    const guessed = pages.guess?.page ?? null;
    const tiles = Array.from({length: pages.shown}, (_, i) => i + 1)
      .map(
        page => `<button type="button" class="aib-page" data-page="${page}" aria-pressed="false">
          <img alt="" loading="lazy" src="${esc(thumbAddress(api, pages.id, page))}">
          <span class="aib-page-n">${page}</span>
          ${page === guessed ? `<span class="aib-page-tag">${icon('sparkles', 11)}${esc(t('Our pick'))}</span>` : ''}
        </button>`,
      )
      .join('');
    const veil = el(`<div class="aib-veil">
      <section class="aib-pages" role="dialog" aria-modal="true" aria-labelledby="aib-pages-title">
        <header>
          <b id="aib-pages-title">${esc(t('Which page is the floor plan?'))}</b>
          <button type="button" class="ib" data-act="close" title="${esc(t('Close'))}">${icon('x', 16)}</button>
        </header>
        <p class="aib-pages-lead">${pickerLead(pages).map(esc).join('<br>')}</p>
        <div class="aib-pages-body">
          <div class="aib-pages-grid" role="group" aria-labelledby="aib-pages-title">${tiles}</div>
          <figure class="aib-pages-big"><img alt=""></figure>
        </div>
        <footer>
          <button type="button" data-act="close">${esc(t('Cancel'))}</button>
          <button type="button" class="primary" data-act="use"></button>
        </footer>
      </section>
    </div>`);
    host.append(veil);
    const use = find<HTMLButtonElement>(veil, '[data-act=use]');
    const big = find<HTMLImageElement>(veil, '.aib-pages-big img');

    const show = (): void => {
      for (const tile of veil.querySelectorAll<HTMLElement>('.aib-page')) {
        const on = Number(tile.dataset.page) === picked;
        tile.classList.toggle('on', on);
        tile.setAttribute('aria-pressed', String(on));
      }
      use.disabled = !picked;
      use.textContent = picked ? t('Use page {0}', picked) : t('Pick a page');
      big.hidden = !picked;
      if (picked) big.src = thumbAddress(api, pages.id, picked);
    };

    let done = false;
    const finish = (page: number | null): void => {
      if (done) return;
      done = true;
      stopListening();
      held.release();
      veil.remove();
      resolve(page);
    };
    const held = holdFocus(veil, {onEscape: () => finish(null)});
    // Back / Forward: the page under it changes, no page is picked
    const stopListening = closeOnAddressChange(() => finish(null));

    veil.addEventListener('click', e => {
      const target = e.target as HTMLElement;
      if (target === veil) return finish(null);
      const tile = target.closest<HTMLElement>('.aib-page');
      if (tile) {
        picked = Number(tile.dataset.page);
        show();
        return;
      }
      const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'close') finish(null);
      if (act === 'use' && picked) finish(picked);
    });
    // A double click on a page uses it at once.
    veil.addEventListener('dblclick', e => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('.aib-page');
      if (tile) finish(Number(tile.dataset.page));
    });
    show();
    veil.querySelector('.aib-page.on')?.scrollIntoView({block: 'nearest'});
  });
}
