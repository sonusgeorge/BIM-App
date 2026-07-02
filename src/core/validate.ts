const HEADER_TOKEN = "ISO-10303-21";
const SNIFF_BYTES = 1024;

export function isProbablyIfc(buffer: Uint8Array): boolean {
  if (buffer.length === 0) return false;
  const head = new TextDecoder("utf-8", { fatal: false }).decode(
    buffer.slice(0, SNIFF_BYTES),
  );
  return head.includes(HEADER_TOKEN);
}
