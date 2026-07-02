import { describe, expect, it } from "vitest";
import { cacheKey } from "./cache";

describe("cacheKey", () => {
  it("combines name, size and lastModified", () => {
    const key = cacheKey({ name: "office.ifc", size: 1234, lastModified: 99 });
    expect(key).toBe("office.ifc|1234|99");
  });

  it("differs when the file content changes (size/mtime)", () => {
    const a = cacheKey({ name: "office.ifc", size: 1234, lastModified: 99 });
    const b = cacheKey({ name: "office.ifc", size: 1235, lastModified: 99 });
    const c = cacheKey({ name: "office.ifc", size: 1234, lastModified: 100 });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});
