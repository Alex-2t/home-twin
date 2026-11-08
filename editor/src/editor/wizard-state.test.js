import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stepFacts,stepStatus,recordStep,stepReadyToFinish,lampWaits} from './wizard-state.js';
import {emptyPlan,migrate} from '../core/plan.js';
import {createPath} from './wizard-path.js';

const room=()=>({id:'r',area:'bedroom',polygon:[[0,0],[6,0],[6,6],[0,6]]});
test('finish hint: all rooms linked; undoing the last link removes it',()=>{
  const p={...emptyPlan(),rooms:Array.from({length:6},(_,i)=>({...room(),id:'r'+i,area:i===5?null:'area'+i}))};
  assert.equal(stepReadyToFinish(p,'names'),false);
  p.rooms[5].noArea=true;assert.equal(stepReadyToFinish(p,'names'),false);
  p.rooms[5].area='area5';assert.equal(stepReadyToFinish(p,'names'),true);
  p.rooms[5].area=null;assert.equal(stepReadyToFinish(p,'names'),false);
});
test('finish hint counts both zones and does not require linking shafts',()=>{
  const r=room(),p={...emptyPlan(),rooms:[r,{...room(),id:'shaft',solid:true,area:null}]};
  r.zone={a:[3,0],b:[3,6],left:true,area:null};
  assert.equal(stepReadyToFinish(p,'names'),false);
  r.zone.area='kitchen';assert.equal(stepReadyToFinish(p,'names'),true);
});
test('lights finish hint waits for confirmation and does not count skipped lamps as done',()=>{
  const p={...emptyPlan(),lights:[{placed:true},{placed:true,draft:true}]};
  assert.equal(stepReadyToFinish(p,'lights'),false);
  delete p.lights[1].draft;assert.equal(stepReadyToFinish(p,'lights'),true);
  p.lights[1]={placed:false,skip:true};assert.equal(stepReadyToFinish(p,'lights'),false);
});
test('an empty list and stages without an exact count do not prompt to finish',()=>{
  const p=emptyPlan();
  assert.equal(stepReadyToFinish(p,'names'),false);assert.equal(stepReadyToFinish(p,'lights'),false);
  Object.assign(p,{rooms:[room()],openings:[{}],furniture:[{}],sensors:[{}],view:{}});
  for(const k of ['rect','split','open','furniture','sensors','fin'])assert.equal(stepReadyToFinish(p,k),false,k);
});
test('one insertion does not finish the whole stage; confirmation and deferral survive loading',()=>{
  const p={...emptyPlan(),rooms:[room()],furniture:[{id:'bed'}]};
  assert.equal(stepStatus(p,'furniture'),'in_progress');
  recordStep(p,'furniture','confirmed');recordStep(p,'open','deferred');
  const loaded=migrate(JSON.parse(JSON.stringify(p)));
  assert.equal(stepStatus(loaded,'furniture'),'confirmed');assert.equal(stepStatus(loaded,'open'),'deferred');
  loaded.furniture=[];assert.equal(stepStatus(loaded,'furniture'),'in_progress');
});
test('a draft and a skipped lamp do not count as confirmed lights',()=>{
  const p={...emptyPlan(),lights:[{placed:true,draft:true},{placed:false,skip:true}]};
  assert.equal(stepFacts(p,'lights').ready,0);assert.equal(stepFacts(p,'lights').complete,false);
  recordStep(p,'lights','confirmed');assert.equal(stepStatus(p,'lights'),'in_progress');
  p.lights=[{placed:true}];assert.equal(stepStatus(p,'lights'),'confirmed');
  p.lights.push({placed:false});assert.equal(stepStatus(p,'lights'),'in_progress');
});
test('linking counts both zones, and a skip does not turn into a link',()=>{
  const r=room(),p={...emptyPlan(),rooms:[r]};
  r.zone={a:[3,0],b:[3,6],left:true,area:null};
  assert.deepEqual(stepFacts(p,'names'),{total:2,ready:1,complete:false,started:true});
  r.zone.noArea=true;assert.equal(stepFacts(p,'names').complete,false);
  r.zone.area='kitchen';assert.equal(stepFacts(p,'names').complete,true);
});
test('shafts and small parts do not require linking, an empty lights list is allowed',()=>{
  const p={...emptyPlan(),rooms:[room(),{...room(),solid:true,area:null},{id:'tiny',polygon:[[0,0],[.1,0],[.1,.1],[0,.1]]}]};
  assert.equal(stepFacts(p,'names').total,1);assert.equal(stepFacts(p,'names').complete,true);
  assert.equal(stepFacts(p,'lights').complete,true);assert.equal(stepStatus(p,'lights'),'not_started');
  recordStep(p,'lights','confirmed');assert.equal(stepStatus(p,'lights'),'confirmed');
});
test('the outline is finished by drawing, a single room requires explicit confirmation',()=>{
  const p={...emptyPlan(),rooms:[room()]};assert.equal(stepStatus(p,'rect'),'confirmed');
  assert.equal(stepStatus(p,'split'),'in_progress');recordStep(p,'split','confirmed');assert.equal(stepStatus(p,'split'),'confirmed');
});

