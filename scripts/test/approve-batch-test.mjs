/**
 * 「少しずつ承認する」しくみのテスト。
 *   node scripts/test/approve-batch-test.mjs
 *
 * 本物のデータは絶対に書きかえません。作業用のフォルダにコピーしてから試します。
 */
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApprovals, APPROVAL_FILES } from '../lib/approvals.mjs';
import { loadState, planNext, writeSheet, mergeSheet, describe as describeRow, SHEET, NEEDED } from '../approve-batch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? ' … ' + extra : ''}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}${extra ? ' … ' + extra : ''}`); }
};

/** 本物の承認ファイルを作業用フォルダにコピーする */
async function makeSandbox() {
  const dir = await mkdtemp(path.join(tmpdir(), 'kanken-approve-'));
  await mkdir(path.join(dir, 'data/approvals'), { recursive: true });
  await mkdir(path.join(dir, 'data/csv'), { recursive: true });
  for (const rel of Object.values(APPROVAL_FILES)) {
    await copyFile(path.join(ROOT, rel), path.join(dir, rel));
  }
  return dir;
}

const parse = (text) =>
  text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
    .map((l) => l.slice(1, -1).split('","'));

console.log('\n\x1b[1m承認シート（少しずつ承認するしくみ）\x1b[0m');

