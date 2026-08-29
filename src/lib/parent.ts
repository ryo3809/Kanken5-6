// おうちの人の画面で使う、記録のまとめかた。
//
// ここは「見せ方」ではなく「数え方」だけを書いています。
// 数え方だけを取り出しておくと、テストで確かめられるからです。

import type { ExamResult, SelfGradeRecord, SessionRecord } from './types';

/** 大問ごとの成績（何回やって、平均でどれくらい取れているか） */
export interface SectionStat {
  no: string;
  title: string;
  /** とれた点の合計 */
  score: number;
  /** 満点の合計 */
  points: number;
  /** 正答率（0〜100） */
  rate: number;
  /** 何回の模試に出てきたか */
  times: number;
}

/**
 * 模試の記録から、大問ごとの成績を出す。
 *
 * 苦手な順（正答率の低い順）に並べて返します。
 * 1度も出ていない大問は入りません（承認まちで出せなかった大問など）。
 */
export function sectionStats(exams: ExamResult[]): SectionStat[] {
  const map = new Map<string, SectionStat>();
  for (const e of exams) {
    for (const s of e.sections ?? []) {
      if (!s || typeof s.points !== 'number' || s.points <= 0) continue;
      const cur = map.get(s.no) ?? { no: s.no, title: s.title, score: 0, points: 0, rate: 0, times: 0 };
      cur.score += s.score;
      cur.points += s.points;
      cur.times += 1;
      cur.title = s.title;
      map.set(s.no, cur);
    }
  }
  const out = [...map.values()].map((s) => ({ ...s, rate: Math.round((s.score / s.points) * 100) }));
  // 正答率の低い順。同じなら大問の番号順にして、並びが毎回変わらないようにする
  out.sort((a, b) => a.rate - b.rate || a.no.localeCompare(b.no));
  return out;
}

/** 模試ぜんたいのまとめ */
export interface ExamSummary {
  times: number;
  /** 最新の点（200点に直したときの点） */
  latest: number | null;
  best: number | null;
  /** 直近3回の平均（200点に直した点）。3回に満たなければ、ある分だけ */
  recentAverage: number | null;
  /** 合格ライン（140点）に届いた回数 */
  passed: number;
}

/** 満点がちがう回どうしを比べられるように、200点満点に直す */
export function scaleTo200(e: ExamResult): number {
  if (!e.total || e.total <= 0) return 0;
  return Math.round((e.score / e.total) * 200);
}

export function examSummary(exams: ExamResult[], passLine = 140): ExamSummary {
  if (exams.length === 0) {
    return { times: 0, latest: null, best: null, recentAverage: null, passed: 0 };
  }
  // 新しい順に並べる（保存の順に頼らない）
  const sorted = [...exams].sort((a, b) => b.at - a.at);
  const scaled = sorted.map(scaleTo200);
  const recent = scaled.slice(0, 3);
  return {
    times: exams.length,
    latest: scaled[0],
    best: Math.max(...scaled),
    recentAverage: Math.round(recent.reduce((a, b) => a + b, 0) / recent.length),
    passed: scaled.filter((s) => s >= passLine).length,
  };
}

/** 直近 n 日の学習のようす（日ごとの問題数） */
export function recentDays(
  sessions: SessionRecord[],
  days = 14,
  today = new Date(),
): { date: string; count: number }[] {
  const byDate = new Map<string, number>();
  for (const s of sessions) byDate.set(s.date, (byDate.get(s.date) ?? 0) + (s.total ?? 0));
  const out: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ date: key, count: byDate.get(key) ?? 0 });
  }
  return out;
}

/**
 * 自己採点が甘くなっていないかの目安。
 *
 * 「できた」が多すぎるときだけ、注意の文を返します。
 * 少ないことは責めません（できないことを責める作りにはしない、という決まりです）。
 */
export function selfGradeWarning(grades: SelfGradeRecord[]): string | null {
  if (grades.length < 20) return null;
  const ok = grades.filter((g) => g.grade === 'ok').length;
  const rate = (ok / grades.length) * 100;
  if (rate < 95) return null;
  return (
    'ほぼ全問が「できた」になっています。'
    + 'お手本と見くらべる目安がゆるくなっていないか、一度いっしょに確認してみてください。'
  );
}
