import type { AdminDictionary, AdminLocale } from "@/lib/admin-i18n";
import { apiErrorFields, type ClientApiError, requestErrorMessage } from "@/lib/client-error";
import type { AdminUserListItem } from "@/lib/types";

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
      return { message: copy.protected, fields: {} };
    case "email_recovery_required":
      return { message: copy.emailRecovery, fields: {} };
    case "account_state_conflict":
      return { message: copy.stateConflict, fields: {}, stateConflict: error.status === 409 };
  }
  if (error?.status === 403) return { message: t.common.forbidden, fields: {} };
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

export function userIdentityLabel(
  user: Pick<AdminUserListItem, "name" | "email" | "login_phone_number">,
) {
  return [user.name, user.email || user.login_phone_number].filter(Boolean).join(" · ");
}

export function userEmailStatus(
  user: Pick<AdminUserListItem, "email" | "email_verified">,
  t: AdminDictionary,
) {
  if (!user.email) return t.users.emailMissing;
  return user.email_verified ? t.users.emailVerified : t.users.emailUnverified;
}
