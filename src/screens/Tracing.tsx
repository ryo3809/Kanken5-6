// なぞり書きの画面。
// お手本の上をなぞって、筆順・書きはじめ・向きを1画ずつ確かめます。
// まちがえた画は、その画だけやり直します（最初からやり直しにはしません）。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KanjiEntry } from '../lib/types';
import type { Point } from '../lib/svgpath';
import { judgeStroke, prepareStrokes, type RefStroke, type TraceVerdict } from '../lib/tracing';
import { getStrokes, StrokeLoadError } from '../lib/strokeStore';
import { TracingCanvas } from '../components/TracingCanvas';

interface Props {
  /** なぞる漢字のならび */
  queue: KanjiEntry[];
  /** 全部おわったとき */
  onFinish: (result: { traced: string[]; retries: number }) => void;
  onQuit: () => void;
}

export function Tracing({ queue, onFinish, onQuit }: Props) {
  const [index, setIndex] = useState(0);          // いま何字目か
  const [refs, setRefs] = useState<RefStroke[] | null>(null);
  const [stroke, setStroke] = useState(0);        // いま何画目か
  const [verdict, setVerdict] = useState<TraceVerdict | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [charDone, setCharDone] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const retriesRef = useRef(0);
  const tracedRef = useRef<string[]>([]);

  const kanji = queue[index];

  // 漢字が変わったら、その字の筆順データを読みこむ
  useEffect(() => {
    if (!kanji) return;
    let alive = true;
    setRefs(null);
    setStroke(0);
    setVerdict(null);
    setCharDone(false);
    setLoadError(null);
    getStrokes(kanji.c, kanji.grade)
      .then((paths) => {
        if (alive) setRefs(prepareStrokes(paths));
      })
      .catch((e) => {
        if (!alive) return;
        setLoadError(
          e instanceof StrokeLoadError
            ? e.kidMessage
            : 'かきじゅんの データを よみこめませんでした。',
        );
      });
    return () => {
      alive = false;
    };
  }, [kanji]);

  const handleStroke = useCallback(
    (points: Point[]) => {
      if (!refs) return;
      const v = judgeStroke(points, refs, stroke);
      setVerdict(v);
      if (v.ok) {
        const next = stroke + 1;
        if (next >= refs.length) {
          tracedRef.current.push(kanji.c);
          setCharDone(true);
        } else {
          // 少しだけ間をおいてから次の画へ（「できた」が見えるように）
          window.setTimeout(() => {
            setStroke(next);
            setVerdict(null);
          }, 450);
        }
      } else {
        retriesRef.current += 1;
      }
    },
    [refs, stroke, kanji],
  );

  function nextChar() {
    if (index + 1 >= queue.length) {
      onFinish({ traced: tracedRef.current, retries: retriesRef.current });
    } else {
      setIndex(index + 1);
    }
  }

  if (!kanji) return null;

  return (
    <div className="app">
      <p className="muted center" style={{ marginBottom: 6 }}>
        {index + 1} / {queue.length}字目
        {refs && !charDone && `　・　${stroke + 1}かくめ / ぜんぶで ${refs.length}かく`}
      </p>

      <div className="card" style={{ padding: 14 }}>
        {loadError ? (
          <div className="notice bad">
            {loadError}
            <br />
            <button className="ghost" style={{ marginTop: 8 }} onClick={nextChar}>
              つぎの かんじへ
            </button>
          </div>
        ) : !refs ? (
          <p className="center muted" style={{ margin: '40px 0' }}>
            よみこんでいます…
          </p>
        ) : (
          <>
            <TracingCanvas
              refs={refs}
              current={charDone ? refs.length - 1 : stroke}
              onStroke={handleStroke}
              lastWrong={!!verdict && !verdict.ok}
              disabled={charDone}
            />

            {/* 何画目まで書けたかの目やす */}
            <div className="strokedots" aria-label="かいたかず">
              {refs.map((_, i) => (
                <span
                  key={i}
                  className={i < stroke || charDone ? 'done' : i === stroke ? 'now' : ''}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {charDone ? (
        <div className="card center">
          <p style={{ fontSize: 26, marginBottom: 4 }}>⭕️ かけました！</p>
          <p style={{ fontSize: 56, lineHeight: 1.2, margin: '4px 0' }}>{kanji.c}</p>
          <p className="muted" style={{ marginBottom: 4 }}>
            {refs?.length}かく　{kanji.grade}年生の かんじ
          </p>
          {(kanji.on.length > 0 || kanji.kun.length > 0) && (
            <p className="muted">
              {kanji.on.length > 0 && <>音：{kanji.on.map((r) => r.kana).join('・')}　</>}
              {kanji.kun.length > 0 && (
                <>
                  訓：
                  {kanji.kun
                    .map((r) => (r.okurigana ? `${r.stem}（${r.okurigana}）` : r.kana))
                    .join('・')}
                </>
              )}
            </p>
          )}
          <button className="primary" onClick={nextChar}>
            {index + 1 >= queue.length ? 'おわる' : 'つぎの かんじ'}
          </button>
        </div>
      ) : verdict && !verdict.ok ? (
        <div className="notice bad">
          <b>{verdict.message}</b>
          <br />
          <span className="muted">この かくだけ、もういちど なぞってね</span>
        </div>
      ) : verdict && verdict.ok ? (
        <div className="notice" style={{ background: 'var(--ok-bg)', borderColor: 'var(--ok)' }}>
          <b>いいね！</b>
        </div>
      ) : (
        <div className="notice">
          ひかっている <b>●</b> から、こい せんの うえを なぞってね
        </div>
      )}

      {confirmQuit ? (
        <div className="card">
          <p>なぞりがきを やめて、ホームに もどる？</p>
          <div className="row">
            <button onClick={() => setConfirmQuit(false)}>つづける</button>
            <button className="danger" onClick={onQuit}>
              もどる
            </button>
          </div>
        </div>
      ) : (
        <button className="ghost wide" onClick={() => setConfirmQuit(true)}>
          とちゅうで やめる
        </button>
      )}
    </div>
  );
}
