import "./style.css";
import * as THREE from "three";
import { newRide, stepRide, waveHeight, BOOST_SPEED } from "./physics.js";
import {
  createWorld,
  createJetSki,
  createBuoys,
  createSpray,
  COURSE,
} from "./world.js";
import { createAudio } from "./audio.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game");
let world;
try {
  world = createWorld(canvas);
} catch (error) {
  $("loading").classList.add("hidden");
  $("error").classList.remove("hidden");
  console.error("Unable to initialize WebGL:", error);
  throw error;
}
const { renderer, scene, camera, ocean, sky, birds } = world;
const { root: ski, rider } = createJetSki();
scene.add(ski);
const buoys = createBuoys(scene);
const spray = createSpray(scene);
const audio = createAudio();
const input = {
  forward: false,
  brake: false,
  left: false,
  right: false,
  boost: false,
};
const keys = new Set();
const touches = new Set();
const coarse =
  window.matchMedia("(pointer: coarse)").matches ||
  navigator.maxTouchPoints > 0;
let ride = newRide();
let mode = "landing",
  previousMode = "landing";
let time = 8,
  lastFrame = 0,
  accumulator = 0,
  frameCount = 0;
let collected = 0,
  lap = 1,
  toastTimeout,
  calloutTimeout;
let shake = 0,
  bestEver = 0;
let cameraInitialized = false;
let previousX = ride.x,
  previousZ = ride.z;
let hudTime = 0;
let performanceTime = 0,
  performanceFrames = 0;
const cameraTarget = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();
const targetLook = new THREE.Vector3();
const lookPosition = new THREE.Vector3();
const tickElements = [...document.querySelectorAll(".speed-ticks i")];
const compassLabels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compassTrack = $("compass-track");
compassTrack.innerHTML = Array.from({ length: 4 }, () =>
  compassLabels.map((label) => `<span>${label}</span>`).join(""),
).join("");
try {
  bestEver = Number(localStorage.getItem("tideline-best")) || 0;
} catch {
  /* Storage can be disabled on embedded sites. */
}

function clearInput() {
  keys.clear();
  touches.clear();
  for (const key in input) input[key] = false;
  document
    .querySelectorAll(".pressed")
    .forEach((el) => el.classList.remove("pressed"));
}
function updateInput() {
  input.forward =
    keys.has("KeyW") || keys.has("ArrowUp") || touches.has("forward");
  input.brake =
    keys.has("KeyS") || keys.has("ArrowDown") || touches.has("brake");
  input.left = keys.has("KeyA") || keys.has("ArrowLeft") || touches.has("left");
  input.right =
    keys.has("KeyD") || keys.has("ArrowRight") || touches.has("right");
  input.boost = keys.has("Space") || touches.has("boost");
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $("toast").classList.remove("visible"), 3500);
}

function saveBest() {
  if (ride.bestJump <= bestEver) return;
  bestEver = ride.bestJump;
  try {
    localStorage.setItem("tideline-best", bestEver.toFixed(2));
  } catch {
    /* A ride still works without local storage. */
  }
}

function startRide() {
  clearInput();
  ride = newRide();
  ride.y = waveHeight(ride.x, ride.z, time) + 0.47;
  collected = 0;
  lap = 1;
  mode = "playing";
  cameraInitialized = false;
  shake = 0;
  clearTimeout(calloutTimeout);
  $("jump-callout").classList.remove("visible");
  document.body.classList.add("playing");
  for (const id of ["landing", "landing-footer", "world-tag", "modal"])
    $(id).classList.add("hidden");
  $("hud").classList.remove("hidden");
  $("pause").classList.remove("hidden");
  if (coarse) $("touch-controls").classList.remove("hidden");
  $("route-hint").textContent = "Follow the orange buoys. Or don’t.";
  toast(
    coarse
      ? "Hold GO to ride. Hit BOOST for bigger air."
      : "Hold W or ↑ to ride. The swells do the rest.",
  );
  updateHUD();
}

