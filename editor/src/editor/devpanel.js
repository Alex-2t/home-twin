// Test panel — localhost only. A snapshot is the plan plus the plan photo (underlay); each wizard step has its own snapshot.
// “Save” puts the current state into the current step's snapshot (after a reload the step is guessed from the plan:
// lamps on the plan — “Lights”, HA links — “HA areas”, windows or doors — “Windows & doors”, rooms — “Split”).
// The list shows saved snapshots only. “→ Step” opens that step's own snapshot.
// After restoring, the project is like a new one (its own id):
// hints like “Shaft or column?” show again. Stored in the browser (IndexedDB), never sent anywhere.
// The trash button is always visible to the right of each snapshot; it deletes on the second click.
import {idb} from './underlay.js';
import {el,esc} from './ui.js';
import {icon} from './icons.js';
import {emptyPlan} from '../core/plan.js';

const STEPS=[['rect','Rectangle'],['split','Split'],['open','Windows & doors'],['names','HA areas'],['furniture','Furniture'],['lights','Lights']];
const KEY='home-twin-editor:dev';
const nameOf=k=>STEPS.find(s=>s[0]===k)?.[1]||k;
export function devPanel(ed,flows){
  if(!['localhost','127.0.0.1'].includes(location.hostname))return;
  const box=el(`<div class="dev glass"><b>Test</b></div>`),save=el(`<button class="soft">Save</button>`);
  box.append(save);document.body.append(box);
  // the previous panel version stored a single snapshot ('snap', time as a number) — treat it as the “Split” snapshot
  const index=()=>{const v=localStorage.getItem(KEY);if(!v)return {};if(/^\d+$/.test(v))return {split:+v,legacy:true};try{return JSON.parse(v);}catch{return {};}};
  const time=t=>new Date(t).toLocaleString('en',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  const phase=()=>{if(ed.modes.lights.wizardOn?.())return 'lights';if(ed.modes.furniture.wizardOn?.())return 'furniture';const w=ed.modes.rooms.wizardPhase?.();if(w)return w;const p=ed.plan;
    return p.lights.some(l=>l.placed)?'lights':p.rooms.some(r=>r.area)?'names':p.openings.length?'open':p.rooms.length?'split':'rect';};
  const keyOf=(s,ix=index())=>s==='split'&&ix.legacy?'snap':'snap:'+s;
  function render(){const ix=index(),ph=phase();save.textContent=`Save: ${nameOf(ph)}`;save.title=`Save the plan and photo as the “${nameOf(ph)}” step snapshot`;
    box.style.width='';box.querySelectorAll('[data-step]').forEach(b=>b.remove());
    for(const [k,name] of STEPS){if(!ix[k])continue;
      const row=el(`<div class="row" data-step="${k}"></div>`),b=el(`<button class="soft go" title="“${esc(nameOf(k))}” snapshot from ${esc(time(ix[k]))}">→ ${name}</button>`);
      b.onclick=()=>restore(k);row.append(b);
      // a step's own snapshot can be deleted: the first click shows “Delete?”, the second deletes; moving the mouse away cancels
      {const d=el(`<button class="soft del" title="Delete the “${esc(name)}” snapshot">${icon('trash',13)}</button>`);
        d.onclick=async()=>{if(!row.classList.contains('sure')){box.style.width=box.offsetWidth+'px';row.classList.add('sure');b.textContent='Delete?';return;}await drop(k);};
        row.onmouseleave=()=>{if(row.classList.contains('sure'))render();};row.append(d);}
      box.append(row);}}
  async function drop(k){let ix=index();await idb('del',keyOf(k,ix)).catch(()=>{});if(k==='split'&&ix.legacy)ix={};else delete ix[k];
    Object.keys(ix).length?localStorage.setItem(KEY,JSON.stringify(ix)):localStorage.removeItem(KEY);render();}
  box.addEventListener('pointerenter',render);
  // the step changes on the fly — the “Save: …” label updates once a second (except while showing “Saved”)
  let busy=false;setInterval(()=>{if(busy)return;const ph=phase();save.textContent=`Save: ${nameOf(ph)}`;save.title=`Save the plan and photo as the “${nameOf(ph)}” step snapshot`;},1000);
  save.onclick=async()=>{const u=ed.underlay,ph=phase();
    const snap={plan:structuredClone(ed.plan),underlay:u.ready&&u.src?{src:u.src,a:u.a,b:u.b,opacity:u.opacity,visible:u.visible}:null};
    let ix=index();if(ix.legacy){const old=await idb('get','snap').catch(()=>null);if(old)await idb('put','snap:split',old);delete ix.legacy;}
    await idb('put','snap:'+ph,snap);ix={...ix,[ph]:Date.now()};localStorage.setItem(KEY,JSON.stringify(ix));render();
    busy=true;save.textContent='Saved';setTimeout(()=>{busy=false;render();},1200);};
  async function restore(step){if(!index()[step])return;const snap=await idb('get',keyOf(step)).catch(()=>null);if(!snap)return;
    flows.hideStart();ed.step(null);const u=ed.underlay,s=snap.underlay;
    if(s){await u.set(s.src,{place:()=>{u.a=s.a;u.b=s.b;}});Object.assign(u,{opacity:s.opacity,visible:s.visible});u.save();}else await u.clear();
    const plan=step==='rect'?{...emptyPlan(),wall:snap.plan.wall}:structuredClone(snap.plan);delete plan.id; // as a new project
    ed.setMain?.('plan');ed.setPlan(plan);ed.setMode('rooms');ed.modes.rooms.wizardAt(step);
    if(step==='rect'&&s)ed.fit?.();render();}
  render();
}
