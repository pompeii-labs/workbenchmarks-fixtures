import * as THREE from 'three';
import type { RaceWorld } from '../sim/race';

/** Floating place + name tags over the rivals (DOM, projected each frame). */
export class RivalTags {
  private readonly tags: HTMLElement[] = [];
  private readonly v = new THREE.Vector3();
  private readonly keys: string[] = [];

  constructor(private readonly root: HTMLElement) {}

  update(w: RaceWorld, camera: THREE.PerspectiveCamera, show: boolean): void {
    this.root.classList.toggle('off', !show);
    if (!show) return;
    const rivals = w.racers.filter((r) => r.bot);
    while (this.tags.length < rivals.length) {
      const t = document.createElement('div');
      t.className = 'rtag hidden';
      t.innerHTML = '<b></b><span></span>';
      this.root.appendChild(t);
      this.tags.push(t);
      this.keys.push('');
    }
    const W = this.root.clientWidth;
    const H = this.root.clientHeight;
    rivals.forEach((r, i) => {
      const t = this.tags[i];
      const dist = camera.position.distanceTo(this.v.set(r.s.x, r.s.y, r.s.z));
      this.v.set(r.s.x, r.s.y + 2.3, r.s.z).project(camera);
      const visible = dist < 150 && dist > 3 && this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      t.classList.toggle('hidden', !visible);
      if (!visible) return;
      const key = `${r.place}|${r.name}|${r.color}`;
      if (key !== this.keys[i]) {
        this.keys[i] = key;
        t.style.setProperty('--c', r.color);
        (t.children[0] as HTMLElement).textContent = String(r.place);
        (t.children[1] as HTMLElement).textContent = r.name;
      }
      const x = (this.v.x * 0.5 + 0.5) * W;
      const y = (-this.v.y * 0.5 + 0.5) * H;
      const scale = Math.max(0.7, Math.min(1.1, 30 / dist));
      t.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${scale.toFixed(2)})`;
      t.style.opacity = dist > 110 ? String(Math.max(0, (150 - dist) / 40)) : '1';
    });
  }
}
