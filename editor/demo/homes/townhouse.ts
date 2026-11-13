// @ts-nocheck
// Typical home 8 (docs/research/typical-homes.md, D-030): a terraced house, ground floor only — the editor is single-floor.
// Street side to the south: hallway with an enclosed staircase, the meter cupboard and a guest toilet; one long kitchen-dining-living
// room from the street to the garden; a fenced back garden with a shed. About 50 m² indoors. Made up: nobody's house.
// Design concept: an English townhouse. Oak floors and oak furniture, a sage shaker kitchen with white metro tiles, a white brick
// party wall hung with botanical prints, a sage-panelled chimney wall with the fireplace, linen and sand for the soft pieces, navy as
// the accent (the armchairs, the hall runner, a bike), terracotta pots and plants everywhere, black metal. The long room reads as
// three zones: the kitchen at the street window, the dining table under three pendants, the sitting room by the garden doors.
// The hall has sage panelling and a checkerboard floor; the guest toilet is a jewel box in art deco wallpaper. The garden is an
// outdoor room on a lawn: a teak dining set on a gray outdoor rug, loungers on the grass, a raised bed, big pots, string lights.
// The garden is a room with walls (exterior walls cannot be removed, D-021): its side fences are wide full-height openings.
// Metres, x east, y north; the wall face is 5 cm inside a room's outline, so items stand with their backs 5 cm in.
import {door, win, F, haLight, sensorKit, deviceKit, stats, WEATHER, worktop} from '../kit.ts';

const FV = (v, ...a) => ({...F(...a), v}); // an item in a catalog variant
const Z = (z, f) => ({...f, z}); // an item at its own height above the floor

// Kitchen, dining and living are one open room and one HA area.
// A door between two rooms sits 1 cm off the wall middle towards the room its leaf swings into.
const ROOMS = [
  {
    id: 'living',
    short: 'Kitchen-living room',
    polygon: [
      [2.3, 0],
      [5.4, 0],
      [5.4, 9.6],
      [0, 9.6],
      [0, 4.5],
      [2.3, 4.5],
    ],
  },
  {
    id: 'hall',
    short: 'Hallway',
    polygon: [
      [1, 0],
      [2.2, 0],
      [2.2, 4.4],
      [0, 4.4],
      [0, 1.6],
      [1, 1.6],
    ],
  },
  {
    id: 'toilet',
    short: 'Toilet',
    polygon: [
      [0, 0],
      [0.9, 0],
      [0.9, 1.5],
      [0, 1.5],
    ],
  },
  {
    id: 'garden',
    short: 'Garden',
    polygon: [
      [0, 9.8],
      [5.4, 9.8],
      [5.4, 14.1],
      [3, 14.1],
      [3, 16.3],
      [0, 16.3],
    ],
  },
  {
    id: 'shed',
    short: 'Shed',
    polygon: [
      [3.1, 14.2],
      [5.4, 14.2],
      [5.4, 16.3],
      [3.1, 16.3],
    ],
  },
];
// The home's own style (kit.ts: STYLES has the shape): limewashed walls, the chimney wall (behind the TV) in sage panelling, white metro
// tiles behind the kitchen, art deco wallpaper in the toilet, oak planks, a checkerboard hall; the party wall behind the sofa is white
// brick (room edge 3), the shed is lined with timber
const STYLE = {
  wall: {
    living: {k: 'plasterLime', tint: '#d3cdc2'},
    bed: {k: 'wallpaperLinen', tint: '#c3c8ba'},
    kitchen: '#d2cdc4',
    hall: {k: 'panelsClassic', tint: '#b5bca9'},
    kids: '#b4c0c8',
    office: {k: 'plasterLime', tint: '#c9c3b8'},
  },
  bed: {k: 'paintSage', tint: '#7f8b73'},
  media: {k: 'panelsClassic', tint: '#9ba590'},
  sofa: {k: 'brickWhite'},
  splash: {k: 'tileSubway'},
  bath: {k: 'wallpaperDeco'},
  office: {k: 'slatsOak'},
  floor: {
    living: 'wood',
    bed: 'wood',
    kids: 'wood',
    hall: 'checker',
    office: 'wood',
    kitchen: 'wood',
    bath: 'checker',
  },
};
const FINISH = {
  living: {wf: [null, null, null, {k: 'brickWhite'}, null, null]},
  shed: {wall: 'panelsWood', floor: 'concrete'},
  garden: {floor: 'grass'},
};

