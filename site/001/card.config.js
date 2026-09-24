// 查看器配置：单一来源，viewer/app.js 通过 import.meta.glob 按路由取。
// 文案改动只改这里；Blender 管线读的是 cards/<卡号>-*/card-config.json。
export default {
  "title": "不染不染",
  "subtitle": "传说 · SSR",
  "technique": "百业 · 初觉 · 流派 · 九九",
  "edition": "No.001",
  "collection": "燕云十六声 · 典藏闪卡 第一弹",
  "description": "暂无",
  "assets": {
    "model": "/assets/001/card.glb",
    "subject": "/assets/001/subject.webp",
    "background": "/assets/001/background.webp",
    "text": "/assets/001/text.webp",
    "lineart": "/assets/001/lineart.webp",
    "back": "/assets/001/back.webp"
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
