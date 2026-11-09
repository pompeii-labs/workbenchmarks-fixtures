import * as THREE from 'three';
import type { App } from './app';
import { PIN_GRIP, WHEEL_R } from './motion';


  /** World-space speed of the tyre's material point at the ground contact vs the act's speed. */
export function slipAt(app: App, t: number, h = 1 / 240) {
    app.applyTime(t);
    const M0 = app.uni.wheel.matrixWorld.clone();
    const a0 = app.act.position.clone();
    app.applyTime(t + h);
    const M1 = app.uni.wheel.matrixWorld.clone();
    const a1 = app.act.position.clone();
    // Lowest tyre point now, as a wheel-local material point.
    const local = a1.clone().applyMatrix4(M1.clone().invert());
    const rr = Math.hypot(local.y, local.z);
    local.y *= WHEEL_R / rr;
    local.z *= WHEEL_R / rr;
    const p1 = local.clone().applyMatrix4(M1);
    const p0 = local.clone().applyMatrix4(M0);
    app.applyTime(app.t);
    return {
      contactSpeed: p1.distanceTo(p0) / h,
      travelSpeed: a1.distanceTo(a0) / h,
      contactHeight: p1.y,
    };
  }

  /** Read the posed scene graph at time t (act space). */
export function measureAt(app: App, t: number) {
    app.applyTime(t);
    const toAct = (v: THREE.Vector3) => v.applyMatrix4(app.actInv);
    const pins = app.pins.map((m, i) => {
      const com = toAct(m.getWorldPosition(new THREE.Vector3()));
      const neck = toAct(m.localToWorld(new THREE.Vector3(0, PIN_GRIP, 0)));
      const top = toAct(m.localToWorld(new THREE.Vector3(0, 0.188, 0)));
      const base = toAct(m.localToWorld(new THREE.Vector3(0, -0.112, 0)));
      return {
        com: com.toArray(),
        neck: neck.toArray(),
        minY: Math.min(top.y, base.y),
        inHand: app.pose.pins[i].inHand,
        phi: app.pose.pins[i].phi,
      };
    });
    // How deep any pin sample point gets inside a conservative torso ellipsoid (<= 0 means clear).
    const torsoInv = app.pelican.torso.matrixWorld.clone().invert();
    let torsoPenetration = -1;
    for (const m of app.pins) {
      for (let k = 0; k <= 10; k++) {
        const y = -0.112 + (k / 10) * 0.3;
        const p = m.localToWorld(new THREE.Vector3(0, y, 0)).applyMatrix4(torsoInv);
        // Torso radii in its local frame: x 0.19*1.02, y 0.31, z 0.235*0.98 + chest; pin radius ~0.05.
        const e = Math.hypot(p.x / 0.25, p.y / 0.36, p.z / (p.z > 0 ? 0.3 : 0.25));
        torsoPenetration = Math.max(torsoPenetration, 1 - e);
      }
    }
    const wrists = app.pelican.wristPoints().map((p) => toAct(p).toArray());
    const feet = app.pelican.footBallPoints().map((p) => toAct(p).toArray());
    const pedals = app.pedalTops.map((p) => p.toArray());
    const out = {
      t,
      pins,
      wrists,
      feet,
      pedals,
      wheelAngle: app.pose.wheelAngle,
      distance: app.pose.distance,
      pitch: app.pose.pitch,
      torsoPenetration,
      footError: app.pelican.probe.footError,
      wristError: app.pelican.probe.wristError,
    };
    app.applyTime(app.t);
    return out;
  }
