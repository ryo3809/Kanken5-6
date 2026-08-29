// セッションが終わったあとの結果画面。
// 責めたり、悲しませたりする表現は使いません。

import type { Question } from '../lib/types';

interface Props {
  results: { q: Question; correct: boolean }[];
  saveError: string | null;
  onHome: () => void;
  onAgain: () => void;
}

export function Result({ results, saveError, onHome, onAgain }: Props) {
  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const missed = results.filter((r) => !r.correct);

  const praise =
    total === 0
      ? 'また いつでも どうぞ'
      : correct === total
        ? 'ぜんもん せいかい！ すごい！'
        : correct >= total * 0.8
          ? 'よく できました！'
          : correct >= total * 0.5
            ? 'いい ちょうしだよ'
            : 'さいごまで やりきったね';

  return (
    <div className="app">
      <div className="card center">
        <h1>おつかれさま！</h1>
        <p style={{ fontSize: 40, margin: '8px 0 0' }}>
          <b>{correct}</b>
          <span style={{ fontSize: 22, color: 'var(--ink-soft)' }}> / {total}もん</span>
        </p>
        <p style={{ fontSize: 19 }}>{praise}</p>
      </div>

      {saveError && (
        <div className="notice bad">
          <b>きろくを ほぞんできませんでした</b>
          <br />
          {saveError}
        </div>
      )}

      {missed.length > 0 && (
        <div className="card">
          <h2>もういちど みておこう</h2>
          <p className="muted">この ことばは、また あした でてきます。</p>
          {missed.map((r) => (
            <p key={r.q.word} style={{ fontSize: 20, marginBottom: 6 }}>
              {r.q.word}　＝　<b>{r.q.answer}</b>
            </p>
          ))}
        </div>
      )}

      <button className="primary" onClick={onHome}>
        ホームに もどる
      </button>
      <button className="ghost wide" style={{ marginTop: 8 }} onClick={onAgain}>
        もう1かい やる
      </button>
    </div>
  );
}
