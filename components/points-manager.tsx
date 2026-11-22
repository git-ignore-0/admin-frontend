"use client";

import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";
import { Anchor, Paper, Stack, Table, Text } from "@mantine/core";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { formatAdminDateTime } from "@/lib/admin-date";
import { userEmailStatus } from "@/lib/admin-users";
import { fetchAdminUsers } from "@/lib/admin-users-query";
import { requestErrorMessage } from "@/lib/client-error";
import { usePaginatedList } from "@/lib/use-paginated-list";

export function PointsManager() {
  const { t } = useAdminI18n();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const fetchPage = useCallback(
    (page: number, signal: AbortSignal) => fetchAdminUsers({ page, search }, signal),
    [search],
  );
  const getErrorMessage = useCallback((caught: unknown) => requestErrorMessage(caught, t), [t]);
  const { error, items, loading, meta, page, reload, setPage } = usePaginatedList({
    fetchPage,
    getErrorMessage,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const nextSearch = query.trim();
    setPage(1);
    if (nextSearch === search && page === 1) reload();
    else setSearch(nextSearch);
  }

  function changeQuery(value: string) {
    setQuery(value);
    if (!value.trim() && search) {
      setPage(1);
      setSearch("");
    }
  }

  function clearFilters() {
    setQuery("");
    setSearch("");
    setPage(1);
  }

  const detailLabel = t.points.viewDetail;

  return (
    <section aria-busy={loading} className="admin-list-section">
      <ListToolbar
        busy={loading}
        clearLabel={t.common.clearFilters}
        hasFilters={Boolean(query || search)}
        onClear={clearFilters}
        onQueryChange={changeQuery}
        onSubmit={submit}
        placeholder={t.users.searchPlaceholder}
        query={query}
        resultCount={meta?.total}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={t.users.searchLabel}
        searchSubmitLabel={loading ? t.users.searching : t.users.search}
      />
      <ListState
        empty={t.users.empty}
        error={error}
        hasData={items !== null}
        isEmpty={items?.length === 0}
        loading={loading}
        loadingLabel={t.users.loading}
        onRetry={reload}
        retryLabel={t.common.retry}
      />
      {items && items.length > 0 && (
        <Paper withBorder radius="md" style={{ minWidth: 0 }}>
          <Table.ScrollContainer minWidth={680}>
            <Table aria-label={t.common.users}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t.users.name}</Table.Th>
                  <Table.Th>{t.users.loginPhone}</Table.Th>
                  <Table.Th>{t.users.created}</Table.Th>
                  <Table.Th>{t.users.status}</Table.Th>
                  <Table.Th ta="right">{t.users.balance}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((user) => (
                  <Table.Tr key={user.id}>
                    <Table.Td>
                      <Stack gap={3}>
                        <Anchor
                          component={Link}
                          aria-label={`${detailLabel}: ${user.name}`}
                          href={`/points/${user.id}`}
                          fw={600}
                          size="sm"
                        >
                          {user.name}
                        </Anchor>
                        {user.email && (
                          <Text size="xs" c="dimmed">
                            {user.email}
                          </Text>
                        )}
                        <Text size="xs" c="dimmed">
                          {userEmailStatus(user, t)}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>{user.login_phone_number || "—"}</Table.Td>
                    <Table.Td>{formatAdminDateTime(user.date_joined)}</Table.Td>
                    <Table.Td>
                      <Status
                        domain="user"
                        status={user.status}
                        label={
                          t.users.statuses[user.status as keyof typeof t.users.statuses] ??
                          user.status
                        }
                      />
                    </Table.Td>
                    <Table.Td ta="right">{user.points_balance}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
      {meta && (
        <Pagination
          disabled={loading}
          nextLabel={t.common.next}
          onPage={setPage}
          page={meta.page}
          pageSize={meta.page_size}
          previousLabel={t.common.previous}
          summary={t.common.pagination}
          total={meta.total}
        />
      )}
    </section>
  );
}
