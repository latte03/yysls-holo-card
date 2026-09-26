import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import "./style.css";
// Icons are inline data trees (icons.data.js) — zero sub-imports at runtime,
// so no ad/privacy blocker can kill the page by blocking an icon module.
import { refreshIcons } from "./icons.js";
import { cssColor, mountThemeToggle, onChange } from "./theme.js";
import { cards } from "../cards.manifest.js";
import { finishes, finishOf, defaultFinish } from "../finishes.js";
// 改查看器行为时顺手改这里：控制台会打印版本号 + 构建时间，用来区分本地/线上/缓存的是哪一版。
const VIEWER_VERSION = "2026-09-25 深浅色手动开关 · 字号上调一档 · 跨页 View Transitions";
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
  ground,
  drop,
  lastTime = 0,
  elapsed = 0;
let auto = false,
  flipped = false,
  dragging = false,
  finish = defaultFinish,
  zoom = 1;
let targetX = -0.035,
  targetY = -0.15,
  lastPointer = { x: 0, y: 0 },
  noticeTimer;
const settings = [
  ["foil", "uFoil"],
  ["foil-sat", "uFoilSat"],
  ["sweep-soft", "uSweepSoft"],
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
uniform float uTime, uFoil, uScale, uDepth, uDepthBack, uDepthFront, uBgDepth, uFinish, uHasLine, uRelief, uSafeScale, uFxDepth, uHasFx, uDepthUnit, uFan, uLineGlow, uFoilSat, uSweepSoft, uHasBand, uHasStar;
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
// 尾段原来是 mix(blue, vec3(1.))：整整 30% 的相位行程在往纯白走，这就是卡面上那层
// "除了彩虹还有一团白光"的一个直接来源。改成蓝→粉闭环，一个周期里始终有彩。
vec3 v1spectrum(float t){t=fract(t);vec3 pink=vec3(1.,.32,.62),yellow=vec3(1.,.85,.32),blue=vec3(.22,.62,1.);if(t<.35)return mix(pink,yellow,t/.35);if(t<.7)return mix(yellow,blue,(t-.35)/.35);return mix(blue,pink,(t-.7)/.3);}
// 彩膜贴膜：保留底图亮度，把膜色的彩度贴上去。原来的 overlay 在亮部走的是
// 1-2(1-b)(1-f)，白衣服那里 b≈.9，结果≈.8+.2f——膜是什么颜色都几乎还是白，于是
// 彩虹只落在暗部、亮部只剩白雾（实测：光泽从 0 拉到 .65，全卡平均彩度不升反降）。
vec3 laminate(vec3 base, vec3 film, float k) {
  float lb = dot(base, vec3(.2126,.7152,.0722));
  float lf = max(dot(film, vec3(.2126,.7152,.0722)), .001);
  return mix(base, film * (lb / lf), k);
}
// 鲜艳度：绕自身亮度拉伸彩度，1 为原样。给滑杆当把手用。
vec3 vivid(vec3 c, float k) { return mix(vec3(dot(c, vec3(.2126,.7152,.0722))), c, k); }
float v1wave(vec2 p){vec2 a=p+uView.xy*2.4;return .5+.5*sin((a.x*.848-a.y*.530)*6.283*.55+7.*v1noise(a*1.5));}
vec3 v1foil(vec2 uv){return uFinish>2.5?film(uv):v1spectrum(v1wave(uv)*.8+v1noise(uv*5.)*.12);}
// 扫掠相位本身（还没加幂）。箔光和线辉光共用同一个相位，但各取各的幂：12 是"一道掠过"的锐利带
// （半高宽只占周期 10.7%），6 的亮窗宽约 2.8 倍，描金线的存在感强得多。
float v1phase(vec2 uv){return max(0.,sin((uv.x*.83+uv.y*.35+uView.x*1.8+uView.y*.9)*6.283));}
float v1sweep(vec2 uv){return pow(v1phase(uv),uSweepSoft);}
// 星屑。原来取的是 second-first，也就是"到最近两颗星的距离之差"——那条等值线画的是 Voronoi
// 胞界（蛛网状细线），不是星点，而一格只有约 3 像素，细线宽 .035 格，等于什么都看不见。
// 改成按"到最近一颗星的距离"取亮窗：真正的圆点星屑，半径约 .4 格，密度 5%，闪烁幂 4（幂 6 时
// 同一瞬间只有两三颗星是亮的，看着像没有）。
float v1star(vec2 p){vec2 q=p*105.,id=floor(q),f=fract(q);float d=9.;vec2 wi=id;for(int y=-1;y<=1;y++){for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=vec2(hash(id+g),hash(id+g+43.3));float dd=length(g+o-f);if(dd<d){d=dd;wi=id+g;}}}float edge=1.-smoothstep(.03,.42,d);float sparse=step(.95,hash(wi+8.8));float twinkle=pow(.5+.5*sin(uTime*1.8+hash(wi)*30.+uView.x*27.+uView.y*21.),4.);return edge*sparse*twinkle;}
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
  vec3 foil = vivid(v1foil(uv), uFoilSat);
  float amount = strength();
  float band = v1sweep(uv);
  // 线辉光用更宽的那档亮窗（幂 6）：箔光那条带保持锐利原样，只有描金线变"常在"。
  float glowBand = pow(v1phase(uv),6.);
  // 权重看着和原来的 .16/.20 差不多，但含义变了：overlay 在亮部几乎不改变颜色，
  // 所以那组数实际上只在暗部起作用；laminate 是全亮度范围都在贴彩膜。
  subject.rgb = laminate(subject.rgb,foil,amount*.18);
  bg = laminate(bg,foil,amount*.22);
  // 多层主体：后层先压到背景上，中层（tSubject，也是线辉光贴附的那层）之上再压前景层。
  // 每层有自己的视差深度，所以各取各的 UV；单层卡这两张是 1x1 全透明，合成退化回原样。
  vec2 ru = fitUV(parallax(uv,uDepthBack),uSizeBack,uOffsetBack);
  vec4 rear = texture2D(tSubjectBack,clamp(ru,0.,1.));
  rear.a *= inside(ru)*(1.-uRelief);
  rear.rgb = laminate(rear.rgb,foil,amount*.18);
  vec3 col = mix(mix(bg,rear.rgb,rear.a),subject.rgb,subject.a);
  vec2 fu = fitUV(parallax(uv,uDepthFront),uSizeFront,uOffsetFront);
  vec4 fore = texture2D(tSubjectFront,clamp(fu,0.,1.));
  fore.a *= inside(fu)*(1.-uRelief);
  fore.rgb = laminate(fore.rgb,foil,amount*.18);
  col = mix(col,fore.rgb,fore.a);
  if (uFinish > 2.5) col = col * vec3(1.02, .95, .78) + vec3(.05, .012, 0.0);
  // Effects layer floats between the subject and the text: above the character,
  // below the typography, with its own mid-depth parallax.
  vec2 eu = parallax(uv,uFxDepth);
  vec4 fx = texture2D(tEffects,clamp(eu,0.,1.));
  col = mix(col,fx.rgb,fx.a*(1.-uRelief)*uHasFx);
  // 亮带原来是纯加色（col += foil*band*…）：整条带宽而泛白，边界读成一条过曝白边。
  // 换成保亮度的贴膜后又太含蓄——只改色不改进，扫光几乎看不出来。现在是两档叠加：
  // 宽的那档仍然只上色，band² 才提亮。幂 7 平方后等于幂 14，加色被压进最亮的那一条
  // （约占周期 5%），所以读的是一道亮芯而不是一片泛白。
  col = laminate(col,foil,band*amount*.34*uHasBand);
  col += foil*band*band*amount*.3*uHasBand;
  // 星屑由整个主体轮廓遮挡，不只是中间那层——翅膀也要挡住它。
  float solid = 1.-(1.-subject.a)*(1.-rear.a)*(1.-fore.a);
  col += vec3(.66,.86,1.)*v1star(bu)*amount*.8*(1.-solid*.7)*uHasStar;
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
  // 压边带。原来是 step(.482,max(abs(p.x),abs(p.y)))——uv 是正方形而卡是 2:3，所以这条带
  // 上下比左右厚 1.5 倍，四角还被卡的圆角切成斜块。改成按卡的真实尺寸校正过的圆角矩形距离
  // 场：四条边等宽，转角跟着半径 .2（与网格圆角同一个值）圆过去。
  vec2 rq=abs(p*uCardSize)-(uCardSize*.5-.09)+.2;
  float rd=min(max(rq.x,rq.y),0.)+length(max(rq,0.))-.2;
  float border=1.-smoothstep(.075,.115,abs(rd));
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

