import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminShell } from "@/components/admin-shell";
import { activeAdminSection, adminNavigation, isActiveAdminRoute } from "@/lib/admin-navigation";
import { adminDictionaries } from "@/lib/admin-i18n";
import { ADMIN_SESSION_CHANGED_EVENT, api, apiFile } from "@/lib/client-api";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.adminPageSession;
  navigation.pathname = "/dashboard";
  vi.clearAllMocks();
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

describe("admin account identity", () => {
  it("binds JSON and file requests to the rendered session and asks for a reload", async () => {
    const fetcher = vi.fn(() =>
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
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/backend/admin/users",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-nfv-admin-session": "test-session",
          "X-NFV-Admin-Request": "1",
        }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/backend/admin/memberships/fixture/contract/pdf?locale=en",
      expect.objectContaining({ headers: { "x-nfv-admin-session": "test-session" } }),
    );
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

    const fetcher = vi.fn(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetcher);
    await api("admin/users");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/backend/admin/users",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-nfv-admin-session": "a" }),
      }),
    );
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
  it.each([
    ["/users", "vi", "Người dùng", "Đường dẫn điều hướng"],
    ["/store-catalog", "en", "Products", "Breadcrumbs"],
    ["/membership-catalog", "en", "CSA packages", "Breadcrumbs"],
  ] as const)("shows the localized root context for %s", (pathname, locale, label, landmark) => {
    renderShell(pathname, locale);
    const header = screen.getByRole("banner");
    const trail = within(header).getByRole("navigation", { name: landmark });
    expect(trail).toHaveTextContent(label);
    expect(within(trail).getByText(label)).toHaveAttribute("aria-current", "page");
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
    expect(within(trail).getByText("Chi tiết người dùng")).toHaveAttribute("aria-current", "page");
    expect(
      within(trail).queryByRole("link", { name: "Chi tiết người dùng" }),
    ).not.toBeInTheDocument();
    expect(trail).not.toHaveTextContent("record-id");
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
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/users");
    expect(screen.getByRole("link", { name: "CSA rounds" })).toHaveAttribute("href", "/csa-rounds");
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
      const { container } = renderShell("/farms/a");
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
        link.addEventListener("click", (event) => event.preventDefault(), { once: true });
        fireEvent.click(link);
      }
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(container.querySelector(".mantine-AppShell-navbar")).toHaveAttribute("inert");
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
