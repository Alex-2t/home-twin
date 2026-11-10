import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deviceKind,coverModel,isWaterValve,autoPlace,placeOn,unplace,recOf,liveScene,acView,coverView,moveTo} from './devices.js';
import {emptyPlan,migrate} from './plan.js';

// a 4×3 kitchen: a window in the north wall (edge 2 runs east to west), a door in the south wall
const plan=()=>({...emptyPlan(),rooms:[{id:'k',name:'Kitchen',area:'kitchen',polygon:[[0,0],[4,0],[4,3],[0,3]]}],
  openings:[{id:'op_1',kind:'window',at:{room:'k',edge:2,s0:1,s1:3,d:0},bottom:.85,top:2.4},{id:'op_2',kind:'door',at:{room:'k',edge:0,s0:1.5,s1:2.3,d:0},bottom:0,top:2.1}],devices:[]});
const devs=[{entity:'climate.k',name:'Kitchen air conditioner',area:'kitchen',domain:'climate'},
  ...[3,1,2].map(i=>({entity:'cover.k'+i,name:'Roller blind · section '+i,area:'kitchen',domain:'cover',cls:'blind'})),
  {entity:'binary_sensor.door',name:'Kitchen door',area:'kitchen',domain:'binary_sensor',cls:'door'},
  {entity:'binary_sensor.motion',name:'Motion',area:'kitchen',domain:'binary_sensor',cls:'motion'},{entity:'climate.x',name:'Somewhere',area:'garage',domain:'climate'}];

test('device kind and cover model',()=>{
  assert.deepEqual(devs.map(deviceKind),['ac','cover','cover','cover','contact',null,'ac']);
  assert.equal(coverModel({cls:'curtain'}),'curtains');assert.equal(coverModel({name:'Venetian blinds'}),'blind');assert.equal(coverModel({name:'Bedroom curtains'}),'curtains');
});

// the owner's live HA (2026-11-08): a motorized valve is a cover without a class; the boiler holds a range (heat_cool) but is not an air conditioner
test('a valve is not a curtain; a boiler with heat_cool is not an air conditioner',()=>{
  const tap={entity:'cover.sonoff_10014a8dc7',name:'Water shutoff valve',area:'kitchen',domain:'cover'};
  assert.equal(coverModel(tap),null);assert.equal(deviceKind(tap),null);assert.equal(isWaterValve(tap),true);
  assert.equal(isWaterValve({domain:'valve',name:'Main'}),true);assert.equal(isWaterValve({domain:'valve',cls:'water',name:'Water'}),true);
  assert.equal(isWaterValve({domain:'valve',cls:'gas',name:'Gas'}),false);assert.equal(isWaterValve({domain:'cover',name:'Gas valve'}),false);
  assert.equal(isWaterValve({domain:'cover',cls:'shade',name:'Curtains · right'}),false);assert.equal(isWaterValve({domain:'cover',name:'Curtains'}),false);
  assert.equal(deviceKind({domain:'cover',cls:'shade',name:'Curtains · right'}),'cover');
  // Russian names from HA: “tap” matches, but not inside “projector screen”; “ventilation” is not a valve
  assert.equal(isWaterValve({domain:'cover',name:'Экран проектора'}),false);assert.equal(isWaterValve({domain:'cover',name:'Вентиляция'}),false); // allow-cyrillic
  assert.equal(isWaterValve({domain:'cover',name:'Кран'}),true); // allow-cyrillic
  const st=modes=>({state:'heat',attributes:{hvac_modes:modes}});
  assert.equal(deviceKind({domain:'climate',name:'Boiler thermostat'},st(['off','heat_cool','heat'])),'heat');
  assert.equal(deviceKind({domain:'climate',name:'Radiator thermostat'},st(['off','auto','heat'])),'heat');
  assert.equal(deviceKind({domain:'climate',name:'Air conditioner'},st(['auto','cool','dry','fan_only','heat','off'])),'ac');
});

