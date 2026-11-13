// Typical home 10 (docs/research/typical-homes.md, D-030): a German two-story detached house with a basement, ground floor only —
// the editor is single-floor. Street to the north: hallway with the staircase, guest WC, study, kitchen and the utility room next to the
// attached garage; the living and dining rooms face the garden to the south. About 97 m² indoors.
// Design concept (made up, nobody's house): green and walnut. The art deco wallpaper of the “green” style on the living room's media wall,
// deep green plaster in the study (a small library) and behind the dining room's sideboard, green zellige and green marble; walnut is the
// one wood (the TV wall's bookcases, the dining set, the kitchen fronts, the study's bookcases); warm sand and linen textiles, terracotta
// accents (armchairs, the study's sofa bed, pots, a runner, a bike); dark herringbone floors. A wood stove warms the living room's
// reading corner; pendants hang over the dining table; the emerald car stands in the garage.
// A door between two rooms sits 1 cm off the wall middle towards the room its leaf swings into. The wall face is 5 cm inside a room's
// outline, so items stand with their backs 5 cm in.
import {door, win, F, haLight, sensorKit, deviceKit, stats, WEATHER, worktop} from '../kit.ts';
import type {DemoHomeSource, DemoLight, DemoPlan, DemoPlanLight, DemoRoom, RoomFinish} from '../kit.ts';
import type {DemoHaData, FurnitureItem, LooseOpening} from '../../src/core/types.ts';

const FV = (v: string, ...a: Parameters<typeof F>): FurnitureItem => ({...F(...a), v}); // an item in a catalog variant
const Z = (z: number, f: FurnitureItem): FurnitureItem => ({...f, z}); // an item at its own height above the floor
const custom = (
  id: string,
  name: string,
  x: number,
  y: number,
  rot: number,
  w: number,
  d: number,
  h: number,
  color: string,
  extra: Partial<FurnitureItem> = {},
): FurnitureItem => ({
  ...F(id, 'custom', x, y, rot, w, d, h, color),
  name,
  ...extra,
});

const ROOMS: DemoRoom[] = [
  {
    id: 'living',
    short: 'Living room',
    polygon: [
      [0, 0],
      [6.3, 0],
      [6.3, 4.8],
      [0, 4.8],
    ],
  },
  {
    id: 'dining',
    short: 'Dining room',
    polygon: [
      [6.4, 0],
      [10.4, 0],
      [10.4, 4.8],
      [6.4, 4.8],
    ],
  },
  {
    id: 'study',
    short: 'Study',
    polygon: [
      [0, 4.9],
      [2.6, 4.9],
      [2.6, 9.6],
      [0, 9.6],
    ],
  },
  {
    id: 'wc',
    short: 'Guest WC',
    polygon: [
      [2.7, 7.8],
      [3.9, 7.8],
      [3.9, 9.6],
      [2.7, 9.6],
    ],
  },
  {
    id: 'hall',
    short: 'Hallway',
    polygon: [
      [2.7, 4.9],
      [5.6, 4.9],
      [5.6, 9.6],
      [4, 9.6],
      [4, 7.7],
      [2.7, 7.7],
    ],
  },
  {
    id: 'kitchen',
    short: 'Kitchen',
    polygon: [
      [5.7, 4.9],
      [8.6, 4.9],
      [8.6, 9.6],
      [5.7, 9.6],
    ],
  },
  {
    id: 'utility',
    short: 'Utility room',
    polygon: [
      [8.7, 4.9],
      [10.4, 4.9],
      [10.4, 9.6],
      [8.7, 9.6],
    ],
  },
  {
    id: 'garage',
    short: 'Garage',
    polygon: [
      [10.6, 3],
      [13.8, 3],
      [13.8, 9.6],
      [10.6, 9.6],
    ],
  },
];
// Finishes on top of the “green” style (homes.ts): the study is deep green plaster all round (the style adds the art deco wallpaper
// behind the desk), the dining room's north wall behind the sideboard is deep green plaster (edge 2), the kitchen keeps its zellige
// behind the cabinet runs but not on the tall-unit wall with the hall door (edge 3), the utility room is tiled to 1.2 m.
const GREEN = '#4f5c4a';
const FINISH: Partial<Record<string, RoomFinish>> = {
  study: {wall: 'plaster', wallTint: GREEN},
  dining: {wf: [null, null, {k: 'plaster', tint: GREEN}, null]},
  kitchen: {wf: [null, null, null, {k: 'paintWarm', tint: '#cdc8ba'}]},
  utility: {wall: 'tilePanel', floor: 'stone'},
};