const OPENINGS = [
  door([1.1, 0], [2, 0], 2.2), // front door
  door([0.96, 0.65], [0.96, 1.35]), // hallway ↔ toilet, opens into the hallway
  door([1.1, 4.46], [1.95, 4.46]), // hallway ↔ living room
  win([0.25, 0], [0.65, 0], 1.4, 2), // toilet
  win([3.1, 0], [4.7, 0], 0.95, 2.3), // kitchen, over the sink
  door([0.8, 9.7], [3.2, 9.7], 2.3), // sliding door to the garden
  win([3.6, 9.7], [5, 9.7], 0.6, 2.3), // living room, onto the garden
  door([3.04, 15.2], [3.04, 16]), // shed, opens outwards
  win([3.6, 14.15], [4.4, 14.15], 1.2, 1.9), // shed window
  door([0.5, 16.3], [1.4, 16.3]), // back gate
  door([0, 10.2], [0, 15.9], 2.6),
  door([5.4, 10.2], [5.4, 13.7], 2.6), // garden side fences: open, no wall
];

const custom = (id, name, x, y, rot, w, d, h, color, v) => ({
  ...F(id, 'custom', x, y, rot, w, d, h, color),
  name,
  ...(v ? {v} : {}),
});
const FURNITURE = [
  // kitchen at the street window, sage shaker fronts in an L: a double sink centred under the window between the dishwasher and a
  // long base, a range cooker under a black chimney hood on the west wall, a pantry and an integrated fridge column at its end;
  // open oak shelves with cookbooks and vases, a sage wall cabinet, a coffee machine, a fruit bowl and a herb pot on the worktop,
  // a white glass-door dresser on the east wall, a terracotta runner, a linen roller blind
  F('k1', 'kitchenBase', 2.6, 0.35, 180, 0.5, 0.6, 0.9, 'sage'),
  F('k2', 'dishwasher', 3.15, 0.35, 180, 0.6, 0.6, 0.9, 'sage'),
  FV('two', 'k3', 'kitchenSink', 3.9, 0.35, 180, 0.9, 0.6, 0.9, 'sage'),
  F('k4', 'kitchenBase', 4.85, 0.35, 180, 1, 0.6, 0.9, 'sage'),
  F('k5', 'kitchenBase', 2.65, 0.95, 90, 0.6, 0.6, 0.9, 'sage'),
  FV('oven', 'k6', 'kitchenHob', 2.65, 1.7, 90, 0.9, 0.6, 0.9, 'sage'),
  F('k7', 'kitchenBase', 2.65, 2.4, 90, 0.5, 0.6, 0.9, 'sage'),
  FV('doors', 'k8', 'kitchenTall', 2.65, 2.95, 90, 0.6, 0.6, 2.2, 'sage'),
  FV('doors', 'k9', 'kitchenTall', 2.65, 3.55, 90, 0.6, 0.6, 2.2, 'sage'),
  FV('dome', 'k10', 'hood', 2.6, 1.7, 90, 0.9, 0.5, 0.9, 'black'),
  Z(1.5, F('k11', 'wallShelf', 2.49, 0.95, 90, 0.5, 0.28, 0.04, 'oak')),
  Z(1.9, F('k12', 'wallShelf', 2.49, 0.95, 90, 0.5, 0.28, 0.04, 'oak')),
  F('k13', 'kitchenWall', 2.525, 2.4, 90, 0.5, 0.35, 0.7, 'sage'),
  Z(1.5, F('k14', 'wallShelf', 5.025, 0.19, 180, 0.55, 0.28, 0.04, 'oak')),
  Z(1.9, F('k15', 'wallShelf', 5.025, 0.19, 180, 0.55, 0.28, 0.04, 'oak')),
  F('k16', 'coffee', 2.55, 0.95, 90, 0.25, 0.38, 0.38, 'black'),
  Z(0.9, FV('bowl', 'k17', 'decor', 4.95, 0.38, 0, 0.32, 0.32, 0.14, 'white')),
  Z(0.9, FV('snake', 'k18', 'pottedPlant', 4.55, 0.22, 0, 0.25, 0.25, 0.4, 'terracotta')),
  Z(1.54, FV('books', 'k19', 'decor', 2.49, 0.95, 90, 0.3, 0.2, 0.2, 'sand')),
  Z(1.94, FV('vase', 'k20', 'decor', 2.49, 1.05, 0, 0.16, 0.16, 0.36, 'terracotta')),
  Z(1.54, FV('vase', 'k21', 'decor', 4.9, 0.19, 0, 0.16, 0.16, 0.3, 'white')),
  Z(1.94, FV('books', 'k22', 'decor', 5.1, 0.19, 0, 0.3, 0.2, 0.2, 'oak')),
  F('k23', 'displayCabinet', 5.15, 2.4, 270, 1, 0.4, 2, 'white'),
  F('k24', 'rug', 3.45, 2.1, 90, 2.4, 0.8, 0.012, 'terracotta'),
  FV('roller', 'k25', 'blind', 3.9, 0.08, 180, 1.7, 0.06, 1.3, 'linen'),
  // dining: an oak table for six under three pendants, black Windsor-style chairs, eucalyptus on the table; an oak sideboard on the
  // brick wall with two botanical prints, candles and a vase; a fiddle-leaf fig where the kitchen meets the dining area
  F('d1', 'diningTable', 3.5, 5, 0, 1.8, 0.9, 0.75, 'oak'),
  F('d2', 'chairCushion', 3.05, 4.38, 180, 0.45, 0.52, 0.85, 'graphite'),
  F('d3', 'chairCushion', 3.95, 4.38, 180, 0.45, 0.52, 0.85, 'graphite'),
  F('d4', 'chairCushion', 3.05, 5.62, 0, 0.45, 0.52, 0.85, 'graphite'),
  F('d5', 'chairCushion', 3.95, 5.62, 0, 0.45, 0.52, 0.85, 'graphite'),
  F('d6', 'chairCushion', 2.25, 5, 90, 0.45, 0.52, 0.85, 'graphite'),
  F('d7', 'chairCushion', 4.75, 5, 270, 0.45, 0.52, 0.85, 'graphite'),
  Z(0.75, FV('eucalyptus', 'd8', 'floorVase', 3.5, 5, 0, 0.22, 0.22, 0.5, 'white')),
  F('d9', 'sideboard', 0.275, 5.3, 90, 1.4, 0.45, 0.8, 'oak'),
  Z(1.3, FV('art', 'd10', 'picture', 0.065, 4.95, 90, 0.45, 0.03, 0.6, 'oak')),
  Z(1.3, FV('art', 'd11', 'picture', 0.065, 5.65, 90, 0.45, 0.03, 0.6, 'oak')),
  Z(0.8, FV('candles', 'd12', 'decor', 0.28, 4.9, 90, 0.32, 0.14, 0.22, 'white')),
  Z(0.8, FV('vase', 'd13', 'decor', 0.28, 5.75, 0, 0.18, 0.18, 0.45, 'terracotta')),
  FV('ficus', 'd14', 'pottedPlant', 5.05, 4.2, 0, 0.55, 0.55, 1.7, 'terracotta'),
  // sitting room at the garden doors: a linen sofa on the brick wall under three botanical prints, an oak coffee table with books and
  // hydrangeas on a sand rug, two navy armchairs facing each other, a side table with a table lamp, a floor lamp; opposite, on the sage
  // chimney wall, a white fireplace with the TV above it, candles and books on the mantel, white shelves in both alcoves, the dog's bed
  // by the fire; a fig by the garden window, linen curtains
  F('l1', 'loungeSofa', 0.525, 7.8, 90, 2.4, 0.95, 0.85, 'linen'),
  F('l2', 'tableCoffee', 1.85, 7.8, 90, 1.1, 0.6, 0.42, 'oak'),
  Z(0.42, FV('books', 'l3', 'decor', 1.82, 7.5, 90, 0.3, 0.22, 0.2, 'white')),
  Z(0.42, FV('flowers', 'l4', 'pottedPlant', 1.85, 8.05, 0, 0.3, 0.3, 0.35, 'white')),
  F('l5', 'rug', 1.6, 7.8, 90, 3, 2.6, 0.012, 'sand'),
  F('l6', 'loungeChair', 1.85, 8.98, 0, 0.8, 0.8, 0.8, 'navy'),
  F('l7', 'loungeChair', 1.85, 6.6, 180, 0.8, 0.8, 0.8, 'navy'),
  FV('round', 'l8', 'sideTable', 0.4, 9.25, 0, 0.45, 0.45, 0.55, 'oak'),
  F('l9', 'lampRoundFloor', 0.3, 6.35, 0, 0.35, 0.35, 1.6, 'linen'),
  Z(1.35, FV('botanical', 'l10', 'picture', 0.065, 7.15, 90, 0.45, 0.03, 0.6, 'oak')),
  Z(1.35, FV('botanical', 'l11', 'picture', 0.065, 7.8, 90, 0.45, 0.03, 0.6, 'oak')),
  Z(1.35, FV('botanical', 'l12', 'picture', 0.065, 8.45, 90, 0.45, 0.03, 0.6, 'oak')),
  F('l13', 'fireplace', 5.175, 7.8, 270, 1.4, 0.35, 1.05, 'white'),
  Z(1.3, F('l14', 'tv', 5.32, 7.8, 270, 1.45, 0.06, 0.83)),
  Z(1.05, FV('candles', 'l15', 'decor', 5.17, 7.35, 90, 0.32, 0.14, 0.22, 'white')),
  Z(1.05, FV('books', 'l16', 'decor', 5.17, 8.25, 90, 0.3, 0.22, 0.2, 'sand')),
  F('l17', 'shelf', 5.175, 6.5, 270, 0.8, 0.35, 2, 'white'),
  F('l18', 'shelf', 5.175, 9.1, 270, 0.8, 0.35, 2, 'white'),
  FV('round', 'l19', 'petBed', 4.5, 7.8, 0, 0.7, 0.7, 0.2, 'sand'),
  FV('ficus', 'l20', 'pottedPlant', 4.4, 9.1, 0, 0.6, 0.6, 1.7, 'terracotta'),
  FV('open', 'l21', 'curtains', 2, 9.48, 0, 2.8, 0.14, 2.55, 'linen'),
  FV('open', 'l22', 'curtains', 4.3, 9.48, 0, 1.8, 0.14, 2.55, 'linen'),

  // hallway: the enclosed staircase along the west wall, the meter cupboard panel, an oak shoe cabinet with an arched mirror and a vase,
  // an oak bench under the coat rack, a navy runner on the checkerboard floor, eucalyptus by the door to the living room
  FV('solid', 'h1', 'stairs', 0.475, 3, 0, 0.85, 2.7, 2.6, 'oak'),
  F('h2', 'elPanel', 2.09, 1.2, 270, 0.5, 0.12, 0.7, 'white'),
  F('h3', 'shoeCabinet', 2, 2.15, 270, 0.8, 0.3, 0.9, 'oak'),
  Z(1.1, FV('arch', 'h4', 'wallMirror', 2.135, 2.15, 270, 0.5, 0.03, 0.9, 'black')),
  Z(0.9, FV('vase', 'h5', 'decor', 2, 2.42, 0, 0.16, 0.16, 0.4, 'white')),
  F('h6', 'bench', 1.95, 3.2, 270, 0.9, 0.4, 0.45, 'oak'),
  FV('shelf', 'h7', 'coatHooks', 2.025, 3.2, 270, 0.9, 0.25, 0.35, 'oak'),
  F('h8', 'rug', 1.4, 2.6, 90, 2.6, 0.7, 0.012, 'navy'),
  FV('eucalyptus', 'h9', 'floorVase', 1.95, 3.95, 0, 0.3, 0.3, 1, 'terracotta'),
  // guest toilet: a wall-hung toilet under the window, a small basin with a round oak mirror, a botanical print, a snake plant
  FV('wall', 't1', 'toilet', 0.45, 0.325, 180, 0.38, 0.55, 0.8, 'white'),
  FV('wall', 't2', 'basin', 0.45, 1.3, 0, 0.4, 0.3, 0.85),
  Z(1.1, FV('round', 't3', 'wallMirror', 0.45, 1.435, 0, 0.38, 0.03, 0.38, 'oak')),
  Z(1.35, FV('botanical', 't4', 'picture', 0.065, 0.9, 90, 0.3, 0.03, 0.4, 'oak')),
  FV('snake', 't5', 'pottedPlant', 0.2, 0.85, 0, 0.25, 0.25, 0.5, 'terracotta'),

  // garden (a lawn): on the terrace by the house a teak dining set for four on a gray outdoor rug, hydrangeas in pots; two teak loungers
  // on the grass, a black grill, a raised bed along the shed with flowers, a palm by the path to the back gate
  F('g1', 'rug', 3.9, 11, 0, 2.6, 2, 0.012, 'grey'),
  F('g2', 'patioTable', 3.9, 11, 0, 1.6, 0.9, 0.74, 'oak'),
  F('g3', 'patioChair', 3.5, 10.35, 180, 0.56, 0.58, 0.82, 'oak'),
  F('g4', 'patioChair', 4.3, 10.35, 180, 0.56, 0.58, 0.82, 'oak'),
  F('g5', 'patioChair', 3.5, 11.65, 0, 0.56, 0.58, 0.82, 'oak'),
  F('g6', 'patioChair', 4.3, 11.65, 0, 0.56, 0.58, 0.82, 'oak'),
  Z(0.74, FV('candles', 'g7', 'decor', 3.9, 11, 0, 0.3, 0.14, 0.2, 'white')),
  F('g8', 'grill', 4.75, 12.6, 270, 0.6, 0.6, 1, 'black'),
  F('g9', 'sunLounger', 0.75, 12.6, 0, 0.65, 1.95, 0.85, 'oak'),
  F('g10', 'sunLounger', 1.6, 12.6, 0, 0.65, 1.95, 0.85, 'oak'),
  custom('g12', 'Raised bed', 4.15, 13.75, 0, 1.8, 0.6, 0.45, 'oak'),
  Z(0.45, FV('flowers', 'g13', 'pottedPlant', 3.6, 13.75, 0, 0.4, 0.4, 0.45, 'terracotta')),
  Z(0.45, FV('monstera', 'g14', 'pottedPlant', 4.15, 13.75, 0, 0.5, 0.5, 0.55, 'terracotta')),
  Z(0.45, FV('flowers', 'g15', 'pottedPlant', 4.7, 13.75, 0, 0.4, 0.4, 0.45, 'terracotta')),
  FV('palm', 'g16', 'pottedPlant', 2.55, 14.45, 0, 0.7, 0.7, 1.6, 'terracotta'),
  FV('flowers', 'g17', 'pottedPlant', 0.55, 10.15, 0, 0.45, 0.45, 0.55, 'terracotta'),
  FV('ficus', 'g18', 'pottedPlant', 4.88, 10.1, 0, 0.4, 0.4, 1.4, 'terracotta'),
  // shed: an oak workbench with shelves above, a sage bike and a navy kid's bike, the lawn mower, a graphite tool cupboard by the door
  F('s1', 'workbench', 4, 15.95, 0, 1.2, 0.6, 0.9, 'oak'),
  Z(1.4, F('s2', 'wallShelf', 4, 16.125, 0, 1.2, 0.25, 0.04, 'oak')),
  Z(1.8, F('s3', 'wallShelf', 4, 16.125, 0, 1.2, 0.25, 0.04, 'oak')),
  F('s4', 'bicycle', 5.05, 15.15, 0, 0.6, 1.75, 1.05, 'sage'),
  F('s5', 'bicycle', 4.4, 14.9, 0, 0.45, 1.25, 0.85, 'navy'),
  custom('s6', 'Lawn mower', 3.9, 14.55, 0, 0.45, 0.6, 0.45, 'sage'),
  F('s7', 'utilityCabinet', 3.375, 14.7, 90, 0.7, 0.45, 1.8, 'graphite'),
];

