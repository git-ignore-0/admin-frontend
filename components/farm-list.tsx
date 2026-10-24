"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { PageHeading } from "@/components/page-heading";
import { Pagination } from "@/components/pagination";
import { formatAdminDate } from "@/lib/admin-date";
import { requestErrorMessage } from "@/lib/client-error";
import { listFarms } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { mediaUrlForWidth } from "@/lib/media";
import type { Farm, PaginationMeta } from "@/lib/types";

export function FarmList() {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Farm[] | null>(null);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, page_size: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    listFarms({ search, is_active: status ? status === "true" : undefined, page })
      .then((result) => {
        if (!live) return;
        setRows(result.data);
        setMeta(result.meta ?? { page, page_size: 20, total: result.data.length });
      })
      .catch((caught) => live && setError(requestErrorMessage(caught, t)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [search, status, page, retry, t]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
    if (search === query.trim() && page === 1) setRetry((value) => value + 1);
  }

  return (
    <section>
      <PageHeading
        title={c.list}
        description={c.description}
        action={
          <Link className="button" href="/farms/new">
            {c.new}
          </Link>
        }
      />
      <ListToolbar
        busy={loading}
        clearLabel={t.common.clearFilters}
        hasFilters={Boolean(search || status)}
        onClear={() => {
          setQuery("");
          setSearch("");
          setStatus("");
          setPage(1);
        }}
        onQueryChange={setQuery}
        onSubmit={submit}
        placeholder={c.searchPlaceholder}
        query={query}
        resultCount={meta.total}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={c.search}
        searchSubmitLabel={c.searchButton}
        filter={
          <label className="field">
            <span>{c.status}</span>
            <select
              className="input"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{c.all}</option>
              <option value="true">{c.active}</option>
              <option value="false">{c.inactive}</option>
            </select>
          </label>
        }
      />
      <ListState
        empty={c.empty}
        error={error}
        hasData={Boolean(rows)}
        isEmpty={rows?.length === 0}
        loading={loading}
        loadingLabel={c.loading}
        onRetry={() => setRetry((value) => value + 1)}
        retryLabel={t.common.retry}
      />
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table className="table farm-table">
            <thead>
              <tr>
                <th>{c.image}</th>
                <th>{c.name}</th>
                <th>{c.location}</th>
                <th>{c.status}</th>
                <th>{c.updated}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((farm) => {
                const name = locale === "vi" ? farm.name_vi : farm.name_en;
                return (
                  <tr key={farm.id}>
                    <td data-label={c.image}>
                      {farm.image ? (
                        <Image
                          className="reward-thumbnail"
                          alt=""
                          width={72}
                          height={56}
                          unoptimized
                          src={mediaUrlForWidth(farm.image, 144)}
                        />
                      ) : (
                        <span aria-hidden="true">—</span>
                      )}
                    </td>
                    <td data-label={c.name}>
                      <Link href={`/farms/${farm.id}`}>{name}</Link>
                    </td>
                    <td data-label={c.location}>
                      {locale === "vi" ? farm.location_vi : farm.location_en}
                    </td>
                    <td data-label={c.status}>{farm.is_active ? c.active : c.inactive}</td>
                    <td data-label={c.updated}>{formatAdminDate(farm.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        total={meta.total}
        pageSize={meta.page_size}
        onPage={setPage}
        disabled={loading}
        previousLabel={t.common.previous}
        nextLabel={t.common.next}
        summary={t.common.pagination}
      />
    </section>
  );
}
