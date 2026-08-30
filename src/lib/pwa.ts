// ホーム画面に追加して、電波が無くても使えるようにするための部分。
//
// なぜ必要か：
//   iPad の Safari は「ホーム画面に追加していないサイト」の記録を、
//   7日つかわないと消してしまうことがあります。
//   ホーム画面に追加してもらうこと、そして追加したあとオフラインでも開けることが、
//   このアプリでは記録を守るための生命線です。
//
// ここでは通信を一切ふやしません。読みこむのは、このアプリ自身のファイルだけです。

/** ホーム画面から開かれている（＝アプリとして動いている）か */
export function isStandalone(): boolean {
  try {
    return (
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    );
  } catch {
    return false;
  }
}

/** iPhone / iPad かどうか（iPadOS は Mac のふりをするので、指の数でも見分ける） */
export function isIOS(): boolean {
  try {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  } catch {
    return false;
  }
}

/**
 * オフラインの準備がどうなっているか。
 * うまくいかないときに、おうちの人の画面で理由が見えるようにするためのもの。
 */
export interface OfflineStatus {
  /** このブラウザがオフライン機能に対応しているか */
  supported: boolean;
  /** 登録できたか */
  registered: boolean;
  /** いま画面を動かしているか（ここが true でないとオフラインで開けない） */
  controlling: boolean;
  /** 登録に失敗した理由（日本語まじりの原文） */
  error: string | null;
  /** ためこみ済みのファイル数 */
  cached: number;
  /** ためこむ予定のファイル数 */
  expected: number;
  /** サーバーが返した安全設定（原因調べに使う） */
  csp: string | null;
  /** sw.js を取りに行ったときの結果 */
  swFile: string | null;
}

/** 登録に失敗した理由をおぼえておく（画面で見せるため） */
let lastError: string | null = null;
let registered = false;

/**
 * オフライン用のしくみを登録する。
 *
 * 失敗しても、アプリの動きには一切影響しません
 * （オフラインで開けなくなるだけで、ふつうに使えます）。
 *
 * @param onUpdateReady 新しい版の用意ができたときに呼ばれる
 */
export function registerServiceWorker(onUpdateReady: () => void): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  // いま画面を動かしている版があるか。
  // 初めて入れたときは切りかわっても読みこみ直さない（画面が急に消えないように）。
  const hadController = !!navigator.serviceWorker.controller;

  const url = `${import.meta.env.BASE_URL}sw.js`;
  navigator.serviceWorker
    .register(url, { scope: import.meta.env.BASE_URL })
    .then((reg) => {
      registered = true;
      lastError = null;
      // すでに新しい版が待っている場合
      if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady();
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          // installed かつ、すでに動いている版がある＝「入れかえ待ち」
          if (sw.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady();
        });
      });
    })
    .catch((e) => {
      // 登録できなくてもアプリはふつうに使える。
      // ただし理由を残しておかないと、あとで原因が分からなくなる
      lastError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    });

  // 新しい版に切りかわったら、1度だけ画面を読みこみ直す。
  // （初めて入れたときは、読みこみ直す必要がないので何もしない）
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
}

/** 「あたらしくする」ボタンから呼ぶ。待っている版に切りかえてもらう */
export function applyUpdate(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.getRegistration()
    .then((reg) => {
      if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      else window.location.reload();
    })
    .catch(() => window.location.reload());
}

/** 案内を閉じてから、つぎに出すまでの日数 */
export const INSTALL_HINT_SNOOZE_DAYS = 7;

/** 「ホーム画面に追加」の案内を、いま出すべきか */
export function shouldShowInstallHint(hiddenUntil: number, now = Date.now()): boolean {
  if (!isIOS()) return false;      // iPad/iPhone のときだけの注意なので
  if (isStandalone()) return false; // もう追加ずみ
  return now >= (hiddenUntil || 0);
}

