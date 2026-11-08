// UI bits: an input field on the plan, the hint bar at the top, collapsible sections.
import {t,num} from '../i18n/i18n.js';
import {icon} from './icons.js';
export const $=id=>document.getElementById(id);
export function el(html){const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild;}
export const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// An input field right on the plan at point (x, y) relative to the canvas.
// Length is entered in centimetres (a decimal comma is fine); ok for a field of type 'len' receives metres.
export function parseLen(raw){const v=parseFloat(String(raw).trim().replace(',','.'));return v>0?v/100:null;}
export function ask(x,y,label,value,{type='text',ok,cancel}={}){
  const box=$('ask'),inp=box.querySelector('input'),hint=box.querySelector('.ask-hint');box.querySelector('span').textContent=label;
  const isLen=type==='len';inp.type=isLen?'text':type;inp.inputMode=isLen?'decimal':'';inp.value=value;hint.hidden=true;Object.assign(box.style,{left:x+'px',top:y+'px',display:'flex'});inp.focus({preventScroll:true});inp.select();
  const done=v=>{box.style.display='none';inp.onkeydown=inp.onblur=null;v==null?cancel?.():ok?.(v);};
  inp.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'){const raw=inp.value.trim();if(isLen){done(parseLen(raw));return;}const v=type==='number'?parseFloat(raw.replace(',','.')):raw;done(type==='number'?(v>0?v:null):(v||null));}if(e.key==='Escape')done(null);};
  // The same click that opened the field may still take focus away: for the first 250 ms a blur does not count as cancel.
  const opened=performance.now();
  inp.onblur=()=>{if(performance.now()-opened<250){setTimeout(()=>inp.focus({preventScroll:true}));return;}done(null);};
}
// The bar above the plan: a wizard step or a hint, with buttons.
export function banner(text,buttons=[]){
  const b=$('banner');
  if(!text){b.hidden=true;b.innerHTML='';return;}
  b.hidden=false;b.innerHTML=`<span>${text}</span>`;
  for(const it of buttons){if(it instanceof Element){b.appendChild(it);continue;}const [label,fn,primary]=it;const x=el(`<button class="${primary===true?'primary':primary||''}">${esc(label)}</button>`);x.onclick=fn;b.appendChild(x);}
}

// Tooltip on an element: with a mouse — on hover (after 200 ms, without the system delay), with a finger — a tap on the info icon
// (shown until the next touch). One per page, above the element, or below it if there is no room.
let tipEl=null,tipT=0;
function tipShow(target,text){tipEl??=document.body.appendChild(el(`<div class="tip glass"></div>`));tipEl.textContent=text;tipEl.classList.add('on');
  const r=target.getBoundingClientRect(),w=tipEl.offsetWidth,h=tipEl.offsetHeight,x=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2));
  tipEl.style.left=x+'px';tipEl.style.top=(r.top-h-8>8?r.top-h-8:r.bottom+8)+'px';
  const chk=()=>{if(!tipEl.classList.contains('on'))return;if(!target.isConnected){tipHide();return;}requestAnimationFrame(chk);};requestAnimationFrame(chk);} // the panel was re-rendered — the tooltip goes away
export function tipHide(){clearTimeout(tipT);tipEl?.classList.remove('on');}
export function tip(target,text,info){
  target.addEventListener('pointerenter',e=>{if(e.pointerType!=='mouse')return;clearTimeout(tipT);tipT=setTimeout(()=>tipShow(target,text),200);});
  target.addEventListener('pointerleave',tipHide);target.addEventListener('pointerdown',tipHide);
  if(info)info.addEventListener('click',e=>{e.stopPropagation();tipShow(target,text);
    setTimeout(()=>addEventListener('pointerdown',function off(){tipHide();removeEventListener('pointerdown',off,true);},true));});
}
// Popup menu at a button: items — [icon, label, action, class]. Closes on an outside click and Escape.
let pop=null;
export function closePop(){pop?.remove();pop=null;}
export function popover(anchor,items){
  closePop();const m=el(`<div class="menu glass pop"></div>`);
  for(const [ic,label,fn,cls] of items){const b=el(`<button class="${cls||''}">${icon(ic)}${esc(label)}</button>`);b.onclick=()=>{closePop();fn();};m.appendChild(b);}
  document.body.appendChild(m);pop=m;const r=anchor.getBoundingClientRect();
  m.style.left=Math.max(8,Math.min(innerWidth-m.offsetWidth-8,r.right-m.offsetWidth))+'px';m.style.top=Math.min(innerHeight-m.offsetHeight-8,r.bottom+6)+'px';
  const off=e=>{if(!m.contains(e.target)&&e.target!==anchor&&!anchor.contains(e.target)){closePop();removeEventListener('pointerdown',off,true);}};
  setTimeout(()=>addEventListener('pointerdown',off,true));addEventListener('keydown',function esc(e){if(e.key==='Escape'){closePop();removeEventListener('keydown',esc);}});
}
// Popup at a button with any content (all floor coverings): closes on an outside click and Escape. Returns the popup.
export let popClosedAt=0;
export function panelPop(anchor,content,cls=''){
  closePop();const m=el(`<div class="menu glass pop panel ${cls}"></div>`);m.appendChild(content);document.body.appendChild(m);pop=m;
  const r=anchor.getBoundingClientRect(),w=m.offsetWidth,h=m.offsetHeight;m.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left-8))+'px';
  m.style.top=(r.bottom+6+h>innerHeight-8?Math.max(8,r.top-6-h):r.bottom+6)+'px';
  const off=e=>{if(!document.body.contains(m)){removeEventListener('pointerdown',off,true);return;}if(!m.contains(e.target)&&!anchor.contains(e.target)){closePop();popClosedAt=performance.now();removeEventListener('pointerdown',off,true);}};
  setTimeout(()=>addEventListener('pointerdown',off,true));addEventListener('keydown',function esc(e){if(e.key==='Escape'){closePop();removeEventListener('keydown',esc);}});return m;
}
// Collapsible section of the left panel; whether it is open is remembered between sessions.
const SEC='home-twin-editor:sections';
export function section(parent,key,title,{count,open=true,action}={}){
  const saved=JSON.parse(localStorage.getItem(SEC)||'{}');
  const d=el(`<details class="sec"><summary>${icon('right',14,'chev')}<span>${esc(title)}</span>${count!=null&&count!==''?`<span class="count">${esc(count)}</span>`:''}</summary><div class="sec-body"></div></details>`);
  d.open=saved[key]??open;
  d.addEventListener('toggle',()=>{const s=JSON.parse(localStorage.getItem(SEC)||'{}');s[key]=d.open;localStorage.setItem(SEC,JSON.stringify(s));});
  if(action){const b=el(`<button class="act soft" title="${esc(action[2]||'')}">${esc(action[0])}</button>`);b.onclick=e=>{e.preventDefault();e.stopPropagation();action[1]();};d.querySelector('summary').appendChild(b);}
  parent.appendChild(d);return d.querySelector('.sec-body');
}
export const fmtArea=a=>num(Math.abs(a),1)+t(' m²');
