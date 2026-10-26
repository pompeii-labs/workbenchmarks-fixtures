import * as THREE from 'three';

// GPU simulation of the liquid surface on a disk (disk radius = 1 in "p"
// space, mapped to texture uv in [0,1]^2).
//
// state  (256², RGBA): R = height h, G = dh/step, BA = orbital surface
//                      velocity of the waves (disk units / s)
// stir   (128², RG)  : incompressible surface current dragged by the cursor
//                      (semi-Lagrangian advection + Jacobi pressure projection)
// coord  (256², RGB) : RG = where the crema now at this point came from,
//                      B  = how much the crema has been parted (0..1)
//
// Waves use a reflective (Neumann) wall so they bounce off the cup and
// interfere. Crema is carried by stir + orbital motion.

const quadVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const common = /* glsl */ `
float inside(vec2 uv) {
  vec2 p = uv * 2.0 - 1.0;
  return step(dot(p, p), 1.0);
}
// distance-weighted pointer brush along a segment
float brush(vec2 p, vec4 seg, float s, out vec2 d) {
  vec2 a = seg.xy, b = seg.zw;
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  d = p - (a + ab * t);
  return exp(-dot(d, d) / (s * s));
}
`;

const waveFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uC2;
uniform float uDamp;
uniform float uDiff;
uniform float uGrav;
uniform float uFlowDamp;
uniform vec4 uSeg;
uniform vec2 uVel;
uniform float uActive;
uniform float uBrush;
uniform float uForce;
${common}
float hAt(vec2 uv, float hc) {
  return inside(uv) > 0.5 ? texture2D(uState, uv).r : hc;
}
void main() {
  vec2 uv = vUv;
  vec2 p = uv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) {
    // Outside the cup: passively mirror the nearest interior value so the
    // rendered edge interpolates correctly. Interior cells never read these.
    if (r > 1.0 + 8.0 * uTexel.x) { gl_FragColor = vec4(0.0); return; }
    vec2 pin = p / r * (1.0 - 2.5 * uTexel.x * 2.0);
    gl_FragColor = vec4(texture2D(uState, pin * 0.5 + 0.5).rg, 0.0, 0.0);
    return;
  }

  vec4 c = texture2D(uState, uv);
  float hc = c.r;
  vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
  float hl = hAt(uv - dx, hc), hr = hAt(uv + dx, hc);
  float hd = hAt(uv - dy, hc), hu = hAt(uv + dy, hc);
  float h1 = hAt(uv - dx - dy, hc), h2 = hAt(uv + dx - dy, hc);
  float h3 = hAt(uv - dx + dy, hc), h4 = hAt(uv + dx + dy, hc);
  float lap = (4.0 * (hl + hr + hd + hu) + (h1 + h2 + h3 + h4) - 20.0 * hc) / 6.0;

  float v = (c.g + uC2 * lap) * uDamp;

  // orbital motion of the surface under the waves
  vec2 flow = c.ba - uGrav * vec2(hr - hl, hu - hd) * 0.5;
  flow *= uFlowDamp;

  if (uActive > 0.5) {
    vec2 d;
    float w = brush(p, uSeg, uBrush, d);
    float speed = length(uVel);
    // energy grows faster than linearly with speed: a slow drag leaves a
    // gentle wake, a fast swipe throws a real wave
    float fs = min(speed, 9.0) * clamp(speed / 5.0, 0.12, 1.5);
    vec2 dir = uVel / max(speed, 1e-5);
    // bow wave ahead of the cursor, trough in its path
    float ahead = dot(dir, d) / uBrush;
    // zero-mean: liquid pushed out of the trough piles up around it
    vec2 d2;
    float w2 = brush(p, uSeg, uBrush * 2.0, d2);
    v += uForce * (1.6 * ahead * w - 0.9 * (w - 0.25 * w2)) * fs;
  }

  if (r > 0.9) {
    vec2 n = p / max(r, 1e-5);
    float un = dot(flow, n);
    if (un > 0.0) flow -= n * un * smoothstep(0.9, 1.0, r);
  }
  float h = (hc + v + uDiff * lap) * 0.9993;
  if (r > 1.0) flow = vec2(0.0);
  gl_FragColor = vec4(h, v, flow);
}`;

const stirAdvectFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uStir;
uniform float uDt;
uniform float uDamp;
uniform vec4 uSeg;
uniform vec2 uVel;
uniform float uActive;
uniform float uBrush;
uniform float uDrag;
${common}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  if (dot(p, p) > 1.0) { gl_FragColor = vec4(0.0); return; }
  vec2 u = texture2D(uStir, vUv).rg;
  vec2 u2 = texture2D(uStir, vUv - u * uDt * 0.5).rg;
  u = u2 * uDamp;
  if (uActive > 0.5) {
    vec2 d;
    float w = brush(p, uSeg, uBrush, d);
    vec2 target = uVel * uDrag;
    float tl = length(target);
    if (tl > 1.2) target *= 1.2 / tl;
    float k = w * clamp(length(uVel) * 0.08, 0.0, 0.6);
    u += (target - u) * k;
  }
  gl_FragColor = vec4(u, 0.0, 1.0);
}`;

const divFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uStir;
uniform vec2 uTexel;
${common}
vec2 U(vec2 uv) { return inside(uv) > 0.5 ? texture2D(uStir, uv).rg : vec2(0.0); }
void main() {
  vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
  float div = 0.5 * (U(vUv + dx).x - U(vUv - dx).x + U(vUv + dy).y - U(vUv - dy).y);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

const jacobiFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uP;
uniform sampler2D uDiv;
uniform vec2 uTexel;
${common}
void main() {
  float pc = texture2D(uP, vUv).r;
  vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
  float l = inside(vUv - dx) > 0.5 ? texture2D(uP, vUv - dx).r : pc;
  float r = inside(vUv + dx) > 0.5 ? texture2D(uP, vUv + dx).r : pc;
  float d = inside(vUv - dy) > 0.5 ? texture2D(uP, vUv - dy).r : pc;
  float u = inside(vUv + dy) > 0.5 ? texture2D(uP, vUv + dy).r : pc;
  float div = texture2D(uDiv, vUv).r;
  gl_FragColor = vec4((l + r + d + u - div) * 0.25, 0.0, 0.0, 1.0);
}`;

const projectFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uStir;
uniform sampler2D uP;
uniform vec2 uTexel;
${common}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  if (dot(p, p) > 1.0) { gl_FragColor = vec4(0.0); return; }
  float pc = texture2D(uP, vUv).r;
  vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
  float l = inside(vUv - dx) > 0.5 ? texture2D(uP, vUv - dx).r : pc;
  float r = inside(vUv + dx) > 0.5 ? texture2D(uP, vUv + dx).r : pc;
  float d = inside(vUv - dy) > 0.5 ? texture2D(uP, vUv - dy).r : pc;
  float u = inside(vUv + dy) > 0.5 ? texture2D(uP, vUv + dy).r : pc;
  vec2 vel = texture2D(uStir, vUv).rg - 0.5 * vec2(r - l, u - d);
  // free-slip wall
  float rr = length(p);
  if (rr > 0.92) {
    vec2 n = p / rr;
    float un = dot(vel, n);
    if (un > 0.0) vel -= n * un * smoothstep(0.92, 1.0, rr);
  }
  gl_FragColor = vec4(vel, 0.0, 1.0);
}`;

const coordFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uState;
uniform sampler2D uStir;
uniform sampler2D uCoord;
uniform float uDt;
uniform float uRelax;
uniform float uPartDecay;
uniform float uInit;
uniform vec4 uSeg;
uniform vec2 uVel;
uniform float uActive;
uniform float uBrush;
${common}
vec2 F(vec2 uv) {
  // stir field is in disk units/s; orbital flow too
  return texture2D(uStir, uv).rg + texture2D(uState, uv).ba;
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  if (uInit > 0.5 || dot(p, p) > 1.1) { gl_FragColor = vec4(p, 0.0, 1.0); return; }
  // RK2 back-trace (uv = p/2)
  vec2 mid = vUv - F(vUv) * uDt * 0.25;
  vec2 back = vUv - F(mid) * uDt * 0.5;
  vec3 c = texture2D(uCoord, back).rgb;
  vec2 q = mix(c.rg, p, uRelax);
  float part = c.b * uPartDecay;
  if (uActive > 0.5) {
    vec2 d;
    float w = brush(p, uSeg, uBrush * 0.75, d);
    float s = clamp((length(uVel) - 0.6) * 0.12, 0.0, 0.5);
    part = part + (1.0 - part) * w * s;
  }
  gl_FragColor = vec4(q, part, 1.0);
}`;

export class LiquidSim {
  constructor(renderer, size = 256) {
    this.renderer = renderer;
    this.size = size;
    const stirSize = size / 2;

    const ext = renderer.extensions;
    const canFloat = ext.has('EXT_color_buffer_float') && ext.has('OES_texture_float_linear');
    const type = canFloat ? THREE.FloatType : THREE.HalfFloatType;
    this.type = type;

    const mk = (n) =>
      new THREE.WebGLRenderTarget(n, n, {
        type,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false,
      });
    this.state = [mk(size), mk(size)];
    this.coord = [mk(size), mk(size)];
    this.stir = [mk(stirSize), mk(stirSize)];
    this.pressure = [mk(stirSize), mk(stirSize)];
    this.div = mk(stirSize);
    this.all = [...this.state, ...this.coord, ...this.stir, ...this.pressure, this.div];

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    const mat = (frag, uniforms) =>
      new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: frag, depthTest: false, depthWrite: false, uniforms });
    const pointerUniforms = () => ({
      uSeg: { value: new THREE.Vector4() },
      uVel: { value: new THREE.Vector2() },
      uActive: { value: 0 },
      uBrush: { value: 0.085 },
    });

    this.stepDt = 1 / 240;
    const texel = new THREE.Vector2(1 / size, 1 / size);
    const stirTexel = new THREE.Vector2(1 / stirSize, 1 / stirSize);

    this.waveMat = mat(waveFrag, {
      uState: { value: null },
      uTexel: { value: texel },
      uC2: { value: 0.42 },
      uDamp: { value: 0.9968 },
      uDiff: { value: 0.012 },
      uGrav: { value: 0.5 },
      uFlowDamp: { value: 0.99 },
      uForce: { value: 0.0045 },
      ...pointerUniforms(),
    });
    this.stirMat = mat(stirAdvectFrag, {
      uStir: { value: null },
      uDt: { value: 1 / 60 },
      uDamp: { value: 0.97 },
      uDrag: { value: 0.22 },
      ...pointerUniforms(),
    });
    this.stirMat.uniforms.uBrush.value = 0.11;
    this.divMat = mat(divFrag, { uStir: { value: null }, uTexel: { value: stirTexel } });
    this.jacobiMat = mat(jacobiFrag, { uP: { value: null }, uDiv: { value: null }, uTexel: { value: stirTexel } });
    this.projectMat = mat(projectFrag, { uStir: { value: null }, uP: { value: null }, uTexel: { value: stirTexel } });
    this.coordMat = mat(coordFrag, {
      uState: { value: null },
      uStir: { value: null },
      uCoord: { value: null },
      uDt: { value: 1 / 60 },
      uRelax: { value: 0.002 },
      uPartDecay: { value: 0.98 },
      uInit: { value: 0 },
      ...pointerUniforms(),
    });

    this.reset();
  }

  _run(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  _setPointer(u, seg, vel, active) {
    u.uActive.value = active ? 1 : 0;
    if (active) {
      u.uSeg.value.set(seg[0], seg[1], seg[2], seg[3]);
      u.uVel.value.set(vel[0], vel[1]);
    }
  }

  reset() {
    const prev = this.renderer.getRenderTarget();
    const prevColor = new THREE.Color();
    this.renderer.getClearColor(prevColor);
    const prevAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    for (const t of this.all) {
      this.renderer.setRenderTarget(t);
      this.renderer.clear();
    }
    this.renderer.setClearColor(prevColor, prevAlpha);
    const u = this.coordMat.uniforms;
    u.uInit.value = 1;
    u.uState.value = this.state[0].texture;
    u.uStir.value = this.stir[0].texture;
    u.uCoord.value = this.coord[1].texture;
    this._run(this.coordMat, this.coord[0]);
    u.uInit.value = 0;
    this.renderer.setRenderTarget(prev);
  }

  get stateTexture() { return this.state[0].texture; }
  get coordTexture() { return this.coord[0].texture; }

  /** One fixed wave step. seg: [x0,y0,x1,y1] disk units; vel: disk units/s. */
  step(seg, vel, active) {
    const prev = this.renderer.getRenderTarget();
    const u = this.waveMat.uniforms;
    u.uState.value = this.state[0].texture;
    this._setPointer(u, seg, vel, active);
    this._run(this.waveMat, this.state[1]);
    this.state.reverse();
    this.renderer.setRenderTarget(prev);
  }

  /** Per-frame: surface current + crema transport. */
  advect(dt, seg, vel, active, iterations = 20) {
    const prev = this.renderer.getRenderTarget();
    const s = this.stirMat.uniforms;
    s.uStir.value = this.stir[0].texture;
    s.uDt.value = dt;
    s.uDamp.value = Math.pow(0.4, dt); // current fades over a couple of seconds
    this._setPointer(s, seg, vel, active);
    this._run(this.stirMat, this.stir[1]);
    this.stir.reverse();

    this.divMat.uniforms.uStir.value = this.stir[0].texture;
    this._run(this.divMat, this.div);
    const j = this.jacobiMat.uniforms;
    j.uDiv.value = this.div.texture;
    for (let i = 0; i < iterations; i++) {
      j.uP.value = this.pressure[0].texture;
      this._run(this.jacobiMat, this.pressure[1]);
      this.pressure.reverse();
    }
    const pm = this.projectMat.uniforms;
    pm.uStir.value = this.stir[0].texture;
    pm.uP.value = this.pressure[0].texture;
    this._run(this.projectMat, this.stir[1]);
    this.stir.reverse();

    const c = this.coordMat.uniforms;
    c.uState.value = this.state[0].texture;
    c.uStir.value = this.stir[0].texture;
    c.uCoord.value = this.coord[0].texture;
    c.uDt.value = dt;
    c.uRelax.value = 1 - Math.pow(1 - 0.002, dt * 60);
    c.uPartDecay.value = Math.pow(0.45, dt); // parted crema closes over a few seconds
    this._setPointer(c, seg, vel, active);
    this._run(this.coordMat, this.coord[1]);
    this.coord.reverse();
    this.renderer.setRenderTarget(prev);
  }
}
