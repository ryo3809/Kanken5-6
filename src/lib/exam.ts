// 模擬試験の問題を作る部分。
//
// 本番（漢検6級・5級）と同じ大問のならびと配点にしています。
// くわしくは docs/kanken-spec.md を見てください。
//
// 大事なこと:
//   ・毎回ちがう問題になるように、始めるたびに「たね」を変えています
//   ・データが確認まちの分野（対義語・熟語の構成）は、確認が済むまで出しません
//     そのぶん満点が下がるので、画面には「いま何点満点か」を出します

import type { KanjiEntry, KozoEntry, Kyu, PairEntry, WordEntry } from './types';
import { readingMatches, toKatakana } from './reading-util.ts';

/** 大問の種類 */
export type SectionId =
  | 'reading' | 'okurigana' | 'radical' | 'strokes' | 'kozo'
  | 'sanji' | 'yoji' | 'pair' | 'makeword' | 'onkun' | 'douon' | 'writing'
  // 誤字訂正は 5級の「主な出題内容」にあるが、2024年度第3回の問題には無かった。
  // そのため模擬試験には入れず、「分野べつれんしゅう」でだけ出す。
  //（docs/kanken-spec.md の「未確定・要注意の事項」を参照）
  | 'gojitei';

/** 答え方 */
export type AnswerKind = 'choice' | 'text' | 'write';

export interface ExamQuestion {
  id: string;
  section: SectionId;
  /** 画面に大きく出すもの */
  prompt: string;
  /** 補足（ヒントや設問文） */
  hint?: string;
  kind: AnswerKind;
  /** choice のときの選択肢 */
  choices?: string[];
  /** 正解 */
  answer: string;
  /** text のとき、正解あつかいにするもの */
  acceptable?: string[];
  /** この問題の配点 */
  points: number;
  /** write のとき、答え合わせで重ねるお手本の漢字 */
  writeChar?: string;
  /** その漢字の学年（筆順データの読みこみに使う） */
  writeGrade?: number;
  /** 筆順の問題で、太く見せる画の番号（1から数える） */
  highlightStroke?: number;
}

export interface ExamSection {
  id: SectionId;
  /** (一) など */
  no: string;
  title: string;
  instruction: string;
  questions: ExamQuestion[];
  /** この大問の満点 */
  points: number;
}

export interface Exam {
  kyu: Kyu;
  sections: ExamSection[];
  /** いまの満点（確認まちの分野をのぞいた合計） */
  totalPoints: number;
  /** 本番の満点 */
  fullPoints: number;
  /** 出せなかった大問 */
  skipped: { no: string; title: string; points: number; why: string }[];
  /** 制限時間（分） */
  minutes: number;
}

/** 本番の大問のならびと配点（docs/kanken-spec.md より） */
interface SectionSpec {
  id: SectionId;
  no: string;
  title: string;
  instruction: string;
  count: number;
  pointsEach: number;
}

const SPEC_6: SectionSpec[] = [
  { id: 'reading',   no: '(一)',  title: '漢字の読み',       instruction: 'つぎの ことばの 読みを ひらがなで 書きなさい。', count: 20, pointsEach: 1 },
  { id: 'okurigana', no: '(二)',  title: '漢字と送りがな',   instruction: 'カタカナの ところを、漢字と送りがなで 書きなさい。', count: 5, pointsEach: 2 },
  { id: 'radical',   no: '(三)',  title: '部首名と部首',     instruction: 'つぎの 漢字の 部首と 部首名を えらびなさい。', count: 10, pointsEach: 1 },
  { id: 'strokes',   no: '(四)',  title: '筆順・総画数',     instruction: '太い画は 何画目か、また 総画数は 何画かを えらびなさい。', count: 10, pointsEach: 1 },
  { id: 'kozo',      no: '(五)',  title: '熟語の構成',       instruction: 'つぎの 熟語は、右の ア〜エの どれに あたりますか。', count: 10, pointsEach: 2 },
  { id: 'sanji',     no: '(六)',  title: '三字熟語',         instruction: 'カタカナを 漢字に なおし、一字だけ 書きなさい。', count: 10, pointsEach: 2 },
  { id: 'pair',      no: '(七)',  title: '対義語・類義語',   instruction: '読みを ヒントに、あてはまる ことばを 漢字で 書きなさい。', count: 10, pointsEach: 2 },
  { id: 'makeword',  no: '(八)',  title: '熟語作り',         instruction: '上の 読みの 漢字を えらんで、じゅく語を 作りなさい。', count: 6, pointsEach: 2 },
  { id: 'onkun',     no: '(九)',  title: '熟語の読み（音と訓）', instruction: 'つぎの じゅく語の 読みは、ア〜エの どれに なっていますか。', count: 10, pointsEach: 2 },
  { id: 'douon',     no: '(十)',  title: '同音・同訓異字',   instruction: 'カタカナを 漢字に なおしなさい。', count: 9, pointsEach: 2 },
  { id: 'writing',   no: '(十一)', title: '漢字の書取',      instruction: 'カタカナを 漢字に なおしなさい。', count: 20, pointsEach: 2 },
];

