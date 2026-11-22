import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UiFoundationShowcase } from "@/components/ui-foundation-showcase";
import { SampleRecordList } from "@/components/ui-foundation-showcase/record-list";
import { initialRecords, recordCategories } from "@/components/ui-foundation-showcase/sample-records";

const firstRecord = "Khảo sát độ ẩm lớp phủ";
const originalMatchMedia = window.matchMedia;

beforeEach(() => window.history.replaceState(null, "", "/dev/ui-foundation"));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

async function finishSampleRequest(duringRequest: () => void) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    duringRequest();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
  } finally {
    vi.useRealTimers();
  }
}

function selectOption(label: string, option: string) {
  fireEvent.click(screen.getByRole("textbox", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

function submitSearch(value: string) {
  const search = screen.getByRole("searchbox", { name: "Search records" });
  fireEvent.change(search, { target: { value } });
  fireEvent.submit(search.closest("form")!);
}

function applyFilters() {
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
}

it("keeps the desktop detail Drawer on the right at 640px", async () => {
  render(<UiFoundationShowcase />);
  fireEvent.click(screen.getByRole("link", { name: firstRecord }));
  const dialog = await screen.findByRole("dialog", { name: firstRecord });
  expect(dialog.closest(".mantine-Drawer-root")).toHaveStyle({
    "--drawer-justify": "flex-end",
    "--drawer-size": "calc(40rem * var(--mantine-scale))",
  });
});

it("places detail actions outside the scroll body and omits them for read-only details", async () => {
  render(<UiFoundationShowcase />);
  fireEvent.click(screen.getByRole("link", { name: firstRecord }));
  const drawer = await screen.findByRole("dialog", { name: firstRecord });
  const body = document.getElementById(drawer.getAttribute("aria-describedby")!);
  const footer = within(drawer).getByRole("button", { name: "Confirm review" }).closest("footer");
  expect(footer).not.toBeNull();
  expect(footer?.parentElement).toBe(body?.parentElement);
  expect(body).toContainElement(within(drawer).getByRole("heading", { name: "Field notes" }));
  expect(within(drawer).getByText("NFV-001", { selector: "header *" })).toBeVisible();

  fireEvent.click(within(drawer).getByRole("button", { name: "Close sample detail" }));
  await waitFor(() => expect(drawer).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("checkbox", { name: "Read-only detail" }));
  fireEvent.click(screen.getByRole("link", { name: firstRecord }));
  const readOnly = await screen.findByRole("dialog", { name: firstRecord });
  expect(within(readOnly).getByRole("heading", { name: "Field notes" })).toBeVisible();
  expect(readOnly.querySelector("footer")).toBeNull();
});

it("submits a search, returns to the first page and retries an empty or failed list", async () => {
  render(<UiFoundationShowcase />);
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));

  const search = screen.getByRole("searchbox", { name: "Search records" });
  fireEvent.change(search, { target: { value: "khao sat do am" } });
  expect(screen.queryByRole("link", { name: firstRecord })).not.toBeInTheDocument();
  fireEvent.submit(search.closest("form")!);
  expect(screen.getByRole("link", { name: firstRecord })).toBeVisible();

  fireEvent.change(search, { target: { value: "missing sample" } });
  fireEvent.submit(search.closest("form")!);
  expect(screen.getByText("No matching sample records")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

  fireEvent.click(screen.getByRole("textbox", { name: "List state" }));
  fireEvent.click(screen.getByRole("option", { name: "Refresh error" }));
  const list = screen.getByRole("region", { name: "Sample records" });
  expect(within(list).getByRole("alert")).toHaveTextContent("Sample refresh failed.");
  expect(screen.getByRole("link", { name: firstRecord })).toBeVisible();
  await finishSampleRequest(() => {
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("link", { name: firstRecord })).toBeVisible();
    expect(screen.getByText("Refreshing sample records…")).toBeVisible();
  });
  expect(screen.getByText("Sample records refreshed.")).toBeVisible();
  expect(screen.queryByText("Sample refresh failed.")).not.toBeInTheDocument();
});

it("keeps modified link clicks and nested row controls independent from row detail navigation", async () => {
  render(<UiFoundationShowcase />);
  const link = screen.getByRole("link", { name: firstRecord });
  expect(link).toHaveAttribute("href", "#record-NFV-001");
  expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  const row = link.closest("tr")!;
  const flag = within(row).getByRole("button", { name: "Flag NFV-001" });
  fireEvent.click(flag);
  expect(flag).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  fireEvent.click(within(row).getByText("NFV-001"));
  expect(await screen.findByRole("dialog", { name: firstRecord })).toBeVisible();
  expect(link).toHaveAttribute("aria-current", "true");
  expect(row).toHaveAttribute("data-selected", "true");
});

it("previews initial loading, many pages, and recovery from zero matching records", () => {
  render(<UiFoundationShowcase />);
  const list = within(screen.getByRole("region", { name: "Data list" }));
  selectOption("List state", "Initial loading");
  expect(list.getByRole("status")).toHaveTextContent("Loading sample records");
  expect(screen.queryByRole("link", { name: firstRecord })).not.toBeInTheDocument();

  selectOption("List state", "Records");
  selectOption("Record set", "Single page");
  expect(list.getByText("5 records")).toBeVisible();
  expect(list.queryByRole("navigation")).not.toBeInTheDocument();
  selectOption("Record set", "Many pages");
  expect(screen.getByText("60 records")).toBeVisible();
  const pagination = screen.getByRole("navigation", { name: "Page 1 of 12" });
  fireEvent.click(within(pagination).getByRole("button", { name: "12" }));
  expect(screen.getByRole("navigation", { name: "Page 12 of 12" })).toBeVisible();
  expect(screen.getByText("NFV-060")).toBeVisible();

  submitSearch("not a sample");
  expect(screen.getByText("No matching sample records")).toBeVisible();
  fireEvent.click(list.getByRole("button", { name: "Clear search and filters" }));
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveValue("");
  expect(screen.getByRole("link", { name: firstRecord })).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Page 1 of 12" })).toBeVisible();
});

it("hands focus to the nested modal, dismisses only that modal on Escape and restores both triggers", async () => {
  render(<UiFoundationShowcase />);
  submitSearch("NFV-001");
  const link = screen.getByRole("link", { name: firstRecord });
  link.focus();
  fireEvent.click(link);
  const drawer = await screen.findByRole("dialog", { name: firstRecord });
  const openConfirmation = within(drawer).getByRole("button", { name: "Confirm review" });
  openConfirmation.focus();
  fireEvent.click(openConfirmation);

  const confirmation = await screen.findByRole("dialog", { name: "Confirm sample review" });
  expect(drawer).toHaveAttribute("inert");
  await waitFor(() => expect(confirmation).toContainElement(document.activeElement as HTMLElement));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  await waitFor(() => expect(confirmation).not.toBeInTheDocument());
  expect(drawer).toBeVisible();
  await waitFor(() => expect(openConfirmation).toHaveFocus());

  fireEvent.keyDown(openConfirmation, { key: "Escape" });
  await waitFor(() => expect(drawer).not.toBeInTheDocument());
  expect(link).toHaveFocus();
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveValue("NFV-001");
});

it("shows the same record fields on the mobile detail page and restores the list on back", async () => {
  const media = new EventTarget();
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    if (query !== "(max-width: 47.99em)") return originalMatchMedia(query);
    return Object.assign(media, { matches: false, media: query }) as MediaQueryList;
  });
  render(<UiFoundationShowcase />);

  const link = screen.getByRole("link", { name: firstRecord });
  fireEvent.click(link);
  const drawer = await screen.findByRole("dialog", { name: firstRecord });
  expect(within(drawer).getByText("Khu thử nghiệm ven sông")).toBeVisible();

  act(() => media.dispatchEvent(Object.assign(new Event("change"), { matches: true })));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const heading = screen.getByRole("heading", { level: 1, name: firstRecord });
  expect(heading).toHaveFocus();
  const detailPage = screen.getByRole("article", { name: firstRecord });
  expect(within(detailPage).getByText("Khu thử nghiệm ven sông")).toBeVisible();
  expect(link).not.toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Back to sample records" }));
  await waitFor(() => expect(link).toHaveFocus());
  expect(link).toBeVisible();
});

