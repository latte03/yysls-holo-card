import { refreshIcons } from "./icons.js";

// 深浅色开关。配色本身一条都不在这里：CSS 里每个颜色 token 写成 light-dark(浅, 深)，
// 生效哪一套由 <html> 的 color-scheme 决定，所以"跟随系统"这一态完全不需要 JS，首屏也不闪。
// 这里只管三件事：记住用户显式选的那一态、把它写进 color-scheme、通知 CSS 之外的颜色持有者
// （WebGL 的画布底色和两层影子色是从 CSS 读出来的）跟着换。
const KEY = "holo-theme";
const root = document.documentElement;
const darkMedia = matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set();

// 存储被禁（隐私模式 / iframe 沙箱）时读写都不能抛，否则整页脚本挂在导入阶段。
const store = {
  get: () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set: (value) => {
    try {
      localStorage.setItem(KEY, value);
    } catch {}
  },
  clear: () => {
    try {
      localStorage.removeItem(KEY);
    } catch {}
  },
};

export function isDark() {
  const stored = store.get();
  return stored ? stored === "dark" : darkMedia.matches;
}

// 自定义属性里的 light-dark() 只有作为颜色被使用时才会解析，getPropertyValue 读回来的还是
// 那串字面量。所以 --paper / --stage-shadow 用 @property 注册成了 <color>：注册属性的计算值
// 已经按当前方案解好，这里拿到的就是 "rgb(250, 250, 250)"。
export function cssColor(name) {
  return getComputedStyle(root).getPropertyValue(name).trim();
}

function apply() {
  const stored = store.get();
  root.style.colorScheme = stored === "light" || stored === "dark" ? stored : "";
  // 字标是一明一暗两张 PNG，CSS 的 light-dark() 选不了 img src。把当前生效的方案标到
  // <html data-paper> 上，样式表按它翻图片（跟随系统时 <picture> 的 media 分支已经先给对了，
  // 这里只是让显式选择那一态也有正确的字标）。
  root.dataset.paper = isDark() ? "dark" : "light";
  // 状态栏/浏览器边框：显式选一态时两个 meta 都指向当前纸色，media 变体就不再分叉。
  const paper = cssColor("--paper");
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => (meta.content = paper));
  listeners.forEach((fn) => fn());
}

// 右键 = 回到"跟随系统"。一个按钮只有两态，不给自己留条退路的话 auto 就再也回不来了。
function toggle() {
  store.set(isDark() ? "light" : "dark");
  apply();
}

function followSystem() {
  store.clear();
  apply();
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// 挂到页面上那个已存在的按钮：图标按当前方案换成太阳/月亮，因为"显示的是点了之后去的那一态"
// 比"显示现在这一态"更好读——深色下按下去就变浅，所以露出太阳。
export function mountThemeToggle(button) {
  const sync = () => {
    const dark = isDark();
    const label = dark ? "切换到浅色" : "切换到深色";
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", dark ? "sun" : "moon");
    button.replaceChildren(icon);
    button.setAttribute("aria-label", label);
    button.title = `${label} · 右键跟随系统`;
    refreshIcons();
  };
  button.onclick = toggle;
  button.oncontextmenu = (e) => {
    e.preventDefault();
    followSystem();
  };
  onChange(sync);
  sync();
}

darkMedia.addEventListener("change", () => {
  if (!store.get()) apply();
});

apply();
