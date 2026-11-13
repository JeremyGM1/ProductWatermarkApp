import { describe, expect, it } from 'vitest';
import { MAX_SIDE } from '../src/config';
import { drawWatermark, planOutput, renderImage } from '../src/render';
import type { ImageItem, RenderOptions, WatermarkImage } from '../src/types';

const options = (over: Partial<RenderOptions> = {}): RenderOptions => ({
  minOn: true, minW: 800, minH: 800,
  wmOn: true, wmSize: 50, wmOpacity: 60, wmMargin: 3, wmRot: 0,
  fmt: 'png', tile: false, row: 0, col: 1,
  ...over
});

const image = (w: number, h: number): ImageItem => ({
  src: { tag: 'source' } as unknown as HTMLCanvasElement, w, h, name: 'test.png'
});

const wmSrc = { tag: 'watermark' } as unknown as HTMLCanvasElement;
const watermark = (w = 200, h = 100): WatermarkImage => ({ src: wmSrc, w, h });

interface Call { fn: string; args: unknown[]; alpha: number }

function fakeContext() {
  const calls: Call[] = [];
  const raw: Record<string, unknown> = {
    globalAlpha: 1, fillStyle: '', imageSmoothingEnabled: false, imageSmoothingQuality: 'low'
  };
  for (const fn of ['save', 'restore', 'translate', 'rotate', 'drawImage', 'fillRect']) {
    raw[fn] = (...args: unknown[]) => { calls.push({ fn, args, alpha: raw.globalAlpha as number }); };
  }
  return { ctx: raw as unknown as CanvasRenderingContext2D, raw, calls };
}

