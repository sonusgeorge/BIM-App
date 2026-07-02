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