it("shows create validation and locks a pending submission before adding one mock record", async () => {
  render(<UiFoundationShowcase />);
  fireEvent.click(screen.getByRole("button", { name: "New record" }));
  const dialog = await screen.findByRole("dialog", { name: "Create sample record" });
  expect(dialog.closest(".mantine-Modal-root")).toHaveStyle({
    "--modal-size": "calc(30rem * var(--mantine-scale))",
  });
  const name = within(dialog).getByRole("textbox", { name: "Record name" });
  const save = within(dialog).getByRole("button", { name: "Save record" });
  const backdrop = dialog.closest(".mantine-Modal-root")!.querySelector(".mantine-Modal-overlay")!;
  fireEvent.click(save);
  expect(name).toBeInvalid();
  expect(name).toHaveFocus();

  fireEvent.change(name, { target: { value: "Kiểm tra tạo bản ghi" } });
  await finishSampleRequest(() => {
    fireEvent.click(save);
    expect(within(dialog).getByRole("button", { name: "Saving…" })).toBeDisabled();
    fireEvent.keyDown(name, { key: "Escape" });
    fireEvent.click(backdrop);
    expect(dialog).toBeVisible();
    fireEvent.submit(name.closest("form")!);
  });
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  expect(screen.getAllByRole("link", { name: "Kiểm tra tạo bản ghi" })).toHaveLength(1);
});

