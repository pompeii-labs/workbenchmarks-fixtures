import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { RAMPS } from "../src/course.js";
import {
  newRide, stepRide, waveHeight, GRAVITY, rampSurfaceHeight, RAMP_APRON_LENGTH,
} from "../src/physics.js";
import { createRamps } from "../src/ramps.js";

function position(ride, ramp, along, across = 0) {
  ride.x = ramp.x - Math.sin(ramp.heading) * along + Math.cos(ramp.heading) * across;
  ride.z = ramp.z - Math.cos(ramp.heading) * along - Math.sin(ramp.heading) * across;
}

function along(ride, ramp) {
  return -(ride.x - ramp.x) * Math.sin(ramp.heading) -
    (ride.z - ramp.z) * Math.cos(ramp.heading);
}

function deckHeight(ride, ramp, time) {
  return rampSurfaceHeight(ramp, ride.x, ride.z, time) + 0.47;
}

function approach(ramp = RAMPS[0], speed = 26, across = 0, time = 8) {
  const ride = newRide();
  position(ride, ramp, -ramp.length / 2 - RAMP_APRON_LENGTH - 1, across);
  ride.heading = ramp.heading;
  ride.speed = speed;
  ride.y = waveHeight(ride.x, ride.z, time) + 0.47;
  // Keep unrelated swell launches out of the ramp-specific assertions.
  ride.launchCooldown = 100;
  return ride;
}

function clock(ride, controls = { forward: true }, rate = 90, start = 8) {
  let time = start;
  return () => {
    time += 1 / rate;
    return { ...stepRide(ride, controls, time, 1 / rate), time };
  };
}

function extremePhases(ramp) {
  const point = {};
  position(point, ramp, -ramp.length / 2 - RAMP_APRON_LENGTH / 2);
  let min = { gap: Infinity }, max = { gap: -Infinity };
  for (let time = 0; time <= 60; time += 0.125) {
    const gap = waveHeight(point.x, point.z, time) - waveHeight(ramp.x, ramp.z, time);
    if (gap < min.gap) min = { gap, time };
    if (gap > max.gap) max = { gap, time };
  }
  assert.ok(min.gap < -3 && max.gap > 3, "exercise both signs of large wave mismatch");
  return [min.time, max.time];
}

function takeoff(ramp, boost = false, rate = 90) {
  const ride = approach(ramp, boost ? 39 : 26);
  const tick = clock(ride, { forward: true, boost }, rate);
  let contacted = false;
  for (let i = 0; i < rate * 3; i++) {
    const oldY = ride.y;
    const event = tick();
    if (ride.rampContact) {
      contacted = true;
      assert.equal(event.launched, false, "no entry or mid-deck launch");
      assert.equal(ride.airborne, false);
      assert.ok(Math.abs(ride.y - oldY) < 35 / rate, "continuous deck ascent");
      assert.ok(Math.abs(ride.y - deckHeight(ride, ramp, event.time)) < 1e-9,
        "hull clearance matches the visible surface throughout apron and deck");
      ride.launchCooldown = 0;
    }
    if (event.launched) {
      assert.ok(contacted, "must ride the deck before launching");
      assert.ok(along(ride, ramp) >= ramp.length / 2, "takeoff at the lip");
      assert.ok(along(ride, ramp) < ramp.length / 2 + ride.speed / rate + 1e-6);
      assert.equal(ride.rampContact, null);
      return { ride, tick, time: event.time };
    }
  }
  assert.fail("expected a ramp takeoff");
}

test("normal and boosted lip launches produce speed-dependent big air on both headings", () => {
  for (const ramp of RAMPS) {
    const normal = takeoff(ramp);
    const boosted = takeoff(ramp, true);
    assert.ok(normal.ride.verticalSpeed > 13);
    assert.ok(boosted.ride.verticalSpeed > normal.ride.verticalSpeed + 5);
    for (const flight of [normal, boosted]) {
      let landed = false;
      for (let i = 0; i < 90 * 7; i++) {
        const event = flight.tick();
        if (event.landed) {
          assert.equal(event.landedOnRamp, false);
          landed = true;
          break;
        }
      }
      assert.ok(landed, "gravity returns the craft to the water");
      assert.ok(flight.ride.totalAirTime > 1.5);
    }
    assert.ok(normal.ride.bestJump > 6);
    assert.ok(boosted.ride.bestJump > normal.ride.bestJump + 6);
  }
});

