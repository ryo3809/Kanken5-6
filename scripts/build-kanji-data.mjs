/**
 * 【2】元データを1つにまとめて、アプリが使う形にするスクリプト
 *
 *   npm run data:build
 *
 * 入力: data/cache/ （npm run data:fetch で取ってきたもの）
 * 出力: src/data/kanji.json, src/data/words.json, public/strokes/grade-N.json
 *
 * 大事な決まり:
 *   ・AIの記憶からデータを書かない。必ず元データから作る
 *   ・出典のないデータには verified: false（＝要校正）の印をつける
 *   ・書き出しは「一時ファイルに書く → 成功したら置きかえる」の順にする
 */
import { readFile, writeFile, rename, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { SOURCES, LICENSES } from './sources.mjs';
import { loadApprovals, APPROVAL_FILE } from './lib/approvals.mjs';
import {
  log, runScript, ensureDir, FriendlyError, isKanji, isKatakanaOnly,
} from './lib/util.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, 'data/cache');
const OUT_DATA = path.join(ROOT, 'src/data');
const OUT_STROKES = path.join(ROOT, 'public/strokes');

/** 公式の学年別配当字数（これと違ったら止める） */
const OFFICIAL_GRADE_COUNTS = { 1: 80, 2: 160, 3: 200, 4: 202, 5: 193, 6: 191 };

/** 壊さない書き出し：一時ファイルに書いてから置きかえる */
async function safeWriteJson(file, data) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, file);
}

async function readCache(name) {
  try {
    return await readFile(path.join(CACHE, name), 'utf8');
  } catch {
    throw new FriendlyError(
      `元データが見つかりません：${name}`,
      `data/cache/${name} が無いため、データを作れません。`,
      `先に  npm run data:fetch  を実行してください。`,
    );
  }
}

// ────────────────────────────────────────────────────────────
// 1. 学年別漢字配当表（出典2つを突き合わせる）
// ────────────────────────────────────────────────────────────
async function loadGrades() {
  const a = new Map();
  const csvA = await readCache('kyoiku-kanji-2017.csv');
  for (const line of csvA.split(/\r?\n/).slice(1)) {
    const [c, g, order] = line.split(',');
    if (c && c.length === 1) a.set(c, { grade: Number(g), order: Number(order) });
  }

  const b = new Map();
  const csvB = await readCache('kyoiku-kanji-mimneko.csv');
  for (const line of csvB.replace(/^﻿/, '').split(/\r?\n/).slice(1)) {
    const [c, g] = line.split(',');
    if (c && c.length === 1) b.set(c, Number(g));
  }

  // 突き合わせ：1字でも食い違ったら止める
  const conflicts = [];
  for (const c of new Set([...a.keys(), ...b.keys()])) {
    const ga = a.get(c)?.grade;
    const gb = b.get(c);
    if (ga !== gb) conflicts.push(`${c}（出典1=${ga ?? 'なし'} / 出典2=${gb ?? 'なし'}）`);
  }
  if (conflicts.length) {
    throw new FriendlyError(
      `2つの出典で、漢字の学年が食い違っています（${conflicts.length}字）`,
      `食い違い: ${conflicts.slice(0, 20).join('、')}${conflicts.length > 20 ? ' ほか' : ''}\n\n` +
        `  どちらかの配布元でデータが変わった可能性があります。`,
      `docs/kanken-spec.md の「出典一覧」を読み、\n` +
        `  文部科学省の学年別漢字配当表と照らし合わせて、どちらが正しいか確かめてください。\n` +
        `  正しいと分かるまで、このデータは使わないでください。`,
    );
  }
  log.ok(`学年別漢字配当表：2つの出典が完全に一致しました（${a.size}字）`);

  // 公式の字数と一致するか
  const counts = {};
  for (const { grade } of a.values()) counts[grade] = (counts[grade] ?? 0) + 1;
  for (const [g, expected] of Object.entries(OFFICIAL_GRADE_COUNTS)) {
    if (counts[g] !== expected) {
      throw new FriendlyError(
        `${g}年生の配当漢字数が公式の数と違います`,
        `公式は ${expected}字ですが、データは ${counts[g] ?? 0}字でした。`,
        `docs/kanken-spec.md を読み、配当表が新しいもの（2020年度〜）か確認してください。`,
      );
    }
  }
  log.ok(`学年ごとの字数が公式と一致：${Object.entries(counts).map(([g, n]) => `${g}年${n}字`).join(' / ')}`);
  return a;
}

