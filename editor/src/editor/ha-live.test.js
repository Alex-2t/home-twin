// HA layer on a real hass (the Home Twin panel): the same answers as the demo, from HA registries and states.
import test from 'node:test';
import assert from 'node:assert/strict';
import {liveHA,hassPlans} from './ha-live.js';

globalThis.requestAnimationFrame??=f=>setTimeout(f,0);
const st=(state,attributes={})=>({state,attributes,last_changed:'2026-11-08T10:00:00Z'});
function fakeHass(over={}){const calls=[],ws=[];
  const h={language:'en',areas:{kitchen:{area_id:'kitchen',name:'Kitchen'},bed:{area_id:'bed',name:'Bedroom',temperature_entity_id:'sensor.t'}},
    devices:{d1:{id:'d1',area_id:'kitchen'},d2:{id:'d2',area_id:'bed'}},
    entities:{'light.k':{entity_id:'light.k',device_id:'d1'},'light.own':{entity_id:'light.own',area_id:'bed',name:'Wall lamp'},'light.hidden':{entity_id:'light.hidden',hidden:true},
      'sensor.t':{entity_id:'sensor.t',device_id:'d2'},'sensor.diag':{entity_id:'sensor.diag',device_id:'d2',entity_category:'diagnostic'},
      'binary_sensor.leak':{entity_id:'binary_sensor.leak',device_id:'d1'},'sensor.leak_bat':{entity_id:'sensor.leak_bat',device_id:'d1'}},
    states:{'light.k':st('on',{friendly_name:'Kitchen light'}),'light.own':st('off',{friendly_name:'Wall lamp'}),'light.hidden':st('off'),'light.group':st('on',{entity_id:['light.k','light.own']}),
      'sensor.t':st('21.5',{device_class:'temperature',unit_of_measurement:'°C'}),'sensor.diag':st('-60',{unit_of_measurement:'dBm'}),'sensor.ts':st('2026-11-08',{device_class:'timestamp'}),
      'binary_sensor.leak':st('off',{device_class:'moisture'}),'sensor.leak_bat':st('80',{device_class:'battery',unit_of_measurement:'%'}),'climate.ac':st('cool',{temperature:22}),
      'weather.home':st('cloudy',{temperature:12,apparent_temperature:10}),'sun.sun':st('above_horizon',{next_rising:'2026-11-09T05:05:00Z',next_setting:'2026-11-08T14:40:00Z'})},
    callService:(d,s,data)=>{calls.push([d,s,data]);return Promise.resolve();},
    callWS:msg=>{ws.push(msg);const r=over.ws?.(msg);return r instanceof Error?Promise.reject(r):Promise.resolve(r);},
    connection:{subscribeMessage:(cb,msg)=>{ws.push(msg);cb({forecast:[{datetime:'2026-11-08T13:00:00Z',condition:'rainy',temperature:11}]});return Promise.resolve(()=>{});}},
    hassUrl:p=>'http://ha.local:8123'+p,...over.hass};
  return {h,calls,ws};}

test('areas, lamps, sensors: the area is its own or the device\'s; no hidden or service ones', () => {
  const {h}=fakeHass(),ha=liveHA(h);
  assert.deepEqual(ha.areas().map(a=>a.name),['Bedroom','Kitchen']);assert.equal(ha.areas()[0].temperature_entity_id,'sensor.t');
  const L=ha.lights();
  assert.deepEqual(L.map(l=>[l.id,l.area]),[['group',null],['k','kitchen'],['own','bed']],'no hidden one; light.k has the device\'s area');
  assert.deepEqual(L[0].members,['light.k','light.own'],'a light group — with members');assert.equal(L[1].name,'Kitchen light');
  const S=ha.sensors();assert.equal(S.find(s=>s.entity==='sensor.t').area,'bed');assert.equal(S.find(s=>s.entity==='sensor.diag').cat,'diagnostic','a service one — flagged, core/sensors.js decides');
  assert.equal(S.some(s=>s.entity==='sensor.ts'),false,'a timestamp is not a reading');
  assert.equal(ha.state('sensor.t'),21.5);assert.equal(ha.state('light.k'),null);assert.equal(ha.entity('climate.ac').attributes.temperature,22);
  const leak=ha.devices().find(d=>d.entity==='binary_sensor.leak');assert.equal(leak.battery,'sensor.leak_bat','the charge is an entity of the same device');
});

test('registries not received — ready() false: an empty area list does not mean “deleted”', () => {
  assert.equal(liveHA({states:{}}).ready(),false);assert.equal(liveHA(fakeHass().h).ready(),true);
});

