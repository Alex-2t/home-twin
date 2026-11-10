// The repository's demo apartment: a typical three-room apartment, about 78 m² (type 5 from docs/research/typical-homes.md, D-030) —
// hallway with a corridor, living room with a balcony, bedroom, kids' room, kitchen, combined bathroom. Made up: nobody's apartment.
// Design concept: a warm family home. Honey oak, linen and sand for the big pieces, terracotta and sage as the accents that repeat
// from room to room (armchairs, rugs, pots, the kitchen, the bistro set), black metal, Venetian plaster walls (the `warm` style) with
// a fluted oak media wall and a terracotta plaster headboard wall; the kids' room is sage and navy, cheerful but calm.
// Coordinates are metres, x is east, y is north. Rooms are separated by 10 cm walls; the editor adds the exterior walls itself.
// The wall face is 5 cm inside a room's outline, so items stand with their backs 5 cm in. Shared demo parts are in kit.mjs.
import {door,win,F,haLight,sensorKit,deviceKit,stats,WEATHER,NO_AREA_LAMP,STYLES,worktop} from './kit.mjs';

const FV=(v,...a)=>({...F(...a),v}); // an item in a catalog variant
const Z=(z,f)=>({...f,z});           // an item at its own height above the floor

const ROOMS=[
  {id:'hall',short:'Hallway',polygon:[[5.4,0],[6.9,0],[6.9,3.7],[4.5,3.7],[4.5,5],[3.5,5],[3.5,2],[5.4,2]]},
  {id:'living',short:'Living room',polygon:[[4.6,3.8],[10.4,3.8],[10.4,7.6],[3.5,7.6],[3.5,5.1],[4.6,5.1]]},
  {id:'bedroom',short:'Bedroom',polygon:[[0,3.8],[3.4,3.8],[3.4,7.6],[0,7.6]]},
  {id:'kids',short:"Kids' room",polygon:[[0,0],[3.4,0],[3.4,3.7],[0,3.7]]},
  {id:'kitchen',short:'Kitchen',polygon:[[7,0],[10.4,0],[10.4,3.7],[7,3.7]]},
  {id:'bathroom',short:'Bathroom',polygon:[[3.5,0],[5.3,0],[5.3,1.9],[3.5,1.9]]},
  {id:'balcony',short:'Balcony',polygon:[[5.5,7.85],[9,7.85],[9,8.95],[5.5,8.95]]},
];
// The `warm` style with an oak media wall (the home's wood) and a quiet warm white in the kids' room instead of blush; the kids' room's
// north wall, behind the bed and the toy shelf, is sage; the balcony has a grey wooden deck
const STYLE={...STYLES.warm,media:{k:'flutedOak'},wall:{...STYLES.warm.wall,kids:'#cdc6b5'}};
const FINISH={kids:{wf:[null,null,{k:'paintSage',tint:'#8f9c86'},null]},balcony:{floor:'woodGrey'}};

const OPENINGS=[
  door([5.75,0],[6.65,0]),                       // front door
  door([4.15,1.95],[4.85,1.95]),                 // hallway ↔ bathroom
  door([3.45,2.4],[3.45,3.2]),                   // hallway ↔ kids' room
  door([3.45,4.05],[3.45,4.85]),                 // corridor ↔ bedroom
  door([5.2,3.75],[6.5,3.75],2.3),               // hallway ↔ living room, wide opening
  door([6.95,2.5],[6.95,3.3]),                   // hallway ↔ kitchen
  door([6,7.725],[6.8,7.725],2.2),               // living room ↔ balcony
  win([7.1,7.725],[8.7,7.725]),                  // living room, onto the balcony
  win([3.9,7.6],[5.2,7.6]),                      // living room, to the outside
  win([.8,7.6],[2.6,7.6]),                       // bedroom
  win([.8,0],[2.6,0]),                           // kids' room
  win([7.9,0],[9.5,0]),                          // kitchen
  win([5.6,8.95],[8.9,8.95],.9,2.45),            // balcony glazing
  win([9,7.95],[9,8.85],.9,2.45),win([5.5,7.95],[5.5,8.85],.9,2.45),
];

