// 模擬試験の受験画面。
//
// 本番と同じ大問のならびで、200点満点（データが確認まちの分野をのぞくと少なくなります）。
// 制限時間は60分。時間が来たら、そこまでの答えで採点します。
//
// 手書きで答える問題は、書いた線をおぼえておいて、あとで「まるつけ」でくらべます。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Exam, ExamQuestion } from '../lib/exam';
import type { Point } from '../lib/svgpath';
import { normalizeAnswer } from '../lib/questions';
import { ExamWriteBox } from '../components/ExamWriteBox';
import { StrokeHighlight } from '../components/StrokeHighlight';

export interface ExamAnswer {
  /** 選ぶ・入力の答え */
  value?: string;
  /** 手書きの線（あとで「まるつけ」に使う） */
  strokes?: Point[][];
}

interface Props {
  exam: Exam;
  onFinish: (answers: Map<string, ExamAnswer>, seconds: number, timedOut: boolean) => void;
  onQuit: () => void;
}

export function ExamScreen({ exam, onFinish, onQuit }: Props) {
  const flat = exam.sections.flatMap((s) => s.questions.map((q) => ({ q, s })));
  const [index, setIndex] = useState(0);
  const [answers] = useState(() => new Map<string, ExamAnswer>());
  const [, forceUpdate] = useState(0);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [left, setLeft] = useState(exam.minutes * 60);
  const startedAt = useRef(Date.now());
  const finished = useRef(false);

  const finish = useCallback(
    (timedOut: boolean) => {
      if (finished.current) return;
      finished.current = true;
      onFinish(answers, Math.round((Date.now() - startedAt.current) / 1000), timedOut);
    },
    [answers, onFinish],
  );

  // のこり時間
  useEffect(() => {
    const t = window.setInterval(() => {
      const used = Math.round((Date.now() - startedAt.current) / 1000);
      const rest = exam.minutes * 60 - used;
      setLeft(rest);
      if (rest <= 0) finish(true);
    }, 1000);
    return () => window.clearInterval(t);
  }, [exam.minutes, finish]);

  const cur = flat[index];
  if (!cur) return null;
  const { q, s } = cur;
  const a = answers.get(q.id) ?? {};
  const answered = flat.filter(({ q: x }) => {
    const v = answers.get(x.id);
    return v && (v.value !== undefined || (v.strokes?.length ?? 0) > 0);
  }).length;

  const setAnswer = (v: ExamAnswer) => {
    answers.set(q.id, { ...answers.get(q.id), ...v });
    forceUpdate((n) => n + 1);
  };
  const go = (d: number) => setIndex((i) => Math.max(0, Math.min(flat.length - 1, i + d)));

  const mm = Math.max(0, Math.floor(left / 60));
  const ss = Math.max(0, left % 60);

  return (
    <div className="app examroot">
      <div className="examtop">
        <span className="muted">
          {s.no} {s.title}
        </span>
        <span className={`timer${left <= 300 ? ' soon' : ''}`}>
          のこり {mm}:{String(ss).padStart(2, '0')}
        </span>
      </div>
      <div className="progressbar" style={{ marginBottom: 10 }}>
        <div style={{ width: `${((index + 1) / flat.length) * 100}%` }} />
      </div>
      <p className="muted center" style={{ marginTop: -4 }}>
        {index + 1} / {flat.length}もん　（こたえた {answered}もん）
      </p>

      <div className="card">
        <p className="muted" style={{ marginBottom: 8 }}>{s.instruction}</p>
        {q.highlightStroke && q.writeChar ? (
          <StrokeHighlight
            char={q.writeChar}
            grade={q.writeGrade ?? 1}
            highlight={q.highlightStroke}
          />
        ) : (
          <p className="examprompt" lang="ja">{q.prompt}</p>
        )}
        {q.hint && <p className="muted center">{q.hint}</p>}
      </div>

      {q.kind === 'choice' && (
        <div className="choices">
          {q.choices!.map((ch) => (
            <button
              key={ch}
              className={a.value === ch ? 'picked' : ''}
              onClick={() => setAnswer({ value: ch })}
            >
              {ch}
            </button>
          ))}
        </div>
      )}

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
            value={a.value ?? ''}
            onChange={(e) => setAnswer({ value: e.target.value })}
          />
        </div>
      )}

      {q.kind === 'write' && (
        <div className="card" style={{ padding: 14 }}>
          <ExamWriteBox
            key={q.id}
            initial={a.strokes}
            onChange={(strokes) => setAnswer({ strokes })}
          />
        </div>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <button onClick={() => go(-1)} disabled={index === 0}>
          ← まえ
        </button>
        {index < flat.length - 1 ? (
          <button className="primary" style={{ flex: 2 }} onClick={() => go(1)}>
            つぎ →
          </button>
        ) : (
          <button className="primary" style={{ flex: 2 }} onClick={() => finish(false)}>
            ぜんぶ おわり
          </button>
        )}
      </div>

      {confirmQuit ? (
        <div className="card">
          <p>
            もぎしけんを とちゅうで やめる？
            <br />
            <span className="muted">ここまでの こたえで さいてんします。</span>
          </p>
          <div className="row">
            <button onClick={() => setConfirmQuit(false)}>つづける</button>
            <button className="danger" onClick={() => (answered > 0 ? finish(false) : onQuit())}>
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

/** 選ぶ・入力の問題を、自動で採点する */
export function autoScore(q: ExamQuestion, a: ExamAnswer | undefined): boolean {
  if (!a?.value) return false;
  if (q.kind === 'choice') return a.value === q.answer;
  if (q.kind === 'text') {
    const got = normalizeAnswer(a.value);
    return (q.acceptable ?? [q.answer]).some((x) => normalizeAnswer(x) === got);
  }
  return false;
}
