// The repository's demo apartment: a typical three-room apartment, about 78 m² (type 5 from docs/research/typical-homes.md, D-030) —
// hallway with a corridor, living room with a balcony, bedroom, kids' room, kitchen, combined bathroom. Made up: nobody's apartment.
// Coordinates are metres, x is east, y is north. Rooms are separated by 10 cm walls; the editor adds the exterior walls itself.
// Shared demo parts are in kit.mjs.
import {door,win,F,haLight,sensorKit,deviceKit,stats,WEATHER,NO_AREA_LAMP} from './kit.mjs';

const ROOMS=[
  {id:'hall',short:'Hallway',polygon:[[5.4,0],[6.9,0],[6.9,3.7],[4.5,3.7],[4.5,5],[3.5,5],[3.5,2],[5.4,2]]},
  {id:'living',short:'Living room',polygon:[[4.6,3.8],[10.4,3.8],[10.4,7.6],[3.5,7.6],[3.5,5.1],[4.6,5.1]]},
  {id:'bedroom',short:'Bedroom',polygon:[[0,3.8],[3.4,3.8],[3.4,7.6],[0,7.6]]},
  {id:'kids',short:"Kids' room",polygon:[[0,0],[3.4,0],[3.4,3.7],[0,3.7]]},
  {id:'kitchen',short:'Kitchen',polygon:[[7,0],[10.4,0],[10.4,3.7],[7,3.7]]},
  {id:'bathroom',short:'Bathroom',polygon:[[3.5,0],[5.3,0],[5.3,1.9],[3.5,1.9]]},
  {id:'balcony',short:'Balcony',polygon:[[5.5,7.85],[9,7.85],[9,8.95],[5.5,8.95]]},
];

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
  // bedroom: bed with its headboard against the west wall, nightstands, wardrobe by the south wall, dresser by the east wall
  F('f1','bed',1.07,5.9,90,1.6,2.1,1.05,'oak'),F('f2','nightstand',.22,4.8,90,.5,.4,.5,'oak'),F('f3','nightstand',.22,7,90,.5,.4,.5,'oak'),
  F('f4','wardrobe',1.3,4.1,180,2,.6,2.4,'white'),F('f5','dresser',3.17,6.6,270,1.2,.45,.85,'oak'),
  // kids' room: bed, desk with a chair by the window, wardrobe, toy storage, rug
  F('f6','bed',1.02,3.2,90,.9,2,.9,'white'),F('f7','desk',1.7,.3,180,1.2,.6,.75,'white'),F('f8','chairDesk',1.7,.9,180,.62,.62,1.05,'graphite'),
  F('f9','wardrobe',3.1,1.1,270,1.2,.6,2.2,'white'),F('f10','toyStorage',.22,1.4,90,.99,.44,.56,'oak'),F('f11','rug',1.7,1.8,0,1.4,1,.012,'grey'),
  // living room: sofa by the east wall, coffee table, rug, TV stand by the west wall, shelving unit, floor lamp
  F('f12','loungeSofa',9.92,5.7,270,2.1,.95,.85,'grey'),F('f13','tableCoffee',8.95,5.7,270,1,.55,.42,'oak'),F('f14','rug',8.7,5.7,270,2,1.4,.012,'grey'),
  F('f15','tvStand',3.7,6.35,90,1.6,.4,.5,'walnut'),F('f16','shelf',9.7,7.42,0,.9,.35,2,'oak'),F('f17','lampRoundFloor',10.08,4.15,0,.42,.42,1.6,'linen'),
  // kitchen: base and wall cabinets along the north wall, fridge, table with chairs by the window
  F('f18','kitchenBase',9.1,3.4,0,2.4,.6,.9,'white'),F('f19','kitchenWall',9.1,3.525,0,2.4,.35,.7,'white'),F('f20','fridge',10.07,2.45,270,.6,.65,1.85,'white'),
  F('f21','diningTable',8.4,1.1,0,1.4,.8,.75,'oak'),F('f22','chairCushion',8,.42,180,.45,.52,.85,'oak'),F('f23','chairCushion',8.8,.42,180,.45,.52,.85,'oak'),
  F('f24','chairCushion',8,1.78,0,.45,.52,.85,'oak'),F('f25','chairCushion',8.8,1.78,0,.45,.52,.85,'oak'),
  // bathroom: bathtub by the south wall, toilet and basin on either side of the door
  F('f26','bath',4.4,.375,180,1.7,.75,.58,'white'),F('f27','toilet',3.83,1.45,90,.38,.65,.8,'white'),F('f28','basin',5.09,1.45,270,.5,.42,.85,'white'),
  // hallway: open wardrobe and a mirror by the entrance
  F('f29','openWardrobe',6.65,1,270,1,.5,2,'oak'),F('f30','wallMirror',5.42,1,90,.6,.03,.9,'white'),
  // balcony
  F('f31','patioChair',6.3,8.45,0,.56,.58,.82,'graphite'),F('f32','pottedPlant',8.55,8.5,0,.8,.8,1,'terracotta'),
];

