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
import { loadApprovals, APPROVAL_FILES } from './lib/approvals.mjs';
import { extractFromTgz } from './lib/untar.mjs';
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
    // 部首の候補（KanjiVG が「これが部首」と印をつけているもの）
    const rad = svg.match(/kvg:element="([^"]+)"(?=[^>]*kvg:radical="general")/);
    const radOriginal = svg.match(/kvg:original="([^"]+)"(?=[^>]*kvg:radical="general")/);
    // その漢字を組み立てている部品ぜんぶ。
    // 部首が本当にこの漢字に含まれているかの裏取りに使う。
    const parts = new Set([
      ...[...svg.matchAll(/kvg:element="([^"]+)"/g)].map((m) => m[1]),
      ...[...svg.matchAll(/kvg:original="([^"]+)"/g)].map((m) => m[1]),
    ]);
    strokes.set(c, {
      paths,
      parts,
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

// ────────────────────────────────────────────────────────────
// 手で用意したデータ（data/manual/）
// ────────────────────────────────────────────────────────────

/**
 * 対義語・類義語と、熟語の構成を読みこむ。
 *
 * 語そのものは出典データから取りますが、
 * 「対義語である」「ウの構成である」という判断だけは出典がありません。
 * そのため、保護者が確認するまで出題されません（data/approvals/）。
 */
async function loadManual(root) {
  const read = async (name, fallback) => {
    try {
      return JSON.parse(await readFile(path.join(root, 'data/manual', name), 'utf8'));
    } catch {
      log.warn(`data/manual/${name} が読めないので、この分野はとばします`);
      return fallback;
    }
  };
  const pairs = await read('pairs.json', { opposite: [], similar: [] });
  const kozo = await read('kozo.json', { ア: [], イ: [], ウ: [], エ: [] });
  const n =
    (pairs.opposite?.length ?? 0) + (pairs.similar?.length ?? 0) +
    ['ア', 'イ', 'ウ', 'エ'].reduce((a, t) => a + (kozo[t]?.length ?? 0), 0);
  log.ok(`手で用意したデータを読みこみました（対義語・類義語 ${(pairs.opposite?.length ?? 0) + (pairs.similar?.length ?? 0)}組 / 熟語の構成 ${n - (pairs.opposite?.length ?? 0) - (pairs.similar?.length ?? 0)}語）`);
  return { pairs, kozo };
}

// ────────────────────────────────────────────────────────────
// 国語辞典（JMdict）の分類
// ────────────────────────────────────────────────────────────

/**
 * 国語辞典から、語の分類を読みこむ。
 *   yoji     … 四字熟語（辞典が「四字熟語」と分類しているもの）
 *   proper   … 固有名詞（人名・地名・会社名・作品名など）
 * 「朝日新聞」のような固有名詞を三字熟語・四字熟語に混ぜないために使います。
 */
async function loadJmdictTags() {
  let buf;
  try {
    buf = await readFile(path.join(CACHE, 'jmdict.json.tgz'));
  } catch {
    throw new FriendlyError(
      '国語辞典のデータ（jmdict.json.tgz）が見つかりません',
      'data/cache/jmdict.json.tgz が無いため、四字熟語を作れません。',
      '先に  npm run data:fetch  を実行してください。',
    );
  }
  let json;
  try {
    const inner = extractFromTgz(buf, (n) => n.endsWith('.json'));
    if (!inner) throw new Error('中にJSONが入っていません');
    json = JSON.parse(inner.toString('utf8'));
  } catch (e) {
    throw new FriendlyError(
      '国語辞典のデータを読み取れませんでした',
      `jmdict.json.tgz の中身が想定と違います（${e.message}）`,
      'npm run data:fetch -- --force を実行して、取り直してみてください。',
    );
  }
  const PROPER = new Set([
    'place', 'surname', 'given', 'person', 'organization', 'company',
    'product', 'work', 'ship', 'creat', 'char', 'ev', 'group', 'doc', 'obj', 'serv',
  ]);
  // 出題に向かない分類（古語・まれな語・くだけた言い方・下品な語 など）
  const AVOID = new Set(['arch', 'obs', 'rare', 'sl', 'm-sl', 'net-sl', 'vulg', 'derog', 'joc', 'obsc']);
  const yoji = new Set();
  const properAll = new Map(); // 語 → [その語の意味が すべて固有名詞か]
  const avoidAll = new Map();
  for (const w of json.words ?? []) {
    const senses = w.sense ?? [];
    if (senses.length === 0) continue;
    const isYoji = senses.some((s) => (s.misc ?? []).includes('yoji'));
    // 「意味のどれか1つでも古語」ではなく「意味がぜんぶ古語」のときだけ のぞく。
    // （「最後」のように、ふつうの意味と古い意味の両方をもつ語を落とさないため）
    const allProper = senses.every((s) => (s.misc ?? []).some((m) => PROPER.has(m)));
    const allAvoid = senses.every((s) => (s.misc ?? []).some((m) => AVOID.has(m)));
    for (const k of w.kanji ?? []) {
      const text = k.text;
      if (isYoji) yoji.add(text);
      // 同じ語が複数の見出しに出てくることがあるので、
      // 「1つでも ふつうの見出しがあれば のぞかない」ようにする
      properAll.set(text, (properAll.get(text) ?? true) && allProper);
      avoidAll.set(text, (avoidAll.get(text) ?? true) && allAvoid);
    }
  }
  const proper = new Set([...properAll].filter(([, v]) => v).map(([k]) => k));
  const avoid = new Set([...avoidAll].filter(([, v]) => v).map(([k]) => k));
  log.ok(`国語辞典の分類を読みこみました（四字熟語 ${yoji.size}語 / 固有名詞 ${proper.size}語）`);
  return { yoji, proper, avoid };
}

// ────────────────────────────────────────────────────────────
// 部首（KANJIDIC2 の部首番号 ＋ 漢検漢字辞典の部首名）
// ────────────────────────────────────────────────────────────

/**
 * 部首214種類の名称を読みこむ。
 * 康熙部首の N番目は、Unicode では U+2F00 + (N-1) と決まっているので、
 * その符号位置で名称表と結びつけます。
 */
async function loadRadicalNames() {
  const csv = await readCache('bushu-list.csv');
  const byCodePoint = new Map();
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/);
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    if (cols.length < 5) continue;
    const [, strokes, radical, name, cp] = cols;
    const m = /^U\+([0-9A-Fa-f]+)/.exec(cp.trim());
    if (!m) continue;
    byCodePoint.set(parseInt(m[1], 16), {
      radical: radical.trim(),
      name: name.trim(),
      strokes: Number(strokes),
    });
  }
  if (byCodePoint.size < 200) {
    throw new FriendlyError(
      `部首の名称が ${byCodePoint.size}件 しか読めませんでした`,
      '214件あるはずです。配布元のファイルの形が変わった可能性があります。',
      'npm run data:fetch -- --force を実行して、取り直してみてください。',
    );
  }
  log.ok(`部首の名称を読みこみました（${byCodePoint.size}件）`);

  /** 康熙部首の番号 → { radical, name } */
  return (num) => {
    // 漢検漢字辞典では「⼢（35番）」を「⼡（34番）」に統合している
    const n = num === 35 ? 34 : num;
    return byCodePoint.get(0x2f00 + n - 1) ?? null;
  };
}

