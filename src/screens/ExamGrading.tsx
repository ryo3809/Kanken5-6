// 模擬試験の「まるつけ」画面。
//
// 手で書いた答えを、お手本と ならべて見せます。
// 本番の答案を あとから 自分で まるつけするのと 同じやりかたです。
// 選ぶ問題・ひらがなで書く問題は 自動で 採点ずみなので、ここには出てきません。

import { useEffect, useState } from 'react';
import type { ExamQuestion } from '../lib/exam';
import type { ExamAnswer } from './ExamScreen';
import type { Point } from '../lib/svgpath';
import { KVG_SIZE } from '../lib/tracing';
import { getStrokes, StrokeLoadError } from '../lib/strokeStore';
import { KanjiGrid } from '../components/KanjiGrid';

interface Props {
  /** まるつけが必要な問題 */
  items: { q: ExamQuestion; a: ExamAnswer | undefined }[];
  onDone: (correct: Set<string>) => void;
}

export function ExamGrading({ items, onDone }: Props) {
  const [index, setIndex] = useState(0);
  const [correct] = useState(() => new Set<string>());
  const [, force] = useState(0);

  const cur = items[index];
  if (!cur) return null;

  function mark(ok: boolean) {
    if (ok) correct.add(cur.q.id);
    else correct.delete(cur.q.id);
    force((n) => n + 1);
    if (index + 1 >= items.length) onDone(correct);
    else setIndex(index + 1);
  }

  return (
    <div className="app">
      <p className="muted center" style={{ marginBottom: 6 }}>
        まるつけ　{index + 1} / {items.length}もん
      </p>
      <div className="progressbar" style={{ marginBottom: 12 }}>
        <div style={{ width: `${((index + 1) / items.length) * 100}%` }} />
      </div>

      <div className="card">
        <p className="muted center" style={{ marginBottom: 2 }}>もんだい</p>
        <p className="examprompt" lang="ja">{cur.q.prompt}</p>
        <p className="center" style={{ fontSize: 20 }}>
          こたえ　<b style={{ fontSize: 30 }}>{cur.q.answer}</b>
        </p>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div className="gradepair">
          <div>
            <p className="muted center">きみが かいた字</p>
            <WrittenBox strokes={cur.a?.strokes} />
          </div>
          <div>
            <p className="muted center">おてほん</p>
            <ModelBox char={cur.q.writeChar ?? cur.q.answer[0]} grade={cur.q.writeGrade ?? 1} />
          </div>
        </div>
      </div>

      <div className="card">
        <p className="center" style={{ fontWeight: 700, marginBottom: 10 }}>
          おなじに かけていた？
        </p>
        <div className="gradebuttons">
          <button className="grade-ok" onClick={() => mark(true)}>
            <span className="label">⭕️ かけていた</span>
            <span className="hint">この問題は 正解</span>
          </button>
          <button className="grade-ng" onClick={() => mark(false)}>
            <span className="label">✗ ちがった</span>
            <span className="hint">かけなかった／ちがう字だった</span>
          </button>
        </div>
      </div>
      <p className="muted center">しょうじきに つけると、じつりょくが 正しく わかるよ</p>
    </div>
  );
}

/** 自分が書いた線を出す */
function WrittenBox({ strokes }: { strokes?: Point[][] }) {
  return (
    <div className="tracebox small">
      <svg viewBox={`0 0 ${KVG_SIZE} ${KVG_SIZE}`} aria-label="かいた字">
        <KanjiGrid />
        {(strokes ?? []).map((st, i) => (
          <polyline
            key={i}
            className="written"
            points={st.map((p) => `${p.x},${p.y}`).join(' ')}
          />
        ))}
      </svg>
      {(!strokes || strokes.length === 0) && (
        <p className="muted center emptynote">かいていません</p>
      )}
    </div>
  );
}

/** お手本の字を出す */
function ModelBox({ char, grade }: { char: string; grade: number }) {
  const [paths, setPaths] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setPaths(null);
    setError(null);
    getStrokes(char, grade)
      .then((p) => { if (alive) setPaths(p); })
      .catch((e) => {
        if (alive) setError(e instanceof StrokeLoadError ? e.kidMessage : 'よみこめませんでした。');
      });
    return () => { alive = false; };
  }, [char, grade]);

  return (
    <div className="tracebox small">
      <svg viewBox={`0 0 ${KVG_SIZE} ${KVG_SIZE}`} aria-label={`おてほん ${char}`}>
        <KanjiGrid />
        {paths?.map((d, i) => <path key={i} d={d} className="model-stroke" />)}
      </svg>
      {error && <p className="muted center emptynote">{error}</p>}
      {!paths && !error && <p className="muted center emptynote">よみこみ中…</p>}
    </div>
  );
}
