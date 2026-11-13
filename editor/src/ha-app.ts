// The editor in the Home Assistant panel: real HA (editor/ha-live.js), the plan and its photo stored in HA (the home_twin integration), no demo apartment.
// Loaded from ha-panel.js after the HA user's language is set.
import './i18n/boot.ts';
import {boot} from './boot.ts';
import {liveHA, hassPlans, hassPhotos} from './editor/ha-live.ts';
import {browserPhotos} from './editor/underlay.ts';
import {t, setFormats} from './i18n/i18n.ts';
import {haRouter} from './editor/route.ts';
import type {Editor} from './boot.ts';
import type {HaLayer, Hass} from './core/types.ts';

/** The route HA sets on the panel: the panel's own path and the page's path after it (/home-twin, /lights). */
export interface PanelRoute {
  prefix?: string;
  path?: string;
}

/** The <home-twin-panel> element (ha-panel.ts) as the editor reads it. */
export interface PanelHost {
  readonly hass: Hass | undefined;
  readonly route: PanelRoute | undefined;
}

/** The editor in the panel, as ha-panel.ts drives it: a new route, a new hass. */
export interface PanelApp {
  route: ReturnType<typeof haRouter>['route'];
  update(h: Hass): void;
}

// The options hassPlans and hassPhotos take, as ha-live.ts (still untyped) infers them.
type PlansOptions = Parameters<typeof hassPlans>[1];
type PhotosOptions = Parameters<typeof hassPhotos>[1];

// The live HA layer (ha-live.ts): it has the update the demo lacks.
type LiveHaLayer = HaLayer & Required<Pick<HaLayer, 'update'>>;

export async function start(panel: PanelHost): Promise<PanelApp> {
  // ha-live.ts is still untyped: liveHA makes the HA layer
  const ha = liveHA(panel.hass) as LiveHaLayer;
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
  const status = (): void => ed?.syncSave?.();
  // ha-live.ts is still untyped: hassPlans and hassPhotos infer their options from the one with a default
  const plans = hassPlans(() => panel.hass, {onConflict: ask, onStatus: status} as PlansOptions);
  const photos = hassPhotos(() => panel.hass, {local: browserPhotos, onStatus: status} as PhotosOptions);
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
  addEventListener('pagehide', () => {
    plans.flush();
    photos.flush();
    ed.history.flush();
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
