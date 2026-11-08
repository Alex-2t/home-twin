// Runs the wall generator on random plans: how many edits fail validation and how many crash the geometry.
// node fuzz.mjs [number of plans]
import fs from 'node:fs';
const {validate,buildPlan2d,attachOpening,openingCoords}=await import('./geometry.js');
const {OPENINGS}=await import('../walls-from-json/own/plan.js');
const manifest=JSON.parse(fs.readFileSync(new URL('../../../3d_floor/apartment/smart-home/web/public/devices.json',import.meta.url)));
const N=+process.argv[2]||2000;
let seed=+process.argv[3]||1;const rnd=()=>((seed=Math.imul(seed^seed>>>15,1|seed)+0x6D2B79F5|0)>>>0)/4294967296;
const pick=a=>a[Math.floor(rnd()*a.length)];
const base=manifest.rooms.map(r=>({id:r.id,name:r.short,polygon:r.polygon.map(p=>[...p])}));
const stat={plans:0,valid:0,invalid:0,crash:0,retry:0,ms:0,max:0,reasons:{}};const crashes=[];
function run(rooms,openings){
  stat.plans++;
  const errs=validate(rooms);
  if(errs.length){stat.invalid++;for(const e of errs){const k=e.text.replace(/“.*”/,'“…”');stat.reasons[k]=(stat.reasons[k]||0)+1;}return;}
  stat.valid++;
  const t=performance.now();
  try{const ops=openings.map(o=>openingCoords(rooms,o)).filter(Boolean);const g=buildPlan2d(rooms,ops);if(g.step!==1000)stat.retry++;if(!g.footprint.length)throw new Error('empty outline');}
  catch(e){stat.crash++;if(crashes.length<5)crashes.push({err:String(e.message||e).slice(0,120),rooms:JSON.stringify(rooms.map(r=>r.polygon))});}
  const dt=performance.now()-t;stat.ms+=dt;stat.max=Math.max(stat.max,dt);
}
// 1) My apartment: random edits, as a user would make them (with and without grid snapping).
const attached=OPENINGS.map(o=>attachOpening(base,o)).filter(Boolean);
for(let k=0;k<N;k++){
  const rooms=structuredClone(base);
  const steps=1+Math.floor(rnd()*6);
  const grid=pick([0,.001,.05]);const q=v=>grid?Math.round(v/grid)*grid:v;
  for(let s=0;s<steps;s++){
    const r=pick(rooms),i=Math.floor(rnd()*r.polygon.length),p=r.polygon;
    const op=rnd();
    if(op<.45){p[i]=[q(p[i][0]+(rnd()-.5)*.8),q(p[i][1]+(rnd()-.5)*.8)];}
    else if(op<.85){ // move a side across, together with the neighbour's parallel side within 45 cm
      const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l,d=q((rnd()-.5)*1.2);
      const moved=[[r,i]];
      for(const o of rooms)if(o!==r)for(let j=0;j<o.polygon.length;j++){const c=o.polygon[j],e=o.polygon[(j+1)%o.polygon.length];
        const ex=e[0]-c[0],ey=e[1]-c[1],el=Math.hypot(ex,ey)||1;if(Math.abs((ex*dx+ey*dy)/(el*l))<.999)continue;
        if(Math.abs((c[0]-a[0])*nx+(c[1]-a[1])*ny)<.45)moved.push([o,j]);}
      for(const [o,j] of moved)for(const t of [j,(j+1)%o.polygon.length]){const v=o.polygon[t];o.polygon[t]=[v[0]+nx*d,v[1]+ny*d];}
    } else if(op<.95){const b=p[(i+1)%p.length];p.splice(i+1,0,[q((p[i][0]+b[0])/2+(rnd()-.5)*.3),q((p[i][1]+b[1])/2+(rnd()-.5)*.3)]);}
    else if(p.length>3)p.splice(i,1);
  }
  run(rooms,attached);
}
const mine={...stat};
// 2) Random plans from scratch: a grid of rectangular rooms with 8–30 cm walls, sometimes a chamfered corner.
for(const k of Object.keys(stat))stat[k]=k==='reasons'?{}:0;
for(let k=0;k<N;k++){
  const cols=1+Math.floor(rnd()*4),rows=1+Math.floor(rnd()*3),wall=.08+rnd()*.22;
  const xs=[0],ys=[0];for(let i=0;i<cols;i++)xs.push(xs.at(-1)+1.2+rnd()*4);for(let i=0;i<rows;i++)ys.push(ys.at(-1)+1.2+rnd()*4);
  const rooms=[];
  for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){if(rnd()<.12&&rooms.length)continue;
    const x0=xs[i]+(i?wall/2:0),x1=xs[i+1]-(i<cols-1?wall/2:0),y0=ys[j]+(j?wall/2:0),y1=ys[j+1]-(j<rows-1?wall/2:0);
    const p=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
    if(rnd()<.2){const c=.3+rnd()*.8;p.splice(2,1,[x1,y1-c],[x1-c,y1]);}
    rooms.push({id:'r'+rooms.length,name:'R'+rooms.length,polygon:p});}
  run(rooms,[]);
}
const fmt=s=>`${s.plans} plans: passed validation ${s.valid}, rejected ${s.invalid}, geometry crashed ${s.crash}, saved by retry ${s.retry}; 2D build average ${(s.ms/Math.max(1,s.valid)).toFixed(1)} ms, max ${s.max.toFixed(0)} ms`;
console.log('My apartment, random edits —',fmt(mine));console.log('  rejection reasons:',mine.reasons);
console.log('Random plans from scratch —',fmt(stat));console.log('  rejection reasons:',stat.reasons);
if(crashes.length)console.log('Crashes:',crashes);
