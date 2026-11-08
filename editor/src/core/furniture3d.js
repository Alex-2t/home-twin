// Furniture in 3D: size-driven furniture generators and Kenney models. Catalog data lives in catalog.js.
// Item coordinate system: origin on the floor at the center, width along X, depth along Z, facing +Z.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CATALOG,COLORS,byId,zOf,lArms,extOf} from './catalog.js';
import {runShape} from './runs.js';

// ---------- generators ----------
const mats=new Map();
const mat=(color,rough=.62,metal=0)=>{const k=color+':'+rough+':'+metal;if(!mats.has(k))mats.set(k,new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal}));return mats.get(k);};
// metal by color key: chrome and steel are shiny, the rest is painted
const finish=k=>k==='chrome'?mat(COLORS.chrome[1],.14,.9):k==='steel'?mat(COLORS.steel[1],.3,.75):mat(COLORS[k]?.[1]??0xeeebe6,k==='black'?.4:.32);
const shade=(c,k)=>new THREE.Color(c).multiplyScalar(k).getHex();
function part(g,w,h,d,m,x,y,z,r=.006){ // y is the bottom of the part
  const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/2-1e-4,h/2-1e-4,d/2-1e-4)),m);
  mesh.position.set(x,y+h/2,z);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);return mesh;
}
// Common table construction: a tabletop and four legs.
function table(g,{w,d,h,color},thickness=.04){
  const m=mat(COLORS[color][1]);
  part(g,w,thickness,d,m,0,h-thickness,0,.012);
  for(const x of [-1,1])for(const z of [-1,1])
    part(g,.045,h-thickness,.045,m,x*(w/2-.055),0,z*(d/2-.055));
}
// Carcass with separate drawers; proportions are kept when resizing.
function drawers(g,{w,d,h,color},rows=3,base=.08){
  const c=COLORS[color][1],m=mat(c);
  if(base)part(g,w-.08,base,d-.08,mat(shade(c,.6)),0,0,0);
  part(g,w,h-base,d-.02,mat(shade(c,.8)),0,base,-.01);
  const dh=(h-base)/rows;
  for(let i=0;i<rows;i++){
    part(g,w-.008,dh-.006,.02,m,0,base+i*dh+.003,d/2-.01);
    part(g,Math.min(w*.3,.3),.014,.018,mat(0x424448),0,base+(i+.65)*dh,d/2+.009);
  }
}
// Cylinder: along the y axis, the bottom is at y; along z or x, centered at (x,y,z). sx/sz stretch it into an ellipse (r=.5 → diameter = sx/sz).
function cyl(g,r,h,m,x,y,z,{rb=r,seg=24,axis='y',sx=1,sz=1}={}){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,rb,h,seg),m);mesh.scale.set(sx,1,sz);
  if(axis==='z'){mesh.rotation.x=Math.PI/2;mesh.position.set(x,y,z);}else if(axis==='x'){mesh.rotation.z=Math.PI/2;mesh.position.set(x,y,z);}else mesh.position.set(x,y+h/2,z);
  mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);return mesh;
}
function box(g,geo,m,x,y,z){const mesh=new THREE.Mesh(geo,m);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);return mesh;}
// Truncated block: bottom w×d, top tw×td, shifted along z by tz (hood dome, slanted-hood wedge); bottom at y.
function frustum(w,h,d,tw,td,tz){const geo=new THREE.BoxGeometry(w,h,d),a=geo.attributes.position;
  for(let i=0;i<a.count;i++){if(a.getY(i)>0){a.setX(i,a.getX(i)*tw/w);a.setZ(i,a.getZ(i)*td/d+tz);}a.setY(i,a.getY(i)+h/2);}
  geo.computeVertexNormals();return geo;}
const CERAMIC=()=>mat(0xf6f5f0,.22),CHROME=()=>finish('chrome'),METAL=()=>mat(0xb9bcc0,.3),TOP=()=>mat(0x7a7d82,.32);
const GLASS=new THREE.MeshStandardMaterial({color:0xd6e6ec,roughness:.05,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});
const glass=mesh=>{mesh.castShadow=false;return mesh;};
// Kitchen base unit: recessed plinth, carcass, overhanging countertop — shared by all units, so a row reads as one kitchen.
const KB={P:.1,T:.038};
function kitBase(g,{w,d,h,color='white'},{top=true,body=true}={}){const c=COLORS[color][1],{P,T}=KB;
  part(g,w,P,d-.09,mat(0x2c2d30,.7),0,0,-.045,.002);
  if(body)part(g,w,h-T-P,d-.05,mat(shade(c,.82)),0,P,-.025,.003);
  if(top)part(g,w,T,d,TOP(),0,h-T,0,.004);
  return {c,front:mat(c,.5),metal:METAL(),F:d/2-.032,y0:P,y1:h-T};}
// fronts in a row over width len from x0: n doors (~60 cm by default), bar handle at the top or bottom
function row(g,{front,metal,F},x0,len,y,hh,hp='top',n=Math.max(1,Math.round(len/.6))){const gap=.004,dw=(len-gap*(n+1))/n;
  for(let i=0;i<n;i++){const x=x0+gap+dw/2+i*(dw+gap);part(g,dw,hh,.018,front,x,y,F-.009,.003);part(g,Math.min(.3,dw*.5),.012,.018,metal,x,hp==='top'?y+hh-.067:y+.042,F+.009,.005);}}
// Oven: frame, dark glass, handle, a panel with program knobs; height 59.5 cm from y.
function oven(g,w,y,F){const fr=mat(0x2a2c30,.3);part(g,w-.008,.595,.02,fr,0,y,F-.01,.004);part(g,w-.12,.32,.004,mat(0x0b0c0e,.1),0,y+.07,F,.002);
  part(g,w*.72,.018,.024,METAL(),0,y+.43,F+.012,.006);part(g,.1,.03,.004,mat(0x0b0c0e,.1),0,y+.52,F,.002);
  for(const s of [-1,1])cyl(g,.02,.02,METAL(),s*(w/2-.1),y+.535,F+.01,{axis:'z',seg:16});}
// ---------- upholstered furniture ----------
// Sofas and armchair: legs, frame rail, armrests and cushions as separate soft blocks; cushions ~70 cm each, throw pillows in a contrasting color.
// Seat at 45 cm, armrest up to 62 cm, back at the full height h.
const SOFA={leg:.1,base:.2,seat:.15,back:.17};
function softMats(color){const c=COLORS[color]?.[1]??COLORS.grey[1],lum=((c>>16&255)*.3+(c>>8&255)*.59+(c&255)*.11)/255;
  return {fab:mat(c,.95),frame:mat(shade(c,.88),.96),cush:mat(shade(c,1.05),.93),leg:mat(0x2f2620,.45),pil:mat(lum>.5?0x59606b:0xe4dccd,.95),pil2:mat(lum>.5?0xb98d55:0xc7b08b,.95)};}
const sofaLegs=(g,M,pts)=>{for(const [x,z] of pts)cyl(g,.022,SOFA.leg,M.leg,x,0,z,{rb:.015,seg:12});};
const seatTop=SOFA.leg+SOFA.base+SOFA.seat;
function seatRow(g,M,x0,x1,z0,z1,n=Math.max(1,Math.round((x1-x0)/.72))){const sw=(x1-x0)/n;
  for(let i=0;i<n;i++)part(g,sw-.012,SOFA.seat,z1-z0-.008,M.cush,x0+sw*(i+.5),SOFA.leg+SOFA.base,(z0+z1)/2,.055);}
function backRow(g,M,x0,x1,z,h,n=Math.max(1,Math.round((x1-x0)/.72))){const sw=(x1-x0)/n,y=seatTop-.02,bh=h-y-.015;
  for(let i=0;i<n;i++){const q=part(g,sw-.02,bh,.2,M.cush,x0+sw*(i+.5),y,z+.1,.075);q.rotation.x=-.12;}}
function pillow(g,m,x,z,ry){const q=part(g,.42,.4,.13,m,x,seatTop-.04,z,.065);q.rotation.set(-.32,ry,0);}
function sofaBody(g,{w,d,h,color},{pillows=true,A=Math.min(.2,Math.max(.12,w*.09))}={}){
  const M=softMats(color),{leg,base,back}=SOFA,AH=Math.min(.64,h-.08),k=.07;
  sofaLegs(g,M,[[-w/2+k,-d/2+k],[w/2-k,-d/2+k],[-w/2+k,d/2-k],[w/2-k,d/2-k],...(w>2.2?[[0,-d/2+k],[0,d/2-k]]:[])]);
  part(g,w,base,d,M.frame,0,leg,0,.03);
  for(const s of [-1,1])part(g,A,AH-leg,d,M.fab,s*(w/2-A/2),leg,0,.075);
  part(g,w-2*A,h-leg-.04,back,M.frame,0,leg,-d/2+back/2,.06);
  seatRow(g,M,-w/2+A,w/2-A,-d/2+back,d/2);backRow(g,M,-w/2+A,w/2-A,-d/2+back,h);
  if(pillows&&w>=1.4){pillow(g,M.pil,-(w/2-A-.27),-d/2+back+.27,.2);pillow(g,M.pil2,w/2-A-.27,-d/2+back+.27,-.2);}
  return M;}
// Pipe serpentine: rows from top to bottom, semicircular turns at the edges (“Serpentine” towel warmer).
function serpentine(x0,x1,y0,y1,n,z){const path=new THREE.CurvePath(),V=(x,y)=>new THREE.Vector3(x,y,z),s=(y0-y1)/(n-1),k=s/2*4/3;
  for(let i=0;i<n;i++){const y=y0-i*s,a=i%2?x1:x0,b=i%2?x0:x1;path.add(new THREE.LineCurve3(V(a,y),V(b,y)));
    if(i<n-1){const e=i%2?-k:k;path.add(new THREE.CubicBezierCurve3(V(b,y),V(b+e,y),V(b+e,y-s),V(b,y-s)));}}
  return path;}
// Pleated fabric: a panel of width pw and height hh, a wave across the width (folds — how many folds, amp — their depth).
function drape(g,m,x0,x1,y0,hh,z,folds,amp,shadow=true){const pw=x1-x0,geo=new THREE.PlaneGeometry(pw,hh,Math.max(16,folds*10),1),a=geo.attributes.position;
  for(let i=0;i<a.count;i++){const t=a.getX(i)/pw+.5;a.setZ(i,(Math.sin(t*folds*Math.PI*2)+.35*Math.sin(t*folds*1.7*Math.PI*2+1.3))*amp);}geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,m);mesh.position.set((x0+x1)/2,y0+hh/2,z);mesh.castShadow=shadow;mesh.receiveShadow=true;g.add(mesh);return mesh;}
const glow=c=>new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:1.1,roughness:.4});
// Rod from point a to point b ([x,y,z]): splayed legs, crossbars.
function rod(g,a,b,r,m,seg=12){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),L=A.distanceTo(B),mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,L,seg),m);
  mesh.position.copy(A).add(B).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),B.sub(A).normalize());mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);return mesh;}
// Kids' room: pastel bedding and drawer colors
const PASTEL=[0xf2c9a0,0xa9d1c2,0xf3e1a2,0xb9c8e6,0xe7b5c2];
// Sleeping place: mattress, sheet and blanket in pastels, a pillow at the left edge (in item axes, the long side along x).
function bedding(g,x0,x1,z0,z1,y,tint=0){const L=x1-x0,D=z1-z0,c=PASTEL[tint%PASTEL.length];
  part(g,L,.13,D,mat(0xf3f1ec,.85),(x0+x1)/2,y,(z0+z1)/2,.035);part(g,L*.68,.04,D+.01,mat(c,.9),x1-L*.34,y+.12,(z0+z1)/2,.02);
  part(g,Math.min(.45,L*.22),.1,D*.7,mat(0xfaf8f4,.85),x0+Math.min(.45,L*.22)/2+.05,y+.12,(z0+z1)/2,.045);}
// Washing machine (front- or top-loading) and dryer: body, a panel with a drawer and a display, a door or a lid on top.
function appliance(g,{w,d,h,color='white'},kind){const wh=color==='white'?mat(0xf4f4f2,.34):finish(color),dark=mat(0x23262a,.3),ch=CHROME(),blk=color==='black';
  for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]])cyl(g,.022,.02,dark,sx*(w/2-.05),0,sz*(d/2-.05),{seg:12});
  part(g,w,h-.02,d,wh,0,.02,0,.025);
  if(kind==='top'){const lid=mat(blk?0x34363a:0xe9e9e6,.35);part(g,w-.04,.012,d*.62,lid,0,h,d*.12,.01);part(g,w*.5,.01,.02,dark,0,h+.012,d/2-.05,.004);
    part(g,w-.04,.05,d*.22,lid,0,h,-d/2+d*.12,.01);part(g,w*.36,.03,.004,dark,0,h+.02,-d/2+d*.23+.001,.002);cyl(g,.025,.02,ch,w/2-.08,h+.05,-d/2+d*.12,{seg:20});return;}
  const py=h-.145;part(g,w-.04,.003,.002,mat(0xcfd0cd,.5),0,py,d/2+.001,.001);
  part(g,w*.3,.085,.012,blk?mat(0x3a3c40,.4):mat(0xe9e9e6,.4),-w/2+.03+w*.15,py+.035,d/2+.005,.006);part(g,w*.2,.045,.004,dark,w*.06,py+.055,d/2+.002,.003);
  cyl(g,.032,.025,ch,w/2-.1,py+.075,d/2+.012,{axis:'z'});
  const dy=Math.min(.43,(py-.04)/2+.04),r=Math.min(.19,w*.32);
  const t=new THREE.Mesh(new THREE.TorusGeometry(r,.03,12,48),kind==='dryer'?wh:ch);t.position.set(0,dy,d/2+.012);g.add(t);
  cyl(g,r-.012,.016,kind==='dryer'?mat(0x8e9aa3,.06,.2):mat(0x2d3a44,.08),0,dy,d/2+.006,{axis:'z',seg:40});
  if(kind==='dryer')part(g,w*.22,.012,.004,dark,0,.06,d/2+.002,.003); // grille at the bottom — air outlet
}
// Clothes on hangers along a rail from x0 to x1 (rail at height ry, garment depth dz): varying lengths and colors.
function clothes(g,x0,x1,ry,dz){const CL=[0x3e4b60,0xd9d1c3,0x8d9095,0xa8644b,0x737c5c,0xf3f1ec,0x27282b],ch=CHROME();let x=x0,k=0;
  while(x<x1){const L=.55+((k*37)%5)*.12,cw=.035+((k*13)%3)*.012;part(g,cw,L,dz,mat(CL[k%CL.length],.9),x,ry-.04-L,0,.012);part(g,.006,.04,Math.min(.3,dz*.75),ch,x,ry-.04,0,.002);x+=cw+.025;k++;}}
// Countertop with a basin: a w×d cutout around a bw×bd basin (center bx,bz), basin depth dep (sink, vanity unit).
function bowlTop(g,{w,d,y,T,bw,bd,bx=0,bz=0,dep,top,bowl}){const L=bx-bw/2+w/2,R=w/2-bx-bw/2,B=bz-bd/2+d/2,F=d/2-bz-bd/2;
  part(g,L,T,d,top,-w/2+L/2,y,0,.006);part(g,R,T,d,top,w/2-R/2,y,0,.006);part(g,bw,T,B,top,bx,y,-d/2+B/2,.003);part(g,bw,T,F,top,bx,y,d/2-F/2,.003);
  part(g,bw,.01,bd,bowl,bx,y+T-dep,bz,.004);for(const s of [-1,1]){part(g,.01,dep,bd,bowl,bx+s*(bw/2-.005),y+T-dep,bz,.003);part(g,bw,dep,.01,bowl,bx,y+T-dep,bz+s*(bd/2-.005),.003);}}
// Faucet on the ledge behind the basin: base, body, forward spout, lever.
function faucet(g,x,y,z,reach=.11,m=CHROME()){cyl(g,.02,.025,m,x,y,z);cyl(g,.014,.14,m,x,y+.025,z);cyl(g,.012,reach,m,x,y+.15,z+reach/2,{axis:'z'});cyl(g,.01,.03,m,x,y+.125,z+reach-.005);part(g,.012,.012,.07,m,x,y+.165,z-.035,.004);}
const sideM=c=>c==='chrome'?CHROME():c==='black'?mat(0x27282b,.4,.3):c==='white'?mat(0xf2f2f0,.4):mat(COLORS[c]?.[1]??0x888888,.5);
const BINC=[0x6c8f5a,0x4f6d9a,0xc9a24a];
// Wide refrigerator: side-by-side (narrower freezer on the left, two full-height doors, dispenser) or French door (two doors on top, a drawer below).
function wideFridge(g,{w,d,h,color='white',v}){const c=COLORS[color][1],mt=color==='steel'?.6:0,side=mat(shade(c,.92),.46,mt),fr=mat(c,.3,mt),seal=mat(0x373b40,.8),hm=mat(0xc9cdd1,.2,.8),D=.05,z=d/2-D/2;
  part(g,w-.07,.035,d-.08,seal,0,0,0,.008);part(g,w,h-.035,d-D,side,0,.035,-D/2,.02);part(g,w-.012,h-.05,.006,seal,0,.04,d/2-D,.002);
  const bar=(x,y0,y1)=>{cyl(g,.012,y1-y0,hm,x,y0,d/2+.03,{seg:12});for(const y of [y0+.01,y1-.01])cyl(g,.008,.03,hm,x,y,d/2+.012,{axis:'z',seg:8});};
  if(v==='sbs'){const xl=-w/2+w*.42;part(g,w*.42-.008,h-.05,D-.004,fr,(-w/2+xl)/2,.04,z,.014);part(g,w*.58-.008,h-.05,D-.004,fr,(xl+w/2)/2,.04,z,.014);
    bar(xl-.04,h*.3,h*.85);bar(xl+.04,h*.3,h*.85);part(g,.16,.26,.012,mat(0x1d1f22,.3),(-w/2+xl)/2,h*.5,d/2+.002,.012);}
  else{const yb=h*.36;part(g,w-.008,yb-.05,D-.004,fr,0,.04,z,.014);part(g,w/2-.008,h-yb-.012,D-.004,fr,-w/4,yb+.004,z,.014);part(g,w/2-.008,h-yb-.012,D-.004,fr,w/4,yb+.004,z,.014);
    bar(-.04,yb+.25,h-.15);bar(.04,yb+.25,h-.15);part(g,w*.6,.02,.025,hm,0,yb-.08,d/2+.015,.008);}
}
const ART=[0xd9a441,0x3e4b60,0xa8644b,0x98a38f,0xe9e2d4,0x27282b,0x6f8fa8];
const transp=(color,opacity,rough=.1)=>new THREE.MeshStandardMaterial({color,roughness:rough,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide});
// Ellipsoid leaf from point base in direction dir with length L (aquarium and potted plants).
function leaf(g,m,base,dir,L,wd=.03){const v=new THREE.Vector3(...dir).normalize(),q=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),m);q.scale.set(wd,L/2,wd*.25);
  q.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v);q.position.set(base[0]+v.x*L/2,base[1]+v.y*L/2,base[2]+v.z*L/2);g.add(q);return q;}
// Double-bowl sink: lower carcass, two bowls side by side, faucet in the middle at the back.
function sinkTwo(g,p){const {w,d,h}=p,{P,T}=KB,k=kitBase(g,p,{top:false,body:false}),body=mat(shade(k.c,.82)),steel=mat(0xb4b8bc,.26),dep=.18,bd=Math.min(d-.2,.42),bz=.02;
  part(g,w,h-T-P-dep-.02,d-.05,body,0,P,-.025,.003);for(const s2 of [-1,1])part(g,.018,h-T-P,d-.05,body,s2*(w/2-.009),P,-.025,.002);part(g,w,h-T-P,.018,body,0,P,-d/2+.009,.002);
  for(const x of [-w/4,w/4]){const q=new THREE.Group();q.position.x=x;g.add(q);bowlTop(q,{w:w/2,d,y:h-T,T,bw:Math.min(w/2-.06,.4),bd,bz,dep,top:TOP(),bowl:steel});cyl(q,.02,.003,mat(0x2a2c30,.4),0,h-dep+.008,bz,{seg:16});}
  faucet(g,0,h,-d/2+.055,.16);row(g,k,-w/2,w,P+.003,h-T-P-.006,'top',2);}
// ---------- plants and vases ----------
// Leaves are flat outlined shapes with a bend (tip and edges drooping), double-sided; the pot and vase are solids of revolution with a
// wall and a rim. Randomness is seeded by the dimensions: rebuild the item and the plant stays the same.
const V3=(x,y,z)=>new THREE.Vector3(x,y,z),UP=V3(0,1,0);
const twoSided=new Map();
const leafMat=(color,rough=.62)=>{const k=color+':'+rough;if(!twoSided.has(k))twoSided.set(k,new THREE.MeshStandardMaterial({color,roughness:rough,side:THREE.DoubleSide}));return twoSided.get(k);};
const seeded=seed=>{let a=seed>>>0;return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};};
// Pot (or vase) from a profile [[r,y],…] going up on the outside and down on the inside; returns the soil level.
function vessel(g,pts,m){const mesh=new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x,y])=>new THREE.Vector2(x,y)),40),m);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);return mesh;}
// style: round — tapers toward the bottom, with a rim; cyl — straight and tall; bowl — wide low bowl
function pot(g,R,H,m,style='round'){const t=Math.min(.016,R*.1),rb=style==='cyl'?R*.95:style==='bowl'?R*.6:R*.76,soil=style==='bowl'?H*.84:H-.04;
  vessel(g,style==='bowl'?[[0,0],[rb,0],[rb*1.03,.012],[R*.9,H*.5],[R,H*.86],[R,H],[R-t,H],[R-t,H*.88],[0,soil]]
    :[[0,0],[rb,0],[rb+.004,.01],[R*.985,H-.035],[R*1.04,H-.03],[R*1.04,H],[R*1.04-t,H],[R-t,H-.035],[0,soil]],m);
  cyl(g,(R-t)*.985,.008,mat(0x3a2c21,.95),0,soil-.004,0,{seg:32});return soil;}
function stalk(g,pts,r,m,seg=12){const c=pts.length===3?new THREE.QuadraticBezierCurve3(...pts):new THREE.CatmullRomCurve3(pts);
  const mesh=new THREE.Mesh(new THREE.TubeGeometry(c,seg,r,5,false),m);mesh.castShadow=true;g.add(mesh);return c;}
// Leaf by outline (x — across, y — from stalk to tip): bend droops the tip, cup — the edges, twist twists along the axis.
function leafGeo(pts,{bend=0,cup=0,twist=0}={}){const geo=new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x,y])=>new THREE.Vector2(x,y))),3),a=geo.attributes.position;
  let L=1e-6,W=1e-6;for(const [x,y] of pts){L=Math.max(L,y);W=Math.max(W,Math.abs(x));}
  for(let i=0;i<a.count;i++){let x=a.getX(i),y=a.getY(i),v=Math.max(0,y)/L,z=-bend*L*v*v-cup*W*(x/W)**2;
    if(twist){const c=Math.cos(twist*v),sn=Math.sin(twist*v),nx=x*c-z*sn;z=x*sn+z*c;x=nx;}a.setX(i,x);a.setZ(i,z);}
  geo.computeVertexNormals();return geo;}
