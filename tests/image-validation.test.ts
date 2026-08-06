import { describe, expect, it } from "vitest";

import { isSupportedImageFile } from "@/lib/image-validation";

describe("image validation", () => {
  it.each(["photo.jpg", "photo.JPG", "photo.jpeg", "photo.JPEG", "photo.png", "photo.webp"])(
    "accepts %s by extension",
    (name) => {
      expect(isSupportedImageFile({ name, type: "" })).toBe(true);
    },
  );

  it("accepts a supported MIME type even when the filename is unusual", () => {
    expect(isSupportedImageFile({ name: "photo", type: "image/jpeg" })).toBe(true);
  });

  it("rejects unsupported formats", () => {
    expect(isSupportedImageFile({ name: "photo.gif", type: "image/gif" })).toBe(false);
  });
});
