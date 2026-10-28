/**
 * Domestic (Bangumi / 番库) vs international (MAL) ranking contrast.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { normalizeTitleKey } from './parse.js';

/** Cross-language / nickname bridges for fuzzy match */
const CROSS_ALIASES = [
  ['葬送的芙莉莲', 'sousounofrieren', 'frieren'],
  ['钢之炼金术师', 'fullmetalalchemist', 'fmab', 'hagane'],
  ['命运石之门', 'steinsgate'],
  ['进击的巨人', 'shingekinokyojin', 'attackontitan'],
  ['银魂', 'gintama'],
  ['星际牛仔', 'cowboybebop', 'カウボーイビバップ'],
  ['攻壳机动队', 'ghostintheshell', '攻殻機動隊'],
  ['新世纪福音战士', 'evangelion', 'eva', '新世紀エヴァンゲリオン'],
  ['凉宫春日', 'haruhi', '涼宮ハルヒ'],
  ['虫师', 'mushishi', '蟲師'],
  ['白箱', 'shirobako'],
  ['乒乓', 'pingpong'],
  ['蓝色恐惧', 'perfectblue'],
  ['千年女优', 'millenniumactress', '千年女優'],
  ['clannad', 'clannadafterstory'],
  ['浪客剑心', 'rurounikenshin', 'るろうに剣心'],
  ['3月的狮子', 'marchcomesinlikealion', '3月のライオン'],
  ['水星领航员', 'aria'],
  ['猎人', 'hunterxhunter'],
  ['鬼灭之刃', 'kimetsunoyaiba', 'demonslayer'],
  ['咒术回战', 'jujutsukaisen'],
  ['从零开始的异世界生活', 'rezero'],
  ['链锯人', 'chainsawman'],
  ['jojo', 'steelballrun', 'ジョジョ'],
  ['银河英雄传说', 'gingaeiyuudensetsu', 'logh'],
  ['猫和老鼠', 'tomandjerry'],
];

function aliasKeys(title) {
  const key = normalizeTitleKey(title);
  const keys = new Set([key]);
  if (!key) return keys;
  for (const group of CROSS_ALIASES) {
    const norms = group.map(normalizeTitleKey);
    if (norms.some((a) => a && (key.includes(a) || a.includes(key)))) {
      for (const a of norms) if (a) keys.add(a);
    }
  }
  return keys;
}

function entryKeys(item) {
  const keys = new Set();
  for (const t of [item.title, item.title_jp, item.title_en].filter(Boolean)) {
    for (const k of aliasKeys(t)) keys.add(k);
  }
  return keys;
}

function overlapScore(aKeys, bKeys, aTitle = '', bTitle = '') {
  let best = 0;
  for (const k of aKeys) {
    if (!k || k.length < 3) continue;
    for (const b of bKeys) {
      if (!b || b.length < 3) continue;
      if (k === b) best = Math.max(best, k.length * 3);
      else if (k.includes(b) || b.includes(k)) best = Math.max(best, Math.min(k.length, b.length));
    }
  }
  if (!best) return 0;
  const an = normalizeTitleKey(aTitle);
  const bn = normalizeTitleKey(bTitle);
  if (an && bn && (an.includes(bn) || bn.includes(an))) best += Math.min(an.length, bn.length);
  // prefer similar title length (避免 银魂' 误配 Gintama: The Final)
  const lenPenalty = Math.abs((an || '').length - (bn || '').length);
  return best * 10 - lenPenalty;
}

/**
 * @param {object[]} domestic  Bangumi and/or fankuhub rows
 * @param {object[]} international  MAL rows
 * @param {{ topN?: number, deltaThreshold?: number }} opts
 */
