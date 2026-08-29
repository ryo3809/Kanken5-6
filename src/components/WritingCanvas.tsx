// 書き取り（自己採点）のキャンバス。
//
// お手本は出しません。白紙のマスに自分の力で書きます。
// 「こたえを見る」を押すと、正しい漢字が自分の字の上に半透明で重なって出ます。
// 見くらべて、自分で「できた／おしい／まちがえた」を選びます。

import { useEffect } from 'react';
import { KVG_SIZE } from '../lib/tracing';
import { useInk } from './useInk';
import { KanjiGrid } from './KanjiGrid';

interface Props {
  /** 正解の漢字の筆画（こたえを見るときに重ねて表示する） */
  answerPaths: string[] | null;
  /** こたえを重ねて表示するか */
  showAnswer: boolean;
  /** 問題が変わったときに線を消すための目印 */
  resetKey: string;
  /** 何本か線を書いたかを親に伝える（「こたえを見る」を押せるようにするため） */
  onDrawnChange: (drawn: boolean) => void;
  disabled?: boolean;
}

export function WritingCanvas({
  answerPaths, showAnswer, resetKey, onDrawnChange, disabled,
}: Props) {
  const ink = useInk({
    color: '#33302b',
    clearOnStart: false, // 書き取りは何画でも書けるので、前の線を消さない
    disabled: disabled || showAnswer,
    onStrokeEnd: () => {
      // 書き取りでは1画ごとの判定はしません（自分で見くらべて採点します）
    },
  });

  const { clearInk, undoStroke, strokeCount } = ink;

  // 問題が変わったら、書いた線を消す
  useEffect(() => {
    clearInk();
  }, [resetKey, clearInk]);

  useEffect(() => {
    onDrawnChange(strokeCount > 0);
  }, [strokeCount, onDrawnChange]);

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
        {/* こたえ（半透明で自分の字に重なる） */}
        {showAnswer && answerPaths && (
          <svg className="answer-overlay" viewBox={`0 0 ${KVG_SIZE} ${KVG_SIZE}`} aria-hidden="true">
            {answerPaths.map((d, i) => (
              <path key={i} d={d} className="answer-stroke" />
            ))}
          </svg>
        )}
      </div>

      {!showAnswer && strokeCount > 0 && (
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={undoStroke}>↩︎ 1かく もどす</button>
          <button onClick={clearInk}>ぜんぶ けす</button>
        </div>
      )}
    </>
  );
}
