/**
 * 模擬試験を、実際のブラウザで最後まで通して確かめるテスト。
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

const server = spawn('npx', ['vite', 'preview', '--port', '4184', '--strictPort'], { stdio: 'ignore' });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* もう終わっている */ } };
process.on('exit', stop);
const BASE = 'http://localhost:4184';
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

/** マスに1本 線をひく */
async function scribble(id = 1) {
  await page.evaluate((id) => {
    const box = document.querySelector('.tracebox');
    if (!box) return;
    const r = box.getBoundingClientRect();
    const fire = (t, x, y, ex = {}) => box.dispatchEvent(new PointerEvent(t, {
      pointerId: id, pointerType: 'pen', isPrimary: true, bubbles: true, cancelable: true,
      clientX: r.left + x, clientY: r.top + y, ...ex,
    }));
    fire('pointerdown', r.width * 0.3, r.height * 0.3, { buttons: 1 });
    for (let t = 0; t <= 1; t += 0.1) fire('pointermove', r.width * (0.3 + 0.4 * t), r.height * (0.3 + 0.4 * t), { buttons: 1 });
    fire('pointerup', r.width * 0.7, r.height * 0.7, { buttons: 0 });
  }, id);
  await page.waitForTimeout(60);
}

try {
  console.log('\n▶ テスト1　模試のはじめの画面');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /もぎしけんを する/ }).click();
  await page.waitForSelector('h1', { timeout: 8000 });
  check('もぎしけんの画面がひらく', (await page.locator('h1').textContent()) === 'もぎしけん');
  const intro = await page.locator('body').textContent();
  const m = intro.match(/(\d+)点満点/);
  check('いまの満点が出る', !!m, m ? m[0] : '');
  check('160点以上ある', m && Number(m[1]) >= 160, m?.[1] + '点');
  check('制限時間60分と出る', /60分/.test(intro));
  check('合格ラインが出る', /合格ラインは \d+点/.test(intro), (intro.match(/合格ラインは \d+点/) ?? [''])[0]);
  const secCount = await page.locator('.secbar').count();
  check('大問のならびが出る', secCount >= 8, `${secCount}個`);
  const skipped = /いま 出せない 大問/.test(intro);
  check('確認まちの大問が知らされる', skipped, skipped ? '(五)(七) が確認まち' : '（すべて出せる）');
  await page.screenshot({ path: `${SHOTS}/24-もぎしけん-はじめ.png` });

  console.log('\n▶ テスト2　受験できるか');
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.waitForSelector('.examtop', { timeout: 8000 });
  check('のこり時間が出る', /のこり\s*\d+:\d\d/.test(await page.locator('.timer').textContent()),
    (await page.locator('.timer').textContent()).trim());
  const head = await page.locator('body').textContent();
  check('何問目か出る', /\d+ \/ \d+もん/.test(head), (head.match(/\d+ \/ \d+もん/) ?? [''])[0]);
  const total = Number((head.match(/\d+ \/ (\d+)もん/) ?? [])[1]);
  check('問題数が90問以上', total >= 90, `${total}問`);
  await page.screenshot({ path: `${SHOTS}/25-もぎしけん-といている.png` });

  console.log('\n▶ テスト3　すべての問題を最後まで解く');
  const kinds = { choice: 0, text: 0, write: 0 };
  for (let i = 0; i < total; i++) {
    const has = await page.evaluate(() => ({
      choice: document.querySelectorAll('.choices button').length,
      text: !!document.querySelector('.answerbox'),
      write: !!document.querySelector('.tracebox'),
    }));
    if (has.choice > 0) {
      kinds.choice++;
      await page.locator('.choices button').first().click();
    } else if (has.text) {
      kinds.text++;
      await page.locator('.answerbox').fill('てすと');
    } else if (has.write) {
      kinds.write++;
      await scribble(100 + i);
    }
    const next = page.getByRole('button', { name: /つぎ →|ぜんぶ おわり/ });
    await next.click();
    await page.waitForTimeout(40);
  }
  console.log(`    えらぶ ${kinds.choice}問 / 入力 ${kinds.text}問 / 手書き ${kinds.write}問`);
  check('3つの答え方がすべて出る', kinds.choice > 0 && kinds.text > 0 && kinds.write > 0);
  check('入力（読み）は20問', kinds.text === 20, `${kinds.text}問`);

  console.log('\n▶ テスト4　まるつけ');
  await page.waitForSelector('text=まるつけ', { timeout: 8000 });
  const gtext = await page.locator('body').textContent();
  check('まるつけ画面になる', /まるつけ\s+\d+ \/ \d+もん/.test(gtext),
    (gtext.match(/まるつけ\s+\d+ \/ \d+もん/) ?? [''])[0]);
  check('自分の字とお手本がならぶ', (await page.locator('.tracebox.small').count()) === 2);
  check('「かけていた」「ちがった」がある',
    (await page.getByRole('button', { name: /かけていた/ }).count()) === 1 &&
    (await page.getByRole('button', { name: /ちがった/ }).count()) === 1);
  await page.screenshot({ path: `${SHOTS}/26-もぎしけん-まるつけ.png` });

  const gradeTotal = Number((gtext.match(/まるつけ\s+\d+ \/ (\d+)もん/) ?? [])[1]);
  for (let i = 0; i < gradeTotal; i++) {
    // 半分は「かけていた」にする
    const btn = i % 2 === 0 ? /かけていた/ : /ちがった/;
    await page.getByRole('button', { name: btn }).click();
    await page.waitForTimeout(30);
  }

  console.log('\n▶ テスト5　結果');
  await page.waitForSelector('text=もぎしけん おつかれさま', { timeout: 8000 });
  const rtext = await page.locator('body').textContent();
  const score = rtext.match(/(\d+)\s*\/\s*(\d+)点/);
  check('点数が出る', !!score, score ? `${score[1]}/${score[2]}点` : '');
  check('合格ラインとの差が出る', /合格ライン（\d+点）/.test(rtext),
    (rtext.match(/合格ライン（\d+点）.{0,20}/) ?? [''])[0]);
  check('かかった時間が出る', /かかった時間 \d+分\d+秒/.test(rtext));
  check('大問ごとの点が出る', (await page.locator('.secbar').count()) >= 8,
    `${await page.locator('.secbar').count()}大問`);
  check('本番の満点との関係が説明される', /本番は 200点満点/.test(rtext) || score[2] === '200');
  check('しばまるが出る', (await page.locator('svg.shiba').count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/27-もぎしけん-けっか.png` });

  console.log('\n▶ テスト6　記録が残るか');
  const saved = await page.evaluate(async () => {
    const req = indexedDB.open('kanken-5-6');
    const d = await new Promise((res) => { req.onsuccess = () => res(req.result); });
    return new Promise((res) => {
      const r = d.transaction('exams').objectStore('exams').getAll();
      r.onsuccess = () => res(r.result);
    });
  });
  check('模試の結果が保存される', saved.length === 1, `${saved.length}件`);
  check('大問ごとの点も保存される', (saved[0]?.sections ?? []).length >= 8,
    `${saved[0]?.sections?.length}大問`);
  check('満点も記録される', saved[0]?.total >= 160 && saved[0]?.fullTotal === 200,
    `${saved[0]?.total}/${saved[0]?.fullTotal}点`);

  console.log('\n▶ テスト7　2回目でグラフが出るか');
  await page.getByRole('button', { name: 'もう1かい やる' }).click();
  await page.waitForSelector('text=はじめる', { timeout: 5000 });
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.waitForSelector('.examtop');
  // 数問だけ答えて途中でやめる
  for (let i = 0; i < 3; i++) {
    if ((await page.locator('.choices button').count()) > 0) await page.locator('.choices button').first().click();
    else if (await page.locator('.answerbox').count()) await page.locator('.answerbox').fill('あ');
    await page.getByRole('button', { name: /つぎ →/ }).click();
    await page.waitForTimeout(40);
  }
  await page.getByRole('button', { name: 'とちゅうで やめる' }).click();
  await page.getByRole('button', { name: 'やめる' }).click();
  await page.waitForTimeout(400);
  // まるつけがあれば飛ばす
  for (let i = 0; i < 60; i++) {
    if ((await page.getByRole('button', { name: /ちがった/ }).count()) === 0) break;
    await page.getByRole('button', { name: /ちがった/ }).click();
    await page.waitForTimeout(25);
  }
  await page.waitForSelector('text=もぎしけん おつかれさま', { timeout: 8000 });
  check('2回目の結果が出る', true);
  check('折れ線グラフが出る', (await page.locator('.chart svg').count()) === 1);
  check('グラフに合格ラインの線がある', (await page.locator('.chart-line-pass').count()) === 1);
  check('グラフに点が2つある', (await page.locator('.chart-dot').count()) === 2,
    `${await page.locator('.chart-dot').count()}点`);
  await page.screenshot({ path: `${SHOTS}/28-もぎしけん-グラフ.png` });

  console.log('\n▶ テスト8　ホームに反映されるか');
  await page.getByRole('button', { name: 'ホームに もどる' }).click();
  await page.waitForSelector('h1');
  const home = await page.locator('body').textContent();
  check('これまでの回数と最高点が出る', /これまで 2回　いちばん よかった点 \d+点/.test(home),
    (home.match(/これまで \d+回　いちばん よかった点 \d+点/) ?? [''])[0]);

  console.log('\n▶ テスト9　急かす演出がないか');
  check('点滅などの演出がない（時間表示だけ）',
    !/いそいで|はやく|のこりわずか|急/.test(home));
  check('ブラウザのエラーがゼロ', errors.length === 0, errors.slice(0, 2).join(' / '));
} finally {
  await browser.close();
  stop();
}

console.log(`\n${'='.repeat(52)}`);
console.log(`合格 ${pass}件 / 不合格 ${fail}件`);
if (fail > 0) process.exitCode = 1;
else console.log('\x1b[32m\x1b[1mすべて合格しました。\x1b[0m');
