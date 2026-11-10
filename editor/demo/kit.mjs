// Kit for the standalone editor's demo apartments (start screen → “Demo home”; the HA panel has no demo).
// An apartment is a module demo/<name>.mjs: export default async () => ({HA, DEMO, DEMO_UNDERLAY}). HA is the HA layer data “as from HA”
// (read by mockHA, editor/ha.js), DEMO is the plan, DEMO_UNDERLAY is the plan photo or null.
// The repository has typical.mjs (a typical three-room apartment, D-030). own.mjs is the owner's apartment: local only (.gitignore),
// the build uses it if the file exists.

// Openings: a segment along the wall line (interior wall — along its middle, exterior wall — along the room edge), opening bottom and top.
// The editor attaches them to walls on load.
export const door=(a,b,top=2.1)=>({a,b,bottom:0,top,kind:'door'});
export const win=(a,b,bottom=.85,top=2.4)=>({a,b,bottom,top,kind:'window'});
// Furniture: catalog model, centre, rotation (0 — facing south, towards −y; 90 — east; 180 — north; 270 — west), size, colour.
export const F=(id,model,x,y,rot,w,d,h,color)=>({id,model,x,y,rot,w,d,h,color});

// The kitchen's worktop (catalog TOPS: stone, white, oak, walnut, black) on every unit that has one; returns the list
const TOPPED=['kitchenBase','kitchenSink','kitchenHob','dishwasher','kitchenCorner','kitchenIsland'];
export const worktop=(furniture,top)=>{for(const f of furniture)if(TOPPED.includes(f.model))f.top=top;return furniture;};

// Lamp as from HA: an explicit h wins; otherwise a strip's height comes from its name (floor and skirting, worktop, else under the ceiling),
// a point light is on the ceiling or at 1.6 m
const isStrip=k=>['strip','cove'].includes(k);
export const haLight=l=>({id:l.id,entity:'light.'+l.id,name:l.name,area:l.room,color:l.color||'#ffce87',kind:isStrip(l.kind)?'strip':'point',
  h:l.h??(isStrip(l.kind)?(/floor|plinth|skirting/i.test(l.name)?.1:/worktop|counter/i.test(l.name)?1.4:2.5):(l.kind==='ceiling'?2.52:1.6))});

// Sensors (D-033): add(area, device, name, class, unit, value, extra) accumulates the list and states.
// extra: cat — housekeeping, daily and shape — an energy meter for “Statistics” (how much per day and when it is used).
export function sensorKit(){const sensors=[],states={};
  const add=(room,dev,name,cls,unit,v,extra={})=>{const e=`sensor.${dev}_${cls==='carbon_dioxide'?'co2':cls}`;sensors.push({entity:e,name,area:room,device:dev,cls,unit,...extra});states[e]=v;};
  return {add,sensors,states};}

