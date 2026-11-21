import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { ToastProvider } from "@/components/toast-provider";
import { WorkshopEditor } from "@/components/workshop-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/components/lazy-rich-text-editor", () => ({
  LazyRichTextEditor: () => <div role="textbox" aria-label="Nội dung workshop" />,
}));

afterEach(cleanup);

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
  it("supports Home and End navigation while retaining each language's content", () => {
    render(
      <AdminI18nProvider initialLocale="vi">
        <ToastProvider>
          <WorkshopEditor />
        </ToastProvider>
      </AdminI18nProvider>,
    );
    const vietnamese = screen.getByRole("tab", { name: /Tiếng Việt Chưa nhập/i });
    const english = screen.getByRole("tab", { name: /English Chưa nhập/i });
    fireEvent.change(screen.getByLabelText("Tiêu đề *"), {
      target: { value: "Nội dung tiếng Việt" },
    });
    vietnamese.focus();
    fireEvent.keyDown(vietnamese, { key: "End" });
    expect(english).toHaveFocus();
    fireEvent.keyDown(english, { key: "Home" });
    expect(vietnamese).toHaveFocus();
    fireEvent.keyDown(vietnamese, { key: "ArrowRight" });
    expect(english).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Tiêu đề *")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Tiêu đề *"), { target: { value: "English content" } });
    fireEvent.keyDown(english, { key: "ArrowLeft" });
    expect(vietnamese).toHaveFocus();
    expect(vietnamese).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Tiêu đề *")).toHaveValue("Nội dung tiếng Việt");
    expect(vietnamese).toHaveAccessibleName(/Chưa hoàn chỉnh/);
    fireEvent.keyDown(vietnamese, { key: "ArrowRight" });
    expect(screen.getByLabelText("Tiêu đề *")).toHaveValue("English content");
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
