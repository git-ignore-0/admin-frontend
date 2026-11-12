"use client";
import { useEffect, useState } from "react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DataState } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { formatAdminDateTime } from "@/lib/admin-date";
import { requestErrorMessage } from "@/lib/client-error";
import {
  formatCsaQuantity,
  getSelectionEvents,
  type CSASelectionEvent,
  type RoundPage,
} from "@/lib/csa-rounds";
import { csaRoundsCopy, csaSelectionReason } from "@/lib/csa-rounds-copy";
import styles from "./csa-rounds.module.css";

export function CSASelectionHistory({
  selectionId,
  refreshToken,
}: {
  selectionId: string;
  refreshToken?: string;
}) {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const [opened, setOpened] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<RoundPage<CSASelectionEvent>>();
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!opened) return;
    let active = true;
    setResult(undefined);
    setError(null);
    getSelectionEvents(selectionId, page).then(
      (value) => {
        if (active) setResult(value);
      },
      (e) => {
        if (active) setError(e);
      },
    );
    return () => {
      active = false;
    };
  }, [opened, page, selectionId, retry, refreshToken]);
  return (
    <details className={styles.history} onToggle={(event) => setOpened(event.currentTarget.open)}>
      <summary>{c.history}</summary>
      {opened &&
        (error ? (
          <DataState
            kind="error"
            title={requestErrorMessage(error, t)}
            action={{ label: t.common.retry, onClick: () => setRetry(retry + 1) }}
          />
        ) : !result ? (
          <DataState kind="loading" title={c.loading} />
        ) : (
          <>
            {result.data.length ? (
              <ol className={styles.historyList}>
                {result.data.map((event, index) => (
                  <li key={event.id ?? `${event.created_at}-${index}`}>
                    <div className={styles.historyEventHeading}>
                      <strong>
                        {c.events[event.action as keyof typeof c.events] ?? event.action}
                      </strong>
                      <time dateTime={event.created_at}>
                        {formatAdminDateTime(event.created_at)}
                      </time>
                    </div>
                    {event.context.deadline && (
                      <p className={styles.historyNote}>
                        {c.deadline}: {formatAdminDateTime(event.context.deadline)}
                      </p>
                    )}
                    {event.context.reason && (
                      <p className={styles.historyNote}>
                        {csaSelectionReason(event.context.reason, event.actor_id, locale)}
                      </p>
                    )}
                    {!!event.context.lines?.length && (
                      <ul className={styles.historyProducts}>
                        {event.context.lines.map((line, i) => (
                          <li key={i}>
                            <span>{line.name}:</span> <span>{formatCsaQuantity(line, locale)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p>{c.noHistory}</p>
            )}
            <Pagination
              controls="nfv"
              page={result.meta.page}
              pageSize={result.meta.page_size}
              total={result.meta.total}
              onPage={setPage}
              previousLabel={t.common.previous}
              nextLabel={t.common.next}
              summary={t.common.pagination}
            />
          </>
        ))}
    </details>
  );
}