const FURNITURE=[
  // living room, sitting area: an oak TV bench on the fluted oak media wall (the west wall of the alcove) with the TV, a soundbar,
  // books and candles; a linen sofa facing it on a big sand rug, a round oak coffee table, a terracotta armchair turned to the TV,
  // a side table at the sofa's arm, a fiddle-leaf fig by the alcove window, a picture between the window and the balcony door
  F('l1','tvStand',3.76,6.3,90,1.8,.42,.5,'oak'),Z(.9,F('l2','tv',3.58,6.3,90,1.45,.06,.83)),F('l3','soundbar',3.68,6.3,90,1,.1,.07,'black'),
  Z(.5,FV('books','l4','decor',3.8,5.62,90,.3,.22,.2,'terracotta')),Z(.5,FV('candles','l5','decor',3.82,6.98,90,.32,.14,.22,'white')),
  FV('ficus','l6','pottedPlant',4.3,7.22,0,.6,.6,1.7,'terracotta'),F('l7','rug',5.75,6.3,0,2.9,2.2,.012,'sand'),
  F('l8','loungeSofa',7.31,6.3,270,2.2,.95,.85,'linen'),FV('round','l9','tableCoffee',5.95,6.3,0,.9,.9,.4,'oak'),
  Z(.4,FV('books','l10','decor',5.8,6.18,0,.3,.22,.2,'sand')),Z(.4,FV('candles','l11','decor',6.1,6.5,0,.32,.14,.22,'terracotta')),
  F('l12','loungeChair',6.1,4.75,225,.78,.8,.78,'terracotta'),FV('round','l13','sideTable',7.3,4.95,0,.45,.45,.5,'oak'),
  Z(.5,FV('vase','l14','decor',7.3,4.95,0,.16,.16,.42,'white')),Z(1.3,F('l15','picture',5.6,7.535,0,.55,.03,.75,'oak')),
  // behind the sofa: an oak console with a table lamp, a vase of eucalyptus and books, a linen floor lamp and a monstera by the balcony window
  F('l16','console',7.98,6.3,270,1.4,.35,.75,'oak'),Z(.75,FV('vase','l17','decor',7.98,5.82,0,.18,.18,.5,'white')),
  Z(.75,FV('books','l18','decor',7.98,6.78,90,.3,.22,.2,'oak')),F('l19','lampRoundFloor',8.05,7.3,0,.4,.4,1.6,'linen'),
  FV('monstera','l20','pottedPlant',8.55,7.22,0,.55,.55,.9,'sand'),
  // reading corner in the east part: an oak bookcase on the north wall, two olive armchairs facing each other over a small oak table
  // with hydrangeas, all on a round terracotta rug, a reading floor lamp, a palm in the corner, the dog's bed
  F('l21','shelf',9.6,7.375,0,1.4,.35,2,'oak'),F('l22','loungeChair',9.5,6.6,0,.8,.8,.78,'olive'),F('l23','loungeChair',9.5,5,180,.8,.8,.78,'olive'),
  FV('round','l24','sideTable',9.5,5.8,0,.5,.5,.5,'oak'),Z(.5,FV('flowers','l25','pottedPlant',9.5,5.8,0,.3,.3,.35,'white')),
  FV('round','l26','rug',9.45,5.8,0,1.7,1.7,.012,'terracotta'),F('l27','lampRoundFloor',10.12,6.75,0,.38,.38,1.55,'linen'),
  FV('palm','l28','pottedPlant',10,4.22,0,.7,.7,1.5,'terracotta'),FV('round','l29','petBed',8.6,4.4,0,.7,.7,.2,'sand'),
  // the west wall by the hallway opening: a picture over a floor vase of pampas; linen curtains on the alcove window and the balcony side
  Z(1.3,F('l30','picture',4.665,4.48,90,.8,.03,.6,'black')),FV('pampas','l31','floorVase',4.88,4.2,0,.4,.4,1.2,'sand'),
  FV('open','l32','curtains',4.55,7.48,0,1.7,.14,2.5,'linen'),FV('open','l33','curtains',7.35,7.48,0,3,.14,2.5,'linen'),

  // kitchen: sage fronts — an oven tower, base units, the cooktop under a black chimney hood and the sink along the north wall, the
  // dishwasher and an integrated fridge column on the east wall; oak open shelves left of the hood, beige wall cabinets right of it,
  // a coffee machine and a fruit bowl on the worktop, cookbooks and a vase on the shelves; a proper dining table at the window with a bench under it, two chairs,
  // hydrangeas, two pendants over it, a picture on the west wall, a glass-door hutch for the good china, a linen roller blind
  FV('oven','k1','kitchenTall',7.6,3.35,0,.6,.6,2.2,'sage'),F('k2','kitchenBase',8.2,3.35,0,.6,.6,.9,'sage'),
  FV('drawers','k3','kitchenHob',8.85,3.35,0,.7,.6,.9,'sage'),F('k4','kitchenBase',9.45,3.35,0,.5,.6,.9,'sage'),
  FV('one','k5','kitchenSink',10.025,3.35,0,.65,.6,.9,'sage'),F('k6','dishwasher',10.05,2.75,270,.6,.6,.9,'sage'),
  FV('doors','k7','kitchenTall',10.05,2.15,270,.6,.6,2.2,'sage'),FV('dome','k8','hood',8.85,3.4,0,.7,.5,.9,'black'),
  Z(1.5,F('k9','wallShelf',8.2,3.51,0,.55,.28,.04,'oak')),Z(1.9,F('k10','wallShelf',8.2,3.51,0,.55,.28,.04,'oak')),
  F('k11','kitchenWall',9.775,3.475,0,1.15,.35,.7,'beige'),F('k12','coffee',8.12,3.45,0,.28,.38,.4,'black'),
  Z(.9,FV('bowl','k13','decor',9.45,3.3,0,.32,.32,.14,'white')),Z(1.54,FV('books','k22','decor',8.1,3.52,0,.3,.2,.2,'sand')),
  Z(1.94,FV('vase','k23','decor',8.3,3.53,0,.16,.16,.36,'terracotta')),
  F('k14','diningTable',8.3,1,0,1.5,.85,.75,'oak'),F('k15','bench',8.3,.25,0,1.4,.4,.45,'oak'),
  F('k16','chairCushion',7.95,1.62,0,.45,.52,.85,'white'),F('k17','chairCushion',8.65,1.62,0,.45,.52,.85,'white'),
  Z(.75,FV('flowers','k18','pottedPlant',8.3,1,0,.3,.3,.35,'white')),Z(1.2,F('k19','picture',7.065,1,90,.6,.03,.8,'oak')),
  F('k20','displayCabinet',10.15,1,270,.9,.4,1.9,'oak'),FV('roller','k21','blind',8.7,.08,180,1.7,.06,1.4,'linen'),

  // bedroom: an oak bed with its headboard on the terracotta plaster wall, oak nightstands with table lamps, a picture over the bed,
  // a linen rug; a white sliding wardrobe on the south wall; an oak dresser with a round mirror, a vase and candles; an olive reading
  // chair and a floor lamp by the window, linen curtains, a monstera in the corner
  F('b1','bed',1.1,6,90,1.6,2.1,1.05,'oak'),F('b2','nightstand',.25,7.07,90,.5,.4,.5,'oak'),F('b3','nightstand',.25,4.93,90,.5,.4,.5,'oak'),
  Z(1.3,F('b4','picture',.065,6,90,1.2,.03,.6,'oak')),F('b5','rug',1.55,6,90,2.6,2,.012,'linen'),
  FV('sliding','b6','wardrobe',2.1,4.15,180,2,.6,2.4,'white'),F('b7','dresser',3.125,5.7,270,1.2,.45,.8,'oak'),
  Z(1.2,FV('round','b8','wallMirror',3.335,5.7,270,.7,.03,.7,'black')),Z(.8,FV('vase','b9','decor',3.15,5.3,0,.18,.18,.5,'terracotta')),
  Z(.8,FV('candles','b10','decor',3.13,6.05,90,.32,.14,.22,'sand')),F('b11','loungeChair',2.82,7.02,315,.72,.72,.78,'olive'),
  F('b12','lampRoundFloor',2.25,7.36,0,.35,.35,1.5,'linen'),FV('open','b13','curtains',1.7,7.48,0,2.2,.14,2.55,'linen'),
  FV('monstera','b14','pottedPlant',.4,4.22,0,.6,.6,.9,'sand'),

  // kids' room: a navy upholstered bed along the sage wall with a shelf of books and a snake plant above it (out of reach), a white toy shelf with linen-toned bins
  // with a poster, an oak desk at the window with a navy chair, a sage built-in wardrobe, oak wall bars, a round navy rug,
  // a sand reading chair in the corner by the window, navy curtains
  F('c1','bed',1.05,3.2,90,.9,2,.9,'navy'),Z(1.45,F('c2','wallShelf',1.05,3.55,0,1,.2,.03,'oak')),
  Z(1.48,FV('books','c3','decor',.75,3.55,0,.3,.2,.2,'white')),Z(1.48,FV('snake','c4','pottedPlant',1.35,3.55,0,.25,.25,.4,'white')),
  FV('neutral','c5','toyStorage',2.6,3.43,0,.9,.44,.56,'white'),Z(1.2,FV('poster','c6','picture',2.6,3.635,0,.6,.03,.8,'oak')),
  F('c7','desk',1.7,.35,180,1.2,.6,.75,'oak'),F('c8','chairDesk',1.7,.95,0,.55,.55,.95,'navy'),
  FV('hinged','c9','wardrobeRun',3.075,.85,270,1.6,.55,2.2,'sage'),FV('plain','c10','wallBars',.125,1.75,90,.8,.15,2.3,'oak'),
  FV('round','c11','rug',1.75,1.9,0,1.5,1.5,.012,'navy'),F('c12','loungeChair',.55,.55,45,.65,.7,.75,'sand'),
  FV('open','c13','curtains',1.7,.12,180,2.2,.14,2.4,'navy'),

  // bathroom: a bathtub along the south wall with a black shower set, the toilet and the washing machine on the west wall (a snake
  // plant on top), an oak vanity with an arched mirror on the east wall, a black towel warmer by the door, a linen bath mat
  F('a1','bath',4.4,.425,180,1.7,.75,.58,'white'),F('a2','showerColumn',3.75,.225,180,.3,.35,1.2,'black'),
  FV('floor','a3','toilet',3.875,1.03,90,.38,.65,.8,'white'),F('a4','washer',3.825,1.55,90,.6,.55,.85,'white'),
  Z(.85,FV('snake','a5','pottedPlant',3.8,1.68,0,.25,.25,.45,'white')),FV('floor','a6','vanity',5.025,1.225,270,.75,.45,.85,'oak'),
  Z(1.15,FV('arch','a7','wallMirror',5.235,1.225,270,.55,.03,.8,'black')),FV('ladder','a8','towelRail',5.075,1.8,0,.35,.1,.8,'black'),
  F('a9','rug',4.45,1.08,0,.8,.5,.012,'linen'),

  // hallway: an oak shoe cabinet with a mirror, eucalyptus by the front door, the electrical panel, a beige built-in
  // sliding wardrobe opposite; a bench with a coat rack at the corridor, a terracotta runner and a sand mat, a picture at the end of the corridor,
  // a floor vase by the kitchen door
  F('h1','shoeCabinet',5.6,.55,90,.8,.3,1,'oak'),Z(1.15,F('h2','wallMirror',5.465,.55,90,.6,.03,.9,'black')),
  Z(1,FV('eucalyptus','h4','floorVase',5.6,.8,0,.2,.2,.45,'white')),
  F('h5','elPanel',5.51,1.65,90,.35,.12,.5,'white'),FV('sliding','h6','wardrobeRun',6.55,1.7,270,1.4,.6,2.4,'beige'),
  F('h7','bench',4.81,3.45,0,.72,.38,.45,'oak'),FV('shelf','h8','coatHooks',4.81,3.525,0,.72,.25,.35,'oak'),
  F('h9','rug',5.1,2.85,0,2.6,.8,.012,'terracotta'),F('h10','rug',6.05,1.2,90,1.6,.7,.012,'sand'),
  Z(1.35,F('h11','picture',4,4.935,0,.5,.03,.7,'oak')),FV('eucalyptus','h12','floorVase',6.7,3.48,0,.3,.3,1,'terracotta'),

  // balcony: a sage bistro set on a terracotta rug with candles on the table, a palm and hydrangeas in terracotta pots
  F('p1','rug',8.1,8.4,0,1.6,.9,.012,'terracotta'),FV('round','p2','patioTable',8.15,8.4,0,.6,.6,.74,'sage'),
  F('p3','patioChair',7.65,8.4,90,.5,.55,.82,'sage'),F('p4','patioChair',8.65,8.4,270,.5,.55,.82,'sage'),
  Z(.74,FV('candles','p5','decor',8.15,8.4,0,.3,.14,.2,'white')),FV('palm','p6','pottedPlant',5.95,8.45,0,.75,.75,1.5,'terracotta'),
  FV('flowers','p7','pottedPlant',7,8.6,0,.5,.5,.6,'terracotta'),
];