it("opens information and destructive confirmations at 400px and focuses the safe action", async () => {
  render(<UiFoundationShowcase />);
  const infoTrigger = screen.getByRole("button", { name: "Information" });
  fireEvent.click(infoTrigger);
  const info = await screen.findByRole("dialog", { name: "About sample records" });
  expect(info.closest(".mantine-Modal-root")).toHaveStyle({
    "--modal-size": "calc(25rem * var(--mantine-scale))",
  });
  fireEvent.click(within(info).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(infoTrigger).toHaveFocus());

  fireEvent.click(screen.getByRole("button", { name: "Destructive confirmation" }));
  const confirmation = await screen.findByRole("dialog", { name: "Remove sample record" });
  expect(confirmation.closest(".mantine-Modal-root")).toHaveStyle({
    "--modal-size": "calc(25rem * var(--mantine-scale))",
  });
  const cancel = within(confirmation).getByRole("button", { name: "Cancel" });
  await waitFor(() => expect(cancel).toHaveFocus());
  expect(within(confirmation).getByRole("button", { name: "Remove record" })).toHaveStyle({
    "--button-bg": "var(--mantine-color-red-filled)",
  });
  await finishSampleRequest(() => {
    fireEvent.click(within(confirmation).getByRole("button", { name: "Keep as draft" }));
    expect(cancel).toBeDisabled();
  });
  expect(
    within(screen.getByRole("row", { name: /Khảo sát độ ẩm lớp phủ/ })).getByText("Bản nháp"),
  ).toBeVisible();
});

it("preserves an edited draft after a mock request error and saves it once on retry", async () => {
  render(<UiFoundationShowcase />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Fail next sample request" }));
  fireEvent.click(screen.getByRole("link", { name: firstRecord }));
  const drawer = await screen.findByRole("dialog", { name: firstRecord });
  const edit = within(drawer).getByRole("button", { name: "Edit record" });
  fireEvent.click(edit);
  const dialog = await screen.findByRole("dialog", { name: "Edit sample record" });
  expect(dialog.closest(".mantine-Modal-root")).toHaveStyle({
    "--modal-size": "calc(40rem * var(--mantine-scale))",
  });
  const name = within(dialog).getByRole("textbox", { name: "Record name" });
  fireEvent.change(name, { target: { value: "Updated sample name" } });
  await finishSampleRequest(() => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Save record" }));
  });
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Sample request failed");
  expect(name).toHaveValue("Updated sample name");
  expect(drawer).toHaveTextContent(firstRecord);

  await finishSampleRequest(() => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Save record" }));
  });
  expect(screen.getByRole("dialog", { name: "Updated sample name" })).toBe(drawer);
  await waitFor(() => expect(edit).toHaveFocus());
});

