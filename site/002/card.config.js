// 查看器配置：单一来源，viewer/app.js 通过 import.meta.glob 按路由取。
// 文案改动只改这里；Blender 管线读的是 cards/<卡号>-*/card-config.json。
export default {
  "title": "杳杳心",
  "subtitle": "传说 · SSR",
  "technique": "百业 · 初觉 · 流派 · 尘尘",
  "edition": "No.002",
  "collection": "燕云十六声 · 典藏闪卡 第二弹",
  "description": "暂无",
  "assets": {
    "model": "/assets/002/card.glb",
    "subject": "/assets/002/subject.webp",
    "background": "/assets/002/background.webp",
    "text": "/assets/002/text.webp",
    "lineart": "/assets/002/lineart.webp",
    "back": "/assets/002/back.webp"
  },
  "parameters": {
    "subjectScale": 1.0,
    "subjectDepth": 0.55,
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
    "background": "#f4f2ee",
    "finish": "pearl"
  }
};
