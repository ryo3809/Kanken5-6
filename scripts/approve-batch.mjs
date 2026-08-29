/**
 * 承認を「少しずつ」進めるための道具。
 *
 *   npm run csv:status   … いまの承認の進みぐあいと、次に何が開くかを表示
 *   npm run csv:next     … 次に見てほしい20件だけを1枚のCSVに書き出す
 *   npm run csv:merge    … そのCSVに書いた「OK」を、本来の承認ファイルに書きもどす
 *
 * なぜ必要か：
 *   承認まちが全部で200件以上あり、一度に全部見るのは大変です。
 *   1日20件ずつなら10分ほどで終わります。
 *   しかも「対義語10件・熟語の構成10件」が済んだ時点で、
 *   模擬試験が160点満点から200点満点に変わります。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { loadApprovals, setApprovals, APPROVAL_FILES } from './lib/approvals.mjs';
import { log, FriendlyError, runScript } from './lib/util.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHEET = 'data/csv/きょうの承認シート.csv';

/** 模擬試験が200点満点になるのに必要な件数（大問1つにつき10問使うので、少し余裕をみる） */
export const NEEDED = { pair: 12, kozo: 12 };

const KIND_LABEL = {
  pair: '対義語・類義語',
  kozo: '熟語の構成',
  radical: '部首',
  word: '熟語の読み',
};

const cellOut = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function parseLine(line) {
  const out = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuote = false; }
      else cur += ch;
    } else if (ch === '"') inQuote = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 1行ぶんを「保護者が読んで判断できる文」に直す */
export function describe(kind, cells) {
  switch (kind) {
    case 'pair':
      // 種類, ことばA, ことばB, 読みA, 読みB, 出題級
      return {
        group: cells[0],                                   // 対義語 / 類義語
        subject: `${cells[1]} ⇔ ${cells[2]}`,
        detail: `${cells[3]} ／ ${cells[4]}`,
        question:
          cells[0] === '対義語'
            ? 'この2つは「反対の意味」の組み合わせとして正しいですか？'
            : 'この2つは「にた意味」の組み合わせとして正しいですか？',
        kyu: cells[5],
      };
    case 'kozo':
      // 熟語, 読み, 構成, 意味, 出題級
      return {
        group: cells[2],                                   // ア / イ / ウ / エ
        subject: `${cells[0]}（${cells[1]}）`,
        detail: `${cells[2]}：${cells[3]}`,
        question: 'この熟語の組み立ては、この分類で正しいですか？',
        kyu: cells[4],
      };
    case 'radical':
      // 漢字, 部首, 部首名, 出どころ, なぜ確認が必要か
      return {
        group: '部首',
        subject: `${cells[0]} → ${cells[1]}（${cells[2]}）`,
        detail: `${cells[4]}／出どころ：${cells[3]}`,
        question: '漢検の辞典で、この漢字の部首はこれで合っていますか？',
        kyu: '',
      };
    case 'word':
      // 熟語, 読み, 出題級, 出どころ
      return {
        group: '熟語',
        subject: `${cells[0]}（${cells[1]}）`,
        detail: `出どころ：${cells[3]}`,
        question: 'この読み方で正しいですか？ 小学生が読む言葉として自然ですか？',
        kyu: cells[2],
      };
    default:
      throw new FriendlyError('知らない種類です', `種類「${kind}」は用意されていません。`);
  }
}

/** 承認ファイルを全部読んで、まだ承認されていないものを集める */
export async function loadState(root = ROOT) {
  const state = {};
  for (const kind of Object.keys(APPROVAL_FILES)) {
    const map = await loadApprovals(root, kind);
    const rows = [...map.entries()].map(([key, v]) => ({ kind, key, cells: v.cells, approved: v.approved }));
    state[kind] = {
      total: rows.length,
      approved: rows.filter((r) => r.approved).length,
      pending: rows.filter((r) => !r.approved),
    };
  }
  return state;
}

