// @ts-nocheck
// Typical home 9 (docs/research/typical-homes.md, D-030): a single-story house, here a US ranch of about 150 m² with an attached
// two-car garage. Street to the south: garage, entry, living room, two bedrooms; at the back the kitchen with an island and a dining area
// opening onto a covered patio, the primary bedroom with its bathroom; laundry/mudroom between the garage and the kitchen. Made up.
// Design concept: California casual. White oak furniture and whitewashed oak floors, porcelain stone in the entry, the kitchen,
// the laundry and the bathrooms, warm limewashed walls; linen and sand for the big soft pieces, navy and sage as the accents (a navy
// limewash fireplace wall, the navy island, a navy rug in the primary bedroom; a sage headboard wall, olive-sage armchairs, sage zellige
// in the hall bathroom, a sage bike), black details (pendants, frames, shower, taps) and big plants. The three bedrooms differ:
// a calm primary suite, a coordinated kids' room, a guest room that works as a home office with a sofa bed.
// The patio is a room with walls (exterior walls cannot be removed, D-021): its three open sides are wide full-height openings;
// it is furnished as an outdoor living room. A door between two rooms sits 1 cm off the wall middle towards the room its leaf swings into.
// The wall face is 5 cm inside a room's outline, so items stand with their backs 5 cm in.
import {door, win, F, haLight, sensorKit, deviceKit, stats, WEATHER, worktop} from '../kit.ts';

const ROOMS = [
  {
    id: 'garage',
    short: 'Garage',
    polygon: [
      [0, 0],
      [6.6, 0],
      [6.6, 7],
      [0, 7],
    ],
  },
  {
    id: 'laundry',
    short: 'Laundry room',
    polygon: [
      [6.8, 3.6],
      [9.2, 3.6],
      [9.2, 7],
      [6.8, 7],
    ],
  },
  {
    id: 'entry',
    short: 'Entry',
    polygon: [
      [6.8, 0],
      [9.2, 0],
      [9.2, 3.5],
      [6.8, 3.5],
    ],
  },
  {
    id: 'living',
    short: 'Living room',
    polygon: [
      [9.3, 0],
      [15, 0],
      [15, 7],
      [9.3, 7],
    ],
  },
  {
    id: 'kitchen',
    short: 'Kitchen',
    polygon: [
      [6.8, 7.1],
      [15, 7.1],
      [15, 11],
      [6.8, 11],
    ],
  },
  {
    id: 'kids',
    short: "Kids' room",
    polygon: [
      [15.1, 0],
      [17.9, 0],
      [17.9, 3.6],
      [15.1, 3.6],
    ],
  },
  {
    id: 'guest',
    short: 'Guest room',
    polygon: [
      [18, 0],
      [21, 0],
      [21, 3.6],
      [18, 3.6],
    ],
  },
  {
    id: 'hall',
    short: 'Hallway',
    polygon: [
      [15.1, 3.7],
      [21, 3.7],
      [21, 5],
      [15.1, 5],
    ],
  },
  {
    id: 'bath',
    short: 'Hall bathroom',
    polygon: [
      [15.1, 5.1],
      [17.3, 5.1],
      [17.3, 7.5],
      [15.1, 7.5],
    ],
  },
  {
    id: 'primary_bath',
    short: 'Primary bathroom',
    polygon: [
      [15.1, 7.6],
      [17.3, 7.6],
      [17.3, 11],
      [15.1, 11],
    ],
  },
  {
    id: 'primary',
    short: 'Primary bedroom',
    polygon: [
      [17.4, 5.1],
      [21, 5.1],
      [21, 11],
      [17.4, 11],
    ],
  },
  {
    id: 'patio',
    short: 'Patio',
    polygon: [
      [10.4, 11.2],
      [15, 11.2],
      [15, 14.7],
      [10.4, 14.7],
    ],
  },
];

const cased = (a, b, top = 2.3) => ({...door(a, b, top), leaf: false}); // an opening with no door leaf
const OPENINGS = [
  door([0.85, 0], [5.75, 0], 2.15), // garage door, 16 ft
  door([4.2, 7], [5.1, 7]), // garage side door
  door([6.71, 4], [6.71, 4.85]), // garage ↔ laundry, opens into the house
  door([7.5, 0], [8.5, 0], 2.15), // front door
  cased([9.25, 1], [9.25, 2.6]), // entry ↔ living room
  door([8.2, 7.04], [9, 7.04]), // laundry ↔ kitchen
  win([10, 0], [12.4, 0], 0.6, 2.3),
  win([13, 0], [14.4, 0], 0.9, 2.3), // living room, to the street
  cased([10.3, 7.05], [14, 7.05], 2.4), // living room ↔ kitchen, wide opening
  cased([15.05, 3.8], [15.05, 4.9]), // living room ↔ bedroom hallway
  win([8.4, 11], [9.8, 11], 1.05, 2.2), // kitchen, over the sink
  win([11, 11.09], [12.2, 11.09], 0.9, 2.2), // kitchen, onto the patio
  door([12.6, 11.1], [14.4, 11.1], 2.3), // sliding door to the patio
  win([15.8, 0], [17.2, 0]), // kids' room
  door([16.9, 3.64], [17.7, 3.64]), // hallway ↔ kids' room
  win([18.8, 0], [20.2, 0]),
  win([21, 1.2], [21, 2.4]), // guest room
  door([18.2, 3.64], [19, 3.64]), // hallway ↔ guest room
  win([21, 3.95], [21, 4.75], 0.9, 2.2), // end of the hallway
  door([15.25, 5.06], [15.95, 5.06]), // hallway ↔ hall bathroom
  door([17.6, 5.06], [18.5, 5.06]), // hallway ↔ primary bedroom
  win([18.5, 11], [20, 11]),
  win([21, 9.8], [21, 10.8]), // primary bedroom
  door([17.34, 9.8], [17.34, 10.6]), // primary bedroom ↔ its bathroom
  win([16.5, 11], [17.1, 11], 1.5, 2.2), // primary bathroom
  door([10.8, 14.7], [14.6, 14.7], 2.6),
  door([10.4, 11.6], [10.4, 14.3], 2.6),
  door([15, 11.6], [15, 14.3], 2.6), // patio: open sides between posts
];

