/**
 * Parsers for yuc.wiki / fankuhub / Bangumi / MyAnimeList.
 * Ported from Murasame/anime_guide.py + rank pages
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

function unescapeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Strip season / punctuation noise for cross-source title match */
export function normalizeTitleKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[『』「」【】\[\]（）()·・～〜\-~'’;:,.!?！？]/g, '')
    .replace(/\s+/g, '')
    .replace(/第?[0-9０-９]+季/g, '')
    .replace(/season\s*\d+/gi, '')
    .replace(/part\.?\s*\d+/gi, '')
    .replace(/第[0-9０-９]+期/g, '')
    .replace(/tv|ova|ona|movie|劇場版|剧场版/gi, '');
}

export function parseFankuhubRatings(html, limit = 25) {
  const rows = [];
  const seen = new Set();
  const hits = [...String(html || '').matchAll(/<a[^>]*href="(\/anime\/[^"]+)"/g)];
  for (let idx = 0; idx < hits.length; idx++) {
    const m = hits[idx];
    const href = m[1];
    if (seen.has(href)) continue;
    const start = m.index;
    const end = idx + 1 < hits.length
      ? hits[idx + 1].index
      : Math.min(html.length, start + 8000);
    const window = html.slice(start, end);
    let title = '';
    const tm = window.match(/\stitle="([^"]+)"/);
    if (tm) title = unescapeHtml(tm[1].trim());
    if (!title) {
      const pm = window.match(/<p[^>]*class="[^"]*truncate[^"]*"[^>]*>([^<]+)<\/p>/);
      if (pm) title = unescapeHtml(pm[1].trim());
    }
    if (!title) continue;
    let score = null;
    for (const sm of window.matchAll(/<span[^>]*class="([^"]*)"[^>]*>([\d.]+)<\/span>/g)) {
      const cls = sm[1];
      if (cls.includes('tabular-nums') && cls.includes('font-bold')) {
        const n = Number(sm[2]);
        if (Number.isFinite(n)) { score = n; break; }
      }
    }
    if (score == null) continue;
    const rankM = window.match(/font-black text-[a-z]+-\d+[^"]*">(\d+)<\/span>/);
    const votesM = window.match(
      /class="[^"]*truncate[^"]*text-xs[^"]*tabular-nums[^"]*"[^>]*>([^<]+)<\/span>/,
    );
    seen.add(href);
    rows.push({
      rank: rankM ? Number(rankM[1]) : rows.length + 1,
      title,
      score,
      votes: votesM ? unescapeHtml(votesM[1].trim()) : '',
      url: `https://fankuhub.com${href}`,
      source: 'fankuhub',
      region: 'domestic',
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

export function parseYucSeason(html) {
  const start = html.indexOf('class="post-body');
  const end = html.indexOf('<footer', start >= 0 ? start : 0);
  const body = start >= 0 && end > start ? html.slice(start, end) : html;

  const dayPositions = [...body.matchAll(/<td class="date2">([^<]+)<\/td>/g)]
    .map((m) => [m.index, m[1].trim()]);

  const dayForPos = (pos) => {
    let day = '';
    for (const [dpos, dname] of dayPositions) {
      if (dpos <= pos) day = dname;
    }
    return day;
  };

  const schedule = [];
  let currentDay = '';
  const blockRe = /<div style="float:left">(.*?)<\/div>\s*<\/div>\s*(?=<div style="float:left"|<\/div><div style="clear:both"|<!--)/gs;
  for (const block of body.matchAll(blockRe)) {
    const chunk = block[1];
    const pos = block.index;
    currentDay = dayForPos(pos) || currentDay;
    const timeM = chunk.match(/<p class="imgtext[45]">(\d{1,2}:\d{2})~<\/p>/);
    const noteM = chunk.match(/<p class="imgep2?">([^<]+)<\/p>/);
    const titleM = chunk.match(/class="date_title_+">(.*?)<\/td>/s);
    const regionM = chunk.match(/<p class="area">([^<]+)<\/p>/);
    if (!titleM) continue;
    let title = titleM[1].replace(/<br\s*\/?>/gi, ' ');
    title = unescapeHtml(title.replace(/<[^>]+>/g, '')).trim();
    if (title.length < 2) continue;
    schedule.push({
      day: currentDay,
      time: timeM ? timeM[1] : '',
      note: noteM ? unescapeHtml(noteM[1]).trim() : '',
      title,
      region: regionM ? regionM[1].trim() : '',
    });
  }

  let seasonLabel = '新番';
  const labelM = html.match(/<h1[^>]*>([^<]*新番[^<]*)<\/h1>/);
  if (labelM) seasonLabel = unescapeHtml(labelM[1]).trim();
  const countM = body.match(/共收录\s*(?:<[^>]+>)?\s*(\d+)\s*(?:<\/[^>]+>)?\s*部/);
  const total = countM ? Number(countM[1]) : schedule.length;

  return {
    season_label: seasonLabel,
    source_url: '',
    fetched_at: new Date().toISOString().slice(0, 19),
    total_count: total,
    schedule,
  };
}

export function currentSeasonUrl(now = new Date()) {
  const seasonMonth = Math.floor((now.getMonth()) / 3) * 3 + 1; // 1/4/7/10
  return `https://yuc.wiki/${now.getFullYear()}${String(seasonMonth).padStart(2, '0')}/`;
}

/**
 * Bangumi 动画排行：https://bgm.tv/anime/browser?sort=rank
 * 列表项含中文名 + 可选日文副标题、Rank、分数、评分人数。
 */
export function parseBangumiRank(html, limit = 40) {
  const rows = [];
  const body = String(html || '');
  const items = [...body.matchAll(/<li id="item_(\d+)"[^>]*>([\s\S]*?)<\/li>/g)];
  for (const m of items) {
    const id = m[1];
    const chunk = m[2];
    const titleM = chunk.match(/<a href="\/subject\/\d+"[^>]*class="l"[^>]*>([^<]+)<\/a>/);
    if (!titleM) continue;
    const title = unescapeHtml(titleM[1].trim());
    const jpM = chunk.match(/<small class="grey">([^<]+)<\/small>/);
    const titleJp = jpM ? unescapeHtml(jpM[1].trim()) : '';
    const rankM = chunk.match(/<span class="rank"><small>Rank\s*<\/small>(\d+)<\/span>/i)
      || chunk.match(/Rank\s*(\d+)/i);
    const scoreM = chunk.match(/<small class="fade">([\d.]+)<\/small>/);
    const votesM = chunk.match(/class="tip_j">\(([^)]+)\)<\/span>/);
    const infoM = chunk.match(/<p class="info tip">\s*([^<]+)/);
    const score = scoreM ? Number(scoreM[1]) : null;
    if (!Number.isFinite(score)) continue;
    rows.push({
      rank: rankM ? Number(rankM[1]) : rows.length + 1,
      title,
      title_jp: titleJp,
      score,
      votes: votesM ? unescapeHtml(votesM[1].trim()) : '',
      info: infoM ? unescapeHtml(infoM[1].trim()) : '',
      url: `https://bgm.tv/subject/${id}`,
      source: 'bangumi',
      region: 'domestic',
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

/**
 * MyAnimeList Top Anime：https://myanimelist.net/topanime.php
 */
export function parseMalTopAnime(html, limit = 50) {
  const rows = [];
  const body = String(html || '');
  const blocks = [...body.matchAll(
    /<tr class="ranking-list">([\s\S]*?)(?=<tr class="ranking-list">|<\/table>)/g,
  )];
  for (const m of blocks) {
    const chunk = m[1];
    const rankM = chunk.match(/top-anime-rank-text[^>]*>(\d+)</);
    const linkM = chunk.match(
      /anime_ranking_h3[^>]*>[\s\S]*?<a[^>]*href="(https:\/\/myanimelist\.net\/anime\/(\d+)\/[^"]+)"[^>]*>([^<]+)<\/a>/,
    ) || chunk.match(
      /<a[^>]*href="(https:\/\/myanimelist\.net\/anime\/(\d+)\/[^"]+)"[^>]*class="[^"]*hoverinfo_trigger[^"]*"[^>]*>([^<]+)<\/a>/,
    );
    if (!linkM) continue;
    const title = unescapeHtml(linkM[3].trim());
    if (!title || title.length < 2) continue;
    const scoreM = chunk.match(/score-label[^>]*>([\d.]+)</);
    const infoM = chunk.match(/class="information[^"]*">\s*([\s\S]*?)<\/div>/);
    let kind = '';
    let members = '';
    if (infoM) {
      const lines = unescapeHtml(infoM[1].replace(/<br\s*\/?>/gi, '\n')).split('\n').map((s) => s.trim()).filter(Boolean);
      kind = lines[0] || '';
      members = lines.find((l) => /members/i.test(l)) || lines[2] || '';
    }
    const score = scoreM ? Number(scoreM[1]) : null;
    if (!Number.isFinite(score)) continue;
    rows.push({
      rank: rankM ? Number(rankM[1]) : rows.length + 1,
      title,
      score,
      votes: members,
      info: kind,
      url: linkM[1].replace(/&amp;/g, '&'),
      mal_id: Number(linkM[2]),
      source: 'mal',
      region: 'international',
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

export function resolveSeasonUrl(query = '', { fallbackUrl = '' } = {}) {
  const t = String(query || '');
  const num = t.match(/(\d{4})\s*[年\-/]?\s*(\d{1,2})\s*月?/);
  if (num) {
    const y = Number(num[1]);
    let m = Number(num[2]);
    m = [1, 4, 7, 10].includes(m) ? m : Math.floor((m - 1) / 3) * 3 + 1;
    return `https://yuc.wiki/${y}${String(m).padStart(2, '0')}/`;
  }
  const seasonWords = {
    一月: 1, 冬番: 1, 冬季档: 1, 冬档: 1,
    四月: 4, 春番: 4, 春季档: 4, 春档: 4,
    七月: 7, 夏番: 7, 夏季档: 7, 夏档: 7,
    十月: 10, 秋番: 10, 秋季档: 10, 秋档: 10,
  };
  for (const [k, m] of Object.entries(seasonWords)) {
    if (t.includes(k)) {
      const yM = t.match(/(\d{4})/);
      const y = yM ? Number(yM[1]) : new Date().getFullYear();
      return `https://yuc.wiki/${y}${String(m).padStart(2, '0')}/`;
    }
  }
  return fallbackUrl || currentSeasonUrl();
}
