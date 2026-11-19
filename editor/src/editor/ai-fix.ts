// The developer's fix of a pin, reaching a home already taken from the AI build (D-129). The home remembers the build and
// the version it was taken at (plan.source); when it opens, and now and then while it is open, the editor asks the service
// for its pins' statuses. A fix shows a line with "See": the rooms the fix changed and the user did not are taken at once,
// the rooms both changed are the user's choice (theirs and the fixed one side by side). Taking a fix is one step of the
// history. The comparing is core/ai-fix.ts.
import {applyFix, contentPrints, fixOffer, roomView, untouchedChoice} from '../core/ai-fix.ts';
import type {FixChoice, FixOffer} from '../core/ai-fix.ts';
import {syncFurnStrips} from '../core/fixtures.ts';
import {closeOuterOpen, migrate} from '../core/plan.ts';
import {readPlan} from '../core/plan-file.ts';
import {PLAN_VERSION} from '../core/plan-format.ts';
import {t} from '../i18n/i18n.ts';
import {el, esc, find} from './ui.ts';
import {drawPlan} from './versions-panel.ts';
import {holdFocus} from './keyboard.ts';
import type {HeldFocus} from './keyboard.ts';
import type {ReportView} from './ai-pins.ts';
import type {ContentPrints, Plan, PlanSource} from '../core/types.ts';
import type {BannerButton, Editor} from './editor-types.ts';

// How often an open home asks for its pins' statuses.
const CHECK_EVERY_MS = 10 * 60_000;

// Opens a fix of the home in the editor, from the list of pins sent to the developer (ai-reports.ts); set by watchFixes.
let openFixOf: ((build: string, round: number) => void) | null = null;

/** Opens the fix of this build at this round for the home in the editor, as "See" on the line does. */
export function seeFix(build: string, round: number): void {
  openFixOf?.(build, round);
}

/** What the build's status says that a fix needs: its reports. */
interface FixStatus {
  reports?: ReportView[];
}

/**
 * The home's prints as the editor keeps it: brought along the way every edit leaves a plan (app.ts finishEdit), so a room
 * the user never touched prints the same after their first edit elsewhere.
 */
export function editorPrints(plan: Plan): ContentPrints {
  const copy = structuredClone(plan);
  closeOuterOpen(copy);
  syncFurnStrips(copy);
  return contentPrints(copy);
}

/** The home in the editor is the build's at this round: it remembers that, with its prints, in the current history step. */
export function markSource(ed: Editor, build: string, round: number): void {
  ed.plan.source = {build, round, prints: editorPrints(ed.plan)};
  ed.amend();
}

/** The fixes waiting for a home: the reports fixed by a round after the one it was taken at. */
export function waitingFixes(source: PlanSource, reports: ReportView[]): ReportView[] {
  return reports.filter(report => report.status === 'fixed' && (report.fixRound ?? 0) > source.round);
}

