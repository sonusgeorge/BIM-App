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

  return BUI.Component.create<HTMLElement>(() => {
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