test('auto: an air conditioner goes on a free upper wall facing into the room; three covers on one window become sections from left to right; a sensor goes on the door',()=>{
  const p=plan();assert.equal(autoPlace(p,devs),5); // the garage area is not on the plan, and motion is not a contact sensor
  const ac=p.furniture.find(f=>f.id===recOf(p,'climate.k').furn);
  assert.equal(ac.model,'aircon');assert.ok(Math.abs(ac.x-(4-.05-.11))<1e-6&&Math.abs(Math.abs(ac.rot)-90)<1e-6); // the east wall: the south wall has the door, the north wall the window
  const xs=[1,2,3].map(i=>p.furniture.find(f=>f.id===recOf(p,'cover.k'+i).furn));
  assert.ok(xs.every(f=>f.model==='blind'&&Math.abs(f.w-(2/3-.02))<1e-3&&f.z===.81));
  assert.ok(xs[0].x<xs[1].x&&xs[1].x<xs[2].x); // looking north from the kitchen: west is on the left
  assert.equal(recOf(p,'binary_sensor.door').opening,'op_2');
  assert.equal(autoPlace(p,devs),0); // the second time: nothing new
});

test('auto: an air conditioner placed in “Furniture” and curtains at the window get bound, no second one is placed',()=>{
  const p=plan();p.furniture.push({id:'f9',model:'aircon',x:.2,y:1.5,w:.8,d:.22,h:.29,rot:90},{id:'f8',model:'curtains',x:2,y:2.88,w:2.4,d:.14,h:2.55,rot:0});
  autoPlace(p,[devs[0],{entity:'cover.c',name:'Curtains',area:'kitchen',domain:'cover',cls:'curtain'}]);
  assert.equal(recOf(p,'climate.k').furn,'f9');assert.equal(recOf(p,'cover.c').furn,'f8');assert.equal(p.furniture.length,2);
});

test('by hand: an air conditioner onto a wall, a cover only onto a window, a door sensor only onto a door; removing it also removes its own item',()=>{
  const p=plan();
  assert.equal(placeOn(p,devs[1],{opening:'op_2'}),null);assert.equal(placeOn(p,devs[4],{opening:'op_1'}),null);
  const r=placeOn(p,devs[0],{room:'k',edge:3,t:1.5});assert.ok(r.made);const f=p.furniture.find(x=>x.id===r.furn);assert.ok(f.x>0&&f.x<.3);
  const c=placeOn(p,devs[1],{opening:'op_1'});assert.ok(Math.abs(p.furniture.find(x=>x.id===c.furn).w-1.98)<1e-6); // a roller blind covers the whole window
  unplace(p,r);assert.equal(p.furniture.some(x=>x.id===r.furn),false);assert.equal(recOf(p,'climate.k'),null);
  p.furniture=p.furniture.filter(x=>x.id!==c.furn);assert.equal(recOf(p,'cover.k3'),null); // the item was deleted in “Furniture”: the device is not in the model
});

test('state: air conditioner, covers, opening, for 3D',()=>{
  const p=plan();autoPlace(p,devs);
  const E={'climate.k':{state:'heat',attributes:{temperature:25,current_temperature:22}},'cover.k1':{state:'open',attributes:{current_position:40}},'cover.k2':{state:'closed',attributes:{}},
    'binary_sensor.door':{state:'on',attributes:{}}};
  const L=liveScene(p,{devices:()=>devs,entity:e=>E[e]||null});
  assert.deepEqual(L.climate.map(c=>[c.id,c.on,c.tone]),[['climate.k',true,'heat']]);
  assert.equal(L.open.get(recOf(p,'cover.k1').furn),.4);assert.equal(L.open.get(recOf(p,'cover.k2').furn),0);
  assert.deepEqual(L.contacts.map(c=>[c.id,c.opening,c.open,c.n.map(v=>v+0)]),[['binary_sensor.door','op_2',true,[0,1]]]);
  assert.equal(acView({state:'unavailable'}).ok,false);assert.equal(coverView({state:'open',attributes:{}}).pos,100);
});

