import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { LazyRichTextEditor } from "@/components/lazy-rich-text-editor";
import { ToastProvider } from "@/components/toast-provider";

const chunk = vi.hoisted(() => ({ requested: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Observe the chunk boundary while exercising Next's loader and the real editor.
vi.mock("@/components/rich-text-editor", async (importOriginal) => {
  chunk.requested();
  return importOriginal<typeof import("@/components/rich-text-editor")>();
});

afterEach(cleanup);

it("opens automatically after loading, preserving preview, disabled, content and editing behavior", async () => {
  expect(chunk.requested).not.toHaveBeenCalled();
  const onChange = vi.fn();
  const value = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "One two three" }] }],
  };
  function editor(readOnly: boolean, disabled: boolean) {
    return (
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <LazyRichTextEditor
            value={value}
            onChange={onChange}
            imageAlt="Garden"
            variant="product"
            ariaLabel="Product description"
            readOnly={readOnly}
            disabled={disabled}
          />
        </ToastProvider>
      </AdminI18nProvider>
    );
  }
  const view = render(editor(true, false));

  expect(screen.getByRole("status")).toHaveTextContent("Opening editor…");
  expect(screen.queryByLabelText("Product description")).not.toBeInTheDocument();

  const content = await screen.findByLabelText("Product description");
  expect(content).toHaveTextContent("One two three");
  expect(content.closest(".store-product-description-preview")).toBeInTheDocument();
  expect(content).toHaveAttribute("contenteditable", "false");
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();

  view.rerender(editor(false, true));
  expect(content).toHaveAttribute("contenteditable", "false");
  expect(screen.getByRole("button", { name: /^B$/ })).toBeDisabled();

  view.rerender(editor(false, false));
  await waitFor(() => expect(content).toHaveAttribute("contenteditable", "true"));
  const activeEditor = (content as HTMLElement & { editor: Editor }).editor;
  act(() => activeEditor.commands.setTextSelection({ from: 5, to: 8 }));
  const bold = screen.getByRole("button", { name: /^B$/ });
  fireEvent.mouseDown(bold);
  fireEvent.click(bold);
  expect(activeEditor.getJSON().content?.[0].content).toEqual([
    { type: "text", text: "One " },
    { type: "text", text: "two", marks: [{ type: "bold" }] },
    { type: "text", text: " three" },
  ]);
  expect(onChange).toHaveBeenCalledWith({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "One " },
          { type: "text", text: "two", marks: [{ type: "bold" }] },
          { type: "text", text: " three" },
        ],
      },
    ],
  });
});
