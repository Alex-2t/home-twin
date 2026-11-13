// Example home 13 (D-062): a Japandi apartment, about 86 m², one floor. Light oak, linen and sand, sage and a few black accents,
// low furniture and many plants. Living room with the dining area by a wide opening to the kitchen, a reading corner by the window;
// bedroom with a low platform bed; a small study with the desk at the window; bathroom with a freestanding tub and a walk-in shower;
// entry hall with a bench. Made up: nobody's home. Coordinates are metres, x is east, y is north. Rooms are separated by 10 cm walls;
// the editor adds the exterior walls itself. The wall face is 5 cm inside a room's outline, so items stand with their backs 5 cm in.
// A door between two rooms sits 1 cm off the wall middle towards the room its leaf swings into.
// The default 3D view looks from the south-east: the living room and the bedroom sit on the south side, their feature walls
// (the slatted media wall, the headboard wall) face the camera, and the kitchen shows through the wide opening.
import {door, win, F, haLight, sensorKit, deviceKit, stats, WEATHER, worktop} from '../kit.ts';
import type {DemoHomeSource, DemoLight, DemoPlan, DemoPlanLight, DemoRoom} from '../kit.ts';
import type {DemoHaData, FurnitureItem, LooseOpening, Point} from '../../src/core/types.ts';

const ROOMS: DemoRoom[] = [
  {
    id: 'living',
    short: 'Living room',
    polygon: [
      [4.1, 0],
      [11.1, 0],
      [11.1, 4.4],
      [4.1, 4.4],
    ],
  },
  {
    id: 'bedroom',
    short: 'Bedroom',
    polygon: [
      [0, 0],
      [4, 0],
      [4, 4.4],
      [0, 4.4],
    ],
  },
  {
    id: 'study',
    short: 'Study',
    polygon: [
      [0, 4.5],
      [2.6, 4.5],
      [2.6, 8],
      [0, 8],
    ],
  },
  {
    id: 'hall',
    short: 'Entry hall',
    polygon: [
      [2.7, 4.5],
      [5, 4.5],
      [5, 8],
      [2.7, 8],
    ],
  },
  {
    id: 'bathroom',
    short: 'Bathroom',
    polygon: [
      [5.1, 4.5],
      [7.8, 4.5],
      [7.8, 8],
      [5.1, 8],
    ],
  },
  {
    id: 'kitchen',
    short: 'Kitchen',
    polygon: [
      [7.9, 4.5],
      [11.1, 4.5],
      [11.1, 8],
      [7.9, 8],
    ],
  },
];

const open = (a: Point, b: Point, top = 2.1): LooseOpening => ({...door(a, b, top), leaf: false}); // a doorway with no leaf
const OPENINGS: LooseOpening[] = [
  door([3.45, 8], [4.35, 8]), // front door, from the stair landing on the north
  door([2.95, 4.44], [3.75, 4.44]), // hall ↔ bedroom, opens into the bedroom
  open([4.15, 4.44], [4.95, 4.44]), // hall ↔ living room, a doorway
  door([2.64, 5], [2.64, 5.8]), // hall ↔ study, opens into the study
  door([5.06, 4.75], [5.06, 5.45]), // hall ↔ bathroom, opens into the bathroom
  open([8.2, 4.45], [10.2, 4.45], 2.3), // living room ↔ kitchen, a wide opening by the dining table
  win([5.4, 0], [7, 0]), // living room, the lounge
  win([9.4, 0], [10.8, 0]), // living room, the reading corner
  win([11.1, 2.4], [11.1, 3.8]), // living room, by the dining table
  win([1.2, 0], [2.8, 0]), // bedroom
  win([0.6, 8], [2, 8]), // study, over the desk
  win([11.1, 6.55], [11.1, 7.55], 1.05, 2.15), // kitchen, over the sink
  win([5.85, 8], [7.05, 8], 1.15, 2.1), // bathroom, above the bathtub
];

