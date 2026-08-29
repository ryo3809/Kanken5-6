// 分野べつれんしゅうの画面。
//
// なぜ作ったか：
//   模擬試験で「どの大問がにがてか」が分かっても、
//   そこだけを練習する場所がありませんでした。
//   ここでは大問を1つえらんで、10問だけ集中して練習できます。
//
// 模擬試験とのちがい：
//   ・時間制限はありません（急かさない）
//   ・1問ごとにその場で答え合わせをします
//   ・点数は出しません。「できた数」だけを出します
//   ・復習の箱（1〜5）は動かしません。箱は「きょうの がくしゅう」で動かします
//     （同じ字が2つの道すじで進んでしまうと、復習の間隔がくるうため）

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExamData, ExamQuestion, Practice, PracticeSpec, SectionId } from '../lib/exam';
import { buildPractice, practiceList } from '../lib/exam';
import type { KanjiEntry, Kyu, SelfGrade } from '../lib/types';
import { normalizeAnswer } from '../lib/questions';
import { getStrokes, StrokeLoadError } from '../lib/strokeStore';
import { WritingCanvas } from '../components/WritingCanvas';
import { StrokeHighlight } from '../components/StrokeHighlight';
import { Shibamaru } from '../character/Shibamaru';

/** 1問ぶんの結果 */
export interface PracticeAnswer {
  /** 手書き以外は自動採点、手書きは自分で選んだ結果 */
  correct: boolean;
  /** 手書きのときだけ。おうちの人の画面に出す記録に使う */
  grade?: SelfGrade;
  char: string;
  word: string;
}

export interface PracticeResult {
  sectionId: SectionId;
  title: string;
  answers: PracticeAnswer[];
}

interface Props {
  kyu: Kyu;
  data: ExamData;
  kanjiByChar: Map<string, KanjiEntry>;
  /** 大問番号 → 正答率（模擬試験の記録から。にがて印をつけるのに使う） */
  weakRates: Map<string, number>;
  onFinish: (result: PracticeResult) => void;
  onBack: () => void;
}

/** 1回のれんしゅうの問題数 */
const SIZE = 10;
/** これより正答率が低い大問には「にがて」の印をつける */
const WEAK_UNDER = 60;

const GRADE_BUTTONS: { key: SelfGrade; label: string }[] = [
  { key: 'ok', label: '⭕️ できた' },
  { key: 'close', label: '△ おしい' },
  { key: 'ng', label: '✗ まちがえた' },
];

export function PracticeScreen({ kyu, data, kanjiByChar, weakRates, onFinish, onBack }: Props) {
  const list = useMemo(() => practiceList(kyu), [kyu]);
  // どの分野が いま出せるか。承認まちの分野は、押す前から分かるようにする
  //（押してから「出せません」と言われるより、はじめから分かるほうが親切）
  const ready = useMemo(
    () => new Set(list.filter((sp) => buildPractice(kyu, data, sp.id, 2, 1)).map((sp) => sp.id)),
    [list, kyu, data],
  );
  const [practice, setPractice] = useState<Practice | null>(null);

  if (!practice) {
    return (
      <SelectView
        list={list}
        ready={ready}
        weakRates={weakRates}
        onPick={(sp) => {
          const p = buildPractice(kyu, data, sp.id, SIZE);
          if (p) setPractice(p);
        }}
        onBack={onBack}
      />
    );
  }
  return (
    <PlayView
      practice={practice}
      kanjiByChar={kanjiByChar}
      onFinish={onFinish}
      onQuit={() => setPractice(null)}
    />
  );
}

// ── 分野をえらぶ ────────────────────────────────────────────
function SelectView({
  list, ready, weakRates, onPick, onBack,
}: {
  list: PracticeSpec[];
  ready: Set<SectionId>;
  weakRates: Map<string, number>;
  onPick: (sp: PracticeSpec) => void;
  onBack: () => void;
}) {
  const waiting = list.filter((sp) => !ready.has(sp.id));
  return (
    <div className="app">
      <h1>ぶんやべつ れんしゅう</h1>
      <p className="muted">
        にがてな ところだけを {SIZE}問ずつ れんしゅうできます。じかんせいげんは ありません。
      </p>

      {waiting.length > 0 && (
        <div className="notice">
          {waiting.map((sp) => sp.title).join('・')} は いま だせません。
          <br />
          <span className="muted">
            この ぶんやの データは、おうちの人の かくにん まちです。
          </span>
        </div>
      )}

      <div className="practicelist">
        {list.map((sp) => {
          const rate = weakRates.get(sp.no);
          const ok = ready.has(sp.id);
          const weak = ok && rate !== undefined && rate < WEAK_UNDER;
          return (
            <button
              key={sp.id}
              className={`practiceitem${weak ? ' weak' : ''}`}
              disabled={!ok}
              onClick={() => onPick(sp)}
            >
              <span className="no">{sp.no || '＋'}</span>
              <span className="title">
                {sp.title}
                {sp.note && <span className="note">{sp.note}</span>}
              </span>
              <span className="rate">
                {!ok ? 'かくにん まち' : weak ? 'にがて' : rate !== undefined ? `${rate}%` : ''}
              </span>
            </button>
          );
        })}
      </div>

      <button className="primary" onClick={onBack}>
        ホームに もどる
      </button>
    </div>
  );
}

