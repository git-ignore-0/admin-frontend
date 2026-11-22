"use client";

import {
  Alert,
  Anchor,
  Box,
  Button,
  Divider,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type MouseEvent, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Status } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { Pagination } from "@/components/pagination";
import { RecoveryAlert } from "@/components/recovery-alert";
import { UserAccountDialog } from "@/components/user-account-dialog";
import { UserEmail } from "@/components/user-email";
import { formatAdminDate } from "@/lib/admin-date";
import {
  adminUserHref,
  adminUsersListHref,
  adminUserStatuses,
  readAdminUsersListContext,
  useAdminUsersList,
  useAdminUsersMutationAccess,
  useRefreshAdminUsers,
} from "@/lib/admin-users-query";
import { requestErrorMessage } from "@/lib/client-error";
import type { AdminUserListItem } from "@/lib/types";

function openFromRow(event: MouseEvent<HTMLTableRowElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !(event.target instanceof Element)
  )
    return;
  if (
    event.target.closest(
      "a, button, input, select, textarea, label, summary, [role=button], [role=checkbox], [contenteditable]",
    ) ||
    window.getSelection()?.type === "Range"
  )
    return;
  event.currentTarget.querySelector<HTMLAnchorElement>("[data-record-link]")?.click();
}

function UserRow({
  user,
  href,
  selected,
  onOpen,
}: {
  user: AdminUserListItem;
  href: string;
  selected: boolean;
  onOpen: (trigger: HTMLElement) => void;
}) {
  const { t } = useAdminI18n();
  const link = useRef<HTMLAnchorElement>(null);
  return (
    <Table.Tr
      data-selected={selected || undefined}
      style={{ cursor: "pointer" }}
      onClick={openFromRow}
    >
      <Table.Td>
        <Stack gap="calc(var(--mantine-spacing-xs) / 2)" style={{ overflowWrap: "anywhere" }}>
          <Anchor
            ref={link}
            component={AdminNavigationLink}
            href={href}
            scroll={false}
            data-record-link
            data-user-id={user.id}
            aria-current={selected ? "page" : undefined}
            aria-label={`${t.users.view}: ${user.name}`}
            c="inherit"
            fw={600}
            underline="never"
            onNavigate={() => {
              if (link.current) onOpen(link.current);
            }}
          >
            {user.name}
          </Anchor>
          <UserEmail user={user} />
        </Stack>
      </Table.Td>
      <Table.Td ta="center">
        {user.has_csa_customer ? (
          <Tooltip label={t.users.csaPresent} events={{ hover: true, focus: true, touch: false }}>
            <Box
              component="span"
              display="inline-flex"
              role="img"
              aria-label={t.users.csaPresent}
              tabIndex={0}
            >
              <IconCheck size={16} color="var(--success)" aria-hidden />
            </Box>
          </Tooltip>
        ) : (
          <VisuallyHidden>{t.users.csaAbsent}</VisuallyHidden>
        )}
      </Table.Td>
      <Table.Td>{formatAdminDate(user.date_joined)}</Table.Td>
      <Table.Td>
        <Status
          domain="user"
          status={user.status}
          label={
            Object.hasOwn(t.users.statuses, user.status)
              ? t.users.statuses[user.status as keyof typeof t.users.statuses]
              : user.status
          }
        />
      </Table.Td>
    </Table.Tr>
  );
}

