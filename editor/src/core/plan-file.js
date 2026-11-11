// Validate a file before it replaces the current project. Geometry errors can be fixed in the editor;
// an invalid structure or an unknown version must not turn into an empty saved plan.
import {migrate,PLAN_VERSION} from './plan.js';
import {checkItem} from './parts.js';

const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const str=x=>typeof x==='string'&&x.length>0;
const point=x=>Array.isArray(x)&&x.length===2&&x.every(Number.isFinite);
const check=ok=>{if(!ok)throw new Error('Invalid plan file');};
const optional=(o,k,test)=>{if(o[k]!=null)check(test(o[k]));};
const numbers=(o,ks)=>{for(const k of ks)optional(o,k,Number.isFinite);};
const points=x=>Array.isArray(x)&&x.every(point);
// the “Preview” dashboard layout (look/layout.js): {cards: [{id} | {id, type: 'entities', title, entities}], removed: [id]}
const panel=x=>obj(x)&&Array.isArray(x.cards)&&x.cards.every(c=>obj(c)&&str(c.id)&&(c.type==null||c.type==='entities'&&typeof (c.title??'')==='string'&&Array.isArray(c.entities)&&c.entities.every(str)))
  &&(x.removed==null||Array.isArray(x.removed)&&x.removed.every(str));

export function readPlan(text){
  const p=JSON.parse(text);
  check(obj(p)&&Array.isArray(p.rooms));
  optional(p,'version',x=>Number.isInteger(x)&&x>=0&&x<=PLAN_VERSION);
  optional(p,'units',x=>x==='m');optional(p,'id',str);optional(p,'name',x=>typeof x==='string');
  for(const k of ['rooms','openings','furniture','lights','sensors','sensorSkip','devices'])if(k in p)check(Array.isArray(p[k]));
  for(const k of ['rooms','openings','furniture','lights','sensors']){
    const ids=new Set();for(const x of p[k]||[]){check(obj(x));if(k==='rooms'||x.id!=null){check(str(x.id)&&!ids.has(x.id));ids.add(x.id);}}
  }
  for(const r of p.rooms){
    check(points(r.polygon)&&r.polygon.length>=3);optional(r,'name',x=>typeof x==='string');optional(r,'area',str);
    optional(r,'wt',x=>Array.isArray(x)&&x.every(v=>v==null||Number.isFinite(v)));
    optional(r,'wf',x=>Array.isArray(x)&&x.every(v=>v==null||obj(v)));
    optional(r,'rail',x=>Array.isArray(x)&&x.every(v=>v==null||Number.isFinite(v)&&v>=0)); // a railing's height per edge (geometry.js RAIL)
    if(r.zone!=null){check(obj(r.zone)&&point(r.zone.a)&&point(r.zone.b));optional(r.zone,'area',str);}
    optional(r,'panel',panel); // the room screen layout
  }
  for(const o of p.openings||[]){
    check(o.kind==='door'||o.kind==='window');numbers(o,['bottom','top','swing']);optional(o,'glass',x=>typeof x==='boolean'); // a glazed door
    if(o.at!=null){const a=o.at,r=p.rooms.find(r=>r.id===a.room);
      check(obj(a)&&r&&Number.isInteger(a.edge)&&a.edge>=0&&a.edge<r.polygon.length);
      check(Number.isFinite(a.s0)&&Number.isFinite(a.s1));numbers(a,['d']);
    }else check(point(o.a)&&point(o.b));
  }
  for(const f of p.furniture||[]){check(str(f.id)&&str(f.model));check(['x','y','w','d','h'].every(k=>Number.isFinite(f[k])));numbers(f,['rot','z']);optional(f,'top',str);}
  // an item's color: a named one (catalog COLORS) or a custom #rrggbb; color2 — the second one (a rug's border)
  for(const f of p.furniture||[])for(const k of ['color','color2'])optional(f,k,x=>typeof x==='string'&&(/^#[0-9a-f]{6}$/i.test(x)||/^[a-z]+$/.test(x)));
  for(const l of p.lights||[]){
    check(str(l.id));optional(l,'points',points);optional(l,'segments',x=>Array.isArray(x)&&x.every(s=>points(s)&&s.length===2));
    numbers(l,['h','count']);optional(l,'room',str);optional(l,'shade',str);optional(l,'name',x=>typeof x==='string');
    if(l.was!=null){check(obj(l.was)&&typeof l.was.s==='string');const snap=JSON.parse(l.was.s);check(Array.isArray(snap)&&snap.every(x=>Array.isArray(x)&&x.length===2&&typeof x[0]==='string'));}
  }
  for(const s of p.sensors||[]){check(str(s.id)&&str(s.entity)&&str(s.room));optional(s,'at',point);numbers(s,['k']);optional(s,'label',x=>typeof x==='string');optional(s,'c',x=>typeof x==='string'&&/^#[0-9a-f]{6}$/i.test(x));}
  for(const d of p.devices||[])check(str(d.id)&&str(d.entity)&&(str(d.furn)||str(d.opening)));
  check((p.sensorSkip||[]).every(str));numbers(p,['docArea']);
  if(p.wall!=null){check(obj(p.wall));numbers(p.wall,['outer','inner']);}
  if(p.onboarding!=null){check(obj(p.onboarding)&&obj(p.onboarding.steps));}
  // “Preview” scene settings (look/scenes.js): {scene: {kind:id: {action}}}
  if(p.scenes!=null){check(obj(p.scenes)&&Object.values(p.scenes).every(s=>obj(s)&&Object.values(s).every(v=>obj(v)&&typeof v.action==='string')));}
  optional(p,'panel',panel); // the overview layout
  if(p.view!=null){check(obj(p.view));check(Array.isArray(p.view.t)&&p.view.t.length===3&&p.view.t.every(Number.isFinite));check(point(p.view.fit));check(Number.isFinite(p.view.theta)&&Number.isFinite(p.view.phi));}
  // an item from parts (model 'parts', parts.js) must be buildable; the message names the item and the first problem
  for(const f of p.furniture||[])if(f.model==='parts'||f.parts!=null){const e=checkItem(f.parts);if(e.length)throw new Error(`Invalid plan file: furniture "${f.id}": ${e[0]}`);}
  return migrate(p);
}
