// Copy of 3d_floor/apartment/smart-home/web/src/room-light-mask.js (commit 2aaa6d3, 2026-11-03). Card lighting; edits go here, 3d_floor is not touched.
import {ShaderChunk} from 'three';

// Confine device lights to their room in world space. Ambient light, sun and
// visible emitters remain unchanged. Light-to-room lookup runs on the CPU;
// each fragment evaluates each room boundary once, not once per light.
export function installRoomLightMask(model, groups, scene){
  const active=groups.filter(g=>g.lights.length);
  const lights=active.flatMap(g=>g.lights);
  if(!lights.length)return;
  const number=n=>Number(n).toFixed(6);
  const roomFunctions=active.map(({room},index)=>{
    const vertices=room.polygon.map(([x,y])=>`vec2(${number(x)},${number(-y)})`);
    const edges=vertices.map((a,i)=>{
      const b=vertices[(i+1)%vertices.length];
      return `{ vec2 a=${a}, b=${b};
        vec2 edge=b-a;
        float t=clamp(dot(p-a,edge)/dot(edge,edge),0.0,1.0);
        distanceToEdge=min(distanceToEdge,length(p-a-t*edge));
        if ((a.y>p.y)!=(b.y>p.y)) {
          if(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
        }
      }`;
  }).join('\n');
  return `
    float confinedRoomMask${index}(vec2 p) {
      bool inside=false; float distanceToEdge=10000.0;
      ${edges}
      // Small feather at the wall surface avoids a precision seam. It ends
      // within the partition, before the neighbouring room begins.
      return inside ? 1.0 : 1.0-smoothstep(0.0,0.025,distanceToEdge);
    }
  `;
  }).join('\n');
  const roomByLight=new Map(active.flatMap((g,i)=>g.lights.map(l=>[l,i+1])));
  const uniforms={
    confinedAreaRooms:{value:[]},confinedPointRooms:{value:[]},confinedSpotRooms:{value:[]}
  };
  // Mirror Three.js WebGLLights ordering (shadow lights, then textured lights).
  // Refresh before traversal so visibility, camera layers and shadow changes
  // cannot silently assign an emitter to another room.
  const previousRender=scene.onBeforeRender;
  scene.onBeforeRender=function(renderer,renderScene,camera,...rest){
    previousRender.call(this,renderer,renderScene,camera,...rest);
    const visible=[];
    scene.traverseVisible(o=>{if(o.isLight&&o.layers.test(camera.layers))visible.push(o);});
    visible.sort((a,b)=>(b.castShadow?2:0)-(a.castShadow?2:0)+(b.map?1:0)-(a.map?1:0));
    for(const [type,name] of [['RectAreaLight','Area'],['PointLight','Point'],['SpotLight','Spot']]){
      uniforms[`confined${name}Rooms`].value=visible.filter(l=>l.type===type).map(l=>roomByLight.get(l)||0);
    }
  };
  const declarations=`
    #if NUM_RECT_AREA_LIGHTS > 0
      uniform int confinedAreaRooms[NUM_RECT_AREA_LIGHTS];
    #endif
    #if NUM_POINT_LIGHTS > 0
      uniform int confinedPointRooms[NUM_POINT_LIGHTS];
    #endif
    #if NUM_SPOT_LIGHTS > 0
      uniform int confinedSpotRooms[NUM_SPOT_LIGHTS];
    #endif
    ${roomFunctions}
  `;
  const worldPosition='((vec4(geometryPosition,1.0)-viewMatrix[3])*viewMatrix).xz';
  let chunk=ShaderChunk.lights_fragment_begin.replace('IncidentLight directLight;',`
    float confinedMasks[${active.length+1}];
    confinedMasks[0]=1.0;
    vec2 confinedPosition=${worldPosition};
    ${active.map((_,i)=>`confinedMasks[${i+1}]=confinedRoomMask${i}(confinedPosition);`).join('\n')}
    IncidentLight directLight;
  `);
  for(const [light,array,name] of [
    ['rectAreaLight','rectAreaLights','Area'],
    ['pointLight','pointLights','Point'],
    ['spotLight','spotLights','Spot']
  ]){
    const marker=`${light} = ${array}[ i ];`;
    if(!chunk.includes(marker))throw new Error('Unsupported Three.js direct-light shader');
    chunk=chunk.replace(marker,`${marker}
      ${light}.color *= confinedMasks[confined${name}Rooms[i]];`);
  }
  // LTC area-light evaluation is expensive. A zero contribution needs no LTC
  // sampling/integration, whether the light is off or belongs to another room.
  const areaCall='RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  if(!chunk.includes(areaCall))throw new Error('Unsupported Three.js area-light evaluation');
  chunk=chunk.replace(areaCall,`if(any(greaterThan(rectAreaLight.color,vec3(0.0)))) { ${areaCall} }`);
  const materials=new Set();
  model.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
  for(const material of materials){
    if(!material.isMeshStandardMaterial)continue;
    const previous=material.onBeforeCompile;
    const cacheKey=material.customProgramCacheKey();
    material.onBeforeCompile=function(shader,renderer){
      previous.call(this,shader,renderer);
      Object.assign(shader.uniforms,uniforms);
      shader.fragmentShader=declarations+shader.fragmentShader.replace('#include <lights_fragment_begin>',chunk);
    };
    material.customProgramCacheKey=()=>`${cacheKey}:room-mask:${declarations}`;
    material.needsUpdate=true;
  }
}
