"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListToolbar } from "@/components/list-toolbar";
import { listStoreCategories } from "@/lib/commerce-api";
import { requestErrorMessage } from "@/lib/client-error";
import { categoryName, categoryTreeRows } from "@/lib/store-categories";
import type { StoreCategory } from "@/lib/types";

export function StoreCategoryList() {
  const { locale, t } = useAdminI18n();
  const copy = t.storeCatalog;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("");
  const [items, setItems] = useState<StoreCategory[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    listStoreCategories({
      search,
      ...(active ? { is_active: active === "true" } : {}),
    })
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch((caught) => {
        if (!cancelled) setError(requestErrorMessage(caught, t));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, active, reloadKey, t]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (value === search) reload();
    else setSearch(value);
  }

  const rows = categoryTreeRows(items ?? []);
  return (
    <section aria-busy={loading}>
      <ListToolbar
        busy={loading}
        clearLabel={t.common.clearFilters}
        filter={
          <label className="field">
            <span>{copy.status}</span>
            <select
              className="input"
              value={active}
              onChange={(event) => setActive(event.target.value)}
            >
              <option value="">{copy.all}</option>
              <option value="true">{copy.active}</option>
              <option value="false">{copy.inactive}</option>
            </select>
          </label>
        }
        hasFilters={Boolean(search || query || active)}
        onClear={() => {
          setQuery("");
          setSearch("");
          setActive("");
        }}
        onQueryChange={setQuery}
        onSubmit={submit}
        placeholder={copy.searchCategory}
        query={query}
        resultCount={items?.length}
        resultCountLabel={t.common.resultCount}
        resultCountSingularLabel={t.common.resultCountSingular}
        searchLabel={copy.search}
        searchSubmitLabel={copy.search}
      />
      <ListState
        empty={copy.noCategories}
        error={error}
        hasData={items !== null}
        isEmpty={rows.length === 0}
        loading={loading}
        loadingLabel={copy.loading}
        onRetry={reload}
        retryLabel={t.common.retry}
      />
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="table store-category-table">
            <thead>
              <tr>
                <th>{copy.categoryName}</th>
                <th>{copy.levelHeading}</th>
                <th>{copy.order}</th>
                <th>{copy.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ category, depth }) => (
                <tr key={category.id}>
                  <td data-label={copy.categoryName}>
                    <Link
                      className="csa-list-primary-link"
                      href={`/store-catalog/categories/${category.id}`}
                      style={{ marginInlineStart: `${Math.min(depth - 1, 2) * 1.25}rem` }}
                    >
                      {categoryName(category, locale)}
                    </Link>
                    <small className="table-secondary">/{category.slug}</small>
                  </td>
                  <td data-label={copy.levelHeading}>
                    {copy.level.replace("{level}", String(depth))}
                  </td>
                  <td data-label={copy.order}>{category.sort_order}</td>
                  <td data-label={copy.status}>
                    <span className={`badge ${category.is_active ? "" : "warm"}`}>
                      {category.is_active ? copy.active : copy.inactive}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
