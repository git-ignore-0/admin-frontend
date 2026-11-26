import { adminDateInputToIso, adminTodayIso, isoDateToAdminInput } from "@/lib/admin-date";
import { parsePositiveInteger } from "@/lib/numeric-input";
import type { StockBatchInput } from "@/lib/types";

export type StockBatchPreset = "week" | "month" | "custom";
type StockBatchDates = Pick<StockBatchInput, "start_date" | "end_date">;
export type StockBatchDraft = {
  // Preserve the date input text even when it is incomplete or invalid.
  start_date: string;
  end_date: string;
  quantity: string;
};
export type StockBatchFieldErrors = Partial<
  Record<
    keyof StockBatchDraft,
    "required" | "invalid_date" | "date_order" | "expired" | "positive_integer" | "integer_range"
  >
>;

export function stockBatchDateDraft(dates: StockBatchDates) {
  return {
    start_date: isoDateToAdminInput(dates.start_date),
    end_date: isoDateToAdminInput(dates.end_date),
  };
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function stockBatchRangeForPreset(
  preset: Exclude<StockBatchPreset, "custom">,
  today = adminTodayIso(),
) {
  const date = parseIsoDate(today);
  if (preset === "week") {
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    const start = new Date(date);
    start.setUTCDate(start.getUTCDate() - mondayOffset);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return {
      start_date: isoDate(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()),
      end_date: isoDate(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate()),
    };
  }
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return {
    start_date: isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
    end_date: isoDate(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate()),
  };
}

export function validateStockBatchInput(
  draft: StockBatchDraft,
  today = adminTodayIso(),
): { value: StockBatchInput | null; errors: StockBatchFieldErrors } {
  const errors: StockBatchFieldErrors = {};
  const startDate = adminDateInputToIso(draft.start_date);
  const endDate = adminDateInputToIso(draft.end_date);
  if (!startDate) errors.start_date = draft.start_date ? "invalid_date" : "required";
  if (!endDate) errors.end_date = draft.end_date ? "invalid_date" : "required";
  if (startDate && endDate) {
    if (endDate < startDate) errors.end_date = "date_order";
    else if (endDate < today) errors.end_date = "expired";
  }
  const quantity = parsePositiveInteger(draft.quantity);
  if (quantity.error) {
    errors.quantity = quantity.error === "integer_range" ? "integer_range" : "positive_integer";
  }
  if (!startDate || !endDate || quantity.error || Object.keys(errors).length)
    return { value: null, errors };
  return {
    value: {
      start_date: startDate,
      end_date: endDate,
      quantity_units: quantity.value,
    },
    errors,
  };
}

export function formatStockQuantityTotal(
  quantityUnits: number,
  unitSize: string,
  unitLabel: string,
) {
  const [integer = "0", fraction = ""] = unitSize.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const scaledUnit = BigInt(integer || "0") * scale + BigInt(fraction || "0");
  const scaledTotal = scaledUnit * BigInt(quantityUnits);
  const whole = scaledTotal / scale;
  const remainder = (scaledTotal % scale)
    .toString()
    .padStart(fraction.length, "0")
    .replace(/0+$/, "");
  return `${whole}${remainder ? `.${remainder}` : ""} ${unitLabel}`;
}
