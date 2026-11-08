// Preview (D-047, D-049): the home as it will be seen on the HA card (D-015). The panel is the home card from 3d_floor,
// one to one (the owner asked to take the panel logic entirely from the neighboring project: the same colors and animations):
// its styles (look/card.css), icons (look/icons.js), rules (look/overview.js, ac-control.js, history.js) and markup —
// in Shadow DOM over our 3D, like the card itself: a glass panel on the right, a room strip at the bottom, view buttons on the left.
// The dark theme is Minimalist dark, as on the home card; the light one uses the card's own default colors.
// Navigation is as in 3d_floor: home overview → click a room — the room screen in the panel (sensors with charts, the air conditioner
// remote, curtains, lights, “More in the room”), the camera flies to it, an outline on the floor; “Back” — the previous shot.
// Hovering a room in the overview — a glow from the floor (room-glow.js); a chip covering several rooms — a flash.
// Data — core/overview.js and the HA layer. Lights work like everything else: a lamp's state is its HA entity (light.* or a switch.* relay),
// commands go through ed.ha.call, 3D repeats what HA says (syncLights). A lamp without an HA entity — the old way, the plan's L.on.
// Weather — from the HA layer (look/weather.js); the “Home / Away / Night” scenes and “Customize” — look/scenes.js, settings in the plan.
// “Security” — the camera, water valve and leak sensors from HA (look/security.js, look/camera.js); none at all — no section.
// “Cleaning” — robot vacuums from HA (look/vacuum.js): a row and the main button in the overview, a device screen with “Return to dock”.
// “Statistics” — climate, energy and connectivity from what HA keeps on its own (look/stats.js, stats-view.js): tiles in the overview, a section
// screen with a period, numbers above rooms on the model. No lights or appliances: HA keeps no statistics for on / off.
// “Customize panel” — like the Android quick settings shade: “Add to panel” slides out next to the panel, cards and HA entities
// are dragged there and back; “Favorites” — tiles of any entities (look/layout.js, look/favorites.js); the layout is in the plan.
// The gear is by the overview title and in the room row (instead of “⌂”): each room has its own part order and its own “Favorites”.
// Not yet: TV.
//   open() / close(); esc() — one step back; insets() — {right, bottom}: what covers the 3D
import CARD_CSS from '../look/card.css';
import {icon} from '../look/icons.js';
import {t,N,getLang,locale,num as fmtNum,clock} from '../i18n/i18n.js';
import {overview} from '../core/overview.js';
import {acView,coverView} from '../core/devices.js';
import {metricOf,isClimate,fitsAuto} from '../core/sensors.js';
import {activeChips,climateTile,lightTile,roomLine,dayLine,homeRange,MODE_NAMES} from '../look/overview.js';
import {renderAC} from '../look/ac-control.js';
import {sparkline,METRICS,metricColor} from '../look/history.js';
import {weatherNow,forecastSlots,degrees} from '../look/weather.js';
import {SCENES,sceneDevices,scenePlan,sceneDraft,executeScene} from '../look/scenes.js';
import {securityDevices,securityAlerts,leakView,waterView,valveCommand} from '../look/security.js';
import {drawDemoFeed,openCameraPreview} from '../look/camera.js';
import {vacuumDevices,vacuumStatus,vacuumButton,vacuumHomeEnabled,vacuumCommand} from '../look/vacuum.js';
import {roomOfArea} from '../core/sensors.js';
import {SECTIONS as STATS,availableSections,loadSection,sectionMap,energySources} from '../look/stats.js';
import {energyTileMarkup,sectionTilesMarkup,statsViewMarkup,statsTip} from '../look/stats-view.js';
import {labelPoint} from '../core/geometry.js';
import {BUILTIN,ROOM_BUILTIN,isFav,resolveLayout,layoutToSave,addable,newFav,move,placeCard,placeEntity,removeEntity,entityCard,addEntity} from '../look/layout.js';
import {FAV_DOMAINS,favView,favCommand} from '../look/favorites.js';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// card icons: rooms by kind (core/overview.js: roomKind), lamps by shape, other sensors by class
const ROOM_IC={bed:'bed',kids:'sofa',kitchen:'kitchen',bath:'bath',living:'sofa',hall:'door',balcony:'window',office:'device',storage:'home',room:'home'};
const lampIcon=form=>form==='strip'?'strip':form==='line'?'cove':'bulb';
const KIND={ceiling:'ceiling',pendant:'ceiling',spots:'ceiling',line:'ceiling'}; // the room's main light — for the power button
const READ_IC={temperature:'thermometer',humidity:'droplet',carbon_dioxide:'eye',pm25:'wind',power:'power',energy:'power',illuminance:'sun',battery:'device'};
// The Minimalist dark theme (minimalist-desktop, dark) — how the card looks at home (3d_floor/web/index.html)
const DARK={'--primary-background-color':'#121212','--secondary-background-color':'#121212','--card-background-color':'#1d1d1d','--primary-text-color':'#dddddd',
  '--secondary-text-color':'#9b9b9b','--divider-color':'rgba(221,221,221,.12)','--primary-color':'#89b3f8','--color-red':'241,139,130','--color-green':'128,201,148',
  '--color-yellow':'252,214,99','--color-blue':'137,179,248','--color-purple':'102,31,255','--color-grey':'187,187,187','--color-pink':'233,30,99','--color-theme':'221,221,221','--border-radius':'20px'};
// over our 3D: the shell and the model area are transparent; only the panel, the room strip, the view buttons and the camera window are clickable
// (it is outside the panel: without pointer-events the close button and backdrop did not respond — clicks went into the 3D). The panel has a 17px bottom inset:
// the scenes' “Save / Cancel” sit right at the edge, with no line below them
const OWN=`:host{position:absolute;inset:0;z-index:5;display:block;pointer-events:none}
.shell{background:transparent!important}.map-card{background:transparent!important;border-color:transparent!important}.canvas-wrap,.room-strip{pointer-events:none}
.sidebar,.room-strip>*,.view-controls{pointer-events:auto}
.scene-editor-actions{bottom:-17px}
.scene-editor-actions .all-off{color:var(--ink);background:var(--fill-hi);font-size:12px;font-weight:500;transition:background .15s}
.scene-editor-actions .all-off:hover{background:color-mix(in srgb,var(--ink) 19%,var(--card))}
.scene-editor-actions .all-off.primary{color:#fff;background:color-mix(in srgb,var(--green) 82%,#000)}
.scene-editor-actions .all-off.primary:hover{background:var(--green)}
.camera-dialog{pointer-events:auto}
.vacuum-cards{display:grid;gap:8px}.vacuum-card.cleaning .tile-chip{background:color-mix(in srgb,var(--green) 22%,transparent);color:var(--green)}
:host{--rc0:#2a78d6;--rc1:#eb6834;--rc2:#1baf7a;--rc3:#eda100;--rc4:#e87ba4;--rc5:#008300;--rc6:#7c5cd6;--rc7:#1192b5;--rc8:#9a6a3a;--rc9:#5d6b7e}
:host(.on-dark){--rc0:#3987e5;--rc1:#d95926;--rc2:#199e70;--rc3:#c98500;--rc4:#d55181;--rc5:#008300;--rc6:#8f73e6;--rc7:#2aa3c4;--rc8:#b07c48;--rc9:#7d8ba0}
[data-section="energy"]{--section:color-mix(in srgb,rgb(var(--color-green,111,154,130)) 55%,rgb(var(--color-blue,66,133,244)))}
.stats-tile{--tile-accent:var(--section)}
.card-off{display:none!important}
.overview-h{display:flex;align-items:center;gap:6px;min-width:0}
.layout-open{width:30px;height:30px;margin:-4px 0;display:grid;place-items:center;flex-shrink:0;border-radius:9px;background:transparent;color:var(--muted);transition:background .15s,color .15s}
.layout-open:hover{background:var(--fill);color:var(--ink)}.layout-open svg{width:17px;height:17px}
.layout-editor{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;flex-shrink:0}.layout-editor[hidden]{display:none}
.layout-hint{font-size:11px;color:var(--muted);line-height:1.5;margin:0 2px 12px}
.edit-cards{display:flex;flex-direction:column;gap:6px;min-height:56px}
.edit-card{display:flex;align-items:center;gap:8px;padding:7px 4px 7px 2px;border:1px solid var(--line);border-radius:12px;background:var(--card);cursor:grab;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.edit-card.fav{flex-direction:column;align-items:stretch;gap:6px}.edit-card-head{display:flex;align-items:center;gap:8px}
.layout-grip{width:24px;height:34px;display:grid;place-items:center;background:transparent;color:var(--muted);cursor:grab;border-radius:6px;flex-shrink:0}.layout-grip svg{width:15px;height:15px}
.layout-text{flex:1;min-width:0}.layout-text strong{display:block;font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.layout-text small{display:block;margin-top:2px;font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.edit-x{width:26px;height:26px;display:grid;place-items:center;border-radius:8px;background:transparent;color:var(--muted);flex-shrink:0}.edit-x:hover{background:var(--fill-hi);color:var(--ink)}.edit-x svg{width:14px;height:14px}
.edit-title{flex:1;min-width:0;border:0;background:transparent;font:inherit;font-size:12px;font-weight:500;color:var(--ink);padding:5px 6px;border-radius:7px;cursor:text}.edit-title:hover,.edit-title:focus{background:var(--fill);outline:none}
.edit-tiles,.tray-tiles{display:flex;flex-wrap:wrap;gap:6px}.edit-card .edit-tiles{min-height:38px;margin:0 2px 0 32px;padding:4px;border-radius:10px;border:1px dashed transparent;transition:background .15s,border-color .15s}
.edit-tiles.drop-on{background:color-mix(in srgb,var(--green) 12%,transparent);border-color:color-mix(in srgb,var(--green) 55%,transparent)}
.edit-tiles-empty{font-size:11px;color:var(--muted);padding:6px 4px}.edit-empty{font-size:12px;color:var(--muted);text-align:center;padding:18px 8px;border:1px dashed var(--line);border-radius:12px;margin:0}
.edit-tile{display:inline-flex;align-items:center;gap:6px;max-width:100%;min-height:30px;padding:3px 3px 3px 8px;border-radius:10px;background:var(--card);border:1px solid var(--line);font-size:12px;color:var(--ink);cursor:grab;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.edit-tile[hidden]{display:none}.edit-tile>svg{width:15px;height:15px;color:var(--muted)}.edit-tile>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.edit-tile .edit-x{width:22px;height:22px}
.layout-tray .edit-tile{background:var(--card)}.edit-card .edit-tile{background:var(--fill)}
.layout-tray{position:absolute;inset:var(--tray-top,8px) 8px 8px;z-index:7;pointer-events:auto;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:16px 14px 18px;border-radius:18px;
  background:color-mix(in srgb,var(--paper) 80%,transparent);backdrop-filter:blur(26px) saturate(1.25);-webkit-backdrop-filter:blur(26px) saturate(1.25);
  border:1px solid color-mix(in srgb,var(--ink) 12%,transparent);box-shadow:0 14px 40px #00000040;animation:tray-in .28s cubic-bezier(.2,.8,.2,1);transition:outline-color .15s}
.layout-tray[hidden]{display:none}.layout-tray.drop-remove{outline:2px dashed rgb(var(--color-red,219,68,55));outline-offset:-7px}
@container twin (aspect-ratio>1/1) and (width>=540px){.layout-tray{inset:var(--tray-top,14px) auto 14px auto;right:calc(var(--panel-w) + 14px);width:min(340px,calc(100% - var(--panel-w) - 28px))}}
@keyframes tray-in{from{opacity:0;transform:translateX(18px)}}
@media (prefers-reduced-motion:reduce){.layout-tray{animation:none}}
.tray-head strong{display:block;font-size:15px;font-weight:600;letter-spacing:-.2px}.tray-head small{display:block;margin-top:3px;font-size:11px;color:var(--muted)}
.layout-tray .section-label{margin:18px 2px 8px}.tray-cards{display:flex;flex-direction:column;gap:6px}
.tray-card{display:flex;align-items:center;gap:10px;padding:7px 4px 7px 8px;border-radius:12px;background:var(--card);border:1px solid var(--line);cursor:grab;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.tray-group[hidden]{display:none}.tray-group-name{font-size:11px;color:var(--muted);margin:12px 2px 6px}
.layout-tray .fav-search{display:block;width:100%;margin:0 0 4px;padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:var(--card);font:inherit;font-size:12px;color:var(--ink)}
.dragging{opacity:.35}.drag-ghost{position:absolute;z-index:50;pointer-events:none;margin:0;box-shadow:0 16px 36px #00000052;transform:rotate(1.2deg) scale(1.02);opacity:.96}
.drop-slot{display:block;flex-shrink:0;border-radius:2px;background:var(--green)}.drop-slot.slot-card{height:3px;margin:-1.5px 6px}.drop-slot.slot-tile{width:3px;height:28px;align-self:center}
.room-part>:first-child{margin-top:0}.room-part>:last-child{margin-bottom:0}.room-part+.room-part{margin-top:24px}
.fav-panel .tile,.room-fav .tile{--tile-accent:var(--green)}.fav-panel .tile.light,.room-fav .tile.light{--tile-accent:rgb(var(--color-yellow,197,148,75))}
.fav-panel .tile.unavailable,.room-fav .tile.unavailable{opacity:.55}`; // there may be several robots — each gets its own row
// statistics room colors — the 3d_floor card palette (--room-*, checked for color blindness) in plan room order, plus four
const OVERVIEW=['.overview-heading','.now-panel','.scenes-panel','.rooms-overview','.home-controls','.watch-panel','.stats-panel'];
// Navigation — as in 3d_floor/navigation.js: a room replaces its neighbour, “Back” returns to the overview with the previous camera shot.
class Navigation{constructor(){this.current={level:'overview'};this.history=[];}
  room(id,camera){if(this.current.level==='overview')this.history=[{view:this.current,camera}];else this.history=this.history.slice(0,1);this.current={level:'room',room:id};}
  // a device screen (robot vacuum) — same as a room: “Back” returns to the overview with the previous shot
  device(kind,id,camera){if(this.current.level==='overview')this.history=[{view:this.current,camera}];else this.history=this.history.slice(0,1);this.current={level:'device',kind,id};}
  stats(camera){if(this.current.level==='overview')this.history=[{view:this.current,camera}];else this.history=this.history.slice(0,1);this.current={level:'stats'};}
  back(){const e=this.history.pop();this.current=e?.view||{level:'overview'};return e;}
  home(){this.current={level:'overview'};this.history=[];}}

