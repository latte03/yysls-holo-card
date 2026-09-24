// 查看器配置：单一来源，viewer/app.js 通过 import.meta.glob 按路由取。
// 文案改动只改这里；Blender 管线读的是 cards/<卡号>-*/card-config.json。
export default {
  "title": "塵燼",
  "subtitle": "传说 · SSR",
  "technique": "百业 · 初觉 · 流派 · 虹虹",
  "edition": "No.006",
  "collection": "燕云十六声 · 典藏闪卡 第六弹",
  "description": "燕云十六声典藏系列第六弹 · 传说 SSR No.006。",
  "assets": {
    "model": "/assets/006/card.glb",
    "subject": "/assets/006/subject.webp",
    "background": "/assets/006/background.webp",
    "text": "/assets/006/text.webp",
    "lineart": "/assets/006/lineart.webp",
    "back": "/assets/006/back.webp"
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
    "finish": "pearl"
  }
};
