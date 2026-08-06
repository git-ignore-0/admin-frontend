import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useCallback } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { TestimonialDetail } from "@/components/testimonial-detail";
import { TestimonialEditor } from "@/components/testimonial-editor";
import { TestimonialList } from "@/components/testimonial-list";
import { ToastProvider } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import { adminDictionaries } from "@/lib/admin-i18n";
import type { PaginationMeta, Testimonial, TestimonialStatus } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/testimonials",
  useRouter: () => ({ replace: navigation.replace, refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/testimonials");
});

function sampleTestimonial(overrides: Partial<Testimonial> = {}): Testimonial {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    version: 1,
    type: "farmer",
    status: "draft",
    display_name: "Nguyễn Văn An",
    image: null,
    featured: true,
    sort_order: 2,
    published_at: null,
    consent_confirmed: true,
    translations: [
      {
        locale: "vi",
        role: "Nông dân",
        location: "Đồng Nai",
        quote: "Đất khỏe thì cây khỏe.",
        full_story: "Câu chuyện đầy đủ bằng tiếng Việt.",
        is_complete: true,
      },
      {
        locale: "en",
        role: "Farmer",
        location: "Dong Nai",
        quote: "Healthy soil grows healthy plants.",
        full_story: "The complete story in English.",
        is_complete: true,
      },
    ],
    created_by: { id: "admin-id", name: "Admin", email: "admin@example.com" },
    updated_by: { id: "admin-id", name: "Admin", email: "admin@example.com" },
    created_at: "2026-08-01T01:00:00Z",
    updated_at: "2026-08-05T02:00:00Z",
    ...overrides,
  };
}

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>{children}</ToastProvider>
    </AdminI18nProvider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

describe("testimonial list", () => {
  it("supports loading, search, both filters, pagination, and mobile-safe table markup", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [sampleTestimonial()],
      meta: { page: 1, page_size: 20, total: 21 },
    });

    render(
      <Providers>
        <TestimonialList />
      </Providers>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Đang tải testimonials");
    expect(await screen.findByText("Nguyễn Văn An")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(table).toHaveClass("admin-list-table", "testimonial-list-table");
    expect(screen.getByRole("link", { name: /Xem chi tiết: Nguyễn Văn An/ })).toHaveAttribute(
      "href",
      "/testimonials/11111111-1111-4111-8111-111111111111",
    );
    expect(screen.getAllByRole("cell")[0]).toHaveAttribute("data-label", "Testimonial");

    fireEvent.change(screen.getByLabelText("Lọc trạng thái"), {
      target: { value: "published" },
    });
    await waitFor(() => expect(vi.mocked(apiEnvelope)).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText("Lọc loại"), { target: { value: "farmer" } });
    await waitFor(() => expect(vi.mocked(apiEnvelope)).toHaveBeenCalledTimes(3));
    fireEvent.change(screen.getByLabelText("Tìm testimonial"), {
      target: { value: "Đồng Nai" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));

    await waitFor(() =>
      expect(vi.mocked(apiEnvelope)).toHaveBeenLastCalledWith(
        expect.stringContaining("search=%C4%90%E1%BB%93ng+Nai"),
      ),
    );
    expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain("status=published");
    expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain("type=farmer");

    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    await waitFor(() => expect(vi.mocked(apiEnvelope).mock.calls.at(-1)?.[0]).toContain("page=2"));
  });

  it("shows an error and retries through the common list framework", async () => {
    vi.mocked(apiEnvelope)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce({ data: [], meta: { page: 1, page_size: 20, total: 0 } });

    render(
      <Providers>
        <TestimonialList />
      </Providers>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Không kết nối được");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Không tìm thấy testimonial.")).toBeInTheDocument();
    expect(apiEnvelope).toHaveBeenCalledTimes(2);
  });
});

