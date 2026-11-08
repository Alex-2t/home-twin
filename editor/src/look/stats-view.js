// “Statistics” markup — like 3d_floor/apartment/smart-home/web/src/stats-view.js (D-049): tiles in the overview and a section screen
// built from shared blocks (total, legend, bars, lines, hours of the day, list). Data comes from stats.js. The room color is categorical,
// in the fixed order of plan rooms (colour(id) — from look.js); the name always sits next to it. Each chart is registered
// in charts — look.js uses it to build the hover tooltip (statsTip) without parsing the markup back.
import {PERIODS,SECTIONS,COMFORT,CO2_LIMIT,REST,NOROOM,sectionTile,formatHours,formatNumber,formatEnergy,formatPower,bucketLabel,bucketTitle,periodCaption} from './stats.js';
import {icon} from './icons.js';
import {t} from '../i18n/i18n.js';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const times=n=>t('{0, plural, one {# time} other {# times}}',Math.round(n));
// grid step: 1, 2, 2.5, 5 × 10ⁿ — so there are three or four divisions
export function niceStep(max,lines=3){if(!(max>0))return 1;const raw=max/lines,pow=10**Math.floor(Math.log10(raw));return [1,2,2.5,5,10].map(k=>k*pow).find(s=>s>=raw);}

// ---------- overview ----------
// The energy tile is large, like the light tile in 3d_floor: the 30-day total, bars by day and the room that uses the most
export function energyTileMarkup(s,roomName){
  if(!s)return `<button class="stats-tile" data-action="stats-open" data-section="energy" aria-label="${escape(t('Energy statistics'))}"><span class="stats-tile-top">
    <span class="mini-chip">${icon('bolt')}</span><span class="stats-tile-head"><strong>${escape(t('Energy'))}</strong><small>${escape(t('Calculating…'))}</small></span></span></button>`;
  const max=Math.max(...s.buckets.map(b=>b.total),1e-6),top=s.groups.filter(g=>g.id!==REST&&g.id!==NOROOM).sort((a,b)=>b.value-a.value)[0];
  const bars=s.buckets.map(b=>`<i class="${b.covered?'':'empty'}" style="height:${b.covered?Math.max(4,b.total/max*100).toFixed(1):0}%"></i>`).join('');
  return `<button class="stats-tile" data-action="stats-open" data-section="energy" aria-label="${escape(t('Energy statistics'))}: ${escape(formatEnergy(s.total))} ${escape(periodCaption(s))}">
    <span class="stats-tile-top"><span class="mini-chip">${icon('bolt')}</span>
      <span class="stats-tile-head"><strong>${escape(t('Energy'))}</strong><small>${escape(periodCaption(s))}</small></span><b class="stats-tile-total">${escape(formatEnergy(s.total))}</b></span>
    <span class="stats-mini" aria-hidden="true">${bars}</span>
    <small class="stats-tile-sub">≈ ${escape(formatEnergy(s.perDay))} ${escape(t('per day'))}${top?.value>0?` · ${escape(t('most: {0}',roomName(top.id)))}`:''}</small></button>`;}
// Small tiles of the other sections: one number and a caption
export function sectionTilesMarkup(ids,data){
  return ids.map(id=>{const s=SECTIONS.find(x=>x.id===id),tile=sectionTile(id,data[id]);
    return `<button class="mini-tile stats-mini-tile" data-action="stats-open" data-section="${id}" aria-label="${escape(t('Statistics'))}: ${escape(t(s.label))}">
      <span class="mini-chip">${icon(s.icon)}</span><span class="mini-text"><strong>${escape(t(s.label))}${tile?` <b>${escape(tile.value)}</b>`:''}</strong>
      <small>${escape(tile?.sub||(data[id]===undefined?t('Calculating…'):t('No data yet')))}</small></span></button>`;}).join('');}

// ---------- shared blocks ----------
function summary(big,caption,facts){
  return `<div class="stats-summary"><div class="stats-total"><b>${escape(big)}</b><span>${escape(caption)}</span></div>
    <div class="stats-facts">${facts.filter(Boolean).map(([v,label])=>`<span><b>${escape(v)}</b>${escape(label)}</span>`).join('')}</div></div>`;}
