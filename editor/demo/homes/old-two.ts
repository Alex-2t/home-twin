// Typical home 4 (docs/research/typical-homes.md, D-030): an old-type two-room apartment in a panel building, about 51 m² —
// living room with a balcony, bedroom, small kitchen with a gas stove and a gas water heater, separate bathroom (bathtub) and toilet,
// hallway with a corridor. Made up: nobody's apartment. Metres, x east, y north, 10 cm interior walls; the editor adds the exterior walls.
// Design concept, “Nordic blue”: the flat is renovated in a light Scandinavian way. Soft white limewash on the walls and light oak floors
// everywhere, oak and white furniture, linen and sand textiles, and navy as the one accent that comes back in every room: a dusty blue
// sofa wall, a navy reading chair, navy kitchen fronts, a deep navy headboard wall, navy subway tile behind the bathtub, a navy runner and
// a navy rug on the balcony. Terracotta pots for the warm note, black metal (mirrors, towel warmer, shower set, side table).
// The small kitchen keeps its gas water heater between open oak shelves and gets a round table by the window; the balcony is a tiny café.
// The wall face is 5 cm inside a room's outline, so items stand with their backs 5 cm in.
import {door, win, F, haLight, sensorKit, deviceKit, stats, WEATHER, worktop} from '../kit.ts';
import type {DemoHomeSource, DemoLight, DemoPlan, DemoPlanLight, DemoRoom, Style} from '../kit.ts';
import type {DemoHaData, EdgeFinish, FurnitureItem, LooseOpening} from '../../src/core/types.ts';

const FV = (v: string, ...a: Parameters<typeof F>): FurnitureItem => ({...F(...a), v}); // an item in a catalog variant
const Z = (z: number, f: FurnitureItem): FurnitureItem => ({...f, z}); // an item at its own height above the floor: on furniture or on a wall
const OUT = (o: LooseOpening): LooseOpening => ({...o, swing: 2}); // the door opens out of its room: bathroom, toilet and front doors here open outward

// finishes: soft white limewash, the accents in blue (dress() in kit.ts fills what a room does not set itself)
const LIME = '#d0cfc9';
const NAVY = '#3e4b60';
const lime = (t: string): EdgeFinish => ({k: 'plasterLime', tint: t});
const STYLE: Style = {
  wall: {
    living: lime(LIME),
    bed: lime('#cdccc6'),
    kitchen: lime('#d3d1cb'),
    hall: lime('#c9c8c2'),
    kids: '#b4c0c8',
    office: lime('#cdccc6'),
  },
  bed: lime(NAVY),
  media: lime(LIME),
  sofa: lime('#62768c'),
  splash: {k: 'zelligeWhite'},
  bath: 'tileSquare',
  office: {k: 'slatsOak'},
  floor: {
    living: 'woodLight',
    bed: 'woodLight',
    kids: 'woodLight',
    hall: 'woodLight',
    office: 'woodLight',
    kitchen: 'woodLight',
    bath: 'checker',
  },
};

// room finishes set here: the living room's sofa wall in dusty blue limewash (the TV wall stays white), navy subway tile behind the bathtub,
// a blue striped wallpaper in the toilet, terracotta tiles on the balcony
const ROOMS: DemoRoom[] = [
  {
    id: 'living',
    short: 'Living room',
    polygon: [
      [0, 0],
      [4.3, 0],
      [4.3, 4],
      [0, 4],
    ],
    finish: {wf: [null, lime(LIME), null, lime('#62768c')]},
  },
  {
    id: 'bedroom',
    short: 'Bedroom',
    polygon: [
      [4.4, 0],
      [7.8, 0],
      [7.8, 4],
      [4.4, 4],
    ],
  },
  {
    id: 'kitchen',
    short: 'Kitchen',
    polygon: [
      [0, 4.1],
      [2.8, 4.1],
      [2.8, 6.8],
      [0, 6.8],
    ],
  },
  {
    id: 'toilet',
    short: 'Toilet',
    polygon: [
      [2.9, 5.2],
      [3.7, 5.2],
      [3.7, 6.8],
      [2.9, 6.8],
    ],
    finish: {wall: 'wallpaperStripe', wallTint: '#8b9fb4'},
  },
  {
    id: 'bathroom',
    short: 'Bathroom',
    polygon: [
      [3.8, 5.2],
      [5.7, 5.2],
      [5.7, 6.8],
      [3.8, 6.8],
    ],
    finish: {wf: [null, null, {k: 'tileSubway', tint: NAVY}, null]},
  },
  {
    id: 'hall',
    short: 'Hallway',
    polygon: [
      [2.9, 4.1],
      [7.8, 4.1],
      [7.8, 6.8],
      [5.8, 6.8],
      [5.8, 5.1],
      [2.9, 5.1],
    ],
  },
  {
    id: 'balcony',
    short: 'Balcony',
    polygon: [
      [0.6, -1.25],
      [3.8, -1.25],
      [3.8, -0.25],
      [0.6, -0.25],
    ],
    finish: {floor: 'terracotta'},
  },
];

