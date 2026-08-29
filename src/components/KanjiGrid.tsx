// 漢字を書くときのマス目（田の字）。書く場所の目やすになります。
import { KVG_SIZE } from '../lib/tracing';

export function KanjiGrid() {
  return (
    <>
      <rect x="1" y="1" width={KVG_SIZE - 2} height={KVG_SIZE - 2} className="grid-outer" />
      <line x1={KVG_SIZE / 2} y1="1" x2={KVG_SIZE / 2} y2={KVG_SIZE - 1} className="grid-inner" />
      <line x1="1" y1={KVG_SIZE / 2} x2={KVG_SIZE - 1} y2={KVG_SIZE / 2} className="grid-inner" />
    </>
  );
}
