// KanjiVG の筆画データ（SVGのパス）を「点の並び」に変換する部分。
//
// KanjiVG で使われている命令は M / m（移動）、C / c（曲線）、S / s（なめらかな曲線）だけです。
// ここでは外部のライブラリを使わず、必要な分だけを自分で計算しています。
// （画面が無くても計算できるので、そのままテストできます）

export interface Point {
  x: number;
  y: number;
}

/** 文字列から数値だけを順に取り出す */
function tokenize(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /([MmCcSsLlZzHhVvQqTtAa])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    out.push(m[1] !== undefined ? m[1] : Number(m[2]));
  }
  return out;
}

/** 3次ベジェ曲線の途中の点を求める */
function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + e * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + e * p3.y,
  };
}

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * パスの文字列を、こまかい点の並びにする。
 * 曲線1本を segments 個に分けて近似します。
 */
export function pathToPolyline(d: string, segments = 24): Point[] {
  const t = tokenize(d);
  const pts: Point[] = [];
  let cur: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  // 直前の曲線の2つめの制御点（S / s でつかう）
  let lastCtrl: Point | null = null;
  let i = 0;
  let cmd = '';

  const num = () => {
    const v = t[i++];
    if (typeof v !== 'number') throw new Error(`筆順データの形がおかしいです（位置 ${i}）`);
    return v;
  };

  while (i < t.length) {
    if (typeof t[i] === 'string') {
      cmd = t[i] as string;
      i++;
    }
    // 命令のあとに数値が続くときは、同じ命令をくり返す（SVGの決まり）
    switch (cmd) {
      case 'M':
      case 'm': {
        const x = num();
        const y = num();
        cur = cmd === 'M' ? { x, y } : { x: cur.x + x, y: cur.y + y };
        start = cur;
        pts.push(cur);
        lastCtrl = null;
        // 続きの数値は直線あつかい（SVGの決まり）
        cmd = cmd === 'M' ? 'L' : 'l';
        break;
      }
      case 'L':
      case 'l': {
        const x = num();
        const y = num();
        cur = cmd === 'L' ? { x, y } : { x: cur.x + x, y: cur.y + y };
        pts.push(cur);
        lastCtrl = null;
        break;
      }
      case 'C':
      case 'c': {
        const rel = cmd === 'c';
        const c1 = { x: num(), y: num() };
        const c2 = { x: num(), y: num() };
        const p3 = { x: num(), y: num() };
        const P1 = rel ? { x: cur.x + c1.x, y: cur.y + c1.y } : c1;
        const P2 = rel ? { x: cur.x + c2.x, y: cur.y + c2.y } : c2;
        const P3 = rel ? { x: cur.x + p3.x, y: cur.y + p3.y } : p3;
        for (let s = 1; s <= segments; s++) pts.push(cubicAt(cur, P1, P2, P3, s / segments));
        lastCtrl = P2;
        cur = P3;
        break;
      }
      case 'S':
      case 's': {
        const rel = cmd === 's';
        const c2 = { x: num(), y: num() };
        const p3 = { x: num(), y: num() };
        const P2 = rel ? { x: cur.x + c2.x, y: cur.y + c2.y } : c2;
        const P3 = rel ? { x: cur.x + p3.x, y: cur.y + p3.y } : p3;
        // 1つめの制御点は、直前の制御点を折り返した位置になる
        const P1 = lastCtrl ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : cur;
        for (let s = 1; s <= segments; s++) pts.push(cubicAt(cur, P1, P2, P3, s / segments));
        lastCtrl = P2;
        cur = P3;
        break;
      }
      case 'Z':
      case 'z': {
        pts.push(start);
        cur = start;
        lastCtrl = null;
        break;
      }
      default:
        throw new Error(`筆順データに、対応していない命令「${cmd}」があります`);
    }
  }
  return pts;
}

/** 点の並びの全長 */
export function polylineLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

/**
 * 点の並びを、長さが等しい n 個の点に取り直す。
 * こうしておくと、2つの線の形をそのまま比べられます。
 */
export function resample(pts: Point[], n = 32): Point[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => pts[0]);

  const total = polylineLength(pts);
  if (total === 0) return Array.from({ length: n }, () => pts[0]);

  const step = total / (n - 1);
  const out: Point[] = [pts[0]];
  let seg = 1;
  let segStart = pts[0];
  let remain = dist(pts[0], pts[1]);

  for (let k = 1; k < n - 1; k++) {
    let need = step;
    for (;;) {
      if (remain >= need || seg >= pts.length - 1) {
        const to = pts[Math.min(seg, pts.length - 1)];
        const segLen = dist(segStart, to);
        const r = segLen === 0 ? 0 : need / segLen;
        const p = { x: segStart.x + (to.x - segStart.x) * r, y: segStart.y + (to.y - segStart.y) * r };
        out.push(p);
        segStart = p;
        remain -= need;
        break;
      }
      need -= remain;
      segStart = pts[seg];
      seg++;
      remain = dist(segStart, pts[Math.min(seg, pts.length - 1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
