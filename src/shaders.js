// GLSL for the liquids. Colours are authored in sRGB and converted to linear,
// so the renderer's tone mapping / output colour space treat them like PBR materials.

const common = /* glsl */ `
  vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec2 hash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
  // distance to nearest cell point -> bubbles
  float cells(vec2 p, out float id) {
    vec2 i = floor(p), f = fract(p);
    float d = 9.0; id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(x, y);
      vec2 o = hash2(i + g);
      float dd = length(g + o - f);
      if (dd < d) { d = dd; id = hash(i + g); }
    }
    return d;
  }
`;

// ---------------------------------------------------------------------------
// Falling liquid: an open cylinder whose top is at y=0 and bottom at y=-len.
export const streamVert = /* glsl */ `
  uniform float uTime, uLen, uR, uSeed, uHead, uTail, uWobble, uMilk;
  varying float vS;
  varying vec3 vN;
  varying vec3 vView;
  varying float vAng;
  void main() {
    float s = -position.y;           // 0 top .. 1 bottom (geometry is unit length)
    vS = s;
    float ang = atan(position.z, position.x);
    vAng = ang;
    // a real stream necks down as it accelerates, and ropes slightly
    float r = uR * (1.0 - 0.42 * sqrt(s)) * (1.0 + (0.10 - 0.07 * uMilk) * sin(s * 34.0 - uTime * 26.0 + uSeed) + 0.05 * sin(ang * 3.0 + s * 20.0 - uTime * 9.0));
    vec3 p = vec3(position.x * r, -s * uLen, position.z * r);
    float sway = uWobble * s * s;
    p.x += sway * sin(uTime * 3.1 + uSeed) * 0.05 + 0.006 * sin(s * 12.0 - uTime * 15.0 + uSeed) * s;
    p.z += sway * cos(uTime * 2.3 + uSeed * 1.7) * 0.05;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * vec3(position.x, 0.0, position.z));
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

export const streamFrag = /* glsl */ `
  uniform float uTime, uHead, uTail, uLen, uMilk;
  uniform vec3 uCore, uEdge;
  varying float vS;
  varying vec3 vN;
  varying vec3 vView;
  varying float vAng;
  ${common}
  void main() {
    if (vS > uHead || vS < uTail) discard;
    float fres = pow(1.0 - abs(dot(normalize(vN), vView)), 1.6);
    float bands = 0.5 + 0.5 * sin(vS * uLen * 55.0 - uTime * 38.0 + vAng * 2.0);
    float flecks = noise(vec2(vAng * 3.0, vS * uLen * 30.0 - uTime * 22.0));
    vec3 core = toLin(uCore), edge = toLin(uEdge);
    vec3 col = mix(core, edge, clamp(fres * 1.25 + 0.25 * bands * (1.0 - uMilk) + 0.2 * flecks * (1.0 - uMilk), 0.0, 1.0));
    // a vertical specular streak from the key light
    float spec = smoothstep(0.55, 1.0, dot(normalize(vN), normalize(vec3(-0.6, 0.3, 0.75))));
    col += spec * mix(0.45, 0.25, uMilk) * (0.6 + 0.4 * flecks);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------
// The surface of the drink in the cup: crema -> settled crema -> milk canvas -> rosetta.
export const cupVert = /* glsl */ `
  varying vec2 vP;
  varying vec3 vWorld;
  void main() {
    vP = uv * 2.0 - 1.0;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export const cupFrag = /* glsl */ `
  uniform float uTime, uPour, uSettle, uMilk, uLeaf, uHeadArt, uPull, uFlow, uDone;
  uniform vec2 uImpact, uMilkImpact;
  uniform vec3 uCam;
  varying vec2 vP;
  varying vec3 vWorld;
  ${common}

  // rosetta mask (1 = white microfoam). y axis: -1 near viewer .. +1 far (towards the pitcher).
  float rosetta(vec2 p, float aa) {
    // organic warp: the foam is liquid, never perfect
    p += 0.025 * vec2(fbm(p * 3.0 + 4.0) - 0.5, fbm(p * 3.0 + 9.0) - 0.5);
    float y0 = -0.74, y1 = 0.40;
    // the pull-through drags every leaf toward the viewer along the centre line
    float drag = 0.16 * uPull * exp(-p.x * p.x / 0.035);
    float yy = p.y + drag;
    float s = (yy - y0) / (y1 - y0);
    float reveal = mix(-0.05, 1.05, uLeaf);
    // leaves widen after they have been laid down (pushed outward by the next wiggle)
    float age = clamp((reveal - s) * 3.0, 0.0, 1.0);
    float sc = clamp(s, 0.0, 1.0);
    float w = 0.66 * pow(sin(3.14159 * mix(0.08, 1.0, sc)), 0.6) * (1.0 - 0.4 * sc) * (0.5 + 0.5 * age);
    float ex = abs(p.x) / max(w, 1e-3);
    float inside = smoothstep(1.0, 0.96, ex) * smoothstep(-0.1, 0.02, s) * smoothstep(reveal + 0.04, reveal - 0.04, s + 0.1 * p.x * p.x);
    // crescent leaves: thick at the centre line, tapering to points at the edge
    float band = sin((yy - 0.9 * p.x * p.x) * 6.2831 * 4.4);
    float th = mix(-0.45, 0.95, ex * ex);
    float leaf = smoothstep(th - 0.12, th + 0.12, band);
    float m = inside * leaf;
    // soft white base that the leaves grow out of
    m = max(m, smoothstep(0.2, 0.15, length((p - vec2(0.0, -0.6)) * vec2(0.9, 1.6))) * smoothstep(0.0, 0.25, uLeaf));
    // head: a small heart laid at the far end
    vec2 h = p - vec2(0.0, 0.53);
    h.y += 0.07 * uPull * exp(-h.x * h.x / 0.01);
    float hr = 0.15 * uHeadArt;
    m = max(m, smoothstep(hr, hr - aa * 2.0, length(h * vec2(1.0, 1.25))));
    // stem: the pull-through line itself
    float stemEnd = mix(0.6, -0.8, uPull);
    float stem = smoothstep(0.03, 0.012, abs(p.x + 0.01 * sin(p.y * 9.0))) * step(stemEnd, p.y) * step(p.y, 0.6) * step(0.001, uPull);
    m = max(m, stem * 0.9);
    return clamp(m, 0.0, 1.0);
  }

  void main() {
    vec2 p = vP;
    float r = length(p);
    if (r > 1.0) discard;
    float t = uTime;
    float calm = 1.0 - uSettle;

    // ---- crema ----
    vec2 flow = vec2(t * 0.05, -t * 0.03) * (0.25 + calm);
    float swirlA = (1.0 - r) * 1.6 * calm * sin(t * 0.4);
    mat2 rot = mat2(cos(swirlA), -sin(swirlA), sin(swirlA), cos(swirlA));
    vec2 q = rot * p;
    float mott = fbm(q * 3.2 + flow);
    vec2 wq = q * 5.0 + vec2(fbm(q * 2.0 + flow + 3.0), fbm(q * 2.0 - flow + 7.0)) * 2.5;
    float tiger = fbm(wq + flow * 2.0);
    vec3 hazel = toLin(vec3(0.66, 0.38, 0.17));
    vec3 dark = toLin(vec3(0.30, 0.14, 0.05));
    vec3 gold = toLin(vec3(0.86, 0.61, 0.33));
    vec3 col = mix(hazel, gold, smoothstep(0.45, 0.8, mott) * 0.6);
    col = mix(col, dark, smoothstep(0.5, 0.72, tiger) * (0.25 + 0.3 * uSettle));
    col = mix(col, gold, smoothstep(0.42, 0.25, tiger) * 0.25 * uSettle);
    // fresh crema near the falling stream is dark and churned
    float di = length(p - uImpact);
    float churn = uPour * smoothstep(0.32, 0.0, di);
    col = mix(col, dark * 0.7, churn * 0.85);
    // rings travelling out from the impact
    float rings = sin(di * 46.0 - t * 14.0) * exp(-di * 3.2) * uPour;
    // bubbles: big & many while pouring, fine & few once settled
    float id;
    float cellScale = mix(16.0, 30.0, uSettle);
    float cd = cells(p * cellScale + vec2(0.0, t * 0.2 * calm), id);
    float bubR = mix(0.36, 0.18, uSettle) * step(id, mix(0.75, 0.18, uSettle));
    float bubble = smoothstep(bubR, bubR - 0.08, cd) - smoothstep(bubR - 0.1, bubR - 0.2, cd);
    col += bubble * 0.05 * (1.0 - uMilk) * (1.0 - 0.6 * uSettle);
    // darker meniscus ring where crema climbs the cup wall
    col = mix(col, dark, smoothstep(0.82, 1.0, r) * 0.55 * (1.0 - uMilk * 0.6));

    // ---- milk canvas ----
    vec3 canvas = toLin(vec3(0.68, 0.46, 0.27));
    canvas = mix(canvas, toLin(vec3(0.52, 0.31, 0.15)), smoothstep(0.7, 1.0, r) * 0.8);
    canvas = mix(canvas, toLin(vec3(0.78, 0.57, 0.36)), smoothstep(0.5, 0.75, mott) * 0.35);
    col = mix(col, canvas, uMilk);

    // ---- latte art ----
    float aa = fwidth(p.x) * 1.5;
    float art = rosetta(p, aa);
    vec3 foam = toLin(vec3(0.97, 0.93, 0.86));
    // edges of the white take a little brown: microfoam is thin there
    col = mix(col, foam, art);
    // incoming milk stream: white bloom at the impact, as milk surfaces
    float mi = length(p - uMilkImpact);
    float bloom = uFlow * smoothstep(0.14, 0.0, mi) * step(0.25, uLeaf + uHeadArt);
    col = mix(col, foam, bloom * 0.9);
    float mrings = sin(mi * 50.0 - t * 16.0) * exp(-mi * 5.0) * uFlow;

    // ---- light ----
    float h = rings * 0.5 + mrings * 0.5 + bubble * 0.2;
    vec3 n = normalize(vec3(dFdx(h) * 40.0, 1.0, dFdy(h) * 40.0));
    vec3 v = normalize(uCam - vWorld);
    vec3 L = normalize(vec3(-0.5, 1.0, 0.45));
    vec3 hv = normalize(L + v);
    float spec = pow(max(dot(n, hv), 0.0), 60.0);
    float window = smoothstep(0.5, 0.0, length((p - vec2(-0.45, 0.42)) * vec2(1.0, 2.6))) * 0.12;
    float shade = 0.9 + 0.1 * dot(n, L) + rings * 0.05;
    col = col * shade + spec * mix(0.3, 0.15, art) + window * (0.4 + uSettle * 0.4) * (1.0 - art * 0.6);
    // just inside the rim the liquid falls into shadow of the wall
    col *= mix(1.0, 0.78, smoothstep(0.9, 1.0, r));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------
// Milk in the steaming pitcher: a vortex that tightens and turns glossy as it stretches.
export const milkFrag = /* glsl */ `
  uniform float uTime, uSteam, uStretch;
  uniform vec2 uWand;
  uniform vec3 uCam;
  varying vec2 vP;
  varying vec3 vWorld;
  ${common}
  void main() {
    vec2 p = vP;
    float r = length(p);
    if (r > 1.0) discard;
    float t = uTime;
    float a = atan(p.y, p.x);
    float spin = t * (1.5 + 3.5 * uSteam);
    float spiral = sin(a * 3.0 + r * 9.0 - spin * 2.2) * 0.5 + 0.5;
    float streaks = fbm(vec2(a * 2.0 - spin, r * 6.0)) ;
    vec3 milk = toLin(vec3(0.88, 0.86, 0.82));
    vec3 shadow = toLin(vec3(0.66, 0.63, 0.59));
    vec3 col = mix(milk, shadow, (spiral * 0.4 + streaks * 0.45) * (0.35 + 0.65 * uSteam));
    // the vortex dips in the middle
    col *= 1.0 - 0.18 * smoothstep(0.6, 0.0, r) * uSteam;
    // big bubbles early, microfoam later
    float id;
    float cd = cells(vec2(a * 4.0 - spin * 0.6, r * 10.0 - t * 0.5) * mix(1.0, 2.6, uStretch), id);
    float bR = mix(0.42, 0.12, uStretch) * step(id, mix(0.8, 0.2, uStretch));
    float bubble = smoothstep(bR, bR - 0.07, cd) - smoothstep(bR - 0.08, bR - 0.16, cd);
    col -= bubble * 0.12;
    // churn where the wand tip sits just under the surface
    float dw = length(p - uWand);
    float boil = uSteam * smoothstep(0.35, 0.0, dw);
    float ripple = sin(dw * 60.0 - t * 30.0) * boil;
    col = mix(col, shadow, boil * 0.35);
    // gloss: a sharp window highlight that grows as microfoam forms
    float h = spiral * 0.3 * uSteam + ripple * 0.4 + bubble * 0.2;
    vec3 n = normalize(vec3(dFdx(h) * 35.0, 1.0, dFdy(h) * 35.0));
    vec3 v = normalize(uCam - vWorld);
    vec3 hv = normalize(normalize(vec3(-0.5, 1.0, 0.45)) + v);
    float spec = pow(max(dot(n, hv), 0.0), mix(20.0, 90.0, uStretch));
    col += spec * mix(0.15, 0.5, uStretch);
    col *= mix(1.0, 0.7, smoothstep(0.85, 1.0, r));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------
// Steam: GPU particles, each with its own life cycle; nothing is simulated on the CPU.
export const steamVert = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime, uPx, uIntensity, uRise, uSpread, uSize;
  varying float vAlpha;
  varying float vRot;
  void main() {
    float life = fract(uTime * (0.16 + 0.14 * aSeed.x) + aSeed.y);
    float ang = aSeed.z * 6.2831;
    vec3 p = position;
    float rad = uSpread * (0.25 + 0.75 * aSeed.w) * (0.4 + life);
    p.x += cos(ang) * rad + sin(life * 6.0 + aSeed.z * 20.0 + uTime * 0.7) * 0.08 * life;
    p.z += sin(ang) * rad + cos(life * 5.0 + aSeed.w * 20.0 + uTime * 0.6) * 0.08 * life;
    p.y += life * uRise * (0.7 + 0.5 * aSeed.x);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.35 + 1.4 * life) * uPx / -mv.z;
    vAlpha = uIntensity * smoothstep(0.0, 0.15, life) * (1.0 - life) * (0.5 + 0.5 * aSeed.w);
    vRot = aSeed.x * 6.2831 + life * 2.0;
  }
`;

export const steamFrag = /* glsl */ `
  varying float vAlpha;
  varying float vRot;
  ${common}
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    c = mat2(cos(vRot), -sin(vRot), sin(vRot), cos(vRot)) * c;
    float d = length(c);
    float puff = smoothstep(0.5, 0.0, d) * (0.55 + 0.45 * noise(c * 6.0 + vRot * 3.0));
    float a = puff * vAlpha * 0.32;
    if (a < 0.003) discard;
    gl_FragColor = vec4(toLin(vec3(0.97, 0.95, 0.92)), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
