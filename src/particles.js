import * as THREE from 'three';

// Pooled water-droplet particles rendered as soft round points.
export function createSplash(scene, max = 2500) {
  const pos = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  const vel = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const maxLife = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 400 } },
    vertexShader: /* glsl */ `
      attribute float size; attribute float alpha; varying float vA; uniform float uScale;
      void main(){
        vA = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.15, d) * vA;
        vec3 col = mix(vec3(0.75, 0.95, 1.0), vec3(1.0), smoothstep(0.35, 0.0, d));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0;

  function emit(x, y, z, vx, vy, vz, s, l) {
    const i = cursor;
    cursor = (cursor + 1) % max;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    size[i] = s; life[i] = l; maxLife[i] = l;
  }

  // a crown-shaped burst
  function burst(p, count, power, carry = null) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      const out = (0.4 + r) * power * 0.45;
      const cx = carry ? carry.x * 0.3 : 0, cz = carry ? carry.z * 0.3 : 0;
      emit(
        p.x + Math.cos(a) * 0.6, p.y + 0.1, p.z + Math.sin(a) * 0.6,
        Math.cos(a) * out + cx, (0.5 + Math.random()) * power, Math.sin(a) * out + cz,
        0.15 + Math.random() * 0.35, 0.6 + Math.random() * 0.8
      );
    }
  }

  function update(dt, surfaceAt) {
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) { alpha[i] = 0; continue; }
      life[i] -= dt;
      vel[i * 3 + 1] -= 16 * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (vel[i * 3 + 1] < 0 && pos[i * 3 + 1] < surfaceAt(pos[i * 3], pos[i * 3 + 2]) - 0.2) life[i] = 0;
      alpha[i] = Math.max(0, Math.min(1, life[i] / maxLife[i] * 2)) * 0.9;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  }

  return { emit, burst, update, material: mat };
}
