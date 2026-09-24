import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import "./style.css";
// Icons are inline data trees (icons.data.js) — zero sub-imports at runtime,
// so no ad/privacy blocker can kill the page by blocking an icon module.
import { ICON_TREES } from "./icons.data.js";
import { cards } from "../cards.manifest.js";
const icons = ICON_TREES;
// 改查看器行为时顺手改这里：控制台会打印版本号 + 构建时间，用来区分本地/线上/缓存的是哪一版。
const VIEWER_VERSION = "2026-09-24 多层主体 · 逐片元视线比 · 每层独立调参";
const BUILT_AT = new Date(__BUILT_AT__).toLocaleString("zh-CN", { hour12: false });
const $ = (id) => document.getElementById(id);
const stage = $("stage");
const media = matchMedia("(prefers-reduced-motion: reduce)");
// Paired with style.css's two-column breakpoint (>=1024px). Below it the card owns the
// first screen and the info section sits under the fold, so the page has to scroll.
const stacked = matchMedia("(max-width: 1023px)");
// The depth panel is part of the info section on both layouts: re-parent it once here
// instead of moving it between main and the card column on every resize.
document.querySelector(".artwork-bar").append($("parameter-panel"));
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 100);
camera.position.set(0, 0, 20);
const inverse = new THREE.Matrix4();
const reliefLayers = { subject: [], effects: [], text: [] };
let renderer,
  root,
  uniforms,
  config,
  shadow,
  lastTime = 0,
  elapsed = 0;
let auto = false,
  flipped = false,
  dragging = false,
  finish = "pearl",
  zoom = 1;
let targetX = -0.035,
  targetY = -0.15,
  lastPointer = { x: 0, y: 0 },
  noticeTimer;
const settings = [
  ["foil", "uFoil"],
  ["scale", "uScale"],
  ["depth", "uDepth"],
  ["fx-depth", "uFxDepth"],
  ["bg-depth", "uBgDepth"],
];
const vertex = `
varying vec2 vUv;
void main() {
  vUv = vec2(uv.x, 1.0 - uv.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const common = `
precision highp float;
varying vec2 vUv;
uniform float uTime, uFoil, uScale, uDepth, uDepthBack, uDepthFront, uBgDepth, uFinish, uHasLine, uRelief, uSafeScale, uFxDepth, uHasFx, uDepthUnit, uFan, uLineGlow;
uniform float uSizeBack, uSizeMid, uSizeFront;
uniform vec2 uFit, uSafeOffset, uCardSize, uOffsetBack, uOffsetMid, uOffsetFront;
uniform vec3 uView, uEye;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float inside(vec2 p) { return step(0.,p.x)*step(0.,p.y)*step(p.x,1.)*step(p.y,1.); }
// 视线比。uFan=0 时把相机当无穷远，全卡共用一个常数（原来的近似）；
// uFan=1 时按片元位置与该层深度算真实视线方向，于是近层位移更大、而且在卡面上有梯度
// （边缘比中心走得远）。这层梯度是透视有、正交没有的线索，也就是 holo-card-studio
// lenticular 路线在顶点着色器里算 vView 拿到的东西。
vec2 viewRatio(vec2 uv, float depth) {
  vec3 V = uEye - vec3((uv - .5) * uCardSize, depth * uDepthUnit);
  return mix(uView.xy / max(abs(uView.z), .4), V.xy / max(abs(V.z), .35), uFan);
}
vec2 parallax(vec2 uv, float depth) {
  return uv + viewRatio(uv, depth) * depth * .10;
}
// 三张主体层共用同一套缩放/安全区变换，再各自乘一个倍率、加一个位移——面板里每层的
// 「大小 / 左右 / 上下」就是这两个量（uScale 是四张卡共有的整体比例，仍在最外层兜底）。
// 位移加在最后，所以它是卡面 uv 单位、不受缩放影响：0.01 就是卡宽的 1%。
vec2 fitUV(vec2 p, float size, vec2 offset) {
  return ((p-.5)*uScale*size/uFit+.5)*uSafeScale+uSafeOffset+offset;
}
vec3 spectrum(float phase) {
  return .66 + .25 * cos(6.28318 * (phase + vec3(0., .33, .67)));
}
// Only "original" (uFinish ~ 2) disables the foil; pearl/silver/gold all use it.
float strength() { return abs(uFinish - 2.0) < 0.05 ? 0. : uFoil; }
vec3 film(vec2 uv) {
  float phase = uv.x * .85 + uv.y * .55 + uView.x * 1.5 - uView.y * .9;
  if (uFinish > 2.5) {
    // 烫金 (gold foil): warm gold laminate that shifts with the viewing angle.
    float hi = 0.5 + 0.5 * sin(phase * 6.28318);
    float glint = 0.5 + 0.5 * cos((phase + 0.25) * 6.28318);
    vec3 deep = vec3(.72, .50, .20);
    vec3 bright = vec3(1.00, .90, .60);
    return mix(deep, bright, hi * .7 + glint * .3);
  }
  vec3 color = spectrum(phase);
  return mix(color, vec3(dot(color,vec3(.2126,.7152,.0722))), step(.5,uFinish));
}
float sweep(vec2 uv) {
  return pow(.5+.5*sin((uv.x*.72+uv.y*.45+uView.x*1.2+uView.y*.6)*6.283),10.);
}
// ---- v1 (holo-card-studio) foil stack, ported verbatim so both routes share one holo look ----
vec3 overlay(vec3 b,vec3 f){return mix(2.*b*f,1.-2.*(1.-b)*(1.-f),step(vec3(.5),b));}
float v1noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
vec3 v1spectrum(float t){t=fract(t);vec3 pink=vec3(1.,.32,.62),yellow=vec3(1.,.85,.32),blue=vec3(.22,.62,1.);if(t<.35)return mix(pink,yellow,t/.35);if(t<.7)return mix(yellow,blue,(t-.35)/.35);return mix(blue,vec3(1.),(t-.7)/.3);}
float v1wave(vec2 p){vec2 a=p+uView.xy*2.4;return .5+.5*sin((a.x*.848-a.y*.530)*6.283*.55+7.*v1noise(a*1.5));}
vec3 v1foil(vec2 uv){return uFinish>2.5?film(uv):v1spectrum(v1wave(uv)*.8+v1noise(uv*5.)*.12);}
// 扫掠相位本身（还没加幂）。箔光和线辉光共用同一个相位，但各取各的幂：12 是"一道掠过"的锐利带
// （半高宽只占周期 10.7%），6 的亮窗宽约 2.8 倍，描金线的存在感强得多。
float v1phase(vec2 uv){return max(0.,sin((uv.x*.83+uv.y*.35+uView.x*1.8+uView.y*.9)*6.283));}
float v1sweep(vec2 uv){return pow(v1phase(uv),12.);}
float v1star(vec2 p){vec2 q=p*105.,id=floor(q),f=fract(q);float first=9.,second=9.;for(int y=-1;y<=1;y++){for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=vec2(hash(id+g),hash(id+g+43.3));float d=length(g+o-f);if(d<first){second=first;first=d;}else second=min(second,d);}}float edge=1.-smoothstep(.01,.035,second-first);float sparse=step(.90,hash(id+8.8));float twinkle=pow(.5+.5*sin(uTime*1.8+hash(id)*30.+uView.x*27.+uView.y*21.),6.);return edge*sparse*twinkle;}
`;
const frontFragment =
  common +
  `
