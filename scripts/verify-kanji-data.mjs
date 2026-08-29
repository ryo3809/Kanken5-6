/**
 * 【3】作ったデータが正しいか自動でチェックするスクリプト
 *
 *   npm run data:verify
 *
 * 「間違った漢字・読みを子どもに覚えさせない」ための最後の砦です。
 * 1つでも【必須】が落ちたら、そのデータは使ってはいけません。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { log, runScript, FriendlyError, isKanji, isKatakanaOnly } from './lib/util.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, 'data/cache');
const DATA = path.join(ROOT, 'src/data');

const OFFICIAL = {
  gradeCounts: { 1: 80, 2: 160, 3: 200, 4: 202, 5: 193, 6: 191 },
  kyu6: 835,
  kyu5: 1026,
};

const results = [];
/** 落ちたらデータを使ってはいけないチェック */
function must(name, ok, detail) { results.push({ level: 'must', name, ok, detail }); }
/** 落ちても止まらないが、人が対応すべきチェック */
function should(name, ok, detail) { results.push({ level: 'should', name, ok, detail }); }

async function readJson(file, hint) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new FriendlyError(
      `データファイルが読めません：${path.relative(ROOT, file)}`,
      `ファイルが無いか、中身が壊れています。`,
      hint,
    );
  }
}