const FV = (v: string, ...a: Parameters<typeof F>): FurnitureItem => ({...F(...a), v}); // an item in a catalog variant
const FZ = (z: number, ...a: Parameters<typeof F>): FurnitureItem => ({...F(...a), z}); // an item standing or hung at height z
const FVZ = (v: string, z: number, ...a: Parameters<typeof F>): FurnitureItem => ({...F(...a), v, z});
const FURNITURE: FurnitureItem[] = [
  // living room, lounge: a low oak media bench with the TV and books on the west wall (the slatted media wall), a low linen sofa facing it,
  // a round coffee table with candles on a sand rug, a white pouf and a graphite floor cushion, a black side table, a fig tree by the bench
  F('l1', 'tvStand', 4.35, 2, 90, 2.2, 0.4, 0.42, 'oak'),
  F('l2', 'tv', 4.18, 2, 90, 1.23, 0.06, 0.71),
  FVZ('eucalyptus', 0.42, 'l3', 'floorVase', 4.35, 2.85, 0, 0.25, 0.25, 0.55, 'sand'),
  F('l4', 'rug', 6.25, 2, 90, 3.2, 2.5, 0.012, 'sand'),
  FV('round', 'l5', 'tableCoffee', 6.05, 2, 0, 0.95, 0.95, 0.32, 'oak'),
  FVZ('candles', 0.32, 'l29', 'decor', 6, 1.95, 30, 0.32, 0.14, 0.22, 'sand'),
  FVZ('books', 0.42, 'l30', 'decor', 4.35, 1.15, 90, 0.3, 0.22, 0.2, 'sand'),
  F('l6', 'loungeSofa', 7.5, 2, 270, 2.4, 0.95, 0.72, 'linen'),
  F('l7', 'ottoman', 6.05, 0.95, 0, 0.5, 0.5, 0.38, 'white'),
  F('l8', 'ottoman', 6.05, 3, 0, 0.55, 0.55, 0.34, 'graphite'),
  FV('round', 'l9', 'sideTable', 7.45, 0.45, 0, 0.45, 0.45, 0.5, 'black'),
  FV('ficus', 'l10', 'pottedPlant', 4.5, 0.4, 0, 0.6, 0.6, 1.7, 'white'),
  // reading corner by the south-east window: an olive armchair turned to the room, a linen floor lamp, a monstera
  F('l11', 'loungeChair', 10.15, 1, 225, 0.8, 0.8, 0.78, 'olive'),
  F('l12', 'lampRoundFloor', 10.75, 0.4, 0, 0.4, 0.4, 1.6, 'linen'),
  FV('monstera', 'l13', 'pottedPlant', 10.6, 2, 0, 0.8, 0.8, 1, 'sand'),
  // dining: a round oak table for four by the east window and the kitchen opening, a eucalyptus vase on it, a palm in the corner
  F('l14', 'tableRound', 9.5, 3.05, 0, 1.1, 1.1, 0.75, 'oak'),
  FVZ('eucalyptus', 0.75, 'l15', 'floorVase', 9.5, 3.05, 0, 0.2, 0.2, 0.45, 'white'),
  F('l16', 'chairCushion', 9.5, 3.8, 0, 0.45, 0.52, 0.82, 'oak'),
  F('l17', 'chairCushion', 9.5, 2.3, 180, 0.45, 0.52, 0.82, 'oak'),
  F('l18', 'chairCushion', 8.75, 3.05, 90, 0.45, 0.52, 0.82, 'oak'),
  F('l19', 'chairCushion', 10.25, 3.05, 270, 0.45, 0.52, 0.82, 'oak'),
  FV('palm', 'l20', 'pottedPlant', 10.75, 4, 0, 0.6, 0.6, 1.5, 'white'),
  // the north wall between the doorways: a low oak sideboard with a black vase and a bowl, a picture above it, pampas in a floor vase, the air conditioner
  F('l21', 'sideboard', 6.45, 4.125, 0, 1.8, 0.45, 0.6, 'oak'),
  FVZ('bowl', 0.6, 'l31', 'decor', 6.95, 4.1, 0, 0.32, 0.32, 0.14, 'sand'),
  FVZ('empty', 0.6, 'l22', 'floorVase', 5.9, 4.15, 0, 0.18, 0.18, 0.35, 'black'),
  FVZ('art', 1.05, 'l23', 'picture', 6.45, 4.335, 0, 1, 0.03, 0.7, 'oak'),
  FV('pampas', 'l24', 'floorVase', 7.75, 4.1, 0, 0.4, 0.4, 1.2, 'sand'),
  F('l25', 'aircon', 7.75, 4.24, 0, 0.8, 0.22, 0.29),
  // linen curtains on the three windows
  F('l26', 'curtains', 6.2, 0.12, 180, 2, 0.14, 2.5, 'linen'),
  F('l27', 'curtains', 10.1, 0.12, 180, 1.8, 0.14, 2.5, 'linen'),
  F('l28', 'curtains', 10.98, 3.1, 270, 1.8, 0.14, 2.5, 'linen'),

  // kitchen: oak fronts in an L — a tall pantry and base units along the north wall with the cooktop under a black hood and open oak
  // shelves on both sides of it, a fruit bowl on the worktop, the sink under the east window, a dishwasher, the fridge by the opening; a sage cart and a palm by the west wall
  F('k1', 'kitchenTall', 8.25, 7.65, 0, 0.6, 0.6, 2.2, 'oak'),
  F('k2', 'kitchenBase', 8.85, 7.65, 0, 0.6, 0.6, 0.9, 'oak'),
  FV('oven', 'k3', 'kitchenHob', 9.45, 7.65, 0, 0.6, 0.6, 0.9, 'oak'),
  F('k4', 'kitchenBase', 10.05, 7.65, 0, 0.6, 0.6, 0.9, 'oak'),
  F('k5', 'kitchenBase', 10.7, 7.65, 0, 0.7, 0.6, 0.9, 'oak'),
  F('k6', 'hood', 9.45, 7.7, 0, 0.6, 0.5, 0.9, 'black'),
  FZ(1.45, 'k7', 'wallShelf', 8.85, 7.84, 0, 0.5, 0.22, 0.03, 'oak'),
  FZ(1.8, 'k8', 'wallShelf', 8.85, 7.84, 0, 0.5, 0.22, 0.03, 'oak'),
  FZ(1.45, 'k9', 'wallShelf', 10.4, 7.84, 0, 1.2, 0.22, 0.03, 'oak'),
  FZ(1.8, 'k10', 'wallShelf', 10.4, 7.84, 0, 1.2, 0.22, 0.03, 'oak'),
  F('k11', 'kitchenSink', 10.75, 7.05, 270, 0.6, 0.6, 0.9, 'oak'),
  F('k12', 'dishwasher', 10.75, 6.45, 270, 0.6, 0.6, 0.9, 'oak'),
  F('k13', 'kitchenBase', 10.75, 5.85, 270, 0.6, 0.6, 0.9, 'oak'),
  F('k14', 'fridge', 10.725, 5.2, 270, 0.6, 0.65, 1.85, 'white'),
  F('k15', 'coffee', 10.85, 5.85, 270, 0.25, 0.4, 0.38, 'black'),
  FVZ('bowl', 0.9, 'k20', 'decor', 10.05, 7.7, 0, 0.32, 0.32, 0.14, 'white'),
  F('k16', 'kitchenCart', 8.125, 6.4, 90, 0.45, 0.35, 0.8, 'sage'),
  FV('palm', 'k17', 'pottedPlant', 8.35, 5.45, 0, 0.7, 0.7, 1.5, 'sand'),
  FZ(1.35, 'k18', 'picture', 7.965, 6.4, 90, 0.5, 0.03, 0.7, 'black'),
  FVZ('roller', 1.01, 'k19', 'blind', 11.02, 7.05, 270, 0.98, 0.06, 1.24, 'linen'),

  // bedroom: a low oak platform bed with a wooden headboard against the west wall (the accent wall), nightstands, a picture above the bed,
  // a linen rug, a bench at the foot; a built-in wardrobe in linen-beige along the north wall; an oak dresser with books and a round black mirror
  // and the air conditioner on the east wall; a monstera and a eucalyptus vase
  FV('wood', 'b1', 'bed', 1.1, 2, 90, 1.8, 2.1, 0.85, 'oak'),
  F('b2', 'nightstand', 0.25, 0.6, 90, 0.5, 0.4, 0.45, 'oak'),
  F('b3', 'nightstand', 0.25, 3.4, 90, 0.5, 0.4, 0.45, 'oak'),
  FVZ('art', 1.25, 'b4', 'picture', 0.065, 2, 90, 1, 0.03, 0.6, 'oak'),
  F('b5', 'rug', 1.5, 2, 90, 2.8, 2.4, 0.012, 'linen'),
  F('b6', 'bench', 2.4, 2, 90, 1.2, 0.4, 0.42, 'oak'),
  FV('hinged', 'b7', 'wardrobeRun', 1.25, 4.05, 0, 2.4, 0.6, 2.4, 'beige'),
  F('b8', 'dresser', 3.725, 1.6, 270, 1.2, 0.45, 0.75, 'oak'),
  FVZ('books', 0.75, 'b15', 'decor', 3.73, 1.15, 270, 0.3, 0.22, 0.2, 'white'),
  FVZ('round', 1.2, 'b9', 'wallMirror', 3.935, 1.6, 270, 0.6, 0.03, 0.6, 'black'),
  FVZ('eucalyptus', 0.75, 'b10', 'floorVase', 3.75, 1.95, 0, 0.25, 0.25, 0.5, 'white'),
  F('b11', 'aircon', 3.84, 1.6, 270, 0.8, 0.22, 0.29),
  FV('monstera', 'b12', 'pottedPlant', 3.55, 0.45, 0, 0.7, 0.7, 0.95, 'sand'),
  FV('eucalyptus', 'b13', 'floorVase', 2.75, 4.1, 0, 0.35, 0.35, 1, 'black'),
  F('b14', 'curtains', 2, 0.12, 180, 2, 0.14, 2.5, 'linen'),

  // study: an oak desk at the north window with a monitor, books and a black chair, a styled bookcase on the west wall, a sand daybed for reading,
  // a round olive rug, a picture, a snake plant, a linen roller blind
  F('s1', 'desk', 1.3, 7.625, 0, 1.4, 0.65, 0.74, 'oak'),
  FVZ('books', 0.74, 's10', 'decor', 1.82, 7.7, 0, 0.3, 0.22, 0.2, 'black'),
  FV('stand', 's2', 'monitor', 1.3, 7.8, 0, 0.6, 0.2, 0.42),
  F('s3', 'chairDesk', 1.3, 7.05, 180, 0.6, 0.6, 1, 'black'),
  FV('styled', 's4', 'shelf', 0.225, 6.15, 90, 1.6, 0.35, 2, 'oak'),
  F('s5', 'chaise', 0.95, 4.9, 180, 1.6, 0.7, 0.75, 'sand'),
  FV('round', 's6', 'rug', 1.35, 6.1, 0, 1.4, 1.4, 0.012, 'olive'),
  FZ(1.3, 's7', 'picture', 2.535, 6.6, 270, 0.6, 0.03, 0.8, 'black'),
  FV('snake', 's8', 'pottedPlant', 2.3, 7.7, 0, 0.4, 0.4, 0.85, 'black'),
  FVZ('roller', 0.81, 's9', 'blind', 1.3, 7.92, 0, 1.38, 0.06, 1.69, 'linen'),

  // entry hall: an oak bench with a coat rack above it, a built-in oak wardrobe, a full-length arched mirror by the front door,
  // a graphite runner, a snake plant
  F('h1', 'bench', 2.95, 6.6, 90, 1.2, 0.4, 0.45, 'oak'),
  FV('shelf', 'h2', 'coatHooks', 2.875, 6.6, 90, 1.2, 0.25, 0.35, 'oak'),
  FV('sliding', 'h3', 'wardrobeRun', 4.65, 6.3, 270, 1.4, 0.6, 2.5, 'oak'),
  FVZ('arch', 0.5, 'h4', 'wallMirror', 3.05, 7.935, 0, 0.5, 0.03, 1.4, 'oak'),
  F('h5', 'rug', 3.75, 6.2, 0, 0.8, 2.6, 0.012, 'graphite'),
  FV('snake', 'h6', 'pottedPlant', 4.7, 7.7, 0, 0.4, 0.4, 0.85, 'sand'),

  // bathroom: a freestanding oval tub under the window, a walk-in shower with a black screen, a wall-hung oak vanity with a round black mirror,
  // a wall-hung toilet, a black towel warmer, the washing machine with an oak shelf above it, a laundry basket, a stool, a snake plant, a mat
  FV('oval', 'x1', 'bathFree', 6.45, 7.45, 0, 1.7, 0.8, 0.6),
  F('x2', 'walkIn', 7.15, 5, 180, 1.2, 0.9, 2, 'black'),
  FV('wall', 'x3', 'vanity', 7.5, 6.25, 270, 1, 0.5, 0.85, 'oak'),
  FVZ('round', 1.15, 'x4', 'wallMirror', 7.735, 6.25, 270, 0.7, 0.03, 0.7, 'black'),
  FV('wall', 'x5', 'toilet', 5.425, 6.35, 90, 0.38, 0.55, 0.8, 'white'),
  FV('ladder', 'x6', 'towelRail', 5.2, 5.8, 90, 0.5, 0.1, 0.8, 'black'),
  F('x7', 'washer', 6.15, 4.825, 180, 0.6, 0.55, 0.85, 'white'),
  FZ(1.2, 'x8', 'wallShelf', 6.15, 4.66, 180, 0.6, 0.22, 0.03, 'oak'),
  F('x9', 'laundryBasket', 5.325, 6.9, 90, 0.45, 0.35, 0.55, 'linen'),
  FV('round', 'x10', 'stool', 7.5, 7.3, 0, 0.34, 0.34, 0.45, 'oak'),
  FV('snake', 'x11', 'pottedPlant', 5.38, 7.68, 0, 0.35, 0.35, 0.8, 'white'),
  F('x12', 'rug', 6.45, 6.7, 0, 1, 0.6, 0.012, 'linen'),
];

