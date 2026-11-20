import { describe, expect, it } from "vitest";

import { toSlug } from "../index";

describe("toSlug", () => {
  it("lowercases and hyphenates a title", () => {
    expect(toSlug("  Hello, Deep Modules!  ")).toBe("hello-deep-modules");
  });
});