worktop(FURNITURE,'oak'); // the kitchen's worktop: oak

const LIGHTS=[
  {id:'hall_spots',name:'Hall spots',room:'hall',kind:'ceiling'},
  {id:'living_main',name:'Living room pendant',room:'living',kind:'ceiling',color:'#ffc773'},
  {id:'living_cove',name:'Ceiling cove light',room:'living',kind:'cove'},
  {id:'living_tv',name:'TV backlight',room:'living',kind:'strip'},
  {id:'living_floor',name:'Floor lamp',room:'living',kind:'accent'},
  {id:'living_table',name:'Table lamp',room:'living',kind:'accent',color:'#ffd9a0'},
  {id:'living_reading',name:'Reading floor lamp',room:'living',kind:'accent'},
  {id:'kitchen_spots',name:'Kitchen spots',room:'kitchen',kind:'ceiling'},
  {id:'kitchen_pendants',name:'Dining pendants',room:'kitchen',kind:'ceiling',color:'#ffc773'},
  {id:'kitchen_worktop_led',name:'Worktop strip',room:'kitchen',kind:'strip'},
  {id:'bedroom_main',name:'Ceiling light',room:'bedroom',kind:'ceiling'},
  {id:'bedroom_bedside',name:'Bedside lamps',room:'bedroom',kind:'accent',color:'#ffd9a0'},
  {id:'bedroom_reading',name:'Reading floor lamp',room:'bedroom',kind:'accent'},
  {id:'kids_main',name:'Ceiling light',room:'kids',kind:'ceiling'},
  {id:'kids_desk',name:'Desk lamp',room:'kids',kind:'accent'},
  {id:'kids_night',name:'Night light',room:'kids',kind:'accent',color:'#ffb46b'},
  {id:'bathroom_spots',name:'Bathroom spots',room:'bathroom',kind:'ceiling'},
  {id:'bathroom_mirror',name:'Mirror light',room:'bathroom',kind:'accent'},
  {id:'balcony_main',name:'Ceiling lamp',room:'balcony',kind:'ceiling'},
];
// every lamp is placed (the plug-in floor lamp with no area is not: the wizard asks where it is). Table lamps stand on their
// furniture: the point is the bulb, 42 cm above the top
const PLACED=[
  {id:'hall_spots',placed:true,room:'hall',form:'spots',h:2.58,points:[[6.12,.6],[5.95,1.6],[5.05,2.85],[3.95,2.85],[4,4.25]]},
  {id:'living_main',placed:true,room:'living',form:'pendant',h:1.95,points:[[5.95,6.3]]},
  {id:'living_cove',placed:true,room:'living',segments:[[[3.65,5.25],[3.65,7.45]]]},
  {id:'living_tv',placed:true,room:'living',form:'strip',h:1.35,segments:[[[3.57,5.75],[3.57,6.85]]]},
  {id:'living_floor',placed:true,room:'living',form:'lamp',opt:'floor',h:1.5,points:[[8.05,7.3]]},
  {id:'living_table',placed:true,room:'living',form:'lamp',opt:'table',h:1.17,points:[[7.98,6.32]]},
  {id:'living_reading',placed:true,room:'living',form:'lamp',opt:'floor',h:1.45,points:[[10.12,6.75]]},
  {id:'kitchen_spots',placed:true,room:'kitchen',form:'spots',h:2.58,points:[[7.95,2.7],[9.05,2.7],[9.5,1.9]]},
  {id:'kitchen_pendants',placed:true,room:'kitchen',form:'pendant',h:1.65,points:[[7.95,1],[8.65,1]]},
  {id:'kitchen_worktop_led',placed:true,room:'kitchen',segments:[[[7.95,3.5],[10.3,3.5]]]},
  {id:'bedroom_main',placed:true,room:'bedroom',points:[[1.7,5.9]]},
  {id:'bedroom_bedside',placed:true,room:'bedroom',form:'lamp',opt:'table',h:.92,points:[[.25,7.07],[.25,4.93]]},
  {id:'bedroom_reading',placed:true,room:'bedroom',form:'lamp',opt:'floor',h:1.4,points:[[2.25,7.36]]},
  {id:'kids_main',placed:true,room:'kids',points:[[1.75,1.9]]},
  {id:'kids_desk',placed:true,room:'kids',form:'lamp',opt:'table',h:1.17,points:[[2.1,.3]]},
  {id:'kids_night',placed:true,room:'kids',form:'lamp',opt:'table',h:.98,points:[[2.85,3.43]]},
  {id:'bathroom_spots',placed:true,room:'bathroom',form:'spots',h:2.58,points:[[3.95,.45],[4.85,.45],[4.45,1.4]]},
  {id:'bathroom_mirror',placed:true,room:'bathroom',form:'wall',h:2,points:[[5.24,1.225]]},
  {id:'balcony_main',placed:true,room:'balcony',points:[[7.25,8.4]]},
];