function openModal(help = false) {
  if (mode === "paused") {
    closeModal();
    return;
  }
  previousMode = mode;
  mode = "paused";
  clearInput();
  $("modal-title").textContent = help ? "FIND YOUR FLOW." : "STAY SALTY.";
  $("modal-description").textContent = help
    ? "A little throttle goes a long way."
    : "The ocean isn’t going anywhere.";
  $("resume").innerHTML =
    previousMode === "landing"
      ? "LET’S RIDE <span>↗</span>"
      : "BACK TO THE WATER <span>↗</span>";
  $("restart").classList.toggle("hidden", previousMode === "landing");
  $("modal").classList.remove("hidden");
  $("touch-controls").classList.add("hidden");
  $("resume").focus();
}

function closeModal() {
  if (previousMode === "landing") {
    startRide();
    return;
  }
  mode = "playing";
  $("modal").classList.add("hidden");
  if (coarse) $("touch-controls").classList.remove("hidden");
  $("pause").focus({ preventScroll: true });
}

$("start").addEventListener("click", startRide);
$("pause").addEventListener("click", () => openModal());
$("help").addEventListener("click", () => openModal(true));
$("resume").addEventListener("click", closeModal);
$("restart").addEventListener("click", () => {
  saveBest();
  startRide();
});
$("sound").addEventListener("click", () => {
  try {
    const enabled = audio.toggle();
    document.body.classList.toggle("unmuted", enabled);
    $("sound").setAttribute(
      "aria-label",
      enabled ? "Mute sound" : "Enable sound",
    );
    $("sound").title = enabled ? "Mute sound" : "Enable sound";
  } catch {
    toast("Audio is unavailable in this browser. Keep making waves.");
  }
});

const gameKeys = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
];
window.addEventListener("keydown", (event) => {
  if (event.code === "Escape") {
    event.preventDefault();
    if (event.repeat) return;
    if (mode === "paused") closeModal();
    else if (mode === "playing") openModal();
    return;
  }
  if (event.code === "KeyR" && mode === "playing" && !event.repeat) {
    saveBest();
    startRide();
    return;
  }
  if (gameKeys.includes(event.code) && mode === "playing") {
    event.preventDefault();
    keys.add(event.code);
    updateInput();
  }
  if (mode === "paused" && event.code === "Tab") {
    const buttons = [...$("modal").querySelectorAll("button:not(.hidden)")];
    const first = buttons[0],
      last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  updateInput();
});
window.addEventListener("blur", () => {
  clearInput();
  if (mode === "playing") openModal();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && mode === "playing") openModal();
});
for (const button of document.querySelectorAll("[data-control]")) {
  const control = button.dataset.control;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    touches.add(control);
    button.classList.add("pressed");
    updateInput();
  });
  function release(event) {
    event.preventDefault();
    touches.delete(control);
    button.classList.remove("pressed");
    updateInput();
  }
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("contextmenu", (event) => event.preventDefault());
}

function updateHUD() {
  $("speed").textContent = Math.round(ride.speed * 3.6);
  $("air-time").innerHTML = `${ride.totalAirTime.toFixed(1)}<span>s</span>`;
  $("best-jump").innerHTML = `${ride.bestJump.toFixed(1)}<span>m</span>`;
  $("buoy-count").innerHTML =
    `${String(collected).padStart(2, "0")}<span>/ 08</span>`;
  $("boost-fill").style.width = `${ride.boost * 100}%`;
  $("ride-state").textContent = ride.airborne
    ? "AIRBORNE"
    : ride.boosting
      ? "FULL SEND"
      : ride.speed < 3
        ? "TAKE IT EASY"
        : "CRUISING";
  const active = Math.round((ride.speed / BOOST_SPEED) * 20);
  tickElements.forEach((element, i) =>
    element.classList.toggle("active", i < active),
  );
  const target = COURSE[collected % COURSE.length];
  const distance = Math.hypot(ride.x - target[0], ride.z - target[1]);
  $("target-distance").textContent = `${Math.round(distance)} m`;
  const bearing = Math.atan2(-(target[0] - ride.x), -(target[1] - ride.z));
  const difference =
    THREE.MathUtils.euclideanModulo(
      bearing - ride.heading + Math.PI,
      Math.PI * 2,
    ) - Math.PI;
  document.querySelector(".route-symbol").style.transform =
    `rotate(${(-difference * 180) / Math.PI - 45}deg)`;
  const heading = THREE.MathUtils.euclideanModulo(-ride.heading, Math.PI * 2);
  const offset = (heading / (Math.PI * 2)) * 368;
  compassTrack.style.transform = `translateX(${$("hud").querySelector(".compass").clientWidth / 2 - 9 - 368 - offset}px)`;
}

