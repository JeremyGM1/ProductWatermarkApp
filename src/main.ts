import '../css/styles.css';
import { WATERMARK_SRC, WATERMARK_LABEL, MAX_SIDE, DEFAULTS } from './config';
import { renderImage } from './render';
import { makeSampleProduct } from './sample';
import type { ExportFormat, ImageItem, RenderOptions, WatermarkImage } from './types';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error('Missing element #' + id + ' in index.html');
  return node as T;
}

const out = el<HTMLCanvasElement>('out');

interface AppState {
  product: ImageItem;
  wm: WatermarkImage | null;
  row: number;
  col: number;
  tile: boolean;
}

const sample = makeSampleProduct();
const state: AppState = {
  product: { src: sample, w: sample.width, h: sample.height, name: 'example', sample: true },
  wm: null,
  row: 2,
  col: 2,
  tile: false
};

function say(msg: string, isErr = false): void {
  const s = el('status');
  s.textContent = msg;
  s.className = 'status' + (isErr ? ' err' : '');
}

function num(id: string, lo: number, hi: number, fallback: number): number {
  const v = parseFloat(el<HTMLInputElement>(id).value);
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : fallback));
}

function format(): ExportFormat {
  return el<HTMLSelectElement>('fmt').value as ExportFormat;
}

function options(): RenderOptions {
  return {
    minOn: el<HTMLInputElement>('minOn').checked,
    minW: num('minW', 1, MAX_SIDE, DEFAULTS.minW),
    minH: num('minH', 1, MAX_SIDE, DEFAULTS.minH),
    wmOn: el<HTMLInputElement>('wmOn').checked,
    wmSize: num('wmSize', 5, 100, DEFAULTS.wmSize),
    wmOpacity: num('wmOpacity', 5, 100, DEFAULTS.wmOpacity),
    wmMargin: num('wmMargin', 0, 15, DEFAULTS.wmMargin),
    wmRot: num('wmRot', -45, 45, DEFAULTS.wmRot),
    fmt: format(),
    tile: state.tile,
    row: state.row,
    col: state.col
  };
}

function loadFile(file: File): Promise<ImageItem> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () =>
      resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight, name: file.name, sample: false });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    img.src = url;
  });
}

function loadWatermark(): Promise<WatermarkImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('missing'));
    img.src = WATERMARK_SRC;
  });
}

function setThumb(canvasEl: HTMLCanvasElement, item: WatermarkImage): void {
  const t = canvasEl.getContext('2d');
  if (!t) return;
  const s = canvasEl.width;
  t.clearRect(0, 0, s, s);
  const r = Math.min(s / item.w, s / item.h);
  const w = item.w * r;
  const h = item.h * r;
  t.drawImage(item.src, (s - w) / 2, (s - h) / 2, w, h);
}

function refreshProductSlot(): void {
  const p = state.product;
  setThumb(el<HTMLCanvasElement>('thumbProduct'), p);
  el('fileProduct').textContent = (p.sample ? 'example' : p.name) + ' · ' + p.w + ' × ' + p.h + ' px';
  el('tagProduct').hidden = !p.sample;
}

function acceptProduct(file: File | undefined): void {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    say('That file is not an image. Choose a PNG, JPEG or WebP file.', true);
    return;
  }
  loadFile(file)
    .then((img) => {
      state.product = img;
      say('');
      refreshProductSlot();
      schedule();
    })
    .catch(() => say('That image could not be read. Try saving it as PNG or JPEG first.', true));
}

function wireProductDrop(): void {
  const zone = el('dropProduct');
  const input = el<HTMLInputElement>('inProduct');
  input.addEventListener('change', () => {
    acceptProduct(input.files?.[0]);
    input.value = '';
  });
  (['dragenter', 'dragover'] as const).forEach((ev) =>
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('over'); }));
  (['dragleave', 'drop'] as const).forEach((ev) =>
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('over'); }));
  zone.addEventListener('drop', (e) => acceptProduct((e as DragEvent).dataTransfer?.files[0]));
}

interface Cell {
  b: HTMLButtonElement;
  r: number;
  c: number;
}

