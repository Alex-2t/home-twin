// Sensor readings on walls (D-033): large digits painted on a free spot of a wall, with no backing.
// The user decides what to show, as with lights: the “Sensors” mode, each sensor has its own spot (plan.sensors:
// [{id, entity, room, at?, label?, k?, under?, sc?}]; at is the point on the wall where it was placed (sc is the squeeze it was pinned with); without it the spot is automatic, next to the room's other
// sensors; label is a custom caption; k is the digit size, 1 is normal).
// A climate sensor without an area (or whose area is not on the plan): we ask which room it is in (orphans), as with lights. We suggest (recommend) only room climate (temperature, humidity, CO₂): an HA user has hundreds of numeric
// sensors (battery, signal, power, chip temperature). The sensor for a suggestion is chosen as the
// HA area card does it: the area's own sensor from its settings (temperature_entity_id, humidity_entity_id), otherwise
// the area's sensors excluding diagnostic, hidden and “not room air” ones; out of several, the one whose device measures
// several quantities (a climate sensor) and has a plausible value.
import {t,num} from '../i18n/i18n.js';
import {WALL,area} from './geometry.js';
import {zOf} from './catalog.js';
import {formFor} from './fixtures.js';

const dec=(v,d)=>num(v,d); // per language: 23,1 or 23.1
const toC=(v,u)=>u==='°F'?(v-32)/1.8:u==='K'?v-273.15:v;
// lvl: 0 is normal, 1 is attention, 2 is bad. CO₂: Umweltbundesamt: up to 1000 ppm is normal, 1000–2000 means ventilate, above is bad.
// Humidity: ASHRAE: 30–60%. PM2.5: WHO, 24 h: 15 µg/m³; above 35 (EPA, 24 h) is bad. Temperature is not rated.
export const METRICS=[
  {k:'t',cls:'temperature',label:t('TEMP.'),name:t('Temperature'),area:'temperature_entity_id',text:v=>dec(v,1)+'°',sane:(v,u)=>{const c=toC(v,u);return c>8&&c<40;},lvl:()=>0},
  {k:'h',cls:'humidity',label:t('HUM.'),name:t('Humidity'),area:'humidity_entity_id',text:v=>Math.round(v)+'%',sane:v=>v>0&&v<=100,lvl:v=>v<30||v>60?1:0},
  {k:'co2',cls:'carbon_dioxide',label:'CO₂, PPM',name:'CO₂',text:v=>String(Math.round(v)),sane:v=>v>=300&&v<10000,lvl:v=>v>=2000?2:v>=1000?1:0},
  {k:'pm',cls:'pm25',label:'PM2.5',name:'PM2.5',text:v=>String(Math.round(v)),sane:v=>v>=0&&v<1000,lvl:v=>v>35?2:v>15?1:0,off:true},
];
const CLASSES=new Set(METRICS.map(m=>m.cls));
export const isClimate=s=>CLASSES.has(s.cls);
// other numeric sensors: a caption from the sensor class, the number with its unit
const GEN={power:t('POWER'),energy:t('ENERGY'),illuminance:t('LIGHT'),sound_pressure:t('NOISE'),pressure:t('PRESSURE'),atmospheric_pressure:t('PRESSURE'),pm1:'PM1',pm10:'PM10',
  volatile_organic_compounds:t('VOC'),volatile_organic_compounds_parts:t('VOC'),aqi:'AQI',carbon_monoxide:'CO',voltage:t('VOLTAGE'),current:t('CURRENT'),moisture:t('MOISTURE'),battery:t('BATTERY')};
