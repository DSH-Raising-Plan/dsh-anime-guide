# dsh-anime-guide

A **anime guide** plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): seasonal charts plus multi-source rankings, search/recommend, and **domestic vs international contrast**.

> Community plugin. Not affiliated with DeepSeek or any data site.  
> Chinese docs (canonical): [README.md](./README.md)

## Why

“What is airing this season?” and “is this show any good?” are different questions: one needs a **schedule**, the other needs **cross-site ranks**. And Chinese sites (Bangumi, Fankuhub) and MAL do not agree — a title can rank high domestically and be missing from MAL entirely.

This plugin pulls four data sources together:

- **Seasonal schedule** (yuc.wiki) — air day, time, region;
- **Domestic rankings** (Fankuhub, Bangumi);
- **International ranking** (MyAnimeList);
- **Cross-source contrast** — match titles, then flag “higher domestically / higher internationally / only on one side” to explain taste and audience differences.

## Sources

| Region | Source | Notes |
| --- | --- | --- |
| Schedule | [yuc.wiki](https://yuc.wiki) | Current or requested season |
| Domestic | [Fankuhub ratings](https://fankuhub.com/ratings) | Quarterly / all-time |
| Domestic | [Bangumi rank](https://bgm.tv/anime/browser?sort=rank) | Ranked browse |
| International | [MAL Top Anime](https://myanimelist.net/topanime.php) | Global user top |

## Tools

| Tool | Main arguments | Purpose |
| --- | --- | --- |
| `anime_season` | `query?` (e.g. “2026 fall”), `season_url?`, `max_items?` | Read the yuc.wiki seasonal chart |
| `anime_ratings` | `source?` = `fankuhub` / `bangumi` / `mal` / `all`, `scope?`, `limit?` | Rankings; `scope=quarter` (default) or `alltime` (Fankuhub only) |
| `anime_search` | `keyword` (required), `limit?`, `query?` | Search schedule + three rankings |
| `anime_recommend` | `keyword?`, `day?`, `limit?`, `query?`, `source?` | Season × ratings cross-recommendation |
| `anime_contrast` | `top_n?`, `limit?`, `delta_threshold?` | Domestic vs international contrast |

## Caching and network

- Each source has a **30-minute** in-process cache;
- Requests time out after 20 seconds by default;
- On Windows, direct `bgm.tv` requests occasionally time out; the plugin falls back to PowerShell `WebClient`;
- Returned objects carry `cache_hit` so you can tell whether a result was cached.

## Install

```bash
dsh plugin --profile web add github:DSH-Raising-Plan/dsh-anime-guide#plugin/dsh
```

## Examples

```text
anime_season {"query":"2026-04"}          → this season's schedule
anime_ratings {"source":"all","limit":30} → merged rankings
anime_search {"keyword":"Frieren"}        → schedule + three rankings
anime_recommend {"day":"Friday"}          → what to watch on Friday
anime_contrast {"top_n":25}               → domestic vs international top
```

## Limitations

- Everything is **public-page scraping**; there is no official API. Site redesigns break parsers;
- Requires network access; offline you only get cached results or an error;
- Cross-source matching is heuristic (titles/aliases); dubs and regional titles can mismatch;
- Scores are user ratings, not objective quality;
- No download or streaming links.

## Development

```bash
npm test
npm run check
```

Requires `@deepseek-ai/dsh-tools` (or `DSH_TOOLS_PATH`) to register tools.

## License

AGPL-3.0-or-later
