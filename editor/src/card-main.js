// The dashboard card (D-059): the plan from HA in 3D with the home panel — the editor's “Preview” (editor/look.js, D-047) without
// the editor. The plan comes from home_twin/plan/subscribe and follows every write; states, commands, history and statistics — the
// HA layer (editor/ha-live.js). What goes into the 3D is what the editor sends there too (core/plan-scene.js). Out of sight —
// scrolled away, another page, a dashboard HA keeps in memory — the 3D stops drawing (scene.js: pause).
// Night follows the sun (sun.sun) until the “Day / night” button is pressed. Settings the panel writes into the plan (scenes,
// “Customize panel”) are saved by administrators only; for others those buttons are hidden.
// Compact (card.js decides: an ordinary dashboard while the Home Twin dashboard exists) — the 3D as a still live picture, the room strip
// and “Now”; a tap on the model, a room or ⤢ opens the whole home there, a room — with ?room=, which the whole card opens.
import {createView} from './core/scene.js';
import {migrate} from './core/plan.js';
import {syncRuns} from './core/runs.js';
import {syncFurnStrips} from './core/fixtures.js';
import {liveScene} from './core/devices.js';
import {validate} from './core/geometry.js';
import {planWalls,planFurniture,planSpots} from './core/plan-scene.js';
import {loadKenney} from './core/furniture3d.js';
import {MODELS} from './gen/models.gen.js';
import {liveHA} from './editor/ha-live.js';
import {haPlanLights,mergePlanLights} from './editor/ha.js';
import {createLook} from './editor/look.js';
import {t} from './i18n/i18n.js';
import {readMode,saveMode,nextMode,isNight,onModeChange} from './core/daynight.js';

let models=null; // furniture models: loaded once per page for every card
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BOARD='home-twin-3d'; // the Home Twin dashboard (card.js, editor/ha-live.js)
const CSS=`:host{display:block;height:var(--home-twin-height,600px)}:host([compact]){height:var(--home-twin-height,360px)}:host([panel]),:host([grid]){height:100%}
ha-card{position:relative;display:block;height:100%;overflow:hidden;isolation:isolate}
.view{position:absolute;inset:0}
.empty{position:absolute;inset:0;z-index:6;display:grid;place-content:center;justify-items:center;gap:6px;padding:24px;text-align:center;color:var(--secondary-text-color);background:var(--card-background-color,#1c1c1c)}
.empty[hidden]{display:none}.empty b{font-size:16px;font-weight:600;color:var(--primary-text-color)}
.empty button{margin-top:8px;padding:8px 16px;border:0;border-radius:18px;font:inherit;font-weight:500;cursor:pointer;color:var(--text-primary-color,#fff);background:var(--primary-color,#03a9f4)}
.open{position:absolute;top:10px;right:10px;z-index:7;width:36px;height:36px;padding:0;border:0;border-radius:12px;display:none;place-items:center;cursor:pointer;
  color:var(--primary-text-color);background:color-mix(in srgb,var(--card-background-color,#1c1c1c) 72%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.open:hover{background:var(--card-background-color,#1c1c1c)}:host([compact]) .open{display:grid}`;
const EXPAND='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
// inside the panel (look.js): it is as tall as the card, not as the browser window; settings buttons — administrators only
const IN_CARD=':host(.embedded) .shell{height:100%;min-height:0}',NOT_ADMIN='.layout-open,[data-action=scene-edit]{display:none!important}';
// compact: the model fills the card, “Now” lies over its top, the room strip — over its bottom, nothing else of the panel
const COMPACT=`:host(.compact) .main{padding:0!important}:host(.compact) .workspace{display:block!important;position:relative;height:100%}
:host(.compact) .map-card{position:absolute!important;inset:0;height:auto!important;border:0;border-radius:0}
:host(.compact) .sidebar{position:absolute!important;left:12px;right:58px;top:12px;bottom:auto!important;width:auto!important;padding:0!important;background:none!important;
  border:0!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;overflow:visible!important;pointer-events:none}
:host(.compact) .sidebar>:not(.now-panel),:host(.compact) .now-panel .section-head{display:none!important}:host(.compact) .now-chips{pointer-events:auto}
:host(.compact) .room-strip{display:grid!important;padding:28px 10px 10px!important}
:host(.compact) .view-controls,:host(.compact) .workspace::before,:host(.compact) .workspace::after{display:none!important}`;

