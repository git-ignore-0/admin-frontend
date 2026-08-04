export function buildBackendTarget(origin: string, path: string[], search: string) {
  const target = new URL(origin);
  // DRF router endpoints use a trailing slash. Next.js normalizes the incoming
  // proxy URL before this handler runs, so the original slash cannot be used
  // to infer the upstream URL shape.
  const trailingSlash = path[0] === "admin" && path[1] === "workshops" ? "/" : "";
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/");

  target.pathname = `/api/v1/${encodedPath}${trailingSlash}`;
  target.search = search;
  target.hash = "";

  return target;
}

const READ = new Set(["GET"]);
const CRUD_COLLECTION = new Set(["GET", "POST"]);
const CRUD_DETAIL = new Set(["GET", "PATCH", "DELETE"]);

export function isAllowedBackendRequest(method: string, path: string[]) {
  const normalizedMethod = method.toUpperCase();
  if (path[0] !== "admin" || path.some((segment) => !segment)) return false;

  const [, resource, id, action, extra] = path;
  if (extra !== undefined) return false;

  if (["dashboard"].includes(resource) && id === undefined) return READ.has(normalizedMethod);
  if (resource === "site-settings" && id === undefined)
    return new Set(["GET", "PATCH"]).has(normalizedMethod);
  if (resource === "media" && id === undefined) return normalizedMethod === "POST";

  if (resource === "workshops") {
    if (id === undefined) return CRUD_COLLECTION.has(normalizedMethod);
    if (action === undefined) return CRUD_DETAIL.has(normalizedMethod);
    return (
      ["publish", "unpublish", "preview-token"].includes(action) && normalizedMethod === "POST"
    );
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

  if (resource === "membership-payment-settings" && id === undefined)
    return new Set(["GET", "PUT", "PATCH"]).has(normalizedMethod);
  if (resource === "membership-banks" && id === undefined) return normalizedMethod === "GET";

  if (["membership-products", "membership-packages"].includes(resource)) {
    if (id === undefined) return CRUD_COLLECTION.has(normalizedMethod);
    return action === undefined && CRUD_DETAIL.has(normalizedMethod);
  }

  if (resource === "membership-requests") {
    if (id === undefined || action === undefined) return READ.has(normalizedMethod);
    return (
      [
        "contact",
        "issue-payment-instruction",
        "return-payment-pending",
        "reject",
        "approve",
      ].includes(action) && normalizedMethod === "POST"
    );
  }

  if (resource === "memberships") {
    if (id === undefined || action === undefined) return READ.has(normalizedMethod);
    return action === "history" && normalizedMethod === "GET";
  }

  if (resource === "membership-usage") {
    if (id === undefined) return normalizedMethod === "POST";
    if (action === undefined) return normalizedMethod === "GET";
    return action === "undo" && normalizedMethod === "POST";
  }

  return false;
}
