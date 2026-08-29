// 筆順の問題で、ある1画だけを太く見せる部品。
// 「太い画は 何画目？」の出題に使います。

import { useEffect, useState } from 'react';
import { getStrokes, StrokeLoadError } from '../lib/strokeStore';
import { KVG_SIZE } from '../lib/tracing';
import { KanjiGrid } from './KanjiGrid';

interface Props {
  char: string;
  grade: number;
  /** 太く見せる画（1から数える）。0なら全部ふつうに描く */
  highlight?: number;
}

export function StrokeHighlight({ char, grade, highlight = 0 }: Props) {
  const [paths, setPaths] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setPaths(null);
    setError(null);
    getStrokes(char, grade)
      .then((p) => { if (alive) setPaths(p); })
      .catch((e) => {
        if (alive) setError(e instanceof StrokeLoadError ? e.kidMessage : 'よみこめませんでした。');
      });
    return () => { alive = false; };
  }, [char, grade]);

  if (error) return <div className="notice bad">{error}</div>;

  return (
    <div className="strokehl">
      <svg viewBox={`0 0 ${KVG_SIZE} ${KVG_SIZE}`} role="img" aria-label={`${char}の字`}>
        <KanjiGrid />
        {paths?.map((d, i) => (
          <path
            key={i}
            d={d}
            className={i + 1 === highlight ? 'hl-stroke on' : 'hl-stroke'}
          />
        ))}
      </svg>
      {!paths && <p className="muted center">よみこんでいます…</p>}
    </div>
  );
}
