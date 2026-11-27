import type { AdminLocale } from "@/lib/admin-i18n";
import {
  formatStockQuantityAmount,
  stockBatchDateDraft,
  stockBatchRangeForPreset,
  stockQuantityAmount,
  validateStockBatchDates,
} from "@/lib/farm-stock";
import type { FarmBulkIntent } from "@/lib/farms-api";
import { parsePositiveInteger, type NumericInputError } from "@/lib/numeric-input";
import type { FarmProduct } from "@/lib/types";

export const FARM_BULK_SUPPLY_LIMIT = 50;

export type FarmBulkSupplyInput = Omit<FarmBulkIntent, "idempotency_key">;
export type FarmBulkSupplyDraft = {
  start_date: string;
  end_date: string;
  items: Record<string, { product: FarmProduct; quantity: string }>;
};

type SummaryItem = {
  product: FarmProduct;
  quantity: string;
  quantityError?: NumericInputError;
  total: string;
};

export function emptyFarmBulkSupplyDraft(): FarmBulkSupplyDraft {
  return { ...stockBatchDateDraft(stockBatchRangeForPreset("week")), items: {} };
}

export function farmBulkProductName(product: FarmProduct, locale: AdminLocale) {
  return locale === "vi" ? product.name_vi : product.name_en;
}

export function farmBulkProductUnit(product: FarmProduct, locale: AdminLocale) {
  return locale === "vi" ? product.unit_label_vi : product.unit_label_en;
}

export function summarizeFarmBulkSupplyDraft(
  draft: FarmBulkSupplyDraft,
  locale: AdminLocale,
  today?: string,
) {
  const { value: dates, errors: dateErrors } = validateStockBatchDates(draft, today);
  const payloadItems: FarmBulkSupplyInput["items"][number][] = [];
  const amounts = new Map<string, ReturnType<typeof stockQuantityAmount>>();
  const items = Object.values(draft.items).flatMap<SummaryItem>(({ product, quantity }) => {
    if (quantity === "") return [];
    const parsed = parsePositiveInteger(quantity);
    if (parsed.error) return [{ product, quantity, quantityError: parsed.error, total: "—" }];

    payloadItems.push({
      product_id: product.product_id,
      expected_link_id: product.id,
      expected_version: product.version,
      quantity_units: parsed.value,
    });

    const amount = stockQuantityAmount(parsed.value, product.unit_size);
    const unitLabel = farmBulkProductUnit(product, locale).trim();
    const unit = unitLabel.toLowerCase();
    const label = unit === "g" || unit === "kg" ? "kg" : unitLabel;
    if (unit === "g") amount.decimalPlaces += 3;

    const previous = amounts.get(label);
    if (previous) {
      const decimalPlaces = Math.max(previous.decimalPlaces, amount.decimalPlaces);
      amounts.set(label, {
        coefficient:
          previous.coefficient * 10n ** BigInt(decimalPlaces - previous.decimalPlaces) +
          amount.coefficient * 10n ** BigInt(decimalPlaces - amount.decimalPlaces),
        decimalPlaces,
      });
    } else {
      amounts.set(label, amount);
    }
    return [
      {
        product,
        quantity,
        total: formatStockQuantityAmount(amount, label),
      },
    ];
  });

  const input =
    dates &&
    items.length > 0 &&
    items.length <= FARM_BULK_SUPPLY_LIMIT &&
    payloadItems.length === items.length
      ? { ...dates, items: payloadItems }
      : null;
  return {
    dateErrors,
    dates,
    items,
    totals: Array.from(amounts, ([label, amount]) => formatStockQuantityAmount(amount, label)),
    input,
  };
}
