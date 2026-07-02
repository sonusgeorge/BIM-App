# BIM Viewer Phase 1 (Core Viewer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser-based BIM viewer: drag an IFC file in, navigate it in 3D, browse the model tree, inspect element properties, hide/isolate elements — 100% client-side, zero cost.

**Architecture:** Static Vite + TypeScript app. That Open's `@thatopen/components` provides the Three.js world, IFC→Fragments conversion (WebAssembly, in-browser), selection, and visibility tools. `@thatopen/ui` + `@thatopen/ui-obc` provide the BIM panels (spatial tree, properties table). Converted models are cached in IndexedDB for near-instant reload.

**Tech Stack:** Vite, TypeScript (strict), `@thatopen/components` v3.x, `@thatopen/components-front` v3.x, `@thatopen/ui` v3.x, `@thatopen/ui-obc` v3.x, `@thatopen/fragments`, `web-ifc`, `three`, `idb-keyval`, Vitest.

## Global Constraints

- **Zero cost:** no paid services, no API keys, no backend. Everything runs in the browser.
- **No model files in git:** `.ifc`/`.frag`/`.rvt` and `models/` are gitignored (public repo, client data). Never weaken this.
- **Version alignment:** `web-ifc` and `three` versions MUST match what `@thatopen/components` expects — check `node_modules/@thatopen/components/package.json` `peerDependencies` after install and pin accordingly. Mismatches cause silent rendering/parsing failures.
- **API drift note:** Code snippets below were verified against docs.thatopen.com (v3, July 2026). If a call fails at runtime, check the matching tutorial at docs.thatopen.com before improvising — the v2→v3 API changed a lot and most online examples are outdated v2.
- Commit messages end with the Co-Authored-By/Claude-Session trailer configured for this session.

---

### Task 1: Vite scaffold with an empty 3D world

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts` (via scaffold), `index.html`, `src/main.ts`, `src/core/viewer.ts`, `src/style.css`

**Interfaces:**
- Produces: `createViewer(container: HTMLElement): Viewer` in `src/core/viewer.ts` where `Viewer = { components: OBC.Components; world: OBC.World<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBC.SimpleRenderer> }`. All later tasks receive this `Viewer` object.

- [ ] **Step 1: Scaffold the project**

```bash
cd /home/sonu/projects/BIM-App
npm create vite@latest . -- --template vanilla-ts
```

(Answer "Ignore files and continue" if prompted about the non-empty directory — it must not delete `docs/`, `CLAUDE.md`, `.gitignore`, `.git/`.) Then delete the demo files: `src/counter.ts`, `src/typescript.svg`, `public/vite.svg`.

- [ ] **Step 2: Install dependencies**

```bash
npm install
npm install @thatopen/components @thatopen/components-front @thatopen/ui @thatopen/ui-obc @thatopen/fragments web-ifc three idb-keyval
npm install -D vitest @types/three
```

Then check version alignment:

```bash
node -e "console.log(require('@thatopen/components/package.json').peerDependencies)"
npm ls three web-ifc
```

If `npm ls` shows a version conflict or duplicate, pin `three` and `web-ifc` in `package.json` to the peer-dependency versions and re-run `npm install`.

- [ ] **Step 3: Add test script to package.json**

In `package.json` `"scripts"`, add: `"test": "vitest run"`.

- [ ] **Step 4: Write index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BIM Viewer</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Write src/style.css**

```css
html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
  font-family: system-ui, sans-serif;
}

#app {
  height: 100%;
}
```

- [ ] **Step 6: Write src/core/viewer.ts**

```typescript
import * as OBC from "@thatopen/components";

export interface Viewer {
  components: OBC.Components;
  world: OBC.World<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBC.SimpleRenderer
  >;
}

export function createViewer(container: HTMLElement): Viewer {
  const components = new OBC.Components();
  const worlds = components.get(OBC.Worlds);
  const world = worlds.create<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBC.SimpleRenderer
  >();

  world.scene = new OBC.SimpleScene(components);
  world.scene.setup();
  world.scene.three.background = null;

  world.renderer = new OBC.SimpleRenderer(components, container);
  world.camera = new OBC.OrthoPerspectiveCamera(components);

  components.init();
  components.get(OBC.Grids).create(world);

  return { components, world };
}
```

- [ ] **Step 7: Write src/main.ts (temporary wiring, replaced in Task 4)**

```typescript
import "./style.css";
import { createViewer } from "./core/viewer";

