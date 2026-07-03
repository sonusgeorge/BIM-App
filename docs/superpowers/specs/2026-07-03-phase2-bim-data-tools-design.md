# BIM Viewer Phase 2 — BIM Data Tools — Design Document

**Date:** 2026-07-03
**Status:** Approved by owner (2026-07-03)
**Owner:** Sonu (requirements) / Claude (implementation)
**Parent spec:** `2026-07-02-bim-viewer-design.md`

## 1. What we're building and why

Phase 2 adds the five BIM data tools from the parent spec to the working Phase 1
viewer: **section planes, measurements, floor plans, search & filter, and
quantity summaries**. All five are built in this phase (owner's decision).

Decisions made with the owner:

- **Scope:** all five tools in one phase.
- **Units:** display in the model's own units (whatever the IFC was exported
  with — e.g. feet/sq ft for the Snowdon Towers sample). No conversion, no
  toggle.
- **Quantities export:** yes — a Download CSV button (opens directly in Excel).
- **Approach:** wire up That Open's built-in components wherever they exist;
  custom code only for quantity aggregation and CSV. If a specific built-in
  proves inadequate, swap just that piece.

The zero-cost constraint is unchanged: 100% client-side, no backend, no paid
services.

## 2. Feature behavior (what the user sees)

### Section planes

- A **Section** toggle button in the toolbar. While active, double-clicking any
  surface creates a cutting plane at that spot, oriented to the surface.
- The plane renders with a drag control; dragging slides the cut through the
  building. Cut faces show outline edges (technical-drawing look).
- Multiple simultaneous planes are allowed. Individual planes can be deleted;
  a "clear sections" action removes all. Esc exits section mode.

### Measurements

- **Distance**: toolbar button; click two points in the 3D view; a dimension
  line with the length label (model units) stays visible.
- **Area**: toolbar button; click the corner points of a region on a face and
  finish (double-click); the area label stays visible.
- Measurements persist until cleared ("clear measurements" action). Esc cancels
  the in-progress measurement and exits the tool. Only one measurement tool is
  active at a time (activating one deactivates the other and section mode).

### Floor plans

- The left panel becomes tabbed: **Model** (existing spatial tree) and
  **Floor plans**.
- The Floor plans tab lists one entry per building storey, read from the
  model's levels.
- Clicking a storey switches to a top-down 2D-style view of that storey: camera
  goes plan-orthographic, geometry above the storey's cut height is clipped.
- An **Exit plan** button restores the previous 3D view and removes the clip.
- Loading a second model refreshes the storey list (entries grouped per model).

### Search & filter

- Above the model tree: a free-text search box plus two dropdown filters —
  **Category** (Walls, Doors, Windows, Slabs, … from the model's element
  categories) and **Storey** (from the model's levels).
- Matching elements are highlighted in the 3D view and counted ("34 elements
  match").
- Buttons: **Isolate** (hide everything else — reuses the existing visibility
  feature), **Clear** (remove highlight/filters, show all).
- Filters combine with AND: category Doors + storey Level 2 = doors on Level 2.

### Quantity summaries

- The right panel becomes tabbed: **Properties** (existing) and **Quantities**.
- The Quantities tab shows a table grouped by element category (and type within
  category): columns **Count**, **Area**, **Volume**, in the model's units with
  unit labels in the column headers.
- Values come from the IFC quantity sets Revit exports (e.g. NetArea,
  NetVolume). Elements without a value contribute "—"; a footnote states how
  many elements lacked quantity data.
- **Download CSV** button saves the table as a `.csv` (UTF-8, comma-separated)
  named after the model.

## 3. How it's built (architecture)

Built-in components (verified present in the installed v3 libraries):

| Feature | Library pieces |
|---|---|
| Sections | `OBC.Clipper` + `OBF.ClipEdges` (outline edges) |
| Measurements | `OBF.LengthMeasurement`, `OBF.AreaMeasurement` |
| Floor plans | `OBC.Views` / plan mode + `OBC.Classifier` (storeys) |
| Search & filter | `OBC.ItemsFinder` / `FinderQuery` + `OBC.Hider`, existing `Highlighter` |
| Quantities | Custom aggregation over fragments item data + `OBC.Classifier` grouping |

> **API drift note (same as Phase 1):** verify each call against
> docs.thatopen.com v3 tutorials during planning/implementation; v2 examples
> online are misleading.

**Structure** (follows the existing one-folder-per-feature pattern):

```
src/features/
  sections/       — clipper wiring, toolbar state
  measurements/   — length/area tools, clear/cancel handling
  floorplans/     — storey list, plan enter/exit
  finder/         — search + filters, highlight/isolate actions
  quantities/     — aggregation (pure logic separated for tests), CSV export
src/ui/
  layout.ts       — grows tabbed left/right panels
  toolbar.ts      — grows Section / Measure buttons
```

Pure logic (quantity aggregation, CSV formatting, search query building, unit
labels) lives in plain functions with no Three.js/DOM dependencies so Vitest
can cover it.

**Tool exclusivity:** a small "active tool" coordinator ensures section mode,
distance, and area measurement are mutually exclusive and Esc always returns to
plain navigation. Selection/hide/isolate from Phase 1 keep working regardless.

**Units:** IFC files declare their units; web-ifc/fragments expose model data in
those units (lengths may be normalized to meters by the converter — verify
during implementation and convert back to the declared display unit for labels
and quantity columns).

## 4. Error handling

- All five tools are disabled (greyed out) until at least one model is loaded.
- Missing quantity data → "—" cells plus a footnote count; never a crash.
- A model with no storeys → Floor plans tab shows "No floor plans available."
- Search with no matches → "0 elements match", nothing highlighted, Isolate
  disabled.
- Any tool failure surfaces as the existing status toast, consistent with
  Phase 1.

## 5. Testing

- **Vitest (automated):** quantity aggregation math, CSV escaping/formatting,
  finder query construction, unit-label mapping, storey-list building from
  classifier output (with mocked data).
- **In-browser (manual + scripted checks):** each tool demonstrated against
  the Snowdon Towers sample and at least one metric IFC before being called
  done.

## 6. Out of scope (unchanged from parent spec)

- Editing models, reading .rvt directly, multi-user features.
- Exporting floor plans as drawings (PDF/DXF) — view-only this phase.
- Angle measurement and volume measurement tools — length and area only, per
  parent spec.

## 7. Success criteria

Phase 2 is done when, with one of the owner's Revit-exported IFC models, the
owner can:

1. cut the building open with a section plane and slide it,
2. measure a wall's length and a floor's area in the model's units,
3. open a per-storey floor plan and return to 3D,
4. isolate "doors on Level 2" via search filters,
5. download a quantities CSV and open it in Excel with sensible numbers,

all client-side at zero cost, with Phase 1 features still working.