// ────────────────────────────────────────────────────────────
// 2. 常用漢字表（音読み・訓読み・用例）
// ────────────────────────────────────────────────────────────
async function loadJoyo() {
  const raw = JSON.parse(await readCache('joyo-honhyo.json'));
  const map = new Map();
  for (const entry of raw) {
    const c = entry?.漢字?.通用字体;
    if (!c) continue;
    const on = [];
    const kun = [];
    for (const r of entry.音訓 ?? []) {
      const kana = r.読み;
      const examples = (r.例 ?? []).filter((x) => typeof x === 'string' && x.length > 0);
      if (!kana) continue;
      if (isKatakanaOnly(kana)) {
        on.push({ kana, examples });
      } else {
        // 送り仮名を用例から割り出す（例: 読=よむ, 用例「読む」→ 送り仮名「む」, 語幹の読み「よ」）
        let okurigana = null;
        let stem = null;
        for (const ex of examples) {
          if (ex.length >= 2 && ex[0] === c) {
            const tail = ex.slice(1);
            if (tail && kana.endsWith(tail) && kana.length > tail.length) {
              okurigana = tail;
              stem = kana.slice(0, kana.length - tail.length);
              break;
            }
          }
        }
        kun.push({ kana, stem, okurigana, examples });
      }
    }
    map.set(c, {
      on, kun,
      futsuhyo: entry.備考?.付表 ?? [],
      todofuken: entry.備考?.都道府県 ?? [],
      ijidokun: (entry.音訓 ?? []).flatMap((r) => r.備考?.異字同訓 ?? []),
    });
  }
  log.ok(`常用漢字表を読み込みました（${map.size}字）`);
  return map;
}

// ────────────────────────────────────────────────────────────
// 3. KanjiVG（筆順・画数・部首の候補）
// ────────────────────────────────────────────────────────────
async function loadKanjiVG(chars) {
  const strokes = new Map();
  const missing = [];
  for (const c of chars) {
    const code = c.codePointAt(0).toString(16).padStart(5, '0');
    let svg;
    try {
      svg = await readFile(path.join(CACHE, 'kanjivg', `${code}.svg`), 'utf8');
    } catch {
      missing.push(c);
      continue;
    }
    // 筆画（<path d="..."> が出てくる順番＝書く順番）
    const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
    // 部首の候補（漢検の部首と一致する保証はないので、必ず要校正あつかい）
    const rad = svg.match(/kvg:element="([^"]+)"(?=[^>]*kvg:radical="general")/);
    const radOriginal = svg.match(/kvg:original="([^"]+)"(?=[^>]*kvg:radical="general")/);
    strokes.set(c, {
      paths,
      radicalCandidate: rad ? rad[1] : null,
      radicalOriginal: radOriginal ? radOriginal[1] : null,
    });
  }
  if (missing.length) {
    throw new FriendlyError(
      `筆順データが足りません（${missing.length}字）`,
      `足りない漢字: ${missing.slice(0, 30).join('')}${missing.length > 30 ? ' ほか' : ''}`,
      `npm run data:fetch を、もう一度実行してください。`,
    );
  }
  log.ok(`筆順データを読み込みました（${strokes.size}字）`);
  return strokes;
}

// ────────────────────────────────────────────────────────────
// 4. 熟語の読み（JmdictFurigana）
// ────────────────────────────────────────────────────────────
async function loadFurigana(fileName = 'JmdictFurigana.txt', quiet = false) {
  const text = await readCache(fileName);
  const map = new Map(); // 語 → Set(読み)
  const per = new Map(); // 語+読み → 1文字ずつの読み
  for (const line of text.replace(/^﻿/, '').split('\n')) {
    const parts = line.trimEnd().split('|');
    if (parts.length !== 3) continue;
    const [word, reading, detail] = parts;
    if (!map.has(word)) map.set(word, new Set());
    map.get(word).add(reading);
    if (!per.has(`${word}|${reading}`)) {
      const slots = {};
      for (const seg of detail.split(';')) {
        const [i, r] = seg.split(':');
        if (i !== undefined && r !== undefined) slots[Number(i)] = r;
      }
      per.set(`${word}|${reading}`, slots);
    }
  }
  if (!quiet) log.ok(`読みのデータを読み込みました（${map.size}語）／${fileName}`);
  return { map, per };
}

