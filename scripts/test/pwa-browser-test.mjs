/**
 * 「ホーム画面に追加」と「電波がなくても使える」を、実際のブラウザで確かめるテスト。
 *   node scripts/test/pwa-browser-test.mjs
 *
 * ここが動かないと、iPad が7日で学習記録を消してしまいます。
 * このアプリでいちばん大事なテストのひとつです。
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';

const SHOTS = 'data/screenshots';
mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const check = (n, ok, extra = '') => {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ' … ' + extra : ''}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}${extra ? ' … ' + extra : ''}`); }
};

const server = spawn('npx', ['vite', 'preview', '--port', '4180', '--strictPort'], { stdio: 'ignore' });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* もう終わっている */ } };
process.on('exit', stop);
const BASE = 'http://localhost:4180';
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* まだ */ }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

// ══ 1. ホーム画面に追加するための設定ファイル ═══════════════
console.log('\n\x1b[1m1. ホーム画面に追加するための設定\x1b[0m');
{
  const res = await fetch(`${BASE}/manifest.webmanifest`);
  check('manifest.webmanifest が置かれている', res.ok, `HTTP ${res.status}`);
  const m = await res.json();
  check('アプリの名前が入っている', typeof m.name === 'string' && m.name.includes('漢検'), m.name);
  check('アプリとして開く設定になっている', m.display === 'standalone', m.display);
  check('入り口のページが指定されている', m.start_url === './', m.start_url);
  check('アイコンが3つ登録されている', Array.isArray(m.icons) && m.icons.length === 3);
  check('まるく切りぬかれる端末むけのアイコンがある',
    m.icons.some((i) => String(i.purpose).includes('maskable')));

  for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
    const r = await fetch(`${BASE}/${file}`);
    const buf = Buffer.from(await r.arrayBuffer());
    // PNG の先頭8バイトは決まっている。そのあと 16〜24バイト目に縦横の大きさが入る
    const isPng = buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    check(`${file} が正しいPNGで ${size}×${size}`, r.ok && isPng && w === size && h === size, `${w}×${h}`);
  }

  const html = await (await fetch(BASE)).text();
  check('ページから manifest が読まれている', html.includes('rel="manifest"'));
  check('iPad 用のアイコンが指定されている', html.includes('apple-touch-icon.png'));
  check('外部のサイトを読みこんでいない', !/(src|href)="https?:\/\//.test(html));
}

// ══ 2. オフライン用のしくみ（サービスワーカー）の中身 ═══════
console.log('\n\x1b[1m2. オフライン用のしくみの中身\x1b[0m');
{
  const sw = await (await fetch(`${BASE}/sw.js`)).text();
  check('sw.js が置かれている', sw.length > 500, `${sw.length}文字`);
  check('自分のサイト以外には手を出さない作りになっている',
    sw.includes('url.origin !== self.location.origin'));
  check('外部のURLがひとつも書かれていない', !/https?:\/\/(?!www\.w3\.org)/.test(sw));
  check('筆順のデータもためこむ', sw.includes('./strokes/grade-6.json'));
  check('版番号が差しこまれている', !sw.includes('__VERSION__') && !sw.includes('__PRECACHE__'));
  check('勝手に切りかわらない（画面から言われたときだけ）',
    sw.includes("event.data.type === 'SKIP_WAITING'") && !/^\s*self\.skipWaiting\(\);\s*$/m.test(sw));

  const headers = readFileSync('dist/_headers', 'utf8');
  check('外部への通信をブラウザ側でも禁止している',
    headers.includes("connect-src 'self'") && headers.includes("default-src 'self'"));
  check('他のサイトに埋めこめないようにしている', headers.includes('frame-ancestors'));
}

