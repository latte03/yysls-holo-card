# AGENT.md

给没有任何上下文的 coding agent 的项目操作手册。目标：能独立跑完「建一张新卡 → 挂站点 →
构建 → 发布上线」全流程。

**逐步命令在 [`.agents/skills/holo-card-pipeline/SKILL.md`](.agents/skills/holo-card-pipeline/SKILL.md)**
（项目技能，会被自动加载）。本文件只讲**结构与约定**。深度记录按主题拆在 [`doc/`](doc/)，见下表。

## 文档地图

| 文件 | 什么时候读 |
|---|---|
| [`doc/environment.md`](doc/environment.md) | 动手前：本机依赖版本、pip/代理、agent 会话里 pnpm 被抢走 |
| [`doc/pipeline.md`](doc/pipeline.md) | 建卡：为什么不用 Blender、交付口径、线稿配准、压暗、WebP、字体 |
| [`doc/rendering.md`](doc/rendering.md) | 主体分层：`subjectLayers` 全部约定与着色器内部 |
| [`doc/site.md`](doc/site.md) | 站点：路由硬事实、主题、软导航、首页膜层与缩略图 |
| [`doc/verification.md`](doc/verification.md) | 发布前：探针怎么读、无头截图为什么是空的 |

## 这个项目是什么

《燕云十六声》典藏闪卡系列。每张卡：用户交付四层 PNG → PIL 备层 → 转 WebP → Vite 多页站点 →
Qoder Sites 上线。卡壳几何全站共享同一份 GLB，五层贴图由查看器在着色器里实时合成，
所以**建卡默认不碰 Blender**（要 `renders/hero.png` 参考图或改卡壳造型时才需要）。
查看器是 three.js 实时渲染，卡面可拖拽旋转、翻面、调景深与材质。

## 四条不可违反的约定

### 1. 卡是数据，站是站点

`cards/<id>-<name>/` 是单卡的数据管线（源素材、构建产物、Blender 工程）；
`site/` 是网站本体。**网站永远不隶属于某一张卡**——历史上整站曾塞在 `cards/001-buran/web/` 里，
加第二张卡时就成了反直觉的结构，已重构。别再把它挪回去。

### 2. 声明一张卡只有一处

`site/cards.manifest.js`。Vite 多页入口、首页链接、页头卡序切换全部由它驱动，
每张卡的壳页 `site/<id>/index.html` 也是由它扇出的——`pnpm gen:pages`（`dev`/`build` 会自动前置）
按清单把 `site/card.template.html` 逐字节复制成各卡壳页。**加新卡 = manifest 加一条**，
不要改任何 HTML，也不要手写 `site/<id>/index.html`（那是产物，已 gitignore）。

条目上挂 `wip: '制作中'` 就是"还在做"的卡：首页给它一枚灰态占位格（不挂链接、不进 hover
预取、页头卡序里也只是个 `<span>`，所以软导航和预加载都自动放过它），壳页照生成。
素材一落地**删掉 `wip` 这一行即转正式**，别去另建一份"coming soon"清单。

### 3. 两份配置，别混

| 文件 | 读者 | 格式 |
|---|---|---|
| `cards/<id>-<name>/card-config.json` | 建卡管线 | JSON，必须在磁盘上 |
| `site/<id>/card.config.js` | 网页查看器 | ES module，进打包图 |

改卡面文案（title/subtitle/technique/edition/collection/description）**两处都要改**。

### 4. 主体可以是多层，但调参只写 config

层名只有 `subject_back` / `subject_mid` / `subject_front`（z 序 后 → 中 → 前），
两层配置各写一半：管线侧 `delivery.subjectLayers`，网页侧 `subjectLayers`。
`offset` 方向反直觉（x 正往左、y 正往下）、前层深度按面积给、层数不必凑三——
完整规则见 [`doc/rendering.md`](doc/rendering.md)。

## 路径与脚本的两条硬事实

- 卡壳页必须在 `site/<id>/`（不是 `site/cards/<id>/`）、素材必须在 `public/assets/<id>/`、
  路由写显式 `index.html`。理由见 [`doc/site.md`](doc/site.md)。
- 建卡脚本只有一份，在 `tools/card_pipeline/`，用 `--card cards/<id>-<name>` 传卡目录；
  卡级参数（`darken`、`delivery` 交付文件名）读该卡的 `card-config.json`。新卡不再拷脚本。
  **例外是 001**（专属 prep 逻辑 + 写死的 darken），别并入公共包。

## 环境

Windows，`<repo-root>`。依赖版本、mac→win 路径换算、pip 镜像、**agent 会话里
`pnpm` 会被独立版抢走**（要先 `export PATH="/c/Users/<user>/AppData/Local/<toolchain-mgr>/shims:$PATH"`）
——全在 [`doc/environment.md`](doc/environment.md)。没有 scipy / skimage，别 import。

## 发布

站点已上线：`yanyun-cards-p4207ri6kdw.qoder.zone`（公开）。
项目 ID 与描述文件见仓库根 `.燕云十六声 · 典藏闪卡.qoder.site`。

流程：`get_local_context` → `get_publish_status` → 新 actionId + `prepare_site` →
轮询 `canPublish: true` → `publish_site` → 复询 `published: true` 且 `committed: true` →
`show_publish_confirmation`。逐步命令见技能文档第 7 节。

- `prepare_site` 的 `webDirectory` 是 **`site/dist`**（相对 `projectRoot`，即仓库根），不是 `dist`。
- **只有 `published: true` 且 `committed: true` 算成功**；`canPublish`、上传成功、Canvas 预览
  都只是中间态。每次发布用新 actionId，`projectId` 不变。
- 发布后描述文件会被平台回写（actionId / releaseId / 产物 sha256），那是正常产物，跟着提交。

验证怎么做、以及"多卡同开偶发加载失败"为什么不算缺陷，见 [`doc/verification.md`](doc/verification.md)。

## 提交 GitHub 前的自查

`.gitignore` 排除的是**可再生产物**：`site/node_modules/`、`site/dist/`、`site/*/index.html`
（壳页）、`cards/*/assets/`（备层 PNG）、`cards/*/preview-*.png`、`cards/*/renders/`、
`cards/*/card.blend`(`1`)、`cards/*/tools/`、`cards/*/archive/`、`.ua/intermediate|tmp|.trash-*`、
`.ua/diff-overlay.json`、`brand/fonts/FZJinLS-B-GB.ttf`（方正金隶原库，商用授权另议 + 公开仓库
不转载体）、`__pycache__/`、`*.log`、`.DS_Store`。

**必须入库**的三样：`cards/*/source/`（用户交付原件的**唯一副本**，删了无法重建，别当"可再生产物"
误删）、`site/public/assets/`（各卡 WebP + 共享 glb + `landing/` 缩略图，让干净克隆
`pnpm install && pnpm dev` 直接跑起来）、`site/<id>/card.config.js` 与 `site/public/fonts/*.woff2`。

`brand/fonts/FZJinLS-B-GB.ttf` 不入库但本机那份要留——只有重跑 `site/make_font.py` 才用到它。
