// The “Furniture” mode: the catalog in the panel, dragging onto the plan, snapping back-to-wall, rotation, sizes.
import {t} from '../../i18n/i18n.js';
import {axisCursor} from '../drag-gesture.js';
import {CATALOG,CATEGORIES,colorOf,TOP,TOPS,byId,zOf,colorsOf,nameOf,lArms} from '../../core/catalog.js';
import {GRID,axes,corners,localXY,snapToWall,inFoot,stackOf} from '../../core/layout.js';
import {WALL,pointIn} from '../../core/geometry.js';
import {isRun,runGeo,runAt,runSet,runStops,ring,faceOf,ringProject,syncRun,RUN_MIN} from '../../core/runs.js';
import {roomAt} from '../../core/plan.js';
import {$,el,esc,section} from '../ui.js';
import {icon} from '../icons.js';
import {pal,dimLabel,drawRun} from '../draw.js';

export function furnitureMode(ed){
  const m={id:'furniture'};let drag=null,placing=null;
  const sizeCursor=(f,handle)=>isRun(f)?runCursor(f,handle):axisCursor(axes(f)[handle==='w'?0:1]);
  m.dragCursor=()=>drag?.kind==='size'?sizeCursor(drag.orig,drag.handle):drag?.kind==='run'?drag.cursor:'move';
  m.cancelDrag=()=>{drag=null;};
  const plan=()=>ed.plan,sel=()=>ed.sel,v=()=>ed.v;
  const find=id=>plan().furniture.find(f=>f.id===id);

  // Size handles in the object's axes ([x, z], z — toward the front): width — on the end, depth — on the front. For an L-shaped one (a corner
  // sofa, corner cabinets) — at the ends of the arms: width — the end of the back arm, depth — the end of the side arm (the owner: stretch
  // a corner sofa both ways; a handle in the middle of the recess cannot be found). w[2] — where the width grows: +1 to the right, −1 to the left.
  function handlesOf(f){const L=lArms(f),W=f.w/2,D=f.d/2;if(!L)return {w:[W,0,1],d:[0,D]};
    const s=f.mx&&!L.u?-1:1;return {w:[s*W,-D+L.back/2,s],d:[s*(-W+L.side/2),D]};}
  function hit(p){
    const tol=v().tol(),flat=f=>byId(f.model)?.soft&&f.h<.05?1:0,order=[...plan().furniture].sort((a,b)=>(b.id===sel().furn)-(a.id===sel().furn)||flat(a)-flat(b)); // a rug goes last: a click on the sofa on top of it selects the sofa
    for(const f of order){
      if(isRun(f)){const g=runGeo(plan(),f);if(!g)continue;const H=g.handles,near=q=>Math.hypot(p[0]-q[0],p[1]-q[1])<tol*1.2;
        if(f.id===sel().furn&&H){if(near(H.a))return {f,handle:'a'};if(near(H.b))return {f,handle:'b'};if(near(H.d.p))return {f,handle:'rd'};}
        if(g.outline.some(P=>pointIn(p,P[0])))return {f};continue;}
      const [lx,lz]=localXY(f,p);
      if(f.id===sel().furn&&byId(f.model).kind==='gen'){
        const H=handlesOf(f);if(Math.hypot(lx-H.w[0],lz-H.w[1])<tol*1.2)return {f,handle:'w'};
        if(Math.hypot(lx-H.d[0],lz-H.d[1])<tol*1.2)return {f,handle:'d'};}
      if(inFoot(f,p))return {f};}
    return null;
  }
  // to a corner and the middle of a wall — within 12 px on screen (no farther than 25 cm): zoomed in — barely pulls, zoomed out — as before
  // at a window — to its center; curtains from the catalog also take the window width with a margin (fit)
  function place(f,p,free,fit){
    // an along-the-walls object — right away over the whole free wall under the pointer (runs.js): up to a corner, a door, a window at its height, other
    // furniture at the wall (fridge, tall cabinet, hood); no wall nearby — it is not placed
    if(isRun(f)){const z=zOf(f),r=runAt(plan(),p,byId(f.model).w,f.d,{z0:z,z1:z+f.h});if(r)runSet(plan(),f,r.room,r.R,r.sa,r.L);else{delete f.a;delete f.b;}ed.guides=[];return;}
    const snap=Math.min(.25,v().tol(12));let s=snapToWall(plan(),f,p,free,snap);
    const c=byId(f.model);if(fit&&c.fit&&s.win){f.w=+Math.max(c.min[0],Math.min(c.max[0],s.win+c.fit)).toFixed(3);s=snapToWall(plan(),f,p,free,snap);}
    ed.guides=[...(s.wall?[{seg:s.wall}]:[]),...(s.mid?[{line:s.mid}]:[]),...(s.edge?[{line:s.edge}]:[])];f.x=s.x;f.y=s.y;f.rot=s.rot;}

  // ---------- distances to walls ----------
  // For the selected object (and while it is dragged from the catalog or across the plan) — dashed distances from its sides to the walls along
  // its axes, in cm to the wall surface: across the width and the depth — to the nearer one; a side flush against a wall — to the opposite one
  // (back to the wall — the passage in front of it). A click on the number — type it exactly: the object moves to that distance (the owner, like in SketchUp).
  let gaps=[],hoverGap=-1;
  function wallGaps(f){const r=!isRun(f)&&roomAt(plan(),[f.x,f.y]);if(!r)return [];const P=r.polygon,[ax,fz]=axes(f),out=[];
    const ray=(o,d)=>{let best=Infinity;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],e=[b[0]-a[0],b[1]-a[1]],den=d[0]*e[1]-d[1]*e[0];if(Math.abs(den)<1e-9)continue;
      const w=[a[0]-o[0],a[1]-o[1]],t=(w[0]*e[1]-w[1]*e[0])/den,u=(w[0]*d[1]-w[1]*d[0])/den;if(t>-1e-6&&u>=-1e-6&&u<=1+1e-6&&t<best)best=t;}return best-WALL.inner;};
    for(const [u,h] of [[ax,f.w/2],[fz,f.d/2]]){
      const sides=[1,-1].map(k=>{const d=[u[0]*k,u[1]*k],o=[f.x+d[0]*h,f.y+d[1]*h];return {d,o,g:ray(o,d)};});
      const s=sides.filter(x=>isFinite(x.g)&&x.g>=.01&&x.g<8).sort((a,b)=>a.g-b.g)[0];if(!s)continue;
      const back=sides.find(x=>x!==s);out.push({...s,room:isFinite(back.g)?Math.max(0,back.g):0,q:[s.o[0]+s.d[0]*s.g,s.o[1]+s.d[1]*s.g]});}
    return out;}
  function drawGaps(f,live){const {ctx}=v();gaps=[];
    wallGaps(f).forEach((g,i)=>{ctx.strokeStyle=pal.acc;ctx.lineWidth=1.2;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(...v().S(g.o));ctx.lineTo(...v().S(g.q));ctx.stroke();ctx.setLineDash([]);
      v().dot(g.q,2.5,pal.acc);const [X,Y]=v().S([(g.o[0]+g.q[0])/2,(g.o[1]+g.q[1])/2]),r=dimLabel(v(),X,Y,t('{0} cm',Math.round(g.g*100)));
      if(!live){if(i===hoverGap){ctx.strokeStyle=pal.dark?'#fff':'#0b0c10';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(...r,6);ctx.stroke();}gaps.push({...g,r,X,Y});}});}
  const gapAt=p=>{const [X,Y]=v().S(p);return gaps.findIndex(g=>X>=g.r[0]-3&&X<=g.r[0]+g.r[2]+3&&Y>=g.r[1]-3&&Y<=g.r[1]+g.r[3]+3);};
  function typeGap(f,g){ed.ask(g.X,g.Y,t('Distance to wall, cm'),Math.round(g.g*100),{type:'len',ok:x=>{const k=g.g-Math.min(x,g.g+g.room); // farther from the wall than the opposite one allows — not possible
    f.x=+(f.x+g.d[0]*k).toFixed(4);f.y=+(f.y+g.d[1]*k).toFixed(4);ed.commit();}});}
  m.down=(e,p)=>{
    if(placing?.click){const f=makeItem(placing);place(f,p,e.shiftKey,true);placing=null;ed.guides=[];if(!placeable(f)){m.refresh();ed.draw();return true;}plan().furniture.push(f);sel().furn=f.id;ed.commit();return true;}
    {const i=gapAt(p),f=find(sel().furn);if(i>=0&&f){typeGap(f,gaps[i]);return true;}}
    const h=hit(p);if(!h)return false;const was=sel().furn;sel().furn=h.f.id;
    drag=isRun(h.f)?runStart(h.f,h.handle,p):h.handle?{kind:'size',f:h.f,handle:h.handle,orig:{...h.f}}:{kind:'move',f:h.f,off:[h.f.x-p[0],h.f.y-p[1]]};
    const changed=was!==h.f.id;ed.drag=drag;if(changed){more=false;m.refresh();}ed.draw();return true;
  };
  m.move=(e,p)=>{
    if(!drag){const gi=gapAt(p),h=gi<0?hit(p):null,hv=h?.f.id||null; // under the pointer — the name, if it did not fit into the outline (draw.js)
      if(gi!==hoverGap||hv!==ed.furnHover){hoverGap=gi;ed.furnHover=hv;ed.draw();}if(gi>=0){v().cv.style.cursor='pointer';return;}
      v().cv.style.cursor=h?(h.handle?sizeCursor(h.f,h.handle):'move'):'grab';return;}
    drag.moved=true;const f=drag.f,free=e.shiftKey;
    if(drag.kind==='run'){runDrag(drag,p,free);ed.update();return;}
    if(drag.kind==='move')place(f,[p[0]+drag.off[0],p[1]+drag.off[1]],free);
    else{const c=byId(f.model),o=drag.orig,[ax,fz]=axes(o),q=x=>free?x:Math.round(x/GRID)*GRID;
      // the width grows from the opposite end (for a mirrored L-shaped one the handle is on the left, it grows to the left)
      if(drag.handle==='w'){const k=handlesOf(o).w[2],L=[o.x-k*ax[0]*o.w/2,o.y-k*ax[1]*o.w/2],w=Math.max(c.min[0],Math.min(c.max[0],q(k*((p[0]-L[0])*ax[0]+(p[1]-L[1])*ax[1]))));
        f.w=+w.toFixed(3);f.x=L[0]+k*ax[0]*w/2;f.y=L[1]+k*ax[1]*w/2;}
      else{const B=[o.x-fz[0]*o.d/2,o.y-fz[1]*o.d/2],d=Math.max(c.min[1],Math.min(c.max[1],q((p[0]-B[0])*fz[0]+(p[1]-B[1])*fz[1])));
        f.d=+d.toFixed(3);f.x=B[0]+fz[0]*d/2;f.y=B[1]+fz[1]*d/2;}
      }
    ed.update();
  };
  m.up=()=>{if(drag){const moved=drag.moved;drag=null;ed.drag=null;ed.guides=[];if(moved)ed.commit();else ed.draw();}};
  m.deselect=()=>{if(sel().furn){sel().furn=null;m.refresh();}};
  m.key=e=>{if(e.key==='Escape'&&placing){placing=null;ed.guides=[];m.refresh();ed.draw();return;}const f=find(sel().furn);if(!f)return;
    if(!e.metaKey&&!e.ctrlKey&&!isRun(f)&&/^[rк]$/.test(e.key.toLowerCase())){f.rot=(f.rot+(e.shiftKey?-15:90)+360)%360;ed.commit();}
    if(e.key==='Delete'||e.key==='Backspace'){plan().furniture=plan().furniture.filter(x=>x!==f);sel().furn=null;ed.commit();}};
  m.draw=()=>{
    const f=find(sel().furn),pf=placing?.item,run=x=>x&&isRun(x);
    if(run(f))drawRunSel(f);
    else if(f){if(byId(f.model).kind==='gen'){const [ax,fz]=axes(f),H=handlesOf(f);for(const [x,z] of [H.w,H.d])v().dot([f.x+ax[0]*x+fz[0]*z,f.y+ax[1]*x+fz[1]*z],5,'#fff',pal.acc,1.8);}
      // the size of the selected one — as a badge below it
      const cs=corners(f).map(q=>v().S(q)),X=cs.reduce((a,q)=>a+q[0],0)/4,Y=Math.max(...cs.map(q=>q[1]));dimLabel(v(),X,Y+16,`${Math.round(f.w*100)} × ${Math.round(f.d*100)}`);}
    if(run(pf))drawRun(ed,pf,false,false,true);
    else if(pf){v().path(corners(pf));v().ctx.fillStyle=pal.acc2;v().ctx.fill();v().ctx.strokeStyle=pal.acc;v().ctx.lineWidth=1.5;v().ctx.stroke();}
    // distances to walls — not for a built-in cabinet: it runs along the walls by itself
    if(pf&&!run(pf))drawGaps(pf,true);else if(f&&!run(f)&&!pf)drawGaps(f,!!drag);else gaps=[];
  };

  // ---------- built-in cabinet (runs.js) ----------
  // Dragged by the ends — the cabinet follows the wall faces and around the corner; by the middle of the front — depth; by the cabinet itself — slides along the walls,
  // into another room — moves there. The ends snap to corners and to the edges of doors and windows (Shift — no snapping).
  const placeable=f=>!isRun(f)||!!runGeo(plan(),f);
  function runBox(f){const g=runGeo(plan(),f);if(!g?.outline.length)return null;const q=g.outline.flatMap(P=>P[0]),xs=q.map(x=>x[0]),ys=q.map(x=>x[1]);
    return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];}
  function runCursor(f,handle){const g=runGeo(plan(),f),fr=g?.sides.filter(s=>s.front)||[];if(!fr.length)return 'move';
    return axisCursor(handle==='rd'?g.handles.d.n:handle==='a'?fr[0].u:fr[fr.length-1].u);}
  function runStart(f,handle,p){const g=runGeo(plan(),f);if(!g)return {kind:'run',f,end:'none',cursor:'move'};
    return {kind:'run',f,end:handle||null,room:g.room,R:g.R,sa:g.sa,L:g.L,sp:ringProject(g.R,p).s,stops:runStops(plan(),g.room,g.R,f.d).stops,dh:g.handles?.d,cursor:handle?runCursor(f,handle):'move'};}
  const wrap=(x,P)=>((x%P)+P*1.5)%P-P/2; // difference around the outline ring: −P/2…P/2
  function runDrag(dr,p,free){const f=dr.f;if(dr.end==='none')return;
    if(dr.end==='rd'){const h=dr.dh,c=byId(f.model),x=p[0]*h.n[0]+p[1]*h.n[1]-h.ref;
      f.d=+Math.max(c.min[1],Math.min(c.max[1],free?x:Math.round(x/GRID)*GRID)).toFixed(3);syncRun(plan(),f);return;}
    if(!dr.end){const r=roomAt(plan(),p);if(r&&r!==dr.room){const R=ring(faceOf(r)),s=ringProject(R,p).s;
      Object.assign(dr,{room:r,R,L:Math.min(dr.L,R.P-.05),sp:s,stops:runStops(plan(),r,R,f.d).stops});dr.sa=s-dr.L/2;}}
    const R=dr.R,P=R.P,s=ringProject(R,p).s,ds=wrap(s-dr.sp,P);dr.sp=s;
    if(dr.end==='a'){dr.sa+=ds;dr.L-=ds;}else if(dr.end==='b')dr.L+=ds;else dr.sa+=ds;
    if(dr.L<RUN_MIN){if(dr.end==='a')dr.sa-=RUN_MIN-dr.L;dr.L=RUN_MIN;}
    if(dr.L>P-.05){if(dr.end==='a')dr.sa+=dr.L-(P-.05);dr.L=P-.05;}
    let sa=dr.sa,L=dr.L;
    if(!free){const tol=Math.min(.25,v().tol(12)),near=x=>{let b=null;for(const q of dr.stops){const o=wrap(q-x,P);if(Math.abs(o)<tol&&(!b||Math.abs(o)<Math.abs(b)))b=o;}return b;};
      if(dr.end==='a'){const o=near(sa);if(o!=null){sa+=o;L-=o;}}
      else if(dr.end==='b'){const o=near(sa+L);if(o!=null)L+=o;}
      else{const o1=near(sa),o2=near(sa+L),o=o1!=null&&(o2==null||Math.abs(o1)<=Math.abs(o2))?o1:o2;if(o!=null)sa+=o;}}
    runSet(plan(),f,dr.room,R,sa,L);}
  function drawRunSel(f){const g=runGeo(plan(),f);if(!g?.handles)return;const H=g.handles;for(const q of [H.a,H.b,H.d.p])v().dot(q,5,'#fff',pal.acc,1.8);
    const b=runBox(f),[X,Y]=v().S([(b[0]+b[2])/2,b[3]]),[,Y2]=v().S([0,b[1]]);dimLabel(v(),X,Math.max(Y,Y2)+16,`${Math.round(f.w*100)} × ${Math.round(f.d*100)}`);}
  // ---------- catalog ----------
  const makeItem=({c,name})=>({id:'f'+Date.now().toString(36),model:c.id,w:c.w,d:c.d,h:c.h,color:c.color,rot:0,x:0,y:0,...(name?{name}:{})});
  addEventListener('pointermove',e=>{
    if(!placing||ed.mode!==m)return;const r=v().cv.getBoundingClientRect(),X=e.clientX-r.left,Y=e.clientY-r.top;
    if(!placing.click&&!placing.dragging){if(Math.hypot(e.clientX-placing.x,e.clientY-placing.y)<6)return;placing.dragging=true;}
    if(X<0||Y<0||X>r.width||Y>r.height||document.elementFromPoint(e.clientX,e.clientY)!==v().cv){placing.item=null;ed.guides=[];ed.draw();return;}
    placing.item||=makeItem(placing);
    place(placing.item,v().W([X,Y]),e.shiftKey,true);ed.draw();
  });
  addEventListener('pointerup',()=>{if(!placing||placing.click)return;if(!placing.dragging){placing.click=true;m.refresh();return;}const f=placing.item;placing=null;ed.guides=[];
    if(f&&placeable(f)){plan().furniture.push(f);sel().furn=f.id;ed.commit();}else{m.refresh();ed.draw();}});
  addEventListener('pointercancel',()=>{if(placing){placing=null;ed.guides=[];m.refresh();ed.draw();}});
  m.leave=()=>{placing=null;ed.guides=[];ed.furnHover=null;};
  // ---------- top row, catalog, panel above the object ----------
  let query='',cat=t('All');
  m.refresh=()=>{
    if(ed.mode!==m)return;
    $('tools').innerHTML='';$('tools').appendChild(ed.selectButton());
    const side=$('side-body');side.innerHTML='';ed.sideHead(t('Catalog'),plan().furniture.length?t('{0} placed',plan().furniture.length):'');
    // the search and the room tags are pinned at the top on a solid background: cards slide under them instead of showing through (the owner)
    const top=el(`<div class="cat-top"></div>`);side.appendChild(top);
    const search=el(`<div class="search">${icon('search',15)}<input type="search" placeholder="${t('Search furniture')}" value="${esc(query)}"></div>`);top.appendChild(search);
    const inp=search.querySelector('input');inp.oninput=()=>{query=inp.value;renderCatalog();};inp.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape')inp.blur();};
    // room tags instead of drop-downs: one is selected, the search covers the whole catalog
    const chips=el(`<div class="chips"></div>`);top.appendChild(chips);
    chips.onwheel=e=>{if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){chips.scrollLeft+=e.deltaY;e.preventDefault();}};
    for(const c of [t('All'),...CATEGORIES]){const b=el(`<button class="${c===cat?'on':''}">${esc(c===t('Kitchen & dining')?t('Kitchen'):c===t('Home office')?t('Office'):c===t('Lighting & decor')?t('Decor'):c)}</button>`);
      b.onclick=()=>{cat=c;chips.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));renderCatalog();};chips.appendChild(b);}
    const holder=el(`<div></div>`);side.appendChild(holder);
    const size=c=>`${Math.round(c.w*100)}×${Math.round(c.d*100)}`;
    function renderCatalog(){
      holder.innerHTML='';const q=query.trim().toLowerCase();
      const own=byId('custom'),rank=c=>{const i=TOP.indexOf(c.id);return i<0?999:i;};
      const items=CATALOG.filter(c=>c.hidden||c===own?false:q?(c.name+' '+c.cat+' '+(c.tags||'')).replace(/\u00ad/g,'').toLowerCase().includes(q):cat===t('All')||c.cat===cat||c.also?.includes(cat)); // “kitchen” also finds the kitchen cabinets, “oven” — the hob and the tall cabinet
      if(!q&&cat!==t('All'))items.sort((a,b)=>rank(a)-rank(b)); // in a category the frequent ones go first
      const grid=el(`<div class="catalog"></div>`);holder.appendChild(grid);
      const card=(c,name)=>{const it=el(`<button type="button" class="item ${placing?.c===c?'on':''}" title="${t('Select an item, then click the plan. You can also drag it.')}" aria-label="${esc(name||c.name)}"><img src="${ed.thumbs?.[c.id]||''}" draggable="false" alt="">${c.kind==='gen'?`<span class="rs" title="${t('Any size')}">${icon('resize',12)}</span>`:''}<b>${esc(name||c.name)}</b><small>${size(c)}</small></button>`);
        it.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();placing={c,name,x:e.clientX,y:e.clientY};};
        it.onclick=e=>{if(e.detail===0){placing={c,name,click:true};m.refresh();}};grid.appendChild(it);};
      const head=t=>grid.appendChild(el(`<div class="cat-h">${esc(t)}</div>`));
      // “All” without a search — frequent ones first, then by room; the custom object goes last everywhere
      if(!q&&cat===t('All')){head(t('Popular'));TOP.map(byId).forEach(c=>card(c));for(const k of CATEGORIES){const rest=items.filter(c=>c.cat===k&&rank(c)===999);if(rest.length){head(k);rest.forEach(c=>card(c));}}head(t('Not in the catalog'));}
      else items.forEach(c=>card(c));
      if(q&&!items.length)holder.insertBefore(el(`<p class="empty">${t('Not found — add a custom item; the name is filled in.')}</p>`),grid);
      card(own,q&&!items.length?query.trim().replace(/^./,x=>x.toUpperCase()):null);
      const foot=el(`<div class="foot"></div>`);holder.appendChild(foot);
      const placed=section(foot,'placed',t('Placed'),{count:plan().furniture.length||'',open:false});
      if(!plan().furniture.length)placed.appendChild(el(`<p class="empty">${t('Drag an item from the catalog onto the plan.')}</p>`));
      for(const f of plan().furniture){const c=byId(f.model);
        const row=el(`<div class="row ${f.id===sel().furn?'sel':''} ${ed.conflicts.has(f.id)?'warn':''}"><span class="name">${esc(nameOf(f))}</span><small>${Math.round(f.w*100)}×${Math.round(f.d*100)}</small><button class="x ib" title="${t('Delete')}">${icon('x',14)}</button></div>`);
        row.onclick=()=>ed.select('furn',f.id);row.querySelector('.x').onclick=e=>{e.stopPropagation();plan().furniture=plan().furniture.filter(x=>x!==f);ed.commit();};
        placed.appendChild(row);}
    }
    renderCatalog();
    ctxPanel();stepBanner();
  };
  let more=false;
  function ctxPanel(){
    const f=find(sel().furn);if(!f){ed.showCtx(null);return;}
    const c=byId(f.model),cm=x=>Math.round(x*100),line=el(`<div class="line"><b>${esc(c.name)}</b></div>`);
    if(c.id==='custom'){const nm=el(`<input class="nm" value="${esc(f.name||'')}" placeholder="${t('Name it')}" title="${t('Item name')}">`);nm.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')nm.blur();};
      nm.onchange=()=>{const t=nm.value.trim();if(t)f.name=t;else delete f.name;ed.commit();};line.firstChild.replaceWith(nm);}
    // stacked on top of each other — a switch instead of the name: bottom to top, the selected one highlighted (the owner: a hanging one cannot be selected by click)
    const stack=stackOf(plan(),f);if(stack.length>1){const seg=el(`<span class="stack" title="${t('Stacked on top of each other — choose which one to edit')}"></span>`),own=line.firstChild;
      for(const g of stack){if(g===f&&c.id==='custom'){seg.append(own);continue;}const b=el(`<button class="chip ${g===f?'on':''}">${esc(nameOf(g))}</button>`);
        b.onclick=()=>{if(g!==f){more=false;ed.select('furn',g.id);}};seg.append(b);}
      line.prepend(seg);if(own.parentNode===line)own.remove();}if(c.kind==='gen'&&c.color)line.appendChild(el('<span class="sep"></span>'));
    if(c.kind==='gen'&&c.color)for(const k of colorsOf(c)){const [n,hex]=colorOf(c,k);const b=el(`<button class="sw ${k===f.color?'on':''}" title="${n}" style="background:#${hex.toString(16).padStart(6,'0')}"></button>`);b.onclick=()=>{f.color=k;ed.commit();};line.appendChild(b);}
    const rot=el(`<button class="ib" title="${t('Rotate 90° (R)')}">${icon('rotate',15)}</button>`);rot.onclick=()=>{f.rot=(f.rot+90)%360;ed.commit();};
    const del=el(`<button class="ib bad" title="${t('Remove (Delete)')}">${icon('trash',15)}</button>`);del.onclick=()=>{plan().furniture=plan().furniture.filter(x=>x!==f);sel().furn=null;ed.commit();};
    if(!isRun(f))line.append(el('<span class="sep"></span>'),rot);
    if(c.mirror){const mb=el(`<button class="ib ${f.mx?'on':''}" title="${t('Mirror: left or right')}">${icon('swap',15)}</button>`);mb.onclick=()=>{f.mx=!f.mx;if(!f.mx)delete f.mx;ed.commit();};line.append(mb);}
    const lines=[line];
    if(c.vars){const vl=el(`<div class="line opts"></div>`),cur=f.v||c.vars[0][0]; // variants of one object — as chips, like for a strip
      for(const [k,n] of c.vars){const b=el(`<button class="chip ${k===cur?'on':''}">${esc(n)}</button>`);b.onclick=()=>{if(k===cur)return;
        // a sofa bed unfolded — deeper toward the front, the backrest stays at the wall
        // a variant may have its own sizes ({w,d,h}: a top-loading washer is narrower, a folded dryer rack is thinner) — the back stays at the wall
        const opt=x=>c.vars.find(q=>q[0]===x)[2],ext=x=>typeof opt(x)==='number'?opt(x):0,to=opt(k);let dd=ext(k)-ext(cur);
        if(to&&typeof to==='object'){for(const q of ['w','h'])if(to[q])f[q]=to[q];if(to.d){dd=to.d-f.d;}if(to.z!=null){if(Math.abs(to.z-(c.lift??0))<.001)delete f.z;else f.z=to.z;}}
        if(dd){const [,fz]=axes(f);f.d=+(f.d+dd).toFixed(3);f.x=+(f.x+fz[0]*dd/2).toFixed(4);f.y=+(f.y+fz[1]*dd/2).toFixed(4);}
        f.v=k;ed.commit();};vl.appendChild(b);}lines.push(vl);}
    // the worktop: one for the whole kitchen — every unit with a worktop in this room gets it
    if(c.tops){const tl=el(`<div class="line opts"><small>${t('Worktop')}</small></div>`),cur=TOPS[f.top]?f.top:'stone',room=roomAt(plan(),[f.x,f.y]);
      for(const [k,[n,hex]] of Object.entries(TOPS)){const b=el(`<button class="sw ${k===cur?'on':''}" title="${esc(n)}" style="background:#${hex.toString(16).padStart(6,'0')}"></button>`);
        b.onclick=()=>{if(k===cur)return;for(const g of plan().furniture)if(byId(g.model)?.tops&&(g===f||room&&roomAt(plan(),[g.x,g.y])===room)){if(k==='stone')delete g.top;else g.top=k;}ed.commit();};tl.appendChild(b);}
      lines.push(tl);}
    if(c.kind==='gen'){const mb=el(`<button class="ib ${more?'on':''}" title="${t('Exact size')}">${icon('more',15)}</button>`);mb.onclick=()=>{more=!more;ctxPanel();};line.append(mb);
      if(more){const ml=el(`<div class="line more"></div>`);
        for(const [k,l,i] of [['w',t('W'),0],['d',t('D'),1],['h',t('H'),2]]){const lab=el(`<label>${l}<input type="number" step="5" value="${cm(f[k])}"></label>`),x=lab.querySelector('input');
          x.onkeydown=e=>e.stopPropagation();x.onchange=()=>{const val=+Math.max(c.min[i],Math.min(c.max[i],(+x.value||0)/100)).toFixed(3);
            // for a built-in cabinet the width is the length along the walls: the end goes further along the outline (and around the corner)
            if(isRun(f)&&k==='w'){const g=runGeo(plan(),f);if(g)runSet(plan(),f,g.room,g.R,g.sa,g.L+val-f.w);}else{f[k]=val;if(isRun(f))syncRun(plan(),f);}ed.commit();};ml.appendChild(lab);}
        if('lift' in c){const lab=el(`<label title="${t('Bottom edge above floor')}">${t('Above floor')}<input type="number" step="5" value="${cm(zOf(f))}"></label>`),x=lab.querySelector('input');
          x.onkeydown=e=>e.stopPropagation();x.onchange=()=>{const z=+Math.max(0,Math.min(2.6-f.h,(+x.value||0)/100)).toFixed(3);if(Math.abs(z-c.lift)<.001)delete f.z;else f.z=z;ed.commit();};ml.appendChild(lab);}
        ml.appendChild(el(`<small>${t('cm')}</small>`));lines.push(ml);}}
    else line.append(el(`<small>${t('{0}×{1} cm',cm(f.w),cm(f.d))}</small>`));
    line.append(del);
    ed.showCtx(lines);
  }
  m.anchor=()=>{const f=find(sel().furn);if(!f)return null;if(isRun(f)){const b=runBox(f);return b&&[b[0],b[1],b[2],b[3]];}const cs=corners(f),xs=cs.map(q=>q[0]),ys=cs.map(q=>q[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];};
  m.status=()=>'';
  // ---------- “Furniture” wizard step ----------
  // Between “Link rooms” and “Lights” (the owner: lighting is often on furniture — the kitchen plinth, under cabinets, under the bed).
  // Short: place the furniture (lighting is not mentioned in the text — the owner: unclear what it is), not ready — “For later”. When on — the project has ui.wiz[id] = {furn:true}.
  const wizOn=()=>!!ed.wizard?.get(plan().id)?.furn;m.wizardOn=wizOn;
  let stepKey=null;m.reset=()=>{stepKey=null;placing=null;};
  function stepBanner(){
    if(!wizOn()){if(stepKey!=null){stepKey=null;if(ed.stepNow()?.mode===m)ed.step(null);}return;}
    const has=plan().furniture.length>0,key=has+'|'+!!placing?.click;if(stepKey===key&&ed.stepNow()?.mode===m)return;stepKey=key;
    ed.step(`${t('Place furniture from the catalog.')}<small>${t('Select an item, then click the plan. You can also drag it.')}</small><small>${t('No need to add everything now — you can add more later.')}</small>`,
      [[has?t('Done'):t('For later'),()=>ed.path.after('furniture',{defer:!has}),has]],null,
      {id:'furniture',short:placing?.click?t('Click the plan to place the item.'):undefined});}
  function toLights(){ed.wizard.set(plan().id,{lights:true});stepKey=null;ed.step(null);ed.modes.lights?.reset?.();ed.setMode('lights');}
  return m;
}
