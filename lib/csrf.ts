const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isTrustedAdminRequest(
  method: string,
  requestOrigin: string | null,
  expectedOrigin: string,
  marker: string | null,
) {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  return requestOrigin === expectedOrigin && marker === "1";
}
