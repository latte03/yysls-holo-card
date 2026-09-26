# 燕云十六声 · 典藏闪卡

多层镭射收藏卡的实时网页呈现。每张卡是一条独立的数据管线（PIL 备层 → 转 WebP；卡壳几何
全站共享，Blender 只是可选项），站点是一个 Vite 多页应用，用共享查看器按 path route 挂载多张卡。

线上：`yanyun-cards-p4207ri6kdw.qoder.zone`

## 题材与名词

游戏《燕云十六声》的故事设定在五代十国与宋代交替之时，玩家作为侠客开启自己的武侠故事，
核心卖点是「东方武侠世界里存在的各种身份和职业」——剑术、武技、太极等玩法可混合搭配。
卡面上的两个分类词就来自这里：

- **流派**：类似职业，当前角色使用的武学。
- **百业**：类似帮派的一种组织。

卡背用 `brand/logo+文字.webp` 这张燕云十六声 lockup（页头、favicon 也都从它派生）。

## 从哪里开始读

| 文件 | 讲什么 |
|---|---|
| 本文件 | 结构、目录、怎么跑起来 |
| [`AGENT.md`](AGENT.md) | 结构与约定、发布判据（也是 coding agent 的入口） |
| [`.agents/skills/holo-card-pipeline/SKILL.md`](.agents/skills/holo-card-pipeline/SKILL.md) | 建卡与发布的逐步命令 |
| [`doc/`](doc/) | 深度记录：`pipeline` / `rendering` / `site` / `verification` |

## 目录结构

```
holo-card/
├─ doc/                    深度记录（按主题分篇，AGENT.md 里有索引表）
├─ .agents/skills/         项目技能：holo-card-pipeline（SKILL.md + Blender 脚本）、grok-bot-icon
├─ brand/                  共享品牌源（唯一 logo 出处）
│   ├─ logo+文字.webp       燕云十六声 lockup，页头/卡背/favicon 都从它派生
│   ├─ 浅色-logo.png       浅色字标备用稿，暂无脚本引用；正式字标由 make_brand.py 从 lockup 派生
│   └─ fonts/              仓库内字体：卡背编号 NotoSerif-SemiBold.ttf（SIL OFL）；
│                           FZJinLS-B-GB.ttf 是整站正文的方正金隶原库（已 gitignore，商用授权另议）
│
├─ tools/card_pipeline/    建卡管线脚本只此一份，靠 --card 定位卡目录
│                             prep_layers / make_text / make_back / align_lineart / tune_glow
│
├─ cards/                  每张卡一套：source（交付原件，唯一副本）→ assets（产物）→ 配置
│   ├─ 001-buran/          例外：prep 有专属裁切/位移逻辑，脚本留在卡根原地
│   ├─ 002-yaoyaoxin/  003-tingyunyu/  005-queduzhi/  006-chenjin/  007-tunuo/
│   └─ 00X-<name>/          同构：card-config.json + source/ + assets/ + grok-male.png
│
├─ archive/legacy-v1/       v1 弃稿（AgX 标定路线），仅作对比
│
├─ grok-bot-prompt.txt     grok-bot-icon 技能的规范正本（头像版），不要改正本
│
└─ site/                   网站本体（Vite 多页应用）
    ├─ index.html          首页：卡序选择（列表由清单扇出，别手改那段）
    ├─ cards.manifest.js   卡注册表——唯一声明一张卡的地方；`wip` 字段标"还在做"的卡
    ├─ card.template.html  卡壳模板（唯一源）
    ├─ gen-card-pages.mjs  按清单扇出各卡壳页 + 首页那段 <li>（产物，不入库/不手写）
    ├─ finishes.js         卡面工艺的注册表（页头色板、CSS 类、标签都读它）
    ├─ viewer/             共享查看器 app.js / style.css / theme.js / icons.js(+icons.data.js) + landing 首页
    │                       └─ tune.js（dev-only 调参面板，import.meta.env.DEV 之后才进包）
    ├─ 001/ 002/ ...       每张卡：card.config.js（查看器读这份，入库）+ 生成的壳页
    ├─ public/assets/      原样拷贝的素材：各卡图层与 glb、logo-ink、favicon
    │   └─ landing/        首页缩略图 <id>.webp 与云纹遮罩 foil-cloud.webp
    ├─ public/fonts/       fzjinls.woff2 —— 方正金隶子集，加了新卡名的字要重裁
    ├─ dist/               vite build 产物，自包含，即发布物
    └─ make_*.py           品牌资源 / 字体子集 / 首页缩略图 / 云纹遮罩 的生成脚本
```

## 跑起来

```bash
cd site
pnpm install       # 依赖（锁文件 site/pnpm-lock.yaml）
pnpm dev           # 开发服务器 127.0.0.1:4173（gen:pages 已自动前置）
pnpm build         # 产出 dist/
pnpm preview       # 本地预览构建产物（预览只看 dist，壳页源在模板）
```

`dist/` 就是发布物：three 已捆绑、没有 importmap、没有运行时 fetch，扔到任何静态托管即可。

跑站点只要 node + pnpm；建卡那侧还要 `python3` + Pillow / numpy。版本按你本机自己的来，
仓库不假定任何机器上的路径、镜像或工具链管理器。

## 路由

| 路径 | 内容 |
|---|---|
| `/` | 卡序选择 |
| `/001/index.html` | 第一弹 · 不染不染 |
| `/002/index.html` | 第二弹 · 杳杳心 |
| `/003/index.html` | 第三弹 · 听云屿 |
| `/005/index.html` | 第五弹 · 鹊渡枝 |
| `/006/index.html` | 第六弹 · 塵燼 |
| `/007/index.html` | 第七弹 · 荼喏 |
| `/008/index.html` | 第八弹 · 梧祈涵 |
| `/009/index.html` | 第九弹 · 斯哈哈哈 |

**没有 004**：第四弹从未立项，卡号就是跳过去的，别去"补"它。卡号以
[`site/cards.manifest.js`](site/cards.manifest.js) 为准，本表只是给人看的副本。

单卡追加 `?face=back` 直接看背面。深浅色默认跟随系统，页头按钮可显式切换
（记在 localStorage 的 `holo-theme`，右键它回到跟随系统）。

## 建一张新卡（骨架）

```bash
# 1. 素材归位到 cards/00X-<name>/source/ + 写 card-config.json（文案、darken、必要时 delivery 改名）
python3 tools/card_pipeline/prep_layers.py --card cards/00X-<name>
python3 tools/card_pipeline/make_text.py   --card cards/00X-<name>
python3 tools/card_pipeline/make_back.py   --card cards/00X-<name>
# 2. 卡壳直接复用（各卡 card.glb 逐字节相同；Blender 只在要 hero.png 或改卡壳几何时才需要）
cp site/public/assets/003/card.glb site/public/assets/00X/
# 3. 图层转 WebP 进 site/public/assets/<卡号>/，写 site/<卡号>/card.config.js
# 4. cards.manifest.js 加一条（壳页、首页列表、页头卡序都由它扇出，都不用手写）
# 5. 首页缩略图：补 cards/00X-<name>/grok-male.png 并跑 python3 site/make_landing_thumbs.py
# 6. 重裁字体子集（卡名有新字）：python3 site/make_font.py
# 7. cd site && pnpm build
```

完整命令、验证点与那些"踩过才知道"的坑都在技能文档和 `doc/` 里。
