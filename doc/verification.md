# 验证怎么做（以及什么不算缺陷）

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

## 无头 Edge/Chrome 截图

`--virtual-time-budget` **只快进定时器、不等真实网络与贴图解码**，所以拍 WebGL 卡面会在
"贴图还没就绪"那一刻落刀。可用做法：同一个 `--user-data-dir` 上**连拍 2~3 遍，只信中间那遍**
（第一遍冷缓存必空，第二遍缓存热了才真渲染）。判据直接用文件大小：空白页面壳 ~18KB，
真渲染 >1MB。**图层多的卡（多层主体）首遍必空**——已上线的 003 也一样空，别把它当成新卡坏了。

深浅色两态要分别拍：`cp -r dist dist-dark` 后改 `<html>` 的 `color-scheme`，别指望一份截图覆盖两态。

## 内置浏览器（Qoder Browser Connector）

要像素级结论又不想跟无头较劲时用它的 `evaluate_script`：`take_screenshot` 在隐藏窗口下必然失败
（`NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`，`visibilityState=hidden`），但脚本执行照常——读
`__holo.ready` / `__holo.uniforms` / DOM 文本，必要时 `renderer.setAnimationLoop(null)` 停摆 +
手摆 `root.rotation` + 重算 `uEye/uView` 再 `render()`，配 `gl.readPixels` 量真实像素
（比截图更可控：能定死一个正对视角、能对比两个 offset 取值）。

注意它不跑 Speculation Rules、rAF 在隐藏态停摆，所以**聚合量只配定方向、不配定幅度**。
