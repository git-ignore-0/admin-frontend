import type { AdminMembership } from "@/lib/types";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnly(value: string): Date | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
    ? date
    : null;
}

function toDateOnly(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export function addMonthsToDate(value: string, months: number): string | null {
  const source = parseDateOnly(value);
  if (!source || !Number.isInteger(months) || months < 1) return null;
  const targetMonth = source.getUTCMonth() + months;
  const year = source.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toDateOnly(new Date(Date.UTC(year, month, Math.min(source.getUTCDate(), lastDay))));
}

export function suggestedMembershipStart(memberships: AdminMembership[], today: string): string {
  return memberships
    .filter((item) => item.status !== "revoked" && item.end_date > today)
    .reduce((latest, item) => (item.end_date > latest ? item.end_date : latest), today);
}

export function membershipWouldOverlap(
  memberships: AdminMembership[],
  startDate: string,
  endDate: string,
) {
  return memberships.some(
    (item) => item.status !== "revoked" && item.start_date < endDate && item.end_date > startDate,
  );
}
