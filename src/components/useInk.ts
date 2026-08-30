// ペン・指で線を書く部分を、なぞり書きと書き取りで共通に使うための仕組み。
//
// 同じ処理を2か所に書くと、片方だけ直して食い違う危険があります。
// とくに「手のひら誤検知の防止」は大事な部分なので、ここ1か所にまとめています。
//
// iPad で使うための工夫:
//   ・Apple Pencil と指の両方で書ける
//   ・Apple Pencil を使っているあいだは、手のひらが触れても無視する
//   ・書いている最中に画面が拡大・スクロールしない（touch-action: none）

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point } from '../lib/svgpath';

/** Apple Pencil が触れてから、この時間は指の入力を無視する */
export const PEN_GUARD_MS = 1500;

interface Options {
  /** 1画（1本の線）を書きおわったときに呼ばれる。座標はマスの中の位置（px） */
  onStrokeEnd: (points: Point[], rect: { width: number; height: number }) => void;
  /** 新しい線を書きはじめるとき、それまでの線を消すか（なぞり書きは true） */
  clearOnStart: boolean;
  /** 線の色 */
  color: string;
  /** 書けない状態にする */
  disabled?: boolean;
  /**
   * 最初に出しておく線（模擬試験で前の問題にもどったとき、書いた字を出すため）。
   * 座標は 109×109 のマス目。
   */
  replay?: Point[][];
  /** 線が増えたり減ったりしたときに呼ばれる（座標は 109×109 のマス目） */
  onStrokesChange?: (strokes: Point[][]) => void;
  /**
   * 入力のできごとを知らせる（ふだんは使いません）。
   * おうちの人の画面の「ためしがき」で、
   * 指やペンがどう届いているかを調べるために使います。
   */
  onEvent?: (kind: InkEventKind, pointerType: string) => void;
}

/** 入力のできごとの種類（調べるとき用） */
export type InkEventKind =
  | 'down'      // 書きはじめた
  | 'reject'    // 手のひら防止で無視した
  | 'up'        // ふつうに書きおわった
  | 'cancel'    // ブラウザに取り消された（画面のスクロールと判断されたときなど）
  | 'lost';     // 途中で入力の受けとりを失った

