import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import PreviewError from "@/app/(admin)/dev/ui-foundation/navigation/route-preview/error";
import NavigationPreviewPage from "@/app/(admin)/dev/ui-foundation/navigation/route-preview/page";
import AdminRouteError from "@/app/(admin)/error";
import AdminRouteLoading from "@/app/(admin)/loading";
import AdminUsersLoading from "@/app/(admin)/users/loading";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("keeps the shared route skeleton outside Users without requesting data in either fallback", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(
    <AdminI18nProvider initialLocale="vi">
      <div aria-label="Default admin fallback" role="region">
        <AdminRouteLoading />
      </div>
      <main aria-label="Users fallback">
        <AdminUsersLoading />
      </main>
    </AdminI18nProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Đang tải trang…");
  expect(
    screen
      .getByRole("region", { name: "Default admin fallback" })
      .querySelector(".mantine-Skeleton-root"),
  ).toBeInTheDocument();
  expect(screen.getByRole("main", { name: "Users fallback" })).toBeEmptyDOMElement();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});

it("renders a localized recovery with no exception details and refreshes the failed segment", () => {
  const reset = vi.fn();
  const error = new Error("Internal payload with protected details");
  render(
    <AdminI18nProvider initialLocale="vi">
      <AdminRouteError error={error} reset={reset} />
    </AdminI18nProvider>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Không thể mở trang này.");
  expect(screen.queryByText(error.message)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(refresh).toHaveBeenCalledOnce();
  expect(reset).toHaveBeenCalledOnce();
});

it("keeps list error recovery delegated to the existing module callback", () => {
  const retry = vi.fn();
  render(
    <ListState
      empty="No items"
      error="Could not load records"
      hasData
      isEmpty={false}
      loading={false}
      loadingLabel="Loading records"
      onRetry={retry}
      retryLabel="Retry records"
    />,
  );
  expect(screen.getByRole("alert")).toHaveAttribute("data-variant", "outline");
  fireEvent.click(screen.getByRole("button", { name: "Retry records" }));
  expect(retry).toHaveBeenCalledOnce();
  expect(refresh).not.toHaveBeenCalled();
});

it("renders the demo page and lets the shared retry recover from its simulated error", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.useFakeTimers();
  const page = NavigationPreviewPage();
  await vi.runOnlyPendingTimersAsync();
  const preview = await page;
  vi.useRealTimers();

  class PreviewBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
    state = { error: null };
    static getDerivedStateFromError(error: Error) {
      return { error };
    }
    render() {
      return this.state.error ? (
        <PreviewError error={this.state.error} reset={() => this.setState({ error: null })} />
      ) : (
        this.props.children
      );
    }
  }

  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(PreviewError).toBe(AdminRouteError);
  render(
    <AdminI18nProvider initialLocale="en">
      <PreviewBoundary>{preview}</PreviewBoundary>
    </AdminI18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Simulate rendering error" }));
  expect(screen.getByRole("alert")).toHaveTextContent("This page could not be opened.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.getByRole("button", { name: "Simulate rendering error" })).toBeVisible();
});
