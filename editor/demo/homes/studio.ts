// @ts-nocheck
// Typical home 1 (docs/research/typical-homes.md, D-030): a studio, about 30 m² — a small hallway with a wardrobe, a shower room
// with the washing machine, one room with the kitchen along a wall, a dining table for two and a sofa bed. Made up: nobody's home.
// Design concept: a Nordic studio. Whitewashed oak floors, warm white limewash, one long whitewashed brick wall that carries both the
// kitchen and the sofa, a sage limewash window wall. Sage kitchen fronts, an oatmeal linen sofa bed, light oak furniture, black metal
// (track, hood, chairs, frames), terracotta pots, and one olive accent: the rug of the living corner. The room is zoned from the door
// to the window: kitchen, a round dining table for two on its own rug under a pendant, the living and sleeping corner by the window.
// Coordinates are metres, x is east, y is north. Rooms are separated by 10 cm walls; the editor adds the exterior walls itself.
// The default view looks from the south: the west wall (kitchen, sofa, prints) and the window wall face the camera.
import {door, win, F, haLight, sensorKit, deviceKit, stats, WEATHER, worktop} from '../kit.ts';

const FV = (v, ...a) => ({...F(...a), v}); // an item in a catalog variant
const Z = (z, f) => ({...f, z}); // an item at its own height above the floor (on furniture, on a shelf, on the wall)

// the room comes first: the hallway door opens into it; the shower room door opens into the hallway
const ROOMS = [
  {
    id: 'living',
    short: 'Living room',
    polygon: [
      [0, 2.4],
      [3.6, 2.4],
      [3.6, 8.4],
      [0, 8.4],
    ],
  },
  {
    id: 'hall',
    short: 'Hallway',
    polygon: [
      [2, 0],
      [3.6, 0],
      [3.6, 2.3],
      [2, 2.3],
    ],
  },
  {
    id: 'bathroom',
    short: 'Shower room',
    polygon: [
      [0, 0],
      [1.9, 0],
      [1.9, 2.3],
      [0, 2.3],
    ],
  },
];
// The room finishes itself (dress() fills only the rest): warm white limewash, whitewashed oak, the west wall in whitewashed brick
// (edge 3: behind the kitchen and the sofa), the window wall in sage limewash (edge 2). The style below does the hallway, the shower room
// and the oak slats behind the TV.
const FINISH = {
  living: {
    wall: 'plasterLime',
    wallTint: '#d9d2c6',
    floor: 'oakWhite',
    wf: [null, null, {k: 'plasterLime', tint: '#8e9a80'}, {k: 'brickWhite'}],
  },
};
const STYLE = {
  wall: {
    living: {k: 'plasterLime', tint: '#d9d2c6'},
    bed: {k: 'plasterLime', tint: '#cfc8bb'},
    kitchen: {k: 'plasterLime', tint: '#d9d2c6'},
    hall: {k: 'plasterLime', tint: '#cdc5b8'},
    kids: '#c9cfcc',
    office: {k: 'plasterLime', tint: '#cfc8bb'},
  },
  bed: {k: 'plasterLime', tint: '#8e9a80'},
  media: {k: 'slatsOak'},
  sofa: {k: 'plasterLime', tint: '#8e9a80'},
  splash: {k: 'zelligeWhite'},
  bath: {k: 'zellige', tint: '#a7b29c'},
  office: {k: 'slatsOak'},
  floor: {
    living: 'oakWhite',
    bed: 'oakWhite',
    kids: 'oakWhite',
    hall: 'oakWhite',
    office: 'oakWhite',
    kitchen: 'oakWhite',
    bath: 'terracotta',
  },
};

const OPENINGS = [
  door([2.6, 0], [3.5, 0]), // front door
  door([2.1, 2.35], [2.9, 2.35]), // hallway ↔ room
  door([1.95, 1.45], [1.95, 2.15]), // hallway ↔ shower room
  win([1.2, 8.4], [2.8, 8.4]), // room
];

