// 読みの「ゆれ」を吸収する道具。
//
// 熟語の中では、もとの読みが変わることがあります。
//   連濁（れんだく）… 出発の「発」が ハツ → パツ、雨具の「具」が グ
//   促音便（そくおんびん）… 出発の「出」が シュツ → シュッ
// この変化をもどして、もとの音読み・訓読みと同じかどうかを調べます。

/** ひらがな → カタカナ */
export const toKatakana = (s: string): string =>
  s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

/** カタカナ → ひらがな */
export const toHiragana = (s: string): string =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** 濁点・半濁点をとる（連濁をもどす）… ガ→カ、パ→ハ */
const DAKUON: Record<string, string> = {
  ガ: 'カ', ギ: 'キ', グ: 'ク', ゲ: 'ケ', ゴ: 'コ',
  ザ: 'サ', ジ: 'シ', ズ: 'ス', ゼ: 'セ', ゾ: 'ソ',
  ダ: 'タ', ヂ: 'チ', ヅ: 'ツ', デ: 'テ', ド: 'ト',
  バ: 'ハ', ビ: 'ヒ', ブ: 'フ', ベ: 'ヘ', ボ: 'ホ',
  パ: 'ハ', ピ: 'ヒ', プ: 'フ', ペ: 'ヘ', ポ: 'ホ',
};

/**
 * 熟語の中での読みを、もとの形にもどした候補をすべて返す。
 * 例：「パツ」→ ["パツ", "ハツ"]、「シュッ」→ ["シュッ", "シュツ", "シュチ", "シュク", "シュキ"]
 */
export function readingVariants(kana: string): string[] {
  const k = toKatakana(kana);
  const out = new Set<string>([k]);

  // 連濁をもどす（1文字目の濁点をとる）
  const first = DAKUON[k[0]];
  if (first) out.add(first + k.slice(1));

  // 促音便をもどす（さいごの ッ を もとの音にもどす）
  for (const base of [...out]) {
    if (base.endsWith('ッ')) {
      const head = base.slice(0, -1);
      for (const tail of ['ツ', 'チ', 'ク', 'キ']) out.add(head + tail);
    }
  }
  return [...out];
}

/** 2つの読みが、ゆれを考えると同じといえるか */
export function readingMatches(inWord: string, original: string): boolean {
  const orig = toKatakana(original);
  return readingVariants(inWord).includes(orig);
}
