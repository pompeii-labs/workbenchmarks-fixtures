import * as THREE from "three";
import { WAVES, waveHeight } from "./physics.js";
import { GATES } from "./course.js";

const coral = 0xf15b35;
const cream = 0xfff8dd;
const navy = 0x183b42;

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb9dcda);
  scene.fog = new THREE.FogExp2(0xb9dcda, 0.00095);
  const camera = new THREE.PerspectiveCamera(
    53,
    window.innerWidth / window.innerHeight,
    0.1,
    2400,
  );
  scene.add(new THREE.HemisphereLight(0xe6faff, 0x427f7a, 2.2));
  const sunLight = new THREE.DirectionalLight(0xffedcc, 3.1);
  sunLight.position.set(-130, 180, -200);
  scene.add(sunLight);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2000, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        sunDirection: { value: sunLight.position.clone().normalize() },
      },
      vertexShader: `varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `
      varying vec3 vDirection; uniform vec3 sunDirection;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec3 d=normalize(vDirection); float h=max(d.y,0.);
        vec3 col=mix(vec3(.78,.87,.81),vec3(.16,.49,.68),pow(h,.4));
        float sun=pow(max(dot(d,sunDirection),0.),400.);float glow=pow(max(dot(d,sunDirection),0.),6.);
        col+=vec3(1.,.81,.49)*sun*1.6+vec3(.13,.10,.04)*glow;
        vec2 uv=d.xz/(max(.05,d.y)+.2)*2.;
        float n=noise(uv*2.)*.55+noise(uv*4.1)*.25+noise(uv*8.)*.12;
        float cloud=smoothstep(.49,.72,n)*smoothstep(.05,.2,h)*(1.-smoothstep(.5,.8,h));
        col=mix(col,vec3(.94,.94,.82),cloud*.55);
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
  scene.add(sky);

  const waveFunction = `float wave(vec2 p,float t){float h=0.;${WAVES.map((w) => `h+=sin(dot(p,vec2(${w.x},${w.z}))+t*${w.speed})*${w.amplitude};`).join("")}h+=pow(max(0.,sin(dot(p,vec2(.012,.038))+t*.8)),6.)*3.8;return h;}`;
  const oceanGeometry = new THREE.PlaneGeometry(2400, 2400, 180, 180);
  oceanGeometry.rotateX(-Math.PI / 2);
  const positions = oceanGeometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    for (const axis of ["X", "Z"]) {
      const value = positions[`get${axis}`](i) / 1200;
      positions[`set${axis}`](
        i,
        Math.sign(value) * Math.abs(value) ** 1.65 * 1200,
      );
    }
  }
  const ocean = new THREE.Mesh(
    oceanGeometry,
    new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        center: { value: new THREE.Vector2() },
        sunDirection: { value: sunLight.position.clone().normalize() },
      },
      vertexShader: `uniform float time;uniform vec2 center;varying vec3 vWorld;varying vec3 vNormalSea;${waveFunction}void main(){vec3 p=position;p.xz+=center;p.y=wave(p.xz,time);vWorld=p;float nx=(wave(p.xz+vec2(.2,0),time)-p.y)/.2;float nz=(wave(p.xz+vec2(0,.2),time)-p.y)/.2;vNormalSea=normalize(vec3(-nx,1.,-nz));gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
      fragmentShader: `
      uniform float time; uniform vec3 sunDirection; varying vec3 vWorld;varying vec3 vNormalSea;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec2 p=vWorld.xz;float h=vWorld.y;
        float ripples=(noise(p*2.3+time*.7)-.5)*.045;
        vec3 n=normalize(vNormalSea+vec3(ripples,0.,ripples));
        vec3 viewDir=normalize(cameraPosition-vWorld);
        float fresnel=pow(1.-max(dot(n,viewDir),0.),3.);
        vec3 deep=vec3(.008,.17,.22),shallow=vec3(.012,.36,.35);
        vec3 col=mix(deep,shallow,clamp(.45+h*.09+noise(p*.035)*.2,0.,1.));
        float diffuse=max(dot(n,sunDirection),0.);
        col*=.79+diffuse*.35;
        vec3 reflection=mix(vec3(.34,.60,.61),vec3(.17,.43,.56),clamp(reflect(-viewDir,n).y,0.,1.));
        col=mix(col,reflection,.2+fresnel*.64);
        float spec=pow(max(dot(reflect(-sunDirection,n),viewDir),0.),140.);
        float glitter=pow(max(dot(reflect(-sunDirection,normalize(n+vec3(ripples*3.,0.,ripples*3.))),viewDir),0.),500.);
        col+=vec3(1.,.89,.65)*(spec*.65+glitter*.7);
        float crest=smoothstep(3.15,4.8,h);
        float foam=crest*smoothstep(.35,.64,noise(p*1.2+time*.2))*.72;
        float streak=pow(max(0.,sin(p.x*1.7+p.y*2.2+sin(p.y*.9)+time*1.8)),24.);
        foam+=streak*pow(clamp(length(n.xz)*2.,0.,1.),3.)*.18;
        col=mix(col,vec3(.78,.94,.85),foam);
        float distanceToCamera=length(vWorld-cameraPosition);
        float fog=1.-exp(-pow(distanceToCamera*.00115,1.35));
        col=mix(col,vec3(.64,.79,.76),fog);
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
  ocean.frustumCulled = false;
  scene.add(ocean);

  // Far-off land gives the horizon a sense of scale without bounding the playground.
  const islands = new THREE.Group();
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x54827b,
    roughness: 1,
    flatShading: true,
  });
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: 0x5b8970,
    roughness: 1,
    flatShading: true,
  });
  const islandSeeds = [
    [-760, -1000, 240, 85],
    [-1050, -640, 170, 58],
    [890, -1190, 310, 110],
    [1170, -500, 150, 44],
    [-400, 1220, 240, 75],
  ];
  for (let i = 0; i < islandSeeds.length; i++) {
    const [x, z, width, height] = islandSeeds[i];
    const group = new THREE.Group();
    for (let j = 0; j < 5; j++) {
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(
          width * (0.35 + Math.sin(j + i) * 0.1),
          height * (0.65 + Math.sin(j * 2.1) * 0.3),
          7,
          2,
        ),
        j % 2 ? grassMaterial : rockMaterial,
      );
      mesh.position.set(
        (j - 2) * width * 0.28,
        height * 0.14 - j * 1.5,
        Math.cos(j * 3) * 35,
      );
      mesh.scale.z = 0.65;
      group.add(mesh);
    }
    group.position.set(x, -9, z);
    islands.add(group);
  }
  scene.add(islands);

  const birds = new THREE.Group();
  const birdMaterial = new THREE.MeshBasicMaterial({
    color: 0x405d59,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 9; i++) {
    const bird = new THREE.Group();
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.PlaneGeometry(1.7, 0.18),
        birdMaterial,
      );
      wing.position.x = side * 0.8;
      wing.rotation.z = side * 0.18;
      wing.rotation.x = -0.3;
      bird.add(wing);
    }
    bird.position.set((i - 4) * 16, 26 + Math.sin(i * 3) * 9, -110 - i * 13);
    birds.add(bird);
  }
  scene.add(birds);
  return { renderer, scene, camera, ocean, sky, islands, birds };
}

