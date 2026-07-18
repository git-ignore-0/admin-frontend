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
