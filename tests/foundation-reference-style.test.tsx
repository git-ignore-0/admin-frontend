import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminUiProvider } from "@/components/admin-ui-provider";
import { AdminShell } from "@/components/admin-shell";
vi.mock("next/navigation", () => ({
  usePathname: () => "/users",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.adminPageSession;
  window.localStorage.clear();
});
it("applies the reference text/background colors to Mantine and legacy pages from the same provider", () => {
  render(
    <AdminI18nProvider initialLocale="en">
      <AdminUiProvider>
        <p>Content</p>
      </AdminUiProvider>
    </AdminI18nProvider>,
  );
  const root = getComputedStyle(document.documentElement);
  expect(root.getPropertyValue("--mantine-color-body").trim()).toBe("#f7f8fa");
  expect(root.getPropertyValue("--mantine-color-text").trim()).toBe("#202938");
  expect(root.getPropertyValue("--mantine-color-dimmed").trim()).toBe("#5a6676");
  expect(root.getPropertyValue("--background").trim()).toBe("#f7f8fa");
  expect(root.getPropertyValue("--text").trim()).toBe("#202938");
});
it("keeps account identity only in the top-right menu, without a duplicate sidebar account", () => {
  render(
    <AdminI18nProvider initialLocale="en">
      <AdminShell
        sessionBinding="reference"
        user={{ name: "Garden Admin", email: "garden@example.com", login_phone_number: null }}
      >
        <p>Content</p>
      </AdminShell>
    </AdminI18nProvider>,
  );
  expect(screen.queryByRole("region", { name: "Admin account" })).toBeNull();
  const trigger = screen.getByRole("button", { name: "Admin account" });
  expect(trigger.closest(".mantine-AppShell-header")).toBeTruthy();
  fireEvent.click(trigger);
  const menu = screen.getByRole("menu");
  expect(menu).toHaveTextContent("Garden Admin");
  expect(within(menu).getByText("garden@example.com")).toBeVisible();
  expect(within(menu).getByRole("menuitem", { name: "Sign out" })).toBeVisible();
});
