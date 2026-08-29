// スクリプト共通の小道具。
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

/** 見やすい見出しつきの表示 */
export const log = {
  step: (m) => console.log(`\n\x1b[1m\x1b[36m▶ ${m}\x1b[0m`),
  ok: (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`),
  warn: (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`),
  ng: (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`),
  info: (m) => console.log(`    ${m}`),
};

/**
 * 分かりやすい日本語のエラー。
 * 「何をしていて」「何が起きて」「次に何をすればいいか」を必ず書く。
 */
export class FriendlyError extends Error {
  constructor(title, detail, howToFix) {
    super(title);
    this.title = title;
    this.detail = detail;
    this.howToFix = howToFix;
  }
  print() {
    console.error(`\n\x1b[31m\x1b[1m■ ${this.title}\x1b[0m`);
    if (this.detail) console.error(`\n  ${this.detail}`);
    if (this.howToFix) console.error(`\n  \x1b[1mどうすればいい？\x1b[0m\n  ${this.howToFix}`);
    console.error('');
  }
}

/** 想定外のエラーが出ても、意味の分かるメッセージにして終了する */
export function runScript(name, main) {
  main().catch((err) => {
    if (err instanceof FriendlyError) {
      err.print();
    } else {
      console.error(`\n\x1b[31m\x1b[1m■ ${name} の途中で、予想していなかった問題が起きました\x1b[0m`);
      console.error(`\n  技術的な内容（開発者向け）:\n  ${err && err.stack ? err.stack : err}`);
      console.error(`\n  \x1b[1mどうすればいい？\x1b[0m`);
      console.error(`  この画面をそのままコピーして、開発を手伝ってくれる人に見せてください。`);
      console.error(`  この処理は元のデータを書きかえていないので、やり直しても安全です。\n`);
    }
    process.exitCode = 1;
  });
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * インターネットからファイルを取ってくる。
 * 失敗したら 2秒 → 4秒 → 8秒 → 16秒 と待って、最大5回まで試す。
 */
export async function fetchWithRetry(url, { tries = 5, timeoutMs = 180000, label = url } = {}) {
  let lastError = null;
  for (let i = 0; i < tries; i++) {
    if (i > 0) {
      const wait = 2 ** i * 1000;
      log.warn(`${label} の取得に失敗。${wait / 1000}秒待ってやり直します（${i}/${tries - 1}回目）`);
      await sleep(wait);
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ac.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`サーバーが ${res.status} を返しました`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new FriendlyError(
    `インターネットからデータを取ってこられませんでした`,
    `取得しようとしたもの: ${label}\n  場所: ${url}\n  最後のエラー: ${lastError?.message ?? lastError}`,
    `・インターネットにつながっているか確認してください。\n` +
      `  ・時間をおいて、もう一度 npm run data:fetch を実行してください。\n` +
      `  ・何度やっても同じなら、配布元のサイトが一時的に止まっている可能性があります。`,
  );
}

/** 漢字かどうか（CJK統合漢字の範囲） */
export const isKanji = (c) => c >= '一' && c <= '鿿';
/** カタカナだけでできているか（＝音読み） */
export const isKatakanaOnly = (s) => /^[ァ-ヺー]+$/.test(s);
