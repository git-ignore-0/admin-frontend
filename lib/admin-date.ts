const ADMIN_TIME_ZONE = "Asia/Ho_Chi_Minh";
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

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
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day)
    ) {
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
