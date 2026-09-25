---
name: holo-card-pipeline
description: 为「燕云十六声 · 典藏闪卡」系列新建一张典藏闪卡并发布上线。当用户给出新卡的素材目录（含 subject/text/lineart/background 四层 PNG）或说"建一张新卡 / 加第 N 弹 / 重新上线"时使用。覆盖：素材归位、线稿配准、Blender 建卡导出 GLB、站点挂载、Vite 构建、Qoder Sites 发布。
metadata:
  requires:
    bins: ["python3", "node", "pnpm"]
---

# 燕云闪卡建卡与发布

一条卡从素材到上线约 3 分钟。按顺序执行，每步都有验证点；任何一步输出异常就停下来报告，不要带着疑问往下跑。

## 本机环境（Windows，`<repo-root>`）

本技能里出现的 mac 路径（`/Applications/Blender.app`、`/System/Library/Fonts/`、`/Users/<user>/...`）
都是旧 mac 机器的写法，本机一律不适用。本机事实：

| 项 | 本机 |
|---|---|
| Blender | **未安装，且建卡不需要**——见第 4 节 |
| Blender 脚本 | 仓库内置 `.agents/skills/holo-card-pipeline/scripts/`，**不要**去 `~/.agents/skills/` 找第三方版本 |
| Python | `python3`（<toolchain-mgr> shim 3.14.4）+ PIL 12.3.0 + numpy 2.5.1 + cv2 5.0.0；**没有** scipy/skimage |
| 装 python 包 | pip 直连 pypi.org 会超时，必须加 `-i https://<pypi-mirror>/pypi/simple/` |
| Node / pnpm | node 26.5.0、pnpm 12.6.0（<toolchain-mgr> pin）；npm registry 走 `~/.npmrc` 的 <npm-mirror> |
| pnpm 命令 | agent 的 Bash 里先 `export PATH="/c/Users/<user>/AppData/Local/<toolchain-mgr>/shims:$PATH"`，否则拿到 `AppData\Local\pnpm` 的独立版 11.21.0 |
| 字体 | 用仓库内 `brand/fonts/NotoSerif-SemiBold.ttf`（SIL OFL），**不要**引用系统字体目录 |
| GitHub | 直连 release 下载超时，`<toolchain-mgr> install` 需要活的代理（<proxy-client> 端口不固定） |

**缺素材就先问，不要猜。**

## 0. 开始前必须拿到的东西

缺任何一样就先问用户，不要猜：

| 项 | 说明 |
|---|---|
| 素材目录 | 含 `subject.png`（**真透明**——`alpha.min()` 要为 0 且有几万个半透明像素做发梢软边；整幅 255 就是透明网格被烤进 RGB 了，见「常见坑」）、`text.png`（SSR 边框+书法层）、`lineart.png`、`background.png`，均为 1024×1536 |
| 卡号 | 如 `008`（004 从未立项，别拿它当"下一个"），决定目录名 `cards/008-<拼音>/` 与路由 `/008/index.html` |
| 卡名 | 书法牌上的字，同时是页面标题 |
| 流派文案 | 竖牌文字，如 `百业 · 初觉 · 流派 · XX` |
| 第几弹 | 如 `第四弹`，用于页头与首页 |
| 介绍一句 | 页面 `<p id="description">` 的内容 |

**素材预处理好能大幅加速**（用户可先做）：四层都已是 1024×1536、主体是真透明 PNG、
线稿已和主体对准、背景亮度已是最终值。这四项齐备时 prep 基本是直通。

线稿另有一条口径：**辉光看"墨的面积"，不看"有多黑"**。管线只认 `L<140` 的墨，着色器窗口
在 `L<76` 就满格，所以把线画得更黑（绕中灰拉对比）一点都不会更亮，要的是"实而匀的深墨"
（003 重描版：墨区 4.1%→10.6%，辉光 ×2.8）。整体压暗交付稿也行，但别过 0.55——纸底 252–255
被压到 140 以下时整张纸都会变成墨。

## 1. 建卡目录

```bash
CARD=cards/00X-<name>
mkdir -p $CARD/{source,assets,renders,archive}
mv <交付目录>/{subject,text,lineart,background}.png $CARD/source/
mv $CARD/source/lineart.png $CARD/source/lineart_src.png      # 线稿改名，与默认交付名一致
mv $CARD/source/background.png $CARD/source/background_orig.png  # 背景原件快照名
```

**不拷脚本。** 管线脚本只有一份，在 `tools/card_pipeline/`，靠 `--card` 定位卡目录；
卡级参数全进 `card-config.json`。交付文件用了非默认名（如 002 的
`Qwen_image_2.1_00020.png`）就在 config 的 `delivery` 里覆盖，不要去改脚本。
默认名：`subject.png` / `text.png` / `lineart_src.png` / `background_orig.png`。

