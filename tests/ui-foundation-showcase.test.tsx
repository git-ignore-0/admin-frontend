import { MantineProvider, Tabs } from "@mantine/core";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminShell } from "@/components/admin-shell";
import { UiFoundationShowcase } from "@/components/ui-foundation-showcase";
import { SampleRecordList } from "@/components/ui-foundation-showcase/record-list";
import {
  initialRecords,
  recordCategories,
} from "@/components/ui-foundation-showcase/sample-records";
import { adminDictionaries } from "@/lib/admin-i18n";

const firstRecord = "Khảo sát độ ẩm lớp phủ";
const originalMatchMedia = window.matchMedia;
const tabLabels = {
  color: "2.1. Color",
  components: "2.2. Components",
  toolbar: "2.3. List Toolbar",
  list: "2.4. Data List",
  details: "2.5. Detail & Dialog",
  navigation: "2.6. Header & Navigation",
};

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}));

beforeEach(() => window.history.replaceState(null, "", "/dev/ui-foundation"));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.adminPageSession;
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

function showTab(tab: keyof typeof tabLabels) {
  fireEvent.click(screen.getByRole("tab", { name: tabLabels[tab] }));
}

it("uses native keyboard navigation between six independent review panels", () => {
  render(<UiFoundationShowcase />);
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(
    Object.values(tabLabels),
  );
  const color = screen.getByRole("tab", { name: tabLabels.color });
  expect(color).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel", { name: tabLabels.color })).toBeVisible();
  act(() => color.focus());
  fireEvent.keyDown(color, { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: tabLabels.components })).toHaveFocus();
  expect(screen.getByRole("tabpanel", { name: tabLabels.components })).toBeVisible();
  showTab("toolbar");
  expect(screen.getByRole("searchbox", { name: "Search records" })).toBeVisible();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  showTab("list");
  expect(screen.getByRole("table", { name: "Sample records" })).toBeVisible();
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
});

it("reviews the real AppShell Header without changing it for tabs or nested overlays", async () => {
  render(
    <AdminI18nProvider initialLocale="en">
      <AdminShell
        user={{ name: "Local admin", email: null, login_phone_number: null }}
        sessionBinding="showcase-shell"
      >
        <UiFoundationShowcase />
      </AdminShell>
    </AdminI18nProvider>,
  );
  const header = within(screen.getByRole("banner"));
  const rootLabel = adminDictionaries.en.breadcrumb.uiFoundation;
  const current = header.getByText(rootLabel);
  expect(current).toHaveAttribute("aria-current", "page");
  expect(header.queryByText("NFV Admin")).not.toBeInTheDocument();
  for (const tab of Object.keys(tabLabels) as (keyof typeof tabLabels)[]) {
    showTab(tab);
    expect(header.getByText(rootLabel)).toBe(current);
  }

  const openDetail = screen.getByRole("button", { name: "Open sample detail" });
  fireEvent.click(openDetail);
  const drawer = await screen.findByRole("dialog", { name: firstRecord });
  expect(header.getByText(rootLabel)).toBe(current);
  expect(header.queryByText(firstRecord)).not.toBeInTheDocument();
  const openConfirmation = within(drawer).getByRole("button", { name: "Confirm review" });
  fireEvent.click(openConfirmation);
  const confirmation = await screen.findByRole("dialog", { name: "Confirm sample review" });
  expect(header.getByText(rootLabel)).toBe(current);
  fireEvent.keyDown(confirmation, { key: "Escape" });
  await waitFor(() => expect(openConfirmation).toHaveFocus());
  fireEvent.click(within(drawer).getByRole("button", { name: "Close sample detail" }));
  await waitFor(() => expect(openDetail).toHaveFocus());
  expect(header.getByText(rootLabel)).toBe(current);

  const openModal = screen.getByRole("button", { name: "Open sample modal" });
  fireEvent.click(openModal);
  const modal = await screen.findByRole("dialog", { name: "About sample records" });
  expect(header.getByText(rootLabel)).toBe(current);
  fireEvent.click(within(modal).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(openModal).toHaveFocus());
  expect(header.getByText(rootLabel)).toBe(current);
  expect(window.location.pathname).toBe("/dev/ui-foundation");

  selectOption("Header preview width", "320 px");
  selectOption("Header preview context", "Child page with a long name");
  const preview = within(screen.getByRole("region", { name: "Header width preview" }));
  expect(preview.getByText(initialRecords[3].name)).toHaveAttribute("aria-current", "page");
  expect(header.getByText(rootLabel)).toBe(current);
  selectOption("Header preview context", "Deep navigation");
  expect(preview.getByText("Edit")).toHaveAttribute("aria-current", "page");
  expect(header.getByText(rootLabel)).toBe(current);
});

