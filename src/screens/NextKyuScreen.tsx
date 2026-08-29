// 「5級にすすむ」画面。
//
// なぜ作ったか：
//   級を変えるのは、せっていの中のちいさなボタンでした。
//   子どもが自分で「つぎに進む」と決められる場所ではありませんでした。
//   6級（11月）に受かったあと、5級（2月）へ気持ちよく移れるようにします。
//
// 大事にしていること：
//   ・記録は1つも消えないことを、はっきり伝える
//   ・いつでも6級に戻れることを伝える
//   ・「まだ早い」と本人が思ったら、そのまま戻れる

import type { KanjiEntry, Kyu } from '../lib/types';
import { Shibamaru } from '../character/Shibamaru';

interface Props {
  /** いま練習している級 */
  kyu: Kyu;
  kanji: KanjiEntry[];
  /** 練習ずみの漢字 */
  learned: Set<string>;
  /** 模擬試験で合格ライン（200点換算140点）に届いた回数 */
  passedCount: number;
  onChangeKyu: (kyu: Kyu) => void;
  onBack: () => void;
}

export function NextKyuScreen({ kyu, kanji, learned, passedCount, onChangeKyu, onBack }: Props) {
  // 5級で新しく出るのは、小学6年生で習う漢字
  const newChars = kanji.filter((k) => k.grade === 6);
  const doneNew = newChars.filter((k) => learned.has(k.c)).length;
  const learnedAll = kanji.filter((k) => k.grade <= 5 && learned.has(k.c)).length;

  if (kyu === 5) {
    return (
      <div className="app">
        <h1>6級に もどる</h1>
        <div className="card center">
          <Shibamaru expression="normal" size={90} />
          <p style={{ fontSize: 18 }}>
            いまは <b>5級</b>（小学6年生まで・1026字）を れんしゅう中だよ。
          </p>
          <p className="muted">
            6級（小学5年生まで・835字）に もどっても、きろくは 1つも きえません。
            いつでも 5級に もどって こられます。
          </p>
        </div>
        <button className="primary" onClick={() => onChangeKyu(6)}>
          6級に もどる
        </button>
        <button className="ghost wide" style={{ marginTop: 8 }} onClick={onBack}>
          このままで いい
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>5級に すすむ</h1>

      <div className="card center">
        <Shibamaru expression={passedCount > 0 ? 'proud' : 'normal'} size={96} />
        {passedCount > 0 ? (
          <p style={{ fontSize: 18 }}>
            もぎしけんで <b>{passedCount}回</b> ごうかくラインを こえたね。
            <br />
            そろそろ 5級に すすんでみる？
          </p>
        ) : (
          <p style={{ fontSize: 18 }}>
            5級に すすむと、もんだいが むずかしくなるよ。
            <br />
            6級の もぎしけんで ごうかくラインを こえてからでも いいからね。
          </p>
        )}
      </div>

      <div className="card">
        <h2>5級って どんな きゅう？</h2>
        <p className="muted">
          小学6年生までに ならう 漢字ぜんぶ（<b>1026字</b>）から 出ます。
          6級（835字）に、<b>6年生の {newChars.length}字</b> が くわわります。
        </p>
        <p className="muted">
          もんだいの 形も すこし かわります。
          <br />
          ・<b>四字熟語</b> が 出るようになります（6級は 三字熟語）
          <br />
          ・<b>誤字訂正</b>（まちがった漢字を なおす）が ぶんやべつれんしゅうに くわわります
        </p>
      </div>

      <div className="card">
        <h2>いまの ようす</h2>
        <div className="stats">
          <div className="stat">
            <b>{learnedAll}</b>
            <span>6級の字で れんしゅうずみ</span>
          </div>
          <div className="stat">
            <b>{doneNew}</b>
            <span>6年生の字で れんしゅうずみ</span>
          </div>
          <div className="stat">
            <b>{newChars.length - doneNew}</b>
            <span>これから おぼえる字</span>
          </div>
        </div>
      </div>

      <div className="notice">
        <b>だいじょうぶ、きろくは きえません</b>
        <br />
        きゅうを かえても、いままでの きろく・しばまるのレベル・もぎしけんの てんすうは
        ぜんぶ そのまま のこります。<b>いつでも 6級に もどれます。</b>
      </div>

      <button className="primary" onClick={() => onChangeKyu(5)}>
        5級に すすむ
      </button>
      <button className="ghost wide" style={{ marginTop: 8 }} onClick={onBack}>
        まだ 6級を つづける
      </button>
    </div>
  );
}
