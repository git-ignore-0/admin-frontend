import type { AdminDictionary, AdminLocale } from "@/lib/admin-i18n";
import { requireResponseEntity } from "@/lib/api-response";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { formatVietnamPhone } from "@/lib/phone-number";
import {
  apiErrorFields,
  type ClientApiError,
  invalidApiResponse,
  isApiObject,
  requestErrorMessage,
} from "@/lib/client-error";
import type {
  AdminAccountSummary,
  AdminUserAccountAction,
  AdminUserDetail,
  AdminUserListItem,
  InvitedAdminUser,
  UserShippingAddress,
} from "@/lib/types";

const statusAfterAction = {
  create: "pending_activation",
  activate: "active",
  suspend: "suspended",
  reactivate: "active",
} as const;

type AccountAction = AdminUserAccountAction | "create";
const userAccountActions = new Set<AdminUserAccountAction>([
  "activate",
  "suspend",
  "reactivate",
  "reset-password",
]);

export function requireAccountActionResult(
  data: Pick<AdminAccountSummary, "id" | "status">,
  action: AccountAction,
  userId?: string,
) {
  const { id, status } = requireResponseEntity(data);
  const expected =
    action === "reset-password"
      ? ["pending_activation", "active", "suspended"].includes(status)
      : status === statusAfterAction[action];
  if (!UUID_PATH_SEGMENT.test(id) || (userId !== undefined && id !== userId) || !expected) {
    throw invalidApiResponse();
  }
  return id;
}

function requireAccountIdentity(user: AdminUserListItem) {
  requireResponseEntity(user);
  if (
    typeof user.name !== "string" ||
    (user.email !== null && typeof user.email !== "string") ||
    (user.login_phone_number !== null && typeof user.login_phone_number !== "string")
  ) {
    throw invalidApiResponse();
  }
}

export function requireAdminUserRecord(user: AdminUserListItem) {
  requireAccountIdentity(user);
  if (
    typeof user.status !== "string" ||
    typeof user.date_joined !== "string" ||
    typeof user.email_verified !== "boolean" ||
    !Number.isFinite(user.points_balance) ||
    typeof user.has_csa_customer !== "boolean"
  ) {
    throw invalidApiResponse();
  }
}

export function requireInvitedUserRecord(invitee: InvitedAdminUser) {
  requireResponseEntity(invitee);
  if (
    typeof invitee.name !== "string" ||
    typeof invitee.status !== "string" ||
    (invitee.email !== null && typeof invitee.email !== "string") ||
    (invitee.referred_at != null && typeof invitee.referred_at !== "string")
  ) {
    throw invalidApiResponse();
  }
}

export function requireAdminUserDetail(user: AdminUserDetail, id: string) {
  requireAdminUserRecord(user);
  const textFields = [user.phone, user.address, user.province_code, user.ward_code];
  if (
    user.id !== id ||
    textFields.some((value) => value != null && typeof value !== "string") ||
    typeof user.referral_code !== "string" ||
    (user.source !== "organic" && user.source !== "referred") ||
    !Number.isSafeInteger(user.invited_count) ||
    user.invited_count < 0 ||
    (user.referrer !== null &&
      (!isApiObject(user.referrer) || typeof user.referrer.name !== "string"))
  ) {
    throw invalidApiResponse();
  }
  if (
    (user.account_actions !== undefined &&
      (!Array.isArray(user.account_actions) ||
        user.account_actions.some((action) => !userAccountActions.has(action)))) ||
    (user.can_edit_shipping_address !== undefined &&
      typeof user.can_edit_shipping_address !== "boolean") ||
    (user.can_edit_shipping_address === true && user.shipping_address === undefined)
  ) {
    throw invalidApiResponse();
  }
  if (user.shipping_address !== undefined && user.shipping_address !== null) {
    requireUserShippingAddress(user.shipping_address);
  }
}

export function requireUserShippingAddress(address: UserShippingAddress) {
  requireResponseEntity(address);
  if (
    !UUID_PATH_SEGMENT.test(address.id) ||
    typeof address.recipient_name !== "string" ||
    typeof address.phone_number !== "string" ||
    [
      address.province_code,
      address.ward_code,
      address.address,
      address.created_at,
      address.updated_at,
    ].some((value) => typeof value !== "string" || !value.trim()) ||
    typeof address.is_supported !== "boolean" ||
    (address.shipping_fee_vnd !== null && typeof address.shipping_fee_vnd !== "string")
  ) {
    throw invalidApiResponse();
  }
}