export function contrastRankings(domestic = [], international = [], {
  topN = 25,
  deltaThreshold = 8,
} = {}) {
  const dom = (domestic || []).slice(0, topN).map((x, i) => ({
    ...x,
    rank: x.rank ?? i + 1,
    _keys: entryKeys(x),
  }));
  const intl = (international || []).slice(0, topN).map((x, i) => ({
    ...x,
    rank: x.rank ?? i + 1,
    _keys: entryKeys(x),
  }));

  const matched = [];
  const usedIntl = new Set();

  for (const d of dom) {
    let best = null;
    let bestScore = 0;
    for (const m of intl) {
      if (usedIntl.has(m.url || m.title)) continue;
      const score = overlapScore(d._keys, m._keys, d.title, m.title);
      if (score <= 0) continue;
      if (!best || score > bestScore || (score === bestScore && m.rank < best.rank)) {
        best = m;
        bestScore = score;
      }
    }
    if (!best) continue;
    usedIntl.add(best.url || best.title);
    const delta = d.rank - best.rank; // >0 → higher on MAL (intl), <0 → higher domestic
    matched.push({
      title_domestic: d.title,
      title_international: best.title,
      domestic_rank: d.rank,
      international_rank: best.rank,
      domestic_score: d.score,
      international_score: best.score,
      rank_delta: delta,
      lean: delta <= -deltaThreshold
        ? 'domestic_favored'
        : delta >= deltaThreshold
          ? 'international_favored'
          : 'aligned',
      domestic_source: d.source || 'domestic',
      international_source: best.source || 'mal',
      domestic_url: d.url || '',
      international_url: best.url || '',
    });
  }

  const domesticOnly = dom
    .filter((d) => !matched.some((m) => m.title_domestic === d.title))
    .map((d) => ({
      title: d.title,
      rank: d.rank,
      score: d.score,
      source: d.source,
      url: d.url,
      note: '国内榜靠前，国际榜 TOP 段未匹配到同名条目',
    }));

  const internationalOnly = intl
    .filter((m) => !usedIntl.has(m.url || m.title))
    .map((m) => ({
      title: m.title,
      rank: m.rank,
      score: m.score,
      source: m.source,
      url: m.url,
      note: '国际榜靠前，国内榜 TOP 段未匹配到同名条目',
    }));

  const summary = {
    domestic_top: dom.length,
    international_top: intl.length,
    matched: matched.length,
    domestic_only: domesticOnly.length,
    international_only: internationalOnly.length,
    domestic_favored: matched.filter((m) => m.lean === 'domestic_favored').length,
    international_favored: matched.filter((m) => m.lean === 'international_favored').length,
    aligned: matched.filter((m) => m.lean === 'aligned').length,
  };

  return {
    summary,
    matched: matched.sort((a, b) => Math.abs(b.rank_delta) - Math.abs(a.rank_delta)),
    domestic_only: domesticOnly,
    international_only: internationalOnly,
    domestic_preview: dom.map(({ _keys, ...r }) => r),
    international_preview: intl.map(({ _keys, ...r }) => r),
  };
}

export function formatContrastBrief(result, { maxMatched = 12, maxOnly = 8 } = {}) {
  const s = result?.summary || {};
  const lines = [
    '【国内外番剧榜差异】国内 = Bangumi/番库 · 国际 = MyAnimeList',
    `对照 TOP：国内 ${s.domestic_top ?? 0} / 国际 ${s.international_top ?? 0} · 匹配 ${s.matched ?? 0}`,
    `倾向：国内偏高 ${s.domestic_favored ?? 0} · 国际偏高 ${s.international_favored ?? 0} · 接近 ${s.aligned ?? 0}`,
    `仅国内 TOP：${s.domestic_only ?? 0} · 仅国际 TOP：${s.international_only ?? 0}`,
    '',
    '— 名次落差（|Δrank| 大者优先）—',
  ];
  const leanLabel = {
    domestic_favored: '国内更高',
    international_favored: '国际更高',
    aligned: '接近',
  };
  for (const m of (result.matched || []).slice(0, maxMatched)) {
    lines.push(
      `· ${m.title_domestic} ↔ ${m.title_international}`
      + ` · 国内#${m.domestic_rank}(${m.domestic_score ?? '-'})`
      + ` / 国际#${m.international_rank}(${m.international_score ?? '-'})`
      + ` · Δ${m.rank_delta >= 0 ? '+' : ''}${m.rank_delta}〔${leanLabel[m.lean] || m.lean}〕`,
    );
  }
  if ((result.domestic_only || []).length) {
    lines.push('', '— 国内特色（国际 TOP 未匹配）—');
    for (const d of result.domestic_only.slice(0, maxOnly)) {
      lines.push(`· #${d.rank} ${d.title} · ${d.score ?? ''} (${d.source || 'domestic'})`);
    }
  }
  if ((result.international_only || []).length) {
    lines.push('', '— 国际特色（国内 TOP 未匹配）—');
    for (const m of result.international_only.slice(0, maxOnly)) {
      lines.push(`· #${m.rank} ${m.title} · ${m.score ?? ''} (${m.source || 'mal'})`);
    }
  }
  return lines.join('\n');
}
