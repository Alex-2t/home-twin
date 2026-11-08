import test from 'node:test';
import assert from 'node:assert/strict';
import {securityDevices,leakView,waterView,securityAlerts,sinceText,valveCommand,LOW_BATTERY} from './security.js';
import {activeChips} from './overview.js';

// HA layer as in mockHA: devices() and entity(e)
const ha=(devices,entities={})=>({devices:()=>devices,entity:e=>entities[e]||null});
const ROOMS={hall:{id:'r1',short:'Hallway',kind:'hall'},kitchen:{id:'r2',short:'Kitchen',kind:'kitchen'},bath:{id:'r3',short:'Bathroom',kind:'bath'}};
const room=a=>ROOMS[a]||null;

test('devices by kind from HA: camera, water valve, leak sensors; the rest is not ours', () => {
  const s=securityDevices(ha([
    {entity:'camera.yard',name:'Yard',area:null,domain:'camera'},
    {entity:'camera.door',name:'Camera',area:'hall',domain:'camera'},
    {entity:'valve.water',name:'Valve',area:'kitchen',domain:'valve',cls:'water'},
    {entity:'valve.gas',name:'Gas',area:'kitchen',domain:'valve',cls:'gas'},
    {entity:'binary_sensor.leak',name:'Under the sink',area:'kitchen',domain:'binary_sensor',cls:'moisture',battery:'sensor.leak_battery'},
    {entity:'binary_sensor.door',name:'Door',area:'hall',domain:'binary_sensor',cls:'door'},
    {entity:'climate.ac',name:'Air conditioner',area:'kitchen',domain:'climate'},
  ],{'camera.door':{state:'idle',attributes:{entity_picture:'/api/camera_proxy/camera.door?token=x'}},'valve.water':{state:'closed',attributes:{}},
    'binary_sensor.leak':{state:'off',attributes:{},last_changed:'2026-11-05T10:00:00Z'},'sensor.leak_battery':{state:'64',attributes:{}}}),room);
  assert.deepEqual(s.camera,{entity:'camera.door',name:'Camera',room:'r1',ok:true,picture:'/api/camera_proxy/camera.door?token=x'},'two cameras — the one in the hallway');
  assert.deepEqual(s.water,[{entity:'valve.water',domain:'valve',name:'Valve',room:'r2',status:'available',value:'closed'}],'a gas valve is not water');
  assert.equal(s.leaks.length,1);assert.equal(s.leaks[0].label,'Kitchen');assert.equal(s.leaks[0].battery,'64');assert.equal(s.leaks[0].state,'off');
  assert.equal(s.leaks[0].since,Date.parse('2026-11-05T10:00:00Z'));
});

test('no devices or no HA layer — the section has nothing to show', () => {
  assert.deepEqual(securityDevices(null),{camera:null,water:[],leaks:[]});
  assert.deepEqual(securityDevices(ha([{entity:'light.x',domain:'light'}])),{camera:null,water:[],leaks:[]});
});

test('the entrance camera by name, otherwise the first; an unavailable one — no frame', () => {
  const s=securityDevices(ha([{entity:'camera.a',name:'Kids\' room',domain:'camera'},{entity:'camera.b',name:'Front door',domain:'camera'}],{'camera.b':{state:'unavailable',attributes:{entity_picture:'/x'}}}));
  assert.equal(s.camera.entity,'camera.b');assert.equal(s.camera.ok,false);assert.equal(s.camera.picture,null);
  assert.equal(securityDevices(ha([{entity:'camera.a',name:'Kids\' room',domain:'camera'},{entity:'camera.c',name:'Garage',domain:'camera'}])).camera.entity,'camera.a');
});

test('two sensors in one room or without a room — captioned with their own name', () => {
  const s=securityDevices(ha([{entity:'binary_sensor.a',name:'Under the bathtub',area:'bath',domain:'binary_sensor',cls:'moisture'},
    {entity:'binary_sensor.b',name:'Washing machine',area:'bath',domain:'binary_sensor',cls:'moisture'},
    {entity:'binary_sensor.c',name:'Water heater',area:null,domain:'binary_sensor',cls:'moisture'}]),room);
  assert.deepEqual(s.leaks.map(l=>l.label),['Under the bathtub','Washing machine','Water heater']);
  assert.deepEqual(s.leaks.map(l=>l.state),['unavailable','unavailable','unavailable'],'no state — offline');
});

test('leaks: worst first — water, missing, batteries; no sensors — no tile', () => {
  const dry={entity:'a',room:'r2',label:'Kitchen',state:'off',battery:100},bath={entity:'b',room:'r3',label:'Bathroom',state:'off',battery:64};
  assert.equal(leakView([]),null);
  assert.deepEqual([leakView([dry,bath]).state,leakView([dry,bath]).text],['dry','All dry']);
  assert.equal(leakView([dry]).text,'Dry');
  assert.equal(leakView([dry]).items[0].tip,'Kitchen: dry, battery 100 %');
  const wet=leakView([dry,{...bath,state:'on'}]);assert.equal(wet.state,'leak');assert.equal(wet.text,'Leak: Bathroom');
  assert.equal(wet.items[1].tip,'Bathroom: leak!');
  assert.deepEqual([leakView([dry,{...bath,state:'unavailable'}]).state,leakView([dry,{...bath,state:'unavailable'}]).text],['warn','Dry, 1 offline']);
  assert.deepEqual([leakView([{...dry,state:'unavailable'}]).state,leakView([{...dry,state:'unavailable'}]).text],['offline','No connection']);
  const low=leakView([dry,{...bath,battery:LOW_BATTERY}]);assert.equal(low.text,'Battery low');assert.equal(low.items[1].state,'low');
  assert.equal(leakView([{...dry,battery:null,low:true}]).items[0].state,'low','the “battery low” flag without a percentage');
  assert.equal(leakView([{...dry,battery:null}]).items[0].tip,'Kitchen: dry');
});

