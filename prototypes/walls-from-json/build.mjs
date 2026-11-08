import fs from 'node:fs';
import {createRequire} from 'node:module';
// The card code and the apartment description come from the neighbouring 3d_floor repository.
const WEB=new URL('../../../3d_floor/apartment/smart-home/web',import.meta.url).pathname;
const require=createRequire(WEB+'/package.json');
const esbuild=require('esbuild');
// Kenney models by name; custom furniture from own/ with the own/ prefix.
const glbs=dir=>fs.readdirSync(dir).filter(f=>f.endsWith('.glb')).map(f=>[(dir==='models'?'':dir+'/')+f.slice(0,-4),fs.readFileSync(dir+'/'+f).toString('base64')]);
const models=Object.fromEntries([...glbs('models'),...glbs('own')]);
fs.writeFileSync('models.gen.js','export const MODELS='+JSON.stringify(models)+';\n');
const r=await esbuild.build({entryPoints:['main.js'],bundle:true,format:'esm',minify:true,write:false,nodePaths:[WEB+'/node_modules'],target:'es2022',logLevel:'warning'});
const js=r.outputFiles[0].text.replace(/<\/script/g,'<\\/script');
const html=fs.readFileSync('shell.html','utf8').replace('/*BUNDLE*/',()=>js);
fs.writeFileSync('index.html',html);
console.log('index.html',(html.length/1024).toFixed(0),'KB');