// The home's own finish (kit.ts: STYLES has the shape): warm limewash, a navy limewash fireplace wall, a sage headboard wall,
// white zellige behind the kitchen, stone-look porcelain in the bathrooms; whitewashed oak and stone floors
const STYLE = {
  wall: {
    living: {k: 'plasterLime', tint: '#d6cfc3'},
    bed: {k: 'plasterLime', tint: '#d0c8bb'},
    kitchen: {k: 'plasterLime', tint: '#d8d2c7'},
    hall: {k: 'plasterLime', tint: '#cdc5b7'},
    kids: '#bcc7cb',
    office: {k: 'plasterLime', tint: '#cec6b9'},
  },
  bed: {k: 'plasterLime', tint: '#8c9a84'},
  media: {k: 'plasterLime', tint: '#45536a'},
  sofa: {k: 'plasterLime', tint: '#45536a'},
  splash: {k: 'zelligeWhite'},
  bath: {k: 'tileStone', tint: '#cbbfad'},
  office: {k: 'slatsOak'},
  floor: {
    living: 'oakWhite',
    bed: 'oakWhite',
    kids: 'oakWhite',
    hall: 'oakWhite',
    office: 'oakWhite',
    kitchen: 'stone',
    bath: 'stone',
  },
};
// rooms finished here, the style fills the rest: a stone entry, a laundry with subway tile up to 1.2 m, white-painted block in the garage,
// sage zellige and small tiles in the hall bathroom, oak slats behind the sofa bed in the guest room (edge 3, the west wall), a stucco patio
const FINISH = {
  entry: {floor: 'stone'},
  laundry: {wall: 'tilePanel', floor: 'stone'},
  garage: {wall: 'brickWhite'},
  bath: {wall: 'zellige', wallTint: '#96a58d', floor: 'tileSmall'},
  guest: {wf: [null, null, null, {k: 'slatsOak'}]},
  patio: {wall: 'plaster', wallTint: '#d9d0c2', floor: 'stone'},
};