/**
 * 次に見てもらう分を、優先順に選ぶ。
 *
 * 考え方：
 *   1. まず「対義語・類義語」と「熟語の構成」を交互に。ここが済むと模試が200点満点になる
 *      （分類がかたよらないよう、対義語/類義語、ア/イ/ウ/エ を順ぐりに取る）
 *   2. つぎに「部首」（9件だけなので、すぐ終わる）
 *   3. のこりの対義語・熟語の構成、最後に「熟語の読み」
 */
export function planNext(state, n = 20) {
  const roundRobin = (rows) => {
    const groups = new Map();
    for (const r of rows) {
      const g = describe(r.kind, r.cells).group;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(r);
    }
    const keys = [...groups.keys()].sort();
    const out = [];
    for (let i = 0; out.length < rows.length; i++) {
      let moved = false;
      for (const k of keys) {
        const list = groups.get(k);
        if (i < list.length) { out.push(list[i]); moved = true; }
      }
      if (!moved) break;
    }
    return out;
  };

  // 6級の出題に使えるものを先に見てもらう（5級だけの語はあとまわし）
  const forSix = (rows) => {
    const six = rows.filter((r) => String(describe(r.kind, r.cells).kyu).startsWith('6'));
    const rest = rows.filter((r) => !String(describe(r.kind, r.cells).kyu).startsWith('6'));
    return [...six, ...rest];
  };

  const q = {
    pair: roundRobin(forSix(state.pair?.pending ?? [])),
    kozo: roundRobin(forSix(state.kozo?.pending ?? [])),
    radical: (state.radical?.pending ?? []).slice(),
    word: (state.word?.pending ?? []).slice(),
  };

  const picked = [];
  const take = (kind) => {
    const r = q[kind].shift();
    if (r) picked.push(r);
    return !!r;
  };

  // 1. 模試を200点にするぶん（対義語と熟語の構成を交互に）
  let needPair = Math.max(0, NEEDED.pair - (state.pair?.approved ?? 0));
  let needKozo = Math.max(0, NEEDED.kozo - (state.kozo?.approved ?? 0));
  while (picked.length < n && (needPair > 0 || needKozo > 0)) {
    if (needPair > 0 && take('pair')) needPair--; else needPair = 0;
    if (picked.length >= n) break;
    if (needKozo > 0 && take('kozo')) needKozo--; else needKozo = 0;
  }
  // 2. 部首 → 3. のこり
  for (const kind of ['radical', 'pair', 'kozo', 'word']) {
    while (picked.length < n && q[kind].length > 0) take(kind);
  }
  return picked;
}

/** 選んだぶんを1枚のCSVに書き出す */
export async function writeSheet(root, picked) {
  const header = ['番号', '種類', '見てほしいもの', 'くわしく', 'たしかめること', '承認', 'メモ', 'ID'];
  const rows = picked.map((r, i) => {
    const d = describe(r.kind, r.cells);
    return [i + 1, KIND_LABEL[r.kind], d.subject, d.detail, d.question, '', '', `${r.kind}|${r.key}`];
  });
  const body = [header, ...rows].map((r) => r.map(cellOut).join(',')).join('\r\n');
  const file = path.join(root, SHEET);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, `﻿${body}\r\n`, 'utf8');
  await rename(`${file}.tmp`, file);
  return file;
}

/** シートを読んで、OK と書かれた行を承認ファイルに書きもどす */
export async function mergeSheet(root, today = new Date().toISOString().slice(0, 10)) {
  const file = path.join(root, SHEET);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new FriendlyError(
      '承認シートが見つかりません',
      `${SHEET} がありません。`,
      'さきに「npm run csv:next」を実行して、シートを作ってください。',
    );
  }
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const header = parseLine(lines[0]);
  const iOk = header.indexOf('承認');
  const iMemo = header.indexOf('メモ');
  const iId = header.indexOf('ID');
  if (iOk < 0 || iId < 0) {
    throw new FriendlyError(
      '承認シートの形がちがいます',
      '「承認」列か「ID」列が見つかりませんでした。',
      '列を消したり並べかえたりせず、「承認」の欄にだけ OK と書いてください。'
        + ' 分からなくなったら「npm run csv:next」でシートを作りなおせます。',
    );
  }

  const byKind = { word: new Map(), radical: new Map(), pair: new Map(), kozo: new Map() };
  let marked = 0, unknown = 0;
  for (const line of lines.slice(1)) {
    const cells = parseLine(line);
    const raw = String(cells[iOk] ?? '').trim().toUpperCase();
    if (raw !== 'OK') continue;                       // 空欄・NG・保留はそのまま
    const id = String(cells[iId] ?? '');
    const sep = id.indexOf('|');
    const kind = id.slice(0, sep);
    const key = id.slice(sep + 1);
    if (!byKind[kind] || !key) { unknown++; continue; }
    byKind[kind].set(key, {
      approved: true,
      date: today,
      memo: String(cells[iMemo] ?? '').trim() || '保護者が確認（承認シート）',
    });
    marked++;
  }

  const changed = {};
  for (const kind of Object.keys(byKind)) {
    changed[kind] = byKind[kind].size ? await setApprovals(root, kind, byKind[kind]) : 0;
  }
  return { marked, unknown, changed };
}

