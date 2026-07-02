# BIM Viewer App — Design Document

**Date:** 2026-07-02
**Status:** Draft — awaiting approval
**Owner:** Sonu (requirements) / Claude (implementation)

## 1. What we're building and why

A **browser-based BIM model viewer** for exploring building models. The goal is to
learn the open source BIM ecosystem by building a real, useful app — starting simple
and growing it based on requirements.

**Workflow:** Export your Revit models to IFC (Revit: *File → Export → IFC* — built
in, free). Drag the IFC file into the app in your browser. Everything runs locally on
your machine; no server, no accounts, no cost.

**Cost constraint:** Zero. All libraries are free open source (MIT/MPL licensed).
Development is local. Future online hosting uses free static hosting (GitHub Pages
or Netlify).

## 2. Features, in phases

### Phase 1 — Core viewer (built first, useful on its own)

| Feature | What it means |
|---|---|
| Open IFC file | Drag & drop (or file picker). The app converts it in the browser to the fast "Fragments" format. |
| 3D navigation | Orbit, pan, zoom with the mouse. Buttons for standard views (top, front, etc.) and "fit to view". |
| Model tree | A panel listing the project structure: Site → Building → Storey → elements (walls, doors, slabs…). Click to select, checkboxes to hide/show groups. |
| Properties panel | Click any element in 3D and see all its BIM data: type, material, dimensions, and the Revit parameters that survived IFC export. |
| Hide / isolate | Hide selected elements, or isolate them (hide everything else). One click to show all again. |
| Fast reload | After the first conversion, the compact Fragments version is cached, so reopening the same model is near-instant. |

### Phase 2 — BIM data tools (order decided by your requirements)

- **Section planes** — cut the building open along any plane to look inside
- **Measurements** — distances and areas in the 3D view
- **Floor plans** — 2D plan view generated per storey
- **Search & filter** — e.g. "show only doors on Level 2"
- **Quantity summaries** — counts, areas, volumes grouped by element type

### Phase 3 — Going online (later, still free)

- Deploy to a free public URL (GitHub Pages / Netlify)
- Optional: a model library and shareable links (would need a lightweight backend —
  decided only when we get there)

## 3. How it's built (architecture)

**Stack:** Vite + TypeScript + That Open Company's open source libraries:

- **`web-ifc`** — reads IFC files at native speed (WebAssembly), entirely in the browser
- **`@thatopen/fragments`** — the compact model format; a 2 GB IFC can become ~80 MB
  and render smoothly
- **`@thatopen/components`** — the BIM toolkit (viewer, camera, selection ("highlighter"),
  clipping planes, measurements, floor plans) built on Three.js
- **`@thatopen/ui`** — ready-made UI panels/buttons designed for BIM apps

**Architecture: 100% client-side.** The app is a static web page. Your model files
never leave your computer — the browser does all parsing and rendering. This is why
it costs nothing and why putting it online later is trivial (any static host serves it).

**App structure (kept modular so features can grow independently):**

```
src/
  core/        — viewer setup: scene, camera, renderer, model loading
  features/    — one folder per feature (model-tree, properties, isolate, …)
  ui/          — layout and panels
  main.ts      — wires everything together
```

**UI layout:** 3D view fills the screen; collapsible left panel (model tree),
collapsible right panel (properties), toolbar on top (open file, fit view, hide/isolate,
and later: sections, measure, plans).

## 4. Error handling

- Invalid or corrupt IFC file → clear message ("This file couldn't be read as IFC"),
  app stays usable
- Very large model → progress indicator during conversion; warning if the browser is
  likely to struggle
- Old IFC versions (IFC2x3 and IFC4 both supported by web-ifc; anything else gets a
  clear "unsupported version" message)

## 5. Testing

- Automated tests for the data logic (model tree building, property extraction,
  quantity math) using Vitest
- Rendering/interaction verified against sample IFC models (free public ones) plus
  your Revit exports — each feature is demonstrated working in the browser before
  it's called done
- You are the acceptance tester: each phase ends with "open it and try it" using
  your own models

## 6. Out of scope (for now)

- Editing/authoring models (That Open's modeling engine is early-stage; revisit later)
- Reading .rvt files directly (proprietary — not possible with open source; IFC export
  is the standard route). Investigated 2026-07-02: the only path is Autodesk Platform
  Services cloud conversion, which is paid and needs a backend — revisit only if the
  zero-cost constraint is ever relaxed. A free Revit batch-export script is a cheaper
  future convenience.
- Multi-user collaboration, accounts, clash detection — possible later phases

## 7. Success criteria

Phase 1 is done when: you drag one of your Revit-exported IFC files into the app,
navigate it smoothly in 3D, browse the model tree, click elements to read their
properties, and hide/isolate parts — all on your machine, at zero cost.
