// Editor startup — shared by the standalone app (main.js: demo data, plan in the browser) and the Home Assistant panel
// (ha-app.js: real HA, plan in HA). The language is already set (i18n/boot.js), the shell markup is in the document.
//   ha     — the HA layer (editor/ha.js: mockHA or ha-live.js)
//   demo, demoUnderlay — the demo apartment from the start screen; absent — no “Demo home” button
//   plans  — where else the plan is stored: {load(local) → Promise<{plan, rev}>, save(plan)}; absent — browser only
//   photos — where the plan photo is kept (underlay.js: browserPhotos — the default, ha-live.js: hassPhotos)
//   onApp(ed) — right after the editor is created, before the first plan
//   dev    — the test panel (standalone app on localhost only)
import {createApp} from './editor/app.js';
import {createFlows} from './editor/flows.js';
import {devPanel} from './editor/devpanel.js';
import {translateDom} from './i18n/i18n.js';
import {loadKenney,thumbnails} from './core/furniture3d.js';
import {MODELS} from './gen/models.gen.js';

export async function boot({ha,demo=null,demoUnderlay=null,plans=null,photos=undefined,onApp=null,dev=false}){
  // An HA light group (it has a member list) whose lamps are also in the list is not placed on the plan — the lamps themselves are.
  const haLights=()=>{const all=ha.lights(),ids=new Set(all.map(l=>l.entity));
    return all.filter(l=>!l.members?.some(id=>ids.has(id))).map(l=>({...l,on:true,placed:false,points:[],segments:[],room:null}));};
  translateDom(document.body); // static markup — in the user's language
  const ed=createApp({haLights,ha,photos});
  onApp?.(ed);
  const flows=createFlows(ed,{demo,demoUnderlay});
  ed.flows=flows;
  await loadKenney(MODELS);
  ed.thumbs=thumbnails();
  // plan: from HA (if available), otherwise the one saved in the browser; every browser save is sent there too
  // (plans.load gets the browser's plan: changes that did not reach HA last time — no connection — are not lost)
  let saved=null;
  if(plans){try{saved=(await plans.load(ed.history.load()))?.plan||null;}catch{}const local=ed.history.save;ed.history.save=p=>{plans.save(p);return local(p);};}
  saved??=ed.history.load();
  const canContinue=!!(saved&&Array.isArray(saved.rooms));
  if(canContinue){await ed.underlay.load();if(!saved.rooms?.length)ed.wizard.set(saved.id,{open:false,names:false});ed.setPlan(saved);}
  else ed.setPlan({});
  // undo steps from last time come from storage; the plan as it was at the end of last time becomes a version (if there is no such one yet)
  await ed.history.ready;await ed.versions.ready();ed.versions.mark('auto',null,{at:ed.history.lastAt()});
  flows.resume(); // the “Furniture”, “Lights”, “Devices”, “Sensors” steps — in their own mode
  flows.showStart({canContinue});
  if(dev)devPanel(ed,flows);
  window.editor={ed,flows};
  document.body.dataset.ready='true';
  return ed;
}
