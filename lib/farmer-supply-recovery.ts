import { farmerProducts, type FarmerProduct } from "@/lib/farm-supply-request-api";

export type CatalogScan = {
  page: number;
  total?: number;
  seen: Set<string>;
  matches: Map<string, { product: FarmerProduct; page: number }>;
};

export function newCatalogScan(): CatalogScan {
  return { page: 1, seen: new Set(), matches: new Map() };
}

export function sameFarmerProduct(left: FarmerProduct, right: FarmerProduct) {
  return (
    left.source_id === right.source_id &&
    left.supply_generation === right.supply_generation &&
    left.product_identity === right.product_identity
  );
}

export class FarmerCatalogChanged extends Error {}

/** Work in bounded, sequential chunks so a conflict never triggers a catalog request storm. */
export async function scanFarmerProducts(
  token: string,
  targets: ReadonlySet<string>,
  scan: CatalogScan,
  signal: AbortSignal,
) {
  for (let remaining = 12; remaining > 0; remaining -= 1) {
    signal.throwIfAborted();
    if (scan.page > 10_000) throw new FarmerCatalogChanged();
    const { data, meta } = await farmerProducts(token, { page: scan.page }, signal);
    signal.throwIfAborted();
    const expectedLength = Math.max(
      0,
      Math.min(meta.page_size, meta.total - (scan.page - 1) * meta.page_size),
    );
    if (
      (scan.total !== undefined && scan.total !== meta.total) ||
      data.length !== expectedLength ||
      new Set(data.map((product) => product.product_id)).size !== data.length ||
      data.some((product) => scan.seen.has(product.product_id))
    )
      throw new FarmerCatalogChanged();

    scan.total = meta.total;
    for (const product of data) {
      scan.seen.add(product.product_id);
      if (targets.has(product.product_id))
        scan.matches.set(product.product_id, { product, page: scan.page });
    }
    if (scan.matches.size === targets.size || scan.seen.size === scan.total) return true;
    scan.page += 1;
  }
  return false;
}
