import { Tabs } from "@mantine/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import UiFoundationPage from "@/app/(admin)/dev/ui-foundation/page";
import SampleNavigationPage from "@/app/(admin)/dev/ui-foundation/navigation/[...example]/page";
import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { AdminHeaderContent } from "@/components/admin-header";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { SampleRecordList } from "@/components/ui-foundation-showcase/record-list";
import { initialRecords } from "@/components/ui-foundation-showcase/sample-records";
import { getAdminLocale } from "@/lib/admin-locale";

const root = "/dev/ui-foundation";
const navigation = `${root}/navigation`;
const showcaseLabel = "Nền tảng giao diện";
const longRecord =
  "Đánh giá phân ủ từ phụ phẩm thực vật sau thu hoạch tại các luống đối chứng phía bắc sau nhiều đợt mưa liên tiếp";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/lib/admin-locale", () => ({ getAdminLocale: vi.fn() }));

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.mocked(getAdminLocale).mockResolvedValue("vi");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  window.history.replaceState(null, "", "/");
});

const fallback = [{ label: showcaseLabel }];
function RouteHeader() {
  return <AdminHeaderContent items={useAdminBreadcrumbs(fallback)} />;
}

function destination(href: string) {
  const url = new URL(href, window.location.origin);
  window.history.replaceState(null, "", url.href);
  return {
    pathname: url.pathname,
    searchParams: Promise.resolve(Object.fromEntries(url.searchParams)),
  };
}

async function renderChild(href: string) {
  const { pathname, searchParams } = destination(href);
  const example = pathname.slice(navigation.length + 1).split("/");
  const child = await SampleNavigationPage({ params: Promise.resolve({ example }), searchParams });
  return render(
    <AdminI18nProvider initialLocale="vi">
      <AdminBreadcrumbProvider pathname={pathname} search={window.location.search}>
        <RouteHeader />
        {child}
      </AdminBreadcrumbProvider>
    </AdminI18nProvider>,
  );
}

async function renderShowcase(href: string) {
  const { searchParams } = destination(href);
  return render(
    <AdminI18nProvider initialLocale="vi">
      {await UiFoundationPage({ searchParams })}
    </AdminI18nProvider>,
  );
}

it.each(["production", "test"])("guards sample pages in %s", async (environment) => {
  vi.stubEnv("NODE_ENV", environment);
  const args = {
    params: Promise.resolve({ example: ["NFV-001"] }),
    searchParams: Promise.resolve({}),
  };

  await expect(SampleNavigationPage(args)).rejects.toThrow("NOT_FOUND");
});

it.each(
  [["unknown"], ["NFV-001", "clone"], ["NFV-001", "edit", "extra"]].map((example) => [example]),
)("rejects unknown sample paths %j", async (example) => {
  await expect(
    SampleNavigationPage({
      params: Promise.resolve({ example }),
      searchParams: Promise.resolve({}),
    }),
  ).rejects.toThrow("NOT_FOUND");
});