const OPENINGS: LooseOpening[] = [
  OUT(door([6.5, 6.8], [7.4, 6.8])), // front door, opens onto the stairwell
  door([3.35, 4.05], [4.15, 4.05]), // corridor ↔ living room
  door([4.8, 4.05], [5.6, 4.05]), // corridor ↔ bedroom
  door([2.85, 4.2], [2.85, 5]), // corridor ↔ kitchen
  OUT(door([3, 5.15], [3.6, 5.15])), // corridor ↔ toilet
  OUT(door([4.55, 5.15], [5.2, 5.15])), // corridor ↔ bathroom
  door([0.9, -0.125], [1.6, -0.125], 2.2), // living room ↔ balcony in a 25 cm wall, opens into the living room
  win([1.8, -0.125], [3.4, -0.125]), // living room, onto the balcony
  win([5.3, 0], [6.9, 0]), // bedroom
  win([0.8, 6.8], [2, 6.8]), // kitchen
  win([0.7, -1.25], [3.7, -1.25], 0.9, 2.45), // balcony glazing
  win([0.6, -1.15], [0.6, -0.35], 0.9, 2.45),
  win([3.8, -1.15], [3.8, -0.35], 0.9, 2.45),
];

const FURNITURE: FurnitureItem[] = [
  // living room: a linen sofa against the dusty blue west wall under a small gallery of three prints, a round oak coffee table on a grey wool rug,
  // a black side table with a lamp; white bookshelves on the north wall and a navy reading chair with a floor lamp in the corner by the door;
  // the TV wall opposite the sofa (oak bench, TV, soundbar, the air conditioner above), a fig tree and a monstera in terracotta pots,
  // linen curtains over the balcony door and the window, the radiator under the window, a cat bed by it
  F('l1', 'loungeSofa', 0.525, 1.95, 90, 2.2, 0.95, 0.82, 'linen'),
  F('l2', 'rug', 1.65, 1.95, 90, 2.5, 2.1, 0.012, 'grey'),
  FV('round', 'l3', 'tableCoffee', 1.75, 1.95, 0, 0.75, 0.75, 0.4, 'oak'),
  Z(0.4, FV('books', 'l4', 'decor', 1.66, 1.8, 20, 0.26, 0.2, 0.14, 'sand')),
  Z(0.4, FV('flowers', 'l5', 'pottedPlant', 1.88, 2.12, 0, 0.25, 0.25, 0.32, 'white')),
  FV('round', 'l6', 'sideTable', 0.33, 3.32, 0, 0.4, 0.4, 0.5, 'black'),
  Z(1.2, F('l7', 'picture', 0.065, 1.95, 90, 0.6, 0.03, 0.9, 'oak')),
  Z(1.35, F('l8', 'picture', 0.065, 1.33, 90, 0.4, 0.03, 0.6, 'oak')),
  Z(1.35, F('l9', 'picture', 0.065, 2.57, 90, 0.4, 0.03, 0.6, 'oak')),
  F('l10', 'shelf', 0.45, 3.775, 0, 0.8, 0.35, 2.1, 'white'),
  F('l11', 'shelf', 1.25, 3.775, 0, 0.8, 0.35, 2.1, 'white'),
  F('l12', 'lampRoundFloor', 1.85, 3.75, 0, 0.35, 0.35, 1.55, 'linen'),
  F('l13', 'loungeChair', 2.62, 3.38, 330, 0.78, 0.8, 0.78, 'navy'),
  F('l14', 'tvStand', 4.05, 1.95, 270, 1.8, 0.4, 0.5, 'oak'),
  Z(1, F('l15', 'tv', 4.22, 1.95, 270, 1.23, 0.06, 0.71)),
  F('l16', 'soundbar', 4.02, 1.95, 270, 0.8, 0.1, 0.07, 'black'),
  Z(0.5, FV('vase', 'l17', 'decor', 4.08, 2.65, 0, 0.18, 0.18, 0.5, 'sand')),
  Z(0.5, FV('books', 'l18', 'decor', 4.06, 1.32, 270, 0.3, 0.22, 0.2, 'terracotta')),
  Z(2.15, F('l19', 'aircon', 4.14, 1.95, 270, 0.8, 0.22, 0.29, 'white')),
  FV('monstera', 'l20', 'pottedPlant', 3.85, 0.55, 0, 0.75, 0.75, 1, 'terracotta'),
  FV('ficus', 'l21', 'pottedPlant', 0.42, 0.45, 0, 0.6, 0.6, 1.7, 'terracotta'),
  FV('sections', 'l22', 'radiator', 2.6, 0.1, 180, 0.9, 0.1, 0.5, 'white'),
  FV('open', 'l23', 'curtains', 2.15, 0.12, 180, 2.8, 0.14, 2.55, 'linen'),
  FV('round', 'l24', 'petBed', 2.05, 0.5, 0, 0.55, 0.45, 0.18, 'sand'),
  // kitchen: navy fronts along the west wall (the fridge, a base with the coffee machine, a steel gas stove under a steel hood, a base
  // under the gas water heater, the sink in the corner by the window), open oak shelves instead of wall cabinets, a white zellige backsplash;
  // a round oak table for two by the window with white chairs, flowers and a pendant, a print over it, a white cart with the microwave
  // and a print above it, a terracotta runner in front of the stove, the radiator and a linen roller blind at the window
  F('k1', 'fridge', 0.375, 4.45, 90, 0.6, 0.65, 1.85, 'white'),
  F('k2', 'kitchenBase', 0.35, 5, 90, 0.5, 0.6, 0.9, 'navy'),
  FV('gas', 'k3', 'stove', 0.35, 5.55, 90, 0.6, 0.6, 0.9, 'steel'),
  F('k4', 'kitchenBase', 0.35, 6.05, 90, 0.4, 0.6, 0.9, 'navy'),
  FV('one', 'k5', 'kitchenSink', 0.35, 6.5, 90, 0.5, 0.6, 0.9, 'navy'),
  FV('dome', 'k6', 'hood', 0.3, 5.55, 90, 0.6, 0.5, 0.9, 'steel'),
  FV('wall', 'k7', 'gasBoiler', 0.21, 6.06, 90, 0.42, 0.32, 0.72, 'white'),
  Z(1.5, F('k8', 'wallShelf', 0.175, 5, 90, 0.5, 0.25, 0.04, 'oak')),
  Z(1.9, F('k9', 'wallShelf', 0.175, 5, 90, 0.5, 0.25, 0.04, 'oak')),
  Z(1.5, F('k10', 'wallShelf', 0.175, 6.5, 90, 0.45, 0.25, 0.04, 'oak')),
  Z(1.9, F('k11', 'wallShelf', 0.175, 6.5, 90, 0.45, 0.25, 0.04, 'oak')),
  F('k12', 'coffee', 0.27, 4.9, 90, 0.28, 0.38, 0.38, 'black'),
  Z(0.9, FV('vase', 'k25', 'decor', 0.3, 5.15, 0, 0.15, 0.15, 0.32, 'terracotta')),
  Z(0.9, FV('bowl', 'k13', 'decor', 0.36, 6.06, 0, 0.3, 0.3, 0.14, 'white')),
  Z(1.54, FV('vase', 'k14', 'decor', 0.17, 5.1, 0, 0.15, 0.15, 0.32, 'white')),
  Z(1.94, FV('books', 'k15', 'decor', 0.17, 6.5, 90, 0.26, 0.2, 0.16, 'terracotta')),
  F('k16', 'tableRound', 2.3, 6.3, 0, 0.75, 0.75, 0.75, 'oak'),
  F('k17', 'chairCushion', 2.3, 5.68, 180, 0.45, 0.52, 0.85, 'white'),
  F('k18', 'chairCushion', 1.72, 6.3, 90, 0.45, 0.52, 0.85, 'white'),
  Z(0.75, FV('flowers', 'k19', 'pottedPlant', 2.36, 6.36, 0, 0.25, 0.25, 0.32, 'terracotta')),
  Z(1.25, FV('poster', 'k20', 'picture', 2.735, 6.3, 270, 0.4, 0.03, 0.6, 'oak')),
  F('k21', 'kitchenCart', 1.35, 4.35, 180, 0.55, 0.4, 0.8, 'white'),
  Z(0.8, F('k22', 'microwave', 1.35, 4.34, 180, 0.5, 0.38, 0.3, 'white')),
  Z(1.45, F('k26', 'picture', 1.35, 4.165, 180, 0.5, 0.03, 0.5, 'oak')),
  F('k27', 'rug', 0.95, 5.5, 90, 1.8, 0.6, 0.012, 'terracotta'),
  FV('sections', 'k23', 'radiator', 1.4, 6.7, 0, 0.8, 0.1, 0.5, 'white'),
  Z(2, FV('roller', 'k24', 'blind', 1.4, 6.72, 0, 1.18, 0.06, 0.36, 'linen')),
  // bedroom: an oak bed with a wooden headboard against the deep navy west wall, white nightstands with lamps, a cream print over the bed,
  // a sand rug; a white sliding wardrobe along the east wall; an oak dresser with a round black mirror, a vase and books on the north wall
  // under the air conditioner; a sand reading chair with a floor lamp in the corner by the window, linen curtains, a snake plant
  FV('wood', 'b1', 'bed', 5.45, 1.75, 90, 1.6, 2, 1.05, 'oak'),
  F('b2', 'nightstand', 4.65, 0.7, 90, 0.45, 0.4, 0.5, 'white'),
  F('b3', 'nightstand', 4.65, 2.8, 90, 0.45, 0.4, 0.5, 'white'),
  Z(0.5, FV('books', 'b4', 'decor', 4.66, 0.56, 90, 0.24, 0.18, 0.12, 'sand')),
  Z(1.3, F('b5', 'picture', 4.465, 1.75, 90, 1, 0.03, 0.6, 'oak')),
  F('b6', 'rug', 5.9, 1.75, 90, 2.6, 2, 0.012, 'sand'),
  FV('sliding', 'b7', 'wardrobe', 7.46, 2.7, 270, 2.4, 0.58, 2.4, 'white'),
  F('b8', 'dresser', 6.35, 3.725, 0, 1.1, 0.45, 0.8, 'oak'),
  Z(1.15, FV('round', 'b9', 'wallMirror', 6.35, 3.935, 0, 0.7, 0.03, 0.7, 'black')),
  Z(0.8, FV('vase', 'b10', 'decor', 5.98, 3.74, 0, 0.18, 0.18, 0.5, 'white')),
  Z(0.8, FV('books', 'b11', 'decor', 6.72, 3.73, 0, 0.3, 0.22, 0.2, 'graphite')),
  Z(2.15, F('b12', 'aircon', 6.35, 3.84, 0, 0.8, 0.22, 0.29, 'white')),
  F('b13', 'loungeChair', 7.15, 0.62, 225, 0.72, 0.75, 0.78, 'sand'),
  F('b14', 'lampRoundFloor', 7.55, 1.15, 0, 0.35, 0.35, 1.55, 'linen'),
  FV('open', 'b15', 'curtains', 6.1, 0.12, 180, 2, 0.14, 2.55, 'linen'),
  FV('sections', 'b16', 'radiator', 6.1, 0.1, 180, 0.9, 0.1, 0.5, 'white'),
  FV('snake', 'b17', 'pottedPlant', 4.6, 3.6, 0, 0.32, 0.32, 0.8, 'white'),
  // bathroom: the bathtub along the navy-tiled north wall with a black shower set, the washing machine by the door with an oak shelf above it
  // (a snake plant, candles), an oak wall-hung vanity with a round black mirror, a black towel warmer, a linen bath mat
  F('a1', 'bath', 4.75, 6.4, 0, 1.7, 0.7, 0.58, 'white'),
  F('a2', 'showerColumn', 5.3, 6.575, 0, 0.3, 0.35, 1.2, 'black'),
  F('a3', 'washer', 4.15, 5.525, 180, 0.6, 0.55, 0.85, 'white'),
  Z(1.2, F('a4', 'wallShelf', 4.15, 5.36, 180, 0.6, 0.22, 0.03, 'oak')),
  Z(1.23, FV('snake', 'a5', 'pottedPlant', 4, 5.37, 0, 0.25, 0.25, 0.4, 'white')),
  Z(1.23, FV('candles', 'a6', 'decor', 4.3, 5.36, 0, 0.24, 0.12, 0.15, 'black')),
  FV('wall', 'a7', 'vanity', 5.425, 5.75, 270, 0.55, 0.45, 0.85, 'oak'),
  Z(1.2, FV('round', 'a8', 'wallMirror', 5.635, 5.75, 270, 0.5, 0.03, 0.5, 'black')),
  FV('ladder', 'a9', 'towelRail', 5.43, 5.3, 180, 0.4, 0.1, 0.8, 'black'),
  F('a10', 'rug', 4.85, 5.78, 0, 0.7, 0.5, 0.012, 'linen'),
  // toilet: a wall-hung toilet under an oak shelf with candles and a snake plant, a small print on the striped wallpaper
  FV('wall', 'w1', 'toilet', 3.3, 6.475, 0, 0.38, 0.55, 0.8, 'white'),
  Z(1.3, F('w2', 'wallShelf', 3.3, 6.64, 0, 0.6, 0.22, 0.03, 'oak')),
  Z(1.33, FV('candles', 'w3', 'decor', 3.13, 6.64, 0, 0.2, 0.1, 0.14, 'white')),
  Z(1.33, FV('snake', 'w4', 'pottedPlant', 3.46, 6.63, 0, 0.25, 0.25, 0.35, 'terracotta')),
  Z(1.4, F('w5', 'picture', 2.965, 5.95, 90, 0.3, 0.03, 0.4, 'oak')),
  // hallway: a navy runner along the corridor with two prints, an oak sliding wardrobe on the east wall of the entry, an oak shoe cabinet
  // with a mirror, a vase and a key bowl, an oak bench under the coat rack, the electrical panel by the front door, a doormat, eucalyptus
  F('h1', 'rug', 4.35, 4.6, 0, 2.6, 0.7, 0.012, 'navy'),
  Z(1.35, F('h2', 'picture', 4.15, 5.035, 0, 0.5, 0.03, 0.7, 'black')),
  Z(1.35, F('h3', 'picture', 4.475, 4.165, 180, 0.4, 0.03, 0.6, 'oak')),
  FV('sliding', 'h4', 'wardrobe', 7.45, 5.05, 270, 1.8, 0.6, 2.4, 'oak'),
  F('h5', 'shoeCabinet', 6, 5.475, 90, 0.55, 0.3, 0.9, 'oak'),
  Z(1.05, F('h6', 'wallMirror', 5.865, 5.475, 90, 0.5, 0.03, 0.9, 'oak')),
  Z(0.9, FV('vase', 'h7', 'decor', 6.01, 5.62, 0, 0.15, 0.15, 0.4, 'terracotta')),
  Z(0.9, FV('bowl', 'h8', 'decor', 6.01, 5.32, 0, 0.2, 0.2, 0.08, 'graphite')),
  F('h9', 'bench', 6.04, 6.2, 90, 0.8, 0.38, 0.45, 'oak'),
  Z(1.6, FV('shelf', 'h10', 'coatHooks', 5.975, 6.2, 90, 0.8, 0.25, 0.35, 'oak')),
  F('h11', 'elPanel', 6.1, 6.69, 0, 0.4, 0.12, 0.5, 'grey'),
  F('h12', 'rug', 6.95, 6.3, 0, 0.9, 0.6, 0.012, 'graphite'),
  FV('eucalyptus', 'h13', 'floorVase', 7.58, 6.55, 0, 0.3, 0.3, 1, 'white'),
  // balcony, a tiny café: a white bistro table and two chairs on a navy rug with a lamp on the table, a palm and flowers in terracotta pots
  FV('round', 'p1', 'patioTable', 2.25, -0.75, 0, 0.6, 0.6, 0.74, 'white'),
  F('p2', 'patioChair', 1.72, -0.75, 90, 0.48, 0.5, 0.82, 'white'),
  F('p3', 'patioChair', 2.78, -0.75, 270, 0.48, 0.5, 0.82, 'white'),
  F('p4', 'rug', 2.25, -0.75, 0, 1.6, 0.75, 0.012, 'navy'),
  FV('palm', 'p5', 'pottedPlant', 3.4, -0.75, 0, 0.55, 0.55, 1.4, 'terracotta'),
  FV('flowers', 'p6', 'pottedPlant', 1.05, -0.95, 0, 0.35, 0.35, 0.45, 'terracotta'),
];

