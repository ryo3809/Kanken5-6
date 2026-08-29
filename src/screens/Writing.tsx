// 書き取り（自己採点）の画面。
//
// ながれ:
//   1. 「ゼイ金」のように、書く字だけカタカナになった問題が出る
//   2. 白紙のマスに、自分の力で漢字を書く
//   3. 「こたえを見る」を押すと、正しい字が自分の字の上に半透明で重なる
//   4. 見くらべて「できた／おしい／まちがえた」を自分で選ぶ
//   5. 「おしい／まちがえた」を選んだ字は、あした復習に出る
//
// 責めたり、急かしたりする表示はしません。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KanjiEntry, SelfGrade } from '../lib/types';
import type { WritingQuestion } from '../lib/questions';
import { getStrokes, StrokeLoadError } from '../lib/strokeStore';
import { WritingCanvas } from '../components/WritingCanvas';

export interface WritingResult {
  q: WritingQuestion;
  grade: SelfGrade;
}

interface Props {
  questions: WritingQuestion[];
  /** 学年を知るために使う（筆順データの読みこみ先が学年ごとに分かれているため） */
  kanjiByChar: Map<string, KanjiEntry>;
  onFinish: (results: WritingResult[]) => void;
  onQuit: () => void;
}

const GRADE_BUTTONS: { key: SelfGrade; label: string; hint: string }[] = [
  { key: 'ok', label: '⭕️ できた', hint: 'おてほんと おなじに かけた' },
  { key: 'close', label: '△ おしい', hint: 'にているけど、すこし ちがった' },
  { key: 'ng', label: '✗ まちがえた', hint: 'ちがう字を かいた／かけなかった' },
];

export function Writing({ questions, kanjiByChar, onFinish, onQuit }: Props) {
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [paths, setPaths] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const resultsRef = useRef<WritingResult[]>([]);

  const q = questions[index];
  const isLast = index >= questions.length - 1;

  // 問題が変わったら、こたえ用の筆順データを先に読みこんでおく
  useEffect(() => {
    if (!q) return;
    let alive = true;
    setPaths(null);
    setShowAnswer(false);
    setDrawn(false);
    setLoadError(null);
    const grade = kanjiByChar.get(q.answer)?.grade ?? 1;
    getStrokes(q.answer, grade)
      .then((p) => { if (alive) setPaths(p); })
      .catch((e) => {
        if (!alive) return;
        setLoadError(
          e instanceof StrokeLoadError ? e.kidMessage : 'こたえの字を よみこめませんでした。',
        );
      });
    return () => { alive = false; };
  }, [q, kanjiByChar]);

  const handleDrawnChange = useCallback((d: boolean) => setDrawn(d), []);

  function choose(grade: SelfGrade) {
    resultsRef.current.push({ q, grade });
    if (isLast) onFinish(resultsRef.current);
    else setIndex((i) => i + 1);
  }

  if (!q) return null;

  return (
    <div className="app">
      <p className="muted center" style={{ marginBottom: 6 }}>
        {index + 1} / {questions.length}もん
      </p>

      <div className="card" style={{ paddingBottom: 12 }}>
        <p className="muted center" style={{ marginBottom: 2 }}>
          カタカナの ところを かんじで かこう
        </p>
        <p className="writing-prompt" lang="ja">
          {q.display}
        </p>
        <p className="muted center" style={{ marginTop: 0 }}>
          （{q.wordReading}）
        </p>
      </div>

      <div className="card" style={{ padding: 14 }}>
        {loadError && <div className="notice bad">{loadError}</div>}
        <WritingCanvas
          answerPaths={paths}
          showAnswer={showAnswer}
          resetKey={`${index}-${q.answer}`}
          onDrawnChange={handleDrawnChange}
        />
      </div>

      {!showAnswer ? (
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
          {drawn && !paths && (
            <p className="muted center" style={{ marginTop: 8 }}>
              こたえを よみこんでいます…
            </p>
          )}
        </>
      ) : (
        <>
          <div className="card">
            <p className="center" style={{ fontSize: 20, marginBottom: 6 }}>
              こたえは <b style={{ fontSize: 30 }}>{q.answer}</b>（{q.word}）
            </p>
            <p className="muted center">
              うすい むらさきの字が おてほんです。じぶんの字と くらべてね。
            </p>
            <p className="center" style={{ fontWeight: 700, margin: '14px 0 8px' }}>
              どうだった？
            </p>
            <div className="gradebuttons">
              {GRADE_BUTTONS.map((b) => (
                <button key={b.key} className={`grade-${b.key}`} onClick={() => choose(b.key)}>
                  <span className="label">{b.label}</span>
                  <span className="hint">{b.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="muted center">
            じぶんで しょうじきに えらぶのが、いちばん はやく おぼえられるよ
          </p>
        </>
      )}

      {confirmQuit ? (
        <div className="card">
          <p>
            {resultsRef.current.length > 0
              ? `とちゅうで やめると、ここまでの ${resultsRef.current.length}もん ぶんは きろくに のこります。やめてもいい？`
              : 'まだ 1もんも こたえていません。ホームに もどってもいい？'}
          </p>
          <div className="row">
            <button onClick={() => setConfirmQuit(false)}>つづける</button>
            <button
              className="danger"
              onClick={() =>
                resultsRef.current.length > 0 ? onFinish(resultsRef.current) : onQuit()
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
