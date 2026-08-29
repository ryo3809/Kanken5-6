// セッションが終わったあとの結果画面。
// 責めたり、悲しませたりする表現は使いません。

import type { GameState, Question } from '../lib/types';
import { Shibamaru } from '../character/Shibamaru';
import { ITEM_BY_ID } from '../character/items';

interface Props {
  results: { q: Question; correct: boolean }[];
  saveError: string | null;
  /** もらったもののお知らせ */
  reward: { levelUp: number | null; spot: string | null; items: string[] } | null;
  game: GameState;
  onHome: () => void;
  onAgain: () => void;
  onOpenMap: () => void;
}

export function Result({ results, saveError, reward, game, onHome, onAgain, onOpenMap }: Props) {
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
        <Shibamaru
          expression={total > 0 && correct >= total * 0.6 ? 'happy' : 'cheer'}
          hat={game.hat}
          collar={game.collar}
          size={110}
        />
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

      {reward && (reward.levelUp || reward.spot || reward.items.length > 0) && (
        <div className="card center">
          <Shibamaru expression="proud" size={90} />
          {reward.levelUp && (
            <p style={{ fontSize: 22, fontWeight: 700 }}>レベル {reward.levelUp} に なった！</p>
          )}
          {reward.spot && <p style={{ fontSize: 19 }}>「{reward.spot}」に ついたよ！</p>}
          {reward.items.map((id) => {
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
