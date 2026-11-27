"use client";
import { Anchor, Button, Group, Stack, Text, Textarea } from "@mantine/core";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  roundRecordHref,
  type RoundNavigationContext,
} from "@/app/(admin)/csa-rounds/round-navigation";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { CSACompanionDelivery } from "@/components/csa-companion-delivery";
import { CSAReopenDialog } from "@/components/csa-reopen-dialog";
import { CSARoundBreadcrumbs } from "@/components/csa-round-breadcrumbs";
import { CSARoundDemand } from "@/components/csa-round-demand";
import { CSARoundDetailTabs } from "@/components/csa-round-detail-tabs";
import { CSARoundParticipants } from "@/components/csa-round-participants";
import { ListToolbar } from "@/components/list-toolbar";
import { PageHeading } from "@/components/page-heading";
import { DataState, Section, Status } from "@/components/nfv-controls";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { RecoveryAlert } from "@/components/recovery-alert";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
import { requireResponseEntity } from "@/lib/api-response";
import { api } from "@/lib/client-api";
import { isProtectedDataError, requestErrorMessage, type ClientApiError } from "@/lib/client-error";
import {
  cancelRound,
  getRound,
  getRoundParticipants,
  type AdminCSARound,
  type CSAConfigurationStatus,
  type CSASelection,
  type RoundParticipants,
} from "@/lib/csa-rounds";
import { csaRoundError, csaRoundsCopy } from "@/lib/csa-rounds-copy";

