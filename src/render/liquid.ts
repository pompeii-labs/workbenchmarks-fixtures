import * as THREE from 'three/webgpu';
import {
  Fn,
  clamp,
  color,
  dot,
  exp,
  float,
  length,
  max,
  mix,
  mx_fractal_noise_float,
  mx_worley_noise_float,
  normalize,
  oneMinus,
  pow,
  reflect,
  refract,
  saturate,
  smoothstep,
  sqrt,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  positionLocal,
  cameraPosition,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { EXTENT, N } from '../sim/LiquidSim';
import { studioEnv } from './environment';

// The liquid surface. Unlit node material with its own shading so every term
// responds to the simulated waves:
//  - vertex height from the height field, per-pixel normals from its gradient
//  - crema sampled at the advected material coordinate (carried and stretched)
//  - crema thickness from the flow's Jacobian: stretched crema shows espresso
//  - refraction: the deeper crema layer is seen through a refracted ray
//  - mirror reflection of the studio window, or of the porcelain wall when the
//    reflected ray hits the cup (analytic ray-cylinder test)
//  - key-light glints and the wall's own shadow, both analytic

export const PATTERN_EXTENT = 1.35; // crema pattern covers material coords in [-1.35, 1.35]

/** Rest-surface geometry: a polar disc, dense enough for smooth displacement. */
export function createLiquidGeometry(radius = 1, rings = 76, segments = 200): THREE.BufferGeometry {
  const positions: number[] = [0, 0, 0];
  const indices: number[] = [];
  for (let r = 1; r <= rings; r++) {
    const rad = (r / rings) * radius;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    }
  }
  for (let s = 0; s < segments; s++) {
    const a = 1 + s;
    const b = 1 + ((s + 1) % segments);
    indices.push(0, b, a);
  }
  for (let r = 1; r < rings; r++) {
    const base0 = 1 + (r - 1) * segments;
    const base1 = 1 + r * segments;
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      const a = base0 + s;
      const b = base0 + s1;
      const c = base1 + s;
      const d = base1 + s1;
      indices.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

export function createFieldTexture(): { texture: THREE.DataTexture; data: Uint16Array } {
  const data = new Uint16Array(N * N * 4);
  const texture = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return { texture, data };
}

/**
 * Bake the crema pattern once into a mipmapped texture. Channels:
 * R large mottling, G tiger striping, B dark specks.
 * Sampling a texture (rather than noise per pixel) keeps the liquid cheap and
 * gives filtered, non-shimmering detail on small screens.
 */
export function bakeCremaPattern(renderer: THREE.WebGPURenderer, seed: number, size = 1024) {
  const target = new THREE.RenderTarget(size, size, {
    type: THREE.UnsignedByteType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  const s = uniform(seed);
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = Fn(() => {
    const q = uv().mul(2).sub(1).mul(PATTERN_EXTENT);
    const large = mx_fractal_noise_float(vec3(q.mul(1.7), s), 4, 2.0, 0.5);
    const warp = vec2(
      mx_fractal_noise_float(vec3(q.mul(2.3), s.add(5.1)), 2),
      mx_fractal_noise_float(vec3(q.mul(2.3), s.add(9.7)), 2),
    );
    const tigerN = mx_fractal_noise_float(vec3(q.mul(3.4).add(warp.mul(1.1)), s.add(2.3)), 4, 2.1, 0.5);
    const tiger = smoothstep(-0.1, 0.55, tigerN);
    const speckD = mx_worley_noise_float(q.mul(64).add(warp.mul(3)), 0.9);
    const speckMask = smoothstep(0.0, 0.25, mx_fractal_noise_float(vec3(q.mul(3.1), s.add(4.4)), 2));
    const speck = oneMinus(smoothstep(0.08, 0.24, speckD)).mul(speckMask);
    return vec3(saturate(large.mul(0.6).add(0.5)), tiger, speck);
  })();
  const quad = new THREE.QuadMesh(mat);
  const rebake = (value: number) => {
    s.value = value;
    const prev = renderer.getRenderTarget();
    const prevTone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(target);
    quad.render(renderer);
    renderer.setRenderTarget(prev);
    renderer.toneMapping = prevTone;
  };
  rebake(seed);
  return { texture: target.texture, rebake };
}

export type LiquidUniforms = ReturnType<typeof createLiquidMaterial>['uniforms'];

export function createLiquidMaterial(opts: {
  fieldA: THREE.Texture;
  fieldB: THREE.Texture;
  pattern: THREE.Texture;
  surfaceY: number; // world y of the rest surface
  rimHeight: number; // wall height above the rest surface
  keyDir: THREE.Vector3;
}) {
  const uniforms = {
    keyDir: uniform(opts.keyDir.clone()),
    keyColor: uniform(new THREE.Vector3().setFromColor(new THREE.Color('#fff1de'))),
    keyIntensity: uniform(2.6),
    ambient: uniform(new THREE.Vector3().setFromColor(new THREE.Color('#6d5a4c'))),
    heightScale: uniform(0.7),
    reflectBoost: uniform(1.0),
    slopeScale: uniform(1.0),
    surfaceY: uniform(opts.surfaceY),
    rimHeight: uniform(opts.rimHeight),
  };

  const toFieldUV = (p: Node<'vec2'>) => p.add(EXTENT).div(EXTENT * 2);
  const toPatternUV = (q: Node<'vec2'>) => q.div(PATTERN_EXTENT * 2).add(0.5);

  const material = new THREE.MeshBasicNodeMaterial();

  // Vertex: rest disc in local XZ, displaced by the height field plus a
  // meniscus where the liquid climbs the porcelain.
  const restXZ = positionLocal.xz;
  const rV = length(restXZ);
  const meniscus = (r: Node<'float'>) => exp(r.sub(1).div(0.022)).mul(0.011);
  const hV = texture(opts.fieldA, toFieldUV(restXZ), float(0)).x;
  const yV = hV.mul(uniforms.heightScale).add(meniscus(rV));
  material.positionNode = vec3(positionLocal.x, yV, positionLocal.z);
  const vXZ = restXZ.toVarying('vLiquidXZ');
  const vY = yV.toVarying('vLiquidY');

  material.colorNode = Fn(() => {
    const p = vXZ;
    const r = length(p);
    const fa = texture(opts.fieldA, toFieldUV(p));
    const fb = texture(opts.fieldB, toFieldUV(p));

    // Normal: wave gradient plus the meniscus slope (radial).
    const menSlope = meniscus(r).div(0.022);
    const radial = p.div(max(r, 1e-4));
    const grad = fb.xy.mul(uniforms.slopeScale).add(radial.mul(menSlope));
    const n = normalize(vec3(grad.x.negate(), 1, grad.y.negate()));

    const P = vec3(p.x, vY, p.y); // liquid-local: rest surface at y = 0
    const camL = cameraPosition.sub(vec3(0, uniforms.surfaceY, 0));
    const V = normalize(camL.sub(P));
    const L = normalize(uniforms.keyDir);
    const ambient = uniforms.ambient;
    const keyLight = uniforms.keyColor.mul(uniforms.keyIntensity);
    const NdV = saturate(dot(n, V));

    // ---- crema: top foam at the advected material coordinate ----
    const q = p.add(fa.yz);
    const pat = texture(opts.pattern, toPatternUV(q));
    const qr = length(q);
    const rimZone = smoothstep(0.7, 1.03, qr);
    const heart = oneMinus(smoothstep(0.0, 0.8, length(q.sub(vec2(0.1, -0.06)))));
    const base = mix(color('#6b3c20'), color('#c08b55'), saturate(pat.x.mul(0.75).add(heart.mul(0.5)).sub(0.1)));
    const tigered = mix(base, color('#6a3616'), pat.y.mul(0.5));
    const rimmed = mix(tigered, color('#47210c'), rimZone.mul(0.6));
    const top = mix(rimmed, color('#4a230d'), pat.z.mul(0.2));

    // ---- refraction: deeper layer through the refracted view ray ----
    const T = refract(V.negate(), n, 1 / 1.34);
    const depth = float(0.07);
    const offs = T.xz.mul(depth.div(max(T.y.negate(), 0.25)));
    const pd = p.add(offs);
    const fd = texture(opts.fieldA, toFieldUV(pd));
    const qd = pd.add(fd.yz);
    const patD = texture(opts.pattern, toPatternUV(qd.mul(1.03).add(0.17)));
    const deep = mix(color('#2b1206'), color('#6b3414'), patD.x.mul(0.7).add(patD.y.mul(-0.35)).add(0.25).clamp(0, 1));

    // Thickness: stretched crema thins until espresso shows.
    // Crema clings to the porcelain; the grid's staircase wall makes the
    // Jacobian unreliable in the last cells, so the rim keeps its crema.
    const thick = mix(fa.w, float(1), smoothstep(0.84, 0.975, r));
    const cover = smoothstep(0.16, 0.78, thick.mul(pat.x.mul(0.35).add(0.82))).mul(0.9);
    const body = mix(color('#0d0502'), deep, smoothstep(0.15, 0.7, thick));
    const albedo = mix(body, top, cover);

    // ---- wall shadow (analytic): does the ray to the light leave over the rim? ----
    // Distance along d from o (inside the unit cylinder) to the wall.
    const wallDistance = (o: Node<'vec3'>, d: Node<'vec3'>) => {
      const a = max(dot(d.xz, d.xz), 1e-5);
      const b = dot(o.xz, d.xz).mul(2);
      const c = dot(o.xz, o.xz).sub(1);
      return b.negate().add(sqrt(max(b.mul(b).sub(a.mul(c).mul(4)), 0))).div(a.mul(2));
    };
    const lightExit = P.y.add(wallDistance(P, L).mul(L.y));
    const lit = smoothstep(uniforms.rimHeight.sub(0.03), uniforms.rimHeight.add(0.06), lightExit);
    const ao = mix(float(0.55), float(1), smoothstep(0.0, 0.16, oneMinus(r)));

    const NdL = saturate(dot(n, L));
    const wrapL = saturate(dot(n, L).add(0.3).div(1.3));
    const diffuse = albedo.mul(
      ambient.mul(ao).add(keyLight.mul(mix(NdL, wrapL, 0.5)).mul(lit)),
    );

    // ---- reflection: porcelain wall or the window ----
    const R = reflect(V.negate(), n);
    const Rw = vec3(R.x, max(R.y, 0.02), R.z).normalize();
    const hit = P.add(Rw.mul(wallDistance(P, Rw)));
    const onWall = oneMinus(smoothstep(uniforms.rimHeight.sub(0.015), uniforms.rimHeight.add(0.015), hit.y));
    const wallN = vec3(hit.x.negate(), 0.15, hit.z.negate()).normalize();
    const wallLight = ambient
      .mul(1.6)
      .add(keyLight.mul(saturate(dot(wallN, L))).mul(0.85))
      .mul(smoothstep(-0.05, 0.12, hit.y).mul(0.5).add(0.5));
    const porcelain = wallLight.mul(color('#efe9e1'));
    const env = studioEnv(Rw);
    const reflected = mix(env, porcelain, onWall);
    const F = float(0.02).add(float(0.98).mul(pow(oneMinus(NdV), 5)));
    const gloss = mix(float(1.0), float(0.6), cover);

    // ---- key-light glints on wave faces ----
    const H = normalize(L.add(V));
    const NdH = saturate(dot(n, H));
    const spec = pow(NdH, 1400)
      .mul(60)
      .add(pow(NdH, 120).mul(0.5))
      .mul(lit)
      .mul(gloss);
    const glint = keyLight.mul(spec).mul(F.mul(8).add(0.1));

    const out = diffuse.mul(oneMinus(F)).add(reflected.mul(F).mul(gloss).mul(uniforms.reflectBoost)).add(glint);
    return clamp(out, 0, 64);
  })();

  return { material, uniforms };
}

