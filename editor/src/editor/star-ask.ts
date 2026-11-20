// Asking for a GitHub star (the owner, before the release): stars are how people find an integration in HACS and the
// Marketplace, and an owner who installs from there never sees the repository. The app asks once, after the home is put on
// its dashboard — the setup done and the home in 3D; the Settings menu keeps a quiet "Star on GitHub" link always there.
// Never on the first screen, never during a step, never again once asked.
import {t} from '../i18n/i18n.ts';
import {el, esc} from './ui.ts';
import {icon} from './icons.ts';

export const REPO_URL = 'https://github.com/Alex-2t/home-twin';

// This browser has been asked once: the ask is not shown again.
const STAR_ASKED = 'home-twin-editor:star-asked';

export function openRepo(): void {
  open(REPO_URL, '_blank', 'noopener');
}

function wasAsked(): boolean {
  try {
    return localStorage.getItem(STAR_ASKED) === '1';
  } catch {
    // no storage (a private window): asking each time the dashboard is made is still rare
    return false;
  }
}

function markAsked(): void {
  try {
    localStorage.setItem(STAR_ASKED, '1');
  } catch {}
}

/** The ask, once per browser: the sentence that goes after the message and its link, or null when it was asked before. */
export function starAskOnce(): {sentence: string; link: HTMLElement} | null {
  if (wasAsked()) return null;
  markAsked();
  const label = t('Star on GitHub');
  const link = el(`<button class="soft">${icon('github', 14)}<span>${esc(label)}</span></button>`);
  link.onclick = openRepo;
  return {sentence: t('A star on GitHub helps others find Home Twin.'), link};
}
