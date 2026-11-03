import type { AdminDictionary, AdminLocale } from "@/lib/admin-i18n";
import { adminDateInputToIso, formatAdminDate } from "@/lib/admin-date";
import { formatMembershipMoney } from "@/lib/membership-format";

export type CouponStatus = "active" | "inactive" | "scheduled" | "expired" | "exhausted";
export type CouponDiscountType = "percent" | "fixed";
export type CouponPaymentType = "full" | "installment";
export type CouponApplicationScope = "csa" | "store" | "both";

export type AdminCoupon = {
  id: string;
  application_scope?: CouponApplicationScope;
  code: string;
  discount_type: CouponDiscountType;
  discount_value: string;
  maximum_discount_amount: string | null;
  usage_limit: number;
  used_count: number;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
  status: CouponStatus;
  package_ids: string[];
  price_option_ids: string[];
  payment_types: CouponPaymentType[];
  installment_counts: number[];
  minimum_amount: string | null;
  scope: {
    packages: Array<{ id: string; name: string }>;
    price_options: Array<{ id: string; package_id: string; duration_months: number }>;
    payment_types: CouponPaymentType[];
    installment_counts: number[];
  };
  created_at: string;
  updated_at: string;
};

export function couponOffer(
  coupon: Pick<AdminCoupon, "discount_type" | "discount_value">,
  locale: AdminLocale,
) {
  if (coupon.discount_type === "fixed")
    return formatMembershipMoney(coupon.discount_value.split(".")[0], locale);
  return `${coupon.discount_value.replace(/\.0+$/u, "")}%`;
}

export function couponScopeSummary(coupon: AdminCoupon, t: AdminDictionary) {
  const application = t.csaCoupons.applicationScopes[coupon.application_scope ?? "csa"];
  if (coupon.application_scope === "store") return application;
  const durationLabels = coupon.scope.price_options.map((item) =>
    t.csaCoupons.months.replace("{count}", String(item.duration_months)),
  );
  const paymentLabels = coupon.payment_types.map((type) => t.csaCoupons[type]);
  const countLabels = coupon.installment_counts.map((count) =>
    t.csaCoupons.count.replace("{count}", String(count)),
  );
  return [
    application,
    ...coupon.scope.packages.map((item) => item.name),
    ...durationLabels,
    ...paymentLabels,
    ...countLabels,
  ].join(" · ");
}

export function couponErrorMessage(error: unknown, t: AdminDictionary): string {
  if (!(error instanceof Error)) return t.common.requestFailed;
  if (Object.prototype.hasOwnProperty.call(t.csaCoupons.errors, error.message)) {
    return t.csaCoupons.errors[error.message as keyof typeof t.csaCoupons.errors];
  }
  if (["network_error", "upstream_timeout", "upstream_unavailable"].includes(error.message))
    return t.common.networkError;
  if (["forbidden", "csrf_rejected"].includes(error.message)) return t.common.forbidden;
  return t.common.requestFailed;
}

export function couponDateInput(value: string, { end = false }: { end?: boolean } = {}): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (end && date.getUTCHours() === 17 && date.getUTCMinutes() === 0) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return formatAdminDate(date.toISOString(), "");
}

export function couponTimeInput(value: string, { end = false }: { end?: boolean } = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (end && date.getUTCHours() === 17 && date.getUTCMinutes() === 0) return "23:59";
  const local = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}

export function couponDateTimeInput(value: string, { end = false }: { end?: boolean } = {}) {
  const date = adminDateInputToIso(couponDateInput(value, { end }));
  const time = couponTimeInput(value, { end });
  return date && time ? `${date}T${time}` : "";
}

export function couponDateTimeToApi(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/u.exec(value);
  if (!match) return null;
  const [, date, hour, minute] = match;
  if (!adminDateInputToIso(`${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`))
    return null;
  if (Number(hour) > 23 || Number(minute) > 59) return null;
  return `${date}T${hour}:${minute}:00+07:00`;
}
