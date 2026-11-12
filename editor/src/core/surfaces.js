// Floors and shading along walls (D-028). Core of the 3D view, no UI.
// The floor covering is guessed from the room name; planks and tiles are drawn in code on a canvas, there are no image files.
// Shading along walls and in corners is computed once from the plan (a top-down map, `bakeAO`), and the wall and floor shader reads it from a texture:
// almost free for weak tablets, unlike screen-space shading on every frame.
import {t} from '../i18n/i18n.js';
import * as THREE from 'three';
import {edgePieces,edgeRuns} from './pieces.js';

// ---------- floor covering ----------
// Coverings: pattern is how it is drawn (planks, herringbone, tile with cols×rows per repeat, concrete,
// carpet, marble, checker with alt), base is the RGB color, size is how many meters one texture repeat covers, group is the section
// in the “All options and custom color” popup. The first eight (FLOOR_QUICK) are in the room's “Floor” row, the rest are in the popup.
// The user picks the room's floor (room.floor) and, optionally, a custom color (room.floorTint, '#rrggbb', instead of base);
// if nothing is picked, we guess from the name (floorGuess).
const W=t('Wood'),H=t('Herringbone'),T=t('Tile & stone'),O=t('Other');
export const FLOOR_KINDS={
  wood:{label:t('Oak'),pattern:'planks',base:[178,147,114],seed:11,size:2.4,rough:.62,group:W},
  woodLight:{label:t('Light wood'),pattern:'planks',base:[206,182,148],seed:13,size:2.4,rough:.6,group:W},
  woodDark:{label:t('Dark wood'),pattern:'planks',base:[118,86,62],seed:17,size:2.4,rough:.55,group:W},
  herringbone:{label:t('Herringbone'),pattern:'herringbone',base:[176,141,106],size:.8,rough:.58,group:H},
  tile:{label:t('Tile'),pattern:'tile',base:[188,190,187],cols:2,rows:2,seed:5,size:1.2,rough:.38,group:T}, // 60×60
  stone:{label:t('Porcelain'),pattern:'tile',base:[184,173,159],cols:2,rows:4,seed:9,blots:5,size:2.4,rough:.5,group:T}, // 120×60
  concrete:{label:t('Concrete'),pattern:'concrete',base:[168,167,163],size:3,rough:.72,group:O},
  carpet:{label:t('Carpet'),pattern:'carpet',base:[155,149,139],size:1,rough:.96,group:O},
  oakWhite:{label:t('Whitewashed oak'),pattern:'planks',base:[218,205,184],seed:19,size:2.4,rough:.6,group:W},
  honey:{label:t('Honey oak'),pattern:'planks',base:[194,145,92],seed:23,size:2.4,rough:.58,group:W},
  wenge:{label:t('Wenge'),pattern:'planks',base:[76,57,44],seed:29,size:2.4,rough:.52,group:W},
  woodGrey:{label:t('Gray wood'),pattern:'planks',base:[154,146,136],seed:31,size:2.4,rough:.62,group:W},
  hbLight:{label:t('Light herringbone'),pattern:'herringbone',base:[210,186,150],size:.8,rough:.58,group:H},
  hbDark:{label:t('Dark herringbone'),pattern:'herringbone',base:[112,82,58],size:.8,rough:.55,group:H},
  hbGrey:{label:t('Gray herringbone'),pattern:'herringbone',base:[150,144,136],size:.8,rough:.6,group:H},
  tileWhite:{label:t('White tile'),pattern:'tile',base:[228,227,223],cols:2,rows:2,seed:6,size:1.2,rough:.3,group:T},
  tileGraphite:{label:t('Graphite tile'),pattern:'tile',base:[88,90,94],cols:2,rows:2,seed:7,size:1.2,rough:.4,group:T},
  tileSmall:{label:t('Small tile'),pattern:'tile',base:[214,212,206],cols:6,rows:6,seed:8,size:1.2,rough:.35,group:T}, // 20×20
  terracotta:{label:t('Terracotta'),pattern:'tile',base:[168,98,70],cols:4,rows:4,seed:10,blots:2,size:1.2,rough:.6,group:T}, // 30×30
  marble:{label:t('Marble'),pattern:'marble',base:[232,230,226],cols:2,rows:4,seed:12,size:2.4,rough:.22,group:T},
  checker:{label:t('Checkerboard'),pattern:'checker',base:[232,230,226],alt:[42,42,44],cols:4,seed:14,size:1.2,rough:.3,group:T}, // 30×30
  concreteDark:{label:t('Dark concrete'),pattern:'concrete',base:[108,108,106],size:3,rough:.7,group:O},
  carpetGrey:{label:t('Gray carpet'),pattern:'carpet',base:[120,122,127],size:1,rough:.96,group:O},
  carpetBlue:{label:t('Blue carpet'),pattern:'carpet',base:[72,86,112],size:1,rough:.96,group:O},
  grass:{label:t('Lawn'),pattern:'grass',base:[86,110,64],size:2,rough:.95,group:O},
  gravel:{label:t('Gravel'),pattern:'gravel',base:[176,168,154],size:1.2,rough:.92,group:O},
};
export const FLOOR_QUICK=['wood','woodLight','woodDark','herringbone','tile','stone','concrete','carpet'];
export const FLOOR_GROUPS=[W,H,T,O].map(g=>[g,Object.keys(FLOOR_KINDS).filter(k=>FLOOR_KINDS[k].group===g)]);
const hex=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const unhex=h=>/^#[0-9a-f]{6}$/i.test(h||'')?[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)):null;
export const floorBase=(kind,tint)=>hex(unhex(tint)||FLOOR_KINDS[kind].base);
// Bathroom, toilet and laundry: tiles; garage, utility room, basement: concrete; kitchen, balcony, terrace, garden: porcelain stoneware,
// but a kitchen-living room gets parquet; everything else: parquet.
// The demo apartment's names match their ids (bathroom, kitchen, panorama), so we look at the id too.
// by room name, in the ten UI languages (D-036): bathroom and toilet, living room, kitchen and balcony
export const BATH=/ванн|санузел|с\/у|туалет|уборн|душ|bath|shower|en-?suite|wc|toilet|badezimmer|^bad\b|\bbad$|dusche|salle de bain|sdb|douche|badkamer|douche|baño|aseo|ducha|bagno|doccia|łazienk|toalet|prysznic|banheiro|casa de banho|lavabo|chuveiro|卫生间|浴室|厕所|洗手间/;
export const floorGuess=room=>{
  const s=`${room?.name||''} ${room?.id||''}`.toLowerCase();
  if(BATH.test(s))return 'tile';
  // a garage, utility or boiler room, a basement, a shed: concrete; a laundry room: tiles (the homes check: these had parquet)
  if(/гараж|котельн|подвал|сарай|мастерск|garag|garaż|utility|boiler|basement|cellar|\bshed\b|workshop|keller|hauswirtschaft|heizungsraum|schuppen|werkstatt|chaufferie|sótano|scantinato|piwnica|kotłownia|porão|车库|地下室/.test(s))return 'concrete';
  if(/прачечн|постироч|laundry|waschküche|buanderie|wasruimte|lavadero|lavanderia|pralni|lavandaria|洗衣/.test(s))return 'tile';
  if(/гостин|living|зал|wohnzimmer|salon|séjour|woonkamer|sala|soggiorno|salotto|pokój dzienny|客厅/.test(s))return 'wood';
  if(/газон|лужайк|(?<![а-яё])двор(?![а-яё])|lawn|backyard|\byard\b|rasen|pelouse|gazon|césped|prato|trawnik|gramado|relvado|草坪/.test(s))return 'grass';
  if(/кухн|kitchen|балкон|лодж|террас|веранд|патио|(?<![а-яё])сад(?![а-яё])|terrace|patio|porch|\bdeck\b|garden|garten|jardin|jardín|giardino|tuin|ogród|jardim|balcon|panorama|küche|balkon|terrasse|loggia|cuisine|keuken|terras|cocina|balcón|terraza|cucina|balcone|terrazzo|kuchni|taras|cozinha|varanda|sacada|terraço|厨房|阳台/.test(s))return 'stone';
  return 'wood';
};
export const floorKind=room=>FLOOR_KINDS[room?.floor]?room.floor:floorGuess(room);
export const floorColor=room=>floorBase(floorKind(room),room?.floorTint);