// 两张影子网格共用：顶点段、影子颜色 uniform，以及"抖一下 alpha 再输出"的尾段。
const shadowVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1. );
}`;
// 影子的颜色来自 CSS 的 --stage-shadow（注册成 <color>，所以读回来是解好的 rgb()）。
// 走 uniform 而不是拼进着色器源码：切深浅色时只改一个数，不用重建材质。
const uShadowColor = { value: new THREE.Color(0.11, 0.14, 0.1) };
const shadowFragmentHead = `
uniform vec3 uShadowColor;
varying vec2 vUv;
`;
const shadowTail = `
  // 屏幕空间抖动：峰值 alpha 只有几十级，摊在浅色纸面上会印出一圈圈等值线。
  a += ( fract( sin( dot( mod( gl_FragCoord.xy, 1024. ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) - .5 ) * 3. / 255.;
  gl_FragColor = vec4( uShadowColor, max( a, 0. ) );
  #include <colorspace_fragment>
}`;
function readShadowColor() {
  const parts = cssColor("--stage-shadow").match(/[\d.]+/g) || [];
  // 直接除以 255、不做 sRGB 反解，和这段之前把 "29, 35, 25" 塞进源码时一模一样。
  return parts.slice(0, 3).map((n) => (Number(n) || 0) / 255);
}
// 舞台上"不在 CSS 里"的两处颜色：画布底色和影子。CSS 换方案时这里跟着重取一次。
function paintStagePalette() {
  const [r, g, b] = readShadowColor();
  uShadowColor.value.setRGB(r, g, b);
  if (renderer)
    renderer.setClearColor(
      cssColor("--paper") || "#ffffff",
      1,
    );
}
// 落地影：贴着卡片底边的一条扁椭圆接触影，比卡片宽一点、只有它高的一成。
function addGroundShadow(cardHeight) {
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(7.6, 1.6),
    new THREE.ShaderMaterial({
      uniforms: { uShadowColor },
      transparent: true,
      depthWrite: false,
      vertexShader: shadowVertex,
      fragmentShader: `${shadowFragmentHead}
void main() {
  vec2 d = ( vUv - .5 ) * vec2( 2.0, 2.6 );
  float a = .2 * pow( max( 1. - length( d ), 0. ), 1.6 );${shadowTail}`,
    }),
  );
  ground.position.set(0.25, -cardHeight / 2 - 0.02, -0.55);
  scene.add(ground);
}
// 卡片投在背景上的影，相当于 box-shadow：跟着卡片一起转的圆角矩形软影，往右下偏一点。
// 关键是形状贴着卡的轮廓——上一版用圆形，圆在矩形卡上必然角上露得多、边上露得少，
// 于是既读成"投影跑到卡片里面"，又自带一圈圈等值线。
function addDropShadow(cardWidth, cardHeight) {
  const margin = 1.45;
  drop = new THREE.Mesh(
    new THREE.PlaneGeometry(cardWidth * margin, cardHeight * margin),
    new THREE.ShaderMaterial({
      uniforms: { uShadowColor },
      transparent: true,
      depthWrite: false,
      vertexShader: shadowVertex,
      fragmentShader: `${shadowFragmentHead}
float rrect( vec2 p, vec2 b, float r ) {
  vec2 q = abs( p ) - b + r;
  return min( max( q.x, q.y ), 0. ) + length( max( q, 0. ) ) - r;
}
void main() {
  // 平面比卡大 margin 倍，所以卡的半轮廓就落在 .69 处；偏移量取右下，约半个 blur 半径。
  float a = 1. - smoothstep( -.04, .2, rrect( ( vUv - .5 ) * 2. - vec2( .03, -.045 ), vec2( .69 ), .08 ) );
  a *= .16;${shadowTail}`,
    }),
  );
  drop.position.set(0, 0, -0.55);
  root.add(drop);
}
// ---- 每张卡可换的三块：贴图 / 配置 uniform / 文案 ----
// 卡壳 GLB 五张卡逐字节相同、六个材质是共享的 ShaderMaterial，所以"换一张卡"在 WebGL 侧
// 只是换贴图、重算一批 uniform、改文案。init 和软导航共用这三个函数，保证两条路完全一致。
async function loadCardTextures(cfg) {
  const loader = new THREE.TextureLoader();
  const blank = (rgba) => {
    const tex = new THREE.DataTexture(new Uint8Array(rgba), 1, 1);
    tex.needsUpdate = true;
    return tex;
  };
  const [subject, background, text] = await Promise.all(
    ["subject", "background", "text"].map((name) => loader.loadAsync(cfg.assets[name])),
  );
  // 线稿缺席时给 1x1 纯白：multiply 之后等于没有这一层。
  const line = cfg.assets.lineart
    ? await loader.loadAsync(cfg.assets.lineart)
    : blank([255, 255, 255, 255]);
  const hasFx = !!cfg.assets.effects;
  const effects = hasFx ? await loader.loadAsync(cfg.assets.effects) : blank([0, 0, 0, 0]);
  const back = cfg.assets.back ? await loader.loadAsync(cfg.assets.back) : blank([0, 0, 0, 0]);
  // 多层主体的后 / 前层。单层卡不声明 subjectLayers，这里给 1x1 全透明，
  // 着色器里的合成就退化回单层结果。
  const rear = cfg.subjectLayers?.back?.src
    ? await loader.loadAsync(cfg.subjectLayers.back.src)
    : blank([0, 0, 0, 0]);
  const fore = cfg.subjectLayers?.front?.src
    ? await loader.loadAsync(cfg.subjectLayers.front.src)
    : blank([0, 0, 0, 0]);
  const tex = {
    tSubject: subject,
    tBackground: background,
    tText: text,
    tLine: line,
    tEffects: effects,
    tBack: back,
    tSubjectBack: rear,
    tSubjectFront: fore,
  };
  for (const t of Object.values(tex)) {
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  return { tex, hasFx };
}
// 只由卡配置决定、与滑杆无关的那批 uniform（构图 / 安全区 / 层参数 / 模式开关）。
function configUniformValues(cfg, pack) {
  const p = cfg.parameters || {};
  const layers = cfg.subjectLayers || {};
  const offset = (layer) =>
    new THREE.Vector2(layer?.offset?.[0] ?? 0, layer?.offset?.[1] ?? 0);
  const imageAspect = pack.tex.tSubject.image.width / pack.tex.tSubject.image.height;
  const fit =
    cfg.artworkFit ||
    (cfg.sourceMode === "reference"
      ? [
          Math.min(0.87, (0.87 * imageAspect) / (2 / 3)),
          Math.min(0.87, (0.87 * (2 / 3)) / imageAspect),
        ]
      : [1, 1]);
  return {
    uDepthUnit: p.depthUnit ?? 1,
    uFan: p.viewFan ?? 0,
    uFit: new THREE.Vector2(...fit),
    uFoil: p.foil ?? 0.52,
    uFoilSat: p.foilSat ?? 1.35,
    uSweepSoft: p.sweepSoft ?? 7,
    uScale: p.subjectScale ?? 1,
    uDepth: layers.mid?.depth ?? p.subjectDepth ?? 0.32,
    uDepthBack: layers.back?.depth ?? 0,
    uDepthFront: layers.front?.depth ?? 0,
    uSizeBack: layers.back?.scale ?? 1,
    uSizeMid: layers.mid?.scale ?? 1,
    uSizeFront: layers.front?.scale ?? 1,
    uOffsetBack: offset(layers.back),
    uOffsetMid: offset(layers.mid),
    uOffsetFront: offset(layers.front),
    uBgDepth: p.backgroundDepth ?? -0.18,
    uSafeScale: cfg.safeArea?.scale ?? 1,
    // The shader's V axis is flipped relative to Blender's UV space, so the
    // vertical safe-area offset needs a compensating transform (x is identical).
    uSafeOffset: new THREE.Vector2(
      cfg.safeArea?.offset?.[0] ?? 0,
      1 - (cfg.safeArea?.scale ?? 1) - (cfg.safeArea?.offset?.[1] ?? 0),
    ),
    uFxDepth: p.effectsDepth ?? 0.14,
    uHasFx: pack.hasFx ? 1 : 0,
    uHasLine: cfg.assets.lineart ? 1 : 0,
    uLineGlow: p.lineartGlow ?? 1,
    uRelief: cfg.sourceMode === "relief" ? 1 : 0,
  };
}
const COPY_FIELDS = [
  ["card-title", "title"],
  ["subtitle", "subtitle"],
  ["description", "description"],
  ["edition", "edition"],
  ["about-description", "description"],
  ["about-edition", "edition"],
];
// DOM 侧的"换卡"：标题文案、页头卡序的高亮、层面板的可用集合、默认工艺。
function applyCardDom(cfg) {
  document.title = [cfg.title, cfg.collection].filter(Boolean).join(" · ");
  for (const [id, key] of COPY_FIELDS) $(id).textContent = cfg[key] || "";
  $("about-title").textContent = [cfg.subtitle, cfg.title].filter(Boolean).join(" / ");
  renderCardNav();
  showLayerPanelGroups();
  setFinish(cfg.appearance?.finish || defaultFinish);
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
      // 还在做的卡在页头也只占一个位：<span> 而不是 <a>，软导航只认 a[href]、卡序的
      // hover 预加载只认 .card-link，两条接线都自动放过它，不需要额外判断。
      if (card.wip) {
        const s = document.createElement("span");
        s.className = "card-wip";
        s.textContent = card.id;
        s.title = card.wip;
        return s;
      }
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
// 工艺色板整排由注册表渲染，模板里只留一个空容器：加一种工艺不用碰 HTML。
// applyFinish 由实际生效的那条渲染路径注入（WebGL 的 setFinish / 回退的 fallbackFinish），
// 于是点击接线只有一处，两条路径各自只负责"怎么把工艺落到画面上"。
let applyFinish = null;
function renderFinishSwatches() {
  const row = document.querySelector(".swatches");
  if (!row) return;
  row.replaceChildren(
    ...finishes.map((f) => {
      const b = document.createElement("button");
      b.className = "swatch " + f.id;
      b.dataset.finish = f.id;
      b.setAttribute("aria-pressed", String(f.id === finish));
      b.setAttribute("aria-label", f.label);
      b.title = f.label;
      // 与模板里原来的写法一致：卡片就绪后由统一的 enable 步骤打开。
      b.disabled = true;
      b.onclick = () => applyFinish?.(f.id);
      return b;
    }),
  );
}
function paintFinishUI(id) {
  const f = finishOf(id);
  document
    .querySelectorAll("[data-finish]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.finish === f.id)),
    );
  $("finish-name").textContent = f.label;
  $("foil").disabled = !!f.noFoil;
  return f;
}
function notice(message) {
  clearTimeout(noticeTimer);
  $("notice").textContent = message;
  $("notice").hidden = false;
  noticeTimer = setTimeout(() => ($("notice").hidden = true), 2600);
}
async function init() {
  refreshIcons();
  // 深浅色开关要在建 WebGL 上下文之前就接上：回退到 CSS-3D 的那条路会直接 return，
  // 挂在后面就没了。画布底色和影子色不在 CSS 里，所以切换时回调 paintStagePalette。
  mountThemeToggle($("theme"));
  onChange(paintStagePalette);
  renderCardNav();
  renderFinishSwatches();
  // One config module per card, resolved from the route. Vite globs them so
  // each page only pulls its own, and a new card needs no change here.
  const id = location.pathname.split("/").filter(Boolean)[0] || cards[0].id;
  const loaders = import.meta.glob("../*/card.config.js");
  const load = loaders[`../${id}/card.config.js`];
  if (!load) throw Error("未找到编号为 " + id + " 的卡片");
  config = (await load()).default;
  document.title = [config.title, config.collection].filter(Boolean).join(" · ");
  await document.fonts.load("500 46px FZJinLi");
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
  // 舞台底色跟着 CSS 的 --paper：画布和页面本来就是同一张"纸"，两处各写一个色号必然对不齐。
  paintStagePalette();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  stage.append(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");
  const pack = await loadCardTextures(config);
  uniforms = {
    ...Object.fromEntries(
      Object.entries(pack.tex).map(([name, value]) => [name, { value }]),
    ),
    ...Object.fromEntries(
      Object.entries(configUniformValues(config, pack)).map(([name, value]) => [
        name,
        { value },
      ]),
    ),
    uTime: { value: 0 },
    uView: { value: new THREE.Vector3(0, 0, 1) },
    uEye: { value: new THREE.Vector3(0, 0, 20) },
    uCardSize: { value: new THREE.Vector2(6.3, 9.45) },
    // 下面两个只为 ?debug=fx 的二分开关存在，正常渲染恒为 1。
    uHasBand: { value: 1 },
    uHasStar: { value: 1 },
    uFinish: { value: 0 },
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
    // 内圈那道古金细边不要了（卡面自己就有描金线，再套一圈固定的金框会糊）。外圈的全息
    // 压边留着——它是卡片厚度之外唯一那条"彩色压边"，去掉之后卡的轮廓会显得生硬。
    if (/^内圈/.test(ob.name)) {
      ob.visible = false;
      return;
    }
    // 材质先换上再谈可见性：非 relief 卡只是把文字层藏起来，换卡到 relief 模式时还要能
    // 把它点亮，所以它必须一开始就拿着我们的 web_text 材质，而不是 GLB 里那个空材质。
    ob.material = materials[role] || materials.web_edge;
    if (role === "web_text") ob.visible = config.sourceMode === "relief";
    if (role === "web_front") faces++;
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
  addGroundShadow(cardBox.y);
  addDropShadow(cardBox.x, cardBox.y);
  setupControls();
  applyCardDom(config);
  setupSoftNav();
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
    softNavigate,
    bundles: () => [...bundles.keys()],
    modelSource: config.assets.model,
    layers: reliefLayers,
    getState: () => ({ auto, flipped, finish, zoom }),
  };
  const bootLayers = config.subjectLayers || {};
  const bootParams = config.parameters || {};
  console.info(
    `[holo-card] ${VIEWER_VERSION} · 构建于 ${BUILT_AT} · 卡 ${id} · 主体 ${
      1 + (bootLayers.back ? 1 : 0) + (bootLayers.front ? 1 : 0)
    } 层 · viewFan ${bootParams.viewFan ?? 0} · depthUnit ${bootParams.depthUnit ?? 1}`,
  );
  if (bootLayers.back || bootLayers.front) {
    // 多层卡再补一行每层参数：调完滑杆先看这里，确认页面上生效的是不是配置里那组值。
    const brief = (name, layer) => {
      const [ox = 0, oy = 0] = layer?.offset ?? [];
      return `${name} d${(layer?.depth ?? 0).toFixed(2)} s${(layer?.scale ?? 1).toFixed(2)} o${ox.toFixed(3)},${oy.toFixed(3)}`;
    };
    console.info(
      `[holo-card] 层参数 ${brief("后", bootLayers.back)} ｜ ${brief(
        "中",
        bootLayers.mid ?? { depth: bootParams.subjectDepth },
      )} ｜ ${brief("前", bootLayers.front)}`,
    );
  }
  applyCardDom(config);
  // 软导航的记账：当前卡、当前绑在 uniform 上的那套贴图、以及带 state 的首条历史。
  currentId = id;
  livePack = pack;
  history.replaceState({ holo: id }, "", location.href);
  setAuto(!media.matches);
  // ?face=back opens straight onto the reverse: flip() also freezes the idle
  // sway, so the back plate reads flat instead of mid-rotation.
  if (new URLSearchParams(location.search).get("face") === "back") flip(true);
  setupFxDebug();
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
  stage.addEventListener("dblclick", () => setFlip(!flipped));
  const frame = (now) => {
    if (sway && now - lastMove > 1500) {
      const t = now / 1000;
      // 与 animate() 里主路径的自摆同步加大（那边 ±0.34 / ±0.10），回退路径别显得更安静。
      tx = Math.sin(t * 0.7) * 0.14 + 0.05;
      ty = Math.sin(t * 0.55) * 0.22 - 0.18;
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
    const f = paintFinishUI(value);
    front.classList.remove(...finishes.map((x) => "finish-" + x.id));
    front.classList.add("finish-" + f.id);
  };
  applyFinish = fallbackFinish;
  $("info").disabled = false;
  $("info").onclick = () => $("about").showModal();
  $("front").disabled = false;
  $("front").onclick = () => setFlip(false);
  $("back").disabled = false;
  $("back").onclick = () => setFlip(true);
  $("auto").disabled = false;
  $("auto").onclick = () => setAutoUI(!sway);
  // setAutoUI 在回退路径里此前从没被调用过：按钮会停在模板里的 play，而 sway 其实已经是
  // true（非 reduce 时默认自摆）。这里补一次，让图标和真实状态对齐。
  setAutoUI(sway);
  const depthToggleFallback = $("depth-toggle");
  if (depthToggleFallback) depthToggleFallback.onclick = () => toggleSettings();
  // 卡片下面那排圆形小按钮早就删了（当时既没图标也没标签）：翻面交给 正面/背面，拖拽本身
  // 就会打断自摆，所以回退路径这里只需要接上景深面板的开关。
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
  // 点击接线在 renderFinishSwatches 里统一走 applyFinish，这里只负责解禁。
  document.querySelectorAll("[data-finish]").forEach((b) => (b.disabled = false));
  bindRange("foil", "foil-value", (v) => {
    front.style.setProperty("--foil-amount", v);
  }, 0);
  // 只有着色器里才有的量（鲜艳度、扫光柔和度）：CSS 回退没有对应物，整行收起，
  // 不留一堆拖了没反应的滑杆。标记方式见模板里的 data-webgl-only。
  document
    .querySelectorAll(".foil-row[data-webgl-only]")
    .forEach((row) => (row.style.display = "none"));
  $("foil-value").textContent = Math.round(Number($("foil").value) * 100) + "%";
  front.style.setProperty("--foil-amount", $("foil").value);
  // Seed scale from config; depth sliders start neutral (the layered base
  // offsets above already encode the default depth profile).
  if (config.parameters?.subjectScale) {
    scale = config.parameters.subjectScale;
    $("scale").value = config.parameters.subjectScale;
  }
  applyLayers();
  fallbackFinish(config.appearance?.finish || defaultFinish);
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
  const f = paintFinishUI(value);
  finish = f.id;
  uniforms.uFinish.value = f.glsl;
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
  paintRange(id, id === "foil" || id === "foil-sat");
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
// 每张卡的前/后层装的是什么各不相同（003 是翅膀和鸟头、007 是花丛），所以模板里只留
// 角色名，具体是什么由 card.config.js 的 subjectLayers.<层>.label 写；中层恒为人物，
// 给个默认值就不必每张卡都声明。软导航换卡时 applyCardDom 会再跑一遍，标签跟着换。
const LAYER_ROLE = { back: "后层", mid: "中层", front: "前层" };
const LAYER_DEFAULT_NAME = { mid: "人物" };
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
    const key = tab.dataset.layer;
    const name = config.subjectLayers?.[key]?.label ?? LAYER_DEFAULT_NAME[key];
    tab.textContent = name ? `${LAYER_ROLE[key]} · ${name}` : LAYER_ROLE[key];
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
  setFinish(config.appearance?.finish || defaultFinish);
  resize();
}
function toggleSettings(show = $("parameter-panel").hidden) {
  // 景深面板默认收起（模板里就带 hidden），要点 景深调整 才展开；不点外面、不按 Esc 关它，
  // 所以只有那个按钮会动它。
  const panel = $("parameter-panel");
  panel.hidden = !show;
  const button = $("depth-toggle");
  if (button) button.setAttribute("aria-expanded", String(show));
}
// ?debug=fx：效果二分面板。用途是定位"某条看得见的边界属于哪一层"——每个开关都走最便宜
// 的实现（改 uniform / 换 1×1 全透明纹理 / 翻 visible），不碰着色器结构，也不进正式界面。
function setupFxDebug() {
  if (new URLSearchParams(location.search).get("debug") !== "fx") return;
  const u = uniforms;
  const blank = document.createElement("canvas");
  blank.width = blank.height = 1;
  blank.getContext("2d").clearRect(0, 0, 1, 1);
  const foilBase = u.uFoil.value;
  const lineBase = u.uHasLine.value;
  const depthBase = {};
  for (const n of ["uDepth", "uDepthBack", "uDepthFront", "uBgDepth", "uFxDepth"])
    depthBase[n] = u[n].value;
  const texBase = { tText: u.tText.value.image, tLine: u.tLine.value.image };
  const byName = (re) => {
    const out = [];
    root.traverse((o) => {
      if (o.isMesh && re.test(o.name)) out.push(o);
    });
    return out;
  };
  const vis = (list) => (on) => list.forEach((m) => (m.visible = on));
  const swapTex = (name, base) => (on) => {
    u[name].value.image = on ? base : blank;
    u[name].value.needsUpdate = true;
  };
  const fx = [
    ["彩膜（光泽）", (on) => (u.uFoil.value = on ? foilBase : 0)],
    ["扫光亮带", (on) => (u.uHasBand.value = on ? 1 : 0)],
    ["星屑", (on) => (u.uHasStar.value = on ? 1 : 0)],
    ["描金线辉光", (on) => (u.uHasLine.value = on ? lineBase : 0)],
    [
      "层间视差（全部深度）",
      (on) => {
        for (const n in depthBase) u[n].value = on ? depthBase[n] : 0;
      },
    ],
    ["文字层纹理", swapTex("tText", texBase.tText)],
    ["线稿纹理", swapTex("tLine", texBase.tLine)],
    ["正面网格", vis(byName(/^主体平面_·_完整视差合成网格$/))],
    ["斜边网格", vis(byName(/^主体平面_·_完整视差合成网格_1$/))],
    ["背面网格", vis(byName(/^主体平面_·_完整视差合成网格_2$/))],
    ["外圈压边", vis(byName(/^外圈/))],
    ["落地影", (on) => (ground ? (ground.visible = on) : null)],
    ["背景投影", (on) => (drop ? (drop.visible = on) : null)],
  ];
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;left:8px;top:8px;z-index:9999;background:rgba(255,255,255,.94);" +
    "border:1px solid #d8d4cc;border-radius:8px;padding:8px 10px;font:11px/1.7 system-ui;" +
    "color:#242625;max-height:80svh;overflow:auto";
  const title = document.createElement("b");
  title.textContent = "效果开关（?debug=fx）";
  box.append(title);
  for (const [label, set] of fx) {
    const row = document.createElement("label");
    row.style.display = "block";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.style.marginRight = "6px";
    cb.onchange = () => {
      set(cb.checked);
      // 渲染循环在后台标签页是停的，手动补一帧，开关才立刻看得见。
      renderer.render(scene, camera);
    };
    row.append(cb, document.createTextNode(label));
    box.append(row);
  }
  document.body.append(box);
  console.info("[holo-card] ?debug=fx 面板已挂载，共", fx.length, "个开关");
}
function setupControls() {
  syncSliderRanges();
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
  // 双击翻面。两次按下各自会走一遍 pointerdown/up（顺带停掉自摆），双击本身只管翻。
  stage.addEventListener("dblclick", () => flip());
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
  $("auto").onclick = () => setAuto(!auto);
  const depthToggle = $("depth-toggle");
  if (depthToggle) depthToggle.onclick = () => toggleSettings();
  applyFinish = setFinish;
  // 面板默认收起，展开只认 景深调整 那个按钮：不点外面、不按 Esc 关它。
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
function syncSliderRanges() {
  if (config.sourceMode === "relief") {
    // Layered card relief: subject base plane 0..0.9, effects/text above it.
    $("depth").min = "0.0";
    $("depth").max = "0.9";
    $("scale").min = "0.92";
    $("scale").max = "1.3";
  } else {
    $("depth").min = "-0.6";
    $("depth").max = "0.9";
    // 下限必须罩得住各卡 config 里的 subjectScale（009 宽袖版用 0.76 放大）：
    // setupControls 是「uniform → 滑杆 → 再读回 uniform」一圈，滑杆夹掉的值会反过来
    // 覆盖 config 的值，min 抬得比它高就等于配置被静默作废。
    $("scale").min = "0.55";
    $("scale").max = "1.35";
  }
}
// ---- 软导航：卡与卡之间不换文档 ----
// 多页结构对深链和 SEO 友好，代价是每次换卡都要重启一个 WebGL 上下文、重下六张贴图，过渡
// 只能是"旧页快照 → 新页从头加载"。但换卡其实只需要换贴图（卡壳 GLB 逐字节相同、材质共享），
// 所以卡页之间的跳转在这里被拦下来、在同一个上下文里完成：先把卡转到侧棱（投影宽度归零的那
// 一帧）换贴图与文案，再转回来，接缝看不见。首页没有画布，landing ↔ 卡 仍是真导航——three 的
// 启动成本在那一侧，靠 hover 预取把首屏前的下载提前。
const bundles = new Map(); // id -> { config, pack }；上限两份，多出来的立刻释放贴图
let currentId = null;
let livePack = null;
let navBusy = false;

const cardIdOf = (url) => {
  const m = new URL(url, location.href).pathname.match(/^\/(\d{3})\/(?:index\.html)?$/);
  return m ? m[1] : null;
};
const routeOf = (id) => `/${id}/index.html`;

async function loadBundle(id) {
  const hit = bundles.get(id);
  if (hit) return hit;
  const load = import.meta.glob("../*/card.config.js")[`../${id}/card.config.js`];
  if (!load) throw Error("未找到编号为 " + id + " 的卡片");
  const bundle = { config: (await load()).default };
  bundle.pack = await loadCardTextures(bundle.config);
  bundles.set(id, bundle);
  // 预取不能无限攒：每套贴图在 GPU 上约 6×6MB，留当前卡 + 一份预取就够。
  while (bundles.size > 2) {
    const oldest = bundles.keys().next().value;
    if (oldest === currentId || oldest === id) break;
    for (const t of Object.values(bundles.get(oldest).pack.tex)) t.dispose();
    bundles.delete(oldest);
  }
  return bundle;
}
// 转到侧棱。直接写 rotation 并把 targetY 钉成同一个值，animate() 的缓动就变成空转，
// 不会和这里的补间打架；reduce-motion 时直接落位。
function turnTo(to, ms) {
  return new Promise((resolve) => {
    targetX = 0;
    // 隐藏标签页里 rAF 停摆，补间会永远等不到下一帧；反正没人看，直接落位。
    if (media.matches || ms <= 0 || document.hidden) {
      root.rotation.y = targetY = to;
      resolve();
      return;
    }
    const from = root.rotation.y;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      root.rotation.y = targetY = from + (to - from) * e;
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
async function softNavigate(id, push = true) {
  if (navBusy || !root || id === currentId) return;
  navBusy = true;
  const wasAuto = auto;
  setAuto(false);
  const t0 = performance.now();
  const bar = document.querySelector(".artwork-bar");
  // 贴图没预取到时要等下载：先把文案淡掉当作"在换了"的反馈，别让用户以为点坏了。
  bar?.classList.add("swapping");
  let bundle;
  try {
    bundle = await loadBundle(id);
  } catch (error) {
    // 配置或贴图拿不到就别把用户扣在原地：退回真导航，让服务器兜底。
    console.warn("[holo-card] 软导航失败，回退真导航：", error);
    location.href = routeOf(id);
    return;
  }
  await turnTo(Math.PI / 2, 240);
  const dead = livePack;
  currentId = id;
  config = bundle.config;
  for (const [name, value] of Object.entries(configUniformValues(config, bundle.pack)))
    uniforms[name].value = value;
  for (const [name, texture] of Object.entries(bundle.pack.tex))
    uniforms[name].value = texture;
  livePack = bundle.pack;
  reliefLayers.text.forEach((mesh) => (mesh.visible = config.sourceMode === "relief"));
  applyCardDom(config);
  syncSliderRanges();
  reset();
  if (push) history.pushState({ holo: id }, "", routeOf(id));
  renderCardNav(); // pushState 之后再画一次，aria-current 才指得对新地址
  root.rotation.y = targetY = -Math.PI / 2;
  await turnTo(0, 300);
  // 不自摆时落回和首屏一样的微侧姿态，别停在正对镜头的死板角度。
  if (!auto) {
    targetX = -0.035;
    targetY = -0.15;
  }
  bar?.classList.remove("swapping");
  // 旧贴图若没被缓存引用就可以还给 GPU；被缓存引用的（比如刚离开的这张，供后退秒开）留着。
  if (dead && ![...bundles.values()].some((b) => b.pack === dead))
    for (const t of Object.values(dead.tex)) t.dispose();
  if (wasAuto && !media.matches) setAuto(true);
  navBusy = false;
  console.info(
    `[holo-card] 软导航 → ${id} · ${(performance.now() - t0).toFixed(0)}ms · 贴图 ${
      renderer.info.memory.textures
    } 个`,
  );
}
function setupSoftNav() {
  window.addEventListener("popstate", (e) => {
    const id = e.state?.holo || cardIdOf(location.href);
    if (id) softNavigate(id, false);
  });
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.("a[href]");
    const id = a && cardIdOf(a.href);
    if (!id) return;
    e.preventDefault();
    softNavigate(id);
  });
  // 指针划过卡序就把那一卡的东西先拉下来，点击时贴图多半已经在显存里了。
  document.addEventListener("pointerover", (e) => {
    const a = e.target.closest?.(".card-link");
    const id = a && cardIdOf(a.href);
    if (id && id !== currentId && !bundles.has(id)) loadBundle(id).catch(() => {});
  });
}
function animate(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.06) || 0;
  lastTime = now;
  if (document.hidden) return;
  if (!media.matches || auto) elapsed += dt;
  if (auto) {
    // 默认自摆。拖拽的夹取是 ±0.65 / ±0.36，这里只用到约一半，指针接管时不会撞到边界；
    // 只加大摆幅，频率保持原样（嫌快就把 0.42 / 0.53 一起往下调）。
    targetY = Math.sin(elapsed * 0.42) * 0.34 - 0.06;
    targetX = Math.sin(elapsed * 0.53) * 0.1 - 0.02;
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
  // 光源固定在左前上方：卡往哪边立起来，接触影就往反方向滑一点、略微变窄。
  ground.position.x = 0.25 - Math.sin(root.rotation.y) * 1.2;
  ground.scale.x = 1 - Math.abs(Math.sin(root.rotation.y)) * 0.16;
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
