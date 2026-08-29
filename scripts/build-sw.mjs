/**
 * オフライン用のサービスワーカー（dist/sw.js）を作る。
 *   node scripts/build-sw.mjs
 *
 * npm run build の最後に自動で走ります。
 * dist の中にあるファイルを全部数えあげて、
 * 「この一覧をためこんでね」と書いたプログラムを作ります。
 *
 * ファイルの中身から版番号を作るので、
 * 中身が1文字でも変われば版番号が変わり、iPad が新しい版に気づけます。
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log, runScript, FriendlyError, sha256 } from './lib/util.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

/**
 * ためこまないファイル。
 *   sw.js    … 自分自身（ためこむと、新しい版に気づけなくなる）
 *   _headers … Cloudflare が読む設定ファイル。アプリからは使わない
 */
const SKIP = new Set(['sw.js', '.vite', '_headers']);

async function listFiles(dir, base = '') {
  const out = [];
  for (const name of await readdir(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if ((await stat(full)).isDirectory()) out.push(...(await listFiles(full, rel)));
    else out.push(rel);
  }
  return out;
}

async function main() {
  log.step('オフライン用のしくみを作ります');
  try {
    await stat(DIST);
  } catch {
    throw new FriendlyError(
      'ビルド結果が見つかりません',
      'dist フォルダがありません。',
      'さきに「npm run build」を実行してください（このスクリプトはその最後に走ります）。',
    );
  }

  const files = (await listFiles(DIST)).sort();
  if (files.length === 0) {
    throw new FriendlyError(
      'ためこむファイルが1つもありません',
      'dist フォルダが空でした。',
      'いちど dist フォルダを消してから「npm run build」をやり直してください。',
    );
  }

  // 版番号は、全ファイルの中身から作る（中身が変われば必ず変わる）
  const parts = [];
  let bytes = 0;
  for (const f of files) {
    const buf = await readFile(path.join(DIST, f));
    bytes += buf.length;
    parts.push(`${f}:${sha256(buf)}`);
  }
  const version = sha256(parts.join('\n')).slice(0, 12);

  const template = await readFile(path.join(ROOT, 'scripts/sw-template.js'), 'utf8');
  const urls = files.map((f) => `./${f}`);
  const code = template
    .replace('__VERSION__', version)
    .replace('__PRECACHE__', JSON.stringify(urls, null, 2));

  if (code.includes('__VERSION__') || code.includes('__PRECACHE__')) {
    throw new FriendlyError(
      'サービスワーカーの差しこみに失敗しました',
      'scripts/sw-template.js の中の目印（__VERSION__ / __PRECACHE__）が見つかりませんでした。',
      'scripts/sw-template.js を、変更する前の状態に戻してください。',
    );
  }

  await writeFile(path.join(DIST, 'sw.js'), code, 'utf8');
  log.ok(`dist/sw.js を作りました（${files.length}ファイル・約 ${Math.round(bytes / 1024)}KB・版 ${version}）`);
  log.info('これで、電波が無くてもアプリが開けます。');
}

runScript('オフライン用のしくみ作り', main);
