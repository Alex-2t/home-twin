// Example home 11 (D-062): a loft in a converted industrial building, about 117 m² on one floor. A long kitchen-living-dining room
// (one room, two HA areas: the kitchen and dining part, the living part) with tall steel-framed windows along the south and east walls,
// a cast-iron column, a walnut island, a long dining table for eight and a U-shaped sofa facing the media wall; a bedroom with
// a walk-in closet that leads to the bathroom (freestanding tub, walk-in shower, double vanity); a study, an entry hall, a guest WC.
// Made up: nobody's home. Metres, x east, y north, 10 cm interior walls; the editor adds the exterior walls.
import {door, win, F, haLight, sensorKit, deviceKit, stats, WEATHER} from '../kit.mjs';

const FV = (v, ...a) => ({...F(...a), v}); // an item in a catalog variant
const Z = (z, f) => ({...f, z}); // an item at its own height above the floor

// The great room is one room; its west part, up to x = 12.5, is the kitchen and dining area (room.zone: left of a→b). The extra corners
// on the north wall (x = 12.5) and the west wall (y = 3.3) split those walls in two, so the style's media wall stays behind the TV
// and the kitchen backsplash stays behind the kitchen.
const ROOMS = [
  {
    id: 'living',
    short: 'Kitchen-living room',
    polygon: [
      [8, 0],
      [17.6, 0],
      [17.6, 6.8],
      [12.5, 6.8],
      [8, 6.8],
      [8, 3.3],
    ],
    zone: {a: [12.5, 0], b: [12.5, 6.8], area: 'kitchen', left: true},
  },
  {
    id: 'bedroom',
    short: 'Bedroom',
    polygon: [
      [0, 0],
      [4.8, 0],
      [4.8, 4],
      [0, 4],
    ],
  },
  {
    id: 'closet',
    short: 'Walk-in closet',
    polygon: [
      [3.2, 4.1],
      [4.8, 4.1],
      [4.8, 6.8],
      [3.2, 6.8],
    ],
  },
  {
    id: 'bathroom',
    short: 'Bathroom',
    polygon: [
      [0, 4.1],
      [3.1, 4.1],
      [3.1, 6.8],
      [0, 6.8],
    ],
  },
  {
    id: 'study',
    short: 'Study',
    polygon: [
      [4.9, 0],
      [7.9, 0],
      [7.9, 2.7],
      [4.9, 2.7],
    ],
  },
  {
    id: 'hall',
    short: 'Entry hall',
    polygon: [
      [4.9, 2.8],
      [7.9, 2.8],
      [7.9, 6.8],
      [6.3, 6.8],
      [6.3, 4.8],
      [4.9, 4.8],
    ],
  },
  {
    id: 'wc',
    short: 'Guest WC',
    polygon: [
      [4.9, 4.9],
      [6.2, 4.9],
      [6.2, 6.8],
      [4.9, 6.8],
    ],
  },
];
const HA_AREAS = {
  ...Object.fromEntries(ROOMS.map(r => [r.id, r.short])),
  living: 'Living room',
  kitchen: 'Kitchen',
};

// Steel loft windows: from 50 cm above the floor to 2.5 m. Interior doors sit 1 cm towards the room they open into.
const LOFT = [0.5, 2.5];
const OPENINGS = [
  door([6.45, 6.8], [7.4, 6.8], 2.2), // front door
  door([7.95, 3.55], [7.95, 5.15], 2.4), // hall ↔ great room, a wide opening
  door([4.84, 3], [4.84, 3.8]), // hall ↔ bedroom
  {...door([3.5, 4.05], [4.3, 4.05]), leaf: false}, // bedroom ↔ walk-in closet, a doorway
  door([3.14, 5], [3.14, 5.8]), // walk-in closet ↔ bathroom, opens into the bathroom
  door([6.9, 2.74], [7.7, 2.74]), // hall ↔ study
  door([5.25, 4.84], [5.95, 4.84]), // guest WC, opens into the hall
  win([8.35, 0], [10.25, 0], ...LOFT),
  win([10.7, 0], [12.6, 0], ...LOFT),
  win([13.05, 0], [14.95, 0], ...LOFT),
  win([15.4, 0], [17.3, 0], ...LOFT), // great room, south
  win([17.6, 0.5], [17.6, 2.5], ...LOFT),
  win([17.6, 2.95], [17.6, 4.95], ...LOFT), // great room, east
  win([0.6, 0], [2.1, 0], ...LOFT),
  win([2.7, 0], [4.2, 0], ...LOFT),
  win([0, 1.6], [0, 3.2], ...LOFT), // bedroom, south and west
  win([5.6, 0], [7.2, 0], ...LOFT), // study
  win([0.75, 6.8], [2.15, 6.8], 1.05, 2.3), // bathroom, above the tub
  win([5.2, 6.8], [5.9, 6.8], 1.5, 2.2), // guest WC
];

