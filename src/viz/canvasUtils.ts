/**
 * Responsive HiDPI Canvas helper with automatic ResizeObserver sizing
 * and IntersectionObserver visibility-gated animation loops.
 */

export interface HiDpiCanvasHandle {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  getSize: () => { width: number; height: number; dpr: number };
  requestRedraw: () => void;
  destroy: () => void;
}

export function setupResponsiveCanvas(
  canvas: HTMLCanvasElement,
  aspectOrHeightFn: (width: number) => number,
  drawFn: (ctx: CanvasRenderingContext2D, width: number, height: number, timeSec: number) => void,
  animated = false
): HiDpiCanvasHandle {
  const ctx = canvas.getContext('2d')!;
  let cssWidth = 600;
  let cssHeight = 300;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let isVisible = true;
  let rafId = 0;
  let dirty = true;

  const resize = () => {
    const parent = canvas.parentElement;
    const rectW = parent ? parent.clientWidth : canvas.clientWidth;
    if (rectW <= 0) return;
    cssWidth = Math.floor(rectW);
    cssHeight = Math.max(120, Math.round(aspectOrHeightFn(cssWidth)));
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    dirty = true;
    if (!animated) renderOnce(performance.now() * 0.001);
  };

  const renderOnce = (tSec: number) => {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    drawFn(ctx, cssWidth, cssHeight, tSec);
    ctx.restore();
    dirty = false;
  };

  const loop = (nowMs: number) => {
    if (animated && isVisible) {
      renderOnce(nowMs * 0.001);
      rafId = requestAnimationFrame(loop);
    } else if (dirty && isVisible) {
      renderOnce(nowMs * 0.001);
    }
  };

  const ro = new ResizeObserver(() => resize());
  if (canvas.parentElement) ro.observe(canvas.parentElement);

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        isVisible = e.isIntersecting;
      }
      if (isVisible) {
        cancelAnimationFrame(rafId);
        if (animated) {
          rafId = requestAnimationFrame(loop);
        } else if (dirty) {
          renderOnce(performance.now() * 0.001);
        }
      } else {
        cancelAnimationFrame(rafId);
      }
    },
    { rootMargin: '180px' }
  );
  io.observe(canvas);

  resize();
  if (animated) {
    rafId = requestAnimationFrame(loop);
  } else {
    renderOnce(0);
  }

  return {
    canvas,
    ctx,
    getSize: () => ({ width: cssWidth, height: cssHeight, dpr }),
    requestRedraw: () => {
      dirty = true;
      if (!animated) {
        renderOnce(performance.now() * 0.001);
      }
    },
    destroy: () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
    },
  };
}

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
