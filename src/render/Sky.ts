import * as THREE from 'three';

export function createSky(top: THREE.Color, horizon: THREE.Color, sunDir: THREE.Vector3, sunColor: THREE.Color): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: top.clone() },
      uHorizon: { value: horizon.clone() },
      uSunDir: { value: sunDir.clone() },
      uSunColor: { value: sunColor.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
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
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uTop, pow(y, 0.5));
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.12);
        // soft cumulus band
        vec2 uv = d.xz / (d.y + 0.18) * 1.6;
        float c = noise(uv * 1.3) * 0.6 + noise(uv * 3.1) * 0.3 + noise(uv * 7.0) * 0.1;
        float cloud = smoothstep(0.55, 0.85, c) * smoothstep(0.0, 0.08, d.y) * (1.0 - smoothstep(0.35, 0.7, d.y));
        col = mix(col, vec3(1.0, 0.98, 0.95) * (0.9 + 0.2 * s), cloud * 0.75);
        // below horizon: match the fog colour
        if (d.y < 0.0) col = uHorizon;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