// ══ 3. 電波がなくても開けるか ═══════════════════════════════
console.log('\n\x1b[1m3. 電波がなくても開けるか\x1b[0m');
{
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], locale: 'ja-JP' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(BASE);
  await page.waitForSelector('h1', { timeout: 8000 });

  // ためこみが終わるまで待つ
  const ready = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    for (let i = 0; i < 60 && !navigator.serviceWorker.controller; i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    return !!reg.active;
  });
  check('オフライン用のしくみが動きだした', ready);

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((n) => n.startsWith('kanken-')));
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  check('アプリ本体がためこまれた', cached.some((p) => p.endsWith('.js')), `${cached.length}ファイル`);
  check('筆順のデータもためこまれた', cached.some((p) => p.includes('/strokes/grade-')));
  check('よその сайт のファイルはためこまれていない'.replace(' сайт ', 'サイト'),
    cached.every((p) => p.startsWith('/')));

  // ここから電波を切る
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('h1', { timeout: 10000 });
  const title = await page.locator('h1').first().textContent();
  check('電波がなくてもホーム画面が開く', title.includes('かんじ'), title);

  const strokeOk = await page.evaluate(async () => {
    try {
      const r = await fetch('/strokes/grade-5.json');
      const j = await r.json();
      return Object.keys(j).length > 0;
    } catch (e) {
      return String(e);
    }
  });
  check('電波がなくても筆順データが読める', strokeOk === true, String(strokeOk));

  // 「なぞりがき」が実際に動くか（筆順データが要る画面）
  await page.getByRole('button', { name: /なぞりがき/ }).click();
  await page.waitForTimeout(1200);
  const traced = await page.locator('svg').count();
  check('電波がなくても、なぞりがきの画面が出る', traced > 0, `svg ${traced}個`);
  await page.screenshot({ path: `${SHOTS}/pwa-offline.png` });

  await ctx.setOffline(false);
  check('画面のエラーは出ていない', errors.length === 0, errors.slice(0, 2).join(' / '));
  await ctx.close();
}

// ══ 4. 「ホーム画面に追加してね」の案内 ═════════════════════
console.log('\n\x1b[1m4. ホーム画面に追加してねの案内\x1b[0m');
{
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], locale: 'ja-JP', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForSelector('h1', { timeout: 8000 });

  const hint = page.locator('.notice', { hasText: 'ホームがめんに ついか' });
  check('iPad では案内が出る', (await hint.count()) === 1);

  await page.getByRole('button', { name: /わかった/ }).click();
  await page.waitForTimeout(300);
  check('「わかった」を押すと、いったん消える', (await hint.count()) === 0);

  // 保存された「いつまで隠すか」を読む
  const until = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('kanken-5-6');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return await new Promise((res) => {
      const r = db.transaction('settings').objectStore('settings').get('settings');
      r.onsuccess = () => res(r.result?.installHintHiddenUntil ?? null);
    });
  });
  const days = (until - Date.now()) / (24 * 60 * 60 * 1000);
  check('つぎに出るのは7日後', days > 6.9 && days < 7.1, `${days.toFixed(2)}日後`);

  // 7日たったことにして、また出るかを確かめる
  await page.evaluate(async () => {
    const db = await new Promise((res) => {
      const req = indexedDB.open('kanken-5-6');
      req.onsuccess = () => res(req.result);
    });
    const store = db.transaction('settings', 'readwrite').objectStore('settings');
    const cur = await new Promise((res) => {
      const r = store.get('settings');
      r.onsuccess = () => res(r.result);
    });
    await new Promise((res) => {
      const r = store.put({ ...cur, installHintHiddenUntil: Date.now() - 1000 }, 'settings');
      r.onsuccess = () => res();
    });
  });
  await page.reload();
  await page.waitForSelector('h1', { timeout: 8000 });
  check('7日たつと、また案内が出る（追加が済むまであきらめない）',
    (await page.locator('.notice', { hasText: 'ホームがめんに ついか' }).count()) === 1);
  await ctx.close();
}

