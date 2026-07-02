import { describe, expect, it } from "vitest";
import { isProbablyIfc } from "./validate";

const encode = (text: string) => new TextEncoder().encode(text);

describe("isProbablyIfc", () => {
  it("accepts a STEP/IFC header", () => {
    const buffer = encode(
      `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\n`,
    );
    expect(isProbablyIfc(buffer)).toBe(true);
  });

  it("accepts a header preceded by a BOM/whitespace", () => {
    const buffer = encode(`﻿  \nISO-10303-21;\nHEADER;\n`);
    expect(isProbablyIfc(buffer)).toBe(true);
  });

  it("rejects a non-IFC file (e.g. a Revit .rvt binary)", () => {
    const buffer = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
    expect(isProbablyIfc(buffer)).toBe(false);
  });

  it("rejects an empty buffer", () => {
    expect(isProbablyIfc(new Uint8Array(0))).toBe(false);
  });
});
