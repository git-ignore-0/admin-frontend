import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { RichTextEditor } from "@/components/rich-text-editor";
import { ToastProvider } from "@/components/toast-provider";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);
it("exposes toggle state and preserves the selected text through toolbar mouse actions", async () => {
  const changed = vi.fn();
  render(
    <AdminI18nProvider initialLocale="en">
      <ToastProvider>
        <RichTextEditor
          ariaLabel="Rich text"
          imageAlt="Garden"
          value={{
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "One two three" }] }],
          }}
          onChange={changed}
        />
      </ToastProvider>
    </AdminI18nProvider>,
  );
  const content = await screen.findByLabelText("Rich text");
  const editor = (content as HTMLElement & { editor: Editor }).editor;
  act(() => {
    editor.commands.setTextSelection({ from: 5, to: 8 });
  });
  const bold = screen.getByRole("button", { name: /^B$/ });
  expect(bold).toHaveAttribute("aria-pressed", "false");
  fireEvent.mouseDown(bold);
  expect(editor.state.selection.from).toBe(5);
  expect(editor.state.selection.to).toBe(8);
  fireEvent.click(bold);
  expect(bold).toHaveAttribute("aria-pressed", "true");
  expect(editor.getJSON().content?.[0].content).toEqual([
    { type: "text", text: "One " },
    { type: "text", text: "two", marks: [{ type: "bold" }] },
    { type: "text", text: " three" },
  ]);
  expect(changed).toHaveBeenCalled();
});
