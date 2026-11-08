import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
// three and esbuild come from 3d_floor, polygon-clipping from the walls-from-json sketch. 3d_floor is read-only.
const WEB=new URL('../../../3d_floor/apartment/smart-home/web',import.meta.url).pathname;
const require=createRequire(WEB+'/package.json');
const esbuild=require('esbuild');
// Underlay: the apartment plan photo from 3d_floor; embedded only into index.html (which is in .gitignore).
const src=new URL('../../../3d_floor/apartment/reference/plan-horizontal.png',import.meta.url).pathname;
const tmp='/tmp/room-editor-underlay.jpg';
execFileSync('sips',['-s','format','jpeg','-s','formatOptions','70',src,'--out',tmp],{stdio:'ignore'});
fs.writeFileSync('underlay.gen.js','export const UNDERLAY="data:image/jpeg;base64,'+fs.readFileSync(tmp).toString('base64')+'";\n');
// Kenney models (CC0) for the furniture catalog, taken from the walls-from-json sketch.
const KENNEY=['bedDouble','bedSingle','cabinetBedDrawerTable','bookcaseOpen','loungeSofa','loungeChair','tableCoffee','tableRound','chairCushion','desk','chairDesk','lampRoundFloor','pottedPlant'];
fs.writeFileSync('models.gen.js','export const MODELS='+JSON.stringify(Object.fromEntries(KENNEY.map(k=>[k,fs.readFileSync('../walls-from-json/models/'+k+'.glb').toString('base64')])))+';\n');
const r=await esbuild.build({entryPoints:['main.js'],bundle:true,format:'esm',minify:true,write:false,
  nodePaths:[WEB+'/node_modules',new URL('../walls-from-json/node_modules',import.meta.url).pathname],target:'es2022',logLevel:'warning'});
const js=r.outputFiles[0].text.replace(/<\/script/g,'<\\/script');
fs.writeFileSync('index.html',fs.readFileSync('shell.html','utf8').replace('/*BUNDLE*/',()=>js));
console.log('index.html',(fs.statSync('index.html').size/1024).toFixed(0),'KB');
