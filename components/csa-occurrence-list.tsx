"use client";

import { Anchor, Button, Group, Stack, Table, Text } from "@mantine/core";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  csaRoundListPath,
  normalizeOccurrenceSearch,
  readRoundNavigationContext,
  roundConfigurationHref,
  roundRecordHref,
  roundNavigationHref,
} from "@/app/(admin)/csa-rounds/round-navigation";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { CSARoundBreadcrumbs } from "@/components/csa-round-breadcrumbs";
import {
  CSARoundListResults,
  CSARoundStatusSelect,
  useCSARoundPage,
} from "@/components/csa-round-list-results";
import { ListToolbar } from "@/components/list-toolbar";
import { DataState, Status } from "@/components/nfv-controls";
import { PageHeading } from "@/components/page-heading";
import { openRecordFromRow } from "@/components/record-row-navigation";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
import { isProtectedDataError, requestErrorMessage, type ClientApiError } from "@/lib/client-error";
import {
  csaRoundConfigurationKey,
  getRoundConfiguration,
  getRoundOccurrences,
  deleteRoundConfiguration,
  mutateRoundConfiguration,
  type CSARoundConfiguration,
} from "@/lib/csa-rounds";
import { csaRoundError, csaRoundsCopy } from "@/lib/csa-rounds-copy";

export function CSAOccurrenceList({ configurationId }: { configurationId: string }) {
  return <CSAOccurrenceListContent key={configurationId} configurationId={configurationId} />;
}

