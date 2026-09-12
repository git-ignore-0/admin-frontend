const ADMIN_TIME_ZONE = "Asia/Ho_Chi_Minh";
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ADMIN_DATE_INPUT_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function partsFor(value: Date, timeZone: string, includeTime: boolean) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: includeTime ? "2-digit" : undefined,
    hourCycle: includeTime ? "h23" : undefined,
    minute: includeTime ? "2-digit" : undefined,
    month: "2-digit",
    numberingSystem: "latn",
    timeZone,
    year: "numeric",
  });
  const parts = formatter.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const date = `${get("day")}/${get("month")}/${get("year")}`;
  return includeTime ? `${date} ${get("hour")}:${get("minute")}` : date;
}

function validDate(value: Date) {
  return !Number.isNaN(value.getTime());
}

function validDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function adminTodayIso(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    numberingSystem: "latn",
    timeZone: ADMIN_TIME_ZONE,
    year: "numeric",
  });
  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatAdminDateInputValue(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function adminDateInputToIso(value: string): string | null {
  const match = ADMIN_DATE_INPUT_PATTERN.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  if (!validDateParts(Number(year), Number(month), Number(day))) return null;
  return `${year}-${month}-${day}`;
}

export function isoDateToAdminInput(value: string | null | undefined): string {
  if (!value) return "";
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return "";
  const [, year, month, day] = match;
  if (!validDateParts(Number(year), Number(month), Number(day))) return "";
  return `${day}/${month}/${year}`;
}

export function formatAdminDateTime(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (!validDate(date)) return fallback;
  return partsFor(date, ADMIN_TIME_ZONE, true);
}

export function formatAdminDate(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const match = DATE_ONLY_PATTERN.exec(value);
  if (match) {
    const [, year, month, day] = match;
    if (!validDateParts(Number(year), Number(month), Number(day))) {
      return fallback;
    }
    return `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  if (!validDate(date)) return fallback;
  return partsFor(date, ADMIN_TIME_ZONE, false);
}

export function membershipLastReceiptDate(
  exclusiveEndDate: string | null | undefined,
): string | null {
  if (!exclusiveEndDate) return null;
  const match = DATE_ONLY_PATTERN.exec(exclusiveEndDate);
  if (!match) return null;
  const [, year, month, day] = match;
  const value = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (!validDate(value)) return null;
  value.setUTCDate(value.getUTCDate() - 1);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export function formatAdminDateTimeInZone(
  value: string | null | undefined,
  timeZone: string,
  fallback = "—",
): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (!validDate(date)) return fallback;
  try {
    return partsFor(date, timeZone, true);
  } catch {
    return fallback;
  }
}
