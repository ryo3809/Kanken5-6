// アプリ全体のとりまとめ。画面の切りかえと、データの読み書きをここで行う。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import kanjiData from './data/kanji.json';
import wordsData from './data/words.json';
import pairsData from './data/pairs.json';
import kozoData from './data/kozo.json';
import type {
  ExamResult, GameState, KanjiEntry, KozoEntry, PairEntry, Progress, Question, SelfGradeRecord,
  SessionRecord, Settings, TraceRecord, WordEntry,
} from './lib/types';
import { DEFAULT_GAME, DEFAULT_SETTINGS } from './lib/types';
import {
  addExamResult, addSelfGrades, addSession, isStorageAvailable, loadAllProgress, loadExamResults,
  loadGame, loadSelfGrades, loadSessions, loadSettings, loadTraces, saveGame, saveProgressBatch,
  saveSettings, saveTraces, StorageError,
} from './lib/db';
import { applyAnswer, newProgress, pickForSession, summarize, toDateKey } from './lib/leitner';
import {
  buildWordIndex, charsForKyu, collectReadings, makeReadingQuestion, makeWritingQuestion,
  type WritingQuestion,
} from './lib/questions';
import { Home } from './screens/Home';
import { Session } from './screens/Session';
import { Result } from './screens/Result';
import { SettingsScreen } from './screens/SettingsScreen';
import { BackupScreen } from './screens/BackupScreen';
import { AboutScreen } from './screens/AboutScreen';
import { NextKyuScreen } from './screens/NextKyuScreen';
import { Tracing } from './screens/Tracing';
import { Writing, type WritingResult } from './screens/Writing';
import { preloadGrade } from './lib/strokeStore';
import { EXP, levelFromExp, mapProgress, MAP_SPOTS, unlockedItems } from './lib/gamification';
import { MapScreen } from './screens/MapScreen';
import { DressupScreen } from './screens/DressupScreen';
import { ZukanScreen } from './screens/ZukanScreen';
import { buildExam, isAutoScored, type Exam, type ExamData } from './lib/exam';
import {
  PracticeScreen, PracticeResultView, type PracticeResult,
} from './screens/PracticeScreen';
import { examSummary, sectionStats } from './lib/parent';
import { ExamScreen, autoScore, type ExamAnswer } from './screens/ExamScreen';
import { ExamGrading } from './screens/ExamGrading';
import { ExamResultScreen, passLine } from './screens/ExamResultScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyUpdate, registerServiceWorker, snoozeUntil } from './lib/pwa';
import { Shibamaru } from './character/Shibamaru';
import { ITEM_BY_ID } from './character/items';

/** セッションのあと、もらったものを知らせる部品 */
function RewardNews({
  news, onOpenMap,
}: {
  news: { levelUp: number | null; spot: string | null; items: string[] } | null;
  onOpenMap: () => void;
}) {
  if (!news) return null;
  if (!news.levelUp && !news.spot && news.items.length === 0) return null;
  return (
    <div className="card center">
      <Shibamaru expression="proud" size={90} />
      {news.levelUp && <p style={{ fontSize: 22, fontWeight: 700 }}>レベル {news.levelUp} に なった！</p>}
      {news.spot && <p style={{ fontSize: 19 }}>「{news.spot}」に ついたよ！</p>}
      {news.items.map((id) => {
        const item = ITEM_BY_ID.get(id);
        return item ? (
          <p key={id} style={{ fontSize: 18 }}>
            🎁 <b>{item.name}</b> を もらった！
          </p>
        ) : null;
      })}
      <button className="ghost wide" onClick={onOpenMap}>
        おさんぽマップを 見る
      </button>
    </div>
  );
}

const ALL_KANJI = (kanjiData as { kanji: KanjiEntry[] }).kanji;
const ALL_WORDS = (wordsData as { words: WordEntry[] }).words;
const ALL_PAIRS = (pairsData as { pairs: PairEntry[] }).pairs;
const ALL_KOZO = (kozoData as { kozo: KozoEntry[] }).kozo;

type Screen =
  | 'loading' | 'home' | 'session' | 'result'
  | 'tracing' | 'tracingResult'
  | 'writing' | 'writingResult'
  | 'map' | 'zukan' | 'dressup'
  | 'examIntro' | 'exam' | 'examGrading' | 'examResult'
  | 'practice' | 'practiceResult' | 'nextKyu'
  | 'settings' | 'backup' | 'about';