it("opens a direct record hash in the data list context and closes to that tab", async () => {
  window.history.replaceState(null, "", "/dev/ui-foundation#record-NFV-004");
  render(<UiFoundationShowcase />);
  const drawer = await screen.findByRole("dialog", { name: initialRecords[3].name });
  expect(drawer).toBeVisible();
  fireEvent.click(within(drawer).getByRole("button", { name: "Close sample detail" }));
  await waitFor(() => expect(drawer).not.toBeInTheDocument());
  const list = screen.getByRole("tab", { name: tabLabels.list });
  expect(list).toHaveAttribute("aria-selected", "true");
  expect(list).toHaveFocus();
  expect(location.hash).toBe("");
});

it("preserves the originating tab and read-only mode across browser Back and Forward", async () => {
  render(<UiFoundationShowcase />);
  showTab("details");
  const trigger = screen.getByRole("button", { name: "Open read-only detail" });
  fireEvent.click(trigger);
  const drawer = await screen.findByRole("dialog", { name: firstRecord });
  expect(drawer.querySelector("footer")).toBeNull();
  window.history.back();
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(location.hash).toBe("");

  window.history.forward();
  const reopened = await screen.findByRole("dialog", { name: firstRecord });
  expect(reopened.querySelector("footer")).toBeNull();
  fireEvent.click(within(reopened).getByRole("button", { name: "Close sample detail" }));
  await waitFor(() => expect(reopened).not.toBeInTheDocument());
  expect(screen.getByRole("tabpanel", { name: tabLabels.details })).toBeVisible();
});

it("keeps the desktop detail Drawer on the right at 640px", async () => {
  render(<UiFoundationShowcase />);
  showTab("details");
  fireEvent.click(screen.getByRole("button", { name: "Open standard detail" }));
  const dialog = await screen.findByRole("dialog", { name: firstRecord });
  expect(dialog.closest(".mantine-Drawer-root")).toHaveStyle({
    "--drawer-justify": "flex-end",
    "--drawer-size": "calc(40rem * var(--mantine-scale))",
    "--mb-padding": "var(--mantine-spacing-md)",
  });
  const detail = within(dialog);
  const title = detail.getByRole("heading", { name: firstRecord });
  expect(title).toHaveStyle({
    fontSize: "var(--mantine-font-size-lg)",
    fontWeight: 600,
    color: "var(--heading)",
    overflowWrap: "anywhere",
  });
  expect(detail.getAllByText("NFV-001")).toHaveLength(1);
  expect(detail.getByText("NFV-001")).toHaveStyle({
    color: "var(--mantine-color-dimmed)",
    "--text-fz": "var(--mantine-font-size-sm)",
  });
  for (const name of ["Record information", "Field notes"]) {
    expect(detail.getByRole("heading", { level: 2, name })).toHaveStyle({
      "--title-fz": "var(--mantine-font-size-md)",
      fontWeight: 600,
    });
  }
  expect(detail.getByText("Category")).toHaveStyle({
    color: "var(--mantine-color-dimmed)",
    "--text-fz": "var(--mantine-font-size-sm)",
  });
  expect(detail.getByText("Đất và dinh dưỡng")).toHaveStyle({
    "--text-fz": "var(--mantine-font-size-md)",
  });
  expect(detail.getByText("Khu thử nghiệm ven sông")).toBeVisible();
  expect(detail.getByText("Chờ duyệt")).toBeVisible();
  expect(detail.getByRole("button", { name: "Close sample detail" })).toHaveStyle({
    "--cb-size": "calc(2rem * var(--mantine-scale))",
    color: "var(--mantine-color-dimmed)",
  });
});