const mirror=half=>[...half,...half.slice(1,-1).reverse().map(([x,y])=>[-x,y])]; // right half from stalk to tip → the full outline
// Leaf at point base along axis dir; its face points up where possible (so the leaf does not stand edge-on)
function putLeaf(g,geo,m,base,dir){const Y=V3(...dir).normalize(),X=new THREE.Vector3().crossVectors(Y,UP);if(X.lengthSq()<1e-6)X.set(1,0,0);X.normalize();
  const Z=new THREE.Vector3().crossVectors(X,Y).normalize(),mesh=new THREE.Mesh(geo,m);mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X,Y,Z));
  mesh.position.set(...base);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);return mesh;}
// Monstera: a heart with slits from the edge toward the middle (more on larger leaves), lobes at the stalk
function monsteraLeaf(L,W,k){const half=[[0,0],[W*.17,-L*.1],[W*.37,-L*.06]],N=16,step=Math.max(2,Math.floor(N/(k+1)));
  for(let i=1;i<=N;i++){const y=L*(i/N)*.97-L*.02,hw=W/2*Math.pow(Math.max(0,Math.sin(Math.PI*Math.min(1,(y+L*.1)/(L*1.1)))),.7);half.push([hw,y]);
    if(k&&i%step===0&&i<N-2)half.push([hw*.3,y+L*.026],[hw*.97,y+L*.05]);}
  half.push([0,L]);return mirror(half);}
