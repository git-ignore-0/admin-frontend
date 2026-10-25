import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { ToastProvider } from "@/components/toast-provider";
import { WorkshopEditor } from "@/components/workshop-editor";
import { api } from "@/lib/client-api";
import type { Workshop } from "@/lib/types";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));
vi.mock("@/lib/client-api", () => ({ api: vi.fn() }));
vi.mock("@/components/rich-text-editor", () => ({
  RichTextEditor: () => <div role="textbox" aria-label="Nội dung workshop" />,
}));

const draftWorkshop: Workshop = {
  id: "workshop-id",
  revision_id: "revision-id",
  revision_number: 1,
  version: 1,
  default_locale: "vi",
  start_at: "2026-07-25T02:00:00Z",
  end_at: "2026-07-25T07:00:00Z",
  event_timezone: "Asia/Ho_Chi_Minh",
  effective_status: "upcoming",
  registration_url: "",
  has_published_revision: false,
  translations: [
    {
      locale: "vi",
      title: "Workshop test",
      summary: "Workshop thực hành",
      body: { type: "doc", content: [] },
      is_ready: true,
    },
  ],
  updated_at: "2026-07-21T01:00:00Z",
};

let loadedWorkshop = draftWorkshop;
let deleteError: Error | null = null;

function renderEditor() {
  return render(
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <WorkshopEditor workshopId="workshop-id" />
      </ToastProvider>
    </AdminI18nProvider>,
  );
}

function deleteRequests() {
  return vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "DELETE");
}

describe("workshop delete flow", () => {
  beforeEach(() => {
    loadedWorkshop = draftWorkshop;
    deleteError = null;
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(async (_path, init) => {
      if (init?.method === "DELETE") {
        if (deleteError) throw deleteError;
        return undefined as never;
      }
      return loadedWorkshop as never;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not offer a public preview for a saved draft", async () => {
    renderEditor();

    await screen.findByRole("button", { name: "Xóa workshop" });
    expect(screen.queryByRole("button", { name: "Xem trước" })).not.toBeInTheDocument();
  });

  it("archives a published workshop only after explicit confirmation", async () => {
    loadedWorkshop = { ...draftWorkshop, has_published_revision: true };
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditor();

    fireEvent.click(await screen.findByRole("button", { name: "Lưu trữ workshop" }));

    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining("không còn trong danh sách"));
    expect(deleteRequests()).toHaveLength(0);
  });

  it("deletes a draft once and returns to the workshop list", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditor();

    const button = await screen.findByRole("button", { name: "Xóa workshop" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(deleteRequests()).toHaveLength(1));
    expect(replace).toHaveBeenCalledWith("/workshops");
    await waitFor(() => expect(screen.getByRole("button", { name: "Xóa workshop" })).toBeEnabled());
  });

  it("keeps the editor open and announces a delete failure", async () => {
    deleteError = new Error("network_error");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditor();

    fireEvent.click(await screen.findByRole("button", { name: "Xóa workshop" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Không kết nối được tới backend");
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Xóa workshop" })).toBeEnabled());
  });
});
