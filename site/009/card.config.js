// 查看器配置：单一来源，viewer/app.js 通过 import.meta.glob 按路由取。
// 文案改动只改这里；Blender 管线读的是 cards/<卡号>-*/card-config.json。
export default {
  "title": "斯哈哈哈",
  "subtitle": "传说 · SSR",
  "technique": "百业 · 初觉 · 流派 · 无名",
  "edition": "No.009",
  "collection": "燕云十六声 · 典藏闪卡 第九弹",
  "description": "燕云十六声典藏系列第九弹 · 传说 SSR No.009。",
  "assets": {
    "model": "/assets/009/card.glb",
    "subject": "/assets/009/subject.webp",
    "background": "/assets/009/background.webp",
    "text": "/assets/009/text.webp",
    "lineart": "/assets/009/lineart.webp",
    "back": "/assets/009/back.webp"
  },
  // 宽袖版主体比卡面窄不了多少，subjectScale<1 是放大（着色器 su=(uv-.5)*S+.5+offset，
  // 这里 0.76 把人物还原到系列同重量），mid.offset y 正值往下：让冠顶让开上月相饰件。
  "subjectLayers": {
    "mid": { "depth": 0.55, "scale": 1, "offset": [0, 0.075] }
  },
  "parameters": {
    "subjectScale": 0.76,
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
