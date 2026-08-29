// なぞり書きのキャンバス。
//
// iPad で使うための工夫:
//   ・Apple Pencil と指の両方で書ける
//   ・Apple Pencil を使っているあいだは、手のひらが触れても無視する（手のひら誤検知の防止）
//   ・1マスを大きく取る（画面の短いほうに合わせた正方形、最低280px）
//   ・書いている最中に画面が拡大されない（touch-action: none）

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point } from '../lib/svgpath';
import { KVG_SIZE, toKvgCoords, type RefStroke } from '../lib/tracing';

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
}

/** Apple Pencil が触れてから、この時間は指の入力を無視する */
const PEN_GUARD_MS = 1500;

export function TracingCanvas({ refs, current, onStroke, lastWrong, disabled }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  // 書いている途中の点（画面の座標のまま持つ）
  const ptsRef = useRef<Point[]>([]);
  const activePointerRef = useRef<number | null>(null);
  // 1画のあいだ、マスの位置と大きさを覚えておく。
  // 指を動かすたびに測り直すと重くなるうえ、途中で画面が動くと座標がずれるため。
  const rectRef = useRef<DOMRect | null>(null);
  // Apple Pencil を最後に使った時刻。手のひら誤検知を防ぐのに使う
  const lastPenAtRef = useRef(0);

  /** キャンバスの大きさを、表示の大きさと画面の細かさに合わせる */
  const fitCanvas = useCallback(() => {
    const cv = canvasRef.current;
    const box = boxRef.current;
    if (!cv || !box) return;
    const r = box.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, []);

  useEffect(() => {
    fitCanvas();
    const ro = new ResizeObserver(fitCanvas);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [fitCanvas]);

  /** 書いた線を消す */
  const clearInk = useCallback(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.restore();
  }, []);

  // 次の画に進んだら、書いた線を消す
  useEffect(() => {
    clearInk();
    ptsRef.current = [];
  }, [current, clearInk]);

  function localPoint(e: React.PointerEvent): Point {
    const r = rectRef.current ?? boxRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /**
   * この入力を受けつけてよいか。
   * Apple Pencil を使っている最中の指・手のひらは無視する。
   */
  function accepts(e: React.PointerEvent): boolean {
    if (e.pointerType === 'pen') {
      lastPenAtRef.current = Date.now();
      return true;
    }
    if (e.pointerType === 'touch') {
      return Date.now() - lastPenAtRef.current > PEN_GUARD_MS;
    }
    return true; // マウス（パソコンで確かめるとき）
  }

  function drawTo(p: Point) {
    const ctx = canvasRef.current?.getContext('2d');
    const pts = ptsRef.current;
    const r = rectRef.current;
    if (!ctx || !r || pts.length < 2) return;
    const a = pts[pts.length - 2];
    ctx.strokeStyle = lastWrong ? '#d2694a' : '#33302b';
    ctx.lineWidth = Math.max(6, (Math.min(r.width, r.height) / KVG_SIZE) * 5);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function onDown(e: React.PointerEvent) {
    if (disabled || activePointerRef.current !== null) return;
    if (!accepts(e)) return;
    e.preventDefault();
    // この画を書きおわるまで使う、マスの位置と大きさ
    rectRef.current = boxRef.current?.getBoundingClientRect() ?? null;
    if (!rectRef.current) return;
    activePointerRef.current = e.pointerId;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // うまくいかなくても書けるので、そのまま進む
    }
    clearInk();
    ptsRef.current = [localPoint(e)];
    setDrawing(true);
  }

  function onMove(e: React.PointerEvent) {
    if (activePointerRef.current !== e.pointerId) return;
    if (e.pointerType === 'pen') lastPenAtRef.current = Date.now();
    e.preventDefault();
    const p = localPoint(e);
    const pts = ptsRef.current;
    const last = pts[pts.length - 1];
    // ほとんど動いていない点は捨てる（点が増えすぎると重くなる）
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1.2) return;
    pts.push(p);
    drawTo(p);
  }

  function finish(e: React.PointerEvent) {
    if (activePointerRef.current !== e.pointerId) return;
    activePointerRef.current = null;
    setDrawing(false);
    const r = rectRef.current;
    const pts = ptsRef.current;
    rectRef.current = null;
    if (!r || pts.length === 0) return;
    onStroke(toKvgCoords(pts, { width: r.width, height: r.height }));
  }

  const cur = refs[current];

  return (
    <div
      ref={boxRef}
      className={`tracebox${drawing ? ' drawing' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onPointerLeave={finish}
      // 書いている最中に画面がスクロールしたり拡大したりしないようにする
      style={{ touchAction: 'none' }}
    >
      <svg className="guide" viewBox={`0 0 ${KVG_SIZE} ${KVG_SIZE}`} aria-hidden="true">
        {/* マス目（田の字）。書く場所の目やすになる */}
        <rect x="1" y="1" width={KVG_SIZE - 2} height={KVG_SIZE - 2} className="grid-outer" />
        <line x1={KVG_SIZE / 2} y1="1" x2={KVG_SIZE / 2} y2={KVG_SIZE - 1} className="grid-inner" />
        <line x1="1" y1={KVG_SIZE / 2} x2={KVG_SIZE - 1} y2={KVG_SIZE / 2} className="grid-inner" />

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
      <canvas ref={canvasRef} className="ink" />
    </div>
  );
}