const dir = await makeSandbox();
try {
  // ── 1. 何を先に出すか ───────────────────────────
  const state = await loadState(dir);
  check('承認まちを読みこめる', state.pair.pending.length > 0 && state.kozo.pending.length > 0,
    `対義語 ${state.pair.pending.length}件 / 構成 ${state.kozo.pending.length}件`);

  const picked = planNext(state, 20);
  check('20件えらべる', picked.length === 20, `${picked.length}件`);
  const nPair = picked.filter((r) => r.kind === 'pair').length;
  const nKozo = picked.filter((r) => r.kind === 'kozo').length;
  check('模試が200点になる2分野を優先する', nPair === 10 && nKozo === 10, `対義語 ${nPair} / 構成 ${nKozo}`);

  const kozoTypes = new Set(picked.filter((r) => r.kind === 'kozo').map((r) => describeRow('kozo', r.cells).group));
  check('熟語の構成は ア〜エ がそろう', kozoTypes.size === 4, [...kozoTypes].join(''));
  const pairKinds = new Set(picked.filter((r) => r.kind === 'pair').map((r) => describeRow('pair', r.cells).group));
  check('対義語と類義語の両方が入る', pairKinds.size === 2, [...pairKinds].join('/'));
  check('6級で出る語から出す', picked.every((r) => {
    const kyu = describeRow(r.kind, r.cells).kyu;
    return kyu === '' || String(kyu).startsWith('6');
  }));

  // ── 2. シートを書き出す ─────────────────────────
  const file = await writeSheet(dir, picked);
  const sheet = parse(await readFile(file, 'utf8'));
  check('シートに見出しと20行が書かれる', sheet.length === 21, `${sheet.length - 1}行`);
  check('見出しに「承認」と「ID」がある',
    sheet[0].includes('承認') && sheet[0].includes('ID'));
  check('たしかめる文が日本語で入っている', sheet[1][4].includes('正しいですか'));

  // ── 3. OKを書いて、書きもどす ───────────────────
  const iOk = sheet[0].indexOf('承認');
  const okKeys = [];
  for (let i = 1; i <= 6; i++) {
    sheet[i][iOk] = 'OK';
    okKeys.push(sheet[i][sheet[0].indexOf('ID')]);
  }
  await writeFile(file, `﻿${sheet.map((r) => `"${r.join('","')}"`).join('\r\n')}\r\n`, 'utf8');

  const merged = await mergeSheet(dir, '2026-09-01');
  check('OKと書いた6件だけが承認される',
    merged.marked === 6 && merged.changed.pair + merged.changed.kozo === 6,
    `pair+${merged.changed.pair} / kozo+${merged.changed.kozo}`);
  check('どれにも当てはまらない行は無い', merged.unknown === 0);

  const pairAfter = await loadApprovals(dir, 'pair');
  const kozoAfter = await loadApprovals(dir, 'kozo');
  const approvedNow = [...pairAfter.values(), ...kozoAfter.values()].filter((v) => v.approved);
  check('承認ファイルに OK が書かれた', approvedNow.length === 6, `${approvedNow.length}件`);
  check('確認日が入る', approvedNow.every((v) => v.date === '2026-09-01'));
  check('メモに「保護者が確認」が入る', approvedNow.every((v) => v.memo.includes('保護者が確認')));

  // 承認していない行の中身が変わっていないこと
  const before = parse(await readFile(path.join(ROOT, APPROVAL_FILES.pair), 'utf8'));
  const after = parse(await readFile(path.join(dir, APPROVAL_FILES.pair), 'utf8'));
  check('行数は変わらない', before.length === after.length, `${before.length} → ${after.length}`);
  check('ことばの中身は書きかわらない',
    before.every((r, i) => r.slice(0, 6).join() === after[i].slice(0, 6).join()));

  // ── 4. もう一度まぜても、承認が消えない ─────────
  const sheet2 = parse(await readFile(file, 'utf8'));
  for (let i = 1; i < sheet2.length; i++) sheet2[i][iOk] = '';       // 全部からっぽに戻す
  await writeFile(file, `﻿${sheet2.map((r) => `"${r.join('","')}"`).join('\r\n')}\r\n`, 'utf8');
  const merged2 = await mergeSheet(dir, '2026-09-02');
  check('空欄にしても、前の承認は取り消されない', merged2.marked === 0);
  const pairAgain = await loadApprovals(dir, 'pair');
  check('承認はそのまま残る',
    [...pairAgain.values()].filter((v) => v.approved).length === merged.changed.pair);

  // ── 5. 次の20件は、承認ずみを飛ばす ─────────────
  const state2 = await loadState(dir);
  const picked2 = planNext(state2, 20);
  check('承認ずみは二度と出てこない',
    picked2.every((r) => !okKeys.includes(`${r.kind}|${r.key}`)));
  check('進みぐあいが増えている', state2.pair.approved + state2.kozo.approved === 6);

  // ── 6. 目標に届いたら、部首にうつる ─────────────
  const fake = {
    pair: { total: 75, approved: NEEDED.pair, pending: state2.pair.pending },
    kozo: { total: 142, approved: NEEDED.kozo, pending: state2.kozo.pending },
    radical: state2.radical,
    word: state2.word,
  };
  const picked3 = planNext(fake, 5);
  check('200点ぶんが済んだら、つぎは部首から', picked3.every((r) => r.kind === 'radical'),
    picked3.map((r) => r.kind).join(','));

  // ── 7. 列を消したシートは、はっきり断る ─────────
  const broken = parse(await readFile(file, 'utf8')).map((r) => r.slice(0, 5));
  await writeFile(file, `﻿${broken.map((r) => `"${r.join('","')}"`).join('\r\n')}\r\n`, 'utf8');
  let msg = '';
  try { await mergeSheet(dir); } catch (e) { msg = `${e.title ?? ''}${e.howToFix ?? ''}`; }
  check('ID列が無いシートは、理由を日本語で説明して止まる',
    msg.includes('形がちがいます') && msg.includes('csv:next'), msg.slice(0, 30));

  // ── 8. シートが無いときも、やさしく案内する ─────
  await rm(path.join(dir, SHEET));
  let msg2 = '';
  try { await mergeSheet(dir); } catch (e) { msg2 = `${e.title ?? ''}${e.howToFix ?? ''}`; }
  check('シートが無いときは、作り方を案内する',
    msg2.includes('見つかりません') && msg2.includes('csv:next'), msg2.slice(0, 30));
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(`\n  合計 ${pass + fail}件： \x1b[32m${pass}件合格\x1b[0m / ${fail > 0 ? `\x1b[31m${fail}件失敗\x1b[0m` : '0件失敗'}\n`);
process.exit(fail > 0 ? 1 : 0);
