import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { retireFarmAccess, retireFarmQueries } from "@/lib/farm-query";

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
  const query: { current?: QueryClient } = {};
  function CaptureClient() {
    query.current = useQueryClient();
    return null;
  }
  const tree = (visible: boolean, id: string, session: string) => (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminQueryProvider key={session}>
          <CaptureClient />
          {visible && (
            <FarmFarmerLink
              key={id}
              farmId={id}
              writeBlocked={false}
              claimWrite={claimWrite}
              onAccessLost={onAccessLost}
            />
          )}
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>
  );
  const view = render(tree(true, farm, "first"));
  return {
    ...view,
    onAccessLost,
    claimWrite,
    query,
    show(visible: boolean, id = farm, session = "first") {
      view.rerender(tree(visible, id, session));
    },
  };
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

it("keeps old-link GETs and failed checks unknown until it reads a different link", async () => {
  link
    .mockResolvedValueOnce(route("A"))
    .mockRejectedValueOnce(new Error("request_timeout"))
    .mockResolvedValueOnce(route("A"))
    .mockResolvedValueOnce(route("A"))
    .mockRejectedValueOnce(new Error("invalid_response"))
    .mockResolvedValueOnce(route("B"));
  mount();
  await screen.findByRole("textbox");
  confirmRotation();
  const retry = await screen.findByRole("button", { name: "Kiểm tra link hiện tại" });
  await waitFor(() => expect(retry).toBeEnabled());
  for (let expected = 3; expected <= 5; expected += 1) {
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sao chép URL" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đổi link" })).not.toBeInTheDocument();
    expect(link).toHaveBeenCalledTimes(expected);
    fireEvent.click(retry);
    await waitFor(() => expect(link).toHaveBeenCalledTimes(expected + 1));
    if (expected !== 5) await waitFor(() => expect(retry).toBeEnabled());
  }
  await waitFor(() =>
    expect(screen.getByRole("textbox")).toHaveValue(`${window.location.origin}${route("B").url}`),
  );
  expect(link.mock.calls.filter((parts) => parts[1] === "rotate")).toHaveLength(1);
  expect(screen.queryByText("Đã cập nhật link hiện tại.")).not.toBeInTheDocument();
});

it("keeps a pending rotate across unmount and recovers an uncertain response on remount", async () => {
  let fail!: (cause: Error) => void;
  link
    .mockResolvedValueOnce(route("A"))
    .mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject;
      }),
    )
    .mockResolvedValueOnce(route("A"))
    .mockResolvedValueOnce(route("B"));
  const view = mount();
  await screen.findByRole("textbox");
  confirmRotation();
  view.show(false);
  view.show(true);
  expect(link.mock.calls.map((parts) => parts[1])).toEqual(["read", "rotate"]);
  await act(async () => fail(new Error("request_timeout")));
  await waitFor(() => expect(link).toHaveBeenCalledTimes(3));
  const retry = await screen.findByRole("button", { name: "Kiểm tra link hiện tại" });
  await waitFor(() => expect(retry).toBeEnabled());
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(retry);
  expect(await screen.findByRole("textbox")).toHaveValue(
    `${window.location.origin}${route("B").url}`,
  );
  expect(link.mock.calls.map((parts) => parts[1])).toEqual(["read", "rotate", "read", "read"]);
});

it("keeps unknown recovery isolated by Farm and session", async () => {
  const otherFarm = "77777777-7777-4777-8777-777777777777";
  link.mockImplementation(async (farm: string, action: string) => {
    if (action === "rotate") throw new Error("request_timeout");
    return { ...route(farm === farmId ? "A" : "C"), farm_id: farm };
  });
  const view = mount();
  await screen.findByRole("textbox");
  confirmRotation();
  expect(await screen.findByRole("button", { name: "Kiểm tra link hiện tại" })).toBeVisible();
  view.show(true, otherFarm);
  expect(await screen.findByRole("textbox")).toHaveValue(
    `${window.location.origin}${route("C").url}`,
  );
  view.show(true, farmId);
  expect(await screen.findByRole("button", { name: "Kiểm tra link hiện tại" })).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  view.show(true, farmId, "second");
  expect(await screen.findByRole("textbox")).toHaveValue(
    `${window.location.origin}${route("A").url}`,
  );
});

it.each(["access", "record"])(
  "drops recovery on %s retirement before a late GET finishes",
  async (kind) => {
    let finish!: (value: ReturnType<typeof route>) => void;
    link
      .mockResolvedValueOnce(route("A"))
      .mockRejectedValueOnce(new Error("network_error"))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
    const view = mount();
    await screen.findByRole("textbox");
    confirmRotation();
    await waitFor(() => expect(link).toHaveBeenCalledTimes(3));
    await act(async () => {
      const client = view.query.current;
      if (!client) throw new Error("Missing test QueryClient");
      if (kind === "access")
        retireFarmAccess(client, Object.assign(new Error("forbidden"), { status: 403 }));
      else {
        retireFarmQueries(client, farmId);
        view.show(false);
      }
      finish(route("B"));
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Đã cập nhật link hiện tại.")).not.toBeInTheDocument();
  },
);

it("keeps rotation unknown when GET returns no link for an existing Farm", async () => {
  link
    .mockResolvedValueOnce(route("A"))
    .mockRejectedValueOnce(new Error("network_error"))
    .mockRejectedValueOnce(missing());
  readFarm.mockResolvedValue({ id: farmId });
  mount();
  await screen.findByRole("textbox");
  confirmRotation();
  const check = await screen.findByRole("button", { name: "Kiểm tra link hiện tại" });
  await waitFor(() => expect(check).toBeEnabled());
  expect(readFarm).toHaveBeenCalledExactlyOnceWith(farmId, expect.any(AbortSignal));
  expect(screen.queryByRole("button", { name: "Tạo link" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("retires same-session access on a permission error from an unmounted rotate", async () => {
  let fail!: (cause: Error) => void;
  const denied = Object.assign(new Error("forbidden"), { status: 403 });
  link.mockResolvedValueOnce(route("A")).mockReturnValueOnce(
    new Promise((_, reject) => {
      fail = reject;
    }),
  );
  const view = mount();
  await screen.findByRole("textbox");
  confirmRotation();
  view.show(false);
  await act(async () => fail(denied));
  view.show(true);
  expect(link.mock.calls.map((parts) => parts[1])).toEqual(["read", "rotate"]);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("ignores a clipboard completion once another link is being verified", async () => {
  let copied!: () => void;
  writeText.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      copied = resolve;
    }),
  );
  link
    .mockResolvedValueOnce(route("A"))
    .mockRejectedValueOnce(new Error("network_error"))
    .mockResolvedValueOnce(route("A"));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Sao chép URL" }));
  confirmRotation();
  await screen.findByRole("button", { name: "Kiểm tra link hiện tại" });
  await act(async () => copied());
  expect(screen.queryByText("Đã sao chép URL.")).not.toBeInTheDocument();
});
