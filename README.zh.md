# dsh-anime-guide

DeepSeek Harness 番剧插件：读多源新番表与排行榜，支持搜索、推荐，以及**国内外榜差异对照**。

## 数据源

| 区域 | 来源 | URL |
|------|------|-----|
| 新番表 | yuc.wiki | 当季新番表 |
| 国内 | [番库评分榜](https://fankuhub.com/ratings) | 季度/历史评分 |
| 国内 | [Bangumi 排名](https://bgm.tv/anime/browser?sort=rank) | 动画按 Rank 浏览 |
| 国际 | [MyAnimeList Top Anime](https://myanimelist.net/topanime.php) | 全球用户 Top |

国内榜更偏华语社区审美与经典冷门神作；国际榜（MAL）更偏近年热作、英语圈热度与完成度口碑。工具 `anime_contrast` 会做跨源标题匹配并标出「国内更高 / 国际更高 / 仅一侧 TOP」。

## 工具

- `anime_season` — yuc.wiki 新番表
- `anime_ratings` — `source=fankuhub|bangumi|mal|all`
- `anime_search` — 跨季表 + 三榜检索
- `anime_recommend` — 本季 × 评分交叉推荐
- `anime_contrast` — 国内外差异对照

## 开发

```bash
npm test
npm run check
```

需要 `@deepseek-ai/dsh-tools`（或设置 `DSH_TOOLS_PATH`）才能在 Harness 中注册工具。

> Windows 上 Node 直连 `bgm.tv` 偶发超时：插件会自动回退到 PowerShell `WebClient` 拉取。
