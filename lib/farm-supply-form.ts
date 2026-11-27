import type { AdminLocale } from "@/lib/admin-i18n";
import {
  formatStockQuantityAmount,
  stockBatchDateDraft,
  stockBatchRangeForPreset,
  stockQuantityAmount,
  validateStockBatchDates,
} from "@/lib/farm-stock";
import { parsePositiveInteger, type NumericInputError } from "@/lib/numeric-input";

export const FARM_SUPPLY_LIMIT = 50;

export type FarmSupplyProduct = {
  product_id: string;
  sku: string;
  name_vi: string;
  name_en: string;
  unit_size: string;
  unit_label_vi: string;
  unit_label_en: string;
};

export type FarmSupplyInput<P extends FarmSupplyProduct> = {
  start_date: string;
  end_date: string;
  items: { product: P; quantity_units: number }[];
};

export type FarmSupplyDraft<P extends FarmSupplyProduct> = {
  start_date: string;
  end_date: string;
  items: Record<string, { product: P; quantity: string }>;
};

type SummaryItem<P extends FarmSupplyProduct> = {
  product: P;
  quantity: string;
  quantityError?: NumericInputError;
  total: string;
};

export function emptyFarmSupplyDraft<P extends FarmSupplyProduct>(): FarmSupplyDraft<P> {
  return { ...stockBatchDateDraft(stockBatchRangeForPreset("week")), items: {} };
}

export function farmSupplyProductName(product: FarmSupplyProduct, locale: AdminLocale) {
  return locale === "vi" ? product.name_vi : product.name_en;
}

export function farmSupplyProductUnit(product: FarmSupplyProduct, locale: AdminLocale) {
  return locale === "vi" ? product.unit_label_vi : product.unit_label_en;
}

export function summarizeFarmSupplyDraft<P extends FarmSupplyProduct>(
  draft: FarmSupplyDraft<P>,
  locale: AdminLocale,
  today?: string,
) {
  const { value: dates, errors: dateErrors } = validateStockBatchDates(draft, today);
  const validatedItems: FarmSupplyInput<P>["items"] = [];
  const amounts = new Map<string, ReturnType<typeof stockQuantityAmount>>();
  const items = Object.values(draft.items).flatMap<SummaryItem<P>>(({ product, quantity }) => {
    if (quantity === "") return [];
    const parsed = parsePositiveInteger(quantity);
    if (parsed.error) return [{ product, quantity, quantityError: parsed.error, total: "—" }];

    validatedItems.push({ product, quantity_units: parsed.value });

    const amount = stockQuantityAmount(parsed.value, product.unit_size);
    const unitLabel = farmSupplyProductUnit(product, locale).trim();
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
    items.length <= FARM_SUPPLY_LIMIT &&
    validatedItems.length === items.length
      ? { ...dates, items: validatedItems }
      : null;
  return {
    dateErrors,
    dates,
    items,
    totals: Array.from(amounts, ([label, amount]) => formatStockQuantityAmount(amount, label)),
    input,
  };
}
