// 学習記録を iPad の中に保存する部分。
//
// 「IndexedDB」＝ ブラウザが端末の中に持っている保存場所です。
// ここに書いたデータが外部に送られることはありません。
//
// 大事な決まり:
//   ・保存に失敗しても、それまでの記録が壊れないようにする
//   ・エラーは日本語で、次に何をすればいいかまで書く
//   ・保存できなくても、アプリ自体は動き続ける（その回の記録が残らないだけ）

import { openDB, type IDBPDatabase } from 'idb';
import type { Progress, SelfGradeRecord, SessionRecord, Settings, TraceRecord } from './types';
import { DEFAULT_SETTINGS } from './types';

const DB_NAME = 'kanken-5-6';
const DB_VERSION = 3;

export const STORE = {
  progress: 'progress',
  sessions: 'sessions',
  settings: 'settings',
  traces: 'traces',
  selfGrades: 'selfGrades',
} as const;

/** 保存まわりで起きた問題を、子どもにも分かる日本語で表す */
export class StorageError extends Error {
  constructor(
    /** 画面にそのまま出せる文 */
    public readonly kidMessage: string,
    /** 開発者向けの元のエラー */
    public readonly cause?: unknown,
  ) {
    super(kidMessage);
  }
}

/** エラーの中身を見て、子ども向けの文にする */
function toKidMessage(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'QuotaExceededError') {
    return 'iPad の ほぞんできる ようりょうが いっぱいです。おうちの人に そうだんしてね。';
  }
  if (name === 'InvalidStateError' || name === 'UnknownError') {
    return 'きろくを ほぞんできませんでした。Safari を いちど とじて、もういちど ひらいてみてね。';
  }
  if (name === 'VersionError') {
    return 'アプリの あたらしい ばんごうと、ほぞんされた きろくが あいません。おうちの人に そうだんしてね。';
  }
  return 'きろくの ほぞんに しっぱいしました。もういちど ためしてみてね。';
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 漢字ごとの習熟度。キーは漢字そのもの
        if (!db.objectStoreNames.contains(STORE.progress)) {
          db.createObjectStore(STORE.progress, { keyPath: 'c' });
        }
        // 1回ごとの学習記録。キーは自動でつく通し番号
        if (!db.objectStoreNames.contains(STORE.sessions)) {
          const s = db.createObjectStore(STORE.sessions, { keyPath: 'id', autoIncrement: true });
          s.createIndex('date', 'date');
        }
        // 設定。キーは 'settings' 固定の1件だけ
        if (!db.objectStoreNames.contains(STORE.settings)) {
          db.createObjectStore(STORE.settings);
        }
        // なぞり書きの記録（版2で追加）。
        // 既にある記録はそのまま残るので、古い記録が消えることはありません。
        if (!db.objectStoreNames.contains(STORE.traces)) {
          db.createObjectStore(STORE.traces, { keyPath: 'c' });
        }
        // 書き取りの自己採点の記録（版3で追加）。
        // 保護者があとから確認するために残します。
        if (!db.objectStoreNames.contains(STORE.selfGrades)) {
          const g = db.createObjectStore(STORE.selfGrades, { keyPath: 'id', autoIncrement: true });
          g.createIndex('date', 'date');
          g.createIndex('c', 'c');
        }
      },
      blocked() {
        console.warn('別のタブでこのアプリが開かれているため、データベースを更新できません');
      },
    }).catch((e) => {
      dbPromise = null; // 次回やり直せるようにする
      throw new StorageError(
        'きろくを ひらけませんでした。プライベートブラウズを つかっていると ほぞんできません。おうちの人に そうだんしてね。',
        e,
      );
    });
  }
  return dbPromise;
}

/** IndexedDB が使えるかどうか（プライベートブラウズなどで使えないことがある） */
export async function isStorageAvailable(): Promise<boolean> {
  try {
    await getDb();
    return true;
  } catch {
    return false;
  }
}

// ─── 習熟度 ────────────────────────────────────────────────

export async function loadAllProgress(): Promise<Map<string, Progress>> {
  try {
    const db = await getDb();
    const all: Progress[] = await db.getAll(STORE.progress);
    return new Map(all.map((p) => [p.c, p]));
  } catch (e) {
    if (e instanceof StorageError) throw e;
    throw new StorageError('これまでの きろくを よみこめませんでした。' + toKidMessage(e), e);
  }
}

/**
 * 1回のセッションぶんの習熟度をまとめて保存する。
 * 1つの書き込み処理（トランザクション）にまとめてあるので、
 * 途中で失敗したときは「全部書かれない」か「全部書かれる」かのどちらかになり、
 * 中途半端に壊れることがありません。
 */
export async function saveProgressBatch(items: Progress[]): Promise<void> {
  if (items.length === 0) return;
  try {
    const db = await getDb();
    const tx = db.transaction(STORE.progress, 'readwrite');
    await Promise.all(items.map((p) => tx.store.put(p)));
    await tx.done;
  } catch (e) {
    throw new StorageError(toKidMessage(e), e);
  }
}

// ─── 学習の記録 ────────────────────────────────────────────

export async function addSession(rec: SessionRecord): Promise<void> {
  try {
    const db = await getDb();
    await db.add(STORE.sessions, rec);
  } catch (e) {
    throw new StorageError(toKidMessage(e), e);
  }
}

export async function loadSessions(): Promise<SessionRecord[]> {
  try {
    const db = await getDb();
    const all: SessionRecord[] = await db.getAll(STORE.sessions);
    return all.sort((a, b) => a.startedAt - b.startedAt);
  } catch (e) {
    throw new StorageError('これまでの きろくを よみこめませんでした。' + toKidMessage(e), e);
  }
}

