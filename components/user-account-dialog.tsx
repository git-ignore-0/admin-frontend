"use client";

import { type FormEvent, useId, useLayoutEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FormField, FormInput } from "@/components/nfv-controls";
import { useToast } from "@/components/toast-provider";
import { accountFailure, accountFields, type AccountField } from "@/lib/admin-users";
import { api } from "@/lib/client-api";
import type { AdminAccountSummary } from "@/lib/types";

export type UserAccountDialogAction = "suspend" | "reset-password";
type Props = {
  onCancel: () => void;
  onSuccess: (userId: string) => void;
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

function UserAccountDialogForm({ action, userId, onCancel, onSuccess, onStateConflict }: Props) {
  const { locale, t } = useAdminI18n();
  const copy = t.users.accountActions;
  const toast = useToast();
  const formId = useId();
  const pendingSubmission = useRef<symbol | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ReturnType<typeof accountFailure>>({
    message: "",
    fields: {},
  });
  const create = action === "create";
  const reset = action === "reset-password";
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingSubmission.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const payload: Partial<Record<AccountField, FormDataEntryValue>> = {};
    for (const field of accountFields) {
      const value = values.get(field);
      if (value !== null && (field !== "email" || String(value).trim())) {
        payload[field] = value;
      }
    }
    const submission = Symbol();
    const isCurrent = () => pendingSubmission.current === submission;
    pendingSubmission.current = submission;
    setBusy(true);
    setFailure({ message: "", fields: {} });
    try {
      const result = await api<AdminAccountSummary | Pick<AdminAccountSummary, "id" | "status">>(
        create ? "admin/users" : `admin/users/${userId}/${action}`,
        {
          method: "POST",
          headers: { "Accept-Language": locale },
          body: JSON.stringify(payload),
        },
        { shouldRedirectToLogin: isCurrent },
      );
      if (!isCurrent()) return;
      form.reset();
      toast(create ? copy.created : reset ? copy.resetSuccess : copy.success);
      onSuccess(result.id);
    } catch (caught) {
      if (!isCurrent()) return;
      const failure = accountFailure(caught, t, locale);
      if (failure.stateConflict && onStateConflict) onStateConflict(failure.message);
      else setFailure(failure);
    } finally {
      if (isCurrent()) {
        pendingSubmission.current = null;
        setBusy(false);
      }
    }
  }

  function field(
    name: AccountField,
    label: string,
    type: "text" | "tel" | "email" | "password",
    autoComplete: string,
  ) {
    return (
      <FormField error={failure.fields[name]} label={label}>
        <FormInput
          aria-invalid={Boolean(failure.fields[name])}
          autoComplete={autoComplete}
          disabled={busy}
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
      confirmLabel={copy[action]}
      danger={action === "suspend"}
      error={failure.message}
      formId={formId}
      onCancel={onCancel}
      title={copy[action]}
    >
      {notice && <p>{notice}</p>}
      <form className="form-grid one" id={formId} method="post" onSubmit={submit}>
        {create && (
          <>
            {field("name", copy.fullName, "text", "name")}
            {field("login_phone_number", t.users.loginPhone, "tel", "tel")}
            {field("email", copy.optionalEmail, "email", "email")}
          </>
        )}
        {(create || reset) && (
          <>
            {field("password1", copy.password, "password", "new-password")}
            {field("password2", copy.confirmPassword, "password", "new-password")}
          </>
        )}
      </form>
    </ConfirmationDialog>
  );
}
