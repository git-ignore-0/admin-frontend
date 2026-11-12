"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
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
import { formatAdminDateTime } from "@/lib/admin-date";
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
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [reopen, setReopen] = useState<CSASelection | null>(null);
  const requests = useRef(0);
  const roundSnapshot = useRef<{ round: CSARound; page: number } | null>(null);
  const load = useCallback(
    async (refreshRound = true) => {
      if (refreshRound) roundSnapshot.current = null;
      const current = ++requests.current;
      setLoading(true);
      setError(null);
      try {
        const cached = roundSnapshot.current;
        const reuseRound = !refreshRound && cached?.round.id === roundId && cached.page === page;
        const [item, people] = await Promise.all([
          reuseRound && cached ? cached.round : getRound(roundId),
          getRoundParticipants(roundId, page, 20, locale),
        ]);
        if (current === requests.current) {
          roundSnapshot.current = { round: item, page };
          setRound(item);
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
  async function mutate() {
    if (lock.current || !round || !action) return;
    if (action === "cancel" && !reason.trim()) {
      setActionError(c.reasonRequired);
      return;
    }
    lock.current = true;
    setBusy(true);
    setActionError("");
    try {
      await api(`admin/csa-rounds/${round.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "cancel" ? { reason: reason.trim() } : {}),
      });
      setAction(null);
      await loadRef.current();
    } catch (e) {
      setActionError(csaRoundError(e, locale, requestErrorMessage(e, t)));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!round)
    return (
      <div className={styles.screen}>
        <DetailPageHeading backHref="/csa-rounds" backLabel={c.back} title={c.title} />
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
  const disabled = loading || Boolean(error) || busy;
  return (
    <div className={styles.screen}>
      <DetailPageHeading backHref="/csa-rounds" backLabel={c.back} title={round.name} />
      {Boolean(error) && (
        <DataState
          kind="error"
          title={requestErrorMessage(error, t)}
          action={{ label: t.common.retry, onClick: () => void load() }}
        />
      )}
      <section className={styles.overview} aria-label={c.scheduleTitle}>
        <div className={styles.overviewHeader}>
          <Status status={round.status} label={c.statuses[round.status]} />
          <div className={styles.actions}>
            <Button variant="outline" disabled={loading || busy} onClick={() => void load()}>
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
                  setActionError("");
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
            [c.delivery, round.delivery_at],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{formatAdminDateTime(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
      {round.status === "cancelled" && round.cancellation_reason && (
        <Section title={c.reason}>
          <p>{round.cancellation_reason}</p>
        </Section>
      )}
      <Section title={c.demand}>
        {participants.demand.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{c.product}</th>
                  <th>{c.quantity}</th>
                </tr>
              </thead>
              <tbody>
                {participants.demand.map((row) => (
                  <tr key={row.product_id}>
                    <td data-label={c.product}>{row.name}</td>
                    <td data-label={c.quantity}>{formatCsaQuantity(row, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  <Status status={person.state} label={c.states[person.state]} />
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
              setActionError("");
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
          error={actionError}
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
          deliveryAt={round.delivery_at}
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
