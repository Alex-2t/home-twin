// Placement rules for furniture and lights: snapping to walls, overlap checks. No three.js.
import {t} from '../i18n/i18n.js';
import {WALL,openingCoords,pointIn,centroid} from './geometry.js';
import {roomEdges,roomAt,uniqueName,SWING} from './plan.js';
import {byId,zOf,lArms,nameOf} from './catalog.js';
import {isRun,runGeo} from './runs.js';

export const GRID=.05;
const grid=v=>Math.round(v/GRID)*GRID;

// ---------- furniture ----------
// An item's axes on the plan: ax runs along its width, fz is where its front faces (0° is south).
export const axes=f=>{const t=f.rot*Math.PI/180;return [[Math.cos(t),Math.sin(t)],[Math.sin(t),-Math.cos(t)]];};
export function corners(f,shrink=0){const [ax,fz]=axes(f),w=f.w/2-shrink,d=f.d/2-shrink;
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>[f.x+ax[0]*w*i+fz[0]*d*j,f.y+ax[1]*w*i+fz[1]*d*j]);}
// The footprint on the plan is rectangles in the item's axes [x0,x1,z0,z1] (z points to the front): an L-shaped item has two, an arm along the back
// and one along the left side (mirrored: the right); the recess in front of a corner sofa is free, so a coffee table fits there.
export function footLocal(f){const L=lArms(f),W=f.w/2,D=f.d/2;if(!L)return [[-W,W,-D,D]];const s=f.mx?-1:1,{back,side,u}=L;
  const R=(x0,x1,z0,z1)=>s>0?[x0,x1,z0,z1]:[-x1,-x0,z0,z1];return [R(-W,W,-D,-D+back),R(-W,-W+side,-D+back,D),...(u?[R(W-side,W,-D+back,D)]:[])];} // u: U-shaped
const W2=(f,[ax,fz],x,z)=>[f.x+ax[0]*x+fz[0]*z,f.y+ax[1]*x+fz[1]*z];
export function footRects(f,shrink=0){const A=axes(f);return footLocal(f).map(([x0,x1,z0,z1])=>[[x0+shrink,z0+shrink],[x1-shrink,z0+shrink],[x1-shrink,z1-shrink],[x0+shrink,z1-shrink]].map(([x,z])=>W2(f,A,x,z)));}
// the polygon to draw and the front sides (for an L-shaped item, the inner corner)
// round on the plan (plant, vase, round table, round and oval rug): a circle or ellipse from width and depth, with no front
export const isRound=f=>{const c=byId(f.model),r=c?.round;return r===true||Array.isArray(r)&&r.includes(f.v||c.vars?.[0][0]);};
export function outline(f){if(isRound(f)){const [ax,fz]=axes(f);return {pts:Array.from({length:32},(_,i)=>{const t=i/32*Math.PI*2,x=Math.cos(t)*f.w/2,z=Math.sin(t)*f.d/2;
    return [f.x+ax[0]*x+fz[0]*z,f.y+ax[1]*x+fz[1]*z];}),front:[]};}
  const L=lArms(f);if(!L){const c=corners(f);return {pts:c,front:[c[2],c[3]]};}
  const A=axes(f),W=f.w/2,D=f.d/2,s=f.mx?-1:1,{back,side,u}=L;
  if(u){const q=[[-W,-D],[W,-D],[W,D],[W-side,D],[W-side,-D+back],[-W+side,-D+back],[-W+side,D],[-W,D]].map(([x,z])=>W2(f,A,x,z));return {pts:q,front:[q[3],q[4],q[5],q[6]]};}
  const q=[[-W,-D],[W,-D],[W,-D+back],[-W+side,-D+back],[-W+side,D],[-W,D]].map(([x,z])=>W2(f,A,x*s,z));
  return {pts:q,front:[q[2],q[3],q[4]]};}
export const inFoot=(f,p)=>{const [x,z]=localXY(f,p);return footLocal(f).some(([x0,x1,z0,z1])=>x>=x0&&x<=x1&&z>=z0&&z<=z1);};
export function localXY(f,p){const [ax,fz]=axes(f),dx=p[0]-f.x,dy=p[1]-f.y;return [dx*ax[0]+dy*ax[1],dx*fz[0]+dy*fz[1]];}

