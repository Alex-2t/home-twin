// Version history: snapshots at meaningful moments, no duplicates, at most 40, old autosaves go first.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createVersions,VER_MAX,AUTO_MS} from './versions.js';

const mem=()=>{const m=new Map();return {m,get:async k=>structuredClone(m.get(k)),batch:async ops=>{for(const [op,k,v] of ops)op==='put'?m.set(k,structuredClone(v)):m.delete(k);}};};

test('a snapshot is the plan as it was at call time; an identical one in a row is not written; each project has its own versions', async () => {
  let now=1e12;const store=mem(),V=createVersions({store,now:()=>now});await V.open('a');
  const p={id:'a',rooms:[1]};const w=V.add(p,{kind:'before',what:'merge'});p.rooms.push(2);await w; // “before an edit” — taken before it
  assert.deepEqual(JSON.parse(V.list()[0].plan).rooms,[1]);
  assert.equal(await V.add({id:'a',rooms:[1]}),null,'already exists');
  assert.equal(await V.add({id:'b',rooms:[1]}),null,'another project is not written');
  assert.equal(await V.add({id:'a',rooms:[1],onboarding:{steps:{open:'in_progress'}}}),null,'wizard marks are not a new version');
  now+=1;await V.add(p,{kind:'step',what:'split'});assert.deepEqual(V.list().map(v=>v.kind),['step','before']);
  now+=1;await V.add({id:'a',rooms:[3]});assert.equal((await V.add({id:'a',rooms:[3]},{kind:'step',what:'open'})).what,'open','an autosave with the same plan is relabelled with the step');
  assert.deepEqual(V.list().map(v=>v.kind),['step','step','before']);
  const V2=createVersions({store});await V2.open('a');assert.equal(V2.list().length,3,'the same after a reload');
  await V2.open('b');assert.equal(V2.list().length,0);
});

test('at most 40: the oldest autosaves go first', async () => {
  let now=1;const V=createVersions({store:mem(),now:()=>now});await V.open('a');
  await V.add({id:'a',n:-1},{kind:'step',what:'rect'}); // the oldest, but not an autosave — it stays
  for(let i=0;i<VER_MAX+5;i++){now++;await V.add({id:'a',n:i},{kind:'auto'});}
  const L=V.list();assert.equal(L.length,VER_MAX);assert.equal(L.at(-1).kind,'step');assert.equal(JSON.parse(L[0].plan).n,VER_MAX+4);
});

test('autosave every 10 minutes', async () => {
  let now=0;const V=createVersions({store:mem(),now:()=>now});await V.open('a');
  assert.equal(V.due(),true,'no versions — due');await V.add({id:'a',x:1});
  now=AUTO_MS-1;assert.equal(V.due(),false);now=AUTO_MS;assert.equal(V.due(),true);
});
