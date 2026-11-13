// Typical home 2 (docs/research/typical-homes.md, D-030): a one-bedroom apartment with a separate kitchen, about 39 m² —
// one room for sleeping and living, a kitchen with a dining table, a combined bathroom with a bathtub, a hallway with a wardrobe.
// Design concept: mid-century modern in an older block. Walnut everywhere (bed, credenzas, the round dining table), warm cream
// plaster with one terracotta plaster wall behind the bed and the sofa, an olive sofa and a deep olive media wall, camel and
// terracotta accents (armchair, pots, the hall runner, a dusty terracotta zellige bathroom), black details (lamps, frames, hood,
// taps) and a lot of plants. The kitchen has cream fronts, an olive zellige backsplash and terracotta floor tiles.
// Made up: nobody's home. Coordinates are metres, x is east, y is north. Rooms are separated by 10 cm walls; the editor adds the
// exterior walls itself. The wall face is 5 cm inside a room's outline, so items stand with their backs 5 cm in.
import {door, win, F, haLight, sensorKit, deviceKit, stats, WEATHER, worktop} from '../kit.mjs';

// order sets where interior doors open: into the room and the kitchen, the bathroom door into the hallway
const ROOMS = [
  {
    id: 'room',
    short: 'Room',
    polygon: [
      [0, 0],
      [3.5, 0],
      [3.5, 6],
      [0, 6],
    ],
  },
  {
    id: 'kitchen',
    short: 'Kitchen',
    polygon: [
      [3.6, 3.1],
      [6.7, 3.1],
      [6.7, 6],
      [3.6, 6],
    ],
  },
  {
    id: 'hall',
    short: 'Hallway',
    polygon: [
      [3.6, 0],
      [5.2, 0],
      [5.2, 3],
      [3.6, 3],
    ],
  },
  {
    id: 'bathroom',
    short: 'Bathroom',
    polygon: [
      [5.3, 0],
      [6.7, 0],
      [6.7, 3],
      [5.3, 3],
    ],
  },
];

const OPENINGS = [
  door([4.3, 0], [5.15, 0]), // front door
  door([3.55, 2.05], [3.55, 2.85]), // hallway ↔ room
  door([3.9, 3.051], [4.7, 3.051]), // hallway ↔ kitchen, 1 mm towards the kitchen: it opens into the kitchen
  door([5.25, 1.6], [5.25, 2.3]), // hallway ↔ bathroom
  win([0.9, 6], [2.6, 6]), // room
  win([4.4, 6], [5.9, 6]), // kitchen
];

// The home's own finish (kit.mjs: STYLES has the shape): cream plaster, a terracotta plaster wall behind the bed and the sofa,
// a deep olive wall behind the TV, an olive zellige backsplash, a dusty terracotta zellige bathroom; herringbone and terracotta tiles
const STYLE = {
  wall: {
    living: {k: 'plaster', tint: '#cbbba2'},
    bed: {k: 'plaster', tint: '#c7b49b'},
    kitchen: {k: 'plaster', tint: '#d3c7b4'},
    hall: {k: 'plaster', tint: '#c4b198'},
    kids: '#cdb2a5',
    office: {k: 'plaster', tint: '#c0ae98'},
  },
  bed: {k: 'plaster', tint: '#a35d40'},
  media: {k: 'plaster', tint: '#5f6548'},
  sofa: {k: 'plaster', tint: '#a35d40'},
  splash: {k: 'zellige', tint: '#7c8968'},
  bath: {k: 'zellige', tint: '#c69680'},
  office: {k: 'slatsWalnut'},
  floor: {
    living: 'herringbone',
    bed: 'herringbone',
    kids: 'honey',
    hall: 'herringbone',
    office: 'honey',
    kitchen: 'terracotta',
    bath: 'tileSmall',
  },
};