function legend(series,{filter=false,selected=null}={}){
  return `<div class="stats-rooms" role="group" aria-label="${escape(filter?t('Rooms: tap to keep one'):t('Legend'))}">${series.map(s=>filter
    ?`<button class="stats-room" data-action="stats-room" data-room="${escape(s.id)}" data-highlight="${escape(s.room||'')}" aria-pressed="${selected===s.id}" style="--c:${s.colour}"><i></i><span>${escape(s.name)}</span>${s.value!=null?`<small>${escape(s.value)}</small>`:''}</button>`
    :`<span class="stats-room static" ${s.room?`data-highlight="${escape(s.room)}"`:''} style="--c:${s.colour}"><i></i><span>${escape(s.name)}</span>${s.value!=null?`<small>${escape(s.value)}</small>`:''}</span>`).join('')}</div>`;}
function grid(top,format){const step=niceStep(top),max=Math.max(step,Math.ceil(top/step)*step),ticks=[];for(let v=0;v<=max+1e-9;v+=step)ticks.push(v);
  return {max,html:`<div class="stats-grid">${ticks.map(v=>`<span style="bottom:${(v/max*100).toFixed(2)}%"><em>${v?escape(format(v)):''}</em></span>`).join('')}</div>`};}
function xLabel(s,b,i,n){const every=s.bucket==='month'||s.period==='week'?1:5;return every===1||i%every===0||i===n-1?escape(bucketLabel(b.start,s.bucket,s.period)):'';}
// bars with stacked parts; series — [{id, name, colour}] bottom to top in a fixed order
function bars(id,s,series,charts,{format,label}){
  const max=Math.max(...s.buckets.map(b=>series.reduce((a,x)=>a+(b.parts[x.id]||0),0)),0),g=grid(max,format);
  const cols=s.buckets.map((b,i)=>{const total=series.reduce((a,x)=>a+(b.parts[x.id]||0),0);
    const parts=series.filter(x=>(b.parts[x.id]||0)>g.max*.004).map(x=>`<i style="flex-grow:${b.parts[x.id].toFixed(3)};background:${x.colour}"></i>`).join('');
    return `<div class="stats-col${b.covered?'':' empty'}" data-i="${i}"><div class="stats-stack" style="height:${(total/g.max*100).toFixed(2)}%">${parts}</div>
      <span class="stats-x">${xLabel(s,b,i,s.buckets.length)}</span></div>`;}).join('');
  charts[id]={kind:'bars',stats:s,series,format};
  return `<div class="stats-chart" data-chart="${id}" role="img" aria-label="${escape(label)}">${g.html}<div class="stats-cols">${cols}</div></div>`;}
// lines over the bars (average temperature by room); values(b) — {id: value}
function lines(id,s,series,charts,{values,format,label}){
  const all=s.buckets.flatMap(b=>series.map(x=>values(b)[x.id]).filter(Number.isFinite));if(!all.length)return '';
  let lo=Math.floor(Math.min(...all)-.5),hi=Math.ceil(Math.max(...all)+.5);if(hi-lo<3){const pad=(3-(hi-lo))/2;lo=Math.floor(lo-pad);hi=Math.ceil(hi+pad);}
  const n=s.buckets.length,x=i=>(i+.5)/n*100,y=v=>100-(v-lo)/(hi-lo)*100;
  const paths=series.map(z=>{let d='',pen=false;s.buckets.forEach((b,i)=>{const v=values(b)[z.id];if(!Number.isFinite(v)){pen=false;return;}d+=`${pen?'L':'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`;pen=true;});
    return d?`<path d="${d}" style="stroke:${z.colour}"/>`:'';}).join('');
  const step=niceStep(hi-lo,3),ticks=[];for(let v=Math.ceil(lo/step)*step;v<=hi+1e-9;v+=step)ticks.push(v);
  const cols=s.buckets.map((b,i)=>`<div class="stats-col${b.covered?'':' empty'}" data-i="${i}"><span class="stats-x">${xLabel(s,b,i,n)}</span></div>`).join('');
  charts[id]={kind:'lines',stats:s,series,values,format};
  return `<div class="stats-chart lines" data-chart="${id}" role="img" aria-label="${escape(label)}">
    <div class="stats-grid">${ticks.map(v=>`<span style="bottom:${(100-y(v)).toFixed(2)}%"><em>${escape(format(v))}</em></span>`).join('')}</div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">${paths}</svg><div class="stats-cols">${cols}</div></div>`;}
