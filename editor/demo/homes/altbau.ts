// @ts-nocheck
// Typical home 7 (docs/research/typical-homes.md, D-030): an apartment in an older building (Altbau, Stalin-era), about 103 m² —
// a large living room with a bay window, bedroom, an irregular corner dining room (L-shaped with a cut corner and one window, the “Berliner Zimmer”),
// kitchen with a gas stove and a gas boiler, a long bathroom, hallway. Made up: nobody's apartment. The real ceilings would be 3–3.5 m;
// the editor's wall height is fixed. Metres, x east, y north, 10 cm interior walls; the editor adds the exterior walls.
// Design concept, “Parisian classic”: warm white boiserie panels and honey herringbone floors, walnut antiques, navy and olive velvet,
// gilt-framed pictures. The big rooms are zoned so they feel furnished: the living room has a seating group under a salon gallery wall,
// a reading corner at the bookcases, a writing desk in the bay among plants and an upright piano by the door; the bedroom has a deep navy
// panelled headboard wall; the dining room is panelled in dark olive, with lamps on the sideboard and a reading nook; the kitchen has navy
// fronts, a marble backsplash and a black and white checkerboard floor; the bathroom is marble with a freestanding tub under the window.
// The wall face is 5 cm inside a room's outline, so items stand with their backs 5 cm in.
import {door, win, F, haLight, sensorKit, deviceKit, stats, WEATHER, worktop} from '../kit.ts';

const FV = (v, ...a) => ({...F(...a), v}); // an item in a catalog variant
const Z = (z, f) => ({...f, z}); // an item at its own height above the floor: on furniture or on a wall
const tall = (a, b) => win(a, b, 0.7, 2.45); // tall old windows

// finishes: warm white boiserie everywhere, navy panels behind the bed, honey herringbone, marble (dress() in kit.ts fills what a room
// does not set itself); the dining room is panelled in dark olive (set on the room below)
const PANEL = t => ({k: 'panelsClassic', tint: t}),
  WHITE = '#d8d2c7';
const STYLE = {
  wall: {
    living: PANEL(WHITE),
    bed: PANEL('#d0cac0'),
    kitchen: '#d6d0c6',
    hall: PANEL('#d0c9bd'),
    kids: '#b2c0cc',
    office: PANEL('#cdc6b9'),
  },
  bed: PANEL('#36425a'),
  media: PANEL(WHITE),
  sofa: PANEL(WHITE),
  splash: {k: 'marble'},
  bath: 'marble',
  office: PANEL('#36425a'),
  floor: {
    living: 'herringbone',
    bed: 'herringbone',
    kids: 'herringbone',
    hall: 'herringbone',
    office: 'herringbone',
    kitchen: 'checker',
    bath: 'tileSmall',
  },
};

const ROOMS = [
  {
    id: 'living',
    short: 'Living room',
    polygon: [
      [0, 0],
      [1.4, 0],
      [1.9, -0.9],
      [3.5, -0.9],
      [4, 0],
      [5.4, 0],
      [5.4, 6],
      [0, 6],
    ],
  },
  {
    id: 'bedroom',
    short: 'Bedroom',
    polygon: [
      [5.5, 0],
      [9.4, 0],
      [9.4, 6],
      [5.5, 6],
    ],
  },
  {
    id: 'dining',
    short: 'Dining room',
    polygon: [
      [5.5, 7.6],
      [7.1, 7.6],
      [7.1, 6.1],
      [9.4, 6.1],
      [9.4, 10],
      [8.2, 11.2],
      [5.5, 11.2],
    ],
    finish: {wall: 'panelsClassic', wallTint: '#5d634f'},
  },
  {
    id: 'kitchen',
    short: 'Kitchen',
    polygon: [
      [0, 7.6],
      [3.4, 7.6],
      [3.4, 11.2],
      [0, 11.2],
    ],
  },
  {
    id: 'bathroom',
    short: 'Bathroom',
    polygon: [
      [3.5, 7.6],
      [5.4, 7.6],
      [5.4, 11.2],
      [3.5, 11.2],
    ],
  },
  {
    id: 'hall',
    short: 'Hallway',
    polygon: [
      [0, 6.1],
      [7, 6.1],
      [7, 7.5],
      [0, 7.5],
    ],
  },
];

