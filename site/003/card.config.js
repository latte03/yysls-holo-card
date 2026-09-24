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
    "subject": "/assets/003/subject_mid.webp",
    "background": "/assets/003/background.webp",
    "text": "/assets/003/text.webp",
    "lineart": "/assets/003/lineart.webp",
    "back": "/assets/003/back.webp"
  },
  // 主体分三层：后翅膀 / 人物（assets.subject，线辉光也贴这层）/ 鸟头+翅膀。
  // 各自视差深度拉开立体感；单层卡不写这一项，合成自动退化成一层。
  "subjectLayers": {
    "back": { "src": "/assets/003/subject_back.webp", "depth": 0.35 },
    "front": { "src": "/assets/003/subject_front.webp", "depth": 0.75 }
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