const OPENINGS: LooseOpening[] = [
  door([4.45, 9.6], [5.45, 9.6], 2.2), // front door
  door([3.94, 8], [3.94, 8.7]), // hallway ↔ guest WC
  win([3.05, 9.6], [3.55, 9.6], 1.4, 2), // guest WC
  door([2.64, 5.4], [2.64, 6.25]), // hallway ↔ study
  door([3, 4.84], [3.85, 4.84]), // hallway ↔ living room
  door([5.66, 8.1], [5.66, 8.9]), // hallway ↔ kitchen
  door([7.6, 4.84], [8.45, 4.84]), // kitchen ↔ dining room
  door([8.66, 8.4], [8.66, 9.2]), // kitchen ↔ utility room
  door([10.51, 5.6], [10.51, 6.45]), // utility room ↔ garage, opens into the garage
  door([10.95, 9.6], [13.45, 9.6], 2.1), // garage door
  door([12.75, 3], [13.6, 3]), // garage, to the garden
  door([1, 0], [3.4, 0], 2.3), // lift-and-slide terrace door
  win([4.2, 0], [5.8, 0], 0.5, 2.3),
  win([0, 1.4], [0, 3.4], 0.8, 2.3), // living room
  {...door([6.35, 0.9], [6.35, 3.3], 2.3), leaf: false}, // living room ↔ dining room, wide opening
  win([7.3, 0], [9.5, 0], 0.6, 2.3),
  win([10.4, 0.8], [10.4, 2.2], 0.8, 2.3), // dining room
  win([0, 6.2], [0, 7.8], 0.8, 2.3), // study
  win([6.6, 9.6], [7.9, 9.6], 1, 2.2), // kitchen, over the sink
  win([9.2, 9.6], [9.9, 9.6], 1.3, 2), // utility room
];

