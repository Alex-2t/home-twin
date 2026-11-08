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
