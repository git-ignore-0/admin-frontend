import type { TiptapDocument } from "@/lib/types";

export function normalizeLinkHref(value: string) {
  const input = value.trim();
  if (!input) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) return `mailto:${input}`;
  let candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
  try {
    let url = new URL(candidate);
    const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol === "http:" && !isLoopback) {
      candidate = candidate.replace(/^http:\/\//i, "https://");
      url = new URL(candidate);
    }
    if (url.protocol === "http:" && isLoopback) return url.toString();
    if (url.protocol === "https:" && url.hostname) return url.toString();
    if (url.protocol === "mailto:" && url.pathname.includes("@")) return candidate;
  } catch {
    return null;
  }
  return null;
}

export function normalizeTiptapLinks(document: TiptapDocument): TiptapDocument {
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(visit).filter((item): item is Exclude<typeof item, null> => item !== null);
    }
    if (!value || typeof value !== "object") return value;

    const node = value as Record<string, unknown>;
    if (node.type === "link") {
      const attrs =
        node.attrs && typeof node.attrs === "object" ? (node.attrs as Record<string, unknown>) : {};
      const href = normalizeLinkHref(String(attrs.href || ""));
      if (!href) return null;
      return { ...node, attrs: { ...attrs, href } };
    }
    return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, visit(item)]));
  }

  return visit(document) as TiptapDocument;
}
