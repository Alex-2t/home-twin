// 3D view: walls, floor and glass from buildPlan2d, furniture and lights. Walls are rebuilt in full when rooms are edited.
// Floor, wall shading, soft light and Neutral tone mapping — D-028 (the render used to match the walls-from-json sketch, D-006).
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {WALL,pointIn} from './geometry.js';
import {formFor,lineForm} from './fixtures.js';
import {makeObject} from './furniture3d.js';
import {createAirflow} from './airflow.js';
import {createRoomGlow} from './room-glow.js';
import {zOf} from './catalog.js';
import {LABEL,itemH} from './sensors.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
// Lighting is a copy of the card code from 3d_floor (card/), D-006.
import {buildDeviceLights,setDeviceLighting} from './card/lighting.js';
import {installRoomLightMask} from './card/room-light-mask.js';
import {floorKind,FLOOR_KINDS,floorTexture,floorUV,bakeAO,bakeFinish,aoUniforms,withAO} from './surfaces.js';
export {floorColor} from './surfaces.js';

// Shading near walls and in corners: one map per scene (surfaces.js); walls and floor read it in the shader.
const AOU=aoUniforms();
// walls are warm white; the inner side of exterior walls has the same color as partitions
const wallMat=withAO(new THREE.MeshStandardMaterial({color:0xf0ece5,roughness:.92}),AOU,true);
const facadeMat=withAO(new THREE.MeshStandardMaterial({color:0xece8e0,roughness:.95}),AOU,true);
const capMat=new THREE.MeshStandardMaterial({color:0x4a4f57,roughness:.8});
const slabMat=new THREE.MeshStandardMaterial({color:0xb7b1a7,roughness:.9});
// Daylight: sky (h), sun (s), reflections (e). The sun is high (SUN.up m above the center, SUN.back m to the side) and follows
// the camera: it shines from over the viewer's left shoulder (SUN.turn), so visible walls are lit at any rotation instead of sinking into gray
// shadow. SOFT is the shadow edge blur.
// Day (2026-11-07, the owner: “the model is so bright that turning on a light is barely noticeable”): overall light is weaker than before
// (sky 1.4 → 0.82, sun 1.6 → 1.15, ambient 0.6 → 0.34), lamps by day at 42% instead of 20%: a lit room is noticeably warmer than
// its neighbors, but not yet flooded with peach.
const DAY={h:.82,s:1.15,e:.34},SUN={up:14,back:6.5,turn:THREE.MathUtils.degToRad(40)},SOFT=3;
const SIDE_AO={S:0,E:1,N:2,W:3},DAY_LAMPS=.42;
const glassMat=new THREE.MeshStandardMaterial({color:0xcfe6f2,roughness:.05,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});
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
  const motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),reducedMotion=()=>!!motion?.matches;
  const DEG0=THREE.MathUtils.degToRad;
  RectAreaLightUniformsLib.init();
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.setClearColor(0xe9edf1,1);
  host.appendChild(renderer.domElement);
  const scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-9,9,6,-6,.1,100);
  const controls=new OrbitControls(camera,renderer.domElement);
  renderer.domElement.style.cursor='grab';
  controls.addEventListener('start',()=>{renderer.domElement.style.cursor='grabbing';});
  controls.addEventListener('end',()=>{renderer.domElement.style.cursor='grab';});
  // Like Blender: middle button orbits, Shift + middle pans; left orbits too (a trackpad has no middle button), Shift + left pans.
  controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.PAN};
  // Trackpad like Blender: two fingers orbit, Shift + two fingers pan, pinch zooms. Mouse wheel zooms.
  renderer.domElement.addEventListener('wheel',e=>{
    const mouse=e.deltaX===0&&e.wheelDeltaY!==undefined&&e.wheelDeltaY!==0&&e.wheelDeltaY%120===0;
    if(e.ctrlKey||mouse)return; // OrbitControls zooms by itself
    e.preventDefault();e.stopImmediatePropagation();setMoved(true);tween=null;
    const off=camera.position.clone().sub(controls.target);
    if(e.shiftKey){const k=1/(camera.zoom*60),right=new THREE.Vector3().setFromMatrixColumn(camera.matrix,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrix,1);
      const d=right.multiplyScalar(e.deltaX*k).add(up.multiplyScalar(-e.deltaY*k));controls.target.add(d);camera.position.add(d);}
    else{const sph=new THREE.Spherical().setFromVector3(off);sph.theta+=e.deltaX*.005;sph.phi=Math.max(controls.minPolarAngle+.01,Math.min(controls.maxPolarAngle,sph.phi+e.deltaY*.005));
      camera.position.copy(controls.target).add(off.setFromSpherical(sph));}
    camera.lookAt(controls.target);
  },{passive:false,capture:true});
  controls.enableDamping=!reducedMotion();motion?.addEventListener('change',()=>{controls.enableDamping=!reducedMotion();});controls.dampingFactor=.12;controls.maxPolarAngle=Math.PI*.46;controls.minZoom=.4;controls.maxZoom=6;
  // Daylight is soft, like inside an apartment, not sun through a removed roof: diffuse from above (sky and floor bounce), sun
  // high and weaker, shadow with a blurred edge. That way there are no big slanted shadows on walls, while shadows under furniture and corner shading remain.
  const hemi=new THREE.HemisphereLight(0xf6f6ff,0xb39f88,DAY.h);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff4e6,DAY.s);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  sun.shadow.bias=-.0003;sun.shadow.normalBias=.025;sun.shadow.radius=SOFT;scene.add(sun,sun.target);
  const pmrem=new THREE.PMREMGenerator(renderer);
  scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=DAY.e;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.ShadowMaterial({opacity:.22}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.235;ground.receiveShadow=true;scene.add(ground);
  // The background is a studio, not a void (D-032): a soft gradient towards the window edges, under the model a light platform with a 1 m grid (like the plan's
  // grid), fading towards the edges. Colors follow the theme, day and night; with a lamp selected they darken together with the overall light. Tone mapping leaves it alone.
  const NOISE='(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.';
  const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({depthTest:false,depthWrite:false,
    uniforms:{cIn:{value:new THREE.Color()},cOut:{value:new THREE.Color()},asp:{value:1}},
    vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=vec4(position.xy,1.,1.);}',
    fragmentShader:`uniform vec3 cIn,cOut;uniform float asp;varying vec2 vU;
      void main(){vec2 p=(vU-vec2(.5,.6))*vec2(asp,1.)/(.5*max(asp,1.));
        gl_FragColor=vec4(mix(cIn,cOut,smoothstep(.1,1.4,length(p))),1.);
        #include <colorspace_fragment>
        gl_FragColor.rgb+=${NOISE};}`}));
  backdrop.frustumCulled=false;backdrop.renderOrder=-1e3;backdrop.raycast=()=>{};scene.add(backdrop);
  const stage=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({transparent:true,depthWrite:false,
    uniforms:{cG:{value:new THREE.Color()},cL:{value:new THREE.Color()},aG:{value:0},aL:{value:0},aC:{value:0},ctr:{value:new THREE.Vector2()},rad:{value:10},
      htAoA:AOU.htAoA,htAoB:AOU.htAoB,htAoBox:AOU.htAoBox},
    vertexShader:'varying vec2 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xz;gl_Position=projectionMatrix*viewMatrix*w;}',
    // shadow around the house comes from the same shading map as the walls (exterior walls, 1 m radius), ignoring hidden facades
    fragmentShader:`uniform vec3 cG,cL;uniform float aG,aL,aC,rad;uniform vec2 ctr;uniform sampler2D htAoA,htAoB;uniform vec4 htAoBox;varying vec2 vW;
      void main(){float k=1.-smoothstep(.4,1.,length(vW-ctr)/rad);k*=k;vec2 fw=fwidth(vW),g=abs(fract(vW+.5)-.5)/fw;
        float l=(1.-min(min(g.x,g.y),1.))*aL*clamp(1.4-max(fw.x,fw.y)*8.,0.,1.),a=(aG+l*(1.-aG))*k;
        vec2 uv=(vec2(vW.x,-vW.y)-htAoBox.xy)*htAoBox.zw;vec4 A=texture2D(htAoA,uv);
        float c=clamp((A.g+A.b+A.a+texture2D(htAoB,uv).r)*2.,0.,1.)*aC;float o=c+a*(1.-c);
        gl_FragColor=vec4((cG*aG*(1.-l)+cL*l)/max(aG+l*(1.-aG),1e-4)*a*(1.-c)/max(o,1e-4),o);
        #include <colorspace_fragment>
        gl_FragColor.rgb+=${NOISE};}`}));
  stage.rotation.x=-Math.PI/2;stage.position.y=-.238;stage.renderOrder=-1;stage.raycast=()=>{};scene.add(stage);

  let model=null,sides=[],floors=new Map(),occluders=[],framed=false,userMoved=false,aoMs=0;
  const sunAt=new THREE.Vector3(),sunDir=new THREE.Vector3();
  // The shading map is recomputed with the walls (~20 ms). Edits come in a stream (dragging a corner or a wall), so the map is coarse (8 cm, 4 times
  // faster) and precise 200 ms after the last edit: the shadow always matches the walls, and the frame does not stutter.
  let aoAt=0,aoTimer=0;
  function bakeShade(plan2d){
    const t0=performance.now(),rush=t0-aoAt<300;aoAt=t0;clearTimeout(aoTimer);
    const ao=bakeAO(plan2d,rush?{px:.08}:{});
    if(ao){AOU.htAoA.value.dispose();AOU.htAoB.value.dispose();AOU.htAoA.value=ao.A;AOU.htAoB.value=ao.B;AOU.htAoBox.value.copy(ao.box);}
    aoMs=performance.now()-t0;
    if(rush)aoTimer=setTimeout(()=>{aoAt=0;if(model)bakeShade(plan2d);},200);
  }
  // the sun is over the viewer's left shoulder; reposition only when the camera has been rotated
  function placeSun(d){if(sunDir.dot(d)>.9999)return;sunDir.copy(d);const c=Math.cos(SUN.turn),s=Math.sin(SUN.turn);
    sun.position.set(sunAt.x+(-d.x*c+d.z*s)*SUN.back,SUN.up,sunAt.z+(-d.z*c-d.x*s)*SUN.back);}
  const aniso=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  // rotated by hand: when the view really moved, not just a press: a click on the 3D window swaps the windows
  let grab=false;controls.addEventListener('start',()=>{grab=true;});controls.addEventListener('end',()=>{grab=false;});
  controls.addEventListener('change',()=>{if(grab)setMoved(true);});
  const dir=new THREE.Vector3();
  // Wall finishes: the side map (which finish each side of a room has), rebuilt with the rooms, ~ms.
  function bakeWalls(rooms){const f=bakeFinish(rooms||[]);const old=[AOU.htFin.value,AOU.htFinTab.value];
    if(f){AOU.htFin.value=f.tex;AOU.htFinTab.value=f.tab;AOU.htFinBox.value.set(...f.box);}else AOU.htFinBox.value.set(0,0,0,0);
    for(const t of old)if(t!==AOU.htFin.value&&t!==AOU.htFinTab.value&&t.image?.width>1)t.dispose();}
  function set(plan2d,rooms,openings,selected){roomsNow=rooms||[];dropRoomFx();
    if(model){scene.remove(model);model.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(o.userData.own)o.material.dispose();}});}
    if(!plan2d){model=null;sides=[];floors=new Map();occluders=[];AOU.htAoBox.value.set(1e6,1e6,1,1);return;} // empty plan means an empty scene, no shadow on the platform
    model=new THREE.Group();sides=[];floors=new Map();occluders=[];plan2dNow=plan2d;
    const add=(g,m,parent)=>{if(!g)return null;const mesh=new THREE.Mesh(g,m);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;};
    for(const r of rooms){if(r.solid)continue;
      const kind=floorKind(r),K=FLOOR_KINDS[kind];
      const g=new THREE.ShapeGeometry(new THREE.Shape(r.polygon.map(([x,y])=>new THREE.Vector2(x,y))));g.rotateX(-Math.PI/2);floorUV(g,r.polygon,K.size);
      const m=withAO(new THREE.MeshStandardMaterial({map:floorTexture(kind,aniso,r.floorTint),roughness:K.rough,emissive:0x2f6fd0,emissiveIntensity:r.id===selected?.35:0}),AOU,false);
      const mesh=add(g,m,model);mesh.position.y=.002;mesh.userData.own=true;floors.set(r.id,mesh);
    }
    add(prism(plan2d.footprint,-.22,0),[slabMat,slabMat],model);
    for(const b of plan2d.interior){const m=add(prism(b.mp,b.bottom,b.top),[b.last?capMat:wallMat,wallMat],model);if(m)occluders.push(m);}
    const sideGroup={};
    for(const s of plan2d.sides){const grp=new THREE.Group();model.add(grp);sides.push({id:s.id,grp,out:OUT[s.id]});sideGroup[s.id]=grp;
      for(const b of s.bands)add(prism(b.mp,b.bottom,b.top),[b.last?capMat:facadeMat,facadeMat],grp);}
    openings.forEach((o,i)=>{if(o.kind!=='window')return;
      const [ax,ay]=o.a,[bx,by]=o.b,l=Math.hypot(bx-ax,by-ay);
      // Glass hides together with its facade side.
      const m=add(new THREE.PlaneGeometry(l,o.top-o.bottom),glassMat,sideGroup[plan2d.openingSide[i]]??model);m.castShadow=false;
      m.position.set((ax+bx)/2,(o.bottom+o.top)/2,-(ay+by)/2);m.rotation.y=Math.atan2(by-ay,bx-ax);
    });
    scene.add(model);
    bakeShade(plan2d);bakeWalls(rooms);for(const o of labels.values())if(o.sp)o.side=sideOfLabel(o.sp);
    const box=new THREE.Box3().setFromObject(model),c=box.getCenter(new THREE.Vector3());
    sunAt.copy(c);sun.target.position.copy(c);sunDir.set(0,0,0);
    const r=Math.max(box.max.x-box.min.x,box.max.z-box.min.z)*.75+2;
    Object.assign(sun.shadow.camera,{left:-r,right:r,top:r,bottom:-r,near:1,far:50});sun.shadow.camera.updateProjectionMatrix();
    ground.position.x=c.x;ground.position.z=c.z;
    const rad=Math.max(box.max.x-box.min.x,box.max.z-box.min.z)*.6+5;stage.position.x=c.x;stage.position.z=c.z;stage.scale.setScalar(rad);
    stage.material.uniforms.ctr.value.set(c.x,c.z);stage.material.uniforms.rad.value=rad;
    // Until the camera has been moved by hand, the view fits the whole plan.
    if(!framed||!userMoved){framed=true;if(saved)applyView(saved);else frame(box);}
  }
  // Furniture lives apart from the walls: dragging only changes the position; an item is rebuilt when its size, color, variant, mirroring or height changes.
  const furn=new THREE.Group();scene.add(furn);const objs=new Map();
  function setFurniture(items,selected){
    const keep=new Set();
    for(const it of items){
      const key=[it.model,it.w,it.d,it.h,it.color,it.v,it.mx,it.z,it.geo?.key,it.open?.toFixed(2)].join('|');let o=objs.get(it.id);
      if(!o||o.userData.key!==key){if(o){furn.remove(o);o.traverse(m=>m.isMesh&&m.geometry.dispose());}o=makeObject(it);o.userData.key=key;objs.set(it.id,o);furn.add(o);}
      // a built-in wardrobe (it.geo) is built directly in plan coordinates; it hides piece by piece, each wall has its own
      if(it.geo){o.position.set(0,0,0);o.rotation.y=0;o.userData.tall=false;}
      else{o.position.set(it.x,0,-it.y);o.rotation.y=THREE.MathUtils.degToRad(it.rot);o.userData.tall=zOf(it)+it.h>1.5;}keep.add(it.id);
    }
    for(const [id,o] of objs)if(!keep.has(id)){furn.remove(o);objs.delete(id);}
  }
  // ---------- lights ----------
  const fixtures=new THREE.Group();scene.add(fixtures);let devs=[];const baseOBR=scene.onBeforeRender;
  const centroid=p=>p.reduce((s,v)=>[s[0]+v[0]/p.length,s[1]+v[1]/p.length],[0,0]);
  // Lamp body by shape (fixtures.js): only the diffuser glows (glass, shade); cord, stand and mounts have no emissive.
  // A lamp that is part of another fixture (L.with) shines from that fixture's position and draws no body: the host owns it.
  const darkMat=new THREE.MeshStandardMaterial({color:0x3b3b3f,roughness:.5,metalness:.35}),bodyMat=new THREE.MeshStandardMaterial({color:0xe9e2d4,roughness:.45});
  const cyl=(rt,rb,h,s=24,open=false)=>new THREE.CylinderGeometry(rt,rb,h,s,1,open);
  const lathe=pts=>new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(r,y)),36);
  const UP=new THREE.Vector3(0,1,0);
  // wall for a sconce: the nearest side of the room, n points from the wall into the room (the sconce sits 8 cm from it)
  function wallDir(poly,p){let best=null;const s=poly.reduce((a,q,i)=>{const b=poly[(i+1)%poly.length];return a+q[0]*b[1]-b[0]*q[1];},0)>0?1:-1;
    for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<1e-6)continue;const u=[(b[0]-a[0])/l,(b[1]-a[1])/l];
      const t=Math.max(0,Math.min(l,(p[0]-a[0])*u[0]+(p[1]-a[1])*u[1])),d=Math.hypot(a[0]+u[0]*t-p[0],a[1]+u[1]*t-p[1]);if(!best||d<best.d)best={d,n:[-u[1]*s,u[0]*s]};}
    return best?.n||[0,1];}
  function fixtureMeshes(L,form,mat,poly){const out=[],at=(g,p,y,m=mat)=>{const o=new THREE.Mesh(g,m);o.position.set(p[0],y,-p[1]);out.push(o);return o;};
    if(lineForm(form))for(const [a,b] of L.segments){const w=form==='line'?.05:.03,o=at(new THREE.BoxGeometry(Math.hypot(b[0]-a[0],b[1]-a[1]),.018,w),[(a[0]+b[0])/2,(a[1]+b[1])/2],L.h);o.rotation.y=Math.atan2(b[1]-a[1],b[0]-a[0]);}
    else for(const p of L.points){
      if(form==='spots'){at(cyl(.045,.045,.012,16),p,L.h);at(cyl(.052,.052,.006,20),p,L.h+.009,darkMat);}
      // pendant: an opal glass dome, a dark cap, a cord to the ceiling and a canopy on the ceiling
      else if(form==='pendant'){at(lathe([[.03,.085],[.065,.075],[.115,.04],[.155,-.02],[.172,-.08],[.168,-.085]]),p,L.h);at(new THREE.SphereGeometry(.035,16,12),p,L.h-.02);
        at(cyl(.034,.04,.03,20),p,L.h+.095,darkMat);const c=WALL.height-L.h-.11;at(cyl(.004,.004,c,6),p,L.h+.11+c/2,darkMat);at(cyl(.05,.055,.02,24),p,WALL.height-.01,darkMat);}
      // sconce: a wall plate, a bracket, a shade flaring upwards
      else if(form==='wall'){const n=poly?wallDir(poly,p):[0,1],w=[p[0]-n[0]*.08,p[1]-n[1]*.08],d3=new THREE.Vector3(n[0],0,-n[1]);
        const pl=at(new THREE.BoxGeometry(.09,.15,.016),[w[0]+n[0]*.008,w[1]+n[1]*.008],L.h,darkMat);pl.rotation.y=Math.atan2(n[0],-n[1]);
        const arm=at(cyl(.008,.008,.07,8),[w[0]+n[0]*.045,w[1]+n[1]*.045],L.h-.045,darkMat);arm.quaternion.setFromUnitVectors(UP,d3);
        at(cyl(.008,.008,.05,8),p,L.h-.05,darkMat);at(cyl(.075,.05,.13,28,true),p,L.h+.02);at(new THREE.SphereGeometry(.028,14,10),p,L.h);}
      // floor and table lamp: an open shade with a bulb inside; a floor lamp has a stand and a disc base, a table lamp a ceramic base
      else if(form==='lamp'){const tall=L.h>1.1;at(cyl(tall?.12:.085,tall?.17:.125,tall?.26:.17,36,true),p,L.h);at(new THREE.SphereGeometry(tall?.04:.03,14,10),p,L.h-.03);
        if(tall){const pole=L.h-.12;at(cyl(.011,.011,pole,10),p,L.h-.12-pole/2,darkMat);at(cyl(.13,.14,.025,32),p,.0125,darkMat);}
        else at(lathe([[0,-.42],[.06,-.42],[.075,-.38],[.08,-.3],[.06,-.2],[.025,-.13],[.02,-.09],[0,-.09]]),p,L.h,bodyMat);}
      // chandelier / ceiling light: a plate with a soft dome
      else at(lathe([[0,-.04],[.11,-.035],[.18,-.018],[.205,.005],[.205,.025],[0,.025]]),p,L.h);}
    return out;}
  // point light brightness by shape: spots and chandeliers light the whole room, sconces and table lamps light around themselves
  const POWER={ceiling:36,spots:42,pendant:30,wall:16,lamp:22};
  // A fixed set of light sources (D-011). The number of sources is part of the shader key: a new source recompiles every material,
  // a 0.5–1.5 s freeze (the owner: “I drag the strip and it lags terribly”: a strip segment kept appearing and disappearing). So sources
  // are never removed: extra ones fade to zero and stay in the scene, new ones are taken from a reserve. The reserve grows with headroom, so the next
  // strip segment or a new lamp no longer recompiles shaders. A lamp keeps its own objects (key “lamp:index”): the room
  // mask bound to the objects stays correct even while dragging.
  const pool={PointLight:[],RectAreaLight:[]},SPARE={PointLight:2,RectAreaLight:3};
  function adopt(list){const all=Object.values(pool).flat(),out=new Array(list.length),need={};all.forEach(l=>{l.userData.used=false;});
    const take=(i,P,pick)=>{const l=P.find(x=>!x.userData.used&&pick(x));if(l){l.userData.used=true;out[i]=l;}return !!l;};
    list.forEach(({fresh,key},i)=>take(i,pool[fresh.type],x=>x.userData.key===key));
    list.forEach(({fresh},i)=>{if(!out[i]&&!take(i,pool[fresh.type],()=>true))need[fresh.type]=(need[fresh.type]||0)+1;});
    for(const [type,n] of Object.entries(need))for(let k=0;k<n+SPARE[type];k++){
      const l=type==='PointLight'?new THREE.PointLight(0xffffff,0):new THREE.RectAreaLight(0xffffff,0,1,.03);pool[type].push(l);scene.add(l);}
    list.forEach(({fresh},i)=>{if(!out[i])take(i,pool[fresh.type],()=>true);});
    list.forEach(({fresh,key},i)=>{const l=out[i];l.color.copy(fresh.color);l.position.copy(fresh.position);l.quaternion.copy(fresh.quaternion);
      if(fresh.isPointLight){l.distance=fresh.distance;l.decay=fresh.decay;}else{l.width=fresh.width;l.height=fresh.height;}
      l.intensity=0;l.userData={...fresh.userData,key,used:true};});
    for(const l of all)if(!l.userData.used){l.intensity=0;l.userData.fullIntensity=0;}
    return out;}
  function setLights(list,rooms){
    const was=new Map(devs.map(d=>[d.L.id,d.solo]));
    for(const d of devs){d.meshes.forEach(m=>{fixtures.remove(m);m.geometry.dispose();if(m.material!==darkMat&&m.material!==bodyMat)m.material.dispose();});}
    devs=[];
    for(const L0 of list){
      const host=L0.with&&list.find(x=>x.id===L0.with),L=host?{...host,id:L0.id,on:L0.on,color:L0.color}:L0;
      const r=rooms.find(r=>r.id===L.room);if(!r)continue;
      const room={id:r.id,polygon:r.polygon,center:centroid(r.polygon)},form=formFor(L);
      const mat=new THREE.MeshStandardMaterial({color:0xf4f1ea,emissive:0x000000,roughness:.4,side:THREE.DoubleSide});
      const meshes=fixtureMeshes(L,form,mat,r.polygon);
      meshes.forEach(m=>{if(host)m.visible=false;fixtures.add(m);});fixtures.updateMatrixWorld(true);
      const glow=meshes.filter(m=>m.material===mat),point=!lineForm(form);
      const lift=form==='pendant'?-.12:0;
      const device={id:L.id,kind:point?'ceiling':(L.h>=1.8?'cove':'strip'),color:L.color,down:form==='line',
        positions:point?L.points.map(p=>[p[0],L.h+lift,-p[1]]):[],...(L.h<.5?{intensity:90}:{})};
      // for a strip, light comes from segments of 30 cm or more (a short step in a corner glows but gets no source of its own: each costs ms per frame)
      const lit=point?glow:(()=>{const g=glow.filter(m=>(m.geometry.parameters?.width??1)>=.3);return g.length?g:glow.slice(0,1);})();
      const lights=buildDeviceLights(device,lit,room);
      if(point)lights.forEach(l=>{l.userData.fullIntensity=POWER[form]*(form==='lamp'&&L.h<1.1?.55:1);});
      devs.push({L:L0,src:L,form,device,lights,meshes,glow,room,on:L.on,blink:null,solo:was.get(L0.id)??soloOf({L:L0,room})});
    }
    // fresh sources are only a calculation: the scene gets objects from the fixed set
    const fresh=devs.flatMap(d=>d.lights.map((l,j)=>({fresh:l,key:d.L.id+':'+j}))),got=adopt(fresh);let k=0;
    for(const d of devs){d.lights=d.lights.map(()=>got[k++]);applyLevel(d);}
    for(const [id,sh] of [...shines])if(devs.some(d=>d.L.id===id))shine(id,sh.t0);else unshine(id,true);
    for(const [id,at] of [...pendingShine]){pendingShine.delete(id);if(performance.now()-at<1500&&devs.some(d=>d.L.id===id))shine(id);}
    inkSens();
  }
  // The “light does not leave the room” mask is set again after every edit: first restore the materials' original hooks.
  function applyMask(rooms){
    scene.onBeforeRender=baseOBR;
    scene.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if('obc' in m.userData){m.onBeforeCompile=m.userData.obc;m.customProgramCacheKey=m.userData.cpk;}else{m.userData.obc=m.onBeforeCompile;m.userData.cpk=m.customProgramCacheKey;}}});
    const t=performance.now();
    installRoomLightMask(scene,rooms.map(r=>({room:{id:r.id,polygon:r.polygon},lights:devs.filter(d=>d.room.id===r.id).flatMap(d=>d.lights)})),scene);
    return performance.now()-t;
  }
  // Lamp brightness = on × “own room” (solo: light only in the room in question, the rest fade out smoothly) ×
  // blink (blink 0…1 while a new or changed lamp blinks). When a lamp is selected (ids: it and the parts of its fixture) only it
  // is lit and the whole scene darkens (amb 1 → 0): you can see exactly how it shines (the owner: “it glows like a beacon, unclear”).
  let soloRoom=null,soloIds=null,soloKey='',soloRaf=0,amb=1;
  const soloOf=d=>soloRoom==null?1:soloIds?(soloIds.includes(d.L.id)?1:0):(d.room.id===soloRoom?1:0);
  // blinks even when off, so you can see where it is; selected in a dark scene it is twice as bright: its light on walls and floor is visible at once
  // shine (shine): when on it is sh.m times brighter and warmer; when off it lights up for the duration of the shine (so you can see where it is)
  function applyLevel(d){const sh=shines.get(d.L.id),lit=d.blink!=null||d.on,k=d.solo*(d.blink??1),level=sh&&!lit?sh.e*Math.max(d.solo,.6):k;
    setDeviceLighting(d.lights,d.glow,d.device,{on:(lit||!!sh)&&level>0,brightness:level*100,colour:sh?.col});
    const b=(soloIds?.includes(d.L.id)?1+.6*(1-amb):1)*(sh&&lit?sh.m:1);
    // by day a lamp is weaker (DAY_LAMPS, 42%): on top of the sun full brightness burns the room into peach; with a lamp selected (the scene
    // darkens, amb → 0) it is back to full strength
    const day=night?1:DAY_LAMPS+(1-DAY_LAMPS)*(1-amb);if(b*day!==1)for(const l of d.lights)l.intensity*=b*day;
    if(b!==1)for(const m of new Set(d.glow.map(g=>g.material)))if(m.emissive)m.emissiveIntensity*=b;}
  function setLightOn(id,on){const d=devs.find(d=>d.L.id===id);if(d){d.on=on;d.blink=null;applyLevel(d);inkSens();}}
  // light only in room roomId (null means everywhere), and with ids only for these lamps and in a dark scene: they fade out and in smoothly, over 0.45 s
  function setSolo(roomId,ids=null){const key=roomId==null?'':roomId+'|'+(ids||[]).join(',');if(key===soloKey)return;soloKey=key;
    soloRoom=roomId??null;soloIds=roomId!=null&&ids?.length?ids:null;if(soloRaf)return;let t=performance.now();
    const step=()=>{const now=performance.now(),dk=reducedMotion()?1:(now-t)/450;t=now;let moving=false;
      for(const d of devs){const g=soloOf(d);if(d.solo===g)continue;d.solo=g>d.solo?Math.min(g,d.solo+dk):Math.max(g,d.solo-dk);applyLevel(d);moving=true;}
      const ga=soloIds?0:1;if(amb!==ga){amb=ga>amb?Math.min(ga,amb+dk):Math.max(ga,amb-dk);applyAmb();for(const d of devs)if(soloIds?.includes(d.L.id))applyLevel(d);moving=true;}
      soloRaf=moving?requestAnimationFrame(step):0;};
    soloRaf=requestAnimationFrame(step);}
  // brightness 0…1 for blinking a new lamp (does not change whether it is on)
  function setLightLevel(id,k){const d=devs.find(d=>d.L.id===id);if(d){d.blink=k;applyLevel(d);}}
  // Lamp shine: when it is selected, placed or changed (the owner: “premium, not half-assed”). It does not fade out but breathes:
  // it smoothly brightens almost threefold and shifts to warm gold, then a soft echo (2.6 s). A halo around the fixture; a thin gold ring
  // spreads from it across the floor (on every breath); along a strip or line a wave of light runs there and back.
  const GOLD=new THREE.Color(0xffc56e),SHINE=2600,shines=new Map(),fx=new THREE.Group();fx.renderOrder=10;scene.add(fx);let shineRaf=0,texs=null;
  function glowTex(ring){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,0,64,64,64);
    if(ring){r.addColorStop(0,'rgba(255,255,255,0)');r.addColorStop(.7,'rgba(255,255,255,0)');r.addColorStop(.86,'rgba(255,255,255,1)');r.addColorStop(1,'rgba(255,255,255,0)');}
    else{r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.18,'rgba(255,255,255,.55)');r.addColorStop(.5,'rgba(255,255,255,.12)');r.addColorStop(1,'rgba(255,255,255,0)');}
    g.fillStyle=r;g.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
  const fxMat=(map,col)=>({map,color:col,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
  const ease=u=>1-(1-u)**3,swell=u=>Math.sin(Math.PI*u)**2;
  // the lamp is not in 3D yet (just placed, the scene is rebuilt next): the shine starts as soon as it is built; rebuilt
  // mid-shine (moved, changed): the highlights move to the new place, time keeps running
  const pendingShine=new Map(); // id → when requested; wait no longer than 1.5 s
  function shine(id,t0=performance.now()){if(reducedMotion())return;const d=devs.find(d=>d.L.id===id);if(!d){pendingShine.set(id,performance.now());return;}texs??={halo:glowTex(false),ring:glowTex(true)};
    unshine(id,true);const L=d.src,col=new THREE.Color(L.color||'#ffce87'),hot=col.clone().lerp(GOLD,.6),parts=[];
    const line=lineForm(d.form);
    if(!line){const big=d.form==='ceiling'?1.1:d.form==='spots'?.5:d.form==='wall'?1:.8;
      for(const [x,y,z] of d.device.positions){
        const halo=new THREE.Sprite(new THREE.SpriteMaterial({...fxMat(texs.halo,hot),depthTest:false}));halo.position.set(x,y,z);fx.add(halo);parts.push({o:halo,kind:'halo',big});
        for(const at of [0,.5]){const ring=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({...fxMat(texs.ring,GOLD),side:THREE.DoubleSide}));
          ring.rotation.x=-Math.PI/2;ring.position.set(x,.02,z);ring.scale.setScalar(.01);fx.add(ring);parts.push({o:ring,kind:'ring',at,big});}}}
    else{const pts=[];let s0=0;for(const [a,b] of L.segments){const len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.round(len/.35));
        for(let i=0;i<=n;i++){const t=i/n;pts.push({p:[a[0]+(b[0]-a[0])*t,L.h,-(a[1]+(b[1]-a[1])*t)],s:s0+len*t});}s0+=len;}
      const step=Math.max(1,Math.ceil(pts.length/48)); // at most 48 highlights per strip
      for(let i=0;i<pts.length;i+=step){const q=pts[i],sp=new THREE.Sprite(new THREE.SpriteMaterial({...fxMat(texs.halo,hot),depthTest:false}));sp.position.set(...q.p);fx.add(sp);parts.push({o:sp,kind:'run',s:q.s,total:s0});}}
    shines.set(id,{t0,parts,col:col.clone(),base:col,hot,m:1,e:0});
    if(!shineRaf)shineRaf=requestAnimationFrame(tickShine);}
  function unshine(id,quiet){const sh=shines.get(id);if(!sh)return;for(const p of sh.parts){fx.remove(p.o);p.o.material.dispose();p.o.geometry?.dispose?.();}shines.delete(id);
    if(quiet)return;const d=devs.find(d=>d.L.id===id);if(d)applyLevel(d);}
  function tickShine(){shineRaf=0;const now=performance.now();
    for(const [id,sh] of shines){const t=(now-sh.t0)/SHINE;if(t>=1||reducedMotion()){unshine(id);continue;}
      // breath and echo: 0 → 1 → 0 over the first half, 0 → 0.45 → 0 over the second
      const e=t<.5?swell(t/.5):.45*swell((t-.5)/.5);sh.e=e;sh.m=1+.6*e;sh.col.copy(sh.base).lerp(sh.hot,Math.min(1,e*.8));
      for(const p of sh.parts){const o=p.o;
        if(p.kind==='halo'){o.material.opacity=.85*e;o.scale.setScalar(p.big*(.7+.6*e));}
        else if(p.kind==='ring'){const u=(t-p.at)/.5;if(u<0||u>1){o.material.opacity=0;continue;}o.scale.setScalar(p.big*(.4+2.6*ease(u)));o.material.opacity=(p.at?.45:.8)*(1-u)**1.5;}
        else{const w=t<.5?t/.5:1-(t-.5)/.5,x=w*p.total,dd=(p.s-x)/Math.max(.6,p.total*.12);o.material.opacity=Math.min(1,.15*e+.95*Math.exp(-dd*dd))*(t<.5?1:.6)*(1-Math.max(0,t-.85)/.15);o.scale.setScalar(.45+.4*Math.exp(-dd*dd));}}
      const d=devs.find(d=>d.L.id===id);if(d)applyLevel(d);}
    if(shines.size)shineRaf=requestAnimationFrame(tickShine);}
  let night=false;
  // Scene background: dark at night and in the dark theme, light otherwise (D-018).
  // Overall light: day or night; with a lamp selected (amb → 0) even darker than night, background is the night one
  const NIGHT={h:.48,s:.30,e:.12},FOCUS={h:.2,s:.08,e:.05};
  // Background: center, edges, platform (color, density), grid lines (color, density). With a lamp selected, towards FOCUS.
  const BG=Object.fromEntries(Object.entries({light:['#f8f9fb','#dce2e9','#ffffff',.8,'#6f7b8c',.14,.45],dark:['#1d222c','#0a0c10','#2b313d',.75,'#9aabc8',.07,.75],
    night:['#142034','#05070c','#1b2438',.7,'#7d93bd',.06,.75],focus:['#10141e','#040509','#161b26',.6,'#7d93bd',.04,.7]})
    .map(([k,[i,o,g,ag,l,al,ac]])=>[k,{i:new THREE.Color(i),o:new THREE.Color(o),g:new THREE.Color(g),ag,l:new THREE.Color(l),al,ac}]));
  let dark=false;
  function bg(){const a=BG[night?'night':dark?'dark':'light'],b=BG.focus,t=1-amb,U=backdrop.material.uniforms,S=stage.material.uniforms;
    U.cIn.value.lerpColors(a.i,b.i,t);U.cOut.value.lerpColors(a.o,b.o,t);renderer.setClearColor(U.cOut.value,1);
    S.cG.value.lerpColors(a.g,b.g,t);S.cL.value.lerpColors(a.l,b.l,t);S.aG.value=a.ag+(b.ag-a.ag)*t;S.aL.value=a.al+(b.al-a.al)*t;S.aC.value=a.ac+(b.ac-a.ac)*t;}
  bg();
  function applyAmb(){const b=night?NIGHT:DAY,x=(f,k)=>FOCUS[k]+(b[k]-FOCUS[k])*amb;hemi.intensity=x(b,'h');sun.intensity=x(b,'s');scene.environmentIntensity=x(b,'e');bg();for(const d of devs)applyLevel(d);inkSens();}
  function setNight(n){night=n;applyAmb();}
  // ---------- readings on walls (D-033) ----------
  // A label is “paint” on the wall, with no backing: a canvas with a transparent background on a plane 6 mm in front of the face. As in 3d_floor,
  // unlit (light from a neighboring room does not shine through), and the paint follows the wall: dark on a light finish, light on a dark one.
  // A room in the dark (night and its lamps are off, or the scene darkened for a selected lamp) gets light paint: otherwise it would vanish with the wall.
  // A label on an exterior wall hides together with it when the facade faces the camera.
  const sensGrp=new THREE.Group();scene.add(sensGrp);const labels=new Map();let plan2dNow=null;
  const LPX=360,LFONT='Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  const INK={dark:{ink:'#2a322d',muted:'rgba(42,50,45,.7)',lvl:['#2a322d','#b5690a','#c0392b']},light:{ink:'#f4f2ec',muted:'rgba(244,242,236,.78)',lvl:['#f4f2ec','#ffbf5a','#ff7b68']}};
  const lumOf=h=>{const c=new THREE.Color(h);return .2126*c.r+.7152*c.g+.0722*c.b;};
  const inMP=(q,mp)=>mp.some(([o,...hs])=>pointIn(q,o)&&!hs.some(h=>pointIn(q,h)));
  function paintLabel(o){const d=o.data,base=(o.sp||d).base||'#f0ece5';o.pb=base;const P=o.dim||lumOf(base)<.25?INK.light:INK.dark,cv=o.cv,g=cv.getContext('2d');
    cv.width=Math.round(d.size.w*LPX);cv.height=Math.round(d.size.h*LPX);g.clearRect(0,0,cv.width,cv.height);g.textAlign='center';
    let x=LABEL.pad;
    d.items.forEach((it,i)=>{const cx=(x+d.size.ws[i]/2)*LPX,k=it.k||1,ls=LABEL.ls*k,vs=LABEL.vs*k,top=(LABEL.pad+d.size.h-2*LABEL.pad-itemH(k))*LPX;x+=d.size.ws[i]+LABEL.gap;
      g.fillStyle=P.muted;g.font=`600 ${Math.round(ls*LPX)}px ${LFONT}`;if('letterSpacing' in g)g.letterSpacing=Math.round(ls*LPX*.08)+'px';
      g.fillText(it.label,cx,top+ls*LPX*.95);if('letterSpacing' in g)g.letterSpacing='0px';
      g.fillStyle=(it.lvl?P.lvl[it.lvl]:it.c)||P.ink;// own color for normal values; alarming ones in yellow and red
      g.font=`600 ${Math.round(vs*LPX)}px ${LFONT}`;g.fillText(it.text,cx,top+(ls*1.3+vs*.9)*LPX);});
    o.tex.needsUpdate=true;}
  // A label stays put (2026-11-07, the owner): on the wall for the home view or where it was placed; it does not move when the 3D view rotates.
  function placeLabel(o,sp){o.sp=sp;o.side=sideOfLabel(sp);const d=o.data;if(sp.base&&sp.base!==o.pb)paintLabel(o);
    o.mesh.scale.set(sp.w,d.size.h*sp.scale,1);o.mesh.position.set(sp.c[0]+sp.n[0]*.006,sp.y??LABEL.y,-(sp.c[1]+sp.n[1]*.006));o.mesh.rotation.set(0,Math.atan2(sp.n[0],-sp.n[1]),0);}
  function sideOfLabel(d){if(!plan2dNow)return null;const q=[d.c[0]-d.n[0]*.12,d.c[1]-d.n[1]*.12];
    const y=d.y??LABEL.y;for(const s of plan2dNow.sides){const b=s.bands.find(b=>b.bottom<=y&&b.top>y);if(b&&inMP(q,b.mp))return s.id;}return null;}
  function roomDark(id){if(!night&&amb>.5)return false;return !devs.some(d=>d.room.id===id&&d.on&&d.solo>.5&&(amb>.5||soloIds?.includes(d.L.id)));}
  function inkSens(){for(const o of labels.values()){const dk=roomDark(o.data.room);if(dk!==o.dim){o.dim=dk;paintLabel(o);}}}
  // list: [{id (sensor), room, c, n (point on the wall face and normal into the room, plan), w (width), scale, size {w,h,ws}, items, base (wall color), own}]
  function setSensors(list){const keep=new Set();
    for(const d of list){let o=labels.get(d.id);const key=JSON.stringify([d.items,d.size]);
      if(!o){const cv=document.createElement('canvas'),tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=aniso;
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
        mesh.raycast=()=>{};sensGrp.add(mesh);o={cv,tex,mesh,dim:null,key:''};labels.set(d.id,o);}
      o.data=d;o.dim=roomDark(d.room);if(o.key!==key){o.key=key;paintLabel(o);}
      placeLabel(o,d);keep.add(d.id);}
    for(const [id,o] of labels)if(!keep.has(id)){sensGrp.remove(o.mesh);o.mesh.geometry.dispose();o.mesh.material.dispose();o.tex.dispose();labels.delete(id);}}
  function setTheme(d){dark=d;bg();ground.material.opacity=d?.4:.22;}
  function select(id){for(const [k,m] of floors)m.material.emissiveIntensity=k===id?.35:0;}
  // Home view (D-035): where the apartment opens and where “Home” leads. Until the user saves their own, the old
  // angle (32° around, 58° tilt), whole model. Their own is {t (look-at target), theta, phi, fit (frame size)}, stored in the plan.
  const HOME0={theta:DEG0(32),phi:DEG0(58)};let home=HOME0,saved=null;
  const r3=v=>+v.toFixed(3);
  function getView(){const s=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    return {t:controls.target.toArray().map(r3),theta:+s.theta.toFixed(4),phi:+s.phi.toFixed(4),fit:(camera.userData.fit||[8,5]).map(v=>r3(v/camera.zoom))};}
  function applyView(v){controls.target.fromArray(v.t);camera.position.setFromSphericalCoords(24,v.phi,v.theta).add(controls.target);camera.lookAt(controls.target);camera.userData.fit=[...v.fit];resize();}
  function setHome(v){saved=v?.t&&v.fit?v:null;home=saved?{theta:saved.theta,phi:saved.phi}:HOME0;}
  // “Home”: smoothly to the saved view; with none, to the old angle with the whole model
  function goHome(){if(!saved){focus(null);return;}
    const s0=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)),f0=(camera.userData.fit||saved.fit).map(v=>v/camera.zoom);
    let dt=saved.theta-s0.theta;dt=Math.atan2(Math.sin(dt),Math.cos(dt));
    tween={t0:performance.now(),dur:FLY(dt),turn:dt,from:{t:controls.target.clone(),theta:s0.theta,phi:s0.phi,r:s0.radius,fit:f0},to:{t:new THREE.Vector3().fromArray(saved.t),theta:s0.theta+dt,phi:saved.phi,r:24,fit:[...saved.fit]}};
    framed=true;setMoved(false);}
  // rotated or zoomed by hand: report it (the 3D window shows “Save view”)
  let onMoved=null;const setMoved=m=>{if(userMoved===m)return;userMoved=m;onMoved?.(m);};
  // Fit the model by its on-screen silhouette: frame corners are converted to camera space, center and scale come from them.
  let lastBox=null;
  function frame(box){
    lastBox=box.clone();
    const c=box.getCenter(new THREE.Vector3());c.y=.8;
    const tilt=home.phi,spin=home.theta;
    controls.target.copy(c);camera.position.set(Math.sin(tilt)*Math.sin(spin),Math.cos(tilt),Math.sin(tilt)*Math.cos(spin)).multiplyScalar(24).add(c);
    camera.lookAt(c);camera.updateMatrixWorld();
    const inv=camera.matrixWorldInverse,pts=[];
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])pts.push(new THREE.Vector3(x,y,z).applyMatrix4(inv));
    const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
    // move the target to the center of the silhouette
    const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
    const shift=right.multiplyScalar((x0+x1)/2).add(up.multiplyScalar((y0+y1)/2));controls.target.add(shift);camera.position.add(shift);
    camera.userData.fit=[(x1-x0)/2,(y1-y0)/2];resize();
  }
  // Show an area (outline in plan meters) centered, with neighbors around it (frame = area ×2.2, i.e. it takes
  // about 45% of the window, but not further out than the whole model). The angle is chosen by counting: 8 sides × 2 tilts, for each, what share
  // of the area's floor is visible rather than hidden by walls (rays from floor points to the camera; a facade hidden at this angle does not block).
  // The best is where more is visible; turning away from the default view and a higher tilt are penalized slightly so the model does not spin needlessly.
  // Without an outline, the whole model, as at the start. Smooth; touching the view aborts the flight.
  let tween=null;const ray=new THREE.Raycaster(),DEG=THREE.MathUtils.degToRad;
  const FLY=turn=>700+Math.abs(turn)*100;
  // Fly to a saved view (getView): “Back” from a room in Preview returns the previous frame.
  function flyTo(v){if(!v)return goHome();const s0=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)),f0=(camera.userData.fit||v.fit).map(x=>x/camera.zoom);
    let dt=v.theta-s0.theta;dt=Math.atan2(Math.sin(dt),Math.cos(dt));
    tween={t0:performance.now(),dur:FLY(dt),turn:dt,from:{t:controls.target.clone(),theta:s0.theta,phi:s0.phi,r:s0.radius,fit:f0},to:{t:new THREE.Vector3().fromArray(v.t),theta:s0.theta+dt,phi:v.phi,r:24,fit:[...v.fit]}};}
  // A room in Preview (as in 3d_floor/viewer.js): the selected one is outlined on the floor; the one hovered from the panel glows
  // (room-glow.js): the light rises from the floor over 1/6 s; a flash on chip click is three waves over 1.5 s.
  let roomsNow=[],outline=null,outlineId=null,glowPulse=null;const glows=new Map();
  const centerOf=P=>{const xs=P.map(q=>q[0]),ys=P.map(q=>q[1]);return [(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];};
  function dropRoomFx(){if(outline){scene.remove(outline);outline.geometry.dispose();outline=null;}for(const g of glows.values()){scene.remove(g.glow.group);g.glow.group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}glows.clear();
    if(outlineId)setOutline(outlineId);}
  function setOutline(id){outlineId=id||null;if(outline){scene.remove(outline);outline.geometry.dispose();outline=null;}
    const r=id&&roomsNow.find(x=>x.id===id);if(!r)return;
    outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(r.polygon.map(([x,y])=>new THREE.Vector3(x,.048,-y))),new THREE.LineBasicMaterial({color:0x5f8b78,transparent:true,opacity:.8}));
    scene.add(outline);}
  function setGlow(ids=[],{pulse=false}={}){const want=new Set(ids);
    for(const id of want)if(!glows.has(id)){const r=roomsNow.find(x=>x.id===id);if(!r||r.solid)continue;const glow=createRoomGlow({id:r.id,polygon:r.polygon,center:centerOf(r.polygon)});scene.add(glow.group);glows.set(id,{glow,amount:0,target:0});}
    for(const [id,g] of glows)g.target=want.has(id)?1:0;glowPulse=pulse&&want.size?performance.now():null;}
  let glowT=performance.now();
  function stepGlow(){const now=performance.now(),dt=Math.min(.1,(now-glowT)/1000);glowT=now;
    const pulse=glowPulse!=null&&now-glowPulse<1500?(now-glowPulse)/1500:null;if(pulse===null)glowPulse=null;
    for(const g of glows.values()){const d=g.target-g.amount;if(Math.abs(d)>.001)g.amount+=Math.sign(d)*Math.min(Math.abs(d),reducedMotion()?1:dt*6);else g.amount=g.target;
      g.glow.set(g.amount,pulse===null?1:1+1.1*Math.abs(Math.sin(pulse*Math.PI*3))*(1-pulse));}}
  function bestView(poly){
    const xs=poly.map(q=>q[0]),ys=poly.map(q=>q[1]),x0=Math.min(...xs)+.15,x1=Math.max(...xs)-.15,y0=Math.min(...ys)+.15,y1=Math.max(...ys)-.15,pts=[];
    for(let i=0;i<6;i++)for(let j=0;j<6;j++){const q=[x0+(x1-x0)*(i+.5)/6,y0+(y1-y0)*(j+.5)/6];if(pointIn(q,poly))pts.push(new THREE.Vector3(q[0],.05,-q[1]));}
    if(!pts.length)return {theta:DEG(32),phi:DEG(58)};
    model.updateMatrixWorld(true);ray.near=.02;ray.far=40;let best=null;
    for(const tilt of [58,40])for(let i=0;i<8;i++){const theta=DEG(32+45*i),phi=DEG(tilt),d=new THREE.Vector3().setFromSphericalCoords(1,phi,theta);
      const view=new THREE.Vector3(-d.x,0,-d.z).normalize(),objs=[...occluders,...sides.filter(x=>x.out.dot(view)>-.25).flatMap(x=>x.grp.children)];
      let vis=0;for(const p of pts){ray.set(p,d);if(!ray.intersectObjects(objs,false).length)vis++;}
      const score=vis/pts.length-.04*Math.min(i,8-i)-(tilt!==58?.05:0);
      if(!best||score>best.score+1e-9)best={theta,phi,score,vis:vis/pts.length};}
    return best;}
  // pad is the margin around the room: 2.2 in the editor (neighbors visible), 1.25 in Preview, tight, as in the 3d_floor card
  function focus(poly,{pad=2.2}={}){
    if(!model)return;const whole=new THREE.Box3().setFromObject(model);let box=whole;
    if(poly?.length){box=new THREE.Box3();for(const [x,y] of poly){box.expandByPoint(new THREE.Vector3(x,0,-y));box.expandByPoint(new THREE.Vector3(x,WALL.height,-y));}}
    const c=box.getCenter(new THREE.Vector3());c.y=poly?.6:.8;
    const view=poly?.length?bestView(poly):{theta:home.theta,phi:home.phi,score:1},{theta,phi}=view;
    const cam=camera.clone(),tgt=c.clone();cam.position.setFromSphericalCoords(24,phi,theta).add(tgt);cam.lookAt(tgt);cam.updateMatrixWorld();
    const sil=b=>{const pts=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])pts.push(new THREE.Vector3(x,y,z).applyMatrix4(cam.matrixWorldInverse));
      const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return [Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];};
    const [x0,x1,y0,y1]=sil(box),[w0,w1,v0,v1]=sil(whole);
    const right=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,1);
    tgt.add(right.multiplyScalar((x0+x1)/2).add(up.multiplyScalar((y0+y1)/2)));
    const k=poly?pad:1,fit=[Math.min((x1-x0)/2*k,(w1-w0)/2),Math.min((y1-y0)/2*k,(v1-v0)/2)];
    const s0=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)),f0=(camera.userData.fit||fit).map(v=>v/camera.zoom);
    let dt=theta-s0.theta;dt=Math.atan2(Math.sin(dt),Math.cos(dt));
    // a big rotation takes longer so you can see where the model turned
    tween={t0:performance.now(),dur:FLY(dt),turn:dt,from:{t:controls.target.clone(),theta:s0.theta,phi:s0.phi,r:s0.radius,fit:f0},to:{t:tgt,theta:s0.theta+dt,phi,r:24,fit}};
    if(poly)setMoved(true); // own view: rebuilding the walls will not reset it
    else{framed=true;setMoved(false);}
    return view;
  }
  // Camera flight, as in the 3d_floor card (room-camera.js): smooth acceleration and deceleration (smootherstep); a long rotation
  // lifts the camera slightly above the apartment; duration 0.7 s + 0.1 s per radian of rotation.
  function stepTween(){if(!tween)return;const q=reducedMotion()?1:Math.min(1,(performance.now()-tween.t0)/tween.dur),e=q*q*q*(q*(q*6-15)+10),{from:a,to:b}=tween,L=(x,y)=>x+(y-x)*e;
    const lift=Math.sin(Math.PI*e)*Math.min(.16,Math.abs(tween.turn||0)*.07);
    controls.target.lerpVectors(a.t,b.t,e);camera.position.setFromSphericalCoords(L(a.r,b.r),Math.max(.02,L(a.phi,b.phi)-lift),L(a.theta,b.theta)).add(controls.target);camera.lookAt(controls.target);
    camera.userData.fit=[L(a.fit[0],b.fit[0]),L(a.fit[1],b.fit[1])];resize();if(q>=1)tween=null;}
  controls.addEventListener('start',()=>{tween=null;});
  // “How to rotate” demo (view-demo.js): rotate the camera around the target by angle a; it does not count as rotated by hand.
  // While a smooth transition to the home view is running, no (false): the demo will not disrupt it.
  function spin(a){if(tween)return false;const o=camera.position.clone().sub(controls.target).applyAxisAngle(UP,a);camera.position.copy(controls.target).add(o);camera.lookAt(controls.target);controls.update();return true;}
  // Devices from HA (D-048). Air conditioner: airflow from under the body, forward and down, color by mode; when turned on it fades
  // in smoothly. list: [{id, f (its item on the plan), on, tone, fan}]
  const airGrp=new THREE.Group();scene.add(airGrp);const airs=new Map();
  function setClimate(list){const keep=new Set();
    for(const c of list){let a=airs.get(c.id);if(!a){a=createAirflow();airs.set(c.id,a);airGrp.add(a.group);}keep.add(c.id);
      const f=c.f,r=f.rot*Math.PI/180,fz=[Math.sin(r),-Math.cos(r)],o=f.d/2+.03;
      a.group.position.set(f.x+fz[0]*o,zOf(f)+.02,-(f.y+fz[1]*o));a.group.rotation.y=Math.atan2(-fz[0],fz[1]);a.set(c);}
    for(const [id,a] of airs)if(!keep.has(id)){airGrp.remove(a.group);a.dispose();airs.delete(id);}}
  // Contact sensor: an open opening glows warm and breathes softly; on an exterior wall it hides together with the facade.
  // list: [{id, a, b, bottom, top, n (normal into the room), open}]
  const doorGrp=new THREE.Group();scene.add(doorGrp);const opens=new Map();
  const openMat=()=>new THREE.MeshBasicMaterial({color:0xff9a2e,transparent:true,opacity:.45,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  const frameMat=new THREE.LineBasicMaterial({color:0xff8a1a,toneMapped:false});
  function setContacts(list){const keep=new Set();
    for(const c of list){if(!c.open)continue;keep.add(c.id);let m=opens.get(c.id);const l=Math.hypot(c.b[0]-c.a[0],c.b[1]-c.a[1]),hgt=c.top-c.bottom,key=[c.a,c.b,c.bottom,c.top].join();
      if(m&&m.userData.key!==key){doorGrp.remove(m);m.geometry.dispose();m.material.dispose();m.children[0]?.geometry.dispose();m=null;}
      if(!m){const g=new THREE.PlaneGeometry(l,hgt);m=new THREE.Mesh(g,openMat());m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g),frameMat));m.userData.key=key;m.raycast=()=>{};doorGrp.add(m);opens.set(c.id,m);}
      m.position.set((c.a[0]+c.b[0])/2,(c.bottom+c.top)/2,-(c.a[1]+c.b[1])/2);m.rotation.set(0,Math.atan2(c.b[1]-c.a[1],c.b[0]-c.a[0]),0);
      m.userData.side=sideOfLabel({c:[(c.a[0]+c.b[0])/2,(c.a[1]+c.b[1])/2],n:c.n,y:c.bottom>.3?c.bottom-.15:c.top+.15});} // side comes from the wall under the window or above the door
    for(const [id,m] of opens)if(!keep.has(id)){doorGrp.remove(m);m.geometry.dispose();m.material.dispose();m.children[0]?.geometry.dispose();opens.delete(id);}}
  let lastT=performance.now();
  function tickDevices(){const now=performance.now(),dt=(now-lastT)/1000;lastT=now;for(const a of airs.values())a.tick(dt);
    const k=reducedMotion()?.45:.38+.14*Math.sin(now/520);
    for(const m of opens.values()){m.material.opacity=k;const sd=m.userData.side;m.visible=!sd||sides.find(s=>s.id===sd)?.grp.visible!==false;}}
  // A panel can float over the 3D view: the model fits into the free part and sits in its center (camera frame offset).
  let insetL=0,insetR=0,insetB=0;
  function resize(){
    const w=host.clientWidth||1,h=host.clientHeight||1,aspect=w/h,[fw,fh]=camera.userData.fit||[8,5],m=1.08,L=Math.min(insetL,w*.5),R=Math.min(insetR,w*.5),free=(w-L-R)/w;
    const B=Math.min(insetB,h*.6),freeV=(h-B)/h;
    const hw=Math.max(fw*m/free,fh*m*aspect/freeV),hh=hw/aspect,off=(L-R)*hw/w,offY=B*hh/h;
    Object.assign(camera,{left:-hw-off,right:hw-off,top:hh-offY,bottom:-hh-offY,zoom:1});camera.updateProjectionMatrix();renderer.setSize(w,h);backdrop.material.uniforms.asp.value=aspect;
  }
  // Panels cover L pixels on the left, R on the right and B at the bottom (the bottom one is Preview's on a narrow screen): the model fits into
  // the middle of the free part.
  const setInsets=(l,r=0,b=0)=>{if(Math.abs(l-insetL)<1&&Math.abs(r-insetR)<1&&Math.abs(b-insetB)<1)return;insetL=l;insetR=r;insetB=b;resize();};
  new ResizeObserver(resize).observe(host);
  (function loop(){stepTween();controls.update();tickDevices();stepGlow();camera.getWorldDirection(dir);dir.y=0;dir.normalize();placeSun(dir);
    for(const s of sides){s.grp.visible=s.out.dot(dir)>-.25;AOU.htAoVis.value.setComponent(SIDE_AO[s.id],s.grp.visible?1:0);}
    for(const o of labels.values())o.mesh.visible=!o.side||sides.find(s=>s.id===o.side)?.grp.visible!==false;
    // Tall furniture with its back to the camera hides like a facade: otherwise a wardrobe by an exterior wall blocks the room.
    const faces=t=>-(Math.sin(t)*dir.x+Math.cos(t)*dir.z)>-.5;
    for(const o of furn.children){if(o.userData.tall)o.visible=faces(o.rotation.y);for(const q of o.userData.parts||[])q.visible=faces(q.userData.ry);}renderer.render(scene,camera);requestAnimationFrame(loop);})();
  return {renderer,scene,setInsets,setTheme,setSensors,homeCam:()=>[+Math.sin(home.theta).toFixed(4),+(-Math.cos(home.theta)).toFixed(4)],home:goHome,getView,setHome,onMoved:f=>{onMoved=f;},moved:()=>userMoved,spin,setClimate,setContacts,flyTo,setOutline,setGlow,reframe:()=>{framed=false;setMoved(false);tween=null;},focus,set,setFurniture,setLights,applyMask,setLightOn,setLightLevel,shine,setSolo,setNight,lightCount:()=>devs.reduce((s,d)=>s+d.lights.length,0),aoMs:()=>aoMs,ao:AOU,lights:{hemi,sun},select,camera,controls};
}
