// The editor's address (D-066): the page that is open, so a reload, Back / Forward and a link keep it. Pages: the start screen, a mode
// (plan, furniture, lights, devices, sensors) or Preview; in the standalone editor also an example.
//   standalone (hashRouter): a hash — it works on any static hosting (the online demo) without server rules
//     (none) — the start screen · #/plan … #/preview — your plan · #/example/<id>/<page> — an example (no page — Preview, an example opens in it)
//   Home Assistant (haRouter): the panel's own path, as HA's own panels have — /home-twin, /home-twin/lights …
// A router: read() — the route in the address; write(route, push) — show one (push — a new step in the history, else the step is corrected);
// listen(cb) — the address was changed from outside (Back / Forward, a typed or followed link).
export const PAGES=['plan','furniture','lights','devices','sensors','preview'];
export function parseRoute(hash){
  const m=/^#\/(?:example\/([a-z0-9-]+)(?:\/|$))?([a-z]*)$/.exec(hash||'');if(!m)return null;
  const page=m[2]||(m[1]?'preview':'');return PAGES.includes(page)?{ex:m[1]||null,page}:null;}
export const routeHash=r=>r?(r.ex?`#/example/${r.ex}/`:'#/')+r.page:'';
export const parsePanelPath=path=>{const p=String(path||'').replace(/^\/+|\/+$/g,'');return PAGES.includes(p)?{ex:null,page:p}:null;};

export function hashRouter(){
  return {read:()=>parseRoute(location.hash),
    write:(r,push)=>history[push?'pushState':'replaceState'](null,'',routeHash(r)||location.pathname+location.search),
    listen:cb=>addEventListener('popstate',()=>cb(parseRoute(location.hash)))};}

// panel: <home-twin-panel> — HA sets route {prefix, path} on it and sets it again when the address changes. We go to another page as HA's
// navigate() does: the history of HA's window (the panel is in an iframe of the same origin) and 'location-changed' on it.
export function haRouter(panel){let cb=null;
  return {read:()=>parsePanelPath(panel.route?.path),
    write:(r,push)=>{const w=window.parent||window,url=(panel.route?.prefix||'/home-twin')+(r?'/'+r.page:'');
      if(push)w.history.pushState(null,'',url);else w.history.replaceState(w.history.state,'',url);
      w.dispatchEvent(new CustomEvent('location-changed',{detail:{replace:!push}}));},
    listen:f=>{cb=f;},
    route:v=>cb?.(parsePanelPath(v?.path))};}
