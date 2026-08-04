import type { AdminLocale } from "@/lib/admin-i18n";

export function formatMembershipMoney(value: string, locale: AdminLocale) {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function parseDecimal(value: string) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;

  return { integer: match[1], fraction: match[2] ?? "" };
}

export function formatMembershipUnits(unitSize: string, units: number, locale: AdminLocale) {
  const decimal = parseDecimal(unitSize);
  if (!decimal || !Number.isSafeInteger(units)) {
    return locale === "vi" ? `${units} đơn vị` : `${units} units`;
  }

  const scale = BigInt(10) ** BigInt(decimal.fraction.length);
  const scaledUnit = BigInt(`${decimal.integer}${decimal.fraction}`) * BigInt(units);
  const whole = scaledUnit / scale;
  const remainder = scaledUnit % scale;
  const fraction = remainder.toString().padStart(decimal.fraction.length, "0").replace(/0+$/, "");
  const value = fraction ? `${whole}.${fraction}` : whole.toString();

  return locale === "vi" ? value.replace(".", ",") : value;
}
