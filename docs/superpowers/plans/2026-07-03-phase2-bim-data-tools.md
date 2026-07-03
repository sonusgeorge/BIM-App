# BIM Viewer Phase 2 (BIM Data Tools) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add section planes, measurements, floor plans, search & filter, and quantity summaries (with CSV export) to the Phase 1 viewer.

**Architecture:** Each tool wires a built-in `@thatopen/components` (v3) component into the existing `Viewer`; pure logic (units, query building, quantity aggregation, CSV) lives in dependency-free modules covered by Vitest. The left/right panels become tabbed (`bim-tabs`); a small ToolCoordinator makes section/measure tools mutually exclusive.

**Tech Stack:** Existing stack only — Vite, TypeScript (strict), `@thatopen/components` 3.4.6, `@thatopen/components-front` 3.4.3, `@thatopen/ui`, `@thatopen/ui-obc`, `@thatopen/fragments`, `web-ifc` 0.0.77, `three`, `idb-keyval`, Vitest. **No new dependencies.**

## Global Constraints

- **Zero cost:** no backend, no paid services, no API keys. 100% client-side.
- **No model files in git:** `.ifc`/`.frag`/`.rvt`/`models/` stay gitignored. Never weaken this.
- **No new npm dependencies** — everything needed is already installed.
- **Units:** display in the model's units. Fragments geometry (measurements) is in **meters** — convert for display on imperial models. IFC quantity-set values are in the **model's original units** — display as-is, never convert.
- **API drift note:** All class/method signatures below were verified against the type declarations in the **installed** `node_modules/@thatopen/*/dist/index.d.ts` (v3, checked 2026-07-03). If a call fails at runtime, re-check those `.d.ts` files first — online examples are mostly outdated v2.
- **WASM:** never re-enable `autoSetWasm: true` (see `scripts/copy-wasm.mjs` header for why).
- Toasts for user-facing errors via `showStatus(message, "error")` from `src/ui/status.ts`.
- Commit messages end with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- **Browser verification:** dev server starts with `npm run dev` (port 5173). Test model: any Revit IFC export; the owner's sample is `C:\Users\sonus\Desktop\IFC\Snowdon Towers Sample Architectural.ifc` (imperial/feet). For a metric model download once: `https://thatopen.github.io/engine_components/resources/ifc/school_str.ifc` into `models/` (gitignored).

## File Structure

```
src/core/units.ts                      NEW  pure: unit detection + formatting
src/core/units.test.ts                 NEW
src/core/loader.ts                     MOD  detect+record units on load (incl. cache path)
src/core/cache.ts                      MOD  persist units alongside cached fragments
src/features/tools.ts                  NEW  ToolCoordinator (mutual exclusion, Esc)
src/features/tools.test.ts             NEW
src/features/sections.ts               NEW  Clipper + ClipStyler wiring
src/features/measurements.ts           NEW  Length/Area measurement wiring
src/features/floorplans.ts             NEW  Views.createFromIfcStoreys wiring
src/features/finder-query.ts           NEW  pure: build ItemsQueryParams
src/features/finder-query.test.ts      NEW
src/features/finder.ts                 NEW  ItemsFinder + Highlighter/Hider wiring
src/features/quantities/extract.ts     NEW  pure: pull area/volume/type out of ItemData
src/features/quantities/extract.test.ts NEW
src/features/quantities/aggregate.ts   NEW  pure: group + sum rows
src/features/quantities/aggregate.test.ts NEW
src/features/quantities/csv.ts         NEW  pure: rows -> CSV text
src/features/quantities/csv.test.ts    NEW
src/features/quantities/index.ts       NEW  data fetching + download orchestration
src/ui/layout.ts                       MOD  tabbed left/right panels
src/ui/toolbar.ts                      MOD  Section + Measure buttons
src/ui/panels/plans.ts                 NEW  floor-plan list panel
src/ui/panels/finder.ts                NEW  search & filter panel section
src/ui/panels/quantities.ts            NEW  quantities table panel
src/style.css                          MOD  quantities table + active-button styles
src/main.ts                            MOD  wiring
CLAUDE.md                              MOD  project state note (final task)
```

Work on a branch: `git checkout -b phase-2-bim-data-tools` before Task 1.

---

### Task 1: Units — detect and format model units

**Files:**
- Create: `src/core/units.ts`, `src/core/units.test.ts`
- Modify: `src/core/cache.ts`, `src/core/loader.ts`

**Interfaces:**
- Consumes: `cacheKey(file)` and idb helpers in `src/core/cache.ts`; `loadModelFile` flow in `src/core/loader.ts`.
- Produces (used by Tasks 5 and 8):
  - `type UnitSystem = "metric" | "imperial"`
  - `interface ModelUnits { system: UnitSystem; lengthSymbol: string; areaSymbol: string; volumeSymbol: string }`
  - `METRIC_UNITS: ModelUnits`, `IMPERIAL_UNITS: ModelUnits`
  - `detectUnitsFromIfc(ifcText: string): ModelUnits`
  - `formatLength(meters: number, units: ModelUnits, decimals?: number): string`
  - `formatArea(sqMeters: number, units: ModelUnits, decimals?: number): string`
  - `setModelUnits(modelId: string, units: ModelUnits): void`
  - `getModelUnits(modelId: string): ModelUnits` (returns `METRIC_UNITS` when unknown)

- [ ] **Step 1: Write the failing tests**

Create `src/core/units.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  detectUnitsFromIfc,
  formatArea,
  formatLength,
  getModelUnits,
  IMPERIAL_UNITS,
  METRIC_UNITS,
  setModelUnits,
} from "./units";

describe("detectUnitsFromIfc", () => {
  it("detects imperial from a FOOT conversion-based unit", () => {
    const header =
      "#19=IFCCONVERSIONBASEDUNIT(#18,.LENGTHUNIT.,'FOOT',#17);";
    expect(detectUnitsFromIfc(header).system).toBe("imperial");
  });

  it("detects imperial regardless of case and spacing", () => {
    const header =
      "#19 = ifcconversionbasedunit ( #18 , .LENGTHUNIT. , 'Foot' , #17 );";
    expect(detectUnitsFromIfc(header).system).toBe("imperial");
  });

  it("defaults to metric for SI units", () => {
    const header = "#20=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);";
    expect(detectUnitsFromIfc(header).system).toBe("metric");
  });

  it("ignores non-length conversion units (e.g. degrees)", () => {
    const header =
      "#21=IFCCONVERSIONBASEDUNIT(#18,.PLANEANGLEUNIT.,'DEGREE',#17);";
    expect(detectUnitsFromIfc(header).system).toBe("metric");
  });
});

describe("formatting", () => {
  it("formats metric lengths in meters", () => {
    expect(formatLength(2.5, METRIC_UNITS)).toBe("2.50 m");
  });

  it("converts meters to feet for imperial models", () => {
    expect(formatLength(0.3048, IMPERIAL_UNITS)).toBe("1.00 ft");
  });

  it("converts square meters to square feet", () => {
    expect(formatArea(0.09290304, IMPERIAL_UNITS)).toBe("1.00 ft²");
  });

  it("respects the decimals argument", () => {
    expect(formatLength(1.2345, METRIC_UNITS, 1)).toBe("1.2 m");
  });
});

describe("model units registry", () => {
  it("returns metric for unknown models", () => {
    expect(getModelUnits("never-registered")).toBe(METRIC_UNITS);
  });

  it("returns registered units", () => {
    setModelUnits("my-model", IMPERIAL_UNITS);
    expect(getModelUnits("my-model")).toBe(IMPERIAL_UNITS);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/units.test.ts`
Expected: FAIL — `Cannot find module './units'` (or equivalent).

- [ ] **Step 3: Implement `src/core/units.ts`**

