import * as OBC from "@thatopen/components";
import type { Viewer } from "./viewer";
import { isProbablyIfc } from "./validate";
import { cacheKey, getCachedFragments, putCachedFragments } from "./cache";

const inFlight = new Set<string>();

/** Must be called exactly once to initialize loading infrastructure and event listeners. */
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
  // autoSetWasm resolves the WASM version from a stale release constant in
  // @thatopen/components, fetching a binary that mismatches the bundled
  // web-ifc glue code. Serve the matching binary ourselves instead
  // (staged into public/wasm/ by scripts/copy-wasm.mjs).
  await ifcLoader.setup({
    autoSetWasm: false,
    wasm: { path: "/wasm/", absolute: true },
  });
}

export async function loadModelFile(
  viewer: Viewer,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<{ modelId: string; fromCache: boolean }> {
  const { components } = viewer;
  const fragments = components.get(OBC.FragmentsManager);
  const modelId = file.name.replace(/\.[^.]+$/, "");

  if (inFlight.has(modelId) || fragments.list.has(modelId)) {
    throw new Error(`"${file.name}" is already loaded.`);
  }

  inFlight.add(modelId);
  try {
    const key = cacheKey(file);
    let cached: ArrayBuffer | undefined;
    try {
      cached = await getCachedFragments(key);
    } catch (error) {
      console.warn("[bim-viewer] fragments cache unavailable:", error);
    }
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
      try {
        const fragBuffer = await model.getBuffer(false);
        await putCachedFragments(key, fragBuffer);
      } catch (error) {
        console.warn("[bim-viewer] fragments cache unavailable:", error);
      }
    }

    return { modelId, fromCache: false };
  } finally {
    inFlight.delete(modelId);
  }
}
