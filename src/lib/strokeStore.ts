// 筆順データ（public/strokes/grade-N.json）を読みこむ部分。
// 学年ごとに6ファイルに分かれているので、必要になったものだけ読みます。
// 読みこみ先は自分のサイト内だけです。外部には行きません。

export interface StrokeFile {
  viewBox: string;
  strokes: Record<string, string[]>;
}

const cache = new Map<number, Promise<StrokeFile>>();

/** 読みこみに失敗したときの、子どもにも分かるエラー */
export class StrokeLoadError extends Error {
  constructor(public readonly kidMessage: string, cause?: unknown) {
    super(kidMessage, { cause });
  }
}

function loadGrade(grade: number): Promise<StrokeFile> {
  let p = cache.get(grade);
  if (!p) {
    p = (async () => {
      let res: Response;
      try {
        res = await fetch(`${import.meta.env.BASE_URL}strokes/grade-${grade}.json`);
      } catch (e) {
        throw new StrokeLoadError(
          'かきじゅんの データを よみこめませんでした。アプリを ひらきなおしてみてね。',
          e,
        );
      }
      if (!res.ok) {
        throw new StrokeLoadError(
          'かきじゅんの データが 見つかりませんでした。アプリを ひらきなおしてみてね。',
        );
      }
      try {
        return (await res.json()) as StrokeFile;
      } catch (e) {
        throw new StrokeLoadError('かきじゅんの データが こわれているようです。', e);
      }
    })().catch((e) => {
      cache.delete(grade); // 次にもう一度ためせるようにする
      throw e;
    });
    cache.set(grade, p);
  }
  return p;
}

/**
 * ある漢字の筆画（SVGのパス文字列）を取り出す。
 *
 * ここでは失敗をにぎりつぶさず、そのまま呼び出し元に伝えます。
 * 画面側（src/screens/Tracing.tsx）が受け止めて、
 * 子どもに分かる案内と「つぎの かんじへ」ボタンを出します。
 */
export async function getStrokes(char: string, grade: number): Promise<string[]> {
  const file = await loadGrade(grade);
  const paths = file.strokes[char];
  if (!paths || paths.length === 0) {
    throw new StrokeLoadError(`「${char}」の かきじゅんデータが ありません。`);
  }
  return paths;
}

/** さきに読みこんでおく（待ち時間を減らすため） */
export function preloadGrade(grade: number): void {
  void loadGrade(grade).catch(() => {
    // ここで失敗しても、実際に使うときにもう一度ためすので何もしない
  });
}
