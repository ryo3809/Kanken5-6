/**
 * なぞり書き画面を、実際のブラウザで動かして確かめるテスト。
 * Apple Pencil（pointerType='pen'）と 指（'touch'）の両方を再現します。
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const SHOTS = 'data/screenshots';
mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const check = (n, ok, extra = '') => {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ' … ' + extra : ''}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}${extra ? ' … ' + extra : ''}`); }
};

const server = spawn('npx', ['vite', 'preview', '--port', '4176', '--strictPort'], { stdio: 'ignore' });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* もう終わっている */ } };
process.on('exit', stop);
const BASE = 'http://localhost:4176';
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* まだ */ }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], locale: 'ja-JP' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

/**
 * ブラウザの中で PointerEvent を作って、なぞる動きを再現する。
 * pointerType を 'pen'（Apple Pencil）や 'touch'（指）に変えられる。
 */
async function trace(points, pointerType = 'pen', pointerId = 1, waitMs = 650) {
  await page.evaluate(
    ({ points, pointerType, pointerId }) => {
      const box = document.querySelector('.tracebox');
      const r = box.getBoundingClientRect();
      const fire = (type, p, extra = {}) => {
        box.dispatchEvent(
          new PointerEvent(type, {
            pointerId, pointerType, isPrimary: true, bubbles: true, cancelable: true,
            clientX: r.left + p.x, clientY: r.top + p.y, ...extra,
          }),
        );
      };
      // 実際の指の動きに近づけて、点のあいだを補間する
      const dense = [];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        for (let t = 0; t < 1; t += 0.15) {
          dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
      dense.push(points[points.length - 1]);
      fire('pointerdown', dense[0], { buttons: 1 });
      for (const p of dense.slice(1)) fire('pointermove', p, { buttons: 1 });
      fire('pointerup', dense[dense.length - 1], { buttons: 0 });
    },
    { points, pointerType, pointerId },
  );
  // 正解のとき、アプリは450ミリ秒あとに次の画へ進むので、ふだんはそれより長く待つ
  await page.waitForTimeout(waitMs);
}

/** KanjiVG の 109 のマス目の座標を、画面の座標に直す */
async function kvgToScreen(pts) {
  const size = await page.evaluate(() => {
    const r = document.querySelector('.tracebox').getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  const s = Math.min(size.w, size.h);
  const offX = (size.w - s) / 2, offY = (size.h - s) / 2;
  return pts.map((p) => ({ x: offX + (p.x / 109) * s, y: offY + (p.y / 109) * s }));
}

try {
  console.log('\n▶ テスト1　なぞり書きの画面が開くか');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /なぞりがきを する/ }).click();
  await page.waitForSelector('.tracebox', { timeout: 8000 });
  check('マスが表示される', await page.locator('.tracebox').isVisible());

  const boxSize = await page.evaluate(() => {
    const r = document.querySelector('.tracebox').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  check('マスが280px以上ある（指でも書ける大きさ）', boxSize.w >= 280 && boxSize.h >= 280,
    `${boxSize.w}×${boxSize.h}px`);
  check('正方形になっている', Math.abs(boxSize.w - boxSize.h) <= 2);

  const guide = await page.evaluate(() => ({
    future: document.querySelectorAll('.stroke-future').length,
    current: document.querySelectorAll('.stroke-current').length,
    dot: document.querySelectorAll('.start-dot').length,
    dots: document.querySelectorAll('.strokedots span').length,
  }));
  check('お手本がうすく表示されている', guide.future >= 1,
    `のこり${guide.future}画 / ぜんぶで${guide.dots}画`);
  check('小学5年生に意味のある漢字から始まる（「一」から始めない）', guide.dots >= 5,
    `1字目は${guide.dots}画の漢字`);
  check('いま書く画が目立って表示されている', guide.current === 1);
  check('書きはじめの●が出ている', guide.dot === 1);
  await page.screenshot({ path: `${SHOTS}/9-なぞりがき.png` });

  // いまの漢字と筆画データを取り出す
  const info = await page.evaluate(() => {
    const t = document.querySelector('.card p, .muted')?.textContent ?? '';
    return { header: document.querySelectorAll('.muted')[0]?.textContent ?? t };
  });
  console.log(`    ${info.header.trim()}`);

  console.log('\n▶ テスト2　Apple Pencil で正しくなぞれるか');
  // 1画目のお手本の座標を、画面から直接読み取る
  const refPts = await page.evaluate(() => {
    const path = document.querySelector('.stroke-current');
    const len = path.getTotalLength();
    const out = [];
    for (let i = 0; i <= 20; i++) {
      const p = path.getPointAtLength((len * i) / 20);
      out.push({ x: p.x, y: p.y });
    }
    return out;
  });
  // 「いいね！」は450ミリ秒で次の画に切りかわるので、短く待って確かめる
  await trace(await kvgToScreen(refPts), 'pen', 1, 150);
  const v1 = (await page.locator('.notice, .card').allTextContents()).join(' ');
  check('ペンでなぞると「いいね！」になる', v1.includes('いいね') || v1.includes('かけました'),
    v1.replace(/\s+/g, ' ').slice(0, 50));
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => document.querySelectorAll('.strokedots span.done').length);
  check('1画すすむ', after === 1, `${after}画かけた`);

  console.log('\n▶ テスト3　逆向きに書くと教えてくれるか');
  const ref2 = await page.evaluate(() => {
    const path = document.querySelector('.stroke-current');
    const len = path.getTotalLength();
    const out = [];
    for (let i = 20; i >= 0; i--) { const p = path.getPointAtLength((len * i) / 20); out.push({ x: p.x, y: p.y }); }
    return out;
  });
  await trace(await kvgToScreen(ref2), 'pen');
  const v2 = await page.locator('.notice.bad').first().textContent();
  check('「かく むきが ぎゃくだよ」と出る', v2.includes('ぎゃく') || v2.includes('かきはじめ'), v2.trim().slice(0, 40));
  check('その画だけやり直しになる（最初に戻らない）',
    (await page.evaluate(() => document.querySelectorAll('.strokedots span.done').length)) === 1);
  await page.screenshot({ path: `${SHOTS}/10-ぎゃくむき.png` });

  console.log('\n▶ テスト4　ぜんぜんちがう場所に書くと教えてくれるか');
  await trace(await kvgToScreen([{ x: 95, y: 95 }, { x: 100, y: 100 }, { x: 105, y: 103 }]), 'pen');
  const v3 = await page.locator('.notice.bad').first().textContent();
  check('まちがいを教えてくれる', v3.length > 4, v3.trim().slice(0, 40));

  console.log('\n▶ テスト5　手のひら誤検知の防止（Apple Pencil 使用中は指を無視する）');
  const doneBefore = await page.evaluate(() => document.querySelectorAll('.strokedots span.done').length);
  // ペンを使った直後に、指で（=touch）正しい線をなぞってみる
  const ref3 = await page.evaluate(() => {
    const path = document.querySelector('.stroke-current');
    const len = path.getTotalLength();
    const out = [];
    for (let i = 0; i <= 20; i++) { const p = path.getPointAtLength((len * i) / 20); out.push({ x: p.x, y: p.y }); }
    return out;
  });
  await trace(await kvgToScreen(ref3), 'touch', 9);
  await page.waitForTimeout(300);
  const doneAfterTouch = await page.evaluate(() => document.querySelectorAll('.strokedots span.done').length);
  check('ペンの直後は、指の入力が無視される', doneAfterTouch === doneBefore,
    `${doneBefore}→${doneAfterTouch}画`);

  console.log('\n▶ テスト6　指だけでも書けるか（Apple Pencil を持っていない場合）');
  await page.waitForTimeout(1700);  // ペンの見張り時間（1.5秒）が過ぎるのを待つ
  await trace(await kvgToScreen(ref3), 'touch', 10);
  await page.waitForTimeout(300);
  const doneAfterWait = await page.evaluate(() => document.querySelectorAll('.strokedots span.done').length);
  check('しばらくすると指でも書ける', doneAfterWait > doneBefore, `${doneBefore}→${doneAfterWait}画`);

  console.log('\n▶ テスト7　1文字さいごまでなぞれるか');
  let guard = 0;
  for (;;) {
    if (guard++ > 40) break;
    const done = await page.locator('text=かけました！').count();
    if (done > 0) break;
    const cur = await page.locator('.stroke-current').count();
    if (cur === 0) break;
    const pts = await page.evaluate(() => {
      const path = document.querySelector('.stroke-current');
      const len = path.getTotalLength();
      const out = [];
      for (let i = 0; i <= 20; i++) { const p = path.getPointAtLength((len * i) / 20); out.push({ x: p.x, y: p.y }); }
      return out;
    });
    await trace(await kvgToScreen(pts), 'pen');
  }
  check('1文字をさいごまでなぞれる', (await page.locator('text=かけました！').count()) > 0,
    `${guard}回でかけた`);
  await page.screenshot({ path: `${SHOTS}/11-かけました.png` });

  console.log('\n▶ テスト8　3字おわると結果が出るか');
  for (let c = 0; c < 3; c++) {
    const next = page.getByRole('button', { name: /つぎの かんじ|おわる/ });
    if ((await next.count()) === 0) break;
    await next.click();
    await page.waitForTimeout(400);
    if ((await page.locator('text=なぞりがき おつかれさま').count()) > 0) break;
    // 次の字をぜんぶなぞる
    let g2 = 0;
    for (;;) {
      if (g2++ > 40) break;
      if ((await page.locator('text=かけました！').count()) > 0) break;
      if ((await page.locator('.stroke-current').count()) === 0) break;
      const pts = await page.evaluate(() => {
        const path = document.querySelector('.stroke-current');
        const len = path.getTotalLength();
        const out = [];
        for (let i = 0; i <= 20; i++) { const p = path.getPointAtLength((len * i) / 20); out.push({ x: p.x, y: p.y }); }
        return out;
      });
      await trace(await kvgToScreen(pts), 'pen');
      }
  }
  check('3字おわると結果画面になる',
    (await page.locator('text=なぞりがき おつかれさま').count()) > 0);
  await page.screenshot({ path: `${SHOTS}/12-なぞりがき結果.png` });

  console.log('\n▶ テスト9　記録が残るか');
  await page.getByRole('button', { name: 'ホームに もどる' }).click();
  await page.waitForSelector('h1');
  const homeText = await page.locator('body').textContent();
  check('「これまでに ◯字 なぞったよ」と出る', /これまでに \d+字 なぞったよ/.test(homeText),
    (homeText.match(/これまでに \d+字 なぞったよ/) ?? [''])[0]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('h1');
  check('再読みこみしても残っている',
    /これまでに \d+字 なぞったよ/.test(await page.locator('body').textContent()));

  console.log('\n▶ テスト10　読みの復習箱が動いていないこと（なぞり書きはテストではない）');
  const boxes = await page.evaluate(async () => {
    const req = indexedDB.open('kanken-5-6');
    const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    const get = (store) => new Promise((res, rej) => {
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return { progress: (await get('progress')).length, traces: (await get('traces')).length };
  });
  check('なぞり書きでは読みの記録が増えていない', boxes.progress === 0, `progress ${boxes.progress}件`);
  check('なぞり書きの記録だけが増えている', boxes.traces >= 3, `traces ${boxes.traces}件`);

  console.log('\n▶ テスト11　横向きにしても崩れないか');
  await page.getByRole('button', { name: /なぞりがきを する/ }).click();
  await page.waitForSelector('.tracebox');
  await page.setViewportSize({ width: 1080, height: 810 });  // iPad を横向きにした状態
  await page.waitForTimeout(400);
  const land = await page.evaluate(() => {
    const r = document.querySelector('.tracebox').getBoundingClientRect();
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  check('横向きでもマスが正方形', Math.abs(land.w - land.h) <= 2, `${land.w}×${land.h}px`);
  check('横向きでもマスが280px以上', land.w >= 280, `${land.w}px`);
  check('横向きでマスが画面からはみ出さない', land.bottom <= 810 + 1,
    `下端 ${land.bottom}px / 画面の高さ 810px`);
  check('横に はみ出していない', !land.overflowX);
  await page.screenshot({ path: `${SHOTS}/13-なぞりがき横向き.png` });
  await page.setViewportSize({ width: 810, height: 1080 });

  console.log('\n▶ テスト12　エラーが出ていないか');
  check('ブラウザのエラーがゼロ', errors.length === 0, errors.slice(0, 2).join(' / '));
} finally {
  await browser.close();
  stop();
}

console.log(`\n${'='.repeat(52)}`);
console.log(`合格 ${pass}件 / 不合格 ${fail}件`);
if (fail > 0) process.exitCode = 1;
else console.log('\x1b[32m\x1b[1mすべて合格しました。\x1b[0m');
