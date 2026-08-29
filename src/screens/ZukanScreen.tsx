// かんじずかん。れんしゅうした漢字が ここに集まります。
// 字をタップすると、読み・熟語・画数と、筆順のアニメが見られます。

import { useEffect, useState } from 'react';
import type { KanjiEntry, Kyu, Progress, WordEntry } from '../lib/types';
import { getStrokes, StrokeLoadError } from '../lib/strokeStore';
import { KVG_SIZE } from '../lib/tracing';
import { KanjiGrid } from '../components/KanjiGrid';

interface Props {
  kyu: Kyu;
  kanji: KanjiEntry[];
  words: WordEntry[];
  progress: Map<string, Progress>;
  traced: Set<string>;
  onBack: () => void;
}

export function ZukanScreen({ kyu, kanji, words, progress, traced, onBack }: Props) {
  const [picked, setPicked] = useState<KanjiEntry | null>(null);
  const maxGrade = kyu === 6 ? 5 : 6;
  const target = kanji.filter((k) => k.grade <= maxGrade);

  // 集まった数（一度でも練習した字）
  const collected = target.filter((k) => progress.has(k.c) || traced.has(k.c));
  const mastered = target.filter((k) => (progress.get(k.c)?.box ?? 0) >= 4);

  const grades = [...new Set(target.map((k) => k.grade))].sort((a, b) => b - a);

  return (
    <div className="app">
      <h1>かんじずかん</h1>
      <p className="muted">れんしゅうした かんじが、いろが ついて あつまっていきます。</p>

      <div className="card">
        <div className="stats">
          <div className="stat">
            <b>{collected.length}</b>
            <span>あつめた</span>
          </div>
          <div className="stat">
            <b>{mastered.length}</b>
            <span>しっかり おぼえた</span>
          </div>
          <div className="stat">
            <b>{target.length}</b>
            <span>{kyu}級 ぜんぶ</span>
          </div>
        </div>
      </div>

      {grades.map((g) => {
        const list = target.filter((k) => k.grade === g).sort((a, b) => a.order - b.order);
        const got = list.filter((k) => progress.has(k.c) || traced.has(k.c)).length;
        return (
          <div className="card" key={g}>
            <h2>
              {g}年生の かんじ　
              <span className="muted" style={{ fontSize: 15, fontWeight: 400 }}>
                {got} / {list.length}
              </span>
            </h2>
            <div className="zukangrid">
              {list.map((k) => {
                const p = progress.get(k.c);
                const seen = !!p || traced.has(k.c);
                const box = p?.box ?? 0;
                return (
                  <button
                    key={k.c}
                    className={`zukancell${seen ? ' got' : ''}${box >= 4 ? ' mastered' : ''}`}
                    onClick={() => setPicked(k)}
                    aria-label={`${k.c}（${k.grade}年生）`}
                  >
                    {k.c}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <button className="primary" onClick={onBack}>
        ホームに もどる
      </button>

      {picked && (
        <KanjiDetail
          kanji={picked}
          words={words.filter((w) => w.verified && w.w.includes(picked.c)).slice(0, 6)}
          progress={progress.get(picked.c)}
          onClose={() => setPicked(null)}
        />
      )}
    </div>
  );
}

/** 1字ぶんの詳しい説明。筆順のアニメつき */
function KanjiDetail({
  kanji, words, progress, onClose,
}: {
  kanji: KanjiEntry;
  words: WordEntry[];
  progress?: Progress;
  onClose: () => void;
}) {
  const [paths, setPaths] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playKey, setPlayKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setPaths(null);
    setError(null);
    getStrokes(kanji.c, kanji.grade)
      .then((p) => { if (alive) setPaths(p); })
      .catch((e) => {
        if (alive) {
          setError(e instanceof StrokeLoadError ? e.kidMessage : 'かきじゅんを よみこめませんでした。');
        }
      });
    return () => { alive = false; };
  }, [kanji]);

  return (
    <div className="sheet" role="dialog" aria-label={`${kanji.c} のせつめい`}>
      <div className="sheet-inner">
        <div className="center">
          <div className="strokeanim" key={playKey}>
            <svg viewBox={`0 0 ${KVG_SIZE} ${KVG_SIZE}`} aria-hidden="true">
              <KanjiGrid />
              {paths ? (
                paths.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    className="anim-stroke"
                    style={{ animationDelay: `${i * 0.45}s` }}
                  />
                ))
              ) : null}
            </svg>
            {!paths && !error && <p className="muted">よみこんでいます…</p>}
          </div>
          {error && <div className="notice bad">{error}</div>}
          <p style={{ fontSize: 48, margin: '4px 0' }}>{kanji.c}</p>
          <p className="muted">
            {kanji.grade}年生　{kanji.strokes}かく
            {progress && <>　はこ{progress.box}</>}
          </p>
          {paths && (
            <button className="ghost" onClick={() => setPlayKey((k) => k + 1)}>
              ▶︎ かきじゅんを もういちど
            </button>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          {kanji.on.length > 0 && (
            <p>
              <b>音</b>　{kanji.on.map((r) => r.kana).join('・')}
            </p>
          )}
          {kanji.kun.length > 0 && (
            <p>
              <b>訓</b>　
              {kanji.kun.map((r) => (r.okurigana ? `${r.stem}（${r.okurigana}）` : r.kana)).join('・')}
            </p>
          )}
          {words.length > 0 && (
            <p>
              <b>ことば</b>
              <br />
              {words.map((w) => `${w.w}（${w.r}）`).join('　')}
            </p>
          )}
        </div>

        <button className="primary" onClick={onClose}>
          とじる
        </button>
      </div>
    </div>
  );
}
