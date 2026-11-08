// The home overview for “Preview” and the future card (D-015, D-047): per room, an icon, climate and lights. Data only.
// Weather, scenes, air conditioners, curtains and charts will be added once they appear in the HA layer (editor/ha.js).
import {METRICS,pickAuto} from './sensors.js';
import {formFor} from './fixtures.js';
import {BATH} from './surfaces.js';
import {deviceKind,acView,coverView,contactView,coverModel} from './devices.js';

// The room kind from its name, for the icon; in the ten UI languages (D-036). Order matters: a “kids bedroom” is a kids' room,
// a “kitchen-living room” is a kitchen.
const KINDS=[
  ['bath',BATH],
  ['kids',/детск|kid|child|nursery|kinder|enfant|niñ|infantil|bambin|cameretta|dziec|criança|infantil|儿童/],
  ['bed',/спальн|bedroom|schlaf|chambre|dormitorio|camera da letto|slaapkamer|sypialn|quarto|卧室/],
  ['kitchen',/кухн|kitchen|küche|cuisine|cocina|cucina|keuken|kuchni|cozinha|厨房/],
  ['living',/гостин|living|зал|wohnzimmer|salon|séjour|woonkamer|sala|soggiorno|salotto|pokój dzienny|客厅/],
  ['hall',/коридор|прихож|холл|hall|corridor|flur|diele|entrée|couloir|pasillo|recibidor|corridoio|ingresso|\bgang\b|korytarz|przedpok|corredor|走廊|玄关/],
  ['balcony',/балкон|лодж|террас|balcon|balkon|loggia|terras|varanda|sacada|panorama|阳台/],
  ['office',/кабинет|office|study|büro|arbeitszimmer|bureau|despacho|oficina|studio|kantoor|gabinet|escritório|书房/],
  ['storage',/кладов|гардероб|storage|pantry|closet|abstell|cellier|despensa|ripostiglio|berging|spiżarn|储藏/],
];
export const roomKind=(...names)=>{const s=names.filter(Boolean).join(' ').toLowerCase();return KINDS.find(([,re])=>re.test(s))?.[0]||'room';};

// Room climate: each quantity comes from the sensor the user placed on this room's wall, otherwise from the best sensor of its
// area (like the suggestion in “Sensors”, pickAuto). No sensor or no number: no quantity.
// → {t?, h?, co2?: {entity, v, text, lvl}}
export function roomClimate(plan,r,ctx){const out={};
  const own=(plan.sensors||[]).filter(S=>S.room===r.id).map(S=>ctx.sensors.find(s=>s.entity===S.entity)).filter(Boolean);
  for(const m of METRICS){if(m.off)continue;
    const s=own.find(s=>s.cls===m.cls)||[r.area,r.zone?.area].filter(Boolean).map(a=>pickAuto(m,a,ctx)).find(Boolean);
    const v=s?ctx.state(s.entity):null;if(v==null)continue;
    out[m.k]={entity:s.entity,v,text:m.text(v,s.unit),lvl:m.lvl(v)};}
  return out;}

// Overview rooms, in plan order: named ones or ones with an area, except solid ones (shaft, column).
// Lights: placed on the plan and confirmed; a part of another fixture (with) is not shown separately.
// The devices of the room's area (D-048) come from HA, whether or not they are in the model: air conditioners and thermostats, covers, contact sensors.
// → {acs:[{entity, title: the appliance name, kind: ac | heat, ...acView (name: the mode)}], covers:[{entity, name, blind, ...coverView}], contacts:[{entity, name, cls, ...contactView}]}
export function roomDevices(r,ha){const out={acs:[],covers:[],contacts:[]};if(!ha?.devices)return out;const areas=[r.area,r.zone?.area].filter(Boolean);
  for(const d of ha.devices()){if(!areas.includes(d.area))continue;const x=ha.entity(d.entity),k=deviceKind(d,x),base={entity:d.entity,name:d.name||d.entity};
    // acView's name is the mode (“Heat”), title is the appliance
    if(k==='ac'||k==='heat')out.acs.push({...base,kind:k,...acView(x),title:base.name});
    else if(k==='cover')out.covers.push({...base,blind:coverModel(d)==='blind',...coverView(x)});
    else if(k==='contact')out.contacts.push({...base,cls:d.cls,...contactView(x)});}
  const nat=(a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true});out.covers.sort(nat);return out;}

// ctx is the same as for sensors ({sensors, areas, state}); areaName(id) is the HA area name if the room has none of its own; ha is the HA layer (devices).
// → [{id, name, kind, poly, climate, lamps:[{id, name, form, on}], lit, dev:{acs, covers, contacts}}]
export function overview(plan,ctx,areaName=id=>id,ha=null){
  return plan.rooms.filter(r=>!r.solid&&(r.name||r.area)).map(r=>{
    const name=r.name||areaName(r.area)||'';
    const lamps=plan.lights.filter(L=>L.placed&&!L.draft&&!L.skip&&!L.with&&L.room===r.id).map(L=>({id:L.id,name:L.name||'',form:formFor(L),on:L.on!==false}));
    return {id:r.id,name,kind:roomKind(name,r.area,r.id),poly:r.polygon,climate:roomClimate(plan,r,ctx),lamps,lit:lamps.filter(l=>l.on).length,dev:roomDevices(r,ha)};});
}

// Home temperature: from the coldest room to the warmest → [min, max] or null.
export function homeRange(rooms){const ts=rooms.map(r=>r.climate.t?.v).filter(v=>v!=null);
  return ts.length?[Math.min(...ts),Math.max(...ts)]:null;}

// The room power button: if anything is on, turn everything off, otherwise turn everything on. → {on, ids}
export function roomPower(lamps){const on=!lamps.some(l=>l.on);return {on,ids:lamps.map(l=>l.id)};}
