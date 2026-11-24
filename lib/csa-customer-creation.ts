import type { AdminDictionary } from "@/lib/admin-i18n";
import { requireAdminUserDetail } from "@/lib/admin-users";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { api } from "@/lib/client-api";
import { invalidApiResponse, requestErrorMessage, type ClientApiError } from "@/lib/client-error";
import type { AdminUserDetail, CSACustomerPhoneLookup } from "@/lib/types";

export type CreateCSACustomer = (
  path: "admin/csa-customers" | "admin/csa-customers/from-user",
  input: object,
) => Promise<void>;

export async function lookupCSACustomerPhone(phone: string, signal: AbortSignal) {
  const result = await api<CSACustomerPhoneLookup>("admin/csa-customers/lookup", {
    method: "POST",
    body: JSON.stringify({ phone }),
    signal,
  });
  if (result?.phone !== phone) throw invalidApiResponse();
  if (result.status === "available") return result;
  if (
    result.status === "account_found" &&
    isUUID(result.user?.id) &&
    typeof result.user.name === "string"
  ) {
    return result;
  }
  if (
    result.status === "customer_exists" &&
    isUUID(result.customer?.id) &&
    typeof result.customer.is_linked === "boolean"
  ) {
    return result;
  }
  throw invalidApiResponse();
}

export async function getCSAAccountDetails(id: string, signal: AbortSignal) {
  if (!isUUID(id)) throw invalidApiResponse();
  const user = await api<AdminUserDetail>(`admin/users/${encodeURIComponent(id)}`, { signal });
  requireAdminUserDetail(user, id);
  return user;
}

function isUUID(value: unknown): value is string {
  return typeof value === "string" && UUID_PATH_SEGMENT.test(value);
}

export function isCSACustomerCreateConflict(error: unknown) {
  return (
    error instanceof Error &&
    [
      "csa_customer_phone_exists",
      "csa_customer_user_exists",
      "csa_customer_phone_has_account",
    ].includes(error.message)
  );
}

export function isCSAAccountPermissionDenied(error: unknown) {
  return (
    error instanceof Error &&
    (error as ClientApiError).status === 403 &&
    error.message !== "csrf_rejected"
  );
}

export function csaCustomerCreateError(error: unknown, t: AdminDictionary) {
  const copy = t.csaCustomers;
  switch (error instanceof Error ? error.message : "") {
    case "csa_customer_name_required":
      return copy.nameRequired;
    case "csa_customer_phone_required":
      return copy.phoneRequired;
    case "invalid_csa_customer_phone":
      return copy.invalidPhone;
    case "invalid_csa_customer_address":
      return copy.invalidAddress;
    case "csa_customer_shipping_area_unsupported":
    case "csa_customer_shipping_address_unavailable":
      return copy.shippingAreaUnsupported;
    default:
      return requestErrorMessage(error, t);
  }
}
