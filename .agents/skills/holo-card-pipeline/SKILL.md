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

本技能里出现的 mac 路径（`/Applications/Blender.app`、`~/.agents/skills/holo-card-studio/`、
`/System/Library/Fonts/`、`/Users/<user>/...`）都是旧 mac 机器的写法，本机一律不适用。本机事实：

| 项 | 本机 |
|---|---|
| Blender | **未安装，且建卡不需要**——见第 4 节 |
| Python | `python3`（<toolchain-mgr> shim 3.14.4）+ PIL 12.3.0 + numpy 2.5.1；**没有** scipy/skimage/cv2 |
| 装 python 包 | pip 直连 pypi.org 会超时，必须加 `-i https://<pypi-mirror>/pypi/simple/` |
| Node / pnpm | node 26.5.0、pnpm 12.6.0（<toolchain-mgr> pin）；npm registry 走 `~/.npmrc` 的 <npm-mirror> |
| pnpm 命令 | agent 的 Bash 里先 `export PATH="/c/Users/<user>/AppData/Local/<toolchain-mgr>/shims:$PATH"`，否则拿到 `AppData\Local\pnpm` 的独立版 11.21.0 |
| 字体 | `C:\Windows\Fonts\`，如 `simsun.ttc` / `STKAITI.TTF`（替代 mac 的 `Songti.ttc`） |
| GitHub | 直连 release 下载超时，`<toolchain-mgr> install` 需要活的代理（<proxy-client> 端口不固定） |

**缺素材就先问，不要猜。**

## 0. 开始前必须拿到的东西

缺任何一样就先问用户，不要猜：

| 项 | 说明 |
|---|---|
| 素材目录 | 含 `subject.png`（真透明）、`text.png`（SSR 边框+书法层）、`lineart.png`、`background.png`，均为 1024×1536 |
| 卡号 | 如 `004`，决定目录名 `cards/004-<拼音>/` 与路由 `/004/index.html` |
| 卡名 | 书法牌上的字，同时是页面标题 |
| 流派文案 | 竖牌文字，如 `百业 · 初觉 · 流派 · XX` |
| 第几弹 | 如 `第四弹`，用于页头与首页 |
| 介绍一句 | 页面 `<p id="description">` 的内容 |

**素材预处理好能大幅加速**（用户可先做）：四层都已是 1024×1536、主体是真透明 PNG、
线稿已和主体对准、背景亮度已是最终值。这四项齐备时 prep 基本是直通。

## 1. 建卡目录

```bash
CARD=cards/004-<name>
mkdir -p $CARD/{source,assets,scripts,renders,archive}
mv <交付目录>/{subject,text,lineart,background}.png $CARD/source/
mv $CARD/source/lineart.png $CARD/source/lineart_src.png      # 线稿改名，prep 认这个名
mv $CARD/source/background.png $CARD/source/background_orig.png  # 背景原件快照名
cp cards/003-tingyunyu/scripts/*.py $CARD/scripts/
```

脚本在 `scripts/` 子目录，所以 `ROOT = Path(__file__).resolve().parent.parent`
（001/002 把脚本放根目录，是 `parent`——以文件里实际写的为准）。

改 `scripts/prep_layers.py` 与 `scripts/make_text.py` 里的交付文件名：
`DELIVERY / 'subject.png'`、`DELIVERY / 'text.png'`。

写 `card-config.json`（Blender 管线读这份）：

```json
{
  "mode": "holographic",
  "title": "<卡名>",
  "subtitle": "传说 · SSR",
  "technique": "<流派文案>",
  "edition": "No.004",
  "collection": "燕云十六声 · 典藏闪卡 <第几弹>",
  "description": "<介绍一句>",
  "font": "C:/Windows/Fonts/simsun.ttc",
  "parameters": {"subjectScale": 1.0, "subjectDepth": 0.55, "backgroundDepth": -0.45,
                 "foil": 1.0, "particles": 1.0, "glow": 0.85},
  "safeArea": {"scale": 1.0, "offset": [0, 0]}
}
```

`font` 字段只是记录，真正渲染卡背编号的是 `scripts/make_back.py` 里硬编码的
`font = '/System/Library/Fonts/Supplemental/Songti.ttc'` —— 本机要一并改成 `C:\Windows\Fonts\` 下的字体。
它同时传了 `index=3`（ttc 子字体索引），换字体后索引要重测，否则编号会渲染成另一种字形或失败。

## 2. 背景压暗量（必看）

`scripts/prep_layers.py` 的 `DARKEN` 按交付背景的亮度定。先量再写：

```bash
python3 -c "
from PIL import Image; import numpy as np
a=np.asarray(Image.open('cards/00X-*/source/background_orig.png').convert('L'))
print('mean', round(a.mean(),1))"
```

| 交付背景均值 | DARKEN |
|---|---|
| ~190（白天/亮） | 0.74 |
| ~130（夜景） | 0.92 |
| ~20（深夜空） | 1.0（不再压暗，否则纯黑） |

## 3. 跑管线

```bash
cd cards/00X-<name>
python3 scripts/prep_layers.py      # 主体提饱和/线稿配准/背景压暗 → assets/
python3 scripts/make_text.py        # 边框书法层 → assets/text.png
python3 scripts/make_back.py        # 卡背（共享燕云 logo + 编号）→ assets/back.png
```

**验证点**：prep 会打印 `lineart align <scale> / <dx> / <dy> ncc <x> residual <y>px`。
残差 >5px 时打开 `renders/preview-register.png` 人工看；恒等变换（1.000/0/0）且残差 ≤2px
说明交付时就对好了，属正常。

## 4. 卡壳 GLB（本机默认：复用共享卡壳，不跑 Blender）

三张卡的 `site/public/assets/<id>/card.glb` md5 逐字节相同（`5079d522d4ddc9c3a3c0a02e4c45f9cb`，
23668 字节，glTF 无 image chunk）——它只是卡壳几何（3 mesh + `web_front/web_edge/web_back/web_gold`
四个材质名），五层贴图全部由 `site/viewer/app.js` 从 `/assets/<id>/*.webp` 加载后在着色器里合成。
所以新卡直接复用：

```bash
cp site/public/assets/003/card.glb site/public/assets/00X/
```

只有这两种情况才需要 Blender：要 `renders/hero.png` 目检参考图，或要改卡壳几何本身
（比例、厚度、边框造型）。届时在装了 Blender 的机器上跑（mac 写法，本机无 Blender）：

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python ~/.agents/skills/holo-card-studio/scripts/holographic/build_card.py \
  -- "$(pwd)" --skip-render

/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python ~/.agents/skills/holo-card-studio/scripts/holographic/export_web.py -- "$(pwd)"
```

**不要跑 `tune_glow.py`**：它只改 Blender 侧材质并重渲 hero.png，而 `export_web.py`
另建 `web_front/web_edge/web_back/web_gold` 四个材质，那些改动到不了 GLB。实测跳过后
导出的 GLB 与完整管线逐字节一致（md5 相同），白省约 2.5 分钟。

产物 `web/assets/card.glb` 拷到站点后删掉临时 `web/`。

## 5. 挂载到站点

```bash
S=site
mkdir -p $S/00X $S/public/assets/00X
cp $S/003/index.html $S/00X/index.html          # 壳，逐字节相同
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
  "parameters": {"subjectScale": 1.0, "subjectDepth": 0.55, "backgroundDepth": -0.45, "foil": 0.65},
  "safeArea": {"scale": 1.0, "offset": [0, 0]},
  "appearance": {"background": "#f4f2ee", "finish": "pearl"}
};
```

图层转 WebP（省约 75%，alpha 与 PNG 一致）：

```bash
python3 -c "
from PIL import Image; import pathlib
src=pathlib.Path('cards/00X-*/assets'); dst=pathlib.Path('site/public/assets/00X')
for n in ('subject','background','text','lineart','back'):
    Image.open(src/f'{n}.png').save(dst/f'{n}.webp','WEBP',
        quality=92 if n in ('subject','background') else 95, method=6)"
```

`cards.manifest.js` 加一条（**入口、首页链接、页头卡序全由它驱动，不用改 HTML**）：

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
