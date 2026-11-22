"use client";
import { Button, Divider, Group, Paper, Stack, Table, Text, Textarea, Title } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { roundPageHref } from "@/app/(admin)/csa-rounds/round-navigation";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminNavigationLink } from "@/components/admin-navigation-link";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { CSACompanionDelivery } from "@/components/csa-companion-delivery";
import { CSAReopenDialog } from "@/components/csa-reopen-dialog";
import { CSARoundBreadcrumbs } from "@/components/csa-round-breadcrumbs";
import { CSASelectionHistory } from "@/components/csa-selection-history";
import { Pagination } from "@/components/pagination";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { DataState, Section, Status } from "@/components/nfv-controls";
import { RecordDetailField, RecordDetailFields } from "@/components/record-detail-fields";
import { RecoveryAlert } from "@/components/recovery-alert";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import {
  formatCsaQuantity,
  getRound,
  getRoundParticipants,
  type CSARound,
  type CSARoundStatus,
  type CSASelection,
  type RoundParticipants,
} from "@/lib/csa-rounds";
import { csaRoundError, csaRoundsCopy } from "@/lib/csa-rounds-copy";
import styles from "./csa-rounds.module.css";

export function CSARoundDetail({
  roundId,
  listPage = 1,
  listStatus,
}: {
  roundId: string;
  listPage?: number;
  listStatus?: CSARoundStatus | "";
}) {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const [round, setRound] = useState<CSARound | null>(null);
  const [participants, setParticipants] = useState<RoundParticipants>({
    data: [],
    demand: [],
    meta: { page: 1, page_size: 20, total: 0 },
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
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
  const roundSnapshot = useRef<{ round: CSARound; page: number; receivedAt: number } | null>(null);
  const load = useCallback(
    async (refreshRound = true) => {
      if (refreshRound) {
        roundSnapshot.current = null;
        setCompanionRefresh((value) => value + 1);
      }
      const current = ++requests.current;
      setLoading(true);
      setError(null);
      try {
        const cached = roundSnapshot.current;
        const reuseRound = !refreshRound && cached?.round.id === roundId && cached.page === page;
        const [result, people] = await Promise.all([
          reuseRound && cached
            ? { item: cached.round, receivedAt: cached.receivedAt }
            : getRound(roundId).then((item) => ({ item, receivedAt: performance.now() })),
          getRoundParticipants(roundId, page, 20, locale),
        ]);
        if (current === requests.current) {
          roundSnapshot.current = { round: result.item, page, receivedAt: result.receivedAt };
          roundReceivedAt.current = result.receivedAt;
          setRound(result.item);
          setParticipants(people);
        }
      } catch (e) {
        if (current === requests.current) setError(e);
      } finally {
        if (current === requests.current) setLoading(false);
      }
    },
    [roundId, page, locale],
  );
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    const counter = requests;
    void load(false);
    return () => {
      counter.current++;
    };
  }, [load]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setAction(null);
    setActionError(null);
    setReason("");
    setReopen(null);
  }, [roundId]);
  async function mutate() {
    if (lock.current || !round || !action || loading) return;
    if (action === "cancel" && !reason.trim()) {
      setActionError("reasonRequired");
      return;
    }
    const identity = round.id;
    lock.current = true;
    requests.current += 1;
    setBusy(true);
    setActionError(null);
    try {
      await api(`admin/csa-rounds/${round.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "cancel" ? { reason: reason.trim() } : {}),
      });
      if (!mounted.current || identity !== currentRoundId.current) return;
      setAction(null);
      await loadRef.current();
    } catch (e) {
      if (mounted.current && identity === currentRoundId.current) setActionError(e);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const breadcrumbs = (
    <CSARoundBreadcrumbs roundId={roundId} listPage={listPage} listStatus={listStatus} />
  );
  if (!round || round.id !== roundId)
    return (
      <Stack gap="md" miw={0}>
        {breadcrumbs}
        <DetailPageHeading
          bottomSpacing={0}
          backHref={roundPageHref("/csa-rounds", listPage, listStatus)}
          backLabel={c.back}
          title={c.title}
        />
        {error ? (
          <RecoveryAlert
            message={requestErrorMessage(error, t)}
            retryLabel={t.common.retry}
            onRetry={() => void load()}
          />
        ) : (
          <DataState kind="loading" title={c.loading} />
        )}
      </Stack>
    );
  const disabled = loading || Boolean(error) || busy || companionBusy;
  return (
    <Stack gap="md" miw={0}>
      {breadcrumbs}
      <DetailPageHeading
        bottomSpacing={0}
        backHref={roundPageHref("/csa-rounds", listPage, listStatus)}
        backLabel={c.back}
        title={round.name}
      />
      {Boolean(error) && (
        <RecoveryAlert
          message={requestErrorMessage(error, t)}
          retryLabel={t.common.retry}
          onRetry={() => void load()}
        />
      )}
      <Paper component="section" withBorder p="md" aria-label={c.scheduleTitle}>
        <Stack gap="md">
          <Group justify="space-between" gap="sm">
            <Status domain="csa-round" status={round.status} label={c.statuses[round.status]} />
            <Group gap="xs">
              <Button
                variant="default"
                disabled={loading || busy || companionBusy}
                onClick={() => void load()}
              >
                {c.refresh}
              </Button>
              {!disabled && round.status !== "cancelled" && participants.meta.total === 0 && (
                <Button
                  component={AdminNavigationLink}
                  variant="default"
                  href={roundPageHref(
                    `/csa-rounds/${encodeURIComponent(round.id)}/edit`,
                    listPage,
                    listStatus,
                  )}
                >
                  {c.edit}
                </Button>
              )}
              {round.status === "draft" && (
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
          </Group>
          <Divider />
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
          </RecordDetailFields>
        </Stack>
      </Paper>
      {round.status === "cancelled" && round.cancellation_reason && (
        <Section title={c.reason}>
          <Text size="sm" style={{ overflowWrap: "anywhere" }}>
            {round.cancellation_reason}
          </Text>
        </Section>
      )}
      <CSACompanionDelivery
        round={round}
        receivedAt={roundReceivedAt.current}
        refreshKey={companionRefresh}
        disabled={loading || Boolean(error) || busy}
        onBusyChange={setCompanionBusy}
      />
      <Section title={c.demand}>
        {participants.demand.length ? (
          <Table.ScrollContainer
            minWidth={360}
            type="native"
            role="region"
            aria-label={c.demand}
            tabIndex={0}
          >
            <Table withRowBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th scope="col">{c.product}</Table.Th>
                  <Table.Th scope="col" ta="right">
                    {c.quantity}
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {participants.demand.map((row) => (
                  <Table.Tr key={row.product_id}>
                    <Table.Td>{row.name}</Table.Td>
                    <Table.Td ta="right">{formatCsaQuantity(row, locale)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <DataState kind="empty" title={c.emptyDemand} />
        )}
      </Section>
      <Section title={c.participants}>
        {participants.data.length ? (
          <Stack gap="sm">
            {participants.data.map((person) => (
              <Paper
                component="article"
                withBorder
                p="md"
                className={styles.person}
                key={person.id}
              >
                <div className={styles.personHeader}>
                  <Title order={3} size="sm">
                    {person.customer_name || c.customer}
                  </Title>
                  <Status
                    domain="csa-selection"
                    status={person.state}
                    label={c.states[person.state]}
                  />
                </div>
                {person.lines.length ? (
                  <ul className={styles.personProducts}>
                    {person.lines.map((line) => (
                      <li key={line.product_id}>
                        <span>{line.name}</span> <span>{formatCsaQuantity(line, locale)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.personEmpty}>{c.emptyLines}</p>
                )}
                {person.reopen_until && (
                  <p className={styles.personDeadline}>
                    <span>{c.deadline}</span>
                    <time dateTime={person.reopen_until}>
                      {formatAdminDateTime(person.reopen_until)}
                    </time>
                  </p>
                )}
                {person.order_id && (
                  <div className={styles.personActions}>
                    <Button
                      component={AdminNavigationLink}
                      size="xs"
                      variant="subtle"
                      href={`/store-orders/${encodeURIComponent(person.order_id)}`}
                    >
                      {c.order}
                    </Button>
                    {["locked", "confirmed", "reselecting"].includes(person.state) &&
                      round.status !== "cancelled" && (
                        <Button
                          size="xs"
                          disabled={disabled}
                          variant="default"
                          onClick={() => setReopen(person)}
                        >
                          {c.reopen}
                        </Button>
                      )}
                  </div>
                )}
                <CSASelectionHistory
                  key={person.id}
                  selectionId={person.id}
                  refreshToken={`${person.revision}:${person.state}`}
                />
              </Paper>
            ))}
          </Stack>
        ) : (
          <DataState kind="empty" title={c.emptyParticipants} />
        )}
      </Section>
      <Pagination
        controls="nfv"
        page={participants.meta.page}
        pageSize={participants.meta.page_size}
        total={participants.meta.total}
        onPage={setPage}
        disabled={disabled}
        previousLabel={t.common.previous}
        nextLabel={t.common.next}
        summary={t.common.pagination}
      />
      {round.status !== "cancelled" && (
        <Group className={styles.cancelAction} justify="flex-end">
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
      )}
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
          onSaved={() => {
            setReopen(null);
            void loadRef.current();
          }}
        />
      )}
    </Stack>
  );
}
