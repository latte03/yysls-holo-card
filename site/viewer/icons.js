import { ICON_TREES } from "./icons.data.js";

// Render a lucide node tree (["svg", attrs, [children]]) into an svg element.
function renderIconNode(node) {
  const [tag, attrs = {}, children = []] = node;
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  for (const child of children) el.appendChild(renderIconNode(child));
  return el;
}

// 把标记里的 <i data-lucide="…"> 换成内联 svg。查看器和首页共用：首页只有一个开关按钮，
// 但同样不走 CDN 取图标（网络拦截会直接吃掉它）。
// icons.data.js 的键是 PascalCase（Play、RotateCcw…），标记里写的是 lucide 的连字符名
// （play、rotate-ccw…），两边都要认。
export function refreshIcons() {
  const overrides = { "stroke-width": 1.5 };
  const pascal = (name) =>
    name
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
  document.querySelectorAll("[data-lucide]").forEach((el) => {
    const name = el.getAttribute("data-lucide");
    const tree = ICON_TREES[name] || ICON_TREES[pascal(name)];
    if (!tree) return;
    const [tag, defaults = {}, children = []] = tree;
    const svg = renderIconNode([tag, { ...defaults, ...overrides }, children]);
    el.replaceChildren(svg);
  });
}
