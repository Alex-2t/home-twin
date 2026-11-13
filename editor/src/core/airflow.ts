// @ts-nocheck
// Air conditioner airflow (D-048): ribbons and dust particles from under the body, forward and down. One draw call for the ribbons and one for
// the particles; geometry lives on the GPU, only uniforms change. Taken from the 3d_floor card (ac-airflow.js), not tied to its model:
// the scene decides where the unit stands (group.position, rotation.y; the stream runs along local −Z).
//   set({on, tone, fan}): whether it is on, the mode tone (cool, heat, auto, dry, fan) and fan speed; tick(dt): a frame
import * as THREE from 'three';

const field = `
  uniform float uTime,uSpeed,uSwing,uStrength;
  uniform vec3 uColor;
  vec3 flow(float t,float lane,float seed){
    float reach=mix(1.25,1.95,uSpeed);
    float fan=lane*.30*(1.+t*.65);
    float wave=sin(t*6.-uTime*1.5+seed)*.035*t;
    float sweep=sin(uTime*.62)*uSwing*.34*t*t;
    return vec3(fan+wave+sweep,-.13*t-.64*t*t+sin(t*5.-uTime+seed)*.025*t,-t*reach);
  }
`;
const ribbonVertex =
  field +
  `
  attribute float aT,aSide,aLane,aSeed;
  varying float vT,vSide,vSeed;
  void main(){
    vT=aT;vSide=aSide;vSeed=aSeed;
    vec3 p=flow(aT,aLane,aSeed);
    float width=mix(.012,.055,aT);
    p.x+=aSide*width;
    p.y+=aSide*width*sin(aT*5.+aSeed+uTime*.45)*.65;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
  }
`;
const ribbonFragment =
  field +
  `
  varying float vT,vSide,vSeed;
  void main(){
    float edge=pow(max(0.,1.-vSide*vSide),1.8);
    float fade=smoothstep(0.,.09,vT)*(1.-smoothstep(.55,1.,vT));
    float pulse=pow(.5+.5*sin(vT*19.-uTime*(3.+uSpeed*3.)+vSeed),7.);
    float alpha=edge*fade*(.09+.34*pulse)*uStrength;
    gl_FragColor=vec4(uColor,alpha);
    #include <colorspace_fragment>
  }
`;
const moteVertex =
  field +
  `
  attribute float aLane,aSeed,aPhase;
  varying float vAlpha;
  void main(){
    float t=fract(aPhase+uTime*(.13+uSpeed*.16));
    vec3 p=flow(t,aLane,aSeed);
    p.x+=sin(aSeed*3.+uTime)*.025*t;
    p.y+=cos(aSeed*7.+uTime)*.025*t;
    vAlpha=smoothstep(0.,.12,t)*(1.-smoothstep(.5,1.,t))*uStrength;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
    gl_PointSize=clamp((10.+sin(aSeed)*3.)*projectionMatrix[1][1],2.,6.);
  }
`;
const moteFragment = `
  uniform vec3 uColor;
  varying float vAlpha;
  void main(){
    float r=length(gl_PointCoord-.5)*2.;
    float glow=exp(-r*r*5.)*(1.-smoothstep(.6,1.,r));
    gl_FragColor=vec4(mix(uColor,vec3(1.),.35),glow*vAlpha*.55);
    #include <colorspace_fragment>
  }
`;
const fanSpeed = fan => ({low: 0.18, quiet: 0.12, silent: 0.12, medium: 0.5, high: 1, turbo: 1})[fan] ?? 0.48;
const TONE = {heat: 0xffb16d, dry: 0xc5acff, fan: 0x9fe5d5, auto: 0xa8e6a1, cool: 0x88d7ff};

export function createAirflow() {
  const group = new THREE.Group();
  group.visible = false;
  const uniforms = {
    uTime: {value: 0},
    uSpeed: {value: 0.48},
    uSwing: {value: 0},
    uStrength: {value: 0},
    uColor: {value: new THREE.Color(TONE.cool)},
  };
  const geometry = new THREE.BufferGeometry(),
    positions = [],
    ts = [],
    sides = [],
    lanes = [],
    seeds = [],
    indices = [],
    segments = 40;
  for (let lane = 0; lane < 7; lane++) {
    const base = positions.length / 3;
    for (let j = 0; j <= segments; j++)
      for (const side of [-1, 1]) {
        positions.push(0, 0, 0);
        ts.push(j / segments);
        sides.push(side);
        lanes.push((lane - 3) / 3);
        seeds.push(lane * 1.71);
      }
    for (let j = 0; j < segments; j++) {
      const k = base + j * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  for (const [name, data, size] of [
    ['position', positions, 3],
    ['aT', ts, 1],
    ['aSide', sides, 1],
    ['aLane', lanes, 1],
    ['aSeed', seeds, 1],
  ])
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(data, size));
  geometry.setIndex(indices);
  const material = (vertexShader, fragmentShader) =>
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
  const ribbons = new THREE.Mesh(geometry, material(ribbonVertex, ribbonFragment));
  ribbons.frustumCulled = false;
  group.add(ribbons);
  const points = new THREE.BufferGeometry(),
    count = 56;
  points.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  for (const [name, fn] of [
    ['aLane', i => Math.sin(i * 2.399)],
    ['aSeed', i => i * 1.618],
    ['aPhase', i => (i * 0.61803398875) % 1],
  ])
    points.setAttribute(
      name,
      new THREE.Float32BufferAttribute(
        Array.from({length: count}, (_, i) => fn(i)),
        1,
      ),
    );
  const motes = new THREE.Points(points, material(moteVertex, moteFragment));
  motes.frustumCulled = false;
  group.add(motes);
  let strength = 0,
    speed = 0.48;
  const color = new THREE.Color(TONE.cool);
  return {
    group,
    set({on, tone, fan}) {
      strength = on ? 1 : 0;
      speed = fanSpeed(fan);
      color.set(TONE[tone] ?? TONE.cool);
      if (on) group.visible = true;
    },
    tick(dt) {
      if (!group.visible) return;
      dt = Math.max(0, Math.min(0.05, dt));
      const e = 1 - Math.exp(-dt * 5);
      uniforms.uTime.value += dt;
      uniforms.uStrength.value += (strength - uniforms.uStrength.value) * e;
      uniforms.uSpeed.value += (speed - uniforms.uSpeed.value) * e;
      uniforms.uColor.value.lerp(color, e);
      if (!strength && uniforms.uStrength.value < 0.005) {
        uniforms.uStrength.value = 0;
        group.visible = false;
      }
    },
    dispose() {
      geometry.dispose();
      points.dispose();
      ribbons.material.dispose();
      motes.material.dispose();
    },
  };
}