```ts
export type UnitSystem = "metric" | "imperial";

export interface ModelUnits {
  system: UnitSystem;
  lengthSymbol: string;
  areaSymbol: string;
  volumeSymbol: string;
}

export const METRIC_UNITS: ModelUnits = {
  system: "metric",
  lengthSymbol: "m",
  areaSymbol: "m²",
  volumeSymbol: "m³",
};

export const IMPERIAL_UNITS: ModelUnits = {
  system: "imperial",
  lengthSymbol: "ft",
  areaSymbol: "ft²",
  volumeSymbol: "ft³",
};

const METERS_PER_FOOT = 0.3048;

/**
 * Detects the model's length unit from raw IFC (STEP) text. Imperial Revit
 * exports declare IFCCONVERSIONBASEDUNIT(..., .LENGTHUNIT., 'FOOT'/'INCH', ...);
 * metric exports declare an SI length unit instead.
 */
export function detectUnitsFromIfc(ifcText: string): ModelUnits {
  const match =
    /IFCCONVERSIONBASEDUNIT\s*\(\s*[^,]*,\s*\.LENGTHUNIT\.\s*,\s*'([^']*)'/i.exec(
      ifcText,
    );
  if (match && /FOOT|FEET|INCH/i.test(match[1])) return IMPERIAL_UNITS;
  return METRIC_UNITS;
}

export function formatLength(
  meters: number,
  units: ModelUnits,
  decimals = 2,
): string {
  const value =
    units.system === "imperial" ? meters / METERS_PER_FOOT : meters;
  return `${value.toFixed(decimals)} ${units.lengthSymbol}`;
}

export function formatArea(
  sqMeters: number,
  units: ModelUnits,
  decimals = 2,
): string {
  const value =
    units.system === "imperial"
      ? sqMeters / (METERS_PER_FOOT * METERS_PER_FOOT)
      : sqMeters;
  return `${value.toFixed(decimals)} ${units.areaSymbol}`;
}

const unitsByModel = new Map<string, ModelUnits>();

export function setModelUnits(modelId: string, units: ModelUnits): void {
  unitsByModel.set(modelId, units);
}

export function getModelUnits(modelId: string): ModelUnits {
  return unitsByModel.get(modelId) ?? METRIC_UNITS;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/units.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Persist units in the fragments cache**

Read `src/core/cache.ts` first. It exposes `cacheKey`, `getCachedFragments(key)`, `putCachedFragments(key, buffer)` over `idb-keyval`. Add two functions alongside them, following the same style (same idb store, key prefixed):

```ts
export async function getCachedUnitSystem(
  key: string,
): Promise<"metric" | "imperial" | undefined> {
  return get(`units|${key}`);
}