const num1=v=>Math.abs(v)<10&&v%1?dec(v,1):String(Math.round(v)); // whole numbers without digit grouping: “1840 W” on the wall
export const metricOf=s=>METRICS.find(m=>m.cls===s.cls)||{k:s.cls||'x',cls:s.cls,label:GEN[s.cls]||'',name:s.name,text:(v,u)=>num1(v)+(u?(u==='%'?'':' ')+u:''),lvl:()=>0};
// diagnostic device readings and sensors not about room air: suggestions skip them, but they can be picked by hand
const SERVICE=/device_temp|internal|chip|cpu|\bsoc\b|processor|battery|устройств|внутрен|процессор|чип|батаре|gerätetemp|geräte|intern|akku|batterie|appareil|interne|apparaat|batterij|dispositivo|batería|batteria|urządzeni|bateria|设备|芯片|电池/i;
const ELSEWHERE=/fridge|freezer|refrig|холодил|морозил|boiler|water|бойлер|кот[её]л|вод[аы]|outdoor|outside|улиц|наружн|aquarium|аквариум|soil|почв|underfloor|floor_temp|т[её]пл\S* пол|radiator|радиатор|pipe|труб|kühlschrank|gefrier|kessel|wasser|außen|aussen|draußen|bodenfeucht|fußbodenheiz|heizkörper|rohr|réfrigérateur|frigo|congélateur|chaudière|eau|extérieur|plancher chauffant|radiateur|tuyau|koelkast|vriezer|ketel|buiten|vloerverwarming|leiding|nevera|frigorífico|congelador|caldera|agua|exterior|suelo radiante|radiador|tubería|frigorifero|congelatore|caldaia|acqua|esterno|riscaldamento a pavimento|radiatore|lodówk|zamrażark|kocioł|wod[ay]|zewnętrzn|ogrzewanie podłogowe|grzejnik|kaloryfer|geladeira|caldeira|água|externo|piso radiante|冰箱|锅炉|水温|室外|户外|地暖|暖气/i;
export const whyNot=s=>s.cat||s.hidden||SERVICE.test(s.entity+' '+s.name)?t('diagnostic'):ELSEWHERE.test(s.entity+' '+s.name)?t('not room air'):'';
export const fitsAuto=s=>!whyNot(s);
// a sensor's room: HA area → the room (or the second part of a room, its zone) of that area
export const roomOfArea=(plan,a)=>a?plan.rooms.find(r=>!r.solid&&(r.area===a||r.zone?.area===a))||null:null;
// climate sensors without a room on the plan: not on a wall, not “Don't show” (plan.sensorSkip), not diagnostic
export const orphans=(plan,ctx)=>ctx.sensors.filter(s=>isClimate(s)&&fitsAuto(s)&&!roomOfArea(plan,s.area)&&!plan.sensors.some(S=>S.entity===s.entity)&&!(plan.sensorSkip||[]).includes(s.entity));

// ctx: {sensors:[{entity,name,area,device,cls,unit,cat,hidden}], areas:[{area_id, temperature_entity_id?, humidity_entity_id?}], state:e=>number|null}
// The best sensor of quantity m for area a (or null).
export function pickAuto(m,a,ctx){
  if(!a)return null;
  const set=ctx.areas.find(x=>x.area_id===a)?.[m.area],s0=set&&ctx.sensors.find(x=>x.entity===set);if(s0)return s0;
  const dev=new Map();for(const s of ctx.sensors)if(s.device&&CLASSES.has(s.cls))dev.set(s.device,(dev.get(s.device)||new Set()).add(s.cls));
  const score=s=>{const v=ctx.state(s.entity);return (dev.get(s.device)?.size>1?2:0)+(v!=null&&m.sane(v,s.unit)?1:0);};
  return ctx.sensors.filter(s=>s.cls===m.cls&&s.area===a&&fitsAuto(s)).sort((x,y)=>score(y)-score(x)||x.entity.localeCompare(y.entity))[0]||null;
}
// The suggestion for a plan: for each room with an area, temperature, humidity and CO₂, if there is a sensor.
export function recommend(plan,ctx){const out=[];
  for(const r of plan.rooms){if(r.solid)continue;for(const a of [r.area,r.zone?.area].filter(Boolean))for(const m of METRICS){if(m.off)continue;const s=pickAuto(m,a,ctx);
    if(s&&!out.some(x=>x.entity===s.entity))out.push({entity:s.entity,room:r.id});}}
  return out;}
// What to write: a caption and a number. The sensor is gone from HA: nothing; no number: a dash.
export function sensorItem(S,ctx){const s=ctx.sensors.find(x=>x.entity===S.entity);if(!s)return null;const m=metricOf(s),v=ctx.state(s.entity);
  return {label:(S.label||m.label||s.name).toUpperCase().slice(0,22),text:v==null?'—':m.text(v,s.unit),lvl:v==null?0:m.lvl(v),k:S.k||1,...(S.c?{c:S.c}:{})};}
