import '../css/styles.css';
import '../css/batch.css';
import { WATERMARK_SRC, WATERMARK_LABEL, MAX_SIDE, DEFAULTS } from './config';
import { planOutput, renderImage } from './render';
import { buildZip, canvasToBlob, fileBaseName, saveBlob, uniqueName } from './export';
import type { NamedBlob } from './export';
import type { ExportFormat, ImageItem, RenderOptions, WatermarkImage } from './types';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error('Missing element #' + id + ' in index.html');
  return node as T;
}

const out = el<HTMLCanvasElement>('out');

interface AppState {
  items: ImageItem[];
  selected: number;
  wm: WatermarkImage | null;
  row: number;
  col: number;
  tile: boolean;
  busy: boolean;
}

const blank = document.createElement('canvas');
blank.width = 800;
blank.height = 800;
const blankContext = blank.getContext('2d');
if (blankContext) {
  blankContext.fillStyle = '#C9D1DA';
  blankContext.fillRect(0, 0, 800, 800);
}
const blankItem: ImageItem = { src: blank, w: 800, h: 800, name: 'blank' };

const state: AppState = {
  items: [],
  selected: 0,
  wm: null,
  row: 0,
  col: 1,
  tile: false,
  busy: false
};

function current(): ImageItem | null {
  return state.items[state.selected] ?? null;
}

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
      resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight, name: file.name });
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
  const p = current();
  const thumb = el<HTMLCanvasElement>('thumbProduct');
  if (!p) {
    thumb.getContext('2d')?.clearRect(0, 0, thumb.width, thumb.height);
    el('fileProduct').textContent = 'No image chosen yet';
    return;
  }
  setThumb(thumb, p);
  el('fileProduct').textContent = p.name + ' · ' + p.w + ' x ' + p.h + ' px';
}

const batchItems: HTMLButtonElement[] = [];

function markSelected(): void {
  batchItems.forEach((b, i) => b.setAttribute('aria-pressed', String(i === state.selected)));
}

function updateDownloadButton(): void {
  const n = state.items.length;
  const button = el<HTMLButtonElement>('dl');
  button.textContent = n > 1 ? 'Download ' + n + ' images (.zip)' : 'Download image';
  button.disabled = state.busy || n === 0;
}

function select(i: number): void {
  state.selected = i;
  markSelected();
  refreshProductSlot();
  schedule();
}

function removeItem(i: number): void {
  state.items.splice(i, 1);
  if (i < state.selected) state.selected--;
  if (state.selected >= state.items.length) state.selected = Math.max(0, state.items.length - 1);
  renderBatch();
  refreshProductSlot();
  schedule();
}

function renderBatch(): void {
  const list = el('batch');
  list.replaceChildren();
  batchItems.length = 0;
  el('batchBar').hidden = state.items.length === 0;
  el('batchCount').textContent = state.items.length + (state.items.length === 1 ? ' image' : ' images');

  state.items.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'batch-item';

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'batch-pick';
    pick.setAttribute('aria-label', 'Preview ' + item.name);
    const thumb = document.createElement('canvas');
    thumb.width = 56;
    thumb.height = 56;
    setThumb(thumb, item);
    const name = document.createElement('span');
    name.className = 'batch-name';
    name.textContent = item.name;
    name.title = item.name;
    pick.append(thumb, name);
    pick.addEventListener('click', () => select(i));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'batch-remove';
    remove.setAttribute('aria-label', 'Remove ' + item.name);
    remove.textContent = '×';
    remove.addEventListener('click', () => removeItem(i));

    li.append(pick, remove);
    list.appendChild(li);
    batchItems.push(pick);
  });
  markSelected();
  updateDownloadButton();
}

async function acceptFiles(files: File[]): Promise<void> {
  if (files.length === 0) return;
  const images = files.filter((f) => f.type.startsWith('image/'));
  const notImages = files.length - images.length;
  if (images.length === 0) {
    say('Those files are not images. Choose PNG, JPEG or WebP files.', true);
    return;
  }

  const results = await Promise.allSettled(images.map(loadFile));
  const loaded: ImageItem[] = [];
  results.forEach((r) => { if (r.status === 'fulfilled') loaded.push(r.value); });
  const unreadable = images.length - loaded.length;

  if (loaded.length > 0) {
    const wasEmpty = state.items.length === 0;
    state.items.push(...loaded);
    if (wasEmpty) state.selected = 0;
    renderBatch();
    refreshProductSlot();
    schedule();
  }

  const skipped = notImages + unreadable;
  if (skipped > 0 && loaded.length > 0) {
    say(skipped + (skipped === 1 ? ' file was' : ' files were') + ' skipped because ' + (skipped === 1 ? 'it' : 'they') + ' could not be read as images.', true);
  } else if (loaded.length === 0) {
    say('Those images could not be read. Try saving them as PNG or JPEG first.', true);
  } else {
    say('');
  }
}

