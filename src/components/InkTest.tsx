// 「ためしがき」。おうちの人の画面で使う、手書きの調子をしらべる部分。
//
// なぜ必要か：
//   iPad の実機でしか起きない不具合があり、
//   「指が届いていないのか」「途中で取り消されているのか」を
//   手元で見分けられませんでした。ここに書いてもらえば、その場で分かります。
//
// 書いた線はどこにも保存されません。しらべるためだけのものです。

import { useCallback, useRef, useState } from 'react';
import { KVG_SIZE } from '../lib/tracing';
import { useInk, PEN_GUARD_MS, type InkEventKind } from './useInk';
import { KanjiGrid } from './KanjiGrid';
import type { Point } from '../lib/svgpath';

const KIND_LABEL: Record<InkEventKind, string> = {
  down: '書きはじめ',
  reject: '手のひら防止で無視',
  up: '書きおわり',
  cancel: 'ブラウザに取り消された',
  lost: '入力の受けとりを失った',
};

const TYPE_LABEL: Record<string, string> = {
  pen: 'ペン（Apple Pencil）',
  touch: '指',
  mouse: 'マウス',
};

export function InkTest() {
  const [log, setLog] = useState<string[]>([]);
  const [strokes, setStrokes] = useState<{ points: number; length: number }[]>([]);
  const seen = useRef<Set<string>>(new Set());

  const handleEvent = useCallback((kind: InkEventKind, pointerType: string) => {
    const label = `${KIND_LABEL[kind]}（${TYPE_LABEL[pointerType] ?? pointerType}）`;
    setLog((prev) => [label, ...prev].slice(0, 8));
    seen.current.add(pointerType);
  }, []);

  const handleStrokeEnd = useCallback((points: Point[]) => {
    let len = 0;
    for (let i = 1; i < points.length; i++) {
      len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    setStrokes((prev) => [{ points: points.length, length: Math.round(len) }, ...prev].slice(0, 5));
  }, []);

  const ink = useInk({
    color: '#33302b',
    clearOnStart: false,
    onStrokeEnd: handleStrokeEnd,
    onEvent: handleEvent,
  });

  const cancelled = log.filter((l) => l.includes('取り消')).length;
  const rejected = log.filter((l) => l.includes('無視')).length;

  return (
    <div>
      <p className="muted">
        下のマスに、<b>お子さんが使うやり方で</b>（指なら指、Apple Pencil ならペンで）
        字を1〜2字 書いてみてください。書いた内容はどこにも残りません。
      </p>

      <div
        ref={ink.boxRef}
        className={`tracebox${ink.drawing ? ' drawing' : ''}`}
        {...ink.handlers}
        style={{ touchAction: 'none', maxWidth: 300, minWidth: 200 }}
      >
        <svg className="guide" viewBox={`0 0 ${KVG_SIZE} ${KVG_SIZE}`} aria-hidden="true">
          <KanjiGrid />
        </svg>
        <canvas ref={ink.canvasRef} className="ink" />
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={() => { ink.clearInk(); setLog([]); setStrokes([]); seen.current = new Set(); }}>
          ためしがきを けす
        </button>
      </div>

      <div className="diag" style={{ marginTop: 10 }}>
        <div>
          <span>書けた画の数</span>
          <b>{ink.strokeCount} 画</b>
        </div>
        <div>
          <span>届いた入力の種類</span>
          <b>
            {seen.current.size === 0
              ? '（まだありません）'
              : [...seen.current].map((t) => TYPE_LABEL[t] ?? t).join('・')}
          </b>
        </div>
        <div>
          <span>1画ごとの点の数</span>
          <b>
            {strokes.length === 0
              ? '（まだありません）'
              : strokes.map((s) => `${s.points}点/長さ${s.length}`).join('　')}
          </b>
        </div>
        {cancelled > 0 && (
          <div className="wide">
            <span>気になること</span>
            <b>
              ブラウザに 途中で取り消されています（{cancelled}回）。
              画面のスクロールと まちがえられている可能性があります。
            </b>
          </div>
        )}
        {rejected > 0 && (
          <div className="wide">
            <span>気になること</span>
            <b>
              手のひら防止が はたらいて 指の入力を無視しました（{rejected}回）。
              Apple Pencil が {PEN_GUARD_MS / 1000}秒以内に 画面にふれています。
            </b>
          </div>
        )}
        <div className="wide">
          <span>できごとの記録（新しい順）</span>
          <b>{log.length === 0 ? '（まだありません）' : log.join(' ／ ')}</b>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 8 }}>
        うまく書けないときは、この画面をそのまま見せてください。
      </p>
    </div>
  );
}
