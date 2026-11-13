// The editor in the Home Assistant panel: real HA (editor/ha-live.js), the plan and its photo stored in HA (the home_twin integration), no demo apartment.
// Loaded from ha-panel.js after the HA user's language is set.
import './i18n/boot.js';
import {boot} from './boot.js';
import {liveHA, hassPlans, hassPhotos} from './editor/ha-live.js';
import {browserPhotos} from './editor/underlay.js';
import {t, setFormats} from './i18n/i18n.js';
import {haRouter} from './editor/route.js';

export async function start(panel) {
  const ha = liveHA(panel.hass);
  let ed = null,
    asked = false;
  // the plan was changed in another window (or edits that did not reach HA last time clash with it) — take that one or write ours over it;
  // asked before the editor is up (at the start) — shown once it is
  const ask = () => {
    if (!ed) {
      asked = true;
      return;
    }
    ed.banner(t('The plan was changed in another window.'), [
      [
        t('Load from HA'),
        () => {
          plans.discard();
          window.top.location.reload();
        },
      ],
      [
        t('Keep mine'),
        () => {
          plans.keepMine();
          ed.banner();
        },
        true,
      ],
    ]);
  };
  const status = () => ed?.syncSave?.();
  const plans = hassPlans(() => panel.hass, {onConflict: ask, onStatus: status});
  const photos = hassPhotos(() => panel.hass, {local: browserPhotos, onStatus: status});
  // the page in the panel's path (/home-twin/lights …, D-066): HA sets route on the panel, ha-panel.js passes it on
  const router = haRouter(panel);
  ed = await boot({ha, plans, photos, router});
  // the “Saved” mark at the top: whether HA has everything. While HA is unreachable its frontend holds requests until it is back,
  // so “no connection” comes from hass.connected
  document.querySelector('#file-menu .menu-head small').textContent = t(
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
  addEventListener('pagehide', () => {
    plans.flush();
    photos.flush();
    ed.history.flush();
  });
  let online = panel.hass?.connected;
  return {
    route: router.route,
    update(h) {
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
