/**
 * しばまるの全表情・全アイテムを1枚の絵にして確認するための道具。
 *   node scripts/test/shiba-sheet.mjs
 * data/screenshots/shiba-sheet.png に保存されます。
 * 絵を直したあと、見た目がおかしくないか目で確かめるのに使います。
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

mkdirSync('data/screenshots', { recursive: true });

// 確認用のページを一時的に作る
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/styles.css"></head>
<body><div id="root"></div>
<script type="module">
import { createRoot } from 'react-dom/client';
import { createElement as h, Fragment } from 'react';
import { Shibamaru } from '/src/character/Shibamaru.tsx';
import { FACES } from '/src/character/expressions.ts';
import { ITEMS } from '/src/character/items.ts';

const cell = (label, node) => h('div', { style: { textAlign: 'center', padding: 8 } },
  node, h('div', { style: { fontSize: 13, color: '#6b655c' } }, label));

createRoot(document.getElementById('root')).render(
  h('div', { style: { padding: 20, fontFamily: 'sans-serif', background: '#faf7f0' } },
    h('h2', null, 'ひょうじょう（6しゅるい）'),
    h('div', { style: { display: 'flex', flexWrap: 'wrap' } },
      ...Object.keys(FACES).map((k) => cell(k, h(Shibamaru, { expression: k, size: 110 })))),
    h('h2', null, 'ぼうし'),
    h('div', { style: { display: 'flex', flexWrap: 'wrap' } },
      ...ITEMS.filter((i) => i.kind === 'hat').map((i) =>
        cell(i.name, h(Shibamaru, { expression: 'happy', hat: i.id, size: 110 })))),
    h('h2', null, 'くびわ'),
    h('div', { style: { display: 'flex', flexWrap: 'wrap' } },
      ...ITEMS.filter((i) => i.kind === 'collar').map((i) =>
        cell(i.name, h(Shibamaru, { expression: 'normal', collar: i.id, size: 110 })))),
    h('h2', null, 'ぜんぶ つけたところ'),
    h('div', { style: { display: 'flex' } },
      cell('おうかん＋すず', h(Shibamaru, { expression: 'proud', hat: 'hat-crown', collar: 'collar-bell', size: 160 })),
      cell('むぎわら＋あか', h(Shibamaru, { expression: 'happy', hat: 'hat-straw', collar: 'collar-red', size: 160 })))
  )
);
</script></body></html>`;

writeFileSync('shiba-sheet.html', html);
const server = spawn('npx', ['vite', '--port', '4181', '--strictPort'], { stdio: 'ignore' });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* もう終わっている */ } rmSync('shiba-sheet.html', { force: true }); };
process.on('exit', stop);
for (let i = 0; i < 60; i++) {
  try { if ((await fetch('http://localhost:4181/shiba-sheet.html')).ok) break; } catch { /* まだ */ }
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 820, height: 1200 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:4181/shiba-sheet.html', { waitUntil: 'networkidle' });
await page.waitForSelector('svg.shiba', { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: 'data/screenshots/shiba-sheet.png', fullPage: true });
console.log('data/screenshots/shiba-sheet.png に保存しました');
await browser.close();
stop();
