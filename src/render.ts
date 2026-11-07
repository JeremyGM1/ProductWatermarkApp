import { MAX_SIDE } from './config';
import type { ImageItem, OutputPlan, RenderOptions, WatermarkImage } from './types';

export function planOutput(source: ImageItem, o: RenderOptions): OutputPlan {
  let scale = 1;
  if (o.minOn && (source.w < o.minW || source.h < o.minH)) {
    scale = Math.max(o.minW / source.w, o.minH / source.h);
    const cap = Math.min(MAX_SIDE / source.w, MAX_SIDE / source.h);
    if (scale > cap) scale = Math.max(1, cap);
  }
  return { scale, W: Math.round(source.w * scale), H: Math.round(source.h * scale) };
}

export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  wm: WatermarkImage,
  W: number,
  H: number,
  o: RenderOptions
): void {
  const ww = (W * o.wmSize) / 100;
  const wh = (ww * wm.h) / wm.w;
  const rot = (o.wmRot * Math.PI) / 180;

  ctx.save();
  ctx.globalAlpha = o.wmOpacity / 100;

  const put = (cx: number, cy: number): void => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.drawImage(wm.src, -ww / 2, -wh / 2, ww, wh);
    ctx.restore();
  };

  if (o.tile) {
    const sx = ww * 1.6;
    const sy = wh * 2;
    let row = 0;
    for (let y = sy / 2; y < H + sy; y += sy, row++) {
      for (let x = row % 2 ? 0 : sx / 2; x < W + sx; x += sx) put(x, y);
    }
  } else {
    const m = (W * o.wmMargin) / 100;
    const xs = [m + ww / 2, W / 2, W - m - ww / 2];
    const ys = [m + wh / 2, H / 2, H - m - wh / 2];
    put(xs[o.col], ys[o.row]);
  }
  ctx.restore();
}

export function renderImage(
  canvas: HTMLCanvasElement,
  source: ImageItem,
  wm: WatermarkImage | null,
  o: RenderOptions
): OutputPlan {
  const plan = planOutput(source, o);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.');

  canvas.width = plan.W;
  canvas.height = plan.H;
  if (o.fmt === 'jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, plan.W, plan.H);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source.src, 0, 0, plan.W, plan.H);
  if (o.wmOn && wm) drawWatermark(ctx, wm, plan.W, plan.H, o);
  return plan;
}