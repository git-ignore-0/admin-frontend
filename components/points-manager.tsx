"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Anchor, Paper, Stack, Table, Text } from "@mantine/core";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { formatAdminDateTime } from "@/lib/admin-date";
import { userEmailStatus } from "@/lib/admin-users";
import { useAdminUsersList } from "@/lib/admin-users-query";
import { requestErrorMessage } from "@/lib/client-error";
import { formatVietnamPhone } from "@/lib/phone-number";

export function PointsManager() {
  const { t } = useAdminI18n();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const list = useAdminUsersList({ page, search, status: "" });
  const [previous, setPrevious] = useState<{
    data: NonNullable<typeof list.data>;
    revision: number;
  }>();
  const retained = previous?.revision === list.accessRevision ? previous.data : undefined;
  // Pending requests and recoverable errors may keep the last authorized page.
  const visible = list.accessDenied ? undefined : (list.data ?? retained);
  if (visible !== previous?.data || (visible && previous?.revision !== list.accessRevision)) {
    setPrevious(visible ? { data: visible, revision: list.accessRevision } : undefined);
  }
  const items = visible?.data;
  const meta = visible?.meta;
  const loading = list.isFetching;
  const error = list.accessDenied
    ? t.common.forbidden
    : list.error
      ? requestErrorMessage(list.error, t)
      : list.waitingForConnection
        ? t.common.networkError
        : "";
  const reload = () => {
    void list.refetch({ cancelRefetch: false });
  };

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
        hasData={items !== undefined}
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
                    <Table.Td>{formatVietnamPhone(user.login_phone_number) || "—"}</Table.Td>
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
