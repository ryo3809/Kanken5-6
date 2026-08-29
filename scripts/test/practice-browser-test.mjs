/**
 * 分野べつれんしゅうと、5級へすすむ画面を、実際のブラウザで確かめるテスト。
 *   node scripts/test/practice-browser-test.mjs
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

const server = spawn('npx', ['vite', 'preview', '--port', '4181', '--strictPort'], { stdio: 'ignore' });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* もう終わっている */ } };
process.on('exit', stop);
const BASE = 'http://localhost:4181';
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* まだ */ }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
// オフライン用のしくみは、このテストでは使わない（毎回まっさらな状態で試すため）
const ctx = await browser.newContext({
  ...devices['iPad (gen 7)'], locale: 'ja-JP', serviceWorkers: 'block',
});
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(BASE);
await page.waitForSelector('h1', { timeout: 8000 });

/** マスに線を1本ひく（手書きの問題用） */
async function draw(box, dx = 0) {
  const r = await box.boundingBox();
  await page.mouse.move(r.x + r.width * 0.3 + dx, r.y + r.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.7 + dx, r.y + r.height * 0.7, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);
}

// ══ 1. 分野をえらぶ画面 ═══════════════════════════════════
console.log('\n\x1b[1m1. 分野をえらぶ\x1b[0m');
await page.getByRole('button', { name: /ぶんやべつ れんしゅう/ }).click();
await page.waitForTimeout(400);
check('見出しが出る', (await page.locator('h1').textContent()) === 'ぶんやべつ れんしゅう');
const items = page.locator('.practiceitem');
check('6級は11の大問が ならぶ', (await items.count()) === 11, `${await items.count()}個`);
const listText = await page.locator('.practicelist').innerText();
check('本番の大問番号が出る', listText.includes('(一)') && listText.includes('(十一)'));
check('6級に誤字訂正は出ない', !listText.includes('誤字訂正'));
check('じかんせいげんが無いと書いてある',
  (await page.locator('.app').innerText()).includes('じかんせいげんは ありません'));

// 承認まちの分野は、押す前から分かるようにしてある
const notice = await page.locator('.notice').first().innerText();
check('承認まちの分野は、はじめから理由が出ている', notice.includes('いま だせません'));
check('だれの確認まちかが分かる', notice.includes('おうちの人'));
check('承認まちの分野は押せない',
  await page.getByRole('button', { name: /熟語の構成/ }).isDisabled());
check('承認まちだと ひと目で分かる印がある',
  (await page.locator('.practiceitem', { hasText: '熟語の構成' }).innerText()).includes('かくにん まち'));
await page.screenshot({ path: `${SHOTS}/practice-select.png`, fullPage: true });

// ══ 2. ひらがなで答える分野（漢字の読み） ═════════════════
console.log('\n\x1b[1m2. 漢字の読み（10問）\x1b[0m');
await page.getByRole('button', { name: /漢字の読み/ }).click();
await page.waitForSelector('.examprompt', { timeout: 5000 });
check('1問目が出る', (await page.locator('.examprompt').textContent()).length >= 2);
check('何問目か分かる', (await page.locator('.app').innerText()).includes('1 / 10もん'));

// わざと1問だけ まちがえる
await page.locator('.answerbox').fill('あ');
await page.getByRole('button', { name: 'こたえあわせ' }).click();
await page.waitForTimeout(250);
const wrongText = await page.locator('.card').last().innerText();
check('まちがえると 正解を見せる', wrongText.includes('こたえは'));
check('責める言葉を使っていない',
  !/だめ|わるい|ちがう!|バツ/.test(await page.locator('.app').innerText()));
await page.getByRole('button', { name: /つぎの もんだい/ }).click();
await page.waitForTimeout(200);

// のこり9問は 正解する
for (let i = 2; i <= 10; i++) {
  await page.waitForSelector('.examprompt', { timeout: 5000 });
  // 正解は画面に出ていないので、ここでは
  // 「10問を最後まで進められること」だけを確かめる
  await page.locator('.answerbox').fill('あ');
  await page.getByRole('button', { name: 'こたえあわせ' }).click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: /つぎの もんだい|けっかを みる/ }).click();
  await page.waitForTimeout(150);
}
await page.waitForTimeout(400);
const resultText = await page.locator('.app').innerText();
check('けっかが出る', /\d+ \/ 10 もん/.test(resultText), resultText.split('\n').slice(0, 4).join(' / '));
check('できなかった字を もういちど見せる', resultText.includes('もういちど 見ておきたい字'));
check('点数や順位は出さない', !resultText.includes('点') && !resultText.includes('順位'));
await page.screenshot({ path: `${SHOTS}/practice-result.png`, fullPage: true });

