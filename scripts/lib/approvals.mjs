// 「保護者が中身を確かめた熟語」の一覧を読み書きする部分。
//
// ファイル: data/word-approvals.csv
//   出典がはっきりしない熟語は、このファイルで「OK」と書かれるまでアプリに出しません。
//   読みが後から変わった場合は承認が外れる作りにしてあります
//   （承認したときの読みと、いまの読みが違ったら、もう一度確認してもらうため）。

import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

export const APPROVAL_FILE = 'data/word-approvals.csv';

const HEADER = ['熟語', '読み', '出題級', '出どころ', '承認', '確認日', 'メモ'];

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
export async function loadApprovals(root) {
  let text;
  try {
    text = await readFile(path.join(root, APPROVAL_FILE), 'utf8');
  } catch {
    return new Map(); // まだ作られていないだけなので、空でよい
  }
  const map = new Map();
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const [word, reading, lv, src, approval, date, memo] = parseLine(line);
    if (!word) continue;
    map.set(`${word}|${reading}`, {
      word, reading, lv, src,
      approved: String(approval ?? '').trim().toUpperCase() === 'OK',
      raw: String(approval ?? '').trim(),
      date, memo,
    });
  }
  return map;
}

/**
 * 承認ファイルを作りなおす。
 * すでに書かれている「承認」「確認日」「メモ」は絶対に消さない。
 * 新しく確認が必要になった熟語だけを足す。
 */
export async function refreshApprovals(root, pendingWords) {
  const existing = await loadApprovals(root);
  const rows = [];
  const seen = new Set();

  // 今回あらためて確認が必要な熟語
  for (const w of pendingWords) {
    const key = `${w.w}|${w.r}`;
    seen.add(key);
    const prev = existing.get(key);
    rows.push([
      w.w, w.r,
      w.lv === 6 ? '6級から' : '5級から',
      w.src.replace('｜要校正', ''),
      prev?.raw ?? '',
      prev?.date ?? '',
      prev?.memo ?? '',
    ]);
  }
  // 以前あったが、いまは出てこない熟語も記録として残す（勝手に消さない）
  for (const [key, prev] of existing) {
    if (seen.has(key)) continue;
    rows.push([prev.word, prev.reading, prev.lv ?? '', prev.src ?? '', prev.raw, prev.date ?? '',
      `${prev.memo ?? ''}${prev.memo ? ' / ' : ''}※いまのデータには出てきません`]);
  }

  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ja'));
  const body = [HEADER, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const file = path.join(root, APPROVAL_FILE);
  await writeFile(`${file}.tmp`, `﻿${body}\r\n`, 'utf8');
  await rename(`${file}.tmp`, file);
  return { total: rows.length, approved: rows.filter((r) => String(r[4]).toUpperCase() === 'OK').length };
}
