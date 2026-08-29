// しばまるの表情。目と口の形だけを切りかえます。
//
// 絵を描きかえたいときは、このファイルと Shibamaru.tsx だけを直せば大丈夫です。
// 座標は 100×100 のマス目です。

export type Expression =
  | 'normal'   // ふつう
  | 'happy'    // うれしい（正解したとき）
  | 'cheer'    // おうえん（まちがえたとき）※悲しい顔にはしません
  | 'proud'    // とくいげ（レベルアップ・ゴール）
  | 'sleepy'   // ねむい（ひさしぶりに開いたとき）
  | 'surprise'; // びっくり（新しいごほうび）

export interface FaceParts {
  /** 左右の目 */
  eyes: 'dot' | 'arc' | 'sparkle' | 'closed' | 'wide';
  /** 口 */
  mouth: 'small' | 'open' | 'smile' | 'wave';
  /** ほっぺを赤くするか */
  blush: boolean;
  /** しっぽをふるか（アニメーション） */
  wag: boolean;
  /** 画面に出す ふきだしの文（省略可） */
  defaultLine?: string;
}

export const FACES: Record<Expression, FaceParts> = {
  normal:   { eyes: 'dot',     mouth: 'small', blush: false, wag: false },
  happy:    { eyes: 'arc',     mouth: 'open',  blush: true,  wag: true },
  cheer:    { eyes: 'dot',     mouth: 'smile', blush: false, wag: true },
  proud:    { eyes: 'sparkle', mouth: 'open',  blush: true,  wag: true },
  sleepy:   { eyes: 'closed',  mouth: 'wave',  blush: false, wag: false },
  surprise: { eyes: 'wide',    mouth: 'open',  blush: false, wag: true },
};

/**
 * しばまるが言うことば。
 * 責めたり、悲しませたりする言葉は入れません。
 * まちがえたときも「つぎ いこう！」のように前を向かせます。
 */
export const LINES: Record<Expression, string[]> = {
  normal: ['きょうも やろう！', 'まってたよ', 'いっしょに やろう'],
  happy: ['やったね！', 'すごい！', 'ばっちり！', 'その ちょうし！'],
  cheer: ['つぎ いこう！', 'おしかった、もういちど！', 'だいじょうぶ、おぼえられるよ', 'いま おぼえたね！'],
  proud: ['レベルアップ！', 'ここまで きたね！', 'がんばったね！'],
  sleepy: ['ひさしぶり！', 'また あえたね'],
  surprise: ['あたらしい ものを みつけた！', 'わあ！'],
};

/** その表情のことばを1つ選ぶ */
export function pickLine(exp: Expression, seed = Math.random()): string {
  const list = LINES[exp];
  return list[Math.floor(seed * list.length) % list.length];
}