const FURNITURE: FurnitureItem[] = [
  // living room, lounge: a sand sofa facing the art deco media wall (a walnut TV bench between two walnut bookcases, the TV, a soundbar,
  // books and candles), a walnut coffee table with books and candles on a big linen rug, two terracotta armchairs facing each other,
  // a walnut side table with a vase, a floor lamp behind the sofa, a monstera, olive curtains on the terrace door and the windows
  F('l1', 'loungeSofa', 1.5, 1.75, 180, 2.4, 1, 0.82, 'sand'),
  F('l2', 'rug', 1.55, 3.05, 0, 2.9, 2.2, 0.012, 'linen'),
  FV('rect', 'l3', 'tableCoffee', 1.5, 2.95, 0, 1.2, 0.65, 0.38, 'walnut'),
  Z(0.38, FV('books', 'l4', 'decor', 1.2, 2.95, 0, 0.3, 0.22, 0.14, 'terracotta')),
  Z(0.38, FV('candles', 'l5', 'decor', 1.82, 2.95, 0, 0.32, 0.14, 0.22, 'sand')),
  F('l6', 'loungeChair', 0.48, 3, 90, 0.8, 0.8, 0.8, 'terracotta'),
  F('l7', 'loungeChair', 2.55, 3, 270, 0.8, 0.8, 0.8, 'terracotta'),
  FV('round', 'l8', 'sideTable', 2.95, 1.75, 0, 0.45, 0.45, 0.55, 'walnut'),
  Z(0.55, FV('vase', 'l9', 'decor', 2.95, 1.75, 0, 0.18, 0.18, 0.45, 'white')),
  F('l10', 'lampRoundFloor', 0.3, 0.9, 0, 0.36, 0.36, 1.6, 'linen'),
  F('l11', 'tvStand', 1.5, 4.53, 0, 1.8, 0.44, 0.5, 'walnut'),
  Z(0.9, F('l12', 'tv', 1.5, 4.72, 0, 1.45, 0.06, 0.84)),
  Z(0.5, F('l13', 'soundbar', 1.5, 4.6, 0, 0.9, 0.1, 0.07, 'black')),
  F('l14', 'shelf', 0.33, 4.575, 0, 0.5, 0.35, 2.2, 'walnut'),
  F('l15', 'shelf', 2.67, 4.575, 0, 0.5, 0.35, 2.2, 'walnut'),
  Z(0.5, FV('books', 'l16', 'decor', 0.85, 4.5, 0, 0.3, 0.22, 0.2, 'sand')),
  Z(0.5, FV('candles', 'l17', 'decor', 2.15, 4.5, 0, 0.32, 0.14, 0.22, 'black')),
  FV('monstera', 'l18', 'pottedPlant', 0.4, 3.9, 0, 0.6, 0.6, 0.95, 'sand'),
  FV('open', 'l19', 'curtains', 2.2, 0.12, 180, 2.8, 0.14, 2.55, 'olive'),
  FV('open', 'l20', 'curtains', 5, 0.12, 180, 2, 0.14, 2.55, 'olive'),
  FV('open', 'l21', 'curtains', 0.12, 2.4, 90, 2.4, 0.14, 2.55, 'olive'),
  // living room, reading corner: a wood stove with its flue and a firewood rack in the north-east corner, a sand armchair turned to the fire
  // with a reading lamp, a walnut sideboard with a table lamp, books and a vase under a picture, a fiddle-leaf fig by the garden window
  custom('l22', 'Wood stove', 5.8, 4.25, 0, 0.5, 0.5, 1.1, 'black', {v: 'cyl'}),
  Z(1.1, custom('l23', 'Stove flue', 5.8, 4.25, 0, 0.14, 0.14, 1.48, 'black', {v: 'cyl'})),
  custom('l24', 'Firewood rack', 6, 3.6, 90, 0.4, 0.35, 0.45, 'walnut'),
  F('l25', 'loungeChair', 5, 3.35, 135, 0.8, 0.8, 0.78, 'sand'),
  F('l26', 'lampRoundFloor', 4.4, 3.95, 0, 0.36, 0.36, 1.55, 'sand'),
  F('l27', 'sideboard', 4.65, 4.525, 0, 1.4, 0.45, 0.75, 'walnut'),
  Z(1.25, FV('art', 'l28', 'picture', 4.65, 4.735, 0, 1, 0.03, 0.7, 'oak')),
  Z(0.75, FV('books', 'l29', 'decor', 4.75, 4.5, 0, 0.3, 0.22, 0.18, 'terracotta')),
  Z(0.75, FV('vase', 'l30', 'decor', 5.15, 4.5, 0, 0.18, 0.18, 0.5, 'sand')),
  FV('ficus', 'l31', 'pottedPlant', 6, 0.45, 0, 0.55, 0.55, 1.8, 'terracotta'),
  // dining room: an extended walnut table for eight with walnut chairs on a sand rug, hydrangeas and candles on it, three pendants above;
  // a walnut sideboard with a table lamp, books and a vase on the deep green wall under a picture, a walnut display cabinet by the opening,
  // a sage bar cart, a fiddle-leaf fig, olive curtains
  FV('long', 'd1', 'tableExt', 8.4, 2.2, 0, 2, 1, 0.76, 'walnut'),
  ...[7.8, 8.4, 9].flatMap((x, i) => [
    F('d' + (2 + i), 'chairCushion', x, 1.54, 180, 0.45, 0.52, 0.86, 'walnut'),
    F('d' + (5 + i), 'chairCushion', x, 2.86, 0, 0.45, 0.52, 0.86, 'walnut'),
  ]),
  F('d8', 'chairCushion', 7.16, 2.2, 90, 0.45, 0.52, 0.86, 'walnut'),
  F('d9', 'chairCushion', 9.64, 2.2, 270, 0.45, 0.52, 0.86, 'walnut'),
  F('d10', 'rug', 8.4, 2.2, 0, 3.4, 2.5, 0.012, 'sand'),
  Z(0.76, FV('flowers', 'd11', 'pottedPlant', 8.4, 2.2, 0, 0.34, 0.34, 0.4, 'white')),
  Z(0.76, FV('candles', 'd12', 'decor', 8.95, 2.2, 0, 0.32, 0.14, 0.22, 'black')),
  F('d13', 'sideboard', 9.3, 4.525, 0, 1.6, 0.45, 0.75, 'walnut'),
  Z(1.25, FV('art', 'd14', 'picture', 9.3, 4.735, 0, 1.1, 0.03, 0.75, 'oak')),
  Z(0.75, FV('books', 'd15', 'decor', 9.35, 4.5, 0, 0.3, 0.22, 0.18, 'sand')),
  Z(0.75, FV('vase', 'd16', 'decor', 9.8, 4.5, 0, 0.18, 0.18, 0.5, 'terracotta')),
  F('d17', 'displayCabinet', 6.95, 4.55, 0, 0.9, 0.4, 1.9, 'walnut'),
  F('d18', 'kitchenCart', 10.15, 3.4, 270, 0.45, 0.35, 0.8, 'sage'),
  Z(0.8, FV('vase', 'd19', 'decor', 10.15, 3.4, 0, 0.16, 0.16, 0.4, 'black')),
  FV('ficus', 'd20', 'pottedPlant', 9.95, 0.5, 0, 0.6, 0.6, 1.7, 'terracotta'),
  FV('open', 'd21', 'curtains', 8.4, 0.12, 180, 2.6, 0.14, 2.55, 'olive'),
  FV('open', 'd22', 'curtains', 10.28, 1.5, 270, 1.8, 0.14, 2.55, 'olive'),
  // kitchen: walnut fronts under green zellige — the sink and dishwasher under the window with open walnut shelves beside it, the cooktop
  // run along the east wall with walnut wall cabinets and a black chimney hood, three walnut tall units (the fridge, the freezer, the oven)
  // on the west wall; a sage cart with cookbooks under a poster, a coffee machine, a bowl of fruit, a terracotta runner
  F('k1', 'kitchenBase', 6.05, 9.25, 0, 0.6, 0.6, 0.9, 'walnut'),
  F('k2', 'dishwasher', 6.65, 9.25, 0, 0.6, 0.6, 0.9, 'walnut'),
  FV('one', 'k3', 'kitchenSink', 7.25, 9.25, 0, 0.6, 0.6, 0.9, 'walnut'),
  F('k4', 'kitchenBase', 7.95, 9.25, 0, 0.8, 0.6, 0.9, 'walnut'),
  Z(1.5, F('k5', 'wallShelf', 6.15, 9.425, 0, 0.7, 0.25, 0.03, 'walnut')),
  Z(1.9, F('k6', 'wallShelf', 6.15, 9.425, 0, 0.7, 0.25, 0.03, 'walnut')),
  Z(1.53, FV('vase', 'k7', 'decor', 5.98, 9.43, 0, 0.15, 0.15, 0.3, 'white')),
  Z(1.93, FV('books', 'k8', 'decor', 6.25, 9.43, 0, 0.28, 0.2, 0.18, 'terracotta')),
  F('k9', 'kitchenBase', 8.25, 7.95, 270, 0.8, 0.6, 0.9, 'walnut'),
  FV('oven', 'k10', 'kitchenHob', 8.25, 7.25, 270, 0.6, 0.6, 0.9, 'walnut'),
  F('k11', 'kitchenBase', 8.25, 6.575, 270, 0.75, 0.6, 0.9, 'walnut'),
  F('k12', 'kitchenBase', 8.25, 5.7, 270, 1, 0.6, 0.9, 'walnut'),
  FV('dome', 'k13', 'hood', 8.3, 7.25, 270, 0.6, 0.5, 0.9, 'black'),
  Z(1.45, F('k14', 'kitchenWall', 8.375, 7.95, 270, 0.8, 0.35, 0.7, 'walnut')),
  Z(1.45, F('k15', 'kitchenWall', 8.375, 6.1, 270, 1.7, 0.35, 0.7, 'walnut')),
  F('k16', 'coffee', 8.3, 8.1, 270, 0.25, 0.4, 0.38, 'black'),
  Z(0.9, FV('bowl', 'k17', 'decor', 8.25, 5.55, 0, 0.32, 0.32, 0.14, 'terracotta')),
  FV('doors', 'k18', 'kitchenTall', 6.05, 5.25, 90, 0.6, 0.6, 2.2, 'walnut'),
  FV('doors', 'k19', 'kitchenTall', 6.05, 5.85, 90, 0.6, 0.6, 2.2, 'walnut'),
  FV('oven', 'k20', 'kitchenTall', 6.05, 6.45, 90, 0.6, 0.6, 2.2, 'walnut'),
  F('k21', 'kitchenCart', 5.93, 7.3, 90, 0.45, 0.35, 0.8, 'sage'),
  Z(0.8, FV('books', 'k22', 'decor', 5.93, 7.3, 90, 0.28, 0.2, 0.16, 'white')),
  Z(1.3, FV('poster', 'k23', 'picture', 5.765, 7.3, 90, 0.5, 0.03, 0.65, 'black')),
  F('k24', 'rug', 7.15, 7.1, 90, 2.4, 0.75, 0.012, 'terracotta'),
  // utility room: a utility cabinet, the washing machine with the dryer on top and a shelf above, a sage utility sink, white shelving;
  // the electrical panel, the gas boiler and the network cabinet on the east wall; a laundry basket, a folded ironing board
  F('u1', 'utilityCabinet', 9.05, 5.25, 90, 0.6, 0.6, 2, 'white'),
  F('u2', 'washer', 9.025, 5.9, 90, 0.6, 0.55, 0.85, 'white'),
  Z(0.85, F('u3', 'dryer', 9.05, 5.9, 90, 0.6, 0.6, 0.85, 'white')),
  Z(1.85, F('u4', 'wallShelf', 8.89, 5.9, 90, 0.6, 0.28, 0.03, 'walnut')),
  FV('one', 'u5', 'kitchenSink', 9.05, 6.55, 90, 0.6, 0.6, 0.9, 'sage'),
  FV('boxes', 'u6', 'shelf', 9, 7.6, 90, 1.2, 0.5, 2, 'white'),
  Z(0.7, F('u7', 'elPanel', 10.24, 7.4, 270, 0.8, 0.22, 1.1, 'grey')),
  F('u8', 'gasBoiler', 10.19, 6.75, 270, 0.45, 0.32, 0.75, 'white'),
  {...F('u9', 'netRack', 10.175, 8.3, 270, 0.55, 0.35, 0.5, 'black'), v: 'wall', z: 1.5},
  F('u10', 'laundryBasket', 9.9, 9.25, 0, 0.45, 0.35, 0.6, 'linen'),
  FV('folded', 'u11', 'ironingBoard', 10.3, 8.65, 270, 0.38, 0.08, 1.35, 'grey'),
  // hallway: the oak staircase, a walnut sliding wardrobe, a walnut shoe cabinet by the front door with books and a vase on it under an arched
  // mirror, a picture on the guest WC wall, a sand runner
  FV('solid', 'st1', 'stairs', 5.1, 6.3, 180, 0.9, 2.7, 2.6, 'oak'),
  FV('sliding', 'h1', 'wardrobe', 3.05, 6.95, 90, 1.2, 0.6, 2.4, 'walnut'),
  F('h2', 'shoeCabinet', 4.2, 9.15, 90, 0.8, 0.3, 1, 'walnut'),
  Z(1.2, FV('arch', 'h3', 'wallMirror', 4.065, 9.15, 90, 0.55, 0.03, 1, 'walnut')),
  Z(1, FV('books', 'h4', 'decor', 4.2, 8.95, 90, 0.24, 0.18, 0.12, 'terracotta')),
  Z(1, FV('vase', 'h5', 'decor', 4.2, 9.35, 0, 0.15, 0.15, 0.4, 'white')),
  Z(1.35, FV('art', 'h6', 'picture', 3.65, 7.635, 0, 0.6, 0.03, 0.8, 'walnut')),
  F('h7', 'rug', 3.95, 6.3, 90, 2.5, 0.8, 0.012, 'sand'),
  // guest WC (green marble): a wall-hung toilet, a small basin with a round walnut mirror, a black towel rail, a snake plant
  FV('wall', 'w1', 'toilet', 3.3, 9.275, 0, 0.38, 0.55, 0.8, 'white'),
  FV('wall', 'w2', 'basin', 2.925, 8.3, 90, 0.45, 0.35, 0.85),
  Z(1.2, FV('round', 'w3', 'wallMirror', 2.765, 8.3, 90, 0.45, 0.03, 0.45, 'walnut')),
  Z(0.9, F('w4', 'towelRail', 2.8, 8.95, 90, 0.4, 0.08, 0.5, 'black')),
  FV('snake', 'w5', 'pottedPlant', 3.7, 9.35, 0, 0.3, 0.3, 0.7, 'terracotta'),
  // study (deep green, a small library): walnut bookcases along the whole north wall, a walnut desk at the window with a monitor, a desk
  // lamp and books, a black office chair, a round sand rug, a terracotta sofa bed for guests with a reading lamp and a picture over it,
  // a walnut credenza with the printer and a vase under a poster, a fiddle-leaf fig
  F('s1', 'shelf', 1.3, 9.375, 0, 2.4, 0.35, 2.4, 'walnut'),
  F('s2', 'desk', 0.4, 7, 90, 1.6, 0.7, 0.75, 'walnut'),
  FV('stand', 's3', 'monitor', 0.22, 7, 90, 0.62, 0.2, 0.45),
  F('s4', 'chairDesk', 1, 7, 270, 0.62, 0.62, 1.05, 'black'),
  Z(0.75, FV('books', 's5', 'decor', 0.3, 7.6, 90, 0.3, 0.22, 0.14, 'sand')),
  FV('round', 's6', 'rug', 1.25, 7.1, 0, 1.8, 1.8, 0.012, 'sand'),
  F('s7', 'sofaBed', 0.85, 5.4, 180, 1.6, 0.9, 0.85, 'terracotta'),
  F('s8', 'lampRoundFloor', 1.85, 5.15, 0, 0.34, 0.34, 1.55, 'sand'),
  Z(1.25, FV('art', 's9', 'picture', 0.85, 4.965, 180, 1, 0.03, 0.6, 'oak')),
  F('s10', 'sideboard', 2.325, 8, 270, 1.2, 0.45, 0.75, 'walnut'),
  Z(0.75, F('s11', 'printer', 2.32, 8.25, 270, 0.42, 0.36, 0.25, 'black')),
  Z(0.75, FV('vase', 's12', 'decor', 2.32, 7.65, 0, 0.16, 0.16, 0.4, 'terracotta')),
  Z(1.3, FV('poster', 's13', 'picture', 2.535, 8, 270, 0.7, 0.03, 0.9, 'black')),
  FV('ficus', 's14', 'pottedPlant', 0.33, 8.55, 0, 0.45, 0.45, 1.7, 'terracotta'),
  // garage: the emerald electric car, the wallbox, two bikes on the west wall, an oak workbench with a shelf above it by the garden door,
  // graphite shelving, the grill
  F('g1', 'car', 12.45, 6.75, 0, 1.8, 4.3, 1.45, 'sage'),
  custom('g2', 'Wallbox', 13.675, 8, 270, 0.25, 0.15, 0.4, 'white', {z: 1}),
  F('g3', 'bicycle', 10.95, 4.55, 0, 0.6, 1.75, 1.05, 'black'),
  F('g4', 'bicycle', 10.95, 7.5, 0, 0.6, 1.75, 1.05, 'terracotta'),
  F('g5', 'workbench', 11.9, 3.35, 180, 1.6, 0.6, 0.9, 'oak'),
  Z(1.5, F('g6', 'wallShelf', 11.9, 3.19, 180, 1.4, 0.28, 0.03, 'oak')),
  F('g7', 'shelf', 13.575, 5.5, 270, 1.6, 0.35, 2, 'graphite'),
  F('g8', 'grill', 13.45, 4.27, 0, 0.55, 0.55, 1, 'black'),
];

