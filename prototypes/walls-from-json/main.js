import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import pc from 'polygon-clipping';
// The card's code, unchanged: lamp and strip lighting and the “light stays inside the room” mask.
import {buildDeviceLights,setDeviceLighting} from '../../../3d_floor/apartment/smart-home/web/src/lighting.js';
import {installRoomLightMask} from '../../../3d_floor/apartment/smart-home/web/src/room-light-mask.js';
import manifest from '../../../3d_floor/apartment/smart-home/web/public/devices.json';
import {WALL,OPENINGS,FURNITURE,KENNEY_ROOMS,OWN,STRIPS} from './own/plan.js';
import {MODELS} from './models.gen.js';

const rooms=manifest.rooms;

// ---------- 2D: outlines ----------
const area=p=>p.reduce((s,[x,y],i)=>{const [u,v]=p[(i+1)%p.length];return s+x*v-u*y;},0)/2;
function offset(poly,d){
  const s=area(poly)>0?1:-1,n=poly.length,out=[];
  const nrm=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);return [s*dy/l,-s*dx/l];};
  for(let i=0;i<n;i++){
    const p0=poly[(i-1+n)%n],p1=poly[i],p2=poly[(i+1)%n];
    const n1=nrm(p0,p1),n2=nrm(p1,p2);
    const a=[p0[0]+n1[0]*d,p0[1]+n1[1]*d],da=[p1[0]-p0[0],p1[1]-p0[1]];
    const b=[p1[0]+n2[0]*d,p1[1]+n2[1]*d],db=[p2[0]-p1[0],p2[1]-p1[1]];
    const den=da[0]*db[1]-da[1]*db[0];
    if(Math.abs(den)<1e-9){out.push([p1[0]+n1[0]*d,p1[1]+n1[1]*d]);continue;}
    const t=((b[0]-a[0])*db[1]-(b[1]-a[1])*db[0])/den;
    out.push([a[0]+da[0]*t,a[1]+da[1]*t]);
  }
  return out;
}
const snap=v=>Math.round(v*1000)/1000;
const poly=p=>{const q=p.map(([x,y])=>[snap(x),snap(y)]).filter((v,i,a)=>{const w=a[(i+1)%a.length];return v[0]!==w[0]||v[1]!==w[1];});return [[...q,q[0]]];};
const rect=(a,b,w)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),nx=-dy/l*w,ny=dx/l*w;
  return poly([[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]]);
};

const insetRooms=rooms.map(r=>poly(offset(r.polygon,-WALL.inner)));
const footprint=pc.union(...rooms.map(r=>poly(offset(r.polygon,WALL.outer))));
const walls=pc.difference(footprint,...insetRooms);
// A wall between two rooms is interior; everything else is facade.
const pairs=[];
for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
  const x=pc.intersection(poly(offset(rooms[i].polygon,WALL.pair)),poly(offset(rooms[j].polygon,WALL.pair)));
  if(x.length)pairs.push(x);
}
const interiorZone=pc.union(...pairs);
const interior=pc.intersection(walls,interiorZone);
const exterior=pc.difference(walls,interiorZone);
// The facade is split into four sides so the one facing the camera can be hidden, as in the card.
const xs=rooms.flatMap(r=>r.polygon.map(p=>p[0])),ys=rooms.flatMap(r=>r.polygon.map(p=>p[1]));
const c=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
const far=([x,y])=>[c[0]+(x-c[0])*12,c[1]+(y-c[1])*12];
const SW=far([Math.min(...xs),Math.min(...ys)]),SE=far([Math.max(...xs),Math.min(...ys)]),NE=far([Math.max(...xs),Math.max(...ys)]),NW=far([Math.min(...xs),Math.max(...ys)]);
const SIDES=[
  {id:'S',wedge:poly([c,SW,SE]),out:new THREE.Vector3(0,0,1)},
  {id:'E',wedge:poly([c,SE,NE]),out:new THREE.Vector3(1,0,0)},
  {id:'N',wedge:poly([c,NE,NW]),out:new THREE.Vector3(0,0,-1)},
  {id:'W',wedge:poly([c,NW,SW]),out:new THREE.Vector3(-1,0,0)},
].map(s=>({...s,shape:pc.intersection(exterior,s.wedge)}));

