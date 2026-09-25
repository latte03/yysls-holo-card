// DEV-only tuning panel for the landing cards. Imported behind `import.meta.env.DEV`
// from landing.js, so it never lands in the production bundle.
//
// 每个旋钮就是 landing.css :root 里的一条自定义属性。默认值不在这里重复一遍：从
// getComputedStyle 读回来，所以样式表改了面板自动跟着改，两边不会漂。
// 只有被碰过的项才会写进 <html> 的内联样式并记进 localStorage（跳去卡页再回来不用重调），
// 「复制参数」也只吐这些改过的行 —— 那就是该固化进 landing.css 的差量。

const SPECS = [
  { name: "--foil-size", label: "云纹倍率", min: 100, max: 600, step: 5, unit: "%" },
  { name: "--foil-ox", label: "取景 横", min: 0, max: 100, step: 1, unit: "%" },
  { name: "--foil-oy", label: "取景 纵", min: 0, max: 100, step: 1, unit: "%" },
  { name: "--foil-alpha", label: "云纹浓度", min: 0, max: 1, step: 0.01, unit: "" },
  { name: "--foil-ink", label: "云纹金色", color: true },
  { name: "--foil-pan", label: "底纹视差", min: 0, max: 30, step: 1, unit: "px" },
  { name: "--band-travel", label: "彩带行程", min: 0, max: 90, step: 1, unit: "%" },
  { name: "--band-alpha", label: "彩带强度", min: 0, max: 2, step: 0.05, unit: "" },
  { name: "--tilt", label: "倾斜幅度", min: 0, max: 18, step: 0.5, unit: "deg" },
  { name: "--glare-alpha", label: "高光强度", min: 0, max: 0.5, step: 0.01, unit: "" },
  { name: "--lift-px", label: "hover 抬起", min: 0, max: 10, step: 0.5, unit: "px" },
  { name: "--frame-alpha", label: "描金内框", min: 0, max: 1, step: 0.01, unit: "" },
];

const KEY = "holo-tune";
const root = document.documentElement;
const read = (name) => getComputedStyle(root).getPropertyValue(name).trim();
const num = (v) => parseFloat(v) || 0;

const style = document.createElement("style");
style.textContent = `
.tune{position:fixed;right:12px;bottom:12px;z-index:60;width:268px;max-height:min(78svh,640px);
  overflow:auto;padding:10px 12px 12px;border-radius:9px;background:#12151bee;color:#dcd8d0;
  font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;box-shadow:0 10px 30px -12px #000c;
  border:1px solid #ffffff1f}
.tune h2{margin:0 0 8px;font-size:11px;font-weight:400;letter-spacing:.08em;color:#9ba19a;display:flex;justify-content:space-between}
.tune h2 button{all:unset;cursor:pointer;color:#d2a959}
.tune label{display:grid;grid-template-columns:66px 1fr 46px;align-items:center;gap:6px;margin:5px 0}
.tune input[type=range]{width:100%;accent-color:#d2a959;height:14px}
.tune input[type=color]{width:100%;height:18px;padding:0;border:1px solid #ffffff2a;background:none}
.tune output{text-align:right;color:#d2a959}
.tune .row{display:flex;gap:6px;margin-top:9px}
.tune .row button{flex:1;padding:5px 0;border:1px solid #ffffff2a;border-radius:5px;background:#ffffff0d;
  color:#dcd8d0;font:inherit;cursor:pointer}
.tune .row button:hover{border-color:#d2a959;color:#d2a959}
.tune .hint{margin-top:6px;color:#9ba19a;font-size:10px}
.tune li.dirty{color:#d2a959}
`;

export function mountTune() {
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      return {};
    }
  })();
  const dirty = new Set(Object.keys(saved));

  const panel = document.createElement("aside");
  document.head.appendChild(style);
  panel.className = "tune";
  panel.innerHTML = `<h2><span>首页卡 · 调参（dev）</span><button data-act="hide">收起</button></h2>`;
  const body = document.createElement("div");
  panel.appendChild(body);

  const controls = {};
  for (const spec of SPECS) {
    const label = document.createElement("label");
    const cap = document.createElement("span");
    cap.textContent = spec.label;
    const input = document.createElement("input");
    const out = document.createElement("output");
    const def = read(spec.name);

    if (spec.color) {
      input.type = "color";
      input.value = /^#[0-9a-f]{6}$/i.test(def) ? def : "#d8b274";
    } else {
      input.type = "range";
      Object.assign(input, { min: spec.min, max: spec.max, step: spec.step });
      input.value = spec.name in saved ? saved[spec.name] : num(def);
    }
    const show = () => {
      out.textContent = input.value + (spec.unit ?? "");
      label.classList.toggle("dirty", dirty.has(spec.name));
    };
    input.addEventListener("input", () => {
      root.style.setProperty(spec.name, input.value + (spec.unit ?? ""));
      dirty.add(spec.name);
      save();
      show();
    });
    show();
    label.append(cap, input, out);
    body.appendChild(label);
    controls[spec.name] = { input, spec, def, show };
  }

  function save() {
    const data = {};
    for (const name of dirty) data[name] = controls[name].input.value;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {}
  }

  // 恢复上次会话里调过的值（默认值变化时不会覆盖：只回放被记名的那几项）
  for (const name of dirty) {
    if (controls[name]) root.style.setProperty(name, saved[name] + (controls[name].spec.unit ?? ""));
  }

  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<button data-act="copy">复制参数</button><button data-act="reset">重置</button>`;
  const hint = document.createElement("div");
  hint.className = "hint";
  body.append(row, hint);

  row.addEventListener("click", (e) => {
    const act = e.target.dataset.act;
    if (act === "reset") {
      // 只清差量，不走 input 事件路径：dispatch 会把每一项重新标成 dirty 并存回本地，
      // 等于"重置成默认值然后把它固化"，那是反的。
      for (const name of dirty) root.style.removeProperty(name);
      dirty.clear();
      try {
        localStorage.removeItem(KEY);
      } catch {}
      for (const c of Object.values(controls)) {
        c.input.value = c.spec.color ? c.def : num(c.def);
        c.show();
      }
      hint.textContent = "已回到样式表默认值";
      return;
    }
    const css = `:root {\n${[...dirty].map((n) => `  --${n.replace(/^--/, "")}: ${controls[n].input.value}${controls[n].spec.unit ?? ""};`).join("\n")}\n}`;
    const done = (ok) => (hint.textContent = ok ? `已复制 ${dirty.size} 项，发给我即可固化` : "复制失败，请手动抄下面这段");
    if (dirty.size === 0) return void (hint.textContent = "还没改过任何一项");
    navigator.clipboard?.writeText(css).then(() => done(true), () => done(false));
  });

  panel.querySelector('[data-act="hide"]').onclick = () => {
    panel.style.setProperty("width", "auto");
    body.hidden = !body.hidden;
  };
  document.body.appendChild(panel);
}