worktop(FURNITURE, 'black'); // the kitchen's worktop: black stone

const LIGHTS: DemoLight[] = [
  {id: 'hall_spots', name: 'Hallway spots', room: 'hall', kind: 'ceiling'},
  {id: 'hall_stairs', name: 'Stair LED strip', room: 'hall', kind: 'strip'},
  {id: 'entrance', name: 'Entrance light', room: null, kind: 'accent', h: 2},
  {id: 'living_main', name: 'Living room ceiling light', room: 'living', kind: 'ceiling'},
  {id: 'living_cove', name: 'Ceiling cove light', room: 'living', kind: 'cove'},
  {id: 'living_floor', name: 'Floor lamp', room: 'living', kind: 'accent'},
  {id: 'living_reading', name: 'Reading floor lamp', room: 'living', kind: 'accent'},
  {id: 'living_console', name: 'Console table lamp', room: 'living', kind: 'accent', color: '#ffd9a0'},
  {id: 'dining_pendant', name: 'Dining pendants', room: 'dining', kind: 'ceiling', color: '#ffc773'},
  {id: 'dining_lamp', name: 'Sideboard table lamp', room: 'dining', kind: 'accent', color: '#ffd9a0'},
  {id: 'dining_picture', name: 'Picture light', room: 'dining', kind: 'accent'},
  {id: 'kitchen_spots', name: 'Kitchen spots', room: 'kitchen', kind: 'ceiling'},
  {id: 'kitchen_worktop', name: 'Worktop strip', room: 'kitchen', kind: 'strip'},
  {id: 'study_main', name: 'Study ceiling light', room: 'study', kind: 'ceiling'},
  {id: 'study_desk', name: 'Desk lamp', room: 'study', kind: 'accent'},
  {id: 'study_reading', name: 'Reading floor lamp', room: 'study', kind: 'accent'},
  {id: 'wc_main', name: 'Guest WC light', room: 'wc', kind: 'ceiling'},
  {id: 'utility_main', name: 'Utility room light', room: 'utility', kind: 'ceiling'},
  {id: 'garage_main', name: 'Garage light', room: 'garage', kind: 'ceiling'},
];
// every lamp with an area is placed; the entrance light has none. Table lamps stand 42 cm above the top they stand on (a 75 cm sideboard
// or desk: 1.17 m), floor lamps sit in their lampshades; the stair strip runs along the foot of the steps, the worktop strip under the
// wall cabinets
const PLACED: DemoPlanLight[] = [
  {
    id: 'hall_spots',
    placed: true,
    room: 'hall',
    form: 'spots',
    h: 2.58,
    points: [
      [3.95, 5.4],
      [3.95, 6.5],
      [3.95, 7.45],
      [4.8, 8.4],
      [4.8, 9.2],
    ],
  },
  {
    id: 'hall_stairs',
    placed: true,
    room: 'hall',
    h: 0.1,
    segments: [
      [
        [4.6, 5],
        [4.6, 7.6],
      ],
    ],
  },
  {id: 'living_main', placed: true, room: 'living', points: [[1.5, 2.9]]},
  {
    id: 'living_cove',
    placed: true,
    room: 'living',
    segments: [
      [
        [0.15, 4.68],
        [6.15, 4.68],
      ],
    ],
  },
  {
    id: 'living_floor',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[0.3, 0.9]],
  },
  {
    id: 'living_reading',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'floor',
    h: 1.45,
    points: [[4.4, 3.95]],
  },
  {
    id: 'living_console',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'table',
    h: 1.17,
    points: [[4.25, 4.5]],
  },
  {
    id: 'dining_pendant',
    placed: true,
    room: 'dining',
    form: 'pendant',
    h: 1.65,
    points: [
      [7.75, 2.2],
      [8.4, 2.2],
      [9.05, 2.2],
    ],
  },
  {
    id: 'dining_lamp',
    placed: true,
    room: 'dining',
    form: 'lamp',
    opt: 'table',
    h: 1.17,
    points: [[8.8, 4.5]],
  },
  {id: 'dining_picture', placed: true, room: 'dining', form: 'wall', h: 2.08, points: [[9.3, 4.7]]},
  {
    id: 'kitchen_spots',
    placed: true,
    room: 'kitchen',
    form: 'spots',
    h: 2.58,
    points: [
      [6.6, 5.8],
      [7.5, 5.8],
      [6.6, 7.6],
      [7.5, 7.6],
    ],
  },
  {
    id: 'kitchen_worktop',
    placed: true,
    room: 'kitchen',
    segments: [
      [
        [8.15, 5.25],
        [8.15, 6.9],
      ],
      [
        [8.15, 7.6],
        [8.15, 8.3],
      ],
    ],
  },
  {id: 'study_main', placed: true, room: 'study', points: [[1.3, 7.2]]},
  {id: 'study_desk', placed: true, room: 'study', form: 'lamp', opt: 'table', h: 1.17, points: [[0.3, 6.45]]},
  {
    id: 'study_reading',
    placed: true,
    room: 'study',
    form: 'lamp',
    opt: 'floor',
    h: 1.45,
    points: [[1.85, 5.15]],
  },
  {id: 'wc_main', placed: true, room: 'wc', points: [[3.3, 8.55]]},
  {id: 'utility_main', placed: true, room: 'utility', points: [[9.55, 7]]},
  {
    id: 'garage_main',
    placed: true,
    room: 'garage',
    form: 'line',
    h: 2.58,
    segments: [
      [
        [12.45, 4.6],
        [12.45, 6],
      ],
      [
        [12.45, 7.5],
        [12.45, 8.9],
      ],
    ],
  },
];

