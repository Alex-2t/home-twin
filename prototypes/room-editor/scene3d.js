// 3D view: walls, floor and glass from buildPlan2d. Rebuilt entirely on every edit.
// Render settings and daylight are as in the walls-from-json sketch (D-006).
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {WALL} from './geometry.js';
import {makeObject} from './furniture.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
// Lighting is the card's code, unchanged (as in walls-from-json, D-006).
import {buildDeviceLights,setDeviceLighting} from '../../../3d_floor/apartment/smart-home/web/src/lighting.js';
import {installRoomLightMask} from '../../../3d_floor/apartment/smart-home/web/src/room-light-mask.js';

const wallMat=new THREE.MeshStandardMaterial({color:0xece8e1,roughness:.92});
const facadeMat=new THREE.MeshStandardMaterial({color:0xe2ddd5,roughness:.95});
const capMat=new THREE.MeshStandardMaterial({color:0x4a4f57,roughness:.8});
const slabMat=new THREE.MeshStandardMaterial({color:0xb7b1a7,roughness:.9});
const glassMat=new THREE.MeshStandardMaterial({color:0xcfe6f2,roughness:.05,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});
const FLOOR={bedroom:0xc29a6e,living:0xcaa77c,kitchen:0xd6d0c6,bathroom:0xc8d2d6,hall:0xaaa096,panorama:0xa0968c};
const OUT={S:new THREE.Vector3(0,0,1),E:new THREE.Vector3(1,0,0),N:new THREE.Vector3(0,0,-1),W:new THREE.Vector3(-1,0,0)};

const toShapes=mp=>mp.map(([outer,...holes])=>{
  const shape=new THREE.Shape(outer.slice(0,-1).map(([x,y])=>new THREE.Vector2(x,y)));
  holes.forEach(h=>shape.holes.push(new THREE.Path(h.slice(0,-1).map(([x,y])=>new THREE.Vector2(x,y)))));
  return shape;
});
function prism(mp,bottom,top){
  if(!mp.length||top-bottom<1e-4)return null;
  const g=new THREE.ExtrudeGeometry(toShapes(mp),{depth:top-bottom,bevelEnabled:false,curveSegments:1});
  g.rotateX(-Math.PI/2);g.translate(0,bottom,0);return g;
}

