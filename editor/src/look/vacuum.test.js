import test from 'node:test';
import assert from 'node:assert/strict';
import {vacuumDevices,vacuumStatus,vacuumButton,vacuumHomeEnabled,vacuumCommand} from './vacuum.js';
import {activeChips} from './overview.js';

const ha=(devices,entities={})=>({devices:()=>devices,entity:e=>entities[e]||null});
const hall={id:'r1',short:'Hallway'};
const ALL=4|16|32|8192;
const one=(state,features=ALL,area='hall')=>vacuumDevices(ha([{entity:'vacuum.r',name:'Robot',area,domain:'vacuum'}],state?{'vacuum.r':{state,attributes:{supported_features:features}}}:{}),a=>a==='hall'?hall:null)[0];

test('robots from HA by the vacuum domain; the dock is the area room', () => {
  assert.deepEqual(vacuumDevices(null),[]);
  assert.deepEqual(vacuumDevices(ha([{entity:'cover.x',domain:'cover'}])),[]);
  assert.deepEqual(one('docked'),{entity:'vacuum.r',name:'Robot',room:'r1',roomName:'Hallway',status:'available',activity:'docked',allowed:['start']});
  assert.equal(one(null).status,'unavailable','no state — unavailable');assert.equal(one('unavailable').status,'unavailable');
  assert.equal(one('docked',ALL,null).room,null);
  assert.equal(one('mopping').activity,'idle','an unknown integration state — treated as idle');
});

test('buttons — only what the robot supports (supported_features) and what makes sense right now', () => {
  assert.deepEqual(one('cleaning').allowed,['pause','home']);
  assert.deepEqual(one('paused').allowed,['start','home']);
  assert.deepEqual(one('returning').allowed,['start']);
  assert.deepEqual(one('idle').allowed,['start','home']);
  assert.deepEqual(one('cleaning',16).allowed,['home'],'no pause — no pause button');
  assert.deepEqual(one('docked',4|16).allowed,[],'no start (old integrations) — start is not offered');
});

test('caption: what it is doing; when docked — where the dock is', () => {
  assert.equal(vacuumStatus(one('docked')),'Docked · Hallway');
  assert.equal(vacuumStatus(one('docked',ALL,null)),'Docked');
  assert.equal(vacuumStatus(one('cleaning')),'Cleaning');assert.equal(vacuumStatus(one('returning')),'Returning to dock');
  assert.equal(vacuumStatus(one('paused')),'Cleaning paused');assert.equal(vacuumStatus(one('error')),'Error — needs help');
  assert.equal(vacuumStatus(one('unavailable')),'Device unavailable');assert.equal(vacuumStatus(one('docked'),true),'Sending command…');
});

test('main button: start — pause — continue; “Return to dock” and commands', () => {
  assert.deepEqual(vacuumButton(one('docked')),{label:'Start cleaning',action:'start',disabled:false});
  assert.deepEqual(vacuumButton(one('cleaning')),{label:'Pause',action:'pause',disabled:false});
  assert.deepEqual(vacuumButton(one('paused')),{label:'Continue',action:'start',disabled:false});
  assert.equal(vacuumButton(one('unavailable')).disabled,true);assert.equal(vacuumButton(one('docked',4|16)).disabled,true);
  assert.equal(vacuumHomeEnabled(one('cleaning')),true);assert.equal(vacuumHomeEnabled(one('docked')),false);
  assert.deepEqual(vacuumCommand(one('cleaning'),'home'),['vacuum','return_to_base']);
  assert.deepEqual(vacuumCommand(one('docked'),'start'),['vacuum','start']);assert.equal(vacuumCommand(one('docked'),'pause'),null);
});

test('“Now”: the robot is cleaning — the “Cleaning” chip', () => {
  assert.deepEqual(activeChips({vacuum:[{id:'vacuum.r',room:'r1',cleaning:true}]}).map(c=>[c.key,c.label,c.rooms.join()]),[['vacuum','Cleaning','r1']]);
  assert.deepEqual(activeChips({vacuum:[{id:'vacuum.r',room:'r1',cleaning:false}]}),[]);
});
