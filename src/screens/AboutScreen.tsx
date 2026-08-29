// 「このアプリについて」画面。
//
// 作った理由：
//   このアプリが使っている KanjiVG（筆順の字形）と JMdict（熟語の読み）は、
//   使うときに「どこから借りたか」をアプリの中に必ず書く決まり（CC BY-SA）です。
//   README に書くだけでは足りないので、この画面を用意しています。
//
// 決まりごと：
//   外部へのリンク（押すと別のサイトに飛ぶボタン）は置きません。
//   住所は文字として書いてあるだけです。

import kanjiData from '../data/kanji.json';

interface Props {
  onBack: () => void;
}

/** 借りているデータと、その決まり */
const SOURCES = [
  {
    name: 'KanjiVG',
    where: 'kanjivg.tagaini.net',
    license: 'クリエイティブ・コモンズ 表示 - 継承 3.0（CC BY-SA 3.0）',
    used: '漢字の筆順・字形（なぞり書きのお手本）',
    note: 'このアプリは KanjiVG のデータを使っています。作者は Ulrich Apel 氏です。',
  },
  {
    name: 'JMdict / JMnedict / JmdictFurigana',
    where: 'www.edrdg.org/jmdict/j_jmdict.html',
    license: 'クリエイティブ・コモンズ 表示 - 継承 4.0（CC BY-SA 4.0）',
    used: '熟語の読み（送りがな・連濁をふくむ）',
    note: 'JMdict は電子辞書研究開発グループ（EDRDG）の所有物です。',
  },
  {
    name: 'KANJIDIC2',
    where: 'www.edrdg.org/wiki/index.php/KANJIDIC_Project',
    license: 'クリエイティブ・コモンズ 表示 - 継承 4.0（CC BY-SA 4.0）',
    used: '漢字の部首',
    note: 'KANJIDIC2 は電子辞書研究開発グループ（EDRDG）の所有物です。',
  },
  {
    name: '常用漢字表',
    where: '文化庁（平成22年内閣告示第2号）',
    license: '公的機関の告示',
    used: '漢字の音読み・訓読み・用例・送りがな',
    note: '',
  },
  {
    name: '学年別漢字配当表',
    where: '文部科学省 小学校学習指導要領（平成29年告示）',
    license: '公的機関の告示',
    used: '学年ごとの漢字の割りあて（＝出題する級の決定）',
    note: '',
  },
  {
    name: '日本語頻度リスト（Leeds Corpus）',
    where: 'corpus.leeds.ac.uk',
    license: 'University of Leeds Centre for Translation Studies',
    used: '熟語をよく使う順にならべるため',
    note: '',
  },
  {
    name: '出題形式・配点',
    where: '公益財団法人 日本漢字能力検定協会 公式サイト・試験問題見本',
    license: '—',
    used: '模擬試験の大問のならびと配点',
    note: '問題文・例文は一切転載していません。問題はすべてこのアプリが作っています。',
  },
];

const meta = (kanjiData as { meta?: { generatedAt?: string; counts?: Record<string, number> } }).meta;

export function AboutScreen({ onBack }: Props) {
  const madeAt = meta?.generatedAt ? new Date(meta.generatedAt).toLocaleDateString('ja-JP') : '—';

  return (
    <div className="app">
      <h1>このアプリについて</h1>

      <div className="card">
        <h2>データの置き場所</h2>
        <p className="muted">
          学習の記録（解いた問題・まちがえた漢字・模試の点数・書いた字）は、
          <b>この端末の中だけ</b>に保存されます（ブラウザの IndexedDB という置き場所です）。
          <br />
          <b>インターネットには、いっさい送っていません。</b>
          ログインも会員登録もなく、広告も課金もありません。
          記録を他の端末に移したいときは、「おうちの人の 画面」から
          ファイルに書き出して持っていってください。
        </p>
      </div>

      <div className="card">
        <h2>借りているデータ</h2>
        <p className="muted">
          このアプリは、下のデータをもとに作られています。
          CC BY-SA という決まりのデータは、ここに出どころを書くことが条件です。
        </p>
        {SOURCES.map((s) => (
          <div key={s.name} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}>
            <b>{s.name}</b>
            <br />
            <span className="muted">
              出どころ：{s.where}
              <br />
              決まり：{s.license}
              <br />
              使っているところ：{s.used}
              {s.note && (
                <>
                  <br />
                  {s.note}
                </>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>絵と文について</h2>
        <p className="muted">
          柴犬「しばまる」の絵、地図の風景、はげましの言葉は、
          すべてこのアプリのために新しく作ったものです。
          市販の問題集や、よそのアプリからコピーしたものは使っていません。
        </p>
      </div>

      <div className="card">
        <h2>いまのデータ</h2>
        <p className="muted">
          漢字 {meta?.counts?.kanji ?? '—'}字（6級 {meta?.counts?.kanji6kyu ?? '—'}字）／
          熟語 {meta?.counts?.words ?? '—'}語
          <br />
          データを作った日：{madeAt}
        </p>
      </div>

      <button className="primary" onClick={onBack}>
        もどる
      </button>
    </div>
  );
}
