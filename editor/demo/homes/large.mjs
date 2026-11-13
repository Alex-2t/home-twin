// Typical home 6 (docs/research/typical-homes.md, D-030): a large apartment in a new building, about 111 m² — kitchen-living room
// (one room, two HA areas: a kitchen zone with an island and the living room), bedroom with a walk-in closet and its own bathroom
// (double sink), two kids' rooms, guest bathroom, laundry room with a washer and dryer stack, hallway, balcony.
// Design concept: dark contemporary for a family. Smoked oak floors (herringbone in the great room and the hall), warm grey plaster,
// charcoal plaster accents (the long dining wall of the great room, the headboard wall), light marble in the kitchen and the main bathroom,
// graphite kitchen fronts, walnut furniture, cognac leather (terracotta) armchairs, black fixtures and frames, warm sand textiles.
// The great room is the showpiece: a graphite kitchen on a marble wall with a walnut island and three pendants, a walnut table for eight
// on a banquette under a row of pendants against the charcoal wall, a lounge with a sand sofa, two cognac armchairs and a big rug facing
// the walnut-slatted media wall.
// The kids' rooms differ: a warm one in oak, white and terracotta for the younger child, a navy and walnut one for the teenager.
// Made up: nobody's apartment. Metres, x east, y north, 10 cm interior walls; the editor adds the exterior walls.
import {door, win, F, haLight, sensorKit, deviceKit, stats, WEATHER, worktop} from '../kit.mjs';

const FV = (v, ...a) => ({...F(...a), v}); // an item in a catalog variant
const Z = (z, f) => ({...f, z}); // an item at its own height above the floor (on furniture, on a shelf, on the wall)

// the kitchen-living room is one room; its west part, up to x = 3.4, is the kitchen area (room.zone: left of a→b)
const ROOMS = [
  {
    id: 'living',
    short: 'Kitchen-living room',
    polygon: [
      [0, 0],
      [7.6, 0],
      [7.6, 4.8],
      [0, 4.8],
    ],
    zone: {a: [3.4, 0], b: [3.4, 4.8], area: 'kitchen', left: true},
  },
  {
    id: 'bedroom',
    short: 'Bedroom',
    polygon: [
      [7.7, 0],
      [11.6, 0],
      [11.6, 4.8],
      [7.7, 4.8],
    ],
  },
  {
    id: 'closet',
    short: 'Walk-in closet',
    polygon: [
      [8.7, 4.9],
      [11.6, 4.9],
      [11.6, 6.8],
      [8.7, 6.8],
    ],
  },
  {
    id: 'master_bath',
    short: 'Main bathroom',
    polygon: [
      [8.7, 6.9],
      [11.6, 6.9],
      [11.6, 9.9],
      [8.7, 9.9],
    ],
  },
  {
    id: 'kids1',
    short: "Kids' room",
    polygon: [
      [0, 6.6],
      [3.8, 6.6],
      [3.8, 9.9],
      [0, 9.9],
    ],
  },
  {
    id: 'kids2',
    short: "Second kids' room",
    polygon: [
      [5.6, 6.2],
      [8.6, 6.2],
      [8.6, 9.9],
      [5.6, 9.9],
    ],
  },
  {
    id: 'guest_bath',
    short: 'Guest bathroom',
    polygon: [
      [2, 4.9],
      [3.8, 4.9],
      [3.8, 6.5],
      [2, 6.5],
    ],
  },
  {
    id: 'laundry',
    short: 'Laundry room',
    polygon: [
      [0, 4.9],
      [1.9, 4.9],
      [1.9, 6.5],
      [0, 6.5],
    ],
  },
  {
    id: 'hall',
    short: 'Hallway',
    polygon: [
      [3.9, 4.9],
      [8.6, 4.9],
      [8.6, 6.1],
      [5.5, 6.1],
      [5.5, 9.9],
      [3.9, 9.9],
    ],
  },
  {
    id: 'balcony',
    short: 'Balcony',
    polygon: [
      [4, -1.4],
      [7.4, -1.4],
      [7.4, -0.25],
      [4, -0.25],
    ],
  },
];
const HA_AREAS = {
  ...Object.fromEntries(ROOMS.map(r => [r.id, r.short])),
  living: 'Living room',
  kitchen: 'Kitchen',
};
// Finishes the rooms set themselves (dress() fills the rest from STYLE): the great room's north wall (edge 2, behind the banquette) in charcoal
// plaster; the style then puts marble behind the kitchen and walnut slats behind the TV. The younger child's bed wall (east) in clay plaster,
// the teenager's desk wall in navy; a microcement guest bathroom; decking on the balcony.
const FINISH = {
  living: {wf: [null, null, {k: 'plasterCharcoal'}, null]},
  kids1: {
    wall: 'plasterLime',
    wallTint: '#cdbfb2',
    floor: 'wood',
    wf: [null, {k: 'plasterClay', tint: '#b98f74'}, null, null],
  },
  kids2: {
    wall: 'plaster',
    wallTint: '#b9b7b1',
    floor: 'wood',
    wf: [null, null, {k: 'paintNavy', tint: '#3f4b5e'}, null],
  },
  guest_bath: {wall: 'microcement', floor: 'tileGraphite'},
  master_bath: {floor: 'tileGraphite'},
  closet: {wall: 'plaster', wallTint: '#aaa49b', floor: 'woodDark'},
  laundry: {wall: 'paintGrey', floor: 'tileGraphite'},
  balcony: {floor: 'woodGrey'},
};
const STYLE = {
  wall: {
    living: {k: 'plaster', tint: '#b4ada3'},
    bed: {k: 'plaster', tint: '#aaa49b'},
    kitchen: {k: 'plaster', tint: '#b4ada3'},
    hall: {k: 'plaster', tint: '#ada69c'},
    kids: '#c4bdb3',
    office: {k: 'plaster', tint: '#aea79e'},
  },
  bed: {k: 'plasterCharcoal'},
  media: {k: 'slatsWalnut'},
  sofa: {k: 'plasterCharcoal'},
  splash: {k: 'marble'},
  bath: 'marble',
  office: {k: 'slatsWalnut'},
  floor: {
    living: 'hbDark',
    bed: 'woodDark',
    kids: 'wood',
    hall: 'hbDark',
    office: 'woodDark',
    kitchen: 'hbDark',
    bath: 'tileGraphite',
  },
};

