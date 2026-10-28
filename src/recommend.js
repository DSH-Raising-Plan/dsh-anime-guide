/**
 * Search / recommend helpers over season + multi-source ratings.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export { formatContrastBrief } from './contrast.js';

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '');
}

const TITLE_ALIASES = [
  ['转生史莱姆', '转生变成史莱姆'],
  ['转史莱', '转生变成史莱姆'],
  ['re0', '从零开始的异世界生活'],
  ['从零', '从零开始的异世界生活'],
  ['实教', '实力至上主义的教室'],
  ['孤独摇滚', '孤独摇滚'],
  ['芙莉莲', '葬送'],
  ['葬送', '葬送'],
  ['药屋', '薬屋'],
  ['鬼灭', '鬼滅'],
  ['咒术', '呪術'],
  ['我推', '推しの子'],
];

export function expandQuery(keyword) {
  const q = String(keyword || '').trim();
  if (!q) return [];
  const out = [q];
  const n = norm(q);
  for (const [alias, canon] of TITLE_ALIASES) {
    if (n.includes(norm(alias)) || norm(alias).includes(n)) out.push(canon);
  }
  return [...new Set(out)];
}

export function searchSchedule(schedule, keyword, limit = 12) {
  const queries = expandQuery(keyword).map(norm).filter(Boolean);
  if (!queries.length) return [];
  const hits = [];
  for (const item of schedule || []) {
    const blob = norm(`${item.title} ${item.day} ${item.note} ${item.region}`);
    if (queries.some((q) => blob.includes(q))) hits.push(item);
    if (hits.length >= limit) break;
  }
  return hits;
}

export function searchRatings(ratings, keyword, limit = 12) {
  const queries = expandQuery(keyword).map(norm).filter(Boolean);
  if (!queries.length) return [];
  const hits = [];
  for (const item of ratings || []) {
    const title = norm(item.title);
    if (queries.some((q) => title.includes(q))) hits.push(item);
    if (hits.length >= limit) break;
  }
  return hits;
}

/**
 * 统一素材检索：yuc 新番表 + 各评分源（番库 / Bangumi / MAL）。
 * @param {object} season
 * @param {object|object[]} ratingsSources 单个 {ratings} 或数组
 */
export function searchCorpus(season, ratingsSources, keyword, { limit = 12 } = {}) {
  const scheduleHits = searchSchedule(season?.schedule || [], keyword, limit);
  const lists = Array.isArray(ratingsSources)
    ? ratingsSources
    : ratingsSources
      ? [ratingsSources]
      : [];
  const ratingHits = [];
  for (const src of lists) {
    ratingHits.push(...searchRatings(src?.ratings || [], keyword, limit));
  }
  const byTitle = new Map();

  for (const r of ratingHits) {
    const key = norm(r.title);
    const prev = byTitle.get(key);
    const entry = {
      title: r.title,
      from_season: false,
      from_ratings: true,
      score: r.score,
      rank: r.rank,
      votes: r.votes,
      url: r.url,
      source: r.source || '',
      region: r.region || '',
      day: '',
      time: '',
      note: '',
      ranks: { [r.source || 'ratings']: r.rank },
      scores: { [r.source || 'ratings']: r.score },
    };
    if (prev) {
      prev.ranks[r.source || 'ratings'] = r.rank;
      prev.scores[r.source || 'ratings'] = r.score;
      if ((r.score || 0) > (prev.score || 0)) {
        prev.score = r.score;
        prev.rank = r.rank;
        prev.url = r.url || prev.url;
        prev.source = [prev.source, r.source].filter(Boolean).join('+');
      } else if (r.source && prev.source && !prev.source.includes(r.source)) {
        prev.source = `${prev.source}+${r.source}`;
      }
      if (r.region && prev.region && r.region !== prev.region) prev.region = 'both';
    } else {
      byTitle.set(key, entry);
    }
  }
  for (const s of scheduleHits) {
    const key = norm(s.title);
    const prev = byTitle.get(key);
    if (prev) {
      prev.from_season = true;
      prev.day = s.day;
      prev.time = s.time;
      prev.note = s.note;
      prev.air_region = s.region;
    } else {
      byTitle.set(key, {
        title: s.title,
        from_season: true,
        from_ratings: false,
        score: null,
        rank: null,
        votes: '',
        url: '',
        source: '',
        region: '',
        day: s.day,
        time: s.time,
        note: s.note,
        air_region: s.region,
        ranks: {},
        scores: {},
      });
    }
  }

  return [...byTitle.values()]
    .sort((a, b) => {
      const ao = a.from_season && a.from_ratings ? 2 : a.from_ratings || a.from_season ? 1 : 0;
      const bo = b.from_season && b.from_ratings ? 2 : b.from_ratings || b.from_season ? 1 : 0;
      if (ao !== bo) return bo - ao;
      return (b.score || 0) - (a.score || 0);
    })
    .slice(0, limit);
}

