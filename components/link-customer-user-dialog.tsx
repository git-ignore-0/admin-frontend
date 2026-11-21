"use client";
import { DataState } from "@/components/nfv-controls";

import { Button, Radio, Alert } from "@mantine/core";
import { FormInput } from "@/components/nfv-controls";

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
  const pendingSearch = useRef<symbol | null>(null);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedUser = users?.find((user) => user.id === selectedId && !user.has_csa_customer);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() || submitRef.current) return;
    const request = Symbol();
    pendingSearch.current = request;
    setUsers(null);
    setSelectedId(null);
    setBusy(true);
    setError("");
    try {
      const result = await apiEnvelope<AdminUserListItem[], PaginationMeta>(
        `admin/users?page=1&search=${encodeURIComponent(query.trim())}`,
      );
      if (request === pendingSearch.current) setUsers(result.data);
    } catch (caught) {
      if (request === pendingSearch.current) setError(requestErrorMessage(caught, t));
    } finally {
      if (request === pendingSearch.current) {
        pendingSearch.current = null;
        setBusy(false);
      }
    }
  }

  async function linkUser() {
    if (!selectedUser || pendingSearch.current || submitRef.current) return;
    submitRef.current = true;
    setBusy(true);
    setError("");
    try {
      const customer = await api<CSACustomer>(`admin/csa-customers/${customerId}/link-user`, {
        method: "POST",
        body: JSON.stringify({ user_id: selectedUser.id }),
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
      confirmDisabled={!selectedUser}
      error={error}
      fallbackFocusRef={fallbackFocusRef}
      onCancel={() => !busy && onCancel()}
      onConfirm={linkUser}
      title={t.csaCustomers.linkTitle}
    >
      <Alert color="yellow" role="note">
        {t.csaCustomers.linkWarning}
      </Alert>
      <form aria-label={t.csaCustomers.findUser} className="dialog-search" onSubmit={search}>
        <label className="field">
          <span>{t.csaCustomers.findUser}</span>
          <FormInput
            autoComplete="email"

            placeholder={t.csaCustomers.userPlaceholder}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Button type="submit" variant="default" disabled={busy || !query.trim()}>
          {t.csaCustomers.search}
        </Button>
      </form>
      {users?.length === 0 && <DataState kind="empty" title={t.csaCustomers.noUsers} compact />}
      {users && (
        <div
          aria-label={t.csaCustomers.selectedUser}
          className="assignment-user-results"
          role="radiogroup"
        >
          {users.map((user) => (
            <label
              className={`assignment-user ${selectedUser?.id === user.id ? "selected" : ""} ${user.has_csa_customer ? "disabled" : ""}`}
              key={user.id}
            >
              <Radio
                checked={selectedUser?.id === user.id}
                disabled={busy || user.has_csa_customer}
                name="link-user"
                onChange={() => setSelectedId(user.id)}
              />
              {
                <>
                  <span>
                    <strong>{user.name}</strong>
                    <small>
                      {[user.email, user.login_phone_number].filter(Boolean).join(" · ") ||
                        t.users.emailMissing}
                    </small>
                    {user.phone && (
                      <small>
                        {t.users.phone}: {user.phone}
                      </small>
                    )}
                    {user.has_csa_customer && (
                      <small className="field-error">{t.csaCustomers.userExists}</small>
                    )}
                  </span>
                </>
              }
            </label>
          ))}
        </div>
      )}
      {!selectedUser && users?.length ? (
        <p className="field-help">{t.csaCustomers.selectUserHelp}</p>
      ) : null}
    </ConfirmationDialog>
  );
}