function CSAOccurrenceListContent({ configurationId }: { configurationId: string }) {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const router = useRouter();
  const toast = useToast();
  const context = readRoundNavigationContext(useSearchParams());
  const { page, status, type, occurrencePage, occurrenceStatus, occurrenceSearch } = context;
  const [draftStatus, setDraftStatus] = useState(occurrenceStatus);
  const [draftSearch, setDraftSearch] = useState(occurrenceSearch);
  const client = useQueryClient();
  const isQueryScopeCurrent = useIsAdminQueryScopeCurrent();
  const configurationKey = csaRoundConfigurationKey(configurationId);
  const configurationQuery = useQuery<CSARoundConfiguration, ClientApiError>({
    queryKey: configurationKey,
    queryFn: ({ signal }) => getRoundConfiguration(configurationId, signal),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [accessError, setAccessError] = useState<ClientApiError | null>(null);
  const configurationError = accessError ?? configurationQuery.error;
  const configurationUnavailable = Boolean(
    configurationError &&
    (isProtectedDataError(configurationError) || configurationError.status === 404),
  );
  const configuration = configurationUnavailable ? undefined : configurationQuery.data;
  const configurationLoading = configurationQuery.isPending || configurationQuery.isFetching;
  const [action, setAction] = useState<"publish" | "delete" | "stop" | null>(null);
  const actionVersion = useRef<number>(0);
  const [actionError, setActionError] = useState<unknown>(null);
  const [mutating, setMutating] = useState(false);
  const mutationLock = useRef(false);
  const mounted = useRef(false);
  const summary = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => setDraftSearch(occurrenceSearch), [occurrenceSearch]);

  const hasRounds = Boolean(configuration?.published_at);
  const isDraft = configuration?.status === "draft";
  const canCancelRecurrence =
    configuration?.type === "weekly" && configuration.status === "published";
  const fetchPage = useCallback(
    (requestedPage: number, signal: AbortSignal) =>
      getRoundOccurrences(
        configurationId,
        { page: requestedPage, status: occurrenceStatus, search: occurrenceSearch },
        signal,
      ),
    [configurationId, occurrenceSearch, occurrenceStatus],
  );
  const occurrenceHref = useCallback(
    (next: number, nextStatus = occurrenceStatus, nextSearch = occurrenceSearch) =>
      roundConfigurationHref(
        {
          page,
          status,
          type,
          occurrencePage: next,
          occurrenceStatus: nextStatus,
          occurrenceSearch: nextSearch,
        },
        configurationId,
      ),
    [configurationId, occurrenceSearch, occurrenceStatus, page, status, type],
  );
  const replacePage = useCallback(
    (next: number) => window.history.replaceState(null, "", occurrenceHref(next)),
    [occurrenceHref],
  );
  const { error, items, loading, meta, reload } = useCSARoundPage(
    fetchPage,
    occurrencePage,
    `${configurationId}/${occurrenceStatus}/${occurrenceSearch}`,
    replacePage,
    hasRounds,
  );

  const configurationName = configuration?.name;
  const busy = (hasRounds && loading) || configurationLoading || mutating;
  const actionsDisabled = busy || Boolean(configurationError);
  function refreshList() {
    void configurationQuery.refetch({ cancelRefetch: false }).then(({ isSuccess }) => {
      if (isSuccess && mounted.current && isQueryScopeCurrent()) setAccessError(null);
    });
    if (hasRounds) reload();
  }

  function openAction(next: NonNullable<typeof action>) {
    if (!configuration || actionsDisabled || !isQueryScopeCurrent()) return;
    actionVersion.current = configuration.version;
    setActionError(null);
    setAction(next);
  }

  async function submitAction() {
    if (
      !action ||
      !configuration ||
      mutationLock.current ||
      actionsDisabled ||
      !isQueryScopeCurrent()
    )
      return;
    if (action === "stop" ? !canCancelRecurrence : !isDraft) return;
    mutationLock.current = true;
    setMutating(true);
    setActionError(null);
    const active = () => mounted.current && isQueryScopeCurrent();
    let navigating = false;
    try {
      if (action === "delete") {
        await deleteRoundConfiguration(configurationId, actionVersion.current, active);
        if (!active()) return;
        client.removeQueries({ queryKey: configurationKey });
        router.replace(roundNavigationHref(csaRoundListPath, { page, status, type }));
        navigating = true;
        return;
      }

      const result = await mutateRoundConfiguration(
        configurationId,
        action,
        actionVersion.current,
        active,
      );
      if (!active()) return;
      if (action === "publish" && (occurrencePage > 1 || occurrenceStatus || occurrenceSearch)) {
        window.history.replaceState(null, "", occurrenceHref(1, "", ""));
      }
      client.setQueryData(configurationKey, result);
      setAction(null);
      if (action === "stop") toast(c.recurrence.stoppedNotice);
    } catch (error) {
      if (!active()) return;
      if (isProtectedDataError(error) || (error as ClientApiError | null)?.status === 404) {
        setAction(null);
        setAccessError(error as ClientApiError);
        void client.cancelQueries({ queryKey: configurationKey, exact: true });
        client.removeQueries({ queryKey: configurationKey, exact: true });
      } else if (
        error instanceof Error &&
        ["csa_configuration_not_draft", "version_conflict"].includes(error.message)
      ) {
        setAction(null);
        toast(csaRoundError(error, locale, c.configurationNotDraft), "error");
        await configurationQuery.refetch({ cancelRefetch: false });
      } else {
        setActionError(error);
      }
    } finally {
      if (!navigating) {
        mutationLock.current = false;
        if (active()) setMutating(false);
      }
    }
  }

  function applyStatus(next: typeof occurrenceStatus) {
    setDraftStatus(next);
    if (next !== occurrenceStatus) window.history.pushState(null, "", occurrenceHref(1, next));
  }

  function applySearch(value: string) {
    const next = normalizeOccurrenceSearch(value);
    setDraftSearch(next);
    if (next === occurrenceSearch && occurrencePage === 1) reload();
    else window.history.pushState(null, "", occurrenceHref(1, occurrenceStatus, next));
  }

  function roundDetailHref(roundId: string) {
    return roundRecordHref(roundId, context, configurationId.toLowerCase());
  }

  const rows = items?.map((round) => (
    <Table.Tr key={round.id} onClick={openRecordFromRow} style={{ cursor: "pointer" }}>
      <Table.Td>
        <Anchor
          component={AdminNavigationLink}
          display="block"
          c="inherit"
          data-record-link
          fw={600}
          href={roundDetailHref(round.id)}
          style={{ overflowWrap: "anywhere" }}
          underline="never"
        >
          <time dateTime={round.opens_at}>{formatAdminDateTime(round.opens_at)}</time>
          {" → "}
          <time dateTime={round.closes_at}>{formatAdminDateTime(round.closes_at)}</time>
          <Text component="span" display="block" size="sm" fw={400} c="dimmed">
            {round.name}
          </Text>
        </Anchor>
      </Table.Td>
      <Table.Td>
        <Status domain="csa-round" status={round.status} label={c.statuses[round.status]} />
      </Table.Td>
      <Table.Td>
        <time dateTime={round.delivery_date}>{formatAdminDate(round.delivery_date)}</time>
      </Table.Td>
      <Table.Td>{round.participant_count}</Table.Td>
    </Table.Tr>
  ));

  const actions = {
    publish: { label: c.publishConfiguration, body: c.publishConfigurationBody },
    delete: { label: c.deleteDraft, body: c.deleteDraftBody },
    stop: { label: c.recurrence.stop, body: c.recurrence.stopBody },
  };
  const confirmation = action ? actions[action] : null;
  return (
    <Stack component="section" gap="md" miw={0}>
      <CSARoundBreadcrumbs
        configurationId={configurationId}
        configurationName={configurationName}
        listContext={context}
      />
      <PageHeading title={configurationName ?? c.configurations} visuallyHiddenTitle />
      {configurationError ? (
        <RecoveryAlert
          message={requestErrorMessage(configurationError, t)}
          retryLabel={t.common.retry}
          onRetry={refreshList}
        />
      ) : null}
      {configuration ? (
        <>
          <div ref={summary} tabIndex={-1}>
            <RecordDetailFields>
              <RecordDetailField label={c.opens}>
                <time dateTime={configuration.opens_at}>
                  {formatAdminDateTime(configuration.opens_at)}
                </time>
              </RecordDetailField>
              <RecordDetailField label={c.closes}>
                <time dateTime={configuration.closes_at}>
                  {formatAdminDateTime(configuration.closes_at)}
                </time>
              </RecordDetailField>
              <RecordDetailField label={c.delivery}>
                <time dateTime={configuration.delivery_date}>
                  {formatAdminDate(configuration.delivery_date)}
                </time>
              </RecordDetailField>
              {configuration.recurrence_mode && (
                <RecordDetailField label={c.recurrence.mode}>
                  {c.recurrence.modes[configuration.recurrence_mode]}
                </RecordDetailField>
              )}
            </RecordDetailFields>
          </div>
          {isDraft && (
            <ListToolbar
              busy={busy}
              primaryAction={
                <Group gap="xs">
                  <Button
                    variant="subtle"
                    color="danger"
                    disabled={actionsDisabled}
                    onClick={() => openAction("delete")}
                  >
                    {c.deleteDraft}
                  </Button>
                  <Button
                    component={AdminNavigationLink}
                    variant="default"
                    disabled={actionsDisabled}
                    href={roundConfigurationHref(context, configurationId, "edit")}
                  >
                    {c.editConfiguration}
                  </Button>
                  <Button disabled={actionsDisabled} onClick={() => openAction("publish")}>
                    {c.publishConfiguration}
                  </Button>
                </Group>
              }
            />
          )}
          {hasRounds && (
            <>
              <ListToolbar
                busy={busy}
                search={{
                  label: c.recurrence.searchRounds,
                  placeholder: c.recurrence.searchPlaceholder,
                  value: draftSearch,
                  appliedValue: occurrenceSearch,
                  formatAppliedValue: (value) => t.users.appliedSearch.replace("{query}", value),
                  submitLabel: t.users.search,
                  clearLabel: t.common.clearFilters,
                  onChange: setDraftSearch,
                  onSubmit: applySearch,
                  onClear: () => applySearch(""),
                }}
                filterPopover={{
                  label: t.users.filter,
                  activeCount: Number(Boolean(occurrenceStatus)),
                  onOpen: () => setDraftStatus(occurrenceStatus),
                  onDismiss: () => setDraftStatus(occurrenceStatus),
                  clearLabel: t.common.clearFilters,
                  clearDisabled: !draftStatus && !occurrenceStatus,
                  onClear: () => applyStatus(""),
                  apply: {
                    label: t.users.applyFilters,
                    disabled: draftStatus === occurrenceStatus,
                    onApply: () => applyStatus(draftStatus),
                  },
                  children: <CSARoundStatusSelect value={draftStatus} onChange={setDraftStatus} />,
                }}
                refresh={{
                  label: c.refresh,
                  onRefresh: refreshList,
                  loading: loading || configurationLoading,
                }}
                primaryAction={
                  canCancelRecurrence && (
                    <Button
                      color="danger"
                      variant="outline"
                      disabled={actionsDisabled}
                      onClick={() => openAction("stop")}
                    >
                      {c.recurrence.stop}
                    </Button>
                  )
                }
              />
              <CSARoundListResults
                title={c.recurrence.occurrences}
                columns={[c.name, c.state, c.deliveryDate, c.memberCount]}
                rows={rows ?? null}
                minWidth={520}
                filtered={Boolean(occurrenceStatus || occurrenceSearch)}
                empty={c.empty}
                error={error}
                loading={loading}
                meta={meta}
                onPage={(next) => window.history.pushState(null, "", occurrenceHref(next))}
                onRetry={reload}
              />
            </>
          )}
        </>
      ) : !configurationError ? (
        <DataState kind="loading" title={c.loading} />
      ) : null}
      {confirmation && (
        <ConfirmationDialog
          title={confirmation.label}
          cancelLabel={c.cancel}
          confirmLabel={confirmation.label}
          busyLabel={c.busy}
          busy={mutating}
          danger={action !== "publish"}
          fallbackFocusRef={summary}
          error={
            actionError
              ? csaRoundError(actionError, locale, requestErrorMessage(actionError, t))
              : undefined
          }
          onCancel={() => setAction(null)}
          onConfirm={() => void submitAction()}
        >
          <Text>{confirmation.body}</Text>
        </ConfirmationDialog>
      )}
    </Stack>
  );
}