const FV = (v, ...a) => ({...F(...a), v}); // an item in a catalog variant
const Z = (z, f) => ({...f, z}); // an item at its own height above the floor
const FURNITURE = [
  // room, sleeping part: a walnut bed with a wooden headboard against the terracotta wall, walnut nightstands with table lamps, a long
  // picture over the bed, an olive rug; a walnut dresser on the east wall with a round black mirror, a vase and books; a monstera
  FV('wood', 'r1', 'bed', 1.1, 1.4, 90, 1.6, 2.1, 1, 'walnut'),
  F('r2', 'nightstand', 0.25, 0.325, 90, 0.45, 0.4, 0.5, 'walnut'),
  F('r3', 'nightstand', 0.25, 2.475, 90, 0.45, 0.4, 0.5, 'walnut'),
  Z(1.3, F('r4', 'picture', 0.065, 1.4, 90, 1.3, 0.03, 0.6, 'black')),
  F('r5', 'rug', 1.55, 1.4, 90, 2.4, 2, 0.012, 'olive'),
  Z(0.5, FV('books', 'r6', 'decor', 0.22, 2.6, 90, 0.2, 0.15, 0.08, 'sand')),
  F('r7', 'dresser', 3.225, 0.95, 270, 1.2, 0.45, 0.8, 'walnut'),
  Z(1.2, FV('round', 'r8', 'wallMirror', 3.435, 0.95, 270, 0.7, 0.03, 0.7, 'black')),
  Z(0.8, FV('vase', 'r9', 'decor', 3.22, 0.55, 270, 0.18, 0.18, 0.5, 'terracotta')),
  Z(0.8, FV('books', 'r10', 'decor', 3.22, 1.3, 270, 0.3, 0.22, 0.16, 'sand')),
  FV('monstera', 'r11', 'pottedPlant', 2.5, 0.4, 0, 0.65, 0.65, 0.95, 'terracotta'),
  // room, living part: an olive sofa against the terracotta wall with two pictures over it, a black side table, a round walnut coffee
  // table on a linen rug, a walnut leather pouf; a walnut credenza with the TV and a soundbar on the olive wall; a camel armchair and
  // a reading lamp in the corner by the window, a floor lamp by the sofa, sand curtains, the radiator under the window, a fig tree
  F('r12', 'loungeSofa', 0.525, 4.45, 90, 2.1, 0.95, 0.82, 'olive'),
  Z(1.25, F('r13', 'picture', 0.065, 4.1, 90, 0.55, 0.03, 0.7, 'walnut')),
  Z(1.25, FV('poster', 'r14', 'picture', 0.065, 4.8, 90, 0.55, 0.03, 0.7, 'walnut')),
  FV('round', 'r15', 'sideTable', 0.3, 3.05, 0, 0.45, 0.45, 0.5, 'black'),
  Z(0.5, FV('candles', 'r16', 'decor', 0.3, 3.05, 90, 0.28, 0.12, 0.2, 'black')),
  FV('round', 'r17', 'tableCoffee', 1.75, 4.45, 0, 0.8, 0.8, 0.4, 'walnut'),
  F('r18', 'rug', 1.7, 4.45, 90, 2.4, 2, 0.012, 'linen'),
  Z(0.4, FV('books', 'r19', 'decor', 1.62, 4.3, 30, 0.3, 0.22, 0.12, 'terracotta')),
  Z(0.4, FV('vase', 'r20', 'decor', 1.9, 4.6, 0, 0.14, 0.14, 0.36, 'white')),
  F('r21', 'ottoman', 1.75, 3.5, 0, 0.5, 0.5, 0.4, 'walnut'),
  F('r22', 'tvStand', 3.25, 4.3, 270, 1.4, 0.4, 0.5, 'walnut'),
  Z(0.85, F('r23', 'tv', 3.42, 4.3, 270, 1.12, 0.06, 0.65)),
  Z(0.5, F('r24', 'soundbar', 3.33, 4.3, 270, 0.8, 0.08, 0.06, 'black')),
  Z(0.5, FV('vase', 'r25', 'decor', 3.25, 3.75, 270, 0.14, 0.14, 0.4, 'black')),
  Z(0.5, FV('books', 'r26', 'decor', 3.25, 4.85, 270, 0.26, 0.2, 0.14, 'sand')),
  F('r27', 'aircon', 3.34, 4.3, 270, 0.8, 0.22, 0.29),
  F('r28', 'loungeChair', 2.75, 5.35, 315, 0.8, 0.8, 0.78, 'sand'),
  F('r29', 'lampRoundFloor', 3.3, 5.8, 0, 0.3, 0.3, 1.55, 'linen'),
  F('r30', 'lampRoundFloor', 0.28, 5.72, 0, 0.4, 0.4, 1.6, 'graphite'),
  FV('open', 'r31', 'curtains', 1.75, 5.88, 0, 2.1, 0.14, 2.5, 'sand'),
  F('r32', 'radiator', 1.75, 5.9, 0, 1.1, 0.1, 0.5, 'white'),
  FV('ficus', 'r33', 'pottedPlant', 3.15, 3.25, 0, 0.6, 0.6, 1.7, 'terracotta'),
  FV('snake', 'r34', 'pottedPlant', 1.2, 5.62, 0, 0.32, 0.32, 0.8, 'black'),

  // kitchen: cream fronts in an L — the cooktop with an oven under a black chimney hood and a wall cabinet on the west wall, a blind
  // corner, the dishwasher, the sink under the window, a worktop with the fruit bowl and the fridge along the north wall; open walnut
  // shelves left of the window, the coffee machine; a round walnut table for four with graphite chairs, a hydrangea on it,
  // a picture over it, the radiator, a snake plant in the corner, a linen roller blind, rolled up
  F('k1', 'kitchenBase', 3.95, 4.35, 90, 0.6, 0.6, 0.9, 'beige'),
  FV('oven', 'k2', 'kitchenHob', 3.95, 5.05, 90, 0.6, 0.6, 0.9, 'beige'),
  F('k3', 'kitchenBase', 3.95, 5.65, 0, 0.6, 0.6, 0.9, 'beige'),
  F('k4', 'dishwasher', 4.55, 5.65, 0, 0.6, 0.6, 0.9, 'beige'),
  F('k5', 'kitchenSink', 5.15, 5.65, 0, 0.6, 0.6, 0.9, 'beige'),
  F('k6', 'kitchenBase', 5.75, 5.65, 0, 0.6, 0.6, 0.9, 'beige'),
  F('k7', 'fridge', 6.35, 5.625, 0, 0.6, 0.65, 1.85, 'white'),
  F('k8', 'kitchenWall', 3.825, 4.35, 90, 0.8, 0.35, 0.7, 'beige'),
  FV('dome', 'k9', 'hood', 3.9, 5.05, 90, 0.6, 0.5, 0.9, 'black'),
  Z(1.5, F('k10', 'wallShelf', 4, 5.81, 0, 0.65, 0.28, 0.04, 'walnut')),
  Z(1.9, F('k11', 'wallShelf', 4, 5.81, 0, 0.65, 0.28, 0.04, 'walnut')),
  Z(1.54, FV('books', 'k12', 'decor', 3.85, 5.82, 0, 0.24, 0.18, 0.16, 'terracotta')),
  Z(1.94, FV('vase', 'k13', 'decor', 4.15, 5.82, 0, 0.12, 0.12, 0.28, 'white')),
  Z(0.9, F('k14', 'coffee', 3.9, 4.1, 90, 0.25, 0.38, 0.38, 'black')),
  Z(0.9, FV('bowl', 'k15', 'decor', 5.62, 5.68, 0, 0.3, 0.3, 0.13, 'white')),
  Z(0.9, FV('snake', 'k16', 'pottedPlant', 5.92, 5.76, 0, 0.25, 0.25, 0.42, 'terracotta')),
  F('k17', 'tableRound', 5.75, 4.05, 0, 0.9, 0.9, 0.75, 'walnut'),
  Z(0.75, FV('flowers', 'k18', 'pottedPlant', 5.75, 4.05, 0, 0.3, 0.3, 0.35, 'white')),
  F('k19', 'chairCushion', 5.15, 4.05, 90, 0.45, 0.52, 0.84, 'graphite'),
  F('k20', 'chairCushion', 6.35, 4.05, 270, 0.45, 0.52, 0.84, 'graphite'),
  F('k21', 'chairCushion', 5.75, 3.45, 180, 0.45, 0.52, 0.84, 'graphite'),
  F('k22', 'chairCushion', 5.75, 4.65, 0, 0.45, 0.52, 0.84, 'graphite'),
  Z(1.35, F('k23', 'picture', 6.635, 4.05, 270, 0.6, 0.03, 0.75, 'black')),
  FV('panel', 'k24', 'radiator', 6.6, 4.95, 270, 0.6, 0.1, 0.5, 'white'),
  FV('snake', 'k25', 'pottedPlant', 6.45, 3.38, 0, 0.3, 0.3, 0.8, 'terracotta'),
  Z(1.95, FV('roller', 'k26', 'blind', 5.15, 5.92, 0, 1.6, 0.06, 0.42, 'linen')),

  // hallway: a cream sliding wardrobe along the west wall, a slim walnut shoe cabinet with a round mirror and a vase opposite,
  // a coat rack by the kitchen door, a terracotta runner
  FV('sliding', 'h1', 'wardrobeRun', 3.925, 1, 90, 1.9, 0.55, 2.5, 'beige'),
  F('h2', 'shoeCabinet', 5.03, 1.25, 270, 0.6, 0.24, 0.9, 'walnut'),
  Z(1.2, FV('round', 'h3', 'wallMirror', 5.135, 1.25, 270, 0.55, 0.03, 0.55, 'black')),
  Z(0.9, FV('vase', 'h4', 'decor', 5.03, 1.42, 270, 0.14, 0.14, 0.4, 'terracotta')),
  FV('shelf', 'h5', 'coatHooks', 4.95, 2.825, 0, 0.38, 0.25, 0.35, 'walnut'),
  F('h6', 'rug', 4.6, 1.4, 90, 2.2, 0.6, 0.012, 'terracotta'),

  // bathroom: a bathtub along the east wall with a black shower set, the washing machine with a walnut shelf and a plant above it,
  // a wall-hung walnut vanity with a round black mirror, a wall-hung toilet, a black towel warmer, a linen bath mat
  F('a1', 'bath', 6.3, 0.9, 270, 1.7, 0.7, 0.58, 'white'),
  F('a2', 'showerColumn', 6.3, 0.225, 180, 0.3, 0.35, 1.2, 'black'),
  F('a3', 'washer', 5.65, 0.325, 180, 0.6, 0.55, 0.85, 'white'),
  Z(1.25, F('a4', 'wallShelf', 5.65, 0.19, 180, 0.6, 0.28, 0.04, 'walnut')),
  Z(1.29, FV('snake', 'a5', 'pottedPlant', 5.5, 0.19, 0, 0.25, 0.25, 0.38, 'terracotta')),
  Z(1.29, FV('candles', 'a6', 'decor', 5.8, 0.19, 180, 0.24, 0.12, 0.16, 'white')),
  FV('wall', 'a7', 'vanity', 5.7, 2.725, 0, 0.6, 0.45, 0.85, 'walnut'),
  Z(1.15, FV('round', 'a8', 'wallMirror', 5.7, 2.935, 0, 0.55, 0.03, 0.55, 'black')),
  FV('wall', 'a9', 'toilet', 6.38, 2.675, 0, 0.38, 0.55, 0.8, 'white'),
  FV('ladder', 'a10', 'towelRail', 5.4, 1.05, 90, 0.5, 0.1, 0.8, 'black'),
  F('a11', 'rug', 5.65, 1.15, 90, 0.9, 0.5, 0.012, 'linen'),
];