const container = document.getElementById("app")!;
createViewer(container);
```

- [ ] **Step 8: Verify in browser**

Run: `npm run dev` — open the printed URL. Expected: a full-screen empty 3D scene with a grid; orbit (left-drag), pan (right-drag), zoom (wheel) all work. No console errors.

- [ ] **Step 9: Verify tests run**

Run: `npm test` — Expected: passes with "no test files found" (or 0 tests). Confirms Vitest is wired.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: Vite scaffold with empty 3D world (grid, orbit camera)"
```

---

### Task 2: IFC validation and fragments cache utilities (TDD)

**Files:**
- Create: `src/core/validate.ts`, `src/core/validate.test.ts`, `src/core/cache.ts`, `src/core/cache.test.ts`

**Interfaces:**
- Produces:
  - `isProbablyIfc(buffer: Uint8Array): boolean` — header sniff, no full parse
  - `cacheKey(file: { name: string; size: number; lastModified: number }): string`
  - `getCachedFragments(key: string): Promise<ArrayBuffer | undefined>`
  - `putCachedFragments(key: string, buffer: ArrayBuffer): Promise<void>`

- [ ] **Step 1: Write failing tests for validate**

`src/core/validate.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isProbablyIfc } from "./validate";

const encode = (text: string) => new TextEncoder().encode(text);

describe("isProbablyIfc", () => {
  it("accepts a STEP/IFC header", () => {
    const buffer = encode(
      `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\n`,
    );
    expect(isProbablyIfc(buffer)).toBe(true);
  });

  it("accepts a header preceded by a BOM/whitespace", () => {
    const buffer = encode(`﻿  \nISO-10303-21;\nHEADER;\n`);
    expect(isProbablyIfc(buffer)).toBe(true);
  });

  it("rejects a non-IFC file (e.g. a Revit .rvt binary)", () => {
    const buffer = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
    expect(isProbablyIfc(buffer)).toBe(false);
  });

  it("rejects an empty buffer", () => {
    expect(isProbablyIfc(new Uint8Array(0))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/validate.test.ts`
Expected: FAIL — `validate.ts` does not exist.

- [ ] **Step 3: Implement validate.ts**

```typescript
const HEADER_TOKEN = "ISO-10303-21";
const SNIFF_BYTES = 1024;

export function isProbablyIfc(buffer: Uint8Array): boolean {
  if (buffer.length === 0) return false;
  const head = new TextDecoder("utf-8", { fatal: false }).decode(
    buffer.slice(0, SNIFF_BYTES),
  );
  return head.includes(HEADER_TOKEN);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/validate.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Write failing test for cacheKey**

`src/core/cache.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { cacheKey } from "./cache";

