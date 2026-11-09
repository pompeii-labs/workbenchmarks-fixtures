import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPelican, createUnicycle, createPin, poseWing, poseLegs, mesh } from './model.js';
import { handPose, pinPose, ridePose, mod, AXLE_HEIGHT, GROUND_HEIGHT, WHEEL_RADIUS } from './motion.js';
import './style.css';

const canvas = document.querySelector('#scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch {
  document.querySelector('#fallback').hidden = false;
  canvas.hidden = true;
}

if (renderer) start(renderer);

function start(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dce6df');
  scene.fog = new THREE.Fog('#dce6df', 22, 56);
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(environment, .04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = .38;
  environment.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight('#f4f8eb', '#8b9982', 1.5));
  const sunlight = new THREE.DirectionalLight('#fff0cf', 3.1);
  sunlight.position.set(-3.5, 9, 6);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.left = -6;
  sunlight.shadow.camera.right = 6;
  sunlight.shadow.camera.top = 9;
  sunlight.shadow.camera.bottom = -4;
  sunlight.shadow.camera.near = .5;
  sunlight.shadow.camera.far = 24;
  sunlight.shadow.normalBias = .025;
  sunlight.shadow.bias = -.00015;
  sunlight.shadow.radius = 3;
  sunlight.target.position.set(0, 3, 0);
  scene.add(sunlight, sunlight.target);
  const rim = new THREE.DirectionalLight('#d5f2ed', 1.8);
  rim.position.set(4, 6, -5);
  scene.add(rim);

  const groundMaterial = new THREE.MeshStandardMaterial({ color: '#d5d9c5', roughness: 1 });
  const ground = mesh(new THREE.PlaneGeometry(200, 200), groundMaterial, scene);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  const road = new THREE.Group();
  scene.add(road);
  const paving = new THREE.MeshStandardMaterial({ color: '#e4d9bd', roughness: .95 });
  const seam = new THREE.MeshStandardMaterial({ color: '#c5c3ad', roughness: 1 });
  const line = new THREE.MeshStandardMaterial({ color: '#9eae9d', roughness: 1 });
  const path = mesh(new THREE.PlaneGeometry(5.6, 200), paving, road);
  path.rotation.x = -Math.PI / 2;
  path.position.y = .012;
  path.castShadow = false;
  for (const side of [-1, 1]) {
    const edge = mesh(new THREE.PlaneGeometry(.035, 200), line, road);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(side * 2.68, .015, 0);
    edge.castShadow = false;
    const border = mesh(new THREE.PlaneGeometry(.12, 200), paving, road);
    border.rotation.x = -Math.PI / 2;
    border.position.set(side * 2.94, .012, 0);
    border.castShadow = false;
  }
  const pavingSeams = new THREE.InstancedMesh(new THREE.PlaneGeometry(5.32, .012), seam, 45);
  pavingSeams.receiveShadow = true;
  road.add(pavingSeams);
  const joint = new THREE.Object3D();
  joint.rotation.x = -Math.PI / 2;
  for (let i = -22; i <= 22; i++) {
    joint.position.set(0, .016, i * 2);
    joint.updateMatrix();
    pavingSeams.setMatrixAt(i + 22, joint.matrix);
  }

  const performer = new THREE.Group();
  performer.rotation.order = 'ZXY';
  scene.add(performer);
  const cycle = createUnicycle(performer);
  const { bird, neck, head, wings } = createPelican(performer);
  const pins = Array.from({ length: 3 }, () => createPin(scene));

  const shadowPixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const radius = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
      const at = (y * 64 + x) * 4;
      shadowPixels[at] = shadowPixels[at + 1] = shadowPixels[at + 2] = 255;
      shadowPixels[at + 3] = Math.round(255 * Math.max(0, 1 - radius) ** 3);
    }
  }
  const contactTexture = new THREE.DataTexture(shadowPixels, 64, 64);
  contactTexture.needsUpdate = true;
  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(.9, .65), new THREE.MeshBasicMaterial({ map: contactTexture, color: '#465747', transparent: true, opacity: .35, depthWrite: false }));
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = .019;
  scene.add(contactShadow);

  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motionPreference.matches;
  let time = .72;
  let lastTimestamp;
  let animationId;
  let pointer = null;
  let azimuth = .86;
  let elevation = .14;
  let targetAzimuth = azimuth;
  let targetElevation = elevation;
  let interactionTime = -10;
  let width = 1;
  let height = 1;
  let distance = 15;
  let drift = 0;
  let contextLost = false;
  const wingTarget = new THREE.Vector3();
  const inverseBirdMatrix = new THREE.Matrix4();
  const inverseBirdRotation = new THREE.Quaternion();
  const wristRotation = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const cameraTarget = new THREE.Vector3(0, 3.25, .18);

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    distance = Math.max(7.8 / (2 * Math.tan(halfFov)), 4.6 / (2 * Math.tan(halfFov) * camera.aspect));
    render();
  }

  function render() {
    if (contextLost) return;
    const ride = ridePose(time);
    pavingSeams.position.z = -mod(ride.distance, 2);
    // Compensate frame pitch so the world-space wheel and cranks roll at d/r.
    poseLegs(cycle, ride.wheelAngle - ride.pitch, ride.pitch, ride.roll);
    performer.rotation.set(ride.pitch, 0, ride.roll);
    const contactHeight = GROUND_HEIGHT + .685 * Math.cos(ride.roll) + .075;
    performer.position.set(0, -AXLE_HEIGHT, 0).applyEuler(performer.rotation);
    performer.position.y += contactHeight;
    contactShadow.position.x = WHEEL_RADIUS * Math.sin(ride.roll);
    bird.rotation.y = .018 * Math.sin(time * 2.18);
    // The pins stay ballistic in the travel frame. Inverse kinematics brings
    // the leaning bird's wings to those world-space catch/release points.
    bird.updateWorldMatrix(true, false);
    inverseBirdMatrix.copy(bird.matrixWorld).invert();
    bird.getWorldQuaternion(inverseBirdRotation).invert();
    for (const wing of wings) {
      const hand = handPose(time, wing.side);
      wingTarget.set(hand.x, hand.y, hand.z).applyMatrix4(inverseBirdMatrix);
      poseWing(wing, wingTarget);
      wristRotation.setFromAxisAngle(zAxis, hand.angle);
      wing.wrist.quaternion.copy(inverseBirdRotation).multiply(wristRotation);
    }
    neck.rotation.x = .035 * Math.sin(time * Math.PI / .72 - .45);
    neck.rotation.z = .025 * Math.sin(time * Math.PI / 1.44);
    head.rotation.y = .065 * Math.sin(time * Math.PI / 2.16);
    for (let i = 0; i < pins.length; i++) {
      const pose = pinPose(time, i);
      pins[i].position.set(pose.x, pose.y, pose.z);
      pins[i].rotation.z = pose.angle;
    }
    const angle = azimuth + drift;
    camera.position.set(
      Math.sin(angle) * Math.cos(elevation) * distance,
      Math.sin(elevation) * distance,
      Math.cos(angle) * Math.cos(elevation) * distance,
    ).add(cameraTarget);
    camera.lookAt(cameraTarget);
    renderer.render(scene, camera);
  }

  function tick(timestamp) {
    animationId = undefined;
    if (contextLost) return;
    const delta = lastTimestamp === undefined ? 0 : (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    if (!reduced) time += delta;
    const ease = 1 - Math.exp(-delta * 12);
    azimuth += (targetAzimuth - azimuth) * ease;
    elevation += (targetElevation - elevation) * ease;
    if (!reduced) {
      const targetDrift = !pointer && time - interactionTime > 5 ? .12 * Math.sin(time * .12) : 0;
      drift += (targetDrift - drift) * (1 - Math.exp(-delta * .8));
    }
    render();
    if (!document.hidden && (!reduced || Math.abs(targetAzimuth - azimuth) + Math.abs(targetElevation - elevation) > .0001)) {
      animationId = requestAnimationFrame(tick);
    }
  }

  function wake() {
    if (animationId === undefined && !document.hidden && !contextLost) {
      lastTimestamp = undefined;
      animationId = requestAnimationFrame(tick);
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (pointer) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    interactionTime = time;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    targetAzimuth -= (event.clientX - pointer.x) * .006;
    targetElevation = THREE.MathUtils.clamp(targetElevation + (event.clientY - pointer.y) * .004, -.03, .65);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    interactionTime = time;
    wake();
  });
  const release = (event) => {
    if (pointer?.id !== event.pointerId) return;
    pointer = null;
    interactionTime = time;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('keydown', (event) => {
    const directions = { ArrowLeft: [-.12, 0], ArrowRight: [.12, 0], ArrowUp: [0, .06], ArrowDown: [0, -.06] };
    if (!directions[event.key]) return;
    event.preventDefault();
    const [horizontal, vertical] = directions[event.key];
    targetAzimuth += horizontal;
    targetElevation = THREE.MathUtils.clamp(targetElevation + vertical, -.03, .65);
    interactionTime = time;
    wake();
  });
  motionPreference.addEventListener('change', (event) => {
    reduced = event.matches;
    render();
    wake();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(animationId);
      animationId = undefined;
    } else wake();
  });
  window.addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(animationId);
    animationId = undefined;
    document.querySelector('#fallback').hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', () => window.location.reload());

  resize();
  wake();
}