const PLANT={
  monstera(g,{D,h,pm,rnd}){const R=Math.min(.24,D*.27),y0=pot(g,R,Math.min(.38,h*.36),pm),top=h-y0,G=[0x2c5730,0x346236,0x29502e],pet=leafMat(0x5b7d3f,.7);
    const n=Math.max(5,Math.round(4+D*7));
    for(let i=0;i<n;i++){const t=i/(n-1),a=i*2.39996+rnd()*.5,L=Math.min(.44,top*.44,D*.42)*(.78+.3*rnd()),tilt=(55-45*t+rnd()*8)*Math.PI/180,c=Math.cos(tilt),sn=Math.sin(tilt);
      const yP=y0+Math.max(.06,top-L*sn*.9)*(1-.5*t),rP=Math.max(.03,D/2-L*c*.95)*(.3+.7*t),P=[Math.cos(a)*rP,yP,Math.sin(a)*rP];
      stalk(g,[V3(Math.cos(a)*.02,y0,Math.sin(a)*.02),V3(Math.cos(a)*rP*.25,yP*.92+y0*.08,Math.sin(a)*rP*.25),V3(...P)],.006,pet);
      putLeaf(g,leafGeo(monsteraLeaf(L,L*.9,L>.3?4:L>.2?3:2),{bend:.22,cup:.22}),leafMat(G[i%3],.6),P,[c*Math.cos(a),sn,c*Math.sin(a)]);}},
  // fiddle-leaf fig: a curved trunk with a branch, large “fiddle” leaves (wider toward the tip, with a waist) spiraling in the upper part
  ficus(g,{D,h,pm,rnd}){const R=Math.min(.2,D*.3),y0=pot(g,R,Math.min(.42,h*.25),pm,'cyl'),bark=mat(0x6d5745,.85),G=[0x2a5226,0x33602c,0x3c6a33],top=h-.04;
    const trunk=stalk(g,[V3(0,y0,0),V3(.025,y0+(top-y0)*.35,.012),V3(-.018,y0+(top-y0)*.7,-.012),V3(.008,top-.1,0)],.015,bark,20);
    const bp=trunk.getPoint(.55),branch=stalk(g,[bp,V3(bp.x+D*.12,bp.y+(top-bp.y)*.45,bp.z+D*.05),V3(bp.x+D*.2,top-(top-y0)*.18,bp.z+D*.08)],.01,bark,12);
    const fig=(L,W)=>{const half=[[0,0]];for(let k=1;k<=12;k++){const v=k/12,hw=W/2*Math.sin(Math.PI*Math.pow(v,1.35))*(1-.13*Math.exp(-(((v-.42)/.12)**2)));half.push([hw,v*L]);}return mirror(half);};
    const n=Math.round(14+Math.max(0,h-1)*12);
    for(let i=0;i<n;i++){const onB=i%4===3,u=onB?.25+.75*rnd():.42+.58*(i/n),curve=onB?branch:trunk,P=curve.getPoint(u),a=i*2.39996,tilt=(22+40*u+rnd()*10)*Math.PI/180;
      const L=Math.min(.32,.2+.12*rnd())*Math.min(1.1,h/1.6),reach=Math.hypot(P.x,P.z),Lm=Math.max(.12,Math.min(L,(D/2-reach)/Math.cos(tilt)));
      putLeaf(g,leafGeo(fig(Lm,Lm*.62),{bend:.18,cup:.18}),leafMat(G[i%3],.42),[P.x,P.y,P.z],[Math.cos(tilt)*Math.cos(a),Math.sin(tilt),Math.cos(tilt)*Math.sin(a)]);}},
  // palm (areca): stalks arching from the center, narrow leaflets on both sides, shorter and lower toward the end
  palm(g,{D,h,pm,rnd}){const R=Math.min(.25,D*.26),y0=pot(g,R,Math.min(.4,h*.26),pm),top=h-y0,cane=leafMat(0x7c8b42,.6),pos=[];
    const n=Math.max(6,Math.round(5+D*6));
    for(let i=0;i<n;i++){const t=i/(n-1),a=i*2.39996+rnd()*.3,rT=D/2*(.55+.4*t)*(.88+.12*rnd()),hT=y0+top*(1-.45*t)*(.92+.08*rnd());
      const b=V3(Math.cos(a)*.025,y0,Math.sin(a)*.025),ctrl=V3(Math.cos(a)*rT*.3,y0+top*(1.05-.2*t),Math.sin(a)*rT*.3),tip=V3(Math.cos(a)*rT,hT-top*.35*t,Math.sin(a)*rT);
      const curve=stalk(g,[b,ctrl,tip],.005,cane,14);
      for(let j=0;j<24;j++){const u=.22+.76*j/23,P=curve.getPoint(u),T=curve.getTangent(u),side=new THREE.Vector3().crossVectors(T,UP);if(side.lengthSq()<1e-6)continue;side.normalize();
        const len=(.05+.17*Math.sin(Math.PI*Math.min(1,(u-.15)/.9)))*Math.min(1.1,D/.9),wq=.007;
        for(const sg of [-1,1]){const dir=side.clone().multiplyScalar(sg).addScaledVector(T,.6).addScaledVector(UP,-.45).normalize(),E=P.clone().addScaledVector(dir,len);
          const a1=P.clone().addScaledVector(T,-wq),a2=P.clone().addScaledVector(T,wq),e1=E.clone().addScaledVector(T,wq*.25),e2=E.clone().addScaledVector(T,-wq*.25);
          pos.push(...a1.toArray(),...a2.toArray(),...e1.toArray(),...a1.toArray(),...e1.toArray(),...e2.toArray());}}}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.computeVertexNormals();
    const m=new THREE.Mesh(geo,leafMat(0x5a8a3b,.6));m.castShadow=true;g.add(m);},
  // snake plant: straight sword leaves from the soil, slightly outward and twisted; one at the full height
  snake(g,{D,h,pm,rnd}){const R=Math.min(.22,D*.46),y0=pot(g,R,Math.min(.34,h*.36),pm,'cyl'),G=[0x2e482a,0x3a5832,0x46653a],n=Math.max(6,Math.round(5+D*14));
    for(let i=0;i<n;i++){const a=i*2.39996+rnd()*.6,rr=R*.6*Math.sqrt(rnd()),L=i?(h-y0)*(.5+.45*rnd()):h-y0,W=.045+.03*rnd(),lean=.05+.2*rr/R+.05*rnd(),half=[[0,0]];
      for(let k=1;k<=10;k++){const v=k/10;half.push([W/2*Math.pow(Math.sin(Math.PI*Math.min(1,.18+v*.82)),.55)*(v>.85?(1-v)/.15+.02:1),v*L]);}half.push([0,L]);
      putLeaf(g,leafGeo(mirror(half),{cup:.4,twist:(rnd()-.5)*1.6}),leafMat(G[i%3],.5),[Math.cos(a)*rr,y0-.01,Math.sin(a)*rr],[Math.cos(a)*lean,1,Math.sin(a)*lean]);}},
  // hydrangea: a dome of leaves with flower heads of small blossoms on top
  flowers(g,{D,h,pm,rnd}){const R=Math.min(.22,D*.34),y0=pot(g,R,Math.min(.3,h*.42),pm,'bowl'),top=h-y0,cr=D/2,G=[0x3d6b38,0x48773f];
    const ovate=L=>{const half=[[0,0]];for(let k=1;k<=8;k++){const v=k/8;half.push([L*.28*Math.sin(Math.PI*Math.pow(v,.8)),v*L]);}return mirror(half);};
    for(let i=0;i<24;i++){const t=i/23,a=i*2.39996,L=.09+.05*rnd(),rr=cr*.55*Math.sqrt(t),tilt=(15+45*(1-t))*Math.PI/180;
      putLeaf(g,leafGeo(ovate(L),{bend:.15,cup:.2}),leafMat(G[i%2],.7),[Math.cos(a)*rr*.5,y0+top*(.45-.25*t),Math.sin(a)*rr*.5],[Math.cos(tilt)*Math.cos(a),Math.sin(tilt),Math.cos(tilt)*Math.sin(a)]);}
    const FL=[0xd8a3cc,0xe6bfd9,0xc6b0e0,0xeedbe6],bud=new THREE.SphereGeometry(1,7,5),m=Math.max(4,Math.round(3+D*7)),rb=Math.min(.09,cr*.32);
    for(let i=0;i<m;i++){const a=i*2.39996+.6,rr=(cr-rb)*(i?(.35+.6*rnd()):0),c=V3(Math.cos(a)*rr,h-rb-(i?top*.18*rnd():0),Math.sin(a)*rr),fm=mat(FL[i%4],.8);
      stalk(g,[V3(0,y0,0),V3(c.x*.5,(y0+c.y)/2,c.z*.5),c],.004,leafMat(0x557a3e,.7),8);
      for(let k=0;k<18;k++){const th=rnd()*Math.PI*2,ph=Math.acos(1-1.4*rnd()),q=new THREE.Mesh(bud,fm),r2=rb*.8;q.scale.set(.024,.012,.024);
        q.position.set(c.x+Math.sin(ph)*Math.cos(th)*r2,c.y+Math.cos(ph)*r2,c.z+Math.sin(ph)*Math.sin(th)*r2);q.lookAt(c.x*2-q.position.x,c.y*2-q.position.y,c.z*2-q.position.z);q.castShadow=true;g.add(q);}}},
};
const VASE={
  // pampas grass: thin arching stems with fluffy plumes of several elongated puffs on top
  pampas(g,{h,y0,R,rnd}){const st=leafMat(0xa48d66,.8),pl=mat(0xe9dcc2,1);
    for(let i=0;i<7;i++){const a=i*2.39996+rnd()*.4,lean=(8+20*rnd())*Math.PI/180,L=(h-y0)*(.82+.18*(i?rnd():1)),tip=V3(Math.cos(a)*Math.sin(lean)*L,y0+Math.cos(lean)*L,Math.sin(a)*Math.sin(lean)*L);
      const c=stalk(g,[V3(Math.cos(a)*R*.15,y0-.05,Math.sin(a)*R*.15),V3(tip.x*.3,y0+(tip.y-y0)*.6,tip.z*.3),tip],.003,st,12),pk=.18+.12*rnd();
      for(let k=0;k<3;k++){const u=1-pk/L*(.25+.3*k),P=c.getPoint(Math.max(.5,u)),T=c.getTangent(Math.max(.5,u)),q=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),pl);
        q.scale.set(.03-.006*k,pk*(.45-.08*k),.03-.006*k);q.quaternion.setFromUnitVectors(UP,T);q.position.copy(P).addScaledVector(T,pk*.15);q.castShadow=true;g.add(q);}}},
  // eucalyptus: slanted stems with pairs of round gray-blue leaves along them
  eucalyptus(g,{h,y0,R,rnd}){const st=leafMat(0x6f6a55,.8),lm=leafMat(0x8ea493,.75),disc=r=>{const p=[];for(let k=0;k<=12;k++){const t=k/12*Math.PI*2;p.push([Math.sin(t)*r,r-Math.cos(t)*r]);}return p;};
    for(let i=0;i<6;i++){const a=i*2.39996+rnd()*.5,lean=(14+28*rnd())*Math.PI/180,L=(h-y0)*(.75+.25*(i?rnd():1)),tip=V3(Math.cos(a)*Math.sin(lean)*L,y0+Math.cos(lean)*L,Math.sin(a)*Math.sin(lean)*L);
      const c=stalk(g,[V3(0,y0-.05,0),V3(tip.x*.25,y0+(tip.y-y0)*.6,tip.z*.25),tip],.0035,st,12);
      for(let u=.3;u<=1;u+=.055/L){const P=c.getPoint(u),T=c.getTangent(u),side=new THREE.Vector3().crossVectors(T,UP);if(side.lengthSq()<1e-6)continue;side.normalize();const r=.016+.016*(1-u);
        for(const sg of [-1,1])putLeaf(g,leafGeo(disc(r),{cup:.15}),lm,P.toArray(),side.clone().multiplyScalar(sg).addScaledVector(UP,.35).toArray());}}},
  empty(){},
};
const GEN={
  // Our own generic model: two compartments, recessed handles, no brand and no external assets.
  // The bounding box includes the doors; all parts stay within w/d/h for an accurate plan.
  fridge(g,p){const {w,d,h,color='white',v}=p;if(v==='sbs'||v==='french'){wideFridge(g,p);return;}
    const c=COLORS[color][1],mt=color==='steel'?.6:0,enamel=mat(c,.38,mt),side=mat(shade(c,.92),.48,mt),seal=mat(0x373b40,.8);
    const foot=.035,door=.045,gap=.009,split=h*.34;
    part(g,w-.07,foot,d-.08,seal,0,0,0,.008);
    part(g,w,h-foot,d-door,side,0,foot,-door/2,.018);
    // The dark backing is visible only in the seam and in the recesses for gripping the doors.
    part(g,w-.018,h-foot-.014,.008,seal,0,foot+.007,d/2-door+.004,.003);
    const front=mat(c,color==='steel'?.28:.32,mt),z=d/2-door/2-.002;
    part(g,w-.012,split-foot-gap/2,door-.004,front,0,foot,z,.012);
    part(g,w-.012,h-split-gap/2,door-.004,front,0,split+gap/2,z,.014);
    // Shallow horizontal handles at the compartment joint, not protruding beyond the bounding box.
    const gripW=w*.48,gripX=-w*.17;
    for(const y of [split-.039,split+.014]){
      part(g,gripW,.022,.005,seal,gripX,y,d/2-.0025,.006);
      part(g,gripW,.006,.006,enamel,gripX,y+.016,d/2-.003,.002);
    }
  },
  dresser(g,p){drawers(g,p,3);},
  tvStand(g,p){
    const {w,d,h,color}=p,m=mat(COLORS[color][1]);
    // wall-hung (above the floor) — a carcass without legs, a row of flap fronts
    if(zOf(p)>0){const c=COLORS[color][1],n=Math.max(2,Math.round(w/.6)),gap=.004,dw=(w-gap*(n+1))/n;part(g,w,h,d-.02,mat(shade(c,.85),.55),0,0,-.01,.006);
      for(let i=0;i<n;i++){const x=-w/2+gap+dw/2+i*(dw+gap);part(g,dw,h-.008,.018,m,x,.004,d/2-.009,.003);}return;}
    table(g,p);
    part(g,w-.08,.025,d-.04,m,0,.12,0);
    for(const x of [-1,0,1])part(g,.02,h-.16,d-.04,m,x*(w/2-.05),.12,0);
    part(g,w-.08,h-.16,.012,m,0,.12,-d/2+.02);
  },
  diningTable(g,p){table(g,p);},
  console(g,p){table(g,p);part(g,p.w-.12,.02,p.d-.08,mat(COLORS[p.color][1]),0,.18,0);},
  bench(g,p){table(g,p,.07);},
  ottoman(g,{w,d,h,color}){
    const c=COLORS[color][1];
    part(g,w-.08,.06,d-.08,mat(shade(c,.55)),0,0,0);
    part(g,w,h-.12,d,mat(c,.95),0,.06,0,.07);
    part(g,w,.065,d,mat(shade(c,1.08),.95),0,h-.065,0,.03);
  },
  shoeCabinet(g,p){drawers(g,p,3);},
  bathShelf(g,p){
    const {w,d,h,color}=p,m=mat(COLORS[color][1]);
    for(const x of [-1,1])for(const z of [-1,1])part(g,.025,h,.025,m,x*(w/2-.013),0,z*(d/2-.013));
    for(let i=0;i<5;i++)part(g,w,.025,d,m,0,.08+i*(h-.105)/4,0);
  },
  // Vanity unit: two drawers, a ceramic countertop with a basin and a faucet on top; wall-hung — no plinth, the floor beneath it stays free.
  vanity(g,p){const {w,d,h,v,color}=p,c=COLORS[color][1],body=mat(shade(c,.85)),front=mat(c,.5),mt=mat(0x2b2c2f,.4,.4),cer=CERAMIC(),wall=v==='wall',y0=wall?Math.min(.35,h*.4):.08,T=.04,dep=.14,y=h-T;
    if(!wall)part(g,w-.08,.08,d-.08,mat(shade(c,.6)),0,0,0,.002);
    part(g,w,y-dep-.01-y0,d-.03,body,0,y0,-.015,.004);for(const s2 of [-1,1])part(g,.018,y-y0,d-.03,body,s2*(w/2-.009),y0,-.015,.002);part(g,w,y-y0,.018,body,0,y0,-d/2+.009,.002);
    const fh=(y-y0-.012)/2;for(let i=0;i<2;i++){const yy=y0+.004+i*(fh+.004);part(g,w-.008,fh,.018,front,0,yy,d/2-.024,.003);part(g,Math.min(.3,w*.4),.01,.014,mt,0,yy+fh-.05,d/2-.008,.004);}
    const bk=.09,two=w>=1.2,hw=two?w/2:w,bw=Math.min(hw-.12,.58),bd=d-bk-.05,bz=-d/2+bk+bd/2; // from 1.2 m — two basins
    for(const x of two?[-w/4,w/4]:[0]){const q=new THREE.Group();q.position.x=x;g.add(q);bowlTop(q,{w:hw,d,y,T,bw,bd,bz,dep,top:cer,bowl:mat(0xefeee9,.16)});
      cyl(q,.017,.003,CHROME(),0,y+T-dep+.012,bz+.03,{seg:20});faucet(q,0,h,-d/2+bk/2);}
  },
  wardrobe(g,{w,d,h,color,v}){
    const c=COLORS[color][1],body=mat(shade(c,.82)),front=mat(c,.55),metal=mat(0x3c3e42,.4);
    part(g,w-.04,.06,d-.05,mat(shade(c,.6)),0,0,-.02,.002);
    part(g,w,h-.06,d-.02,body,0,.06,-.01,.004);
    // sliding: doors overlapping in two rows, rails at the top and bottom, full-height profile handles
    if(v==='sliding'){const n=Math.max(2,Math.round(w/.9)),dw=(w-.02)/n+.03,al=mat(0xb8bcc0,.3,.6);part(g,w,.03,.06,al,0,h-.03,d/2-.03,.003);part(g,w,.02,.06,al,0,.06,d/2-.03,.003);
      for(let i=0;i<n;i++){const x=-w/2+.01+(w-.02)*(i+.5)/n,z=d/2-(i%2?.045:.015);part(g,dw,h-.12,.018,front,x,.08,z,.003);
        for(const s of [-1,1])part(g,.018,h-.12,.026,al,x+s*(dw/2-.009),.08,z,.003);}return;}
    const n=Math.max(1,Math.round(w/.5)),gap=.004,dw=(w-gap*(n+1))/n;
    for(let i=0;i<n;i++){const x=-w/2+gap+dw/2+i*(dw+gap);
      part(g,dw,h-.06-gap*2,.018,front,x,.06+gap,d/2-.009,.003);
      const side=i%2?-1:1;part(g,.012,Math.min(.35,h*.2),.02,metal,x+side*(dw/2-.04),Math.min(1.0,h*.42),d/2+.01,.005);}
  },
  shelf(g,{w,d,h,color}){
    const c=COLORS[color][1],m=mat(c),t=.018;
    part(g,t,h,d,m,-w/2+t/2,0,0);part(g,t,h,d,m,w/2-t/2,0,0);part(g,w,h,.006,mat(shade(c,.85)),0,0,-d/2+.003,.001);
    const n=Math.max(2,Math.round(h/.36));let s=Math.round(w*1000+h*100);const rnd=()=>((s=Math.imul(s^s>>>15,1|s)+0x6D2B79F5|0)>>>0)/4294967296;
    const BOOK=[0x8c3b2e,0x2f4f6b,0xc9a24a,0x4f6b4a,0xd8d2c4,0x6b4a6b];
    for(let i=0;i<=n;i++){const y=i===0?.02:i===n?h-t:i*(h-t)/n;part(g,w-2*t,t,d-.008,m,0,y,.004);
      if(i<n&&rnd()<.7){let x=-w/2+t+.02+rnd()*.15;const top=(h-t)/n-.04;while(x<w/2-t-.05&&rnd()<.93){const bw=.02+rnd()*.03,bh=Math.min(top,.18+rnd()*.12);
        part(g,bw,bh,d*.75,mat(BOOK[Math.floor(rnd()*BOOK.length)],.8),x+bw/2,y+t,.0,.003);x+=bw+.003;}}}
  },
  bed(g,{w,d,h,color}){
    const c=COLORS[color][1],frame=mat(c),fabric=mat(0xd2cabb,.9),linen=mat(0xf1eee8,.85),duvet=mat(0xdcd6cb,.9);
    for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]])part(g,.05,.08,.05,mat(shade(c,.7)),sx*(w/2-.06),0,sz*(d/2-.06),.01);
    part(g,w,.24,d-.06,frame,0,.08,.03,.012);
    part(g,w-.06,.2,d-.16,linen,0,.32,.05,.05);
    part(g,w-.02,.07,(d-.16)*.66,duvet,0,.47,.05+(d-.16)*.17,.035);
    const pw=w>1.2?(w-.24)/2:w-.2;for(const sx of (w>1.2?[-1,1]:[0]))part(g,pw,.13,.38,linen,sx*(pw/2+.04),.52,-d/2+.36,.06);
    part(g,w,h-.08,.09,fabric,0,.08,-d/2+.045,.03);
  },
  nightstand(g,p){const {w,d,h,color}=p,L=zOf(p)>0?0:.06; // wall-hung — no legs
    const c=COLORS[color][1],body=mat(shade(c,.85)),front=mat(c,.55),metal=mat(0x3c3e42,.4);
    if(L)for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]])part(g,.025,L,.025,metal,sx*(w/2-.03),0,sz*(d/2-.03),.005);
    part(g,w,h-L,d-.02,body,0,L,-.01,.006);
    const fh=(h-L-.012)/2;for(let i=0;i<2;i++){const y=L+.004+i*(fh+.004);part(g,w-.008,fh,.016,front,0,y,d/2-.008,.003);part(g,.08,.01,.012,metal,0,y+fh*.6,d/2+.006,.004);}
  },
  // Kitchen: plinth recessed under the fronts, overhanging countertop; fronts in ~60 cm modules, bar handles.
  // The hob is no longer part of “Base cabinets” — it is a separate unit, like the sink and the dishwasher.
  // kitchen base and wall cabinets are wall-run items: their look is in RUN_LOOK below
  tv(g,{w,d,h}){part(g,w,h,d,mat(0x1b1c1f,.35),0,0,0,.006);part(g,w-.024,h-.024,.004,mat(0x07080b,.12),0,.012,d/2,.001);},
  // Sink: a cutout in the countertop with a bowl beneath; from 80 cm — bowl on the left and a drainer on the right. The carcass is lower so the bowl is visible.
  kitchenSink(g,p){if(p.v==='two'){sinkTwo(g,p);return;}const {w,d,h}=p,{P,T}=KB,k=kitBase(g,p,{top:false,body:false}),body=mat(shade(k.c,.82)),top=TOP(),steel=mat(0xb4b8bc,.26);
    const bw=Math.min(w-.16,.5),bd=Math.min(d-.2,.42),bx=w>=.8?-w/2+.08+bw/2:0,bz=.02,dep=.18;
    part(g,w,h-T-P-dep-.02,d-.05,body,0,P,-.025,.003);
    for(const s of [-1,1])part(g,.018,h-T-P,d-.05,body,s*(w/2-.009),P,-.025,.002);
    part(g,w,h-T-P,.018,body,0,P,-d/2+.009,.002);
    const L=bx-bw/2+w/2,R=w/2-bx-bw/2,B=bz-bd/2+d/2,Fd=d/2-bz-bd/2;
    part(g,L,T,d,top,-w/2+L/2,h-T,0,.004);part(g,R,T,d,top,w/2-R/2,h-T,0,.004);
    part(g,bw,T,B,top,bx,h-T,-d/2+B/2,.002);part(g,bw,T,Fd,top,bx,h-T,d/2-Fd/2,.002);
    part(g,bw,.008,bd,steel,bx,h-dep,bz,.002);
    for(const s of [-1,1]){part(g,.008,dep,bd,steel,bx+s*(bw/2-.004),h-dep,bz,.001);part(g,bw,dep,.008,steel,bx,h-dep,bz+s*(bd/2-.004),.001);
      part(g,.02,.004,bd+.04,steel,bx+s*(bw/2+.01),h,bz,.002);part(g,bw+.04,.004,.02,steel,bx,h,bz+s*(bd/2+.01),.002);}
    cyl(g,.022,.004,mat(0x2a2c30,.4),bx,h-dep+.008,bz);
    if(w>=.8){const x0=bx+bw/2+.03,x1=w/2-.05;part(g,x1-x0,.004,bd,steel,(x0+x1)/2,h,bz,.002);
      for(let x=x0+.03;x<x1-.02;x+=.035)part(g,.006,.003,bd-.08,mat(0x9a9ea3,.3),x,h+.004,bz,.001);}
    const ch=CHROME(),fz=-d/2+B/2;cyl(g,.02,.03,ch,bx,h,fz);cyl(g,.013,.24,ch,bx,h+.03,fz);
    cyl(g,.012,.2,ch,bx,h+.26,fz+.1,{axis:'z'});cyl(g,.012,.05,ch,bx,h+.21,fz+.19);part(g,.012,.012,.08,ch,bx+.03,h+.2,fz+.02,.004);
    row(g,k,-w/2,w,P+.003,h-T-P-.006,'top',Math.max(1,Math.round(w/.45)));
  },
  // Hob: glass with burners; drawers or an oven beneath it.
  kitchenHob(g,p){const {w,d,h,v}=p,k=kitBase(g,p),hob=mat(0x121316,.14),ring=mat(0x55585d,.35);
    if(v==='oven'){const oh=.595;oven(g,w,k.y1-.006-oh,k.F);row(g,k,-w/2,w,k.y0+.003,k.y1-k.y0-oh-.012);}
    else{const H=k.y1-k.y0-.006,hs=[.25,.375,.375];let y=k.y0+.003;for(const f of hs){row(g,k,-w/2,w,y,H*f-.004,'top',1);y+=H*f;}}
    const pw=Math.min(.58,w-.04),pd=Math.min(.52,d-.08);part(g,pw,.006,pd,hob,0,h,-.01,.003);
    for(const [x,z,r] of [[-.13,-.13,.09],[.13,-.13,.07],[-.13,.11,.07],[.13,.11,.09]]){
      const t=new THREE.Mesh(new THREE.TorusGeometry(r*Math.min(1,pw/.58),.003,6,40),ring);t.rotation.x=Math.PI/2;t.position.set(x*pw/.58,h+.006,-.01+z*pd/.52);g.add(t);}
  },
  // Dishwasher: semi-integrated — a control panel is visible on top, a kitchen front below.
  dishwasher(g,p){const {w,h}=p,k=kitBase(g,p),dark=mat(0x34373c,.32),y=k.y1-.08;
    part(g,w-.008,.077,.02,dark,0,y,k.F-.01,.003);part(g,.07,.022,.004,mat(0x0b0c0e,.1),w/2-.12,y+.028,k.F,.002);
    for(let i=0;i<4;i++)cyl(g,.008,.004,mat(0xb9bcc0,.3),-w/2+.08+i*.045,y+.039,k.F+.002,{axis:'z',seg:12});
    part(g,w-.008,y-k.y0-.006,.018,k.front,0,k.y0+.003,k.F-.009,.003);part(g,Math.min(.3,w*.5),.012,.018,k.metal,0,y-.06,k.F+.009,.005);
  },
  // Corner cabinet: L-shaped — one arm along the back wall and one along the left (mirrored — the right), fronts facing into the corner.
  kitchenCorner(g,p){const {w,d,h,color}=p,c=COLORS[color][1],{P,T}=KB,{back:A,side:S}=lArms(p),body=mat(shade(c,.82)),pl=mat(0x2c2d30,.7),top=TOP(),front=mat(c,.5),metal=METAL();
    const L=-w/2,B=-d/2,H=h-T-P,gap=.004;
    part(g,w,P,A-.09,pl,0,0,B+(A-.09)/2,.002);part(g,S-.09,P,d-A+.09,pl,L+(S-.09)/2,0,B+A-.09+(d-A+.09)/2,.002);
    part(g,w,H,A-.05,body,0,P,B+(A-.05)/2,.003);part(g,S-.05,H,d-A+.05,body,L+(S-.05)/2,P,B+A-.05+(d-A+.05)/2,.003);
    part(g,w,T,A,top,0,h-T,B+A/2,.004);part(g,S,T,d-A,top,L+S/2,h-T,B+A+(d-A)/2,.004);
    const fb=B+A-.041,lb=w/2-(L+S-.05),n=Math.max(1,Math.round(lb/.6)),dw=(lb-gap*(n+1))/n;
    for(let i=0;i<n;i++){const x=L+S-.05+gap+dw/2+i*(dw+gap);part(g,dw,H-.006,.018,front,x,P+.003,fb,.003);part(g,Math.min(.3,dw*.5),.012,.018,metal,x,h-T-.07,fb+.018,.005);}
    const fl=L+S-.041,ls=d/2-(B+A-.05)-gap*2,zc=B+A-.05+gap+ls/2;
    part(g,.018,H-.006,ls,front,fl,P+.003,zc,.003);part(g,.018,.012,Math.min(.3,ls*.5),metal,fl+.018,h-T-.07,zc,.005);
  },
  // Tall unit: a tall cabinet reaching up to the overhead storage; two doors or an oven at eye level.
  kitchenTall(g,{w,d,h,color,v}){const c=COLORS[color][1],{P}=KB,F=d/2-.032,body=mat(shade(c,.82)),front=mat(c,.5),metal=METAL();
    part(g,w,P,d-.09,mat(0x2c2d30,.7),0,0,-.045,.002);part(g,w,h-P,d-.05,body,0,P,-.025,.003);
    const door=(y0,y1,hy)=>{part(g,w-.008,y1-y0-.006,.018,front,0,y0+.003,F-.009,.003);part(g,.012,Math.min(.25,(y1-y0)*.4),.018,metal,w/2-.05,hy,F+.009,.005);};
    if(v==='oven'){const oy=Math.min(.85,h-.9);door(P,oy-.003,oy-.3);oven(g,w,oy,F);door(oy+.598,h,oy+.62);}
    else{const m=P+(h-P)*.55;door(P,m,m-.3);door(m,h,m+.04);}
  },
  // Range hood: dome or slanted, the chimney goes up (height is to the top of the chimney).
  hood(g,{w,d,h,v,color='steel'}){const st=finish(color),cw=Math.min(.28,w*.5),cd=Math.min(.24,d*.6),cz=-d/2+cd/2;
    if(v==='slant'){const H=Math.min(.45,h-.05),run=d-cd,a=Math.atan2(H,run);box(g,frustum(w,H,d,w,cd,cz),st,0,0,0); // wedge, black glass on the slope
      const gl=new THREE.Mesh(new RoundedBoxGeometry(w-.02,.008,Math.hypot(H,run)-.02,2,.003),mat(0x111214,.1));gl.rotation.x=a;
      gl.position.set(0,H/2+Math.cos(a)*.005,(d/2+cz+cd/2)/2+Math.sin(a)*.005);g.add(gl);
      part(g,w-.02,.004,d-.04,mat(0x2a2c30,.5),0,-.004,0,.001);part(g,cw,h-H,cd,st,0,H,cz,.003);}
    else{part(g,w,.035,d,st,0,0,0,.004);box(g,frustum(w,.16,d,cw+.04,cd+.03,cz),st,0,.035,0);
      part(g,w-.06,.004,d-.06,mat(0x6b6e73,.5),0,-.004,0,.001);part(g,cw,h-.195,cd,st,0,.195,cz,.003);}
  },
  // ---------- bathroom ----------
  // Toilet: the bowl is an ellipse sized to fit, floor-standing with a cistern or wall-hung on an installation frame box (height is the top of the cistern or box).
  toilet(g,{w,d,h,v,color='white'}){const blk=color==='black',cer=blk?mat(0x2a2b2e,.3):CERAMIC(),seat=blk?mat(0x323337,.35):mat(0xfbfaf7,.3),ch=CHROME(),wall=v==='wall',back=wall?.16:.17;
    const z0=-d/2+(wall?back:back-.04),bl=d/2-z0,zc=(z0+d/2)/2,bw=Math.min(w,.4); // bowl no wider than 40 cm, the installation box spans the full width
    if(wall){part(g,w,h,back,mat(0xdedbd5,.7),0,0,-d/2+back/2,.004);part(g,Math.min(.24,w*.65),.15,.01,ch,0,Math.max(.45,Math.min(h-.2,1)),-d/2+back+.005,.004);
      cyl(g,.5,.2,cer,0,.18,zc,{rb:.3,sx:bw*.96,sz:bl});}
    else{cyl(g,.5,.2,cer,0,0,zc+.02,{sx:bw*.55,sz:bl*.6});cyl(g,.5,.2,cer,0,.18,zc,{rb:.4,sx:bw*.96,sz:bl});
      part(g,w*.95,h-.39,back,cer,0,.39,-d/2+back/2,.03);part(g,bw*.6,.4,.12,cer,0,0,-d/2+.06,.02);cyl(g,.025,.008,ch,0,h,-d/2+back/2);}
    cyl(g,.5,.018,seat,0,.38,zc+.005,{sx:bw*.98,sz:bl*.97});cyl(g,.5,.014,seat,0,.398,zc,{sx:bw*.92,sz:bl*.9});
  },
  // Bathtub: rim, bottom and panel in one white; faucet on the rim by the wall.
  bath(g,{w,d,h}){const cer=CERAMIC(),t=.07,ch=CHROME();
    part(g,w,.14,d,cer,0,0,0,.01);
    for(const s of [-1,1]){part(g,w,h-.14,t,cer,0,.14,s*(d/2-t/2),.02);part(g,t,h-.14,d-2*t,cer,s*(w/2-t/2),.14,0,.02);}
    part(g,w-2*t,.004,d-2*t,mat(0xefeee9,.16),0,.14,0,.001);cyl(g,.025,.004,ch,w/2-t-.1,.144,0);
    const x=w/2-.18,z=-d/2+t/2;cyl(g,.02,.08,ch,x,h,z);cyl(g,.014,.14,ch,x,h+.06,z+.07,{axis:'z'});part(g,.1,.014,.014,ch,x,h+.05,z,.005);
  },
  // Shower cabin: tray, glass in front and on the right (walls at the back and left; mirrored — on the right), a riser rail with a hand shower at the back wall.
  shower(g,{w,d,h,v,color='chrome'}){const cer=CERAMIC(),ch=finish(color),T=.12,gh=h-T-.03,x0=-w/2+.2*w,z0=-d/2+.2*d,rx=.8*w-.015,rz=.8*d-.015;
    if(v==='round'){
      const s=new THREE.Shape();s.moveTo(-w/2,d/2);s.lineTo(w/2,d/2);s.lineTo(w/2,-z0);s.absellipse(x0,-z0,.8*w,.8*d,0,-Math.PI/2,true);s.lineTo(-w/2,-d/2);s.closePath();
      const geo=new THREE.ExtrudeGeometry(s,{depth:T,bevelEnabled:false,curveSegments:24});geo.rotateX(-Math.PI/2);box(g,geo,cer,0,0,0);
      const arc=(y,hh,m,open=true)=>{const c=new THREE.Mesh(new THREE.CylinderGeometry(1,1,hh,40,1,open,0,Math.PI/2),m);c.scale.set(rx,1,rz);c.position.set(x0,y+hh/2,z0);g.add(c);return c;};
      glass(arc(T,gh,GLASS));arc(h-.03,.025,ch);
      glass(part(g,.008,gh,z0+d/2-.015,GLASS,w/2-.015,T,(-d/2+z0)/2));glass(part(g,x0+w/2-.015,gh,.008,GLASS,(-w/2+x0)/2,T,d/2-.015));
    }else{
      part(g,w,T,d,cer,0,0,0,.015);
      const pw=w/2+.03;glass(part(g,pw,gh,.008,GLASS,-w/2+pw/2+.01,T,d/2-.02));glass(part(g,pw,gh,.008,GLASS,w/2-pw/2-.03,T,d/2-.04));glass(part(g,.008,gh,d-.06,GLASS,w/2-.02,T,-.01));
      part(g,w,.022,.022,ch,0,h-.03,d/2-.03,.004);part(g,.022,.022,d,ch,w/2-.02,h-.03,0,.004);part(g,.022,gh,.022,ch,w/2-.02,T,d/2-.03,.004);
    }
    const x=-w*.05,z=-d/2+.025;cyl(g,.011,gh-.35,ch,x,T+.6,z);cyl(g,.011,.22,ch,x,h-.25,z+.11,{axis:'z'});cyl(g,.1,.014,ch,x,h-.27,z+.2);
    part(g,.16,.06,.04,ch,x,T+.9,z+.01,.01);
  },
  // Front-loading washing machine: a panel with a drawer, display and program knob, a door.
  washer(g,p){appliance(g,p,p.v==='top'?'top':'washer');},
  dryer(g,p){appliance(g,p,'dryer');},
  // ---------- living room: upholstered furniture ----------
  loungeSofa(g,p){sofaBody(g,p);},
  loungeChair(g,p){sofaBody(g,p,{pillows:false,A:Math.min(.17,p.w*.19)});},
  // Corner sofa with a chaise: the main part along the back (depth foot.back), chaise on the left (width foot.side; mirrored — on the right).
  sofaCorner(g,p){const {w,d,h,color}=p,M=softMats(color),{leg,base,back}=SOFA,{back:B,side:S}=lArms(p),A=Math.min(.2,w*.075),AH=Math.min(.64,h-.08),L=-w/2,Z=-d/2,k=.07;
    sofaLegs(g,M,[[L+k,Z+k],[w/2-k,Z+k],[w/2-k,Z+B-k],[L+S-k,Z+B+k],[L+S-k,d/2-k],[L+k,d/2-k],[0,Z+k],[0,Z+B-k]]);
    part(g,w,base,B,M.frame,0,leg,Z+B/2,.03);part(g,S,base,d-B,M.frame,L+S/2,leg,Z+B+(d-B)/2,.03);
    part(g,A,AH-leg,B,M.fab,w/2-A/2,leg,Z+B/2,.075);part(g,A,AH-leg,d,M.fab,L+A/2,leg,0,.075);
    part(g,w-2*A,h-leg-.04,back,M.frame,0,leg,Z+back/2,.06);
    seatRow(g,M,L+S,w/2-A,Z+back,Z+B);part(g,S-A-.012,SOFA.seat,d-back-.008,M.cush,L+A+(S-A)/2,leg+base,(Z+back+d/2)/2,.055);
    backRow(g,M,L+A,w/2-A,Z+back,h);
    pillow(g,M.pil,L+A+.27,Z+back+.27,.25);pillow(g,M.pil2,w/2-A-.27,Z+back+.27,-.2);
  },
  // Sofa bed (pull-out): folded — a sofa; unfolded — the seat slides forward and the back lies down: a flat sleeping place with bedding.
  sofaBed(g,p){const {w,d,h,color}=p,ext=extOf(p);if(!ext){sofaBody(g,p,{A:Math.min(.18,w*.085)});return;}
    const M=softMats(color),{leg,base,back}=SOFA,A=Math.min(.18,w*.085),AH=Math.min(.62,h-.1),df=d-ext,Z=-d/2,k=.07,iw=w-2*A;
    sofaLegs(g,M,[[-w/2+k,Z+k],[w/2-k,Z+k],[-w/2+k,Z+df-k],[w/2-k,Z+df-k],[-iw/2+k,d/2-k],[iw/2-k,d/2-k]]);
    part(g,w,base,df,M.frame,0,leg,Z+df/2,.03);part(g,iw-.01,base,ext,M.frame,0,leg,Z+df+ext/2,.03);
    for(const s of [-1,1])part(g,A,AH-leg,df,M.fab,s*(w/2-A/2),leg,Z+df/2,.075);
    part(g,iw,seatTop+.3-leg,back,M.frame,0,leg,Z+back/2,.06);
    const mz0=Z+back,mz1=d/2;part(g,iw-.01,SOFA.seat,(mz1-mz0)/2-.004,M.cush,0,leg+base,mz0+(mz1-mz0)/4,.05);part(g,iw-.01,SOFA.seat,(mz1-mz0)/2-.004,M.cush,0,leg+base,mz1-(mz1-mz0)/4,.05);
    const sheet=mat(0xf1eee8,.85),duvet=mat(0xdcd6cb,.9),ln=mat(0xf6f3ee,.85);
    part(g,iw-.04,.012,mz1-mz0-.04,sheet,0,seatTop,(mz0+mz1)/2,.004);
    part(g,iw-.02,.06,(mz1-mz0)*.62,duvet,0,seatTop+.005,mz1-(mz1-mz0)*.31-.01,.03);
    const n=iw>1.2?2:1,pw=n>1?(iw-.16)/2:iw-.16;for(let i=0;i<n;i++)part(g,pw,.12,.36,ln,n>1?(i?1:-1)*(pw/2+.04):0,seatTop+.01,mz0+.22,.06);
  },
  // ---------- bathroom, continued ----------
  // Washbasin: a rectangular bowl with a faucet ledge; wall-mounted with a trap, or on a pedestal.
  basin(g,{w,d,h,v}){const cer=CERAMIC(),ch=CHROME(),T=.15,y=h-T,t=.028,bk=.09,zc=(-d/2+bk+d/2-t)/2,iz=d-bk-t;
    part(g,w,.04,d,cer,0,y,0,.014);part(g,w,T,bk,cer,0,y,-d/2+bk/2,.02);part(g,w,T,t,cer,0,y,d/2-t/2,.014);
    for(const s of [-1,1])part(g,t,T,iz+.004,cer,s*(w/2-t/2),y,zc,.014);
    part(g,w-2*t,.004,iz,mat(0xeeede8,.14),0,y+.04,zc,.001);cyl(g,.017,.003,ch,0,y+.044,zc+.03,{seg:20});
    const fz=-d/2+bk/2;cyl(g,.022,.025,ch,0,h,fz);cyl(g,.014,.13,ch,0,h+.025,fz);cyl(g,.012,.11,ch,0,h+.15,fz+.05,{axis:'z'});cyl(g,.01,.03,ch,0,h+.125,fz+.1);
    part(g,.012,.012,.07,ch,0,h+.16,fz-.04,.004);
    if(v==='pedestal')box(g,frustum(.19,y,.16,.15,.12,-.02),cer,0,0,-d/2+.13);
    else{cyl(g,.012,.07,ch,0,y-.07,zc+.03);cyl(g,.032,.13,ch,0,y-.2,zc+.03,{rb:.03});cyl(g,.012,zc+.03+d/2,ch,0,y-.11,(zc+.03-d/2)/2,{axis:'z'});}
  },
  // Mirror cabinet: carcass, mirrored doors (one, two or three across the width), lighting underneath.
  mirrorCabinet(g,{w,d,h,color}){const c=COLORS[color][1],body=mat(shade(c,.9)),mir=mat(0xeef3f6,.04,.8),n=w<.7?1:w<1.05?2:3,gap=.004,dw=(w-gap*(n+1))/n;
    part(g,w,h,d-.02,body,0,0,-.01,.004);
    for(let i=0;i<n;i++){const x=-w/2+gap+dw/2+i*(dw+gap);part(g,dw,h-.008,.018,mat(c,.5),x,.004,d/2-.009,.003);part(g,dw-.024,h-.032,.004,mir,x,.016,d/2+.001,.001);}
    part(g,w-.06,.006,.02,glow(0xfff2dc),0,-.004,d/2-.05,.002);
  },
  // Towel warmer: a ladder (two uprights and crossbars) or a serpentine of a single pipe; wall brackets.
  towelRail(g,{w,d,h,v,color='chrome'}){const m=finish(color),r=.013,zf=d/2-.03,br=(x,y)=>{cyl(g,.009,zf+d/2,m,x,y,(zf-d/2)/2,{axis:'z',seg:12});cyl(g,.022,.012,m,x,y,-d/2+.006,{axis:'z'});};
    if(v==='snake'){const n=Math.max(3,Math.round(h/.15)),s=(h-.06)/(n-1),Lx=w/2-s/2-.02;
      const tube=new THREE.Mesh(new THREE.TubeGeometry(serpentine(-Lx,Lx,h-.03,.03,n,zf),n*48,r,10),m);tube.castShadow=true;g.add(tube);
      br(-Lx,h-.03);br(n%2?Lx:-Lx,.03);}
    else{const Lx=w/2-.02,n=Math.max(4,Math.round((h-.08)/.085));for(const s of [-1,1]){cyl(g,r,h,m,s*Lx,0,zf);br(s*Lx,.08);br(s*Lx,h-.08);}
      for(let i=0;i<n;i++){const y=.04+i*(h-.08)/(n-1);cyl(g,.0095,2*Lx,m,0,y,zf,{axis:'x',seg:12});}}
  },
  // ---------- climate ----------
  // Radiator: sectional (fins) or panel (smooth front, grille on top); pipes to the floor and a thermostatic head on the right.
  radiator(g,p){const {w,d,h,v,color='white'}=p;const c=COLORS[color][1],m=mat(c,.38),dk=mat(shade(c,.72),.55),ch=CHROME(),lift=zOf(p);
    if(v==='panel'){part(g,w,h,d*.42,m,0,0,d/2-d*.21,.006);part(g,w-.004,h-.01,d*.4,m,0,.005,-d/2+d*.2+.008,.004);
      for(let y=.05;y<h-.03;y+=.045)part(g,w-.012,.003,.002,dk,0,y,d/2+.0005,.001);
      part(g,w-.02,.004,d-.02,mat(0x3a3c40,.6),0,h-.003,0,.001);for(const s of [-1,1])part(g,.006,h-.02,d-.01,m,s*(w/2-.003),.01,0,.002);}
    else{const n=Math.max(2,Math.round(w/.08)),sw=w/n;for(let i=0;i<n;i++)part(g,sw-.012,h,d-.012,m,-w/2+sw*(i+.5),0,0,.014);
      for(const y of [.035,h-.035])cyl(g,.016,w-.02,dk,0,y,-.005,{axis:'x',seg:12});}
    for(const s of [-1,1])cyl(g,.011,lift+.02,ch,s*(w/2-.05),-lift,-d/2+.025,{seg:12});
    cyl(g,.016,.05,ch,w/2-.05,-.03,-d/2+.025,{axis:'z',seg:16});cyl(g,.026,.06,mat(0xf3f3f1,.4),w/2-.05,-.03,-d/2+.08,{axis:'z'});
  },
  // Wall-mounted air conditioner: rounded body, front panel, a louvered slot at the bottom, indicator, grille on top.
  aircon(g,{w,d,h}){const wh=mat(0xf5f5f3,.3),dk=mat(0x2b2e32,.55);
    part(g,w,h,d,wh,0,0,0,.04);part(g,w-.012,h*.6,.006,mat(0xfbfbf9,.22),0,h*.37,d/2+.001,.005);
    part(g,w-.1,.03,d*.5,dk,0,-.001,d*.16,.008);const fl=part(g,w-.11,.006,.075,wh,0,.012,d/2-.03,.002);fl.rotation.x=.45;
    part(g,.045,.01,.003,glow(0x7fd9ff),w/2-.11,h*.3,d/2+.004,.002);part(g,.012,.01,.003,glow(0x9cf0b0),w/2-.17,h*.3,d/2+.004,.002);
    for(let i=0;i<5;i++)part(g,w-.1,.003,.012,mat(0xd9dad7,.5),0,h-.002,-d/2+.035+i*.03,.001);
  },
  // ---------- windows ----------
  // Curtains: a rod, full-width sheer and two drapes — closed (meeting in the middle) or open (gathered at the edges). Height is to the rod.
  // open (0…1) — for curtains from HA (D-048): how far open; the drapes gather toward the edges and the folds get deeper.
  curtains(g,{w,d,h,v,color='linen',open}){const c=COLORS[color][1],cloth=new THREE.MeshStandardMaterial({color:c,roughness:.96,side:THREE.DoubleSide}),
    tulle=new THREE.MeshStandardMaterial({color:0xfbfaf6,roughness:.9,transparent:true,opacity:.4,side:THREE.DoubleSide,depthWrite:false}),rod=mat(0x3b3c3f,.35,.5);
    const yr=h-.035,zr=d/2-.03,zc=zr-.035,zt=-d/2+.03,drop=h-.07;
    cyl(g,.011,w,rod,0,yr,zr,{axis:'x',seg:16});for(const s of [-1,1]){const b=new THREE.Mesh(new THREE.SphereGeometry(.02,16,12),rod);b.position.set(s*(w/2-.02),yr,zr);g.add(b);cyl(g,.007,zr+d/2,rod,s*(w/2-.12),yr,(zr-d/2)/2,{axis:'z',seg:10});}
    drape(g,tulle,-w/2+.03,w/2-.03,.015,drop-.01,zt,Math.max(6,Math.round(w/.08)),.01,false);
    const bw=Math.max(.2,Math.min(.45,w*.15)),k=open!=null?1-Math.max(0,Math.min(1,open)):v==='closed'?1:0,pw=bw+(w/2-.014-bw)*k; // k — how closed they are
    const n=Math.max(4,Math.round(4+(pw/.12-4)*k)),amp=.045-.017*k;
    drape(g,cloth,-w/2+.01,-w/2+.01+pw,.01,drop,zc,n,amp);drape(g,cloth,w/2-.01-pw,w/2-.01,.01,drop,zc,n,amp);
  },
  // ---------- tables, chairs, floor lamp (instead of Kenney models: any size and color) ----------
  // Coffee table: tabletop, lower shelf, tapered legs; round — an oval sized to fit, on three legs.
  tableCoffee(g,{w,d,h,color,v}){const c=COLORS[color][1],m=mat(c,.55),lg=mat(shade(c,.78),.55),T=.03;
    if(v==='round'){cyl(g,.5,T,m,0,h-T,0,{sx:w,sz:d,seg:48});cyl(g,.5,.018,m,0,.12,0,{sx:w*.78,sz:d*.78,seg:40});
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3+Math.PI/2,x=Math.cos(a)*w*.36,z=Math.sin(a)*d*.36;cyl(g,.018,h-T,lg,x,0,z,{rb:.013,seg:12});}}
    else{part(g,w,T,d,m,0,h-T,0,.01);part(g,w-.12,.018,d-.1,m,0,.12,0,.004);for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]])cyl(g,.019,h-T,lg,sx*(w/2-.06),0,sz*(d/2-.06),{rb:.013,seg:12});}
  },
  // Round (oval) dining table on a central pedestal with a cross base.
  tableRound(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.55),lg=mat(shade(c,.8),.55),T=.035;
    cyl(g,.5,T,m,0,h-T,0,{sx:w,sz:d,seg:56});cyl(g,.5,.05,mat(shade(c,.85),.6),0,h-T-.05,0,{sx:w*.86,sz:d*.86,seg:48});
    cyl(g,.05,h-T-.05,lg,0,0,0,{rb:.065,seg:20});for(let i=0;i<2;i++){const q=part(g,Math.min(.62,w*.55),.05,.07,lg,0,0,0,.012);q.rotation.y=i*Math.PI/2+Math.PI/4;}
  },
  // Dining chair: tapered legs, a seat with a soft cushion, a back on two posts with a curved rail.
  chairCushion(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.55),cu=mat(0xd7cfc1,.95),S=.45,T=.025;
    for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]])cyl(g,.016,S-T,m,sx*(w/2-.03),0,sz*(d/2-.03),{rb:.012,seg:12});
    part(g,w,T,d,m,0,S-T,0,.008);part(g,w-.04,.035,d-.06,cu,0,S,.01,.015);
    for(const sx of [-1,1]){const q=part(g,.022,h-S,.022,m,sx*(w/2-.03),S,-d/2+.03,.006);q.rotation.x=-.08;}
    const z=-d/2+.03-Math.sin(.08)*(h-S)*.5;for(const [y,hh] of [[h-.12,.1],[S+.2,.035]]){const q=part(g,w-.05,hh,.02,m,0,y,z+Math.sin(.08)*(y-S),.007);q.rotation.x=-.08;}
  },
  // Desk: tabletop, metal U-shaped supports, modesty panel, a drawer pedestal on the right from 1 m.
  desk(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.55),mt=mat(0x2d2f33,.45,.4),T=.03;
    part(g,w,T,d,m,0,h-T,0,.006);
    for(const s of [-1,1]){const x=s*(w/2-.05);part(g,.04,h-T,.04,mt,x,0,-d/2+.06,.004);part(g,.04,h-T,.04,mt,x,0,d/2-.06,.004);part(g,.04,.04,d-.08,mt,x,0,0,.004);part(g,.03,.03,d-.08,mt,x,h-T-.03,0,.004);}
    part(g,w-.14,.3,.016,mat(shade(c,.9),.6),0,h-T-.3,-d/2+.06,.003);
    if(w>=1){const dw=.4,x=w/2-.1-dw/2,hh=.36;part(g,dw,hh,d-.1,mat(shade(c,.92),.6),x,h-T-hh,0,.004);
      for(let i=0;i<2;i++){const y=h-T-hh+.006+i*hh/2;part(g,dw-.01,hh/2-.01,.016,m,x,y,d/2-.05+.008,.003);part(g,.12,.01,.012,mt,x,y+hh/4,d/2-.05+.02,.004);}}
  },
  // Office chair: five-caster star base, gas lift, seat, reclining back, armrests.
  chairDesk(g,{w,d,h,color}){const c=COLORS[color][1],f=mat(c,.92),pl=mat(0x232427,.45,.3),ch=CHROME(),R=Math.min(w,d)/2-.03,S=.47;
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5,x=Math.cos(a)*R,z=Math.sin(a)*R,q=part(g,R,.03,.045,pl,x/2,.06,z/2,.01);q.rotation.y=-a;
      const wh=new THREE.Mesh(new THREE.SphereGeometry(.028,12,10),pl);wh.position.set(x,.03,z);g.add(wh);}
    cyl(g,.05,.03,pl,0,.06,0);cyl(g,.022,S-.16,ch,0,.09,0,{seg:16});cyl(g,.032,.12,pl,0,.09,0,{seg:16});
    part(g,.3,.04,.3,pl,0,S-.1,0,.01);part(g,w-.06,.09,d*.78,f,0,S-.07,.03,.04);
    const bk=part(g,w-.1,h-S-.04,.07,f,0,S+.06,-d/2+.07,.035);bk.rotation.x=-.12;part(g,.06,.2,.03,pl,0,S-.08,-d/2+.12,.01);
    for(const s of [-1,1]){part(g,.025,.2,.025,pl,s*(w/2-.05),S-.06,.02,.008);part(g,.06,.025,.26,pl,s*(w/2-.05),S+.14,.03,.012);}
  },
  // Floor lamp: heavy base, thin stand, a cone-shaped fabric shade (the color is the shade's).
  lampRoundFloor(g,{w,d,h,color}){const sh=new THREE.MeshStandardMaterial({color:COLORS[color][1],roughness:.95,side:THREE.DoubleSide}),mt=mat(0x2b2c2f,.4,.5),r=Math.min(w,d)/2,sH=Math.min(.36,h*.24);
    cyl(g,r*.62,.025,mt,0,0,0,{rb:r*.66,seg:32});cyl(g,.011,h-sH*.6,mt,0,.025,0,{seg:12});
    const s=new THREE.Mesh(new THREE.CylinderGeometry(r*.72,r,sH,40,1,true),sh);s.position.set(0,h-sH/2,0);s.castShadow=true;g.add(s);
    cyl(g,.03,.06,mat(0xf4efe4,.6),0,h-sH*.75,0,{seg:16});
  },
  // Potted plant: a pot with a rim and soil, a rosette of ellipse leaves in different directions (golden angle), shades of green.
  // Plant: monstera, fiddle-leaf fig, palm, snake plant, hydrangea (PLANT above); w×d is the canopy width, the pot is sized from it
  pottedPlant(g,{w,d,h,color='white',v='monstera'}){const c=COLORS[color][1];
    (PLANT[v]||PLANT.monstera)(g,{D:Math.min(w,d),h,pm:leafMat(c,color==='terracotta'?.85:.6),rnd:seeded(Math.round(w*1000)*31+Math.round(h*1000))});},
  // Floor vase: a solid of revolution with a neck; dried flowers, eucalyptus or empty (then the whole height is the vase)
  floorVase(g,{w,d,h,color='sand',v='pampas'}){const D=Math.min(w,d),R=Math.min(.17,D*(v==='eucalyptus'?.36:.45)),hv=v==='empty'?h:Math.min(.65,h*.5);
    vessel(g,[[0,0],[R*.55,0],[R*.62,.01],[R,hv*.36],[R*.9,hv*.62],[R*.42,hv*.86],[R*.37,hv*.93],[R*.47,hv],[R*.4,hv],[R*.31,hv*.93],[0,hv*.88]],leafMat(COLORS[color][1],.5));
    (VASE[v]||VASE.empty)(g,{h,y0:hv,R,rnd:seeded(Math.round(w*1000)*17+Math.round(h*1000))});},
  // ---------- on the wall ----------
  // Floating shelf: a board with hidden mounting, the end edge slightly lighter.
  wallShelf(g,{w,d,h,color}){const c=COLORS[color][1];part(g,w,h,d,mat(c,.55),0,0,0,.004);part(g,w-.004,.002,d-.004,mat(shade(c,1.06),.55),0,h-.001,.001,.001);},
  // Coat rack: a rail with hooks (every ~15 cm), with a shelf on top if selected.
  coatHooks(g,{w,d,h,color,v}){const c=COLORS[color][1],m=mat(c,.55),mt=mat(0x2b2c2f,.4,.5),n=Math.max(2,Math.round(w/.15)),sh=v!=='hooks';
    const ph=sh?h-.025:Math.min(.12,h),py=sh?0:(h-ph)/2,y=sh?.07:py+ph/2,L=Math.min(.1,d-.04); // with a shelf — hooks at the bottom of the rail, visible from under the shelf
    part(g,w,ph,.022,m,0,py,-d/2+.011,.004);
    for(let i=0;i<n;i++){const x=-w/2+w*(i+.5)/n;cyl(g,.007,L,mt,x,y,-d/2+.022+L/2,{axis:'z',seg:10});const b=new THREE.Mesh(new THREE.SphereGeometry(.012,12,8),mt);b.position.set(x,y+.008,-d/2+.022+L);g.add(b);}
    if(sh){part(g,w,.025,d,m,0,h-.025,0,.004);for(const s2 of [-1,1])box(g,frustum(.02,.12,.02,.02,d-.04,(d-.04)/2-.01),m,s2*(w/2-.06),h-.145,-d/2+.032);} // brackets: narrow at the wall, under the whole shelf at the top
  },
  // Framed mirror: rectangular, round (an oval sized to fit) or arched.
  wallMirror(g,{w,d,h,color,v}){const fr=color==='chrome'?CHROME():mat(COLORS[color][1],.5,color==='black'?.3:0),mir=mat(0xeef3f6,.04,.8),F=Math.min(.03,w*.06),z=-d/2;
    if(v==='round'){cyl(g,.5,d,fr,0,h/2,0,{axis:'z',sx:w,sz:h,seg:56});cyl(g,.5,.004,mir,0,h/2,d/2,{axis:'z',sx:w-2*F,sz:h-2*F,seg:56});}
    else if(v==='arch'){const sh=(W,H)=>{const r=W/2,s=new THREE.Shape();s.moveTo(-r,0);s.lineTo(r,0);s.lineTo(r,H-r);s.absarc(0,H-r,r,0,Math.PI,false);s.lineTo(-r,0);return s;};
      const a=new THREE.Mesh(new THREE.ExtrudeGeometry(sh(w,h),{depth:d,bevelEnabled:false,curveSegments:32}),fr);a.position.z=z;a.castShadow=true;g.add(a);
      const b=new THREE.Mesh(new THREE.ExtrudeGeometry(sh(w-2*F,h-2*F),{depth:.004,bevelEnabled:false,curveSegments:32}),mir);b.position.set(0,F,d/2-.001);g.add(b);}
    else{part(g,w,h,d,fr,0,0,0,.004);part(g,w-2*F,h-2*F,.004,mir,0,F,d/2,.001);}
  },
  // ---------- kids' room ----------
  // Crib: posts, rails, dense bars along the long sides, solid headboards, mattress at 35 cm.
  crib(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.5),P=.045,Y=.32;
    for(const sx of [-1,1])for(const sz of [-1,1])part(g,P,h,P,m,sx*(w/2-P/2),0,sz*(d/2-P/2),.012);
    for(const sz of [-1,1]){part(g,w-P,.035,.035,m,0,h-.04,sz*(d/2-.0175),.01);part(g,w-P,.05,.03,m,0,Y-.03,sz*(d/2-.015),.008);
      const n=Math.max(6,Math.round((w-P*2)/.075));for(let i=0;i<n;i++){const x=-w/2+P+(i+.5)*(w-2*P)/n;cyl(g,.011,h-.04-Y-.02,m,x,Y+.02,sz*(d/2-.0175),{seg:10});}}
    for(const sx of [-1,1])part(g,.025,h-.1,d-2*P,m,sx*(w/2-.0175),.08,0,.01);
    part(g,w-.09,.1,d-.09,mat(0xf6f4ef,.85),0,Y,0,.03);part(g,(w-.1)*.5,.03,d-.1,mat(PASTEL[3],.9),(w-.1)*.22,Y+.1,0,.012);
  },
  // Bunk bed: posts, two beds with bedding, guard rails on top (in front — up to the ladder), ladder at the front right.
  bunkBed(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.55),P=.06,Y1=.2,Y2=Math.min(1.2,h-.42),L=-w/2+P,R=w/2-P;
    for(const sx of [-1,1])for(const sz of [-1,1])part(g,P,h,P,m,sx*(w/2-P/2),0,sz*(d/2-P/2),.012);
    for(const y of [Y1,Y2]){for(const sz of [-1,1])part(g,w-2*P,.14,.03,m,0,y,sz*(d/2-.015),.006);for(const sx of [-1,1])part(g,.03,.14,d-2*P,m,sx*(w/2-.015),y,0,.006);}
    bedding(g,L+.01,R-.01,-d/2+.04,d/2-.04,Y1+.08,0);bedding(g,L+.01,R-.01,-d/2+.04,d/2-.04,Y2+.08,3);
    for(const sx of [-1,1])part(g,.025,h-Y2-.14-.03,d-2*P,m,sx*(w/2-.0125),Y2+.14,0,.006); // upper bunk end panels
    for(const sx of [-1,1])part(g,.025,.5,d-2*P,m,sx*(w/2-.0125),Y1+.14,0,.006); // lower bunk end panels
    const gr=Y2+.34;part(g,w-2*P,.05,.03,m,0,gr,-d/2+.015,.008);const lx0=R-.42;part(g,lx0-L,.05,.03,m,(L+lx0)/2,gr,d/2-.015,.008);
    for(const x of [lx0,R-.02])part(g,.04,gr+.05,.035,m,x,0,d/2+.0,.008);for(let y=.3;y<gr;y+=.27)cyl(g,.014,R-.02-lx0,m,(lx0+R-.02)/2,y,d/2,{axis:'x',seg:12});
  },
  // Loft bed: the bed on top (bottom is “Above floor”), posts and a ladder to the floor; free space below fits a desk.
  loftBed(g,p){const {w,d,h,color}=p,c=COLORS[color][1],m=mat(c,.55),P=.06,Z=zOf(p),L=-w/2+P,R=w/2-P;
    for(const sx of [-1,1])for(const sz of [-1,1])part(g,P,Z+h,P,m,sx*(w/2-P/2),-Z,sz*(d/2-P/2),.012);
    for(const sz of [-1,1])part(g,w-2*P,.14,.03,m,0,0,sz*(d/2-.015),.006);for(const sx of [-1,1])part(g,.03,.14,d-2*P,m,sx*(w/2-.015),0,0,.006);
    bedding(g,L+.01,R-.01,-d/2+.04,d/2-.04,.08,1);
    for(const sx of [-1,1])part(g,.025,h-.14,d-2*P,m,sx*(w/2-.0125),.14,0,.006);
    part(g,w-2*P,.05,.03,m,0,h-.05,-d/2+.015,.008);const lx0=R-.42;part(g,lx0-L,.05,.03,m,(L+lx0)/2,h-.05,d/2-.015,.008);
    for(const x of [lx0,R-.02])part(g,.04,Z+h,.035,m,x,-Z,d/2,.008);for(let y=-Z+.3;y<h-.1;y+=.27)cyl(g,.014,R-.02-lx0,m,(lx0+R-.02)/2,y,d/2,{axis:'x',seg:12});
  },
  // Changing dresser: a dresser with drawers, rails and a soft pad on top.
  changer(g,p){const {w,d,h,color}=p,c=COLORS[color][1],m=mat(c,.55),T=.12;drawers(g,{...p,h:h-T},3);
    part(g,w,T,.02,m,0,h-T,-d/2+.01,.005);for(const s of [-1,1])part(g,.02,T,d-.02,m,s*(w/2-.01),h-T,.01,.005);
    part(g,Math.min(.72,w-.06),.06,d-.06,mat(PASTEL[1],.9),-(w-.06-Math.min(.72,w-.06))/2,h-T,.01,.028);
  },
  // High chair: splayed legs, seat, back, footrest, tray in front.
  highChair(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.5),S=.56,sw=.36,sd=.34,wh=mat(0xf7f6f2,.4);
    for(const sx of [-1,1])for(const sz of [-1,1])rod(g,[sx*(w/2-.03),0,sz*(d/2-.03)],[sx*(sw/2-.03),S,sz*(sd/2-.03)-.02],.016,m);
    rod(g,[-(w/2-.09),.24,d/2-.13],[w/2-.09,.24,d/2-.13],.014,m);
    part(g,sw,.035,sd,m,0,S,-.02,.01);part(g,sw-.04,.03,sd-.04,mat(PASTEL[2],.9),0,S+.035,-.02,.012);
    const bk=part(g,sw,h-S-.05,.03,m,0,S+.03,-.02-sd/2+.02,.01);bk.rotation.x=-.12;
    for(const s of [-1,1])part(g,.03,.16,sd-.06,m,s*(sw/2-.015),S+.035,0,.008);
    part(g,sw+.1,.025,.2,wh,0,S+.2,sd/2+.03,.01);part(g,sw+.1,.025,.02,wh,0,S+.225,sd/2+.12,.006);
  },
  // Toy storage: a frame, pastel bins in two or three rows (open at the top), a shelf on top.
  toyStorage(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.55),t=.018,n=Math.max(1,Math.round((w-2*t)/.42)),rows=Math.max(1,Math.round((h-.06)/.24)),bw=(w-2*t-(n-1)*t)/n,bh=(h-.04-t)/rows;
    for(const s of [-1,1])part(g,t,h,d,m,s*(w/2-t/2),0,0,.004);part(g,w,t,d,m,0,h-t,0,.004);part(g,w-2*t,t,d-.02,m,0,.03,0,.003);
    for(let i=1;i<n;i++)part(g,t,h-t-.03,d-.02,m,-w/2+t+i*(bw+t)-t/2,.03,0,.003);
    let k=0;for(let r=0;r<rows;r++)for(let i=0;i<n;i++){const x=-w/2+t+bw/2+i*(bw+t),y=.03+t+r*bh,bc=PASTEL[(k++)%PASTEL.length];
      part(g,bw-.02,bh-.03,d-.05,mat(bc,.6),x,y+.005,.01,.012);part(g,bw-.05,.004,d-.08,mat(shade(bc,.72),.7),x,y+bh-.025,.01,.002);}
  },
  // ---------- workspace ----------
  // Corner desk: L-shaped tabletop, supports at the corners, back panels.
  deskCorner(g,p){const {w,d,h,color}=p,c=COLORS[color][1],m=mat(c,.55),mt=mat(0x2d2f33,.45,.4),T=.03,{back:A,side:S}=lArms(p),L=-w/2,B=-d/2;
    part(g,w,T,A,m,0,h-T,B+A/2,.006);part(g,S,T,d-A,m,L+S/2,h-T,B+A+(d-A)/2,.006);
    for(const [x,z] of [[L+.04,B+.04],[w/2-.04,B+.04],[w/2-.04,B+A-.04],[L+.04,d/2-.04],[L+S-.04,d/2-.04]])part(g,.045,h-T,.045,mt,x,0,z,.006);
    part(g,w-.1,.28,.016,mat(shade(c,.9),.6),0,h-T-.28,B+.06,.003);part(g,.016,.28,d-.1,mat(shade(c,.9),.6),L+.06,h-T-.28,0,.003);
  },
  // Height-adjustable desk: two telescopic columns on feet, a crossbar, a control panel at the side of the tabletop.
  deskStanding(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.55),mt=mat(0x2d2f33,.4,.45),mt2=mat(0x3d3f44,.4,.45),T=.025,fH=.04;
    part(g,w,T,d,m,0,h-T,0,.008);
    for(const s of [-1,1]){const x=s*(w/2-.12);part(g,.07,fH,d-.05,mt,x,0,0,.012);const hh=h-T-.03-fH,lo=Math.min(.5,hh*.55);part(g,.07,lo,.05,mt,x,fH,0,.006);part(g,.06,hh-lo+.02,.042,mt2,x,fH+lo-.02,0,.006);
      part(g,.05,.03,d-.12,mt,x,h-T-.03,0,.006);}
    part(g,w-.3,.04,.05,mt,0,h-T-.06,-.02,.006);part(g,.12,.02,.04,mat(0x16171a,.3),w/2-.2,h-T-.02,d/2-.02,.006);
  },
  // Mobile pedestal: three drawers, on casters.
  pedestal(g,{w,d,h,color}){const c=COLORS[color][1],body=mat(shade(c,.88),.55),fr=mat(c,.5),mt=mat(0x2b2c2f,.4,.4);
    for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){const wh=new THREE.Mesh(new THREE.SphereGeometry(.022,12,10),mt);wh.position.set(sx*(w/2-.04),.022,sz*(d/2-.05));g.add(wh);}
    part(g,w,h-.045,d-.02,body,0,.045,-.01,.004);const hs=[.25,.25,.5];let y=.045+.004;for(const f of hs){const hh=(h-.053)*f-.004;part(g,w-.008,hh,.016,fr,0,y,d/2-.008,.003);part(g,Math.min(.2,w*.45),.01,.012,mt,0,y+hh-.035,d/2+.006,.004);y+=hh+.004;}
  },
  // Monitor: a thin screen with a bezel; on a stand — a base, on an arm — a clamp at the rear edge of the desk and the arm.
  monitor(g,{w,d,h,v}){const bd=mat(0x1b1c1f,.35),sc=mat(0x07080b,.1),mt=mat(0x2b2c2f,.35,.5),sh=h*.72,sy=h-sh,zs=d/2-.02;
    part(g,w,sh,.018,bd,0,sy,zs,.006);part(g,w-.016,sh-.016,.003,sc,0,sy+.008,zs+.009,.001);part(g,w*.4,sh*.5,.025,bd,0,sy+sh*.25,zs-.02,.01);
    if(v==='arm'){part(g,.05,.12,.06,mt,0,-.06,-d/2+.03,.008);cyl(g,.015,sy+.06,mt,0,0,-d/2+.03,{seg:12});rod(g,[0,sy,-d/2+.03],[0,sy+sh*.4,zs-.035],.014,mt);}
    else{part(g,.24,.012,Math.min(.18,d-.01),mt,0,0,0,.004);const q=part(g,.04,sy+sh*.4,.025,mt,0,0,-.02,.006);q.rotation.x=.08;}
  },
  // ---------- laundry ----------
  // Laundry basket: woven walls (ribs), a lid with a handle.
  laundryBasket(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.9),dk=mat(shade(c,.8),.95);
    part(g,w-.02,h-.04,d-.02,m,0,0,0,.03);
    for(const z of [-1,1])for(let x=-w/2+.04;x<w/2-.02;x+=.04)part(g,.012,h-.06,.006,dk,x,.02,z*(d/2-.008),.003);
    for(const x of [-1,1])for(let z=-d/2+.04;z<d/2-.02;z+=.04)part(g,.006,h-.06,.012,dk,x*(w/2-.008),.02,z,.003);
    part(g,w,.035,d,m,0,h-.04,0,.015);part(g,w*.3,.025,.03,dk,0,h-.005,0,.01);
  },
  // Drying rack: unfolded — a center and two wings on crossed legs; folded — a flat frame.
  dryingRack(g,{w,d,h,v,color='white'}){const m=color==='chrome'?CHROME():mat(0xf2f2f0,.4),r=.006,t=.01;
    if(v==='folded'){for(const s of [-1,1])cyl(g,t,h,m,s*(w/2-.02),0,0,{seg:10});for(let y=.1;y<h-.05;y+=.06)cyl(g,r,w-.04,m,0,y,0,{axis:'x',seg:8});return;}
    const cw=w*.5,y=h-.02;for(const s of [-1,1]){rod(g,[s*cw/2,y,-d/2+.02],[s*cw/2,y,d/2-.02],t,m);rod(g,[s*cw/2,y,-d/2+.02],[s*(w/2-.02),y-.25,-d/2+.02],t,m);rod(g,[s*cw/2,y,d/2-.02],[s*(w/2-.02),y-.25,d/2-.02],t,m);
      for(const z of [-1,1])rod(g,[s*(cw/2-.04),0,z*(d/2-.02)],[s*(cw/2-.04),y,-z*(d/2-.02)],t,m);}
    for(let z=-d/2+.05;z<d/2-.03;z+=.055)cyl(g,r,cw,m,0,y,z,{axis:'x',seg:8});
    for(const s of [-1,1])for(let k=.06;k<1;k+=.16){const x=s*(cw/2+(w/2-.02-cw/2)*k),yy=y-.25*k;cyl(g,r,d-.04,m,x,yy,0,{axis:'z',seg:8});}
  },
  // Ironing board: a board with a nose on X-legs and an iron rest; folded — stands upright against the wall.
  ironingBoard(g,{w,d,h,v,color}){const cv=mat(COLORS[color][1],.95),mt=mat(0xc9ccd0,.3,.6),T=.025;
    const shape=(L,W)=>{const s=new THREE.Shape(),r=W/2;s.moveTo(-L/2,-r);s.lineTo(L/2-W*1.2,-r);s.quadraticCurveTo(L/2,-r*.6,L/2,0);s.quadraticCurveTo(L/2,r*.6,L/2-W*1.2,r);s.lineTo(-L/2,r);s.lineTo(-L/2,-r);return s;};
    if(v==='folded'){const b=new THREE.Mesh(new THREE.ExtrudeGeometry(shape(h,w),{depth:T,bevelEnabled:false,curveSegments:20}),cv);b.rotation.z=Math.PI/2;b.position.set(0,h/2,-d/2+.01);b.castShadow=true;g.add(b);
      for(const s of [-1,1])rod(g,[s*.1,.02,d/2-.02],[-s*.1,h-.2,d/2-.02],.01,mt);return;}
    const b=new THREE.Mesh(new THREE.ExtrudeGeometry(shape(w-.02,d),{depth:T,bevelEnabled:false,curveSegments:20}),cv);b.rotation.x=-Math.PI/2;b.position.set(0,h-T,0);b.castShadow=true;g.add(b);
    for(const s of [-1,1]){rod(g,[-w*.3,0,s*(d/2-.02)],[w*.16,h-T,s*(d/2-.1)],.011,mt);rod(g,[w*.16,0,s*(d/2-.02)],[-w*.3,h-T,s*(d/2-.1)],.011,mt);}cyl(g,.01,d-.04,mt,-w*.3,.012,0,{axis:'z',seg:10});cyl(g,.01,d-.04,mt,w*.16,.012,0,{axis:'z',seg:10});
    part(g,.14,.008,d*.8,mt,-w/2+.07,h-T-.01,0,.003);
  },
  // Robot vacuum with a dock: the dock at the wall, a round robot with a bumper and a top sensor in front of it.
  robotVacuum(g,{w,d,h,color}){const c=color==='black'?0x2a2b2e:0xf3f3f1,m=mat(c,.3),dk=mat(0x1d1e21,.4),bh=Math.max(.1,h),r=Math.min(w/2,(d-.12)/2)-.005;
    part(g,Math.min(w,.3),bh,.12,m,0,0,-d/2+.06,.02);part(g,Math.min(w,.3)-.04,.025,.004,dk,0,bh*.55,-d/2+.122,.003);
    const z=d/2-r-.005;cyl(g,r,.08,m,0,.01,z,{seg:40});cyl(g,r+.003,.03,dk,0,.012,z,{seg:40});cyl(g,.04,.018,dk,0,.09,z-r*.3,{seg:24});
  },
  // ---------- storage ----------
  // Corner wardrobe: L-shaped, doors on the inner sides.
  wardrobeCorner(g,p){const {w,d,h,color}=p,c=COLORS[color][1],body=mat(shade(c,.82)),front=mat(c,.55),mt=mat(0x3c3e42,.4),{back:A,side:S}=lArms(p),L=-w/2,B=-d/2,P=.06,gap=.004;
    part(g,w,h-P,A-.02,body,0,P,B+(A-.02)/2,.004);part(g,S-.02,h-P,d-A+.02,body,L+(S-.02)/2,P,B+A-.02+(d-A+.02)/2,.004);
    part(g,w-.04,P,A-.05,mat(shade(c,.6)),0,0,B+(A-.05)/2,.002);part(g,S-.05,P,d-A,mat(shade(c,.6)),L+(S-.05)/2,0,B+A+(d-A)/2-.02,.002);
    const lb=w/2-(L+S-.02),n=Math.max(1,Math.round(lb/.5)),dw=(lb-gap*(n+1))/n;
    for(let i=0;i<n;i++){const x=L+S-.02+gap+dw/2+i*(dw+gap);part(g,dw,h-P-2*gap,.018,front,x,P+gap,B+A-.011,.003);part(g,.012,Math.min(.35,h*.2),.02,mt,x-dw/2+.04,h*.42,B+A+.008,.005);}
    const ls=d/2-(B+A-.02),m2=Math.max(1,Math.round(ls/.5)),dl=(ls-gap*(m2+1))/m2;
    for(let i=0;i<m2;i++){const z=B+A-.02+gap+dl/2+i*(dl+gap);part(g,.018,h-P-2*gap,dl,front,L+S-.011,P+gap,z,.003);part(g,.02,Math.min(.35,h*.2),.012,mt,L+S+.008,h*.42,z+dl/2-.04,.005);}
  },
  // Walk-in closet section: side panels, a shelf on top, a rail with clothes on hangers, a shoe shelf at the bottom.
  openWardrobe(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.55),t=.02,ch=CHROME();
    for(const s of [-1,1])part(g,t,h,d,m,s*(w/2-t/2),0,0,.004);part(g,w-2*t,t,d,m,0,h-.3,0,.003);part(g,w-2*t,t,d,m,0,h-t,0,.003);part(g,w-2*t,t,d,m,0,.12,0,.003);
    const ry=h-.36;cyl(g,.012,w-2*t,ch,0,ry,0,{axis:'x',seg:12});
    clothes(g,-w/2+t+.05,w/2-t-.05,ry,d-.12);
    for(let i=0;i<Math.floor((w-2*t)/.3);i++){const sx=-w/2+t+.15+i*.3;part(g,.1,.09,.26,mat(i%2?0x2b2c2f:0xa58a6a,.6),sx-.03,.14,0,.03);part(g,.1,.09,.26,mat(i%2?0x2b2c2f:0xa58a6a,.6),sx+.07,.14,0,.03);}
  },
  // Utility cabinet: tall, doors with ventilation slots (a vacuum and mops inside).
  utilityCabinet(g,{w,d,h,color}){const c=COLORS[color][1],body=mat(shade(c,.82)),front=mat(c,.55),dk=mat(shade(c,.6),.6),mt=mat(0x3c3e42,.4),n=w>.75?2:1,gap=.004,dw=(w-gap*(n+1))/n;
    part(g,w-.04,.06,d-.05,mat(shade(c,.6)),0,0,-.02,.002);part(g,w,h-.06,d-.02,body,0,.06,-.01,.004);
    for(let i=0;i<n;i++){const x=-w/2+gap+dw/2+i*(dw+gap);part(g,dw,h-.068,.018,front,x,.064,d/2-.009,.003);
      for(const y0 of [.18,h-.35])for(let k=0;k<6;k++)part(g,dw*.6,.008,.004,dk,x,y0+k*.025,d/2+.001,.002);
      part(g,.012,.3,.02,mt,x+(i%2?-1:1)*(dw/2-.04),h*.45,d/2+.01,.005);}
  },
  // Display cabinet: carcass, glass doors, shelves with dishes.
  displayCabinet(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.5),t=.022,plate=mat(0xf6f4ef,.25),gl=mat(0xdfe8ec,.1);
    part(g,w,.08,d-.03,mat(shade(c,.7)),0,0,-.01,.003);for(const s of [-1,1])part(g,t,h-.08,d,m,s*(w/2-t/2),.08,0,.004);part(g,w,t,d,m,0,h-t,0,.004);part(g,w-2*t,h-.1,.008,mat(shade(c,.62)),0,.08,-d/2+.004,.002);
    const n=Math.max(3,Math.round((h-.1)/.38));for(let i=0;i<n;i++){const y=.08+i*(h-.1)/n;if(i)glass(part(g,w-2*t,.012,d-.03,GLASS,0,y,0,.002));else part(g,w-2*t,.015,d-.03,m,0,y,0,.002);
      if(i){for(let x=-w/2+t+.08;x<w/2-t-.06;x+=.13){cyl(g,.06,.012,plate,x,y+.015,-.02,{seg:24});cyl(g,.035,.09,i%2?gl:plate,x+.05,y+.015,.06,{rb:.03,seg:16});}}}
    const dn=w>.9?2:1,dw=(w-.01)/dn;for(let i=0;i<dn;i++){const x=-w/2+.005+dw*(i+.5);glass(part(g,dw-.006,h-.12,.006,GLASS,x,.09,d/2-.004,.002));
      for(const s of [-1,1])part(g,.025,h-.12,.02,m,x+s*(dw/2-.0155),.09,d/2-.01,.003);part(g,dw-.006,.025,.02,m,x,.09,d/2-.01,.003);part(g,dw-.006,.025,.02,m,x,h-.055,d/2-.01,.003);}
  },
  // Sideboard: on legs, a row of doors, thin handles.
  sideboard(g,p){const {w,d,h,color}=p,c=COLORS[color][1],m=mat(c,.5),body=mat(shade(c,.85),.55),mt=mat(0x2b2c2f,.4,.4),L=zOf(p)>0?0:.16,n=Math.max(2,Math.round(w/.42)),gap=.004,dw=(w-gap*(n+1))/n;
    if(L)for(const sx of [-1,1])for(const sz of [-1,1])rod(g,[sx*(w/2-.06),0,sz*(d/2-.06)],[sx*(w/2-.08),L,sz*(d/2-.08)],.014,m);
    part(g,w,h-L,d-.02,body,0,L,-.01,.008);part(g,w,.022,d,m,0,h-.022,0,.006);
    for(let i=0;i<n;i++){const x=-w/2+gap+dw/2+i*(dw+gap);part(g,dw,h-L-.03,.016,m,x,L+.004,d/2-.008,.003);part(g,.01,.12,.012,mt,x+(i%2?-1:1)*(dw/2-.035),L+(h-L)*.45,d/2+.006,.004);}
  },
  // Coat stand: round base, a pole, hooks in a circle at the top.
  coatStand(g,{w,d,h,color}){const c=color==='black'?mat(0x27282b,.4,.3):mat(COLORS[color][1],.5),r=Math.min(w,d)/2;
    cyl(g,r*.75,.03,c,0,0,0,{rb:r*.8,seg:36});cyl(g,.018,h-.03,c,0,.03,0,{seg:14});const b=new THREE.Mesh(new THREE.SphereGeometry(.03,16,12),c);b.position.set(0,h,0);g.add(b);
    for(let i=0;i<6;i++){const a=i*Math.PI/3,y=h-.08-(i%2)*.12;rod(g,[0,y-.03,0],[Math.cos(a)*r*.55,y+.06,Math.sin(a)*r*.55],.009,c,8);const k=new THREE.Mesh(new THREE.SphereGeometry(.014,10,8),c);k.position.set(Math.cos(a)*r*.55,y+.06,Math.sin(a)*r*.55);g.add(k);}
  },
  // ---------- second batch: living room and bedroom ----------
  // U-shaped sofa: a full-width back, two chaises at the sides, seats in the middle.
  sofaU(g,p){const {w,d,h,color}=p,M=softMats(color),{leg,base,back}=SOFA,{back:B,side:S}=lArms(p),A=Math.min(.2,w*.06),AH=Math.min(.64,h-.08),L=-w/2,R=w/2,Z=-d/2,k=.07;
    sofaLegs(g,M,[[L+k,Z+k],[R-k,Z+k],[L+k,d/2-k],[L+S-k,d/2-k],[R-k,d/2-k],[R-S+k,d/2-k],[0,Z+k],[0,Z+B-k]]);
    part(g,w,base,B,M.frame,0,leg,Z+B/2,.03);
    for(const s2 of [-1,1]){part(g,S,base,d-B,M.frame,s2*(w/2-S/2),leg,Z+B+(d-B)/2,.03);part(g,A,AH-leg,d,M.fab,s2*(w/2-A/2),leg,0,.075);
      part(g,S-A-.012,SOFA.seat,d-back-.008,M.cush,s2*(w/2-A-(S-A)/2),leg+base,(Z+back+d/2)/2,.055);}
    part(g,w-2*A,h-leg-.04,back,M.frame,0,leg,Z+back/2,.06);seatRow(g,M,L+S,R-S,Z+back,Z+B);backRow(g,M,L+A,R-A,Z+back,h);
    pillow(g,M.pil,L+A+.27,Z+back+.27,.25);pillow(g,M.pil2,R-A-.27,Z+back+.27,-.25);pillow(g,M.pil2,.35,Z+back+.27,.05);
  },
  // Side table: round on a pedestal or C-shaped (the base slides under the sofa, the top sits over the seat).
  sideTable(g,{w,d,h,color,v}){const m=sideM(color),mt=mat(0x2b2c2f,.4,.5),T=.022;
    if(v==='c'){part(g,w,.018,d,mt,0,0,0,.006);part(g,w*.5,h-T,.022,mt,0,0,-d/2+.011,.006);part(g,w,T,d,m,0,h-T,0,.008);}
    else{cyl(g,.5,T,m,0,h-T,0,{sx:w,sz:d,seg:44});cyl(g,.014,h-T,mt,0,0,0,{seg:12});cyl(g,.5,.012,mt,0,0,0,{sx:w*.6,sz:d*.6,seg:36});}
  },
  // Dressing table: a tabletop on legs with a drawer, a mirror above it, small items on the table.
  dressingTable(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.5),body=mat(shade(c,.9),.55),gold=mat(0xc9ad7c,.3,.7),mir=mat(0xeef3f6,.04,.8),H=.76,T=.025;
    for(const sx of [-1,1])for(const sz of [-1,1])cyl(g,.018,H-.14,m,sx*(w/2-.05),0,sz*(d/2-.05),{rb:.012,seg:12});
    part(g,w,.12,d,body,0,H-.14,0,.006);part(g,w*.5,.09,.016,m,0,H-.125,d/2,.003);cyl(g,.012,.012,gold,0,H-.08,d/2+.012,{axis:'z',seg:12});part(g,w,T,d,m,0,H-T-.0,0,.006);
    const mw=Math.min(w*.7,.7),mh=h-H-.04;part(g,mw,mh,.025,m,0,H+.02,-d/2+.04,.012);part(g,mw-.05,mh-.05,.004,mir,0,H+.045,-d/2+.054,.002);
    cyl(g,.025,.11,mat(0xd8c3d0,.15),w*.3,H,.02,{seg:16});cyl(g,.012,.03,gold,w*.3,H+.11,.02,{seg:10});part(g,.14,.05,.1,mat(0xe8dccb,.6),-w*.3,H,.04,.01);
  },
  // Floor mirror: tall, framed, leaning against the wall at an angle.
  floorMirror(g,{w,d,h,color}){const fr=color==='chrome'?CHROME():mat(COLORS[color][1],.5,color==='black'?.3:0),mir=mat(0xeef3f6,.04,.8),F=.035,T=.03,run=Math.max(.05,d-.06),a=Math.atan2(run,h),L=Math.hypot(h,run);
    const q=new THREE.Group();q.position.set(0,0,d/2-.04);q.rotation.x=-a;g.add(q);part(q,w,L,T,fr,0,0,0,.008);part(q,w-2*F,L-2*F,.004,mir,0,F,T/2+.001,.001);
  },
  // Clothes rack: two uprights on feet, a rail with clothes, a bottom shelf with a box and shoes.
  clothesRack(g,{w,d,h,color}){const m=sideM(color),wd=mat(COLORS.oak[1],.55);
    for(const s2 of [-1,1]){cyl(g,.014,h,m,s2*(w/2-.03),0,0,{seg:12});cyl(g,.012,d,m,s2*(w/2-.03),.015,0,{axis:'z',seg:10});}
    cyl(g,.013,w-.04,m,0,h-.03,0,{axis:'x',seg:14});part(g,w-.08,.02,d-.1,wd,0,.2,0,.004);
    clothes(g,-w/2+.08,w/2-.08,h-.03,Math.min(.38,d-.05));part(g,.3,.16,.25,mat(0xe6dccb,.7),-w/2+.25,.22,0,.008);
    for(const x of [w/2-.32,w/2-.2])part(g,.1,.09,.27,mat(0x2b2c2f,.6),x,.22,0,.03);
  },
  // ---------- second batch: kitchen ----------
  // Kitchen island: fronts facing the kitchen (at the back), the countertop overhangs forward with bar stools beneath.
  kitchenIsland(g,p){const {w,d,h,color}=p,{P,T}=KB,ov=Math.min(.3,d*.32),bd=d-ov,q=new THREE.Group();q.rotation.y=Math.PI;q.position.z=-d/2+bd/2;g.add(q);
    const k=kitBase(q,{w,d:bd,h,color},{top:false});row(q,k,-w/2,w,k.y0+.003,k.y1-k.y0-.006);
    part(g,w,T,d,TOP(),0,h-T,0,.006);part(g,w,h-T-P,.018,mat(COLORS[color][1],.5),0,P,-d/2+bd-.009+.0,.003);
  },
  // Cooker: an oven with a handle, a knob panel, a glass top with burners or gas burners with grates on top.
  stove(g,{w,d,h,color,v}){const body=color==='white'?mat(0xf4f4f2,.32):finish(color),dk=mat(0x16171a,.12),ch=CHROME(),T=h-.06;
    part(g,w,T-.06,d,body,0,.06,0,.012);part(g,w-.03,.06,d-.05,mat(0x2a2c30,.6),0,0,-.015,.004);
    part(g,w-.04,.44,.016,mat(0x2a2c30,.3),0,.12,d/2,.006);part(g,w-.12,.3,.004,dk,0,.17,d/2+.009,.003);part(g,w*.72,.02,.024,METAL(),0,.58,d/2+.02,.006);
    part(g,w-.02,.08,.012,body,0,T-.09,d/2+.002,.004);for(let i=0;i<4;i++)cyl(g,.018,.02,ch,-w/2+.09+i*(w-.18)/3,T-.05,d/2+.012,{axis:'z',seg:16});
    if(v==='gas'){part(g,w,.012,d,mat(0x2b2c2f,.4,.4),0,T,0,.006);for(const [x,z] of [[-.14,-.13],[.14,-.13],[-.14,.12],[.14,.12]]){const X=x*w/.6,Z=z*d/.6;
        cyl(g,.05,.012,mat(0x3a3b3f,.5,.4),X,T+.012,Z,{seg:20});cyl(g,.03,.014,mat(0x1b1c1f,.4),X,T+.024,Z,{seg:16});
        for(const r of [0,1]){const b=part(g,.2,.012,.012,mat(0x18191b,.6),X,T+.04,Z,.003);b.rotation.y=r*Math.PI/2;}}}
    else{part(g,w-.01,.008,d-.01,dk,0,T,0,.003);for(const [x,z,r] of [[-.13,-.13,.09],[.13,-.13,.07],[-.13,.11,.07],[.13,.11,.09]]){const t=new THREE.Mesh(new THREE.TorusGeometry(r*w/.6,.003,6,40),mat(0x55585d,.35));t.rotation.x=Math.PI/2;t.position.set(x*w/.6,T+.008,z*d/.6);g.add(t);}}
  },
  // Microwave: body, a door with a dark window, a panel on the right.
  microwave(g,{w,d,h,color}){const body=color==='white'?mat(0xf4f4f2,.32):finish(color),dk=mat(0x0f1013,.1),pn=mat(0x2a2c30,.3);
    for(const sx of [-1,1])for(const sz of [-1,1])cyl(g,.012,.01,pn,sx*(w/2-.04),0,sz*(d/2-.04),{seg:10});
    part(g,w,h-.01,d,body,0,.01,0,.014);part(g,w*.72,h-.04,.012,body,-w*.13,.03,d/2,.006);part(g,w*.58,h-.1,.004,dk,-w*.15,.06,d/2+.007,.004);
    part(g,w*.2,h-.05,.006,pn,w/2-w*.12,.035,d/2+.002,.004);part(g,w*.12,.025,.003,glow(0x8fe0ff),w/2-w*.12,h-.075,d/2+.006,.002);cyl(g,.018,.015,CHROME(),w/2-w*.12,h*.38,d/2+.01,{axis:'z',seg:16});
  },
  // Pedal bin or a sorting unit of three colored containers.
  bin(g,{w,d,h,color,v}){const m=finish(color),dk=mat(0x2b2c2f,.45);
    if(v==='sort'){const n=3,bw=(w-.02)/n;for(let i=0;i<n;i++){const x=-w/2+.01+bw*(i+.5),c=BINC[i];part(g,bw-.012,h-.03,d,mat(c,.5),x,0,0,.02);part(g,bw-.012,.03,d,mat(shade(c,.78),.5),x,h-.03,0,.012);part(g,bw*.4,.014,.02,dk,x,h-.07,d/2+.006,.005);}}
    else{cyl(g,.5,h-.03,m,0,0,0,{sx:w,sz:d,rb:.47,seg:36});cyl(g,.5,.03,m,0,h-.03,0,{sx:w*1.02,sz:d*1.02,seg:36});part(g,.09,.016,.06,dk,0,.02,d/2+.02,.006);cyl(g,.5,.012,dk,0,0,0,{sx:w*.95,sz:d*.95,seg:36});}
  },
  // Extending table: a tabletop on legs with an apron; extended — longer, with a leaf in the middle.
  tableExt(g,{w,d,h,color,v}){const c=COLORS[color][1],m=mat(c,.55),lg=mat(shade(c,.85),.55),T=.035;
    part(g,w,T,d,m,0,h-T,0,.01);part(g,w-.14,.08,d-.14,lg,0,h-T-.08,0,.006);
    for(const sx of [-1,1])for(const sz of [-1,1])part(g,.06,h-T,.06,lg,sx*(w/2-.07),0,sz*(d/2-.07),.008);
    if(v==='long'){const lw=Math.min(.5,w*.26),dk=mat(shade(c,.6));for(const s2 of [-1,1])part(g,.004,.002,d-.004,dk,s2*lw/2,h-.001,0,.001);part(g,lw-.006,.001,d-.01,mat(shade(c,1.05),.55),0,h-.0005,0,.0004);}
  },
  // Drop-leaf wall table: a wall rail, the tabletop on brackets; folded — hangs down along the wall.
  tableFold(g,{w,d,h,color,v}){const c=COLORS[color][1],m=mat(c,.55),mt=mat(0x2b2c2f,.4,.5),T=.025;
    part(g,w,.06,.035,m,0,h-.06,-d/2+.0175,.004);
    if(v==='closed'){part(g,w,.56,T,m,0,h-.62,d/2-T/2,.006);return;}
    part(g,w,T,d,m,0,h-T,0,.008);for(const s2 of [-1,1])rod(g,[s2*(w/2-.08),h-.36,-d/2+.012],[s2*(w/2-.08),h-T,d*.18],.01,mt);
  },
  // Bar stool: base, column, foot ring, seat and a low back.
  barStool(g,{w,d,h,color}){const m=sideM(color),seat=mat(color==='black'?0x3a3b3f:0xd7cfc1,.9),r=Math.min(w,d)/2,S=Math.min(.82,h-.25);
    cyl(g,r*.82,.02,m,0,0,0,{seg:36});cyl(g,.024,S-.06,m,0,.02,0,{seg:16});const t=new THREE.Mesh(new THREE.TorusGeometry(r*.68,.01,8,40),m);t.rotation.x=Math.PI/2;t.position.y=.3;g.add(t);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3;rod(g,[0,.3,0],[Math.cos(a)*r*.68,.3,Math.sin(a)*r*.68],.008,m,8);}
    cyl(g,r*.95,.06,seat,0,S-.06,0,{seg:32});const bk=part(g,w*.72,h-S-.02,.03,seat,0,S,-r*.82,.014);bk.rotation.x=-.15;
  },
  // Stool: round on three legs with a ring, or square on four with aprons.
  stool(g,{w,d,h,color,v}){const c=COLORS[color][1],m=mat(c,.5),T=.035;
    if(v==='square'){part(g,w,T,d,m,0,h-T,0,.008);for(const sx of [-1,1])for(const sz of [-1,1])rod(g,[sx*(w/2-.03),0,sz*(d/2-.03)],[sx*(w/2-.06),h-T,sz*(d/2-.06)],.015,m);
      for(const s2 of [-1,1]){part(g,w-.1,.02,.02,m,0,.15,s2*(d/2-.045),.004);part(g,.02,.02,d-.1,m,s2*(w/2-.045),.15,0,.004);}}
    else{const r=Math.min(w,d)/2;cyl(g,r,T,m,0,h-T,0,{seg:32});for(let i=0;i<3;i++){const a=i*Math.PI*2/3+.5;rod(g,[Math.cos(a)*r*.92,0,Math.sin(a)*r*.92],[Math.cos(a)*r*.55,h-T,Math.sin(a)*r*.55],.015,m);}
      const t=new THREE.Mesh(new THREE.TorusGeometry(r*.8,.009,8,36),m);t.rotation.x=Math.PI/2;t.position.y=.17;g.add(t);}
  },
  // ---------- second batch: bathroom ----------
  // Freestanding bathtub: an oval tub (a revolved profile) or a rectangular one on feet; a floor-standing faucet at the end.
  bathFree(g,{w,d,h,v}){const cer=new THREE.MeshStandardMaterial({color:0xf6f5f0,roughness:.2,side:THREE.DoubleSide}),ch=CHROME(),bw=w-.16;
    if(v==='rect'){const t=.05,y0=.08;for(const sx of [-1,1])for(const sz of [-1,1])cyl(g,.022,y0,ch,sx*(bw/2-.08),0,sz*(d/2-.08),{seg:12});
      part(g,bw,.1,d,cer,-.08,y0,0,.03);for(const s2 of [-1,1]){part(g,bw,h-y0,t,cer,-.08,y0,s2*(d/2-t/2),.02);part(g,t,h-y0,d-2*t,cer,-.08+s2*(bw/2-t/2),y0,0,.02);}}
    else{const pr=[[0,.07],[.38,.07],[.45,.14],[.495,h-.02],[.5,h],[.47,h],[.44,h-.03],[.41,.2],[.33,.14],[0,.14]].map(([r,y])=>new THREE.Vector2(r,y));
      const b=new THREE.Mesh(new THREE.LatheGeometry(pr,64),cer);b.scale.set(bw,1,d);b.position.x=-.08;b.castShadow=b.receiveShadow=true;g.add(b);
      for(const sx of [-1,1])for(const sz of [-1,1])cyl(g,.03,.08,ch,-.08+sx*bw*.3,0,sz*d*.26,{rb:.02,seg:14});}
    const x=w/2-.05;cyl(g,.03,.02,ch,x,0,0);cyl(g,.014,h+.25,ch,x,.02,0,{seg:12});rod(g,[x,h+.27,0],[x-.16,h+.27,0],.013,ch);cyl(g,.012,.04,ch,x-.16,h+.23,0,{seg:10});part(g,.06,.012,.012,ch,x,h+.05,0,.004);
  },
  // Walk-in shower: tiles flush with the floor, a linear drain, a glass partition with a support bar, a rain shower head.
  walkIn(g,{w,d,h,color}){const m=finish(color),T=.02,pw=w*.62;
    part(g,w,T,d,mat(0xd6d4cf,.65),0,0,0,.004);part(g,w*.6,.004,.05,mat(0x9a9ea3,.3,.6),0,T,-d/2+.1,.002);
    glass(part(g,pw,h-T-.02,.008,GLASS,-w/2+pw/2+.01,T,d/2-.03,.002));part(g,.02,h-T-.02,.03,m,-w/2+.01,T,d/2-.03,.004);rod(g,[-w/2+pw,h-.05,d/2-.03],[-w/2+pw,h-.05,-d/2],.009,m);
    const hx=-w/2+pw*.55;rod(g,[hx,h-.1,-d/2],[hx,h-.1,-d/2+.35],.012,m);part(g,.26,.012,.26,m,hx,h-.12,-d/2+.42,.006);
    part(g,.16,.12,.05,m,hx,1.05,-d/2+.025,.012);cyl(g,.02,.18,m,hx+.22,1.15,-d/2+.04,{seg:12});
  },
  // Shower column: mixer, rail, an overhead shower on an arm, a hand shower in a holder.
  showerColumn(g,{w,d,h,color}){const m=finish(color),z=-d/2+.035;
    part(g,Math.min(.2,w),.07,.06,m,0,0,z+.005,.014);cyl(g,.03,.03,m,0,.035,z+.045,{axis:'z',seg:16});cyl(g,.013,h-.08,m,0,.07,z,{seg:12});
    rod(g,[0,h-.02,z],[0,h-.02,d/2-.13],.012,m);cyl(g,Math.min(.12,w/2),.014,m,0,h-.045,d/2-.13,{seg:32});
    const lh=rod(g,[.06,.45,z+.05],[.06,.62,z+.08],.016,m);part(g,.05,.03,.04,m,.03,.5,z+.02,.008);
  },
  // Bathroom tall cabinet: on legs or wall-hung; a door at the top, an open niche with towels, a door at the bottom.
  bathTall(g,{w,d,h,color,v}){const c=COLORS[color][1],body=mat(shade(c,.88),.55),fr=mat(c,.5),mt=CHROME(),L=v==='wall'?0:.1,H=h-L;
    if(L)for(const sx of [-1,1])for(const sz of [-1,1])cyl(g,.012,L,mt,sx*(w/2-.04),0,sz*(d/2-.04),{seg:10});
    part(g,w,H,d-.02,body,0,L,-.01,.004);const n0=L+H*.32,n1=L+H*.5;
    part(g,w-.008,n0-L-.008,.016,fr,0,L+.004,d/2-.008,.003);part(g,w-.008,h-n1-.008,.016,fr,0,n1+.004,d/2-.008,.003);
    part(g,w-.04,n1-n0-.01,.02,mat(shade(c,.6)),0,n0+.005,d/2-.03,.002);for(let i=0;i<3;i++)part(g,w*.7,.045,d*.7,mat(i%2?0xf3f1ec:PASTEL[1],.95),0,n0+.012+i*.046,0,.018); // stack of towels
    for(const y of [n0-.12,n1+.04])part(g,.012,.08,.012,mt,w/2-.04,y,d/2+.004,.004);
  },
  // Water heater: a round tank with domed ends or a flat one; a panel at the bottom, pipes to the faucets.
  waterHeater(g,{w,d,h,v}){const wh=mat(0xf4f4f2,.3),ch=CHROME(),dk=mat(0x2a2c30,.35);
    if(v==='flat'){part(g,w,h,d,wh,0,0,0,.06);part(g,w*.3,.05,.004,dk,0,h*.22,d/2+.001,.004);part(g,w*.06,.015,.003,glow(0x8fe0ff),0,h*.22+.017,d/2+.003,.002);}
    else{const r=Math.min(w,d)/2,k=r*.32;cyl(g,r,h-2*k,wh,0,k,0,{seg:40});for(const [y,up] of [[h-k,1],[k,-1]]){const sp=new THREE.Mesh(new THREE.SphereGeometry(r,40,16,0,Math.PI*2,up>0?0:Math.PI/2,Math.PI/2),wh);sp.scale.y=k/r;sp.position.y=y;sp.castShadow=true;g.add(sp);}
      part(g,r*.8,.06,.004,dk,0,k+.04,r-.004+.002,.004);}
    for(const s2 of [-1,1])cyl(g,.01,.28,ch,s2*.05,-.28,0,{seg:10});cyl(g,.016,.03,mat(0xc0392b,.5),.05,-.18,0,{axis:'z',seg:12});cyl(g,.016,.03,mat(0x2f6db5,.5),-.05,-.18,0,{axis:'z',seg:12});
  },
  // ---------- second batch: climate ----------
  // Air purifier: a rounded column, a grille on top, an indicator ring on the front.
  purifier(g,{w,d,h,color}){const c=color==='graphite'?0x57595e:0xf3f3f1,m=mat(c,.4),dk=mat(0x2b2d31,.5);
    part(g,w,h-.015,d,m,0,.015,0,Math.min(w,d)*.2);part(g,w-.02,.015,d-.02,dk,0,0,0,.01);
    cyl(g,Math.min(w,d)*.38,.006,dk,0,h-.004,0,{seg:36});for(let i=1;i<5;i++){const t=new THREE.Mesh(new THREE.TorusGeometry(Math.min(w,d)*.08*i,.002,4,40),m);t.rotation.x=Math.PI/2;t.position.y=h+.003;g.add(t);}
    const t=new THREE.Mesh(new THREE.TorusGeometry(.03,.004,8,32),glow(0x7fd9ff));t.position.set(0,h*.78,d/2+.002);g.add(t);
    for(let y=.08;y<h*.6;y+=.03)part(g,w*.6,.006,.003,mat(shade(c,.85),.5),0,y,d/2+.001,.002);
  },
  // Convector heater: a flat body, a grille on top, a slot at the bottom, a control unit on the right; on feet — for the floor.
  convector(g,p){const {w,d,h,v}=p,m=mat(0xf4f4f2,.35),dk=mat(0x3a3c40,.55),y0=v==='floor'?.12:0;
    if(y0)for(const s2 of [-1,1]){part(g,.04,y0,.04,m,s2*(w/2-.1),0,0,.008);part(g,.05,.02,Math.max(d,.24),m,s2*(w/2-.1),0,0,.008);}
    part(g,w,h-y0,d*.85,m,0,y0,-d*.075,.012);part(g,w-.02,h-y0-.02,.006,mat(0xfafaf8,.3),0,y0+.01,d/2-.075*d+d*.425-.003+.003,.004);
    for(let x=-w/2+.03;x<w/2-.03;x+=.02)part(g,.008,.003,d*.6,dk,x,h-.002,-d*.075,.001);part(g,w-.06,.012,d*.5,dk,0,y0-.004,-d*.075,.002);
    part(g,.1,.07,.012,mat(0xe9e9e6,.4),w/2-.08,h-.11,d/2-.01,.006);cyl(g,.015,.012,dk,w/2-.08,h-.075,d/2,{axis:'z',seg:14});
  },
  // Thermostat: a rounded square, a ring and a dark display with digits.
  thermostat(g,{w,d,h,color}){const m=color==='black'?mat(0x232427,.3):mat(0xf6f6f4,.3),r=Math.min(w,h);
    part(g,w,h,d,m,0,0,0,.012);const t=new THREE.Mesh(new THREE.TorusGeometry(r*.33,.0035,8,40),CHROME());t.position.set(0,h/2,d/2+.002);g.add(t);
    cyl(g,r*.28,.002,mat(0x101215,.1),0,h/2,d/2+.001,{axis:'z',seg:32});part(g,r*.22,r*.1,.002,glow(0xffa64d),0,h/2-r*.04,d/2+.003,.001);
  },
  // ---------- second batch: decor ----------
  // Rug: a darker border, lighter field and center; rectangular, round or oval. Furniture stands on top of it.
  rug(g,{w,d,h,color,v}){const c=COLORS[color][1],b=mat(shade(c,.78),.98),m=mat(c,.98),f2=mat(shade(c,1.12),.98);
    if(v==='rect'){part(g,w,h,d,b,0,0,0,.003);part(g,w-.12,.0015,d-.12,m,0,h,0,.0005);part(g,w-.4,.0015,d-.4,f2,0,h+.0015,0,.0005);
      for(const s2 of [-1,1])part(g,w-.5,.0015,.012,b,0,h+.003,s2*(d/2-.25),.0005);}
    else{const sx=v==='round'?Math.min(w,d):w,sz=v==='round'?Math.min(w,d):d;cyl(g,.5,h,b,0,0,0,{sx,sz,seg:72});cyl(g,.5,.0015,m,0,h,0,{sx:sx-.12,sz:sz-.12,seg:72});cyl(g,.5,.0015,f2,0,h+.0015,0,{sx:sx*.55,sz:sz*.55,seg:60});}
  },
  // Roller blind (lowered to two thirds), venetian blinds (slats) or “Day-night” (stripes); a cassette on top.
  // open (0…1) — for blinds from HA (D-048): how far raised; closed — all the way down, open — rolled into the cassette.
  blind(g,{w,d,h,color,v,open}){const c=COLORS[color][1],fab=new THREE.MeshStandardMaterial({color:c,roughness:.92,side:THREE.DoubleSide}),cas=mat(0xf2f2f0,.4),z=d/2-.02,top=h-.07,
    drop=open!=null?Math.max(.03,top*(1-Math.max(0,Math.min(1,open)))):top*.68;
    part(g,w,.07,d,cas,0,top,0,.012);
    if(v==='venetian'){const n=Math.max(4,Math.round(drop/.025));for(let i=0;i<n;i++){const q=part(g,w-.02,.002,.025,mat(c,.5),0,top-.02-i*drop/n,z,.0008);q.rotation.x=.5;}
      for(const s2 of [-.3,.3])cyl(g,.0015,drop,mat(0xdddddd,.8),s2*w,top-drop,z+.012,{seg:4});}
    else if(v==='daynight'){const n=Math.round(drop/.05);for(let i=0;i<n;i++){const op=i%2===0;const q=part(g,w-.02,.05,.003,op?fab:new THREE.MeshStandardMaterial({color:c,roughness:.9,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false}),0,top-(i+1)*.05,z,.0005);if(!op)q.castShadow=false;}}
    else part(g,w-.02,drop,.003,fab,0,top-drop,z,.0008);
    part(g,w-.02,.02,.012,cas,0,top-drop-.02,z,.004);
  },
  // ---------- third batch (P2) ----------
  // Recliner: an armchair; reclined — the footrest is extended (deeper forward), the back tilts slightly.
  recliner(g,p){const {w,d,h,color}=p,ext=extOf(p),df=d-ext,q=new THREE.Group();q.position.z=-ext/2;g.add(q);const A=Math.min(.18,w*.2);
    const M=sofaBody(q,{...p,d:df},{pillows:false,A});
    if(ext){part(g,w-2*A-.04,.12,ext-.04,M.cush,0,.3,d/2-ext/2+.0,.05);rod(g,[0,.12,-d/2+df-.1],[0,.3,d/2-ext/2],.02,mat(0x2b2c2f,.4,.4));}
  },
  // Daybed: a long seat on legs, a sloping headrest on the left (mirrored — on the right), a low back at the rear, a bolster.
  chaise(g,{w,d,h,color}){const M=softMats(color),{leg,base}=SOFA,k=.06;
    sofaLegs(g,M,[[-w/2+k,-d/2+k],[w/2-k,-d/2+k],[-w/2+k,d/2-k],[w/2-k,d/2-k]]);part(g,w,base,d,M.frame,0,leg,0,.03);part(g,w-.02,SOFA.seat,d-.02,M.cush,0,leg+base,0,.06);
    const hb=part(g,.2,h-seatTop+.12,d-.03,M.fab,-w/2+.14,seatTop-.12,0,.08);hb.rotation.z=.32;
    part(g,w*.5,.3,.12,M.fab,-w/2+w*.27,seatTop-.06,-d/2+.06,.05);cyl(g,.08,d-.12,M.pil2,-w/2+.34,seatTop+.05,0,{axis:'z',seg:24});
  },
  // Soundbar: an elongated body, a fabric grille in front, a status light.
  soundbar(g,{w,d,h,color}){const c=color==='white'?0xf2f2f0:color==='grey'?0x8d9095:0x232427,m=mat(c,.55);
    part(g,w,h,d,m,0,0,0,Math.min(.025,h/2-.002));part(g,w-.04,h*.7,.004,mat(shade(c,.8),.95),0,h*.15,d/2+.001,.002);part(g,.012,.004,.002,glow(0xffffff),w*.35,h*.55,d/2+.004,.001);
  },
  // Floor-standing speaker: a cabinet on spikes, a black baffle, a tweeter and two woofers.
  speaker(g,{w,d,h,color}){const body=color==='walnut'?mat(COLORS.walnut[1],.5):color==='white'?mat(0xf2f2f0,.4):mat(0x232427,.45),cone=mat(0x2b2c2f,.65),ring=mat(0x8a8d91,.3,.6),ft=mat(0x1b1c1e,.4);
    for(const sx of [-1,1])for(const sz of [-1,1])cyl(g,.012,.03,ft,sx*(w/2-.03),0,sz*(d/2-.03),{rb:.004,seg:10});
    part(g,w,h-.03,d,body,0,.03,0,.012);part(g,w-.012,h-.05,.006,ft,0,.04,d/2+.001,.004);
    const drv=(y,r)=>{cyl(g,r,.012,cone,0,y,d/2+.006,{axis:'z',seg:28});const t=new THREE.Mesh(new THREE.TorusGeometry(r,.006,8,32),ring);t.position.set(0,y,d/2+.01);g.add(t);cyl(g,r*.3,.01,ring,0,y,d/2+.01,{axis:'z',seg:16});};
    drv(h-.12,.025);const r=w*.34;drv(h*.55,r);drv(h*.55-2.3*r,r);
  },
  // Electric fireplace: a surround with a mantel, a dark firebox behind glass, logs and flames (glowing).
  fireplace(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.5),dk=mat(0x141416,.6),fw=w*.58,fh=h*.5,fy=.12,pd=d-.05;
    part(g,w,.045,d,m,0,h-.045,0,.008);for(const s2 of [-1,1])part(g,(w-fw)/2,h-.045,pd,m,s2*(w/2-(w-fw)/4),0,-.025,.006);
    part(g,fw,h-.045-fy-fh,pd,m,0,fy+fh,-.025,.004);part(g,fw,fy,pd,m,0,0,-.025,.004);
    part(g,fw,fh,.02,dk,0,fy,-d/2+.03,.002);for(const s2 of [-1,1])part(g,.02,fh,pd-.04,dk,s2*(fw/2-.01),fy,-.025,.002);part(g,fw,.01,pd-.04,dk,0,fy,-.025,.002);
    const lg=mat(0x5a3a26,.8);for(const [x,z,a] of [[-.08,0,.2],[.08,.02,-.25],[0,-.04,0]]){const q=cyl(g,.035,fw*.55,lg,x*fw,fy+.045,z,{axis:'x',seg:12});q.rotation.y=a;}
    const fl=glow(0xff8a3d),fl2=glow(0xffc46b);for(const [x,hh,m2] of [[-.12,.22,fl],[0,.3,fl2],[.12,.2,fl],[.06,.14,fl2]]){const q=new THREE.Mesh(new THREE.ConeGeometry(.045,hh*fh/.5,12),m2);q.position.set(x*fw,fy+.07+hh*fh/1,-.02);g.add(q);}
    glass(part(g,fw-.02,fh,.006,GLASS,0,fy,d/2-.04,.002));
  },
  // Murphy bed: folded — a tall cabinet with a front; unfolded — the bed is lowered forward out of the cabinet, legs flipped down.
  wallBed(g,{w,d,h,color,v}){const c=COLORS[color][1],body=mat(shade(c,.86)),fr=mat(c,.5),mt=mat(0x2b2c2f,.4,.4),C=.45,B=-d/2;
    for(const s2 of [-1,1])part(g,.025,h,C,body,s2*(w/2-.0125),0,B+C/2,.004);part(g,w-.05,.025,C,body,0,h-.025,B+C/2,.003);part(g,w-.05,h-.025,.015,mat(shade(c,.7)),0,0,B+.0075,.002);
    if(v==='open'){const L=d-C+.12,z0=B+C-.12,zc=z0+L/2;part(g,w-.06,.2,L,fr,0,.12,zc,.008);for(const s2 of [-1,1])part(g,.04,.12,.04,mt,s2*(w/2-.08),0,d/2-.05,.006);
      part(g,w-.1,.18,L-.06,mat(0xf3f1ec,.85),0,.32,zc,.04);part(g,w-.08,.05,(L-.06)*.62,mat(PASTEL[3],.9),0,.49,zc+(L-.06)*.19,.025);
      const n=w>1.2?2:1,pw=n>1?(w-.24)/2:w-.2;for(let i=0;i<n;i++)part(g,pw,.11,.34,mat(0xfaf8f4,.85),n>1?(i?1:-1)*(pw/2+.04):0,.5,z0+.25,.05);
      part(g,w-.06,.6,.04,body,0,h-.62,B+C-.05,.004);}
    else{const n=2,ph=(h-.03)/n;for(let i=0;i<n;i++)part(g,w-.056,ph-.006,.02,fr,0,.003+i*ph,B+C-.01,.003);part(g,w*.4,.02,.025,mt,0,h*.48,B+C+.012,.006);}
  },
  // Room divider: folding panels in a frame with fabric.
  screen(g,{w,d,h,color}){const wood=color==='oak'||color==='walnut',fab=wood?mat(0xece6da,.95):mat(COLORS[color][1],.95),fr=wood?mat(COLORS[color][1],.5):mat(0x8a6e4e,.5),n=w>1.2?4:3,dz=Math.max(.02,d-.05),sx=w/n,a=Math.atan2(dz,sx),pl=Math.hypot(dz,sx)-.01;
    for(let i=0;i<n;i++){const x=-w/2+sx*(i+.5),sg=i%2?-1:1,q=new THREE.Group();q.position.set(x,0,0);q.rotation.y=-sg*a;g.add(q);
      part(q,pl,h-.03,.022,fr,0,.03,0,.004);part(q,pl-.06,h-.15,.026,fab,0,.09,0,.002);for(const s2 of [-1,1])part(q,.03,.03,.06,fr,s2*(pl/2-.04),0,0,.006);}
  },
  // Kitchen trolley: three basket tiers on posts, casters, jars on top.
  kitchenCart(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.4,.15),dk=mat(0x2b2c2f,.4,.4),y0=.05;
    for(const sx of [-1,1])for(const sz of [-1,1]){cyl(g,.01,h-y0,m,sx*(w/2-.015),y0,sz*(d/2-.015),{seg:10});const wh=new THREE.Mesh(new THREE.SphereGeometry(.024,12,10),dk);wh.position.set(sx*(w/2-.03),.024,sz*(d/2-.03));g.add(wh);}
    for(const y of [y0+.04,y0+(h-y0)*.45,h-.09]){part(g,w-.02,.008,d-.02,m,0,y,0,.002);for(const s2 of [-1,1]){part(g,w-.02,.07,.004,m,0,y,s2*(d/2-.012),.001);part(g,.004,.07,d-.02,m,s2*(w/2-.012),y,0,.001);}}
    for(let i=0;i<3;i++)cyl(g,.035,.09,transp(0xdfe8ec,.55),-w/2+.08+i*.1,h-.082,0,{seg:16});
  },
  // Coffee machine: body, a group head with a spout, a drip tray with a cup, a display, a bean container on top.
  coffee(g,{w,d,h,color}){const body=color==='white'?mat(0xf4f4f2,.3):finish(color),ch=CHROME(),dk=mat(0x15161a,.3),zf=d*.35;
    part(g,w,h,d*.7,body,0,0,-d*.15,.02);part(g,w,h*.24,d*.3,body,0,h*.76,zf,.02);part(g,w,.02,d*.3,body,0,0,zf,.006);part(g,w*.82,.02,d*.28,ch,0,.02,zf,.004);
    cyl(g,.012,.04,ch,0,h*.76-.04,zf+.02,{seg:12});cyl(g,.03,.06,mat(0xf6f4ef,.3),0,.04,zf+.02,{rb:.025,seg:18});part(g,w*.55,.035,.004,dk,0,h*.85,d/2+.001,.004);
    cyl(g,w*.3,.05,transp(0x6b4a2e,.6,.2),0,h,-d*.2,{seg:24});
  },
  // Bidet: a bowl without a cistern, faucet at the back; floor-standing or wall-hung.
  bidet(g,{w,d,h,v}){const cer=CERAMIC(),ch=CHROME(),wall=v==='wall',back=wall?.12:.05,z0=-d/2+back,bl=d/2-z0,zc=(z0+d/2)/2;
    if(wall){part(g,w,h+.1,back,mat(0xdedbd5,.7),0,0,-d/2+back/2,.004);cyl(g,.5,.2,cer,0,h-.2,zc,{rb:.32,sx:w*.96,sz:bl});}
    else{cyl(g,.5,.2,cer,0,0,zc+.02,{sx:w*.55,sz:bl*.6});cyl(g,.5,h-.18,cer,0,.18,zc,{rb:.4,sx:w*.96,sz:bl});}
    cyl(g,.5,.004,mat(0xeceae4,.14),0,h,zc+.01,{sx:w*.76,sz:bl*.74});part(g,w*.8,.04,.08,cer,0,h-.04,z0+.04,.015);cyl(g,.014,.06,ch,0,h,z0+.04,{seg:12});cyl(g,.01,.06,ch,0,h+.055,z0+.07,{axis:'z',seg:10});
  },
  // PC tower: case, a glass side panel with lighting inside, a button on the front.
  pcTower(g,{w,d,h,color}){const c=color==='white'?0xf2f2f0:0x1e1f22,m=mat(c,.4,.2);
    for(const sz of [-1,1])part(g,w-.02,.02,.04,mat(0x111214,.5),0,0,sz*(d/2-.04),.006);part(g,w,h-.02,d,m,0,.02,0,.008);
    part(g,.004,h-.08,d-.08,transp(0x111214,.75,.05),w/2+.001,.05,0,.002);part(g,.003,.006,d-.12,glow(0x8a7dff),w/2-.004,h-.09,0,.001);part(g,.003,h-.16,.006,glow(0x5fd0ff),w/2-.004,.08,d/2-.08,.001);
    cyl(g,.01,.004,glow(0x9fe3ff),0,h-.04,d/2+.001,{axis:'z',seg:16});for(let y=.06;y<h*.6;y+=.02)part(g,w*.6,.004,.002,mat(shade(c,.75),.5),0,y,d/2+.001,.001);
  },
  // Printer / MFP: body, scanner lid, paper tray, output slot, panel.
  printer(g,{w,d,h,color}){const c=color==='black'?0x2a2b2e:0xf1f1ef,m=mat(c,.4),dk=mat(0x2a2c30,.4);
    part(g,w,h*.78,d,m,0,0,0,.015);part(g,w-.004,h*.22,d-.004,mat(shade(c,.94),.35),0,h*.78,0,.012);part(g,w-.02,.003,.002,dk,0,h*.78,d/2+.001,.001);
    part(g,w*.7,.022,.004,dk,0,h*.46,d/2+.001,.003);part(g,w*.55,.008,.1,m,0,h*.4,d/2-.05,.003);part(g,w*.5,.004,.12,mat(0xffffff,.8),0,h*.41,d/2-.06,.001);
    const pn=part(g,w*.28,.012,.07,dk,w*.28,h-.006,d/2-.045,.004);pn.rotation.x=.35;
  },
  // Playpen: posts, soft rails, mesh on the sides, a pad and toys.
  playpen(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.55),net=transp(0xf4f4f2,.45,.9),pad=mat(PASTEL[3],.9);
    for(const sx of [-1,1])for(const sz of [-1,1])cyl(g,.022,h,m,sx*(w/2-.025),0,sz*(d/2-.025),{seg:12});
    for(const sz of [-1,1]){cyl(g,.022,w-.05,m,0,h-.02,sz*(d/2-.025),{axis:'x',seg:12});part(g,w-.06,h-.08,.004,net,0,.05,sz*(d/2-.025),.001);}
    for(const sx of [-1,1]){cyl(g,.022,d-.05,m,sx*(w/2-.025),h-.02,0,{axis:'z',seg:12});part(g,.004,h-.08,d-.06,net,sx*(w/2-.025),.05,0,.001);}
    part(g,w-.06,.05,d-.06,pad,0,.01,0,.02);const b=new THREE.Mesh(new THREE.SphereGeometry(.06,20,14),mat(0xe96f4c,.5));b.position.set(-w*.2,.12,d*.1);g.add(b);
    for(let i=0;i<3;i++)part(g,.07,.07,.07,mat(PASTEL[i],.5),w*.15+i*.06,.06+(i===2?.07:0),-d*.15+(i===2?-.03:0),.01);
  },
  // Kids' play table: a rounded tabletop on colored legs, pencils.
  kidsTable(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.5),T=.025;part(g,w,T,d,m,0,h-T,0,.03);
    let i=0;for(const sx of [-1,1])for(const sz of [-1,1])cyl(g,.025,h-T,mat(PASTEL[i++],.55),sx*(w/2-.06),0,sz*(d/2-.06),{seg:16});
    for(let k=0;k<3;k++){const q=cyl(g,.005,.15,mat(ART[k],.5),-w*.15+k*.025,h+.005,.05,{axis:'x',seg:8});q.rotation.y=.3;}part(g,.2,.002,.28,mat(0xffffff,.8),w*.15,h,0,.001);
  },
  // Humidifier: base, a transparent water tank, a lid with a mist outlet, a puff of mist.
  humidifier(g,{w,d,h}){const wh=mat(0xf6f6f4,.3),r=Math.min(w,d)/2;
    cyl(g,r,h*.32,wh,0,0,0,{seg:36});cyl(g,r*.92,h*.5,transp(0xcfe6f2,.5),0,h*.32,0,{seg:36});cyl(g,r*.86,h*.36,transp(0x9fd0ea,.35),0,h*.33,0,{seg:32});
    cyl(g,r*.8,h*.12,wh,0,h*.82,0,{rb:r*.9,seg:32});cyl(g,.016,.03,mat(0x2b2c2f,.4),0,h*.94,0,{seg:12});part(g,.03,.006,.002,glow(0x7fd9ff),0,h*.16,r+.001,.001);
    for(const [y,s2] of [[.08,.05],[.15,.07],[.23,.06]]){const q=new THREE.Mesh(new THREE.SphereGeometry(s2,12,10),transp(0xffffff,.18,.9));q.position.set(.01,h+y,0);g.add(q);}
  },
  // Floor fan: base, pole, motor, a ring-and-spoke guard, blades.
  fan(g,{w,d,h,color}){const m=color==='black'?mat(0x232427,.4,.2):mat(0xf3f3f1,.4),cg=mat(color==='black'?0x2b2c2f:0xdedfdd,.35,.4),r=Math.min(w/2-.01,.2),hy=h-r-.01,z=.04;
    cyl(g,Math.min(w,d)*.42,.03,m,0,0,0,{seg:36});cyl(g,.015,hy-.05,m,0,.03,0,{seg:12});cyl(g,.06,.13,m,0,hy,-.04,{axis:'z',seg:24});
    for(const zz of [z+.04,z-.03]){const t=new THREE.Mesh(new THREE.TorusGeometry(r,.004,6,48),cg);t.position.set(0,hy,zz);g.add(t);}
    for(let i=0;i<16;i++){const a=i*Math.PI/8;rod(g,[0,hy,z+.045],[Math.cos(a)*r,hy+Math.sin(a)*r,z+.04],.0018,cg,4);}
    for(let i=0;i<3;i++){const b=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),transp(0xbfd8e6,.7,.3));b.scale.set(r*.42,r*.18,.008);const a=i*Math.PI*2/3;b.rotation.z=a;b.position.set(Math.cos(a)*r*.45,hy+Math.sin(a)*r*.45,z);g.add(b);}
    cyl(g,.03,.03,m,0,hy,z+.01,{axis:'z',seg:16});
  },
  // Picture: a frame, a mat and an abstract composition; poster — a thin frame, the print fills the whole area.
  picture(g,{w,d,h,color,v}){const fr=sideM(color),F=v==='poster'?.012:Math.min(.04,w*.07),T=d,k=Math.round(w*7+h*11)%ART.length,A=i=>mat(ART[(k+i)%ART.length],.7);
    part(g,w,h,T,fr,0,0,0,.003);const iw=w-2*F,ih=h-2*F,z=T/2+.001;
    if(v==='poster'){part(g,iw,ih,.002,A(4),0,F,z,.0005);part(g,iw,ih*.45,.002,A(1),0,F,z+.0005,.0005);cyl(g,Math.min(iw,ih)*.2,.002,A(0),iw*.15,F+ih*.62,z+.001,{axis:'z',seg:40});part(g,iw*.7,.01,.002,A(5),0,F+ih*.12,z+.001,.0005);}
    else{part(g,iw,ih,.003,mat(0xf6f4ef,.8),0,F,z,.0005);const aw=iw-.08,ah=ih-.08;part(g,aw,ah,.002,A(4),0,F+.04,z+.002,.0005);
      part(g,aw*.5,ah*.6,.002,A(1),-aw*.18,F+.04+ah*.1,z+.003,.0005);cyl(g,Math.min(aw,ah)*.18,.002,A(0),aw*.18,F+.04+ah*.7,z+.004,{axis:'z',seg:40});part(g,aw*.8,ah*.04,.002,A(2),0,F+.04+ah*.25,z+.005,.0005);}
  },
  // Aquarium on a stand: a stand with doors, a glass tank with water, substrate, plants, stones, fish, a lid with lighting.
  aquarium(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.5),ch=h*.55,th=h-ch-.06,dk=mat(shade(c,.7));
    part(g,w,ch,d,m,0,0,0,.006);for(const s2 of [-1,1])part(g,w/2-.012,ch-.06,.016,mat(shade(c,1.05),.5),s2*w/4,.03,d/2,.003);
    glass(part(g,w,th,d,GLASS,0,ch,0,.004));const wt=part(g,w-.02,th*.86,d-.02,transp(0x4fa3c7,.3,.05),0,ch+.01,0,.002);wt.castShadow=false;
    part(g,w-.02,.04,d-.02,mat(0xd8c49a,.95),0,ch+.005,0,.01);const pl=mat(0x4d7a43,.7),pl2=mat(0x6b9655,.7);
    for(let i=0;i<9;i++){const x=-w/2+.08+i*(w-.16)/8;for(let j=0;j<3;j++)leaf(g,j%2?pl:pl2,[x,ch+.04,-d/2+.08+(i%3)*.04],[(j-1)*.25,1,0],th*(.4+.35*((i*7+j)%3)/2),.012);}
    for(const [x,s2] of [[.2,.05],[-.1,.035],[.32,.03]]){const q=new THREE.Mesh(new THREE.SphereGeometry(s2,10,8),mat(0x8a8d91,.8));q.scale.y=.6;q.position.set(x*w,ch+.05,.05);g.add(q);}
    for(const [x,y,c2] of [[-.15,.45,0xff8a3d],[.1,.6,0xffc46b],[.25,.35,0xe96f4c]]){const f=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),mat(c2,.4));f.scale.set(.025,.012,.008);f.position.set(x*w,ch+th*y,.02);g.add(f);}
    part(g,w,.06,d,dk,0,h-.06,0,.006);part(g,w-.06,.006,d*.4,glow(0xe8f6ff),0,h-.064,0,.002);
  },
  // Cat tree: base, sisal-wrapped posts, shelves, a cubby with an entrance, a bed on top, a toy on a string.
  catTree(g,{w,d,h,color}){const fab=mat(COLORS[color][1],.95),sis=mat(0xcbb48a,.95),dk=mat(0x1b1c1e,.6);
    part(g,w,.05,d,fab,0,0,0,.015);const p1=[-w*.25,-d*.22],p2=[w*.24,d*.2],hm=h*.55;
    cyl(g,.045,hm-.05,sis,p1[0],.05,p1[1],{seg:18});cyl(g,.045,h-.12-.05,sis,p2[0],.05,p2[1],{seg:18});
    for(let y=.1;y<h-.15;y+=.05){for(const [px,pz,top] of [[...p1,hm],[...p2,h-.12]])if(y<top){const t=new THREE.Mesh(new THREE.TorusGeometry(.046,.004,4,24),mat(0xb9a175,.95));t.rotation.x=Math.PI/2;t.position.set(px,y,pz);g.add(t);}}
    part(g,w*.6,.03,d*.55,fab,p1[0]+w*.1,hm,p1[1]+d*.05,.01);cyl(g,Math.min(w,d)*.24,.035,fab,p2[0],h-.12,p2[1],{seg:28});const t=new THREE.Mesh(new THREE.TorusGeometry(Math.min(w,d)*.21,.03,8,28),fab);t.rotation.x=Math.PI/2;t.position.set(p2[0],h-.06,p2[1]);g.add(t);
    part(g,.3,.26,.3,fab,w*.18,.05,-d*.18,.04);cyl(g,.07,.004,dk,w*.18,.18,-d*.18+.151,{axis:'z',seg:20});
    cyl(g,.002,.2,mat(0xdddddd,.8),p1[0]+w*.3,hm-.2,p1[1]+d*.25,{seg:4});const b=new THREE.Mesh(new THREE.SphereGeometry(.025,12,10),mat(0xe96f4c,.5));b.position.set(p1[0]+w*.3,hm-.22,p1[1]+d*.25);g.add(b);
  },
  // Pet bed: a soft bolster and a cushion; round (an oval sized to fit) or rectangular with a low entrance at the front.
  petBed(g,{w,d,h,color,v}){const M=softMats(color);
    if(v==='rect'){part(g,w,h*.4,d,M.frame,0,0,0,.03);part(g,w,h*.6,.1,M.fab,0,h*.4,-d/2+.05,.04);for(const s2 of [-1,1])part(g,.1,h*.6,d-.1,M.fab,s2*(w/2-.05),h*.4,.05,.04);part(g,w-.2,h*.2,.08,M.fab,0,h*.4,d/2-.04,.03);part(g,w-.2,h*.25,d-.18,M.cush,0,h*.35,0,.05);}
    else{cyl(g,.5,h*.35,M.frame,0,0,0,{sx:w,sz:d,seg:40});const t=new THREE.Mesh(new THREE.TorusGeometry(.41,.09,12,40),M.fab);t.rotation.x=Math.PI/2;t.scale.set(w,d,h/.18*.7);t.position.y=h*.62;t.castShadow=true;g.add(t);cyl(g,.5,h*.25,M.cush,0,h*.3,0,{sx:w*.72,sz:d*.72,seg:40});}
  },
  // Wall bars: two uprights at the wall, rungs every 25 cm; with a pull-up bar — brackets forward and a bar.
  wallBars(g,{w,d,h,color,v}){const c=COLORS[color][1],m=mat(c,.5),mt=mat(0x2b2c2f,.4,.5),z=-d/2+.05;
    for(const s2 of [-1,1]){part(g,.045,h,.07,m,s2*(w/2-.0225),0,z,.008);for(const y of [.3,h-.3])part(g,.06,.06,.03,mt,s2*(w/2-.0225),y,-d/2+.015,.006);}
    for(let y=.2;y<h-.05;y+=.25)cyl(g,.016,w-.09,m,0,y,z,{axis:'x',seg:14});
    if(v!=='plain'){const y=h-.12;for(const s2 of [-1,1])rod(g,[s2*(w/2-.0225),y,z],[s2*(w/2-.0225),y,d/2-.04],.016,mt);cyl(g,.016,w-.02,mt,0,y,d/2-.04,{axis:'x',seg:14});
      for(const s2 of [-1,1])cyl(g,.022,.12,mat(0x1b1c1e,.8),s2*(w/2-.12),y,d/2-.04,{axis:'x',seg:12});}
  },
  // Custom item: a block with rounded edges or a cylinder (an oval sized to fit) — for anything not in the catalog.
  custom(g,{w,d,h,color,v}){const m=finish(color==='steel'?'steel':color);if(v==='cyl')cyl(g,.5,h,m,0,0,0,{sx:w,sz:d,seg:40});else part(g,w,h,d,m,0,0,0,Math.min(.015,w/4,d/4,h/4));},
  // ---------- house: utilities, garage, outdoors ----------
  // Boiler: wall-mounted — a body with a panel and pipes going down; floor-standing — a cabinet with a panel on top.
  gasBoiler(g,{w,d,h,v}){const wh=mat(0xf5f5f3,.3),dk=mat(0x2a2c30,.35),ch=CHROME(),cu=mat(0xb87333,.35,.6);
    part(g,w,h,d,wh,0,0,0,.03);part(g,w*.6,.06,.004,dk,0,v==='floor'?h-.12:h*.12,d/2+.001,.004);part(g,w*.12,.02,.003,glow(0x8fe0ff),0,v==='floor'?h-.1:h*.12+.02,d/2+.003,.002);
    if(v!=='floor')for(let i=0;i<4;i++){const x=-w/2+.08+i*(w-.16)/3;cyl(g,.011,.3,i===1?cu:ch,x,-.3,-d/2+.1,{seg:10});}
    else for(let y=.1;y<h*.5;y+=.03)part(g,w*.6,.006,.003,mat(0xdcdcd9,.5),0,y,d/2+.001,.002);
  },
  // Electrical panel: a cabinet, a door with a window showing the breakers.
  elPanel(g,{w,d,h,color}){const m=color==='grey'?mat(0xb9bcc0,.4,.3):mat(0xf3f3f1,.35),dk=mat(0x1d1f22,.4);
    part(g,w,h,d,m,0,0,0,.008);part(g,w-.02,h-.02,.006,mat(color==='grey'?0xc5c8cc:0xfafaf8,.3),0,.01,d/2+.002,.003);
    part(g,w*.75,h*.22,.004,transp(0x202226,.55,.05),0,h*.55,d/2+.006,.002);for(let i=0;i<Math.round(w*.75/.025);i++)part(g,.016,h*.12,.004,i%5===0?mat(0xd9483b,.5):mat(0xf2f2f0,.5),-w*.36+i*.025+.012,h*.6,d/2+.004,.001);
    cyl(g,.008,.01,dk,w/2-.04,h*.45,d/2+.008,{axis:'z',seg:10});
  },
  // Network rack: a frame, a glass door, a router, a switch and a NAS with status lights inside.
  netRack(g,{w,d,h,color}){const m=color==='white'?mat(0xf2f2f0,.4,.2):mat(0x1b1c1f,.45,.3),dv=mat(0x2a2c30,.4,.3),L=[glow(0x5fe08a),glow(0x5fb8ff),glow(0xffb35f)];
    part(g,w,h,d,m,0,0,0,.008);const n=Math.max(2,Math.floor((h-.12)/.09));
    for(let i=0;i<n;i++){const y=.06+i*(h-.12)/n,hh=Math.min(.07,(h-.12)/n-.015);part(g,w-.08,hh,d-.12,dv,0,y,-.02,.004);for(let k=0;k<6;k++)part(g,.008,.006,.003,L[(i+k)%3],-w/2+.08+k*.03,y+hh*.6,d/2-.058,.001);}
    glass(part(g,w-.04,h-.06,.005,transp(0x2a3038,.35,.05),0,.03,d/2+.001,.002));for(let y=h-.05;y>h-.2;y-=.02)part(g,w*.5,.004,.003,mat(0x3a3c40,.6),0,y,d/2+.004,.001);
  },
  // Car: body, a cabin with windows, wheels, headlights and taillights; crossover — taller.
  car(g,{w,d,h,color,v}){const c=COLORS[color][1],body=mat(c,.28,.35),gl=mat(0x1a1f26,.08,.4),tyre=mat(0x1b1c1e,.85),rim=mat(0xb7bbbf,.3,.7),suv=v==='suv',gc=suv?.2:.15,bh=suv?.62:.5,R=suv?.37:.33,cab=h-gc-bh;
    part(g,w,bh,d,body,0,gc,0,.12);box(g,frustum(w-.12,cab,d*.52,w-.34,d*(suv?.46:.34),suv?-d*.04:-d*.06),body,0,gc+bh,-d*.05);
    box(g,frustum(w-.1,cab-.06,d*.52+.02,w-.32,d*(suv?.46:.34)+.02,suv?-d*.04:-d*.06),gl,0,gc+bh+.015,-d*.05);
    for(const sx of [-1,1])for(const z of [d/2-d*.18,-d/2+d*.19]){cyl(g,R,.24,tyre,sx*(w/2-.12),R,z,{axis:'x',seg:28});cyl(g,R*.6,.245,rim,sx*(w/2-.12),R,z,{axis:'x',seg:20});}
    for(const sx of [-1,1]){part(g,.28,.07,.02,glow(0xf4f6ff),sx*(w/2-.22),gc+bh-.16,d/2-.005,.02);part(g,.3,.07,.02,glow(0xd9332b),sx*(w/2-.22),gc+bh-.14,-d/2+.005,.02);}
    part(g,w*.35,.12,.02,mat(0x1b1c1e,.6),0,gc+.12,d/2-.004,.02);
  },
  // Bicycle: spoked wheels, a “triangle” frame, handlebar, saddle.
  bicycle(g,{w,d,h,color}){const c=COLORS[color][1],fr=mat(c,.35,.3),dk=mat(0x1b1c1e,.7),sp=mat(0xb7bbbf,.3,.6),R=Math.min(.34,(h-.3)/2+.05),zf=d/2-R-.02,zb=-d/2+R+.02;
    for(const z of [zf,zb]){const t=new THREE.Mesh(new THREE.TorusGeometry(R,.022,10,40),dk);t.rotation.y=Math.PI/2;t.position.set(0,R,z);t.castShadow=true;g.add(t);cyl(g,.03,.06,sp,0,R,z,{axis:'x',seg:12});
      for(let i=0;i<8;i++){const a=i*Math.PI/4;rod(g,[0,R,z],[0,R+Math.sin(a)*R,z+Math.cos(a)*R],.002,sp,4);}}
    const bb=[0,R-.02,(zf+zb)/2-.05],seat=[0,h-.12,zb+.25],head=[0,h-.08,zf-.18];
    rod(g,[0,R,zb],bb,.014,fr);rod(g,bb,seat,.016,fr);rod(g,[0,R,zb],seat,.012,fr);rod(g,bb,head,.02,fr);rod(g,seat,head,.016,fr);rod(g,head,[0,R,zf],.016,fr);
    rod(g,head,[0,h,head[2]+.03],.014,fr);cyl(g,.012,Math.min(w,.6),dk,0,h,head[2]+.03,{axis:'x',seg:10});part(g,.12,.04,.26,dk,0,h-.1,zb+.22,.02);
  },
  // Workbench: a thick top, legs, a lower shelf, a vise and a toolbox.
  workbench(g,{w,d,h,color}){const c=COLORS[color][1],m=mat(c,.6),mt=mat(0x3d4f63,.45,.4),T=.05;
    part(g,w,T,d,m,0,h-T,0,.006);for(const sx of [-1,1])for(const sz of [-1,1])part(g,.06,h-T,.06,mt,sx*(w/2-.05),0,sz*(d/2-.05),.006);part(g,w-.1,.025,d-.1,m,0,.18,0,.004);
    part(g,.14,.08,.12,mt,w/2-.12,h,d/2-.08,.008);part(g,.4,.12,.2,mat(0xc0392b,.5,.2),-w/2+.3,h,-.05,.01);part(g,.5,.3,.3,mat(0x8a6e4e,.8),-w*.15,.205,-.05,.01);
  },
  // Chest freezer: body, a lid with a seam and a handle, feet.
  freezer(g,{w,d,h}){const wh=mat(0xf4f4f2,.32),dk=mat(0x2b2c2f,.5);for(const sx of [-1,1])for(const sz of [-1,1])part(g,.04,.03,.04,dk,sx*(w/2-.05),0,sz*(d/2-.05),.006);
    part(g,w,h-.11,d,wh,0,.03,0,.02);part(g,w+.004,.08,d+.004,mat(0xfafaf8,.3),0,h-.08,0,.02);part(g,w*.3,.02,.025,mat(0xb7bbbf,.3,.5),0,h-.07,d/2+.01,.006);part(g,.05,.012,.004,glow(0x7ee08a),w/2-.1,h-.12,d/2+.001,.002);},
  // Garden table: a metal frame, a slatted top (or a round one).
  patioTable(g,{w,d,h,color,v}){const fr=sideM(color==='oak'?'black':color),wd=mat(color==='oak'?COLORS.oak[1]:0x9a7a55,.7),T=.03;
    if(v==='round'){cyl(g,.5,T,wd,0,h-T,0,{sx:w,sz:d,seg:40});cyl(g,.02,h-T,fr,0,0,0,{seg:12});for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;rod(g,[0,.02,0],[Math.cos(a)*w*.35,.01,Math.sin(a)*d*.35],.014,fr);}return;}
    for(const sx of [-1,1])for(const sz of [-1,1])part(g,.04,h-T,.04,fr,sx*(w/2-.05),0,sz*(d/2-.05),.004);for(const sz of [-1,1])part(g,w-.06,.04,.03,fr,0,h-T-.04,sz*(d/2-.05),.004);
    const n=Math.max(4,Math.round(d/.09));for(let i=0;i<n;i++)part(g,w,T,d/n-.008,wd,0,h-T,-d/2+(i+.5)*d/n,.004);
  },
  // Garden chair: a frame with armrests, slatted seat and back.
  patioChair(g,{w,d,h,color}){const fr=sideM(color==='oak'?'black':color),wd=mat(color==='oak'?COLORS.oak[1]:0x9a7a55,.7),S=.44;
    for(const sx of [-1,1]){rod(g,[sx*(w/2-.03),0,d/2-.04],[sx*(w/2-.03),.66,d/2-.06],.014,fr);rod(g,[sx*(w/2-.03),0,-d/2+.04],[sx*(w/2-.03),h,-d/2+.1],.014,fr);rod(g,[sx*(w/2-.03),.66,d/2-.06],[sx*(w/2-.03),.66,-d/2+.12],.014,fr);}
    for(let i=0;i<5;i++)part(g,w-.06,.02,(d-.18)/5-.01,wd,0,S,d/2-.06-(i+.5)*(d-.18)/5,.004);for(let i=0;i<4;i++){const q=part(g,w-.06,.07,.02,wd,0,S+.08+i*.09,-d/2+.075+i*.007,.004);q.rotation.x=-.12;}
  },
  // Sun lounger: a frame on legs, a slatted bed, a raised backrest, wheels at the head end.
  sunLounger(g,{w,d,h,color}){const fr=sideM(color==='oak'?'oak':color==='graphite'?'black':'white'),sl=mat(color==='graphite'?0x3a3b3f:color==='oak'?COLORS.oak[1]:0xf2f2f0,.6),Y=.3,bl=d*.32;
    for(const sx of [-1,1]){part(g,.04,.04,d-.1,fr,sx*(w/2-.03),Y-.04,.05,.008);for(const z of [d/2-.08,-d/2+.3])part(g,.04,Y-.04,.04,fr,sx*(w/2-.03),0,z,.006);cyl(g,.05,.03,mat(0x2b2c2f,.6),sx*(w/2-.03),.05,-d/2+.06,{axis:'x',seg:16});}
    const n=Math.round((d-bl)/.06);for(let i=0;i<n;i++)part(g,w-.08,.02,.045,sl,0,Y,d/2-.05-i*.06,.004);
    const q=new THREE.Group();q.position.set(0,Y,-d/2+bl);q.rotation.x=.7;g.add(q);for(let i=0;i<Math.round(bl/.06);i++)part(q,w-.08,.02,.045,sl,0,0,-.03-i*.06,.004);
  },
  // Grill: a bowl and a dome lid, a handle, three legs, wheels, a lower shelf.
  grill(g,{w,d,h,color}){const m=color==='steel'?finish('steel'):mat(COLORS[color][1],.3,.3),dk=mat(0x1b1c1e,.6),r=Math.min(w,d)/2-.02,Y=h-r*.95;
    const b=new THREE.Mesh(new THREE.SphereGeometry(r,32,16,0,Math.PI*2,Math.PI/2,Math.PI/2),m);b.position.y=Y;b.castShadow=true;g.add(b);
    const l=new THREE.Mesh(new THREE.SphereGeometry(r*1.01,32,16,0,Math.PI*2,0,Math.PI/2.2),m);l.scale.y=.85;l.position.y=Y;l.castShadow=true;g.add(l);
    part(g,.16,.025,.03,dk,0,Y+r*.82,0,.01);for(let i=0;i<3;i++){const a=i*Math.PI*2/3+Math.PI/2;rod(g,[Math.cos(a)*r*.5,Y-r*.5,Math.sin(a)*r*.5],[Math.cos(a)*r*.95,0,Math.sin(a)*r*.95],.012,dk);}
    for(const s2 of [-1,1])cyl(g,.06,.03,dk,s2*r*.8,.06,-r*.4,{axis:'x',seg:16});cyl(g,r*.7,.01,mat(0x4a4b4f,.6,.4),0,h*.3,0,{seg:24});
  },
};

