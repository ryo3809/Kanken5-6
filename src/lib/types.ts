// アプリ全体で使うデータの形を決めるファイル。

/** 受検する級 */
export type Kyu = 6 | 5;

/** 漢字1字ぶんのデータ（src/data/kanji.json の中身） */
export interface KanjiEntry {
  /** 漢字そのもの */
  c: string;
  /** 学年別漢字配当表の学年（1〜6） */
  grade: number;
  /** 学習指導要領での並び順 */
  order: number;
  /** この漢字が初めて出題対象になる級 */
  level: Kyu;
  /** 総画数 */
  strokes: number;
  on: { kana: string; examples: string[] }[];
  kun: { kana: string; stem: string | null; okurigana: string | null; examples: string[] }[];
  ijidokun: string[];
  /** 部首の候補（KanjiVGからの推定。校正が済むまで出題に使わない） */
  radical: string | null;
  radicalOriginal: string | null;
  radicalName: string | null;
  radicalVerified: boolean;
}

/** 熟語1語ぶんのデータ（src/data/words.json の中身） */
export interface WordEntry {
  /** 熟語 */
  w: string;
  /** 読み（ひらがな） */
  r: string;
  /** 1文字ずつの読み。熟字訓は null が並ぶ */
  p: (string | null)[];
  /** 使える級（6=6級から / 5=5級から） */
  lv: Kyu;
  /** 出典 */
  src: string;
  /** 使用頻度の順位。小さいほどよく使う。null は頻度リストに無い語 */
  freq: number | null;
  /** ほかの読み方（あれば全部正解あつかいにする） */
  alt?: string[];
  /** 熟字訓（今日＝きょう など）か */
  jukujikun?: boolean;
  /** 校正済みか。false のものは出題しない */
  verified: boolean;
}

/** Leitner（間隔反復）の箱。1が「これから覚える」、5が「よく覚えた」 */
export type Box = 1 | 2 | 3 | 4 | 5;

/** 漢字ごとの習熟度。IndexedDB の progress に入る */
export interface Progress {
  /** 漢字（これがキー） */
  c: string;
  /** いまいる箱 */
  box: Box;
  /** 次に復習する日（YYYY-MM-DD） */
  nextReview: string;
  /** 正解した回数 */
  correct: number;
  /** まちがえた回数 */
  wrong: number;
  /** 最後に答えた日時（ミリ秒） */
  lastAnsweredAt: number;
}

/** 1回の学習の記録 */
export interface SessionRecord {
  /** 通し番号（自動でつく） */
  id?: number;
  /** 日付（YYYY-MM-DD） */
  date: string;
  startedAt: number;
  finishedAt: number;
  kyu: Kyu;
  /** 出した問題の分野 */
  mode: 'reading' | 'tracing' | 'writing';
  total: number;
  correct: number;
  /** まちがえた漢字 */
  wrongChars: string[];
}

/** 書き取りの自己採点。子どもが自分で選んだ結果 */
export type SelfGrade = 'ok' | 'close' | 'ng';

/**
 * 自己採点の1件ぶんの記録。
 * 保護者が「甘く採点していないか」をあとから確認するために残します。
 */
export interface SelfGradeRecord {
  id?: number;
  /** 日付（YYYY-MM-DD） */
  date: string;
  at: number;
  /** 書かせた漢字 */
  c: string;
  /** 出した熟語 */
  word: string;
  /** 子どもが選んだ結果 */
  grade: SelfGrade;
}

/** なぞり書きの記録。漢字ごとに、なぞった回数を数える */
export interface TraceRecord {
  /** 漢字（これがキー） */
  c: string;
  /** 最後までなぞれた回数 */
  times: number;
  /** やり直した回数の合計（苦手さの目やす） */
  retries: number;
  lastTracedAt: number;
}

/**
 * しばまるとゲーム要素の状態。
 * 経験値は絶対に減りません（休んでも、まちがえても）。
 */
export interface GameState {
  /** 累計の経験値。減ることはない */
  exp: number;
  /** かぶっている ぼうしの id（items.ts） */
  hat: string | null;
  /** つけている くびわの id */
  collar: string | null;
  /** 見たことのあるマップの地点（お知らせを二重に出さないため） */
  seenSpots: number[];
}

export const DEFAULT_GAME: GameState = { exp: 0, hat: null, collar: null, seenSpots: [0] };

/** 設定 */
export interface Settings {
  /** いま練習している級 */
  kyu: Kyu;
  /** 1回のセッションの問題数 */
  sessionSize: 10 | 15 | 20;
  /** 答え方。choice=4つから選ぶ / input=ひらがなで入力する */
  answerMode: 'choice' | 'input';
  /** 「ホーム画面に追加」の案内を閉じたか */
  dismissedInstallHint: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  kyu: 6,
  sessionSize: 10,
  answerMode: 'choice',
  dismissedInstallHint: false,
};

/** 1問ぶんの問題 */
export interface Question {
  /** この問題でねらっている漢字 */
  targetChar: string;
  /** 出題する熟語 */
  word: string;
  /** 正解の読み */
  answer: string;
  /** 正解あつかいにする読み（ほかの読みも含む） */
  acceptable: string[];
  /** 4択のときの選択肢（正解を含めてシャッフル済み） */
  choices: string[];
}

/** バックアップファイルの中身 */
export interface BackupFile {
  /** ファイルの種類を見分けるための印 */
  app: 'kanken-5-6';
  /** バックアップの形式の版。将来かたちが変わっても読めるようにするため */
  version: 1;
  exportedAt: string;
  progress: Progress[];
  sessions: SessionRecord[];
  traces?: TraceRecord[];
  selfGrades?: SelfGradeRecord[];
  game?: GameState;
  settings: Settings;
}
