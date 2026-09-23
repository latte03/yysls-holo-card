# AGENT.md

给没有任何上下文的 coding agent 的项目操作手册。目标：能独立跑完「建一张新卡 → 挂站点 → 构建 → 发布上线」全流程。

**建卡/发布的逐步命令在 [`.agents/skills/holo-card-pipeline/SKILL.md`](.agents/skills/holo-card-pipeline/SKILL.md)**（项目技能，会被自动加载）。
本文件只讲**结构与约定**，以及那些"按记忆拼就会错"的硬事实。

## 这个项目是什么

《燕云十六声》典藏闪卡系列。每张卡：用户交付四层 PNG → PIL 备层 → Blender 建卡导出 GLB →
转 WebP → Vite 多页站点 → Qoder Sites 上线。查看器是 three.js 实时合成，卡面可拖拽旋转、
翻面、调景深与材质。

## 三条不可违反的约定

### 1. 卡是数据，站是站点

`cards/<id>-<name>/` 是单卡的数据管线（源素材、构建产物、Blender 工程、脚本）；
`site/` 是网站本体。**网站永远不隶属于某一张卡**——历史上整站曾塞在 `cards/001-buran/web/` 里，
加第二张卡时就成了反直觉的结构，已重构。别再把它挪回去。

### 2. 声明一张卡只有一处

`site/cards.manifest.js`。Vite 多页入口、首页链接、页头卡序切换全部由它驱动。
加新卡 = manifest 加一条 + 建 `site/<id>/` 目录，**不要改任何 HTML**。

### 3. 两份配置，别混

| 文件 | 读者 | 格式 |
|---|---|---|
| `cards/<id>-<name>/card-config.json` | Blender 管线 | JSON，必须在磁盘上 |
| `site/<id>/card.config.js` | 网页查看器 | ES module，进打包图 |

改卡面文案（title/subtitle/technique/edition/collection/description）**两处都要改**。

## 路径硬事实（错一个就 404 或构建失败）

- 卡壳必须在 `site/<id>/index.html`，**不能**是 `site/cards/<id>/`——Vite 按目录结构服务，
  只有根下的 `<id>/` 才对应 `/<id>/` 路由。
- `public/` 下必须再有 `assets/` 一层：`public/<id>/` 会直接挂成 `/<id>/`，和卡路由冲突。
  正确是 `public/assets/<id>/` → `/assets/<id>/`。
- 路由一律写**显式 `index.html`**（`/001/index.html`）：托管平台不保证解析裸目录路径。
- `prepare_site` 的 `webDirectory` 是 **`site/dist`**（相对 `projectRoot`，即仓库根），不是 `dist`。
- 脚本位置决定 `ROOT`：001/002 的脚本在卡根目录（`Path(__file__).resolve().parent`），
  003 起放 `scripts/` 子目录（`...parent.parent`）。**以文件里实际写的为准，别照抄。**

## 环境

| 依赖 | 位置 / 版本 |
|---|---|
| Blender | `/Applications/Blender.app/Contents/MacOS/Blender`，5.1.2，Cycles GPU |
| Python | `python3`，PIL 12.2 + numpy（**没有** scipy/skimage/cv2，别 import） |
| Node | `~/.local/share/<toolchain-mgr>/shims/node`（Bash 工具的 PATH 里没有 node） |
| three | site 内 `node_modules`，0.180；Vite 裸导入 `three` / `three/addons/...` |
| 技能脚本 | `~/.agents/skills/holo-card-studio/scripts/holographic/`（build_card / export_web） |

## 加速建卡的关键认知

一条卡的耗时约 3 分钟，几乎全在 Blender。两个可跳过的渲染：

- **`build_card.py --skip-render`**：跳过帧 25 的 Cycles 静帧。实测导出的 GLB 与完整管线
  **逐字节一致**（md5 相同）——GLB 来自 `export_web.py`，与渲染无关。
- **不要跑 `tune_glow.py`**：它只改 Blender 侧材质并重渲 hero.png，而 `export_web.py` 另建
  `web_front/web_edge/web_back/web_gold` 四个材质，那些改动到不了 GLB。

`renders/hero.png` 只是参考图，站点不引用它。需要时再单独跑 `tune_glow.py`。

用户若能预先把四层交付成 1024×1536、主体真透明、线稿已对准、背景亮度已是最终值，
prep 基本是直通（002/003 都是恒等对齐、残差 ≤2px）。

## 验证怎么做（以及什么不算缺陷）

发布前本地验证：`npm run build` → `cd dist && python3 -m http.server 4180` →
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

`--virtual-time-budget` 的无头 Chrome 会饿死真实网络请求，测线上时容易误判 TIMEOUT；
要真实结论就用真实浏览器。

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

## 提交 GitHub 前的自查

`.gitignore` 已排除 `site/node_modules/`、`site/dist/`、`cards/*/card.blend`、
`cards/*/archive/`、`cards/*/renders/`、`cards/*/preview-*.png`、`.DS_Store`。
提交前确认没有把 `cards/*/source/` 里的用户交付原图当成"可再生产物"误删——
那是唯一的原始素材，删了无法重建。