// hours of the day: area and line; labels and crosshair — as markup on top
function profile(id,values,charts,{title,hint,tip}){const max=Math.max(...values,1e-6)*1.12,x=h=>(h/23*240).toFixed(2),y=v=>(60-v/max*56).toFixed(2);
  const line=values.map((v,h)=>`${h?'L':'M'}${x(h)},${y(v)}`).join('');charts[id]={kind:'profile',values,max,tip};
  return `<div class="section-label">${escape(title)}</div>
    <div class="stats-hours" data-chart="${id}" role="img" aria-label="${escape(title)}"><svg viewBox="0 0 240 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path class="stats-hours-area" d="${line}L240,60L0,60Z"/><path class="stats-hours-line" d="${line}"/></svg>
      <div class="stats-hours-x"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div><i class="stats-cross" hidden></i><i class="stats-dot" hidden></i>
    </div>${hint?`<p class="stats-hint">${escape(hint)}</p>`:''}`;}
const peakHour=v=>v.reduce((best,x,h)=>x>v[best]?h:best,0);
// list with a bar: name, sub, colour, value (bar length), main, side, room (highlight)
function rank(rows,{idle=.05,wide=false}={}){const max=Math.max(...rows.map(r=>r.value),1e-6);
  return `<div class="stats-lamps${wide?' wide':''}">${rows.map(r=>`<div class="stats-lamp${r.value<idle?' idle':''}" ${r.room?`data-highlight="${escape(r.room)}"`:''} style="--c:${r.colour}">
      <span class="stats-lamp-name"><strong>${escape(r.name)}</strong>${r.sub?`<small>${escape(r.sub)}</small>`:''}</span>
      <span class="stats-lamp-bar"><i style="width:${(r.value/max*100).toFixed(1)}%"></i></span>
      <span class="stats-lamp-value"><b>${escape(r.main)}</b>${r.side?`<small>${escape(r.side)}</small>`:''}</span></div>`).join('')}</div>`;}
const note=text=>`<p class="metrics-note">${escape(text)}</p>`;

// ---------- screen ----------
// → {html, charts}. o: {section, sections, period, room, rooms:[{id, short}], colour(id), demo, loading}
export function statsViewMarkup(data,o){const charts={},shown=SECTIONS.filter(s=>o.sections.includes(s.id));
  const tabs=`<div class="stats-sections" role="tablist" aria-label="${escape(t('Section'))}" style="--n:${shown.length}">${shown.map(s=>
    `<button role="tab" data-action="stats-section" data-id="${s.id}" aria-selected="${s.id===o.section}">${icon(s.icon)}<span>${escape(t(s.label))}</span></button>`).join('')}</div>`;
  const periods=`<div class="stats-periods" role="tablist" aria-label="${escape(t('Period'))}">${PERIODS.map(p=>
    `<button role="tab" data-action="stats-period" data-id="${p.id}" aria-selected="${p.id===o.period}">${escape(t(p.label))}</button>`).join('')}</div>`;
  const body=!data||data.empty?`<p class="stats-empty">${escape(o.loading?t('Calculating…'):t('No data yet'))}</p>`:({climate:climateBody,energy:energyBody,health:healthBody})[o.section](data,o,charts);
  return {html:`${tabs}${periods}${body}<div class="stats-tip" role="tooltip" hidden></div>`,charts};}
const nameOf=o=>id=>o.rooms.find(r=>r.id===id)?.short||'';

