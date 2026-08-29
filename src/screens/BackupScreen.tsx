// バックアップ画面（保護者向け）。
//
// iOS Safari は「ホーム画面に追加していないサイト」のデータを7日で消すことがあります。
// この画面が無いと、消えたときに取り返しがつきません。

import { useMemo, useRef, useState } from 'react';
import type { SelfGradeRecord } from '../lib/types';
import { downloadBackup, restoreFromFile } from '../lib/backup';
import { eraseAll } from '../lib/db';

interface Props {
  onBack: () => void;
  onDataChanged: () => void;
  counts: { progress: number; sessions: number };
  /** 書き取りの自己採点の記録（新しい順） */
  selfGrades: SelfGradeRecord[];
}

const GRADE_LABEL: Record<SelfGradeRecord['grade'], string> = {
  ok: '⭕️ できた',
  close: '△ おしい',
  ng: '✗ まちがえた',
};

type Busy = null | 'export' | 'import' | 'erase';

export function BackupScreen({ onBack, onDataChanged, counts, selfGrades }: Props) {
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eraseStep, setEraseStep] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showAllGrades, setShowAllGrades] = useState(false);

  // 「できた」の割合。極端に高いときは、甘く採点している可能性がある
  const gradeStats = useMemo(() => {
    const n = selfGrades.length;
    const ok = selfGrades.filter((g) => g.grade === 'ok').length;
    const close = selfGrades.filter((g) => g.grade === 'close').length;
    return { n, ok, close, ng: n - ok - close, okRate: n === 0 ? 0 : Math.round((ok / n) * 100) };
  }, [selfGrades]);

  async function handleExport() {
    setBusy('export');
    setError(null);
    setMessage(null);
    try {
      const name = await downloadBackup();
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
          `なぞり書き ${n.traces}件 / 自己採点 ${n.selfGrades}件）。`,
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

  return (
    <div className="app">
      <h1>きろくの バックアップ</h1>
      <p className="muted">この画面は、おうちの人が使う画面です。</p>

      <div className="notice">
        <b>なぜ バックアップが必要か</b>
        <br />
        iPad の Safari は、<b>ホーム画面に追加していないサイト</b>のデータを、
        7日間使わないと自動で消すことがあります。
        月に1回でよいので、下のボタンでファイルに書き出しておいてください。
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
            {gradeStats.n >= 20 && gradeStats.okRate >= 95 && (
              <>
                <br />
                ほぼ全問「できた」になっています。字を見くらべる目安が
                ゆるくなっていないか、一度いっしょに確認してみてください。
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
        <h2>1. 書き出す（バックアップを作る）</h2>
        <p className="muted">
          いまの記録：漢字 {counts.progress}字 ／ 学習 {counts.sessions}回
        </p>
        <button className="primary" disabled={busy !== null} onClick={handleExport}>
          {busy === 'export' ? '書き出しています…' : 'ファイルに 書き出す'}
        </button>
      </div>

      <div className="card">
        <h2>2. 読みこむ（バックアップから戻す）</h2>
        <p className="muted">
          いまの記録は、読みこんだ内容に<b>置きかわります</b>。
          先に「1. 書き出す」をしておくと安心です。
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
        <h2>3. すべて消す</h2>
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
              先にバックアップを書き出しましたか？ まだなら、上の「1. 書き出す」を先にしてください。
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

      <button className="primary" onClick={onBack}>
        ホームに もどる
      </button>
    </div>
  );
}
