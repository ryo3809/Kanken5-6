/**
 * なぞり書きの筆順判定が正しく働くかを確かめるテスト。
 *   npm run test:tracing
 *
 * 「人が実際になぞった線」のかわりに、お手本の線に
 *   ・小さなずれ（手ぶれ）
 *   ・逆向き
 *   ・別の画
 *   ・大きくずれた線
 * を加えたものを入れて、正しく判定できるかを見ます。
 */
import { readFileSync } from 'node:fs';
import { prepareStrokes, judgeStroke, THRESHOLD } from '../../src/lib/tracing.ts';
import { resample, type Point } from '../../src/lib/svgpath.ts';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? ' … ' + extra : ''}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}${extra ? ' … ' + extra : ''}`); }
};

const strokes: Record<string, string[]> = {};
for (const g of [1, 2, 3, 4, 5, 6]) {
  Object.assign(strokes, JSON.parse(readFileSync(`public/strokes/grade-${g}.json`, 'utf8')).strokes);
}

/** 手ぶれを加える（決まった順番の乱数を使うので、毎回同じ結果になる） */
function makeRng(seed: number) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
function jitter(pts: Point[], amount: number, rng: () => number): Point[] {
  return pts.map((p) => ({ x: p.x + (rng() - 0.5) * 2 * amount, y: p.y + (rng() - 0.5) * 2 * amount }));
}
/** 人が書くときは点の間隔がまばらなので、点数を減らして再現する */
function thin(pts: Point[], n: number): Point[] { return resample(pts, n); }

console.log('\n▶ テスト1　ていねいになぞったら「せいかい」になるか（全1026字・9662画）');
{
  const rng = makeRng(42);
  let total = 0, ok = 0;
  const misses: string[] = [];
  for (const [ch, paths] of Object.entries(strokes)) {
    const refs = prepareStrokes(paths);
    for (let i = 0; i < refs.length; i++) {
      total++;
      // 手ぶれ2.5、点は18個（実際の指の動きに近い粗さ）
      const user = jitter(thin(refs[i].points, 18), 2.5, rng);
      const v = judgeStroke(user, refs, i);
      if (v.ok) ok++;
      else if (misses.length < 8) misses.push(`${ch}第${i + 1}画(${v.reason})`);
    }
  }
  const rate = (ok / total) * 100;
  check('ていねいになぞった線の99%以上が「せいかい」になる', rate >= 99,
    `${ok}/${total}画（${rate.toFixed(2)}%）${misses.length ? ' 例:' + misses.join(' ') : ''}`);
}

console.log('\n▶ テスト2　少し雑になぞっても「せいかい」になるか（手ぶれ大きめ）');
{
  const rng = makeRng(7);
  let total = 0, ok = 0;
  for (const [, paths] of Object.entries(strokes)) {
    const refs = prepareStrokes(paths);
    for (let i = 0; i < refs.length; i++) {
      total++;
      const user = jitter(thin(refs[i].points, 12), 6, rng);
      if (judgeStroke(user, refs, i).ok) ok++;
    }
  }
  const rate = (ok / total) * 100;
  check('手ぶれ6でも90%以上は「せいかい」', rate >= 90, `${ok}/${total}画（${rate.toFixed(1)}%）`);
}

console.log('\n▶ テスト3　逆向きに書いたら見つけられるか');
{
  const rng = makeRng(11);
  let total = 0, caught = 0, wrongReason: string[] = [];
  for (const [ch, paths] of Object.entries(strokes)) {
    const refs = prepareStrokes(paths);
    for (let i = 0; i < refs.length; i++) {
      // 短すぎる画は向きの区別がつかないので対象外
      if (refs[i].length < 20) continue;
      total++;
      const user = jitter(thin([...refs[i].points].reverse(), 18), 2, rng);
      const v = judgeStroke(user, refs, i);
      if (!v.ok) {
        caught++;
        if (v.reason !== 'reversed' && v.reason !== 'start' && wrongReason.length < 5)
          wrongReason.push(`${ch}第${i + 1}画=${v.reason}`);
      }
    }
  }
  check('逆向きは100%見つけられる', caught === total, `${caught}/${total}画`);
  check('理由が「向き」か「かきはじめ」になる', wrongReason.length === 0, wrongReason.join(' '));
}

console.log('\n▶ テスト4　ちがう画をなぞったら「順番がちがう」と言えるか');
{
  const rng = makeRng(23);
  let total = 0, caught = 0, saidOrder = 0;
  for (const [, paths] of Object.entries(strokes)) {
    if (paths.length < 3) continue;
    const refs = prepareStrokes(paths);
    // 1画目を書くべきときに、3画目をなぞってみる
    total++;
    const user = jitter(thin(refs[2].points, 18), 2, rng);
    const v = judgeStroke(user, refs, 0);
    if (!v.ok) caught++;
    if (!v.ok && v.reason === 'order' && v.matchedStroke === 3) saidOrder++;
  }
  check('別の画をなぞったら必ず気づく', caught === total, `${caught}/${total}字`);
  check('そのうち大半で「何画目か」まで教えられる', saidOrder / total >= 0.7,
    `${saidOrder}/${total}字（${((saidOrder / total) * 100).toFixed(0)}%）`);
}

console.log('\n▶ テスト5　書きはじめの場所がちがうときに気づけるか');
{
  const rng = makeRng(31);
  let total = 0, caught = 0;
  for (const [, paths] of Object.entries(strokes)) {
    const refs = prepareStrokes(paths);
    for (let i = 0; i < refs.length; i++) {
      total++;
      // 線の形は同じだが、まるごと右下に35ずらす
      const moved = refs[i].points.map((p) => ({ x: p.x + 35, y: p.y + 35 }));
      const user = jitter(thin(moved, 18), 2, rng);
      if (!judgeStroke(user, refs, i).ok) caught++;
    }
  }
  check('大きくずれた線は99%以上で気づく', caught / total >= 0.99, `${caught}/${total}画`);
}

console.log('\n▶ テスト6　でたらめな線を「せいかい」にしないか');
{
  const rng = makeRng(99);
  let total = 0, rejected = 0;
  for (const [, paths] of Object.entries(strokes)) {
    const refs = prepareStrokes(paths);
    for (let i = 0; i < refs.length; i++) {
      total++;
      // マスの中を適当に横切る線
      const a = { x: rng() * 109, y: rng() * 109 };
      const b = { x: rng() * 109, y: rng() * 109 };
      const user = resample([a, b], 18);
      if (!judgeStroke(user, refs, i).ok) rejected++;
    }
  }
  check('でたらめな線の97%以上をはじく', rejected / total >= 0.97,
    `${rejected}/${total}画（${((rejected / total) * 100).toFixed(1)}%）`);
}

console.log('\n▶ テスト7　点をうっただけのときの案内');
{
  const refs = prepareStrokes(strokes['税']);
  const v = judgeStroke([{ x: 39, y: 14 }, { x: 39.5, y: 14.5 }], refs, 0);
  check('「せんが みじかすぎるよ」と教える', !v.ok && v.reason === 'tooShort',
    !v.ok ? v.message : '');
  const v2 = judgeStroke([{ x: 39, y: 14 }], refs, 0);
  check('点が1つでも落ちない', !v2.ok && v2.reason === 'tooShort');
}

console.log('\n▶ テスト8　メッセージが子どもに分かる日本語か');
{
  const refs = prepareStrokes(strokes['税']);
  const cases: [string, Point[]][] = [
    ['ぎゃく向き', [...refs[0].points].reverse()],
    ['ずれ', refs[0].points.map((p) => ({ x: p.x + 40, y: p.y + 40 }))],
    ['みじかい', [{ x: 39, y: 14 }, { x: 40, y: 15 }]],
  ];
  for (const [label, pts] of cases) {
    const v = judgeStroke(pts, refs, 0);
    const msg = v.ok ? '（せいかい）' : v.message;
    const hasKanjiHard = /[A-Za-z]/.test(msg);
    check(`${label}：英語まじりでない`, !hasKanjiHard, msg);
  }
}

console.log(`\n${'='.repeat(52)}`);
console.log(`合格 ${pass}件 / 不合格 ${fail}件`);
console.log(`（ものさし: はじめ${THRESHOLD.start} / かたち${THRESHOLD.shape} / おわり${THRESHOLD.end}）`);
if (fail > 0) process.exitCode = 1;
else console.log('\x1b[32m\x1b[1mすべて合格しました。\x1b[0m');