it("places detail actions outside the scroll body and omits them for read-only details", async () => {
  render(<UiFoundationShowcase />);
  showTab("details");
  const standard = screen.getByRole("button", { name: "Open standard detail" });
  fireEvent.click(standard);
  const drawer = await screen.findByRole("dialog", { name: firstRecord });
  const body = document.getElementById(drawer.getAttribute("aria-describedby")!);
  const footer = within(drawer).getByRole("button", { name: "Confirm review" }).closest("footer");
  expect(footer).not.toBeNull();
  expect(footer?.parentElement).toBe(body?.parentElement);
  expect(body).toContainElement(within(drawer).getByRole("heading", { name: "Field notes" }));
  expect(within(drawer).getByText("NFV-001", { selector: "header *" })).toBeVisible();
  expect(footer).toHaveStyle({
    paddingInline: "var(--mantine-spacing-md)",
    paddingBlock: "var(--mantine-spacing-sm)",
  });
  const remove = within(footer!).getByRole("button", { name: "Remove record" });
  const edit = within(footer!).getByRole("button", { name: "Edit record" });
  const confirm = within(footer!).getByRole("button", { name: "Confirm review" });
  expect(remove.parentElement).toBe(footer);
  expect(edit.parentElement).toBe(confirm.parentElement);
  expect(edit.parentElement).not.toBe(footer);
  expect(within(footer!).getAllByRole("button")).toEqual([remove, edit, confirm]);
  expect(remove).toHaveAttribute("data-variant", "subtle");
  expect(edit).toHaveAttribute("data-variant", "default");
  expect(confirm).toHaveAttribute("data-variant", "filled");

  fireEvent.click(within(drawer).getByRole("button", { name: "Close sample detail" }));
  await waitFor(() => expect(drawer).not.toBeInTheDocument());
  expect(standard).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Open long-content detail" }));
  const long = await screen.findByRole("dialog", { name: initialRecords[3].name });
  expect(long).toHaveTextContent("NFV-TRIAL-COMPOST-SEASON-02-BLOCK-NORTH-REFERENCE-2026");
  const notes = within(long).getByText(/Khi hoàn thành, nhóm ghi rõ/);
  expect(notes.textContent).toContain("\n\n");
  expect(notes).toHaveStyle({ whiteSpace: "pre-wrap", overflowWrap: "anywhere" });
  fireEvent.click(within(long).getByRole("button", { name: "Close sample detail" }));
  await waitFor(() => expect(long).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Open read-only detail" }));
  const readOnly = await screen.findByRole("dialog", { name: firstRecord });
  expect(within(readOnly).getByRole("heading", { name: "Field notes" })).toBeVisible();
  expect(readOnly.querySelector("footer")).toBeNull();
});

it("removes a sample only after confirming the Drawer destructive action", async () => {
  render(<UiFoundationShowcase />);
  showTab("details");
  fireEvent.click(screen.getByRole("button", { name: "Open standard detail" }));
  const drawer = await screen.findByRole("dialog", { name: firstRecord });
  const remove = within(drawer).getByRole("button", { name: "Remove record" });
  fireEvent.click(remove);
  const confirmation = await screen.findByRole("dialog", { name: "Remove sample record" });
  fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(remove).toHaveFocus());
  expect(drawer).toBeVisible();

  fireEvent.click(remove);
  const reopened = await screen.findByRole("dialog", { name: "Remove sample record" });
  await finishSampleRequest(() => {
    fireEvent.click(within(reopened).getByRole("button", { name: "Remove record" }));
    expect(within(reopened).getByRole("button", { name: "Removing…" })).toBeDisabled();
    fireEvent.keyDown(reopened, { key: "Escape" });
    expect(reopened).toBeVisible();
  });
  await waitFor(() => expect(drawer).not.toBeInTheDocument());
  showTab("list");
  expect(screen.queryByRole("link", { name: firstRecord })).not.toBeInTheDocument();
});

it("submits a search, returns to the first page and retries an empty or failed list", async () => {
  render(<UiFoundationShowcase />);
  showTab("list");
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.queryByRole("link", { name: firstRecord })).not.toBeInTheDocument();

  showTab("toolbar");
  const search = screen.getByRole("searchbox", { name: "Search records" });
  fireEvent.change(search, { target: { value: "khao sat do am" } });
  showTab("list");
  expect(screen.queryByRole("link", { name: firstRecord })).not.toBeInTheDocument();
  showTab("toolbar");
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  showTab("list");
  expect(screen.getByRole("link", { name: firstRecord })).toBeVisible();

  showTab("toolbar");
  submitSearch("missing sample");
  showTab("list");
  expect(screen.getByText("No matching sample records")).toBeVisible();
  showTab("toolbar");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

  showTab("list");
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
  showTab("list");
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
  showTab("list");
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

  showTab("toolbar");
  submitSearch("not a sample");
  showTab("list");
  expect(screen.getByText("No matching sample records")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
  expect(screen.getByRole("link", { name: firstRecord })).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Page 1 of 12" })).toBeVisible();
  showTab("toolbar");
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveValue("");
});

