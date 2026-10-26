// Shaders for the liquid surface.

export const liquidVert = /* glsl */ `
uniform sampler2D uState;
uniform float uAmp;
uniform float uRadius;
varying vec2 vP;
varying vec3 vWorld;
void main() {
  vec3 pos = position;
  vec2 p = pos.xz / uRadius;
  vP = p;
  float h = texture2D(uState, p * 0.5 + 0.5).r;
  pos.y += h * uAmp;
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const liquidFrag = /* glsl */ `
precision highp float;
uniform sampler2D uState;
uniform sampler2D uCoord;
uniform samplerCube uEnv;
uniform vec2 uTexel;
uniform float uAmp;
uniform float uRadius;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uTime;
varying vec2 vP;
varying vec3 vWorld;

// ---------- noise ----------
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = m * p; a *= 0.5; }
  return s;
}
// cellular: distance to nearest feature point (bubbles)
float cells(vec2 p, out float id) {
  vec2 i = floor(p), f = fract(p);
  float md = 8.0; id = 0.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = hash22(i + g);
    vec2 d = g + o - f;
    float dd = dot(d, d);
    if (dd < md) { md = dd; id = hash12(i + g + 17.0); }
  }
  return sqrt(md);
}

// ---------- crema ----------
const vec3 ESPRESSO = vec3(0.020, 0.0065, 0.0025);
const vec3 CREMA_DARK = vec3(0.115, 0.038, 0.011);
const vec3 CREMA = vec3(0.31, 0.125, 0.038);
const vec3 CREMA_LIGHT = vec3(0.50, 0.255, 0.095);

vec3 cremaColor(vec2 q, float thick, float rNow, out float foam) {
  float rq = length(q);
  // domain-warped mottling ("tiger striping")
  vec2 w = vec2(fbm(q * 2.5 + 1.7), fbm(q * 2.5 - 4.3));
  float m = fbm(q * 7.0 + w * 2.2);
  float fine = fbm(q * 22.0 + w * 3.0);
  // fine "tiger" flecks of darker brown
  float fleck = smoothstep(0.52, 0.72, fbm(q * 13.0 - w * 2.0) * 0.6 + fine * 0.5);
  vec3 col = mix(CREMA, CREMA_LIGHT, smoothstep(0.45, 0.75, m) * 0.55);
  col = mix(col, CREMA_DARK, fleck * 0.55);
  col *= 0.88 + 0.24 * fine;
  // lighter, denser centre; darker band toward the wall
  col *= mix(1.1, 0.72, smoothstep(0.2, 0.95, rq));
  col = mix(col, CREMA_DARK * 0.7, smoothstep(0.82, 0.98, rq) * 0.6);

  // micro bubbles
  float id;
  float c1 = cells(q * 70.0, id);
  float bub = smoothstep(0.32, 0.18, c1) * step(0.55, id);
  col *= 1.0 - 0.18 * bub;
  col += CREMA_LIGHT * 0.10 * smoothstep(0.12, 0.0, abs(c1 - 0.25)) * step(0.55, id);
  // a few larger bubbles clinging near the rim
  float c2 = cells(q * 26.0 + 3.0, id);
  float rimZone = smoothstep(0.78, 0.95, rq);
  float big = step(0.86, id) * rimZone;
  float ring = smoothstep(0.09, 0.0, abs(c2 - 0.22)) * big;
  col = mix(col, CREMA_DARK * 0.6, smoothstep(0.2, 0.1, c2) * big * 0.7);
  col += CREMA_LIGHT * 0.35 * ring;

  // Thinned crema (stretched by motion) reveals the dark coffee beneath.
  float t = smoothstep(0.15, 0.9, thick);
  foam = t;
  col = mix(ESPRESSO, col, t);
  // compressed crema bunches up lighter
  return col;
}

