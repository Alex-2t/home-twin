// Plan version history (as in Figma and Google Docs): snapshots at meaningful moments, not on every mouse move.
// When: a wizard step is completed ('step'), before a major edit ('before': auto-layout, merging or deleting
// a room, rotating the plan, opening a file, restoring a version) and every 10 minutes of work ('auto'), plus on opening the editor —
// what the plan looked like at the end of the previous session. Identical to the latest version — not written.
// Stored per project in storage (ver:<project>), up to 40 versions; extras go oldest autosaves first.
// “Same version” ignores wizard marks (onboarding): starting a step is not a new plan version.
// No DOM here: the window is versions-panel.js.
export const VER_MAX=40,AUTO_MS=10*60e3;
export function createVersions({store=null,now=()=>Date.now()}={}){
  let id=null,list=[],ready=Promise.resolve();
  const save=()=>store&&id?store.batch([['put','ver:'+id,list]]).catch(()=>{}):Promise.resolve();
  // extras: the oldest autosave; if there are none, the oldest version
  const trim=()=>{while(list.length>VER_MAX){let i=list.map(v=>v.kind).lastIndexOf('auto');if(i<0)i=list.length-1;list.splice(i,1);}};
  const sig=json=>{const p=JSON.parse(json);delete p.onboarding;return JSON.stringify(p);};
  const V={
    list:()=>list,
    ready:()=>ready,
    // another project — its versions
    open(pid){id=pid||null;list=[];ready=store&&id?store.get('ver:'+id).then(v=>{if(id===pid)list=Array.isArray(v)?v:[];}).catch(()=>{}):Promise.resolve();return ready;},
    // snapshot of the plan right now (before the first await: “before an edit” must stay “before”); null — already exists or another project
    add(plan,{kind='auto',what=null,photo=null,at=null}={}){const json=JSON.stringify(plan),pid=plan?.id,when=at??now();
      return ready.then(async()=>{if(!id||pid!==id)return null;
        // same as the latest: it was a plain autosave, and now there is a reason (a step, “before an edit”) — label it with that
        if(list[0]&&(list[0].plan===json||sig(list[0].plan)===sig(json))){if(list[0].kind!=='auto'||kind==='auto')return null;list[0]={...list[0],kind,what};await save();return list[0];}
        const v={id:when.toString(36)+Math.random().toString(36).slice(2,6),at:when,kind,what,plan:json,photo};
        list=[v,...list].sort((a,b)=>b.at-a.at);trim();await save();return v;});},
    // is an autosave due: there is no latest version or it is older than 10 minutes
    due:()=>!list.length||now()-list[0].at>=AUTO_MS,
  };
  return V;
}
