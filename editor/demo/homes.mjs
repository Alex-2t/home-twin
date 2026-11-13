// The ten typical homes (D-030, docs/research/typical-homes.md): the reference set the editor is checked on; and three designer
// interiors (D-062: loft, minimalist, Japandi) that open the start screen's examples.
// src/core/homes.test.js runs the plan checks on every home; the standalone editor shows them on the start screen as examples (D-062).
// Each module is like typical.mjs: export default async () => ({HA, DEMO, DEMO_UNDERLAY}). Made up: nobody's home.
// Houses are the ground floor for now: the editor is single-floor (typical-homes.md, “What the editor needs”).
import {dress, daylight} from './kit.mjs';
// style — how the home is finished (kit.mjs: STYLES): each its own, so the examples do not all look the same; a module may return its own
// STYLE (an object of the same shape) and finish rooms itself (room.wall, room.floor, room.wf); by day its ceiling lights are off
const load = (name, style) => async () => {
  const {STYLE, ...d} = await (await import(`./${name}.mjs`)).default();
  return {...d, DEMO: daylight(d.HA, dress(d.DEMO, STYLE || style))};
};
export const HOMES = [
  {
    id: 'studio',
    title: '1. Studio',
    what: 'kitchen along a wall, living area, shower room with a washing machine',
    load: load('homes/studio', 'scandi'),
  },
  {
    id: 'one-bed',
    title: '2. One-bedroom, separate kitchen',
    what: 'kitchen with a table, one room, combined bathroom with a bathtub, hallway',
    load: load('homes/one-bed', 'warm'),
  },
  {
    id: 'euro-two',
    title: '3. Euro two-room',
    what: 'kitchen-living room with an island, bedroom, bathroom, laundry niche, balcony',
    load: load('homes/euro-two', 'modern'),
  },
  {
    id: 'old-two',
    title: '4. Old-type two-room',
    what: 'small kitchen with a gas boiler, living room, bedroom, separate bathroom and toilet, balcony',
    load: load('homes/old-two', 'classic'),
  },
  {
    id: 'family',
    title: '5. Three-room family',
    what: "living room, bedroom, kids' room, kitchen, bathroom, hallway, balcony — the demo apartment",
    load: load('typical', 'warm'),
  },
  {
    id: 'large',
    title: '6. Large, two bathrooms',
    what: "kitchen-living room, bedroom with a walk-in closet and its own bathroom, two kids' rooms, guest bathroom, laundry",
    load: load('homes/large', 'modern'),
  },
  {
    id: 'altbau',
    title: '7. Older building',
    what: 'large rooms, a bay window, an irregular room, kitchen with gas',
    load: load('homes/altbau', 'classic'),
  },
  {
    id: 'loft',
    title: '11. Loft',
    what: 'a converted industrial space: open kitchen-living-dining, big steel windows, bedroom, bathroom',
    load: load('homes/loft', 'loft'),
  },
  {
    id: 'minimal',
    title: '12. Minimalist apartment',
    what: 'calm and spare: open living and kitchen with an island, bedroom with a walk-in closet, bathroom',
    load: load('homes/minimal', 'minimal'),
  },
  {
    id: 'japandi',
    title: '13. Japandi apartment',
    what: 'light wood and low furniture: living room, dining, bedroom, a small study, bathroom',
    load: load('homes/japandi', 'japandi'),
  },
  {
    id: 'townhouse',
    title: '8. Terraced house, ground floor',
    what: 'kitchen-dining-living room, guest toilet, hallway, garden',
    load: load('homes/townhouse', 'scandi'),
  },
  {
    id: 'bungalow',
    title: '9. Single-story house',
    what: 'kitchen with an island, living room, 3 bedrooms, 2 bathrooms, laundry, garage, terrace',
    load: load('homes/bungalow', 'warm'),
  },
  {
    id: 'house',
    title: '10. Two-story house, ground floor',
    what: 'living room, dining room, kitchen, study, guest toilet, utility room, garage',
    load: load('homes/house', 'green'),
  },
];
