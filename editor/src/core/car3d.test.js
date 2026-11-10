import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {car} from './car3d.js';
import {makeObject} from './furniture3d.js';
import {byId} from './catalog.js';

const spec=byId('car');
const dispose=g=>g.traverse(o=>o.geometry?.dispose());

for(const [v,,size] of spec.vars)test(`car ${v}: finite geometry, grounded wheels and bounded detail at every size limit`,()=>{
  const defaults=size||spec;
  const sizes=[['default',[defaults.w,defaults.d,defaults.h]]];
  for(const w of [spec.min[0],spec.max[0]])for(const d of [spec.min[1],spec.max[1]])for(const h of [spec.min[2],spec.max[2]])sizes.push(['limit',[w,d,h]]);
  for(const [label,[w,d,h]] of sizes){
    const g=makeObject({model:'car',w,d,h,v,color:spec.color});
    let triangles=0,meshes=0;
    g.traverse(o=>{
      if(!o.isMesh)return;
      meshes++;
      const geo=o.geometry,pos=geo.attributes.position;
      assert.ok(pos.count>0,`${label}: empty part`);
      for(const attr of Object.values(geo.attributes))assert.ok(attr.array.every(Number.isFinite),`${label}: invalid mesh attribute`);
      if(geo.index)assert.ok(geo.index.array.every(i=>i<pos.count),`${label}: invalid triangle index`);
      triangles+=(geo.index?.count??pos.count)/3;
    });
    const bounds=new THREE.Box3().setFromObject(g),extent=bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(bounds.min.y)<1e-5,`${label}: tires must rest on the floor`);
    assert.ok(extent.x<=w+.32&&extent.x>=w-.05,`${label}: only mirrors may exceed body width`);
    assert.ok(extent.z<=d+.06&&extent.z>=d-.01,`${label}: bumpers follow the chosen length`);
    assert.ok(extent.y<=h+.04&&extent.y>=h-.05,`${label}: roof follows the chosen height`);
    assert.ok(meshes<=32,'detail must stay within the overview draw-call budget');
    assert.ok(triangles<100000,'detail must stay within the overview geometry budget');
    dispose(g);
  }
});

test('car generation preserves existing children and rebuilding does not alter shared paint',()=>{
  const g=new THREE.Group(),existing=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
  existing.position.set(4,2,1);g.add(existing);
  car(g,{...spec,v:'sedan'});
  assert.equal(g.children[0],existing);
  assert.deepEqual(existing.position.toArray(),[4,2,1]);
  assert.equal(existing.geometry.attributes.position.count,24);
  const paint=g.children.find(o=>o.material.isMeshPhysicalMaterial&&o.castShadow).material;
  const color=paint.color.getHex(),side=paint.side;
  const second=new THREE.Group();car(second,{...spec,v:'suv',color:'white'});dispose(second);
  assert.equal(paint.color.getHex(),color);
  assert.equal(paint.side,side);
  dispose(g);existing.material.dispose();
});
