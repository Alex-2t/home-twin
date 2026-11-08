// The “Lights” mode: lamps from Home Assistant land on the plan. Which lamp it is — chandelier, pendant, spots, line, strip, wall light,
// floor lamp — the user says with one click (the one guessed by name is highlighted); the default place comes from fixtures.js,
// then — drag on the plan. The “Lights” wizard step: room by room is highlighted and asked about its lamp without a place.
import {t,num} from '../../i18n/i18n.js';
import {dist2,segDist,pointIn,WALL} from '../../core/geometry.js';
import {GRID,snapLightPoint,stripOnWall} from '../../core/layout.js';
import {roomAt,roomById,zoneParts} from '../../core/plan.js';
import {FORMS,formFor,lineForm,guessForm,lampCell,placeForm,relayout,autoPlace,snapWall,keepIn,clampRay,STRIP,SPOTS,LINES,FORM_ORDER,
  stripContour,stripRuns,stripSegs,stripAt,stripProject,stripCut,stripFill,stripMove,stripSnaps,stripOnEdge,stripLayout,FURN_STRIP,furnOpts,furnGuess} from '../../core/fixtures.js';
import {$,el,esc,section,parseLen,tip,tipHide} from '../ui.js';
import {icon} from '../icons.js';
import {pal,FONT,alpha,dimLabel,shiftSegs,shiftPoint} from '../draw.js';