const FURNITURE = [
  // living part: a U-shaped sofa facing the media wall (TV bench, TV, soundbar, speakers, shelving), coffee table and rug,
  // a console behind the sofa with books and a vase, candles on the coffee table, a reading corner by the corner windows with two leather armchairs, the bike on display in the corner,
  // a cast-iron column, a palm, a dog bed, the air conditioner above the shelving
  F('l1', 'sofaU', 15, 3.15, 180, 3.2, 2, 0.82, 'graphite'),
  FV('rect', 'l2', 'tableCoffee', 15, 4, 0, 1.2, 0.7, 0.38, 'walnut'),
  F('l3', 'rug', 15, 3.7, 0, 3.8, 3.2, 0.012, 'linen'),
  F('l4', 'tvStand', 15, 6.525, 0, 2.4, 0.45, 0.5, 'walnut'),
  Z(0.85, F('l5', 'tv', 15, 6.72, 0, 1.9, 0.06, 1.1)),
  F('l6', 'soundbar', 15, 6.6, 0, 1.1, 0.1, 0.07, 'black'),
  F('l7', 'shelf', 13.05, 6.55, 0, 0.9, 0.4, 2, 'graphite'),
  F('l8', 'speaker', 13.66, 6.6, 0, 0.24, 0.3, 1.05, 'black'),
  F('l9', 'speaker', 16.34, 6.6, 0, 0.24, 0.3, 1.05, 'black'),
  F('l10', 'aircon', 13.05, 6.64, 0, 0.8, 0.22, 0.29),
  F('l11', 'bicycle', 17.25, 5.875, 0, 0.6, 1.75, 1.05, 'sage'),
  F('l12', 'console', 15, 1.95, 0, 1.6, 0.35, 0.75, 'walnut'),
  F('l13', 'loungeChair', 15.6, 1, 90, 0.82, 0.85, 0.78, 'terracotta'),
  F('l14', 'loungeChair', 17, 1, 270, 0.82, 0.85, 0.78, 'terracotta'),
  FV('round', 'l15', 'sideTable', 16.3, 1, 0, 0.45, 0.45, 0.5, 'black'),
  F('l16', 'lampRoundFloor', 17.3, 0.3, 0, 0.4, 0.4, 1.6, 'linen'),
  F('l17', 'lampRoundFloor', 13.1, 2.4, 0, 0.4, 0.4, 1.6, 'graphite'),
  {...FV('cyl', 'l18', 'custom', 12.6, 3.4, 0, 0.3, 0.3, 2.6, 'black'), name: 'Steel column'},
  FV('palm', 'l19', 'pottedPlant', 12.83, 0.55, 0, 0.9, 0.9, 1.6, 'graphite'),
  FV('pampas', 'l20', 'floorVase', 14.2, 0.45, 0, 0.4, 0.4, 1.2, 'sand'),
  Z(0.75, FV('books', 'l23', 'decor', 14.55, 1.95, 0, 0.3, 0.22, 0.2, 'terracotta')),
  Z(0.75, FV('vase', 'l24', 'decor', 15.5, 1.95, 0, 0.18, 0.18, 0.5, 'black')),
  Z(0.38, FV('candles', 'l25', 'decor', 15.25, 4, 0, 0.32, 0.14, 0.22, 'graphite')),
  FV('snake', 'l21', 'pottedPlant', 16.7, 6.5, 0, 0.35, 0.35, 0.9, 'black'),
  FV('round', 'l22', 'petBed', 13.75, 1.15, 0, 0.7, 0.7, 0.2, 'sand'),
  // kitchen part: a French-door fridge and an oven tower on the west wall, a graphite run along the north wall (base, cooktop with an oven,
  // base with the coffee machine, double sink, dishwasher), a black chimney hood, open walnut shelves instead of wall cabinets;
  // a walnut island with four bar stools, a vase of eucalyptus and a bowl of fruit
  FV('french', 'k1', 'fridge', 8.41, 6.295, 90, 0.91, 0.72, 2.2, 'steel'),
  FV('oven', 'k2', 'kitchenTall', 8.35, 5.54, 90, 0.6, 0.6, 2.2, 'graphite'),
  F('k3', 'kitchenBase', 9.1, 6.45, 0, 0.6, 0.6, 0.9, 'graphite'),
  FV('oven', 'k4', 'kitchenHob', 9.775, 6.45, 0, 0.75, 0.6, 0.9, 'graphite'),
  F('k5', 'kitchenBase', 10.45, 6.45, 0, 0.6, 0.6, 0.9, 'graphite'),
  FV('two', 'k6', 'kitchenSink', 11.2, 6.45, 0, 0.9, 0.6, 0.9, 'graphite'),
  F('k7', 'dishwasher', 11.95, 6.45, 0, 0.6, 0.6, 0.9, 'graphite'),
  FV('dome', 'k8', 'hood', 9.775, 6.5, 0, 0.75, 0.5, 0.9, 'black'),
  Z(1.5, F('k9', 'wallShelf', 9.1, 6.61, 0, 0.5, 0.28, 0.04, 'walnut')),
  Z(1.9, F('k10', 'wallShelf', 9.1, 6.61, 0, 0.5, 0.28, 0.04, 'walnut')),
  Z(1.5, F('k11', 'wallShelf', 11.225, 6.61, 0, 1.95, 0.28, 0.04, 'walnut')),
  Z(1.9, F('k12', 'wallShelf', 11.225, 6.61, 0, 1.95, 0.28, 0.04, 'walnut')),
  F('k13', 'coffee', 10.45, 6.55, 0, 0.28, 0.38, 0.4, 'black'),
  F('k14', 'kitchenIsland', 10.5, 4.65, 0, 2.6, 1, 0.92, 'walnut'),
  F('k15', 'barStool', 9.6, 4, 180, 0.42, 0.42, 0.9, 'black'),
  F('k16', 'barStool', 10.2, 4, 180, 0.42, 0.42, 0.9, 'black'),
  F('k17', 'barStool', 10.8, 4, 180, 0.42, 0.42, 0.9, 'black'),
  F('k18', 'barStool', 11.4, 4, 180, 0.42, 0.42, 0.9, 'black'),
  Z(0.92, FV('eucalyptus', 'k19', 'floorVase', 11.55, 4.85, 0, 0.3, 0.3, 0.55, 'white')),
  Z(0.92, FV('bowl', 'k20', 'decor', 9.55, 4.8, 0, 0.32, 0.32, 0.14, 'white')),
  // dining part: a long walnut table for eight under the windows, graphite chairs, hydrangeas on the table, a sideboard with books and candles and a picture
  // above it on the west wall, a fig tree in the corner, the second air conditioner
  FV('long', 'd1', 'tableExt', 10.47, 1.7, 0, 2.6, 1, 0.76, 'walnut'),
  ...[9.54, 10.16, 10.78, 11.4].flatMap((x, i) => [
    F('d' + (2 + i), 'chairCushion', x, 2.34, 0, 0.46, 0.52, 0.84, 'graphite'),
    F('d' + (6 + i), 'chairCushion', x, 1.06, 180, 0.46, 0.52, 0.84, 'graphite'),
  ]),
  F('d10', 'sideboard', 8.26, 1.65, 90, 1.8, 0.42, 0.75, 'graphite'),
  Z(0.75, FV('books', 'd15', 'decor', 8.26, 1.05, 90, 0.3, 0.22, 0.2, 'white')),
  Z(0.75, FV('candles', 'd16', 'decor', 8.26, 2.2, 90, 0.32, 0.14, 0.22, 'black')),
  Z(1.2, F('d11', 'picture', 8.065, 1.65, 90, 1.4, 0.03, 0.9, 'black')),
  F('d12', 'aircon', 8.16, 3, 90, 0.8, 0.22, 0.29),
  Z(0.76, FV('flowers', 'd13', 'pottedPlant', 10.47, 1.7, 0, 0.32, 0.32, 0.38, 'white')),
  FV('ficus', 'd14', 'pottedPlant', 8.4, 0.45, 0, 0.6, 0.6, 1.8, 'terracotta'),
  // bedroom: a king-size walnut bed against the closet wall, nightstands, a picture over the bed, a bench at its foot, a dresser with
  // a round mirror, a reading chair and a floor lamp in the corner between the windows, linen curtains, a monstera
  F('b1', 'bed', 1.75, 2.875, 0, 1.9, 2.15, 1.1, 'walnut'),
  F('b2', 'nightstand', 0.5, 3.75, 0, 0.5, 0.4, 0.5, 'graphite'),
  F('b3', 'nightstand', 3, 3.75, 0, 0.5, 0.4, 0.5, 'graphite'),
  Z(1.3, F('b4', 'picture', 1.75, 3.935, 0, 1.5, 0.03, 0.7, 'black')),
  F('b5', 'bench', 1.75, 1.5, 0, 1.4, 0.42, 0.45, 'walnut'),
  F('b6', 'rug', 1.75, 2.3, 0, 2.8, 2.4, 0.012, 'grey'),
  F('b7', 'dresser', 4.5, 1.8, 270, 1.6, 0.5, 0.8, 'graphite'),
  Z(1.15, FV('round', 'b8', 'wallMirror', 4.735, 1.8, 270, 0.9, 0.03, 0.9, 'black')),
  F('b9', 'aircon', 4.64, 1.8, 270, 0.8, 0.22, 0.29),
  F('b10', 'loungeChair', 0.75, 0.75, 135, 0.8, 0.8, 0.78, 'sand'),
  F('b11', 'lampRoundFloor', 0.3, 1.4, 0, 0.4, 0.4, 1.6, 'linen'),
  FV('open', 'b12', 'curtains', 1.35, 0.12, 180, 1.9, 0.14, 2.55, 'linen'),
  FV('open', 'b13', 'curtains', 3.45, 0.12, 180, 1.9, 0.14, 2.55, 'linen'),
  FV('open', 'b14', 'curtains', 0.12, 2.4, 90, 2, 0.14, 2.55, 'linen'),
  FV('monstera', 'b15', 'pottedPlant', 4.3, 0.55, 0, 0.8, 0.8, 1, 'sand'),
  // walk-in closet: open wardrobes along the east wall, a shoe shelf, a full-length mirror
  F('c1', 'openWardrobe', 4.475, 5.025, 270, 1.15, 0.55, 2.4, 'graphite'),
  F('c2', 'openWardrobe', 4.475, 6.175, 270, 1.15, 0.55, 2.4, 'graphite'),
  F('c3', 'floorMirror', 3.7, 6.6, 0, 0.6, 0.3, 1.8, 'black'),
  F('c4', 'shelf', 3.4, 4.68, 90, 0.5, 0.3, 1.4, 'graphite'),
  // bathroom: a walk-in shower with a black frame, a freestanding tub under the window, a double walnut vanity with two round mirrors,
  // a wall-hung toilet, a black towel warmer, a laundry basket, a bath mat, a snake plant
  FV('rect', 'a1', 'walkIn', 0.5, 4.8, 90, 1.3, 0.9, 2, 'black'),
  FV('oval', 'a2', 'bathFree', 1.45, 6.25, 0, 1.7, 0.8, 0.6),
  FV('wall', 'a3', 'vanity', 1.75, 4.4, 180, 1.4, 0.5, 0.85, 'walnut'),
  Z(1.2, FV('round', 'a4', 'wallMirror', 1.4, 4.165, 180, 0.55, 0.03, 0.55, 'black')),
  Z(1.2, FV('round', 'a5', 'wallMirror', 2.1, 4.165, 180, 0.55, 0.03, 0.55, 'black')),
  FV('wall', 'a6', 'toilet', 2.775, 6.2, 270, 0.38, 0.55, 0.8, 'white'),
  FV('ladder', 'a7', 'towelRail', 3, 4.55, 270, 0.5, 0.1, 1, 'black'),
  F('a8', 'laundryBasket', 2.72, 4.45, 0, 0.38, 0.34, 0.55, 'linen'),
  F('a9', 'rug', 1.75, 5.05, 0, 0.9, 0.55, 0.012, 'linen'),
  FV('snake', 'a10', 'pottedPlant', 0.3, 6.45, 0, 0.35, 0.35, 0.85, 'white'),
  // study: a walnut desk under the window with a monitor and a rolling pedestal, a black office chair, shelving on the west wall,
  // a credenza with a printer and a poster above it, a leather reading chair, a rug, the air conditioner over the chair, a vase of pampas
  F('s1', 'desk', 6.4, 0.4, 180, 1.6, 0.7, 0.75, 'walnut'),
  F('s2', 'chairDesk', 6.4, 1, 0, 0.62, 0.62, 1.05, 'black'),
  FV('arm', 's3', 'monitor', 6.4, 0.25, 180, 0.7, 0.2, 0.42),
  F('s4', 'pedestal', 7, 0.35, 180, 0.4, 0.5, 0.58, 'graphite'),
  F('s5', 'shelf', 5.125, 1.35, 90, 1.8, 0.35, 2, 'graphite'),
  F('s6', 'sideboard', 7.625, 0.95, 270, 1.2, 0.45, 0.7, 'walnut'),
  Z(0.7, F('s7', 'printer', 7.625, 0.7, 270, 0.42, 0.36, 0.25, 'black')),
  Z(1.25, FV('poster', 's8', 'picture', 7.835, 0.95, 270, 0.9, 0.03, 0.6, 'black')),
  F('s9', 'loungeChair', 6, 2.225, 0, 0.8, 0.85, 0.78, 'terracotta'),
  F('s10', 'aircon', 6, 2.54, 0, 0.8, 0.22, 0.29),
  F('s11', 'rug', 6.4, 1.1, 0, 2, 1.4, 0.012, 'graphite'),
  FV('pampas', 's12', 'floorVase', 5.15, 2.47, 0, 0.3, 0.3, 1, 'black'),
  // hall: a sliding wardrobe opposite the guest WC, a bench with a coat rack by the front door, a shoe cabinet with a mirror,
  // the electrical panel, a robot vacuum dock, a runner, a vase of eucalyptus
  FV('sliding', 'h1', 'wardrobe', 6, 3.15, 180, 1.6, 0.6, 2.4, 'graphite'),
  F('h2', 'bench', 7.65, 6, 270, 1.2, 0.4, 0.45, 'walnut'),
  FV('shelf', 'h3', 'coatHooks', 7.725, 6, 270, 1.2, 0.25, 0.35, 'walnut'),
  F('h4', 'shoeCabinet', 6.5, 5.3, 90, 0.8, 0.3, 0.9, 'graphite'),
  Z(1.05, F('h5', 'wallMirror', 6.365, 5.3, 90, 0.6, 0.03, 1, 'black')),
  F('h6', 'elPanel', 5.01, 4.3, 90, 0.4, 0.12, 0.5, 'grey'),
  F('h7', 'robotVacuum', 6.19, 4.49, 0, 0.38, 0.52, 0.12, 'black'),
  F('h8', 'rug', 6.9, 4.6, 90, 2, 0.8, 0.012, 'graphite'),
  FV('eucalyptus', 'h9', 'floorVase', 5.1, 4.55, 0, 0.3, 0.3, 1.1, 'black'),
  // guest WC: a black wall-hung toilet, a small basin with a round mirror, a snake plant
  FV('wall', 'w1', 'toilet', 5.225, 6.1, 90, 0.38, 0.55, 0.8, 'black'),
  FV('wall', 'w2', 'basin', 5.975, 5.55, 270, 0.45, 0.35, 0.85),
  Z(1.2, FV('round', 'w3', 'wallMirror', 6.135, 5.55, 270, 0.4, 0.03, 0.4, 'black')),
  FV('snake', 'w4', 'pottedPlant', 5.95, 6.5, 0, 0.35, 0.35, 0.85, 'black'),
];

