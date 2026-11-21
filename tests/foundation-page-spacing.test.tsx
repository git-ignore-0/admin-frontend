import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PageHeading } from "@/components/page-heading";
import { DetailPageHeading } from "@/components/detail-page-heading";
afterEach(cleanup);
it("lets a gap-owning page suppress extra header margins without changing heading semantics", () => {
  render(
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeading title="List" bottomSpacing={0} />
      <DetailPageHeading title="Record" backHref="/users" backLabel="Users" bottomSpacing={0} />
    </div>,
  );
  expect(
    screen.getByRole("heading", { name: "List", level: 1 }).closest("header")?.style.marginBottom,
  ).toBe("0rem");
  expect(
    screen.getByRole("heading", { name: "Record", level: 1 }).closest("header")?.style.marginBottom,
  ).toBe("0rem");
  expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/users");
});
