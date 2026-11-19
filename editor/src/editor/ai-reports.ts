// The pins an owner sent the developer (D-129), all in one place: from the account's menu, on our site and in Home
// Assistant's panel, any day after the review. Each pin with its picture, its words and the owner's line, where it stands
// and the developer's note; a fix waiting for the home in the editor opens from here ("See the fix"). The service keeps the
// reports (GET /api/feedback, the service's tools/feedback.ts); the review shows the same words on each pin.
import {dateTime, t} from '../i18n/i18n.ts';
import {el, esc, find} from './ui.ts';
import {holdFocus} from './keyboard.ts';
import {icon} from './icons.ts';
import {closeOnAddressChange} from './route.ts';
import type {HeldFocus} from './keyboard.ts';
import type {ReportStatus} from './ai-pins.ts';
import type {ReportsSeen} from './ai-account-ui.ts';

/** A pin the account sent the developer, as the service lists it (its feedback.ts OwnerReport). */
export interface AccountReport {
  build: string;
  /** The home's name, when the build has one. */
  home?: string;
  round: number;
  n: number;
  text: string;
  roomName?: string;
  /** The line the owner added when they sent it. */
  comment?: string;
  /** The pin's picture: a file of the build's owner folder. */
  view?: string;
  status: ReportStatus;
  sentAt: string;
  /** When it last moved on. */
  at: string;
  note?: string;
  fixRound?: number;
}

// Where this browser keeps when the list was last opened: a pin that moved on since puts a dot on the account (this
// browser's convenience only; nothing is lost without it).
const SEEN_KEY = 'home-twin:reports-seen';

/** What a report says of where it stands, with the developer's note: the same words on the pin and in the list. */
export function reportStatusWords(status: ReportStatus, note?: string): string {
  if (status === 'looking')
    return note ? t('The developer is looking at it: {0}', note) : t('The developer is looking at it');
  if (status === 'fixed') return note ? t('Fixed by the developer: {0}', note) : t('Fixed by the developer');
  if (status === 'cannot') return note ? t('Can’t be done: {0}', note) : t('Can’t be done');
  return t('Sent to the developer');
}

/** The account's reports, newest first; null when the service does not list them (signed out, an older service, offline). */
export async function loadReports(api: string): Promise<AccountReport[] | null> {
  try {
    const response = await fetch(`${api}/api/feedback`, {cache: 'no-store'});
    if (!response.ok) return null;
    const reports = (await response.json()) as AccountReport[];
    return Array.isArray(reports) ? reports : null;
  } catch {
    return null;
  }
}

/** When this browser last opened the list ('' never). */
function seenAt(): string {
  try {
    return localStorage.getItem(SEEN_KEY) || '';
  } catch {
    return '';
  }
}

/** Remembers that the list was opened with these reports. */
function markSeen(reports: AccountReport[]): void {
  const newest = reports.reduce((latest, report) => (report.at > latest ? report.at : latest), '');
  try {
    localStorage.setItem(SEEN_KEY, newest);
  } catch {} // private window: the dot comes back next time, nothing else
}

/** How many reports there are, and whether one moved on (past "sent") since the list was last opened here. */
export function reportsSeen(reports: AccountReport[], seen: string = seenAt()): ReportsSeen {
  const news = reports.some(report => report.status !== 'sent' && report.at > seen);
  return {count: reports.length, news};
}

/** The fix round to offer a home of this build: the latest of its reports fixed after the version the home is at. */
export function fixWaitingFor(
  reports: AccountReport[],
  source: {build: string; round: number} | null | undefined,
): number | null {
  if (!source) return null;
  const rounds = reports
    .filter(report => report.build === source.build && report.status === 'fixed')
    .map(report => report.fixRound ?? 0)
    .filter(round => round > source.round);
  return rounds.length ? Math.max(...rounds) : null;
}

/** What the list is given. */
export interface ReportsListOptions {
  api: string;
  reports: AccountReport[];
  /** The home in the editor: its build and version (plan.source), to offer a fix it does not have yet. */
  source: () => {build: string; round: number} | null | undefined;
  /** Opens the fix of this build at this round in the editor (ai-fix.ts seeFix). */
  onSeeFix: (build: string, round: number) => void;
  onClose?: () => void;
}

