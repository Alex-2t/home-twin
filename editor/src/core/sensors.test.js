import {test} from 'node:test';
import assert from 'node:assert/strict';
import {METRICS,pickAuto,recommend,sensorItem,wallSpot,labelSize,layoutSensors,orphans} from './sensors.js';

const M=k=>METRICS.find(m=>m.k===k);
const S=[
  {entity:'sensor.plug_device_temperature',name:'Plug Device temperature',area:'kitchen',device:'plug',cls:'temperature',unit:'°C',cat:'diagnostic'},
  {entity:'sensor.fridge_temperature',name:'Refrigerator',area:'kitchen',device:'fridge',cls:'temperature',unit:'°C'},
  {entity:'sensor.air_temperature',name:'Air monitor Temperature',area:'kitchen',device:'air',cls:'temperature',unit:'°C'},
  {entity:'sensor.air_humidity',name:'Air monitor Humidity',area:'kitchen',device:'air',cls:'humidity',unit:'%'},
  {entity:'sensor.air_co2',name:'Air monitor CO2',area:'kitchen',device:'air',cls:'carbon_dioxide',unit:'ppm'},
  {entity:'sensor.air_pm25',name:'Air monitor PM2.5',area:'kitchen',device:'air',cls:'pm25',unit:'µg/m³'},
  {entity:'sensor.stick_temperature',name:'Thermometer',area:'kitchen',device:'stick',cls:'temperature',unit:'°C'},
  {entity:'sensor.kettle_power',name:'Kettle Power',area:'kitchen',device:'kettle',cls:'power',unit:'W'},
];
const V={'sensor.plug_device_temperature':41,'sensor.fridge_temperature':4.2,'sensor.air_temperature':23.14,'sensor.air_humidity':37.6,'sensor.air_co2':1180,'sensor.air_pm25':9,
  'sensor.stick_temperature':22.8,'sensor.kettle_power':1840};
const ctx=(areas=[],sensors=S)=>({sensors,areas,state:e=>V[e]??null});
const kitchen={id:'k',area:'kitchen',polygon:[[0,0],[4,0],[4,3],[0,3]]};
const plan=sensors=>({rooms:[kitchen],furniture:[],lights:[],openings:[],sensors});

test('sensors: climate is suggested; diagnostic ones and the fridge are skipped; a climate sensor comes first',()=>{
  assert.equal(pickAuto(M('t'),'kitchen',ctx()).entity,'sensor.air_temperature'); // the device measures several quantities
  assert.deepEqual(recommend(plan([]),ctx()).map(x=>x.entity),['sensor.air_temperature','sensor.air_humidity','sensor.air_co2']); // PM2.5 and power only by hand
  assert.equal(pickAuto(M('t'),'kitchen',ctx([],S.filter(s=>s.device!=='air'))).entity,'sensor.stick_temperature'); // neither the plug nor the fridge
  assert.equal(pickAuto(M('t'),'kitchen',ctx([],S.filter(s=>s.device==='fridge'))),null);
  assert.equal(pickAuto(M('t'),'kitchen',ctx([{area_id:'kitchen',temperature_entity_id:'sensor.stick_temperature'}])).entity,'sensor.stick_temperature'); // the area's own sensor in HA
});

test('sensors: caption and number; climate has its own format, the rest come with a unit',()=>{
  const it=e=>sensorItem({entity:e},ctx());
  assert.deepEqual(it('sensor.air_temperature'),{label:'TEMP.',text:'23.1°',lvl:0,k:1});
  assert.equal(it('sensor.air_co2').lvl,1); // above 1000: ventilate
  assert.deepEqual(it('sensor.kettle_power'),{label:'POWER',text:'1840 W',lvl:0,k:1});
  // digits twice as large make the label twice as big
  const a=labelSize([sensorItem({entity:'sensor.air_co2'},ctx())]),b=labelSize([sensorItem({entity:'sensor.air_co2',k:2},ctx())]);assert.ok(Math.abs(b.ws[0]-2*a.ws[0])<1e-9&&b.h>a.h*1.7); // same padding
  assert.equal(sensorItem({entity:'sensor.kettle_power',label:'Kettle'},ctx()).label,'KETTLE');
  assert.equal(it('sensor.gone'),null);
});

test('label spot: a visible wall without a window or tall furniture; placed by hand: the nearest wall',()=>{
  const W=labelSize(['sensor.air_temperature','sensor.air_humidity','sensor.air_co2'].map(e=>sensorItem({entity:e},ctx()))).w;
  // the default camera looks from the southeast: the north wall (y = 3) and the west wall (x = 0) are visible
  let s=wallSpot(kitchen,{},W);assert.equal(s.i,2);assert.ok(Math.abs(s.c[1]-(3-.05))<1e-9); // on the wall face, 5 cm from the axis
  s=wallSpot(kitchen,{openings:[{a:[.3,3],b:[3.7,3],bottom:.9,top:2.2}]},W);assert.equal(s.i,3); // a window on the north wall: the west wall
  s=wallSpot(kitchen,{openings:[{a:[.3,3],b:[3.7,3],bottom:.9,top:2.2}],furniture:[{x:.3,y:1.5,w:2.4,d:.6,h:2.2,rot:90,model:'wardrobe'}]},W);
  assert.ok(s.i!==3||Math.abs(s.t-1.5)>1.2); // not on the wardrobe
  s=wallSpot(kitchen,{furniture:[{x:2,y:2.7,w:2,d:.5,h:.9,rot:0,model:'dresser'}]},W);assert.equal(s.i,2); // a low dresser is no obstacle
  s=wallSpot(kitchen,{},W,[4,1]);assert.equal(s.i,1);assert.ok(s.own);
});

