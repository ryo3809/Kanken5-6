// アプリ全体のとりまとめ。画面の切りかえと、データの読み書きをここで行う。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import kanjiData from './data/kanji.json';
import wordsData from './data/words.json';
import type {
  KanjiEntry, Progress, Question, SelfGradeRecord, Settings, TraceRecord, WordEntry,
} from './lib/types';
import { DEFAULT_SETTINGS } from './lib/types';
import {
  addSelfGrades, addSession, isStorageAvailable, loadAllProgress, loadSelfGrades, loadSessions,
  loadSettings, loadTraces, saveProgressBatch, saveSettings, saveTraces, StorageError,
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
import { Tracing } from './screens/Tracing';
import { Writing, type WritingResult } from './screens/Writing';
import { preloadGrade } from './lib/strokeStore';
import { ErrorBoundary } from './components/ErrorBoundary';

const ALL_KANJI = (kanjiData as { kanji: KanjiEntry[] }).kanji;
const ALL_WORDS = (wordsData as { words: WordEntry[] }).words;

type Screen =
  | 'loading' | 'home' | 'session' | 'result'
  | 'tracing' | 'tracingResult'
  | 'writing' | 'writingResult'
  | 'settings' | 'backup';

/** なぞり書き1回ぶんの字数 */
const TRACE_SESSION_SIZE = 3;

/** 連続学習日数。1日でも空いてもゼロには戻さない（続ける気持ちを折らないため） */
function calcStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const set = new Set(dates);
  let streak = 0;
  const d = new Date();
  // きょうまだやっていなければ、きのうから数える
  if (!set.has(toDateKey(d))) d.setDate(d.getDate() - 1);
  for (;;) {
    if (!set.has(toDateKey(d))) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

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
  const [traces, setTraces] = useState<Map<string, TraceRecord>>(new Map());
  const [traceQueue, setTraceQueue] = useState<KanjiEntry[]>([]);
  const [traceResult, setTraceResult] = useState<{ traced: string[]; retries: number } | null>(null);
  const [writingQuestions, setWritingQuestions] = useState<WritingQuestion[]>([]);
  const [writingResults, setWritingResults] = useState<WritingResult[]>([]);
  const [selfGrades, setSelfGrades] = useState<SelfGradeRecord[]>([]);
  const [todayAnswered, setTodayAnswered] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [storageOk, setStorageOk] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [results, setResults] = useState<{ q: Question; correct: boolean }[]>([]);
  const [startedAt, setStartedAt] = useState(0);

  // ── 起動時の読みこみ ─────────────────────────────
  const reload = useCallback(async () => {
    try {
      const ok = await isStorageAvailable();
      setStorageOk(ok);
      const [s, p, sess, tr, sg] = await Promise.all([
        loadSettings(), loadAllProgress(), loadSessions(), loadTraces(), loadSelfGrades(),
      ]);
      setSettings(s);
      setProgressBoth(p);
      setTraces(tr);
      setSelfGrades(sg);
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
  }, [setProgressBoth]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // ── いまの級のデータ ─────────────────────────────
  const chars = useMemo(() => charsForKyu(ALL_KANJI, settings.kyu), [settings.kyu]);
  const wordIndex = useMemo(() => buildWordIndex(ALL_WORDS, settings.kyu), [settings.kyu]);
  const readingPool = useMemo(() => collectReadings(ALL_WORDS, settings.kyu), [settings.kyu]);
  /** 校正が済んだ熟語がある漢字だけが、いま出題できる */
  const canUse = useCallback((c: string) => (wordIndex.get(c)?.length ?? 0) > 0, [wordIndex]);
  const usableChars = useMemo(() => chars.filter(canUse), [chars, canUse]);
  const kanjiByChar = useMemo(() => new Map(ALL_KANJI.map((k) => [k.c, k])), []);
  const summary = useMemo(() => summarize(chars, progress), [chars, progress]);
  const streak = useMemo(() => calcStreak(sessionDates), [sessionDates]);

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
    setQuestions(qs);
    setResults([]);
    setStartedAt(Date.now());
    setSaveError(null);
    setScreen('session');
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
      await addSession({
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
      setSessionDates((d) => [...d, toDateKey()]);
      setSessionCount((n) => n + 1);
      setSaveError(null);
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
      await addSession({
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
      setSessionDates((d) => [...d, today]);
      setSessionCount((n) => n + 1);
      setTodayAnswered((n) => n + res.length);
      setSaveError(null);
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
      await addSession({
        date: toDateKey(),
        startedAt,
        finishedAt: Date.now(),
        kyu: settings.kyu,
        mode: 'reading',
        total: res.length,
        correct: res.filter((r) => r.correct).length,
        wrongChars: res.filter((r) => !r.correct).map((r) => r.q.targetChar),
      });
      setSessionDates((d) => [...d, toDateKey()]);
      setSessionCount((n) => n + 1);
      setTodayAnswered((n) => n + res.length);
      setSaveError(null);
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
      {loadError && screen === 'home' && (
        <div className="app" style={{ paddingBottom: 0 }}>
          <div className="notice bad">{loadError}</div>
        </div>
      )}

      {screen === 'home' && (
        <Home
          settings={settings}
          summary={summary}
          streakDays={streak}
          todayAnswered={todayAnswered}
          storageOk={storageOk}
          blockedCount={chars.length - usableChars.length}
          onStart={startSession}
          onStartTracing={startTracing}
          onStartWriting={startWriting}
          tracedCount={traces.size}
          onOpenSettings={() => setScreen('settings')}
          onOpenBackup={() => setScreen('backup')}
          onDismissInstallHint={() => void changeSettings({ ...settings, dismissedInstallHint: true })}
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
          onHome={() => setScreen('home')}
          onAgain={startSession}
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
        />
      )}
    </ErrorBoundary>
  );
}
