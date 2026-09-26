// 查看器配置：单一来源，viewer/app.js 通过 import.meta.glob 按路由取。
// 文案改动只改这里；Blender 管线读的是 cards/<卡号>-*/card-config.json。
export default {
  "title": "荼喏",
  "subtitle": "传说 · SSR",
  "technique": "百业 · 初觉 · 流派 · 尘尘",
  "edition": "No.007",
  "collection": "燕云十六声 · 典藏闪卡 第七弹",
  "description": "燕云十六声典藏系列第七弹 · 传说 SSR No.007。",
  "assets": {
    "model": "/assets/007/card.glb",
    "subject": "/assets/007/subject_mid.webp",
    "background": "/assets/007/background.webp",
    "text": "/assets/007/text.webp",
    "lineart": "/assets/007/lineart.webp",
    "back": "/assets/007/back.webp"
  },
  // 主体两层：人物（mid，线辉光贴这层）+ 压在人物之前的蓝色玫瑰花丛（front）。
  // mid.offset 是卡面 uv 位移（0.01 = 卡宽 1% ≈ 10px / 卡高 1% ≈ 15.4px），x 正值往左、
  // y 正值往下（着色器里 su = uv + offset，内容落在「纹理坐标 − offset」处，两轴同一条代数）。
  // 线辉光用的就是中层那个 su，所以描金线跟着人物一起动，不会错位。
  // y 0.024 ≈ 37px：让发梢让开顶部月相饰件。x 留 0——人物的视觉中心问题在首页缩略图，
  // 那是在 `site/make_landing_thumbs.py` 的贴图位置上调，别在卡面挪。
  "subjectLayers": {
    "mid": { "depth": 0.55, "scale": 1, "offset": [0, 0.08] },
    "front": { "src": "/assets/007/subject_front.webp", "label": "花丛", "depth": 1.2, "scale": 1, "offset": [0, 0.052] }
  },
  "parameters": {
    "subjectScale": 1.0,
    "backgroundDepth": -0.45,
    "foil": 0.65
  },
  "safeArea": {
    "scale": 1.0,
    "offset": [
      0,
      0
    ]
  },
  "appearance": {
    "finish": "pearl"
  }
};
