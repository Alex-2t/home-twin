// The dashboard card's 3D and home panel (D-059), loaded by card.js when a card is shown. The language goes first: the other
// modules build some strings when they load, so they are imported only after it is set (as ha-panel.js does for the panel).
import {setLang,pickLang,setFormats} from './i18n/i18n.js';

export async function mount(card,hass,config){
  setLang(pickLang([hass.language]),{page:false});setFormats(hass.locale);
  const {createCard}=await import('./card-main.js');
  return createCard(card,hass,config);
}
