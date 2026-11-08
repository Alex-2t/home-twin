// Cuts the bedroom and kids' room furniture out of apartment.glb (3d_floor) into separate .glb files per the D-007 rules:
// metres, origin on the floor at the centre of the item. Where each item stood in the apartment goes to own/placements.json.
// 3d_floor is read-only.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const WEB=new URL('../../../3d_floor/apartment/smart-home/web',import.meta.url).pathname;
const require=createRequire(WEB+'/package.json');
const {NodeIO}=await import(require.resolve('@gltf-transform/core'));
const {ALL_EXTENSIONS}=await import(require.resolve('@gltf-transform/extensions'));
const {getBounds,prune,dedup}=await import(require.resolve('@gltf-transform/functions'));
const {MeshoptDecoder,MeshoptEncoder}=await import(require.resolve('meshoptimizer'));
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});

const base=n=>n.replace(/\.\d+$/,'');
const cx=n=>{const b=getBounds(n);return (b.min[0]+b.max[0])/2;};
// Item: file name → which objects to take. Repeated items (nightstands, sconces) are taken once
// and placed as several copies: this is how custom furniture will work in the product.
const ITEMS={
  bed:        n=>/^(R_bed_(base|headboard|mattress)|Изголовье · шов|Кровать · )/.test(n.getName()),
  wardrobe:   n=>/^R_bedroom_wardrobe_/.test(n.getName()),
  bedside:    n=>base(n.getName())==='R_bedside_drawer'&&getBounds(n).max[2]>-4,
  ceramicLamp:n=>/^Керамическая лампа/.test(n.getName()),
  sconce:     n=>/^bedside_sconce_0_/.test(n.getName()),
  workplace:  n=>/^(R_office_(desktop|monitor)|R_keyboard|R_mouse)/.test(n.getName())||(/^Кабинет · (?!Потолочный карниз)/.test(n.getName())&&cx(n)<2.4),
  shelf:      n=>/^R_office_shelf_/.test(n.getName())||(/^Кабинет · /.test(n.getName())&&cx(n)>=2.4),
  bedroomRug: n=>/^R_bedroom_rug/.test(n.getName()),
  officeRug:  n=>/^R_office_rug/.test(n.getName()),
  bedroomTv:  n=>/^R_device_bedroom_tv/.test(n.getName()),
  sofa:       n=>/^Диван 4М/.test(n.getName()),
  mediaUnit:  n=>/^R_living_media_/.test(n.getName()),
  sideTable:  n=>/^(Приставной столик|Ножка столика)/.test(n.getName()),
  kidsRug:    n=>/^R_living_rug/.test(n.getName()),
  kidsTv:     n=>/^R_device_living_tv/.test(n.getName()),
};
// Copies: where else the same item stands (centre on the floor in scene coordinates).
const COPIES={bedside:'R_bedside_drawer',sconce:/^bedside_sconce_1_/};

const placements={};
for(const [id,pick] of Object.entries(ITEMS)){
  const doc=await io.read(WEB+'/dist/apartment.glb');
  const root=doc.getRoot(),scene=root.listScenes()[0];
  const all=scene.listChildren();
  // Take only the bedroom and kids' room: the same names also occur in other rooms.
  const keep=all.filter(n=>(['bedroom','living'].includes(n.getExtras().room_id)||/^R_office_shelf_/.test(n.getName()))&&pick(n));
  if(!keep.length)throw new Error('no objects: '+id);
  const box=(ns)=>{const b={min:[1e9,1e9,1e9],max:[-1e9,-1e9,-1e9]};for(const n of ns){const q=getBounds(n);for(let i=0;i<3;i++){b.min[i]=Math.min(b.min[i],q.min[i]);b.max[i]=Math.max(b.max[i],q.max[i]);}}return b;};
  const b=box(keep);
  const at=[(b.min[0]+b.max[0])/2,b.min[1],(b.min[2]+b.max[2])/2];
  const size=[0,1,2].map(i=>+(b.max[i]-b.min[i]).toFixed(3));
  // Where all the copies stand.
  const spots=[at];
  if(id==='bedside')for(const n of all.filter(n=>base(n.getName())==='R_bedside_drawer'&&!keep.includes(n))){const q=getBounds(n);spots.push([(q.min[0]+q.max[0])/2,q.min[1],(q.min[2]+q.max[2])/2]);}
  if(id==='sconce'){const q=box(all.filter(n=>COPIES.sconce.test(n.getName())));spots.push([(q.min[0]+q.max[0])/2,q.min[1],(q.min[2]+q.max[2])/2]);}
  const item=doc.createNode(id).setTranslation(at.map(v=>-v)).setExtras({model_id:id,role:'furniture',source:'3d_floor/apartment.glb'});
  for(const n of all){scene.removeChild(n);if(keep.includes(n))item.addChild(n);}
  const top=doc.createNode(id+'_root').addChild(item);
  scene.addChild(top);
  await doc.transform(prune(),dedup());
  const out=await io.writeBinary(doc);
  fs.writeFileSync(`own/${id}.glb`,out);
  placements[id]={size,spots:spots.map(p=>p.map(v=>+v.toFixed(3))),room:keep[0].getExtras().room_id||null,nodes:keep.length};
  console.log(id.padEnd(12),String(keep.length).padStart(3),'objects',(out.length/1024).toFixed(0).padStart(5),'KB',size.join('×'),'m');
}
fs.writeFileSync('own/placements.json',JSON.stringify(placements,null,1)+'\n');
