import "./style.css";
import * as BUI from "@thatopen/ui";
import { createViewer } from "./core/viewer";
import { initLoading, loadModelFile } from "./core/loader";
import { createLayout } from "./ui/layout";
import { createToolbar, type ToolbarHandlers } from "./ui/toolbar";
import { createTreePanel } from "./ui/panels/tree";
import { showProgress, showStatus } from "./ui/status";
import { enableDropzone } from "./features/dropzone";

async function main() {
  BUI.Manager.init();

  const app = document.getElementById("app")!;
  const layout = createLayout(app);

  const viewer = createViewer(layout.viewport);
  await initLoading(viewer);

  const openFile = async (file: File) => {
    try {
      showProgress(`Converting ${file.name}…`, 0);
      const result = await loadModelFile(viewer, file, (p) =>
        showProgress(`Converting ${file.name}…`, p),
      );
      showProgress("", null);
      showStatus(
        result.fromCache
          ? `${file.name} loaded from cache.`
          : `${file.name} converted and loaded.`,
        "info",
      );
    } catch (error) {
      showProgress("", null);
      showStatus(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const handlers: ToolbarHandlers = {
    onOpenFile: openFile,
    onFit: () => {},
    onHide: () => {},
    onIsolate: () => {},
    onShowAll: () => {},
  };
  layout.setToolbar(createToolbar(handlers));
  layout.setLeftPanel(createTreePanel(viewer));

  enableDropzone(layout.viewport, (files) => {
    for (const file of files) void openFile(file);
  });
}

main();
