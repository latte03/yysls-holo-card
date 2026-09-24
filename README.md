# 燕云十六声 · 典藏闪卡

多层镭射收藏卡的实时网页呈现。每张卡是一条独立的数据管线（Blender 建卡 + PIL 备层），
站点是一个 Vite 多页应用，用共享查看器按 path route 挂载多张卡。

> 建卡与发布的完整操作手册在 [`.agents/skills/holo-card-pipeline/SKILL.md`](.agents/skills/holo-card-pipeline/SKILL.md)，
> 给无上下文的 agent 看；本文件讲结构与约定。

## 目录结构

```
holo-card/
├─ .agents/skills/holo-card-pipeline/  项目技能：SKILL.md 操作手册 + scripts/holographic/ Blender 脚本
│                                       （自包含，不依赖 ~/.agents/skills/）
├─ brand/                  共享品牌源（唯一 logo 出处）
│   ├─ logo+文字.webp       燕云十六声 lockup，页头/卡背/favicon 都从它派生
│   ├─ fonts/              仓库内字体：卡背编号用 NotoSerif-SemiBold.ttf（SIL OFL）；
│   │                       FZJinLS-B-GB.ttf 是整站正文的方正金隶原库（商用授权另议）
│   └─ 浅色-logo.png        深底用版本（当前未使用）
│
├─ tools/card_pipeline/    建卡管线脚本只此一份，靠 --card 定位卡目录
│                             prep_layers / make_text / make_back / align_lineart / tune_glow
│                             卡级参数（darken、delivery）读该卡 card-config.json
│
├─ cards/                  每张卡一套：源 → 构建 → 渲染
│   ├─ 001-buran/          例外：prep 有专属裁切/位移逻辑，脚本留在卡根原地
│   ├─ 002-yaoyaoxin/
│   ├─ 003-tingyunyu/
│   │   ├─ card-config.json   卡级数据：文案 + 合成参数 + darken + delivery 交付名（含多层主体声明）
│   │   ├─ source/            用户交付的原始素材，只读，不要改动
│   │   ├─ assets/            构建产物（subject/text/lineart/background/back）
│   │   ├─ card.blend          Blender 工程（贴图是 packed 的）
│   │   ├─ renders/            hero 定稿、preview-register 等目检图
│   │   ├─ tools/              Blender 用户偏好
│   │   └─ archive/            归档（旧 blend 备份、废弃素材、zip）
│   └─ 00X-<name>/          同构
│
├─ archive/legacy-v1/       v1 弃稿（AgX 标定路线），仅作对比
│
└─ site/                   网站本体（Vite 多页应用）
    ├─ index.html          入口：卡序选择（由清单渲染）
    ├─ cards.manifest.js   卡注册表——唯一声明一张卡的地方
    ├─ card.template.html  卡壳模板（唯一源）
    ├─ gen-card-pages.mjs  按清单把模板扇成 site/<id>/index.html（产物，不入库）
    ├─ viewer/             共享查看器 app.js / style.css / theme.js（深浅色）/ icons.js + icons.data.js
    │                       └─ landing.js + landing.css（首页）
    ├─ 001/ 002/ ...       每张卡：card.config.js（查看器读这份，入库）
    │                       └─ index.html 由 gen-card-pages.mjs 生成，已 gitignore
    ├─ public/assets/      原样拷贝的素材：各卡图层与 glb、logo-ink、favicon
    ├─ public/fonts/       fzjinls.woff2 —— 方正金隶子集，改了文案要重裁
    ├─ dist/               vite build 产物，自包含，即发布物
    ├─ make_brand.py       从 brand/ 生成站点品牌资源
    └─ make_font.py        从 brand/fonts/FZJinLS-B-GB.ttf 裁出上面那个字体子集
```

## 启动与发布

```bash
cd site
pnpm install       # 依赖（锁文件 site/pnpm-lock.yaml）
pnpm gen:pages     # 由 card.template.html 生成各卡壳页（dev/build 已自动前置，一般不用手动跑）
pnpm dev           # 开发服务器（vite.config.js 里配的是 127.0.0.1:4173）
pnpm build         # 产出 dist/
pnpm preview       # 本地预览构建产物（预览只看 dist，壳页源在模板）
```

`dist/` 就是发布物：three 已捆绑、没有 importmap、没有运行时 fetch，扔到任何静态托管即可。

| 路径 | 内容 |
|---|---|
| `/` | 卡序选择 |
| `/001/index.html` | 第一弹 · 不染不染 |
| `/002/index.html` | 第二弹 · 杳杳心 |
| `/003/index.html` | 第三弹 · 听云屿 |

单卡追加 `?face=back` 直接看背面。

深浅色默认跟随系统，页头那个按钮（首页在右上角）可以显式切换，选择记在 localStorage 的
`holo-theme`，右键它回到"跟随系统"。配色只有一份：CSS 里每个颜色 token 都写成
`light-dark(浅, 深)`，生效哪一套由 `<html>` 的 `color-scheme` 决定，所以加颜色时**不要**
再写 `@media (prefers-color-scheme: dark)`。两个坑：① Vite 在 `build.target` 为 esnext 时
把 CSS 目标定成 chrome61，lightningcss 会把 `light-dark()` 降级回媒体查询、手动切换当场失灵，
`vite.config.js` 里的 `build.cssTarget` 就是为此；② 图片选不了 `light-dark()`，字标两张 PNG
由 `<html data-paper>` 翻（`viewer/theme.js` 写）。