test("rear entry requires the ramp width and a forward approach, not side or reverse", () => {
  for (const ramp of RAMPS) {
    for (const kind of ["outside", "side", "reverse", "oblique"]) {
      const ride = approach(ramp, 24, kind === "outside" ? ramp.width / 2 + 0.1 : 0);
      if (kind === "reverse") {
        position(ride, ramp, ramp.length / 2 + 1);
        ride.heading += Math.PI;
      } else if (kind === "side") {
        position(ride, ramp, 0, -ramp.width / 2 - 1);
        ride.heading -= Math.PI / 2;
      } else if (kind === "oblique") {
        ride.heading += Math.PI * 0.4;
      }
      ride.y = waveHeight(ride.x, ride.z, 8) + 0.47;
      const tick = clock(ride);
      for (let i = 0; i < 180; i++) {
        assert.equal(tick().launched, false, kind);
        assert.equal(ride.rampContact, null, kind);
      }
    }
  }
});

test("slow craft can ride the deck but do not get a lip jump impulse", () => {
  const ramp = RAMPS[0];
  const ride = approach(ramp, 6);
  const tick = clock(ride, {});
  for (let i = 0; i < 90; i++) tick();
  assert.equal(ride.rampContact, ramp);
  position(ride, ramp, ramp.length / 2 - 0.02);
  ride.y = deckHeight(ride, ramp, 9);
  ride.speed = 6;
  tick();
  assert.equal(ride.rampContact, null);
  assert.equal(ride.airborne, true, "falls off rather than snapping to water");
  assert.ok(ride.verticalSpeed < 5, "no big-air impulse below minimum speed");
});

test("side exits preserve height and fall without a lip impulse or snapping down", () => {
  const ramp = RAMPS[0];
  for (const side of [-1, 1]) {
    const ride = approach(ramp);
    ride.rampContact = ramp;
    position(ride, ramp, 1, side * (ramp.width / 2 - 0.02));
    ride.heading = ramp.heading - side * Math.PI / 2;
    ride.speed = 20;
    ride.y = deckHeight(ride, ramp, 8);
    const oldY = ride.y;
    const tick = clock(ride, {});
    tick();
    const baseVelocity = (waveHeight(ramp.x, ramp.z, 8 + 1 / 90) -
      waveHeight(ramp.x, ramp.z, 8)) * 90;
    assert.equal(ride.rampContact, null);
    assert.equal(ride.airborne, true);
    assert.ok(Math.abs(ride.y - oldY - baseVelocity / 90) < 0.01);
    const fraction = 0.02 / (ride.speed / 90);
    const edgeTime = 8 + fraction / 90;
    const edgeVelocity = (waveHeight(ramp.x, ramp.z, edgeTime + 0.001) -
      waveHeight(ramp.x, ramp.z, edgeTime - 0.001)) / 0.002;
    assert.ok(Math.abs(ride.verticalSpeed - edgeVelocity + GRAVITY * (1 - fraction) / 90) < 1e-6,
      "inherits floating platform motion, not a side-trigger jump impulse");
    assert.ok(ride.y > waveHeight(ride.x, ride.z, 8) + 1);
    const oldVelocity = ride.verticalSpeed;
    tick();
    assert.ok(Math.abs(ride.verticalSpeed - oldVelocity + GRAVITY / 90) < 1e-9);
  }
});

test("a diagonal side crossing wins over a later lip crossing in the same step", () => {
  const ramp = RAMPS[0];
  const ride = approach(ramp, 30);
  ride.rampContact = ramp;
  position(ride, ramp, ramp.length / 2 - 0.4, ramp.width / 2 - 0.03);
  ride.heading -= Math.PI / 4;
  ride.y = deckHeight(ride, ramp, 8);
  clock(ride, {}, 30)();
  assert.equal(ride.airborne, true);
  assert.equal(ride.rampContact, null);
  const baseVelocity = (waveHeight(ramp.x, ramp.z, 8 + 1 / 30) -
    waveHeight(ramp.x, ramp.z, 8)) * 30;
  const naturalVelocity = baseVelocity + ride.speed * ramp.height / ramp.length * Math.SQRT1_2;
  assert.ok(ride.verticalSpeed < naturalVelocity,
    "side edge must not award the lip impulse");
});

