import { describe, expect, it } from "vitest";

import { buildBackendTarget, isAllowedBackendRequest } from "@/lib/backend-target";

describe("backend API target", () => {
  const origin = "http://127.0.0.1:8000";

  it("adds the trailing slash required by the Django REST Framework router", () => {
    const target = buildBackendTarget(origin, ["admin", "workshops"], "");

    expect(target.toString()).toBe("http://127.0.0.1:8000/api/v1/admin/workshops/");
  });

  it("adds the trailing slash to workshop detail and action routes", () => {
    const target = buildBackendTarget(origin, ["admin", "workshops", "workshop-id", "publish"], "");

    expect(target.toString()).toBe(
      "http://127.0.0.1:8000/api/v1/admin/workshops/workshop-id/publish/",
    );
  });

  it("adds DRF trailing slashes to all Testimonial router routes", () => {
    expect(buildBackendTarget(origin, ["admin", "testimonials"], "").toString()).toBe(
      "http://127.0.0.1:8000/api/v1/admin/testimonials/",
    );
    expect(
      buildBackendTarget(
        origin,
        ["admin", "testimonials", "testimonial-id", "publish"],
        "",
      ).toString(),
    ).toBe("http://127.0.0.1:8000/api/v1/admin/testimonials/testimonial-id/publish/");
  });

  it("does not add a slash to endpoints that intentionally omit it", () => {
    const target = buildBackendTarget(origin, ["admin", "media"], "?locale=vi");

    expect(target.toString()).toBe("http://127.0.0.1:8000/api/v1/admin/media?locale=vi");
  });

  it("allowlists Membership routes by exact method and path", () => {
    expect(isAllowedBackendRequest("GET", ["admin", "membership-requests"])).toBe(false);
    expect(isAllowedBackendRequest("GET", ["admin", "membership-banks"])).toBe(false);
    expect(isAllowedBackendRequest("POST", ["admin", "membership-banks"])).toBe(false);
    expect(isAllowedBackendRequest("GET", ["admin", "membership-products"])).toBe(true);
    expect(isAllowedBackendRequest("GET", ["admin", "membership-packages"])).toBe(true);
    expect(isAllowedBackendRequest("GET", ["admin", "membership-categories"])).toBe(false);
    expect(
      isAllowedBackendRequest("POST", ["admin", "membership-requests", "request-id", "approve"]),
    ).toBe(false);
    expect(isAllowedBackendRequest("POST", ["admin", "membership-usage", "usage-id", "undo"])).toBe(
      true,
    );
    expect(isAllowedBackendRequest("POST", ["admin", "memberships"])).toBe(true);
    expect(
      isAllowedBackendRequest("POST", ["admin", "memberships", "membership-id", "revoke"]),
    ).toBe(true);
    expect(
      isAllowedBackendRequest("GET", ["admin", "memberships", "membership-id", "revoke"]),
    ).toBe(false);
    expect(
      isAllowedBackendRequest("DELETE", ["admin", "memberships", "membership-id", "revoke"]),
    ).toBe(false);
    expect(
      isAllowedBackendRequest("POST", ["admin", "memberships", "membership-id", "unknown"]),
    ).toBe(false);
    expect(isAllowedBackendRequest("GET", ["memberships", "current"])).toBe(false);
  });

  it("allowlists only the required Testimonial methods and exact actions", () => {
    expect(isAllowedBackendRequest("GET", ["admin", "testimonials"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "testimonials"])).toBe(true);
    expect(isAllowedBackendRequest("PATCH", ["admin", "testimonials"])).toBe(false);
    expect(isAllowedBackendRequest("GET", ["admin", "testimonials", "item-id"])).toBe(true);
    expect(isAllowedBackendRequest("PATCH", ["admin", "testimonials", "item-id"])).toBe(true);
    expect(isAllowedBackendRequest("DELETE", ["admin", "testimonials", "item-id"])).toBe(false);
    expect(isAllowedBackendRequest("POST", ["admin", "testimonials", "media"])).toBe(true);
    expect(isAllowedBackendRequest("GET", ["admin", "testimonials", "media"])).toBe(false);
    expect(isAllowedBackendRequest("POST", ["admin", "testimonials", "item-id", "publish"])).toBe(
      true,
    );
    expect(isAllowedBackendRequest("POST", ["admin", "testimonials", "item-id", "hide"])).toBe(
      true,
    );
    expect(isAllowedBackendRequest("POST", ["admin", "testimonials", "item-id", "unpublish"])).toBe(
      true,
    );
    expect(isAllowedBackendRequest("GET", ["admin", "testimonials", "item-id", "publish"])).toBe(
      false,
    );
    expect(isAllowedBackendRequest("POST", ["admin", "testimonials", "item-id", "delete"])).toBe(
      false,
    );
    expect(
      isAllowedBackendRequest("POST", ["admin", "testimonials", "item-id", "publish", "extra"]),
    ).toBe(false);
  });

  it("allowlists only the tracker farm CRUD and reorder routes", () => {
    expect(isAllowedBackendRequest("GET", ["admin", "tracker-farms"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "tracker-farms"])).toBe(true);
    expect(isAllowedBackendRequest("PATCH", ["admin", "tracker-farms"])).toBe(false);
    expect(isAllowedBackendRequest("PATCH", ["admin", "tracker-farms", "farm-id"])).toBe(true);
    expect(isAllowedBackendRequest("DELETE", ["admin", "tracker-farms", "farm-id"])).toBe(true);
    expect(isAllowedBackendRequest("GET", ["admin", "tracker-farms", "farm-id"])).toBe(false);
    expect(isAllowedBackendRequest("PATCH", ["admin", "tracker-farms", "reorder"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "tracker-farms", "reorder"])).toBe(false);
    expect(buildBackendTarget(origin, ["admin", "tracker-farms", "reorder"], "").toString()).toBe(
      "http://127.0.0.1:8000/api/v1/admin/tracker-farms/reorder",
    );
  });
});
