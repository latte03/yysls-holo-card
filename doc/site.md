# 站点内部

## 路径硬事实（错一个就 404 或构建失败）

- 卡壳必须在 `site/<id>/index.html`，**不能**是 `site/cards/<id>/`——Vite 按目录结构服务，
  只有根下的 `<id>/` 才对应 `/<id>/` 路由。这些壳页是 `gen-card-pages.mjs` 生成的产物：
  Vite 必须把每页 HTML 当作**构建输入**才能把 `/viewer/app.js` 改写成带 hash 的
  `/assets/app-*.js`，所以不能跳过 `site/<id>/` 直接往 `dist/` 写。
- `public/` 下必须再有 `assets/` 一层：`public/<id>/` 会直接挂成 `/<id>/`，和卡路由冲突。
  正确是 `public/assets/<id>/` → `/assets/<id>/`。
- 路由一律写**显式 `index.html`**（`/001/index.html`）：托管平台不保证解析裸目录路径。
- **哪些是产物**：`site/<id>/index.html`、首页 `card-list` 标记之间那段 `<li>`、
  `cards/*/assets/`、`dist/` 全都能从「源素材 + 两份配置」重建——别手改，也都不入库。

## 深浅色主题

配色只有一份：CSS 里每个颜色 token 都写成 `light-dark(浅, 深)`，生效哪一套由 `<html>` 的
`color-scheme` 决定，所以加颜色时**不要**再写 `@media (prefers-color-scheme: dark)`。
默认跟随系统，页头那个按钮（首页在右上角）可以显式切换，选择记在 localStorage 的 `holo-theme`，
右键它回到"跟随系统"。

两个坑：

1. Vite 在 `build.target` 为 esnext 时把 CSS 目标定成 chrome61，lightningcss 会把 `light-dark()`
   降级回媒体查询、手动切换当场失灵——`vite.config.js` 里的 `build.cssTarget` 就是为此。
   **dev 正常、线上失灵**，所以验证必须看 `dist/`。
2. 图片选不了 `light-dark()`，字标两张 PNG 由 `<html data-paper>` 翻（`viewer/theme.js` 写）。

## 卡间软导航

卡壳 GLB 六张卡逐字节相同、六个材质共享，所以换卡只需要换贴图——`viewer/app.js` 拦下卡序链接的
点击，在同一个 WebGL 上下文里把卡转到侧棱（投影宽度归零的那一帧）换贴图与文案再转回来，
`pushState` 同步地址栏，前进后退走同一套；加载没完成前文案先淡掉当进度反馈，拿不到配置就退回真导航。

首页没有画布，landing ↔ 卡 仍是真导航（three 的启动成本在那一侧），靠 hover 预取把下载提前。

极限与实测：显存稳态留两套贴图（当前 + 刚离开那张，供后退秒开），预取缓存上限一份
（`bundles` 的 while 循环里改）；未预取的首点要等贴图下载（本地实测冷 ~1.3s、hover 预取后 ~30ms、
缓存命中 ~2ms）；隐藏标签页里补间直接落位。

## 首页卡面的镭射膜层

首页那张卡片列表是纯 CSS 做的膜层（`.foil` 描金云纹 + `.band` 箔光 + `.glare` 高光），
和卡页的 WebGL 是两套实现——**卡页不做 CSS 膜层**，那是有意的。

- 云纹走 `mask-image` 而不是 `background`：`site/public/assets/landing/foil-cloud.webp` 只存形状
  （白线 + 透明 alpha），金色由 CSS 变量 `--foil-ink` 给。源图由 `site/make_foil_asset.py <源图>`
  抠成 512x768 的 alpha 遮罩。它**不需要无缝拼接**——整图按 `--foil-size` 放大摆，卡面看到的是
  其中 1/3 宽的取景，`--foil-ox` / `--foil-oy` 就是取景坐标。
- 云纹在立绘**之下**：它是印在卡基上的图案，盖到人物身上就糊脸了。
- `site/make_foil_tile.py` 是零许可风险的兜底（纯程序画无缝 tile），当前没有产出者；
  万一那张生成图要换掉才用它，接进 CSS 时得改 `.foil` 的 `mask-size` / `mask-repeat`。
- glare 要 `overlay` 混合 + 收黑 + 光心跟指针。
- `site/viewer/tune.js` 是这块的 dev-only 调参面板（`import.meta.env.DEV` 之后才进包）：
  每个旋钮就是 `landing.css` `:root` 的一条自定义属性，默认值从 `getComputedStyle` 读回，
  只有被碰过的项才写进内联样式并记 localStorage——「复制参数」吐出来的那些行就是该固化进
  `landing.css` 的差量。

## 首页缩略图

`site/make_landing_thumbs.py` 把 `cards/<id>/grok-male.png` 立绘抠成透明底 →
`site/public/assets/landing/<id>.webp`（边框泛洪 + 边缘带软 alpha + 反预乘）。缺立绘的格子走占位卡，
工艺和真卡同一套。

**按 alpha 质心居中，不是外接框**：立绘常带单侧长飘带/长发（007 的白发往左拖出 379px），
外接框对称而质量不对称，按框居中会把人物本体推到右边 29px 而其余五张都在 ±5px 内。
`paste_x()` 已改成质心对画布中线 + 夹住不推出画布。

## 改模板前先知道

**删壳页元素前先 grep**：曾因删 `<nav>` 时连带删掉 `#edition`，导致 init 里
`$("edition").textContent` 抛 null、整卡加载失败。页头标签现由 `renderCardNav()` 从清单渲染。