// deterministic random: the same texture on every run
const rng=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
const N=1024;
function canvas(){const c=document.createElement('canvas');c.width=c.height=N;return c;}
const rgb=(c,k=1,a=1)=>`rgba(${Math.round(Math.min(255,c[0]*k))},${Math.round(Math.min(255,c[1]*k))},${Math.round(Math.min(255,c[2]*k))},${a})`;

// 20 cm oak planks, two planks per row with a random joint; each plank has its own shade and grain. The 2.4 m repeat is seamless.
function wood(base=[178,147,114],seed=11){
  const c=canvas(),g=c.getContext('2d'),r=rng(seed),rows=12,h=N/rows;
  g.fillStyle=rgb(base);g.fillRect(0,0,N,N);
  const joints=[];
  for(let i=0;i<rows;i++){
    const y=i*h,o=r()*N,L=N*(.36+r()*.28);
    for(const [a,len] of [[o,L],[o+L,N-L]]){
      joints.push([a%N,y]);
      // plank parameters are chosen once: the plank is also drawn shifted by the texture width so the joint across the edge matches
      const k=.94+r()*.11,warm=r()*.05-.025,tone=[base[0]*(1+warm),base[1],base[2]*(1-warm*1.5)];
      const lines=Array.from({length:30},()=>({y:y+2+r()*(h-4),a:.02+r()*.06,w:.5+r()*1.6,amp:.6+r()*2.2,f:.002+r()*.006,ph:r()*7,dark:r()<.8}));
      const knot=r()<.18?{x:r()*len,y:y+h*(.25+r()*.5),rx:6+r()*10,ry:2+r()*3}:null;
      for(const sh of [0,-N]){const x=a+sh;g.save();g.beginPath();g.rect(x,y,len,h);g.clip();
        g.fillStyle=rgb(tone,k);g.fillRect(x,y,len,h);
        // a soft band along the plank: the middle is slightly lighter, like a sawn cut
        const grad=g.createLinearGradient(0,y,0,y+h);grad.addColorStop(0,'rgba(60,35,15,.06)');grad.addColorStop(.5,'rgba(255,240,215,.05)');grad.addColorStop(1,'rgba(60,35,15,.06)');
        g.fillStyle=grad;g.fillRect(x,y,len,h);
        for(const l of lines){g.strokeStyle=l.dark?`rgba(70,42,18,${l.a})`:`rgba(255,236,205,${l.a*.8})`;g.lineWidth=l.w;g.beginPath();
          for(let t=0;t<=len;t+=12){const yy=l.y+Math.sin(t*l.f+l.ph)*l.amp;t?g.lineTo(x+t,yy):g.moveTo(x,yy);}g.stroke();}
        if(knot){g.fillStyle='rgba(80,48,20,.22)';g.beginPath();g.ellipse(x+knot.x,knot.y,knot.rx,knot.ry,0,0,7);g.fill();
          g.strokeStyle='rgba(80,48,20,.12)';g.lineWidth=1;g.beginPath();g.ellipse(x+knot.x,knot.y,knot.rx*1.8,knot.ry*1.9,0,0,7);g.stroke();}
        g.restore();}
    }
  }
  // joints: a dark line with a light bevel below it
  for(let i=0;i<=rows;i++){const y=i*h;g.fillStyle='rgba(55,34,16,.38)';g.fillRect(0,y-1,N,2);g.fillStyle='rgba(255,236,205,.12)';g.fillRect(0,y+1,N,1);}
  for(const [x,y] of joints)for(const sh of [0,N]){g.fillStyle='rgba(55,34,16,.32)';g.fillRect(x-sh-1,y,2,h);}
  return c;
}
// Tile: squares or rectangles with a thin joint, each with a barely visible color variation, like porcelain stoneware.
function tiles(base,cols,rows,seed,{blots=0,grout}){
  const c=canvas(),g=c.getContext('2d'),r=rng(seed),w=N/cols,h=N/rows;
  for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){const k=.975+r()*.05;g.fillStyle=rgb(base,k);g.fillRect(i*w,j*h,w,h);
    g.save();g.beginPath();g.rect(i*w,j*h,w,h);g.clip();
    for(let n=0;n<blots;n++){const x=i*w+r()*w,y=j*h+r()*h,rad=20+r()*120,l=r()<.5,gr=g.createRadialGradient(x,y,0,x,y,rad);
      gr.addColorStop(0,l?'rgba(255,255,255,.035)':'rgba(70,60,50,.03)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x-rad,y-rad,rad*2,rad*2);}
    for(let n=0;n<900;n++){g.fillStyle=r()<.5?'rgba(255,255,255,.07)':'rgba(60,55,50,.06)';g.fillRect(i*w+r()*w,j*h+r()*h,1.3,1.3);}
    g.restore();}
  // the joint is drawn along the edge of every tile (half on each side), so it stays whole at the repeat boundary
  g.fillStyle=grout;for(let i=0;i<=cols;i++)g.fillRect(i*w-1.5,0,3,N);for(let j=0;j<=rows;j++)g.fillRect(0,j*h-1.5,N,3);
  return c;
}
// Herringbone: 4:1 slats, axes along the walls (in 3D it is rotated along the room). “Horizontal–vertical” chains run
// diagonally and repeat every 2n slats on both axes, so the texture is seamless; a slat's tone depends on its place in the repeat.
function herringbone(base=[176,141,106]){
  const c=canvas(),g=c.getContext('2d'),n=4,P=2*n,u=N/P;g.fillStyle=rgb(base);g.fillRect(0,0,N,N);
  const md=(a,b)=>((a%b)+b)%b,hash=(x,y,t)=>{let h=x*374761393+y*668265263+t*69069;h=(h^h>>>13)*1274126177;return ((h^h>>>16)>>>0)/4294967296;};
  const plank=(x,y,w,h,vert)=>{const key=hash(md(x,P),md(y,P),vert?1:0),r=rng(Math.floor(key*1e6)),k=.95+key*.08,warm=r()*.03-.015,tone=[base[0]*(1+warm),base[1],base[2]*(1-warm*1.5)];
    const X=x*u,Y=y*u,W=w*u,H=h*u;g.save();g.beginPath();g.rect(X,Y,W,H);g.clip();g.fillStyle=rgb(tone,k);g.fillRect(X,Y,W,H);
    for(let i=0;i<9;i++){const o=2+r()*((vert?W:H)-4),a=.02+r()*.06,amp=.5+r()*1.6,f=.004+r()*.01,ph=r()*7;g.strokeStyle=r()<.8?`rgba(70,42,18,${a})`:`rgba(255,236,205,${a*.8})`;g.lineWidth=.5+r()*1.3;g.beginPath();
      for(let t=0;t<=(vert?H:W);t+=10){const q=o+Math.sin(t*f+ph)*amp;vert?(t?g.lineTo(X+q,Y+t):g.moveTo(X+q,Y)):(t?g.lineTo(X+t,Y+q):g.moveTo(X,Y+q));}g.stroke();}
    g.restore();g.strokeStyle='rgba(55,34,16,.3)';g.lineWidth=1.6;g.strokeRect(X,Y,W,H);};
  for(let s=-2*P;s<=2*P;s+=P)for(let k=-2*P;k<=2*P;k++){plank(k+s,k,n,1,false);plank(k+s,k+1,1,n,true);}
  return c;
}
// Concrete (microcement): an even gray with soft blotches and fine grain; the blotches are also drawn shifted by the width, so there is no seam.
function concrete(base=[168,167,163]){
  const c=canvas(),g=c.getContext('2d'),r=rng(21);g.fillStyle=rgb(base);g.fillRect(0,0,N,N);
  for(let i=0;i<70;i++){const x=r()*N,y=r()*N,rad=60+r()*260,l=r()<.5,a=.02+r()*.04;
    for(const dx of [-N,0,N])for(const dy of [-N,0,N]){const gr=g.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,rad);gr.addColorStop(0,l?`rgba(255,255,255,${a})`:`rgba(60,58,55,${a})`);gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x+dx-rad,y+dy-rad,rad*2,rad*2);}}
  for(let i=0;i<26000;i++){g.fillStyle=r()<.5?'rgba(255,255,255,.06)':'rgba(40,40,38,.06)';g.fillRect(r()*N,r()*N,1.4,1.4);}
  return c;
}
// Carpet: soft pile, dense fine grain and a slight tone variation.
function carpet(base=[155,149,139]){
  const c=canvas(),g=c.getContext('2d'),r=rng(31);g.fillStyle=rgb(base);g.fillRect(0,0,N,N);
  for(let i=0;i<40;i++){const x=r()*N,y=r()*N,rad=60+r()*120,a=.02+r()*.025;for(const dx of [-N,0,N])for(const dy of [-N,0,N]){const gr=g.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,rad);gr.addColorStop(0,`rgba(${r()<.5?'255,255,255':'50,45,40'},${a})`);gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x+dx-rad,y+dy-rad,rad*2,rad*2);}}
  for(let i=0;i<140000;i++){g.fillStyle=r()<.5?'rgba(255,250,240,.07)':'rgba(45,40,35,.08)';g.fillRect(r()*N,r()*N,1,1);}
  // tufts a few millimetres across, so the pile still reads from across the room (D-080: the carpet looked a flat colour)
  for(let i=0;i<26000;i++){g.fillStyle=r()<.5?'rgba(255,250,240,.06)':'rgba(40,35,30,.07)';g.fillRect(r()*N,r()*N,3,3);}
  return c;
}
// Lawn: mown grass — soft lighter and darker patches (drawn shifted by the width too, no seam) and thousands of short blades leaning
// every way in greens from olive to fresh, a few dry ones.
function grass(base=[86,110,64]){
  const c=canvas(),g=c.getContext('2d'),r=rng(41);g.fillStyle=rgb(base);g.fillRect(0,0,N,N);
  for(let i=0;i<60;i++){const x=r()*N,y=r()*N,rad=80+r()*240,l=r()<.5,a=.04+r()*.06;
    for(const dx of [-N,0,N])for(const dy of [-N,0,N]){const gr=g.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,rad);gr.addColorStop(0,l?`rgba(170,190,120,${a})`:`rgba(40,55,30,${a})`);gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x+dx-rad,y+dy-rad,rad*2,rad*2);}}
  g.lineCap='round';
  for(let i=0;i<22000;i++){const x=r()*N,y=r()*N,a=r()*Math.PI*2,L=4+r()*7,k=.75+r()*.6,dry=r()<.04;
    g.strokeStyle=dry?`rgba(196,180,120,.5)`:rgb([base[0]*(.85+r()*.3),base[1],base[2]*(.8+r()*.4)],k,.55);g.lineWidth=1+r()*1.2;
    for(const dx of x<12?[0,N]:x>N-12?[0,-N]:[0])for(const dy of y<12?[0,N]:y>N-12?[0,-N]:[0]){g.beginPath();g.moveTo(x+dx,y+dy);g.lineTo(x+dx+Math.cos(a)*L,y+dy+Math.sin(a)*L);g.stroke();}}
  return c;}
