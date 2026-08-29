// 模擬試験の結果画面。
//   ・とれた点と、合格ラインとの差
//   ・大問ごとの点
//   ・これまでの模試の点を 折れ線グラフで表示
//
// 責めたり、あおったりする表現は使いません。

import type { ExamResult, GameState } from '../lib/types';
import { Shibamaru } from '../character/Shibamaru';

interface Props {
  result: ExamResult;
  history: ExamResult[];
  game: GameState;
  saveError: string | null;
  onHome: () => void;
  onAgain: () => void;
}

/** 合格ラインは満点の70%（本番は200点満点で140点前後） */
export const passLine = (total: number): number => Math.round(total * 0.7);

export function ExamResultScreen({ result, history, game, saveError, onHome, onAgain }: Props) {
  const line = passLine(result.total);
  const diff = result.score - line;
  const reached = diff >= 0;
  const min = Math.floor(result.seconds / 60);
  const sec = result.seconds % 60;

  return (
    <div className="app">
      <div className="card center">
        <Shibamaru
          expression={reached ? 'proud' : 'cheer'}
          hat={game.hat}
          collar={game.collar}
          size={110}
        />
        <h1>もぎしけん おつかれさま！</h1>
        <p style={{ fontSize: 44, margin: '6px 0 0', lineHeight: 1.1 }}>
          <b>{result.score}</b>
          <span style={{ fontSize: 22, color: 'var(--ink-soft)' }}> / {result.total}点</span>
        </p>
        <p className={reached ? 'verdict ok' : 'verdict'} style={{ marginTop: 4 }}>
          {reached
            ? `合格ライン（${line}点）を ${diff}点 こえたよ！`
            : `合格ライン（${line}点）まで あと ${-diff}点`}
        </p>
        <p className="muted">
          かかった時間 {min}分{sec}秒
          {result.timedOut && '（時間切れ）'}
        </p>
        {result.total < result.fullTotal && (
          <p className="muted">
            ※ いまは {result.total}点満点です（本番は {result.fullTotal}点満点・
            {Math.round(result.fullTotal * 0.7)}点前後が合格ライン）
          </p>
        )}
      </div>

      {saveError && <div className="notice bad">{saveError}</div>}

      <div className="card">
        <h2>大問ごとの点</h2>
        <div className="secbars">
          {result.sections.map((s) => {
            const pct = s.points === 0 ? 0 : (s.score / s.points) * 100;
            return (
              <div className="secbar" key={s.no}>
                <span className="name">
                  {s.no} {s.title}
                </span>
                <div className="track">
                  <div
                    className={`fill${pct >= 70 ? ' good' : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="num">
                  {s.score}/{s.points}
                </span>
              </div>
            );
          })}
        </div>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          バーが みじかい ところが、これから のばせる ところだよ。
        </p>
      </div>

      {history.length >= 2 && (
        <div className="card">
          <h2>これまでの もぎしけん</h2>
          <ScoreChart history={history} />
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

/** 点のうつりかわりを 折れ線グラフにする */
function ScoreChart({ history }: { history: ExamResult[] }) {
  const data = history.slice(-12);
  const W = 300;
  const H = 150;
  const PAD = { l: 30, r: 8, t: 10, b: 22 };
  const maxY = Math.max(...data.map((d) => d.total), 200);
  const x = (i: number) =>
    PAD.l + (data.length <= 1 ? 0 : (i * (W - PAD.l - PAD.r)) / (data.length - 1));
  const y = (v: number) => PAD.t + (1 - v / maxY) * (H - PAD.t - PAD.b);
  const linePct = 0.7;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="もぎしけんの点のうつりかわり">
        {/* 合格ライン */}
        <line
          x1={PAD.l} y1={y(maxY * linePct)} x2={W - PAD.r} y2={y(maxY * linePct)}
          className="chart-line-pass"
        />
        <text x={PAD.l - 4} y={y(maxY * linePct) + 4} className="chart-label" textAnchor="end">
          {Math.round(maxY * linePct)}
        </text>
        <text x={PAD.l - 4} y={y(maxY) + 4} className="chart-label" textAnchor="end">
          {maxY}
        </text>
        <text x={PAD.l - 4} y={y(0) + 4} className="chart-label" textAnchor="end">0</text>
        {/* 軸 */}
        <line x1={PAD.l} y1={y(0)} x2={W - PAD.r} y2={y(0)} className="chart-axis" />
        {/* 折れ線 */}
        <polyline
          className="chart-path"
          points={data.map((d, i) => `${x(i)},${y(d.score)}`).join(' ')}
        />
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.score)} r="3.5" className="chart-dot" />
        ))}
        {/* 日付（さいしょとさいご） */}
        {data.length > 0 && (
          <>
            <text x={PAD.l} y={H - 6} className="chart-label">{data[0].date.slice(5)}</text>
            <text x={W - PAD.r} y={H - 6} className="chart-label" textAnchor="end">
              {data[data.length - 1].date.slice(5)}
            </text>
          </>
        )}
      </svg>
      <p className="muted center" style={{ marginBottom: 0 }}>
        よこの線が 合格ライン（満点の70%）だよ
      </p>
    </div>
  );
}