/** The list over the page: each pin sent, newest first. Escape or a click beside it closes it. */
export function openReports(host: HTMLElement, options: ReportsListOptions): {close(): void} {
  const {api, reports, source, onSeeFix, onClose} = options;
  markSeen(reports);
  const veil = el(`<div class="aib-veil">
    <section class="aib-sign aib-reports" role="dialog" aria-modal="true" aria-labelledby="aib-reports-title">
      <header><b id="aib-reports-title">${esc(t('Pins sent to the developer'))}</b>
        <button type="button" class="ib" data-act="close" title="${esc(t('Close'))}">${icon('x', 16)}</button></header>
      <p class="aib-sign-lead">${esc(t('The developer sees each pin and answers here. A fix comes to your home in the editor.'))}</p>
      <ol class="aib-reports-list"></ol>
    </section></div>`);
  const list = find(veil, '.aib-reports-list');
  const home = source() ?? null;
  const waiting = fixWaitingFor(reports, home);
  for (const report of reports) list.append(reportRow(api, report, home, waiting));
  if (!reports.length) list.append(el(`<li class="aib-reports-empty">${esc(t('Nothing sent yet'))}</li>`));
  let held: HeldFocus | null = null;
  let stopListening = (): void => {};
  const close = (): void => {
    stopListening();
    held?.release();
    veil.remove();
    onClose?.();
  };
  // Back / Forward: the page under it changes, it closes
  stopListening = closeOnAddressChange(close);
  veil.addEventListener('click', event => {
    const target = event.target as Element;
    if (target === veil) return close();
    const action = target.closest<HTMLElement>('[data-act]');
    if (action?.dataset.act === 'close') close();
    if (action?.dataset.act === 'see-fix') {
      close();
      onSeeFix(action.dataset.build!, Number(action.dataset.round));
    }
  });
  host.append(veil);
  held = holdFocus(veil, {onEscape: close});
  return {close};
}

/** One pin of the list: its picture, where it is, its words and the owner's line, where it stands, and the fix to take. */
function reportRow(
  api: string,
  report: AccountReport,
  home: {build: string; round: number} | null,
  waiting: number | null,
): HTMLElement {
  const where = [report.home, report.roomName].filter(Boolean).join(' · ');
  const sent = dateTime(new Date(report.sentAt), {day: 'numeric', month: 'short'});
  const picture = report.view
    ? `<img class="aib-reports-pic" alt="" src="${esc(`${api}/api/builds/${encodeURIComponent(report.build)}/owner/${encodeURIComponent(report.view)}`)}">`
    : `<span class="aib-reports-pic">${icon('pin', 18)}</span>`;
  // the home in the editor is this build's, at a version before the fix: the fix is offered (the latest one, it has them all)
  const fixNotTaken =
    report.status === 'fixed' && home?.build === report.build && (report.fixRound ?? 0) > home.round;
  const takeFix =
    fixNotTaken && waiting != null
      ? `<button type="button" class="primary" data-act="see-fix" data-build="${esc(report.build)}" data-round="${waiting}">${esc(t('See the fix'))}</button>`
      : '';
  const row = el(`<li class="aib-reports-row">
    ${picture}
    <div class="aib-reports-text">
      <small>${esc([where, sent].filter(Boolean).join(' · '))}</small>
      <b>${esc(report.text)}</b>
      ${report.comment ? `<span class="aib-reports-comment">${esc(t('You added: {0}', report.comment))}</span>` : ''}
      <p class="aib-report-status" data-status="${report.status}">${esc(reportStatusWords(report.status, report.note))}</p>
      ${takeFix}
    </div></li>`);
  // a picture gone with the build's media: the pin's mark instead
  const image = row.querySelector('img');
  image?.addEventListener('error', () =>
    image.replaceWith(el(`<span class="aib-reports-pic">${icon('pin', 18)}</span>`)),
  );
  return row;
}

/** What the account menu's list is given. */
export interface AccountReportsOptions {
  api: string;
  /** The home in the editor: its build and version (plan.source). */
  source: () => {build: string; round: number} | null | undefined;
  onSeeFix: (build: string, round: number) => void;
  /** The count or the dot changed: the menu is drawn again. */
  onChange: () => void;
}

/** The account menu's pins sent to the developer: asked of the service, counted for the menu, opened as the list. */
export function accountReports(options: AccountReportsOptions): {
  seen(): ReportsSeen | null;
  refresh(): Promise<void>;
  open(): Promise<void>;
  forget(): void;
} {
  const {api, source, onSeeFix, onChange} = options;
  let reports: AccountReport[] | null = null;
  let opening = false;
  return {
    seen: () => (reports ? reportsSeen(reports) : null),
    async refresh() {
      reports = await loadReports(api);
      onChange();
    },
    async open() {
      if (opening) return;
      opening = true;
      // asked again as it opens: the developer may have answered since the menu was drawn
      reports = (await loadReports(api)) ?? reports ?? [];
      opening = false;
      openReports(document.body, {api, reports, source, onSeeFix, onClose: onChange});
      onChange();
    },
    forget() {
      reports = null;
      onChange();
    },
  };
}
