/**
 * しばまる・レベル・おさんぽマップの計算が正しいか確かめるテスト。
 * とくに「減らないこと」「責めないこと」を重点的に見ます。
 */
import {
  EXP, expForLevel, levelFromExp, levelProgress, MAP_SPOTS, mapProgress, stampInfo, unlockedItems,
} from '../../src/lib/gamification.ts';
import { FACES, LINES, pickLine } from '../../src/character/expressions.ts';
import { ITEMS, ITEM_BY_ID } from '../../src/character/items.ts';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ' … ' + extra : ''}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}${extra ? ' … ' + extra : ''}`); }
};

console.log('\n▶ テスト1　まちがえても経験値がもらえる（責めない設計）');
check('読み問題でまちがえても0にならない', EXP.readingWrong > 0, `${EXP.readingWrong}ポイント`);
check('書き取りで「まちがえた」でも0にならない', EXP.writingOther > 0, `${EXP.writingOther}ポイント`);
check('正解のほうが多くもらえる', EXP.readingCorrect > EXP.readingWrong && EXP.writingOk > EXP.writingOther);
check('すべての経験値が0より大きい（減点がない）',
  Object.values(EXP).every((v) => v > 0), Object.entries(EXP).map(([k, v]) => `${k}=${v}`).join(' '));

console.log('\n▶ テスト2　レベル');
check('はじめはレベル1', levelFromExp(0) === 1);
check('レベル1に必要な経験値は0', expForLevel(1) === 0);
let prev = -1;
let monotonic = true;
for (let e = 0; e <= 8000; e += 7) {
  const lv = levelFromExp(e);
  if (lv < prev) monotonic = false;
  prev = lv;
}
check('経験値が増えるとレベルは下がらない', monotonic);
check('必要経験値がだんだん増える',
  [2, 3, 4, 5].every((n) => expForLevel(n + 1) - expForLevel(n) > expForLevel(n) - expForLevel(n - 1)),
  [1,2,3,4,5,6].map((n) => `Lv${n}:${expForLevel(n)}`).join(' '));
const p1 = levelProgress(45);
check('レベルの途中経過が出る', p1.level >= 1 && p1.ratio >= 0 && p1.ratio <= 1,
  `経験値45 → レベル${p1.level}（${p1.current}/${p1.need}）`);
console.log('    レベルの目安:',
  [2, 3, 5, 10, 20].map((n) => `Lv${n}=${expForLevel(n)}pt`).join(' / '));

console.log('\n▶ テスト3　おさんぽマップ');
check('地点が12か所ある', MAP_SPOTS.length === 12, `${MAP_SPOTS.length}か所`);
check('必要な経験値が増える順にならんでいる',
  MAP_SPOTS.every((s, i) => i === 0 || s.exp > MAP_SPOTS[i - 1].exp));
check('はじめの地点は0ポイントで行ける', MAP_SPOTS[0].exp === 0);
check('経験値0では1番目の地点', mapProgress(0).index === 0, mapProgress(0).spot.name);
check('経験値が足りると次の地点へ進む', mapProgress(MAP_SPOTS[1].exp).index === 1, mapProgress(MAP_SPOTS[1].exp).spot.name);
check('さいごまで行くと reachedAll になる', mapProgress(99999).reachedAll === true, mapProgress(99999).spot.name);
let mapMonotonic = true;
let last = -1;
for (let e = 0; e <= 8000; e += 13) {
  const i = mapProgress(e).index;
  if (i < last) mapMonotonic = false;
  last = i;
}
check('経験値が増えるとマップは戻らない', mapMonotonic);

console.log('\n▶ テスト4　ごほうび');
const rewards = MAP_SPOTS.filter((s) => s.reward).map((s) => s.reward as string);
check('ごほうびが8個ある', rewards.length === 8, `${rewards.length}個`);
check('ごほうびの id がすべて実在する', rewards.every((r) => ITEM_BY_ID.has(r)),
  rewards.filter((r) => !ITEM_BY_ID.has(r)).join(',') || 'すべてOK');
check('ごほうびに重複がない', new Set(rewards).size === rewards.length);
check('用意したアイテムはすべて どこかでもらえる',
  ITEMS.every((i) => rewards.includes(i.id)),
  ITEMS.filter((i) => !rewards.includes(i.id)).map((i) => i.name).join(',') || 'すべてもらえる');
check('経験値0では何ももらえていない', unlockedItems(0).length === 0);
check('さいごまで行くと全部そろう', unlockedItems(99999).length === ITEMS.length,
  `${unlockedItems(99999).length}/${ITEMS.length}個`);
let unlockMonotonic = true;
let lastN = -1;
for (let e = 0; e <= 8000; e += 11) {
  const n = unlockedItems(e).length;
  if (n < lastN) unlockMonotonic = false;
  lastN = n;
}
check('もらったものは減らない', unlockMonotonic);

console.log('\n▶ テスト5　スタンプ（休んでも減らない）');
{
  const d = (n: number) => {
    const x = new Date();
    x.setDate(x.getDate() - n);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  const s0 = stampInfo([]);
  check('記録が無いときは0', s0.totalDays === 0 && s0.currentStreak === 0 && s0.bestStreak === 0);

  const s1 = stampInfo([d(0), d(1), d(2)]);
  check('3日続けたら 連続3日', s1.currentStreak === 3 && s1.totalDays === 3, `連続${s1.currentStreak}日`);

  // 5日休んだあと
  const s2 = stampInfo([d(10), d(9), d(8)]);
  check('休んでも「がんばった日」は減らない', s2.totalDays === 3, `${s2.totalDays}日`);
  check('休んでも「さいこう記録」は残る', s2.bestStreak === 3, `${s2.bestStreak}日`);
  check('いまの連続は0になるが、それは前面に出さない設計', s2.currentStreak === 0);

  // 休みをはさんで再開
  const s3 = stampInfo([d(20), d(19), d(18), d(17), d(1), d(0)]);
  check('休みをはさんでも 合計日数は足し算', s3.totalDays === 6, `${s3.totalDays}日`);
  check('さいこう記録は いちばん長い連続', s3.bestStreak === 4, `${s3.bestStreak}日`);
  check('再開した連続も数える', s3.currentStreak === 2, `${s3.currentStreak}日`);

  // 同じ日に何回やっても1日
  const s4 = stampInfo([d(0), d(0), d(0)]);
  check('同じ日に何回やっても1日', s4.totalDays === 1);
}

console.log('\n▶ テスト6　しばまるのことば（責めない・悲しませない）');
{
  const banned = ['だめ', 'ダメ', 'わるい', 'いけない', 'ざんねん', '残念', 'しっぱい', '失敗',
    'できない', 'にがて', 'まけ', 'つづけないと', 'やらないと', 'かなしい', 'さぼ'];
  const all = Object.values(LINES).flat();
  const bad = all.filter((line) => banned.some((b) => line.includes(b)));
  check('責める・悲しませることばが無い', bad.length === 0, bad.join(' / ') || `${all.length}個のことばを確認`);
  check('まちがえたときのことばも前向き',
    LINES.cheer.every((l) => !banned.some((b) => l.includes(b))), LINES.cheer.join(' / '));
  check('表情が6種類ある', Object.keys(FACES).length === 6, Object.keys(FACES).join(','));
  check('悲しい表情・泣き顔が無い',
    !Object.keys(FACES).some((k) => /sad|cry|angry/.test(k)), Object.keys(FACES).join(','));
  check('すべての表情にことばがある', Object.keys(FACES).every((k) => (LINES as Record<string, string[]>)[k]?.length > 0));
  check('ことばが必ず1つ返る', [0, 0.3, 0.99].every((s) => typeof pickLine('happy', s) === 'string'));
}

console.log('\n▶ テスト7　どれくらいで進むか（目安の確認）');
{
  // 1日に読み10問（8問正解）＋書き取り10問（7問できた）＋なぞり3字 をやったとき
  const perDay =
    EXP.firstOfDay +
    8 * EXP.readingCorrect + 2 * EXP.readingWrong +
    7 * EXP.writingOk + 3 * EXP.writingOther +
    3 * EXP.tracingChar;
  console.log(`    1日みっちりやると 約${perDay}ポイント`);
  const days = (target: number) => Math.ceil(target / perDay);
  console.log(`    2番目の地点まで ${days(MAP_SPOTS[1].exp)}日 / まん中(${MAP_SPOTS[6].name}) まで ${days(MAP_SPOTS[6].exp)}日 / ゴールまで ${days(MAP_SPOTS[11].exp)}日`);
  check('2番目の地点に1〜2日でつく（すぐごほうびが来る）', days(MAP_SPOTS[1].exp) <= 2, `${days(MAP_SPOTS[1].exp)}日`);
  check('ゴールが受検までの日数（約75日）で届く', days(MAP_SPOTS[11].exp) <= 75, `${days(MAP_SPOTS[11].exp)}日`);
}

console.log(`\n${'='.repeat(52)}`);
console.log(`合格 ${pass}件 / 不合格 ${fail}件`);
if (fail > 0) process.exitCode = 1;
else console.log('\x1b[32m\x1b[1mすべて合格しました。\x1b[0m');
