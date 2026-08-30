// なぞり書きのキャンバス。お手本を表示し、その上をなぞらせる。
// ペン・指の扱いは useInk（共通部品）にまとめてあります。

import { useEffect } from 'react';
import type { Point } from '../lib/svgpath';
import { KVG_SIZE, toKvgCoords, type RefStroke } from '../lib/tracing';
import { useInk } from './useInk';
import { KanjiGrid } from './KanjiGrid';

interface Props {
  /** お手本の全画 */
  refs: RefStroke[];
  /** いま書くべき画（0から数える） */
  current: number;
  /** 書き終わったときに呼ばれる（座標は 109×109 に直したもの） */
  onStroke: (points: Point[]) => void;
  /** 直前の判定が「まちがい」だったか（線の色を変えるのに使う） */
  lastWrong: boolean;
  /** 書けない状態（判定を見せているあいだなど） */
  disabled?: boolean;
  /** ブラウザに入力を取り消されたとき（指が複数ふれた場合など） */
  onInterrupted?: () => void;
}

export function TracingCanvas({
  refs, current, onStroke, lastWrong, disabled, onInterrupted,
}: Props) {
  const ink = useInk({
    color: lastWrong ? '#d2694a' : '#33302b',
    clearOnStart: true, // なぞり書きは1画ずつなので、書きはじめに前の線を消す
    disabled,
    onStrokeEnd: (pts, rect) => onStroke(toKvgCoords(pts, rect)),
    // 取り消されたときは採点しない代わりに、画面から声をかける
    onEvent: (kind) => { if (kind === 'cancel') onInterrupted?.(); },
  });

  // 次の画に進んだら、書いた線を消す
  const { clearInk } = ink;
  useEffect(() => {
    clearInk();
  }, [current, clearInk]);

  const cur = refs[current];

  return (
    <div
      ref={ink.boxRef}
      className={`tracebox${ink.drawing ? ' drawing' : ''}`}
      {...ink.handlers}
      style={{ touchAction: 'none' }}
    >
      <svg className="guide" viewBox={`0 0 ${KVG_SIZE} ${KVG_SIZE}`} aria-hidden="true">
        <KanjiGrid />
        {/* まだ書いていない画（うすく表示） */}
        {refs.map((s, i) =>
          i > current ? <path key={`f${i}`} d={s.d} className="stroke-future" /> : null,
        )}
        {/* 書きおわった画（こく表示） */}
        {refs.map((s, i) =>
          i < current ? <path key={`d${i}`} d={s.d} className="stroke-done" /> : null,
        )}
        {/* いま書く画（お手本として目立たせる） */}
        {cur && <path d={cur.d} className="stroke-current" />}
        {/* 書きはじめの場所 */}
        {cur && <circle cx={cur.start.x} cy={cur.start.y} r="5" className="start-dot" />}
      </svg>
      <canvas ref={ink.canvasRef} className="ink" />
    </div>
  );
}