export function requireAccountSearchRecord(user: AdminUserListItem) {
  requireAccountIdentity(user);
  if (typeof user.has_csa_customer !== "boolean" || typeof user.phone !== "string") {
    throw invalidApiResponse();
  }
}

export const accountFields = [
  "name",
  "login_phone_number",
  "email",
  "password1",
  "password2",
] as const;
export type AccountField = (typeof accountFields)[number];
type AccountFailure = {
  message: string;
  fields: Partial<Record<AccountField, string>>;
  stateConflict?: boolean;
  recheckAccess?: boolean;
};

function validationText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join(" ");
  return "";
}

function fieldValidationText(
  value: unknown,
  field: AccountField,
  label: string,
  t: AdminDictionary,
  locale: AdminLocale,
) {
  const copy = t.users.accountActions;
  const issues = Array.isArray(value) ? value : [value];
  const messages = new Set<string>();
  for (const issue of issues) {
    const details =
      issue && typeof issue === "object"
        ? (issue as { code?: unknown; message?: unknown })
        : undefined;
    const code = details?.code;
    const message = validationText(details?.message ?? issue);
    if (!message && typeof code !== "string") continue;

    if (
      field === "password2" &&
      (code === "password_mismatch" || message === "Passwords do not match.")
    ) {
      messages.add(copy.passwordMismatch);
    } else if (
      (field === "login_phone_number" || field === "email") &&
      (code === "unique" || message === "This identifier is already in use.")
    ) {
      messages.add(field === "login_phone_number" ? copy.phoneInUse : copy.emailInUse);
    } else {
      messages.add(
        locale === "en" && message ? message : t.common.invalidField.replace("{field}", label),
      );
    }
  }
  return [...messages].join(" ");
}

export function accountFailure(
  caught: unknown,
  t: AdminDictionary,
  locale: AdminLocale,
): AccountFailure {
  const copy = t.users.accountActions;
  const error = caught instanceof Error ? (caught as ClientApiError) : undefined;
  switch (error?.message) {
    case "account_target_protected":
      return { message: copy.protected, fields: {}, stateConflict: error.status === 409 };
    case "email_recovery_required":
      return { message: copy.emailRecovery, fields: {} };
    case "account_state_conflict":
      return { message: copy.stateConflict, fields: {}, stateConflict: error.status === 409 };
  }
  if (error?.status === 403) {
    return {
      message: t.common.forbidden,
      fields: {},
      recheckAccess: error.message !== "csrf_rejected",
    };
  }
  if (error?.status === 400) {
    const payload: unknown = error.payload;
    const details = payload && typeof payload === "object" ? payload : {};
    const messages = { ...details, ...apiErrorFields(error) } as Record<string, unknown>;
    const labels = {
      name: copy.fullName,
      login_phone_number: t.users.loginPhone,
      email: t.users.email,
      password1: copy.password,
      password2: copy.confirmPassword,
    };
    const fields: AccountFailure["fields"] = {};
    for (const field of accountFields) {
      const message = fieldValidationText(messages[field], field, labels[field], t, locale);
      if (message) fields[field] = message;
    }
    const general = validationText(messages.non_field_errors) || validationText(payload);
    if (general && locale === "en") return { fields, message: general };
    return { fields, message: general || !Object.keys(fields).length ? copy.invalid : "" };
  }
  return { message: requestErrorMessage(caught, t), fields: {} };
}

export function userAccountPhone(user: Pick<AdminUserListItem, "login_phone_number" | "phone">) {
  return formatVietnamPhone(user.login_phone_number || user.phone || null);
}

export function userIdentityLabel(
  user: Pick<AdminUserListItem, "name" | "email" | "login_phone_number">,
) {
  return [user.name, user.email || formatVietnamPhone(user.login_phone_number)]
    .filter(Boolean)
    .join(" · ");
}

export function userEmailStatus(
  user: Pick<AdminUserListItem, "email" | "email_verified">,
  t: AdminDictionary,
) {
  if (!user.email) return t.users.emailMissing;
  return user.email_verified ? t.users.emailVerified : t.users.emailUnverified;
}
