import "./landing.css";
import { cards } from "../cards.manifest.js";
import { mountThemeToggle } from "./theme.js";

/**
 * Landing page: the card list is rendered from the registry, so adding a card
 * never means editing markup.
 */
const list = document.querySelector("[data-card-list]");
list.replaceChildren(
  ...cards.map((card) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = card.route;
    a.append(
      Object.assign(document.createElement("span"), { textContent: `${card.act} · ${card.title}` }),
    );
    const small = document.createElement("small");
    small.textContent = card.edition;
    a.append(small);
    li.append(a);
    return li;
  }),
);
mountThemeToggle(document.getElementById("theme"));