export function filterByDay(schedule, dayHint) {
  const d = String(dayHint || '').trim();
  if (!d) return schedule || [];
  return (schedule || []).filter((x) => String(x.day || '').includes(d));
}

export function topRated(ratings, limit = 10) {
  return [...(ratings || [])]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);
}

export function formatSeasonBrief(season, { maxItems = 20 } = {}) {
  const lines = [
    `【${season.season_label || '新番'}】共 ${season.total_count ?? (season.schedule || []).length} 部`,
    `来源: ${season.source_url || 'yuc.wiki'}`,
  ];
  const items = (season.schedule || []).slice(0, maxItems);
  for (const it of items) {
    const head = [it.day, it.time].filter(Boolean).join(' ');
    lines.push(`- ${head ? `${head} · ` : ''}${it.title}${it.note ? `（${it.note}）` : ''}`);
  }
  if ((season.schedule || []).length > maxItems) {
    lines.push(`…还有 ${(season.schedule || []).length - maxItems} 部未列出`);
  }
  return lines.join('\n');
}

export function formatRatingsBrief(data, { maxItems = 15 } = {}) {
  const rows = (data.ratings || []).slice(0, maxItems);
  const label = data.source === 'bangumi'
    ? 'Bangumi 排名榜'
    : data.source === 'mal'
      ? 'MyAnimeList Top Anime'
      : `番库评分榜 · ${data.scope || 'quarter'}`;
  const region = data.region === 'international' ? '国际' : data.region === 'domestic' ? '国内' : '';
  const lines = [
    `【${label}${region ? ` · ${region}` : ''}】TOP ${rows.length}`,
    `来源: ${data.source_url || ''}`,
  ];
  for (const r of rows) {
    const jp = r.title_jp ? ` / ${r.title_jp}` : '';
    lines.push(`#${r.rank} ${r.title}${jp} · ${r.score}${r.votes ? `（${r.votes}）` : ''}`);
  }
  return lines.join('\n');
}

export function formatSearchBrief(hits, keyword) {
  if (!hits?.length) {
    return `在新番表与评分榜（番库 / Bangumi / MAL）中都没找到「${keyword}」`;
  }
  const lines = [`检索「${keyword}」共 ${hits.length} 条（yuc + 番库 + Bangumi + MAL）：`];
  for (const h of hits) {
    const tags = [];
    if (h.from_season) tags.push('本季表');
    if (h.from_ratings) {
      const bits = Object.entries(h.ranks || {})
        .map(([src, rk]) => `${src}#${rk}`)
        .join('/');
      tags.push(bits || `评分#${h.rank ?? '?'}`, String(h.score ?? ''));
      if (h.region) tags.push(h.region === 'both' ? '国内外' : h.region === 'international' ? '国际' : '国内');
    }
    const when = [h.day, h.time].filter(Boolean).join(' ');
    lines.push(`- ${h.title}${when ? ` · ${when}` : ''}${tags.length ? ` 〔${tags.filter(Boolean).join(' · ')}〕` : ''}`);
  }
  return lines.join('\n');
}

/**
 * Cross-recommend: prefer titles that appear in both season schedule and high ratings.
 */
export function recommend(season, ratingsData, { keyword = '', day = '', limit = 8 } = {}) {
  let schedule = season?.schedule || [];
  if (day) schedule = filterByDay(schedule, day);
  if (keyword) schedule = searchSchedule(schedule, keyword, 50);

  const ratings = ratingsData?.ratings || [];
  const ratingMap = new Map(ratings.map((r) => [norm(r.title), r]));

  // 若季表没有命中，退回评分榜检索结果
  if (keyword && !schedule.length) {
    return searchRatings(ratings, keyword, limit).map((r) => ({
      title: r.title,
      day: '',
      time: '',
      note: '',
      score: r.score,
      votes: r.votes,
      rating_url: r.url,
      rank: r.rank,
      overlap: false,
      from_ratings_only: true,
    }));
  }

  const scored = [];
  for (const item of schedule) {
    const r = ratingMap.get(norm(item.title));
    scored.push({
      ...item,
      score: r?.score ?? null,
      votes: r?.votes ?? '',
      rating_url: r?.url ?? '',
      rank: r?.rank ?? null,
      overlap: Boolean(r),
    });
  }

  scored.sort((a, b) => {
    if (a.overlap !== b.overlap) return a.overlap ? -1 : 1;
    return (b.score || 0) - (a.score || 0);
  });

  return scored.slice(0, limit);
}
