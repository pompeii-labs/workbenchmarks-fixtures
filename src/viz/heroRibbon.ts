import { setupResponsiveCanvas, drawRoundedRect } from './canvasUtils';

export function initHeroRibbon(): void {
  const canvas = document.getElementById('hero-ribbon-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  setupResponsiveCanvas(
    canvas,
    (w) => (w < 560 ? 215 : 225),
    (ctx, w, h, t) => {
      const compact = w < 640;
      const midY = h * 0.52;

      // Zone x-positions
      const sunX = compact ? Math.max(46, w * 0.14) : w * 0.09;
      const cellX = compact ? w * 0.46 : w * 0.44;
      const cellW = compact ? w * 0.2 : w * 0.18;
      const cellH = compact ? 92 : 112;
      const loadX = w * 0.85;

      // 1. Glowing Sun on left
      const sunR = compact ? 24 : 34;
      const glow = ctx.createRadialGradient(sunX, midY, sunR * 0.2, sunX, midY, sunR * 2.4);
      glow.addColorStop(0, 'rgba(254, 243, 199, 0.95)');
      glow.addColorStop(0.35, 'rgba(251, 191, 36, 0.65)');
      glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sunX, midY, sunR * 2.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(sunX, midY, sunR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sun (5,778 K)', sunX, midY + sunR + 20);

      // 2. Streaming Photon Wave Packets from Sun -> Silicon Cell
      const beamStart = sunX + sunR + 10;
      const beamEnd = cellX - 8;
      const colors = ['#60a5fa', '#fbbf24', '#f87171'];
      const offsets = [-22, 0, 22];

      for (let b = 0; b < 3; b++) {
        const y0 = midY + offsets[b];
        const progress = (t * 0.42 + b * 0.33) % 1;
        const px = beamStart + (beamEnd - beamStart) * progress;

        // Subtle guide ray
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.13)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(beamStart, y0);
        ctx.lineTo(beamEnd, y0);
        ctx.stroke();
        ctx.setLineDash([]);

        // Wavelet packet
        ctx.strokeStyle = colors[b];
        ctx.lineWidth = 2;
        ctx.beginPath();
        const pktLen = compact ? 22 : 32;
        const freq = b === 0 ? 0.65 : b === 1 ? 0.45 : 0.3;
        for (let dx = -pktLen / 2; dx <= pktLen / 2; dx += 1.5) {
          const env = Math.cos((dx / (pktLen / 2)) * (Math.PI / 2));
          const wy = y0 + Math.sin(dx * freq - t * 14) * 6 * env;
          if (dx === -pktLen / 2) ctx.moveTo(px + dx, wy);
          else ctx.lineTo(px + dx, wy);
        }
        ctx.stroke();

        // Leading photon spark
        ctx.fillStyle = colors[b];
        ctx.beginPath();
        ctx.arc(px + pktLen * 0.45, y0, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Cross-section of Silicon Solar Cell
      const cellTop = midY - cellH / 2;
      // N-type top layer
      drawRoundedRect(ctx, cellX, cellTop, cellW, cellH, 8);
      ctx.fillStyle = '#162847';
      ctx.fill();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // N-skin highlight
      ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.fillRect(cellX + 2, cellTop + 2, cellW * 0.32, cellH - 4);

      // Depletion zone band
      const juncX = cellX + cellW * 0.34;
      ctx.fillStyle = 'rgba(52, 211, 153, 0.22)';
      ctx.fillRect(juncX, cellTop + 2, cellW * 0.16, cellH - 4);

      // P-base region
      ctx.fillStyle = 'rgba(251, 113, 133, 0.14)';
      ctx.fillRect(juncX + cellW * 0.16, cellTop + 2, cellW * 0.5 - 2, cellH - 4);

      // Labels inside wafer
      ctx.font = '700 10px ui-monospace, monospace';
      ctx.fillStyle = '#7dd3fc';
      ctx.textAlign = 'center';
      ctx.fillText('N', cellX + cellW * 0.17, cellTop + 16);
      ctx.fillStyle = '#fda4af';
      ctx.fillText('P', cellX + cellW * 0.74, cellTop + 16);

      // Internal separation animation: electron goes left-up, hole goes right-down
      const sepPhase = (t * 0.85) % 1;
      const pairOriginX = juncX + cellW * 0.08;
      const eX = pairOriginX - sepPhase * (cellW * 0.28);
      const hX = pairOriginX + sepPhase * (cellW * 0.42);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(eX, midY - 8, 4.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hX, midY + 10, 4.2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('Silicon P–N Cell', cellX + cellW / 2, cellTop + cellH + 18);

      // 4. External Wire Loop from N-front -> Load -> P-rear
      const wireTopY = cellTop - 18;
      const wireBotY = cellTop + cellH + 28;
      const nTapX = cellX + cellW * 0.16;
      const pTapX = cellX + cellW * 0.84;

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      // Top path: N-side -> up -> right -> down to load
      ctx.moveTo(nTapX, cellTop);
      ctx.lineTo(nTapX, wireTopY);
      ctx.lineTo(loadX, wireTopY);
      ctx.lineTo(loadX, midY - 18);
      // Bottom return path: Load -> down -> left -> up to P-side
      ctx.moveTo(loadX, midY + 18);
      ctx.lineTo(loadX, wireBotY);
      ctx.lineTo(pTapX, wireBotY);
      ctx.lineTo(pTapX, cellTop + cellH);
      ctx.stroke();

      // Flowing electrons along wire loop
      const pathNodes: [number, number][] = [
        [nTapX, cellTop],
        [nTapX, wireTopY],
        [loadX, wireTopY],
        [loadX, midY - 18],
        [loadX, midY + 18],
        [loadX, wireBotY],
        [pTapX, wireBotY],
        [pTapX, cellTop + cellH],
      ];
      let totalLen = 0;
      const segLens: number[] = [];
      for (let i = 0; i < pathNodes.length - 1; i++) {
        const dx = pathNodes[i + 1][0] - pathNodes[i][0];
        const dy = pathNodes[i + 1][1] - pathNodes[i][1];
        const l = Math.hypot(dx, dy);
        segLens.push(l);
        totalLen += l;
      }

      const numDots = compact ? 7 : 10;
      for (let d = 0; d < numDots; d++) {
        let dist = (((d / numDots + t * 0.22) % 1) * totalLen);
        for (let s = 0; s < segLens.length; s++) {
          if (dist <= segLens[s] || s === segLens.length - 1) {
            const u = segLens[s] > 0 ? dist / segLens[s] : 0;
            const x = pathNodes[s][0] + (pathNodes[s + 1][0] - pathNodes[s][0]) * u;
            const y = pathNodes[s][1] + (pathNodes[s + 1][1] - pathNodes[s][1]) * u;
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(x, y, 3.3, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          dist -= segLens[s];
        }
      }

      // 5. Load / Glowing LED Lamp on right
      const pulse = 0.82 + 0.18 * Math.sin(t * 4);
      const loadGlow = ctx.createRadialGradient(loadX, midY, 4, loadX, midY, 34);
      loadGlow.addColorStop(0, `rgba(52, 211, 153, ${0.85 * pulse})`);
      loadGlow.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = loadGlow;
      ctx.beginPath();
      ctx.arc(loadX, midY, 34, 0, Math.PI * 2);
      ctx.fill();

      drawRoundedRect(ctx, loadX - 18, midY - 18, 36, 36, 10);
      ctx.fillStyle = '#064e3b';
      ctx.fill();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Lightning bolt icon inside load
      ctx.fillStyle = '#a7f3d0';
      ctx.beginPath();
      ctx.moveTo(loadX + 2, midY - 10);
      ctx.lineTo(loadX - 6, midY + 1);
      ctx.lineTo(loadX, midY + 1);
      ctx.lineTo(loadX - 2, midY + 10);
      ctx.lineTo(loadX + 6, midY - 1);
      ctx.lineTo(loadX, midY - 1);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Useful Work', loadX, midY + 34);
    },
    true
  );
}