export async function putCachedUnitSystem(
  key: string,
  system: "metric" | "imperial",
): Promise<void> {
  await set(`units|${key}`, system);
}
```

(`get`/`set` are the `idb-keyval` imports already used in that file — reuse whatever import style/custom store the file already has.)

- [ ] **Step 6: Record units in `src/core/loader.ts` on both load paths**

In `loadModelFile`:

1. **Cached path** — after `if (cached) {` and before `fragments.core.load`, add:

```ts
const cachedSystem = await getCachedUnitSystem(key).catch(() => undefined);
setModelUnits(
  modelId,
  cachedSystem === "imperial" ? IMPERIAL_UNITS : METRIC_UNITS,
);
```

2. **Fresh path** — after the `isProbablyIfc` check passes, add:

```ts
const headerText = new TextDecoder().decode(
  buffer.subarray(0, Math.min(buffer.length, 500_000)),
);
const units = detectUnitsFromIfc(headerText);
setModelUnits(modelId, units);
putCachedUnitSystem(key, units.system).catch((error) =>
  console.warn("[bim-viewer] units cache unavailable:", error),
);
```

Imports to add at the top of `loader.ts`:

```ts
import {
  detectUnitsFromIfc,
  IMPERIAL_UNITS,
  METRIC_UNITS,
  setModelUnits,
} from "./units";
import { getCachedUnitSystem, putCachedUnitSystem } from "./cache";
```

(Merge with the existing `./cache` import.)

- [ ] **Step 7: Full test suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/core/units.ts src/core/units.test.ts src/core/cache.ts src/core/loader.ts
git commit -m "feat: detect and record model units (metric/imperial) at load"
```

---

### Task 2: ToolCoordinator — mutual exclusion + Esc

**Files:**
- Create: `src/features/tools.ts`, `src/features/tools.test.ts`

**Interfaces:**
- Produces (used by Tasks 4, 5, 9 and `main.ts`):
  - `type ToolId = "section" | "length" | "area"`
  - `interface Tool { activate(): void; deactivate(): void }`
  - `class ToolCoordinator { register(id: ToolId, tool: Tool): void; toggle(id: ToolId): boolean; deactivateAll(): void; get active(): ToolId | null; readonly onChanged: Set<(active: ToolId | null) => void> }`
  - `wireEscKey(coordinator: ToolCoordinator): void`

- [ ] **Step 1: Write the failing tests**

Create `src/features/tools.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ToolCoordinator, type Tool } from "./tools";

function makeTool(): Tool & { activate: ReturnType<typeof vi.fn> } {
  return { activate: vi.fn(), deactivate: vi.fn() } as never;
}

describe("ToolCoordinator", () => {
  it("activates a registered tool on toggle", () => {
    const c = new ToolCoordinator();
    const section = makeTool();
    c.register("section", section);
    expect(c.toggle("section")).toBe(true);
    expect(section.activate).toHaveBeenCalledOnce();
    expect(c.active).toBe("section");
  });

  it("deactivates on second toggle of the same tool", () => {
    const c = new ToolCoordinator();
    const section = makeTool();
    c.register("section", section);
    c.toggle("section");
    expect(c.toggle("section")).toBe(false);
    expect(section.deactivate).toHaveBeenCalledOnce();
    expect(c.active).toBeNull();
  });

  it("switching tools deactivates the previous one", () => {
    const c = new ToolCoordinator();
    const section = makeTool();
    const length = makeTool();
    c.register("section", section);
    c.register("length", length);
    c.toggle("section");
    c.toggle("length");
    expect(section.deactivate).toHaveBeenCalledOnce();
    expect(length.activate).toHaveBeenCalledOnce();
    expect(c.active).toBe("length");
  });

  it("deactivateAll clears the active tool", () => {
    const c = new ToolCoordinator();
    const area = makeTool();
    c.register("area", area);
    c.toggle("area");
    c.deactivateAll();
    expect(area.deactivate).toHaveBeenCalledOnce();
    expect(c.active).toBeNull();
  });

  it("deactivateAll is safe with nothing active", () => {
    const c = new ToolCoordinator();
    expect(() => c.deactivateAll()).not.toThrow();
  });

  it("notifies listeners on every change", () => {
    const c = new ToolCoordinator();
    c.register("section", makeTool());
    const seen: (string | null)[] = [];
    c.onChanged.add((active) => seen.push(active));
    c.toggle("section");
    c.deactivateAll();
    expect(seen).toEqual(["section", null]);
  });

  it("throws on toggling an unregistered tool", () => {
    const c = new ToolCoordinator();
    expect(() => c.toggle("length")).toThrow(/not registered/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/features/tools.ts`**

```ts
export type ToolId = "section" | "length" | "area";

export interface Tool {
  activate(): void;
  deactivate(): void;
}

/** Ensures at most one 3D tool is active; Esc returns to plain navigation. */
export class ToolCoordinator {
  readonly onChanged = new Set<(active: ToolId | null) => void>();

  private tools = new Map<ToolId, Tool>();
  private _active: ToolId | null = null;

  get active(): ToolId | null {
    return this._active;
  }

  register(id: ToolId, tool: Tool): void {
    this.tools.set(id, tool);
  }

  /** Returns true if the tool is active after the call. */
  toggle(id: ToolId): boolean {
    const tool = this.tools.get(id);
    if (!tool) throw new Error(`Tool "${id}" is not registered.`);
    const wasActive = this._active === id;
    this.deactivateCurrent();
    if (!wasActive) {
      tool.activate();
      this._active = id;
    }
    this.notify();
    return !wasActive;
  }

  deactivateAll(): void {
    const hadActive = this._active !== null;
    this.deactivateCurrent();
    if (hadActive) this.notify();
  }

  private deactivateCurrent(): void {
    if (this._active) this.tools.get(this._active)?.deactivate();
    this._active = null;
  }

  private notify(): void {
    for (const listener of this.onChanged) listener(this._active);
  }
}

export function wireEscKey(coordinator: ToolCoordinator): void {
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") coordinator.deactivateAll();
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/tools.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/tools.ts src/features/tools.test.ts
git commit -m "feat: tool coordinator for mutually exclusive 3D tools"
```

---

### Task 3: Tabbed side panels

**Files:**
- Modify: `src/ui/layout.ts`, `src/main.ts`

**Interfaces:**
- Consumes: existing `createLayout(root)` and `Layout` interface.
- Produces (used by Tasks 6, 7, 8): `Layout` gains `setFloorPlansPanel(el: HTMLElement): void` and `setQuantitiesPanel(el: HTMLElement): void`. Existing `setLeftPanel`/`setRightPanel` now target the "Model" and "Properties" tabs.

- [ ] **Step 1: Rewrite `src/ui/layout.ts` with tabs**

```ts
import * as BUI from "@thatopen/ui";

export interface Layout {
  viewport: HTMLElement;
  setLeftPanel(el: HTMLElement): void;
  setRightPanel(el: HTMLElement): void;
  setFloorPlansPanel(el: HTMLElement): void;
  setQuantitiesPanel(el: HTMLElement): void;
  setToolbar(el: HTMLElement): void;
}

function createTabs(
  tabs: { name: string; label: string }[],
): { root: BUI.Tabs; panes: Map<string, HTMLElement> } {
  const root = document.createElement("bim-tabs") as BUI.Tabs;
  root.switchersFull = true;
  const panes = new Map<string, HTMLElement>();
  for (const { name, label } of tabs) {
    const tab = document.createElement("bim-tab") as BUI.Tab;
    tab.name = name;
    tab.label = label;
    root.append(tab);
    panes.set(name, tab);
  }
  return { root, panes };
}

export function createLayout(root: HTMLElement): Layout {
  const grid = document.createElement("bim-grid") as BUI.Grid<["main"]>;

  const viewport = document.createElement("bim-viewport");
  const left = createTabs([
    { name: "model", label: "Model" },
    { name: "plans", label: "Floor plans" },
  ]);
  const right = createTabs([
    { name: "properties", label: "Properties" },
    { name: "quantities", label: "Quantities" },
  ]);
  const top = document.createElement("div");
  for (const el of [left.root, right.root, top]) el.style.overflow = "auto";

  grid.layouts = {
    main: {
      template: `
        "toolbar toolbar toolbar" auto
        "left viewport right" 1fr
        / 19rem 1fr 22rem
      `,
      elements: { toolbar: top, left: left.root, viewport, right: right.root },
    },
  };
  grid.layout = "main";
  root.append(grid);

  const setPane = (panes: Map<string, HTMLElement>, name: string) =>
    (el: HTMLElement) => panes.get(name)!.replaceChildren(el);

  return {
    viewport,
    setLeftPanel: setPane(left.panes, "model"),
    setFloorPlansPanel: setPane(left.panes, "plans"),
    setRightPanel: setPane(right.panes, "properties"),
    setQuantitiesPanel: setPane(right.panes, "quantities"),
    setToolbar: (el) => top.replaceChildren(el),
  };
}
```

> If `BUI.Tabs`/`BUI.Tab` type names differ, check `node_modules/@thatopen/ui/dist/index.d.ts` for the classes behind the `bim-tabs`/`bim-tab` custom elements (they exist — verified). `switchersFull` corresponds to the `switchers-full` attribute; if the property name differs, use `root.setAttribute("switchers-full", "")`.

- [ ] **Step 2: Add placeholder panes in `src/main.ts`**

After `layout.setLeftPanel(createTreePanel(viewer));` add temporary placeholders (replaced in Tasks 6 and 8):

```ts
const placeholder = (text: string) => {
  const div = document.createElement("div");
  div.style.padding = "1rem";
  div.textContent = text;
  return div;
};
layout.setFloorPlansPanel(placeholder("No floor plans available."));
layout.setQuantitiesPanel(placeholder("Load a model to see quantities."));
```

- [ ] **Step 3: Typecheck and verify in the browser**

Run: `npx tsc --noEmit` — expected: clean.
Run `npm run dev`, open http://localhost:5173 and confirm: left panel shows **Model | Floor plans** tabs (Model shows the spatial tree; Floor plans shows the placeholder), right panel shows **Properties | Quantities** tabs, and loading an IFC still works end to end (drag one in, click an element, properties appear).

- [ ] **Step 4: Commit**

```bash
git add src/ui/layout.ts src/main.ts
git commit -m "feat: tabbed left/right side panels"
```

---

### Task 4: Section planes

**Files:**
- Create: `src/features/sections.ts`
- Modify: `src/ui/toolbar.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `Tool`, `ToolCoordinator` from Task 2; `Viewer` from `src/core/viewer.ts`.
- Produces: `setupSections(viewer: Viewer, viewport: HTMLElement): SectionsApi` where `interface SectionsApi extends Tool { clearAll(): void }`. Toolbar gains handlers `onToggleSection(): void`, `onClearSections(): void` plus a `setActiveTool(id: ToolId | null): void` updater.

- [ ] **Step 1: Implement `src/features/sections.ts`**

```ts
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import type { Viewer } from "../core/viewer";
import type { Tool } from "./tools";

export interface SectionsApi extends Tool {
  clearAll(): void;
}

export function setupSections(
  viewer: Viewer,
  viewport: HTMLElement,
): SectionsApi {
  const { components, world } = viewer;

  const clipper = components.get(OBC.Clipper);
  clipper.enabled = false;

  // Outline edges on the cut faces (technical-drawing look).
  const styler = components.get(OBF.ClipStyler);
  styler.world = world;
  clipper.list.onItemSet.add(({ key }) => {
    styler.createFromClipping(key, { world });
  });

  viewport.addEventListener("dblclick", () => {
    if (clipper.enabled) void clipper.create(world);
  });
  window.addEventListener("keydown", (event) => {
    if (clipper.enabled && event.key === "Delete") void clipper.delete(world);
  });

  return {
    activate: () => {
      clipper.enabled = true;
    },
    deactivate: () => {
      clipper.enabled = false;
    },
    clearAll: () => {
      clipper.deleteAll();
    },
  };
}
```

> Verified in the installed `.d.ts`: `Clipper.create(world)`, `Clipper.enabled`, `Clipper.list` (a `DataMap` keyed by id), `ClipStyler.createFromClipping(id, config?)`. `Clipper` implements `Createable`, which includes `delete`/`deleteAll` — if `deleteAll()` is missing at runtime, delete each entry: `for (const [, plane] of [...clipper.list]) { ... }` per the Clipper section of the `.d.ts`.

- [ ] **Step 2: Extend the toolbar**

In `src/ui/toolbar.ts`, extend `ToolbarHandlers` and add a **Section** toggle plus **Clear cuts** button. The toolbar also needs to reflect the active tool, so `createToolbar` now returns `{ element, setActiveTool }`:

```ts
import * as BUI from "@thatopen/ui";
import type { ToolId } from "../features/tools";

export interface ToolbarHandlers {
  onOpenFile(file: File): void;
  onFit(): void;
  onHide(): void;
  onIsolate(): void;
  onShowAll(): void;
  onToggleSection(): void;
  onClearSections(): void;
}

export interface Toolbar {
  element: HTMLElement;
  setActiveTool(id: ToolId | null): void;
}

export function createToolbar(handlers: ToolbarHandlers): Toolbar {
  const openFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ifc";
    input.style.display = "none";
    document.body.append(input);
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) handlers.onOpenFile(file);
      input.remove();
    };
    input.click();
  };

  const element = BUI.Component.create<HTMLElement>(() => {
    return BUI.html`
      <bim-toolbar>
        <bim-toolbar-section label="File">
          <bim-button label="Open IFC" icon="mdi:folder-open"
            @click=${openFile}></bim-button>
        </bim-toolbar-section>
        <bim-toolbar-section label="View">
          <bim-button label="Fit" icon="mdi:fit-to-screen"
            @click=${() => handlers.onFit()}></bim-button>
          <bim-button label="Hide" icon="mdi:eye-off"
            @click=${() => handlers.onHide()}></bim-button>
          <bim-button label="Isolate" icon="mdi:filter"
            @click=${() => handlers.onIsolate()}></bim-button>
          <bim-button label="Show all" icon="mdi:eye"
            @click=${() => handlers.onShowAll()}></bim-button>
        </bim-toolbar-section>
        <bim-toolbar-section label="Section">
          <bim-button data-tool="section" label="Section" icon="mdi:knife"
            @click=${() => handlers.onToggleSection()}></bim-button>
          <bim-button label="Clear cuts" icon="mdi:delete-sweep"
            @click=${() => handlers.onClearSections()}></bim-button>
        </bim-toolbar-section>
      </bim-toolbar>
    `;
  });

  const setActiveTool = (id: ToolId | null) => {
    for (const button of element.querySelectorAll<HTMLElement & { active: boolean }>(
      "bim-button[data-tool]",
    )) {
      button.active = button.dataset.tool === id;
    }
  };

  return { element, setActiveTool };
}
```

(`bim-button` has an `active` property in `@thatopen/ui` — if it has no visual effect, set `button.toggleAttribute("active", ...)` instead and add a CSS rule `bim-button[active] { outline: 2px solid #bcf124; }` in `src/style.css`.)

- [ ] **Step 3: Wire it in `src/main.ts`**

Add imports:

```ts
import { ToolCoordinator, wireEscKey } from "./features/tools";
import { setupSections } from "./features/sections";
```

Inside `main()` after `setupSelection(viewer);`:

```ts
const coordinator = new ToolCoordinator();
wireEscKey(coordinator);

const sections = setupSections(viewer, layout.viewport);
coordinator.register("section", sections);
```

Update the toolbar wiring (note `createToolbar` now returns an object):

```ts
const handlers: ToolbarHandlers = {
  onOpenFile: openFile,
  onFit: () => runAction(fitToView(viewer)),
  onHide: () => runAction(hideSelected(viewer)),
  onIsolate: () => runAction(isolateSelected(viewer)),
  onShowAll: () => runAction(showAll(viewer)),
  onToggleSection: () => coordinator.toggle("section"),
  onClearSections: () => sections.clearAll(),
};
const toolbar = createToolbar(handlers);
coordinator.onChanged.add(toolbar.setActiveTool);
layout.setToolbar(toolbar.element);
```

- [ ] **Step 4: Typecheck and verify in the browser**

Run: `npx tsc --noEmit` — clean.
In the browser with a model loaded: click **Section** (button shows active), double-click a wall → a clipping plane appears and can be dragged; the cut shows outline edges; a second plane can be added; `Delete` removes the plane under the cursor; **Clear cuts** removes all; `Esc` exits section mode (button no longer active); orbiting still works.

- [ ] **Step 5: Commit**

```bash
git add src/features/sections.ts src/ui/toolbar.ts src/main.ts src/style.css
git commit -m "feat: section planes with outline edges"
```

---

### Task 5: Measurements (distance + area)

**Files:**
- Create: `src/features/measurements.ts`
- Modify: `src/ui/toolbar.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `Tool`, `ToolCoordinator` (Task 2); `getModelUnits` (Task 1); `Viewer`.
- Produces: `setupMeasurements(viewer: Viewer): MeasurementsApi` where `interface MeasurementsApi { length: Tool; area: Tool; clearAll(): void }`. Toolbar gains `onToggleLength()`, `onToggleArea()`, `onClearMeasurements()`.

- [ ] **Step 1: Implement `src/features/measurements.ts`**

```ts
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import type { Viewer } from "../core/viewer";
import type { Tool } from "./tools";
import { formatArea, formatLength, getModelUnits } from "../core/units";

export interface MeasurementsApi {
  length: Tool;
  area: Tool;
  clearAll(): void;
}

/** Units of the first loaded model (mixed-unit multi-model is out of scope). */
function activeUnits(viewer: Viewer) {
  const fragments = viewer.components.get(OBC.FragmentsManager);
  const first = fragments.list.keys().next();
  return getModelUnits(first.done ? "" : first.value);
}

export function setupMeasurements(viewer: Viewer): MeasurementsApi {
  const { components, world } = viewer;

  const length = components.get(OBF.LengthMeasurement);
  const area = components.get(OBF.AreaMeasurement);
  for (const tool of [length, area]) {
    tool.world = world;
    tool.enabled = false;
  }

  // Measured values arrive in meters (fragments geometry is normalized).
  // The static valueFormatter renders them in the model's units. It is shared
  // across tools, so it is swapped when a tool activates — fine because the
  // ToolCoordinator guarantees only one measurement tool is active at a time.
  const useLengthFormat = () => {
    OBF.Measurement.valueFormatter = (value: number) =>
      formatLength(value, activeUnits(viewer));
  };
  const useAreaFormat = () => {
    OBF.Measurement.valueFormatter = (value: number) =>
      formatArea(value, activeUnits(viewer));
  };

  return {
    length: {
      activate: () => {
        useLengthFormat();
        length.enabled = true;
      },
      deactivate: () => {
        length.cancelCreation();
        length.enabled = false;
      },
    },
    area: {
      activate: () => {
        useAreaFormat();
        area.enabled = true;
      },
      deactivate: () => {
        area.cancelCreation();
        area.enabled = false;
      },
    },
    clearAll: () => {
      for (const tool of [length, area]) {
        for (const item of [...tool.list]) tool.list.delete(item);
      }
    },
  };
}
```

> Verified in the installed `.d.ts`: `LengthMeasurement`/`AreaMeasurement` extend `Measurement` with `world`, `enabled`, `list` (a `DataSet`), `create()`, `endCreation()`, `cancelCreation()`, `delete()`, and static `Measurement.valueFormatter: ((value: number) => string) | null`. The tools attach their own pointer handlers when `enabled` — clicking in the viewport places points. If `OBF.Measurement` is not exported at runtime, set the formatter via either concrete class (`OBF.LengthMeasurement.valueFormatter = ...`) — it's the same static. If deleting from `list` does not remove visuals, use the tool's `delete()`/`deleteAll` pattern from the `.d.ts` instead.

- [ ] **Step 2: Add Measure toolbar section**

In `src/ui/toolbar.ts`, extend `ToolbarHandlers`:

```ts
  onToggleLength(): void;
  onToggleArea(): void;
  onClearMeasurements(): void;
```

Add after the Section `<bim-toolbar-section>`:

```html
<bim-toolbar-section label="Measure">
  <bim-button data-tool="length" label="Distance" icon="mdi:ruler"
    @click=${() => handlers.onToggleLength()}></bim-button>
  <bim-button data-tool="area" label="Area" icon="mdi:ruler-square"
    @click=${() => handlers.onToggleArea()}></bim-button>
  <bim-button label="Clear" icon="mdi:eraser"
    @click=${() => handlers.onClearMeasurements()}></bim-button>
</bim-toolbar-section>
```

- [ ] **Step 3: Wire in `src/main.ts`**

```ts
import { setupMeasurements } from "./features/measurements";
```

After the sections wiring:

```ts
const measurements = setupMeasurements(viewer);
coordinator.register("length", measurements.length);
coordinator.register("area", measurements.area);
```

New handler entries:

```ts
  onToggleLength: () => coordinator.toggle("length"),
  onToggleArea: () => coordinator.toggle("area"),
  onClearMeasurements: () => measurements.clearAll(),
```

- [ ] **Step 4: Typecheck and verify in the browser**

Run: `npx tsc --noEmit` — clean.
In the browser with the (imperial) Snowdon model: activate **Distance**, click two wall corners → a dimension line appears labeled in **ft** with a plausible value (an interior door opening is ~3 ft). Activate **Area**, click the corners of a room on the floor and double-click to finish → area label in **ft²**. Activating **Section** while measuring cancels the measurement mode (only one tool active). **Clear** removes all measurement visuals. `Esc` cancels an in-progress measurement. Repeat distance on a metric model (`models/school_str.ifc`) → labels in **m**.

- [ ] **Step 5: Commit**

```bash
git add src/features/measurements.ts src/ui/toolbar.ts src/main.ts
git commit -m "feat: distance and area measurements in model units"
```

---

### Task 6: Floor plans

**Files:**
- Create: `src/features/floorplans.ts`, `src/ui/panels/plans.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Layout.setFloorPlansPanel` (Task 3); `Viewer`.
- Produces:
  - `setupFloorPlans(viewer: Viewer): FloorPlansApi` where `interface FloorPlansApi { views: OBC.Views; refresh(): Promise<void>; open(id: string): void; exit(): void; readonly activeId: string | null; readonly onChanged: Set<() => void> }`
  - `createPlansPanel(api: FloorPlansApi): HTMLElement`

- [ ] **Step 1: Implement `src/features/floorplans.ts`**

```ts
import * as OBC from "@thatopen/components";
import type { Viewer } from "../core/viewer";

export interface FloorPlansApi {
  views: OBC.Views;
  refresh(): Promise<void>;
  open(id: string): void;
  exit(): void;
  readonly activeId: string | null;
  readonly onChanged: Set<() => void>;
}

export function setupFloorPlans(viewer: Viewer): FloorPlansApi {
  const { components, world } = viewer;
  const fragments = components.get(OBC.FragmentsManager);

  const views = components.get(OBC.Views);
  views.world = world;

  let activeId: string | null = null;
  const onChanged = new Set<() => void>();
  const notify = () => {
    for (const listener of onChanged) listener();
  };

  const api: FloorPlansApi = {
    views,
    get activeId() {
      return activeId;
    },
    onChanged,
    refresh: async () => {
      api.exit();
      for (const [id, view] of [...views.list]) {
        view.dispose();
        views.list.delete(id);
      }
      await views.createFromIfcStoreys({ world });
      notify();
    },
    open: (id: string) => {
      views.open(id);
      activeId = id;
      notify();
    },
    exit: () => {
      if (activeId === null) return;
      views.close();
      activeId = null;
      notify();
    },
  };

  fragments.list.onItemSet.add(() => void api.refresh());
  fragments.list.onItemDeleted.add(() => void api.refresh());

  return api;
}
```

> Verified in the installed `.d.ts`: `Views.createFromIfcStoreys(config?: { modelIds?, storeyNames?, offset?, world? }): Promise<View[]>`, `views.open(id)`, `views.close(id?)`, `views.list: DataMap<string, View>`, `View.dispose()`, and `Views.restoreCameraOnClose` (defaults on — the camera returns to its pre-plan state on close). The view id is the storey name. If opening a view does not switch to a top-down orthographic look on its own, add `world.camera.projection.set("Orthographic")` in `open` and `world.camera.projection.set("Perspective")` in `exit` (`ProjectionManager.set` verified in `.d.ts`).

- [ ] **Step 2: Implement `src/ui/panels/plans.ts`**

```ts
import * as BUI from "@thatopen/ui";
import type { FloorPlansApi } from "../../features/floorplans";

export function createPlansPanel(api: FloorPlansApi): HTMLElement {
  const panel = BUI.Component.create<HTMLElement>(() => {
    return BUI.html`
      <bim-panel label="Floor plans">
        <bim-panel-section label="Storeys">
          <div class="plans-list"></div>
        </bim-panel-section>
      </bim-panel>
    `;
  });

  const listEl = panel.querySelector<HTMLDivElement>(".plans-list")!;

  const render = () => {
    listEl.replaceChildren();
    const ids = [...api.views.list.keys()];
    if (ids.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No floor plans available.";
      listEl.append(empty);
      return;
    }
    for (const id of ids) {
      const button = document.createElement("bim-button") as HTMLElement & {
        label: string;
        active: boolean;
      };
      button.label = id;
      button.active = api.activeId === id;
      button.addEventListener("click", () => api.open(id));
      listEl.append(button);
    }
    if (api.activeId !== null) {
      const exit = document.createElement("bim-button") as HTMLElement & {
        label: string;
        icon: string;
      };
      exit.label = "Exit plan";
      exit.icon = "mdi:exit-to-app";
      exit.addEventListener("click", () => api.exit());
      listEl.append(exit);
    }
  };

  api.onChanged.add(render);
  render();
  return panel;
}
```

- [ ] **Step 3: Wire in `src/main.ts`**

```ts
import { setupFloorPlans } from "./features/floorplans";
import { createPlansPanel } from "./ui/panels/plans";
```

Replace the floor-plans placeholder line with:

```ts
const floorPlans = setupFloorPlans(viewer);
layout.setFloorPlansPanel(createPlansPanel(floorPlans));
```

(Remove the now-unused `placeholder` call for plans; keep the quantities placeholder until Task 8.)

- [ ] **Step 4: Typecheck and verify in the browser**

Run: `npx tsc --noEmit` — clean.
In the browser: load Snowdon → Floor plans tab lists its storeys (e.g. Level 1, Level 2, Roof). Click **Level 1** → top-down view of that storey with floors above cut away; **Exit plan** restores the previous 3D view. With no model loaded the tab says "No floor plans available."

- [ ] **Step 5: Commit**

```bash
git add src/features/floorplans.ts src/ui/panels/plans.ts src/main.ts
git commit -m "feat: per-storey floor plan views"
```

---

### Task 7: Search & filter

**Files:**
- Create: `src/features/finder-query.ts`, `src/features/finder-query.test.ts`, `src/features/finder.ts`, `src/ui/panels/finder.ts`
- Modify: `src/ui/panels/tree.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `OBC.ItemsFinder.getItems`, `OBC.Hider`, `OBF.Highlighter` (all already in the app); `Viewer`.
- Produces:
  - `buildFinderQueries(text: string, category: string | null, storey: string | null): FRAGS.ItemsQueryParams[]` — returns `[]` when all inputs are empty.
  - `escapeRegExp(s: string): string`
  - `setupFinder(viewer: Viewer): FinderApi` where:
    ```ts
    interface FinderApi {
      run(text: string, category: string | null, storey: string | null): Promise<number>;
      isolate(): Promise<void>;
      clear(): Promise<void>;
      getCategories(): Promise<string[]>;
      getStoreys(): Promise<string[]>;
    }
    ```
  - `createFinderSection(api: FinderApi, viewer: Viewer): HTMLElement`

- [ ] **Step 1: Write the failing tests**

Create `src/features/finder-query.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildFinderQueries, escapeRegExp } from "./finder-query";

describe("escapeRegExp", () => {
  it("escapes regex metacharacters", () => {
    expect(escapeRegExp("W1 (200x90)")).toBe("W1 \\(200x90\\)");
  });
});

describe("buildFinderQueries", () => {
  it("returns no queries when everything is empty", () => {
    expect(buildFinderQueries("", null, null)).toEqual([]);
    expect(buildFinderQueries("   ", null, null)).toEqual([]);
  });

  it("builds an exact category query", () => {
    const [q] = buildFinderQueries("", "IFCDOOR", null);
    expect(q.categories).toHaveLength(1);
    expect(q.categories![0].test("IFCDOOR")).toBe(true);
    expect(q.categories![0].test("IFCDOORSTYLE")).toBe(false);
  });

  it("builds a case-insensitive name query from text", () => {
    const [q] = buildFinderQueries("plywood", null, null);
    const nameQuery = q.attributes!.queries[0];
    expect(nameQuery.name.test("Name")).toBe(true);
    expect((nameQuery.value as RegExp).test("Wall PLYWOOD panel")).toBe(true);
  });

  it("builds a storey relation query", () => {
    const [q] = buildFinderQueries("", null, "Level 2");
    expect(q.relation).toBeDefined();
    expect(q.relation!.name).toBe("ContainedInStructure");
    const storeyName = q.relation!.query!.attributes!.queries[0];
    expect((storeyName.value as RegExp).test("Level 2")).toBe(true);
    expect((storeyName.value as RegExp).test("Level 20")).toBe(false);
  });

  it("combines all three filters into one query (AND)", () => {
    const [q] = buildFinderQueries("fire", "IFCDOOR", "Level 2");
    expect(q.categories).toBeDefined();
    expect(q.attributes).toBeDefined();
    expect(q.relation).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/finder-query.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/features/finder-query.ts`**

```ts
import type * as FRAGS from "@thatopen/fragments";

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds fragments item queries for the finder panel. All provided filters
 * are ANDed. Returns [] when there is nothing to search for.
 */
export function buildFinderQueries(
  text: string,
  category: string | null,
  storey: string | null,
): FRAGS.ItemsQueryParams[] {
  const trimmed = text.trim();
  if (!trimmed && !category && !storey) return [];

  const query: FRAGS.ItemsQueryParams = {};
  if (category) {
    query.categories = [new RegExp(`^${escapeRegExp(category)}$`)];
  }
  if (trimmed) {
    query.attributes = {
      queries: [{ name: /Name/, value: new RegExp(escapeRegExp(trimmed), "i") }],
    };
  }
  if (storey) {
    query.relation = {
      name: "ContainedInStructure",
      query: {
        attributes: {
          queries: [{ name: /^Name$/, value: new RegExp(`^${escapeRegExp(storey)}$`) }],
        },
      },
    };
  }
  return [query];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/finder-query.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Implement `src/features/finder.ts`**

```ts
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import type { Viewer } from "../core/viewer";
import { buildFinderQueries } from "./finder-query";

export interface FinderApi {
  run(
    text: string,
    category: string | null,
    storey: string | null,
  ): Promise<number>;
  isolate(): Promise<void>;
  clear(): Promise<void>;
  getCategories(): Promise<string[]>;
  getStoreys(): Promise<string[]>;
}

function countItems(map: OBC.ModelIdMap): number {
  let count = 0;
  for (const ids of Object.values(map)) {
    // ModelIdMap values are Sets in v3; tolerate arrays defensively.
    const bag = ids as unknown as { size?: number; length?: number };
    count += bag.size ?? bag.length ?? 0;
  }
  return count;
}

export function setupFinder(viewer: Viewer): FinderApi {
  const { components } = viewer;
  const fragments = components.get(OBC.FragmentsManager);
  const finder = components.get(OBC.ItemsFinder);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);

  let lastResult: OBC.ModelIdMap = {};

  return {
    run: async (text, category, storey) => {
      const queries = buildFinderQueries(text, category, storey);
      if (queries.length === 0) {
        lastResult = {};
        await highlighter.clear("select");
        return 0;
      }
      lastResult = await finder.getItems(queries);
      await highlighter.highlightByID("select", lastResult, true, false);
      return countItems(lastResult);
    },
    isolate: async () => {
      if (countItems(lastResult) === 0) return;
      await hider.isolate(lastResult);
    },
    clear: async () => {
      lastResult = {};
      await highlighter.clear("select");
      await hider.set(true);
    },
    getCategories: async () => {
      const all = new Set<string>();
      for (const [, model] of fragments.list) {
        for (const category of await model.getCategories()) all.add(category);
      }
      return [...all].sort();
    },
    getStoreys: async () => {
      const names = new Set<string>();
      for (const [, model] of fragments.list) {
        const storeys = await model.getItemsOfCategories([
          /^IFCBUILDINGSTOREY$/,
        ]);
        const localIds = Object.values(storeys).flat();
        if (localIds.length === 0) continue;
        const items = await model.getItemsData(localIds, {
          attributesDefault: false,
          attributes: ["Name"],
        });
        for (const item of items) {
          const name = (item.Name as { value?: unknown } | undefined)?.value;
          if (typeof name === "string") names.add(name);
        }
      }
      return [...names].sort();
    },
  };
}
```

> Verified in the installed `.d.ts`: `ItemsFinder.getItems(queries, config?): Promise<ModelIdMap>`; `Highlighter.highlightByID(name, modelIdMap, removePrevious?, zoomToSelection?)`; `FragmentsModel.getCategories()`, `getItemsOfCategories(RegExp[])`, `getItemsData(ids, config)`. `ModelIdMap` values may be `Set<number>` — `countItems` handles both `Set` and array. The relation name `"ContainedInStructure"` is what the spatial-tree UI itself uses (grep-verified in `@thatopen/ui-obc`/`@thatopen/components` bundles).

- [ ] **Step 6: Implement `src/ui/panels/finder.ts`**

```ts
import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import type { Viewer } from "../../core/viewer";
import type { FinderApi } from "../../features/finder";
import { showStatus } from "../status";