// The parts of one item are merged by material (and by shadow casting): dozens of meshes become a few, fewer draw calls
// (the owner: so it doesn't lag on weak devices). It looks the same. If merging fails, it stays as it was.
const ATTR=['position','normal','uv'];
function bake(inner){inner.updateMatrixWorld(true);const groups=new Map();
  inner.traverse(o=>{if(!o.isMesh)return;const k=o.material.uuid+(o.castShadow?'|s':'');if(!groups.has(k))groups.set(k,{m:o.material,cast:o.castShadow,list:[]});groups.get(k).list.push(o);});
  const out=new THREE.Group();
  for(const {m,cast,list} of groups.values()){
    const geos=list.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();for(const k of Object.keys(g.attributes))if(!ATTR.includes(k))g.deleteAttribute(k);
      if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));if(!g.attributes.normal)g.computeVertexNormals();g.clearGroups();g.applyMatrix4(o.matrixWorld);return g;});
    const merged=geos.length===1?geos[0]:mergeGeometries(geos,false);if(!merged){geos.forEach(x=>x.dispose());return inner;}
    if(geos.length>1)geos.forEach(x=>x.dispose());const mesh=new THREE.Mesh(merged,m);mesh.castShadow=cast;mesh.receiveShadow=true;out.add(mesh);}
  inner.traverse(o=>o.isMesh&&o.geometry.dispose());return out;}