worktop(FURNITURE, 'walnut'); // the kitchen's worktop: walnut

const LIGHTS = [
  {id: 'room_main', name: 'Ceiling light', room: 'room', kind: 'ceiling'},
  {id: 'room_pendant', name: 'Room pendant', room: 'room', kind: 'ceiling'},
  {id: 'room_bedside', name: 'Bedside lamps', room: 'room', kind: 'accent', color: '#ffd34d'},
  {id: 'room_floor', name: 'Floor lamp', room: 'room', kind: 'accent'},
  {id: 'room_reading', name: 'Reading floor lamp', room: 'room', kind: 'accent', color: '#ffd9a0'},
  {id: 'room_tv', name: 'TV backlight', room: 'room', kind: 'strip', color: '#ffb46b'},
  {id: 'kitchen_spots', name: 'Kitchen spots', room: 'kitchen', kind: 'ceiling'},
  {id: 'kitchen_pendant', name: 'Dining pendant', room: 'kitchen', kind: 'ceiling', color: '#ffc773'},
  {id: 'kitchen_worktop', name: 'Worktop strip', room: 'kitchen', kind: 'strip'},
  {id: 'kitchen_plinth', name: 'Plinth strip', room: 'kitchen', kind: 'strip', color: '#ffb46b'},
  {id: 'hall_spots', name: 'Hallway spots', room: 'hall', kind: 'ceiling'},
  {id: 'hall_mirror', name: 'Hall mirror light', room: 'hall', kind: 'accent'},
  {id: 'bathroom_spots', name: 'Bathroom spots', room: 'bathroom', kind: 'ceiling'},
  {id: 'bathroom_mirror', name: 'Mirror light', room: 'bathroom', kind: 'accent'},
];
// every light is placed: the ceiling light over the bed and the pendant over the coffee table, the bedside lamps on the nightstands,
// the floor lamps by the sofa and the armchair, the backlight behind the TV; the kitchen spots, the pendant over the table, the strip
// under the wall cabinet and the shelves, the toe-kick strip; spots in the hallway and the bathroom, the lights over both mirrors
const PLACED = [
  {id: 'room_main', placed: true, room: 'room', points: [[1.6, 1.4]]},
  {id: 'room_pendant', placed: true, room: 'room', form: 'pendant', h: 1.95, points: [[1.75, 4.45]]},
  {
    id: 'room_bedside',
    placed: true,
    room: 'room',
    form: 'lamp',
    opt: 'table',
    h: 0.9,
    points: [
      [0.25, 0.33],
      [0.25, 2.47],
    ],
  },
  {id: 'room_floor', placed: true, room: 'room', form: 'lamp', opt: 'floor', h: 1.5, points: [[0.28, 5.72]]},
  {id: 'room_reading', placed: true, room: 'room', form: 'lamp', opt: 'floor', h: 1.45, points: [[3.3, 5.8]]},
  {
    id: 'room_tv',
    placed: true,
    room: 'room',
    form: 'strip',
    h: 1.15,
    segments: [
      [
        [3.42, 3.8],
        [3.42, 4.8],
      ],
    ],
  },
  {
    id: 'kitchen_spots',
    placed: true,
    room: 'kitchen',
    form: 'spots',
    h: 2.58,
    points: [
      [4.55, 4.45],
      [4.55, 5.15],
      [5.3, 5.15],
    ],
  },
  {id: 'kitchen_pendant', placed: true, room: 'kitchen', form: 'pendant', h: 1.65, points: [[5.75, 4.05]]},
  {
    id: 'kitchen_worktop',
    placed: true,
    room: 'kitchen',
    form: 'strip',
    h: 1.42,
    segments: [
      [
        [3.68, 3.98],
        [3.68, 4.72],
      ],
      [
        [3.7, 5.88],
        [4.3, 5.88],
      ],
    ],
  },
  {
    id: 'kitchen_plinth',
    placed: true,
    room: 'kitchen',
    form: 'strip',
    h: 0.04,
    segments: [
      [
        [4.17, 3.97],
        [4.17, 5.35],
      ],
      [
        [4.25, 5.43],
        [6.03, 5.43],
      ],
    ],
  },
  {
    id: 'hall_spots',
    placed: true,
    room: 'hall',
    form: 'spots',
    h: 2.58,
    points: [
      [4.6, 0.7],
      [4.6, 1.5],
      [4.6, 2.3],
    ],
  },
  {id: 'hall_mirror', placed: true, room: 'hall', form: 'wall', h: 1.9, points: [[5.12, 1.25]]},
  {
    id: 'bathroom_spots',
    placed: true,
    room: 'bathroom',
    form: 'spots',
    h: 2.58,
    points: [
      [5.75, 0.9],
      [5.75, 1.9],
      [6.3, 1.3],
    ],
  },
  {id: 'bathroom_mirror', placed: true, room: 'bathroom', form: 'wall', h: 1.82, points: [[5.7, 2.92]]},
];

