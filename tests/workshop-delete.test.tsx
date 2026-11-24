import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminShell } from "@/components/admin-shell";
import { ToastProvider } from "@/components/toast-provider";
import { WorkshopEditor } from "@/components/workshop-editor";
import { ADMIN_SESSION_CHANGED_EVENT, api } from "@/lib/client-api";
import type { Workshop } from "@/lib/types";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/workshops/workshop-id",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace }),
}));
vi.mock("@/lib/client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-api")>()),
  api: vi.fn(),
}));
vi.mock("@/components/lazy-rich-text-editor", () => ({
  LazyRichTextEditor: () => <div role="textbox" aria-label="Nội dung workshop" />,
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

const readyWorkshop: Workshop = {
  ...draftWorkshop,
  translations: [
    {
      ...draftWorkshop.translations[0],
      body: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Nội dung workshop" }] }],
      },
    },
  ],
};

let loadedWorkshop = draftWorkshop;

function renderEditor(locale: "vi" | "en" = "vi") {
  return render(
    <AdminI18nProvider initialLocale={locale}>
      <ToastProvider>
        <WorkshopEditor workshopId="workshop-id" />
      </ToastProvider>
    </AdminI18nProvider>,
  );
}

function deleteRequests() {
  return vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "DELETE");
}

function mutations() {
  return vi.mocked(api).mock.calls.filter(([, init]) => init?.method);
}

describe("workshop confirmation flows", () => {
  beforeEach(() => {
    loadedWorkshop = draftWorkshop;
    vi.mocked(api).mockReset();
    replace.mockReset();
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (init?.method === "DELETE") return undefined as never;
      if (path.endsWith("/unpublish/")) return { unpublished: true } as never;
      return loadedWorkshop as never;
    });
  });

  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.adminPageSession;
  });

  it("does not offer a public preview for a saved draft", async () => {
    renderEditor();

    await screen.findByRole("button", { name: "Xóa workshop" });
    expect(screen.queryByRole("button", { name: "Xem trước" })).not.toBeInTheDocument();
  });

  it("archives a published workshop only after explicit confirmation", async () => {
    loadedWorkshop = { ...draftWorkshop, has_published_revision: true };
    renderEditor();

    const archive = await screen.findByRole("button", { name: "Lưu trữ workshop" });
    fireEvent.click(archive);
    const dialog = screen.getByRole("dialog", { name: "Lưu trữ workshop" });

    expect(dialog).toHaveTextContent("không còn trong danh sách");
    expect(deleteRequests()).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));
    expect(deleteRequests()).toHaveLength(0);

    fireEvent.click(archive);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Lưu trữ workshop" }),
    );
    await waitFor(() => expect(deleteRequests()).toHaveLength(1));
    expect(deleteRequests()[0]).toEqual([
      "admin/workshops/workshop-id/",
      { method: "DELETE" },
      { response: "no-content", shouldRedirectToLogin: expect.any(Function) },
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("được gỡ khỏi website và lưu trữ");
    expect(replace).toHaveBeenCalledWith("/workshops");
  });

  it("deletes a draft once and returns to the workshop list", async () => {
    renderEditor();

    const button = await screen.findByRole("button", { name: "Xóa workshop" });
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog", { name: "Xóa workshop" });
    expect(dialog).toHaveTextContent("Xóa vĩnh viễn");
    expect(deleteRequests()).toHaveLength(0);
    const confirm = within(dialog).getByRole("button", { name: "Xóa workshop" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => expect(deleteRequests()).toHaveLength(1));
    expect(replace).toHaveBeenCalledWith("/workshops");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(button).toBeEnabled();
  });

  it("keeps the editor open and announces a delete failure", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(loadedWorkshop)
      .mockRejectedValueOnce(new Error("network_error"));
    renderEditor();

    fireEvent.click(await screen.findByRole("button", { name: "Xóa workshop" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa workshop" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể kết nối");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xóa workshop" })).toBeEnabled();
  });

  it("shows ready and skipped languages without saving on open or cancel and restores focus", async () => {
    loadedWorkshop = readyWorkshop;
    renderEditor();

    const publish = await screen.findByRole("button", { name: "Xuất bản" });
    fireEvent.click(publish);
    const dialog = screen.getByRole("dialog", { name: "Xuất bản" });
    expect(dialog).toHaveTextContent(/Sẽ xuất bản\s*Tiếng Việt/);
    expect(dialog).toHaveTextContent(/Chưa xuất bản\s*English/);
    expect(mutations()).toHaveLength(0);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(publish).toHaveFocus());
    expect(mutations()).toHaveLength(0);
  });

  it("saves once before publishing with the saved version and blocks other actions while busy", async () => {
    loadedWorkshop = { ...readyWorkshop, has_published_revision: true };
    const saved = { ...loadedWorkshop, revision_id: "saved-revision", version: 2 };
    let resolveSave!: (value: Workshop) => void;
    const saving = new Promise<Workshop>((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(api)
      .mockResolvedValueOnce(loadedWorkshop)
      .mockImplementationOnce(() => saving as Promise<never>)
      .mockResolvedValueOnce({
        published_revision_id: "saved-revision",
        draft: { ...saved, revision_id: "next-draft", revision_number: 2 },
      });
    renderEditor();

    const publish = await screen.findByRole("button", { name: "Xuất bản" });
    const unpublish = screen.getByRole("button", { name: "Gỡ xuất bản" });
    const archive = screen.getByRole("button", { name: "Lưu trữ workshop" });
    const save = screen.getByRole("button", { name: "Lưu nháp" });
    fireEvent.click(publish);
    const dialog = screen.getByRole("dialog", { name: "Xuất bản" });
    const confirm = within(dialog).getByRole("button", { name: "Xuất bản" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.keyDown(dialog, { key: "Escape" });
    const overlay = document.querySelector<HTMLElement>(".mantine-Modal-overlay");
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Hủy" })).toBeDisabled();
    expect(confirm).toBeDisabled();
    expect(publish).toBeDisabled();
    expect(unpublish).toBeDisabled();
    expect(archive).toBeDisabled();
    expect(save).toBeDisabled();
    expect(mutations()).toHaveLength(1);
    const [draftPath, draftRequest] = mutations()[0];
    expect(draftPath).toBe("admin/workshops/workshop-id/");
    expect(draftRequest?.method).toBe("PATCH");
    expect(JSON.parse(String(draftRequest?.body))).toMatchObject({ version: 1 });

    await act(async () => resolveSave(saved));

    expect(mutations()).toHaveLength(2);
    expect(mutations()[1].slice(0, 2)).toEqual([
      "admin/workshops/workshop-id/publish/",
      { method: "POST", body: JSON.stringify({ revision_id: "saved-revision", version: 2 }) },
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("Workshop đã được xuất bản.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("requires a complete translation before offering publication", async () => {
    renderEditor();

    fireEvent.click(await screen.findByRole("button", { name: "Xuất bản" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa có ngôn ngữ nào đủ");
    expect(mutations()).toHaveLength(0);
  });

  it("stops publication on an optimistic save conflict and preserves the edited draft", async () => {
    loadedWorkshop = readyWorkshop;
    let rejectSave!: (error: Error) => void;
    const saving = new Promise<never>((_, reject) => {
      rejectSave = reject;
    });
    vi.mocked(api)
      .mockResolvedValueOnce(loadedWorkshop)
      .mockImplementationOnce(() => saving);
    renderEditor();

    const publish = await screen.findByRole("button", { name: "Xuất bản" });
    const title = screen.getByLabelText("Tiêu đề *");
    fireEvent.change(title, { target: { value: "Tiêu đề chưa lưu" } });
    fireEvent.click(publish);
    const dialog = screen.getByRole("dialog", { name: "Xuất bản" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Xuất bản" }));

    expect(dialog).toHaveAttribute("aria-busy", "true");
    await act(async () => {
      rejectSave(Object.assign(new Error("version_conflict"), { status: 409 }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Bản nháp đã được người khác cập nhật");
    expect(dialog).not.toBeInTheDocument();
    expect(publish).toBeEnabled();
    expect(title).toHaveValue("Tiêu đề chưa lưu");
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0][1]?.method).toBe("PATCH");
  });

  it("removes the dialog and stops publication when the session changes during the save", async () => {
    loadedWorkshop = readyWorkshop;
    let resolveSave!: (value: Workshop) => void;
    const saving = new Promise<Workshop>((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(api)
      .mockResolvedValueOnce(loadedWorkshop)
      .mockImplementationOnce(() => saving as Promise<never>);
    render(
      <AdminI18nProvider initialLocale="vi">
        <ToastProvider>
          <AdminShell
            sessionBinding="workshop-session"
            user={{ name: "Admin", email: null, login_phone_number: "+84912345678" }}
          >
            <WorkshopEditor workshopId="workshop-id" />
          </AdminShell>
        </ToastProvider>
      </AdminI18nProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Xuất bản" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xuất bản" }));
    expect(mutations()).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(ADMIN_SESSION_CHANGED_EVENT, { detail: "workshop-session" }),
      );
      resolveSave(loadedWorkshop);
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Phiên quản trị đã thay đổi");
    expect(mutations()).toHaveLength(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("unpublishes after confirmation and moves focus to Save draft after removing the trigger", async () => {
    loadedWorkshop = { ...readyWorkshop, has_published_revision: true };
    renderEditor("en");

    const unpublish = await screen.findByRole("button", { name: "Unpublish" });
    fireEvent.click(unpublish);
    let dialog = screen.getByRole("dialog", { name: "Unpublish" });
    expect(dialog).toHaveTextContent("The draft will be kept.");
    expect(mutations()).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(unpublish).toHaveFocus());
    expect(mutations()).toHaveLength(0);

    fireEvent.click(unpublish);
    dialog = screen.getByRole("dialog", { name: "Unpublish" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unpublish" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Workshop removed from the public website.",
    );
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0].slice(0, 2)).toEqual([
      "admin/workshops/workshop-id/unpublish/",
      { method: "POST" },
    ]);
    expect(screen.queryByRole("button", { name: "Unpublish" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete workshop" })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toHaveFocus());
  });

  it("leaves the workshop published when unpublish has no confirmation flag", async () => {
    loadedWorkshop = { ...readyWorkshop, has_published_revision: true };
    vi.mocked(api).mockResolvedValueOnce(loadedWorkshop).mockResolvedValueOnce({});
    renderEditor("en");
    const unpublish = await screen.findByRole("button", { name: "Unpublish" });
    fireEvent.click(unpublish);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Unpublish" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(unpublish).toBeEnabled();
  });

  it("leaves the workshop published and allows retry after an unpublish error", async () => {
    loadedWorkshop = { ...readyWorkshop, has_published_revision: true };
    vi.mocked(api)
      .mockResolvedValueOnce(loadedWorkshop)
      .mockRejectedValueOnce(new Error("network_error"));
    renderEditor("en");

    const unpublish = await screen.findByRole("button", { name: "Unpublish" });
    fireEvent.click(unpublish);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Unpublish" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not connect.");
    expect(screen.getByText("Currently public")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(unpublish).toBeEnabled();
  });
});