test('plan labels: one per sensor, several in a row, a hand-placed one separately',()=>{
  const L=layoutSensors(plan([{id:'a',entity:'sensor.air_temperature',room:'k'},{id:'b',entity:'sensor.air_humidity',room:'k'},{id:'c',entity:'sensor.kettle_power',room:'k',at:[4,1]}]),ctx());
  assert.equal(L.length,3);
  const [a,b]=['a','b'].map(id=>L.find(x=>x.id===id)),c=L.find(x=>x.id==='c');
  assert.equal(a.i,b.i);assert.ok(Math.abs(b.t-a.t)>(a.w+b.w)/2-1e-9); // side by side, no overlap
  const rt=[-a.n[1],a.n[0]];assert.ok((b.c[0]-a.c[0])*rt[0]+(b.c[1]-a.c[1])*rt[1]>0); // temperature is to the left of humidity for whoever looks at the wall
  // the spot follows the home view and is static: a camera from the south puts the row on the south wall (i = 0), from the southeast on the north wall
  const at=cam=>layoutSensors(plan([{id:'a',entity:'sensor.air_temperature',room:'k'}]),ctx(),{cam})[0].i;
  assert.equal(at([0,1]),0);assert.equal(at(undefined),2);
  assert.equal(c.i,1);assert.ok(c.own); // on the east wall, where it was placed
  assert.equal(layoutSensors(plan([{id:'x',entity:'sensor.gone',room:'k'}]),ctx()).length,0);
});

test('sensors without a room: ask about climate sensors without an area; not about diagnostic ones, ones on a wall or “Don’t show” ones',()=>{
  const free=[...S,{entity:'sensor.aqara_temperature',name:'Aqara thermometer',area:null,cls:'temperature',unit:'°C'},
    {entity:'sensor.garage_temperature',name:'Garage',area:'garage',cls:'temperature',unit:'°C'}, // the area is not on the plan
    {entity:'sensor.plug2_temperature',name:'Plug Device temperature',area:null,cls:'temperature',unit:'°C',cat:'diagnostic'},
    {entity:'sensor.desk_power',name:'Desk Power',area:null,cls:'power',unit:'W'}];
  const c={...ctx([],free)};
  assert.deepEqual(orphans(plan([]),c).map(s=>s.entity),['sensor.aqara_temperature','sensor.garage_temperature']);
  assert.deepEqual(orphans({...plan([{id:'a',entity:'sensor.aqara_temperature',room:'k'}]),sensorSkip:['sensor.garage_temperature']},c),[]);
});

test('sensor under a sensor: a column takes one place in the row, lower by its own height; a hand-placed one moves with the top one',()=>{
  const P0=[{id:'a',entity:'sensor.air_temperature',room:'k'},{id:'b',entity:'sensor.air_humidity',room:'k',under:'a'},{id:'c',entity:'sensor.air_co2',room:'k'}];
  let L=layoutSensors(plan(P0),ctx());const g=id=>L.find(x=>x.id===id);
  assert.ok(Math.hypot(g('a').c[0]-g('b').c[0],g('a').c[1]-g('b').c[1])<1e-9); // one point on the wall
  assert.ok(g('b').y<g('a').y-.3);assert.equal(g('a').col,g('b').col);assert.notEqual(g('c').col,g('a').col);
  assert.ok(Math.abs(g('a').y-g('c').y)<1e-9); // columns hang from a common top
  // the top one was placed by hand: the lower one goes with it
  L=layoutSensors(plan([{...P0[0],at:[4,1]},P0[1]]),ctx());assert.ok(g('a').own&&g('b').own);assert.equal(g('a').i,g('b').i);
  // a loop does not hang
  assert.equal(layoutSensors(plan([{id:'a',entity:'sensor.air_temperature',room:'k',under:'b'},{id:'b',entity:'sensor.air_humidity',room:'k',under:'a'}]),ctx()).length,2);
});

test('hand-placed labels next to each other do not overlap: the second shifts to a free spot on the same wall',()=>{
  const L=layoutSensors(plan([{id:'a',entity:'sensor.air_temperature',room:'k',at:[4,1.5]},{id:'b',entity:'sensor.air_humidity',room:'k',at:[4,1.5]}]),ctx());
  const [a,b]=L;assert.equal(a.i,b.i);assert.ok(Math.abs(a.t-b.t)>=(a.w+b.w)/2);
});

test('moving the second toward the third: the neighbors stay on the wall, the free spot is kept after release',()=>{
  const P=plan([{id:'a',entity:'sensor.air_temperature',room:'k',at:[.5,3]},
    {id:'b',entity:'sensor.air_humidity',room:'k',at:[1.9,3]},
    {id:'c',entity:'sensor.air_co2',room:'k',at:[2.05,3]}]);
  P.rooms=[{...kitchen,polygon:[[0,0],[2.5,0],[2.5,3],[0,3]]}];
  const L=layoutSensors(P,ctx(),{moving:'b'}),byId=id=>L.find(x=>x.id===id);
  assert.ok(Math.abs(byId('a').c[0]-.5)<1e-9);assert.ok(Math.abs(byId('c').c[0]-2.05)<1e-9);
  assert.ok(L.every(s=>s.i===2)); // CO₂ was not pushed onto a side wall out of view
  assert.ok(byId('a').c[0]<byId('b').c[0]&&byId('b').c[0]<byId('c').c[0]);
  const b=byId('b');P.sensors[1].at=[b.c[0]-b.n[0]*.05,b.c[1]-b.n[1]*.05];
  const saved=layoutSensors(JSON.parse(JSON.stringify(P)),ctx());
  for(const s of saved){assert.equal(s.i,byId(s.id).i);assert.deepEqual(s.c,byId(s.id).c);}
});
