// Which build of the Home Twin frontend this code is, and whether Home Assistant serves a newer one (D-NEXT). The integration
// serves every build at its own address, /home_twin_static/<build>/<file>, and tells open pages when it starts serving a new one
// (home_twin/frontend/subscribe). A page keeps the code it has loaded, so the panel and the card offer a reload: it loads the
// new build whole, never a mix of old and new files. Kept small: the card's loader (card.ts) imports it on every HA page.
import type {Hass} from './core/types.ts';

/** /home_twin_static/<build>/<file>.js — the build is the folder (serve.py). */
const BUILD_ADDRESS = /\/home_twin_static\/([^/?#]+)\/[^/?#]+\.js(?:[?#].*)?$/;

/** The build a module was loaded from (its import.meta.url); null where it was not served by the integration (the standalone app). */
export function buildOf(moduleUrl: string): string | null {
  return BUILD_ADDRESS.exec(moduleUrl)?.[1] ?? null;
}

/** An event of home_twin/frontend/subscribe: the build HA serves now. */
interface BuildMessage {
  build: string;
}

function isBuildMessage(message: unknown): message is BuildMessage {
  return typeof (message as BuildMessage | null)?.build === 'string';
}

/** Calls onNewer once, when HA serves a build other than ours — now or later (also after HA restarts: the subscription is
 * renewed). Returns a function that stops watching. Nothing happens outside HA or with an integration from before this command.
 * panel: the editor is open — the integration then keeps the panel where it is until it closes (HA rebuilds a panel whose
 * address changes, which would reload the editor under the user's hands). */
export function watchBuild(
  hass: Hass,
  ours: string | null,
  onNewer: (build: string) => void,
  {panel = false}: {panel?: boolean} = {},
): () => void {
  const connection = hass.connection;
  if (!ours || !connection) return () => {};
  let told = false;
  let stopped = false;
  const onMessage = (message: unknown): void => {
    if (told || stopped || !isBuildMessage(message) || message.build === ours) return;
    told = true;
    onNewer(message.build);
  };
  // an older integration answers unknown_command: there is nothing to watch then
  const unsubscribe = connection
    .subscribeMessage(onMessage, {type: 'home_twin/frontend/subscribe', ...(panel ? {panel} : {})})
    .catch(() => null);
  return () => {
    stopped = true;
    unsubscribe.then(stop => stop?.()).catch(() => {});
  };
}

/** Reloads the whole HA page, also from the panel's iframe: HA then hands out the new build's addresses. */
export function reloadPage(): void {
  (window.top ?? window).location.reload();
}

/** The editor's “Reload”: the panel is moved to the newest build first (it stays where it is while an editor is open), then the
 * page reloads. An integration without the command: the page reloads all the same. */
export async function reloadPanel(hass: Hass): Promise<void> {
  try {
    await hass.callWS({type: 'home_twin/frontend/update_panel'});
  } catch {
    // an older integration, or HA unreachable: the reload still brings what HA serves
  }
  reloadPage();
}

/** The language a notice is shown in: HA's language, or its base ('pt-BR' → 'pt'), else English (as i18n.ts pickLang). */
export function noticeLang(language: string | undefined, languages: readonly string[]): string {
  const base = String(language || '')
    .toLowerCase()
    .split(/[-_]/)[0];
  return languages.includes(base) ? base : 'en';
}

/** The look of the notice; the card and the panel place it (card.ts: over the card; ha-app.ts: over the editor). HA's theme
 * colours where there are some (the card), the editor's own fallbacks otherwise. */
export const UPDATE_NOTICE_CSS = `.ht-updated{display:flex;align-items:center;gap:10px;max-width:calc(100% - 24px);box-sizing:border-box;
  padding:5px 5px 5px 14px;border-radius:18px;font-size:13px;line-height:1.3;white-space:nowrap;
  color:var(--primary-text-color,#f2f2f5);background:color-mix(in srgb,var(--card-background-color,#1c1c1f) 88%,transparent);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 2px 12px rgba(0,0,0,.28)}
.ht-updated span{overflow:hidden;text-overflow:ellipsis}
.ht-updated button{flex-shrink:0;padding:6px 12px;border:0;border-radius:14px;font:inherit;font-weight:500;cursor:pointer;
  color:var(--text-primary-color,#fff);background:var(--primary-color,#03a9f4)}`;

/** “Home Twin was updated · Reload”: one short phrase and the button (the words in the user's language). */
export function createUpdateNotice(words: {text: string; reload: string}, onReload: () => void): HTMLElement {
  const notice = document.createElement('div');
  notice.className = 'ht-updated';
  notice.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = words.text;
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = words.reload;
  reload.addEventListener('click', onReload);
  notice.append(text, reload);
  return notice;
}
