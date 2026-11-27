"use client";

import { Alert, Button, Radio, SimpleGrid, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState, type FormEvent, type RefObject } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DataState, FormInput } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { requireAccountSearchRecord, userAccountPhone } from "@/lib/admin-users";
import { requirePaginatedList, requireResponseEntity } from "@/lib/api-response";
import { api, apiEnvelope } from "@/lib/client-api";
import { invalidApiResponse, requestErrorMessage, type ClientApiError } from "@/lib/client-error";
import { getCSAAccountDetails, isCSAAccountPermissionDenied } from "@/lib/csa-customer-creation";
import type { AdminUserListItem, CSACustomer, PaginationMeta } from "@/lib/types";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

export function LinkCustomerUserDialog({
  customerId,
  currentAddress,
  currentLocality,
  fallbackFocusRef,
  returnFocusRef,
  onCancel,
  onConflict,
  onLinked,
}: {
  customerId: string;
  currentAddress: string;
  currentLocality: string;
  fallbackFocusRef: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConflict?: () => Promise<unknown>;
  onLinked: (customer: CSACustomer) => void | Promise<void>;
}) {
  const { locale, t } = useAdminI18n();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const copy = t.csaCustomers;
  const submitRef = useRef(false);
  const mounted = useRef(false);
  const pendingSearch = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [users, setUsers] = useState<AdminUserListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedUser = users?.find((user) => user.id === selectedId && !user.has_csa_customer);
  const preview = useQuery({
    queryKey: ["csa-customer-link-address", customerId, selectedUser?.id],
    enabled: Boolean(selectedUser),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) => {
      if (!selectedUser) throw invalidApiResponse();
      return getCSAAccountDetails(selectedUser.id, signal);
    },
  });
  const checkingAddress = preview.fetchStatus !== "idle";
  const previewAccount = checkingAddress || preview.error ? undefined : preview.data;
  const address = previewAccount?.shipping_address;
  const canLink = Boolean(
    previewAccount && !previewAccount.has_csa_customer && address?.is_supported,
  );
  const { provinceName, wardName } = useAdministrativeUnitNames(
    address?.province_code ?? null,
    address?.ward_code ?? null,
    locale,
  );

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingSearch.current?.abort();
      pendingSearch.current = null;
    };
  }, [customerId]);

  async function searchUsers(text: string, page: number) {
    if (!text || submitRef.current || !isCurrent()) return;
    pendingSearch.current?.abort();
    const request = new AbortController();
    pendingSearch.current = request;
    setAppliedQuery(text);
    setUsers(null);
    setMeta(null);
    setSelectedId(null);
    setBusy(true);
    setError("");
    try {
      const result = await apiEnvelope<AdminUserListItem[], PaginationMeta>(
        `admin/users?page=${page}&search=${encodeURIComponent(text)}`,
        { signal: request.signal },
      );
      if (request === pendingSearch.current && isCurrent()) {
        const verified = requirePaginatedList(result, requireAccountSearchRecord, page);
        const last = Math.max(1, Math.ceil(verified.meta.total / verified.meta.page_size));
        if (page > last) {
          void searchUsers(text, last);
          return;
        }
        setUsers(verified.data);
        setMeta(verified.meta);
      }
    } catch (caught) {
      if (request === pendingSearch.current && isCurrent())
        setError(requestErrorMessage(caught, t));
    } finally {
      if (request === pendingSearch.current) {
        pendingSearch.current = null;
        setBusy(false);
      }
    }
  }

  async function linkUser() {
    if (
      !selectedUser ||
      !canLink ||
      !address ||
      pendingSearch.current ||
      submitRef.current ||
      !isCurrent()
    )
      return;
    submitRef.current = true;
    setBusy(true);
    setError("");
    try {
      const customer = await api<CSACustomer>(
        `admin/csa-customers/${customerId}/link-user`,
        {
          method: "POST",
          body: JSON.stringify({
            user_id: selectedUser.id,
            expected_shipping_address_updated_at: address.updated_at,
          }),
        },
        { shouldRedirectToLogin: () => mounted.current && isCurrent() },
      );
      if (!mounted.current || !isCurrent()) return;
      requireResponseEntity(customer, customerId);
      if (customer.user?.id !== selectedUser.id) throw invalidApiResponse();
      await onLinked(customer);
    } catch (caught) {
      if (!mounted.current || !isCurrent()) return;
      const code = caught instanceof Error ? caught.message : "";
      if (code === "csa_customer_shipping_address_changed") {
        setError(copy.shippingAddressChanged);
        await preview.refetch();
      } else if (code === "csa_customer_shipping_address_unavailable") {
        await preview.refetch();
        setError(copy.shippingAddressUnavailable);
      } else if (code === "csa_customer_user_exists") {
        setSelectedId(null);
        setError(copy.userExists);
        await onConflict?.();
      } else if ((caught as ClientApiError | null)?.status === 404) {
        setUsers(null);
        setMeta(null);
        setSelectedId(null);
        setError(requestErrorMessage(caught, t));
        void onConflict?.();
      } else if (isCSAAccountPermissionDenied(caught)) {
        const verified = await preview.refetch();
        if (!mounted.current || !isCurrent()) return;
        if (!verified.isSuccess) {
          setUsers(null);
          setMeta(null);
          setSelectedId(null);
        }
        setError(requestErrorMessage(caught, t));
      } else {
        setError(requestErrorMessage(caught, t));
      }
    } finally {
      submitRef.current = false;
      if (mounted.current && isCurrent()) setBusy(false);
    }
  }

  return (
    <ConfirmationDialog
      busy={busy}
      busyLabel={t.csaCustomers.linking}
      cancelLabel={t.membershipCatalog.cancel}
      confirmLabel={t.csaCustomers.linkConfirm}
      confirmDisabled={!canLink}
      error={error}
      fallbackFocusRef={fallbackFocusRef}
      returnFocusRef={returnFocusRef}
      onCancel={() => !busy && onCancel()}
      onConfirm={linkUser}
      title={t.csaCustomers.linkTitle}
    >
      <Alert color="yellow" role="note">
        {t.csaCustomers.linkWarning}
      </Alert>
      <form
        aria-label={t.csaCustomers.findUser}
        className="dialog-search"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void searchUsers(query.trim(), 1);
        }}
      >
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
                onChange={() => {
                  setError("");
                  setSelectedId(user.id);
                }}
              />
              {
                <>
                  <span>
                    <strong>{user.name}</strong>
                    <small>
                      {[user.email, userAccountPhone(user)].filter(Boolean).join(" · ") ||
                        t.users.emailMissing}
                    </small>
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
      {meta && (
        <Pagination
          page={meta.page}
          pageSize={meta.page_size}
          total={meta.total}
          onPage={(page) => void searchUsers(appliedQuery, page)}
          previousLabel={t.common.previous}
          nextLabel={t.common.next}
          summary={t.common.pagination}
          disabled={busy}
        />
      )}
      {!selectedUser && users?.length ? (
        <p className="field-help">{t.csaCustomers.selectUserHelp}</p>
      ) : null}
      {selectedUser && checkingAddress && (
        <DataState
          kind="loading"
          title={preview.isPaused ? t.users.offline : copy.loadingAccount}
          compact
        />
      )}
      {selectedUser && !checkingAddress && preview.error && (
        <DataState
          kind="error"
          title={requestErrorMessage(preview.error, t)}
          compact
          action={{ label: t.common.retry, onClick: () => void preview.refetch() }}
        />
      )}
      {previewAccount && (
        <>
          {previewAccount.has_csa_customer && (
            <Alert color="yellow" role="alert">
              {copy.userExists}
            </Alert>
          )}
          {!previewAccount.has_csa_customer && !address?.is_supported && (
            <Alert color="yellow" role="alert">
              {copy.shippingAddressUnavailable}
            </Alert>
          )}
          {canLink && address && (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Stack gap={4}>
                <Text fw={600} size="sm">
                  {copy.currentShippingAddress}
                </Text>
                <Text size="sm" style={{ overflowWrap: "anywhere" }}>
                  {currentAddress || "—"}
                </Text>
                {currentLocality && (
                  <Text size="sm" c="dimmed">
                    {currentLocality}
                  </Text>
                )}
              </Stack>
              <Stack gap={4}>
                <Text fw={600} size="sm">
                  {copy.replacementShippingAddress}
                </Text>
                <Text size="sm" style={{ overflowWrap: "anywhere" }}>
                  {address.address}
                </Text>
                <Text size="sm" c="dimmed">
                  {[wardName ?? address.ward_code, provinceName ?? address.province_code]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              </Stack>
            </SimpleGrid>
          )}
        </>
      )}
    </ConfirmationDialog>
  );
}
