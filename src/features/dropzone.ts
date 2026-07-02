export function enableDropzone(
  target: HTMLElement,
  onFiles: (files: File[]) => void,
): void {
  target.style.position = "relative";

  target.addEventListener("dragover", (event) => {
    event.preventDefault();
    target.classList.add("dropzone-active");
  });

  target.addEventListener("dragleave", () => {
    target.classList.remove("dropzone-active");
  });

  target.addEventListener("drop", (event) => {
    event.preventDefault();
    target.classList.remove("dropzone-active");
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) onFiles(files);
  });
}
