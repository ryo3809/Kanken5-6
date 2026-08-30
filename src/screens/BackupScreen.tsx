// バックアップ画面（保護者向け）。
//
// iOS Safari は「ホーム画面に追加していないサイト」のデータを7日で消すことがあります。
// この画面が無いと、消えたときに取り返しがつきません。

import { useMemo, useRef, useState } from 'react';
import type { ExamResult, SelfGradeRecord, SessionRecord } from '../lib/types';
import { downloadBackup, restoreFromFile } from '../lib/backup';
import { eraseAll } from '../lib/db';
import { examSummary, recentDays, scaleTo200, sectionStats, selfGradeWarning } from '../lib/parent';
import { isStandalone, offlineStatus, recacheNow, type OfflineStatus } from '../lib/pwa';
import { InkTest } from '../components/InkTest';

interface Props {
  onBack: () => void;
  onDataChanged: () => void;
  counts: { progress: number; sessions: number };
  /** 書き取りの自己採点の記録（新しい順） */
  selfGrades: SelfGradeRecord[];
  /** 模擬試験の記録 */
  exams: ExamResult[];
  /** 学習の記録（日ごとのようすを出すのに使う） */
  sessions: SessionRecord[];
  /** 最後にバックアップした時刻（0なら一度もしていない） */
  lastBackupAt: number;
  /** バックアップに成功したときに知らせる */
  onBackupDone: () => void;
  /** 「このアプリについて」を開く */
  onOpenAbout: () => void;
}

/** 何日前かを日本語にする */
function daysAgoLabel(at: number, now = Date.now()): string {
  const d = Math.floor((now - at) / (24 * 60 * 60 * 1000));
  if (d <= 0) return 'きょう';
  if (d === 1) return 'きのう';
  return `${d}日前`;
}

const GRADE_LABEL: Record<SelfGradeRecord['grade'], string> = {
  ok: '⭕️ できた',
  close: '△ おしい',
  ng: '✗ まちがえた',
};

type Busy = null | 'export' | 'import' | 'erase' | 'check' | 'recache';

