// Typical home 3 (docs/research/typical-homes.md, D-030): a “euro two-room” apartment in a new building, about 57 m² — a kitchen-living room
// with an island and bar stools and a balcony, a bedroom with a built-in wardrobe, a bathroom, a laundry niche off the hallway.
// Design concept (made up, nobody's home): urban modern. Graphite kitchen fronts under a marble backsplash, a fluted light-oak wall,
// microcement walls, light oak floors; navy is the accent (the sofa, the bedroom's headboard wall, the zellige behind the bathtub), camel
// armchairs, black metal (lamps, mirror frames, the bistro table). The kitchen-living room with the island is the showpiece: pendants over
// the island, a navy sofa against the fluted oak wall on a big linen rug, the TV opposite; a calm bedroom; a usable glazed balcony.
// Coordinates are metres, x is east, y is north. Rooms are separated by 10 cm walls; the editor adds the exterior walls itself.
// The wall face is 5 cm inside a room's outline, so items stand with their backs 5 cm in.
// The overview looks from the north-east (DEMO.view): the kitchen run, the island, the fluted wall and the bedroom's navy wall face the
// camera, the balcony is in front (from the default south-east angle the bathroom and the hallway hid the kitchen).
import {door, win, F, haLight, sensorKit, deviceKit, stats, WEATHER, worktop} from '../kit.ts';
import type {
  DemoHomeSource,
  DemoLight,
  DemoPlan,
  DemoPlanLight,
  DemoRoom,
  RoomFinish,
  Style,
} from '../kit.ts';
import type {DemoHaData, FurnitureItem, LooseOpening} from '../../src/core/types.ts';

const FV = (v: string, ...a: Parameters<typeof F>): FurnitureItem => ({...F(...a), v}); // an item in a catalog variant
const Z = (z: number, f: FurnitureItem): FurnitureItem => ({...f, z}); // an item at its own height above the floor

// The kitchen-living room is one room and one HA area (two areas in one room — a zone — are not covered by homes.test.js yet).
// Interior doors sit 1 mm towards the room they open into (the kitchen-living room, the bedroom; the bathroom door opens into the hallway).
const ROOMS: DemoRoom[] = [
  {
    id: 'living',
    short: 'Kitchen-living room',
    polygon: [
      [0, 3.4],
      [4.6, 3.4],
      [4.6, 8.8],
      [0, 8.8],
    ],
  },
  {
    id: 'bedroom',
    short: 'Bedroom',
    polygon: [
      [4.7, 3.4],
      [7.8, 3.4],
      [7.8, 8.8],
      [4.7, 8.8],
    ],
  },
  {
    id: 'hall',
    short: 'Hallway',
    polygon: [
      [2.3, 0],
      [4.6, 0],
      [4.6, 2.4],
      [5.9, 2.4],
      [5.9, 3.3],
      [2.3, 3.3],
    ],
  },
  {
    id: 'laundry',
    short: 'Laundry',
    polygon: [
      [4.7, 1.2],
      [5.9, 1.2],
      [5.9, 2.3],
      [4.7, 2.3],
    ],
  },
  {
    id: 'bathroom',
    short: 'Bathroom',
    polygon: [
      [0, 0.8],
      [2.2, 0.8],
      [2.2, 3.3],
      [0, 3.3],
    ],
  },
  {
    id: 'balcony',
    short: 'Balcony',
    polygon: [
      [0.4, 9.05],
      [3.2, 9.05],
      [3.2, 10.25],
      [0.4, 10.25],
    ],
  },
];
// finishes the style does not give: the fluted oak wall behind the sofa (the style would put the media wall behind the TV) and plain
// microcement behind the TV, the laundry niche continues the hallway (microcement, porcelain), the balcony gets grey decking,
// the wall behind the bathtub navy zellige (edge 0 is the south wall)
const NAVY = '#3e4b60';
const FINISH: Partial<Record<string, RoomFinish>> = {
  living: {wf: [null, {k: 'microcement', tint: '#c6c0b7'}, null, {k: 'flutedOak'}]},
  laundry: {wall: 'microcement', wallTint: '#c3bdb4', floor: 'stone'},
  balcony: {floor: 'woodGrey'},
  bathroom: {wf: [{k: 'zellige', tint: NAVY}, null, null, null]},
};
// the style: microcement and warm grey plaster, the fluted oak media wall, a navy plaster headboard wall, marble behind the kitchen,
// light oak floors, porcelain in the hallway, graphite tile in the bathroom
const STYLE: Style = {
  wall: {
    living: {k: 'microcement', tint: '#c6c0b7'},
    bed: {k: 'plaster', tint: '#b7b2a9'},
    kitchen: {k: 'microcement', tint: '#c6c0b7'},
    hall: {k: 'microcement', tint: '#c3bdb4'},
    kids: '#b8bdb6',
    office: {k: 'plaster', tint: '#b2b0aa'},
  },
  bed: {k: 'plaster', tint: NAVY},
  media: {k: 'flutedOak'},
  sofa: {k: 'plasterCharcoal'},
  splash: {k: 'marble'},
  bath: {k: 'microcement', tint: '#bfb9b0'},
  office: {k: 'slatsBlack'},
  floor: {
    living: 'woodLight',
    bed: 'woodLight',
    kids: 'woodLight',
    hall: 'stone',
    office: 'woodLight',
    kitchen: 'woodLight',
    bath: 'tileGraphite',
  },
};