test('navigation goes forward, resume returns to deferred steps, migration does not count partial lights as done',()=>{
  const p={...emptyPlan(),id:'p',rooms:[room()],lights:[{placed:true,draft:true}]};
  const ed={plan:p,hints:{count:k=>k==='pass:p:lights'?1:0},wizard:{get:()=>null},history:{amend:()=>{}},modes:{rooms:{},lights:{},furniture:{},sensors:{}}};
  const path=createPath(ed);let next;path.go=k=>next=k;path.finale=()=>next='fin';
  assert.equal(path.status('lights'),'deferred');
  path.after('open',{defer:true});assert.equal(next,'names');assert.equal(path.status('open'),'deferred');
  path.after('split');path.resume();assert.equal(next,'open');
  path.after('lights',{defer:true});assert.equal(next,'fin');
  path.after('sensors');assert.equal(next,'fin');
});

test('after the main steps — a question about readings on the walls; once skipped, it is not asked again',()=>{
  const p={...emptyPlan(),id:'p',rooms:[room()]};
  const ed={plan:p,hints:{count:()=>0},wizard:{get:()=>null},history:{amend:()=>{}},modes:{rooms:{},lights:{},furniture:{},sensors:{available:()=>true}}};
  const path=createPath(ed);let next;path.go=k=>next=k;path.finale=()=>next='fin';path.ask=()=>next='ask';
  path.after('lights',{defer:true});assert.equal(next,'ask');
  path.resume();assert.equal(next,'split'); // mandatory steps not passed — go to them first
  recordStep(p,'sensors','deferred');path.after('lights');assert.equal(next,'fin'); // “Skip” — the step is deferred
  ed.modes.sensors.available=()=>false;recordStep(p,'sensors','in_progress');path.after('lights');assert.equal(next,'fin'); // nothing to show — does not ask
});

test('lights: lamps from areas that are not on the plan do not block finishing the step', () => {
  const p={...emptyPlan(),rooms:[{id:'r',area:'bed',polygon:[[0,0],[4,0],[4,3],[0,3]]}],
    lights:[{area:'bed',placed:true},{area:'kids',placed:false},{area:'bed',placed:false}]};
  assert.deepEqual([stepFacts(p,'lights').ready,stepFacts(p,'lights').total],[1,2],'the kids room lamp waits for its room');
  assert.equal(lampWaits(p,p.lights[1]),true);assert.equal(lampWaits(p,p.lights[2]),false);
  p.lights[2].placed=true;assert.equal(stepFacts(p,'lights').complete,true);
  p.rooms.push({id:'k',area:'kids',polygon:[[4,0],[8,0],[8,3],[4,3]]});assert.equal(stepFacts(p,'lights').complete,false,'the kids room is linked — its lamp counts again');
});