// ---------- Kenney ----------
const kenney=new Map();
// models — {id: base64 .glb}; assembled by build.mjs from assets/kenney.
export async function loadKenney(models){
  const loader=new GLTFLoader();
  for(const c of CATALOG.filter(c=>c.kind==='kenney')){
    const buf=Uint8Array.from(atob(models[c.id]),ch=>ch.charCodeAt(0)).buffer;
    const scene=(await loader.parseAsync(buf,'')).scene;
    scene.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;
      // as in walls-from-json: no metalness and no gloss
      const ms=Array.isArray(o.material)?o.material:[o.material];o.material=ms.map(m=>{const k=m.clone();k.metalness=0;k.roughness=Math.max(k.roughness??1,.55);return k;});
      if(o.material.length===1)o.material=o.material[0];});
    scene.scale.setScalar(c.scale||2);
    const box=new THREE.Box3().setFromObject(scene),ctr=box.getCenter(new THREE.Vector3());
    const holder=new THREE.Group();scene.position.set(-ctr.x,-box.min.y,-ctr.z);holder.add(scene);
    c.w=+(box.max.x-box.min.x).toFixed(3);c.d=+(box.max.z-box.min.z).toFixed(3);c.h=+(box.max.y-box.min.y).toFixed(3);
    kenney.set(c.id,holder);
  }
}
// ---------- built-in wardrobe (runs.js) ----------
// The shape comes ready-made in the plan (item.geo, x/y — plan): the carcass is a prism along the outline, the plinth is recessed, doors run along the front
// of each wall. Each wall is its own part: 3D hides the one facing away from the camera, like tall furniture (userData.ry).
// Without a shape (catalog picture) — a straight w×d wardrobe at the wall.
const P3=(q,y)=>new THREE.Vector3(q[0],y,-q[1]);
function prism(g,mp,y0,y1,m){for(const P of mp||[]){const ring=r=>r.slice(0,-1).map(q=>new THREE.Vector2(q[0],q[1])),sh=new THREE.Shape(ring(P[0]));
    sh.holes=P.slice(1).map(h=>new THREE.Path(ring(h)));const geo=new THREE.ExtrudeGeometry(sh,{depth:y1-y0,bevelEnabled:false});
    geo.rotateX(-Math.PI/2);geo.translate(0,y0,0);const mesh=new THREE.Mesh(geo,m);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);}}
