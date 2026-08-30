/**
 * 「指で書く」を、本物のタッチ操作で確かめるテスト。
 *   node scripts/test/touch-browser-test.mjs
 *
 * これまでのテストはマウスで動かしていたため、
 * iPad で指を使ったときにだけ起きる不具合を見つけられませんでした。
 * ここではブラウザに直接タッチのできごとを送りこみ、
 *   ・指1本で なめらかに線が引けるか
 *   ・書いている最中に もう1本の指がふれても 線が途切れないか
 *   ・画面のスクロールに邪魔されないか
 * を確かめます。
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const SHOTS = 'data/screenshots';
mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const check = (n, ok, extra = '') => {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ' … ' + extra : ''}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}${extra ? ' … ' + extra : ''}`); }
};

const server = spawn('npx', ['vite', 'preview', '--port', '4182', '--strictPort'], { stdio: 'ignore' });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* もう終わっている */ } };
process.on('exit', stop);
const BASE = 'http://localhost:4182';
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* まだ */ }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({
  ...devices['iPad (gen 7)'], locale: 'ja-JP', hasTouch: true, serviceWorkers: 'block',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// ブラウザに直接タッチのできごとを送るための通り道
const cdp = await ctx.newCDPSession(page);
const touch = (type, points) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 12, radiusY: 12, force: 1 })),
  });

await page.goto(BASE);
await page.waitForSelector('h1', { timeout: 8000 });
await page.getByRole('button', { name: 'おうちの人の がめん' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'ためしがきを ひらく' }).click();
await page.waitForSelector('.tracebox', { timeout: 5000 });

const box = await page.locator('.tracebox').boundingBox();
const at = (fx, fy, id = 0) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy, id });
const readout = () => page.locator('.card', { hasText: '手書きの調子をしらべる' }).innerText();

// ══ 1. 指1本で線を引く ═══════════════════════════════════
console.log('\n\x1b[1m1. 指1本で線を引く\x1b[0m');
await touch('touchStart', [at(0.2, 0.2)]);
for (let i = 1; i <= 20; i++) await touch('touchMove', [at(0.2 + i * 0.03, 0.2 + i * 0.02)]);
await touch('touchEnd', []);
await page.waitForTimeout(300);

let t = await readout();
check('指の入力として届く', t.includes('指'), t.match(/届いた入力の種類\s*\S+/)?.[0] ?? '');
check('1画として数えられる', /書けた画の数\s*1 画/.test(t.replace(/\n/g, ' ')));
const pts1 = Number(t.match(/(\d+)点\/長さ/)?.[1] ?? 0);
check('とちゅうで切れずに、点がたくさん取れる', pts1 >= 15, `${pts1}点`);
check('取り消されていない', !t.includes('途中で取り消されています'));

// ══ 2. 書いている最中に、もう1本の指がふれる ═════════════
// （手のひらや、もう片方の指が画面にふれた状況。
//   iOS はこれを「拡大の操作」と見て、書いている線を取り消すことがある）
console.log('\n\x1b[1m2. 書いている最中に、もう1本の指がふれる\x1b[0m');
await page.getByRole('button', { name: 'ためしがきを けす' }).click();
await page.waitForTimeout(200);

await touch('touchStart', [at(0.2, 0.75, 0)]);
for (let i = 1; i <= 8; i++) await touch('touchMove', [at(0.2 + i * 0.03, 0.75, 0)]);
// ここで2本目の指が置かれる
await touch('touchStart', [at(0.2 + 8 * 0.03, 0.75, 0), at(0.8, 0.15, 1)]);
for (let i = 9; i <= 20; i++) {
  await touch('touchMove', [at(0.2 + i * 0.03, 0.75, 0), at(0.8, 0.15, 1)]);
}
await touch('touchEnd', [at(0.8, 0.15, 1)]);   // 1本目をはなす
await touch('touchEnd', []);                   // 2本目もはなす
await page.waitForTimeout(300);

t = await readout();
const pts2 = Number(t.match(/(\d+)点\/長さ/)?.[1] ?? 0);
check('2本目の指がふれても、線が途切れない', pts2 >= 15, `${pts2}点`);
check('2本目の指は、べつの線として数えない', /書けた画の数\s*1 画/.test(t.replace(/\n/g, ' ')),
  t.match(/書けた画の数\s*\S+ \S+/)?.[0] ?? '');
check('取り消されていない', !t.includes('途中で取り消されています'));
await page.screenshot({ path: `${SHOTS}/touch-inktest.png`, fullPage: true });

// ══ 3. なぞり書きを 指で通しでやる ═══════════════════════
console.log('\n\x1b[1m3. なぞり書きを 指でやる\x1b[0m');
await page.getByRole('button', { name: /ホームに もどる/ }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /なぞりがきを する/ }).click();
await page.waitForSelector('.tracebox', { timeout: 8000 });
await page.waitForTimeout(800);

// お手本の1画目を読みとって、その上を指でなぞる
const guide = await page.evaluate(() => {
  const el = document.querySelector('.guide .stroke-current');
  if (!el) return null;
  const len = el.getTotalLength();
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const p = el.getPointAtLength((len * i) / 24);
    pts.push({ x: p.x, y: p.y });
  }
  return pts;
});
check('お手本の1画目が出ている', guide !== null && guide.length === 25);

const tb = await page.locator('.tracebox').boundingBox();
// お手本は 109×109 のマス目。画面の大きさに合わせる
const size = Math.min(tb.width, tb.height);
const toScreen = (p) => ({
  x: tb.x + (tb.width - size) / 2 + (p.x * size) / 109,
  y: tb.y + (tb.height - size) / 2 + (p.y * size) / 109,
  id: 0,
});
await touch('touchStart', [toScreen(guide[0])]);
for (const p of guide.slice(1)) await touch('touchMove', [toScreen(p)]);
await touch('touchEnd', []);
await page.waitForTimeout(900);

const trace = await page.locator('.app').innerText();
check('指でなぞった1画目が 正しいと判定される',
  !trace.includes('みじかすぎる') && !trace.includes('もういちど'),
  trace.split('\n').find((l) => l.includes('！') || l.includes('ね')) ?? '');
check('画面のエラーは出ていない', errors.length === 0, errors.slice(0, 2).join(' / '));
await page.screenshot({ path: `${SHOTS}/touch-tracing.png`, fullPage: true });

await browser.close();
stop();
console.log(`\n  合計 ${pass + fail}件： \x1b[32m${pass}件合格\x1b[0m / ${fail > 0 ? `\x1b[31m${fail}件失敗\x1b[0m` : '0件失敗'}\n`);
process.exit(fail > 0 ? 1 : 0);