worktop(FURNITURE, 'oak'); // the kitchen's worktop: oak

const LIGHTS = [
  {id: 'hall_main', name: 'Hall pendant', room: 'hall', kind: 'ceiling'},
  {id: 'hall_stairs', name: 'Stair light', room: 'hall', kind: 'accent'},
  {id: 'toilet_main', name: 'Toilet pendant', room: 'toilet', kind: 'ceiling', color: '#ffc773'},
  {id: 'living_spots', name: 'Living room spots', room: 'living', kind: 'ceiling'},
  {id: 'dining_pendant', name: 'Dining pendants', room: 'living', kind: 'ceiling', color: '#ffc773'},
  {id: 'living_floor', name: 'Floor lamp', room: 'living', kind: 'accent', color: '#ffd9a0'},
  {id: 'living_table', name: 'Table lamp', room: 'living', kind: 'accent', color: '#ffd9a0'},
  {id: 'living_tv', name: 'TV backlight', room: 'living', kind: 'strip'},
  {id: 'kitchen_spots', name: 'Kitchen spots', room: 'living', kind: 'ceiling'},
  {id: 'kitchen_worktop', name: 'Worktop strip', room: 'living', kind: 'strip'},
  {id: 'garden_wall', name: 'Garden wall light', room: 'garden', kind: 'accent', h: 1.9},
  {id: 'garden_string', name: 'Garden string lights', room: 'garden', kind: 'strip', color: '#ffc46b'},
  {id: 'shed_main', name: 'Shed light', room: 'shed', kind: 'ceiling'},
  {id: 'porch', name: 'Porch light', room: null, kind: 'accent', h: 1.9},
];
// every lamp is placed but the porch light: it has no area, so the wizard asks where it is. Table lamps stand on their furniture
// (the point is the bulb, 42 cm above the top); the TV backlight is behind the TV above the fireplace
const PLACED = [
  {id: 'hall_main', placed: true, room: 'hall', form: 'pendant', h: 2, points: [[1.5, 2.6]]},
  {id: 'hall_stairs', placed: true, room: 'hall', form: 'wall', h: 1.9, points: [[2.12, 3.9]]},
  {id: 'toilet_main', placed: true, room: 'toilet', form: 'pendant', h: 2.05, points: [[0.45, 0.9]]},
  {
    id: 'living_spots',
    placed: true,
    room: 'living',
    form: 'spots',
    h: 2.58,
    points: [
      [1.4, 6.9],
      [1.4, 8.7],
      [3.3, 6.9],
      [3.3, 8.7],
    ],
  },
  {
    id: 'dining_pendant',
    placed: true,
    room: 'living',
    form: 'pendant',
    h: 1.65,
    points: [
      [2.9, 5],
      [3.5, 5],
      [4.1, 5],
    ],
  },
  {
    id: 'living_floor',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[0.3, 6.35]],
  },
  {
    id: 'living_table',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'table',
    h: 0.97,
    points: [[0.4, 9.25]],
  },
  {
    id: 'living_tv',
    placed: true,
    room: 'living',
    form: 'strip',
    h: 1.7,
    segments: [
      [
        [5.33, 7.25],
        [5.33, 8.35],
      ],
    ],
  },
  {
    id: 'kitchen_spots',
    placed: true,
    room: 'living',
    form: 'spots',
    h: 2.58,
    points: [
      [3.4, 1.3],
      [3.4, 3],
      [4.5, 1.3],
      [4.5, 3],
    ],
  },
  {
    id: 'kitchen_worktop',
    placed: true,
    room: 'living',
    segments: [
      [
        [2.42, 0.12],
        [2.42, 2.62],
      ],
      [
        [4.75, 0.12],
        [5.3, 0.12],
      ],
    ],
  },
  {id: 'garden_wall', placed: true, room: 'garden', form: 'wall', h: 1.9, points: [[3.4, 9.86]]},
  {
    id: 'garden_string',
    placed: true,
    room: 'garden',
    form: 'strip',
    h: 2.45,
    segments: [
      [
        [0.35, 9.88],
        [5.05, 9.88],
      ],
    ],
  }, // along the back of the house, over the doors
  {id: 'shed_main', placed: true, room: 'shed', points: [[4.25, 15.25]]},
];

