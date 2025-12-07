import { describe, expect, it } from "bun:test";
import { formatSize } from "./formatSize";

describe("formatSize", () => {
  it("returns empty string for zero bytes", () => {
    expect(formatSize(0)).toBe("");
  });

  it("formats sub-megabyte sizes with one decimal when needed", () => {
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1500000)).toBe("1.4 MB");
  });

  it("formats double-digit sizes without decimals", () => {
    expect(formatSize(10 * 1024 * 1024)).toBe("10 MB");
    expect(formatSize(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });
});