uniform sampler2D tSubject, tBackground, tText, tLine, tEffects, tSubjectBack, tSubjectFront;
void main() {
  vec2 uv = vUv;
  vec2 su = fitUV(parallax(uv,uDepth),uSizeMid,uOffsetMid);
  vec2 bu = parallax(uv,uBgDepth);
  vec4 subject = texture2D(tSubject,clamp(su,0.,1.));
  subject.a *= inside(su)*(1.-uRelief);
  vec3 bg = texture2D(tBackground,clamp(bu,0.,1.)).rgb;
  vec3 foil = v1foil(uv);
  float amount = strength();
  float band = v1sweep(uv);
  // 线辉光用更宽的那档亮窗（幂 6）：箔光那条带保持锐利原样，只有描金线变"常在"。
  float glowBand = pow(v1phase(uv),6.);
  subject.rgb = mix(subject.rgb,overlay(subject.rgb,foil),amount*.16);
  bg = mix(bg,overlay(bg,foil),amount*.20);
  // 多层主体：后层先压到背景上，中层（tSubject，也是线辉光贴附的那层）之上再压前景层。
  // 每层有自己的视差深度，所以各取各的 UV；单层卡这两张是 1x1 全透明，合成退化回原样。
  vec2 ru = fitUV(parallax(uv,uDepthBack),uSizeBack,uOffsetBack);
  vec4 rear = texture2D(tSubjectBack,clamp(ru,0.,1.));
  rear.a *= inside(ru)*(1.-uRelief);
  rear.rgb = mix(rear.rgb,overlay(rear.rgb,foil),amount*.16);
  vec3 col = mix(mix(bg,rear.rgb,rear.a),subject.rgb,subject.a);
  vec2 fu = fitUV(parallax(uv,uDepthFront),uSizeFront,uOffsetFront);
  vec4 fore = texture2D(tSubjectFront,clamp(fu,0.,1.));
  fore.a *= inside(fu)*(1.-uRelief);
  fore.rgb = mix(fore.rgb,overlay(fore.rgb,foil),amount*.16);
  col = mix(col,fore.rgb,fore.a);
  if (uFinish > 2.5) col = col * vec3(1.02, .95, .78) + vec3(.05, .012, 0.0);
  // Effects layer floats between the subject and the text: above the character,
  // below the typography, with its own mid-depth parallax.
  vec2 eu = parallax(uv,uFxDepth);
  vec4 fx = texture2D(tEffects,clamp(eu,0.,1.));
  col = mix(col,fx.rgb,fx.a*(1.-uRelief)*uHasFx);
  col += foil*band*amount*.16;
  // 星屑由整个主体轮廓遮挡，不只是中间那层——翅膀也要挡住它。
  float solid = 1.-(1.-subject.a)*(1.-rear.a)*(1.-fore.a);
  col += vec3(.66,.86,1.)*v1star(bu)*amount*.45*(1.-solid*.7);
  // 线辉光。窗口取的是「墨量」而不是「有多黑」：各卡的线描墨色差得很远（001 是黑墨，
  // 002/006 是灰墨，003/005 的线本身就只有浅灰），原来 .06–.25 那套只认得出 001 的黑线，
  // 于是线越粗反而越不亮。.30–.85 基本覆盖每张卡的全部墨迹；系数相应从 .35 减到 .18，
  // 让 001 的总亮度维持原样（它的 mask 均值涨了 1.98 倍）。
  float line = (1.-smoothstep(.30,.85,texture2D(tLine,clamp(su,0.,1.)).r))*uHasLine;
  // 辉光色沿线铺开一圈光谱。相位取的是「沿带方向」的梯度（uv.y*.83-uv.x*.35），所以同一条亮线上
  // 从暖到冷一路滑过去；再叠视线项，倾斜时整条线一起淌色。若直接用 band 自己的相位，整条线只会
  // 同色整体变色，静态下看不出彩。系数 .18→.24 是补饱和色相比暖白暗的那三分之一；用 glowBand
  // 而不是 band，是因为幂 12 的亮窗太窄，一条线只在很窄的掠带里亮一下，看着"没存在感"。
  // uLineGlow 是每卡的倍率（parameters.lineartGlow，缺省 1）：辉光原本只能跟着「光泽」滑杆一起变，
  // 有了它 003 这类细线的卡可以单独加强，不用把整卡的反光也推亮。
  vec3 glow = v1spectrum(uView.x*1.1 + uView.y*.55 + uv.y*.83 - uv.x*.35);
  col += glow*line*inside(su)*subject.a*glowBand*amount*.24*uLineGlow;
  vec4 text = texture2D(tText,uv);
  col = mix(col,text.rgb,text.a*(1.-uRelief));
  gl_FragColor = vec4(pow(clamp(col,0.,1.),vec3(2.2)),1.);
  #include <colorspace_fragment>
}
`;
const edgeFragment =
  common +
  `
void main() {
  vec3 col = mix(vec3(.66,.69,.67),film(vUv)*.6+.35,strength()*.7);
  gl_FragColor=vec4(pow(col,vec3(2.2)),1.);
  #include <colorspace_fragment>
}
`;
const backFragment =
  common +
  `
