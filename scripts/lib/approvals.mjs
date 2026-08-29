// 「保護者が中身を確かめた熟語」の一覧を読み書きする部分。
//
// ファイル: data/word-approvals.csv
//   出典がはっきりしない熟語は、このファイルで「OK」と書かれるまでアプリに出しません。
//   読みが後から変わった場合は承認が外れる作りにしてあります
//   （承認したときの読みと、いまの読みが違ったら、もう一度確認してもらうため）。

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';

/** 種類ごとの承認ファイル */
export const APPROVAL_FILES = {
  word: 'data/approvals/1-熟語の読み.csv',
  radical: 'data/approvals/2-部首.csv',
  pair: 'data/approvals/3-対義語・類義語.csv',
  kozo: 'data/approvals/4-熟語の構成.csv',
};
/** 以前のファイル（引っこしのために読む） */
export const OLD_APPROVAL_FILE = 'data/word-approvals.csv';

const HEADERS = {
  word: ['熟語', '読み', '出題級', '出どころ', '承認', '確認日', 'メモ'],
  radical: ['漢字', '部首', '部首名', '出どころ', 'なぜ確認が必要か', '承認', '確認日', 'メモ'],
  pair: ['種類', 'ことばA', 'ことばB', '読みA', '読みB', '出題級', '承認', '確認日', 'メモ'],
  kozo: ['熟語', '読み', '構成', '意味', '出題級', '承認', '確認日', 'メモ'],
};
/** 承認の「キー」を作る（この値が変わったら、承認はやり直しになる） */
const KEYS = {
  word: (r) => `${r[0]}|${r[1]}`,
  radical: (r) => `${r[0]}|${r[1]}`,
  pair: (r) => `${r[1]}|${r[2]}`,
  kozo: (r) => `${r[0]}|${r[2]}`,
};
/** 承認・確認日・メモが、それぞれ何列目か */
const APPROVAL_COL = { word: 4, radical: 5, pair: 6, kozo: 5 };

/** CSVの1行を分解する（"" で囲まれた値に対応） */
function parseLine(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = false;
      } else cur += ch;
    } else if (ch === '"') inQuote = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/**
 * 承認ファイルを読む。
 * 返すのは「熟語＋読み」→ 承認情報 のMap。ファイルが無ければ空。
 */
export async function loadApprovals(root, kind = 'word') {
  const file = APPROVAL_FILES[kind];
  let text = null;
  try {
    text = await readFile(path.join(root, file), 'utf8');
  } catch {
    // 新しい場所に無ければ、以前の場所を見る（引っこしのため）
    if (kind === 'word') {
      try {
        text = await readFile(path.join(root, OLD_APPROVAL_FILE), 'utf8');
      } catch { /* まだ作られていないだけ */ }
    }
  }
  if (text === null) return new Map();

  const col = APPROVAL_COL[kind];
  const map = new Map();
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const cells = parseLine(line);
    if (!cells[0]) continue;
    const raw = String(cells[col] ?? '').trim();
    map.set(KEYS[kind](cells), {
      cells,
      approved: raw.toUpperCase() === 'OK',
      raw,
      date: cells[col + 1] ?? '',
      memo: cells[col + 2] ?? '',
    });
  }
  return map;
}

/**
 * 承認ファイルを作りなおす。
 * すでに書かれている「承認」「確認日」「メモ」は絶対に消さない。
 * 新しく確認が必要になった熟語だけを足す。
 */
/**
 * 承認ファイルを作りなおす。
 * すでに書かれている「承認」「確認日」「メモ」は絶対に消さない。
 *
 * @param root  プロジェクトの場所
 * @param kind  種類（word / radical / pair / kozo）
 * @param items 確認が必要なものの一覧。1件が1行ぶんの配列（承認より前の列まで）
 */
export async function refreshApprovals(root, kind, items) {
  const existing = await loadApprovals(root, kind);
  const col = APPROVAL_COL[kind];
  const rows = [];
  const seen = new Set();

  for (const head of items) {
    const key = KEYS[kind](head);
    seen.add(key);
    const prev = existing.get(key);
    rows.push([...head, prev?.raw ?? '', prev?.date ?? '', prev?.memo ?? '']);
  }
  // 以前あったが、いまは出てこないものも記録として残す（勝手に消さない）
  for (const [key, prev] of existing) {
    if (seen.has(key)) continue;
    const head = prev.cells.slice(0, col);
    rows.push([
      ...head, prev.raw, prev.date ?? '',
      `${prev.memo ?? ''}${prev.memo ? ' / ' : ''}※いまのデータには出てきません`,
    ]);
  }

  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ja'));
  const body = [HEADERS[kind], ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const file = path.join(root, APPROVAL_FILES[kind]);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, `﻿${body}\r\n`, 'utf8');
  await rename(`${file}.tmp`, file);
  return {
    total: rows.length,
    approved: rows.filter((r) => String(r[col]).toUpperCase() === 'OK').length,
  };
}

/** 承認ファイルの「キー」を外から作れるようにする（1行ぶんの配列から） */
export function approvalKey(kind, cells) {
  return KEYS[kind](cells);
}

/** 承認・確認日・メモが何列目かを外から知るため */
export function approvalColumn(kind) {
  return APPROVAL_COL[kind];
}

/**
 * すでにある承認ファイルの、指定した行だけ「承認」を書きかえる。
 *
 * 行の中身（熟語・読みなど）には一切さわりません。
 * すでに OK と書かれている行を、あとから空に戻すこともしません
 * （うっかり承認を取り消してしまう事故をふせぐため）。
 *
 * @param root      プロジェクトの場所
 * @param kind      種類（word / radical / pair / kozo）
 * @param decisions Map: キー → { approved: true, date: '2026-08-29', memo: '...' }
 * @returns 書きかえた件数
 */
export async function setApprovals(root, kind, decisions) {
  const file = path.join(root, APPROVAL_FILES[kind]);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return 0;                    // ファイルがまだ無いなら何もしない
  }
  const col = APPROVAL_COL[kind];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const head = lines[0];
  const out = [head];
  let changed = 0;

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = parseLine(line);
    const key = KEYS[kind](cells);
    const d = decisions.get(key);
    const already = String(cells[col] ?? '').trim().toUpperCase() === 'OK';
    if (d && d.approved && !already) {
      cells[col] = 'OK';
      cells[col + 1] = d.date ?? '';
      if (d.memo) cells[col + 2] = d.memo;
      changed++;
    }
    out.push(cells.map(cell).join(','));
  }

  // 先に新しいファイルを書いてから置きかえる（途中で止まっても元が残る）
  await writeFile(`${file}.tmp`, `﻿${out.join('\r\n')}\r\n`, 'utf8');
  await rename(`${file}.tmp`, file);
  return changed;
}