写 `card-config.json`（建卡管线与 Blender 管线共读这份）：

```json
{
  "mode": "holographic",
  "title": "<卡名>",
  "subtitle": "传说 · SSR",
  "technique": "<流派文案>",
  "edition": "No.00X",
  "collection": "燕云十六声 · 典藏闪卡 <第几弹>",
  "description": "<介绍一句>",
  "font": "brand/fonts/NotoSerif-SemiBold.ttf",
  "darken": 0.98,
  "delivery": {"subject": "subject.png", "text": "text.png"},
  "parameters": {"subjectScale": 1.0, "subjectDepth": 0.55, "backgroundDepth": -0.45,
                 "foil": 1.0, "particles": 1.0, "glow": 0.85},
  "safeArea": {"scale": 1.0, "offset": [0, 0]}
}
```

`delivery` 只在交付名不是默认值时才写；`darken` 见第 2 节。

**主体多层**（可选，003 用了）：把 `delivery.subjectLayers` 写成 `{资产层名: source 文件名}`，
层名只认 `subject_back` / `subject_mid` / `subject_front`——按 z 序（后→中→前）读，与 JSON 里怎么写顺序无关：

```json
"delivery": {
  "subjectLayers": {"subject_back": "subject_back.png",
                    "subject_mid": "subject_mid.png",
                    "subject_front": "subject_front.png"}
}
```

`prep_layers.py` 逐层做同样的饱和/对比增强、各落一张 `assets/<层名>.png`，**另外固化一张
`assets/subject.png`**（多层时是并集轮廓）。这张固化层是线稿配准（`align_lineart` 读它）、辉光遮罩
（`la[sa<0.5]=255`）和 `preview-composite.png` 的唯一依据——所以多层卡在 `source/` 里**没有**
`subject.png` 这个文件，别把它当输入去改。
`font` 字段只是记录，真正渲染卡背编号的是 `tools/card_pipeline/make_back.py`，它按
`ROOT / '..' / '..' / 'brand' / 'fonts' / 'NotoSerif-SemiBold.ttf'`（ROOT 即 `--card` 给的卡目录）
相对定位仓库内字体，SIL OFL，许可证在 `brand/fonts/OFL.txt`。**不要改成系统字体路径**：
mac 的 `Songti.ttc` 和 Windows 的 `simsun.ttc` 都是操作系统授权的字体，不能提交进公开仓库，
换机也会渲染失败。

## 2. 背景压暗量（必看）

`darken` 按交付背景的亮度定，写进 `card-config.json`。先量再写：

```bash
python3 -c "
from PIL import Image; import numpy as np
a=np.asarray(Image.open('cards/00X-*/source/background_orig.png').convert('L'))
print('mean', round(a.mean(),1))"
```

| 交付背景均值 | darken |
|---|---|
| ~190（白天/亮） | 0.74 |
| ~130（夜景） | 0.92 |
| ~20（深夜空） | 1.0（不再压暗，否则纯黑） |

缺 `darken` 字段按 1.0 处理——压暗是审美决定，脚本不替你做默认。

## 3. 跑管线

```bash
# 仓库根目录执行，--card 指到卡目录
python3 tools/card_pipeline/prep_layers.py --card cards/00X-<name>   # 主体提饱和/线稿配准/背景压暗 → assets/
python3 tools/card_pipeline/make_text.py   --card cards/00X-<name>   # 边框书法层 → assets/text.png
python3 tools/card_pipeline/make_back.py   --card cards/00X-<name>   # 卡背（共享燕云 logo + 编号）→ assets/back.png
```

**验证点**：prep 会打印 `lineart align <scale> / <dx> / <dy> ncc <x> residual <y>px`。
残差 >5px 时打开 `renders/preview-register.png` 人工看；恒等变换（1.000/0/0）且残差 ≤2px
说明交付时就对好了，属正常。

## 4. 卡壳 GLB（本机默认：复用共享卡壳，不跑 Blender）

六张卡的 `site/public/assets/<id>/card.glb` md5 逐字节相同（`5079d522d4ddc9c3a3c0a02e4c45f9cb`，
23668 字节，glTF 无 image chunk）——它只是卡壳几何（3 mesh + `web_front/web_edge/web_back/web_gold`
四个材质名），五层贴图全部由 `site/viewer/app.js` 从 `/assets/<id>/*.webp` 加载后在着色器里合成。
所以新卡直接复用：

```bash
cp site/public/assets/003/card.glb site/public/assets/00X/
```

