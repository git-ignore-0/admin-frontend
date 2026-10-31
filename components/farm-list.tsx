"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { PageHeading } from "@/components/page-heading";
import { Pagination } from "@/components/pagination";
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
        <div className="farm-inventory-list">
          {rows.map((farm) => {
            const name = locale === "vi" ? farm.name_vi : farm.name_en;
            return (
              <article className="farm-inventory-row" key={farm.id}>
                <div className="farm-inventory-identity">
                  {farm.image ? (
                    <Image
                      alt=""
                      width={72}
                      height={56}
                      unoptimized
                      src={mediaUrlForWidth(farm.image, 144)}
                    />
                  ) : (
                    <span className="farm-inventory-placeholder" aria-hidden="true" />
                  )}
                  <div>
                    <strong>{name}</strong>
                    <span>{locale === "vi" ? farm.location_vi : farm.location_en}</span>
                  </div>
                </div>
                <span className={`farm-status ${farm.is_active ? "active" : "inactive"}`}>
                  {farm.is_active ? c.active : c.inactive}
                </span>
                <div className="farm-inventory-counts">
                  <span>
                    {c.inStockProducts.replace("{count}", String(farm.in_stock_product_count))}
                  </span>
                  <span>
                    {c.outOfStockProducts.replace(
                      "{count}",
                      String(farm.out_of_stock_product_count),
                    )}
                  </span>
                </div>
                <Link className="button secondary" href={`/farms/${farm.id}`}>
                  {c.manageStock}
                </Link>
              </article>
            );
          })}
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