function updateCourse() {
  const target = COURSE[collected];
  if (Math.hypot(ride.x - target[0], ride.z - target[1]) < 11) {
    collected++;
    audio.chime();
    if (collected === COURSE.length) {
      toast(`LOOP ${lap} COMPLETE. The ocean is yours. Let’s go again.`);
      lap++;
      collected = 0;
      $("route-hint").textContent = `Loop ${lap}. Find your own line.`;
    } else {
      toast(
        `BUOY ${String(collected).padStart(2, "0")} / 08 — Nice line. Keep it going.`,
      );
    }
  }
}

function step(dt) {
  time += dt;
  if (mode === "playing") {
    const events = stepRide(ride, input, time, dt);
    if (events.launched) {
      clearTimeout(calloutTimeout);
      $("jump-callout").classList.add("visible");
      $("jump-label").textContent = "LEAVE IT ALL BELOW";
    }
    if (ride.airborne) {
      $("jump-height").textContent =
        ride.jumpPeak > 3 ? "BIG AIR!" : "LIFT OFF!";
      $("jump-detail").textContent =
        `${ride.airTime.toFixed(1)} SEC / ${ride.jumpPeak.toFixed(1)} M HIGH`;
    }
    if (events.landed) {
      shake = Math.min(0.65, 0.12 + ride.jumpPeak * 0.06);
      spray.emit(ride, 150, true);
      audio.splash();
      $("jump-label").textContent =
        ride.jumpPeak >= bestEver && ride.jumpPeak > 1
          ? "PERSONAL BEST"
          : "BACK TO THE BLUE";
      $("jump-height").textContent =
        ride.jumpPeak > 4 ? "FULL SEND!" : "STUCK IT!";
      $("jump-detail").textContent =
        `${ride.airTime.toFixed(1)} SEC / ${ride.jumpPeak.toFixed(1)} M HIGH`;
      calloutTimeout = setTimeout(
        () => $("jump-callout").classList.remove("visible"),
        1600,
      );
      saveBest();
    }
    updateCourse();
  } else if (mode === "landing") {
    ride.heading = -0.15;
    ride.speed = 5;
    ride.z -= dt * 3.3;
    ride.x += dt * 0.5;
    ride.y = waveHeight(ride.x, ride.z, time) + 0.47;
    const front = waveHeight(ride.x, ride.z - 1.5, time),
      back = waveHeight(ride.x, ride.z + 1.5, time);
    ride.pitch += (Math.atan((front - back) / 3) - ride.pitch) * dt * 4;
    ride.roll = Math.sin(time * 0.8) * 0.035;
  }
}

