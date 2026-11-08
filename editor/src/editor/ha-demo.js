// HA demo layer: long-term statistics and raw history — in the form Home Assistant returns them, deterministically
// (the same date — the same bar). Preview reads them the same way as in HA (look/stats.js).
const H=36e5,DAY=864e5;
// noise 0…1 from the key and the day number
export function noise(key,n){let h=2166136261;for(const c of key+':'+n)h=Math.imul(h^c.charCodeAt(0),16777619);return ((h>>>0)%1e4)/1e4;}
const season=x=>Math.cos((new Date(x).getMonth()+.5)/12*2*Math.PI); // 1 — January, −1 — July
// sensor reading at moment x: the current value with a daily cycle, season and day-to-day spread, by sensor kind
function reading(s,v,x,now){const d=new Date(x),hr=d.getHours()+d.getMinutes()/60,day=Math.floor(x/DAY),sn=season(x)-season(now),k=s.entity;
  if(s.cls==='temperature')return v-.9*sn+.7*Math.sin((hr-9)/24*2*Math.PI)+(noise(k,day)-.5)*1.2;
  if(s.cls==='humidity')return v+6*sn+4*Math.sin((hr-3)/24*2*Math.PI)+(noise(k,day)-.5)*8;
  if(s.cls==='carbon_dioxide')return Math.max(420,v*.85+v*.3*Math.cos((hr-6)/24*2*Math.PI)+(noise(k,day)-.5)*v*.3);
  return v*(1+.05*Math.sin(hr/24*2*Math.PI)+(noise(k,day)-.5)*.1);}
// daily shares for energy meters
const SHAPES={flat:new Array(24).fill(1),home:[.5,.4,.35,.35,.35,.4,.7,1.3,1.4,1,.8,.8,.9,.85,.8,.85,1,1.3,1.7,1.9,1.8,1.5,1.1,.7],
  day:[0,0,0,0,0,0,0,.1,.4,1,1.4,1.5,1.4,1.2,1,.8,.5,.3,.2,.1,0,0,0,0],evening:[.1,0,0,0,0,0,0,.2,.3,.2,.2,.2,.3,.3,.3,.4,.6,.9,1.4,1.8,1.9,1.6,1,.4]};
// energy meter increment for hour x: daily — kWh per day, more in winter, more noticeable on weekends
function consumed(s,x){const d=new Date(x),w=SHAPES[s.shape]||SHAPES.home,sum=w.reduce((a,b)=>a+b,0),day=Math.floor(x/DAY);
  return s.daily*w[d.getHours()]/sum*(1+.18*season(x))*([0,6].includes(d.getDay())?1.15:1)*(.75+.5*noise(s.entity,day));}

// recorder/statistics_during_period: ids — sensor entities, period — hour | day | month, types — mean / min / max / change.
// Numeric sensors — means, energy meters (cls energy, daily) — increments. Data starts at since; the current hour is not compiled yet.
export function demoStatistics(sensors,state,ids,{start,end,period='hour',types=['mean']},{since=0,now=Date.now()}={}){
  const out={},last=Math.min(end,Math.floor(now/H)*H),from=Math.max(start,since);
  const step=(x,dir=1)=>{const d=new Date(x);if(period==='month')d.setMonth(d.getMonth()+dir);else if(period==='day')d.setDate(d.getDate()+dir);else return x+H*dir;return d.getTime();};
  const floor=x=>{const d=new Date(x);d.setMinutes(0,0,0);if(period!=='hour')d.setHours(0);if(period==='month')d.setDate(1);return d.getTime();};
  for(const id of ids){const s=sensors.find(x=>x.entity===id),v=state(id);if(!s||(s.cls==='energy'?!(s.daily>0):v==null))continue;const rows=[];
    for(let a=floor(Math.max(start,from));a<last;a=step(a)){const b=step(a),hrs=[];
      for(let x=Math.max(a,from);x<Math.min(b,last);x+=H)hrs.push(x);if(!hrs.length)continue;const r={start:a,end:b};
      if(s.cls==='energy'){if(types.includes('change'))r.change=+hrs.reduce((t,x)=>t+consumed(s,x),0).toFixed(3);}
      else{const m=hrs.map(x=>reading(s,v,x+H/2,now));
        if(types.includes('mean'))r.mean=+(m.reduce((t,y)=>t+y,0)/m.length).toFixed(2);if(types.includes('min'))r.min=+Math.min(...m).toFixed(2);if(types.includes('max'))r.max=+Math.max(...m).toFixed(2);}
      rows.push(r);}
    if(rows.length)out[id]=rows;}
  return out;}

// history/history_during_period (minimal_response, no_attributes): {entity:[{s, lu — seconds}]}. outages: {entity:{hours, drops}} —
// who dropped out; restart — the HA restart time: everything is unavailable for a minute (statistics do not count its minutes).
export function demoStateHistory(ids,{start,end},{outages={},restart=null,state=()=>'on'}={}){const out={};
  for(const e of ids){const s=state(e)||'on',rows=[{s,lu:start/1e3}],o=outages[e],marks=[];
    if(o){const n=Math.max(1,o.drops),each=o.hours/n*H,gap=(end-start)/n;for(let i=0;i<n;i++){const x=start+gap*(i+.35+.3*noise(e,i));marks.push([x,x+each]);}}
    if(restart>start&&restart<end)marks.push([restart,restart+50e3]);
    for(const [a,b] of marks.sort((p,q)=>p[0]-q[0]))if(b<end&&a>rows.at(-1).lu*1e3)rows.push({s:'unavailable',lu:a/1e3},{s,lu:b/1e3});
    out[e]=rows;}
  return out;}
