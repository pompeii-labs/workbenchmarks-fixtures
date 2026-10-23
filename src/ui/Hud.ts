import type { SimState } from '../sim/sim';
import { lapClock, TUNING } from '../sim/sim';
import { COURSE_LENGTH, COURSE_SAMPLES, GATES, courseAt, formatLap, nearestSample } from '../sim/course';
import { ordinal, raceClock, type RaceWorld } from '../sim/race';

export type RaceMessage = '' | 'start' | 'wrong-way' | 'missed';

/** Where the rider is relative to the course (pure: also used by diagnostics). */
export function raceGuidance(s: SimState, cursor: number): { cursor: number; message: RaceMessage; bearing: number; dist: number } {
  const g = GATES[s.race.nextGate];
  const dx = g.x - s.x;
  const dz = g.z - s.z;
  const dist = Math.hypot(dx, dz);
  const want = Math.atan2(-dx, -dz);
  const speed = Math.hypot(s.vx, s.vz);
  const travel = speed > 4 ? Math.atan2(-s.vx, -s.vz) : s.heading;
  const bearing = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
  let c = nearestSample(s.x, s.z, cursor, 40);
  if (Math.hypot(COURSE_SAMPLES[c].x - s.x, COURSE_SAMPLES[c].z - s.z) > 30) c = nearestSample(s.x, s.z);
  const sample = COURSE_SAMPLES[c];
  const off = Math.hypot(sample.x - s.x, sample.z - s.z);
  let message: RaceMessage = '';
  if (!s.race.started) message = 'start';
  else if (off < 45) {
    let ahead = sample.arc - g.arc;
    ahead = ((ahead + COURSE_LENGTH * 1.5) % COURSE_LENGTH) - COURSE_LENGTH / 2;
    const tan = courseAt(sample.arc);
    const along = s.vx * tan.tx + s.vz * tan.tz;
    if (ahead > 20 && ahead < 200) message = 'missed';
    else if (along < -6) message = 'wrong-way';
  }
  return { cursor: c, message, bearing, dist };
}

function el(sel: string): HTMLElement {
  const e = document.querySelector<HTMLElement>(sel);
  if (!e) throw new Error(`Missing HUD element ${sel}`);
  return e;
}

export class Hud {
  private readonly score = el('#score-value');
  private readonly combo = el('#combo-value');
  private readonly comboFill = el('#combo-fill');
  private readonly best = el('#best-value');
  private readonly speed = el('#speed-value');
  private readonly boostFill = el('#boost-fill');
  private readonly boostBar = el('#boost-bar');
  private readonly air = el('#air-readout');
  private readonly airValue = el('#air-value');
  private readonly popups = el('#popups');
  private readonly wipeout = el('#wipeout');
  private readonly hint = el('#hint');
  private readonly lapNum = el('#lap-num');
  private readonly gateNum = el('#gate-num');
  private readonly lapTime = el('#lap-time');
  private readonly bestLap = el('#best-lap');
  private readonly lastLap = el('#last-lap');
  private readonly raceMsg = el('#race-msg');
  private readonly arrow = el('#gate-arrow');
  private readonly arrowSvg = el('#gate-arrow svg');
  private readonly gateDist = el('#gate-dist');
  private readonly banner = el('#lap-banner');
  private readonly bannerTitle = el('#lap-banner-title');
  private readonly bannerTime = el('#lap-banner-time');
  private readonly bannerSub = el('#lap-banner-sub');
  private readonly posBox = el('#pos-box');
  private readonly posPlace = el('#pos-place');
  private readonly posOf = el('#pos-of');
  private readonly standings = el('#standings');
  private readonly countdown = el('#countdown');
  private readonly finish = el('#finish');
  private readonly finishPlace = el('#finish-place');
  private readonly finishTitle = el('#finish-title');
  private readonly finishSub = el('#finish-sub');
  private readonly finishRows = el('#finish-rows');
  private rowEls: HTMLElement[] = [];
  private finishShown = false;
  private lastStandings = '';
  private lastFinishRows = '';
  private lastCountdown = '';
  private bannerUntil = 0;
  private cursor = -1;
  private last = { score: -1, combo: -1, speed: -1, best: -1, gate: -1, lap: -1, bestLap: -2, lastLap: -2, msg: 'x', clock: '' };
  message: RaceMessage = '';
  totalLaps = 3;
  private countingDown = false;

