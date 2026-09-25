# AGENT.md

给没有任何上下文的 coding agent 的项目操作手册。目标：能独立跑完「建一张新卡 → 挂站点 → 构建 → 发布上线」全流程。

**建卡/发布的逐步命令在 [`.agents/skills/holo-card-pipeline/SKILL.md`](.agents/skills/holo-card-pipeline/SKILL.md)**（项目技能，会被自动加载）。
本文件只讲**结构与约定**，以及那些"按记忆拼就会错"的硬事实。

## 这个项目是什么

《燕云十六声》典藏闪卡系列。每张卡：用户交付四层 PNG → PIL 备层 → 转 WebP → Vite 多页站点 →
Qoder Sites 上线。卡壳几何全站共享同一份 GLB，五层贴图由查看器在着色器里实时合成，
所以**建卡默认不碰 Blender**（要 `renders/hero.png` 参考图或改卡壳造型时才需要）。
查看器是 three.js 实时渲染，卡面可拖拽旋转、翻面、调景深与材质。

## 三条不可违反的约定

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
素材一落地**删掉 `wip` 这一行即转正式**，别去另建一份"coming soon"清单——一张卡只有一处声明。

### 3. 两份配置，别混

| 文件 | 读者 | 格式 |
|---|---|---|
| `cards/<id>-<name>/card-config.json` | Blender 管线 | JSON，必须在磁盘上 |
| `site/<id>/card.config.js` | 网页查看器 | ES module，进打包图 |

改卡面文案（title/subtitle/technique/edition/collection/description）**两处都要改**。

### 4. 主体可以是多层（z 序固定：后 → 中 → 前）

卡面主体默认一层；要做出真视差分层时，两层配置各写一半，**层名只有三个**：
`subject_back` / `subject_mid` / `subject_front`。

| 位置 | 写什么 |
|---|---|
| `cards/<id>-*/card-config.json` → `delivery.subjectLayers` | `{层名: source 文件名}`，管线按 z 序读 |
| `site/<id>/card.config.js` → `subjectLayers` | `{back, mid, front}`，每层 `{src?, depth, scale, offset}` |

- `subjectLayers` 里每层三个调参：`depth` 视差深度、`scale` 在整体「画面比例」（`parameters.subjectScale`）
  之上的倍率、`offset` 卡面位移（uv 单位，`0.01` = 卡宽 1% ≈ 10px / 卡高 1% ≈ 15.4px）。卡片页面板的
  「大小 / 左右 / 上下 / 景深」四行就是它们，**多层卡才有**（单层卡面板保持原样）。
- `offset` 的方向反直觉，别按 CSS 的直觉猜：着色器里 `su = uv + offset`，内容落在「纹理坐标 − offset」
  处，所以 **x 正值往左、y 正值往下**。两轴同一条代数（007 的人物下移 37px 就是 `offset: [0, 0.024]`）。
  另外线辉光与中层共用同一个 `su`，所以挪中层时描金线跟着一起走，不会错位——这也是"调人物位置
  用 offset、不去改 `source/` 里的图"的原因。
- 每层可选 `label`（如 `"花丛"`）：只给调参面板的 tab 用。模板里只有中性的「后层 / 中层 / 前层」，
  具体内容写在各卡 config（003 是翅膀与鸟头、007 是花丛），**不要去改 `card.template.html` 写死**；
  中层恒为人物，有默认值不用声明。
- `mid` 只写调参、**不给 `src`**：中层素材永远取 `assets.subject`，中层的 `depth` 也就是
  面板上「画面景深」那一行管的那个值（多层卡里那一行会被藏掉，改由「中层 · 景深」接管，
  避免两根滑杆抢同一个 uniform）。后 / 前层仍必须给 `src`，缺哪层那组滑杆就不出现。
- **层数不必凑三**：007 只有 `mid + front`（人物 + 压在人物之前的花丛），没有后层，是合法形态。
- **前层 `depth` 按它独占的面积给**，别照抄别的卡：003 的前层独占区只占 1.6%，给了 `1.6`；
  007 的花丛占画面 45%，只给 `1.2`。面积越大越要收着，否则倾斜时整片前景会像从人物身上滑开。
