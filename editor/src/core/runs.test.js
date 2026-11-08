import {test} from 'node:test';
import assert from 'node:assert/strict';
import pc from 'polygon-clipping';
import {runShape,faceOf,ring,ringProject,runAt,runGeo,runSet,syncRun,runLines} from './runs.js';
import {emptyPlan} from './plan.js';

const areaOf=mp=>mp.reduce((t,P)=>t+P.reduce((s,r,i)=>{let a=0;for(let k=0;k<r.length-1;k++)a+=r[k][0]*r[k+1][1]-r[k+1][0]*r[k][1];return s+(i?-1:1)*Math.abs(a)/2;},0),0);
const near=(a,b,e=.01)=>assert.ok(Math.abs(a-b)<e,`${a} ≈ ${b}`);
// a 4×3 room measured along wall axes; the face is 5 cm inside: 0.05…3.95 × 0.05…2.95
const box={id:'r',polygon:[[0,0],[4,0],[4,3],[0,3]]};
const at=(room,p)=>{const R=ring(faceOf(room));return ringProject(R,p).s;};

test('a wardrobe along one wall: a plain rectangle of depth d',()=>{
  const face=faceOf(box),R=ring(face),sa=ringProject(R,[1,0]).s,g=runShape(face,sa,2,.6);
  assert.equal(g.sides.length,1);near(areaOf(g.outline),2*.6);near(g.len,2);
  const [a,b]=g.sides[0].front;near(a[1],.65);near(b[1],.65);near(Math.abs(b[0]-a[0]),2);
});
test('a wardrobe around a corner: two walls, the fronts meet at the inner corner, the carcass does not overlap',()=>{
  const face=faceOf(box),R=ring(face),sa=ringProject(R,[2.95,0]).s,g=runShape(face,sa,1+1+1,.6); // 1 m to the corner + 2 m along the right wall
  assert.equal(g.sides.length,2);
  const [f0,f1]=g.sides.map(s=>s.front);near(f0[1][0],3.35);near(f0[1][1],.65);near(f1[0][0],3.35);near(f1[0][1],.65);
  near(areaOf(g.outline),1*.6+2*.6-.6*.6); // 1 + 2 m along the walls, the 60×60 corner counted once
  near(areaOf(pc.intersection(g.sides[0].body,g.sides[1].body)),0,1e-6);
});
test('a column at the wall: the front is flat, the column is cut out of the carcass',()=>{
  // a 40×30 cm column protrudes into the room in the middle of the bottom wall
  const room={id:'c',polygon:[[0,0],[1.8,0],[1.8,.3],[2.2,.3],[2.2,0],[4,0],[4,3],[0,3]]};
  const face=faceOf(room),R=ring(face),sa=ringProject(R,[.05,0]).s,full=ring(face).P;
  const s1=ringProject(R,[3.95,0]).s,g=runShape(face,sa,s1-sa,.6);
  assert.equal(g.sides.length,1,'the column is relief of the same wall');
  const [a,b]=g.sides[0].front;near(a[1],.65);near(b[1],.65);
  near(areaOf(g.outline),3.9*.6-.5*.3,.02); // the column, 50×30 cm at the face, is cut out
  assert.ok(full>0);
});
test('a recess in the wall: the wardrobe fills it, the front follows the main face',()=>{
  const room={id:'n',polygon:[[0,0],[1.5,0],[1.5,-.4],[2.5,-.4],[2.5,0],[4,0],[4,3],[0,3]]};
  const face=faceOf(room),R=ring(face),sa=ringProject(R,[.05,0]).s,s1=ringProject(R,[3.95,0]).s,g=runShape(face,sa,s1-sa,.6);
  assert.equal(g.sides.length,1);near(g.sides[0].front[0][1],.65);
  near(areaOf(g.outline),3.9*.6+.9*.4,.02);
});
test('a new wardrobe spans the whole wall corner to corner, and a door shortens it',()=>{
  const p={...emptyPlan(),rooms:[structuredClone(box)]};
  let r=runAt(p,[2,.5],2.4,.6);near(r.L,3.9);
  p.openings=[{id:'d',kind:'door',at:{room:'r',edge:0,s0:3,s1:3.8,d:0}}];
  r=runAt(p,[1.5,.5],2.4,.6);near(r.L,3-.05-.02,.02);
  const f={id:'w',model:'wardrobeRun',d:.6,h:2.5};runSet(p,f,r.room,r.R,r.sa,r.L);
  near(f.w,r.L,.02);assert.ok(runGeo(p,f));
  p.rooms[0].polygon=[[0,0],[5,0],[5,3],[0,3]];syncRun(p,f); // the wall was moved: the wardrobe stays at its own wall
  assert.equal(runGeo(p,f).sides.length,1);
});
test('a wardrobe dropped onto a window goes next to it, on the larger free stretch of the wall',()=>{
  const p={...emptyPlan(),rooms:[structuredClone(box)],openings:[{id:'w',kind:'window',at:{room:'r',edge:0,s0:1,s1:2,d:0}}]};
  const r=runAt(p,[1.5,.5],2.4,.6);near(r.L,1.93,.02);near(ring(faceOf(box)).E[0].a[0]+r.sa,1.97+.05,.02);
});
test('a protruding room corner: the wardrobe wraps around it on the outside, the fronts meet beyond the corner',()=>{
  // an L-shaped room: the bottom right quarter is cut out; the corner (3,1.5) protrudes into the room
  const L={id:'L',polygon:[[0,0],[3,0],[3,1.5],[5,1.5],[5,4],[0,4]]},face=faceOf(L),R=ring(face);
  const sa=ringProject(R,[2,0]).s,g=runShape(face,sa,.95+1.5+1,.5); // along the bottom wall to the corner, up the protrusion (1.5 m) and 1 m past the protruding corner
  assert.equal(g.sides.length,3);
  near(areaOf(pc.intersection(g.sides[0].body,g.sides[1].body)),0,1e-6);
  assert.ok(g.sides.every(s=>s.front),'each wall has its own front');
  // at the protruding corner the fronts meet outside: the front of wall x = 2.95 − 0.5, the front of wall y = 1.55 + 0.5
  near(g.sides[1].front[1][0],2.45);near(g.sides[1].front[1][1],2.05);near(g.sides[2].front[0][0],2.45);near(g.sides[2].front[0][1],2.05);
});
test('kitchen: old straight cabinets become wall runs, base cabinets stop at the fridge, the strip goes around the corner',()=>{
  const p={...emptyPlan(),rooms:[structuredClone(box)]};
  // an old plan: wall cabinets as a rectangle at the bottom wall (back against it)
  const up={id:'u',model:'kitchenWall',w:2,d:.35,h:.7,rot:0,x:2,y:.05+.175+.003};p.furniture.push(up);
  const g=runGeo(p,up);assert.ok(up.a&&up.b,'the ends come from the back side');assert.equal(g.sides.length,1);near(g.len,2,.01);
  // a fridge in the right corner at the bottom wall: base cabinets dropped to its left stop at it
  p.furniture=[{id:'f',model:'fridge',w:.6,d:.65,h:1.85,rot:0,x:3.95-.3,y:.05+.325}];
  const r=runAt(p,[1.5,.4],2.4,.6,{z0:0,z1:.9});near(r.L,3.9-.6,.02);
  // L-shaped wall cabinets: the strip under them is two segments meeting at the inner corner
  const f={id:'w',model:'kitchenWall',d:.35,h:.7};const R=ring(faceOf(box));runSet(p,f,p.rooms[0],R,ringProject(R,[2.95,0]).s,1+1.5);
  const ln=runLines(runGeo(p,f),.35-.06);assert.equal(ln.length,2);near(ln[0][1][0],ln[1][0][0]);near(ln[0][1][1],ln[1][0][1]);
});
