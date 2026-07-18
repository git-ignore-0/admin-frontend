import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { ToastProvider } from "@/components/toast-provider";
import { WorkshopEditor } from "@/components/workshop-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/components/rich-text-editor", () => ({
  RichTextEditor: () => <div role="textbox" aria-label="Nội dung workshop" />,
}));

describe("workshop editor controls", () => {
  it("shows clear language tabs and switches their selected state", () => {
    render(
      <AdminI18nProvider initialLocale="vi">
        <ToastProvider>
          <WorkshopEditor />
        </ToastProvider>
      </AdminI18nProvider>,
    );

    const vietnamese = screen.getByRole("tab", { name: /Tiếng Việt Chưa nhập/i });
    const english = screen.getByRole("tab", { name: /English Chưa nhập/i });
    expect(vietnamese).toHaveAttribute("aria-selected", "true");
    expect(english).toHaveAttribute("aria-selected", "false");

    fireEvent.click(english);
    expect(english).toHaveAttribute("aria-selected", "true");
    expect(vietnamese).toHaveAttribute("aria-selected", "false");
  });
  it("keeps only the registration URL in the schedule section", () => {
    render(
      <AdminI18nProvider initialLocale="vi">
        <ToastProvider>
          <WorkshopEditor />
        </ToastProvider>
      </AdminI18nProvider>,
    );

    expect(screen.getByLabelText("URL form đăng ký")).toHaveAttribute("type", "url");
    expect(screen.queryByLabelText("Trạng thái đăng ký")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sức chứa")).not.toBeInTheDocument();
  });

  it("keeps editorial details inside the rich-text content", () => {
    render(
      <AdminI18nProvider initialLocale="vi">
        <ToastProvider>
          <WorkshopEditor />
        </ToastProvider>
      </AdminI18nProvider>,
    );

    expect(screen.queryByText(/Thêm địa điểm/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tên địa điểm")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Người hướng dẫn")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Chi phí")).not.toBeInTheDocument();
  });
});
