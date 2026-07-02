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
