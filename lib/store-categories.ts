import type { StoreCategory } from "@/lib/types";

export type CategoryTreeRow = { category: StoreCategory; depth: number };

export function categoryTreeRows(categories: StoreCategory[]): CategoryTreeRow[] {
  const ids = new Set(categories.map((item) => item.id));
  const children = new Map<string | null, StoreCategory[]>();
  for (const item of categories) {
    const parent = item.parent_id && ids.has(item.parent_id) ? item.parent_id : null;
    children.set(parent, [...(children.get(parent) ?? []), item]);
  }
  for (const group of children.values()) {
    group.sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.slug.localeCompare(b.slug) || a.id.localeCompare(b.id),
    );
  }
  const rows: CategoryTreeRow[] = [];
  const visited = new Set<string>();
  function visit(parent: string | null, depth: number) {
    for (const category of children.get(parent) ?? []) {
      if (visited.has(category.id)) continue;
      visited.add(category.id);
      const actualDepth = parent === null && category.parent_id ? category.depth : depth;
      rows.push({ category, depth: actualDepth });
      visit(category.id, actualDepth + 1);
    }
  }
  visit(null, 1);
  for (const item of categories) {
    if (!visited.has(item.id)) visit(item.parent_id, 1);
  }
  return rows;
}

export function categoryDescendantIds(categories: StoreCategory[], id: string): Set<string> {
  const descendants = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of categories) {
      if (item.parent_id && descendants.has(item.parent_id) && !descendants.has(item.id)) {
        descendants.add(item.id);
        changed = true;
      }
    }
  }
  return descendants;
}

export function categoryName(category: StoreCategory, locale: "vi" | "en") {
  return (
    category.translations.find((item) => item.locale === locale)?.name ||
    category.translations.find((item) => item.locale === "vi")?.name ||
    category.slug
  );
}

export function categoryPath(
  category: StoreCategory,
  categories: StoreCategory[],
  locale: "vi" | "en",
) {
  const byId = new Map(categories.map((item) => [item.id, item]));
  const path: StoreCategory[] = [];
  const visited = new Set<string>();
  let current: StoreCategory | undefined = category;

  while (current && !visited.has(current.id)) {
    path.push(current);
    visited.add(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }

  return path
    .reverse()
    .map((item) => categoryName(item, locale))
    .join(" → ");
}
