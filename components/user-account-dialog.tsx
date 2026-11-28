"use client";

import { Stack, Text } from "@mantine/core";
import { type FormEvent, type RefObject, useId, useLayoutEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FormField, FormInput } from "@/components/nfv-controls";
import { PhoneInput } from "@/components/phone-input";
import { useToast } from "@/components/toast-provider";
import {
  accountFailure,
  accountFields,
  type AccountField,
  requireAccountActionResult,
} from "@/lib/admin-users";
import { useAdminUsersMutationAccess, useRefreshAdminUsers } from "@/lib/admin-users-query";
import { api } from "@/lib/client-api";
import { normalizeEditablePhone, type EditablePhone } from "@/lib/phone-number";
import type { AdminAccountSummary } from "@/lib/types";

export type UserAccountDialogAction = "suspend" | "reset-password";
type Props = {
  onCancel: () => void;
  onSuccess: (userId: string) => void;
  confirmDisabled?: boolean;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
} & (
  | { action: "create"; userId?: never; onStateConflict?: never }
  | {
      action: UserAccountDialogAction;
      userId: string;
      onStateConflict: (message: string) => void;
    }
);

export function UserAccountDialog(props: Props) {
  return <UserAccountDialogForm key={`${props.action}:${props.userId ?? ""}`} {...props} />;
}

function UserAccountDialogForm({
  action,
  userId,
  onCancel,
  onSuccess,
  onStateConflict,
  confirmDisabled = false,
  fallbackFocusRef,
  returnFocusRef,
}: Props) {
  const { locale, t } = useAdminI18n();
  const { canMutate, captureMutationAccess } = useAdminUsersMutationAccess();
  const [isDialogCurrent] = useState(() => captureMutationAccess());
  const refreshUsers = useRefreshAdminUsers();
  const copy = t.users.accountActions;
  const toast = useToast();
  const formId = useId();
  const phoneRef = useRef<HTMLInputElement>(null);
  const pendingSubmission = useRef<symbol | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginPhone, setLoginPhone] = useState<EditablePhone>({ value: "", entry: "ready" });
  const [phoneSubmitted, setPhoneSubmitted] = useState(false);
  const [failure, setFailure] = useState<ReturnType<typeof accountFailure>>({
    message: "",
    fields: {},
  });
  const create = action === "create";
  const reset = action === "reset-password";
  const canonicalPhone = normalizeEditablePhone(loginPhone);
  const phoneError =
    failure.fields.login_phone_number ??
    (phoneSubmitted && !loginPhone.value ? t.phoneInput.required : undefined);
  const notice = {
    create: "",
    suspend: copy.suspendNotice,
    "reset-password": copy.resetNotice,
  }[action];

  useLayoutEffect(() => {
    return () => {
      pendingSubmission.current = null;
    };
  }, []);

  function updateLoginPhone(next: EditablePhone) {
    if (next.value !== loginPhone.value && failure.fields.login_phone_number) {
      setFailure((current) => ({
        ...current,
        fields: { ...current.fields, login_phone_number: undefined },
      }));
    }
    setLoginPhone(next);
  }

  async function submit(form?: HTMLFormElement) {
    if (confirmDisabled || pendingSubmission.current || !isDialogCurrent?.()) return;
    const payload: Partial<Record<AccountField, FormDataEntryValue>> = {};
    if (form) {
      const values = new FormData(form);
      for (const field of accountFields) {
        const value = values.get(field);
        if (value !== null && (field !== "email" || String(value).trim())) {
          payload[field] = value;
        }
      }
    }
    if (create) {
      if (!canonicalPhone) {
        setPhoneSubmitted(true);
        phoneRef.current?.focus();
        return;
      }
      payload.login_phone_number = canonicalPhone;
    }
    const submission = Symbol();
    const isCurrent = () => pendingSubmission.current === submission && isDialogCurrent();
    pendingSubmission.current = submission;
    setBusy(true);
    setFailure({ message: "", fields: {} });
    try {
      const result = await api<Pick<AdminAccountSummary, "id" | "status">>(
        create ? "admin/users" : `admin/users/${userId}/${action}`,
        {
          method: "POST",
          headers: { "Accept-Language": locale },
          body: JSON.stringify(payload),
        },
        { shouldRedirectToLogin: isCurrent },
      );
      if (!isCurrent()) return;
      const accountId = requireAccountActionResult(result, action, userId);
      form?.reset();
      toast(create ? copy.created : reset ? copy.resetSuccess : copy.success);
      onSuccess(accountId);
    } catch (caught) {
      if (!isCurrent()) return;
      const failure = accountFailure(caught, t, locale);
      if (failure.stateConflict && onStateConflict) onStateConflict(failure.message);
      else setFailure(failure);
      if (failure.recheckAccess) await refreshUsers(userId);
    } finally {
      if (pendingSubmission.current === submission) {
        pendingSubmission.current = null;
        setBusy(false);
      }
    }
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(event.currentTarget);
  }

  function field(
    name: AccountField,
    label: string,
    type: "text" | "email" | "password",
    autoComplete: string,
  ) {
    const showPasswordPolicy = create && name === "password1";
    return (
      <FormField
        error={failure.fields[name]}
        hint={showPasswordPolicy ? copy.passwordPolicy : undefined}
        label={label}
      >
        <FormInput
          aria-invalid={Boolean(failure.fields[name])}
          autoComplete={autoComplete}
          data-autofocus={name === "name" || (reset && name === "password1") || undefined}
          disabled={busy}
          inputWrapperOrder={
            showPasswordPolicy ? ["label", "input", "description", "error"] : undefined
          }
          name={name}
          required={name !== "email"}
          type={type}
        />
      </FormField>
    );
  }

  return (
    <ConfirmationDialog
      busy={busy}
      busyLabel={copy.saving}
      cancelLabel={t.membershipCatalog.cancel}
      confirmDisabled={
        confirmDisabled || !canMutate || !isDialogCurrent?.() || (create && !canonicalPhone)
      }
      confirmLabel={copy[action]}
      danger={action === "suspend"}
      error={failure.message}
      fallbackFocusRef={fallbackFocusRef}
      returnFocusRef={returnFocusRef}
      {...(action === "suspend" ? { onConfirm: () => void submit() } : { formId })}
      onCancel={() => {
        if (!pendingSubmission.current) onCancel();
      }}
      title={copy[action]}
    >
      {notice && <Text>{notice}</Text>}
      {(create || reset) && (
        <form id={formId} method="post" onSubmit={submitForm}>
          <Stack gap="md">
            {create && (
              <>
                {field("name", copy.fullName, "text", "name")}
                <PhoneInput
                  ref={phoneRef}
                  state={loginPhone}
                  onChange={updateLoginPhone}
                  error={phoneError}
                  autoComplete="tel"
                  disabled={busy}
                  name="login_phone_number"
                  required
                />
                {field("email", copy.optionalEmail, "email", "email")}
              </>
            )}
            {field("password1", copy.password, "password", "new-password")}
            {field("password2", copy.confirmPassword, "password", "new-password")}
          </Stack>
        </form>
      )}
    </ConfirmationDialog>
  );
}
