import { describe, expect, it } from "vitest";

import { acceptPhoneInput, normalizeVietnamPhone } from "@/lib/csa-customer-input";
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
    expect(acceptPhoneInput("0912345678")).toBe("0912345678");
    expect(normalizeVietnamPhone("0912345678")).toBe("+84912345678");
    expect(normalizeVietnamPhone("+84912345678")).toBe("+84912345678");
  });

  it("rejects invalid phone characters and impossible lengths", () => {
    expect(acceptPhoneInput("0912 345 678")).toBeNull();
    expect(acceptPhoneInput("0912abc")).toBeNull();
    expect(normalizeVietnamPhone("0123")).toBeNull();
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
