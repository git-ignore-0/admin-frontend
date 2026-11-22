import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { it, vi, expect, afterEach } from "vitest";
import { AdminI18nProvider, useAdminI18n } from "@/components/admin-i18n-provider";
import { CSARoundEditor } from "@/components/csa-round-editor";
import { api, apiEnvelope } from "@/lib/client-api";
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function Switch() {
  const { setLocale } = useAdminI18n();
  return <button onClick={() => setLocale("vi")}>Switch locale</button>;
}
it("preserves unsaved round edits when switching locale", async () => {
  vi.mocked(api).mockResolvedValue({
    id: "r",
    name: "Server name",
    status: "draft",
    can_edit: true,
    opens_at: "2026-11-20T08:00:00+07:00",
    closes_at: "2026-11-21T18:00:00+07:00",
    delivery_date: "2026-11-22",
  });
  render(
    <AdminI18nProvider initialLocale="en">
      <Switch />
      <CSARoundEditor roundId="r" />
    </AdminI18nProvider>,
  );
  fireEvent.change(await screen.findByRole("textbox", { name: "Round name" }), {
    target: { value: "Unsaved new name" },
  });
  expect(screen.getByRole("textbox", { name: "Round name" })).toHaveValue("Unsaved new name");
  fireEvent.change(screen.getByLabelText(/^Selection opens/), {
    target: { value: "2026-11-20T10:00" },
  });
  fireEvent.click(screen.getByText("Switch locale"));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Tên đợt" })).toHaveValue("Unsaved new name"),
  );
  expect(screen.getByLabelText(/^Bắt đầu chọn hàng/)).toHaveValue("2026-11-20T10:00");
  expect(api).toHaveBeenCalledTimes(1);
  expect(apiEnvelope).not.toHaveBeenCalled();
});