// ---------- 3D: walls in height layers ----------
const toShapes=mp=>mp.map(([outer,...holes])=>{
  const shape=new THREE.Shape(outer.slice(0,-1).map(([x,y])=>new THREE.Vector2(x,y)));
  holes.forEach(h=>shape.holes.push(new THREE.Path(h.slice(0,-1).map(([x,y])=>new THREE.Vector2(x,y)))));
  return shape;
});
function prism(mp,bottom,top){
  if(!mp.length||top-bottom<1e-4)return null;
  const g=new THREE.ExtrudeGeometry(toShapes(mp),{depth:top-bottom,bevelEnabled:false,curveSegments:1});
  g.rotateX(-Math.PI/2);g.translate(0,bottom,0);
  return g;
}
const openingRects=OPENINGS.map(o=>({...o,poly:rect(o.a,o.b,.42)}));
function bands(base,height){
  const hs=[...new Set([0,height,...OPENINGS.flatMap(o=>[o.bottom,o.top]).filter(h=>h>0&&h<height)])].sort((a,b)=>a-b);
  const out=[];
  for(let i=0;i<hs.length-1;i++){
    const [a,b]=[hs[i],hs[i+1]];
    const cut=openingRects.filter(o=>o.bottom<=a+1e-6&&o.top>=b-1e-6).map(o=>o.poly);
    const mp=cut.length?pc.difference(base,...cut):base;
    const g=prism(mp,a,b);if(g)out.push({g,top:i===hs.length-2});
  }
  return out;
}

// ---------- materials ----------
function canvasTexture(size,draw,metres){
  const cv=document.createElement('canvas');cv.width=cv.height=size;draw(cv.getContext('2d'),size);
  const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;
  t.repeat.set(1/metres,1/metres);t.anisotropy=8;return t;
}
const rnd=(()=>{let s=7;return ()=>((s=Math.imul(s^s>>>15,1|s)+0x6D2B79F5|0)>>>0)/4294967296;})();
const wood=(base)=>canvasTexture(1024,(g,S)=>{
  const plank=S/8;
  for(let col=0;col<8;col++){
    let y=-rnd()*S;
    while(y<S){
      const len=S*(.35+rnd()*.45),v=rnd();
      const [r,gg,b]=base.map(c=>Math.round(c*(.86+v*.22)));
      g.fillStyle=`rgb(${r},${gg},${b})`;g.fillRect(col*plank,y,plank,len);
      for(let k=0;k<14;k++){g.strokeStyle=`rgba(70,40,20,${.04+rnd()*.06})`;g.lineWidth=1+rnd()*1.5;const x=col*plank+rnd()*plank;g.beginPath();g.moveTo(x,y);g.bezierCurveTo(x+rnd()*6-3,y+len*.3,x+rnd()*6-3,y+len*.7,x+rnd()*4-2,y+len);g.stroke();}
      g.fillStyle='rgba(40,25,15,.55)';g.fillRect(col*plank,y,plank,2);
      y+=len;
    }
    g.fillStyle='rgba(40,25,15,.45)';g.fillRect(col*plank,0,2,S);
  }
},1.6);
const tiles=(base,n,metres,grout='rgba(255,255,255,.55)')=>canvasTexture(512,(g,S)=>{
  const t=S/n;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){const v=.94+rnd()*.08;g.fillStyle=`rgb(${base.map(c=>Math.round(c*v)).join(',')})`;g.fillRect(i*t,j*t,t,t);}
  g.strokeStyle=grout;g.lineWidth=3;for(let i=0;i<=n;i++){g.beginPath();g.moveTo(i*t,0);g.lineTo(i*t,S);g.stroke();g.beginPath();g.moveTo(0,i*t);g.lineTo(S,i*t);g.stroke();}
},metres);
const FLOORS={
  bedroom:{map:wood([186,140,96]),roughness:.62},
  living:{map:wood([196,158,112]),roughness:.62},
  kitchen:{map:tiles([214,208,198],2,.8),roughness:.45},
  bathroom:{map:tiles([200,210,214],4,.8,'rgba(250,250,250,.7)'),roughness:.35},
  hall:{map:tiles([170,160,150],2,1.2,'rgba(90,80,70,.45)'),roughness:.5},
  panorama:{map:tiles([160,150,140],3,1.2,'rgba(80,70,60,.4)'),roughness:.7},
};
const wallMat=new THREE.MeshStandardMaterial({color:0xece8e1,roughness:.92});
const facadeMat=new THREE.MeshStandardMaterial({color:0xe2ddd5,roughness:.95});
const capMat=new THREE.MeshStandardMaterial({color:0x4a4f57,roughness:.8});
const slabMat=new THREE.MeshStandardMaterial({color:0xb7b1a7,roughness:.9});
const glassMat=new THREE.MeshStandardMaterial({color:0xcfe6f2,roughness:.05,metalness:0,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:1.15});

