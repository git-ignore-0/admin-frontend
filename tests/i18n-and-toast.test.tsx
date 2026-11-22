import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { clearAdminNotifications, ToastProvider, useToast } from "@/components/toast-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function ToastHarness() {
  const showToast = useToast();
  return (
    <>
      <button onClick={() => showToast("Đã lưu")}>Save</button>
      <button onClick={() => showToast("Không lưu được", "error")}>Fail</button>
    </>
  );
}

function TestProviders({ children }: { children: React.ReactNode }) {
  return (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>{children}</ToastProvider>
    </AdminI18nProvider>
  );
}

afterEach(cleanup);

describe("admin language and notifications", () => {
  it("switches the interface language and persists the preference", () => {
    render(
      <TestProviders>
        <LanguageSwitcher />
      </TestProviders>,
    );

    fireEvent.click(screen.getByRole("radio", { name: "EN" }));

    expect(screen.getByRole("radiogroup", { name: "Language" })).toBeInTheDocument();
    expect(document.cookie).toContain("nfv_admin_locale=en");
  });

  it("shows a dismissible success toast", async () => {
    render(
      <TestProviders>
        <ToastHarness />
      </TestProviders>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("status")).toHaveTextContent("Đã lưu");

    fireEvent.click(screen.getByRole("button", { name: "Đóng thông báo" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
  it("announces errors and removes every message immediately when the admin session changes", () => {
    render(
      <TestProviders>
        <ToastHarness />
      </TestProviders>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Fail" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Không lưu được");
    act(() => clearAdminNotifications());
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Đã lưu")).toBeNull();
    expect(screen.queryByText("Không lưu được")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("updates the dismiss label of an existing notification when locale changes", () => {
    render(
      <TestProviders>
        <LanguageSwitcher />
        <ToastHarness />
      </TestProviders>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("radio", { name: "EN" }));
    expect(screen.getByRole("button", { name: "Dismiss notification" })).toBeVisible();
  });
});
