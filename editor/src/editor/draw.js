// The plan drawing: dotted background, plan photo (underlay), rooms, walls in section with openings, windows, doors, furniture, lights.
// Colors come from the theme (CSS variables) so the plan matches the light and dark look. Handles of the selection are drawn by the mode.
import {t,num} from '../i18n/i18n.js';
import {area,labelPoint,openingCoords,openingOut,pointIn} from '../core/geometry.js';
import {outline,footRects,isRound} from '../core/layout.js';
import {isRun,runGeo} from '../core/runs.js';
import {zOf,nameOf} from '../core/catalog.js';
import {byId} from '../core/catalog.js';
import {SWING,zoneParts} from '../core/plan.js';
import {formFor,lineForm,FURN_STRIP} from '../core/fixtures.js';

const VARS=['cv','dot','room','room-line','wall','furn','furn-line','win','door','lamp','glow','label','label2','acc','acc2','bad','warn','guide'];
const LABEL_AT=new Map(); // room shape → label position
// the room label position — the roomiest spot inside, away from walls and shafts (labelPoint); computed once per shape
export function labelAt(plan,poly){const near=plan.rooms.filter(r=>r.solid&&r.polygon!==poly).map(r=>r.polygon).filter(h=>h.some(q=>pointIn(q,poly))||poly.some(q=>pointIn(q,h))),
  key=JSON.stringify([poly,near]);let s=LABEL_AT.get(key);if(!s){if(LABEL_AT.size>500)LABEL_AT.clear();s=labelPoint(poly,near);LABEL_AT.set(key,s);}return s;}
export const pal={};
export const FONT='Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif';
export function readPalette(){const s=getComputedStyle(document.documentElement);for(const k of VARS)pal[k.replace('-','_')]=s.getPropertyValue('--'+k).trim();pal.dark=document.documentElement.dataset.theme==='dark';}
export const alpha=(hex,a)=>{const h=hex.replace('#','');if(h.length<6)return hex;const n=parseInt(h.slice(0,6),16);return `rgba(${n>>16},${n>>8&255},${n&255},${a})`;};

export const outward=openingOut; // outward from the opening's room (geometry.js)