/** KANJIDIC2 から、漢字ごとの部首番号を読みこむ */
async function loadKanjidic2() {
  let buf;
  try {
    buf = await readFile(path.join(CACHE, 'kanjidic2.json.tgz'));
  } catch {
    throw new FriendlyError(
      '部首のデータ（kanjidic2.json.tgz）が見つかりません',
      'data/cache/kanjidic2.json.tgz が無いため、部首を作れません。',
      '先に  npm run data:fetch  を実行してください。',
    );
  }
  let json;
  try {
    const inner = extractFromTgz(buf, (n) => n.endsWith('.json'));
    if (!inner) throw new Error('中にJSONが入っていません');
    json = JSON.parse(inner.toString('utf8'));
  } catch (e) {
    throw new FriendlyError(
      '部首のデータを読み取れませんでした',
      `kanjidic2.json.tgz の中身が想定と違います（${e.message}）`,
      'npm run data:fetch -- --force を実行して、取り直してみてください。',
    );
  }
  const map = new Map();
  for (const c of json.characters ?? []) {
    const cls = (c.radicals ?? []).find((r) => r.type === 'classical');
    if (cls) map.set(c.literal, cls.value);
  }
  log.ok(`部首の番号を読みこみました（${map.size}字ぶん）`);
  return map;
}

