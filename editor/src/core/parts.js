// An item described by simple parts (furniture model 'parts'): what the AI build could not match to the catalog comes as a few
// blocks, cylinders, spheres, profiles and turned shapes. The item: {w, d, h, materials: {name: {color '#rrggbb', rough 0–1, metal 0–1}},
// parts: [...]}, at most 4 materials and 60 parts after expanding repeat. Item coordinates: origin on the floor at the center of the
// footprint, x along the width, y up, z along the depth, the front faces +z, meters; the item fits in x ±w/2, y 0…h, z ±d/2.
// Parts: box {size: [w,h,d], round}, cyl {r, h, r2 (top radius), seg}, sphere {r, scale: [x,y,z]}, profile {points: [[x,y],…] in the x–y
// plane, depth along z}, lathe {points: [[r,y],…] turned around y}, repeat {count, step: [x,y,z], part}. Every part: mat, at: [x,y,z] —
// the anchor (box, cyl, sphere stand on it; profile and lathe use their own coordinates around it), tilt: [x,y,z] degrees around the anchor.
// checkItem works without WebGL (plan-file.js validates with it); buildItem makes a three.js group, furniture3d.js bakes it.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

export const LIMITS={parts:60,materials:4,tolerance:.02,maxSize:6,repeat:50};
const KINDS=['box','cyl','sphere','profile','lathe','repeat'];
const HEX=/^#[0-9a-f]{6}$/i;
const num=x=>typeof x==='number'&&Number.isFinite(x);
const pos=x=>num(x)&&x>0;
const vec=(x,n=3)=>Array.isArray(x)&&x.length===n&&x.every(num);
const pts=(x,min)=>Array.isArray(x)&&x.length>=min&&x.every(p=>vec(p,2));
const add=(a,b,k=1)=>[a[0]+b[0]*k,a[1]+b[1]*k,a[2]+b[2]*k];

// Repeats become plain parts, each with its own path for error messages ("parts[3].part#2": the 3rd entry, copy 2).
export function expand(parts,path='parts'){const out=[];
  (parts||[]).forEach((p,i)=>{const here=`${path}[${i}]`;if(p?.kind!=='repeat'){out.push({part:p,path:here});return;}
    const n=Number.isInteger(p.count)?Math.min(p.count,LIMITS.repeat):0;
    for(let k=0;k<n;k++)for(const q of expand([p.part],`${here}.part`))
      out.push({part:{...q.part,at:add(vec(q.part?.at)?q.part.at:[0,0,0],vec(p.step)?p.step:[0,0,0],k)},path:`${q.path}#${k+1}`});});
  return out;}

function checkPart(p,path,mats,errors){
  if(!p||typeof p!=='object'){errors.push(`${path}: not an object`);return;}
  if(!KINDS.includes(p.kind)){errors.push(`${path}: unknown kind "${p.kind}" (use ${KINDS.join(', ')})`);return;}
  if(p.kind==='repeat'){
    if(!Number.isInteger(p.count)||p.count<1||p.count>LIMITS.repeat)errors.push(`${path}: count must be an integer 1–${LIMITS.repeat}`);
    if(!vec(p.step))errors.push(`${path}: step must be [x, y, z]`);
    checkPart(p.part,`${path}.part`,mats,errors);return;}
  if(!Object.hasOwn(mats,p.mat))errors.push(`${path}: material "${p.mat}" is not in materials`);
  if(!vec(p.at))errors.push(`${path}: at must be [x, y, z]`);
  if(p.tilt!=null&&!vec(p.tilt))errors.push(`${path}: tilt must be [x, y, z] degrees`);
  if(p.kind==='box'){
    if(!vec(p.size)||!p.size.every(pos))errors.push(`${path}: size must be [w, h, d], all > 0`);
    if(p.round!=null&&!(num(p.round)&&p.round>=0))errors.push(`${path}: round must be ≥ 0`);
  }else if(p.kind==='cyl'){
    if(!pos(p.r)||!pos(p.h))errors.push(`${path}: r and h must be > 0`);
    if(p.r2!=null&&!(num(p.r2)&&p.r2>=0))errors.push(`${path}: r2 must be ≥ 0`);
    if(p.seg!=null&&!(Number.isInteger(p.seg)&&p.seg>=3&&p.seg<=64))errors.push(`${path}: seg must be an integer 3–64`);
  }else if(p.kind==='sphere'){
    if(!pos(p.r))errors.push(`${path}: r must be > 0`);
    if(p.scale!=null&&!(vec(p.scale)&&p.scale.every(pos)))errors.push(`${path}: scale must be [x, y, z], all > 0`);
  }else if(p.kind==='profile'){
    if(!pts(p.points,3))errors.push(`${path}: points must be at least 3 [x, y] pairs`);
    if(!pos(p.depth))errors.push(`${path}: depth must be > 0`);
  }else if(p.kind==='lathe'){
    if(!pts(p.points,2)||p.points.some(([r])=>r<0))errors.push(`${path}: points must be at least 2 [r, y] pairs with r ≥ 0`);
  }
}