export function drawPlan(ed){
  const {v,plan,sel}=ed,{ctx}=v,mode=ed.mode.id;
  v.base();ctx.clearRect(0,0,v.w,v.h);ctx.fillStyle=pal.cv;ctx.fillRect(0,0,v.w,v.h);
  // dotted background: 1 m step, at a large zoom — 50 cm
  const step=v.sc*.5>=16?.5:v.sc>=14?1:v.sc*5>=14?5:0;
  if(step){const [x0,y1]=v.W([0,0]),[x1,y0]=v.W([v.w,v.h]);ctx.fillStyle=pal.dot;
    for(let x=Math.ceil(x0/step)*step;x<x1;x+=step)for(let y=Math.ceil(y0/step)*step;y<y1;y+=step){const [X,Y]=v.S([x,y]);ctx.fillRect(Math.round(X)-1,Math.round(Y)-1,2,2);}}
  // plan photo (underlay) — only the plan lines, the paper is transparent (underlay.js, inkMask)
  if(ed.underlay.ready&&ed.underlay.visible)ed.underlay.draw(v,pal.dark);

  const bad=new Set(ed.errors.flatMap(e=>[e.room,e.other].filter(Boolean)));
  for(const r of plan.rooms){if(r.solid)continue;
    const isSel=mode==='rooms'&&r.id===sel.room,isBad=bad.has(r.id),isHover=ed.hover===r.id;
    v.path(r.polygon);ctx.fillStyle=isBad?alpha(pal.bad,.16):isSel?pal.acc2:pal.room;
    ctx.globalAlpha=ed.underlay.ready&&ed.underlay.visible&&!isSel&&!isBad?.82:1;ctx.fill();ctx.globalAlpha=1;
    // the room whose panel is now under the pointer is slightly tinted: it shows which room the panel belongs to
    if(!isSel&&!isBad&&mode==='rooms'&&ed.mode.tintRoom?.()===r.id){ctx.fillStyle=alpha(pal.acc,.08);ctx.fill();}
    if(isBad||isSel||isHover||!ed.walls2d){ctx.strokeStyle=isBad?pal.bad:isSel||isHover?pal.acc:pal.wall;ctx.lineWidth=isSel||isHover||isBad?2:1.5;ctx.stroke();}
  }
  // walls in section — from the same geometry as 3D
  if(ed.walls2d){ctx.beginPath();for(const poly of ed.walls2d)for(const ring of poly)ring.forEach((p,i)=>{const [X,Y]=v.S(p);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});
    // the “Windows & doors” step with a plan photo (D-044): walls are semi-transparent, the photo lines in them — in a contrasting color, to see
    // where the windows and doors are on the plan (a regular underlay of the same color as the walls would not read through them)
    const see=ed.path?.cur?.()==='open'&&ed.underlay.ready&&ed.underlay.visible;
    ctx.fillStyle=pal.wall;ctx.globalAlpha=see?.5:1;ctx.fill('evenodd');ctx.globalAlpha=1;
    if(see){ctx.save();ctx.clip('evenodd');ed.underlay.draw(v,!pal.dark);ctx.restore();}}
  // railings (an open balcony, a terrace): the low parapet, paler than the walls in section
  if(ed.rails2d?.length){ctx.beginPath();for(const b of ed.rails2d)for(const poly of b.mp)for(const ring of poly)ring.forEach((p,i)=>{const [X,Y]=v.S(p);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});
    ctx.fillStyle=alpha(pal.wall,.3);ctx.fill('evenodd');ctx.strokeStyle=pal.wall;ctx.lineWidth=1;ctx.stroke();}
  // no wall (kitchen-living room) — the room border is dashed
  ctx.strokeStyle=pal.label2;ctx.lineWidth=1;ctx.setLineDash([5,4]);
  for(const r of plan.rooms)(r.wt||[]).forEach((t,i)=>{if(t!==0)return;ctx.beginPath();ctx.moveTo(...v.S(r.polygon[i]));ctx.lineTo(...v.S(r.polygon[(i+1)%r.polygon.length]));ctx.stroke();});
  ctx.setLineDash([]);
  // windows — two thin lines across the opening; doors — a leaf with the swing arc
  for(const o0 of plan.openings){const o=openingCoords(plan.rooms,o0);if(!o)continue;const n=outward(plan.rooms,o);
    // glass across the opening: a window, or a glazed door (with its leaf, if it has one)
    const glass=()=>{ctx.strokeStyle=pal.win;ctx.lineWidth=1.5;for(const k of [.04,.12,.2]){if(k===.12&&v.sc<60)continue;ctx.beginPath();ctx.moveTo(...v.S([o.a[0]+n[0]*k,o.a[1]+n[1]*k]));ctx.lineTo(...v.S([o.b[0]+n[0]*k,o.b[1]+n[1]*k]));ctx.stroke();}};
    if(o.kind==='door'){const L=Math.hypot(o.b[0]-o.a[0],o.b[1]-o.a[1]);if(o.glass)glass();
      // an opening without a door — just a hole in the wall; in old plans wide “doors” (over 1.15 m) are openings too
      if(o.leaf===false||o.swing==null&&L>1.15)continue;
      const sw=SWING[o.swing||0],a=sw.hinge?o.b:o.a,u=sw.hinge?[(o.a[0]-o.b[0])/L,(o.a[1]-o.b[1])/L]:[(o.b[0]-o.a[0])/L,(o.b[1]-o.a[1])/L],inn=sw.out?n:[-n[0],-n[1]];
      ctx.strokeStyle=pal.door;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(...v.S(a));ctx.lineTo(...v.S([a[0]+inn[0]*L,a[1]+inn[1]*L]));ctx.stroke();
      ctx.setLineDash([3,3]);ctx.beginPath();for(let i=0;i<=16;i++){const t=i/16*Math.PI/2,p=[a[0]+(u[0]*Math.cos(t)+inn[0]*Math.sin(t))*L,a[1]+(u[1]*Math.cos(t)+inn[1]*Math.sin(t))*L];const [X,Y]=v.S(p);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);}ctx.stroke();ctx.setLineDash([]);}
    else glass();}
  // furniture: brighter in its own mode
  ctx.globalAlpha=mode==='furniture'?1:.6;ctx.lineJoin='round';
  const flat=f=>byId(f.model)?.soft&&f.h<.05?0:1; // a rug — below, the furniture on top of it
  for(const f of [...plan.furniture].sort((a,b)=>flat(a)-flat(b))){const c=byId(f.model);if(!c)continue;
    const isSel=mode==='furniture'&&f.id===sel.furn,isBad=mode==='furniture'&&ed.conflicts.has(f.id);
    if(isRun(f)){drawRun(ed,f,isSel,isBad);continue;}
    const ol=outline(f),cs=ol.pts;
    // hangs on the wall (wall cabinets, TV) — dashed and more transparent, like on a drawing: the floor-standing one shows underneath
    const hung=zOf(f)>0;v.path(cs);ctx.fillStyle=isBad?alpha(pal.bad,.18):isSel?pal.acc2:pal.furn;if(hung)ctx.globalAlpha*=.55;ctx.fill();if(hung)ctx.globalAlpha/=.55;
    ctx.strokeStyle=isBad?pal.bad:isSel?pal.acc:pal.furn_line;ctx.lineWidth=isSel?1.6:1;if(hung)ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ol.front.forEach((q,i)=>i?ctx.lineTo(...v.S(q)):ctx.moveTo(...v.S(q)));ctx.lineWidth=isSel?2.4:2;ctx.stroke(); // the front side (for an L-shaped one — inside the corner)
    if(mode==='furniture'){const r=cs.length>4?footRects(f)[0]:cs,c=[r.reduce((a,q)=>a+q[0],0)/4,r.reduce((a,q)=>a+q[1],0)/4];
      furnName(ed,f,c,[r[1][0]-r[0][0],r[1][1]-r[0][1]],[r[3][0]-r[0][0],r[3][1]-r[0][1]],isRound(f)?.7:1);}
  }
  ctx.globalAlpha=1;
  // lights: a soft glow and a shape icon; a lamp that is off is gray, without a glow. A lamp that is part of another fixture is not drawn.
  const glow=+pal.glow||.3,lit=mode==='lights'?1:.75;
  // a lamp is selected — it shines brighter, the others much paler (the owner: so it is clear which one is meant); for a part of another
  // fixture — its fixture. This also shows a gap in a strip: at the floor and at the ceiling on the same wall they coincide in the plan
  const selL=mode==='lights'&&plan.lights.find(l=>l.id===sel.light&&l.placed),act=selL?(selL.with||selL.id):null;
  for(const L of plan.lights){if(!L.placed||L.with)continue;const on=L.on,isSel=mode==='lights'&&L.id===sel.light,col=on?(L.color||pal.lamp):pal.label2,form=formFor(L),
    off=!!act&&L.id!==act,fade=off?.2:1,boost=act&&!off?1.8:1;
    if(!lineForm(form)){const small=form==='spots';
      for(const q of L.points){const [X,Y]=v.S(q);
        if(on){const R=Math.max(small?9:14,v.sc*(small?.45:.75))*(boost>1?1.2:1),g=ctx.createRadialGradient(X,Y,1,X,Y,R);g.addColorStop(0,alpha(col,Math.min(.95,glow*lit*boost)*(off?.15:1)));g.addColorStop(1,alpha(col,0));ctx.fillStyle=g;ctx.beginPath();ctx.arc(X,Y,R,0,7);ctx.fill();}
        ctx.globalAlpha=(mode==='lights'?1:.85)*fade;
        const r=(small?3:form==='ceiling'?5.5:4.5)+(isSel?1.5:0);
        // a pendant and a floor lamp — with a ring (shade), a chandelier — larger
        if(form==='pendant'||form==='lamp'){ctx.beginPath();ctx.arc(X,Y,r+3.5,0,7);ctx.strokeStyle=isSel?pal.acc:col;ctx.lineWidth=1.3;ctx.stroke();}
        v.dot(q,r,col,isSel?pal.acc:pal.room,isSel?2.5:1.5);ctx.globalAlpha=1;}}
    else{ // a strip and a line — as solid polylines (piece joints are smooth, the glow does not double); at the floor — slightly inward and thinner
      const paths=[];for(const [a,b] of shiftSegs(plan,L)){const last=paths[paths.length-1],e=last?.[last.length-1];
        if(e&&Math.hypot(e[0]-a[0],e[1]-a[1])<1e-3)last.push(b);else paths.push([a,b]);}
      const trace=pts=>{ctx.beginPath();ctx.moveTo(...v.S(pts[0]));for(const q of pts.slice(1))ctx.lineTo(...v.S(q));
        const f=pts[0],l=pts[pts.length-1];if(pts.length>2&&Math.hypot(f[0]-l[0],f[1]-l[1])<1e-3)ctx.closePath();};
      const w=form==='line'?4:floorStrip(L)?2.4:3;
      for(const pts of paths){ctx.save();ctx.lineCap=ctx.lineJoin='round';if(on&&!off){ctx.shadowColor=col;ctx.shadowBlur=boost>1?18:10;}
        trace(pts);ctx.strokeStyle=col;ctx.globalAlpha=off?.2:mode==='lights'?1:.8;ctx.lineWidth=w+(isSel?2:0);ctx.stroke();ctx.restore();
        if(isSel){ctx.save();ctx.lineCap=ctx.lineJoin='round';trace(pts);ctx.strokeStyle=pal.acc;ctx.lineWidth=1.2;ctx.globalAlpha=.9;ctx.stroke();ctx.restore();}}}
  }
  // room labels
  // on the “Link rooms” step, unlinked ones are paler: it shows what is left
  // by default the lamp sits in the middle of the room — exactly where the label is: then the label moves above the lamp
  const dots=plan.lights.filter(L=>L.placed).flatMap(L=>L.points||[]).map(q=>v.S(q));
  const label=(poly,name,dim,sub)=>{let [X,Y]=v.S(labelAt(plan,poly));ctx.font=`600 12.5px ${FONT}`;const hw=Math.max(ctx.measureText(name).width,44)/2+6;
    const d=dots.find(([x,y])=>Math.abs(x-X)<hw&&y>Y-22&&y<Y+24);if(d)Y=d[1]-26;ctx.textAlign='center';
    ctx.fillStyle=dim?pal.label2:pal.label;ctx.font=`600 12.5px ${FONT}`;ctx.fillText(name,X,Y-2);
    ctx.font=`500 11px ${FONT}`;ctx.fillStyle=pal.label2;ctx.fillText(sub??num(Math.abs(area(poly)),1)+t(' m²'),X,Y+12);};
  // the “Outline” and “Rooms” steps, while only the whole apartment is outlined: it is not a room yet — “Whole home” and the area per
  // documents (the rectangle also includes walls and empty corners, its area is larger than the real one)
  const whole=plan.rooms.length===1&&['rect','split'].includes(ed.path?.cur?.())?plan.rooms[0]:null;
  for(const r of plan.rooms){if(r.solid)continue;const zp=zoneParts(r);
    // two areas in a room: the border is dashed, each part has its own label
    if(zp){ctx.strokeStyle=pal.label2;ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(...v.S(zp.ch[0]));ctx.lineTo(...v.S(zp.ch[1]));ctx.stroke();ctx.setLineDash([]);}
    if(!(mode==='rooms'||v.sc>36))continue;
    if(r===whole){label(r.polygon,t('Whole home'),false,plan.docArea?t('{0} m² per documents',num(plan.docArea)):undefined);continue;}
    label(zp?zp.main:r.polygon,r.name,ed.mode.unnamed?.(r));
    if(zp)label(zp.zone,r.zone.area?ed.areaName(r.zone.area):t('Part of room'),ed.mode.unnamedZone?.(r)||!r.zone.area);}
  if(ed.ghost){ctx.strokeStyle='rgba(20,150,70,.9)';ctx.lineWidth=2;ctx.setLineDash([6,4]);for(const r of ed.ghost){v.path(r.polygon);ctx.stroke();}ctx.setLineDash([]);}
  if(pill)drawPill(ctx);
}
// A floor strip on the plan is 12 cm into the room and thinner, a ceiling one is at the wall: on the same wall they do not merge.
// Only the plan view; in the data and in 3D the strip is where it is. Neighbouring segments are joined at the corner (like an offset outline).
export const FLOOR_SHIFT=.12;
export const floorStrip=L=>formFor(L)==='strip'&&L.h<1&&!FURN_STRIP[L.opt]; // on furniture — where it is
export function shiftSegs(plan,L,segs=L.segments){if(!floorStrip(L))return segs;const r=plan.rooms.find(r=>r.id===L.room);if(!r)return segs;const P=r.polygon,d=FLOOR_SHIFT;
  const sh=segs.map(([a,b])=>{const l=Math.hypot(b[0]-a[0],b[1]-a[1])||1,n=[-(b[1]-a[1])/l,(b[0]-a[0])/l],m=[(a[0]+b[0])/2,(a[1]+b[1])/2],k=pointIn([m[0]+n[0]*.03,m[1]+n[1]*.03],P)?d:-d;
    return {a,b,n:[n[0]*k,n[1]*k]};});
  const out=sh.map(x=>[[x.a[0]+x.n[0],x.a[1]+x.n[1]],[x.b[0]+x.n[0],x.b[1]+x.n[1]]]);
  for(let i=0;i<sh.length;i++){const j=(i+1)%sh.length,A=sh[i],B=sh[j];if(i===j||Math.hypot(A.b[0]-B.a[0],A.b[1]-B.a[1])>1e-6)continue;
    // joint: the intersection of the offset lines
    const p=out[i][0],r1=[out[i][1][0]-p[0],out[i][1][1]-p[1]],q=out[j][0],r2=[out[j][1][0]-q[0],out[j][1][1]-q[1]],den=r1[0]*r2[1]-r1[1]*r2[0];
    if(Math.abs(den)<1e-9)continue;const t=((q[0]-p[0])*r2[1]-(q[1]-p[1])*r2[0])/den,x=[p[0]+r1[0]*t,p[1]+r1[1]*t];out[i][1]=x;out[j][0]=x;}
  return out;}
