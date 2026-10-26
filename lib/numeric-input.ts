export const MAX_POSITIVE_INTEGER = 2_147_483_647;
export const MAX_POSITIVE_BIG_INTEGER = 9_223_372_036_854_775_807n;
export const MAX_UNIT_SIZE = 9_999_999.999;

export type NumericInputError =
  | "required"
  | "positive_integer"
  | "integer_range"
  | "positive_decimal"
  | "decimal_format"
  | "decimal_range";

export type NumericInputResult =
  { value: number; error?: never } | { value?: never; error: NumericInputError };

export function sanitizeIntegerInput(value: string) {
  return value.replace(/\D/g, "");
}

export function parsePositiveBigInteger(value: string) {
  if (!value) return { error: "required" as const };
  if (!/^\d+$/.test(value)) return { error: "positive_integer" as const };
  const normalized = value.replace(/^0+/, "") || "0";
  if (normalized === "0") return { error: "positive_integer" as const };
  const parsed = BigInt(normalized);
  if (parsed > MAX_POSITIVE_BIG_INTEGER) return { error: "integer_range" as const };
  return { value: parsed };
}

export function sanitizeDecimalInput(value: string) {
  let hasDecimalPoint = false;
  let result = "";
  for (const character of value.replace(/,/g, ".")) {
    if (/\d/.test(character)) {
      result += character;
    } else if (character === "." && !hasDecimalPoint) {
      result += character;
      hasDecimalPoint = true;
    }
  }
  return result;
}

export function formatDecimalInput(value: string) {
  const [integer, fraction] = value.split(".");
  if (fraction === undefined) return value;
  const compactFraction = fraction.replace(/0+$/, "");
  return compactFraction ? `${integer}.${compactFraction}` : integer;
}

export function parsePositiveInteger(
  value: string,
  { max = MAX_POSITIVE_INTEGER }: { max?: number } = {},
): NumericInputResult {
  if (!value) return { error: "required" };
  if (!/^\d+$/.test(value)) return { error: "positive_integer" };
  const normalized = value.replace(/^0+/, "") || "0";
  if (normalized === "0") return { error: "positive_integer" };
  const maximum = String(max);
  if (
    normalized.length > maximum.length ||
    (normalized.length === maximum.length && normalized > maximum)
  ) {
    return { error: "integer_range" };
  }
  return { value: Number(normalized) };
}

export function parsePositiveDecimal(
  value: string,
  { max = MAX_UNIT_SIZE, decimalPlaces = 3 }: { max?: number; decimalPlaces?: number } = {},
): NumericInputResult {
  if (!value) return { error: "required" };
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimalPlaces}})?$`).test(value)) {
    return { error: "decimal_format" };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return { error: "positive_decimal" };
  if (parsed > max) return { error: "decimal_range" };
  return { value: parsed };
}

export function numericInputErrorMessage(
  error: NumericInputError,
  messages: {
    required: string;
    positiveInteger: string;
    integerRange: string;
    positiveDecimal: string;
    decimalFormat: string;
    decimalRange: string;
  },
  max?: number,
) {
  const message = {
    required: messages.required,
    positive_integer: messages.positiveInteger,
    integer_range: messages.integerRange,
    positive_decimal: messages.positiveDecimal,
    decimal_format: messages.decimalFormat,
    decimal_range: messages.decimalRange,
  }[error];
  const displayedMaximum =
    max ?? (error === "integer_range" ? MAX_POSITIVE_INTEGER : MAX_UNIT_SIZE);
  return message.replace("{max}", String(displayedMaximum));
}