function material(color, roughness = 0.5, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function part(group, geometry, mat, position, rotation) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  group.add(mesh);
  return mesh;
}

function hullGeometry(sections) {
  const vertices = [],
    indices = [];
  for (const [z, width, top, bottom] of sections) {
    vertices.push(
      -width,
      top,
      z,
      width,
      top,
      z,
      width * 0.65,
      bottom,
      z,
      -width * 0.65,
      bottom,
      z,
    );
  }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < 4; j++) {
      const a = i * 4 + j,
        b = i * 4 + ((j + 1) % 4),
        c = b + 4,
        d = a + 4;
      indices.push(a, d, b, b, d, c);
    }
  }
  indices.push(0, 2, 3, 0, 1, 2);
  const last = (sections.length - 1) * 4;
  indices.push(last, last + 2, last + 1, last, last + 3, last + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createJetSki() {
  const root = new THREE.Group();
  const white = material(cream, 0.3);
  const orange = material(coral, 0.27);
  const dark = material(navy, 0.55);
  const black = material(0x152c31, 0.8);
  const chrome = material(0xa0b9b4, 0.3, 0.65);
  const hull = hullGeometry([
    [-2.35, 0.06, 0.22, 0.05],
    [-1.65, 0.58, 0.38, -0.2],
    [-0.5, 0.88, 0.32, -0.47],
    [0.85, 0.86, 0.18, -0.45],
    [1.8, 0.7, 0.08, -0.27],
    [2.0, 0.56, 0.06, -0.17],
  ]);
  part(root, hull, white, [0, 0, 0]);
  const lowerHull = hullGeometry([
    [-2.25, 0.04, 0.05, -0.04],
    [-1.6, 0.53, -0.08, -0.25],
    [-0.5, 0.81, -0.14, -0.52],
    [0.9, 0.79, -0.14, -0.49],
    [1.8, 0.68, -0.1, -0.32],
    [2.02, 0.55, -0.1, -0.22],
  ]);
  part(root, lowerHull, dark, [0, 0, 0]);
  const hood = hullGeometry([
    [-2.2, 0.035, 0.25, 0.18],
    [-1.5, 0.47, 0.67, 0.28],
    [-0.75, 0.58, 0.65, 0.25],
    [-0.35, 0.54, 0.42, 0.22],
  ]);
  part(root, hood, orange, [0, 0, 0]);
  // The center accent and stepped saddle make the silhouette readable from behind.
  part(
    root,
    new THREE.BoxGeometry(0.16, 0.035, 1.25),
    white,
    [0, 0.665, -1.2],
    [-0.07, 0, 0],
  );
  const seat = part(
    root,
    new THREE.CapsuleGeometry(0.3, 1.2, 4, 10),
    black,
    [0, 0.55, 0.55],
    [Math.PI / 2, 0, 0],
  );
  seat.scale.set(1, 1, 0.55);
  part(root, new THREE.BoxGeometry(0.52, 0.12, 0.7), orange, [0, 0.48, 1.45]);
  for (const side of [-1, 1]) {
    part(root, new THREE.BoxGeometry(0.19, 0.055, 1.65), black, [
      side * 0.66,
      0.28,
      0.6,
    ]);
    part(root, new THREE.BoxGeometry(0.04, 0.12, 1.6), orange, [
      side * 0.84,
      0.17,
      0.35,
    ]);
    part(root, new THREE.BoxGeometry(0.12, 0.09, 0.33), white, [
      side * 0.57,
      0.13,
      1.83,
    ]);
  }
  part(
    root,
    new THREE.CylinderGeometry(0.055, 0.07, 0.6, 8),
    dark,
    [0, 0.8, -0.5],
    [-0.4, 0, 0],
  );
  part(
    root,
    new THREE.CylinderGeometry(0.045, 0.045, 1.12, 10),
    chrome,
    [0, 1.04, -0.62],
    [0, 0, Math.PI / 2],
  );
  for (const side of [-1, 1])
    part(
      root,
      new THREE.CylinderGeometry(0.065, 0.065, 0.24, 8),
      black,
      [side * 0.5, 1.04, -0.62],
      [0, 0, Math.PI / 2],
    );
  part(
    root,
    new THREE.CylinderGeometry(0.15, 0.19, 0.22, 12),
    dark,
    [0, -0.15, 1.92],
    [Math.PI / 2, 0, 0],
  );

  const rider = new THREE.Group();
  const skin = material(0xd69f72, 0.85);
  const shorts = material(0x294e54, 0.9);
  const vest = material(0xf6c273, 0.85);
  const hair = material(0x3b302b, 1);
  // Limb meshes connect explicit joints so hands stay on the handlebars.
  function limb(a, b, r, mat) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.85, r, start.distanceTo(end), 8),
      mat,
    );
    mesh.position.copy(start).lerp(end, 0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      end.sub(start).normalize(),
    );
    rider.add(mesh);
  }
  for (const side of [-1, 1]) {
    limb([side * 0.23, 0.87, 0.66], [side * 0.44, 0.5, 0.18], 0.16, shorts);
    limb([side * 0.44, 0.5, 0.18], [side * 0.58, 0.29, 0.72], 0.105, skin);
    part(rider, new THREE.BoxGeometry(0.19, 0.13, 0.36), white, [
      side * 0.59,
      0.31,
      0.67,
    ]);
    limb([side * 0.31, 1.66, 0.02], [side * 0.48, 1.25, -0.18], 0.105, skin);
    limb([side * 0.48, 1.25, -0.18], [side * 0.47, 1.04, -0.62], 0.085, skin);
    part(rider, new THREE.SphereGeometry(0.095, 8, 6), skin, [
      side * 0.47,
      1.04,
      -0.62,
    ]);
  }
  const body = part(
    rider,
    new THREE.CylinderGeometry(0.32, 0.24, 0.77, 10),
    vest,
    [0, 1.28, 0.34],
    [-0.38, 0, 0],
  );
  body.scale.z = 0.7;
  for (const y of [1.16, 1.4])
    part(
      rider,
      new THREE.BoxGeometry(0.57, 0.065, 0.4),
      dark,
      [0, y, 0.33],
      [-0.38, 0, 0],
    );
  part(
    rider,
    new THREE.CylinderGeometry(0.095, 0.1, 0.18, 8),
    skin,
    [0, 1.76, 0.05],
    [-0.25, 0, 0],
  );
  const head = part(
    rider,
    new THREE.SphereGeometry(0.235, 12, 10),
    skin,
    [0, 1.99, -0.01],
  );
  head.scale.set(0.85, 1.1, 0.95);
  part(
    rider,
    new THREE.SphereGeometry(0.236, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hair,
    [0, 2.03, 0],
  );
  part(
    rider,
    new THREE.BoxGeometry(0.39, 0.1, 0.12),
    dark,
    [0, 2.01, -0.2],
    [-0.1, 0, 0],
  );
  root.add(rider);
  root.scale.setScalar(1.15);
  return { root, rider };
}