export function createView(host){
  RectAreaLightUniformsLib.init();
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xe9edf1,1);
  host.appendChild(renderer.domElement);
  const scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-9,9,6,-6,.1,100);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.12;controls.maxPolarAngle=Math.PI*.46;controls.minZoom=.4;controls.maxZoom=6;
  const hemi=new THREE.HemisphereLight(0xf4f5ff,0x9c8268,1.15);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff3e0,2.3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  sun.shadow.bias=-.0003;sun.shadow.normalBias=.025;scene.add(sun,sun.target);
  const pmrem=new THREE.PMREMGenerator(renderer);
  scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.3;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.ShadowMaterial({opacity:.22}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.235;ground.receiveShadow=true;scene.add(ground);

  let model=null,sides=[],floors=new Map(),framed=false;
  const dir=new THREE.Vector3();
  function set(plan2d,rooms,openings,selected){
    if(model){scene.remove(model);model.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(o.userData.own)o.material.dispose();}});}
    model=new THREE.Group();sides=[];floors=new Map();
    const add=(g,m,parent)=>{if(!g)return null;const mesh=new THREE.Mesh(g,m);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;};
    for(const r of rooms){
      const g=new THREE.ShapeGeometry(new THREE.Shape(r.polygon.map(([x,y])=>new THREE.Vector2(x,y))));g.rotateX(-Math.PI/2);
      const m=new THREE.MeshStandardMaterial({color:FLOOR[r.id]??0xc7b9a6,roughness:.6,emissive:0x2f6fd0,emissiveIntensity:r.id===selected?.35:0});
      const mesh=add(g,m,model);mesh.position.y=.002;mesh.userData.own=true;floors.set(r.id,mesh);
    }
    add(prism(plan2d.footprint,-.22,0),[slabMat,slabMat],model);
    for(const b of plan2d.interior)add(prism(b.mp,b.bottom,b.top),[b.last?capMat:wallMat,wallMat],model);
    const sideGroup={};
    for(const s of plan2d.sides){const grp=new THREE.Group();model.add(grp);sides.push({grp,out:OUT[s.id]});sideGroup[s.id]=grp;
      for(const b of s.bands)add(prism(b.mp,b.bottom,b.top),[b.last?capMat:facadeMat,facadeMat],grp);}
    for(const o of openings.filter(o=>o.kind==='window')){
      const [ax,ay]=o.a,[bx,by]=o.b,l=Math.hypot(bx-ax,by-ay);
      const m=add(new THREE.PlaneGeometry(l,o.top-o.bottom),glassMat,model);m.castShadow=false;
      m.position.set((ax+bx)/2,(o.bottom+o.top)/2,-(ay+by)/2);m.rotation.y=Math.atan2(by-ay,bx-ax);
      // Glass is hidden together with its facade side.
      const s=plan2d.sides.find(s=>inside([(ax+bx)/2,(ay+by)/2],s.wedge[0]));if(s){model.remove(m);sideGroup[s.id].add(m);}
    }
    scene.add(model);
    const box=new THREE.Box3().setFromObject(model),c=box.getCenter(new THREE.Vector3());
    sun.position.set(c.x-4,12,c.z+9);sun.target.position.copy(c);
    const r=Math.max(box.max.x-box.min.x,box.max.z-box.min.z)*.75+2;
    Object.assign(sun.shadow.camera,{left:-r,right:r,top:r,bottom:-r,near:1,far:50});sun.shadow.camera.updateProjectionMatrix();
    ground.position.x=c.x;ground.position.z=c.z;
    if(!framed){framed=true;frame(box);}
  }
  function frame(box){
    const c=box.getCenter(new THREE.Vector3());c.y=.8;
    const tilt=THREE.MathUtils.degToRad(58),spin=THREE.MathUtils.degToRad(32);
    controls.target.copy(c);camera.position.set(Math.sin(tilt)*Math.sin(spin),Math.cos(tilt),Math.sin(tilt)*Math.cos(spin)).multiplyScalar(24).add(c);
    camera.userData.span=Math.max(box.max.x-box.min.x,box.max.z-box.min.z);resize();
  }
  // Furniture lives separately from the walls: dragging only changes its position; the item is recreated when its size or colour changes.
  const furn=new THREE.Group();scene.add(furn);const objs=new Map();
  function setFurniture(items,selected){
    const keep=new Set();
    for(const it of items){
      const key=[it.model,it.w,it.d,it.h,it.color].join('|');let o=objs.get(it.id);
      if(!o||o.userData.key!==key){if(o){furn.remove(o);o.traverse(m=>m.isMesh&&m.geometry.dispose());}o=makeObject(it);o.userData.key=key;objs.set(it.id,o);furn.add(o);}
      o.position.set(it.x,0,-it.y);o.rotation.y=THREE.MathUtils.degToRad(it.rot);o.userData.tall=it.h>1.2;keep.add(it.id);
    }
    for(const [id,o] of objs)if(!keep.has(id)){furn.remove(o);objs.delete(id);}
  }
  // ---------- lights ----------
  const fixtures=new THREE.Group();scene.add(fixtures);let devs=[];const baseOBR=scene.onBeforeRender;
  const centroid=p=>p.reduce((s,v)=>[s[0]+v[0]/p.length,s[1]+v[1]/p.length],[0,0]);
  function setLights(list,rooms){
    for(const d of devs){d.lights.forEach(l=>{scene.remove(l);l.dispose?.();});d.meshes.forEach(m=>{fixtures.remove(m);m.geometry.dispose();});}
    devs=[];
    for(const L of list){
      const r=rooms.find(r=>r.id===L.room);if(!r)continue;
      const room={id:r.id,polygon:r.polygon,center:centroid(r.polygon)};
      const mat=new THREE.MeshStandardMaterial({color:0xf4f1ea,emissive:0x000000,roughness:.4});
      const meshes=L.kind==='point'
        ?L.points.map(p=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(L.h>2?.13:.06,L.h>2?.13:.06,.03,20),mat);m.position.set(p[0],L.h,-p[1]);return m;})
        :L.segments.map(([a,b])=>{const m=new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(b[0]-a[0],b[1]-a[1]),.018,.03),mat);
          m.position.set((a[0]+b[0])/2,L.h,-(a[1]+b[1])/2);m.rotation.y=Math.atan2(b[1]-a[1],b[0]-a[0]);return m;});
      meshes.forEach(m=>fixtures.add(m));fixtures.updateMatrixWorld(true);
      const device={id:L.id,kind:L.kind==='point'?(L.h>2?'ceiling':'accent'):(L.h>=1.8?'cove':'strip'),color:L.color,
        positions:(L.points||[]).map(p=>[p[0],L.h,-p[1]]),...(L.h<.5?{intensity:90}:{})};
      // A low point (sconce, mirror) only glows itself in the card: its light is computed by a separate source.
      if(device.kind==='accent'&&L.kind==='point'){device.kind='ceiling';}
      const lights=buildDeviceLights(device,meshes,room);lights.forEach(l=>scene.add(l));
      setDeviceLighting(lights,meshes,device,{on:L.on});
      devs.push({L,device,lights,meshes,room});
    }
  }
  // The “light stays inside the room” mask is reinstalled after every edit: first the materials get their original hooks back.
  function applyMask(rooms){
    scene.onBeforeRender=baseOBR;
    scene.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if('obc' in m.userData){m.onBeforeCompile=m.userData.obc;m.customProgramCacheKey=m.userData.cpk;}else{m.userData.obc=m.onBeforeCompile;m.userData.cpk=m.customProgramCacheKey;}}});
    const t=performance.now();
    installRoomLightMask(scene,rooms.map(r=>({room:{id:r.id,polygon:r.polygon},lights:devs.filter(d=>d.room.id===r.id).flatMap(d=>d.lights)})),scene);
    return performance.now()-t;
  }
  function setLightOn(id,on){const d=devs.find(d=>d.L.id===id);if(d)setDeviceLighting(d.lights,d.meshes,d.device,{on});}
  let night=false;
  function setNight(n){night=n;hemi.intensity=n?.48:1.15;sun.intensity=n?.30:2.3;scene.environmentIntensity=n?.12:.3;renderer.setClearColor(n?0x10141c:0xe9edf1,1);}
  function select(id){for(const [k,m] of floors)m.material.emissiveIntensity=k===id?.35:0;}
  function resize(){
    const w=host.clientWidth,h=host.clientHeight,aspect=w/h,hw=(camera.userData.span||16)*.5,hh=hw/aspect;
    Object.assign(camera,{left:-hw,right:hw,top:hh,bottom:-hh});camera.updateProjectionMatrix();renderer.setSize(w,h);
  }
  new ResizeObserver(resize).observe(host);
  (function loop(){controls.update();camera.getWorldDirection(dir);dir.y=0;dir.normalize();
    for(const s of sides)s.grp.visible=s.out.dot(dir)>-.25;
    // Tall furniture with its back to the camera is hidden, like the facade: otherwise a wardrobe by the outer wall blocks the room.
    for(const o of furn.children)if(o.userData.tall){const t=o.rotation.y;o.visible=-(Math.sin(t)*dir.x+Math.cos(t)*dir.z)>-.5;}renderer.render(scene,camera);requestAnimationFrame(loop);})();
  return {renderer,scene,set,setFurniture,setLights,applyMask,setLightOn,setNight,lightCount:()=>devs.reduce((s,d)=>s+d.lights.length,0),select,camera,controls};
}
const inside=([x,y],ring)=>{let r=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)r=!r;}return r;};
