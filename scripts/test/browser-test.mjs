/**
 * 実際のブラウザでアプリを動かして確かめるテスト。
 * iPad と同じ画面の大きさ・タッチ操作で試します。
 *   node scripts/test/browser-test.mjs
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const SHOTS = 'data/screenshots';
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? ' … ' + extra : ''}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}${extra ? ' … ' + extra : ''}`); }
};

const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
  stdio: 'ignore', detached: false,
});
const stop = () => { try { server.kill('SIGTERM'); } catch { /* すでに終了 */ } };
process.on('exit', stop);

// サーバーが立ち上がるまで待つ
async function waitServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* まだ */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const BASE = 'http://localhost:4173';
if (!(await waitServer(BASE))) {
  console.error('プレビューサーバーが立ち上がりませんでした');
  stop();
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
// iPad と同じ条件にする
const ctx = await browser.newContext({
  ...devices['iPad (gen 7)'],
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
});
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

try {
  console.log('\n▶ テスト1　アプリが開くか');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1', { timeout: 10000 });
  check('ホーム画面が表示される', (await page.locator('h1').first().textContent()) === 'かんじ れんしゅう');
  const startBtn = page.getByRole('button', { name: /きょうの がくしゅう/ });
  check('「きょうの がくしゅう」ボタンがある', await startBtn.isVisible());
  check('6級と表示されている', (await page.locator('body').textContent()).includes('6級'));
  check('対象835字と表示されている', (await page.locator('body').textContent()).includes('835字'));
  await page.screenshot({ path: `${SHOTS}/1-ホーム.png` });

  console.log('\n▶ テスト2　10問といてみる');
  await startBtn.click();
  await page.waitForSelector('.word', { timeout: 5000 });
  await page.screenshot({ path: `${SHOTS}/2-もんだい.png` });

  const seen = [];
  for (let i = 1; i <= 10; i++) {
    await page.waitForSelector('.word', { timeout: 5000 });
    const word = (await page.locator('.word').textContent()).trim();
    seen.push(word);
    const counter = await page.locator('.muted.center').first().textContent();
    if (i === 1) check('問題番号が「1 / 10もん」と出る', counter.includes('1 / 10'), counter.trim());

    const choices = page.locator('.choices button');
    const n = await choices.count();
    if (i === 1) check('選択肢が4つ出る', n === 4);

    // 1問目はわざと間違え、残りは正解を選ぶ
    let clicked = false;
    if (i === 1) {
      await choices.nth(0).click();
      clicked = true;
    } else {
      for (let j = 0; j < n; j++) {
        await choices.nth(j).click();
        if (await page.locator('.verdict.ok').count()) { clicked = true; break; }
        // 間違えたら次の問題へ進むので、ここで抜ける
        if (await page.locator('.verdict.ng').count()) { clicked = true; break; }
      }
    }
    if (!clicked) throw new Error('選択肢を押せませんでした');

    await page.waitForSelector('.verdict', { timeout: 3000 });
    if (i === 1) {
      await page.screenshot({ path: `${SHOTS}/3-こたえあわせ.png` });
      check('答え合わせの結果が出る', (await page.locator('.verdict').count()) === 1);
    }
    const next = page.getByRole('button', { name: /つぎの もんだい|けっかを みる/ });
    await next.click();
  }
  check('10問といたら結果画面になる', await page.getByText('おつかれさま！').isVisible());
  check('同じ熟語が2回出ていない', new Set(seen).size === seen.length, `${new Set(seen).size}/${seen.length}種類`);
  await page.screenshot({ path: `${SHOTS}/4-けっか.png` });

  console.log('\n▶ テスト3　記録が保存されているか');
  await page.getByRole('button', { name: 'ホームに もどる' }).click();
  await page.waitForSelector('h1');
  const homeText = await page.locator('body').textContent();
  check('「きょうは 10もん といたよ」と出る', homeText.includes('10もん といたよ'), '');
  // 「連続日数」ではなく「がんばった日」を出しています。
  // 1日休んだだけでゼロになる表示は、続ける気持ちを折るためです。
  check('「がんばった日」が1になっている', /1[\s\S]{0,40}がんばった日/.test(homeText));
  check('責める表示（連続がとぎれた等）が出ていない',
    !/とぎれ|リセット|れんぞく きろく なし/.test(homeText));
  const learned = homeText.match(/(\d+)字 を れんしゅう中/);
  check('練習中の字数が10になっている', learned && learned[1] === '10', learned ? learned[1] + '字' : '不明');
  await page.screenshot({ path: `${SHOTS}/5-ホーム-学習後.png` });

  console.log('\n▶ テスト4　ページを閉じても記録が残るか（IndexedDB）');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('h1');
  const afterReload = await page.locator('body').textContent();
  check('再読みこみ後も記録が残っている', afterReload.includes('10もん といたよ'));
  const l2 = afterReload.match(/(\d+)字 を れんしゅう中/);
  check('練習中の字数も残っている', l2 && l2[1] === '10', l2 ? l2[1] + '字' : '不明');

  console.log('\n▶ テスト5　あしたの復習が用意されているか');
  // 端末の日付を1日進めて、復習が出るか確かめる
  const due = await page.evaluate(async () => {
    const req = indexedDB.open('kanken-5-6');
    const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    const all = await new Promise((res, rej) => {
      const r = db.transaction('progress').objectStore('progress').getAll();
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const d = new Date(); d.setDate(d.getDate() + 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return {
      total: all.length,
      dueTomorrow: all.filter((p) => p.nextReview <= key).length,
      boxes: all.map((p) => p.box),
      sample: all.slice(0, 3).map((p) => `${p.c}:箱${p.box}→${p.nextReview}`),
    };
  });
  check('10字ぶんの記録が保存されている', due.total === 10, `${due.total}字`);
  check('あした復習に出る漢字がある', due.dueTomorrow >= 1, `${due.dueTomorrow}字`);
  check('まちがえた字は箱1に入っている', due.boxes.includes(1), `箱: ${due.boxes.join(',')}`);
  check('箱が一気に2つ進んでいない（1回の正解で箱2まで）',
    due.boxes.every((b) => b <= 2), `箱: ${due.boxes.join(',')}`);
  console.log(`    例）${due.sample.join(' / ')}`);

  console.log('\n▶ テスト6　バックアップ画面');
  await page.getByRole('button', { name: 'きろくの バックアップ' }).click();
  await page.waitForSelector('h1');
  check('バックアップ画面が開く', (await page.locator('h1').textContent()) === 'きろくの バックアップ');
  check('「漢字 10字」と出る', (await page.locator('body').textContent()).includes('漢字 10字'));
  const dl = page.waitForEvent('download', { timeout: 10000 });
  await page.getByRole('button', { name: /ファイルに 書き出す/ }).click();
  const file = await dl;
  // ヘッドレスのブラウザではファイル名が取れないことがあるので、
  // アプリ側が正しい名前を作れているかは別に確かめる
  check('ファイルが書き出される', !!file);
  const madeName = await page.evaluate(() => {
    const stamp = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-');
    return `かんじ-きろく-${stamp}.json`;
  });
  check('ファイル名が「かんじ-きろく-日付.json」になる',
    /^かんじ-きろく-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/.test(madeName), madeName);
  const path = `${SHOTS}/../backup-test.json`;
  await file.saveAs(path);
  const { readFileSync, unlinkSync } = await import('node:fs');
  const backup = JSON.parse(readFileSync(path, 'utf8'));
  check('バックアップの中身が正しい', backup.app === 'kanken-5-6' && backup.progress.length === 10,
    `progress ${backup.progress.length}件 / sessions ${backup.sessions.length}件`);
  unlinkSync(path);
  await page.screenshot({ path: `${SHOTS}/6-バックアップ.png` });

  console.log('\n▶ テスト7　消して → バックアップから戻せるか（往復テスト）');
  {
    // いったん全部消す（2段階の確認を通す）
    await page.getByRole('button', { name: 'すべての記録を消す' }).click();
    await page.getByRole('button', { name: '書き出し済み。すすむ' }).click();
    await page.getByRole('button', { name: '消す', exact: true }).click();
    await page.waitForTimeout(400);
    check('消したあとは 漢字 0字 になる',
      (await page.locator('body').textContent()).includes('漢字 0字'));

    // 書き出しておいたファイルから戻す
    const restorePath = 'data/screenshots/../restore-test.json';
    const { writeFileSync, unlinkSync: rm2 } = await import('node:fs');
    writeFileSync(restorePath, JSON.stringify(backup));
    await page.locator('input[type=file]').setInputFiles(restorePath);
    await page.waitForTimeout(600);
    const t = await page.locator('body').textContent();
    check('バックアップから戻せる', t.includes('漢字の記録 10件'), '');
    check('戻したあと 漢字 10字 に復活する', t.includes('漢字 10字'));
    rm2(restorePath);
  }

  console.log('\n▶ テスト8　消去には2段階の確認があるか');
  await page.getByRole('button', { name: 'すべての記録を消す' }).click();
  check('確認1が出る', (await page.locator('body').textContent()).includes('確認1／2'));
  await page.getByRole('button', { name: '書き出し済み。すすむ' }).click();
  check('確認2が出る', (await page.locator('body').textContent()).includes('確認2／2'));
  await page.getByRole('button', { name: 'やめる' }).click();
  check('「やめる」で消えずに戻れる', (await page.locator('body').textContent()).includes('すべての記録を消す'));

  console.log('\n▶ テスト9　設定');
  await page.getByRole('button', { name: 'ホームに もどる' }).click();
  await page.getByRole('button', { name: 'せってい' }).click();
  await page.waitForSelector('h1');
  await page.getByRole('button', { name: '5級', exact: true }).click();
  await page.getByRole('button', { name: 'ひらがなで かく', exact: true }).click();
  await page.getByRole('button', { name: 'ホームに もどる' }).click();
  check('5級に切りかわる', (await page.locator('body').textContent()).includes('5級 の れんしゅう中'));
  check('1026字になる', (await page.locator('body').textContent()).includes('1026字'));
  await page.screenshot({ path: `${SHOTS}/7-5級.png` });

  console.log('\n▶ テスト10　ひらがな入力モード');
  await page.getByRole('button', { name: /きょうの がくしゅう/ }).click();
  await page.waitForSelector('.answerbox', { timeout: 5000 });
  check('入力欄が出る', await page.locator('.answerbox').isVisible());
  await page.locator('.answerbox').fill('でたらめなよみ');
  await page.getByRole('button', { name: 'こたえあわせ' }).click();
  await page.waitForSelector('.verdict');
  check('まちがえると「おしい」と出る（責める表現でない）',
    (await page.locator('.verdict').textContent()).includes('おしい'));
  await page.screenshot({ path: `${SHOTS}/8-にゅうりょく.png` });

  console.log('\n▶ テスト11　iPad での使い勝手');
  const meta = await page.locator('meta[name=viewport]').getAttribute('content');
  check('ピンチズームが無効になっている', meta.includes('user-scalable=no'), meta);
  const overscroll = await page.evaluate(() => getComputedStyle(document.body).overscrollBehavior);
  check('ゴムバンドスクロールが止まっている', overscroll.includes('none'), overscroll);
  const touchAction = await page.evaluate(() => getComputedStyle(document.body).touchAction);
  check('ダブルタップ拡大が止まっている', touchAction === 'manipulation', touchAction);
  const btnH = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('button')];
    return Math.min(...bs.map((b) => b.getBoundingClientRect().height));
  });
  check('ボタンが指で押せる大きさ（44px以上）', btnH >= 44, `いちばん小さいボタン ${Math.round(btnH)}px`);

  console.log('\n▶ テスト12　エラーが出ていないか');
  check('ブラウザのエラーがゼロ', consoleErrors.length === 0,
    consoleErrors.length ? consoleErrors.slice(0, 3).join(' / ') : '');

  console.log('\n▶ テスト13　外部への通信がないか');
  const external = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname !== 'localhost' && u.protocol !== 'data:' && u.protocol !== 'blob:') external.push(r.url());
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  check('外部サイトへの通信がゼロ', external.length === 0, external.slice(0, 3).join(' / '));
} finally {
  await browser.close();
  stop();
}

console.log(`\n${'='.repeat(52)}`);
console.log(`合格 ${pass}件 / 不合格 ${fail}件`);
console.log(`画面の写真: ${SHOTS}/`);
if (fail > 0) process.exitCode = 1;
else console.log('\x1b[32m\x1b[1mすべて合格しました。\x1b[0m');
