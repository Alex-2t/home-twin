// Plan editor sketch: “Rooms” mode. On the left, the plan from above; on the right, live 3D.
import {validate,buildPlan2d,attachOpening,openingCoords,area} from './geometry.js';
import {createView} from './scene3d.js';
import manifest from '../../../3d_floor/apartment/smart-home/web/public/devices.json';
import {OPENINGS} from '../walls-from-json/plan.js';
import {UNDERLAY} from './underlay.gen.js';
import {CATALOG,byId,COLORS,loadKenney,thumbnails} from './furniture.js';
import {WALL} from './geometry.js';

const $=id=>document.getElementById(id);
const cv=$('plan'),ctx=cv.getContext('2d');
const view=createView($('view3d'));
const GRID=.05,SNAP_PX=8,LINK=.45;

// ---------- state and history ----------
const initial=()=>{const rooms=manifest.rooms.map(r=>({id:r.id,name:r.short,polygon:r.polygon.map(p=>[...p])}));
  return {rooms,openings:OPENINGS.map(o=>attachOpening(rooms,o)).filter(Boolean),furniture:[]};};
let plan=JSON.parse(localStorage.getItem('room-editor-plan')||'null')||initial();
plan.furniture||=[];
// Lamps “as if from Home Assistant”: name, entity and area are known, the place on the plan is not. Take 13 lamps from devices.json without coordinates.
const AREA=Object.fromEntries(manifest.rooms.map(r=>[r.id,r.short]));
const haLights=()=>manifest.lights.map(l=>({id:l.id,entity:'light.'+l.id,name:l.name,area:l.room,color:l.color||'#ffce87',
  kind:['strip','cove'].includes(l.kind)?'strip':'point',on:true,placed:false,points:[],segments:[],room:null,
  h:['strip','cove'].includes(l.kind)?(/пол|плинтус/i.test(l.name)?.1:/столешниц/i.test(l.name)?1.4:2.5):(l.kind==='ceiling'?2.52:1.6)}));
plan.lights||=haLights();
let hist=[JSON.stringify(plan)],hpos=0;
function commit(){hist=hist.slice(0,hpos+1);hist.push(JSON.stringify(plan));hpos=hist.length-1;localStorage.setItem('room-editor-plan',hist[hpos]);update();}
function undo(){if(hpos>0){plan=JSON.parse(hist[--hpos]);sel.vertex=null;update();save();}}
function redo(){if(hpos<hist.length-1){plan=JSON.parse(hist[++hpos]);update();save();}}
const save=()=>localStorage.setItem('room-editor-plan',JSON.stringify(plan));
// After inserting or deleting a corner, side indices shift: re-attach the openings by their current position.
function reattach(before){plan.openings=plan.openings.map(o=>{const c=openingCoords(before,o);return c?attachOpening(plan.rooms,c)||o:o;});}

// ---------- plan view ----------
let sc=60,ox=60,oy=520;
const S=([x,y])=>[ox+x*sc,oy-y*sc],W=([X,Y])=>[(X-ox)/sc,(oy-Y)/sc];
const ul={img:new Image(),opacity:.45,show:true,
  // Underlay: the plan photo from 3d_floor, aligned by two corners (bedroom SW and kids' room NE).
  a:null,b:null};
ul.img.src=UNDERLAY;
function setUnderlay(z1,w1,z2,w2){ // similarity: world = a·z + b, z = (u, −v)
  const zx=z2[0]-z1[0],zy=-(z2[1]-z1[1]),wx=w2[0]-w1[0],wy=w2[1]-w1[1],d=zx*zx+zy*zy;
  ul.a=[(wx*zx+wy*zy)/d,(wy*zx-wx*zy)/d];
  ul.b=[w1[0]-(ul.a[0]*z1[0]-ul.a[1]*-z1[1]),w1[1]-(ul.a[1]*z1[0]+ul.a[0]*-z1[1])];
}
const imgToWorld=([u,v])=>[ul.a[0]*u-ul.a[1]*-v+ul.b[0],ul.a[1]*u+ul.a[0]*-v+ul.b[1]];
setUnderlay([120,890],[-.02,-.02],[1275,420],[12.57,5.06]);
const savedUl=JSON.parse(localStorage.getItem('room-editor-underlay')||'null');if(savedUl){ul.a=savedUl.a;ul.b=savedUl.b;}
const saveUl=()=>localStorage.setItem('room-editor-underlay',JSON.stringify({a:ul.a,b:ul.b}));

function fit(){
  const xs=plan.rooms.flatMap(r=>r.polygon.map(p=>p[0])),ys=plan.rooms.flatMap(r=>r.polygon.map(p=>p[1]));
  const [x0,x1,y0,y1]=xs.length?[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)]:[0,12,0,6];
  sc=Math.min((cv.width-80)/(x1-x0||1),(cv.height-80)/(y1-y0||1));ox=40-x0*sc+((cv.width-80)-(x1-x0)*sc)/2;oy=cv.height-40+y0*sc-((cv.height-80)-(y1-y0)*sc)/2;
}

// ---------- tools ----------
let tool='select';
const sel={room:null,vertex:null};
let drag=null,guides=[],draft=null,hover=null,grid=true;
const HINT={
  select:'Drag a corner or a wall. A wall between rooms moves together with the neighbouring one (Alt — only your own). Double-click a wall to enter its length, a room to enter its name. Alt+click a wall for a new corner. Delete removes a corner or a room. Shift — no snapping.',
  rect:'Drag out a rectangle. Corners snap to the 5 cm grid and to other rooms\' corners.',
  poly:'Click the corners. Click the first corner or press Enter to finish, Esc to cancel.',
  underlay:'Drag the underlay with the mouse. “Scale by two points”: click two spots on the underlay and enter the distance between them.',
};
function setTool(t){tool=t;draft=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('on',b.dataset.tool===t));$('hint').textContent=HINT[t];draw();}

