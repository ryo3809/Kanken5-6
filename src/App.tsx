// アプリ全体のとりまとめ。画面の切りかえと、データの読み書きをここで行う。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import kanjiData from './data/kanji.json';
import wordsData from './data/words.json';
import type { KanjiEntry, Progress, Question, Settings, WordEntry } from './lib/types';
import { DEFAULT_SETTINGS } from './lib/types';
import {
  addSession, isStorageAvailable, loadAllProgress, loadSessions, loadSettings,
  saveProgressBatch, saveSettings, StorageError,
} from './lib/db';
import { applyAnswer, newProgress, pickForSession, summarize, toDateKey } from './lib/leitner';
import { buildWordIndex, charsForKyu, collectReadings, makeReadingQuestion } from './lib/questions';
import { Home } from './screens/Home';
import { Session } from './screens/Session';
import { Result } from './screens/Result';
import { SettingsScreen } from './screens/SettingsScreen';
import { BackupScreen } from './screens/BackupScreen';
import { ErrorBoundary } from './components/ErrorBoundary';

const ALL_KANJI = (kanjiData as { kanji: KanjiEntry[] }).kanji;
const ALL_WORDS = (wordsData as { words: WordEntry[] }).words;

type Screen = 'loading' | 'home' | 'session' | 'result' | 'settings' | 'backup';

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
      const [s, p, sess] = await Promise.all([loadSettings(), loadAllProgress(), loadSessions()]);
      setSettings(s);
      setProgressBoth(p);
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
        />
      )}
    </ErrorBoundary>
  );
}
