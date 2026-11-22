import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminShell } from "@/components/admin-shell";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ToastProvider, useToast } from "@/components/toast-provider";
import { ADMIN_SESSION_CHANGED_EVENT } from "@/lib/client-api";
vi.mock("next/navigation", () => ({
  usePathname: () => "/users/a",
  useRouter: () => ({ refresh: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.adminPageSession;
  window.localStorage.clear();
});
function ProtectedContent() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast("Private saved result")}>Notify</button>
      <ConfirmationDialog
        title="Private account"
        busy={false}
        busyLabel="Saving"
        cancelLabel="Cancel"
        confirmLabel="Confirm"
        onCancel={() => {}}
        onConfirm={() => {}}
      >
        <p>Private mutation</p>
      </ConfirmationDialog>
    </>
  );
}
function show(children: React.ReactNode = <p>Protected data</p>) {
  return render(
    <AdminI18nProvider initialLocale="en">
      <ToastProvider>
        <AdminShell
          sessionBinding="foundation"
          user={{ name: "Admin", email: null, login_phone_number: "+84912345678" }}
        >
          {children}
        </AdminShell>
      </ToastProvider>
    </AdminI18nProvider>,
  );
}
it("offers direct operational navigation and contextual point discovery without fake tasks", () => {
  show();
  expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute(
    "href",
    "/store-catalog/products",
  );
  expect(screen.getByRole("link", { name: "Categories" })).toHaveAttribute(
    "href",
    "/store-catalog/categories",
  );
  expect(
    within(screen.getByRole("navigation", { name: "Administration" })).getByRole("link", {
      name: "Users",
    }),
  ).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("link", { name: "Manage points" })).toBeNull();
  expect(screen.queryByRole("link", { name: /Tasks/ })).toBeNull();
});
it("keeps sign out as a session-bound POST in the real account menu", () => {
  const { container } = show();
  fireEvent.click(screen.getByRole("button", { name: "Admin account" }));
  const logout = screen.getByRole("menuitem", { name: "Sign out" });
  const form = logout.closest("form")!;
  expect(form).toHaveAttribute("action", "/api/auth/logout");
  expect(form).toHaveAttribute("method", "post");
  expect(form.querySelector('input[name="sessionBinding"]')).toHaveValue("foundation");
  expect(container.querySelector('[data-admin-session="foundation"]')).toBeTruthy();
});
it("removes portaled protected dialogs, notifications and account menus on a stale session", () => {
  show(<ProtectedContent />);
  fireEvent.click(screen.getByRole("button", { name: "Notify" }));
  expect(screen.getByRole("dialog", { name: "Private account" })).toBeInTheDocument();
  expect(screen.getByText("Private saved result")).toBeInTheDocument();
  act(() =>
    window.dispatchEvent(new CustomEvent(ADMIN_SESSION_CHANGED_EVENT, { detail: "foundation" })),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("Private saved result")).toBeNull();
  expect(screen.queryByText("Private mutation")).toBeNull();
  expect(
    within(screen.getByRole("alert")).getByRole("button", { name: "Reload page" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Admin account" })).toBeNull();
});
