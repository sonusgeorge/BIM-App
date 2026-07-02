import "./style.css";
import { createViewer } from "./core/viewer";
import { initLoading, loadModelFile } from "./core/loader";

const container = document.getElementById("app")!;
const viewer = createViewer(container);

const input = document.createElement("input");
input.type = "file";
input.accept = ".ifc";
input.style.cssText = "position:absolute;top:8px;left:8px;z-index:10;";
document.body.append(input);

initLoading(viewer).then(() => {
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const result = await loadModelFile(viewer, file, (p) =>
      console.log("progress", p),
    );
    console.log("loaded", result);
  };
});