// panel along u: center at plan point q, width w, height h from y, thickness t
function slab(g,m,q,u,w,y,h,t){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,t),m);mesh.position.copy(P3(q,y+h/2));mesh.rotation.y=Math.atan2(u[1],u[0]);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);}
// fronts along the line a→b: doors ~step wide, handle — vertical at the edge (wardrobe), bar at the top or bottom (kitchen); y0…y1 — height
function runDoors(g,[a,b],u,n,{y0,y1,step,handle,front,metal}){const L=Math.hypot(b[0]-a[0],b[1]-a[1]),gap=.004,k=Math.max(1,Math.round(L/step)),dw=(L-gap*(k+1))/k,at=(s,z)=>[a[0]+u[0]*s+n[0]*z,a[1]+u[1]*s+n[1]*z];
  for(let i=0;i<k;i++){const c=gap+dw/2+i*(dw+gap);slab(g,front,at(c,.009),u,dw,y0+gap,y1-y0-2*gap,.018);
    if(handle==='side'){const sd=i%2?-1:1;slab(g,metal,at(c+sd*(dw/2-.04),.025),u,.012,Math.min(1,(y1-y0)*.42),Math.min(.35,(y1-y0)*.2),.02);}
    else slab(g,metal,at(c,.025),u,Math.min(.3,dw*.5),handle==='top'?y1-.07:y0+.042,.012,.018);}}
