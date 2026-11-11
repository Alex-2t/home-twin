// The “Plan” mode: rooms. Selecting and dragging corners, walls and rooms; rectangle; “Split” — cutting a room with a line.
// Wall: a click opens the menu (length, add a corner, remove the wall); a separate wall's thickness — only if enabled in the settings.
import {t} from '../../i18n/i18n.js';
import {axisCursor} from '../drag-gesture.js';
import {area,dist2,segDist,pointIn,offsetVar,WALL,RAIL} from '../../core/geometry.js';
import {floorColor} from '../../core/scene.js';
import {FLOOR_KINDS,FLOOR_QUICK,FLOOR_GROUPS,floorKind,floorSwatch,floorBase,WALL_KINDS,WALL_QUICK,WALL_GROUPS,roomWall,sideWall,wallSwatch,wallBase} from '../../core/surfaces.js';
import {GRID} from '../../core/layout.js';
import {addRoom,removeRoom,insertVertex,removeVertex,linkedEdges,moveEdges,setEdgeLength,snapshot,roomById,wallInfo,setWallThickness,setWallOpen,setRail,settleRoom,cutChord,splitPolygon,splitRoom,mergeRooms,wallAt,absorbRoom,zoneParts,moveZone,zoneFromEdge} from '../../core/plan.js';
import {setRoomArea} from '../../core/layout.js';
import {$,el,esc,fmtArea,popover,panelPop,closePop,popClosedAt} from '../ui.js';
import {icon} from '../icons.js';
import {pal,FONT,dimLabel,labelAt} from '../draw.js';
import {openingsTool} from './openings.js';