只有这两种情况才需要 Blender：要 `renders/hero.png` 目检参考图，或要改卡壳几何本身
（比例、厚度、边框造型）。脚本是**仓库内置**的，在装了 Blender 的机器上、**卡目录里**执行：

```bash
B=../../.agents/skills/holo-card-pipeline/scripts/holographic   # 仓库内置，相对卡目录两层

/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python $B/build_card.py -- "$(pwd)" --skip-render

/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python $B/export_web.py -- "$(pwd)"
```

**`holographic/` 和 `scripts/blender_compat.py` 必须在一起**：`build_card.py` 靠 `parents[1]`
导入后者，只拷其中一个必 ImportError。这两个脚本随技能内置在仓库里，
不要去 `~/.agents/skills/` 找第三方版本。

**不要跑 `tune_glow.py`**：它只改 Blender 侧材质并重渲 hero.png，而 `export_web.py`
另建 `web_front/web_edge/web_back/web_gold` 四个材质，那些改动到不了 GLB。实测跳过后
导出的 GLB 与完整管线逐字节一致（md5 相同），白省约 2.5 分钟。

产物 `web/assets/card.glb` 拷到站点后删掉临时 `web/`。

## 5. 挂载到站点

```bash
S=site
mkdir -p $S/00X $S/public/assets/00X
# 壳页不用手写也不用拷：manifest 加过条目后 pnpm gen:pages 会按模板扇出 site/00X/index.html
#   （pnpm dev / pnpm build 已前置这一步，单独跑一次也行）
# card.glb 已在第 4 节拷好（复用共享卡壳）；若走的是 Blender 路线则：
#   cp cards/00X-*/web/assets/card.glb $S/public/assets/00X/
```

写 `$S/00X/card.config.js`（查看器读这份，ES module）：

```js
export default {
  "title": "<卡名>", "subtitle": "传说 · SSR",
  "technique": "<流派>", "edition": "No.00X",
  "collection": "燕云十六声 · 典藏闪卡 <第几弹>",
  "description": "<介绍一句>",
  "assets": {
    "model": "/assets/00X/card.glb",
    "subject": "/assets/00X/subject.webp",
    "background": "/assets/00X/background.webp",
    "text": "/assets/00X/text.webp",
    "lineart": "/assets/00X/lineart.webp",
    "back": "/assets/00X/back.webp"
  },
  "parameters": {"subjectScale": 1.0, "backgroundDepth": -0.45, "foil": 0.65},
  // 多层主体才写这段：assets.subject 永远是中层（人物），线辉光也贴它。
  // 每层 depth 视差深度、scale 是「画面比例」之上的倍率、offset 是卡面 uv 位移
  // （0.01 = 卡宽 1%）；卡片页面板的「大小 / 左右 / 上下 / 景深」就是这三项加深度。
  // mid 只写调参、不给 src；中层的 depth 到位后 parameters.subjectDepth 就可以删掉。
  // label 是这层装的是什么，只给查看器调参面板的 tab 用（"前层 · 花丛"）。模板里只有中性的
  // 角色名，别去改 card.template.html——每张卡的前/后层内容不同，标签写在自己这份 config 里。
  "subjectLayers": {
    "back":  {"src": "/assets/00X/subject_back.webp",  "label": "翅膀", "depth": -0.2, "scale": 1, "offset": [0, 0]},
    "mid":   {                                          "depth": 0.55, "scale": 1, "offset": [0, 0]},
    "front": {"src": "/assets/00X/subject_front.webp", "label": "花丛", "depth": 1.6,  "scale": 1, "offset": [0, 0]}
  },
  "safeArea": {"scale": 1.0, "offset": [0, 0]},
  "appearance": {"finish": "pearl"}
};
```

图层转 WebP（省约 75%，alpha 与 PNG 一致）：

```bash
python3 -c "
from PIL import Image; import pathlib, io
src=pathlib.Path('cards/00X-*/assets'); dst=pathlib.Path('site/public/assets/00X')
def webp(im, **kw):
    b=io.BytesIO(); im.save(b,'WEBP',method=6,**kw); return b.getvalue()
def smallest(im):
    # 线描只当遮罩用（着色器只读 r 通道）且近乎二值：无损常常比 q85 还小、mask 逐位相同。
    # 实测 002/003/005 无损最小，001 有损 q85 更小，所以两个都编一遍取小的那个。
    return min(webp(im, lossless=True), webp(im, quality=85), key=len)
for n in ('subject','subject_back','subject_mid','subject_front','background','text','lineart','back'):
    p=src/f'{n}.png'
    if not p.exists(): continue     # 单层卡没有 subject_back/mid/front 那三张
    im=Image.open(p)
    data = smallest(im) if n=='lineart' else webp(im,
        quality=92 if n.startswith('subject') or n=='background' else 95)
    (dst/f'{n}.webp').write_bytes(data)"
```