test('dragged: an air conditioner moves along the wall as the same item, a cover onto a window at its width, a sensor only onto an opening of its kind',()=>{
  const p=plan();p.openings.push({id:'op_3',kind:'window',at:{room:'k',edge:1,s0:.5,s1:2.5,d:0},bottom:.85,top:2.4});autoPlace(p,devs);
  const ac=p.furniture.find(f=>f.id===recOf(p,'climate.k').furn);ac.color='graphite';
  assert.ok(moveTo(p,devs[0],{room:'k',edge:3,t:2}));assert.ok(ac.x<.3&&Math.abs(ac.y-1)<1e-6&&ac.color==='graphite'&&p.furniture.includes(ac));
  const b=p.furniture.find(f=>f.id===recOf(p,'cover.k1').furn);assert.ok(moveTo(p,devs[2],{opening:'op_3'}));assert.ok(Math.abs(b.w-1.98)<1e-6&&b.x>3.5);
  assert.equal(moveTo(p,devs[4],{opening:'op_3'}),false);assert.equal(recOf(p,'binary_sensor.door').opening,'op_2');
  assert.equal(moveTo(p,devs[2],{opening:'op_2'}),false); // a cover onto a door: no
});

test('a thermostat (heating only) is not an air conditioner and not in the model; gates, a wicket gate, a damper are not covers',()=>{
  const heat={entity:'climate.floor',name:'Floor heating',area:'kitchen',domain:'climate'},split={entity:'climate.a',name:'Climate',area:'kitchen',domain:'climate'};
  const E={'climate.floor':{state:'heat',attributes:{hvac_modes:['off','heat']}},'climate.a':{state:'cool',attributes:{hvac_modes:['off','cool','heat']}}};
  assert.equal(deviceKind(heat,E['climate.floor']),'heat');assert.equal(deviceKind(split,E['climate.a']),'ac');
  assert.equal(deviceKind(heat),'heat');assert.equal(deviceKind({domain:'climate',name:'Air conditioner in the boiler room'}),'ac'); // without a state: by name
  for(const c of [{cls:'garage',name:'Garage'},{cls:'gate',name:'Gate'},{cls:'damper'},{cls:'awning'},{name:'Wicket gate'},{name:'Garage door'}])
    assert.equal(deviceKind({domain:'cover',...c}),null,JSON.stringify(c));
  const p=plan(),gate={entity:'cover.gate',name:'Gate',area:'kitchen',domain:'cover',cls:'gate'};
  assert.equal(autoPlace(p,[heat,split,gate],e=>E[e]||null),1);assert.equal(recOf(p,'climate.floor'),null);assert.equal(recOf(p,'cover.gate'),null);
});

test('a terrace, garden or garage door contact finds its door; a central thermostat gets no split on the wall (homes check, D-061)',()=>{
  // a kitchen with a door into the hallway and one out; a garage with a wide gate and a side door
  const p=migrate({rooms:[{id:'k',name:'Kitchen',area:'kitchen',polygon:[[0,0],[4,0],[4,3],[0,3]]},{id:'h',name:'Hallway',area:'hall',polygon:[[4.1,0],[6,0],[6,3],[4.1,3]]},
      {id:'g',name:'Garage',area:'garage',polygon:[[6.1,0],[12,0],[12,3],[6.1,3]]}],
    openings:[{kind:'door',a:[4.05,1],b:[4.05,1.8]},{kind:'door',a:[1,3],b:[1.9,3]},{kind:'door',a:[7,0],b:[9.4,0]},{kind:'door',a:[12,1],b:[12,1.9]}]});
  const ids=p.openings.map(o=>o.id),devs=[{entity:'binary_sensor.terrace_door',name:'Terrace door',area:'kitchen',domain:'binary_sensor',cls:'door'},
    {entity:'binary_sensor.garage',name:'Garage door',area:'garage',domain:'binary_sensor',cls:'garage_door'},
    {entity:'climate.ecobee',name:'Ecobee Thermostat',area:'hall',domain:'climate'}];
  const ent=e=>e==='climate.ecobee'?{state:'heat_cool',attributes:{hvac_modes:['off','heat','cool','heat_cool']}}:null;
  assert.equal(deviceKind(devs[2],ent(devs[2].entity)),'ac');
  autoPlace(p,devs,ent);
  assert.equal(recOf(p,'binary_sensor.terrace_door')?.opening,ids[1],'the kitchen’s only door out');
  assert.equal(recOf(p,'binary_sensor.garage')?.opening,ids[2],'the wide gate');
  assert.ok(!recOf(p,'climate.ecobee'),'a central thermostat: nothing hung on the wall');
  assert.ok(!p.furniture.some(f=>f.model==='aircon'));
});
