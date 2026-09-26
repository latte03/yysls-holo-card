// 查看器配置：单一来源，viewer/app.js 通过 import.meta.glob 按路由取。
// 文案改动只改这里；Blender 管线读的是 cards/<卡号>-*/card-config.json。
export default {
  "title": "梧祈涵",
  "subtitle": "传说 · SSR",
  "technique": "百业 · 初觉 · 流派 · 鸢樽",
  "edition": "No.008",
  "collection": "燕云十六声 · 典藏闪卡 第八弹",
  "description": "燕云十六声典藏系列第八弹 · 传说 SSR No.008。",
  "assets": {
    "model": "/assets/008/card.glb",
    "subject": "/assets/008/subject.webp",
    "background": "/assets/008/background.webp",
    "text": "/assets/008/text.webp",
    "lineart": "/assets/008/lineart.webp",
    "back": "/assets/008/back.webp"
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
