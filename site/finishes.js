/**
 * The finish registry — the single place a 卡面工艺 is declared.
 *
 * Everything keyed on a finish reads it from here: the swatch row in the header,
 * the `finish-<id>` class the CSS-3D fallback styles, the label beside it, and
 * the `noFoil` rule that dims the 光泽 slider for 原画.
 *
 * `glsl` is loaded straight into the `uFinish` uniform, and the shader compares
 * that number against thresholds rather than enumerating it: below 0.5 the film
 * keeps its spectrum colour, at or above 0.5 it desaturates, near 2 the foil is
 * disabled entirely, above 2.5 it becomes the warm gold laminate. A new finish
 * therefore picks the band it wants to land in, not the next free integer.
 */
export const finishes = [
  { id: "pearl", label: "珠光", glsl: 0 },
  { id: "silver", label: "银箔", glsl: 1 },
  { id: "gold", label: "烫金", glsl: 3 },
  { id: "original", label: "原画", glsl: 2, noFoil: true },
];

/**
 * Both render paths seed from this one value. A card that omits
 * `appearance.finish` used to get 珠光 with WebGL and 烫金 without it.
 */
export const defaultFinish = "pearl";

export const finishOf = (id) =>
  finishes.find((f) => f.id === id) ||
  finishes.find((f) => f.id === defaultFinish);