// a point on the strip (the end of a section) — where it is seen on the plan
export function shiftPoint(plan,L,q,segs=L.segments){if(!floorStrip(L))return q;const sh=shiftSegs(plan,L,segs);let best=null;
  segs.forEach(([a,b],i)=>{for(const [e,k] of [[a,0],[b,1]]){const d=Math.hypot(e[0]-q[0],e[1]-q[1]);if(!best||d<best.d)best={d,p:sh[i][k]};}});return best&&best.d<.05?best.p:q;}
// Snap guides: {x}, {y} — a line across the whole plan, {seg} — a highlighted wall.
export function drawGuides(ed){
  const {v}=ed,{ctx}=v;ctx.strokeStyle=pal.guide;ctx.setLineDash([4,4]);
  for(const g of ed.guides){ctx.beginPath();
    if(g.seg){ctx.setLineDash([]);ctx.lineWidth=3;ctx.moveTo(...v.S(g.seg[0]));ctx.lineTo(...v.S(g.seg[1]));ctx.stroke();ctx.setLineDash([4,4]);continue;}
    if(g.line){ctx.lineWidth=1.2;ctx.moveTo(...v.S(g.line[0]));ctx.lineTo(...v.S(g.line[1]));ctx.stroke();continue;} // the middle of a wall
    ctx.lineWidth=1;if(g.x!=null){const X=v.S([g.x,0])[0];ctx.moveTo(X,0);ctx.lineTo(X,v.h);}else{const Y=v.S([0,g.y])[1];ctx.moveTo(0,Y);ctx.lineTo(v.w,Y);}ctx.stroke();}
  ctx.setLineDash([]);
}
// A size label on the plan (for the selection): a badge in the accent color with white text.
export function dimLabel(v,X,Y,text){const {ctx}=v;ctx.font=`600 11px ${FONT}`;const w=ctx.measureText(text).width+10;
  ctx.fillStyle=pal.acc;ctx.beginPath();ctx.roundRect(X-w/2,Y-9,w,18,6);ctx.fill();ctx.fillStyle=pal.dark?'#0b0c10':'#fff';ctx.textAlign='center';ctx.fillText(text,X,Y+4);return [X-w/2,Y-9,w,18];}