// Snapping to a wall: the nearest edge, the item stands with its back to it; near a corner, flush with the adjacent wall; near the middle of the wall,
// centered; next to a neighbor on this wall, flush with it or aligned with its edge (kitchen modules in a row, wall cabinets above base ones).
// snap: how close (m); the editor derives it from the zoom (the owner: when zoomed in, could not place an item off-center, it kept pulling into the corner).
// Returns {x,y,rot, wall, mid, edge, win}: wall to highlight the wall, mid is the midline of the wall or window, edge is the neighbor's edge,
// win is the window width if the item is centered on it.
export function snapToWall(plan,f,p,free,snap=.25){
  if(free)return {x:p[0],y:p[1],rot:f.rot};
  // how far from a wall the pull starts: usually 55 cm behind the back; a chair, table or rug (loose) only when almost touching
  let best=null;const reach=byId(f.model)?.loose?WALL.inner+.1:.55;
  for(const e of roomEdges(plan)){if(e.l<.3)continue;
    const along=(p[0]-e.a[0])*e.u[0]+(p[1]-e.a[1])*e.u[1],off=(p[0]-e.a[0])*e.n[0]+(p[1]-e.a[1])*e.n[1];
    if(along<-.1||along>e.l+.1||off<-.1||off>f.d/2+reach)continue;
    if(!best||off<best.off)best={...e,off,along};}
  if(!best)return {x:grid(p[0]),y:grid(p[1]),rot:f.rot};
  const {a,u,n,l}=best,rot=((Math.atan2(n[0],-n[1])*180/Math.PI)+360)%360,hw=f.w/2+.003;
  const lo=WALL.inner+hw,hi=l-WALL.inner-hw,c=l/2,pr=(q,v)=>(q[0]-a[0])*v[0]+(q[1]-a[1])*v[1];
  // neighbors along this wall: their corners projected onto the wall; flush left/right or with edges aligned
  const cand=[[lo],[hi],[c,'mid']];
  // windows in this wall: centered on the window (curtains, a radiator under the window, a desk by the window)
  for(const o of plan.openings||[]){if(o.kind!=='window')continue;const q=openingCoords(plan.rooms,o);if(!q)continue;
    const pa=pr(q.a,u),pb=pr(q.b,u);if(Math.abs(pr(q.a,n))>.35||Math.abs(pr(q.b,n))>.35||Math.max(pa,pb)<0||Math.min(pa,pb)>l)continue;cand.push([(pa+pb)/2,'win',Math.abs(pb-pa)]);}
  // a built-in wardrobe, by its rectangles along each wall: a cabinet stands flush against its end
  for(const g of plan.furniture||[]){if(g.id===f.id)continue;for(const cs of isRun(g)?runGeo(plan,g)?.sides.map(s=>s.box)||[]:[corners(g)]){const al=cs.map(q=>pr(q,u)),of=cs.map(q=>pr(q,n));
    if(Math.abs(Math.min(...of)-WALL.inner)>.03||Math.max(...al)<0||Math.min(...al)>l)continue;const g0=Math.min(...al),g1=Math.max(...al);
    cand.push([g0-hw,g0],[g1+hw,g1],[g0+hw,g0],[g1-hw,g1]);}}
  let s=hi<lo?c:Math.max(lo,Math.min(hi,best.along)),hit=null;
  // the nearest within snap; a window within snap wins over everything (the middle of the wall is often almost at the window)
  const dist=k=>Math.abs(s-k[0])+(k[1]==='win'?0:1);
  if(hi>=lo){for(const k of cand)if(k[0]>=lo-1e-6&&k[0]<=hi+1e-6&&Math.abs(s-k[0])<snap&&(!hit||dist(k)<dist(hit)))hit=k;s=hit?hit[0]:grid(s);}
  const back=WALL.inner+f.d/2+.003,k=f.d+WALL.inner+.3,ln=t=>{const m=[a[0]+u[0]*t,a[1]+u[1]*t];return [m,[m[0]+n[0]*k,m[1]+n[1]*k]];};
  return {x:+(a[0]+u[0]*s+n[0]*back).toFixed(4),y:+(a[1]+u[1]*s+n[1]*back).toFixed(4),rot,wall:[a,best.b],
    mid:hit?.[1]==='mid'?ln(c):hit?.[1]==='win'?ln(hit[0]):null,edge:typeof hit?.[1]==='number'?ln(hit[1]):null,win:hit?.[1]==='win'?hit[2]:null};
}
function overlap(A,B){
  for(const P of [A,B])for(let i=0;i<4;i++){const a=P[i],b=P[(i+1)%4],n=[-(b[1]-a[1]),b[0]-a[0]];
    const pa=A.map(v=>v[0]*n[0]+v[1]*n[1]),pb=B.map(v=>v[0]*n[0]+v[1]*n[1]);
    if(Math.max(...pa)<=Math.min(...pb)||Math.max(...pb)<=Math.min(...pa))return false;}
  return true;
}
// Map of item id → reason: goes into a wall, blocks a door, overlaps another item.
// Height counts too: a wall-hung item (wall cabinets, TV, range hood) overlaps only if it also intrudes on another item in height:
// a TV above a TV stand is fine, but a wall cabinet below the top of the fridge conflicts.
const zr=f=>{const z=zOf(f);return [z,z+f.h];},above=(f,g)=>{const [a0,a1]=zr(f),[b0,b1]=zr(g);return a1<=b0+.005||b1<=a0+.005;};
// Tucked under a table: a chair, desk chair or mobile pedestal (under) under a table (table) does not overlap if the part going under
// the tabletop is lower than it (for a chair, the seat; the backrest stays outside).
const tuck=(f,g)=>{const a=byId(f.model),b=byId(g.model),u=(c,x)=>c?.under===true?x.h:c?.under||0,t=(c,x)=>c?.table===true?x.h:c?.table||0;
  return a?.under&&b?.table&&u(a,f)<=t(b,g)-.03||b?.under&&a?.table&&u(b,g)<=t(a,f)-.03;}; // table as a number: the tabletop height (a dressing table has a mirror above it)
