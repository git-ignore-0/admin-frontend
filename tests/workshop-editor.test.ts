import { describe, expect, it } from "vitest";

import { completeness } from "@/components/workshop-editor";
import { emptyTranslation } from "@/lib/types";

describe("workshop translation completeness", () => {
  it("distinguishes empty, partial and publishable translations", () => {
    const empty = emptyTranslation("vi");
    expect(completeness(empty)).toBe("empty");
    expect(completeness({ ...empty, title: "Đất sống" })).toBe("partial");
    expect(
      completeness({
        ...empty,
        title: "Đất sống",
        summary: "Một ngày thực hành",
        body: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "   " }] }],
        },
      }),
    ).toBe("partial");
    expect(
      completeness({
        ...empty,
        title: "Đất sống",
        summary: "Một ngày thực hành",
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Nội dung" }],
            },
          ],
        },
      }),
    ).toBe("ready");
    expect(
      completeness({
        ...empty,
        title: "Đất sống",
        summary: "Một ngày thực hành",
        body: { type: "doc", content: [{ type: "image", attrs: { src: "/image.webp" } }] },
      }),
    ).toBe("ready");
  });
});
