// @ts-nocheck
// Example home 12: a minimalist apartment, about 106 m², one floor. Calm and spare, white, oak, light grey and a few black accents.
// Along the south facade one long kitchen-living room (one room, two HA areas: the kitchen zone in the west, up to x = 3.75): a kitchen
// run on the west wall with an oak tall-unit block, a white island with three stools, a dining table for six, a low sofa facing a wall-hung
// TV bench, three large windows. North of it: a small study, a guest WC with the washer and dryer, the entry hall with a built-in wardrobe,
// the bedroom, and through the bedroom a walk-in closet and the bathroom with a walk-in shower. Made up: nobody's home.
// Metres, x east, y north, 10 cm interior walls; the editor adds the exterior walls. Interior doors sit 1 cm off the wall middle towards
// the room their leaf swings into. Walls and floors are finished by the style (homes.ts: 'minimal').
import {door, win, F, haLight, sensorKit, deviceKit, stats, WEATHER, worktop} from '../kit.ts';

const FV = (v, ...a) => ({...F(...a), v}); // an item in a catalog variant
const Z = (z, f) => ({...f, z}); // an item at its own height (wall-hung)

const ROOMS = [
  {
    id: 'living',
    short: 'Kitchen-living room',
    polygon: [
      [0, 0],
      [11.2, 0],
      [11.2, 4.9],
      [0, 4.9],
    ],
    zone: {a: [3.75, 0], b: [3.75, 4.9], area: 'kitchen', left: true},
  },
  {
    id: 'study',
    short: 'Study',
    polygon: [
      [0, 5],
      [2.9, 5],
      [2.9, 7.9],
      [0, 7.9],
    ],
  },
  {
    id: 'wc',
    short: 'Guest WC',
    polygon: [
      [0, 8],
      [2.9, 8],
      [2.9, 9.7],
      [0, 9.7],
    ],
  },
  {
    id: 'hall',
    short: 'Entry hall',
    polygon: [
      [3, 5],
      [4.9, 5],
      [4.9, 9.7],
      [3, 9.7],
    ],
  },
  {
    id: 'bedroom',
    short: 'Bedroom',
    polygon: [
      [5, 5],
      [8.7, 5],
      [8.7, 9.7],
      [5, 9.7],
    ],
  },
  {
    id: 'closet',
    short: 'Walk-in closet',
    polygon: [
      [8.8, 5],
      [11.2, 5],
      [11.2, 7.1],
      [8.8, 7.1],
    ],
  },
  {
    id: 'bath',
    short: 'Bathroom',
    polygon: [
      [8.8, 7.2],
      [11.2, 7.2],
      [11.2, 9.7],
      [8.8, 9.7],
    ],
  },
];
const HA_AREAS = {
  living: 'Living room',
  kitchen: 'Kitchen',
  study: 'Study',
  wc: 'Guest WC',
  hall: 'Entry hall',
  bedroom: 'Bedroom',
  closet: 'Walk-in closet',
  bath: 'Bathroom',
};

const OPENINGS = [
  door([3.25, 9.7], [4.15, 9.7], 2.2), // front door
  {...door([3.3, 4.95], [4.6, 4.95], 2.4), leaf: false}, // entry hall ↔ kitchen-living room, a tall open doorway
  door([2.94, 5.35], [2.94, 6.15]), // entry hall ↔ study
  door([2.94, 8.25], [2.94, 8.95]), // entry hall ↔ guest WC
  door([4.96, 5.3], [4.96, 6.1]), // entry hall ↔ bedroom
  {...door([8.75, 5.65], [8.75, 6.45]), leaf: false}, // bedroom ↔ walk-in closet, a doorway
  door([8.76, 8.7], [8.76, 9.45]), // bedroom ↔ bathroom
  win([1.2, 0], [3.5, 0], 0.15, 2.45), // kitchen, floor to ceiling, centred on the island
  win([4.15, 0], [6.45, 0], 0.15, 2.45), // dining, centred on the table
  win([7.5, 0], [10.5, 0], 0.15, 2.45), // living, centred on the sofa group
  win([0, 5.75], [0, 7.15]), // study, over the desk
  win([1.1, 9.7], [1.9, 9.7], 1.4, 2.1), // guest WC
  win([5.65, 9.7], [8.05, 9.7], 0.15, 2.45), // bedroom, floor to ceiling
  win([9.7, 9.7], [10.5, 9.7], 1.4, 2.2), // bathroom
];

