// Stages the web-ifc WASM binaries into public/wasm/ so the app serves the
// exact version matching the installed JS glue code. autoSetWasm is unreliable:
// @thatopen/components ships a stale release constant and resolves an older,
// incompatible web-ifc binary from the CDN.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "wasm");

mkdirSync(outDir, { recursive: true });
for (const file of ["web-ifc.wasm", "web-ifc-mt.wasm"]) {
  copyFileSync(require.resolve(`web-ifc/${file}`), join(outDir, file));
}
console.log(`[copy-wasm] staged web-ifc WASM into public/wasm/`);
