// Windows and doors in the “Plan” mode. Placed by clicking a wall: its menu has “Door” and “Window” — the opening lands at the click point.
// The selected opening moves along its wall and stretches by its edges (5 cm step, Shift — no step), never leaves the wall
// and does not overlap its neighbours. Menu: type, width (click to type it), “Rotate” the leaf, “⋯” → “No door”, trash.
import {t} from '../../i18n/i18n.js';
import {axisCursor} from '../drag-gesture.js';
import {roomById,wallInfo,wallAt,addOpening,openingGap,setOpeningWidth,turnDoor,SWING,MIN_OPENING,OPENING} from '../../core/plan.js';
import {openingCoords,WALL} from '../../core/geometry.js';
import {pal,dimLabel,outward} from '../draw.js';
import {el} from '../ui.js';
import {icon} from '../icons.js';

const STEP=.05;
export function openingsTool(ed){
  const v=()=>ed.v,plan=()=>ed.plan,sel=()=>ed.sel,cm=x=>Math.round(x*100);
  let drag=null,hover=null,more=false;
  const byId=id=>id&&plan().openings.find(o=>o.id===id);
  const selected=()=>{const o=byId(sel().opening);if(!o&&sel().opening)sel().opening=null;return o||null;};
  // Where the opening is on the plan: ends, along (u), outward (n), the wall band from its inner face (d0) to the outer one (d1).
  function geo(o){const c=openingCoords(plan().rooms,o),r=roomById(plan(),o.at.room);if(!c||!r)return null;
    const L=Math.hypot(c.b[0]-c.a[0],c.b[1]-c.a[1]),u=[(c.b[0]-c.a[0])/L,(c.b[1]-c.a[1])/L],n=outward(plan().rooms,c);
    const W=wallInfo(plan(),r,o.at.edge),d1=W.interior?W.gap+WALL.inner:W.t-WALL.inner;
    return {o,r,a:c.a,b:c.b,L,u,n,d0:-WALL.inner,d1};}
  const at=(g,s,d)=>[g.a[0]+g.u[0]*s+g.n[0]*d,g.a[1]+g.u[1]*s+g.n[1]*d];
  // s along the room side the opening is attached to
  const along=(o,p)=>{const r=roomById(plan(),o.at.room),P=r.polygon,a=P[o.at.edge%P.length],b=P[(o.at.edge+1)%P.length],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
    return ((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/l;};
  const T={};

  // Hit test: the edges of the selected one — width; the opening band — move; in “Select” also the door arc.
  T.hit=(p,tool)=>{const tol=v().tol(),cur=selected(),list=cur?[cur,...plan().openings.filter(o=>o!==cur)]:plan().openings;
    for(const o of list){const g=geo(o);if(!g)continue;const q=[p[0]-g.a[0],p[1]-g.a[1]],s=q[0]*g.u[0]+q[1]*g.u[1],d=q[0]*g.n[0]+q[1]*g.n[1];
      if(d<g.d0-tol*.6||d>g.d1+tol*.6)continue;
      if(o===cur){if(Math.abs(s)<tol)return {kind:'opening',o,end:0};if(Math.abs(s-g.L)<tol)return {kind:'opening',o,end:1};}
      if(s>=0&&s<=g.L)return {kind:'opening',o};}
    if(tool==='select')for(const o of list){if(o.kind!=='door'||o.leaf===false)continue;const g=geo(o);if(!g)continue;
      const sw=SWING[o.swing||0],h=sw.hinge?g.b:g.a,uu=sw.hinge?[-g.u[0],-g.u[1]]:g.u,dir=sw.out?g.n:[-g.n[0],-g.n[1]],q=[p[0]-h[0],p[1]-h[1]];
      if(Math.hypot(...q)<g.L&&q[0]*dir[0]+q[1]*dir[1]>0&&q[0]*uu[0]+q[1]*uu[1]>0)return {kind:'opening',o};}
    return null;};
  T.cursor=h=>{const g=geo(h.o);return g?axisCursor(g.u):'move';};
  T.dragCursor=()=>drag?T.cursor(drag):null;
  T.cancelDrag=()=>{drag=null;};
  T.hover=id=>{if(hover===id)return false;hover=id;return true;};

  T.select=o=>{Object.assign(sel(),{opening:o.id,room:null,wall:null,vertex:null});more=false;ed.view.select(null);};
  T.down=(h,p)=>{T.select(h.o);const o=h.o;drag={o,end:h.end,s:along(o,p),s0:o.at.s0,s1:o.at.s1,g:openingGap(plan(),o)||[o.at.s0,o.at.s1],moved:false};ed.drag=drag;ed.mode.refresh?.();ed.draw();};
  T.move=(p,free)=>{if(!drag)return false;const ds=along(drag.o,p)-drag.s;
    if(!drag.moved&&Math.abs(ds)*v().sc<3)return true;drag.moved=true;
    const snap=x=>free?x:Math.round(x/STEP)*STEP,[g0,g1]=drag.g,o=drag.o;let s0=drag.s0,s1=drag.s1;
    if(drag.end==null){const w=s1-s0;s0=Math.max(g0,Math.min(g1-w,snap(drag.s0+ds)));s1=s0+w;}
    else if(drag.end===0)s0=Math.max(g0,Math.min(s1-MIN_OPENING,snap(drag.s0+ds)));
    else s1=Math.min(g1,Math.max(s0+MIN_OPENING,snap(drag.s1+ds)));
    o.at={...o.at,s0:+s0.toFixed(3),s1:+s1.toFixed(3)};ed.update();return true;};
  T.up=()=>{if(!drag)return false;const moved=drag.moved;drag=null;ed.drag=null;if(moved)ed.commit();else{ed.mode.refresh?.();ed.draw();}return true;};

  // Place from the wall menu: W — the selected wall piece, k — 'door' | 'window'. try — only check whether it fits.
  const place=(W,k,dry)=>{const r=W.room,P=r.polygon,a=P[W.i],b=P[(W.i+1)%P.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const o=addOpening(plan(),r,W.i,(sel().wall?.t??.5)*l,k,{lo:W.seg[0],hi:W.seg[1],outer:!W.interior});
    if(o&&dry)plan().openings.pop();return o;};
  T.can=(W,k)=>!!place(W,k,true);
  T.add=(W,k)=>{const o=place(W,k,false);if(!o)return;T.select(o);ed.commit();};
  // The “Windows & doors” step (D-044): the band of the future opening where the pointer is. W — the wall piece, tt — a point on the room side 0…1.
  // A door width (80 cm) on any wall — a place marker, not a window; offsets from corners and neighbours — the same addOpening.
  // q — pulse phase 0…1: a ring spreads from the band and fades, like on buttons (@keyframes pulse in styles.css); null — no pulse.
  T.ghost=(W,tt,q=null)=>{const r=W.room,P=r.polygon,a=P[W.i],b=P[(W.i+1)%P.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const o=addOpening(plan(),r,W.i,tt*l,'door',{lo:W.seg[0],hi:W.seg[1]});if(!o)return;plan().openings.pop();
    const g=geo(o);if(!g)return;const {ctx}=v(),S=[at(g,0,g.d0),at(g,g.L,g.d0),at(g,g.L,g.d1),at(g,0,g.d1)].map(x=>v().S(x));
    const quad=()=>{ctx.moveTo(...S[0]);for(const x of S.slice(1))ctx.lineTo(...x);ctx.closePath();};ctx.save();
    if(q!=null){const e=1-(1-q)**2;ctx.save();ctx.beginPath();ctx.rect(-1e5,-1e5,2e5,2e5);quad();ctx.clip('evenodd'); // the ring up to 16 px — only outside the band
      ctx.beginPath();quad();ctx.lineJoin='round';ctx.strokeStyle=pal.acc;ctx.globalAlpha=.85*(1-e);ctx.lineWidth=32*e;ctx.stroke();ctx.restore();}
    ctx.beginPath();quad();ctx.globalAlpha=.6;ctx.fillStyle=pal.acc;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=pal.acc;ctx.lineWidth=2;ctx.stroke();ctx.restore();};
  T.del=()=>{const o=selected();if(!o)return false;plan().openings=plan().openings.filter(x=>x!==o);sel().opening=null;ed.commit();return true;};

  T.draw=()=>{const {ctx}=v(),band=(g,fill,stroke)=>{v().path([at(g,0,g.d0),at(g,g.L,g.d0),at(g,g.L,g.d1),at(g,0,g.d1)],true);
      ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}};
    const hv=byId(hover),cur=selected();
    if(hv&&hv!==cur){const g=geo(hv);if(g)band(g,pal.acc2);}
    if(!cur)return;const g=geo(cur);if(!g)return;band(g,pal.acc2,pal.acc);
    const mid=(g.d0+g.d1)/2;for(const s of [0,g.L])v().dot(at(g,s,mid),5,'#fff',pal.acc,2);
    const [X,Y]=v().S(at(g,g.L/2,g.d1+16/v().sc));dimLabel(v(),X,Y,t('{0} cm',cm(g.L)));
    // while dragging — distances to the wall corners
    if(drag?.moved){const r=g.r,o=cur,P=r.polygon,l=Math.hypot(P[(o.at.edge+1)%P.length][0]-P[o.at.edge%P.length][0],P[(o.at.edge+1)%P.length][1]-P[o.at.edge%P.length][1]);
      const [lo,hi]=wallAt(plan(),r,o.at.edge,((o.at.s0+o.at.s1)/2)/l).seg,gaps=[[lo,o.at.s0],[o.at.s1,hi]];
      for(const [x0,x1] of gaps){if(x1-x0<.05)continue;const sm=(x0+x1)/2-o.at.s0,[gx,gy]=v().S(at(g,sm,g.d1+16/v().sc));dimLabel(v(),gx,gy,t('{0} cm',cm(x1-x0)));}}};

  // Panel of the selected opening
  T.ctx=()=>{const o=selected();if(!o)return null;const g=geo(o);if(!g)return null;
    const door=o.kind==='door',leaf=door&&o.leaf!==false;
    const line=el(`<div class="line"><b>${door?o.glass?t('Glass door'):leaf?t('Door'):t('Opening'):t('Window')}</b></div>`),lines=[line];
    const w=el(`<button class="soft" title="${t('Enter width')}">${t('{0} cm',cm(g.L))}</button>`);
    w.onclick=()=>{const [X,Y]=v().S(at(g,g.L/2,(g.d0+g.d1)/2));ed.ask(X,Y,t('Width, cm'),cm(g.L),{type:'len',ok:m=>{setOpeningWidth(plan(),o,m);ed.commit();}});};
    line.append(w);
    if(leaf){const turn=el(`<button class="soft" title="${t('Change door swing')}">${icon('rotate',15)}${t('Rotate')}</button>`);turn.onclick=()=>{turnDoor(o);ed.commit();};line.append(turn);}
    if(door){const mb=el(`<button class="ib ${more?'on':''}" title="${t('More')}">${icon('more',15)}</button>`);mb.onclick=()=>{more=!more;ed.mode.refresh?.();};line.append(mb);}
    const del=el(`<button class="ib bad" title="${t('Remove (Delete)')}">${icon('trash',15)}</button>`);del.onclick=()=>T.del();line.append(del);
    if(!door)lines.push(windowLine(o));
    if(door&&more){const ml=el(`<div class="line more"><label class="tg"><span>${t('No door')}</span><input type="checkbox" data-k="leaf" ${leaf?'':'checked'}><i></i></label>
        <label class="tg" title="${t('A balcony or terrace door: glass in 3D')}"><span>${t('Glass')}</span><input type="checkbox" data-k="glass" ${o.glass?'checked':''}><i></i></label></div>`);
      ml.querySelector('[data-k=leaf]').onchange=e=>{if(e.target.checked)o.leaf=false;else delete o.leaf;if(o.swing==null)o.swing=0;ed.commit();};
      ml.querySelector('[data-k=glass]').onchange=e=>{if(e.target.checked)o.glass=true;else delete o.glass;ed.commit();};lines.push(ml);}
    return lines;};
  // Window: regular (85 cm sill) or panoramic — from the floor almost to the ceiling; height above the floor and window height — as numbers.
  // Panoramic is one that starts at the floor (up to 10 cm): this way the switch tells the truth even after a manual edit.
  const PANO={bottom:0,top:WALL.height-.1},isPano=o=>(o.bottom??OPENING.window.bottom)<=.1;
  function windowLine(o){const ln=el(`<div class="line opts"></div>`),pano=isPano(o),b0=o.bottom??OPENING.window.bottom,t0=o.top??OPENING.window.top;
    for(const [k,name] of [[false,t('Standard')],[true,t('Floor-to-ceiling')]]){const b=el(`<button class="chip ${pano===k?'on':''}">${name}</button>`);
      b.onclick=()=>{if(pano===k)return;Object.assign(o,k?PANO:{bottom:OPENING.window.bottom,top:OPENING.window.top});ed.commit();};ln.append(b);}
    const num=(label,tip,val,set)=>{const lab=el(`<label class="num" title="${tip}">${label}<input inputmode="decimal" value="${cm(val)}"><small>${t('cm')}</small></label>`),inp=lab.querySelector('input');
      inp.onfocus=()=>inp.select();
      inp.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')inp.blur();if(e.key==='Escape'){inp.value=cm(val);inp.blur();}};
      inp.onchange=()=>{const v=parseFloat(inp.value.trim().replace(',','.'));if(!(v>=0)){inp.value=cm(val);return;}set(v/100);ed.commit();};return lab;};
    // the sill moves, the window top (lintel) stays; the top is not above the wall, the window is not lower than 30 cm
    ln.append(num(t('Sill'),t('Sill height from the floor'),b0,v=>{o.bottom=+Math.max(0,Math.min(WALL.height-.3,v)).toFixed(2);o.top=+Math.min(WALL.height,Math.max(t0,o.bottom+.3)).toFixed(2);}),
      num(t('Height'),t('Window height'),t0-b0,v=>{o.bottom=b0;o.top=+Math.min(WALL.height,b0+Math.max(.3,v)).toFixed(2);}));
    return ln;}
  T.anchor=()=>{const o=selected();const g=o&&geo(o);if(!g)return null;
    const q=[at(g,0,g.d0),at(g,g.L,g.d0),at(g,g.L,g.d1),at(g,0,g.d1)],xs=q.map(p=>p[0]),ys=q.map(p=>p[1]);
    return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];};
  T.selected=selected;
  return T;
}
