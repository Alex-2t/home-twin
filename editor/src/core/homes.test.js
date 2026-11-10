// The ten typical homes (demo/homes.mjs, D-030) through the editor's own code: what a person would meet opening each of them.
// Rooms, openings and walls are built as the editor builds them; the furniture is in the catalog and nothing reports “overlaps”,
// “blocks a door” or “goes into a wall” where the layout is a normal one; after the wizard's steps (rooms get their HA areas,
// “Auto-place” lights, the suggested sensors, devices) every light, sensor and device has its place, and auto-placement adds no conflicts;
// “Auto-place” also runs on all the home's lights from scratch.
// One home: node --test --test-name-pattern=studio src/core/homes.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {HOMES} from '../../demo/homes.mjs';
import {migrate} from './plan.js';
import {validate,openingCoords,pointIn} from './geometry.js';
import {byId,colorsOf} from './catalog.js';
import {furnitureConflicts,setRoomArea} from './layout.js';
import {autoPlace as autoLights} from './fixtures.js';
import {recommend,orphans,isClimate,fitsAuto,roomOfArea} from './sensors.js';
import {autoPlace as autoDevices,deviceKind,PLACEABLE,recOf,isCentral} from './devices.js';
import {planWalls,planSpots} from './plan-scene.js';
import {mockHA,haPlanLights,mergePlanLights} from '../editor/ha.js';

const near=(p,poly,d=.02)=>pointIn(p,poly)||poly.some((a,i)=>{const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy||1,
  t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<=d;});
const conflicts=plan=>[...furnitureConflicts(plan)].map(([id,why])=>{const f=plan.furniture.find(f=>f.id===id);return `${id} ${f?.name||f?.model}: ${why}`;});

