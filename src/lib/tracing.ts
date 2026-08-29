// なぞり書きの「合っているか」を判定する部分。
//
// AIは使いません。すべて計算だけで決めています。
// 判定するのは3つ:
//   1. 書きはじめの場所が合っているか
//   2. 書く向きが合っているか（逆から書いていないか）
//   3. 画の順番が合っているか（次の画を先に書いていないか）
//
// 座標は KanjiVG の 109×109 のマス目にそろえてから比べます。
// （画面の大きさが変わっても判定が変わらないようにするため）

import { dist, pathToPolyline, polylineLength, resample, type Point } from './svgpath.ts';

/** KanjiVG のマス目の大きさ */
export const KVG_SIZE = 109;

/** 判定に使うものさし（109のマス目での長さ） */
export const THRESHOLD = {
  /** 書きはじめの位置のずれ。これより離れていたら「はじめの場所がちがう」 */
  start: 24,
  /** 書きおわりの位置のずれ */
  end: 26,
  /** 線全体の形のずれ（平均） */
  shape: 20,
  /** これ以下の長さしか動いていなければ「点をうっただけ」とみなす */
  minLength: 4,
  /**
   * 書きはじめの許容範囲の下限。
   * 短い画では、許容範囲が画そのものより広いと
   * 「はじめ」と「おわり」の区別がつかなくなるので、画の長さに応じてせまくする。
   */
  startMin: 10,
  /** 始点と終点のへだたりに対する、許容範囲の割合 */
  startRatio: 0.55,
};

export type TraceVerdict =
  | { ok: true; score: number }
  | {
      ok: false;
      /** なぜだめだったか */
      reason: 'tooShort' | 'start' | 'reversed' | 'shape' | 'order';
      /** 子どもに見せる文 */
      message: string;
      /** 順番ちがいのとき、実際に書いてしまった画の番号（1から数える） */
      matchedStroke?: number;
      score: number;
    };

/** お手本の1画ぶんの情報 */
export interface RefStroke {
  /** もとのパス文字列（画面に描くのに使う） */
  d: string;
  /** 等間隔に取り直した点 */
  points: Point[];
  start: Point;
  end: Point;
  length: number;
}

/** お手本のパスを、判定に使える形にしておく */
export function prepareStrokes(paths: string[], n = 32): RefStroke[] {
  return paths.map((d) => {
    const line = pathToPolyline(d);
    const points = resample(line, n);
    return {
      d,
      points,
      start: points[0],
      end: points[points.length - 1],
      length: polylineLength(line),
    };
  });
}