// Devices for the model and the dashboard (D-048): the list (devices) and entity states as in HA (entities: state + attributes),
// “Favorites” (extra, D-049) — what the model doesn't have. The “since” time is three days ago.
export function deviceKit(){const devices=[],entities={},extra=[],since=new Date(Date.now()-3*864e5).toISOString();
  const put=(d,state)=>{devices.push(d);entities[d.entity]=state;};
  return {devices,entities,extra,
    // air conditioner: mode and setpoint, current temperature
    ac:(id,name,area,mode,temp,cur)=>put({entity:'climate.'+id,name,area,domain:'climate'},{state:mode,attributes:{hvac_modes:['off','cool','heat','auto','dry','fan_only'],temperature:temp,
      current_temperature:cur,min_temp:16,max_temp:30,target_temp_step:.5,hvac_action:mode==='off'?'off':mode==='heat'?'heating':'cooling',fan_mode:'auto',fan_modes:['auto','low','medium','high'],supported_features:1|8|128|256}}),
    // thermostat: heating only — not an air conditioner, not in the model, the dashboard shows the setpoint
    thermostat:(id,name,area,temp,cur)=>put({entity:'climate.'+id,name,area,domain:'climate'},
      {state:'heat',attributes:{hvac_modes:['off','heat'],temperature:temp,current_temperature:cur,min_temp:5,max_temp:35,target_temp_step:.5,hvac_action:'heating',supported_features:1|128|256}}),
    cover:(id,name,area,kind,pos)=>put({entity:'cover.'+id,name,area,domain:'cover',cls:kind==='blind'?'blind':'curtain'},{state:pos>0?'open':'closed',attributes:{current_position:pos,supported_features:15}}),
    // contact sensor: door or window
    contact:(id,name,area,cls,on)=>put({entity:'binary_sensor.'+id,name,area,domain:'binary_sensor',cls},{state:on?'on':'off',attributes:{device_class:cls}}),
    // “Security”: the demo camera has no frame — “Preview” draws a synthetic hallway
    camera:(id,name,area)=>put({entity:'camera.'+id,name,area,domain:'camera'},{state:'idle',attributes:{},last_changed:since}),
    // water valve — a standard valve.* (open / closed)
    valve:(id,name,area)=>put({entity:'valve.'+id,name,area,domain:'valve',cls:'water'},{state:'open',attributes:{device_class:'water'},last_changed:since}),
    // leak sensor — dry; battery charge is an entity of the same device
    leak(id,name,area,charge){const b='sensor.'+id+'_battery';put({entity:'binary_sensor.'+id,name,area,domain:'binary_sensor',cls:'moisture',battery:b},{state:'off',attributes:{device_class:'moisture'},last_changed:since});
      entities[b]={state:String(charge),attributes:{device_class:'battery',unit_of_measurement:'%'}};},
    // “Cleaning”: buttons by supported_features bits (pause 4, return to base 16, fan speed 32, start 8192), as in most integrations
    vacuum:(id,name,area)=>put({entity:'vacuum.'+id,name,area,domain:'vacuum'},{state:'docked',attributes:{supported_features:4|16|32|8192,fan_speed:'standard',fan_speed_list:['quiet','standard','turbo']},last_changed:since}),
    // “Favorites”: [entity, name, area, state] — scenes, scripts, relays, switches, a lock
    favorites(list){for(const [entity,name,area,state] of list){extra.push({entity,name,area,domain:entity.split('.')[0]});entities[entity]={state,attributes:{}};}},
  };}

// “Statistics” (HA layer: statistics, stateHistory, energy): sensor statistics — 400 days; the “Energy” dashboard — grid input and plugs;
// outages — what dropped out and how often (“Connectivity”); HA restarted 3.6 days ago (those minutes don't count)
export const stats=(grid,plugs,outages)=>({since:400,restart:3.6,energy:{grid,devices:plugs.map(d=>({statistic:`sensor.${d}_energy`}))},outages});

// Weather (HA layer: weather()): November, 3…11°, fog in the morning, sun in the afternoon, rain in the evening; hours are computed when shown.
export const WEATHER={low:3,high:11,sunrise:'07:05',sunset:'16:40',hours:['partlycloudy','partlycloudy','cloudy','cloudy','fog','fog','fog','cloudy','cloudy','partlycloudy','partlycloudy','sunny',
  'sunny','sunny','partlycloudy','partlycloudy','partlycloudy','cloudy','cloudy','rainy','rainy','cloudy','partlycloudy','partlycloudy']};

// A lamp with no HA area — to see how the wizard asks “Where is this light?”
export const NO_AREA_LAMP={id:'test_noarea',entity:'light.test_noarea',name:'Plug-in floor lamp',area:null,color:'#ffce87',kind:'point',h:1.6};

