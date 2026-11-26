import { expect, it, vi } from "vitest";

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
    [`/farms?${query}&tab=tracker`],
    [`/farms?${query}&setup=tracker`],
    [`/farms/farm-1?${query}&tab=tracker`],
  ]);
});

it("distinguishes a Tracker parent tab from the current detail tab", () => {
  const context = new URLSearchParams("search=green&page=4&view=tracker&tab=information");
  expect(farmHref(context)).toBe("/farms?search=green&page=4&tab=tracker");
  expect(farmHref(context, { id: "farm-1", mode: "edit" })).toBe(
    "/farms/farm-1/edit?search=green&page=4&view=tracker&tab=information",
  );
  expect(legacyTrackerHref({ page: "10001", is_active: "maybe" }, "../other")).toBe(
    "/farms?tab=tracker",
  );
});