`cards.manifest.js` 加一条（**入口、首页链接、页头卡序全由它驱动，不用改 HTML**）：
首页那段 `<li>`（当前六行，数量跟着清单走别写死）由 `gen-card-pages.mjs` 在 `pnpm dev` / `pnpm build` 前写进 `site/index.html` 的
`<!-- card-list:start/end -->` 标记之间——**那段别手写也别手改**，只改 manifest。

```js
  {
    id: '00X',
    route: '/00X/index.html',
    edition: 'No.00X',
    title: '<卡名>',
    act: '<第几弹>',
  },
```

`route` 必须写显式 `index.html`——托管平台不保证解析裸目录路径。

## 6. 构建与本地验证

```bash
cd site
export PATH="/c/Users/<user>/AppData/Local/<toolchain-mgr>/shims:$PATH"   # 否则 pnpm 拿到独立版 11.21.0
pnpm install
pnpm build
```

`dist/` 即发布物。本地验证用同源 iframe 探针读 `__holo.ready`（静态伺服 dist 后）：

```bash
cd site/dist && python3 -m http.server 4180 --bind 127.0.0.1 &
```

三张以上卡的 iframe 同时开会抢软件 WebGL 资源，可能偶发「作品暂时无法加载 / undefined」，
**这不是站点缺陷**，逐张单独验证才是准的。

## 7. 发布上线

工具：`mcp__plugin_sites_qoder_sites__*`（`get_local_context` / `get_publish_status` /
`prepare_site` / `publish_site` / `show_publish_confirmation`）。

```text
1. get_local_context                                  → 拿 projectRoot 与既有 projectId
2. get_publish_status(actionId=<描述文件里的 actionId>)   → 旧版本状态
3. prepare_site{ actionId: <新 UUID>, projectRoot: <仓库根>,
                 webDirectory: "site/dist", projectId: <既有 projectId> }
4. get_publish_status(actionId) 轮询到 canPublish: true
5. publish_site{ actionId }
6. get_publish_status(actionId) 直到 published: true 且 committed: true
7. show_publish_confirmation{ actionId }               → 交付入口
```

要点：
- `webDirectory` 是 `site/dist`（相对 `projectRoot`，即仓库根 `<repo-root>`），不是 `dist`。
- 每次发布用**新的 actionId**，`projectId` 保持不变。
- 只有 `published: true` 且 `committed: true` 才算发布成功；`canPublish`、上传成功、Canvas 预览都只是中间态。
- 站点：`yanyun-cards-p4207ri6kdw.qoder.zone`，描述文件 `.燕云十六声 · 典藏闪卡.qoder.site` 在仓库根。

## 常见坑

- **交付的 subject 先进管线前验 alpha**：`python3 -c "from PIL import Image; import numpy as np; a=np.asarray(Image.open(p).convert('RGBA'))[...,3]; print(a.min(), (a<16).mean())"`。
  整幅 255 就是**假透明**（导出时把透明网格烤进了 RGB，肉眼看像棋盘/网点底）。这种图硬抠不干净：
  白发白衣与背景是同一族近白色，连通性泛洪能保住大轮廓，但发丝之间、臂与身之间的封闭背景洞
  和领巾/斜挎带分不开（实测按"中性且亮"抠，领巾和带子全被误判成背景）。**别自己抠，让用户重导
  带 alpha 的那版**。跑完 prep 后也有个免费探针：打印里的 `subject transparent` 接近 0 就是它，
  真透明版实测 0.247。
- **card.blend 的贴图是 packed 的**：改了 `assets/` 里的 png 不会自动生效，必须重跑 `build_card.py`。
- **两份配置别混**：Blender 读 `cards/00X-*/card-config.json`（JSON，要在磁盘上）；
  网页读 `site/00X/card.config.js`（ES module）。改文案两处都要改。
- **`public/` 下必须有 `assets/` 一层**：`public/00X/` 会直接挂成 `/00X/`，和卡路由冲突。
- **卡目录必须在站点根部**：`site/00X/`，不能放 `site/cards/00X/`——Vite 按目录结构服务。
- **`background_orig.png` 是压暗的唯一基准**，永远从它算，不会叠加。
- **001 不适用 `align_lineart.py`**：它的人物被 prep 裁切并下移过，与原始线稿不是相似变换关系；
  001 的定稿件残差实测 0px，别去"修"它。
- **线稿对齐必须在全分辨率做 NCC**：粗尺度（96×144）会被糊成色块的墨线边缘骗到，
  偏好 7% 的伪缩放、把裙摆带偏约 50px。