test("airborne craft land on the floating deck from above, then can launch again", () => {
  for (const ramp of RAMPS) {
    const ride = approach(ramp);
    position(ride, ramp, 0);
    ride.speed = 0;
    ride.airborne = true;
    ride.y = deckHeight(ride, ramp, 8) + 0.02;
    ride.verticalSpeed = -8;
    const tick = clock(ride);
    const landing = tick();
    assert.equal(landing.landed, true);
    assert.equal(landing.landedOnRamp, true);
    assert.equal(ride.airborne, false);
    assert.equal(ride.rampContact, ramp);
    assert.ok(Math.abs(ride.y - deckHeight(ride, ramp, landing.time)) < 1e-9);
    ride.speed = 26;
    let launched = false;
    for (let i = 0; i < 90; i++) {
      if (tick().launched) {
        launched = true;
        break;
      }
    }
    assert.ok(launched, "deck landing cooldown must not block a subsequent lip launch");
    assert.ok(ride.verticalSpeed > 13);
  }
});

test("airborne craft below the deck are never pulled up onto it", () => {
  const ramp = RAMPS[0];
  for (const verticalSpeed of [-1, 8]) {
    const ride = approach(ramp);
    position(ride, ramp, ramp.length / 2 - 1);
    ride.speed = 0;
    ride.airborne = true;
    ride.y = deckHeight(ride, ramp, 8) - 0.4;
    ride.verticalSpeed = verticalSpeed;
    const oldY = ride.y;
    const event = clock(ride, {})();
    assert.equal(event.landed, false);
    assert.equal(event.landedOnRamp, false);
    assert.equal(ride.rampContact, null);
    assert.equal(ride.airborne, true);
    assert.ok(Math.abs(ride.y - oldY) < 0.1);
  }
});

test("a splashdown clears contact and the same ride can approach and jump again", () => {
  const ramp = RAMPS[0];
  const { ride, tick } = takeoff(ramp);
  let landing;
  for (let i = 0; i < 90 * 7; i++) {
    const event = tick();
    if (event.landed) {
      landing = event;
      break;
    }
  }
  assert.ok(landing);
  assert.equal(landing.landedOnRamp, false);
  assert.equal(ride.rampContact, null);
  const totalAirTime = ride.totalAirTime;
  position(ride, ramp, -ramp.length / 2 - RAMP_APRON_LENGTH - 1);
  ride.heading = ramp.heading;
  ride.speed = 26;
  ride.y = waveHeight(ride.x, ride.z, landing.time) + 0.47;
  ride.launchCooldown = 100;
  const repeat = clock(ride, { forward: true }, 90, landing.time);
  let contacted = false, launched = false;
  for (let i = 0; i < 180; i++) {
    const event = repeat();
    contacted ||= ride.rampContact === ramp;
    if (event.launched) {
      launched = true;
      break;
    }
  }
  assert.ok(contacted);
  assert.ok(launched);
  assert.ok(ride.verticalSpeed > 13);
  assert.ok(ride.totalAirTime >= totalAirTime);
  assert.ok(ride.airTime < 1 / 90);
});

test("turning back off the rear does not award a ramp launch impulse", () => {
  const ramp = RAMPS[0];
  const ride = approach(ramp, 20);
  ride.rampContact = ramp;
  position(ride, ramp, -ramp.length / 2 - RAMP_APRON_LENGTH + 0.02);
  ride.heading = ramp.heading + Math.PI;
  ride.y = deckHeight(ride, ramp, 8);
  clock(ride, {})();
  const dx = -Math.sin(ride.heading), dz = -Math.cos(ride.heading);
  const edge = {};
  position(edge, ramp, -ramp.length / 2 - RAMP_APRON_LENGTH);
  const remaining = 1 / 90 - 0.02 / ride.speed;
  const edgeTime = 8 + 1 / 90 - remaining;
  const naturalVelocity = (waveHeight(edge.x + dx * ride.speed * 0.001,
    edge.z + dz * ride.speed * 0.001, edgeTime + 0.001) -
    waveHeight(edge.x - dx * ride.speed * 0.001,
      edge.z - dz * ride.speed * 0.001, edgeTime - 0.001)) / 0.002 - GRAVITY * remaining;
  assert.equal(ride.rampContact, null);
  assert.equal(ride.airborne, true);
  assert.ok(Math.abs(ride.verticalSpeed - naturalVelocity) < 0.01);
});

