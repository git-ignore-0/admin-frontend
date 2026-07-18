import Link from "@tiptap/extension-link";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";

import {
  normalizeLinkHref,
  normalizeTiptapLinks,
  setLinkForSelection,
  toggleHeadingForSelection,
} from "@/components/rich-text-editor";

let editor: Editor | undefined;

afterEach(() => editor?.destroy());

describe("workshop rich text headings", () => {
  it("turns only the highlighted words into a heading", () => {
    editor = new Editor({
      extensions: [StarterKit.configure({ heading: { levels: [2, 3, 4] } })],
      content: "<p>Before Selected After</p>",
    });
    // ProseMirror positions are one-based inside the paragraph.
    editor.commands.setTextSelection({ from: 8, to: 16 });

    toggleHeadingForSelection(editor, 2);

    expect(editor.getJSON().content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Before " }] },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Selected" }],
      },
      { type: "paragraph", content: [{ type: "text", text: " After" }] },
    ]);
  });

  it("keeps bold and italic scoped to the selected text", () => {
    editor = new Editor({ extensions: [StarterKit], content: "<p>One two three</p>" });
    editor.commands.setTextSelection({ from: 5, to: 8 });
    editor.chain().focus().toggleBold().run();
    editor.chain().focus().toggleItalic().run();

    expect(editor.getJSON().content?.[0]).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "One " },
        { type: "text", marks: [{ type: "bold" }, { type: "italic" }], text: "two" },
        { type: "text", text: " three" },
      ],
    });
  });
});

describe("workshop rich text links", () => {
  it("normalizes domains and email addresses to allowed links", () => {
    expect(normalizeLinkHref("example.com/page")).toBe("https://example.com/page");
    expect(normalizeLinkHref("hello@example.com")).toBe("mailto:hello@example.com");
    expect(normalizeLinkHref("http://example.com")).toBe("https://example.com/");
    expect(normalizeLinkHref("http://localhost:3001/workshops/local")).toBe(
      "http://localhost:3001/workshops/local",
    );
    expect(normalizeLinkHref("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkHref("not a url")).toBeNull();
  });

  it("applies a link only to the saved text selection", () => {
    editor = new Editor({ extensions: [StarterKit, Link], content: "<p>One linked three</p>" });

    setLinkForSelection(editor, { from: 5, to: 11 }, "https://example.com/");

    expect(editor.getJSON().content?.[0]).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "One " },
        {
          type: "text",
          marks: [
            {
              type: "link",
              attrs: {
                href: "https://example.com/",
                target: "_blank",
                rel: "noopener noreferrer nofollow",
                class: null,
              },
            },
          ],
          text: "linked",
        },
        { type: "text", text: " three" },
      ],
    });
  });

  it("normalizes every stored link before the workshop payload is sent", () => {
    expect(
      normalizeTiptapLinks({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Local URL",
                marks: [{ type: "link", attrs: { href: "http://localhost:3001/workshops/local" } }],
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      content: [
        {
          content: [
            {
              marks: [{ type: "link", attrs: { href: "http://localhost:3001/workshops/local" } }],
            },
          ],
        },
      ],
    });
  });
});