// ─── なぞり書きの記録 ──────────────────────────────────────

export async function loadTraces(): Promise<Map<string, TraceRecord>> {
  try {
    const db = await getDb();
    const all: TraceRecord[] = await db.getAll(STORE.traces);
    return new Map(all.map((t) => [t.c, t]));
  } catch {
    // なぞり書きの記録が読めなくても、練習はできるので空で進む
    return new Map();
  }
}

export async function saveTraces(items: TraceRecord[]): Promise<void> {
  if (items.length === 0) return;
  try {
    const db = await getDb();
    const tx = db.transaction(STORE.traces, 'readwrite');
    await Promise.all(items.map((t) => tx.store.put(t)));
    await tx.done;
  } catch (e) {
    throw new StorageError(toKidMessage(e), e);
  }
}

// ─── 書き取りの自己採点 ────────────────────────────────────

export async function addSelfGrades(items: SelfGradeRecord[]): Promise<void> {
  if (items.length === 0) return;
  try {
    const db = await getDb();
    const tx = db.transaction(STORE.selfGrades, 'readwrite');
    await Promise.all(items.map((g) => tx.store.add(g)));
    await tx.done;
  } catch (e) {
    throw new StorageError(toKidMessage(e), e);
  }
}

export async function loadSelfGrades(): Promise<SelfGradeRecord[]> {
  try {
    const db = await getDb();
    const all: SelfGradeRecord[] = await db.getAll(STORE.selfGrades);
    return all.sort((a, b) => b.at - a.at); // 新しい順
  } catch {
    // 読めなくても練習はできるので、空で進む
    return [];
  }
}

// ─── 設定 ──────────────────────────────────────────────────

export async function loadSettings(): Promise<Settings> {
  try {
    const db = await getDb();
    const s = await db.get(STORE.settings, 'settings');
    // 保存されていない項目は初期値で埋める（アプリを更新して項目が増えても壊れない）
    return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  } catch {
    // 設定が読めなくてもアプリは動かせるので、初期値で進む
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE.settings, s, 'settings');
  } catch (e) {
    throw new StorageError(toKidMessage(e), e);
  }
}

// ─── バックアップ（書き出し・読み込み）────────────────────

export async function exportAll(): Promise<{
  progress: Progress[];
  sessions: SessionRecord[];
  traces: TraceRecord[];
  selfGrades: SelfGradeRecord[];
  settings: Settings;
}> {
  const db = await getDb();
  const [progress, sessions, traces, selfGrades, settings] = await Promise.all([
    db.getAll(STORE.progress) as Promise<Progress[]>,
    db.getAll(STORE.sessions) as Promise<SessionRecord[]>,
    db.getAll(STORE.traces) as Promise<TraceRecord[]>,
    db.getAll(STORE.selfGrades) as Promise<SelfGradeRecord[]>,
    loadSettings(),
  ]);
  return { progress, sessions, traces, selfGrades, settings };
}

/**
 * バックアップから復元する。
 * いまのデータを先に消してから書くのではなく、
 * 「1つの書き込み処理の中で、消す → 書く」を行う。
 * 途中で失敗したら何も変わらないので、データが消えてしまうことがない。
 */
export async function importAll(data: {
  progress: Progress[];
  sessions: SessionRecord[];
  traces?: TraceRecord[];
  selfGrades?: SelfGradeRecord[];
  settings: Settings;
}): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(
      [STORE.progress, STORE.sessions, STORE.traces, STORE.selfGrades, STORE.settings],
      'readwrite',
    );
    const pStore = tx.objectStore(STORE.progress);
    const sStore = tx.objectStore(STORE.sessions);
    const tStore = tx.objectStore(STORE.traces);
    const gStore = tx.objectStore(STORE.selfGrades);
    const cStore = tx.objectStore(STORE.settings);

    // ここで1つずつ await してはいけない。
    // IndexedDB は「待っているあいだに次の指示が来ない」と書き込み処理を勝手に閉じてしまうため、
    // 途中でデータが消えたまま止まる危険がある。
    // 指示は順番どおりに実行されるので、まとめて出してから最後に1回だけ待つ。
    const ops: Promise<unknown>[] = [
      pStore.clear(),
      sStore.clear(),
      tStore.clear(),
      gStore.clear(),
      ...data.progress.map((p) => pStore.put(p)),
      ...(data.traces ?? []).map((t) => tStore.put(t)),
      ...(data.selfGrades ?? []).map((g) => {
        const { id: _drop, ...rest } = g;
        void _drop;
        return gStore.put(rest as SelfGradeRecord);
      }),
      ...data.sessions.map((s) => {
        // id は保存時に自動でつくので、取りのぞいてから入れる
        const { id: _drop, ...rest } = s;
        void _drop;
        return sStore.put(rest as SessionRecord);
      }),
      cStore.put(data.settings, 'settings'),
    ];
    await Promise.all(ops);
    await tx.done;
  } catch (e) {
    throw new StorageError(
      'バックアップの よみこみに しっぱいしました。もとの きろくは そのままです。' + toKidMessage(e),
      e,
    );
  }
}

/** 全部消す（保護者画面から、2段階の確認をしたうえでだけ呼ぶ） */
export async function eraseAll(): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(
      [STORE.progress, STORE.sessions, STORE.traces, STORE.selfGrades, STORE.settings],
      'readwrite',
    );
    await Promise.all([
      tx.objectStore(STORE.progress).clear(),
      tx.objectStore(STORE.sessions).clear(),
      tx.objectStore(STORE.traces).clear(),
      tx.objectStore(STORE.selfGrades).clear(),
      tx.objectStore(STORE.settings).clear(),
    ]);
    await tx.done;
  } catch (e) {
    throw new StorageError(toKidMessage(e), e);
  }
}