describe("cacheKey", () => {
  it("combines name, size and lastModified", () => {
    const key = cacheKey({ name: "office.ifc", size: 1234, lastModified: 99 });
    expect(key).toBe("office.ifc|1234|99");
  });

  it("differs when the file content changes (size/mtime)", () => {
    const a = cacheKey({ name: "office.ifc", size: 1234, lastModified: 99 });
    const b = cacheKey({ name: "office.ifc", size: 1235, lastModified: 99 });
    const c = cacheKey({ name: "office.ifc", size: 1234, lastModified: 100 });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/core/cache.test.ts`
Expected: FAIL — `cache.ts` does not exist.

- [ ] **Step 7: Implement cache.ts**

```typescript
import { createStore, get, set } from "idb-keyval";

const store = createStore("bim-viewer", "fragments-cache");

export function cacheKey(file: {
  name: string;
  size: number;
  lastModified: number;
}): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export async function getCachedFragments(
  key: string,
): Promise<ArrayBuffer | undefined> {
  return get<ArrayBuffer>(key, store);
}

export async function putCachedFragments(
  key: string,
  buffer: ArrayBuffer,
): Promise<void> {
  await set(key, buffer, store);
}
```

Note: only `cacheKey` is unit-tested — the IndexedDB wrappers are two-line passthroughs to `idb-keyval` and are exercised end-to-end in Task 3's browser verification. Do not add an IndexedDB mock for them.

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: 6 passed (4 validate + 2 cache).

- [ ] **Step 9: Commit**

```bash
git add src/core/validate.ts src/core/validate.test.ts src/core/cache.ts src/core/cache.test.ts
git commit -m "feat: IFC header validation and fragments cache-key utilities (TDD)"
```

---

### Task 3: Model loading pipeline (IFC → Fragments, with cache)

**Files:**
- Create: `src/core/loader.ts`
- Modify: `src/main.ts` (temporary test hook, replaced in Task 4)

**Interfaces:**
- Consumes: `Viewer` from Task 1; `isProbablyIfc`, `cacheKey`, `getCachedFragments`, `putCachedFragments` from Task 2.
- Produces:
  - `initLoading(viewer: Viewer): Promise<void>` — one-time setup of FragmentsManager worker + IfcLoader wasm
  - `loadModelFile(viewer: Viewer, file: File, onProgress?: (progress: number) => void): Promise<{ modelId: string; fromCache: boolean }>` — throws `Error` with a user-readable message on invalid files

- [ ] **Step 1: Write loader.ts**

```typescript
import * as OBC from "@thatopen/components";
import type { Viewer } from "./viewer";
import { isProbablyIfc } from "./validate";
import { cacheKey, getCachedFragments, putCachedFragments } from "./cache";

export async function initLoading(viewer: Viewer): Promise<void> {
  const { components, world } = viewer;

  const workerUrl = await OBC.FragmentsManager.getWorker();
  const fragments = components.get(OBC.FragmentsManager);
  fragments.init(workerUrl);

  world.camera.controls.addEventListener("update", () =>
    fragments.core.update(),
  );

  fragments.list.onItemSet.add(({ value: model }) => {
    model.useCamera(world.camera.three);
    world.scene.three.add(model.object);
    fragments.core.update(true);
  });

  const ifcLoader = components.get(OBC.IfcLoader);
  await ifcLoader.setup({ autoSetWasm: true });
}

export async function loadModelFile(
  viewer: Viewer,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<{ modelId: string; fromCache: boolean }> {
  const { components } = viewer;
  const fragments = components.get(OBC.FragmentsManager);
  const modelId = file.name.replace(/\.[^.]+$/, "");

  if (fragments.list.has(modelId)) {
    throw new Error(`"${file.name}" is already loaded.`);
  }

  const key = cacheKey(file);
  const cached = await getCachedFragments(key);
  if (cached) {
    await fragments.core.load(cached, { modelId });
    return { modelId, fromCache: true };
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  if (!isProbablyIfc(buffer)) {
    throw new Error(
      `"${file.name}" couldn't be read as an IFC file. Export it from Revit via File → Export → IFC and try again.`,
    );
  }

  const ifcLoader = components.get(OBC.IfcLoader);
  await ifcLoader.load(buffer, false, modelId, {
    processData: { progressCallback: onProgress },
  });

  const model = fragments.list.get(modelId);
  if (model) {
    const fragBuffer = await model.getBuffer(false);
    await putCachedFragments(key, fragBuffer);
  }

  return { modelId, fromCache: false };
}
```

API-drift check: `fragments.core.load(buffer, { modelId })` and `model.getBuffer(false)` come from the v3 FragmentsManager/IfcLoader tutorials. If either fails, consult docs.thatopen.com/Tutorials/Components/Core/FragmentsManager.

- [ ] **Step 2: Download a sample IFC for manual testing**

```bash
mkdir -p models
curl -L -o models/small.ifc https://thatopen.github.io/engine_components/resources/small.ifc
```

(`models/` is gitignored — the file stays local.)

- [ ] **Step 3: Add temporary file-picker to main.ts**

```typescript
import "./style.css";
import { createViewer } from "./core/viewer";
import { initLoading, loadModelFile } from "./core/loader";

const container = document.getElementById("app")!;
const viewer = createViewer(container);

const input = document.createElement("input");
input.type = "file";
input.accept = ".ifc";
input.style.cssText = "position:absolute;top:8px;left:8px;z-index:10;";
document.body.append(input);

initLoading(viewer).then(() => {
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const result = await loadModelFile(viewer, file, (p) =>
      console.log("progress", p),
    );
    console.log("loaded", result);
  };
});
```

- [ ] **Step 4: Verify in browser (conversion path)**

Run `npm run dev`, pick `models/small.ifc`. Expected: progress logs in console, then the model appears in 3D; final log `loaded { modelId: "small", fromCache: false }`.

- [ ] **Step 5: Verify cache path**

Reload the page, pick the same file. Expected: model appears noticeably faster, log shows `fromCache: true`.

- [ ] **Step 6: Verify rejection path**

Pick any non-IFC file (rename something to `.ifc`). Expected: console error with the "couldn't be read as an IFC file" message; app keeps working.

- [ ] **Step 7: Run tests**

Run: `npm test` — Expected: 6 passed (no regressions).

- [ ] **Step 8: Commit**

```bash
git add src/core/loader.ts src/main.ts
git commit -m "feat: IFC loading pipeline with in-browser conversion and IndexedDB cache"
```

---

### Task 4: App layout, toolbar, drag & drop, and status messages

**Files:**
- Create: `src/ui/layout.ts`, `src/ui/toolbar.ts`, `src/ui/status.ts`, `src/features/dropzone.ts`
- Modify: `src/main.ts` (final shape), `src/style.css`

**Interfaces:**
- Consumes: `Viewer`, `initLoading`, `loadModelFile`.
- Produces:
  - `createLayout(root: HTMLElement): { viewport: HTMLElement; setLeftPanel(el: HTMLElement): void; setRightPanel(el: HTMLElement): void; setToolbar(el: HTMLElement): void }` in `layout.ts`
  - `createToolbar(handlers: ToolbarHandlers): HTMLElement` where `ToolbarHandlers = { onOpenFile(file: File): void; onFit(): void; onHide(): void; onIsolate(): void; onShowAll(): void }` — Fit/Hide/Isolate/ShowAll are wired to no-ops in this task and connected in Task 7
  - `showStatus(message: string, kind: "info" | "error"): void` and `showProgress(label: string, fraction: number | null): void` in `status.ts`
  - `enableDropzone(target: HTMLElement, onFiles: (files: File[]) => void): void` in `dropzone.ts`

- [ ] **Step 1: Write src/ui/status.ts**

```typescript
let statusEl: HTMLDivElement | null = null;
let hideTimer: number | undefined;

function ensureEl(): HTMLDivElement {
  if (!statusEl) {
    statusEl = document.createElement("div");
    statusEl.className = "status-toast";
    document.body.append(statusEl);
  }
  return statusEl;
}

export function showStatus(message: string, kind: "info" | "error"): void {
  const el = ensureEl();
  el.textContent = message;
  el.dataset.kind = kind;
  el.style.display = "block";
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(
    () => {
      el.style.display = "none";
    },
    kind === "error" ? 8000 : 4000,
  );
}

export function showProgress(label: string, fraction: number | null): void {
  const el = ensureEl();
  window.clearTimeout(hideTimer);
  if (fraction === null) {
    el.style.display = "none";
    return;
  }
  el.dataset.kind = "info";
  el.style.display = "block";
  el.textContent = `${label} ${Math.round(fraction * 100)}%`;
}
```

- [ ] **Step 2: Add toast styles to src/style.css**

```css
.status-toast {
  display: none;
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  background: #2b2b2b;
  color: #fff;
  font-size: 0.875rem;
  max-width: 80vw;
}

.status-toast[data-kind="error"] {
  background: #8b1e1e;
}

.dropzone-active::after {
  content: "Drop IFC file to load";
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(30, 90, 160, 0.35);
  color: #fff;
  font-size: 1.5rem;
  pointer-events: none;
  z-index: 50;
}
```

- [ ] **Step 3: Write src/features/dropzone.ts**

```typescript
export function enableDropzone(
  target: HTMLElement,
  onFiles: (files: File[]) => void,
): void {
  target.style.position = "relative";

  target.addEventListener("dragover", (event) => {
    event.preventDefault();
    target.classList.add("dropzone-active");
  });

  target.addEventListener("dragleave", () => {
    target.classList.remove("dropzone-active");
  });

  target.addEventListener("drop", (event) => {
    event.preventDefault();
    target.classList.remove("dropzone-active");
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) onFiles(files);
  });
}
```

- [ ] **Step 4: Write src/ui/toolbar.ts**

```typescript
import * as BUI from "@thatopen/ui";

export interface ToolbarHandlers {
  onOpenFile(file: File): void;
  onFit(): void;
  onHide(): void;
  onIsolate(): void;
  onShowAll(): void;
}

export function createToolbar(handlers: ToolbarHandlers): HTMLElement {
  const openFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ifc";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) handlers.onOpenFile(file);
    };
    input.click();
  };

  return BUI.Component.create(() => {
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
      </bim-toolbar>
    `;
  });
}
```

- [ ] **Step 5: Write src/ui/layout.ts**

```typescript
import * as BUI from "@thatopen/ui";

export interface Layout {
  viewport: HTMLElement;
  setLeftPanel(el: HTMLElement): void;
  setRightPanel(el: HTMLElement): void;
  setToolbar(el: HTMLElement): void;
}

export function createLayout(root: HTMLElement): Layout {
  const grid = document.createElement("bim-grid") as BUI.Grid;

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
```

Note: `bim-viewport` is That Open's canvas host element; the `Viewer` is created with it as container (see Step 6).

- [ ] **Step 6: Rewrite src/main.ts (final structure)**

The order matters: `BUI.Manager.init()` first, then the layout creates the viewport element, then the viewer renders into it.

```typescript
import "./style.css";
import * as BUI from "@thatopen/ui";
import { createViewer } from "./core/viewer";
import { initLoading, loadModelFile } from "./core/loader";
import { createLayout } from "./ui/layout";
import { createToolbar, type ToolbarHandlers } from "./ui/toolbar";
import { showProgress, showStatus } from "./ui/status";
import { enableDropzone } from "./features/dropzone";

async function main() {
  BUI.Manager.init();

  const app = document.getElementById("app")!;
  const layout = createLayout(app);

  const viewer = createViewer(layout.viewport);
  await initLoading(viewer);

  const openFile = async (file: File) => {
    try {
      showProgress(`Converting ${file.name}…`, 0);
      const result = await loadModelFile(viewer, file, (p) =>
        showProgress(`Converting ${file.name}…`, p),
      );
      showProgress("", null);
      showStatus(
        result.fromCache
          ? `${file.name} loaded from cache.`
          : `${file.name} converted and loaded.`,
        "info",
      );
    } catch (error) {
      showProgress("", null);
      showStatus(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const handlers: ToolbarHandlers = {
    onOpenFile: openFile,
    onFit: () => {},
    onHide: () => {},
    onIsolate: () => {},
    onShowAll: () => {},
  };
  layout.setToolbar(createToolbar(handlers));

  enableDropzone(layout.viewport, (files) => {
    for (const file of files) void openFile(file);
  });
}

main();
```

- [ ] **Step 7: Verify in browser**

Run `npm run dev`. Expected:
- Toolbar on top, empty left/right panels, 3D viewport center
- "Open IFC" button loads `models/small.ifc` with a visible progress toast, then a success toast
- Dragging the file onto the viewport shows the blue overlay and loads it
- Loading the same file twice shows the "already loaded" error toast, app unaffected
- A renamed non-IFC file shows the readable error toast

- [ ] **Step 8: Run tests, commit**

Run: `npm test` — Expected: 6 passed.

```bash
git add -A
git commit -m "feat: app layout with toolbar, drag-and-drop loading, and status toasts"
```

---

### Task 5: Model tree panel (spatial structure)

**Files:**
- Create: `src/ui/panels/tree.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Viewer`, `Layout.setLeftPanel`.
- Produces: `createTreePanel(viewer: Viewer): HTMLElement` — self-updating: subscribes to FragmentsManager model list internally.

- [ ] **Step 1: Write src/ui/panels/tree.ts**

```typescript
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as BUIC from "@thatopen/ui-obc";
import type { Viewer } from "../../core/viewer";

export function createTreePanel(viewer: Viewer): HTMLElement {
  const { components } = viewer;
  const fragments = components.get(OBC.FragmentsManager);

  const [spatialTree, updateSpatialTree] = BUIC.tables.spatialTree({
    components,
    models: [],
  });
  spatialTree.preserveStructureOnFilter = true;

  const refresh = () => {
    updateSpatialTree({ models: [...fragments.list.values()] });
  };
  fragments.list.onItemSet.add(refresh);
  fragments.list.onItemDeleted.add(refresh);

  const onSearch = (e: Event) => {
    const input = e.target as BUI.TextInput;
    spatialTree.queryString = input.value;
  };

  return BUI.Component.create(() => {
    return BUI.html`
      <bim-panel label="Model">
        <bim-panel-section label="Spatial tree">
          <bim-text-input @input=${onSearch} placeholder="Search…"
            debounce="200"></bim-text-input>
          ${spatialTree}
        </bim-panel-section>
      </bim-panel>
    `;
  });
}
```

API-drift check: the `spatialTree` factory and its update function come from docs.thatopen.com/Tutorials/UserInterface/OBC/SpatialTree. If `updateSpatialTree({ models })` isn't the correct update signature, that tutorial page shows the current one. If `onItemDeleted` doesn't exist on the list, drop that line (models aren't deletable in Phase 1 anyway).

- [ ] **Step 2: Wire into main.ts**

In `main()`, after `layout.setToolbar(...)`:

```typescript
layout.setLeftPanel(createTreePanel(viewer));
```

with import `import { createTreePanel } from "./ui/panels/tree";`.

- [ ] **Step 3: Verify in browser**

Load `models/small.ifc`. Expected: left panel shows Project → Site → Building → Storey hierarchy with element categories beneath; clicking rows highlights the corresponding elements in 3D (built into the component); search box filters the tree; checkboxes toggle visibility of branches.

- [ ] **Step 4: Run tests, commit**

Run: `npm test` — Expected: 6 passed.

```bash
git add src/ui/panels/tree.ts src/main.ts
git commit -m "feat: model tree panel with spatial structure and search"
```

---

### Task 6: Selection and properties panel

**Files:**
- Create: `src/features/selection.ts`, `src/ui/panels/properties.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Viewer`, `Layout.setRightPanel`.
- Produces:
  - `setupSelection(viewer: Viewer): void` in `selection.ts` — enables click-to-select with highlight; must be called once after `initLoading`
  - `createPropertiesPanel(viewer: Viewer): HTMLElement` — subscribes to Highlighter events internally
  - Later tasks read the current selection via `components.get(OBF.Highlighter).selection.select` (a `OBC.ModelIdMap`)

- [ ] **Step 1: Write src/features/selection.ts**

```typescript
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as THREE from "three";
import type { Viewer } from "../core/viewer";

export function setupSelection(viewer: Viewer): void {
  const { components, world } = viewer;

  components.get(OBC.Raycasters).get(world);

  const highlighter = components.get(OBF.Highlighter);
  highlighter.setup({
    world,
    selectMaterialDefinition: {
      color: new THREE.Color("#bcf124"),
      opacity: 1,
      transparent: false,
      renderedFaces: 0,
    },
  });
}
```

- [ ] **Step 2: Write src/ui/panels/properties.ts**

```typescript
import * as BUI from "@thatopen/ui";
import * as BUIC from "@thatopen/ui-obc";
import * as OBF from "@thatopen/components-front";
import type { Viewer } from "../../core/viewer";

export function createPropertiesPanel(viewer: Viewer): HTMLElement {
  const { components } = viewer;

  const [propertiesTable, updatePropertiesTable] = BUIC.tables.itemsData({
    components,
    modelIdMap: {},
  });
  propertiesTable.preserveStructureOnFilter = true;
  propertiesTable.indentationInText = false;

  const highlighter = components.get(OBF.Highlighter);
  highlighter.events.select.onHighlight.add((modelIdMap) => {
    updatePropertiesTable({ modelIdMap });
  });
  highlighter.events.select.onClear.add(() => {
    updatePropertiesTable({ modelIdMap: {} });
  });

  const onSearch = (e: Event) => {
    const input = e.target as BUI.TextInput;
    propertiesTable.queryString = input.value;
  };

  return BUI.Component.create(() => {
    return BUI.html`
      <bim-panel label="Properties">
        <bim-panel-section label="Element data">
          <bim-text-input @input=${onSearch} placeholder="Search…"
            debounce="200"></bim-text-input>
          ${propertiesTable}
        </bim-panel-section>
      </bim-panel>
    `;
  });
}
```

- [ ] **Step 3: Wire into main.ts**

In `main()`, after `initLoading`:

```typescript
setupSelection(viewer);
layout.setRightPanel(createPropertiesPanel(viewer));
```

with imports for both. **Order:** `setupSelection` must run before `createPropertiesPanel` (the panel assumes the Highlighter is configured).

- [ ] **Step 4: Verify in browser**

Load the sample model. Expected: hovering does nothing special; clicking a wall highlights it green and the right panel fills with its attributes and property sets (Name, GlobalId, type, Pset_* groups); clicking empty space clears both; search filters the property rows.

- [ ] **Step 5: Run tests, commit**

Run: `npm test` — Expected: 6 passed.

```bash
git add src/features/selection.ts src/ui/panels/properties.ts src/main.ts
git commit -m "feat: click-to-select with highlight and element properties panel"
```

---

### Task 7: Hide / isolate / show-all and fit-to-view

**Files:**
- Create: `src/features/visibility.ts`, `src/features/camera.ts`
- Modify: `src/main.ts` (replace the four no-op toolbar handlers)

**Interfaces:**
- Consumes: `Viewer`; Highlighter selection from Task 6; toolbar handler slots from Task 4.
- Produces:
  - `hideSelected(viewer: Viewer): Promise<void>`, `isolateSelected(viewer: Viewer): Promise<void>`, `showAll(viewer: Viewer): Promise<void>` in `visibility.ts`
  - `fitToView(viewer: Viewer): Promise<void>` in `camera.ts`

- [ ] **Step 1: Write src/features/visibility.ts**

```typescript
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import type { Viewer } from "../core/viewer";

function currentSelection(viewer: Viewer): OBC.ModelIdMap | null {
  const highlighter = viewer.components.get(OBF.Highlighter);
  const selection = highlighter.selection.select;
  if (!selection || Object.keys(selection).length === 0) return null;
  return selection;
}

export async function hideSelected(viewer: Viewer): Promise<void> {
  const selection = currentSelection(viewer);
  if (!selection) return;
  const hider = viewer.components.get(OBC.Hider);
  await hider.set(false, selection);
  await viewer.components.get(OBF.Highlighter).clear("select");
}

export async function isolateSelected(viewer: Viewer): Promise<void> {
  const selection = currentSelection(viewer);
  if (!selection) return;
  const hider = viewer.components.get(OBC.Hider);
  await hider.isolate(selection);
}

export async function showAll(viewer: Viewer): Promise<void> {
  const hider = viewer.components.get(OBC.Hider);
  await hider.set(true);
}
```

API-drift check: `highlighter.selection.select` as a `ModelIdMap` and `hider.set`/`hider.isolate` are the v3 shapes (Hider tutorial). If `selection.select` is undefined, check the Highlighter tutorial for the current selection accessor.

- [ ] **Step 2: Write src/features/camera.ts**

```typescript
import * as OBC from "@thatopen/components";
import * as THREE from "three";
import type { Viewer } from "../core/viewer";

export async function fitToView(viewer: Viewer): Promise<void> {
  const { components, world } = viewer;
  const fragments = components.get(OBC.FragmentsManager);

  const box = new THREE.Box3();
  for (const [, model] of fragments.list) {
    box.expandByObject(model.object);
  }
  if (box.isEmpty()) return;

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  await world.camera.controls.fitToSphere(sphere, true);
}
```

Fallback if the box comes out empty/degenerate on real models (fragments meshes can be lazily built): use That Open's `OBC.BoundingBoxer` component instead — `docs.thatopen.com/Tutorials/Components/Core/BoundingBoxer` has the v3 usage.

- [ ] **Step 3: Wire real handlers in main.ts**

Replace the four no-ops:

```typescript
const handlers: ToolbarHandlers = {
  onOpenFile: openFile,
  onFit: () => void fitToView(viewer),
  onHide: () => void hideSelected(viewer),
  onIsolate: () => void isolateSelected(viewer),
  onShowAll: () => void showAll(viewer),
};
```

with imports from `./features/visibility` and `./features/camera`.

- [ ] **Step 4: Verify in browser**

Load the sample model. Expected:
- Select a wall → **Hide** removes it (selection also clears); **Show all** brings it back
- Select a door → **Isolate** hides everything else; **Show all** restores
- **Fit** frames the whole model from any camera position
- With nothing selected, Hide/Isolate do nothing (no errors)

- [ ] **Step 5: Run tests, commit**

Run: `npm test` — Expected: 6 passed.

```bash
git add src/features/visibility.ts src/features/camera.ts src/main.ts
git commit -m "feat: hide/isolate/show-all and fit-to-view toolbar actions"
```

---

### Task 8: Production build, README, and acceptance test

**Files:**
- Create: `README.md`
- Modify: `CLAUDE.md` (project state + commands)

**Interfaces:**
- Consumes: everything above.
- Produces: a verified production build and user-facing docs.

- [ ] **Step 1: Verify production build**

```bash
npm run build
npm run preview
```

Open the preview URL and load `models/small.ifc`. Expected: identical behavior to dev (this catches wasm/worker asset issues that only appear in production builds). If the worker or wasm fails to load in preview, check that `autoSetWasm`/`getWorker` fetch from CDN (they do by default — network tab shows unpkg/thatopen URLs).

- [ ] **Step 2: Write README.md**

```markdown
# BIM Viewer

A free, browser-based BIM model viewer built on
[That Open Company](https://thatopen.com/)'s open source libraries.
Everything runs client-side — your models never leave your computer.

## Using it

1. `npm install && npm run dev`, then open the printed URL
2. Export your model from Revit: **File → Export → IFC**
3. Drag the `.ifc` file onto the viewer (or use **Open IFC**)

First load converts the model in your browser (progress shown); after
that it reopens near-instantly from the local cache.

**Features:** 3D navigation (orbit/pan/zoom), model tree with search,
element properties on click, hide / isolate / show all, fit to view.

## Commands

- `npm run dev` — run locally
- `npm test` — run unit tests
- `npm run build` — production build (static, deployable anywhere)

## Stack

Vite + TypeScript, `@thatopen/components`, `@thatopen/ui`, `web-ifc`,
Three.js. See `docs/superpowers/specs/` for the design document.
```

- [ ] **Step 3: Update CLAUDE.md**

Replace the "Project state" section body with:

```markdown
Phase 1 (core viewer) implemented. Design spec:
`docs/superpowers/specs/2026-07-02-bim-viewer-design.md`. Plan:
`docs/superpowers/plans/2026-07-02-phase1-core-viewer.md`.

## Commands

- `npm run dev` — dev server
- `npm test` — Vitest unit tests (pure logic only; rendering is verified in-browser)
- `npm run build && npm run preview` — production build check

Test model: `models/small.ifc` (gitignored; re-download from
https://thatopen.github.io/engine_components/resources/small.ifc if missing).
```

Also update the "Planned structure" line in CLAUDE.md to "Structure" (it now exists).

- [ ] **Step 4: Full acceptance run**

Run through the spec's success criteria end-to-end with a real Revit-exported IFC (owner-provided) if available, else the sample: load → navigate → tree → properties → hide/isolate → fit. All console-error-free.

- [ ] **Step 5: Run tests, commit, push**

```bash
npm test
git add -A
git commit -m "docs: README and production build verification for Phase 1"
git push
```

---

## Self-review notes

- **Spec coverage:** drag & drop + picker (T3/T4), 3D navigation + fit (T1/T7), model tree with search + show/hide checkboxes (T5), properties on click (T6), hide/isolate (T7), fragments cache fast-reload (T2/T3), invalid-file and duplicate-load error handling with readable messages (T3/T4), progress indicator (T4), Vitest for data logic (T2), acceptance run (T8). Standard named views (top/front) were listed as a "nice" in the spec's navigation row — deferred to Phase 2 alongside floor plans, where OrthoPerspectiveCamera projection modes belong together. Large-model browser warning (spec §4) is covered by the progress toast; a size-threshold warning is a Phase 2 nicety.
- **Type consistency:** `Viewer` produced in T1 is the sole shared state; `ToolbarHandlers` defined in T4 and consumed in T7; selection flows only through `OBF.Highlighter`.
- **Known API risks** are flagged inline at each usage with the doc page to consult (spatialTree update signature, `fragments.core.load`, `selection.select`, bounding box).