it("filters the full record set, resets the filters and previews the real optional toolbar controls", async () => {
  render(<UiFoundationShowcase />);
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  selectOption("Status", "Tạm dừng");
  expect(screen.getByRole("button", { name: "Filters" })).toBeVisible();
  expect(screen.getByRole("link", { name: firstRecord })).toBeVisible();
  applyFilters();
  expect(screen.getByRole("button", { name: "Filters (1)" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Kiểm tra rãnh thoát nước" })).toBeVisible();
  expect(screen.queryByRole("link", { name: firstRecord })).not.toBeInTheDocument();
  expect(screen.getByText("1 record", { exact: true })).toBeVisible();

  const refresh = screen.getByRole("button", { name: "Refresh records" });
  submitSearch("  NFV-006  ");
  fireEvent.click(screen.getByRole("button", { name: "Filters (1)" }));
  selectOption("Category", recordCategories[2]);
  applyFilters();
  await finishSampleRequest(() => {
    fireEvent.click(refresh);
    expect(refresh).toBeDisabled();
    expect(screen.getByRole("link", { name: "Kiểm tra rãnh thoát nước" })).toBeVisible();
  });
  expect(screen.getByText("Sample records refreshed.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Filters (2)" })).toBeVisible();
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveValue("NFV-006");
  expect(screen.getByText("1 record", { exact: true })).toBeVisible();

  if (!screen.queryByRole("button", { name: "Clear filters" })) {
    fireEvent.click(screen.getByRole("button", { name: "Filters (2)" }));
  }
  expect(screen.getByRole("textbox", { name: "Category" })).toHaveValue(recordCategories[2]);
  expect(screen.getByRole("textbox", { name: "Status" })).toHaveValue("Tạm dừng");
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("button", { name: "Filters" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Category" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Status" })).toHaveValue("");
  expect(screen.getByRole("link", { name: "Kiểm tra rãnh thoát nước" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByRole("link", { name: firstRecord })).toBeVisible();

  fireEvent.click(screen.getByRole("textbox", { name: "Toolbar controls" }));
  fireEvent.click(screen.getByRole("option", { name: "Search only" }));
  expect(screen.getByRole("searchbox", { name: "Search records" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Refresh records" })).not.toBeInTheDocument();
});

it("dismisses the nested Select before discarding unapplied filters on Escape", () => {
  render(<UiFoundationShowcase />);
  const trigger = screen.getByRole("button", { name: "Filters" });
  fireEvent.click(trigger);
  selectOption("Category", recordCategories[2]);
  const status = screen.getByRole("textbox", { name: "Status" });
  act(() => status.focus());
  fireEvent.keyDown(status, { key: "ArrowDown", code: "ArrowDown" });
  expect(screen.getByRole("option", { name: "Tạm dừng" })).toBeVisible();

  fireEvent.keyDown(status, { key: "Escape", code: "Escape" });
  expect(screen.queryByRole("option", { name: "Tạm dừng" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Filters" })).toBeVisible();
  expect(status).toHaveFocus();

  fireEvent.keyDown(status, { key: "Escape", code: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(screen.getByRole("link", { name: firstRecord })).toBeVisible();
  fireEvent.click(trigger);
  expect(screen.getByRole("textbox", { name: "Category" })).toHaveValue("");
});

it("applies changes immediately when the preview switches to immediate filtering", () => {
  render(<UiFoundationShowcase />);
  selectOption("Filter behavior", "Immediate");
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  selectOption("Status", "Tạm dừng");
  expect(screen.getByRole("button", { name: "Filters (1)" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Kiểm tra rãnh thoát nước" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Apply filters" })).not.toBeInTheDocument();
});

it("keeps the applied filters when an outside click dismisses a changed draft", () => {
  render(<UiFoundationShowcase />);
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  selectOption("Status", "Tạm dừng");
  applyFilters();
  const trigger = screen.getByRole("button", { name: "Filters (1)" });
  fireEvent.click(trigger);
  selectOption("Category", recordCategories[2]);
  fireEvent.mouseDown(screen.getByRole("searchbox", { name: "Search records" }));
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("link", { name: "Kiểm tra rãnh thoát nước" })).toBeVisible();
  fireEvent.click(trigger);
  expect(screen.getByRole("textbox", { name: "Category" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Status" })).toHaveValue("Tạm dừng");
});

it("can omit just the filter while retaining search, refresh and the primary action", () => {
  render(<UiFoundationShowcase />);
  selectOption("Toolbar controls", "Without filters");
  expect(screen.queryByRole("button", { name: "Filters" })).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search records" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Refresh records" })).toBeVisible();
  expect(screen.getByRole("button", { name: "New record" })).toBeVisible();
});

it("clears hidden filters in Search only while preserving the draft and applied search", () => {
  render(<UiFoundationShowcase />);
  submitSearch("NFV-00");
  fireEvent.change(screen.getByRole("searchbox", { name: "Search records" }), {
    target: { value: "unsubmitted draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  selectOption("Status", "Tạm dừng");
  applyFilters();
  expect(screen.getByText("1 record", { exact: true })).toBeVisible();
  expect(screen.queryByRole("link", { name: firstRecord })).not.toBeInTheDocument();

  selectOption("Toolbar controls", "Search only");
  expect(screen.queryByRole("button", { name: /Filters/ })).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveValue("unsubmitted draft");
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveAccessibleDescription(
    "Applied search: “NFV-00”",
  );
  expect(screen.getByText("9 records")).toBeVisible();
  expect(screen.getByRole("link", { name: firstRecord })).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  selectOption("Toolbar controls", "All controls");
  expect(screen.getByRole("navigation", { name: "Page 2 of 2" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  expect(screen.getByRole("textbox", { name: "Status" })).toHaveValue("");
});

it("clears search and filters in Actions only and starts on the first page", () => {
  render(<UiFoundationShowcase />);
  submitSearch("NFV-006");
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  selectOption("Status", "Tạm dừng");
  selectOption("Category", recordCategories[2]);
  applyFilters();
  expect(screen.getByText("1 record", { exact: true })).toBeVisible();

  selectOption("Toolbar controls", "Actions only");
  expect(screen.queryByRole("searchbox", { name: "Search records" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Filters/ })).not.toBeInTheDocument();
  expect(screen.getByText("12 records")).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Page 1 of 3" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getByRole("link", { name: initialRecords[11].name })).toBeVisible();

  selectOption("Toolbar controls", "All controls");
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  expect(screen.getByRole("textbox", { name: "Status" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Category" })).toHaveValue("");
});

it("preserves the query, both filters, and page across label changes and a refresh", async () => {
  const records = initialRecords.map((record, index) => ({
    ...record,
    category: recordCategories[index === 2 ? 1 : 0],
    status: index === 3 ? ("success" as const) : ("pending" as const),
  }));
  render(<SampleRecordList records={records} selectedId={null} onOpen={vi.fn()} onCreate={vi.fn()} />);
  submitSearch("NFV-00");
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  selectOption("Category", recordCategories[0]);
  selectOption("Status", "Chờ duyệt");
  applyFilters();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));

  selectOption("Toolbar controls", "Vietnamese labels");
  expect(screen.getByRole("searchbox", { name: "Tìm kiếm bản ghi" })).toHaveValue("NFV-00");
  expect(screen.getByText("7 records")).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Page 2 of 2" })).toBeVisible();
  const viFilters = screen.getByRole("button", { name: "Bộ lọc quan sát (2)" });
  if (viFilters.getAttribute("aria-expanded") !== "true") fireEvent.click(viFilters);
  expect(screen.getByRole("textbox", { name: "Danh mục" })).toHaveValue(recordCategories[0]);
  expect(screen.getByRole("textbox", { name: "Trạng thái" })).toHaveValue("Chờ duyệt");

  selectOption("Toolbar controls", "All controls");
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveValue("NFV-00");
  expect(screen.getByRole("button", { name: "Filters (2)" })).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Page 2 of 2" })).toBeVisible();
  await finishSampleRequest(() => {
    fireEvent.click(screen.getByRole("button", { name: "Refresh records" }));
    expect(screen.getByRole("navigation", { name: "Page 2 of 2" })).toBeVisible();
  });
  expect(screen.getByRole("navigation", { name: "Page 2 of 2" })).toBeVisible();

  selectOption("Toolbar controls", "Search only");
  expect(screen.getByText("9 records")).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Page 1 of 2" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  selectOption("Toolbar controls", "All controls");
  selectOption("Toolbar controls", "Search only");
  expect(screen.getByRole("navigation", { name: "Page 2 of 2" })).toBeVisible();
});

it("shows all six Badge and Alert roles and previews each dismissible Notification", () => {
  render(<UiFoundationShowcase />);
  const feedback = within(screen.getByRole("region", { name: "Feedback" }));
  const examples = [
    ["success", "Sample saved"],
    ["pending", "Review pending"],
    ["warning", "Follow-up needed"],
    ["danger", "Validation error"],
    ["info", "Observation recorded"],
    ["neutral", "Draft retained"],
  ];
  for (const [role, title] of examples) {
    expect(feedback.getByText(role, { selector: ".mantine-Badge-label" })).toBeVisible();
    expect(feedback.getByRole("alert", { name: title })).toHaveStyle({
      "--alert-bg": `var(--mantine-color-${role}-light)`,
    });
    selectOption("Notification role", role);
    const notification = feedback.getByRole("status");
    expect(notification).toHaveTextContent(title);
    expect(notification).toHaveStyle({ backgroundColor: `var(--${role}-soft)` });
    fireEvent.click(within(notification).getByRole("button", { name: "Dismiss sample notification" }));
    expect(feedback.queryByRole("status")).not.toBeInTheDocument();
    expect(feedback.getByRole("textbox", { name: "Notification role" })).toHaveFocus();
  }
});

it("lets reviewers compare native default controls and operate the password toggle", () => {
  render(<UiFoundationShowcase />);
  const forms = within(screen.getByRole("region", { name: "Form inputs" }));
  const input = forms.getByRole("textbox", { name: "Control comparison" });
  fireEvent.change(input, { target: { value: "NFV-001" } });
  fireEvent.click(forms.getByRole("button", { name: "Clear comparison input" }));
  expect(input).toHaveValue("");
  expect(input).toHaveFocus();
  const password = forms.getByLabelText("Sample password");
  const toggle = forms.getByRole("button", { name: "Toggle sample password visibility" });
  expect(toggle.tabIndex).toBe(0);
  expect(password).toHaveAttribute("type", "password");
  fireEvent.keyDown(toggle, { key: " " });
  expect(password).toHaveAttribute("type", "text");
  fireEvent.mouseDown(toggle);
  expect(password).toHaveAttribute("type", "password");
});

it("restores the corresponding mobile action after resizing with a nested confirmation open", async () => {
  const media = new EventTarget();
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    if (query !== "(max-width: 47.99em)") return originalMatchMedia(query);
    return Object.assign(media, { matches: false, media: query }) as MediaQueryList;
  });
  render(<UiFoundationShowcase />);

  fireEvent.click(screen.getByRole("link", { name: firstRecord }));
  const drawer = await screen.findByRole("dialog", { name: firstRecord });
  fireEvent.click(within(drawer).getByRole("button", { name: "Confirm review" }));
  const confirmation = await screen.findByRole("dialog", { name: "Confirm sample review" });
  await waitFor(() => expect(confirmation).toContainElement(document.activeElement as HTMLElement));

  act(() => media.dispatchEvent(Object.assign(new Event("change"), { matches: true })));
  expect(confirmation).toContainElement(document.activeElement as HTMLElement);
  fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
  const detailPage = screen.getByRole("article", { name: firstRecord });
  await waitFor(() =>
    expect(within(detailPage).getByRole("button", { name: "Confirm review" })).toHaveFocus(),
  );
});
