import * as THREE from 'three';
import { CHOP, SWELLS, WAVES, waveGlsl } from '../sim/waves';

const SIZE = 440; // half extent in metres
const SEGMENTS = 220;

/** Grid dense at the centre (0.5 m) and coarse at the horizon (~10 m). */
function createWaterGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(2, 2, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const remap = (u: number) => SIZE * u * (0.11 + 0.89 * u * u);
  for (let i = 0; i < pos.count; i += 1) {
    pos.setX(i, remap(pos.getX(i)));
    pos.setZ(i, remap(pos.getZ(i)));
  }
  geo.computeBoundingSphere();
  geo.boundingSphere!.radius = SIZE * 1.5;
  return geo;
}

// The vertex grid resolves waves of >= 5 m near the camera; shorter chop is
// rendered through the fragment normal only.
const VERTEX_WAVES = WAVES.filter((w) => (Math.PI * 2) / w.k >= 5);
const DETAIL_WAVES = CHOP.filter((w) => (Math.PI * 2) / w.k < 5);

const vertexShader = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec3 vGrad;
varying float vSwell;
${waveGlsl('waveVertex', VERTEX_WAVES)}
${waveGlsl('waveSwell', SWELLS)}
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 w = waveVertex(world.xz, uTime);
  world.y = w.x;
  vGrad = w;
  vSwell = waveSwell(world.xz, uTime).x;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSkyTop;
uniform vec3 uHorizon;
uniform float uFogDensity;
uniform vec3 uShadowPos;
uniform float uShadowSize;
uniform float uShadowStrength;
varying vec3 vWorld;
varying vec3 vGrad;
varying float vSwell;
${waveGlsl('waveDetail', DETAIL_WAVES)}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  float dist = length(vWorld.xz - cameraPosition.xz);
  float detailFade = clamp(1.0 - dist / 140.0, 0.0, 1.0);
  vec3 d = waveDetail(vWorld.xz, uTime) * detailFade;
  // fine ripples
  vec2 rp = vWorld.xz * 1.7 + vec2(uTime * 0.9, uTime * 0.4);
  float rn = noise(rp) - noise(rp * 1.9 + 3.1);
  vec3 n = normalize(vec3(-(vGrad.y + d.y) - rn * 0.12 * detailFade, 1.0, -(vGrad.z + d.z) - rn * 0.1 * detailFade));

  vec3 viewDir = normalize(cameraPosition - vWorld);
  float ndv = clamp(dot(n, viewDir), 0.0, 1.0);
  float fresnel = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);

  vec3 refl = reflect(-viewDir, n);
  float skyT = clamp(refl.y, 0.0, 1.0);
  vec3 sky = mix(uHorizon, uSkyTop, pow(skyT, 0.55));

  // Body colour: crests catch light and go turquoise, troughs deep blue.
  float h = vGrad.x + d.x;
  float crest = clamp((h + 0.6) / 3.2, 0.0, 1.0);
  vec3 body = mix(uDeep, uShallow, crest * 0.8);
  // subsurface glow on the back side of crests facing the sun
  float sss = pow(clamp(dot(viewDir, -uSunDir) * 0.5 + 0.5, 0.0, 1.0), 3.0) * crest;
  body += uShallow * sss * 0.35;
  float diffuse = clamp(dot(n, uSunDir), 0.0, 1.0) * 0.35 + 0.65;
  vec3 col = mix(body * diffuse, sky, fresnel);

  // Sun glint
  float spec = pow(max(dot(refl, uSunDir), 0.0), 380.0) * 9.0;
  float sheen = pow(max(dot(refl, uSunDir), 0.0), 18.0) * 0.18;
  col += uSunColor * (spec + sheen);

  // Foam on sharp crests and on the swell tops, broken by noise.
  float slope = length(vGrad.yz + d.yz);
  float fn = noise(vWorld.xz * 0.55 + vec2(uTime * 0.3, -uTime * 0.2)) * 0.6 + noise(vWorld.xz * 2.3 - uTime * 0.5) * 0.4;
  float foamCrest = smoothstep(0.62, 0.95, crest + slope * 0.25) * smoothstep(0.35, 0.75, fn);
  float foamChop = smoothstep(0.42, 0.62, slope) * smoothstep(0.5, 0.8, fn) * 0.6;
  float swellCap = smoothstep(1.6, 2.6, vSwell) * smoothstep(0.3, 0.6, fn);
  float foam = clamp(foamCrest + foamChop + swellCap, 0.0, 1.0) * (0.45 + 0.55 * detailFade);
  col = mix(col, vec3(0.92, 0.97, 1.0) * (0.75 + 0.25 * diffuse), foam * 0.85);

  // Contact shadow under the ski: sells height on jumps.
  float sd = length(vWorld.xz - uShadowPos.xz) / uShadowSize;
  col *= 1.0 - uShadowStrength * smoothstep(1.0, 0.2, sd);

  // Fog to the horizon colour
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.6));
  col = mix(col, uHorizon, clamp(fog, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface WaterPalette {
  deep: THREE.Color;
  shallow: THREE.Color;
  skyTop: THREE.Color;
  horizon: THREE.Color;
  sunColor: THREE.Color;
  sunDir: THREE.Vector3;
  fogDensity: number;
}

export class Water {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(palette: WaterPalette) {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: palette.sunDir.clone() },
        uSunColor: { value: palette.sunColor.clone() },
        uDeep: { value: palette.deep.clone() },
        uShallow: { value: palette.shallow.clone() },
        uSkyTop: { value: palette.skyTop.clone() },
        uHorizon: { value: palette.horizon.clone() },
        uFogDensity: { value: palette.fogDensity },
        uShadowPos: { value: new THREE.Vector3() },
        uShadowSize: { value: 1.6 },
        uShadowStrength: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(createWaterGeometry(), this.material);
    this.mesh.frustumCulled = false;
  }

  update(time: number, centerX: number, centerZ: number): void {
    this.material.uniforms.uTime.value = time;
    // Snap to a 1 m grid so vertices don't swim with the player.
    this.mesh.position.set(Math.round(centerX), 0, Math.round(centerZ));
  }

  setShadow(x: number, z: number, height: number): void {
    const u = this.material.uniforms;
    (u.uShadowPos.value as THREE.Vector3).set(x, 0, z);
    u.uShadowSize.value = 1.5 + height * 0.18;
    u.uShadowStrength.value = Math.max(0.12, 0.5 - height * 0.04);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
