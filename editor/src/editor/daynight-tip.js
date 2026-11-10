// The tip on hover over the day / night button (D-068): what the current mode does and what a click turns on, and “Don't show again”. It stays while the pointer is over the
// button or the tip, so its button can be pressed; once dismissed it does not show again, in the editor or the card (core/daynight.js).
// btn — the button; box — a positioned element the tip goes into (its coordinates and edges); side — above, below or right of the button.
// The look of .dn-tip is in each stylesheet (styles.css, look/card.css). While the tip is wanted the button has no title (no double tooltip):
// 'dn-tip-off' on the button (and 'daynight-tip-off' on window, core/daynight.js) tells the owners to put the title back.
import {t} from '../i18n/i18n.js';
import {tipWanted,tipOff,readMode} from '../core/daynight.js';

// the current mode, then what a click turns on (the order is core/daynight.js MODES: auto → day → night → auto)
const TEXT={auto:()=>t('Auto: night after sunset, day after sunrise.')+' '+t('Click for always day.'),
  day:()=>t('Always day, at any hour.')+' '+t('Click for always night.'),night:()=>t('Always night, at any hour.')+' '+t('Click for auto, by the sun.')};

export function dayNightTip(btn,box,side='above'){
  if(!btn||!box||btn.dataset.dnTip)return;btn.dataset.dnTip='1';
  let tip=null,timer=0;
  const close=()=>{clearTimeout(timer);tip?.remove();tip=null;},later=()=>{clearTimeout(timer);timer=setTimeout(close,220);};
  btn.addEventListener('mouseenter',()=>{clearTimeout(timer);if(!tip&&tipWanted())timer=setTimeout(open,380);});
  btn.addEventListener('mouseleave',later);btn.addEventListener('click',close);
  function open(){if(!btn.isConnected)return;
    tip=document.createElement('div');tip.className='dn-tip';tip.setAttribute('role','tooltip');tip.innerHTML='<p></p><button type="button"></button>';
    tip.querySelector('p').textContent=TEXT[readMode()]();
    const off=tip.querySelector('button');off.textContent=t("Don't show again");
    off.onclick=e=>{e.stopPropagation();tipOff();close();btn.dispatchEvent(new Event('dn-tip-off'));};
    tip.onmouseenter=()=>clearTimeout(timer);tip.onmouseleave=later;tip.onpointerdown=e=>e.stopPropagation();
    box.append(tip);
    const B=box.getBoundingClientRect(),b=btn.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight,g=8;let x,y;
    if(side==='right'){x=b.right-B.left+g;y=b.top-B.top+b.height/2-h/2;}
    else{x=b.left-B.left+b.width/2-w/2;y=side==='below'?b.bottom-B.top+g:b.top-B.top-h-g;if(side==='above'&&y<6)y=b.bottom-B.top+g;}
    tip.style.left=Math.max(6,Math.min(B.width-w-6,x))+'px';tip.style.top=Math.max(6,Math.min(B.height-h-6,y))+'px';}
}