const FURNITURE = [
  // kitchen zone: a handle-less run on the west wall — base, cooktop, base, sink, dishwasher in white, then a block of three oak tall units
  // (oven, integrated fridge, pantry) up to 2.4 m; a black chimney hood, one floating oak shelf, a coffee machine; a white island with
  // its overhang to the east, a bowl of fruit and three black counter stools
  F('k1', 'kitchenBase', 0.35, 0.25, 90, 0.4, 0.6, 0.9, 'white'),
  FV('drawers', 'k2', 'kitchenHob', 0.35, 0.9, 90, 0.9, 0.6, 0.9, 'white'),
  F('k3', 'kitchenBase', 0.35, 1.6, 90, 0.5, 0.6, 0.9, 'white'),
  FV('one', 'k4', 'kitchenSink', 0.35, 2.15, 90, 0.6, 0.6, 0.9, 'white'),
  F('k5', 'dishwasher', 0.35, 2.75, 90, 0.6, 0.6, 0.9, 'white'),
  FV('oven', 'k6', 'kitchenTall', 0.35, 3.35, 90, 0.6, 0.6, 2.4, 'oak'),
  FV('doors', 'k7', 'kitchenTall', 0.35, 3.95, 90, 0.6, 0.6, 2.4, 'oak'),
  FV('doors', 'k8', 'kitchenTall', 0.35, 4.55, 90, 0.6, 0.6, 2.4, 'oak'),
  Z(1.6, FV('dome', 'k9', 'hood', 0.3, 0.9, 90, 0.9, 0.5, 0.98, 'black')),
  Z(1.5, F('k10', 'wallShelf', 0.175, 2.3, 90, 1.4, 0.25, 0.04, 'oak')),
  F('k11', 'coffee', 0.3, 2.85, 90, 0.25, 0.4, 0.38, 'black'),
  F('k12', 'kitchenIsland', 2.35, 2.45, 90, 2.4, 1, 0.9, 'white'),
  Z(0.9, FV('bowl', 'k16', 'decor', 2.2, 3.2, 0, 0.32, 0.32, 0.14, 'white')),
  F('k13', 'barStool', 2.96, 1.75, 270, 0.42, 0.42, 0.9, 'black'),
  F('k14', 'barStool', 2.96, 2.45, 270, 0.42, 0.42, 0.9, 'black'),
  F('k15', 'barStool', 2.96, 3.15, 270, 0.42, 0.42, 0.9, 'black'),
  // dining: an oak table for six on the room's axis, graphite chairs, a black vase of eucalyptus; one pendant over it
  F('d1', 'diningTable', 5.3, 2.45, 90, 2, 1, 0.75, 'oak'),
  Z(0.75, FV('vase', 'd8', 'decor', 5.3, 2.45, 0, 0.18, 0.18, 0.5, 'black')),
  F('d2', 'chairCushion', 4.62, 1.8, 90, 0.45, 0.52, 0.82, 'graphite'),
  F('d3', 'chairCushion', 4.62, 2.45, 90, 0.45, 0.52, 0.82, 'graphite'),
  F('d4', 'chairCushion', 4.62, 3.1, 90, 0.45, 0.52, 0.82, 'graphite'),
  F('d5', 'chairCushion', 5.98, 1.8, 270, 0.45, 0.52, 0.82, 'graphite'),
  F('d6', 'chairCushion', 5.98, 2.45, 270, 0.45, 0.52, 0.82, 'graphite'),
  F('d7', 'chairCushion', 5.98, 3.1, 270, 0.45, 0.52, 0.82, 'graphite'),
  // living: a low three-metre linen sofa with its back to the dining table, a low oak coffee table with candles on a large grey rug, a wall-hung oak TV bench
  // with the TV above it, a graphite lounge chair by the window (its floor lamp is a light from HA), a long oak sideboard with books and a vase, one large
  // picture over it, a fiddle-leaf fig in a black pot in the corner
  F('l1', 'loungeSofa', 7.7, 2.45, 90, 3, 1, 0.72, 'linen'),
  FV('rect', 'l2', 'tableCoffee', 8.95, 2.45, 90, 1.3, 0.7, 0.32, 'oak'),
  F('l3', 'rug', 9.25, 2.45, 90, 3.6, 2.7, 0.012, 'grey'),
  Z(0.3, F('l4', 'tvStand', 10.95, 2.45, 270, 2.4, 0.4, 0.4, 'oak')),
  Z(1, F('l5', 'tv', 11.12, 2.45, 270, 1.65, 0.06, 0.95)),
  F('l6', 'loungeChair', 10, 0.8, 225, 0.85, 0.85, 0.75, 'graphite'),
  F('l7', 'sideboard', 9, 4.625, 0, 2.2, 0.45, 0.6, 'oak'),
  Z(1.05, F('l8', 'picture', 9, 4.835, 0, 1.6, 0.03, 1, 'black')),
  FV('ficus', 'l9', 'pottedPlant', 10.75, 4.4, 0, 0.7, 0.7, 1.9, 'black'),
  Z(0.6, FV('books', 'l13', 'decor', 8.35, 4.62, 0, 0.3, 0.22, 0.2, 'white')),
  Z(0.6, FV('vase', 'l14', 'decor', 9.7, 4.62, 0, 0.18, 0.18, 0.5, 'black')),
  Z(0.32, FV('candles', 'l15', 'decor', 8.95, 2.75, 90, 0.32, 0.14, 0.22, 'black')),
  // linen sheers on all three windows, open (two of them are the HA curtains, the kitchen one is plain)
  FV('open', 'l10', 'curtains', 2.35, 0.12, 180, 2.7, 0.14, 2.5, 'linen'),
  FV('open', 'l11', 'curtains', 5.3, 0.12, 180, 2.7, 0.14, 2.5, 'linen'),
  FV('open', 'l12', 'curtains', 9, 0.12, 180, 3.4, 0.14, 2.5, 'linen'),
  // entry hall: an oak built-in wardrobe along the east wall, a tall black-framed mirror, a black floor vase with dried grass
  FV('hinged', 'h1', 'wardrobeRun', 4.55, 8.05, 270, 3.2, 0.6, 2.5, 'oak'),
  Z(0.2, FV('rect', 'h2', 'wallMirror', 3.065, 7.25, 90, 0.7, 0.03, 1.8, 'black')),
  FV('pampas', 'h3', 'floorVase', 3.3, 6.6, 0, 0.35, 0.35, 1.2, 'black'),
  // study: an oak desk under the window, a black office chair, a low graphite bookcase with a vase on it (the room's readings go on the wall above it),
  // a sand lounge chair for reading
  F('s1', 'desk', 0.4, 6.45, 90, 1.6, 0.7, 0.75, 'oak'),
  F('s2', 'chairDesk', 0.91, 6.45, 270, 0.62, 0.62, 1, 'black'),
  F('s3', 'shelf', 1.55, 7.675, 0, 1.3, 0.35, 1.1, 'graphite'),
  Z(1.1, FV('vase', 's5', 'decor', 1.15, 7.68, 0, 0.18, 0.18, 0.5, 'white')),
  Z(0.75, FV('books', 's6', 'decor', 0.35, 6.95, 90, 0.3, 0.22, 0.2, 'black')),
  F('s4', 'loungeChair', 2.35, 6.85, 270, 0.8, 0.8, 0.75, 'sand'),
  // guest WC: wall-hung toilet, a small basin with a round mirror; the washer with the dryer on top and a utility cabinet at the far end
  FV('wall', 'w1', 'toilet', 1.5, 8.325, 180, 0.38, 0.55, 0.8, 'white'),
  FV('wall', 'w2', 'basin', 2.35, 9.475, 0, 0.45, 0.35, 0.85, 'white'),
  FV('round', 'w3', 'wallMirror', 2.35, 9.635, 0, 0.45, 0.03, 0.45, 'black'),
  F('w4', 'washer', 0.35, 9.3, 90, 0.6, 0.6, 0.85, 'white'),
  Z(0.86, F('w5', 'dryer', 0.35, 9.3, 90, 0.6, 0.6, 0.85, 'white')),
  F('w6', 'utilityCabinet', 0.35, 8.5, 90, 0.8, 0.6, 2.2, 'white'),
  // bedroom: a low bed upholstered in linen with its headboard on the west wall (the style paints that wall; the room's readings go above the bed),
  // floating nightstands, a linen rug, a long low dresser facing the bed with a vase and books, a graphite lounge chair by the window, sheers, a monstera by the closet
  F('b1', 'bed', 6.1, 7.85, 90, 1.8, 2.1, 0.85, 'linen'),
  Z(0.25, F('b2', 'nightstand', 5.225, 6.7, 90, 0.5, 0.35, 0.3, 'oak')),
  Z(0.25, F('b3', 'nightstand', 5.225, 9, 90, 0.5, 0.35, 0.3, 'oak')),
  F('b5', 'rug', 7.05, 7.85, 90, 2.8, 2.1, 0.012, 'linen'),
  F('b6', 'dresser', 8.425, 7.85, 270, 1.6, 0.45, 0.75, 'oak'),
  Z(0.75, FV('vase', 'b10', 'decor', 8.43, 7.35, 270, 0.18, 0.18, 0.5, 'black')),
  Z(0.75, FV('books', 'b11', 'decor', 8.43, 8.35, 270, 0.3, 0.22, 0.2, 'white')),
  F('b7', 'loungeChair', 7.85, 9.05, 225, 0.8, 0.8, 0.75, 'graphite'),
  FV('open', 'b8', 'curtains', 6.85, 9.58, 0, 2.8, 0.14, 2.5, 'linen'),
  FV('monstera', 'b9', 'pottedPlant', 8.12, 5.42, 0, 0.6, 0.6, 0.95, 'white'),
  // walk-in closet: open oak wardrobes (two modules each) along both long walls, a full-length mirror at the end
  F('c1', 'openWardrobe', 9.425, 5.325, 180, 1.15, 0.55, 2.4, 'oak'),
  F('c2', 'openWardrobe', 10.575, 5.325, 180, 1.15, 0.55, 2.4, 'oak'),
  F('c3', 'openWardrobe', 9.425, 6.775, 0, 1.15, 0.55, 2.4, 'oak'),
  F('c4', 'openWardrobe', 10.575, 6.775, 0, 1.15, 0.55, 2.4, 'oak'),
  F('c5', 'floorMirror', 11, 6.05, 270, 0.6, 0.3, 1.8, 'black'),
  // bathroom: a black-framed walk-in shower in the corner, a wall-hung oak vanity with a round mirror, a wall-hung toilet, a black towel warmer
  F('m1', 'walkIn', 10.7, 9, 270, 1.3, 0.9, 2, 'black'),
  FV('wall', 'm2', 'vanity', 9.7, 7.5, 180, 1, 0.5, 0.85, 'oak'),
  Z(1.15, FV('round', 'm3', 'wallMirror', 9.7, 7.265, 180, 0.7, 0.03, 0.7, 'black')),
  FV('wall', 'm4', 'toilet', 10.875, 7.75, 270, 0.38, 0.55, 0.8, 'white'),
  F('m5', 'towelRail', 8.9, 7.85, 90, 0.5, 0.1, 0.8, 'black'),
];

