/**
 * 復習のしくみと問題づくりが正しく動くかを確かめるテスト。
 *   node --experimental-strip-types scripts/test/logic-test.mts
 */
import { readFileSync } from 'node:fs';
import {
  applyAnswer, newProgress, pickForSession, summarize, toDateKey, addDays, BOX_INTERVALS,
} from '../../src/lib/leitner.ts';
import {
  buildWordIndex, charsForKyu, collectReadings, makeReadingQuestion, isCorrect, normalizeAnswer,
  makeWritingQuestion, toKatakana,
} from '../../src/lib/questions.ts';
import type { KanjiEntry, WordEntry, Progress } from '../../src/lib/types.ts';

const kanji: KanjiEntry[] = JSON.parse(readFileSync('src/data/kanji.json', 'utf8')).kanji;
const words: WordEntry[] = JSON.parse(readFileSync('src/data/words.json', 'utf8')).words;

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? ' … ' + extra : ''}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}${extra ? ' … ' + extra : ''}`); }
};

console.log('\n▶ テスト1　級ごとの対象漢字');
const c6 = charsForKyu(kanji, 6);
const c5 = charsForKyu(kanji, 5);
check('6級は835字', c6.length === 835, `${c6.length}字`);
check('5級は1026字', c5.length === 1026, `${c5.length}字`);
check('6級に6年生の漢字が入っていない',
  c6.every((c) => kanji.find((k) => k.c === c)!.grade <= 5));
check('学年の高い順にならんでいる（新出漢字から練習する）',
  c6.every((c, i) => i === 0 || kanji.find((k) => k.c === c)!.grade <= kanji.find((k) => k.c === c6[i-1])!.grade));
check('6級の1字目は5年配当（「一」から始めない）',
  kanji.find((k) => k.c === c6[0])!.grade === 5, `1字目は「${c6[0]}」（${kanji.find((k) => k.c === c6[0])!.grade}年）`);
check('5級の1字目は6年配当',
  kanji.find((k) => k.c === c5[0])!.grade === 6, `1字目は「${c5[0]}」（${kanji.find((k) => k.c === c5[0])!.grade}年）`);

console.log('\n▶ テスト2　問題づくり');
const idx6 = buildWordIndex(words, 6);
const pool6 = collectReadings(words, 6);
let made = 0;
const missing: string[] = [];
const used = new Set<string>();
for (const c of c6) {
  const q = makeReadingQuestion(c, idx6, pool6, used);
  if (q) made++; else missing.push(c);
}
// 校正がまだの熟語しか無い漢字は、出題されないのが正しい動き
const pendingChars = new Set(words.filter((w) => !w.verified).flatMap((w) => [...w.w]));
check('問題が作れない漢字は、校正まちの熟語しか無い字だけ',
  missing.every((c) => pendingChars.has(c)),
  `作れた ${made}字 / 作れない ${missing.length}字${missing.length ? '：' + missing.join('') : ''}`);
check('6級の 829字以上で問題が作れる', made >= 829, `${made}字`);

const idx5 = buildWordIndex(words, 5);
const pool5 = collectReadings(words, 5);
const used5 = new Set<string>();
const missing5 = c5.filter((c) => !makeReadingQuestion(c, idx5, pool5, used5));
check('5級も、作れないのは校正まちの字だけ',
  missing5.every((c) => pendingChars.has(c)),
  `作れない ${missing5.length}字${missing5.length ? '：' + missing5.join('') : ''}`);

const sample = makeReadingQuestion('税', buildWordIndex(words, 6), pool6, new Set());
check('選択肢は4つ', sample!.choices.length === 4, sample!.choices.join(' / '));
check('選択肢に正解が入っている', sample!.choices.includes(sample!.answer));
check('選択肢に重複がない', new Set(sample!.choices).size === 4);
console.log(`    例）「${sample!.word}」→ 正解「${sample!.answer}」／選択肢 ${sample!.choices.join('・')}`);

// 校正していない熟語が出題されないこと
const unverified = new Set(words.filter((w) => !w.verified).map((w) => w.w));
let leaked = 0;
const u2 = new Set<string>();
for (const c of c6) { const q = makeReadingQuestion(c, idx6, pool6, u2); if (q && unverified.has(q.word)) leaked++; }
check('校正していない熟語は出題されない', leaked === 0, `もれ ${leaked}件`);

// 6級の問題に6年生の漢字が混ざらないこと
const u3 = new Set<string>();
const g6 = new Set(kanji.filter((k) => k.grade === 6).map((k) => k.c));
let outOfRange = 0;
for (const c of c6) { const q = makeReadingQuestion(c, idx6, pool6, u3); if (q && [...q.word].some((x) => g6.has(x))) outOfRange++; }
check('6級の問題に6年生の漢字が混ざらない', outOfRange === 0, `混入 ${outOfRange}件`);

console.log('\n▶ テスト2b　書き取り問題（自己採点）');
{
  const usedW = new Set<string>();
  const missW: string[] = [];
  let madeW = 0;
  for (const c of c6) {
    const q = makeWritingQuestion(c, idx6, usedW);
    if (q) madeW++; else missW.push(c);
  }
  check('6級の全835字で書き取り問題が作れる', missW.length === 0,
    `作れた ${madeW}字${missW.length ? ' / 作れない：' + missW.join('') : ''}`);

  const usedW5 = new Set<string>();
  const missW5 = c5.filter((c) => !makeWritingQuestion(c, idx5, usedW5));
  check('5級でも、作れないのは校正まちの字だけ',
    missW5.every((c) => pendingChars.has(c)),
    `作れない ${missW5.length}字${missW5.length ? '：' + missW5.join('') : ''}`);

  const wq = makeWritingQuestion('税', buildWordIndex(words, 6), new Set())!;
  check('書かせる字だけがカタカナになる', wq.display.includes(wq.targetReading) && !wq.display.includes('税'),
    `${wq.word} → 「${wq.display}」（こたえ：${wq.answer}）`);
  check('カタカナは音読み・訓読みの形になっている', /^[ァ-ヶー]+$/.test(wq.targetReading), wq.targetReading);
  check('ひらがな→カタカナの変換', toKatakana('ぜいきん') === 'ゼイキン', toKatakana('ぜいきん'));

  // 熟字訓（今日＝きょう など）は1字ずつに分けられないので使わない
  const juku = words.filter((w) => w.jukujikun).map((w) => w.w);
  let jukuUsed = 0;
  const u = new Set<string>();
  for (const c of c6) { const q = makeWritingQuestion(c, idx6, u); if (q && juku.includes(q.word)) jukuUsed++; }
  check('熟字訓は書き取りに使わない', jukuUsed === 0, `つかわれた ${jukuUsed}語`);

  // 校正していない熟語は使わない
  let leakW = 0;
  const u2 = new Set<string>();
  for (const c of c6) { const q = makeWritingQuestion(c, idx6, u2); if (q && unverified.has(q.word)) leakW++; }
  check('校正していない熟語は書き取りに出ない', leakW === 0, `もれ ${leakW}件`);

  // 6級の問題に6年生の漢字が混ざらない
  let outW = 0;
  const u3 = new Set<string>();
  for (const c of c6) {
    const q = makeWritingQuestion(c, idx6, u3);
    if (q && [...q.word].some((x) => g6.has(x))) outW++;
  }
  check('6級の書き取りに6年生の漢字が混ざらない', outW === 0, `混入 ${outW}件`);

  // 例：どんな見た目になるか
  const samples = ['税', '桜', 'faults'[0]].filter((c) => c && c6.includes(c));
  for (const c of samples) {
    const q = makeWritingQuestion(c, buildWordIndex(words, 6), new Set());
    if (q) console.log(`    例）「${q.display}」（${q.wordReading}）→ こたえ「${q.answer}」`);
  }
}

console.log('\n▶ テスト3　答え合わせ');
check('ひらがなで正解', isCorrect(sample!, sample!.answer));
check('カタカナでも正解になる', isCorrect(sample!, sample!.answer.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))));
check('前後の空白は無視される', isCorrect(sample!, `  ${sample!.answer} `));
check('ちがう読みは不正解', !isCorrect(sample!, 'あいうえお'));
check('空っぽは不正解', !isCorrect(sample!, ''));
check('正規化', normalizeAnswer(' ゼイ キン ') === 'ぜいきん', normalizeAnswer(' ゼイ キン '));

console.log('\n▶ テスト3b　承認していない熟語が出題されないこと');
{
  const notApproved = words.filter((w) => !w.verified);
  check('確認まちの熟語は2語だけ（茨城・届出）', notApproved.length === 2,
    notApproved.map((w) => `${w.w}(${w.r})`).join('、'));
  const idxAll = buildWordIndex(words, 5);
  const inIndex = notApproved.filter((w) =>
    [...w.w].some((c) => (idxAll.get(c) ?? []).some((x) => x.w === w.w)),
  );
  check('確認まちの熟語は出題データに入っていない', inIndex.length === 0,
    inIndex.map((w) => w.w).join('、'));
  const approvedNow = ['小皿', '大皿', '新潟', '熊本', '小熊', '宮崎', '長崎', '川崎', '山梨', '梨花', '受賞', '大賞', '賞賛'];
  const missing = approvedNow.filter((w) => !words.find((x) => x.w === w && x.verified));
  check('保護者が承認した13語は出題される', missing.length === 0,
    missing.length ? '出ていない：' + missing.join('、') : '13語すべて出題できる');
  const blocked6 = c6.filter((c) => !(idx6.get(c)?.length));
  check('6級は835字ぜんぶ出題できる', blocked6.length === 0,
    blocked6.length ? '出せない：' + blocked6.join('') : '835字すべてOK');
}

console.log('\n▶ テスト4　復習の間隔（Leitner）');
check('箱の間隔が 1/2/4/7/14日',
  JSON.stringify(Object.values(BOX_INTERVALS)) === JSON.stringify([1,2,4,7,14]));
let p: Progress = newProgress('税');
check('最初は箱1', p.box === 1);
const today = new Date();
p = applyAnswer(p, true, today);
check('正解すると箱2、次の復習は2日後', p.box === 2 && p.nextReview === addDays(2, today), p.nextReview);
p = applyAnswer(p, true, today);
check('もう一度正解で箱3、4日後', p.box === 3 && p.nextReview === addDays(4, today), p.nextReview);
p = applyAnswer(p, false, today);
check('まちがえると箱1に戻り、1日後', p.box === 1 && p.nextReview === addDays(1, today), p.nextReview);
check('正解数・不正解数が数えられている', p.correct === 2 && p.wrong === 1, `正解${p.correct}/不正解${p.wrong}`);
let top = newProgress('金');
for (let i = 0; i < 10; i++) top = applyAnswer(top, true, today);
check('箱5より上には行かない', top.box === 5);

console.log('\n▶ テスト5　「翌日に復習が出る」ことの確認（完了基準）');
{
  const progress = new Map<string, Progress>();
  const canUse = (c: string) => (idx6.get(c)?.length ?? 0) > 0;
  // きょう10問といた（うち3問まちがえた）とする
  const pickToday = pickForSession({ candidates: c6, progress, size: 10, canUse });
  check('初日は10問ぶんの漢字が選ばれる', pickToday.chars.length === 10, `${pickToday.chars.length}字`);
  check('初日はすべて新出漢字', pickToday.newCount === 10 && pickToday.dueCount === 0);

  pickToday.chars.forEach((c, i) => {
    progress.set(c, applyAnswer(newProgress(c), i >= 3, today));
  });

  // あしたの朝
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);
  const due = [...progress.values()].filter((x) => x.nextReview <= tomorrowKey);
  check('あしたは、まちがえた3字が復習に出る', due.length === 3, `${due.length}字：${due.map((x) => x.c).join('')}`);
  check('正解した7字は、あしたは出ない', due.every((x) => x.box === 1));

  const pickTomorrow = pickForSession({ candidates: c6, progress, size: 10, today: tomorrowKey, canUse });
  check('あしたのセッションに、その3字が入っている',
    due.every((d) => pickTomorrow.chars.includes(d.c)), `復習${pickTomorrow.dueCount}問＋新出${pickTomorrow.newCount}問`);
  check('あしたも合計10問になる', pickTomorrow.chars.length === 10, `${pickTomorrow.chars.length}字`);

  // 2日後：正解した7字（箱2＝2日後）が出てくる
  const day2 = new Date(today); day2.setDate(day2.getDate() + 2);
  const due2 = [...progress.values()].filter((x) => x.nextReview <= toDateKey(day2));
  check('2日後には、正解した7字も復習に出る', due2.length === 10, `${due2.length}字`);
}

console.log('\n▶ テスト6　セッションの選び方');
{
  const progress = new Map<string, Progress>();
  // 復習が20字たまっている状態を作る
  for (const c of c6.slice(0, 20)) {
    progress.set(c, { ...newProgress(c), nextReview: addDays(-1, today), box: 2 });
  }
  const pick = pickForSession({ candidates: c6, progress, size: 10 });
  check('復習がたまっていたら復習を優先する', pick.dueCount === 10 && pick.newCount === 0,
    `復習${pick.dueCount}／新出${pick.newCount}`);
  check('1回のセッションは必ず10問で終わる', pick.chars.length === 10);
}
{
  const progress = new Map<string, Progress>();
  const pick = pickForSession({ candidates: c6, progress, size: 15, maxNew: 5 });
  check('新出漢字は上限を超えない', pick.chars.length === 5, `${pick.chars.length}字（上限5）`);
}

console.log('\n▶ テスト7　ホーム画面の集計');
{
  const progress = new Map<string, Progress>();
  for (const c of c6.slice(0, 30)) progress.set(c, applyAnswer(newProgress(c), true, today));
  const s = summarize(c6, progress, toDateKey(today));
  check('対象字数', s.total === 835, `${s.total}字`);
  check('練習中の字数', s.learned === 30, `${s.learned}字`);
  check('未学習の字数', s.unseen === 805, `${s.unseen}字`);
  check('きょうの復習は0（全部あさって以降）', s.due === 0);
  check('箱2に30字', s.boxes[2] === 30);
}

console.log(`\n${'='.repeat(52)}`);
console.log(`合格 ${pass}件 / 不合格 ${fail}件`);
if (fail > 0) process.exitCode = 1;
else console.log('\x1b[32m\x1b[1mすべて合格しました。\x1b[0m');
