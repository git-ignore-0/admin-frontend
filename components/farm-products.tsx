"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FarmStockBatches } from "@/components/farm-stock-batches";
import { Button, FormInput, FormField, FormSelect, Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { StockBatchFields } from "@/components/stock-batch-fields";
import { requestErrorMessage } from "@/lib/client-error";
import { getStoreProduct } from "@/lib/commerce-api";
import {
  addFarmProduct,
  listAvailableFarmProducts,
  listFarmProducts,
  removeFarmProduct,
  setFarmProductActive,
} from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import {
  stockBatchRangeForPreset,
  validateStockBatchInput,
  type StockBatchDraft,
  type StockBatchFieldErrors,
  type StockBatchPreset,
} from "@/lib/farm-stock";
import { formatDecimalInput } from "@/lib/numeric-input";
import type { AvailableFarmProduct, FarmProduct, PaginationMeta, StoreProduct } from "@/lib/types";

function firstBatchDraft(): StockBatchDraft {
  return { ...stockBatchRangeForPreset("week"), quantity: "" };
}

type FarmProductsProps = {
  farmId: string;
  inStockCount?: number;
  outOfStockCount?: number;
  onInventoryChanged?: () => void;
};

export function FarmProducts({
  farmId,
  inStockCount = 0,
  outOfStockCount = 0,
  onInventoryChanged,
}: FarmProductsProps) {
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
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<StoreProduct | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [batchPreset, setBatchPreset] = useState<StockBatchPreset>("week");
  const [batchDraft, setBatchDraft] = useState<StockBatchDraft>(firstBatchDraft);
  const [batchErrors, setBatchErrors] = useState<StockBatchFieldErrors>({});
  const [addOpen, setAddOpen] = useState(false);
  const [linkedQuery, setLinkedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [actionError, setActionError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<FarmProduct | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [retry, setRetry] = useState(0);
  const productButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const restoreProductFocusRef = useRef(false);

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
        setOpenProduct((current) =>
          result.data.some((row) => row.product_id === current)
            ? current
            : (result.data[0]?.product_id ?? ""),
        );
        setLinksMeta(result.meta ?? { page: linksPage, page_size: 20, total: result.data.length });
      })
      .catch((caught) => live && setError(requestErrorMessage(caught, t)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [loadLinks, linksPage, retry, t]);

  useEffect(() => {
    if (mobileDetailOpen) {
      detailHeadingRef.current?.focus();
    } else if (restoreProductFocusRef.current) {
      productButtonRefs.current.get(openProduct)?.focus();
      restoreProductFocusRef.current = false;
    }
  }, [mobileDetailOpen, openProduct]);

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

  useEffect(() => {
    if (!addOpen || !selectedProduct) {
      setSelectedDetail(null);
      return;
    }
    let live = true;
    setDetailLoading(true);
    setDetailError("");
    setSelectedDetail(null);
    getStoreProduct(selectedProduct)
      .then((detail) => live && setSelectedDetail(detail))
      .catch(() => live && setDetailError(c.productDetailUnavailable))
      .finally(() => live && setDetailLoading(false));
    return () => {
      live = false;
    };
  }, [addOpen, c.productDetailUnavailable, retry, selectedProduct]);

  function searchProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCatalogPage(1);
    setSearch(query.trim());
    if (search === query.trim() && catalogPage === 1) setRetry((n) => n + 1);
  }

  async function add() {
    const validated = validateStockBatchInput(batchDraft);
    setBatchErrors(validated.errors);
    if (!selectedProduct || !selectedDetail || !validated.value || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await addFarmProduct(farmId, selectedProduct, validated.value);
      setRetry((n) => n + 1);
      onInventoryChanged?.();
      setAddOpen(false);
      setQuery("");
      setSearch("");
      setCatalogPage(1);
      setBatchDraft(firstBatchDraft());
      setBatchErrors({});
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
      onInventoryChanged?.();
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
      if (links?.length === 1 && linksPage > 1) setLinksPage((page) => page - 1);
      else setRetry((n) => n + 1);
      onInventoryChanged?.();
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

  return (
    <section
      className={`farm-products${mobileDetailOpen ? " mobile-detail-open" : ""}`}
      aria-busy={loading}
    >
      <div className="farm-stock-summary" aria-label={c.currentStock}>
        <span>{c.inStockProducts.replace("{count}", String(inStockCount))}</span>
        <span>{c.outOfStockProducts.replace("{count}", String(outOfStockCount))}</span>
      </div>
      <div className="farm-products-heading">
        <div>
          <h2>{c.products}</h2>
          <p>{c.selectProductHint}</p>
        </div>
        <Button
          disabled={loading}
          onClick={() => {
            setActionError("");
            setBatchPreset("week");
            setBatchDraft(firstBatchDraft());
            setBatchErrors({});
            setAddOpen(true);
          }}
        >
          {c.addProduct}
        </Button>
      </div>
      <div className="farm-products-layout">
        <div className="farm-product-list-pane">
          <form
            className="farm-product-picker farm-linked-search"
            role="search"
            onSubmit={searchLinks}
          >
            <label className="nfv-field">
              <span className="sr-only">{c.searchLinked}</span>
              <FormInput
                type="search"
                placeholder={c.searchLinked}
                value={linkedQuery}
                onChange={(event) => setLinkedQuery(event.target.value)}
              />
            </label>
            <Button variant="outline" type="submit" disabled={loading}>
              {c.searchButton}
            </Button>
          </form>
          {error && (
            <div className="error-box" role="alert">
              {error}
              <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
                {t.common.retry}
              </Button>
            </div>
          )}
          {loading && <p role="status">{c.loading}</p>}
          {!loading && !error && links?.length === 0 && (
            <p className="empty">{linkedSearch ? c.noLinkedMatch : c.linkedEmpty}</p>
          )}
          {!loading && !error && visibleLinks.length > 0 && (
            <div className="farm-product-options">
              {visibleLinks.map((row) => {
                const name = locale === "vi" ? row.name_vi : row.name_en;
                const unit = `${formatDecimalInput(row.unit_size)} ${locale === "vi" ? row.unit_label_vi : row.unit_label_en}`;
                const stockLabel = !row.is_active
                  ? c.productInactive
                  : row.available_quantity > 0
                    ? c.remainingUnits.replace("{count}", String(row.available_quantity))
                    : c.outOfStock;
                return (
                  <button
                    ref={(node) => {
                      if (node) productButtonRefs.current.set(row.product_id, node);
                      else productButtonRefs.current.delete(row.product_id);
                    }}
                    className="farm-product-option"
                    type="button"
                    key={row.id}
                    aria-label={`${name}, ${stockLabel}`}
                    aria-pressed={openProduct === row.product_id}
                    onClick={() => {
                      setActionError("");
                      setOpenProduct(row.product_id);
                      setMobileDetailOpen(true);
                    }}
                  >
                    <span>
                      <strong>{name}</strong>
                      <small>{row.sku}</small>
                    </span>
                    <small>{unit}</small>
                    <Status
                      status={
                        !row.is_active
                          ? "inactive"
                          : row.available_quantity > 0
                            ? "active"
                            : "expired"
                      }
                      label={stockLabel}
                    />
                  </button>
                );
              })}
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
        </div>
        <div className="farm-product-detail-pane">
          {actionError && !addOpen && (
            <p className="error-box" role="alert">
              {actionError}
            </p>
          )}
          {selectedLink ? (
            <FarmStockBatches
              key={selectedLink.product_id}
              farmId={farmId}
              product={selectedLink}
              detailHeadingRef={detailHeadingRef}
              onBack={() => {
                restoreProductFocusRef.current = true;
                setMobileDetailOpen(false);
              }}
              onSummaryChanged={() => {
                setRetry((value) => value + 1);
                onInventoryChanged?.();
              }}
              actions={
                <details className="farm-action-menu">
                  <summary
                    aria-label={`${c.moreActions}: ${locale === "vi" ? selectedLink.name_vi : selectedLink.name_en}`}
                  >
                    ···
                  </summary>
                  <button type="button" disabled={busy} onClick={() => void toggle(selectedLink)}>
                    {selectedLink.is_active ? c.stopSupply : c.resumeSupply}
                  </button>
                  {!selectedLink.has_supply_history ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setRemoveTarget(selectedLink);
                        setRemoveError("");
                      }}
                    >
                      {c.removeLink}
                    </button>
                  ) : null}
                </details>
              }
            />
          ) : !loading ? (
            <p className="empty">{c.linkedEmpty}</p>
          ) : null}
        </div>
      </div>
      {addOpen && (
        <ConfirmationDialog
          title={c.addFromCatalog}
          busy={busy}
          busyLabel={c.saving}
          cancelLabel={c.cancel}
          confirmLabel={c.addProduct}
          confirmDisabled={
            !selectedProduct ||
            !selectedDetail ||
            catalogLoading ||
            detailLoading ||
            Boolean(catalogError) ||
            Boolean(detailError)
          }
          error={actionError}
          onCancel={() => {
            if (!busy) {
              setAddOpen(false);
              setActionError("");
            }
          }}
          onConfirm={() => void add()}
        >
          <p className="nfv-field-hint">{c.addFromCatalogHint}</p>
          <form className="farm-product-picker" onSubmit={searchProducts} role="search">
            <FormField label={c.productSearch}>
              <FormInput
                type="search"
                placeholder={c.productPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </FormField>
            <Button variant="outline" type="submit" disabled={catalogLoading}>
              {c.searchButton}
            </Button>
          </form>
          {catalogError && (
            <p className="error-box" role="alert">
              {catalogError}{" "}
              <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
                {t.common.retry}
              </Button>
            </p>
          )}
          {detailError && (
            <p className="error-box" role="alert">
              {detailError}{" "}
              <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
                {t.common.retry}
              </Button>
            </p>
          )}
          <FormField label={c.productColumn}>
            <FormSelect
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
            </FormSelect>
          </FormField>
          {selectedDetail ? (
            <StockBatchFields
              draft={batchDraft}
              errors={batchErrors}
              labels={c}
              preset={batchPreset}
              unitSize={selectedDetail.unit_size}
              unitLabel={
                locale === "vi" ? selectedDetail.unit_label_vi : selectedDetail.unit_label_en
              }
              onChange={(value) => {
                setBatchDraft(value);
                setBatchErrors({});
              }}
              onPresetChange={setBatchPreset}
            />
          ) : detailLoading ? (
            <p role="status">{c.loading}</p>
          ) : null}
          {catalogMeta.total > catalogMeta.page_size && (
            <div className="farm-catalog-pagination">
              <Button
                variant="outline"
                disabled={catalogPage <= 1 || catalogLoading}
                onClick={() => setCatalogPage((n) => n - 1)}
              >
                {t.common.previous}
              </Button>
              <span>
                {t.common.pagination
                  .replace("{page}", String(catalogPage))
                  .replace("{pages}", String(Math.ceil(catalogMeta.total / catalogMeta.page_size)))}
              </span>
              <Button
                variant="outline"
                disabled={
                  catalogPage * catalogMeta.page_size >= catalogMeta.total || catalogLoading
                }
                onClick={() => setCatalogPage((n) => n + 1)}
              >
                {t.common.next}
              </Button>
            </div>
          )}
        </ConfirmationDialog>
      )}
      {removeTarget && (
        <ConfirmationDialog
          title={c.removeLink}
          busy={busy}
          busyLabel={c.saving}
          cancelLabel={c.cancel}
          confirmLabel={c.removeLink}
          danger
          error={removeError}
          onCancel={() => !busy && setRemoveTarget(null)}
          onConfirm={() => void remove(removeTarget)}
        >
          <p>{c.productRemovePrompt.replace("{sku}", removeTarget.sku)}</p>
        </ConfirmationDialog>
      )}
    </section>
  );
}