// The home view looks from the south-west: from the default south-east angle the balcony's wall hides the lounge; from here the media wall,
// the lounge, the dining wall and the island face the camera, and the bedroom shows past the media wall
const VIEW = {t: [5.707, 1.08, -4.399], theta: -0.576, phi: 0.8029, fit: [8.257, 5.546]};

const OPENINGS = [
  door([4.5, 9.9], [5.4, 9.9]), // front door
  door([6.2, 4.85], [7.4, 4.85]), // hallway ↔ kitchen-living room, glazed double door (no leaf drawn)
  door([7.75, 4.85], [8.55, 4.85]), // hallway ↔ bedroom
  {...door([9.9, 4.85], [10.7, 4.85]), leaf: false}, // bedroom ↔ walk-in closet, a doorway
  {...door([9.9, 6.85], [10.7, 6.85]), swing: 2}, // walk-in closet ↔ main bathroom, opens into the bathroom
  door([3.85, 7], [3.85, 7.8]), // hallway ↔ kids' room
  door([6, 6.15], [6.8, 6.15]), // hallway ↔ second kids' room
  door([3.85, 5.1], [3.85, 5.8]), // hallway ↔ guest bathroom
  {...door([1.05, 4.85], [1.75, 4.85]), swing: 2}, // kitchen ↔ laundry room, opens into the laundry
  door([6.6, -0.125], [7.3, -0.125], 2.2), // living room ↔ balcony in a 25 cm wall, opens into the room
  win([0.9, 0], [2.3, 0]), // kitchen
  win([4.5, -0.125], [6.3, -0.125]), // living room, onto the balcony
  win([8.6, 0], [10.4, 0]),
  win([11.6, 1.8], [11.6, 3]), // bedroom, south and east
  win([1.1, 9.9], [2.7, 9.9]), // kids' room
  win([6.4, 9.9], [7.8, 9.9]), // second kids' room
  win([9.2, 9.9], [10, 9.9], 1.2, 2.1), // main bathroom, above the bathtub
  win([4.1, -1.4], [7.3, -1.4], 0.9, 2.45),
  win([4, -1.3], [4, -0.35], 0.9, 2.45),
  win([7.4, -1.3], [7.4, -0.35], 0.9, 2.45), // balcony glazing
];