const FURNITURE = [
  // kitchen along the west wall, backing onto the shower room: a sage tall unit with the integrated fridge, the sink, a slim dishwasher,
  // a base unit with the coffee machine, the cooktop with an oven under a black dome hood, a short end unit with a fruit bowl;
  // two open oak shelves instead of wall cabinets, with books, a bowl and a terracotta vase
  FV('doors', 'k1', 'kitchenTall', 0.35, 2.75, 90, 0.6, 0.6, 2.2, 'sage'),
  FV('one', 'k2', 'kitchenSink', 0.35, 3.35, 90, 0.6, 0.6, 0.9, 'sage'),
  F('k3', 'dishwasher', 0.35, 3.875, 90, 0.45, 0.6, 0.9, 'sage'),
  F('k4', 'kitchenBase', 0.35, 4.4, 90, 0.6, 0.6, 0.9, 'sage'),
  FV('oven', 'k5', 'kitchenHob', 0.35, 5, 90, 0.6, 0.6, 0.9, 'sage'),
  F('k6', 'kitchenBase', 0.35, 5.5, 90, 0.4, 0.6, 0.9, 'sage'),
  FV('dome', 'k7', 'hood', 0.3, 5, 90, 0.6, 0.5, 0.9, 'black'),
  F('k8', 'coffee', 0.3, 4.3, 90, 0.25, 0.4, 0.38, 'black'),
  Z(0.9, FV('bowl', 'k9', 'decor', 0.35, 5.5, 90, 0.3, 0.3, 0.14, 'white')),
  Z(1.5, F('k10', 'wallShelf', 0.19, 3.85, 90, 1.5, 0.28, 0.04, 'oak')),
  Z(1.9, F('k11', 'wallShelf', 0.19, 3.85, 90, 1.5, 0.28, 0.04, 'oak')),
  Z(1.54, FV('books', 'k12', 'decor', 0.19, 3.4, 90, 0.3, 0.22, 0.2, 'sand')),
  Z(1.54, FV('bowl', 'k13', 'decor', 0.19, 4.25, 90, 0.26, 0.26, 0.12, 'white')),
  Z(1.94, FV('vase', 'k14', 'decor', 0.19, 3.75, 90, 0.15, 0.15, 0.3, 'terracotta')),
  Z(1.94, FV('books', 'k15', 'decor', 0.19, 4.3, 90, 0.26, 0.2, 0.16, 'graphite')),
  // dining for two in the middle of the room: a round oak table on a round sand rug, two graphite chairs, flowers, a pendant above
  F('d1', 'tableRound', 2.2, 4.35, 0, 0.8, 0.8, 0.75, 'oak'),
  F('d2', 'chairCushion', 2.2, 3.81, 180, 0.45, 0.52, 0.84, 'graphite'),
  F('d3', 'chairCushion', 2.2, 4.89, 0, 0.45, 0.52, 0.84, 'graphite'),
  FV('round', 'd4', 'rug', 2.2, 4.35, 0, 1.8, 1.8, 0.012, 'sand'),
  Z(0.75, FV('flowers', 'd5', 'pottedPlant', 2.2, 4.35, 0, 0.3, 0.3, 0.36, 'white')),
  // living and sleeping corner by the window: the linen sofa bed against the brick wall (folded for the day) with two prints above it,
  // a floor lamp at its side and a reading sconce at the other, a round oak coffee table on an olive rug; facing it a low oak media sideboard
  // with the TV on the wall, a table lamp, a vase and books; a fig tree between the dining and living zones, a snake plant in the corner,
  // linen curtains on the sage window wall, the radiator under the window
  FV('day', 'l1', 'sofaBed', 0.525, 7.25, 90, 2, 0.95, 0.85, 'linen'),
  Z(1.15, FV('art', 'l2', 'picture', 0.065, 6.93, 90, 0.55, 0.03, 0.75, 'black')),
  Z(1.15, FV('art', 'l3', 'picture', 0.065, 7.57, 90, 0.55, 0.03, 0.75, 'black')),
  F('l4', 'lampRoundFloor', 0.27, 5.98, 0, 0.38, 0.38, 1.6, 'linen'),
  FV('round', 'l5', 'tableCoffee', 1.7, 7.25, 0, 0.7, 0.7, 0.38, 'oak'),
  F('l6', 'rug', 1.55, 7.25, 90, 2.1, 1.9, 0.012, 'olive'),
  Z(0.38, FV('candles', 'l7', 'decor', 1.72, 7.38, 0, 0.3, 0.14, 0.2, 'black')),
  Z(0.38, FV('books', 'l8', 'decor', 1.66, 7.08, 15, 0.26, 0.2, 0.12, 'terracotta')),
  F('l9', 'sideboard', 3.34, 7.25, 270, 1.4, 0.42, 0.55, 'oak'),
  Z(0.95, F('l10', 'tv', 3.52, 7.25, 270, 1.23, 0.06, 0.71)),
  Z(0.55, FV('vase', 'l11', 'decor', 3.34, 6.72, 270, 0.18, 0.18, 0.5, 'white')),
  Z(0.55, FV('books', 'l12', 'decor', 3.36, 7.42, 270, 0.3, 0.22, 0.14, 'sand')),
  FV('ficus', 'l13', 'pottedPlant', 3.22, 5.95, 0, 0.6, 0.6, 1.7, 'terracotta'),
  FV('snake', 'l14', 'pottedPlant', 3.33, 8.14, 0, 0.35, 0.35, 0.85, 'terracotta'),
  FV('open', 'l15', 'curtains', 2, 8.28, 0, 2.1, 0.14, 2.55, 'linen'),
  FV('panel', 'l16', 'radiator', 2, 8.3, 0, 1, 0.1, 0.5, 'white'),
  F('l17', 'aircon', 1.6, 2.56, 180, 0.8, 0.22, 0.29),
  F('l18', 'robotVacuum', 3.3, 2.68, 180, 0.34, 0.42, 0.1, 'black'),
  // hallway: an oatmeal sliding wardrobe along the east wall, an oak shoe cabinet with a mirror above it, candles and eucalyptus on it,
  // a coat rack with a shelf, a sand runner, the electrical panel by the front door
  FV('sliding', 'h1', 'wardrobeRun', 3.25, 1.65, 270, 1.2, 0.6, 2.5, 'beige'),
  F('h2', 'shoeCabinet', 2.2, 0.6, 90, 0.8, 0.3, 1, 'oak'),
  Z(1.15, FV('rect', 'h3', 'wallMirror', 2.065, 0.6, 90, 0.5, 0.03, 0.8, 'black')),
  Z(1, FV('candles', 'h4', 'decor', 2.2, 0.34, 90, 0.26, 0.12, 0.16, 'graphite')),
  Z(1, FV('vase', 'h5', 'decor', 2.2, 0.86, 90, 0.16, 0.16, 0.45, 'white')),
  Z(1.55, FV('shelf', 'h6', 'coatHooks', 2.175, 1.22, 90, 0.4, 0.25, 0.3, 'oak')),
  F('h7', 'rug', 2.65, 1.2, 90, 1.6, 0.6, 0.012, 'sand'),
  F('h8', 'elPanel', 2.3, 0.11, 180, 0.4, 0.12, 0.5, 'white'),
  // shower room on sage zellige and terracotta tiles: a black-framed corner shower (mirrored: glass to the east and north), the washing
  // machine with an oak shelf above it, a wall-hung toilet, a wall-hung oak vanity with a round mirror and a eucalyptus vase, a black towel
  // warmer by the door, a laundry basket, a bath mat
  {...FV('rect', 'b1', 'shower', 0.5, 0.5, 90, 0.9, 0.9, 2, 'black'), mx: true},
  F('b2', 'washer', 1.5, 0.325, 180, 0.6, 0.55, 0.85, 'white'),
  Z(1.25, F('b3', 'wallShelf', 1.5, 0.16, 180, 0.6, 0.22, 0.03, 'oak')),
  Z(1.28, FV('candles', 'b4', 'decor', 1.5, 0.16, 180, 0.28, 0.12, 0.16, 'white')),
  FV('wall', 'b5', 'toilet', 0.325, 1.4, 90, 0.38, 0.55, 0.8, 'white'),
  FV('wall', 'b6', 'vanity', 1.2, 2.025, 0, 0.6, 0.45, 0.85, 'oak'),
  Z(1.2, FV('round', 'b7', 'wallMirror', 1.2, 2.235, 0, 0.5, 0.03, 0.5, 'black')),
  Z(0.85, FV('vase', 'b8', 'decor', 1.42, 2.08, 0, 0.14, 0.14, 0.38, 'white')),
  FV('ladder', 'b9', 'towelRail', 1.8, 1, 270, 0.5, 0.1, 0.8, 'black'),
  F('b10', 'laundryBasket', 0.25, 2.05, 0, 0.35, 0.3, 0.5, 'sand'),
  F('b11', 'rug', 1.1, 1.15, 0, 0.7, 0.5, 0.012, 'linen'),
];