void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  vec2 uv = vP * 0.5 + 0.5;

  // ---- surface normal from height field ----
  vec2 tx = vec2(uTexel.x, 0.0), ty = vec2(0.0, uTexel.y);
  float hl = texture2D(uState, uv - tx).r, hr = texture2D(uState, uv + tx).r;
  float hd = texture2D(uState, uv - ty).r, hu = texture2D(uState, uv + ty).r;
  float cellW = uTexel.x * 2.0 * uRadius; // world size of one texel
  // normals slightly exaggerated relative to the (tiny) real displacement
  vec2 g = vec2(hr - hl, hu - hd) * uAmp * 1.8 / (2.0 * cellW);
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));

  vec3 V = normalize(cameraPosition - vWorld);
  float NdV = max(dot(N, V), 0.0);

  // ---- refraction: the view ray bends through the surface film ----
  vec3 T = refract(-V, N, 1.0 / 1.34);
  vec3 T0 = refract(-V, vec3(0.0, 1.0, 0.0), 1.0 / 1.34);
  vec2 refr = (T.xz / max(-T.y, 0.25) - T0.xz / max(-T0.y, 0.25)) * 0.05;
  vec2 pr = vP + refr / uRadius;
  vec2 cuv = pr * 0.5 + 0.5;

  // crema source coordinates + local stretch (Jacobian of the coord map)
  vec3 cs = texture2D(uCoord, cuv).rgb;
  vec2 q = cs.rg;
  vec2 e = uTexel * 1.5;
  vec2 qx = texture2D(uCoord, cuv + vec2(e.x, 0.0)).rg - texture2D(uCoord, cuv - vec2(e.x, 0.0)).rg;
  vec2 qy = texture2D(uCoord, cuv + vec2(0.0, e.y)).rg - texture2D(uCoord, cuv - vec2(0.0, e.y)).rg;
  float det = (qx.x * qy.y - qx.y * qy.x) / (4.0 * e.x * e.y * 4.0);
  // det < 1: crema spread thin, det > 1: crema bunched up
  // parted crema (B channel) reveals the dark coffee; stretching thins it too
  float thick = clamp((1.0 - cs.b * 1.25) * mix(1.0, clamp(det, 0.4, 1.0), 0.6), 0.0, 1.0);

  float foam;
  vec3 albedo = cremaColor(q, thick, r, foam);

  // ---- lighting ----
  vec3 L = normalize(uLightDir);
  float diff = max(dot(N, L), 0.0);
  // ambient from the environment (blurred)
  vec3 amb = textureCube(uEnv, vec3(N.x, max(N.y, 0.2), N.z), 7.0).rgb;
  float wallAO = mix(1.0, 0.55, smoothstep(0.7, 1.0, r));
  // crema shadowed by the cup wall on the side away from the light
  float side = dot(normalize(vP + 1e-5), normalize(vec2(L.x, L.z)));
  float rimShadow = 1.0 - smoothstep(0.6, 1.0, r) * smoothstep(-0.2, -0.9, side) * 0.55;
  vec3 col = albedo * (amb * 0.9 * wallAO + uLightColor * diff * 0.75 * rimShadow);
  // subsurface-ish warm glow in foam
  col += albedo * albedo * 0.25 * foam;

  // ---- reflection ----
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  float rough = 0.0;
  vec3 env = textureCube(uEnv, R, rough).rgb;
  float F = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
  // foam is less mirror-like than bare coffee
  float specK = mix(1.0, 0.3, foam);
  // dark interior of cup wall shows in reflections near the edge
  float wallRefl = smoothstep(0.82, 1.0, r) * smoothstep(0.0, 0.6, dot(normalize(R.xz + 1e-5), normalize(vP + 1e-5)));
  env = mix(env, vec3(0.55, 0.52, 0.5) * 0.6, wallRefl * 0.6);
  col = col * (1.0 - F) + env * F * specK * rimShadow;

  // sharp sun glint
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), mix(3000.0, 900.0, foam));
  col += uLightColor * spec * mix(1.5, 0.35, foam) * rimShadow;

  // thin bright meniscus where liquid meets the ceramic
  float men = smoothstep(0.965, 0.995, r);
  col = mix(col, col * 0.4 + env * 0.18 + CREMA_LIGHT * 0.15, men * 0.6);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
