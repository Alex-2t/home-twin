// The editor in the Home Assistant panel: real HA (editor/ha-live.js), plan stored in HA (the home_twin integration), no demo apartment.
// Loaded from ha-panel.js after the HA user's language is set.
import './i18n/boot.js';
import {boot} from './boot.js';
import {liveHA,hassPlans} from './editor/ha-live.js';
import {t,setFormats} from './i18n/i18n.js';

export async function start(panel){
  const ha=liveHA(panel.hass);let ed=null;
  // the plan was changed in another window — ask: take that one or write ours over it
  const plans=hassPlans(()=>panel.hass,{onConflict:()=>ed?.banner(t('The plan was changed in another window.'),[
    [t('Load from HA'),()=>window.top.location.reload()],[t('Keep mine'),()=>{plans.keepMine();ed.banner();},true]])});
  ed=await boot({ha,plans});
  addEventListener('pagehide',()=>{plans.flush();ed.history.flush();});
  return {update(h){ha.update(h);setFormats(h.locale);const dark=!!h.themes?.darkMode;if(dark!==globalThis.HOME_TWIN_DARK){globalThis.HOME_TWIN_DARK=dark;ed.applyTheme?.();}}};
}
