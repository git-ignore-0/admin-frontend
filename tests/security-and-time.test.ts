import { describe, expect, it, vi } from "vitest";

import { adminDictionaries } from "@/lib/admin-i18n";
import { requestErrorMessage } from "@/lib/client-error";
import { firstValidationField } from "@/lib/client-api";
import { isTrustedAdminRequest } from "@/lib/csrf";
import { publicSiteOrigin } from "@/lib/public-site";
import { formatZonedDateTimeInput, zonedDateTimeInputToIso } from "@/lib/zoned-date-time";

describe("admin request protection", () => {
  const origin = "https://admin.naturalfarmingvietnam.com";

  it("allows reads but requires both same origin and marker for mutations", () => {
    expect(isTrustedAdminRequest("GET", null, origin, null)).toBe(true);
    expect(isTrustedAdminRequest("POST", origin, origin, "1")).toBe(true);
    expect(
      isTrustedAdminRequest("POST", "https://forum.naturalfarmingvietnam.com", origin, "1"),
    ).toBe(false);
    expect(isTrustedAdminRequest("POST", origin, origin, null)).toBe(false);
  });
});

describe("public site environment", () => {
  it("accepts a clean origin and rejects paths or credentials", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.naturalfarmingvietnam.com/");
    expect(publicSiteOrigin()).toBe("https://preview.naturalfarmingvietnam.com");

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com/workshops");
    expect(() => publicSiteOrigin()).toThrow(/origin/i);

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://user:secret@example.com");
    expect(() => publicSiteOrigin()).toThrow(/credentials/i);
    vi.unstubAllEnvs();
  });
});

describe("workshop timezone conversion", () => {
  it("shows and parses wall time in the workshop timezone", () => {
    const instant = "2026-07-20T02:00:00.000Z";
    expect(formatZonedDateTimeInput(instant, "Asia/Ho_Chi_Minh")).toBe("2026-07-20T09:00");
    expect(zonedDateTimeInputToIso("2026-07-20T09:00", "Asia/Ho_Chi_Minh")).toBe(instant);
    expect(formatZonedDateTimeInput(instant, "Asia/Singapore")).toBe("2026-07-20T10:00");
  });
});

describe("localized API errors", () => {
  it("explains backend availability and validation errors in the active language", () => {
    expect(requestErrorMessage(new Error("upstream_unavailable"), adminDictionaries.vi)).toContain(
      "backend",
    );

    const validationError = Object.assign(new Error("validation_error"), {
      field: "links",
      status: 400,
    });
    expect(
      requestErrorMessage(validationError, adminDictionaries.en, {
        links: "Links",
      }),
    ).toContain("Links");
  });

  it("reports the nested translation field instead of the translations wrapper", () => {
    expect(firstValidationField({ translations: [{ body: ["Invalid link"] }] })).toBe("body");
  });
});