export const SIZES=[.75,1,1.25,1.5,1.75,2];
// A custom digit color (S.c): presets are light, graphite and three calm ones; yellow and red are not offered, they mark alarming values.
export const INKS=['#f4f2ec','#2a322d','#3d7be0','#1f9e8f','#8a63d2'];

// Label size (m): a small caption on top, a large number below; several go in a row. The center is at height y.
export const LABEL={y:1.85,vs:.26,ls:.075,gap:.2,pad:.06};
// k is a sensor's digit size: different sizes in a row align at the bottom edge, the row height follows the largest.
export const itemH=k=>k*(LABEL.vs*1.12+LABEL.ls*1.3);
export function labelSize(items){
  const ws=items.map(it=>Math.max(it.text.length*.6*LABEL.vs,it.label.length*.7*LABEL.ls)*(it.k||1));
  return {w:ws.reduce((a,b)=>a+b,0)+LABEL.gap*(items.length-1)+2*LABEL.pad,h:Math.max(...items.map(it=>itemH(it.k||1)))+2*LABEL.pad,ws};
}

// Where on the wall: for each room edge, the widest free stretch (no windows or doors, tall furniture, wall lights or labels
// placed by hand within the label band). Of these, the one best seen from the home view (ctx.cam, CAM by default): the wall
// faces the camera and the stretch fits the whole label. The spot is static: the label does not jump when the 3D view rotates (2026-11-07).
// at is the point where the user placed the label: the edge nearest to it, without checking for free space.
// ctx: {openings:[{a,b,bottom,top}], furniture, lights, taken:[{i, t0, t1}]}.
export const CAM=[.53,-.85];
export const spotScore=(sp,cam)=>{const vis=sp.n[0]*cam[0]+sp.n[1]*cam[1];return (vis>-.1?2+vis:vis)+sp.fit;};
// band is the label's height band [bottom, top], m.
export function wallSpot(room,ctx,W,at,band=[LABEL.y-itemH(1)/2-LABEL.pad,LABEL.y+itemH(1)/2+LABEL.pad]){
  const P=room.polygon,N=P.length,s=area(P)>0?1:-1,y0=band[0]-.05,y1=band[1]+.05;
  const side=i=>{const a=P[i],b=P[(i+1)%N],L=Math.hypot(b[0]-a[0],b[1]-a[1]),u=[(b[0]-a[0])/L,(b[1]-a[1])/L];return {i,a,b,L,u,n:[-u[1]*s,u[0]*s]};};
  const spot=(S,t,w)=>({i:S.i,u:S.u,n:S.n,t,w,L:S.L,scale:w/W,c:[S.a[0]+S.u[0]*t+S.n[0]*WALL.inner,S.a[1]+S.u[1]*t+S.n[1]*WALL.inner]});
  const sides=[];for(let i=0;i<N;i++){if(room.wt?.[i]===0)continue;const S=side(i);if(S.L>=.6)sides.push(S);}
  if(!sides.length)return null;
  if(at){
    // the edge nearest to the point; if a hand-placed label is already there, the nearest free spot on this wall; no room there:
    // the next nearest edge (labels overlap neither in 3D nor on the plan); no free spot anywhere: as placed
    const near=sides.map(S=>{const t=Math.max(0,Math.min(S.L,(at[0]-S.a[0])*S.u[0]+(at[1]-S.a[1])*S.u[1]));return {S,t,d:Math.hypot(S.a[0]+S.u[0]*t-at[0],S.a[1]+S.u[1]*t-at[1])};}).sort((x,y)=>x.d-y.d);
    const fitOn=({S,t:t0})=>{const w=Math.min(W,S.L-.1),lo=w/2+.05,hi=S.L-w/2-.05,clamp=t=>Math.max(lo,Math.min(hi,t)),ks=(ctx.taken||[]).filter(k=>k.i===S.i);
      const free=t=>ks.every(k=>t+w/2<=k.t0-.02||t-w/2>=k.t1+.02);if(free(clamp(t0)))return {S,w,t:clamp(t0)};
      const cs=ks.flatMap(k=>[k.t0-.05-w/2,k.t1+.05+w/2]).filter(t=>t>=lo-1e-9&&t<=hi+1e-9).filter(free).sort((a,b)=>Math.abs(a-t0)-Math.abs(b-t0));return cs.length?{S,w,t:cs[0]}:null;};
    const ok=near.slice(0,4).map(fitOn).find(Boolean)||(()=>{const {S,t}=near[0],w=Math.min(W,S.L-.1);return {S,w,t:Math.max(w/2+.05,Math.min(S.L-w/2-.05,t))};})();
    return {...spot(ok.S,ok.t,ok.w),fit:0,own:true};}
  const alts=[];
  for(const S of sides){let best=null;
    // a stretch along the edge [t0, t1] that is occupied within the label band
    const blocks=[],near=(q,lim,back=.3)=>{const d=(q[0]-S.a[0])*S.n[0]+(q[1]-S.a[1])*S.n[1];return d>-back&&d<lim;},tOf=q=>(q[0]-S.a[0])*S.u[0]+(q[1]-S.a[1])*S.u[1];
    for(const o of ctx.openings||[])if(near(o.a,.3)&&near(o.b,.3)&&o.top>y0&&o.bottom<y1){const t=[tOf(o.a),tOf(o.b)].sort((x,y)=>x-y);blocks.push([t[0]-.15,t[1]+.15]);}
    for(const f of ctx.furniture||[]){const z=zOf(f);if(z+f.h<=y0||z>=y1)continue;
      const r=f.rot*Math.PI/180,c=Math.cos(r),sn=Math.sin(r),cs=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[f.x+x*f.w/2*c-y*f.d/2*sn,f.y+x*f.w/2*sn+y*f.d/2*c]);
      // furniture only on this side of the wall: the neighbor's wardrobe behind a 10 cm partition does not take this wall
      // (an opening sits in the middle of the wall, so for openings 30 cm behind the face still count)
      if(!cs.some(q=>near(q,.35,.05)))continue;const t=cs.map(tOf);blocks.push([Math.min(...t)-.1,Math.max(...t)+.1]);}
    for(const L of ctx.lights||[])if(formFor(L)==='wall'&&L.h>y0-.2&&L.h<y1+.2)for(const p of L.points||[])if(near(p,.35)){const t=tOf(p);blocks.push([t-.3,t+.3]);}
    for(const k of ctx.taken||[])if(k.i===S.i)blocks.push([k.t0-.1,k.t1+.1]);
    let free=[[.2,S.L-.2]];
    for(const [b0,b1] of blocks)free=free.flatMap(([f0,f1])=>b1<=f0||b0>=f1?[[f0,f1]]:[[f0,b0],[b1,f1]].filter(([x,y])=>y-x>.05));
    for(const [f0,f1] of free){const len=f1-f0;if(len<.6)continue;const w=Math.min(W,len),fit=2*w/W+Math.min(len,6)/12;
      if(!best||fit>best.fit)best={fit,S,t:(f0+f1)/2,w};}
    if(best)alts.push({...spot(best.S,best.t,best.w),fit:best.fit});
  }
  if(!alts.length)return null;
  const cam=ctx.cam||CAM,best=alts.reduce((a,b)=>spotScore(b,cam)>spotScore(a,cam)?b:a);
  return best;
}

