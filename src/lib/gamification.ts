// レベル・おさんぽマップ・ごほうびの計算。
//
// 大事にしていること:
//   ・まちがえても経験値はもらえる（責めない・減点しない）
//   ・休んでも、貯まったものは絶対に減らない
//   ・「あと◯問やらないと終われない」という作りにしない
//
// 画面の作りとは切りはなしてあるので、ここだけ読めば仕組みが分かります。

/** 1回の行動でもらえる経験値 */
export const EXP = {
  /** 読み問題に答えた（正解） */
  readingCorrect: 3,
  /** 読み問題に答えた（まちがい）※ゼロにはしない */
  readingWrong: 1,
  /** 書き取りで「できた」を選んだ */
  writingOk: 4,
  /** 書き取りで「おしい／まちがえた」を選んだ */
  writingOther: 2,
  /** なぞり書きで1字なぞれた */
  tracingChar: 6,
  /** 分野べつれんしゅうで1問こたえた（正解） */
  practiceCorrect: 3,
  /** 分野べつれんしゅうで1問こたえた（まちがい）※ゼロにはしない */
  practiceWrong: 1,
  /** その日はじめての学習 */
  firstOfDay: 10,
};

/** レベルアップに必要な経験値（そのレベルになるまでの累計） */
export function expForLevel(level: number): number {
  if (level <= 1) return 0;
  // レベル2まで30、3まで70、4まで120…と、だんだん増える
  return 30 * (level - 1) + 10 * (level - 1) * (level - 2);
}

/** 累計経験値から、いまのレベルを求める */
export function levelFromExp(exp: number): number {
  let level = 1;
  while (level < 99 && exp >= expForLevel(level + 1)) level++;
  return level;
}

/** いまのレベルの中で、次のレベルまでどれくらい進んだか */
export function levelProgress(exp: number): {
  level: number;
  current: number;
  need: number;
  ratio: number;
} {
  const level = levelFromExp(exp);
  const base = expForLevel(level);
  const next = expForLevel(level + 1);
  const need = next - base;
  const current = exp - base;
  return { level, current, need, ratio: need === 0 ? 1 : Math.min(1, current / need) };
}

// ────────────────────────────────────────────────────────────
// おさんぽマップ
// ────────────────────────────────────────────────────────────

export interface MapSpot {
  /** 場所の名前 */
  name: string;
  /** ここに着くのに必要な累計経験値 */
  exp: number;
  /** 空の色（上・下） */
  sky: [string, string];
  /** 地面の色 */
  ground: string;
  /** 目じるしの絵 */
  motif: 'house' | 'tree' | 'river' | 'forest' | 'hill' | 'beach' | 'mountain' | 'town' | 'night' | 'star';
  /** ここに着いたらもらえるもの（items.ts の id） */
  reward?: string;
  /** 着いたときのひとこと */
  line: string;
}

/**
 * おさんぽマップの道のり。
 * ゴールに着くと、新しい風景とごほうびがもらえます。
 */
