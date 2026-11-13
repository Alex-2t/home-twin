// The Home Twin card for dashboards (D-059): <home-twin-card>, “Home Twin” in HA's card picker. The integration has HA load this
// small file on every page, so nothing has to be set up by hand; the 3D and the home panel (card-app.js, a few MB) load only when
// a card is actually shown. No imports here — this file must stay small.
const APP = new URL('./card-app.js' + new URL(import.meta.url).search, import.meta.url).href; // the same ?v= as this file: a new build — a new address
const BOARD = 'home-twin-3d'; // the Home Twin dashboard the editor creates (editor/ha-live.js: board)

class HomeTwinCard extends HTMLElement {
  static getStubConfig() {
    return {};
  }
  setConfig(config) {
    this._config = config || {};
    this._app?.config(this._config);
  }
  set hass(h) {
    this._hass = h;
    if (this._app) this._app.update(h);
    else this._load();
  }
  get hass() {
    return this._hass;
  }
  // in a panel view the card fills the screen; in a sections view — the rows HA gives it; elsewhere — its own height
  set isPanel(v) {
    this.toggleAttribute('panel', !!v);
  }
  set layout(v) {
    this.toggleAttribute('grid', v === 'grid');
  }
  // Compact — the 3D, the room strip and “Now”; a tap opens the whole home on the Home Twin dashboard. So it is on an ordinary
  // dashboard once that dashboard exists; in a panel view, or without it, the card is the whole home itself. compact: false in YAML — never.
  get compact() {
    return this._config?.compact !== false && !this.hasAttribute('panel') && !!this._hass?.panels?.[BOARD];
  }
  getCardSize() {
    return this.compact ? 7 : 12;
  }
  getGridOptions() {
    return this.compact
      ? {columns: 'full', rows: 6, min_rows: 4, min_columns: 6}
      : {columns: 'full', rows: 10, min_rows: 6, min_columns: 6};
  }
  // taken off the page: HA may put it back (another dashboard and back, edit mode), or it is gone for good — HA does not say which.
  // At once the 3D stops drawing; not back within a minute — everything is let go, and put back later it starts anew
  connectedCallback() {
    clearTimeout(this._bye);
    if (this._app) this._app.resume();
    else this._load();
  }
  disconnectedCallback() {
    this._app?.pause();
    clearTimeout(this._bye);
    this._bye = setTimeout(() => {
      const a = this._app;
      this._app = null;
      this._loading = false;
      a?.destroy();
    }, 6e4);
  }
  async _load() {
    if (this._loading || !this._hass || !this.isConnected) return;
    this._loading = true;
    try {
      const {mount} = await import(APP);
      this._app = await mount(this, this._hass, this._config || {});
      if (!this.isConnected) this._app.pause();
    } catch (e) {
      console.error('Home Twin card:', e);
      this._loading = false;
    }
  }
}
if (!customElements.get('home-twin-card')) {
  customElements.define('home-twin-card', HomeTwinCard);
  (window.customCards ??= []).push({
    type: 'home-twin-card',
    name: 'Home Twin',
    description: 'Your home in 3D, live: lights, climate, curtains and sensors.',
    preview: false,
    documentationURL: 'https://github.com/Alex-2t/home-twin',
  });
}
