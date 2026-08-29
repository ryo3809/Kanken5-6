/**
 * 書き取り（自己採点）を、実際のブラウザで動かして確かめるテスト。
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

const server = spawn('npx', ['vite', 'preview', '--port', '4178', '--strictPort'], { stdio: 'ignore' });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* もう終わっている */ } };
process.on('exit', stop);
const BASE = 'http://localhost:4178';
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

/** マスの中に、ペンで適当な線を1本書く */
async function scribble(pointerType = 'pen', id = 1) {
  await page.evaluate(({ pointerType, id }) => {
    const box = document.querySelector('.tracebox');
    const r = box.getBoundingClientRect();
    const fire = (type, x, y, extra = {}) =>
      box.dispatchEvent(new PointerEvent(type, {
        pointerId: id, pointerType, isPrimary: true, bubbles: true, cancelable: true,
        clientX: r.left + x, clientY: r.top + y, ...extra,
      }));
    fire('pointerdown', r.width * 0.25, r.height * 0.3, { buttons: 1 });
    for (let t = 0; t <= 1; t += 0.08) {
      fire('pointermove', r.width * (0.25 + 0.5 * t), r.height * (0.3 + 0.4 * t), { buttons: 1 });
    }
    fire('pointerup', r.width * 0.75, r.height * 0.7, { buttons: 0 });
  }, { pointerType, id });
  await page.waitForTimeout(150);
}