  /** Position badge, standings, countdown and the finish screen. */
  private updateField(w: RaceWorld): void {
    this.totalLaps = w.totalLaps;
    this.countingDown = w.phase === 'countdown';
    const me = w.racers[0];
    const racing = w.phase !== 'free';
    this.posBox.classList.toggle('hidden', !racing);
    if (racing) {
      this.posPlace.textContent = ordinal(me.place);
      this.posOf.textContent = `/${w.racers.length}`;
      const order = [...w.racers].sort((a, b) => a.place - b.place);
      const key = order.map((r) => `${r.id}:${r.finished ? 'f' : Math.round((r.progress - me.progress) / 5)}`).join(',');
      if (key !== this.lastStandings) {
        this.lastStandings = key;
        while (this.rowEls.length < order.length) {
          const row = document.createElement('li');
          row.innerHTML = '<span class="p"></span><i></i><span class="n"></span><span class="g"></span>';
          this.standings.appendChild(row);
          this.rowEls.push(row);
        }
        order.forEach((r, i) => {
          const row = this.rowEls[i];
          row.classList.toggle('me', r === me);
          (row.children[0] as HTMLElement).textContent = String(r.place);
          (row.children[1] as HTMLElement).style.background = r.color;
          (row.children[2] as HTMLElement).textContent = r.name;
          const gap = r.progress - me.progress;
          (row.children[3] as HTMLElement).textContent = r === me ? '' : r.finished ? 'FIN' : `${gap >= 0 ? '+' : '−'}${Math.abs(Math.round(gap))} m`;
        });
      }
    }
    // Countdown 3-2-1-GO
    let cd = '';
    if (w.phase === 'countdown') cd = String(Math.ceil(w.countdown));
    else if (w.phase === 'racing' && raceClock(w) < 0.9) cd = 'GO!';
    if (cd !== this.lastCountdown) {
      this.lastCountdown = cd;
      this.countdown.textContent = cd;
      this.countdown.classList.toggle('hidden', !cd);
      this.countdown.classList.toggle('go', cd === 'GO!');
      // restart the pop animation per number
      this.countdown.style.animation = 'none';
      void this.countdown.offsetWidth;
      this.countdown.style.animation = '';
    }
    if (this.finishShown) this.renderFinish(w);
  }

  showFinish(w: RaceWorld): void {
    this.finishShown = true;
    this.lastFinishRows = '';
    this.finish.classList.remove('hidden');
    this.banner.classList.add('hidden');
    this.bannerUntil = 0;
    this.renderFinish(w);
  }

  hideFinish(): void {
    this.finishShown = false;
    this.finish.classList.add('hidden');
  }

  get finishVisible(): boolean {
    return this.finishShown;
  }

  private renderFinish(w: RaceWorld): void {
    const me = w.racers[0];
    const order = [...w.racers].sort((a, b) => a.place - b.place);
    const key = order.map((r) => `${r.id}:${r.finished ? r.finishTime.toFixed(2) : Math.min(r.s.race.laps + 1, w.totalLaps)}`).join(',');
    if (key === this.lastFinishRows) return;
    this.lastFinishRows = key;
    this.finishPlace.textContent = ordinal(me.place);
    this.finishPlace.classList.toggle('win', me.place === 1);
    this.finishTitle.textContent = me.place === 1 ? 'You win!' : me.place <= 3 ? 'Podium finish' : 'Race complete';
    this.finishSub.textContent = `Race ${formatLap(me.finishTime)} · Best lap ${formatLap(me.s.race.bestLap)}`;
    const leader = order[0];
    const rows = order.map((r) => {
      const li = document.createElement('li');
      if (r === me) li.className = 'me';
      const time = r.finished
        ? r === leader
          ? formatLap(r.finishTime)
          : `+${(r.finishTime - leader.finishTime).toFixed(2)}s`
        : `Lap ${Math.min(r.s.race.laps + 1, w.totalLaps)}/${w.totalLaps}`;
      li.innerHTML = `<span class="p">${ordinal(r.place)}</span><i style="background:${r.color}"></i><span class="n">${r.name}</span><span class="t${r.finished ? '' : ' live'}">${time}</span>`;
      return li;
    });
    this.finishRows.replaceChildren(...rows);
  }

  update(s: SimState, w: RaceWorld): void {
    this.updateField(w);
    if (s.score !== this.last.score) {
      this.score.textContent = s.score.toLocaleString('en-US');
      this.last.score = s.score;
    }
    if (s.combo !== this.last.combo) {
      this.combo.textContent = `x${s.combo}`;
      this.last.combo = s.combo;
    }
    this.comboFill.style.width = `${s.combo > 1 ? Math.max(0, (s.comboTimer / TUNING.comboWindow) * 100) : 0}%`;
    const kmh = Math.round(Math.hypot(s.vx, s.vz) * 3.6);
    if (kmh !== this.last.speed) {
      this.speed.textContent = String(kmh);
      this.last.speed = kmh;
    }
    if (s.bestAir !== this.last.best) {
      this.best.textContent = `${s.bestAir.toFixed(1)}s`;
      this.last.best = s.bestAir;
    }
    this.boostFill.style.transform = `scaleX(${s.boost.toFixed(3)})`;
    this.boostBar.classList.toggle('active', s.boosting);
    const showAir = s.airborne && s.airTime > 0.3 && s.mode === 'ride';
    this.air.classList.toggle('hidden', !showAir);
    if (showAir) this.airValue.textContent = s.airTime.toFixed(1);
    this.wipeout.classList.toggle('hidden', s.mode !== 'wipeout');
    if (s.jumps > 2 || s.score > 0 || s.race.started) this.hint.classList.add('hidden');
    this.updateRace(s);
  }

