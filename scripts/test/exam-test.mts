/**
 * 模擬試験の問題づくりを確かめるテスト。
 *   npm run test:exam
 */
import { readFileSync } from 'node:fs';
import { buildExam, classifyOnKun, isAutoScored, makeRng } from '../../src/lib/exam.ts';
import type { KanjiEntry, KozoEntry, PairEntry, WordEntry } from '../../src/lib/types.ts';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ' … ' + extra : ''}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}${extra ? ' … ' + extra : ''}`); }
};

const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const data = {
  kanji: read('src/data/kanji.json').kanji as KanjiEntry[],
  words: read('src/data/words.json').words as WordEntry[],
  pairs: read('src/data/pairs.json').pairs as PairEntry[],
  kozo: read('src/data/kozo.json').kozo as KozoEntry[],
};
const byChar = new Map(data.kanji.map((k) => [k.c, k]));

console.log('\n▶ テスト1　6級の模試が作れるか');
const e6 = buildExam(6, data, 12345);
console.log(`    いまの満点 ${e6.totalPoints}点 / 本番 ${e6.fullPoints}点`);
for (const s of e6.sections) {
  console.log(`      ${s.no} ${s.title}　${s.questions.length}問 ${s.points}点`);
}
if (e6.skipped.length) {
  console.log('    出せなかった大問:');
  for (const s of e6.skipped) console.log(`      ${s.no} ${s.title}（${s.points}点）… ${s.why}`);
}
check('本番の満点が200点', e6.fullPoints === 200, `${e6.fullPoints}点`);
check('大問が11個ある（作れなかったものを含めて）',
  e6.sections.length + e6.skipped.filter((s) => !e6.sections.find((x) => x.no === s.no)).length === 11,
  `作れた ${e6.sections.length}個 / 作れない ${e6.skipped.length}個`);
check('いまの満点が160点以上', e6.totalPoints >= 160, `${e6.totalPoints}点`);
check('各大問の配点が本番どおり',
  e6.sections.every((s) => s.questions.every((q) => q.points === s.questions[0].points)));

console.log('\n▶ テスト2　問題の中身');
for (const s of e6.sections) {
  const q = s.questions[0];
  const shown = q.kind === 'choice' ? `（${q.choices?.length}択）` : q.kind === 'text' ? '（ひらがな入力）' : '（手書き）';
  console.log(`    ${s.no} ${q.prompt}${q.hint ? '　' + q.hint : ''} → ${q.answer} ${shown}`);
}
check('すべての問題に正解がある', e6.sections.every((s) => s.questions.every((q) => !!q.answer)));
check('選ぶ問題は、選択肢に正解が入っている',
  e6.sections.every((s) => s.questions.every((q) => q.kind !== 'choice' || q.choices!.includes(q.answer))));
check('選ぶ問題の選択肢に重複がない',
  e6.sections.every((s) => s.questions.every((q) => q.kind !== 'choice' || new Set(q.choices).size === q.choices!.length)));
check('手書きの問題には、お手本の漢字がある',
  e6.sections.every((s) => s.questions.every((q) => q.kind !== 'write' || (!!q.writeChar && !!q.writeGrade))));
check('問題のIDが重複していない',
  new Set(e6.sections.flatMap((s) => s.questions.map((q) => q.id))).size ===
  e6.sections.reduce((n, s) => n + s.questions.length, 0));

console.log('\n▶ テスト3　6級の問題に6年生の漢字が混ざらないこと');
{
  const g6 = new Set(data.kanji.filter((k) => k.grade === 6).map((k) => k.c));
  const bad: string[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const e = buildExam(6, data, seed);
    for (const s of e.sections) for (const q of s.questions) {
      // 部首は「漢字」ではなく「形」なので、配当表の外の字が選択肢に出てもよい
      // （本番の部首の問題でも、その級の配当外の部首が並びます）
      if (s.id === 'radical') continue;
      const text = `${q.prompt}${q.hint ?? ''}${q.answer}${(q.choices ?? []).join('')}`;
      for (const ch of text) if (g6.has(ch)) bad.push(`${s.no} ${q.prompt}→${ch}`);
    }
  }
  check('20回ぶん作っても6年生の漢字が出ない', bad.length === 0, bad.slice(0, 5).join(' / ') || '混入なし');
}

console.log('\n▶ テスト4　毎回ちがう問題になるか');
{
  const a = buildExam(6, data, 1);
  const b = buildExam(6, data, 2);
  const qa = a.sections.flatMap((s) => s.questions.map((q) => q.prompt));
  const qb = b.sections.flatMap((s) => s.questions.map((q) => q.prompt));
  const same = qa.filter((x, i) => x === qb[i]).length;
  check('たねを変えると問題が変わる', same < qa.length * 0.3, `同じ位置に同じ問題 ${same}/${qa.length}問`);
  const c = buildExam(6, data, 1);
  check('同じたねなら同じ問題になる（やり直しても再現できる）',
    JSON.stringify(a.sections.flatMap((s) => s.questions.map((q) => q.prompt))) ===
    JSON.stringify(c.sections.flatMap((s) => s.questions.map((q) => q.prompt))));
}

console.log('\n▶ テスト5　同じ問題が1回の模試に2回出ないか');
{
  let dup = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const e = buildExam(6, data, seed);
    for (const s of e.sections) {
      const keys = s.questions.map((q) => `${q.prompt}|${q.hint ?? ''}`);
      dup += keys.length - new Set(keys).size;
    }
  }
  check('10回ぶん作っても、同じ大問に同じ問題が出ない', dup === 0, `重複 ${dup}問`);
}

console.log('\n▶ テスト6　熟語の読み（音と訓）の分類');
{
  const samples: [string, string][] = [];
  const e = buildExam(6, data, 7);
  const sec = e.sections.find((s) => s.id === 'onkun');
  check('(九) の問題が作れる', !!sec && sec.questions.length === 10, `${sec?.questions.length}問`);
  for (const q of sec?.questions ?? []) samples.push([q.prompt, q.answer.slice(0, 1)]);
  console.log('    例:', samples.map(([w, a]) => `${w}=${a}`).join(' '));
  const kinds = new Set(samples.map(([, a]) => a));
  check('ア〜エ が かたよっていない（3種類以上出る）', kinds.size >= 3,
    `${kinds.size}種類（${[...kinds].join('')}）`);
  // 手で確かめられる例で検算する
  const w = (t: string) => data.words.find((x) => x.w === t)!;
  const cases: [string, number | null][] = [
    ['音楽', 0],   // オン＋ガク → 音と音
    ['野原', 2],   // の＋はら → 訓と訓
    ['field', null],
  ];
  for (const [word, expect] of cases) {
    if (!w(word)) continue;
    const got = classifyOnKun(w(word), byChar);
    check(`「${word}」の分類`, got === expect, `${got} （期待 ${expect}）`);
  }
}

console.log('\n▶ テスト7　自動で採点できる問題の割合');
{
  const auto = e6.sections.flatMap((s) => s.questions).filter(isAutoScored);
  const all = e6.sections.flatMap((s) => s.questions);
  const autoPts = auto.reduce((n, q) => n + q.points, 0);
  console.log(`    自動採点 ${auto.length}問 ${autoPts}点 / 自己採点 ${all.length - auto.length}問 ${e6.totalPoints - autoPts}点`);
  check('自動採点できる問題がある', auto.length > 0);
  check('手書きの問題もある（本番と同じく書く力を見る）', all.length > auto.length);
}

console.log('\n▶ テスト8　5級の模試');
{
  const e5 = buildExam(5, data, 99);
  console.log(`    いまの満点 ${e5.totalPoints}点 / 本番 ${e5.fullPoints}点`);
  for (const s of e5.sections) console.log(`      ${s.no} ${s.title}　${s.questions.length}問 ${s.points}点`);
  check('5級も本番の満点が200点', e5.fullPoints === 200);
  check('5級には四字熟語の大問がある', e5.sections.some((s) => s.id === 'yoji') || e5.skipped.some((s) => s.title === '四字熟語'));
  check('6級には四字熟語の大問がない', !e6.sections.some((s) => s.id === 'yoji'));
  check('6級には三字熟語の大問がある', e6.sections.some((s) => s.id === 'sanji'));
}

console.log('\n▶ テスト9　乱数');
{
  const r = makeRng(42);
  const vals = Array.from({ length: 1000 }, r);
  check('0以上1未満の値が出る', vals.every((v) => v >= 0 && v < 1));
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  check('かたよりが大きくない', Math.abs(avg - 0.5) < 0.05, `平均 ${avg.toFixed(3)}`);
}

console.log(`\n${'='.repeat(52)}`);
console.log(`合格 ${pass}件 / 不合格 ${fail}件`);
if (fail > 0) process.exitCode = 1;
else console.log('\x1b[32m\x1b[1mすべて合格しました。\x1b[0m');