const OPENINGS = [
  door([0, 6.3], [0, 7.3]), // front door, from the staircase
  door([3.9, 6.05], [4.8, 6.05]), // hallway ↔ living room
  door([6, 6.05], [6.8, 6.05]), // hallway ↔ bedroom
  door([5.45, 0.7], [5.45, 2]), // living room ↔ bedroom, double door by the facade (no leaf drawn)
  door([7.05, 6.2], [7.05, 7.4]), // hallway ↔ dining room, double door
  door([2.4, 7.55], [3.2, 7.55]), // hallway ↔ kitchen
  door([3.7, 7.55], [4.45, 7.55]), // hallway ↔ bathroom
  tall([1.475, -0.135], [1.825, -0.765]),
  tall([2, -0.9], [3.4, -0.9]),
  tall([3.575, -0.765], [3.925, -0.135]), // the bay window: three sides
  tall([6, 0], [7, 0]),
  tall([7.9, 0], [8.9, 0]), // bedroom
  tall([9.22, 10.18], [8.38, 11.02]), // dining room, in the cut corner
  tall([1.1, 11.2], [2.3, 11.2]), // kitchen, onto the courtyard
  win([4, 11.2], [4.9, 11.2], 1.2, 2.3), // bathroom
];

const FURNITURE = [
  // living room, seating group: a navy velvet sofa against the west wall under a salon gallery of five gilt and black frames, a walnut coffee
  // table with books and flowers on a terracotta rug, two olive velvet armchairs turned towards the sofa, a side table with a lamp and
  // a floor lamp at the sofa's ends
  F('a1', 'loungeSofa', 0.525, 3.3, 90, 2.6, 0.95, 0.85, 'navy'),
  F('a2', 'rug', 2.1, 3.3, 90, 3.4, 2.6, 0.012, 'terracotta'),
  F('a3', 'tableCoffee', 1.85, 3.3, 90, 1.2, 0.65, 0.42, 'walnut'),
  Z(0.42, FV('books', 'a4', 'decor', 1.8, 2.95, 80, 0.3, 0.22, 0.16, 'sand')),
  Z(0.42, FV('flowers', 'a5', 'pottedPlant', 1.88, 3.6, 0, 0.28, 0.28, 0.36, 'white')),
  F('a6', 'loungeChair', 3.05, 2.6, 250, 0.8, 0.85, 0.8, 'olive'),
  F('a7', 'loungeChair', 3.05, 4, 290, 0.8, 0.85, 0.8, 'olive'),
  FV('round', 'a8', 'sideTable', 0.32, 4.9, 0, 0.4, 0.4, 0.55, 'walnut'),
  F('a9', 'lampRoundFloor', 0.3, 1.7, 0, 0.35, 0.35, 1.6, 'linen'),
  Z(1.15, F('a10', 'picture', 0.065, 3.3, 90, 0.9, 0.03, 1, 'oak')),
  Z(1.65, F('a11', 'picture', 0.065, 2.45, 90, 0.45, 0.03, 0.55, 'black')),
  Z(1.15, F('a12', 'picture', 0.065, 2.45, 90, 0.45, 0.03, 0.35, 'oak')),
  Z(1.3, F('a13', 'picture', 0.065, 4.15, 90, 0.5, 0.03, 0.75, 'walnut')),
  // reading corner at the north wall: two tall walnut bookcases, a sand leather armchair with a floor lamp, a picture above it
  F('a14', 'shelf', 0.55, 5.775, 0, 1, 0.35, 2.4, 'walnut'),
  F('a15', 'shelf', 1.55, 5.775, 0, 1, 0.35, 2.4, 'walnut'),
  F('a16', 'loungeChair', 2.65, 5.25, 340, 0.78, 0.8, 0.8, 'sand'),
  F('a17', 'lampRoundFloor', 3.45, 5.7, 0, 0.35, 0.35, 1.6, 'linen'),
  Z(1.45, F('a18', 'picture', 2.6, 5.935, 0, 0.6, 0.03, 0.8, 'oak')),
  // writing desk in the bay: a walnut desk facing the middle window, a walnut chair, books, a desk lamp; plants on both sides of the bay
  // (a fiddle-leaf fig, a monstera, two snake plants), olive velvet curtains on the three windows, the radiator under the middle one
  F('a19', 'desk', 2.7, -0.45, 180, 1.2, 0.6, 0.75, 'walnut'),
  F('a20', 'chairCushion', 2.7, 0.1, 0, 0.45, 0.52, 0.9, 'walnut'),
  Z(0.75, FV('books', 'a21', 'decor', 3.1, -0.5, 0, 0.28, 0.2, 0.16, 'terracotta')),
  FV('ficus', 'a22', 'pottedPlant', 1.1, 0.45, 0, 0.6, 0.6, 1.8, 'terracotta'),
  FV('monstera', 'a23', 'pottedPlant', 4.3, 0.5, 0, 0.7, 0.7, 1.05, 'terracotta'),
  FV('snake', 'a24', 'pottedPlant', 1.8, -0.2, 0, 0.3, 0.3, 0.8, 'white'),
  FV('snake', 'a25', 'pottedPlant', 3.6, -0.2, 0, 0.3, 0.3, 0.75, 'white'),
  FV('sections', 'a26', 'radiator', 2.7, -0.8, 180, 1, 0.1, 0.5, 'white'),
  FV('open', 'a27', 'curtains', 2.7, -0.78, 180, 1.5, 0.14, 2.55, 'olive'),
  FV('open', 'a28', 'curtains', 1.7549, -0.3917, 119.05, 0.9, 0.14, 2.55, 'olive'),
  FV('open', 'a29', 'curtains', 3.6451, -0.3917, 240.95, 0.9, 0.14, 2.55, 'olive'),
  // piano corner by the door: an upright piano on the east wall with a stool, candles and a vase on it, a picture with a picture light above
  F('a30', 'piano', 5.05, 4.3, 270, 1.5, 0.6, 1.25, 'black'),
  FV('square', 'a31', 'stool', 4.5, 4.3, 0, 0.4, 0.4, 0.5, 'graphite'),
  Z(1.25, FV('candles', 'a32', 'decor', 5.1, 4.75, 270, 0.3, 0.14, 0.22, 'oak')),
  Z(1.25, FV('vase', 'a33', 'decor', 5.1, 3.85, 0, 0.18, 0.18, 0.5, 'white')),
  Z(1.55, F('a34', 'picture', 5.335, 4.3, 270, 0.8, 0.03, 0.6, 'oak')),
  // bedroom: a walnut bed with its headboard against the navy panelled west wall, walnut nightstands with lamps, a gilt-framed picture above
  // the bed, a linen rug, a walnut bench at the foot; a walnut armoire on the east wall; a walnut dresser with an arched mirror, a lamp,
  // books and a vase on the north wall; a dressing table between the windows, a navy velvet reading chair with a floor lamp in the corner,
  // linen curtains, the radiators under the windows, a snake plant
  F('b1', 'bed', 6.6, 3.6, 90, 1.8, 2.1, 1.2, 'walnut'),
  F('b2', 'nightstand', 5.75, 2.4, 90, 0.5, 0.4, 0.55, 'walnut'),
  F('b3', 'nightstand', 5.75, 4.8, 90, 0.5, 0.4, 0.55, 'walnut'),
  Z(1.4, F('b4', 'picture', 5.565, 3.6, 90, 1.2, 0.03, 0.8, 'oak')),
  F('b5', 'rug', 6.95, 3.6, 90, 2.8, 2.4, 0.012, 'linen'),
  F('b6', 'bench', 7.85, 3.6, 90, 1.4, 0.36, 0.45, 'walnut'),
  FV('hinged', 'b7', 'wardrobe', 9.05, 3.6, 270, 2.4, 0.58, 2.4, 'walnut'),
  F('b8', 'dresser', 7.75, 5.7, 0, 1.3, 0.5, 0.9, 'walnut'),
  Z(1.15, FV('arch', 'b9', 'wallMirror', 7.75, 5.935, 0, 0.8, 0.03, 1, 'oak')),
  Z(0.9, FV('books', 'b10', 'decor', 7.8, 5.72, 0, 0.3, 0.22, 0.18, 'sand')),
  Z(0.9, FV('vase', 'b11', 'decor', 8.2, 5.72, 0, 0.18, 0.18, 0.5, 'white')),
  F('b12', 'dressingTable', 7.45, 0.25, 180, 0.8, 0.4, 1.4, 'walnut'),
  FV('round', 'b13', 'stool', 7.45, 0.6, 0, 0.34, 0.34, 0.45, 'walnut'),
  F('b14', 'loungeChair', 8.75, 0.8, 225, 0.78, 0.8, 0.8, 'navy'),
  F('b15', 'lampRoundFloor', 9.15, 1.65, 0, 0.35, 0.35, 1.6, 'linen'),
  FV('open', 'b16', 'curtains', 6.5, 0.12, 180, 1.6, 0.14, 2.55, 'linen'),
  FV('open', 'b17', 'curtains', 8.4, 0.12, 180, 1.6, 0.14, 2.55, 'linen'),
  FV('sections', 'b18', 'radiator', 6.5, 0.1, 180, 0.8, 0.1, 0.5, 'white'),
  FV('sections', 'b19', 'radiator', 8.4, 0.1, 180, 0.8, 0.1, 0.5, 'white'),
  FV('snake', 'b20', 'pottedPlant', 5.78, 5.6, 0, 0.35, 0.35, 0.85, 'terracotta'),
  // dining room, panelled in dark olive: a walnut table for six with walnut chairs on a navy rug, a pendant above it; a walnut sideboard
  // on the west wall with two lamps, candles and a large gilt-framed painting with a picture light, a glass-front display cabinet and a palm
  // beside it; a low bookcase with a picture and a vase on the north wall; a fiddle-leaf fig and the radiator at the corner window;
  // a reading nook in the bay by the hall: a walnut console with books and candles, an olive armchair and a floor lamp
  FV('long', 'c1', 'tableExt', 7.65, 8.95, 0, 1.9, 0.95, 0.76, 'walnut'),
  ...[7.05, 7.65, 8.25].flatMap((x, i) => [
    F('c' + (2 + i), 'chairCushion', x, 8.2, 180, 0.45, 0.52, 0.9, 'walnut'),
    F('c' + (5 + i), 'chairCushion', x, 9.7, 0, 0.45, 0.52, 0.9, 'walnut'),
  ]),
  F('c8', 'rug', 7.65, 8.95, 0, 3.2, 2.4, 0.012, 'navy'),
  Z(0.76, FV('vase', 'c9', 'decor', 7.65, 8.95, 0, 0.2, 0.2, 0.5, 'white')),
  F('c10', 'sideboard', 5.775, 9, 90, 1.5, 0.45, 0.85, 'walnut'),
  Z(1.3, F('c11', 'picture', 5.565, 9, 90, 1.1, 0.03, 0.8, 'oak')),
  Z(0.85, FV('candles', 'c12', 'decor', 5.8, 9, 90, 0.32, 0.14, 0.22, 'oak')),
  F('c13', 'displayCabinet', 5.75, 10.6, 90, 1, 0.4, 2, 'walnut'),
  FV('palm', 'c14', 'pottedPlant', 5.85, 7.95, 0, 0.5, 0.5, 1.5, 'terracotta'),
  F('c15', 'shelf', 7.1, 10.975, 0, 1.6, 0.35, 1, 'walnut'),
  Z(1.4, F('c16', 'picture', 7.1, 11.135, 0, 0.9, 0.03, 0.6, 'black')),
  Z(1, FV('vase', 'c17', 'decor', 6.55, 10.97, 0, 0.18, 0.18, 0.5, 'terracotta')),
  Z(1, FV('books', 'c18', 'decor', 7.6, 10.97, 0, 0.3, 0.22, 0.2, 'sand')),
  FV('ficus', 'c19', 'pottedPlant', 8.85, 9.72, 0, 0.5, 0.5, 1.6, 'terracotta'),
  FV('sections', 'c20', 'radiator', 8.729, 10.529, 315, 0.9, 0.1, 0.5, 'white'),
  F('c21', 'console', 8.3, 6.325, 180, 1.2, 0.35, 0.8, 'walnut'),
  Z(0.8, FV('books', 'c22', 'decor', 8.0, 6.33, 180, 0.3, 0.22, 0.2, 'terracotta')),
  Z(0.8, FV('candles', 'c25', 'decor', 8.6, 6.33, 180, 0.32, 0.14, 0.22, 'oak')),
  F('c23', 'loungeChair', 8.95, 7.65, 270, 0.8, 0.8, 0.8, 'olive'),
  F('c24', 'lampRoundFloor', 9.15, 6.95, 0, 0.35, 0.35, 1.6, 'linen'),
  // kitchen: navy fronts along the west wall (a steel fridge, a base with the coffee machine, the steel gas stove under a steel hood, a base
  // under the gas boiler with a fruit bowl, the sink, a corner base), navy wall cabinets and open walnut shelves, a marble backsplash,
  // a terracotta runner; a round walnut table for three by the east wall with flowers, a pendant and a picture; a navy cart with the microwave,
  // the radiator and a linen blind at the window
  F('k1', 'fridge', 0.375, 7.95, 90, 0.6, 0.65, 1.85, 'steel'),
  F('k2', 'kitchenBase', 0.35, 8.55, 90, 0.6, 0.6, 0.9, 'navy'),
  FV('gas', 'k3', 'stove', 0.35, 9.15, 90, 0.6, 0.6, 0.9, 'steel'),
  F('k4', 'kitchenBase', 0.35, 9.75, 90, 0.6, 0.6, 0.9, 'navy'),
  FV('one', 'k5', 'kitchenSink', 0.35, 10.35, 90, 0.6, 0.6, 0.9, 'navy'),
  F('k6', 'kitchenBase', 0.35, 10.9, 90, 0.5, 0.6, 0.9, 'navy'),
  FV('dome', 'k7', 'hood', 0.3, 9.15, 90, 0.6, 0.5, 0.9, 'steel'),
  FV('wall', 'k8', 'gasBoiler', 0.225, 9.75, 90, 0.45, 0.35, 0.75, 'white'),
  F('k9', 'kitchenWall', 0.225, 10.6, 90, 1.1, 0.35, 0.7, 'navy'),
  Z(1.5, F('k10', 'wallShelf', 0.175, 8.55, 90, 0.6, 0.25, 0.04, 'walnut')),
  Z(1.9, F('k11', 'wallShelf', 0.175, 8.55, 90, 0.6, 0.25, 0.04, 'walnut')),
  F('k12', 'coffee', 0.27, 8.45, 90, 0.28, 0.38, 0.38, 'black'),
  Z(0.9, FV('bowl', 'k13', 'decor', 0.36, 9.75, 0, 0.3, 0.3, 0.14, 'white')),
  Z(1.54, FV('vase', 'k14', 'decor', 0.17, 8.7, 0, 0.15, 0.15, 0.32, 'white')),
  Z(1.94, FV('books', 'k15', 'decor', 0.17, 8.55, 90, 0.28, 0.2, 0.16, 'terracotta')),
  Z(0.9, FV('flowers', 'k16', 'pottedPlant', 0.32, 10.95, 0, 0.25, 0.25, 0.35, 'terracotta')),
  F('k17', 'rug', 0.95, 9.4, 90, 2, 0.6, 0.012, 'terracotta'),
  F('k18', 'tableRound', 2.75, 9.95, 0, 0.9, 0.9, 0.75, 'walnut'),
  F('k19', 'chairCushion', 1.98, 9.95, 90, 0.45, 0.52, 0.88, 'walnut'),
  F('k20', 'chairCushion', 2.75, 10.72, 0, 0.45, 0.52, 0.88, 'walnut'),
  F('k21', 'chairCushion', 2.75, 9.18, 180, 0.45, 0.52, 0.88, 'walnut'),
  Z(0.75, FV('flowers', 'k22', 'pottedPlant', 2.8, 10, 0, 0.26, 0.26, 0.34, 'white')),
  Z(1.3, F('k23', 'picture', 3.335, 9.95, 270, 0.6, 0.03, 0.8, 'oak')),
  F('k24', 'kitchenCart', 1.25, 7.85, 180, 0.55, 0.4, 0.8, 'navy'),
  Z(0.8, F('k25', 'microwave', 1.25, 7.84, 180, 0.5, 0.38, 0.3, 'white')),
  FV('sections', 'k26', 'radiator', 1.7, 11.1, 0, 0.8, 0.1, 0.5, 'white'),
  Z(2, FV('roller', 'k27', 'blind', 1.7, 11.12, 0, 1.18, 0.06, 0.36, 'linen')),
  // bathroom, marble: a freestanding tub under the window with a bath mat, a walnut vanity with an arched mirror on the west wall,
  // the toilet and the washing machine with a walnut shelf above it on the east wall, a black towel warmer, a laundry basket, a snake plant
  FV('oval', 'm1', 'bathFree', 4.45, 10.7, 0, 1.7, 0.8, 0.6, 'white'),
  F('m2', 'rug', 4.45, 9.95, 0, 0.8, 0.5, 0.012, 'linen'),
  FV('floor', 'm3', 'vanity', 3.8, 9.35, 90, 1, 0.5, 0.85, 'walnut'),
  Z(1.15, FV('arch', 'm4', 'wallMirror', 3.565, 9.35, 90, 0.7, 0.03, 1, 'oak')),
  FV('floor', 'm5', 'toilet', 5.025, 9.3, 270, 0.38, 0.65, 0.8, 'white'),
  F('m6', 'washer', 5.075, 8.1, 270, 0.6, 0.55, 0.85, 'white'),
  Z(1.2, F('m7', 'wallShelf', 5.24, 8.1, 270, 0.6, 0.22, 0.03, 'walnut')),
  Z(1.23, FV('candles', 'm8', 'decor', 5.24, 8.2, 270, 0.24, 0.12, 0.15, 'black')),
  FV('ladder', 'm9', 'towelRail', 3.6, 8.45, 90, 0.5, 0.1, 0.8, 'black'),
  F('m10', 'laundryBasket', 5.15, 9.95, 270, 0.4, 0.35, 0.55, 'linen'),
  FV('snake', 'm11', 'pottedPlant', 3.75, 10.1, 0, 0.3, 0.3, 0.75, 'white'),
  // hallway: a terracotta runner, a walnut bench under a coat rack, a walnut shoe cabinet with a mirror, a vase and a key bowl,
  // a walnut console with a lamp, a vase and a picture on the north wall, a small picture, a snake plant, the fuse box by the door
  F('h1', 'rug', 3.85, 6.8, 0, 5, 0.8, 0.012, 'terracotta'),
  F('h2', 'bench', 1.75, 6.34, 180, 1, 0.38, 0.45, 'walnut'),
  Z(1.6, FV('shelf', 'h3', 'coatHooks', 1.75, 6.275, 180, 1, 0.25, 0.35, 'walnut')),
  F('h4', 'shoeCabinet', 3.05, 6.3, 180, 0.8, 0.3, 1, 'walnut'),
  Z(1.15, F('h5', 'wallMirror', 3.05, 6.165, 180, 0.6, 0.03, 0.8, 'oak')),
  Z(1, FV('vase', 'h6', 'decor', 3.3, 6.3, 0, 0.15, 0.15, 0.4, 'white')),
  Z(1, FV('bowl', 'h7', 'decor', 2.8, 6.3, 0, 0.2, 0.2, 0.08, 'graphite')),
  F('h8', 'console', 5.6, 7.29, 0, 1.1, 0.32, 0.8, 'walnut'),
  Z(1.25, F('h9', 'picture', 5.6, 7.435, 0, 0.9, 0.03, 0.7, 'oak')),
  Z(0.8, FV('vase', 'h10', 'decor', 5.95, 7.29, 0, 0.18, 0.18, 0.5, 'terracotta')),
  Z(1.3, F('h11', 'picture', 1.45, 7.435, 0, 0.5, 0.03, 0.7, 'black')),
  FV('snake', 'h12', 'pottedPlant', 2.15, 7.25, 0, 0.35, 0.35, 0.85, 'terracotta'),
  F('h13', 'elPanel', 0.6, 7.39, 0, 0.4, 0.12, 0.5, 'grey'),
];

