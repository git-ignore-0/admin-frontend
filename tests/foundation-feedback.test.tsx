import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Pagination } from "@/components/pagination";

const labels = {
  title: "Confirm change",
  cancelLabel: "Cancel",
  confirmLabel: "Confirm",
  busyLabel: "Saving",
  busy: false,
};
afterEach(cleanup);

describe("foundation feedback contracts", () => {
  it("replaces confirmation with the single close action in the same dialog", async () => {
    const onCancel = vi.fn();
    const view = render(
      <ConfirmationDialog {...labels} danger onCancel={onCancel} onConfirm={vi.fn()}>
        <p>Ready</p>
      </ConfirmationDialog>,
    );
    const dialog = screen.getByRole("dialog", { name: labels.title });
    within(dialog).getByRole("button", { name: labels.confirmLabel }).focus();
    view.rerender(
      <ConfirmationDialog title={labels.title} cancelLabel="Close" busy={false} onCancel={onCancel}>
        <p>Blocked</p>
      </ConfirmationDialog>,
    );
    expect(screen.getByRole("dialog", { name: labels.title })).toBe(dialog);
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(within(dialog).getAllByRole("button")).toEqual([close]);
    await waitFor(() => expect(close).toHaveFocus());
    fireEvent.click(close);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps the dialog form outside a containing page form and submits by formId", () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <MantineProvider env="default" forceColorScheme="light">
        <form aria-label="Page form">
          <ConfirmationDialog {...labels} formId="dialog-form" onCancel={vi.fn()}>
            <form id="dialog-form" onSubmit={submit}>
              <input aria-label="Reason" name="reason" />
            </form>
          </ConfirmationDialog>
        </form>
      </MantineProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Confirm change" });
    expect(screen.getByRole("form", { name: "Page form" })).not.toContainElement(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("offers direct server page selection as well as localized previous and next controls", () => {
    const onPage = vi.fn();
    render(
      <Pagination
        page={2}
        total={120}
        pageSize={30}
        onPage={onPage}
        previousLabel="Trước"
        nextLabel="Sau"
        summary="Trang {page}/{pages}"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    expect(onPage).toHaveBeenLastCalledWith(4);
    fireEvent.click(screen.getByRole("button", { name: "Trước" }));
    expect(onPage).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Sau" }));
    expect(onPage).toHaveBeenLastCalledWith(3);
    expect(screen.getByText("Trang 2/4")).toBeVisible();
  });

  it("locks every dialog exit and submission while a mutation is pending", () => {
    const cancel = vi.fn();
    const confirm = vi.fn();
    const alternate = vi.fn();
    render(
      <ConfirmationDialog
        {...labels}
        busy
        onCancel={cancel}
        onConfirm={confirm}
        onAlternate={alternate}
        alternateLabel="Another action"
        error="Server validation"
      >
        <p>Review first</p>
      </ConfirmationDialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Confirm change" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Server validation");
    for (const button of within(dialog).getAllByRole("button")) expect(button).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(cancel).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(alternate).not.toHaveBeenCalled();
  });
  it("returns focus to the explicit connected target after the modal is removed", async () => {
    const preferred = createRef<HTMLButtonElement>();
    const view = render(
      <>
        <button ref={preferred}>Return here</button>
        <ConfirmationDialog
          {...labels}
          returnFocusRef={preferred}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        >
          <p>Check details</p>
        </ConfirmationDialog>
      </>,
    );
    view.rerender(<button ref={preferred}>Return here</button>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Return here" })).toHaveFocus());
  });

  it("uses the fallback when the original trigger and explicit target are removed", async () => {
    const fallback = createRef<HTMLButtonElement>();
    const detached = document.createElement("button");
    const view = render(
      <>
        <button ref={fallback}>Fallback</button>
        <ConfirmationDialog
          {...labels}
          returnFocusRef={{ current: detached }}
          fallbackFocusRef={fallback}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        >
          <p>Check details</p>
        </ConfirmationDialog>
      </>,
    );
    view.rerender(<button ref={fallback}>Fallback</button>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Fallback" })).toHaveFocus());
  });

  it("falls back when the explicit target is still connected but disabled", async () => {
    const preferred = createRef<HTMLButtonElement>();
    const fallback = createRef<HTMLButtonElement>();
    const view = render(
      <>
        <button ref={preferred} disabled>
          Unavailable
        </button>
        <button ref={fallback}>Fallback</button>
        <ConfirmationDialog
          {...labels}
          returnFocusRef={preferred}
          fallbackFocusRef={fallback}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        >
          <p>Check details</p>
        </ConfirmationDialog>
      </>,
    );
    view.rerender(
      <>
        <button ref={preferred} disabled>
          Unavailable
        </button>
        <button ref={fallback}>Fallback</button>
      </>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Fallback" })).toHaveFocus());
  });

  it("keeps server paging locked while data refreshes", () => {
    const onPage = vi.fn();
    render(
      <Pagination
        page={2}
        total={120}
        pageSize={30}
        onPage={onPage}
        previousLabel="Previous"
        nextLabel="Next"
        summary="Page {page}/{pages}"
        disabled
      />,
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(onPage).not.toHaveBeenCalled();
  });
  it("does not overwrite a validation field focus chosen by the consumer while closing", async () => {
    const fallback = createRef<HTMLButtonElement>();
    const view = render(
      <>
        <input aria-label="Invalid reference" />
        <button ref={fallback}>Fallback</button>
        <ConfirmationDialog
          {...labels}
          fallbackFocusRef={fallback}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        >
          <p>Details</p>
        </ConfirmationDialog>
      </>,
    );
    view.rerender(
      <>
        <input aria-label="Invalid reference" />
        <button ref={fallback}>Fallback</button>
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Invalid reference" });
    input.focus();
    await Promise.resolve();
    expect(input).toHaveFocus();
  });
});
