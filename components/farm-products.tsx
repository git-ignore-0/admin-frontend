"use client";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Menu,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconDots } from "@tabler/icons-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FarmStockBatches } from "@/components/farm-stock-batches";
import { ListState } from "@/components/list-state";
import { DataState, Status } from "@/components/nfv-controls";
import { Pagination } from "@/components/pagination";
import { ProductLifecycleStatus } from "@/components/product-lifecycle-status";
import { RecoveryAlert } from "@/components/recovery-alert";
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
  stockBatchDateDraft,
  stockBatchRangeForPreset,
  validateStockBatchInput,
  type StockBatchDraft,
  type StockBatchFieldErrors,
  type StockBatchPreset,
} from "@/lib/farm-stock";
import { formatDecimalInput } from "@/lib/numeric-input";
import type { AvailableFarmProduct, FarmProduct, PaginationMeta, StoreProduct } from "@/lib/types";
import classes from "./farm-inventory.module.css";

function firstBatchDraft(): StockBatchDraft {
  return { ...stockBatchDateDraft(stockBatchRangeForPreset("week")), quantity: "" };
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
  const [linkConflict, setLinkConflict] = useState<"protectedLink" | "changedLink" | null>(null);
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
      setLinkConflict(null);
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

  function recoverLinkConflict(caught: unknown) {
    if (!(caught instanceof Error)) return false;
    const { message, status } = caught as ClientApiError;
    const hasHistory = message === "farm_product_has_supply";
    if (!hasHistory && message !== "farm_product_changed" && status !== 404) return false;
    setRemoveTarget(null);
    setLinks(null);
    setMobileDetailOpen(false);
    setLinkConflict(hasHistory ? "protectedLink" : "changedLink");
    reloadLinks();
    onInventoryChanged?.();
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
    setLinkConflict(null);
    setActionError("");
    try {
      const updated = await setFarmProductActive(farmId, row.product_id, !row.is_active);
      if (!mounted.current || accessLost.current) return;
      setLinks((current) => current?.map((item) => (item.id === row.id ? updated : item)) ?? null);
      onInventoryChanged?.();
    } catch (caught) {
      if (!mounted.current || accessLost.current || retireIfDenied(caught)) return;
      if (recoverLinkConflict(caught)) return;
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
    setLinkConflict(null);
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
      if (recoverLinkConflict(caught)) return;
      if (mutationMayHaveSucceeded(caught)) reloadLinks();
      setRemoveError(requestErrorMessage(caught, t));
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
    <Stack component="section" className={classes.inventory} gap="md" aria-busy={loading}>
      <Group component="header" align="flex-start" justify="space-between" gap="sm">
        <Stack gap="xs" miw={0}>
          <Title order={2}>{c.products}</Title>
          <Text size="sm" c="dimmed">
            {c.selectProductHint}
          </Text>
        </Stack>
        <Button
          disabled={loading || busy || Boolean(error)}
          onClick={() => {
            setActionError("");
            setLinkConflict(null);
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
      </Group>
      {!error && (
        <SimpleGrid
          type="container"
          cols={{ base: 1, "34rem": 2 }}
          spacing="sm"
          role="group"
          aria-label={c.availableStock}
        >
          <Paper p="sm">
            <Text fw={600}>
              {c.productsWithAvailableStock.replace("{count}", String(inStockCount))}
            </Text>
          </Paper>
          <Paper p="sm">
            <Text fw={600}>
              {c.productsWithoutAvailableStock.replace("{count}", String(outOfStockCount))}
            </Text>
          </Paper>
        </SimpleGrid>
      )}
      {linkConflict && (
        <Alert color="danger" role="alert">
          {c[linkConflict]}
        </Alert>
      )}
      <Box className={classes.panes} data-detail-open={mobileDetailOpen || undefined}>
        <Paper className={classes.listPane} p="md" miw={0}>
          <Stack gap="md">
            <Box component="form" role="search" aria-label={c.searchLinked} onSubmit={searchLinks}>
              <Group align="end" gap="xs">
                <TextInput
                  flex="1 1 12rem"
                  miw={0}
                  label={c.searchLinked}
                  type="search"
                  placeholder={c.searchLinked}
                  value={linkedQuery}
                  onChange={(event) => setLinkedQuery(event.currentTarget.value)}
                />
                <Button variant="default" type="submit" disabled={loading}>
                  {c.searchButton}
                </Button>
              </Group>
            </Box>
            <ListState
              embedded
              empty={c.linkedEmpty}
              noResults={linkedSearch ? c.noLinkedMatch : undefined}
              error={error}
              hasData={!loading && !error && visibleLinks.length > 0}
              isEmpty={links?.length === 0}
              loading={loading}
              loadingLabel={c.loading}
              onRetry={reloadLinks}
              retryLabel={t.common.retry}
            />
            {!loading && !error && visibleLinks.length > 0 && (
              <Stack gap="xs">
                {visibleLinks.map((row) => {
                  const name = locale === "vi" ? row.name_vi : row.name_en;
                  const unit = `${formatDecimalInput(row.unit_size)} ${locale === "vi" ? row.unit_label_vi : row.unit_label_en}`;
                  const supplyLabel = row.is_active ? c.productActive : c.productInactive;
                  const lifecycleLabels = {
                    draft: t.storeCatalog.productDraft,
                    active: t.storeCatalog.selling,
                    discontinued: t.storeCatalog.discontinued,
                  };
                  const stockLabel = c.availableUnits.replace(
                    "{count}",
                    String(row.available_quantity),
                  );
                  return (
                    <Button
                      ref={(node) => {
                        if (node) productButtonRefs.current.set(row.product_id, node);
                        else productButtonRefs.current.delete(row.product_id);
                      }}
                      classNames={{ root: classes.productRow, label: classes.productLabel }}
                      variant="default"
                      fullWidth
                      h="auto"
                      px="md"
                      py="sm"
                      type="button"
                      disabled={busy}
                      key={row.id}
                      aria-label={`${name}, ${lifecycleLabels[row.product_status]}, ${supplyLabel}, ${stockLabel}`}
                      aria-pressed={openProduct === row.product_id}
                      onClick={() => {
                        setActionError("");
                        setLinkConflict(null);
                        setOpenProduct(row.product_id);
                        setMobileDetailOpen(true);
                      }}
                    >
                      <Stack component="span" gap="xs">
                        <Stack component="span" gap={4}>
                          <Text component="strong" fw={600}>
                            {name}
                          </Text>
                          <Group component="span" gap="xs" c="dimmed">
                            <Text component="span" size="sm">
                              {row.sku}
                            </Text>
                            <Text component="span" size="sm">
                              {unit}
                            </Text>
                          </Group>
                        </Stack>
                        <Group component="span" gap="xs">
                          <ProductLifecycleStatus status={row.product_status} />
                          <Status
                            domain="farm-stock"
                            status={row.is_active ? "active" : "inactive"}
                            label={supplyLabel}
                          />
                        </Group>
                        <Text component="span" size="sm" c="dimmed">
                          {stockLabel}
                        </Text>
                      </Stack>
                    </Button>
                  );
                })}
              </Stack>
            )}
            {!loading && !error && linksMeta.total > linksMeta.page_size && (
              <>
                <Divider />
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
                  resultCountLabel={t.common.resultCount}
                  resultCountSingularLabel={t.common.resultCountSingular}
                />
              </>
            )}
          </Stack>
        </Paper>
        <Paper
          component="section"
          aria-label={selectedLink ? `${c.stockBatches} ${selectedLink.sku}` : undefined}
          className={classes.detailPane}
          miw={0}
          p="md"
        >
          <Stack gap="md">
            {actionError && !addOpen && (
              <Alert color="danger" role="alert">
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
                          color="danger"
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
          </Stack>
        </Paper>
      </Box>
      {addOpen && (
        <ConfirmationDialog
          title={c.addFromCatalog}
          size={640}
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
          <Text size="sm" c="dimmed">
            {c.addFromCatalogHint}
          </Text>
          <Box
            component="form"
            role="search"
            aria-label={c.productSearch}
            onSubmit={searchProducts}
          >
            <Group align="end" gap="xs">
              <TextInput
                flex="1 1 12rem"
                miw={0}
                label={c.productSearch}
                type="search"
                placeholder={c.productPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
              <Button variant="default" type="submit" disabled={busy || catalogLoading}>
                {c.searchButton}
              </Button>
            </Group>
          </Box>
          {catalogError && (
            <RecoveryAlert
              message={catalogError}
              retryLabel={t.common.retry}
              onRetry={reloadCatalog}
            />
          )}
          {detailError && (
            <RecoveryAlert
              message={detailError}
              retryLabel={t.common.retry}
              onRetry={reloadCatalog}
            />
          )}
          <Select
            role="combobox"
            label={c.productColumn}
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
            resultCountLabel={t.common.resultCount}
            resultCountSingularLabel={t.common.resultCountSingular}
          />
        </ConfirmationDialog>
      )}
      {removeTarget && (
        <ConfirmationDialog
          title={c.removeLink}
          size={400}
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
          <Text>{c.productRemovePrompt.replace("{sku}", removeTarget.sku)}</Text>
        </ConfirmationDialog>
      )}
    </Stack>
  );
}