worktop(FURNITURE, 'white'); // the kitchen's worktop: white quartz

const LIGHTS = [
  {id: 'hall_pendants', name: 'Hall pendants', room: 'hall', kind: 'ceiling'},
  {id: 'hall_console', name: 'Console table lamp', room: 'hall', kind: 'accent', color: '#ffd9a0'},
  {id: 'living_main', name: 'Chandelier', room: 'living', kind: 'ceiling'},
  {id: 'living_sconces', name: 'Wall sconces', room: 'living', kind: 'accent', color: '#ffd9a0'},
  {id: 'living_floor', name: 'Floor lamp', room: 'living', kind: 'accent'},
  {id: 'living_reading', name: 'Reading floor lamp', room: 'living', kind: 'accent'},
  {id: 'living_table', name: 'Sofa table lamp', room: 'living', kind: 'accent', color: '#ffd9a0'},
  {id: 'living_desk', name: 'Desk lamp', room: 'living', kind: 'accent'},
  {id: 'living_piano', name: 'Piano picture light', room: 'living', kind: 'accent'},
  {id: 'bedroom_main', name: 'Bedroom ceiling light', room: 'bedroom', kind: 'ceiling'},
  {id: 'bedroom_left', name: 'Left bedside lamp', room: 'bedroom', kind: 'accent', color: '#ffd34d'},
  {id: 'bedroom_right', name: 'Right bedside lamp', room: 'bedroom', kind: 'accent', color: '#ffd34d'},
  {id: 'bedroom_reading', name: 'Reading floor lamp', room: 'bedroom', kind: 'accent'},
  {id: 'bedroom_dresser', name: 'Dresser table lamp', room: 'bedroom', kind: 'accent', color: '#ffd9a0'},
  {id: 'dining_pendant', name: 'Pendant over the table', room: 'dining', kind: 'ceiling', color: '#ffc773'},
  {id: 'dining_sideboard', name: 'Sideboard table lamps', room: 'dining', kind: 'accent', color: '#ffd9a0'},
  {id: 'dining_picture', name: 'Picture light', room: 'dining', kind: 'accent'},
  {id: 'dining_reading', name: 'Dining floor lamp', room: 'dining', kind: 'accent'},
  {id: 'kitchen_main', name: 'Kitchen ceiling light', room: 'kitchen', kind: 'ceiling'},
  {id: 'kitchen_pendant', name: 'Kitchen pendant', room: 'kitchen', kind: 'ceiling', color: '#ffc773'},
  {id: 'kitchen_worktop_led', name: 'Worktop strip', room: 'kitchen', kind: 'strip'},
  {id: 'bathroom_main', name: 'Bathroom ceiling light', room: 'bathroom', kind: 'ceiling'},
  {id: 'bathroom_mirror', name: 'Mirror light', room: 'bathroom', kind: 'accent'},
];
// every lamp placed: floor and table lamps on their furniture (a table lamp's point is its bulb, 42 cm above the top it stands on),
// sconces and picture lights 13 cm off the wall line, pendants over the tables, the worktop strip under the wall cabinet and the shelves
const PLACED = [
  {
    id: 'hall_pendants',
    placed: true,
    room: 'hall',
    form: 'pendant',
    h: 2.05,
    points: [
      [1.9, 6.8],
      [3.6, 6.8],
      [5.3, 6.8],
    ],
  },
  {
    id: 'hall_console',
    placed: true,
    room: 'hall',
    form: 'lamp',
    opt: 'table',
    h: 1.22,
    points: [[5.25, 7.3]],
  },
  {id: 'living_main', placed: true, room: 'living', points: [[2.1, 3.3]]},
  {
    id: 'living_sconces',
    placed: true,
    room: 'living',
    form: 'wall',
    h: 1.8,
    points: [
      [0.13, 1.85],
      [0.13, 4.75],
    ],
  },
  {
    id: 'living_floor',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[0.3, 1.7]],
  },
  {
    id: 'living_reading',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[3.45, 5.7]],
  },
  {
    id: 'living_table',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'table',
    h: 0.97,
    points: [[0.32, 4.94]],
  },
  {
    id: 'living_desk',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'table',
    h: 1.17,
    points: [[2.25, -0.55]],
  },
  {id: 'living_piano', placed: true, room: 'living', form: 'wall', h: 2.2, points: [[5.27, 4.3]]},
  {id: 'bedroom_main', placed: true, room: 'bedroom', points: [[7.45, 3]]},
  {
    id: 'bedroom_left',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'table',
    h: 0.97,
    points: [[5.72, 4.82]],
  },
  {
    id: 'bedroom_right',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'table',
    h: 0.97,
    points: [[5.72, 2.38]],
  },
  {
    id: 'bedroom_reading',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[9.15, 1.65]],
  },
  {
    id: 'bedroom_dresser',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'table',
    h: 1.32,
    points: [[7.3, 5.75]],
  },
  {
    id: 'dining_pendant',
    placed: true,
    room: 'dining',
    form: 'pendant',
    h: 1.75,
    points: [
      [7.25, 8.95],
      [8.05, 8.95],
    ],
  },
  {
    id: 'dining_sideboard',
    placed: true,
    room: 'dining',
    form: 'lamp',
    opt: 'table',
    h: 1.27,
    points: [
      [5.78, 8.5],
      [5.78, 9.5],
    ],
  },
  {id: 'dining_picture', placed: true, room: 'dining', form: 'wall', h: 2.2, points: [[5.63, 9]]},
  {
    id: 'dining_reading',
    placed: true,
    room: 'dining',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[9.15, 6.95]],
  },
  {id: 'kitchen_main', placed: true, room: 'kitchen', points: [[1.6, 9]]},
  {id: 'kitchen_pendant', placed: true, room: 'kitchen', form: 'pendant', h: 1.6, points: [[2.75, 9.95]]},
  {
    id: 'kitchen_worktop_led',
    placed: true,
    room: 'kitchen',
    form: 'strip',
    h: 1.44,
    segments: [
      [
        [0.08, 8.3],
        [0.08, 8.8],
      ],
      [
        [0.08, 10.1],
        [0.08, 11.1],
      ],
    ],
  },
  {id: 'bathroom_main', placed: true, room: 'bathroom', points: [[4.45, 9.4]]},
  {id: 'bathroom_mirror', placed: true, room: 'bathroom', form: 'wall', h: 2.25, points: [[3.63, 9.35]]},
];