export default async function(){
  const HA={areas:Object.fromEntries(ROOMS.map(r=>[r.id,r.short])),lights:LIGHTS.map(haLight)};
  // Sensors: climate in the bedroom, kids' room, living room, bathroom and kitchen; diagnostic ones (battery, plug temperature); energy meters.
  // The kitchen has its own temperature sensor set on the area, as in HA. A thermometer with no area — the wizard will ask where it is.
  const S=sensorKit(),add=S.add;
  add('bedroom','bedroom_th','Bedroom sensor Temperature','temperature','°C',21.6);add('bedroom','bedroom_th','Bedroom sensor Humidity','humidity','%',44);
  add('bedroom','bedroom_th','Bedroom sensor Battery','battery','%',87,{cat:'diagnostic'});
  add('bedroom','bedroom_plug','Bedside plug Device temperature','temperature','°C',38,{cat:'diagnostic'});
  add('kitchen','kitchen_air','Air monitor Temperature','temperature','°C',23.1);add('kitchen','kitchen_air','Air monitor Humidity','humidity','%',38);
  add('kitchen','kitchen_air','Air monitor CO2','carbon_dioxide','ppm',1180);add('kitchen','kitchen_air','Air monitor PM2.5','pm25','µg/m³',9);
  add('kitchen','kitchen_fridge','Fridge Temperature','temperature','°C',4.2);
  add('kids','kids_air','Kids\' room sensor Temperature','temperature','°C',22.4);add('kids','kids_air','Kids\' room sensor Humidity','humidity','%',47);
  add('kids','kids_air','Kids\' room sensor CO2','carbon_dioxide','ppm',760);add('kids','kids_lux','Kids\' room sensor Illuminance','illuminance','lx',320);
  add('living','living_th','Living room sensor Temperature','temperature','°C',22.1);add('living','living_th','Living room sensor Humidity','humidity','%',45);
  add('kitchen','kettle','Kettle Power','power','W',1840);
  add(null,'aqara','Aqara thermometer Temperature','temperature','°C',20.9);add(null,'aqara','Aqara thermometer Humidity','humidity','%',51);
  add('bathroom','bath_th','Bathroom sensor Temperature','temperature','°C',24.8);add('bathroom','bath_th','Bathroom sensor Humidity','humidity','%',68);
  add(null,'home_meter','Main meter Energy','energy','kWh',18342.6,{daily:9.8,shape:'home'});
  add('kitchen','kitchen_fridge','Fridge Energy','energy','kWh',1204.3,{daily:1.1,shape:'flat'});add('kitchen','kettle','Kettle Energy','energy','kWh',412.8,{daily:.45,shape:'home'});
  add('bathroom','washer','Washing machine Energy','energy','kWh',655.1,{daily:.7,shape:'day'});
  add('kids','desk_pc','Computer Energy','energy','kWh',980.4,{daily:1.3,shape:'day'});add('living','living_tv_plug','TV Energy','energy','kWh',301.7,{daily:.4,shape:'evening'});
  Object.assign(HA,{sensors:S.sensors,states:S.states,areaSensors:{kitchen:{temperature_entity_id:'sensor.kitchen_air_temperature'}}});
  // Devices: air conditioners in the bedroom and living room are heating, the kids' room one is off; underfloor heating in the bathroom;
  // curtains are open except the kitchen one; the balcony door is open; a camera at the entrance, a water valve and leak sensors, a robot vacuum in the hallway
  const K=deviceKit();
  K.ac('bedroom_ac','Bedroom AC','bedroom','heat',24,21.6);K.ac('living_ac','Living room AC','living','heat',23,22.1);K.ac('kids_ac','Kids\' room AC','kids','off',22,22.4);
  K.thermostat('bathroom_floor','Underfloor heating','bathroom',27,24.8);
  K.cover('bedroom_curtains','Bedroom curtains','bedroom','curtain',100);K.cover('living_curtains','Living room curtains','living','curtain',100);
  K.cover('kids_blind','Kids\' room roller blind','kids','blind',100);K.cover('kitchen_blind','Kitchen roller blind','kitchen','blind',0);
  K.contact('balcony_door','Balcony door','balcony','door',true);K.contact('front_door','Front door','hall','door',false);K.contact('bedroom_window','Bedroom window','bedroom','window',false);
  K.camera('entrance','Entrance camera','hall');K.valve('water_main','Water shut-off valve','bathroom');
  K.leak('leak_kitchen','Leak under the sink','kitchen',100);K.leak('leak_bathroom','Bathroom leak','bathroom',64);
  K.vacuum('robot','Robot vacuum','hall');
  K.favorites([['scene.movie','Movie','living','2026-11-07T20:14:00Z'],['scene.dinner','Dinner','kitchen','2026-11-07T18:30:00Z'],
    ['script.good_night','Good night',null,'off'],['input_boolean.guest_mode','Guest mode',null,'off'],['switch.kettle','Kettle','kitchen','off'],
    ['switch.bathroom_fan','Extractor fan','bathroom','off'],['switch.towel_rail','Towel rail','bathroom','on'],['lock.front_door','Front door lock','hall','locked']]);
  Object.assign(HA,{devices:K.devices,entities:K.entities,extra:K.extra});
  // “Connectivity”: the living room AC loses Wi-Fi, the robot sometimes too, the bathroom leak sensor dropped out once for a couple of hours, the bathroom sensor for a minute
  HA.stats=stats(['sensor.home_meter_energy'],['kitchen_fridge','kettle','washer','desk_pc','living_tv_plug'],
    {'climate.living_ac':{hours:7,drops:6},'vacuum.robot':{hours:.8,drops:3},'binary_sensor.leak_bathroom':{hours:2.5,drops:1},'sensor.bath_th_temperature':{hours:.03,drops:1}});
  HA.weather=WEATHER;
  HA.lights.push(NO_AREA_LAMP);
  const DEMO={version:1,units:'m',rooms:ROOMS.map(r=>({id:r.id,name:r.short,polygon:r.polygon,...structuredClone(FINISH[r.id]||{})})),openings:OPENINGS,furniture:FURNITURE,lights:PLACED};
  return {HA,DEMO,DEMO_UNDERLAY:null,STYLE};
}