const FURNITURE = [
  // kitchen zone: a graphite run along the marble west wall (base, cooktop with an oven under a black dome hood, base with the coffee machine,
  // double sink, dishwasher, a steel French-door fridge), graphite wall cabinets over the sink, open walnut shelves by the hood; a walnut island
  // with three black stools, a fruit bowl and eucalyptus; a walnut glass cabinet on the charcoal wall; a roller blind and a graphite radiator
  // under the window
  F('k1', 'kitchenBase', 0.35, 0.5, 90, 0.9, 0.6, 0.9, 'graphite'),
  FV('oven', 'k2', 'kitchenHob', 0.35, 1.4, 90, 0.9, 0.6, 0.9, 'graphite'),
  F('k3', 'kitchenBase', 0.35, 2.075, 90, 0.45, 0.6, 0.9, 'graphite'),
  FV('two', 'k4', 'kitchenSink', 0.35, 2.75, 90, 0.9, 0.6, 0.9, 'graphite'),
  F('k5', 'dishwasher', 0.35, 3.5, 90, 0.6, 0.6, 0.9, 'graphite'),
  FV('french', 'k6', 'fridge', 0.41, 4.295, 90, 0.91, 0.72, 1.9, 'steel'),
  FV('dome', 'k7', 'hood', 0.3, 1.4, 90, 0.9, 0.5, 0.9, 'black'),
  F('k8', 'kitchenWall', 0.225, 2.95, 90, 1.3, 0.35, 0.7, 'graphite'),
  F('k9', 'coffee', 0.3, 2.075, 90, 0.25, 0.4, 0.38, 'black'),
  Z(1.5, F('k10', 'wallShelf', 0.19, 0.5, 90, 0.8, 0.28, 0.04, 'walnut')),
  Z(1.9, F('k11', 'wallShelf', 0.19, 0.5, 90, 0.8, 0.28, 0.04, 'walnut')),
  Z(1.54, FV('books', 'k12', 'decor', 0.19, 0.35, 90, 0.3, 0.22, 0.2, 'white')),
  Z(1.54, FV('vase', 'k13', 'decor', 0.19, 0.75, 90, 0.15, 0.15, 0.3, 'black')),
  Z(1.94, FV('bowl', 'k14', 'decor', 0.19, 0.5, 90, 0.28, 0.28, 0.12, 'sand')),
  F('k15', 'kitchenIsland', 2.125, 2.1, 90, 2.2, 0.95, 0.92, 'walnut'),
  F('k16', 'barStool', 2.88, 1.45, 270, 0.42, 0.42, 0.9, 'black'),
  F('k17', 'barStool', 2.88, 2.1, 270, 0.42, 0.42, 0.9, 'black'),
  F('k18', 'barStool', 2.88, 2.75, 270, 0.42, 0.42, 0.9, 'black'),
  Z(0.92, FV('bowl', 'k19', 'decor', 2.125, 1.4, 0, 0.32, 0.32, 0.14, 'white')),
  Z(0.92, FV('eucalyptus', 'k20', 'floorVase', 2.125, 2.85, 0, 0.3, 0.3, 0.55, 'black')),
  F('k21', 'displayCabinet', 2.6, 4.55, 0, 1.2, 0.4, 2, 'walnut'),
  FV('roller', 'k22', 'blind', 1.6, 0.08, 180, 1.5, 0.06, 1.5, 'sand'),
  FV('panel', 'k23', 'radiator', 1.6, 0.1, 180, 1, 0.1, 0.5, 'graphite'),
  // dining: a walnut table for eight against a walnut banquette on the charcoal wall, graphite chairs, a picture over the banquette,
  // hydrangeas and candles on the table, a fig tree by the hall door, the air conditioner over the hall door
  F('d1', 'diningTable', 4.55, 3.83, 0, 1.8, 0.9, 0.75, 'walnut'),
  F('d2', 'bench', 4.55, 4.525, 0, 1.76, 0.45, 0.45, 'walnut'),
  F('d3', 'chairCushion', 3.95, 3.26, 180, 0.45, 0.52, 0.84, 'graphite'),
  F('d4', 'chairCushion', 4.55, 3.26, 180, 0.45, 0.52, 0.84, 'graphite'),
  F('d5', 'chairCushion', 5.15, 3.26, 180, 0.45, 0.52, 0.84, 'graphite'),
  F('d6', 'chairCushion', 3.53, 3.83, 90, 0.45, 0.52, 0.84, 'graphite'),
  F('d7', 'chairCushion', 5.57, 3.83, 270, 0.45, 0.52, 0.84, 'graphite'),
  Z(1.2, FV('art', 'd8', 'picture', 4.55, 4.735, 0, 1.4, 0.03, 0.8, 'black')),
  Z(0.75, FV('flowers', 'd9', 'pottedPlant', 4.75, 3.83, 0, 0.32, 0.32, 0.38, 'white')),
  Z(0.75, FV('candles', 'd10', 'decor', 4.2, 3.83, 0, 0.32, 0.14, 0.22, 'black')),
  FV('ficus', 'd11', 'pottedPlant', 5.95, 4.45, 0, 0.5, 0.5, 1.8, 'graphite'),
  F('d12', 'aircon', 6.8, 4.64, 0, 0.8, 0.22, 0.29),
  // lounge: a sand sofa with its back to the island facing the TV on the east wall, a round walnut coffee table on a big linen rug,
  // two cognac leather armchairs facing each other across it, a reading floor lamp, a walnut TV bench with a soundbar, a vase and books,
  // a snake plant, sand curtains across the window and the balcony door, a graphite radiator
  F('l1', 'loungeSofa', 4.525, 1.35, 90, 2.1, 0.95, 0.8, 'sand'),
  FV('round', 'l2', 'tableCoffee', 5.85, 1.5, 0, 0.9, 0.9, 0.38, 'walnut'),
  F('l3', 'rug', 5.7, 1.45, 0, 2.6, 2.5, 0.012, 'linen'),
  F('l4', 'loungeChair', 5.85, 2.48, 0, 0.8, 0.82, 0.78, 'terracotta'),
  F('l5', 'loungeChair', 5.85, 0.6, 180, 0.8, 0.82, 0.78, 'terracotta'),
  F('l6', 'lampRoundFloor', 5.22, 0.38, 0, 0.4, 0.4, 1.6, 'linen'),
  F('l7', 'tvStand', 7.325, 1.45, 270, 1.6, 0.45, 0.5, 'walnut'),
  Z(1, F('l8', 'tv', 7.52, 1.45, 270, 1.65, 0.06, 0.95)),
  Z(0.5, F('l9', 'soundbar', 7.45, 1.45, 270, 0.9, 0.1, 0.07, 'black')),
  Z(0.5, FV('books', 'l10', 'decor', 7.33, 0.85, 270, 0.3, 0.22, 0.16, 'sand')),
  Z(0.5, FV('vase', 'l11', 'decor', 7.33, 2.05, 270, 0.18, 0.18, 0.5, 'black')),
  Z(0.38, FV('candles', 'l12', 'decor', 5.85, 1.5, 30, 0.32, 0.14, 0.22, 'graphite')),
  FV('snake', 'l13', 'pottedPlant', 7.3, 2.5, 0, 0.35, 0.35, 0.9, 'terracotta'),
  FV('open', 'l14', 'curtains', 5.9, 0.12, 180, 3.2, 0.14, 2.55, 'sand'),
  FV('panel', 'l15', 'radiator', 5, 0.1, 180, 0.8, 0.1, 0.5, 'graphite'),
  // bedroom: a walnut king-size bed against the charcoal west wall, walnut nightstands with table lamps and books, a picture over the bed,
  // a bench at its foot on a sand rug; a walnut dresser with a round black mirror, a vase and candles on the north wall; a cognac reading chair
  // with a floor lamp by the corner windows, sand curtains and a side blind, a monstera, the air conditioner, a graphite radiator
  F('b1', 'bed', 8.8, 2.2, 90, 1.8, 2.1, 1.1, 'walnut'),
  F('b2', 'nightstand', 7.95, 0.95, 90, 0.5, 0.4, 0.5, 'walnut'),
  F('b3', 'nightstand', 7.95, 3.45, 90, 0.5, 0.4, 0.5, 'walnut'),
  Z(1.3, FV('art', 'b4', 'picture', 7.765, 2.2, 90, 1.4, 0.03, 0.7, 'black')),
  Z(0.5, FV('books', 'b5', 'decor', 7.97, 1.1, 90, 0.26, 0.2, 0.12, 'sand')),
  Z(0.5, FV('books', 'b6', 'decor', 7.97, 3.3, 90, 0.26, 0.2, 0.12, 'graphite')),
  F('b7', 'bench', 10.15, 2.2, 90, 1.4, 0.42, 0.45, 'walnut'),
  F('b8', 'rug', 9.75, 2.2, 90, 2.8, 2.4, 0.012, 'sand'),
  F('b9', 'dresser', 9.2, 4.525, 0, 1.2, 0.45, 0.8, 'walnut'),
  Z(1.15, FV('round', 'b10', 'wallMirror', 9.2, 4.735, 0, 0.8, 0.03, 0.8, 'black')),
  Z(0.8, FV('vase', 'b11', 'decor', 9.6, 4.53, 0, 0.18, 0.18, 0.5, 'white')),
  Z(0.8, FV('candles', 'b12', 'decor', 8.85, 4.53, 0, 0.32, 0.14, 0.22, 'black')),
  F('b13', 'loungeChair', 10.95, 0.65, 225, 0.8, 0.82, 0.78, 'terracotta'),
  F('b14', 'lampRoundFloor', 11.35, 1.35, 0, 0.4, 0.4, 1.6, 'linen'),
  FV('open', 'b15', 'curtains', 9.5, 0.12, 180, 2.2, 0.14, 2.55, 'sand'),
  FV('roller', 'b16', 'blind', 11.52, 2.4, 270, 1.3, 0.06, 1.5, 'sand'),
  FV('monstera', 'b17', 'pottedPlant', 11.2, 4.35, 0, 0.7, 0.7, 1, 'graphite'),
  F('b18', 'aircon', 11.12, 4.64, 0, 0.8, 0.22, 0.29),
  FV('panel', 'b19', 'radiator', 9.5, 0.1, 180, 1.2, 0.1, 0.5, 'graphite'),
  // walk-in closet: open walnut wardrobes along both side walls, a full-length black mirror, a round sand rug
  F('c1', 'openWardrobe', 9.025, 5.85, 90, 1.8, 0.55, 2.4, 'walnut'),
  F('c2', 'openWardrobe', 11.275, 5.85, 270, 1.8, 0.55, 2.4, 'walnut'),
  F('c3', 'floorMirror', 9.6, 6.6, 0, 0.6, 0.3, 1.8, 'black'),
  FV('round', 'c4', 'rug', 10.15, 5.85, 0, 1.3, 1.3, 0.012, 'sand'),
  // main bathroom: a freestanding tub under the window, a black-framed walk-in shower, a double walnut vanity with two round black mirrors,
  // a black wall-hung toilet, a black towel warmer, a walnut tall cabinet, a laundry basket, a bath mat, a snake plant, a vase on the vanity
  FV('wall', 'm1', 'vanity', 9, 8.4, 90, 1.4, 0.5, 0.85, 'walnut'),
  Z(1.2, FV('round', 'm2', 'wallMirror', 8.765, 8.05, 90, 0.55, 0.03, 0.55, 'black')),
  Z(1.2, FV('round', 'm3', 'wallMirror', 8.765, 8.75, 90, 0.55, 0.03, 0.55, 'black')),
  FV('oval', 'm4', 'bathFree', 10.15, 9.4, 0, 1.7, 0.8, 0.6),
  F('m5', 'walkIn', 11.15, 7.6, 270, 1.3, 0.8, 2, 'black'),
  FV('wall', 'm6', 'toilet', 11.275, 8.7, 270, 0.38, 0.55, 0.8, 'black'),
  FV('ladder', 'm7', 'towelRail', 9.4, 7, 180, 0.5, 0.1, 0.8, 'black'),
  FV('floor', 'm8', 'bathTall', 8.9, 9.5, 90, 0.4, 0.3, 1.8, 'walnut'),
  F('m9', 'laundryBasket', 8.95, 7.18, 90, 0.4, 0.32, 0.55, 'sand'),
  F('m10', 'rug', 9.6, 8.4, 90, 0.9, 0.55, 0.012, 'sand'),
  FV('snake', 'm11', 'pottedPlant', 11.3, 9.6, 0, 0.35, 0.35, 0.85, 'black'),
  Z(0.85, FV('vase', 'm12', 'decor', 9.05, 7.85, 90, 0.14, 0.14, 0.4, 'white')),
  // kids' room (the younger child): a white bed along the clay-plastered east wall with a picture and a shelf above it (books and a plant
  // out of reach), a white nightstand with a night light, an oak desk under the window with a terracotta chair, a white wardrobe and toy
  // storage on the west wall, a play table with two stools on a round terracotta rug, wall bars, a sand roller blind, the air conditioner
  F('i1', 'bed', 3.3, 8.85, 0, 0.9, 2, 0.9, 'white'),
  Z(1.15, FV('poster', 'i2', 'picture', 3.735, 8.4, 270, 0.6, 0.03, 0.8, 'oak')),
  Z(1.5, F('i3', 'wallShelf', 3.65, 9.25, 270, 0.7, 0.2, 0.03, 'oak')),
  Z(1.53, FV('books', 'i4', 'decor', 3.65, 9.1, 270, 0.24, 0.18, 0.18, 'terracotta')),
  Z(1.53, FV('snake', 'i5', 'pottedPlant', 3.65, 9.45, 0, 0.25, 0.25, 0.35, 'white')),
  F('i6', 'nightstand', 2.62, 9.66, 0, 0.35, 0.35, 0.45, 'white'),
  F('i7', 'desk', 1.9, 9.43, 0, 1, 0.6, 0.75, 'oak'),
  F('i8', 'chairDesk', 1.9, 8.95, 180, 0.6, 0.6, 1, 'terracotta'),
  F('i9', 'toyStorage', 0.27, 9.3, 90, 0.99, 0.44, 0.56, 'white'),
  Z(0.56, FV('books', 'i10', 'decor', 0.27, 9.05, 90, 0.26, 0.2, 0.16, 'sand')),
  F('i16', 'wardrobe', 0.35, 7.6, 90, 1.6, 0.6, 2.2, 'white'),
  FV('round', 'i11', 'rug', 1.8, 8, 0, 1.6, 1.6, 0.012, 'terracotta'),
  F('i12', 'kidsTable', 1.8, 8, 0, 0.7, 0.5, 0.5, 'white'),
  FV('round', 'i13', 'stool', 1.3, 8, 0, 0.3, 0.3, 0.4, 'oak'),
  FV('round', 'i14', 'stool', 2.3, 8, 0, 0.3, 0.3, 0.4, 'oak'),
  FV('plain', 'i15', 'wallBars', 2, 6.725, 180, 0.9, 0.15, 2.3, 'oak'),
  FV('roller', 'i17', 'blind', 1.9, 9.82, 0, 1.7, 0.06, 1.5, 'sand'),
  FV('panel', 'i18', 'radiator', 1.9, 9.8, 0, 0.9, 0.1, 0.5, 'white'),
  F('i19', 'aircon', 3.25, 6.76, 180, 0.8, 0.22, 0.29),
  // second kids' room (the teenager): a graphite bed along the east wall with a walnut nightstand, a walnut desk under the navy wall with
  // a monitor, the PC and a navy chair, a walnut wardrobe and bookshelf on the west wall, a navy rug, a graphite pouf, posters,
  // a snake plant, a graphite roller blind and radiator, the air conditioner over the bookshelf
  F('e1', 'bed', 7.95, 7.3, 180, 1.2, 2, 0.95, 'graphite'),
  F('e2', 'nightstand', 7.1, 6.45, 180, 0.45, 0.4, 0.5, 'walnut'),
  Z(0.5, FV('books', 'e3', 'decor', 7.0, 6.45, 180, 0.24, 0.18, 0.14, 'graphite')),
  F('e4', 'desk', 7.1, 9.43, 0, 1.4, 0.6, 0.75, 'walnut'),
  FV('arm', 'e5', 'monitor', 7.1, 9.6, 0, 0.62, 0.2, 0.45),
  F('e6', 'pcTower', 7.65, 9.45, 0, 0.21, 0.45, 0.45, 'black'),
  F('e7', 'chairDesk', 7.1, 8.95, 180, 0.62, 0.62, 1.05, 'navy'),
  F('e8', 'wardrobe', 5.95, 8.45, 90, 2, 0.6, 2.2, 'walnut'),
  F('e9', 'shelf', 5.825, 6.8, 90, 0.8, 0.35, 1.8, 'walnut'),
  F('e10', 'rug', 6.75, 8.1, 90, 2, 1.4, 0.012, 'navy'),
  F('e11', 'ottoman', 6.55, 8.1, 0, 0.6, 0.6, 0.42, 'graphite'),
  Z(1.2, FV('poster', 'e12', 'picture', 6.05, 9.835, 0, 0.55, 0.03, 0.75, 'black')),
  Z(1.25, FV('poster', 'e13', 'picture', 8.535, 7.3, 270, 0.7, 0.03, 0.9, 'black')),
  FV('snake', 'e14', 'pottedPlant', 8.3, 9.6, 0, 0.35, 0.35, 0.85, 'graphite'),
  FV('roller', 'e15', 'blind', 7.1, 9.82, 0, 1.5, 0.06, 1.5, 'graphite'),
  FV('panel', 'e16', 'radiator', 7.1, 9.8, 0, 1, 0.1, 0.5, 'graphite'),
  F('e17', 'aircon', 5.76, 6.8, 90, 0.8, 0.22, 0.29),
  Z(0.75, FV('books', 'e18', 'decor', 6.55, 9.55, 0, 0.26, 0.2, 0.12, 'graphite')),
  // guest bathroom: a black-framed corner shower stall (mirrored: glass to the south and east), a black wall-hung toilet, a small walnut
  // vanity with a round black mirror and a vase, a black towel warmer, a bath mat
  {...FV('rect', 'g1', 'shower', 2.5, 6, 0, 0.9, 0.9, 2, 'black'), mx: true},
  FV('wall', 'g2', 'toilet', 2.4, 5.225, 180, 0.38, 0.55, 0.8, 'black'),
  FV('wall', 'g3', 'vanity', 3.35, 6.25, 0, 0.6, 0.4, 0.85, 'walnut'),
  Z(1.2, FV('round', 'g4', 'wallMirror', 3.35, 6.435, 0, 0.45, 0.03, 0.45, 'black')),
  Z(0.85, FV('vase', 'g5', 'decor', 3.55, 6.3, 0, 0.12, 0.12, 0.35, 'white')),
  FV('ladder', 'g6', 'towelRail', 3.7, 6.12, 270, 0.5, 0.1, 0.8, 'black'),
  F('g7', 'rug', 3.2, 5.55, 90, 0.7, 0.5, 0.012, 'sand'),
  // laundry room: a black washer with the dryer stacked on top, a graphite utility cabinet, a utility sink with a walnut shelf above it,
  // a folded drying rack and ironing board
  F('n1', 'washer', 0.35, 6.15, 0, 0.6, 0.6, 0.85, 'black'),
  Z(0.86, F('n2', 'dryer', 0.35, 6.15, 0, 0.6, 0.6, 0.85, 'black')),
  F('n3', 'utilityCabinet', 0.35, 5.3, 90, 0.6, 0.6, 2.2, 'graphite'),
  FV('wall', 'n4', 'basin', 1.35, 6.24, 0, 0.6, 0.42, 0.85),
  Z(1.5, F('n5', 'wallShelf', 1.35, 6.34, 0, 0.8, 0.22, 0.03, 'walnut')),
  Z(1.53, FV('books', 'n6', 'decor', 1.2, 6.34, 0, 0.3, 0.2, 0.16, 'white')),
  FV('folded', 'n7', 'dryingRack', 1.82, 5.8, 270, 0.56, 0.06, 1.1, 'white'),
  FV('folded', 'n8', 'ironingBoard', 1.81, 5.3, 270, 0.38, 0.08, 1.35, 'grey'),
  // hallway: a walnut sliding wardrobe along the east wall, a walnut console with a table lamp, a vase and a picture between the doors,
  // a tall black mirror, a walnut bench with a coat rack by the front door, sand runners, the electrical panel, the network cabinet and
  // the robot vacuum dock at the end of the corridor, pampas in a floor vase
  FV('sliding', 'h1', 'wardrobeRun', 5.15, 8.1, 270, 1.55, 0.6, 2.5, 'walnut'),
  F('h2', 'console', 4.125, 6.4, 90, 1, 0.35, 0.8, 'walnut'),
  Z(1.25, FV('art', 'h3', 'picture', 3.965, 6.4, 90, 0.8, 0.03, 0.6, 'black')),
  Z(0.8, FV('vase', 'h4', 'decor', 4.125, 6.7, 90, 0.18, 0.18, 0.5, 'white')),
  Z(0.4, FV('arch', 'h5', 'wallMirror', 3.965, 8.35, 90, 0.6, 0.03, 1.6, 'black')),
  F('h6', 'bench', 4.15, 9.35, 90, 0.9, 0.4, 0.45, 'walnut'),
  Z(1.55, FV('shelf', 'h7', 'coatHooks', 4.075, 9.35, 90, 0.9, 0.25, 0.35, 'walnut')),
  F('h8', 'rug', 4.6, 7.4, 90, 3, 0.6, 0.012, 'sand'),
  F('h9', 'rug', 7, 5.5, 0, 2.4, 0.6, 0.012, 'sand'),
  F('h10', 'elPanel', 8.25, 5.99, 0, 0.4, 0.12, 0.5, 'grey'),
  Z(1.5, FV('wall', 'h11', 'netRack', 7.6, 5.825, 0, 0.55, 0.45, 0.5, 'black')),
  F('h12', 'robotVacuum', 8.29, 5.35, 270, 0.38, 0.52, 0.12, 'black'),
  FV('pampas', 'h13', 'floorVase', 5.72, 5.85, 0, 0.3, 0.3, 1.1, 'black'),
  // balcony: a graphite bistro table with two chairs on a sand rug, candles, a fig tree and a snake plant in terracotta pots
  FV('round', 'p1', 'patioTable', 4.85, -0.82, 0, 0.6, 0.6, 0.74, 'graphite'),
  F('p2', 'patioChair', 4.33, -0.82, 90, 0.5, 0.52, 0.82, 'graphite'),
  F('p3', 'patioChair', 5.37, -0.82, 270, 0.5, 0.52, 0.82, 'graphite'),
  F('p4', 'rug', 4.85, -0.82, 0, 1.6, 0.8, 0.012, 'sand'),
  Z(0.74, FV('candles', 'p5', 'decor', 4.85, -0.82, 0, 0.26, 0.12, 0.18, 'black')),
  FV('ficus', 'p6', 'pottedPlant', 7.0, -0.95, 0, 0.6, 0.6, 1.7, 'terracotta'),
  FV('snake', 'p7', 'pottedPlant', 6.1, -1.15, 0, 0.35, 0.35, 0.85, 'terracotta'),
];

