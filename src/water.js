import * as THREE from 'three';
import { WAVE_GLSL } from './waves.js';

const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

export { NOISE_GLSL };

/**
 * Big non-uniform grid: ~1.3 m spacing near the player, stretching out to the
 * horizon. The mesh follows the player, snapped to the inner grid spacing so
 * the vertices don't "swim".
 */
export function createWater(colors, fogDensity) {
  const N = 360;
  const HALF = 4000;
  const INNER = 240;
  const coord = (i) => {
    const u = (i / N) * 2 - 1;
    const a = Math.abs(u);
    return Math.sign(u) * (INNER * a + (HALF - INNER) * Math.pow(a, 4));
  };
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  let k = 0;
  for (let j = 0; j <= N; j++) {
    const z = coord(j);
    for (let i = 0; i <= N; i++) {
      pos[k++] = coord(i);
      pos[k++] = 0;
      pos[k++] = z;
    }
  }
  const idx = new Uint32Array(N * N * 6);
  k = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i;
      const b = a + 1;
      const c = a + N + 1;
      const d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: colors.sunDir.clone() },
    uSunColor: { value: colors.sun.clone() },
    uSkyTop: { value: colors.skyTop.clone() },
    uSkyHorizon: { value: colors.horizon.clone() },
    uDeep: { value: colors.deep.clone() },
    uShallow: { value: colors.shallow.clone() },
    uFogColor: { value: colors.horizon.clone() },
    uFogDensity: { value: fogDensity },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      ${WAVE_GLSL}
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        // fade displacement far away, where the stretched grid can't resolve waves
        float fd = length(wp.xz - cameraPosition.xz);
        wp.y = waveHeight(wp.xz, uTime) * (1.0 - smoothstep(350.0, 1400.0, fd));
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyTop;
      uniform vec3 uSkyHorizon;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vWorld;
      ${WAVE_GLSL}
      ${NOISE_GLSL}

      vec2 ripple(vec2 p, vec2 d, float k, float a, float w) {
        float ph = dot(p, d) * k - w * uTime;
        return d * (a * k * cos(ph));
      }

      void main() {
        vec2 p = vWorld.xz;
        float dist = length(cameraPosition - vWorld);
        float e = 0.12 + dist * 0.004;
        float h = waveHeight(p, uTime);
        float hx = waveHeight(p + vec2(e, 0.0), uTime);
        float hz = waveHeight(p + vec2(0.0, e), uTime);
        float farFade = 1.0 - smoothstep(350.0, 1400.0, dist);
        vec2 grad = vec2(hx - h, hz - h) / e * (0.25 + 0.75 * farFade);
        h *= farFade;

        // fine ripples, faded out with distance to avoid shimmering
        float detail = exp(-dist * 0.018);
        grad += detail * (
          ripple(p, vec2(0.80, 0.60), 2.1, 0.035, 4.5) +
          ripple(p, vec2(-0.45, 0.89), 3.3, 0.022, 5.7) +
          ripple(p, vec2(0.97, -0.24), 4.7, 0.015, 6.8) +
          ripple(p, vec2(-0.83, -0.55), 6.9, 0.010, 8.2));

        vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
        vec3 v = normalize(cameraPosition - vWorld);
        float ndv = max(dot(n, v), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

        vec3 r = reflect(-v, n);
        r.y = abs(r.y);
        vec3 sky = mix(uSkyHorizon, uSkyTop, pow(clamp(r.y, 0.0, 1.0), 0.5));
        float sunAmt = max(dot(r, uSunDir), 0.0);
        sky += uSunColor * pow(sunAmt, 10.0) * 0.25;

        // body colour: lighter, more turquoise on crests (light scattering through thin water)
        float crest = clamp(h * 0.22 + 0.35, 0.0, 1.0);
        vec3 body = mix(uDeep, uShallow, crest * crest);
        float diff = max(dot(n, uSunDir), 0.0);
        body *= 0.55 + 0.6 * diff;
        float sss = pow(max(dot(v, -uSunDir + n * 0.6), 0.0), 3.0) * crest;
        body += uShallow * sss * 0.6;

        vec3 col = mix(body, sky, fres * 0.85);

        // sun glints
        vec3 hv = normalize(uSunDir + v);
        float spec = pow(max(dot(n, hv), 0.0), 600.0) * 8.0 + pow(max(dot(n, hv), 0.0), 60.0) * 0.25;
        col += uSunColor * spec;

        // whitecaps on the tall, steep crests
        float slope = length(grad);
        float fn = vnoise(p * 0.35 + vec2(uTime * 0.15, -uTime * 0.1)) * 0.6 + vnoise(p * 1.4 - uTime * 0.3) * 0.4;
        float capMask = smoothstep(1.3, 3.0, h) + smoothstep(0.35, 0.7, slope) * 0.5;
        float foam = smoothstep(0.55, 0.8, fn * (0.35 + capMask));
        foam += smoothstep(0.8, 0.95, vnoise(p * 0.9 + 17.0)) * smoothstep(0.4, 1.6, h) * 0.5;
        foam = clamp(foam, 0.0, 1.0) * (0.35 + 0.65 * detail + 0.3);
        col = mix(col, vec3(0.92, 0.97, 1.0) * (0.75 + 0.3 * diff), clamp(foam, 0.0, 0.9));

        float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, uFogColor, fog);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const snap = (INNER * 2) / N;
  mesh.userData.follow = (x, z) => {
    mesh.position.set(Math.round(x / snap) * snap, 0, Math.round(z / snap) * snap);
  };
  return mesh;
}