worktop(FURNITURE, 'white'); // the kitchen's worktop: white quartz

const LIGHTS = [
  {id: 'kitchen_spots', name: 'Kitchen spots', room: 'kitchen', kind: 'ceiling'},
  {id: 'kitchen_island', name: 'Island pendants', room: 'kitchen', kind: 'ceiling', color: '#ffc773'},
  {id: 'kitchen_plinth', name: 'Kitchen plinth light', room: 'kitchen', kind: 'strip'},
  {id: 'dining_pendant', name: 'Dining pendant', room: 'living', kind: 'ceiling', color: '#ffc773'},
  {id: 'living_spots', name: 'Living room spots', room: 'living', kind: 'ceiling'},
  {id: 'living_cove', name: 'Living room cove light', room: 'living', kind: 'cove'},
  {id: 'living_floor', name: 'Floor lamp', room: 'living', kind: 'accent'},
  {id: 'hall_line', name: 'Hallway linear light', room: 'hall', kind: 'ceiling'},
  {id: 'study_main', name: 'Study ceiling light', room: 'study', kind: 'ceiling'},
  {id: 'study_desk', name: 'Desk lamp', room: 'study', kind: 'accent'},
  {id: 'study_reading', name: 'Reading floor lamp', room: 'study', kind: 'accent'},
  {id: 'wc_main', name: 'WC light', room: 'wc', kind: 'ceiling'},
  {id: 'bedroom_cove', name: 'Bedroom cove light', room: 'bedroom', kind: 'cove'},
  {id: 'bedroom_wall', name: 'Bedside wall lights', room: 'bedroom', kind: 'accent', color: '#ffd34d'},
  {id: 'bedroom_bed', name: 'Under-bed light', room: 'bedroom', kind: 'strip', h: 0.08, color: '#ffb46b'},
  {id: 'bedroom_reading', name: 'Reading lamp', room: 'bedroom', kind: 'accent'},
  {id: 'closet_main', name: 'Closet light', room: 'closet', kind: 'ceiling'},
  {id: 'bath_spots', name: 'Bathroom spots', room: 'bath', kind: 'ceiling'},
  {id: 'bath_mirror', name: 'Mirror light', room: 'bath', kind: 'accent'},
];
// where the lamps are: all of them, so every fixture shows in the example (homes.test.js runs “Auto-place” on them from scratch too)
const PLACED = [
  {
    id: 'kitchen_spots',
    placed: true,
    room: 'living',
    form: 'spots',
    h: 2.58,
    points: [
      [0.9, 0.6],
      [0.9, 1.5],
      [0.9, 2.4],
      [0.9, 3.3],
      [0.9, 4.2],
    ],
  },
  {
    id: 'kitchen_island',
    placed: true,
    room: 'living',
    form: 'pendant',
    h: 1.85,
    points: [
      [2.35, 1.85],
      [2.35, 2.45],
      [2.35, 3.05],
    ],
  },
  {
    id: 'dining_pendant',
    placed: true,
    room: 'living',
    form: 'pendant',
    shade: 'globe',
    h: 1.6,
    points: [[5.3, 2.45]],
  },
  {
    id: 'kitchen_plinth',
    placed: true,
    room: 'living',
    form: 'strip',
    opt: 'plinth',
    h: 0.04,
    segments: [
      [
        [0.57, 0.07],
        [0.57, 4.83],
      ],
    ],
  },
  {
    id: 'living_spots',
    placed: true,
    room: 'living',
    form: 'spots',
    h: 2.58,
    points: [
      [7.9, 1.1],
      [10.2, 1.1],
      [7.9, 3.8],
      [10.2, 3.8],
    ],
  },
  {
    id: 'living_cove',
    placed: true,
    room: 'living',
    segments: [
      [
        [3.85, 4.82],
        [11.12, 4.82],
      ],
    ],
  }, // along the back wall: the near walls are cut away in 3D
  {
    id: 'living_floor',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[10.72, 0.38]],
  },
  {
    id: 'hall_line',
    placed: true,
    room: 'hall',
    form: 'line',
    h: 2.58,
    segments: [
      [
        [3.65, 5.5],
        [3.65, 9.2],
      ],
    ],
  },
  {id: 'study_main', placed: true, room: 'study', points: [[1.45, 6.45]]},
  {
    id: 'study_reading',
    placed: true,
    room: 'study',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[2.62, 7.6]],
  },
  // a ceiling cove all around: placed here, “Auto-place” would put it under the bed (the name starts with “Bed”)
  {
    id: 'bedroom_cove',
    placed: true,
    room: 'bedroom',
    segments: [
      [
        [5.08, 5.08],
        [8.62, 5.08],
      ],
      [
        [8.62, 5.08],
        [8.62, 9.62],
      ],
      [
        [8.62, 9.62],
        [5.08, 9.62],
      ],
      [
        [5.08, 9.62],
        [5.08, 5.08],
      ],
    ],
  },
  {
    id: 'bedroom_wall',
    placed: true,
    room: 'bedroom',
    form: 'wall',
    h: 1.2,
    points: [
      [5.13, 6.7],
      [5.13, 9],
    ],
  },
  {
    id: 'bedroom_reading',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[8.42, 9.45]],
  },
  {id: 'study_desk', placed: true, room: 'study', form: 'lamp', opt: 'table', h: 1.17, points: [[0.2, 5.85]]},
  {id: 'wc_main', placed: true, room: 'wc', points: [[1.45, 8.85]]},
  {
    id: 'bedroom_bed',
    placed: true,
    room: 'bedroom',
    form: 'strip',
    opt: 'bed',
    h: 0.08,
    segments: [
      [
        [5.3, 7.01],
        [7.09, 7.01],
      ],
      [
        [7.09, 7.01],
        [7.09, 8.69],
      ],
      [
        [7.09, 8.69],
        [5.3, 8.69],
      ],
    ],
  },
  {id: 'closet_main', placed: true, room: 'closet', points: [[10, 6.05]]},
  {id: 'bath_mirror', placed: true, room: 'bath', form: 'wall', h: 1.93, points: [[9.7, 7.33]]},
  {
    id: 'bath_spots',
    placed: true,
    room: 'bath',
    form: 'spots',
    h: 2.58,
    points: [
      [9.5, 8.2],
      [10.7, 8.2],
      [10.7, 9.1],
    ],
  },
];

