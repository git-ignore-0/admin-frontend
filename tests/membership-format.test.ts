import { describe, expect, it } from "vitest";

import { formatMembershipUnits } from "@/lib/membership-format";

describe("membership quantity formatting", () => {
  it("uses a localized unit fallback when the unit size is invalid", () => {
    expect(formatMembershipUnits("invalid", 2, "vi")).toBe("2 đơn vị");
    expect(formatMembershipUnits("invalid", 2, "en")).toBe("2 units");
  });

  it("keeps exact decimal multiplication for valid unit sizes", () => {
    expect(formatMembershipUnits("0.5", 2, "en")).toBe("1");
  });
});
