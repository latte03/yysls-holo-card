// 查看器配置：单一来源，viewer/app.js 通过 import.meta.glob 按路由取。
// 文案改动只改这里；Blender 管线读的是 cards/<卡号>-*/card-config.json。
export default {
  "title": "听云屿",
  "subtitle": "传说 · SSR",
  "technique": "百业 · 初觉 · 流派 · 钧钧",
  "edition": "No.003",
  "collection": "燕云十六声 · 典藏闪卡 第三弹",
  "description": "春不渡客便剑指南春",
  "assets": {
    "model": "/assets/003/card.glb",
    "subject": "/assets/003/subject.webp",
    "background": "/assets/003/background.webp",
    "text": "/assets/003/text.webp",
    "lineart": "/assets/003/lineart.webp",
    "back": "/assets/003/back.webp"
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
