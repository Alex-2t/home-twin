// Pure 2D plan geometry: no three.js, works both in the browser and in node (fuzz.mjs).
// Plan: rooms are outlines [x,y] in metres (x — east, y — north); openings are attached to a room side.
import pc from 'polygon-clipping';

export const WALL={inner:.05,outer:.25,pair:.22,height:2.6};

export const area=p=>p.reduce((s,[x,y],i)=>{const [u,v]=p[(i+1)%p.length];return s+x*v-u*y;},0)/2;
export function offset(poly,d){
  poly=poly.filter((v,i,a)=>{const w=a[(i+1)%a.length];return Math.hypot(w[0]-v[0],w[1]-v[1])>1e-6;});
  const s=area(poly)>0?1:-1,n=poly.length,out=[];
  const nrm=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);return [s*dy/l,-s*dx/l];};
  for(let i=0;i<n;i++){
    const p0=poly[(i-1+n)%n],p1=poly[i],p2=poly[(i+1)%n];
    const n1=nrm(p0,p1),n2=nrm(p1,p2);
    const a=[p0[0]+n1[0]*d,p0[1]+n1[1]*d],da=[p1[0]-p0[0],p1[1]-p0[1]];
    const b=[p1[0]+n2[0]*d,p1[1]+n2[1]*d],db=[p2[0]-p1[0],p2[1]-p1[1]];
    const den=da[0]*db[1]-da[1]*db[0];
    if(Math.abs(den)<1e-9){out.push([p1[0]+n1[0]*d,p1[1]+n1[1]*d]);continue;}
    const t=((b[0]-a[0])*db[1]-(b[1]-a[1])*db[0])/den;
    out.push([a[0]+da[0]*t,a[1]+da[1]*t]);
  }
  return out;
}
// Rounding to 1 mm: without it, polygon-clipping crashes on nearly coincident points.
let STEP=1000;
export const snap=v=>Math.round(v*STEP)/STEP;
export const poly=p=>{const q=p.map(([x,y])=>[snap(x),snap(y)]).filter((v,i,a)=>{const w=a[(i+1)%a.length];return v[0]!==w[0]||v[1]!==w[1];});return [[...q,q[0]]];};
export const rect=(a,b,w)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),nx=-dy/l*w,ny=dx/l*w;
  return poly([[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]]);
};
const mpArea=mp=>mp.reduce((s,[o,...h])=>s+Math.abs(area(o.slice(0,-1)))-h.reduce((t,r)=>t+Math.abs(area(r.slice(0,-1))),0),0);

// ---------- plan validation ----------
function segX(a,b,c,d){
  const o=(p,q,r)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));
  return o(a,b,c)*o(a,b,d)<0&&o(c,d,a)*o(c,d,b)<0;
}
// Returns a list of errors {room, text}. An empty list means the plan can be built.
export function validate(rooms){
  const errs=[];
  for(const r of rooms){
    const p=r.polygon,n=p.length;
    if(n<3){errs.push({room:r.id,text:'fewer than three corners'});continue;}
    for(let i=0;i<n;i++){const a=p[i],b=p[(i+1)%n];if(Math.hypot(b[0]-a[0],b[1]-a[1])<.05)errs.push({room:r.id,text:'side shorter than 5 cm'});}
    let self=false;
    for(let i=0;i<n&&!self;i++)for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;if(segX(p[i],p[(i+1)%n],p[j],p[(j+1)%n])){self=true;break;}}
    if(self)errs.push({room:r.id,text:'outline intersects itself'});
    else if(Math.abs(area(p))<.25)errs.push({room:r.id,text:'area smaller than 0.25 m²'});
  }
  if(errs.length)return errs;
  for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
    const x=pc.intersection(poly(rooms[i].polygon),poly(rooms[j].polygon));
    if(mpArea(x)>1e-4)errs.push({room:rooms[j].id,other:rooms[i].id,text:`overlaps “${rooms[i].name}”`});
  }
  return errs;
}

