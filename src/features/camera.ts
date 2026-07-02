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
