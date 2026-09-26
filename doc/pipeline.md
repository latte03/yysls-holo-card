# 建卡管线内部

逐步命令在 [`.agents/skills/holo-card-pipeline/SKILL.md`](../.agents/skills/holo-card-pipeline/SKILL.md)，
本文件记的是**为什么这样做**和**踩过的坑**。

## 共享卡壳：新卡不碰 Blender

**`card.glb` 是共享卡壳，新卡可以完全不碰 Blender。** 八张卡（001/002/003/005/006/007/008/009）的
`site/public/assets/<id>/card.glb` md5 逐字节相同（`5079d522d4ddc9c3a3c0a02e4c45f9cb`，23668 字节，
glTF 里没有 image chunk）：它只有 3 个 mesh 和 `web_front/web_edge/web_back/web_gold` 四个材质名，
subject/background/text/lineart/back 五层贴图全部由 `site/viewer/app.js` 从 `/assets/<id>/*.webp`
加载后在着色器里合成。所以新卡 `cp site/public/assets/003/card.glb site/public/assets/00X/` 就够了。

只有两种情况真需要 Blender：要 `renders/hero.png` 参考图，或要改卡壳几何本身（比例、厚度、
边框造型）。那时用仓库内置的脚本 `.agents/skills/holo-card-pipeline/scripts/holographic/`
（`build_card.py` / `export_web.py`，用法见 SKILL.md 第 4 节）。

一条卡若走 Blender 管线，耗时约 3 分钟，几乎全在渲染（默认不跑 Blender 的建卡流程也是这个量级，
口径见 SKILL.md 开头）。两个可跳过的渲染：

- **`build_card.py --skip-render`**：跳过帧 25 的 Cycles 静帧。实测导出的 GLB 与完整管线
  **逐字节一致**（md5 相同）——GLB 来自 `export_web.py`，与渲染无关。
- **不要跑 `tune_glow.py`**：它只改 Blender 侧材质并重渲 hero.png，而 `export_web.py` 另建
  `web_front/web_edge/web_back/web_gold` 四个材质，那些改动到不了 GLB。

`renders/hero.png` 只是参考图，站点不引用它。需要时再单独跑 `tune_glow.py`。

**`card.blend` 的贴图是 packed 的**：改了 `assets/` 里的 png 不会自动生效，必须重跑 `build_card.py`。

## 交付素材的口径

用户若能预先把四层交付成 1024×1536、主体真透明、线稿已对准、背景亮度已是最终值，
prep 基本是直通（002/003/007 都是恒等对齐，残差分别 ≤2 / ≤2 / 2.8px；判据阈值是 5px）。

**交付的 subject 可能是"假透明"**：先看 `alpha.min()`——整幅 255 就是透明网格被烤进了 RGB
（看着像棋盘格/网点底）。这种图救不回来：角色是白发白衣时，连通性泛洪能保住大轮廓，但
**发丝之间和臂与身之间的封闭背景洞，与领巾/斜挎带是同一族近白色**，颜色阈值和连通性都分不开
（实测按"中性且亮"抠，领巾和带子全被误判成背景）。别硬抠，直接要带 alpha 的那版；
真透明版的特征是 `alpha.min()=0` + 有几万个半透明像素（发梢软边）。

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

**001 不适用 `align_lineart.py`**：它的人物被 prep 裁切并下移过，与原始线稿不是相似变换
关系；001 定稿件残差实测 0px，别去"修"它。同理，001 的 `prep_layers.py` 有裁切 6% 边 +
下移 110px 的专属逻辑，已定稿且不再重跑，脚本就留在 `cards/001-buran/` 原地，别并入公共包；
它的 `darken` 仍写死在自己脚本里（0.74），config 里那份只是记录。

## 背景压暗

**压暗量看交付亮度**：均值 ~190 用 `DARKEN=0.74`，~130 用 0.92，~20 用 1.0。
压暗永远从 `background_orig.png` 算起，不会叠加。

## 线稿辉光

**看"墨的面积"而不是"有多黑"**：管线只认 `L<140` 的墨（`_load_ink`，也是配准打分口径），
着色器窗口又在 `L<76` 就满格——所以"把线画黑一档"不会更亮，"把笔画做粗做实"才会（003 重描版
墨区 4.1%→10.6%，辉光权重 ×2.8，卡上实测 ×4–7）。整幅压暗交付也行，别过 0.55：纸底 252 被
压到 140 以下时整张纸都成了墨。管线侧放宽交付口径的收益因此很小（现稿只剩 1–3%）。

单独加强某张卡用 `parameters.lineartGlow`（缺省 1），它是光泽滑杆之上的倍率，
不必把整卡的反光一起推亮（003 是 1.4）。

## 站点素材格式

**只放 WebP**（省约 75%，alpha 与 PNG 一致，差异只在 alpha<128 的不可见区域）；
PNG 原件留在 `cards/*/assets/`。

**线描那张走"无损优先"**：它只当遮罩用（着色器只读它的 r 通道）且近乎二值，无损 WebP 常比
有损还小、且 mask 逐位相同——实测 002/003/005/007 无损最小（137/111/168/128K，q95 分别是
218/199/260K），001 则是有损 q85 更小（197K vs 无损 289K）。所以线描按"无损与 q85 取小"，
其余层仍按 q95（subject*/background 用 92）。

## 卡背编号只用仓库内字体

`brand/fonts/NotoSerif-SemiBold.ttf`（SIL OFL 1.1，许可证同目录 `OFL.txt`）。`make_back.py` 用
`ROOT / '..' / '..' / 'brand' / 'fonts' / ...` 相对定位，八张卡（含已定稿的 001-003）都靠它，
换机不漂。**不要**改回系统字体路径——mac 的 `Songti.ttc` 与 Windows 的 `simsun.ttc` 都是随
操作系统的授权字体，不能提交进公开仓库，而且换机就渲染不出来。权重用 SemiBold（用户偏好更粗
的编号，Regular 与原 Songti 更接近但偏细），墨迹 y 区间 1321-1342，与 Regular 只差 1px，无需调坐标。
同目录还留着 `NotoSerif-Regular.ttf` 作为该家族的另一个权重。

## 全站正文字体子集

`site/public/fonts/fzjinls.woff2` 由 `site/make_font.py` 从 `brand/fonts/FZJinLS-B-GB.ttf`
裁出。**每加一张卡都要重跑**（卡名新增的汉字不在旧子集里），并用 fontTools 验证码位是否真的
进去了——006 的「塵燼」、007 的「荼喏」都曾经缺字，缺字时浏览器静默回退到宋体，肉眼很容易漏。
`FZJinLS-B-GB.ttf` 本身在 `.gitignore` 里（方正商用授权另议，公开仓库不转载体），但本机那份要留。
