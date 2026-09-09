import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminShell } from "@/components/admin-shell";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  navigation.pathname = "/dashboard";
  vi.clearAllMocks();
});

function renderShell(pathname = "/dashboard") {
  navigation.pathname = pathname;
  return render(
    <AdminI18nProvider initialLocale="en">
      <AdminShell user={{ email: "admin@example.com", name: "Admin" }}>
        <div>Page content</div>
      </AdminShell>
    </AdminI18nProvider>,
  );
}

function group(name: string) {
  return screen.getByRole("button", { name });
}

describe("admin sidebar navigation", () => {
  it("renders direct links and the three collapsed navigation groups", () => {
    renderShell();

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/users");
    expect(group("Points & rewards")).toHaveAttribute("aria-expanded", "false");
    expect(group("CSA")).toHaveAttribute("aria-expanded", "false");
    expect(group("Website")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Rewards" })).toBeNull();
    expect(screen.queryByRole("link", { name: /catalog/i })).toBeNull();
  });

  it("opens and closes a group while preserving its real routes", () => {
    renderShell();
    const toggle = group("Points & rewards");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Manage points" })).toHaveAttribute("href", "/points");
    expect(screen.getByRole("link", { name: "Rewards" })).toHaveAttribute("href", "/rewards");
    expect(screen.getByRole("link", { name: "Redemptions" })).toHaveAttribute(
      "href",
      "/redemptions",
    );

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Rewards" })).toBeNull();
  });

  it("does not expose removed CSA request or payment navigation", () => {
    renderShell();
    fireEvent.click(group("CSA"));
    expect(screen.queryByRole("link", { name: /CSA requests/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /payment/i })).toBeNull();
    expect(screen.getByRole("link", { name: "CSA customers" })).toHaveAttribute(
      "href",
      "/csa-customers",
    );
    expect(screen.queryByRole("link", { name: /memberships/i })).toBeNull();
    expect(screen.queryByRole("link", { name: "Growth Tracker farms" })).toBeNull();
    expect(screen.getByRole("link", { name: "CSA package catalog" })).toHaveAttribute(
      "href",
      "/membership-catalog",
    );
  });

  it.each([
    ["/csa-customers/24803641-2dce-4cac-8fc4-91e55f03e95f", "CSA", "CSA customers"],
    ["/membership-catalog", "CSA", "CSA package catalog"],
    ["/membership-catalog/packages/123/edit", "CSA", "CSA package catalog"],
    ["/tracker-farms", "Website", "Growth Tracker farms"],
    ["/rewards", "Points & rewards", "Rewards"],
    ["/settings", "Website", "Website information"],
    ["/testimonials/testimonial-id/edit", "Website", "Testimonials"],
  ])("opens the owning group for %s and highlights its item", (pathname, groupName, linkName) => {
    renderShell(pathname);

    expect(group(groupName)).toHaveAttribute("aria-expanded", "true");
    const activeLink = screen.getByRole("link", { name: linkName });
    expect(activeLink).toHaveAttribute("aria-current", "page");
    expect(activeLink).toHaveClass("active");
  });

  it("keeps the grouped navigation usable and closable at a mobile viewport", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    renderShell("/csa-customers/new");

    const navigationRegion = screen.getByRole("navigation", { name: "Administration" });
    const csaToggle = within(navigationRegion).getByRole("button", { name: "CSA" });
    expect(csaToggle).toHaveAttribute("aria-expanded", "true");
    expect(within(navigationRegion).getByRole("link", { name: "CSA customers" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    fireEvent.click(csaToggle);
    expect(csaToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(navigationRegion).queryByRole("link", { name: "CSA customers" })).toBeNull();
  });
});
