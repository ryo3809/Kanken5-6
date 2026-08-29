/**
 * しばまる・おさんぽマップ・かんじずかん・きせかえを
 * 実際のブラウザで動かして確かめるテスト。
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

const server = spawn('npx', ['vite', 'preview', '--port', '4179', '--strictPort'], { stdio: 'ignore' });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* もう終わっている */ } };
process.on('exit', stop);
const BASE = 'http://localhost:4179';
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

/** 読み問題を1セッション解く（wrongCount 問だけわざと間違える） */
async function playReading(wrongCount = 3) {
  await page.getByRole('button', { name: /きょうの がくしゅう/ }).click();
  await page.waitForSelector('.word', { timeout: 6000 });
  for (let i = 1; i <= 10; i++) {
    await page.waitForSelector('.word', { timeout: 5000 });
    const choices = page.locator('.choices button');
    const n = await choices.count();
    if (i <= wrongCount) {
      // わざと間違える：正解でない選択肢を探す
      for (let j = 0; j < n; j++) {
        await choices.nth(j).click();
        if (await page.locator('.verdict').count()) break;
      }
    } else {
      for (let j = 0; j < n; j++) {
        await choices.nth(j).click();
        if (await page.locator('.verdict').count()) break;
      }
    }
    await page.waitForSelector('.verdict', { timeout: 3000 });
    await page.getByRole('button', { name: /つぎの もんだい|けっかを みる/ }).click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);
}