const roomById=id=>plan.rooms.find(r=>r.id===id);
const dist2=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2;
function segDist(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy||1;let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2;t=Math.max(0,Math.min(1,t));return [Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy),t];}
const pointIn=([x,y],ring)=>{let r=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)r=!r;}return r;};
function hit(p){
  const tol=SNAP_PX/sc;
  const order=[...plan.rooms].sort((a,b)=>(b.id===sel.room)-(a.id===sel.room));
  for(const r of order)for(let i=0;i<r.polygon.length;i++)if(dist2(p,r.polygon[i])<tol*tol)return {kind:'vertex',room:r,i};
  for(const r of order)for(let i=0;i<r.polygon.length;i++){const [d,t]=segDist(p,r.polygon[i],r.polygon[(i+1)%r.polygon.length]);if(d<tol*.8)return {kind:'edge',room:r,i,t};}
  for(const r of order)if(pointIn(p,r.polygon))return {kind:'room',room:r};
  return null;
}
// Point snapping: to the x and y of other corners (alignment and right angles), otherwise to the grid.
function snapPoint(p,skip,free){
  guides=[];if(free)return p;
  const tol=SNAP_PX/sc;let [x,y]=p,bx=tol,by=tol,gx=null,gy=null;
  for(const r of plan.rooms)r.polygon.forEach((v,i)=>{if(skip&&skip(r,i))return;
    if(Math.abs(v[0]-p[0])<bx){bx=Math.abs(v[0]-p[0]);gx=v;}if(Math.abs(v[1]-p[1])<by){by=Math.abs(v[1]-p[1]);gy=v;}});
  if(draft?.points)for(const v of draft.points){if(Math.abs(v[0]-p[0])<bx){bx=Math.abs(v[0]-p[0]);gx=v;}if(Math.abs(v[1]-p[1])<by){by=Math.abs(v[1]-p[1]);gy=v;}}
  if(gx){x=gx[0];guides.push({x,from:gx});}else if(grid)x=Math.round(x/GRID)*GRID;
  if(gy){y=gy[1];guides.push({y,from:gy});}else if(grid)y=Math.round(y/GRID)*GRID;
  return [+x.toFixed(4),+y.toFixed(4)];
}
// One wall is all room sides on the same line plus those parallel to them closer than 45 cm (along a chain):
// the kids' room wall drags both the bathroom and the hallway along.
function linkedEdges(room,i){
  const key=(r,j)=>r.id+':'+j,seen=new Set([key(room,i)]),out=[],queue=[[room,i]];
  while(queue.length){
    const [er,ei]=queue.shift(),p=er.polygon,a=p[ei],b=p[(ei+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),ux=dx/l,uy=dy/l;
    for(const r of plan.rooms)for(let j=0;j<r.polygon.length;j++){
      if(seen.has(key(r,j)))continue;
      const c=r.polygon[j],e=r.polygon[(j+1)%r.polygon.length],ex=e[0]-c[0],ey=e[1]-c[1],el=Math.hypot(ex,ey);
      if(el<1e-6||Math.abs((ex*ux+ey*uy)/el)<.995)continue;
      const off=Math.abs(-(c[0]-a[0])*uy+(c[1]-a[1])*ux);
      // own room: only the same line; another room: parallel within the wall thickness
      if(r===room?off>.005:off>LINK)continue;
      const s0=(c[0]-a[0])*ux+(c[1]-a[1])*uy,s1=(e[0]-a[0])*ux+(e[1]-a[1])*uy;
      if(Math.max(s0,s1)<.05||Math.min(s0,s1)>l-.05)continue;
      seen.add(key(r,j));out.push([r,j]);queue.push([r,j]);
    }
  }
  return out;
}
function moveEdges(edges,orig,n,d){
  for(const [r,j] of edges){const k=(j+1)%r.polygon.length;
    for(const t of [j,k]){const v=orig.get(r.id)[t];r.polygon[t]=[+(v[0]+n[0]*d).toFixed(4),+(v[1]+n[1]*d).toFixed(4)];}}
}

cv.addEventListener('pointerdown',e=>{
  cv.setPointerCapture(e.pointerId);guides=[];
  const p=W([e.offsetX,e.offsetY]),free=e.shiftKey;
  if(mode==='lights'&&e.button===0){if(!lightDown(e,p)){drag={kind:'pan',X:e.offsetX,Y:e.offsetY,ox,oy};sel.light=null;lightInspector();draw();}return;}
  if(mode==='furniture'&&e.button===0){if(!furnDown(e,p)){drag={kind:'pan',X:e.offsetX,Y:e.offsetY,ox,oy};sel.furn=null;inspector();draw();}return;}
  if(e.button===1||e.button===2||(tool==='select'&&e.button===0&&!hit(p)&&!e.altKey)){drag={kind:'pan',X:e.offsetX,Y:e.offsetY,ox,oy};if(tool==='select'&&e.button===0){sel.room=null;sel.vertex=null;view.select(null);draw();}return;}
  if(tool==='select'){
    const h=hit(p);if(!h)return;
    sel.room=h.room.id;view.select(sel.room);sel.vertex=h.kind==='vertex'?h.i:null;
    const orig=new Map(plan.rooms.map(r=>[r.id,r.polygon.map(v=>[...v])]));
    if(h.kind==='edge'&&e.altKey){ // new corner on the wall
      const before=structuredClone(plan.rooms),a=h.room.polygon[h.i],b=h.room.polygon[(h.i+1)%h.room.polygon.length];
      h.room.polygon.splice(h.i+1,0,snapPoint([a[0]+(b[0]-a[0])*h.t,a[1]+(b[1]-a[1])*h.t]));reattach(before);sel.vertex=h.i+1;commit();return;}
    if(h.kind==='vertex')drag={kind:'vertex',room:h.room,i:h.i};
    else if(h.kind==='edge'){const pp=h.room.polygon,a=pp[h.i],b=pp[(h.i+1)%pp.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
      drag={kind:'edge',room:h.room,i:h.i,n:[-(b[1]-a[1])/l,(b[0]-a[0])/l],start:p,orig,edges:[[h.room,h.i],...(e.altKey?[]:linkedEdges(h.room,h.i))]};}
    else drag={kind:'room',room:h.room,start:p,orig};
    drag.moved=false;draw();return;
  }
  if(tool==='rect'){const q=snapPoint(p,null,free);draft={kind:'rect',a:q,b:q};return;}
  if(tool==='poly'){
    const q=snapPoint(p,null,free);
    if(!draft)draft={kind:'poly',points:[q]};
    else if(draft.points.length>=3&&dist2(q,draft.points[0])<(SNAP_PX/sc)**2)finishPoly();
    else draft.points.push(q);
    draw();return;
  }
  if(tool==='underlay'){
    if(calib){calib.push(ul.img&&worldToImg(p));if(calib.length===2)askNumber(e.offsetX,e.offsetY,'Distance, m',(1).toFixed(2),v=>{
      const w1=imgToWorld(calib[0]),w2=imgToWorld(calib[1]),k=v/Math.hypot(w2[0]-w1[0],w2[1]-w1[1]);
      ul.a=[ul.a[0]*k,ul.a[1]*k];const n1=imgToWorld(calib[0]);ul.b=[ul.b[0]+w1[0]-n1[0],ul.b[1]+w1[1]-n1[1]];saveUl();calib=null;$('calib').classList.remove('on');draw();},()=>{calib=null;$('calib').classList.remove('on');});draw();return;}
    drag={kind:'underlay',start:p,b:[...ul.b]};
  }
});
const worldToImg=([x,y])=>{const a=ul.a,d=a[0]*a[0]+a[1]*a[1],X=x-ul.b[0],Y=y-ul.b[1];const u=(a[0]*X+a[1]*Y)/d,nv=(a[0]*Y-a[1]*X)/d;return [u,-nv];};
let calib=null;
cv.addEventListener('pointermove',e=>{
  const p=W([e.offsetX,e.offsetY]),free=e.shiftKey;
  hover=p;
  if(!drag&&mode==='lights'){cv.style.cursor=lightHit(p)?'move':'grab';return;}
  if(!drag&&mode==='furniture'){const h=furnHit(p);cv.style.cursor=h?(h.handle?'ew-resize':'move'):'grab';return;}
  if(!drag){if(draft?.kind==='poly')draw();if(tool==='select'){const h=hit(p);cv.style.cursor=!h?'grab':h.kind==='room'?'move':'pointer';}return;}
  if(drag.kind==='pan'){ox=drag.ox+e.offsetX-drag.X;oy=drag.oy+e.offsetY-drag.Y;draw();return;}
  if(drag.kind.startsWith('light')){drag.moved=true;lightMove(p,free);update();return;}
  if(drag.kind.startsWith('furn')){drag.moved=true;furnMove(p,free);update();return;}
  drag.moved=true;
  if(drag.kind==='vertex'){drag.room.polygon[drag.i]=snapPoint(p,(r,i)=>r===drag.room&&i===drag.i,free);}
  else if(drag.kind==='edge'){
    const n=drag.n,a0=drag.orig.get(drag.room.id)[drag.i];let d=(p[0]-drag.start[0])*n[0]+(p[1]-drag.start[1])*n[1];
    guides=[];
    if(!free){ // the wall aligns with other rooms' corners or with the grid
      const axis=Math.abs(n[0])>.999?0:Math.abs(n[1])>.999?1:-1,tol=SNAP_PX/sc;
      if(axis>=0){const pos=a0[axis]+d*n[axis];let best=null;
        for(const r of plan.rooms)r.polygon.forEach((v,i)=>{if(drag.edges.some(([er,j])=>er===r&&(i===j||i===(j+1)%r.polygon.length)))return;if(Math.abs(v[axis]-pos)<tol&&(!best||Math.abs(v[axis]-pos)<Math.abs(best[axis]-pos)))best=v;});
        const target=best?best[axis]:grid?Math.round(pos/GRID)*GRID:pos;d=(target-a0[axis])/n[axis];if(best)guides.push(axis?{y:best[1],from:best}:{x:best[0],from:best});}
      else if(grid)d=Math.round(d/GRID)*GRID;
    }
    moveEdges(drag.edges,drag.orig,n,d);
  }
  else if(drag.kind==='room'){let dx=p[0]-drag.start[0],dy=p[1]-drag.start[1];if(!free&&grid){dx=Math.round(dx/GRID)*GRID;dy=Math.round(dy/GRID)*GRID;}
    drag.room.polygon=drag.orig.get(drag.room.id).map(v=>[+(v[0]+dx).toFixed(4),+(v[1]+dy).toFixed(4)]);}
  else if(drag.kind==='underlay'){ul.b=[drag.b[0]+p[0]-drag.start[0],drag.b[1]+p[1]-drag.start[1]];draw();return;}
  update(true);
});
cv.addEventListener('pointerup',e=>{
  if(draft?.kind==='rect'){const [a,b]=[draft.a,draft.b];draft=null;
    if(Math.abs(a[0]-b[0])>.3&&Math.abs(a[1]-b[1])>.3)addRoom([[a[0],a[1]],[b[0],a[1]],[b[0],b[1]],[a[0],b[1]]]);else draw();}
  if(drag){const k=drag.kind;const moved=drag.moved;drag=null;guides=[];if(k==='underlay')saveUl();if(moved&&k!=='pan'&&k!=='underlay')commit();else draw();}
});
cv.addEventListener('pointermove',e=>{if(draft?.kind==='rect'&&e.buttons){draft.b=snapPoint(W([e.offsetX,e.offsetY]),null,e.shiftKey);draw();}});
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('wheel',e=>{e.preventDefault();const k=Math.exp(-e.deltaY*.0015),[x,y]=W([e.offsetX,e.offsetY]);sc=Math.max(10,Math.min(600,sc*k));ox=e.offsetX-x*sc;oy=e.offsetY+y*sc;draw();},{passive:false});
cv.addEventListener('dblclick',e=>{
  if(tool!=='select')return;const p=W([e.offsetX,e.offsetY]),h=hit(p);if(!h)return;
  if(h.kind==='edge'){const pp=h.room.polygon,i=h.i,a=pp[i],b=pp[(i+1)%pp.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
    askNumber(e.offsetX,e.offsetY,'Length, cm',Math.round(l*100),v=>setLength(h.room,i,v/100));}
  else if(h.kind==='room')askText(e.offsetX,e.offsetY,'Name',h.room.name,v=>{h.room.name=v;commit();});
});
// Side length: move the next side (together with the neighbouring room) so right angles stay right.
function setLength(room,i,L){
  const pp=room.polygon,n=pp.length,a=pp[i],b=pp[(i+1)%n],c=pp[(i+2)%n],l=Math.hypot(b[0]-a[0],b[1]-a[1]),u=[(b[0]-a[0])/l,(b[1]-a[1])/l],d=L-l;
  const nx=c[0]-b[0],ny=c[1]-b[1],nl=Math.hypot(nx,ny);
  const orig=new Map(plan.rooms.map(r=>[r.id,r.polygon.map(v=>[...v])]));
  if(Math.abs((nx*u[0]+ny*u[1])/nl)<.05)moveEdges([[room,(i+1)%n],...linkedEdges(room,(i+1)%n)],orig,u,d);
  else pp[(i+1)%n]=[b[0]+u[0]*d,b[1]+u[1]*d];
  commit();
}
function addRoom(polygon){
  if(area(polygon)<0)polygon.reverse();
  let k=1;while(roomById('room_'+k))k++;
  plan.rooms.push({id:'room_'+k,name:'Room '+k,polygon});sel.room='room_'+k;sel.vertex=null;commit();view.select(sel.room);
}
function finishPoly(){const pts=draft.points;draft=null;if(pts.length>=3)addRoom(pts);else draw();}
addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT')return;
  const mod=e.metaKey||e.ctrlKey;
  if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
  if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  if(e.key==='Escape'){draft=null;calib=null;draw();}
  if(mode==='lights'){if(sel.light&&(e.key==='Delete'||e.key==='Backspace'))lightRemove();return;}
  if(mode==='furniture'){const f=furnById(sel.furn);
    if(f&&!mod&&(e.key==='r'||e.key==='R'||e.key==='к'||e.key==='К')){f.rot=(f.rot+(e.shiftKey?-15:90)+360)%360;commit();inspector();} // allow-cyrillic: R on the Russian keyboard layout
    if(f&&(e.key==='Delete'||e.key==='Backspace')){plan.furniture=plan.furniture.filter(x=>x!==f);sel.furn=null;commit();inspector();}
    return;}
  if(e.key==='Enter'&&draft?.kind==='poly')finishPoly();
  if((e.key==='Delete'||e.key==='Backspace')&&sel.room){
    const r=roomById(sel.room);if(!r)return;const before=structuredClone(plan.rooms);
    if(sel.vertex!=null&&r.polygon.length>3){r.polygon.splice(sel.vertex,1);sel.vertex=null;reattach(before);}
    else{plan.rooms=plan.rooms.filter(x=>x!==r);plan.openings=plan.openings.filter(o=>o.at.room!==r.id);sel.room=null;sel.vertex=null;}
    commit();
  }
  const keys={v:'select',r:'rect',p:'poly'};if(!mod&&keys[e.key])setTool(keys[e.key]);
});
// An input field right on the plan.
function ask(x,y,label,value,ok,cancel,type){
  const box=$('ask'),inp=box.querySelector('input');box.querySelector('span').textContent=label;
  inp.type=type;inp.value=value;Object.assign(box.style,{left:x+'px',top:y+'px',display:'flex'});inp.focus({preventScroll:true});inp.select();
  const done=v=>{box.style.display='none';inp.onkeydown=inp.onblur=null;v==null?cancel?.():ok(v);};
  inp.onkeydown=e=>{if(e.key==='Enter'){const v=type==='number'?parseFloat(inp.value.replace(',','.')):inp.value.trim();done(type==='number'?(v>0?v:null):(v||null));}if(e.key==='Escape')done(null);};
  inp.onblur=()=>done(null);
}
const askNumber=(x,y,l,v,ok,c)=>ask(x,y,l,v,ok,c,'number'),askText=(x,y,l,v,ok)=>ask(x,y,l,v,ok,null,'text');

// ---------- validation and 3D ----------
let errors=[],last={ms:0,ms2d:0,step:1000},pending=false,hidden=0,lastWalls='',lastLights='',maskKey='',maskMs=0;
function update(live){
  errors=validate(plan.rooms);
  draw();
  if(pending)return;pending=true;
  requestAnimationFrame(()=>{pending=false;
    const bad=new Set(errors.map(e=>e.room));
    furnCheck();view.setFurniture(plan.furniture);
    const placed=plan.lights.filter(l=>l.placed),lk=JSON.stringify([placed,plan.rooms]);
    if(lk!==lastLights){lastLights=lk;view.setLights(placed,plan.rooms);}
    // The room mask is installed when the mouse is released: it recompiles shaders (~a fraction of a second).
    if(!drag&&maskKey!==lk){maskKey=lk;remask();}
    if(errors.length){status();return;}
    const wallsKey=JSON.stringify([plan.rooms,plan.openings]);if(wallsKey===lastWalls){status();return;}lastWalls=wallsKey;
    const t=performance.now();
    try{
      const ops=plan.openings.map(o=>openingCoords(plan.rooms,o));hidden=ops.filter(o=>!o).length;
      const g=buildPlan2d(plan.rooms,ops.filter(Boolean));const t2=performance.now();
      view.set(g,plan.rooms,ops.filter(Boolean),sel.room);maskKey='';if(!drag){maskKey=JSON.stringify([plan.lights.filter(l=>l.placed),plan.rooms]);remask();}
      last={ms:performance.now()-t,ms2d:t2-t,step:g.step,fail:null};
    }catch(err){last={...last,fail:String(err.message||err).slice(0,80)};}
    status();
  });
}
// Light rebuild: install the mask and measure how long until the next frame (shaders compile at render time).
function remask(){const t=performance.now();view.applyMask(plan.rooms);requestAnimationFrame(()=>requestAnimationFrame(()=>{maskMs=performance.now()-t;status();}));}
function status(){
  const el=$('status');
  if(errors.length)el.innerHTML=`<b class="bad">3D not updated:</b> `+errors.map(e=>`“${roomById(e.room)?.name}” — ${e.text}`).join('; ');
  else if(last.fail)el.innerHTML=`<b class="bad">Walls failed to build; showing the last successful 3D.</b> ${last.fail}`;
  else if(mode==='lights'){const n=plan.lights.filter(l=>!l.placed).length;el.textContent=`Lamps on the plan: ${plan.lights.length-n} of ${plan.lights.length}. Light sources in 3D: ${view.lightCount()}. Last light rebuild: ${maskMs.toFixed(0)} ms.`+(n?` Unplaced: ${n}.`:'');}
  else if(conflicts.size)el.innerHTML=`<b class="bad">Furniture:</b> `+[...conflicts].map(([id,t])=>`“${byId(furnById(id)?.model)?.name}” — ${t}`).join('; ');
  else el.textContent=`3D rebuilt in ${last.ms.toFixed(0)} ms (2D walls: ${last.ms2d.toFixed(0)} ms)`+(last.step!==1000?', coarse rounding was needed':'')+(hidden?`. Openings hidden: ${hidden} (wall became shorter than the opening)`:'');
}

// ---------- furniture ----------
let mode='rooms';
sel.furn=null;
const furnById=id=>plan.furniture.find(f=>f.id===id);
const rad=d=>d*Math.PI/180;
// Item axes on the plan: ax — along the width, fz — where it faces (0° — south).
const axes=f=>{const t=rad(f.rot);return [[Math.cos(t),Math.sin(t)],[Math.sin(t),-Math.cos(t)]];};
function corners(f,shrink=0){const [ax,fz]=axes(f),w=f.w/2-shrink,d=f.d/2-shrink;
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>[f.x+ax[0]*w*i+fz[0]*d*j,f.y+ax[1]*w*i+fz[1]*d*j]);}
function furnHit(p){
  const tol=SNAP_PX/sc;
  const order=[...plan.furniture].sort((a,b)=>(b.id===sel.furn)-(a.id===sel.furn));
  for(const f of order){const [ax,fz]=axes(f),dx=p[0]-f.x,dy=p[1]-f.y,lx=dx*ax[0]+dy*ax[1],lz=dx*fz[0]+dy*fz[1];
    if(f.id===sel.furn&&byId(f.model).kind==='gen'){
      if(Math.hypot(lx-f.w/2,lz)<tol*1.2)return {f,handle:'w'};
      if(Math.hypot(lx,lz-f.d/2)<tol*1.2)return {f,handle:'d'};}
    if(Math.abs(lx)<=f.w/2&&Math.abs(lz)<=f.d/2)return {f};}
  return null;
}
// Wall snapping: the nearest room side; the item stands with its back to the wall, in a corner flush against the neighbouring one.
function snapWall(f,p,free){
  guides=[];
  if(free)return {x:p[0],y:p[1],rot:f.rot};
  let best=null;
  for(const r of plan.rooms){const pp=r.polygon,s=area(pp)>0?1:-1;
    for(let i=0;i<pp.length;i++){const a=pp[i],b=pp[(i+1)%pp.length],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);if(l<.3)continue;
      const u=[dx/l,dy/l],n=[-u[1]*s,u[0]*s],along=(p[0]-a[0])*u[0]+(p[1]-a[1])*u[1],off=(p[0]-a[0])*n[0]+(p[1]-a[1])*n[1];
      if(along<-.1||along>l+.1||off<-.1)continue;
      const rot=((Math.atan2(n[0],-n[1])*180/Math.PI)+360)%360,depth=Math.abs(rot-f.rot)%180<1?f.d:f.d; // depth along the normal
      if(off>depth/2+.55)continue;
      if(!best||off<best.off)best={a,u,n,l,off,rot,along};}}
  if(!best)return {x:Math.round(p[0]/GRID)*GRID,y:Math.round(p[1]/GRID)*GRID,rot:f.rot};
  const {a,u,n,l,rot}=best,lo=WALL.inner+f.w/2+.003,hi=l-WALL.inner-f.w/2-.003;
  let s=hi<lo?l/2:Math.max(lo,Math.min(hi,best.along));
  if(hi>=lo){if(s-lo<.25)s=lo;else if(hi-s<.25)s=hi;else s=Math.round(s/GRID)*GRID;}
  const back=WALL.inner+f.d/2+.003;
  guides.push({seg:[a,[a[0]+u[0]*l,a[1]+u[1]*l]]});
  return {x:+(a[0]+u[0]*s+n[0]*back).toFixed(4),y:+(a[1]+u[1]*s+n[1]*back).toFixed(4),rot};
}
function furnDown(e,p){
  const h=furnHit(p);if(!h)return false;
  sel.furn=h.f.id;inspector();
  if(h.handle)drag={kind:'furnSize',f:h.f,handle:h.handle,orig:{...h.f}};
  else drag={kind:'furn',f:h.f,off:[h.f.x-p[0],h.f.y-p[1]]};
  drag.moved=false;draw();return true;
}
function furnMove(p,free){
  const f=drag.f;
  if(drag.kind==='furn'){const q=[p[0]+drag.off[0],p[1]+drag.off[1]];Object.assign(f,snapWall(f,q,free));return;}
  const c=byId(f.model),o=drag.orig,[ax,fz]=axes(o);
  if(drag.handle==='w'){const L=[o.x-ax[0]*o.w/2,o.y-ax[1]*o.w/2];let w=(p[0]-L[0])*ax[0]+(p[1]-L[1])*ax[1];w=Math.max(c.min[0],Math.min(c.max[0],free?w:Math.round(w/GRID)*GRID));
    f.w=+w.toFixed(3);f.x=L[0]+ax[0]*w/2;f.y=L[1]+ax[1]*w/2;}
  else{const B=[o.x-fz[0]*o.d/2,o.y-fz[1]*o.d/2];let d=(p[0]-B[0])*fz[0]+(p[1]-B[1])*fz[1];d=Math.max(c.min[1],Math.min(c.max[1],free?d:Math.round(d/GRID)*GRID));
    f.d=+d.toFixed(3);f.x=B[0]+fz[0]*d/2;f.y=B[1]+fz[1]*d/2;}
  inspector();
}
// Validation: furniture overlaps furniture, blocks a door or goes into a wall.
let conflicts=new Map();
function overlap(A,B){
  for(const P of [A,B])for(let i=0;i<4;i++){const a=P[i],b=P[(i+1)%4],n=[-(b[1]-a[1]),b[0]-a[0]];
    const pa=A.map(v=>v[0]*n[0]+v[1]*n[1]),pb=B.map(v=>v[0]*n[0]+v[1]*n[1]);
    if(Math.max(...pa)<=Math.min(...pb)||Math.max(...pb)<=Math.min(...pa))return false;}
  return true;
}
function furnCheck(){
  conflicts=new Map();const F=plan.furniture,C=F.map(f=>corners(f,.01));
  const doors=plan.openings.map(o=>openingCoords(plan.rooms,o)).filter(o=>o&&o.kind==='door').map(o=>{
    const dx=o.b[0]-o.a[0],dy=o.b[1]-o.a[1],l=Math.hypot(dx,dy),n=[-dy/l*.7,dx/l*.7];
    return [[o.a[0]+n[0],o.a[1]+n[1]],[o.b[0]+n[0],o.b[1]+n[1]],[o.b[0]-n[0],o.b[1]-n[1]],[o.a[0]-n[0],o.a[1]-n[1]]];});
  F.forEach((f,i)=>{
    const room=plan.rooms.find(r=>pointIn([f.x,f.y],r.polygon));
    if(!room||!corners(f,.02).every(v=>pointIn(v,room.polygon)))conflicts.set(f.id,'goes into a wall');
    else if(doors.some(d=>overlap(C[i],d)))conflicts.set(f.id,'blocks a door');
    else{const j=F.findIndex((g,k)=>k!==i&&overlap(C[i],C[k]));if(j>=0)conflicts.set(f.id,`overlaps “${byId(F[j].model).name}”`);}
  });
}
function drawFurniture(){
  for(const f of plan.furniture){
    const c=corners(f),isSel=f.id===sel.furn,bad=conflicts.has(f.id),gen=byId(f.model).kind==='gen';
    ctx.beginPath();c.forEach((v,i)=>{const [X,Y]=S(v);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});ctx.closePath();
    ctx.fillStyle=bad?'rgba(220,50,40,.35)':isSel?'rgba(47,111,208,.30)':gen?'rgba(150,120,80,.32)':'rgba(110,130,150,.30)';ctx.fill();
    ctx.strokeStyle=bad?'#d23a2c':isSel?'#2f6fd0':'#6b5a45';ctx.lineWidth=isSel?2:1.2;ctx.stroke();
    // the front side is thicker
    ctx.beginPath();ctx.moveTo(...S(c[2]));ctx.lineTo(...S(c[3]));ctx.lineWidth=3;ctx.stroke();
    if(sc*Math.min(f.w,f.d)>26){const [X,Y]=S([f.x,f.y]);ctx.fillStyle='#2b2722';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText(byId(f.model).name,X,Y+4);}
    if(isSel&&gen){const [ax,fz]=axes(f);for(const h of [[f.x+ax[0]*f.w/2,f.y+ax[1]*f.w/2],[f.x+fz[0]*f.d/2,f.y+fz[1]*f.d/2]]){const [X,Y]=S(h);ctx.beginPath();ctx.arc(X,Y,5,0,7);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#2f6fd0';ctx.lineWidth=1.5;ctx.stroke();}}
  }
  if(placing?.item){const f=placing.item,c=corners(f);ctx.beginPath();c.forEach((v,i)=>{const [X,Y]=S(v);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});ctx.closePath();ctx.fillStyle='rgba(47,111,208,.25)';ctx.fill();ctx.strokeStyle='#2f6fd0';ctx.lineWidth=1.5;ctx.stroke();}
}
// Catalog: drag an item onto the plan.
let placing=null;
function buildCatalog(){
  const th=thumbnails(),box=$('catalog');box.innerHTML='';
  for(const [title,kind] of [['Generated by code (any size)','gen'],['Kenney, CC0 (fixed size)','kenney']]){
    const h=document.createElement('div');h.className='cat-title';h.textContent=title;box.appendChild(h);
    for(const c of CATALOG.filter(c=>c.kind===kind)){const el=document.createElement('div');el.className='item';
      el.innerHTML=`<img src="${th[c.id]}" draggable="false"><span>${c.name}</span>`;
      el.onpointerdown=e=>{e.preventDefault();placing={c};};box.appendChild(el);}
  }
}
addEventListener('pointermove',e=>{
  if(!placing)return;const r=cv.getBoundingClientRect(),X=e.clientX-r.left,Y=e.clientY-r.top;
  if(X<0||Y<0||X>r.width||Y>r.height||e.clientX<$('catalog').getBoundingClientRect().right){placing.item=null;guides=[];draw();return;}
  const c=placing.c,f=placing.item||{id:'f'+Date.now().toString(36),model:c.id,w:c.w,d:c.d,h:c.h,color:c.color,rot:0,x:0,y:0};
  Object.assign(f,snapWall(f,W([X,Y]),e.shiftKey));placing.item=f;draw();
});
addEventListener('pointerup',()=>{
  if(!placing)return;const f=placing.item;placing=null;guides=[];
  if(f){plan.furniture.push(f);sel.furn=f.id;commit();inspector();}else draw();
});
function inspector(){
  const box=$('inspector'),f=furnById(sel.furn);
  if(!f||mode!=='furniture'){box.style.display='none';return;}
  const c=byId(f.model);box.style.display='block';
  const cm=v=>Math.round(v*100);
  box.innerHTML=`<b>${c.name}</b> <small>${c.kind==='gen'?'generated by code':'Kenney'}</small><div class="row">`+
    (c.kind==='gen'?['w','d','h'].map((k,i)=>`<label>${['W','D','H'][i]} <input data-k="${k}" type="number" step="5" value="${cm(f[k])}"></label>`).join('')+
      `<select data-k="color">${Object.entries(COLORS).map(([k,[n]])=>`<option value="${k}" ${k===f.color?'selected':''}>${n}</option>`).join('')}</select>`
     :`${cm(f.w)} × ${cm(f.d)} × ${cm(f.h)} cm`)+
    `</div><div class="row"><button data-a="rot">Rotate (R)</button><button data-a="del">Delete</button></div>`;
  box.querySelectorAll('input').forEach(inp=>inp.onchange=()=>{const k=inp.dataset.k,i='wdh'.indexOf(k),v=Math.max(c.min[i],Math.min(c.max[i],(+inp.value||0)/100));f[k]=+v.toFixed(3);commit();inspector();});
  box.querySelector('select')?.addEventListener('change',e=>{f.color=e.target.value;commit();});
  box.querySelector('[data-a=rot]').onclick=()=>{f.rot=(f.rot+90)%360;commit();};
  box.querySelector('[data-a=del]').onclick=()=>{plan.furniture=plan.furniture.filter(x=>x!==f);sel.furn=null;commit();inspector();};
}
function setMode(m){
  mode=m;document.body.classList.toggle('lights',m==='lights');$('night').style.display=m==='lights'?'':'none';
  if(m==='lights'){sel.room=null;sel.furn=null;$('hint').textContent='Drag a lamp from the list onto the plan. A point lands on the ceiling (snaps to the room centre when near it), a strip lies along the nearest wall. Drag from the list again for another point or another wall. Drag points and strip ends; Delete removes them. Click 💡 to turn it on or off, as in HA.';lightList();}document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));
  document.body.classList.toggle('furniture',m==='furniture');
  // the catalog covers the left edge of the plan: shift the plan right if it is under the catalog
  if(m!=='rooms'){const need=m==='lights'?260:220,xs=plan.rooms.flatMap(r=>r.polygon.map(v=>v[0]));if(xs.length){const X=S([Math.min(...xs),0])[0];if(X<need)ox+=need-X;}}
  if(m==='furniture'){
    sel.room=null;sel.vertex=null;view.select(null);$('hint').textContent='Drag an item from the catalog onto the plan: next to a wall it turns its back to it by itself, in a corner it sits flush. R rotates by 90°, Shift+R by 15°, Delete removes it. For sized furniture, drag the white handles or enter the dimensions. Shift — no snapping.';}
  else{sel.furn=null;if(m==='rooms')setTool(tool);}
  inspector();lightInspector();draw();status();
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));