function climateBody(c,o,charts){const roomName=nameOf(o),order=o.rooms.filter(r=>c.rooms.some(x=>x.room===r.id&&x.temperature));
  const temps=c.rooms.filter(r=>r.temperature);
  // a shared range scale: from the coldest to the warmest room
  const lo=Math.floor(Math.min(...temps.map(r=>r.temperature.min),COMFORT.temperature[0])),hi=Math.ceil(Math.max(...temps.map(r=>r.temperature.max),COMFORT.temperature[1]));
  const pos=v=>((v-lo)/Math.max(1,hi-lo)*100).toFixed(1);
  const rows=c.rooms.map(r=>{const tm=r.temperature,hm=r.humidity,co2=r.co2;
    // humidity “normal” is shown only when it is noticeable: the rest of the time it is simply there
    const facts=[hm&&`${t('humidity')} ${formatNumber(hm.mean,0)}%${hm.comfort!=null&&hm.comfort<.8?`, ${t('normal {0}% of the time',Math.round(hm.comfort*100))}`:''}`,
      co2&&`CO₂ ${formatNumber(co2.mean,0)} ppm${co2.over?`, ${t('above {0}: {1}',CO2_LIMIT,formatHours(co2.over))}`:''}`].filter(Boolean);
    return `<div class="stats-climate-row" data-highlight="${escape(r.room)}" style="--c:${o.colour(r.room)}">
      <span class="stats-lamp-name"><strong>${escape(roomName(r.room))}</strong>${tm?.comfort!=null?`<small>${escape(t('comfort {0}%',Math.round(tm.comfort*100)))}</small>`:''}</span>
      ${tm?`<span class="stats-range" aria-label="${escape(t('from {0} to {1}°',formatNumber(tm.min),formatNumber(tm.max)))}"><i class="band" style="left:${pos(tm.min)}%;right:${(100-pos(tm.max)).toFixed(1)}%"></i><i class="mark" style="left:${pos(tm.mean)}%"></i></span>
      <span class="stats-lamp-value"><b>${escape(formatNumber(tm.mean))}°</b><small>${escape(formatNumber(tm.min))}…${escape(formatNumber(tm.max))}°</small></span>`:'<span></span><span></span>'}
      ${facts.length?`<small class="stats-climate-facts">${escape(facts.join(' · '))}</small>`:''}</div>`;}).join('');
  const series=order.map(r=>({id:r.id,name:r.short,colour:o.colour(r.id),room:r.id}));
  return `${summary(c.mean!=null?formatNumber(c.mean)+'°':'—',t('average, {0}',periodCaption(c)),[c.comfort!=null&&[`${Math.round(c.comfort*100)}%`,t('in comfort')]])}
    ${temps.length?`<div class="stats-climate-row scale" aria-hidden="true"><span></span><span class="stats-climate-scale"><span>${lo}°</span><span>${hi}°</span>
      <i style="left:${pos(COMFORT.temperature[0])}%;right:${(100-pos(COMFORT.temperature[1])).toFixed(1)}%"><em>${COMFORT.temperature[0]}–${COMFORT.temperature[1]}°</em></i></span><span></span></div>`:''}
    <div class="stats-climate">${rows}</div>
    ${order.length?`<div class="section-label">${escape(c.bucket==='month'?t('Temperature by month'):t('Temperature by day'))}</div>${legend(series)}
    ${lines('climate-temp',c,series,charts,{values:b=>b.rooms,format:v=>formatNumber(v)+'°',label:t('Average temperature by room')})}`:''}
    ${note(t('Comfort means {0}–{1}° and {2}–{3}% humidity by hourly averages. Room sensors, Home Assistant long-term statistics.',COMFORT.temperature[0],COMFORT.temperature[1],COMFORT.humidity[0],COMFORT.humidity[1])+(o.demo?' '+t('Demo: values are made up.'):''))}`;}

function energyBody(s,o,charts){const roomName=id=>id===REST?t('Other|rest'):id===NOROOM?t('No room'):nameOf(o)(id);
  const colour=id=>id===REST?'color-mix(in srgb,var(--muted) 40%,var(--card))':id===NOROOM?'var(--muted)':o.colour(id);
  // rooms in plan order, “No room” and “Other” at the top of the stack
  const ids=[...o.rooms.map(r=>r.id).filter(id=>s.groups.some(g=>g.id===id)),...[NOROOM,REST].filter(id=>s.groups.some(g=>g.id===id))];
  const pick=o.room&&ids.includes(o.room)?o.room:null,series=ids.filter(id=>!pick||id===pick).map(id=>({id,name:roomName(id),colour:colour(id),room:id===REST||id===NOROOM?'':id}));
  const items=pick?s.items.filter(i=>(i.room||NOROOM)===pick):s.items,shown=pick?s.groups.find(g=>g.id===pick)?.value||0:s.total;
  const peak=s.profile&&peakHour(s.profile);
  return `${summary(formatEnergy(shown),`${pick?roomName(pick)+', ':''}${periodCaption(s)}`,[[`≈ ${formatEnergy(shown/s.days)}`,t('per day')],
      !pick&&s.grid&&s.count&&[`${Math.round(s.tracked/Math.max(s.total,1e-6)*100)}%`,t('by devices')]])}
    ${legend(ids.map(id=>({id,name:roomName(id),colour:colour(id),room:id===REST||id===NOROOM?'':id,value:formatEnergy(s.groups.find(g=>g.id===id).value)})),{filter:true,selected:pick})}
    ${bars('energy-days',s,series,charts,{format:formatEnergy,label:s.bucket==='month'?t('Usage by month'):t('Usage by day')})}
    ${s.profile&&!pick&&s.profile.some(v=>v>0)?profile('energy-hours',s.profile,charts,{title:t('When energy is used'),
      hint:t('Average power at this hour. Peak: {0}–{1}, ≈ {2}.',`${peak}:00`,`${peak+1}:00`,formatPower(s.profile[peak])),tip:v=>t('average {0}',formatPower(v))}):''}
    ${items.length?`<div class="section-label">${escape(t('Devices|appliances'))}</div>
    ${rank(items.map(i=>({name:i.name,sub:roomName(i.room||NOROOM),colour:colour(i.room||NOROOM),room:i.room,value:i.value,main:formatEnergy(i.value),side:`≈ ${formatEnergy(i.value/s.days)}${t('/day')}`})))}`:''}
    ${note((s.grid?t('From the grid: the meter from the Home Assistant Energy dashboard; “Other” is what no device accounts for.'):t('Devices from the Home Assistant Energy dashboard.'))+(o.demo?' '+t('Demo: values are made up.'):''))}`;}

