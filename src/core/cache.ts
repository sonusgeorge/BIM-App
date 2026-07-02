import { createStore, get, set } from "idb-keyval";

const store = createStore("bim-viewer", "fragments-cache");

export function cacheKey(file: {
  name: string;
  size: number;
  lastModified: number;
}): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export async function getCachedFragments(
  key: string,
): Promise<ArrayBuffer | undefined> {
  return get<ArrayBuffer>(key, store);
}

export async function putCachedFragments(
  key: string,
  buffer: ArrayBuffer,
): Promise<void> {
  await set(key, buffer, store);
}
