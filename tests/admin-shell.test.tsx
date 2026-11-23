import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { startTransition, Suspense, use, useLayoutEffect, useState, type ReactNode } from "react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminShell } from "@/components/admin-shell";
import headerClasses from "@/components/admin-shell.module.css";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { activeAdminSection, adminNavigation, isActiveAdminRoute } from "@/lib/admin-navigation";
import { adminDictionaries } from "@/lib/admin-i18n";
import { ADMIN_SESSION_CHANGED_EVENT, api, apiFile } from "@/lib/client-api";

const navigation = vi.hoisted(() => ({
  pathname: "/dashboard",
  search: "",
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  },
}));
const originalResizeObserver = window.ResizeObserver;

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => navigation.router,
}));

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.adminPageSession;
  navigation.pathname = "/dashboard";
  navigation.search = "";
  window.history.replaceState(null, "", "/");
  window.ResizeObserver = originalResizeObserver;
  vi.clearAllMocks();
  navigation.router.push.mockReset();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  window.localStorage.clear();
});

function renderShell(
  pathname = "/dashboard",
  locale: "en" | "vi" = "en",
  user: React.ComponentProps<typeof AdminShell>["user"] = {
    email: "admin@example.com",
    login_phone_number: null,
    name: "Admin",
  },
) {
  navigation.pathname = pathname;
  return render(
    <AdminI18nProvider initialLocale={locale}>
      <AdminShell user={user} sessionBinding="test-session">
        <div>Page content</div>
      </AdminShell>
    </AdminI18nProvider>,
  );
}

function renderNavigableShell(initialPath = "/dashboard", initialContent?: ReactNode) {
  const requests = new Map<string, { promise: Promise<void>; resolve: () => void }>();
  window.history.replaceState(null, "", initialPath);
  let restoreRoute: (href: string) => void;

  function Destination({ href }: { href: string }) {
    const request = requests.get(href);
    if (request) use(request.promise);
    const url = new URL(href, window.location.origin);
    navigation.pathname = url.pathname;
    navigation.search = url.search.slice(1);
    useLayoutEffect(() => {
      window.history.replaceState(null, "", href);
    }, [href]);
    return (
      <AdminI18nProvider initialLocale="en">
        <AdminShell
          user={{ name: "Admin", email: null, login_phone_number: null }}
          sessionBinding="test-session"
        >
          <p>Content at {href}</p>
          {href === initialPath && initialContent}
        </AdminShell>
      </AdminI18nProvider>
    );
  }

  function Router() {
    const [href, setHref] = useState(initialPath);
    restoreRoute = setHref;
    navigation.router.push.mockImplementation((target: string) => {
      if (target === window.location.pathname + window.location.search) {
        setHref(target);
        return;
      }
      let resolve!: () => void;
      const promise = new Promise<void>((ready) => {
        resolve = ready;
      });
      requests.set(target, { promise, resolve });
      setHref(target);
    });
    return (
      // Vitest resolves the public package entry, without the App Router's webpack alias.
      <RouterContext.Provider value={navigation.router as unknown as NextRouter}>
        <Suspense fallback={null}>
          <Destination href={href} />
        </Suspense>
      </RouterContext.Provider>
    );
  }

  return {
    ...render(<Router />),
    async commit(href: string) {
      await act(async () => requests.get(href)?.resolve());
    },
    async restore(href: string) {
      await act(async () => {
        startTransition(() => restoreRoute(href));
      });
    },
  };
}

function clickModified(link: HTMLElement, modifiers: { ctrlKey?: boolean; metaKey?: boolean }) {
  // Suppress jsdom's attempted new-tab navigation after Link has handled the event.
  document.addEventListener("click", (event) => event.preventDefault(), { once: true });
  fireEvent.click(link, modifiers);
}

async function clickRoute(link: HTMLElement) {
  await act(async () => {
    fireEvent.click(link);
  });
}