- `prep_layers.py` 逐层增强后各落一张 `assets/<层名>.png`，**另外固化一张 `assets/subject.png`**——
  多层时它是**并集轮廓**，是线稿配准（`align_lineart` 读它）、辉光遮罩、`preview-composite.png`
  的唯一依据。**所以 `assets/subject.png` 不是输入**，多层卡在 `source/` 里也没有这个文件名。
- 着色器（`frontFragment`）把后层压在背景上、前层压在中层之上，每层各取自己的视差 UV；
  星屑遮挡用三层并集 alpha；**线辉光只贴中层**（它按中层 UV 采样、乘中层 alpha），
  颜色是 `v1spectrum` 的彩虹而不是单色：相位取**沿带方向**的梯度（`uv.y*.83-uv.x*.35`）加视线项，
  所以一条亮线上从暖到冷铺开、倾斜时整体淌色；换成 `band` 自己的相位就只会整条同色一起变。
  辉光的亮窗比箔光宽（`glowBand = pow(v1phase,6)` 对箔光的 `v1sweep = pow(v1phase,12)`）：幂 12 的
  半高宽只占周期 10.7%，描金线只在很窄的掠带里亮一下；放宽只管辉光，不动箔光那道锐利的扫光。
  **强度 = `parameters.lineartGlow`（缺省 1）× 光泽滑杆**：辉光天生跟着「光泽」走，细线的卡
  （003 是 1.4）需要单独加强时用这个倍率，不必把整卡的反光一起推亮。
  改这三层的采样坐标只需动 `fitUV(p, size, offset)` 一处，三个调用点各传自己那层。
- 单层卡不写 `subjectLayers`：网页侧给两张 1x1 全透明贴图，合成精确退化回单层结果。
  CSS-3D 降级路径（WebGL 关掉时）也认这套参数，落成每层的 `translate`/`scale` +
  一个 z 倍率；线稿跟着中层走，和着色器里 `lineart` 用 `su` 采样保持一致。
- 面板那三组滑杆的显示/隐藏由 `showLayerPanelGroups()` 单独负责，WebGL 路径和降级路径
  共用——加新卡时不用改模板。

## 路径硬事实（错一个就 404 或构建失败）

- 卡壳必须在 `site/<id>/index.html`，**不能**是 `site/cards/<id>/`——Vite 按目录结构服务，
  只有根下的 `<id>/` 才对应 `/<id>/` 路由。这些壳页是 `gen-card-pages.mjs` 生成的产物：
  Vite 必须把每页 HTML 当作**构建输入**才能把 `/viewer/app.js` 改写成带 hash 的
  `/assets/app-*.js`，所以不能跳过 `site/<id>/` 直接往 `dist/` 写。
- `public/` 下必须再有 `assets/` 一层：`public/<id>/` 会直接挂成 `/<id>/`，和卡路由冲突。
  正确是 `public/assets/<id>/` → `/assets/<id>/`。
- 路由一律写**显式 `index.html`**（`/001/index.html`）：托管平台不保证解析裸目录路径。
- `prepare_site` 的 `webDirectory` 是 **`site/dist`**（相对 `projectRoot`，即仓库根），不是 `dist`。
- 建卡脚本只有一份，在 `tools/card_pipeline/`，用 `--card cards/<id>-<name>` 传卡目录；
  卡级参数（`darken`、`delivery` 交付文件名）读该卡的 `card-config.json`。新卡不再拷脚本。
  **例外是 001**：它的 `prep_layers.py` 有裁切 6% 边 + 下移 110px 的专属逻辑，
  已定稿且不再重跑，脚本就留在 `cards/001-buran/` 原地，别并入公共包。
  001 的 `darken` 仍写死在它自己脚本里（0.74），config 里那份 `darken` 只是记录，别指望公共脚本改它。
