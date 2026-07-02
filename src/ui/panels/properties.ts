import * as BUI from "@thatopen/ui";
import * as BUIC from "@thatopen/ui-obc";
import * as OBF from "@thatopen/components-front";
import type { Viewer } from "../../core/viewer";

export function createPropertiesPanel(viewer: Viewer): HTMLElement {
  const { components } = viewer;

  const [propertiesTable, updatePropertiesTable] = BUIC.tables.itemsData({
    components,
    modelIdMap: {},
  });
  propertiesTable.preserveStructureOnFilter = true;
  propertiesTable.indentationInText = false;

  const highlighter = components.get(OBF.Highlighter);
  highlighter.events.select.onHighlight.add((modelIdMap) => {
    updatePropertiesTable({ modelIdMap });
  });
  highlighter.events.select.onClear.add(() => {
    updatePropertiesTable({ modelIdMap: {} });
  });

  const onSearch = (e: Event) => {
    const input = e.target as BUI.TextInput;
    propertiesTable.queryString = input.value;
  };

  return BUI.Component.create<HTMLElement>(() => {
    return BUI.html`
      <bim-panel label="Properties">
        <bim-panel-section label="Element data">
          <bim-text-input @input=${onSearch} placeholder="Search…"
            debounce="200"></bim-text-input>
          ${propertiesTable}
        </bim-panel-section>
      </bim-panel>
    `;
  });
}