// ---------- styles: how the example homes are finished (D-062) ----------
// Without finishes every wall was the same warm white, bright and flat under the lamps; light tints wash out to white there too, so the walls
// are mid tones (they read a step lighter in 3D). A style gives the rooms quieter walls and floors
// and puts the accents where a designer would, found from the furniture: the wall behind a bed's headboard, the media wall behind the TV
// (else behind the sofa), a tiled backsplash behind the kitchen cabinets, tiled bathrooms. Kinds are the editor's (core/surfaces.js:
// WALL_KINDS, FLOOR_KINDS); room.wall and room.floor are the room's finish, room.wf[i] the finish of its edge i.
// A wall entry: '#rrggbb' — warm white paint in that color; 'kind' — a finish as it is; {k, tint} — a finish in a color.
export const STYLES={
  // light oak, limewash, sage, white zellige
  scandi:{wall:{living:{k:'plasterLime',tint:'#cfc8bb'},bed:{k:'wallpaperLinen',tint:'#c3c8ba'},kitchen:'#d2cdc4',hall:{k:'plasterLime',tint:'#c4bcae'},kids:'#b4c0c8',office:{k:'plasterLime',tint:'#c9c3b8'}},
    bed:{k:'paintSage',tint:'#7f8b73'},media:{k:'slatsOak'},sofa:{k:'paintSage',tint:'#7f8b73'},splash:{k:'zelligeWhite'},bath:'zelligeWhite',office:{k:'slatsOak'},
    floor:{living:'oakWhite',bed:'oakWhite',kids:'oakWhite',hall:'oakWhite',office:'oakWhite',kitchen:'tileWhite',bath:'tileSmall'}},
  // Venetian plaster, terracotta, walnut, sand zellige
  warm:{wall:{living:{k:'plaster',tint:'#c9b9a3'},bed:{k:'plasterClay',tint:'#c4ab95'},kitchen:'#d3c8b8',hall:{k:'plaster',tint:'#bcab94'},kids:'#cdb2a5',office:{k:'plaster',tint:'#c0ae98'}},
    bed:{k:'plaster',tint:'#a56a50'},media:{k:'slatsWalnut'},sofa:{k:'plaster',tint:'#a56a50'},splash:{k:'zellige',tint:'#c9b49c'},bath:{k:'zellige',tint:'#bfae98'},office:{k:'slatsWalnut'},
    floor:{living:'herringbone',bed:'honey',kids:'honey',hall:'herringbone',office:'honey',kitchen:'terracotta',bath:'stone'}},
  // Parisian: boiserie panels, navy, striped wallpaper, marble, herringbone and checkerboard
  classic:{wall:{living:{k:'panelsClassic',tint:'#d6d0c5'},bed:{k:'wallpaperStripe',tint:'#b9c0c7'},kitchen:'#d4cec4',hall:{k:'panelsClassic',tint:'#c9c1b4'},kids:'#b2c0cc',office:{k:'panelsClassic',tint:'#c4bdb0'}},
    bed:{k:'panelsClassic',tint:'#36425a'},media:{k:'panelsClassic',tint:'#36425a'},sofa:{k:'panelsClassic',tint:'#36425a'},splash:{k:'marble'},bath:'marble',office:{k:'panelsClassic',tint:'#36425a'},
    floor:{living:'hbLight',bed:'herringbone',kids:'herringbone',hall:'checker',office:'herringbone',kitchen:'checker',bath:'marble'}},
  // graphite plaster, fluted oak, microcement, marble
  modern:{wall:{living:{k:'plaster',tint:'#bab6af'},bed:{k:'plaster',tint:'#a9a7a2'},kitchen:'#c9c6c0',hall:'microcement',kids:'#b8bdb6',office:{k:'plaster',tint:'#b2b0aa'}},
    bed:{k:'plasterCharcoal'},media:{k:'flutedOak'},sofa:{k:'plasterCharcoal'},splash:{k:'marble'},bath:'microcement',office:{k:'slatsBlack'},
    floor:{living:'wood',bed:'wood',kids:'wood',hall:'concrete',office:'wood',kitchen:'tileGraphite',bath:'tileGraphite'}},
  // deep green: art deco wallpaper, green plaster, green marble, dark herringbone
  green:{wall:{living:{k:'plaster',tint:'#c4bfae'},bed:{k:'plaster',tint:'#adb3a0'},kitchen:'#cdc8ba',hall:{k:'plaster',tint:'#b2b09c'},kids:'#bfc6b0',office:{k:'plaster',tint:'#b7b4a2'}},
    bed:{k:'plaster',tint:'#4f5c4a'},media:{k:'wallpaperDeco'},sofa:{k:'wallpaperDeco'},splash:{k:'zellige'},bath:'marbleGreen',office:{k:'wallpaperDeco'},
    floor:{living:'hbDark',bed:'woodDark',kids:'wood',hall:'hbDark',office:'woodDark',kitchen:'stone',bath:'tileSmall'}},
  // loft: exposed red brick, concrete, black subway tile, dark wood
  loft:{wall:{living:'concrete',bed:{k:'plaster',tint:'#a8a49d'},kitchen:'concrete',hall:'concrete',kids:'#b8bdb6',office:'brickWhite'},
    bed:{k:'brickRed'},media:{k:'brickRed'},sofa:{k:'brickRed'},splash:{k:'tileSubway',tint:'#34373a'},bath:{k:'tileSubway',tint:'#34373a'},office:{k:'brickRed'},
    floor:{living:'concrete',bed:'woodDark',kids:'woodDark',hall:'concrete',office:'woodDark',kitchen:'concrete',bath:'concreteDark'}},
  // minimalist: limewash, white fluted panels, marble, whitewashed oak
  minimal:{wall:{living:{k:'plasterLime',tint:'#d5cfc5'},bed:{k:'plasterLime',tint:'#cbc5bb'},kitchen:{k:'plasterLime',tint:'#d5cfc5'},hall:{k:'plasterLime',tint:'#c9c3b9'},kids:'#c9cfcc',office:{k:'plasterLime',tint:'#cdc7bd'}},
    bed:{k:'plaster',tint:'#b5afa5'},media:{k:'flutedWhite'},sofa:{k:'flutedWhite'},splash:{k:'marble'},bath:'microcement',office:{k:'flutedWhite'},
    floor:{living:'oakWhite',bed:'oakWhite',kids:'oakWhite',hall:'oakWhite',office:'oakWhite',kitchen:'oakWhite',bath:'tile'}},
  // Japandi: beige limewash and clay, fluted oak, white zellige, whitewashed oak
  japandi:{wall:{living:{k:'plasterLime',tint:'#cdbfad'},bed:{k:'plasterClay',tint:'#c7b39d'},kitchen:{k:'plasterLime',tint:'#d3c7b6'},hall:{k:'plasterLime',tint:'#c4b6a3'},kids:'#cfc6b6',office:{k:'plasterLime',tint:'#cbbda9'}},
    bed:{k:'flutedOak'},media:{k:'flutedOak'},sofa:{k:'plasterClay',tint:'#b08f72'},splash:{k:'zelligeWhite'},bath:{k:'plasterLime',tint:'#c9bba7'},office:{k:'slatsOak'},
    floor:{living:'oakWhite',bed:'oakWhite',kids:'oakWhite',hall:'oakWhite',office:'oakWhite',kitchen:'oakWhite',bath:'stone'}},
};
const KIND=[['bath',/bath|wc|toilet|shower/i],['outdoor',/balcon|terrace|patio|garden|porch|loggia/i],['utility',/garage|utility|laundry|shed|boiler|storage|pantry|closet/i],
  ['kids',/kid|child|nursery/i],['hall',/hall|entry|corridor|stair/i],['office',/study|office/i],['living',/living|lounge|dining/i],['kitchen',/kitchen/i],['bed',/bed|guest room/i]];
