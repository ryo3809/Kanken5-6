// 間隔反復（Leitner方式）の計算だけを集めたファイル。
// 画面の作りとは切り離してあるので、ここだけ読めば復習の仕組みが分かります。
//
//   正解 →                正解 →                正解 →         正解 →
// [箱1] ──→ [箱2] ──→ [箱3] ──→ [箱4] ──→ [箱5]
//  1日      2日       4日       7日       14日
//   ↑                                          │
//   └────────── まちがえたら必ず箱1へ ←──────────┘

import type { Box, Progress } from './types';

/** 箱ごとの復習間隔（日数） */
export const BOX_INTERVALS: Record<Box, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 7,
  5: 14,
};

/** その日を YYYY-MM-DD の文字列にする（端末の時計の日付を使う） */
export function toDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** きょうから n 日後の日付キー */
export function addDays(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** まだ一度も出していない漢字の、まっさらな習熟度を作る */
export function newProgress(c: string): Progress {
  return { c, box: 1, nextReview: toDateKey(), correct: 0, wrong: 0, lastAnsweredAt: 0 };
}

/**
 * 答えたあとの習熟度を計算する。
 * もとの Progress は書きかえず、新しい値を返す（元のデータを壊さないため）。
 */
export function applyAnswer(prev: Progress, isCorrect: boolean, now: Date = new Date()): Progress {
  const box: Box = isCorrect ? (Math.min(prev.box + 1, 5) as Box) : 1;
  return {
    ...prev,
    box,
    nextReview: addDays(BOX_INTERVALS[box], now),
    correct: prev.correct + (isCorrect ? 1 : 0),
    wrong: prev.wrong + (isCorrect ? 0 : 1),
    lastAnsweredAt: now.getTime(),
  };
}

/** きょう復習すべきか */
export function isDue(p: Progress, today: string = toDateKey()): boolean {
  return p.nextReview <= today;
}

/**
 * きょう出題する漢字を選ぶ。
 *   1. 復習の日が来ている漢字（期限が古いもの・箱が小さいものから優先）
 *   2. 足りない分を、まだ習っていない漢字で埋める（学年順）
 * 新出漢字は1回のセッションで maxNew 字までに抑える（急に増えすぎないように）。
 */
export function pickForSession(options: {
  /** その級の対象漢字（学年順にならんでいること） */
  candidates: string[];
  /** いまの習熟度 */
  progress: Map<string, Progress>;
  /** 何問出すか */
  size: number;
  /** 新出漢字の上限。ふつうは size と同じでよい */
  maxNew?: number;
  today?: string;
  /**
   * その漢字で問題を作れるかどうか。
   * 校正がまだの熟語しか無い漢字は、ここで false になり選ばれません。
   */
  canUse?: (c: string) => boolean;
}): { chars: string[]; dueCount: number; newCount: number } {
  const { progress, size, today = toDateKey(), canUse } = options;
  const candidates = canUse ? options.candidates.filter(canUse) : options.candidates;
  const maxNew = options.maxNew ?? size;

  const due = candidates
    .map((c) => progress.get(c))
    .filter((p): p is Progress => !!p && isDue(p, today))
    .sort((a, b) => a.nextReview.localeCompare(b.nextReview) || a.box - b.box)
    .map((p) => p.c);

  const unseen = candidates.filter((c) => !progress.has(c));

  const chars = due.slice(0, size);
  const room = Math.min(size - chars.length, maxNew);
  const added = unseen.slice(0, Math.max(0, room));
  chars.push(...added);

  return { chars, dueCount: Math.min(due.length, size), newCount: added.length };
}

/** ホーム画面に出す「きょうの状況」 */
export function summarize(
  candidates: string[],
  progress: Map<string, Progress>,
  today: string = toDateKey(),
) {
  let due = 0;
  let unseen = 0;
  let learned = 0;
  const boxes: Record<Box, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const c of candidates) {
    const p = progress.get(c);
    if (!p) {
      unseen++;
      continue;
    }
    learned++;
    boxes[p.box]++;
    if (isDue(p, today)) due++;
  }
  return { total: candidates.length, due, unseen, learned, boxes };
}