function PaginatedGuardHarness({ source }: { source: string }) {
  const fetchPage = useCallback(
    () => apiEnvelope<string[], PaginationMeta>(`admin/testimonials?source=${source}`),
    [source],
  );
  const getErrorMessage = useCallback(() => "error", []);
  const { items } = usePaginatedList({ fetchPage, getErrorMessage });
  return <div>{items?.join(",") ?? "loading"}</div>;
}

describe("common paginated stale-response guard", () => {
  it("ignores an older Testimonial response after query inputs change", async () => {
    const oldRequest = deferred<{ data: string[]; meta: PaginationMeta }>();
    const newRequest = deferred<{ data: string[]; meta: PaginationMeta }>();
    vi.mocked(apiEnvelope)
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    const view = render(<PaginatedGuardHarness source="old" />);

    view.rerender(<PaginatedGuardHarness source="new" />);
    await act(async () => {
      newRequest.resolve({ data: ["new"], meta: { page: 1, page_size: 20, total: 1 } });
      await newRequest.promise;
    });
    expect(screen.getByText("new")).toBeInTheDocument();

    await act(async () => {
      oldRequest.resolve({ data: ["old"], meta: { page: 1, page_size: 20, total: 1 } });
      await oldRequest.promise;
    });
    expect(screen.getByText("new")).toBeInTheDocument();
    expect(screen.queryByText("old")).toBeNull();
  });
});

function fillCompleteEditor() {
  fireEvent.change(screen.getByLabelText("Tên hiển thị *"), {
    target: { value: "Trần Thị Bình" },
  });
  fireEvent.change(screen.getByLabelText("Loại *"), { target: { value: "farmer" } });
  fireEvent.change(screen.getByLabelText("Thứ tự hiển thị"), { target: { value: "7" } });
  const roles = screen.getAllByLabelText("Vai trò");
  const locations = screen.getAllByLabelText("Địa điểm");
  const quotes = screen.getAllByLabelText("Trích dẫn ngắn");
  const stories = screen.getAllByLabelText("Câu chuyện đầy đủ");
  ["Nông dân", "Farmer"].forEach((value, index) =>
    fireEvent.change(roles[index], { target: { value } }),
  );
  ["Lâm Đồng", "Lam Dong"].forEach((value, index) =>
    fireEvent.change(locations[index], { target: { value } }),
  );
  ["Trích dẫn VI", "English quote"].forEach((value, index) =>
    fireEvent.change(quotes[index], { target: { value } }),
  );
  ["Câu chuyện VI", "English story"].forEach((value, index) =>
    fireEvent.change(stories[index], { target: { value } }),
  );
  fireEvent.click(screen.getByLabelText("Đánh dấu là câu chuyện nổi bật"));
  fireEvent.click(screen.getByLabelText("Đã có sự đồng ý sử dụng"));
}

