// ホーム画面。きょうやることが一目で分かるようにする。

import type { Box, Settings } from '../lib/types';

interface Props {
  settings: Settings;
  summary: {
    total: number;
    due: number;
    unseen: number;
    learned: number;
    boxes: Record<Box, number>;
  };
  streakDays: number;
  todayAnswered: number;
  storageOk: boolean;
  /** 校正まちで、まだ出題できない漢字の数 */
  blockedCount: number;
  onStart: () => void;
  onStartTracing: () => void;
  onStartWriting: () => void;
  /** なぞり書きをしたことのある漢字の数 */
  tracedCount: number;
  onOpenSettings: () => void;
  onOpenBackup: () => void;
  onDismissInstallHint: () => void;
}

const BOX_LABEL: Record<Box, string> = {
  1: 'はこ1',
  2: 'はこ2',
  3: 'はこ3',
  4: 'はこ4',
  5: 'はこ5',
};

/** ホーム画面に追加していないと、iOS はデータを7日で消すことがある */
function needsInstallHint(): boolean {
  const standalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isIOS && !standalone;
}

export function Home(props: Props) {
  const { settings, summary, streakDays, todayAnswered, storageOk, blockedCount } = props;
  const nothingToDo = summary.due === 0 && summary.unseen === 0;

  return (
    <div className="app">
      <h1>かんじ れんしゅう</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        いま {settings.kyu}級 の れんしゅう中
      </p>

      {!storageOk && (
        <div className="notice bad">
          <b>きろくを ほぞんできません</b>
          <br />
          Safari の「プライベートブラウズ」を つかっていると、きろくが のこりません。
          ふつうの タブで ひらいてね。
        </div>
      )}

      {needsInstallHint() && !settings.dismissedInstallHint && (
        <div className="notice">
          <b>さいしょに やってほしいこと</b>
          <br />
          この がめんを <b>ホームがめんに ついか</b> してください。
          そうしないと、7日つかわないと きろくが きえてしまいます。
          <br />
          <span className="muted">
            やりかた： 画面下（または右上）の 共有ボタン
            <span aria-hidden> ⬆️ </span>
            →「ホーム画面に追加」→「追加」
          </span>
          <br />
          <button className="ghost" style={{ marginTop: 8 }} onClick={props.onDismissInstallHint}>
            わかった（この あんないを とじる）
          </button>
        </div>
      )}

      <div className="card">
        <div className="stats" style={{ marginBottom: 16 }}>
          <div className="stat">
            <b>{summary.due}</b>
            <span>きょう ふくしゅう</span>
          </div>
          <div className="stat">
            <b>{summary.unseen}</b>
            <span>まだ ならってない</span>
          </div>
          <div className="stat">
            <b>{streakDays}</b>
            <span>れんぞく にっすう</span>
          </div>
        </div>

        {nothingToDo ? (
          <>
            <p className="center">
              きょうの ぶんは ぜんぶ おわりました。よくがんばったね！
            </p>
            <button className="primary" onClick={props.onStart}>
              それでも もうすこし やる
            </button>
          </>
        ) : (
          <button className="primary" onClick={props.onStart}>
            きょうの がくしゅう（{settings.sessionSize}もん）
          </button>
        )}

        {todayAnswered > 0 && (
          <p className="muted center" style={{ marginTop: 12, marginBottom: 0 }}>
            きょうは ここまでに {todayAnswered}もん といたよ
          </p>
        )}
      </div>

      <div className="card">
        <h2>かんじを かく</h2>
        <p className="muted">
          おてほんの うえを なぞって、かきじゅんを おぼえます。3字ずつです。
        </p>
        <button className="wide" onClick={props.onStartTracing}>
          ✏️ なぞりがきを する
        </button>
        <p className="muted" style={{ marginTop: 16 }}>
          <b>かきとり</b>は、しろい マスに じぶんの力で かきます。
          かいたあとで おてほんと くらべて、じぶんで さいてんします。
        </p>
        <button className="wide" onClick={props.onStartWriting}>
          📝 かきとりを する
        </button>
        {props.tracedCount > 0 && (
          <p className="muted center" style={{ marginTop: 10, marginBottom: 0 }}>
            これまでに {props.tracedCount}字 なぞったよ
          </p>
        )}
      </div>

      <div className="card">
        <h2>おぼえた ようす</h2>
        <p className="muted">
          せいかいすると つぎの はこへ すすみます。はこ5 まで いくと しっかり おぼえた しるしです。
        </p>
        <div className="boxbars">
          {([1, 2, 3, 4, 5] as Box[]).map((b) => {
            const n = summary.boxes[b];
            const pct = summary.total === 0 ? 0 : (n / summary.total) * 100;
            return (
              <div className="boxbar" key={b}>
                <span>{BOX_LABEL[b]}</span>
                <div className="track">
                  <div className="fill" style={{ width: `${pct}%` }} />
                </div>
                <span style={{ textAlign: 'right' }}>{n}字</span>
              </div>
            );
          })}
        </div>
        <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
          {settings.kyu}級の たいしょう {summary.total}字 のうち、{summary.learned}字 を れんしゅう中
          {blockedCount > 0 && (
            <>
              <br />
              （{blockedCount}字は、おうちの人の かくにん まちで まだ でません）
            </>
          )}
        </p>
      </div>

      <div className="row">
        <button onClick={props.onOpenBackup}>きろくの バックアップ</button>
        <button onClick={props.onOpenSettings}>せってい</button>
      </div>
    </div>
  );
}