- Blender 侧脚本也在仓库内：`.agents/skills/holo-card-pipeline/scripts/holographic/`
  （`build_card.py` / `export_web.py`）+ 同级的 `.agents/skills/holo-card-pipeline/scripts/blender_compat.py`。
  `build_card.py` 靠 `parents[1]` 导入 `blender_compat`，**两者必须保持这个相对位置**（移动就 ImportError）。
  Blender 命令一律在**卡目录里**用 `../../.agents/skills/holo-card-pipeline/scripts/holographic/` 相对调用。
  **不引用** `~/.agents/skills/` 下的第三方技能——项目技能自包含，换机不漂。

## 环境

仓库现在在 **Windows**：`<repo-root>`。下面左列是本机事实，右列是旧 mac
（`/Users/<user>/Documents/code-dev/holo-card`）的写法——文档里出现 mac 路径时按这张表换算。

| 依赖 | 本机（Windows） | 旧 mac（历史文档里的写法） |
|---|---|---|
| Blender | **未安装，建卡不需要**（见下节） | `/Applications/Blender.app/Contents/MacOS/Blender`，5.1.2，Cycles GPU |
| 技能脚本 | 仓库内置 `.agents/skills/holo-card-pipeline/scripts/`（Blender 用，本机不需要） | 旧 mac 的 `~/.agents/skills/holo-card-studio/scripts/holographic/` |
| Python | `python3`（<toolchain-mgr> shim，3.14.4）+ PIL 12.3.0 + numpy 2.5.1 + **cv2 5.0.0** | `python3`，PIL 12.2 + numpy |
| Node / 包管理 | `node` 26.5.0 + `pnpm` 12.6.0（<toolchain-mgr> pin），依赖在 `site/pnpm-lock.yaml` | `~/.local/share/<toolchain-mgr>/shims/node` + npm |
| three | `site/node_modules`，0.180；Vite 裸导入 `three` / `three/addons/...` | 同 |

（**没有** scipy / skimage，别 import。cv2 是 2026-09-25 复核时确认装了的（5.0.0）——
连通域、泛洪这类事直接用它，别手写 Python 循环；但管线脚本本身不依赖它，只有临时
抠图/诊断脚本会用到。）

两个本机网络/PATH 的硬事实：

- `pip` 直连 pypi.org 会超时中断，装包加 `-i https://<pypi-mirror>/pypi/simple/`；
  npm 走 `~/.npmrc` 里的 <npm-mirror>。GitHub release 直连不通，`<toolchain-mgr> install` 需要活的代理
  （<proxy-client> 端口不固定，<proxy-port> 时断）。
- **agent 的 Bash 会话里 `pnpm` 会被独立版抢走**：`C:\Users\<user>\AppData\Local\pnpm`（11.21.0）
  排在 <toolchain-mgr> shims 之前，`pnpm -v` 拿到 11.21.0。跑命令前先
  `export PATH="/c/Users/<user>/AppData/Local/<toolchain-mgr>/shims:$PATH"`。用户自己的终端里 <toolchain-mgr> 在前，
  不受影响。注册表 PATH 与 agent 会话 PATH 顺序不同，别拿 `which -a` 的结论推断终端行为。

## 加速建卡的关键认知

**`card.glb` 是共享卡壳，新卡可以完全不碰 Blender。** 六张卡（001/002/003/005/006/007）的
`site/public/assets/<id>/card.glb` md5 逐字节相同（`5079d522d4ddc9c3a3c0a02e4c45f9cb`，23668 字节，
glTF 里没有 image chunk）：它只有 3 个 mesh 和 `web_front/web_edge/web_back/web_gold` 四个材质名，
subject/background/text/lineart/back 五层贴图全部由 `site/viewer/app.js` 从 `/assets/<id>/*.webp`
加载后在着色器里合成。所以新卡 `cp site/public/assets/003/card.glb site/public/assets/00X/` 就够了。
只有两种情况真需要 Blender：要 `renders/hero.png` 参考图，或要改卡壳几何本身（比例、厚度、
边框造型）。那时用仓库内置的脚本 `.agents/skills/holo-card-pipeline/scripts/holographic/`
（`build_card.py` / `export_web.py`，用法见 SKILL.md 第 4 节）。