// ══ 5. おうちの人の画面 ═════════════════════════════════════
console.log('\n\x1b[1m5. おうちの人の画面\x1b[0m');
{
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], locale: 'ja-JP', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForSelector('h1', { timeout: 8000 });

  // 模試の記録を先に入れておく（画面から60分ぶん解くのは時間がかかるため）
  await page.evaluate(async () => {
    const db = await new Promise((res) => {
      const req = indexedDB.open('kanken-5-6');
      req.onsuccess = () => res(req.result);
    });
    const mk = (date, at, score) => ({
      date, at, kyu: 6, score, total: 160, fullTotal: 200, seconds: 2400, timedOut: false,
      sections: [
        { no: '(一)', title: '漢字の読み', score: Math.round(score * 0.5 / 8), points: 20 },
        { no: '(十一)', title: '漢字の書取', score: Math.round(score * 0.2), points: 40 },
      ],
    });
    const tx = db.transaction(['exams', 'sessions'], 'readwrite');
    tx.objectStore('exams').add(mk('2026-08-01', Date.now() - 86400000 * 3, 80));
    tx.objectStore('exams').add(mk('2026-08-10', Date.now() - 86400000 * 2, 120));
    const today = new Date();
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    tx.objectStore('sessions').add({
      date: key(today), startedAt: Date.now(), finishedAt: Date.now(), kyu: 6,
      mode: 'reading', total: 10, correct: 8, wrongChars: [],
    });
    await new Promise((res) => { tx.oncomplete = res; });
  });
  await page.reload();
  await page.waitForSelector('h1', { timeout: 8000 });
  await page.getByRole('button', { name: 'おうちの人の がめん' }).click();
  await page.waitForTimeout(400);

  const body = await page.locator('.app').innerText();
  check('見出しが「おうちの人の 画面」になっている',
    (await page.locator('h1').textContent()) === 'おうちの人の 画面');
  check('ホーム画面に追加できているかが分かる', body.includes('ホーム画面に追加できているか'));
  check('追加できていないことを、はっきり知らせる', body.includes('まだできていません'));
  check('電波がなくても使えるかが分かる', body.includes('電波がなくても使えるか'));
  check('バックアップをまだしていないと警告する', body.includes('まだ一度も書き出していません'));
  check('模擬試験の記録が出る', body.includes('模擬試験の記録'));
  check('200点に換算した点が出る', /200点換算\s*\d+点/.test(body), body.match(/200点換算[^・]*/)?.[0] ?? '');
  check('受けた回数が2回', /2\s*受けた回数/.test(body.replace(/\n/g, ' ')));
  check('苦手な分野が出る', body.includes('苦手な分野'));
  // 入れた記録では 読み 13/40（33%）・書取 40/80（50%）なので、読みが先に出るはず
  check('苦手な順（正答率の低い方が先）に並ぶ',
    body.indexOf('(一) 漢字の読み') < body.indexOf('(十一) 漢字の書取'));
  check('正答率が計算されている', body.includes('33%') && body.includes('50%'));
  check('2週間の学習グラフが出る', body.includes('この2週間の学習'));
  check('グラフの棒が14本ある', (await page.locator('.daybar').count()) === 14);
  check('きょうの棒に色がついている', (await page.locator('.daybar > div.on').count()) === 1);
  check('消す操作には確認がある', body.includes('元に戻せません'));

  await page.screenshot({ path: `${SHOTS}/pwa-parent.png`, fullPage: true });

  // ライセンス表示（KanjiVG などは、アプリの中に出どころを書く決まりがある）
  await page.getByRole('button', { name: '出どころと決まりを見る' }).click();
  await page.waitForTimeout(300);
  const about = await page.locator('.app').innerText();
  check('このアプリについて が開く',
    (await page.locator('h1').textContent()) === 'このアプリについて');
  check('KanjiVG の表示がある（CC BY-SA 3.0 の義務）',
    about.includes('KanjiVG') && about.includes('CC BY-SA 3.0'));
  check('JMdict の表示がある', about.includes('JMdict') && about.includes('CC BY-SA 4.0'));
  check('記録を外に送らないと書いてある', about.includes('いっさい送っていません'));
  check('押すと外に飛ぶリンクは1つも無い', (await page.locator('a[href]').count()) === 0);
  await page.screenshot({ path: `${SHOTS}/pwa-about.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
stop();
console.log(`\n  合計 ${pass + fail}件： \x1b[32m${pass}件合格\x1b[0m / ${fail > 0 ? `\x1b[31m${fail}件失敗\x1b[0m` : '0件失敗'}\n`);
process.exit(fail > 0 ? 1 : 0);
