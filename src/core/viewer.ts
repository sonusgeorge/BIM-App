import * as OBC from "@thatopen/components";

export interface Viewer {
  components: OBC.Components;
  world: OBC.SimpleWorld<
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
