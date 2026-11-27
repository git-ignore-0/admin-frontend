"use client";

import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { FarmSupplyForm } from "@/components/farm-bulk-supply-form";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import {
  apiErrorContext,
  apiErrorFields,
  isApiObject,
  isProtectedDataError,
  isUncertainMutationError,
  requestErrorMessage,
  type ClientApiError,
} from "@/lib/client-error";
import {
  farmerProducts,
  submitFarmerRequest,
  type FarmerProduct,
  type SupplySubmitPayload,
} from "@/lib/farm-supply-request-api";
import {
  emptyFarmSupplyDraft,
  farmSupplyProductName,
  farmSupplyProductUnit,
  type FarmSupplyDraft,
  type FarmSupplyInput,
} from "@/lib/farm-supply-form";
import { farmerSupplyCopy } from "@/lib/farmer-supply-copy";
import {
  FarmerCatalogChanged,
  newCatalogScan,
  sameFarmerProduct,
  scanFarmerProducts,
  type CatalogScan,
} from "@/lib/farmer-supply-recovery";
import { formatDecimalInput } from "@/lib/numeric-input";

type Props = {
  activeTab: boolean;
  activeFarm: boolean;
  token: string;
  signal: AbortSignal;
  onScopeError: (cause: unknown) => void;
  onFarmInactive: () => void;
  onViewRequest: (id: string) => void;
};

type Review = {
  previous: FarmerProduct;
  current?: FarmerProduct;
  page?: number;
};
type Reconciliation = {
  originals: FarmerProduct[];
  forceReview: string | undefined;
  scan: CatalogScan;
};
type FieldErrors = { start_date?: string; end_date?: string; items?: Record<string, string> };

const MAX_FARMER_QUANTITY = 10_000;

const productConflicts = new Set([
  "product_identity_changed",
  "farm_product_identity_changed",
  "farm_product_generation_changed",
  "farm_product_changed",
  "farm_product_removed",
  "product_not_selling",
]);

function toSupplyPayload(input: FarmSupplyInput<FarmerProduct>): SupplySubmitPayload {
  return {
    start_date: input.start_date,
    end_date: input.end_date,
    idempotency_key: crypto.randomUUID(),
    items: input.items.map(({ product, quantity_units }) => ({
      product_id: product.product_id,
      expected_link_id: product.source_id,
      expected_generation: product.supply_generation,
      expected_product_identity: product.product_identity,
      quantity_units,
    })),
  };
}

