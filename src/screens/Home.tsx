// ホーム画面。しばまるが出むかえて、きょうやることが一目で分かるようにする。

import type { Box, GameState, Settings } from '../lib/types';
import { Shibamaru } from '../character/Shibamaru';
import { pickLine, type Expression } from '../character/expressions';
import { levelProgress, mapProgress, stampInfo } from '../lib/gamification';

interface Props {
  settings: Settings;
  summary: {
    total: number; due: number; unseen: number; learned: number; boxes: Record<Box, number>;
  };
  sessionDates: string[];
  todayAnswered: number;
  storageOk: boolean;
  /** 校正まちで、まだ出題できない漢字の数 */
  blockedCount: number;
  game: GameState;
  tracedCount: number;
  onStart: () => void;
  onStartTracing: () => void;
  onStartWriting: () => void;
  onOpenMap: () => void;
  onOpenZukan: () => void;
  onOpenDressup: () => void;
  onOpenSettings: () => void;
  onOpenBackup: () => void;
  onDismissInstallHint: () => void;
}

const BOX_LABEL: Record<Box, string> = { 1: 'はこ1', 2: 'はこ2', 3: 'はこ3', 4: 'はこ4', 5: 'はこ5' };

/** ホーム画面に追加していないと、iOS はデータを7日で消すことがある */
function needsInstallHint(): boolean {
  const standalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isIOS && !standalone;
}

export function Home(props: Props) {
  const { settings, summary, todayAnswered, storageOk, blockedCount, game } = props;
  const stamps = stampInfo(props.sessionDates);
  const lv = levelProgress(game.exp);
  const map = mapProgress(game.exp);

  // ひさしぶりなら ねむそうに、きょうやったなら うれしそうに
  const exp: Expression =
    todayAnswered > 0 ? 'happy' : stamps.currentStreak === 0 && stamps.totalDays > 0 ? 'sleepy' : 'normal';

  return (
    <div className="app">
      <h1>かんじ れんしゅう</h1>
      <p className="muted" style={{ marginBottom: 14 }}>
        いま {settings.kyu}級 の れんしゅう中　・　レベル {lv.level}
      </p>

      <div className="card">
        <div className="shibabar">
          <Shibamaru expression={exp} hat={game.hat} collar={game.collar} size={104} />
          <div className="bubble">{pickLine(exp, (todayAnswered % 7) / 7)}</div>
        </div>
        <div className="levelbar" style={{ marginTop: 14 }}>
          <span>レベル {lv.level}</span>
          <div className="progressbar" style={{ margin: 0 }}>
            <div style={{ width: `${lv.ratio * 100}%` }} />
          </div>
          <span className="muted">
            {lv.current}/{lv.need}
          </span>
        </div>
      </div>

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
            <b>{stamps.totalDays}</b>
            <span>がんばった日</span>
          </div>
        </div>

        <button className="primary" onClick={props.onStart}>
          きょうの がくしゅう（{settings.sessionSize}もん）
        </button>

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
        <h2>しばまると あそぶ</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          いま <b>{map.spot.name}</b> まで きたよ
        </p>
        <div className="row">
          <button onClick={props.onOpenMap}>🗺 おさんぽマップ</button>
          <button onClick={props.onOpenZukan}>📖 かんじずかん</button>
        </div>
        <button className="wide" style={{ marginTop: 10 }} onClick={props.onOpenDressup}>
          🎀 きせかえ
        </button>
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