worktop(FURNITURE, 'white'); // the kitchen's worktop: white quartz

const LIGHTS = [
  {id: 'hall_spots', name: 'Hallway spots', room: 'hall', kind: 'ceiling'},
  {id: 'hall_console', name: 'Console table lamp', room: 'hall', kind: 'accent'},
  {id: 'living_track', name: 'Living room track', room: 'living', kind: 'ceiling'},
  {id: 'living_dining', name: 'Dining pendants', room: 'living', kind: 'ceiling', color: '#ffc773'},
  {id: 'living_picture', name: 'Picture light', room: 'living', kind: 'accent'},
  {id: 'living_floor', name: 'Reading floor lamp', room: 'living', kind: 'accent'},
  {id: 'living_tv', name: 'TV backlight', room: 'living', kind: 'strip', h: 1.4},
  {id: 'living_cove', name: 'Ceiling cove', room: 'living', kind: 'cove'},
  {id: 'kitchen_spots', name: 'Kitchen spots', room: 'kitchen', kind: 'ceiling'},
  {id: 'kitchen_island', name: 'Island pendants', room: 'kitchen', kind: 'ceiling', color: '#ffc773'},
  {id: 'kitchen_worktop_led', name: 'Worktop strip', room: 'kitchen', kind: 'strip'},
  {id: 'bedroom_main', name: 'Bedroom ceiling light', room: 'bedroom', kind: 'ceiling'},
  {id: 'bedroom_left', name: 'Left bedside lamp', room: 'bedroom', kind: 'accent', color: '#ffd9a0'},
  {id: 'bedroom_right', name: 'Right bedside lamp', room: 'bedroom', kind: 'accent', color: '#ffd9a0'},
  {id: 'bedroom_reading', name: 'Reading floor lamp', room: 'bedroom', kind: 'accent'},
  {id: 'closet_main', name: 'Closet light', room: 'closet', kind: 'ceiling'},
  {id: 'master_bath_spots', name: 'Bathroom spots', room: 'master_bath', kind: 'ceiling'},
  {id: 'master_bath_mirror', name: 'Mirror light', room: 'master_bath', kind: 'accent'},
  {id: 'kids1_main', name: 'Ceiling light', room: 'kids1', kind: 'ceiling'},
  {id: 'kids1_night', name: 'Night light', room: 'kids1', kind: 'accent', color: '#ffb46b'},
  {id: 'kids1_desk', name: 'Desk lamp', room: 'kids1', kind: 'accent'},
  {id: 'kids2_main', name: 'Ceiling light', room: 'kids2', kind: 'ceiling'},
  {id: 'kids2_desk', name: 'Desk lamp', room: 'kids2', kind: 'accent'},
  {id: 'kids2_bedside', name: 'Bedside lamp', room: 'kids2', kind: 'accent', color: '#ffd9a0'},
  {id: 'guest_bath_main', name: 'Guest bathroom spots', room: 'guest_bath', kind: 'ceiling'},
  {id: 'laundry_main', name: 'Ceiling light', room: 'laundry', kind: 'ceiling'},
  {id: 'balcony_main', name: 'Balcony wall light', room: 'balcony', kind: 'accent'},
];
// every lamp is placed: by day the floor, table, desk and bedside lamps and the strips (worktop, TV backlight, cove) are on,
// the ceiling lights, pendants, spots, the picture and mirror lights and the night light are off
const PLACED = [
  {
    id: 'hall_spots',
    placed: true,
    room: 'hall',
    form: 'spots',
    h: 2.58,
    points: [
      [4.7, 5.5],
      [6.4, 5.5],
      [8, 5.5],
      [4.45, 7.4],
      [4.7, 9.2],
    ],
  },
  {
    id: 'hall_console',
    placed: true,
    room: 'hall',
    form: 'lamp',
    opt: 'table',
    h: 1.2,
    points: [[4.125, 6.1]],
  },
  {
    id: 'living_track',
    placed: true,
    room: 'living',
    form: 'line',
    h: 2.58,
    segments: [
      [
        [5.85, 0.7],
        [5.85, 2.3],
      ],
    ],
  },
  {
    id: 'living_dining',
    placed: true,
    room: 'living',
    form: 'pendant',
    h: 1.7,
    points: [
      [3.95, 3.83],
      [4.55, 3.83],
      [5.15, 3.83],
    ],
  },
  {id: 'living_picture', placed: true, room: 'living', form: 'wall', h: 2.12, points: [[4.55, 4.73]]},
  {
    id: 'living_floor',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[5.22, 0.38]],
  },
  {
    id: 'living_tv',
    placed: true,
    room: 'living',
    segments: [
      [
        [7.52, 0.75],
        [7.52, 2.15],
      ],
    ],
  },
  {
    id: 'living_cove',
    placed: true,
    room: 'living',
    segments: [
      [
        [0.1, 4.72],
        [7.5, 4.72],
      ],
    ],
  }, // along the charcoal wall: the back wall in 3D
  {
    id: 'kitchen_spots',
    placed: true,
    room: 'living',
    form: 'spots',
    h: 2.58,
    points: [
      [1.05, 0.5],
      [1.05, 1.4],
      [1.05, 2.4],
      [1.05, 3.4],
      [1.05, 4.3],
    ],
  },
  {
    id: 'kitchen_island',
    placed: true,
    room: 'living',
    form: 'pendant',
    h: 1.8,
    points: [
      [2.125, 1.45],
      [2.125, 2.1],
      [2.125, 2.75],
    ],
  },
  {
    id: 'kitchen_worktop_led',
    placed: true,
    room: 'living',
    segments: [
      [
        [0.42, 2.35],
        [0.42, 3.55],
      ],
    ],
  }, // under the wall cabinets
  {id: 'bedroom_main', placed: true, room: 'bedroom', points: [[9.7, 2.2]]},
  {
    id: 'bedroom_left',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'table',
    h: 0.92,
    points: [[7.95, 3.6]],
  },
  {
    id: 'bedroom_right',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'table',
    h: 0.92,
    points: [[7.95, 0.8]],
  },
  {
    id: 'bedroom_reading',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[11.35, 1.35]],
  },
  {
    id: 'closet_main',
    placed: true,
    room: 'closet',
    form: 'line',
    h: 2.58,
    segments: [
      [
        [10.15, 5.2],
        [10.15, 6.5],
      ],
    ],
  },
  {
    id: 'master_bath_spots',
    placed: true,
    room: 'master_bath',
    form: 'spots',
    h: 2.58,
    points: [
      [9.7, 7.6],
      [11.15, 7.6],
      [9.7, 8.6],
      [10.15, 9.4],
    ],
  },
  {
    id: 'master_bath_mirror',
    placed: true,
    room: 'master_bath',
    form: 'wall',
    h: 1.88,
    points: [
      [8.77, 8.05],
      [8.77, 8.75],
    ],
  },
  {id: 'kids1_main', placed: true, room: 'kids1', points: [[1.9, 8.1]]},
  {
    id: 'kids1_night',
    placed: true,
    room: 'kids1',
    form: 'lamp',
    opt: 'table',
    h: 0.75,
    points: [[2.62, 9.66]],
  },
  {id: 'kids1_desk', placed: true, room: 'kids1', form: 'lamp', opt: 'table', h: 1.1, points: [[1.55, 9.6]]},
  {id: 'kids2_main', placed: true, room: 'kids2', points: [[7.1, 8]]},
  {id: 'kids2_desk', placed: true, room: 'kids2', form: 'lamp', opt: 'table', h: 1.1, points: [[6.6, 9.6]]},
  {
    id: 'kids2_bedside',
    placed: true,
    room: 'kids2',
    form: 'lamp',
    opt: 'table',
    h: 0.9,
    points: [[7.2, 6.45]],
  },
  {
    id: 'guest_bath_main',
    placed: true,
    room: 'guest_bath',
    form: 'spots',
    h: 2.58,
    points: [
      [2.5, 6],
      [3.2, 5.4],
    ],
  },
  {id: 'laundry_main', placed: true, room: 'laundry', points: [[0.95, 5.7]]},
  {id: 'balcony_main', placed: true, room: 'balcony', form: 'wall', h: 1.9, points: [[5.6, -0.28]]},
];