export default async function () {
  const HA = {areas: Object.fromEntries(ROOMS.map(r => [r.id, r.short])), lights: LIGHTS.map(haLight)};
  // Sensors: room air in the room (CO₂ is high after the night), the kitchen and the bathroom; a motion sensor's light level in the hallway;
  // diagnostic ones; energy meters
  const S = sensorKit(),
    add = S.add;
  add('room', 'room_air', 'Room sensor Temperature', 'temperature', '°C', 21.7);
  add('room', 'room_air', 'Room sensor Humidity', 'humidity', '%', 46);
  add('room', 'room_air', 'Room sensor CO2', 'carbon_dioxide', 'ppm', 1320);
  add('room', 'room_air', 'Room sensor Battery', 'battery', '%', 64, {cat: 'diagnostic'});
  add('kitchen', 'kitchen_th', 'Kitchen sensor Temperature', 'temperature', '°C', 22.9);
  add('kitchen', 'kitchen_th', 'Kitchen sensor Humidity', 'humidity', '%', 52);
  add('kitchen', 'fridge', 'Fridge Temperature', 'temperature', '°C', 4.4);
  add('bathroom', 'bath_th', 'Bathroom sensor Temperature', 'temperature', '°C', 25.1);
  add('bathroom', 'bath_th', 'Bathroom sensor Humidity', 'humidity', '%', 67);
  add('hall', 'hall_motion', 'Hallway motion Illuminance', 'illuminance', 'lx', 35);
  add('hall', 'hall_motion', 'Hallway motion Battery', 'battery', '%', 88, {cat: 'diagnostic'});
  add(null, 'home_meter', 'Main meter Energy', 'energy', 'kWh', 12087.4, {daily: 6.9, shape: 'home'});
  add('kitchen', 'fridge', 'Fridge Energy', 'energy', 'kWh', 1530.8, {daily: 1.2, shape: 'flat'});
  add('bathroom', 'washer', 'Washing machine Energy', 'energy', 'kWh', 588.3, {daily: 0.6, shape: 'day'});
  add('room', 'tv_plug', 'TV Energy', 'energy', 'kWh', 244.1, {daily: 0.35, shape: 'evening'});
  Object.assign(HA, {
    sensors: S.sensors,
    states: S.states,
    areaSensors: {room: {temperature_entity_id: 'sensor.room_air_temperature'}},
  });
  // Devices: the room air conditioner is off, curtains in the room are half closed, the kitchen blind is up, the front door and the room window
  // are closed; a water valve and leak sensors; a robot vacuum in the hallway
  const K = deviceKit();
  K.ac('room_ac', 'Air conditioner', 'room', 'off', 22, 21.7);
  K.cover('room_curtains', 'Room curtains', 'room', 'curtain', 50);
  K.cover('kitchen_blind', 'Kitchen roller blind', 'kitchen', 'blind', 100);
  K.contact('front_door', 'Front door', 'hall', 'door', false);
  K.contact('room_window', 'Room window', 'room', 'window', false);
  K.valve('water_main', 'Water shut-off valve', 'bathroom');
  K.leak('leak_bath', 'Leak under the bathtub', 'bathroom', 80);
  K.leak('leak_sink', 'Leak under the sink', 'kitchen', 95);
  K.vacuum('robot', 'Robot vacuum', 'hall');
  K.favorites([
    ['scene.good_morning', 'Good morning', null, '2026-11-08T06:45:00Z'],
    ['scene.movie', 'Movie', 'room', '2026-11-06T21:10:00Z'],
    ['switch.kettle', 'Kettle', 'kitchen', 'off'],
    ['switch.towel_rail', 'Towel rail', 'bathroom', 'on'],
    ['switch.bathroom_fan', 'Extractor fan', 'bathroom', 'off'],
  ]);
  Object.assign(HA, {devices: K.devices, entities: K.entities, extra: K.extra});
  HA.stats = stats(['sensor.home_meter_energy'], ['fridge', 'washer', 'tv_plug'], {
    'vacuum.robot': {hours: 0.5, drops: 2},
    'binary_sensor.leak_bath': {hours: 1, drops: 1},
  });
  HA.weather = WEATHER;
  const DEMO = {
    version: 1,
    units: 'm',
    rooms: ROOMS.map(r => ({id: r.id, name: r.short, polygon: r.polygon})),
    openings: OPENINGS,
    furniture: FURNITURE,
    lights: PLACED,
  };
  return {HA, DEMO, DEMO_UNDERLAY: null, STYLE};
}