describe("shared detail back navigation", () => {
  const href = "/users?page=2#results";
  const heading = (
    <DetailPageHeading title="User details" backHref={href} backLabel="Back to users" />
  );

  it("uses the shell transition once and preserves the query and hash in the parent href", async () => {
    const { commit } = renderNavigableShell("/users/record-id", heading);
    const link = screen.getByRole("link", { name: "Back to users" });
    const header = within(
      screen.getByRole("navigation", { name: "Breadcrumbs" }).closest("header")!,
    );
    expect(link).toHaveAttribute("href", href);
    clickModified(link, { metaKey: true });
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(header.queryByText("Opening page…")).not.toBeInTheDocument();

    await clickRoute(link);
    expect(navigation.router.push).toHaveBeenCalledExactlyOnceWith(href, { scroll: undefined });
    expect(header.getByRole("status")).toHaveTextContent("Opening page…");
    expect(header.getByText("User details")).toHaveAttribute("aria-current", "page");
    await commit(href);
    expect(header.queryByText("Opening page…")).not.toBeInTheDocument();
    expect(header.getByText("Users")).toHaveAttribute("aria-current", "page");
    expect(window.location.search).toBe("?page=2");
    expect(window.location.hash).toBe("#results");
  });

  it("falls back to native Link navigation outside the shell", () => {
    render(
      <RouterContext.Provider value={navigation.router as unknown as NextRouter}>
        {heading}
      </RouterContext.Provider>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Back to users" }));
    expect(navigation.router.push).toHaveBeenCalledExactlyOnceWith(href, { scroll: true });
  });
});

describe("admin account identity", () => {
  it("binds JSON and file requests to the rendered session and asks for a reload", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ error: "session_changed" }, { status: 409 })),
    );
    vi.stubGlobal("fetch", fetcher);
    renderShell();

    await act(async () => {
      await expect(api("admin/users", { method: "POST", body: "{}" })).rejects.toThrow(
        "session_changed",
      );
      await expect(apiFile("admin/memberships/fixture/contract/pdf?locale=en")).rejects.toThrow(
        "session_changed",
      );
    });
    const [[jsonPath, jsonInit], [filePath, fileInit]] = fetcher.mock.calls;
    expect(jsonPath).toBe("/api/backend/admin/users");
    const jsonHeaders = new Headers(jsonInit?.headers);
    expect(jsonHeaders.get("x-nfv-admin-session")).toBe("test-session");
    expect(jsonHeaders.get("x-nfv-admin-request")).toBe("1");
    expect(filePath).toBe("/api/backend/admin/memberships/fixture/contract/pdf?locale=en");
    expect(Object.fromEntries(new Headers(fileInit?.headers))).toEqual({
      "x-nfv-admin-session": "test-session",
    });
    const feedback = screen.getByRole("alert");
    expect(feedback).toHaveTextContent("The admin session changed");
    expect(within(feedback).getByRole("button", { name: "Reload page" })).toBeVisible();
    expect(screen.queryByText("Page content")).toBeNull();
  });

  it("retains the original page binding if a partial navigation renders a different login", async () => {
    const user = { name: "Admin", email: null, login_phone_number: null };
    const shell = (sessionBinding: string) => (
      <AdminI18nProvider initialLocale="en">
        <AdminShell key={sessionBinding} user={user} sessionBinding={sessionBinding}>
          <div>Page content</div>
        </AdminShell>
      </AdminI18nProvider>
    );
    const { rerender } = render(shell("a"));
    rerender(shell("b"));
    expect(screen.getByRole("alert")).toHaveTextContent("The admin session changed");

    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetcher);
    await api("admin/users");
    const [path, init] = fetcher.mock.calls[0];
    expect(path).toBe("/api/backend/admin/users");
    expect(new Headers(init?.headers).get("x-nfv-admin-session")).toBe("a");
  });

  it("displays the login phone when the account has no email", () => {
    renderShell("/dashboard", "en", {
      name: "Nguyễn An",
      email: null,
      login_phone_number: "+84912345678",
    });

    fireEvent.click(screen.getByRole("button", { name: "Admin account" }));
    expect(screen.getByRole("menu")).toHaveTextContent("Nguyễn An");
    expect(screen.getByText("+84912345678")).toBeVisible();
  });

  it("prefers email when the account also has a login phone", () => {
    renderShell("/dashboard", "en", {
      name: "Nguyễn An",
      email: "admin@example.com",
      login_phone_number: "+84912345678",
    });

    fireEvent.click(screen.getByRole("button", { name: "Admin account" }));
    expect(screen.getByRole("menu")).toHaveTextContent("Nguyễn An");
    expect(screen.getByText("admin@example.com")).toBeVisible();
    expect(screen.queryByText("+84912345678")).not.toBeInTheDocument();
  });

  it("renders only the name when neither identifier is present", () => {
    renderShell("/dashboard", "en", {
      name: "Nguyễn An",
      email: null,
      login_phone_number: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "Admin account" }));
    expect(screen.getByRole("menu")).toHaveTextContent("Nguyễn An");
    expect(screen.queryByText("+84912345678")).not.toBeInTheDocument();
  });

  it("keeps a label when the account has no display details", () => {
    renderShell("/dashboard", "en", {
      name: "",
      email: null,
      login_phone_number: null,
    });

    expect(screen.getByRole("button", { name: "Admin account" })).toHaveAttribute(
      "title",
      "NFV Admin",
    );
    fireEvent.click(screen.getByRole("button", { name: "Admin account" }));
    expect(screen.getByRole("menu")).toHaveTextContent("NFV Admin");
  });
});