export default async function () {
  const HA = {areas: HA_AREAS, lights: LIGHTS.map(haLight)};
  // Sensors: climate in every living area (the kitchen zone too), CO2 in the living room, bedroom and second kids' room; bathroom and laundry
  // humidity; diagnostic ones (battery, the network cabinet's CPU); the fridge is not room air; energy meters
  const S = sensorKit(),
    add = S.add;
  add('living', 'living_air', 'Living room air Temperature', 'temperature', '°C', 22.3);
  add('living', 'living_air', 'Living room air Humidity', 'humidity', '%', 43);
  add('living', 'living_air', 'Living room air CO2', 'carbon_dioxide', 'ppm', 720);
  add('kitchen', 'kitchen_th', 'Kitchen sensor Temperature', 'temperature', '°C', 23.4);
  add('kitchen', 'kitchen_th', 'Kitchen sensor Humidity', 'humidity', '%', 47);
  add('kitchen', 'kitchen_fridge', 'Fridge Temperature', 'temperature', '°C', 4.1);
  add('bedroom', 'bedroom_air', 'Bedroom air Temperature', 'temperature', '°C', 21);
  add('bedroom', 'bedroom_air', 'Bedroom air Humidity', 'humidity', '%', 46);
  add('bedroom', 'bedroom_air', 'Bedroom air CO2', 'carbon_dioxide', 'ppm', 1060);
  add('kids1', 'kids1_th', "Kids' room sensor Temperature", 'temperature', '°C', 22);
  add('kids1', 'kids1_th', "Kids' room sensor Humidity", 'humidity', '%', 45);
  add('kids1', 'kids1_th', "Kids' room sensor Battery", 'battery', '%', 38, {cat: 'diagnostic'});
  add('kids2', 'kids2_air', "Second kids' room air Temperature", 'temperature', '°C', 21.8);
  add('kids2', 'kids2_air', "Second kids' room air Humidity", 'humidity', '%', 44);
  add('kids2', 'kids2_air', "Second kids' room air CO2", 'carbon_dioxide', 'ppm', 850);
  add('master_bath', 'mbath_th', 'Main bathroom sensor Temperature', 'temperature', '°C', 25.6);
  add('master_bath', 'mbath_th', 'Main bathroom sensor Humidity', 'humidity', '%', 64);
  add('laundry', 'laundry_th', 'Laundry sensor Temperature', 'temperature', '°C', 23);
  add('laundry', 'laundry_th', 'Laundry sensor Humidity', 'humidity', '%', 58);
  add('hall', 'nas', 'NAS CPU temperature', 'temperature', '°C', 51, {cat: 'diagnostic'});
  add(null, 'home_meter', 'Main meter Energy', 'energy', 'kWh', 9412.7, {daily: 12.6, shape: 'home'});
  add('laundry', 'washer', 'Washing machine Energy', 'energy', 'kWh', 702.2, {daily: 0.8, shape: 'day'});
  add('laundry', 'dryer', 'Dryer Energy', 'energy', 'kWh', 1150.6, {daily: 1.4, shape: 'day'});
  add('kitchen', 'dishwasher', 'Dishwasher Energy', 'energy', 'kWh', 530.9, {daily: 0.9, shape: 'evening'});
  add('hall', 'nas', 'NAS Energy', 'energy', 'kWh', 611.3, {daily: 0.7, shape: 'flat'});
  add('kitchen', 'kitchen_fridge', 'Fridge Energy', 'energy', 'kWh', 845.2, {daily: 0.9, shape: 'flat'});
  Object.assign(HA, {sensors: S.sensors, states: S.states});
  // Devices: air conditioners in the living room, bedroom and both kids' rooms; underfloor heating in both bathrooms; curtains and blinds
  // (one in the kitchen zone); the front and balcony doors and the kids' room window; leak sensors at every water point, the valve in the laundry
  const K = deviceKit();
  K.ac('living_ac', 'Living room AC', 'living', 'heat', 22, 22.3);
  K.ac('bedroom_ac', 'Bedroom AC', 'bedroom', 'off', 21, 21);
  K.ac('kids1_ac', "Kids' room AC", 'kids1', 'off', 22, 22);
  K.ac('kids2_ac', "Second kids' room AC", 'kids2', 'off', 22, 21.8);
  K.thermostat('master_bath_floor', 'Main bathroom underfloor heating', 'master_bath', 27, 25.6);
  K.thermostat('guest_bath_floor', 'Guest bathroom underfloor heating', 'guest_bath', 25, 23.9);
  K.cover('living_curtains', 'Living room curtains', 'living', 'curtain', 100);
  K.cover('kitchen_blind', 'Kitchen roller blind', 'kitchen', 'blind', 60);
  K.cover('bedroom_curtains', 'Bedroom curtains', 'bedroom', 'curtain', 0);
  K.cover('bedroom_side_blind', 'Bedroom side blind', 'bedroom', 'blind', 0);
  K.cover('kids1_blind', "Kids' room blind", 'kids1', 'blind', 100);
  K.cover('kids2_blind', "Second kids' room blind", 'kids2', 'blind', 100);
  K.contact('front_door', 'Front door', 'hall', 'door', false);
  K.contact('balcony_door', 'Balcony door', 'balcony', 'door', false);
  K.contact('kids1_window', "Kids' room window", 'kids1', 'window', false);
  K.leak('leak_kitchen', 'Leak under the sink', 'kitchen', 81);
  K.leak('leak_laundry', 'Laundry leak', 'laundry', 93);
  K.leak('leak_master_bath', 'Main bathroom leak', 'master_bath', 57);
  K.leak('leak_guest_bath', 'Guest bathroom leak', 'guest_bath', 88);
  K.valve('water_main', 'Water shut-off valve', 'laundry');
  K.camera('entrance', 'Entrance camera', 'hall');
  K.vacuum('robot', 'Robot vacuum', 'hall');
  K.favorites([
    ['scene.movie', 'Movie', 'living', '2026-11-06T20:30:00Z'],
    ['scene.dinner', 'Dinner', 'living', '2026-11-07T18:45:00Z'],
    ['script.good_night', 'Good night', null, 'off'],
    ['switch.dryer', 'Dryer', 'laundry', 'off'],
    ['lock.front_door', 'Front door lock', 'hall', 'locked'],
  ]);
  Object.assign(HA, {devices: K.devices, entities: K.entities, extra: K.extra});
  HA.stats = stats(['sensor.home_meter_energy'], ['washer', 'dryer', 'dishwasher', 'nas', 'kitchen_fridge'], {
    'climate.kids2_ac': {hours: 5, drops: 4},
    'binary_sensor.leak_master_bath': {hours: 1.5, drops: 1},
  });
  HA.weather = WEATHER;
  const DEMO = {
    version: 1,
    units: 'm',
    view: VIEW,
    rooms: ROOMS.map(r => ({
      id: r.id,
      name: r.short,
      polygon: r.polygon,
      ...(r.zone ? {zone: r.zone} : {}),
      ...FINISH[r.id],
    })),
    openings: OPENINGS,
    furniture: FURNITURE,
    lights: PLACED,
  };
  return {HA, DEMO, DEMO_UNDERLAY: null, STYLE};
}