const OPENINGS: LooseOpening[] = [
  door([3.5, 0], [4.4, 0]), // front door
  door([3.65, 3.351], [4.45, 3.351]), // hallway ↔ kitchen-living room
  door([4.9, 3.351], [5.7, 3.351]), // hallway ↔ bedroom
  door([2.251, 2.4], [2.251, 3.1]), // hallway ↔ bathroom
  door([4.72, 2.35], [5.88, 2.35]), // laundry niche, open (wider than a door leaf)
  door([0.6, 8.924], [1.4, 8.924], 2.2), // kitchen-living room ↔ balcony
  win([1.6, 8.924], [3, 8.924]), // kitchen-living room, onto the balcony
  win([3.5, 8.8], [4.3, 8.8]), // kitchen-living room, to the outside
  win([5.9, 8.8], [7.3, 8.8]), // bedroom
  win([0.5, 10.25], [3.1, 10.25], 0.9, 2.45), // balcony glazing
  win([0.4, 9.15], [0.4, 10.15], 0.9, 2.45), // west side glazing; the east side is a solid wall next to the neighbours' balcony
];

const FURNITURE: FurnitureItem[] = [
  // kitchen along the south wall, backing onto the bathroom: a graphite tall unit with the integrated fridge-freezer, a base unit with the
  // coffee machine under a tall wall cabinet, the cooktop with an oven under a black chimney hood, a base unit, the sink, the dishwasher;
  // two open oak shelves with a vase, a bowl and cookbooks instead of wall cabinets over the sink side
  FV('doors', 'k1', 'kitchenTall', 0.35, 3.75, 180, 0.6, 0.6, 2.4, 'graphite'),
  F('k2', 'kitchenBase', 0.85, 3.75, 180, 0.4, 0.6, 0.9, 'graphite'),
  FV('oven', 'k3', 'kitchenHob', 1.35, 3.75, 180, 0.6, 0.6, 0.9, 'graphite'),
  F('k4', 'kitchenBase', 1.95, 3.75, 180, 0.6, 0.6, 0.9, 'graphite'),
  FV('one', 'k5', 'kitchenSink', 2.55, 3.75, 180, 0.6, 0.6, 0.9, 'graphite'),
  F('k6', 'dishwasher', 3.15, 3.75, 180, 0.6, 0.6, 0.9, 'graphite'),
  Z(1.45, F('k7', 'kitchenWall', 0.85, 3.625, 180, 0.4, 0.35, 0.95, 'graphite')),
  FV('dome', 'k8', 'hood', 1.35, 3.7, 180, 0.6, 0.5, 0.9, 'black'),
  Z(1.5, F('k9', 'wallShelf', 2.55, 3.59, 180, 1.7, 0.28, 0.04, 'oak')),
  Z(1.9, F('k10', 'wallShelf', 2.55, 3.59, 180, 1.7, 0.28, 0.04, 'oak')),
  F('k11', 'coffee', 0.85, 3.65, 180, 0.25, 0.38, 0.38, 'black'),
  Z(1.54, FV('vase', 'k12', 'decor', 3.15, 3.6, 0, 0.16, 0.16, 0.3, 'black')),
  Z(1.94, FV('books', 'k13', 'decor', 2.05, 3.6, 0, 0.3, 0.22, 0.2, 'white')),
  Z(1.54, FV('bowl', 'k14', 'decor', 2.2, 3.6, 0, 0.26, 0.26, 0.12, 'white')),
  // a graphite island with the overhang to the north, three oak bar stools, a fruit bowl and hydrangeas on it
  F('k15', 'kitchenIsland', 1.9, 5.525, 180, 1.8, 0.95, 0.9, 'graphite'),
  F('k16', 'barStool', 1.3, 6.12, 0, 0.42, 0.42, 0.9, 'oak'),
  F('k17', 'barStool', 1.9, 6.12, 0, 0.42, 0.42, 0.9, 'oak'),
  F('k18', 'barStool', 2.5, 6.12, 0, 0.42, 0.42, 0.9, 'oak'),
  Z(0.9, FV('bowl', 'k19', 'decor', 1.3, 5.4, 0, 0.32, 0.32, 0.14, 'white')),
  Z(0.9, FV('flowers', 'k20', 'pottedPlant', 2.45, 5.42, 0, 0.3, 0.3, 0.36, 'white')),
  // lounge: a navy sofa against the fluted oak wall (washed by the cove light) with a picture over it, a floor lamp at one end and a black
  // side table with a table lamp at the other, a round oak coffee table with candles and books on a big linen rug, a camel armchair by the
  // balcony window; opposite, on the bedroom wall, a floating graphite TV bench with the TV, a soundbar, books and a vase, the air conditioner;
  // a fiddle-leaf fig between the windows, a monstera in the corner, linen curtains
  F('l1', 'loungeSofa', 0.525, 6.95, 90, 1.9, 0.95, 0.8, 'navy'),
  F('l2', 'rug', 2, 7.05, 0, 2.8, 2, 0.012, 'linen'),
  Z(1.2, FV('art', 'l3', 'picture', 0.065, 6.95, 90, 1.3, 0.03, 0.85, 'black')),
  F('l4', 'lampRoundFloor', 0.3, 8.15, 0, 0.36, 0.36, 1.6, 'graphite'),
  FV('round', 'l5', 'sideTable', 0.3, 5.75, 0, 0.4, 0.4, 0.5, 'black'),
  FV('round', 'l6', 'tableCoffee', 1.85, 7.05, 0, 0.85, 0.85, 0.35, 'oak'),
  Z(0.35, FV('candles', 'l7', 'decor', 1.78, 6.87, 0, 0.32, 0.14, 0.22, 'graphite')),
  Z(0.35, FV('books', 'l8', 'decor', 1.95, 7.2, 0, 0.3, 0.22, 0.12, 'sand')),
  F('l9', 'loungeChair', 2.8, 7.9, 225, 0.78, 0.78, 0.78, 'sand'),
  Z(0.3, F('l10', 'tvStand', 4.33, 7, 270, 1.8, 0.44, 0.4, 'graphite')),
  Z(1, F('l11', 'tv', 4.515, 7, 270, 1.45, 0.06, 0.84)),
  Z(0.7, F('l12', 'soundbar', 4.38, 7, 270, 0.9, 0.1, 0.07, 'black')),
  Z(0.7, FV('books', 'l13', 'decor', 4.32, 6.35, 270, 0.3, 0.22, 0.2, 'terracotta')),
  Z(0.7, FV('vase', 'l14', 'decor', 4.32, 7.66, 0, 0.18, 0.18, 0.5, 'white')),
  F('l15', 'aircon', 4.44, 5, 270, 0.8, 0.22, 0.29),
  FV('ficus', 'l16', 'pottedPlant', 3.3, 8.5, 0, 0.5, 0.5, 1.7, 'black'),
  FV('monstera', 'l17', 'pottedPlant', 4.25, 8.45, 0, 0.55, 0.55, 0.95, 'sand'),
  FV('open', 'l18', 'curtains', 2.3, 8.68, 0, 1.8, 0.14, 2.55, 'linen'),
  FV('open', 'l19', 'curtains', 3.9, 8.68, 0, 1.2, 0.14, 2.55, 'linen'),
  // bedroom: a king-size oak bed with its headboard against the navy plaster wall, graphite nightstands with table lamps, a picture over the bed,
  // a grey rug; a built-in greige wardrobe with sliding doors along the south wall; an oak dressing table with a stool in the
  // window corner, a camel armchair with a reading lamp in the other one, a snake plant, linen curtains; the air conditioner faces the bed
  FV('sliding', 'b1', 'wardrobeRun', 6.775, 3.75, 180, 1.95, 0.6, 2.5, 'beige'),
  F('b2', 'bed', 5.78, 6.4, 90, 1.8, 2.05, 1, 'oak'),
  F('b3', 'nightstand', 4.97, 5.175, 90, 0.45, 0.4, 0.5, 'graphite'),
  F('b4', 'nightstand', 4.97, 7.625, 90, 0.45, 0.4, 0.5, 'graphite'),
  Z(1.3, FV('art', 'b5', 'picture', 4.765, 6.4, 90, 1.4, 0.03, 0.7, 'oak')),
  F('b6', 'rug', 6.1, 6.3, 90, 2.9, 2.1, 0.012, 'grey'),
  F('b7', 'dressingTable', 5.25, 8.525, 0, 0.9, 0.45, 1.45, 'oak'),
  FV('round', 'b8', 'stool', 5.25, 8.08, 0, 0.34, 0.34, 0.45, 'graphite'),
  F('b9', 'loungeChair', 7.2, 8.17, 225, 0.75, 0.75, 0.78, 'sand'),
  F('b10', 'lampRoundFloor', 7.52, 7.5, 0, 0.35, 0.35, 1.55, 'linen'),
  FV('snake', 'b11', 'pottedPlant', 5.95, 8.55, 0, 0.35, 0.35, 0.85, 'white'),
  FV('open', 'b12', 'curtains', 6.6, 8.68, 0, 1.8, 0.14, 2.55, 'linen'),
  F('b13', 'aircon', 7.64, 6.4, 270, 0.8, 0.22, 0.29),
  // hallway: a built-in oak wardrobe by the west wall, an oak bench with a coat rack and a small vase on its shelf, a tall arched black mirror
  // by the living room door, a graphite runner, the electrical panel with a vase of eucalyptus under it by the front door
  FV('sliding', 'h1', 'wardrobeRun', 2.65, 1.15, 90, 2.2, 0.6, 2.5, 'oak'),
  F('h2', 'bench', 4.35, 1.65, 270, 1.1, 0.4, 0.45, 'oak'),
  FV('shelf', 'h3', 'coatHooks', 4.425, 1.65, 270, 1.1, 0.25, 0.35, 'oak'),
  Z(1.85, FV('vase', 'h4', 'decor', 4.45, 1.35, 0, 0.14, 0.14, 0.3, 'black')),
  Z(0.5, FV('arch', 'h5', 'wallMirror', 3.25, 3.235, 0, 0.55, 0.03, 1.45, 'black')),
  F('h6', 'rug', 3.6, 1.75, 0, 0.8, 2.2, 0.012, 'graphite'),
  F('h7', 'elPanel', 3.2, 0.11, 180, 0.4, 0.12, 0.5, 'grey'),
  FV('eucalyptus', 'h8', 'floorVase', 3.2, 0.27, 0, 0.3, 0.3, 1, 'black'),
  // laundry niche: the washing machine with the dryer on top, a graphite utility cabinet, an oak shelf over the dryer
  F('w1', 'washer', 5.05, 1.525, 180, 0.6, 0.55, 0.85, 'white'),
  Z(0.85, F('w2', 'dryer', 5.05, 1.55, 180, 0.6, 0.6, 0.85, 'white')),
  F('w3', 'utilityCabinet', 5.605, 1.5, 180, 0.45, 0.5, 2, 'graphite'),
  Z(1.85, F('w4', 'wallShelf', 5.05, 1.39, 180, 0.6, 0.28, 0.03, 'oak')),
  // bathroom: a bathtub against the navy zellige wall with a black shower set, a wall-hung toilet, an oak wall-hung vanity with a round black
  // mirror, a black towel warmer, a linen laundry basket and bath mat, a snake plant
  F('a1', 'bath', 0.9, 1.225, 180, 1.7, 0.75, 0.58, 'white'),
  F('a2', 'showerColumn', 0.225, 1.225, 90, 0.3, 0.35, 1.2, 'black'),
  FV('wall', 'a3', 'toilet', 0.325, 2.2, 90, 0.38, 0.55, 0.8, 'white'),
  FV('wall', 'a4', 'vanity', 1.35, 3, 0, 0.8, 0.5, 0.85, 'oak'),
  Z(1.2, FV('round', 'a5', 'wallMirror', 1.35, 3.235, 0, 0.6, 0.03, 0.6, 'black')),
  FV('ladder', 'a6', 'towelRail', 2.1, 1.5, 270, 0.5, 0.1, 0.8, 'black'),
  F('a7', 'laundryBasket', 1.95, 2, 0, 0.35, 0.35, 0.6, 'linen'),
  F('a8', 'rug', 1, 1.88, 0, 0.8, 0.5, 0.012, 'linen'),
  FV('snake', 'a9', 'pottedPlant', 0.3, 2.95, 0, 0.35, 0.35, 0.8, 'white'),
  // balcony: a graphite bistro table with hydrangeas and two oak chairs on a sand outdoor rug, a palm in a terracotta pot by the glazing,
  // a snake plant
  FV('round', 'p1', 'patioTable', 2.3, 9.65, 0, 0.6, 0.6, 0.74, 'graphite'),
  F('p2', 'patioChair', 1.72, 9.65, 90, 0.5, 0.5, 0.82, 'oak'),
  F('p3', 'patioChair', 2.88, 9.65, 270, 0.5, 0.5, 0.82, 'oak'),
  Z(0.74, FV('flowers', 'p4', 'pottedPlant', 2.3, 9.65, 0, 0.26, 0.26, 0.3, 'terracotta')),
  F('p5', 'rug', 2.3, 9.65, 0, 1.7, 0.95, 0.012, 'sand'),
  FV('palm', 'p6', 'pottedPlant', 0.7, 9.92, 0, 0.5, 0.5, 1.4, 'terracotta'),
  FV('snake', 'p7', 'pottedPlant', 1.2, 10, 0, 0.35, 0.35, 0.8, 'graphite'),
];

