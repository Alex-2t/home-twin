// HA layer on a real Home Assistant (the Home Twin panel). The same interface as mockHA (editor/ha.js describes each
// method), only built from the hass object that HA hands to the panel and replaces with a new one on every event:
//   registries — hass.areas / hass.entities / hass.devices (changed — onChange), states — hass.states (changed —
//   onState; events within a frame are merged into one: in a home they come constantly). History, statistics, energy — callWS, the answer comes later.
// An entity's area is its own or its device's. Setting the area: HA 2026.11 does not allow it for an entity without its own name
// (“set the area on its device instead”) — then it goes to the device.
const HOUR=3600e3;
const num=s=>s==null||s===''||s==='unknown'||s==='unavailable'?NaN:Number(s);
const SENSOR_DEVICE=new Set(['door','window','garage_door','opening','moisture']); // binary_sensor for the model and “Security”
const iso=ms=>new Date(ms).toISOString();

export function liveHA(initial){
  let hass=initial,raf=0;const subs=new Set(),ssubs=new Set(),hist=new Map(),forecast=new Map(),fsubs=new Map();
  const reg=e=>hass.entities?.[e]||null;
  const devOf=r=>r?.device_id?hass.devices?.[r.device_id]||null:null;
  const areaOf=e=>{const r=reg(e);return r?.area_id||devOf(r)?.area_id||null;};
  const nameOf=e=>hass.states[e]?.attributes?.friendly_name||reg(e)?.name||e;
  // hidden and service ones (config, diagnostic) are not shown; an entity without a registry entry (from YAML) is shown
  const shown=e=>{const r=reg(e);return !r||(!r.hidden&&!r.entity_category);};
  const ofDomain=d=>Object.keys(hass.states).filter(e=>e.startsWith(d+'.')).sort();
  const pulse=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;ssubs.forEach(f=>f());});};
  const ws=msg=>hass.callWS(msg);

  // sensor history for 3 hours: 36 points 5 minutes apart, the last one is now; between records — the last value.
  // Drawn right away (whatever there is), one request per sensor every 5 minutes; when the answer arrives — redraw (onState)
  async function loadHistory(e,c){c.busy=true;c.at=Date.now();
    try{const end=Date.now(),start=end-3*HOUR;
      const r=await ws({type:'history/history_during_period',start_time:iso(start),end_time:iso(end),entity_ids:[e],minimal_response:true,no_attributes:true,include_start_time_state:true,significant_changes_only:false});
      const pts=(r?.[e]||[]).map(x=>[(x.lu??Date.parse(x.last_updated)/1000)*1000,num(x.s??x.state)]).filter(p=>Number.isFinite(p[1]));
      const out=[];let j=0,v=null;for(let i=0;i<36;i++){const t=start+(i+1)*5*60e3;while(j<pts.length&&pts[j][0]<=t){v=pts[j][1];j++;}if(v!=null)out.push(v);}
      c.data=out;}catch{c.data=[];}finally{c.busy=false;}
    pulse();}
  // hourly forecast — a weather/subscribe_forecast subscription, one per entity
  function watchForecast(e){if(fsubs.has(e)||!hass.connection)return;fsubs.set(e,null);
    hass.connection.subscribeMessage(m=>{forecast.set(e,(m?.forecast||[]).map(f=>({at:Date.parse(f.datetime),condition:f.condition,temperature:f.temperature})));pulse();},
      {type:'weather/subscribe_forecast',entity_id:e,forecast_type:'hourly'}).then(u=>fsubs.set(e,u)).catch(()=>{});}
  const weatherEntity=()=>{const all=ofDomain('weather').filter(shown);if(!all.length)return null;
    const home=hass.config?.location_name?.toLowerCase().replace(/[^a-z0-9]+/g,'_');return all.find(e=>e==='weather.home'||home&&e==='weather.'+home)||all.find(e=>reg(e)?.platform==='met')||all[0];};

  const ha={
    demo:false,
    // registries are loaded: before that an empty area list does not mean “areas were deleted” (app.js: syncAreas)
    ready:()=>!!hass.areas&&!!hass.entities,
    update(h){const p=hass;hass=h;
      if(h.areas!==p.areas||h.entities!==p.entities||h.devices!==p.devices)subs.forEach(f=>f());
      if(h.states!==p.states)pulse();},
    areas:()=>Object.values(hass.areas||{}).map(a=>({area_id:a.area_id,name:a.name,temperature_entity_id:a.temperature_entity_id||null,humidity_entity_id:a.humidity_entity_id||null}))
      .sort((a,b)=>a.name.localeCompare(b.name)),
    lights:()=>ofDomain('light').filter(shown).map(e=>{const m=hass.states[e].attributes.entity_id;
      return {id:e.slice(6),entity:e,name:nameOf(e),area:areaOf(e),color:'#ffce87',...(Array.isArray(m)?{members:m}:{})};}),
    switches:()=>ofDomain('switch').filter(shown).filter(areaOf).map(e=>({entity:e,name:nameOf(e),area:areaOf(e)})),
    sensors:()=>ofDomain('sensor').map(e=>{const A=hass.states[e].attributes,r=reg(e);
      return {entity:e,name:nameOf(e),area:areaOf(e),device:r?.device_id||null,cls:A.device_class||null,unit:A.unit_of_measurement||null,cat:r?.entity_category||null,hidden:!!r?.hidden};})
      .filter(x=>x.cls!=='timestamp'&&(x.unit!=null||Number.isFinite(num(hass.states[x.entity].state)))),
    state:e=>{const v=num(hass.states[e]?.state);return Number.isFinite(v)?v:null;},
    entity:e=>hass.states[e]||null,
    onState:f=>{ssubs.add(f);return ()=>ssubs.delete(f);},
    onChange:f=>{subs.add(f);return ()=>subs.delete(f);},
    history:e=>{let c=hist.get(e);if(!c){c={at:0,data:[],busy:false};hist.set(e,c);}if(!c.busy&&Date.now()-c.at>5*60e3)loadHistory(e,c);return c.data;},
    weather:()=>{const e=weatherEntity();if(!e)return null;watchForecast(e);const s=hass.states[e],A=s.attributes,sun=hass.states['sun.sun']?.attributes||{};
      return {entity:e,condition:s.state,temperature:A.temperature??null,feels:A.apparent_temperature??null,hourly:forecast.get(e)||[],
        sunrise:Date.parse(sun.next_rising)||null,sunset:Date.parse(sun.next_setting)||null};},
    statistics:(ids,{start,end,period,types})=>ids.length?ws({type:'recorder/statistics_during_period',start_time:iso(start),end_time:iso(end),statistic_ids:ids,period,types,units:{energy:'kWh'}})
      .then(r=>Object.fromEntries(Object.entries(r||{}).map(([k,L])=>[k,L.map(x=>({...x,start:typeof x.start==='number'?x.start:Date.parse(x.start),end:typeof x.end==='number'?x.end:Date.parse(x.end)}))]))):Promise.resolve({}),
    stateHistory:(ids,{start,end})=>ids.length?ws({type:'history/history_during_period',start_time:iso(start),end_time:iso(end),entity_ids:ids,minimal_response:true,no_attributes:true,include_start_time_state:true,significant_changes_only:false})
      .then(r=>Object.fromEntries(Object.entries(r||{}).map(([k,L])=>[k,L.map(x=>({s:x.s??x.state,lu:x.lu??Date.parse(x.last_updated)/1000}))]))):Promise.resolve({}),
    energy:()=>ws({type:'energy/get_prefs'}).then(p=>({grid:(p.energy_sources||[]).filter(s=>s.type==='grid').flatMap(s=>(s.flow_from||[]).map(f=>f.stat_energy_from)).filter(Boolean),
      devices:(p.device_consumption||[]).map(d=>({statistic:d.stat_consumption,name:d.name||undefined,parent:d.included_in_stat||undefined}))})).catch(()=>null),
    devices:()=>Object.keys(hass.states).sort().flatMap(e=>{const d=e.split('.')[0],A=hass.states[e].attributes,cls=A.device_class||null;
      if(!shown(e)||!(['climate','cover','camera','valve','vacuum'].includes(d)||d==='binary_sensor'&&SENSOR_DEVICE.has(cls)))return [];
      const x={entity:e,name:nameOf(e),area:areaOf(e),domain:d,cls};
      // leak sensor: charge and “battery low” are entities of the same device
      if(cls==='moisture'&&reg(e)?.device_id){const sib=Object.values(hass.entities).filter(o=>o.device_id===reg(e).device_id&&o.entity_id!==e),bc=o=>hass.states[o.entity_id]?.attributes.device_class==='battery';
        const b=sib.find(o=>o.entity_id.startsWith('sensor.')&&bc(o)),low=sib.find(o=>o.entity_id.startsWith('binary_sensor.')&&bc(o));if(b)x.battery=b.entity_id;if(low)x.low=low.entity_id;}
      return [x];}),
    entities:()=>Object.keys(hass.states).filter(shown).sort().map(e=>{const A=hass.states[e].attributes;
      return {entity:e,name:nameOf(e),area:areaOf(e),domain:e.split('.')[0],...(A.device_class?{cls:A.device_class}:{}),...(A.unit_of_measurement?{unit:A.unit_of_measurement}:{})};}),
    call:(domain,service,data={})=>hass.callService(domain,service,data).then(()=>true,()=>false),
    identify:e=>hass.callService('light','turn_on',{entity_id:e,flash:'short'}).then(()=>e,()=>e),
    setArea:async(e,area)=>{try{await ws({type:'config/entity_registry/update',entity_id:e,area_id:area});}
      catch(err){const d=reg(e)?.device_id;if(err?.code!=='invalid_info'||!d)throw err;await ws({type:'config/device_registry/update',device_id:d,area_id:area});}},
    // the entity card — via an event on the HA root (the panel is in an iframe of the same origin: the parent document is accessible)
    moreInfo:e=>{let root=null;try{root=window.parent!==window?window.parent.document.querySelector('home-assistant'):null;}catch{}
      (root||document.body).dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:e},bubbles:true,composed:true}));},
    url:path=>hass.hassUrl?hass.hassUrl(path):path,
    areasUrl:'/config/areas/dashboard',
    devicesUrl:'/config/devices/dashboard',
  };
  return ha;
}

// The plan in HA (the home_twin integration): read at startup, written with a delay after edits. rev — the revision the plan
// was changed from: if it was changed in another window, HA does not write (conflict) and reports onConflict; keepMine — write ours on top.
export function hassPlans(getHass,{onConflict}={}){
  let rev=null,timer=0,want=null,sending=false,stop=false;
  async function send(force=false){if(sending||!want)return;sending=true;const plan=want;want=null;
    try{const r=await getHass().callWS({type:'home_twin/plan/save',plan,...(force||rev==null?{}:{rev})});rev=r.rev;}
    catch(e){want??=plan;if(e?.code==='conflict'){stop=true;onConflict?.();}else setTimeout(()=>{if(!stop)send();},5000);}
    finally{sending=false;if(want&&!stop)schedule();}}
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>send(),700);};
  return {
    load:async()=>{const r=await getHass().callWS({type:'home_twin/plan/get'});rev=r.rev;return r;},
    save:p=>{want=p;if(!stop)schedule();},
    keepMine:()=>{stop=false;send(true);},
    flush:()=>{clearTimeout(timer);return send();},
  };
}
