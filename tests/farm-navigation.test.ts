import { expect, it, vi } from "vitest";

import FarmsPage from "@/app/(admin)/farms/page";
import LegacyTrackerList from "@/app/(admin)/tracker-farms/page";
import LegacyTrackerCreate from "@/app/(admin)/tracker-farms/new/page";
import LegacyTrackerDetail from "@/app/(admin)/tracker-farms/[id]/page";
import { farmHref, legacyTrackerHref } from "@/lib/farm-navigation";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

it("redirects each legacy Tracker route and keeps only its supported query context", async () => {
  const searchParams = Promise.resolve({
    search: ["Đà Lạt", "ignored"],
    page: "2",
    is_active: "false",
    next: "https://other.example",
    tab: "information",
  });
  const query = "search=%C4%90%C3%A0+L%E1%BA%A1t&is_active=false&page=2";
  await LegacyTrackerList({ searchParams });
  await LegacyTrackerCreate({ searchParams });
  await LegacyTrackerDetail({ params: Promise.resolve({ id: "farm-1" }), searchParams });
  expect(redirect.mock.calls).toEqual([
    [`/farms?${query}`],
    [`/farms?${query}`],
    [`/farms/farm-1?${query}&tab=tracker`],
  ]);
});

it.each([{ tab: "tracker" }, { setup: "tracker" }, { view: "tracker" }])(
  "normalizes an obsolete Farm list query with %j",
  async (obsolete) => {
    redirect.mockClear();
    await FarmsPage({
      searchParams: Promise.resolve({
        search: "green",
        is_active: "true",
        page: "3",
        ...obsolete,
      }),
    });
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/farms?search=green&is_active=true&page=3");
  },
);

it("keeps normalized Farm lists on the same route", async () => {
  redirect.mockClear();
  await FarmsPage({ searchParams: Promise.resolve({ search: "green", page: "2" }) });
  expect(redirect).not.toHaveBeenCalled();
});

it("preserves detail tabs and supported list context through the editor", () => {
  const context = new URLSearchParams(
    "search=green&page=4&is_active=false&view=tracker&setup=tracker&tab=information",
  );
  expect(farmHref(context)).toBe("/farms?search=green&is_active=false&page=4");
  expect(farmHref(context, { mode: "new" })).toBe("/farms/new?search=green&is_active=false&page=4");
  expect(farmHref(context, { id: "farm-1", mode: "edit" })).toBe(
    "/farms/farm-1/edit?search=green&is_active=false&page=4&tab=information",
  );
  expect(farmHref(context, { id: "farm-1", tab: "tracker" })).toBe(
    "/farms/farm-1?search=green&is_active=false&page=4&tab=tracker",
  );
});

it("keeps unsafe legacy record paths and unsupported filters out of redirects", () => {
  expect(legacyTrackerHref({ page: "10001", is_active: "maybe" }, "../other")).toBe("/farms");
});
