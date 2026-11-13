import { existsSync, readFileSync } from 'node:fs';

const file = 'dist/index.html';
if (!existsSync(file)) {
  console.error('FAIL: ' + file + ' not found. Run "npm run build" first.');
  process.exit(1);
}

const html = readFileSync(file, 'utf8');
const problems = [];

if (existsSync('dist/assets')) {
  problems.push('dist/assets exists, so the build is split into several files.');
}

for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
  problems.push('The page loads an external script: ' + m[1]);
}

for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
  const tag = m[0];
  if (!/\brel\s*=\s*["']stylesheet["']/i.test(tag)) continue;
  const href = (tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
  if (!href.startsWith('https://fonts.googleapis.com/')) {
    problems.push('The page loads an external stylesheet: ' + href);
  }
}

if (html.includes('main.ts')) problems.push('The page mentions main.ts, so this is the development page, not the build.');
if (!/<style[\s>]/i.test(html)) problems.push('No inline styles found.');
if (!/<script\b[^>]*type\s*=\s*["']module["'][^>]*>[^<]{2000,}/i.test(html)) problems.push('No inline application code found.');
if (!html.includes('data:image/png;base64,')) problems.push('The watermark image is not embedded in the page.');

if (problems.length > 0) {
  console.error('FAIL: dist/index.html is not a self-contained file:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

console.log('OK: dist/index.html is self-contained (' + Math.round(html.length / 1024) + ' KB).');