const SPEC_5: SectionSpec[] = [
  { id: 'reading',   no: '(一)',  title: '漢字の読み',       instruction: 'つぎの ことばの 読みを ひらがなで 書きなさい。', count: 20, pointsEach: 1 },
  { id: 'radical',   no: '(二)',  title: '部首と部首名',     instruction: 'つぎの 漢字の 部首と 部首名を えらびなさい。', count: 10, pointsEach: 1 },
  { id: 'strokes',   no: '(三)',  title: '筆順・総画数',     instruction: '太い画は 何画目か、また 総画数は 何画かを えらびなさい。', count: 10, pointsEach: 1 },
  { id: 'okurigana', no: '(四)',  title: '漢字と送りがな',   instruction: 'カタカナの ところを、漢字と送りがなで 書きなさい。', count: 5, pointsEach: 2 },
  { id: 'onkun',     no: '(五)',  title: '熟語の読み（音と訓）', instruction: 'つぎの じゅく語の 読みは、ア〜エの どれに なっていますか。', count: 10, pointsEach: 2 },
  { id: 'yoji',      no: '(六)',  title: '四字熟語',         instruction: 'カタカナを 漢字に なおし、一字だけ 書きなさい。', count: 10, pointsEach: 2 },
  { id: 'pair',      no: '(七)',  title: '対義語・類義語',   instruction: '読みを ヒントに、あてはまる ことばを 漢字で 書きなさい。', count: 10, pointsEach: 2 },
  { id: 'makeword',  no: '(八)',  title: '熟語作り',         instruction: '上の 読みの 漢字を えらんで、じゅく語を 作りなさい。', count: 5, pointsEach: 2 },
  { id: 'kozo',      no: '(九)',  title: '熟語の構成',       instruction: 'つぎの 熟語は、右の ア〜エの どれに あたりますか。', count: 10, pointsEach: 2 },
  { id: 'douon',     no: '(十)',  title: '同音・同訓異字',   instruction: 'カタカナを 漢字に なおしなさい。', count: 10, pointsEach: 2 },
  { id: 'writing',   no: '(十一)', title: '漢字の書取',      instruction: 'カタカナを 漢字に なおしなさい。', count: 20, pointsEach: 2 },
];

export const KOZO_CHOICES = [
  'ア　反対や 対になる 意味の字を 組み合わせたもの（例：上下）',
  'イ　同じような 意味の字を 組み合わせたもの（例：森林）',
  'ウ　上の字が 下の字の 意味を せつめいしているもの（例：海水）',
  'エ　下の字から 上の字へ 返って読むと 意味が よくわかるもの（例：消火）',
];
export const ONKUN_CHOICES = ['ア　音と音', 'イ　音と訓', 'ウ　訓と訓', 'エ　訓と音'];

/** 同じ順番でくり返せる乱数（たねを変えると、ちがう問題になる） */
export function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = <T,>(arr: T[], n: number, rand: () => number): T[] => shuffle(arr, rand).slice(0, n);

export interface ExamData {
  kanji: KanjiEntry[];
  words: WordEntry[];
  pairs: PairEntry[];
  kozo: KozoEntry[];
}

/**
 * 熟語の読みが「音と音」「音と訓」などのどれかを、データから求める。
 * 分からないときは null（その語は(九)に使わない）。
 */
