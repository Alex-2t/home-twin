// Language comes before the other modules (main.js imports this first): strings built at load time are already in it.
// The user's own choice (“⋯” menu → “Language”) lives in the editor settings, otherwise the system language (in HA — the HA user's language).
import {setLang, pickLang, setFormats} from './i18n.js';
let saved = null;
try {
  saved = JSON.parse(localStorage.getItem('home-twin-editor:ui') || '{}').lang;
} catch {}
// in the HA panel, ha-panel.js sets the HA user's language (HOME_TWIN_LANG) before the other modules load
const host = globalThis.HOME_TWIN_LANG;
setLang(
  saved ||
    pickLang(
      host ? [host] : typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [],
    ),
);
// number and time formats from the HA user's profile (HOME_TWIN_LOCALE = hass.locale); outside HA — by the language
setFormats(globalThis.HOME_TWIN_LOCALE);
