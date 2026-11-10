// Day / night in 3D (D-068): three modes — auto (by the sun: night after sunset, day after sunrise), always day, always night. The button
// steps through them: auto → day → night → auto. The mode and “the tip about auto was dismissed” are kept in this browser, shared by the
// editor and the HA card (in Home Assistant they share an origin): a choice made in the panel's Preview holds on the dashboard too.
const KEY='home-twin:daynight',TIP='home-twin:daynight-tip';
export const MODES=['auto','day','night'];
const get=k=>{try{return globalThis.localStorage?.getItem(k)??null;}catch{return null;}},put=(k,v)=>{try{globalThis.localStorage?.setItem(k,v);}catch{}};
export const readMode=()=>{const m=get(KEY);return MODES.includes(m)?m:'auto';};
export const saveMode=m=>put(KEY,m);
export const nextMode=m=>MODES[(MODES.indexOf(m)+1)%MODES.length];
export const isNight=(mode,sunDown)=>mode==='night'||mode==='auto'&&!!sunDown;
export const tipWanted=()=>get(TIP)!=='off';
export const tipOff=()=>{put(TIP,'off');globalThis.dispatchEvent?.(new Event('daynight-tip-off'));}; // every button puts its title back
// the mode changed in another tab or window (the editor ↔ the card): cb(mode)
export const onModeChange=cb=>globalThis.addEventListener?.('storage',e=>{if(e.key===KEY)cb(readMode());});