// Gravel: small rounded stones of warm grays, packed, with shadows under them.
function gravel(base=[176,168,154]){
  const c=canvas(),g=c.getContext('2d'),r=rng(43);g.fillStyle=rgb(base,.82);g.fillRect(0,0,N,N);
  for(let i=0;i<9000;i++){const x=r()*N,y=r()*N,rx=3+r()*5,ry=rx*(.6+r()*.4),a=r()*Math.PI,k=.8+r()*.4;
    for(const dx of x<10?[0,N]:x>N-10?[0,-N]:[0])for(const dy of y<10?[0,N]:y>N-10?[0,-N]:[0]){
      g.fillStyle='rgba(40,36,30,.25)';g.beginPath();g.ellipse(x+dx+1.2,y+dy+1.6,rx,ry,a,0,Math.PI*2);g.fill();
      g.fillStyle=rgb(base,k);g.beginPath();g.ellipse(x+dx,y+dy,rx,ry,a,0,Math.PI*2);g.fill();}}
  return c;}
// Marble: slabs with soft clouds and thin veins (also drawn shifted by the width, so there is no seam at the repeat).
function marble(base,cols,rows,seed){const c=tiles(base,cols,rows,seed,{blots:6,grout:`rgba(${base.map(v=>v*.7|0).join(',')},.35)`}),g=c.getContext('2d'),r=rng(seed+100);
  for(let i=0;i<14;i++){let x=r()*N,y=r()*N,a=r()*Math.PI*2;const pts=[[x,y]];for(let k=0;k<40;k++){a+=(r()-.5)*.6;x+=Math.cos(a)*14;y+=Math.sin(a)*14;pts.push([x,y]);}
    const w=.4+r()*1.4,al=.06+r()*.14;for(const dx of [-N,0,N])for(const dy of [-N,0,N]){g.strokeStyle=`rgba(${base.map(v=>v*.55|0).join(',')},${al})`;g.lineWidth=w;g.beginPath();pts.forEach(([px,py],k)=>k?g.lineTo(px+dx,py+dy):g.moveTo(px+dx,py+dy));g.stroke();}}
  return c;}
// Checker: tiles of two alternating colors.
function checker(base,alt,cols,seed){const c=canvas(),g=c.getContext('2d'),r=rng(seed),w=N/cols;
  for(let i=0;i<cols;i++)for(let j=0;j<cols;j++){const col=(i+j)%2?alt:base,k=.98+r()*.04;g.fillStyle=rgb(col,k);g.fillRect(i*w,j*w,w,w);
    for(let n=0;n<500;n++){g.fillStyle=r()<.5?'rgba(255,255,255,.05)':'rgba(40,40,40,.05)';g.fillRect(i*w+r()*w,j*w+r()*w,1.3,1.3);}}
  g.fillStyle='rgba(120,120,116,.5)';for(let i=0;i<=cols;i++){g.fillRect(i*w-1.5,0,3,N);g.fillRect(0,i*w-1.5,N,3);}return c;}
