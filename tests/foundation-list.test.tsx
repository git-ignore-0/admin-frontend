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

  it("keeps an applied search visible and clearable when the draft is emptied", () => {
    function SearchExample() {
      const [draft, setDraft] = useState("NFV-006");
      const [applied, setApplied] = useState("NFV-006");
      return (
        <ListToolbar
          search={{
            label: "Record search",
            value: draft,
            appliedValue: applied,
            formatAppliedValue: (query) => `Applied search: ${query}`,
            onChange: setDraft,
            onSubmit: setApplied,
            clearLabel: "Clear search",
            onClear: () => {
              setDraft("");
              setApplied("");
            },
          }}
        />
      );
    }

    render(<SearchExample />);
    const input = screen.getByRole("searchbox", { name: "Record search" });
    expect(screen.queryByText("Applied search: NFV-006")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveAccessibleDescription("Applied search: NFV-006");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.queryByText("Applied search: NFV-006")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    expect(input).toHaveFocus();
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

  it("starts a fresh deferred draft after toggle dismissal and conditional unmount", () => {
    function DeferredFilters({ visible }: { visible: boolean }) {
      const [applied, setApplied] = useState(false);
      const [draft, setDraft] = useState(false);
      return (
        <>
          <p>{applied ? "Filter applied" : "Unfiltered"}</p>
          {visible && (
            <ListToolbar
              filterPopover={{
                label: "Filters",
                onOpen: () => setDraft(applied),
                onDismiss: () => setDraft(applied),
                apply: { label: "Apply", onApply: () => setApplied(draft) },
                children: (
                  <Checkbox
                    label="Active records"
                    checked={draft}
                    onChange={(event) => setDraft(event.currentTarget.checked)}
                  />
                ),
              }}
            />
          )}
        </>
      );
    }

    const view = render(<DeferredFilters visible />);
    const toggle = () => fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const checkbox = () => screen.getByRole("checkbox", { name: "Active records" });
    toggle();
    fireEvent.click(checkbox());
    toggle();
    toggle();
    expect(checkbox()).not.toBeChecked();
    fireEvent.click(checkbox());
    view.rerender(<DeferredFilters visible={false} />);
    view.rerender(<DeferredFilters visible />);
    toggle();
    expect(checkbox()).not.toBeChecked();
    expect(screen.getByText("Unfiltered")).toBeVisible();
    fireEvent.click(checkbox());
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText("Filter applied")).toBeVisible();
    toggle();
    expect(checkbox()).toBeChecked();
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

  it("locks controls that change the list while busy and leaves the primary action available", () => {
    const submit = vi.fn();
    const add = vi.fn();
    render(
      <ListToolbar
        busy
        search={{ label: "Record search", value: "draft", onChange: vi.fn(), onSubmit: submit }}
        filterPopover={{ label: "Filters", children: "Filter fields" }}
        refresh={{ label: "Refresh records", onRefresh: vi.fn() }}
        primaryAction={<Button onClick={add}>Create record</Button>}
      />,
    );
    const input = screen.getByRole("searchbox", { name: "Record search" });
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Record search" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Filters" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refresh records" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("search"));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create record" }));
    expect(add).toHaveBeenCalledOnce();
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

  it.each([
    [0, 30],
    [3, 30],
    [1.5, 30],
    [Number.NaN, 30],
    [1, 0],
    [1, -1],
    [1, 2.5],
    [1, Number.POSITIVE_INFINITY],
  ])(
    "keeps an accurate count while suppressing navigation for page %s and size %s",
    (page, pageSize) => {
      const onPage = vi.fn();
      render(
        <Pagination
          {...props}
          page={page}
          pageSize={pageSize}
          total={60}
          onPage={onPage}
          resultCountLabel="{count} records"
        />,
      );
      expect(screen.getByText("60 records")).toBeVisible();
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
      expect(onPage).not.toHaveBeenCalled();
    },
  );

  it("waits for the caller to reconcile both the page and its records after a shrink", () => {
    const onPage = vi.fn();
    const view = render(<Pagination {...props} total={61} page={3} onPage={onPage} />);
    expect(screen.getByRole("navigation", { name: "Trang 3/3" })).toBeVisible();
    view.rerender(<Pagination {...props} total={60} page={3} onPage={onPage} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(onPage).not.toHaveBeenCalled();
    view.rerender(<Pagination {...props} total={60} page={2} onPage={onPage} disabled />);
    const navigation = screen.getByRole("navigation", { name: "Trang 2/2" });
    expect(navigation).toHaveAttribute("aria-busy", "true");
    expect(within(navigation).getByRole("button", { name: "Trước" })).toBeDisabled();
  });

  it("shares the native page controls between numbered and compact presentations", () => {
    const onPage = vi.fn();
    render(
      <Pagination
        {...props}
        page={4}
        total={180}
        resultCountLabel="{count} kết quả"
        onPage={onPage}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Trang 4/6" });
    expect(within(nav).getByText("4 / 6")).toHaveAttribute("aria-hidden", "true");
    expect(within(nav).queryByText("Trang 4/6")).not.toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "4" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(within(nav).getByRole("button", { name: "Trước" }));
    fireEvent.click(within(nav).getByRole("button", { name: "Sau" }));
    expect(onPage.mock.calls).toEqual([[3], [5]]);
  });
});

describe("shared list states", () => {
  it("uses a caller-provided loading skeleton and allows a recovery action for no results", () => {
    const onClear = vi.fn();
    const props = {
      empty: "No records",
      error: "",
      hasData: false,
      isEmpty: true,
      loadingLabel: "Loading records",
      noResults: "Nothing matches",
      onRetry: vi.fn(),
      retryLabel: "Retry",
    };
    const { rerender } = render(
      <ListState {...props} loading loadingPlaceholder={<div data-testid="skeleton" />} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading records");
    expect(screen.getByTestId("skeleton")).toBeVisible();
    rerender(
      <ListState
        {...props}
        loading={false}
        description="Change the query to see more records."
        action={<Button onClick={onClear}>Clear query</Button>}
      />,
    );
    expect(screen.getByText("Change the query to see more records.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear query" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

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