// ---------- scene: render settings copied from the card ----------
RectAreaLightUniformsLib.init();
const host=document.getElementById('view');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.OrthographicCamera(-9,9,6,-6,.1,100);
const TARGET=new THREE.Vector3(7.5,.8,-3.05),TILT=THREE.MathUtils.degToRad(58),SPIN=THREE.MathUtils.degToRad(32),RANGE=21.6;
camera.position.set(Math.sin(TILT)*Math.sin(SPIN),Math.cos(TILT),Math.sin(TILT)*Math.cos(SPIN)).multiplyScalar(RANGE).add(TARGET);
const controls=new OrbitControls(camera,renderer.domElement);
controls.target.copy(TARGET);controls.enableDamping=true;controls.dampingFactor=.12;
controls.minZoom=.65;controls.maxZoom=5;controls.maxPolarAngle=Math.PI*.46;controls.minPolarAngle=.02;
const ambient=new THREE.HemisphereLight(0xf4f5ff,0x9c8268,.48);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xfff3e0,.30);sun.position.set(3,12,6);sun.target.position.set(7,0,-3);scene.add(sun,sun.target);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-11,right:11,top:10,bottom:-10,near:1,far:40});
sun.shadow.bias=-.0003;sun.shadow.normalBias=.025;
const pmrem=new THREE.PMREMGenerator(renderer);const env=new RoomEnvironment();
scene.environment=pmrem.fromScene(env,.04).texture;scene.environmentIntensity=.12;
const ground=new THREE.Mesh(new THREE.PlaneGeometry(40,28),new THREE.ShadowMaterial({opacity:.26}));
ground.rotation.x=-Math.PI/2;ground.position.set(7.5,-.235,-3);ground.receiveShadow=true;scene.add(ground);

const model=new THREE.Group();scene.add(model);
const add=(g,m,parent=model)=>{const mesh=new THREE.Mesh(g,m);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;};

// Room floors and the slab under the apartment.
for(const r of rooms){
  const f=FLOORS[r.id]||FLOORS.hall;
  const g=new THREE.ShapeGeometry(new THREE.Shape(r.polygon.map(([x,y])=>new THREE.Vector2(x,y))));
  g.rotateX(-Math.PI/2);
  add(g,new THREE.MeshStandardMaterial({map:f.map,roughness:f.roughness})).position.y=.002;
}
add(prism(footprint,-.22,0),[slabMat,slabMat]);

// Walls: tall (hiding the facade facing the camera) and low.
const tall=new THREE.Group(),low=new THREE.Group();model.add(tall,low);low.visible=false;
const facadeSides=[];const sideGroup={};
for(const {g,top} of bands(interior,WALL.height))add(g,[top?capMat:wallMat,wallMat],tall);
for(const s of SIDES){
  const grp=new THREE.Group();tall.add(grp);facadeSides.push({grp,out:s.out});sideGroup[s.id]=grp;
  for(const {g,top} of bands(s.shape,WALL.height))add(g,[top?capMat:facadeMat,facadeMat],grp);
}
const lowCut=openingRects.filter(o=>o.bottom<=0).map(o=>o.poly);
add(prism(pc.difference(interior,...lowCut),0,WALL.low),[capMat,wallMat],low);
add(prism(pc.difference(exterior,...lowCut),0,WALL.low),[capMat,facadeMat],low);