// ══ 3. えらぶ分野（部首） ═════════════════════════════════
console.log('\n\x1b[1m3. えらぶ問題（部首）\x1b[0m');
await page.getByRole('button', { name: /べつの ぶんやを やる/ }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /部首名と部首/ }).click();
await page.waitForSelector('.choices button', { timeout: 5000 });
check('えらぶボタンが出る', (await page.locator('.choices button').count()) >= 4);
await page.locator('.choices button').first().click();
await page.waitForTimeout(250);
check('その場で 答え合わせされる', (await page.locator('.verdict').count()) === 1);
check('正解のボタンに 印がつく', (await page.locator('.choices button.correct').count()) === 1);
check('答え合わせのあとは 押せなくなる',
  await page.locator('.choices button').first().isDisabled());
await page.getByRole('button', { name: /つぎの もんだい/ }).click();
await page.waitForTimeout(250);
check('2問目にすすむ', (await page.locator('.app').innerText()).includes('2 / 10もん'));

// とちゅうでやめる
await page.getByRole('button', { name: 'とちゅうで やめる' }).click();
await page.waitForTimeout(200);
check('とちゅうでやめるときは 確認がある',
  (await page.locator('.app').innerText()).includes('やめてもいい？'));
await page.getByRole('button', { name: 'つづける' }).click();
await page.waitForTimeout(200);
check('「つづける」で もどれる', (await page.locator('.choices button').count()) >= 4);

// ══ 4. 手で書く分野（書取） ═══════════════════════════════
console.log('\n\x1b[1m4. 手で書く問題（書取）\x1b[0m');
await page.getByRole('button', { name: 'とちゅうで やめる' }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'やめる' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /べつの ぶんやを やる|ぶんやべつ れんしゅう/ }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /漢字の書取/ }).click();
await page.waitForSelector('.tracebox', { timeout: 6000 });
check('白いマスが出る', (await page.locator('.tracebox').count()) === 1);
check('書く前は「こたえを見る」が押せない',
  await page.getByRole('button', { name: 'こたえを 見る' }).isDisabled());
await draw(page.locator('.tracebox'));
await page.waitForTimeout(300);
check('書いたら「こたえを見る」が押せる',
  !(await page.getByRole('button', { name: 'こたえを 見る' }).isDisabled()));
await page.getByRole('button', { name: 'こたえを 見る' }).click();
await page.waitForTimeout(400);
check('おてほんが重なって出る', (await page.locator('.answer-overlay').count()) === 1);
check('自分で えらぶボタンが3つ出る', (await page.locator('.gradebuttons button').count()) === 3);
await page.screenshot({ path: `${SHOTS}/practice-write.png`, fullPage: true });
await page.getByRole('button', { name: /まちがえた/ }).click();
await page.waitForTimeout(300);
check('つぎの問題にすすむ', (await page.locator('.app').innerText()).includes('2 / 10もん'));

// ══ 5. きろくに のこるか ═════════════════════════════════
console.log('\n\x1b[1m5. きろくに のこるか\x1b[0m');
await page.getByRole('button', { name: 'とちゅうで やめる' }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'やめる' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /ホームに もどる/ }).click();
await page.waitForTimeout(500);
const home = await page.locator('.app').innerText();
check('きょう といた数が ホームに出る', /きょうは ここまでに \d+もん/.test(home),
  home.match(/きょうは ここまでに \d+もん/)?.[0] ?? '');

const saved = await page.evaluate(async () => {
  const db = await new Promise((res) => {
    const req = indexedDB.open('kanken-5-6');
    req.onsuccess = () => res(req.result);
  });
  const get = (store) => new Promise((res) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result);
  });
  return { sessions: await get('sessions'), grades: await get('selfGrades'), progress: await get('progress') };
});
check('れんしゅうが 学習の記録に のこる',
  saved.sessions.some((s) => s.mode === 'practice'), `${saved.sessions.length}件`);