export default async function () {
  const HA = {areas: Object.fromEntries(ROOMS.map(r => [r.id, r.short])), lights: LIGHTS.map(haLight)};
  // Sensors: an air monitor in the living room, the thermostat's own reading, the fridge; the outdoor sensor is “not room air”;
  // the P1 smart-meter dongle in the meter cupboard (electricity, gas), the solar inverter (no area), a couple of diagnostic ones
  const S = sensorKit(),
    add = S.add;
  add('living', 'living_air', 'Air monitor Temperature', 'temperature', '°C', 21.4);
  add('living', 'living_air', 'Air monitor Humidity', 'humidity', '%', 52);
  add('living', 'living_air', 'Air monitor CO2', 'carbon_dioxide', 'ppm', 940);
  add('living', 'living_thermostat', 'Thermostat Temperature', 'temperature', '°C', 20.1);
  add('living', 'kitchen_fridge', 'Fridge Temperature', 'temperature', '°C', 4.6);
  add('garden', 'outdoor', 'Outdoor sensor Temperature', 'temperature', '°C', 8.3);
  add('garden', 'outdoor', 'Outdoor sensor Humidity', 'humidity', '%', 88);
  add('garden', 'outdoor', 'Outdoor sensor Battery', 'battery', '%', 71, {cat: 'diagnostic'});
  add('hall', 'p1', 'P1 meter Energy import', 'energy', 'kWh', 21480.2, {daily: 7.4, shape: 'home'});
  add('hall', 'p1', 'P1 meter Power', 'power', 'W', 412);
  add('hall', 'p1', 'P1 meter Gas', 'gas', 'm³', 8213.5);
  add('hall', 'p1', 'P1 meter Wi-Fi signal', 'signal_strength', 'dBm', -61, {cat: 'diagnostic'});
  add(null, 'solar', 'Solar inverter Power', 'power', 'W', 0);
  add(null, 'solar', 'Solar inverter Energy', 'energy', 'kWh', 9312.7, {daily: 3.1, shape: 'day'});
  add('living', 'dishwasher', 'Dishwasher Energy', 'energy', 'kWh', 512.6, {daily: 0.9, shape: 'evening'});
  add('living', 'tv_plug', 'TV Energy', 'energy', 'kWh', 388.1, {daily: 0.35, shape: 'evening'});
  add('hall', 'front_door', 'Front door sensor Battery', 'battery', '%', 93, {cat: 'diagnostic'});
  Object.assign(HA, {sensors: S.sensors, states: S.states});
  // Devices: an OpenTherm boiler thermostat (heating only), the kitchen blind and living room curtains, a garden awning (not a window cover),
  // contacts on the front door and the garden door, a video doorbell and a garden camera, a leak sensor under the sink, the water valve, a robot vacuum
  const K = deviceKit();
  K.thermostat('living_thermostat', 'Living room thermostat', 'living', 20.5, 20.1);
  K.cover('kitchen_blind', 'Kitchen roller blind', 'living', 'blind', 100);
  K.cover('living_curtains', 'Living room curtains', 'living', 'curtain', 100);
  K.devices.push({
    entity: 'cover.garden_awning',
    name: 'Garden awning',
    area: 'garden',
    domain: 'cover',
    cls: 'awning',
  });
  K.entities['cover.garden_awning'] = {
    state: 'closed',
    attributes: {device_class: 'awning', current_position: 0, supported_features: 15},
  };
  K.contact('front_door', 'Front door', 'hall', 'door', false);
  K.contact('garden_door', 'Garden door', 'living', 'door', false); // two doors: auto-place takes the one into the garden
  K.camera('doorbell', 'Video doorbell', 'hall');
  K.camera('garden_cam', 'Garden camera', 'garden');
  K.leak('leak_sink', 'Leak under the sink', 'living', 88);
  K.valve('water_main', 'Water shut-off valve', 'hall');
  K.vacuum('robot', 'Robot vacuum', 'living');
  K.favorites([
    ['scene.dinner', 'Dinner', 'living', '2026-11-07T18:10:00Z'],
    ['scene.cosy', 'Cosy evening', 'living', '2026-11-07T20:30:00Z'],
    ['script.leaving_home', 'Leaving home', null, 'off'],
    ['switch.garden_socket', 'Garden socket', 'garden', 'off'],
    ['lock.front_door', 'Front door lock', 'hall', 'locked'],
  ]);
  Object.assign(HA, {devices: K.devices, entities: K.entities, extra: K.extra});
  HA.stats = stats(['sensor.p1_energy'], ['dishwasher', 'tv_plug'], {
    'camera.garden_cam': {hours: 3, drops: 4},
    'sensor.outdoor_temperature': {hours: 0.5, drops: 2},
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