worktop(FURNITURE, 'white'); // the kitchen's worktop: white quartz

const LIGHTS: DemoLight[] = [
  {id: 'living_track', name: 'Living room track', room: 'living', kind: 'ceiling'},
  {id: 'living_floor', name: 'Floor lamp', room: 'living', kind: 'accent'},
  {id: 'living_side', name: 'Side table lamp', room: 'living', kind: 'accent'},
  {id: 'living_cove', name: 'Ceiling cove', room: 'living', kind: 'cove'},
  {id: 'living_tv', name: 'TV backlight', room: 'living', kind: 'strip', h: 1.4},
  {id: 'kitchen_spots', name: 'Kitchen spots', room: 'living', kind: 'ceiling'},
  {id: 'kitchen_island', name: 'Island pendants', room: 'living', kind: 'ceiling', color: '#ffc773'},
  {id: 'kitchen_worktop', name: 'Worktop strip', room: 'living', kind: 'strip'},
  {id: 'bedroom_main', name: 'Bedroom ceiling light', room: 'bedroom', kind: 'ceiling'},
  {id: 'bedroom_left', name: 'Left bedside lamp', room: 'bedroom', kind: 'accent', color: '#ffd9a0'},
  {id: 'bedroom_right', name: 'Right bedside lamp', room: 'bedroom', kind: 'accent', color: '#ffd9a0'},
  {id: 'bedroom_reading', name: 'Reading floor lamp', room: 'bedroom', kind: 'accent'},
  {id: 'hall_spots', name: 'Hallway spots', room: 'hall', kind: 'ceiling'},
  {id: 'laundry_main', name: 'Laundry light', room: 'laundry', kind: 'ceiling'},
  {id: 'bathroom_spots', name: 'Bathroom spots', room: 'bathroom', kind: 'ceiling'},
  {id: 'bathroom_mirror', name: 'Mirror light', room: 'bathroom', kind: 'accent'},
  {id: 'balcony_wall', name: 'Balcony wall lamp', room: 'balcony', kind: 'accent'},
];
// every lamp is placed: the track over the lounge, the floor lamp and the table lamps on their furniture (a table lamp's bulb is 42 cm
// above the top it stands on), the cove over the fluted wall, the backlight behind the TV, pendants over the island, a sconce on the
// balcony between its door and window (its one solid wall keeps the balcony thermometer)
const PLACED: DemoPlanLight[] = [
  {
    id: 'living_track',
    placed: true,
    room: 'living',
    form: 'line',
    h: 2.58,
    segments: [
      [
        [1.1, 7.05],
        [3.5, 7.05],
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
    points: [[0.3, 8.15]],
  },
  {
    id: 'living_side',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'table',
    h: 0.92,
    points: [[0.3, 5.75]],
  },
  {
    id: 'living_cove',
    placed: true,
    room: 'living',
    segments: [
      [
        [0.1, 4.2],
        [0.1, 8.65],
      ],
    ],
  },
  {
    id: 'living_tv',
    placed: true,
    room: 'living',
    h: 1.4,
    segments: [
      [
        [4.5, 6.5],
        [4.5, 7.5],
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
      [0.85, 4.5],
      [1.95, 4.5],
      [3.05, 4.5],
    ],
  },
  {
    id: 'kitchen_island',
    placed: true,
    room: 'living',
    form: 'pendant',
    h: 1.7,
    points: [
      [1.3, 5.5],
      [1.9, 5.5],
      [2.5, 5.5],
    ],
  },
  {
    id: 'kitchen_worktop',
    placed: true,
    room: 'living',
    segments: [
      [
        [0.7, 3.72],
        [3.4, 3.72],
      ],
    ],
  },
  {id: 'bedroom_main', placed: true, room: 'bedroom', points: [[6.3, 6]]},
  {
    id: 'bedroom_left',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'table',
    h: 0.92,
    points: [[4.97, 7.625]],
  },
  {
    id: 'bedroom_right',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'table',
    h: 0.92,
    points: [[4.97, 5.175]],
  },
  {
    id: 'bedroom_reading',
    placed: true,
    room: 'bedroom',
    form: 'lamp',
    opt: 'floor',
    h: 1.45,
    points: [[7.52, 7.5]],
  },
  {
    id: 'hall_spots',
    placed: true,
    room: 'hall',
    form: 'spots',
    h: 2.58,
    points: [
      [3.6, 0.9],
      [3.6, 2],
      [3.6, 2.95],
      [5.2, 2.85],
    ],
  },
  {id: 'laundry_main', placed: true, room: 'laundry', points: [[5.3, 1.8]]},
  {
    id: 'bathroom_spots',
    placed: true,
    room: 'bathroom',
    form: 'spots',
    h: 2.58,
    points: [
      [0.6, 1.25],
      [1.5, 1.25],
      [1.3, 2.35],
    ],
  },
  {id: 'bathroom_mirror', placed: true, room: 'bathroom', form: 'wall', h: 1.95, points: [[1.35, 3.17]]},
  {id: 'balcony_wall', placed: true, room: 'balcony', form: 'wall', h: 2, points: [[1.5, 9.1]]},
];

export default async function (): Promise<DemoHomeSource> {
  const HA: DemoHaData = {
    areas: Object.fromEntries(ROOMS.map(r => [r.id, r.short])),
    lights: LIGHTS.map(haLight),
  };
  // Sensors: room air in the kitchen-living room (its area is set to the air monitor; the second sensor is by the cooktop), the bedroom
  // (CO₂ is high after the night) and the bathroom; a thermometer on the glazed balcony; diagnostic ones; energy meters
  const S = sensorKit();
  const add = S.add;
  add('living', 'living_air', 'Living room sensor Temperature', 'temperature', '°C', 22.2);
  add('living', 'living_air', 'Living room sensor Humidity', 'humidity', '%', 43);
  add('living', 'living_air', 'Living room sensor CO2', 'carbon_dioxide', 'ppm', 860);
  add('living', 'kitchen_th', 'Kitchen sensor Temperature', 'temperature', '°C', 23.4);
  add('living', 'kitchen_th', 'Kitchen sensor Humidity', 'humidity', '%', 49);
  add('living', 'fridge', 'Fridge Temperature', 'temperature', '°C', 4.1);
  add('bedroom', 'bedroom_air', 'Bedroom sensor Temperature', 'temperature', '°C', 20.8);
  add('bedroom', 'bedroom_air', 'Bedroom sensor Humidity', 'humidity', '%', 47);
  add('bedroom', 'bedroom_air', 'Bedroom sensor CO2', 'carbon_dioxide', 'ppm', 1460);
  add('bedroom', 'bedroom_air', 'Bedroom sensor Battery', 'battery', '%', 41, {cat: 'diagnostic'});
  add('bathroom', 'bath_th', 'Bathroom sensor Temperature', 'temperature', '°C', 25.6);
  add('bathroom', 'bath_th', 'Bathroom sensor Humidity', 'humidity', '%', 74);
  add('balcony', 'balcony_th', 'Balcony thermometer Temperature', 'temperature', '°C', 12.5);
  add('hall', 'router', 'Router CPU temperature', 'temperature', '°C', 54, {cat: 'diagnostic'});
  add(null, 'home_meter', 'Main meter Energy', 'energy', 'kWh', 15230.2, {daily: 8.4, shape: 'home'});
  add('living', 'fridge', 'Fridge Energy', 'energy', 'kWh', 990.6, {daily: 1, shape: 'flat'});
  add('living', 'dishwasher', 'Dishwasher Energy', 'energy', 'kWh', 520.4, {daily: 0.7, shape: 'evening'});
  add('laundry', 'washer', 'Washing machine Energy', 'energy', 'kWh', 610.9, {daily: 0.6, shape: 'day'});
  add('laundry', 'dryer', 'Dryer Energy', 'energy', 'kWh', 730.2, {daily: 0.9, shape: 'day'});
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
  // Devices: the living room air conditioner is heating, the bedroom one is off; underfloor heating in the bathroom; curtains in the living room,
  // the bedroom has both curtains and a blackout blind on its one window; the balcony door is closed; a doorbell camera, a water valve,
  // leak sensors in the kitchen, the bathroom and the laundry niche; a robot vacuum
  const K = deviceKit();
  K.ac('living_ac', 'Living room AC', 'living', 'heat', 23, 22.2);
  K.ac('bedroom_ac', 'Bedroom AC', 'bedroom', 'off', 21, 20.8);
  K.thermostat('bathroom_floor', 'Underfloor heating', 'bathroom', 27, 25.6);
  K.cover('balcony_curtains', 'Balcony curtains', 'living', 'curtain', 100);
  K.cover('living_curtains', 'Living room curtains', 'living', 'curtain', 100);
  K.cover('bedroom_curtains', 'Bedroom curtains', 'bedroom', 'curtain', 100);
  K.cover('bedroom_blind', 'Bedroom blackout blind', 'bedroom', 'blind', 100);
  K.contact('front_door', 'Front door', 'hall', 'door', false);
  K.contact('balcony_door', 'Balcony door', 'balcony', 'door', false);
  K.contact('bedroom_window', 'Bedroom window', 'bedroom', 'window', false);
  K.camera('doorbell', 'Doorbell camera', 'hall');
  K.valve('water_main', 'Water shut-off valve', 'bathroom');
  K.leak('leak_sink', 'Leak under the sink', 'living', 83);
  K.leak('leak_bathroom', 'Bathroom leak', 'bathroom', 70);
  K.leak('leak_laundry', 'Leak under the washer', 'laundry', 96);
  K.vacuum('robot', 'Robot vacuum', 'hall');
  K.favorites([
    ['scene.dinner', 'Dinner', 'living', '2026-11-07T18:40:00Z'],
    ['scene.movie', 'Movie', 'living', '2026-11-06T20:30:00Z'],
    ['script.good_night', 'Good night', null, 'off'],
    ['switch.kettle', 'Kettle', 'living', 'off'],
    ['switch.towel_rail', 'Towel rail', 'bathroom', 'on'],
    ['lock.front_door', 'Front door lock', 'hall', 'locked'],
  ]);
  Object.assign(HA, {devices: K.devices, entities: K.entities, extra: K.extra});
  HA.stats = stats(['sensor.home_meter_energy'], ['fridge', 'dishwasher', 'washer', 'dryer'], {
    'climate.bedroom_ac': {hours: 3, drops: 4},
    'camera.doorbell': {hours: 0.2, drops: 2},
  });
  HA.weather = WEATHER;
  const DEMO: DemoPlan = {
    version: 1,
    units: 'm',
    rooms: ROOMS.map(r => ({id: r.id, name: r.short, polygon: r.polygon, ...FINISH[r.id]})),
    openings: OPENINGS,
    furniture: FURNITURE,
    lights: PLACED,
    view: {t: [3.76, 1, -4.99], theta: 2.3562, phi: 0.7854, fit: [6.5, 5.55]},
  }; // from the north-east, 45° down
  return {HA, DEMO, DEMO_UNDERLAY: null, STYLE};
}
