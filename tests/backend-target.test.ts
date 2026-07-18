import { describe, expect, it } from "vitest";

import { buildBackendTarget } from "@/lib/backend-target";

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

  it("does not add a slash to endpoints that intentionally omit it", () => {
    const target = buildBackendTarget(origin, ["admin", "media"], "?locale=vi");

    expect(target.toString()).toBe("http://127.0.0.1:8000/api/v1/admin/media?locale=vi");
  });
});