/** 進みぐあいを表示する */
function report(state) {
  let pendingAll = 0;
  for (const kind of ['pair', 'kozo', 'radical', 'word']) {
    const s = state[kind];
    if (!s) continue;
    pendingAll += s.pending.length;
    log.info(`${KIND_LABEL[kind]}：${s.total}件のうち ${s.approved}件が承認ずみ（のこり ${s.pending.length}件）`);
  }
  const needPair = Math.max(0, NEEDED.pair - (state.pair?.approved ?? 0));
  const needKozo = Math.max(0, NEEDED.kozo - (state.kozo?.approved ?? 0));
  if (needPair > 0 || needKozo > 0) {
    log.info(
      `模擬試験を200点満点にするには、あと 対義語・類義語 ${needPair}件 ／ 熟語の構成 ${needKozo}件 の承認が必要です。`,
    );
  } else {
    log.ok('模擬試験を200点満点にするための承認は、もう足りています（npm run data:build で反映されます）。');
  }
  return pendingAll;
}

async function main() {
  const cmd = process.argv[2] ?? 'status';
  const n = Number(process.argv[3] ?? 20);
  const state = await loadState(ROOT);

  if (cmd === 'status') {
    report(state);
    return;
  }

  if (cmd === 'next') {
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      throw new FriendlyError('件数の指定がおかしいです', `「${process.argv[3]}」は使えません。`,
        '1〜500 の数を指定してください。例： npm run csv:next -- 10');
    }
    const picked = planNext(state, n);
    if (picked.length === 0) {
      log.ok('承認まちはありません。すべて確認ずみです。');
      return;
    }
    const file = await writeSheet(ROOT, picked);
    report(state);
    log.ok(`${picked.length}件を ${SHEET} に書き出しました。`);
    log.info('この順で進めてください：');
    log.info(`  1. ${path.relative(ROOT, file)} を Excel や Numbers で開く`);
    log.info('  2. 内容を見て、正しければ「承認」の欄に OK と書く（自信がなければ空のままでOK）');
    log.info('  3. 上書き保存する（CSV形式のまま）');
    log.info('  4. npm run csv:merge を実行する');
    return;
  }

  if (cmd === 'merge') {
    const r = await mergeSheet(ROOT);
    if (r.unknown > 0) {
      log.warn(`${r.unknown}行は、どの承認ファイルのものか分からなかったので飛ばしました（ID列が消えていませんか？）。`);
    }
    const total = Object.values(r.changed).reduce((a, b) => a + b, 0);
    log.ok(`${r.marked}件に OK が書かれていて、そのうち ${total}件を新しく承認しました。`);
    for (const [kind, c] of Object.entries(r.changed)) {
      if (c > 0) log.info(`  ${KIND_LABEL[kind]}：+${c}件`);
    }
    const after = await loadState(ROOT);
    report(after);
    log.info('つぎは「npm run data:build && npm run data:verify」を実行すると、アプリに反映されます。');
    return;
  }

  throw new FriendlyError(
    '使い方が分かりませんでした',
    `「${cmd}」という命令はありません。`,
    'npm run csv:status / npm run csv:next / npm run csv:merge のどれかを使ってください。',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runScript('承認シート', main);
}
