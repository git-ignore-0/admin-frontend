"use client";

import { Alert, Button, Group, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { hashKey, notifyManager, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { DataState } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { requireAccountSearchRecord } from "@/lib/admin-users";
import { requirePaginatedList } from "@/lib/api-response";
import { apiEnvelope } from "@/lib/client-api";
import {
  invalidApiResponse,
  isProtectedDataError,
  requestErrorMessage,
  type ClientApiError,
} from "@/lib/client-error";
import {
  csaCustomerCreateError,
  getCSAAccountDetails,
  isCSAAccountPermissionDenied,
  isCSACustomerCreateConflict,
  lookupCSACustomerPhone,
  type CreateCSACustomer,
} from "@/lib/csa-customer-creation";
import { formatVietnamPhone, normalizeVietnamPhone } from "@/lib/phone-number";
import type { AdminUserListItem, PaginationMeta } from "@/lib/types";
import { useAdministrativeUnitNames } from "@/lib/use-administrative-unit-names";

const accountSearchKey = ["csa-customer-create", "accounts"] as const;

export function CSACustomerAccountForm({
  accountId,
  onSelect,
  onAccountUnavailable,
  onCreate,
  saving,
}: {
  accountId: string | null;
  onSelect: (id: string | null) => void;
  onAccountUnavailable: (id: string) => void;
  onCreate: CreateCSACustomer;
  saving: boolean;
}) {
  const { locale, t } = useAdminI18n();
  const copy = t.csaCustomers;
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState<{ term: string; page: number } | null>(null);
  const [saveError, setSaveError] = useState<{ accountId: string | null; message: string } | null>(
    null,
  );
  const searchInput = useRef<HTMLInputElement>(null);
  const chooseAnother = useRef<HTMLButtonElement>(null);
  const returningToSearch = useRef(false);

  useEffect(() => {
    if (accountId !== null) chooseAnother.current?.focus();
    else if (returningToSearch.current) {
      returningToSearch.current = false;
      searchInput.current?.focus();
    }
  }, [accountId]);
  const matchKey = [...accountSearchKey, search];
  const matches = useQuery({
    queryKey: matchKey,
    enabled: search !== null && accountId === null,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      if (!search) throw invalidApiResponse();
      const params = new URLSearchParams({
        page: String(search.page),
        search: search.term,
        has_csa_customer: "false",
      });
      try {
        return requirePaginatedList(
          await apiEnvelope<AdminUserListItem[], PaginationMeta>(`admin/users?${params}`, {
            signal,
          }),
          requireAccountSearchRecord,
          search.page,
        );
      } catch (caught) {
        if (!signal.aborted && isProtectedDataError(caught)) {
          notifyManager.batch(() => {
            void queryClient.cancelQueries({
              queryKey: accountSearchKey,
              predicate: (query) => query.queryHash !== hashKey(matchKey),
            });
            queryClient.setQueriesData({ queryKey: accountSearchKey }, () => null);
          });
        }
        throw caught;
      }
    },
  });
  const meta = matches.error ? undefined : matches.data?.meta;
  useEffect(() => {
    if (!meta || !search || matches.isFetching) return;
    const last = Math.max(1, Math.ceil(meta.total / meta.page_size));
    if (search.page > last) setSearch({ ...search, page: last });
  }, [matches.isFetching, meta, search]);
  const searching = matches.fetchStatus !== "idle";
  const details = useQuery({
    queryKey: ["csa-customer-create", "account", accountId],
    enabled: accountId !== null,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      if (!accountId) throw invalidApiResponse();
      const account = await getCSAAccountDetails(accountId, signal);
      const phone = normalizeVietnamPhone(account.login_phone_number ?? "");
      const lookup =
        phone && !account.has_csa_customer ? await lookupCSACustomerPhone(phone, signal) : null;
      if (
        lookup?.status === "available" ||
        (lookup?.status === "account_found" && lookup.user.id !== accountId)
      ) {
        throw invalidApiResponse();
      }
      return { account, lookup, phone };
    },
  });
  const checkingAccount = details.fetchStatus !== "idle";
  const accountMissing = (details.error as ClientApiError | null)?.status === 404;
  const accountUnavailable = accountMissing || isCSAAccountPermissionDenied(details.error);
  useEffect(() => {
    if (accountId && accountUnavailable && !checkingAccount) {
      onAccountUnavailable(accountId);
      setSearch(null);
      queryClient.removeQueries({ queryKey: accountSearchKey });
    }
  }, [accountId, accountUnavailable, checkingAccount, onAccountUnavailable, queryClient]);

  const selected = checkingAccount || details.error ? undefined : details.data;
  const account = selected?.account;
  const address = account?.shipping_address;
  const { provinceName, wardName } = useAdministrativeUnitNames(
    address?.province_code ?? null,
    address?.ward_code ?? null,
    locale,
  );
  const duplicate =
    selected?.lookup?.status === "customer_exists" ? selected.lookup.customer : null;
  let accountIssue = "";
  if (account?.has_csa_customer) accountIssue = copy.userExists;
  else if (duplicate)
    accountIssue = duplicate.is_linked ? copy.duplicatePhone : copy.existingManagedCustomer;
  else if (account && !account.name.trim()) accountIssue = copy.nameRequired;
  else if (account && !selected?.phone) accountIssue = copy.accountPhoneUnavailable;
  else if (account && !address) accountIssue = copy.accountAddressMissing;
  else if (address && !address.is_supported) accountIssue = copy.shippingAreaUnsupported;
  const canCreate = selected?.lookup?.status === "account_found" && !accountIssue && !saving;

  function selectAccount(id: string | null) {
    returningToSearch.current = id === null;
    setSaveError(null);
    onSelect(id);
  }

  function clearAccountSearch() {
    setSearch(null);
    queryClient.removeQueries({ queryKey: accountSearchKey });
  }

  function searchAccounts(event: FormEvent) {
    event.preventDefault();
    const term = input.trim();
    if (!term || searching) return;
    setSaveError(null);
    if (term === search?.term && search.page === 1) void matches.refetch();
    else setSearch({ term, page: 1 });
  }

  async function createFromAccount(event: FormEvent) {
    event.preventDefault();
    if (!canCreate || !accountId) return;
    setSaveError(null);
    try {
      await onCreate("admin/csa-customers/from-user", { user_id: accountId });
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      if (code === "csa_customer_user_not_found") {
        onAccountUnavailable(accountId);
        clearAccountSearch();
        selectAccount(null);
        setSaveError({ accountId: null, message: copy.accountNotFound });
        return;
      }
      if (isCSACustomerCreateConflict(caught)) {
        await details.refetch();
        return;
      }
      setSaveError({ accountId, message: csaCustomerCreateError(caught, t) });
      if (isCSAAccountPermissionDenied(caught)) {
        const verified = await details.refetch();
        if (!verified.isSuccess) clearAccountSearch();
        return;
      }
      if (
        [
          "csa_customer_name_required",
          "csa_customer_phone_required",
          "invalid_csa_customer_phone",
          "csa_customer_shipping_address_unavailable",
        ].includes(code)
      )
        await details.refetch();
    }
  }

  return (
    <Stack gap="md">
      {accountId === null ? (
        <>
          <form onSubmit={searchAccounts}>
            <Group align="flex-end" gap="xs">
              <TextInput
                type="search"
                label={copy.findUser}
                placeholder={copy.userPlaceholder}
                ref={searchInput}
                value={input}
                style={{ flex: "1 1 12rem" }}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setInput(value);
                  if (value.trim() !== search?.term) setSearch(null);
                }}
              />
              <Button type="submit" variant="default" disabled={!input.trim() || searching}>
                {copy.search}
              </Button>
            </Group>
          </form>
          {searching && (
            <DataState
              kind="loading"
              title={matches.isPaused ? t.users.offline : copy.searching}
              compact
            />
          )}
          {!searching && matches.error && (
            <DataState
              kind="error"
              title={requestErrorMessage(matches.error, t)}
              compact
              action={{ label: t.common.retry, onClick: () => void matches.refetch() }}
            />
          )}
          {matches.data &&
            !matches.error &&
            !matches.isPaused &&
            (matches.data.data.length ? (
              <>
                <Stack gap="xs">
                  {matches.data.data.map((user) => (
                    <Button
                      key={user.id}
                      type="button"
                      variant="default"
                      fullWidth
                      styles={{
                        inner: { justifyContent: "flex-start" },
                        label: { whiteSpace: "normal", textAlign: "start" },
                      }}
                      h="auto"
                      mih={40}
                      py="xs"
                      disabled={matches.isFetching || user.has_csa_customer}
                      onClick={() => selectAccount(user.id)}
                    >
                      <Stack component="span" gap={2}>
                        <Text
                          component="span"
                          fw={600}
                          size="sm"
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {user.name}
                        </Text>
                        <Text
                          component="span"
                          c="dimmed"
                          size="xs"
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {[formatVietnamPhone(user.login_phone_number), user.email]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </Stack>
                    </Button>
                  ))}
                </Stack>
                <Pagination
                  page={matches.data.meta.page}
                  pageSize={matches.data.meta.page_size}
                  total={matches.data.meta.total}
                  nextLabel={t.common.next}
                  previousLabel={t.common.previous}
                  summary={t.common.pagination}
                  disabled={matches.isFetching}
                  onPage={(page) => setSearch(search && { ...search, page })}
                />
              </>
            ) : (
              <DataState kind="empty" title={copy.noUsers} compact />
            ))}
        </>
      ) : (
        <Button
          variant="subtle"
          type="button"
          ref={chooseAnother}
          disabled={saving}
          onClick={() => selectAccount(null)}
          style={{ alignSelf: "flex-start" }}
        >
          {copy.chooseAnotherAccount}
        </Button>
      )}
      <form onSubmit={createFromAccount} aria-busy={saving || checkingAccount}>
        <Stack gap="md">
          {accountId && checkingAccount && (
            <DataState
              kind="loading"
              title={details.isPaused ? t.users.offline : copy.loadingAccount}
              compact
            />
          )}
          {accountId && !checkingAccount && details.error && (
            <DataState
              kind="error"
              title={accountMissing ? copy.accountNotFound : requestErrorMessage(details.error, t)}
              compact
              action={{ label: t.common.retry, onClick: () => void details.refetch() }}
            />
          )}
          {account && (
            <>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label={copy.phone}
                  value={formatVietnamPhone(account.login_phone_number) ?? ""}
                  readOnly
                />
                <TextInput label={copy.name} value={account.name} readOnly />
              </SimpleGrid>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label={copy.province}
                  value={provinceName ?? address?.province_code ?? ""}
                  readOnly
                />
                <TextInput
                  label={copy.ward}
                  value={wardName ?? address?.ward_code ?? ""}
                  readOnly
                />
              </SimpleGrid>
              <TextInput label={copy.deliveryAddress} value={address?.address ?? ""} readOnly />
              {accountIssue && (
                <Alert color="yellow" role="alert">
                  <Stack gap="xs" align="flex-start">
                    <Text size="sm">{accountIssue}</Text>
                    {duplicate && !duplicate.is_linked && (
                      <Button
                        component={AdminNavigationLink}
                        href={`/csa-customers/${duplicate.id}`}
                        variant="default"
                      >
                        {copy.openCustomerToLink}
                      </Button>
                    )}
                    {!duplicate && !account.has_csa_customer && (
                      <Button
                        component={AdminNavigationLink}
                        href={`/users/${account.id}`}
                        variant="default"
                      >
                        {copy.openAccount}
                      </Button>
                    )}
                  </Stack>
                </Alert>
              )}
            </>
          )}
          {!accountIssue && !details.error && saveError?.accountId === accountId && (
            <Alert color="danger" role="alert">
              {saveError.message}
            </Alert>
          )}
          <Group component="footer" justify="flex-end">
            {!saving && (
              <Button component={AdminNavigationLink} href="/csa-customers" variant="default">
                {t.membershipCatalog.cancel}
              </Button>
            )}
            <Button type="submit" loading={saving} disabled={!canCreate}>
              {saving ? copy.saving : copy.create}
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}
