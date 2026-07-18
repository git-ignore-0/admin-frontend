import "server-only";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredOrigin(name: string) {
  let url: URL;
  try {
    url = new URL(required(name));
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an HTTP(S) origin without credentials, path or query`);
  }
  return url.origin;
}

export const authOrigin = () => requiredOrigin("AUTH_ORIGIN");
export const adminOrigin = () => requiredOrigin("ADMIN_ORIGIN");
export const oauthClientId = () => required("ADMIN_OAUTH_CLIENT_ID");
export const oauthClientSecret = () => required("ADMIN_OAUTH_CLIENT_SECRET");
export const sessionSecret = () => {
  const value = required("ADMIN_SESSION_SECRET");
  if (value.length < 32) throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters");
  return value;
};