export function createFinderSection(
  api: FinderApi,
  viewer: Viewer,
): HTMLElement {
  const section = BUI.Component.create<HTMLElement>(() => {
    return BUI.html`
      <bim-panel-section label="Search & filter">
        <bim-text-input class="finder-text" placeholder="Name contains…"
          debounce="300"></bim-text-input>
        <bim-dropdown class="finder-category" label="Category"></bim-dropdown>
        <bim-dropdown class="finder-storey" label="Storey"></bim-dropdown>
        <div class="finder-actions">
          <bim-button label="Search" icon="mdi:magnify"></bim-button>
          <bim-button label="Isolate" icon="mdi:filter"></bim-button>
          <bim-button label="Clear" icon="mdi:close"></bim-button>
        </div>
        <bim-label class="finder-result"></bim-label>
      </bim-panel-section>
    `;
  });

  const textEl = section.querySelector<BUI.TextInput>(".finder-text")!;
  const categoryEl = section.querySelector<BUI.Dropdown>(".finder-category")!;
  const storeyEl = section.querySelector<BUI.Dropdown>(".finder-storey")!;
  const resultEl = section.querySelector<HTMLElement>(".finder-result")!;
  const [searchBtn, isolateBtn, clearBtn] = [
    ...section.querySelectorAll("bim-button"),
  ];

  const fillDropdown = (dropdown: BUI.Dropdown, values: string[]) => {
    dropdown.replaceChildren();
    for (const value of values) {
      const option = document.createElement("bim-option");
      option.setAttribute("label", value);
      option.setAttribute("value", value);
      dropdown.append(option);
    }
  };

  const refreshOptions = async () => {
    fillDropdown(categoryEl, await api.getCategories());
    fillDropdown(storeyEl, await api.getStoreys());
  };
  const fragments = viewer.components.get(OBC.FragmentsManager);
  fragments.list.onItemSet.add(() => void refreshOptions());
  fragments.list.onItemDeleted.add(() => void refreshOptions());

  const selected = (dropdown: BUI.Dropdown): string | null => {
    const value = dropdown.value;
    if (Array.isArray(value)) return (value[0] as string) ?? null;
    return (value as string) || null;
  };

  const run = async () => {
    const count = await api.run(
      textEl.value,
      selected(categoryEl),
      selected(storeyEl),
    );
    resultEl.textContent = `${count} element${count === 1 ? "" : "s"} match`;
  };

  searchBtn.addEventListener("click", () => {
    run().catch((e) => showStatus(e instanceof Error ? e.message : String(e), "error"));
  });
  isolateBtn.addEventListener("click", () => {
    api.isolate().catch((e) => showStatus(e instanceof Error ? e.message : String(e), "error"));
  });
  clearBtn.addEventListener("click", () => {
    textEl.value = "";
    resultEl.textContent = "";
    api.clear().catch((e) => showStatus(e instanceof Error ? e.message : String(e), "error"));
  });

  return section;
}
```

> `bim-dropdown`/`bim-option` exist in `@thatopen/ui` (verified: `Dropdown`, `Option_` classes). `Dropdown.value` is an array in multi-select mode and a single value otherwise — `selected()` handles both. If `bim-label` doesn't render, use a plain `<div>`.

- [ ] **Step 7: Mount the section in the tree panel**

In `src/ui/panels/tree.ts`, change `createTreePanel` to accept the section and place it above the spatial tree:

```ts
export function createTreePanel(
  viewer: Viewer,
  finderSection?: HTMLElement,
): HTMLElement {
```

and in the template, insert `${finderSection ?? ""}` between `<bim-panel label="Model">` and the existing `<bim-panel-section label="Spatial tree">`.

In `src/main.ts`:

```ts
import { setupFinder } from "./features/finder";
import { createFinderSection } from "./ui/panels/finder";
```

Replace `layout.setLeftPanel(createTreePanel(viewer));` with:

```ts
const finder = setupFinder(viewer);
layout.setLeftPanel(
  createTreePanel(viewer, createFinderSection(finder, viewer)),
);
```

- [ ] **Step 8: Typecheck, full tests, browser verification**

Run: `npm test && npx tsc --noEmit` — all pass, clean.
In the browser with Snowdon loaded: Category dropdown lists IFC categories, Storey dropdown lists levels. Pick `IFCDOOR` + a level, **Search** → doors highlight, "N elements match" shows a plausible count; **Isolate** hides everything else; **Clear** + toolbar **Show all** restores. Text search for part of a known element name highlights it.

- [ ] **Step 9: Commit**

```bash
git add src/features/finder-query.ts src/features/finder-query.test.ts src/features/finder.ts src/ui/panels/finder.ts src/ui/panels/tree.ts src/main.ts
git commit -m "feat: search and filter by name, category, and storey"
```

---

### Task 8: Quantity summaries + CSV export

**Files:**
- Create: `src/features/quantities/extract.ts`, `extract.test.ts`, `aggregate.ts`, `aggregate.test.ts`, `csv.ts`, `csv.test.ts`, `index.ts`
- Create: `src/ui/panels/quantities.ts`
- Modify: `src/main.ts`, `src/style.css`

**Interfaces:**
- Consumes: `getModelUnits`, `ModelUnits` (Task 1); `Layout.setQuantitiesPanel` (Task 3).
- Produces:
  - `extract.ts`: `interface QuantityRow { category: string; type: string; area: number | null; volume: number | null }`, `extractItemQuantities(item: unknown): { area: number | null; volume: number | null }`, `itemTypeName(item: unknown): string`
  - `aggregate.ts`: `interface QuantityGroup { category: string; type: string; count: number; area: number | null; volume: number | null }`, `aggregateRows(rows: QuantityRow[]): QuantityGroup[]`, `countMissing(rows: QuantityRow[]): number`
  - `csv.ts`: `toCsv(groups: QuantityGroup[], units: ModelUnits): string`
  - `index.ts`: `collectQuantities(viewer: Viewer): Promise<{ groups: QuantityGroup[]; missing: number; units: ModelUnits; modelName: string }>`, `downloadCsv(filename: string, csv: string): void`

- [ ] **Step 1: Write failing tests for extraction**

Create `src/features/quantities/extract.test.ts`. IFC quantity sets arrive inside `ItemData` as nested objects: an element's `IsDefinedBy` contains quantity-set objects whose quantity children carry `Name: { value }` plus `AreaValue: { value }` or `VolumeValue: { value }`. The extractor scans recursively so it tolerates structural variations between exporters:

```ts
import { describe, expect, it } from "vitest";
import { extractItemQuantities, itemTypeName } from "./extract";

const wall = {
  Name: { value: "Basic Wall:Generic - 8\"" },
  ObjectType: { value: "Basic Wall:Generic - 8\"" },
  IsDefinedBy: [
    {
      Name: { value: "Qto_WallBaseQuantities" },
      HasQuantities: [
        { Name: { value: "NetSideArea" }, AreaValue: { value: 42.5 } },
        { Name: { value: "NetVolume" }, VolumeValue: { value: 12.25 } },
        { Name: { value: "Height" }, LengthValue: { value: 10 } },
      ],
    },
  ],
};

describe("extractItemQuantities", () => {
  it("finds area and volume in nested quantity sets", () => {
    expect(extractItemQuantities(wall)).toEqual({ area: 42.5, volume: 12.25 });
  });

  it("returns nulls when there are no quantity sets", () => {
    expect(extractItemQuantities({ Name: { value: "x" } })).toEqual({
      area: null,
      volume: null,
    });
  });

  it("prefers Net values over Gross values", () => {
    const item = {
      IsDefinedBy: [
        {
          HasQuantities: [
            { Name: { value: "GrossArea" }, AreaValue: { value: 100 } },
            { Name: { value: "NetArea" }, AreaValue: { value: 90 } },
          ],
        },
      ],
    };
    expect(extractItemQuantities(item).area).toBe(90);
  });

  it("handles null attribute values without crashing", () => {
    expect(extractItemQuantities({ Foo: null, Bar: [null] })).toEqual({
      area: null,
      volume: null,
    });
  });
});

describe("itemTypeName", () => {
  it("prefers ObjectType, falls back to Name, then (untyped)", () => {
    expect(itemTypeName(wall)).toBe('Basic Wall:Generic - 8"');
    expect(itemTypeName({ Name: { value: "N" } })).toBe("N");
    expect(itemTypeName({})).toBe("(untyped)");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/quantities/extract.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/features/quantities/extract.ts`**

```ts
export interface QuantityRow {
  category: string;
  type: string;
  area: number | null;
  volume: number | null;
}

interface Found {
  name: string;
  value: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function attributeNumber(value: unknown): number | null {
  if (isRecord(value) && typeof value.value === "number") return value.value;
  return null;
}

function attributeString(value: unknown): string | null {
  if (isRecord(value) && typeof value.value === "string") return value.value;
  return null;
}

/** Recursively collects `<Kind>Value` quantity entries with their Name. */
function collect(node: unknown, key: "AreaValue" | "VolumeValue", out: Found[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, key, out);
    return;
  }
  if (!isRecord(node)) return;
  const value = attributeNumber(node[key]);
  if (value !== null) {
    out.push({ name: attributeString(node.Name) ?? "", value });
  }
  for (const child of Object.values(node)) collect(child, key, out);
}

function pick(found: Found[]): number | null {
  if (found.length === 0) return null;
  const net = found.find((f) => /net/i.test(f.name));
  return (net ?? found[0]).value;
}

export function extractItemQuantities(item: unknown): {
  area: number | null;
  volume: number | null;
} {
  const areas: Found[] = [];
  const volumes: Found[] = [];
  collect(item, "AreaValue", areas);
  collect(item, "VolumeValue", volumes);
  return { area: pick(areas), volume: pick(volumes) };
}

export function itemTypeName(item: unknown): string {
  if (!isRecord(item)) return "(untyped)";
  return (
    attributeString(item.ObjectType) ??
    attributeString(item.Name) ??
    "(untyped)"
  );
}
```

- [ ] **Step 4: Run extraction tests — PASS**

Run: `npx vitest run src/features/quantities/extract.test.ts`
Expected: PASS (6 assertions across 5 tests).

- [ ] **Step 5: Write failing tests for aggregation and CSV**

Create `src/features/quantities/aggregate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aggregateRows, countMissing } from "./aggregate";
import type { QuantityRow } from "./extract";

const rows: QuantityRow[] = [
  { category: "IFCWALL", type: "Generic - 8\"", area: 10, volume: 2 },
  { category: "IFCWALL", type: "Generic - 8\"", area: 5, volume: null },
  { category: "IFCWALL", type: "Curtain", area: null, volume: null },
  { category: "IFCDOOR", type: "Single-Flush", area: null, volume: null },
];

describe("aggregateRows", () => {
  it("groups by category then type, sorted", () => {
    const groups = aggregateRows(rows);
    expect(groups.map((g) => `${g.category}/${g.type}`)).toEqual([
      "IFCDOOR/Single-Flush",
      "IFCWALL/Curtain",
      'IFCWALL/Generic - 8"',
    ]);
  });

  it("counts items and sums available values", () => {
    const wall = aggregateRows(rows).find((g) => g.type === 'Generic - 8"')!;
    expect(wall.count).toBe(2);
    expect(wall.area).toBe(15);
    expect(wall.volume).toBe(2);
  });

  it("uses null when no item in the group has a value", () => {
    const curtain = aggregateRows(rows).find((g) => g.type === "Curtain")!;
    expect(curtain.area).toBeNull();
    expect(curtain.volume).toBeNull();
  });
});

describe("countMissing", () => {
  it("counts rows with neither area nor volume", () => {
    expect(countMissing(rows)).toBe(2);
  });
});
```

Create `src/features/quantities/csv.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";
import { IMPERIAL_UNITS } from "../../core/units";

describe("toCsv", () => {
  it("writes header with unit labels, escapes fields, uses CRLF", () => {
    const csv = toCsv(
      [
        {
          category: "IFCWALL",
          type: 'Says "hi", ok',
          count: 2,
          area: 15,
          volume: null,
        },
      ],
      IMPERIAL_UNITS,
    );
    // slice(1) drops the UTF-8 BOM prepended for Excel
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Category,Type,Count,Area (ft²),Volume (ft³)");
    expect(lines[1]).toBe('IFCWALL,"Says ""hi"", ok",2,15,');
  });

  it("starts with a UTF-8 BOM so Excel reads the units symbols", () => {
    const csv = toCsv([], IMPERIAL_UNITS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});
```

- [ ] **Step 6: Run to verify they fail, then implement**

Run: `npx vitest run src/features/quantities` — extract passes, aggregate/csv FAIL (module not found).

`src/features/quantities/aggregate.ts`:

```ts
import type { QuantityRow } from "./extract";

export interface QuantityGroup {
  category: string;
  type: string;
  count: number;
  area: number | null;
  volume: number | null;
}

export function aggregateRows(rows: QuantityRow[]): QuantityGroup[] {
  const groups = new Map<string, QuantityGroup>();
  for (const row of rows) {
    const key = `${row.category}\u0000${row.type}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        category: row.category,
        type: row.type,
        count: 0,
        area: null,
        volume: null,
      };
      groups.set(key, group);
    }
    group.count += 1;
    if (row.area !== null) group.area = (group.area ?? 0) + row.area;
    if (row.volume !== null) group.volume = (group.volume ?? 0) + row.volume;
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.type.localeCompare(b.type),
  );
}

export function countMissing(rows: QuantityRow[]): number {
  return rows.filter((r) => r.area === null && r.volume === null).length;
}
```

`src/features/quantities/csv.ts`:

```ts
import type { ModelUnits } from "../../core/units";
import type { QuantityGroup } from "./aggregate";

function escapeField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(groups: QuantityGroup[], units: ModelUnits): string {
  const header = [
    "Category",
    "Type",
    "Count",
    `Area (${units.areaSymbol})`,
    `Volume (${units.volumeSymbol})`,
  ];
  const lines = [header.join(",")];
  for (const g of groups) {
    lines.push(
      [
        escapeField(g.category),
        escapeField(g.type),
        String(g.count),
        g.area === null ? "" : String(g.area),
        g.volume === null ? "" : String(g.volume),
      ].join(","),
    );
  }
  return "\uFEFF" + lines.join("\r\n");
}
```

- [ ] **Step 7: Run all quantities tests — PASS**

Run: `npx vitest run src/features/quantities`
Expected: PASS.

- [ ] **Step 8: Implement `src/features/quantities/index.ts` (data fetching)**

```ts
import * as OBC from "@thatopen/components";
import type { Viewer } from "../../core/viewer";
import { getModelUnits, METRIC_UNITS, type ModelUnits } from "../../core/units";
import { extractItemQuantities, itemTypeName, type QuantityRow } from "./extract";
import { aggregateRows, countMissing, type QuantityGroup } from "./aggregate";

export interface QuantityReport {
  groups: QuantityGroup[];
  missing: number;
  units: ModelUnits;
  modelName: string;
}

const BATCH = 200;

export async function collectQuantities(
  viewer: Viewer,
): Promise<QuantityReport> {
  const fragments = viewer.components.get(OBC.FragmentsManager);
  const rows: QuantityRow[] = [];
  let units = METRIC_UNITS;
  let modelName = "quantities";

  for (const [modelId, model] of fragments.list) {
    units = getModelUnits(modelId);
    modelName = modelId;
    const byCategory = await model.getItemsOfCategories([/.*/]);
    for (const [category, localIds] of Object.entries(byCategory)) {
      // Spatial/relationship categories have no takeoff value; skip empties.
      if (localIds.length === 0 || category.startsWith("IFCREL")) continue;
      for (let i = 0; i < localIds.length; i += BATCH) {
        const batch = localIds.slice(i, i + BATCH);
        const items = await model.getItemsData(batch, {
          attributesDefault: false,
          attributes: ["Name", "ObjectType", "AreaValue", "VolumeValue"],
          relations: {
            IsDefinedBy: { attributes: true, relations: true },
          },
          relationsDefault: { attributes: false, relations: false },
        });
        for (const item of items) {
          const { area, volume } = extractItemQuantities(item);
          rows.push({
            category,
            type: itemTypeName(item),
            area,
            volume,
          });
        }
      }
    }
  }

  return {
    groups: aggregateRows(rows),
    missing: countMissing(rows),
    units,
    modelName,
  };
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

> If the `ItemsDataConfig` relations config doesn't surface `HasQuantities` children (empty quantity columns for a model that has base quantities), set `relationsDefault: { attributes: true, relations: false }` and add `HasQuantities: { attributes: true, relations: false }` next to `IsDefinedBy` in `relations`. The recursive extractor is agnostic to the exact nesting.

- [ ] **Step 9: Implement `src/ui/panels/quantities.ts`**

```ts
import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import type { Viewer } from "../../core/viewer";
import { collectQuantities, downloadCsv, type QuantityReport } from "../../features/quantities";
import { toCsv } from "../../features/quantities/csv";
import { showStatus } from "../status";

export function createQuantitiesPanel(viewer: Viewer): HTMLElement {
  const panel = BUI.Component.create<HTMLElement>(() => {
    return BUI.html`
      <bim-panel label="Quantities">
        <bim-panel-section label="By element type">
          <div class="qty-actions">
            <bim-button class="qty-refresh" label="Refresh" icon="mdi:refresh"></bim-button>
            <bim-button class="qty-download" label="Download CSV" icon="mdi:download"></bim-button>
          </div>
          <div class="qty-table-host">Load a model to see quantities.</div>
          <div class="qty-footnote"></div>
        </bim-panel-section>
      </bim-panel>
    `;
  });

  const host = panel.querySelector<HTMLDivElement>(".qty-table-host")!;
  const footnote = panel.querySelector<HTMLDivElement>(".qty-footnote")!;
  const refreshBtn = panel.querySelector<HTMLElement>(".qty-refresh")!;
  const downloadBtn = panel.querySelector<HTMLElement>(".qty-download")!;

  let report: QuantityReport | null = null;

  const fmt = (value: number | null) =>
    value === null ? "—" : value.toFixed(2);

  const render = () => {
    if (!report || report.groups.length === 0) {
      host.textContent = "Load a model to see quantities.";
      footnote.textContent = "";
      return;
    }
    const table = document.createElement("table");
    table.className = "qty-table";
    table.innerHTML =
      `<thead><tr><th>Category</th><th>Type</th><th>Count</th>` +
      `<th>Area (${report.units.areaSymbol})</th>` +
      `<th>Volume (${report.units.volumeSymbol})</th></tr></thead>`;
    const tbody = document.createElement("tbody");
    for (const g of report.groups) {
      const tr = document.createElement("tr");
      for (const cell of [g.category, g.type, String(g.count), fmt(g.area), fmt(g.volume)]) {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody);
    host.replaceChildren(table);
    footnote.textContent =
      report.missing > 0
        ? `${report.missing} element(s) had no quantity data (shown as —).`
        : "";
  };

  const refresh = async () => {
    host.textContent = "Computing…";
    report = await collectQuantities(viewer);
    render();
  };

  refreshBtn.addEventListener("click", () => {
    refresh().catch((e) => {
      host.textContent = "Load a model to see quantities.";
      showStatus(e instanceof Error ? e.message : String(e), "error");
    });
  });
  downloadBtn.addEventListener("click", () => {
    if (!report || report.groups.length === 0) {
      showStatus("Nothing to export yet — load a model first.", "info");
      return;
    }
    downloadCsv(`${report.modelName}-quantities.csv`, toCsv(report.groups, report.units));
  });

  const fragments = viewer.components.get(OBC.FragmentsManager);
  fragments.list.onItemSet.add(() => {
    refresh().catch(() => {
      /* surfaced via Refresh click path if the user retries */
    });
  });
  fragments.list.onItemDeleted.add(() => {
    report = null;
    render();
  });

  return panel;
}
```

Add to `src/style.css`:

```css
.qty-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.qty-table th,
.qty-table td {
  text-align: left;
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
}
.qty-table td:nth-child(n + 3) {
  text-align: right;
}
.qty-footnote {
  font-size: 0.75rem;
  opacity: 0.7;
  padding-top: 0.5rem;
}
.qty-actions {
  display: flex;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
}
```

- [ ] **Step 10: Wire in `src/main.ts`**

```ts
import { createQuantitiesPanel } from "./ui/panels/quantities";
```

Replace the quantities placeholder line with:

```ts
layout.setQuantitiesPanel(createQuantitiesPanel(viewer));
```

(Remove the `placeholder` helper if nothing else uses it.)

- [ ] **Step 11: Full tests, typecheck, browser verification**

Run: `npm test && npx tsc --noEmit` — all pass.
In the browser with Snowdon: Quantities tab populates after load (walls/doors/windows rows with counts; areas/volumes in ft²/ft³ where the export included base quantities — cross-check one wall type's count against the model tree). **Download CSV** saves `<model>-quantities.csv`; open it in Excel: columns split correctly, ² symbols intact, "—" cells are empty. If ALL areas/volumes are "—", the export lacks base quantities — re-export from Revit with *File → Export → IFC → Modify setup → Property Sets → Export base quantities* checked, and apply the fallback from the Step 8 callout if quantities still don't appear.

- [ ] **Step 12: Commit**

```bash
git add src/features/quantities src/ui/panels/quantities.ts src/main.ts src/style.css
git commit -m "feat: quantity summaries by element type with CSV export"
```

---

### Task 9: Tool enablement, docs, final verification

**Files:**
- Modify: `src/main.ts`, `src/ui/toolbar.ts`, `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `Toolbar` gains `setToolsEnabled(enabled: boolean): void`.

- [ ] **Step 1: Disable tools until a model is loaded**

In `src/ui/toolbar.ts`, mark every model-dependent button with `data-needs-model` (all View/Section/Measure buttons — everything except Open IFC) and extend the returned `Toolbar`:

```ts
export interface Toolbar {
  element: HTMLElement;
  setActiveTool(id: ToolId | null): void;
  setToolsEnabled(enabled: boolean): void;
}
```

```ts
const setToolsEnabled = (enabled: boolean) => {
  for (const button of element.querySelectorAll<HTMLElement & { disabled: boolean }>(
    "bim-button[data-needs-model]",
  )) {
    button.disabled = !enabled;
  }
};
```

Return it alongside the others, and initialize with `setToolsEnabled(false)` at the end of `createToolbar`.

In `src/main.ts`, after the toolbar wiring:

```ts
const fragments = viewer.components.get(OBC.FragmentsManager);
const syncToolEnablement = () => {
  const hasModels = fragments.list.size > 0;
  toolbar.setToolsEnabled(hasModels);
  if (!hasModels) coordinator.deactivateAll();
};
fragments.list.onItemSet.add(syncToolEnablement);
fragments.list.onItemDeleted.add(syncToolEnablement);
syncToolEnablement();
```

(Add `import * as OBC from "@thatopen/components";` to `main.ts` if not present.)

- [ ] **Step 2: Update CLAUDE.md project state**

Replace the "Project state" section body with:

```markdown
Phase 1 (core viewer) and Phase 2 (BIM data tools: sections, measurements,
floor plans, search & filter, quantities + CSV) implemented. Design specs:
`docs/superpowers/specs/2026-07-02-bim-viewer-design.md`,
`docs/superpowers/specs/2026-07-03-phase2-bim-data-tools-design.md`. Plans:
`docs/superpowers/plans/`.
```

- [ ] **Step 3: Full verification**

Run: `npm test` — all unit tests pass.
Run: `npm run build` — clean production build (tsc strict + vite).
Browser acceptance pass against the spec's success criteria, with Snowdon:
1. Section: cut the building open, slide the plane, clear it.
2. Measure: a wall length and a floor area, labels in ft/ft².
3. Floor plans: open a storey plan, exit back to 3D.
4. Finder: isolate doors on one level, then Show all.
5. Quantities: table populated, CSV downloads and opens in Excel.
6. Phase 1 regression: load, orbit, tree, properties, hide/isolate, reload from cache — all still work; with no model, tool buttons are greyed out.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/ui/toolbar.ts CLAUDE.md
git commit -m "feat: disable BIM tools without a model; Phase 2 docs"
```

- [ ] **Step 5: Merge readiness**

Push the branch and hand off per superpowers:finishing-a-development-branch (owner acceptance test happens on the branch before merge to main).