uniform sampler2D tBack;
void main() {
  vec4 art=texture2D(tBack,vec2(1.-vUv.x,vUv.y));
  vec2 p=vUv-.5;
  float filigree=.5+.5*sin(length(p*vec2(1.,1.5))*100.+v1noise(p*15.)*4.);
  vec3 col=mix(vec3(.025,.042,.064),vec3(.085,.092,.11),filigree*.35);
  float border=step(.482,max(abs(p.x),abs(p.y)));
  col=mix(col,v1spectrum(v1wave(vUv))*.5,border);
  col+=v1spectrum(v1wave(vUv))*strength()*.08;
  col=mix(col,art.rgb,art.a);
  gl_FragColor=vec4(pow(clamp(col,0.,1.),vec3(2.2)),1.);
  #include <colorspace_fragment>
}
`;

const subjectFragment = common + `
uniform sampler2D tSubject;
void main() {
  vec4 art=texture2D(tSubject,vUv);
  if(art.a<.06)discard;
  vec2 px=1./vec2(1024.,1630.);
  float inner=min(min(texture2D(tSubject,vUv+vec2(px.x*2.,0.)).a,texture2D(tSubject,vUv-vec2(px.x*2.,0.)).a),min(texture2D(tSubject,vUv+vec2(0.,px.y*2.)).a,texture2D(tSubject,vUv-vec2(0.,px.y*2.)).a));
  vec3 col=art.rgb;
  col+=film(vUv)*sweep(vUv)*strength()*.10;
  col=mix(col,vec3(.86,.72,.40),(1.-inner)*.22);
  gl_FragColor=vec4(pow(clamp(col,0.,1.),vec3(2.2)),art.a);
  #include <colorspace_fragment>
}
`;
const effectsFragment = common + `
uniform sampler2D tEffects;
void main() {
  vec4 art=texture2D(tEffects,vUv);
  // The relief effects layer is a pre-cut RGBA asset: use its real alpha so
  // thorn/spark deco keeps its silhouette instead of a color-channel matte.
  float alpha=art.a;
  if(alpha<.015)discard;
  vec3 col=art.rgb;
  col+=film(vUv)*sweep(vUv)*strength()*.08;
  gl_FragColor=vec4(pow(clamp(col,0.,1.),vec3(2.2)),alpha);
  #include <colorspace_fragment>
}
`;
const textFragment = common + `
uniform sampler2D tText;
void main(){vec4 art=texture2D(tText,vUv);if(art.a<.02)discard;gl_FragColor=vec4(pow(art.rgb,vec3(2.2)),art.a);
  #include <colorspace_fragment>
}
`;

function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}
function addShadow() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 6, 128, 128, 128);
  grad.addColorStop(0, "rgba(29,35,25,0.13)");
  grad.addColorStop(0.4, "rgba(29,35,25,0.055)");
  grad.addColorStop(1, "rgba(29,35,25,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(8.8, 11.8),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(c),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.position.set(0.28, -0.48, -0.5);
  scene.add(shadow);
}
// Render a lucide node tree (["svg", attrs, [children]]) into an svg element.
function renderIconNode(node) {
  const [tag, attrs = {}, children = []] = node;
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  for (const child of children) el.appendChild(renderIconNode(child));
  return el;
}
// The header switch is shared by every card shell, so the whole label is
// rendered here from the registry instead of being hand-written per page.
function renderCardNav() {
  const nav = document.querySelector("[data-card-nav]");
  if (!nav) return;
  const here = location.pathname.replace(/\/+$/, "");
  const current = cards.find((card) => card.route.replace(/\/+$/, "") === here) || cards[0];
  const label = (text) => {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  };
  nav.replaceChildren(
    label("燕云十六声 · 典藏闪卡"),
    label("/"),
    Object.assign(label(""), { id: "edition" }),
    ...cards.map((card) => {
      const a = document.createElement("a");
      a.className = "card-link";
      a.href = card.route;
      a.textContent = card.id;
      if (card.id === current.id) a.setAttribute("aria-current", "page");
      return a;
    }),
  );
  // Seed the edition so it is correct before the async config lands.
  $("edition").textContent = current.edition;
}
function refreshIcons() {
  const overrides = { "stroke-width": 1.5 };
  // icons.data.js is keyed in PascalCase (Play, RotateCcw, SlidersHorizontal …) while
  // the markup uses lucide's hyphenated names (play, rotate-ccw, sliders-horizontal).
  // Looking the raw attribute up never matched, so no icon ever rendered.
  const pascal = (name) =>
    name.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  document.querySelectorAll("[data-lucide]").forEach((el) => {
    const name = el.getAttribute("data-lucide");
    const tree = icons[name] || icons[pascal(name)];
    if (!tree) return;
    const [tag, defaults = {}, children = []] = tree;
    const svg = renderIconNode([tag, { ...defaults, ...overrides }, children]);
    el.replaceChildren(svg);
  });
}
function notice(message) {
  clearTimeout(noticeTimer);
  $("notice").textContent = message;
  $("notice").hidden = false;
  noticeTimer = setTimeout(() => ($("notice").hidden = true), 2600);
}
async function init() {
  refreshIcons();
  renderCardNav();
  // One config module per card, resolved from the route. Vite globs them so
  // each page only pulls its own, and a new card needs no change here.
  const id = location.pathname.split("/").filter(Boolean)[0] || cards[0].id;
  const loaders = import.meta.glob("../*/card.config.js");
  const load = loaders[`../${id}/card.config.js`];
  if (!load) throw Error("未找到编号为 " + id + " 的卡片");
  config = (await load()).default;
  document.title = [config.title, config.collection].filter(Boolean).join(" · ");
  for (const [id, key] of [
    ["card-title", "title"],
    ["subtitle", "subtitle"],
    ["description", "description"],
    ["edition", "edition"],
    ["about-description", "description"],
    ["about-edition", "edition"],
  ])
    $(id).textContent = config[key] || "";
  $("about-title").textContent = [config.subtitle, config.title]
    .filter(Boolean)
    .join(" / ");
  await document.fonts.load("500 42px Atelier");
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
  } catch (error) {
    // First retry with the most permissive context attributes — some setups
    // reject "high-performance" but accept the default.
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
        powerPreference: "default",
        failIfMajorPerformanceCaveat: false,
      });
    } catch (retryError) {
      // No WebGL at all (browser hardware acceleration off): switch to the
      // CSS-3D card — still layered 3D, just without the shader engine.
      fallback3D(retryError);
      return;
    }
  }
  renderer.setClearColor(config.appearance?.background || "#fafafa", 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  stage.append(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");
  const textureLoader = new THREE.TextureLoader();
  const textures = await Promise.all(
    ["subject", "background", "text"].map((name) =>
      textureLoader.loadAsync(config.assets[name]),
    ),
  );
  const line = config.assets.lineart
    ? await textureLoader.loadAsync(config.assets.lineart)
    : new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  line.needsUpdate = true;
  // Optional effects overlay (sparks/thorn deco): drawn between subject and text.
  // A transparent 1x1 fallback keeps the front shader valid without it.
  const hasFx = !!config.assets.effects;
  const effects = hasFx
    ? await textureLoader.loadAsync(config.assets.effects)
    : new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  effects.colorSpace = THREE.NoColorSpace;
  if (!hasFx) effects.needsUpdate = true;
  // Back plate (燕云十六声 lockup + rules + edition): transparent gold art that
  // the shader stamps onto its deep-navy filigree base. Absent it, the back stays plain.
  const hasBack = !!config.assets.back;
  const back = hasBack
    ? await textureLoader.loadAsync(config.assets.back)
    : new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  back.colorSpace = THREE.NoColorSpace;
  if (!hasBack) back.needsUpdate = true;
  // 多层主体的后 / 中 / 前层。单层卡不声明 subjectLayers，这里给 1x1 全透明，
  // 着色器里的合成就退化回原来那种单层结果。
  const layerBack = config.subjectLayers?.back;
  // 中层可以只写 { depth, scale, offset } 而不给 src——素材本来就取 assets.subject，
  // 这个条目只是用来放中层的调参，免得和别的层不对称。
  const layerMid = config.subjectLayers?.mid;
  const layerFront = config.subjectLayers?.front;
  const layerOffset = (layer) =>
    new THREE.Vector2(layer?.offset?.[0] ?? 0, layer?.offset?.[1] ?? 0);
  const transparent = () => {
    const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    tex.needsUpdate = true;
    return tex;
  };
  const rearTex = layerBack?.src ? await textureLoader.loadAsync(layerBack.src) : transparent();
  const foreTex = layerFront?.src ? await textureLoader.loadAsync(layerFront.src) : transparent();
  [...textures, line, effects, back, rearTex, foreTex].forEach((t) => {
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  });
  const p = config.parameters || {};
  const imageAspect = textures[0].image.width / textures[0].image.height;
  const fit =
    config.artworkFit ||
    (config.sourceMode === "reference"
      ? [
          Math.min(0.87, (0.87 * imageAspect) / (2 / 3)),
          Math.min(0.87, (0.87 * (2 / 3)) / imageAspect),
        ]
      : [1, 1]);
  uniforms = {
    tSubject: { value: textures[0] },
    tBackground: { value: textures[1] },
    tText: { value: textures[2] },
    tLine: { value: line },
    tEffects: { value: effects },
    tBack: { value: back },
    tSubjectBack: { value: rearTex },
    tSubjectFront: { value: foreTex },
    uTime: { value: 0 },
    uView: { value: new THREE.Vector3(0, 0, 1) },
    uEye: { value: new THREE.Vector3(0, 0, 20) },
    uCardSize: { value: new THREE.Vector2(6.3, 9.45) },
    uDepthUnit: { value: p.depthUnit ?? 1 },
    uFan: { value: p.viewFan ?? 0 },
    uFit: { value: new THREE.Vector2(...fit) },
    uFoil: { value: p.foil ?? 0.52 },
    uScale: { value: p.subjectScale ?? 1 },
    uDepth: { value: layerMid?.depth ?? p.subjectDepth ?? 0.32 },
    uDepthBack: { value: layerBack?.depth ?? 0 },
    uDepthFront: { value: layerFront?.depth ?? 0 },
    uSizeBack: { value: layerBack?.scale ?? 1 },
    uSizeMid: { value: layerMid?.scale ?? 1 },
    uSizeFront: { value: layerFront?.scale ?? 1 },
    uOffsetBack: { value: layerOffset(layerBack) },
    uOffsetMid: { value: layerOffset(layerMid) },
    uOffsetFront: { value: layerOffset(layerFront) },
    uBgDepth: { value: p.backgroundDepth ?? -0.18 },
    uSafeScale: { value: config.safeArea?.scale ?? 1 },
    // The shader's V axis is flipped relative to Blender's UV space, so the
    // vertical safe-area offset needs a compensating transform (x is identical).
    uSafeOffset: {
      value: new THREE.Vector2(
        config.safeArea?.offset?.[0] ?? 0,
        1 - (config.safeArea?.scale ?? 1) - (config.safeArea?.offset?.[1] ?? 0),
      ),
    },
    uFxDepth: { value: p.effectsDepth ?? 0.14 },
    uHasFx: { value: hasFx ? 1 : 0 },
    uFinish: { value: 0 },
    uHasLine: { value: config.assets.lineart ? 1 : 0 },
    uLineGlow: { value: p.lineartGlow ?? 1 },
    uRelief: { value: config.sourceMode === "relief" ? 1 : 0 },
  };
  const material = (fragment) =>
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.FrontSide,
    });
  const materials = {
    web_front: material(frontFragment),
    web_back: material(backFragment),
    web_edge: material(edgeFragment),
    web_gold: new THREE.MeshBasicMaterial({ color: "#c9a24a" }),
  };
  for (const [role,fragment] of [["web_subject",subjectFragment],["web_effects",effectsFragment],["web_text",textFragment]]) {
    materials[role] = material(fragment);
    materials[role].transparent = true;
    materials[role].depthWrite = role !== "web_effects";
  }
  const gltf = await new GLTFLoader().loadAsync(config.assets.model);
  root = new THREE.Group();
  root.add(gltf.scene);
  scene.add(root);
  let faces = 0;
  gltf.scene.traverse((ob) => {
    if (!ob.isMesh) return;
    const role = ob.material?.name;
    if (role === "web_text" && config.sourceMode !== "relief") {
      ob.visible = false;
      return;
    }
    if (role === "web_front") faces++;
    ob.material = materials[role] || materials.web_edge;
    if (role === "web_subject") reliefLayers.subject.push(ob);
    if (role === "web_effects") reliefLayers.effects.push(ob);
    if (role === "web_text") reliefLayers.text.push(ob);
  });
  if (!faces) throw Error("卡片模型缺少正面材质");
  root.updateMatrixWorld(true);
  // 逐片元视线比要知道片元在卡片局部空间的位置，所以量一下卡体尺寸（root 只有旋转，不含缩放）。
  const cardBox = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
  uniforms.uCardSize.value.set(cardBox.x, cardBox.y);
  for (const meshes of Object.values(reliefLayers)) for (const mesh of meshes) {
    root.attach(mesh);
    mesh.userData.basePosition=mesh.position.clone();
    mesh.userData.baseScale=mesh.scale.clone();
  }
  if (config.sourceMode === "relief" && !reliefLayers.subject.length) throw Error("缺少独立人物层，请重新生成模型");
  addShadow();
  setupControls();
  document
    .querySelectorAll("button[disabled],input[disabled]")
    .forEach((el) => (el.disabled = false));
  new ResizeObserver(resize).observe(stage);
  resize();
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  const shaderErrors = (renderer.info.programs || []).filter(
    (p) => p.diagnostics && !p.diagnostics.runnable,
  );
  if (shaderErrors.length) {
    renderer.dispose();
    renderer.domElement.remove();
    fallback3D(new Error("当前设备无法显示卡面材质"));
    return;
  }
  $("loading").remove();
  root.rotation.set(targetX, targetY, 0);
  window.__holo = {
    ready: true,
    version: VIEWER_VERSION,
    built: BUILT_AT,
    config,
    renderer,
    root,
    uniforms,
    camera,
    reset,
    flip,
    modelSource: config.assets.model,
    layers: reliefLayers,
    getState: () => ({ auto, flipped, finish, zoom }),
  };
  console.info(
    `[holo-card] ${VIEWER_VERSION} · 构建于 ${BUILT_AT} · 卡 ${id} · 主体 ${
      1 + (layerBack ? 1 : 0) + (layerFront ? 1 : 0)
    } 层 · viewFan ${p.viewFan ?? 0} · depthUnit ${p.depthUnit ?? 1}`,
  );
  if (layerBack || layerFront) {
    // 多层卡再补一行每层参数：调完滑杆先看这里，确认页面上生效的是不是配置里那组值。
    const brief = (name, layer) => {
      const [ox = 0, oy = 0] = layer?.offset ?? [];
      return `${name} d${(layer?.depth ?? 0).toFixed(2)} s${(layer?.scale ?? 1).toFixed(2)} o${ox.toFixed(3)},${oy.toFixed(3)}`;
    };
    console.info(
      `[holo-card] 层参数 ${brief("后", layerBack)} ｜ ${brief("中", layerMid ?? { depth: p.subjectDepth })} ｜ ${brief("前", layerFront)}`,
    );
  }
  setFinish(config.appearance?.finish || "pearl");
  setAuto(!media.matches);
  // ?face=back opens straight onto the reverse: flip() also freezes the idle
  // sway, so the back plate reads flat instead of mid-rotation.
  if (new URLSearchParams(location.search).get("face") === "back") flip(true);
  renderer.setAnimationLoop(animate);
}
// Layered 3D card built with CSS 3D transforms — used only when WebGL is
// unavailable (browser hardware acceleration off). It keeps the real depth
// stack: layers float at their configured offsets, the card tilts with the
// pointer, sways when idle, flips to a gold back, and the foil sheen follows
// the cursor. If WebGL comes back, the full shader engine takes over instead.
function fallback3D(error) {
  console.warn("[holo-card] WebGL unavailable, using CSS-3D fallback:", error);
  const roleZ = {
    background: -48,
    effects: -25,
    subject_back: -18,
    subject: -8,
    subject_front: 2,
    lineart: 24,
    text: 28,
  };
  // 多层主体的两层在 config.subjectLayers 里（带各自的视差深度），其余层仍在 config.assets 下。
  const layerSrc = {
    subject_back: config?.subjectLayers?.back?.src,
    subject_front: config?.subjectLayers?.front?.src,
  };
  const wrap = document.createElement("div");
  wrap.className = "fallback3d";
  const flipper = document.createElement("div");
  flipper.className = "flipper3d";
  const card = document.createElement("div");
  card.className = "card3d";
  card.id = "card3d";
  const front = document.createElement("div");
  front.className = "face3d front3d";
  const layers = new Map();
  for (const name of ["background", "effects", "subject_back", "subject", "subject_front", "lineart", "text"]) {
    const src = layerSrc[name] ?? config?.assets?.[name];
    if (!src) continue;
    const layer = document.createElement("div");
    layer.className = "layer3d";
    const img = document.createElement("img");
    img.src = src;
    img.alt = config.title || "卡片";
    img.loading = "eager";
    layer.append(img);
    front.append(layer);
    // White-background line art must not cover the subject: multiply drops the
    // white base and keeps only the dark contour strokes on top of the artwork.
    if (name === "lineart") layer.style.mixBlendMode = "multiply";
    layers.set(name, { el: layer, z: roleZ[name] });
  }
  const foil = document.createElement("div");
  foil.className = "foil3d";
  front.append(foil);
  const back = document.createElement("div");
  back.className = "face3d back3d";
  if (config.assets.back) {
    const plate = document.createElement("img");
    plate.src = config.assets.back;
    plate.alt = config.collection || "卡片背面";
    back.append(plate);
  }
  card.append(front, back);
  flipper.append(card);
  wrap.append(flipper);
  stage.append(wrap);
  $("loading").remove();

  // ---- interaction state (independent of the WebGL path) ----
  let tx = -0.03, ty = -0.06, curX = 0, curY = 0, curFlip = 0, flipTarget = 0;
  let lastMove = 0, sway = !media.matches;
  let scale = 1, depthScale = 1, bgScale = 1;
  // 每层调参在着色器里是采样坐标的变换，退到 CSS 就落成每层自己的 translate/scale。
  // 「景深」没有等价量，用相对基准深度的倍率去缩放该层的 z，至少保住远近的相对关系。
  // subject 与 lineart 共用同一个对象——着色器里 lineart 就是拿 su 采样的，必须跟着中层动。
  const midTune = { size: 1, x: 0, y: 0, depth: 1 };
  const layerTune = {
    subject_back: { size: 1, x: 0, y: 0, depth: 1 },
    subject: midTune,
    lineart: midTune,
    subject_front: { size: 1, x: 0, y: 0, depth: 1 },
  };
  const applyLayers = () => {
    for (const [name, { el, z }] of layers) {
      const s = name === "background" ? bgScale : 1;
      const t = layerTune[name];
      const tune = t
        ? `translate(${(t.x * 100).toFixed(2)}%, ${(t.y * 100).toFixed(2)}%) scale(${t.size}) `
        : "";
      el.style.transform = `${tune}translateZ(${(z * depthScale * s * (t?.depth ?? 1)).toFixed(2)}px)`;
    }
  };
  applyLayers();
  stage.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    tx = Math.max(-0.5, Math.min(0.5, ((e.clientY - r.top) / r.height - 0.5) * 0.9));
    ty = Math.max(-0.5, Math.min(0.5, ((e.clientX - r.left) / r.width - 0.5) * 1.1));
    lastMove = performance.now();
    const c = card.getBoundingClientRect();
    front.style.setProperty("--mx", Math.round(((e.clientX - c.left) / c.width) * 100) + "%");
    front.style.setProperty("--my", Math.round(((e.clientY - c.top) / c.height) * 100) + "%");
  });
  stage.addEventListener("pointerleave", () => { lastMove = 0; });
  const frame = (now) => {
    if (sway && now - lastMove > 1500) {
      const t = now / 1000;
      tx = Math.sin(t * 0.7) * 0.07 + 0.05;
      ty = Math.sin(t * 0.55) * 0.11 - 0.18;
    }
    curX += (tx - curX) * 0.08;
    curY += (ty - curY) * 0.08;
    curFlip += (flipTarget - curFlip) * 0.12;
    flipper.style.transform = `rotateX(${curX.toFixed(4)}rad) rotateY(${curY.toFixed(4)}rad) scale(${scale})`;
    card.style.transform = `rotateY(${curFlip.toFixed(4)}rad)`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // ---- control wiring (mirrors the WebGL controls) ----
  const setFlip = (value) => {
    flipped = value;
    flipTarget = flipped ? Math.PI : 0;
    faceLabels();
  };
  const setAutoUI = (value) => {
    sway = value;
    const b = $("auto");
    if (!b) return;
    b.setAttribute("aria-pressed", String(value));
    b.setAttribute("aria-label", value ? "暂停旋转" : "自动旋转");
    b.title = value ? "暂停旋转" : "自动旋转";
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", value ? "pause" : "play");
    b.replaceChildren(icon);
    refreshIcons();
  };
  const fallbackFinish = (value) => {
    front.classList.remove("finish-gold", "finish-silver", "finish-pearl", "finish-original");
    front.classList.add("finish-" + value);
    document
      .querySelectorAll("[data-finish]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.finish === value)));
    $("finish-name").textContent =
      { pearl: "珠光", silver: "银箔", gold: "烫金", original: "原画" }[value];
    $("foil").disabled = value === "original";
  };
  $("info").disabled = false;
  $("info").onclick = () => $("about").showModal();
  $("front").disabled = false;
  $("front").onclick = () => setFlip(false);
  $("back").disabled = false;
  $("back").onclick = () => setFlip(true);
  const depthToggleFallback = $("depth-toggle");
  if (depthToggleFallback) depthToggleFallback.onclick = () => toggleSettings();
  // The hide/show control cluster that used to sit under the card is gone: it rendered
  // as four unlabelled, icon-less circles there. Flipping stays available through the
  // 正面/背面 buttons and dragging already stops the idle sway, so only the panel's
  // permanent visibility matters here.
  const bindRange = (id, output, fn, decimals = 2) => {
    $(id).disabled = false;
    $(id).addEventListener("input", () => {
      const v = Number($(id).value);
      $(output).textContent = v.toFixed(decimals);
      fn(v);
    });
  };
  bindRange("scale", "scale-value", (v) => { scale = v; });
  bindRange("depth", "depth-value", (v) => {
    depthScale = Math.max(0.1, 1 + v * 4);
    applyLayers();
  });
  bindRange("bg-depth", "bg-depth-value", (v) => {
    bgScale = Math.max(0.1, 1 + v * 4);
    applyLayers();
  });
  // 多层卡的每层调参。这里不用 bindRange：位移要按百分比显示，景深要落成相对倍率。
  if (showLayerPanelGroups()) {
    const declared = config.subjectLayers || {};
    const base = (key) => (key === "mid" ? (declared.mid?.depth ?? 0.55) : 0.1);
    for (const [key, target, targetLayer] of [
      ["back", "subject_back", declared.back],
      ["mid", "subject", declared.mid],
      ["front", "subject_front", declared.front],
    ]) {
      const t = layerTune[target];
      const bind = (id, seed, write, asPercent) => {
        const input = $(id);
        input.disabled = false;
        input.value = seed;
        paintRange(id, asPercent);
        input.addEventListener("input", () => {
          write(Number(input.value));
          paintRange(id, asPercent);
          applyLayers();
        });
      };
      const seedDepth = targetLayer?.depth ?? base(key);
      bind(`${key}-size`, targetLayer?.scale ?? 1, (v) => (t.size = v));
      bind(`${key}-x`, targetLayer?.offset?.[0] ?? 0, (v) => (t.x = v), true);
      bind(`${key}-y`, targetLayer?.offset?.[1] ?? 0, (v) => (t.y = v), true);
      // depth 除基准值得到倍率；基准为 0 时退回 1，免得除出 Infinity。
      const seedMul = base(key) ? seedDepth / base(key) : 1;
      bind(`${key}-depth`, seedMul, (v) => (t.depth = v));
    }
    setupLayerTabs();
    applyLayers();
  }
  document.querySelectorAll("[data-finish]").forEach((b) => {
    b.disabled = false;
    b.onclick = () => fallbackFinish(b.dataset.finish);
  });
  bindRange("foil", "foil-value", (v) => {
    front.style.setProperty("--foil-amount", v);
  }, 0);
  $("foil-value").textContent = Math.round(Number($("foil").value) * 100) + "%";
  front.style.setProperty("--foil-amount", $("foil").value);
  // Seed scale from config; depth sliders start neutral (the layered base
  // offsets above already encode the default depth profile).
  if (config.parameters?.subjectScale) {
    scale = config.parameters.subjectScale;
    $("scale").value = config.parameters.subjectScale;
  }
  applyLayers();
  fallbackFinish(config.appearance?.finish || "gold");
  notice("浏览器未开启 WebGL：已用轻量 3D 模式显示（层次保留）");
  window.__holo = { ready: false, error: String(error), fallback3d: true };
}
function resize() {
  if (!renderer) return;
  const width = stage.clientWidth,
    height = stage.clientHeight;
  const aspect = width / height;
  const halfHeight = Math.max(config.sourceMode === "relief" ? 6.25 : 5.45, 4.5 / aspect) / zoom;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
function setAuto(value) {
  auto = value;
  const button = $("auto");
  if (!button) return;
  button.setAttribute("aria-pressed", String(auto));
  button.setAttribute("aria-label", auto ? "暂停旋转" : "自动旋转");
  button.title = auto ? "暂停旋转" : "自动旋转";
  button.replaceChildren();
  const icon = document.createElement("i");
  icon.setAttribute("data-lucide", auto ? "pause" : "play");
  button.append(icon);
  refreshIcons();
}
function setFinish(value) {
  finish = value;
  uniforms.uFinish.value = { pearl: 0, silver: 1, original: 2, gold: 3 }[value] ?? 3;
  document
    .querySelectorAll("[data-finish]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.finish === value)),
    );
  $("finish-name").textContent = {
    pearl: "珠光",
    silver: "银箔",
    gold: "烫金",
    original: "原画",
  }[value];
  $("foil").disabled = value === "original";
}
function faceLabels() {
  $("front").setAttribute("aria-pressed", String(!flipped));
  $("back").setAttribute("aria-pressed", String(flipped));
}
function flip(value = !flipped) {
  flipped = value;
  setAuto(false);
  targetY = flipped ? Math.PI : 0;
  targetX = 0;
  faceLabels();
}
// Layered relief stack: clearly separated depths so the card reads as a
// lightbox diorama — subject / effects / text each float on their own plane
// (offsets in card-space units, card half-height ≈ 5.45).
const RELIEF_STEP = 0.22;
function layoutRelief() {
  const z = Number($("depth").value);
  const invScale = 1 / Number($("scale").value);
  const place = (meshes, dz) => {
    for (const mesh of meshes) {
      mesh.position.z = z + dz;
      mesh.scale.copy(mesh.userData.baseScale).multiplyScalar(invScale);
    }
  };
  place(reliefLayers.subject, 0);
  place(reliefLayers.effects, RELIEF_STEP);
  place(reliefLayers.text, RELIEF_STEP * 2);
}
// 把滑杆当前值刷到右侧读数与轨道填充上。位移类用百分比显示（0.02 uv = 卡宽 2%），其余两位小数。
function paintRange(id, asPercent = false) {
  const input = $(id);
  const v = Number(input.value);
  $(id + "-value").value = asPercent ? (v * 100).toFixed(1) + "%" : v.toFixed(2);
  const span = Number(input.max) - Number(input.min);
  input.style.setProperty(
    "--fill",
    (span ? ((v - input.min) / span) * 100 : 0).toFixed(1) + "%",
  );
}
function updateInput(id, name) {
  uniforms[name].value = Number($(id).value);
  if (config.sourceMode === "relief") layoutRelief();
  paintRange(id, id === "foil");
}
// 可用于调参的主体层：中层一定有（素材就是 assets.subject），后 / 前层只在声明了才在。
// 单层卡返回空数组，整排 tab 和三组滑杆都藏起来。
function availableLayers() {
  const declared = config.subjectLayers || {};
  if (!declared.back && !declared.front) return [];
  return ["back", "mid", "front"].filter((key) => key === "mid" || declared[key]);
}
// 当前选中的 tab。默认中层；切到不存在的层（或该卡不是多层）时退回可用集合里的第一个。
let layerTab = "mid";
// 层参数组的显示：三组并列成 tab，一次只露一组。
// 多层卡里还要把「画面景深」藏掉——那一行管的正是中层，和「中层 · 景深」是同一根滑杆。
// WebGL 路径与 CSS-3D 降级路径共用。
function showLayerPanelGroups(preferred) {
  const available = availableLayers();
  if (preferred && available.includes(preferred)) layerTab = preferred;
  if (!available.includes(layerTab)) layerTab = available[0];
  document.querySelectorAll(".layer-group").forEach((group) => {
    group.hidden = group.dataset.layer !== layerTab;
  });
  document.querySelectorAll(".layer-tab").forEach((tab) => {
    const on = tab.dataset.layer === layerTab;
    tab.hidden = !available.includes(tab.dataset.layer);
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
  });
  const tabs = document.querySelector(".layer-tabs");
  if (tabs) tabs.hidden = available.length === 0;
  const depthRow = $("depth")?.closest(".range-row");
  if (depthRow) depthRow.hidden = available.length > 0;
  return available.length > 0;
}
function setupLayerTabs() {
  document.querySelectorAll(".layer-tab").forEach((tab) => {
    tab.disabled = false;
    tab.addEventListener("click", () => showLayerPanelGroups(tab.dataset.layer));
  });
}
// 多层主体的每层一组「大小 / 左右 / 上下 / 景深」。单层卡里这几组保持 hidden。
const layerRows = [
  ["back", "uSizeBack", "uOffsetBack", "uDepthBack"],
  ["mid", "uSizeMid", "uOffsetMid", "uDepth"],
  ["front", "uSizeFront", "uOffsetFront", "uDepthFront"],
];
function setupLayerControls() {
  if (!showLayerPanelGroups()) return;
  setupLayerTabs();
  for (const [key, sizeName, offsetName, depthName] of layerRows) {
    const bind = (id, write, asPercent = false) => {
      const input = $(id);
      if (!input) return;
      input.disabled = false;
      input.addEventListener("input", () => {
        write(Number(input.value));
        paintRange(id, asPercent);
      });
    };
    bind(`${key}-size`, (v) => (uniforms[sizeName].value = v));
    bind(`${key}-x`, (v) => (uniforms[offsetName].value.x = v), true);
    bind(`${key}-y`, (v) => (uniforms[offsetName].value.y = v), true);
    bind(`${key}-depth`, (v) => (uniforms[depthName].value = v));
  }
}
// 把 uniform 现值倒灌回层滑杆。setup 与 reset 都走这里，保证「重置」能把层参数拉回配置值。
// 只画当前露出的那组是不够的——切 tab 时要立刻有读数，所以可用的层全画。
function syncLayerInputs() {
  const available = availableLayers();
  for (const [key, sizeName, offsetName, depthName] of layerRows) {
    if (!available.includes(key)) continue;
    const set = (id, v, asPercent = false) => {
      $(id).value = v;
      paintRange(id, asPercent);
    };
    set(`${key}-size`, uniforms[sizeName].value);
    set(`${key}-x`, uniforms[offsetName].value.x, true);
    set(`${key}-y`, uniforms[offsetName].value.y, true);
    set(`${key}-depth`, uniforms[depthName].value);
  }
}
function reset() {
  targetX = -0.035;
  targetY = -0.15;
  zoom = 1;
  flipped = false;
  setAuto(false);
  faceLabels();
  const p = config.parameters || {};
  const layers = config.subjectLayers || {};
  const defaults = {
    foil: p.foil ?? 0.52,
    scale: p.subjectScale ?? 1,
    depth: layers.mid?.depth ?? p.subjectDepth ?? 0.32,
    "fx-depth": p.effectsDepth ?? 0.14,
    "bg-depth": p.backgroundDepth ?? -0.18,
  };
  settings.forEach(([id, name]) => {
    $(id).value = defaults[id];
    updateInput(id, name);
  });
  uniforms.uDepthBack.value = layers.back?.depth ?? 0;
  uniforms.uDepthFront.value = layers.front?.depth ?? 0;
  for (const [key, sizeName, offsetName] of layerRows) {
    const layer = layers[key];
    uniforms[sizeName].value = layer?.scale ?? 1;
    uniforms[offsetName].value.set(
      layer?.offset?.[0] ?? 0,
      layer?.offset?.[1] ?? 0,
    );
  }
  syncLayerInputs();
  setFinish(config.appearance?.finish || "pearl");
  resize();
}
function toggleSettings(show = $("parameter-panel").hidden) {
  // The depth panel is shown by default and switched from the 景深调整 button next to
  // the finish control; no outside-click or Escape dismissal, so it only moves when
  // the button is pressed.
  const panel = $("parameter-panel");
  panel.hidden = !show;
  const button = $("depth-toggle");
  if (button) button.setAttribute("aria-expanded", String(show));
}
function setupControls() {
  if (config.sourceMode === "relief") {
    // Layered card relief: subject base plane 0..0.9, effects/text above it.
    $("depth").min="0.0";$("depth").max="0.9";
    $("scale").min="0.92";$("scale").max="1.3";
  }
  settings.forEach(([id, name]) => {
    $(id).value = uniforms[name].value;
    updateInput(id, name);
    $(id).addEventListener("input", () => updateInput(id, name));
  });
  setupLayerControls();
  syncLayerInputs();
  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    setAuto(false);
    lastPointer = { x: e.clientX, y: e.clientY };
    stage.focus({ preventScroll: true });
    // Stacked layout + a finger: the info section is one scroll away, so vertical
    // gestures must reach the page. Capturing the pointer and adding .dragging
    // (touch-action: none) swallowed them and turned every swipe into a tilt. Without
    // capture the browser keeps pan-y, claims a vertical pan and fires pointercancel
    // (release() stops the rotation), while a horizontal drag still spins the card.
    if (e.pointerType === "touch" && stacked.matches) return;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add("dragging");
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const base = flipped ? Math.PI : 0;
    targetY = THREE.MathUtils.clamp(
      targetY + (e.clientX - lastPointer.x) * 0.006,
      base - 0.65,
      base + 0.65,
    );
    targetX = THREE.MathUtils.clamp(
      targetX + (e.clientY - lastPointer.y) * 0.004,
      -0.36,
      0.36,
    );
    lastPointer = { x: e.clientX, y: e.clientY };
  });
  const release = () => {
    dragging = false;
    stage.classList.remove("dragging");
  };
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) =>
    stage.addEventListener(type, release),
  );
  stage.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom = THREE.MathUtils.clamp(zoom - e.deltaY * 0.001, 0.82, 1.05);
      resize();
    },
    { passive: false },
  );
  stage.addEventListener("keydown", (e) => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "f",
        "F",
        "r",
        "R",
        " ",
      ].includes(e.key)
    )
      return;
    e.preventDefault();
    if (e.key === " ") {
      setAuto(!auto);
      return;
    }
    if (e.key.toLowerCase() === "f") {
      flip();
      return;
    }
    if (e.key.toLowerCase() === "r") {
      reset();
      return;
    }
    setAuto(false);
    const base = flipped ? Math.PI : 0;
    if (e.key === "ArrowLeft") targetY -= 0.08;
    if (e.key === "ArrowRight") targetY += 0.08;
    if (e.key === "ArrowUp") targetX -= 0.06;
    if (e.key === "ArrowDown") targetX += 0.06;
    targetY = THREE.MathUtils.clamp(targetY, base - 0.65, base + 0.65);
    targetX = THREE.MathUtils.clamp(targetX, -0.36, 0.36);
  });
  $("front").onclick = () => flip(false);
  $("back").onclick = () => flip(true);
  const depthToggle = $("depth-toggle");
  if (depthToggle) depthToggle.onclick = () => toggleSettings();
  document
    .querySelectorAll("[data-finish]")
    .forEach((b) => (b.onclick = () => setFinish(b.dataset.finish)));
  // The depth panel is permanent: no toggle button, and no dismissal on an outside
  // click or Escape any more — the controls are meant to stay in view.
  $("info").onclick = () => $("about").showModal();
  $("close-about").onclick = () => $("about").close();
  $("about").onclick = (e) => {
    if (e.target === $("about")) {
      const r = $("about").getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        $("about").close();
    }
  };
  $("save").onclick = saveCard;
  media.addEventListener("change", () => {
    if (media.matches) setAuto(false);
  });
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    renderer.setAnimationLoop(null);
    notice("图形显示已暂停，请刷新页面恢复");
  });
}
function saveCard() {
  try {
    const originalSize = new THREE.Vector2();
    renderer.getSize(originalSize);
    const originalRatio = renderer.getPixelRatio();
    const bounds = {
      left: camera.left,
      right: camera.right,
      top: camera.top,
      bottom: camera.bottom,
    };
    renderer.setPixelRatio(1);
    renderer.setSize(1400, 1800, false);
    const captureHeight = config.sourceMode === "relief" ? 6.4 : 5.4;
    camera.left = -captureHeight*1400/1800;
    camera.right = captureHeight*1400/1800;
    camera.top = captureHeight;
    camera.bottom = -captureHeight;
    camera.updateProjectionMatrix();
    try {
      renderer.render(scene, camera);
      const link = document.createElement("a");
      link.download =
        (config.title || "art-card") +
        "-" +
        (flipped ? "back" : "front") +
        ".png";
      link.href = renderer.domElement.toDataURL("image/png");
      link.click();
      notice("卡片图片已保存");
    } finally {
      Object.assign(camera, bounds);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(originalRatio);
      renderer.setSize(originalSize.x, originalSize.y, false);
      renderer.render(scene, camera);
    }
  } catch (error) {
    console.error(error);
    notice("图片未能保存，请重试");
  }
}
function animate(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.06) || 0;
  lastTime = now;
  if (document.hidden) return;
  if (!media.matches || auto) elapsed += dt;
  if (auto) {
    targetY = Math.sin(elapsed * 0.42) * 0.23 - 0.055;
    targetX = Math.sin(elapsed * 0.53) * 0.055 - 0.018;
  }
  const ease = media.matches ? 1 : 1 - Math.exp(-dt * 8);
  root.rotation.x += (targetX - root.rotation.x) * ease;
  root.rotation.y += (targetY - root.rotation.y) * ease;
  root.updateMatrixWorld(true);
  // uEye 是相机在卡片局部空间的位置（含距离），逐片元视线比用它；uView 是它的方向，光泽/星屑用。
  uniforms.uEye.value
    .copy(camera.position)
    .applyMatrix4(inverse.copy(root.matrixWorld).invert());
  uniforms.uView.value.copy(uniforms.uEye.value).normalize();
  uniforms.uTime.value = media.matches && !auto ? 0 : elapsed;
  shadow.scale.x = 1 - Math.abs(Math.sin(root.rotation.y)) * 0.14;
  renderer.render(scene, camera);
}
const fail = (message) => {
  const loading = $("loading");
  if (loading && window.__holo && window.__holo.ready) return;
  loading?.classList.add("error");
  loading?.setAttribute("role", "alert");
  loading?.replaceChildren();
  const msg = document.createElement("span");
  msg.textContent = message;
  const retry = document.createElement("button");
  retry.textContent = "重新加载";
  retry.onclick = () => location.reload();
  loading?.append(msg, retry);
  window.__holo = { ready: false, error: message };
};
const LOAD_TIMEOUT_MS = 12000;
let settled = false;
Promise.race([
  init().then(() => {
    settled = true;
  }),
  new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("卡片加载超时，请检查网络或刷新重试")),
      LOAD_TIMEOUT_MS,
    ),
  ),
]).catch((error) => {
  if (settled) return;
  console.error(error);
  fail("作品暂时无法加载。\n" + error.message);
});
