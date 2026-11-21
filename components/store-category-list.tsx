"use client";
import { Table } from "@mantine/core";
import { FormField, FormSelect, Status } from "@/components/nfv-controls";

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
          <FormField label={copy.status} className="field">
            <FormSelect
              value={active}
              onChange={(selection) => setActive(selection ?? "")}
              data={[
                { value: "", label: copy.all },
                { value: "true", label: copy.active },
                { value: "false", label: copy.inactive },
              ]}
            />
          </FormField>
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
          <Table className="store-category-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{copy.categoryName}</Table.Th>
                <Table.Th>{copy.levelHeading}</Table.Th>
                <Table.Th>{copy.order}</Table.Th>
                <Table.Th>{copy.status}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(({ category, depth }) => (
                <Table.Tr key={category.id}>
                  <Table.Td data-label={copy.categoryName}>
                    <Link
                      className="csa-list-primary-link"
                      href={`/store-catalog/categories/${category.id}`}
                      style={{ marginInlineStart: `${Math.min(depth - 1, 2) * 1.25}rem` }}
                    >
                      {categoryName(category, locale)}
                    </Link>
                    <small className="table-secondary">/{category.slug}</small>
                  </Table.Td>
                  <Table.Td data-label={copy.levelHeading}>
                    {copy.level.replace("{level}", String(depth))}
                  </Table.Td>
                  <Table.Td data-label={copy.order}>{category.sort_order}</Table.Td>
                  <Table.Td data-label={copy.status}>
                    <Status
                      domain="availability"
                      status={category.is_active ? "active" : "inactive"}
                      label={category.is_active ? copy.active : copy.inactive}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}
    </section>
  );
}
