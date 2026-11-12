"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ActionLink, DataState, Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import type { PaginationMeta } from "@/lib/types";
import { PageHeading } from "@/components/page-heading";
import { formatAdminDateTime } from "@/lib/admin-date";
import { requestErrorMessage } from "@/lib/client-error";
import { getRounds, type CSARound } from "@/lib/csa-rounds";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";

export function CSARoundList() {
  const { locale, t } = useAdminI18n();
  const c = csaRoundsCopy(locale);
  const [items, setItems] = useState<CSARound[] | null>(null);
  const requests = useRef(0);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => {
    const request = ++requests.current;
    setError(null);
    setItems(null);
    try {
      const result = await getRounds(page);
      if (request !== requests.current) return;
      setItems(result.data);
      setMeta(result.meta);
    } catch (e) {
      if (request === requests.current) setError(e);
    }
  }, [page]);
  useEffect(() => {
    const counter = requests;
    void load();
    return () => {
      counter.current++;
    };
  }, [load]);
  return (
    <section className="admin-list-section" aria-busy={items === null && !error}>
      <PageHeading
        title={c.title}
        action={<ActionLink href="/csa-rounds/new">{c.create}</ActionLink>}
      />
      {error ? (
        <DataState
          kind="error"
          title={requestErrorMessage(error, t)}
          action={{ label: t.common.retry, onClick: () => void load() }}
        />
      ) : items === null ? (
        <DataState kind="loading" title={c.loading} />
      ) : !items.length ? (
        <DataState kind="empty" title={c.empty} />
      ) : (
        <div className="table-wrap admin-list-wrap">
          <table className="table admin-list-table" aria-label={c.title}>
            <thead>
              <tr>
                {[c.name, c.state, c.selectionWindow, c.delivery, c.action].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label={c.name}>
                    <strong>{item.name}</strong>
                  </td>
                  <td data-label={c.state}>
                    <Status status={item.status} label={c.statuses[item.status]} />
                  </td>
                  <td data-label={c.selectionWindow}>
                    <time dateTime={item.opens_at}>{formatAdminDateTime(item.opens_at)}</time>
                    <small className="table-secondary">
                      → <time dateTime={item.closes_at}>{formatAdminDateTime(item.closes_at)}</time>
                    </small>
                  </td>
                  <td data-label={c.delivery}>
                    <time dateTime={item.delivery_at}>{formatAdminDateTime(item.delivery_at)}</time>
                  </td>
                  <td data-label={c.action}>
                    <ActionLink href={`/csa-rounds/${item.id}`} small variant="outline">
                      {c.view}
                    </ActionLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && (
        <Pagination
          controls="nfv"
          page={meta.page}
          pageSize={meta.page_size}
          total={meta.total}
          onPage={setPage}
          disabled={items === null}
          previousLabel={t.common.previous}
          nextLabel={t.common.next}
          summary={t.common.pagination}
        />
      )}
    </section>
  );
}