const kindOf=r=>KIND.find(([,re])=>re.test(r.name+' '+r.id))?.[0]||'living';
const BEDS=['bed','bedDouble','bedSingle','sofaBed'],MEDIA=['tv','tvStand'],SOFAS=['loungeSofa','sofaCorner','sofaU'],
  KITCHEN=['kitchenBase','kitchenSink','kitchenHob','kitchenCorner','kitchenTall','dishwasher'];
const inside=([x,y],P)=>{let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const [a,b]=P[i],[u,v]=P[j];if((b>y)!==(v>y)&&x<(u-a)*(y-b)/(v-b)+a)c=!c;}return c;};
// the room edge an item stands with its back to (rot 0 faces south), within 45 cm; or -1
function backEdge(r,f){const t=f.rot*Math.PI/180,b=[f.x-Math.sin(t)*f.d/2,f.y+Math.cos(t)*f.d/2],P=r.polygon;let best=-1,bd=.45;
  P.forEach((a,i)=>{const c=P[(i+1)%P.length],dx=c[0]-a[0],dy=c[1]-a[1],l2=dx*dx+dy*dy||1,s=Math.max(0,Math.min(1,((b[0]-a[0])*dx+(b[1]-a[1])*dy)/l2)),
    d=Math.hypot(b[0]-a[0]-s*dx,b[1]-a[1]-s*dy);if(d<bd){bd=d;best=i;}});return best;}
