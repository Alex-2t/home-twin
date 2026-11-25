// "Fix with AI": pins on a home already taken from the AI build, after its review. The home stays the user's, with everything
// they did since (rooms linked, lights, devices, sensors, their own moves); the review opens over it, and a round's furniture
// and rooms' finishes come into it thing by thing and room by room (ai-build.ts, options.after; core/ai-fix.ts
// takeFurnitureRound, takeFinishesRound). The button is on the top bar in Plan and Furniture (styles.css), only for a home
// whose build is finished and this account's.
import {t} from '../i18n/i18n.ts';
import {el, esc} from './ui.ts';
import {icon} from './icons.ts';
import {openAiBuild} from './ai-build.ts';
import type {Editor} from './editor-types.ts';

// How often the home in the editor is looked at for another build (another plan opened), and how long a build not offered
// (still in its review, signed out) waits before it is asked about again.
const SOURCE_CHECK_MS = 5000;
const NOT_OFFERED_AGAIN_MS = 60_000;

/** What the button needs to know of the home's build. */
interface AfterStatus {
  finished?: boolean;
  has?: {home?: boolean};
}

/** Puts "Fix with AI" on the top bar for a home taken from a finished build of this account. */
export function offerFixWithAi(
  ed: Editor,
  {api = '', inHa = false}: {api?: string; inHa?: boolean} = {},
): void {
  const modes = document.getElementById('modes');
  if (!modes) return;
  const button = el(
    `<button id="ai-fix-btn" hidden title="${esc(t('Pin what the AI got wrong: only the furniture it fixes comes into your home'))}">${icon('sparkles', 16)}${esc(t('Fix with AI'))}</button>`,
  ) as HTMLButtonElement;
  const board = document.getElementById('board-btn');
  if (board) board.before(button);
  else modes.append(button);

  // the build the button was checked for, and when
  let checkedFor: string | null = null;
  let checkedAt = 0;
  let checking = false;

  async function check(): Promise<void> {
    const build = ed.plan.source?.build ?? null;
    const fresh = !button.hidden || Date.now() - checkedAt < NOT_OFFERED_AGAIN_MS;
    if (checking || (build === checkedFor && fresh)) return;
    checking = true;
    button.hidden = true;
    checkedFor = build;
    checkedAt = Date.now();
    try {
      if (!build) return;
      const response = await fetch(`${api}/api/builds/${encodeURIComponent(build)}`, {cache: 'no-store'});
      // signed out, another account's build, or a build gone: no button
      if (!response.ok) return;
      const status = (await response.json()) as AfterStatus;
      button.hidden = !(status.finished && status.has?.home) || ed.plan.source?.build !== build;
    } catch {
      // offline: asked again on the next change
    } finally {
      checking = false;
    }
  }

  button.addEventListener('click', () => {
    const build = ed.plan.source?.build;
    if (!build) return;
    openAiBuild(ed, {api, id: build, inHa, after: true});
  });
  void check();
  setInterval(() => void check(), SOURCE_CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    checkedAt = 0;
    void check();
  });
}