const LIGHTS = [
  {id: 'hall_spots', name: 'Hall spots', room: 'hall', kind: 'ceiling'},
  {id: 'living_track', name: 'Living room track', room: 'living', kind: 'ceiling'},
  {id: 'living_floor', name: 'Floor lamp', room: 'living', kind: 'accent'},
  {id: 'living_reading', name: 'Reading floor lamp', room: 'living', kind: 'accent'},
  {id: 'living_cove', name: 'Ceiling cove', room: 'living', kind: 'cove'},
  {id: 'living_tv', name: 'TV backlight', room: 'living', kind: 'strip'},
  {id: 'kitchen_track', name: 'Kitchen track', room: 'kitchen', kind: 'ceiling'},
  {id: 'kitchen_island', name: 'Island pendants', room: 'kitchen', kind: 'ceiling', color: '#ffc773'},
  {id: 'kitchen_worktop', name: 'Worktop strip', room: 'kitchen', kind: 'strip'},
  {id: 'dining_pendants', name: 'Dining pendants', room: 'kitchen', kind: 'ceiling', color: '#ffc773'},
  {id: 'dining_picture', name: 'Picture light', room: 'kitchen', kind: 'accent'},
  {id: 'bedroom_main', name: 'Bedroom ceiling light', room: 'bedroom', kind: 'ceiling'},
  {id: 'bedroom_sconces', name: 'Bedside sconces', room: 'bedroom', kind: 'accent', color: '#ffd34d'},
  {id: 'bedroom_reading', name: 'Reading floor lamp', room: 'bedroom', kind: 'accent'},
  {id: 'closet_main', name: 'Closet light', room: 'closet', kind: 'ceiling'},
  {id: 'bathroom_spots', name: 'Bathroom spots', room: 'bathroom', kind: 'ceiling'},
  {id: 'bathroom_mirror', name: 'Mirror light', room: 'bathroom', kind: 'accent'},
  {id: 'wc_main', name: 'WC light', room: 'wc', kind: 'ceiling'},
  {id: 'study_main', name: 'Study ceiling light', room: 'study', kind: 'ceiling'},
  {id: 'study_desk', name: 'Desk lamp', room: 'study', kind: 'accent'},
];
// where the lamps are: all of them, so every fixture shows in the example (homes.test.js runs “Auto-place” on them from scratch too)
const PLACED = [
  {
    id: 'hall_spots',
    placed: true,
    room: 'hall',
    form: 'spots',
    h: 2.58,
    points: [
      [5.6, 4.1],
      [7, 4.1],
      [7.1, 5.5],
      [7.1, 6.4],
    ],
  },
  {
    id: 'living_track',
    placed: true,
    room: 'living',
    form: 'line',
    shade: 'black',
    h: 2.58,
    segments: [
      [
        [13.6, 3.65],
        [16.4, 3.65],
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
    points: [[13.1, 2.4]],
  },
  {
    id: 'living_reading',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[17.3, 0.3]],
  },
  {
    id: 'living_cove',
    placed: true,
    room: 'living',
    segments: [
      [
        [12.65, 6.72],
        [17.45, 6.72],
      ],
    ],
  }, // along the brick wall: on the back wall it is seen in 3D
  {
    id: 'kitchen_track',
    placed: true,
    room: 'living',
    form: 'line',
    shade: 'black',
    h: 2.58,
    segments: [
      [
        [8.9, 5.65],
        [12.1, 5.65],
      ],
    ],
  },
  {
    id: 'kitchen_island',
    placed: true,
    room: 'living',
    form: 'pendant',
    shade: 'metal',
    h: 1.8,
    points: [
      [9.85, 4.65],
      [10.5, 4.65],
      [11.15, 4.65],
    ],
  },
  {
    id: 'kitchen_worktop',
    placed: true,
    room: 'living',
    segments: [
      [
        [8.85, 6.5],
        [12.2, 6.5],
      ],
    ],
  },
  {
    id: 'dining_pendants',
    placed: true,
    room: 'living',
    form: 'pendant',
    shade: 'metal',
    h: 1.7,
    points: [
      [9.82, 1.7],
      [10.47, 1.7],
      [11.12, 1.7],
    ],
  },
  {id: 'dining_picture', placed: true, room: 'living', form: 'wall', h: 2.15, points: [[8.03, 1.65]]},
  {
    id: 'living_tv',
    placed: true,
    room: 'living',
    h: 1.45,
    segments: [
      [
        [14.25, 6.76],
        [15.75, 6.76],
      ],
    ],
  }, // behind the TV, a glow on the brick
  {
    id: 'bedroom_sconces',
    placed: true,
    room: 'bedroom',
    form: 'wall',
    h: 1.25,
    points: [
      [0.5, 3.87],
      [3, 3.87],
    ],
  }, // over the nightstands
  {id: 'closet_main', placed: true, room: 'closet', points: [[4, 5.45]]},
  {id: 'wc_main', placed: true, room: 'wc', points: [[5.55, 5.85]]},
  {
    id: 'study_desk',
    placed: true,
    room: 'study',
    form: 'lamp',
    opt: 'table',
    h: 1.17,
    points: [[6.95, 0.22]],
  },
  {id: 'bedroom_main', placed: true, room: 'bedroom', points: [[2.4, 2]]},
  {
    id: 'bedroom_reading',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[0.3, 1.4]],
  },
  {
    id: 'bathroom_spots',
    placed: true,
    room: 'bathroom',
    form: 'spots',
    h: 2.58,
    points: [
      [0.55, 4.8],
      [1.75, 5.2],
      [2.6, 5.4],
      [1.45, 6.25],
    ],
  },
  {id: 'bathroom_mirror', placed: true, room: 'bathroom', form: 'wall', h: 1.9, points: [[1.75, 4.17]]},
  {id: 'study_main', placed: true, room: 'study', points: [[6.4, 1.35]]},
];

