import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { buildZip, canvasToBlob, fileBaseName, uniqueName } from '../src/export';

describe('fileBaseName', () => {
  it('drops the extension', () => {
    expect(fileBaseName('shoe.png')).toBe('shoe');
  });

  it('replaces spaces and symbols with dashes', () => {
    expect(fileBaseName('My Photo (1).JPG')).toBe('My-Photo-1');
  });

  it('keeps accented letters, so Spanish names stay readable', () => {
    expect(fileBaseName('camisa azúl niño.png')).toBe('camisa-azúl-niño');
  });

  it('only removes the last extension', () => {
    expect(fileBaseName('a.b.c.jpg')).toBe('a-b-c');
  });

  it('removes path pieces so a name cannot point outside the ZIP', () => {
    expect(fileBaseName('../../evil.png')).toBe('evil');
  });

  it('falls back to "product" when nothing is left', () => {
    expect(fileBaseName('.png')).toBe('product');
    expect(fileBaseName('***.png')).toBe('product');
    expect(fileBaseName('')).toBe('product');
  });
});

describe('uniqueName', () => {
  it('returns the name unchanged the first time', () => {
    expect(uniqueName('photo.png', new Set())).toBe('photo.png');
  });

  it('numbers repeats starting at 2', () => {
    const used = new Set<string>();
    expect([1, 2, 3].map(() => uniqueName('photo.png', used))).toEqual(['photo.png', 'photo-2.png', 'photo-3.png']);
  });

  it('keeps the extension at the end when the name has dots', () => {
    const used = new Set<string>();
    uniqueName('a.b.png', used);
    expect(uniqueName('a.b.png', used)).toBe('a.b-2.png');
  });

  it('handles names without an extension', () => {
    const used = new Set<string>();
    uniqueName('photo', used);
    expect(uniqueName('photo', used)).toBe('photo-2');
  });

  it('never returns a name that is already taken', () => {
    const used = new Set(['p.png', 'p-2.png']);
    expect(uniqueName('p.png', used)).toBe('p-3.png');
  });
});

describe('buildZip', () => {
  const bytes = (...n: number[]) => new Uint8Array(n);

  it('produces a ZIP that contains every file unchanged', async () => {
    const a = bytes(1, 2, 3, 4, 5);
    const b = bytes(250, 251, 252);
    const zip = await buildZip([
      { name: 'a.png', blob: new Blob([a]) },
      { name: 'b.png', blob: new Blob([b]) }
    ]);
    expect(zip.type).toBe('application/zip');
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(['a.png', 'b.png']);
    expect(Array.from(files['a.png'])).toEqual(Array.from(a));
    expect(Array.from(files['b.png'])).toEqual(Array.from(b));
  });

  it('keeps accented file names intact', async () => {
    const zip = await buildZip([{ name: 'niño-watermarked.png', blob: new Blob([bytes(9)]) }]);
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files)).toEqual(['niño-watermarked.png']);
  });

  it('keeps names that uniqueName made distinct', async () => {
    const used = new Set<string>();
    const names = [1, 2, 3].map(() => uniqueName('photo-watermarked.png', used));
    const zip = await buildZip(names.map((name, i) => ({ name, blob: new Blob([bytes(i)]) })));
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(names.sort());
  });
});

describe('canvasToBlob', () => {
  const canvasThatReturns = (blob: Blob | null) =>
    ({ toBlob: (cb: (b: Blob | null) => void) => cb(blob) }) as unknown as HTMLCanvasElement;

  it('resolves with the exported file', async () => {
    const blob = new Blob(['x']);
    await expect(canvasToBlob(canvasThatReturns(blob), 'image/png', 0.9)).resolves.toBe(blob);
  });

  it('rejects when the browser cannot export the canvas', async () => {
    await expect(canvasToBlob(canvasThatReturns(null), 'image/png', 0.9)).rejects.toThrow(/exported/);
  });
});