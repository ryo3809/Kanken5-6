// 学習記録のバックアップ（JSONファイルへの書き出し・読み込み）。
//
// iOS Safari には「ホーム画面に追加していないサイトのデータを7日間で消す」仕組みがあります。
// この機能が無いと、消えたときに取り返しがつきません。だから最初から作ってあります。

import type {
  BackupFile, GameState, Progress, SelfGradeRecord, SessionRecord, Settings, TraceRecord,
} from './types';
import { DEFAULT_GAME, DEFAULT_SETTINGS } from './types';
import { exportAll, importAll } from './db';

/** バックアップファイルを作って、ダウンロードさせる */
export async function downloadBackup(): Promise<string> {
  const data = await exportAll();
  const file: BackupFile = {
    app: 'kanken-5-6',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...data,
  };
  const stamp = new Date()
    .toLocaleString('sv-SE')  // 2026-08-29 09:30:00 の形になる
    .replace(/[: ]/g, '-');
  const name = `かんじ-きろく-${stamp}.json`;

  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // すぐに消すと保存が間に合わないことがあるので、少し待ってから片づける
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return name;
}

/** 読みこんだファイルが、本当にこのアプリのバックアップか確かめる */
export function validateBackup(raw: unknown): BackupFile {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('ファイルの中身が読み取れませんでした。JSONファイルを選んでください。');
  }
  const o = raw as Partial<BackupFile>;
  if (o.app !== 'kanken-5-6') {
    throw new Error('このアプリのバックアップファイルではないようです。別のファイルを選んでください。');
  }
  if (o.version !== 1) {
    throw new Error(
      `バックアップの形式（版 ${String(o.version)}）に対応していません。アプリを新しくしてから試してください。`,
    );
  }
  if (!Array.isArray(o.progress) || !Array.isArray(o.sessions)) {
    throw new Error('バックアップの中身が壊れています。別のバックアップを選んでください。');
  }

  // 1件ずつ形を確かめる。おかしいものは取りこまない（壊れたデータを入れないため）
  const progress: Progress[] = o.progress.filter(
    (p): p is Progress =>
      !!p &&
      typeof p.c === 'string' &&
      p.c.length === 1 &&
      typeof p.box === 'number' &&
      p.box >= 1 &&
      p.box <= 5 &&
      typeof p.nextReview === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.nextReview),
  );
  const sessions: SessionRecord[] = o.sessions.filter(
    (s): s is SessionRecord =>
      !!s &&
      typeof s.date === 'string' &&
      typeof s.total === 'number' &&
      typeof s.correct === 'number',
  );
  // なぞり書きの記録は、古いバックアップには入っていないので無くてもよい
  const traces: TraceRecord[] = Array.isArray(o.traces)
    ? o.traces.filter(
        (t): t is TraceRecord =>
          !!t && typeof t.c === 'string' && t.c.length === 1 && typeof t.times === 'number',
      )
    : [];
  // 自己採点の記録も、古いバックアップには入っていないので無くてもよい
  const selfGrades: SelfGradeRecord[] = Array.isArray(o.selfGrades)
    ? o.selfGrades.filter(
        (g): g is SelfGradeRecord =>
          !!g &&
          typeof g.c === 'string' &&
          typeof g.date === 'string' &&
          (g.grade === 'ok' || g.grade === 'close' || g.grade === 'ng'),
      )
    : [];
  // しばまるの状態。古いバックアップには入っていないので無くてもよい
  const game: GameState = {
    ...DEFAULT_GAME,
    ...(typeof o.game === 'object' && o.game !== null ? o.game : {}),
  };
  if (!Number.isFinite(game.exp) || game.exp < 0) game.exp = 0;
  if (!Array.isArray(game.seenSpots)) game.seenSpots = [0];
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(o.settings ?? {}) };

  if (progress.length === 0 && sessions.length === 0) {
    throw new Error('バックアップの中に、読みこめる記録がありませんでした。');
  }
  return {
    app: 'kanken-5-6',
    version: 1,
    exportedAt: o.exportedAt ?? '',
    progress,
    sessions,
    traces,
    selfGrades,
    game,
    settings,
  };
}

/** ファイルを読みこんで復元する。件数を返す */
export async function restoreFromFile(
  file: File,
): Promise<{ progress: number; sessions: number; traces: number; selfGrades: number }> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new Error('ファイルを開けませんでした。もう一度選びなおしてください。');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('ファイルの中身がこわれているようです。別のバックアップを選んでください。');
  }
  const data = validateBackup(raw);
  await importAll({
    progress: data.progress,
    sessions: data.sessions,
    traces: data.traces,
    selfGrades: data.selfGrades,
    game: data.game,
    settings: data.settings,
  });
  return {
    progress: data.progress.length,
    sessions: data.sessions.length,
    traces: data.traces?.length ?? 0,
    selfGrades: data.selfGrades?.length ?? 0,
  };
}