function fakeCanvas(ctx: CanvasRenderingContext2D | null) {
  return { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

const watermarkDraws = (calls: Call[]) => calls.filter((c) => c.fn === 'drawImage' && c.args[0] === wmSrc);

describe('planOutput', () => {
  it('leaves images that already meet the minimum untouched', () => {
    expect(planOutput(image(1200, 900), options())).toEqual({ scale: 1, W: 1200, H: 900 });
  });

  it('leaves an image exactly at the minimum untouched', () => {
    expect(planOutput(image(800, 800), options()).scale).toBe(1);
  });

  it('enlarges until both sides reach the minimum (the smaller side decides)', () => {
    expect(planOutput(image(400, 200), options())).toEqual({ scale: 4, W: 1600, H: 800 });
  });

  it('enlarges when only one side is too small', () => {
    expect(planOutput(image(1000, 400), options())).toEqual({ scale: 2, W: 2000, H: 800 });
  });

  it('keeps the proportions and reaches the minimum on both sides', () => {
    const plan = planOutput(image(333, 777), options());
    expect(plan.W).toBeGreaterThanOrEqual(800);
    expect(plan.H).toBeGreaterThanOrEqual(800);
    expect(plan.W / plan.H).toBeCloseTo(333 / 777, 2);
  });

  it('does nothing when the option is switched off', () => {
    expect(planOutput(image(100, 100), options({ minOn: false })).scale).toBe(1);
  });

  it('uses separate width and height minimums', () => {
    expect(planOutput(image(500, 500), options({ minW: 1000, minH: 600 })).scale).toBe(2);
  });

  it('never goes past the maximum side length', () => {
    const plan = planOutput(image(1000, 10), options());
    expect(plan.W).toBeLessThanOrEqual(MAX_SIDE);
    expect(plan.H).toBeLessThanOrEqual(MAX_SIDE);
  });

  it('never shrinks an image that is already over the maximum', () => {
    expect(planOutput(image(9000, 100), options())).toEqual({ scale: 1, W: 9000, H: 100 });
  });
});

describe('drawWatermark', () => {
  const W = 1000, H = 800;
  const place = (o: Partial<RenderOptions>) => {
    const { ctx, calls } = fakeContext();
    drawWatermark(ctx, watermark(), W, H, options(o));
    return calls;
  };
  const translateOf = (calls: Call[]) => calls.find((c) => c.fn === 'translate')!.args;

  it('puts the watermark at the top center', () => {
    expect(translateOf(place({ row: 0, col: 1 }))).toEqual([500, 155]);
  });

  it('puts the watermark at the top left', () => {
    expect(translateOf(place({ row: 0, col: 0 }))).toEqual([280, 155]);
  });

  it('puts the watermark at the bottom right', () => {
    expect(translateOf(place({ row: 2, col: 2 }))).toEqual([720, 645]);
  });

  it('puts the watermark in the middle', () => {
    expect(translateOf(place({ row: 1, col: 1 }))).toEqual([500, 400]);
  });

  it('keeps the watermark proportions', () => {
    const [draw] = watermarkDraws(place({}));
    expect(draw.args).toEqual([wmSrc, -250, -125, 500, 250]);
  });

  it('applies the opacity while drawing', () => {
    expect(watermarkDraws(place({ wmOpacity: 60 }))[0].alpha).toBeCloseTo(0.6);
  });

  it('rotates by the chosen angle in radians', () => {
    const rotate = place({ wmRot: 90 }).find((c) => c.fn === 'rotate')!;
    expect(rotate.args[0]).toBeCloseTo(Math.PI / 2);
  });

  it('repeats across the image in tile mode', () => {
    expect(watermarkDraws(place({ tile: true })).length).toBeGreaterThan(3);
  });

  it('draws exactly one watermark when not tiled', () => {
    expect(watermarkDraws(place({ tile: false }))).toHaveLength(1);
  });

  it('leaves the drawing state balanced (every save has a restore)', () => {
    const calls = place({ tile: true });
    expect(calls.filter((c) => c.fn === 'save').length).toBe(calls.filter((c) => c.fn === 'restore').length);
  });
});

describe('renderImage', () => {
  it('sizes the canvas to the plan and draws the source scaled to it', () => {
    const { ctx, calls } = fakeContext();
    const canvas = fakeCanvas(ctx);
    const src = image(400, 200);
    const plan = renderImage(canvas, src, null, options());
    expect(plan).toEqual({ scale: 4, W: 1600, H: 800 });
    expect([canvas.width, canvas.height]).toEqual([1600, 800]);
    expect(calls.find((c) => c.fn === 'drawImage')!.args).toEqual([src.src, 0, 0, 1600, 800]);
  });

  it('draws only the source when the watermark is off', () => {
    const { ctx, calls } = fakeContext();
    renderImage(fakeCanvas(ctx), image(1000, 1000), watermark(), options({ wmOn: false }));
    expect(watermarkDraws(calls)).toHaveLength(0);
  });

  it('draws only the source when the watermark failed to load', () => {
    const { ctx, calls } = fakeContext();
    renderImage(fakeCanvas(ctx), image(1000, 1000), null, options());
    expect(calls.filter((c) => c.fn === 'drawImage')).toHaveLength(1);
  });

  it('draws the watermark on top when it is on', () => {
    const { ctx, calls } = fakeContext();
    renderImage(fakeCanvas(ctx), image(1000, 1000), watermark(), options());
    expect(watermarkDraws(calls)).toHaveLength(1);
  });

  it('paints a white background first for JPEG, which has no transparency', () => {
    const { ctx, raw, calls } = fakeContext();
    renderImage(fakeCanvas(ctx), image(1000, 1000), null, options({ fmt: 'jpeg' }));
    expect(raw.fillStyle).toBe('#FFFFFF');
    expect(calls[0]).toMatchObject({ fn: 'fillRect', args: [0, 0, 1000, 1000] });
  });

  it('does not paint a background for PNG', () => {
    const { ctx, calls } = fakeContext();
    renderImage(fakeCanvas(ctx), image(1000, 1000), null, options({ fmt: 'png' }));
    expect(calls.some((c) => c.fn === 'fillRect')).toBe(false);
  });

  it('reports a clear error when the browser has no canvas support', () => {
    expect(() => renderImage(fakeCanvas(null), image(10, 10), null, options())).toThrow(/Canvas 2D/);
  });
});