runScript('データの検証', async () => {
  console.log('漢検アプリ｜漢字データの検証');
  console.log('='.repeat(60));

  const hint = '先に npm run data:build を実行してください。';
  const { meta, kanji } = await readJson(path.join(DATA, 'kanji.json'), hint);
  const { words } = await readJson(path.join(DATA, 'words.json'), hint);
  const { pairs } = await readJson(path.join(DATA, 'pairs.json'), hint);
  const { kozo } = await readJson(path.join(DATA, 'kozo.json'), hint);
  const byChar = new Map(kanji.map((k) => [k.c, k]));

  // ── 検証1：学年ごとの字数が公式と一致するか ───────────────────
  log.step('検証1　学年ごとの字数が公式の数と合っているか');
  const counts = {};
  for (const k of kanji) counts[k.grade] = (counts[k.grade] ?? 0) + 1;
  let gradeOk = true;
  for (const [g, expected] of Object.entries(OFFICIAL.gradeCounts)) {
    const got = counts[g] ?? 0;
    if (got === expected) log.ok(`${g}年生：${got}字（公式 ${expected}字）`);
    else { log.ng(`${g}年生：${got}字（公式は ${expected}字）`); gradeOk = false; }
  }
  must('学年ごとの配当字数が公式と一致', gradeOk);

  const n6 = kanji.filter((k) => k.grade <= 5).length;
  const n5 = kanji.length;
  log[n6 === OFFICIAL.kyu6 ? 'ok' : 'ng'](`6級の対象漢字数：${n6}字（公式 ${OFFICIAL.kyu6}字）`);
  log[n5 === OFFICIAL.kyu5 ? 'ok' : 'ng'](`5級の対象漢字数：${n5}字（公式 ${OFFICIAL.kyu5}字）`);
  must('6級の対象漢字数が835字', n6 === OFFICIAL.kyu6);
  must('5級の対象漢字数が1026字', n5 === OFFICIAL.kyu5);

  // ── 検証2：画数が別の出典と一致するか ─────────────────────────
  log.step('検証2　画数が、KanjiVG とは別の出典と一致するか');
  let cross = null;
  try {
    cross = JSON.parse(await readFile(path.join(CACHE, 'kanji-crosscheck.json'), 'utf8'));
  } catch { /* 無ければスキップ */ }
  if (!cross) {
    log.warn('照合用データが無いのでスキップしました（npm run data:fetch で取得できます）');
    should('画数の別出典との照合', false, '照合用データが無い');
  } else {
    const mismatch = [];
    let checked = 0;
    for (const k of kanji) {
      const ref = cross[k.c]?.strokes;
      if (typeof ref !== 'number') continue;
      checked++;
      if (ref !== k.strokes) mismatch.push(`${k.c}（KanjiVG=${k.strokes} / 別出典=${ref}）`);
    }
    if (mismatch.length === 0) log.ok(`${checked}字すべてで画数が一致しました`);
    else {
      log.ng(`${mismatch.length}字で画数が食い違います：${mismatch.slice(0, 20).join('、')}`);
      log.info('※ 漢検の総画数は KanjiVG の筆画数と一致するのが原則です。食い違う字は手で確認してください。');
    }
    must('画数が2つの出典で一致', mismatch.length === 0, mismatch);
  }

  // ── 検証3：重複・欠落がないか ─────────────────────────────────
  log.step('検証3　漢字の重複・欠落がないか');
  const seen = new Set();
  const dup = [];
  for (const k of kanji) { if (seen.has(k.c)) dup.push(k.c); seen.add(k.c); }
  log[dup.length === 0 ? 'ok' : 'ng'](dup.length === 0 ? '重複なし' : `重複あり：${dup.join('')}`);
  must('漢字の重複がない', dup.length === 0, dup);

  const badGrade = kanji.filter((k) => !(k.grade >= 1 && k.grade <= 6));
  log[badGrade.length === 0 ? 'ok' : 'ng'](
    badGrade.length === 0 ? '学年がすべて1〜6の範囲内' : `学年がおかしい字：${badGrade.map((k) => k.c).join('')}`,
  );
  must('学年が1〜6の範囲内', badGrade.length === 0);

  const noStrokes = kanji.filter((k) => !(k.strokes > 0));
  log[noStrokes.length === 0 ? 'ok' : 'ng'](
    noStrokes.length === 0 ? '全字に筆順データあり' : `筆順データが無い字：${noStrokes.map((k) => k.c).join('')}`,
  );
  must('全字に筆順データがある', noStrokes.length === 0);

  // ── 検証4：全漢字に読みと熟語があるか ────────────────────────
  log.step('検証4　すべての漢字に、読みと熟語が1つ以上あるか');
  const noReading = kanji.filter((k) => k.on.length + k.kun.length === 0);
  log[noReading.length === 0 ? 'ok' : 'ng'](
    noReading.length === 0 ? '全字に読みあり' : `読みが無い字：${noReading.map((k) => k.c).join('')}`,
  );
  must('全字に読みが1つ以上ある', noReading.length === 0, noReading.map((k) => k.c));

  // 音読みはカタカナ、訓読みはひらがな
  const badKana = [];
  for (const k of kanji) {
    for (const r of k.on) if (!isKatakanaOnly(r.kana)) badKana.push(`${k.c}の音「${r.kana}」`);
    for (const r of k.kun) if (isKatakanaOnly(r.kana)) badKana.push(`${k.c}の訓「${r.kana}」`);
  }
  log[badKana.length === 0 ? 'ok' : 'ng'](
    badKana.length === 0 ? '音読みはカタカナ・訓読みはひらがなで統一されている' : `おかしい読み：${badKana.slice(0, 10).join('、')}`,
  );
  must('音訓のかな種別が正しい', badKana.length === 0, badKana);

  // 熟語（その漢字を含む語）が1つ以上あるか
  const wordsByChar = new Map();
  for (const w of words) for (const c of w.w) {
    if (!wordsByChar.has(c)) wordsByChar.set(c, []);
    wordsByChar.get(c).push(w);
  }
  const noWord6 = kanji.filter((k) => k.grade <= 5 && !(wordsByChar.get(k.c) ?? []).some((w) => w.lv === 6));
  const noWordAll = kanji.filter((k) => !wordsByChar.has(k.c));
  log[noWordAll.length === 0 ? 'ok' : 'warn'](
    noWordAll.length === 0
      ? '全字に熟語あり'
      : `熟語が1つも無い字：${noWordAll.length}字（${noWordAll.map((k) => k.c).join('')}）`,
  );
  should('全字に熟語が1つ以上ある', noWordAll.length === 0, noWordAll.map((k) => k.c));
  if (noWord6.length) {
    log.warn(`6級の範囲だけで作れる熟語が無い字：${noWord6.length}字（${noWord6.map((k) => k.c).join('')}）`);
  }
  should('6級の全対象漢字に、6級範囲内の熟語がある', noWord6.length === 0, noWord6.map((k) => k.c));

  // ── 検証5：級の対象外の漢字が混ざっていないか ────────────────
  log.step('検証5　熟語に、その級の対象外の漢字が混ざっていないか');
  const outOfRange = [];
  const wrongLevel = [];
  for (const w of words) {
    for (const c of w.w) {
      if (!isKanji(c)) continue;
      const k = byChar.get(c);
      if (!k) { outOfRange.push(`${w.w}（${c} は1026字の外）`); continue; }
      if (w.lv === 6 && k.grade > 5) wrongLevel.push(`${w.w}（${c} は${k.grade}年配当なのに6級に入っている）`);
    }
  }
  log[outOfRange.length === 0 ? 'ok' : 'ng'](
    outOfRange.length === 0 ? '対象外の漢字を含む熟語はありません' : `対象外：${outOfRange.slice(0, 10).join('、')}`,
  );
  must('熟語に1026字以外の漢字が入っていない', outOfRange.length === 0, outOfRange);
  log[wrongLevel.length === 0 ? 'ok' : 'ng'](
    wrongLevel.length === 0 ? '6級の熟語はすべて5年生までの漢字でできています' : `級ちがい：${wrongLevel.slice(0, 10).join('、')}`,
  );
  must('6級の熟語が6級の範囲に収まっている', wrongLevel.length === 0, wrongLevel);

  // ── 検証6：熟語の読みがそろっているか ────────────────────────
  log.step('検証6　熟語の読みが1文字ずつ割りあてられているか');
  // 熟字訓（今日=きょう など）は1字ずつに分けられないのが正しい姿なので、除外して数える
  const noPer = words.filter((w) => !w.jukujikun && w.p.some((x) => x === null));
  const jukuCount = words.filter((w) => w.jukujikun).length;
  const ambiguous = words.filter((w) => w.alt);
  log.ok(`熟字訓（今日＝きょう など）：${jukuCount}語を、常用漢字表の付表どおりに登録しました`);
  log[noPer.length === 0 ? 'ok' : 'warn'](
    noPer.length === 0
      ? '全語で1文字ずつの読みが取れています'
      : `1文字ずつの読みが取れない語：${noPer.length}語（例: ${noPer.slice(0, 8).map((w) => w.w).join('、')}）`,
  );
  should('熟語の読みが1文字ずつ取れている', noPer.length === 0, noPer.map((w) => w.w));
  if (ambiguous.length) {
    log.info(`読み方が複数ある語：${ambiguous.length}語（例: ${ambiguous.slice(0, 5).map((w) => `${w.w}=${w.alt.join('/')}`).join('、')}）`);
    log.info('※ 読み問題では、載っている読みをすべて正解あつかいにします（安全側）。');
  }

  // 校正が必要な語
  const needReview = words.filter((w) => !w.verified);
  log[needReview.length === 0 ? 'ok' : 'warn'](
    needReview.length === 0
      ? '出典が確かでない熟語はありません'
      : `保護者の校正が必要な熟語：${needReview.length}語（${needReview.map((w) => `${w.w}(${w.r})`).join('、')}）`,
  );
  should('すべての熟語が校正済み', needReview.length === 0, needReview.map((w) => w.w));

  const badReadingKana = words.filter((w) => !/^[ぁ-ゖー]+$/.test(w.r));
  log[badReadingKana.length === 0 ? 'ok' : 'ng'](
    badReadingKana.length === 0 ? '熟語の読みはすべてひらがな' : `ひらがなでない読み：${badReadingKana.slice(0, 8).map((w) => `${w.w}=${w.r}`).join('、')}`,
  );
  must('熟語の読みがすべてひらがな', badReadingKana.length === 0, badReadingKana.map((w) => w.w));

  // ── 検証7：送り仮名 ──────────────────────────────────────────
  log.step('検証7　送り仮名のデータが作れているか');
  const kunTotal = kanji.reduce((n, k) => n + k.kun.length, 0);
  const kunWithOkuri = kanji.reduce((n, k) => n + k.kun.filter((r) => r.okurigana).length, 0);
  log.ok(`訓読み ${kunTotal}件のうち、送り仮名が割り出せたもの ${kunWithOkuri}件（${Math.round((kunWithOkuri / kunTotal) * 100)}%）`);
  const okuriBad = [];
  for (const k of kanji) for (const r of k.kun) {
    if (r.okurigana && r.stem + r.okurigana !== r.kana) okuriBad.push(`${k.c}：${r.stem}+${r.okurigana}≠${r.kana}`);
  }
  log[okuriBad.length === 0 ? 'ok' : 'ng'](okuriBad.length === 0 ? '送り仮名の分け方に矛盾なし' : `矛盾：${okuriBad.join('、')}`);
  must('送り仮名の分け方に矛盾がない', okuriBad.length === 0, okuriBad);

  // ── 検証8：出典の記録 ────────────────────────────────────────
  log.step('検証8　出典とライセンスの記録があるか');
  const hasSources = Array.isArray(meta.sources) && meta.sources.length > 0;
  const hasLicenses = Array.isArray(meta.licenses) && meta.licenses.some((l) => /KanjiVG/.test(l.name));
  log[hasSources ? 'ok' : 'ng'](hasSources ? `出典 ${meta.sources.length}件を記録` : '出典の記録がありません');
  log[hasLicenses ? 'ok' : 'ng'](hasLicenses ? 'KanjiVG のライセンス表記あり（アプリ内に表示が必要）' : 'KanjiVG のライセンス表記がありません');
  must('出典が記録されている', hasSources);
  must('KanjiVG のライセンス表記がある', hasLicenses);

  // ── 検証9：部首 ──────────────────────────────────────────
  log.step('検証9　部首');
  const radNone = kanji.filter((k) => !k.radical).length;
  const radOk = kanji.filter((k) => k.radicalVerified).length;
  log[radNone === 0 ? 'ok' : 'ng'](
    radNone === 0 ? '全1026字に部首がついている' : `部首が無い字：${radNone}字`,
  );
  must('全字に部首がついている', radNone === 0);
  const badName = kanji.filter((k) => k.radical && !k.radicalName);
  log[badName.length === 0 ? 'ok' : 'ng'](
    badName.length === 0 ? '全字に部首名がついている' : `部首名が無い字：${badName.map((k) => k.c).join('')}`,
  );
  must('全字に部首名がついている', badName.length === 0);
  log[radOk === kanji.length ? 'ok' : 'warn'](
    `出題できる部首：${radOk}字（確認まち ${kanji.length - radOk}字）`,
  );
  log.info('※ 部首は KANJIDIC2（康熙214部首）が出どころ、名前は『漢検漢字辞典』の部首一覧です。');
  log.info('   漢検の部首分類と一致しない字がある可能性は残ります。');
  should('部首がすべて確認ずみ', radOk === kanji.length, `確認まち ${kanji.length - radOk}字`);

  // ── 検証10：対義語・類義語／熟語の構成 ──────────────────
  log.step('検証10　対義語・類義語と、熟語の構成');
  const wordSet = new Map(words.map((w) => [w.w, w]));
  const pairBad = pairs.filter((p) => !wordSet.get(p.a)?.verified || !wordSet.get(p.b)?.verified);
  log[pairBad.length === 0 ? 'ok' : 'ng'](
    pairBad.length === 0
      ? `対義語・類義語 ${pairs.length}組：使っている語はすべて出典データにある`
      : `出典データに無い語を使っている組：${pairBad.map((p) => `${p.a}-${p.b}`).join('、')}`,
  );
  must('対義語・類義語が出典データの語だけでできている', pairBad.length === 0);

  const pairSame = pairs.filter((p) => p.a === p.b);
  log[pairSame.length === 0 ? 'ok' : 'ng'](pairSame.length === 0 ? '同じ語どうしの組はない' : `同じ語：${pairSame.length}組`);
  must('同じ語どうしの組がない', pairSame.length === 0);

  const pairLv = pairs.filter((p) => {
    const a = wordSet.get(p.a);
    const b = wordSet.get(p.b);
    return p.lv === 6 && (a?.lv !== 6 || b?.lv !== 6);
  });
  log[pairLv.length === 0 ? 'ok' : 'ng'](
    pairLv.length === 0 ? '6級の組は6級の語だけでできている' : `級ちがい：${pairLv.length}組`,
  );
  must('6級の対義語が6級の範囲に収まっている', pairLv.length === 0);

  const kozoBad = kozo.filter((k) => !wordSet.get(k.w)?.verified);
  log[kozoBad.length === 0 ? 'ok' : 'ng'](
    kozoBad.length === 0
      ? `熟語の構成 ${kozo.length}語：使っている語はすべて出典データにある`
      : `出典データに無い語：${kozoBad.map((k) => k.w).join('、')}`,
  );
  must('熟語の構成が出典データの語だけでできている', kozoBad.length === 0);

  const kozoType = kozo.filter((k) => !['ア', 'イ', 'ウ', 'エ'].includes(k.type));
  log[kozoType.length === 0 ? 'ok' : 'ng'](kozoType.length === 0 ? '構成はすべて ア〜エ のどれか' : `おかしい構成：${kozoType.length}件`);
  must('熟語の構成がア〜エのどれかになっている', kozoType.length === 0);

  const kozoDup = kozo.map((k) => k.w).filter((w, i, a) => a.indexOf(w) !== i);
  log[kozoDup.length === 0 ? 'ok' : 'ng'](
    kozoDup.length === 0 ? '同じ熟語が2つの構成に入っていない' : `重複：${kozoDup.join('、')}`,
  );
  must('同じ熟語が2つの構成に入っていない', kozoDup.length === 0);

  const byType = {};
  for (const k of kozo) byType[k.type] = (byType[k.type] ?? 0) + 1;
  log.ok(`構成のうちわけ：${Object.entries(byType).map(([t, n]) => `${t}${n}語`).join(' / ')}`);
  const kozoOk = kozo.filter((k) => k.verified).length;
  const pairOk = pairs.filter((p) => p.verified).length;
  log[pairOk === pairs.length ? 'ok' : 'warn'](`出題できる対義語・類義語：${pairOk}/${pairs.length}組`);
  log[kozoOk === kozo.length ? 'ok' : 'warn'](`出題できる熟語の構成：${kozoOk}/${kozo.length}語`);
  should('対義語・類義語がすべて確認ずみ', pairOk === pairs.length, `確認まち ${pairs.length - pairOk}組`);
  should('熟語の構成がすべて確認ずみ', kozoOk === kozo.length, `確認まち ${kozo.length - kozoOk}語`);

  // ── 検証11：三字熟語・四字熟語 ──────────────────────────
  log.step('検証11　三字熟語・四字熟語');
  const w3 = words.filter((w) => w.n === 3 && w.verified);
  const w4 = words.filter((w) => w.yoji && w.verified);
  log.ok(`三字熟語 ${w3.length}語（6級で使える ${w3.filter((w) => w.lv === 6).length}語）`);
  log.ok(`四字熟語 ${w4.length}語（6級で使える ${w4.filter((w) => w.lv === 6).length}語）`);
  should('三字熟語が100語以上ある', w3.length >= 100, `${w3.length}語`);
  should('四字熟語が100語以上ある', w4.length >= 100, `${w4.length}語`);
  // 会社名・新聞社名・大学名などが混ざっていないか。
  // 「新聞紙」はふつうの三字熟語なので、○○新聞（新聞で終わる語）だけを見る。
  const proper = w3.filter((w) => /(新聞|大学|銀行|会社|商事|工業|放送)$/.test(w.w));
  log[proper.length === 0 ? 'ok' : 'ng'](
    proper.length === 0 ? '三字熟語に会社名・学校名が混ざっていない' : `混入のうたがい：${proper.map((w) => w.w).join('、')}`,
  );
  must('三字熟語に会社名・学校名が混ざっていない', proper.length === 0, proper.map((w) => w.w));

  // ── 検証12：5級（フェーズ8）────────────────────────────────
  log.step('検証12　5級として成り立っているか');
  const g6 = kanji.filter((k) => k.grade === 6);
  log.ok(`6年生の漢字 ${g6.length}字（5級で新しく加わる分）`);
  must('6年生の漢字が191字ある', g6.length === 191, `${g6.length}字`);

  // 5級で出題できない漢字（熟語が1つも確認ずみになっていない字）
  const usableChars = new Set();
  for (const w of words) {
    if (!w.verified) continue;
    for (const c of w.w) usableChars.add(c);
  }
  const blocked5 = kanji.filter((k) => !usableChars.has(k.c));
  const blocked6 = kanji.filter((k) => k.grade <= 5 && !usableChars.has(k.c));
  log[blocked6.length === 0 ? 'ok' : 'ng'](
    blocked6.length === 0
      ? '6級の835字は、すべて出題できる'
      : `6級で出題できない漢字：${blocked6.map((k) => k.c).join('')}`,
  );
  must('6級の漢字がすべて出題できる', blocked6.length === 0, blocked6.map((k) => k.c));
  log[blocked5.length === 0 ? 'ok' : 'warn'](
    blocked5.length === 0
      ? '5級の1026字は、すべて出題できる'
      : `5級で出題できない漢字：${blocked5.map((k) => k.c).join('')}（承認まち）`,
  );
  should('5級の漢字がすべて出題できる', blocked5.length === 0, blocked5.map((k) => k.c));

  // 5級の四字熟語（6級の三字熟語にあたるもの）が足りているか
  const yoji5 = words.filter((w) => w.yoji && w.verified);
  should('5級で使える四字熟語が50語以上ある', yoji5.length >= 50, `${yoji5.length}語`);

  // 誤字訂正（分野べつれんしゅう）に使える「同じ音読みの別の漢字」があるか
  const byOn = new Map();
  for (const k of kanji) {
    for (const o of k.on ?? []) {
      if (!byOn.has(o.kana)) byOn.set(o.kana, new Set());
      byOn.get(o.kana).add(k.c);
    }
  }
  const sharedOn = [...byOn.values()].filter((set) => set.size >= 2).length;
  log.ok(`同じ音読みをもつ漢字の組が ${sharedOn}とおり（誤字訂正・同音異字に使う）`);
  must('同じ音読みの組が100とおり以上ある', sharedOn >= 100, `${sharedOn}とおり`);

  // ── まとめ ───────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  const mustList = results.filter((r) => r.level === 'must');
  const shouldList = results.filter((r) => r.level === 'should');
  const mustNg = mustList.filter((r) => !r.ok);
  const shouldNg = shouldList.filter((r) => !r.ok);

  console.log(`【必須】${mustList.length - mustNg.length}/${mustList.length} 合格`);
  console.log(`【要対応】${shouldList.length - shouldNg.length}/${shouldList.length} 合格（残りは保護者の確認まち）`);
  if (shouldNg.length) {
    console.log('\n  人の作業が必要なもの:');
    for (const r of shouldNg) console.log(`   ・${r.name}`);
  }
  if (mustNg.length) {
    console.log('');
    throw new FriendlyError(
      `【必須】の検証が ${mustNg.length}件 落ちました`,
      mustNg.map((r) => `・${r.name}`).join('\n  '),
      `このデータはまだ使えません。上に出ているどの漢字が問題なのかを確認し、\n` +
        `  npm run data:fetch -- --force で元データを取り直してから、もう一度試してください。\n` +
        `  それでも直らない場合は、data/cache/ の中身を消さずに、開発を手伝ってくれる人に相談してください。`,
    );
  }
  console.log('\n\x1b[32m\x1b[1m必須の検証はすべて合格しました。\x1b[0m');
  console.log('次は  npm run data:csv  を実行して、CSVを目で確かめてください。\n');
});