// Window glass.
const inside=([x,y],ring)=>{let r=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)r=!r;}return r;};
for(const o of OPENINGS.filter(o=>o.kind==='window')){
  const [ax,ay]=o.a,[bx,by]=o.b,l=Math.hypot(bx-ax,by-ay);
  const mid=[(ax+bx)/2,(ay+by)/2];
  const side=SIDES.find(s=>inside(mid,s.wedge[0]));
  const m=add(new THREE.PlaneGeometry(l,o.top-o.bottom),glassMat,side?sideGroup[side.id]:tall);m.castShadow=false;
  m.position.set((ax+bx)/2,(o.bottom+o.top)/2,-(ay+by)/2);m.rotation.y=Math.atan2(by-ay,bx-ax);
}

// ---------- furniture from .glb ----------
const FACE={S:0,E:Math.PI/2,N:Math.PI,W:-Math.PI/2};
const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache=new Map();
const load=name=>{if(!cache.has(name))cache.set(name,loader.parseAsync(b64(MODELS[name]),''));return cache.get(name);};
const furniture=new THREE.Group();model.add(furniture);
// Bedroom and kids' room: custom furniture or Kenney, toggled by a button.
const kenneyRooms=new THREE.Group(),ownRooms=new THREE.Group();furniture.add(kenneyRooms,ownRooms);kenneyRooms.visible=false;
async function placeKenney(list,parent){
  for(const [name,[x,y],face,scale=2,lift=0] of list){
    const gltf=await load(name);
    const obj=gltf.scene.clone(true);
    obj.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;
      // Tone the kit's materials to match our lighting: no metalness, no gloss.
      const ms=Array.isArray(o.material)?o.material:[o.material];
      o.material=ms.map(m=>{const k=m.clone();k.metalness=0;k.roughness=Math.max(k.roughness??1,.55);return k;});
      if(o.material.length===1)o.material=o.material[0];});
    obj.scale.setScalar(scale);
    const box=new THREE.Box3().setFromObject(obj),ctr=box.getCenter(new THREE.Vector3());
    const pivot=new THREE.Group();pivot.add(obj);
    obj.position.set(-ctr.x,-box.min.y,-ctr.z);
    pivot.rotation.y=FACE[face];pivot.position.set(x,lift,-y);
    parent.add(pivot);
  }
}
// Custom furniture is already in metres with its origin on the floor at the centre; materials are as in the card, unchanged.
async function placeOwn(list,parent){
  for(const [name,[x,y],deg=0,lift=0,side] of list){
    const obj=(await load('own/'+name)).scene.clone(true);
    if(side)facadeFurniture.push({obj,side});
    obj.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
    obj.rotation.y=THREE.MathUtils.degToRad(deg);obj.position.set(x,lift,-y);
    parent.add(obj);
  }
}
const facadeFurniture=[];
const placeFurniture=()=>Promise.all([placeKenney(FURNITURE,furniture),placeKenney(KENNEY_ROOMS,kenneyRooms),placeOwn(OWN,ownRooms)]);

