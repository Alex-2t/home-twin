// “Customize panel”: card order, remove / bring back, “Favorites” with any HA entities. The layout lives in the plan and
// survives new versions: a built-in card that did not exist before takes its place instead of getting lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN,ROOM_BUILTIN,resolveLayout,layoutToSave,addable,newFav,move,placeCard,placeEntity,removeEntity,entityCard,addEntity} from './layout.js';
import {favView,favCommand,FAV_DOMAINS} from './favorites.js';
import {readPlan} from '../core/plan-file.js';
import {mockHA} from '../editor/ha.js';

const ids=c=>c.map(x=>x.id);
const DEF=BUILTIN.map(b=>b.id);

test('not customized — default cards; same as default — nothing is written into the plan', () => {
  assert.deepEqual(ids(resolveLayout(undefined)),DEF);
  assert.equal(layoutToSave(resolveLayout(null)),null);
});

test('order, removed cards and “Favorites” are saved and read back', () => {
  let c=resolveLayout(null);c=move(c,'stats',-1);c=c.filter(x=>x.id!=='scenes');const f=newFav(c,'Buttons');f.entities=['scene.movie','switch.kettle'];c=[f,...c];
  const saved=layoutToSave(c);
  assert.deepEqual(saved.removed,['scenes']);assert.deepEqual(ids(resolveLayout(saved)),ids(c));
  assert.deepEqual(resolveLayout(saved)[0],{id:'fav1',type:'entities',title:'Buttons',entities:['scene.movie','switch.kettle']});
  assert.equal(newFav(c,'More').id,'fav2');
  assert.deepEqual(addable(c),['scenes','entities'],'a removed card can be brought back, “Favorites” — always');
});

test('a new built-in card for those who already customized the panel takes its place; unknown ones are dropped', () => {
  const saved={cards:[{id:'stats'},{id:'now'},{id:'rooms'},{id:'tv'},{id:'now'}],removed:['controls','watch']};
  // vacuum and scenes are not mentioned (as if they did not exist in the version that saved it): each goes after its nearest default
  // neighbour that is in the layout: scenes — after now, vacuum — after rooms (controls and watch are removed)
  assert.deepEqual(ids(resolveLayout(saved)),['stats','now','scenes','rooms','vacuum']);
});

test('one-step move: at the edges — no change', () => {
  const c=resolveLayout(null);
  assert.deepEqual(ids(move(c,'now',-1)),DEF);assert.deepEqual(ids(move(c,'stats',1)),DEF);
  assert.deepEqual(ids(move(c,'now',1)).slice(0,2),['scenes','now']);
});

test('dragging like the Android shade: a card into place, a device into “Favorites”, between cards — a new “Favorites”', () => {
  const fav=(id,entities)=>({id,type:'entities',title:'F',entities});
  let c=[{id:'now'},fav('fav1',['a','b']),{id:'rooms'}];
  assert.deepEqual(ids(placeCard(c,{id:'stats'},1)),['now','stats','fav1','rooms'],'from the shade — between cards');
  assert.deepEqual(ids(placeCard(c,{id:'now'},2)),['fav1','rooms','now'],'an own card — index among the others');
  assert.deepEqual(ids(placeCard(c,{id:'x'},99)),['now','fav1','rooms','x']);
  assert.deepEqual(placeEntity(c,'z','fav1',1)[1].entities,['a','z','b']);
  assert.deepEqual(placeEntity(c,'a','fav1',1,'fav1')[1].entities,['b','a'],'inside a card — reorder');
  c=[...c,fav('fav2',['c'])];
  const moved=placeEntity(c,'a','fav2',0,'fav1');assert.deepEqual([moved[1].entities,moved[3].entities],[['b'],['a','c']],'from one “Favorites” to another');
  assert.deepEqual(removeEntity(c,'b','fav1')[1].entities,['a']);
  const made=entityCard(c,'a',2,'Favorites','fav1');
  assert.deepEqual(ids(made),['now','fav1','fav3','rooms','fav2']);assert.deepEqual(made[2],{id:'fav3',type:'entities',title:'Favorites',entities:['a']});assert.deepEqual(made[1].entities,['b']);
  assert.deepEqual(addEntity(c,'q','F').at(-1).entities,['c','q'],'“+” — into the last “Favorites”');
  assert.deepEqual(addEntity([{id:'now'}],'q','F'),[{id:'now'},{id:'fav1',type:'entities',title:'F',entities:['q']}],'none — a new one at the end');
});

test('plan: the layout passes file validation, garbage does not', () => {
  const base={rooms:[{id:'r',polygon:[[0,0],[4,0],[4,3],[0,3]]}]};
  const ok={...base,panel:{cards:[{id:'now'},{id:'fav1',type:'entities',title:'Buttons',entities:['scene.movie']}],removed:['stats']}};
  assert.deepEqual(readPlan(JSON.stringify(ok)).panel,ok.panel);
  for(const panel of [{cards:'now'},{cards:[{id:''}]},{cards:[{id:'f',type:'entities',entities:[1]}]},{cards:[{id:'f',type:'iframe'}]},{cards:[],removed:'x'}])
    assert.throws(()=>readPlan(JSON.stringify({...base,panel})),undefined,JSON.stringify(panel));
});

