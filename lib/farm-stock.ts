import { adminDateInputToIso, adminTodayIso, isoDateToAdminInput } from "@/lib/admin-date";
import { parsePositiveInteger } from "@/lib/numeric-input";
import type { ClientApiError } from "@/lib/client-error";
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
    | "required"
    | "invalid_date"
    | "date_order"
    | "expired"
    | "positive_integer"
    | "integer_range"
    | "stock_sold"
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

export function validateStockBatchDates(draft: StockBatchDates, today = adminTodayIso()) {
  const errors: Partial<
    Record<keyof StockBatchDates, "required" | "invalid_date" | "date_order" | "expired">
  > = {};
  const startDate = adminDateInputToIso(draft.start_date);
  const endDate = adminDateInputToIso(draft.end_date);
  if (!startDate) errors.start_date = draft.start_date ? "invalid_date" : "required";
  if (!endDate) errors.end_date = draft.end_date ? "invalid_date" : "required";
  if (startDate && endDate) {
    if (endDate < startDate) errors.end_date = "date_order";
    else if (endDate < today) errors.end_date = "expired";
  }
  const value =
    startDate && endDate && !Object.keys(errors).length
      ? { start_date: startDate, end_date: endDate }
      : null;
  return { value, errors };
}

export function validateStockBatchInput(
  draft: StockBatchDraft,
  today = adminTodayIso(),
): { value: StockBatchInput | null; errors: StockBatchFieldErrors } {
  const { value: dates, errors: dateErrors } = validateStockBatchDates(draft, today);
  const errors: StockBatchFieldErrors = { ...dateErrors };
  const quantity = parsePositiveInteger(draft.quantity);
  if (quantity.error) {
    errors.quantity = quantity.error === "integer_range" ? "integer_range" : "positive_integer";
  }
  return {
    value: dates && !quantity.error ? { ...dates, quantity_units: quantity.value } : null,
    errors,
  };
}

export function stockQuantityAmount(quantityUnits: number, unitSize: string) {
  const [integer = "0", fraction = ""] = unitSize.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const scaledUnit = BigInt(integer || "0") * scale + BigInt(fraction || "0");
  return { coefficient: scaledUnit * BigInt(quantityUnits), decimalPlaces: fraction.length };
}

export function formatStockQuantityAmount(
  { coefficient, decimalPlaces }: ReturnType<typeof stockQuantityAmount>,
  unitLabel: string,
) {
  const scale = 10n ** BigInt(decimalPlaces);
  const whole = coefficient / scale;
  const remainder = (coefficient % scale)
    .toString()
    .padStart(decimalPlaces, "0")
    .replace(/0+$/, "");
  return `${whole}${remainder ? `.${remainder}` : ""} ${unitLabel}`;
}

export function formatStockQuantityTotal(
  quantityUnits: number,
  unitSize: string,
  unitLabel: string,
) {
  return formatStockQuantityAmount(stockQuantityAmount(quantityUnits, unitSize), unitLabel);
}

/** A write may have committed before a transport or response failure. */
export function isUncertainFarmSupplyWrite(cause: unknown) {
  if (!(cause instanceof Error)) return true;
  const { status, message } = cause as ClientApiError;
  return (
    status === 408 ||
    status === 404 ||
    (status ?? 0) >= 500 ||
    ["invalid_response", "network_error", "request_timeout", "upstream_timeout"].includes(message)
  );
}
