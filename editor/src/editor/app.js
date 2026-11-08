// Editor: state, history, the 2D–3D link, screen layout, mouse and keyboard.
import {t} from '../i18n/i18n.js';
import {createView} from '../core/scene.js';
import {validate,buildPlan2d,openingCoords,wallsAt,offsetVar,edgeThickness,WALL} from '../core/geometry.js';
import {migrate,emptyPlan,roomById,wallDefaults,closeOuterOpen} from '../core/plan.js';
import {furnitureConflicts} from '../core/layout.js';
import {isRun,runGeo,syncRuns} from '../core/runs.js';
import {syncFurnStrips} from '../core/fixtures.js';
import {byId} from '../core/catalog.js';
import {layoutSensors} from '../core/sensors.js';
import {sensorsMode} from './modes/sensors.js';
import {devicesMode} from './modes/devices.js';
import {sideWall,wallBase} from '../core/surfaces.js';
import {createView2d} from './view2d.js';
import {createDragGesture} from './drag-gesture.js';
import {createHistory} from './history.js';
import {idbStore} from './idb.js';
import {createVersions} from './versions.js';
import {openVersions} from './versions-panel.js';
import {mergePlanLights} from './ha.js';
import {createUnderlay} from './underlay.js';
import {drawPlan,drawGuides,readPalette} from './draw.js';
import {icon,fillIcons} from './icons.js';
import {roomsMode,DRAW_RECT} from './modes/rooms.js';
import {furnitureMode} from './modes/furniture.js';
import {lightsMode} from './modes/lights.js';
import {$,el,ask,banner} from './ui.js';
import {createCoach} from './coach.js';
import {createViewDemo} from './view-demo.js';
import {createLook} from './look.js';
import {liveScene} from '../core/devices.js';
import {createPath} from './wizard-path.js';
import {stepReadyToFinish,areaOnPlan,lampWaits} from './wizard-state.js';
import {LANGS,getLang} from '../i18n/i18n.js';

// A mouse wheel steps by 120 (wheelDelta), a trackpad — in small fractions and often with deltaX.
const isMouseWheel=e=>e.deltaX===0&&e.wheelDeltaY!==undefined&&e.wheelDeltaY!==0&&e.wheelDeltaY%120===0;
const UI='home-twin-editor:ui';