/** Asks for the home's fixes when it opens, every few minutes and when the page comes back; offers one when there is. */
export function watchFixes(ed: Editor, {api = ''}: {api?: string} = {}): void {
  // The fix offered this session, by build and round: "Later" does not bring the same line back until the page reloads.
  let offered = '';
  let checking = false;
  const buildUrl = (source: PlanSource): string => `${api}/api/builds/${encodeURIComponent(source.build)}`;

  async function check(): Promise<void> {
    const source = ed.plan.source;
    if (!source || checking) return;
    checking = true;
    try {
      const response = await fetch(buildUrl(source), {cache: 'no-store'});
      // signed out, another account's build, or a build gone: nothing to offer, and nothing to say
      if (!response.ok) return;
      const status = (await response.json()) as FixStatus;
      const fixes = waitingFixes(source, status.reports || []);
      if (!fixes.length) return;
      const target = Math.max(...fixes.map(report => report.fixRound ?? 0));
      const key = `${source.build}:${target}`;
      if (offered === key || ed.plan.source !== source) return;
      offered = key;
      ed.banner(
        t(
          '{0, plural, one {The developer fixed a pin of your home} other {The developer fixed # pins of your home}}',
          fixes.length,
        ),
        [
          [t('See'), () => void openFix(source, target), true],
          [t('Later'), () => ed.banner()],
        ],
      );
    } catch {
      // offline: asked again later
    } finally {
      checking = false;
    }
  }

  /** The build's home after round k, as the editor reads a home. */
  async function version(source: PlanSource, round: number): Promise<Plan> {
    const response = await fetch(`${buildUrl(source)}/home?round=${round}&format=${PLAN_VERSION}`, {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(response.statusText);
    return migrate(readPlan(await response.text()));
  }

  async function openFix(source: PlanSource, target: number): Promise<void> {
    ed.banner();
    let base: Plan;
    let fixed: Plan;
    try {
      [base, fixed] = await Promise.all([version(source, source.round), version(source, target)]);
    } catch {
      ed.banner(t('Could not load the fix: check the connection and try again'), [
        [t('Got it'), () => ed.banner(), true],
      ]);
      offered = '';
      return;
    }
    // what the user changed is told on the home as an edit would leave it (editorPrints)
    const local = structuredClone(ed.plan);
    closeOuterOpen(local);
    syncFurnStrips(local);
    const offer = fixOffer(local, base, fixed, source.prints ?? null);
    const asks = offer.rooms.some(room => room.changedByUser) || !!offer.walls?.changedByUser;
    if (!asks) return take(source, target, fixed, untouchedChoice(offer), offer);
    showChoice(source, target, fixed, offer);
  }

  /** Takes the chosen parts of the fix as one history step; the home is the build's at the fix's round from now on. */
  function take(source: PlanSource, target: number, fixed: Plan, choice: FixChoice, offer: FixOffer): void {
    const next = applyFix(ed.plan, fixed, choice);
    next.source = {build: source.build, round: target};
    ed.applyPlan(next);
    markSource(ed, source.build, target);
    const taken = offer.rooms.filter(room => choice.rooms.includes(room.room)).map(room => room.name);
    if (choice.walls) taken.push(t('walls and windows'));
    const line = taken.length
      ? t('The fix is in: {0}', taken.join(', '))
      : t('Nothing in your home needed changing');
    const undoFix = (): void => {
      ed.undo();
      ed.banner();
    };
    const buttons: BannerButton[] = [[t('Got it'), () => ed.banner(), true]];
    if (taken.length) buttons.unshift([t('Undo'), undoFix]);
    ed.banner(line, buttons);
  }

  /** The rooms both the fix and the user changed: theirs and the fixed one side by side, keep or take each. */
  function showChoice(source: PlanSource, target: number, fixed: Plan, offer: FixOffer): void {
    const choice = untouchedChoice(offer);
    const asked = offer.rooms.filter(room => room.changedByUser);
    const alsoTaken = offer.rooms.filter(room => !room.changedByUser).map(room => room.name);
    if (offer.walls && !offer.walls.changedByUser) alsoTaken.push(t('walls and windows'));
    const box = el(`<div class="fix-choice glass" role="dialog" aria-modal="false">
      <header><b>${esc(t('The developer fixed your home'))}</b><small>${esc(t('You changed these since. Keep yours, or take the fixed one?'))}</small></header>
      <ol class="fix-rows"></ol>
      ${alsoTaken.length ? `<p class="fix-also">${esc(t('Taken as well: {0}', alsoTaken.join(', ')))}</p>` : ''}
      <footer><button class="soft" data-act="cancel">${esc(t('Cancel'))}</button><button class="primary" data-act="apply">${esc(t('Apply'))}</button></footer>
    </div>`);
    const rows = find(box, '.fix-rows');
    const addRow = (
      key: string,
      name: string,
      mine: Plan | null,
      theirs: Plan | null,
      takeIt: () => boolean,
      set: (on: boolean) => void,
    ): void => {
      const row = el(`<li class="fix-row">
        <span class="fix-name">${esc(name)}</span>
        <figure data-take="0"><canvas></canvas><figcaption>${esc(t('Yours'))}</figcaption></figure>
        <figure data-take="1"><canvas></canvas><figcaption>${esc(t('Fixed'))}</figcaption></figure>
      </li>`);
      row.dataset.key = key;
      const show = (): void => {
        for (const figure of row.querySelectorAll<HTMLElement>('figure'))
          figure.classList.toggle('on', (figure.dataset.take === '1') === takeIt());
      };
      for (const figure of row.querySelectorAll<HTMLElement>('figure'))
        figure.addEventListener('click', () => {
          set(figure.dataset.take === '1');
          show();
        });
      rows.append(row);
      show();
      requestAnimationFrame(() => {
        const [mineCanvas, fixedCanvas] = row.querySelectorAll('canvas');
        if (mine) drawPlan(mineCanvas, mine);
        if (theirs) drawPlan(fixedCanvas, theirs);
      });
    };
    for (const room of asked)
      addRow(
        room.room,
        room.name,
        roomView(ed.plan, room.room),
        roomView(fixed, room.room),
        () => choice.rooms.includes(room.room),
        on => {
          choice.rooms = choice.rooms.filter(id => id !== room.room);
          if (on) choice.rooms.push(room.room);
        },
      );
    if (offer.walls?.changedByUser)
      addRow(
        'walls',
        t('Walls and windows'),
        ed.plan,
        fixed,
        () => choice.walls,
        on => (choice.walls = on),
      );
    let held: HeldFocus | null = null;
    const close = (): void => {
      held?.release();
      box.remove();
    };
    const cancel = (): void => {
      close();
      offered = '';
    };
    box.addEventListener('click', event => {
      const act = (event.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'cancel') cancel();
      if (act === 'apply') {
        close();
        take(source, target, fixed, choice, offer);
      }
    });
    document.body.append(box);
    // the page under it sleeps, Escape cancels, the focus goes back after (D-096)
    held = holdFocus(box, {first: find<HTMLButtonElement>(box, '[data-act=apply]'), onEscape: cancel});
  }

  openFixOf = (build, round) => {
    const source = ed.plan.source;
    if (source?.build !== build || round <= source.round) return;
    offered = `${build}:${round}`;
    void openFix(source, round);
  };
  void check();
  setInterval(() => void check(), CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  // another plan opened (a file, a version, the AI build's home): asked about at once
  let lastSource = ed.plan.source?.build;
  setInterval(() => {
    const now = ed.plan.source?.build;
    if (now !== lastSource) {
      lastSource = now;
      void check();
    }
  }, 5000);
}
