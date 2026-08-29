// 学習セッションの画面。10〜15問で必ず終わります。
// 無限に続く作りにはしていません。

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Question, Settings } from '../lib/types';
import { isCorrect } from '../lib/questions';

interface Props {
  questions: Question[];
  settings: Settings;
  /** 1問ごとに呼ばれる。呼び出し側で習熟度を更新する */
  onAnswer: (q: Question, correct: boolean) => void;
  /** 全部終わったときに呼ばれる */
  onFinish: (results: { q: Question; correct: boolean }[]) => void;
  /** 途中でやめるとき */
  onQuit: () => void;
}

export function Session({ questions, settings, onAnswer, onFinish, onQuit }: Props) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [judged, setJudged] = useState<null | boolean>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<{ q: Question; correct: boolean }[]>([]);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = questions[index];
  const isLast = index >= questions.length - 1;

  // 次の問題になったら入力欄をまっさらにする
  useEffect(() => {
    setInput('');
    setJudged(null);
    setPicked(null);
  }, [index]);

  const progressPct = useMemo(
    () => ((index + (judged !== null ? 1 : 0)) / questions.length) * 100,
    [index, judged, questions.length],
  );

  if (!q) return null;

  function judge(answer: string) {
    if (judged !== null) return; // 二重に押されても1回しか数えない
    const ok = isCorrect(q, answer);
    setPicked(answer);
    setJudged(ok);
    const next = [...results, { q, correct: ok }];
    setResults(next);
    onAnswer(q, ok);
  }

  function goNext() {
    if (isLast) onFinish(results);
    else setIndex((i) => i + 1);
  }

  return (
    <div className="app">
      <div className="progressbar" aria-label="すすみぐあい">
        <div style={{ width: `${progressPct}%` }} />
      </div>

      <p className="muted center" style={{ marginTop: -8 }}>
        {index + 1} / {questions.length}もん
      </p>

      <div className="card">
        <p className="muted center">この ことばの よみかたは？</p>
        <div className="word" lang="ja">
          {q.word}
        </div>
      </div>

      {settings.answerMode === 'choice' ? (
        <div className="choices">
          {q.choices.map((c) => {
            let cls = '';
            if (judged !== null) {
              if (q.acceptable.includes(c)) cls = 'correct';
              else if (c === picked) cls = 'wrong';
            }
            return (
              <button key={c} className={cls} disabled={judged !== null} onClick={() => judge(c)}>
                {c}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <input
            ref={inputRef}
            className="answerbox"
            type="text"
            inputMode="text"
            lang="ja"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="ひらがなで かいてね"
            value={input}
            disabled={judged !== null}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && input.trim() && judged === null) judge(input);
            }}
          />
          {judged === null && (
            <button
              className="primary"
              style={{ marginTop: 12 }}
              disabled={!input.trim()}
              onClick={() => judge(input)}
            >
              こたえあわせ
            </button>
          )}
        </div>
      )}

      {judged !== null && (
        <div className="card">
          <div className={`verdict ${judged ? 'ok' : 'ng'}`}>
            {judged ? '⭕️ せいかい！' : '△ おしい'}
          </div>
          <p className="center" style={{ fontSize: 22, marginBottom: 4 }}>
            {q.word}　＝　<b>{q.answer}</b>
          </p>
          {q.acceptable.length > 1 && (
            <p className="muted center">
              ほかの よみかた：{q.acceptable.filter((a) => a !== q.answer).join('、')}
            </p>
          )}
          <button className="primary" style={{ marginTop: 8 }} onClick={goNext}>
            {isLast ? 'けっかを みる' : 'つぎの もんだい'}
          </button>
        </div>
      )}

      {confirmQuit ? (
        <div className="card">
          <p>
            {results.length > 0
              ? `とちゅうで やめると、ここまでの ${results.length}もん ぶんは きろくに のこります。やめてもいい？`
              : 'まだ 1もんも こたえていません。ホームに もどってもいい？'}
          </p>
          <div className="row">
            <button onClick={() => setConfirmQuit(false)}>つづける</button>
            <button
              className="danger"
              onClick={() => (results.length > 0 ? onFinish(results) : onQuit())}
            >
              やめる
            </button>
          </div>
        </div>
      ) : (
        <button className="ghost wide" onClick={() => setConfirmQuit(true)}>
          とちゅうで やめる
        </button>
      )}
    </div>
  );
}
