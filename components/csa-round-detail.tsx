"use client";
import { Table } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { CSACompanionDelivery } from "@/components/csa-companion-delivery";
import { CSAReopenDialog } from "@/components/csa-reopen-dialog";
import { CSASelectionHistory } from "@/components/csa-selection-history";
import { Pagination } from "@/components/pagination";
import { DetailPageHeading } from "@/components/detail-page-heading";
import {
  ActionLink,
  Button,
  DataState,
  FormField,
  FormTextarea,
  Section,
  Status,
} from "@/components/nfv-controls";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import {
  formatCsaQuantity,
  getRound,
  getRoundParticipants,
  type CSARound,
  type CSASelection,
  type RoundParticipants,
} from "@/lib/csa-rounds";
import { csaRoundError, csaRoundsCopy } from "@/lib/csa-rounds-copy";
import styles from "./csa-rounds.module.css";

export function CSARoundDetail({ roundId }: { roundId: string }) {
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
  if (!round || round.id !== roundId)
    return (
      <div className={styles.screen}>
        <DetailPageHeading
          bottomSpacing={0}
          backHref="/csa-rounds"
          backLabel={c.back}
          title={c.title}
        />
        {error ? (
          <DataState
            kind="error"
            title={requestErrorMessage(error, t)}
            action={{ label: t.common.retry, onClick: () => void load() }}
          />
        ) : (
          <DataState kind="loading" title={c.loading} />
        )}
      </div>
    );
  const disabled = loading || Boolean(error) || busy || companionBusy;
  return (
    <div className={styles.screen}>
      <DetailPageHeading
        bottomSpacing={0}
        backHref="/csa-rounds"
        backLabel={c.back}
        title={round.name}
      />
      {Boolean(error) && (
        <DataState
          kind="error"
          title={requestErrorMessage(error, t)}
          action={{ label: t.common.retry, onClick: () => void load() }}
        />
      )}
      <section className={styles.overview} aria-label={c.scheduleTitle}>
        <div className={styles.overviewHeader}>
          <Status domain="csa-round" status={round.status} label={c.statuses[round.status]} />
          <div className={styles.actions}>
            <Button
              variant="outline"
              disabled={loading || busy || companionBusy}
              onClick={() => void load()}
            >
              {c.refresh}
            </Button>
            {!disabled && round.status !== "cancelled" && participants.meta.total === 0 && (
              <ActionLink variant="outline" href={`/csa-rounds/${round.id}/edit`}>
                {c.edit}
              </ActionLink>
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
          </div>
        </div>
        <dl className={styles.dates}>
          {[
            [c.opens, round.opens_at],
            [c.closes, round.closes_at],
            [c.delivery, round.delivery_date],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{label === c.delivery ? formatAdminDate(value) : formatAdminDateTime(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
      {round.status === "cancelled" && round.cancellation_reason && (
        <Section title={c.reason}>
          <p>{round.cancellation_reason}</p>
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
          <Table role="table" className={styles.table}>
            <Table.Thead role="rowgroup">
              <Table.Tr role="row">
                <Table.Th role="columnheader">{c.product}</Table.Th>
                <Table.Th role="columnheader">{c.quantity}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody role="rowgroup">
              {participants.demand.map((row) => (
                <Table.Tr role="row" key={row.product_id}>
                  <Table.Td role="cell" data-label={c.product}>
                    {row.name}
                  </Table.Td>
                  <Table.Td role="cell" data-label={c.quantity}>
                    {formatCsaQuantity(row, locale)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <DataState kind="empty" title={c.emptyDemand} />
        )}
      </Section>
      <Section title={c.participants}>
        {participants.data.length ? (
          <div className={styles.people}>
            {participants.data.map((person) => (
              <article className={styles.person} key={person.id}>
                <div className={styles.personHeader}>
                  <h3>{person.customer_name || c.customer}</h3>
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
                    {person.order_id && (
                      <ActionLink small variant="plain" href={`/store-orders/${person.order_id}`}>
                        {c.order}
                      </ActionLink>
                    )}
                    {person.order_id &&
                      ["locked", "confirmed", "reselecting"].includes(person.state) &&
                      round.status !== "cancelled" && (
                        <Button
                          small
                          disabled={disabled}
                          variant="outline"
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
              </article>
            ))}
          </div>
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
        <div className={styles.cancelAction}>
          <Button
            variant="plain"
            disabled={disabled}
            onClick={() => {
              setActionError(null);
              setReason("");
              setAction("cancel");
            }}
          >
            {c.cancelRound}
          </Button>
        </div>
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
          <p>{action === "publish" ? c.publishBody : c.cancelBody}</p>
          {action === "cancel" && (
            <FormField label={c.reason}>
              <FormTextarea
                required
                maxLength={1000}
                disabled={busy}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </FormField>
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
    </div>
  );
}
