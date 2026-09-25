import { mountThemeToggle } from "./theme.js";

// The card list is build-time markup (see gen-card-pages.mjs), so this module only
// mounts the theme toggle and the pointer-driven laminate.

mountThemeToggle(document.getElementById("theme"));

// --mx / --my drive the landing cards' laminate (foil band, glare, 3D tilt) and are the
// only thing JS writes. Without them the cards keep the static face plus the CSS-only
// hover sweep, so this stays an enhancement: skipped on coarse pointers (a touch
// pointermove fires while the page is being scrolled) and under reduced motion.
// Comments here are English on purpose: make_font.py subsets the font from every
// character in this file, so a Chinese comment ships as dead glyphs.
const fine = matchMedia("(hover: hover) and (pointer: fine)");
const calm = matchMedia("(prefers-reduced-motion: reduce)");

export function mountCardLaminate(root = document) {
  if (!fine.matches || calm.matches) return false;
  const cards = [...root.querySelectorAll(".card")];
  if (!cards.length) return false;

  document.documentElement.classList.add("holo-pointer");
  let target = null;
  let frame = 0;
  const paint = () => {
    frame = 0;
    const { el, x, y } = target;
    el.style.setProperty("--mx", x.toFixed(3));
    el.style.setProperty("--my", y.toFixed(3));
  };
  const queue = (next) => {
    target = next;
    if (!frame) frame = requestAnimationFrame(paint);
  };

  for (const el of cards) {
    // Cached on enter: while the card is at rest its box is untilted, and reading the
    // rect on every move would both cost layout and drift with the rotation.
    let rect = null;
    el.addEventListener("pointerenter", () => {
      rect = el.getBoundingClientRect();
    });
    el.addEventListener("pointermove", (e) => {
      rect ??= el.getBoundingClientRect();
      queue({
        el,
        x: (e.clientX - rect.left) / rect.width - 0.5,
        y: (e.clientY - rect.top) / rect.height - 0.5,
      });
    });
    el.addEventListener("pointerleave", () => {
      rect = null;
      queue({ el, x: 0, y: 0 });
    });
  }
  return true;
}

mountCardLaminate();

// Tuning panel: behind a static DEV flag so the production build drops the branch and
// the tune.js chunk is never emitted. Run `pnpm dev` to get it.
if (import.meta.env.DEV) import("./tune.js").then((m) => m.mountTune());
