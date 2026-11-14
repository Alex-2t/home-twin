// The Home Twin card for dashboards (D-059): <home-twin-card>, “Home Twin” in HA's card picker. The integration has HA load this
// small file on every page, so nothing has to be set up by hand; the 3D and the home panel (card-app.js, a few MB) load only when
// a card is actually shown. This file must stay small: it imports only the build watch and the notice's words (type imports are erased).
// When HA starts serving a newer build (an update without a restart), the cards on the page say so and offer a reload; an old card
// never loads the new build's card-app.js (D-097).
import {
  UPDATE_NOTICE_CSS,
  buildOf,
  createUpdateNotice,
  noticeLang,
  reloadPage,
  watchBuild,
} from './frontend-build.ts';
import {UPDATE_NOTICE} from './gen/update-notice.gen.js';
import type {CardApp, CardConfig, CardHost} from './card-main.ts';
import type {Hass} from './core/types.ts';

/** An entry of HA's card picker. */
interface CustomCardEntry {
  type: string;
  name: string;
  description: string;
  preview: boolean;
  documentationURL: string;
}

declare global {
  interface Window {
    /** The cards HA's card picker offers besides its own. */
    customCards?: CustomCardEntry[];
  }
}

const APP = new URL('./card-app.js', import.meta.url).href; // beside this file: the same build's folder (serve.py)
const BOARD = 'home-twin-3d'; // the Home Twin dashboard the editor creates (editor/ha-live.js: board)
const OURS = buildOf(import.meta.url);
// the notice over the card (over the 3D's top edge), or in its place when the 3D could not load
const NOTICE_PLACE = `.ht-updated{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:9}
ha-card.ht-alone{display:block;position:relative;min-height:64px}`;

// One watch per page for every card: HA tells when it serves a newer build than this file's.
const shownCards = new Set<HomeTwinCard>();
let newerBuild = false;
let watching = false;
function watchOnce(hass: Hass): void {
  if (watching) return;
  watching = true;
  watchBuild(hass, OURS, () => {
    newerBuild = true;
    for (const card of shownCards) card._showUpdated();
  });
}

class HomeTwinCard extends HTMLElement implements CardHost {
  // the card's own state; declared only, so nothing extra is set up on the element
  declare _config: CardConfig | undefined;
  declare _hass: Hass | undefined;
  declare _app: CardApp | null | undefined;
  declare _loading: boolean | undefined;
  declare _bye: ReturnType<typeof setTimeout> | undefined;
  static getStubConfig(): CardConfig {
    return {};
  }
  setConfig(config: CardConfig | null | undefined): void {
    this._config = config || {};
    this._app?.config(this._config);
  }
  set hass(h: Hass) {
    this._hass = h;
    watchOnce(h);
    if (this._app) this._app.update(h);
    else this._load();
  }
  get hass(): Hass | undefined {
    return this._hass;
  }
  // in a panel view the card fills the screen; in a sections view — the rows HA gives it; elsewhere — its own height
  set isPanel(v: boolean) {
    this.toggleAttribute('panel', !!v);
  }
  set layout(v: string) {
    this.toggleAttribute('grid', v === 'grid');
  }
  // Compact — the 3D, the room strip and “Now”; a tap opens the whole home on the Home Twin dashboard. So it is on an ordinary
  // dashboard once that dashboard exists; in a panel view, or without it, the card is the whole home itself. compact: false in YAML — never.
  get compact(): boolean {
    return this._config?.compact !== false && !this.hasAttribute('panel') && !!this._hass?.panels?.[BOARD];
  }
  getCardSize(): number {
    return this.compact ? 7 : 12;
  }
  getGridOptions(): {columns: 'full'; rows: number; min_rows: number; min_columns: number} {
    return this.compact
      ? {columns: 'full', rows: 6, min_rows: 4, min_columns: 6}
      : {columns: 'full', rows: 10, min_rows: 6, min_columns: 6};
  }
  // taken off the page: HA may put it back (another dashboard and back, edit mode), or it is gone for good — HA does not say which.
  // At once the 3D stops drawing; not back within a minute — everything is let go, and put back later it starts anew
  connectedCallback(): void {
    shownCards.add(this);
    clearTimeout(this._bye);
    if (this._app) this._app.resume();
    else this._load();
  }
  disconnectedCallback(): void {
    shownCards.delete(this);
    this._app?.pause();
    clearTimeout(this._bye);
    this._bye = setTimeout(() => {
      const a = this._app;
      this._app = null;
      this._loading = false;
      a?.destroy();
    }, 6e4);
  }
  async _load(): Promise<void> {
    if (this._loading || !this._hass || !this.isConnected) return;
    this._loading = true;
    try {
      // APP is card-app.js, built from card-app.ts
      const {mount}: typeof import('./card-app.ts') = await import(APP);
      this._app = await mount(this, this._hass, this._config || {});
      if (!this.isConnected) this._app.pause();
      // the mount drew the card anew: the notice goes back over it
      if (newerBuild) this._showUpdated();
    } catch (e) {
      // after an update without a restart this build's card-app.js is gone: the notice says so once HA has told which build it serves
      console.error('Home Twin card:', e);
      this._loading = false;
      if (newerBuild) this._showUpdated();
    }
  }
  // “Home Twin was updated · Reload”: over the card, or in its place when the 3D did not load
  _showUpdated(): void {
    const root = this.shadowRoot ?? this.attachShadow({mode: 'open'});
    if (root.querySelector('.ht-updated')) return;
    let box = root.querySelector('ha-card');
    if (!box) {
      box = document.createElement('ha-card');
      box.className = 'ht-alone';
      root.append(box);
    }
    const words = UPDATE_NOTICE[noticeLang(this._hass?.language, Object.keys(UPDATE_NOTICE))];
    const style = document.createElement('style');
    style.textContent = UPDATE_NOTICE_CSS + NOTICE_PLACE;
    box.append(style, createUpdateNotice(words, reloadPage));
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
