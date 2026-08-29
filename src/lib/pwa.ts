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
    .catch(() => {
      /* 登録できなくても、アプリはふつうに使える */
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