// Draw a covering: a custom color (tint) replaces the base one; the tile joint is derived from the color.
function drawFloor(kind,tint){const K=FLOOR_KINDS[kind],base=unhex(tint)||K.base,grout=`rgba(${base.map(v=>v*.62|0).join(',')},.55)`;
  switch(K.pattern){
    case 'planks':return wood(base,K.seed);case 'herringbone':return herringbone(base);case 'concrete':return concrete(base);case 'carpet':return carpet(base);case 'grass':return grass(base);case 'gravel':return gravel(base);
    case 'marble':return marble(base,K.cols,K.rows,K.seed);case 'checker':return checker(base,K.alt,K.cols,K.seed);
    default:return tiles(base,K.cols,K.rows,K.seed,{blots:K.blots||0,grout});}}
const texCache=new Map(),swCache=new Map(),drawn=new Map();
const drawOnce=(kind,tint)=>{const k=kind+'|'+(tint||'');if(!drawn.has(k))drawn.set(k,drawFloor(kind,tint));return drawn.get(k);}; // drawn once, both for 3D and for the swatch
// A floor swatch for the room panel: a ~60 cm piece of the texture, 48 px.
export function floorSwatch(kind,tint){const key=kind+'|'+(tint||'');if(!swCache.has(key)){const src=drawOnce(kind,tint),c=document.createElement('canvas');c.width=c.height=48;const k=Math.min(1,.6/FLOOR_KINDS[kind].size);
  c.getContext('2d').drawImage(src,0,0,N*k,N*k,0,0,48,48);swCache.set(key,c.toDataURL());}return swCache.get(key);}
export function floorTexture(kind,anisotropy=8,tint){const key=kind+'|'+(tint||'');
  if(!texCache.has(key)){const t=new THREE.CanvasTexture(drawOnce(kind,tint));t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=anisotropy;texCache.set(key,t);}
  return texCache.get(key);
}
// Floor UV mapping: plan meters rotated along the longest edge of the room (planks run along the room, tiles square with the walls).
export function floorUV(geometry,polygon,size){
  let best=0,ang=0;
  for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l>best){best=l;ang=Math.atan2(b[1]-a[1],b[0]-a[0]);}}
  const c=Math.cos(-ang),s=Math.sin(-ang),pos=geometry.attributes.position,uv=geometry.attributes.uv;
  // the ShapeGeometry is already rotated into the floor: x is plan x, z is minus plan y
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=-pos.getZ(i);uv.setXY(i,(x*c-y*s)/size,(x*s+y*c)/size);}
  uv.needsUpdate=true;
}