const FV = (v, ...a) => ({...F(...a), v}); // an item in a catalog variant
const Z = (z, f) => ({...f, z}); // an item at its own height above the floor
const custom = (id, name, x, y, rot, w, d, h, color, extra = {}) => ({
  ...F(id, 'custom', x, y, rot, w, d, h, color),
  name,
  ...extra,
});
const FURNITURE = [
  // garage: a blue SUV nose-in in the east bay; the west bay is the workshop — an oak workbench with a pegboard and a mat, three bikes,
  // graphite shelving, a chest freezer; the panel, the furnace and the water heater by the house wall
  FV('suv', 'g1', 'car', 4.6, 3.4, 180, 1.98, 4.9, 1.8, 'navy'),
  F('g2', 'workbench', 0.4, 4.3, 90, 2, 0.7, 0.9, 'oak'),
  custom('g3', 'Pegboard', 0.065, 4.3, 90, 1.6, 0.03, 0.8, 'oak', {z: 1.15}),
  F('g4', 'rug', 1, 4.3, 90, 1.6, 0.55, 0.012, 'graphite'),
  F('g5', 'bicycle', 1.65, 5.45, 0, 0.6, 1.75, 1.05, 'navy'),
  F('g6', 'bicycle', 2.3, 5.45, 0, 0.6, 1.75, 1.05, 'sage'),
  F('g7', 'bicycle', 2.95, 5.6, 0, 0.5, 1.4, 0.85, 'white'),
  F('g8', 'shelf', 2, 6.7, 0, 1.8, 0.5, 2, 'graphite'),
  F('g9', 'freezer', 0.55, 6.6, 0, 1, 0.65, 0.85, 'white'),
  F('g12', 'elPanel', 6.5, 3.4, 270, 0.4, 0.1, 0.8, 'grey'),
  FV('floor', 'g13', 'gasBoiler', 6.25, 5.8, 270, 0.6, 0.6, 1.4, 'white'),
  Z(0, F('g14', 'waterHeater', 6.25, 6.6, 0, 0.55, 0.55, 1.3, 'white')),

  // laundry/mudroom: the dryer and the washer on the west wall under an oak shelf with baskets of linen, a tall utility cabinet,
  // an oak bench with a coat rack by the garage door, a sage runner, a basket, the folded ironing board, a snake plant
  F('m1', 'dryer', 7.15, 5.3, 90, 0.6, 0.6, 0.85, 'white'),
  F('m2', 'washer', 7.125, 5.95, 90, 0.6, 0.55, 0.85, 'white'),
  Z(1.35, F('m3', 'wallShelf', 6.99, 5.6, 90, 1.3, 0.28, 0.04, 'oak')),
  Z(1.39, FV('books', 'm4', 'decor', 6.99, 5.3, 90, 0.3, 0.22, 0.2, 'white')),
  Z(1.39, FV('candles', 'm5', 'decor', 6.99, 5.95, 90, 0.3, 0.14, 0.18, 'sand')),
  F('m6', 'utilityCabinet', 8.85, 5.3, 270, 0.6, 0.6, 2, 'white'),
  F('m7', 'bench', 8.4, 3.85, 180, 1.2, 0.4, 0.45, 'oak'),
  FV('shelf', 'm8', 'coatHooks', 8.4, 3.775, 180, 1.2, 0.25, 0.35, 'oak'),
  F('m9', 'rug', 8, 5.3, 90, 1.8, 0.7, 0.012, 'olive'),
  F('m10', 'laundryBasket', 8.9, 5.85, 0, 0.45, 0.35, 0.6, 'linen'),
  FV('folded', 'm11', 'ironingBoard', 9.11, 4.5, 270, 0.38, 0.08, 1.35, 'grey'),
  FV('snake', 'm12', 'pottedPlant', 7.1, 6.7, 0, 0.35, 0.35, 0.8, 'white'),

  // entry: an oak bench with a coat rack on the west wall, an oak console with a round mirror, a table lamp, a bowl and a vase, a palm
  // in the corner, a slim shoe cabinet by the door, a sand rug on the stone floor
  F('e1', 'bench', 7.05, 1.9, 90, 1.2, 0.4, 0.45, 'oak'),
  FV('shelf', 'e2', 'coatHooks', 6.975, 1.9, 90, 1.2, 0.25, 0.35, 'oak'),
  F('e3', 'console', 8.3, 3.275, 0, 1.2, 0.35, 0.8, 'oak'),
  Z(1.2, FV('round', 'e4', 'wallMirror', 8.3, 3.435, 0, 0.7, 0.03, 0.7, 'black')),
  Z(0.8, FV('bowl', 'e5', 'decor', 8.55, 3.27, 0, 0.26, 0.26, 0.1, 'black')),
  Z(0.8, FV('vase', 'e6', 'decor', 8.8, 3.27, 0, 0.16, 0.16, 0.45, 'white')),
  FV('palm', 'e7', 'pottedPlant', 7.2, 3.1, 0, 0.6, 0.6, 1.6, 'sand'),
  F('e8', 'shoeCabinet', 7.15, 0.2, 180, 0.55, 0.3, 0.9, 'oak'),
  F('e9', 'rug', 8.05, 1.75, 0, 1.4, 2.1, 0.012, 'sand'),

  // living room: the fireplace with the TV above it on the navy limewash wall, floating oak shelves with decor on both sides over
  // a snake plant and a vase of pampas, decor on the mantel; a linen sectional facing it with an oak console behind it (two table
  // lamps, books), a round oak coffee table on a sand rug, a white pouf, an olive armchair and a floor lamp by the kitchen opening;
  // by the street window two olive armchairs with a side table and a reading lamp; linen curtains, a fig tree, a palm, a snake plant
  F('l1', 'fireplace', 9.525, 4.9, 90, 1.6, 0.35, 1, 'white'),
  Z(1.35, F('l2', 'tv', 9.38, 4.9, 90, 1.4, 0.06, 0.8)),
  Z(1.25, F('l3', 'wallShelf', 9.475, 3.35, 90, 0.8, 0.25, 0.04, 'oak')),
  Z(1.65, F('l4', 'wallShelf', 9.475, 3.35, 90, 0.8, 0.25, 0.04, 'oak')),
  Z(1.25, F('l27', 'wallShelf', 9.475, 6.45, 90, 0.8, 0.25, 0.04, 'oak')),
  Z(1.65, F('l28', 'wallShelf', 9.475, 6.45, 90, 0.8, 0.25, 0.04, 'oak')),
  Z(1.29, FV('books', 'l29', 'decor', 9.48, 3.2, 90, 0.3, 0.2, 0.2, 'white')),
  Z(1.69, FV('vase', 'l30', 'decor', 9.48, 3.5, 90, 0.14, 0.14, 0.36, 'sand')),
  Z(1.29, FV('candles', 'l31', 'decor', 9.48, 6.45, 90, 0.28, 0.12, 0.18, 'white')),
  Z(1.69, FV('books', 'l32', 'decor', 9.48, 6.3, 90, 0.3, 0.2, 0.16, 'sand')),
  FV('snake', 'l33', 'pottedPlant', 9.6, 3.35, 0, 0.4, 0.4, 0.9, 'white'),
  FV('pampas', 'l34', 'floorVase', 9.6, 6.45, 0, 0.35, 0.35, 1.15, 'sand'),
  Z(1, FV('candles', 'l5', 'decor', 9.53, 4.35, 90, 0.3, 0.14, 0.2, 'white')),
  Z(1, FV('vase', 'l6', 'decor', 9.53, 5.5, 90, 0.16, 0.16, 0.45, 'black')),
  {...F('l7', 'sofaCorner', 12.6, 4.9, 270, 3, 2, 0.82, 'linen'), mx: true},
  F('l8', 'console', 13.8, 4.9, 90, 1.6, 0.35, 0.75, 'oak'),
  Z(0.75, FV('books', 'l9', 'decor', 13.8, 4.9, 90, 0.3, 0.22, 0.18, 'sand')),
  FV('round', 'l10', 'tableCoffee', 11.9, 5.4, 0, 1, 1, 0.38, 'oak'),
  Z(0.38, FV('books', 'l11', 'decor', 11.75, 5.3, 20, 0.3, 0.22, 0.12, 'graphite')),
  Z(0.38, FV('vase', 'l12', 'decor', 12.1, 5.55, 0, 0.16, 0.16, 0.4, 'white')),
  F('l13', 'rug', 11.6, 4.9, 90, 3.6, 2.8, 0.012, 'sand'),
  F('l14', 'ottoman', 10.95, 4.55, 0, 0.55, 0.55, 0.4, 'white'),
  F('l15', 'loungeChair', 10.9, 6.2, 20, 0.8, 0.8, 0.78, 'olive'),
  F('l16', 'lampRoundFloor', 10, 6.65, 0, 0.4, 0.4, 1.6, 'linen'),
  F('l17', 'loungeChair', 10.75, 1.15, 45, 0.8, 0.8, 0.78, 'olive'),
  F('l18', 'loungeChair', 12.15, 1.15, 315, 0.8, 0.8, 0.78, 'olive'),
  FV('round', 'l19', 'sideTable', 11.45, 0.7, 0, 0.45, 0.45, 0.5, 'oak'),
  Z(0.5, FV('flowers', 'l20', 'pottedPlant', 11.45, 0.7, 0, 0.28, 0.28, 0.32, 'white')),
  F('l21', 'lampRoundFloor', 11.45, 0.3, 0, 0.3, 0.3, 1.55, 'sand'),
  FV('open', 'l22', 'curtains', 11.2, 0.12, 180, 2.8, 0.14, 2.3, 'linen'),
  FV('open', 'l23', 'curtains', 13.7, 0.12, 180, 1.8, 0.14, 2.3, 'linen'),
  FV('ficus', 'l24', 'pottedPlant', 14.6, 6.55, 0, 0.7, 0.7, 1.9, 'sand'),
  FV('palm', 'l25', 'pottedPlant', 14.5, 0.5, 0, 0.9, 0.9, 1.7, 'white'),
  FV('snake', 'l26', 'pottedPlant', 9.75, 0.45, 0, 0.4, 0.4, 0.9, 'sand'),

  // kitchen: white fronts in an L — a steel French-door fridge, the oven tower and the cooktop under a black hood on the west wall,
  // a corner unit, the double sink under the window and the dishwasher along the north wall; a white wall cabinet, open oak shelves,
  // the coffee machine; a navy island with three oak stools, a fruit bowl and eucalyptus; an oak sideboard under the patio window
  FV('french', 'k1', 'fridge', 7.21, 7.61, 90, 0.91, 0.72, 1.78, 'steel'),
  FV('oven', 'k2', 'kitchenTall', 7.15, 8.375, 90, 0.6, 0.6, 2.2, 'white'),
  F('k3', 'kitchenBase', 7.15, 8.875, 90, 0.4, 0.6, 0.9, 'white'),
  F('k4', 'kitchenHob', 7.15, 9.375, 90, 0.6, 0.6, 0.9, 'white'),
  FV('dome', 'k5', 'hood', 7.1, 9.375, 90, 0.6, 0.5, 0.9, 'black'),
  F('k6', 'kitchenCorner', 7.35, 10.35, 0, 1, 1.2, 0.9, 'white'),
  F('k7', 'kitchenBase', 8.25, 10.65, 0, 0.8, 0.6, 0.9, 'white'),
  FV('two', 'k8', 'kitchenSink', 9.1, 10.65, 0, 0.9, 0.6, 0.9, 'white'),
  F('k9', 'dishwasher', 9.85, 10.65, 0, 0.6, 0.6, 0.9, 'white'),
  F('k10', 'kitchenBase', 10.475, 10.65, 0, 0.65, 0.6, 0.9, 'white'),
  F('k11', 'kitchenWall', 7.6, 10.775, 0, 1.5, 0.35, 0.75, 'white'),
  Z(1.5, F('k12', 'wallShelf', 10.4, 10.81, 0, 1, 0.28, 0.04, 'oak')),
  Z(1.9, F('k13', 'wallShelf', 10.4, 10.81, 0, 1, 0.28, 0.04, 'oak')),
  Z(1.54, FV('books', 'k14', 'decor', 10.15, 10.82, 0, 0.26, 0.2, 0.18, 'white')),
  Z(1.94, FV('vase', 'k15', 'decor', 10.65, 10.82, 0, 0.14, 0.14, 0.3, 'sand')),
  Z(0.9, F('k16', 'coffee', 10.5, 10.75, 0, 0.25, 0.38, 0.38, 'black')),
  Z(0.9, FV('snake', 'k17', 'pottedPlant', 8.05, 10.75, 0, 0.25, 0.25, 0.42, 'white')),
  F('k18', 'kitchenIsland', 10, 8.9, 0, 2.4, 1, 0.92, 'navy'),
  F('k19', 'barStool', 9.3, 7.95, 180, 0.42, 0.42, 0.9, 'oak'),
  F('k20', 'barStool', 10, 7.95, 180, 0.42, 0.42, 0.9, 'oak'),
  F('k21', 'barStool', 10.7, 7.95, 180, 0.42, 0.42, 0.9, 'oak'),
  Z(0.92, FV('bowl', 'k22', 'decor', 9.4, 8.95, 0, 0.32, 0.32, 0.14, 'white')),
  Z(0.92, FV('eucalyptus', 'k23', 'floorVase', 10.75, 8.95, 0, 0.3, 0.3, 0.55, 'white')),
  F('k24', 'sideboard', 11.65, 10.725, 0, 1.4, 0.45, 0.85, 'oak'),
  Z(0.85, FV('books', 'k25', 'decor', 11.3, 10.72, 0, 0.3, 0.22, 0.18, 'sand')),
  Z(0.85, FV('flowers', 'k26', 'pottedPlant', 12, 10.72, 0, 0.3, 0.3, 0.35, 'white')),
  // dining area: an oak table for six with black chairs on a sand rug by the patio door, two black pendants over it, a picture on the
  // east wall, a fig tree by the door and a palm in the corner by the living room opening
  F('d1', 'diningTable', 13.25, 9, 0, 1.9, 0.95, 0.76, 'oak'),
  ...[12.7, 13.25, 13.8].flatMap((x, i) => [
    F('d' + (2 + i), 'chairCushion', x, 8.2, 180, 0.45, 0.52, 0.84, 'graphite'),
    F('d' + (5 + i), 'chairCushion', x, 9.8, 0, 0.45, 0.52, 0.84, 'graphite'),
  ]),
  F('d8', 'rug', 13.25, 9, 0, 2.8, 2.2, 0.012, 'sand'),
  Z(0.76, FV('eucalyptus', 'd9', 'floorVase', 13.25, 9, 0, 0.25, 0.25, 0.5, 'white')),
  Z(1.3, F('d10', 'picture', 14.935, 9, 270, 1.2, 0.03, 0.8, 'oak')),
  FV('ficus', 'd11', 'pottedPlant', 14.65, 10.1, 0, 0.6, 0.6, 1.8, 'white'),
  FV('palm', 'd12', 'pottedPlant', 14.6, 7.55, 0, 0.6, 0.6, 1.5, 'sand'),

  // kids' room: soft blue-gray walls, an oak bed along the west wall with a poster above it and a white nightstand with a lamp,
  // a white desk under the window with a navy chair, a sage wardrobe, white toy storage with neutral bins and oak shelves above it (the plant on
  // the top one, out of reach), a round olive rug, a white pouf, a linen roller blind
  F('c1', 'bed', 15.65, 2.5, 0, 0.95, 2, 0.9, 'oak'),
  F('c2', 'nightstand', 16.35, 3.35, 0, 0.4, 0.35, 0.5, 'white'),
  Z(1.25, FV('poster', 'c3', 'picture', 15.165, 2.5, 90, 0.6, 0.03, 0.8, 'oak')),
  F('c4', 'desk', 16.5, 0.35, 180, 1.1, 0.6, 0.72, 'white'),
  F('c5', 'chairDesk', 16.5, 0.95, 180, 0.55, 0.55, 0.95, 'navy'),
  F('c6', 'wardrobeRun', 17.575, 0.7, 270, 1.2, 0.55, 2.1, 'sage'),
  FV('neutral', 'c7', 'toyStorage', 17.63, 1.95, 270, 1, 0.44, 0.56, 'white'),
  Z(1.15, F('c8', 'wallShelf', 17.74, 1.95, 270, 1, 0.22, 0.03, 'oak')),
  Z(1.5, F('c9', 'wallShelf', 17.74, 1.95, 270, 1, 0.22, 0.03, 'oak')),
  Z(1.53, FV('snake', 'c10', 'pottedPlant', 17.74, 2.25, 0, 0.25, 0.25, 0.35, 'white')),
  Z(1.18, FV('books', 'c11', 'decor', 17.74, 1.75, 270, 0.3, 0.18, 0.16, 'sand')),
  FV('round', 'c12', 'rug', 16.6, 1.9, 0, 1.5, 1.5, 0.012, 'olive'),
  F('c13', 'ottoman', 16.85, 1.65, 0, 0.45, 0.45, 0.38, 'white'),
  Z(0.86, FV('roller', 'c14', 'blind', 16.5, 0.08, 180, 1.5, 0.06, 1.5, 'linen')),

  // guest room and home office: a sand sofa bed on the oak-slatted west wall with a picture above it, a floor lamp; an oak desk under
  // the east window with a monitor and a black chair, an oak bookcase, a navy rug, a monstera, linen curtains and a roller blind
  F('o1', 'sofaBed', 18.5, 1.6, 90, 2, 0.9, 0.85, 'sand'),
  Z(1.3, F('o2', 'picture', 18.065, 1.6, 90, 1, 0.03, 0.7, 'black')),
  F('o3', 'lampRoundFloor', 18.3, 0.3, 0, 0.35, 0.35, 1.6, 'graphite'),
  F('o4', 'desk', 20.65, 1.8, 270, 1.4, 0.6, 0.75, 'oak'),
  FV('stand', 'o5', 'monitor', 20.8, 1.8, 270, 0.6, 0.2, 0.42),
  F('o6', 'chairDesk', 20, 1.8, 90, 0.6, 0.6, 1, 'black'),
  F('o7', 'shelf', 20.2, 3.375, 0, 1.4, 0.35, 2, 'oak'),
  F('o8', 'rug', 19.45, 1.6, 90, 2, 1.5, 0.012, 'navy'),
  FV('monstera', 'o9', 'pottedPlant', 20.55, 0.45, 0, 0.7, 0.7, 0.95, 'sand'),
  FV('open', 'o10', 'curtains', 19.5, 0.12, 180, 1.8, 0.14, 2.5, 'linen'),
  Z(0.86, FV('roller', 'o11', 'blind', 20.92, 1.8, 270, 1.3, 0.06, 1.5, 'linen')),
  Z(0.75, FV('books', 'o12', 'decor', 20.75, 1.25, 270, 0.3, 0.22, 0.14, 'sand')),

  // hallway: the thermostat, a linen runner, a narrow oak console with a vase and a picture, a small picture by the bathroom door,
  // a snake plant under the end window
  F('h1', 'thermostat', 16.6, 4.9375, 0, 0.09, 0.025, 0.09, 'white'),
  F('h2', 'rug', 18, 4.35, 0, 4, 0.8, 0.012, 'linen'),
  F('h3', 'console', 19.95, 4.82, 0, 1, 0.26, 0.8, 'oak'),
  Z(0.8, FV('vase', 'h4', 'decor', 20.2, 4.82, 0, 0.16, 0.16, 0.45, 'black')),
  Z(1.3, F('h5', 'picture', 19.95, 4.935, 0, 0.8, 0.03, 0.6, 'black')),
  Z(1.3, FV('poster', 'h6', 'picture', 16.95, 4.935, 0, 0.45, 0.03, 0.6, 'oak')),
  FV('snake', 'h7', 'pottedPlant', 20.7, 4.35, 0, 0.35, 0.35, 0.85, 'sand'),

  // hall bathroom: sage zellige, a tub along the north wall with a black shower set, a wall-hung oak vanity with a round mirror,
  // a wall-hung toilet, a black towel warmer, a linen bath mat, a laundry basket, a snake plant
  F('x1', 'bath', 16, 7.075, 0, 1.7, 0.75, 0.58, 'white'),
  F('x2', 'showerColumn', 15.4, 7.275, 0, 0.3, 0.35, 1.2, 'black'),
  FV('wall', 'x3', 'vanity', 15.4, 6.25, 90, 0.8, 0.5, 0.85, 'oak'),
  Z(1.15, FV('round', 'x4', 'wallMirror', 15.165, 6.25, 90, 0.6, 0.03, 0.6, 'black')),
  FV('wall', 'x5', 'toilet', 16.975, 6, 270, 0.38, 0.55, 0.8, 'white'),
  FV('ladder', 'x6', 'towelRail', 17.2, 5.45, 270, 0.5, 0.1, 0.8, 'black'),
  F('x7', 'rug', 16, 6.4, 0, 0.9, 0.5, 0.012, 'linen'),
  F('x8', 'laundryBasket', 16.2, 5.35, 0, 0.4, 0.34, 0.55, 'linen'),
  FV('snake', 'x9', 'pottedPlant', 17.05, 7.25, 0, 0.3, 0.3, 0.75, 'white'),

  // primary bathroom: a walk-in shower with a black frame, a double oak vanity with two round mirrors, a wall-hung toilet,
  // a black towel warmer, a linen mat, a laundry basket, a monstera
  FV('rect', 'p1', 'walkIn', 15.75, 10.5, 0, 1.2, 0.9, 2, 'black'),
  FV('wall', 'p2', 'vanity', 15.425, 8.75, 90, 1.6, 0.55, 0.85, 'oak'),
  Z(1.15, FV('round', 'p3', 'wallMirror', 15.165, 8.35, 90, 0.55, 0.03, 0.55, 'black')),
  Z(1.15, FV('round', 'p4', 'wallMirror', 15.165, 9.15, 90, 0.55, 0.03, 0.55, 'black')),
  FV('wall', 'p5', 'toilet', 16.975, 8.4, 270, 0.38, 0.55, 0.8, 'white'),
  FV('ladder', 'p6', 'towelRail', 16.2, 7.7, 180, 0.5, 0.1, 1, 'black'),
  F('p7', 'rug', 16.05, 8.75, 90, 1.2, 0.6, 0.012, 'linen'),
  F('p8', 'laundryBasket', 16.95, 9.35, 0, 0.4, 0.34, 0.55, 'linen'),
  FV('monstera', 'p9', 'pottedPlant', 16.95, 7.95, 0, 0.4, 0.4, 0.9, 'white'),
  Z(0.85, FV('candles', 'p10', 'decor', 15.4, 8.75, 90, 0.26, 0.12, 0.16, 'white')),

  // primary bedroom: an oak king bed with a wooden headboard against the sage wall with a picture above it, oak nightstands with table lamps, a navy rug,
  // an oak bench at the foot; an oak sliding wardrobe along the south wall; an oak dresser with a round mirror, a vase and books;
  // a linen reading chair and a floor lamp between the windows, linen curtains, a fig tree
  FV('wood', 'b1', 'bed', 18.525, 7.9, 90, 1.95, 2.15, 1.1, 'oak'),
  F('b2', 'nightstand', 17.66, 6.6, 90, 0.5, 0.42, 0.55, 'oak'),
  F('b3', 'nightstand', 17.66, 9.2, 90, 0.5, 0.42, 0.55, 'oak'),
  Z(1.35, F('b4', 'picture', 17.465, 7.9, 90, 1.4, 0.03, 0.7, 'oak')),
  F('b5', 'rug', 18.85, 7.9, 90, 2.8, 2.6, 0.012, 'navy'),
  F('b6', 'bench', 19.85, 7.9, 90, 1.4, 0.42, 0.45, 'oak'),
  FV('sliding', 'b7', 'wardrobeRun', 19.75, 5.45, 180, 2.4, 0.6, 2.4, 'oak'),
  F('b8', 'dresser', 20.725, 6.6, 270, 1.2, 0.45, 0.8, 'oak'),
  Z(1.2, FV('round', 'b9', 'wallMirror', 20.935, 6.6, 270, 0.7, 0.03, 0.7, 'black')),
  Z(0.8, FV('vase', 'b10', 'decor', 20.72, 6.2, 270, 0.16, 0.16, 0.45, 'white')),
  Z(0.8, FV('books', 'b11', 'decor', 20.72, 6.95, 270, 0.3, 0.22, 0.16, 'sand')),
  F('b12', 'loungeChair', 20.35, 10.35, 225, 0.8, 0.8, 0.78, 'linen'),
  F('b13', 'lampRoundFloor', 20.75, 9.6, 0, 0.35, 0.35, 1.6, 'linen'),
  FV('open', 'b14', 'curtains', 19.25, 10.88, 0, 1.9, 0.14, 2.5, 'linen'),
  FV('open', 'b15', 'curtains', 20.88, 10.3, 270, 1.4, 0.14, 2.5, 'linen'),
  FV('ficus', 'b16', 'pottedPlant', 18.1, 10.55, 0, 0.6, 0.6, 1.8, 'sand'),

  // patio, an outdoor living room: an oak dining table for four by the kitchen window, a linen sofa facing an olive lounge chair across
  // a round oak coffee table on a sand rug, the grill, planters with a palm, an olive tree and snake plants
  FV('rect', 't1', 'patioTable', 11.75, 12.35, 90, 1.4, 0.85, 0.74, 'oak'),
  F('t2', 'patioChair', 11.05, 12, 90, 0.56, 0.58, 0.82, 'oak'),
  F('t3', 'patioChair', 11.05, 12.7, 90, 0.56, 0.58, 0.82, 'oak'),
  F('t4', 'patioChair', 12.45, 12, 270, 0.56, 0.58, 0.82, 'oak'),
  F('t5', 'patioChair', 12.45, 12.7, 270, 0.56, 0.58, 0.82, 'oak'),
  Z(0.74, FV('flowers', 't6', 'pottedPlant', 11.75, 12.35, 0, 0.3, 0.3, 0.35, 'terracotta')),
  F('t7', 'rug', 13.4, 13.35, 90, 2.2, 2, 0.012, 'sand'),
  F('t8', 'loungeSofa', 14.25, 13.3, 270, 2, 0.85, 0.75, 'linen'),
  FV('round', 't9', 'tableCoffee', 13.15, 13.3, 0, 0.8, 0.8, 0.38, 'oak'),
  Z(0.38, FV('candles', 't10', 'decor', 13.15, 13.3, 0, 0.3, 0.14, 0.2, 'white')),
  F('t11', 'loungeChair', 12.25, 13.8, 90, 0.85, 0.85, 0.75, 'olive'),
  F('t12', 'grill', 11.05, 13.85, 90, 0.6, 0.6, 1.1, 'black'),
  FV('palm', 't13', 'pottedPlant', 14.7, 11.4, 0, 0.38, 0.38, 1.4, 'terracotta'),
  FV('ficus', 't14', 'pottedPlant', 10.9, 11.4, 0, 0.36, 0.36, 1.5, 'terracotta'),
  FV('snake', 't15', 'pottedPlant', 12.4, 11.45, 0, 0.35, 0.35, 0.85, 'terracotta'),
  FV('snake', 't16', 'pottedPlant', 10.62, 14.48, 0, 0.3, 0.3, 0.8, 'terracotta'),
  FV('snake', 't17', 'pottedPlant', 14.8, 14.5, 0, 0.3, 0.3, 0.8, 'terracotta'),
];