test('room screen: its own parts and “Favorites”, default — nothing in the plan; overview cards do not get in', () => {
  const R=ROOM_BUILTIN.map(b=>b.id);
  assert.deepEqual(ids(resolveLayout(undefined,ROOM_BUILTIN)),R);assert.equal(layoutToSave(resolveLayout(null,ROOM_BUILTIN),ROOM_BUILTIN),null);
  let c=resolveLayout(null,ROOM_BUILTIN);c=move(c,'lights',-1);c=c.filter(x=>x.id!=='extras');c=addEntity(c,'switch.kettle','Favorites');
  const saved=layoutToSave(c,ROOM_BUILTIN);
  assert.deepEqual(saved.removed,['extras']);assert.deepEqual(ids(resolveLayout(saved,ROOM_BUILTIN)),['climate','ac','lights','covers','fav1']);
  assert.deepEqual(addable(c,ROOM_BUILTIN),['extras','entities']);
  assert.deepEqual(ids(resolveLayout({cards:[{id:'now'},{id:'lights'}]},ROOM_BUILTIN)),['climate','ac','covers','lights','extras'],'foreign ids are dropped');
});

test('plan: the room layout passes file validation, garbage does not', () => {
  const room={id:'r',polygon:[[0,0],[4,0],[4,3],[0,3]]},panel={cards:[{id:'lights'},{id:'fav1',type:'entities',title:'',entities:['switch.kettle']}],removed:['extras']};
  assert.deepEqual(readPlan(JSON.stringify({rooms:[{...room,panel}]})).rooms[0].panel,panel);
  for(const bad of [{cards:'lights'},{cards:[{id:''}]},{cards:[],removed:[1]}])
    assert.throws(()=>readPlan(JSON.stringify({rooms:[{...room,panel:bad}]})),undefined,JSON.stringify(bad));
});

const st=(state,attributes={})=>({state,attributes});
test('“Favorites” tile: look and tap by domain, like an HA tile', () => {
  const v=(entity,x,extra={})=>favView({entity,name:'x',domain:entity.split('.')[0],...extra},x);
  assert.deepEqual(v('switch.kettle',st('on')),{icon:'power',on:true,off:false,text:'On',action:'toggle'});
  assert.equal(v('light.a',st('off')).text,'Off');
  assert.deepEqual([v('scene.movie',st('2026-11-07')).text,v('scene.movie',st('x')).action],['Run','run']);
  assert.equal(v('script.s',st('on')).text,'Running');assert.equal(v('button.b',st('2026')).action,'press');
  assert.deepEqual([v('cover.c',st('open')).text,v('cover.c',st('closed'),{cls:'blind'}).icon],['Open','blind']);
  assert.deepEqual([v('lock.front',st('locked')).text,v('lock.front',st('locked')).action],['Locked','info'],'lock — HA card only');
  assert.equal(v('valve.w',st('open')).action,'info','valve — HA card only');
  assert.equal(v('sensor.co2',st('1180',{unit_of_measurement:'ppm'})).text,'1180 ppm');assert.equal(v('sensor.t',st('21.64'),{unit:'°C'}).text,'22 °C');
  assert.equal(v('sensor.h',st('4.36'),{unit:'%'}).text,'4.4%');
  assert.equal(v('binary_sensor.door',st('on'),{cls:'door'}).text,'Open');assert.equal(v('binary_sensor.leak',st('off'),{cls:'moisture'}).text,'Dry');
  assert.equal(v('climate.ac',st('heat',{current_temperature:21.5})).text,'Heat · 21.5°');
  assert.deepEqual(v('switch.kettle',null),{icon:'power',on:false,off:true,text:'Unavailable',action:null},'no entity — not tappable');
  assert.equal(v('sensor.t',st('unavailable')).action,'info');
  const c=(entity,x,a)=>favCommand({entity},x,a);
  assert.deepEqual(c('switch.k',st('on'),'toggle'),['switch','toggle']);assert.deepEqual(c('scene.m',null,'run'),['scene','turn_on']);
  assert.deepEqual(c('button.b',null,'press'),['button','press']);assert.deepEqual(c('cover.c',st('open'),'cover'),['cover','close_cover']);
  assert.deepEqual(c('cover.c',st('closed'),'cover'),['cover','open_cover']);assert.equal(c('lock.l',st('locked'),'info'),null);
});

test('demo layer: all entities to pick from, commands to switches, scenes and scripts', async () => {
  const ha=mockHA({areas:{k:'Kitchen'},lights:[{id:'a',entity:'light.a',name:'Ceiling light',area:'k'}],sensors:[{entity:'sensor.t',name:'T',area:'k',cls:'temperature',unit:'°C'},{entity:'sensor.b',name:'B',cls:'battery',cat:'diagnostic'}],
    states:{'sensor.t':21.5},devices:[{entity:'climate.ac',name:'Air conditioner',area:'k',domain:'climate'}],
    entities:{'climate.ac':st('off'),'switch.kettle':st('off'),'scene.movie':st('2026'),'script.s':st('off')},extra:[{entity:'switch.kettle',name:'Kettle',area:'k',domain:'switch'},{entity:'scene.movie',name:'Movie',domain:'scene'},{entity:'script.s',name:'S',domain:'script'}]});
  assert.deepEqual(ha.entities().map(x=>x.entity),['light.a','climate.ac','sensor.t','switch.kettle','scene.movie','script.s'],'no diagnostic sensors');
  assert.ok(ha.entities().every(x=>FAV_DOMAINS.includes(x.domain)));
  assert.deepEqual(ha.entity('sensor.t'),{state:'21.5',attributes:{unit_of_measurement:'°C',device_class:'temperature'}},'a sensor — like hass.states');
  assert.equal(await ha.call('switch','toggle',{entity_id:'switch.kettle'}),true);assert.equal(ha.entity('switch.kettle').state,'on','a relay not behind a lamp');
  await ha.call('script','turn_on',{entity_id:'script.s'});assert.equal(ha.entity('script.s').state,'on');
  await ha.call('scene','turn_on',{entity_id:'scene.movie'});assert.notEqual(ha.entity('scene.movie').state,'2026');
});
