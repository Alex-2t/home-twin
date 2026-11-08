// Builds the editor into a single file dist/index.html. node build.mjs [--serve]
// The demo apartment is embedded into src/gen/ (in .gitignore): demo/own.mjs is the owner's apartment, local only (.gitignore), and it
// is used if the file exists; otherwise demo/typical.mjs, the typical three-room apartment from the repository. --demo=typical forces the latter.
import fs from 'node:fs';
import * as esbuild from 'esbuild';

fs.mkdirSync('src/gen',{recursive:true});fs.mkdirSync('dist',{recursive:true});

// Kenney models (CC0)
const models=Object.fromEntries(fs.readdirSync('assets/kenney').filter(f=>f.endsWith('.glb')).map(f=>[f.slice(0,-4),fs.readFileSync('assets/kenney/'+f).toString('base64')]));
fs.writeFileSync('src/gen/models.gen.js','export const MODELS='+JSON.stringify(models)+';\n');

// Demo (D-033 sensors, D-048 devices, D-049 favorites, “Statistics”, weather) — in the apartment module, shared parts in demo/kit.mjs
const demoName=process.argv.includes('--demo=typical')||!fs.existsSync('demo/own.mjs')?'typical':'own';
const {HA,DEMO,DEMO_UNDERLAY}=await (await import(`./demo/${demoName}.mjs`)).default();
fs.writeFileSync('src/gen/demo.gen.js',`export const HA=${JSON.stringify(HA)};\nexport const DEMO=${JSON.stringify(DEMO)};\nexport const DEMO_UNDERLAY=${JSON.stringify(DEMO_UNDERLAY)};\n`);
console.log('demo:',demoName);

// styles and the shell are read on every build: with --serve they can be edited without a restart (styles used to be read once at
// startup, and a rebuild after a code edit overwrote the new styles with the old ones)
const html=js=>fs.readFileSync('src/shell.html','utf8').replace('/*STYLES*/',()=>fs.readFileSync('src/styles.css','utf8')).replace('/*BUNDLE*/',()=>js.replace(/<\/script/g,'<\\/script'));
// .css imported from JS as text: the apartment card styles (src/look/card.css) go into its Shadow DOM
const opts={entryPoints:['src/main.js'],outfile:'dist/bundle.js',bundle:true,format:'esm',minify:true,write:false,target:'es2022',logLevel:'warning',loader:{'.css':'text'},charset:'utf8'};
const write=r=>{const out=html(r.outputFiles[0].text);fs.writeFileSync('dist/index.html',out);console.log('dist/index.html',(out.length/1024).toFixed(0),'KB');};
// The Home Assistant panel (the custom_components/home_twin integration): a single module frontend/panel.js with the styles and
// shell inside (src/gen/shell.gen.js), without the demo apartment or personal data. Non-ASCII text (e.g. Cyrillic) stays as is (charset utf8):
// module scripts are always UTF-8, and \uXXXX escapes bloated the bundle by a third.
const PANEL='../custom_components/home_twin/frontend/panel.js';
function shellGen(){const src=fs.readFileSync('src/shell.html','utf8'),m=src.match(/<body([^>]*)>([\s\S]*?)<script type="module">/);
  const body=[...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]);
  fs.writeFileSync('src/gen/shell.gen.js',`export const SHELL=${JSON.stringify(m[2])};\nexport const BODY=${JSON.stringify(body)};\nexport const STYLES=${JSON.stringify(fs.readFileSync('src/styles.css','utf8'))};\n`);}
shellGen();fs.mkdirSync('../custom_components/home_twin/frontend',{recursive:true});
const panelOpts={...opts,entryPoints:['src/ha-panel.js'],outfile:PANEL,write:true};
const panelDone=()=>console.log('panel.js',(fs.statSync(PANEL).size/1024).toFixed(0),'KB');
// The dashboard card (D-059): card.js — a small file HA loads on every page (no imports); card-app.js — the 3D and the home panel,
// loaded only where a card is shown
const FRONT='../custom_components/home_twin/frontend/';
const cardOpts=['card','card-app'].map(n=>({...opts,entryPoints:[`src/${n}.js`],outfile:FRONT+n+'.js',write:true,
  plugins:[{name:'done',setup(b){b.onEnd(r=>{if(!r.errors.length)console.log(n+'.js',(fs.statSync(FRONT+n+'.js').size/1024).toFixed(0),'KB');});}}]}));
if(process.argv.includes('--serve')){
  const ctx=await esbuild.context({...opts,plugins:[{name:'html',setup(b){b.onEnd(r=>{if(!r.errors.length)write(r);});}}]});
  await ctx.watch();const {port}=await ctx.serve({servedir:'dist',port:8766});console.log(`http://localhost:${port}/`);
  // styles and the shell are not in esbuild's module graph — watch them ourselves
  const pctx=await esbuild.context({...panelOpts,plugins:[{name:'done',setup(b){b.onEnd(r=>{if(!r.errors.length)panelDone();});}}]});await pctx.watch();
  for(const o of cardOpts)await (await esbuild.context(o)).watch();
  // watch the folder, not the files: editors save by replacing the file, and a watch on the old file then goes silent on macOS
  let t=0;fs.watch('src',(_e,f)=>{if(!['styles.css','shell.html'].includes(String(f)))return;clearTimeout(t);t=setTimeout(()=>{shellGen();ctx.rebuild().catch(()=>{});},80);});
}else{write(await esbuild.build(opts));await esbuild.build(panelOpts);panelDone();for(const o of cardOpts)await esbuild.build(o);}
