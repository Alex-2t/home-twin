// The Home Twin panel in Home Assistant (custom_components/home_twin, panel_custom with embed_iframe): HA creates
// <home-twin-panel> in its iframe and sets hass on it (plus narrow, route, panel). The iframe has its own document — we insert
// the styles and the editor shell there and start it (ha-app.js) once the HA registries arrive. Language, number and time formats and theme follow HA.
import {SHELL,BODY,STYLES} from './gen/shell.gen.js';

class HomeTwinPanel extends HTMLElement{
  set hass(h){this._hass=h;if(this._app)this._app.update(h);else if(!this._starting&&h?.areas&&h?.entities)this._start();}
  get hass(){return this._hass;}
  set narrow(v){}set route(v){}set panel(v){}
  async _start(){this._starting=true;const h=this._hass;
    globalThis.HOME_TWIN_LANG=h.language;globalThis.HOME_TWIN_LOCALE=h.locale;globalThis.HOME_TWIN_DARK=!!h.themes?.darkMode;
    const st=document.createElement('style');st.textContent=STYLES;document.head.append(st);
    for(const [k,v] of BODY)document.body.setAttribute(k,v);
    document.body.insertAdjacentHTML('beforeend',SHELL);
    const {start}=await import('./ha-app.js');
    this._app=await start(this);this._app.update(this._hass);}
}
if(!customElements.get('home-twin-panel'))customElements.define('home-twin-panel',HomeTwinPanel);
