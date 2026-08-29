/**
 * 【1】元データをインターネットから取ってくるスクリプト
 *
 *   npm run data:fetch          … まだ無いファイルだけ取ってくる
 *   npm run data:fetch -- --force … 全部取り直す
 *
 * 取ってくる先は data/cache/ です（このフォルダはGitに保存しません）。
 * こちらから外部に送るデータは一切ありません。取ってくるだけです。
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { SOURCES, KANJIVG_BASE } from './sources.mjs';
import { log, runScript, sha256, ensureDir, fetchWithRetry, FriendlyError } from './lib/util.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, 'data/cache');
const KVG_DIR = path.join(CACHE, 'kanjivg');
const FORCE = process.argv.includes('--force');

const exists = (p) => access(p).then(() => true, () => false);

async function fetchOne(src) {
  const dest = path.join(CACHE, src.file);
  if (!FORCE && (await exists(dest))) {
    try {
      const buf = await readFile(dest);
      log.ok(`${src.file}（すでにあるので取得しません／${(buf.length / 1024).toFixed(0)}KB）`);
      return { ...src, bytes: buf.length, sha256: sha256(buf), fetchedAt: null };
    } catch {
      // 読めなかったら、取り直せばよいので先へ進む
      log.warn(`${src.file} が読めなかったので、取り直します`);
    }
  }
  const buf = await fetchWithRetry(src.url, { label: src.what });
  if (buf.length < 100) {
    throw new FriendlyError(
      `取ってきたファイルが空っぽでした：${src.file}`,
      `${src.what} を取得しましたが、中身が ${buf.length} バイトしかありません。\n  配布元でファイルの場所が変わった可能性があります。`,
      `scripts/sources.mjs の「${src.id}」の url を、配布元の最新の場所に直してください。`,
    );
  }
  await writeFile(dest, buf);
  log.ok(`${src.file}（${(buf.length / 1024).toFixed(0)}KB）← ${src.what}`);
  return { ...src, bytes: buf.length, sha256: sha256(buf), fetchedAt: new Date().toISOString() };
}

/** 学年別漢字配当表から、必要な漢字1026字の一覧を取り出す */
async function readKanjiList() {
  const csv = await readFile(path.join(CACHE, 'kyoiku-kanji-2017.csv'), 'utf8');
  return csv
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(',')[0])
    .filter((c) => c && c.length === 1);
}

/** KanjiVG（筆順データ）を漢字1字ずつ取ってくる。20個ずつ並行して取得する */
async function fetchKanjiVG(chars) {
  await ensureDir(KVG_DIR);
  const need = [];
  for (const c of chars) {
    const code = c.codePointAt(0).toString(16).padStart(5, '0');
    const dest = path.join(KVG_DIR, `${code}.svg`);
    if (FORCE || !(await exists(dest))) need.push({ c, code, dest });
  }
  if (need.length === 0) {
    log.ok(`筆順データ ${chars.length}字（すべてそろっているので取得しません）`);
    return { total: chars.length, downloaded: 0, missing: [] };
  }
  log.info(`筆順データを ${need.length}字ぶん取得します…`);

  const missing = [];
  const CONCURRENCY = 20;
  let done = 0;
  const queue = [...need];
  const worker = async () => {
    while (queue.length) {
      const job = queue.shift();
      if (!job) break;
      try {
        const buf = await fetchWithRetry(`${KANJIVG_BASE}/${job.code}.svg`, {
          tries: 3,
          timeoutMs: 30000,
          label: `筆順データ「${job.c}」`,
        });
        await writeFile(job.dest, buf);
      } catch {
        missing.push(job.c);
      }
      done++;
      if (done % 100 === 0) log.info(`  ${done}/${need.length} 字…`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (missing.length) {
    log.warn(`筆順データが取れなかった漢字が ${missing.length}字 あります: ${missing.join('')}`);
  } else {
    log.ok(`筆順データ ${need.length}字を取得しました`);
  }
  return { total: chars.length, downloaded: need.length - missing.length, missing };
}

runScript('元データの取得', async () => {
  console.log('漢検アプリ｜元データの取得');
  console.log('='.repeat(60));
  console.log('インターネットから、漢字のもとになるデータを取ってきます。');
  console.log('こちらから外部に送るものは何もありません。\n');
  await ensureDir(CACHE);

  log.step('1/2 元データファイルの取得');
  const manifest = [];
  for (const src of SOURCES) manifest.push(await fetchOne(src));

  log.step('2/2 筆順データ（KanjiVG）の取得');
  const chars = await readKanjiList();
  if (chars.length !== 1026) {
    throw new FriendlyError(
      `学年別漢字配当表の字数がおかしいです（${chars.length}字）`,
      `1026字あるはずですが、${chars.length}字しか読み取れませんでした。\n  ダウンロードが途中で切れたか、配布元のファイルの形が変わった可能性があります。`,
      `npm run data:fetch -- --force を実行して、取り直してみてください。`,
    );
  }
  const kvg = await fetchKanjiVG(chars);

  await writeFile(
    path.join(CACHE, 'MANIFEST.json'),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), sources: manifest, kanjivg: kvg },
      null,
      2,
    ),
  );

  console.log(`\n${'='.repeat(60)}`);
  console.log('取得が終わりました。');
  console.log('次は  npm run data:build  を実行してください。\n');
});
