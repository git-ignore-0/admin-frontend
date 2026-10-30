import { describe, expect, it } from "vitest";

import { buildBackendTarget, isAllowedBackendRequest } from "@/lib/backend-target";

describe("backend API target", () => {
  const origin = "http://127.0.0.1:8000";

  it("allowlists exact Farm, media, product and weekly-supply methods", () => {
    const farm = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    const product = "11111111-1111-4111-8111-111111111111";
    const base = ["admin", "farms"];
    expect(isAllowedBackendRequest("GET", base)).toBe(true);
    expect(isAllowedBackendRequest("POST", base)).toBe(true);
    for (const method of ["GET", "PATCH", "DELETE"])
      expect(isAllowedBackendRequest(method, [...base, farm])).toBe(true);
    expect(isAllowedBackendRequest("POST", [...base, "media"])).toBe(true);
    expect(isAllowedBackendRequest("DELETE", [...base, "media", product])).toBe(true);
    for (const method of ["GET", "POST", "PATCH", "DELETE"])
      expect(isAllowedBackendRequest(method, [...base, farm, "growth-tracker"])).toBe(true);
    expect(isAllowedBackendRequest("GET", [...base, farm, "products"])).toBe(true);
    expect(isAllowedBackendRequest("GET", [...base, farm, "available-products"])).toBe(true);
    expect(isAllowedBackendRequest("POST", [...base, farm, "available-products"])).toBe(false);
    expect(isAllowedBackendRequest("POST", [...base, farm, "products"])).toBe(true);
    expect(isAllowedBackendRequest("PATCH", [...base, farm, "products", product])).toBe(true);
    expect(isAllowedBackendRequest("DELETE", [...base, farm, "products", product])).toBe(true);
    expect(isAllowedBackendRequest("GET", [...base, farm, "products", product, "weeks"])).toBe(
      true,
    );
    expect(
      isAllowedBackendRequest("PUT", [...base, farm, "products", product, "weeks", "2026-10-19"]),
    ).toBe(true);
    expect(
      isAllowedBackendRequest("PUT", [...base, farm, "products", product, "weeks", "2026-10-20"]),
    ).toBe(false);
    expect(isAllowedBackendRequest("GET", [...base, "bad-id"])).toBe(false);
    expect(isAllowedBackendRequest("DELETE", [...base, "media", "bad-id"])).toBe(false);
    expect(isAllowedBackendRequest("POST", [...base, farm, "products", product])).toBe(false);
    expect(
      isAllowedBackendRequest("GET", [...base, farm, "products", product, "weeks", "2026-10-19"]),
    ).toBe(false);
    expect(isAllowedBackendRequest("GET", [...base, farm, "unknown"])).toBe(false);
  });

  it("allowlists only the Commerce catalog routes and methods", () => {
    const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    for (const resource of ["store-categories", "store-products"]) {
      const base = ["admin", resource];
      expect(isAllowedBackendRequest("GET", base)).toBe(true);
      expect(isAllowedBackendRequest("POST", base)).toBe(true);
      for (const method of ["GET", "PATCH", "DELETE"]) {
        expect(isAllowedBackendRequest(method, [...base, id])).toBe(true);
      }
      expect(isAllowedBackendRequest("POST", [...base, id])).toBe(false);
      expect(isAllowedBackendRequest("GET", [...base, "bad-id"])).toBe(false);
      expect(isAllowedBackendRequest("GET", [...base, id, "extra"])).toBe(false);
    }
    expect(isAllowedBackendRequest("POST", ["admin", "store-products", "media"])).toBe(true);
    expect(isAllowedBackendRequest("DELETE", ["admin", "store-products", "media", id])).toBe(true);
    expect(isAllowedBackendRequest("GET", ["admin", "store-products", "media"])).toBe(false);
    expect(isAllowedBackendRequest("DELETE", ["admin", "store-products", "media", "bad-id"])).toBe(
      false,
    );
    expect(buildBackendTarget(origin, ["admin", "store-products"], "?page=2").toString()).toBe(
      "http://127.0.0.1:8000/api/v1/admin/store-products?page=2",
    );
  });

  it("allowlists GET and PUT for one province shipping setting", () => {
    expect(isAllowedBackendRequest("GET", ["admin", "shipping-settings", "66"])).toBe(true);
    expect(isAllowedBackendRequest("PUT", ["admin", "shipping-settings", "66"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "shipping-settings", "66"])).toBe(false);
    expect(isAllowedBackendRequest("PUT", ["admin", "shipping-settings", "invalid"])).toBe(false);
  });

  it("allowlists CSA coupon administration by exact UUID path and method", () => {
    const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    const base = ["admin", "csa-coupons"];
    expect(isAllowedBackendRequest("GET", base)).toBe(true);
    expect(isAllowedBackendRequest("POST", base)).toBe(true);
    expect(isAllowedBackendRequest("GET", [...base, "options"])).toBe(true);
    expect(isAllowedBackendRequest("POST", [...base, "preview"])).toBe(true);
    expect(isAllowedBackendRequest("GET", [...base, id])).toBe(true);
    expect(isAllowedBackendRequest("PATCH", [...base, id])).toBe(true);
    expect(isAllowedBackendRequest("POST", [...base, id, "deactivate"])).toBe(true);
    expect(isAllowedBackendRequest("POST", [...base, id, "activate"])).toBe(true);
    expect(isAllowedBackendRequest("DELETE", [...base, id])).toBe(false);
    expect(isAllowedBackendRequest("PATCH", [...base, "bad-id"])).toBe(false);
    expect(isAllowedBackendRequest("GET", [...base, id, "activate"])).toBe(false);
    expect(isAllowedBackendRequest("POST", [...base, id, "unknown"])).toBe(false);
  });

  it("allowlists only the CSA terms collection, detail, clone and publish methods", () => {
    const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    const base = ["admin", "csa-terms"];
    expect(isAllowedBackendRequest("GET", base)).toBe(true);
    expect(isAllowedBackendRequest("POST", base)).toBe(true);
    for (const method of ["GET", "PATCH", "DELETE"])
      expect(isAllowedBackendRequest(method, [...base, id])).toBe(true);
    expect(isAllowedBackendRequest("POST", [...base, id, "clone"])).toBe(true);
    expect(isAllowedBackendRequest("POST", [...base, id, "publish"])).toBe(true);
    expect(isAllowedBackendRequest("PUT", [...base, id])).toBe(false);
    expect(isAllowedBackendRequest("POST", [...base, id])).toBe(false);
    expect(isAllowedBackendRequest("GET", [...base, id, "clone"])).toBe(false);
    expect(isAllowedBackendRequest("POST", [...base, "bad-id", "publish"])).toBe(false);
    expect(isAllowedBackendRequest("POST", [...base, id, "unknown"])).toBe(false);
  });

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

  it("does not proxy the removed workshop preview action", () => {
    expect(
      isAllowedBackendRequest("POST", ["admin", "workshops", "workshop-id", "preview-token"]),
    ).toBe(false);
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
    const membershipId = "87703641-2dce-4cac-8fc4-91e55f03e95f";
    expect(isAllowedBackendRequest("GET", ["admin", "membership-requests"])).toBe(false);
    expect(isAllowedBackendRequest("GET", ["admin", "membership-banks"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "membership-banks"])).toBe(false);
    expect(isAllowedBackendRequest("GET", ["admin", "membership-payment-settings"])).toBe(true);
    expect(isAllowedBackendRequest("PATCH", ["admin", "membership-payment-settings"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "membership-payment-settings"])).toBe(false);
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
    expect(isAllowedBackendRequest("GET", ["admin", "memberships"])).toBe(false);
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
    expect(isAllowedBackendRequest("GET", ["admin", "memberships", membershipId, "contract"])).toBe(
      true,
    );
    expect(
      isAllowedBackendRequest("GET", ["admin", "memberships", membershipId, "contract", "pdf"]),
    ).toBe(true);
    expect(
      isAllowedBackendRequest("POST", ["admin", "memberships", membershipId, "contract", "pdf"]),
    ).toBe(false);
    expect(isAllowedBackendRequest("GET", ["admin", "memberships", "not-a-uuid", "contract"])).toBe(
      false,
    );
    expect(
      isAllowedBackendRequest("GET", [
        "admin",
        "memberships",
        membershipId,
        "contract",
        "original",
      ]),
    ).toBe(false);
    expect(isAllowedBackendRequest("GET", ["memberships", "current"])).toBe(false);
  });

  it("restricts payment-plan management to UUID paths and exact methods", () => {
    const option = "a0c0313a-85df-4c29-930a-f19a05f3d8c4";
    const plan = "b0c0313a-85df-4c29-930a-f19a05f3d8c4";
    const base = ["admin", "membership-price-options", option, "payment-plans"];
    expect(isAllowedBackendRequest("GET", base)).toBe(true);
    expect(isAllowedBackendRequest("POST", base)).toBe(true);
    expect(isAllowedBackendRequest("PATCH", base)).toBe(false);
    expect(isAllowedBackendRequest("GET", [...base, plan])).toBe(true);
    expect(isAllowedBackendRequest("PATCH", [...base, plan])).toBe(true);
    expect(isAllowedBackendRequest("DELETE", [...base, plan])).toBe(true);
    expect(isAllowedBackendRequest("POST", [...base, plan, "activate"])).toBe(true);
    expect(isAllowedBackendRequest("POST", [...base, plan, "deactivate"])).toBe(true);
    expect(isAllowedBackendRequest("GET", [...base, plan, "activate"])).toBe(false);
    expect(isAllowedBackendRequest("POST", [...base, plan, "unknown"])).toBe(false);
    expect(isAllowedBackendRequest("POST", [...base, "not-a-uuid", "activate"])).toBe(false);
    expect(
      isAllowedBackendRequest("GET", ["admin", "membership-price-options", "bad", "payment-plans"]),
    ).toBe(false);
  });

  it("allowlists only CSA purchase list, detail, approve, reject and mark-refunded", () => {
    const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    expect(isAllowedBackendRequest("GET", ["admin", "csa-purchase-requests"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "csa-purchase-requests"])).toBe(false);
    expect(isAllowedBackendRequest("GET", ["admin", "csa-purchase-requests", id])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "csa-purchase-requests", id, "approve"])).toBe(
      true,
    );
    expect(isAllowedBackendRequest("POST", ["admin", "csa-purchase-requests", id, "reject"])).toBe(
      true,
    );
    expect(
      isAllowedBackendRequest("POST", ["admin", "csa-purchase-requests", id, "mark-refunded"]),
    ).toBe(true);
    expect(
      isAllowedBackendRequest("GET", ["admin", "csa-purchase-requests", id, "mark-refunded"]),
    ).toBe(false);
    expect(
      isAllowedBackendRequest("POST", [
        "admin",
        "csa-purchase-requests",
        "bad-id",
        "mark-refunded",
      ]),
    ).toBe(false);
    expect(
      isAllowedBackendRequest("POST", [
        "admin",
        "csa-purchase-requests",
        id,
        "mark-refunded",
        "extra",
      ]),
    ).toBe(false);
    expect(isAllowedBackendRequest("PATCH", ["admin", "csa-purchase-requests", id])).toBe(false);
    expect(isAllowedBackendRequest("POST", ["admin", "csa-purchase-requests", id, "other"])).toBe(
      false,
    );
    expect(isAllowedBackendRequest("GET", ["admin", "csa-purchase-requests", "bad-id"])).toBe(
      false,
    );
  });

  it("allowlists only POST confirm/reject for a positive payment sequence and valid request UUID", () => {
    const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    for (const action of ["confirm", "reject"]) {
      const path = ["admin", "csa-purchase-requests", id, "payments", "2", action];
      expect(isAllowedBackendRequest("POST", path)).toBe(true);
      expect(isAllowedBackendRequest("GET", path)).toBe(false);
      expect(isAllowedBackendRequest("PATCH", path)).toBe(false);
      expect(isAllowedBackendRequest("POST", [...path, "extra"])).toBe(false);
      expect(
        isAllowedBackendRequest("POST", [
          "admin",
          "csa-purchase-requests",
          "bad",
          "payments",
          "2",
          action,
        ]),
      ).toBe(false);
      expect(
        isAllowedBackendRequest("POST", [
          "admin",
          "csa-purchase-requests",
          id,
          "payments",
          "0",
          action,
        ]),
      ).toBe(false);
      expect(
        isAllowedBackendRequest("POST", [
          "admin",
          "csa-purchase-requests",
          id,
          "payments",
          "02",
          action,
        ]),
      ).toBe(false);
    }
    expect(
      isAllowedBackendRequest("POST", [
        "admin",
        "csa-purchase-requests",
        id,
        "payments",
        "2",
        "other",
      ]),
    ).toBe(false);
  });

  it("allowlists only CSA customer collection, detail, and one-way linking", () => {
    const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    expect(isAllowedBackendRequest("GET", ["admin", "csa-customers"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "csa-customers"])).toBe(true);
    expect(isAllowedBackendRequest("PATCH", ["admin", "csa-customers", id])).toBe(false);
    expect(isAllowedBackendRequest("DELETE", ["admin", "csa-customers", id])).toBe(false);
    expect(isAllowedBackendRequest("POST", ["admin", "csa-customers", id, "link-user"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "csa-customers", id, "unlink-user"])).toBe(
      false,
    );
    expect(isAllowedBackendRequest("GET", ["admin", "csa-customers", "not-a-uuid"])).toBe(false);
  });

  it("allowlists only read access to the Auth administrative-unit source", () => {
    expect(isAllowedBackendRequest("GET", ["administrative-units", "provinces"])).toBe(true);
    expect(isAllowedBackendRequest("GET", ["administrative-units", "wards"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["administrative-units", "provinces"])).toBe(false);
    expect(isAllowedBackendRequest("GET", ["administrative-units", "unknown"])).toBe(false);
    expect(isAllowedBackendRequest("GET", ["administrative-units", "wards", "extra"])).toBe(false);
  });

  it("allowlists only read access to public supported shipping areas", () => {
    expect(isAllowedBackendRequest("GET", ["public", "shipping-areas"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["public", "shipping-areas"])).toBe(false);
    expect(isAllowedBackendRequest("GET", ["public", "shipping-quotes"])).toBe(false);
    expect(isAllowedBackendRequest("GET", ["public", "shipping-areas", "extra"])).toBe(false);
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
    const mediaId = "11111111-1111-4111-8111-111111111111";
    expect(isAllowedBackendRequest("GET", ["admin", "tracker-farms"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "tracker-farms"])).toBe(true);
    expect(isAllowedBackendRequest("PATCH", ["admin", "tracker-farms"])).toBe(false);
    expect(isAllowedBackendRequest("PATCH", ["admin", "tracker-farms", "farm-id"])).toBe(true);
    expect(isAllowedBackendRequest("DELETE", ["admin", "tracker-farms", "farm-id"])).toBe(true);
    expect(isAllowedBackendRequest("GET", ["admin", "tracker-farms", "farm-id"])).toBe(false);
    expect(isAllowedBackendRequest("POST", ["admin", "tracker-farms", "media"])).toBe(true);
    expect(isAllowedBackendRequest("GET", ["admin", "tracker-farms", "media"])).toBe(false);
    expect(isAllowedBackendRequest("DELETE", ["admin", "tracker-farms", "media", mediaId])).toBe(
      true,
    );
    expect(isAllowedBackendRequest("GET", ["admin", "tracker-farms", "media", mediaId])).toBe(
      false,
    );
    expect(
      isAllowedBackendRequest("DELETE", ["admin", "tracker-farms", "media", "not-a-uuid"]),
    ).toBe(false);
    expect(isAllowedBackendRequest("PATCH", ["admin", "tracker-farms", "reorder"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "tracker-farms", "reorder"])).toBe(false);
    expect(buildBackendTarget(origin, ["admin", "tracker-farms", "reorder"], "").toString()).toBe(
      "http://127.0.0.1:8000/api/v1/admin/tracker-farms/reorder",
    );
  });
});
