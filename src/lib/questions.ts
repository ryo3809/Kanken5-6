// 読み問題を作る部分。
//
// 作り方:
//   1. ねらう漢字を決める（Leitner が選ぶ）
//   2. その漢字を含む熟語のうち、いちばんよく使うものを選ぶ
//   3. 熟語を見せて、読みを答えさせる
//   4. 4択のときは、まぎらわしいダミーの読みを3つ用意する
//
// 出典が確かでない熟語（verified: false）は絶対に使いません。

import type { KanjiEntry, Kyu, Question, WordEntry } from './types';

/** 級ごとの対象漢字（学年順） */
export function charsForKyu(kanji: KanjiEntry[], kyu: Kyu): string[] {
  const maxGrade = kyu === 6 ? 5 : 6;
  return kanji
    .filter((k) => k.grade <= maxGrade)
    .sort((a, b) => a.grade - b.grade || a.order - b.order)
    .map((k) => k.c);
}

/** 漢字 → その漢字を含む熟語（よく使う順）の索引を作る */
export function buildWordIndex(words: WordEntry[], kyu: Kyu): Map<string, WordEntry[]> {
  const usable = words.filter((w) => {
    if (!w.verified) return false; // 校正が済んでいないものは出さない
    if (kyu === 6 && w.lv !== 6) return false; // 6級のときは6級の範囲だけ
    return true;
  });
  // freq が小さい（よく使う）順。freq が無い語は後ろ
  usable.sort((a, b) => (a.freq ?? 1e9) - (b.freq ?? 1e9));
  const index = new Map<string, WordEntry[]>();
  for (const w of usable) {
    for (const c of new Set(w.w)) {
      const list = index.get(c);
      if (list) list.push(w);
      else index.set(c, [w]);
    }
  }
  return index;
}

/** 配列をまぜる（元の配列は変えない） */
function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * ねらった漢字の読み問題を1問作る。
 * 熟語が見つからないときは null を返す（呼び出す側でとばす）。
 */
export function makeReadingQuestion(
  targetChar: string,
  wordIndex: Map<string, WordEntry[]>,
  allReadings: string[],
  used: Set<string>,
): Question | null {
  const candidates = wordIndex.get(targetChar);
  if (!candidates || candidates.length === 0) return null;

  // まだ出していない熟語を優先し、無ければよく使うものから
  const word = candidates.find((w) => !used.has(w.w)) ?? candidates[0];
  used.add(word.w);

  const answer = word.r;
  const acceptable = word.alt && word.alt.length > 0 ? [...new Set(word.alt)] : [answer];

  // 4択のダミー。文字数が近い読みを選ぶと、ほどよく迷う問題になる
  const pool = allReadings.filter(
    (r) => r !== answer && !acceptable.includes(r) && Math.abs(r.length - answer.length) <= 1,
  );
  const distractors = shuffle(pool).slice(0, 3);
  // 万一ダミーが足りなければ、条件をゆるめて埋める
  while (distractors.length < 3) {
    const extra = allReadings[Math.floor(Math.random() * allReadings.length)];
    if (extra !== answer && !distractors.includes(extra)) distractors.push(extra);
  }

  return {
    targetChar,
    word: word.w,
    answer,
    acceptable,
    choices: shuffle([answer, ...distractors]),
  };
}

/** 4択のダミーに使う読みの一覧（重複なし） */
export function collectReadings(words: WordEntry[], kyu: Kyu): string[] {
  const set = new Set<string>();
  for (const w of words) {
    if (!w.verified) continue;
    if (kyu === 6 && w.lv !== 6) continue;
    set.add(w.r);
  }
  return [...set];
}

/** ひらがな以外を取りのぞいて、入力のゆれを吸収する */
export function normalizeAnswer(input: string): string {
  return input
    .trim()
    // カタカナで入力されてもひらがなとして扱う
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    // 空白や記号は無視
    .replace(/[\s　・,、.。ー―‐-]/g, '');
}

/** 答え合わせ */
export function isCorrect(q: Question, input: string): boolean {
  const got = normalizeAnswer(input);
  if (!got) return false;
  return q.acceptable.some((a) => normalizeAnswer(a) === got);
}