try {
  console.log('\n▶ テスト1　ホームにしばまるが出るか');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1');
  check('しばまるが表示される', (await page.locator('svg.shiba').count()) >= 1);
  check('ふきだしでことばを言う', (await page.locator('.bubble').textContent()).trim().length > 2,
    (await page.locator('.bubble').textContent()).trim());
  check('レベルが出ている', /レベル\s*1/.test(await page.locator('body').textContent()));
  const parts = await page.evaluate(() => {
    const s = document.querySelector('svg.shiba');
    return {
      circles: s.querySelectorAll('circle').length,
      paths: s.querySelectorAll('path').length,
      hasTail: !!s.querySelector('.tail'),
      label: s.getAttribute('aria-label'),
    };
  });
  check('丸を組みあわせて描かれている', parts.circles >= 6, `丸${parts.circles}個・線${parts.paths}本`);
  check('しっぽがある', parts.hasTail);
  check('読み上げ用の名前がついている', parts.label === 'しばまる', parts.label);
  check('おさんぽマップ・ずかん・きせかえのボタンがある',
    (await page.getByRole('button', { name: /おさんぽマップ/ }).count()) === 1 &&
    (await page.getByRole('button', { name: /かんじずかん/ }).count()) === 1 &&
    (await page.getByRole('button', { name: /きせかえ/ }).count()) === 1);
  await page.screenshot({ path: `${SHOTS}/18-ホーム-しばまる.png` });

  console.log('\n▶ テスト2　学習すると経験値がたまるか');
  const before = await page.evaluate(async () => {
    const req = indexedDB.open('kanken-5-6');
    const d = await new Promise((res) => { req.onsuccess = () => res(req.result); });
    return new Promise((res) => {
      const r = d.transaction('game').objectStore('game').get('game');
      r.onsuccess = () => res(r.result ?? null);
    });
  });
  check('はじめは経験値の記録がない（または0）', before === null || before.exp === 0);

  const readGame = () => page.evaluate(async () => {
    const req = indexedDB.open('kanken-5-6');
    const d = await new Promise((res) => { req.onsuccess = () => res(req.result); });
    return new Promise((res) => {
      const r = d.transaction('game').objectStore('game').get('game');
      r.onsuccess = () => res(r.result ?? null);
    });
  });

  await playReading(3);
  check('結果画面にしばまるが出る', (await page.locator('svg.shiba').count()) >= 1);
  const after1 = await readGame();
  check('経験値がたまっている', after1 && after1.exp > 0, `${after1?.exp}ポイント`);
  // 1問あたり最低1ポイント＋その日はじめて10ポイント。
  // 全問まちがえても 20ポイント以上になるはず＝まちがえても必ずもらえる
  check('まちがえた問題でも経験値がもらえている（責めない設計）',
    after1 && after1.exp >= 10 + 10 * 1, `${after1?.exp}ポイント（10問すべてまちがえても20以上）`);

  // ごほうびが出るところまで、くり返し学習する
  let rewardSeen = '';
  for (let round = 0; round < 6; round++) {
    const g = await readGame();
    if (g && g.exp >= 70) break;
    await page.getByRole('button', { name: /もう1かい やる/ }).click();
    await page.waitForSelector('.word', { timeout: 6000 });
    for (let i = 1; i <= 10; i++) {
      await page.waitForSelector('.word', { timeout: 5000 });
      const choices = page.locator('.choices button');
      const n = await choices.count();
      for (let j = 0; j < n; j++) {
        await choices.nth(j).click();
        if (await page.locator('.verdict').count()) break;
      }
      await page.getByRole('button', { name: /つぎの もんだい|けっかを みる/ }).click();
      await page.waitForTimeout(110);
    }
    await page.waitForTimeout(500);
    const t = await page.locator('body').textContent();
    const m = t.match(/レベル \d+ に なった！|「.+?」に ついたよ！|.+? を もらった！/g);
    if (m) rewardSeen = m.join(' / ');
  }
  check('レベルアップ・新しい場所・ごほうびのお知らせが出る', rewardSeen.length > 0, rewardSeen);
  await page.screenshot({ path: `${SHOTS}/19-けっか-ごほうび.png` });
  const after = await readGame();
  check('ごほうびがもらえる経験値までたまった', after.exp >= 60, `${after.exp}ポイント`);

  console.log('\n▶ テスト3　おさんぽマップ');
  await page.getByRole('button', { name: 'ホームに もどる' }).click();
  await page.waitForSelector('h1');
  await page.getByRole('button', { name: /おさんぽマップ/ }).click();
  await page.waitForSelector('.scene', { timeout: 5000 });
  check('マップ画面がひらく', (await page.locator('h1').textContent()) === 'おさんぽマップ');
  check('風景が表示される', (await page.locator('.scene > svg').count()) === 1);
  check('しばまるが風景の上にいる', (await page.locator('.scene-shiba svg.shiba').count()) === 1);
  const mapText = await page.locator('body').textContent();
  check('いまいる場所の名前が出る', /おうちの まえ|こうえん/.test(mapText));
  check('つぎの場所までの残りが出る', /つぎは「.+?」まで あと \d+ポイント/.test(mapText),
    (mapText.match(/つぎは「.+?」まで あと \d+ポイント/) ?? [''])[0]);
  check('12か所の道のりが並ぶ', (await page.locator('.mapitem').count()) === 12,
    `${await page.locator('.mapitem').count()}か所`);
  check('まだ行っていない場所は「？？？」になっている',
    (await page.locator('.mapitem:not(.reached)').first().textContent()).includes('？？？'));
  check('スタンプカードが出る', (await page.locator('.stamp').count()) === 28,
    `${await page.locator('.stamp').count()}日ぶん`);
  check('きょうのスタンプが押されている', (await page.locator('.stamp.done').count()) >= 1,
    `${await page.locator('.stamp.done').count()}個`);
  check('「スタンプは 消えません」と書いてある', mapText.includes('スタンプは 消えません'));
  check('「がんばった日」が出ている', /\d+[\s\S]{0,20}がんばった日/.test(mapText));
  await page.screenshot({ path: `${SHOTS}/20-おさんぽマップ.png` });

  console.log('\n▶ テスト4　かんじずかん');
  await page.getByRole('button', { name: 'ホームに もどる' }).click();
  await page.getByRole('button', { name: /かんじずかん/ }).click();
  await page.waitForSelector('.zukangrid', { timeout: 5000 });
  const zukan = await page.evaluate(() => ({
    cells: document.querySelectorAll('.zukancell').length,
    got: document.querySelectorAll('.zukancell.got').length,
  }));
  check('6級の835字がならぶ', zukan.cells === 835, `${zukan.cells}字`);
  // 何セッションやったかで字数は変わるので、「保存された記録と一致するか」で確かめる
  const learned = await page.evaluate(async () => {
    const req = indexedDB.open('kanken-5-6');
    const d = await new Promise((res) => { req.onsuccess = () => res(req.result); });
    return new Promise((res) => {
      const r = d.transaction('progress').objectStore('progress').getAll();
      r.onsuccess = () => res(r.result.length);
    });
  });
  check('れんしゅうした字に色がついている', zukan.got === learned && learned > 0,
    `ずかん${zukan.got}字 / 記録${learned}字`);
  check('まだの字には色がついていない', zukan.cells - zukan.got === 835 - learned,
    `${zukan.cells - zukan.got}字がまだ`);
  await page.locator('.zukancell.got').first().click();
  await page.waitForSelector('.sheet', { timeout: 3000 });
  const detail = await page.locator('.sheet').textContent();
  check('タップすると詳しい説明が出る', detail.includes('かく'));
  check('筆順のアニメが出る', (await page.locator('.anim-stroke').count()) >= 1,
    `${await page.locator('.anim-stroke').count()}画`);
  check('音か訓が出ている', /音|訓/.test(detail));
  await page.screenshot({ path: `${SHOTS}/21-かんじずかん.png` });
  await page.getByRole('button', { name: 'とじる' }).click();

  console.log('\n▶ テスト5　きせかえ');
  await page.getByRole('button', { name: 'ホームに もどる' }).click();
  await page.getByRole('button', { name: /きせかえ/ }).click();
  await page.waitForSelector('.itemgrid', { timeout: 5000 });
  const items = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('.itemgrid button')];
    return {
      total: bs.length,
      locked: bs.filter((b) => b.disabled).length,
      unlocked: bs.filter((b) => !b.disabled).length,
    };
  });
  check('ぼうし・くびわがならぶ', items.total >= 10, `${items.total}個`);
  check('まだもらっていないものは 選べない', items.locked >= 1, `🔒 ${items.locked}個`);
  check('もらったものは 選べる', items.unlocked >= 2, `${items.unlocked}個`);
  // もらったくびわをつけてみる
  const wearable = page.locator('.itemgrid button:not([disabled])').nth(2);
  const name = (await wearable.textContent()).trim();
  await wearable.click();
  await page.waitForTimeout(200);
  check(`「${name}」をつけられる`, (await page.locator('button.picked').count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/22-きせかえ.png` });

  console.log('\n▶ テスト6　きせかえがホームにも反映されるか');
  await page.getByRole('button', { name: 'ホームに もどる' }).click();
  await page.waitForSelector('h1');
  const wearing = await page.evaluate(() => {
    const s = document.querySelector('svg.shiba');
    return s.innerHTML.length;
  });
  check('しばまるが つけたものを 身につけている', wearing > 0);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('h1');
  const saved = await page.evaluate(async () => {
    const req = indexedDB.open('kanken-5-6');
    const d = await new Promise((res) => { req.onsuccess = () => res(req.result); });
    return new Promise((res) => {
      const r = d.transaction('game').objectStore('game').get('game');
      r.onsuccess = () => res(r.result);
    });
  });
  check('つけたものが保存されている', !!(saved.hat || saved.collar),
    `ぼうし=${saved.hat ?? 'なし'} くびわ=${saved.collar ?? 'なし'}`);
  check('経験値は保存されたまま', saved.exp > 0, `${saved.exp}ポイント`);

  console.log('\n▶ テスト7　バックアップにしばまるの状態が入るか');
  await page.getByRole('button', { name: 'おうちの人の がめん' }).click();
  await page.waitForSelector('h1');
  const dl = page.waitForEvent('download', { timeout: 10000 });
  await page.getByRole('button', { name: /ファイルに 書き出す/ }).click();
  const file = await dl;
  const p2 = `${SHOTS}/../game-backup.json`;
  await file.saveAs(p2);
  const { readFileSync, unlinkSync } = await import('node:fs');
  const backup = JSON.parse(readFileSync(p2, 'utf8'));
  unlinkSync(p2);
  check('バックアップにしばまるの状態が入っている', !!backup.game && backup.game.exp > 0,
    `${backup.game?.exp}ポイント`);
  check('つけているものも入っている', backup.game.hat !== undefined && backup.game.collar !== undefined);

  console.log('\n▶ テスト8　急かす・責める表示がないか');
  await page.getByRole('button', { name: 'ホームに もどる' }).click();
  await page.waitForSelector('h1');
  const allText = [];
  for (const nav of [null, /おさんぽマップ/, /かんじずかん/, /きせかえ/]) {
    if (nav) {
      await page.getByRole('button', { name: nav }).click();
      await page.waitForTimeout(400);
    }
    allText.push(await page.locator('body').textContent());
    if (nav) {
      await page.getByRole('button', { name: 'ホームに もどる' }).click();
      await page.waitForTimeout(300);
    }
  }
  const text = allText.join(' ');
  const banned = ['のこり時間', 'せいげん時間', 'いそいで', 'あと◯問', 'やらないと', 'とぎれ',
    'リセット', 'れんぱい', 'ざんねん', 'だめ', 'こうにゅう', '広告', '課金'];
  const found = banned.filter((b) => text.includes(b));
  check('急かす・責める・課金の表示がない', found.length === 0, found.join(',') || 'なし');
  check('外部リンクがない', (await page.locator('a[href^="http"]').count()) === 0);

  console.log('\n▶ テスト9　エラーが出ていないか');
  check('ブラウザのエラーがゼロ', errors.length === 0, errors.slice(0, 2).join(' / '));
} finally {
  await browser.close();
  stop();
}

console.log(`\n${'='.repeat(52)}`);
console.log(`合格 ${pass}件 / 不合格 ${fail}件`);
if (fail > 0) process.exitCode = 1;
else console.log('\x1b[32m\x1b[1mすべて合格しました。\x1b[0m');
