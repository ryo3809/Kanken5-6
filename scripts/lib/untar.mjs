// .tar.gz（.tgz）ファイルから、中の1ファイルを取り出す小さな道具。
//
// 外部のライブラリを入れずに済ませるため、自分で書いています。
// tar の中身は「512バイトのヘッダ」＋「中身」の くり返しという単純な形なので、
// これだけの行数で読み取れます。

import { gunzipSync } from 'node:zlib';

/**
 * .tgz の中から、名前が条件に合う最初のファイルの中身を返す。
 * @param {Buffer} tgz         .tgz ファイルの中身
 * @param {(name: string) => boolean} match  ファイル名の条件
 * @returns {Buffer|null}
 */
export function extractFromTgz(tgz, match) {
  const tar = gunzipSync(tgz);
  let pos = 0;
  while (pos + 512 <= tar.length) {
    const header = tar.subarray(pos, pos + 512);
    // 名前は先頭100バイト。0で終わる
    const rawName = header.subarray(0, 100);
    const end = rawName.indexOf(0);
    const name = rawName.subarray(0, end === -1 ? 100 : end).toString('utf8');
    if (name === '') break; // 空のヘッダ＝終わり

    // 大きさは124バイト目から12バイト、8進数の文字列
    const sizeStr = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
    const size = parseInt(sizeStr, 8) || 0;
    const dataStart = pos + 512;

    if (match(name)) return tar.subarray(dataStart, dataStart + size);

    // 中身は512バイト単位で並んでいる
    pos = dataStart + Math.ceil(size / 512) * 512;
  }
  return null;
}