worktop(FURNITURE, 'white'); // the kitchen's worktop: white quartz

const LIGHTS: DemoLight[] = [
  {id: 'hall_spots', name: 'Hallway spots', room: 'hall', kind: 'ceiling'},
  {id: 'hall_mirror', name: 'Hall mirror light', room: 'hall', kind: 'accent'},
  {id: 'living_main', name: 'Living room ceiling light', room: 'living', kind: 'ceiling'},
  {id: 'living_reading', name: 'Reading floor lamp', room: 'living', kind: 'accent'},
  {id: 'living_table', name: 'Sofa table lamp', room: 'living', kind: 'accent', color: '#ffd9a0'},
  {id: 'living_cove', name: 'Cove strip', room: 'living', kind: 'cove'},
  {id: 'living_tv', name: 'TV backlight', room: 'living', kind: 'strip'},
  {id: 'kitchen_main', name: 'Kitchen ceiling light', room: 'kitchen', kind: 'ceiling'},
  {id: 'kitchen_pendant', name: 'Kitchen table pendant', room: 'kitchen', kind: 'ceiling', color: '#ffc773'},
  {id: 'kitchen_worktop_led', name: 'Worktop strip', room: 'kitchen', kind: 'strip'},
  {id: 'bedroom_main', name: 'Bedroom ceiling light', room: 'bedroom', kind: 'ceiling'},
  {id: 'bedroom_left', name: 'Left bedside lamp', room: 'bedroom', kind: 'accent', color: '#ffd34d'},
  {id: 'bedroom_right', name: 'Right bedside lamp', room: 'bedroom', kind: 'accent', color: '#ffd34d'},
  {id: 'bedroom_reading', name: 'Reading floor lamp', room: 'bedroom', kind: 'accent'},
  {id: 'bathroom_spots', name: 'Bathroom spots', room: 'bathroom', kind: 'ceiling'},
  {id: 'bathroom_mirror', name: 'Mirror light', room: 'bathroom', kind: 'accent'},
  {id: 'toilet_main', name: 'Toilet light', room: 'toilet', kind: 'ceiling'},
  {id: 'balcony_string', name: 'Balcony string lights', room: 'balcony', kind: 'strip'},
  {id: 'balcony_lamp', name: 'Balcony table lamp', room: 'balcony', kind: 'accent', color: '#ffc773'},
];
// every lamp placed: floor and table lamps on their furniture (a table lamp's point is its bulb, 42 cm above the top it stands on),
// sconces 13 cm off the wall line, the cove along the blue sofa wall, the TV backlight under the TV, the worktop strip under the open shelves
const PLACED: DemoPlanLight[] = [
  {
    id: 'hall_spots',
    placed: true,
    room: 'hall',
    form: 'spots',
    h: 2.58,
    points: [
      [3.5, 4.6],
      [4.5, 4.6],
      [5.5, 4.6],
      [6.65, 4.9],
      [6.65, 6.05],
    ],
  },
  {id: 'hall_mirror', placed: true, room: 'hall', form: 'wall', h: 2.03, points: [[5.93, 5.475]]},
  {id: 'living_main', placed: true, room: 'living', points: [[2, 2]]},
  {
    id: 'living_reading',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[1.85, 3.75]],
  },
  {
    id: 'living_table',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'table',
    h: 0.92,
    points: [[0.33, 3.36]],
  },
  {
    id: 'living_cove',
    placed: true,
    room: 'living',
    form: 'strip',
    h: 2.5,
    segments: [
      [
        [0.08, 0.25],
        [0.08, 3.75],
      ],
    ],
  },
  {
    id: 'living_tv',
    placed: true,
    room: 'living',
    form: 'strip',
    h: 0.98,
    segments: [
      [
        [4.21, 1.45],
        [4.21, 2.45],
      ],
    ],
  },
  {id: 'kitchen_main', placed: true, room: 'kitchen', points: [[1.3, 5.3]]},
  {id: 'kitchen_pendant', placed: true, room: 'kitchen', form: 'pendant', h: 1.6, points: [[2.3, 6.3]]},
  {
    id: 'kitchen_worktop_led',
    placed: true,
    room: 'kitchen',
    form: 'strip',
    h: 1.48,
    segments: [
      [
        [0.08, 4.78],
        [0.08, 5.22],
      ],
      [
        [0.08, 6.3],
        [0.08, 6.7],
      ],
    ],
  },
  {id: 'bedroom_main', placed: true, room: 'bedroom', points: [[6.1, 1.9]]},
  {
    id: 'bedroom_left',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'table',
    h: 0.92,
    points: [[4.62, 2.84]],
  },
  {
    id: 'bedroom_right',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'table',
    h: 0.92,
    points: [[4.62, 0.76]],
  },
  {
    id: 'bedroom_reading',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[7.55, 1.15]],
  },
  {
    id: 'bathroom_spots',
    placed: true,
    room: 'bathroom',
    form: 'spots',
    h: 2.58,
    points: [
      [4.2, 5.65],
      [5.15, 5.65],
      [4.35, 6.4],
      [5.15, 6.4],
    ],
  },
  {id: 'bathroom_mirror', placed: true, room: 'bathroom', form: 'wall', h: 1.78, points: [[5.57, 5.75]]},
  {id: 'toilet_main', placed: true, room: 'toilet', points: [[3.3, 5.95]]},
  {
    id: 'balcony_string',
    placed: true,
    room: 'balcony',
    form: 'strip',
    h: 2.45,
    segments: [
      [
        [0.75, -0.33],
        [3.65, -0.33],
      ],
    ],
  },
  {
    id: 'balcony_lamp',
    placed: true,
    room: 'balcony',
    form: 'lamp',
    opt: 'table',
    h: 1.16,
    points: [[2.3, -0.72]],
  },
];

