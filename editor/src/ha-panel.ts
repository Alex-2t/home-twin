// The Home Twin panel in Home Assistant (custom_components/home_twin, panel_custom with embed_iframe): HA creates
// <home-twin-panel> in its iframe and sets hass on it (plus narrow, route, panel). The iframe has its own document — we insert
// the styles and the editor shell there and start it (ha-app.js) once the HA registries arrive. Language, number and time formats and theme follow HA.
import {SHELL, BODY, STYLES} from './gen/shell.gen.js';
import type {PanelApp, PanelHost} from './ha-app.ts';
import type {PanelRoute} from './editor/route.ts';
import type {Hass, UiState} from './core/types.ts';

class HomeTwinPanel extends HTMLElement implements PanelHost {
  // the panel's own state; declared only, so nothing extra is set up on the element
  declare _hass: Hass | undefined;
  declare _app: PanelApp | undefined;
  declare _starting: boolean | undefined;
  declare _route: PanelRoute | undefined;
  set hass(h: Hass) {
    this._hass = h;
    if (this._app) this._app.update(h);
    else if (!this._starting && h?.areas && h?.entities) this._start();
  }
  get hass(): Hass | undefined {
    return this._hass;
  }
  set narrow(v: boolean) {}
  set panel(v: unknown) {}
  set route(v: PanelRoute) {
    this._route = v;
    this._app?.route?.(v);
  } // the panel's path: the page that is open (editor/route.js, D-066)
  get route(): PanelRoute | undefined {
    return this._route;
  }
  async _start(): Promise<void> {
    this._starting = true;
    const h = this._hass!; // the hass setter starts the panel once it has set it
    globalThis.HOME_TWIN_LANG = h.language;
    globalThis.HOME_TWIN_LOCALE = h.locale;
    globalThis.HOME_TWIN_DARK = !!h.themes?.darkMode;
    const st = document.createElement('style');
    st.textContent = STYLES;
    document.head.append(st);
    for (const [k, v] of BODY) document.body.setAttribute(k, v);
    // the loading cover in the shell is up until the editor has started: in the theme it will have (as app.js: themeName)
    {
      let th = 'auto';
      try {
        // the editor's saved screen settings
        th =
          (JSON.parse(localStorage.getItem('home-twin-editor:ui') || '{}') as Partial<UiState>).theme ||
          'auto';
      } catch {}
      document.documentElement.dataset.theme =
        th === 'dark' || (th === 'auto' && globalThis.HOME_TWIN_DARK) ? 'dark' : 'light';
    }
    document.body.insertAdjacentHTML('beforeend', SHELL);
    const {start} = await import('./ha-app.ts');
    this._app = await start(this);
    this._app.update(this._hass!); // set before the start
  }
}
if (!customElements.get('home-twin-panel')) customElements.define('home-twin-panel', HomeTwinPanel);