export function useInk({
  onStrokeEnd, clearOnStart, color, disabled, replay, onStrokesChange, onEvent,
}: Options) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  /** 何本の線を書いたか（「けす」ボタンを出すかの判断に使う） */
  const [strokeCount, setStrokeCount] = useState(0);

  const ptsRef = useRef<Point[]>([]);
  // 書いた線を1本ずつ覚えておく。「1かく もどす」で使います。
  const strokesRef = useRef<Point[][]>([]);
  const activePointerRef = useRef<number | null>(null);
  const lastPenAtRef = useRef(0);
  // 1画のあいだ、マスの位置と大きさを覚えておく。
  // 指を動かすたびに測り直すと重くなるうえ、途中で画面が動くと座標がずれるため。
  const rectRef = useRef<DOMRect | null>(null);
  // 既定の動きを止めるかどうかを、いつでも読めるようにしておく
  const disabledRef = useRef(false);
  disabledRef.current = !!disabled;

  /** キャンバスの大きさを、表示の大きさと画面の細かさに合わせる */
  const fitCanvas = useCallback(() => {
    const cv = canvasRef.current;
    const box = boxRef.current;
    if (!cv || !box) return;
    const r = box.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    // 大きさが変わらないなら、書いた線を消さないためにそのままにする
    if (cv.width === w && cv.height === h) return;
    cv.width = w;
    cv.height = h;
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

  /*
    iPad で、指で書いている最中に線が途切れないようにする。

    touch-action: none だけでは足りません。
    書いている最中に手のひらや2本目の指が画面にふれると、
    iOS が「拡大や画面送りの操作だ」と判断して、
    書いている途中の入力を取り消してしまうことがあります
    （これが「指でなぞるとすぐ途切れる」の原因になります）。

    そこで、マスの上での既定の動き（スクロール・拡大・文字選択）を
    ここで止めています。React 経由では止められないため、
    ブラウザに直接お願いしています（passive: false）。

    書けない状態（こたえを見たあとなど）のときは止めません。
    画面がスクロールできなくなってしまうからです。
  */
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const stop = (e: Event) => {
      if (!disabledRef.current && e.cancelable) e.preventDefault();
    };
    const names = [
      'touchstart', 'touchmove', 'touchend', 'touchcancel',
      // Safari だけにある、拡大の操作
      'gesturestart', 'gesturechange', 'gestureend',
    ];
    const opts: AddEventListenerOptions = { passive: false };
    for (const n of names) box.addEventListener(n, stop, opts);
    return () => { for (const n of names) box.removeEventListener(n, stop, opts); };
  }, []);


  /** キャンバスを白紙にする（覚えている線は消さない） */
  const wipeCanvas = useCallback(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.restore();
  }, []);

  const redrawRef = useRef<(() => void) | null>(null);

  /** 覚えている線を、ぜんぶ描き直す */
  const redraw = useCallback(() => {
    wipeCanvas();
    const ctx = canvasRef.current?.getContext('2d');
    const r = boxRef.current?.getBoundingClientRect();
    if (!ctx || !r) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(6, Math.min(r.width, r.height) / 22);
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }, [color, wipeCanvas]);
  redrawRef.current = redraw;

  /** 書いた線をぜんぶ消す */
  const clearInk = useCallback(() => {
    wipeCanvas();
    ptsRef.current = [];
    strokesRef.current = [];
    setStrokeCount(0);
    onStrokesChange?.([]);
  }, [wipeCanvas, onStrokesChange]);

  /** 画面の座標 → 109×109 のマス目 */
  const toKvg = useCallback((strokes: Point[][]): Point[][] => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return [];
    const size = Math.min(r.width, r.height);
    const offX = (r.width - size) / 2;
    const offY = (r.height - size) / 2;
    const k = 109 / size;
    return strokes.map((st) => st.map((p) => ({ x: (p.x - offX) * k, y: (p.y - offY) * k })));
  }, []);

  /** 109×109 のマス目 → 画面の座標 */
  const fromKvg = useCallback((strokes: Point[][]): Point[][] => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return [];
    const size = Math.min(r.width, r.height);
    const offX = (r.width - size) / 2;
    const offY = (r.height - size) / 2;
    const k = size / 109;
    return strokes.map((st) => st.map((p) => ({ x: offX + p.x * k, y: offY + p.y * k })));
  }, []);

  // 前に書いた線があれば、出しておく（模擬試験で前の問題にもどったとき）
  const replayedRef = useRef(false);
  useEffect(() => {
    if (replayedRef.current || !replay || replay.length === 0) return;
    replayedRef.current = true;
    // マスの大きさが決まってから描く
    const id = window.setTimeout(() => {
      strokesRef.current = fromKvg(replay);
      setStrokeCount(strokesRef.current.length);
      redrawRef.current?.();
    }, 0);
    return () => window.clearTimeout(id);
  }, [replay, fromKvg]);

  /** さいごに書いた1画だけ消す */
  const undoStroke = useCallback(() => {
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
    redraw();
    onStrokesChange?.(toKvg(strokesRef.current));
  }, [redraw, onStrokesChange, toKvg]);

  function localPoint(e: React.PointerEvent): Point {
    const r = rectRef.current ?? boxRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    // マスから少しはみ出しても、線が飛ばないように枠の中におさめる。
    // 大きな字を書くと枠ぎりぎりまで来るので、ここで切らないと形がくずれます。
    const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
    const y = Math.min(Math.max(e.clientY - r.top, 0), r.height);
    return { x, y };
  }

  /**
   * この入力を受けつけてよいか。
   * Apple Pencil を使っている最中の指・手のひらは無視する。
   * ペンを使ってから1.5秒たてば、指でも書けるようにもどる
   *（ペンの電池が切れても使えなくならないように）。
   */
  function accepts(e: React.PointerEvent): boolean {
    if (e.pointerType === 'pen') {
      lastPenAtRef.current = Date.now();
      return true;
    }
    if (e.pointerType === 'touch') {
      const ok = Date.now() - lastPenAtRef.current > PEN_GUARD_MS;
      if (!ok) onEvent?.('reject', e.pointerType);
      return ok;
    }
    return true; // マウス（パソコンで確かめるとき）
  }

  function drawTo(p: Point) {
    const ctx = canvasRef.current?.getContext('2d');
    const pts = ptsRef.current;
    const r = rectRef.current;
    if (!ctx || !r || pts.length < 2) return;
    const a = pts[pts.length - 2];
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(6, Math.min(r.width, r.height) / 22);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      if (disabled || activePointerRef.current !== null) return;
      if (!accepts(e)) return;
      onEvent?.('down', e.pointerType);
      e.preventDefault();
      rectRef.current = boxRef.current?.getBoundingClientRect() ?? null;
      if (!rectRef.current) return;
      activePointerRef.current = e.pointerId;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // うまくいかなくても書けるので、そのまま進む
      }
      if (clearOnStart) clearInk();
      ptsRef.current = [localPoint(e)];
      setDrawing(true);
    },
    onPointerMove(e: React.PointerEvent) {
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
    },
    onPointerUp(e: React.PointerEvent) {
      onEvent?.('up', e.pointerType);
      finish(e);
    },
    // ブラウザに入力を取り消されたときに来る。
    // なぞり書きでは、途中まで書けた線を「まちがい」として採点しません。
    // 本人は最後まで書いたつもりなのに、×をつけられるのは理不尽だからです。
    onPointerCancel(e: React.PointerEvent) {
      onEvent?.('cancel', e.pointerType);
      finish(e, true);
    },
    // 入力の受けとりを失ったときの受け皿。
    // ※ onPointerLeave では終わらせません。
    //   指がマスの外に少し出ただけで1画が切れてしまい、
    //   大きな字が書けなくなるためです（枠の中におさめる処理で対応しています）。
    onLostPointerCapture(e: React.PointerEvent) {
      if (activePointerRef.current !== e.pointerId) return;
      onEvent?.('lost', e.pointerType);
      finish(e);
    },
  };

  function finish(e: React.PointerEvent, cancelled = false) {
    if (activePointerRef.current !== e.pointerId) return;
    activePointerRef.current = null;
    setDrawing(false);
    const r = rectRef.current;
    const pts = ptsRef.current;
    rectRef.current = null;
    if (!r || pts.length === 0) return;
    // なぞり書き（1画ずつ判定するもの）で取り消されたら、
    // その線は無かったことにして、もう一度書いてもらう
    if (cancelled && clearOnStart) {
      ptsRef.current = [];
      wipeCanvas();
      return;
    }
    if (!clearOnStart) {
      // 書き取りのように何画も書くときは、1本ずつ覚えておく（あとで1画もどせるように）
      strokesRef.current = [...strokesRef.current, pts];
      onStrokesChange?.(toKvg(strokesRef.current));
    }
    setStrokeCount((n) => n + 1);
    onStrokeEnd(pts, { width: r.width, height: r.height });
  }

  return { boxRef, canvasRef, handlers, drawing, strokeCount, clearInk, undoStroke, fitCanvas };
}