export function CSARoundDetail({
  roundId: requestedRoundId,
  listPage = 1,
  listStatus,
  listContext,
}: {
  roundId: string;
  listPage?: number;
  listStatus?: CSAConfigurationStatus | "";
  listContext?: RoundNavigationContext;
}) {
  const roundId = requestedRoundId.toLowerCase();
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const [round, setRound] = useState<AdminCSARound | null>(null);
  const [participants, setParticipants] = useState<{
    roundId: string;
    data: RoundParticipants;
  } | null>(null);
  const [page, setPage] = useState(1);
  const membersResults = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [participantError, setParticipantError] = useState<unknown>(null);
  const [action, setAction] = useState<"publish" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [companionBusy, setCompanionBusy] = useState(false);
  const [companionRefresh, setCompanionRefresh] = useState(0);
  const roundReceivedAt = useRef(0);
  const lock = useRef(false);
  const mounted = useRef(true);
  const currentRoundId = useRef(roundId);
  currentRoundId.current = roundId;
  const [reopen, setReopen] = useState<CSASelection | null>(null);
  const requests = useRef(0);
  const roundSnapshot = useRef<{ round: AdminCSARound; page: number; receivedAt: number } | null>(
    null,
  );
  const activeRead = useRef<AbortController | null>(null);
  const accessRevision = useRef(0);
  const retire = useCallback((caught: unknown) => {
    if (!isProtectedDataError(caught) && (caught as ClientApiError | null)?.status !== 404)
      return false;
    accessRevision.current += 1;
    activeRead.current?.abort();
    roundSnapshot.current = null;
    setRound(null);
    setParticipants(null);
    setAction(null);
    setReopen(null);
    setReason("");
    setLoading(false);
    setBusy(false);
    setError(caught);
    return true;
  }, []);
  const load = useCallback(
    async (refreshRound = true) => {
      if (refreshRound) {
        roundSnapshot.current = null;
        setCompanionRefresh((value) => value + 1);
      }
      activeRead.current?.abort();
      const controller = new AbortController();
      activeRead.current = controller;
      const { signal } = controller;
      const current = ++requests.current;
      const isCurrent = () => !signal.aborted && current === requests.current;
      setLoading(true);
      setError(null);
      setParticipantError(null);

      const cached = roundSnapshot.current;
      const reuseRound = !refreshRound && cached?.round.id === roundId && cached.page === page;
      const roundRead = reuseRound
        ? Promise.resolve()
        : getRound(roundId, signal)
            .then((item) => {
              if (!isCurrent()) return;
              requireResponseEntity(item, roundId);
              const receivedAt = performance.now();
              roundSnapshot.current = { round: item, page, receivedAt };
              roundReceivedAt.current = receivedAt;
              setRound(item);
            })
            .catch((caught: unknown) => {
              if (isCurrent() && !retire(caught)) setError(caught);
            });
      const participantsRead = getRoundParticipants(roundId, page, 20, locale, signal)
        .then((data) => {
          if (!isCurrent()) return;
          const lastPage = Math.max(1, Math.ceil(data.meta.total / data.meta.page_size));
          if (page > lastPage) {
            setParticipants(null);
            setPage(lastPage);
          } else setParticipants({ roundId, data });
        })
        .catch((caught: unknown) => {
          if (isCurrent() && !retire(caught)) setParticipantError(caught);
        });

      await Promise.all([roundRead, participantsRead]);
      if (isCurrent()) {
        activeRead.current = null;
        setLoading(false);
      }
    },
    [roundId, page, locale, retire],
  );
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    const currentRead = activeRead;
    void load(false);
    return () => currentRead.current?.abort();
  }, [load]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeRead.current?.abort();
    };
  }, []);
  useEffect(() => {
    setAction(null);
    setActionError(null);
    setReason("");
    setReopen(null);
  }, [roundId]);
  async function mutate() {
    if (lock.current || !round || round.id !== roundId || !action || loading || error) return;
    if (action === "cancel" && !reason.trim()) {
      setActionError("reasonRequired");
      return;
    }
    const identity = round.id;
    const revision = accessRevision.current;
    const current = () =>
      mounted.current && identity === currentRoundId.current && accessRevision.current === revision;
    lock.current = true;
    requests.current += 1;
    setBusy(true);
    setActionError(null);
    try {
      const updated =
        action === "cancel"
          ? await cancelRound(round.id, reason, round.version)
          : await api<AdminCSARound>(`admin/csa-rounds/${round.id}/publish`, {
              method: "POST",
              body: JSON.stringify({ version: round.version }),
            });
      if (!current()) return;
      requireResponseEntity(updated, identity);
      setAction(null);
      await loadRef.current();
    } catch (e) {
      if (current() && !retire(e)) {
        setActionError(e);
        if (e instanceof Error && e.message === "version_conflict") {
          setAction(null);
          await loadRef.current();
          if (current()) setError(e);
        }
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const recurrence = round?.id === roundId ? round.recurrence : null;
  const breadcrumbs = (
    <CSARoundBreadcrumbs
      roundId={requestedRoundId}
      round={round?.id === roundId ? round : undefined}
      listPage={listPage}
      listStatus={listStatus}
      listContext={listContext}
    />
  );
  if (!round || round.id !== roundId)
    return (
      <Stack gap="md" miw={0}>
        {breadcrumbs}
        <PageHeading title={t.breadcrumb.roundDetails} visuallyHiddenTitle />
        {error ? (
          <RecoveryAlert
            message={csaRoundError(error, locale, requestErrorMessage(error, t))}
            retryLabel={t.common.retry}
            onRetry={() => void load()}
          />
        ) : (
          <DataState kind="loading" title={c.loading} />
        )}
      </Stack>
    );

  const originalRound = recurrence?.root_round_id === round.id;
  const linkToRound = (id: string, action?: "edit") =>
    roundRecordHref(
      id,
      listContext ?? { page: listPage, status: listStatus },
      round.configuration_id,
      action,
    );
  const disabled = loading || Boolean(error) || busy || companionBusy;
  const canEdit = !disabled && round.can_edit;
  const draft = round.status === "draft";
  function refreshRound() {
    // The current request owns loading even if a locale change replaces an in-flight refresh.
    void load();
  }
  const refreshToolbar = (
    <ListToolbar
      busy={loading || busy || companionBusy}
      refresh={{ label: c.refresh, onRefresh: refreshRound, loading }}
    />
  );
  const matchingResult = participants?.roundId === roundId ? participants.data : null;
  const currentPage = matchingResult?.meta.page === page ? matchingResult : null;
  const participantRecovery = Boolean(participantError) && (
    <RecoveryAlert
      message={requestErrorMessage(participantError, t)}
      retryLabel={t.common.retry}
      onRetry={() => void load(false)}
    />
  );
  return (
    <Stack gap="md" miw={0} style={{ overflowWrap: "anywhere" }}>
      {breadcrumbs}
      <PageHeading title={t.breadcrumb.roundDetails} visuallyHiddenTitle />
      {Boolean(error) && (
        <RecoveryAlert
          message={csaRoundError(error, locale, requestErrorMessage(error, t))}
          retryLabel={t.common.retry}
          onRetry={() => void load()}
        />
      )}
      <Group justify="space-between" gap="md">
        <Group gap="md">
          <Text size="sm" fw={600}>
            {round.name}
          </Text>
          <Status domain="csa-round" status={round.status} label={c.statuses[round.status]} />
          <Text size="sm">
            {c.deliveryDate}{" "}
            <Text component="time" dateTime={round.delivery_date} fw={600}>
              {formatAdminDate(round.delivery_date)}
            </Text>
          </Text>
          <Text size="sm">
            {c.closes}{" "}
            <Text component="time" dateTime={round.closes_at} fw={600}>
              {formatAdminDateTime(round.closes_at)}
            </Text>
          </Text>
        </Group>
        {(canEdit || draft) && (
          <Group gap="sm" ms="auto">
            {canEdit && (
              <Button
                component={AdminNavigationLink}
                variant="default"
                href={linkToRound(round.id, "edit")}
              >
                {c.edit}
              </Button>
            )}
            {draft && (
              <Button
                disabled={disabled}
                onClick={() => {
                  setActionError(null);
                  setAction("publish");
                }}
              >
                {c.publish}
              </Button>
            )}
          </Group>
        )}
      </Group>
      {round.status === "cancelled" && round.cancellation_reason && (
        <Section title={c.reason}>
          <Text size="sm">{round.cancellation_reason}</Text>
        </Section>
      )}
      <CSARoundDetailTabs
        key={round.id}
        status={round.status}
        participants={
          <Stack gap="sm" ref={membersResults} role="group" aria-label={c.membersTab} tabIndex={-1}>
            {participantRecovery}
            {currentPage ? (
              <CSARoundParticipants
                key={`${round.id}:${page}`}
                round={round}
                result={currentPage}
                disabled={disabled || Boolean(participantError)}
                refreshKey={companionRefresh}
                onPage={(next) => {
                  membersResults.current?.focus({ preventScroll: true });
                  setPage(next);
                }}
                onRefresh={refreshRound}
                onReopen={setReopen}
                reopenOpen={Boolean(reopen)}
              />
            ) : loading ? (
              <DataState kind="loading" title={c.loading} />
            ) : null}
          </Stack>
        }
        demand={
          <Stack gap="sm">
            {refreshToolbar}
            {participantRecovery}
            {matchingResult ? (
              <CSARoundDemand demand={matchingResult.demand} />
            ) : loading ? (
              <DataState kind="loading" title={c.loading} />
            ) : null}
          </Stack>
        }
        settings={
          <Stack gap="md">
            {refreshToolbar}
            <Section title={c.scheduleTitle}>
              <RecordDetailFields>
                <RecordDetailField label={c.opens}>
                  <time dateTime={round.opens_at}>{formatAdminDateTime(round.opens_at)}</time>
                </RecordDetailField>
                <RecordDetailField label={c.closes}>
                  <time dateTime={round.closes_at}>{formatAdminDateTime(round.closes_at)}</time>
                </RecordDetailField>
                <RecordDetailField label={c.delivery}>
                  <time dateTime={round.delivery_date}>{formatAdminDate(round.delivery_date)}</time>
                </RecordDetailField>
                <RecordDetailField label={c.configurationTypeTitle}>
                  {recurrence ? c.recurrence.weekly : c.standalone}
                </RecordDetailField>
              </RecordDetailFields>
            </Section>
            <CSACompanionDelivery
              round={round}
              receivedAt={roundReceivedAt.current}
              refreshKey={companionRefresh}
              disabled={Boolean(error) || busy}
              onBusyChange={setCompanionBusy}
            />
            {recurrence && (
              <Section title={c.recurrence.title}>
                <RecordDetailFields>
                  <RecordDetailField label={c.recurrence.source}>
                    <Stack gap="xs">
                      <Text size="sm">
                        {originalRound
                          ? c.recurrence.initialOccurrence
                          : c.recurrence.generatedOccurrence}
                      </Text>
                      {!originalRound && (
                        <Anchor
                          component={AdminNavigationLink}
                          href={linkToRound(recurrence.root_round_id)}
                          size="sm"
                        >
                          {c.recurrence.viewRoot}
                        </Anchor>
                      )}
                    </Stack>
                  </RecordDetailField>
                </RecordDetailFields>
              </Section>
            )}
            {round.status !== "cancelled" && (
              <Section title={c.cancelRound}>
                <Group>
                  <Button
                    color="red"
                    variant="subtle"
                    disabled={disabled}
                    onClick={() => {
                      setActionError(null);
                      setReason("");
                      setAction("cancel");
                    }}
                  >
                    {c.cancelRound}
                  </Button>
                </Group>
              </Section>
            )}
          </Stack>
        }
      />
      {action && (
        <ConfirmationDialog
          title={action === "publish" ? c.publish : c.cancelRound}
          cancelLabel={c.cancel}
          confirmLabel={c.confirm}
          busyLabel={c.busy}
          busy={busy}
          danger={action === "cancel"}
          error={
            actionError === "reasonRequired"
              ? c.reasonRequired
              : actionError
                ? csaRoundError(actionError, locale, requestErrorMessage(actionError, t))
                : ""
          }
          onCancel={() => setAction(null)}
          onConfirm={() => void mutate()}
        >
          <Text size="sm" fw={600}>
            {round.name} · {formatAdminDate(round.delivery_date)}
          </Text>
          <Text size="sm">{action === "publish" ? c.publishBody : c.cancelBody}</Text>
          {action === "cancel" && (
            <Textarea
              label={c.reason}
              required
              maxLength={1000}
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
            />
          )}
        </ConfirmationDialog>
      )}
      {reopen?.order_id && (
        <CSAReopenDialog
          selectionId={reopen.id}
          orderId={reopen.order_id}
          deliveryDate={round.delivery_date}
          onClose={() => setReopen(null)}
          onAccessDenied={retire}
          onSaved={() => {
            setReopen(null);
            void loadRef.current();
          }}
        />
      )}
    </Stack>
  );
}
