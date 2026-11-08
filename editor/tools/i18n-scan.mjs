// Translation scanner (D-036). Collects UI keys — the first argument of t() and N(), and the text of the static markup
// (shell.html) — and finds Cyrillic in code: the repository is English-only, Russian lives in src/i18n/ru.json.
//   node tools/i18n-scan.mjs [--keys]  — --keys writes src/i18n/keys.json (key → where it is used), translators work from it.
// Cyrillic is allowed only in patterns that match names coming from Home Assistant in any language (regex literals,
// re('…'), new RegExp(…)) and on lines marked "allow-cyrillic" (language endonyms, Russian grammar rules, samples in tests).
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT=new URL('..',import.meta.url).pathname;
const CYR=/[\u0400-\u04FF]/;
// keys are not collected from tests, generated code, the dev panel and the copied card lighting
const NO_KEYS=/\.test\.js$|\/gen\/|devpanel\.js$|\/card\//;

const files=dir=>fs.readdirSync(path.join(ROOT,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='gen'?[]:files(path.join(dir,e.name))):e.name.endsWith('.js')?[path.join(dir,e.name)]:[]);

export function scan(){
  const keys=new Map(),bad=[],add=(k,where)=>{if(!keys.has(k))keys.set(k,new Set());keys.get(k).add(where);};
  for(const f of files('src')){
    const src=fs.readFileSync(path.join(ROOT,f),'utf8'),lines=src.split('\n'),allowed=n=>/allow-cyrillic/.test(lines[n-1]||'');
    const comments=[];let ast;
    try{ast=acorn.parse(src,{ecmaVersion:'latest',sourceType:'module',locations:true,onComment:comments});}catch(e){bad.push({file:f,line:e.loc?.line,text:'cannot parse: '+e.message});continue;}
    for(const c of comments)if(CYR.test(c.value)&&!allowed(c.loc.start.line))bad.push({file:f,line:c.loc.start.line,text:'comment: '+c.value.trim().slice(0,60)});
    const keysHere=!NO_KEYS.test(f),where=n=>f+':'+n.loc.start.line;
    walk.fullAncestor(ast,(node,_s,anc)=>{
      const parent=anc[anc.length-2];
      const inCall=parent?.type==='CallExpression'&&parent.arguments[0]===node&&parent.callee.type==='Identifier'&&['t','N'].includes(parent.callee.name);
      if(node.type==='Literal'&&typeof node.value==='string'&&inCall&&keysHere)add(node.value,where(node));
      if(node.type==='TemplateLiteral'&&inCall&&keysHere&&!node.expressions.length)add(node.quasis[0].value.cooked,where(node));
      // patterns for names from HA (re('floor lamp|…'), new RegExp, /kid|…/) hold words in every language
      const pattern=node.regex||anc.some(a=>(a.type==='CallExpression'&&a.callee.type==='Identifier'&&a.callee.name==='re')||(a.type==='NewExpression'&&a.callee.name==='RegExp'));
      if(pattern||allowed(node.loc.start.line))return;
      if(node.type==='Literal'&&typeof node.value==='string'&&CYR.test(node.value))bad.push({file:f,line:node.loc.start.line,text:node.value.slice(0,60)});
      else if(node.type==='TemplateLiteral'&&node.quasis.some(q=>CYR.test(q.value.cooked??'')))bad.push({file:f,line:node.loc.start.line,text:'`'+node.quasis.map(q=>q.value.cooked).join('${…}').slice(0,60)+'`'});
    });
  }
  // static markup: text between tags and tooltips (translateDom translates them at startup); translate="no" — left as is
  const raw=fs.readFileSync(path.join(ROOT,'src/shell.html'),'utf8');
  if(CYR.test(raw))bad.push({file:'src/shell.html',line:raw.split('\n').findIndex(l=>CYR.test(l))+1,text:'Cyrillic in markup'});
  const html=raw.replace(/<style>[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<!--[\s\S]*?-->/g,'').replace(/<(\w+)[^>]*translate="no"[^>]*>[^<]*<\/\1>/g,'');
  for(const m of html.matchAll(/>([^<]+)<|\s(?:title|placeholder|aria-label)="([^"]+)"/g)){
    const s=(m[1]??m[2]).trim().replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"');if(s&&/\p{L}{2}/u.test(s))add(s,'src/shell.html');}
  return {keys,bad};
}

if(process.argv[1]===new URL(import.meta.url).pathname){
  const {keys,bad}=scan();
  for(const b of bad)console.log(`${b.file}:${b.line}  ${b.text}`);
  console.log(`keys ${keys.size}, Cyrillic in code: ${bad.length}`);
  if(process.argv.includes('--keys')){const out=Object.fromEntries([...keys].sort((a,b)=>a[0].localeCompare(b[0],'en')).map(([k,w])=>[k,[...w].slice(0,3).join(' ')]));
    fs.writeFileSync(path.join(ROOT,'src/i18n/keys.json'),JSON.stringify(out,null,1)+'\n');console.log('src/i18n/keys.json');}
}