/** なぞり書き1回ぶんの字数 */
const TRACE_SESSION_SIZE = 3;

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map());
  // 画面の再描画を待たずに、いつでも最新の習熟度を読めるようにしておく。
  // （これが無いと、1問ごとの更新と最後の保存で二重に計算されてしまう）
  const progressRef = useRef<Map<string, Progress>>(new Map());
  const setProgressBoth = useCallback((next: Map<string, Progress>) => {
    progressRef.current = next;
    setProgress(next);
  }, []);
  const [sessionDates, setSessionDates] = useState<string[]>([]);
  /** 学習の記録そのもの（おうちの人の画面で、日ごとのようすを出すのに使う） */
  const [sessionRecords, setSessionRecords] = useState<SessionRecord[]>([]);
  /**
   * 学習の記録を1件ふやす。
   * 画面に出している一覧にも同時に足しておく
   * （おうちの人の画面のグラフが、開きなおさなくても最新になるように）。
   */
  const recordSession = useCallback(async (rec: SessionRecord) => {
    await addSession(rec);
    setSessionRecords((r) => [...r, rec]);
  }, []);
  const [traces, setTraces] = useState<Map<string, TraceRecord>>(new Map());
  const [traceQueue, setTraceQueue] = useState<KanjiEntry[]>([]);
  const [traceResult, setTraceResult] = useState<{ traced: string[]; retries: number } | null>(null);
  const [writingQuestions, setWritingQuestions] = useState<WritingQuestion[]>([]);
  const [writingResults, setWritingResults] = useState<WritingResult[]>([]);
  const [selfGrades, setSelfGrades] = useState<SelfGradeRecord[]>([]);
  const [game, setGame] = useState<GameState>(DEFAULT_GAME);
  const [exam, setExam] = useState<Exam | null>(null);
  const [examAnswers, setExamAnswers] = useState<Map<string, ExamAnswer>>(new Map());
  const [examMeta, setExamMeta] = useState<{ seconds: number; timedOut: boolean }>({ seconds: 0, timedOut: false });
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  const [examHistory, setExamHistory] = useState<ExamResult[]>([]);
  const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(null);
  // 画面の再描画を待たずに、いつでも最新のしばまるの状態を読めるようにしておく。
  // （フェーズ2で、古い値を読んで二重に計算する不具合が出たため、同じ作りにしています）
  const gameRef = useRef<GameState>(DEFAULT_GAME);
  const setGameBoth = useCallback((g: GameState) => {
    gameRef.current = g;
    setGame(g);
  }, []);
  /** セッションが終わったときに見せる「もらったもの」のお知らせ */
  const [rewardNews, setRewardNews] = useState<
    { levelUp: number | null; spot: string | null; items: string[] } | null
  >(null);
  const [todayAnswered, setTodayAnswered] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [storageOk, setStorageOk] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** 新しい版の用意ができたか（オフライン用のしくみが知らせてくれる） */
  const [updateReady, setUpdateReady] = useState(false);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [results, setResults] = useState<{ q: Question; correct: boolean }[]>([]);
  const [startedAt, setStartedAt] = useState(0);

  // ── 起動時の読みこみ ─────────────────────────────
  const reload = useCallback(async () => {
    try {
      const ok = await isStorageAvailable();
      setStorageOk(ok);
      const [s, p, sess, tr, sg, gm, ex] = await Promise.all([
        loadSettings(), loadAllProgress(), loadSessions(), loadTraces(), loadSelfGrades(),
        loadGame(), loadExamResults(),
      ]);
      setExamHistory(ex);
      setSettings(s);
      setProgressBoth(p);
      setTraces(tr);
      setSelfGrades(sg);
      setGameBoth(gm);
      setSessionRecords(sess);
      setSessionDates(sess.map((x) => x.date));
      setSessionCount(sess.length);
      const today = toDateKey();
      setTodayAnswered(sess.filter((x) => x.date === today).reduce((n, x) => n + x.total, 0));
      setLoadError(null);
    } catch (e) {
      // 記録が読めなくても、練習だけはできるようにする
      setStorageOk(false);
      setLoadError(
        e instanceof StorageError
          ? e.kidMessage
          : 'これまでの きろくを よみこめませんでした。れんしゅうは できます。',
      );
    } finally {
      setScreen((cur) => (cur === 'loading' ? 'home' : cur));
    }
  }, [setProgressBoth, setGameBoth]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // オフラインでも開けるようにする。
  // 登録に失敗してもアプリはふつうに動くので、ここでエラーは表示しない。
  useEffect(() => {
    registerServiceWorker(() => setUpdateReady(true));
  }, []);

  // ── いまの級のデータ ─────────────────────────────
  const chars = useMemo(() => charsForKyu(ALL_KANJI, settings.kyu), [settings.kyu]);
  const wordIndex = useMemo(() => buildWordIndex(ALL_WORDS, settings.kyu), [settings.kyu]);
  const readingPool = useMemo(() => collectReadings(ALL_WORDS, settings.kyu), [settings.kyu]);
  /** 校正が済んだ熟語がある漢字だけが、いま出題できる */
  const canUse = useCallback((c: string) => (wordIndex.get(c)?.length ?? 0) > 0, [wordIndex]);
  const usableChars = useMemo(() => chars.filter(canUse), [chars, canUse]);
  const kanjiByChar = useMemo(() => new Map(ALL_KANJI.map((k) => [k.c, k])), []);
  const summary = useMemo(() => summarize(chars, progress), [chars, progress]);

  // ── セッションを始める ───────────────────────────
  function startSession() {
    const picked = pickForSession({
      candidates: chars,
      progress,
      size: settings.sessionSize,
      canUse,
    });
    const used = new Set<string>();
    const qs: Question[] = [];
    for (const c of picked.chars) {
      const q = makeReadingQuestion(c, wordIndex, readingPool, used);
      if (q) qs.push(q);
    }
    if (qs.length === 0) {
      setLoadError('いまは だせる もんだいが ありません。せっていで きゅうを かえてみてね。');
      return;
    }
    answeredChars.current = new Set();
    setRewardNews(null);
    setQuestions(qs);
    setResults([]);
    setStartedAt(Date.now());
    setSaveError(null);
    setScreen('session');
  }

  // ── 分野べつれんしゅう ──────────────────────────
  const examData: ExamData = useMemo(
    () => ({ kanji: ALL_KANJI, words: ALL_WORDS, pairs: ALL_PAIRS, kozo: ALL_KOZO }),
    [],
  );
  /** 模擬試験で合格ライン（200点満点に直して140点）に届いた回数 */
  const examPassed = useMemo(() => examSummary(examHistory).passed, [examHistory]);
  /** 大問番号 → 正答率（模擬試験の記録から。にがて印に使う） */
  const weakRates = useMemo(
    () => new Map(sectionStats(examHistory).map((s) => [s.no, s.rate])),
    [examHistory],
  );

  /**
   * 分野べつれんしゅうが終わったとき。
   *
   * 復習の箱（1〜5）はここでは動かしません。
   * 同じ字を2つの道すじで進めると、復習の間隔がくるってしまうためです。
   * 記録として残すのは「学習した」ことと、手書きの自己採点だけです。
   */
  async function finishPractice(res: PracticeResult) {
    setPracticeResult(res);
    setScreen('practiceResult');
    if (res.answers.length === 0) return;
    try {
      const now = Date.now();
      const today = toDateKey();
      const grades: SelfGradeRecord[] = res.answers
        .filter((a) => a.grade)
        .map((a) => ({ date: today, at: now, c: a.char, word: a.word, grade: a.grade! }));
      if (grades.length > 0) {
        await addSelfGrades(grades);
        setSelfGrades((prev) => [...grades, ...prev]);
      }
      const first = isFirstOfDay();
      await recordSession({
        date: today,
        startedAt: now - res.answers.length * 20000,
        finishedAt: now,
        kyu: settings.kyu,
        mode: 'practice',
        total: res.answers.length,
        correct: res.answers.filter((a) => a.correct).length,
        wrongChars: res.answers.filter((a) => !a.correct).map((a) => a.char),
      });
      setSessionDates((d) => [...d, today]);
      setSessionCount((n) => n + 1);
      setTodayAnswered((n) => n + res.answers.length);
      setSaveError(null);
      const gained = res.answers.reduce(
        (n, a) => n + (a.correct ? EXP.practiceCorrect : EXP.practiceWrong),
        0,
      );
      await addExp(gained, { firstOfDay: first });
    } catch (e) {
      setSaveError(
        e instanceof StorageError ? e.kidMessage : 'きろくの ほぞんに しっぱいしました。',
      );
    }
  }

  // ── 模擬試験 ────────────────────────────────────
  function prepareExam() {
    const e = buildExam(settings.kyu, examData);
    setExam(e);
    setExamAnswers(new Map());
    setExamResult(null);
    setSaveError(null);
    setScreen('examIntro');
  }

  function startExam() {
    setRewardNews(null);
    setScreen('exam');
  }

  /** 受験がおわったところ。手書きの問題があれば「まるつけ」へ */
  function afterExam(answers: Map<string, ExamAnswer>, seconds: number, timedOut: boolean) {
    setExamAnswers(answers);
    setExamMeta({ seconds, timedOut });
    const needGrading = (exam?.sections ?? [])
      .flatMap((s) => s.questions)
      .filter((q) => !isAutoScored(q));
    if (needGrading.length > 0) setScreen('examGrading');
    else void scoreExam(answers, new Set(), seconds, timedOut);
  }

  /** 採点して記録する */
  async function scoreExam(
    answers: Map<string, ExamAnswer>,
    handCorrect: Set<string>,
    seconds: number,
    timedOut: boolean,
  ) {
    if (!exam) return;
    const sections = exam.sections.map((s) => {
      let score = 0;
      for (const q of s.questions) {
        const ok = isAutoScored(q) ? autoScore(q, answers.get(q.id)) : handCorrect.has(q.id);
        if (ok) score += q.points;
      }
      return { no: s.no, title: s.title, score, points: s.points };
    });
    const total = sections.reduce((n, s) => n + s.points, 0);
    const score = sections.reduce((n, s) => n + s.score, 0);
    const now = Date.now();
    const rec: ExamResult = {
      date: toDateKey(), at: now, kyu: settings.kyu,
      score, total, fullTotal: exam.fullPoints, seconds, timedOut, sections,
    };
    setExamResult(rec);
    setScreen('examResult');

    try {
      await addExamResult(rec);
      await recordSession({
        date: toDateKey(), startedAt: now - seconds * 1000, finishedAt: now,
        kyu: settings.kyu, mode: 'reading',
        total: exam.sections.reduce((n, s) => n + s.questions.length, 0),
        correct: 0, wrongChars: [],
      });
      setExamHistory((h) => [...h, rec]);
      const first = isFirstOfDay();
      setSessionDates((d) => [...d, toDateKey()]);
      setSessionCount((n) => n + 1);
      setSaveError(null);
      // 模試は がんばりが大きいので、多めに経験値をあげる
      await addExp(40 + Math.round(score / 2), { firstOfDay: first });
    } catch (e) {
      setSaveError(
        e instanceof StorageError ? e.kidMessage : 'もぎしけんの きろくを ほぞんできませんでした。',
      );
    }
  }

  // ── しばまる（経験値・ごほうび）────────────────────
  /**
   * 経験値を足す。経験値は絶対に減りません。
   * レベルアップ・新しい場所・ごほうびがあれば、そのお知らせを返します。
   */
  async function addExp(amount: number, opts: { firstOfDay: boolean }): Promise<void> {
    const gain = amount + (opts.firstOfDay ? EXP.firstOfDay : 0);
    const before = gameRef.current;
    const after: GameState = { ...before, exp: before.exp + gain };

    const lvBefore = levelFromExp(before.exp);
    const lvAfter = levelFromExp(after.exp);
    const spotBefore = mapProgress(before.exp).index;
    const spotAfter = mapProgress(after.exp).index;
    const itemsBefore = new Set(unlockedItems(before.exp));
    const newItems = unlockedItems(after.exp).filter((i) => !itemsBefore.has(i));

    if (spotAfter > spotBefore) {
      after.seenSpots = [...new Set([...after.seenSpots, spotAfter])];
    }
    setGameBoth(after);
    setRewardNews({
      levelUp: lvAfter > lvBefore ? lvAfter : null,
      spot: spotAfter > spotBefore ? MAP_SPOTS[spotAfter].name : null,
      items: newItems,
    });
    try {
      await saveGame(after);
    } catch {
      // しばまるの状態が保存できなくても、学習の記録は別に保存されているので続けられる
    }
  }

  /** きょう、まだ1回も学習していないか */
  const isFirstOfDay = () => !sessionDates.includes(toDateKey());

  async function changeGame(g: GameState) {
    setGameBoth(g);
    try {
      await saveGame(g);
      setSaveError(null);
    } catch (e) {
      setSaveError(
        e instanceof StorageError ? e.kidMessage : 'しばまるの じょうたいを ほぞんできませんでした。',
      );
    }
  }

  // ── なぞり書き ───────────────────────────────────
  // なぞり書きは「おぼえるための練習」なので、
  // 読みの復習の箱（Leitner）は動かしません。テストではないためです。
  function startTracing() {
    // 並べる順番は charsForKyu（学年の高いほうから）と同じ。
    // そのうえで「まだなぞっていない字」を優先します。
    const pool = chars.map((c) => kanjiByChar.get(c)).filter((k): k is KanjiEntry => !!k);
    const sorted = pool
      .map((k, i) => ({ k, i }))
      .sort((a, b) => {
        const ta = traces.get(a.k.c)?.times ?? 0;
        const tb = traces.get(b.k.c)?.times ?? 0;
        if (ta !== tb) return ta - tb;
        return a.i - b.i;
      })
      .map((x) => x.k);
    const queue = sorted.slice(0, TRACE_SESSION_SIZE);
    if (queue.length === 0) {
      setLoadError('なぞれる かんじが 見つかりませんでした。');
      return;
    }
    preloadGrade(queue[0].grade);
    setRewardNews(null);
    setTraceQueue(queue);
    setTraceResult(null);
    setSaveError(null);
    setScreen('tracing');
  }

  async function finishTracing(result: { traced: string[]; retries: number }) {
    setTraceResult(result);
    setScreen('tracingResult');
    if (result.traced.length === 0) return;
    try {
      const now = Date.now();
      const updated = new Map(traces);
      const items: TraceRecord[] = [];
      for (const c of result.traced) {
        const cur = updated.get(c) ?? { c, times: 0, retries: 0, lastTracedAt: 0 };
        const next: TraceRecord = {
          c,
          times: cur.times + 1,
          // やり直し回数は、その回のぶんを字数で割ってならす
          retries: cur.retries + Math.round(result.retries / result.traced.length),
          lastTracedAt: now,
        };
        updated.set(c, next);
        items.push(next);
      }
      await saveTraces(items);
      await recordSession({
        date: toDateKey(),
        startedAt: now,
        finishedAt: now,
        kyu: settings.kyu,
        mode: 'tracing',
        total: result.traced.length,
        correct: result.traced.length,
        wrongChars: [],
      });
      setTraces(updated);
      const first = isFirstOfDay();
      setSessionDates((d) => [...d, toDateKey()]);
      setSessionCount((n) => n + 1);
      setSaveError(null);
      await addExp(result.traced.length * EXP.tracingChar, { firstOfDay: first });
    } catch (e) {
      setSaveError(
        e instanceof StorageError ? e.kidMessage : 'きろくの ほぞんに しっぱいしました。',
      );
    }
  }

  // ── 書き取り（自己採点）─────────────────────────
  function startWriting() {
    const picked = pickForSession({
      candidates: chars,
      progress,
      size: settings.sessionSize,
      canUse,
    });
    const used = new Set<string>();
    const qs: WritingQuestion[] = [];
    for (const c of picked.chars) {
      const q = makeWritingQuestion(c, wordIndex, used);
      if (q) qs.push(q);
    }
    if (qs.length === 0) {
      setLoadError('いまは だせる もんだいが ありません。せっていで きゅうを かえてみてね。');
      return;
    }
    setRewardNews(null);
    setWritingQuestions(qs);
    setWritingResults([]);
    setStartedAt(Date.now());
    setSaveError(null);
    setScreen('writing');
  }

  async function finishWriting(res: WritingResult[]) {
    setWritingResults(res);
    setScreen('writingResult');
    if (res.length === 0) return;
    try {
      // 「できた」だけを正解あつかいにする。
      // 「おしい」も箱1に戻すのは、書けていない字を早めにもう一度出すため。
      const next = new Map(progressRef.current);
      for (const r of res) {
        const cur = next.get(r.q.answer) ?? newProgress(r.q.answer);
        next.set(r.q.answer, applyAnswer(cur, r.grade === 'ok'));
      }
      setProgressBoth(next);

      const toSave = [...new Set(res.map((r) => r.q.answer))]
        .map((c) => next.get(c))
        .filter((p): p is Progress => !!p);
      await saveProgressBatch(toSave);

      const now = Date.now();
      const today = toDateKey();
      const grades: SelfGradeRecord[] = res.map((r) => ({
        date: today, at: now, c: r.q.answer, word: r.q.word, grade: r.grade,
      }));
      await addSelfGrades(grades);
      await recordSession({
        date: today,
        startedAt,
        finishedAt: now,
        kyu: settings.kyu,
        mode: 'writing',
        total: res.length,
        correct: res.filter((r) => r.grade === 'ok').length,
        wrongChars: res.filter((r) => r.grade !== 'ok').map((r) => r.q.answer),
      });
      setSelfGrades((prev) => [...grades, ...prev]);
      const first = isFirstOfDay();
      setSessionDates((d) => [...d, today]);
      setSessionCount((n) => n + 1);
      setTodayAnswered((n) => n + res.length);
      setSaveError(null);
      const gained = res.reduce(
        (n, r) => n + (r.grade === 'ok' ? EXP.writingOk : EXP.writingOther),
        0,
      );
      await addExp(gained, { firstOfDay: first });
    } catch (e) {
      setSaveError(
        e instanceof StorageError ? e.kidMessage : 'きろくの ほぞんに しっぱいしました。',
      );
    }
  }

  // ── 1問こたえたとき ─────────────────────────────
  // 習熟度の計算は「1問につき1回だけ」。
  // 画面はすぐ更新し、iPad への保存はセッションの最後にまとめて行う
  //（1問ごとに保存すると、途中で失敗したときに記録がちぐはぐになるため）。
  const answeredChars = useRef<Set<string>>(new Set());

  function handleAnswer(q: Question, correct: boolean) {
    const next = new Map(progressRef.current);
    const cur = next.get(q.targetChar) ?? newProgress(q.targetChar);
    next.set(q.targetChar, applyAnswer(cur, correct));
    answeredChars.current.add(q.targetChar);
    setProgressBoth(next);
  }

  // ── セッションが終わったとき ─────────────────────
  async function finishSession(res: { q: Question; correct: boolean }[]) {
    setResults(res);
    setScreen('result');
    if (res.length === 0) return;

    // 保存に失敗しても、画面はもう結果を出しているので学習の流れは止まらない
    try {
      // 習熟度は handleAnswer ですでに1回だけ計算済み。
      // ここでは計算し直さず、そのまま保存する（二重に進めないため）。
      const toSave = [...answeredChars.current]
        .map((c) => progressRef.current.get(c))
        .filter((p): p is Progress => !!p);

      await saveProgressBatch(toSave);
      await recordSession({
        date: toDateKey(),
        startedAt,
        finishedAt: Date.now(),
        kyu: settings.kyu,
        mode: 'reading',
        total: res.length,
        correct: res.filter((r) => r.correct).length,
        wrongChars: res.filter((r) => !r.correct).map((r) => r.q.targetChar),
      });
      const first = isFirstOfDay();
      setSessionDates((d) => [...d, toDateKey()]);
      setSessionCount((n) => n + 1);
      setTodayAnswered((n) => n + res.length);
      setSaveError(null);
      const gained = res.reduce(
        (n, r) => n + (r.correct ? EXP.readingCorrect : EXP.readingWrong),
        0,
      );
      await addExp(gained, { firstOfDay: first });
    } catch (e) {
      setSaveError(
        e instanceof StorageError
          ? e.kidMessage
          : 'きろくの ほぞんに しっぱいしました。もういちど ためしてみてね。',
      );
    }
  }

  // ── 設定を変えたとき ────────────────────────────
  async function changeSettings(s: Settings) {
    setSettings(s); // 先に画面へ反映（保存に失敗してもその場では使える）
    try {
      await saveSettings(s);
      setSaveError(null);
    } catch (e) {
      setSaveError(
        e instanceof StorageError ? e.kidMessage : 'せっていを ほぞんできませんでした。',
      );
    }
  }

  if (screen === 'loading') {
    return (
      <div className="app">
        <div className="card center">
          <p>よみこんでいます…</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary where={screen}>
      {updateReady && screen === 'home' && (
        <div className="app" style={{ paddingBottom: 0 }}>
          <div className="notice">
            <b>あたらしい バージョンが あります</b>
            <br />
            きろくは そのまま のこります。
            <button className="ghost" style={{ marginTop: 8 }} onClick={applyUpdate}>
              あたらしくする
            </button>
          </div>
        </div>
      )}

      {loadError && screen === 'home' && (
        <div className="app" style={{ paddingBottom: 0 }}>
          <div className="notice bad">{loadError}</div>
        </div>
      )}

      {screen === 'home' && (
        <Home
          settings={settings}
          summary={summary}
          sessionDates={sessionDates}
          todayAnswered={todayAnswered}
          storageOk={storageOk}
          blockedCount={chars.length - usableChars.length}
          onStart={startSession}
          onStartTracing={startTracing}
          onStartWriting={startWriting}
          game={game}
          onOpenMap={() => setScreen('map')}
          onOpenZukan={() => setScreen('zukan')}
          onOpenDressup={() => setScreen('dressup')}
          onOpenExam={prepareExam}
          onOpenPractice={() => setScreen('practice')}
          onOpenNextKyu={() => setScreen('nextKyu')}
          examPassed={examPassed}
          examBest={examHistory.length === 0 ? null : Math.max(...examHistory.map((e) => e.score))}
          examCount={examHistory.length}
          tracedCount={traces.size}
          onOpenSettings={() => setScreen('settings')}
          onOpenBackup={() => setScreen('backup')}
          onDismissInstallHint={() =>
            void changeSettings({ ...settings, installHintHiddenUntil: snoozeUntil() })
          }
        />
      )}

      {screen === 'session' && (
        <Session
          questions={questions}
          settings={settings}
          onAnswer={handleAnswer}
          onFinish={(r) => void finishSession(r)}
          onQuit={() => setScreen('home')}
        />
      )}

      {screen === 'result' && (
        <Result
          results={results}
          saveError={saveError}
          reward={rewardNews}
          game={game}
          onHome={() => setScreen('home')}
          onAgain={startSession}
          onOpenMap={() => setScreen('map')}
        />
      )}

      {screen === 'tracing' && (
        <Tracing
          queue={traceQueue}
          onFinish={(r) => void finishTracing(r)}
          onQuit={() => setScreen('home')}
        />
      )}

      {screen === 'tracingResult' && traceResult && (
        <div className="app">
          <div className="card center">
            <Shibamaru expression="happy" hat={game.hat} collar={game.collar} size={110} />
            <h1>なぞりがき おつかれさま！</h1>
            <p style={{ fontSize: 30, margin: '8px 0 0' }}>
              {traceResult.traced.join('　')}
            </p>
            <p className="muted">{traceResult.traced.length}字 なぞれました</p>
            {traceResult.retries > 0 && (
              <p className="muted">やりなおし {traceResult.retries}かい</p>
            )}
          </div>
          {saveError && <div className="notice bad">{saveError}</div>}
          <RewardNews news={rewardNews} onOpenMap={() => setScreen('map')} />
          <button className="primary" onClick={() => setScreen('home')}>
            ホームに もどる
          </button>
          <button className="ghost wide" style={{ marginTop: 8 }} onClick={startTracing}>
            もう1かい なぞる
          </button>
        </div>
      )}

      {screen === 'writing' && (
        <Writing
          questions={writingQuestions}
          kanjiByChar={kanjiByChar}
          onFinish={(r) => void finishWriting(r)}
          onQuit={() => setScreen('home')}
        />
      )}

      {screen === 'writingResult' && (
        <div className="app">
          <div className="card center">
            <Shibamaru
              expression={
                writingResults.filter((r) => r.grade === 'ok').length >= writingResults.length * 0.6
                  ? 'happy'
                  : 'cheer'
              }
              hat={game.hat}
              collar={game.collar}
              size={110}
            />
            <h1>おつかれさま！</h1>
            <p style={{ fontSize: 40, margin: '8px 0 0' }}>
              <b>{writingResults.filter((r) => r.grade === 'ok').length}</b>
              <span style={{ fontSize: 22, color: 'var(--ink-soft)' }}>
                {' '}/ {writingResults.length}もん
              </span>
            </p>
            <p className="muted">「できた」を えらんだ かず</p>
          </div>
          {saveError && <div className="notice bad">{saveError}</div>}
          <RewardNews news={rewardNews} onOpenMap={() => setScreen('map')} />
          {writingResults.some((r) => r.grade !== 'ok') && (
            <div className="card">
              <h2>また あした でてくるよ</h2>
              {writingResults
                .filter((r) => r.grade !== 'ok')
                .map((r, i) => (
                  <p key={i} style={{ fontSize: 20, marginBottom: 6 }}>
                    {r.q.answer}（{r.q.word}）
                  </p>
                ))}
            </div>
          )}
          <button className="primary" onClick={() => setScreen('home')}>
            ホームに もどる
          </button>
          <button className="ghost wide" style={{ marginTop: 8 }} onClick={startWriting}>
            もう1かい やる
          </button>
        </div>
      )}

      {screen === 'map' && (
        <MapScreen game={game} sessionDates={sessionDates} onBack={() => setScreen('home')} />
      )}

      {screen === 'zukan' && (
        <ZukanScreen
          kyu={settings.kyu}
          kanji={ALL_KANJI}
          words={ALL_WORDS}
          progress={progress}
          traced={new Set(traces.keys())}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'dressup' && (
        <DressupScreen
          game={game}
          onChange={(g) => void changeGame(g)}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'examIntro' && exam && (
        <div className="app">
          <h1>もぎしけん</h1>
          <div className="card">
            <p>
              本番と おなじ ならびで、<b>{exam.totalPoints}点満点</b>・
              <b>{exam.minutes}分</b> です。
            </p>
            <p className="muted">
              合格ラインは {passLine(exam.totalPoints)}点（満点の70%）。
              {exam.totalPoints < exam.fullPoints && (
                <>
                  <br />
                  本番は {exam.fullPoints}点満点で、{Math.round(exam.fullPoints * 0.7)}点前後が
                  合格ラインです。
                </>
              )}
            </p>
            <div className="secbars" style={{ marginTop: 12 }}>
              {exam.sections.map((s) => (
                <div className="secbar" key={s.no}>
                  <span className="name">{s.no} {s.title}</span>
                  <span />
                  <span className="num">{s.points}点</span>
                </div>
              ))}
            </div>
            {exam.skipped.length > 0 && (
              <div className="notice" style={{ marginTop: 12 }}>
                <b>いま 出せない 大問</b>
                <br />
                {exam.skipped.map((s) => (
                  <span key={s.no}>
                    {s.no} {s.title}（{s.points}点）… {s.why}
                    <br />
                  </span>
                ))}
                <span className="muted">
                  おうちの人が data/approvals/ の CSV を かくにんすると 出るようになります。
                </span>
              </div>
            )}
          </div>
          <div className="card">
            <p className="muted">
              とちゅうで まえの もんだいに もどれます。
              かんじを 書く もんだいは、さいごに じぶんで まるつけします。
            </p>
            <button className="primary" onClick={startExam}>
              はじめる
            </button>
          </div>
          <button className="ghost wide" onClick={() => setScreen('home')}>
            やめて ホームに もどる
          </button>
        </div>
      )}

      {screen === 'exam' && exam && (
        <ExamScreen exam={exam} onFinish={afterExam} onQuit={() => setScreen('home')} />
      )}

      {screen === 'examGrading' && exam && (
        <ExamGrading
          items={exam.sections
            .flatMap((s) => s.questions)
            .filter((q) => !isAutoScored(q))
            .map((q) => ({ q, a: examAnswers.get(q.id) }))}
          onDone={(correct) =>
            void scoreExam(examAnswers, correct, examMeta.seconds, examMeta.timedOut)
          }
        />
      )}

      {screen === 'examResult' && examResult && (
        <ExamResultScreen
          result={examResult}
          history={examHistory}
          game={game}
          saveError={saveError}
          onHome={() => setScreen('home')}
          onAgain={prepareExam}
        />
      )}

      {screen === 'settings' && (
        <SettingsScreen
          settings={settings}
          onChange={(s) => void changeSettings(s)}
          onBack={() => setScreen('home')}
          saveError={saveError}
        />
      )}

      {screen === 'backup' && (
        <BackupScreen
          onBack={() => setScreen('home')}
          onDataChanged={() => void reload()}
          counts={{ progress: progress.size, sessions: sessionCount }}
          selfGrades={selfGrades}
          exams={examHistory}
          sessions={sessionRecords}
          lastBackupAt={settings.lastBackupAt}
          onBackupDone={() =>
            void changeSettings({ ...settings, lastBackupAt: Date.now() })
          }
          onOpenAbout={() => setScreen('about')}
        />
      )}

      {screen === 'about' && <AboutScreen onBack={() => setScreen('backup')} />}

      {screen === 'nextKyu' && (
        <NextKyuScreen
          kyu={settings.kyu}
          kanji={ALL_KANJI}
          learned={new Set(progress.keys())}
          passedCount={examPassed}
          onChangeKyu={(k) => {
            void changeSettings({ ...settings, kyu: k });
            setScreen('home');
          }}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'practice' && (
        <PracticeScreen
          kyu={settings.kyu}
          data={examData}
          kanjiByChar={kanjiByChar}
          weakRates={weakRates}
          onFinish={(r) => void finishPractice(r)}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'practiceResult' && practiceResult && (
        <PracticeResultView
          result={practiceResult}
          onAgain={() => setScreen('practice')}
          onBack={() => setScreen('home')}
        />
      )}
    </ErrorBoundary>
  );
}
