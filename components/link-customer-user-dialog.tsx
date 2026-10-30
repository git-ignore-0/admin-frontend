"use client";

import { FormEvent, RefObject, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { api, apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { AdminUserListItem, CSACustomer, PaginationMeta } from "@/lib/types";

export function LinkCustomerUserDialog({
  customerId,
  fallbackFocusRef,
  onCancel,
  onLinked,
}: {
  customerId: string;
  fallbackFocusRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onLinked: (customer: CSACustomer) => void;
}) {
  const { t } = useAdminI18n();
  const submitRef = useRef(false);
  const requestId = useRef(0);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserListItem[] | null>(null);
  const [selected, setSelected] = useState<AdminUserListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    const current = ++requestId.current;
    setBusy(true);
    setError("");
    try {
      const result = await apiEnvelope<AdminUserListItem[], PaginationMeta>(
        `admin/users?page=1&search=${encodeURIComponent(query.trim())}`,
      );
      if (current === requestId.current) setUsers(result.data);
    } catch (caught) {
      if (current === requestId.current) setError(requestErrorMessage(caught, t));
    } finally {
      if (current === requestId.current) setBusy(false);
    }
  }

  async function linkUser() {
    if (!selected || submitRef.current) return;
    submitRef.current = true;
    setBusy(true);
    setError("");
    try {
      const customer = await api<CSACustomer>(`admin/csa-customers/${customerId}/link-user`, {
        method: "POST",
        body: JSON.stringify({ user_id: selected.id }),
      });
      onLinked(customer);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setError(
        code === "csa_customer_user_exists"
          ? t.csaCustomers.userExists
          : code === "csa_customer_shipping_address_unavailable"
            ? t.csaCustomers.shippingAddressUnavailable
            : requestErrorMessage(caught, t),
      );
    } finally {
      submitRef.current = false;
      setBusy(false);
    }
  }

  return (
    <ConfirmationDialog
      busy={busy}
      busyLabel={t.csaCustomers.linking}
      cancelLabel={t.membershipCatalog.cancel}
      confirmLabel={t.csaCustomers.linkConfirm}
      confirmDisabled={!selected}
      error={error}
      fallbackFocusRef={fallbackFocusRef}
      onCancel={() => !busy && onCancel()}
      onConfirm={linkUser}
      title={t.csaCustomers.linkTitle}
    >
      <p className="notice-box">{t.csaCustomers.linkWarning}</p>
      <form aria-label={t.csaCustomers.findUser} className="dialog-search" onSubmit={search}>
        <label className="field">
          <span>{t.csaCustomers.findUser}</span>
          <input
            autoComplete="email"
            className="input"
            placeholder={t.csaCustomers.userPlaceholder}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="button secondary" disabled={busy || !query.trim()}>
          {t.csaCustomers.search}
        </button>
      </form>
      {users?.length === 0 && <p className="empty compact">{t.csaCustomers.noUsers}</p>}
      {users && (
        <div
          aria-label={t.csaCustomers.selectedUser}
          className="assignment-user-results"
          role="radiogroup"
        >
          {users.map((user) => (
            <label
              className={`assignment-user ${selected?.id === user.id ? "selected" : ""} ${user.has_csa_customer ? "disabled" : ""}`}
              key={user.id}
            >
              <input
                checked={selected?.id === user.id}
                disabled={user.has_csa_customer}
                name="link-user"
                onChange={() => setSelected(user)}
                type="radio"
              />
              <span>
                <strong>{user.name}</strong>
                <small>
                  {user.email} · {user.phone || "—"}
                </small>
                {user.has_csa_customer && (
                  <small className="field-error">{t.csaCustomers.userExists}</small>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
      {!selected && users?.length ? (
        <p className="field-help">{t.csaCustomers.selectUserHelp}</p>
      ) : null}
    </ConfirmationDialog>
  );
}