worktop(FURNITURE, 'white'); // the kitchen's worktop: white quartz

const LIGHTS: DemoLight[] = [
  {id: 'living_pendant', name: 'Paper pendant', room: 'living', kind: 'ceiling'},
  {id: 'living_dining', name: 'Dining pendant', room: 'living', kind: 'ceiling', color: '#ffc773'},
  {id: 'living_cove', name: 'Media wall cove', room: 'living', kind: 'cove'},
  {id: 'living_reading', name: 'Reading floor lamp', room: 'living', kind: 'accent', color: '#ffd9a0'},
  {id: 'living_side', name: 'Side table lamp', room: 'living', kind: 'accent'},
  {id: 'kitchen_spots', name: 'Kitchen spots', room: 'kitchen', kind: 'ceiling'},
  {id: 'kitchen_worktop', name: 'Worktop strip', room: 'kitchen', kind: 'strip'},
  {id: 'kitchen_plinth', name: 'Plinth strip', room: 'kitchen', kind: 'strip', color: '#ffb46b'},
  {id: 'bedroom_main', name: 'Bedroom ceiling light', room: 'bedroom', kind: 'ceiling'},
  {id: 'bedroom_left', name: 'Left bedside lamp', room: 'bedroom', kind: 'accent', color: '#ffd9a0'},
  {id: 'bedroom_right', name: 'Right bedside lamp', room: 'bedroom', kind: 'accent', color: '#ffd9a0'},
  {id: 'bedroom_bed_strip', name: 'Under-bed strip', room: 'bedroom', kind: 'strip', color: '#ffb46b'},
  {id: 'study_main', name: 'Study ceiling light', room: 'study', kind: 'ceiling'},
  {id: 'study_desk', name: 'Desk lamp', room: 'study', kind: 'accent'},
  {id: 'hall_spots', name: 'Hallway spots', room: 'hall', kind: 'ceiling'},
  {id: 'hall_mirror', name: 'Hall mirror light', room: 'hall', kind: 'accent'},
  {id: 'bathroom_spots', name: 'Bathroom spots', room: 'bathroom', kind: 'ceiling'},
  {id: 'bathroom_mirror', name: 'Mirror light', room: 'bathroom', kind: 'accent'},
];
// placed: all of them, so every fixture shows in the example (homes.test.js runs “Auto-place” on them from scratch too) — the pendants,
// the cove over the media wall, the reading, side table and bedside lamps on their furniture, the desk lamp, spots and ceiling lights,
// the strips under the kitchen shelves, along the plinth and under the bed, the two mirror lights.
// (A plain “sconce” in the hall would go to the longest free stretch of wall, which is behind the wardrobe: auto-placement does not look at furniture there.)
const PLACED: DemoPlanLight[] = [
  {id: 'living_pendant', placed: true, room: 'living', form: 'pendant', h: 1.95, points: [[6.05, 2]]},
  {
    id: 'living_dining',
    placed: true,
    room: 'living',
    form: 'pendant',
    shade: 'woven',
    h: 1.6,
    points: [[9.5, 3.05]],
  },
  {
    id: 'living_cove',
    placed: true,
    room: 'living',
    segments: [
      [
        [4.25, 0.2],
        [4.25, 4.2],
      ],
    ],
  },
  {
    id: 'living_reading',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'floor',
    h: 1.45,
    points: [[10.75, 0.4]],
  },
  {
    id: 'kitchen_spots',
    placed: true,
    room: 'kitchen',
    form: 'spots',
    h: 2.58,
    points: [
      [8.75, 6.75],
      [9.85, 6.75],
      [8.75, 5.55],
      [9.85, 5.55],
    ],
  },
  {
    id: 'kitchen_worktop',
    placed: true,
    room: 'kitchen',
    segments: [
      [
        [8.62, 7.86],
        [9.08, 7.86],
      ],
      [
        [9.82, 7.86],
        [10.98, 7.86],
      ],
    ],
  },
  {id: 'bedroom_main', placed: true, room: 'bedroom', points: [[2, 2.2]]},
  {
    id: 'bedroom_left',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'table',
    h: 0.87,
    points: [[0.25, 3.4]],
  },
  {
    id: 'bedroom_right',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'table',
    h: 0.87,
    points: [[0.25, 0.6]],
  },
  {id: 'study_main', placed: true, room: 'study', points: [[1.3, 6.2]]},
  {id: 'study_desk', placed: true, room: 'study', form: 'lamp', opt: 'table', h: 1.1, points: [[0.8, 7.78]]},
  {
    id: 'hall_spots',
    placed: true,
    room: 'hall',
    form: 'spots',
    h: 2.58,
    points: [
      [3.85, 5.2],
      [3.85, 6.35],
      [3.85, 7.5],
    ],
  },
  {
    id: 'bathroom_spots',
    placed: true,
    room: 'bathroom',
    form: 'spots',
    h: 2.58,
    points: [
      [5.95, 6],
      [6.95, 6],
      [7.15, 5],
      [6.45, 7.45],
    ],
  },
  {
    id: 'living_side',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'table',
    h: 0.92,
    points: [[7.45, 0.45]],
  },
  {
    id: 'kitchen_plinth',
    placed: true,
    room: 'kitchen',
    form: 'strip',
    opt: 'plinth',
    h: 0.04,
    segments: [
      [
        [7.97, 7.43],
        [11.03, 7.43],
      ],
      [
        [10.53, 7.33],
        [10.53, 5.57],
      ],
    ],
  },
  {
    id: 'bedroom_bed_strip',
    placed: true,
    room: 'bedroom',
    form: 'strip',
    opt: 'bed',
    h: 0.08,
    segments: [
      [
        [0.3, 1.16],
        [2.09, 1.16],
      ],
      [
        [2.09, 1.16],
        [2.09, 2.84],
      ],
      [
        [2.09, 2.84],
        [0.3, 2.84],
      ],
    ],
  },
  {id: 'hall_mirror', placed: true, room: 'hall', form: 'wall', h: 1.98, points: [[3.05, 7.87]]},
  {id: 'bathroom_mirror', placed: true, room: 'bathroom', form: 'wall', h: 1.93, points: [[7.67, 6.25]]},
];

