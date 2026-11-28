import type { FarmBulkIntent } from "@/lib/farms-api";
import {
  emptyFarmSupplyDraft,
  type FarmSupplyDraft,
  type FarmSupplyInput,
  type FarmSupplyProduct,
} from "@/lib/farm-supply-form";
import type { FarmProduct } from "@/lib/types";

export type FarmBulkSupplyProduct = FarmSupplyProduct & {
  id: string;
  version: number;
  available_quantity: number;
};

export type FarmBulkSupplyDraft = FarmSupplyDraft<FarmBulkSupplyProduct>;
export type FarmBulkSupplyInput = Omit<FarmBulkIntent, "idempotency_key">;

export function emptyFarmBulkSupplyDraft(): FarmBulkSupplyDraft {
  return emptyFarmSupplyDraft();
}

export function farmBulkSupplyProduct(row: FarmProduct): FarmBulkSupplyProduct {
  return {
    id: row.id,
    product_id: row.product_id,
    sku: row.sku,
    name_vi: row.name_vi,
    name_en: row.name_en,
    unit_size: row.unit_size,
    unit_label_vi: row.unit_label_vi,
    unit_label_en: row.unit_label_en,
    version: row.version,
    available_quantity: row.available_quantity,
  };
}

export function farmBulkSupplyInput({
  items,
  ...dates
}: FarmSupplyInput<FarmBulkSupplyProduct>): FarmBulkSupplyInput {
  return {
    ...dates,
    items: items.map(({ product, quantity_units }) => ({
      product_id: product.product_id,
      expected_link_id: product.id,
      expected_version: product.version,
      quantity_units,
    })),
  };
}
