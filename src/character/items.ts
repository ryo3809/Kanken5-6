// しばまるの きせかえアイテム。
// おさんぽマップを進むと もらえます。

export interface Item {
  id: string;
  name: string;
  kind: 'hat' | 'collar';
  /** 色（SVGで使う） */
  color: string;
  color2?: string;
}

export const ITEMS: Item[] = [
  // ぼうし
  { id: 'hat-straw',   name: 'むぎわらぼうし', kind: 'hat',    color: '#e6c98a', color2: '#c9a85f' },
  { id: 'hat-knit',    name: 'けいとの ぼうし', kind: 'hat',    color: '#d2694a', color2: '#f0f0f0' },
  { id: 'hat-cap',     name: 'きゃっぷ',       kind: 'hat',    color: '#4a7fa8', color2: '#31607f' },
  { id: 'hat-crown',   name: 'おうかん',       kind: 'hat',    color: '#e8c34a', color2: '#c79f18' },
  // くびわ
  { id: 'collar-red',  name: 'あかい くびわ',  kind: 'collar', color: '#d2694a' },
  { id: 'collar-blue', name: 'あおい くびわ',  kind: 'collar', color: '#4a7fa8' },
  { id: 'collar-green',name: 'みどりの くびわ', kind: 'collar', color: '#4a9d5f' },
  { id: 'collar-bell', name: 'すずの くびわ',   kind: 'collar', color: '#8c6f4a', color2: '#e8c34a' },
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
