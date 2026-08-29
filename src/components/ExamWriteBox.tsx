// 模擬試験で、手書きの答えを書くマス。
//
// 書いた線をおぼえておいて、あとの「まるつけ」でお手本と くらべます。
// ペン・指の扱いは useInk（なぞり書き・書き取りと同じ部品）を使っています。

import { useEffect } from 'react';
import type { Point } from '../lib/svgpath';
import { KVG_SIZE } from '../lib/tracing';
import { useInk } from './useInk';
import { KanjiGrid } from './KanjiGrid';

interface Props {
  /** 前に書いた線（もどってきたときに出す） */
  initial?: Point[][];
  /** 書くたびに呼ばれる。座標は 109×109 のマス目に直したもの */
  onChange: (strokes: Point[][]) => void;
}

export function ExamWriteBox({ initial, onChange }: Props) {
  const ink = useInk({
    color: '#33302b',
    clearOnStart: false,
    replay: initial,
    onStrokeEnd: () => { /* 1画ごとの判定はしません */ },
    onStrokesChange: onChange,
  });
  const { strokeCount, clearInk, undoStroke } = ink;

  useEffect(() => { /* 問題が変わるときは key で作り直されます */ }, []);

  return (
    <>
      <div
        ref={ink.boxRef}
        className={`tracebox${ink.drawing ? ' drawing' : ''}`}
        {...ink.handlers}
        style={{ touchAction: 'none' }}
      >
        <svg className="guide" viewBox={`0 0 ${KVG_SIZE} ${KVG_SIZE}`} aria-hidden="true">
          <KanjiGrid />
        </svg>
        <canvas ref={ink.canvasRef} className="ink" />
      </div>
      {strokeCount > 0 && (
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={undoStroke}>↩︎ 1かく もどす</button>
          <button onClick={clearInk}>ぜんぶ けす</button>
        </div>
      )}
    </>
  );
}
