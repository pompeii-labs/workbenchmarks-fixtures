// Motion coherence, measured from the posed scene graph (not from the formulas):
// rolling without slip, feet on pedals, pins gripped at the wrists, ballistic
// flight, continuity at every throw and catch, and a seamless repeating pattern.
export const name = 'motion';

export default async function ({ check, state, until, hooks, metric }) {
    const before = await state((d) => d.t);
    await until((t0) => window.__THREE_GAME_DIAGNOSTICS__.t > t0 + 1, 20000, before);
    const after = await state((d) => d.t);
    check('the act clock advances on its own', after > before + 1, `${before} -> ${after}`);

    const r = await hooks((h) => {
        const d = h.diagnostics();
        const { PIN_CYCLE, G } = d.constants;
        const out = { slip: 0, travelMin: 1e9, footErr: 0, footGap: 0, wristErr: 0, grip: 0, minPinY: 1e9,
            accelErr: 0, accelSamples: 0, jump: 0, seam: 0, pitchMin: 1e9, pitchMax: -1e9, inHandMin: 9, inHandMax: 0,
            pen: -1 };
        const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        // Rolling: sample 200 instants over 100 s.
        for (let i = 0; i < 200; i++) {
            const s = h.slipAt(3 + i * 0.5);
            out.slip = Math.max(out.slip, s.contactSpeed / s.travelSpeed);
            out.travelMin = Math.min(out.travelMin, s.travelSpeed);
        }
        // Dense sampling over two full pin cycles at 240 Hz for continuity, plus wide sampling.
        const dt = 1 / 240;
        let prev = null;
        const t0 = 40;
        for (let k = 0; k <= Math.ceil((2 * PIN_CYCLE) / dt); k++) {
            const m = h.measureAt(t0 + k * dt);
            out.footErr = Math.max(out.footErr, m.footError);
            out.pen = Math.max(out.pen, m.torsoPenetration);
            out.wristErr = Math.max(out.wristErr, m.wristError);
            for (let f = 0; f < 2; f++) out.footGap = Math.max(out.footGap, dist(m.feet[f], m.pedals[f]));
            let held = 0;
            m.pins.forEach((p, i) => {
                out.minPinY = Math.min(out.minPinY, p.minY);
                if (p.inHand) {
                    held++;
                    const w = m.wrists[p.inHand === -1 ? 0 : 1];
                    out.grip = Math.max(out.grip, dist(p.neck, w));
                }
                if (prev) out.jump = Math.max(out.jump, dist(p.com, prev.pins[i].com));
            });
            out.inHandMin = Math.min(out.inHandMin, held);
            out.inHandMax = Math.max(out.inHandMax, held);
            out.pitchMin = Math.min(out.pitchMin, m.pitch);
            out.pitchMax = Math.max(out.pitchMax, m.pitch);
            prev = m;
        }
        // Ballistic flight: second difference of the pin centre in the air.
        for (let i = 0; i < 300; i++) {
            const t = 10 + i * 0.137;
            const h2 = 0.004;
            const a = h.measureAt(t - h2), b = h.measureAt(t), c = h.measureAt(t + h2);
            b.pins.forEach((p, j) => {
                if (p.inHand || a.pins[j].inHand || c.pins[j].inHand) return;
                const ay = (a.pins[j].com[1] - 2 * p.com[1] + c.pins[j].com[1]) / (h2 * h2);
                out.accelErr = Math.max(out.accelErr, Math.abs(ay + G));
                out.accelSamples++;
            });
        }
        // Seam: the pattern relative to the bird repeats exactly every pin cycle, forever.
        for (const t of [5, 123.4, 3600.7]) {
            const a = h.measureAt(t), b = h.measureAt(t + PIN_CYCLE * 1000);
            a.pins.forEach((p, j) => (out.seam = Math.max(out.seam, dist(p.com, b.pins[j].com))));
        }
        return out;
    });
    for (const [k, v] of Object.entries(r)) metric(k, v);

    check('wheel rolls without slipping (contact point speed < 2% of travel speed)', r.slip < 0.02, `ratio ${r.slip}`);
    check('the unicycle never stops (min travel speed > 0.25 m/s)', r.travelMin > 0.25, `${r.travelMin}`);
    check('leg IK always reaches the pedals', r.footErr < 1e-3, `${r.footErr} m`);
    check('ball of each webbed foot sits on its pedal (< 2 mm)', r.footGap < 0.002, `${r.footGap} m`);
    check('wing IK always reaches the grip point', r.wristErr < 1e-3, `${r.wristErr} m`);
    check('held pins stay in the wing tip (neck within 2 mm of wrist)', r.grip < 0.002, `${r.grip} m`);
    check('no pin ever drops (lowest pin point stays above 0.45 m)', r.minPinY > 0.45, `${r.minPinY} m`);
    check('pins in flight accelerate at g (within 0.05 m/s^2)', r.accelSamples > 50 && r.accelErr < 0.05, `${r.accelErr} over ${r.accelSamples}`);
    check('no pin teleports at throws or catches (< 1.5 cm per 1/240 s)', r.jump < 0.015, `${r.jump} m`);
    check('pattern repeats with no seam, even an hour in (< 1 mm)', r.seam < 1e-3, `${r.seam} m`);
    check('always 1 or 2 pins held, never all 3 or none', r.inHandMin >= 1 && r.inHandMax <= 2, `${r.inHandMin}..${r.inHandMax}`);
    check('pins never pass through the body (conservative ellipsoid test)', r.pen <= 0, `penetration ${r.pen}`);
    check('balance is never still (fore-aft lean spans > 3 degrees)', (r.pitchMax - r.pitchMin) * 57.3 > 3, `${r.pitchMin}..${r.pitchMax}`);
}