test('new states — onState once per frame; registries — onChange', async () => {
  const {h}=fakeHass(),ha=liveHA(h);let n=0,c=0;ha.onState(()=>n++);ha.onChange(()=>c++);
  ha.update({...h,states:{...h.states}});ha.update({...h,states:{...h.states}});await new Promise(r=>setTimeout(r,5));
  assert.equal(n,1,'two events — one redraw');assert.equal(c,0);
  ha.update({...h,areas:{...h.areas}});assert.equal(c,1);
});

test('commands and area: HA does not give an area to an entity without its own name — write it to the device', async () => {
  const err=Object.assign(new Error('x'),{code:'invalid_info'});
  const {h,calls,ws}=fakeHass({ws:m=>m.type==='config/entity_registry/update'?err:{}}),ha=liveHA(h);
  assert.equal(await ha.call('climate','set_temperature',{entity_id:'climate.ac',temperature:23}),true);assert.deepEqual(calls[0],['climate','set_temperature',{entity_id:'climate.ac',temperature:23}]);
  await ha.setArea('light.k','bed');assert.deepEqual(ws.at(-1),{type:'config/device_registry/update',device_id:'d1',area_id:'bed'});
  await assert.rejects(()=>ha.setArea('light.own','kitchen'),'for an own entity without a device, the error goes up');
});

test('weather with an hourly forecast, sunrise and sunset from sun.sun', async () => {
  const {h}=fakeHass(),ha=liveHA(h);ha.weather();await new Promise(r=>setTimeout(r,5));const w=ha.weather();
  assert.deepEqual([w.entity,w.condition,w.temperature,w.feels],['weather.home','cloudy',12,10]);
  assert.deepEqual(w.hourly,[{at:Date.parse('2026-11-08T13:00:00Z'),condition:'rainy',temperature:11}]);assert.equal(w.sunset,Date.parse('2026-11-08T14:40:00Z'));
});

test('history for 3 hours — 36 points 5 minutes apart; statistics and “Energy” in the demo format', async () => {
  const now=Date.now(),{h}=fakeHass({ws:m=>m.type==='history/history_during_period'?{'sensor.t':[{s:'20',lu:(now-3*3600e3)/1000},{s:'22',lu:(now-30*60e3)/1000},{s:'bad',lu:(now-10*60e3)/1000}]}
    :m.type==='recorder/statistics_during_period'?{'sensor.e':[{start:1,end:2,change:3}]}:m.type==='energy/get_prefs'?{energy_sources:[{type:'grid',flow_from:[{stat_energy_from:'sensor.grid'}]}],device_consumption:[{stat_consumption:'sensor.tv',included_in_stat:'sensor.grid'}]}:{}}),ha=liveHA(h);
  assert.deepEqual(ha.history('sensor.t'),[],'right away — whatever there is, the request is sent');await new Promise(r=>setTimeout(r,5));
  const H=ha.history('sensor.t');assert.equal(H.length,36);assert.equal(H[0],20);assert.equal(H[35],22);
  assert.deepEqual(await ha.statistics(['sensor.e'],{start:0,end:1,period:'day',types:['change']}),{'sensor.e':[{start:1,end:2,change:3}]});
  assert.deepEqual(await ha.energy(),{grid:['sensor.grid'],devices:[{statistic:'sensor.tv',name:undefined,parent:'sensor.grid'}]});
});

test('plan in HA: written with a delay and a revision number; changed in another window — do not write, ask', async () => {
  let rev=3,conflicts=0;const sent=[];
  const hass={callWS:async m=>{sent.push(m);if(m.type==='home_twin/plan/get')return {plan:{rooms:[]},rev};if(m.rev!=null&&m.rev!==rev)throw Object.assign(new Error('c'),{code:'conflict'});return {rev:++rev};}};
  const P=hassPlans(()=>hass,{onConflict:()=>conflicts++});
  assert.deepEqual(await P.load(),{plan:{rooms:[]},rev:3});
  P.save({rooms:[1]});P.save({rooms:[1,2]});await P.flush();
  assert.equal(sent.filter(m=>m.type==='home_twin/plan/save').length,1,'two edits in a row — one write');assert.deepEqual(sent.at(-1),{type:'home_twin/plan/save',plan:{rooms:[1,2]},rev:3});
  rev=10; // another window wrote its own
  P.save({rooms:[9]});await P.flush();assert.equal(conflicts,1);
  P.keepMine();await new Promise(r=>setTimeout(r,5));assert.equal(sent.at(-1).rev,undefined,'“Keep mine” — without a revision, on top');
});
