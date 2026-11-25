import { describe, expect, it } from "vitest";

import { formatVietnamPhone, normalizeLocalPhone, normalizeVietnamPhone } from "@/lib/phone-number";
import {
  addMonthsToDate,
  membershipWouldOverlap,
  suggestedMembershipStart,
} from "@/lib/membership-schedule";
import type { AdminMembership } from "@/lib/types";

function scheduled(start: string, end: string, status: AdminMembership["status"] = "scheduled") {
  return { start_date: start, end_date: end, status } as AdminMembership;
}

describe("CSA customer input and package scheduling", () => {
  it("keeps a domestic leading zero and normalizes the submitted phone", () => {
    expect(normalizeLocalPhone("0912345678", "contact")).toBe("+84912345678");
    expect(normalizeLocalPhone("0912345678", "identity")).toBe("+84912345678");
    expect(normalizeLocalPhone("02412345678", "identity")).toBe("+842412345678");
    expect(normalizeLocalPhone("0612345678", "contact")).toBe("+84612345678");
    expect(normalizeLocalPhone("0612345678", "identity")).toBeNull();
    expect(normalizeVietnamPhone("0912345678")).toBe("+84912345678");
    expect(normalizeVietnamPhone("84912345678")).toBe("+84912345678");
    expect(normalizeVietnamPhone("+84912345678")).toBe("+84912345678");
  });

  it.each([
    "",
    "0123",
    "84912345678",
    "+84912345678",
    "0912 345 678",
    "0912-345678",
    "0912abc",
    "0912345678!",
    "0912345678 ",
    "0912345678\n",
    "091234567899",
  ])("rejects non-local or invalid input %j", (value) => {
    expect(normalizeLocalPhone(value, "contact")).toBeNull();
    expect(normalizeLocalPhone(value, "identity")).toBeNull();
  });

  it.each([
    ["+84912345678", "0912345678"],
    ["(+84) 241-234.5678", "02412345678"],
    ["0912345678", "0912345678"],
    ["Legacy contact", "Legacy contact"],
    ["+12025550123", "+12025550123"],
    ["", ""],
    [null, null],
  ])("formats a recognized stored phone and preserves other values %j", (value, displayed) => {
    expect(formatVietnamPhone(value)).toBe(displayed);
  });

  it("clamps month-end dates and treats the package end date as exclusive", () => {
    expect(addMonthsToDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(
      membershipWouldOverlap([scheduled("2026-09-08", "2026-12-08")], "2026-12-08", "2027-03-08"),
    ).toBe(false);
    expect(
      membershipWouldOverlap([scheduled("2026-09-08", "2026-12-08")], "2026-12-07", "2027-03-07"),
    ).toBe(true);
  });

  it("suggests the latest non-revoked future end date", () => {
    expect(
      suggestedMembershipStart(
        [
          scheduled("2026-09-08", "2026-12-08"),
          scheduled("2026-12-08", "2027-03-08"),
          scheduled("2027-03-08", "2027-06-08", "revoked"),
        ],
        "2026-09-08",
      ),
    ).toBe("2027-03-08");
  });
});