// the “draw a rectangle” step — one text for the “Draw from scratch” start, ⌘Z after the first rectangle and “Split” without rooms
export const DRAW_RECT=`${t('Mark two opposite corners of your apartment.')}<small>${t('Draw a rectangle that fits your whole home.')}</small>`;
export function roomsMode(ed){
  let tool='select',drag=null,draft=null,hover=null,lastClick={},hoverWall=null,aim=null,aimKey=null,thickMore=false,cut=null,dimHits=[],buildPop=null;
  // Typical thicknesses (for handle snapping, when per-wall thickness is enabled).
  const PRESETS={in:[.10,.12,.20,.30],out:[.25,.30,.38,.51,.64]};
  const each=()=>ed.prefs?.wallEach;
  const len=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
  const cm=x=>Math.round(x*100);
  // The selected wall: sel.wall = {room, i} — a room side; the wall info is fresh every time (after edits the sides move).
  const wallOf=w=>{const r=w&&roomById(plan(),w.room);if(!r||w.i>=r.polygon.length)return null;
    const W=wallAt(plan(),r,w.i,w.t??.5),[lo,hi]=W.seg;W.ea=W.a;W.eb=W.b;
    W.a=[W.ea[0]+W.u[0]*lo,W.ea[1]+W.u[1]*lo];W.b=[W.ea[0]+W.u[0]*hi,W.ea[1]+W.u[1]*hi];return W;};
  const selWall=()=>wallOf(sel().wall);
  // The wall band from room A: from its inner face to the outer one (or to the neighbour's face).
  const span=W=>W.interior?W.gap+WALL.inner:W.t-WALL.inner;
  const faceMid=W=>{const m=[(W.a[0]+W.b[0])/2,(W.a[1]+W.b[1])/2],d=span(W);return [m[0]+W.n[0]*d,m[1]+W.n[1]*d];};
  // the thickness label is on the wall axis, slightly to the side along it, so as not to cover the handle
  const bandMid=W=>{const m=[(W.a[0]+W.b[0])/2,(W.a[1]+W.b[1])/2],d=(span(W)-WALL.inner)/2,k=Math.min(34/v().sc,Math.hypot(W.b[0]-W.a[0],W.b[1]-W.a[1])/3);
    return [m[0]+W.n[0]*d+W.u[0]*k,m[1]+W.n[1]*d+W.u[1]*k];};
  const inMP=(p,mp)=>mp.some(([outer,...holes])=>pointIn(p,outer)&&!holes.some(h=>pointIn(p,h)));
  const m={id:'rooms'},ops=openingsTool(ed);
  m.dragCursor=()=>ops.dragCursor()||(drag?drag.kind==='edge'||drag.kind==='zoneline'?axisCursor(drag.n):drag.kind==='zonehandle'?axisCursor(drag.nIn):drag.kind==='thick'?axisCursor(drag.W.n):'move':null);
  m.cancelDrag=()=>{drag=null;draft=null;cut=null;ops.cancelDrag();};
  const v=()=>ed.v,plan=()=>ed.plan,sel=()=>ed.sel;
  // internal: called only by ed.setTool (the single tool state machine in app.js)
  // The “rectangle → split” wizard follows the plan, not the clicks: ⌘Z or deleting the only room
  // go back to “Draw a rectangle”, the room is back — “Split” again. Finished — via “Done”.
  const RECT_STEP=[DRAW_RECT,[],ed.aim.photo];
  const SPLIT_STEP=`${t('Split into rooms: a click adds a wall.')}<small>${t('Tip: all horizontal walls first, then vertical ones. Delete extras later.')}</small><small>${t('Select and delete any extra area outside your apartment.')}</small><small>${t('You can also paint the floor and walls: select a room with the arrow.')}</small>`;
  // a strip above the bottom bar, does not move; after the first split — on one line (the owner)
  const SPLIT_O=()=>({id:'split',fixed:true});
  const OPEN_STEP=`${t('Now windows and doors: click a wall where they are in the photo and choose “Window” or “Door”. When all are added, click “Done”.')}<small>${t('Drag an opening along the wall or by its edges. Delete extras.')}</small>`;
  // The “Link rooms” step: the wizard itself goes in order (top to bottom, left to right), highlights a room without a link and
  // asks for its area; a click on another room selects that one instead. Shafts and pieces smaller than 1 m² are not asked about.
  const linkable=()=>plan().rooms.filter(r=>!r.solid&&Math.abs(area(r.polygon))>=SMALL);
  const reading=rs=>{const k=r=>{const ys=r.polygon.map(q=>q[1]),xs=r.polygon.map(q=>q[0]);return [-Math.round(Math.max(...ys)*2),Math.min(...xs)];};
    return [...rs].sort((a,b)=>{const ka=k(a),kb=k(b);return ka[0]-kb[0]||ka[1]-kb[1];});};
  // The step cell is the whole room or a part of it, if it has two areas (a border without a wall, room.zone).
  const cells=()=>linkable().flatMap(r=>{const zp=zoneParts(r);return zp?[{r,z:false,poly:zp.main},{r,z:true,poly:zp.zone}]:[{r,z:false,poly:r.polygon}];});
  const cellArea=c=>c.z?c.r.zone.area:c.r.area,cellSkip=c=>c.z?c.r.zone.noArea:c.r.noArea;
  const readingCells=cs=>{const k=c=>[-Math.round(Math.max(...c.poly.map(q=>q[1]))*2),Math.min(...c.poly.map(q=>q[0]))];
    return [...cs].sort((a,b)=>{const ka=k(a),kb=k(b);return ka[0]-kb[0]||ka[1]-kb[1];});};
  const curCell=()=>{if(wiz?.at!=='names')return null;const cs=cells(),w=wiz.cur,c=w&&cs.find(c=>c.r.id===w.id&&c.z===!!w.z);if(c)return c;
    return readingCells(cs).find(c=>!cellArea(c)&&!cellSkip(c))||null;};
  const curRoom=()=>curCell()?.r||null;
  // nothing done on the step — the button honestly says “Skip”, something done — “Done”
  function openStep(){const has=plan().openings.length>0,W=selWall(),choose=W&&!W.open&&['window','door'].some(k=>ops.can(W,k)),state=sel().opening?'edit':choose?'choose':'wall',key=has+'|'+state;
    if(wiz.opened===key)return;wiz.opened=key;
    const short=state==='edit'?t('Move the opening and drag its edges.'):state==='choose'?t('Choose “Window” or “Door”.'):t('Click a wall to add a window or door.');
    // The instruction at the bottom, the focus on the selected wall's actions, without a frame around the whole plan.
    ed.step(OPEN_STEP,[[has?t('Done'):t('For later'),()=>has?openDone():ed.path.after('open',{defer:true}),has]],null,{id:'open',fixed:true,compact:true,short});}
  // “Done” without a single window — ask again (the owner): doors were placed but windows forgotten. The answer is for this time only.
  function openDone(){if(plan().openings.some(o=>o.kind==='window')){ed.path.after('open');return;}
    ed.banner(t('You haven’t added any windows. Continue anyway?'),
      [[t('Continue'),()=>{ed.banner();ed.path.after('open');}],[t('Add windows'),()=>ed.banner(),true]]);}
  // “Rooms”: until split — “Skip” is unobtrusive (it was tempting to press “Done” just to make the card go away — the owner)
  function splitStep(){const has=plan().rooms.length>1;if(wiz.splitHas===has)return;wiz.splitHas=has;
    ed.step(SPLIT_STEP,[[has?t('Done'):t('One room'),()=>ed.path.after('split'),has]],null,SPLIT_O());}
  function areasStep(){const rs=cells(),n=rs.filter(cellArea).length,k=rs.filter(c=>!cellArea(c)&&cellSkip(c)).length,left=rs.length-n-k;
    const used=new Set(plan().rooms.flatMap(r=>[r.area,zoneParts(r)&&r.zone.area])),rest=ed.ha.areas().filter(a=>!used.has(a.area_id)).map(a=>a.name);
    const key=[n,k,rs.length,rest.join()].join('/');if(wiz.named===key)return;wiz.named=key;
    const tail=k?t('Linked {0} of {1} · skipped {2}.',n,rs.length,k):t('Linked {0} of {1}.',n,rs.length);
    ed.step(`${t('Choose a room from Home Assistant so we can find its lights and sensors.')}<small>${tail}${rest.length?' '+t('Not on the plan: {0}.',esc(rest.join(', '))):''}</small>`,
      [[left||k?t('Finish later'):t('Done'),()=>ed.path.after('names',{defer:!!(left||k)}),!left&&!k]],null,
      {id:'names',short:left?t('Link rooms to Home Assistant.')+' '+tail:tail});}
  // next — the “Furniture” step (modes/furniture.js), after it “Lights” (modes/lights.js): lighting is often on furniture
  function toFurniture(){wiz=null;ed.step(null);ed.wizard?.set(plan().id,{furn:true});ed.modes.furniture?.reset?.();ed.setMode('furniture');}
  function toLights(){wiz=null;ed.step(null);ed.wizard?.set(plan().id,{lights:true});ed.modes.lights?.reset?.();ed.setMode('lights');} // the step from scratch — from the first room
  m.unnamed=r=>wiz?.at==='names'&&!r.area&&!r.solid;
  m.unnamedZone=r=>wiz?.at==='names'&&!r.zone?.area;
  let wiz=null;
  // a new plan: the wizard is as it was left in this project (after a reload the step is in place), taken on the first draw
  let restore=false;
  m.reset=()=>{wiz=null;restore=true;};
  const persist=()=>ed.wizard?.set(plan().id,wiz&&{open:!!wiz.open,names:!!wiz.names});
  // for the test panel: which step the wizard is on and jumping to a step ('rect' | 'split' | 'open' | 'names' | 'furniture' | 'lights' | null — no wizard)
  m.wizardPhase=()=>wiz?.at||null;
  m.wizardAt=at=>{if(!at){wiz=null;persist();ed.step(null);return;}if(at==='lights'){toLights();return;}if(at==='furniture'){toFurniture();return;}wiz={back:null,at:null,open:at==='open'||at==='names',names:at==='names'};wizard();};
  function wizard(){
    if(restore&&ed.mode===m){restore=false;const s=ed.wizard?.get(plan().id);if(s&&!s.lights&&!s.furn&&!s.sens&&!s.fin&&!s.view&&!wiz)wiz={back:null,at:null,...s};}
    if(!wiz||ed.mode!==m)return;const at=!plan().rooms.length?'rect':wiz.names?'names':wiz.open?'open':'split';
    if(wiz.at===at){if(at==='names')areasStep();if(at==='open')openStep();if(at==='split')splitStep();return;}wiz.at=at;persist();
    if(at==='rect'){wiz.open=wiz.names=false;ed.step(...(wiz.back||RECT_STEP));ed.setTool('rect');}
    else if(at==='open'){wiz.opened=null;openStep();ed.setTool('select');}
    else if(at==='names'){wiz.named=null;wiz.cur=null;sel().room=null;areasStep();ed.setTool('select');}
    else{sel().room=null;wiz.splitHas=null;splitStep();ed.setTool('split');
      // the whole apartment is outlined — zoom in right away, to the full height: splitting is more precise (the owner)
      if(plan().rooms.length===1)ed.fit(plan().rooms[0].polygon,{card:true,pad:16});}}
  m.setTool=t=>{tool=t;draft=null;cut=null;xRoom=null;stopHover();closeHint();
    // Creation was chosen explicitly: the previous selection must not swallow the first click on the plan.
    if(['rect','poly','split'].includes(t)){sel().room=null;sel().wall=null;sel().opening=null;sel().vertex=null;ed.view.select(null);hoverWall=null;ops.hover(null);}
    if(t==='split'){cutDir=null;cutLock=false;cutRoom=null;mv=[0,0];lastP=null;}
    m.refresh();ed.draw();v().cv.style.cursor=t==='select'?'':'crosshair';};
  m.tool=()=>tool;

  // Circles for two areas: for the room highlighted on the step without a division — in the middle of each side longer than 60 cm,
  // right on its line (the circle catches the click before the wall; by the rest of the line the wall is dragged as usual); for a divided
  // room — in the middle of the border (the “Link rooms” step or the selected room).
  function zoneHandles(){const out=[];if(tool!=='select'||ed.mode!==m)return out;
    const cc=curCell();
    if(cc&&!sel().room&&!zoneParts(cc.r)){const P=cc.r.polygon,s=area(P)>0?1:-1;
      P.forEach((a,i)=>{const b=P[(i+1)%P.length],L=len(a,b);if(L<.6)return;const u=[(b[0]-a[0])/L,(b[1]-a[1])/L],nIn=[-u[1]*s,u[0]*s];
        out.push({kind:'zonehandle',room:cc.r,i,a,nIn,p:[(a[0]+b[0])/2,(a[1]+b[1])/2]});});}
    for(const r of plan().rooms){const zp=zoneParts(r);if(zp&&(wiz?.at==='names'||sel().room===r.id))out.push({kind:'zoneline',room:r,zp,p:[(zp.ch[0][0]+zp.ch[1][0])/2,(zp.ch[0][1]+zp.ch[1][1])/2]});}
    return out;}
  // ---------- hit testing and snapping ----------
  // The “Windows & doors” step (D-044): where the opening will land — the wall under the pointer, otherwise the nearest wall of the room under the pointer
  // (outside the apartment — up to 36 px). The band of the future opening “runs” along it, a click selects the wall at that same point.
  const aimOn=()=>wiz?.at==='open'&&tool==='select'&&!drag&&!sel().opening;
  function openAim(p,h){if(h?.kind==='edge')return {room:h.room,i:h.i,t:h.t};if(h&&h.kind!=='room')return null;
    const lim=h?Infinity:36/v().sc;let best=null;
    for(const r of h?[h.room]:plan().rooms){if(r.solid)continue;const P=r.polygon;
      for(let i=0;i<P.length;i++){const [d,t]=segDist(p,P[i],P[(i+1)%P.length]);if(d<lim&&(!best||d<best.d))best={d,room:r,i,t};}}
    const W=best&&wallOf({room:best.room.id,i:best.i,t:best.t});return W&&!W.open?best:null;}
  // while the band is visible, a ring spreads from it — once every 1.4 s, like on pulsing buttons
  let ghostTick=false;
  function pulseGhost(){if(ghostTick)return;ghostTick=true;
    const tick=()=>{if(ed.mode!==m||!aimOn()||!(aim||sel().wall)){ghostTick=false;return;}ed.draw();requestAnimationFrame(tick);};requestAnimationFrame(tick);}
  function hit(p){
    {const tol=v().tol();const zh=zoneHandles().find(h=>dist2(p,h.p)<(tol*1.1)**2);if(zh)return zh;}
    const tol=v().tol(),order=[...plan().rooms].sort((a,b)=>(b.id===sel().room)-(a.id===sel().room));
    const W=selWall();if(each()&&W&&!W.open&&dist2(p,faceMid(W))<(tol*1.3)**2)return {kind:'thick',W};
    for(const r of order)for(let i=0;i<r.polygon.length;i++)if(dist2(p,r.polygon[i])<tol*tol)return {kind:'vertex',room:r,i};
    const oh=ops.hit(p,tool);if(oh)return oh; // windows and doors lie on walls — they come before walls
    for(const r of order)for(let i=0;i<r.polygon.length;i++){const [d,t]=segDist(p,r.polygon[i],r.polygon[(i+1)%r.polygon.length]);if(d<tol*.8)return {kind:'edge',room:r,i,t};}
    // the wall body (dark fill on the plan) — the room side nearest to the point
    if(ed.walls2d&&inMP(p,ed.walls2d)){let best=null;
      for(const r of plan().rooms)for(let i=0;i<r.polygon.length;i++){const [d,t]=segDist(p,r.polygon[i],r.polygon[(i+1)%r.polygon.length]);if(!best||d<best.d)best={d,room:r,i,t};}
      if(best&&best.d<.8)return {kind:'edge',room:best.room,i:best.i,t:best.t,body:true};}
    for(const r of order){const zp=zoneParts(r);if(zp&&segDist(p,zp.ch[0],zp.ch[1])[0]<tol*.8)return {kind:'zoneline',room:r,zp};}
    for(const r of order)if(pointIn(p,r.polygon))return {kind:'room',room:r};
    return null;
  }
  // To x and y of other corners (alignment, right angles), otherwise to the grid.
  function snapPoint(p,skip,free){
    ed.guides=[];if(free)return p;
    const tol=v().tol();let [x,y]=p,bx=tol,by=tol,gx=null,gy=null;
    const consider=q=>{if(Math.abs(q[0]-p[0])<bx){bx=Math.abs(q[0]-p[0]);gx=q;}if(Math.abs(q[1]-p[1])<by){by=Math.abs(q[1]-p[1]);gy=q;}};
    for(const r of plan().rooms)r.polygon.forEach((q,i)=>{if(!skip?.(r,i))consider(q);});
    draft?.points?.forEach(consider);
    if(gx){x=gx[0];ed.guides.push({x});}else if(ed.grid)x=Math.round(x/GRID)*GRID;
    if(gy){y=gy[1];ed.guides.push({y});}else if(ed.grid)y=Math.round(y/GRID)*GRID;
    return [+x.toFixed(4),+y.toFixed(4)];
  }

  // ---------- “Split”: a line through the pointer; direction follows the mouse movement, at a wall — parallel to it, Tab — rotate ----------
  // Moving up and down — the line is horizontal and follows the pointer, left and right — vertical (like dragging a ruler).
  // Right at a wall (closer than NEAR pixels) — parallel to it: this is a strong hint “the wall is here”. Tab rotates and holds the direction
  // until the pointer comes to a wall or leaves the room. The position snaps to the corners of other rooms and to the grid; Shift — no snapping.
  const NEAR=25;let cutDir=null,cutLock=false,cutRoom=null,mv=[0,0],lastP=null;
  function trackMove(p){if(!lastP){lastP=p;return;}const sc=v().sc,d=[(p[0]-lastP[0])*sc,(p[1]-lastP[1])*sc];lastP=p;mv=[mv[0]*.75+d[0],mv[1]*.75+d[1]];}
  function cutAt(p,free){
    const r=[...plan().rooms].sort((a,b)=>(b.id===sel().room)-(a.id===sel().room)).find(r=>pointIn(p,r.polygon));
    if(!r){cutRoom=null;cutLock=false;return null;}
    if(r.id!==cutRoom){cutRoom=r.id;cutLock=false;cutDir=null;mv=[0,0];}
    let best=null;r.polygon.forEach((a,i)=>{const b=r.polygon[(i+1)%r.polygon.length];if(len(a,b)<1e-6)return;const [d]=segDist(p,a,b);if(!best||d<best.d)best={d,a,b};});
    const u=[(best.b[0]-best.a[0])/len(best.a,best.b),(best.b[1]-best.a[1])/len(best.a,best.b)],nn=[-u[1],u[0]];
    const along=q=>Math.abs(q[0]*u[0]+q[1]*u[1]),across=q=>Math.abs(q[0]*nn[0]+q[1]*nn[1]);
    if(best.d*v().sc<NEAR){cutDir=u;cutLock=false;mv=[0,0];} // at a wall — parallel to it
    else if(!cutLock){const m=Math.hypot(...mv);
      // movement along the reference wall → the line across it; across → the line along it (following the pointer)
      if(m>6){if(along(mv)>1.8*across(mv))cutDir=nn;else if(across(mv)>1.8*along(mv))cutDir=u;}
      if(!cutDir)cutDir=u;}
    // hold the direction out of the two possible for this room (along the nearest wall or across)
    const dir=Math.abs(cutDir[0]*u[0]+cutDir[1]*u[1])>=Math.abs(cutDir[0]*nn[0]+cutDir[1]*nn[1])?u:nn;cutDir=dir;
    const n=[-dir[1],dir[0]];
    let c=[...p];ed.guides=[];
    if(!free){const tol=v().tol(),pr=q=>(q[0]-p[0])*n[0]+(q[1]-p[1])*n[1];let off=null;
      for(const o of plan().rooms)for(const q of o.polygon){const d=pr(q);if(Math.abs(d)<tol&&(off==null||Math.abs(d)<Math.abs(off)))off=d;}
      if(off!=null){c=[p[0]+n[0]*off,p[1]+n[1]*off];if(Math.abs(n[0])>.999)ed.guides.push({x:c[0]});else if(Math.abs(n[1])>.999)ed.guides.push({y:c[1]});}
      else if(ed.grid&&(Math.abs(n[0])>.999||Math.abs(n[1])>.999)){const k=Math.abs(n[0])>.999?0:1;c[k]=Math.round(c[k]/GRID)*GRID;}}
    const ch=cutChord(r,c,dir);if(!ch||len(ch[0],ch[1])<.1-1e-6)return null;
    const parts=splitPolygon(r.polygon,null,ch[0],ch[1]);if(!parts)return null;
    const areas=parts.map(x=>Math.abs(area(x.pts)));
    const widths=parts.map(x=>{const pr=x.pts.map(q=>q[0]*n[0]+q[1]*n[1]);return Math.max(...pr)-Math.min(...pr);}),narrow=Math.min(...widths)<.1-1e-6;
    // highlight the wall the line is parallel to (the nearest such one)
    const par=dir===u?[best.a,best.b]:(()=>{let w=null;r.polygon.forEach((a,i)=>{const b=r.polygon[(i+1)%r.polygon.length],l=len(a,b);if(l<1e-6)return;
      if(Math.abs(((b[0]-a[0])*dir[0]+(b[1]-a[1])*dir[1])/l)>.995){const [d]=segDist(p,a,b);if(!w||d<w.d)w={d,a,b};}});return w?[w.a,w.b]:[best.a,best.b];})();
    return {room:r,ch,parts,areas,wall:par,narrow};
  }
  m.flipCut=()=>{if(!cutDir)return;cutDir=[-cutDir[1],cutDir[0]];cutLock=true;if(hover){cut=cutAt(hover,false);ed.draw();}};
  // In “Split” the room panel (name, area, “⋯”, trash) is at the room under the pointer, the same as for the selected one.
  // The panel moves to another room with a delay: on the way to the panel the pointer may touch a neighbouring one.
  let xRoom=null,xTimer=0,xPend,roomMore=null,hintRoom=null;
  // in “Split” the panel is at the room under the pointer, but not while only the whole apartment is outlined: nothing to set up yet (the owner)
  const ctxRoom=()=>hintRoom||sel().room||(tool==='split'&&plan().rooms.length>1?xRoom:null)||(tool==='select'&&!sel().wall&&!sel().opening?curRoom()?.id:null);
// on the “Link rooms” step rooms are clicked — the room under the pointer is tinted the same way (except the already selected one)
let nameHover=null;
m.tintRoom=()=>wiz?.at==='names'&&tool==='select'?(nameHover!==sel().room&&nameHover!==curRoom()?.id?nameHover:null):tool==='split'&&!hintRoom&&!sel().room&&!selWall()&&!sel().opening?xRoom:null;
  // A split or a new room produced a piece smaller than 1 m² — looks like a shaft or a column. Everything stops: the piece pulses,
  // above it a panel with “⋯” open and a “Yes / No” question — this shows where it is. A click elsewhere or Esc closes the question.
  // Asked the first 3 times (once is not enough to remember); whoever turned on the switch under “⋯” themselves already knows, not asked again.
  // the count is per project: in a new project the question is asked the first 3 times again
  const SMALL=1,HINT_TIMES=3,HINT=()=>'solidAsk:'+plan().id;
  const tiny=r=>!!r&&!r.solid&&Math.abs(area(r.polygon))<SMALL&&plan().rooms.length>1;
  function offerSolid(ids){if(hintRoom||ed.hints.count(HINT())>=HINT_TIMES)return;const r=plan().rooms.find(q=>ids.has(q.id)&&tiny(q));if(!r)return;
    hintRoom=r.id;ed.hints.bump(HINT());cut=null;ed.guides=[];stopHover();
    const tick=()=>{if(!hintRoom||ed.mode!==m)return;ed.draw();if(!ed.reducedMotion?.())requestAnimationFrame(tick);};requestAnimationFrame(tick);}
  // Esc: first close the question or a rectangle started with two clicks, the tool stays
m.closeHint=()=>{if(draft?.click){draft=null;ed.draw();return true;}return closeHint();};
  function closeHint(){if(!hintRoom)return false;hintRoom=null;ctxPanel();ed.draw();return true;}
  // Showing — after 150 ms, moving to another room — after 200 ms (the owner: faster), hiding (the pointer outside rooms or
  // left the plan) — after 350 ms.
  // While the pointer is over the panel or a name is being typed in it, it does not disappear.
  const ctxEl=document.getElementById('ctx'),planCv=document.getElementById('plan');
  const stopHover=()=>{clearTimeout(xTimer);xPend=undefined;};
  function hoverRoom(id){if(id===xRoom||hintRoom){stopHover();return;}if(id===xPend)return;
    if(!id&&ctxEl.contains(document.activeElement))return;
    stopHover();xPend=id;
    xTimer=setTimeout(()=>{xPend=undefined;xRoom=id;if(!sel().room&&!selWall()){ctxPanel();ed.draw();}},!xRoom||ctxEl.hidden?150:id?200:350);}
  ctxEl.addEventListener('mouseenter',stopHover);
  ctxEl.addEventListener('mouseleave',e=>{if(tool==='split'&&e.relatedTarget!==planCv)hoverRoom(null);});
  planCv.addEventListener('mouseleave',e=>{if(tool==='split'&&!ctxEl.contains(e.relatedTarget))hoverRoom(null);if(nameHover){nameHover=null;ed.draw();}if(aim){aim=null;aimKey=null;ed.draw();}});
  // ---------- mouse ----------
  m.down=(e,p)=>{
    const free=e.shiftKey;
    // the “shaft?” question is open — a click elsewhere only closes it
    if(closeHint())return true;
    // a click on a dimension of the selected room — type the side length
    if(tool==='select'){const d=dimHits.find(h=>Math.abs(h.X-e.offsetX)<18&&Math.abs(h.Y-e.offsetY)<10);
      if(d){const r=roomById(plan(),d.room);if(r){const a=r.polygon[d.i],b=r.polygon[(d.i+1)%r.polygon.length];
        ed.ask(d.X,d.Y,t('Length, cm'),Math.round(len(a,b)*100),{type:'len',ok:m=>{setEdgeLength(plan(),r,d.i,m);ed.commit();}});return true;}}}
    if(tool==='split'){if(!plan().rooms.length){ed.setTool('split');return true;} // no rooms — a rectangle first
      const h=hit(p);
      if(!h||h.kind==='room'){
        // a wall menu is open or a room is selected — the first click elsewhere only closes it, does not place a wall
        if(sel().wall||sel().room||sel().opening){m.deselect();cut=null;ed.draw();return true;}
        const c=cutAt(p,free);
        if(!c)return true; // outside rooms or right at a wall — the click simply places nothing, without hints
        if(c.narrow)return true; // the line right at a wall is already red — the click simply places nothing
        const before=new Set(plan().rooms.map(r=>r.id)),res=splitRoom(plan(),c.room,...c.ch);cut=null;ed.guides=[];
        if(res){sel().room=null;sel().wall=null;xRoom=plan().rooms.find(r=>pointIn(p,r.polygon))?.id??xRoom;
          offerSolid(new Set(plan().rooms.filter(q=>q.id===c.room.id||!before.has(q.id)).map(q=>q.id)));ed.commit();}return true;}}
    // rectangle — drag or two clicks: a corner, then the opposite one
    if(tool==='rect'){const q=snapPoint(p,null,free);if(draft?.click){draft.b=q;finishRect();}else draft={kind:'rect',a:q,b:q};return true;}
    if(tool==='poly'){const q=snapPoint(p,null,free);
      if(!draft)draft={kind:'poly',points:[q]};
      else if(draft.points.length>=3&&dist2(q,draft.points[0])<v().tol()**2)finishPoly();
      else draft.points.push(q);
      ed.draw();return true;}
    const h=hit(p);
    {const a=aimOn()&&(!h||h.kind==='room')?openAim(p,h):null;
      if(a){Object.assign(sel(),{opening:null,vertex:null,room:a.room.id,wall:{room:a.room.id,i:a.i,t:a.t}});ed.view.select(sel().room);thickMore=false;m.refresh();ed.draw();return true;}}
    if(!h)return false;
    if(h.kind==='opening'){ops.down(h,p);return true;}
    if(h.kind==='zoneline'){drag={kind:'zoneline',room:h.room,start:p,z0:{...h.room.zone},n:h.zp.n};ed.drag=drag;return true;}
    if(h.kind==='zonehandle'){drag={kind:'zonehandle',room:h.room,i:h.i,a:h.a,nIn:h.nIn,start:p};ed.drag=drag;return true;}
    sel().opening=null;
    if(h.kind==='thick'){const W=h.W,m0=[(W.a[0]+W.b[0])/2,(W.a[1]+W.b[1])/2];
      drag={kind:'thick',W,orig:snapshot(plan()),t0:W.t,m0,p0:(p[0]-m0[0])*W.n[0]+(p[1]-m0[1])*W.n[1]};ed.drag=drag;return true;}
    if(h.kind!=='edge')sel().wall=null;
    if(tool==='split'){const orig=snapshot(plan());
      if(h.kind==='vertex')drag={kind:'vertex',room:h.room,i:h.i};
      else if(h.kind==='edge'){const pp=h.room.polygon,a=pp[h.i],b=pp[(h.i+1)%pp.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
        drag={kind:'edge',room:h.room,i:h.i,t:h.t,n:[-(b[1]-a[1])/l,(b[0]-a[0])/l],start:p,orig,edges:[[h.room,h.i],...linkedEdges(plan(),h.room,h.i)]};}
      if(drag){ed.drag=drag;return true;}return false;}
    if(wiz?.at==='names'&&tool==='select'&&h.kind==='room'){const zp=zoneParts(h.room);wiz.cur={id:h.room.id,z:!!(zp&&pointIn(p,zp.zone))};sel().room=null;sel().vertex=null;m.refresh();ed.draw();return true;}
    const changed=sel().room!==h.room.id;sel().room=h.room.id;sel().vertex=h.kind==='vertex'?h.i:null;ed.view.select(sel().room);if(changed)m.refresh();
    const orig=snapshot(plan());
    if(h.kind==='vertex')drag={kind:'vertex',room:h.room,i:h.i};
    else if(h.kind==='edge'){const pp=h.room.polygon,a=pp[h.i],b=pp[(h.i+1)%pp.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
      drag={kind:'edge',room:h.room,i:h.i,t:h.t,n:[-(b[1]-a[1])/l,(b[0]-a[0])/l],start:p,orig,edges:[[h.room,h.i],...linkedEdges(plan(),h.room,h.i)]};}
    else drag={kind:'room',room:h.room,start:p,orig};
    ed.drag=drag;ed.draw();return true;
  };
  m.move=(e,p)=>{
    hover=p;const free=e.shiftKey;
    if(ops.move(p,free))return;
    if(draft?.kind==='rect'&&(e.buttons||draft.click)){draft.b=snapPoint(p,null,free);ed.draw();return;}
    if(draft?.kind==='poly'){ed.draw();return;}
    if(!drag&&tool==='split'){const h=hit(p);
      hoverRoom(plan().rooms.find(r=>pointIn(p,r.polygon))?.id??null);
      // right at a wall — it can be dragged (cursor ↔ / ↕), no split line
      if(h&&h.kind!=='room'){cut=null;ed.guides=[];
        if(h.kind==='edge'){const a=h.room.polygon[h.i],b=h.room.polygon[(h.i+1)%h.room.polygon.length];v().cv.style.cursor=axisCursor([a[1]-b[1],b[0]-a[0]]);}
        else v().cv.style.cursor=h.kind==='opening'?ops.cursor(h):'move';
        ops.hover(h.kind==='opening'?h.o.id:null);
        hoverWall=h.kind==='edge'?{room:h.room.id,i:h.i,t:h.t}:null;ed.draw();return;}
      hoverWall=null;ops.hover(null);if(hintRoom){cut=null;v().cv.style.cursor='';return;}v().cv.style.cursor='crosshair';trackMove(p);cut=cutAt(p,free);ed.draw();return;}
    if(!drag){if(tool==='select'){const h=hit(p),hw=h?.kind==='edge'?{room:h.room.id,i:h.i,t:+h.t.toFixed(3)}:null;
        if(dimHits.some(d=>Math.abs(d.X-e.offsetX)<18&&Math.abs(d.Y-e.offsetY)<10)){v().cv.style.cursor='text';return;}
        const naming=wiz?.at==='names',nh=naming&&h?.kind==='room'?h.room.id:null;if(nh!==nameHover){nameHover=nh;ed.draw();}
        v().cv.style.cursor=!h?'grab':h.kind==='zonehandle'?axisCursor(h.nIn):h.kind==='zoneline'?axisCursor(h.zp.n):h.kind==='vertex'?'move':h.kind==='room'?(naming?'pointer':'move'):h.kind==='opening'?ops.cursor(h):h.kind==='thick'?axisCursor(h.W.n):'pointer';
        const am=aimOn()?openAim(p,h):null,ak=am&&am.room.id+':'+am.i+':'+am.t.toFixed(3);if(am)v().cv.style.cursor='pointer';
        if(ak!==aimKey){aim=am&&{room:am.room.id,i:am.i,t:am.t};aimKey=ak;ed.draw();}
        const oc=ops.hover(h?.kind==='opening'?h.o.id:null);
        if(JSON.stringify(hw)!==JSON.stringify(hoverWall)||oc){hoverWall=hw;ed.draw();}}else v().cv.style.cursor='crosshair';return;}
    if(!drag.moved&&drag.start&&len(p,drag.start)*v().sc<3)return;
    drag.moved=true;cut=null;
    // the circle on a side: the border is where the pointer is (distance from the side), 5 cm step; closer than 30 cm — no division
    if(drag.kind==='zonehandle'){let t=(p[0]-drag.a[0])*drag.nIn[0]+(p[1]-drag.a[1])*drag.nIn[1];if(!free)t=Math.round(t/GRID)*GRID;
      zoneFromEdge(drag.room,drag.i,t);ed.draw();return;}
    if(drag.kind==='zoneline'){let t=(p[0]-drag.start[0])*drag.n[0]+(p[1]-drag.start[1])*drag.n[1];if(!free)t=Math.round(t/GRID)*GRID;moveZone(drag.room,drag.z0,t);ed.draw();return;}
    if(drag.kind==='thick'){ // the thickness is dragged by the handle; snaps to typical ones, otherwise by 1 cm
      const W=drag.W,pr=(p[0]-drag.m0[0])*W.n[0]+(p[1]-drag.m0[1])*W.n[1];let t=drag.t0+(pr-drag.p0)*(W.interior?2:1);
      if(!free){const near=PRESETS[W.interior?'in':'out'].find(x=>Math.abs(x-t)<.015);t=near??Math.round(t*100)/100;}
      setWallThickness(plan(),W,t,drag.orig);ed.update();return;}
    if(drag.kind==='vertex')drag.room.polygon[drag.i]=snapPoint(p,(r,i)=>r===drag.room&&i===drag.i,free);
    else if(drag.kind==='edge'){
      const n=drag.n,a0=drag.orig.get(drag.room.id)[drag.i];let d=(p[0]-drag.start[0])*n[0]+(p[1]-drag.start[1])*n[1];
      ed.guides=[];
      if(!free){ // the wall lands at the corners of other rooms or on the grid
        const axis=Math.abs(n[0])>.999?0:Math.abs(n[1])>.999?1:-1,tol=v().tol();
        if(axis>=0){const pos=a0[axis]+d*n[axis];let best=null;
          for(const r of plan().rooms)r.polygon.forEach((q,i)=>{if(drag.edges.some(([er,j])=>er===r&&(i===j||i===(j+1)%r.polygon.length)))return;
            if(Math.abs(q[axis]-pos)<tol&&(!best||Math.abs(q[axis]-pos)<Math.abs(best[axis]-pos)))best=q;});
          const target=best?best[axis]:ed.grid?Math.round(pos/GRID)*GRID:pos;d=(target-a0[axis])/n[axis];if(best)ed.guides.push(axis?{y:best[1]}:{x:best[0]});}
        else if(ed.grid)d=Math.round(d/GRID)*GRID;
      }
      moveEdges(drag.edges,drag.orig,n,d);
    }
    else{let dx=p[0]-drag.start[0],dy=p[1]-drag.start[1];if(!free&&ed.grid){dx=Math.round(dx/GRID)*GRID;dy=Math.round(dy/GRID)*GRID;}
      drag.room.polygon=drag.orig.get(drag.room.id).map(q=>[+(q[0]+dx).toFixed(4),+(q[1]+dy).toFixed(4)]);}
    ed.update();
  };
  m.up=(e,p)=>{
    if(ops.up())return;
    if(draft?.kind==='rect'&&!draft.click){if(bigRect())finishRect();else{draft.click=true;ed.draw();}}
    if(drag){const d=drag,moved=d.moved;drag=null;ed.drag=null;
      // a strip was cut off — next we ask about the remaining area, then about the strip
      if(d.kind==='zonehandle'&&wiz?.at==='names')wiz.cur={id:d.room.id,z:false};
      if(!moved&&tool==='split'&&d.kind!=='edge'){ed.draw();return;}
      if(!moved&&d.kind==='edge'){sel().wall={room:d.room.id,i:d.i,t:d.t??.5};thickMore=false;m.refresh();ed.draw();return;} // a click on a wall selects it
      if(moved)ed.commit();else ed.draw();}
  };
  m.dblclick=(e,p)=>{
    if(tool!=='select')return;const h=hit(p);if(!h)return;
    if(h.kind==='edge'){const pp=h.room.polygon,a=pp[h.i],b=pp[(h.i+1)%pp.length];
      ed.ask(e.offsetX,e.offsetY,t('Length, cm'),Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])*100),{type:'len',ok:m=>{setEdgeLength(plan(),h.room,h.i,m);ed.commit();}});}
    else if(h.kind==='room')ed.ask(e.offsetX,e.offsetY,t('Name'),h.room.name,{ok:val=>{h.room.name=val;ed.commit();}});
  };
  m.deselect=()=>{closeHint();sel().room=null;sel().vertex=null;sel().wall=null;sel().opening=null;ed.view.select(null);m.refresh();};
  m.key=e=>{
    if(e.key==='Tab'&&tool==='split'){e.preventDefault();m.flipCut();return;}
    if(e.key==='Escape'){draft=null;if(sel().opening||sel().wall){sel().opening=null;sel().wall=null;m.refresh();}ed.draw();return;}
    if((e.key==='Delete'||e.key==='Backspace')&&ops.del())return;
    if(e.key==='Enter'&&draft?.kind==='poly'){finishPoly();return;}
    if(e.key==='Escape'&&sel().wall){sel().wall=null;m.refresh();ed.draw();return;}
    const r=roomById(plan(),sel().room);
    if((e.key==='Delete'||e.key==='Backspace')&&sel().wall){const W=selWall();if(W&&W.interior)removeInnerWall(W);return;}
    if((e.key==='Delete'||e.key==='Backspace')&&r){
      if(sel().vertex!=null&&removeVertex(plan(),r,sel().vertex))sel().vertex=null;
      else{sel().vertex=null;deleteRoom(r);return;}
      ed.commit();return;}
    const keys={v:'select',м:'select',r:'rect',к:'rect',s:'split',ы:'split',p:'poly',з:'poly'};if(!e.metaKey&&!e.ctrlKey&&keys[e.key.toLowerCase()])ed.setTool(keys[e.key.toLowerCase()]); // allow-cyrillic: the same shortcuts on the Russian keyboard layout
  };
  function newRoom(polygon){const first=!plan().rooms.length,r=addRoom(plan(),polygon),adj=settleRoom(plan(),r);sel().room=r.id;
    // the first rectangle is usually the whole apartment: offer to split it into rooms right away
    if(first&&!wiz){const st=ed.stepNow();wiz={back:st&&[st.text,st.buttons,st.aim],at:'rect'};}
    if(first)ed.fitArea?.('rect',{commit:false}); // the area from the documents — an approximate size right away (D-038)
    // aligned to a neighbour — say by how much, and let the step be restored if it was intended
    const al=adj.filter(x=>x.kind==='align');
    if(al.length){const cmx=Math.round(Math.max(...al.map(x=>Math.abs(x.d)))*100);
      ed.banner(t('Aligned to the adjacent room: shifted {0} cm.',cmx),
        [[t('Undo'),()=>{const p=r.polygon,s=area(p)>0?1:-1;for(const x of al){const a=p[x.i],b=p[(x.i+1)%p.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
          moveEdges([[r,x.i]],snapshot(plan()),[(b[1]-a[1])/l*s,-(b[0]-a[0])/l*s],-x.d);}ed.commit();ed.banner();}],[t('Got it'),()=>ed.banner(),true]]);}sel().vertex=null;offerSolid(new Set([r.id]));ed.commit();ed.view.select(r.id);m.onRoomAdded?.(r);}
  const bigRect=()=>Math.abs(draft.a[0]-draft.b[0])>.3&&Math.abs(draft.a[1]-draft.b[1])>.3;
  function finishRect(){if(!bigRect())return;const {a,b}=draft;draft=null;newRoom([[a[0],a[1]],[b[0],a[1]],[b[0],b[1]],[a[0],b[1]]]);}
  function finishPoly(){const pts=draft.points;draft=null;if(pts.length>=3)newRoom(pts);else ed.draw();}

  // Delete a room. One surrounded by others (an extra strip after a failed split) — not a hole with walls, but area for the neighbour.
  function deleteRoom(r){ed.versions.mark('before','removeRoom');const name=r.name,to=absorbRoom(plan(),r);
    if(to){sel().room=null;sel().wall=null;ed.commit();ed.banner(t('“{0}” merged into “{1}”. ⌘Z to undo.',esc(name),esc(to.name)),[[t('Got it'),()=>ed.banner()]]);return;}
    removeRoom(plan(),r.id);if(sel().room===r.id)sel().room=null;sel().wall=null;ed.commit();}
  // Remove the wall between rooms — merge them into one (zones are a separate mechanism on top of rooms, later)
  function removeInnerWall(w){ed.versions.mark('before','merge');const r=mergeRooms(plan(),w);
    // in “Split” the merged room is not selected: the panel follows the pointer, like for the others
    if(r){sel().wall=null;if(tool==='split'){sel().room=null;xRoom=r.id;}else sel().room=r.id;ed.commit();return;}
    ed.banner(t('This wall borders several rooms — remove it section by section.'),[[t('Got it'),()=>ed.banner()]]);}

  // ---------- drawing the selection and the draft ----------
  function band(W){const {ctx}=v(),d=span(W),e=WALL.inner,a=W.a,b=W.b;
    v().path([[a[0]-W.n[0]*e,a[1]-W.n[1]*e],[b[0]-W.n[0]*e,b[1]-W.n[1]*e],[b[0]+W.n[0]*d,b[1]+W.n[1]*d],[a[0]+W.n[0]*d,a[1]+W.n[1]*d]]);ctx.fill();ctx.stroke();}
  m.draw=()=>{
    const {ctx}=v(),W=selWall(),r=W?null:roomById(plan(),sel().room);
    const hp=hintRoom&&roomById(plan(),hintRoom)?.polygon||(tool==='select'&&!sel().room?curCell()?.poly:null);
    if(hp){const k=wiz?.at==='names'||ed.reducedMotion?.()?0.35:.5+.5*Math.sin(performance.now()/220);ctx.save();ctx.globalAlpha=.12+.22*k;ctx.fillStyle=pal.acc;v().path(hp,true);ctx.fill();
      ctx.globalAlpha=.55+.45*k;ctx.strokeStyle=pal.acc;ctx.lineWidth=2.5;ctx.stroke();ctx.restore();}
    for(const h of zoneHandles())v().dot(h.p,6,'#fff',pal.acc,2);
    const H=sel().opening||aimOn()&&(aim||W)?null:!W||hoverWall&&(hoverWall.room!==sel().wall?.room||hoverWall.i!==sel().wall?.i)?wallOf(hoverWall):null;
    const wlabel=w=>w.open?t('boundary, no wall'):each()?t('{0} cm',cm(w.t)):t('{0} cm',cm(len(w.a,w.b)));
    if(H&&!drag&&(tool==='select'||tool==='split')){ctx.fillStyle=pal.acc2;ctx.strokeStyle='transparent';band(H);const [X,Y]=v().S(bandMid(H));dimLabel(v(),X,Y,wlabel(H));}
    if(W){ctx.fillStyle=pal.acc2;ctx.strokeStyle=pal.acc;ctx.lineWidth=1.5;ctx.setLineDash([4,3]);band(W);ctx.setLineDash([]);
      const [X,Y]=v().S(bandMid(W));dimLabel(v(),X,Y,wlabel(W));if(each()&&!W.open)v().dot(faceMid(W),6,'#fff',pal.acc,2);}
    if(aimOn()){const A=W?sel().wall:aim,GW=A&&(W||wallOf(A));
      if(GW&&!GW.open){const still=ed.reducedMotion?.();ops.ghost(GW,A.t??.5,still?null:performance.now()%1400/1400);if(!still)pulseGhost();}}
    ops.draw();
    // the wall the split runs across is highlighted: it shows why the line is exactly like that
    if(tool==='split'&&cut){const [wa,wb]=cut.wall;ctx.strokeStyle=pal.acc;ctx.globalAlpha=.55;ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(...v().S(wa));ctx.lineTo(...v().S(wb));ctx.stroke();ctx.globalAlpha=1;ctx.lineCap='butt';}
    if(tool==='split'&&cut){const [a,b]=cut.ch;ctx.strokeStyle=cut.narrow?pal.bad:pal.acc;ctx.lineWidth=2.5;ctx.setLineDash([7,5]);ctx.beginPath();ctx.moveTo(...v().S(a));ctx.lineTo(...v().S(b));ctx.stroke();ctx.setLineDash([]);
      // the area of a part is not over the room label: the one that fell on the label goes below it
      const R=roomById(plan(),cutRoom),[LX,LY]=R?v().S(labelAt(plan(),R.polygon)):[NaN,NaN];
      for(const [k,x] of cut.parts.entries()){const c=x.pts.reduce((s,q)=>[s[0]+q[0]/x.pts.length,s[1]+q[1]/x.pts.length],[0,0]);let [X,Y]=v().S(c);
        if(Math.abs(X-LX)<70&&Math.abs(Y-LY)<26)Y=LY+36;dimLabel(v(),X,Y,fmtArea(cut.areas[k]));}}
    dimHits=[];
    if(r){const s=area(r.polygon)>0?1:-1;
      r.polygon.forEach((a,i)=>{const b=r.polygon[(i+1)%r.polygon.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l*v().sc<36||drag)return;
        const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],n=[-(b[1]-a[1])/l*s,(b[0]-a[0])/l*s],[MX,MY]=v().S([mid[0]+n[0]*14/v().sc,mid[1]+n[1]*14/v().sc]);
        ctx.save();ctx.translate(MX,MY);let ang=-Math.atan2(b[1]-a[1],b[0]-a[0]);if(ang>Math.PI/2)ang-=Math.PI;if(ang<-Math.PI/2)ang+=Math.PI;ctx.rotate(ang);
        ctx.fillStyle=pal.acc;ctx.font=`600 11px ${FONT}`;ctx.textAlign='center';ctx.fillText(Math.round(l*100),0,4);ctx.restore();
        dimHits.push({X:MX,Y:MY,room:r.id,i});});
      r.polygon.forEach((q,i)=>v().dot(q,i===sel().vertex?6:4.5,i===sel().vertex?pal.acc:'#fff',pal.acc,1.8));}
    if(draft){ctx.strokeStyle=pal.acc;ctx.lineWidth=2;ctx.fillStyle=pal.acc2;
      const pts=draft.kind==='rect'?[draft.a,[draft.b[0],draft.a[1]],draft.b,[draft.a[0],draft.b[1]]]:[...draft.points,hover&&snapPoint(hover)].filter(Boolean);
      v().path(pts,draft.kind==='rect');ctx.fill();ctx.stroke();
      if(draft.kind==='rect'){const [X,Y]=v().S(draft.b);dimLabel(v(),X+44,Y-14,t('{0} × {1} cm',Math.round(Math.abs(draft.b[0]-draft.a[0])*100),Math.round(Math.abs(draft.b[1]-draft.a[1])*100)));}}
  };

  // ---------- top row, left panel, panel above the selection ----------
  m.refresh=()=>{
    if(ed.mode!==m)return;
    buildPop?.remove();buildPop=null;
    const tools=$('tools');tools.innerHTML='';
    tools.append(ed.selectButton());
    // The main action is labeled; a separate room is in the menu, without two similar squares on the panel.
    const hasRooms=!!plan().rooms.length,buildId=hasRooms&&ed.tool!=='rect'?'split':'rect';
    const choices=[['split','wall',t('Wall'),'S',t('Split into rooms · Tab rotates the line')],
      ['rect','rectangle',hasRooms?t('Room'):t('Outline'),'R',t('Draw a rectangle')]];
    const [id,ic,label,key,description]=choices.find(c=>c[0]===buildId),active=ed.tool===id;
    const group=el('<div class="build-tool"></div>');
    const primary=el(`<button class="build-main ${active?'on':''}" data-tool="${id}" title="${description} (${key})" aria-label="${label} (${key})" aria-pressed="${active}">${icon(ic)}<span>${label}</span></button>`);
    primary.onclick=()=>ed.toggleTool(id);group.append(primary);tools.append(group);
    if(hasRooms){const menu=el(`<button class="build-menu" title="${t('More')}" aria-label="${t('More')}" aria-controls="build-options">${icon('up',12)}</button>`);group.append(menu);
      menu.onclick=()=>{
        if(buildPop?.isConnected){closePop();buildPop=null;return;}
        const content=el('<div id="build-options" class="build-options"></div>');
        for(const [value,ic,label,key,description] of choices){
          const option=el(`<button aria-pressed="${ed.tool===value}">${icon(ic)}<span><b>${label}</b><small>${description}</small></span><kbd>${key}</kbd></button>`);
          option.onclick=()=>{closePop();ed.setTool(value);ed.v.cv.focus({preventScroll:true});};content.append(option);}
        buildPop=panelPop(menu,content,'build-pop');
        content.onkeydown=e=>{const options=[...content.querySelectorAll('button')],i=options.indexOf(document.activeElement);
          if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePop();menu.focus({preventScroll:true});}
          else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();options[(i+(e.key==='ArrowDown'?1:options.length-1))%options.length].focus();}};
        content.querySelector('button').focus({preventScroll:true});
      };}
    const side=$('side-body');side.innerHTML='';
    const rooms=plan().rooms,total=rooms.filter(r=>!r.solid).reduce((t,r)=>t+Math.abs(area(r.polygon)),0);
    ed.sideHead(t('Rooms'),rooms.length?`${rooms.length} · ${fmtArea(total)}`:'');
    // The list: a dot in the floor color (as in 3D), name, area, how many lamps, what is wrong. On hover — rename and delete.
    const list=el(`<div class="sec-body list"></div>`);side.appendChild(list);
    if(!rooms.length)list.appendChild(el(`<p class="empty">${t('Draw a rectangle around your whole home.')}</p>`));
    for(const r of rooms){
      const issues=[...ed.errors.filter(e=>e.room===r.id).map(e=>e.text)];
      const todo=plan().lights.filter(l=>!l.placed&&!l.skip&&(l.area===r.id||l.area===r.area)).length;if(todo)issues.push(t('unplaced lights: {0}',todo));
      const clash=plan().furniture.filter(f=>ed.conflicts.has(f.id)&&pointIn([f.x,f.y],r.polygon)).length;if(clash)issues.push(t('overlapping furniture: {0}',clash));
      const lamps=plan().lights.filter(l=>l.placed&&l.room===r.id).length;
      const row=el(`<div class="row room-row ${r.id===sel().room?'sel':''}" title="${t('Double-click to zoom in')}">
        <i class="dot" style="background:${floorColor(r)}"></i><span class="name">${esc(r.name)}</span>
        <small class="ar">${r.solid?t('solid'):fmtArea(area(r.polygon))}</small>
        <span class="meta">${lamps?`<span class="lamps" title="${t('Lights in room: {0}',lamps)}">${icon('bulb',13)}${lamps}</span>`:''}${issues.length?`<span class="wr" title="${esc(issues.join('; '))}">${icon('alert',14)}</span>`:''}</span>
        <span class="acts"><button class="ib" data-a="rename" title="${t('Rename')}">${icon('pencil',14)}</button><button class="ib" data-a="del" title="${t('Delete')}">${icon('x',14)}</button></span></div>`);
      // the first click redraws the list, so the double click is caught by timing, not by the dblclick event
      row.onclick=e=>{if(e.target.closest('button,input'))return;const t=performance.now();
        if(lastClick.id===r.id&&t-lastClick.t<400){lastClick={};ed.fit(r.polygon);return;}lastClick={id:r.id,t};ed.select('room',r.id);};
      row.onmouseenter=()=>{ed.hover=r.id;ed.draw();};row.onmouseleave=()=>{ed.hover=null;ed.draw();};
      row.querySelector('[data-a=del]').onclick=e=>{e.stopPropagation();deleteRoom(r);};
      row.querySelector('[data-a=rename]').onclick=e=>{e.stopPropagation();
        const nm=row.querySelector('.name'),inp=el(`<input class="rename" value="${esc(r.name)}">`);nm.replaceWith(inp);inp.focus();inp.select();row.classList.add('editing');
        const done=ok=>{if(ok&&inp.value.trim()&&inp.value.trim()!==r.name){r.name=inp.value.trim();ed.commit();}else m.refresh();};
        inp.onkeydown=ev=>{ev.stopPropagation();if(ev.key==='Enter')inp.blur();if(ev.key==='Escape'){inp.onblur=null;done(false);}};inp.onblur=()=>done(true);};
      list.appendChild(row);}
    const add=el(`<button class="add-row" title="${t('Draw a rectangle')}">${icon('plus',15)}<span>${t('Room')}</span><kbd>R</kbd></button>`);
    add.onclick=()=>ed.setTool('rect');list.appendChild(add);
    // The plan photo (underlay) is one row: a thumbnail, opacity (drag on the number), show / hide, rare actions — under “⋯”.
    const ul=ed.underlay,ub=el(`<div class="ul-row"></div>`);side.appendChild(ub);
    if(!ul.ready){const b=el(`<button class="add-row" title="${t('A plan photo to trace rooms over')}">${icon('image',15)}<span>${t('Plan photo as background')}</span></button>`);
      b.onclick=()=>ed.flows.pickUnderlay();ub.appendChild(b);}
    else{
      ub.append(el(`<img class="ul-thumb" src="${ul.thumb()}" alt="">`),el(`<span class="ul-name">${t('Background')}</span>`));
      const pct=()=>Math.round(ul.opacity*100)+'%',sc=el(`<button class="scrub ${ul.visible?'':'off'}" title="${t('Opacity: drag or scroll')}">${pct()}</button>`);
      const setOp=o=>{ul.opacity=Math.max(.05,Math.min(1,o));ul.visible=true;sc.textContent=pct();sc.classList.remove('off');eye.innerHTML=icon('eye',15);ed.draw();};
      sc.onpointerdown=e=>{e.preventDefault();sc.setPointerCapture(e.pointerId);const x0=e.clientX,o0=ul.opacity;
        sc.onpointermove=ev=>setOp(o0+(ev.clientX-x0)/160);sc.onpointerup=()=>{sc.onpointermove=sc.onpointerup=null;ul.save();};};
      sc.onwheel=e=>{e.preventDefault();setOp(ul.opacity-Math.sign(e.deltaY)*.05);ul.save();};
      const eye=el(`<button class="ib" title="${t('Show or hide')}">${icon(ul.visible?'eye':'eyeoff',15)}</button>`);
      eye.onclick=()=>{ul.visible=!ul.visible;ul.save();eye.innerHTML=icon(ul.visible?'eye':'eyeoff',15);sc.classList.toggle('off',!ul.visible);ed.draw();};
      const rot=el(`<button class="ib" title="${t('Rotate and move photo')}">${icon('rotate',15)}</button>`);rot.onclick=()=>ed.flows.moveUnderlay();
      const more=el(`<button class="ib" title="${t('More')}">${icon('more',15)}</button>`);
      more.onclick=()=>popover(more,[['ruler',t('Set scale from a wall'),()=>ed.flows.calibrate()],
        ['upload',t('Replace…'),()=>ed.flows.pickUnderlay()],['trash',t('Remove'),()=>ul.clear(),'bad']]);
      ub.append(sc,eye,rot,more);}
    ctxPanel();wizard();
  };
  function ctxPanel(){
    if(ed.mode!==m)return;
    const ol=ops.ctx();if(ol){ed.showCtx(ol);syncFin(null);return;}
    // the selected wall menu: length (click to type it), remove the wall; thickness — under “⋯”, only if enabled in the settings
    const W=selWall();
    if(W){
      const line=el(`<div class="line"><b title="${W.open?t('No wall, separate rooms'):''}">${W.open?t('Room boundary'):W.interior?t('Wall'):W.rail?t('Railing'):t('Exterior wall')}</b></div>`),lines=[line];
      const whole=Math.abs(len(W.a,W.b)-len(W.ea,W.eb))<.01;
      const L=whole?el(`<button class="soft" title="${t('Enter length')}">${t('{0} cm',cm(len(W.a,W.b)))}</button>`):el(`<small title="${t('Segment length')}">${t('{0} cm',cm(len(W.a,W.b)))}</small>`);
      L.onclick=()=>{const [X,Y]=v().S([(W.a[0]+W.b[0])/2,(W.a[1]+W.b[1])/2]);ed.ask(X,Y,t('Length, cm'),cm(len(W.a,W.b)),{type:'len',ok:m=>{const w=selWall();if(w){setEdgeLength(plan(),w.room,w.i,m);ed.commit();}}});};
      const tog=el(`<button class="soft ${W.open?'':'bad'}" title="${W.open?t('Put the wall back'):t('Merges the two rooms')}">${W.open?t('Restore wall'):t('Remove wall')}</button>`);
      tog.onclick=()=>{const w=selWall();if(!w)return;
        if(!w.open&&w.interior){removeInnerWall(w);return;}
        setWallOpen(plan(),w,!w.open);ed.commit();};
      // an old border without a wall (the former “Remove wall” did this) — it can be removed completely
      const mg=el(`<button class="soft" title="${t('Merges the two rooms')}">${t('Remove boundary')}</button>`);mg.onclick=()=>{const w=selWall();if(w)removeInnerWall(w);};
      // an outer wall has no “Remove wall”: no wall is possible only between rooms (D-021); it can be a railing (D-071) — an open balcony, a terrace
      const rail=el(`<button class="soft" title="${W.rail?t('Put the wall back'):t('An open balcony or terrace edge')}">${W.rail?t('Restore wall'):t('Railing')}</button>`);
      rail.onclick=()=>{const w=selWall();if(!w)return;setRail(plan(),w,w.rail?0:RAIL);ed.commit();};
      // a railing is a parapet, or glass on a kerb — for all the room's railings at once (D-075)
      const glass=el(`<label class="tg" title="${t('Glass panes on a low kerb instead of a parapet')}"><span>${t('Glass|railing')}</span><input type="checkbox" ${W.room.railGlass?'checked':''}><i></i></label>`);
      glass.querySelector('input').onchange=e=>{const w=selWall();if(!w)return;if(e.target.checked)w.room.railGlass=true;else delete w.room.railGlass;ed.commit();};
      // place a window or a door at the click point; no room (a corner, a neighbouring opening) — the button is disabled
      const put=k=>{const b=el(`<button class="soft">${k==='door'?t('Door'):t('Window')}</button>`);if(!ops.can(W,k)){b.disabled=true;b.title=t('Doesn\'t fit here');}
        else if(wiz?.at==='open')b.classList.add('opening-action');b.onclick=()=>ops.add(selWall(),k);return b;};
      const guided=wiz?.at==='open';
      line.append(...(W.open?[tog,...(W.interior?[mg]:[])]:guided?[put('window'),put('door')]:W.rail?[L,glass,rail]:[L,...(W.interior?[put('door'),put('window'),tog]:[put('window'),put('door'),rail])]));
      const extra=guided?el(`<details class="ctx-extra"><summary>${t('Finishes and dimensions')}</summary></details>`):null;
      if(extra){const measurements=el('<div class="line"></div>');measurements.append(L);if(W.interior)measurements.append(tog);extra.append(measurements);lines.push(extra);}
      if(each()&&!W.open){const mb=el(`<button class="ib ${thickMore?'on':''}" title="${t('This wall\'s thickness')}">${icon('more',15)}</button>`);mb.onclick=()=>{thickMore=!thickMore;m.refresh();};line.append(mb);
        if(thickMore){const ml=el(`<div class="line more"><label>${t('Thickness')}<input type="number" step="1" min="${W.interior?10:8}" max="${W.interior?54:100}" value="${cm(W.t)}"></label><small>${t('cm')}</small></div>`),x=ml.querySelector('input');
          x.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')x.blur();};x.onchange=()=>{const w=selWall();if(w){setWallThickness(plan(),w,(+x.value||0)/100);ed.commit();}};lines.push(ml);}}
      // the side finish: for an outer wall — from inside, for a wall between rooms — each side has its own (an accent wall); a railing has none
      if(!W.open&&!W.rail){const owner='wallsel:'+W.room.id+':'+W.i,others=[...new Set((W.B||[]).map(([rb])=>rb))].filter(rb=>!rb.solid);
        const finishes=[];if(!W.room.solid)finishes.push(...finRow(()=>sideState(W.room,[W.i],others.length?t('“{0}” side',W.room.name):t('Wall finish')),owner));
        for(const rb of others){const js=W.B.filter(([x])=>x===rb).map(([,j])=>j);finishes.push(...finRow(()=>sideState(rb,js,t('“{0}” side',rb.name)),owner));}
        if(extra)extra.append(...finishes);else lines.push(...finishes);
        ed.showCtx(lines);syncFin(owner);return;}
      ed.showCtx(lines);syncFin(null);return;}
    // the panel above the selected room (in “Split” — above the room under the pointer)
    if(hintRoom&&!roomById(plan(),hintRoom))hintRoom=null;
    const r=roomById(plan(),ctxRoom());
    if(!r){ed.showCtx(null);syncFin(null);return;}
    if(roomMore!==r.id)roomMore=null;
    const q=hintRoom===r.id,open=q||roomMore===r.id;
    // on the step — the “Which room is this?” question and the HA areas; otherwise — the regular panel, a linked room has its name from HA
    const cc=curCell(),asking=wiz?.at==='names'&&cc?.r.id===r.id&&!sel().room;
    if(asking){ed.showCtx(areaLines(r,true,cc.z));syncFin('room:'+r.id);return;}
    const line=el(`<div class="line"></div>`),name=r.area?el(`<b class="title" title="${t('Name from Home Assistant')}">${esc(r.name)}</b>`):el(`<input class="title" value="${esc(r.name)}" title="${t('Name')}">`);
    if(!r.area){name.onchange=()=>{const v=name.value.trim();if(v)r.name=v;else name.value=r.name;ed.commit();};name.onkeydown=e=>{if(e.key==='Enter')name.blur();e.stopPropagation();};}
    const link=el(`<button class="ib ${roomLink===r.id?'on':''}" title="${r.area?t('Home Assistant area'):t('Link to Home Assistant')}">${icon('house',15)}</button>`);
    link.onclick=()=>{roomLink=roomLink===r.id?null:r.id;ctxPanel();};
    const del=el(`<button class="ib bad" title="${t('Delete room (Delete)')}">${icon('trash',15)}</button>`);del.onclick=()=>deleteRoom(r);
    // rare things — under “⋯” (D-014): solid (shaft, column, duct box) — no floor, full wall height
    const more=el(`<button class="ib ${open?'on':''} ${q?'pulse':''}" title="${t('More')}">${icon('more',15)}</button>`);
    more.onclick=()=>{const was=open;if(q)hintRoom=null;roomMore=was?null:r.id;ctxPanel();ed.draw();};
    line.append(name,el(`<small>${r.solid?t('solid'):fmtArea(area(r.polygon))}</small>`),...(r.solid?[]:[link]),more,del);
    const lines=[line];if(!r.solid)lines.push(floorLine(r),...finRow(()=>wallState(r),'room:'+r.id));
    if(roomLink!==r.id)roomLink=null;
    if(!q&&!r.solid&&roomLink===r.id)lines.push(...areaLines(r,false,false).slice(1));
    // the question: “Yes” — make it solid, “No” — keep it a room; after the answer “⋯” stays open with the switch
    const keep=()=>{if(tool==='split')xRoom=r.id;else sel().room=r.id;roomMore=r.id;};
    if(q){const ml=el(`<div class="line more q"><span class="qt">${t('Shaft or column?')}</span><button class="soft" data-a="no">${t('No')}</button><button class="soft pri pulse" data-a="yes">${t('Yes')}</button></div>`);
      ml.querySelector('[data-a=no]').onclick=()=>{keep();closeHint();};
      ml.querySelector('[data-a=yes]').onclick=()=>{keep();hintRoom=null;r.solid=true;ed.commit();};
      lines.push(ml);}
    else if(open){const ml=el(`<div class="line more"><label class="tg"><span>${t('Shaft or column')}</span><input type="checkbox" ${r.solid?'checked':''}><i></i></label></div>`);
      ml.querySelector('input').onchange=e=>{keep();ed.hints.done(HINT(),HINT_TIMES);if(e.target.checked)r.solid=true;else delete r.solid;ed.commit();};
      lines.push(ml);}
    ed.showCtx(lines);syncFin('room:'+r.id);
    // the hint's tail — under “⋯”
    const ml=lines.find(x=>x.classList.contains('more'));if(ml)ml.style.setProperty('--cx',(more.offsetLeft+more.offsetWidth/2-ml.offsetLeft)+'px');
  };
  // HA areas as chips: free ones first, then the ones taken by other rooms — disabled (one area —
  // one room). No manual input: the name comes from HA. At the bottom — “not listed” with a link to HA.
  // ask — the wizard question: the “Which room is this?” title and “Skip”; otherwise — at the selected room, with “Unlink”.
  let roomLink=null;
  // a row of chips for a cell (a room or its part z): the ones taken by other cells — disabled
  function chipsRow(r,z){
    const owner=new Map(),mine=z?r.zone?.area:r.area;
    for(const o of plan().rooms){if(o.area&&!(o===r&&!z))owner.set(o.area,o.name);if(zoneParts(o)&&o.zone.area&&!(o===r&&z))owner.set(o.zone.area,ed.areaName(o.zone.area));}
    const list=[...ed.ha.areas()].sort((a,b)=>owner.has(a.area_id)-owner.has(b.area_id)),row=el(`<div class="line names"></div>`);
    for(const a of list){const used=owner.has(a.area_id)&&a.area_id!==mine;
      const b=el(`<button class="chip ${mine===a.area_id?'on':''}" ${used?'disabled':''} title="${used?t('Already used by “{0}”',esc(owner.get(a.area_id))):t('Home Assistant area')}">${esc(a.name)}</button>`);
      b.onclick=()=>{if(z){r.zone.area=a.area_id;delete r.zone.noArea;}else{setRoomArea(plan(),r,a.area_id,a.name);delete r.noArea;}if(wiz)wiz.cur=null;if(!wiz)roomLink=null;ed.commit();};row.append(b);}
    return row;}
  // HA areas as chips. ask — the wizard question about a cell (a room or its part z): “Skip”, “Two areas here”;
  // otherwise — at the selected room (the button with the house): both parts if the room is divided, and “Unlink”.
  // No manual input: the name comes from HA. At the bottom — “not listed” with a link to HA.
  function areaLines(r,ask,z){
    const zp=zoneParts(r),poly=zp?(z?zp.zone:zp.main):r.polygon;
    const head=el(`<div class="line"><b>${zp?t('Which part of the room is this?'):t('Which room is this in Home Assistant?')}</b><small>${fmtArea(area(poly))}</small></div>`);
    const rows=ask?[chipsRow(r,z)]:[chipsRow(r,false),...(zp?[el(`<div class="line sub"><small>${t('Second part')}</small></div>`),chipsRow(r,true)]:[])];
    const foot=el(`<div class="line foot"><span class="hint">${ask?t('Not listed? Add it in Home Assistant or skip — you can do it later.'):t('Not listed? Add it in Home Assistant.')}</span></div>`);
    if(ed.ha.areasUrl)foot.append(el(`<a class="soft btn" href="${esc(ed.ha.areasUrl)}" target="_blank" rel="noopener" title="${t('Open areas in Home Assistant')}">${t('Open HA')} ↗</a>`));
    if(ask){const sk=el(`<button class="soft">${t('This room later')}</button>`);sk.onclick=()=>{if(z)r.zone.noArea=true;else r.noArea=true;wiz.cur=null;ed.commit();};foot.append(sk);}
    else if(r.area){const un=el(`<button class="soft">${t('Unlink')}</button>`);un.onclick=()=>{setRoomArea(plan(),r,null,r.name);roomLink=null;ed.commit();};foot.append(un);}
    // kitchen-living room: the circle on a side of the highlighted area is dragged (zoneHandles); already divided — “Remove split”
    const tools=el(`<div class="line foot2"></div>`);
    if(zp){const un=el(`<button class="soft" title="${t('One area for the whole room again')}">${t('Remove split')}</button>`);
      un.onclick=()=>{delete r.zone;if(wiz)wiz.cur={id:r.id,z:false};ed.commit();};tools.append(un);}
    else if(ask)tools.append(el(`<small>${t('Two areas here? Drag the circle on a side.')}</small>`));
    const extra=el(`<details class="ctx-extra"><summary>${t('Floor and room divisions')}</summary></details>`);
    if(ask&&!z)extra.append(floorLine(r));if(tools.childNodes.length)extra.append(tools);
    return [head,...rows,foot,...(extra.childNodes.length>1?[extra]:[])];
  }
  // Finishes — the floor and walls of the room, a separate wall side — as one row of swatches: the selected one outlined; not chosen —
  // guessed (the hint says how). The row has the frequent ones; the palette button opens a popup with all options and a custom color.
  // The floor — also on the “Link rooms” step: fix it while naming the room, without a separate step (the owner).
  const FIN={floor:{kinds:FLOOR_KINDS,quick:FLOOR_QUICK,groups:FLOOR_GROUPS,swatch:floorSwatch,base:floorBase},
    wall:{kinds:WALL_KINDS,quick:WALL_QUICK,groups:WALL_GROUPS,swatch:wallSwatch,base:wallBase}};
  const setWf=(r,i,v)=>{r.wf||=r.polygon.map(()=>null);while(r.wf.length<r.polygon.length)r.wf.push(null);r.wf[i]=v;if(r.wf.every(x=>!x))delete r.wf;};
  const floorState=r=>({type:'floor',key:'floor:'+r.id,title:t('Floor'),cur:floorKind(r),tint:r.floorTint||null,auto:!FLOOR_KINDS[r.floor],autoTip:t('from room name'),
    pick:k=>{r.floor=k;delete r.floorTint;ed.commit();},setTint:h=>{r.floor=floorKind(r);r.floorTint=h;ed.commit();},reset:()=>{delete r.floorTint;ed.commit();}});
  const wallState=r=>{const w=roomWall(r);return {type:'wall',key:'wall:'+r.id,title:t('Walls'),cur:w.k,tint:w.tint||null,auto:!WALL_KINDS[r.wall],autoTip:t('from room name'),
    pick:k=>{r.wall=k;delete r.wallTint;ed.commit();},setTint:h=>{r.wall=w.k;r.wallTint=h;ed.commit();},reset:()=>{delete r.wallTint;ed.commit();}};};
  // a wall side: for room r — sides js (a wall shared with a neighbour may consist of several pieces); “same as room” — remove its own
  const sideState=(r,js,title)=>{const w=sideWall(r,js[0]),set=v=>{for(const j of js)setWf(r,j,v);ed.commit();};
    return {type:'wall',key:'side:'+r.id+':'+js.join(','),title,cur:w.k,tint:w.tint,auto:!w.own,autoTip:t('same as room'),
      pick:k=>set({k}),setTint:h=>set({k:w.k,tint:h}),reset:()=>set(w.own?{k:w.k}:null),same:w.own?()=>set(null):null};};
  let finPop=null; // the open popup: {key, owner — whose panel, get — fresh state}
  const finBtn=(F,st,k)=>{const K=F.kinds[k],on=k===st.cur,b=el(`<button class="floor ${on?'on':''}" title="${esc(K.label)}${on&&st.auto?' — '+st.autoTip:''}" style="background-image:url(${F.swatch(k,on?st.tint:null)})"></button>`);
    b.onclick=()=>{if(on&&!st.tint&&!st.auto)return;st.pick(k);};return b;};
  function finRow(get,owner){const st=get(),F=FIN[st.type],side=st.key.startsWith('side:'),row=el(`<div class="line floors">${side?'':`<small>${esc(st.title)}</small>`}</div>`);
    for(const k of F.quick)row.append(finBtn(F,st,k));if(!F.quick.includes(st.cur))row.append(finBtn(F,st,st.cur)); // chosen in the popup — also in the row
    if(st.same){const b=el(`<button class="soft same" title="${t('Same finish as the whole room')}">${t('Same as room')}</button>`);b.onclick=st.same;row.append(b);}
    const more=el(`<button class="ib floor-more ${finPop?.key===st.key?'on':''}" title="${t('All options and custom color')}">${icon('palette',15)}</button>`);
    more.onclick=()=>{if(finPop?.key===st.key||performance.now()-popClosedAt<250){closePop();finPop=null;return;}openFin(get,owner,more);};
    row.append(more);return side?[el(`<div class="line sub"><small>${esc(st.title)}</small></div>`),row]:[row];} // for a wall side — a label on the line above
  function finBox(st){const F=FIN[st.type],box=el(`<div class="fpop"></div>`);
    for(const [g,keys] of F.groups){box.append(el(`<div class="grp">${esc(g)}</div>`));const sw=el(`<div class="fgrid"></div>`);for(const k of keys)sw.append(finBtn(F,st,k));box.append(sw);}
    const own=el(`<label class="own" title="${t('Custom color for the selected option')}"><input type="color" value="${F.base(st.cur,st.tint)}"><span>${t('Custom color')}</span></label>`),inp=own.querySelector('input');
    inp.onchange=()=>st.setTint(inp.value);
    if(st.tint){const rs=el(`<button class="soft" title="${t('Restore original color')}">${t('Reset')}</button>`);rs.onclick=e=>{e.preventDefault();st.reset();};own.append(rs);}
    box.append(own);return box;}
  function openFin(get,owner,anchor){const st=get(),p=panelPop(anchor,finBox(st),'fp');finPop={key:st.key,owner,get};
    const watch=new MutationObserver(()=>{if(!document.body.contains(p)){if(finPop?.key===st.key)finPop=null;watch.disconnect();}});watch.observe(document.body,{childList:true});}
  // after an edit — the popup with the new choice; a panel about something else (another room or wall) — the popup closes
  function syncFin(owner){if(!finPop)return;const m=document.querySelector('.menu.pop.panel.fp');
    if(!m||finPop.owner!==owner){closePop();finPop=null;return;}const st=finPop.get();finPop.key=st.key;m.replaceChildren(finBox(st));}
  const floorLine=r=>finRow(()=>floorState(r),'room:'+r.id)[0];
  m.anchor=()=>{const oa=ops.anchor();if(oa)return oa;const W=selWall();if(W){const d=span(W),q=[W.a,W.b,[W.a[0]+W.n[0]*d,W.a[1]+W.n[1]*d],[W.b[0]+W.n[0]*d,W.b[1]+W.n[1]*d]],xs=q.map(p=>p[0]),ys=q.map(p=>p[1]);
      return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];}
    const r=roomById(plan(),ctxRoom());if(!r)return null;const cc=curCell(),poly=cc&&cc.r===r&&!sel().room?cc.poly:r.polygon;
    // The frame includes the walls: the panel gap is measured from their outer face.
    const shell=offsetVar(r.polygon,r.polygon.map((_,i)=>{const w=wallInfo(plan(),r,i);return w.open?0:Math.max(0,span(w));}));
    const points=poly===r.polygon?shell:poly;
    const xs=points.map(q=>q[0]),ys=points.map(q=>q[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];};
  m.ctxKey=()=>ctxRoom()||'';
  m.status=()=>'';
  return m;
}
