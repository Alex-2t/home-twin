// “Cleaning” — the robot vacuum, as in 3d_floor/apartment/smart-home/web/src/vacuum-state.js and card.js (updateVacuum, vacuumCommand)
// (D-049): in the overview — a device row and one main button (“Start cleaning” / “Pause” / “Continue”); tapping the name opens
// the device screen with “Return to dock”. An unavailable robot shows in the overview as a small tile in “Security”.
// Only the HA standard, the same for any integration (Roborock, Xiaomi, iRobot, Ecovacs…): the vacuum.* state (cleaning,
// docked, returning, paused, idle, error), buttons by supported_features bits, commands vacuum.start / pause /
// return_to_base. Not carried over from 3d_floor: the robot on the model and the cleaning percentage (HA gives neither coordinates
// nor progress — the route there was made up), “Hallway closet” (a single apartment) — replaced by the dock room from the robot's area.
// No DOM: look.js lays out the markup.
import {t,N} from '../i18n/i18n.js';

// supported_features bits of the vacuum domain (VacuumEntityFeature)
const FEATURE={pause:4,home:16,start:8192};
const ACTIVITIES=['cleaning','returning','docked','idle','paused','error'];
const TEXT={cleaning:N('Cleaning'),returning:N('Returning to dock'),idle:N('Waiting for a command'),paused:N('Cleaning paused'),error:N('Error — needs help')};

// Robots from the HA layer: devices() → [{entity, name, area, domain: 'vacuum'}], entity(e) → {state, attributes}.
// room(area) → {id, short} — the plan room with the robot's area (its dock is there), or null.
// → [{entity, name, room, roomName, status: available | unavailable, activity, allowed: [start, pause, home]}]
export function vacuumDevices(ha,room=()=>null){
  if(!ha?.devices)return [];
  return ha.devices().filter(d=>d.domain==='vacuum').map(d=>{const x=ha.entity?.(d.entity)||null,r=room(d.area);
    const base={entity:d.entity,name:d.name||d.entity,room:r?.id||null,roomName:r?.short||null};
    if(!x||['unavailable','unknown'].includes(x.state))return {...base,status:'unavailable',activity:null,allowed:[]};
    const f=Number(x.attributes?.supported_features)||0,activity=ACTIVITIES.includes(x.state)?x.state:'idle',allowed=[];
    if(f&FEATURE.start&&activity!=='cleaning')allowed.push('start');
    if(f&FEATURE.pause&&activity==='cleaning')allowed.push('pause');
    if(f&FEATURE.home&&!['docked','returning'].includes(activity))allowed.push('home');
    return {...base,status:'available',activity,allowed};});}

// Caption under the name: what it is doing; when docked — also which room the dock is in
export function vacuumStatus(v,pending=false){
  if(pending)return t('Sending command…');
  if(v.status!=='available')return t('Device unavailable');
  if(v.activity==='docked')return v.roomName?t('Docked · {0}',v.roomName):t('Docked');
  return TEXT[v.activity]?t(TEXT[v.activity]):t('Unknown state');}

// Main button: the same one starts cleaning, pauses and continues
export function vacuumButton(v){
  const off=v.status!=='available';
  if(v.activity==='cleaning')return {label:t('Pause'),action:'pause',disabled:off||!v.allowed.includes('pause')};
  return {label:v.activity==='paused'?t('Continue'):t('Start cleaning'),action:'start',disabled:off||!v.allowed.includes('start')};}

export const vacuumHomeEnabled=v=>v.status==='available'&&v.allowed.includes('home');

// Command to HA → [domain, service], or null if the robot does not accept it right now
export function vacuumCommand(v,action){
  if(!v.allowed.includes(action))return null;
  return ['vacuum',{start:'start',pause:'pause',home:'return_to_base'}[action]];}