// ---------- openings attached to a room side ----------
// {room, edge, s0, s1, d} — distances from the start of the side along its length, and the offset across it (the opening sits in the middle of the wall).
export function attachOpening(rooms,o){
  let best=null;
  for(const r of rooms){const p=r.polygon;for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);if(l<1e-6)continue;
    const ux=dx/l,uy=dy/l;
    const pr=q=>[(q[0]-a[0])*ux+(q[1]-a[1])*uy,-(q[0]-a[0])*uy+(q[1]-a[1])*ux];
    const [s0,d0]=pr(o.a),[s1,d1]=pr(o.b);
    if(Math.abs(d0)>.35||Math.abs(d1)>.35)continue;
    if(Math.max(s0,s1)<-.05||Math.min(s0,s1)>l+.05)continue;
    const score=Math.abs(d0)+Math.abs(d1);
    if(!best||score<best.score)best={room:r.id,edge:i,s0,s1,d:(d0+d1)/2,score};
  }}
  if(!best)return null;
  const {score,...at}=best;return {...o,at};
}
export function openingCoords(rooms,o){
  const r=rooms.find(r=>r.id===o.at.room);if(!r)return null;
  const p=r.polygon,a=p[o.at.edge%p.length],b=p[(o.at.edge+1)%p.length];
  const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1,ux=dx/l,uy=dy/l;
  // If the side was shortened, the opening shrinks to fit within it.
  const clamp=s=>Math.max(.02,Math.min(l-.02,s));
  const pt=s=>[a[0]+ux*clamp(s)-uy*o.at.d,a[1]+uy*clamp(s)+ux*o.at.d];
  const s0=clamp(o.at.s0),s1=clamp(o.at.s1);
  // The side became shorter than the opening: the opening disappears, and the plan reports it.
  if(Math.abs(s1-s0)<.1)return null;
  return {...o,a:pt(o.at.s0),b:pt(o.at.s1)};
}

// ---------- walls from outlines (as in walls-from-json) ----------
// polygon-clipping occasionally fails to close an outline (about 0.1% of edited plans in fuzz.mjs).
// Then build again with 2 mm and 5 mm rounding: the difference is invisible.
export function buildPlan2d(rooms,openings){
  let err;
  for(const step of [1000,500,200]){
    STEP=step;
    try{const g=buildRaw(rooms,openings);g.step=step;return g;}catch(e){err=e;}
    finally{STEP=1000;}
  }
  throw err;
}
function buildRaw(rooms,openings){
  const insetRooms=rooms.map(r=>poly(offset(r.polygon,-WALL.inner)));
  const footprint=pc.union(...rooms.map(r=>poly(offset(r.polygon,WALL.outer))));
  const walls=pc.difference(footprint,...insetRooms);
  const pairs=[];
  for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
    const x=pc.intersection(poly(offset(rooms[i].polygon,WALL.pair)),poly(offset(rooms[j].polygon,WALL.pair)));
    if(x.length)pairs.push(x);
  }
  const interiorZone=pairs.length?pc.union(...pairs):[];
  const interior=pairs.length?pc.intersection(walls,interiorZone):[];
  const exterior=pairs.length?pc.difference(walls,interiorZone):walls;
  const xs=rooms.flatMap(r=>r.polygon.map(p=>p[0])),ys=rooms.flatMap(r=>r.polygon.map(p=>p[1]));
  const c=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
  const far=([x,y])=>[c[0]+(x-c[0])*12,c[1]+(y-c[1])*12];
  const SW=far([Math.min(...xs),Math.min(...ys)]),SE=far([Math.max(...xs),Math.min(...ys)]),NE=far([Math.max(...xs),Math.max(...ys)]),NW=far([Math.min(...xs),Math.max(...ys)]);
  const sides=[['S',[c,SW,SE]],['E',[c,SE,NE]],['N',[c,NE,NW]],['W',[c,NW,SW]]].map(([id,w])=>({id,wedge:poly(w),shape:pc.intersection(exterior,poly(w))}));
  const ops=openings.map(o=>({...o,poly:rect(o.a,o.b,.42)}));
  const hs=[...new Set([0,WALL.height,...ops.flatMap(o=>[o.bottom,o.top]).filter(h=>h>0&&h<WALL.height)])].sort((a,b)=>a-b);
  // Height layers: in each one, the openings that overlap it are subtracted.
  const bands=base=>{const out=[];for(let i=0;i<hs.length-1;i++){const [a,b]=[hs[i],hs[i+1]];
    const cut=ops.filter(o=>o.bottom<=a+1e-6&&o.top>=b-1e-6).map(o=>o.poly);
    out.push({mp:cut.length&&base.length?pc.difference(base,...cut):base,bottom:a,top:b,last:i===hs.length-2});}return out;};
  return {footprint,interior:bands(interior),sides:sides.map(s=>({...s,bands:bands(s.shape)})),center:c};
}
