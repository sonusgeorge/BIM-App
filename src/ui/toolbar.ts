import * as BUI from "@thatopen/ui";

export interface ToolbarHandlers {
  onOpenFile(file: File): void;
  onFit(): void;
  onHide(): void;
  onIsolate(): void;
  onShowAll(): void;
}

export function createToolbar(handlers: ToolbarHandlers): HTMLElement {
  const openFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ifc";
    input.style.display = "none";
    document.body.append(input);
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) handlers.onOpenFile(file);
      input.remove();
    };
    input.click();
  };

  return BUI.Component.create<HTMLElement>(() => {
    return BUI.html`
      <bim-toolbar>
        <bim-toolbar-section label="File">
          <bim-button label="Open IFC" icon="mdi:folder-open"
            @click=${openFile}></bim-button>
        </bim-toolbar-section>
        <bim-toolbar-section label="View">
          <bim-button label="Fit" icon="mdi:fit-to-screen"
            @click=${() => handlers.onFit()}></bim-button>
          <bim-button label="Hide" icon="mdi:eye-off"
            @click=${() => handlers.onHide()}></bim-button>
          <bim-button label="Isolate" icon="mdi:filter"
            @click=${() => handlers.onIsolate()}></bim-button>
          <bim-button label="Show all" icon="mdi:eye"
            @click=${() => handlers.onShowAll()}></bim-button>
        </bim-toolbar-section>
      </bim-toolbar>
    `;
  });
}
