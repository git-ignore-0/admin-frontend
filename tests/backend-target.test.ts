import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { describe, expect, it } from "vitest";

import { buildBackendTarget, isAllowedBackendRequest } from "@/lib/backend-target";

const uuid = "24803641-2dce-4cac-8fc4-91e55f03e95f";
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "CONNECT"];
// Canonical path and method columns from the Phase 3.0.3 audit, with Django URLconf slash rules.
const auditedRoutes = readFileSync(
  new NodeURL("./fixtures/bff-endpoints.tsv", import.meta.url),
  "utf8",
)
  .trimEnd()
  .split("\n")
  .slice(1)
  .map((line) => {
    const [shape, allowed, trailingSlash] = line.split("\t");
    return { shape, allowed: allowed.split(","), trailingSlash: trailingSlash === "yes" };
  });

describe("backend API target", () => {
  const origin = "http://127.0.0.1:8000";

  it("covers the 122 canonical route shapes and 173 audited method–route pairs", () => {
    expect(auditedRoutes).toHaveLength(122);
    expect(new Set(auditedRoutes.map(({ shape }) => shape)).size).toBe(122);
    expect(auditedRoutes.flatMap(({ allowed }) => allowed)).toHaveLength(173);
    for (const { allowed } of auditedRoutes) {
      expect(allowed.every((method) => methods.includes(method))).toBe(true);
      expect(new Set(allowed).size).toBe(allowed.length);
    }
  });

  it.each(auditedRoutes)(
    "checks the exact audited route $shape",
    ({ shape, allowed, trailingSlash }) => {
      const segments = shape.split("/");
      const path = segments.map((segment) => {
        if (segment === "{province}") return "01";
        if (segment === "{sequence}") return "12";
        return segment.startsWith("{") ? uuid : segment;
      });
      for (const method of methods) {
        expect(isAllowedBackendRequest(method, path), method).toBe(allowed.includes(method));
      }
      for (const method of allowed) {
        expect(isAllowedBackendRequest(method, [...path, "extra"]), method).toBe(false);
        for (const [index, segment] of segments.entries()) {
          if (!segment.startsWith("{")) continue;
          const invalidId = ["{province}", "{sequence}"].includes(segment) ? "0" : "invalid-id";
          const invalidPath = path.with(index, invalidId);
          expect(isAllowedBackendRequest(method, invalidPath), `${method} ${segment}`).toBe(false);
          const missingId = path.filter((_, position) => index !== position);
          // Removing the terminal ID can resolve to an independent collection route.
          if (index < segments.length - 1) {
            expect(isAllowedBackendRequest(method, missingId), `${method} without ${segment}`).toBe(
              false,
            );
          }
        }
      }
      const target = buildBackendTarget(origin, path, "");
      expect(target.origin).toBe(origin);
      expect(target.pathname).toBe(`/api/v1/${path.join("/")}${trailingSlash ? "/" : ""}`);
    },
  );

  it.each([
    { kind: "empty", segment: "" },
    { kind: "dot", segment: "." },
    { kind: "dot-dot", segment: ".." },
    { kind: "decoded forward slash", segment: "/" },
    { kind: "decoded backslash", segment: "\\" },
    { kind: "C0 control character", segment: "\u0001" },
    { kind: "C1 control character", segment: "\u0085" },
    { kind: "unpaired surrogate", segment: "\uD800" },
    { kind: "remaining percent encoding", segment: "test%2Did" },
  ])("rejects a decoded $kind segment", ({ segment }) => {
    expect(isAllowedBackendRequest("GET", ["admin", "workshops", segment])).toBe(false);
  });

  it.each([
    "24803641-2DCE-4CAC-8FC4-91E55F03E95F",
    "24803641-2dce-7cac-afc4-91e55f03e95f",
    "00000000-0000-0000-0000-000000000000",
  ])("preserves canonical UUIDs supported by Django: %s", (id) => {
    const path = ["admin", "users", id];
    expect(isAllowedBackendRequest("GET", path)).toBe(true);
    expect(buildBackendTarget(origin, path, "").pathname).toBe(
      `/api/v1/admin/users/${id.toLowerCase()}`,
    );
  });

  it("allowlists voucher administration by exact method and UUID path", () => {
    const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    const base = ["admin", "vouchers"];
    for (const [suffix, allowed] of [
      [[], ["GET", "POST"]],
      [["options"], ["GET"]],
      [["preview"], ["POST"]],
      [[id], ["GET", "PATCH"]],
      [[id, "activate"], ["POST"]],
      [[id, "deactivate"], ["POST"]],
    ]) {
      for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"]) {
        expect(isAllowedBackendRequest(method, [...base, ...suffix])).toBe(
          allowed.includes(method),
        );
      }
      expect(isAllowedBackendRequest("POST", [...base, ...suffix, "extra"])).toBe(false);
    }
    for (const suffix of [
      ["bad-id"],
      [id, "unknown"],
      ["options", "extra"],
      [id, "activate", "extra"],
    ]) {
      expect(isAllowedBackendRequest("POST", [...base, ...suffix])).toBe(false);
    }
    expect(buildBackendTarget(origin, base, "").pathname).toBe("/api/v1/admin/vouchers");
  });

  it("allowlists only Store order reads and implemented lifecycle actions", () => {
    const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";
    const base = ["admin", "store-orders"];
    expect(isAllowedBackendRequest("GET", base)).toBe(true);
    expect(isAllowedBackendRequest("POST", base)).toBe(false);
    expect(isAllowedBackendRequest("GET", [...base, id])).toBe(true);
    expect(isAllowedBackendRequest("PATCH", [...base, id])).toBe(false);
    for (const action of ["approve", "cancel", "record-payment", "refund", "deliver", "restock"])
      expect(isAllowedBackendRequest("POST", [...base, id, action])).toBe(true);
    expect(isAllowedBackendRequest("GET", [...base, id, "approve"])).toBe(false);
    expect(isAllowedBackendRequest("POST", [...base, id, "unknown"])).toBe(false);
    expect(isAllowedBackendRequest("GET", [...base, "not-a-uuid"])).toBe(false);
  });

  it("allowlists exact Farm, media, product and stock-batch methods", () => {
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
    const batch = "22222222-2222-4222-8222-222222222222";
    expect(isAllowedBackendRequest("GET", [...base, farm, "products", product, "batches"])).toBe(
      true,
    );
    expect(isAllowedBackendRequest("POST", [...base, farm, "products", product, "batches"])).toBe(
      true,
    );
    expect(
      isAllowedBackendRequest("PATCH", [...base, farm, "products", product, "batches", batch]),
    ).toBe(true);
    expect(
      isAllowedBackendRequest("POST", [
        ...base,
        farm,
        "products",
        product,
        "batches",
        batch,
        "cancel",
      ]),
    ).toBe(true);
    expect(
      isAllowedBackendRequest("DELETE", [...base, farm, "products", product, "batches", batch]),
    ).toBe(false);
    expect(isAllowedBackendRequest("GET", [...base, "bad-id"])).toBe(false);
    expect(isAllowedBackendRequest("DELETE", [...base, "media", "bad-id"])).toBe(false);
    expect(isAllowedBackendRequest("POST", [...base, farm, "products", product])).toBe(false);
    expect(
      isAllowedBackendRequest("GET", [...base, farm, "products", product, "batches", batch]),
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
    const target = buildBackendTarget(origin, ["admin", "workshops", uuid, "publish"], "");

    expect(target.toString()).toBe(`http://127.0.0.1:8000/api/v1/admin/workshops/${uuid}/publish/`);
  });

  it("does not proxy the removed workshop preview action", () => {
    expect(isAllowedBackendRequest("POST", ["admin", "workshops", uuid, "preview-token"])).toBe(
      false,
    );
  });

  it("adds DRF trailing slashes to all Testimonial router routes", () => {
    expect(buildBackendTarget(origin, ["admin", "testimonials"], "").toString()).toBe(
      "http://127.0.0.1:8000/api/v1/admin/testimonials/",
    );
    expect(
      buildBackendTarget(origin, ["admin", "testimonials", uuid, "publish"], "").toString(),
    ).toBe(`http://127.0.0.1:8000/api/v1/admin/testimonials/${uuid}/publish/`);
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
    expect(isAllowedBackendRequest("POST", ["admin", "membership-usage", uuid, "undo"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "memberships"])).toBe(true);
    expect(isAllowedBackendRequest("GET", ["admin", "memberships"])).toBe(false);
    expect(isAllowedBackendRequest("POST", ["admin", "memberships", membershipId, "revoke"])).toBe(
      true,
    );
    expect(isAllowedBackendRequest("GET", ["admin", "memberships", membershipId, "revoke"])).toBe(
      false,
    );
    expect(
      isAllowedBackendRequest("DELETE", ["admin", "memberships", membershipId, "revoke"]),
    ).toBe(false);
    expect(isAllowedBackendRequest("POST", ["admin", "memberships", membershipId, "unknown"])).toBe(
      false,
    );
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
    expect(isAllowedBackendRequest("GET", ["admin", "testimonials", uuid])).toBe(true);
    expect(isAllowedBackendRequest("PATCH", ["admin", "testimonials", uuid])).toBe(true);
    expect(isAllowedBackendRequest("DELETE", ["admin", "testimonials", uuid])).toBe(false);
    expect(isAllowedBackendRequest("POST", ["admin", "testimonials", "media"])).toBe(true);
    expect(isAllowedBackendRequest("GET", ["admin", "testimonials", "media"])).toBe(false);
    expect(isAllowedBackendRequest("POST", ["admin", "testimonials", uuid, "publish"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "testimonials", uuid, "hide"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "testimonials", uuid, "unpublish"])).toBe(
      true,
    );
    expect(isAllowedBackendRequest("GET", ["admin", "testimonials", uuid, "publish"])).toBe(false);
    expect(isAllowedBackendRequest("POST", ["admin", "testimonials", uuid, "delete"])).toBe(false);
    expect(
      isAllowedBackendRequest("POST", ["admin", "testimonials", uuid, "publish", "extra"]),
    ).toBe(false);
  });

  it("allowlists only the tracker farm CRUD and reorder routes", () => {
    const mediaId = "11111111-1111-4111-8111-111111111111";
    expect(isAllowedBackendRequest("GET", ["admin", "tracker-farms"])).toBe(true);
    expect(isAllowedBackendRequest("POST", ["admin", "tracker-farms"])).toBe(true);
    expect(isAllowedBackendRequest("PATCH", ["admin", "tracker-farms"])).toBe(false);
    expect(isAllowedBackendRequest("PATCH", ["admin", "tracker-farms", uuid])).toBe(true);
    expect(isAllowedBackendRequest("DELETE", ["admin", "tracker-farms", uuid])).toBe(true);
    expect(isAllowedBackendRequest("GET", ["admin", "tracker-farms", uuid])).toBe(false);
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