function healthBody(d,o){const roomName=nameOf(o),bad=d.items.filter(i=>i.offline>=.5);
  // the list gets what dropped out noticeably; minute-long dropouts — one line below
  const major=d.items.filter(i=>i.offline>=.05),minor=d.items.filter(i=>i.offline<.05),days=Math.round(d.days);
  const span=t('{0, plural, one {# day} other {# days}}',days);
  return `${summary(bad.length?String(bad.length):t('All'),bad.length?t('{0, plural, one {device dropped out} other {devices dropped out}} in {1}',bad.length,span):t('online, {0}',span),[
      [formatHours(d.offline),t('offline in total')],[formatNumber(d.total,0),t('tracked')]])}
    ${major.length?rank(major.map(i=>({name:i.name,sub:[roomName(i.room),i.now===false?t('offline now'):''].filter(Boolean).join(' · '),
      colour:i.now===false?'var(--tone-alert)':i.room?o.colour(i.room):'var(--muted)',room:i.room,value:i.offline,main:formatHours(i.offline),
      side:i.drops?t('dropped {0}',times(i.drops)):i.now===false?t('the whole period'):''})),{idle:0,wide:true})
      :`<p class="stats-empty">${escape(t('No device was offline for more than a couple of minutes during this time.'))}</p>`}
    ${minor.length?`<p class="stats-hint">${escape(t('{0, plural, one {# more device dropped out for minutes} other {# more devices dropped out for minutes}}: {1}.',minor.length,minor.map(i=>i.name).join(', ')))}</p>`:''}
    ${note(`${d.restarts?t('Home Assistant restarted {0}; those minutes are not counted.',times(d.restarts))+' ':''}${t('Unavailability is only visible in the raw history, which Home Assistant keeps for 10 days by default, so the window is no longer than that.')}${o.demo?' '+t('Demo: dropouts are made up.'):''}`)}`;}

// ---------- tooltips ----------
// tooltip text for a chart: bar / point i or hour of the day
export function statsTip(chart,i){
  if(chart.kind==='profile')return `<b>${i}:00–${i+1}:00</b><span>${escape(chart.tip(chart.values[i]))}</span>`;
  const b=chart.stats.buckets[i];if(!b)return '';const title=bucketTitle(b.start,chart.stats.bucket);
  if(!b.covered)return `<b>${escape(title)}</b><span class="tip-muted">${escape(t('No data yet'))}</span>`;
  if(chart.kind==='lines'){const v=chart.values(b);
    return `<b>${escape(title)}</b>`+chart.series.filter(s=>Number.isFinite(v[s.id])).map(s=>`<span><i style="background:${s.colour}"></i>${escape(s.name)}<em>${escape(chart.format(v[s.id]))}</em></span>`).join('');}
  const parts=chart.series.map(s=>[s,b.parts[s.id]||0]).filter(([,v])=>v>=.05).sort((a,c)=>c[1]-a[1]),total=parts.reduce((s,[,v])=>s+v,0);
  return `<b>${escape(title)} · ${escape(chart.format(total))}</b>`+parts.map(([s,v])=>`<span><i style="background:${s.colour}"></i>${escape(s.name)}<em>${escape(chart.format(v))}</em></span>`).join('');}
