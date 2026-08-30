/*
  オフラインで動かすための「サービスワーカー」。
  （サービスワーカー＝ブラウザが裏で動かす小さなプログラム。
    一度読みこんだファイルを保存しておいて、電波が無くてもアプリを開けるようにする役目）

  このファイルは直接さわらないでください。
  scripts/sw-template.js をもとに、npm run build のときに自動で作られます。

  安全のための決まりごと：
    ・このアプリ自身のファイル以外には、いっさい手を出しません（外部への通信はしません）
    ・学習の記録（IndexedDB）には触れません。ここで扱うのはプログラムと画像だけです
    ・新しい版が出ても、勝手に切りかわりません。画面のボタンを押したときだけ入れかわります
*/

const VERSION = '__VERSION__';
const CACHE = `kanken-${VERSION}`;
const PRECACHE = __PRECACHE__;

/*
  ためこみを探すときの決まりごと。

  ignoreVary をつけないと、iPad が「同じファイルなのに別物」と判断して
  見つけられないことがあります（サーバーが Vary: Origin という印をつけるため）。
  ここでためこむのは自分のサイトのファイルだけなので、無視して安全です。
*/
const MATCH = { ignoreVary: true };

// ── 入れたとき：必要なファイルを全部ためこむ ───────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 1つ失敗しても全部が失敗しないように、1件ずつ入れる
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch {
            /* この1件だけ後まわし。使うときにネットから取りに行く */
          }
        }),
      );
    })(),
  );
});

// ── 切りかわったとき：古いためこみを片づける ───────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith('kanken-') && n !== CACHE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

// ── 画面からの問い合わせ ─────────────────────────────────
self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  const reply = event.ports && event.ports[0];

  // 新しい版に切りかえて（画面のボタンから）
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // いまの状態を教えて（おうちの人の画面の「しらべる」から）
  if (type === 'STATUS' && reply) {
    caches.open(CACHE)
      .then((cache) => cache.keys())
      .then((keys) => reply.postMessage({
        version: VERSION, precache: PRECACHE.length, cached: keys.length,
      }))
      .catch(() => reply.postMessage({ version: VERSION, precache: PRECACHE.length, cached: 0 }));
    return;
  }

  // もう一度ためこみ直して（一部しか入っていないときのやり直し）
  if (type === 'RECACHE' && reply) {
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(CACHE);
        const failed = [];
        for (const url of PRECACHE) {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (e) {
            failed.push(url);
          }
        }
        const keys = await cache.keys();
        reply.postMessage({
          ok: failed.length === 0,
          cached: keys.length,
          error: failed.length ? `${failed.length}個のファイルを保存できませんでした（電波の状態を確かめてください）` : null,
        });
      } catch (e) {
        reply.postMessage({ ok: false, cached: 0, error: String(e && e.message ? e.message : e) });
      }
    })());
  }
});

// ── ファイルを取りに行くとき ───────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;                                   // 読めないURLには手を出さない
  }
  // 自分のサイト以外には、いっさい手を出さない
  if (url.origin !== self.location.origin) return;

  // 画面そのもの（ページの読みこみ）は、まずネットを試して、だめならためこみを使う。
  // こうしておくと、新しい版が出たときに気づける。
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put('./index.html', res.clone()).catch(() => {});
          return res;
        } catch {
          const cached =
            (await caches.match('./index.html', MATCH)) || (await caches.match(req, MATCH));
          if (cached) return cached;
          return new Response(
            '<meta charset="utf-8"><p style="font-family:sans-serif;padding:24px">'
              + 'アプリを ひらけませんでした。<br>いちど インターネットに つないでから、'
              + 'もう一度 ひらいてください。</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
          );
        }
      })(),
    );
    return;
  }

  // それ以外（プログラム・画像・筆順データ）は、ためこみを先に使う
  event.respondWith(
    (async () => {
      const cached = await caches.match(req, MATCH);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === 'basic') {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      } catch {
        // 電波がなく、ためこみにも無かった。空の返事より、理由の分かる返事を返す
        return new Response('オフラインのため、このファイルを読めませんでした。', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })(),
  );
});
