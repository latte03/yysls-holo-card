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
  // 单层卡不写 subjectLayers，合成自动退化成一层。
  // 每层三个量：depth 视差深度、scale 在整体「画面比例」之上的倍率、offset 卡面位移
  // （uv 单位，0.01 = 卡宽 1%）。面板里就是「景深 / 大小 / 左右 / 上下」那四行。
  // mid 不给 src——中层素材就是 assets.subject，这个条目只用来放它的调参，免得和后 /
  // 前层不对称；中层的 depth 也就是「画面景深」那一行管的那个值。
  // 这组深度是调出来的：前层独占区只占 1.6%，94% 的面积都压在人物或后翅上，所以它的滑动
  // 是这张卡主要的立体读数，深度给得比后层多得多；后层则从 0.1 挪到 -0.2，让它反向、和
  // 背景同侧（-0.45 与 -0.2 同符号），翅膀对人物从"同向不同速"变成"反向"——反向比单纯
  // 加大位移好读。两个方向的代价都是拖到极限时层会像从彼此身上滑开。
  "subjectLayers": {
    "back": { "src": "/assets/003/subject_back.webp", "depth": -0.2, "scale": 1, "offset": [0, 0] },
    "mid": { "depth": 0.55, "scale": 1, "offset": [0, 0] },
    "front": { "src": "/assets/003/subject_front.webp", "depth": 1.6, "scale": 1, "offset": [0, 0] }
  },
  "parameters": {
    "subjectScale": 1.0,
    "backgroundDepth": -0.45,
    "foil": 0.65,
    // 逐片元视线比：近层不只位移更大，在卡面上还有梯度（边缘比中心走得远），
    // 静止时也留下"近大远小"的读数。其它四张卡不写这项，保持原来的全局近似。
    "viewFan": 1,
    "depthUnit": 1,
    // 线辉光倍率（缺省 1）。这张的线描是细线，亮起来的像素只有 001 的三分之一，
    // 而辉光原本只能跟着「光泽」滑杆一起变——那样会把整卡的反光也推亮，所以单独加倍率。
    "lineartGlow": 1.4
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