const LIGHTS=[
  {id:'hall_main',name:'Main light',room:'hall',kind:'ceiling'},
  {id:'living_main',name:'Chandelier',room:'living',kind:'ceiling'},
  {id:'living_cove',name:'Ceiling cove light',room:'living',kind:'cove'},
  {id:'living_floor',name:'Floor lamp',room:'living',kind:'accent'},
  {id:'kitchen_main',name:'Main light',room:'kitchen',kind:'ceiling'},
  {id:'kitchen_worktop_led',name:'Worktop strip',room:'kitchen',kind:'strip'},
  {id:'bedroom_main',name:'Ceiling light',room:'bedroom',kind:'ceiling'},
  {id:'bedroom_sconces',name:'Sconces over the bed',room:'bedroom',kind:'accent',color:'#ffd34d'},
  {id:'kids_main',name:'Ceiling light',room:'kids',kind:'ceiling'},
  {id:'kids_night',name:'Night light',room:'kids',kind:'accent',color:'#ffb46b'},
  {id:'bathroom_main',name:'Main light',room:'bathroom',kind:'ceiling'},
  {id:'bathroom_mirror',name:'Mirror light',room:'bathroom',kind:'accent'},
  {id:'balcony_main',name:'Ceiling lamp',room:'balcony',kind:'ceiling'},
];
// where the lamps are; the night light, the mirror light and the floor lamp with no area are not placed — the wizard places them
const PLACED=[
  {id:'hall_main',placed:true,room:'hall',points:[[4.7,2.85],[6.15,1]]},
  {id:'living_main',placed:true,room:'living',points:[[7.3,5.8]]},
  {id:'living_cove',placed:true,room:'living',segments:[[[3.65,7.45],[10.25,7.45]]]},
  {id:'living_floor',placed:true,room:'living',points:[[10.08,4.15]]},
  {id:'kitchen_main',placed:true,room:'kitchen',points:[[8.7,1.85]]},
  {id:'kitchen_worktop_led',placed:true,room:'kitchen',segments:[[[7.95,3.42],[10.25,3.42]]]},
  {id:'bedroom_main',placed:true,room:'bedroom',points:[[1.7,5.7]]},
  {id:'bedroom_sconces',placed:true,room:'bedroom',points:[[.12,4.8],[.12,7]],h:1.4},
  {id:'kids_main',placed:true,room:'kids',points:[[1.7,1.85]]},
  {id:'bathroom_main',placed:true,room:'bathroom',points:[[4.4,1]]},
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
  const DEMO={version:1,units:'m',rooms:ROOMS.map(r=>({id:r.id,name:r.short,polygon:r.polygon})),openings:OPENINGS,furniture:FURNITURE,lights:PLACED};
  return {HA,DEMO,DEMO_UNDERLAY:null};
}
