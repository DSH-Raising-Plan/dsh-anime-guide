/**
 * dsh-anime-guide — DeepSeek Harness 番剧插件
 * 数据源：yuc.wiki · fankuhub · Bangumi · MyAnimeList
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { pathToFileURL } from 'node:url';
import {
  fetchBangumiRank,
  fetchContrast,
  fetchCorpus,
  fetchMalTop,
  fetchRatings,
  fetchSeason,
} from './fetch.js';
import {
  formatContrastBrief,
  formatRatingsBrief,
  formatSearchBrief,
  formatSeasonBrief,
  recommend,
  searchCorpus,
} from './recommend.js';
import {
  contrastToolSpec,
  ratingsToolSpec,
  recommendToolSpec,
  searchToolSpec,
  seasonToolSpec,
} from './tool-spec.js';

export const name = 'dsh-anime-guide';
export const inject = ['tools'];

export {
  fetchBangumiRank,
  fetchContrast,
  fetchCorpus,
  fetchMalTop,
  fetchRatings,
  fetchSeason,
} from './fetch.js';
export {
  parseBangumiRank,
  parseFankuhubRatings,
  parseMalTopAnime,
  parseYucSeason,
} from './parse.js';
export { contrastRankings, formatContrastBrief } from './contrast.js';

async function loadDefineTool() {
  try {
    const mod = await import('@deepseek-ai/dsh-tools');
    if (mod?.defineTool) return mod.defineTool;
  } catch { /* fall through */ }
  const override = process.env.DSH_TOOLS_PATH;
  if (override) {
    const mod = await import(pathToFileURL(override).href);
    if (mod?.defineTool) return mod.defineTool;
  }
  throw new Error('cannot resolve @deepseek-ai/dsh-tools (set DSH_TOOLS_PATH for local dev)');
}

function clampInt(n, def, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

export async function apply(ctx) {
  const defineTool = await loadDefineTool();

  const season = defineTool({
    ...seasonToolSpec(),
    async execute(args = {}) {
      const data = await fetchSeason({
        query: args.query || '',
        seasonUrl: args.season_url || '',
      });
      const maxItems = clampInt(args.max_items, 20, 5, 80);
      return {
        ...data,
        brief: formatSeasonBrief(data, { maxItems }),
      };
    },
  });

  const ratings = defineTool({
    ...ratingsToolSpec(),
    async execute(args = {}) {
      const source = String(args.source || 'fankuhub').toLowerCase();
      const limit = clampInt(args.limit, 20, 5, 80);

      if (source === 'all') {
        const [fk, bgm, mal] = await Promise.allSettled([
          fetchRatings({ scope: args.scope || 'quarter', limit }),
          fetchBangumiRank({ limit }),
          fetchMalTop({ limit }),
        ]);
        const parts = [];
        const payload = { sources: {} };
        if (fk.status === 'fulfilled') {
          payload.sources.fankuhub = fk.value;
          parts.push(formatRatingsBrief(fk.value, { maxItems: limit }));
        } else {
          parts.push(`【番库】失败：${fk.reason?.message || fk.reason}`);
        }
        if (bgm.status === 'fulfilled') {
          payload.sources.bangumi = bgm.value;
          parts.push(formatRatingsBrief(bgm.value, { maxItems: limit }));
        } else {
          parts.push(`【Bangumi】失败：${bgm.reason?.message || bgm.reason}`);
        }
        if (mal.status === 'fulfilled') {
          payload.sources.mal = mal.value;
          parts.push(formatRatingsBrief(mal.value, { maxItems: limit }));
        } else {
          parts.push(`【MAL】失败：${mal.reason?.message || mal.reason}`);
        }
        return { ...payload, brief: parts.join('\n\n') };
      }

      let data;
      if (source === 'bangumi' || source === 'bgm') {
        data = await fetchBangumiRank({ limit });
      } else if (source === 'mal' || source === 'myanimelist') {
        data = await fetchMalTop({ limit });
      } else {
        data = await fetchRatings({ scope: args.scope || 'quarter', limit });
      }
      return {
        ...data,
        brief: formatRatingsBrief(data, { maxItems: limit }),
      };
    },
  });

  const search = defineTool({
    ...searchToolSpec(),
    async execute(args = {}) {
      const keyword = String(args.keyword || '').trim();
      if (!keyword) throw new Error('keyword is required');
      const limit = clampInt(args.limit, 10, 1, 30);
      const corpus = await fetchCorpus({
        query: args.query || '',
        limit: Math.max(limit, 30),
      });
      const ratingSources = [corpus.bangumi, corpus.fankuhub, corpus.mal].filter(Boolean);
      const hits = searchCorpus(corpus.season, ratingSources, keyword, { limit });
      return {
        keyword,
        hits,
        errors: corpus.errors || {},
        brief: formatSearchBrief(hits, keyword),
      };
    },
  });

  const reco = defineTool({
    ...recommendToolSpec(),
    async execute(args = {}) {
      const limit = clampInt(args.limit, 8, 1, 30);
      const src = String(args.ratings_source || 'bangumi').toLowerCase();
      const seasonData = await fetchSeason({ query: args.query || '' });
      let ratingsData;
      if (src === 'mal') ratingsData = await fetchMalTop({ limit: 40 });
      else if (src === 'fankuhub' || src === 'fanku') {
        ratingsData = await fetchRatings({ limit: 40 });
      } else {
        ratingsData = await fetchBangumiRank({ limit: 40 }).catch(() => fetchRatings({ limit: 40 }));
      }
      const items = recommend(seasonData, ratingsData, {
        keyword: args.keyword || '',
        day: args.day || '',
        limit,
      });
      const lines = items.map((it, i) => {
        const when = [it.day, it.time].filter(Boolean).join(' ');
        const score = it.score != null ? ` · ${it.score}` : '';
        const rank = it.rank != null ? ` #${it.rank}` : '';
        const mark = it.overlap ? '★' : it.from_ratings_only ? '◎' : '·';
        return `${i + 1}. ${mark} ${it.title}${when ? `（${when}）` : ''}${rank}${score}`;
      });
      return {
        items,
        ratings_source: ratingsData.source || src,
        brief: [`【推荐 · ${ratingsData.source || src}】`, ...lines].join('\n'),
      };
    },
  });

  const contrast = defineTool({
    ...contrastToolSpec(),
    async execute(args = {}) {
      const topN = clampInt(args.top_n, 25, 10, 50);
      const limit = clampInt(args.limit, 40, 15, 80);
      const deltaThreshold = clampInt(args.delta_threshold, 8, 3, 30);
      const result = await fetchContrast({ topN, limit, deltaThreshold });
      return {
        ...result,
        brief: formatContrastBrief(result),
      };
    },
  });

  const disposers = [
    ctx.tools.register(season),
    ctx.tools.register(ratings),
    ctx.tools.register(search),
    ctx.tools.register(reco),
    ctx.tools.register(contrast),
  ];
  return () => {
    for (const dispose of disposers.reverse()) dispose?.();
  };
}