// ---------- lights ----------
sel.light=null;
const lightById=id=>plan.lights.find(l=>l.id===id);
const centroid=p=>p.reduce((s,v)=>[s[0]+v[0]/p.length,s[1]+v[1]/p.length],[0,0]);
const roomAt=p=>plan.rooms.find(r=>pointIn(p,r.polygon));
// Point: snaps to the room centre when near it, otherwise to the grid and to the x/y of this lamp's other points.
function snapLightPoint(L,p,free,skip){
  guides=[];if(free)return p;const r=roomAt(p);
  if(r){const c=centroid(r.polygon);if(Math.hypot(c[0]-p[0],c[1]-p[1])<.35){guides.push({x:c[0]},{y:c[1]});return c.map(v=>+v.toFixed(3));}}
  const tol=SNAP_PX/sc;let [x,y]=p,gx=null,gy=null;
  L.points.forEach((q,i)=>{if(i===skip)return;if(Math.abs(q[0]-x)<tol)gx=q;if(Math.abs(q[1]-y)<tol)gy=q;});
  x=gx?gx[0]:Math.round(x/GRID)*GRID;y=gy?gy[1]:Math.round(y/GRID)*GRID;if(gx)guides.push({x});if(gy)guides.push({y});
  return [+x.toFixed(3),+y.toFixed(3)];
}
// Strip: the whole nearest wall of the room, at the wall surface, inset 10 cm from the corners.
function stripOnWall(p){
  let best=null;
  for(const r of plan.rooms){const pp=r.polygon,s=area(pp)>0?1:-1;
    for(let i=0;i<pp.length;i++){const a=pp[i],b=pp[(i+1)%pp.length],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);if(l<.4)continue;
      const u=[dx/l,dy/l],n=[-u[1]*s,u[0]*s],along=(p[0]-a[0])*u[0]+(p[1]-a[1])*u[1],off=(p[0]-a[0])*n[0]+(p[1]-a[1])*n[1];
      if(along<0||along>l||off<-.15||off>.7)continue;if(!best||off<best.off)best={r,a,u,n,l,off};}}
  if(!best)return null;
  const {r,a,u,n,l}=best,k=WALL.inner+.03,pt=t=>[+(a[0]+u[0]*t+n[0]*k).toFixed(3),+(a[1]+u[1]*t+n[1]*k).toFixed(3)];
  return {room:r.id,seg:[pt(.1),pt(l-.1)]};
}
function lightHit(p){
  const tol=SNAP_PX/sc;
  for(const L of plan.lights){if(!L.placed)continue;
    if(L.kind==='point'){const i=L.points.findIndex(q=>dist2(q,p)<tol*tol*1.5);if(i>=0)return {L,i};}
    else for(let i=0;i<L.segments.length;i++){const [a,b]=L.segments[i];
      if(dist2(a,p)<tol*tol*1.5)return {L,i,end:0};if(dist2(b,p)<tol*tol*1.5)return {L,i,end:1};
      if(segDist(p,a,b)[0]<tol)return {L,i};}}
  return null;
}
function lightDown(e,p){
  const h=lightHit(p);if(!h)return false;sel.light=h.L.id;sel.lightPart=h.i;lightInspector();
  drag={kind:h.L.kind==='point'?'lightPoint':h.end!=null?'lightEnd':'lightSeg',L:h.L,i:h.i,end:h.end,moved:false};draw();return true;
}
function lightMove(p,free){
  const L=drag.L;
  if(drag.kind==='lightPoint'){L.points[drag.i]=snapLightPoint(L,p,free,drag.i);const r=roomAt(L.points[0]);if(r)L.room=r.id;}
  else if(drag.kind==='lightEnd'){ // the strip end slides along its wall
    const seg=L.segments[drag.i],[a,b]=seg,dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),u=[dx/l,dy/l],o=drag.end?a:b;
    let t=(p[0]-o[0])*u[0]+(p[1]-o[1])*u[1];if(!free)t=Math.round(t/GRID)*GRID;
    const q=[+(o[0]+u[0]*t).toFixed(3),+(o[1]+u[1]*t).toFixed(3)];
    if(drag.end&&t>.15)seg[1]=q;else if(!drag.end&&t<-.15)seg[0]=q;
  }
}
function lightRemove(){
  const L=lightById(sel.light);if(!L)return;
  if(L.kind==='point')L.points.splice(sel.lightPart??L.points.length-1,1);else L.segments.splice(sel.lightPart??L.segments.length-1,1);
  if(!(L.kind==='point'?L.points:L.segments).length){L.placed=false;L.room=null;}
  sel.lightPart=null;commit();lightList();lightInspector();
}
function drawLights(){
  if(mode!=='lights'&&!plan.lights.some(l=>l.placed))return;
  for(const L of plan.lights){if(!L.placed)continue;const isSel=L.id===sel.light,col=L.on?L.color:'#9a9a9a';
    if(L.kind==='point')for(const q of L.points){const [X,Y]=S(q);
      if(L.on){const g=ctx.createRadialGradient(X,Y,2,X,Y,sc*.9);g.addColorStop(0,L.color+'66');g.addColorStop(1,L.color+'00');ctx.fillStyle=g;ctx.beginPath();ctx.arc(X,Y,sc*.9,0,7);ctx.fill();}
      ctx.beginPath();ctx.arc(X,Y,isSel?7:5.5,0,7);ctx.fillStyle=col;ctx.fill();ctx.strokeStyle=isSel?'#2f6fd0':'#5a4a2a';ctx.lineWidth=isSel?2.5:1.2;ctx.stroke();}
    else for(const [a,b] of L.segments){ctx.beginPath();ctx.moveTo(...S(a));ctx.lineTo(...S(b));ctx.strokeStyle=col;ctx.lineWidth=isSel?6:4;ctx.lineCap='round';ctx.stroke();ctx.lineCap='butt';
      if(isSel)for(const q of [a,b]){const [X,Y]=S(q);ctx.beginPath();ctx.arc(X,Y,5,0,7);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#2f6fd0';ctx.lineWidth=1.5;ctx.stroke();}}
    if(mode==='lights'&&sc>35){const q=L.kind==='point'?L.points[0]:L.segments[0][0],[X,Y]=S(q);ctx.fillStyle='#3b3320';ctx.font='10.5px system-ui';ctx.textAlign='left';ctx.fillText(L.name,X+8,Y-7);}
  }
  if(placingLight?.preview){const pv=placingLight.preview;ctx.strokeStyle='#2f6fd0';ctx.fillStyle='#2f6fd0';
    if(pv.seg){ctx.beginPath();ctx.moveTo(...S(pv.seg[0]));ctx.lineTo(...S(pv.seg[1]));ctx.lineWidth=5;ctx.stroke();}else{const [X,Y]=S(pv.p);ctx.beginPath();ctx.arc(X,Y,6,0,7);ctx.fill();}}
}
let placingLight=null;
function lightList(){
  const box=$('lightlist');box.innerHTML='<div class="cat-title">Lamps from Home Assistant (by area)</div>';
  const areas=[...new Set(plan.lights.map(l=>l.area))];
  for(const a of areas){const h=document.createElement('div');h.className='area';h.textContent=AREA[a]||a;box.appendChild(h);
    for(const L of plan.lights.filter(l=>l.area===a)){const el=document.createElement('div');el.dataset.id=L.id;el.className='lamp'+(L.placed?' placed':'')+(L.id===sel.light?' sel':'');
      el.innerHTML=`<button class="bulb ${L.on?'on':''}" title="On/off">💡</button><span><b>${L.name}</b><small>${L.entity} · ${L.kind==='point'?'point':'strip'} · ${L.placed?(L.kind==='point'?L.points.length+' pts':L.segments.length+' walls'):'no place'}</small></span>`;
      el.querySelector('.bulb').onclick=e=>{e.stopPropagation();L.on=!L.on;view.setLightOn(L.id,L.on);save();lightList();draw();};
      el.onpointerdown=e=>{if(e.target.closest('.bulb'))return;e.preventDefault();placingLight={L};sel.light=L.id;lightInspector();};
      box.appendChild(el);}}
}
addEventListener('pointermove',e=>{
  if(!placingLight)return;const r=cv.getBoundingClientRect(),X=e.clientX-r.left,Y=e.clientY-r.top;
  if(X<0||Y<0||X>r.width||Y>r.height||e.clientX<$('lightlist').getBoundingClientRect().right){placingLight.preview=null;draw();return;}
  const p=W([X,Y]),L=placingLight.L;
  placingLight.preview=L.kind==='point'?{p:snapLightPoint(L,p,e.shiftKey)}:stripOnWall(p);draw();
});
addEventListener('pointerup',()=>{
  if(!placingLight)return;const {L,preview:pv}=placingLight;placingLight=null;guides=[];
  if(!pv){draw();return;}
  if(L.kind==='point'){const r=roomAt(pv.p);if(!r){draw();return;}L.points.push(pv.p);L.room||=r.id;}
  else{if(L.room&&pv.room!==L.room){$('status').textContent='A strip stays within one room: this wall is in another.';draw();return;}L.segments.push(pv.seg);L.room=pv.room;}
  L.placed=true;sel.light=L.id;commit();lightList();lightInspector();
});
function lightInspector(){
  const box=$('inspector');if(mode!=='lights'){if(mode!=='furniture')box.style.display='none';return;}
  const L=lightById(sel.light);if(!L){box.style.display='none';return;}
  box.style.display='block';
  const H=L.kind==='point'?[['Ceiling',2.52],['Pendant',2.2],['Sconce',1.6]]:[['Cornice',2.5],['Worktop',1.4],['Plinth',.1]];
  box.innerHTML=`<b>${L.name}</b> <small>${L.entity}</small><div class="row">Height <select data-k="h">${H.map(([n,v])=>`<option value="${v}" ${Math.abs(v-L.h)<.01?'selected':''}>${n} ${Math.round(v*100)} cm</option>`).join('')}</select> <input type="color" value="${L.color}"></div>`+
    (L.kind==='point'&&L.room?`<div class="row">Grid <input data-g="r" type="number" min="1" max="6" value="2"> × <input data-g="c" type="number" min="1" max="6" value="2"><button data-a="grid">Place</button></div>`:'')+
    `<div class="row">${L.placed?'<button data-a="del">Remove from plan</button>':'<small>Drag from the list onto the plan</small>'}</div>`;
  box.querySelector('[data-k=h]').onchange=e=>{L.h=+e.target.value;commit();};
  box.querySelector('input[type=color]').onchange=e=>{L.color=e.target.value;commit();lightList();};
  box.querySelector('[data-a=del]')?.addEventListener('click',()=>{L.points=[];L.segments=[];L.placed=false;L.room=null;commit();lightList();lightInspector();});
  box.querySelector('[data-a=grid]')?.addEventListener('click',()=>{ // spots in a grid across the room, 60 cm from the walls
    const r=plan.rooms.find(r=>r.id===L.room),rows=+box.querySelector('[data-g=r]').value,cols=+box.querySelector('[data-g=c]').value;
    const xs=r.polygon.map(v=>v[0]),ys=r.polygon.map(v=>v[1]),x0=Math.min(...xs)+.6,x1=Math.max(...xs)-.6,y0=Math.min(...ys)+.6,y1=Math.max(...ys)-.6;
    const pts=[];for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const q=[+(cols>1?x0+(x1-x0)*j/(cols-1):(x0+x1)/2).toFixed(3),+(rows>1?y0+(y1-y0)*i/(rows-1):(y0+y1)/2).toFixed(3)];if(pointIn(q,r.polygon))pts.push(q);}
    if(pts.length){L.points=pts;commit();lightList();}});
}
$('night').onclick=e=>{const n=!e.target.classList.contains('on');e.target.classList.toggle('on',n);e.target.textContent=n?'Night':'Day';view.setNight(n);};

// ---------- drawing ----------
function draw(){
  const w=cv.width,h=cv.height;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#fbfbfa';ctx.fillRect(0,0,w,h);
  if(ul.show&&ul.img.complete&&ul.a){ctx.globalAlpha=ul.opacity;
    ctx.setTransform(sc*ul.a[0],-sc*ul.a[1],sc*ul.a[1],sc*ul.a[0],ox+sc*ul.b[0],oy-sc*ul.b[1]);ctx.drawImage(ul.img,0,0);
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;}
  // grid: 1 m, and 10 cm when zoomed in
  const [wx0,wy1]=W([0,0]),[wx1,wy0]=W([w,h]);
  for(const [step,col] of [[.1,'rgba(0,0,0,.035)'],[1,'rgba(0,0,0,.09)']]){if(step*sc<6)continue;ctx.strokeStyle=col;ctx.lineWidth=1;ctx.beginPath();
    for(let x=Math.ceil(wx0/step)*step;x<wx1;x+=step){const X=Math.round(S([x,0])[0])+.5;ctx.moveTo(X,0);ctx.lineTo(X,h);}
    for(let y=Math.ceil(wy0/step)*step;y<wy1;y+=step){const Y=Math.round(S([0,y])[1])+.5;ctx.moveTo(0,Y);ctx.lineTo(w,Y);}ctx.stroke();}
  const bad=new Set(errors.flatMap(e=>[e.room,e.other].filter(Boolean)));
  for(const r of plan.rooms){
    const isSel=r.id===sel.room,isBad=bad.has(r.id);
    ctx.beginPath();r.polygon.forEach((v,i)=>{const [X,Y]=S(v);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});ctx.closePath();
    ctx.fillStyle=isBad?'rgba(220,50,40,.22)':isSel?'rgba(47,111,208,.16)':'rgba(120,110,95,.10)';ctx.fill();
    ctx.strokeStyle=isBad?'#d23a2c':isSel?'#2f6fd0':'#5d554b';ctx.lineWidth=isSel?2.2:1.5;ctx.stroke();
    const c=r.polygon.reduce((s,v)=>[s[0]+v[0]/r.polygon.length,s[1]+v[1]/r.polygon.length],[0,0]),[X,Y]=S(c);
    ctx.fillStyle='#2b2722';ctx.font='600 13px system-ui';ctx.textAlign='center';ctx.fillText(r.name,X,Y-2);
    ctx.font='12px system-ui';ctx.fillStyle='#6b645b';ctx.fillText(Math.abs(area(r.polygon)).toFixed(1)+' m²',X,Y+13);
    if(isSel){
      // side lengths inside the room
      const s=area(r.polygon)>0?1:-1;
      r.polygon.forEach((a,i)=>{const b=r.polygon[(i+1)%r.polygon.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l*sc<36)return;
        const m=[(a[0]+b[0])/2,(a[1]+b[1])/2],n=[-(b[1]-a[1])/l*s,(b[0]-a[0])/l*s],[MX,MY]=S([m[0]+n[0]*14/sc,m[1]+n[1]*14/sc]);
        ctx.save();ctx.translate(MX,MY);let ang=-Math.atan2(b[1]-a[1],b[0]-a[0]);if(ang>Math.PI/2)ang-=Math.PI;if(ang<-Math.PI/2)ang+=Math.PI;ctx.rotate(ang);
        ctx.fillStyle='#2f6fd0';ctx.font='11px system-ui';ctx.fillText(Math.round(l*100),0,4);ctx.restore();});
      r.polygon.forEach((v,i)=>{const [X,Y]=S(v);ctx.beginPath();ctx.arc(X,Y,i===sel.vertex?6:4.5,0,7);ctx.fillStyle=i===sel.vertex?'#2f6fd0':'#fff';ctx.fill();ctx.strokeStyle='#2f6fd0';ctx.lineWidth=1.5;ctx.stroke();});
    }
  }
  // openings
  for(const o0 of plan.openings){const o=openingCoords(plan.rooms,o0);if(!o)continue;const [A,B]=[S(o.a),S(o.b)];
    ctx.strokeStyle=o.kind==='door'?'#b5651d':'#3a8fc8';ctx.lineWidth=5;ctx.lineCap='butt';ctx.beginPath();ctx.moveTo(...A);ctx.lineTo(...B);ctx.stroke();}
  if(ghost){ctx.strokeStyle='rgba(20,150,70,.9)';ctx.lineWidth=2;ctx.setLineDash([6,4]);for(const r of ghost){ctx.beginPath();r.polygon.forEach((v,i)=>{const [X,Y]=S(v);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});ctx.closePath();ctx.stroke();}ctx.setLineDash([]);}
  drawFurniture();
  drawLights();
  // snapping guides
  ctx.strokeStyle='rgba(230,60,140,.8)';ctx.lineWidth=1;ctx.setLineDash([4,4]);
  for(const g of guides){ctx.beginPath();if(g.seg){ctx.moveTo(...S(g.seg[0]));ctx.lineTo(...S(g.seg[1]));ctx.lineWidth=3;ctx.stroke();ctx.lineWidth=1;continue;}if(g.x!=null){const X=S([g.x,0])[0];ctx.moveTo(X,0);ctx.lineTo(X,h);}else{const Y=S([0,g.y])[1];ctx.moveTo(0,Y);ctx.lineTo(w,Y);}ctx.stroke();}
  ctx.setLineDash([]);
  if(draft){ctx.strokeStyle='#2f6fd0';ctx.lineWidth=2;ctx.fillStyle='rgba(47,111,208,.12)';ctx.beginPath();
    const pts=draft.kind==='rect'?[draft.a,[draft.b[0],draft.a[1]],draft.b,[draft.a[0],draft.b[1]]]:[...draft.points,hover&&snapPoint(hover)].filter(Boolean);
    pts.forEach((v,i)=>{const [X,Y]=S(v);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});if(draft.kind==='rect')ctx.closePath();ctx.fill();ctx.stroke();
    if(draft.kind==='rect'){const [X,Y]=S(draft.b);ctx.fillStyle='#2f6fd0';ctx.font='12px system-ui';ctx.textAlign='left';
      ctx.fillText(`${Math.round(Math.abs(draft.b[0]-draft.a[0])*100)} × ${Math.round(Math.abs(draft.b[1]-draft.a[1])*100)} cm`,X+8,Y-8);}}
  if(calib)for(const z of calib){const [X,Y]=S(imgToWorld(z));ctx.beginPath();ctx.arc(X,Y,5,0,7);ctx.fillStyle='#e63c8c';ctx.fill();}
}

// ---------- buttons ----------
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('undo').onclick=undo;$('redo').onclick=redo;
$('grid').onclick=e=>{grid=!grid;e.target.classList.toggle('on',grid);};
$('ulop').oninput=e=>{ul.opacity=+e.target.value;ul.show=ul.opacity>0;draw();};
$('calib').onclick=e=>{setTool('underlay');calib=[];e.target.classList.add('on');};
$('ulreset').onclick=()=>{setUnderlay([120,890],[-.02,-.02],[1275,420],[12.57,5.06]);localStorage.removeItem('room-editor-underlay');draw();};
$('reset').onclick=()=>{plan=initial();plan.lights=haLights();sel.room=null;commit();fit();draw();};
$('clear').onclick=()=>{plan={rooms:[],openings:[],furniture:[],lights:haLights()};sel.room=null;commit();setTool('rect');};
$('download').onclick=()=>{const out={units:'m',rooms:plan.rooms,openings:plan.openings.map(o=>openingCoords(plan.rooms,o)).filter(Boolean).map(({at,...o})=>o)};
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{type:'application/json'}));a.download='plan.json';a.click();};
function resize(){const r=cv.parentElement.getBoundingClientRect();const first=!cv.width||cv.width===300;cv.width=r.width;cv.height=r.height;if(first)fit();draw();}
new ResizeObserver(resize).observe(cv.parentElement);
ul.img.onload=draw;
setTool('select');resize();fit();
await loadKenney();buildCatalog();setMode('rooms');update();
// For checks: load a plan from JSON (openings are re-attached) and show an outline for comparison.
let ghost=null;
window.editor={plan:()=>plan,view,S,W,setMode,
  load(json){plan={rooms:json.rooms.map(r=>({id:r.id,name:r.name,polygon:r.polygon})),openings:[],furniture:json.furniture||[],lights:json.lights||haLights()};plan.openings=(json.openings||[]).map(o=>attachOpening(plan.rooms,{bottom:o.kind==='door'?0:.85,top:o.kind==='door'?2.1:2.4,...o})).filter(Boolean);sel.room=null;commit();fit();draw();},
  ghost(rooms){ghost=rooms;draw();}};
document.body.dataset.ready='true';