it("links both ancestors on direct entry to a deeper sample and returns to Navigation", async () => {
  const deep = await renderChild(`${navigation}/NFV-004/edit`);
  const breadcrumbs = within(screen.getByRole("navigation"));
  const ancestor = breadcrumbs.getByRole("link", { name: longRecord });
  expect(ancestor).toHaveAttribute("href", `${navigation}/NFV-004`);
  expect(breadcrumbs.getByText("Chỉnh sửa")).toHaveAttribute("aria-current", "page");
  expect(breadcrumbs.queryByRole("link", { name: "Chỉnh sửa" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Bản nháp ghi chú", level: 2 })).toBeVisible();

  const childHref = ancestor.getAttribute("href")!;
  deep.unmount();
  const child = await renderChild(childHref);
  const childBreadcrumbs = within(screen.getByRole("navigation"));
  expect(childBreadcrumbs.getByText(longRecord)).toHaveAttribute("aria-current", "page");
  expect(childBreadcrumbs.queryByRole("link", { name: longRecord })).toBeNull();
  expect(screen.getByRole("heading", { name: "Record information", level: 2 })).toBeVisible();
  const parent = childBreadcrumbs.getByRole("link", { name: showcaseLabel });
  expect(parent).toHaveAttribute("href", `${root}?review=navigation`);

  const parentHref = parent.getAttribute("href")!;
  child.unmount();
  await renderShowcase(parentHref);
  expect(screen.getByRole("tab", { name: "2.6. Header & Navigation" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

it("resumes applied search, filter and pagination from the child breadcrumb", async () => {
  const parent = await renderShowcase(root);
  const toolbarTab = () => screen.getByRole("tab", { name: "2.3. List Toolbar" });
  fireEvent.click(toolbarTab());
  const search = screen.getByRole("searchbox", { name: "Search records" });
  fireEvent.change(search, { target: { value: "sau mưa" } });
  fireEvent.submit(search.closest("form")!);
  fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  fireEvent.click(screen.getByRole("textbox", { name: "Category" }));
  fireEvent.click(screen.getByRole("option", { name: "Đất và dinh dưỡng" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

  const listTab = () => screen.getByRole("tab", { name: "2.4. Data List" });
  fireEvent.click(listTab());
  fireEvent.click(screen.getByRole("textbox", { name: "Record set" }));
  fireEvent.click(screen.getByRole("option", { name: "Many pages" }));
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  const table = () => within(screen.getByRole("table", { name: "Sample records" }));
  const before = table()
    .getAllByRole("row")
    .map((row) => row.textContent);
  const openPage = screen.getByRole("link", { name: /^Open fixed sample page:/ });
  const childHref = openPage.getAttribute("href")!;
  expect(childHref).toMatch(/^\/dev\/ui-foundation\/navigation\/NFV-025\?/);
  expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual(
    Object.fromEntries(new URL(childHref, window.location.origin).searchParams),
  );

  parent.unmount();
  const child = await renderChild(childHref);
  const returnLink = within(screen.getByRole("navigation")).getByRole("link", {
    name: showcaseLabel,
  });
  const returnHref = returnLink.getAttribute("href")!;
  child.unmount();
  await renderShowcase(returnHref);

  expect(listTab()).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("navigation", { name: "Page 2 of 4" })).toBeVisible();
  expect(
    table()
      .getAllByRole("row")
      .map((row) => row.textContent),
  ).toEqual(before);
  fireEvent.click(toolbarTab());
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveValue("sau mưa");
  fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
  expect(screen.getByRole("textbox", { name: "Category" })).toHaveValue("Đất và dinh dưỡng");
});

it("reconciles the list records and stored page when changing to a smaller record set", async () => {
  await renderShowcase(`${root}?review=list&records=many&page=12`);
  const table = within(screen.getByRole("table", { name: "Sample records" }));
  expect(table.getByText("NFV-060")).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Page 12 of 12" })).toBeVisible();

  fireEvent.click(screen.getByRole("textbox", { name: "Record set" }));
  fireEvent.click(screen.getByRole("option", { name: "Standard" }));
  expect(table.getByText("NFV-012")).toBeVisible();
  expect(table.queryByText("NFV-060")).not.toBeInTheDocument();
  expect(screen.getByText("12 records")).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Page 3 of 3" })).toBeVisible();
  expect(new URLSearchParams(window.location.search).get("page")).toBe("3");

  fireEvent.click(screen.getByRole("textbox", { name: "Record set" }));
  fireEvent.click(screen.getByRole("option", { name: "Many pages" }));
  expect(table.getByText("NFV-015")).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Page 3 of 12" })).toBeVisible();
});

it("labels child links with the fixed fixture when the visible in-memory record was edited", async () => {
  destination(`${root}?review=list`);
  render(
    <Tabs defaultValue="list">
      <SampleRecordList
        records={[{ ...initialRecords[0], name: "Locally edited name" }]}
        selectedId={null}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
      />
    </Tabs>,
  );
  expect(screen.getByRole("link", { name: "Locally edited name" })).toHaveAttribute(
    "href",
    "#record-NFV-001",
  );
  expect(
    screen.getByRole("link", { name: `Open fixed sample page: ${initialRecords[0].name}` }),
  ).toHaveAttribute("href", `${navigation}/NFV-001?review=list`);
});

it("restores the actual URL context on history traversal while the showcase stays mounted", async () => {
  await renderShowcase(`${root}?review=list&page=3`);
  expect(screen.getByRole("navigation", { name: "Page 3 of 3" })).toBeVisible();

  act(() => {
    window.history.replaceState(null, "", `${root}?review=toolbar&q=NFV-006&status=danger`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.getByRole("tab", { name: "2.3. List Toolbar" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("searchbox", { name: "Search records" })).toHaveValue("NFV-006");
  fireEvent.click(screen.getByRole("button", { name: "Filters (1)" }));
  expect(screen.getByRole("textbox", { name: "Status" })).toHaveValue("Tạm dừng");

  act(() => {
    window.history.replaceState(null, "", `${root}?review=list&page=3`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.getByRole("navigation", { name: "Page 3 of 3" })).toBeVisible();
  expect(screen.getByText("12 records")).toBeVisible();
});
