import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { FarmFarmerLink } from "@/components/farm-farmer-link";
import { ToastProvider } from "@/components/toast-provider";

const { link, readFarm, writeText } = vi.hoisted(() => ({
  link: vi.fn(),
  readFarm: vi.fn(),
  writeText: vi.fn(),
}));
vi.mock("@/lib/farm-supply-request-api", () => ({ farmerLink: link }));
vi.mock("@/lib/farms-api", () => ({ getFarm: readFarm }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const farmId = "87703641-2dce-4cac-8fc4-91e55f03e95f";
const route = (character: string) => ({
  farm_id: farmId,
  url: `/farmer#token=${character.repeat(43)}`,
});
const missing = () =>
  Object.assign(new Error("request_failed"), { status: 404, payload: { detail: "Not found." } });

function mount(farm = farmId) {
  const onAccessLost = vi.fn();
  const claimWrite = vi.fn(() => vi.fn());
  const view = render(
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminQueryProvider>
          <FarmFarmerLink
            farmId={farm}
            writeBlocked={false}
            claimWrite={claimWrite}
            onAccessLost={onAccessLost}
          />
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>,
  );
  return { ...view, onAccessLost, claimWrite };
}

function confirmRotation() {
  fireEvent.click(screen.getByRole("button", { name: "Đổi link" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/Link cũ sẽ không còn hiệu lực/u)).toBeVisible();
  fireEvent.click(within(dialog).getByRole("button", { name: "Đổi link" }));
}

beforeEach(() => {
  link.mockReset();
  readFarm.mockReset();
  writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

it("checks Farm existence after a missing link and creates only on explicit action", async () => {
  link.mockRejectedValueOnce(missing()).mockResolvedValueOnce(route("A"));
  readFarm.mockResolvedValue({ id: farmId });
  mount();
  const create = await screen.findByRole("button", { name: "Tạo link" });
  expect(link.mock.calls.map((parts) => parts[1])).toEqual(["read"]);
  expect(readFarm).toHaveBeenCalledWith(farmId, expect.any(AbortSignal));
  fireEvent.click(create);
  expect(await screen.findByRole("textbox", { name: "URL nhập sản phẩm" })).toHaveValue(
    `${window.location.origin}${route("A").url}`,
  );
  expect(link.mock.calls.map((parts) => parts[1])).toEqual(["read", "create"]);
});

it("copies the confirmed URL and reports clipboard failure without displaying the secret in toast", async () => {
  link.mockResolvedValue(route("A"));
  writeText.mockRejectedValueOnce(new Error("denied")).mockResolvedValueOnce(undefined);
  mount();
  const copy = await screen.findByRole("button", { name: "Sao chép URL" });
  fireEvent.click(copy);
  expect(await screen.findByText("Không thể sao chép URL.")).toBeVisible();
  fireEvent.click(copy);
  expect(await screen.findByText("Đã sao chép URL.")).toBeVisible();
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${route("A").url}`);
});

it("reads the current URL after an uncertain rotation without repeating POST", async () => {
  link
    .mockResolvedValueOnce(route("A"))
    .mockRejectedValueOnce(new Error("network_error"))
    .mockResolvedValueOnce(route("B"));
  mount();
  await screen.findByRole("textbox");
  confirmRotation();
  await waitFor(() =>
    expect(screen.getByRole("textbox")).toHaveValue(`${window.location.origin}${route("B").url}`),
  );
  expect(link.mock.calls.map((parts) => parts[1])).toEqual(["read", "rotate", "read"]);
  expect(screen.queryByText("Đã cập nhật link hiện tại.")).not.toBeInTheDocument();
});

it("confirms a successful rotation and hides the old URL", async () => {
  link.mockResolvedValueOnce(route("A")).mockResolvedValueOnce(route("B"));
  mount();
  await screen.findByRole("textbox");
  confirmRotation();
  expect(await screen.findByText("Đã cập nhật link hiện tại.")).toBeVisible();
  expect(screen.getByRole("textbox")).toHaveValue(`${window.location.origin}${route("B").url}`);
});

it("retires access on denial and clears an aborted read on unmount", async () => {
  let finish!: (value: ReturnType<typeof route>) => void;
  link.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const first = mount();
  await waitFor(() => expect(link).toHaveBeenCalled());
  const signal = link.mock.calls[0][2];
  first.unmount();
  expect(signal.aborted).toBe(true);
  const forbidden = Object.assign(new Error("forbidden"), { status: 403 });
  link.mockRejectedValueOnce(forbidden);
  const second = mount();
  await act(async () => finish(route("A")));
  expect(second.onAccessLost).toHaveBeenCalledWith(forbidden);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("can display failed creation without success or repeating the write", async () => {
  link
    .mockRejectedValueOnce(missing())
    .mockRejectedValueOnce(Object.assign(new Error("validation_error"), { status: 400 }));
  readFarm.mockResolvedValue({ id: farmId });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Tạo link" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.queryByText("Đã tạo link.")).not.toBeInTheDocument();
  expect(link.mock.calls.map((parts) => parts[1])).toEqual(["read", "create"]);
});