export function createLook(ed,host0){
  const host=document.createElement('div');host.id='look';host.className='embedded dashboard-cards';host.hidden=true;host0.append(host);
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>${CARD_CSS}\n${OWN}</style>
    <div class="shell night" data-level="overview"><main class="main"><div class="workspace">
      <section class="map-card" aria-label="${escape(t('Interactive 3D model of the home'))}"><div class="canvas-wrap"><div class="pins"></div></div>
        <div class="view-controls"></div><nav class="room-strip" aria-label="${escape(t('Rooms|spaces'))}"></nav>
        <aside class="layout-tray" aria-label="${escape(t('Add to panel'))}" hidden></aside></section>
      <aside class="sidebar" aria-label="${escape(t('Home controls'))}">
        <div class="panel-navigation" hidden><button class="nav-round" data-action="back" aria-label="${escape(t('Back'))}">${icon('arrow')}</button><span class="panel-path"></span>
          <button class="nav-round" data-nav-end data-action="home" aria-label="${escape(t('Home overview'))}">${icon('home')}</button></div>
        <section class="overview-heading"><div class="overview-title"><div class="overview-name"><div class="overview-h"><h2>${escape(t('Whole home'))}</h2>
              <button class="layout-open" data-action="layout-edit" title="${escape(t('Customize panel'))}" aria-label="${escape(t('Customize panel'))}">${icon('gear')}</button></div><p class="home-line" hidden></p></div>
            <div class="weather-now" hidden><span class="weather-icon"></span><span class="weather-text"><b class="weather-temp"></b><small class="weather-label"></small></span></div></div>
          <div class="forecast" role="list" aria-label="${escape(t('Weather forecast'))}" hidden></div></section>
        <section class="now-panel" aria-label="${escape(t('Now'))}"><div class="section-head"><span>${escape(t('Now'))}</span>
          <button class="section-action" data-action="all-off" hidden>${icon('power')}${escape(t('Turn lights off'))}</button></div><div class="now-chips"></div></section>
        <section class="scenes-panel" aria-label="${escape(t('Scenes'))}"><div class="section-head"><span>${escape(t('Scenes'))}</span>
          <button class="section-action" data-action="scene-edit">${icon('sliders')}${escape(t('Customize'))}</button></div>
          <div class="scene-choices">${SCENES.map(s=>`<button data-action="scene-run" data-id="${s.id}">${icon(s.icon)}<span>${escape(t(s.name))}</span></button>`).join('')}</div>
          <p class="scene-result" role="status" aria-live="polite"></p></section>
        <section class="rooms-overview" aria-label="${escape(t('Rooms'))}"><div class="section-head"><span>${escape(t('Rooms'))}</span></div><div class="room-list"></div></section>
        <section class="home-controls" aria-label="${escape(t('Lights & climate'))}"><div class="section-head"><span>${escape(t('Lights & climate'))}</span></div><div class="room-tiles"></div></section>
        <section class="watch-panel is-empty" aria-label="${escape(t('Security'))}"><div class="section-head"><span>${escape(t('Security'))}</span></div><div class="watch-grid"></div></section>
        <section class="vacuum-panel live compact is-empty" aria-label="${escape(t('Cleaning|section'))}"><div class="section-head"><span>${escape(t('Cleaning|section'))}</span></div><div class="vacuum-cards"></div></section>
        <section class="stats-panel is-empty" aria-label="${escape(t('Statistics'))}"><div class="section-head"><span>${escape(t('Statistics'))}</span></div><div class="stats-tile-host"></div></section>
        <section class="room-panel" aria-live="polite" hidden></section><section class="stats-view" aria-label="${escape(t('Statistics'))}" hidden></section><section class="scene-editor" hidden></section>
        <section class="layout-editor" aria-label="${escape(t('Panel layout'))}" hidden></section>
      </aside></div></main></div>`;
  const $=s=>root.querySelector(s),$$=s=>[...root.querySelectorAll(s)];
  const nav=new Navigation();
  let on=false,unsub=null,chips=[],flashT=0,wxT=0;
  let editing=null,drafts={},busy=false,resultT=0; // “Customize”: which scene is open, drafts per scene; a scene is running
  let lay=null,dnd=null; // “Customize panel”: draft {cards, empty — currently empty, q — search in the shade}; what is being dragged
  let sec={camera:null,water:[],leaks:[]},vac=[],ask=null,askT=0,camT=0;const pend=new Set(); // “Security”: devices; the valve asks {entity, action}; commands in flight
  // “Statistics”: data by “section:period:sources” ({at, data}; data null — failed to load), what is open, charts for tooltips
  const st={data:new Map(),loading:new Set(),section:'climate',period:'month',room:null,charts:{},shown:null,html:'',tile:'',pinHtml:'',prefs:undefined,prefsAt:0,src:null,raf:0,pins:new Map()};
  const cur=()=>nav.current.room||null;

  // ---------- data: our plan and the HA layer → what the 3d_floor rules expect ----------
  function model(){const R=overview(ed.plan,ed.sensorCtx(),ed.areaName,ed.ha),climate={};
    for(const r of R){const c=r.climate;climate[r.id]={temperature:c.t?Math.round(c.t.v*10)/10:null,humidity:c.h?Math.round(c.h.v):null,co2:c.co2?Math.round(c.co2.v):null};}
    const rooms=R.map(r=>{
      const lamps=r.lamps.map(l=>({id:l.id,name:l.name,kind:KIND[l.form]||l.form,form:l.form,...lampState(l.id)}));
      const climate=r.dev.acs.map(a=>{const heater=a.kind==='heat',s={status:a.ok?'available':'unavailable',on:a.on,mode:a.mode,action:a.action,temperature:a.temp,current:a.current,canTemperature:a.temp!=null,range:false};
        return {id:a.entity,name:a.title,label:heater?a.title:N('Air conditioner'),heater,view:climateTile(s,{action:heater,heater}),canPower:a.ok,mode:a.mode,a};});
      return {...r,short:r.name,sens:r.climate,lamps,light:lamps.length?lightTile(lamps):null,climate,covers:r.dev.covers};}); // sens — room sensors, climate — air conditioners and the boiler (as in 3d_floor)
    return {rooms,climate};}
  const hist=e=>e&&ed.ha?.history?ed.ha.history(e):[];
  // a lamp in HA: has an entity — its state; none — the plan's L.on
  const haLamp=L=>L?.entity&&ed.ha?.entity?.(L.entity)||null;
  function lampState(id){const L=ed.plan.lights.find(x=>x.id===id),x=haLamp(L);
    if(!x)return {on:L?.on!==false,status:'available'};return {on:x.state==='on',status:['unavailable','unknown'].includes(x.state)?'unavailable':'available'};}
  // 3D follows HA: a lamp (and its part of the fixture) is lit if its entity is on. shown — what is already shown, so the scene is not churned
  const shown=new Map();
  function syncLights(){for(const L of ed.plan.lights){const x=haLamp(L);if(!x||(x.state!=='on'&&x.state!=='off'))continue;const v=x.state==='on';
    if(shown.get(L.id)===v&&(L.on!==false)===v)continue;L.on=v;ed.view.setLightOn(L.id,v);shown.set(L.id,v);}}
  // turn a lamp on or off: in HA — light / switch turn_on / turn_off, the new state arrives via onState; without an entity — in the plan
  function lampCmd(L,v){const x=haLamp(L);if(x)return Promise.resolve(call(L.entity.split('.')[0],v?'turn_on':'turn_off',{entity_id:L.entity}));
    L.on=v;ed.view.setLightOn(L.id,v);return Promise.resolve(true);}

  // ---------- overview — markup as in 3d_floor/card.js ----------
  function heading(M){const line=$('.home-line'),parts=[dayLine(),homeRange(M.climate)].filter(Boolean);
    line.innerHTML=parts.map(p=>`<span>${escape(p)}</span>`).join(' · ');line.hidden=!parts.length;}
  function nowChips(M){
    chips=activeChips({lights:M.rooms.flatMap(r=>r.lamps.map(l=>({id:l.id,room:r.id,on:l.on}))),
      acs:M.rooms.flatMap(r=>r.climate.filter(d=>!d.heater).map(d=>({id:d.id,room:r.id,on:d.view.state==='on',mode:d.mode}))),
      covers:M.rooms.flatMap(r=>r.covers.map(c=>({id:c.entity,room:r.id,open:c.ok&&c.pos>1}))),
      open:M.rooms.flatMap(r=>r.dev.contacts.filter(c=>c.open).map(c=>({id:c.entity,room:r.id,name:c.name,icon:c.cls==='window'?'window':'door'}))),
      ...securityAlerts(sec),vacuum:vac.map(v=>({id:v.entity,room:v.room,cleaning:v.activity==='cleaning'})),rooms:M.rooms,climate:M.climate});
    $('.now-chips').innerHTML=chips.length?chips.map(c=>`<button class="now-chip ${c.kind}${c.tone?' mode-'+c.tone:''}" data-action="now-chip" data-key="${escape(c.key)}" data-highlight="${escape(c.rooms.join(' '))}"
      aria-label="${escape(c.label)}${c.count?': '+c.count:''}">${icon(c.icon)}<span>${escape(c.label)}</span>${c.count?`<i>${c.count}</i>`:''}</button>`).join('')
      :`<p class="now-empty">${icon('check')}<span>${escape(t('Everything is off'))}</span></p>`;
    $('[data-action="all-off"]').hidden=!M.rooms.some(r=>r.lamps.some(l=>l.on));}
  function rows(M){
    $('.room-list').innerHTML=M.rooms.map(r=>{const lit=r.lamps.filter(l=>l.on).length,parts=roomLine(M.climate[r.id],{lit,lights:r.lamps.length}),on=[];
      if(lit)on.push({kind:'light',icon:'bulb',label:r.lamps.length>1?t('light {0} of {1}',lit,r.lamps.length):t('light')});
      for(const d of r.climate.filter(d=>d.view.state==='on'))on.push({kind:`climate mode-${d.view.tone}`,icon:d.view.icon,label:d.heater?d.name.toLowerCase():t('air conditioner: {0}',t(MODE_NAMES[d.mode]||N('On')).toLowerCase())});
      const temp=M.climate[r.id].temperature!=null?M.climate[r.id].temperature+'°':'',path=sparkline(hist(r.sens.t?.entity),{width:44,height:18,pad:3,span:METRICS.temperature.span});
      return `<button class="room-row${lit?' lit':''}" data-action="room" data-room="${escape(r.id)}" data-highlight="${escape(r.id)}">
        <span class="room-row-name"><span>${escape(r.short)}</span><small class="room-row-sub">${parts.map(p=>`<span${p.tone?` class="tone-${p.tone}"`:''}>${escape(p.text)}</span>`).join(' · ')}</small></span>
        <span class="room-badges">${on.map(b=>`<span class="room-badge ${b.kind}" title="${escape(b.label[0].toUpperCase()+b.label.slice(1))}">${icon(b.icon)}</span>`).join('')}</span>
        <svg class="room-spark" viewBox="0 0 44 18" preserveAspectRatio="none" aria-hidden="true" focusable="false"${path?'':' hidden'}><path d="${path?.line||''}"/></svg><span class="room-temp">${escape(temp)}</span>${icon('arrow')}</button>`;}).join('');}
  function tileMarkup(tile){
    const running=tile.climate.filter(d=>d.view.state==='on'),lit=tile.light?.state==='on',warm=running.length>0;
    const dead=(!tile.light||tile.light.state==='unavailable')&&tile.climate.every(d=>d.view.state==='unavailable');
    const first=tile.climate[0];
    const sub=tile.light?tile.light.status:first?`${t(first.label)}: ${first.view.status.toLowerCase()}`:'';
    // one button per kind of device (the owner, 2026-11-08: “no need to cram a gazillion icons in here”): room lights — turns off
    // what is on, in a dark room turns on the main light (like the power button in 3d_floor), curtains — all at once; each lamp and section — on the room screen
    const light=tile.light?`<button class="ltile-lamp${lit?' on':''}" data-action="ltile-power" data-room="${escape(tile.id)}" aria-pressed="${lit}"
        aria-label="${escape(tile.short)}: ${lit?t('turn lights off'):t('turn lights on')}" data-tip="${lit?t('Turn lights off'):t('Turn lights on')}" ${tile.light.power?'':'disabled'}>${icon('bulb')}</button>`:'';
    const live=tile.covers.filter(c=>c.ok),open=live.some(c=>c.pos>1);
    const covers=tile.covers.length?`<button class="ltile-lamp cover${open?' on':''}" data-action="covers-toggle" data-room="${escape(tile.id)}" aria-pressed="${open}"
        aria-label="${escape(tile.short)}: ${open?t('Close curtains'):t('Open curtains')}" data-tip="${open?t('Close curtains'):t('Open curtains')}" ${live.length?'':'disabled'}>${icon(tile.covers.every(c=>c.blind)?'blind':'curtain')}</button>`:'';
    // air conditioner and boiler — the same round buttons, but at the edge; when running — the mode icon and color
    const power=d=>{const o=d.view.state==='on';
      return `<button class="ltile-lamp ac${o?' on mode-'+d.view.tone:''}${d.heater?' heater':''}" data-action="ctile-power" data-id="${escape(d.id)}" aria-pressed="${o}"
        aria-label="${escape(d.name)}: ${o?t('turn off'):t('turn on')}" data-tip="${escape(d.name)}" ${d.canPower?'':'disabled'}>${icon(o?d.view.icon:d.heater?'flame':'wind')}</button>`;};
    const step=(d,dir,label,text)=>`<button class="ctile-step" data-action="ctile-step" data-id="${escape(d.id)}" data-step="${dir}" aria-label="${escape(d.name)}: ${label}" data-tip="${label[0].toUpperCase()+label.slice(1)}">${text}</button>`;
    const row=d=>`<div class="ctile-bottom rtile-climate mode-${d.view.tone}"><button class="rtile-mode" data-action="room" data-room="${escape(tile.id)}" aria-label="${escape(d.name)}: ${t('remote')}">
        <span class="ctile-target">${escape(d.view.target||'—')}</span><small>${escape(d.view.status)}</small></button>
        ${d.view.adjustable?`<span class="ctile-steps">${step(d,-1,t('cooler'),'−')}${step(d,1,t('warmer'),'+')}</span>`:''}</div>`;
    const buttons=tile.climate.length?`<span class="rtile-devices">${tile.climate.map(power).join('')}</span>`:'';
    return `<div class="ctile room${lit?' lit':''}${warm?` ac-on mode-${running[0].view.tone}`:''}${dead?' unavailable':''}" data-highlight="${escape(tile.id)}">
      <div class="ctile-top"><button class="ctile-head" data-action="room" data-room="${escape(tile.id)}" aria-label="${escape(tile.short)}: ${t('open room')}">
          <span class="ctile-chip">${icon(ROOM_IC[tile.kind]||'home')}</span><span class="ctile-text"><strong>${escape(tile.short)}</strong><small>${escape(sub)}</small></span></button>
</div>
      <div class="ctile-bottom"><span class="ltile-lamps">${light}${covers}</span>${buttons}</div>
      ${running.map(row).join('')}
    </div>`;}
  function tiles(M){const L=M.rooms.filter(r=>r.lamps.length||r.climate.length||r.covers.length);
    $('.home-controls').classList.toggle('is-empty',!L.length);$('.room-tiles').innerHTML=L.map(tileMarkup).join('');}

  // ---------- “Security” — as in 3d_floor/card.js (watchMarkup, updateLeaks, updateWatch, waterPress, refreshCamera) ----------
  // devices come from the HA layer by kind; a sensor's room comes from its area
  function secOf(M){return securityDevices(ed.ha,a=>{const r=roomOfArea(ed.plan,a);return r?M.rooms.find(x=>x.id===r.id)||null:null;});}
  // tiles are rebuilt only when the set changes: otherwise the camera frame would flicker with every home event
  function watch(){const grid=$('.watch-grid'),one=sec.water.length===1,hl=r=>r?` data-highlight="${escape(r)}"`:'';
    const off=vac.filter(v=>v.status!=='available'); // an unavailable robot shows here as a small tile; it has no row in “Cleaning”
    const key=JSON.stringify([sec.camera&&[sec.camera.entity,sec.camera.name,sec.camera.room],sec.water.map(w=>[w.entity,w.name,w.room]),sec.leaks.length>0,off.map(v=>[v.entity,v.name])]);
    if(grid.dataset.key!==key){grid.dataset.key=key;const c=sec.camera;
      grid.innerHTML=(c?`<button class="cam-tile loading" data-action="cam-open" data-id="${escape(c.entity)}"${hl(c.room)} aria-label="${escape(c.name)}: ${escape(t('open camera'))}">
          ${ed.ha?.demo?'<canvas width="960" height="540" aria-hidden="true"></canvas>':'<img alt="" decoding="async">'}
          <span class="cam-badge"><i></i>${escape(c.name)}</span><time class="cam-time"></time><span class="cam-empty">${escape(t('No image'))}</span></button>`:'')
        +sec.water.map(w=>`<button class="mini-tile water-tile" data-action="water" data-id="${escape(w.entity)}"${hl(w.room)}><span class="mini-chip">${icon('droplet')}</span>
          <span class="mini-text"><strong>${escape(one?t('Water'):w.name)}</strong><small class="water-status"></small></span></button>`).join('')
        +(sec.leaks.length?`<div class="mini-tile leak-tile" role="group"><span class="mini-chip">${icon('leak')}</span>
          <span class="mini-text"><strong>${escape(t('Leaks'))}</strong><small class="leak-status"></small></span><span class="leak-pills"></span></div>`:'')
        +off.map(v=>`<div class="mini-tile vacuum-mini"${hl(v.room)}><span class="mini-chip">${icon('vacuum')}</span><span class="mini-text"><strong>${escape(v.name)}</strong><small>${escape(t('Unavailable'))}</small></span></div>`).join('');
      camera();}
    // valve: on the second tap; while asking — a red frame
    for(const w of sec.water){const tile=grid.querySelector(`.water-tile[data-id="${CSS.escape(w.entity)}"]`);if(!tile)continue;
      const asking=ask?.entity===w.entity,v=waterView({...w,pending:pend.has(w.entity),confirm:asking});
      tile.className=`mini-tile water-tile ${v.state}${asking?' confirm':''}${tile.classList.contains('flash')?' flash':''}`;
      const st=tile.querySelector('.water-status');if(st.textContent!==v.text)st.textContent=v.text;
      tile.disabled=!v.action;tile.setAttribute('aria-label',`${w.name}: ${v.text}`);}
    // leaks: a summary and a button per sensor — a dot in its state color and the room
    const tile=grid.querySelector('.leak-tile'),view=leakView(sec.leaks);
    if(tile&&view){const k=JSON.stringify(view);if(tile.dataset.key!==k){tile.dataset.key=k;tile.className=`mini-tile leak-tile ${view.state}`;
      tile.dataset.highlight=[...new Set(view.items.map(i=>i.room).filter(Boolean))].join(' ');tile.setAttribute('aria-label',`${t('Leaks')}: ${view.text}`);
      tile.querySelector('.leak-status').textContent=view.text;
      tile.querySelector('.leak-pills').innerHTML=view.items.map(i=>`<button class="leak-pill ${i.state}" data-action="leak" data-id="${escape(i.entity)}"${hl(i.room)}
        aria-label="${escape(i.tip)}" data-tip="${escape(i.tip)}"><i></i>${escape(i.label)}</button>`).join('');}}
    // the camera spans as many rows as there are tiles next to it
    const small=grid.querySelectorAll('.mini-tile').length;
    grid.querySelector('.cam-tile')?.style.setProperty('--rows',Math.max(1,small));grid.classList.toggle('stacked',small>1);
    $('.watch-panel').classList.toggle('is-empty',!sec.camera&&!small);}
  // the frame in the tile: in the demo — a synthetic hallway every 2 s, in HA — entity_picture every 10 s; only while the tile is visible
  function camera(){const tile=$('.cam-tile'),c=sec.camera;if(!tile||!c||document.hidden||!tile.getClientRects().length)return;
    const time=tile.querySelector('.cam-time'),stamp=()=>clock(new Date(),{second:'2-digit'});
    if(ed.ha?.demo){drawDemoFeed(tile.querySelector('canvas').getContext('2d'));time.textContent=stamp();tile.classList.remove('loading','empty');return;}
    if(!c.picture){tile.classList.remove('loading');tile.classList.add('empty');return;}
    // the new frame loads off to the side: swapping src on the fly would flash an empty tile
    const url=(ed.ha.url?.(c.picture)||c.picture)+(c.picture.includes('?')?'&':'?')+'_='+Date.now(),next=new Image();
    next.onload=()=>{const img=tile.querySelector('img');if(img)img.src=next.src;time.textContent=stamp();tile.classList.remove('loading','empty');};
    next.onerror=()=>{tile.classList.remove('loading');tile.classList.add('empty');};next.src=url;}
  function waterPress(id){const w=sec.water.find(x=>x.entity===id);if(!w)return;const v=waterView({...w,pending:pend.has(id)});if(!v.action)return;
    clearTimeout(askT);
    if(ask?.entity!==id||ask.action!==v.action){ask={entity:id,action:v.action};askT=setTimeout(()=>{ask=null;render();},4000);render();return;}
    ask=null;pend.add(id);render();
    Promise.resolve(call(...valveCommand(w,v.action),{entity_id:id})).finally(()=>{pend.delete(id);render();});}
  // the entity card in HA; in the demo there is nothing to open — the model flashes the room
  function flash(rooms){clearTimeout(flashT);ed.view.setGlow?.(rooms,{pulse:true});flashT=setTimeout(()=>{flashT=0;ed.view.setGlow?.([]);},2200);}

  // ---------- “Cleaning” — as in 3d_floor/card.js (vacuum-panel, updateVacuum, vacuumCommand) ----------
  function vacOf(M){return vacuumDevices(ed.ha,a=>{const r=roomOfArea(ed.plan,a);return r?M.rooms.find(x=>x.id===r.id)||null:null;});}
  // overview — rows of available robots (compact: the main button); device screen — one robot, with “Return to dock”
  function vacuums(){const panel=$('.vacuum-panel'),id=nav.current.level==='device'?nav.current.id:null,list=id?vac.filter(v=>v.entity===id):vac.filter(v=>v.status==='available');
    panel.classList.toggle('compact',!id);panel.classList.toggle('is-empty',!list.length);
    $('.vacuum-cards').innerHTML=list.map(v=>{const main=vacuumButton(v),busy=pend.has(v.entity),hl=v.room?` data-highlight="${escape(v.room)}"`:'';
      return `<div class="vacuum-card${v.activity==='cleaning'?' cleaning':''}"><button class="vacuum-open" data-action="vacuum-open" data-id="${escape(v.entity)}"${hl} ${!id&&v.status==='available'?'':'disabled'}>
          <span class="tile-chip">${icon('vacuum')}</span><span class="tile-text"><strong>${escape(v.name)}</strong><small class="vacuum-status" role="status">${escape(vacuumStatus(v,busy))}</small></span></button>
        <div class="vacuum-actions"><button class="vacuum-btn" data-action="vacuum-start" data-id="${escape(v.entity)}" data-command="${main.action}" ${main.disabled||busy?'disabled':''}>${escape(main.label)}</button>
          <button class="vacuum-btn" data-action="vacuum-home" data-id="${escape(v.entity)}" ${!vacuumHomeEnabled(v)||busy?'disabled':''}>${escape(t('Return to dock'))}</button></div></div>`;}).join('');}
  function openVacuum(id){const v=vac.find(x=>x.entity===id);if(!v)return;editing=null;drafts={};nav.device('vacuum',id,ed.view.getView?.());ed.view.setGlow?.([]);
    const r=v.room&&ed.plan.rooms.find(x=>x.id===v.room);ed.view.setOutline?.(r?r.id:null);if(r)ed.view.focus(r.polygon,{pad:1.25});render();$('.sidebar').scrollTop=0;}
  function vacuumPress(id,action){const v=vac.find(x=>x.entity===id),c=v&&vacuumCommand(v,action);if(!c||pend.has(id))return;
    pend.add(id);render();Promise.resolve(call(c[0],c[1],{entity_id:id})).finally(()=>{pend.delete(id);render();});}

  // ---------- “Statistics” — as in 3d_floor/card.js (refreshStats, updateStatsTile, openStats, renderStatsView, updateStatsModel, statsPointer) ----------
  // sources — what Preview already shows: room climate sensors, meters from the HA “Energy” dashboard, all model entities
  function statsSrc(M){const C=ed.sensorCtx(),sensor=e=>C.sensors.find(s=>s.entity===e),room=a=>{const r=roomOfArea(ed.plan,a);return r?M.rooms.find(x=>x.id===r.id)||null:null;};
    const climate=M.rooms.map(r=>({room:r.id,temperature:r.sens.t?.entity,humidity:r.sens.h?.entity,co2:r.sens.co2?.entity})).filter(s=>s.temperature||s.humidity||s.co2);
    const energy=energySources(st.prefs,{room:s=>room(sensor(s)?.area),name:s=>sensor(s)?.name||s});
    const H=new Map(),add=(entity,name,r,device)=>{if(entity&&!H.has(entity))H.set(entity,{entity,name:name||entity,room:r||null,device:device||null});};
    for(const L of ed.plan.lights)if(L.entity&&L.placed&&!L.draft&&!L.skip)add(L.entity,L.name,L.room);
    for(const d of ed.ha?.devices?.()||[])add(d.entity,d.name,room(d.area)?.id,d.device);
    for(const c of climate)for(const k of ['temperature','humidity','co2']){const x=sensor(c[k]);if(x)add(x.entity,x.name,c.room,x.device);}
    return {climate,energy,health:[...H.values()]};}
  // the HA “Energy” dashboard — every 10 minutes; until it arrives there is no energy section
  function energyPrefs(){if(!ed.ha?.energy||Date.now()-st.prefsAt<6e5)return;st.prefsAt=Date.now();
    Promise.resolve(ed.ha.energy()).then(p=>{st.prefs=p||null;},()=>{st.prefs=null;}).then(()=>{if(on)render();});}
  // section data for a period: in HA — at most once every 10 minutes (connectivity — every 30: it is raw history); the key includes the sources too,
  // so a moved sensor does not show stale data
  const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(36);};
  const keyOf=(id,period)=>`${id}:${period}:${hash(JSON.stringify(st.src?.[id]??null))}`;
  const statsFor=(id,period='month')=>{const e=st.data.get(keyOf(id,period));return e?e.data:undefined;}; // undefined — still computing, null — failed to load
  async function refreshStats(id,period){if(!st.src)return;const k=keyOf(id,period),c=st.data.get(k),ttl=ed.ha?.demo?6e4:id==='health'?18e5:6e5;
    if(c&&Date.now()-c.at<ttl||st.loading.has(k))return;st.loading.add(k);
    try{st.data.set(k,{at:Date.now(),data:await loadSection(id,ed.ha,st.src,period)});}
    catch(e){console.warn('home-twin: statistics',k,e);if(!c)st.data.set(k,{at:Date.now(),data:null});}
    finally{st.loading.delete(k);}
    if(on)render();}
  // sections: sources exist and data was found for the month (shown while computing); failed to load or empty — no section
  const statsIds=()=>availableSections(st.src).filter(id=>{const d=statsFor(id);return d===undefined||d&&!d.empty;});
  const roomColour=M=>{const i=new Map(M.rooms.map((r,k)=>[r.id,k]));return id=>`var(--rc${(i.get(id)??9)%10})`;};
  // overview: energy as a large tile with bars, the rest as small ones
  function statsPanel(M){for(const id of availableSections(st.src))refreshStats(id,'month');
    const ids=statsIds(),data=Object.fromEntries(ids.map(id=>[id,statsFor(id)])),rest=ids.filter(id=>id!=='energy'),name=id=>M.rooms.find(r=>r.id===id)?.short||'';
    const html=(ids.includes('energy')?energyTileMarkup(data.energy,name):'')+(rest.length?`<div class="stats-tiles">${sectionTilesMarkup(rest,data)}</div>`:'');
    $('.stats-panel').classList.toggle('is-empty',!ids.length);if(html!==st.tile){st.tile=html;$('.stats-tile-host').innerHTML=html;}}
  // the section screen replaces the overview; the model shows the whole home, with numbers above the rooms
  function openStats(id){editing=null;drafts={};if(nav.current.level!=='stats')nav.stats(ed.view.getView?.());
    const ids=statsIds();st.section=ids.includes(id)?id:ids[0]||'climate';st.room=null;
    ed.view.setGlow?.([]);ed.view.setOutline?.(null);ed.view.home();render();$('.sidebar').scrollTop=0;}
  function renderStats(M){const host=$('.stats-view'),ids=statsIds();if(ids.length&&!ids.includes(st.section))st.section=ids[0];
    refreshStats(st.section,st.period);const k=keyOf(st.section,st.period),e=st.data.get(k);st.shown=e?.data||null;
    const view=statsViewMarkup(st.shown,{section:st.section,sections:ids,period:st.period,room:st.room,rooms:M.rooms,colour:roomColour(M),demo:!!ed.ha?.demo,loading:!e||st.loading.has(k)});
    if(view.html!==st.html){st.html=view.html;st.charts=view.charts;host.innerHTML=view.html;host.dataset.section=st.section;
      host.setAttribute('aria-label',`${t('Statistics')}: ${t(STATS.find(s=>s.id===st.section)?.label||'')}`);}}
  // on the model — the section number above each room's floor (stat-pin, as in 3d_floor), at the room label point; moves with the view
  function pins(M){const map=nav.current.level==='stats'&&!editing&&st.shown?sectionMap(st.section,st.shown):{};
    const html=Object.entries(map).map(([id,v])=>{const r=M.rooms.find(x=>x.id===id);
      return r?`<span class="stat-pin${st.room===id?' selected':st.room?' dim':''}" data-room="${escape(id)}" style="visibility:hidden"><b>${escape(v.label)}</b><small>${escape(r.short)}</small></span>`:'';}).join('');
    if(html!==st.pinHtml){st.pinHtml=html;$('.pins').innerHTML=html;}if(html&&!st.raf)st.raf=requestAnimationFrame(placePins);}
  function placePins(){st.raf=0;const box=$('.pins');if(!on||!box.children.length)return;const cam=ed.view.camera,cv=ed.view.renderer?.domElement;
    if(cam&&cv){const b=box.getBoundingClientRect(),c=cv.getBoundingClientRect();
      for(const pin of box.children){const r=ed.plan.rooms.find(x=>x.id===pin.dataset.room);if(!r)continue;
        let p=st.pins.get(r.id);if(p?.poly!==r.polygon){p={poly:r.polygon,at:labelPoint(r.polygon)};st.pins.set(r.id,p);}
        const v=cam.position.clone().set(p.at[0],.06,-p.at[1]).project(cam);
        pin.style.transform=`translate(${(c.left+(v.x+1)/2*c.width-b.left).toFixed(1)}px,${(c.top+(1-v.y)/2*c.height-b.top).toFixed(1)}px) translate(-50%,-50%)`;
        pin.style.visibility=v.z<1?'visible':'hidden';}}
    st.raf=requestAnimationFrame(placePins);}
  // a tooltip over a bar, a line point or an hour of the day; no event — remove it
  function statsPointer(e){const view=$('.stats-view'),tip=view.querySelector('.stats-tip');if(!tip)return;
    const clear=()=>{for(const n of view.querySelectorAll('.stats-cross,.stats-dot'))n.hidden=true;view.querySelector('.stats-col.hover')?.classList.remove('hover');};
    const host=e?.target?.closest?.('[data-chart]'),chart=host&&st.charts[host.dataset.chart];if(!chart){tip.hidden=true;clear();return;}
    const box=view.getBoundingClientRect();let html,x,y;
    if(chart.kind==='profile'){clear();const r=host.querySelector('svg').getBoundingClientRect(),h=Math.max(0,Math.min(23,Math.round((e.clientX-r.left)/r.width*23)));
      const cross=host.querySelector('.stats-cross'),dot=host.querySelector('.stats-dot');cross.style.left=dot.style.left=(h/23*100).toFixed(2)+'%';
      dot.style.top=(r.height*(60-chart.values[h]/chart.max*56)/60).toFixed(1)+'px';cross.hidden=dot.hidden=false;html=statsTip(chart,h);x=r.left+r.width*h/23-box.left;y=r.top-box.top;}
    else{const col=e.target.closest('.stats-col');if(!col){tip.hidden=true;clear();return;}clear();col.classList.add('hover');html=statsTip(chart,+col.dataset.i);
      const r=col.getBoundingClientRect(),c=host.getBoundingClientRect();x=r.left+r.width/2-box.left;y=c.top-box.top;}
    tip.innerHTML=html;tip.hidden=false;const w=tip.offsetWidth;
    tip.style.left=Math.max(4,Math.min(box.width-w-4,x-w/2)).toFixed(1)+'px';tip.style.top=Math.max(4,y-tip.offsetHeight-8).toFixed(1)+'px';}

  // ---------- “Customize panel” and “Favorites” (look/layout.js, look/favorites.js) ----------
  // the overview layout (plan.panel) or the room screen layout (room.panel)
  const planRoom=id=>ed.plan.rooms.find(x=>x.id===id);
  const layout=(room=null)=>room?resolveLayout(planRoom(room)?.panel,ROOM_BUILTIN):resolveLayout(ed.plan.panel);
  const favItems=()=>new Map((ed.ha?.entities?.()||[]).filter(x=>FAV_DOMAINS.includes(x.domain)).map(x=>[x.entity,x]));
  // overview: sections in layout order (reordered only when it changes), removed built-ins are hidden; “Favorites” get their own sections
  function applyLayout(){const cards=layout(),sb=$('.sidebar'),end=$('.room-panel'),all=favItems();
    for(const s of $$('.fav-panel'))if(!cards.some(c=>c.id===s.dataset.card))s.remove();
    const el=c=>{if(!isFav(c))return $(BUILTIN.find(b=>b.id===c.id).sel);let s=root.querySelector(`.fav-panel[data-card="${CSS.escape(c.id)}"]`);
      if(!s){s=document.createElement('section');s.className='fav-panel';s.dataset.card=c.id;s.innerHTML='<div class="section-head"><span></span></div><div class="tiles fav-tiles"></div>';sb.insertBefore(s,end);}return s;};
    const key=cards.map(c=>c.id).join();if(sb.dataset.order!==key||cards.some(c=>isFav(c)&&!el(c).isConnected)){for(const c of cards)sb.insertBefore(el(c),end);sb.dataset.order=key;}
    for(const b of BUILTIN)$(b.sel).classList.toggle('card-off',!cards.some(c=>c.id===b.id));
    for(const c of cards.filter(isFav)){const s=el(c),items=favEntities(c,all);
      s.querySelector('.section-head span').textContent=c.title||t('Favorites');s.setAttribute('aria-label',c.title||t('Favorites'));s.classList.toggle('is-empty',!items.length);
      const html=items.map(favTile).join('');
      const g=s.querySelector('.fav-tiles');if(g.dataset.html!==html){g.dataset.html=html;g.innerHTML=html;}}}
  const favEntities=(c,all=favItems())=>c.entities.map(e=>all.get(e)||{entity:e,name:e,domain:e.split('.')[0]});
  function favTile(it){const v=favView(it,ed.ha?.entity?.(it.entity)),busy=pend.has(it.entity),r=roomOfArea(ed.plan,it.area);
    return `<button class="tile ${it.domain}${v.on?' on':''}${v.off?' unavailable':''}" data-action="fav" data-id="${escape(it.entity)}"${r?` data-highlight="${escape(r.id)}"`:''} ${v.action&&!busy?'':'disabled'}
      aria-label="${escape(it.name)}: ${escape(v.text)}"><span class="tile-chip">${icon(v.icon)}</span><span class="tile-text"><strong>${escape(it.name)}</strong><small>${escape(busy?t('Sending command…'):v.text)}</small></span></button>`;}
  // tapping a “Favorites” tile: an HA command — the new state arrives via onState; sensor, lock, valve — the entity card in HA
  function favPress(id,b){const it=favItems().get(id)||{entity:id,name:id,domain:id.split('.')[0]},x=ed.ha?.entity?.(id),v=favView(it,x);
    if(v.action==='info'){if(!ed.ha?.demo&&ed.ha?.moreInfo)ed.ha.moreInfo(id);else if(b.dataset.highlight)flash([b.dataset.highlight]);return;}
    const c=favCommand(it,x,v.action);if(!c||pend.has(id))return;pend.add(id);render();Promise.resolve(call(c[0],c[1],{entity_id:id})).finally(()=>{pend.delete(id);render();});}
  // ---------- “Customize panel” — like the Android quick settings shade: the panel on the right, “Add to panel” slides out next to it ----------
  // Cards and devices are dragged from the shade into the panel, anything extra goes back; the panel holds the order. With a mouse — drag from anywhere,
  // with a finger — by long press (a short move scrolls). From the keyboard: the card handle + ↑ / ↓, “×” and “+”.
  // The “what is empty now” snapshot comes from the overview or room screen the settings were opened from (they are hidden in the settings)
  function openLayout(){const M=model(),empty=new Set(),room=nav.current.level==='room'?cur():null;
    if(room){const r=M.rooms.find(x=>x.id===room);if(!r)return;for(const [id,html] of Object.entries(roomParts(r,M)))if(!html.trim())empty.add(id);}
    else{if(!sceneDevices(M.rooms).length)empty.add('scenes');if(!M.rooms.length)empty.add('rooms');
      for(const b of BUILTIN)if(['controls','watch','vacuum','stats'].includes(b.id)&&$(b.sel).classList.contains('is-empty'))empty.add(b.id);}
    editing=null;drafts={};lay={cards:layout(room),empty,q:'',room,builtin:room?ROOM_BUILTIN:BUILTIN};ed.view.setGlow?.([]);render();layoutEditor();trayTop();$('.sidebar').scrollTop=0;}
  // in the editor the mode panel hangs above the model — the shade starts below it (the HA card has none)
  function trayTop(){const m=document.getElementById('modes'),c=$('.map-card').getBoundingClientRect(),b=m?.getBoundingClientRect();
    const over=b&&b.bottom>c.top&&b.left<c.right&&b.right>c.left?b.bottom-c.top+10:0;$('.layout-tray').style.setProperty('--tray-top',over?Math.round(over)+'px':'');}
  addEventListener('resize',()=>{if(lay)trayTop();});
  function closeLayout(){dragStop();lay=null;render();$('.sidebar').scrollTop=0;}
  function saveLayout(){const v=layoutToSave(lay.cards,lay.builtin),o=lay.room?planRoom(lay.room):ed.plan;
    if(o){if(v)o.panel=v;else delete o.panel;ed.history.save(ed.plan);}closeLayout();}
  const cardName=c=>isFav(c)?c.title||t('Favorites'):t(lay.builtin.find(b=>b.id===c.id).name);
  const xBtn=(a,id,label,from='')=>`<button class="edit-x" data-action="${a}" data-id="${escape(id)}"${from?` data-from="${escape(from)}"`:''} aria-label="${escape(label)}" title="${escape(label)}">${icon('close')}</button>`;
  const plusBtn=(a,id,label)=>`<button class="edit-x" data-action="${a}" data-id="${escape(id)}" aria-label="${escape(label)}" title="${escape(label)}">${icon('plus')}</button>`;
  function tileOf(e,from){const x=favItems().get(e)||{entity:e,name:e,domain:e.split('.')[0]},ic=favView(x,{state:'off',attributes:{}}).icon;
    return `<span class="edit-tile" data-drag="entity" data-id="${escape(e)}"${from?` data-from="${escape(from)}"`:''}>${icon(ic)}<span>${escape(x.name)}</span>${from?xBtn('tile-remove',e,t('Remove: {0}',x.name),from):''}</span>`;}
  // panel: cards are collapsed to a row (otherwise long lists cannot be dragged); “Favorites” shows its tiles and title right in the row
  function layoutEditor(){const box=$('.layout-editor'),y=$('.sidebar').scrollTop;
    const card=c=>{const b=lay.builtin.find(x=>x.id===c.id),name=cardName(c),grip=`<button class="layout-grip" data-grip="${escape(c.id)}" aria-label="${escape(t('Reorder: {0} (up and down arrows)',name))}" title="${escape(t('Drag'))}">${icon('grip')}</button>`;
      if(!isFav(c))return `<div class="edit-card" data-drag="card" data-id="${escape(c.id)}">${grip}<span class="mini-chip">${icon(b.icon)}</span>
        <span class="layout-text"><strong>${escape(name)}</strong><small>${escape(lay.empty.has(c.id)?t('Empty now — hidden in the panel'):t(b.about))}</small></span>${xBtn('layout-remove',c.id,t('Remove: {0}',name))}</div>`;
      return `<div class="edit-card fav" data-drag="card" data-id="${escape(c.id)}"><div class="edit-card-head">${grip}<span class="mini-chip">${icon('star')}</span>
          <input class="edit-title" data-fav-title="${escape(c.id)}" value="${escape(c.title)}" placeholder="${escape(t('Favorites'))}" maxlength="40" aria-label="${escape(t('Card name'))}">${xBtn('layout-remove',c.id,t('Remove: {0}',name))}</div>
        <div class="edit-tiles" data-fav="${escape(c.id)}">${c.entities.map(e=>tileOf(e,c.id)).join('')||`<span class="edit-tiles-empty">${escape(t('Drag devices here'))}</span>`}</div></div>`;};
    box.innerHTML=`<p class="layout-hint">${escape(t('Drag cards and devices. Anything extra goes back to “Add to panel”.'))}</p>
      <div class="edit-cards">${lay.cards.map(card).join('')||`<p class="edit-empty">${escape(t('The panel is empty — drag a card here.'))}</p>`}</div>
      <div class="scene-editor-actions"><button class="all-off primary" data-action="layout-save">${escape(t('Done'))}</button><button class="all-off" data-action="layout-cancel">${escape(t('Cancel'))}</button></div>
      <button class="scene-reset" data-action="layout-reset">${escape(t('Restore default'))}</button>`;
    $('.sidebar').scrollTop=y;tray();}
  // shade: removed built-in cards and a new “Favorites”, below — HA entities by plan room (those already on the panel are not shown;
  // in room settings the room's devices come first)
  function tray(){const box=$('.layout-tray'),y=box.scrollTop,used=new Set(lay.cards.filter(isFav).flatMap(c=>c.entities));
    const roomOf=x=>roomOfArea(ed.plan,x.area),groups=new Map();
    for(const x of [...favItems().values()].filter(x=>!used.has(x.entity)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))){const r=roomOf(x),k=r?.id||'';
      if(!groups.has(k))groups.set(k,{name:r?(r.name||ed.areaName?.(r.area)||''):t('No room'),list:[]});groups.get(k).list.push(x);}
    const order=[...(lay.room&&groups.has(lay.room)?[lay.room]:[]),...ed.plan.rooms.map(r=>r.id).filter(id=>id!==lay.room&&groups.has(id)),...(groups.has('')?['']:[])];
    const cards=addable(lay.cards,lay.builtin).map(id=>{const b=lay.builtin.find(x=>x.id===id),name=b?t(b.name):t('Favorites');
      return `<div class="tray-card" data-drag="new" data-id="${id}"><span class="mini-chip">${icon(b?b.icon:'star')}</span><span class="layout-text"><strong>${escape(name)}</strong>
        <small>${escape(b?t(b.about):t('Any HA devices, scenes and scripts'))}</small></span>${plusBtn('tray-add',id,t('Add: {0}',name))}</div>`;}).join('');
    box.innerHTML=`<div class="tray-head"><strong>${escape(t('Add to panel'))}</strong><small>${escape(t('Drag to the panel or tap +'))}</small></div>
      <div class="section-label">${escape(t('Cards'))}</div><div class="tray-cards">${cards}</div>
      <div class="section-label">${escape(t('Devices and scenes'))}</div>
      <input class="fav-search" type="search" data-tray-search value="${escape(lay.q)}" placeholder="${escape(t('Search: name or room'))}" aria-label="${escape(t('Find a device'))}">
      ${order.map(k=>{const g=groups.get(k);return `<div class="tray-group" data-q="${escape(g.name.toLowerCase())}"><div class="tray-group-name">${escape(g.name)}</div><div class="tray-tiles">${g.list.map(x=>
        `<span class="edit-tile" data-drag="entity" data-id="${escape(x.entity)}" data-q="${escape((x.name+' '+x.entity+' '+g.name).toLowerCase())}">${icon(favView(x,{state:'off',attributes:{}}).icon)}<span>${escape(x.name)}</span>${plusBtn('tray-add-entity',x.entity,t('Add: {0}',x.name))}</span>`).join('')}</div></div>`;}).join('')
        ||`<p class="layout-hint">${escape(t('Everything is already on the panel.'))}</p>`}`;
    filterTray();box.scrollTop=y;}
  function filterTray(){const q=lay.q.trim().toLowerCase();
    for(const g of $$('.tray-group')){let any=false;for(const x of g.querySelectorAll('.edit-tile')){const ok=!q||x.dataset.q.includes(q);x.hidden=!ok;any||=ok;}g.hidden=!any;}}
  // ----- dragging: a ghost is dragged; the drop spot is a line between cards or between “Favorites” tiles; the shade — remove -----
  function dragStop(){if(!dnd)return;clearTimeout(dnd.timer);cancelAnimationFrame(dnd.raf);dnd.ghost?.remove();dnd.el.classList.remove('dragging');
    root.querySelector('.drop-slot')?.remove();for(const n of $$('.drop-on,.drop-remove'))n.classList.remove('drop-on','drop-remove');dnd=null;}
  function dragBegin(){const r=dnd.el.getBoundingClientRect(),s=$('.shell').getBoundingClientRect(),g=dnd.el.cloneNode(true);
    g.classList.add('drag-ghost');g.style.width=r.width+'px';$('.shell').append(g);dnd.ghost=g;dnd.dx=dnd.x-r.left;dnd.dy=dnd.y-r.top;dnd.shell=s;dnd.started=true;
    dnd.el.classList.add('dragging');if(dnd.touch)navigator.vibrate?.(12);dragAt();scrollLoop();}
  function slot(parent,before,cls){let n=root.querySelector('.drop-slot');if(!n){n=document.createElement('i');}n.className='drop-slot '+cls;if(n.parentElement!==parent||n.nextElementSibling!==before)parent.insertBefore(n,before);}
  function dragAt(){const {x,y}=dnd;dnd.ghost.style.left=(x-dnd.dx-dnd.shell.left)+'px';dnd.ghost.style.top=(y-dnd.dy-dnd.shell.top)+'px';
    for(const n of $$('.drop-on,.drop-remove'))n.classList.remove('drop-on','drop-remove');
    const hit=root.elementFromPoint(x,y),fromPanel=dnd.kind==='card'||dnd.kind==='entity'&&dnd.from;dnd.target=null;
    if(hit?.closest('.layout-tray')){root.querySelector('.drop-slot')?.remove();if(fromPanel){dnd.target={zone:'tray'};$('.layout-tray').classList.add('drop-remove');}return;}
    const tiles=dnd.kind==='entity'&&hit?.closest('.edit-tiles');
    if(tiles){const list=[...tiles.querySelectorAll('.edit-tile')].filter(n=>n!==dnd.el);
      // the spot among tiles follows reading order: a row above or to the left of the cursor
      let i=0;for(const n of list){const b=n.getBoundingClientRect();if(b.bottom<y||(b.top<=y&&b.left+b.width/2<x))i++;}
      tiles.classList.add('drop-on');slot(tiles,list[i]||null,'slot-tile');dnd.target={zone:'fav',id:tiles.dataset.fav,index:i};return;}
    const panel=hit?.closest('.layout-editor');
    if(panel){const wrap=$('.edit-cards'),list=[...wrap.querySelectorAll('.edit-card')].filter(n=>n!==dnd.el);
      let i=0;for(const n of list){const b=n.getBoundingClientRect();if(b.top+b.height/2<y)i++;}
      slot(wrap,list[i]||null,'slot-card');dnd.target={zone:'cards',index:i};return;}
    root.querySelector('.drop-slot')?.remove();}
  // at the edge of the panel or shade — scroll while held
  function scrollLoop(){if(!dnd?.started)return;const hit=root.elementFromPoint(dnd.x,dnd.y),box=hit?.closest('.layout-tray')||hit?.closest('.sidebar');
    if(box){const b=box.getBoundingClientRect(),edge=48,v=dnd.y<b.top+edge?-(b.top+edge-dnd.y)/3:dnd.y>b.bottom-edge?(dnd.y-b.bottom+edge)/3:0;if(v){box.scrollTop+=v;dragAt();}}
    dnd.raf=requestAnimationFrame(scrollLoop);}
  function dragDrop(){const d=dnd,tg=d.target;dragStop();if(!tg)return;const T=t('Favorites');
    if(tg.zone==='tray'){if(d.kind==='card')lay.cards=lay.cards.filter(c=>c.id!==d.id);else if(d.kind==='entity'&&d.from)lay.cards=removeEntity(lay.cards,d.id,d.from);}
    else if(tg.zone==='fav'&&d.kind==='entity')lay.cards=placeEntity(lay.cards,d.id,tg.id,tg.index,d.from);
    else if(tg.zone==='cards'){
      if(d.kind==='card')lay.cards=placeCard(lay.cards,lay.cards.find(c=>c.id===d.id),tg.index);
      else if(d.kind==='new')lay.cards=placeCard(lay.cards,d.id==='entities'?newFav(lay.cards,T):{id:d.id},tg.index);
      else lay.cards=entityCard(lay.cards,d.id,tg.index,T,d.from);}
    layoutEditor();}
  root.addEventListener('pointerdown',e=>{if(!lay||e.button>0)return;const el=e.target.closest?.('[data-drag]');if(!el||e.target.closest('button:not(.layout-grip),input'))return;
    dnd={el,kind:el.dataset.drag,id:el.dataset.id,from:el.dataset.from||null,pid:e.pointerId,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,touch:e.pointerType==='touch',started:false};
    // finger — long press (as on Android), mouse — a move of a couple of pixels
    if(dnd.touch)dnd.timer=setTimeout(()=>{if(dnd&&!dnd.started)dragBegin();},300);else e.preventDefault();});
  root.addEventListener('pointermove',e=>{if(!dnd||e.pointerId!==dnd.pid)return;dnd.x=e.clientX;dnd.y=e.clientY;
    if(!dnd.started){const far=Math.hypot(dnd.x-dnd.sx,dnd.y-dnd.sy);if(dnd.touch){if(far>8)dragStop();}else if(far>4)dragBegin();return;}
    e.preventDefault();dragAt();});
  root.addEventListener('pointerup',e=>{if(!dnd||e.pointerId!==dnd.pid)return;if(dnd.started)dragDrop();else dragStop();});
  root.addEventListener('pointercancel',e=>{if(dnd&&e.pointerId===dnd.pid)dragStop();});
  // while dragging with a finger the page does not scroll
  root.addEventListener('touchmove',e=>{if(dnd?.started)e.preventDefault();},{passive:false});
  root.addEventListener('contextmenu',e=>{if(lay&&e.target.closest?.('[data-drag]'))e.preventDefault();});
  // from the keyboard: the card handle + arrows
  root.addEventListener('keydown',e=>{const g=e.target.closest?.('[data-grip]');if(!lay||!g||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
    lay.cards=move(lay.cards,g.dataset.grip,e.key==='ArrowUp'?-1:1);layoutEditor();root.querySelector(`[data-grip="${CSS.escape(g.dataset.grip)}"]`)?.focus();});

  // ---------- weather and scenes — as in 3d_floor/card.js (updateWeather, scenes-panel, renderSceneEditor, runScene) ----------
  // current weather to the right of the title, the forecast strip below it; no weather in HA — neither is shown
  function weather(){const w=ed.ha?.weather?.()||null,now=Date.now(),cur=weatherNow(w,now),box=$('.weather-now'),bar=$('.forecast');
    box.hidden=!cur;
    if(cur){box.querySelector('.weather-icon').innerHTML=cur.icon==='unknown'?'':icon(cur.icon);box.querySelector('.weather-temp').textContent=degrees(cur.temperature);
      box.querySelector('.weather-label').textContent=cur.label;box.title=cur.feels!=null?t('{0}, feels like {1}',cur.label,degrees(cur.feels)):cur.label;
      box.setAttribute('aria-label',t('Outside {0}, {1}',degrees(cur.temperature),cur.label.toLowerCase()));}
    const slots=forecastSlots(w,now);bar.hidden=!slots.length;
    bar.innerHTML=slots.map(s=>`<div class="forecast-cell ${s.kind}" role="listitem" aria-label="${escape(s.label)}: ${escape(s.temperature||s.text)}">
      <small>${escape(s.label)}</small>${s.icon==='unknown'?'<svg></svg>':icon(s.icon)}<b>${escape(s.temperature||s.text)}</b></div>`).join('');}
  const settings=()=>ed.plan.scenes||{};
  // scene buttons: nothing to control — no section; the tooltip says what it does (a customized one — how many actions)
  function scenes(M){const D=sceneDevices(M.rooms),S=settings();$('.scenes-panel').hidden=!D.length;
    for(const b of $$('[data-action="scene-run"],[data-action="scene-edit"]'))b.disabled=busy;
    for(const b of $$('[data-action="scene-run"]')){const s=SCENES.find(x=>x.id===b.dataset.id);
      b.title=S[s.id]?t('Custom scene · actions: {0}',scenePlan(s.id,D,S[s.id]).length):t(s.description);}}
  // “Customize”: scene tabs, an action for each device grouped by room
  function sceneEditor(){const M=model(),D=sceneDevices(M.rooms),d=drafts[editing];
    const opts=k=>k==='cover'?[['keep',t('No change')],['open',t('Open|verb')],['close',t('Close')]]
      :[['keep',t('No change')],['on',k==='ac'?t('Turn on (last mode)'):t('Turn on')],['off',t('Turn off')]];
    const device=x=>`<div class="scene-device"><label>${escape(x.name||x.id)}<select data-scene-device="${escape(x.key)}">${opts(x.kind).map(([v,l])=>
      `<option value="${v}"${d[x.key]?.action===v?' selected':''}>${escape(l)}</option>`).join('')}</select></label></div>`;
    $('.scene-editor').innerHTML=`<div class="scene-tabs" role="tablist" aria-label="${escape(t('Scene'))}">${SCENES.map(s=>
        `<button role="tab" data-action="scene-tab" data-id="${s.id}" aria-selected="${s.id===editing}">${icon(s.icon)}<span>${escape(t(s.name))}</span></button>`).join('')}</div>
      <p>${escape(t('Choose an action for each device. “No change” leaves it out of the scene.'))}</p>
      ${M.rooms.map(r=>{const L=D.filter(x=>x.room===r.id);return L.length?`<fieldset><legend>${escape(r.short)}</legend>${L.map(device).join('')}</fieldset>`:'';}).join('')}
      <div class="scene-editor-actions"><button class="all-off primary" data-action="scene-save">${escape(t('Save'))}</button><button class="all-off" data-action="scene-cancel">${escape(t('Cancel'))}</button></div>
      <button class="scene-reset" data-action="scene-reset">${escape(t('Restore default actions'))}</button>`;}
  function openScene(id){if(!drafts[id])drafts[id]=sceneDraft(id,sceneDevices(model().rooms),settings()[id]);
    editing=id;ed.view.setGlow?.([]);render();sceneEditor();$('.sidebar').scrollTop=0;}
  function closeEditor(){editing=null;drafts={};render();$('.sidebar').scrollTop=0;}
  // the plan stores only actions (no “No change”); if they match the defaults — no setting, the scene follows the plan again
  function saveScenes(){const D=sceneDevices(model().rooms),S={...settings()};
    for(const [id,d] of Object.entries(drafts)){const keep=Object.fromEntries(Object.entries(d).filter(([,v])=>v.action!=='keep'));
      if(JSON.stringify(d)===JSON.stringify(sceneDraft(id,D)))delete S[id];else S[id]=keep;}
    if(Object.keys(S).length)ed.plan.scenes=S;else delete ed.plan.scenes;ed.history.save(ed.plan);closeEditor();}
  // running: lights — plan lamps right away, curtains and air conditioners — via HA commands; the result shows under the buttons, stays a while and goes away
  async function runScene(id){if(busy||!SCENES.some(s=>s.id===id))return;
    const out=$('.scene-result'),steps=scenePlan(id,sceneDevices(model().rooms),settings()[id]);
    busy=true;clearTimeout(resultT);out.textContent=t('Sending commands…');render();
    let lights=0;
    const r=await executeScene(steps,async s=>{
      if(s.kind==='light'){const L=ed.plan.lights.find(x=>x.id===s.id);if(!L)return false;if(!haLamp(L))lights++;return lampCmd(L,s.action==='on');}
      if(s.kind==='cover')return call('cover',s.action==='open'?'open_cover':'close_cover',{entity_id:s.id});
      return call('climate',s.action==='on'?'turn_on':'turn_off',{entity_id:s.id});});
    busy=false;if(lights)ed.history.save(ed.plan);if(!on)return;
    out.textContent=[ed.ha?.demo?t('Done'):t('Completed'),r.sent?t('Commands sent: {0}',r.sent):null,r.unchanged?t('Already set: {0}',r.unchanged):null,
      r.skipped?t('Skipped: {0} (unavailable or busy)',r.skipped):null,r.failed?t('Errors: {0}. You can run it again.',r.failed):null].filter(Boolean).join(' · ');
    render();resultT=setTimeout(()=>{out.textContent='';},r.failed?20000:8000);}

  // ---------- room screen — as in 3d_floor/card.js (renderMetrics, renderAC, renderCoverTile, renderLightTile, renderExtras) ----------
  const num=v=>fmtNum(Math.round(v*10)/10,null,{grouping:'auto'});
  function metrics(r,M){const c=M.climate[r.id],ent={temperature:r.sens.t?.entity,humidity:r.sens.h?.entity,co2:r.sens.co2?.entity};
    const card=key=>{if(c[key]==null)return '';const spec=METRICS[key],value=key==='temperature'?num(c[key]):String(c[key]),colour=metricColor(key,c[key]);
      const path=sparkline(hist(ent[key]),{width:160,height:46,pad:4,span:spec.span});
      return `<div class="metric-card ${key==='co2'?'wide':''}" style="--metric:${colour}">
        <div class="metric-top"><span>${escape(t(spec.label))}</span>${icon(spec.icon)}</div>
        <div class="metric-value"><b data-climate="${key}">${escape(value)}</b><small>${escape(spec.unit)}</small></div>
        ${path?`<svg class="metric-graph" viewBox="0 0 160 46" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="metric-fill" d="${path.area}"/><path class="metric-line" d="${path.line}"/></svg>`:''}</div>`;};
    const cards=card('temperature')+card('humidity')+card('co2');if(!cards)return '';
    return `<section class="metrics" aria-label="${escape(t('Climate|indoor'))}: ${escape(r.short)}">${cards}</section>
      <p class="metrics-note">${escape(ed.ha?.demo?t('Demo data · Home Assistant not connected'):t('Home Assistant sensors'))}</p>`;}
  function acs(r){return r.climate.map(d=>{const a=d.a,x=ed.ha.entity(d.id),A=x?.attributes||{};
    return renderAC({id:d.id,name:d.name},{status:a.ok?'available':'unavailable',on:a.on,mode:a.mode,action:a.action,temperature:a.temp,current:a.current,min:a.min,max:a.max,step:a.step,unit:'°C',
      modes:a.modes||[],fans:A.fan_modes||[],fan:a.fan,canTemperature:a.temp!=null&&a.on,canPower:a.ok},false,!!ed.ha?.demo);}).join('');}
  const coverStatus=c=>{const v=c.blind;if(!c.ok)return t('Device unavailable');if(c.moving)return v?t('Raising…'):t('Opening…|plural');
    if(c.pos>=99)return v?t('Raised'):t('Open|plural');if(c.pos<=1)return v?t('Lowered'):t('Closed|plural');return t('{0} % open',Math.round(c.pos));};
  function coverTile(c){const v=c.blind,dis=!c.ok?'disabled':'',live=Math.round(c.pos);
    const button=(command,title,symbol)=>`<button class="cover-btn" data-action="cover" data-id="${escape(c.entity)}" data-command="${command}" title="${escape(title)}" aria-label="${escape(c.name)}: ${escape(title.toLowerCase())}" ${dis}>${icon(symbol)}</button>`;
    return `<div class="tile wide cover-tile ${live>1?'on':''}" style="--tile-accent:rgb(var(--color-green,111,154,130))" data-id="${escape(c.entity)}">
      <div class="tile-head-row"><span class="tile-head"><span class="tile-chip">${icon(v?'blind':'curtain')}</span>
          <span class="tile-text"><strong>${escape(c.name)}</strong><small>${escape(coverStatus(c))}</small></span></span>
        <div class="cover-buttons">${button('open',v?t('Raise'):t('Open|verb'),v?'cover-up':'cover-open')}${button('stop',t('Stop'),'stop')}${button('close',v?t('Lower'):t('Close'),v?'cover-down':'cover-close')}</div></div>
      <div class="bar" style="--level:${live}%"><input type="range" min="0" max="100" step="1" value="${live}" data-cover="${escape(c.entity)}" aria-label="${escape(t('Position'))}: ${escape(c.name)}" ${dis}>
        <span class="bar-value">${live}%</span></div></div>`;}
  const lightTileOf=(l,r)=>`<button class="tile ${l.on?'on':''}" data-action="ltile-lamp" data-id="${escape(l.id)}" aria-pressed="${l.on}" aria-label="${escape(l.name)} — ${escape(r.short)}">
      <span class="tile-chip">${icon(lampIcon(l.form))}</span><span class="tile-text"><strong>${escape(l.name)}</strong><small>${l.on?t('On|entity'):t('Off|entity')}</small></span></button>`;
  // “More in the room”: other area sensors (except service ones and those already shown as badges) and window and door sensors
  function extras(r){const used=new Set([r.sens.t?.entity,r.sens.h?.entity,r.sens.co2?.entity].filter(Boolean)),areas=[ed.plan.rooms.find(x=>x.id===r.id)?.area,ed.plan.rooms.find(x=>x.id===r.id)?.zone?.area].filter(Boolean),C=ed.sensorCtx();
    const reads=C.sensors.filter(s=>areas.includes(s.area)&&!used.has(s.entity)&&!s.cat&&!s.hidden&&(fitsAuto(s)||!isClimate(s))).map(s=>{const v=C.state(s.entity),m=metricOf(s);
      return `<div class="tile"><span class="tile-chip">${icon(READ_IC[s.cls]||'device')}</span><span class="tile-text"><strong>${escape(s.name)}</strong><small>${escape(v==null?'—':m.text(v,s.unit))}</small></span></div>`;});
    const doors=r.dev.contacts.map(c=>`<div class="tile ${c.open?'on':''}" style="--tile-accent:rgb(var(--color-yellow,197,148,75))"><span class="tile-chip">${icon(c.cls==='window'?'window':'door')}</span>
      <span class="tile-text"><strong>${escape(c.name)}</strong><small>${escape(!c.ok?t('Device unavailable'):c.open?t('Open'):t('Closed'))}</small></span></div>`);
    const all=[...doors,...reads];return all.length?`<div class="section-label">${escape(t('More in the room'))}</div><div class="tiles">${all.join('')}</div>`:'';}
  // room screen parts (ROOM_BUILTIN): an empty one is '' (it is not visible; in the settings — “Empty now”)
  const roomParts=(r,M)=>({climate:metrics(r,M),ac:acs(r),covers:r.covers.length?`<div class="tiles">${r.covers.map(coverTile).join('')}</div>`:'',
    lights:r.lamps.length?`<div class="section-label">${escape(t('Lighting'))}</div><div class="tiles">${r.lamps.map(l=>lightTileOf(l,r)).join('')}</div>`:'',extras:extras(r)});
  // by the room layout (room.panel): order, removed parts, “Favorites” — with a caption and tiles, like “Lighting”
  function roomPanel(M){const r=M.rooms.find(x=>x.id===cur());if(!r)return '';const P=roomParts(r,M),all=favItems();
    return layout(r.id).map(c=>{const html=!isFav(c)?P[c.id]:c.entities.length?`<div class="section-label">${escape(c.title||t('Favorites'))}</div><div class="tiles room-fav">${favEntities(c,all).map(favTile).join('')}</div>`:'';
      return html.trim()?`<div class="room-part" data-part="${escape(c.id)}">${html}</div>`:'';}).join('');}

  function strip(M){
    $('.room-strip').innerHTML=M.rooms.map(r=>`<button class="room-chip${cur()===r.id?' selected':''}" data-action="room" data-room="${escape(r.id)}" data-highlight="${escape(r.id)}" aria-pressed="${cur()===r.id}"
      aria-label="${escape(t('Show: {0}',r.name))}">${icon(ROOM_IC[r.kind]||'home')}<span>${escape(r.short)}</span></button>`).join('');
    const n=ed.night?.();
    $('.view-controls').innerHTML=`<button class="icon-btn" data-action="home" title="${escape(t('Whole home'))}" aria-label="${escape(t('Whole home'))}">${icon('home')}</button><div class="divider"></div>
      <button class="icon-btn" data-action="night" title="${escape(t('Day / night'))}" aria-label="${escape(t('Day / night'))}">${icon(n?'moon':'sun')}</button>`;}
  function theme(){const dark=ed.themeName?.()==='dark';host.classList.toggle('on-dark',dark);for(const [k,v] of Object.entries(DARK))dark?host.style.setProperty(k,v):host.style.removeProperty(k);}
  // level: overview — its sections; room — the “← Room ⚙” row (the gear is the room screen settings) and the room screen;
  // scene “Customize” — replaces the overview, with the “← Scene settings ⌂” row
  function navigation(M){const level=nav.current.level==='overview',overview=level&&!editing&&!lay,r=M.rooms.find(x=>x.id===cur()),dev=nav.current.level==='device'&&!editing,stats=nav.current.level==='stats'&&!editing;
    $('.shell').dataset.level=nav.current.level;$('.panel-navigation').hidden=overview;
    $('.panel-path').textContent=lay?(lay.room?t('Layout: {0}',r?.short||''):t('Panel layout')):editing?t('Scene settings'):overview?t('Whole home'):dev?vac.find(v=>v.entity===nav.current.id)?.name||'':stats?t('Statistics'):r?.short||'';
    for(const s of OVERVIEW)$(s).hidden=!overview;$('.room-panel').hidden=level||dev||nav.current.level==='stats'||!!lay;$('.scene-editor').hidden=!editing;$('.stats-view').hidden=!stats;$('.layout-editor').hidden=!lay;$('.layout-tray').hidden=!lay;
    for(const s of $$('.fav-panel'))s.hidden=!overview;
    const gear=nav.current.level==='room'&&!lay&&!editing,end=$('[data-nav-end]');
    if(end.dataset.action!==(gear?'layout-edit':'home')){const l=gear?t('Customize panel'):t('Home overview');
      end.dataset.action=gear?'layout-edit':'home';end.innerHTML=icon(gear?'gear':'home');end.title=gear?l:'';end.setAttribute('aria-label',l);}
    $('.vacuum-panel').hidden=!(overview||dev);} // in the overview — robot rows, on the device screen — just that one

  function render(){if(!on)return;const M=model(),sb=$('.sidebar'),y=sb.scrollTop,active=root.activeElement,
      refocus=active?['action','id','room','step','key','command'].map(k=>active.dataset?.[k]?`[data-${k}="${CSS.escape(active.dataset[k])}"]`:'').join(''):null;
    if(active?.matches?.('input[type=range],select'))return; // a slider is being dragged or a list is open — do not redraw under the user's hand
    syncLights();vac=vacOf(M);theme();navigation(M);const lv=nav.current.level;
    if(!editing&&!lay&&(lv==='overview'||lv==='stats')){energyPrefs();st.src=statsSrc(M);}
    if(editing||lay){}else if(lv==='overview'){const on=new Set(layout().map(c=>c.id));sec=secOf(M);heading(M);weather();nowChips(M);scenes(M);rows(M);tiles(M);watch();vacuums();if(on.has('stats'))statsPanel(M);applyLayout();}
    else if(lv==='device')vacuums();else if(lv==='stats')renderStats(M);else $('.room-panel').innerHTML=roomPanel(M);
    pins(M);strip(M);sb.scrollTop=y;if(refocus)root.querySelector(refocus)?.focus({preventScroll:true});}

  // ---------- actions ----------
  const call=(domain,service,data)=>ed.ha?.call?.(domain,service,data);
  function turn(ids,v){const sent=new Set();let local=false;
    for(const L of ed.plan.lights)if(ids.includes(L.id)){if(haLamp(L)){if(sent.has(L.entity))continue;sent.add(L.entity);}else local=true;lampCmd(L,v);}
    if(local)ed.history.save(ed.plan);render();}
  // a room — the room screen in the panel, the camera flies to it, an outline on the floor (like selectRoom in 3d_floor)
  function selectRoom(id){const r=ed.plan.rooms.find(x=>x.id===id);if(!r)return;dragStop();editing=null;drafts={};lay=null;nav.room(id,ed.view.getView?.());
    ed.view.setGlow?.([]);ed.view.setOutline?.(id);ed.view.focus(r.polygon,{pad:1.25});render();$('.sidebar').scrollTop=0;}
  function goBack(){const e=nav.back();ed.view.setOutline?.(cur());if(e?.camera)ed.view.flyTo?.(e.camera);else ed.view.home();render();$('.sidebar').scrollTop=0;}
  function goHome(){editing=null;drafts={};lay=null;nav.home();ed.view.setOutline?.(null);ed.view.home();render();$('.sidebar').scrollTop=0;}
  // hovering in the overview (and on the room buttons at the bottom — always) — light rises from the floor of those rooms
  const glowAt=(e,anywhere)=>{if(flashT)return;const h=e.target.closest?.('[data-highlight]');ed.view.setGlow?.(h&&(anywhere||['overview','stats'].includes(nav.current.level))?h.dataset.highlight.split(' ').filter(Boolean):[]);};
  root.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;glowAt(e,!!e.target.closest?.('.room-strip'));});
  root.addEventListener('pointerout',e=>{if(!e.relatedTarget||!root.contains(e.relatedTarget)){if(!flashT)ed.view.setGlow?.([]);}
    if(nav.current.level==='stats'&&!e.relatedTarget?.closest?.('.stats-view [data-chart]'))statsPointer(null);});
  root.addEventListener('pointermove',e=>{if(nav.current.level==='stats'&&e.target.closest?.('.stats-view'))statsPointer(e);});
  root.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const {action:a,id,room}=b.dataset;
    if(a==='room')selectRoom(room);
    else if(a==='back'){if(lay)closeLayout();else if(editing)closeEditor();else goBack();}
    else if(a==='layout-edit')openLayout();
    else if(a==='layout-save')saveLayout();
    else if(a==='layout-cancel')closeLayout();
    else if(a==='layout-reset'){lay.cards=resolveLayout(null,lay.builtin);layoutEditor();}
    else if(a==='layout-remove'){lay.cards=lay.cards.filter(c=>c.id!==id);layoutEditor();}
    else if(a==='tile-remove'){lay.cards=removeEntity(lay.cards,id,b.dataset.from);layoutEditor();}
    else if(a==='tray-add'){lay.cards=[...lay.cards,id==='entities'?newFav(lay.cards,t('Favorites')):{id}];layoutEditor();$('.sidebar').scrollTop=$('.sidebar').scrollHeight;}
    else if(a==='tray-add-entity'){lay.cards=addEntity(lay.cards,id,t('Favorites'));layoutEditor();}
    else if(a==='fav')favPress(id,b);
    else if(a==='scene-run')runScene(id);
    else if(a==='scene-edit'){if(!busy){drafts={};openScene(SCENES[0].id);}}
    else if(a==='scene-tab')openScene(id);
    else if(a==='scene-save')saveScenes();
    else if(a==='scene-cancel')closeEditor();
    else if(a==='scene-reset'){drafts[editing]=sceneDraft(editing,sceneDevices(model().rooms));sceneEditor();}
    else if(a==='home')goHome();
    else if(a==='night'){ed.toggleNight?.();render();}
    else if(a==='all-off')turn(model().rooms.flatMap(r=>r.lamps.filter(l=>l.on).map(l=>l.id)),false);
    else if(a==='ltile-lamp'){const L=ed.plan.lights.find(x=>x.id===id);if(L)turn([id],!lampState(id).on);}
    else if(a==='ltile-power'){const p=model().rooms.find(x=>x.id===room)?.light?.power;if(p)turn(p.ids,p.on);}
    else if(a==='ctile-power'){const x=ed.ha.entity(id);call('climate',x?.state==='off'?'turn_on':'turn_off',{entity_id:id});}
    else if(a==='ctile-step'){const v=acView(ed.ha.entity(id));if(v.on&&v.temp!=null)call('climate','set_temperature',{entity_id:id,temperature:Math.max(v.min,Math.min(v.max,v.temp+v.step*(+b.dataset.step)))});}
    else if(a==='ac'){const v=acView(ed.ha.entity(id)),c=b.dataset.command;
      if(c==='power')call('climate',v.on?'turn_off':'turn_on',{entity_id:id});
      else if(v.temp!=null)call('climate','set_temperature',{entity_id:id,temperature:Math.max(v.min,Math.min(v.max,v.temp+v.step*(c==='increase'?1:-1)))});}
    else if(a==='covers-toggle'){const C=model().rooms.find(x=>x.id===room)?.covers.filter(c=>c.ok)||[],open=C.some(c=>c.pos>1);
      for(const c of C)call('cover',open?'close_cover':'open_cover',{entity_id:c.entity});}
    else if(a==='cover')call('cover',{open:'open_cover',close:'close_cover',stop:'stop_cover'}[b.dataset.command],{entity_id:id});
    else if(a==='water')waterPress(id);
    else if(a==='vacuum-open')openVacuum(id);
    else if(a==='stats-open')openStats(b.dataset.section);
    else if(a==='stats-section'){if(id!==st.section){st.section=id;st.room=null;render();}}
    else if(a==='stats-period'){if(id!==st.period){st.period=id;render();}}
    else if(a==='stats-room'){st.room=st.room===room?null:room;render();}
    else if(a==='vacuum-start')vacuumPress(id,b.dataset.command||'start');
    else if(a==='vacuum-home')vacuumPress(id,'home');
    else if(a==='leak'){if(!ed.ha?.demo&&ed.ha?.moreInfo)ed.ha.moreInfo(id);else if(b.dataset.highlight)flash([b.dataset.highlight]);}
    else if(a==='cam-open'){if(ed.ha?.demo)openCameraPreview(root,sec.camera?.name);else ed.ha?.moreInfo?.(id);}
    else if(a==='now-chip'){const c=chips.find(x=>x.key===b.dataset.key);if(!c)return;
      // shut-off water — show the valve tile; a triggered sensor — its card in HA (in the demo — the room)
      if(c.key==='water'){const tl=$('.water-tile');if(!tl)return;tl.scrollIntoView({block:'nearest',behavior:'smooth'});tl.classList.remove('flash');void tl.offsetWidth;tl.classList.add('flash');return;}
      if(c.key.startsWith('alert:')&&!ed.ha?.demo&&ed.ha?.moreInfo){ed.ha.moreInfo(c.devices[0].id);return;}
      if(c.key==='vacuum'){openVacuum(c.devices[0].id);return;}
      if(c.rooms.length===1)selectRoom(c.rooms[0]);
      else if(c.rooms.length)flash(c.rooms);}});
  // curtain slider: the bar and percentage update right away, the command is sent on release
  root.addEventListener('input',e=>{
    // “Favorites”: the title goes into the draft right away, search hides non-matching rows
    if(lay&&e.target.matches?.('[data-fav-title]')){const c=lay.cards.find(x=>x.id===e.target.dataset.favTitle);if(c)c.title=e.target.value;return;}
    if(lay&&e.target.matches?.('[data-tray-search]')){lay.q=e.target.value;filterTray();return;}
    const i=e.target.closest?.('input[data-cover]');if(!i)return;const bar=i.closest('.bar');bar.style.setProperty('--level',i.value+'%');bar.querySelector('.bar-value').textContent=i.value+'%';});
  root.addEventListener('change',e=>{const i=e.target;
    if(i.matches?.('select[data-scene-device]')){if(editing)drafts[editing][i.dataset.sceneDevice]={action:i.value};}
    else if(i.matches?.('input[data-cover]')){call('cover','set_cover_position',{entity_id:i.dataset.cover,position:+i.value});i.blur();}
    else if(i.matches?.('select[data-ac]')){const f=i.dataset.acField;call('climate',f==='mode'?'set_hvac_mode':'set_fan_mode',{entity_id:i.dataset.ac,[f==='mode'?'hvac_mode':'fan_mode']:i.value});i.blur();}});

  return {
    // the weather shifts with the clock (forecast cells, sunrise and sunset) — once a minute while the overview is visible
    open(){if(on)return;on=true;nav.home();host.hidden=false;shown.clear();st.tile=st.html='';unsub=ed.ha?.onState?.(render)||null;render();
      wxT=setInterval(()=>{if(on&&nav.current.level==='overview'&&!editing)weather();},60e3);
      camT=setInterval(camera,ed.ha?.demo?2000:10000);},
    close(){if(!on)return;on=false;host.hidden=true;unsub?.();unsub=null;clearTimeout(flashT);flashT=0;clearInterval(wxT);clearInterval(camT);clearTimeout(askT);ask=null;root.querySelector('.camera-dialog')?.close();clearTimeout(resultT);$('.scene-result').textContent='';
      editing=null;drafts={};nav.home();ed.view.setOutline?.(null);ed.view.setGlow?.([]);cancelAnimationFrame(st.raf);st.raf=0;st.room=null;st.pinHtml='';$('.pins').innerHTML='';dragStop();lay=null;},
    esc(){if(dnd){dragStop();return true;}if(lay){closeLayout();return true;}if(editing){closeEditor();return true;}if(nav.current.level!=='overview'){goBack();return true;}return false;},
    // what covers the 3D: the glass panel on the right (landscape screen) or the panel below the model (narrow, portrait)
    insets(){if(!on)return {right:0,bottom:0};const sb=$('.sidebar'),map=$('.map-card'),hr=host.getBoundingClientRect();
      if(getComputedStyle(sb).position==='absolute')return {right:sb.offsetWidth,bottom:0};const mr=map.getBoundingClientRect();return {right:0,bottom:Math.max(0,hr.bottom-mr.bottom)};},
    width(){return this.insets().right;},
    refresh:render,
  };
}
