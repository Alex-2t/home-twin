// Layout of the Preview dashboard (D-050, “Customize panel”): which cards and in what order — like the Android quick settings
// shade: “Add to panel” slides out alongside, cards and devices are dragged there and back.
// Built-in cards — one each (a removed one can be brought back), “Favorites” — as many as you like, each with its own HA entities.
// Stored in the plan, like the scene settings: the home travels into the HA card together with the layout. Overview — plan.panel,
// room screen — room.panel on each room (its own ROOM_BUILTIN cards, its own “Favorites”).
//   panel = {cards: [{id} | {id, type: 'entities', title, entities: [entity_id]}], removed: [built-in id]}
// A built-in card that is neither in cards nor in removed (the layout was saved before it appeared) takes its default place —
// new sections are not lost for those who have already customized the panel. No DOM.
import {N} from '../i18n/i18n.ts';
import type {PanelCard, PanelLayout} from '../core/types.ts';

/** A built-in card: its id, the dashboard section (overview cards), its name, icon, and what is in it. */
export interface BuiltinCard {
  id: string;
  sel?: string;
  name: string;
  icon: string;
  about: string;
}

/** A "Favorites" card. */
export type FavCard = Extract<PanelCard, {type: 'entities'}>;

// built-in cards in default order: sel — the dashboard section, about — what is in it (one line in the settings)
export const BUILTIN: BuiltinCard[] = [
  {id: 'now', sel: '.now-panel', name: N('Now'), icon: 'eye', about: N('What’s on and open')},
  {id: 'scenes', sel: '.scenes-panel', name: N('Scenes'), icon: 'sparkle', about: N('Home, Away, Night')},
  {
    id: 'rooms',
    sel: '.rooms-overview',
    name: N('Rooms'),
    icon: 'home',
    about: N('Climate and lights by room'),
  },
  {
    id: 'controls',
    sel: '.home-controls',
    name: N('Lights & climate'),
    icon: 'sliders',
    about: N('Room lights, covers and ACs'),
  },
  {
    id: 'watch',
    sel: '.watch-panel',
    name: N('Security'),
    icon: 'camera',
    about: N('Camera, water valve, leaks'),
  },
  {
    id: 'vacuum',
    sel: '.vacuum-panel',
    name: N('Cleaning|section'),
    icon: 'vacuum',
    about: N('Robot vacuums'),
  },
  {
    id: 'stats',
    sel: '.stats-panel',
    name: N('Statistics'),
    icon: 'chart',
    about: N('Climate, energy, connectivity'),
  },
];
// room screen: parts in default order (as in 3d_floor: sensors, remote, curtains, lights, “More in the room”)
export const ROOM_BUILTIN: BuiltinCard[] = [
  {id: 'climate', name: N('Climate|indoor'), icon: 'thermometer', about: N('Temperature, humidity, CO₂')},
  {id: 'ac', name: N('Air conditioners'), icon: 'snowflake', about: N('AC and heating controls')},
  {id: 'covers', name: N('Curtains'), icon: 'curtain', about: N('Curtains and blinds')},
  {id: 'lights', name: N('Lighting'), icon: 'bulb', about: N('Room lights')},
  {id: 'extras', name: N('More in the room'), icon: 'door', about: N('Windows, doors and other sensors')},
];
export const isFav = (c: PanelCard | null | undefined): c is FavCard => c?.type === 'entities';

// saved layout → cards in order: [{id} | {id, type, title, entities}]; builtin — overview or room screen
export function resolveLayout(saved: PanelLayout | null | undefined, builtin = BUILTIN): PanelCard[] {
  const IDS = builtin.map(c => c.id);
  const seen = new Set<string>();
  const out: PanelCard[] = [];
  for (const c of saved?.cards || []) {
    if (!c?.id || seen.has(c.id)) continue;
    if (IDS.includes(c.id)) out.push({id: c.id});
    else if (isFav(c))
      out.push({
        id: c.id,
        type: 'entities',
        title: String(c.title || ''),
        entities: [...new Set((c.entities || []).filter(Boolean))],
      });
    else continue;
    seen.add(c.id);
  }
  const removed = new Set(saved?.removed || []);
  IDS.forEach((id, i) => {
    if (seen.has(id) || removed.has(id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex(c => c.id === IDS[j]);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, {id});
    seen.add(id);
  });
  return out;
}

// cards → what to save into the plan; same as default — null (nothing in the plan, the dashboard follows the version)
export function layoutToSave(cards: PanelCard[], builtin = BUILTIN): PanelLayout | null {
  const IDS = builtin.map(c => c.id);
  const plain = cards.map((c): PanelCard =>
    isFav(c) ? {id: c.id, type: 'entities', title: c.title, entities: [...c.entities]} : {id: c.id},
  );
  if (plain.length === IDS.length && plain.every((c, i) => c.id === IDS[i])) return null;
  const removed = IDS.filter(id => !plain.some(c => c.id === id));
  return removed.length ? {cards: plain, removed} : {cards: plain};
}

// what can be added: removed built-ins and a new “Favorites”
export const addable = (cards: PanelCard[], builtin = BUILTIN): string[] => [
  ...builtin.filter(b => !cards.some(c => c.id === b.id)).map(b => b.id),
  'entities',
];
export function newFav(cards: PanelCard[], title: string): FavCard {
  let n = 1;
  while (cards.some(c => c.id === 'fav' + n)) n++;
  return {id: 'fav' + n, type: 'entities', title, entities: []};
}
// Dragging (like the Android quick settings shade): a card goes to position index among the other cards; a new one comes from the shade
export function placeCard(cards: PanelCard[], item: PanelCard, index: number): PanelCard[] {
  const rest = cards.filter(c => c.id !== item.id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, item);
  return rest;
}
// remove an entity from the “Favorites” card from
export const removeEntity = (cards: PanelCard[], entity: string, from: string | null): PanelCard[] =>
  cards.map(c => (c.id === from && isFav(c) ? {...c, entities: c.entities.filter(e => e !== entity)} : c));
// an entity goes into the “Favorites” card at position index (among its other tiles); from another card — it moves over
export function placeEntity(
  cards: PanelCard[],
  entity: string,
  card: string,
  index: number,
  from: string | null = null,
): PanelCard[] {
  const out = from ? removeEntity(cards, entity, from) : cards;
  return out.map(c => {
    if (c.id !== card || !isFav(c)) return c;
    const rest = c.entities.filter(e => e !== entity);
    rest.splice(Math.max(0, Math.min(index, rest.length)), 0, entity);
    return {...c, entities: rest};
  });
}
// an entity between cards: a new “Favorites” with it at position index
export function entityCard(
  cards: PanelCard[],
  entity: string,
  index: number,
  title: string,
  from: string | null = null,
): PanelCard[] {
  const out = from ? removeEntity(cards, entity, from) : cards;
  const fav = {...newFav(out, title), entities: [entity]};
  return placeCard(out, fav, index);
}
// “+” in the shade: the entity goes into the last “Favorites”; if there is none — a new one at the end
export function addEntity(cards: PanelCard[], entity: string, title: string): PanelCard[] {
  const last = [...cards].reverse().find(isFav);
  return last
    ? placeEntity(cards, entity, last.id, last.entities.length)
    : entityCard(cards, entity, cards.length, title);
}
// move a card one step: dir −1 — up, +1 — down
export function move(cards: PanelCard[], id: string, dir: number): PanelCard[] {
  const i = cards.findIndex(c => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cards.length) return cards;
  const out = [...cards];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
