import * as THREE from 'three';
import type { WaveComponent } from '../sim/waves';

// Stylised water: the same swell sum as the simulation, evaluated in the vertex
// shader, with crest foam, shallow-water turquoise near the beach and a warm
// sun glint.
export function createWater(waves: WaveComponent[]): { mesh: THREE.Mesh; uniforms: Record<string, THREE.IUniform> } {
  const geometry = new THREE.PlaneGeometry(320, 360, 160, 180);
  geometry.rotateX(-Math.PI / 2);
  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uWaveA: { value: waves.map((w) => new THREE.Vector4(w.dirX, w.dirZ, w.amp, w.k)) },
    uWaveB: { value: waves.map((w) => new THREE.Vector2(w.w, w.phase)) },
    uSunDir: { value: new THREE.Vector3(-0.55, 0.32, -0.75).normalize() },
    uFogColor: { value: new THREE.Color('#ffd9b8') },
    uFogNear: { value: 60 },
    uFogFar: { value: 230 },
    uCamPos: { value: new THREE.Vector3() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec4 uWaveA[3];
      uniform vec2 uWaveB[3];
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vHeight;
      varying float vSlope;
      float damp(float x) { return 1.0 - clamp((x - 22.0) / 16.0, 0.0, 1.0) * 0.75; }
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        float h = 0.0; float gx = 0.0; float gz = 0.0;
        for (int i = 0; i < 3; i++) {
          vec4 a = uWaveA[i]; vec2 b = uWaveB[i];
          float arg = a.w * (a.x * world.x + a.y * world.z) - b.x * uTime + b.y;
          h += a.z * sin(arg);
          float c = cos(arg);
          gx += a.z * a.w * a.x * c;
          gz += a.z * a.w * a.y * c;
        }
        float d = damp(world.x);
        h *= d; gx *= d; gz *= d;
        world.y += h;
        vHeight = h;
        vSlope = gx;
        vNormal = normalize(vec3(-gx, 1.0, -gz));
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform vec3 uCamPos;
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vHeight;
      varying float vSlope;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec3 n = normalize(vNormal);
        vec2 rp = vWorld.xz * 0.35 + vec2(uTime * 0.3, uTime * 0.2);
        float ripple = noise(rp) * 0.6 + noise(rp * 2.3 - uTime * 0.4) * 0.4;
        n = normalize(n + vec3(ripple - 0.5, 0.0, noise(rp.yx * 1.7) - 0.5) * 0.09);
        vec3 viewDir = normalize(uCamPos - vWorld);
        float shallow = smoothstep(14.0, 36.0, vWorld.x);
        vec3 deep = mix(vec3(0.03, 0.36, 0.55), vec3(0.09, 0.62, 0.70), shallow);
        vec3 crest = mix(vec3(0.20, 0.74, 0.80), vec3(0.45, 0.88, 0.82), shallow);
        float hN = clamp(vHeight / 1.4 * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(deep, crest, hN * hN);
        float diff = clamp(dot(n, uSunDir), 0.0, 1.0);
        col *= 0.75 + diff * 0.45;
        float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);
        col = mix(col, vec3(1.0, 0.85, 0.72), fres * 0.32);
        vec3 h = normalize(uSunDir + viewDir);
        float spec = pow(clamp(dot(n, h), 0.0, 1.0), 260.0);
        col += vec3(1.0, 0.86, 0.6) * spec * 0.9;
        // Foam on the steep front face of tall crests and along the beach.
        float foamMask = smoothstep(0.55, 1.05, vHeight) * smoothstep(-0.05, -0.25, vSlope);
        float foamNoise = noise(vWorld.xz * 1.3 + uTime * 0.5);
        float foam = smoothstep(0.5, 0.8, foamMask * (0.5 + foamNoise)) * 0.8;
        float shoreFoam = smoothstep(33.0, 37.5, vWorld.x) * smoothstep(0.3, 0.8, noise(vWorld.xz * 0.8 + vec2(uTime * 0.6, 0.0)) + smoothstep(36.0, 38.0, vWorld.x));
        col = mix(col, vec3(0.97, 0.98, 0.96), clamp(foam + shoreFoam, 0.0, 1.0) * 0.9);
        float dist = length(uCamPos - vWorld);
        float fog = smoothstep(uFogNear, uFogFar, dist);
        col = mix(col, uFogColor, fog);
        float alpha = mix(0.84, 0.72, shallow) + fres * 0.15 + foam * 0.2;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}
