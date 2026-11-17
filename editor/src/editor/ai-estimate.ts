// What an AI build action will about take, told before it starts (D-094): a build on the upload page, a round of pins in
// the review. The service tells it as percent of a package, never money (D-085), and says when it is more than what is
// left: the action may still start, and waits for a top-up where the money runs out.
//   GET <api>/api/estimate?seconds=<videos' length>&videos=<n>&photos=<n>   a new build (photos of the rooms: D-117)
//   GET <api>/api/builds/<id>/estimate?rooms=<n>[&home=1]         a round of pins in n rooms (home=1: words for the whole home)
//   → {low, high, short}: percent of a package; short: more than what is left (null: no account known)
// An older service has no estimate (404): nothing is shown.
import {t} from '../i18n/i18n.ts';
import {esc} from './ui.ts';
import {icon} from './icons.ts';
import type {PinNotes} from './ai-pins.ts';

/** What an action will about take: percent of one package, and whether that is more than what is left. */
export interface Estimate {
  low: number;
  high: number;
  /** More than what is left on the account; null where no account is known. */
  short: boolean | null;
}

/** What a round of pins is counted by: the rooms its pins are in, and words for the whole home. */
export interface RoundSize {
  rooms: number;
  wholeHome: boolean;
}

// The service's percents are whole numbers between these.
const MOST_PERCENT = 1000;

const isPercent = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MOST_PERCENT;

/** The estimate in the service's answer; null when the answer is not one. */
export function estimateFrom(data: unknown): Estimate | null {
  if (typeof data !== 'object' || data === null) return null;
  const fields = data as Record<string, unknown>;
  if (!isPercent(fields.low) || !isPercent(fields.high) || fields.high < fields.low) return null;
  const short = typeof fields.short === 'boolean' ? fields.short : null;
  return {low: fields.low, high: fields.high, short};
}

/** The estimate at an address of the service; null when it has none or does not answer. */
async function estimateAt(url: string): Promise<Estimate | null> {
  try {
    const res = await fetch(url, {cache: 'no-store'});
    if (!res.ok) return null;
    return estimateFrom(await res.json());
  } catch {
    return null;
  }
}

/** What a new build will about take, from the videos' length (null: unknown), how many videos and photos there are. */
export function buildEstimate(
  api: string,
  {seconds, videos, photos = 0}: {seconds: number | null; videos: number; photos?: number},
): Promise<Estimate | null> {
  const query = new URLSearchParams({videos: String(videos)});
  if (photos > 0) query.set('photos', String(photos));
  if (seconds !== null) query.set('seconds', String(Math.round(seconds)));
  return estimateAt(`${api}/api/estimate?${query}`);
}

/** What a round of pins will about take; buildUrl is the build's own address (<api>/api/builds/<id>). */
export function roundEstimate(buildUrl: string, size: RoundSize): Promise<Estimate | null> {
  const query = new URLSearchParams({rooms: String(size.rooms)});
  if (size.wholeHome) query.set('home', '1');
  return estimateAt(`${buildUrl}/estimate?${query}`);
}

/** What a round of these notes is counted by: the rooms of the pins that say something, and words for the whole home. */
export function roundSize(notes: PinNotes): RoundSize {
  const saying = notes.pins.filter(pin => pin.text.trim());
  const rooms = new Set(saying.map(pin => pin.room || ''));
  return {rooms: rooms.size, wholeHome: !!notes.text.trim()};
}

/** The estimate in words: "About 30–45% of your package", or "Up to 2% of your package" for a small one. */
export function estimateText(estimate: Estimate): string {
  if (estimate.low === 0) return t('Up to {0}% of your package', estimate.high);
  return t('About {0}–{1}% of your package', estimate.low, estimate.high);
}

/**
 * The estimate as a line beside the button that starts the action, with a plain warning when it is more than what is
 * left; '' when there is none.
 */
export function estimateLine(estimate: Estimate | null): string {
  if (!estimate) return '';
  const title = t('An estimate: a bigger home or more furniture takes more');
  const warning = estimate.short
    ? `<span class="aib-cost-short">${esc(t('Your package may run out midway. It pauses and goes on once you top up.'))}</span>`
    : '';
  const shortClass = estimate.short ? ' short' : '';
  return `<span class="aib-cost${shortClass}" title="${esc(title)}">${icon('gauge', 14)}<span>${esc(estimateText(estimate))}</span>${warning}</span>`;
}