// Built-in cabinet: an outline along the walls (recesses filled, a column cut out), the front of each wall — a bold line.
export function drawRun(ed,f,isSel,isBad,ghost=false){const {v}=ed,{ctx}=v,g=runGeo(ed.plan,f);if(!g)return;
  ctx.beginPath();for(const P of g.outline)for(const r of P)r.forEach((q,i)=>{const [X,Y]=v.S(q);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});
  // hangs on the wall (kitchen wall cabinets) — dashed and more transparent, like straight objects
  const hung=zOf(f)>0,a0=ctx.globalAlpha;ctx.fillStyle=isBad?alpha(pal.bad,.18):isSel||ghost?pal.acc2:pal.furn;if(hung)ctx.globalAlpha=a0*.55;ctx.fill('evenodd');ctx.globalAlpha=a0;
  ctx.strokeStyle=isBad?pal.bad:isSel||ghost?pal.acc:pal.furn_line;ctx.lineWidth=isSel?1.6:1;if(hung)ctx.setLineDash([4,3]);ctx.stroke();
  ctx.beginPath();for(const s of g.sides)if(s.front){ctx.moveTo(...v.S(s.front[0]));ctx.lineTo(...v.S(s.front[1]));}ctx.lineWidth=isSel?2.4:2;ctx.stroke();ctx.setLineDash([]);
  // the name — at the longest front, in the middle of the depth
  if(ghost||ed.mode.id!=='furniture')return;
  const s=g.sides.filter(s=>s.front).reduce((a,b)=>!a||Math.hypot(b.front[1][0]-b.front[0][0],b.front[1][1]-b.front[0][1])>Math.hypot(a.front[1][0]-a.front[0][0],a.front[1][1]-a.front[0][1])?b:a,null);if(!s)return;
  const [p0,p1]=s.front;furnName(ed,f,[(p0[0]+p1[0])/2-s.n[0]*f.d/2,(p0[1]+p1[1])/2-s.n[1]*f.d/2],[p1[0]-p0[0],p1[1]-p0[1]],[s.n[0]*f.d,s.n[1]*f.d]);}