export default async function (): Promise<DemoHomeSource> {
  const HA: DemoHaData = {
    areas: Object.fromEntries(ROOMS.map(r => [r.id, r.short])),
    lights: LIGHTS.map(haLight),
  };
  // Sensors: an air monitor in the living room (its area is set to it), climate in the bedroom (CO2 high after the night), the study,
  // the kitchen and the bathroom; the fridge is not room air; diagnostic ones (battery, router); energy meters
  const S = sensorKit();
  const add = S.add;
  add('living', 'living_air', 'Living room air Temperature', 'temperature', '°C', 22);
  add('living', 'living_air', 'Living room air Humidity', 'humidity', '%', 46);
  add('living', 'living_air', 'Living room air CO2', 'carbon_dioxide', 'ppm', 740);
  add('living', 'living_air', 'Living room air PM2.5', 'pm25', 'µg/m³', 6);
  add('bedroom', 'bedroom_air', 'Bedroom air Temperature', 'temperature', '°C', 20.6);
  add('bedroom', 'bedroom_air', 'Bedroom air Humidity', 'humidity', '%', 49);
  add('bedroom', 'bedroom_air', 'Bedroom air CO2', 'carbon_dioxide', 'ppm', 1120);
  add('bedroom', 'bedroom_air', 'Bedroom air Battery', 'battery', '%', 72, {cat: 'diagnostic'});
  add('study', 'study_th', 'Study sensor Temperature', 'temperature', '°C', 21.4);
  add('study', 'study_th', 'Study sensor Humidity', 'humidity', '%', 44);
  add('kitchen', 'kitchen_th', 'Kitchen sensor Temperature', 'temperature', '°C', 22.8);
  add('kitchen', 'kitchen_th', 'Kitchen sensor Humidity', 'humidity', '%', 51);
  add('kitchen', 'fridge', 'Fridge Temperature', 'temperature', '°C', 3.9);
  add('bathroom', 'bath_th', 'Bathroom sensor Temperature', 'temperature', '°C', 24.2);
  add('bathroom', 'bath_th', 'Bathroom sensor Humidity', 'humidity', '%', 63);
  add('hall', 'router', 'Router CPU temperature', 'temperature', '°C', 49, {cat: 'diagnostic'});
  add(null, 'home_meter', 'Main meter Energy', 'energy', 'kWh', 11870.4, {daily: 7.2, shape: 'home'});
  add('kitchen', 'fridge', 'Fridge Energy', 'energy', 'kWh', 812.5, {daily: 0.8, shape: 'flat'});
  add('kitchen', 'dishwasher', 'Dishwasher Energy', 'energy', 'kWh', 433.1, {daily: 0.6, shape: 'evening'});
  add('bathroom', 'washer', 'Washing machine Energy', 'energy', 'kWh', 508.7, {daily: 0.5, shape: 'day'});
  add('study', 'desk_pc', 'Computer Energy', 'energy', 'kWh', 690.2, {daily: 1.1, shape: 'day'});
  add('kitchen', 'kettle', 'Kettle Power', 'power', 'W', 0);
  Object.assign(HA, {
    sensors: S.sensors,
    states: S.states,
    areaSensors: {
      living: {
        temperature_entity_id: 'sensor.living_air_temperature',
        humidity_entity_id: 'sensor.living_air_humidity',
      },
    },
  });
  // Devices: air conditioners in the living room (heating) and the bedroom (off); underfloor heating in the bathroom; linen curtains on the
  // living room's three windows and in the bedroom, roller blinds in the study (half down) and the kitchen; the front door, the bedroom window and
  // the study window (open); a doorbell camera, a water valve, leak sensors under the sink and the washer and by the shower; a robot vacuum
  const K = deviceKit();
  K.ac('living_ac', 'Living room AC', 'living', 'heat', 22.5, 22);
  K.ac('bedroom_ac', 'Bedroom AC', 'bedroom', 'off', 21, 20.6);
  K.thermostat('bathroom_floor', 'Underfloor heating', 'bathroom', 27, 24.2);
  K.cover('living_curtains_1', 'Living room curtains 1', 'living', 'curtain', 100);
  K.cover('living_curtains_2', 'Living room curtains 2', 'living', 'curtain', 100);
  K.cover('living_curtains_3', 'Living room curtains 3', 'living', 'curtain', 100);
  K.cover('bedroom_curtains', 'Bedroom curtains', 'bedroom', 'curtain', 100);
  K.cover('study_blind', 'Study roller blind', 'study', 'blind', 60);
  K.cover('kitchen_blind', 'Kitchen roller blind', 'kitchen', 'blind', 100);
  K.contact('front_door', 'Front door', 'hall', 'door', false);
  K.contact('bedroom_window', 'Bedroom window', 'bedroom', 'window', false);
  K.contact('study_window', 'Study window', 'study', 'window', true);
  K.camera('doorbell', 'Doorbell camera', 'hall');
  K.valve('water_main', 'Water shut-off valve', 'kitchen');
  K.leak('leak_sink', 'Leak under the sink', 'kitchen', 88);
  K.leak('leak_washer', 'Leak under the washer', 'bathroom', 74);
  K.leak('leak_shower', 'Shower leak', 'bathroom', 93);
  K.vacuum('robot', 'Robot vacuum', 'hall');
  K.favorites([
    ['scene.morning', 'Morning', 'kitchen', '2026-11-08T07:10:00Z'],
    ['scene.reading', 'Reading', 'living', '2026-11-07T21:05:00Z'],
    ['scene.dinner', 'Dinner', 'living', '2026-11-07T18:50:00Z'],
    ['script.good_night', 'Good night', null, 'off'],
    ['switch.kettle', 'Kettle', 'kitchen', 'off'],
    ['switch.towel_rail', 'Towel rail', 'bathroom', 'on'],
    ['switch.bedroom_humidifier', 'Bedroom humidifier', 'bedroom', 'on'],
    ['lock.front_door', 'Front door lock', 'hall', 'locked'],
  ]);
  Object.assign(HA, {devices: K.devices, entities: K.entities, extra: K.extra});
  // “Connectivity”: the bedroom AC drops off Wi-Fi now and then, the study sensor once for a few minutes
  HA.stats = stats(['sensor.home_meter_energy'], ['fridge', 'dishwasher', 'washer', 'desk_pc'], {
    'climate.bedroom_ac': {hours: 2, drops: 3},
    'sensor.study_th_temperature': {hours: 0.1, drops: 1},
  });
  HA.weather = WEATHER;
  const DEMO: DemoPlan = {
    version: 1,
    units: 'm',
    rooms: ROOMS.map(r => ({id: r.id, name: r.short, polygon: r.polygon})),
    openings: OPENINGS,
    furniture: FURNITURE,
    lights: PLACED,
  };
  return {HA, DEMO, DEMO_UNDERLAY: null};
}