worktop(FURNITURE, 'white'); // the kitchen's worktop: white quartz

const LIGHTS = [
  {id: 'entry_main', name: 'Entry ceiling light', room: 'entry', kind: 'ceiling'},
  {id: 'entry_lamp', name: 'Entry table lamp', room: 'entry', kind: 'accent'},
  {id: 'porch', name: 'Porch light', room: null, kind: 'accent', h: 2},
  {id: 'living_cans', name: 'Living room recessed lights', room: 'living', kind: 'ceiling'},
  {id: 'living_floor', name: 'Floor lamp', room: 'living', kind: 'accent'},
  {id: 'living_reading', name: 'Reading floor lamp', room: 'living', kind: 'accent', color: '#ffd9a0'},
  {id: 'living_console', name: 'Console table lamps', room: 'living', kind: 'accent', color: '#ffd34d'},
  {id: 'kitchen_cans', name: 'Kitchen recessed lights', room: 'kitchen', kind: 'ceiling'},
  {id: 'kitchen_island', name: 'Island pendants', room: 'kitchen', kind: 'ceiling', color: '#ffc773'},
  {id: 'kitchen_counter', name: 'Countertop strip', room: 'kitchen', kind: 'strip'},
  {id: 'dining_chandelier', name: 'Dining pendants', room: 'kitchen', kind: 'ceiling', color: '#ffc773'},
  {id: 'laundry_main', name: 'Laundry light', room: 'laundry', kind: 'ceiling'},
  {id: 'garage_main', name: 'Garage lights', room: 'garage', kind: 'ceiling'},
  {id: 'garage_bench', name: 'Workbench strip', room: 'garage', kind: 'strip'},
  {id: 'hall_main', name: 'Hallway lights', room: 'hall', kind: 'ceiling'},
  {id: 'hall_night', name: 'Hallway night light', room: 'hall', kind: 'accent', color: '#ffb46b'},
  {id: 'kids_main', name: 'Ceiling light', room: 'kids', kind: 'ceiling'},
  {id: 'kids_desk', name: 'Desk lamp', room: 'kids', kind: 'accent'},
  {id: 'kids_bedside', name: 'Bedside lamp', room: 'kids', kind: 'accent', color: '#ffd34d'},
  {id: 'guest_main', name: 'Ceiling light', room: 'guest', kind: 'ceiling'},
  {id: 'guest_desk', name: 'Desk lamp', room: 'guest', kind: 'accent'},
  {id: 'guest_floor', name: 'Floor lamp', room: 'guest', kind: 'accent'},
  {id: 'primary_main', name: 'Ceiling light', room: 'primary', kind: 'ceiling'},
  {id: 'primary_bedside', name: 'Bedside lamps', room: 'primary', kind: 'accent', color: '#ffd34d'},
  {id: 'primary_reading', name: 'Reading floor lamp', room: 'primary', kind: 'accent', color: '#ffd9a0'},
  {id: 'bath_main', name: 'Bathroom light', room: 'bath', kind: 'ceiling'},
  {id: 'bath_vanity', name: 'Vanity light', room: 'bath', kind: 'accent'},
  {id: 'primary_bath_spots', name: 'Primary bath spots', room: 'primary_bath', kind: 'ceiling'},
  {id: 'primary_bath_mirror', name: 'Mirror light', room: 'primary_bath', kind: 'accent'},
  {id: 'patio_wall', name: 'Patio wall light', room: 'patio', kind: 'accent', h: 2},
  {id: 'patio_string', name: 'Patio string lights', room: 'patio', kind: 'strip', color: '#ffc46b'},
];
// every light with an area is placed: spots, pendants and ceiling lights; the lamps on their furniture (the entry console, the sofa
// console, the nightstands, the desks), the floor lamps; the strips under the kitchen cabinets and over the workbench; the vanity and
// mirror lights; the patio wall light and the string lights along the house wall. The porch light has no area: the wizard asks where it is.
const PLACED = [
  {id: 'entry_main', placed: true, room: 'entry', points: [[8, 1.75]]},
  {
    id: 'entry_lamp',
    placed: true,
    room: 'entry',
    form: 'lamp',
    opt: 'table',
    h: 1.15,
    points: [[7.95, 3.28]],
  },
  {
    id: 'living_cans',
    placed: true,
    room: 'living',
    form: 'spots',
    h: 2.58,
    points: [
      [10.8, 1.4],
      [12.5, 1.4],
      [14, 1.4],
      [10.8, 3.6],
      [12.5, 3.6],
      [14, 3.6],
      [10.8, 5.8],
      [12.5, 5.8],
      [14, 5.8],
    ],
  },
  {
    id: 'living_floor',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[10, 6.65]],
  },
  {
    id: 'living_reading',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'floor',
    h: 1.45,
    points: [[11.45, 0.3]],
  },
  {
    id: 'living_console',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'table',
    h: 1.1,
    points: [
      [13.8, 4.35],
      [13.8, 5.45],
    ],
  },
  {
    id: 'kitchen_cans',
    placed: true,
    room: 'kitchen',
    form: 'spots',
    h: 2.58,
    points: [
      [8.2, 8],
      [8.2, 9.9],
      [11.8, 8],
      [11.8, 9.9],
    ],
  },
  {
    id: 'kitchen_island',
    placed: true,
    room: 'kitchen',
    form: 'pendant',
    h: 1.8,
    points: [
      [9.3, 8.9],
      [10, 8.9],
      [10.7, 8.9],
    ],
  },
  {
    id: 'kitchen_counter',
    placed: true,
    room: 'kitchen',
    form: 'strip',
    h: 1.43,
    segments: [
      [
        [6.9, 10.65],
        [8.3, 10.65],
      ],
      [
        [9.92, 10.72],
        [10.88, 10.72],
      ],
    ],
  },
  {
    id: 'dining_chandelier',
    placed: true,
    room: 'kitchen',
    form: 'pendant',
    h: 1.75,
    points: [
      [12.85, 9],
      [13.65, 9],
    ],
  },
  {id: 'laundry_main', placed: true, room: 'laundry', points: [[8, 5.3]]},
  {
    id: 'garage_main',
    placed: true,
    room: 'garage',
    form: 'line',
    h: 2.58,
    segments: [
      [
        [1.8, 2],
        [1.8, 5],
      ],
      [
        [4.6, 2],
        [4.6, 5],
      ],
    ],
  },
  {
    id: 'garage_bench',
    placed: true,
    room: 'garage',
    form: 'strip',
    h: 1.1,
    segments: [
      [
        [0.09, 3.5],
        [0.09, 5.1],
      ],
    ],
  },
  {
    id: 'hall_main',
    placed: true,
    room: 'hall',
    points: [
      [16.5, 4.35],
      [19.5, 4.35],
    ],
  },
  {id: 'hall_night', placed: true, room: 'hall', form: 'wall', h: 0.35, points: [[16.3, 4.94]]},
  {id: 'kids_main', placed: true, room: 'kids', points: [[16.5, 1.8]]},
  {id: 'kids_desk', placed: true, room: 'kids', form: 'lamp', opt: 'table', h: 1.08, points: [[16.05, 0.25]]},
  {
    id: 'kids_bedside',
    placed: true,
    room: 'kids',
    form: 'lamp',
    opt: 'table',
    h: 0.85,
    points: [[16.35, 3.35]],
  },
  {id: 'guest_main', placed: true, room: 'guest', points: [[19.5, 1.8]]},
  {
    id: 'guest_desk',
    placed: true,
    room: 'guest',
    form: 'lamp',
    opt: 'table',
    h: 1.1,
    points: [[20.75, 2.35]],
  },
  {id: 'guest_floor', placed: true, room: 'guest', form: 'lamp', opt: 'floor', h: 1.5, points: [[18.3, 0.3]]},
  {id: 'primary_main', placed: true, room: 'primary', points: [[19, 8]]},
  {
    id: 'primary_bedside',
    placed: true,
    room: 'primary',
    form: 'lamp',
    opt: 'table',
    h: 0.95,
    points: [
      [17.66, 6.6],
      [17.66, 9.2],
    ],
  },
  {
    id: 'primary_reading',
    placed: true,
    room: 'primary',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[20.75, 9.6]],
  },
  {id: 'bath_main', placed: true, room: 'bath', points: [[16.2, 6.2]]},
  {id: 'bath_vanity', placed: true, room: 'bath', form: 'wall', h: 1.85, points: [[15.17, 6.25]]},
  {
    id: 'primary_bath_spots',
    placed: true,
    room: 'primary_bath',
    form: 'spots',
    h: 2.58,
    points: [
      [16.2, 8.3],
      [16.2, 9.3],
      [15.75, 10.5],
    ],
  },
  {
    id: 'primary_bath_mirror',
    placed: true,
    room: 'primary_bath',
    form: 'wall',
    h: 1.82,
    points: [
      [15.17, 8.35],
      [15.17, 9.15],
    ],
  },
  {id: 'patio_wall', placed: true, room: 'patio', form: 'wall', h: 2, points: [[12.4, 11.26]]},
  {
    id: 'patio_string',
    placed: true,
    room: 'patio',
    form: 'strip',
    h: 2.45,
    segments: [
      [
        [10.5, 11.28],
        [14.9, 11.28],
      ],
    ],
  },
];

