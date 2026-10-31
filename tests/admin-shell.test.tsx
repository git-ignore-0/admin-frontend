import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminShell } from "@/components/admin-shell";
import { activeAdminSection, adminNavigation, isActiveAdminRoute } from "@/lib/admin-navigation";
import { adminDictionaries } from "@/lib/admin-i18n";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  navigation.pathname = "/dashboard";
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  window.localStorage.clear();
});

function renderShell(pathname = "/dashboard", locale: "en" | "vi" = "en") {
  navigation.pathname = pathname;
  return render(
    <AdminI18nProvider initialLocale={locale}>
      <AdminShell user={{ email: "admin@example.com", name: "Admin" }}>
        <div>Page content</div>
      </AdminShell>
    </AdminI18nProvider>,
  );
}

describe("admin sidebar navigation", () => {
  it("keeps every Admin route in one navigation model", () => {
    const sections = adminNavigation(adminDictionaries.en);
    const routes = sections.flatMap((section) => section.items.map((item) => item.href));

    expect(routes).toEqual([
      "/dashboard",
      "/users",
      "/points",
      "/rewards",
      "/redemptions",
      "/csa-customers",
      "/csa-purchase-requests",
      "/csa-coupons",
      "/csa-terms",
      "/membership-catalog",
      "/store-catalog",
      "/shipping-settings",
      "/farms",
      "/tracker-farms",
      "/settings",
      "/membership-payment-settings",
      "/workshops",
      "/testimonials",
    ]);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it.each([
    ["/farms/24803641-2dce-4cac-8fc4-91e55f03e95f", "/farms", "farms"],
    ["/store-catalog/products/new", "/store-catalog", "store"],
    ["/membership-catalog/packages/123/edit", "/membership-catalog", "csa"],
  ])("resolves nested path %s to %s in section %s", (pathname, activeHref, sectionKey) => {
    const sections = adminNavigation(adminDictionaries.en);

    expect(isActiveAdminRoute(pathname, activeHref)).toBe(true);
    expect(activeAdminSection(pathname, sections)?.key).toBe(sectionKey);
  });

  it("shows every route in expanded sections without accordion controls", () => {
    renderShell();

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/users");
    expect(screen.getByRole("link", { name: "Manage points" })).toHaveAttribute("href", "/points");
    expect(screen.getByRole("link", { name: "Rewards" })).toHaveAttribute("href", "/rewards");
    expect(screen.getByRole("link", { name: "CSA purchase requests" })).toHaveAttribute(
      "href",
      "/csa-purchase-requests",
    );
    expect(screen.getByRole("link", { name: "Farm list" })).toHaveAttribute("href", "/farms");
    expect(screen.getByRole("link", { name: "Payment settings" })).toHaveAttribute(
      "href",
      "/membership-payment-settings",
    );
    expect(screen.queryByRole("button", { name: "CSA" })).toBeNull();
  });

  it("uses the localized payment settings label", () => {
    renderShell("/dashboard", "vi");

    expect(screen.getByRole("link", { name: "Cài đặt thanh toán" })).toHaveAttribute(
      "href",
      "/membership-payment-settings",
    );
    expect(screen.queryByText("Thanh toán CSA")).toBeNull();
  });

  it.each([
    ["/membership-catalog/packages/123/edit", "CSA package catalog"],
    ["/store-catalog/products/new", "Store catalog"],
    ["/farms/24803641-2dce-4cac-8fc4-91e55f03e95f", "Farm list"],
    ["/testimonials/testimonial-id/edit", "Testimonials"],
  ])("highlights the owning item for nested path %s", (pathname, linkName) => {
    renderShell(pathname);

    const activeLink = screen.getByRole("link", { name: linkName });
    expect(activeLink).toHaveAttribute("aria-current", "page");
    expect(activeLink).toHaveClass("active");
  });

  it("collapses the desktop sidebar, updates its label, and persists the preference", () => {
    const { container } = renderShell();
    const collapse = screen.getByRole("button", { name: "Collapse sidebar" });

    fireEvent.click(collapse);

    expect(container.querySelector(".admin-shell")).toHaveAttribute("data-sidebar", "collapsed");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    expect(window.localStorage.getItem("nfv-admin-sidebar-collapsed")).toBe("true");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("title", "Overview");
  });

  it("restores a valid stored collapse preference", async () => {
    window.localStorage.setItem("nfv-admin-sidebar-collapsed", "true");
    const { container } = renderShell();

    await waitFor(() =>
      expect(container.querySelector(".admin-shell")).toHaveAttribute("data-sidebar", "collapsed"),
    );
  });

  it("falls back to expanded when the stored preference is invalid", () => {
    window.localStorage.setItem("nfv-admin-sidebar-collapsed", "sometimes");
    const { container } = renderShell();

    expect(container.querySelector(".admin-shell")).toHaveAttribute("data-sidebar", "expanded");
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  });

  it("opens one accessible grouped flyout while collapsed and closes it with Escape", () => {
    const { container } = renderShell("/csa-customers/new");
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    const navigationRegion = screen.getByRole("navigation", { name: "Administration" });
    const csaToggle = within(navigationRegion).getByRole("button", { name: "CSA" });
    fireEvent.click(csaToggle);

    expect(csaToggle).toHaveAttribute("aria-expanded", "true");
    const activeLink = within(navigationRegion).getByRole("link", { name: "CSA customers" });
    expect(activeLink).toHaveAttribute("aria-current", "page");

    fireEvent.keyDown(container.querySelector(".sidebar")!, { key: "Escape" });
    expect(csaToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(navigationRegion).queryByRole("link", { name: "CSA customers" })).toBeNull();
  });

  it("keeps the mobile drawer closed until its trigger is used", () => {
    const { container } = renderShell();
    const trigger = screen.getByRole("button", { name: "Open navigation" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector(".sidebar")).toHaveAttribute("data-mobile-open", "false");
    expect(screen.queryByRole("button", { name: "Close navigation" })).toBeNull();
  });

  it("removes the closed mobile drawer from keyboard and accessibility navigation", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        media: "(max-width: 820px)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );
    const { container } = renderShell();
    const sidebar = container.querySelector(".sidebar");

    await waitFor(() => expect(sidebar).toHaveAttribute("inert"));
    expect(sidebar).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(sidebar).not.toHaveAttribute("inert");
    expect(sidebar).not.toHaveAttribute("aria-hidden");
  });

  it("moves focus into the mobile drawer and restores it after the close button", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);

    const close = screen.getByRole("button", { name: "Close navigation" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(close).toHaveFocus();

    fireEvent.click(close);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("keeps Tab focus inside the open mobile drawer", () => {
    const { container } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const sidebar = container.querySelector(".sidebar") as HTMLElement;
    const first = within(sidebar).getByRole("link", { name: "NFV Admin" });
    const logout = screen.getByRole("button", { name: "Sign out" });

    logout.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(logout).toHaveFocus();
  });

  it("closes the mobile drawer with Escape and restores trigger focus", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes the mobile drawer from its backdrop", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);

    fireEvent.click(screen.getByTestId("sidebar-backdrop"));

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes the mobile drawer after selecting an active nested route", () => {
    renderShell("/farms/24803641-2dce-4cac-8fc4-91e55f03e95f");
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);

    const activeLink = screen.getByRole("link", { name: "Farm list" });
    expect(activeLink).toHaveAttribute("aria-current", "page");
    activeLink.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(activeLink);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("exposes stable layout hooks for the responsive sidebar composition", () => {
    const { container } = renderShell();
    const shell = container.querySelector(".admin-shell")!;

    expect(shell).toHaveAttribute("data-sidebar", "expanded");
    expect(container.querySelector(".sidebar-header .brand-mark")).not.toBeNull();
    expect(container.querySelector(".nav.nav-scroll")).not.toBeNull();
    expect(container.querySelector(".sidebar-footer")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "data-tooltip",
      "Overview",
    );
    fireEvent.click(screen.getByRole("button", { name: "CSA" }));
    expect(container.querySelector(".nav-flyout")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(container.querySelector('.sidebar[data-mobile-open="true"]')).not.toBeNull();
    expect(screen.getByTestId("sidebar-backdrop")).toHaveClass("sidebar-backdrop");
  });
});