export function classifyOnKun(word: WordEntry, byChar: Map<string, KanjiEntry>): 0 | 1 | 2 | 3 | null {
  const cs = [...word.w];
  if (cs.length !== 2 || word.jukujikun) return null;
  const kinds: ('on' | 'kun')[] = [];
  for (let i = 0; i < 2; i++) {
    const k = byChar.get(cs[i]);
    const r = word.p[i];
    if (!k || !r) return null;
    const isOn = k.on.some((o) => readingMatches(r, o.kana));
    const isKun = k.kun.some((o) => {
      const stem = o.stem ?? o.kana;
      return readingMatches(r, stem) || readingMatches(r, o.kana);
    });
    // どちらとも取れる／どちらでもない語は使わない
    if (isOn === isKun) return null;
    kinds.push(isOn ? 'on' : 'kun');
  }
  if (kinds[0] === 'on' && kinds[1] === 'on') return 0;   // ア 音と音
  if (kinds[0] === 'on' && kinds[1] === 'kun') return 1;  // イ 音と訓
  if (kinds[0] === 'kun' && kinds[1] === 'kun') return 2; // ウ 訓と訓
  return 3;                                               // エ 訓と音
}

/**
 * 問題を作るための材料をそろえる。
 * 模擬試験（buildExam）でも、分野べつれんしゅう（buildPractice）でも同じものを使う。
 */
function makeCtx(kyu: Kyu, data: ExamData, rand: () => number): Omit<Ctx, 'nextId'> {
  const maxGrade = kyu === 6 ? 5 : 6;
  const kanji = data.kanji.filter((k) => k.grade <= maxGrade);
  const byChar = new Map(kanji.map((k) => [k.c, k]));
  const words = data.words.filter(
    (w) => w.verified && (kyu === 5 || w.lv === 6) && [...w.w].every((c) => byChar.has(c)),
  );
  const w2 = words.filter((w) => (w.n ?? [...w.w].length) === 2 && !w.jukujikun);
  // 三字熟語には「富山県」のような都道府県名を使わない（本番に出る形ではないため）
  const w3 = words.filter(
    (w) => (w.n ?? [...w.w].length) === 3 && !/[都道府県市区町村]$/.test(w.w),
  );
  const w4 = words.filter((w) => w.yoji);
  // 「まちがい探し」で、うっかり本物の言葉を作ってしまわないための一覧。
  // 確認まちのものも入れる（出題には使わないが、言葉として存在はするため）
  const allWords = new Set(data.words.map((w) => w.w));
  return { kyu, kanji, byChar, words, w2, w3, w4, allWords, data, rand };
}

/** 模擬試験を1回ぶん作る */
export function buildExam(kyu: Kyu, data: ExamData, seed = Date.now()): Exam {
  const rand = makeRng(seed);
  const spec = kyu === 6 ? SPEC_6 : SPEC_5;
  const ctx = makeCtx(kyu, data, rand);

  const sections: ExamSection[] = [];
  const skipped: Exam['skipped'] = [];
  let idc = 0;
  const nextId = () => `q${++idc}`;

  for (const sp of spec) {
    const qs = buildSection(sp, { ...ctx, nextId });
    const full = sp.count * sp.pointsEach;
    if (qs.length < sp.count) {
      skipped.push({
        no: sp.no, title: sp.title, points: full,
        why: qs.length === 0 ? 'まだ データが そろっていません' : `問題が ${qs.length}問しか 作れませんでした`,
      });
      if (qs.length === 0) continue;
    }
    sections.push({
      id: sp.id, no: sp.no, title: sp.title, instruction: sp.instruction,
      questions: qs, points: qs.reduce((n, q) => n + q.points, 0),
    });
  }

  return {
    kyu,
    sections,
    totalPoints: sections.reduce((n, s) => n + s.points, 0),
    fullPoints: spec.reduce((n, s) => n + s.count * s.pointsEach, 0),
    skipped,
    minutes: 60,
  };
}

/** 分野べつれんしゅうで えらべる大問 */
export interface PracticeSpec {
  id: SectionId;
  /** 本番での大問番号。れんしゅうだけの分野は空 */
  no: string;
  title: string;
  instruction: string;
  /** 本番とちがうところがあれば、その説明 */
  note?: string;
}