export default async function () {
  const HA = {areas: Object.fromEntries(ROOMS.map(r => [r.id, r.short])), lights: LIGHTS.map(haLight)};
  // Sensors: the thermostat in the hallway and its remote room sensors, an air monitor in the living room, a garage sensor,
  // the primary bathroom humidity (for the fan); fridge, freezer and outdoor are “not room air”; a panel energy monitor, plugs, diagnostics
  const S = sensorKit(),
    add = S.add;
  add('hall', 'thermostat', 'Thermostat Temperature', 'temperature', '°C', 20.6);
  add('hall', 'thermostat', 'Thermostat Humidity', 'humidity', '%', 41);
  add('primary', 'primary_sensor', 'Primary bedroom sensor Temperature', 'temperature', '°C', 19.8);
  add('kids', 'kids_sensor', "Kids' room sensor Temperature", 'temperature', '°C', 20.3);
  add('living', 'living_air', 'Air monitor Temperature', 'temperature', '°C', 21.2);
  add('living', 'living_air', 'Air monitor Humidity', 'humidity', '%', 39);
  add('living', 'living_air', 'Air monitor CO2', 'carbon_dioxide', 'ppm', 820);
  add('living', 'living_air', 'Air monitor Radon', 'radon', 'Bq/m³', 41);
  add('garage', 'garage_sensor', 'Garage sensor Temperature', 'temperature', '°C', 11.4);
  add('garage', 'garage_sensor', 'Garage sensor Humidity', 'humidity', '%', 62);
  add('primary_bath', 'primary_bath_sensor', 'Primary bath sensor Temperature', 'temperature', '°C', 22.9);
  add('primary_bath', 'primary_bath_sensor', 'Primary bath sensor Humidity', 'humidity', '%', 58);
  add('kitchen', 'kitchen_fridge', 'Fridge Temperature', 'temperature', '°C', 3.8);
  add('garage', 'chest_freezer', 'Chest freezer Temperature', 'temperature', '°C', -18.5);
  add('patio', 'outdoor', 'Outdoor sensor Temperature', 'temperature', '°C', 9.1);
  add('patio', 'outdoor', 'Outdoor sensor Humidity', 'humidity', '%', 81);
  add('garage', 'panel', 'Panel monitor Energy', 'energy', 'kWh', 38120.4, {daily: 24.5, shape: 'home'});
  add('garage', 'panel', 'Panel monitor Power', 'power', 'W', 1260);
  add('laundry', 'washer', 'Washer Energy', 'energy', 'kWh', 402.3, {daily: 0.6, shape: 'day'});
  add('laundry', 'washer', 'Washer Power', 'power', 'W', 0);
  add('kitchen', 'dishwasher', 'Dishwasher Energy', 'energy', 'kWh', 611.9, {daily: 1, shape: 'evening'});
  add('living', 'tv_plug', 'TV Energy', 'energy', 'kWh', 522.4, {daily: 0.5, shape: 'evening'});
  add('primary', 'primary_sensor', 'Primary bedroom sensor Battery', 'battery', '%', 64, {cat: 'diagnostic'});
  add('hall', 'thermostat', 'Thermostat Wi-Fi signal', 'signal_strength', 'dBm', -58, {cat: 'diagnostic'});
  Object.assign(HA, {sensors: S.sensors, states: S.states});
  // Devices: central heating and air on one thermostat (heat, cool, heat_cool), floor heating in the primary bathroom; shades and curtains;
  // the garage door opener (a cover of class garage — not a window cover); door and window contacts; doorbell and two cameras; leak sensors, the water main
  const K = deviceKit();
  K.devices.push({entity: 'climate.thermostat', name: 'Thermostat', area: 'hall', domain: 'climate'});
  K.entities['climate.thermostat'] = {
    state: 'heat',
    attributes: {
      hvac_modes: ['off', 'heat', 'cool', 'heat_cool'],
      temperature: 21,
      current_temperature: 20.6,
      min_temp: 7,
      max_temp: 35,
      target_temp_step: 0.5,
      hvac_action: 'heating',
      fan_mode: 'auto',
      fan_modes: ['auto', 'on'],
      supported_features: 1 | 2 | 8 | 128 | 256,
    },
  };
  K.thermostat('primary_bath_floor', 'Floor heating', 'primary_bath', 28, 25.4);
  K.cover('living_shade_1', 'Living room shade 1', 'living', 'blind', 100);
  K.cover('living_shade_2', 'Living room shade 2', 'living', 'blind', 100);
  K.cover('kids_blind', "Kids' room blind", 'kids', 'blind', 0);
  K.cover('primary_curtains', 'Primary bedroom curtains', 'primary', 'curtain', 100);
  K.devices.push({
    entity: 'cover.garage_door',
    name: 'Garage door',
    area: 'garage',
    domain: 'cover',
    cls: 'garage',
  });
  K.entities['cover.garage_door'] = {
    state: 'closed',
    attributes: {device_class: 'garage', supported_features: 3},
  };
  K.contact('front_door', 'Front door', 'entry', 'door', false);
  K.contact('kids_window', "Kids' room window", 'kids', 'window', false);
  K.contact('patio_door', 'Patio door', 'kitchen', 'door', false); // the kitchen has three doors: auto-place takes the one onto the patio
  K.camera('doorbell', 'Doorbell', 'entry');
  K.camera('driveway', 'Driveway camera', 'garage');
  K.camera('backyard', 'Backyard camera', 'patio');
  K.leak('leak_water_heater', 'Water heater leak', 'garage', 91);
  K.leak('leak_washer', 'Washer leak', 'laundry', 77);
  K.leak('leak_sink', 'Kitchen sink leak', 'kitchen', 84);
  K.valve('water_main', 'Water main valve', 'garage');
  K.vacuum('robot', 'Robot vacuum', 'living');
  K.favorites([
    ['scene.movie_night', 'Movie night', 'living', '2026-11-06T20:05:00Z'],
    ['scene.dinner', 'Dinner', 'kitchen', '2026-11-07T18:40:00Z'],
    ['script.bedtime', 'Bedtime', null, 'off'],
    ['input_boolean.vacation', 'Vacation mode', null, 'off'],
    ['switch.bath_fan', 'Bath fan', 'primary_bath', 'off'],
    ['lock.front_door', 'Front door lock', 'entry', 'locked'],
    ['lock.garage_entry', 'Garage entry lock', 'laundry', 'locked'],
  ]);
  Object.assign(HA, {devices: K.devices, entities: K.entities, extra: K.extra});
  HA.stats = stats(['sensor.panel_energy'], ['washer', 'dishwasher', 'tv_plug'], {
    'camera.driveway': {hours: 5, drops: 3},
    'sensor.garage_sensor_temperature': {hours: 0.2, drops: 1},
  });
  HA.weather = WEATHER;
  const DEMO = {
    version: 1,
    units: 'm',
    rooms: ROOMS.map(r => ({
      id: r.id,
      name: r.short,
      polygon: r.polygon,
      ...structuredClone(FINISH[r.id] || {}),
    })),
    openings: OPENINGS,
    furniture: FURNITURE,
    lights: PLACED,
  };
  return {HA, DEMO, DEMO_UNDERLAY: null, STYLE};
}
