"use client";
import { DataState } from "@/components/nfv-controls";
import { Stack, Alert, ActionIcon, Button, Menu, Text } from "@mantine/core";

import { IconDots } from "@tabler/icons-react";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ProductLifecycleStatus } from "@/components/product-lifecycle-status";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FarmStockBatches } from "@/components/farm-stock-batches";
import { FormInput, FormField, FormSelect, Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { StockBatchFields } from "@/components/stock-batch-fields";
import { isProtectedDataError, requestErrorMessage, type ClientApiError } from "@/lib/client-error";
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

export function FarmProducts(props: FarmProductsProps) {
  return <FarmProductsForFarm key={props.farmId} {...props} />;
}

function FarmProductsForFarm({
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
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [accessError, setAccessError] = useState("");
  const accessLost = useRef(false);
  const mutation = useRef(false);
  const mounted = useRef(false);
  const retireInventory = useCallback(
    (caught: unknown) => {
      accessLost.current = true;
      setAccessError(requestErrorMessage(caught, t));
      setLinks(null);
      setOpenProduct("");
      setMobileDetailOpen(false);
      setCatalog([]);
      setSelected("");
      setSelectedDetail(null);
      setAddOpen(false);
      setRemoveTarget(null);
      setActionError("");
    },
    [t],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reloadLinks = useCallback(() => {
    setLoading(true);
    setRetry((value) => value + 1);
  }, []);
  function reloadCatalog() {
    setCatalogLoading(true);
    setSelectedDetail(null);
    setCatalogRetry((value) => value + 1);
  }

  function mutationMayHaveSucceeded(caught: unknown) {
    if (!(caught instanceof Error)) return false;
    const error = caught as ClientApiError;
    return (
      error.status === 404 ||
      (error.status ?? 0) >= 500 ||
      ["invalid_response", "network_error", "request_timeout"].includes(error.message)
    );
  }

  function retireIfDenied(caught: unknown) {
    if (!isProtectedDataError(caught)) return false;
    retireInventory(caught);
    return true;
  }

  const productButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const restoreProductFocusRef = useRef(false);

  const loadLinks = useCallback(
    (signal: AbortSignal) =>
      listFarmProducts(farmId, { page: linksPage, search: linkedSearch }, signal),
    [farmId, linksPage, linkedSearch],
  );

  useEffect(() => {
    if (accessError) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    loadLinks(controller.signal)
      .then((result) => {
        if (controller.signal.aborted || accessLost.current) return;
        setLinks(result.data);
        setRemoveTarget((current) =>
          current && result.data.some((row) => row.id === current.id && !row.has_supply_history)
            ? current
            : null,
        );
        setOpenProduct((current) =>
          result.data.some((row) => row.product_id === current)
            ? current
            : (result.data[0]?.product_id ?? ""),
        );
        setLinksMeta(result.meta ?? { page: linksPage, page_size: 20, total: result.data.length });
      })
      .catch((caught) => {
        if (controller.signal.aborted || accessLost.current) return;
        if (isProtectedDataError(caught)) {
          retireInventory(caught);
          return;
        }
        setLinks(null);
        setMobileDetailOpen(false);
        setRemoveTarget(null);
        setError(requestErrorMessage(caught, t));
      })
      .finally(() => {
        if (!controller.signal.aborted && !accessLost.current) setLoading(false);
      });
    return () => controller.abort();
  }, [accessError, loadLinks, linksPage, retry, retireInventory, t]);

  useEffect(() => {
    if (mobileDetailOpen) {
      detailHeadingRef.current?.focus();
    } else if (restoreProductFocusRef.current) {
      productButtonRefs.current.get(openProduct)?.focus();
      restoreProductFocusRef.current = false;
    }
  }, [mobileDetailOpen, openProduct]);

  useEffect(() => {
    if (!addOpen || accessError) return;
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError("");
    listAvailableFarmProducts(farmId, { page: catalogPage, search }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || accessLost.current) return;
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
      .catch((caught) => {
        if (controller.signal.aborted || accessLost.current) return;
        if (isProtectedDataError(caught)) {
          retireInventory(caught);
          return;
        }
        setCatalog([]);
        setCatalogError(requestErrorMessage(caught, t));
      })
      .finally(() => {
        if (!controller.signal.aborted && !accessLost.current) setCatalogLoading(false);
      });
    return () => controller.abort();
  }, [accessError, addOpen, catalogPage, farmId, search, catalogRetry, retireInventory, t]);

  const selectedProduct = catalog.some((product) => product.id === selected)
    ? selected
    : (catalog[0]?.id ?? "");

  useEffect(() => {
    if (!addOpen || !selectedProduct || catalogLoading || accessError) {
      setSelectedDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError("");
    setSelectedDetail(null);
    getStoreProduct(selectedProduct, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted && !accessLost.current) setSelectedDetail(detail);
      })
      .catch((caught) => {
        if (controller.signal.aborted || accessLost.current) return;
        if (isProtectedDataError(caught)) retireInventory(caught);
        else setDetailError(c.productDetailUnavailable);
      })
      .finally(() => {
        if (!controller.signal.aborted && !accessLost.current) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [
    accessError,
    addOpen,
    c.productDetailUnavailable,
    catalogLoading,
    retireInventory,
    selectedProduct,
  ]);

  const selectedIsSelling =
    selectedDetail?.id === selectedProduct && selectedDetail.status === "active";

  function searchProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCatalogPage(1);
    setSearch(query.trim());
    reloadCatalog();
  }

  async function add() {
    const validated = validateStockBatchInput(batchDraft);
    setBatchErrors(validated.errors);
    if (
      !selectedProduct ||
      !selectedIsSelling ||
      !validated.value ||
      mutation.current ||
      accessLost.current ||
      catalogLoading ||
      detailLoading ||
      catalogError ||
      detailError
    )
      return;
    mutation.current = true;
    setBusy(true);
    setActionError("");
    try {
      await addFarmProduct(farmId, selectedProduct, validated.value);
      if (!mounted.current || accessLost.current) return;
      reloadLinks();
      onInventoryChanged?.();
      setAddOpen(false);
      setQuery("");
      setSearch("");
      setCatalogPage(1);
      setBatchDraft(firstBatchDraft());
      setBatchErrors({});
    } catch (caught) {
      if (!mounted.current || accessLost.current || retireIfDenied(caught)) return;
      const code = caught instanceof Error ? caught.message : "";
      if (
        ["product_inactive", "product_not_selling", "product_already_linked"].includes(code) ||
        mutationMayHaveSucceeded(caught)
      ) {
        reloadLinks();
        reloadCatalog();
        setBatchDraft(firstBatchDraft());
        setBatchErrors({});
        onInventoryChanged?.();
      }
      setActionError(
        code === "product_inactive" || code === "product_not_selling"
          ? c.productDeactivated
          : code === "product_already_linked"
            ? c.alreadyLinked
            : requestErrorMessage(caught, t),
      );
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function toggle(row: FarmProduct) {
    if (mutation.current || loading || error || accessLost.current) return;
    mutation.current = true;
    setBusy(true);
    setActionError("");
    try {
      const updated = await setFarmProductActive(farmId, row.product_id, !row.is_active);
      if (!mounted.current || accessLost.current) return;
      setLinks((current) => current?.map((item) => (item.id === row.id ? updated : item)) ?? null);
      onInventoryChanged?.();
    } catch (caught) {
      if (!mounted.current || accessLost.current || retireIfDenied(caught)) return;
      if (mutationMayHaveSucceeded(caught)) reloadLinks();
      setActionError(
        caught instanceof Error && caught.message === "stock_reserved"
          ? c.stockReserved
          : requestErrorMessage(caught, t),
      );
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function remove(row: FarmProduct) {
    if (mutation.current || loading || error || accessLost.current) return;
    mutation.current = true;
    setBusy(true);
    setRemoveError("");
    try {
      await removeFarmProduct(farmId, row.product_id);
      if (!mounted.current || accessLost.current) return;
      if (links?.length === 1 && linksPage > 1) {
        setLoading(true);
        setLinksPage((page) => page - 1);
      } else reloadLinks();
      onInventoryChanged?.();
      setRemoveTarget(null);
    } catch (caught) {
      if (!mounted.current || accessLost.current || retireIfDenied(caught)) return;
      if (mutationMayHaveSucceeded(caught)) reloadLinks();
      let message = requestErrorMessage(caught, t);
      if (caught instanceof Error && caught.message === "farm_product_has_supply") {
        message = c.protectedLink;
      } else if (caught instanceof Error && caught.message === "farm_product_changed") {
        message = c.changedLink;
      }
      setRemoveError(message);
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function searchLinks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLinksPage(1);
    setLinkedSearch(linkedQuery.trim());
    reloadLinks();
  }

  const visibleLinks = links ?? [];
  const selectedLink = error ? undefined : links?.find((row) => row.product_id === openProduct);

  if (accessError) {
    return (
      <DataState
        kind="error"
        title={accessError}
        action={{
          label: t.common.retry,
          onClick: () => {
            accessLost.current = false;
            setAccessError("");
            reloadLinks();
            onInventoryChanged?.();
          },
        }}
      />
    );
  }

  return (
    <section
      className={`farm-products${mobileDetailOpen ? " mobile-detail-open" : ""}`}
      aria-busy={loading}
    >
      {!error && (
        <div className="farm-stock-summary" aria-label={c.currentStock}>
          <span>{c.inStockProducts.replace("{count}", String(inStockCount))}</span>
          <span>{c.outOfStockProducts.replace("{count}", String(outOfStockCount))}</span>
        </div>
      )}
      <div className="farm-products-heading">
        <div>
          <h2>{c.products}</h2>
          <p>{c.selectProductHint}</p>
        </div>
        <Button
          disabled={loading || busy || Boolean(error)}
          onClick={() => {
            setActionError("");
            setCatalogLoading(true);
            setSelectedDetail(null);
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
            <FormField label={c.searchLinked} className="nfv-field">
              <FormInput
                type="search"
                placeholder={c.searchLinked}
                value={linkedQuery}
                onChange={(event) => setLinkedQuery(event.target.value)}
              />
            </FormField>
            <Button variant="default" type="submit" disabled={loading}>
              {c.searchButton}
            </Button>
          </form>
          {error && (
            <Alert color="red" role="alert">
              <Stack gap="sm" align="flex-start">
                {error}
                <Button variant="default" onClick={reloadLinks}>
                  {t.common.retry}
                </Button>
              </Stack>
            </Alert>
          )}
          {loading && <DataState kind="loading" title={c.loading} />}
          {!loading && !error && links?.length === 0 && (
            <DataState kind="empty" title={linkedSearch ? c.noLinkedMatch : c.linkedEmpty} />
          )}
          {!loading && !error && visibleLinks.length > 0 && (
            <div className="farm-product-options">
              {visibleLinks.map((row) => {
                const name = locale === "vi" ? row.name_vi : row.name_en;
                const unit = `${formatDecimalInput(row.unit_size)} ${locale === "vi" ? row.unit_label_vi : row.unit_label_en}`;
                const supplyLabel = row.is_active ? c.productActive : c.productInactive;
                const lifecycleLabels = {
                  draft: t.storeCatalog.productDraft,
                  active: t.storeCatalog.selling,
                  discontinued: t.storeCatalog.discontinued,
                };
                const stockLabel =
                  row.available_quantity > 0
                    ? c.remainingUnits.replace("{count}", String(row.available_quantity))
                    : c.outOfStock;
                return (
                  <Button
                    ref={(node) => {
                      if (node) productButtonRefs.current.set(row.product_id, node);
                      else productButtonRefs.current.delete(row.product_id);
                    }}
                    className="farm-product-option"
                    variant="default"
                    fullWidth
                    h="auto"
                    styles={{
                      inner: { width: "100%" },
                      label: {
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: "7px 12px",
                        width: "100%",
                        textAlign: "left",
                        whiteSpace: "normal",
                      },
                    }}
                    type="button"
                    disabled={busy}
                    key={row.id}
                    aria-label={`${name}, ${lifecycleLabels[row.product_status]}, ${supplyLabel}, ${stockLabel}`}
                    aria-pressed={openProduct === row.product_id}
                    onClick={() => {
                      setActionError("");
                      setOpenProduct(row.product_id);
                      setMobileDetailOpen(true);
                    }}
                  >
                    <span style={{ display: "grid", minWidth: 0, gap: 3 }}>
                      <strong>{name}</strong>
                      <small>{row.sku}</small>
                      <ProductLifecycleStatus status={row.product_status} />
                    </span>
                    <small style={{ gridColumn: 1 }}>{unit}</small>
                    <Stack component="span" align="flex-end" gap={2}>
                      <Status
                        domain="farm-stock"
                        status={row.is_active ? "active" : "inactive"}
                        label={supplyLabel}
                      />
                      <Text component="span" size="xs">
                        {stockLabel}
                      </Text>
                    </Stack>
                  </Button>
                );
              })}
            </div>
          )}
          {!loading && !error && linksMeta.total > linksMeta.page_size && (
            <Pagination
              page={linksPage}
              total={linksMeta.total}
              pageSize={linksMeta.page_size}
              onPage={(page) => {
                setLoading(true);
                setLinksPage(page);
              }}
              disabled={loading}
              previousLabel={t.common.previous}
              nextLabel={t.common.next}
              summary={t.common.pagination}
            />
          )}
        </div>
        <div className="farm-product-detail-pane">
          {actionError && !addOpen && (
            <Alert color="red" role="alert">
              {actionError}
            </Alert>
          )}
          {selectedLink ? (
            <FarmStockBatches
              key={selectedLink.id}
              farmId={farmId}
              product={selectedLink}
              detailHeadingRef={detailHeadingRef}
              onBack={() => {
                restoreProductFocusRef.current = true;
                setMobileDetailOpen(false);
              }}
              onSummaryChanged={() => {
                reloadLinks();
                onInventoryChanged?.();
              }}
              onAccessLost={retireInventory}
              summaryBusy={loading || busy}
              actions={
                <Menu position="bottom-end" returnFocus>
                  <Menu.Target>
                    <ActionIcon
                      variant="default"
                      disabled={busy}
                      aria-label={`${c.moreActions}: ${locale === "vi" ? selectedLink.name_vi : selectedLink.name_en}`}
                    >
                      <IconDots aria-hidden="true" size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item disabled={busy} onClick={() => void toggle(selectedLink)}>
                      {selectedLink.is_active ? c.stopSupply : c.resumeSupply}
                    </Menu.Item>
                    {!selectedLink.has_supply_history ? (
                      <Menu.Item
                        color="red"
                        disabled={busy}
                        onClick={() => {
                          setRemoveTarget(selectedLink);
                          setRemoveError("");
                        }}
                      >
                        {c.removeLink}
                      </Menu.Item>
                    ) : null}
                  </Menu.Dropdown>
                </Menu>
              }
            />
          ) : !loading && !error ? (
            <DataState kind="empty" title={c.linkedEmpty} />
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
            !selectedIsSelling ||
            catalogLoading ||
            detailLoading ||
            Boolean(catalogError) ||
            Boolean(detailError)
          }
          error={actionError || (selectedDetail && !selectedIsSelling ? c.productDeactivated : "")}
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
            <Button variant="default" type="submit" disabled={busy || catalogLoading}>
              {c.searchButton}
            </Button>
          </form>
          {catalogError && (
            <Alert color="red" role="alert">
              <Stack gap="sm" align="flex-start">
                {catalogError}{" "}
                <Button variant="default" onClick={reloadCatalog}>
                  {t.common.retry}
                </Button>
              </Stack>
            </Alert>
          )}
          {detailError && (
            <Alert color="red" role="alert">
              <Stack gap="sm" align="flex-start">
                {detailError}{" "}
                <Button variant="default" onClick={reloadCatalog}>
                  {t.common.retry}
                </Button>
              </Stack>
            </Alert>
          )}
          <FormField label={c.productColumn}>
            <FormSelect
              value={selectedProduct}
              onChange={(value) => {
                if (!value || value === selectedProduct) return;
                setActionError("");
                setSelectedDetail(null);
                setSelected(value ?? "");
              }}
              disabled={busy || catalogLoading || !catalog.length}
              data={
                catalog.length
                  ? catalog.map((product) => ({
                      value: product.id,
                      label: `${locale === "vi" ? product.name_vi : product.name_en} · ${product.sku}`,
                    }))
                  : [{ value: "", label: catalogLoading ? c.loading : c.noCatalogMatch }]
              }
            />
          </FormField>
          {selectedIsSelling && selectedDetail ? (
            <StockBatchFields
              draft={batchDraft}
              errors={batchErrors}
              labels={c}
              disabled={busy || catalogLoading || detailLoading}
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
            <DataState kind="loading" title={c.loading} />
          ) : null}
          <Pagination
            page={catalogPage}
            total={catalogMeta.total}
            pageSize={catalogMeta.page_size}
            onPage={(page) => {
              reloadCatalog();
              setCatalogPage(page);
            }}
            disabled={catalogLoading || busy}
            previousLabel={t.common.previous}
            nextLabel={t.common.next}
            summary={t.common.pagination}
          />
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
          confirmDisabled={loading || Boolean(error)}
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