/** 誤字訂正（模擬試験には入れず、れんしゅうでだけ出す） */
const GOJITEI: PracticeSpec = {
  id: 'gojitei',
  no: '',
  title: '誤字訂正',
  instruction: 'まちがって つかわれている 漢字を 見つけて、正しい漢字を 書きなさい。',
  note: '本番は 文の中から さがします。ここでは ことばだけで れんしゅうします。',
};

/**
 * その級で れんしゅうできる分野の一覧。
 *
 * 5級には誤字訂正を足しています。公式の「主な出題内容」には載っているのに、
 * 手元の問題見本（2024年度第3回）には出ていなかったためです。
 * 模擬試験の点数を狂わせないよう、れんしゅうでだけ扱います。
 */
export function practiceList(kyu: Kyu): PracticeSpec[] {
  const spec = kyu === 6 ? SPEC_6 : SPEC_5;
  const list: PracticeSpec[] = spec.map((sp) => ({
    id: sp.id, no: sp.no, title: sp.title, instruction: sp.instruction,
  }));
  if (kyu === 5) list.push(GOJITEI);
  return list;
}

export interface Practice {
  id: SectionId;
  no: string;
  title: string;
  instruction: string;
  note?: string;
  questions: ExamQuestion[];
}

/**
 * 分野を1つだけ選んで、れんしゅう問題を作る。
 *
 * 作れた数が count より少ないこともあります（データの確認まちなど）。
 * 0問のときは null を返すので、呼ぶ側で「いまは出せません」と伝えてください。
 *
 * @param count 何問ほしいか。部首と筆順は1つの漢字から2問できるので、偶数にしてください
 */
export function buildPractice(
  kyu: Kyu, data: ExamData, id: SectionId, count = 10, seed = Date.now(),
): Practice | null {
  const info = practiceList(kyu).find((x) => x.id === id);
  if (!info) return null;
  const rand = makeRng(seed);
  const ctx = makeCtx(kyu, data, rand);
  let idc = 0;
  const questions = buildSection(
    { id, no: info.no, title: info.title, instruction: info.instruction, count, pointsEach: 1 },
    { ...ctx, nextId: () => `p${++idc}` },
  );
  if (questions.length === 0) return null;
  return { ...info, questions: questions.slice(0, count) };
}

interface Ctx {
  kyu: Kyu;
  kanji: KanjiEntry[];
  byChar: Map<string, KanjiEntry>;
  words: WordEntry[];
  w2: WordEntry[];
  w3: WordEntry[];
  w4: WordEntry[];
  /** 出典のあるなし関係なく、言葉として存在するものすべて */
  allWords: Set<string>;
  data: ExamData;
  rand: () => number;
  nextId: () => string;
}