export function FarmerSupplyEntry({
  activeTab,
  activeFarm,
  token,
  signal,
  onScopeError,
  onFarmInactive,
  onViewRequest,
}: Props) {
  const { locale, t } = useAdminI18n();
  const c = farmerSupplyCopy[locale];
  const toast = useToast();
  const client = useQueryClient();
  const [draft, setDraft] = useState(() => emptyFarmSupplyDraft<FarmerProduct>());
  const [query, setQuery] = useState({ search: "", page: 1 });
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [unknown, setUnknown] = useState<SupplySubmitPayload>();
  const [submitted, setSubmitted] = useState<{ id: string; code: string }>();
  const [error, setError] = useState<unknown>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const [checks, setChecks] = useState<Reconciliation>();
  const [checkError, setCheckError] = useState<unknown>(null);
  const [review, setReview] = useState<Review[]>([]);
  const busyRef = useRef(false);
  const checkingRef = useRef(false);

  const products = useQuery({
    queryKey: ["products", query],
    queryFn: ({ signal: querySignal }) =>
      farmerProducts(token, query, querySignal).catch((cause: unknown) => {
        onScopeError(cause);
        throw cause;
      }),
    enabled: activeTab && activeFarm,
  });
  const meta = products.data?.meta;
  useEffect(() => {
    if (meta) {
      const last = Math.max(1, Math.ceil(meta.total / meta.page_size));
      if (query.page > last) setQuery((current) => ({ ...current, page: last }));
    }
  }, [meta, query.page]);

  async function reconcile(state: Reconciliation) {
    if (checkingRef.current || signal.aborted) return;
    checkingRef.current = true;
    setChecking(true);
    setCheckError(null);
    try {
      const complete = await scanFarmerProducts(
        token,
        new Set(state.originals.map((product) => product.product_id)),
        state.scan,
        signal,
      );
      if (signal.aborted || !complete) return;
      const affected = state.originals.flatMap<Review>((previous) => {
        const match = state.scan.matches.get(previous.product_id);
        if (
          match &&
          previous.product_id !== state.forceReview &&
          sameFarmerProduct(previous, match.product)
        )
          return [];
        return [{ previous, current: match?.product, page: match?.page }];
      });
      setReview(affected);
      setDraft((current) => {
        const items = { ...current.items };
        for (const { previous } of affected) delete items[previous.product_id];
        return { ...current, items };
      });
      await client.invalidateQueries({ queryKey: ["products"] });
      if (!signal.aborted) setChecks(undefined);
    } catch (cause) {
      if (signal.aborted) return;
      onScopeError(cause);
      if (signal.aborted) return;
      if (cause instanceof FarmerCatalogChanged) {
        setChecks({ ...state, scan: newCatalogScan() });
      }
      setCheckError(cause);
    } finally {
      checkingRef.current = false;
      if (!signal.aborted) setChecking(false);
    }
  }

  async function send(intent: SupplySubmitPayload) {
    if (busyRef.current || signal.aborted) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setFields({});
    setSubmitted(undefined);
    try {
      const { data } = await submitFarmerRequest(token, intent, signal);
      if (signal.aborted) return;
      setUnknown(undefined);
      setReview([]);
      setChecks(undefined);
      setCheckError(null);
      setDraft(emptyFarmSupplyDraft<FarmerProduct>());
      setSubmitted(data);
      client.setQueryData(["requests", "detail", data.id], data);
      void client.invalidateQueries({ queryKey: ["requests", "list"] });
      toast(c.submitted);
    } catch (cause) {
      if (signal.aborted) return;
      onScopeError(cause);
      if (signal.aborted || isProtectedDataError(cause)) return;

      const status = cause instanceof Error ? (cause as ClientApiError).status : undefined;
      const code = cause instanceof Error ? cause.message : "";
      if (
        status === 429 ||
        isUncertainMutationError(cause) ||
        (unknown && ["csrf_rejected", "request_failed", "idempotency_conflict"].includes(code))
      ) {
        setUnknown(intent);
        return;
      }

      setUnknown(undefined);
      if (status === 409 && productConflicts.has(code)) {
        const context = apiErrorContext<unknown>(cause);
        const flagged =
          isApiObject(context) && typeof context.item_index === "number"
            ? intent.items[context.item_index]
            : undefined;
        const state: Reconciliation = {
          originals: intent.items.flatMap(({ product_id }) => {
            const entry = draft.items[product_id];
            return entry ? [entry.product] : [];
          }),
          forceReview:
            flagged?.product_id === (isApiObject(context) && context.product_id)
              ? flagged?.product_id
              : undefined,
          scan: newCatalogScan(),
        };
        setChecks(state);
        await reconcile(state);
        return;
      }
      if (code === "farm_inactive") onFarmInactive();
      const problems = apiErrorFields(cause);
      const itemErrors = isApiObject(problems.items)
        ? Object.entries(problems.items).flatMap(([index, fields]) => {
            const item = intent.items[Number(index)];
            return item && isApiObject(fields) && fields.quantity_units
              ? [[item.product_id, c.badQuantity]]
              : [];
          })
        : [];
      setFields({
        start_date: problems.start_date ? c.badStartDate : undefined,
        end_date: problems.end_date ? c.badEndDate : undefined,
        items: Object.fromEntries(itemErrors),
      });
      setError(cause);
    } finally {
      busyRef.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }

  function changeDraft(next: FarmSupplyDraft<FarmerProduct>) {
    if (busyRef.current || checking || checks || unknown || signal.aborted) return;
    const items = { ...next.items };
    const outstanding = review.filter(({ previous, current }) => {
      if (!current) return true;
      const entry = items[previous.product_id];
      if (!entry?.quantity || entry.rejectedEdit) return true;
      // A failed refresh can leave an old row visible. Keep it out of the draft
      // until the farmer enters a quantity against freshly read product information.
      if (!sameFarmerProduct(entry.product, current)) {
        delete items[previous.product_id];
        return true;
      }
      return false;
    });
    setReview(outstanding);
    setFields({});
    setError(null);
    setDraft({ ...next, items });
  }

  const notices = (unknown || checks || review.length > 0 || error != null || submitted) && (
    <Stack gap="sm">
      {unknown && (
        <RecoveryAlert
          message={c.unknown}
          retryLabel={c.retryIntent}
          loading={busy}
          onRetry={() => void send(unknown)}
        />
      )}
      {checks && (
        <RecoveryAlert
          message={
            checkError instanceof FarmerCatalogChanged
              ? c.catalogChanged
              : checkError
                ? requestErrorMessage(checkError, t)
                : checking
                  ? c.checking
                  : c.checkNeeded
          }
          retryLabel={checkError ? c.retryCheck : c.continueCheck}
          loading={checking}
          onRetry={() => void reconcile(checks)}
        />
      )}
      {!!review.length && (
        <Alert color="warning" title={c.changedTitle}>
          <Stack gap="sm">
            <Text>{c.changed}</Text>
            {review.map(({ previous, current, page }) => {
              const name = farmSupplyProductName(current ?? previous, locale);
              const unitText = (product: FarmerProduct, language = locale) =>
                `${formatDecimalInput(product.unit_size)} ${farmSupplyProductUnit(product, language)}`;
              const previousUnit = unitText(previous);
              const currentUnit = current && unitText(current);
              const otherLocale = locale === "vi" ? "en" : "vi";
              const changedOtherLabel =
                current &&
                currentUnit === previousUnit &&
                unitText(previous, otherLocale) !== unitText(current, otherLocale);
              const compare = (field: string, before: string, after: string) =>
                c.compare
                  .replace("{field}", field)
                  .replace("{previous}", before)
                  .replace("{current}", after);
              return (
                <Stack key={previous.product_id} gap={4}>
                  <Text fw={600}>{name}</Text>
                  {!current ? (
                    <Text>{c.unavailable}</Text>
                  ) : (
                    <>
                      {current.sku !== previous.sku && (
                        <Text>{compare(c.sku, previous.sku, current.sku)}</Text>
                      )}
                      {currentUnit !== previousUnit && currentUnit && (
                        <Text>{compare(c.unit, previousUnit, currentUnit)}</Text>
                      )}
                      {changedOtherLabel && (
                        <Text>
                          {compare(
                            `${c.unit} (${otherLocale === "vi" ? "Tiếng Việt" : "English"})`,
                            unitText(previous, otherLocale),
                            unitText(current, otherLocale),
                          )}
                        </Text>
                      )}
                      {(current.source_id !== previous.source_id ||
                        current.supply_generation !== previous.supply_generation) && (
                        <Text>{c.changedSource}</Text>
                      )}
                      <Text size="sm">
                        {current.sku} · {currentUnit}
                      </Text>
                      <Group gap="xs">
                        <Button
                          variant="default"
                          type="button"
                          onClick={() => {
                            setQuery({ search: "", page: page ?? 1 });
                            void client.invalidateQueries({ queryKey: ["products"] });
                          }}
                        >
                          {c.openProduct.replace("{name}", name)}
                        </Button>
                        <Button
                          variant="subtle"
                          type="button"
                          onClick={() =>
                            setReview((current) =>
                              current.filter(
                                (item) => item.previous.product_id !== previous.product_id,
                              ),
                            )
                          }
                        >
                          {c.omitProduct.replace("{name}", name)}
                        </Button>
                      </Group>
                    </>
                  )}
                </Stack>
              );
            })}
          </Stack>
        </Alert>
      )}
      {error != null && (
        <Alert color="danger" role="alert">
          {error instanceof Error && error.message === "farm_inactive"
            ? c.inactive
            : requestErrorMessage(error, t)}
        </Alert>
      )}
      {submitted && (
        <Alert color="success" role="status">
          <Group justify="space-between">
            <Text>{c.submittedCode.replace("{code}", submitted.code)}</Text>
            <Button variant="default" type="button" onClick={() => onViewRequest(submitted.id)}>
              {c.requestDetail}
            </Button>
          </Group>
        </Alert>
      )}
    </Stack>
  );

  if (!activeFarm) return notices;
  return (
    <Stack gap="md">
      {notices}
      <FarmSupplyForm
        locale={locale}
        draft={draft}
        onDraftChange={changeDraft}
        products={products.data?.data}
        showSaleUnitColumn
        loading={products.isPending}
        refreshing={products.isFetching && !products.isPending}
        error={products.error ? requestErrorMessage(products.error, t) : ""}
        onRetry={() => void products.refetch()}
        search={query.search}
        onSearch={(search) => setQuery({ search, page: 1 })}
        pagination={
          meta && {
            page: query.page,
            pageSize: meta.page_size,
            total: meta.total,
            onChange: (page) => setQuery((current) => ({ ...current, page })),
          }
        }
        locked={Boolean(unknown || checks) || (products.isFetching && review.length > 0)}
        submitting={busy}
        submitDisabled={review.some(({ current }) => !!current)}
        submitLabel={c.send}
        quantityLabel={c.quantity}
        quantityMax={MAX_FARMER_QUANTITY}
        emptyLabel={c.noProducts}
        noResultsLabel={c.noMatchingProducts}
        errors={fields}
        onSubmit={(input) => {
          if (
            activeFarm &&
            !busyRef.current &&
            !unknown &&
            !checks &&
            !review.some(({ current }) => !!current)
          )
            void send(toSupplyPayload(input));
        }}
      />
    </Stack>
  );
}
