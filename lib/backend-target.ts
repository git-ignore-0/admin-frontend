export function buildBackendTarget(origin: string, path: string[], search: string) {
  const target = new URL(origin);
  // DRF router endpoints use a trailing slash. Next.js normalizes the incoming
  // proxy URL before this handler runs, so the original slash cannot be used
  // to infer the upstream URL shape.
  const trailingSlash =
    path[0] === "admin" && ["testimonials", "workshops"].includes(path[1]) ? "/" : "";
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/");

  target.pathname = `/api/v1/${encodedPath}${trailingSlash}`;
  target.search = search;
  target.hash = "";

  return target;
}

const READ = new Set(["GET"]);
const CRUD_COLLECTION = new Set(["GET", "POST"]);
const CRUD_DETAIL = new Set(["GET", "PATCH", "DELETE"]);
export const UUID_PATH_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAllowedBackendRequest(method: string, path: string[]) {
  const normalizedMethod = method.toUpperCase();
  if (path[0] === "administrative-units") {
    return (
      normalizedMethod === "GET" && path.length === 2 && ["provinces", "wards"].includes(path[1])
    );
  }
  if (path[0] === "public") {
    return normalizedMethod === "GET" && path.length === 2 && path[1] === "shipping-areas";
  }
  if (path[0] !== "admin" || path.some((segment) => !segment)) return false;

  const [, resource, id, action, extra] = path;
  if (resource === "farms") {
    if (id === undefined) return path.length === 2 && CRUD_COLLECTION.has(normalizedMethod);
    if (id === "media") {
      if (action === undefined) return path.length === 3 && normalizedMethod === "POST";
      return path.length === 4 && normalizedMethod === "DELETE" && UUID_PATH_SEGMENT.test(action);
    }
    if (!UUID_PATH_SEGMENT.test(id)) return false;
    if (action === undefined) return path.length === 3 && CRUD_DETAIL.has(normalizedMethod);
    if (action === "growth-tracker")
      return path.length === 4 && new Set(["GET", "POST", "PATCH", "DELETE"]).has(normalizedMethod);
    if (action === "available-products") return path.length === 4 && normalizedMethod === "GET";
    if (action !== "products") return false;
    if (extra === undefined) return path.length === 4 && CRUD_COLLECTION.has(normalizedMethod);
    if (!UUID_PATH_SEGMENT.test(extra)) return false;
    if (path.length === 5) return new Set(["PATCH", "DELETE"]).has(normalizedMethod);
    if (path[5] !== "batches") return false;
    if (path.length === 6) return CRUD_COLLECTION.has(normalizedMethod);
    if (!UUID_PATH_SEGMENT.test(path[6] ?? "")) return false;
    if (path.length === 7) return normalizedMethod === "PATCH";
    return path.length === 8 && path[7] === "cancel" && normalizedMethod === "POST";
  }
  if (["store-categories", "store-products"].includes(resource)) {
    if (id === undefined) return path.length === 2 && CRUD_COLLECTION.has(normalizedMethod);
    if (resource === "store-products" && id === "media") {
      if (action === undefined) return path.length === 3 && normalizedMethod === "POST";
      return path.length === 4 && normalizedMethod === "DELETE" && UUID_PATH_SEGMENT.test(action);
    }
    return (
      path.length === 3 &&
      action === undefined &&
      UUID_PATH_SEGMENT.test(id) &&
      CRUD_DETAIL.has(normalizedMethod)
    );
  }
  if (resource === "shipping-settings") {
    return (
      path.length === 3 &&
      /^\d{2}$/u.test(id ?? "") &&
      new Set(["GET", "PUT"]).has(normalizedMethod)
    );
  }
  if (resource === "csa-coupons") {
    if (id === undefined) return path.length === 2 && CRUD_COLLECTION.has(normalizedMethod);
    if (id === "options") return path.length === 3 && normalizedMethod === "GET";
    if (id === "preview") return path.length === 3 && normalizedMethod === "POST";
    if (!UUID_PATH_SEGMENT.test(id)) return false;
    if (action === undefined)
      return path.length === 3 && new Set(["GET", "PATCH"]).has(normalizedMethod);
    return (
      path.length === 4 &&
      normalizedMethod === "POST" &&
      ["activate", "deactivate"].includes(action)
    );
  }
  if (resource === "csa-terms") {
    if (id === undefined) return path.length === 2 && CRUD_COLLECTION.has(normalizedMethod);
    if (!UUID_PATH_SEGMENT.test(id)) return false;
    if (action === undefined) return path.length === 3 && CRUD_DETAIL.has(normalizedMethod);
    return (
      path.length === 4 && normalizedMethod === "POST" && ["clone", "publish"].includes(action)
    );
  }
  if (resource === "membership-price-options") {
    if (!UUID_PATH_SEGMENT.test(id ?? "") || action !== "payment-plans") return false;
    if (extra === undefined) return path.length === 4 && CRUD_COLLECTION.has(normalizedMethod);
    if (!UUID_PATH_SEGMENT.test(extra)) return false;
    if (path.length === 5) return CRUD_DETAIL.has(normalizedMethod);
    return (
      path.length === 6 &&
      normalizedMethod === "POST" &&
      ["activate", "deactivate"].includes(path[5])
    );
  }
  if (resource === "memberships" && UUID_PATH_SEGMENT.test(id ?? "") && action === "contract") {
    return normalizedMethod === "GET" && (extra === undefined || extra === "pdf");
  }
  if (resource === "csa-purchase-requests" && action === "payments") {
    return (
      path.length === 6 &&
      normalizedMethod === "POST" &&
      UUID_PATH_SEGMENT.test(id ?? "") &&
      Boolean(extra && /^[1-9]\d*$/u.test(extra)) &&
      (path[5] === "confirm" || path[5] === "reject")
    );
  }
  if (extra !== undefined) return false;

  if (["dashboard"].includes(resource) && id === undefined) return READ.has(normalizedMethod);
  if (resource === "site-settings" && id === undefined)
    return new Set(["GET", "PATCH"]).has(normalizedMethod);
  if (resource === "membership-payment-settings" && id === undefined)
    return new Set(["GET", "PATCH"]).has(normalizedMethod);
  if (resource === "membership-banks" && id === undefined) return normalizedMethod === "GET";
  if (resource === "media" && id === undefined) return normalizedMethod === "POST";

  if (resource === "tracker-farms") {
    if (id === undefined) return CRUD_COLLECTION.has(normalizedMethod);
    if (id === "media") {
      if (action === undefined) return normalizedMethod === "POST";
      return normalizedMethod === "DELETE" && UUID_PATH_SEGMENT.test(action);
    }
    if (id === "reorder" && action === undefined) return normalizedMethod === "PATCH";
    return action === undefined && new Set(["PATCH", "DELETE"]).has(normalizedMethod);
  }

  if (resource === "workshops") {
    if (id === undefined) return CRUD_COLLECTION.has(normalizedMethod);
    if (action === undefined) return CRUD_DETAIL.has(normalizedMethod);
    return ["publish", "unpublish"].includes(action) && normalizedMethod === "POST";
  }

  if (resource === "testimonials") {
    if (id === undefined) return CRUD_COLLECTION.has(normalizedMethod);
    if (id === "media" && action === undefined) return normalizedMethod === "POST";
    if (action === undefined) return new Set(["GET", "PATCH"]).has(normalizedMethod);
    return ["publish", "hide", "unpublish"].includes(action) && normalizedMethod === "POST";
  }

  if (resource === "users") {
    if (id === undefined || action === undefined) return READ.has(normalizedMethod);
    return action === "points" && new Set(["GET", "POST"]).has(normalizedMethod);
  }

  if (resource === "rewards") {
    if (id === undefined) return CRUD_COLLECTION.has(normalizedMethod);
    if (["reorder", "media"].includes(id) && action === undefined)
      return normalizedMethod === "POST";
    return action === undefined && new Set(["GET", "PATCH"]).has(normalizedMethod);
  }

  if (resource === "redemptions") {
    if (id === undefined || action === undefined) return READ.has(normalizedMethod);
    return ["mark-contacted", "complete", "reject"].includes(action) && normalizedMethod === "POST";
  }

  if (["membership-products", "membership-packages"].includes(resource)) {
    if (id === undefined) return CRUD_COLLECTION.has(normalizedMethod);
    return action === undefined && CRUD_DETAIL.has(normalizedMethod);
  }

  if (resource === "memberships") {
    if (id === undefined) return normalizedMethod === "POST";
    if (action === undefined) return READ.has(normalizedMethod);
    if (action === "history") return normalizedMethod === "GET";
    return action === "revoke" && normalizedMethod === "POST";
  }

  if (resource === "csa-purchase-requests") {
    if (id === undefined) return normalizedMethod === "GET";
    if (!UUID_PATH_SEGMENT.test(id)) return false;
    if (action === undefined) return normalizedMethod === "GET";
    return ["approve", "reject", "mark-refunded"].includes(action) && normalizedMethod === "POST";
  }

  if (resource === "csa-customers") {
    if (id === undefined) return CRUD_COLLECTION.has(normalizedMethod);
    if (!UUID_PATH_SEGMENT.test(id)) return false;
    if (action === undefined) return normalizedMethod === "GET";
    return action === "link-user" && normalizedMethod === "POST";
  }

  if (resource === "membership-usage") {
    if (id === undefined) return normalizedMethod === "POST";
    if (action === undefined) return normalizedMethod === "GET";
    return action === "undo" && normalizedMethod === "POST";
  }

  return false;
}