function buildSection(sp: SectionSpec, c: Ctx): ExamQuestion[] {
  const P = sp.pointsEach;
  const base = { section: sp.id, points: P };

  switch (sp.id) {
    // ───────── (一) 読み ─────────
    case 'reading': {
      const src = pick(c.w2.filter((w) => w.freq !== null), sp.count, c.rand);
      return src.map((w) => ({
        ...base, id: c.nextId(), kind: 'text' as const,
        prompt: w.w, answer: w.r, acceptable: w.alt ?? [w.r],
      }));
    }

    // ───────── (二/四) 漢字と送りがな ─────────
    case 'okurigana': {
      // 読みが1つの漢字にしか対応しないものだけを使う（答えが1つに決まるように）
      const byReading = new Map<string, { c: string; full: string; grade: number }[]>();
      for (const k of c.kanji) {
        for (const r of k.kun) {
          if (!r.okurigana || !r.stem) continue;
          const full = `${k.c}${r.okurigana}`;
          const key = r.kana;
          if (!byReading.has(key)) byReading.set(key, []);
          byReading.get(key)!.push({ c: k.c, full, grade: k.grade });
        }
      }
      const uniq = [...byReading.entries()].filter(([, v]) => v.length === 1);
      return pick(uniq, sp.count, c.rand).map(([kana, [v]]) => ({
        ...base, id: c.nextId(), kind: 'write' as const,
        prompt: toKatakana(kana), hint: '漢字と送りがなで 書こう',
        answer: v.full, writeChar: v.c, writeGrade: v.grade,
      }));
    }

    // ───────── (三/二) 部首 ─────────
    case 'radical': {
      const usable = c.kanji.filter((k) => k.radicalVerified && k.radical && k.radicalName);
      const chosen = pick(usable, Math.floor(sp.count / 2), c.rand);
      const allRad = [...new Set(usable.map((k) => k.radical!))];
      const allName = [...new Set(usable.map((k) => k.radicalName!))];
      const out: ExamQuestion[] = [];
      for (const k of chosen) {
        out.push({
          ...base, id: c.nextId(), kind: 'choice' as const,
          prompt: k.c, hint: 'この漢字の 部首は どれ？',
          choices: shuffle([k.radical!, ...pick(allRad.filter((r) => r !== k.radical), 5, c.rand)], c.rand),
          answer: k.radical!,
        });
        out.push({
          ...base, id: c.nextId(), kind: 'choice' as const,
          prompt: k.c, hint: 'この漢字の 部首名は どれ？',
          choices: shuffle([k.radicalName!, ...pick(allName.filter((r) => r !== k.radicalName), 5, c.rand)], c.rand),
          answer: k.radicalName!,
        });
      }
      return out;
    }

    // ───────── (四/三) 筆順・総画数 ─────────
    case 'strokes': {
      const usable = c.kanji.filter((k) => k.strokes >= 4 && k.strokes <= 20);
      const chosen = pick(usable, Math.floor(sp.count / 2), c.rand);
      const out: ExamQuestion[] = [];
      for (const k of chosen) {
        const n = 1 + Math.floor(c.rand() * k.strokes);
        const nearN = numberChoices(n, k.strokes, c.rand);
        out.push({
          ...base, id: c.nextId(), kind: 'choice' as const,
          prompt: k.c, hint: '太い画は 何画目？', highlightStroke: n,
          choices: nearN.map(String), answer: String(n),
          writeChar: k.c, writeGrade: k.grade,
        });
        out.push({
          ...base, id: c.nextId(), kind: 'choice' as const,
          prompt: k.c, hint: 'ぜんぶで 何画？',
          choices: numberChoices(k.strokes, 30, c.rand).map(String), answer: String(k.strokes),
          writeChar: k.c, writeGrade: k.grade,
        });
      }
      return out;
    }

    // ───────── 熟語の構成 ─────────
    case 'kozo': {
      const usable = c.data.kozo.filter(
        (k) => k.verified && (c.kyu === 5 || k.lv === 6) && [...k.w].every((x) => c.byChar.has(x)),
      );
      const TYPES = ['ア', 'イ', 'ウ', 'エ'] as const;
      return pick(usable, sp.count, c.rand).map((k) => ({
        ...base, id: c.nextId(), kind: 'choice' as const,
        prompt: k.w, hint: k.r,
        choices: [...KOZO_CHOICES], answer: KOZO_CHOICES[TYPES.indexOf(k.type)],
      }));
    }

    // ───────── 三字熟語 / 四字熟語 ─────────
    case 'sanji':
    case 'yoji': {
      const src = sp.id === 'sanji' ? c.w3 : c.w4;
      const usable = src.filter((w) => w.p.every((x) => !!x));
      return pick(usable, sp.count, c.rand).map((w) => {
        const cs = [...w.w];
        const i = Math.floor(c.rand() * cs.length);
        const display = cs.map((x, j) => (j === i ? toKatakana(w.p[j] as string) : x)).join('');
        return {
          ...base, id: c.nextId(), kind: 'write' as const,
          prompt: display, hint: w.r,
          answer: cs[i], writeChar: cs[i], writeGrade: c.byChar.get(cs[i])?.grade ?? 1,
        };
      });
    }

    // ───────── 対義語・類義語 ─────────
    case 'pair': {
      const usable = c.data.pairs.filter(
        (p) => p.verified && (c.kyu === 5 || p.lv === 6)
          && [...p.a, ...p.b].every((x) => c.byChar.has(x)),
      );
      return pick(usable, sp.count, c.rand).map((p) => {
        const flip = c.rand() < 0.5;
        const from = flip ? p.b : p.a;
        const to = flip ? p.a : p.b;
        const toR = flip ? p.ra : p.rb;
        return {
          ...base, id: c.nextId(), kind: 'write' as const,
          prompt: from,
          hint: `${p.kind === 'tai' ? '反対の意味' : 'にた意味'}の ことば　（${toR}）`,
          answer: to, writeChar: to[0], writeGrade: c.byChar.get(to[0])?.grade ?? 1,
        };
      });
    }

    // ───────── 熟語作り ─────────
    case 'makeword': {
      // 同じ音読みをもつ漢字が複数ある読みを使い、そこから正しい字をえらばせる
      const byOn = new Map<string, string[]>();
      for (const k of c.kanji) {
        for (const o of k.on) {
          if (!byOn.has(o.kana)) byOn.set(o.kana, []);
          byOn.get(o.kana)!.push(k.c);
        }
      }
      const out: ExamQuestion[] = [];
      const used = new Set<string>();
      for (const w of shuffle(c.w2, c.rand)) {
        if (out.length >= sp.count) break;
        if (used.has(w.w)) continue;
        const cs = [...w.w];
        const i = Math.floor(c.rand() * 2);
        const target = cs[i];
        const r = w.p[i];
        if (!r) continue;
        const kk = c.byChar.get(target);
        const on = kk?.on.find((o) => readingMatches(r, o.kana));
        if (!on) continue;
        const same = (byOn.get(on.kana) ?? []).filter((x) => x !== target && c.byChar.has(x));
        if (same.length < 3) continue;
        used.add(w.w);
        out.push({
          ...base, id: c.nextId(), kind: 'choice' as const,
          prompt: cs.map((x, j) => (j === i ? '□' : x)).join(''),
          hint: `□に 入る「${on.kana}」と読む漢字は どれ？`,
          choices: shuffle([target, ...pick(same, 4, c.rand)], c.rand),
          answer: target,
        });
      }
      return out;
    }

    // ───────── 熟語の読み（音と訓）─────────
    case 'onkun': {
      // ア〜エ が かたよらないように、種類ごとに集めてから ならべ直す。
      // （そのまま作ると「音と音」ばかりになってしまう）
      const buckets: WordEntry[][] = [[], [], [], []];
      const seen = new Set<string>();
      for (const w of shuffle(c.w2, c.rand)) {
        if (seen.has(w.w)) continue;
        const t = classifyOnKun(w, c.byChar);
        if (t === null) continue;
        if (buckets[t].length >= sp.count) continue;
        seen.add(w.w);
        buckets[t].push(w);
      }
      const chosen: { w: WordEntry; t: number }[] = [];
      // まず1つずつ順に取って、なるべく4種類そろえる
      for (let round = 0; chosen.length < sp.count && round < sp.count; round++) {
        for (let t = 0; t < 4 && chosen.length < sp.count; t++) {
          const w = buckets[t][round];
          if (w) chosen.push({ w, t });
        }
      }
      return shuffle(chosen, c.rand).map(({ w, t }) => ({
        ...base, id: c.nextId(), kind: 'choice' as const,
        prompt: w.w, hint: w.r,
        choices: [...ONKUN_CHOICES], answer: ONKUN_CHOICES[t],
      }));
    }

    // ───────── 同音・同訓異字 ─────────
    case 'douon': {
      // 同じ読みなのに ちがう漢字を書く問題。
      // 同じ音読みをもつ2字が、それぞれ別の熟語に出てくる組を使う。
      const byOn = new Map<string, string[]>();
      for (const k of c.kanji) for (const o of k.on) {
        if (!byOn.has(o.kana)) byOn.set(o.kana, []);
        byOn.get(o.kana)!.push(k.c);
      }
      const wordsByChar = new Map<string, WordEntry[]>();
      for (const w of c.w2) for (const x of new Set(w.w)) {
        if (!wordsByChar.has(x)) wordsByChar.set(x, []);
        wordsByChar.get(x)!.push(w);
      }
      const out: ExamQuestion[] = [];
      for (const [kana, chars] of shuffle([...byOn.entries()], c.rand)) {
        if (out.length >= sp.count) break;
        const ok = chars.filter((x) => (wordsByChar.get(x) ?? []).length > 0);
        if (ok.length < 2) continue;
        for (const target of pick(ok, 2, c.rand)) {
          if (out.length >= sp.count) break;
          const cand = (wordsByChar.get(target) ?? []).filter((w) => {
            const i = [...w.w].indexOf(target);
            if (i < 0 || !w.p[i] || !readingMatches(w.p[i] as string, kana)) return false;
            if (w.freq === null) return false;              // よく使う語だけ
            if (/[一二三四五六七八九十百千万億兆]/.test(w.w)) return false; // 数の語はさける
            return true;
          });
          if (cand.length === 0) continue;
          const w = cand[Math.floor(c.rand() * cand.length)];
          const cs = [...w.w];
          const i = cs.indexOf(target);
          out.push({
            ...base, id: c.nextId(), kind: 'write' as const,
            prompt: cs.map((x, j) => (j === i ? toKatakana(w.p[j] as string) : x)).join(''),
            hint: `${w.r}　（同じ読みの ちがう漢字に 気をつけて）`,
            answer: target, writeChar: target, writeGrade: c.byChar.get(target)?.grade ?? 1,
          });
        }
      }
      return out;
    }

    // ───────── 誤字訂正（分野べつれんしゅう だけ） ─────────
    case 'gojitei': {
      // 同じ読みの ちがう漢字に すりかわった ことばを 見つけて、正しく直す問題。
      //
      // 本番は「文の中」から探しますが、このアプリでは **ことばだけ** で出します。
      // 例文を勝手に作ると、出典のない日本語をお子さんに読ませることになるためです。
      const byOn = new Map<string, string[]>();
      for (const k of c.kanji) for (const o of k.on) {
        if (!byOn.has(o.kana)) byOn.set(o.kana, []);
        byOn.get(o.kana)!.push(k.c);
      }
      const out: ExamQuestion[] = [];
      for (const w of shuffle(c.w2.filter((x) => x.freq !== null), c.rand)) {
        if (out.length >= sp.count) break;
        if (/[一二三四五六七八九十百千万億兆]/.test(w.w)) continue;   // 数の語はさける
        const cs = [...w.w];
        const i = Math.floor(c.rand() * 2);
        const target = cs[i];
        const r = w.p[i];
        if (!r) continue;
        const k = c.byChar.get(target);
        const on = k?.on.find((o) => readingMatches(r, o.kana));
        if (!on) continue;
        // 入れかえても「本物の言葉」になってしまうものは使わない
        //（そうしないと、どちらが正しいか決められなくなる）
        const cand = (byOn.get(on.kana) ?? []).filter(
          (y) => y !== target && !c.allWords.has(cs.map((x, j) => (j === i ? y : x)).join('')),
        );
        if (cand.length === 0) continue;
        const wrong = cand[Math.floor(c.rand() * cand.length)];
        out.push({
          ...base, id: c.nextId(), kind: 'write' as const,
          prompt: cs.map((x, j) => (j === i ? wrong : x)).join(''),
          hint: `「${w.r}」と 読みたいのに、漢字が 一字 まちがっています。正しい漢字を 書こう`,
          answer: target, writeChar: target, writeGrade: k!.grade,
        });
      }
      return out;
    }

    // ───────── 書き取り ─────────
    case 'writing': {
      const usable = c.w2.filter((w) => w.p.every((x) => !!x) && w.freq !== null);
      return pick(usable, sp.count, c.rand).map((w) => {
        const cs = [...w.w];
        const i = Math.floor(c.rand() * cs.length);
        return {
          ...base, id: c.nextId(), kind: 'write' as const,
          prompt: cs.map((x, j) => (j === i ? toKatakana(w.p[j] as string) : x)).join(''),
          hint: w.r,
          answer: cs[i], writeChar: cs[i], writeGrade: c.byChar.get(cs[i])?.grade ?? 1,
        };
      });
    }
  }
}

/** 数を答える問題の選択肢（正解のまわりの数をまぜる） */
function numberChoices(answer: number, max: number, rand: () => number): number[] {
  const set = new Set<number>([answer]);
  let guard = 0;
  while (set.size < 5 && guard++ < 100) {
    const d = 1 + Math.floor(rand() * 4);
    const v = rand() < 0.5 ? answer - d : answer + d;
    if (v >= 1 && v <= max) set.add(v);
  }
  return [...set].sort((a, b) => a - b);
}

/** 自動で採点できる問題（選ぶ・書く（文字入力））かどうか */
export const isAutoScored = (q: ExamQuestion): boolean => q.kind !== 'write';