export function UserDirectory() {
  const { t } = useAdminI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mobile = useMediaQuery("(max-width: 47.99em)");
  const context = readAdminUsersListContext(searchParams ?? new URLSearchParams());
  const { search, status, page } = context;
  const list = useAdminUsersList(context);
  const { canMutate, captureMutationAccess } = useAdminUsersMutationAccess();
  const refreshUsers = useRefreshAdminUsers();
  const [draftSearch, setDraftSearch] = useState(search);
  const [draftStatus, setDraftStatus] = useState(status);
  const [createRevision, setCreateRevision] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<{ element: HTMLElement | null; x: number; y: number } | null>(null);
  const selectedId = pathname?.startsWith("/users/") ? pathname.slice("/users/".length) : undefined;
  const previousSelection = useRef(selectedId);
  const items = list.data?.data;
  const meta = list.data?.meta;
  const loading = list.isFetching;
  const canCreate = canMutate && !list.accessDenied && !list.waitingForConnection;
  const createDialogOpen =
    canMutate && !list.accessDenied && createRevision === list.accessRevision;
  const refetch = async () => {
    await list.refetch({ cancelRefetch: false });
  };

  useEffect(() => setDraftSearch(search), [search]);
  useEffect(() => {
    const returning = !selectedId && previousSelection.current;
    previousSelection.current = selectedId;
    if (!returning) return;
    const saved = opener.current;
    const frame = window.requestAnimationFrame(() => {
      opener.current = null;
      const row = Array.from(
        root.current?.querySelectorAll<HTMLAnchorElement>("[data-record-link]") ?? [],
      ).find((link) => link.dataset.userId === returning);
      const target =
        saved?.element?.isConnected && !saved.element.matches(":disabled")
          ? saved.element
          : (row ?? root.current);
      if (saved && (window.scrollX !== saved.x || window.scrollY !== saved.y)) {
        window.scrollTo(saved.x, saved.y);
      }
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId]);

  function updateContext(next: typeof context) {
    const params = new URLSearchParams({ ...next, page: String(next.page) });
    const href = adminUsersListHref(params);
    if (href !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", href);
    }
  }

  useEffect(() => {
    if (selectedId || !meta || loading || list.accessDenied) return;
    const lastPage = Math.max(1, Math.ceil(meta.total / meta.page_size));
    if (page > lastPage) {
      const params = new URLSearchParams({ search, status, page: String(lastPage) });
      window.history.replaceState(null, "", adminUsersListHref(params));
    }
  }, [list.accessDenied, loading, meta, page, search, selectedId, status]);

  function rememberOpener(element: HTMLElement | null) {
    opener.current = { element, x: window.scrollX, y: window.scrollY };
  }

  function clearSearch() {
    setDraftSearch("");
    updateContext({ search: "", status, page: 1 });
  }

  function changeStatus(value: typeof status) {
    setDraftStatus(value);
    updateContext({ search, status: value, page: value === status ? page : 1 });
  }

  const noResults = Boolean(search || status);
  const initialLoading = !items && loading && !list.accessDenied;
  const table = (
    <Table.ScrollContainer
      type="native"
      minWidth={700}
      role="region"
      aria-label={t.common.users}
      aria-hidden={initialLoading || undefined}
      tabIndex={initialLoading ? undefined : 0}
      style={{ outlineOffset: -2 }}
    >
      <Table aria-label={t.common.users} aria-busy={loading || undefined} withRowBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col">{t.common.users}</Table.Th>
            <Table.Th scope="col" ta="center">
              {t.common.csa}
            </Table.Th>
            <Table.Th scope="col">{t.users.created}</Table.Th>
            <Table.Th scope="col">{t.users.shortStatus}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initialLoading
            ? Array.from({ length: 5 }, (_, row) => (
                <Table.Tr key={row}>
                  <Table.Td>
                    <Skeleton height={34} width="80%" />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={12} width="60%" mx="auto" />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={12} width="80%" />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={12} width="80%" />
                  </Table.Td>
                </Table.Tr>
              ))
            : items?.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  href={adminUserHref(user.id, context)}
                  selected={user.id === selectedId}
                  onOpen={rememberOpener}
                />
              ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  return (
    <>
      <Stack
        ref={root}
        tabIndex={-1}
        gap="md"
        miw={0}
        hidden={Boolean(mobile && selectedId)}
        inert={Boolean(selectedId || createDialogOpen) || undefined}
        style={mobile && selectedId ? { display: "none" } : undefined}
      >
        <PageHeading title={t.common.users} visuallyHiddenTitle bottomSpacing={0} />
        <ListToolbar
          busy={loading}
          search={{
            label: t.users.searchLabel,
            placeholder: t.users.searchPlaceholder,
            value: draftSearch,
            appliedValue: search,
            onChange: setDraftSearch,
            formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
            submitLabel: t.users.search,
            clearLabel: t.common.clearFilters,
            onClear: clearSearch,
            onSubmit: (value) => {
              const applied = value.trim();
              if (applied === search && page === 1) void refetch();
              else updateContext({ search: applied, status, page: 1 });
            },
          }}
          filterPopover={{
            label: t.users.filter,
            activeCount: Number(Boolean(status)),
            onOpen: () => setDraftStatus(status),
            onDismiss: () => setDraftStatus(status),
            clearLabel: t.common.clearFilters,
            clearDisabled: !status && !draftStatus,
            onClear: () => changeStatus(""),
            apply: {
              label: t.users.applyFilters,
              disabled: draftStatus === status,
              onApply: () => changeStatus(draftStatus),
            },
            children: (
              <Select
                label={t.users.status}
                placeholder={t.users.status}
                value={draftStatus || null}
                onChange={(value) =>
                  setDraftStatus(adminUserStatuses.find((option) => option === value) ?? "")
                }
                data={adminUserStatuses.map((value) => ({ value, label: t.users.statuses[value] }))}
                comboboxProps={{
                  withinPortal: false,
                  floatingStrategy: "fixed",
                  middlewares: { size: { padding: 8 } },
                  styles: { dropdown: { overflowY: "auto" } },
                }}
                clearable
                withScrollArea={false}
                disabled={loading}
              />
            ),
          }}
          refresh={{ label: t.users.refresh, disabled: !items, onRefresh: refetch }}
          primaryAction={
            <Button
              ref={createButton}
              disabled={!canCreate}
              leftSection={<IconPlus size={16} aria-hidden />}
              onClick={() => {
                if (canCreate && captureMutationAccess()) setCreateRevision(list.accessRevision);
              }}
            >
              {t.users.accountActions.create}
            </Button>
          }
        />
        <Paper component="section" w="100%" miw={0} style={{ overflow: "hidden" }}>
          {list.accessDenied ? (
            <RecoveryAlert
              message={t.common.forbidden}
              retryLabel={t.common.retry}
              onRetry={() => void refetch()}
              loading={loading}
            />
          ) : (
            <>
              {list.waitingForConnection && (
                <Alert color="info" role="status">
                  {t.users.offline}
                </Alert>
              )}
              {Boolean(items?.length) && table}
              {items && loading && (
                <VisuallyHidden role="status">{t.users.refreshing}</VisuallyHidden>
              )}
              <Box p={list.error ? "md" : undefined}>
                <ListState
                  embedded
                  hasData={items !== undefined}
                  isEmpty={items?.length === 0}
                  empty={t.users.empty}
                  noResults={noResults ? t.users.noMatches : undefined}
                  loading={initialLoading}
                  loadingLabel={t.users.loading}
                  loadingPlaceholder={table}
                  error={list.error ? requestErrorMessage(list.error, t) : ""}
                  onRetry={() => void refetch()}
                  retryLabel={t.common.retry}
                />
              </Box>
              {meta && (
                <>
                  <Divider />
                  <Box px="md" py="sm">
                    <Pagination
                      page={meta.page}
                      total={meta.total}
                      pageSize={meta.page_size}
                      onPage={(next) => updateContext({ ...context, page: next })}
                      previousLabel={t.common.previous}
                      nextLabel={t.common.next}
                      summary={t.common.pagination}
                      disabled={loading}
                      resultCountLabel={t.common.resultCount}
                      resultCountSingularLabel={t.common.resultCountSingular}
                    />
                  </Box>
                </>
              )}
            </>
          )}
        </Paper>
      </Stack>
      {createDialogOpen && (
        <UserAccountDialog
          action="create"
          confirmDisabled={!canCreate}
          returnFocusRef={createButton}
          fallbackFocusRef={root}
          onCancel={() => setCreateRevision(null)}
          onSuccess={(id) => {
            rememberOpener(createButton.current);
            setCreateRevision(null);
            void refreshUsers(id);
            router.push(adminUserHref(id, context), { scroll: false });
          }}
        />
      )}
    </>
  );
}
