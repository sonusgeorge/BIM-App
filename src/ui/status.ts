let statusEl: HTMLDivElement | null = null;
let hideTimer: number | undefined;

function ensureEl(): HTMLDivElement {
  if (!statusEl) {
    statusEl = document.createElement("div");
    statusEl.className = "status-toast";
    document.body.append(statusEl);
  }
  return statusEl;
}

export function showStatus(message: string, kind: "info" | "error"): void {
  const el = ensureEl();
  el.textContent = message;
  el.dataset.kind = kind;
  el.style.display = "block";
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(
    () => {
      el.style.display = "none";
    },
    kind === "error" ? 8000 : 4000,
  );
}

export function showProgress(label: string, fraction: number | null): void {
  const el = ensureEl();
  window.clearTimeout(hideTimer);
  if (fraction === null) {
    el.style.display = "none";
    return;
  }
  el.dataset.kind = "info";
  el.style.display = "block";
  el.textContent = `${label} ${Math.round(fraction * 100)}%`;
}
