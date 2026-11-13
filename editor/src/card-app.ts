// The dashboard card's 3D and home panel (D-059), loaded by card.js when a card is shown. The language goes first: the other
// modules build some strings when they load, so they are imported only after it is set (as ha-panel.js does for the panel).
import {setLang, pickLang, setFormats} from './i18n/i18n.ts';
import type {CardApp, CardConfig, CardHost} from './card-main.ts';
import type {Hass} from './core/types.ts';

export async function mount(card: CardHost, hass: Hass, config: CardConfig): Promise<CardApp> {
  setLang(pickLang([hass.language]), {page: false});
  setFormats(hass.locale);
  const {createCard} = await import('./card-main.ts');
  return createCard(card, hass, config);
}