worktop(FURNITURE, 'oak'); // the kitchen's worktop: oak

const LIGHTS = [
  {id: 'kitchen_track', name: 'Kitchen track', room: 'living', kind: 'ceiling'},
  {id: 'kitchen_worktop', name: 'Worktop strip', room: 'living', kind: 'strip'},
  {id: 'dining_pendant', name: 'Dining pendant', room: 'living', kind: 'ceiling', color: '#ffc773'},
  {id: 'living_pendant', name: 'Living room pendant', room: 'living', kind: 'ceiling'},
  {id: 'living_floor', name: 'Floor lamp', room: 'living', kind: 'accent'},
  {id: 'living_reading', name: 'Reading wall lamp', room: 'living', kind: 'accent', color: '#ffd9a0'},
  {id: 'living_table', name: 'Sideboard table lamp', room: 'living', kind: 'accent'},
  {id: 'living_curtain', name: 'Curtain light', room: 'living', kind: 'cove', color: '#ffd9a8'},
  {id: 'hall_spots', name: 'Hallway spots', room: 'hall', kind: 'ceiling'},
  {id: 'bathroom_spots', name: 'Shower room spots', room: 'bathroom', kind: 'ceiling'},
  {id: 'bathroom_mirror', name: 'Mirror light', room: 'bathroom', kind: 'accent'},
];
// every lamp is placed: by day the floor, wall and table lamps and the strips (worktop, curtain cove) are on, the ceiling lights are off
const PLACED = [
  {
    id: 'kitchen_track',
    placed: true,
    room: 'living',
    form: 'line',
    h: 2.58,
    segments: [
      [
        [1.05, 2.95],
        [1.05, 5.45],
      ],
    ],
  },
  {
    id: 'kitchen_worktop',
    placed: true,
    room: 'living',
    segments: [
      [
        [0.38, 3.1],
        [0.38, 5.65],
      ],
    ],
  },
  {id: 'dining_pendant', placed: true, room: 'living', form: 'pendant', h: 1.65, points: [[2.2, 4.35]]},
  {id: 'living_pendant', placed: true, room: 'living', form: 'pendant', h: 2, points: [[1.7, 7.25]]},
  {
    id: 'living_floor',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'floor',
    h: 1.5,
    points: [[0.27, 5.98]],
  },
  {id: 'living_reading', placed: true, room: 'living', form: 'wall', h: 1.45, points: [[0.07, 8.08]]},
  {
    id: 'living_table',
    placed: true,
    room: 'living',
    form: 'lamp',
    opt: 'table',
    h: 0.95,
    points: [[3.36, 7.8]],
  },
  {
    id: 'living_curtain',
    placed: true,
    room: 'living',
    segments: [
      [
        [0.15, 8.3],
        [3.45, 8.3],
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
      [2.65, 0.65],
      [2.65, 1.75],
    ],
  },
  {
    id: 'bathroom_spots',
    placed: true,
    room: 'bathroom',
    form: 'spots',
    h: 2.58,
    points: [
      [0.5, 0.5],
      [1.25, 1.35],
    ],
  },
  {id: 'bathroom_mirror', placed: true, room: 'bathroom', form: 'wall', h: 1.85, points: [[1.2, 2.23]]},
];

export default async function () {
  const HA = {areas: Object.fromEntries(ROOMS.map(r => [r.id, r.short])), lights: LIGHTS.map(haLight)};
  // Sensors: room air (temperature, humidity, CO₂) and the shower room; diagnostic ones; the fridge thermometer is not room air; energy meters.
  const S = sensorKit(),
    add = S.add;
  add('living', 'room_air', 'Room sensor Temperature', 'temperature', '°C', 22.4);
  add('living', 'room_air', 'Room sensor Humidity', 'humidity', '%', 41);
  add('living', 'room_air', 'Room sensor CO2', 'carbon_dioxide', 'ppm', 1060);
  add('living', 'room_air', 'Room sensor Battery', 'battery', '%', 73, {cat: 'diagnostic'});
  add('living', 'fridge', 'Fridge Temperature', 'temperature', '°C', 3.8);
  add('living', 'tv_plug', 'TV plug Device temperature', 'temperature', '°C', 36, {cat: 'diagnostic'});
  add('bathroom', 'shower_th', 'Shower room sensor Temperature', 'temperature', '°C', 24.3);
  add('bathroom', 'shower_th', 'Shower room sensor Humidity', 'humidity', '%', 71);
  add(null, 'home_meter', 'Main meter Energy', 'energy', 'kWh', 9412.7, {daily: 5.6, shape: 'home'});
  add('living', 'fridge', 'Fridge Energy', 'energy', 'kWh', 803.5, {daily: 0.9, shape: 'flat'});
  add('living', 'dishwasher', 'Dishwasher Energy', 'energy', 'kWh', 311.2, {daily: 0.5, shape: 'evening'});
  add('bathroom', 'washer', 'Washing machine Energy', 'energy', 'kWh', 402.9, {daily: 0.5, shape: 'day'});
  Object.assign(HA, {sensors: S.sensors, states: S.states});
  // Devices: the air conditioner is heating, underfloor heating in the shower room, the curtains are open, the front door and the window are closed,
  // a water valve and leak sensors, a robot vacuum
  const K = deviceKit();
  K.ac('living_ac', 'Air conditioner', 'living', 'heat', 23, 22.4);
  K.thermostat('shower_floor', 'Underfloor heating', 'bathroom', 28, 24.3);
  K.cover('living_curtains', 'Curtains', 'living', 'curtain', 100);
  K.contact('front_door', 'Front door', 'hall', 'door', false);
  K.contact('living_window', 'Window', 'living', 'window', false);
  K.valve('water_main', 'Water shut-off valve', 'bathroom');
  K.leak('leak_washer', 'Leak under the washer', 'bathroom', 91);
  K.leak('leak_sink', 'Leak under the sink', 'living', 58);
  K.vacuum('robot', 'Robot vacuum', 'living');
  K.favorites([
    ['scene.evening', 'Evening', 'living', '2026-11-07T19:05:00Z'],
    ['script.leaving', 'Leaving home', null, 'off'],
    ['switch.kettle', 'Kettle', 'living', 'off'],
    ['switch.bathroom_fan', 'Extractor fan', 'bathroom', 'off'],
  ]);
  Object.assign(HA, {devices: K.devices, entities: K.entities, extra: K.extra});
  HA.stats = stats(['sensor.home_meter_energy'], ['fridge', 'dishwasher', 'washer'], {
    'climate.living_ac': {hours: 1.5, drops: 2},
  });
  HA.weather = WEATHER;
  const DEMO = {
    version: 1,
    units: 'm',
    rooms: ROOMS.map(r => ({id: r.id, name: r.short, polygon: r.polygon, ...FINISH[r.id]})),
    openings: OPENINGS,
    furniture: FURNITURE,
    lights: PLACED,
  };
  return {HA, DEMO, DEMO_UNDERLAY: null, STYLE};
}