/** 「わかった」を押されたときに入れる時刻 */
export function snoozeUntil(now = Date.now()): number {
  return now + INSTALL_HINT_SNOOZE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * オフラインの準備がどうなっているかを調べる。
 *
 * うまくいかないときに、おうちの人の画面で
 * 「何が起きているのか」を日本語で見せるためのものです。
 * ここでの通信は、すべて自分自身のファイルに対してだけ行います。
 */
export async function offlineStatus(): Promise<OfflineStatus> {
  const out: OfflineStatus = {
    supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    registered,
    controlling: false,
    error: lastError,
    cached: 0,
    expected: 0,
    csp: null,
    swFile: null,
  };
  if (!out.supported) {
    out.error = out.error ?? 'このブラウザは オフライン機能に対応していません。';
    return out;
  }

  try {
    out.controlling = navigator.serviceWorker.controller !== null;
    const reg = await navigator.serviceWorker.getRegistration();
    out.registered = registered || !!reg;
  } catch {
    /* 調べられなくても、下の確認は続ける */
  }

  // ためこみの中身を数える
  try {
    const names = await caches.keys();
    const name = names.find((n) => n.startsWith('kanken-'));
    if (name) out.cached = (await (await caches.open(name)).keys()).length;
  } catch {
    /* 数えられないだけ。致命的ではない */
  }

  // sw.js が本当に置かれているかを確かめる。
  // ここが HTML だと、ブラウザは「プログラムではない」と判断して登録に失敗する。
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}sw.js`, { cache: 'no-store' });
    const type = res.headers.get('content-type') ?? '（種類の記載なし）';
    const head = (await res.text()).slice(0, 60).replace(/\s+/g, ' ');
    out.swFile = `HTTP ${res.status} ／ ${type} ／ 先頭「${head}」`;
  } catch (e) {
    out.swFile = `取りに行けませんでした（${e instanceof Error ? e.message : String(e)}）`;
  }

  // サーバーが付けている安全設定
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}manifest.webmanifest`, { cache: 'no-store' });
    out.csp = res.headers.get('content-security-policy');
  } catch {
    /* 読めなくても、原因調べには影響しない */
  }

  // ためこむ予定のファイル数は、動いているしくみに聞く
  try {
    out.expected = await askServiceWorker();
  } catch {
    /* 動いていなければ 0 のまま */
  }
  return out;
}

/** 動いているしくみに「何ファイルためこむ予定か」を聞く（2秒で返事がなければあきらめる） */
function askServiceWorker(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sw = navigator.serviceWorker.controller;
    if (!sw) { reject(new Error('まだ動いていません')); return; }
    const ch = new MessageChannel();
    const timer = window.setTimeout(() => reject(new Error('返事がありません')), 2000);
    ch.port1.onmessage = (e) => {
      window.clearTimeout(timer);
      resolve(Number(e.data?.precache ?? 0));
    };
    sw.postMessage({ type: 'STATUS' }, [ch.port2]);
  });
}

/**
 * 「いますぐ ぜんぶ保存する」。
 * 途中で失敗して一部しかためこめていないときに、やり直すためのもの。
 */
export async function recacheNow(): Promise<number> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('このブラウザは オフライン機能に対応していません。');
  }
  const reg = await navigator.serviceWorker.ready;
  const sw = navigator.serviceWorker.controller ?? reg.active;
  if (!sw) throw new Error('オフラインのしくみが まだ動いていません。');
  return new Promise((resolve, reject) => {
    const ch = new MessageChannel();
    const timer = window.setTimeout(() => reject(new Error('時間内に終わりませんでした。')), 60000);
    ch.port1.onmessage = (e) => {
      window.clearTimeout(timer);
      if (e.data?.ok) resolve(Number(e.data.cached ?? 0));
      else reject(new Error(String(e.data?.error ?? '保存できませんでした。')));
    };
    sw.postMessage({ type: 'RECACHE' }, [ch.port2]);
  });
}
