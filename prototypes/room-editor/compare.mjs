// Compares an AI draft of the plan with the real outlines from devices.json: node compare.mjs /tmp/ht/ai-plan.json
import fs from 'node:fs';
import pc from 'polygon-clipping';
import {area,poly,validate} from './geometry.js';
const truth=JSON.parse(fs.readFileSync(new URL('../../../3d_floor/apartment/smart-home/web/public/devices.json',import.meta.url))).rooms;
const ai=JSON.parse(fs.readFileSync(process.argv[2]));
const A=mp=>mp.reduce((s,[o,...h])=>s+Math.abs(area(o.slice(0,-1)))-h.reduce((t,r)=>t+Math.abs(area(r.slice(0,-1))),0),0);
const iou=(p,q)=>{const i=A(pc.intersection(poly(p),poly(q))),u=A(pc.union(poly(p),poly(q)));return i/u;};
const errs=validate(ai.rooms);
console.log('Editor check:',errs.length?errs.map(e=>e.room+': '+e.text).join('; '):'ok');
console.log('Rooms: AI',ai.rooms.length,'— actual',truth.length);
let sum=0;
for(const t of truth){
  let best=null;for(const r of ai.rooms){const v=iou(t.polygon,r.polygon);if(!best||v>best.v)best={r,v};}
  const ta=Math.abs(area(t.polygon)),ra=best?Math.abs(area(best.r.polygon)):0;sum+=best?.v||0;
  console.log(`${t.short.padEnd(9)} ${ta.toFixed(1).padStart(5)} m² | AI: ${(best?.r.name||'—').padEnd(12)} ${ra.toFixed(1).padStart(5)} m² (${ra>ta?'+':''}${((ra/ta-1)*100).toFixed(0)}%) | outline match ${(best.v*100).toFixed(0)}%`);
}
const all=x=>pc.union(...x.map(r=>poly(r.polygon)));
const tot=A(pc.intersection(all(truth),all(ai.rooms)))/A(pc.union(all(truth),all(ai.rooms)));
console.log(`Average room match ${(sum/truth.length*100).toFixed(0)}%, whole apartment ${(tot*100).toFixed(0)}%`);
console.log('AI openings:',(ai.openings||[]).length,'(doors',(ai.openings||[]).filter(o=>o.kind==='door').length+', windows',(ai.openings||[]).filter(o=>o.kind==='window').length+')');
