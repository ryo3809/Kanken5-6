// おさんぽマップ。学習した量に応じて、しばまるが先へ進みます。
// 進んだぶんは減りません（休んでも戻りません）。

import { MAP_SPOTS, mapProgress, stampInfo } from '../lib/gamification';
import { ITEM_BY_ID } from '../character/items';
import { Shibamaru } from '../character/Shibamaru';
import { Scene } from '../character/Scene';
import type { GameState } from '../lib/types';

interface Props {
  game: GameState;
  sessionDates: string[];
  onBack: () => void;
}

export function MapScreen({ game, sessionDates, onBack }: Props) {
  const prog = mapProgress(game.exp);
  const stamps = stampInfo(sessionDates);

  return (
    <div className="app">
      <h1>おさんぽマップ</h1>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Scene spot={prog.spot} height={200}>
          <div className="scene-shiba">
            <Shibamaru expression="happy" hat={game.hat} collar={game.collar} size={92} />
          </div>
        </Scene>
        <div style={{ padding: 16 }}>
          <h2 style={{ marginBottom: 4 }}>{prog.spot.name}</h2>
          <p className="muted">{prog.spot.line}</p>
          {prog.next ? (
            <>
              <div className="progressbar" style={{ marginBottom: 6 }}>
                <div style={{ width: `${prog.ratio * 100}%` }} />
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                つぎは「{prog.next.name}」まで あと {Math.max(0, prog.next.exp - game.exp)}ポイント
              </p>
            </>
          ) : (
            <p className="muted" style={{ marginBottom: 0 }}>
              さいごまで たどりついたね！ ほんとうに すごい！
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>これまでの みちのり</h2>
        <div className="maplist">
          {MAP_SPOTS.map((s, i) => {
            const reached = game.exp >= s.exp;
            const item = s.reward ? ITEM_BY_ID.get(s.reward) : null;
            return (
              <div key={i} className={`mapitem${reached ? ' reached' : ''}${i === prog.index ? ' now' : ''}`}>
                <span className="dot" aria-hidden />
                <span className="body">
                  <b>{reached ? s.name : '？？？'}</b>
                  <br />
                  <span className="muted">
                    {s.exp}ポイント
                    {item && (reached ? `　・　🎁 ${item.name}` : '　・　🎁 ごほうびが あるよ')}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>がんばった日 スタンプ</h2>
        <div className="stats" style={{ marginBottom: 12 }}>
          <div className="stat">
            <b>{stamps.totalDays}</b>
            <span>がんばった日</span>
          </div>
          <div className="stat">
            <b>{stamps.currentStreak}</b>
            <span>いま つづけて</span>
          </div>
          <div className="stat">
            <b>{stamps.bestStreak}</b>
            <span>さいこう きろく</span>
          </div>
        </div>
        <StampCalendar dates={sessionDates} />
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          スタンプは 消えません。おやすみした日が あっても だいじょうぶ。
        </p>
      </div>

      <button className="primary" onClick={onBack}>
        ホームに もどる
      </button>
    </div>
  );
}

/** 直近28日のスタンプ */
function StampCalendar({ dates }: { dates: string[] }) {
  const set = new Set(dates);
  const days: { key: string; label: number; done: boolean }[] = [];
  const d = new Date();
  d.setDate(d.getDate() - 27);
  for (let i = 0; i < 28; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ key, label: d.getDate(), done: set.has(key) });
    d.setDate(d.getDate() + 1);
  }
  return (
    <div className="stampgrid">
      {days.map((x) => (
        <div key={x.key} className={`stamp${x.done ? ' done' : ''}`} title={x.key}>
          {x.done ? '🐾' : x.label}
        </div>
      ))}
    </div>
  );
}
