/**
 * HTTP fetch helpers for anime data sources.
 * yuc.wiki · fankuhub · Bangumi · MyAnimeList
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  parseBangumiRank,
  parseFankuhubRatings,
  parseMalTopAnime,
  parseYucSeason,
  resolveSeasonUrl,
  currentSeasonUrl,
} from './parse.js';
import { contrastRankings } from './contrast.js';

const execFileAsync = promisify(execFile);

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/** 番库评分榜入口（季度综合榜，页面本身可切年度/历史） */
export const FANKUHUB_RATINGS_URL = 'https://fankuhub.com/ratings';
/** 历史全站榜（可选） */
export const FANKUHUB_ALLTIME_URL = 'https://fankuhub.com/ratings?scope=alltime';
/** Bangumi 动画按排名浏览 */
export const BANGUMI_RANK_URL = 'https://bgm.tv/anime/browser?sort=rank';
/** MyAnimeList Top Anime */
export const MAL_TOP_URL = 'https://myanimelist.net/topanime.php';

const _cache = new Map();

function cacheGet(key, ttlMs) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    _cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  _cache.set(key, { at: Date.now(), value });
}

/** Some hosts (bgm.tv) block Node undici but accept WinHTTP — fall back on Windows. */
async function fetchTextViaPowerShell(url, timeoutMs = 25000) {
  if (process.platform !== 'win32') {
    throw new Error('PowerShell fallback only available on Windows');
  }
  const tmp = path.join(os.tmpdir(), `dsh-anime-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  const script = `
$ErrorActionPreference = 'Stop'
$wc = New-Object System.Net.WebClient
$wc.Headers.Add('User-Agent', ${JSON.stringify(DEFAULT_UA)})
$wc.Headers.Add('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8')
$bytes = $wc.DownloadData(${JSON.stringify(url)})
[System.IO.File]::WriteAllBytes(${JSON.stringify(tmp)}, $bytes)
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { timeout: timeoutMs + 5000, windowsHide: true },
    );
    return fs.readFileSync(tmp, 'utf8');
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

export async function fetchText(url, { timeoutMs = 20000, headers = {}, allowPowershellFallback = true } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...headers,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } catch (err) {
    const msg = String(err?.cause?.code || err?.message || err);
    const looksConnect = /timeout|UND_ERR|ECONN|abort|hang up/i.test(msg);
    if (allowPowershellFallback && looksConnect && process.platform === 'win32') {
      return await fetchTextViaPowerShell(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSeason({
  query = '',
  seasonUrl = '',
  timeoutMs = 20000,
  cacheTtlMs = 30 * 60 * 1000,
} = {}) {
  const url = seasonUrl || resolveSeasonUrl(query, { fallbackUrl: currentSeasonUrl() });
  const key = `season:${url}`;
  const cached = cacheGet(key, cacheTtlMs);
  if (cached) return { ...cached, cache_hit: true };
  const html = await fetchText(url, { timeoutMs });
  const data = parseYucSeason(html);
  data.source_url = url;
  data.cache_hit = false;
  if (!(data.schedule || []).length) {
    throw new Error(`未能从 yuc.wiki 解析新番表：${url}`);
  }
  cacheSet(key, data);
  return data;
}

/**
 * 拉取番库评分榜。
 * @param {'quarter'|'alltime'|string} scope
 */
export async function fetchRatings({
  scope = 'quarter',
  limit = 40,
  timeoutMs = 20000,
  cacheTtlMs = 30 * 60 * 1000,
  url: urlOverride = '',
} = {}) {
  let url = urlOverride;
  if (!url) {
    if (scope === 'alltime' || scope === 'history') url = FANKUHUB_ALLTIME_URL;
    else if (scope === 'quarter' || scope === 'season' || !scope) url = FANKUHUB_RATINGS_URL;
    else if (String(scope).startsWith('http')) url = String(scope);
    else url = FANKUHUB_RATINGS_URL;
  }
  const key = `ratings:${url}:${limit}`;
  const cached = cacheGet(key, cacheTtlMs);
  if (cached) return { ...cached, cache_hit: true };

  const html = await fetchText(url, { timeoutMs });
  const ratings = parseFankuhubRatings(html, limit);
  if (!ratings.length) {
    throw new Error(`未能从番库评分榜解析条目：${url}`);
  }
  const data = {
    source_url: url,
    scope: url.includes('alltime') ? 'alltime' : 'quarter',
    source: 'fankuhub',
    region: 'domestic',
    fetched_at: new Date().toISOString().slice(0, 19),
    ratings,
    cache_hit: false,
  };
  cacheSet(key, data);
  return data;
}

/** Bangumi 动画排名榜 https://bgm.tv/anime/browser?sort=rank */
export async function fetchBangumiRank({
  limit = 40,
  timeoutMs = 25000,
  cacheTtlMs = 30 * 60 * 1000,
  url = BANGUMI_RANK_URL,
} = {}) {
  const key = `bgm:${url}:${limit}`;
  const cached = cacheGet(key, cacheTtlMs);
  if (cached) return { ...cached, cache_hit: true };

  const html = await fetchText(url, { timeoutMs, allowPowershellFallback: true });
  const ratings = parseBangumiRank(html, limit);
  if (!ratings.length) {
    throw new Error(`未能从 Bangumi 排行解析条目：${url}`);
  }
  const data = {
    source_url: url,
    source: 'bangumi',
    region: 'domestic',
    fetched_at: new Date().toISOString().slice(0, 19),
    ratings,
    cache_hit: false,
  };
  cacheSet(key, data);
  return data;
}

/** MyAnimeList Top Anime https://myanimelist.net/topanime.php */
export async function fetchMalTop({
  limit = 50,
  timeoutMs = 25000,
  cacheTtlMs = 30 * 60 * 1000,
  url = MAL_TOP_URL,
} = {}) {
  const key = `mal:${url}:${limit}`;
  const cached = cacheGet(key, cacheTtlMs);
  if (cached) return { ...cached, cache_hit: true };

  const html = await fetchText(url, { timeoutMs });
  const ratings = parseMalTopAnime(html, limit);
  if (!ratings.length) {
    throw new Error(`未能从 MyAnimeList Top Anime 解析条目：${url}`);
  }
  const data = {
    source_url: url,
    source: 'mal',
    region: 'international',
    fetched_at: new Date().toISOString().slice(0, 19),
    ratings,
    cache_hit: false,
  };
  cacheSet(key, data);
  return data;
}

/**
 * 一次拉齐：本季新番表 + 国内榜（Bangumi 优先，番库兜底）+ 国际榜（MAL）。
 * 个别源失败不拖垮整包。
 */
export async function fetchCorpus({
  query = '',
  seasonUrl = '',
  ratingsScope = 'quarter',
  limit = 40,
  includeBangumi = true,
  includeMal = true,
  includeFankuhub = true,
} = {}) {
  const tasks = {
    season: fetchSeason({ query, seasonUrl }),
  };
  if (includeFankuhub) tasks.fankuhub = fetchRatings({ scope: ratingsScope, limit });
  if (includeBangumi) tasks.bangumi = fetchBangumiRank({ limit });
  if (includeMal) tasks.mal = fetchMalTop({ limit });

  const keys = Object.keys(tasks);
  const settled = await Promise.allSettled(keys.map((k) => tasks[k]));
  const out = { errors: {} };
  keys.forEach((k, i) => {
    const r = settled[i];
    if (r.status === 'fulfilled') out[k] = r.value;
    else out.errors[k] = String(r.reason?.message || r.reason);
  });

  // 兼容旧字段：ratings = 国内首选（Bangumi > 番库）
  out.ratings = out.bangumi || out.fankuhub || null;
  return out;
}

/**
 * 国内外榜差异：国内 = Bangumi ∪ 番库，国际 = MAL
 */
export async function fetchContrast({
  topN = 25,
  limit = 40,
  includeFankuhub = true,
  deltaThreshold = 8,
} = {}) {
  const [bgm, mal, fanku] = await Promise.all([
    fetchBangumiRank({ limit }).catch((e) => ({ error: String(e.message || e), ratings: [] })),
    fetchMalTop({ limit }).catch((e) => ({ error: String(e.message || e), ratings: [] })),
    includeFankuhub
      ? fetchRatings({ limit }).catch((e) => ({ error: String(e.message || e), ratings: [] }))
      : Promise.resolve({ ratings: [] }),
  ]);

  const domesticMap = new Map();
  for (const row of [...(bgm.ratings || []), ...(fanku.ratings || [])]) {
    const key = `${row.title}`.toLowerCase();
    const prev = domesticMap.get(key);
    if (!prev || (row.rank || 999) < (prev.rank || 999)) domesticMap.set(key, row);
  }
  const domestic = [...domesticMap.values()].sort((a, b) => (a.rank || 999) - (b.rank || 999));
  const international = mal.ratings || [];

  const contrast = contrastRankings(domestic, international, { topN, deltaThreshold });
  return {
    fetched_at: new Date().toISOString().slice(0, 19),
    sources: {
      bangumi: bgm.source_url || BANGUMI_RANK_URL,
      fankuhub: fanku.source_url || FANKUHUB_RATINGS_URL,
      mal: mal.source_url || MAL_TOP_URL,
    },
    errors: {
      ...(bgm.error ? { bangumi: bgm.error } : {}),
      ...(fanku.error ? { fankuhub: fanku.error } : {}),
      ...(mal.error ? { mal: mal.error } : {}),
    },
    ...contrast,
  };
}