function runSliding(g,[a,b],u,n,{h,front,al}){const L=Math.hypot(b[0]-a[0],b[1]-a[1]),P=.06,at=(s,k)=>[a[0]+u[0]*s+n[0]*k,a[1]+u[1]*s+n[1]*k];
  const k=Math.max(1,Math.round(L/.9)),dw=(L-.02)/k+(k>1?.03:0);slab(g,al,at(L/2,.03),u,L,h-.03,.03,.06);slab(g,al,at(L/2,.03),u,L,P,.02,.06);
  for(let i=0;i<k;i++){const c=.01+(L-.02)*(i+.5)/k,z=i%2?.045:.015,w=Math.min(dw,L-.01);slab(g,front,at(c,z),u,w,P+.02,h-P-.05,.018);
    for(const sg of [-1,1])slab(g,al,at(c+sg*(w/2-.009),z),u,.018,P+.02,h-P-.05,.026);}}
// The look of each wall-run item: which layers (runs.js: body at depth d − layer) and what is on the front.
const RUN_LOOK={
  // built-in wardrobe: plinth recessed by 5 cm, full-depth carcass, sliding or hinged doors
  wardrobeRun(g,s,{h,v,M}){prism(g,s.layer[.05].body,0,.06,M.base);prism(g,s.body,.06,h,M.body);
    if(s.front){if(v==='sliding')runSliding(g,s.front,s.u,s.n,{h,front:M.front,al:M.al});else runDoors(g,s.front,s.u,s.n,{y0:.06,y1:h,step:.5,handle:'side',front:M.front,metal:M.metal});}},
  // kitchen base cabinets: dark plinth recessed by 9 cm, carcass by 5 cm, full-depth countertop, ~60 cm fronts with a bar handle at the top
  kitchenBase(g,s,{h,M}){const {P,T}=KB;prism(g,s.layer[.09].body,0,P,mat(0x2c2d30,.7));prism(g,s.layer[.05].body,P,h-T,M.body);prism(g,s.body,h-T,h,TOP());
    const f=s.layer[.05].front;if(f)runDoors(g,f,s.u,s.n,{y0:P,y1:h-T,step:.6,handle:'top',front:M.front,metal:METAL()});},
  // wall cabinets: carcass 2 cm shallower than the depth, ~60 cm fronts with a bar handle at the bottom
  kitchenWall(g,s,{h,M}){prism(g,s.layer[.02].body,0,h,M.body);const f=s.layer[.02].front;if(f)runDoors(g,f,s.u,s.n,{y0:0,y1:h,step:.6,handle:'bottom',front:M.front,metal:METAL()});},
};
function runObject(item,c){const color=item.color||c.color,col=COLORS[color][1],v=item.v||c.vars?.[0][0],h=item.h;
  // a counter-clockwise “room”: the wardrobe along the whole top wall (y = d/2), its front facing −y, toward the picture camera
  const w=item.w/2,d=item.d/2,geo=item.geo||runShape([[-w,-3],[w,-3],[w,d],[-w,d]],2*w+3+d,item.w,item.d);
  const M={front:mat(col,c.id==='wardrobeRun'?.55:.5),body:mat(shade(col,.82)),base:mat(shade(col,.6)),metal:mat(0x3c3e42,.4),al:mat(0xb8bcc0,.3,.6)};
  const out=new THREE.Group(),z=zOf(item);out.userData.parts=[];
  for(const s of geo?.sides||[]){const inner=new THREE.Group();RUN_LOOK[c.id](inner,s,{h,v,M});
    if(!inner.children.length)continue;const b=bake(inner);b.position.y=z;b.userData.ry=s.ry;out.add(b);out.userData.parts.push(b);}
  return out;}
