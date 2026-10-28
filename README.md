# dsh-anime-guide

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) **番剧**插件：读多源新番表与排行榜，支持搜索、推荐，以及**国内外榜差异对照**。

> 社区插件，与 DeepSeek / 各数据站官方无关。  
> English: [README.en.md](./README.en.md)

## 为什么需要它

“这季有什么好看的”和“这部片口碑怎么样”是两类问题：前者要**当季时间表**，后者要**跨站排名**。而且国内 Bangumi / 番库 与 国际 MAL 的偏好并不一样——同一部片，国内可能排在前面，MAL 可能查无此人。

这个插件把四类数据拉到一起：

- **本季新番表**（yuc.wiki）——哪天播、什么类型；
- **国内评分/排名**（番库、Bangumi）；
- **国际排名**（MyAnimeList）；
- **跨源对照**——同名匹配后标出「国内更高 / 国际更高 / 仅一侧 TOP」，用来解释审美与受众差异。

## 数据源

| 区域 | 来源 | 说明 |
| --- | --- | --- |
| 新番表 | [yuc.wiki](https://yuc.wiki) | 当季（或指定季）新番时刻表 |
| 国内 | [番库评分榜](https://fankuhub.com/ratings) | 季度 / 历史评分 |
| 国内 | [Bangumi 排名](https://bgm.tv/anime/browser?sort=rank) | 动画按 Rank 浏览 |
| 国际 | [MyAnimeList Top Anime](https://myanimelist.net/topanime.php) | 全球用户 Top |

国内榜更偏华语社区审美与经典冷门神作；国际榜（MAL）更偏近年热作、英语圈热度与完成度口碑。

## 工具

| 工具 | 主要参数 | 作用 |
| --- | --- | --- |
| `anime_season` | `query?`（如「2026春番」）、`season_url?`、`max_items?` | 读取 yuc.wiki 新番表 |
| `anime_ratings` | `source?` = `fankuhub` / `bangumi` / `mal` / `all`、`scope?`、`limit?` | 评分榜；`scope=quarter`（默认）或 `alltime`（仅番库） |
| `anime_search` | `keyword`（必填）、`limit?`、`query?` | 跨季表 + 三榜检索 |
| `anime_recommend` | `keyword?`、`day?`、`limit?`、`query?`、`source?` | 本季 × 评分交叉推荐 |
| `anime_contrast` | `top_n?`、`limit?`、`delta_threshold?` | 国内外榜差异对照 |

## 缓存与网络

- 每个数据源有 **30 分钟**进程内缓存，同一季/同一榜不会每次都打站点；
- 单次请求默认 20 秒超时；
- Windows 上 Node 直连 `bgm.tv` 偶发超时，插件会自动回退到 PowerShell `WebClient` 拉取；
- 返回对象里带 `cache_hit`，方便判断是不是缓存结果。

## 安装

```bash
dsh plugin --profile web add github:DSH-Raising-Plan/dsh-anime-guide#plugin/dsh
```

## 使用示例

```text
anime_season {"query":"2026年4月"}        → 本季新番表
anime_ratings {"source":"all","limit":30} → 三榜合并
anime_search {"keyword":"葬送的芙莉莲"}    → 跨季 + 三榜
anime_recommend {"day":"周五"}             → 周五有哪些值得看
anime_contrast {"top_n":25}                → 国内外 TOP 差异
```

## 限制

- 全部基于**公开网页解析**，没有官方 API；站点改版会失效，需要更新 parser；
- 依赖外网，网络不通时只能拿到缓存或直接报错；
- 跨源匹配按标题/别名启发式，同名/译名差异可能漏配或错配；
- 评分是站点用户打分，不代表客观质量；
- 不提供下载/观看地址。

## 开发

```bash
npm test
npm run check
```

需要 `@deepseek-ai/dsh-tools`（或设置 `DSH_TOOLS_PATH`）才能注册工具。

## 许可

AGPL-3.0-or-later
