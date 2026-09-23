# 燕云十六声 · 典藏闪卡

多层镭射收藏卡的实时网页呈现。每张卡是一条独立的数据管线（Blender 建卡 + PIL 备层），
站点是一个 Vite 多页应用，用共享查看器按 path route 挂载多张卡。

> 建卡与发布的完整操作手册在 [`.agents/skills/holo-card-pipeline/SKILL.md`](.agents/skills/holo-card-pipeline/SKILL.md)，
> 给无上下文的 agent 看；本文件讲结构与约定。

## 目录结构

```
holo-card/
├─ brand/                  共享品牌源（唯一 logo 出处）
│   ├─ logo+文字.webp       燕云十六声 lockup，页头/卡背/favicon 都从它派生
│   ├─ fonts/              仓库内字体（SIL OFL）：卡背编号用 NotoSerif-SemiBold.ttf
│   ├─ 浅色-logo.png        深底用版本（当前未使用）
│   └─ 人物截图/            角色参考图
│
├─ cards/                  每张卡一套：源 → 构建 → 渲染
│   ├─ 001-buran/          脚本在卡根目录
│   ├─ 002-yaoyaoxin/      脚本在卡根目录
│   ├─ 003-tingyunyu/      脚本在 scripts/ 子目录（新卡推荐这种）
│   │   ├─ card-config.json   卡的元数据与合成参数（Blender 管线读这份）
│   │   ├─ source/            用户交付的原始素材，只读，不要改动
│   │   ├─ assets/            构建产物（subject/text/lineart/background/back）
│   │   ├─ scripts             prep_layers / make_text / make_back / align_lineart / tune_glow
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
    ├─ viewer/             共享查看器 app.js / style.css / icons.data.js
    │                       └─ landing.js + landing.css（首页）
    ├─ 001/ 002/ 003/      每张卡：index.html 壳 + card.config.js（查看器读这份）
    ├─ public/assets/      原样拷贝的素材：001/ 002/ 003/ 图层与 glb、logo-ink、favicon
    ├─ dist/               vite build 产物，自包含，即发布物
    └─ make_brand.py       从 brand/ 生成站点品牌资源
```

## 启动与发布

```bash
cd site
pnpm install       # 依赖（锁文件 site/pnpm-lock.yaml）
pnpm dev           # 开发服务器（默认 5173，--port 可指定）
pnpm build         # 产出 dist/
pnpm preview       # 本地预览构建产物
```

`dist/` 就是发布物：three 已捆绑、没有 importmap、没有运行时 fetch，扔到任何静态托管即可。

| 路径 | 内容 |
|---|---|
| `/` | 卡序选择 |
| `/001/index.html` | 第一弹 · 不染不染 |
| `/002/index.html` | 第二弹 · 杳杳心 |
| `/003/index.html` | 第三弹 · 听云屿 |

单卡追加 `?face=back` 直接看背面。

站点已上线：`yanyun-cards-p4207ri6kdw.qoder.zone`。发布流程见技能文档第 7 节。

## 建一张新卡（快路径，约 3 分钟）

完整命令与验证点在技能文档里，这里是骨架：

```bash
# 1. 归位素材 + 写 card-config.json + 按背景亮度定 DARKEN
# 2. 备层
python3 scripts/prep_layers.py && python3 scripts/make_text.py && python3 scripts/make_back.py
# 3. 卡壳：三张卡的 card.glb 逐字节相同，直接复用（本机无 Blender，也不需要）
cp site/public/assets/003/card.glb site/public/assets/00X/
# 4. 图层转 WebP 进 site/public/assets/<卡号>/，写 site/<卡号>/card.config.js
# 5. cards.manifest.js 加一条
# 6. pnpm build
```

**为什么不用跑 Blender**：`card.glb` 只是共享的卡壳几何（无内嵌贴图），
subject/background/text/lineart/back 五层由 `viewer/app.js` 从站点侧 WebP 加载后在着色器里合成，
所以每张卡的 GLB md5 完全一致。旧 mac 机器上走 `build_card.py --skip-render` + `export_web.py`
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