test("lip takeoff is consistent at 30, 90, and 180 Hz", () => {
  const flights = [30, 90, 180].map((rate) => takeoff(RAMPS[0], true, rate));
  for (const flight of flights) {
    assert.ok(Math.abs(flight.time - flights[1].time) < 0.04);
    assert.ok(Math.abs(flight.ride.verticalSpeed - flights[1].ride.verticalSpeed) < 0.5);
    assert.ok(Math.abs(flight.ride.launchY - flights[1].ride.launchY) < 0.1);
  }
});

test("the shared apron surface meets local water and the unchanged rigid deck at extreme phases", () => {
  assert.equal(RAMP_APRON_LENGTH, 6);
  for (const ramp of RAMPS) {
    const rear = -ramp.length / 2;
    for (const time of [0, 8, ...extremePhases(ramp)]) {
      for (const across of [-ramp.width / 2, 0, ramp.width / 2]) {
        for (let i = 0; i <= 24; i++) {
          const progress = i / 24;
          const point = {};
          position(point, ramp, rear - RAMP_APRON_LENGTH * (1 - progress), across);
          const blend = progress ** 2 * (3 - 2 * progress);
          const expected = waveHeight(point.x, point.z, time) * (1 - blend) +
            waveHeight(ramp.x, ramp.z, time) * blend;
          assert.ok(Math.abs(rampSurfaceHeight(ramp, point.x, point.z, time) - expected) < 1e-9);
        }
        const point = {};
        for (const distance of [0, 0.25, 1, 2, 3.99, 4.01, ramp.length]) {
          position(point, ramp, rear + distance, across);
          const expected = waveHeight(ramp.x, ramp.z, time) + distance / ramp.length * ramp.height;
          assert.ok(Math.abs(rampSurfaceHeight(ramp, point.x, point.z, time) - expected) < 1e-9,
            "no hidden offset anywhere on the original rigid deck");
        }
      }
    }
  }
});

test("rear entry stays continuous on a changing sea and follows the visible apron", () => {
  for (const ramp of RAMPS) {
    for (const time of extremePhases(ramp)) {
      for (const speed of [26, 39]) {
        const ride = approach(ramp, speed, ramp.width * 0.35, time);
        const tick = clock(ride, { forward: true, boost: speed > 26 }, 180, time);
        let contacted = false;
        for (let i = 0; i < 180; i++) {
          const previousY = ride.y;
          const event = tick();
          assert.equal(event.launched, false);
          assert.equal(event.landed, false);
          assert.equal(event.landedOnRamp, false);
          assert.ok(Math.abs(ride.y - previousY) < 70 / 180, "no entry height discontinuity");
          if (ride.rampContact) {
            assert.ok(Math.abs(ride.y - deckHeight(ride, ramp, event.time)) < 1e-9);
            if (!contacted)
              assert.ok(Math.abs(ride.y - waveHeight(ride.x, ride.z, event.time) - 0.47) < 0.025);
            contacted = true;
            ride.launchCooldown = 0;
          }
          if (along(ride, ramp) > -ramp.length / 2 + 0.5) break;
        }
        assert.ok(contacted);
        assert.ok(!Object.hasOwn(ride, "rampEntryOffset"));
      }
    }
  }
});

test("updated apron vertices and grounded hulls align with the rendered surface, including extreme waves", () => {
  const ramps = createRamps(new THREE.Scene());
  const ray = new THREE.Raycaster();
  ray.ray.direction.set(0, -1, 0);
  for (const { group, ramp, update } of ramps) {
    const apron = group.getObjectByName("ramp-apron");
    assert.ok(apron);
    for (const time of [0, 8, ...extremePhases(ramp)]) {
      update(time);
      group.updateMatrixWorld(true);
      const vertices = apron.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(vertices, i);
        apron.localToWorld(point);
        assert.ok(Math.abs(point.y - rampSurfaceHeight(ramp, point.x, point.z, time)) < 1e-6);
      }
      const rear = -ramp.length / 2;
      for (const across of [-ramp.width / 2 + 0.13, 0, ramp.width / 2 - 0.17]) {
        for (const distance of [-5.97, -5.3, -4.56, -3, -1.26, -0.03, 0.01, 0.5, 2, 3.99]) {
          const ride = newRide();
          position(ride, ramp, rear + distance, across);
          ride.rampContact = ramp;
          ride.y = deckHeight(ride, ramp, time - 1 / 90);
          const event = stepRide(ride, {}, time, 1 / 90);
          assert.equal(event.landed, false);
          assert.equal(event.landedOnRamp, false);
          assert.ok(Math.abs(ride.y - deckHeight(ride, ramp, time)) < 1e-9);
          ray.ray.origin.set(ride.x, 100, ride.z);
          const mesh = distance < 0 ? apron : group.children[1].children[0];
          const [hit] = ray.intersectObject(mesh);
          assert.ok(hit, "collision footprint is rendered");
          // The 25 cm apron tessellation approximates the analytic surface to millimeters.
          assert.ok(Math.abs(hit.point.y - (ride.y - 0.47)) < 0.004);
          assert.ok(ride.y - hit.point.y > 0.466, "grounded hull never clips through the deck");
        }
      }
    }
  }
});

