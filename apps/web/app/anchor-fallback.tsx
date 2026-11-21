"use client";

import { useEffect } from "react";

const GAP = 6;
const EDGE = 8;

// shortcut: Safari < 26 and Firefox < 147 lack CSS anchor positioning, so Astryx layers open in the window corner.
// This measures the trigger and places the layer under it; delete once those browsers are out of the audience.
export function AnchorFallback() {
  useEffect(() => {
    if (CSS.supports("anchor-name", "--x")) return;
    const open = new Map<HTMLElement, Element>();

    // A trigger names its layer (or the listbox inside it) through aria-controls / aria-describedby.
    const anchorOf = (pop: HTMLElement) => {
      for (const t of document.querySelectorAll("[aria-controls], [aria-describedby]")) {
        const ids = `${t.getAttribute("aria-controls") ?? ""} ${t.getAttribute("aria-describedby") ?? ""}`.split(/\s+/).filter(Boolean);
        if (ids.some((id) => pop.id === id || pop.querySelector(`#${CSS.escape(id)}`))) return t.closest("[data-astryx-pressable]") ?? t;
      }
      return null;
    };

    const place = (pop: HTMLElement, anchor: Element) => {
      const a = anchor.getBoundingClientRect();
      const [w, h] = [pop.offsetWidth, pop.offsetHeight];
      const below = a.bottom + GAP + h <= innerHeight || innerHeight - a.bottom >= a.top;
      const set = (k: string, v: string) => pop.style.setProperty(k, v, "important");
      set("inset", "auto");
      set("margin", "0");
      set("top", `${Math.max(EDGE, below ? a.bottom + GAP : a.top - GAP - h)}px`);
      set("left", `${Math.max(EDGE, Math.min(a.left, innerWidth - w - EDGE))}px`);
    };

    // beforetoggle places the layer before it paints; toggle corrects it once its size is known.
    const onToggle = (e: Event) => {
      const pop = e.target;
      if (!(pop instanceof HTMLElement) || !pop.hasAttribute("data-layer-anchored")) return;
      if ((e as ToggleEvent).newState !== "open") return void open.delete(pop);
      const anchor = open.get(pop) ?? anchorOf(pop);
      if (!anchor) return;
      open.set(pop, anchor);
      place(pop, anchor);
    };
    const reflow = () => open.forEach((anchor, pop) => place(pop, anchor));

    document.addEventListener("beforetoggle", onToggle, true);
    document.addEventListener("toggle", onToggle, true);
    addEventListener("scroll", reflow, { capture: true, passive: true });
    addEventListener("resize", reflow);
    return () => {
      document.removeEventListener("beforetoggle", onToggle, true);
      document.removeEventListener("toggle", onToggle, true);
      removeEventListener("scroll", reflow, { capture: true });
      removeEventListener("resize", reflow);
    };
  }, []);
  return null;
}