export function createBuoys(scene) {
  const orange = material(coral, 0.5);
  const white = material(cream, 0.65);
  const dark = material(navy, 0.75);
  const buoys = GATES.flatMap((gate, i) => [-1, 1].map((side) => {
    const x = gate.x + Math.cos(gate.heading) * gate.halfWidth * side;
    const z = gate.z - Math.sin(gate.heading) * gate.halfWidth * side;
    const group = new THREE.Group();
    part(
      group,
      new THREE.CylinderGeometry(0.58, 0.7, 0.6, 16),
      orange,
      [0, 0.16, 0],
    );
    part(
      group,
      new THREE.CylinderGeometry(0.44, 0.58, 1.1, 16),
      white,
      [0, 0.95, 0],
    );
    part(
      group,
      new THREE.CylinderGeometry(0.49, 0.51, 0.3, 16),
      orange,
      [0, 1.02, 0],
    );
    part(group, new THREE.ConeGeometry(0.44, 0.45, 16), orange, [0, 1.72, 0]);
    part(
      group,
      new THREE.CylinderGeometry(0.035, 0.035, 2.7, 6),
      dark,
      [0, 2.5, 0],
    );
    const flagCanvas = document.createElement("canvas");
    flagCanvas.width = 256;
    flagCanvas.height = 128;
    const context = flagCanvas.getContext("2d");
    context.fillStyle = i === 0 ? "#fff8dd" : "#f15b35";
    context.fillRect(0, 0, 256, 128);
    context.fillStyle = "#183b42";
    if (i === 0) {
      for (let row = 0; row < 4; row++)
        for (let column = 0; column < 8; column++)
          if ((row + column) % 2 === 0) context.fillRect(column * 32, row * 32, 32, 32);
    } else {
      context.font = "bold 96px sans-serif";
      context.textAlign = "center";
      context.fillText(String(i), 128, 100);
    }
    const texture = new THREE.CanvasTexture(flagCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const flag = part(
      group,
      new THREE.PlaneGeometry(2, 1),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
      [0.95, 3.5, 0],
    );
    flag.material.side = THREE.DoubleSide;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.07, 6, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffc282,
        transparent: true,
        opacity: 0.8,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.2;
    group.add(ring);
    group.scale.setScalar(1.5);
    group.position.set(x, 0, z);
    scene.add(group);
    return { group, ring, flag, index: i, x, z };
  }));
  // Sparse floating edge markers suggest a racing line without fencing in the sea.
  for (let i = 0; i < GATES.length; i++) {
    const a = GATES[i], b = GATES[(i + 1) % GATES.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const count = Math.floor(length / 55);
    for (let j = 1; j <= count; j++) {
      const fraction = j / (count + 1);
      for (const side of [-1, 1]) {
        const x = a.x + (b.x - a.x) * fraction + (b.z - a.z) / length * 23 * side;
        const z = a.z + (b.z - a.z) * fraction - (b.x - a.x) / length * 23 * side;
        const group = new THREE.Group();
        part(group, new THREE.SphereGeometry(0.65, 8, 6), side < 0 ? orange : white, [0, 0.25, 0]);
        group.position.set(x, 0, z);
        scene.add(group);
        buoys.push({ group, index: i, x, z });
      }
    }
  }
  return buoys;
}

export function createSpray(scene, count = 1500) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const particles = Array.from({ length: count }, () => ({
    age: 10,
    life: 1,
    vx: 0,
    vy: 0,
    vz: 0,
    foam: false,
  }));
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { pixelRatio: { value: Math.min(window.devicePixelRatio, 1.6) } },
    vertexShader: `attribute float size;attribute float alpha;varying float vAlpha;uniform float pixelRatio;void main(){vAlpha=alpha;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=min(70.,size*pixelRatio*290./max(1.,-mv.z));gl_Position=projectionMatrix*mv;}`,
    fragmentShader:
      `varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(.9,.99,.96,vAlpha*(1.-smoothstep(.4,1.,d)));#include <colorspace_fragment>}`.replace(
        "#include",
        "\n#include",
      ),
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0,
    accumulator = 0;
  function emit(ride, amount, landing = false) {
    const sin = Math.sin(ride.heading),
      cos = Math.cos(ride.heading);
    for (let n = 0; n < amount; n++) {
      const i = cursor++ % count,
        p = particles[i];
      const side = Math.random() < 0.5 ? -1 : 1;
      const foam = !landing && Math.random() < 0.48;
      const back = landing
        ? (Math.random() - 0.5) * 3
        : 1.6 + Math.random() * 0.8;
      const across =
        side * (landing ? Math.random() * 1.2 : 0.4 + Math.random() * 0.5);
      positions[i * 3] = ride.x + sin * back + cos * across;
      positions[i * 3 + 1] = ride.y - 0.25;
      positions[i * 3 + 2] = ride.z + cos * back - sin * across;
      p.age = 0;
      p.life = foam ? 2.5 + Math.random() * 2 : 0.5 + Math.random() * 0.8;
      p.foam = foam;
      const force = landing ? 6 + Math.random() * 6 : ride.speed * 0.09;
      p.vx = sin * 2 + cos * side * force;
      p.vz = cos * 2 - sin * side * force;
      p.vy = foam
        ? 0
        : landing
          ? 3 + Math.random() * 5
          : 1 + Math.random() * 2.8;
      sizes[i] = foam ? 0.7 + Math.random() * 1.1 : 0.1 + Math.random() * 0.24;
    }
  }
  return {
    emit,
    update(ride, time, dt, active) {
      if (active && !ride.airborne && !ride.rampContact && ride.speed > 2) {
        accumulator += ride.speed * dt * 8;
        const amount = Math.floor(accumulator);
        accumulator -= amount;
        emit(ride, amount);
      }
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        p.age += dt;
        if (p.age >= p.life) {
          alphas[i] = 0;
          continue;
        }
        positions[i * 3] += p.vx * dt;
        positions[i * 3 + 2] += p.vz * dt;
        if (p.foam) {
          positions[i * 3 + 1] =
            waveHeight(positions[i * 3], positions[i * 3 + 2], time) + 0.09;
          p.vx *= Math.exp(-dt * 2);
          p.vz *= Math.exp(-dt * 2);
          sizes[i] += dt * 0.2;
        } else {
          p.vy -= 9 * dt;
          positions[i * 3 + 1] += p.vy * dt;
          const sea = waveHeight(positions[i * 3], positions[i * 3 + 2], time);
          if (positions[i * 3 + 1] < sea) {
            p.foam = true;
            p.life = p.age + 0.7;
            positions[i * 3 + 1] = sea + 0.08;
            sizes[i] *= 2;
          }
        }
        alphas[i] = (1 - p.age / p.life) * (p.foam ? 0.38 : 0.75);
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.size.needsUpdate = true;
      geometry.attributes.alpha.needsUpdate = true;
    },
  };
}
