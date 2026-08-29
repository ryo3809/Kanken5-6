/**
 * 【4】漢字データを CSV に書き出すスクリプト（目で校正するため）
 *
 *   npm run data:csv
 *
 * 出力先: data/csv/
 *   1-漢字一覧.csv    … 1026字ぜんぶ（読み・熟語・画数・部首）
 *   2-熟語一覧.csv    … 出題に使う熟語ぜんぶ
 *   3-要校正リスト.csv … 人が確かめる必要があるものだけ（まずこれを見てください）
 *
 * Excel や Numbers でそのまま開けます（文字化けしない形式で書いています）。
 */
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { log, runScript, ensureDir, FriendlyError } from './lib/util.mjs';
import { refreshApprovals, APPROVAL_FILE } from './lib/approvals.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'src/data');
const OUT = path.join(ROOT, 'data/csv');

/** CSVの1マスぶんを安全な形にする */
function cell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // 「=」で始まる値はExcelが数式とみなして誤動作するので、先頭に ' を付けて防ぐ
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Excelで文字化けしないCSVを書く（BOM付きUTF-8・改行はCRLF） */
async function writeCsv(file, header, rows) {
  const body = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `﻿${body}\r\n`, 'utf8');
  await rename(tmp, file);
  return rows.length;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new FriendlyError(
      `データファイルが読めません：${path.relative(ROOT, file)}`,
      'ファイルが無いか、中身が壊れています。',
      '先に  npm run data:build  を実行してください。',
    );
  }
}

runScript('CSVの書き出し', async () => {
  console.log('漢検アプリ｜校正用CSVの書き出し');
  console.log('='.repeat(60));

  const { kanji } = await readJson(path.join(DATA, 'kanji.json'));
  const { words } = await readJson(path.join(DATA, 'words.json'));
  await ensureDir(OUT);

  // その漢字を含む熟語（よく使う順に5つまで）
  const wordsByChar = new Map();
  for (const w of words) {
    for (const c of new Set(w.w)) {
      if (!wordsByChar.has(c)) wordsByChar.set(c, []);
      wordsByChar.get(c).push(w);
    }
  }

  log.step('1/4 漢字一覧');
  const kanjiRows = kanji.map((k) => {
    const ws = (wordsByChar.get(k.c) ?? []).slice(0, 5);
    return [
      k.c,
      `${k.grade}年`,
      k.level === 6 ? '6級から' : '5級から',
      k.strokes,
      k.on.map((r) => r.kana).join('・'),
      k.kun.map((r) => (r.okurigana ? `${r.stem}（${r.okurigana}）` : r.kana)).join('・'),
      ws.map((w) => `${w.w}（${w.r}）`).join('・'),
      k.radical ?? '',
      k.radicalOriginal ?? '',
      k.radicalName ?? '',
      k.radicalVerified ? '校正済み' : '未校正',
      k.ijidokun.join('・'),
    ];
  });
  const n1 = await writeCsv(
    path.join(OUT, '1-漢字一覧.csv'),
    ['漢字', '学年', '出題級', '画数', '音読み', '訓読み（送り仮名）', '熟語の例', '部首の候補', '部首のもとの字', '部首名', '部首の校正状態', '同訓異字'],
    kanjiRows,
  );
  log.ok(`1-漢字一覧.csv（${n1}行）`);

  log.step('2/4 熟語一覧');
  const wordRows = words.map((w) => [
    w.w,
    w.r,
    w.lv === 6 ? '6級から' : '5級から',
    w.jukujikun ? '熟字訓' : '',
    w.alt ? w.alt.join(' / ') : '',
    w.freq ?? '',
    w.src,
    w.verified ? '校正不要' : '★要校正',
  ]);
  const n2 = await writeCsv(
    path.join(OUT, '2-熟語一覧.csv'),
    ['熟語', '読み', '出題級', '種類', 'ほかの読み', 'よく使う順位', '出典', '校正状態'],
    wordRows,
  );
  log.ok(`2-熟語一覧.csv（${n2}行）`);

  log.step('3/4 承認ファイルの更新');
  // 出どころがはっきりしない熟語を、承認ファイルに書き出す。
  // すでに「OK」と書かれているものは、絶対に上書きしません。
  const pending = words.filter((w) => w.src.includes('要校正') || !w.verified);
  const res = await refreshApprovals(ROOT, pending);
  log.ok(`${APPROVAL_FILE}（${res.total}行／承認ずみ ${res.approved}行）`);
  log.info('確認が必要な熟語は、このファイルの「承認」の列に OK と書いてください。');
  log.info('書いたあと npm run data:build を実行すると、アプリに出るようになります。');

  log.step('4/4 部首の校正シート（フェーズ1bの作業）');
  const radRows = kanji.map((k) => [
    k.c,
    `${k.grade}年`,
    k.strokes,
    k.radical ?? '',
    k.radicalOriginal ?? '',
    k.radical ? 'KanjiVGからの推定' : '候補なし（要記入）',
    '',
    '',
  ]);
  const n4 = await writeCsv(
    path.join(OUT, '4-部首の校正シート.csv'),
    ['漢字', '学年', '画数', '部首の候補', '部首のもとの字', '出どころ', '正しい部首（ちがう場合だけ記入）', '部首名（ひらがなで記入）'],
    radRows,
  );
  const radNone = kanji.filter((k) => !k.radical).length;
  log.ok(`4-部首の校正シート.csv（${n4}行／うち候補なし ${radNone}行）`);

  console.log(`\n${'='.repeat(60)}`);
  console.log('書き出しが終わりました。ファイルはここにあります：');
  console.log(`  ${path.relative(ROOT, OUT)}/`);
  console.log('');
  console.log('  1-漢字一覧.csv        … 1026字ぜんぶ。ざっと眺めて、変な読みが無いか見てください');
  console.log('  2-熟語一覧.csv        … 出題に使う熟語ぜんぶ。よく使う順にならんでいます');
  console.log('  （承認ファイルは data/word-approvals.csv です）');
  console.log('  4-部首の校正シート.csv … フェーズ1bで使います。いまは見なくて大丈夫です');
  console.log('');
});