it("offers every list state directly and keeps rows during refresh and retry", async () => {
  render(<UiFoundationShowcase />);
  showTab("list");
  const list = within(screen.getByRole("region", { name: "Data list" }));
  selectOption("List state", "Initial loading");
  expect(list.getByRole("status")).toHaveTextContent("Loading sample records");
  expect(
    list.getByRole("table", { hidden: true }).querySelector(".mantine-Skeleton-root"),
  ).toBeInTheDocument();

  selectOption("List state", "Refreshing");
  expect(list.getByRole("table", { name: "Sample records" })).toHaveAttribute("aria-busy", "true");
  expect(list.getByRole("link", { name: firstRecord })).toBeVisible();
  expect(list.getByRole("button", { name: "Next page" })).toBeDisabled();

  selectOption("List state", "Empty list");
  expect(list.getByText("No sample records yet")).toBeVisible();
  expect(list.getByText("0 records")).toBeVisible();
  selectOption("List state", "No results");
  expect(list.getByText("No matching sample records")).toBeVisible();
  fireEvent.click(list.getByRole("button", { name: "Clear search and filters" }));
  expect(list.getByRole("link", { name: firstRecord })).toBeVisible();

  selectOption("List state", "Load error");
  expect(list.getByRole("alert")).toHaveTextContent("Sample records could not be loaded.");
  expect(list.queryByRole("table")).not.toBeInTheDocument();
  await finishSampleRequest(() => {
    fireEvent.click(list.getByRole("button", { name: "Retry" }));
    expect(list.getByRole("status")).toHaveTextContent("Loading sample records");
  });
  expect(list.getByRole("link", { name: firstRecord })).toBeVisible();

  selectOption("List state", "Refresh error");
  expect(list.getByRole("alert")).toHaveTextContent("Sample refresh failed.");
  expect(list.getByRole("link", { name: firstRecord })).toBeVisible();
  await finishSampleRequest(() => {
    fireEvent.click(list.getByRole("button", { name: "Retry" }));
    expect(list.getByRole("link", { name: firstRecord })).toBeVisible();
  });
  expect(list.queryByRole("alert")).not.toBeInTheDocument();
});

it("previews a busy toolbar independently from refresh and the data list", () => {
  render(<UiFoundationShowcase />);
  showTab("toolbar");
  selectOption("Content width preview", "320 px");
  fireEvent.click(screen.getByLabelText("Active filters"));
  expect(screen.getByRole("button", { name: "Filters (1)" })).toBeVisible();
  fireEvent.click(screen.getByLabelText("Toolbar busy"));
  expect(screen.getByRole("searchbox")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Filters (1)" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "New record" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Toolbar busy"));
  fireEvent.click(screen.getByLabelText("Preview refreshing"));
  expect(screen.getByRole("button", { name: "Refresh records" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  expect(screen.getByRole("searchbox")).toBeEnabled();
  expect(screen.getByRole("button", { name: "New record" })).toBeEnabled();
  showTab("list");
  expect(screen.getByRole("table", { name: "Sample records" })).not.toHaveAttribute("aria-busy");
  expect(screen.getByText("2 records")).toBeVisible();
});

it("hands focus to the nested modal, dismisses only that modal on Escape and restores both triggers", async () => {
  render(<UiFoundationShowcase />);
  showTab("toolbar");
  submitSearch("NFV-001");
  showTab("list");
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
  expect(screen.getAllByRole("link", { name: firstRecord })).toHaveLength(1);
  showTab("toolbar");
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveValue("NFV-001");
});

it("shows the same record fields on the mobile detail page and restores the list on back", async () => {
  const media = new EventTarget();
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    if (query !== "(max-width: 47.99em)") return originalMatchMedia(query);
    return Object.assign(media, { matches: false, media: query }) as MediaQueryList;
  });
  render(<UiFoundationShowcase />);

  showTab("list");
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
  showTab("toolbar");
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
  showTab("list");
  expect(screen.getAllByRole("link", { name: "Kiểm tra tạo bản ghi" })).toHaveLength(1);
});