const BODY={ceiling:.2,pendant:.17,spots:.05,lamp:.17}; // body radius in the plan, m
const names=o=>Object.fromEntries(Object.entries(o).map(([k,x])=>[k,x.name||x]));
const formName=id=>FORMS.find(f=>f.id===id)?.name||'';
export function lightsMode(ed){
  const m={id:'lights'};let drag=null,placing=null,cur=null,near=null,go=false,hoverStrip=null,merging=false,stepKey=null,flash=null,
    sess,leaving=null,held={light:null,cur:null};
  const plan=()=>ed.plan,sel=()=>ed.sel,v=()=>ed.v;
  const find=id=>id?plan().lights.find(l=>l.id===id):null;
  const host=L=>L.with?find(L.with):null;

  // ---------- wizard ----------
  // The “Lights” step follows the plan: we ask about lamps without a place that are not skipped. When on — the project has ui.wiz[id] = {lights:true}.
  const wizOn=()=>!!ed.wizard?.get(plan().id)?.lights;
  m.wizardOn=wizOn;
  m.reset=()=>{cur=null;near=null;go=false;sess=undefined;leaving=null;held={light:null,cur:null};merging=false;stepKey=null;drag=null;placing=null;hoverStrip=null;focused=null;ed.view?.setSolo?.(null);};
  // a draft (L.draft) — the lamp landed in the room until its lights were saved with “Next”: it is not yet in the “placed” count
  const todo=L=>(!L.placed||L.draft)&&!L.skip;
  const open=L=>!L.placed&&!L.skip; // the wizard goes to lamps without a place; a draft already stands — it is not placed again
  // all lamps in order: rooms top to bottom, left to right; in a room — the main light first; lamps without a room — at the end
  function order(){const key=L=>{const c=lampCell(plan(),L);if(!c)return [1e9,0,9];const ys=c.poly.map(q=>q[1]),xs=c.poly.map(q=>q[0]);
      return [-Math.round(Math.max(...ys)*2),Math.min(...xs),FORM_ORDER[guessForm(L).form]];};
    return plan().lights.map((L,i)=>({L,k:key(L),i})).sort((a,b)=>a.k[0]-b.k[0]||a.k[1]-b.k[1]||a.k[2]-b.k[2]||a.i-b.i).map(x=>x.L);}
  const queue=()=>order().filter(todo);
  // the lamp being asked about: the one selected in the list (cur) or — while the wizard runs — the next one without a place, counting from the one
  // the user is on now (near). Moved to a far room — the wizard goes forward from it instead of jumping to the start of the plan;
  // reached the end — back to the ones skipped along the way.
  const asking=()=>{if(sel().light)return null;const c=find(cur);if(c&&!c.placed)return c;cur=null;if(!wizOn())return null;
    const o=order(),i=o.findIndex(L=>L.id===near),has=x=>open(x)&&cellKey(x)!=null;
    return (i>=0&&o.slice(i).find(has))||o.find(has)||o.find(open)||null;}; // lamps without a room — at the very end, when the rooms are done
  m.asking=asking;
  m.ctxKey=()=>asking()?.id||''; // a panel about another lamp — back at its own place
  m.ctxPin=()=>wizOn()&&sess!=null?'room:'+sess:null; // in the step the panel is about the room: a dragged one stays while it is in it
  function stepBanner(){
    if(!wizOn()){if(stepKey){stepKey=null;if(ed.stepNow()?.mode===m)ed.step(null);}return;}
    const all=plan().lights.filter(L=>!ed.lampWaits(L)),n=all.filter(L=>L.placed&&!L.draft).length,k=all.filter(L=>!L.placed&&L.skip).length,left=all.length-n-k;
    const key=[n,k,all.length].join('/');if(stepKey===key&&ed.stepNow()?.mode===m)return;stepKey=key;
    const tail=k?t('Placed {0} of {1} · skipped {2}.',n,all.length,k):t('Placed {0} of {1}.',n,all.length);
    ed.step(`${left?t('Check the light type and position. Then confirm the room.'):all.length?tail:t('No lights in Home Assistant yet. Click “Done”.')}<small>${t('The position was chosen automatically. Drag the light if needed.')}</small><small>${tail}</small>`,
      [[left||k?t('Finish later'):t('Finish placing lights'),()=>finish(!!(left||k)),!left&&!k]],null,
      {id:'lights',short:left?t('Check the lights and confirm the room.')+' '+tail:tail});}
  // “Finish later” — without a question: the room's unsaved lights stay a draft (it is in the plan), to be returned to;
  // “Finish placing lights” — ask whether to save the room's edits
  function finish(later=false){if(!later&&dirty(sess)){leaving={finish:true};ctxPanel();return;}close();}
  function close(){ed.wizard.set(plan().id,null);leaving=null;stepKey=null;cur=null;near=null;sel().light=null;ed.step(null);m.refresh();ed.draw();focused=null;ed.view.focus?.(null);ed.path.after('lights');} // at the end — the question about readings on the walls (D-033)
  m.startWizard=()=>{ed.wizard.set(plan().id,{lights:true});stepKey=null;cur=null;near=null;sel().light=null;m.refresh();ed.draw();};
  // which lamp the wizard is on — also remembered in the project: after a reload it is on the same one
  const keep=id=>{if(near===id)return;near=id;if(!wizOn())return;ed.wizard.set(plan().id,{lights:true,at:id});
    // another lamp was selected — it flashes: at home (HA) and in 3D, this shows which one it is (two lights in a room)
    const L=find(id);if(L?.placed){ed.ha.identify?.(L.entity);blink(L.id);}};
  // The wizard goes room by room (the owner). When it reaches a lamp, the lamp immediately stands by guess and is selected: visible in the room and in
  // 3D. The room's other lamps are in the panel list: a click places that one too. Everything placed and adjusted in the room is one
  // edit: “Next” saves the room's lights and goes to the next one. Moved to another room without pressing it — the question “Save this room's
  // lights?”: “Yes” — like “Next”, “No” — the room as it was before entering. As it was — the L.was snapshot on each lamp of the room
  // ({k — room, s — lamp}), it is in the plan itself: survives a reload and “Undo”. Placing and removing happen without their own step in
  // the history. Left the step (“Done”) — whatever is not saved is without a place again. Reached the end — to the lamps left behind.
  const cellKey=L=>{const H=L&&(host(L)||L),c=H&&lampCell(plan(),H);return c?c.room.id+'|'+c.poly[0]:null;};
  const OWN=new Set(['was','auto','on']); // not a room edit: snapshot, “by guess”, whether it is on
  const snap=L=>JSON.stringify(Object.keys(L).filter(k=>!OWN.has(k)).sort().map(k=>[k,L[k]]));
  const mine=k=>plan().lights.filter(L=>L.was&&L.was.k===k);
  const dirty=k=>k!=null&&mine(k).some(L=>snap(L)!==L.was.s);
  m.hasUnconfirmedEdits=()=>dirty(sess);
  m.guardLeave=action=>{if(!wizOn()||!dirty(sess))return false;leaving={action};ctxPanel();return true;};
  const save=k=>{for(const L of mine(k)){toHA(L);delete L.was;delete L.draft;}};
  // A lamp has no area in HA but was placed in a room with an area — write it to HA (the owner: the link is stored
  // there — voice assistants, “kitchen lights” automations, other dashboards). A lamp with an area is not touched: in HA it has its own.
  function toHA(L){if(L.area||!L.placed||!L.room||!ed.ha.setArea)return;const a=roomById(plan(),L.room)?.area;if(!a)return;ed.ha.setArea(L.entity,a);L.area=a;}
  const revert=L=>{const o=Object.fromEntries(JSON.parse(L.was.s)),on=L.on;for(const x of Object.keys(L))delete L[x];Object.assign(L,o);L.on=on;};
  const discard=k=>{for(const L of mine(k))revert(L);};
  function hold(k){if(k==null)return false;let ch=false;for(const L of plan().lights)if(!L.was&&cellKey(L)===k){L.was={k,s:snap(L)};ch=true;}return ch;}
  // snapshots not of this room (after “Undo”): a draft — without a place again, the rest — as is
  function clean(k){let ch=false;for(const L of plan().lights)if(L.was&&L.was.k!==k){if(L.draft)revert(L);delete L.was;ch=true;}return ch;}
  // a lamp of another room, while this one is not saved — ask first
  const away=L=>wizOn()&&cellKey(L)!==sess&&dirty(sess);
  function nextInRoom(){return sess!=null?order().find(x=>open(x)&&x.id!==near&&cellKey(x)===sess)||null:null;}
  function nextRoom(){const o=order(),i=o.findIndex(L=>L.id===near),ring=i<0?o:[...o.slice(i+1),...o.slice(0,i+1)];
    const has=x=>open(x)&&cellKey(x)!=null;return ring.find(x=>has(x)&&cellKey(x)!==sess)||ring.find(has)||ring.find(open)||null;}
  function wizPlace(){
    // Import and undo can also bring back a draft when the wizard is closed. Keep it until the user explicitly decides.
    if(!wizOn()){sess=undefined;leaving=null;return;}
    {const sl=find(sel().light);if(sl&&!sl.placed){sel().light=null;cur=sl.id;}} // a lamp without a place was selected — it lands as a draft
    {const c=find(cur);if(c?.placed&&!sel().light){sel().light=c.id;cur=null;}} // already stands (a draft) — just select it
    near??=ed.wizard.get(plan().id)?.at??null;const n=find(near);
    if(sess===undefined)sess=plan().lights.find(L=>L.was)?.was.k??cellKey(n)??null; // after a reload — the same room
    // nothing selected, but we did not move on either (a miss click, “Undo”, a reload) — stay: on our lamp or in the room
    // that has drafts (“Next” was undone — back in the previous room)
    if(!sel().light&&!go&&!find(cur)){const d=n?.draft?n:order().find(x=>x.draft&&x.placed&&x.was?.k===sess)||order().find(x=>x.draft&&x.placed);
      if(d)sel().light=d.id;else if(n?.placed)sel().light=n.id;}
    let ch=false;
    // “Next” — to the next room; a lamp was skipped or it is part of another one — the next one in this room; none — one standing in it,
    // and if there is none either (all skipped) — the room is saved, on to the next one
    if(!sel().light&&go&&!find(cur)){
      if(go==='room'){const nx=nextRoom();if(nx)cur=nx.id;}
      else{const nx=nextInRoom(),pl=!nx&&order().find(x=>x.placed&&!x.with&&cellKey(x)===sess);
        if(nx)cur=nx.id;else if(pl)sel().light=pl.id;else{save(sess);ch=true;const r=nextRoom();if(r)cur=r.id;}}}
    go=false;
    const T=find(sel().light)||asking(),tk=T?cellKey(T):sess;
    if(T&&tk!==sess){
      if(dirty(sess)){leaving={light:sel().light,cur};sel().light=held.light;cur=held.cur;merging=false;if(ch)ed.amend();return;}
      sess=tk;leaving=null;}
    else if(leaving&&T)leaving=null; // back in our own room — no question needed
    if(clean(sess))ch=true;if(hold(sess))ch=true;
    if(!sel().light){const a=asking(),c=a&&lampCell(plan(),a),g=a&&guessForm(a);
      if(c&&placeForm(plan(),a,g.form,g.opt,c)){delete a.skip;a.auto=true;a.draft=true;cur=null;merging=false;sel().light=a.id;keep(a.id);ch=true;blink(a.id);}}
    held={light:sel().light,cur};
    if(ch)ed.amend();}
  // the question “Save this room's lights?” — “Yes” and “No”, then where we were going; Escape or a click on our own room — stay
  function leaveLines(){const L=find(held.light)||find(held.cur)||find(near),c=L&&lampCell(plan(),host(L)||L);
    const head=el(`<div class="line"><b>${c?t('Save lights in “{0}”?',esc(roomName(c,L))):t('Save this room\'s lights?')}</b></div>`);
    const ln=el(`<div class="line next"><span class="sp"></span></div>`),no=el(`<button class="soft">${t('Discard room changes')}</button>`),yes=el(`<button class="soft pri">${t('Save placement')}</button>`);
    const done=keepIt=>{const p=leaving;leaving=null;if(keepIt)save(sess);else discard(sess);merging=false;
      if(p.action){ed.history.commit(plan());ed.update();p.action();return;}if(p.finish){ed.history.commit(plan());ed.update();close();return;}sel().light=p.light;cur=p.cur;ed.commit();ed.draw();};
    const stay=el(`<button class="soft">${t('Keep editing')}</button>`);stay.onclick=()=>{leaving=null;ctxPanel();};
    no.onclick=()=>done(false);yes.onclick=()=>done(true);ln.append(stay,no,yes);return [head,ln];}
  const advance=()=>{sel().light=null;cur=null;merging=false;go=true;};
  // the room whose lamp it is about: in the wizard — the selected lamp's (as in the previous steps the selected room is highlighted), otherwise — the asked one's
  const curCell=()=>{const L=find(sel().light),H=L&&(host(L)||L),a=wizOn()&&H?.placed?H:asking();return a?lampCell(plan(),a):null;};
  function pulse(){ed.draw();}

  // A lamp was selected, added or changed (shape, count, layout, height, a strip piece, dragged, a point deleted, color) — in 3D
  // it shines (scene.shine): smoothly lights up in warm gold with a halo and a ring on the floor, a strip gets a running wave; then —
  // as it was. This shows which one it is and how it lights. The parts of its fixture — together with it. The plan does not flash.
  function blink(...ids){if(ed.reducedMotion?.())return;for(const id of ids)for(const x of [find(id),...plan().lights.filter(l=>l.with===id)])if(x)ed.view.shine?.(x.id);}

  // ---------- hit testing ----------
  // Points first (chandelier, wall light, spots) — they are small, strips and lines are long: a lamp on a strip at a wall is picked by its point,
  // the strip can be picked anywhere else. Then line ends, then the lines and strips themselves. In each pass the selected one goes first.
  function hit(p){const t2=v().tol()**2*1.5,sl=find(sel().light),order=(sl?[sl,...plan().lights.filter(l=>l!==sl)]:plan().lights).filter(L=>L.placed&&!L.with);
    for(const L of order)if(!lineForm(formFor(L))){const i=L.points.findIndex(q=>dist2(q,p)<t2);if(i>=0)return {L,i};}
    for(const L of order)if(formFor(L)==='line'){const vs=shiftSegs(plan(),L);for(let i=0;i<L.segments.length;i++){const [a,b]=vs[i];if(dist2(a,p)<t2)return {L,i,end:0};if(dist2(b,p)<t2)return {L,i,end:1};}}
    for(const L of order)if(lineForm(formFor(L))){const vs=shiftSegs(plan(),L);for(let i=0;i<L.segments.length;i++)if(segDist(p,vs[i][0],vs[i][1])[0]<v().tol())return {L,i};}
    return null;}
  // Strip (fixtures.js): a solid line along the cell outline. The cell is its own part of the room if the strip is in the room of its
  // area, otherwise the whole room it stands in.
  function stripCell(L){const c=lampCell(plan(),L);if(c&&c.room.id===L.room)return c;const r=roomById(plan(),L.room);return r?{room:r,poly:r.polygon,ch:null}:c;}
  function stripOf(L){if(FURN_STRIP[L.opt])return null; // on furniture — it follows the furniture, the ends are not dragged
    const cell=stripCell(L);if(!cell)return null;const K=stripContour(plan(),cell,L.opt);return {K,st:stripRuns(K,L.segments)};}
  // Where the pointer is on the selected strip: the end of a section — drag; the strip itself — a click splits it (a 50 cm gap); a gap — a click closes it;
  // a door at a floor strip — nothing.
  function stripHere(p){const L=find(sel().light);if(!L?.placed||L.with||formFor(L)!=='strip')return null;const o=stripOf(L);if(!o)return null;
    const {K,st}=o,t2=v().tol()**2*1.5;
    if(!st.closed)for(let i=0;i<st.runs.length;i++)for(const end of [0,1])if(dist2(shiftPoint(plan(),L,stripAt(K,st.runs[i][end])),p)<t2)return {L,K,st,kind:'end',i,end};
    const pr=stripProject(K,p);if(pr.d>Math.max(v().tol()*1.2,.35))return null;const s=pr.s;
    const on=st.closed||st.runs.some(([a,b])=>[s,s+K.per].some(x=>x>=a&&x<=b));
    return {L,K,st,s,kind:!on?'fill':K.gaps.some(([a,b])=>s>=a-1e-6&&s<=b+1e-6)?'door':'cut'};}
  // the pointer at the selected strip beats another strip or line on the same wall (at the floor and at the ceiling they coincide in the plan); a point
  // of another lamp (a wall light at the wall) — select it
  // for tests: strip sections and where their ends are
  m.stripInfo=id=>{const L=find(id),o=L&&stripOf(L);return o&&{runs:o.st.runs,closed:o.st.closed,per:o.K.per,ends:o.st.runs.flatMap(r=>[stripAt(o.K,r[0]),stripAt(o.K,r[1])]),at:s=>stripAt(o.K,s)};};
  const stripFirst=(h,sh)=>sh&&(!h||h.L===sh.L||lineForm(formFor(h.L)));
  // a click on a room in the wizard — its lamp: first without a place, then a skipped one, then one already standing (select it); if the room
  // has everything placed or skipped — a click still leads there
  const lampIn=p=>{const here=order().filter(L=>{const c=lampCell(plan(),host(L)||L);return c&&pointIn(p,c.poly);});
    return here.find(open)||here.find(L=>L.skip&&!L.placed)||here.find(L=>L.placed&&!L.with)||null;};

  // ---------- mouse ----------
  m.down=(e,p)=>{
    const h=hit(p),sh=stripHere(p);
    const there=L=>{sel().light=L.id;cur=null;merging=false;m.refresh();ed.draw();return true;};
    if(stripFirst(h,sh)){if(away(sh.L))return there(sh.L);drag={strip:sh,L:sh.L,start:p};ed.drag=drag;
      // Delete then removes the section that was clicked
      let best=-1,bd=Infinity;sh.L.segments.forEach(([a,b],i)=>{const d=segDist(p,a,b)[0];if(d<bd){bd=d;best=i;}});if(best>=0)sel().part=best;return true;}
    if(h){if(away(h.L))return there(h.L);const changed=sel().light!==h.L.id;sel().light=h.L.id;sel().part=h.i;cur=null;merging=false;
      drag={L:h.L,i:h.i,end:h.end,start:p,orig:structuredClone(h.L.segments)};ed.drag=drag;if(changed)m.refresh();ed.draw();return true;}
    // a click on another room — its lamp; on the current lamp's room — nothing (a miss does not take us off it)
    if(wizOn()||cur){const now=find(sel().light)||find(cur),nc=now&&lampCell(plan(),host(now)||now);if(nc&&pointIn(p,nc.poly)){if(!leaving)return false;leaving=null;m.refresh();ed.draw();return true;}
      const q=lampIn(p);if(q){merging=false;if(q.placed){sel().light=q.id;cur=null;}else{sel().light=null;cur=q.id;}m.refresh();ed.draw();return true;}}
    return false;};
  m.move=(e,p)=>{
    if(!drag){const h=hit(p),sh=stripHere(p),use=stripFirst(h,sh)?sh:null,hk=use?use.kind+(use.kind==='end'?use.i+'/'+use.end:Math.round(use.s*20)):null;
      if(hk!==hoverStrip?.hk){hoverStrip=use?{...use,hk}:null;ed.draw();}
      v().cv.style.cursor=use?(use.kind==='end'?'grab':use.kind==='door'?'default':'pointer'):h?'move':(wizOn()||cur)&&lampIn(p)?'pointer':'grab';return;}
    if(drag.strip){const sh=drag.strip;if(!drag.moved&&dist2(p,drag.start)*v().sc**2<9)return;drag.moved=true;if(sh.kind!=='end')return;
      // the section end slides along the outline and goes around corners; snaps to corners and door edges (Shift — no snapping)
      const {K,st,i,end,L}=sh,was=st.runs[i][end];let x=stripProject(K,p).s;x+=Math.round((was-x)/K.per)*K.per;
      if(!e.shiftKey){const tol=Math.min(.25,v().tol(12)); // to corners and ends — 12 px on screen, no farther than 25 cm (it used to be at least 12 cm at any zoom)
        let best=null;for(const c of stripSnaps(K))for(const y of [c-K.per,c,c+K.per,c+2*K.per])if(Math.abs(y-x)<tol&&(best==null||Math.abs(y-x)<Math.abs(best-x)))best=y;if(best!=null)x=best;}
      sh.now=stripMove(K,st,i,end,x);L.segments=stripSegs(K,sh.now);delete L.auto;ed.update();return;}
    if(!drag.moved&&dist2(p,drag.start)*v().sc**2<9)return;
    drag.moved=true;const L=drag.L,free=e.shiftKey,f=formFor(L);delete L.auto; // the lamp was moved by hand — changing the room's area will not remove it
    if(!lineForm(f)){
      if(f==='wall'){const r=roomAt(plan(),p)||roomById(plan(),L.room);L.points[drag.i]=r?snapWall(r.polygon,p):p;ed.guides=[];}
      else{const s=snapLightPoint(plan(),L,p,{free,tol:v().tol(),skip:drag.i}),r=roomAt(plan(),s.p)||roomById(plan(),L.room);
        // the body does not go into the wall: from its axis — the wall thickness and the body radius
        L.points[drag.i]=r?keepIn(r.polygon,s.p,WALL.inner+BODY[f]):s.p;ed.guides=s.guides||[];if(f==='spots')L.opt='free';}
      const r=roomAt(plan(),L.points[0]);if(r)L.room=r.id;}
    else if(f==='strip')return; // a strip is dragged by the section ends (above)
    else{ // a ceiling line: an end — anywhere (snaps to the grid and to the straight line with the other end), the middle — moves the piece
      L.opt='free';const seg=L.segments[drag.i];
      // the line does not pass through a wall: an end — up to the first wall from the other end, the whole piece — only inside one room
      if(drag.end!=null){const o=seg[1-drag.end],r=roomAt(plan(),o)||roomById(plan(),L.room);let q=free?p:[Math.round(p[0]/GRID)*GRID,Math.round(p[1]/GRID)*GRID];
        if(!free){const tol=v().tol();if(Math.abs(q[0]-o[0])<tol)q=[o[0],q[1]];else if(Math.abs(q[1]-o[1])<tol)q=[q[0],o[1]];}
        if(r)q=clampRay(r.polygon,o,q);
        if(Math.hypot(q[0]-o[0],q[1]-o[1])>.2)seg[drag.end]=[+q[0].toFixed(3),+q[1].toFixed(3)];}
      else{let dx=p[0]-drag.start[0],dy=p[1]-drag.start[1];if(!free){dx=Math.round(dx/GRID)*GRID;dy=Math.round(dy/GRID)*GRID;}
        const [a,b]=drag.orig[drag.i].map(q=>[+(q[0]+dx).toFixed(3),+(q[1]+dy).toFixed(3)]),r=roomAt(plan(),a);
        if(r&&pointIn(b,r.polygon)&&clampRay(r.polygon,a,b,0)===b){L.segments[drag.i]=[a,b];if(L.segments.length===1)L.room=r.id;}}}
    ed.update();};
  m.dragCursor=()=>drag?.strip?(drag.strip.kind==='end'?'grabbing':null):drag&&formFor(drag.L)!=='strip'?'move':null;
  m.cancelDrag=()=>{drag=null;hoverStrip=null;};
  m.up=()=>{if(!drag)return;const d=drag;drag=null;ed.drag=null;ed.guides=[];
    if(d.strip){const sh=d.strip,L=sh.L;
      if(sh.kind==='end'){if(d.moved){ed.commit();blink(L.id);}else ed.draw();return;}
      if(d.moved||sh.kind==='door'){ed.draw();return;} // dragged along the strip — not a click; a door at a floor strip — nothing
      const segs=stripSegs(sh.K,sh.kind==='cut'?stripCut(sh.K,sh.st,sh.s):stripFill(sh.K,sh.st,sh.s));if(!segs.length){ed.draw();return;}
      L.segments=segs;delete L.auto;hoverStrip=null;ed.commit();blink(L.id);return;}
    if(d.moved){ed.commit();blink(d.L.id);}else ed.draw();};
  m.deselect=()=>{if(sel().light||cur){sel().light=null;cur=null;merging=false;m.refresh();}};
  const lift=L=>{L.points=[];L.segments=[];L.placed=false;L.room=null;delete L.auto;delete L.draft;
    for(const x of plan().lights)if(x.with===L.id){delete x.with;x.placed=false;x.room=null;}};
  const skip=L=>{lift(L);L.skip=true;advance();ed.commit();};
  const unplace=L=>{if(wizOn())return skip(L); // in the wizard remove = skip: otherwise the lamp would land again right away
    lift(L);sel().light=null;ed.commit();};
  // Delete — remove the selected point or piece; the last one — the lamp leaves the plan
  const remove=()=>{const L=find(sel().light);if(!L)return;if(L.with){delete L.with;L.placed=false;L.room=null;sel().light=null;ed.commit();return;}
    const f=formFor(L),list=lineForm(f)?L.segments:L.points;
    if(f==='strip'){const o=stripOf(L);if(!o||o.st.closed||o.st.runs.length<=1){unplace(L);return;} // for a strip — the whole section
      const {K,st}=o,sg=L.segments[sel().part??0]||L.segments[0],x=stripProject(K,[(sg[0][0]+sg[1][0])/2,(sg[0][1]+sg[1][1])/2]).s,j=Math.max(0,st.runs.findIndex(([a,b])=>[x,x+K.per].some(y=>y>=a&&y<=b)));
      L.segments=stripSegs(K,{runs:st.runs.filter((_,k)=>k!==j),closed:false});sel().part=null;ed.commit();blink(L.id);return;}
    if(list.length<=1){unplace(L);return;}
    list.splice(sel().part??0,1);if(f==='spots'){L.count=L.points.length;L.opt='free';}if(f==='pendant'||f==='ceiling')L.count=L.points.length;sel().part=null;ed.commit();blink(L.id);};
  m.key=e=>{if(leaving){if(e.key==='Escape'){leaving=null;ctxPanel();}return;}if(e.key==='Delete'||e.key==='Backspace')remove();if(e.key==='Escape')m.deselect();};

  // ---------- drawing ----------
  // Dragging a lamp point or a line end shows right away how far the walls are: horizontally and vertically to the nearest one
  // (to the wall surface, like on a drawing). Closer than 15 cm (a wall light on a wall) — not shown along that axis.
  const dragPoint=()=>{if(!drag||drag.strip||!drag.L?.placed)return null;const L=drag.L,f=formFor(L);
    return !lineForm(f)?L.points[drag.i]:f==='line'&&drag.end!=null?L.segments[drag.i]?.[drag.end]:null;};
  function wallDistances(p){const r=roomAt(plan(),p)||roomById(plan(),drag.L.room);if(!r)return;const P=r.polygon,{ctx}=v();
    const hit=(d)=>{let best=Infinity;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],e=[b[0]-a[0],b[1]-a[1]],den=d[0]*e[1]-d[1]*e[0];if(Math.abs(den)<1e-9)continue;
      const w=[a[0]-p[0],a[1]-p[1]],t=(w[0]*e[1]-w[1]*e[0])/den,u=(w[0]*d[1]-w[1]*d[0])/den;if(t>1e-6&&u>=-1e-6&&u<=1+1e-6&&t<best)best=t;}return best;};
    for(const dirs of [[[1,0],[-1,0]],[[0,1],[0,-1]]]){const [d,hd]=dirs.map(d=>[d,hit(d)]).reduce((x,y)=>y[1]<x[1]?y:x),len=hd-WALL.inner;
      if(!isFinite(hd)||len<.15)continue;const q=[p[0]+d[0]*len,p[1]+d[1]*len];
      ctx.strokeStyle=pal.acc;ctx.lineWidth=1.2;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(...v().S(p));ctx.lineTo(...v().S(q));ctx.stroke();ctx.setLineDash([]);
      v().dot(q,2.5,pal.acc);const [X,Y]=v().S([(p[0]+q[0])/2,(p[1]+q[1])/2]);dimLabel(v(),X,Y,t('{0} cm',Math.round(len*100)));}}
  m.draw=()=>{const {ctx}=v(),L=find(sel().light),a=asking();
    // the current lamp's room pulses — in the wizard all the time while it is current
    {const c=curCell();if(c){const k=.35;ctx.save();ctx.globalAlpha=.12+.22*k;ctx.fillStyle=pal.acc;v().path(c.poly,true);ctx.fill();
      ctx.globalAlpha=.55+.45*k;ctx.strokeStyle=pal.acc;ctx.lineWidth=2.5;ctx.stroke();ctx.restore();}}
    const H=L&&(host(L)||L);
    // a strip is selected: gaps (except doors) — dashed, a click closes them; hovering the strip — red where the gap will be;
    // section ends — circles, they are dragged
    if(H?.placed&&formFor(H)==='strip'&&!L.with){const o=stripOf(H);if(o){const {K,st}=o,hv=hoverStrip,
        stroke=(segs,col,w,dash)=>{ctx.save();ctx.strokeStyle=col;ctx.lineWidth=w;ctx.lineCap='round';ctx.setLineDash(dash||[]);ctx.beginPath();for(const [p,q] of shiftSegs(plan(),H,segs)){ctx.moveTo(...v().S(p));ctx.lineTo(...v().S(q));}ctx.stroke();ctx.restore();};
      if(!st.closed)st.runs.forEach(([,e],i)=>{const nx=i<st.runs.length-1?st.runs[i+1][0]:st.runs[0][0]+K.per;if(nx-e<.05)return;
        const on=hv?.kind==='fill'&&[hv.s,hv.s+K.per,hv.s-K.per].some(x=>x>=e&&x<=nx);stroke(stripSegs(K,{runs:[[e,nx]],closed:false}),alpha(pal.acc,on?.9:.35),on?4:2.5,[6,5]);});
      if(hv?.kind==='cut'&&hv.L===H)stroke(stripSegs({...K,gaps:[]},{runs:[[hv.s-.25,hv.s+.25]],closed:false}),alpha(pal.bad,.85),7);
      if(!st.closed)st.runs.forEach((r,i)=>[0,1].forEach(end=>{const big=hv?.kind==='end'&&hv.i===i&&hv.end===end;v().dot(shiftPoint(plan(),H,stripAt(K,r[end])),big?6.5:5,'#fff',pal.acc,1.8);}));
      // dragging an end — the section length
      const dn=drag?.strip?.now;if(dn){const r=dn.runs[drag.strip.i],q=shiftPoint(plan(),H,stripAt(K,r[drag.strip.end])),[X,Y]=v().S(q);dimLabel(v(),X,Y-18,t('{0} m',num(r[1]-r[0],2)));}}}
    if(H?.placed&&formFor(H)==='line')for(const [p,q] of H.segments)for(const x of [p,q])v().dot(x,5,'#fff',pal.acc,1.8);
    if(H?.placed&&v().sc>35){const q=H.points[0]||H.segments[0]?.[0];if(q){const [X,Y]=v().S(q);ctx.fillStyle=pal.label;ctx.font=`600 11.5px ${FONT}`;ctx.textAlign='left';ctx.fillText(L.name,X+10,Y-9);}}
    // “Flash” — rings around the lamp
    const F=find(flash),FH=F&&(host(F)||F);if(FH?.placed){const k=ed.reducedMotion?.()?0:(performance.now()%500)/500;ctx.strokeStyle=pal.acc;ctx.globalAlpha=1-k;ctx.lineWidth=2;
      for(const q of [...FH.points,...FH.segments.map(([p,r])=>[(p[0]+r[0])/2,(p[1]+r[1])/2])]){const [X,Y]=v().S(q);ctx.beginPath();ctx.arc(X,Y,8+k*18,0,7);ctx.stroke();}ctx.globalAlpha=1;}
    const dp=dragPoint();if(dp)wallDistances(dp);
    const pv=placing?.preview;if(pv){ctx.strokeStyle=ctx.fillStyle=pal.acc;
      if(pv.seg){ctx.beginPath();ctx.moveTo(...v().S(pv.seg[0]));ctx.lineTo(...v().S(pv.seg[1]));ctx.lineWidth=5;ctx.lineCap='round';ctx.stroke();ctx.lineCap='butt';}else v().dot(pv.p,6,pal.acc);}
  };

  // ---------- lamp from the list onto the plan ----------
  // A row of a lamp without a place is dragged: it lands with the shape that was chosen or guessed, in the room where it was released.
  const formOfL=L=>L.form||guessForm(L).form;
  addEventListener('pointermove',e=>{
    if(!placing)return;const r=v().cv.getBoundingClientRect(),X=e.clientX-r.left,Y=e.clientY-r.top;
    if(X<0||Y<0||X>r.width||Y>r.height){placing.preview=null;ed.guides=[];ed.draw();return;}
    const p=v().W([X,Y]),L=placing.L,f=formOfL(L);
    if(f==='strip')placing.preview=stripOnWall(plan(),p);
    else if(f==='wall'){const rm=roomAt(plan(),p);placing.preview=rm?{p:snapWall(rm.polygon,p)}:null;}
    else{const s=snapLightPoint(plan(),L,p,{free:e.shiftKey,tol:v().tol()});placing.preview={p:s.p};ed.guides=s.guides||[];}
    ed.draw();
  });
  addEventListener('pointerup',()=>{
    if(!placing)return;const {L,preview:pv}=placing;placing=null;ed.guides=[];
    if(!pv){ed.draw();return;}
    const p=pv.p||[(pv.seg[0][0]+pv.seg[1][0])/2,(pv.seg[0][1]+pv.seg[1][1])/2],r=roomAt(plan(),p);if(!r){ed.draw();return;}
    // in its own room — its part (two areas), in another one — the whole room
    const own=lampCell(plan(),L),cell=own&&own.room===r&&pointIn(p,own.poly)?own:{room:r,poly:r.polygon,ch:null},g=guessForm(L),f=formOfL(L),s0=snap(L);
    placeForm(plan(),L,f,L.opt&&L.form===f?L.opt:f===g.form?g.opt:undefined,cell);
    if(pv.seg&&f==='strip')L.segments=stripOnEdge(plan(),cell,L.opt,p);else if(L.points.length===1)L.points=[pv.p];
    delete L.auto;if(wizOn()){L.draft=true;if(!L.was)L.was={k:cellKey(L),s:s0};}cur=null;sel().light=L.id;ed.commit();blink(L.id);
  });

  // ---------- panels ----------
  const roomName=(cell,L)=>{const zp=zoneParts(cell.room);return zp&&cell.poly===zp.zone?ed.areaName(cell.room.zone.area):cell.room.name;};
  // “Flash”: the real lamp flashes at home (HA), in the editor — in 3D and with rings on the plan
  function flashBtn(L){if(!ed.ha.identify)return [];
    const b=el(`<button class="ib ${flash===L.id?'on':''}" title="${t('Flash this light at home to see which one it is')}">${icon('zap',15)}</button>`);
    b.onclick=()=>{ed.ha.identify(L.entity);flash=L.id;b.classList.add('on');const t0=performance.now();blink(L.id); // in 3D — the same shine
      const tick=()=>{const t=performance.now()-t0;if(t>2600||flash!==L.id){if(flash===L.id)flash=null;b.classList.remove('on');ed.draw();return;}
        ed.draw();requestAnimationFrame(tick);};requestAnimationFrame(tick);};
    return [b];}
  // Shape tiles are the same before and after the choice (the owner: do not change the look on the fly): while the lamp is not on the plan, the guessed one
  // is outlined; for a placed one — the current one is selected.
  function formTiles(L){const g=guessForm(L),now=L.placed?formFor(L):null,row=el(`<div class="line forms"></div>`);
    for(const f of FORMS){const guess=!now&&g.form===f.id;
      const b=el(`<button class="form ${now===f.id?'on':''} ${guess?'guess':''}" title="${guess?t('{0} — likely this one',esc(f.tip)):esc(f.tip)}">${icon('f_'+f.id,22)}<span>${f.name}</span></button>`);
      b.onclick=()=>{if(now===f.id)return;choose(L,f.id,g.form===f.id?g.opt:undefined);};row.append(b);}
    return row;}
  function choose(L,form,opt){const cell=lampCell(plan(),L);if(!cell)return;placeForm(plan(),L,form,opt,cell);delete L.auto;cur=null;merging=false;if(!wizOn())toHA(L);
    // the panel stays at the lamp with any shape — tiles can be tried in turn; to the next room — “Next”
    sel().light=L.id;ed.commit();blink(L.id);}
  // A lamp without a place: what it is — or where it is (the area is not on the plan), skip, part of another fixture.
  function askLines(L){const cell=lampCell(plan(),L),lines=[];
    const head=el(`<div class="line"><b>${esc(L.name)}</b>${cell?`<small>${esc(roomName(cell,L))}</small>`:''}</div>`);head.append(...flashBtn(L));lines.push(head);
    if(!cell){lines.push(el(`<div class="line sub"><small>${t('Where is this light?')}${ed.ha.setArea?' '+t('We\'ll save its area to Home Assistant too.'):''}</small></div>`));const row=el(`<div class="line names"></div>`);
      for(const r of plan().rooms){if(r.solid)continue;const b=el(`<button class="chip" title="${r.area?t('Home Assistant area: “{0}”',esc(ed.areaName(r.area))):t('Room has no HA area — saved here only')}">${esc(r.name)}</button>`);b.onclick=()=>{const s0=snap(L);L.room=r.id;if(wizOn()&&!L.was)L.was={k:cellKey(L),s:s0};ed.commit();};row.append(b);}
      lines.push(row);}
    else if(merging)lines.push(...mergeLines(L,cell));
    else lines.push(formTiles(L));
    const foot=el(`<div class="line foot"><span class="hint">${t('Not on the plan or not a light? Skip it — you can come back later.')}</span></div>`);
    foot.append(skipBtn(L));lines.push(foot);
    const mb=cell&&!merging&&mergeBtn(L,cell);if(mb){const t=el(`<div class="line foot2"></div>`);t.append(mb);lines.push(t);}
    return lines;}
  // a chandelier with three smart bulbs, a ceiling light with main and ambient light — several HA lamps in one fixture
  const hosts=(L,cell)=>plan().lights.filter(x=>x!==L&&x.placed&&!x.with&&x.room===cell.room.id); // drafts — only of its own room
  function mergeBtn(L,cell){if(!hosts(L,cell).length||plan().lights.some(x=>x.with===L.id))return null;
    // a small “?” in the button itself (the owner: not a separate big button), the hint — on hovering it; with a finger — a tap
    const b=el(`<button class="soft mb">${t('It\'s part of another fixture')}<span class="qi">${icon('help',13)}</span></button>`);b.onclick=()=>{tipHide();merging=true;ctxPanel();};
    const qi=b.querySelector('.qi');tip(qi,MERGE_HELP,qi);return b;} // the hint is only on the “?” (the owner); a click on the “?” is not “part of another”
  const MERGE_HELP=t('For one fixture with several Home Assistant lights — a chandelier with smart bulbs, a main and a night light. This light won\'t be placed on its own; it will shine from the selected fixture.');
  function mergeLines(L,cell){const row=el(`<div class="line names"></div>`);
    for(const H of hosts(L,cell)){const b=el(`<button class="chip">${esc(H.name)}</button>`);
      b.onclick=()=>{L.with=H.id;L.placed=true;L.room=H.room;L.points=[];L.segments=[];delete L.skip;delete L.auto;delete L.draft;advance();ed.commit();blink(L.id);};row.append(b);}
    const back=el(`<button class="chip">${t('Cancel')}</button>`);back.onclick=()=>{merging=false;ctxPanel();};row.append(back);
    return [el(`<div class="line sub"><small>${t('Part of which fixture?')}</small></div>`),row];}
  function skipBtn(L){const b=el(`<button class="soft" title="${t('Not on the plan or not a light — you can come back later')}">${t('Skip')}</button>`);b.onclick=()=>skip(L);return b;}
  // In the wizard, a room with several lamps gets a list: all of the room's lamps from HA, which one stands, for a strip — at the floor or at the ceiling;
  // a click goes to it (without a place — it lands as a draft). It shows right away how many lamps there are and what is left.
  function roomList(L){const k=cellKey(L);if(!wizOn()||!k)return null;const ls=order().filter(x=>cellKey(x)===k);if(ls.length<2)return null;
    const box=el(`<div class="line rlist"></div>`);
    const gOpt=x=>{const g=guessForm(x).opt,c=lampCell(plan(),x);return (c&&furnGuess(plan(),c,x,g))||g;}; // not placed yet — where it will land
    for(const x of ls){const H=host(x),f=x.placed?formFor(H||x):guessForm(x).form,opt=x.placed?(H||x).opt:gOpt(x),
        where=f==='strip'?(FURN_STRIP[opt]?.where||(opt==='floor'?t('at floor'):t('at ceiling'))):'',st=H?t('part of “{0}”',esc(H.name)):x.skip&&!x.placed?t('skipped'):x.placed&&!x.draft?icon('check',14):'';
      const b=el(`<button class="lrow ${x===L?'on':''} ${x.placed&&!x.draft?'done':''} ${!x.placed?'todo':''}">${icon('f_'+f,15)}<span class="nm">${esc(x.name)}</span>${where?`<small>${where}</small>`:''}<span class="st">${st}</span></button>`);
      b.onclick=()=>{if(x===L)return;merging=false;if(x.placed){sel().light=x.id;cur=null;}else{sel().light=null;cur=x.id;}m.refresh();ed.draw();};box.append(b);}
    return box;}
  function editLines(L){const hl=host(L),cell=lampCell(plan(),hl||L),list=roomList(L),
      line=el(list?`<div class="line"><b>${esc(roomName(cell,L))}</b></div>`:`<div class="line"><b>${esc(L.name)}</b>${cell&&wizOn()?`<small>${esc(roomName(cell,L))}</small>`:''}</div>`);line.append(...flashBtn(L));
    if(hl){line.append(el(`<small>${t('part of “{0}”',esc(hl.name))}</small>`));const un=el(`<button class="soft" title="${t('This is a separate fixture')}">${t('Detach')}</button>`);
      un.onclick=()=>{delete L.with;L.placed=false;L.room=null;sel().light=null;cur=L.id;ed.commit();};line.append(un);return [line,...(list?[list]:[]),...nextLine(L)];}
    const c=el(`<input type="color" value="${L.color||'#ffce87'}" title="${t('Light color')}">`);c.onchange=()=>{L.color=c.value;ed.commit();blink(L.id);};
    const d=el(`<button class="ib bad" title="${t('Remove from plan')}">${icon('trash',15)}</button>`);d.onclick=()=>unplace(L);line.append(c);if(!wizOn())line.append(d);
    if(merging&&cell&&wizOn())return [line,...mergeLines(L,cell)];
    const lines=[line,...(list?[list]:[]),formTiles(L)],f=formFor(L),opts=el(`<div class="line opts"></div>`);
    const chips=(map,val)=>Object.entries(names(map)).map(([k,name])=>{const b=el(`<button class="chip ${val===k?'on':''}" ${map[k].tip?`title="${esc(map[k].tip)}"`:''}>${esc(name)}</button>`);
      b.onclick=()=>{if(val===k)return;L.opt=k;if(cell)relayout(plan(),L,cell,val);delete L.auto;ed.commit();blink(L.id);};return b;});
    const count=(n,max)=>{const s=el(`<span class="stepper" title="${t('Count')}"><button class="ib">${icon('minus',14)}</button><b>${n}</b><button class="ib">${icon('plus',14)}</button></span>`),[a,b]=s.querySelectorAll('button');
      const set=k=>{L.count=k;if(cell)relayout(plan(),L,cell);delete L.auto;ed.commit();blink(L.id);};a.disabled=n<=1;b.disabled=n>=max;a.onclick=()=>set(n-1);b.onclick=()=>set(n+1);return s;};
    if(f==='ceiling')opts.append(el(`<small>${t('Count')}</small>`),count(L.points.length,6)); // several shades on one switch
    else if(f==='spots')opts.append(el(`<small>${t('Count')}</small>`),count(L.points.length,40),...chips(SPOTS,L.opt));
    else if(f==='pendant')opts.append(el(`<small>${t('Count')}</small>`),count(L.points.length,8));
    else if(f==='line')opts.append(...chips(LINES,L.opt));
    else if(f==='strip')opts.append(...chips({...STRIP,...Object.fromEntries((cell?furnOpts(plan(),cell):[]).map(k=>[k,FURN_STRIP[k]]))},L.opt)); // on furniture — if it is in the room
    else if(f==='wall'){ // wall light — how many and at what height from the floor (in cm)
      const hi=el(`<label class="num" title="${t('Height above floor')}">${t('Height')}<input inputmode="decimal" value="${Math.round(L.h*100)}"><small>${t('cm')}</small></label>`),inp=hi.querySelector('input');
      inp.onfocus=()=>inp.select(); // a click selects the number, typing replaces it right away
      inp.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')inp.blur();if(e.key==='Escape'){inp.value=Math.round(L.h*100);inp.blur();}};
      inp.onchange=()=>{const h=parseLen(inp.value);if(h==null){inp.value=Math.round(L.h*100);return;}L.h=+Math.max(.1,Math.min(WALL.height-.1,h)).toFixed(2);delete L.auto;ed.commit();blink(L.id);};
      opts.append(el(`<small>${t('Count')}</small>`),count(L.points.length,6),hi);}
    // a floor lamp has no choice (the owner: remove “Floor lamp / Table lamp”); the height is guessed from the name: “night light”, “table” — 75 cm
    if(opts.childNodes.length)lines.push(opts);
    return [...lines,...missingLine(cell),...nextLine(L,cell)];}
  // “Missing a light?” — in the step, above “Confirm room”: a fixture comes only from HA (the owner)
  // the cell's area: the second part of a room — its area, otherwise — the room's; without an area — just “add it in HA”
  const cellArea=cell=>{if(!cell)return null;const zp=zoneParts(cell.room);return zp&&cell.poly===zp.zone?cell.room.zone.area:cell.room.area;};
  function missingLine(cell){if(!wizOn()||!ed.ha.devicesUrl)return [];const area=cellArea(cell),name=area&&ed.areaName(area);
    const ln=el(`<div class="line foot"><span class="hint">${name?t('Missing a light? Add it in Home Assistant to the “{0}” area.',esc(name)):t('Missing a light? Add it in Home Assistant first.')}</span></div>`);
    ln.append(haLink());return [ln];}
  const haLink=()=>el(`<a class="soft btn" href="${esc(ed.ha.devicesUrl)}" target="_blank" rel="noopener" title="${t('Open devices in Home Assistant')}">${t('Open HA')} ↗</a>`);
  // the bottom of the panel in the wizard: “part of another” — on the left, “Next” — on the right: the room's lights are saved, on to the next room.
  // There is no “Skip” here (the owner: not needed); to finish — “Done”
  function nextLine(L,cell){if(!wizOn())return [];const ln=el(`<div class="line next"></div>`);
    const mb=cell&&mergeBtn(L,cell);if(mb)ln.append(mb);
    if(queue().length||dirty(sess)){const nx=el(`<button class="soft pri" title="${t('Save this room\'s lights and go to the next')}">${t('Confirm room')}</button>`);
      nx.onclick=()=>{save(sess);advance();go='room';ed.commit();};ln.append(el(`<span class="sp"></span>`),nx);}
    return ln.childNodes.length?[ln]:[];}
  function ctxPanel(){if(ed.mode!==m)return;if(leaving&&wizOn()){ed.showCtx(leaveLines());pulse();return;}const L=find(sel().light);
    if(L&&!L.placed){sel().light=null;cur=L.id;}
    if(L?.placed){keep(L.id);ed.showCtx(editLines(L));if(wizOn())pulse();return;}
    const a=asking();if(a){keep(a.id);ed.showCtx(askLines(a));pulse();return;}
    ed.showCtx(null);}
  m.anchor=()=>{const L=find(sel().light),H=L&&(host(L)||L);let pts;
    // the panel is above the lamp's room (like the question before the choice): it does not jump after the choice and does not cover the room; a lamp dragged
    // out of the room — above both of them
    if(H?.placed){const c=lampCell(plan(),H);pts=[...(c?c.poly:[]),...H.points,...H.segments.flat()];}
    else{const a=asking();if(!a)return null;const c=lampCell(plan(),a);pts=c?c.poly:plan().rooms.flatMap(r=>r.polygon);}
    if(!pts.length)return null;const xs=pts.map(q=>q[0]),ys=pts.map(q=>q[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];};

  // ---------- bottom bar and the list of lamps by area ----------
  const status=L=>{const hl=host(L);if(hl)return t('part of “{0}”',hl.name);if(L.skip&&!L.placed)return t('skipped');if(!L.placed)return ed.lampWaits(L)?t('no room'):t('not on the plan');
    const f=formFor(L),n=lineForm(f)?L.segments.length:L.points.length;return formName(f)+(n>1?` · ${n}`:'');};
  // strips from old plans (in pieces along walls, with gaps at corners) — once as a solid line along the outline
  // and any strip running where it has nothing to hold on to (the wall between rooms was removed, a zone border) — without that piece
  const total=segs=>segs.reduce((t,[a,b])=>t+Math.hypot(b[0]-a[0],b[1]-a[1]),0);
  function healStrips(){let ch=false;
    for(const L of plan().lights){if(!L.placed||L.with||formFor(L)!=='strip')continue;const o=stripOf(L);if(!o)continue;
      const segs=stripSegs(o.K,o.st);
      if(!L.loop){if(segs.length){L.segments=segs;L.loop=1;ch=true;}continue;}
      if(total(segs)<total(L.segments)-.02){ // only when there is something to cut off — the user's own short gaps are not touched
        const c=stripCell(L);L.segments=segs.length?segs:c?stripLayout(plan(),c,L.opt,L.name):L.segments;ch=true;}}
    if(ch)ed.amend();}
  m.refresh=()=>{
    if(ed.mode!==m)return;healStrips();wizPlace();
    const L0=plan().lights,Lc=L0.filter(L=>!ed.lampWaits(L)),left=Lc.filter(todo).length,tools=$('tools');tools.innerHTML='';tools.appendChild(ed.selectButton());
    if(left&&!wizOn()){const b=el(`<button class="primary" title="${t('Puts each light in its area\'s room, guessed from its name')}">${icon("sparkles",15)}${t('Auto-place')}</button>`);
      b.onclick=()=>{ed.versions.mark('before','autoLights');const was=new Set(plan().lights.filter(l=>l.placed).map(l=>l.id)),n=autoPlace(plan());ed.commit();blink(...plan().lights.filter(l=>l.placed&&!was.has(l.id)).map(l=>l.id));ed.banner(n?t('Placed {0, plural, one {# light} other {# lights}}. Move any that are off.',n):t('No rooms match these lights\' areas.'),[[t('Got it'),()=>ed.banner()]]);};tools.appendChild(b);}
    const side=$('side-body');side.innerHTML='';ed.sideHead(t('Lights|lamps'),`${Lc.length-left}/${Lc.length}`);const a=asking();
    // area switches that are not lamps yet: lights on a relay (Sonoff, Aqara) — in HA this is a switch, not a light
    const relays=(ed.ha.switches?.()||[]).filter(w=>!L0.some(l=>l.entity===w.entity));
    for(const ar of ed.sortAreas(new Set([...L0.map(l=>l.area||''),...relays.map(w=>w.area||'')]))){
      const lamps=L0.filter(l=>(l.area||'')===ar),done=lamps.filter(l=>!todo(l)).length,away=!!ar&&!ed.areaOnPlan(ar);
      const body=section(side,'zone:'+ar,ar?ed.areaName(ar):t('No area'),{count:`${done}/${lamps.length}`,open:done<lamps.length&&!away});
      if(away)body.appendChild(el(`<p class="empty">${t('This area isn’t on the plan — click a light, then its spot.')}</p>`));
      for(const L of lamps){const f=L.placed&&!L.with?formFor(L):null;
        const row=el(`<div class="row lamp ${todo(L)?'todo':''} ${L.id===sel().light||L===a?'sel':''}" data-id="${L.id}" title="${L.placed?'':t('Click to identify this light, or drag it onto the plan')}"><button class="bulb ib ${L.on?'on':''}" title="${t('Turn on / off')}">${icon(f?'f_'+f:'bulb',16)}</button><span class="name">${esc(L.name)}</span><small>${esc(status(L))}</small></div>`);
        row.querySelector('.bulb').onclick=e=>{e.stopPropagation();L.on=!L.on;ed.view.setLightOn(L.id,L.on);ed.history.save(plan());m.refresh();ed.draw();};
        row.onpointerdown=e=>{if(e.target.closest('.bulb')||L.placed)return;e.preventDefault();placing={L};};
        row.onclick=e=>{if(e.target.closest('.bulb'))return;if(L.placed)ed.select('light',L.id);else{sel().light=null;cur=L.id;merging=false;m.refresh();ed.draw();}};
        body.appendChild(row);}
      for(const w of relays.filter(w=>(w.area||'')===ar)){
        const row=el(`<div class="row relay" title="${t('A light on this switch? Add it as a light')}"><span class="name">${esc(w.name)}</span><small>${t('switch')}</small><button class="soft">${t('It\'s a light')}</button></div>`);
        row.querySelector('button').onclick=()=>{L0.push({id:'relay_'+w.entity,entity:w.entity,name:w.name,area:w.area,relay:true,color:'#ffce87',on:true,placed:false,points:[],segments:[],room:null});ed.commit();};
        body.appendChild(row);}}
    // below the list: a fixture comes only from HA — the one you need is missing, add it there (the owner)
    if(ed.ha.devicesUrl){const ft=el(`<div class="side-missing"><span>${t('Missing a light? Add it in Home Assistant first.')}</span></div>`);ft.append(haLink());side.appendChild(ft);}
    stepBanner();ctxPanel();focus3d();ed.pipHint?.(false);
  };
  // In the wizard step 3D itself shows a close-up of the room whose lamp it is about, and the light is on only there — in the others
  // it smoothly fades (the owner asked: this way you see how exactly this room is lit). A lamp is selected — only it is on, the scene
  // darkens (the owner: “it glows like a lighthouse, can't tell what's what”). Outside the step — all lights as they are.
  let focused=null;
  function focus3d(){if(!wizOn()){ed.view.setSolo?.(null);return;}const L=find(sel().light),H=L&&(host(L)||L),a=H?.placed?H:asking(),c=a&&lampCell(plan(),a);
    if(!c){ed.view.setSolo?.(null);return;}
    // a placed lamp is selected — in 3D only it is on (and the parts of its fixture), the scene darkens; otherwise — the whole room's light
    ed.view.setSolo?.(c.room.id,H?.placed?[H.id,...plan().lights.filter(x=>x.with===H.id).map(x=>x.id)]:null);
    const k=c.room.id+'|'+c.poly[0];if(k===focused)return;focused=k;ed.view.focus?.(c.poly);}
  m.leave=()=>{ed.pipHint?.(false);focused=null;ed.view.setSolo?.(null);};
  return m;
}
