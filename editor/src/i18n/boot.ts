// Language comes before the other modules (main.ts imports this first): strings built at load time are already in it.
// The user's own choice (“⋯” menu → “Language”) lives in the editor settings, otherwise the system language (in HA — the HA user's language).
import {setLang, pickLang, setFormats} from './i18n.ts';
import type {UiState} from '../core/types.ts';

let saved: UiState['lang'] | null = null;
try {
  const ui: Partial<UiState> = JSON.parse(localStorage.getItem('home-twin-editor:ui') || '{}');
  saved = ui.lang;
} catch {}
// in the HA panel, ha-panel.ts sets the HA user's language (HOME_TWIN_LANG) before the other modules load
const host = globalThis.HOME_TWIN_LANG;
// A tab the HA panel opened on the site (back from the checkout or a sign-in) carries the panel's language in ?lang: it
// speaks that, not the browser's language or the site's last choice.
const asked = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : null;
setLang(
  (asked && pickLang([asked]) === asked ? asked : null) ||
    saved ||
    pickLang(
      host ? [host] : typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [],
    ),
);
// number and time formats from the HA user's profile (HOME_TWIN_LOCALE = hass.locale); outside HA — by the language
setFormats(globalThis.HOME_TWIN_LOCALE);