export const MAP_SPOTS: MapSpot[] = [
  { name: 'おうちの まえ', exp: 0,    sky: ['#cfe8f7', '#eaf6fd'], ground: '#a8d18a', motif: 'house',    line: 'ここから しゅっぱつ！' },
  { name: 'こうえん',     exp: 60,   sky: ['#cfe8f7', '#eaf6fd'], ground: '#9ecf7e', motif: 'tree',     reward: 'collar-red',   line: 'こうえんに ついた！' },
  { name: 'かわの ほとり', exp: 180,  sky: ['#c6e6f5', '#e8f5fb'], ground: '#8fc9a0', motif: 'river',    line: 'かわの おとが きこえる' },
  { name: 'もりの みち',   exp: 380,  sky: ['#d6ecc9', '#eef7e6'], ground: '#7fb865', motif: 'forest',   reward: 'hat-straw',    line: 'もりは すずしいね' },
  { name: 'おかの うえ',   exp: 650,  sky: ['#ffe6bf', '#fff4de'], ground: '#a6cf7a', motif: 'hill',     line: 'とおくまで 見えるよ' },
  { name: 'うみべ',       exp: 1000, sky: ['#bfe4f5', '#e6f5fb'], ground: '#f0dfb0', motif: 'beach',    reward: 'collar-blue',  line: 'うみだ！ ひろいね' },
  { name: 'やまの ふもと', exp: 1450, sky: ['#cde3f0', '#e9f3f8'], ground: '#8fb87a', motif: 'mountain', line: 'たかい やまだね' },
  { name: 'まちの ひろば', exp: 2000, sky: ['#ffd9c2', '#fff0e4'], ground: '#c9b89a', motif: 'town',     reward: 'hat-knit',     line: 'にぎやかな まちだ' },
  { name: 'よぞらの おか', exp: 2700, sky: ['#3b4a78', '#6b7fae'], ground: '#4f6a4a', motif: 'night',    reward: 'collar-green', line: 'ほしが きれいだね' },
  { name: 'ほしの みえる みさき', exp: 3600, sky: ['#2b3560', '#55639b'], ground: '#3f5a48', motif: 'star', reward: 'hat-cap',   line: 'ここまで きたね！' },
  { name: 'やまの ちょうじょう',  exp: 4800, sky: ['#ffd0a8', '#ffeede'], ground: '#9db87a', motif: 'mountain', reward: 'collar-bell', line: 'てっぺんだ！' },
  { name: 'にじの ゴール',  exp: 6500, sky: ['#ffe9c9', '#fff7ec'], ground: '#a8d18a', motif: 'star',     reward: 'hat-crown',    line: 'ゴール！ ほんとうに すごい！' },
];

/** いまいる場所と、次の場所までの進みぐあい */
export function mapProgress(exp: number): {
  index: number;
  spot: MapSpot;
  next: MapSpot | null;
  ratio: number;
  reachedAll: boolean;
} {
  let index = 0;
  for (let i = 0; i < MAP_SPOTS.length; i++) if (exp >= MAP_SPOTS[i].exp) index = i;
  const spot = MAP_SPOTS[index];
  const next = MAP_SPOTS[index + 1] ?? null;
  const ratio = next ? Math.min(1, (exp - spot.exp) / (next.exp - spot.exp)) : 1;
  return { index, spot, next, ratio, reachedAll: !next };
}

/** そこまでに もらえている ごほうびの一覧 */
export function unlockedItems(exp: number): string[] {
  return MAP_SPOTS.filter((s) => exp >= s.exp && s.reward).map((s) => s.reward as string);
}

// ────────────────────────────────────────────────────────────
// スタンプ（学習した日）
// ────────────────────────────────────────────────────────────

/**
 * 学習した日から、スタンプの情報を作る。
 *
 * 「連続日数」を前に出すと、1日休んだだけでゼロになって
 * 続ける気持ちが折れてしまいます。
 * そこで「これまでにがんばった日数（減らない）」を主役にしています。
 */
export function stampInfo(dates: string[]): {
  totalDays: number;
  currentStreak: number;
  bestStreak: number;
} {
  const uniq = [...new Set(dates)].sort();
  if (uniq.length === 0) return { totalDays: 0, currentStreak: 0, bestStreak: 0 };

  const dayNum = (s: string) => Math.floor(Date.parse(`${s}T00:00:00`) / 86400000);
  let best = 1;
  let run = 1;
  for (let i = 1; i < uniq.length; i++) {
    run = dayNum(uniq[i]) - dayNum(uniq[i - 1]) === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }

  // いまの連続（きょう または きのう まで続いていれば数える）
  const today = new Date();
  const todayNum = Math.floor(
    Date.parse(
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T00:00:00`,
    ) / 86400000,
  );
  const last = dayNum(uniq[uniq.length - 1]);
  let current = 0;
  if (todayNum - last <= 1) {
    current = 1;
    for (let i = uniq.length - 1; i > 0; i--) {
      if (dayNum(uniq[i]) - dayNum(uniq[i - 1]) === 1) current++;
      else break;
    }
  }
  return { totalDays: uniq.length, currentStreak: current, bestStreak: best };
}