export function makeObject(item){
  const c=byId(item.model);
  if(c.run)return runObject(item,c);
  if(c.kind==='kenney')return kenney.get(c.id).clone(true);
  // hanging items at their own height (f.z), left/right by mirroring across the width; parts merged by material
  const g=new THREE.Group(),inner=new THREE.Group();GEN[c.id](inner,{...item,color:item.color||c.color,v:item.v||c.vars?.[0][0]});
  const b=bake(inner);b.position.y=zOf(item);if(item.mx)b.scale.x=-1;g.add(b);return g;
}
// Pictures for the catalog: each item is rendered separately.
export function thumbnails(size=112){
  const r=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});r.setSize(size,size);r.setPixelRatio(1);
  r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x9c8268,1.6));const sun=new THREE.DirectionalLight(0xffffff,2.2);sun.position.set(2,4,3);scene.add(sun);
  const cam=new THREE.OrthographicCamera(-1,1,1,-1,.01,50);const out={};
  for(const c of CATALOG){
    const obj=makeObject({model:c.id,w:c.w,d:c.d,h:c.h,color:c.color||'oak'});scene.add(obj);
    const box=new THREE.Box3().setFromObject(obj),s=box.getSize(new THREE.Vector3()),ctr=box.getCenter(new THREE.Vector3());
    const R=Math.max(s.x,s.y,s.z)*.72;Object.assign(cam,{left:-R,right:R,top:R,bottom:-R});cam.updateProjectionMatrix();
    cam.position.copy(ctr).add(new THREE.Vector3(1.4,1.1,2).normalize().multiplyScalar(10));cam.lookAt(ctr);
    r.render(scene,cam);out[c.id]=r.domElement.toDataURL();scene.remove(obj);
  }
  r.dispose();return out;
}