// Plan labels, one per sensor. A sensor can be placed under another (S.under is the id of the one above): this makes a column
// that sits in the row like a single number, as wide as its widest and as tall as their sum. Hand-placed columns (at on the top one in
// the column) stay in their spot. The room's other columns go side by side in a row in a shared spot (wallSpot for the row width), each
// sensor gets its own piece of the shared spot, with an offset.
// Columns hang from a common top: the top items are centered at height LABEL.y (no higher than 2.45 m), lower ones below them.
// Output: [{id, room, items, size, y: the vertical center, group, k: the column index in the row, col: the top sensor, ...spot}].
// env: {openings, baseOf(room, i): the wall color, cam: the home view, moving: the id of the sensor being moved}.
export const VGAP=.06,TOP_MAX=2.45;
export function stackOf(list){ // columns: [[top, below it, …], …]; loops and missing “under” targets are broken
  const ids=new Set(list.map(x=>x.S.id)),kids=new Map(),cols=[],seen=new Set();
  for(const x of list){const u=x.S.under;if(u&&ids.has(u)&&u!==x.S.id){if(!kids.has(u))kids.set(u,[]);kids.get(u).push(x);}}
  const walk=(x,col)=>{if(seen.has(x))return;seen.add(x);col.push(x);for(const c of kids.get(x.S.id)||[])walk(c,col);};
  for(const x of list)if(!x.S.under||!ids.has(x.S.under)||x.S.under===x.S.id){const col=[];walk(x,col);cols.push(col);}
  for(const x of list)if(!seen.has(x)){const col=[];walk(x,col);cols.push(col);} // a loop: A under B, B under A
  return cols;}
