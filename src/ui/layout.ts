import * as BUI from "@thatopen/ui";

export interface Layout {
  viewport: HTMLElement;
  setLeftPanel(el: HTMLElement): void;
  setRightPanel(el: HTMLElement): void;
  setToolbar(el: HTMLElement): void;
}

export function createLayout(root: HTMLElement): Layout {
  const grid = document.createElement("bim-grid") as BUI.Grid<["main"]>;

  const viewport = document.createElement("bim-viewport");
  const left = document.createElement("div");
  const right = document.createElement("div");
  const top = document.createElement("div");
  for (const el of [left, right, top]) el.style.overflow = "auto";

  grid.layouts = {
    main: {
      template: `
        "toolbar toolbar toolbar" auto
        "left viewport right" 1fr
        / 19rem 1fr 22rem
      `,
      elements: { toolbar: top, left, viewport, right },
    },
  };
  grid.layout = "main";
  root.append(grid);

  return {
    viewport,
    setLeftPanel: (el) => left.replaceChildren(el),
    setRightPanel: (el) => right.replaceChildren(el),
    setToolbar: (el) => top.replaceChildren(el),
  };
}