export default async function () {
  const HA = {areas: HA_AREAS, lights: LIGHTS.map(haLight)};
  // Sensors: room air in the living room (CO₂ too), the kitchen zone, the bedroom (CO₂ high after the night), the study and the bathroom;
  // a light level sensor by the sofa; the fridge is not room air; diagnostic ones (battery, the router's CPU); energy meters
  const S = sensorKit(),
    add = S.add;
  add('living', 'living_air', 'Living room air Temperature', 'temperature', '°C', 21.8);
  add('living', 'living_air', 'Living room air Humidity', 'humidity', '%', 42);
  add('living', 'living_air', 'Living room air CO2', 'carbon_dioxide', 'ppm', 640);
  add('living', 'living_lux', 'Living room light level', 'illuminance', 'lx', 410);
  add('kitchen', 'kitchen_th', 'Kitchen sensor Temperature', 'temperature', '°C', 22.6);
  add('kitchen', 'kitchen_th', 'Kitchen sensor Humidity', 'humidity', '%', 46);
  add('kitchen', 'fridge', 'Fridge Temperature', 'temperature', '°C', 3.9);
  add('bedroom', 'bedroom_air', 'Bedroom air Temperature', 'temperature', '°C', 20.4);
  add('bedroom', 'bedroom_air', 'Bedroom air Humidity', 'humidity', '%', 45);
  add('bedroom', 'bedroom_air', 'Bedroom air CO2', 'carbon_dioxide', 'ppm', 980);
  add('bedroom', 'bedroom_air', 'Bedroom air Battery', 'battery', '%', 72, {cat: 'diagnostic'});
  add('study', 'study_th', 'Study sensor Temperature', 'temperature', '°C', 21.2);
  add('study', 'study_th', 'Study sensor Humidity', 'humidity', '%', 41);
  add('bath', 'bath_th', 'Bathroom sensor Temperature', 'temperature', '°C', 24.1);
  add('bath', 'bath_th', 'Bathroom sensor Humidity', 'humidity', '%', 61);
  add('hall', 'router', 'Router CPU temperature', 'temperature', '°C', 52, {cat: 'diagnostic'});
  add(null, 'home_meter', 'Main meter Energy', 'energy', 'kWh', 11408.3, {daily: 7.9, shape: 'home'});
  add('kitchen', 'fridge', 'Fridge Energy', 'energy', 'kWh', 702.4, {daily: 0.8, shape: 'flat'});
  add('kitchen', 'dishwasher', 'Dishwasher Energy', 'energy', 'kWh', 455.1, {daily: 0.7, shape: 'evening'});
  add('wc', 'washer', 'Washing machine Energy', 'energy', 'kWh', 488.2, {daily: 0.6, shape: 'day'});
  add('wc', 'dryer', 'Dryer Energy', 'energy', 'kWh', 612.5, {daily: 0.8, shape: 'day'});
  add('living', 'tv_plug', 'TV Energy', 'energy', 'kWh', 266.9, {daily: 0.35, shape: 'evening'});
  Object.assign(HA, {sensors: S.sensors, states: S.states});
  // Devices: split air conditioners in the living room (heating) and the bedroom (off); underfloor heating in the living room and the
  // bathroom; the HA curtains on the sofa and dining windows (sorted by name, left to right from inside), bedroom curtains, a study blind;
  // the front door and the bedroom and study windows; leak sensors at the sink, in the bathroom and under the washer, the water valve
  const K = deviceKit();
  K.ac('living_ac', 'Living room AC', 'living', 'heat', 22, 21.8);
  K.ac('bedroom_ac', 'Bedroom AC', 'bedroom', 'off', 20, 20.4);
  K.thermostat('living_floor_heating', 'Living room underfloor heating', 'living', 22, 21.8);
  K.thermostat('bath_floor', 'Bathroom underfloor heating', 'bath', 26, 24.1);
  K.cover('living_curtains', 'Living room curtains', 'living', 'curtain', 100);
  K.cover('living_sheers', 'Living room sheer curtains', 'living', 'curtain', 100);
  K.cover('bedroom_curtains', 'Bedroom curtains', 'bedroom', 'curtain', 100);
  K.cover('study_blind', 'Study blind', 'study', 'blind', 70);
  K.contact('front_door', 'Front door', 'hall', 'door', false);
  K.contact('bedroom_window', 'Bedroom window', 'bedroom', 'window', false);
  K.contact('study_window', 'Study window', 'study', 'window', false);
  K.leak('leak_sink', 'Leak under the sink', 'kitchen', 88);
  K.leak('leak_bath', 'Bathroom leak', 'bath', 74);
  K.leak('leak_washer', 'Leak under the washer', 'wc', 92);
  K.valve('water_main', 'Water shut-off valve', 'wc');
  K.camera('doorbell', 'Doorbell camera', 'hall');
  K.vacuum('robot', 'Robot vacuum', 'hall');
  K.favorites([
    ['scene.evening', 'Evening', 'living', '2026-11-07T16:45:00Z'],
    ['scene.dinner', 'Dinner', 'living', '2026-11-07T19:05:00Z'],
    ['scene.movie', 'Movie', 'living', '2026-11-06T21:10:00Z'],
    ['script.good_night', 'Good night', null, 'off'],
    ['script.leave_home', 'Leave home', null, 'off'],
    ['switch.towel_rail', 'Towel rail', 'bath', 'on'],
    ['lock.front_door', 'Front door lock', 'hall', 'locked'],
  ]);
  Object.assign(HA, {devices: K.devices, entities: K.entities, extra: K.extra});
  HA.stats = stats(['sensor.home_meter_energy'], ['fridge', 'dishwasher', 'washer', 'dryer', 'tv_plug'], {
    'climate.bedroom_ac': {hours: 2, drops: 3},
    'binary_sensor.leak_washer': {hours: 0.5, drops: 1},
  });
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