check('手書きの自己採点が のこる', saved.grades.length >= 1, `${saved.grades.length}件`);
check('復習の箱は 動かさない（きょうの がくしゅう だけが動かす）',
  saved.progress.length === 0, `${saved.progress.length}件`);

// ══ 6. 5級にすすむ ═══════════════════════════════════════
console.log('\n\x1b[1m6. 5級にすすむ\x1b[0m');
// 模試で2回 合格ラインをこえた記録を入れる
await page.evaluate(async () => {
  const db = await new Promise((res) => {
    const req = indexedDB.open('kanken-5-6');
    req.onsuccess = () => res(req.result);
  });
  const mk = (date, at) => ({
    date, at, kyu: 6, score: 150, total: 160, fullTotal: 200, seconds: 2400, timedOut: false,
    sections: [{ no: '(一)', title: '漢字の読み', score: 8, points: 20 }],
  });
  const tx = db.transaction('exams', 'readwrite');
  tx.objectStore('exams').add(mk('2026-08-20', Date.now() - 86400000 * 2));
  tx.objectStore('exams').add(mk('2026-08-27', Date.now() - 86400000));
  await new Promise((res) => { tx.oncomplete = res; });
});
await page.reload();
await page.waitForSelector('h1', { timeout: 8000 });
check('合格ラインを2回こえると、ホームで5級をすすめる',
  (await page.locator('.app').innerText()).includes('5級を 見てみる'));
await page.getByRole('button', { name: /5級を 見てみる/ }).click();
await page.waitForTimeout(400);
const next = await page.locator('.app').innerText();
check('5級の画面が開く', (await page.locator('h1').textContent()) === '5級に すすむ');
check('何字ふえるかが分かる', next.includes('191字'));
check('四字熟語が出るようになると書いてある', next.includes('四字熟語'));
check('誤字訂正のことも書いてある', next.includes('誤字訂正'));
check('記録が消えないと はっきり書いてある', next.includes('きろくは きえません'));
check('6級にもどれると書いてある', next.includes('6級に もどれます'));
await page.screenshot({ path: `${SHOTS}/practice-nextkyu.png`, fullPage: true });

const before = await page.evaluate(async () => {
  const db = await new Promise((res) => {
    const req = indexedDB.open('kanken-5-6');
    req.onsuccess = () => res(req.result);
  });
  const r = await new Promise((res) => {
    const x = db.transaction('sessions').objectStore('sessions').getAll();
    x.onsuccess = () => res(x.result);
  });
  return r.length;
});
await page.getByRole('button', { name: '5級に すすむ' }).click();
await page.waitForTimeout(600);
const after = await page.evaluate(async () => {
  const db = await new Promise((res) => {
    const req = indexedDB.open('kanken-5-6');
    req.onsuccess = () => res(req.result);
  });
  const r = await new Promise((res) => {
    const x = db.transaction('sessions').objectStore('sessions').getAll();
    x.onsuccess = () => res(x.result);
  });
  return r.length;
});
check('級を変えても きろくは 消えない', before === after && after > 0, `${before} → ${after}`);
check('ホームが5級になる', (await page.locator('.app').innerText()).includes('5級 の れんしゅう中'));

await page.getByRole('button', { name: /ぶんやべつ れんしゅう/ }).click();
await page.waitForTimeout(400);
const list5 = await page.locator('.practicelist').innerText();
check('5級は12の分野になる', (await page.locator('.practiceitem').count()) === 12);
check('誤字訂正が くわわる', list5.includes('誤字訂正'));
check('本番とちがうことを ことわっている', list5.includes('ことばだけで れんしゅうします'));
check('四字熟語が くわわる', list5.includes('四字熟語'));

await page.getByRole('button', { name: /誤字訂正/ }).click();
await page.waitForSelector('.tracebox', { timeout: 6000 });
const goji = await page.locator('.app').innerText();
check('誤字訂正の問題が出る', goji.includes('読みたいのに'));
check('まちがった漢字を なおす指示が出る', goji.includes('正しい漢字を 書きなさい'));

check('画面のエラーは出ていない', errors.length === 0, errors.slice(0, 2).join(' / '));

await browser.close();
stop();
console.log(`\n  合計 ${pass + fail}件： \x1b[32m${pass}件合格\x1b[0m / ${fail > 0 ? `\x1b[31m${fail}件失敗\x1b[0m` : '0件失敗'}\n`);
process.exit(fail > 0 ? 1 : 0);
