import {test} from 'node:test';
import assert from 'node:assert/strict';
import {separatePlates} from './sensor-plates.js';

const block=(box,n,wall)=>({n,wall,o:[0,0],box(){return box.map((x,i)=>x+this.o[i%2]);}});
const disjoint=bs=>{for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){
  const a=bs[i].box(),b=bs[j].box();
  assert.ok(a[2]<=b[0]-1.99||b[2]<=a[0]-1.99||a[3]<=b[1]-1.99||b[3]<=a[1]-1.99,`plates ${i} and ${j} overlap`);
}};

test('a plate at a corner gives way along its own wall without jumping over neighbours',()=>{
  const bs=[block([20,5,60,25],[0,1],[[0,0],[110,0]]),block([65,5,105,25],[0,1],[[0,0],[110,0]]),
    block([65,15,105,35],[-1,0],[[110,0],[110,150]])];
  separatePlates(bs);disjoint(bs);
  assert.deepEqual(bs[0].o,[0,0]);assert.deepEqual(bs[1].o,[0,0]);
  assert.equal(bs[2].o[0],0);assert.equal(bs[2].o[1],12);
});

test('small zoom: all plates stay apart, even with more than four neighbours in the way',()=>{
  const bs=Array.from({length:7},(_,i)=>block([0,i*22,40,i*22+20],[0,1],[[0,0],[40,0]]));
  bs.push(block([0,0,40,20],[0,1],[[0,0],[40,0]]));
  separatePlates(bs);disjoint(bs);assert.equal(bs.at(-1).o[1],154);
});

test('spreading at a corner works on both sides and on slanted walls',()=>{
  for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.5]){
    const c=Math.cos(angle),s=Math.sin(angle),R=([x,y])=>[x*c-y*s,x*s+y*c];
    const make=(b,n,w)=>{const ps=[[b[0],b[1]],[b[0],b[3]],[b[2],b[1]],[b[2],b[3]]].map(R);
      return block([Math.min(...ps.map(p=>p[0])),Math.min(...ps.map(p=>p[1])),Math.max(...ps.map(p=>p[0])),Math.max(...ps.map(p=>p[1]))],R(n),w.map(R));};
    const bs=[make([20,5,60,25],[0,1],[[0,0],[110,0]]),make([55,15,95,35],[-1,0],[[110,0],[110,200]])];
    separatePlates(bs);disjoint(bs);
  }
});