export function BackupScreen({
  onBack, onDataChanged, counts, selfGrades, exams, sessions, lastBackupAt, onBackupDone,
  onOpenAbout,
}: Props) {
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eraseStep, setEraseStep] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showAllGrades, setShowAllGrades] = useState(false);
  /** オフラインの準備を調べた結果（ボタンを押したときだけ入る） */
  const [offline, setOffline] = useState<OfflineStatus | null>(null);
  /** 「ためしがき」を開いているか */
  const [showInkTest, setShowInkTest] = useState(false);

  const summary = useMemo(() => examSummary(exams), [exams]);
  const weak = useMemo(() => sectionStats(exams), [exams]);
  const days = useMemo(() => recentDays(sessions), [sessions]);
  const examRows = useMemo(
    () => [...exams].sort((a, b) => b.at - a.at).slice(0, 10),
    [exams],
  );
  const gradeWarning = useMemo(() => selfGradeWarning(selfGrades), [selfGrades]);

  // 「できた」の割合。極端に高いときは、甘く採点している可能性がある
  const gradeStats = useMemo(() => {
    const n = selfGrades.length;
    const ok = selfGrades.filter((g) => g.grade === 'ok').length;
    const close = selfGrades.filter((g) => g.grade === 'close').length;
    return { n, ok, close, ng: n - ok - close, okRate: n === 0 ? 0 : Math.round((ok / n) * 100) };
  }, [selfGrades]);

  async function handleCheckOffline() {
    setBusy('check');
    setError(null);
    setMessage(null);
    try {
      setOffline(await offlineStatus());
    } catch (e) {
      setError(`調べられませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleRecache() {
    setBusy('recache');
    setError(null);
    setMessage(null);
    try {
      const n = await recacheNow();
      setMessage(`${n}個のファイルを保存しました。電波を切って開けるか試してみてください。`);
      setOffline(await offlineStatus());
    } catch (e) {
      setError(
        `保存できませんでした。${e instanceof Error ? e.message : ''}\n`
        + 'ホーム画面のアイコンから開いているか、電波がつながっているかを確かめてください。',
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleExport() {
    setBusy('export');
    setError(null);
    setMessage(null);
    try {
      const name = await downloadBackup();
      onBackupDone();
      setMessage(
        `「${name}」を書き出しました。iPad の「ファイル」アプリに保存されています。` +
          `iCloud Drive など、iPad の外にも残る場所にコピーしておくと安心です。`,
      );
    } catch (e) {
      setError(
        `書き出しに失敗しました。${e instanceof Error ? e.message : ''}\n` +
          `iPad の空き容量を確認して、もう一度お試しください。`,
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleImport(file: File) {
    setBusy('import');
    setError(null);
    setMessage(null);
    try {
      const n = await restoreFromFile(file);
      setMessage(
        `読みこみました（漢字の記録 ${n.progress}件 / 学習の記録 ${n.sessions}件 / ` +
          `なぞり書き ${n.traces}件 / 自己採点 ${n.selfGrades}件 / 模試 ${n.exams}件）。`,
      );
      onDataChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : '読みこみに失敗しました。');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleErase() {
    setBusy('erase');
    setError(null);
    setMessage(null);
    try {
      await eraseAll();
      setMessage('すべての学習記録を消しました。');
      setEraseStep(0);
      onDataChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : '消去に失敗しました。');
    } finally {
      setBusy(null);
    }
  }

  // いまアプリとして開かれているか（ホーム画面に追加ずみか）
  const standalone = isStandalone();
  // アプリ本体がこのiPadに保存されているか
  const offlineReady =
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    navigator.serviceWorker.controller !== null;
  const backupStale =
    lastBackupAt > 0 && Date.now() - lastBackupAt > 30 * 24 * 60 * 60 * 1000;

  return (
    <div className="app">
      <h1>おうちの人の 画面</h1>
      <p className="muted">
        学習のようすの確認と、記録のバックアップができます。
      </p>

      <div className={standalone ? 'notice' : 'notice bad'}>
        <b>1. ホーム画面に追加できているか</b>
        <br />
        {standalone ? (
          <>
            できています。この状態なら、iPad が勝手に記録を消すことはありません。
          </>
        ) : (
          <>
            <b>まだできていません。</b>
            いまは Safari のタブとして開いています。この状態だと、
            <b>7日間使わないと iPad が記録を自動で消すことがあります。</b>
            <br />
            <span className="muted">
              やり方：画面の共有ボタン → 「ホーム画面に追加」 → 「追加」。
              追加したあとは、ホーム画面のアイコンから開いてください。
            </span>
          </>
        )}
      </div>

      <div className={offlineReady ? 'notice' : 'notice bad'}>
        <b>2. 電波がなくても使えるか</b>
        <br />
        {offlineReady
          ? 'このiPadには、アプリ本体が保存ずみです。電波がなくても使えます。'
          : 'まだ準備できていません。下の「調べる」を押すと、理由が分かります。'}
        <div className="row" style={{ marginTop: 10 }}>
          <button disabled={busy !== null} onClick={() => void handleCheckOffline()}>
            {busy === 'check' ? '調べています…' : '調べる'}
          </button>
          <button disabled={busy !== null} onClick={() => void handleRecache()}>
            {busy === 'recache' ? '保存しています…' : 'いますぐ 保存する'}
          </button>
        </div>
        {offline && (
          <div className="diag">
            <div>
              <span>オフライン機能への対応</span>
              <b>{offline.supported ? 'あり' : 'なし'}</b>
            </div>
            <div>
              <span>しくみの登録</span>
              <b>{offline.registered ? 'できている' : 'できていない'}</b>
            </div>
            <div>
              <span>いま動いているか</span>
              <b>{offline.controlling ? '動いている' : '動いていない'}</b>
            </div>
            <div>
              <span>保存できたファイル</span>
              <b>
                {offline.cached}
                {offline.expected > 0 ? ` / ${offline.expected}` : ''} 個
              </b>
            </div>
            {offline.error && (
              <div className="wide">
                <span>登録できなかった理由</span>
                <b>{offline.error}</b>
              </div>
            )}
            {offline.swFile && (
              <div className="wide">
                <span>sw.js の状態</span>
                <b>{offline.swFile}</b>
              </div>
            )}
            <div className="wide">
              <span>サーバーの安全設定</span>
              <b>{offline.csp ?? '（設定なし）'}</b>
            </div>
            <p className="muted" style={{ margin: '8px 0 0' }}>
              うまくいかないときは、この画面をそのまま見せてください。原因が分かります。
            </p>
          </div>
        )}
      </div>

      <div className={backupStale ? 'notice bad' : 'notice'}>
        <b>3. バックアップ</b>
        <br />
        {lastBackupAt === 0 ? (
          <>
            まだ一度も書き出していません。<b>下の「書き出す」を今すぐ実行してください。</b>
          </>
        ) : (
          <>
            最後の書き出し：{new Date(lastBackupAt).toLocaleDateString('ja-JP')}（
            {daysAgoLabel(lastBackupAt)}）
            {backupStale && <><br /><b>30日以上たっています。もう一度書き出しておくと安心です。</b></>}
          </>
        )}
      </div>

      {exams.length > 0 && (
        <div className="card">
          <h2>模擬試験の記録</h2>
          <div className="stats" style={{ marginBottom: 12 }}>
            <div className="stat">
              <b>{summary.times}</b>
              <span>受けた回数</span>
            </div>
            <div className="stat">
              <b>{summary.latest}</b>
              <span>最新（200点換算）</span>
            </div>
            <div className="stat">
              <b>{summary.best}</b>
              <span>最高</span>
            </div>
          </div>
          <p className="muted">
            直近3回の平均：<b>{summary.recentAverage}点</b>　／　
            合格ライン（140点）に届いた回数：<b>{summary.passed}回</b>
            <br />
            ※ 承認がまだの分野をのぞいて出題しているため、点数は 200点満点に換算して表示しています。
          </p>
          <div className="gradelog exams">
            {examRows.map((e, i) => (
              <div className="row2" key={e.id ?? i}>
                <span>{e.date}</span>
                <span>
                  {e.score} / {e.total}点
                  <br />
                  <span className="muted">
                    200点換算 {scaleTo200(e)}点・{Math.round(e.seconds / 60)}分
                    {e.timedOut ? '・時間切れ' : ''}
                  </span>
                </span>
                <span>{scaleTo200(e) >= 140 ? '合格ライン ○' : '△'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {weak.length > 0 && (
        <div className="card">
          <h2>苦手な分野（模擬試験より）</h2>
          <p className="muted">
            正答率の低い順です。ここが伸びると点が上がります。
          </p>
          {weak.map((s) => (
            <div key={s.no} style={{ marginBottom: 10 }}>
              <div className="levelbar">
                <span style={{ minWidth: 0 }}>
                  {s.no} {s.title}
                </span>
                <div className="progressbar" style={{ margin: 0 }}>
                  <div style={{ width: `${s.rate}%` }} />
                </div>
                <span className="muted">{s.rate}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>この2週間の学習</h2>
        <div className="daybars">
          {days.map((d) => (
            <div className="daybar" key={d.date} title={`${d.date}：${d.count}問`}>
              <div
                className={d.count > 0 ? 'on' : ''}
                style={{ height: `${Math.min(100, d.count === 0 ? 3 : 12 + d.count * 2.5)}%` }}
              />
              <span>{Number(d.date.slice(8))}</span>
            </div>
          ))}
        </div>
        <p className="muted">
          棒の高さは、その日に答えた問題の数です。
          毎日少しずつ続いているかを見てください（できない日があっても責めないでください）。
        </p>
      </div>

      {message && <div className="notice">{message}</div>}
      {error && (
        <div className="notice bad" style={{ whiteSpace: 'pre-wrap' }}>
          {error}
        </div>
      )}

      {selfGrades.length > 0 && (
        <div className="card">
          <h2>書き取りの自己採点</h2>
          <p className="muted">
            お子さんが自分で選んだ結果です。甘く採点していないかの確認にお使いください。
          </p>
          <div className="stats" style={{ marginBottom: 12 }}>
            <div className="stat">
              <b>{gradeStats.ok}</b>
              <span>できた</span>
            </div>
            <div className="stat">
              <b>{gradeStats.close}</b>
              <span>おしい</span>
            </div>
            <div className="stat">
              <b>{gradeStats.ng}</b>
              <span>まちがえた</span>
            </div>
          </div>
          <p className="muted">
            「できた」の割合：<b>{gradeStats.okRate}%</b>（全{gradeStats.n}問）
            {gradeWarning && (
              <>
                <br />
                {gradeWarning}
              </>
            )}
          </p>
          <div className="gradelog">
            {(showAllGrades ? selfGrades : selfGrades.slice(0, 12)).map((g, i) => (
              <div className="row2" key={g.id ?? i}>
                <span className="big">{g.c}</span>
                <span>
                  {g.word}
                  <br />
                  <span className="muted">{g.date}</span>
                </span>
                <span>{GRADE_LABEL[g.grade]}</span>
              </div>
            ))}
          </div>
          {selfGrades.length > 12 && (
            <button
              className="ghost wide"
              style={{ marginTop: 10 }}
              onClick={() => setShowAllGrades((v) => !v)}
            >
              {showAllGrades ? '最近の12件だけ表示' : `すべて表示（${selfGrades.length}件）`}
            </button>
          )}
        </div>
      )}

      <div className="card">
        <h2>書き出す（バックアップを作る）</h2>
        <p className="muted">
          いまの記録：漢字 {counts.progress}字 ／ 学習 {counts.sessions}回
        </p>
        <button className="primary" disabled={busy !== null} onClick={handleExport}>
          {busy === 'export' ? '書き出しています…' : 'ファイルに 書き出す'}
        </button>
      </div>

      <div className="card">
        <h2>読みこむ（バックアップから戻す）</h2>
        <p className="muted">
          いまの記録は、読みこんだ内容に<b>置きかわります</b>。
          先に「書き出す」をしておくと安心です。
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImport(f);
          }}
        />
        <button
          className="wide"
          disabled={busy !== null}
          onClick={() => fileRef.current?.click()}
        >
          {busy === 'import' ? '読みこんでいます…' : 'ファイルを えらんで 読みこむ'}
        </button>
      </div>

      <div className="card">
        <h2>すべて消す</h2>
        {eraseStep === 0 && (
          <>
            <p className="muted">
              学習記録をすべて消します。<b>元に戻せません。</b>
            </p>
            <button className="danger wide" disabled={busy !== null} onClick={() => setEraseStep(1)}>
              すべての記録を消す
            </button>
          </>
        )}
        {eraseStep === 1 && (
          <>
            <p>
              <b>確認1／2</b>
              <br />
              先にバックアップを書き出しましたか？ まだなら、上の「書き出す」を先にしてください。
            </p>
            <div className="row">
              <button onClick={() => setEraseStep(0)}>やめる</button>
              <button className="danger" onClick={() => setEraseStep(2)}>
                書き出し済み。すすむ
              </button>
            </div>
          </>
        )}
        {eraseStep === 2 && (
          <>
            <p>
              <b>確認2／2</b>
              <br />
              漢字 {counts.progress}字ぶんの記録と、学習 {counts.sessions}回ぶんの記録を消します。
              本当によろしいですか？
            </p>
            <div className="row">
              <button onClick={() => setEraseStep(0)}>やめる</button>
              <button className="danger" disabled={busy !== null} onClick={handleErase}>
                {busy === 'erase' ? '消しています…' : '消す'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>手書きの調子をしらべる</h2>
        <p className="muted">
          なぞりがき・かきとりで うまく書けないときに、
          指やペンの入力が届いているかを その場で確かめられます。
        </p>
        {showInkTest ? (
          <InkTest />
        ) : (
          <button className="wide" onClick={() => setShowInkTest(true)}>
            ためしがきを ひらく
          </button>
        )}
      </div>

      <div className="card">
        <h2>このアプリについて</h2>
        <p className="muted">
          データの置き場所と、借りているデータの出どころ（KanjiVG・JMdict など）を
          まとめてあります。
        </p>
        <button className="wide" onClick={onOpenAbout}>
          出どころと決まりを見る
        </button>
      </div>

      <button className="primary" onClick={onBack}>
        ホームに もどる
      </button>
    </div>
  );
}
