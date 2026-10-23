import * as THREE from 'three';
import { NOISE_GLSL } from './water.js';

export function createSky(colors) {
  const geo = new THREE.SphereGeometry(5000, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: colors.skyTop.clone() },
      uHorizon: { value: colors.horizon.clone() },
      uSunDir: { value: colors.sunDir.clone() },
      uSunColor: { value: colors.sun.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec3 vDir;
      ${NOISE_GLSL}
      float fbm(vec2 p) {
        float s = 0.0; float a = 0.5;
        for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
        return s;
      }
      void main() {
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uTop, pow(y, 0.45));
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 1200.0) * 30.0 + pow(sd, 14.0) * 0.35 + pow(sd, 3.0) * 0.08);

        // puffy clouds projected on a high plane
        if (d.y > 0.01) {
          vec2 cp = d.xz / (d.y + 0.08) * 1.6;
          float c = fbm(cp + vec2(3.1, 7.4));
          c = smoothstep(0.52, 0.78, c) * smoothstep(0.01, 0.18, d.y);
          vec3 cloudCol = mix(vec3(1.0), uHorizon * 0.9, 0.25) + uSunColor * pow(sd, 6.0) * 0.4;
          col = mix(col, cloudCol, c * 0.85);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