一条卡若走 Blender 管线，耗时约 3 分钟，几乎全在渲染。两个可跳过的渲染：

- **`build_card.py --skip-render`**：跳过帧 25 的 Cycles 静帧。实测导出的 GLB 与完整管线
  **逐字节一致**（md5 相同）——GLB 来自 `export_web.py`，与渲染无关。
- **不要跑 `tune_glow.py`**：它只改 Blender 侧材质并重渲 hero.png，而 `export_web.py` 另建
  `web_front/web_edge/web_back/web_gold` 四个材质，那些改动到不了 GLB。

`renders/hero.png` 只是参考图，站点不引用它。需要时再单独跑 `tune_glow.py`。

用户若能预先把四层交付成 1024×1536、主体真透明、线稿已对准、背景亮度已是最终值，
prep 基本是直通（002/003/007 都是恒等对齐，残差分别 ≤2 / ≤2 / 2.8px；判据阈值是 5px）。

## 验证怎么做（以及什么不算缺陷）

发布前本地验证：`pnpm build` → `cd dist && python3 -m http.server 4180` →
同源 iframe 探针读 `window.__holo.ready`。

```js
// 探针要点：同源（探针必须由 4180 伺服，不能 file://），等 __holo 出现
const w = iframe.contentWindow;
w.__holo && w.__holo.ready   // true 才算成
w.__holo.error               // 有值就是真失败
```

**三个以上卡同时开会抢软件 WebGL 资源，可能偶发「作品暂时无法加载 / undefined」——
这不是站点缺陷**（`__holo.error` 的 message 是 undefined，因为 race 里被 reject 的不是 Error）。
逐张单独验证才是准的。

无头 Chrome/Edge 的 `--virtual-time-budget` **只快进定时器、不等真实网络与贴图解码**，
所以拍 WebGL 卡面会在"贴图还没就绪"那一刻落刀。可用做法：同一个 `--user-data-dir` 上
**连拍 2~3 遍，只信中间那遍**（第一遍冷缓存必空，第二遍缓存热了才真渲染）。判据直接用
文件大小：空白页面壳 ~18KB，真渲染 >1MB。**图层多的卡（多层主体）首遍必空**——已上线的
003 也一样空，别把它当成新卡坏了。

要像素级结论又不想跟无头较劲：用内置浏览器（Qoder Browser Connector）。它的
`take_screenshot` 在隐藏窗口下必然失败，但 `evaluate_script` 照常工作——读
`__holo.ready` / `__holo.uniforms` / DOM 文本，必要时 `renderer.setAnimationLoop(null)`
停摆 + 手摆 `root.rotation` + 重算 `uEye/uView` 再 `render()`，配 `gl.readPixels` 量真实像素
（比 截图 更可控：能定死一个正对视角、能对比两个 offset 取值）。

## 发布

站点已上线：`yanyun-cards-p4207ri6kdw.qoder.zone`（公开）。
项目 ID 与描述文件见仓库根 `.燕云十六声 · 典藏闪卡.qoder.site`。

流程：`get_local_context` → `get_publish_status` → 新 actionId + `prepare_site` →
轮询 `canPublish: true` → `publish_site` → 复询 `published: true` 且 `committed: true` →
`show_publish_confirmation`。逐步命令见技能文档第 7 节。

**只有 `published: true` 且 `committed: true` 算成功**；`canPublish`、上传成功、Canvas 预览
都只是中间态。每次发布用新 actionId，`projectId` 不变。

## 已知的坑（都踩过）

- **card.blend 贴图是 packed 的**：改 `assets/` 里的 png 不生效，必须重跑 `build_card.py`。
- **线稿对齐必须全分辨率 NCC**：96×144 粗尺度会被糊成色块的墨线边缘骗到，偏好 7% 伪缩放、
  把裙摆带偏约 50px。判据配"分块匹配残差"（64×64 块内局部最佳位移取中位数），恒等变换
  必须作为候选参与打分。`align_lineart.py` 已按此实现，别改回粗尺度。
