import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ToastProvider, useToast } from "@/components/toast-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function ToastHarness() {
  const showToast = useToast();
  return <button onClick={() => showToast("Đã lưu")}>Save</button>;
}

function TestProviders({ children }: { children: React.ReactNode }) {
  return (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>{children}</ToastProvider>
    </AdminI18nProvider>
  );
}

describe("admin language and notifications", () => {
  it("switches the interface language and persists the preference", () => {
    render(
      <TestProviders>
        <LanguageSwitcher />
      </TestProviders>,
    );

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
    expect(document.cookie).toContain("nfv_admin_locale=en");
  });

  it("shows a dismissible success toast", () => {
    render(
      <TestProviders>
        <ToastHarness />
      </TestProviders>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("status")).toHaveTextContent("Đã lưu");

    fireEvent.click(screen.getByRole("button", { name: "Đóng thông báo" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