export function createApp({haLights,ha}){
  const areaName=id=>ha.areas().find(a=>a.area_id===id)?.name||id;
  fillIcons();
  const ed={plan:emptyPlan(),sel:{},guides:[],drag:null,capture:null,grid:true,errors:[],conflicts:new Map(),hidden:0,areaName,ha,hover:null,
    debug:new URLSearchParams(location.search).has('debug'),ask,banner};
  // A wizard step (“Split into rooms…”) stays until its “Done” is pressed. A temporary hint goes on top of it
  // and, once closed, brings the step back. A step lives in its own mode: gone to “Furniture” — hidden, back — visible again.
  let step=null;
  // The wizard is pinned at the bottom; aim is used only for separate contextual hints outside the wizard.
  const coach=createCoach($('work'),$('banner'));
  const path=createPath(ed);ed.path=path;
  function syncFinishHint(){
    const bn=$('banner'),button=bn.querySelector('.wizard-actions > button.primary');if(!button)return;
    // the view step: “Save view” pulses while there is something to save (ed.viewReady — below, at “Save view”)
    const ready=!bn.hidden&&step?.mode===ed.mode&&(stepReadyToFinish(ed.plan,document.body.dataset.wizard)||!!ed.viewReady?.())&&
      !ed.drag&&!ed.capture&&!ed.mode.hasUnconfirmedEdits?.();
    button.classList.toggle('ready-to-finish',!!ready);
  }
  // a wizard step (has “Exit setup”) — the path strip at the top of the card
  // o.id — a stable hint key, o.short — a short instruction; the full text is available via the help button.
  const show=(text,buttons,aim,o={})=>{
    const wizard=!!(text&&buttons?.some(x=>x.exit||x.path)),phase=wizard?path.cur():null;
    if(phase)path.enter(phase);
    // The id does not depend on the text, the counter or the language: the first edit does not restart the tutorial.
    const key=text&&ed.plan.id+'|'+(o.id||phase||text.split('<small>')[0]),bn=$('banner');
    banner(text,buttons);bn.classList.toggle('wizard-card',wizard);bn.classList.remove('short','has-path');
    document.body.dataset.wizard=phase||'';
    if(wizard){const message=bn.querySelector(':scope>span'),full=message.innerHTML,pe=path.el();
      if(pe)bn.prepend(pe);message.className='wizard-message';
      // “Exit setup” — on the right of the path row, like the close button in a header; on a narrow screen — as a cross
      const ex=bn.querySelector(':scope>button.wizard-exit');
      if(ex&&pe){const label=ex.textContent;ex.replaceChildren(el('<span></span>'),el(icon('x',14)));ex.firstChild.textContent=label;ex.title=label;ex.setAttribute('aria-label',label);pe.append(ex);}
      // the step phrase with “?” — as one block: a short one sits on one line with the buttons, a long one wraps the buttons below (D-043)
      const say=el('<div class="wizard-say"></div>');message.replaceWith(say);say.append(message);
      if(phase!=='fin'){
        message.innerHTML=o.short||full.split('<small>')[0];
        if(full.trim()!==message.innerHTML.trim()){ // “?” — only if the full text adds something
          const help=el(`<button type="button" class="wizard-help" aria-expanded="false" aria-controls="wizard-detail" title="${t('Show hint')}">${icon('help',15)}</button>`);
          help.setAttribute('aria-label',t('Show hint'));
          const detail=el('<div id="wizard-detail" class="wizard-detail" hidden></div>');detail.innerHTML=full;
          help.onclick=()=>{const open=help.getAttribute('aria-expanded')!=='true';help.setAttribute('aria-expanded',String(open));detail.hidden=!open;coach.place();ed.draw();};
          say.append(help);say.after(detail);}
      }
      const actions=el('<div class="wizard-actions"></div>');for(const b of [...bn.children])if(b.tagName==='BUTTON')actions.append(b);bn.append(actions);
    }
    syncFinishHint();
    ed.syncSave?.();if(text)coach.show(key,wizard?null:aim,{...o,fixed:wizard||o.fixed,compact:wizard||o.compact});else coach.hide();};
  // Each step has “Exit setup” (except “yes / no” questions: {exit:false}).
  // “Back” — to the previous step on the path (wizard-path.js); on the first step — correct the area, without a photo — to the start screen.
  ed.exitBtn=()=>{const b=[t('Exit setup'),()=>ed.exitWizard(),'quiet wizard-exit'];b.exit=true;return b;};
  ed.backBtn=()=>{const b=[t('Back'),()=>path.back()];b.back=true;return b;};
  ed.wizBtns=bs=>{bs=(bs||[]).filter(b=>!b.exit&&!b.back);return [...(path.canBack()?[ed.backBtn()]:[]),ed.exitBtn(),...bs];};
  ed.step=(text,buttons,aim,{exit=true,...o}={})=>{step=text?{mode:ed.mode,text,buttons:exit?ed.wizBtns(buttons):buttons||[],aim,o}:null;ed.banner();ed.applySide?.();};ed.stepNow=()=>step;
  ed.banner=(text,buttons,aim)=>text?show(text,buttons,aim):step&&step.mode===ed.mode?show(step.text,step.buttons,step.aim,step.o):show();
  coach.onCalm=()=>{};
  const motion=matchMedia('(prefers-reduced-motion: reduce)');ed.reducedMotion=()=>motion.matches;
  motion.addEventListener('change',()=>ed.draw());
  ed.view=createView($('view3d'));
  ed.v=createView2d($('plan'));
  // Screen areas for the step hint: plan points (the visible part), an element, a union of several.
  {const box=pts=>{if(!pts?.length)return null;const c=ed.v.cv.getBoundingClientRect();let l=Infinity,tp=Infinity,r=-Infinity,b=-Infinity;
      for(const p of pts){const [X,Y]=ed.v.S(p);l=Math.min(l,X);r=Math.max(r,X);tp=Math.min(tp,Y);b=Math.max(b,Y);}
      l=Math.max(l,0);tp=Math.max(tp,0);r=Math.min(r,c.width);b=Math.min(b,c.height);return r>l&&b>tp?{left:c.left+l,top:c.top+tp,right:c.left+r,bottom:c.top+b}:null;};
    const elBox=id=>{const e=$(id);if(!e||e.hidden||!e.offsetWidth||e.classList.contains('closed')||e.classList.contains('off'))return null;return e.getBoundingClientRect();};
    const join=rs=>{rs=rs.filter(Boolean);return rs.length?{left:Math.min(...rs.map(r=>r.left)),top:Math.min(...rs.map(r=>r.top)),right:Math.max(...rs.map(r=>r.right)),bottom:Math.max(...rs.map(r=>r.bottom))}:null;};
    ed.aim={pts:f=>()=>box(f()),el:id=>()=>elBox(id),join:(...fs)=>()=>join(fs.map(f=>f())),
      photo:()=>ed.underlay.ready&&ed.underlay.visible?box(ed.underlay.corners()):null,
      // As when building walls: the frame covers the outer faces, including the thickness and the corner joints.
      rooms:()=>{const {outer}=wallDefaults(ed.plan);return box(ed.plan.rooms.flatMap(r=>offsetVar(r.polygon,r.polygon.map((_,i)=>edgeThickness(r,i,outer)-WALL.inner))));}};}
  ed.history=createHistory(undefined,{capture:()=>ed.underlay?.snapshot(),restore:s=>ed.underlay.restore(s),store:idbStore});
  // Version history (versions.js, the dialog — versions-panel.js): mark — a snapshot now ('step' — a step passed, 'before' — before
  // a large edit, 'auto'); tick — after an edit, once every 10 minutes. Written with a delay, and the undo steps — before the tab closes.
  {const V=createVersions({store:idbStore}),photo=()=>ed.underlay?.snapshot()??null;
    ed.versions={list:V.list,ready:V.ready,open:V.open,
      mark:(kind,what=null,o={})=>ed.plan?.rooms?.length?V.add(ed.plan,{kind,what,photo:photo(),...o}):Promise.resolve(null),
      tick:()=>{if(V.due())ed.versions.mark('auto');}};
    ed.showVersions=()=>openVersions(ed);
    addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')ed.history.flush();});
    addEventListener('pagehide',()=>ed.history.flush());}
  ed.underlay=createUnderlay(()=>{ed.draw();ed.mode.refresh?.();});
  ed.modes={rooms:roomsMode(ed),furniture:furnitureMode(ed),lights:lightsMode(ed),devices:devicesMode(ed),sensors:sensorsMode(ed)};
  ed.mode=ed.modes.rooms;

  // Lamps “from Home Assistant”: the list comes from HA (for now — demo data), the plan stores only their place.
  // The placement is kept even for entities that are not in the HA list right now.
  const mergeLights=saved=>mergePlanLights(saved,haLights(),ha.switches?.()||[]);
  ed.setPlan=(plan,{fit=true}={})=>{
    ed.cancelDrag?.();
    ed.capture=null;ed.drag=null;ed.guides=[];ed.toolDone?.('rotate');ed.v.cv.style.cursor='';
    step=null;Object.values(ed.modes).forEach(md=>md.reset?.()); // another plan — the previous wizard step is not about it
    ed.plan=migrate(plan);ed.plan.lights=mergeLights(ed.plan.lights);ed.sel={};ed.forgetView?.();ed.syncAreas();
    ed.history.reset(ed.plan);ed.versions.open(ed.plan.id);ed.view.reframe();keys.walls=keys.lights=keys.mask='';
    $('plan-name').textContent=ed.plan.name||t('My home');$('brand-btn').title=t('{0} — file',ed.plan.name||t('My home'));
    ed.mode.refresh?.();ed.applySide?.();if(fit)ed.fit();ed.update();
  };
  ed.commit=()=>{closeOuterOpen(ed.plan);syncFurnStrips(ed.plan);ed.history.commit(ed.plan);ed.versions.tick();ed.update();ed.mode.refresh?.();coach.acted();if(step?.o?.open){step.o={...step.o,open:false};ed.banner();}};
  // restoring a version is an edit: ⌘Z brings it back. Scene settings and the dashboard layout stay current (as with undo);
  // HA lamps — reconciled with the current list, the photo position — from that version, if the photo is the same
  ed.applyPlan=(p,photo)=>{ed.cancelDrag?.();ed.capture=null;p=migrate(structuredClone(p));p.id=ed.plan.id;
    for(const k of ['scenes','panel']){if(ed.plan[k])p[k]=ed.plan[k];else delete p[k];}
    p.lights=mergeLights(p.lights);ed.plan=p;ed.sel={};ed.syncAreas();if(photo)ed.underlay.restore(photo);keys.walls=keys.lights=keys.mask='';ed.commit();};
  ed.amend=()=>{ed.history.amend(ed.plan);ed.update();};
  // undo does not close the lamp panel if the lamp is still on the plan after undo. Scene settings (“Preview” → “Customize”) and
  // the dashboard layout (“Customize panel”) are not plan edits: undo does not roll them back
  const restore=p=>{if(!p)return;const was=ed.sel.light;for(const k of ['scenes','panel']){if(ed.plan[k])p[k]=ed.plan[k];else delete p[k];}ed.history.save(p);ed.plan=p;ed.sel=was&&p.lights?.some(l=>l.id===was&&l.placed)?{light:was}:{};ed.update();ed.mode.refresh?.();};
  ed.undo=()=>{ed.cancelDrag?.();restore(ed.history.undo());};ed.redo=()=>{ed.cancelDrag?.();restore(ed.history.redo());};
  ed.setMode=id=>{
    ed.cancelDrag?.();
    if(ed.mode.id!==id&&ed.modes.lights.guardLeave?.(()=>ed.setMode(id)))return;
    if(ed.tool!=='select'&&ed.mode.id!==id)ed.setTool('select');
    ed.mode.leave?.();ed.mode=ed.modes[id];ed.sel={};ed.capture=null;ed.banner();
    document.querySelectorAll('.modes [data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode===id));
    document.body.dataset.mode=id;ed.mode.refresh?.();ed.update();ed.refreshCursor?.();
  };
  ed.select=(kind,id)=>{ed.sel={[kind]:id};if(kind==='room')ed.view.select(id);ed.mode.refresh?.();ed.draw();};

  // ---------- validation, 3D, the problems badge ----------
  const keys={walls:'',lights:'',mask:''};let pending=false,last={};
  // HA areas are the source of names: a linked room always has its name from HA (renamed there — changed here),
  // the area was deleted in HA — the room is unlinked again. Demo rooms with an area id are linked by id.
  // the HA registries have not arrived yet (ha.ready) — an empty list does not mean “the areas were deleted”: links are not touched
  ed.syncAreas=()=>{if(ha.ready&&!ha.ready())return false;const list=ha.areas();let ch=false;
    for(const r of ed.plan.rooms){if(!r.area&&list.some(a=>a.area_id===r.id)){r.area=r.id;ch=true;}if(!r.area)continue;const a=list.find(x=>x.area_id===r.area);
      if(!a){delete r.area;ch=true;}else if(r.name!==a.name){r.name=a.name;ch=true;}}
    for(const r of ed.plan.rooms)if(r.zone?.area&&!list.some(x=>x.area_id===r.zone.area)){r.zone.area=null;ch=true;}
    return ch;};
  ha.onChange(()=>{if(ed.syncAreas()){ed.history.save(ed.plan);ed.update();}ed.mode.refresh?.();ed.draw();});
  ed.areaOnPlan=a=>areaOnPlan(ed.plan,a);ed.lampWaits=L=>lampWaits(ed.plan,L); // wizard-state.js
  // lists by area (lights, devices, sensors): first the plan rooms in their order, then “No area”,
  // at the end — areas that are not on the plan
  ed.sortAreas=list=>{const at=a=>{if(!a)return 1e5;const i=ed.plan.rooms.findIndex(r=>r.area===a||r.zone?.area===a);return i>=0?i:1e6;};
    return [...list].sort((a,b)=>at(a)-at(b)||(a&&b?ed.areaName(a).localeCompare(ed.areaName(b)):0));};
  // Readings on the walls (D-033): what to write — from the sensors of the room's area, where — the free space of a visible wall.
  ed.sensorCtx=()=>({sensors:ha.sensors?.()||[],areas:ha.areas(),state:e=>ha.state?.(e)??null});
  ed.sensorSpots=()=>{const P=ed.plan;if(!P.sensors.length)return [];
    return layoutSensors(P,ed.sensorCtx(),{moving:ed.drag?.S?.id,cam:ed.view.homeCam?.(),openings:P.openings.map(o=>openingCoords(P.rooms,o)).filter(Boolean),baseOf:(r,i)=>{const w=sideWall(r,i);return wallBase(w.k,w.tint);}});};
  ha.onState?.(()=>ed.update());
  ed.update=()=>{syncRuns(ed.plan);syncFurnStrips(ed.plan);ed.syncSave?.(); // a strip on furniture moves with it, also while dragging
    ed.spots=ed.sensorSpots();
    ed.errors=validate(ed.plan.rooms);ed.conflicts=furnitureConflicts(ed.plan);
    if(ed.errors.length||!ed.plan.rooms.length){ed.walls2d=null;if(keys.walls!=='empty')keys.walls='';}
    const L=ed.plan.lights.filter(l=>!ed.lampWaits(l)),done=L.filter(l=>l.placed&&!l.draft||l.skip).length,badge=$('lights-badge');
    badge.hidden=!L.length;badge.textContent=`${done}/${L.length}`;badge.classList.toggle('done',done===L.length);
    ed.draw();ed.status();ed.applySide?.();
    if(pending)return;pending=true;
    requestAnimationFrame(()=>{pending=false;
      const plan=ed.plan;
      // the own home view from the plan (another plan, undo) — into 3D; the sensor labels are placed for it — recompute
      {const vk=JSON.stringify(plan.view||null);if(vk!==keys.view){keys.view=vk;ed.view.setHome?.(plan.view);requestAnimationFrame(()=>ed.update());}}
      // devices from HA (D-048): curtains — how far open, air conditioners — the airflow, open windows and doors glow
      const live=liveScene(plan,ha);
      ed.view.setFurniture(plan.furniture.map(f=>isRun(f)?{...f,geo:runGeo(plan,f)}:live.open.has(f.id)?{...f,open:live.open.get(f.id)}:f));ed.view.setSensors(ed.spots);
      ed.view.setClimate?.(live.climate);ed.view.setContacts?.(live.contacts);
      const placed=plan.lights.filter(l=>l.placed),lk=JSON.stringify([placed,plan.rooms]);
      if(lk!==keys.lights){keys.lights=lk;ed.view.setLights(placed,plan.rooms);}
      if(!plan.rooms.length){if(keys.walls!=='empty'){keys.walls='empty';ed.view.set(null);last={};}}
      else if(!ed.errors.length){
        const wk=JSON.stringify([plan.rooms,plan.openings,plan.wall]);
        if(wk!==keys.walls){keys.walls=wk;const t0=performance.now();
          try{const ops=plan.openings.map(o=>openingCoords(plan.rooms,o));ed.hidden=ops.filter(o=>!o).length;
            const g=buildPlan2d(plan.rooms,ops.filter(Boolean),{outer:wallDefaults(plan).outer});ed.view.set(g,plan.rooms,ops.filter(Boolean),ed.sel.room);keys.mask='';
            ed.walls2d=wallsAt(g);ed.draw();
            last={ms:performance.now()-t0,fail:null};if(ed.debug)console.log('3D',last.ms.toFixed(0),'ms');}
          catch(err){last={fail:String(err.message||err).slice(0,80)};}}
      }
      // The “light does not leave the room” mask rebuilds the shaders — set it when the mouse is released.
      if(!ed.drag&&keys.mask!==lk){keys.mask=lk;ed.view.applyMask(plan.rooms.filter(r=>!r.solid));}
      ed.status();
    });
  };
  // The badge at the bottom of the plan — only when there is something to say. A click selects the culprit.
  ed.status=()=>{
    const pill=$('pill');let text='',warn=false,go=null;
    if(ed.errors.length){const e=ed.errors[0],nm=roomById(ed.plan,e.room)?.name,more=ed.errors.length-1;text=more?t('“{0}” {1} · {2} more — 3D on hold',nm,e.text,more):t('“{0}” {1} — 3D on hold',nm,e.text);
      go=()=>{if(ed.mode.id!=='rooms')ed.setMode('rooms');ed.select('room',e.room);};}
    else if(last.fail){text=t('Walls failed to build — 3D shows the previous plan');}
    else if(ed.mode.id==='furniture'&&ed.conflicts.size){const [id,why]=[...ed.conflicts][0],nm=byId(ed.plan.furniture.find(f=>f.id===id)?.model)?.name,more=ed.conflicts.size-1;warn=true;
      text=more?t('“{0}” {1} · {2} more',nm,why,more):t('“{0}” {1}',nm,why);go=()=>ed.select('furn',id);}
    else if(ed.mode.id==='rooms'&&ed.hidden){warn=true;text=t('Openings that don\'t fit the wall: {0}',ed.hidden);}
    pill.hidden=!text;pill.textContent=text;pill.classList.toggle('warn',warn);pill.onclick=go;
  };
  // The panel above the selection: the mode provides the content (refresh) and the selection frame in meters (anchor).
  // On the right of the first row — a handle: the panel can be moved aside if it covers something needed. The offset holds while the same thing is selected
  // (and moves with it); something else selected — the panel is back in its place. A double click on the handle resets it.
  let ctxOff=null;
  // what the panel is about: another object — the panel is at it again. A mode can say broader (ctxPin): in the “Lights” step — the room, and
  // a dragged panel stays in place while the lamps of this room are gone through
  const ctxKey=()=>{const pin=ed.mode.ctxPin?.();if(pin)return ed.mode.id+'|'+pin;const {part,vertex,...s}=ed.sel;return ed.mode.id+'|'+JSON.stringify(s)+'|'+(ed.mode.ctxKey?.()??'');};
  // The panel moving to another object (hovered another room, selected something else) — smooth; panning and zooming — follows without delay.
  let ctxLast=null,ctxGlideT=0;
  const putCtx=(x,y,below)=>{const c=$('ctx'),k=ctxKey();
    if(ctxLast&&(ctxLast.k!==k||Math.hypot(x-ctxLast.x,y-ctxLast.y)>120)){c.classList.add('glide');clearTimeout(ctxGlideT);ctxGlideT=setTimeout(()=>c.classList.remove('glide'),650);}
    ctxLast={k,x,y};c.classList.toggle('below',below);c.style.left=x+'px';c.style.top=y+'px';};
  let ctxDetailsKey=null;
  ed.showCtx=nodes=>{const c=$('ctx'),k=ctxKey()+'|'+path.cur(),opened=k===ctxDetailsKey?[...c.querySelectorAll('details')].map(d=>d.open):[];ctxDetailsKey=k;
    c.innerHTML='';if(!nodes){c.hidden=true;ctxLast=null;return;}c.append(...nodes);
    const first=c.querySelector('.line');if(first){const g=el(`<button class="ib grip" title="${t('Drag panel · double-click to reset')}">${icon('grip',15)}</button>`);first.append(g);gripDrag(g);}
    c.querySelectorAll('details').forEach((d,i)=>{d.open=!!opened[i];d.addEventListener('toggle',()=>placeCtx());});
    c.hidden=false;placeCtx();};
  // dragged by the handle — the panel stays there on screen (the top-left in canvas coordinates): zooming and panning the plan do not move it
  // (the owner); a double click on the handle — back at the object
  function gripDrag(g){
    g.onpointerdown=e=>{e.preventDefault();e.stopPropagation();g.setPointerCapture(e.pointerId);const c=$('ctx'),r=c.getBoundingClientRect(),cr=ed.v.cv.getBoundingClientRect();
      const o={key:ctxKey(),l:r.left-cr.left,t:r.top-cr.top},x0=e.clientX,y0=e.clientY,l0=o.l,t0=o.t;ctxOff=o;
      g.onpointermove=ev=>{o.l=l0+ev.clientX-x0;o.t=t0+ev.clientY-y0;placeCtx();};g.onpointerup=g.onpointercancel=g.onlostpointercapture=()=>{g.onpointermove=g.onpointerup=g.onpointercancel=g.onlostpointercapture=null;};};
    g.ondblclick=()=>{ctxOff=null;placeCtx();};}
  function placeCtx(){
    const c=$('ctx');if(c.hidden)return;const box=ed.mode.anchor?.();if(!box){c.hidden=true;ctxLast=null;return;}
    if(innerWidth<=640){const cr=ed.v.cv.getBoundingClientRect(),bn=$('banner'),bottom=bn.hidden?$('dock').getBoundingClientRect().top:bn.getBoundingClientRect().top;
      c.style.maxHeight=Math.max(120,bottom-cr.top-118)+'px';putCtx(ed.v.w/2,Math.max(112,bottom-cr.top-c.offsetHeight-10),true);return;}
    c.style.maxHeight='';
    const [x0,y0,x1,y1]=box,[X0,top]=ed.v.S([x0,y1]),[X1,bottom]=ed.v.S([x1,y0]),X=(X0+X1)/2;
    // Above the object; does not fit under the top panels — below it; does not fit there either (the bottom bar, the step banner) — beside it
    // (to the right, otherwise to the left; not over the 3D window); no room beside it either — at the top edge, over the object.
    // Only panels that are horizontally under the panel get in the way.
    // an open left panel (not pinned) lies over the plan — the panel above an object does not go under it
    const cr=ed.v.cv.getBoundingClientRect(),w=c.offsetWidth,h=c.offsetHeight,sr=floatingOpen()?side.getBoundingClientRect().right-cr.left+8:6;
    // a collapsed left panel — the header under the logo: also at the top
    const bounds=x=>{const across=id=>{const e=$(id),r=e.getBoundingClientRect();return !e.hidden&&r.width&&r.right-cr.left>x-w/2&&r.left-cr.left<x+w/2?r:null;};
      return [Math.max(4,...['topr','modes','brand',...(side.classList.contains('closed')?['side']:[])].map(across).filter(Boolean).map(r=>r.bottom-cr.top+6)),
        Math.min(ed.v.h-6,...['dock',...(coach.bottom()?['banner']:[])].map(across).filter(Boolean).map(r=>r.top-cr.top-6))];};
    let x=Math.max(sr+w/2,Math.min(ed.v.w-w/2-6,X));const [minTop,maxBot]=bounds(x);
    if(ctxOff&&ctxOff.key!==ctxKey())ctxOff=null;
    // The panel is always right against its object — beside it, below or above it, sharing a border (the owner: otherwise it looks like
    // the panel of a neighbouring room). Of those places — the one where it is least in the way: not on other rooms and not on the 3D window;
    // at an outer wall — right behind it, outside the plan. In the way everywhere — it lies on the neighbouring rooms where it covers the least.
    // Beside is slightly better than below and above. It never covers the step hint, the top panels or the bottom bar.
    // It does not fit right against it anywhere (the object is almost full screen) — as before.
    if(!ctxOff&&ed.plan.rooms.length){const rp=ed.plan.rooms.map(r=>r.polygon.map(q=>ed.v.S(q))),ps=rp.flat(),
        L=Math.min(...ps.map(q=>q[0])),R=Math.max(...ps.map(q=>q[0])),T=Math.min(...ps.map(q=>q[1])),B=Math.max(...ps.map(q=>q[1])),e=.35*ed.v.sc;
      const rbox=r=>[r.left-cr.left-6,r.top-cr.top-6,r.right-cr.left+6,r.bottom-cr.top+6],bn=$('banner'),pill=$('pill'),
        pip=ed.role('3d')==='win'?rbox($('pane-3d').getBoundingClientRect()):null,
        hard=[!bn.hidden&&bn.getBoundingClientRect(),!pill.hidden&&pill.getBoundingClientRect()].filter(Boolean).map(rbox),obs=[pip,...hard].filter(Boolean);
      const ov=(a,b)=>Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
      const inPoly=(x,y,P)=>{let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const [xi,yi]=P[i],[xj,yj]=P[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;};
      // what it covers: the share on rooms and the share on walls (inside the plan, but not in a room) — on a grid of points
      const cover=r=>{let rm=0,wl=0;const N=16,M=6;for(let i=0;i<N;i++)for(let j=0;j<M;j++){const x=r[0]+(i+.5)*(r[2]-r[0])/N,y=r[1]+(j+.5)*(r[3]-r[1])/M;
        if(rp.some(P=>inPoly(x,y,P)))rm++;else if(x>L-e&&x<R+e&&y>T-e&&y<B+e)wl++;}return [rm/(N*M),wl/(N*M)];};
      const oh=bottom-top,ow=X1-X0,ocy=(top+bottom)/2,W=ed.v.w-6,cand=[];
      // the gap: right against it (12 px) or, if only a wall is left to the plan edge, — right behind it
      const gaps=d=>d>=0&&d<.6*ed.v.sc?[12,Math.max(12,d+e+14)]:[12];
      const along=(a,z,want,edges)=>{if(a>z)return [];const v=[want,a,z,...edges];for(let k=1;k<8;k++)v.push(a+(z-a)*k/8);return v.map(t=>Math.max(a,Math.min(z,t)));};
      for(const right of [true,false])for(const g of gaps(right?R-X1:X0-L)){const cx=right?X1+g+w/2:X0-g-w/2,[mt,mb]=bounds(cx),n=.5*Math.min(h,oh),a=cx-w/2,z=cx+w/2;
        for(const ty of along(Math.max(mt,top-h+n),Math.min(mb-h,bottom-n),ocy-h/2,obs.filter(o=>o[0]<z&&a<o[2]).flatMap(o=>[o[1]-h,o[3]])))cand.push({cx,ty,g,beside:true});}
      for(const down of [true,false])for(const g of gaps(down?B-bottom:top-T)){const ty=down?bottom+g:top-g-h,n=.5*Math.min(w,ow);
        for(const l of along(Math.max(sr,X0-w+n),Math.min(W-w,X1-n),X-w/2,obs.filter(o=>o[1]<ty+h&&ty<o[3]).flatMap(o=>[o[0]-w,o[2]]))){const cx=l+w/2,[mt,mb]=bounds(cx);
          if(ty>=mt&&ty+h<=mb)cand.push({cx,ty,g,beside:false});}}
      const ok=cand.filter(c=>{const r=[c.cx-w/2,c.ty,c.cx+w/2,c.ty+h];return r[0]>=sr&&r[2]<=W&&!hard.some(o=>ov(r,o)>0);});
      const cost=c=>{const r=[c.cx-w/2,c.ty,c.cx+w/2,c.ty+h],[rm,wl]=cover(r),p=pip?ov(r,pip)/(w*h):0;
        return 1000*(rm+p)+300*wl+.5*c.g+.1*(c.beside?Math.abs(c.ty+h/2-ocy):Math.abs(c.cx-X))+(c.beside?0:15);};
      if(ok.length){let best=null,bc=Infinity;for(const c of ok){const v=cost(c);if(v<bc){bc=v;best=c;}}putCtx(best.cx,best.ty,true);return;}}
    const up=top-12-h>=minTop,down=bottom+12+h<=maxBot;
    let below=!up&&(down||maxBot-bottom>top-minTop),y=below?bottom+12:top-12;
    if(!up&&!down){
      const pip=ed.role('3d')==='win'?$('pane-3d').getBoundingClientRect():null,beside=cx=>{const [mt,mb]=bounds(cx),ty=Math.max(mt,Math.min(mb-h,top));
        const L=cx-w/2+cr.left,R=cx+w/2+cr.left,ok=cx-w/2>=sr&&cx+w/2<=ed.v.w-6&&ty+h<=mb&&(!pip||R<=pip.left||L>=pip.right||ty+h+cr.top<=pip.top||ty+cr.top>=pip.bottom);
        return ok?ty:null;};
      const at=[X1+12+w/2,X0-12-w/2].map(cx=>[cx,beside(cx)]).find(([,ty])=>ty!=null);
      below=true;if(at){x=at[0];y=at[1];}
      else{ // does not fit fully anywhere — where it covers the object the least (the 3D window may be covered, but less)
        const ov=(a,b)=>Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1])),obj=[X0,top,X1,bottom],
          pr=pip&&[pip.left-cr.left,pip.top-cr.top,pip.right-cr.left,pip.bottom-cr.top],cl=cx=>Math.max(sr+w/2,Math.min(ed.v.w-w/2-6,cx));
        const cand=[[cl(X1+12+w/2),top],[cl(X0-12-w/2),top],[x,minTop],[x,maxBot-h]].map(([cx,ty])=>{const [mt,mb]=bounds(cx);ty=Math.max(mt,Math.min(mb-h,ty));
          const r=[cx-w/2,ty,cx+w/2,ty+h];return {cx,ty,cost:3*ov(r,obj)+(pr?ov(r,pr):0)};});
        const b=cand.reduce((a,c)=>c.cost<a.cost?c:a);x=b.cx;y=b.ty;}}
    // moved aside by the handle — an offset over the default place, within the plan
    if(ctxOff&&ctxOff.key!==ctxKey())ctxOff=null;
    if(ctxOff){below=true;y=Math.max(4,Math.min(ed.v.h-h-4,ctxOff.t));x=Math.max(4,Math.min(ed.v.w-w-4,ctxOff.l))+w/2;}
    putCtx(x,y,below);
  }
  const zoomEl=$('zoom');
  ed.draw=()=>{drawPlan(ed);ed.mode.draw?.();ed.capture?.draw?.();drawGuides(ed);ed.knob?.draw();placeCtx();syncFinishHint();
    const z=Math.round(ed.v.sc/(ed.v.fitSc||ed.v.sc)*100)+'%';if(zoomEl.textContent!==z)zoomEl.textContent=z;};

  // ---------- screen layout (D-017) ----------
  // The main view is full screen; the second one — a small window in the corner (win), side by side (dock) or collapsed (off). The left panel floats over the main one.
  let savedUI;try{savedUI=JSON.parse(localStorage.getItem(UI)||'{}');}catch{}
  const ui=Object.assign({main:'plan',pip:'win',pipW:Math.round(Math.min(360,Math.max(240,innerWidth*.26))),pipH:0,view:40,sideBy:{}},savedUI);
  if(!['plan','3d'].includes(ui.main))ui.main='plan';if(!['win','dock','off'].includes(ui.pip))ui.pip='win';ui.sideBy||={};
  const saveUI=()=>{try{localStorage.setItem(UI,JSON.stringify(ui));}catch{}};
  const work=$('work'),side=$('side'),panes={plan:$('pane-plan'),'3d':$('pane-3d')},root=document.documentElement.style;
  // “Side by side” — only on a wide screen; on a narrow one the second view stays a small window.
  // “Preview” (D-047, look.js): 3D full screen, the home panel on the right; no plan and no small window, the ui layout does not change
  let look=false;const lookUI=createLook(ed,work);
  const pipMode=()=>look?'off':ui.pip==='dock'&&(work.clientWidth||innerWidth)<1100?'win':ui.pip;
  ed.role=id=>look?(id==='3d'?'main':'off'):id===ui.main?'main':pipMode();
  const big=r=>r==='main'||r==='dock';
  let pw=0,ph=0,planRole=null,planSaved=null,roleFit=null;
  function layout(){
    const W=work.clientWidth||innerWidth,H=work.clientHeight||innerHeight;
    pw=Math.round(Math.max(200,Math.min(W*.45,ui.pipW)));ph=Math.round(Math.max(140,Math.min(H*.6,ui.pipH||pw*.66)));
    for(const [id,p] of Object.entries(panes)){const r=ed.role(id);
      p.className=`pane ${id==='plan'?'plan-pane':'view-pane'} ${r==='win'?'pip':r}${id==='3d'&&pipGrow?' grow':''}`;
      const d=p.querySelector('[data-c=dock]');if(d){d.innerHTML=icon(r==='dock'?'window':'columns',15);d.title=r==='dock'?t('Small window in the corner'):t('Side by side, half screen');}}
    const pm=pipMode();work.classList.toggle('docked',pm==='dock');work.classList.toggle('narrow',W<1100);document.body.dataset.main=ui.main;
    root.setProperty('--view',ui.view+'%');root.setProperty('--pip-w',pw+'px');root.setProperty('--pip-h',ph+'px');
    const show=$('pip-show');show.hidden=pm!=='off';show.innerHTML=ui.main==='plan'?icon('window')+'3D':icon('plan')+t('Plan');show.title=t('Show as a small window');
    // The plan goes into the small window — fit it whole; it comes back — the same zoom and center as before.
    const pr=ed.role('plan');
    if(planRole&&pr!==planRole){
      if(big(planRole)&&!big(pr)&&ed.v.w)planSaved=ed.v.fitted?null:{sc:ed.v.sc,c:ed.v.W([ed.v.w/2,ed.v.h/2])};
      if(pr==='win')roleFit=()=>ed.fit();
      else if(big(pr)&&!big(planRole))roleFit=()=>{if(!planSaved)return ed.fit();const v=ed.v;v.fitted=false;v.sc=planSaved.sc;v.ox=v.w/2-planSaved.c[0]*v.sc;v.oy=v.h/2+planSaved.c[1]*v.sc;};
    }
    planRole=pr;insets3d();placeFloats();syncPipHint();ed.syncSave?.();
  }
  // The “Lights” step: the 3D window is small (narrower than 440 px) — it smoothly grows by 20% right away (once per project), and the corner by which
  // it is resized pulses for the first 2.4 seconds or until it is pressed — also once per project (ed.hints: pipGrow:<id>,
  // pipGrip:<id>). Once started, the pulse runs to the end, even if the window is already wider than 440 px.
  // pipGrow — the window is growing now: the grow class (styles.css) smoothly changes the size and sends an accent ring around it three times.
  let pipAsk=false,pipTimer=0,pipOn=false,pipGrow=false;const PIP_HINT=()=>'pipGrip:'+ed.plan.id,PIP_GROW=()=>'pipGrow:'+ed.plan.id;
  ed.pipHint=on=>{pipAsk=on;syncPipHint();};
  function syncPipHint(){
    const can=pipAsk&&ed.role('3d')==='win'&&!!ed.hints&&ed.hints.count(PIP_HINT())<1;
    if(can&&!pipOn&&pw<440){pipOn=true;pipTimer=setTimeout(()=>{pipTimer=0;ed.hints.done(PIP_HINT(),1);syncPipHint();},2400);
      if(ed.hints.count(PIP_GROW())<1){ed.hints.done(PIP_GROW(),1);growPip(1.2);}}
    if(pipOn&&!can){pipOn=false;clearTimeout(pipTimer);pipTimer=0;}
    panes['3d'].querySelector('.pip-grip').classList.toggle('pulse',pipOn);}
  let growTimer=0;
  function growPip(k){pipGrow=true;layout(); // first the class with the transition, then the new size — then it moves smoothly
    requestAnimationFrame(()=>{if(!pipGrow)return;ui.pipW=Math.round(pw*k);ui.pipH=Math.round(ph*k);layout();ui.pipW=pw;ui.pipH=ph;saveUI();});
    growTimer=setTimeout(endGrow,2400);}
  // the corner was grabbed — the growth and the ring end at once: with a transition the window would lag behind the mouse
  function endGrow(){clearTimeout(growTimer);growTimer=0;if(!pipGrow)return;pipGrow=false;layout();}
  ed.forgetView=()=>{planSaved=null;};
  ed.setMain=id=>{if(ui.main===id)return;ui.main=id;saveUI();layout();};
  ed.swap=()=>ed.setMain(ui.main==='plan'?'3d':'plan');
  const setPip=p=>{ui.pip=p;saveUI();layout();};
  $('pip-show').onclick=()=>setPip('win');
  for(const p of Object.values(panes)){
    const c=el(`<span class="pane-ctl"><button class="ib" data-c="swap" title="${t('Swap (Tab)')}">${icon('swap',15)}</button><button class="ib" data-c="dock"></button><button class="ib" data-c="hide" title="${t('Hide')}">${icon('hide',15)}</button></span>`);
    p.querySelector('.view-tools').appendChild(c);
    c.querySelector('[data-c=swap]').onclick=e=>{e.stopPropagation();ed.swap();};
    c.querySelector('[data-c=dock]').onclick=e=>{e.stopPropagation();setPip(pipMode()==='dock'?'win':'dock');};
    c.querySelector('[data-c=hide]').onclick=e=>{e.stopPropagation();setPip('off');};
    // The window size — by the top-left corner.
    const g=p.querySelector('.pip-grip');
    g.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();g.setPointerCapture(e.pointerId);endGrow();if(ed.hints&&g.classList.contains('pulse')){ed.hints.done(PIP_HINT(),1);syncPipHint();}const s={x:e.clientX,y:e.clientY,w:pw,h:ph};
      const mv=ev=>{ui.pipW=s.w-(ev.clientX-s.x);ui.pipH=s.h-(ev.clientY-s.y);layout();},up=()=>{g.removeEventListener('pointermove',mv);for(const type of ['pointerup','pointercancel','lostpointercapture'])g.removeEventListener(type,up);ui.pipW=pw;ui.pipH=ph;saveUI();};
      g.addEventListener('pointermove',mv);for(const type of ['pointerup','pointercancel','lostpointercapture'])g.addEventListener(type,up);});
  }
  // A click on the small window swaps the views: on the plan — always, on 3D — if it was not rotated.
  panes.plan.querySelector('.pip-cover').onclick=()=>ed.swap();
  {let d=null;const p=panes['3d'];
    p.addEventListener('pointerdown',e=>{d=ed.role('3d')==='win'&&!e.target.closest('button,.pip-grip')?{x:e.clientX,y:e.clientY,t:performance.now()}:null;},true);
    p.addEventListener('pointerup',e=>{if(d&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<5&&performance.now()-d.t<400)ed.swap();d=null;},true);}
  const div=$('divider');
  const setView=pct=>{ui.view=Math.round(Math.max(20,Math.min(75,pct)));saveUI();layout();};
  div.addEventListener('pointerdown',e=>{div.setPointerCapture(e.pointerId);div.classList.add('drag');
    const r=work.getBoundingClientRect(),mv=ev=>setView((r.right-ev.clientX)/r.width*100),up=()=>{div.classList.remove('drag');div.removeEventListener('pointermove',mv);for(const type of ['pointerup','pointercancel','lostpointercapture'])div.removeEventListener(type,up);};
    div.addEventListener('pointermove',mv);for(const type of ['pointerup','pointercancel','lostpointercapture'])div.addEventListener(type,up);});
  div.ondblclick=()=>setView(50);
  addEventListener('resize',layout);

  // Floating panels centered in the free part of the screen: the modes and the bottom bar — between the edges of the main view,
  // badges — to the right of the open left panel; all — without running onto the 3D window, the title and the buttons on the right.
  function placeFloats(){
    const W=work.clientWidth,R=look?lookUI.width()+12:pipMode()==='dock'?W*ui.view/100+5:0,open=!look&&!side.classList.contains('closed');
    const pinL=ui.pinned&&open?side.offsetWidth:0,floatL=open?side.offsetLeft+side.offsetWidth+12:12;
    const brandR=$('brand').offsetLeft+$('brand').offsetWidth+8,toprL=W-$('topr').offsetWidth-20,pipL=pipMode()==='win'?W-12-pw-10:W;
    const put=(e,a,b,lo,hi,mid)=>{if(e.hidden)return;const w=e.offsetWidth;let c=(a+b)/2;c=Math.max(lo+w/2,Math.min(hi-w/2,c));e.style.left=(mid?c:c-w/2)+'px';};
    // the modes do not fit (a tablet next to the “Preview” panel, a phone) — icons, a label only for the selected one; the name — in the tooltip
    const M=$('modes');M.classList.remove('compact');if(M.scrollWidth>(innerWidth<=760?W-24:Math.min(W-R,toprL)-brandR)-8)M.classList.add('compact');
    put(M,pinL,W-R,brandR,toprL);
    put($('dock'),pinL,W-R,pinL+12,Math.min(W-R-12,pipL));
    put($('pill'),pinL,W-R,floatL,Math.min(W-R-12,pipL),true);
    // the step hint — at its area (coach.js), no area — at the bottom above the toolbar (at the top it covered the wall
    // menu); the problems badge — above the hint, if it is at the bottom
    coach.env??={home:(w,h)=>{const W=work.clientWidth,R=pipMode()==='dock'?W*ui.view/100+5:0,open=!side.classList.contains('closed'),
        pinL=ui.pinned&&open?side.offsetWidth:0,floatL=open?side.offsetLeft+side.offsetWidth+12:12,pipL=pipMode()==='win'?W-12-pw-10:W;
        const right=Math.min(W-R-12,pipL),left=right-floatL>=w?floatL:12,edge=right-left>=w?right:W-R-12;
        const c=Math.max(left+w/2,Math.min(edge-w/2,(left+edge)/2));return {x:Math.round(c-w/2),y:Math.max(110,$('dock').offsetTop-8-h)};},
      free:()=>{const W=work.clientWidth,R=pipMode()==='dock'?W*ui.view/100+5:0;
        return {l:12,r:W-R-12,t:Math.max(...['modes','brand','topr'].map(id=>$(id).offsetTop+$(id).offsetHeight))+10,b:$('dock').offsetTop-8};},
      avoid:()=>[...['side','ctx','pill','dock'].map(id=>{const e=$(id);return e.hidden||e.classList.contains('closed')&&id!=='side'?null:e.getBoundingClientRect();}),
        pipMode()==='win'&&ui.main!=='3d'?panes['3d'].getBoundingClientRect():pipMode()==='win'?panes.plan.getBoundingClientRect():null,document.querySelector('.dev')?.getBoundingClientRect()]};
    coach.place();placeCtx();
    const bn=$('banner');$('pill').style.bottom=(70+(bn.hidden||!coach.bottom()?0:bn.offsetHeight+8))+'px';
  }
  {let q=false;const ro=new ResizeObserver(()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;placeFloats();});});
    for(const id of ['work','dock','modes','banner','pill','side','topr','brand'])ro.observe($(id));}

  // Theme: light or dark; “Match system” — by the system setting (in HA later — by the HA theme). The plan drawing takes its colors from the theme.
  const mq=matchMedia('(prefers-color-scheme: dark)');
  // “Match system”: in the HA panel — whether the HA theme is dark (ha-panel.js: HOME_TWIN_DARK), otherwise — the system's
  ed.themeName=()=>ui.theme==='dark'||((ui.theme||'auto')==='auto'&&(globalThis.HOME_TWIN_DARK??mq.matches))?'dark':'light';
  ed.applyTheme=()=>{const t=ed.themeName();document.documentElement.dataset.theme=t;readPalette();ed.view.setTheme(t==='dark');if(look)lookUI.refresh();
    document.querySelectorAll('#theme-seg [data-th]').forEach(b=>b.classList.toggle('on',b.dataset.th===(ui.theme||'auto')));ed.draw();};
  ed.setTheme=t=>{ui.theme=t;saveUI();ed.applyTheme();};
  // Language (D-036): the list is in each language's own name; changed — save and reload: the strings are assembled at load time
  {const sel=$('lang');for(const [id,name] of LANGS)sel.appendChild(el(`<option value="${id}">${name}</option>`));sel.value=getLang();
    sel.onchange=()=>{ui.lang=sel.value;saveUI();location.reload();};}
  mq.addEventListener('change',()=>{if((ui.theme||'auto')==='auto')ed.applyTheme();});
  document.querySelectorAll('#theme-seg [data-th]').forEach(b=>b.onclick=()=>ed.setTheme(b.dataset.th));
  ed.applyTheme();

  // The left panel: each mode has its own “open / collapsed”. Until the user chooses — by meaning:
  // in “Plan” collapsed (the rooms are on the canvas anyway), in “Furniture” open (the catalog), in “Lights” — while there are lamps without a place.
  // in the “Lights” wizard step the list is collapsed: the wizard itself leads through the lamps, and an open list would cover the question
  const sideAuto={rooms:()=>false,furniture:()=>path.cur()!=='fin',sensors:()=>path.cur()!=='fin',devices:()=>path.cur()!=='fin',lights:()=>path.cur()!=='fin'&&!ed.modes.lights.wizardOn?.()&&ed.plan.lights.some(l=>!l.placed&&!l.skip)};
  // in the “Outline” and “Rooms” wizard steps the list is collapsed: everything is done on the plan, an open list would cover it (the owner).
  // Opened by the user — open until the end of the step; after the wizard — as chosen for the mode
  let wizSide=null;const wizStep=()=>{const k=ed.mode.id==='rooms'&&ed.path?.cur();return k==='rect'||k==='split'?k:null;};
  ed.sideOpen=()=>{const k=wizStep();if(wizSide?.k!==k)wizSide=null;if(k)return !!wizSide?.open;return ui.sideBy[ed.mode.id]??sideAuto[ed.mode.id]?.()??true;};
  // The panel lies on top and does not move the view: the plan and 3D are moved only by the user.
  // The part free of the panel is taken into account by “Whole plan” (⤢, Home) and “starting view” (⟲).
  // Pinned (📌) — a column on the left: the main view starts after it, nothing is covered. Collapsed — always a header on top.
  let sideState='';
  ed.applySide=()=>{const open=ed.sideOpen(),st=open+'|'+!!ui.pinned;if(st===sideState)return;sideState=st;
    $('side-chev').innerHTML=icon(open?'up':'down',15);
    side.classList.toggle('closed',!open);work.classList.toggle('side-open',open);work.classList.toggle('pinned',!!ui.pinned);
    const pin=$('side-pin');pin.classList.toggle('on',!!ui.pinned);pin.title=ui.pinned?t('Unpin: panel over the plan'):t('Pin left: plan next to the panel');
    placeFloats();};
  $('side-pin').onclick=e=>{e.stopPropagation();ui.pinned=!ui.pinned;saveUI();ed.applySide();insets3d();};
  ed.toggleSide=()=>{const k=wizStep();if(k)wizSide={k,open:!ed.sideOpen()};else{ui.sideBy[ed.mode.id]=!ed.sideOpen();saveUI();}ed.applySide();};
  ed.sideHead=(t,c='')=>{side.querySelector('.t').textContent=t;side.querySelector('.c').textContent=c;};
  $('side-head').onclick=$('side-chev').onclick=()=>ed.toggleSide();
  const floatingOpen=()=>!ui.pinned&&!side.classList.contains('closed');
  function insets3d(){if(look){const i=lookUI.insets();ed.view.setInsets(0,i.right,i.bottom);return;}ed.view.setInsets(ui.main==='3d'&&floatingOpen()?side.offsetWidth+24:0,0);}
  // The whole plan (or only points — “zoom to the room”) — into the part of the screen not covered by panels.
  // o.card — fit taking the step hint into account: there is no room for it beside the area — leave room at the bottom; o.pad — margins
  ed.fit=(points,o={})=>{
    const only=Array.isArray(points)&&points.length,pts=[...(only?points:ed.plan.rooms.flatMap(r=>r.polygon))];
    // a margin for the outer walls (they are outside the room outlines)
    if(pts.length){const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),e=.35;pts.push([Math.min(...xs)-e,Math.min(...ys)-e],[Math.max(...xs)+e,Math.max(...ys)+e]);}
    if(!pts.length&&ed.underlay.ready){const {width:w,height:h}=ed.underlay.img;pts.push(...[[0,0],[w,0],[w,h],[0,h]].map(ed.underlay.toWorld));}
    const r=ed.role('plan');
    if(!big(r)){ed.v.fit(pts,12);ed.v.fitted=true;ed.draw();return;}
    // Fit into what is not covered by the left panel and the 3D window (the window is avoided on the right or at the bottom — wherever the plan comes out larger).
    let ins={l:innerWidth>760&&r==='main'&&floatingOpen()?side.offsetWidth+24:0};
    // at the top — the title and the modes, at the bottom — the bottom bar
    ins.t=innerWidth<=760?176:60;ins.b=innerWidth<=760?110:64;
    if(r==='main'&&pipMode()==='win'){const A={...ins,r:pw+24},B={...ins,b:ph+24};ins=ed.v.fit(pts,24,A)>=ed.v.fit(pts,24,B)?A:B;}
    const pad=o.pad??(only?60:24);ed.v.fit(pts,pad,ins);
    // the hint landed beside it — good; at the bottom and covering the area — fit above it
    // the card's place — where it was put (style.top), not where it is now: it may still be moving
    if((o.card||innerWidth<=760)&&!$('banner').hidden){coach.place();const bn=$('banner'),wt=work.getBoundingClientRect().top,btop=wt+parseFloat(bn.style.top||'0'),cr=ed.v.cv.getBoundingClientRect(),
        low=Math.max(...pts.map(p=>ed.v.S(p)[1]))+cr.top;
      if(bn.dataset.side==='bottom'&&low>btop-8){ins={...ins,b:Math.max(ins.b,cr.bottom-btop+12)};ed.v.fit(pts,pad,ins);coach.place();}}
    ed.v.fitted=!only;if(!only)ed.v.fitSc=ed.v.sc;ed.draw();
  };
  layout();

  // ---------- mouse ----------
  // Pan the plan: “hand” (H), Space + mouse, the middle or right button, an empty spot; trackpad — two fingers.
  // Zoom: the mouse wheel or a pinch. The whole plan — Home or Shift+1. As in Figma and Photoshop.
  const cv=ed.v.cv;cv.tabIndex=-1;let pan=null,space=false,press=null,lastPointer=null;ed.hand=false;
  const P=e=>ed.v.W([e.offsetX,e.offsetY]);
  const gesture=createDragGesture(cursor=>{
    document.documentElement.classList.toggle('plan-drag',!!cursor);
    if(cursor){root.setProperty('--drag-cursor',cursor);cv.style.cursor=cursor;}
    else root.removeProperty('--drag-cursor');
  });
  const handCursor=()=>{if(!ed.drag)cv.style.cursor=pan?'grabbing':(ed.hand||space)?'grab':'';};
  const refreshCursor=()=>{
    if(ed.hand||space||pan){handCursor();return;}
    cv.style.cursor='';
    if(lastPointer){const e={...lastPointer,buttons:0};if(ed.capture)ed.capture.move?.(P(e),e);else ed.mode.move?.(e,P(e));}
  };
  ed.refreshCursor=refreshCursor;
  const release=()=>{const id=press?.id;press=null;gesture.end();if(id!=null&&cv.hasPointerCapture(id))cv.releasePointerCapture(id);};
  ed.cancelDrag=()=>{
    if(!press)return false;
    const before=press.before,changed=ed.drag?.moved;
    ed.mode.cancelDrag?.();
    if(changed&&before)ed.plan=before;
    if(pan){ed.v.ox=pan.ox;ed.v.oy=pan.oy;ed.v.fitted=pan.fitted;pan=null;}
    ed.drag=null;ed.guides=[];release();
    if(changed)ed.update();ed.mode.refresh?.();ed.draw();refreshCursor();return true;
  };
  // Exactly one tool (a state machine): select | rect | poly (only “Plan”) | hand | rotate.
  // Turning on another one turns off the previous one; a repeated click on the active one, V or Esc — back to select.
  // Plan rotation is modal (ed.capture), when it ends by itself — ed.toolDone. Space — a temporary hand, does not change the tool.
  const ROOM_TOOLS=['rect','poly','split'];ed.tool='select';
  const syncTools=()=>document.querySelectorAll('#dock [data-tool]').forEach(b=>b.classList.toggle('on',b.dataset.tool===ed.tool));
  ed.syncTools=syncTools;
  // setTool — just turn on; toggleTool — for the bar buttons and H: pressing the active one again returns to select
  ed.toggleTool=t=>ed.setTool(t===ed.tool&&t!=='select'?'select':t);
  ed.setTool=t=>{
    ed.cancelDrag?.();
    if(ROOM_TOOLS.includes(t)&&ed.mode.id!=='rooms')t='select';
    // nothing to split yet — the apartment outline first
    if(t==='split'&&!ed.plan.rooms.length){t='rect';if(!ed.stepNow())ed.step(DRAW_RECT);}
    // everything modal (rotation, scale by a wall, photo editing) is finished; rotation — with saving
    if(ed.capture)(ed.capture.done||ed.capture.cancel)?.call(ed.capture);
    ed.tool=t;ed.hand=t==='hand';handCursor();
    if(ed.mode.id==='rooms')ed.modes.rooms.setTool(ROOM_TOOLS.includes(t)?t:'select');
    if(ROOM_TOOLS.includes(t))ed.setMain('plan');
    syncTools();
    if(t==='rotate')ed.flows.rotatePlan();
    refreshCursor();
  };
  // the “Select” button for the bottom bar — the same tool in all modes
  ed.selectButton=()=>{const b=el(`<button class="ib ${ed.tool==='select'?'on':''}" data-tool="select" title="${t('Select (V)')}">${icon('pointer')}</button>`);b.onclick=()=>ed.setTool('select');return b;};
  ed.toolDone=t=>{if(ed.tool===t){ed.tool='select';ed.hand=false;syncTools();}};
  cv.addEventListener('pointerdown',e=>{
    if(press||e.isPrimary===false||![0,1,2].includes(e.button))return;
    cv.focus({preventScroll:true});
    cv.setPointerCapture(e.pointerId);ed.guides=[];
    press={id:e.pointerId};
    lastPointer={offsetX:e.offsetX,offsetY:e.offsetY,shiftKey:e.shiftKey};
    const p=P(e),grab=ed.hand||space||e.button===1||e.button===2;
    if(!grab&&ed.capture&&e.button===0){ed.capture.down(p,e);
      if(press&&ed.capture?.dragCursor){press.modal=true;gesture.begin(e,ed.capture.dragCursor());}return;}
    const before=grab?null:structuredClone(ed.plan);
    if(grab||!ed.mode.down?.(e,p)){pan={X:e.offsetX,Y:e.offsetY,ox:ed.v.ox,oy:ed.v.oy,fitted:ed.v.fitted};if(!grab)ed.mode.deselect?.();gesture.begin(e,'grabbing');handCursor();ed.draw();}
    else if(ed.drag&&press){press.before=before;gesture.begin(e,ed.mode.dragCursor?.()||null);}
  });
  cv.addEventListener('pointermove',e=>{
    if(press&&e.pointerId!==press.id)return;
    lastPointer={offsetX:e.offsetX,offsetY:e.offsetY,shiftKey:e.shiftKey};
    const p=P(e);
    if(pan){if(!gesture.move(e))return;ed.v.ox=pan.ox+e.offsetX-pan.X;ed.v.oy=pan.oy+e.offsetY-pan.Y;ed.v.fitted=false;ed.draw();return;}
    if(ed.drag){if(gesture.move(e))ed.mode.move?.(e,p);return;}
    if(ed.hand||space){handCursor();return;}
    if(ed.capture){if(!press?.modal||gesture.move(e))ed.capture.move?.(p,e);return;}
    ed.mode.move?.(e,p);
  });
  cv.addEventListener('pointerup',e=>{
    if(!press||e.pointerId!==press.id)return;
    // Release the capture before commit: it may switch the wizard tool.
    release();if(pan)pan=null;else if(ed.capture?.up)ed.capture.up(P(e),e);else ed.mode.up?.(e,P(e));
    ed.guides=[];refreshCursor();
  });
  cv.addEventListener('pointercancel',e=>{if(e.pointerId===press?.id){ed.capture?.cancel?.();ed.cancelDrag();}});
  cv.addEventListener('lostpointercapture',e=>{if(e.pointerId===press?.id){ed.capture?.cancel?.();ed.cancelDrag();}});
  cv.addEventListener('pointerleave',()=>{if(!press)lastPointer=null;if(ed.hover||ed.furnHover){ed.hover=null;ed.furnHover=null;ed.draw();}});
  cv.addEventListener('dblclick',e=>ed.mode.dblclick?.(e,P(e)));
  cv.addEventListener('contextmenu',e=>e.preventDefault());
  let lastPinch=0;
  // The room panel, the banner and the hints lie over the plan: the wheel and gestures over them keep moving the plan instead of being cut off
  const overPlan=[cv,...['ctx','banner','ask'].map(id=>$(id))],onPlan=(type,fn)=>overPlan.forEach(x=>x.addEventListener(type,fn,{passive:false}));
  const at=e=>{const r=cv.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
  onPlan('wheel',e=>{if(e.defaultPrevented)return;e.preventDefault();if(ed.drag||pan)return;const [x,y]=at(e);
    // in rotate mode two fingers left and right rotate (Chrome and Firefox do not pass the trackpad rotation gesture to sites)
    if(!e.ctrlKey&&!isMouseWheel(e)&&ed.capture?.spin){ed.capture.spin(-(e.deltaX+e.deltaY*.35)*.004);return;}
    ed.v.fitted=false;
    if(e.ctrlKey){lastPinch=performance.now();ed.v.zoomAt(x,y,Math.exp(-e.deltaY*.01));} // pinch
    else if(isMouseWheel(e))ed.v.zoomAt(x,y,Math.exp(-e.deltaY*.0015));                 // wheel
    else{ed.v.ox-=e.deltaX;ed.v.oy-=e.deltaY;}                                                         // two fingers
    ed.draw();});
  // Safari: a real trackpad gesture — a two-finger rotation (like a map) and a pinch. Rotation — only in rotate mode,
  // so that a regular pinch does not rotate the plan. Zoom — here, only if the browser did not send the pinch as a wheel with Ctrl.
  let g0=null;
  onPlan('gesturestart',e=>{e.preventDefault();g0={rot:e.rotation||0,scale:e.scale||1,x:e.clientX,y:e.clientY};});
  onPlan('gesturechange',e=>{e.preventDefault();if(!g0)return;const r=cv.getBoundingClientRect();
    if(ed.capture?.spin){const d=(e.rotation-g0.rot)*Math.PI/180;g0.rot=e.rotation;ed.capture.spin(-d);}
    if(performance.now()-lastPinch>150){ed.v.zoomAt((g0.x||e.clientX)-r.left,(g0.y||e.clientY)-r.top,e.scale/g0.scale);ed.v.fitted=false;ed.draw();}
    g0.scale=e.scale;});
  onPlan('gestureend',e=>{e.preventDefault();g0=null;ed.capture?.spinEnd?.();});

  addEventListener('pointerup',e=>{const b=e.target.closest?.('button');if(b)setTimeout(()=>b.blur());});
  // ---------- keyboard ----------
  const keysBox=$('keys');ed.showKeys=()=>{keysBox.hidden=false;};keysBox.onclick=e=>{if(e.target===keysBox||e.target.closest('[data-close]'))keysBox.hidden=true;};
  addEventListener('keyup',e=>{if(e.code==='Space'){space=false;if(!ed.drag)refreshCursor();}});
  addEventListener('blur',()=>{space=false;if(press)ed.capture?.cancel?.();ed.cancelDrag();handCursor();});
  addEventListener('keydown',e=>{
    if(e.target.closest?.('input,select,textarea,button,summary,a'))return;
    if(look){if(e.key==='Escape')lookUI.esc();return;} // there are no edits in “Preview”: the editor keys do not work
    const mod=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();
    if(mod&&/^[zя]$/.test(k)){e.preventDefault();e.shiftKey?ed.redo():ed.undo();return;}
    if(mod&&/^[yн]$/.test(k)){e.preventDefault();ed.redo();return;}
    if(e.code==='Space'){e.preventDefault();if(!space){space=true;handCursor();}return;}
    if(e.key==='Escape'){if(!keysBox.hidden){keysBox.hidden=true;return;}if(ed.capture){ed.capture.cancel?.();ed.cancelDrag();return;}if(ed.cancelDrag())return;if(ed.mode.closeHint?.())return;if(ed.tool!=='select'&&ed.tool!=='rotate'){ed.setTool('select');return;}}
    if(!mod&&e.code==='KeyH'){ed.toggleTool('hand');return;}
    if(!mod&&e.code==='KeyV'){ed.setTool('select');return;}
    if(!mod&&e.code==='Backslash'){ed.toggleSide();return;}
    if(e.key==='?'){ed.showKeys();return;}
    // Tab — swap the plan and 3D; in “Split” — rotate the split line
    if(!mod&&!e.shiftKey&&e.key==='Tab'&&e.target===cv){e.preventDefault();if(ed.tool==='split'&&ed.mode.flipCut)ed.mode.flipCut();else ed.swap();return;}
    if(e.key==='Home'||(e.shiftKey&&e.code==='Digit1')){ui.main==='3d'?$('view-reset').click():ed.fit();return;}
    ed.mode.key?.(e);
  });
  // When the layout or the window size changes, the plan center stays in place.
  new ResizeObserver(()=>{const first=!ed.v.w,c=first?null:ed.v.W([ed.v.w/2,ed.v.h/2]);ed.v.resize();if(!ed.v.w)return;
    if(roleFit){const f=roleFit;roleFit=null;f();}
    else if(first||ed.v.fitted)ed.fit();else{ed.v.ox=ed.v.w/2-c[0]*ed.v.sc;ed.v.oy=ed.v.h/2+c[1]*ed.v.sc;}ed.draw();}).observe(cv);
  document.querySelectorAll('.modes [data-mode]').forEach(b=>b.onclick=()=>{ed.setLook(false);ed.setMode(b.dataset.mode);});
  // “Preview”: entering — 3D to the home view (as on the card); leaving — the mode we were in. An unsaved lights edit
  // in a room — a question first, as when switching modes.
  ed.look=()=>look;
  ed.setLook=v=>{v=!!v;if(v===look)return;
    if(v){if(ed.modes.lights.guardLeave?.(()=>ed.setLook(true)))return;ed.cancelDrag?.();if(ed.tool!=='select')ed.setTool('select');ed.sel={};ed.mode.refresh?.();}
    look=v;document.body.dataset.look=v?'on':'';
    document.querySelectorAll('.modes [data-mode]').forEach(b=>b.classList.toggle('on',!v&&b.dataset.mode===ed.mode.id));$('look-btn').classList.toggle('on',v);
    if(v)lookUI.open();else lookUI.close();
    layout();insets3d();placeFloats();if(v){requestAnimationFrame(()=>{insets3d();placeFloats();});ed.view.home();}ed.draw();};
  $('look-btn').onclick=()=>ed.setLook(!look);
  $('hand').onclick=()=>ed.toggleTool('hand');$('rotate-plan').onclick=()=>ed.toggleTool('rotate');$('fit').onclick=$('zoom').onclick=()=>ed.fit();$('help').onclick=ed.showKeys;
  const zoomBy=k=>{ed.v.zoomAt(ed.v.w/2,ed.v.h/2,k);ed.v.fitted=false;ed.draw();};
  $('zoom-in').onclick=()=>zoomBy(1.25);$('zoom-out').onclick=()=>zoomBy(1/1.25);
  $('undo').onclick=ed.undo;$('redo').onclick=ed.redo;
  // Home view (D-035): “Home view” — smoothly to its own view (none — to the previous angle). Rotated by hand — “Save view”:
  // the current view becomes the home view (plan.view), the home opens from it and that is how it will be seen on the card.
  $('view-reset').onclick=$('home-pip').onclick=e=>{e?.stopPropagation?.();insets3d();ed.view.home();};
  // The view step is the first tile of “Sensors”: saved — the step moves on, wherever it was pressed (the card or 3D).
  const viewAsk=()=>step?.mode===ed.mode&&!!ed.modes?.sensors.needView?.();
  ed.saveView=({quiet}={})=>{const inSens=!!ed.modes.sensors.needView?.();
    const v=ed.view.getView();ed.plan.view=v;ed.view.setHome(v);ed.commit();ed.view.home();
    if(inSens){ed.mode.refresh?.();return;}
    ed.mode.refresh?.();
    if(!quiet)ed.banner(t('Home view saved — your home opens like this, and the card shows it.'),[[t('Got it'),()=>ed.banner()]]);};
  $('save-view').onclick=$('save-view-pip').onclick=e=>{e.stopPropagation();if(e.currentTarget.classList.contains('done'))return;ed.saveView();};
  // The step text (the owner, 2026-11-07: “makes no damn sense”): what is in 3D now and what to do.
  ed.viewTip=()=>{const now=ed.view.moved?.()?'':t('The 3D view now shows the default view.')+' ';
    return {short:now+t('Rotate the model with the mouse and click “Save view”.'),full:now+t('Rotate the model with the mouse the way you want it on your Home Assistant dashboard, and click “Save view”.')};};
  // “Save view” at 3D — only in the “Sensors” step (at other times it is unclear what it is for — the owner).
  // There it is always visible: there is something to save (no view yet or the model was rotated) — it pulses; saved — “View saved”,
  // inactive until the model is rotated again. In the view step a cursor moves over the 3D window and shows how to rotate (view-demo.js).
  let viewMoved=false,asked=false;const demo=createViewDemo(panes['3d'],ed.view);
  ed.viewReady=()=>viewAsk()&&(!ed.plan.view||viewMoved);
  ed.syncSave=()=>{if(!ed.modes)return;const ask=viewAsk(),scope=step?.mode===ed.mode&&!!ed.modes.sensors.wizardOn?.(),live=!ed.plan.view||viewMoved;
    if(ask&&!asked&&ed.role('3d')==='off')setPip('win'); // a step about 3D, and the window is collapsed — show it
    asked=ask;
    for(const id of ['save-view','save-view-pip']){const b=$(id);b.hidden=!scope;b.classList.toggle('pulse',scope&&live);b.classList.toggle('done',scope&&!live);
      b.setAttribute('aria-disabled',String(scope&&!live));b.querySelector('span').textContent=live?t('Save view'):t('View saved');
      b.title=live?t('Save as the home view — your home opens with it, and the card shows it'):t('Rotate the model to save a new view');}
    demo.run(ask&&!viewMoved&&!ed.reducedMotion()&&ed.role('3d')!=='off');
    syncFinishHint();
    const saved=document.querySelector('.saved'),draft=ed.plan.lights.some(l=>l.draft),failed=!!ed.history.error;
    if(saved){saved.replaceChildren(el(icon(failed?'alert':'check',14)),document.createTextNode(failed?t('Not saved'):draft?t('Draft saved'):t('Saved')));saved.title=failed?t('Could not save the plan in this browser. Download the plan file.'):draft?t('Light placement still needs confirmation. The draft is saved in this browser.'):t('The plan saves automatically in this browser');}};
  ed.view.onMoved?.(m=>{viewMoved=m;ed.syncSave();});
  // Default wall thicknesses are a plan property (the house is like that), so they change through the history.
  const near=(sel,v)=>{let best=sel.options[0];for(const o of sel.options)if(Math.abs(+o.value-v)<Math.abs(+best.value-v))best=o;sel.value=best.value;};
  ed.syncSettings=()=>{const d=wallDefaults(ed.plan);near($('wall-outer'),d.outer);near($('wall-inner'),d.inner);$('wall-each').checked=!!ui.wallEach;};
  // Per-wall thickness is off: two shared thicknesses are enough 99% of the time. When on, it shows the thickness in the wall menu and a handle.
  // This is a user setting (not a plan one): thicknesses from the plan (for example, from an AI draft) are always visible in 3D.
  ed.prefs={get wallEach(){return !!ui.wallEach;}};
  // Tutorial hints: how many times shown (stored in this browser). done — do not show again.
  const setHint=(k,n)=>{ui.hints={...ui.hints,[k]:n};saveUI();};
  ed.hints={count:k=>+(ui.hints?.[k]||0),bump:k=>setHint(k,ed.hints.count(k)+1),done:(k,n=99)=>{if(ed.hints.count(k)<n)setHint(k,n);}};
  // The wizard step is per project and survives a page reload: ui.wiz[plan id] = {open, names}; the last 10 are stored.
  // Exit the wizard at any step: then on your own, in the modes at the top. Sizing by area, if still approximate, — by the rooms.
  // “Undo” — back to the same step.
  ed.exitWizard=()=>{const k=path.cur();
    if(ed.modes.lights.guardLeave?.(()=>ed.exitWizard()))return;
    ed.capture=null;ed.modes.rooms.wizardAt(null);ed.wizard.set(ed.plan.id,null);ed.step(null);if(ed.mode===ed.modes.rooms)ed.setTool('select');ed.v.cv.style.cursor='';
    for(const m of Object.values(ed.modes))if(m!==ed.modes.rooms)m.reset?.();
    if(ed.plan.scaleBy==='rect')ed.fitArea?.('rooms',{commit:false});
    ed.commit();ed.draw();
    ed.banner(t('Setup closed — carry on in the modes at the top.'),[...(k?[[t('Undo'),()=>{ed.banner();k==='fin'?path.finale():path.go(k);}]]:[]),[t('Got it'),()=>ed.banner(),true]]);};
  ed.wizard={get:id=>ui.wiz?.[id]||null,set:(id,v)=>{const w={...(ui.wiz||{})};delete w[id];if(v)w[id]=v;const ks=Object.keys(w);for(const k of ks.slice(0,Math.max(0,ks.length-10)))delete w[k];ui.wiz=w;saveUI();}};
  $('wall-each').onchange=e=>{ui.wallEach=e.target.checked;saveUI();ed.mode.refresh?.();ed.draw();};
  for(const [id,k] of [['wall-outer','outer'],['wall-inner','inner']])$(id).onchange=e=>{ed.plan.wall={...ed.plan.wall,[k]:+e.target.value};ed.commit();};
  let night=false;
  const setNight=n=>{night=n;ed.view.setNight(n);
    $('daynight').innerHTML=icon(n?'moon':'sun')+`<span>${n?t('Night'):t('Day')}</span>`;$('daynight-pip').innerHTML=icon(n?'moon':'sun',15);
    for(const id of ['daynight','daynight-pip'])$(id).classList.toggle('on',n);};
  $('daynight').onclick=$('daynight-pip').onclick=e=>{e.stopPropagation();setNight(!night);};
  ed.night=()=>night;ed.toggleNight=()=>setNight(!night);
  return ed;
}
