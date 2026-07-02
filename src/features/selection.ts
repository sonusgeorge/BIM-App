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
