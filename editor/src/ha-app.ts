// The editor in the Home Assistant panel: real HA (editor/ha-live.js), the plan and its photo stored in HA (the home_twin integration), no demo apartment.
// Loaded from ha-panel.js after the HA user's language is set.
import './i18n/boot.ts';
import {boot} from './boot.ts';
import {liveHA, hassPlans, hassPhotos} from './editor/ha-live.ts';
import {browserPhotos} from './editor/underlay.ts';
import {t, setFormats} from './i18n/i18n.ts';
import {haRouter} from './editor/route.ts';
import {UPDATE_NOTICE_CSS, buildOf, createUpdateNotice, reloadPanel, watchBuild} from './frontend-build.ts';
import type {Hass} from './core/types.ts';
import type {Editor} from './editor/editor-types.ts';
import type {PanelRoute, PanelRouter} from './editor/route.ts';

/** The <home-twin-panel> element (ha-panel.ts) as the editor reads it. */
export interface PanelHost {
  readonly hass: Hass | undefined;
  readonly route: PanelRoute | undefined;
}

/** The editor in the panel, as ha-panel.ts drives it: a new route, a new hass. */
export interface PanelApp {
  route: PanelRouter['route'];
  update(h: Hass): void;
}

export async function start(panel: PanelHost): Promise<PanelApp> {
  // the panel starts the editor once HA has given it hass (ha-panel.ts), and HA never takes it back
  const hass = (): Hass => panel.hass!;
  const ha = liveHA(hass());
  let ed: Editor | null = null;
  let asked = false;
  // the plan was changed in another window (or edits that did not reach HA last time clash with it) — take that one or write ours over it;
  // asked before the editor is up (at the start) — shown once it is
  const ask = (): void => {
    if (!ed) {
      asked = true;
      return;
    }
    ed.banner(t('The plan was changed in another window.'), [
      [
        t('Load from HA'),
        () => {
          plans.discard();
          window.top!.location.reload(); // the panel's iframe has a top window
        },
      ],
      [
        t('Keep mine'),
        () => {
          plans.keepMine();
          ed!.banner(); // this banner is shown only once the editor is up
        },
        true,
      ],
    ]);
  };
  // HA serves a newer build of the panel (an update without a restart, D-097): this one keeps working — the integration does not
  // move an open panel — and “Reload” brings the new one. Its own notice, not the banner: the coach reuses the banner, and the start
  // screen covers it. It stays awake over dialogs (keyboard.ts: data-awake).
  const showUpdated = (): void => {
    if (document.querySelector('.ht-updated')) return;
    const style = document.createElement('style');
    style.textContent =
      UPDATE_NOTICE_CSS +
      '.ht-updated{position:fixed;top:68px;left:50%;transform:translateX(-50%);z-index:2147483000}';
    const words = {text: t('Home Twin was updated'), reload: t('Reload')};
    const notice = createUpdateNotice(words, () => reloadPanel(hass()));
    notice.setAttribute('data-awake', '');
    document.head.append(style);
    document.body.append(notice);
  };
  const status = (): void => ed?.syncSave?.();
  const plans = hassPlans(hass, {onConflict: ask, onStatus: status});
  const photos = hassPhotos(hass, {local: browserPhotos, onStatus: status});
  // the page in the panel's path (/home-twin/lights …, D-066): HA sets route on the panel, ha-panel.js passes it on
  const router = haRouter(panel);
  ed = await boot({ha, plans, photos, router});
  // the “Saved” mark at the top: whether HA has everything. While HA is unreachable its frontend holds requests until it is back,
  // so “no connection” comes from hass.connected
  // the shell has it
  document.querySelector('#file-menu .menu-head small')!.textContent = t(
    'The plan is saved in Home Assistant',
  );
  ed.remote = () => {
    const p = plans.state();
    return p === 'conflict'
      ? p
      : panel.hass?.connected === false
        ? 'offline'
        : p !== 'saved'
          ? p
          : photos.state();
  };
  status();
  if (asked) ask();
  // the subscription is made on HA's page's connection, which outlives this iframe: it is ended when the panel closes (below)
  const stopWatchingBuild = watchBuild(hass(), buildOf(import.meta.url), showUpdated, {panel: true});
  addEventListener('pagehide', () => {
    plans.flush();
    photos.flush();
    ed.history.flush();
    stopWatchingBuild();
  });
  let online = panel.hass?.connected;
  return {
    route: router.route,
    update(h: Hass): void {
      ha.update(h);
      setFormats(h.locale);
      if (h.connected !== online) {
        online = h.connected;
        status();
      }
      const dark = !!h.themes?.darkMode;
      if (dark !== globalThis.HOME_TWIN_DARK) {
        globalThis.HOME_TWIN_DARK = dark;
        ed.applyTheme?.();
      }
    },
  };
}