- **001 不适用 `align_lineart.py`**：它的人物被 prep 裁切并下移过，与原始线稿不是相似变换
  关系；001 定稿件残差实测 0px，别去"修"它。
- **背景压暗量看交付亮度**：均值 ~190 用 `DARKEN=0.74`，~130 用 0.92，~20 用 1.0。
  压暗永远从 `background_orig.png` 算起，不会叠加。
- **删壳页元素前先 grep**：曾因删 `<nav>` 时连带删掉 `#edition`，导致 init 里
  `$("edition").textContent` 抛 null、整卡加载失败。页头标签现由 `renderCardNav()` 从清单渲染。
- **站点素材只放 WebP**（省约 75%，alpha 与 PNG 一致，差异只在 alpha<128 的不可见区域）；
  PNG 原件留在 `cards/*/assets/`。
- **线稿辉光看"墨的面积"而不是"有多黑"**：管线只认 `L<140` 的墨（`_load_ink`，也是配准打分口径），
  着色器窗口又在 `L<76` 就满格——所以"把线画黑一档"不会更亮，"把笔画做粗做实"才会（003 重描版
  墨区 4.1%→10.6%，辉光权重 ×2.8，卡上实测 ×4–7）。整幅压暗交付也行，别过 0.55：纸底 252 被
  压到 140 以下时整张纸都成了墨。管线侧放宽交付口径的收益因此很小（现稿只剩 1–3%）。
- **线描那张走"无损优先"**：它只当遮罩用（着色器只读它的 r 通道）且近乎二值，无损 WebP 常比
  有损还小、且 mask 逐位相同——实测 002/003/005/007 无损最小（137/111/168/128K，q95 分别是
  218/199/260K），001 则是有损 q85 更小（197K vs 无损 289K）。所以线描按"无损与 q85 取小"，
  其余层仍按 q95（subject*/background 用 92）。
- **交付的 subject 可能是"假透明"**：先看 `alpha.min()`——整幅 255 就是透明网格被烤进了 RGB
  （看着像棋盘格/网点底）。这种图救不回来：角色是白发白衣时，连通性泛洪能保住大轮廓，但
  **发丝之间和臂与身之间的封闭背景洞，与领巾/斜挎带是同一族近白色**，颜色阈值和连通性都分不开
  （实测按"中性且亮"抠，领巾和带子全被误判成背景）。别硬抠，直接要带 alpha 的那版；
  真透明版的特征是 `alpha.min()=0` + 有几万个半透明像素（发梢软边）。
- **首页缩略图按 alpha 质心居中，不是外接框**：立绘常带单侧长飘带/长发（007 的白发往左拖出
  379px），外接框对称而质量不对称，按框居中会把人物本体推到右边 29px 而其余五张都在 ±5px 内。
  `make_landing_thumbs.py` 的 `paste_x()` 已改成质心对画布中线 + 夹住不推出画布。
- **卡背编号只用仓库内字体**：`brand/fonts/NotoSerif-SemiBold.ttf`（SIL OFL 1.1，许可证同目录
  `OFL.txt`）。`make_back.py` 用 `ROOT / '..' / '..' / 'brand' / 'fonts' / ...` 相对定位，
  六张卡（含已定稿的 001-003）都靠它，换机不漂。**不要**改回系统字体路径——
  mac 的 `Songti.ttc` 与 Windows 的 `simsun.ttc` 都是随操作系统的授权字体，
  不能提交进公开仓库，而且换机就渲染不出来。权重用 SemiBold（用户偏好更粗的编号，
  Regular 与原 Songti 更接近但偏细），墨迹 y 区间 1321-1342，与 Regular 只差 1px，无需调坐标。
  同目录还留着 `NotoSerif-Regular.ttf` 作为该家族的另一个权重。

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