export default async function (): Promise<DemoHomeSource> {
  const HA: DemoHaData = {
    areas: Object.fromEntries(ROOMS.map(r => [r.id, r.short])),
    lights: LIGHTS.map(haLight),
  };
  // Sensors: wall thermostats of the underfloor heating (temperature, humidity) in the living, dining room and kitchen; a CO2 monitor
  // in the study; boiler flow and outdoor temperature are “not room air”; the smart meter, PV inverter and wallbox; a NAS in the network cabinet
  const S = sensorKit();
  const add = S.add;
  add('living', 'living_thermostat', 'Living room thermostat Temperature', 'temperature', '°C', 21.3);
  add('living', 'living_thermostat', 'Living room thermostat Humidity', 'humidity', '%', 46);
  add('dining', 'dining_thermostat', 'Dining room thermostat Temperature', 'temperature', '°C', 20.8);
  add('dining', 'dining_thermostat', 'Dining room thermostat Humidity', 'humidity', '%', 47);
  add('kitchen', 'kitchen_thermostat', 'Kitchen thermostat Temperature', 'temperature', '°C', 21.9);
  add('kitchen', 'kitchen_thermostat', 'Kitchen thermostat Humidity', 'humidity', '%', 51);
  add('study', 'study_air', 'Study air monitor Temperature', 'temperature', '°C', 22.4);
  add('study', 'study_air', 'Study air monitor Humidity', 'humidity', '%', 43);
  add('study', 'study_air', 'Study air monitor CO2', 'carbon_dioxide', 'ppm', 1240);
  add('utility', 'boiler', 'Boiler Flow temperature', 'temperature', '°C', 38.5);
  add('utility', 'boiler', 'Boiler Modulation', 'power_factor', '%', 22);
  add(null, 'outdoor', 'Outdoor sensor Temperature', 'temperature', '°C', 6.8);
  add('utility', 'smart_meter', 'Smart meter Energy', 'energy', 'kWh', 29630.8, {daily: 9.1, shape: 'home'});
  add('utility', 'smart_meter', 'Smart meter Power', 'power', 'W', 540);
  add('utility', 'pv', 'PV inverter Power', 'power', 'W', 0);
  add('utility', 'pv', 'PV inverter Energy', 'energy', 'kWh', 21410.2, {daily: 8.4, shape: 'day'});
  add('garage', 'wallbox', 'Wallbox Power', 'power', 'W', 0);
  add('garage', 'wallbox', 'Wallbox Energy', 'energy', 'kWh', 4120.6, {daily: 4.2, shape: 'evening'});
  add('utility', 'washer', 'Washing machine Energy', 'energy', 'kWh', 702.5, {daily: 0.8, shape: 'day'});
  add('kitchen', 'dishwasher', 'Dishwasher Energy', 'energy', 'kWh', 590.3, {daily: 0.9, shape: 'evening'});
  add('utility', 'nas', 'NAS CPU temperature', 'temperature', '°C', 47, {cat: 'diagnostic'});
  add('study', 'study_air', 'Study air monitor Battery', 'battery', '%', 58, {cat: 'diagnostic'});
  Object.assign(HA, {sensors: S.sensors, states: S.states});
  // Devices: underfloor heating thermostats (heating only, no air conditioning); roller shutters on the windows; the garage door
  // (a cover of class garage); contacts on the front door and some windows; a video doorbell and a driveway camera; leak sensors, the water main
  const K = deviceKit();
  K.thermostat('living_heating', 'Living room heating', 'living', 21.5, 21.3);
  K.thermostat('dining_heating', 'Dining room heating', 'dining', 21, 20.8);
  K.thermostat('kitchen_heating', 'Kitchen heating', 'kitchen', 21, 21.9);
  K.thermostat('study_heating', 'Study heating', 'study', 21, 22.4);
  K.cover('living_shutter_south', 'Living room shutter south', 'living', 'blind', 100);
  K.cover('living_shutter_west', 'Living room shutter west', 'living', 'blind', 100);
  K.cover('dining_shutter_east', 'Dining room shutter east', 'dining', 'blind', 100);
  K.cover('dining_shutter_south', 'Dining room shutter south', 'dining', 'blind', 100);
  K.cover('kitchen_shutter', 'Kitchen shutter', 'kitchen', 'blind', 100);
  K.cover('study_shutter', 'Study shutter', 'study', 'blind', 30);
  // the terrace door has a shutter too, but covers go only onto windows: no area, so it is not auto-placed onto a living room window
  K.cover('terrace_shutter', 'Terrace door shutter', null, 'blind', 100);
  K.devices.push({
    entity: 'cover.garage_door',
    name: 'Garage door',
    area: 'garage',
    domain: 'cover',
    cls: 'garage',
  });
  K.entities['cover.garage_door'] = {
    state: 'closed',
    attributes: {device_class: 'garage', current_position: 0, supported_features: 15},
  };
  K.contact('front_door', 'Front door', 'hall', 'door', false);
  K.contact('kitchen_window', 'Kitchen window', 'kitchen', 'window', true);
  K.contact('study_window', 'Study window', 'study', 'window', false);
  K.contact('utility_window', 'Utility room window', 'utility', 'window', false);
  K.contact('terrace_door', 'Terrace door', 'living', 'door', false); // no terrace room: auto-place takes the living room's only door out
  K.camera('doorbell', 'Video doorbell', 'hall');
  K.camera('driveway', 'Driveway camera', 'garage');
  K.leak('leak_washer', 'Washing machine leak', 'utility', 82);
  K.leak('leak_sink', 'Leak under the sink', 'kitchen', 95);
  K.valve('water_main', 'Water main valve', 'utility');
  K.vacuum('robot', 'Robot vacuum', 'living');
  K.favorites([
    ['scene.evening', 'Evening', 'living', '2026-11-07T19:00:00Z'],
    ['scene.dinner', 'Dinner', 'dining', '2026-11-07T18:30:00Z'],
    ['script.all_shutters_down', 'All shutters down', null, 'off'],
    ['switch.wallbox', 'Wallbox charging', 'garage', 'off'],
    ['input_boolean.holiday', 'Holiday mode', null, 'off'],
    ['lock.front_door', 'Front door lock', 'hall', 'locked'],
  ]);
  Object.assign(HA, {devices: K.devices, entities: K.entities, extra: K.extra});
  HA.stats = stats(['sensor.smart_meter_energy'], ['wallbox', 'washer', 'dishwasher'], {
    'climate.study_heating': {hours: 1.5, drops: 2},
    'camera.driveway': {hours: 4, drops: 5},
  });
  HA.weather = WEATHER;
  const DEMO: DemoPlan = {
    version: 1,
    units: 'm',
    rooms: ROOMS.map(r => ({id: r.id, name: r.short, polygon: r.polygon, ...FINISH[r.id]})),
    openings: OPENINGS,
    furniture: FURNITURE,
    lights: PLACED,
  };
  return {HA, DEMO, DEMO_UNDERLAY: null};
}