describe("admin header breadcrumbs", () => {
  it("uses the shared 13px rule for child labels and limits the desktop 16px rule to root titles", () => {
    const css = readFileSync("components/admin-shell.module.css", "utf8");
    expect(css).toMatch(
      /:is\(\.breadcrumbLink, \.breadcrumbCurrent\)\s*\{[^}]*font-size: var\(--mantine-font-size-md\)/,
    );
    expect(css).toMatch(
      /\.breadcrumbs \.breadcrumbRoot\s*\{[^}]*font-size: var\(--mantine-font-size-lg\)/,
    );
    expect(css).not.toMatch(
      /\.breadcrumbs \.breadcrumbCurrent\s*\{[^}]*font-size: var\(--mantine-font-size-lg\)/,
    );
  });

  it.each([
    ["/users", "vi", "Người dùng", "Đường dẫn điều hướng"],
    ["/store-catalog", "en", "Products", "Breadcrumbs"],
    ["/membership-catalog", "en", "CSA packages", "Breadcrumbs"],
  ] as const)("shows the localized root context for %s", (pathname, locale, label, landmark) => {
    renderShell(pathname, locale);
    const header = screen.getByRole("banner");
    const trail = within(header).getByRole("navigation", { name: landmark });
    expect(trail).toHaveTextContent(label);
    const title = within(trail).getByText(label);
    expect(title).toHaveAttribute("aria-current", "page");
    expect(title).toHaveClass(headerClasses.breadcrumbRoot);
    expect(within(trail).queryByRole("link")).not.toBeInTheDocument();
    expect(header).not.toHaveTextContent("NFV Admin");
    expect(screen.getByRole("link", { name: "NFV Admin" })).toHaveAttribute("href", "/dashboard");
  });

  it("provides a real parent link and localized context on direct child entry", () => {
    renderShell("/users/record-id", "vi");
    const trail = screen.getByRole("navigation", { name: "Đường dẫn điều hướng" });
    expect(within(trail).getByRole("link", { name: "Người dùng" })).toHaveAttribute(
      "href",
      "/users",
    );
    const current = within(trail).getByText("Chi tiết người dùng");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).not.toHaveClass(headerClasses.breadcrumbRoot);
    expect(
      within(trail).queryByRole("link", { name: "Chi tiết người dùng" }),
    ).not.toBeInTheDocument();
    expect(trail).not.toHaveTextContent("record-id");
  });

  it("provides an overflow destination even when there is just one ancestor", async () => {
    renderShell("/csa-purchase-requests/record-id", "vi");
    const trail = within(screen.getByRole("navigation", { name: "Đường dẫn điều hướng" }));
    const trigger = trail.getByRole("button", { name: "Hiện các trang cấp trên" });
    fireEvent.click(trigger);
    expect(await screen.findByRole("menuitem", { name: "Yêu cầu mua CSA" })).toHaveAttribute(
      "href",
      "/csa-purchase-requests",
    );
  });

  it("offers deep ancestors in a keyboard-accessible overflow menu", async () => {
    renderShell("/store-catalog/products/record-id/edit", "vi");
    const header = within(screen.getByRole("banner"));
    const trail = within(header.getByRole("navigation", { name: "Đường dẫn điều hướng" }));
    expect(trail.getByRole("link", { name: "Sản phẩm" })).toHaveAttribute(
      "href",
      "/store-catalog/products",
    );
    expect(trail.getByRole("link", { name: "Chi tiết sản phẩm" })).toHaveAttribute(
      "href",
      "/store-catalog/products/record-id",
    );
    expect(trail.getByText("Chỉnh sửa")).toHaveAttribute("aria-current", "page");
    expect(trail.queryByRole("link", { name: "Chỉnh sửa" })).not.toBeInTheDocument();
    expect(header.getByRole("radiogroup", { name: "Ngôn ngữ" })).toBeInTheDocument();
    expect(header.getByRole("button", { name: "Tài khoản quản trị" })).toBeInTheDocument();
    const trigger = trail.getByRole("button", { name: "Hiện các trang cấp trên" });
    trigger.focus();
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const parent = within(menu).getByRole("menuitem", { name: "Chi tiết sản phẩm" });
    const root = within(menu).getByRole("menuitem", { name: "Sản phẩm" });
    expect(root).toHaveAttribute("href", "/store-catalog/products");
    expect(parent).toHaveAttribute("href", "/store-catalog/products/record-id");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(root).toHaveFocus();
    fireEvent.keyDown(root, { key: "ArrowDown" });
    expect(parent).toHaveFocus();
    fireEvent.keyDown(parent, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("updates the localized navigation context when the language changes", () => {
    renderShell("/users");
    const header = within(screen.getByRole("banner"));
    fireEvent.click(header.getByRole("radio", { name: "VI" }));
    expect(header.getByRole("navigation", { name: "Đường dẫn điều hướng" })).toHaveTextContent(
      "Người dùng",
    );
    expect(header.queryByText("Users")).not.toBeInTheDocument();
  });

  it("closes a breadcrumb menu when the query or pathname changes without carrying it back", async () => {
    const path = "/store-catalog/products/record-id/edit";
    const shell = () => (
      <AdminI18nProvider initialLocale="en">
        <AdminShell
          user={{ name: "Admin", email: null, login_phone_number: null }}
          sessionBinding="test-session"
        >
          <div>Page content</div>
        </AdminShell>
      </AdminI18nProvider>
    );
    navigation.pathname = path;
    const { rerender } = render(shell());
    const open = () =>
      fireEvent.click(screen.getByRole("button", { name: "Show ancestor screens" }));
    open();
    expect(await screen.findByRole("menu")).toBeVisible();

    navigation.search = "page=2";
    rerender(shell());
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    open();
    expect(await screen.findByRole("menu")).toBeVisible();

    navigation.pathname = "/store-catalog/products/another-id/edit";
    rerender(shell());
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    navigation.pathname = path;
    navigation.search = "";
    rerender(shell());
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes overflow and restores focus to the visible ancestor when the trigger is hidden", async () => {
    const observers: TestResizeObserver[] = [];
    class TestResizeObserver implements ResizeObserver {
      targets = new Set<Element>();
      constructor(private callback: ResizeObserverCallback) {
        observers.push(this);
      }
      observe(element: Element) {
        this.targets.add(element);
      }
      unobserve(element: Element) {
        this.targets.delete(element);
      }
      disconnect() {
        this.targets.clear();
      }
      resize() {
        this.callback([], this);
      }
    }
    window.ResizeObserver = TestResizeObserver;
    renderShell("/store-catalog/products/record-id/edit", "vi");
    const trail = within(screen.getByRole("navigation", { name: "Đường dẫn điều hướng" }));
    const first = trail.getByRole("link", { name: "Sản phẩm" });
    const trigger = trail.getByRole("button", { name: "Hiện các trang cấp trên" });
    trigger.focus();
    fireEvent.click(trigger);
    const item = await screen.findByRole("menuitem", { name: "Sản phẩm" });
    item.focus();

    // Model the browser removing the trigger's box when its CSS container query changes.
    const watchingTrigger = observers.filter((observer) => observer.targets.has(trigger));
    expect(watchingTrigger.length).toBeGreaterThan(0);
    act(() => watchingTrigger.forEach((observer) => observer.resize()));

    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(first).toHaveFocus();
  });

  it("hides a registered record label after the route changes or the session invalidates", () => {
    const user = { name: "Admin", email: null, login_phone_number: null };
    const recordLabel = "Nguyễn Thị An ở tổ hợp tác sản xuất nông nghiệp hữu cơ";
    const shell = (pathname: string) => (
      <AdminI18nProvider initialLocale="vi">
        <AdminShell user={user} sessionBinding="test-session">
          <AdminBreadcrumbForRoute
            pathname={pathname}
            items={[{ label: "Người dùng", href: "/users?page=3" }, { label: recordLabel }]}
          />
        </AdminShell>
      </AdminI18nProvider>
    );
    navigation.pathname = "/users/first";
    const { rerender } = render(shell("/users/first"));
    const header = within(screen.getByRole("banner"));
    expect(header.getByText(recordLabel)).toHaveAttribute("title", recordLabel);
    expect(header.getByRole("link", { name: "Người dùng" })).toHaveAttribute(
      "href",
      "/users?page=3",
    );

    navigation.pathname = "/users/second";
    rerender(shell("/users/first"));
    expect(header.getByText("Chi tiết người dùng")).toHaveAttribute("aria-current", "page");
    expect(header.queryByText(recordLabel)).not.toBeInTheDocument();

    rerender(shell("/users/second"));
    expect(header.getByText(recordLabel)).toBeInTheDocument();
    act(() =>
      window.dispatchEvent(
        new CustomEvent(ADMIN_SESSION_CHANGED_EVENT, { detail: "test-session" }),
      ),
    );
    expect(header.queryByText(recordLabel)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("admin sidebar navigation", () => {
  function mobileViewport() {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query.includes("47.99"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  it("shows pending feedback and waits for the last committed route before changing the active item", async () => {
    const { commit } = renderNavigableShell();
    const header = within(screen.getByRole("banner"));
    const sidebar = within(screen.getByRole("navigation", { name: "Administration" }));
    const overview = sidebar.getByRole("link", { name: "Overview" });
    const users = sidebar.getByRole("link", { name: "Users" });
    const orders = sidebar.getByRole("link", { name: "Orders" });
    clickModified(users, { ctrlKey: true });
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(header.queryByText("Opening page…")).not.toBeInTheDocument();

    await clickRoute(users);
    expect(header.getByRole("status")).toHaveTextContent("Opening page…");
    expect(overview).toHaveAttribute("aria-current", "page");
    expect(users).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Content at /dashboard")).toBeVisible();

    await clickRoute(orders);
    expect(navigation.router.push.mock.calls.map(([href]) => href)).toEqual([
      "/users",
      "/store-orders",
    ]);
    await commit("/store-orders");
    expect(header.queryByText("Opening page…")).not.toBeInTheDocument();
    expect(header.getByText("Orders")).toHaveAttribute("aria-current", "page");
    expect(orders).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Content at /dashboard")).not.toBeInTheDocument();
    await commit("/users");
    expect(orders).toHaveAttribute("aria-current", "page");
  });

  it("keeps feedback in the header when the collapsed menu closes", async () => {
    const { commit } = renderNavigableShell();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    fireEvent.click(screen.getByRole("button", { name: "Store" }));
    await clickRoute(screen.getByRole("menuitem", { name: "Orders" }));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(within(screen.getByRole("banner")).getByRole("status")).toHaveTextContent(
      "Opening page…",
    );
    await commit("/store-orders");
    expect(screen.queryByText("Opening page…")).not.toBeInTheDocument();
  });

  it("drops pending feedback when a history restoration supersedes the transition", async () => {
    const { commit, restore } = renderNavigableShell("/users");
    const header = within(screen.getByRole("banner"));
    await clickRoute(screen.getByRole("link", { name: "Orders" }));
    expect(header.getByRole("status")).toHaveTextContent("Opening page…");
    await restore("/dashboard");
    expect(header.queryByText("Opening page…")).not.toBeInTheDocument();
    expect(header.getByText("Overview")).toHaveAttribute("aria-current", "page");
    await commit("/store-orders");
    expect(screen.queryByText("Content at /store-orders")).not.toBeInTheDocument();
  });

  it("lets a click on the current route supersede a pending destination through native Link", async () => {
    const { commit } = renderNavigableShell();
    const sidebar = within(screen.getByRole("navigation", { name: "Administration" }));
    await clickRoute(sidebar.getByRole("link", { name: "Users" }));
    expect(screen.getByText("Opening page…")).toBeInTheDocument();

    const overview = sidebar.getByRole("link", { name: "Overview" });
    await clickRoute(overview);
    expect(navigation.router.push.mock.calls.map(([href]) => href)).toEqual([
      "/users",
      "/dashboard",
    ]);
    expect(screen.queryByText("Opening page…")).not.toBeInTheDocument();
    await commit("/users");
    expect(overview).toHaveAttribute("aria-current", "page");
  });

  it("uses the same transition for a parent breadcrumb and removes feedback on session invalidation", async () => {
    const { commit } = renderNavigableShell("/users/record-id");
    const header = within(screen.getByRole("banner"));
    await clickRoute(header.getByRole("link", { name: "Users" }));
    expect(header.getByRole("status")).toHaveTextContent("Opening page…");
    expect(header.getByText("User details")).toHaveAttribute("aria-current", "page");
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(ADMIN_SESSION_CHANGED_EVENT, { detail: "test-session" }),
      );
    });
    expect(screen.getByRole("alert")).toHaveTextContent("The admin session changed");
    expect(header.queryByText("Opening page…")).not.toBeInTheDocument();
    await commit("/users");
    expect(screen.queryByText("Content at /users")).not.toBeInTheDocument();
  });
  it("keeps all current workflow destinations in one localized model", () => {
    const sections = adminNavigation(adminDictionaries.en);
    const routes = sections.flatMap((section) => section.items.map((item) => item.href));
    expect(routes).toEqual([
      "/dashboard",
      "/store-orders",
      "/store-catalog/products",
      "/store-catalog/categories",
      "/csa-rounds",
      "/csa-purchase-requests",
      "/csa-customers",
      "/membership-catalog/packages",
      "/membership-catalog/products",
      "/csa-terms",
      "/farms",
      "/tracker-farms",
      "/csa-coupons",
      "/users",
      "/rewards",
      "/redemptions",
      "/workshops",
      "/testimonials",
      "/shipping-settings",
      "/membership-payment-settings",
      "/settings",
    ]);
    expect(new Set(routes).size).toBe(routes.length);
    expect(sections.map((section) => section.key)).toEqual([
      "overview",
      "store",
      "csa",
      "farms",
      "promotions",
      "community",
      "website",
      "settings",
    ]);
  });
  it.each([
    ["/farms/a", "/farms", "farms"],
    ["/store-orders/a", "/store-orders", "store"],
    ["/store-catalog/products/new", "/store-catalog/products", "store"],
    ["/membership-catalog/packages/a/edit", "/membership-catalog/packages", "csa"],
    ["/csa-coupons/a", "/csa-coupons", "promotions"],
    ["/points/a", "/users", "community"],
    ["/memberships/assign", "/csa-customers", "csa"],
  ])("resolves nested path %s to %s in %s", (path, href, group) => {
    const sections = adminNavigation(adminDictionaries.en);
    expect(isActiveAdminRoute(path, href)).toBe(true);
    expect(activeAdminSection(path, sections)?.key).toBe(group);
  });
  it("shows real destinations without section accordion controls", () => {
    renderShell();
    const users = screen.getByRole("link", { name: "Users" });
    expect(users).toHaveAttribute("href", "/users");
    expect(users.querySelector("svg")).toHaveClass("tabler-icon-users");
    expect(screen.getByRole("link", { name: "CSA round configurations" })).toHaveAttribute(
      "href",
      "/csa-rounds",
    );
    expect(screen.getByRole("link", { name: "Payment settings" })).toHaveAttribute(
      "href",
      "/membership-payment-settings",
    );
    expect(screen.queryByRole("link", { name: "Manage points" })).toBeNull();
    expect(screen.queryByRole("button", { name: "CSA" })).toBeNull();
  });
  it("localizes payment settings", () => {
    renderShell("/dashboard", "vi");
    expect(screen.getByRole("link", { name: "Cài đặt thanh toán" })).toHaveAttribute(
      "href",
      "/membership-payment-settings",
    );
  });
  it.each([
    ["/membership-catalog/packages/a/edit", "CSA packages"],
    ["/store-catalog/products/new", "Products"],
    ["/farms/a", "Farm list"],
    ["/testimonials/a/edit", "Testimonials"],
    ["/points/a", "Users"],
    ["/memberships/a", "CSA customers"],
  ])("highlights exactly one item for %s", (pathname, label) => {
    renderShell(pathname);
    const sidebar = within(screen.getByRole("navigation", { name: "Administration" }));
    expect(sidebar.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    expect(
      sidebar.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
  });
  it("persists desktop collapse and restores a saved preference", async () => {
    const { container, unmount } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(container.querySelector("[data-sidebar]")).toHaveAttribute("data-sidebar", "collapsed");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    expect(window.localStorage.getItem("nfv-admin-sidebar-collapsed")).toBe("true");
    unmount();
    renderShell();
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  });
  it("ignores an invalid collapse preference", () => {
    window.localStorage.setItem("nfv-admin-sidebar-collapsed", "sometimes");
    renderShell();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  });
  it("opens a keyboard accessible collapsed menu and closes on Escape", async () => {
    renderShell("/csa-customers/new");
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    const trigger = screen.getByRole("button", { name: "CSA" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "CSA customers" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("menuitem", { name: "CSA customers" })).toBeNull(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it("excludes the closed mobile navigation from accessibility and keyboard traversal", async () => {
    mobileViewport();
    const { container } = renderShell();
    await waitFor(() =>
      expect(container.querySelector(".mantine-AppShell-navbar")).toHaveAttribute("inert"),
    );
    expect(container.querySelector(".mantine-AppShell-navbar")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.queryByRole("navigation", { name: "Administration" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it.each(["close", "escape", "outside", "route"])(
    "closes mobile navigation by %s and restores focus",
    async (action) => {
      mobileViewport();
      const shell = action === "route" ? renderNavigableShell("/farms/a") : null;
      const { container } = shell ?? renderShell("/farms/a");
      const trigger = screen.getByRole("button", { name: "Open navigation" });
      trigger.focus();
      fireEvent.click(trigger);
      const dialog = await screen.findByRole("dialog");
      const close = within(dialog).getByRole("button", { name: "Close navigation" });
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(within(dialog).getByRole("link", { name: "Farm list" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      if (action === "close") fireEvent.click(close);
      if (action === "escape") fireEvent.keyDown(close, { key: "Escape" });
      if (action === "outside") fireEvent.click(document.querySelector(".mantine-Drawer-overlay")!);
      if (action === "route") {
        const link = within(dialog).getByRole("link", { name: "Farm list" });
        clickModified(link, { metaKey: true });
        expect(dialog).toBeVisible();
        await clickRoute(link);
        expect(within(screen.getByRole("banner")).getByRole("status")).toHaveTextContent(
          "Opening page…",
        );
      }
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(container.querySelector(".mantine-AppShell-navbar")).toHaveAttribute("inert");
      if (shell) {
        await shell.commit("/farms");
        expect(screen.queryByText("Opening page…")).not.toBeInTheDocument();
      }
    },
  );
  it("keeps keyboard focus within the open mobile Drawer", async () => {
    mobileViewport();
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const dialog = await screen.findByRole("dialog");
    const first = within(dialog).getByRole("link", { name: "NFV Admin" });
    const last = within(dialog).getByRole("link", { name: "Website information" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("anchors the mobile navigation Drawer on the left at 280px", async () => {
    mobileViewport();
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const dialog = await screen.findByRole("dialog");
    const drawer = dialog.closest<HTMLElement>(".mantine-Drawer-root");
    expect(drawer).not.toBeNull();
    expect(drawer).toHaveStyle({ "--drawer-size": "calc(17.5rem * var(--mantine-scale))" });
    // Mantine aligns left by default and emits flex-end for a right-side Drawer.
    expect(drawer?.style.getPropertyValue("--drawer-justify")).toBe("");
  });
});