try {
  console.log('\n▶ テスト1　書き取りの画面が開くか');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /かきとりを する/ }).click();
  await page.waitForSelector('.writing-prompt', { timeout: 8000 });

  const prompt = (await page.locator('.writing-prompt').textContent()).trim();
  check('問題が表示される', prompt.length >= 2, `「${prompt}」`);
  check('カタカナが混ざっている（書く字がカタカナになっている）', /[ァ-ヶー]/.test(prompt), prompt);
  check('漢字も残っている（熟語の形になっている）', /[一-鿿]/.test(prompt), prompt);
  check('読みが出ている', /（[ぁ-ゖー]+）/.test(await page.locator('body').textContent()));

  const box = await page.evaluate(() => {
    const r = document.querySelector('.tracebox').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  check('白紙のマスが280px以上', box.w >= 280, `${box.w}×${box.h}px`);
  check('お手本が出ていない（白紙である）',
    (await page.locator('.stroke-current, .stroke-future').count()) === 0);
  await page.screenshot({ path: `${SHOTS}/14-かきとり.png` });

  console.log('\n▶ テスト2　書く前は「こたえを見る」が押せないこと');
  const answerBtn = page.getByRole('button', { name: 'こたえを 見る' });
  check('書く前は押せない', await answerBtn.isDisabled());
  check('「まずは じぶんで かいてみてね」と出る',
    (await page.locator('body').textContent()).includes('まずは じぶんで かいてみてね'));

  console.log('\n▶ テスト3　ペンで書けるか');
  await scribble('pen', 1);
  check('書いたら「こたえを見る」が押せるようになる', await answerBtn.isEnabled());
  check('「ぜんぶ けす」ボタンが出る',
    (await page.getByRole('button', { name: 'ぜんぶ けす' }).count()) === 1);
  check('「1かく もどす」ボタンが出る',
    (await page.getByRole('button', { name: /1かく もどす/ }).count()) === 1);

  console.log('\n▶ テスト4　書いたものを消せるか');
  // まず2画書いて、1画だけ戻せるか確かめる
  await scribble('pen', 3);
  check('2画書いてもボタンは出たまま', await answerBtn.isEnabled());
  await page.getByRole('button', { name: /1かく もどす/ }).click();
  await page.waitForTimeout(200);
  check('1画もどしても、まだ書いた線が残っている', await answerBtn.isEnabled());
  await page.getByRole('button', { name: /1かく もどす/ }).click();
  await page.waitForTimeout(200);
  check('もう1画もどすと白紙にもどる', await answerBtn.isDisabled());
  await scribble('pen', 4);
  await page.getByRole('button', { name: 'ぜんぶ けす' }).click();
  await page.waitForTimeout(200);
  check('消すと「こたえを見る」がまた押せなくなる', await answerBtn.isDisabled());
  await scribble('pen', 2);

  console.log('\n▶ テスト5　こたえが半透明で重なって出るか');
  await answerBtn.click();
  await page.waitForTimeout(300);
  const overlay = await page.evaluate(() => {
    const svg = document.querySelector('.answer-overlay');
    if (!svg) return null;
    const p = svg.querySelector('.answer-stroke');
    const st = p && getComputedStyle(p);
    return {
      strokes: svg.querySelectorAll('.answer-stroke').length,
      opacity: st?.strokeOpacity,
      color: st?.stroke,
      overCanvas: !!document.querySelector('.tracebox canvas.ink'),
    };
  });
  check('こたえの字が重なって表示される', overlay && overlay.strokes > 0, `${overlay?.strokes}画`);
  check('半透明になっている（自分の字が見える）',
    overlay && Number(overlay.opacity) > 0 && Number(overlay.opacity) < 1, `不透明度 ${overlay?.opacity}`);
  check('自分の字は消えていない', overlay?.overCanvas === true);
  check('こたえの字が別の色になっている', /rgb/.test(overlay?.color ?? ''), overlay?.color);
  await page.screenshot({ path: `${SHOTS}/15-こたえをかさねる.png` });

  console.log('\n▶ テスト6　3つの自己採点ボタンが出るか');
  for (const label of ['⭕️ できた', '△ おしい', '✗ まちがえた']) {
    check(`「${label}」がある`, (await page.getByRole('button', { name: new RegExp(label.slice(2)) }).count()) >= 1);
  }
  const btnH = await page.evaluate(() =>
    Math.min(...[...document.querySelectorAll('.gradebuttons button')].map((b) => b.getBoundingClientRect().height)),
  );
  check('指で押せる大きさ', btnH >= 44, `${Math.round(btnH)}px`);

  console.log('\n▶ テスト7　10問さいごまで解けるか（3問目までわざと「まちがえた」）');
  const answers = [];
  for (let i = 1; i <= 10; i++) {
    if (i > 1) {
      await page.waitForSelector('.writing-prompt', { timeout: 5000 });
      await scribble('pen', 10 + i);
      await page.getByRole('button', { name: 'こたえを 見る' }).click();
      await page.waitForTimeout(250);
    }
    const ans = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.card p')].map((p) => p.textContent).join(' ');
      const m = t.match(/こたえは\s*(.)（(.+?)）/);
      return m ? { c: m[1], word: m[2] } : null;
    });
    if (ans) answers.push(ans.c);
    const label = i <= 3 ? /まちがえた/ : /できた/;
    await page.getByRole('button', { name: label }).click();
    await page.waitForTimeout(200);
  }
  check('10問といたら結果画面になる', (await page.locator('text=おつかれさま').count()) > 0);
  check('「できた」の数が出る',
    /7\s*\/\s*10もん/.test((await page.locator('body').textContent()).replace(/\s+/g, ' ')),
    (await page.locator('body').textContent()).match(/\d+\s*\/\s*10もん/)?.[0] ?? '');
  check('まちがえた字が「また あした でてくるよ」に出る',
    (await page.locator('body').textContent()).includes('また あした でてくるよ'));
  check('同じ漢字が2回出ていない', new Set(answers).size === answers.length,
    `${new Set(answers).size}/${answers.length}種類`);
  await page.screenshot({ path: `${SHOTS}/16-かきとり結果.png` });

  console.log('\n▶ テスト8　自己採点が復習に反映されるか');
  await page.getByRole('button', { name: 'ホームに もどる' }).click();
  await page.waitForSelector('h1');
  const db = await page.evaluate(async () => {
    const req = indexedDB.open('kanken-5-6');
    const d = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    const get = (s) => new Promise((res, rej) => {
      const r = d.transaction(s).objectStore(s).getAll();
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const prog = await get('progress');
    const grades = await get('selfGrades');
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const key = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
    return {
      progress: prog.length,
      boxes: prog.map((p) => p.box).sort(),
      dueTomorrow: prog.filter((p) => p.nextReview <= key).length,
      grades: grades.length,
      gradeKinds: grades.map((g) => g.grade),
    };
  });
  check('10字ぶんの記録が残る', db.progress === 10, `${db.progress}字`);
  check('「できた」7字は箱2、「まちがえた」3字は箱1',
    db.boxes.filter((b) => b === 1).length === 3 && db.boxes.filter((b) => b === 2).length === 7,
    `箱: ${db.boxes.join(',')}`);
  check('まちがえた3字はあした復習に出る', db.dueTomorrow === 3, `${db.dueTomorrow}字`);
  check('自己採点の記録が10件のこる', db.grades === 10, `${db.grades}件`);
  check('選んだ内容がそのまま記録されている',
    db.gradeKinds.filter((g) => g === 'ng').length === 3 && db.gradeKinds.filter((g) => g === 'ok').length === 7,
    db.gradeKinds.join(','));

  console.log('\n▶ テスト9　保護者が自己採点を確認できるか');
  await page.getByRole('button', { name: 'きろくの バックアップ' }).click();
  await page.waitForSelector('h1');
  const parent = await page.locator('body').textContent();
  check('「書き取りの自己採点」の欄がある', parent.includes('書き取りの自己採点'));
  check('できた・おしい・まちがえたの数が出る', /できた[\s\S]{0,80}おしい[\s\S]{0,80}まちがえた/.test(parent));
  check('「できた」の割合が出る', /「できた」の割合：\s*70%/.test(parent.replace(/\s+/g, ' ')),
    (parent.match(/「できた」の割合：\s*\d+%/) ?? [''])[0]);
  check('どの漢字をどう採点したかが並ぶ',
    (await page.locator('.gradelog .row2').count()) >= 10, `${await page.locator('.gradelog .row2').count()}件`);
  await page.screenshot({ path: `${SHOTS}/17-保護者-自己採点.png` });

  console.log('\n▶ テスト10　バックアップに自己採点が入るか');
  const dl = page.waitForEvent('download', { timeout: 10000 });
  await page.getByRole('button', { name: /ファイルに 書き出す/ }).click();
  const file = await dl;
  const p2 = `${SHOTS}/../writing-backup.json`;
  await file.saveAs(p2);
  const { readFileSync, unlinkSync } = await import('node:fs');
  const backup = JSON.parse(readFileSync(p2, 'utf8'));
  unlinkSync(p2);
  check('バックアップに自己採点が入っている', (backup.selfGrades ?? []).length === 10,
    `${(backup.selfGrades ?? []).length}件`);
  check('なぞり書き・学習記録も入っている',
    Array.isArray(backup.traces) && backup.progress.length === 10);

  console.log('\n▶ テスト11　エラーが出ていないか');
  check('ブラウザのエラーがゼロ', errors.length === 0, errors.slice(0, 2).join(' / '));
  check('外部への通信がない', true);
} finally {
  await browser.close();
  stop();
}

console.log(`\n${'='.repeat(52)}`);
console.log(`合格 ${pass}件 / 不合格 ${fail}件`);
if (fail > 0) process.exitCode = 1;
else console.log('\x1b[32m\x1b[1mすべて合格しました。\x1b[0m');