describe("testimonial editor", () => {
  it("uses concise consent labels without the removed editor explanations", () => {
    expect(adminDictionaries.vi.testimonials.consent).toBe("Đã có sự đồng ý sử dụng");
    expect(adminDictionaries.en.testimonials.consent).toBe("Consent confirmed");
    expect(adminDictionaries.vi.testimonials.featuredHelp).toBe("Đánh dấu là câu chuyện nổi bật");
    expect(adminDictionaries.en.testimonials.featuredHelp).toBe("Mark as a featured story");
    expect(adminDictionaries.vi.testimonials).not.toHaveProperty("editDescription");
    expect(adminDictionaries.vi.testimonials).not.toHaveProperty("basicsHelp");
    expect(adminDictionaries.en.testimonials).not.toHaveProperty("editDescription");
    expect(adminDictionaries.en.testimonials).not.toHaveProperty("basicsHelp");

    render(
      <Providers>
        <TestimonialEditor />
      </Providers>,
    );

    expect(screen.getByLabelText("Đã có sự đồng ý sử dụng")).toBeInTheDocument();
  });

  it("saves an incomplete bilingual draft without attempting to publish", async () => {
    vi.mocked(api).mockResolvedValue(sampleTestimonial({ consent_confirmed: false }));
    render(
      <Providers>
        <TestimonialEditor />
      </Providers>,
    );
    fireEvent.change(screen.getByLabelText("Tên hiển thị *"), {
      target: { value: "Bản nháp chưa hoàn chỉnh" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body));
    expect(payload.consent_confirmed).toBe(false);
    expect(payload.translations).toEqual([
      { locale: "vi", role: "", location: "", quote: "", full_story: "" },
      { locale: "en", role: "", location: "", quote: "", full_story: "" },
    ]);
    expect(vi.mocked(api).mock.calls.some(([path]) => String(path).endsWith("/publish"))).toBe(
      false,
    );
  });

  it("creates a bilingual draft with only backend contract fields", async () => {
    vi.mocked(api).mockResolvedValue(sampleTestimonial());
    render(
      <Providers>
        <TestimonialEditor />
      </Providers>,
    );
    fillCompleteEditor();

    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const [path, init] = vi.mocked(api).mock.calls[0];
    expect(path).toBe("admin/testimonials");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      consent_confirmed: true,
      display_name: "Trần Thị Bình",
      featured: true,
      image_id: null,
      sort_order: 7,
      translations: [
        {
          locale: "vi",
          role: "Nông dân",
          location: "Lâm Đồng",
          quote: "Trích dẫn VI",
          full_story: "Câu chuyện VI",
        },
        {
          locale: "en",
          role: "Farmer",
          location: "Lam Dong",
          quote: "English quote",
          full_story: "English story",
        },
      ],
      type: "farmer",
    });
  });

  it("loads and patches both translations on the dedicated edit screen", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(sampleTestimonial())
      .mockResolvedValueOnce(sampleTestimonial({ display_name: "Tên mới" }));
    render(
      <Providers>
        <TestimonialEditor testimonialId="11111111-1111-4111-8111-111111111111" />
      </Providers>,
    );
    expect(await screen.findByDisplayValue("Nguyễn Văn An")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tên hiển thị *"), { target: { value: "Tên mới" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api).mock.calls[1][0]).toBe(
      "admin/testimonials/11111111-1111-4111-8111-111111111111",
    );
    expect(vi.mocked(api).mock.calls[1][1]?.method).toBe("PATCH");
    const payload = JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body));
    expect(payload.version).toBe(1);
    expect(payload.translations).toHaveLength(2);
    expect(payload.translations.map((item: { locale: string }) => item.locale)).toEqual([
      "vi",
      "en",
    ]);
  });

  it("keeps publish disabled until consent and all VI/EN fields are complete", () => {
    render(
      <Providers>
        <TestimonialEditor />
      </Providers>,
    );
    const publish = screen.getByRole("button", { name: "Xuất bản" });
    expect(publish).toBeDisabled();
    expect(screen.getAllByLabelText("Câu chuyện đầy đủ")[0]).toHaveAttribute("maxlength", "20000");

    fillCompleteEditor();

    expect(publish).toBeEnabled();
  });

  it("does not render a redundant Publish button for a published testimonial", async () => {
    vi.mocked(api).mockResolvedValueOnce(sampleTestimonial({ status: "published" }));

    render(
      <Providers>
        <TestimonialEditor testimonialId="11111111-1111-4111-8111-111111111111" />
      </Providers>,
    );

    expect(await screen.findByDisplayValue("Nguyễn Văn An")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xuất bản" })).toBeNull();
  });

  it("preserves edited form values on a PATCH conflict until the user loads server state", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(sampleTestimonial({ version: 4 }))
      .mockRejectedValueOnce(Object.assign(new Error("version_conflict"), { status: 409 }))
      .mockResolvedValueOnce(sampleTestimonial({ display_name: "Tên trên server", version: 5 }));
    render(
      <Providers>
        <TestimonialEditor testimonialId="11111111-1111-4111-8111-111111111111" />
      </Providers>,
    );
    const name = await screen.findByDisplayValue("Nguyễn Văn An");
    fireEvent.change(name, { target: { value: "Nội dung tôi đang sửa" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    expect(await screen.findByText(/Nội dung bạn đang nhập vẫn được giữ/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Nội dung tôi đang sửa")).toBeInTheDocument();
    const patchPayload = JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body));
    expect(patchPayload.version).toBe(4);
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Tải phiên bản mới từ server" }));
    expect(screen.getByDisplayValue("Tên trên server")).toBeInTheDocument();
  });

  it("retries create-and-publish with one create, one image upload, and the authoritative ID", async () => {
    const asset = {
      id: "asset-id",
      url: "https://example.test/image.webp",
      width: 640,
      height: 480,
      variants: [],
    };
    const created = sampleTestimonial({ id: "created-id", image: asset, version: 1 });
    vi.mocked(api)
      .mockResolvedValueOnce(asset)
      .mockResolvedValueOnce(created)
      .mockRejectedValueOnce(Object.assign(new Error("server_error"), { status: 500 }))
      .mockResolvedValueOnce(
        sampleTestimonial({ id: "created-id", image: asset, status: "published", version: 2 }),
      );
    render(
      <Providers>
        <TestimonialEditor />
      </Providers>,
    );
    fillCompleteEditor();
    fireEvent.change(screen.getByLabelText("Chọn ảnh"), {
      target: { files: [new File(["image"], "portrait.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Xuất bản" }));
    const dialog = screen.getByRole("dialog", { name: "Xác nhận xuất bản" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Xuất bản" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Backend gặp lỗi");
    expect(window.location.pathname).toBe("/testimonials/created-id/edit");
    fireEvent.click(within(dialog).getByRole("button", { name: "Xuất bản" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const calls = vi.mocked(api).mock.calls;
    expect(calls.filter(([path]) => path === "admin/testimonials/media")).toHaveLength(1);
    expect(calls.filter(([path]) => path === "admin/testimonials")).toHaveLength(1);
    expect(calls.filter(([path]) => path === "admin/testimonials/created-id/publish")).toHaveLength(
      2,
    );
    expect(JSON.parse(String(calls[2][1]?.body))).toEqual({ version: 1 });
    expect(JSON.parse(String(calls[3][1]?.body))).toEqual({ version: 1 });
  });

  it("retries publish for an existing testimonial without another PATCH or upload", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(sampleTestimonial({ version: 7 }))
      .mockResolvedValueOnce(sampleTestimonial({ version: 8 }))
      .mockRejectedValueOnce(Object.assign(new Error("server_error"), { status: 500 }))
      .mockResolvedValueOnce(sampleTestimonial({ status: "published", version: 9 }));
    render(
      <Providers>
        <TestimonialEditor testimonialId="11111111-1111-4111-8111-111111111111" />
      </Providers>,
    );
    expect(await screen.findByDisplayValue("Nguyễn Văn An")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xuất bản" }));
    const dialog = screen.getByRole("dialog", { name: "Xác nhận xuất bản" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Xuất bản" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Backend gặp lỗi");
    fireEvent.click(within(dialog).getByRole("button", { name: "Xuất bản" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const calls = vi.mocked(api).mock.calls;
    expect(calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
    expect(calls.filter(([path]) => path === "admin/testimonials/media")).toHaveLength(0);
    expect(calls.filter(([path]) => String(path).endsWith("/publish"))).toHaveLength(2);
    expect(JSON.parse(String(calls[2][1]?.body))).toEqual({ version: 8 });
    expect(JSON.parse(String(calls[3][1]?.body))).toEqual({ version: 8 });
  });
});

describe("testimonial state confirmations", () => {
  it("prevents a double click from sending the publish action twice", async () => {
    const actionRequest = deferred<Testimonial>();
    vi.mocked(api)
      .mockResolvedValueOnce(sampleTestimonial())
      .mockReturnValueOnce(actionRequest.promise);
    render(
      <Providers>
        <TestimonialDetail testimonialId="11111111-1111-4111-8111-111111111111" />
      </Providers>,
    );
    expect(await screen.findByText("Nguyễn Văn An")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xuất bản" }));
    const dialog = screen.getByRole("dialog", { name: "Xác nhận xuất bản" });
    const confirm = within(dialog).getByRole("button", { name: "Xuất bản" });

    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(api).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api).mock.calls[1][0]).toContain("/publish");
    expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]?.body))).toEqual({ version: 1 });

    await act(async () => {
      actionRequest.resolve(
        sampleTestimonial({ status: "published", published_at: "2026-08-05T03:00:00Z" }),
      );
      await actionRequest.promise;
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Đã xuất bản")).toBeInTheDocument();
  });

  it.each([
    [409, "Testimonial vừa được quản trị viên khác cập nhật"],
    [400, "Backend chưa cho phép thao tác này"],
  ])("keeps the dialog open for a %s action error", async (status, message) => {
    vi.mocked(api)
      .mockResolvedValueOnce(sampleTestimonial())
      .mockRejectedValueOnce(Object.assign(new Error("request_failed"), { status }));
    if (status === 409) {
      vi.mocked(api).mockResolvedValueOnce(
        sampleTestimonial({ display_name: "Bản server", version: 2 }),
      );
    }
    render(
      <Providers>
        <TestimonialDetail testimonialId="11111111-1111-4111-8111-111111111111" />
      </Providers>,
    );
    expect(await screen.findByText("Nguyễn Văn An")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xuất bản" }));
    const dialog = screen.getByRole("dialog", { name: "Xác nhận xuất bản" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Xuất bản" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("dialog", { name: "Xác nhận xuất bản" })).toBeInTheDocument();
    if (status === 409) {
      expect(within(dialog).getByRole("button", { name: "Xuất bản" })).toBeDisabled();
      expect(screen.getByText("Bản server")).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Xuất bản" }));
      expect(api).toHaveBeenCalledTimes(3);
    }
  });

  it("offers no hard-delete action and exposes accessible state controls", async () => {
    vi.mocked(api).mockResolvedValueOnce(
      sampleTestimonial({ status: "published" as TestimonialStatus }),
    );
    render(
      <Providers>
        <TestimonialDetail testimonialId="11111111-1111-4111-8111-111111111111" />
      </Providers>,
    );

    expect(await screen.findByRole("link", { name: "Chỉnh sửa" })).toHaveAttribute(
      "href",
      "/testimonials/11111111-1111-4111-8111-111111111111/edit",
    );
    expect(screen.getByRole("button", { name: "Ẩn testimonial" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chuyển về bản nháp" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /xóa/i })).toBeNull();
  });
});

describe("testimonial detail request guard", () => {
  it("ignores an older detail response after the testimonial ID changes", async () => {
    const oldRequest = deferred<Testimonial>();
    const newRequest = deferred<Testimonial>();
    vi.mocked(api).mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    const view = render(
      <Providers>
        <TestimonialDetail testimonialId="old-id" />
      </Providers>,
    );

    view.rerender(
      <Providers>
        <TestimonialDetail testimonialId="new-id" />
      </Providers>,
    );
    await act(async () => {
      newRequest.resolve(sampleTestimonial({ id: "new-id", display_name: "New detail" }));
      await newRequest.promise;
    });
    expect(screen.getByText("New detail")).toBeInTheDocument();

    await act(async () => {
      oldRequest.resolve(sampleTestimonial({ id: "old-id", display_name: "Old detail" }));
      await oldRequest.promise;
    });
    expect(screen.getByText("New detail")).toBeInTheDocument();
    expect(screen.queryByText("Old detail")).toBeNull();
    expect((vi.mocked(api).mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
  });

  it("aborts the active detail request on unmount", () => {
    vi.mocked(api).mockReturnValueOnce(new Promise<Testimonial>(() => undefined));
    const view = render(
      <Providers>
        <TestimonialDetail testimonialId="unmount-id" />
      </Providers>,
    );
    const signal = vi.mocked(api).mock.calls[0][1]?.signal as AbortSignal;

    view.unmount();

    expect(signal.aborted).toBe(true);
  });
});
