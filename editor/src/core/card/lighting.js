// Copy of 3d_floor/apartment/smart-home/web/src/lighting.js (commit 2aaa6d3, 2026-11-03). Card lighting; edits go here, 3d_floor is not touched.
import {Box3,Matrix4,PointLight,RectAreaLight,Vector3,MathUtils} from 'three';

export const MIRROR_CHORDS=4;

// Above this mark a strip counts as a ceiling cove; below it, as floor or
// under-counter lighting, which must shine strictly down onto the floor.
export const COVE_HEIGHT=1.8;
// Share of the cove's inward tilt into the room relative to vertical.
// Why inwards rather than towards the wall: an area light shines into the hemisphere in front
// of it, and brightness falls off with the cosine of the angle. Tilting inwards pushes the neighboring
// room to the edge of that hemisphere. Floor measurement (own room / leak):
//   outward to wall  30.4 / 7.8  — 26%
//   straight down    47.2 / 6.4  — 14%
//   into the room    53.6 / 3.5  —  6%
// The same trick holds floor strips: they sit 10 cm above the floor and face
// straight into it, so they emit nothing sideways and do not leak at all.
export const COVE_ROOM_TILT=.55;

// Read the actual exported strip, including its rotation and scale.
export function emitterSegment(mesh){
  mesh.geometry.computeBoundingBox();
  const box=mesh.geometry.boundingBox;
  const size=box.getSize(new Vector3());
  const axis=['x','y','z'].reduce((a,b)=>size[a]>size[b]?a:b);
  const a=box.getCenter(new Vector3()),b=a.clone();
  a[axis]=box.min[axis];b[axis]=box.max[axis];
  return [a.applyMatrix4(mesh.matrixWorld),b.applyMatrix4(mesh.matrixWorld)];
}

function areaSegment(a,b,normal,colour,intensity){
  const tangent=b.clone().sub(a),length=tangent.length();
  if(length<.001)return null;
  tangent.normalize();
  // RectAreaLight emits along local -Z; local X follows the strip.
  normal.addScaledVector(tangent,-normal.dot(tangent)).normalize();
  if(normal.lengthSq()<.01)return null;
  const back=normal.clone().negate(),up=back.clone().cross(tangent).normalize();
  const light=new RectAreaLight(colour,0,length,.03);
  light.position.copy(a).add(b).multiplyScalar(.5).addScaledVector(normal,.018);
  light.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(tangent,up,back));
  light.userData.fullIntensity=intensity;
  return light;
}

export function buildDeviceLights(device,meshes,room){
  if(device.emissive_only)return []; // The diffuser glows without lighting surrounding surfaces.
  if(device.kind==='ceiling'){
    // Retain the existing ceiling-light presentation; only LED lighting changes.
    const center=device.positions.reduce((a,p)=>a.map((v,i)=>v+p[i]/device.positions.length),[0,0,0]);
    const light=new PointLight(device.color,0,4.5,2);
    light.position.fromArray(center);light.userData.fullIntensity=36;
    return [light];
  }
  let segments=meshes.map(emitterSegment);
  // in the editor lights have no emitter_meshes (that is the card's model), and the id “bathroom_mirror” may belong to any HA light
  if(device.id==='bathroom_mirror'&&device.emitter_meshes&&meshes.length>=MIRROR_CHORDS){
    // Contiguous chords approximate the round diffuser, without a light in the
    // mirror centre or one expensive light for every small mesh piece.
    // Each area light costs ~2–4 ms per frame, and the mirror seen from above is the size
    // of a coin: four chords are enough, the total glowing area is the same.
    const ordered=[...meshes].sort((a,b)=>device.emitter_meshes.indexOf(a.userData.model_id)-device.emitter_meshes.indexOf(b.userData.model_id));
    const points=Array.from({length:MIRROR_CHORDS},(_,i)=>new Box3().setFromObject(ordered[Math.floor(i*ordered.length/MIRROR_CHORDS)]).getCenter(new Vector3()));
    // A chord with few segments sags inside the circle, and the light drifts
    // towards the mirror's center. Push each segment back onto the circle
    // so the ring shines from the contour with any number of chords.
    const hub=points.reduce((a,p)=>a.add(p),new Vector3()).divideScalar(points.length);
    const radius=points.reduce((s,p)=>s+p.distanceTo(hub),0)/points.length;
    segments=points.map((p,i)=>{
      const q=points[(i+1)%points.length];
      const mid=p.clone().add(q).multiplyScalar(.5),offset=mid.clone().sub(hub);
      const reach=offset.length();
      if(reach<1e-4)return [p,q];
      const push=offset.multiplyScalar((radius-reach)/reach);
      return [p.clone().add(push),q.clone().add(push)];
    });
  }
  // Floor-level runs carry a lower `intensity` in the manifest: RectAreaLight
  // casts no shadows, so a plinth strip spills onto wall bases across the flat.
  const intensity=device.intensity??(device.kind==='accent'?120:180);
  return segments.map(([a,b])=>{
    const center=a.clone().add(b).multiplyScalar(.5);
    const toRoom=new Vector3(room.center[0]-center.x,0,-room.center[1]-center.z);
    let normal;
    if(device.kind==='accent'){
      normal=toRoom.normalize();
    } else if(!device.down&&center.y>=COVE_HEIGHT&&toRoom.lengthSq()>1e-6){
      // (down: a light line in the middle of the ceiling, shining straight down; an editor change, 3d_floor does not have it)
      // The cove hangs at 2.5 m with an open room below it, and its light freely
      // reaches the floor behind the partition: RectAreaLight casts no shadows.
      // Tilting into the room pushes the neighbors to the edge of the emission hemisphere and
      // cuts the leak fourfold, adding light to its own room along the way.
      normal=new Vector3(0,-1,0)
        .addScaledVector(toRoom.normalize(),COVE_ROOM_TILT).normalize();
    } else {
      normal=new Vector3(0,-1,0);
    }
    return areaSegment(a,b,normal,device.color,intensity);
  }).filter(Boolean);
}

export function setDeviceLighting(lights,meshes,device,state){
  const level=state?.on?MathUtils.clamp((state.brightness??100)/100,0,1):0;
  const colour=state?.colour||device.color;
  for(const light of lights){
    light.color.set(colour);light.intensity=level*light.userData.fullIntensity;
    // A light that is off deliberately stays in the scene. Hiding it gains roughly
    // a third of rotation speed, but the number of sources is part of the shader key,
    // and the first toggle of each new combination recompiles all materials:
    // a 1.5 s freeze per light tap (0.76 s with compileAsync). For a smart home
    // control panel that is worse than a few extra milliseconds per frame.
  }
  for(const mesh of meshes){
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      if(!material.emissive)continue;
      material.emissive.set(colour);
      material.emissiveIntensity=level*(device.emissive_intensity??(device.kind==='ceiling'?2.2:3.6));
    }
  }
}