// Structural check without three.js: everything needed to build. Returns error strings (empty — buildable).
export function checkItem(item){
  if(!item||typeof item!=='object'||Array.isArray(item))return ['the item must be a JSON object'];
  const errors=[];
  for(const k of ['w','d','h'])if(!pos(item[k])||item[k]>LIMITS.maxSize)errors.push(`${k} must be a number in meters, 0–${LIMITS.maxSize}`);
  const mats=item.materials&&typeof item.materials==='object'&&!Array.isArray(item.materials)?item.materials:{},names=Object.keys(mats);
  if(!names.length)errors.push('materials: at least one material is needed');
  if(names.length>LIMITS.materials)errors.push(`materials: at most ${LIMITS.materials} (got ${names.length})`);
  for(const [n,m] of Object.entries(mats)){
    if(!HEX.test(m?.color||''))errors.push(`materials.${n}: color must be "#rrggbb"`);
    for(const k of ['rough','metal'])if(m?.[k]!=null&&!(num(m[k])&&m[k]>=0&&m[k]<=1))errors.push(`materials.${n}: ${k} must be 0–1`);
  }
  if(!Array.isArray(item.parts)||!item.parts.length){errors.push('parts: at least one part is needed');return errors;}
  item.parts.forEach((p,i)=>checkPart(p,`parts[${i}]`,mats,errors));
  const n=expand(item.parts).length;if(n>LIMITS.parts)errors.push(`parts: at most ${LIMITS.parts} after expanding repeat (got ${n})`);
  return errors;
}

const rad=d=>d*Math.PI/180;
function geometry(p){
  switch(p.kind){
    case 'box':{const [w,h,d]=p.size,r=Math.min(p.round||0,w/2-1e-4,h/2-1e-4,d/2-1e-4);
      const g=r>.001?new RoundedBoxGeometry(w,h,d,2,r):new THREE.BoxGeometry(w,h,d);g.translate(0,h/2,0);return g;}
    case 'cyl':{const g=new THREE.CylinderGeometry(p.r2??p.r,p.r,p.h,p.seg||24);g.translate(0,p.h/2,0);return g;}
    case 'sphere':{const g=new THREE.SphereGeometry(p.r,28,18),s=p.scale||[1,1,1];g.scale(s[0],s[1],s[2]);g.translate(0,p.r*s[1],0);return g;}
    case 'profile':{const shape=new THREE.Shape(p.points.map(([x,y])=>new THREE.Vector2(x,y)));
      const g=new THREE.ExtrudeGeometry(shape,{depth:p.depth,bevelEnabled:false,curveSegments:12});g.translate(0,0,-p.depth/2);return g;}
    case 'lathe':return new THREE.LatheGeometry(p.points.map(([r,y])=>new THREE.Vector2(r,y)),36);
  }
}
// The part's at is its pivot: box, cyl and sphere stand on it (bottom center); profile and lathe use their own coordinates around it.
// tilt rotates the part around at.
function partObject(p,material){
  const mesh=new THREE.Mesh(geometry(p),material);mesh.castShadow=mesh.receiveShadow=true;
  const pivot=new THREE.Group();pivot.position.set(...p.at);
  if(p.tilt)pivot.rotation.set(rad(p.tilt[0]),rad(p.tilt[1]),rad(p.tilt[2]));
  pivot.add(mesh);return pivot;}

// A group at the item's own size (item.w × item.h × item.d). material(m) makes a material from {color, rough, metal}:
// the editor passes its shared cache (furniture3d.js), so equal materials of different items are one.
const ownMaterial=m=>new THREE.MeshStandardMaterial({color:m.color,roughness:m.rough??.6,metalness:m.metal??0});
export function buildItem(item,material=ownMaterial){
  const mats={};for(const [n,m] of Object.entries(item.materials))mats[n]=material(m);
  const group=new THREE.Group();
  for(const {part,path} of expand(item.parts)){const o=partObject(part,mats[part.mat]);o.userData.path=path;group.add(o);}
  return group;}

// Full check: structure, then geometry — every part must stay inside the item's box (w × h × d) within the tolerance.
// Warnings do not stop drawing; errors do.
export function validateItem(item){
  const errors=checkItem(item);if(errors.length)return {errors,warnings:[]};
  const warnings=[],t=LIMITS.tolerance,{w,d,h}=item,group=buildItem(item),all=new THREE.Box3();group.updateMatrixWorld(true);
  for(const o of group.children){const b=new THREE.Box3().setFromObject(o),out=[];all.union(b);
    if(b.min.x<-w/2-t||b.max.x>w/2+t)out.push(`x ${b.min.x.toFixed(3)}…${b.max.x.toFixed(3)} (allowed ±${(w/2).toFixed(3)})`);
    if(b.min.y<-t||b.max.y>h+t)out.push(`y ${b.min.y.toFixed(3)}…${b.max.y.toFixed(3)} (allowed 0…${h.toFixed(3)})`);
    if(b.min.z<-d/2-t||b.max.z>d/2+t)out.push(`z ${b.min.z.toFixed(3)}…${b.max.z.toFixed(3)} (allowed ±${(d/2).toFixed(3)})`);
    if(out.length)warnings.push(`${o.userData.path} sticks out of the item box: ${out.join('; ')}`);}
  const s=all.getSize(new THREE.Vector3());
  for(const [k,got,want] of [['width',s.x,w],['height',s.y,h],['depth',s.z,d]])
    if(got<want*.9)warnings.push(`the parts fill only ${got.toFixed(2)} m of the ${k} ${want.toFixed(2)} m — the item will look smaller than its size`);
  group.traverse(o=>o.isMesh&&o.geometry.dispose());
  return {errors:[],warnings,parts:expand(item.parts).length};}

// A short stable key of the parts for the 3D cache (scene.js rebuilds an item when its key changes): another plan may have an item
// with the same id and size but other parts. Computed once per parts object.
const keys=new WeakMap();
export function partsKey(parts){if(!parts||typeof parts!=='object')return '';let k=keys.get(parts);
  if(k==null){const s=JSON.stringify(parts);let x=2166136261;for(let i=0;i<s.length;i++)x=Math.imul(x^s.charCodeAt(i),16777619);
    k=(x>>>0).toString(36)+s.length.toString(36);keys.set(parts,k);}
  return k;}
