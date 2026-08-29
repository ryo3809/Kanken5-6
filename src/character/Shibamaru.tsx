// しばまる（オリジナルの柴犬）。
//
// 丸を組みあわせて描いています。既存の商用キャラクターは使っていません。
// 絵を差しかえたいときは、このファイルと expressions.ts / items.ts だけを直せば大丈夫です。
//
// 座標は 100×100 のマス目です。

import { FACES, type Expression } from './expressions';
import { ITEM_BY_ID } from './items';

interface Props {
  expression?: Expression;
  /** かぶっている ぼうしの id（items.ts 参照） */
  hat?: string | null;
  /** つけている くびわの id */
  collar?: string | null;
  /** 表示の大きさ（px） */
  size?: number;
  /** 画面読み上げ用の説明 */
  label?: string;
}

const FUR = '#e8883a';
const FUR_DARK = '#c96f26';
const CREAM = '#fdf6ec';
const INK = '#3a332b';

export function Shibamaru({
  expression = 'normal', hat = null, collar = null, size = 120, label,
}: Props) {
  const face = FACES[expression];
  const hatItem = hat ? ITEM_BY_ID.get(hat) : null;
  const collarItem = collar ? ITEM_BY_ID.get(collar) : null;

  return (
    <svg
      className={`shiba${face.wag ? ' wag' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={label ?? 'しばまる'}
    >
      {/* しっぽ（からだの うしろで くるんと丸まっている） */}
      <g className="tail">
        <path
          d="M70 86 q18 -1 17 -13 q-1 -12 -13 -10 q-9 2 -6 11"
          fill="none"
          stroke={FUR}
          strokeWidth="9"
          strokeLinecap="round"
        />
      </g>

      {/* からだ */}
      <ellipse cx="50" cy="82" rx="26" ry="19" fill={FUR} />
      <ellipse cx="50" cy="88" rx="17" ry="13" fill={CREAM} />

      {/* まえあし */}
      <ellipse cx="36" cy="95" rx="7" ry="5" fill={CREAM} />
      <ellipse cx="64" cy="95" rx="7" ry="5" fill={CREAM} />

      {/* くびわ */}
      {collarItem && (
        <>
          <path
            d="M32 66 q18 9 36 0"
            fill="none"
            stroke={collarItem.color}
            strokeWidth="6"
            strokeLinecap="round"
          />
          {collarItem.color2 && <circle cx="50" cy="71" r="3.5" fill={collarItem.color2} />}
        </>
      )}

      {/* みみ */}
      <path d="M23 33 L27 11 L42 25 Z" fill={FUR} strokeLinejoin="round" />
      <path d="M77 33 L73 11 L58 25 Z" fill={FUR} strokeLinejoin="round" />
      <path d="M27 29 L29 18 L37 26 Z" fill={FUR_DARK} />
      <path d="M73 29 L71 18 L63 26 Z" fill={FUR_DARK} />

      {/* かお */}
      <circle cx="50" cy="42" r="27" fill={FUR} />
      {/* ほお（クリーム色の部分） */}
      <ellipse cx="50" cy="50" rx="20" ry="15" fill={CREAM} />
      <ellipse cx="30" cy="45" rx="7" ry="9" fill={CREAM} />
      <ellipse cx="70" cy="45" rx="7" ry="9" fill={CREAM} />

      {/* まゆ（豆しばの点ではなく、丸い眉） */}
      <circle cx="36" cy="30" r="3" fill={CREAM} />
      <circle cx="64" cy="30" r="3" fill={CREAM} />

      {/* め */}
      {face.eyes === 'dot' && (
        <>
          <circle cx="39" cy="41" r="3.6" fill={INK} />
          <circle cx="61" cy="41" r="3.6" fill={INK} />
          <circle cx="40.2" cy="39.6" r="1.2" fill="#fff" />
          <circle cx="62.2" cy="39.6" r="1.2" fill="#fff" />
        </>
      )}
      {face.eyes === 'arc' && (
        <>
          <path d="M34.5 42 q4.5 -6 9 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M56.5 42 q4.5 -6 9 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {face.eyes === 'closed' && (
        <>
          <path d="M34.5 41 q4.5 5 9 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M56.5 41 q4.5 5 9 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {face.eyes === 'wide' && (
        <>
          <circle cx="39" cy="41" r="5" fill="#fff" stroke={INK} strokeWidth="1.6" />
          <circle cx="61" cy="41" r="5" fill="#fff" stroke={INK} strokeWidth="1.6" />
          <circle cx="39" cy="41.5" r="2.6" fill={INK} />
          <circle cx="61" cy="41.5" r="2.6" fill={INK} />
        </>
      )}
      {face.eyes === 'sparkle' && (
        <>
          <circle cx="39" cy="41" r="4.2" fill={INK} />
          <circle cx="61" cy="41" r="4.2" fill={INK} />
          <path d="M39 36.4 l1.1 2.4 2.4 1.1 -2.4 1.1 -1.1 2.4 -1.1 -2.4 -2.4 -1.1 2.4 -1.1z" fill="#fff" />
          <path d="M61 36.4 l1.1 2.4 2.4 1.1 -2.4 1.1 -1.1 2.4 -1.1 -2.4 -2.4 -1.1 2.4 -1.1z" fill="#fff" />
        </>
      )}

      {/* ほっぺ */}
      {face.blush && (
        <>
          <ellipse cx="29" cy="51" rx="5" ry="3" fill="#f0a89a" opacity="0.75" />
          <ellipse cx="71" cy="51" rx="5" ry="3" fill="#f0a89a" opacity="0.75" />
        </>
      )}

      {/* はな */}
      <ellipse cx="50" cy="49" rx="4" ry="3.2" fill={INK} />

      {/* くち */}
      {face.mouth === 'small' && (
        <>
          <path d="M50 52 q-4 5 -7 1" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          <path d="M50 52 q4 5 7 1" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {face.mouth === 'smile' && (
        <>
          <path d="M50 52 q-6 7 -10 1" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M50 52 q6 7 10 1" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
        </>
      )}
      {face.mouth === 'open' && (
        <>
          <path d="M50 52 q-6 3 -8 0" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          <path d="M50 52 q6 3 8 0" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          <path d="M42 55 q8 12 16 0 q-8 3 -16 0z" fill={INK} />
          <path d="M46 61 q4 5 8 0 q-4 -1 -8 0z" fill="#f2867f" />
        </>
      )}
      {face.mouth === 'wave' && (
        <path
          d="M43 55 q3.5 -3 7 0 q3.5 3 7 0"
          fill="none"
          stroke={INK}
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}

      {/* ぼうし（かおより手前に描く） */}
      {hatItem?.kind === 'hat' && <Hat id={hatItem.id} color={hatItem.color} color2={hatItem.color2} />}
    </svg>
  );
}

function Hat({ id, color, color2 }: { id: string; color: string; color2?: string }) {
  if (id === 'hat-straw') {
    return (
      <g>
        <ellipse cx="50" cy="20" rx="34" ry="8" fill={color} />
        <path d="M32 20 q0 -16 18 -16 q18 0 18 16 z" fill={color2 ?? color} />
        <path d="M32 18 q18 5 36 0" fill="none" stroke={color} strokeWidth="3" />
      </g>
    );
  }
  if (id === 'hat-knit') {
    return (
      <g>
        <path d="M28 22 q0 -20 22 -20 q22 0 22 20 z" fill={color} />
        <rect x="26" y="19" width="48" height="7" rx="3.5" fill={color2 ?? '#fff'} />
        <circle cx="50" cy="2" r="5" fill={color2 ?? '#fff'} />
      </g>
    );
  }
  if (id === 'hat-cap') {
    return (
      <g>
        <path d="M28 20 q0 -18 22 -18 q22 0 22 18 z" fill={color} />
        <path d="M70 20 q16 0 18 6 q-18 3 -18 -6z" fill={color2 ?? color} />
        <circle cx="50" cy="4" r="3" fill={color2 ?? color} />
      </g>
    );
  }
  if (id === 'hat-crown') {
    return (
      <g>
        <path d="M30 22 L30 6 L40 14 L50 3 L60 14 L70 6 L70 22 z" fill={color} />
        <rect x="29" y="20" width="42" height="5" rx="2.5" fill={color2 ?? color} />
        <circle cx="50" cy="8" r="2.6" fill={color2 ?? '#fff'} />
      </g>
    );
  }
  return null;
}