function animate(timestamp) {
  requestAnimationFrame(animate);
  const dt = Math.min((timestamp - lastFrame) / 1000 || 1 / 60, 0.1);
  lastFrame = timestamp;
  if (mode !== "paused") {
    accumulator += dt;
    while (accumulator >= 1 / 90) {
      step(1 / 90);
      accumulator -= 1 / 90;
    }
    spray.update(ride, time, dt, true);
  }
  ski.position.set(ride.x, ride.y, ride.z);
  ski.rotation.set(0, ride.heading, 0);
  ski.rotateX(ride.pitch);
  ski.rotateZ(ride.roll);
  rider.rotation.z = ride.steering * 0.08;
  rider.position.y = ride.airborne
    ? Math.sin(time * 4) * 0.025
    : Math.sin(time * 14) * ride.speed * 0.0007;
  ocean.material.uniforms.time.value = time;
  ocean.material.uniforms.center.value.set(
    Math.round(ride.x / 2) * 2,
    Math.round(ride.z / 2) * 2,
  );
  for (const buoy of buoys) {
    const [x, z] = COURSE[buoy.index];
    buoy.group.position.y = waveHeight(x, z, time);
    buoy.group.rotation.z = Math.sin(time * 1.4 + buoy.index) * 0.07;
    buoy.group.rotation.x = Math.cos(time + buoy.index) * 0.06;
    buoy.flag.rotation.y = Math.sin(time * 3 + buoy.index) * 0.3;
    buoy.ring.visible = mode !== "landing" && buoy.index === collected;
    buoy.ring.material.opacity = 0.45 + Math.sin(time * 3) * 0.2;
    buoy.ring.scale.setScalar(1 + Math.sin(time * 2) * 0.04);
  }
  const sin = Math.sin(ride.heading),
    cos = Math.cos(ride.heading);
  if (mode === "landing" || (mode === "paused" && previousMode === "landing")) {
    cameraTarget.set(ride.x + 10.5, ride.y + 5.6, ride.z + 12.5);
    targetLook.set(
      ride.x - 5.6,
      ride.y + (camera.aspect < 0.8 ? 3.6 : 0.5),
      ride.z - 4.5,
    );
  } else {
    const distance = 10.5 + ride.speed * 0.035;
    const cameraY = Math.max(
      waveHeight(ride.x + sin * distance, ride.z + cos * distance, time) + 2.6,
      ride.y + 4.4,
    );
    cameraTarget.set(ride.x + sin * distance, cameraY, ride.z + cos * distance);
    targetLook.set(ride.x - sin * 5, ride.y + 1.1, ride.z - cos * 5);
  }
  if (!cameraInitialized) {
    cameraPosition.copy(cameraTarget);
    lookPosition.copy(targetLook);
    cameraInitialized = true;
  } else {
    cameraPosition.x += ride.x - previousX;
    cameraPosition.z += ride.z - previousZ;
    lookPosition.x += ride.x - previousX;
    lookPosition.z += ride.z - previousZ;
  }
  previousX = ride.x;
  previousZ = ride.z;
  const cameraLerp = 1 - Math.exp(-dt * 4.3);
  cameraPosition.lerp(cameraTarget, cameraLerp);
  lookPosition.lerp(targetLook, 1 - Math.exp(-dt * 6));
  // Keep the chase camera clear of passing wave crests, even just after landing.
  cameraPosition.y = Math.max(
    cameraPosition.y,
    waveHeight(cameraPosition.x, cameraPosition.z, time) + 1.8,
  );
  camera.position.copy(cameraPosition);
  if (mode === "playing") {
    shake *= Math.exp(-dt * 5);
    const vibration = ride.boosting ? 0.035 : 0;
    camera.position.y += Math.sin(time * 80) * (shake + vibration);
    camera.position.x += Math.sin(time * 67) * shake * 0.4;
  }
  camera.lookAt(lookPosition);
  const fov =
    53 + (mode === "playing" ? ride.speed * 0.12 + (ride.boosting ? 4 : 0) : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 2);
  camera.updateProjectionMatrix();
  sky.position.copy(camera.position);
  birds.position.set(ride.x * 0.8, 0, ride.z * 0.8);
  for (let i = 0; i < birds.children.length; i++) {
    const bird = birds.children[i];
    bird.position.y = 26 + Math.sin(time * 0.7 + i * 3) * 4 + i * 0.5;
    for (let j = 0; j < bird.children.length; j++)
      bird.children[j].rotation.z =
        (j ? 1 : -1) * (0.2 + Math.sin(time * 3 + i) * 0.18);
  }
  audio.update(ride, mode === "playing");
  hudTime += dt;
  if (hudTime > 0.08) {
    if (mode === "playing") updateHUD();
    hudTime = 0;
  }
  renderer.render(scene, camera);
  frameCount++;
  if (frameCount === 3) {
    $("loading").style.opacity = 0;
    setTimeout(() => $("loading").classList.add("hidden"), 550);
  }
  performanceTime += dt;
  performanceFrames++;
  if (
    performanceTime > 3 &&
    performanceFrames < 100 &&
    renderer.getPixelRatio() > 0.75
  ) {
    renderer.setPixelRatio(Math.max(0.75, renderer.getPixelRatio() * 0.8));
    renderer.setSize(window.innerWidth, window.innerHeight);
    performanceTime = 0;
    performanceFrames = 0;
  } else if (performanceTime > 3) {
    performanceTime = 0;
    performanceFrames = 0;
  }
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
requestAnimationFrame(animate);

// A read-only snapshot makes browser smoke tests useful without affecting the simulation.
window.__tideline = {
  get state() {
    return { mode, time, ...ride, collected, lap, frameCount };
  },
  get rendererInfo() {
    return renderer.info.render;
  },
};