// ---------- lights: devices from devices.json + our strips ----------
const devices=[];
const fixtureMat=()=>new THREE.MeshStandardMaterial({color:0xf4f1ea,emissive:0x000000,roughness:.4});
for(const d of manifest.lights.filter(l=>l.kind==='ceiling')){
  const mat=fixtureMat();
  const meshes=d.positions.map(p=>{const m=add(new THREE.CylinderGeometry(.14,.14,.03,24),mat);m.castShadow=false;m.position.fromArray(p);m.position.y=2.55;m.visible=false;return m;});
  const room=rooms.find(r=>r.id===d.room);
  const lights=buildDeviceLights(d,meshes,room);
  devices.push({device:{...d,name:'Ceiling'},meshes,lights,room});
}
model.updateMatrixWorld(true);
for(const s of STRIPS){
  const mat=fixtureMat();
  const meshes=s.segments.map(([[ax,ay],[bx,by],h,side])=>{
    const l=Math.hypot(bx-ax,by-ay);
    const m=add(new THREE.BoxGeometry(l,.018,.03),mat,side?sideGroup[side]:tall);m.castShadow=false;
    m.position.set((ax+bx)/2,h,-(ay+by)/2);m.rotation.y=Math.atan2(by-ay,bx-ax);return m;});
  model.updateMatrixWorld(true);
  const room=rooms.find(r=>r.id===s.room);
  devices.push({device:s,meshes,lights:buildDeviceLights(s,meshes,room),room});
}
for(const d of devices)d.lights.forEach(l=>scene.add(l));

// ---------- controls ----------
let night=true;
const state=new Map(devices.map(d=>[d.device.id,true]));
function applyLights(){
  ambient.intensity=night?.48:1.15;sun.intensity=night?.30:2.3;scene.environmentIntensity=night?.12:.3;
  for(const d of devices)setDeviceLighting(d.lights,d.meshes,d.device,{on:state.get(d.device.id)});
  renderer.setClearColor(night?0x10141c:0xe9edf1,1);
  renderer.shadowMap.needsUpdate=true;
}
function ui(){
  const panel=document.getElementById('rooms');panel.innerHTML='';
  for(const r of rooms){
    const own=devices.filter(d=>d.room.id===r.id);if(!own.length)continue;
    const row=document.createElement('div');row.className='room';row.innerHTML=`<b>${r.short}</b>`;
    for(const d of own){
      const b=document.createElement('button');b.textContent=d.device.name;b.className=state.get(d.device.id)?'on':'';
      b.onclick=()=>{state.set(d.device.id,!state.get(d.device.id));applyLights();ui();};row.appendChild(b);
    }
    panel.appendChild(row);
  }
}
document.getElementById('night').onclick=e=>{night=!night;e.target.textContent=night?'Night':'Day';
  if(!night)state.forEach((_,k)=>state.set(k,false));else state.forEach((_,k)=>state.set(k,true));applyLights();ui();};
document.getElementById('walls').onclick=e=>{const lowMode=!low.visible;low.visible=lowMode;tall.visible=!lowMode;e.target.textContent=lowMode?'Walls: low':'Walls: tall';renderer.shadowMap.needsUpdate=true;};
document.getElementById('own').onclick=e=>{const own=!ownRooms.visible;ownRooms.visible=own;kenneyRooms.visible=!own;e.target.textContent=own?'Bedroom and kids\' room: custom furniture':'Bedroom and kids\' room: Kenney';renderer.shadowMap.needsUpdate=true;};
document.getElementById('furn').onclick=e=>{furniture.visible=!furniture.visible;e.target.textContent=furniture.visible?'Furniture: on':'Furniture: off';renderer.shadowMap.needsUpdate=true;};

function resize(){
  const w=host.clientWidth,h=host.clientHeight,aspect=w/h;
  let hw=9.6,hh=hw/aspect;if(hh<5.2){hh=5.2;hw=hh*aspect;}
  Object.assign(camera,{left:-hw,right:hw,top:hh,bottom:-hh});camera.updateProjectionMatrix();renderer.setSize(w,h);
}
new ResizeObserver(resize).observe(host);resize();
const dir=new THREE.Vector3();
function frame(){
  controls.update();
  camera.getWorldDirection(dir);dir.y=0;dir.normalize();
  for(const s of facadeSides)s.grp.visible=s.out.dot(dir)>-.25;
  for(const f of facadeFurniture)f.obj.visible=sideGroup[f.side].visible;
  renderer.render(scene,camera);requestAnimationFrame(frame);
}

placeFurniture().then(()=>{
  installRoomLightMask(model,rooms.map(room=>({room,lights:devices.filter(d=>d.room.id===room.id).flatMap(d=>d.lights)})),scene);
  applyLights();ui();frame();
  window.view={camera,controls};document.body.dataset.ready='true';
});