  private updateRace(s: SimState): void {
    const r = s.race;
    const lap = Math.min(r.laps + 1, this.totalLaps);
    if (lap * 100 + this.totalLaps !== this.last.lap) {
      this.lapNum.textContent = `${lap}/${this.totalLaps}`;
      this.last.lap = lap * 100 + this.totalLaps;
    }
    const gatesDone = r.started ? (r.nextGate === 0 ? GATES.length : r.nextGate) : 0;
    if (gatesDone !== this.last.gate) {
      this.gateNum.textContent = `${gatesDone}/${GATES.length}`;
      if (this.last.gate >= 0 && gatesDone > this.last.gate) {
        this.gateNum.classList.remove('flash');
        void this.gateNum.offsetWidth;
        this.gateNum.classList.add('flash');
      }
      this.last.gate = gatesDone;
    }
    const clock = r.started ? formatLap(Math.max(0.001, lapClock(s))) : '0:00.00';
    if (clock !== this.last.clock) {
      this.lapTime.textContent = clock;
      this.lapTime.classList.toggle('idle', !r.started);
      this.last.clock = clock;
    }
    if (r.bestLap !== this.last.bestLap) {
      this.bestLap.textContent = formatLap(r.bestLap);
      this.last.bestLap = r.bestLap;
    }
    if (r.lastLap !== this.last.lastLap) {
      this.lastLap.textContent = formatLap(r.lastLap);
      this.last.lastLap = r.lastLap;
    }
    const g = raceGuidance(s, this.cursor);
    this.cursor = g.cursor;
    this.message = g.message;
    if (this.countingDown && g.message === 'start') g.message = '';
    if (g.message !== this.last.msg) {
      const gateN = r.nextGate === 0 ? 'finish' : `gate ${r.nextGate}`;
      const text = g.message === 'start' ? 'Ride through the start gate' : g.message === 'wrong-way' ? 'Wrong way' : g.message === 'missed' ? `Missed ${gateN}: turn back` : '';
      this.raceMsg.textContent = text;
      this.raceMsg.classList.toggle('hidden', !text);
      this.raceMsg.classList.toggle('info', g.message === 'start');
      this.last.msg = g.message;
    }
    // CSS rotation is clockwise; a positive bearing means the gate is to the left.
    this.arrowSvg.style.transform = `rotate(${(-g.bearing * 180) / Math.PI}deg)`;
    this.gateDist.textContent = `${Math.round(g.dist)} m`;
    this.arrow.classList.toggle('hidden', s.mode !== 'ride' || this.bannerUntil > 0 || this.countingDown);
    if (this.bannerUntil > 0 && s.t > this.bannerUntil) {
      this.bannerUntil = 0;
      this.banner.classList.add('hidden');
    }
  }

  lapComplete(nowT: number, lapNumber: number, time: number, best: boolean, previousBest: number): void {
    if (lapNumber >= this.totalLaps) return; // the finish screen takes over
    this.bannerTitle.textContent = best ? 'NEW BEST LAP' : `LAP ${lapNumber}`;
    this.bannerTime.textContent = formatLap(time);
    let sub = '';
    if (best && previousBest > 0) sub = `${(previousBest - time).toFixed(2)}s faster`;
    else if (!best && previousBest > 0) sub = `+${(time - previousBest).toFixed(2)}s off best`;
    if (lapNumber === this.totalLaps - 1) sub = sub ? `${sub} · FINAL LAP` : 'FINAL LAP';
    this.bannerSub.textContent = sub;
    this.banner.classList.toggle('best', best);
    this.banner.classList.remove('hidden');
    this.bannerUntil = nowT + 3.2;
  }

  resetRace(): void {
    this.hideFinish();
    this.lastStandings = '';
    this.lastCountdown = 'x';
    this.cursor = -1;
    this.bannerUntil = 0;
    this.banner.classList.add('hidden');
  }

  popup(label: string, points: number): void {
    const div = document.createElement('div');
    div.className = 'popup' + (points >= 300 ? ' big' : '');
    div.textContent = label;
    const b = document.createElement('b');
    b.textContent = `+${points}`;
    div.appendChild(b);
    this.popups.appendChild(div);
    while (this.popups.children.length > 3) this.popups.firstElementChild?.remove();
    window.setTimeout(() => div.remove(), 1600);
  }

  clearPopups(): void {
    this.popups.replaceChildren();
  }

  resetHint(): void {
    this.hint.classList.remove('hidden');
  }
}
