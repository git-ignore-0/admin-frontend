import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  AdminBreadcrumbForRoute,
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";

afterEach(cleanup);

const fallback = [{ label: "Chi tiết người dùng" }];
const first = [{ label: "Người dùng", href: "/users" }, { label: "Nguyễn Văn An" }];
const second = [{ label: "Người dùng", href: "/users" }, { label: "Trần Thị Bích" }];

function CurrentScreen({ onRender }: { onRender?: (label: string) => void }) {
  const items = useAdminBreadcrumbs(fallback);
  const label = items.at(-1)?.label ?? "";
  onRender?.(label);
  return <span>{label}</span>;
}

it("uses only the active route's registration during navigation and delayed data loading", () => {
  const seen: string[] = [];
  function page(pathname: string, ready: boolean) {
    return (
      <AdminBreadcrumbProvider pathname={pathname}>
        <CurrentScreen onRender={(label) => seen.push(label)} />
        <AdminBreadcrumbForRoute pathname="/users/a" items={first} key="first" />
        {ready && <AdminBreadcrumbForRoute pathname="/users/b" items={second} key="second" />}
      </AdminBreadcrumbProvider>
    );
  }

  const { rerender } = render(page("/users/a", false));
  expect(screen.getByText("Nguyễn Văn An")).toBeVisible();
  seen.length = 0;

  rerender(page("/users/b", false));
  expect(screen.getByText("Chi tiết người dùng")).toBeVisible();
  rerender(page("/users/b", true));
  expect(screen.getByText("Trần Thị Bích")).toBeVisible();
  expect(seen).not.toContain("Nguyễn Văn An");
});

it("restores the localized fallback when record data becomes unavailable", () => {
  function page(ready: boolean) {
    return (
      <AdminBreadcrumbProvider pathname="/users/a">
        <CurrentScreen />
        <AdminBreadcrumbForRoute pathname="/users/a" items={ready ? first : undefined} />
      </AdminBreadcrumbProvider>
    );
  }

  const { rerender } = render(page(true));
  expect(screen.getByText("Nguyễn Văn An")).toBeVisible();
  rerender(page(false));
  expect(screen.getByText("Chi tiết người dùng")).toBeVisible();
});

it("cleans up an unmounted registration without clearing a newer owner of the route", () => {
  function page(showOld: boolean, showNew: boolean) {
    return (
      <AdminBreadcrumbProvider pathname="/users/a">
        <CurrentScreen />
        {showOld && <AdminBreadcrumbForRoute pathname="/users/a" items={first} key="old" />}
        {showNew && <AdminBreadcrumbForRoute pathname="/users/a" items={second} key="new" />}
      </AdminBreadcrumbProvider>
    );
  }

  const { rerender } = render(page(true, false));
  expect(screen.getByText("Nguyễn Văn An")).toBeVisible();
  rerender(page(true, true));
  expect(screen.getByText("Trần Thị Bích")).toBeVisible();
  rerender(page(false, true));
  expect(screen.getByText("Trần Thị Bích")).toBeVisible();
  rerender(page(false, false));
  expect(screen.getByText("Chi tiết người dùng")).toBeVisible();
});

it("resets registration immediately when the shell changes sessions at the same URL", () => {
  const seen: string[] = [];
  const { rerender } = render(
    <AdminBreadcrumbProvider key="session-a" pathname="/users/a">
      <CurrentScreen />
      <AdminBreadcrumbForRoute pathname="/users/a" items={first} />
    </AdminBreadcrumbProvider>,
  );
  expect(screen.getByText("Nguyễn Văn An")).toBeVisible();

  rerender(
    <AdminBreadcrumbProvider key="session-b" pathname="/users/a">
      <CurrentScreen onRender={(label) => seen.push(label)} />
    </AdminBreadcrumbProvider>,
  );

  expect(screen.getByText("Chi tiết người dùng")).toBeVisible();
  expect(seen).not.toContain("Nguyễn Văn An");
});