it("opens information and destructive confirmations at 400px and focuses the safe action", async () => {
  render(<UiFoundationShowcase />);
  showTab("details");
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
  showTab("list");
  expect(
    within(screen.getByRole("row", { name: /Khảo sát độ ẩm lớp phủ/ })).getByText("Bản nháp"),
  ).toBeVisible();
});

it("opens both forms and normal confirmation directly, with Select outside the editor scroll body", async () => {
  render(
    <MantineProvider env="default">
      <UiFoundationShowcase />
    </MantineProvider>,
  );
  showTab("details");
  const create = screen.getByRole("button", { name: "Create form" });
  fireEvent.click(create);
  const creation = await screen.findByRole("dialog", { name: "Create sample record" });
  fireEvent.click(within(creation).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(create).toHaveFocus());

  const edit = screen.getByRole("button", { name: "Edit form (640 px)" });
  fireEvent.click(edit);
  const editor = await screen.findByRole("dialog", { name: "Edit sample record" });
  expect(within(editor).getByRole("textbox", { name: "Record name" })).toHaveValue(firstRecord);
  const body = document.getElementById(editor.getAttribute("aria-describedby")!);
  const category = within(editor).getByRole("textbox", { name: "Category" });
  fireEvent.click(category);
  expect(category).toHaveAttribute("aria-expanded", "true");
  const options = document.getElementById(category.getAttribute("aria-controls")!);
  expect(options).toHaveAttribute("role", "listbox");
  expect(editor).toContainElement(options);
  expect(body).not.toContainElement(options);
  fireEvent.keyDown(category, { key: "Escape" });
  expect(category).toHaveAttribute("aria-expanded", "false");
  expect(editor).toBeVisible();
  fireEvent.keyDown(category, { key: "Escape" });
  await waitFor(() => expect(edit).toHaveFocus());

  const confirm = screen.getByRole("button", { name: "Confirmation" });
  fireEvent.click(confirm);
  const confirmation = await screen.findByRole("dialog", { name: "Confirm sample review" });
  await finishSampleRequest(() => {
    fireEvent.click(within(confirmation).getByRole("button", { name: "Confirm" }));
  });
  await waitFor(() => expect(confirm).toHaveFocus());
  showTab("list");
  expect(
    within(screen.getByRole("row", { name: /Khảo sát độ ẩm lớp phủ/ })).getByText("Đã duyệt"),
  ).toBeVisible();
});