export default async function () {
  const HA = {areas: Object.fromEntries(ROOMS.map(r => [r.id, r.short])), lights: LIGHTS.map(haLight)};
  // Sensors: climate in every room (CO2 in the bedroom and the gas kitchen), a carbon monoxide detector in the kitchen; the boiler's flow
  // temperature and water pressure and the outdoor sensor are not room air; a gas meter and the electricity meter
  const S = sensorKit(),
    add = S.add;
  add('living', 'living_th', 'Living room sensor Temperature', 'temperature', '°C', 21.4);
  add('living', 'living_th', 'Living room sensor Humidity', 'humidity', '%', 48);
  add('bedroom', 'bedroom_air', 'Bedroom air Temperature', 'temperature', '°C', 19.8);
  add('bedroom', 'bedroom_air', 'Bedroom air Humidity', 'humidity', '%', 50);
  add('bedroom', 'bedroom_air', 'Bedroom air CO2', 'carbon_dioxide', 'ppm', 1240);
  add('bedroom', 'bedroom_air', 'Bedroom air Battery', 'battery', '%', 71, {cat: 'diagnostic'});
  add('dining', 'dining_th', 'Dining room sensor Temperature', 'temperature', '°C', 20.6);
  add('dining', 'dining_th', 'Dining room sensor Humidity', 'humidity', '%', 47);
  add('kitchen', 'kitchen_air', 'Kitchen air Temperature', 'temperature', '°C', 22.9);
  add('kitchen', 'kitchen_air', 'Kitchen air Humidity', 'humidity', '%', 55);
  add('kitchen', 'kitchen_air', 'Kitchen air CO2', 'carbon_dioxide', 'ppm', 1450);
  add('kitchen', 'co_alarm', 'CO detector Carbon monoxide', 'carbon_monoxide', 'ppm', 2);
  add('kitchen', 'gas_boiler', 'Gas boiler Flow temperature', 'temperature', '°C', 58);
  add('kitchen', 'gas_boiler', 'Gas boiler Water pressure', 'pressure', 'bar', 1.6);
  add('bathroom', 'bath_th', 'Bathroom sensor Temperature', 'temperature', '°C', 23.8);
  add('bathroom', 'bath_th', 'Bathroom sensor Humidity', 'humidity', '%', 69);
  add(null, 'outdoor', 'Outdoor sensor Temperature', 'temperature', '°C', 7.4);
  add(null, 'gas_meter', 'Gas meter Gas', 'gas', 'm³', 8213.4);
  add(null, 'home_meter', 'Main meter Energy', 'energy', 'kWh', 31877.9, {daily: 6.1, shape: 'home'});
  add('bathroom', 'washer', 'Washing machine Energy', 'energy', 'kWh', 590.3, {daily: 0.5, shape: 'day'});
  Object.assign(HA, {sensors: S.sensors, states: S.states});
  // Devices: no air conditioners; radiator thermostats in every room and the gas boiler (heating only); bay curtains, bedroom and kitchen
  // roller blinds; the front door and the kitchen and bathroom windows; leak sensors and the water valve; a robot vacuum
  const K = deviceKit();
  K.thermostat('gas_boiler', 'Gas boiler', 'kitchen', 60, 58);
  K.thermostat('living_trv', 'Living room radiator', 'living', 21.5, 21.4);
  K.thermostat('bedroom_trv', 'Bedroom radiator', 'bedroom', 19, 19.8);
  K.thermostat('dining_trv', 'Dining room radiator', 'dining', 20.5, 20.6);
  K.thermostat('kitchen_trv', 'Kitchen radiator', 'kitchen', 20, 22.9);
  K.thermostat('bathroom_trv', 'Bathroom radiator', 'bathroom', 23, 23.8);
  K.cover('bay_curtains', 'Bay curtains', 'living', 'curtain', 100);
  K.cover('bedroom_blind_left', 'Bedroom blind left', 'bedroom', 'blind', 30);
  K.cover('bedroom_blind_right', 'Bedroom blind right', 'bedroom', 'blind', 30);
  K.cover('kitchen_blind', 'Kitchen roller blind', 'kitchen', 'blind', 100);
  K.contact('front_door', 'Front door', 'hall', 'door', false);
  K.contact('kitchen_window', 'Kitchen window', 'kitchen', 'window', true);
  K.contact('bathroom_window', 'Bathroom window', 'bathroom', 'window', false);
  K.leak('leak_bathroom', 'Bathroom leak', 'bathroom', 66);
  K.leak('leak_kitchen', 'Leak under the sink', 'kitchen', 84);
  K.valve('water_main', 'Water shut-off valve', 'bathroom');
  K.vacuum('robot', 'Robot vacuum', 'hall');
  K.favorites([
    ['scene.reading', 'Reading', 'living', '2026-11-07T21:10:00Z'],
    ['scene.dinner', 'Dinner', 'dining', '2026-11-07T19:00:00Z'],
    ['script.heating_away', 'Heating: away', null, 'off'],
    ['switch.towel_rail', 'Towel rail', 'bathroom', 'on'],
  ]);
  Object.assign(HA, {devices: K.devices, entities: K.entities, extra: K.extra});
  HA.stats = stats(['sensor.home_meter_energy'], ['washer'], {
    'climate.gas_boiler': {hours: 0.6, drops: 2},
    'binary_sensor.kitchen_window': {hours: 0.2, drops: 1},
  });
  HA.weather = WEATHER;
  const DEMO = {
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
    // the home view: from the east-south-east, turned 20° from the default, so the gallery wall and the kitchen face the camera
    view: {t: [4.607, 1.08, -5.299], theta: 0.9085, phi: 1.0123, fit: [7.536, 5.417]},
  };
  return {HA, DEMO, DEMO_UNDERLAY: null, STYLE};
}
