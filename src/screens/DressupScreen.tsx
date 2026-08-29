// きせかえ。おさんぽマップで もらったものを つけかえます。

import { ITEMS } from '../character/items';
import { Shibamaru } from '../character/Shibamaru';
import { unlockedItems } from '../lib/gamification';
import type { GameState } from '../lib/types';

interface Props {
  game: GameState;
  onChange: (g: GameState) => void;
  onBack: () => void;
}

export function DressupScreen({ game, onChange, onBack }: Props) {
  const owned = new Set(unlockedItems(game.exp));
  const hats = ITEMS.filter((i) => i.kind === 'hat');
  const collars = ITEMS.filter((i) => i.kind === 'collar');

  return (
    <div className="app">
      <h1>きせかえ</h1>

      <div className="card center">
        <Shibamaru expression="proud" hat={game.hat} collar={game.collar} size={180} />
      </div>

      <div className="card">
        <h2>ぼうし</h2>
        <div className="itemgrid">
          <button
            className={game.hat === null ? 'picked' : ''}
            onClick={() => onChange({ ...game, hat: null })}
          >
            なし
          </button>
          {hats.map((i) => (
            <button
              key={i.id}
              className={game.hat === i.id ? 'picked' : ''}
              disabled={!owned.has(i.id)}
              onClick={() => onChange({ ...game, hat: i.id })}
            >
              {owned.has(i.id) ? i.name : '🔒 まだ'}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>くびわ</h2>
        <div className="itemgrid">
          <button
            className={game.collar === null ? 'picked' : ''}
            onClick={() => onChange({ ...game, collar: null })}
          >
            なし
          </button>
          {collars.map((i) => (
            <button
              key={i.id}
              className={game.collar === i.id ? 'picked' : ''}
              disabled={!owned.has(i.id)}
              onClick={() => onChange({ ...game, collar: i.id })}
            >
              {owned.has(i.id) ? i.name : '🔒 まだ'}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          🔒 は、おさんぽマップを すすむと もらえます。
        </p>
      </div>

      <button className="primary" onClick={onBack}>
        ホームに もどる
      </button>
    </div>
  );
}
