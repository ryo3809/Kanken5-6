/**
 * ホーム画面のアイコン（PNG画像）を作る。
 *   node scripts/make-icons.mjs
 *
 * public/icon.svg を読んで、必要な大きさの PNG に変換します。
 * iPad の「ホーム画面に追加」は PNG しか受けつけないため、この変換が必要です。
 * 絵を描きかえたいときは public/icon.svg を直してから、もう一度これを実行してください。
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log, runScript, FriendlyError } from './lib/util.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 作るファイルと、その大きさ・使い道 */
const TARGETS = [
  { file: 'public/apple-touch-icon.png', size: 180, why: 'iPad/iPhone のホーム画面' },
  { file: 'public/icon-192.png', size: 192, why: 'Android・パソコンのブラウザ' },
  { file: 'public/icon-512.png', size: 512, why: '大きく表示されるとき' },
];

async function main() {
  log.step('アイコンを作ります');
  let svg;
  try {
    svg = await readFile(path.join(ROOT, 'public/icon.svg'), 'utf8');
  } catch {
    throw new FriendlyError(
      'アイコンのもとの絵が見つかりません',
      'public/icon.svg がありません。',
      'public/icon.svg を用意してから、もう一度実行してください。',
    );
  }

  // この環境用のブラウザがあればそれを使い、無ければ Playwright が入れたものを使う
  const exe = process.env.CHROMIUM_PATH
    || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  try {
    for (const t of TARGETS) {
      const page = await browser.newPage({
        viewport: { width: t.size, height: t.size },
        deviceScaleFactor: 1,
      });
      await page.setContent(
        `<html><body style="margin:0">
           <div style="width:${t.size}px;height:${t.size}px">${svg}</div>
         </body></html>`,
      );
      // 絵の読みこみが終わるのを待つ
      await page.waitForTimeout(120);
      const png = await page.screenshot({ omitBackground: false });
      await writeFile(path.join(ROOT, t.file), png);
      await page.close();
      log.ok(`${t.file}（${t.size}×${t.size}）… ${t.why}`);
    }
  } finally {
    await browser.close();
  }
}

runScript('アイコン作り', main);