test('offline — since when: today the time, earlier the date', () => {
  const now=new Date(2026,10,8,15,0).getTime();
  assert.match(sinceText(new Date(2026,10,8,14,5).getTime(),now),/^since 0?2:05\sPM$/);
  assert.match(sinceText(new Date(2026,9,26,9,0).getTime(),now),/^since October 26$/);
  assert.equal(sinceText(NaN,now),'');
});

test('valve: shut off and open on the second tap; while moving — not tappable', () => {
  assert.deepEqual(waterView({status:'available',value:'open'}),{state:'open',text:'Valve open',action:'close'});
  assert.equal(waterView({status:'available',value:'open',confirm:true}).text,'Tap again to shut off');
  assert.deepEqual(waterView({status:'available',value:'closed'}),{state:'closed',text:'Shut off',action:'open'});
  assert.equal(waterView({status:'available',value:'closed',confirm:true}).text,'Tap again to open');
  assert.equal(waterView({status:'available',value:'closing'}).action,null);
  assert.equal(waterView({status:'available',value:'open',pending:true}).text,'Sending command…');
  assert.equal(waterView({status:'unavailable'}).action,null);assert.equal(waterView().state,'unbound');
});

test('“Now”: a leak and shut-off water — first, in red', () => {
  const sec={camera:null,water:[{entity:'valve.w',value:'closed'}],leaks:[{entity:'binary_sensor.l',room:'r3',label:'Bathroom',state:'on'},{entity:'binary_sensor.k',room:'r2',label:'Kitchen',state:'off'}]};
  const a=securityAlerts(sec);
  assert.deepEqual(a.alerts,[{entity:'binary_sensor.l',label:'Leak: Bathroom',icon:'leak',room:'r3'}]);assert.deepEqual(a.water,{closed:true});
  const chips=activeChips({lights:[{id:'l',room:'r2',on:true}],...a});
  assert.deepEqual(chips.map(c=>[c.key,c.kind]),[['alert:binary_sensor.l','alert'],['water','alert'],['light','light']]);
  assert.deepEqual(chips[0].rooms,['r3']);
  assert.equal(securityAlerts({camera:null,water:[],leaks:[]}).water,null);
});

// the owner's live HA (2026-11-08): the valve is a cover without a class, leak sensors with identical names, the battery is diagnostic
test('live HA: a valve as a cover, identical leak sensors captioned by rooms', () => {
  const s=securityDevices(ha([
    {entity:'cover.sonoff_10014a8dc7',name:'Кран перекрытия воды',area:'kitchen',domain:'cover'}, // allow-cyrillic: the owner's real Russian HA name, matched by the multilingual VALVE pattern
    {entity:'cover.0x881a14fffe890c2b',name:'Curtains · center',area:'kitchen',domain:'cover',cls:'shade'},
    {entity:'binary_sensor.0x842712fffe81f65d_water_leak',name:'Leak sensor Moisture',area:'kitchen',domain:'binary_sensor',cls:'moisture',
      battery:'sensor.0x842712fffe81f65d_battery',low:'binary_sensor.0x842712fffe81f65d_battery_low'},
    {entity:'binary_sensor.0x842712fffe82b924_water_leak',name:'Leak sensor Moisture',area:'bath',domain:'binary_sensor',cls:'moisture',
      battery:'sensor.0x842712fffe82b924_battery',low:'binary_sensor.0x842712fffe82b924_battery_low'},
  ],{'cover.sonoff_10014a8dc7':{state:'open',attributes:{current_position:100,supported_features:15}},
    'binary_sensor.0x842712fffe81f65d_water_leak':{state:'off',attributes:{device_class:'moisture'}},'sensor.0x842712fffe81f65d_battery':{state:'100'},
    'binary_sensor.0x842712fffe81f65d_battery_low':{state:'off'},'binary_sensor.0x842712fffe82b924_water_leak':{state:'unavailable',attributes:{}}}),room);
  assert.deepEqual(s.water.map(w=>[w.entity,w.domain,w.value]),[['cover.sonoff_10014a8dc7','cover','open']],'curtains are not a valve');
  assert.deepEqual(valveCommand(s.water[0],'close'),['cover','close_cover']);assert.deepEqual(valveCommand({domain:'valve'},'open'),['valve','open_valve']);
  assert.deepEqual(s.leaks.map(l=>[l.label,l.state,l.battery,l.low]),[['Kitchen','off','100',false],['Bathroom','unavailable',null,false]]);
  assert.equal(leakView(s.leaks).text,'Dry, 1 offline');
});