test("apron bounds support downward landings and side falls, not side-entry capture", () => {
  for (const ramp of RAMPS) {
    const apronAlong = -ramp.length / 2 - RAMP_APRON_LENGTH / 2;
    const ride = approach(ramp, 0);
    position(ride, ramp, apronAlong);
    ride.airborne = true;
    ride.verticalSpeed = -8;
    ride.y = deckHeight(ride, ramp, 8) + 0.02;
    const tick = clock(ride, {});
    const event = tick();
    assert.equal(event.landed, true);
    assert.equal(event.landedOnRamp, true);
    assert.equal(ride.rampContact, ramp);
    position(ride, ramp, apronAlong, ramp.width / 2 - 0.02);
    ride.heading = ramp.heading - Math.PI / 2;
    ride.speed = 20;
    ride.y = deckHeight(ride, ramp, event.time);
    const oldY = ride.y;
    tick();
    assert.equal(ride.rampContact, null);
    assert.equal(ride.airborne, true);
    assert.ok(Math.abs(ride.y - oldY) < 0.2, "apron side exit does not snap to water");

    const sideEntry = approach(ramp, 20);
    position(sideEntry, ramp, apronAlong, -ramp.width / 2 - 1);
    sideEntry.heading = ramp.heading - Math.PI / 2;
    const sideTick = clock(sideEntry);
    for (let i = 0; i < 60; i++) {
      assert.equal(sideTick().launched, false);
      assert.equal(sideEntry.rampContact, null);
    }
  }
});

test("ramp renderer creates floating, correctly oriented decorated wedges without a DOM", () => {
  const scene = new THREE.Scene();
  const ramps = createRamps(scene);
  assert.equal(ramps.length, RAMPS.length);
  for (const { group, ramp, update } of ramps) {
    assert.equal(group.parent, scene);
    assert.equal(group.position.x, ramp.x);
    assert.equal(group.position.z, ramp.z);
    assert.equal(group.position.y, waveHeight(ramp.x, ramp.z, 0));
    assert.equal(group.rotation.y, ramp.heading);
    const wedge = group.children[0];
    wedge.geometry.computeBoundingBox();
    const bounds = wedge.geometry.boundingBox;
    assert.ok(Math.abs(bounds.min.x + ramp.width / 2) < 1e-6);
    assert.ok(Math.abs(bounds.max.x - ramp.width / 2) < 1e-6);
    assert.ok(Math.abs(bounds.min.z + ramp.length / 2) < 1e-6);
    assert.ok(Math.abs(bounds.max.z - ramp.length / 2) < 1e-6);
    assert.equal(bounds.max.y, ramp.height);
    const deck = group.children[1];
    const mark = deck.children.find((child) => child.geometry.type === "ShapeGeometry");
    const normal = new THREE.Vector3(0, 0, 1).applyEuler(mark.rotation);
    assert.ok(normal.y > 0.99, "chevron front faces are visible from above");
    update(12);
    assert.equal(group.position.y, waveHeight(ramp.x, ramp.z, 12));
    group.updateMatrixWorld(true);
    const lip = new THREE.Vector3(0, ramp.height, -ramp.length / 2);
    group.localToWorld(lip);
    assert.ok(Math.abs(lip.y + 0.47 - deckHeight({ x: lip.x, z: lip.z }, ramp, 12)) < 1e-9);
    const colors = new Set();
    let meshes = 0;
    group.traverse((object) => {
      if (!object.isMesh) return;
      meshes++;
      colors.add(object.material.color.getHex());
      for (const value of object.geometry.attributes.position.array)
        assert.ok(Number.isFinite(value));
    });
    assert.ok(meshes >= 15, "deck, markings, pontoons, and supports");
    assert.deepEqual(colors, new Set([0xf15b35, 0x183b42, 0xfff8dd]));
  }
});
