"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { listStoreCategories, listStoreProducts } from "@/lib/commerce-api";
import { requestErrorMessage } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import { categoryPath } from "@/lib/store-categories";
import type { StoreCategory, StoreProduct } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

function booleanFilter(value: string) {
  return value === "true" ? true : value === "false" ? false : undefined;
}

export function StoreProductList() {
  const { locale, t } = useAdminI18n();
  const copy = t.storeCatalog;
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const categoryId = searchParams.get("category_id") ?? "";
  const active = searchParams.get("is_active") ?? "";
  const published = searchParams.get("is_published") ?? "";
  const csa = searchParams.get("csa_eligible") ?? "";
  const [query, setQuery] = useState(search);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [categoryError, setCategoryError] = useState("");
  const [categoryRetry, setCategoryRetry] = useState(0);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  useEffect(() => setQuery(search), [search]);

  function navigate(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const next = params.toString();
    router.push(`/store-catalog/products${next ? `?${next}` : ""}`, { scroll: false });
  }

  useEffect(() => {
    let cancelled = false;
    listStoreCategories()
      .then((items) => {
        if (!cancelled) {
          setCategories(items);
          setCategoryError("");
        }
      })
      .catch((caught) => {
        if (!cancelled) setCategoryError(requestErrorMessage(caught, t));
      });
    return () => {
      cancelled = true;
    };
  }, [categoryRetry, t]);

  const fetchPage = useCallback(
    (page: number) =>
      listStoreProducts({
        page,
        search,
        category_id: categoryId || undefined,
        is_active: booleanFilter(active),
        is_published: booleanFilter(published),
        csa_eligible: booleanFilter(csa),
      }),
    [search, categoryId, active, published, csa],
  );
  const getErrorMessage = useCallback((caught: unknown) => requestErrorMessage(caught, t), [t]);
  const { items, meta, loading, error, reload, setPage } = usePaginatedList<StoreProduct>({
    fetchPage,
    getErrorMessage,
    controlledPage: page,
    onPage: (next) => navigate({ page: next > 1 ? String(next) : "" }),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim() === search && page === 1) reload();
    else navigate({ search: query.trim(), page: "" });
  }
  const labels = new Map(
    categories.map((item) => [item.id, categoryPath(item, categories, locale)]),
  );
  return (
    <section aria-busy={loading}>
      <ListToolbar
        busy={loading}
        clearLabel={t.common.clearFilters}
        filter={
          <>
            <label className="field">
              <span>{copy.category}</span>
              <select
                className="input"
                value={categoryId}
                onChange={(event) => navigate({ category_id: event.target.value, page: "" })}
              >
                <option value="">{copy.all}</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {categoryPath(item, categories, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{copy.status}</span>
              <select
                className="input"
                value={published}
                onChange={(event) => navigate({ is_published: event.target.value, page: "" })}
              >
                <option value="">{copy.all}</option>
                <option value="true">{copy.published}</option>
                <option value="false">{copy.draft}</option>
              </select>
            </label>
            <label className="field">
              <span>{copy.activeLabel}</span>
              <select
                className="input"
                value={active}
                onChange={(event) => navigate({ is_active: event.target.value, page: "" })}
              >
                <option value="">{copy.all}</option>
                <option value="true">{copy.active}</option>
                <option value="false">{copy.inactive}</option>
              </select>
            </label>
            <label className="field">
              <span>{copy.saleType}</span>
              <select
                className="input"
                value={csa}
                onChange={(event) => navigate({ csa_eligible: event.target.value, page: "" })}
              >
                <option value="">{copy.all}</option>
                <option value="true">{copy.csaSaleOption}</option>
                <option value="false">{copy.retailOnly}</option>
              </select>
            </label>
          </>
        }
        hasFilters={Boolean(query || search || categoryId || active || published || csa)}
        onClear={() => {
          setQuery("");
          navigate({
            search: "",
            category_id: "",
            is_active: "",
            is_published: "",
            csa_eligible: "",
            page: "",
          });
        }}
        onQueryChange={setQuery}
        onSubmit={submit}
        placeholder={copy.searchProduct}
        query={query}
        resultCount={meta?.total}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={copy.search}
        searchSubmitLabel={copy.search}
      />
      {categoryError && (
        <p className="error-box" role="alert">
          {categoryError}{" "}
          <button
            className="button secondary"
            onClick={() => setCategoryRetry((value) => value + 1)}
          >
            {t.common.retry}
          </button>
        </p>
      )}
      <ListState
        empty={copy.noProducts}
        error={error}
        hasData={items !== null}
        isEmpty={items?.length === 0}
        loading={loading}
        loadingLabel={copy.loading}
        onRetry={reload}
        retryLabel={t.common.retry}
      />
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table className="table store-product-table">
            <thead>
              <tr>
                <th>{copy.productName}</th>
                <th>{copy.category}</th>
                <th>{copy.price}</th>
                <th>{copy.saleType}</th>
                <th>{copy.status}</th>
                <th>{copy.updatedAt}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const name =
                  item.translations.find((value) => value.locale === locale)?.name ||
                  item.translations[0]?.name ||
                  item.sku;
                return (
                  <tr key={item.id}>
                    <td data-label={copy.productName}>
                      <div className="store-product-identity">
                        {item.primary_image && (
                          <Image
                            alt=""
                            src={mediaUrlForWidth(item.primary_image, 96)}
                            width={48}
                            height={48}
                            unoptimized
                          />
                        )}
                        <div>
                          <Link
                            className="csa-list-primary-link"
                            href={`/store-catalog/products/${item.id}`}
                          >
                            {name}
                          </Link>
                          <small className="table-secondary">{item.sku}</small>
                        </div>
                      </div>
                    </td>
                    <td data-label={copy.category}>
                      {labels.get(item.category_id) ?? item.category_slug}
                    </td>
                    <td data-label={copy.price}>
                      {new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(
                        BigInt(item.retail_price_vnd),
                      )}{" "}
                      ₫
                    </td>
                    <td data-label={copy.saleType}>
                      {item.csa_quota_group_id ? copy.csaEligible : copy.retailOnly}
                    </td>
                    <td data-label={copy.status}>
                      <span className={`badge ${item.is_published ? "" : "warm"}`}>
                        {item.is_published ? copy.published : copy.draft}
                      </span>{" "}
                      {!item.is_active && <span className="badge warm">{copy.inactive}</span>}
                    </td>
                    <td data-label={copy.updatedAt}>
                      {new Date(item.updated_at).toLocaleDateString(
                        locale === "vi" ? "vi-VN" : "en-US",
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {meta && (
        <Pagination
          disabled={loading}
          nextLabel={t.common.next}
          onPage={setPage}
          page={meta.page}
          pageSize={meta.page_size}
          previousLabel={t.common.previous}
          summary={t.common.pagination}
          total={meta.total}
        />
      )}
    </section>
  );
}