for(const h of HOMES)test(h.title,async t=>{
  const {HA,DEMO}=await h.load(),given=structuredClone(DEMO),plan=migrate(structuredClone(DEMO)),ha=mockHA(structuredClone(HA));
  const rooms=new Map(plan.rooms.map(r=>[r.id,r]));

  await t.test('rooms',()=>{
    assert.deepEqual(validate(plan.rooms).map(e=>`${e.room}: ${e.text}`),[]);
    assert.deepEqual(plan.rooms.filter((r,i)=>plan.rooms.findIndex(x=>x.id===r.id)!==i).map(r=>r.id),[],'room ids repeat');});

  await t.test('openings and walls',()=>{
    // an opening that finds no wall is dropped on load; one whose wall is too short for it is not drawn
    const key=o=>JSON.stringify([o.a,o.b]),lost=given.openings.filter(o=>!plan.openings.some(p=>key(p)===key(o))).map(o=>`${o.kind} ${JSON.stringify(o.a)}–${JSON.stringify(o.b)}: no wall`);
    const hidden=plan.openings.filter(o=>!openingCoords(plan.rooms,o)).map(o=>`${o.kind} ${o.id}: does not fit its wall`);
    assert.deepEqual([...lost,...hidden],[]);
    const w=planWalls(plan);assert.equal(w.hidden,0);assert.ok(w.g.footprint,'no walls built');});

  await t.test('furniture',()=>{
    const bad=[];
    for(const f of plan.furniture){const c=byId(f.model);if(!c){bad.push(`${f.id}: no model “${f.model}” in the catalog`);continue;}
      if(c.min&&c.max)['w','d','h'].forEach((k,i)=>{if(f[k]<c.min[i]-1e-6||f[k]>c.max[i]+1e-6)bad.push(`${f.id} ${f.model}: ${k}=${f[k]} outside ${c.min[i]}…${c.max[i]}`);});
      if(f.color&&!colorsOf(c).includes(f.color))bad.push(`${f.id} ${f.model}: no color “${f.color}”`);
      if(f.v&&c.vars&&!c.vars.some(v=>v[0]===f.v))bad.push(`${f.id} ${f.model}: no variant “${f.v}”`);}
    const ids=plan.furniture.map(f=>f.id);bad.push(...ids.filter((id,i)=>ids.indexOf(id)!==i).map(id=>`${id}: repeated id`));
    assert.deepEqual([...bad,...conflicts(plan)],[]);});

  // the wizard: rooms get their HA areas (here the area id is the room id; the other part of a room, its zone, has its own in the plan),
  // then lights, sensors and devices are placed. on(a) — the room of area a
  for(const r of plan.rooms)if(HA.areas[r.id])setRoomArea(plan,r,r.id,HA.areas[r.id]);
  const on=a=>roomOfArea(plan,a);
  plan.lights=mergePlanLights(plan.lights,haPlanLights(ha),ha.switches());

  await t.test('lights',()=>{
    const bad=[];
    // an area that is not a room on the plan (“Outside”) is fine: its lights wait for a room (wizard-state.js: lampWaits); a typo is not
    for(const a of new Set(HA.lights.map(l=>l.area).filter(Boolean)))if(!HA.areas[a])bad.push(`area “${a}” has lights but is not in HA.areas`);
    for(const L of plan.lights.filter(L=>L.placed)){const r=rooms.get(L.room);if(!r){bad.push(`${L.id}: no room “${L.room}”`);continue;}
      const pts=[...(L.points||[]),...(L.segments||[]).flat()];
      if(!pts.length)bad.push(`${L.id}: placed with no points`);
      for(const p of pts)if(!near(p,r.polygon))bad.push(`${L.id}: ${JSON.stringify(p)} is outside “${r.name}”`);}
    const todo=plan.lights.filter(L=>!L.placed&&on(L.area)).map(L=>L.id);autoLights(plan);
    bad.push(...todo.filter(id=>!plan.lights.find(L=>L.id===id).placed).map(id=>`${id}: “Auto-place” left it out`));
    assert.deepEqual(bad,[]);});

  // the same home from scratch: every HA light un-placed, “Auto-place” finds each one a spot in its room with no new conflicts.
  // A home may place all its lights by hand for the look (the examples, D-064); this keeps auto-placement checked on every home.
  await t.test('lights from scratch',()=>{
    const p=migrate(structuredClone(DEMO));for(const r of p.rooms)if(HA.areas[r.id])setRoomArea(p,r,r.id,HA.areas[r.id]);
    p.lights=mergePlanLights([],haPlanLights(ha),ha.switches()).map(L=>({...L,placed:false,points:[],segments:[]}));
    const before=new Set(furnitureConflicts(p).keys()),bad=[];autoLights(p);
    for(const L of p.lights){const r=p.rooms.find(r=>r.id===L.room);if(!roomOfArea(p,L.area))continue;
      if(!L.placed||!r){bad.push(`${L.id}: “Auto-place” left it out`);continue;}
      for(const q of [...(L.points||[]),...(L.segments||[]).flat()])if(!near(q,r.polygon))bad.push(`${L.id}: ${JSON.stringify(q)} is outside “${r.name}”`);}
    bad.push(...conflicts(p).filter(s=>!before.has(s.split(' ')[0])).map(s=>'after auto-placement '+s));
    assert.deepEqual(bad,[]);});

  const ctx={sensors:ha.sensors(),areas:ha.areas(),state:e=>ha.state(e)};
  await t.test('sensors',()=>{
    plan.sensors=recommend(plan,ctx).map((x,i)=>({id:'s'+i,...x}));
    const bad=[];
    // every room whose area has room-air sensors gets them on its wall; a sensor with no room is asked about (orphans), not lost
    for(const s of ctx.sensors.filter(s=>isClimate(s)&&fitsAuto(s)&&on(s.area)))
      if(!plan.sensors.some(S=>S.room===on(s.area).id))bad.push(`“${on(s.area).name}” has ${s.entity}, nothing suggested`);
    const spots=planSpots(plan,ctx,{cam:[.53,-.85]});
    for(const S of plan.sensors)if(!spots.some(sp=>sp.id===S.id))bad.push(`${S.entity}: no wall for it in “${rooms.get(S.room)?.name}”`);
    const lost=orphans(plan,ctx).filter(s=>s.area).map(s=>`${s.entity}: area “${s.area}” has no room`);
    assert.deepEqual([...new Set(bad),...lost],[]);});

  await t.test('devices',()=>{
    const devs=ha.devices(),ent=e=>ha.entity(e),before=new Set(furnitureConflicts(plan).keys());
    autoDevices(plan,devs,ent);
    const bad=devs.filter(d=>PLACEABLE.has(deviceKind(d,ent(d.entity)))&&!isCentral(d)&&on(d.area)&&!recOf(plan,d.entity)).map(d=>`${d.entity}: not placed`);
    const made=conflicts(plan).filter(s=>!before.has(s.split(' ')[0])).map(s=>'after auto-placement '+s);
    assert.deepEqual([...bad,...made],[]);});
});
