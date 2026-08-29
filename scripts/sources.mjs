// このアプリが使う「元データ」の一覧。
// ここに書いてあるものだけをインターネットから取ってきます。
// 学習記録など、こちらから外に送るデータは一切ありません。

export const SOURCES = [
  {
    id: 'kyoiku-2017-a',
    file: 'kyoiku-kanji-2017.csv',
    url: 'https://raw.githubusercontent.com/fnshr/kyo-kan/master/kyoiku-kanji-2017.csv',
    what: '学年別漢字配当表（平成29年告示・2020年度全面実施）／出典1つめ',
    origin: '文部科学省 小学校学習指導要領（平成29年告示）',
  },
  {
    id: 'kyoiku-2017-b',
    file: 'kyoiku-kanji-mimneko.csv',
    url: 'https://raw.githubusercontent.com/mimneko/kanji-data/main/%E6%95%99%E8%82%B2%E6%BC%A2%E5%AD%97.csv',
    what: '学年別漢字配当表／出典2つめ（1つめと突き合わせて誤りを検出するため）',
    origin: '文部科学省 小学校学習指導要領（平成29年告示）',
  },
  {
    id: 'joyo',
    file: 'joyo-honhyo.json',
    url: 'https://raw.githubusercontent.com/mimneko/kanji-data/main/%E5%B8%B8%E7%94%A8%E6%BC%A2%E5%AD%97%E8%A1%A8%E6%9C%AC%E8%A1%A8.json',
    what: '常用漢字表 本表（音読み・訓読み・用例）',
    origin: '文化庁 常用漢字表（平成22年内閣告示第2号）',
  },
  {
    id: 'furigana',
    file: 'JmdictFurigana.txt',
    url: 'https://github.com/Doublevil/JmdictFurigana/releases/latest/download/JmdictFurigana.txt',
    what: '熟語の読み（1文字ずつどう読むかの対応つき）',
    origin: 'JMdict（電子辞書研究開発グループ EDRDG）／ JmdictFurigana プロジェクト',
  },
  {
    id: 'furigana-names',
    file: 'JmnedictFurigana.txt',
    url: 'https://github.com/Doublevil/JmdictFurigana/releases/latest/download/JmnedictFurigana.txt',
    what: '地名などの固有名詞の読み（都道府県名を正しく読むために使う）',
    origin: 'JMnedict（電子辞書研究開発グループ EDRDG）／ JmdictFurigana プロジェクト',
  },
  {
    id: 'strokes-crosscheck',
    file: 'kanji-crosscheck.json',
    url: 'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json',
    what: '画数の照合用（KanjiVG の画数が正しいか、別の出典と突き合わせるためだけに使う）',
    origin: 'KANJIDIC2（電子辞書研究開発グループ EDRDG）',
    // 注意：このファイルの「学年」は2020年より前の古い配当表なので絶対に使わない。
    //       画数の照合にだけ使う。
  },
  {
    id: 'jmdict',
    file: 'jmdict.json.tgz',
    url: 'https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20260824122934/jmdict-eng-3.6.2%2B20260824122934.json.tgz',
    what: '国語辞典の見出し語と分類（四字熟語かどうか・固有名詞かどうか）',
    origin: 'JMdict（電子辞書研究開発グループ EDRDG）／ jmdict-simplified',
  },
  {
    id: 'kanjidic2',
    file: 'kanjidic2.json.tgz',
    url: 'https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20260824122934/kanjidic2-en-3.6.2%2B20260824122934.json.tgz',
    what: '漢字の部首（康熙214部首の番号）',
    origin: 'KANJIDIC2（電子辞書研究開発グループ EDRDG）／ jmdict-simplified',
    // .tgz のまま保存し、使うときに展開します（scripts/lib/untar.mjs）
  },
  {
    id: 'bushu',
    file: 'bushu-list.csv',
    url: 'https://raw.githubusercontent.com/mimneko/kanji-data/main/%E9%83%A8%E9%A6%96%E4%B8%80%E8%A6%A7.csv',
    what: '部首214種類の名称（のぎへん・さんずい など）',
    origin: '『漢検漢字辞典』にもとづく部首分類',
  },
  {
    id: 'kanken-jiten',
    file: 'kanken-jiten.csv',
    url: 'https://raw.githubusercontent.com/mimneko/kanji-data/main/%E6%BC%A2%E6%A4%9C%E6%BC%A2%E5%AD%97%E8%BE%9E%E5%85%B8%E6%BC%A2%E5%AD%97.csv',
    what: '漢字ごとの漢検級（こちらの級わりあてが正しいか確かめるために使う）',
    origin: '『漢検漢字辞典』／漢字ペディア',
  },
  {
    id: 'frequency',
    file: 'japanese-frequency.txt',
    url: 'https://raw.githubusercontent.com/hingston/japanese/master/44998-japanese-words.txt',
    what: '日本語の語の使用頻度順リスト（よく使う熟語から出題するために使う）',
    origin: 'University of Leeds 日本語コーパス',
  },
];

// KanjiVG（筆順・字形）は漢字1字につき1ファイルなので別扱い
export const KANJIVG_BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji';

export const LICENSES = [
  {
    name: 'KANJIDIC2',
    url: 'http://www.edrdg.org/wiki/index.php/KANJIDIC_Project',
    license: 'Creative Commons 表示-継承 4.0 (CC BY-SA 4.0) ／ EDRDG',
    used: '漢字の部首',
    note: 'KANJIDIC2は電子辞書研究開発グループ(EDRDG)の所有物です',
  },
  {
    name: '日本語頻度リスト（Leeds Corpus）',
    url: 'http://corpus.leeds.ac.uk/frqc/internet-jp.num',
    license: 'University of Leeds Centre for Translation Studies',
    used: '熟語をよく使う順にならべるため',
    note: '',
  },
  {
    name: 'KanjiVG',
    url: 'http://kanjivg.tagaini.net',
    license: 'Creative Commons 表示-継承 3.0 (CC BY-SA 3.0)',
    used: '漢字の筆順・字形データ',
    note: 'このアプリはKanjiVGのデータを使っています（表示義務あり）',
  },
  {
    name: 'JMdict / JmdictFurigana',
    url: 'http://www.edrdg.org/jmdict/j_jmdict.html',
    license: 'Creative Commons 表示-継承 4.0 (CC BY-SA 4.0) ／ EDRDG',
    used: '熟語の読み',
    note: 'JMdictは電子辞書研究開発グループ(EDRDG)の所有物です',
  },
  {
    name: '常用漢字表',
    url: 'https://www.bunka.go.jp/',
    license: '文化庁（平成22年内閣告示第2号）',
    used: '漢字の音読み・訓読み・用例',
    note: '',
  },
  {
    name: '学年別漢字配当表',
    url: 'https://www.mext.go.jp/',
    license: '文部科学省 小学校学習指導要領（平成29年告示）',
    used: '学年ごとの漢字の割りあて',
    note: '',
  },
];