function buildPositionGrid(): void {
  const aligns = ['start', 'center', 'end'];
  const rows = ['Top', 'Middle', 'Bottom'];
  const cols = ['left', 'center', 'right'];
  const grid = el('grid3');
  const cells: Cell[] = [];

  const sync = (): void => {
    cells.forEach(({ b, r, c }) =>
      b.setAttribute('aria-pressed', String(!state.tile && r === state.row && c === state.col)));
    el('tileBtn').setAttribute('aria-pressed', String(state.tile));
    grid.classList.toggle('off', state.tile);
    el('sMargin').classList.toggle('off', state.tile);
    el<HTMLInputElement>('wmMargin').disabled = state.tile;
  };

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.placeItems = aligns[r] + ' ' + aligns[c];
      b.setAttribute('aria-label', rows[r] + ' ' + cols[c]);
      b.innerHTML = '<i></i>';
      b.addEventListener('click', () => {
        state.row = r;
        state.col = c;
        state.tile = false;
        sync();
        schedule();
      });
      grid.appendChild(b);
      cells.push({ b, r, c });
    }
  }

  el('tileBtn').addEventListener('click', () => {
    state.tile = !state.tile;
    sync();
    schedule();
  });
  sync();
}

function render(): void {
  const p = state.product;
  const plan = renderImage(out, p, state.wm, options());
  const marked = el<HTMLInputElement>('wmOn').checked && state.wm !== null;
  const enlarged = plan.scale > 1;
  el('stats').innerHTML =
    '<span>Source <b>' + p.w + ' × ' + p.h + '</b></span>' +
    '<span>Output <b>' + plan.W + ' × ' + plan.H + '</b></span>' +
    '<span>' + (enlarged ? '<span class="up">Enlarged ×' + plan.scale.toFixed(2) + '</span>' : 'Original size kept') + '</span>' +
    '<span>' + (marked ? 'Watermark on' : 'Watermark off') + '</span>';
}

let pending = false;
function schedule(): void {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    render();
  });
}

function wireControls(): void {
  const readouts: Array<[string, string, (v: string) => string]> = [
    ['wmSize', 'oSize', (v) => v + '% of width'],
    ['wmOpacity', 'oOpacity', (v) => v + '%'],
    ['wmMargin', 'oMargin', (v) => v + '%'],
    ['wmRot', 'oRot', (v) => v + '°']
  ];
  readouts.forEach(([inputId, outputId, fmt]) => {
    const input = el<HTMLInputElement>(inputId);
    const update = (): void => { el(outputId).textContent = fmt(input.value); };
    input.addEventListener('input', () => { update(); schedule(); });
    update();
  });
  ['minOn', 'minW', 'minH', 'wmOn'].forEach((id) => el(id).addEventListener('input', schedule));
  el('fmt').addEventListener('change', () => {
    el('qField').hidden = format() === 'png';
    schedule();
  });
  el('qField').hidden = format() === 'png';
}

function baseName(): string {
  const n = state.product.sample ? 'product' : state.product.name;
  return n.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'product';
}

function download(): void {
  const fmt = format();
  const ext = { png: 'png', jpeg: 'jpg', webp: 'webp' }[fmt];
  const quality = num('quality', 40, 100, DEFAULTS.quality) / 100;
  const filename = baseName() + '-watermarked.' + ext;

  render();
  try {
    out.toBlob((blob) => {
      if (!blob) {
        say('The image could not be exported. Try a smaller minimum size.', true);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say('Downloaded ' + filename + '.');
    }, 'image/' + fmt, quality);
  } catch {
    say('The browser blocked the export. Try another browser or save the image from the preview.', true);
  }
}

function applyDefaults(): void {
  el<HTMLInputElement>('minOn').checked = DEFAULTS.minOn;
  el<HTMLInputElement>('minW').value = String(DEFAULTS.minW);
  el<HTMLInputElement>('minH').value = String(DEFAULTS.minH);
  el<HTMLInputElement>('wmOn').checked = DEFAULTS.wmOn;
  el<HTMLInputElement>('wmSize').value = String(DEFAULTS.wmSize);
  el<HTMLInputElement>('wmOpacity').value = String(DEFAULTS.wmOpacity);
  el<HTMLInputElement>('wmMargin').value = String(DEFAULTS.wmMargin);
  el<HTMLInputElement>('wmRot').value = String(DEFAULTS.wmRot);
  el<HTMLSelectElement>('fmt').value = DEFAULTS.fmt;
  el<HTMLInputElement>('quality').value = String(DEFAULTS.quality);
}

async function start(): Promise<void> {
  applyDefaults();
  wireProductDrop();
  buildPositionGrid();
  wireControls();
  refreshProductSlot();
  render();
  el('dl').addEventListener('click', download);

  try {
    state.wm = await loadWatermark();
    setThumb(el<HTMLCanvasElement>('thumbWm'), state.wm);
    el('fileWm').textContent = WATERMARK_LABEL + ' · ' + state.wm.w + ' × ' + state.wm.h + ' px';
    render();
  } catch {
    el('fileWm').textContent = 'Not found: ' + WATERMARK_LABEL;
    say('The watermark file is missing. Put a transparent PNG at ' + WATERMARK_LABEL + ' and rebuild.', true);
  }
}

void start();