// The object name on the plan — only inside its outline (the owner, 2026-11-07: do not spill over the edges). It does not fit across — along
// the long side (a narrow cabinet at the wall — the label is rotated, read bottom to top, like on a drawing). It does not fit at all — not
// drawn; hovering the object shows the name as a badge over it. c — the center (m), e1, e2 — the rectangle sides (vectors, m),
// k — which share of the sides is usable for text (for a round one — the inscribed rectangle).
function furnName(ed,f,c,e1,e2,k=1){const {v}=ed,{ctx}=v,text=nameOf(f);ctx.font=`500 11px ${FONT}`;ctx.textAlign='center';
  const tw=ctx.measureText(text).width+8,[X,Y]=v.S(c),len=e=>Math.hypot(e[0],e[1])*v.sc*k;
  const fit=[[e1,e2],[e2,e1]].filter(([a,b])=>tw<=len(a)&&16<=len(b)).map(([a])=>{let r=Math.atan2(-a[1],a[0]); // screen: y down
    if(r>=Math.PI/2-1e-3)r-=Math.PI;if(r<-Math.PI/2-1e-3)r+=Math.PI;return r;}).sort((a,b)=>Math.abs(a)-Math.abs(b))[0];
  if(fit!=null){ctx.save();ctx.translate(X,Y);ctx.rotate(fit);ctx.fillStyle=pal.label2;ctx.fillText(text,0,4);ctx.restore();return;}
  if(ed.furnHover===f.id&&!ed.drag)pill={text,X,Y,tw}; // drawn last — over the neighbours and the room labels
}
let pill=null;
function drawPill(ctx){const {text,X,Y,tw}=pill;pill=null;ctx.font=`500 11px ${FONT}`;ctx.textAlign='center';ctx.fillStyle=pal.cv;ctx.strokeStyle=pal.furn_line;ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect(X-tw/2-2,Y-10,tw+4,20,7);ctx.fill();ctx.stroke();ctx.fillStyle=pal.label;ctx.fillText(text,X,Y+4);}