// ── といていく ──────────────────────────────────────────────
function PlayView({
  practice, kanjiByChar, onFinish, onQuit,
}: {
  practice: Practice;
  kanjiByChar: Map<string, KanjiEntry>;
  onFinish: (r: PracticeResult) => void;
  onQuit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [judged, setJudged] = useState<boolean | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [paths, setPaths] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const answersRef = useRef<PracticeAnswer[]>([]);

  const q: ExamQuestion | undefined = practice.questions[index];
  const isLast = index >= practice.questions.length - 1;

  // 手書きの問題は、お手本の筆順データを先に読みこんでおく
  useEffect(() => {
    setTyped('');
    setJudged(null);
    setShowAnswer(false);
    setDrawn(false);
    setPaths(null);
    setLoadError(null);
    if (!q || q.kind !== 'write') return;
    const char = q.writeChar ?? q.answer[0];
    let alive = true;
    getStrokes(char, q.writeGrade ?? kanjiByChar.get(char)?.grade ?? 1)
      .then((p) => { if (alive) setPaths(p); })
      .catch((e) => {
        if (!alive) return;
        setLoadError(
          e instanceof StrokeLoadError ? e.kidMessage : 'おてほんを よみこめませんでした。',
        );
      });
    return () => { alive = false; };
  }, [q, kanjiByChar]);

  const handleDrawnChange = useCallback((d: boolean) => setDrawn(d), []);

  if (!q) return null;

  const record = (a: PracticeAnswer) => {
    answersRef.current.push(a);
    if (isLast) {
      onFinish({ sectionId: practice.id, title: practice.title, answers: answersRef.current });
    } else {
      setIndex((i) => i + 1);
    }
  };

  const answerChar = q.writeChar ?? q.answer[0];
  const next = (correct: boolean, grade?: SelfGrade) =>
    record({ correct, grade, char: answerChar, word: q.prompt });

  return (
    <div className="app">
      <p className="muted center" style={{ marginBottom: 6 }}>
        {practice.no ? `${practice.no} ` : ''}{practice.title}　{index + 1} / {practice.questions.length}もん
      </p>
      <div className="progressbar" style={{ marginBottom: 10 }}>
        <div style={{ width: `${((index + 1) / practice.questions.length) * 100}%` }} />
      </div>

      <div className="card">
        <p className="muted" style={{ marginBottom: 8 }}>{practice.instruction}</p>
        {q.highlightStroke && q.writeChar ? (
          <StrokeHighlight char={q.writeChar} grade={q.writeGrade ?? 1} highlight={q.highlightStroke} />
        ) : (
          <p className="examprompt" lang="ja">{q.prompt}</p>
        )}
        {q.hint && <p className="muted center">{q.hint}</p>}
      </div>

      {/* ── えらぶ問題 ── */}
      {q.kind === 'choice' && (
        <div className="choices">
          {q.choices!.map((ch) => {
            const isAnswer = ch === q.answer;
            const cls =
              judged === null ? '' : isAnswer ? 'correct' : 'wrong';
            return (
              <button
                key={ch}
                className={cls}
                disabled={judged !== null}
                onClick={() => setJudged(ch === q.answer)}
              >
                {ch}
              </button>
            );
          })}
        </div>
      )}

      {/* ── ひらがなで書く問題 ── */}
      {q.kind === 'text' && (
        <div className="card">
          <input
            className="answerbox"
            type="text"
            lang="ja"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="ひらがなで かいてね"
            value={typed}
            disabled={judged !== null}
            onChange={(e) => setTyped(e.target.value)}
          />
          {judged === null && (
            <button
              className="primary wide"
              style={{ marginTop: 10 }}
              disabled={typed.trim() === ''}
              onClick={() => {
                const got = normalizeAnswer(typed);
                setJudged((q.acceptable ?? [q.answer]).some((x) => normalizeAnswer(x) === got));
              }}
            >
              こたえあわせ
            </button>
          )}
        </div>
      )}

      {/* ── 手で書く問題 ── */}
      {q.kind === 'write' && (
        <>
          <div className="card" style={{ padding: 14 }}>
            {loadError && <div className="notice bad">{loadError}</div>}
            <WritingCanvas
              answerPaths={paths}
              showAnswer={showAnswer}
              resetKey={`${index}-${q.id}`}
              onDrawnChange={handleDrawnChange}
            />
          </div>
          {!showAnswer && (
            <>
              <button
                className="primary"
                disabled={!drawn || !paths}
                onClick={() => setShowAnswer(true)}
              >
                こたえを 見る
              </button>
              {!drawn && (
                <p className="muted center" style={{ marginTop: 8 }}>
                  まずは じぶんで かいてみてね
                </p>
              )}
            </>
          )}
        </>
      )}

      {/* ── 答え合わせのあと ── */}
      {q.kind !== 'write' && judged !== null && (
        <div className="card center">
          <Shibamaru expression={judged ? 'happy' : 'normal'} size={70} />
          <p className="verdict" style={{ fontSize: 22, fontWeight: 700 }}>
            {judged ? 'せいかい！' : 'こたえは…'}
          </p>
          {!judged && (
            <p style={{ fontSize: 20 }}>
              <b>{q.answer}</b>
            </p>
          )}
          <button className="primary wide" onClick={() => next(judged)}>
            {isLast ? 'けっかを みる' : 'つぎの もんだい'}
          </button>
        </div>
      )}

      {q.kind === 'write' && showAnswer && (
        <div className="card">
          <p className="center" style={{ fontSize: 20, marginBottom: 6 }}>
            こたえは <b style={{ fontSize: 30 }}>{q.answer}</b>
          </p>
          <p className="muted center">
            うすい むらさきの字が おてほんです。じぶんの字と くらべてね。
          </p>
          <p className="center" style={{ fontWeight: 700, margin: '14px 0 8px' }}>
            どうだった？
          </p>
          <div className="gradebuttons">
            {GRADE_BUTTONS.map((b) => (
              <button
                key={b.key}
                className={`grade-${b.key}`}
                onClick={() => next(b.key === 'ok', b.key)}
              >
                <span className="label">{b.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {confirmQuit ? (
        <div className="card">
          <p>
            {answersRef.current.length > 0
              ? `ここまでの ${answersRef.current.length}もん ぶんは きろくに のこります。やめてもいい？`
              : 'まだ 1もんも こたえていません。もどってもいい？'}
          </p>
          <div className="row">
            <button onClick={() => setConfirmQuit(false)}>つづける</button>
            <button
              className="danger"
              onClick={() =>
                answersRef.current.length > 0
                  ? onFinish({
                      sectionId: practice.id, title: practice.title, answers: answersRef.current,
                    })
                  : onQuit()
              }
            >
              やめる
            </button>
          </div>
        </div>
      ) : (
        <button className="ghost wide" style={{ marginTop: 8 }} onClick={() => setConfirmQuit(true)}>
          とちゅうで やめる
        </button>
      )}
    </div>
  );
}

// ── れんしゅうのけっか ──────────────────────────────────────
export function PracticeResultView({
  result, onAgain, onBack,
}: {
  result: PracticeResult;
  onAgain: () => void;
  onBack: () => void;
}) {
  const n = result.answers.length;
  const ok = result.answers.filter((a) => a.correct).length;
  // できなかった問題を責めない。できた数だけを出して、次にすすめる
  const exp = ok === n ? 'proud' : ok >= Math.ceil(n / 2) ? 'happy' : 'normal';
  const line =
    ok === n ? 'ぜんぶ できたね！' : ok >= Math.ceil(n / 2) ? 'いい ちょうしだよ' : 'つづけると おぼえられるよ';

  return (
    <div className="app">
      <h1>{result.title}</h1>
      <div className="card center">
        <Shibamaru expression={exp} size={100} />
        <p style={{ fontSize: 26, fontWeight: 700, margin: '10px 0 2px' }}>
          {ok} / {n} もん
        </p>
        <p className="muted">{line}</p>
      </div>

      {result.answers.some((a) => !a.correct) && (
        <div className="card">
          <h2>もういちど 見ておきたい字</h2>
          <p className="bigchars" lang="ja">
            {[...new Set(result.answers.filter((a) => !a.correct).map((a) => a.char))].join('　')}
          </p>
        </div>
      )}

      <button className="primary" onClick={onAgain}>
        べつの ぶんやを やる
      </button>
      <button className="ghost wide" style={{ marginTop: 8 }} onClick={onBack}>
        ホームに もどる
      </button>
    </div>
  );
}