// Items stacked above each other (wall cabinets above base cabinets, a TV above a TV stand, a range hood above a cooktop, a microwave on
// the countertop): they overlap f on the plan but not in height. Bottom to top, including f; the item panel lets you switch to any of them.
export function stackOf(plan,f){const soft=g=>!!byId(g.model)?.soft;if(soft(f))return [f];
  const R=g=>isRun(g)?runGeo(plan,g)?.sides.map(s=>s.quad)||[]:footRects(g,.01),A=R(f);
  return [f,...plan.furniture.filter(g=>g!==f&&!soft(g)&&above(f,g)&&R(g).some(b=>A.some(a=>overlap(a,b))))].sort((a,b)=>zOf(a)-zOf(b));}
export function furnitureConflicts(plan){
  // a built-in wardrobe: rectangles along each wall (by the main face; at a column the rectangle goes into it, which is not an error)
  const out=new Map(),F=plan.furniture,C=F.map(f=>isRun(f)?runGeo(plan,f)?.sides.map(s=>s.quad)||[]:footRects(f,.01)),ov=(A,B)=>A.some(a=>B.some(b=>overlap(a,b))),soft=f=>!!byId(f.model)?.soft;
  // The door zone: on the side the leaf opens to, as deep as the door width (the leaf sweeps it); on the other side and for an opening
  // without a door, 30 cm. Something hung above the top of the door (an air conditioner over the door) does not block it.
  const doors=plan.openings.map(o=>openingCoords(plan.rooms,o)).filter(o=>o&&o.kind==='door').map(o=>{
    const dx=o.b[0]-o.a[0],dy=o.b[1]-o.a[1],l=Math.hypot(dx,dy)||1,r=plan.rooms.find(r=>r.id===o.at?.room);let n=[dy/l,-dx/l];
    if(r&&!pointIn([(o.a[0]+o.b[0])/2-n[0]*.12,(o.a[1]+o.b[1])/2-n[1]*.12],r.polygon))n=[-n[0],-n[1]]; // n points out of the opening's room (like outward in draw.js)
    const leaf=!(o.leaf===false||o.swing==null&&l>1.15),inn=SWING[o.swing||0].out?n:[-n[0],-n[1]],f=leaf?Math.min(l,1)+.05:.3,b=.3;
    return {top:o.top??2.1,poly:[[o.a[0]+inn[0]*f,o.a[1]+inn[1]*f],[o.b[0]+inn[0]*f,o.b[1]+inn[1]*f],[o.b[0]-inn[0]*b,o.b[1]-inn[1]*b],[o.a[0]-inn[0]*b,o.a[1]-inn[1]*b]]};});
  F.forEach((f,i)=>{
    const room=!isRun(f)&&roomAt(plan,[f.x,f.y]);
    // a built-in wardrobe's shape follows the wall faces, so it never goes into a wall; no shape means there is no room for it
    if(isRun(f)?!C[i].length:!room||!footRects(f,.02).flat().every(v=>pointIn(v,room.polygon)))out.set(f.id,t('goes into a wall'));
    else if(soft(f))return; // curtains hang in front of furniture and in front of a balcony door
    else if(doors.some(d=>zOf(f)<d.top-.02&&ov(C[i],[d.poly])))out.set(f.id,t('blocks a door'));
    else{const j=F.findIndex((g,k)=>k!==i&&!soft(g)&&!above(f,g)&&!tuck(f,g)&&ov(C[i],C[k]));if(j>=0)out.set(f.id,t('overlaps “{0}”',nameOf(F[j])));}
  });
  return out;
}

