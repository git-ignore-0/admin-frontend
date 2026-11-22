import { Button, Checkbox } from "@mantine/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";

afterEach(cleanup);

describe("shared list toolbar", () => {
  it("supports a primary action on its own", () => {
    const create = vi.fn();
    render(<ListToolbar primaryAction={<Button onClick={create}>Create record</Button>} />);

    fireEvent.click(screen.getByRole("button", { name: "Create record" }));
    expect(create).toHaveBeenCalledOnce();
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("submits the current draft and delegates clear to the caller", () => {
    const submit = vi.fn();
    const clear = vi.fn();

    function SearchExample() {
      const [value, setValue] = useState("");
      return (
        <ListToolbar
          search={{
            label: "Record search",
            value,
            onChange: setValue,
            onSubmit: submit,
            submitLabel: "Search records",
            clearLabel: "Clear search",
            onClear: () => {
              clear();
              setValue("");
            },
          }}
        />
      );
    }

    render(<SearchExample />);
    const input = screen.getByRole("searchbox", { name: "Record search" });
    fireEvent.change(input, { target: { value: " Nguyễn An " } });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Search records" }));
    expect(submit).toHaveBeenCalledExactlyOnceWith(" Nguyễn An ");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(clear).toHaveBeenCalledOnce();
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(submit).toHaveBeenCalledOnce();
  });

  it("exposes the active filter count and resets caller-owned controls", () => {
    function FilterExample() {
      const [active, setActive] = useState(true);
      return (
        <ListToolbar
          filterPopover={{
            label: "Bộ lọc",
            activeCount: Number(active),
            clearLabel: "Xóa bộ lọc",
            onClear: () => setActive(false),
            children: (
              <Checkbox
                label="Đang hoạt động"
                checked={active}
                onChange={(event) => setActive(event.currentTarget.checked)}
              />
            ),
          }}
        />
      );
    }

    render(<FilterExample />);
    const trigger = screen.getByRole("button", { name: "Bộ lọc (1)" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(trigger);
    const filter = screen.getByRole("dialog", { name: "Bộ lọc (1)" });
    expect(trigger).toHaveAttribute("aria-controls", filter.id);
    expect(within(filter).getByRole("checkbox", { name: "Đang hoạt động" })).toBeChecked();
    fireEvent.click(within(filter).getByRole("button", { name: "Xóa bộ lọc" }));
    expect(screen.getByRole("button", { name: "Bộ lọc" })).toHaveAttribute("aria-expanded", "true");
    expect(within(filter).getByRole("checkbox", { name: "Đang hoạt động" })).not.toBeChecked();
    expect(within(filter).getByRole("button", { name: "Xóa bộ lọc" })).toBeDisabled();
  });

  it("locks repeated refreshes until the caller's promise settles", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const onRefresh = vi.fn(() => pending);
    const view = render(<ListToolbar refresh={{ label: "Refresh records", onRefresh }} />);
    const refresh = screen.getByRole("button", { name: "Refresh records" });

    fireEvent.click(refresh);
    expect(refresh).toBeDisabled();
    expect(refresh).toHaveAttribute("aria-busy", "true");
    fireEvent.click(refresh);
    expect(onRefresh).toHaveBeenCalledOnce();

    await act(async () => finish());
    expect(refresh).toBeEnabled();
    view.rerender(<ListToolbar refresh={{ label: "Refresh records", onRefresh, loading: true }} />);
    expect(refresh).toBeDisabled();
    fireEvent.click(refresh);
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});

describe("shared list footer", () => {
  const props = {
    page: 1,
    pageSize: 30,
    onPage: vi.fn(),
    previousLabel: "Trước",
    nextLabel: "Sau",
    summary: "Trang {page}/{pages}",
  };

  it("offers an optional localized count across zero, one and multiple pages", () => {
    const labels = {
      resultCountLabel: "{count} kết quả",
      resultCountSingularLabel: "Có {count} kết quả",
    };
    const view = render(<Pagination {...props} total={0} {...labels} />);
    expect(screen.getByText("0 kết quả")).toBeVisible();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    view.rerender(<Pagination {...props} total={1} {...labels} />);
    expect(screen.getByText("Có 1 kết quả")).toBeVisible();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    view.rerender(<Pagination {...props} total={45} {...labels} />);
    expect(screen.getByText("45 kết quả")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Trang 1/2" })).toBeVisible();
  });

  it("keeps the existing one-page footer hidden when no result labels are supplied", () => {
    render(<Pagination {...props} total={30} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("Trang 1/1")).not.toBeInTheDocument();
  });
});

describe("shared list states", () => {
  it("distinguishes loading, refreshing, empty, no results, and errors with retry", () => {
    const retry = vi.fn();
    const props = {
      empty: "No records yet",
      error: "",
      hasData: false,
      isEmpty: false,
      loading: true,
      loadingLabel: "Loading records",
      refreshingLabel: "Refreshing records",
      onRetry: retry,
      retryLabel: "Retry",
    };

    const view = render(<ListState {...props} embedded />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading records");
    view.rerender(
      <>
        <p>Existing record</p>
        <ListState {...props} hasData embedded />
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing records");
    expect(screen.getByText("Existing record")).toBeVisible();
    view.rerender(<ListState {...props} isEmpty loading={false} embedded />);
    expect(screen.getByText("No records yet")).toBeVisible();
    view.rerender(
      <ListState {...props} isEmpty loading={false} noResults="No matching records" embedded />,
    );
    expect(screen.getByText("No matching records")).toBeVisible();
    expect(screen.queryByText("No records yet")).not.toBeInTheDocument();

    for (const hasData of [false, true]) {
      view.rerender(
        <>
          {hasData && <p>Existing record</p>}
          <ListState {...props} hasData={hasData} error="Network error" loading={false} embedded />
        </>,
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Network error");
      fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
      if (hasData) expect(screen.getByText("Existing record")).toBeVisible();
    }
    expect(retry).toHaveBeenCalledTimes(2);
  });
});
