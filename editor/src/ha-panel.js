// The Home Twin panel in Home Assistant (custom_components/home_twin, panel_custom with embed_iframe): HA creates
// <home-twin-panel> in its iframe and sets hass on it (plus narrow, route, panel). The iframe has its own document — we insert
// the styles and the editor shell there and start it (ha-app.js) once the HA registries arrive. Language, number and time formats and theme follow HA.
import {SHELL,BODY,STYLES} from './gen/shell.gen.js';

class HomeTwinPanel extends HTMLElement{
  set hass(h){this._hass=h;if(this._app)this._app.update(h);else if(!this._starting&&h?.areas&&h?.entities)this._start();}
  get hass(){return this._hass;}
  set narrow(v){}set panel(v){}
  set route(v){this._route=v;this._app?.route?.(v);} // the panel's path: the page that is open (editor/route.js, D-066)
  get route(){return this._route;}
  async _start(){this._starting=true;const h=this._hass;
    globalThis.HOME_TWIN_LANG=h.language;globalThis.HOME_TWIN_LOCALE=h.locale;globalThis.HOME_TWIN_DARK=!!h.themes?.darkMode;
    const st=document.createElement('style');st.textContent=STYLES;document.head.append(st);
    for(const [k,v] of BODY)document.body.setAttribute(k,v);
    // the loading cover in the shell is up until the editor has started: in the theme it will have (as app.js: themeName)
    {let th='auto';try{th=JSON.parse(localStorage.getItem('home-twin-editor:ui')||'{}').theme||'auto';}catch{}
      document.documentElement.dataset.theme=th==='dark'||th==='auto'&&globalThis.HOME_TWIN_DARK?'dark':'light';}
    document.body.insertAdjacentHTML('beforeend',SHELL);
    const {start}=await import('./ha-app.js');
    this._app=await start(this);this._app.update(this._hass);}
}
if(!customElements.get('home-twin-panel'))customElements.define('home-twin-panel',HomeTwinPanel);