// A home can finish a room itself (room.wall, room.floor, room.wallTint, room.wf in its module): the style then fills only what is left.
// name is a style from STYLES or a style object of the same shape.
export function dress(plan,name){const S=typeof name==='object'?name:STYLES[name];if(!S)return plan;
  for(const r of plan.rooms){const k=kindOf(r),fs=plan.furniture.filter(f=>inside([f.x,f.y],r.polygon)),edge=(f,o)=>{const i=f?backEdge(r,f):-1;
      if(i<0||r.wt?.[i]===0)return;r.wf??=r.polygon.map(()=>null);if(!r.wf[i])r.wf[i]=o;};
    const own={wall:r.wall!=null,floor:r.floor!=null};
    const put=w=>{if(own.wall)return;delete r.wallTint;if(typeof w==='object'){r.wall=w.k;if(w.tint)r.wallTint=w.tint;}else if(w.startsWith('#')){r.wall='paintWarm';r.wallTint=w;}else r.wall=w;};
    if(k==='bath')put(S.bath);
    else if(k==='outdoor'){if(!own.wall)r.wall='brickWhite';if(!own.floor)r.floor=/garden|lawn|yard/i.test(r.name+' '+r.id)?'grass':/patio|terrace|porch/i.test(r.name+' '+r.id)?'woodGrey':'stone';}
    else if(k==='utility'){if(!own.wall)r.wall='paintGrey';}
    else put(S.wall[k]||S.wall.living);
    if(S.floor[k]&&!own.floor)r.floor=S.floor[k];
    // accents: the headboard wall, the media wall (or behind the sofa), the backsplash; an office — the wall behind its desk
    if(k!=='kids')edge(fs.find(f=>BEDS.includes(f.model)&&f.model!=='sofaBed'),S.bed); // a kids' room keeps its light color
    const tv=fs.find(f=>MEDIA.includes(f.model));if(tv)edge(tv,S.media);else edge(fs.find(f=>SOFAS.includes(f.model)),S.sofa);
    for(const f of fs.filter(f=>KITCHEN.includes(f.model)))edge(f,S.splash);
    if(k==='office')edge(fs.find(f=>/desk/.test(f.model)),S.office);}
  return plan;}

// The lamps' state in an example: by day the ceiling lights are off — all of them on flooded every wall with the same warm light and the
// finishes did not show (the owner: “walls too bright and all the same”); floor, table and desk lamps stay on, a little warmth here and there
// and so do the strips (a cove, under the cabinets, behind the TV): a line of light that gives depth without flooding the walls
const COSY=/floor lamp|table lamp|desk lamp|bedside lamp|reading/i,OUT=/garden|patio|terrace|porch|string|outdoor|balcony/i;
export function daylight(HA,plan){const saved=new Map(plan.lights.map(l=>[l.id,l]));
  plan.lights=HA.lights.map(l=>({...(saved.get(l.id)||{id:l.id}),on:COSY.test(l.name)||l.kind==='strip'&&!OUT.test(l.name)}));return plan;}