// ---------- lights ----------
// A light point: near the room center it snaps to the center, otherwise to the grid and to the x/y of this light's other points.
// tol is the on-screen tolerance in meters (8 px at the current zoom); the center pulls from one and a half times farther (12 px), but no more than 25 cm:
// when zoomed in, it goes anywhere (the owner: could not place lights in the bathroom, everything pulled to the center; it used to be 35 cm at any zoom).
export function snapLightPoint(plan,L,p,{free,tol=.15,skip}={}){
  if(free)return {p};
  const r=roomAt(plan,p);
  if(r){const c=centroid(r.polygon);if(Math.hypot(c[0]-p[0],c[1]-p[1])<Math.min(.25,tol*1.5))return {p:c.map(v=>+v.toFixed(3)),guides:[{x:c[0]},{y:c[1]}]};}
  let gx=null,gy=null;
  L.points.forEach((q,i)=>{if(i===skip)return;if(Math.abs(q[0]-p[0])<tol)gx=q;if(Math.abs(q[1]-p[1])<tol)gy=q;});
  const x=gx?gx[0]:grid(p[0]),y=gy?gy[1]:grid(p[1]);
  return {p:[+x.toFixed(3),+y.toFixed(3)],guides:[gx&&{x},gy&&{y}].filter(Boolean)};
}
// A strip: the whole nearest wall of the room along its surface, 10 cm in from the corners.
export function stripOnWall(plan,p){
  let best=null;
  for(const e of roomEdges(plan)){if(e.l<.4)continue;
    const along=(p[0]-e.a[0])*e.u[0]+(p[1]-e.a[1])*e.u[1],off=(p[0]-e.a[0])*e.n[0]+(p[1]-e.a[1])*e.n[1];
    if(along<0||along>e.l||off<-.15||off>.7)continue;if(!best||off<best.off)best={...e,off};}
  if(!best)return null;
  const {room,a,u,n,l}=best,k=WALL.inner+.03,pt=t=>[+(a[0]+u[0]*t+n[0]*k).toFixed(3),+(a[1]+u[1]*t+n[1]*k).toFixed(3)];
  return {room:room.id,seg:[pt(.1),pt(l-.1)]};
}
// Spotlights in a grid across the room, 60 cm in from the walls.
export function gridSpots(room,rows,cols){
  const xs=room.polygon.map(v=>v[0]),ys=room.polygon.map(v=>v[1]),x0=Math.min(...xs)+.6,x1=Math.max(...xs)-.6,y0=Math.min(...ys)+.6,y1=Math.max(...ys)-.6;
  const pts=[];
  for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
    const q=[+(cols>1?x0+(x1-x0)*j/(cols-1):(x0+x1)/2).toFixed(3),+(rows>1?y0+(y1-y0)*i/(rows-1):(y0+y1)/2).toFixed(3)];
    if(pointIn(q,room.polygon))pts.push(q);}
  return pts;
}

// “Auto-place”: unplaced lights go into the room of their HA area: a point light to the center,
// a ceiling strip along the longest wall. Countertop and baseboard strips are left to the person.
export function autoPlaceLights(plan,roomOfArea){
  let n=0;
  for(const L of plan.lights){if(L.placed)continue;const r=roomOfArea(L.area);if(!r)continue;
    if(L.kind==='point'){L.points=[centroid(r.polygon).map(v=>+v.toFixed(3))];}
    else{if(L.h<1.8)continue;let best=null;for(const e of roomEdges(plan))if(e.room===r&&(!best||e.l>best.l))best=e;if(!best)continue;
      const k=WALL.inner+.03,pt=t=>[+(best.a[0]+best.u[0]*t+best.n[0]*k).toFixed(3),+(best.a[1]+best.u[1]*t+best.n[1]*k).toFixed(3)];L.segments=[[pt(.1),pt(best.l-.1)]];}
    L.placed=true;L.room=r.id;L.auto=true;n++;}
  return n;
}

// A room gets a name and an HA area (area is its id, or null for just a name). Lights are not placed automatically: what kind of light
// (points or a strip), how many points and where is known only to the user; that is the “Lights” step. Lights of the previous area
// that were auto-placed (L.auto) and left untouched are removed from the plan, otherwise the kitchen lights would stay in the bedroom.
export function setRoomArea(plan,room,area,name){
  if(room.area&&room.area!==area)for(const L of plan.lights)if(L.auto&&L.area===room.area&&L.room===room.id){
    L.placed=false;L.points=[];L.segments=[];L.room=null;delete L.auto;}
  if(area)room.area=area;else delete room.area;
  room.name=area?name:uniqueName(plan,room,name); // an area keeps its name from HA as is: two pieces of a hallway are both “Hallway”
}