export default async function () {
  const HA = {areas: HA_AREAS, lights: LIGHTS.map(haLight)};
  // Sensors: room air in the living part, the kitchen part, the bedroom (CO₂ is high after the night) and the study; the bathroom and the hall;
  // diagnostic ones (a battery, the NAS and router CPUs); the fridge is not room air; energy meters
  const S = sensorKit(),
    add = S.add;
  add('living', 'living_air', 'Living room air Temperature', 'temperature', '°C', 21.6);
  add('living', 'living_air', 'Living room air Humidity', 'humidity', '%', 41);
  add('living', 'living_air', 'Living room air CO2', 'carbon_dioxide', 'ppm', 640);
  add('kitchen', 'kitchen_th', 'Kitchen sensor Temperature', 'temperature', '°C', 22.8);
  add('kitchen', 'kitchen_th', 'Kitchen sensor Humidity', 'humidity', '%', 47);
  add('kitchen', 'kitchen_fridge', 'Fridge Temperature', 'temperature', '°C', 3.8);
  add('bedroom', 'bedroom_air', 'Bedroom air Temperature', 'temperature', '°C', 20.2);
  add('bedroom', 'bedroom_air', 'Bedroom air Humidity', 'humidity', '%', 46);
  add('bedroom', 'bedroom_air', 'Bedroom air CO2', 'carbon_dioxide', 'ppm', 1180);
  add('bedroom', 'bedroom_air', 'Bedroom air Battery', 'battery', '%', 44, {cat: 'diagnostic'});
  add('study', 'study_air', 'Study air Temperature', 'temperature', '°C', 21.9);
  add('study', 'study_air', 'Study air Humidity', 'humidity', '%', 40);
  add('study', 'study_air', 'Study air CO2', 'carbon_dioxide', 'ppm', 910);
  add('bathroom', 'bath_th', 'Bathroom sensor Temperature', 'temperature', '°C', 24.6);
  add('bathroom', 'bath_th', 'Bathroom sensor Humidity', 'humidity', '%', 68);
  add('hall', 'hall_th', 'Hall sensor Temperature', 'temperature', '°C', 20.7);
  add('hall', 'hall_th', 'Hall sensor Humidity', 'humidity', '%', 44);
  add('study', 'nas', 'NAS CPU temperature', 'temperature', '°C', 49, {cat: 'diagnostic'});
  add('hall', 'router', 'Router CPU temperature', 'temperature', '°C', 56, {cat: 'diagnostic'});
  add(null, 'home_meter', 'Main meter Energy', 'energy', 'kWh', 11874.3, {daily: 10.2, shape: 'home'});
  add('kitchen', 'dishwasher', 'Dishwasher Energy', 'energy', 'kWh', 488.1, {daily: 0.8, shape: 'evening'});
  add('kitchen', 'kitchen_fridge', 'Fridge Energy', 'energy', 'kWh', 902.6, {daily: 1.1, shape: 'flat'});
  add('kitchen', 'espresso', 'Espresso machine Energy', 'energy', 'kWh', 214.9, {daily: 0.3, shape: 'day'});
  add('living', 'media', 'Media wall Energy', 'energy', 'kWh', 356.4, {daily: 0.6, shape: 'evening'});
  add('study', 'nas', 'NAS Energy', 'energy', 'kWh', 598.7, {daily: 0.7, shape: 'flat'});
  Object.assign(HA, {sensors: S.sensors, states: S.states});
  // Devices: two air conditioners in the great room (the living one heats), one in the bedroom and the study; underfloor heating in the great room
  // and the bathroom; roller blinds on the great room's windows, curtains and a blackout blind in the bedroom, a blind in the study;
  // the front door and the bathroom and study windows; leak sensors at the sink, the dishwasher, the bathroom and the WC, the valve;
  // a camera at the entrance, a robot vacuum
  const K = deviceKit();
  K.ac('living_ac', 'Living room AC', 'living', 'heat', 22, 21.6);
  K.ac('kitchen_ac', 'Kitchen AC', 'kitchen', 'off', 22, 22.8);
  K.ac('bedroom_ac', 'Bedroom AC', 'bedroom', 'off', 20, 20.2);
  K.ac('study_ac', 'Study AC', 'study', 'off', 22, 21.9);
  K.thermostat('living_floor_heating', 'Living room underfloor heating', 'living', 23, 21.6);
  K.thermostat('bathroom_floor', 'Bathroom underfloor heating', 'bathroom', 27, 24.6);
  K.cover('kitchen_blinds', 'Kitchen blinds', 'kitchen', 'blind', 100);
  K.cover('living_blinds', 'Living room blinds', 'living', 'blind', 100);
  K.cover('living_east_blinds', 'Living room east blinds', 'living', 'blind', 80);
  K.cover('bedroom_curtains', 'Bedroom curtains', 'bedroom', 'curtain', 100);
  K.cover('bedroom_blind', 'Bedroom blackout blind', 'bedroom', 'blind', 100);
  K.cover('study_blind', 'Study blind', 'study', 'blind', 60);
  K.contact('front_door', 'Front door', 'hall', 'door', false);
  K.contact('bathroom_window', 'Bathroom window', 'bathroom', 'window', false);
  K.contact('study_window', 'Study window', 'study', 'window', false);
  K.leak('leak_sink', 'Leak under the sink', 'kitchen', 86);
  K.leak('leak_dishwasher', 'Dishwasher leak', 'kitchen', 74);
  K.leak('leak_bathroom', 'Bathroom leak', 'bathroom', 62);
  K.leak('leak_wc', 'WC leak', 'wc', 91);
  K.valve('water_main', 'Water shut-off valve', 'bathroom');
  K.camera('entrance', 'Entrance camera', 'hall');
  K.vacuum('robot', 'Robot vacuum', 'hall');
  K.favorites([
    ['scene.movie', 'Movie', 'living', '2026-11-06T20:45:00Z'],
    ['scene.dinner', 'Dinner', 'kitchen', '2026-11-07T19:10:00Z'],
    ['scene.focus', 'Focus', 'study', '2026-11-07T09:00:00Z'],
    ['script.good_night', 'Good night', null, 'off'],
    ['switch.espresso', 'Espresso machine', 'kitchen', 'off'],
    ['lock.front_door', 'Front door lock', 'hall', 'locked'],
  ]);
  Object.assign(HA, {devices: K.devices, entities: K.entities, extra: K.extra});
  HA.stats = stats(
    ['sensor.home_meter_energy'],
    ['dishwasher', 'kitchen_fridge', 'espresso', 'media', 'nas'],
    {'climate.study_ac': {hours: 4, drops: 3}, 'binary_sensor.leak_bathroom': {hours: 1, drops: 1}},
  );
  HA.weather = WEATHER;
  const DEMO = {
    version: 1,
    units: 'm',
    rooms: ROOMS.map(r => ({id: r.id, name: r.short, polygon: r.polygon, ...(r.zone ? {zone: r.zone} : {})})),
    openings: OPENINGS,
    furniture: FURNITURE,
    lights: PLACED,
  };
  return {HA, DEMO, DEMO_UNDERLAY: null};
}
