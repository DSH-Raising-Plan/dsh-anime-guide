/** Tool specs without execute — host schema subset only. */

export const SEASON_TOOL = 'anime_season';
export const RATINGS_TOOL = 'anime_ratings';
export const SEARCH_TOOL = 'anime_search';
export const RECOMMEND_TOOL = 'anime_recommend';
export const CONTRAST_TOOL = 'anime_contrast';

function textOut(render) {
  return {
    schema: { type: 'json' },
    render: render || ((_a, v) => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }]),
  };
}

export function seasonToolSpec() {
  return {
    name: SEASON_TOOL,
    description: [
      '读取 yuc.wiki 本季（或指定季）新番表。',
      'query 可写「2026年4月」「春番」等；不传则当前季度。',
    ].join('\n'),
    parameters: {
      query: { type: 'string', description: '季节提示，如 2025秋番 / 2026年1月' },
      season_url: { type: 'string', description: '直接指定 yuc.wiki 季度 URL' },
      max_items: { type: 'integer', description: '摘要最多列出几部，默认 20' },
    },
    output: textOut((_a, v) => [{ type: 'text', text: v.brief || JSON.stringify(v) }]),
  };
}

export function ratingsToolSpec() {
  return {
    name: RATINGS_TOOL,
    description: [
      '拉取评分/排行榜。source 可选：',
      '- fankuhub（默认，国内番库 https://fankuhub.com/ratings）',
      '- bangumi（国内 Bangumi https://bgm.tv/anime/browser?sort=rank）',
      '- mal（国际 MyAnimeList https://myanimelist.net/topanime.php）',
      '- all（三源摘要并列）',
    ].join('\n'),
    parameters: {
      source: {
        type: 'string',
        description: 'fankuhub | bangumi | mal | all（默认 fankuhub）',
      },
      scope: {
        type: 'string',
        description: '仅 fankuhub：quarter（默认）或 alltime',
      },
      limit: { type: 'integer', description: '条数，默认 20' },
    },
    output: textOut((_a, v) => [{ type: 'text', text: v.brief || JSON.stringify(v) }]),
  };
}

export function searchToolSpec() {
  return {
    name: SEARCH_TOOL,
    description: [
      '在本季新番表 + 国内榜（番库/Bangumi）+ 国际榜（MAL）中检索番剧名。',
      '返回是否在季表、各源排名/分数，便于对比国内外热度。',
    ].join('\n'),
    parameters: {
      keyword: { type: 'string', required: true, description: '番名 / 别名关键字' },
      limit: { type: 'integer', description: '最多返回条数，默认 10' },
      query: { type: 'string', description: '可选：指定季节（同 anime_season）' },
    },
    output: textOut((_a, v) => [{ type: 'text', text: v.brief || JSON.stringify(v) }]),
  };
}

export function recommendToolSpec() {
  return {
    name: RECOMMEND_TOOL,
    description: [
      '结合本季新番表与评分榜做推荐：优先「本季有排 + 高分」重叠项。',
      '可按星期过滤（day），或按关键词收窄。',
    ].join('\n'),
    parameters: {
      keyword: { type: 'string', description: '可选关键字' },
      day: { type: 'string', description: '星期过滤，如 周一 / 土曜' },
      limit: { type: 'integer', description: '推荐条数，默认 8' },
      query: { type: 'string', description: '季节提示' },
      ratings_source: {
        type: 'string',
        description: '评分源：bangumi（默认）| fankuhub | mal',
      },
    },
    output: textOut((_a, v) => [{ type: 'text', text: v.brief || JSON.stringify(v) }]),
  };
}

export function contrastToolSpec() {
  return {
    name: CONTRAST_TOOL,
    description: [
      '国内外番剧榜差异对照。',
      '国内：Bangumi（bgm.tv/anime/browser?sort=rank）+ 番库（fankuhub.com/ratings）；',
      '国际：MyAnimeList（myanimelist.net/topanime.php）。',
      '输出匹配条目的名次落差、仅国内 TOP、仅国际 TOP，用于解释审美/受众差异。',
    ].join('\n'),
    parameters: {
      top_n: { type: 'integer', description: '对照用 TOP 深度，默认 25' },
      limit: { type: 'integer', description: '各源拉取条数，默认 40' },
      delta_threshold: {
        type: 'integer',
        description: '判定「偏高」的名次差阈值，默认 8',
      },
    },
    output: textOut((_a, v) => [{ type: 'text', text: v.brief || JSON.stringify(v) }]),
  };
}