卡页之间的跳转还有一层**软导航**：卡壳 GLB 五张卡逐字节相同、六个材质共享，所以换卡只需要
换贴图——`viewer/app.js` 拦下卡序链接的点击，在同一个 WebGL 上下文里把卡转到侧棱（投影宽度
归零的那一帧）换贴图与文案再转回来，`pushState` 同步地址栏，前进后退走同一套；加载没完成前
文案先淡掉当进度反馈，拿不到配置就退回真导航。首页没有画布，landing ↔ 卡 仍是真导航（three
的启动成本在那一侧），靠 hover 预取把下载提前。极限：显存稳态留两套贴图（当前 + 刚离开那张，
供后退秒开），预取缓存上限一份（`bundles` 的 while 循环里改）；未预取的首点要等贴图下载
（本地实测冷 ~1.3s、hover 预取后 ~30ms、缓存命中 ~2ms）；隐藏标签页里补间直接落位。

站点已上线：`yanyun-cards-p4207ri6kdw.qoder.zone`。发布流程见技能文档第 7 节。

## 建一张新卡（快路径，约 3 分钟）

完整命令与验证点在技能文档里，这里是骨架：

```bash
# 1. 归位素材到 cards/00X-<name>/source/ + 写 card-config.json（含 darken、必要时 delivery 改名）
# 2. 备层（脚本只有一份，--card 指卡目录）
python3 tools/card_pipeline/prep_layers.py --card cards/00X-<name>
python3 tools/card_pipeline/make_text.py   --card cards/00X-<name>
python3 tools/card_pipeline/make_back.py   --card cards/00X-<name>
# 3. 卡壳：各卡 card.glb 逐字节相同，直接复用（本机无 Blender，也不需要）
cp site/public/assets/003/card.glb site/public/assets/00X/
# 4. 图层转 WebP 进 site/public/assets/<卡号>/，写 site/<卡号>/card.config.js
#    主体要分层时：card-config.json 写 delivery.subjectLayers，card.config.js 写 subjectLayers（见 AGENT.md 第 4 条）
# 5. cards.manifest.js 加一条（壳页由它扇出，不用手写也不用拷）
# 6. cd site && pnpm build
```

**为什么不用跑 Blender**：`card.glb` 只是共享的卡壳几何（无内嵌贴图），
subject/background/text/lineart/back 五层由 `viewer/app.js` 从站点侧 WebP 加载后在着色器里合成，
所以每张卡的 GLB md5 完全一致。真要跑 Blender 时用仓库内置的脚本
（`.agents/skills/holo-card-pipeline/scripts/holographic/`，`build_card.py --skip-render` + `export_web.py`）
也能拿到同样的 GLB（实测与完整管线逐字节一致，md5 相同），两条路等价；
只有要 `renders/hero.png` 参考图或改卡壳几何本身时才真需要 Blender。
需要 hero 图时单独跑 `tune_glow.py`（它只改 Blender 侧材质，改动到不了 GLB）。

## 线稿配准

用户交付的线稿和成图是两次独立生成，永远不会像素级对齐。`align_lineart.py` 负责注册它，
`prep_layers.py` 内部会调用；也可单独跑。产出三件东西：

| 文件 | 用途 |
|---|---|
| `assets/lineart.png` | 配准后的线稿，按主体轮廓裁掉外部，供辉光层使用 |
| `renders/preview-register.png` | 红线叠图，肉眼确认贴合程度 |
| `alignment.json` | 变换参数 + NCC 分数 + chosen/identity 残差对比 |

判据是**全分辨率 NCC** 配上**分块匹配残差**（64×64 块内找局部最佳位移取中位数）。
粗尺度（96×144）上跑 NCC 会被糊成色块的墨线边缘骗到，偏好 7% 的伪缩放、把裙摆带偏
~50px——细化阶段必须回全分辨率。恒等变换始终作为候选参与打分，所以"本来就对准"的
线稿不会被带跑。残差 >5px 就应当人工看 `preview-register.png`。

001 不适用此工具：它的人物被 prep 裁切并下移过，与原始线稿不是相似变换关系
（001 的定稿件残差实测 0px，不要去"修"它）。

## 注意事项

- **card.blend 的贴图是 packed 的**：改了 `assets/` 里的 png 不会自动生效，必须重跑 `build_card.py`。
- **两份配置，别混**：Blender 管线读 `cards/<卡号>-*/card-config.json`（JSON，要在磁盘上）；
  网页查看器读 `site/<卡号>/card.config.js`（ES module，进打包图）。改文案两处都要改。
- **背景压暗**：`background_orig.png` 是交付原件的快照，压暗永远从它算起，不会叠加。
  量一下亮度再定 `DARKEN`：均值 ~190 用 0.74，~130 用 0.92，~20 用 1.0。
- **站点素材用 WebP**：`public/assets/` 下只放 WebP（比 PNG 省约 75%），alpha 与 PNG 一致；
  差异只出现在 alpha<128 的不可见区域。PNG 原件保留在 `cards/` 里。
- **卡目录必须在站点根部**：`site/<卡号>/`，不能放 `site/cards/<卡号>/`——Vite 按目录结构服务。
- **`public/` 下必须有 `assets/` 一层**：`public/<卡号>/` 会直接挂成 `/<卡号>/`，和卡路由冲突。
- **路由写显式 `index.html`**：托管平台不保证解析裸目录路径。
- **多卡同时预览会抢 WebGL 资源**：三个以上 iframe 同时开可能偶发"作品暂时无法加载"，
  逐张单独验证才是准的。
