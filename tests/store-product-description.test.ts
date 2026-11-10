import { describe, expect, it } from "vitest";
import {
  descriptionDocument,
  descriptionPayload,
  descriptionText,
} from "@/lib/store-product-description";

describe("Store rich product description compatibility", () => {
  it("keeps old text, literal HTML and line breaks when opening without changing", () => {
    const legacy = "  Rau <strong>tươi</strong>\r\nDòng hai\n\nBảo quản  ";
    const document = descriptionDocument(legacy);
    expect(descriptionText(document)).toBe(legacy.replace(/\r\n/g, "\n"));
    expect(descriptionPayload(document, legacy)).toEqual({ description: legacy });
  });
  it("sends structured content in its own field with a plain text fallback", () => {
    const document = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Bảo quản" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Giữ mát", marks: [{ type: "bold" }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(descriptionPayload(document, "")).toEqual({
      description: "Bảo quản\nGiữ mát",
      description_document: document,
    });
  });
  it("preserves a saved document when editing other product fields", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Fresh", marks: [{ type: "italic" }] }],
        },
      ],
    };
    expect(descriptionDocument("Old", document)).toEqual(document);
    expect(descriptionPayload(document, "Old", document)).toEqual({
      description: "Old",
      description_document: document,
    });
  });
  it("saves deliberate removal as an empty document instead of reviving legacy text", () => {
    const empty = descriptionDocument("");
    expect(descriptionPayload(empty, "Old")).toEqual({
      description: "",
      description_document: empty,
    });
  });
});