function wireProductDrop(): void {
  const input = el<HTMLInputElement>('inProduct');
  input.addEventListener('change', () => {
    void acceptFiles(Array.from(input.files ?? []));
    input.value = '';
  });

  [el('dropProduct'), el('empty')].forEach((zone) => {
    (['dragenter', 'dragover'] as const).forEach((ev) =>
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('over'); }));
    (['dragleave', 'drop'] as const).forEach((ev) =>
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('over'); }));
    zone.addEventListener('drop', (e) => void acceptFiles(Array.from((e as DragEvent).dataTransfer?.files ?? [])));
  });

  (['dragover', 'drop'] as const).forEach((ev) => window.addEventListener(ev, (e) => e.preventDefault()));

  el('batchClear').addEventListener('click', () => {
    state.items = [];
    state.selected = 0;
    renderBatch();
    refreshProductSlot();
    say('');
    schedule();
  });
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
  const chosen = current();
  const o = options();
  el('empty').hidden = chosen !== null;
  if (!chosen) {
    renderImage(out, blankItem, state.wm, { ...o, minOn: false });
    const on = o.wmOn && state.wm !== null;
    el('stats').innerHTML = '<span>Preview on a blank canvas</span><span>' + (on ? 'Watermark on' : 'Watermark off') + '</span>';
    return;
  }
  const p = chosen;
  const plan = renderImage(out, p, state.wm, o);
  const marked = o.wmOn && state.wm !== null;
  const enlarged = plan.scale > 1;
  let html =
    '<span>Source <b>' + p.w + ' x ' + p.h + '</b></span>' +
    '<span>Output <b>' + plan.W + ' x ' + plan.H + '</b></span>' +
    '<span>' + (enlarged ? '<span class="up">Enlarged x' + plan.scale.toFixed(2) + '</span>' : 'Original size kept') + '</span>' +
    '<span>' + (marked ? 'Watermark on' : 'Watermark off') + '</span>';
  if (state.items.length > 1) {
    const up = state.items.filter((it) => planOutput(it, o).scale > 1).length;
    html += '<span>Batch <b>' + state.items.length + ' images</b>, ' + up + ' enlarged</span>';
  }
  el('stats').innerHTML = html;
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

function baseName(item: ImageItem): string {
  return fileBaseName(item.name);
}

const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function exportOne(item: ImageItem, o: RenderOptions, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  try {
    renderImage(canvas, item, state.wm, o);
    return await canvasToBlob(canvas, 'image/' + o.fmt, quality);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function download(): Promise<void> {
  if (state.busy || state.items.length === 0) return;
  const o = options();
  const ext = { png: 'png', jpeg: 'jpg', webp: 'webp' }[o.fmt];
  const quality = num('quality', 40, 100, DEFAULTS.quality) / 100;
  const items = state.items;

  state.busy = true;
  updateDownloadButton();
  try {
    const used = new Set<string>();
    const files: NamedBlob[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items.length > 1) say('Processing image ' + (i + 1) + ' of ' + items.length + '…');
      await pause();
      const blob = await exportOne(items[i], o, quality);
      files.push({ name: uniqueName(baseName(items[i]) + '-watermarked.' + ext, used), blob });
    }

    if (files.length === 1) {
      saveBlob(files[0].blob, files[0].name);
      say('Downloaded ' + files[0].name + '.');
    } else {
      say('Packing ' + files.length + ' images into a ZIP…');
      await pause();
      saveBlob(await buildZip(files), 'watermarked-images.zip');
      say('Downloaded ' + files.length + ' images in watermarked-images.zip.');
    }
  } catch {
    say('The export failed. Try fewer images at once or a smaller minimum size.', true);
  } finally {
    state.busy = false;
    updateDownloadButton();
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
  renderBatch();
  refreshProductSlot();
  render();
  el('dl').addEventListener('click', () => void download());

  try {
    state.wm = await loadWatermark();
    setThumb(el<HTMLCanvasElement>('thumbWm'), state.wm);
    el('fileWm').textContent = WATERMARK_LABEL + ' · ' + state.wm.w + ' x ' + state.wm.h + ' px';
    render();
  } catch {
    el('fileWm').textContent = 'Not found: ' + WATERMARK_LABEL;
    say('The watermark file is missing. Put a transparent PNG at ' + WATERMARK_LABEL + ' and rebuild.', true);
  }
}

void start();