it("preserves an edited draft after a mock request error and saves it once on retry", async () => {
  render(<UiFoundationShowcase />);
  showTab("details");
  fireEvent.click(screen.getByRole("checkbox", { name: "Fail next sample request" }));
  fireEvent.click(screen.getByRole("button", { name: "Open standard detail" }));
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
  showTab("toolbar");
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  selectOption("Status", "Tạm dừng");
  expect(screen.getByRole("button", { name: "Filters" })).toBeVisible();
  applyFilters();
  expect(screen.getByRole("button", { name: "Filters (1)" })).toBeVisible();
  showTab("list");
  expect(screen.getByRole("link", { name: "Kiểm tra rãnh thoát nước" })).toBeVisible();
  expect(screen.queryByRole("link", { name: firstRecord })).not.toBeInTheDocument();
  expect(screen.getByText("1 record", { exact: true })).toBeVisible();

  showTab("toolbar");
  submitSearch("  NFV-006  ");
  fireEvent.click(screen.getByRole("button", { name: "Filters (1)" }));
  selectOption("Category", recordCategories[2]);
  applyFilters();
  await finishSampleRequest(() => {
    const refresh = screen.getByRole("button", { name: "Refresh records" });
    fireEvent.click(refresh);
    expect(refresh).toBeDisabled();
    showTab("list");
    expect(screen.getByRole("link", { name: "Kiểm tra rãnh thoát nước" })).toBeVisible();
  });
  expect(screen.getByText("Sample records refreshed.")).toBeVisible();
  expect(screen.getByText("1 record", { exact: true })).toBeVisible();
  showTab("toolbar");
  expect(screen.getByRole("button", { name: "Filters (2)" })).toBeVisible();
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveValue("NFV-006");

  if (!screen.queryByRole("button", { name: "Clear filters" })) {
    fireEvent.click(screen.getByRole("button", { name: "Filters (2)" }));
  }
  expect(screen.getByRole("textbox", { name: "Category" })).toHaveValue(recordCategories[2]);
  expect(screen.getByRole("textbox", { name: "Status" })).toHaveValue("Tạm dừng");
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("button", { name: "Filters" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Category" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Status" })).toHaveValue("");
  showTab("list");
  expect(screen.getByRole("link", { name: "Kiểm tra rãnh thoát nước" })).toBeVisible();
  showTab("toolbar");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  showTab("list");
  expect(screen.getByRole("link", { name: firstRecord })).toBeVisible();

  showTab("toolbar");
  fireEvent.click(screen.getByRole("textbox", { name: "Toolbar controls" }));
  fireEvent.click(screen.getByRole("option", { name: "Search only" }));
  expect(screen.getByRole("searchbox", { name: "Search records" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Refresh records" })).not.toBeInTheDocument();
});

it("dismisses the nested Select before discarding unapplied filters on Escape", () => {
  render(<UiFoundationShowcase />);
  showTab("toolbar");
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
  fireEvent.click(trigger);
  expect(screen.getByRole("textbox", { name: "Category" })).toHaveValue("");
  showTab("list");
  expect(screen.getByRole("link", { name: firstRecord })).toBeVisible();
});

it("applies changes immediately when the preview switches to immediate filtering", () => {
  render(<UiFoundationShowcase />);
  showTab("toolbar");
  selectOption("Filter behavior", "Immediate");
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  selectOption("Status", "Tạm dừng");
  expect(screen.getByRole("button", { name: "Filters (1)" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Apply filters" })).not.toBeInTheDocument();
  showTab("list");
  expect(screen.getByRole("link", { name: "Kiểm tra rãnh thoát nước" })).toBeVisible();
});

it("keeps the applied filters when an outside click dismisses a changed draft", () => {
  render(<UiFoundationShowcase />);
  showTab("toolbar");
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  selectOption("Status", "Tạm dừng");
  applyFilters();
  const trigger = screen.getByRole("button", { name: "Filters (1)" });
  fireEvent.click(trigger);
  selectOption("Category", recordCategories[2]);
  fireEvent.mouseDown(screen.getByRole("searchbox", { name: "Search records" }));
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  expect(screen.getByRole("textbox", { name: "Category" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Status" })).toHaveValue("Tạm dừng");
  showTab("list");
  expect(screen.getByRole("link", { name: "Kiểm tra rãnh thoát nước" })).toBeVisible();
});

it("can omit just the filter while retaining search, refresh and the primary action", () => {
  render(<UiFoundationShowcase />);
  showTab("toolbar");
  selectOption("Toolbar controls", "Without filters");
  expect(screen.queryByRole("button", { name: "Filters" })).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search records" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Refresh records" })).toBeVisible();
  expect(screen.getByRole("button", { name: "New record" })).toBeVisible();
});

it("clears hidden filters in Search only while preserving the draft and applied search", () => {
  render(<UiFoundationShowcase />);
  showTab("toolbar");
  submitSearch("NFV-00");
  fireEvent.change(screen.getByRole("searchbox", { name: "Search records" }), {
    target: { value: "unsubmitted draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  selectOption("Status", "Tạm dừng");
  applyFilters();
  showTab("list");
  expect(screen.getByText("1 record", { exact: true })).toBeVisible();
  expect(screen.queryByRole("link", { name: firstRecord })).not.toBeInTheDocument();

  showTab("toolbar");
  selectOption("Toolbar controls", "Search only");
  expect(screen.queryByRole("button", { name: /Filters/ })).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveValue(
    "unsubmitted draft",
  );
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveAccessibleDescription(
    "Applied search: “NFV-00”",
  );
  showTab("list");
  expect(screen.getByText("9 records")).toBeVisible();
  expect(screen.getByRole("link", { name: firstRecord })).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  showTab("toolbar");
  selectOption("Toolbar controls", "All controls");
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  expect(screen.getByRole("textbox", { name: "Status" })).toHaveValue("");
  showTab("list");
  expect(screen.getByRole("navigation", { name: "Page 2 of 2" })).toBeVisible();
});

it("clears search and filters in Actions only and starts on the first page", () => {
  render(<UiFoundationShowcase />);
  showTab("toolbar");
  submitSearch("NFV-006");
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  selectOption("Status", "Tạm dừng");
  selectOption("Category", recordCategories[2]);
  applyFilters();
  showTab("list");
  expect(screen.getByText("1 record", { exact: true })).toBeVisible();

  showTab("toolbar");
  selectOption("Toolbar controls", "Actions only");
  expect(screen.queryByRole("searchbox", { name: "Search records" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Filters/ })).not.toBeInTheDocument();
  showTab("list");
  expect(screen.getByText("12 records")).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Page 1 of 3" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getByRole("link", { name: initialRecords[11].name })).toBeVisible();

  showTab("toolbar");
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
  render(
    <Tabs defaultValue="toolbar" keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="toolbar">{tabLabels.toolbar}</Tabs.Tab>
        <Tabs.Tab value="list">{tabLabels.list}</Tabs.Tab>
      </Tabs.List>
      <SampleRecordList records={records} selectedId={null} onOpen={vi.fn()} onCreate={vi.fn()} />
    </Tabs>,
  );
  submitSearch("NFV-00");
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  selectOption("Category", recordCategories[0]);
  selectOption("Status", "Chờ duyệt");
  applyFilters();
  showTab("list");
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));

  showTab("toolbar");
  selectOption("Toolbar controls", "Vietnamese labels");
  expect(screen.getByRole("searchbox", { name: "Tìm kiếm bản ghi" })).toHaveValue("NFV-00");
  showTab("list");
  expect(screen.getByText("7 records")).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Page 2 of 2" })).toBeVisible();
  showTab("toolbar");
  const viFilters = screen.getByRole("button", { name: "Bộ lọc quan sát (2)" });
  if (viFilters.getAttribute("aria-expanded") !== "true") fireEvent.click(viFilters);
  expect(screen.getByRole("textbox", { name: "Danh mục" })).toHaveValue(recordCategories[0]);
  expect(screen.getByRole("textbox", { name: "Trạng thái" })).toHaveValue("Chờ duyệt");

  selectOption("Toolbar controls", "All controls");
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveValue("NFV-00");
  expect(screen.getByRole("button", { name: "Filters (2)" })).toBeVisible();
  await finishSampleRequest(() => {
    fireEvent.click(screen.getByRole("button", { name: "Refresh records" }));
    showTab("list");
    expect(screen.getByRole("navigation", { name: "Page 2 of 2" })).toBeVisible();
  });
  expect(screen.getByRole("navigation", { name: "Page 2 of 2" })).toBeVisible();

  showTab("toolbar");
  selectOption("Toolbar controls", "Search only");
  showTab("list");
  expect(screen.getByText("9 records")).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Page 1 of 2" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  showTab("toolbar");
  selectOption("Toolbar controls", "All controls");
  selectOption("Toolbar controls", "Search only");
  showTab("list");
  expect(screen.getByRole("navigation", { name: "Page 2 of 2" })).toBeVisible();
});

it("shows all six Badge and Alert roles and previews each dismissible Notification", () => {
  render(<UiFoundationShowcase />);
  showTab("components");
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
    fireEvent.click(
      within(notification).getByRole("button", { name: "Dismiss sample notification" }),
    );
    expect(feedback.queryByRole("status")).not.toBeInTheDocument();
    expect(feedback.getByRole("textbox", { name: "Notification role" })).toHaveFocus();
  }
});

it("lets reviewers compare native default controls and operate the password toggle", () => {
  render(<UiFoundationShowcase />);
  showTab("components");
  const forms = within(screen.getByRole("region", { name: "Form inputs" }));
  expect(forms.getByRole("heading", { name: "Input interaction" })).toBeVisible();
  expect(forms.getByRole("textbox", { name: "Populated input" })).not.toHaveValue("");
  expect(forms.getByRole("textbox", { name: "Invalid code" })).toBeInvalid();
  expect(forms.getByRole("textbox", { name: "Read-only code" })).toHaveAttribute("readonly");
  expect(forms.getByRole("textbox", { name: "Disabled field" })).toBeDisabled();
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

  showTab("list");
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