export default async function (): Promise<DemoHomeSource> {
  const HA: DemoHaData = {
    areas: Object.fromEntries(ROOMS.map(r => [r.id, r.short])),
    lights: LIGHTS.map(haLight),
  };
  // Sensors: climate in the living room, bedroom (with CO2), kitchen and bathroom; the water heater outlet is not room air; energy meters
  const S = sensorKit();
  const add = S.add;
  add('living', 'living_th', 'Living room sensor Temperature', 'temperature', '°C', 22.4);
  add('living', 'living_th', 'Living room sensor Humidity', 'humidity', '%', 41);
  add('bedroom', 'bedroom_air', 'Bedroom sensor Temperature', 'temperature', '°C', 21.2);
  add('bedroom', 'bedroom_air', 'Bedroom sensor Humidity', 'humidity', '%', 45);
  add('bedroom', 'bedroom_air', 'Bedroom sensor CO2', 'carbon_dioxide', 'ppm', 980);
  add('bedroom', 'bedroom_air', 'Bedroom sensor Battery', 'battery', '%', 64, {cat: 'diagnostic'});
  add('kitchen', 'kitchen_th', 'Kitchen sensor Temperature', 'temperature', '°C', 23.5);
  add('kitchen', 'kitchen_th', 'Kitchen sensor Humidity', 'humidity', '%', 52);
  add('kitchen', 'heater_out', 'Gas water heater Outlet temperature', 'temperature', '°C', 47);
  add('bathroom', 'bath_th', 'Bathroom sensor Temperature', 'temperature', '°C', 25.1);
  add('bathroom', 'bath_th', 'Bathroom sensor Humidity', 'humidity', '%', 71);
  add(null, 'home_meter', 'Main meter Energy', 'energy', 'kWh', 23517.2, {daily: 7.4, shape: 'home'});
  add('kitchen', 'kitchen_fridge', 'Fridge Energy', 'energy', 'kWh', 2311.8, {daily: 1, shape: 'flat'});
  add('bathroom', 'washer', 'Washing machine Energy', 'energy', 'kWh', 811.4, {daily: 0.6, shape: 'day'});
  add('living', 'living_tv_plug', 'TV Energy', 'energy', 'kWh', 402.5, {daily: 0.5, shape: 'evening'});
  Object.assign(HA, {sensors: S.sensors, states: S.states});
  // Devices: air conditioners in the living room (heating) and bedroom (off), a smart radiator valve; curtains, a kitchen roller blind;
  // the front and balcony doors; leak sensors and the water valve in the toilet, where the risers are; a peephole camera, a robot vacuum
  const K = deviceKit();
  K.ac('living_ac', 'Living room AC', 'living', 'heat', 23, 22.4);
  K.ac('bedroom_ac', 'Bedroom AC', 'bedroom', 'off', 22, 21.2);
  K.thermostat('living_trv', 'Living room radiator', 'living', 22, 22.4);
  K.cover('living_curtains', 'Living room curtains', 'living', 'curtain', 100);
  K.cover('bedroom_curtains', 'Bedroom curtains', 'bedroom', 'curtain', 0);
  K.cover('kitchen_blind', 'Kitchen roller blind', 'kitchen', 'blind', 100);
  K.contact('front_door', 'Front door', 'hall', 'door', false);
  K.contact('balcony_door', 'Balcony door', 'balcony', 'door', false);
  K.leak('leak_bathroom', 'Bathroom leak', 'bathroom', 90);
  K.leak('leak_kitchen', 'Leak under the sink', 'kitchen', 75);
  K.valve('water_main', 'Water shut-off valve', 'toilet');
  K.camera('peephole', 'Peephole camera', 'hall');
  K.vacuum('robot', 'Robot vacuum', 'hall');
  K.favorites([
    ['scene.evening', 'Evening', 'living', '2026-11-07T19:05:00Z'],
    ['script.leaving', 'Leaving home', null, 'off'],
    ['binary_sensor.kitchen_gas', 'Gas leak sensor', 'kitchen', 'off'],
    ['switch.towel_rail', 'Towel rail', 'bathroom', 'on'],
    ['switch.kettle', 'Kettle', 'kitchen', 'off'],
  ]);
  Object.assign(HA, {devices: K.devices, entities: K.entities, extra: K.extra});
  HA.stats = stats(['sensor.home_meter_energy'], ['kitchen_fridge', 'washer', 'living_tv_plug'], {
    'climate.bedroom_ac': {hours: 3, drops: 2},
    'vacuum.robot': {hours: 0.5, drops: 2},
  });
  HA.weather = WEATHER;
  const DEMO: DemoPlan = {
    version: 1,
    units: 'm',
    rooms: ROOMS.map(r => ({
      id: r.id,
      name: r.short,
      polygon: r.polygon,
      ...structuredClone(r.finish || {}),
    })),
    openings: OPENINGS,
    furniture: FURNITURE,
    lights: PLACED,
    // the home view: from the east-south-east, turned 20° from the default, so the balcony's brick wall does not hide the living room
    view: {t: [3.807, 1.08, -2.924], theta: 0.9085, phi: 1.0123, fit: [5.785, 4.282]},
  };
  return {HA, DEMO, DEMO_UNDERLAY: null, STYLE};
}
