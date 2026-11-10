// Colors in the generated models: every visible catalog model has a color to choose and draws a custom #rrggbb; a rug's border takes color2.
import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG,byId} from './catalog.js';
import {makeObject} from './furniture3d.js';

const colorsIn=g=>{const s=new Set();g.traverse(o=>{if(o.isMesh)for(const m of [o.material].flat())s.add(m.color.getHex());});return s;};
const models=CATALOG.filter(c=>!c.hidden&&c.kind==='gen');

test('every visible model has a color to choose',()=>{
  assert.deepEqual(models.filter(c=>!c.color).map(c=>c.id),[]);
});
test('a custom color: every visible model in every variant builds and draws it',()=>{
  const bad=[];
  for(const c of models)for(const v of c.vars?.map(x=>x[0])||[undefined]){
    let g;try{g=makeObject({model:c.id,w:c.w,d:c.d,h:c.h,color:'#3a7bd5',v});}catch(e){bad.push(`${c.id} ${v??''}: ${e.message}`);continue;}
    if(!colorsIn(g).has(0x3a7bd5))bad.push(`${c.id} ${v??''}: the color is not drawn`);}
  assert.deepEqual(bad,[]);
});
test('a rug: the field in color, the border in color2; without color2 — a darker shade of the field',()=>{
  const rug={model:'rug',w:2,d:1.4,h:.012,color:'#b8b1a5'};
  for(const v of ['rect','round','oval']){const auto=colorsIn(makeObject({...rug,v})),two=colorsIn(makeObject({...rug,v,color2:'#978e80'}));
    assert.ok(auto.has(0xb8b1a5)&&!auto.has(0x978e80),v);assert.ok(two.has(0xb8b1a5)&&two.has(0x978e80),v);}
});
test('a built-in wardrobe can reach the ceiling of a 2.7 m room',()=>{
  assert.ok(byId('wardrobeRun').max[2]>=2.7);
});