/** 常用漢字表の「付表」に載っている熟字訓（今日=きょう など）を集める */
function collectJukujikun(joyo) {
  const set = new Map();
  for (const j of joyo.values()) {
    for (const entry of j.futsuhyo) {
      const m = String(entry).match(/^(.+?)（(.+?)）$/);
      if (m) set.set(m[1], m[2]);
    }
  }
  return set;
}

// ────────────────────────────────────────────────────────────
// 5. 語の使用頻度（よく使う熟語から出題するため）
// ────────────────────────────────────────────────────────────
async function loadFrequency() {
  const text = await readCache('japanese-frequency.txt');
  const rank = new Map();
  let i = 0;
  for (const line of text.split('\n')) {
    const w = line.trim();
    if (!w) continue;
    i++;
    if (!rank.has(w)) rank.set(w, i);
  }
  log.ok(`語の使用頻度リストを読み込みました（${rank.size}語）`);
  return rank;
}

// ────────────────────────────────────────────────────────────
// 組み立て
// ────────────────────────────────────────────────────────────
runScript('データの組み立て', async () => {
  console.log('漢検アプリ｜漢字データの組み立て');
  console.log('='.repeat(60));

  log.step('1/6 学年別漢字配当表');
  const grades = await loadGrades();

  log.step('2/6 常用漢字表（音読み・訓読み）');
  const joyo = await loadJoyo();

  log.step('3/6 筆順データ（KanjiVG）');
  const chars = [...grades.keys()];
  const kvg = await loadKanjiVG(chars);

  log.step('4/6 熟語の読み');
  const { map: furiMap, per: furiPer } = await loadFurigana();
  const { map: nameMap, per: namePer } = await loadFurigana('JmnedictFurigana.txt');
  const jukujikun = collectJukujikun(joyo);
  log.ok(`常用漢字表の付表（熟字訓）を読み込みました（${jukujikun.size}語）`);

  log.step('5/6 語の使用頻度');
  const freqRank = await loadFrequency();

  log.step('6/6 まとめて書き出し');
  const approvals = await loadApprovals(ROOT);
  const approvedCount = [...approvals.values()].filter((a) => a.approved).length;
  if (approvals.size > 0) {
    log.ok(`${APPROVAL_FILE}：${approvals.size}件のうち ${approvedCount}件が承認ずみ`);
  }
  await ensureDir(OUT_DATA);
  await ensureDir(OUT_STROKES);

  // ── 漢字データ ──
  const noJoyo = [];
  const kanji = chars
    .map((c) => {
      const g = grades.get(c);
      const j = joyo.get(c);
      const k = kvg.get(c);
      if (!j) noJoyo.push(c);
      return {
        c,
        grade: g.grade,
        order: g.order,
        // その漢字が「初めて出題対象になる級」。6年配当だけが5級の新出。
        level: g.grade <= 5 ? 6 : 5,
        strokes: k.paths.length,
        on: j?.on ?? [],
        kun: j?.kun ?? [],
        ijidokun: j?.ijidokun ?? [],
        // 部首はKanjiVGの推定値。漢検の部首と一致する保証がないので必ず要校正。
        radical: k.radicalCandidate,
        radicalOriginal: k.radicalOriginal,
        radicalName: null,
        radicalVerified: false,
      };
    })
    .sort((a, b) => a.grade - b.grade || a.order - b.order);

  if (noJoyo.length) {
    throw new FriendlyError(
      `常用漢字表に見つからない漢字があります（${noJoyo.length}字）`,
      `見つからない漢字: ${noJoyo.join('')}\n  教育漢字はすべて常用漢字のはずなので、データがおかしいです。`,
      `npm run data:fetch -- --force で元データを取り直してください。`,
    );
  }

  // ── 熟語データ ──
  // 出どころは3つ。どれも出典があり、どこから来たかを source に必ず記録する。
  //   1. 常用漢字表の「用例」          … 一番信頼できる。無審査で使える
  //   2. 常用漢字表の「都道府県」欄     … 茨城・岡山など。無審査で使える
  //   3. 国語辞典(JMdict)からの補充    … 1と2で熟語が足りない漢字の穴うめ。要校正
  const wordSrc = new Map(); // 語 → source

  const addWord = (word, source) => {
    const cs = [...word];
    if (cs.length < 2 || cs.length > 4) return false;
    if (!cs.every(isKanji)) return false;
    if (!cs.every((c) => grades.has(c))) return false;
    if (!wordSrc.has(word)) wordSrc.set(word, source);
    return true;
  };

  for (const k of kanji) {
    for (const r of [...k.on, ...k.kun]) {
      for (const ex of r.examples) addWord(ex, '常用漢字表');
    }
  }
  // 都道府県名（「茨城県」→「茨城」のように、県・府・都・道を外した形も入れる）
  for (const c of chars) {
    for (const name of joyo.get(c)?.todofuken ?? []) {
      const base = name.replace(/[都道府県]$/, '').replace(/（.*?）/g, '');
      addWord(base, '常用漢字表（都道府県）');
      addWord(name.replace(/（.*?）/g, ''), '常用漢字表（都道府県）');
    }
  }

  /** 語が使える級（6=6級から / 5=5級から）。範囲外なら null */
  const levelOf = (word) => {
    const cs = [...word].filter(isKanji);
    if (!cs.every((c) => grades.has(c))) return null;
    return cs.every((c) => grades.get(c).grade <= 5) ? 6 : 5;
  };

  // 熟語がまだ足りない漢字を、国語辞典から補充する
  const countFor = (targetLevel) => {
    const n = new Map();
    for (const [w] of wordSrc) {
      const lv = levelOf(w);
      if (lv === null) continue;
      if (targetLevel === 6 && lv !== 6) continue;
      for (const c of new Set(w)) n.set(c, (n.get(c) ?? 0) + 1);
    }
    return n;
  };
  // 頻度リストの上位から、教育漢字だけでできた語を拾っておく
  const freqCandidates = [];
  for (const [w, rank] of freqRank) {
    const cs = [...w];
    if (cs.length < 2 || cs.length > 4) continue;
    if (!cs.every(isKanji)) continue;
    if (!cs.every((c) => grades.has(c))) continue;
    if (!furiMap.has(w)) continue;
    freqCandidates.push({ w, rank });
  }
  freqCandidates.sort((a, b) => a.rank - b.rank);

  let filled = 0;
  for (const targetLevel of [6, 5]) {
    const have = countFor(targetLevel);
    const need = chars.filter((c) => {
      if (targetLevel === 6 && grades.get(c).grade > 5) return false;
      return (have.get(c) ?? 0) === 0;
    });
    for (const c of need) {
      let added = 0;
      for (const { w } of freqCandidates) {
        if (added >= 3) break;
        if (!w.includes(c)) continue;
        if (levelOf(w) !== targetLevel && !(targetLevel === 5 && levelOf(w) !== null)) continue;
        if (wordSrc.has(w)) continue;
        wordSrc.set(w, '国語辞典(JMdict)｜要校正');
        added++;
        filled++;
      }
    }
  }
  if (filled) log.info(`熟語が足りない漢字を、国語辞典から ${filled}語 補充しました（要校正）`);

  // 読みをつけて仕上げる
  const words = [];
  const wordsNoReading = [];
  for (const [w, source0] of wordSrc) {
    let source = source0;
    let readings = furiMap.get(w);
    let perMap = furiPer;
    // 国語辞典に無ければ固有名詞辞典（都道府県名など）を見る
    if ((!readings || readings.size === 0) && nameMap.has(w)) {
      readings = nameMap.get(w);
      perMap = namePer;
      if (readings.size > 1) source = `${source} + 固有名詞辞典｜要校正`;
    }
    if (!readings || readings.size === 0) { wordsNoReading.push(w); continue; }
    const list = [...readings];
    const reading = list[0];
    const slots = perMap.get(`${w}|${reading}`) ?? {};
    const cs = [...w];
    // 熟字訓（今日=きょう など）は1文字ずつに分けられないのが正しい姿
    const juku = jukujikun.get(w);
    words.push({
      w,
      r: juku ?? reading,
      p: juku ? cs.map(() => null) : cs.map((_, i) => slots[i] ?? null),
      lv: levelOf(w),
      src: juku ? '常用漢字表（付表・熟字訓）' : source,
      // 使用頻度の順位。小さいほどよく使う語。無い語は出題の優先度を下げる
      freq: freqRank.get(w) ?? null,
      // 読みが複数ある語（読み問題ではどれも正解あつかいにする）
      alt: list.length > 1 ? list : undefined,
      // 熟字訓は1字ずつの読みが無いのが正常。読み問題には使えるが書き取りの部品にはしない
      jukujikun: juku ? true : undefined,
      // 出典が国語辞典・固有名詞辞典のものは、保護者が確かめるまで出題しない。
      // data/word-approvals.csv に「OK」と書かれていれば出題する。
      verified: !source.includes('要校正') || approvals.get(`${w}|${juku ?? reading}`)?.approved === true,
    });
  }
  // よく使う語を先に、頻度不明の語を後ろに
  words.sort((a, b) => (a.freq ?? 1e9) - (b.freq ?? 1e9) || a.w.localeCompare(b.w, 'ja'));

  const meta = {
    generatedAt: new Date().toISOString(),
    counts: {
      kanji: kanji.length,
      kanji6kyu: kanji.filter((k) => k.grade <= 5).length,
      kanji5kyu: kanji.length,
      words: words.length,
      words6kyu: words.filter((w) => w.lv === 6).length,
      wordsVerified: words.filter((w) => w.verified).length,
      wordsNeedReview: words.filter((w) => !w.verified).length,
    },
    sources: SOURCES.map(({ id, what, origin, url }) => ({ id, what, origin, url })),
    licenses: LICENSES,
    caution:
      '部首・部首名は KanjiVG からの推定値で、漢検の部首と一致する保証がありません。' +
      'radicalVerified が false のあいだは出題に使わないでください。',
  };

  await safeWriteJson(path.join(OUT_DATA, 'kanji.json'), { meta, kanji });
  await safeWriteJson(path.join(OUT_DATA, 'words.json'), { meta, words });

  // ── 筆順データ（学年ごとに6ファイルに分ける。1つが大きすぎると読み込みが遅いため）──
  // 先に新しいファイルを全部書ききってから、古い余分なファイルを消す。
  // （途中で失敗しても、それまでの筆順データが消えてしまわないようにするため）
  let strokeBytes = 0;
  const written = new Set();
  for (let g = 1; g <= 6; g++) {
    const obj = {};
    for (const k of kanji.filter((x) => x.grade === g)) obj[k.c] = kvg.get(k.c).paths;
    const name = `grade-${g}.json`;
    const file = path.join(OUT_STROKES, name);
    const body = JSON.stringify({ viewBox: '0 0 109 109', strokes: obj });
    await writeFile(`${file}.tmp`, body);
    await rename(`${file}.tmp`, file);
    written.add(name);
    strokeBytes += Buffer.byteLength(body);
  }
  // 書き終わってから、いま作ったもの以外の古い .json を片づける
  for (const old of await readdir(OUT_STROKES).catch(() => [])) {
    if (old.endsWith('.json') && !written.has(old)) {
      await rm(path.join(OUT_STROKES, old)).catch(() => {});
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  log.ok(`漢字 ${kanji.length}字（6級 ${meta.counts.kanji6kyu}字 / 5級 ${meta.counts.kanji5kyu}字）`);
  log.ok(`熟語 ${words.length}語（6級で使える ${meta.counts.words6kyu}語 / 出題できる ${meta.counts.wordsVerified}語 / 確認まち ${meta.counts.wordsNeedReview}語）`);
  log.ok(`筆順データ 6ファイル 合計 ${(strokeBytes / 1024 / 1024).toFixed(2)}MB`);
  if (wordsNoReading.length) {
    log.warn(`読みが見つからず不採用にした語：${wordsNoReading.length}語（例: ${wordsNoReading.slice(0, 8).join('、')}）`);
  }
  const radMissing = kanji.filter((k) => !k.radical).length;
  log.warn(`部首の候補が取れなかった漢字：${radMissing}字（フェーズ1bで埋めます）`);
  console.log('\n次は  npm run data:verify  を実行してください。\n');
});
