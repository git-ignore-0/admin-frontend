"use client";
import { Table } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ActionLink, DataState, Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import type { PaginationMeta } from "@/lib/types";
import { PageHeading } from "@/components/page-heading";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
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
        bottomSpacing={0}
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
        <Table.ScrollContainer type="native" minWidth={0} className="table-wrap admin-list-wrap">
          <Table role="table" className="admin-list-table" aria-label={c.title}>
            <Table.Thead role="rowgroup">
              <Table.Tr role="row">
                {[c.name, c.state, c.selectionWindow, c.delivery, c.action].map((label) => (
                  <Table.Th role="columnheader" key={label} scope="col">
                    {label}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody role="rowgroup">
              {items.map((item) => (
                <Table.Tr role="row" key={item.id}>
                  <Table.Td role="cell" data-label={c.name}>
                    <strong>{item.name}</strong>
                  </Table.Td>
                  <Table.Td role="cell" data-label={c.state}>
                    <Status
                      domain="csa-round"
                      status={item.status}
                      label={c.statuses[item.status]}
                    />
                  </Table.Td>
                  <Table.Td role="cell" data-label={c.selectionWindow}>
                    <time dateTime={item.opens_at}>{formatAdminDateTime(item.opens_at)}</time>
                    <small className="table-secondary">
                      → <time dateTime={item.closes_at}>{formatAdminDateTime(item.closes_at)}</time>
                    </small>
                  </Table.Td>
                  <Table.Td role="cell" data-label={c.delivery}>
                    <time dateTime={item.delivery_date}>{formatAdminDate(item.delivery_date)}</time>
                  </Table.Td>
                  <Table.Td role="cell" data-label={c.action}>
                    <ActionLink href={`/csa-rounds/${item.id}`} small variant="outline">
                      {c.view}
                    </ActionLink>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
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
