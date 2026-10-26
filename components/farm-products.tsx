"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FarmWeeklySupply } from "@/components/farm-weekly-supply";
import { Pagination } from "@/components/pagination";
import { requestErrorMessage } from "@/lib/client-error";
import {
  addFarmProduct,
  listAvailableFarmProducts,
  listFarmProducts,
  removeFarmProduct,
  setFarmProductActive,
} from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import { formatDecimalInput } from "@/lib/numeric-input";
import type { AvailableFarmProduct, FarmProduct, PaginationMeta } from "@/lib/types";

export function FarmProducts({ farmId, initialWeek }: { farmId: string; initialWeek?: string }) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const [links, setLinks] = useState<FarmProduct[] | null>(null);
  const [linksMeta, setLinksMeta] = useState<PaginationMeta>({ page: 1, page_size: 20, total: 0 });
  const [linksPage, setLinksPage] = useState(1);
  const [linkedSearch, setLinkedSearch] = useState("");
  const [catalog, setCatalog] = useState<AvailableFarmProduct[]>([]);
  const [catalogMeta, setCatalogMeta] = useState<PaginationMeta>({
    page: 1,
    page_size: 30,
    total: 0,
  });
  const [catalogPage, setCatalogPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [openProduct, setOpenProduct] = useState("");
  const [weeklyDrafts, setWeeklyDrafts] = useState<Record<string, Record<string, string>>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [linkedQuery, setLinkedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [actionError, setActionError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<FarmProduct | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [retry, setRetry] = useState(0);

  const loadLinks = useCallback(
    () => listFarmProducts(farmId, { page: linksPage, search: linkedSearch }),
    [farmId, linksPage, linkedSearch],
  );

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    loadLinks()
      .then((result) => {
        if (!live) return;
        setLinks(result.data);
        setLinksMeta(result.meta ?? { page: linksPage, page_size: 20, total: result.data.length });
      })
      .catch((caught) => live && setError(requestErrorMessage(caught, t)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [loadLinks, linksPage, retry, t]);

  useEffect(() => {
    if (!addOpen) return;
    let live = true;
    setCatalogLoading(true);
    setCatalogError("");
    listAvailableFarmProducts(farmId, { page: catalogPage, search })
      .then((result) => {
        if (!live) return;
        setCatalog(result.data);
        setCatalogMeta(
          result.meta ?? { page: catalogPage, page_size: 30, total: result.data.length },
        );
        setSelected((current) =>
          result.data.some((product) => product.id === current)
            ? current
            : (result.data[0]?.id ?? ""),
        );
      })
      .catch((caught) => live && setCatalogError(requestErrorMessage(caught, t)))
      .finally(() => live && setCatalogLoading(false));
    return () => {
      live = false;
    };
  }, [addOpen, catalogPage, farmId, search, retry, t]);

  const selectedProduct = catalog.some((product) => product.id === selected)
    ? selected
    : (catalog[0]?.id ?? "");

  function searchProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCatalogPage(1);
    setSearch(query.trim());
    if (search === query.trim() && catalogPage === 1) setRetry((n) => n + 1);
  }

  async function add() {
    if (!selectedProduct || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await addFarmProduct(farmId, selectedProduct);
      setRetry((n) => n + 1);
      setAddOpen(false);
      setQuery("");
      setSearch("");
      setCatalogPage(1);
    } catch (caught) {
      setActionError(
        (caught as Error).message === "product_already_linked"
          ? c.alreadyLinked
          : (caught as Error).message === "product_inactive"
            ? c.productDeactivated
            : requestErrorMessage(caught, t),
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggle(row: FarmProduct) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const updated = await setFarmProductActive(farmId, row.product_id, !row.is_active);
      setLinks((current) => current?.map((item) => (item.id === row.id ? updated : item)) ?? null);
    } catch (caught) {
      setActionError(requestErrorMessage(caught, t));
    } finally {
      setBusy(false);
    }
  }
  async function remove(row: FarmProduct) {
    if (busy) return;
    setBusy(true);
    setRemoveError("");
    try {
      await removeFarmProduct(farmId, row.product_id);
      const draftKey = `${farmId}:${row.product_id}`;
      setWeeklyDrafts((current) => {
        const next = { ...current };
        delete next[draftKey];
        return next;
      });
      if (links?.length === 1 && linksPage > 1) setLinksPage((page) => page - 1);
      else setRetry((n) => n + 1);
      setRemoveTarget(null);
    } catch (caught) {
      let message = requestErrorMessage(caught, t);
      if (caught instanceof Error && caught.message === "farm_product_has_supply") {
        message = c.protectedLink;
      } else if (caught instanceof Error && caught.message === "farm_product_changed") {
        message = c.changedLink;
      }
      setRemoveError(message);
    } finally {
      setBusy(false);
    }
  }
  function searchLinks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLinksPage(1);
    setLinkedSearch(linkedQuery.trim());
    if (linkedSearch === linkedQuery.trim() && linksPage === 1) setRetry((n) => n + 1);
  }

  const visibleLinks = links ?? [];
  const selectedLink = links?.find((row) => row.product_id === openProduct);
  const selectedDraftKey = selectedLink ? `${farmId}:${selectedLink.product_id}` : "";

  return (
    <section className="farm-products" aria-busy={loading}>
      <div className="farm-products-heading">
        <div>
          <h2>{c.products}</h2>
          <p>{c.selectProductHint}</p>
        </div>
        <button
          className="button"
          type="button"
          disabled={loading}
          onClick={() => {
            setActionError("");
            setAddOpen(true);
          }}
        >
          {c.addProduct}
        </button>
      </div>
      <form className="farm-product-picker farm-linked-search" role="search" onSubmit={searchLinks}>
        <label className="field">
          <span className="sr-only">{c.searchLinked}</span>
          <input
            className="input"
            type="search"
            placeholder={c.searchLinked}
            value={linkedQuery}
            onChange={(event) => setLinkedQuery(event.target.value)}
          />
        </label>
        <button className="button secondary" type="submit" disabled={loading}>
          {c.searchButton}
        </button>
      </form>
      {actionError && !addOpen && (
        <p className="error-box" role="alert">
          {actionError}
        </p>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
          <button className="button secondary" type="button" onClick={() => setRetry((n) => n + 1)}>
            {t.common.retry}
          </button>
        </div>
      )}
      {loading && <p role="status">{c.loading}</p>}
      {!loading && !error && links?.length === 0 && (
        <p className="empty">{linkedSearch ? c.noLinkedMatch : c.linkedEmpty}</p>
      )}
      {!loading && !error && links && links.length > 0 && (
        <div className="farm-linked-table-wrap">
          <table className="farm-linked-table">
            <thead>
              <tr>
                <th scope="col">{c.productColumn}</th>
                <th scope="col">{c.saleUnitColumn}</th>
                <th scope="col">{c.status}</th>
                <th scope="col">
                  <span className="sr-only">{c.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleLinks.map((row) => {
                const name = locale === "vi" ? row.name_vi : row.name_en;
                const unit = `${formatDecimalInput(row.unit_size)} ${locale === "vi" ? row.unit_label_vi : row.unit_label_en}`;
                return (
                  <tr key={row.id}>
                    <td data-label={c.productColumn}>
                      <strong>{name}</strong>
                      <small>{row.sku}</small>
                    </td>
                    <td data-label={c.saleUnitColumn}>{unit}</td>
                    <td data-label={c.status}>
                      {row.is_active ? c.productActive : c.productInactive}
                    </td>
                    <td className="farm-linked-actions">
                      <div>
                        <button
                          className="farm-text-action"
                          type="button"
                          onClick={() =>
                            setOpenProduct(openProduct === row.product_id ? "" : row.product_id)
                          }
                        >
                          {c.weekly} {name}
                        </button>
                        <details className="farm-action-menu">
                          <summary aria-label={`${c.moreActions}: ${name}`}>···</summary>
                          <button type="button" disabled={busy} onClick={() => void toggle(row)}>
                            {row.is_active ? c.stopSupply : c.resumeSupply}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setRemoveTarget(row);
                              setRemoveError("");
                            }}
                          >
                            {c.removeLink}
                          </button>
                        </details>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && linksMeta.total > linksMeta.page_size && (
        <Pagination
          page={linksPage}
          total={linksMeta.total}
          pageSize={linksMeta.page_size}
          onPage={setLinksPage}
          disabled={loading}
          previousLabel={t.common.previous}
          nextLabel={t.common.next}
          summary={t.common.pagination}
        />
      )}
      {selectedLink && (
        <section className="farm-selected-weekly" aria-label={`${c.weekly} ${selectedLink.sku}`}>
          <div className="farm-selected-weekly-heading">
            <div>
              <h3>
                {c.weekly}: {locale === "vi" ? selectedLink.name_vi : selectedLink.name_en}
              </h3>
              <p>{c.weeklyHint}</p>
            </div>
            <button
              className="button secondary"
              type="button"
              onClick={() => setOpenProduct("")}
              aria-label={c.closeWeekly}
            >
              ×
            </button>
          </div>
          <FarmWeeklySupply
            farmId={farmId}
            product={selectedLink}
            initialWeek={initialWeek}
            drafts={weeklyDrafts[selectedDraftKey] ?? {}}
            onDraftChange={(week, value) =>
              setWeeklyDrafts((current) => ({
                ...current,
                [selectedDraftKey]: { ...current[selectedDraftKey], [week]: value },
              }))
            }
            onDraftSaved={(week, savedValue) =>
              setWeeklyDrafts((current) => {
                const productDrafts = current[selectedDraftKey];
                if (!productDrafts || productDrafts[week] !== savedValue) return current;
                const nextProductDrafts = { ...productDrafts };
                delete nextProductDrafts[week];
                return { ...current, [selectedDraftKey]: nextProductDrafts };
              })
            }
          />
        </section>
      )}
      {addOpen && (
        <ConfirmationDialog
          title={c.addFromCatalog}
          busy={busy}
          busyLabel={c.saving}
          cancelLabel={locale === "vi" ? "Hủy" : "Cancel"}
          confirmLabel={c.addProduct}
          confirmDisabled={!selectedProduct || catalogLoading || Boolean(catalogError)}
          error={actionError}
          onCancel={() => {
            if (!busy) {
              setAddOpen(false);
              setActionError("");
            }
          }}
          onConfirm={() => void add()}
        >
          <p className="field-help">{c.addFromCatalogHint}</p>
          <form className="farm-product-picker" onSubmit={searchProducts} role="search">
            <label className="field">
              <span>{c.productSearch}</span>
              <input
                className="input"
                type="search"
                placeholder={c.productPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button className="button secondary" type="submit" disabled={catalogLoading}>
              {c.searchButton}
            </button>
          </form>
          {catalogError && (
            <p className="error-box" role="alert">
              {catalogError}{" "}
              <button
                className="button secondary"
                type="button"
                onClick={() => setRetry((n) => n + 1)}
              >
                {t.common.retry}
              </button>
            </p>
          )}
          <label className="field">
            <span>{c.productColumn}</span>
            <select
              className="input"
              value={selectedProduct}
              onChange={(event) => setSelected(event.target.value)}
              disabled={catalogLoading || !catalog.length}
            >
              {catalog.length ? (
                catalog.map((product) => (
                  <option key={product.id} value={product.id}>
                    {locale === "vi" ? product.name_vi : product.name_en} · {product.sku}
                  </option>
                ))
              ) : (
                <option value="">{catalogLoading ? c.loading : c.noCatalogMatch}</option>
              )}
            </select>
          </label>
          {catalogMeta.total > catalogMeta.page_size && (
            <div className="farm-weekly-navigation">
              <button
                className="button secondary"
                type="button"
                disabled={catalogPage <= 1 || catalogLoading}
                onClick={() => setCatalogPage((n) => n - 1)}
              >
                {t.common.previous}
              </button>
              <span>
                {t.common.pagination
                  .replace("{page}", String(catalogPage))
                  .replace("{pages}", String(Math.ceil(catalogMeta.total / catalogMeta.page_size)))}
              </span>
              <button
                className="button secondary"
                type="button"
                disabled={
                  catalogPage * catalogMeta.page_size >= catalogMeta.total || catalogLoading
                }
                onClick={() => setCatalogPage((n) => n + 1)}
              >
                {t.common.next}
              </button>
            </div>
          )}
        </ConfirmationDialog>
      )}
      {removeTarget && (
        <ConfirmationDialog
          title={c.removeLink}
          busy={busy}
          busyLabel={c.saving}
          cancelLabel={locale === "vi" ? "Hủy" : "Cancel"}
          confirmLabel={c.removeLink}
          danger
          error={removeError}
          onCancel={() => !busy && setRemoveTarget(null)}
          onConfirm={() => void remove(removeTarget)}
        >
          <p>
            {locale === "vi"
              ? `Gỡ ${removeTarget.sku} khỏi trang trại? Số lượng đã ghi trước đó sẽ được giữ bằng cách tắt cung cấp.`
              : `Remove ${removeTarget.sku} from this farm? Existing weekly history should be kept by deactivating supply instead.`}
          </p>
        </ConfirmationDialog>
      )}
    </section>
  );
}