export function layoutSensors(plan,ctx,env={}){
  const out=[],byRoom=new Map(),P=LABEL.pad;
  for(const S of plan.sensors||[]){const r=plan.rooms.find(x=>x.id===S.room);if(!r||r.solid)continue;const it=sensorItem(S,ctx);if(!it)continue;
    if(!byRoom.has(r))byRoom.set(r,[]);byRoom.get(r).push({S,it});}
  for(const [r,list] of byRoom){
    const wctx={openings:env.openings,furniture:plan.furniture,lights:plan.lights.filter(l=>l.placed&&l.room===r.id),taken:[],cam:env.cam};
    const tag=sp=>({...sp,base:env.baseOf?.(r,sp.i)});
    const cols=stackOf(list).map(col=>{const ws=col.map(x=>labelSize([x.it]).ws[0]),hs=col.map(x=>itemH(x.it.k||1));
      return {col,ws,hs,w:Math.max(...ws),h:hs.reduce((a,b)=>a+b,0)+VGAP*(col.length-1)};});
    // a row of columns: width, height, top; each sensor gets an offset along the row (from its center) and a vertical center
    // the top items of the columns are centered at height LABEL.y (when something is placed under one, it does not jump), lower ones go below
    const row=cs=>{const W=cs.reduce((a,c)=>a+c.w,0)+LABEL.gap*(cs.length-1)+2*P,H=Math.max(...cs.map(c=>c.h)),top=Math.min(TOP_MAX,LABEL.y+Math.max(...cs.map(c=>c.hs[0]))/2),items=[];let x=-W/2+P;
      cs.forEach((c,k)=>{const cx=x+c.w/2;x+=c.w+LABEL.gap;let y=top;c.col.forEach((e,j)=>{items.push({e,k,col:c.col[0].S.id,off:cx,y:y-c.hs[j]/2,w:c.ws[j],h:c.hs[j]});y-=c.hs[j]+VGAP;});});
      return {W,band:[top-H-P,top+P],items};};
    // the row reads left to right for whoever looks at the wall: right is the normal rotated by 90°, not the room traversal direction
    const emit=(R,sp,group,own)=>{for(const it of R.items){const size={w:it.w+2*P,h:it.h+2*P,ws:[it.w]},shift=a=>{const rt=[-a.n[1],a.n[0]],d=it.off*a.scale;
        return tag({...a,c:[a.c[0]+rt[0]*d,a.c[1]+rt[1]*d],w:size.w*a.scale,t:a.t+d*(rt[0]*a.u[0]+rt[1]*a.u[1]),y:R.band[1]-P-(R.band[1]-P-it.y)*a.scale});};
      out.push({id:it.e.S.id,room:r.id,items:[it.e.it],size,group,k:it.k,col:it.col,...(own?{own:true}:{}),...shift(sp)});}};
    // sc is how much the label was squeezed in the row when it was pinned in place (a neighbor was moved): the size stays the same
    // Neighbors reserve their spots first: the sensor being moved yields to them instead of pushing them to another wall.
    const fixed=cols.filter(c=>c.col[0].S.at).sort((a,b)=>Number(a.col.some(x=>x.S.id===env.moving))-Number(b.col.some(x=>x.S.id===env.moving)));
    for(const c of fixed){const R=row([c]),k=c.col[0].S.sc||1,sp=wallSpot(r,wctx,R.W*k,c.col[0].S.at,R.band);if(!sp)continue;sp.scale*=k;
      wctx.taken.push({i:sp.i,t0:sp.t-sp.w/2,t1:sp.t+sp.w/2});emit(R,sp,'o:'+c.col[0].S.id,true);}
    const auto=cols.filter(c=>!c.col[0].S.at);if(!auto.length)continue;
    const R=row(auto),sp=wallSpot(r,wctx,R.W,undefined,R.band);if(sp)emit(R,sp,r.id,false);
  }
  return out;
}