/**
 * 漢検漢字辞典の「級」を読みこむ。
 * こちらの級わりあて（学年別配当表から作ったもの）が正しいか確かめるために使います。
 */
async function loadKankenLevels() {
  const csv = await readCache('kanken-jiten.csv');
  const KYU_GRADE = { '10級': 1, '9級': 2, '8級': 3, '7級': 4, '6級': 5, '5級': 6 };
  const map = new Map();
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/);
  const header = lines[0].split(',');
  const iType = header.indexOf('字体');
  const iChar = header.indexOf('漢字テキスト');
  const iKyu = header.indexOf('漢検級');
  if (iType < 0 || iChar < 0 || iKyu < 0) {
    log.warn('漢検漢字辞典の列が見つからないので、級の照合はとばします');
    return map;
  }
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    if (cols[iType] !== '親字') continue;
    const ch = (cols[iChar] ?? '').trim();
    const g = KYU_GRADE[(cols[iKyu] ?? '').trim()];
    if (ch && g) map.set(ch, g);
  }
  log.ok(`漢検漢字辞典の級を読みこみました（1〜5級ぶん ${map.size}字）`);
  return map;
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

  log.step('1/7 学年別漢字配当表');
  const grades = await loadGrades();

  log.step('2/7 常用漢字表（音読み・訓読み）');
  const joyo = await loadJoyo();

  log.step('3/7 筆順データ（KanjiVG）');
  const chars = [...grades.keys()];
  const kvg = await loadKanjiVG(chars);

  log.step('4/7 熟語の読み');
  const { map: furiMap, per: furiPer } = await loadFurigana();
  const { map: nameMap, per: namePer } = await loadFurigana('JmnedictFurigana.txt');
  const jukujikun = collectJukujikun(joyo);
  log.ok(`常用漢字表の付表（熟字訓）を読み込みました（${jukujikun.size}語）`);

  log.step('5/7 語の使用頻度');
  const freqRank = await loadFrequency();

  log.step('6/7 部首・級の照合・国語辞典の分類');
  const jmTags = await loadJmdictTags();
  const manual = await loadManual(ROOT);
  const radicalName = await loadRadicalNames();
  const radicalNum = await loadKanjidic2();
  const kankenLevels = await loadKankenLevels();

  log.step('7/7 まとめて書き出し');
  const approvals = await loadApprovals(ROOT, 'word');
  const approvedCount = [...approvals.values()].filter((a) => a.approved).length;
  if (approvals.size > 0) {
    log.ok(`${APPROVAL_FILES.word}：${approvals.size}件のうち ${approvedCount}件が承認ずみ`);
  }
  const radicalApprovals = await loadApprovals(ROOT, 'radical');
  await ensureDir(OUT_DATA);
  await ensureDir(OUT_STROKES);

  /**
   * 1字ぶんの部首を組み立てる。
   *   source   … どこから来たか
   *   verified … 出題してよいか（2つの出典が一致したものだけ true）
   */
  const VARIANT = {
    // KanjiVG が使う字形 → 康熙部首の代表字
    氵: '水', 亻: '人', 扌: '手', 忄: '心', 犭: '犬', 艹: '艸', 辶: '辵', '⻌': '辵',
    糹: '糸', 訁: '言', 飠: '食', 灬: '火', '⺣': '火', 爫: '爪', '⺗': '心', '⺝': '肉',
    '⻏': '邑', '⻂': '衣', 衤: '衣', 礻: '示', '⺮': '竹', '⺈': '刀', 刂: '刀',
    '⺊': '卜', '⺤': '爪', '⺪': '疋', '⺬': '示', '⻑': '長',
  };
  /** 部首ブロックの字（⽲）を、ふつうの漢字（禾）に寄せる */
  const toPlain = (ch) => ch.normalize('NFKC');
  /** 新字体・旧字体の見た目のちがいを吸収する（青と靑 など） */
  const sameShape = (a, b) => a === b || a.normalize('NFKC') === b.normalize('NFKC');

  let radAgree = 0;
  let radSelf = 0;
  let radPart = 0;
  const radCheck = [];

  function buildRadical(c, kvg) {
    const num = radicalNum.get(c);
    const info = num ? radicalName(num) : null;
    if (!info) {
      radCheck.push({ c, reason: '出どころが見つからない', got: '', vg: kvg.radicalCandidate ?? '' });
      return {
        radical: null, radicalName: null, radicalNumber: null,
        radicalSource: null, radicalVerified: false,
      };
    }
    const plain = toPlain(info.radical);
    const vg = kvg.radicalCandidate;
    const vgOrig = kvg.radicalOriginal;

    let ok = false;
    let why = '';
    if (sameShape(plain, c)) {
      // その漢字じたいが部首（山・口・田 など）。まちがえようがない
      ok = true;
      why = 'この漢字じたいが部首';
      radSelf++;
    } else if (vg && [...new Set([vg, VARIANT[vg], vgOrig].filter(Boolean))]
      .some((x) => sameShape(x, plain))) {
      // KanjiVG も「これが部首」と印をつけている
      ok = true;
      why = 'KANJIDIC2 と KanjiVG が一致';
      radAgree++;
    } else if (kvg.parts && [...kvg.parts].some((x) => sameShape(x, plain))) {
      // 印はついていないが、その部首が この漢字の部品として たしかに入っている。
      // まったく関係ない部首になっている、という取りちがえは これで防げる。
      ok = true;
      why = '部首が この漢字の部品として入っていることを確認';
      radPart++;
    }
    if (!ok) {
      radCheck.push({
        c,
        reason: vg ? 'KanjiVG と食いちがう' : 'KanjiVG に照合できる候補が無い',
        got: `${plain}（${info.name}）`,
        vg: vg ?? '',
      });
    }
    const approved = radicalApprovals.get(`${c}|${plain}`)?.approved === true;
    return {
      radical: plain,
      radicalName: info.name,
      radicalNumber: num,
      radicalSource: 'KANJIDIC2（康熙214部首）＋『漢検漢字辞典』の部首名',
      radicalNote: why || (approved ? '保護者が確認ずみ' : undefined),
      radicalVerified: ok || approved,
    };
  }

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
        // 部首は KANJIDIC2（康熙214部首）が出どころ。名称は漢検漢字辞典の部首一覧から。
        // KanjiVG の推定とも照合して、どれくらい確かかを記録する。
        ...buildRadical(c, k),
      };
    })
    .sort((a, b) => a.grade - b.grade || a.order - b.order);

  // 級のわりあてが、漢検漢字辞典と合っているか確かめる
  if (kankenLevels.size > 0) {
    const bad = [];
    for (const k of kanji) {
      const g = kankenLevels.get(k.c);
      if (g !== undefined && g !== k.grade) bad.push(`${k.c}（こちら${k.grade}年 / 漢検${g}年相当）`);
    }
    const missing = kanji.filter((k) => !kankenLevels.has(k.c)).map((k) => k.c);
    if (bad.length || missing.length) {
      throw new FriendlyError(
        `級のわりあてが『漢検漢字辞典』と食いちがっています`,
        `食いちがい ${bad.length}字：${bad.slice(0, 15).join('、')}\n` +
          `  漢検漢字辞典に無い字 ${missing.length}字：${missing.slice(0, 15).join('')}`,
        `docs/kanken-spec.md を読み、どちらが正しいか確かめてください。\n` +
          `  正しいと分かるまで、このデータは使わないでください。`,
      );
    }
    log.ok(`級のわりあてが『漢検漢字辞典』と1026字すべて一致しました`);
  }

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

  // ── 手で用意したデータが使う語を、辞典から取りこむ ──
  // 「消火」「深海」のように、対義語・熟語の構成で使いたい語を
  // 出典つき（辞典に読みがある）のまま足します。
  const manualWords = new Set([
    ...(manual.pairs.opposite ?? []).flat(),
    ...(manual.pairs.similar ?? []).flat(),
    ...['ア', 'イ', 'ウ', 'エ'].flatMap((t) => manual.kozo[t] ?? []),
  ]);
  let manualAdded = 0;
  for (const w of manualWords) {
    if (wordSrc.has(w)) continue;
    const cs = [...w];
    if (!cs.every(isKanji) || !cs.every((c) => grades.has(c))) continue;
    if (!furiMap.has(w)) continue;
    wordSrc.set(w, '国語辞典(JMdict)｜対義語・熟語の構成で使う語');
    manualAdded++;
  }
  if (manualAdded) log.info(`対義語・熟語の構成で使う語を ${manualAdded}語 足しました`);

  // ── よく使う二字熟語を辞典から足す ──
  // 常用漢字表の「用例」だけだと「全体」「終了」のような ふつうの語が入りません。
  // 読み問題・書き取り・対義語のもとになるので、よく使う順に足します。
  let niji = 0;
  for (const { w } of freqCandidates) {
    if ([...w].length !== 2) continue;
    if (niji >= 1400) break;
    if (wordSrc.has(w)) continue;
    if (jmTags.proper.has(w) || jmTags.avoid.has(w)) continue;
    if (nameMap.has(w) && !furiMap.has(w)) continue; // 人名・地名だけの語は使わない
    wordSrc.set(w, '国語辞典(JMdict)｜よく使う二字熟語');
    niji++;
  }
  log.info(`よく使う二字熟語を ${niji}語 足しました`);

  // ── 三字熟語（6級の(六)で出る）──
  //
  // 本番の三字熟語は「美術館・無許可・平均化・責任的…」のように、
  // 頭か お尻に きまった字がつく形がほとんどです。
  // その形にあてはまる語だけを集めることで、
  // 「北海道」「名古屋」のような地名や、「◯◯省」「◯◯党」のような
  // 役所・政党の名前が まぎれこまないようにしています。
  const SANJI_PREFIX = [...'不無未非大小高低新再半全最好総各初真'];
  const SANJI_SUFFIX = [...'的性化感者物品心力館所場家会式線料費数法書生学科室店員機庫車紙具'];
  // 子どもの練習に向かない話題は のぞく
  const SANJI_NG = /性愛|少女|少年愛|暴力|酒|煙草|賭|殺|死体|裸/;

  let sanji = 0;
  for (const { w } of freqCandidates) {
    const cs = [...w];
    if (cs.length !== 3) continue;
    if (sanji >= 220) break;
    if (wordSrc.has(w)) continue;
    if (jmTags.proper.has(w) || jmTags.avoid.has(w)) continue;
    // 固有名詞辞典にある語（地名・人名）は使わない
    if (nameMap.has(w)) continue;
    if (SANJI_NG.test(w)) continue;
    if (!SANJI_PREFIX.includes(cs[0]) && !SANJI_SUFFIX.includes(cs[2])) continue;
    wordSrc.set(w, '国語辞典(JMdict)｜三字熟語');
    sanji++;
  }

  // ── 四字熟語（5級の(六)で出る）──
  // 辞典が「四字熟語」と分類しているものだけを使う（有名無実・以心伝心 など）。
  // 「東京大学」のような ただの4字の語は入りません。
  const yojiRanked = [...jmTags.yoji]
    .filter((w) => {
      const cs = [...w];
      return cs.length === 4 && cs.every(isKanji) && cs.every((c) => grades.has(c))
        && !jmTags.proper.has(w) && !jmTags.avoid.has(w) && furiMap.has(w);
    })
    .sort((a, b) => (freqRank.get(a) ?? 1e9) - (freqRank.get(b) ?? 1e9));
  let yoji = 0;
  for (const w of yojiRanked) {
    if (yoji >= 220) break;   // 5級で必要な数を考えて、よく使うものから220語まで
    if (wordSrc.has(w)) continue;
    wordSrc.set(w, '国語辞典(JMdict)｜四字熟語');
    yoji++;
  }
  log.info(`三字熟語 ${sanji}語・四字熟語 ${yoji}語 を集めました（固有名詞はのぞいてあります）`);

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
    // 読みがひらがなでない語（「香港＝ホンコン」のような外来の地名）は使わない。
    // 漢検の読み問題はひらがなで答えるため。
    const list = [...readings].filter((r) => /^[ぁ-ゖー]+$/.test(r));
    if (list.length === 0) { wordsNoReading.push(w); continue; }
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
      // 何字の熟語か（二字／三字／四字）。出題の分野わけに使う
      n: [...w].length,
      // 辞典が「四字熟語」と分類しているか
      yoji: jmTags.yoji.has(w) ? true : undefined,
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

  // ── 対義語・類義語 ──
  // 語が出典データにあり、両方が同じ級で使えるものだけを採用する。
  // 関係そのものは保護者の確認まちなので verified は承認ファイルで決まる。
  const wordByText = new Map(words.map((w) => [w.w, w]));
  const pairApprovals = await loadApprovals(ROOT, 'pair');
  const pairs = [];
  for (const kind of ['opposite', 'similar']) {
    for (const [a, b] of manual.pairs[kind] ?? []) {
      const wa = wordByText.get(a);
      const wb = wordByText.get(b);
      if (a === b || !wa || !wb || !wa.verified || !wb.verified) continue;
      const key = `${a}|${b}`;
      pairs.push({
        kind: kind === 'opposite' ? 'tai' : 'rui',
        a, b,
        ra: wa.r, rb: wb.r,
        lv: Math.min(wa.lv, wb.lv) === 6 && wa.lv === 6 && wb.lv === 6 ? 6 : 5,
        verified: pairApprovals.get(key)?.approved === true,
      });
    }
  }

  // ── 熟語の構成 ──
  const kozoApprovals = await loadApprovals(ROOT, 'kozo');
  const kozo = [];
  for (const type of ['ア', 'イ', 'ウ', 'エ']) {
    for (const w of manual.kozo[type] ?? []) {
      const e = wordByText.get(w);
      if (!e || !e.verified) continue;
      kozo.push({
        w, r: e.r, type, lv: e.lv,
        verified: kozoApprovals.get(`${w}|${type}`)?.approved === true,
      });
    }
  }

  meta.counts.pairs = pairs.length;
  meta.counts.pairsVerified = pairs.filter((p) => p.verified).length;
  meta.counts.kozo = kozo.length;
  meta.counts.kozoVerified = kozo.filter((k) => k.verified).length;
  meta.counts.radicalVerified = kanji.filter((k) => k.radicalVerified).length;

  await safeWriteJson(path.join(OUT_DATA, 'kanji.json'), { meta, kanji });
  await safeWriteJson(path.join(OUT_DATA, 'words.json'), { meta, words });
  await safeWriteJson(path.join(OUT_DATA, 'pairs.json'), { meta, pairs });
  await safeWriteJson(path.join(OUT_DATA, 'kozo.json'), { meta, kozo });

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
  log.ok(
    `部首 ${kanji.length - radMissing}字（出題できる ${radAgree + radSelf + radPart}字）` +
      `\n      うちわけ：漢字じたいが部首 ${radSelf}字 / 2出典が一致 ${radAgree}字 / 部品として確認 ${radPart}字`,
  );
  if (radCheck.length) {
    log.warn(`部首の確認が必要な漢字：${radCheck.length}字`);
  }
  log.ok(
    `対義語・類義語 ${pairs.length}組（出題できる ${meta.counts.pairsVerified}組）` +
      ` / 熟語の構成 ${kozo.length}語（出題できる ${meta.counts.kozoVerified}語）`,
  );
  if (pairs.length !== meta.counts.pairsVerified || kozo.length !== meta.counts.kozoVerified) {
    log.warn('対義語・熟語の構成は、保護者の確認が済むまで出題されません');
  }
  // 部首の確認リストを、あとで書き出せるように渡す
  meta.radicalCheck = radCheck;
  console.log('\n次は  npm run data:verify  を実行してください。\n');
});