// ---------- wall finish ----------
// pattern: paint, grid (tiles in a grid), bond (staggered tiles, “subway tile”), brick, slats (vertical
// battens), concrete; w×h is the tile size (m), joint is the joint (m), panel means tiles only up to this height, paint above.
// The user picks the room's finish (room.wall, room.wallTint) and, optionally, one for a single edge (room.wf[i] = {k, tint});
// if nothing is picked, it goes by name (wallGuess): bathroom and toilet get white tiles up to the ceiling (the owner), everything else warm white.
const WP=t('Paint'),WPL=t('Plaster'),WWP=t('Wallpaper'),WT=t('Tile'),WB=t('Brick'),WW=t('Wood'),WO=t('Other');
export const WALL_KINDS={
  paintWarm:{label:t('Warm white'),pattern:'paint',base:[240,236,229],group:WP},
  paintWhite:{label:t('White'),pattern:'paint',base:[247,247,245],group:WP},
  paintGrey:{label:t('Light gray'),pattern:'paint',base:[214,214,211],group:WP},
  paintGreige:{label:t('Greige'),pattern:'paint',base:[206,198,186],group:WP},
  paintBeige:{label:t('Beige|surface'),pattern:'paint',base:[228,214,192],group:WP},
  paintPink:{label:t('Blush'),pattern:'paint',base:[224,199,192],group:WP},
  paintSage:{label:t('Sage'),pattern:'paint',base:[180,190,170],group:WP},
  paintOlive:{label:t('Olive'),pattern:'paint',base:[142,142,110],group:WP},
  paintBlue:{label:t('Light blue'),pattern:'paint',base:[178,197,211],group:WP},
  paintNavy:{label:t('Navy|surface'),pattern:'paint',base:[64,78,100],group:WP},
  paintTerra:{label:t('Terracotta'),pattern:'paint',base:[190,122,94],group:WP},
  paintGraphite:{label:t('Graphite'),pattern:'paint',base:[88,90,94],group:WP},
  // textures (D-062: the examples looked flat with paint alone): trowelled and lime plaster, wallpapers, classic and fluted panels, marble, zellige
  plaster:{label:t('Venetian plaster'),pattern:'plaster',base:[208,198,184],group:WPL},
  plasterLime:{label:t('Limewash'),pattern:'limewash',base:[222,214,200],group:WPL},
  plasterClay:{label:t('Clay plaster'),pattern:'limewash',base:[188,158,130],group:WPL},
  plasterCharcoal:{label:t('Charcoal plaster'),pattern:'plaster',base:[86,84,82],group:WPL},
  wallpaperStripe:{label:t('Striped wallpaper'),pattern:'stripes',base:[206,198,182],w:.1,group:WWP},
  wallpaperDeco:{label:t('Art deco wallpaper'),pattern:'deco',base:[52,70,64],w:.26,h:.26,group:WWP},
  wallpaperLinen:{label:t('Linen wallpaper'),pattern:'linen',base:[214,206,192],group:WWP},
  tileWhite:{label:t('White tile 60×30'),pattern:'grid',base:[238,238,234],w:.6,h:.3,joint:.002,group:WT},
  tileSquare:{label:t('White tile 20×20'),pattern:'grid',base:[240,240,236],w:.2,h:.2,joint:.002,group:WT},
  tileSubway:{label:t('Subway tile'),pattern:'bond',base:[242,242,238],w:.15,h:.075,joint:.002,group:WT},
  tileSubwayGreen:{label:t('Green subway tile'),pattern:'bond',base:[118,150,130],w:.15,h:.075,joint:.002,group:WT},
  tileGrey:{label:t('Gray tile 60×30'),pattern:'grid',base:[170,170,168],w:.6,h:.3,joint:.002,group:WT},
  tileStone:{label:t('Porcelain 120×60'),pattern:'grid',base:[196,188,176],w:1.2,h:.6,joint:.002,group:WT},
  tilePanel:{label:t('Tile up to 1.2 m'),pattern:'bond',base:[242,242,238],w:.15,h:.075,joint:.002,panel:1.2,group:WT},
  zellige:{label:t('Zellige tile'),pattern:'zellige',base:[110,140,134],w:.1,h:.1,joint:.002,group:WT},
  zelligeWhite:{label:t('White zellige'),pattern:'zellige',base:[236,232,222],w:.1,h:.1,joint:.002,group:WT},
  marble:{label:t('Marble'),pattern:'marble',base:[232,229,224],w:1.2,h:2.4,group:WT},
  marbleGreen:{label:t('Green marble'),pattern:'marble',base:[66,92,80],w:1.2,h:2.4,group:WT},
  brickWhite:{label:t('White brick'),pattern:'brick',base:[230,226,218],w:.25,h:.075,joint:.01,group:WB},
  brickRed:{label:t('Red brick'),pattern:'brick',base:[164,86,64],w:.25,h:.075,joint:.01,group:WB},
  brickGrey:{label:t('Gray brick'),pattern:'brick',base:[140,136,130],w:.25,h:.075,joint:.01,group:WB},
  slatsOak:{label:t('Oak slats'),pattern:'slats',base:[178,147,114],w:.04,joint:.012,group:WW},
  slatsWalnut:{label:t('Walnut slats'),pattern:'slats',base:[118,86,62],w:.04,joint:.012,group:WW},
  slatsBlack:{label:t('Black slats'),pattern:'slats',base:[46,46,48],w:.04,joint:.012,group:WW},
  panelsWood:{label:t('Wood panels'),pattern:'slats',base:[198,164,124],w:.16,joint:.003,group:WW},
  panelsClassic:{label:t('Classic panels'),pattern:'boiserie',base:[232,228,220],w:.9,h:.95,group:WW}, // w — panel width, h — the dado rail
  flutedWhite:{label:t('Fluted panels'),pattern:'fluted',base:[232,228,220],w:.045,group:WW},
  flutedOak:{label:t('Fluted oak'),pattern:'fluted',base:[176,140,102],w:.045,group:WW},
  concrete:{label:t('Concrete'),pattern:'concrete',base:[176,174,170],group:WO},
  microcement:{label:t('Microcement'),pattern:'concrete',base:[212,206,198],group:WO},
};
export const WALL_QUICK=['paintWarm','paintWhite','paintGrey','paintGreige','paintSage','tileWhite','brickWhite','slatsOak'];
export const WALL_GROUPS=[WP,WPL,WWP,WT,WB,WW,WO].map(g=>[g,Object.keys(WALL_KINDS).filter(k=>WALL_KINDS[k].group===g)]);
export const wallGuess=room=>BATH.test(`${room?.name||''} ${room?.id||''}`.toLowerCase())?'tileWhite':'paintWarm';
// the finish of the room and of edge i: {k, tint, own: the edge has its own setting}
export const roomWall=room=>({k:WALL_KINDS[room?.wall]?room.wall:wallGuess(room),tint:WALL_KINDS[room?.wall]?room.wallTint:null});
export function sideWall(room,i){const o=room?.wf?.[i];return o&&WALL_KINDS[o.k]?{k:o.k,tint:o.tint||null,own:true}:{...roomWall(room),own:false};}
export const wallBase=(k,tint)=>hex(unhex(tint)||WALL_KINDS[k].base);
// A finish swatch, 48 px ≈ 60 cm of wall (the same pattern as in the shader).
const wsCache=new Map();
export function wallSwatch(k,tint){const key=k+'|'+(tint||'');if(wsCache.has(key))return wsCache.get(key);
  const K=WALL_KINDS[k],base=unhex(tint)||K.base,c=document.createElement('canvas');c.width=c.height=48;const g=c.getContext('2d'),px=48/.6,r=rng(7);
  g.fillStyle=rgb(base);g.fillRect(0,0,48,48);
  if(K.pattern==='grid'||K.pattern==='bond'||K.pattern==='brick'){const w=K.w*px,h=K.h*px,j=Math.max(1,K.joint*px);
    for(let y=0,row=0;y<48;y+=h,row++)for(let x=-((K.pattern!=='grid'&&row%2)?w/2:0);x<48;x+=w){g.fillStyle=rgb(base,K.pattern==='brick'?.88+r()*.22:.97+r()*.06);g.fillRect(x+j/2,y+j/2,w-j,h-j);}
    g.globalCompositeOperation='destination-over';g.fillStyle=K.pattern==='brick'?'rgb(170,166,158)':rgb(base,.72);g.fillRect(0,0,48,48);g.globalCompositeOperation='source-over';
    if(K.panel){g.fillStyle=rgb(WALL_KINDS.paintWarm.base);g.fillRect(0,0,48,16);}}
  else if(K.pattern==='slats'){const w=K.w*px,j=Math.max(1,K.joint*px);g.fillStyle=rgb(base,.35);g.fillRect(0,0,48,48);for(let x=0;x<48;x+=w+j){g.fillStyle=rgb(base,.9+r()*.18);g.fillRect(x,0,w,48);}}
  else if(K.pattern==='concrete'){for(let i=0;i<300;i++){g.fillStyle=r()<.5?'rgba(255,255,255,.08)':'rgba(40,40,38,.08)';g.fillRect(r()*48,r()*48,2,2);}}
  else if(K.pattern==='plaster'||K.pattern==='limewash'||K.pattern==='linen'){for(let i=0;i<40;i++){const x=r()*48,y=r()*48,R=6+r()*14,gr=g.createRadialGradient(x,y,0,x,y,R);
      gr.addColorStop(0,r()<.5?'rgba(255,255,255,.12)':'rgba(30,25,20,.10)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,48,48);}
    if(K.pattern==='linen')for(let i=0;i<48;i+=2){g.fillStyle='rgba(0,0,0,.05)';g.fillRect(i,0,1,48);g.fillRect(0,i,48,1);}}
  else if(K.pattern==='stripes'){const w=K.w*px;for(let x=w;x<48;x+=2*w){g.fillStyle=rgb(base,.86);g.fillRect(x,0,w,48);}}
  else if(K.pattern==='deco'){const w=K.w*px*1.6;g.strokeStyle='rgb(194,158,97)';g.lineWidth=1;g.beginPath();
    for(let x=-48;x<96;x+=w){g.moveTo(x,0);g.lineTo(x+48,48);g.moveTo(x+48,0);g.lineTo(x,48);}g.stroke();}
  else if(K.pattern==='boiserie'){g.strokeStyle=rgb(base,.78);g.lineWidth=1.5;g.strokeRect(6,4,36,22);g.strokeRect(6,32,36,13);g.fillStyle=rgb(base,.86);g.fillRect(0,28,48,2);}
  else if(K.pattern==='fluted'){const w=Math.max(3,K.w*px);for(let x=0;x<48;x+=w){const gr=g.createLinearGradient(x,0,x+w,0);gr.addColorStop(0,rgb(base,.62));gr.addColorStop(.5,rgb(base,1.06));gr.addColorStop(1,rgb(base,.62));g.fillStyle=gr;g.fillRect(x,0,w,48);}}
  else if(K.pattern==='marble'){const dark=base[0]+base[1]+base[2]<300;g.strokeStyle=dark?'rgba(255,255,255,.35)':'rgba(60,55,50,.3)';g.lineWidth=1;
    for(let i=0;i<4;i++){g.beginPath();g.moveTo(r()*48,0);g.bezierCurveTo(r()*48,16,r()*48,32,r()*48,48);g.stroke();}}
  else if(K.pattern==='zellige'){const w=K.w*px;for(let y=0;y<48;y+=w)for(let x=0;x<48;x+=w){g.fillStyle=rgb(base,.82+r()*.34);g.fillRect(x+.5,y+.5,w-1,w-1);}}
  const u=c.toDataURL();wsCache.set(key,u);return u;}
// The edge map: top-down, 2 cm per pixel; each room edge gets a strip 30 cm inward (ends cut along the corner bisector)
// holding a stack number. In the shader a wall reads the number 9 cm in front of its face. A stack is up to four finishes
// bottom to top with the heights where each next one starts (pieces of finish, pieces.js, D-084: tiles up to 1.5 m, a
// backsplash); a wall without pieces is a stack of one. Along an edge the stack changes where pieces start and end.
// The finish numbers index a table: color, pattern, sizes.
const FIN_PAT={paint:0,grid:1,bond:2,slats:3,concrete:4,brick:5,plaster:6,limewash:7,stripes:8,deco:9,boiserie:10,fluted:11,marble:12,zellige:13,linen:14};
const TABLE_SIZE=256; // finishes and stacks per home; number 0 is none
const BAND_STEP=.02; // stack heights in steps of 2 cm (up to 5.1 m)
const isWallKind=k=>!!WALL_KINDS[k];

/** The finish table: one entry per distinct finish (key, tint, tile size, joint). */
function finishTable(){
  const data=new Uint8Array(TABLE_SIZE*2*4),ids=new Map();
  const idOf=finish=>{
    const kind=WALL_KINDS[finish.k],width=finish.tile?.[0]??kind.w??0,height=finish.tile?.[1]??kind.h??0,joint=finish.joint??kind.joint??0;
    const key=[finish.k,finish.tint||'',width,height,joint].join('|');
    if(ids.has(key))return ids.get(key);
    if(ids.size>=TABLE_SIZE-1)return 0;
    const id=ids.size+1,base=unhex(finish.tint)||kind.base;
    ids.set(key,id);
    data.set([base[0],base[1],base[2],FIN_PAT[kind.pattern]],id*4);
    data.set([Math.round(width*100),Math.round(height*100),Math.round((kind.panel||0)*100),Math.round(joint*1000)],(TABLE_SIZE+id)*4);
    return id;
  };
  return {data,idOf,count:()=>ids.size};
}

/** The stack table: row 0 — up to four finish numbers bottom to top, row 1 — the heights where the 2nd, 3rd and 4th start. */
function stackTable(idOf){
  const data=new Uint8Array(TABLE_SIZE*2*4),ids=new Map();
  const stackId=bands=>{
    const finishes=[0,0,0,0],starts=[255,255,255,0];
    bands.forEach((band,j)=>{finishes[j]=idOf(band.finish);if(j>0)starts[j-1]=Math.min(255,Math.round(band.bottom/BAND_STEP));});
    if(!finishes[0])return 0;
    const key=finishes.join(',')+'@'+starts.join(',');
    if(ids.has(key))return ids.get(key);
    if(ids.size>=TABLE_SIZE-1)return 0;
    const id=ids.size+1;
    ids.set(key,id);
    data.set(finishes,id*4);
    data.set(starts,(TABLE_SIZE+id)*4);
    return id;
  };
  return {data,idOf:stackId};
}

export function bakeFinish(rooms,{px=.02,D=.3}={}){
  const list=rooms.filter(r=>!r.solid&&r.polygon?.length>2);if(!list.length)return null;
  const pts=list.flatMap(r=>r.polygon),x0=Math.min(...pts.map(p=>p[0]))-.5,y0=Math.min(...pts.map(p=>p[1]))-.5,x1=Math.max(...pts.map(p=>p[0]))+.5,y1=Math.max(...pts.map(p=>p[1]))+.5;
  const W=Math.ceil((x1-x0)/px),H=Math.ceil((y1-y0)/px),map=new Uint8Array(W*H*4);
  const finishes=finishTable(),stacks=stackTable(finishes.idOf);
  for(const r of list){const P=r.polygon,n=P.length,s=area(P)>0?1:-1;
    const nrm=i=>{const a=P[i],b=P[(i+1)%n],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [-(b[1]-a[1])/l*s,(b[0]-a[0])/l*s];}; // into the room
    const inset=i=>{const n1=nrm((i-1+n)%n),n2=nrm(i),d=1+n1[0]*n2[0]+n1[1]*n2[1],k=d>.2?D/d:D/.2;return [P[i][0]+(n1[0]+n2[0])*k,P[i][1]+(n1[1]+n2[1])*k];};
    const In=P.map((_,i)=>inset(i));
    for(let i=0;i<n;i++){
      const runs=edgeRuns(sideWall(r,i),edgePieces(r,i,isWallKind)),ids=runs.map(run=>stacks.idOf(run.bands));
      if(!ids.some(id=>id))continue;
      const a=P[i],b=P[(i+1)%n],dx=b[0]-a[0],dy=b[1]-a[1],lengthSquared=dx*dx+dy*dy||1;
      // which run a point of the strip is in: by where it falls along the edge
      const idAt=p=>{if(ids.length===1)return ids[0];const along=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/lengthSquared;
        for(let j=0;j<runs.length;j++)if(along<runs[j].to)return ids[j];return ids[ids.length-1];};
      const q=[a,b,In[(i+1)%n],In[i]];
      const bx0=Math.max(0,Math.floor((Math.min(...q.map(p=>p[0]))-x0)/px)),bx1=Math.min(W-1,Math.ceil((Math.max(...q.map(p=>p[0]))-x0)/px));
      const by0=Math.max(0,Math.floor((Math.min(...q.map(p=>p[1]))-y0)/px)),by1=Math.min(H-1,Math.ceil((Math.max(...q.map(p=>p[1]))-y0)/px));
      for(let y=by0;y<=by1;y++)for(let x=bx0;x<=bx1;x++){const p=[x0+(x+.5)*px,y0+(y+.5)*px];if(pointIn(p,q))map[(y*W+x)*4]=idAt(p);}}}
  const tex=new THREE.DataTexture(map,W,H);tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.needsUpdate=true;
  const table=data=>{const t=new THREE.DataTexture(data,TABLE_SIZE,2);t.magFilter=t.minFilter=THREE.NearestFilter;t.needsUpdate=true;return t;};
  return {tex,tab:table(finishes.data),stk:table(stacks.data),box:[x0,y0,1/(W*px),1/(H*px)],count:finishes.count()};
}
const area=P=>P.reduce((s,p,i)=>{const q=P[(i+1)%P.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
const pointIn=([x,y],P)=>{let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const [xi,yi]=P[i],[xj,yj]=P[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))c=!c;}return c;};
// wall shader fragment: the finish number in front of the face → color and pattern (grid, staggered, brick, slats, concrete)
export const FINISH_GLSL=`
uniform sampler2D htFin,htFinTab,htFinStk;uniform vec4 htFinBox;
float htHash(vec2 c){return fract(sin(dot(c,vec2(127.1,311.7)))*43758.5453);}
float htNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(htHash(i),htHash(i+vec2(1.,0.)),f.x),mix(htHash(i+vec2(0.,1.)),htHash(i+vec2(1.,1.)),f.x),f.y);}
vec3 htLin(vec3 c){return pow(c,vec3(2.2));}
float htFbm(vec2 p){return 0.5*htNoise(p)+0.3*htNoise(p*2.03+7.1)+0.2*htNoise(p*4.11+3.7);}
void htFinish(inout vec4 dc){
  vec3 n=normalize(htNrm);if(abs(n.y)>0.5)return;
  vec2 pl=vec2(htPos.x,-htPos.z),np=normalize(vec2(n.x,-n.z)),uv=(pl+np*0.09-htFinBox.xy)*htFinBox.zw;
  if(uv.x<=0.0||uv.y<=0.0||uv.x>=1.0||uv.y>=1.0)return;
  float stack=floor(texture2D(htFin,uv).r*255.0+0.5);if(stack<0.5)return;
  // the stack: up to four finishes bottom to top and the heights where the next ones start (pieces of finish, D-084)
  vec4 S=floor(texture2D(htFinStk,vec2((stack+0.5)/256.0,0.25))*255.0+0.5),Z=floor(texture2D(htFinStk,vec2((stack+0.5)/256.0,0.75))*255.0+0.5)*0.02;
  float id=S.r;if(htPos.y>=Z.r)id=S.g;if(htPos.y>=Z.g)id=S.b;if(htPos.y>=Z.b)id=S.a;if(id<0.5)return;
  vec4 A=texture2D(htFinTab,vec2((id+0.5)/256.0,0.25)),B=texture2D(htFinTab,vec2((id+0.5)/256.0,0.75));
  float pat=floor(A.a*255.0+0.5);vec3 col=htLin(A.rgb);
  float u=dot(pl,vec2(-np.y,np.x)),v=htPos.y,tw=max(0.01,B.r*2.55),th=max(0.01,B.g*2.55),panel=B.b*2.55,jt=B.a*0.255,aa=max(fwidth(u),fwidth(v))+1e-4;
  if(panel>0.0&&v>panel){dc.rgb=htLin(vec3(0.941,0.925,0.898));return;}
  float P=pat;bool brick=abs(P-5.0)<0.5,zel=abs(P-13.0)<0.5;
  if((P>0.5&&P<2.5)||brick||zel){float row=floor(v/th),uu=u+((P>1.5&&!zel&&mod(row,2.0)>0.5)?tw*0.5:0.0),cx=floor(uu/tw);
    vec2 f=vec2(uu-cx*tw,v-row*th);float j=min(min(f.x,tw-f.x),min(f.y,th-f.y)),m=1.0-smoothstep(jt*0.5-aa,jt*0.5+aa,j);
    vec3 tc=col*(1.0+(htHash(vec2(cx,row))-0.5)*(brick?0.22:zel?0.34:0.05));if(brick)tc*=0.9+0.18*htNoise(vec2(u,v)*60.0);
    if(zel)tc*=0.86+0.18*htNoise(f/tw*2.2+vec2(cx,row)*3.1)+0.1*smoothstep(0.0,0.35*tw,j); // handmade glaze: uneven, lighter in the middle
    col=mix(tc,brick?htLin(vec3(0.68,0.66,0.62)):col*(zel?0.84:0.74),m);}
  else if(abs(P-3.0)<0.5){float per=tw+jt,cx=floor(u/per),f=u-cx*per,g=smoothstep(tw-aa,tw+aa,f)*(1.0-smoothstep(per-aa,per,f));
    col=mix(col*(0.92+0.16*htHash(vec2(cx,3.0))),col*0.3,g);}
  else if(abs(P-4.0)<0.5)col*=(0.9+0.2*htNoise(vec2(u,v)*2.5))*(0.96+0.08*htNoise(vec2(u,v)*28.0));
  // Venetian plaster: soft clouds and diagonal trowel strokes
  else if(abs(P-6.0)<0.5){float c=htFbm(vec2(u,v)*1.3),k=htNoise(vec2(u*2.6+v*1.1,v*7.0-u*1.7));col*=0.84+0.26*c+0.08*(k-0.5);}
  // limewash, clay: brushed clouds, a faint vertical brush
  else if(abs(P-7.0)<0.5)col*=0.9+0.15*htFbm(vec2(u*0.8,v*1.3))+0.05*(htNoise(vec2(u*16.0,v*2.2))-0.5);
  // striped wallpaper: two tones and a fine line between them
  else if(abs(P-8.0)<0.5){float f=mod(u,tw*2.0);col*=mix(1.0,0.86,smoothstep(tw-aa,tw+aa,f)*(1.0-smoothstep(2.0*tw-aa,2.0*tw,f)));
    col=mix(col,col*0.72,(1.0-smoothstep(0.0015,0.0015+aa,abs(f-tw)))*0.6);}
  // art deco wallpaper: a brass lattice of diamonds with a dot in each
  else if(abs(P-9.0)<0.5){vec2 g=fract(vec2(u/tw,v/th))-0.5;float a2=aa/tw,l=1.0-smoothstep(0.008,0.008+a2*1.5,abs(abs(g.x)+abs(g.y)-0.5)),d=1.0-smoothstep(0.03,0.03+a2*1.5,length(g));
    col=mix(col,htLin(vec3(0.74,0.61,0.39)),max(l,d)*0.7);}
  // classic panels (boiserie): framed panels below and above a dado rail, a skirting; the frames lit from above
  else if(abs(P-10.0)<0.5){float dado=th,cx=floor(u/tw),fx=u-cx*tw;bool lo=v<dado;
    float y0=lo?0.16:dado+0.14,y1=lo?dado-0.1:2.38,x0=0.09,x1=tw-0.09,dx=min(fx-x0,x1-fx),dy=min(v-y0,y1-v),d=min(dx,dy);
    float e=step(0.0,d)*(1.0-smoothstep(0.016,0.016+aa,d)),lit=(dy<dx)?((v-y0)<(y1-v)?0.84:1.08):((fx-x0)<(x1-fx)?1.06:0.88);
    col*=mix(1.0,lit,e);float r=abs(v-dado);col*=mix(1.0,1.07,1.0-smoothstep(0.02,0.02+aa,r));col*=mix(1.0,0.84,1.0-smoothstep(0.0025,0.0025+aa,abs(r-0.022)));
    col*=mix(1.0,0.9,1.0-smoothstep(0.1,0.1+aa,v));}
  // fluted panels: rounded flutes with a groove between them
  else if(abs(P-11.0)<0.5){float f=fract(u/tw);col*=0.8+0.28*sin(3.14159*f);col*=mix(1.0,0.62,1.0-smoothstep(0.0,0.08+aa/tw,min(f,1.0-f)));}
  // marble: veins over a cloudy ground, slabs with fine seams; on a dark marble the veins are light
  else if(abs(P-12.0)<0.5){vec2 q=vec2(u,v);float n=htFbm(q*1.2),v1=1.0-smoothstep(0.0,0.05,abs(sin((q.x*0.9+q.y*1.6+n*4.5)*1.9))),v2=1.0-smoothstep(0.0,0.025,abs(sin((q.x*2.2-q.y*0.8+n*6.0)*2.6)));
    float lum=dot(col,vec3(0.3,0.6,0.1));vec3 vc=lum<0.15?min(col*3.5+0.1,vec3(1.0)):col*0.55;col*=0.95+0.08*n;col=mix(col,vc,v1*0.5+v2*0.3);
    float sx=mod(u,tw),sy=mod(v,th);col=mix(col,col*0.8,(1.0-smoothstep(0.0,0.0015+aa,min(min(sx,tw-sx),min(sy,th-sy))))*0.5);}
  // linen wallpaper: a fine weave, it fades out when seen from far (no shimmer)
  else if(abs(P-14.0)<0.5){float fade=1.0-smoothstep(0.002,0.01,aa);col*=0.95+fade*(0.05*htNoise(vec2(u*180.0,v*6.0))+0.05*htNoise(vec2(u*6.0,v*180.0))-0.05)+0.05*(htFbm(vec2(u,v)*2.0)-0.5);}
  dc.rgb=col;}
`;

// ---------- shading along walls (ambient occlusion) ----------
// A top-down map: for every floor point, how much the walls occlude it. In 16 directions we find the distance t to the nearest
// wall (a sweep over the grid, not rays from every point); a direction contributes 1 − t/R: a flat wall gives ½, a corner ¾,
// wall thickness does not matter. Linear falloff and a one-meter radius: (1 − (t/R)²) with R 0.6 would be more physical, but such a shadow
// fades within 10–15 cm and is invisible in a whole-apartment view.
// Interior walls and each facade side are separate: 3D hides the facade facing the camera, and its shadow on the floor fades with it.
export const AO={R:1,px:.04};
const DIRS=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1],[2,1],[1,2],[-1,2],[-2,1],[-2,-1],[-1,-2],[1,-2],[2,-1]];
function raster(g,mps,box,W,H,{erase=[]}={}){
  const path=mp=>{const p=new Path2D();for(const poly of mp)for(const ring of poly){ring.forEach(([x,y],i)=>{const X=(x-box.x)/box.px,Y=(y-box.y)/box.px;i?p.lineTo(X,Y):p.moveTo(X,Y);});p.closePath();}return p;};
  g.globalCompositeOperation='source-over';g.clearRect(0,0,W,H);g.fillStyle='#fff';for(const mp of mps)g.fill(path(mp),'evenodd');
  g.globalCompositeOperation='destination-out';for(const mp of erase)g.fill(path(mp),'evenodd');
  const d=g.getImageData(0,0,W,H).data,out=new Uint8Array(W*H);let x0=W,y0=H,x1=-1,y1=-1;
  for(let y=0,i=0;y<H;y++)for(let x=0;x<W;x++,i++)if(d[i*4+3]>127){out[i]=1;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  return {mask:out,win:[x0,y0,x1,y1]};
}
// Compute only within the walls' bounding box + R: for a facade strip that is a narrow band, not the whole map.
function occlusion({mask,win},W,H,px,R){
  const occ=new Float32Array(W*H),Rp=R/px,m=Math.ceil(Rp)+2;
  const X0=Math.max(0,win[0]-m),Y0=Math.max(0,win[1]-m),X1=Math.min(W,win[2]+m+1),Y1=Math.min(H,win[3]+m+1),w=X1-X0,h=Y1-Y0;
  if(w<=0||h<=0)return occ;
  const dist=new Float32Array(w*h),acc=new Float32Array(w*h);
  for(const [sx,sy] of DIRS){const step=Math.hypot(sx,sy);
    // t[x,y] = 0 inside a wall, otherwise t[x+sx,y+sy] + step; the traversal order ensures the neighbor in that direction is already computed
    const ya=sy>0?h-1:0,yb=sy>0?-1:h,yd=sy>0?-1:1,xa=sx>0?w-1:0,xb=sx>0?-1:w,xd=sx>0?-1:1;
    for(let y=ya;y!==yb;y+=yd){const Y=y+sy,row=(Y0+y)*W+X0;
      for(let x=xa;x!==xb;x+=xd){const i=y*w+x;
        if(mask[row+x]){dist[i]=0;continue;}const X=x+sx;dist[i]=X<0||Y<0||X>=w||Y>=h?1e9:dist[Y*w+X]+step;}}
    for(let i=0;i<w*h;i++){const t=(dist[i]-.5)/Rp;if(t<1)acc[i]+=t>0?1-t:1;}}
  // inside the wall itself, the same as at its face: ½. Otherwise the texture would blend in “fully occluded” where the floor meets the wall.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=(Y0+y)*W+X0+x;occ[j]=mask[j]?.5:acc[y*w+x]/DIRS.length;}
  return occ;
}
// plan2d comes from buildPlan2d. Returns two textures: A = (interior, S, E, N), B = (W, floor present, —, —) and the bounding box in plan meters.
export function bakeAO(plan2d,{R=AO.R,px=AO.px}={}){
  const pts=plan2d.footprint.flat(2);if(!pts.length)return null;
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  let x0=Math.min(...xs)-R,y0=Math.min(...ys)-R,W=Math.ceil((Math.max(...xs)+R-x0)/px),H=Math.ceil((Math.max(...ys)+R-y0)/px);
  const k=Math.max(1,Math.sqrt(W*H/400000));if(k>1){px*=k;W=Math.ceil(W/k);H=Math.ceil(H/k);} // a huge plan gets a coarser map rather than a slower one
  const box={x:x0,y:y0,px},ground=bands=>bands.find(b=>b.bottom===0)?.mp||[];
  const parts=[ground(plan2d.interior),...['S','E','N','W'].map(id=>ground(plan2d.sides.find(s=>s.id===id)?.bands||[]))];
  const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d',{willReadFrequently:true});
  const occ=parts.map(mp=>mp.length?occlusion(raster(g,[mp],box,W,H),W,H,px,R):null);
  const floor=raster(g,[plan2d.footprint],box,W,H,{erase:parts}).mask;
  const A=new Uint8Array(W*H*4),B=new Uint8Array(W*H*4),v=(o,i)=>o?Math.round(o[i]*255):0;
  for(let i=0;i<W*H;i++){A[i*4]=v(occ[0],i);A[i*4+1]=v(occ[1],i);A[i*4+2]=v(occ[2],i);A[i*4+3]=v(occ[3],i);B[i*4]=v(occ[4],i);B[i*4+1]=floor[i]*255;B[i*4+3]=255;}
  const tex=d=>{const t=new THREE.DataTexture(d,W,H,THREE.RGBAFormat);t.magFilter=t.minFilter=THREE.LinearFilter;t.needsUpdate=true;return t;};
  // the bounding box for the shader: origin and 1/size in plan meters
  return {A:tex(A),B:tex(B),box:new THREE.Vector4(x0,y0,1/(W*px),1/(H*px))};
}
// Shared shading uniforms: one map per scene. vis is whether each facade side is visible (S, E, N, W).
export function aoUniforms(){
  const blank=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1);blank.needsUpdate=true;
  return {htAoA:{value:blank},htAoB:{value:blank},htAoBox:{value:new THREE.Vector4(0,0,1,1)},htAoVis:{value:new THREE.Vector4(1,1,1,1)},
    htFin:{value:blank},htFinTab:{value:blank},htFinStk:{value:blank},htFinBox:{value:new THREE.Vector4(0,0,0,0)}, // wall finish: the edge map, the finishes, the stacks
    // strength at the floor, strength in vertical wall corners, how much shading applies to direct light (sun, lamps), radius
    htAoK:{value:new THREE.Vector4(.8,1,.65,AO.R)}};
}
// Hook the shading into MeshStandardMaterial. wall is a wall face: sample the map slightly in front of the face, the bottom of the wall darkens toward the floor
// (only on the side where the floor is), vertical corners darken full height. The floor samples the map right at the point.
export function withAO(material,uniforms,wall){
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec3 htPos;\nvarying vec3 htNrm;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      htPos=(modelMatrix*vec4(transformed,1.0)).xyz;htNrm=normalize(mat3(modelMatrix)*objectNormal);`);
    shader.fragmentShader=`varying vec3 htPos;
varying vec3 htNrm;
uniform sampler2D htAoA,htAoB;uniform vec4 htAoBox,htAoVis,htAoK;
vec2 htUV(vec2 p){return (p-htAoBox.xy)*htAoBox.zw;}
${wall?FINISH_GLSL:''}
float htOcc(vec2 uv){vec4 a=texture2D(htAoA,uv);float b=texture2D(htAoB,uv).r;
  return 1.0-(1.0-a.r)*(1.0-a.g*htAoVis.x)*(1.0-a.b*htAoVis.y)*(1.0-a.a*htAoVis.z)*(1.0-b*htAoVis.w);}
`+shader.fragmentShader.replace('#include <color_fragment>',wall?'#include <color_fragment>\n      htFinish(diffuseColor);':'#include <color_fragment>').replace('#include <aomap_fragment>',`#include <aomap_fragment>
      {vec2 p=vec2(htPos.x,-htPos.z);float occ;
      ${wall?`vec3 n=normalize(htNrm);float side=1.0-abs(n.y);vec2 uv=htUV(p+vec2(n.x,-n.z)*0.06);
        float floorHere=texture2D(htAoB,uv).g,fl=1.0-clamp(htPos.y/htAoK.w,0.0,1.0);
        occ=side*(0.5*fl*fl*floorHere+htAoK.y*max(0.0,htOcc(uv)-0.5));`
      :`occ=htOcc(htUV(p));`}
      float ao=1.0-htAoK.x*clamp(occ,0.0,1.0);
      reflectedLight.indirectDiffuse*=ao;reflectedLight.indirectSpecular*=ao;reflectedLight.directDiffuse*=mix(1.0,ao,htAoK.z);}`);
  };
  material.customProgramCacheKey=()=>wall?'ht-ao-wall':'ht-ao-floor';
  return material;
}