/** 2つの線の「形のちがい」。点どうしの距離の平均 */
function meanDistance(a: Point[], b: Point[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += dist(a[i], b[i]);
  return sum / n;
}

/** お手本1画と、なぞった線を比べて点数をつける（小さいほど良い） */
function compare(userPts: Point[], ref: RefStroke) {
  const forward = meanDistance(userPts, ref.points);
  const backward = meanDistance([...userPts].reverse(), ref.points);
  return {
    forward,
    backward,
    startDist: dist(userPts[0], ref.start),
    endDist: dist(userPts[userPts.length - 1], ref.end),
  };
}

/**
 * なぞった線が、いま書くべき画（strokeIndex）と合っているかを判定する。
 *
 * @param rawUserPoints 画面から拾った点（すでに 109×109 のマス目に直したもの）
 * @param refs          お手本の全画
 * @param strokeIndex   いま書くべき画（0から数える）
 */
export function judgeStroke(
  rawUserPoints: Point[],
  refs: RefStroke[],
  strokeIndex: number,
): TraceVerdict {
  const ref = refs[strokeIndex];
  if (!ref) return { ok: false, reason: 'shape', message: 'もういちど やってみよう', score: 999 };

  // 点が少なすぎる／ほとんど動いていない
  const rawLen = polylineLength(rawUserPoints);
  if (rawUserPoints.length < 2 || rawLen < THRESHOLD.minLength) {
    return {
      ok: false,
      reason: 'tooShort',
      message: 'せんが みじかすぎるよ。おてほんの うえを なぞってね',
      score: 999,
    };
  }

  const user = resample(rawUserPoints, ref.points.length);
  const c = compare(user, ref);

  // この画で許される「書きはじめのずれ」。
  // 始点と終点が近い画ほどせまくする（でないと、逆から書いても気づけない）
  const span = dist(ref.start, ref.end);
  const startTol = Math.min(
    THRESHOLD.start,
    Math.max(THRESHOLD.startMin, span * THRESHOLD.startRatio),
  );

  // ── 逆から書いていないか ──
  // 逆にしたほうがはっきり合う場合は「向きがちがう」
  if (c.backward + 6 < c.forward && c.backward <= THRESHOLD.shape) {
    return {
      ok: false,
      reason: 'reversed',
      message: 'かく むきが ぎゃくだよ。はんたいから なぞってみよう',
      score: c.forward,
    };
  }

  // ── 書きはじめの場所 ──
  if (c.startDist > startTol) {
    // ただし、ほかの画のほうがぴったり合うなら「順番ちがい」として伝える
    const other = findBetterStroke(user, refs, strokeIndex);
    if (other !== null) {
      return {
        ok: false,
        reason: 'order',
        message: `それは ${other + 1}かくめ の せんだよ。さきに ${strokeIndex + 1}かくめ を かこう`,
        matchedStroke: other + 1,
        score: c.forward,
      };
    }
    return {
      ok: false,
      reason: 'start',
      message: 'かきはじめの ばしょが ちがうよ。ひかっている ●から はじめてね',
      score: c.forward,
    };
  }

  // ── 順番ちがい（書きはじめは近いが、別の画をなぞっている）──
  // 「青」の1画目と3画目のように、平行にならんだ横画では
  // いまの画も許容範囲に入ってしまう。
  // ほかの画のほうがはっきりよく合っているなら、順番ちがいとして伝える。
  const other = findBetterStroke(user, refs, strokeIndex);
  if (other !== null) {
    return {
      ok: false,
      reason: 'order',
      message: `それは ${other + 1}かくめ の せんだよ。さきに ${strokeIndex + 1}かくめ を かこう`,
      matchedStroke: other + 1,
      score: c.forward,
    };
  }

  // ── 形 ──
  if (c.forward > THRESHOLD.shape || c.endDist > THRESHOLD.end) {
    return {
      ok: false,
      reason: 'shape',
      message: 'おてほんから はなれちゃったみたい。うすい せんの うえを なぞってね',
      score: c.forward,
    };
  }

  return { ok: true, score: c.forward };
}

/**
 * いま書くべき画より、ほかの画のほうがずっとよく合っているかを調べる。
 * 合っていれば、その画の番号（0から数える）を返す。
 */
function findBetterStroke(user: Point[], refs: RefStroke[], skip: number): number | null {
  const here = meanDistance(user, refs[skip].points);
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < refs.length; i++) {
    if (i === skip) continue;
    const s = meanDistance(resample(user, refs[i].points.length), refs[i].points);
    const startD = dist(user[0], refs[i].start);
    const span = dist(refs[i].start, refs[i].end);
    const tol = Math.min(THRESHOLD.start, Math.max(THRESHOLD.startMin, span * THRESHOLD.startRatio));
    // 形も書きはじめも合っている画だけを候補にする
    if (s < bestScore && s <= THRESHOLD.shape && startD <= tol) {
      bestScore = s;
      best = i;
    }
  }
  // いまの画よりはっきり良いときだけ「順番ちがい」と言う
  if (best >= 0 && bestScore + 5 < here) return best;
  return null;
}

/**
 * 画面の座標を、KanjiVG の 109×109 のマス目に直す。
 * マス目は正方形なので、短いほうの辺に合わせる。
 */
export function toKvgCoords(
  points: Point[],
  rect: { width: number; height: number },
): Point[] {
  const size = Math.min(rect.width, rect.height);
  const offX = (rect.width - size) / 2;
  const offY = (rect.height - size) / 2;
  const k = KVG_SIZE / size;
  return points.map((p) => ({ x: (p.x - offX) * k, y: (p.y - offY) * k }));
}
