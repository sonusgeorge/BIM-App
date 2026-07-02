# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Phase 1 (core viewer) implemented. Design spec:
`docs/superpowers/specs/2026-07-02-bim-viewer-design.md`. Plan:
`docs/superpowers/plans/2026-07-02-phase1-core-viewer.md`.

## Commands

- `npm run dev` — dev server
- `npm test` — Vitest unit tests (pure logic only; rendering is verified in-browser)
- `npm run build && npm run preview` — production build check

Test model: `models/school_str.ifc` (gitignored; re-download from
https://thatopen.github.io/engine_components/resources/ifc/school_str.ifc if missing).

## What this project is

A browser-based BIM (Building Information Modeling) viewer built on That Open
Company's open source stack:

- **Stack:** Vite + TypeScript, `web-ifc`, `@thatopen/fragments`,
  `@thatopen/components`, `@thatopen/ui` (Three.js underneath)
- **Architecture:** 100% client-side static web app. IFC files are parsed in the
  browser via WebAssembly and converted to the Fragments format; no backend, no
  accounts, no paid services. This zero-cost constraint is a hard requirement.
- **Structure:** `src/core/` (scene/camera/loading), `src/features/` (one
  folder per feature), `src/ui/` (layout/panels), `src/main.ts` (wiring)
- **Phases:** 1) core viewer (load IFC, navigate, model tree, properties,
  hide/isolate) → 2) sections, measurements, floor plans, search, quantities →
  3) free static deployment

## Working style

The repo owner does not code — they provide requirements and act as acceptance
tester; Claude implements everything. Explain BIM/web concepts in plain language
when decisions are needed. Test models are the owner's Revit models exported to
IFC (never commit model files; they may contain client data — the repo is public).