export async function createCard(card,hass0,config0){
  let hass=hass0,config=config0;
  const root=card.shadowRoot||card.attachShadow({mode:'open'});
  root.innerHTML=`<style>${CSS}</style><ha-card><div class="view"></div><div class="empty" hidden></div>
    <button class="open" type="button" title="${esc(t('Open|verb'))}" aria-label="${esc(t('Open|verb'))}">${EXPAND}</button></ha-card>`;
  const box=root.querySelector('ha-card'),emptyEl=root.querySelector('.empty'),viewEl=root.querySelector('.view');
  const ha=liveHA(hass);
  models??=loadKenney(MODELS);await models;
  const view=createView(viewEl);
  const dark=()=>!!hass.themes?.darkMode,sunDown=()=>hass.states['sun.sun']?.state==='below_horizon';
  // day / night (D-068): auto — by the sun (night after sunset, day after sunrise), or always day, always night; the mode is shared with the
  // editor (core/daynight.js), the button steps through them
  let dayMode=readMode(),night=isNight(dayMode,sunDown()),themeDark=dark();
  const showNight=()=>{const n=isNight(dayMode,sunDown());if(n===night)return false;night=n;view.setNight(n);return true;};
  view.setTheme(themeDark);view.setNight(night);

  // what look.js expects from the editor
  const ed={plan:migrate({}),ha,view,
    areaName:id=>ha.areas().find(a=>a.area_id===id)?.name||id,
    sensorCtx:()=>({sensors:ha.sensors?.()||[],areas:ha.areas(),state:e=>ha.state?.(e)??null}),
    history:{save:p=>save(p)},
    night:()=>night,dayMode:()=>dayMode,toggleNight:()=>{dayMode=nextMode(dayMode);saveMode(dayMode);showNight();},
    themeName:()=>themeDark?'dark':'light'};
  const look=createLook(ed,box);
  const lookRoot=box.querySelector('#look')?.shadowRoot;
  const adminCss=document.createElement('style');lookRoot?.append(adminCss);
  const roles=()=>{adminCss.textContent=IN_CARD+COMPACT+(hass.user?.is_admin?'':NOT_ADMIN);};roles();

  // the model fits into what the panel leaves free; compact — above the room strip
  const fit=()=>{if(compact){const s=lookRoot?.querySelector('.room-strip');view.setInsets(0,0,s?.offsetHeight?s.offsetHeight-28:0);return;}
    const i=look.insets();view.setInsets(0,i.right,i.bottom);};

  // ---------- compact, and the way to the whole home ----------
  let compact=false;
  const go=room=>{history.pushState(null,'',`/${BOARD}/home`+(room?'?room='+encodeURIComponent(room):''));window.dispatchEvent(new CustomEvent('location-changed'));};
  function setCompact(c){if(c===compact)return;compact=c;card.toggleAttribute('compact',c);box.querySelector('#look')?.classList.toggle('compact',c);
    view.controls.enabled=!c;view.renderer.domElement.style.touchAction=c?'pan-y':'none'; // a still picture: the page scrolls over it
    if(c){look.close();look.open();}requestAnimationFrame(fit);}
  root.querySelector('.open').addEventListener('click',()=>go());
  // a tap (not a drag) on the model, a room chip — the whole home
  let down=null;
  viewEl.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,at:performance.now()};});
  viewEl.addEventListener('pointerup',e=>{const d=down;down=null;if(compact&&d&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<8&&performance.now()-d.at<600)go();});
  lookRoot?.addEventListener('click',e=>{if(!compact)return;const chip=e.composedPath().find(n=>n.dataset?.action==='room');
    if(chip){e.stopImmediatePropagation();e.preventDefault();go(chip.dataset.room);}},true);
  // opened from a compact card with ?room= — that room's screen, and the address is cleaned
  function deepLink(){if(compact||!framed||!card.isConnected)return;const q=new URLSearchParams(location.search),r=q.get('room');if(!r)return;
    q.delete('room');const rest=q.toString();history.replaceState(history.state,'',location.pathname+(rest?'?'+rest:''));look.room(r);}
  window.addEventListener('location-changed',deepLink);

  // ---------- the plan ----------
  let keys={},rev=null,mine=null,framed=false;
  // as the editor loads it: HA lamps reconciled with the plan's (editor/app.js: setPlan)
  function setPlan(p){ed.plan=migrate(p||{});ed.plan.lights=mergePlanLights(ed.plan.lights,haPlanLights(ha),ha.switches?.()||[]);keys={};if(!framed)view.reframe();sync();look.refresh();fit();deepLink();}
  function sync(){const plan=ed.plan;syncRuns(plan);syncFurnStrips(plan);
    const ok=plan.rooms.length>0&&!validate(plan.rooms).length;
    empty(!ok);if(ok)framed=true;
    const vk=JSON.stringify(plan.view||null);if(vk!==keys.view){keys.view=vk;view.setHome?.(plan.view);}
    live();
    const placed=plan.lights.filter(l=>l.placed),lk=JSON.stringify([placed,plan.rooms]);
    if(lk!==keys.lights){keys.lights=lk;view.setLights(placed,plan.rooms);}
    const wk=JSON.stringify([plan.rooms,plan.openings,plan.wall]);
    if(wk!==keys.walls){keys.walls=wk;if(ok){const {g,ops}=planWalls(plan);view.set(g,plan.rooms,ops,null);}else view.set(null);}
    if(keys.mask!==lk){keys.mask=lk;view.applyMask(plan.rooms.filter(r=>!r.solid));}}
  // what changes with HA states: curtains and doors open, air conditioners blow, readings on the walls
  function live(){const plan=ed.plan,l=liveScene(plan,ha);
    view.setFurniture(planFurniture(plan,l));view.setSensors(planSpots(plan,ed.sensorCtx(),{cam:view.homeCam?.()}));
    view.setClimate?.(l.climate);view.setContacts?.(l.contacts);}
  // no home yet: say so, and administrators get a way to the editor
  function empty(on){emptyEl.hidden=!on;if(!on)return;const admin=!!hass.user?.is_admin;
    emptyEl.innerHTML=`<b>${esc(t('Your home is not drawn yet'))}</b><span>${esc(admin?t('Draw it in the Home Twin editor — it shows up here.'):t('An administrator can draw it in Home Twin.'))}</span>`+
      (admin?`<button type="button">${esc(t('Open the editor'))}</button>`:'');
    emptyEl.querySelector('button')?.addEventListener('click',()=>{history.pushState(null,'','/home-twin');window.dispatchEvent(new CustomEvent('location-changed'));});}
  // the panel's own settings (scenes, layout) — into the plan in HA; our own write comes back through the subscription — not reloaded
  let saveT=0;
  function save(p){if(!hass.user?.is_admin)return;clearTimeout(saveT);
    saveT=setTimeout(()=>hass.callWS({type:'home_twin/plan/save',plan:p,rev}).then(r=>{rev=mine=r.rev;},e=>console.warn('Home Twin card:',e)),700);}
  const unsubPlan=hass.connection.subscribeMessage(m=>{if(m.rev===mine&&m.rev===rev)return;rev=m.rev;setPlan(m.plan);},{type:'home_twin/plan/subscribe'});

  ha.onState(()=>{live();if(showNight())look.refresh();});
  onModeChange(m=>{dayMode=m;showNight();look.refresh();});
  ha.onChange(()=>{live();look.refresh();});
  look.open();setCompact(!!card.compact);

  const ro=new ResizeObserver(()=>{fit();requestAnimationFrame(fit);});ro.observe(box);
  // drawing only while it can be seen
  let shown=true,attached=true;
  const run=()=>shown&&attached?view.resume():view.pause();
  const io=new IntersectionObserver(es=>{shown=es.at(-1).isIntersecting;run();});io.observe(box);
  applyConfig();
  function applyConfig(){if(config.height)card.style.setProperty('--home-twin-height',/^\d+$/.test(String(config.height))?config.height+'px':config.height);else card.style.removeProperty('--home-twin-height');}

  return {view,
    update(h){const was=hass;hass=h;ha.update(h);setCompact(!!card.compact);
      if(dark()!==themeDark){themeDark=dark();view.setTheme(themeDark);look.refresh();}
      if(h.user!==was.user){roles();if(emptyEl.hidden===false)empty(true);}},
    config(c){config=c||{};applyConfig();setCompact(!!card.compact);},
    pause(){attached=false;run();},
    resume(){attached=true;run();setCompact(!!card.compact);fit();deepLink();},
    // gone for good (card.js: removed and not back within a minute — HA never says so itself): let everything go
    destroy(){clearTimeout(saveT);window.removeEventListener('location-changed',deepLink);io.disconnect();ro.disconnect();look.close();ha.close();view.dispose();unsubPlan.then(u=>u()).catch(()=>{});root.innerHTML='';},
  };
}
