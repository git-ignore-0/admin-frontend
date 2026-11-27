"use client";

import { Alert, Button, Stack, Text } from "@mantine/core";
import { CancelledError, skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FarmSupplyForm } from "@/components/farm-bulk-supply-form";
import { ListState } from "@/components/list-state";
import { PageHeading } from "@/components/page-heading";
import { RecoveryAlert } from "@/components/recovery-alert";
import { useToast } from "@/components/toast-provider";
import { requestErrorMessage } from "@/lib/client-error";
import { emptyFarmBulkSupplyDraft, type FarmBulkSupplyDraft } from "@/lib/farm-bulk-draft";
import {
  captureFarmDetail,
  farmDetailNeedsRead,
  farmDetailRead,
  shareFarmDetail,
} from "@/lib/farm-detail-snapshot";
import { farmHref, normalizeFarmSupplySearch } from "@/lib/farm-navigation";
import {
  farmAccess,
  farmAccessDenied,
  farmBulkDraftKey,
  farmBulkBlocksWrite,
  farmDetailKey,
  farmNotFound,
  farmSupplyKey,
  isFarmGone,
  retireFarmAccess,
  retryFarmAccess,
  useFarmAccess,
} from "@/lib/farm-query";
import { getFarm, getFarmProduct, listFarmProducts, type FarmBulkIntent } from "@/lib/farms-api";
import { farmsCopy } from "@/lib/farms-copy";
import type { FarmProduct } from "@/lib/types";
import { useFarmBulkWrite } from "@/lib/use-farm-bulk-write";

export function FarmBulkSupply({ farmId }: { farmId: string }) {
  const { revision } = useFarmAccess();
  return <BulkSupplyScreen key={`${farmId}:${revision}`} farmId={farmId} />;
}

function BulkSupplyScreen({ farmId }: { farmId: string }) {
  const { locale, t } = useAdminI18n();
  const c = farmsCopy(locale);
  const vi = locale === "vi";
  const title = t.breadcrumb.addFarmSupply;
  const client = useQueryClient();
  const currentSession = useIsAdminQueryScopeCurrent();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const access = useFarmAccess();
  const path = farmHref(null, { id: farmId, bulk: true });
  const listHref = farmHref(params);
  const returnHref = farmHref(params, { id: farmId, tab: "products" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const draftKey = farmBulkDraftKey(farmId);
  const { data: cachedDraft } = useQuery<FarmBulkSupplyDraft>({
    queryKey: draftKey,
    queryFn: skipToken,
    gcTime: Infinity,
  });
  const [emptyDraft] = useState(emptyFarmBulkSupplyDraft);
  const draft = cachedDraft ?? emptyDraft;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [review, setReview] = useState<Record<string, FarmProduct | null> | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const reviewRequest = useRef<AbortController | null>(null);
  useEffect(() => () => reviewRequest.current?.abort(), []);

  const usable = currentSession() && !access.error && !isFarmGone(client, farmId);
  const farmQuery = useQuery({
    queryKey: farmDetailKey(farmId),
    queryFn: async ({ signal }) => {
      const before = captureFarmDetail(client, farmId);
      const row = await getFarm(farmId, signal);
      if (signal.aborted || !currentSession() || isFarmGone(client, farmId))
        throw new CancelledError();
      return farmDetailRead(row, before);
    },
    enabled: usable,
    structuralSharing: shareFarmDetail,
    refetchOnMount: (query) => farmDetailNeedsRead(query.state),
  });
  const snapshot =
    usable && !farmAccessDenied(farmQuery.error) && !farmNotFound(farmQuery.error)
      ? farmQuery.data
      : undefined;
  const products = useQuery({
    queryKey: [...farmSupplyKey(farmId), "eligible", "supplying", "active", search, page],
    queryFn: ({ signal }) =>
      listFarmProducts(
        farmId,
        {
          supplyStatus: "supplying",
          productStatus: "active",
          page,
          search,
        },
        signal,
      ),
    enabled: Boolean(snapshot),
  });
  const accessCause = [farmQuery.error, products.error].find(farmAccessDenied);
  const farm = accessCause ? undefined : snapshot;
  const missingFarm = farmNotFound(farmQuery.error);
  useEffect(() => {
    if (missingFarm && currentSession())
      client.removeQueries({ queryKey: farmBulkDraftKey(farmId), exact: true });
  }, [client, currentSession, farmId, missingFarm]);
  useEffect(() => {
    if (accessCause && currentSession()) retireFarmAccess(client, accessCause);
  }, [accessCause, client, currentSession]);
  const write = useFarmBulkWrite(farmId);
  const { confirmedIntent, acknowledgeSuccess } = write;
  const farmName = farm ? (vi ? farm.name_vi : farm.name_en) : undefined;
  const crumbs = useMemo(
    () => [
      { label: c.list, href: listHref },
      ...(farmName ? [{ label: farmName, href: returnHref }] : []),
      { label: title },
    ],
    [c.list, listHref, farmName, returnHref, title],
  );

  const lastPage = products.data
    ? Math.max(1, Math.ceil(products.data.meta.total / products.data.meta.page_size))
    : page;
  useEffect(() => {
    if (!products.error && page > lastPage) setPage(lastPage);
  }, [lastPage, page, products.error]);

  useEffect(() => {
    if (!confirmedIntent || !currentSession() || access.error) return;
    acknowledgeSuccess();
  }, [confirmedIntent, acknowledgeSuccess, currentSession, access.error]);

  function saved(intent: FarmBulkIntent) {
    toast(
      vi
        ? `Đã bổ sung nguồn cung cho ${intent.items.length} sản phẩm.`
        : `Supply added for ${intent.items.length} products.`,
    );
    router.replace(returnHref);
  }

  async function inspectConflict() {
    const failure = write.failure;
    if (failure?.kind !== "conflict" || reviewRequest.current || !usable) return;
    const revision = farmAccess(client).revision;
    const controller = new AbortController();
    reviewRequest.current = controller;
    setReviewing(true);
    setReview(null);
    setReviewError("");
    const current = () =>
      !controller.signal.aborted &&
      currentSession() &&
      farmAccess(client).revision === revision &&
      !farmAccess(client).error;
    const targets = Object.keys(failure.itemCodes);
    const ids = targets.length ? targets : failure.intent.items.map(({ product_id }) => product_id);
    try {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const source = await getFarmProduct(farmId, id, controller.signal);
            return [
              id,
              source.supply_status === "supplying" && source.product_status === "active"
                ? source
                : null,
            ] as const;
          } catch (cause) {
            if (farmNotFound(cause)) return [id, null] as const;
            throw cause;
          }
        }),
      );
      if (current()) setReview(Object.fromEntries(entries));
    } catch (cause) {
      if (current() && farmAccessDenied(cause)) retireFarmAccess(client, cause);
      else if (current()) setReviewError(requestErrorMessage(cause, t));
    } finally {
      reviewRequest.current = null;
      if (current()) setReviewing(false);
    }
  }

  function editDraft(next: FarmBulkSupplyDraft) {
    const currentAccess = farmAccess(client);
    if (
      !usable ||
      !currentSession() ||
      accessCause ||
      missingFarm ||
      currentAccess.error ||
      currentAccess.revision !== access.revision ||
      isFarmGone(client, farmId) ||
      write.locked ||
      confirmedIntent ||
      reviewing ||
      farmBulkBlocksWrite(client, farmId)
    )
      return;
    client.setQueryData(draftKey, next);
    if (write.failure?.kind === "rejected") write.resetFailure();
  }

  function applyReview() {
    if (!review || reviewRequest.current || reviewing) return;
    const items = { ...draft.items };
    for (const [id, source] of Object.entries(review)) {
      if (!source && items[id]) return;
      if (source && items[id]) items[id] = { ...items[id], product: source };
    }
    editDraft({ ...draft, items });
    setReview(null);
    write.resetFailure();
  }

  function discard() {
    if (write.locked || farmBulkBlocksWrite(client, farmId)) return;
    client.removeQueries({ queryKey: draftKey, exact: true });
    write.resetFailure();
    router.replace(returnHref);
  }

  function cancel() {
    if (write.locked || farmBulkBlocksWrite(client, farmId)) return;
    const current = client.getQueryData<FarmBulkSupplyDraft>(draftKey) ?? emptyDraft;
    if (
      Object.keys(current.items).length ||
      current.start_date !== emptyDraft.start_date ||
      current.end_date !== emptyDraft.end_date
    )
      setConfirmDiscard(true);
    else discard();
  }

  const failure = write.failure;
  const itemErrors: Record<string, string> = {};
  for (const [id, message] of Object.entries(failure?.itemErrors ?? {})) {
    if (message) itemErrors[id] = message;
  }
  for (const [id, code] of Object.entries(failure?.itemCodes ?? {})) {
    if (
      code === "farm_product_removed" ||
      code === "product_not_selling" ||
      code === "farm_product_changed"
    ) {
      itemErrors[id] = vi
        ? "Nguồn cung không còn đủ điều kiện."
        : "This supply source is no longer eligible.";
    } else {
      itemErrors[id] = vi
        ? "Nguồn cung đã thay đổi. Hãy kiểm tra lại."
        : "Supply has changed. Review the latest source.";
    }
  }
  const data = products.data;
  const detailError = access.error ?? accessCause ?? farmQuery.error;
  const recovery =
    failure?.kind === "unknown" ? (
      <Stack gap="xs">
        <RecoveryAlert
          message={
            failure.receiptNotFound
              ? vi
                ? "Chưa tìm thấy biên nhận. Giao dịch vẫn có thể đã được lưu."
                : "No receipt was found yet. The submission may still have been saved."
              : vi
                ? "Chưa xác định kết quả. Nguồn cung có thể đã được lưu."
                : "The outcome is unknown. Supply may have been saved."
          }
          retryLabel={vi ? "Kiểm tra biên nhận" : "Check receipt"}
          onRetry={() => write.recover(saved)}
          loading={write.checking}
        />
        <Button
          type="button"
          variant="default"
          disabled={write.checking || write.pending || write.blocked}
          onClick={() => write.retry(saved)}
        >
          {vi ? "Gửi lại giao dịch này" : "Resubmit this intent"}
        </Button>
      </Stack>
    ) : failure?.kind === "idempotency_conflict" ? (
      <RecoveryAlert
        message={
          vi
            ? "Mã giao dịch đã gắn với nội dung khác. Kiểm tra nguồn cung trước khi bắt đầu giao dịch mới."
            : "This key belongs to a different intent. Check the supply before starting a new submission."
        }
        retryLabel={vi ? "Đã kiểm tra, tiếp tục chỉnh sửa" : "Reviewed, return to editing"}
        onRetry={write.resetFailure}
      />
    ) : failure?.kind === "conflict" ? (
      <Stack gap="xs">
        <RecoveryAlert
          message={
            vi
              ? "Nguồn cung đã thay đổi. Đọc lại và kiểm tra quy cách trước khi lưu."
              : "Supply has changed. Read the latest source and review its sale unit before saving."
          }
          retryLabel={vi ? "Đọc lại nguồn cung" : "Read latest supply"}
          onRetry={() => {
            void inspectConflict();
          }}
          loading={reviewing}
        />
        {reviewError && (
          <Text c="red" size="sm" role="alert">
            {reviewError}
          </Text>
        )}
        {review && (
          <Stack gap="xs">
            {Object.entries(review).map(([id, latest]) => {
              const previous = draft.items[id]?.product;
              const name = previous ? (vi ? previous.name_vi : previous.name_en) : id;
              return (
                <Text key={id} size="sm">
                  {name} ·{" "}
                  {latest
                    ? `${latest.unit_size} ${vi ? latest.unit_label_vi : latest.unit_label_en}`
                    : vi
                      ? "Không còn đủ điều kiện. Hãy bỏ sản phẩm này."
                      : "No longer eligible. Remove this product."}
                </Text>
              );
            })}
            <Button
              type="button"
              variant="default"
              disabled={Object.entries(review).some(
                ([id, source]) => !source && Boolean(draft.items[id]),
              )}
              onClick={applyReview}
            >
              {vi ? "Dùng thông tin đã kiểm tra" : "Use reviewed supply"}
            </Button>
          </Stack>
        )}
      </Stack>
    ) : failure ? (
      <Alert color="danger" role="alert">
        {requestErrorMessage(failure.cause, t)}
      </Alert>
    ) : null;

  if (!currentSession()) return null;
  return (
    <>
      <AdminBreadcrumbForRoute pathname={path} search={params.toString()} items={crumbs} />
      <PageHeading title={title} visuallyHiddenTitle />
      {!farm || detailError ? (
        <ListState
          empty={vi ? "Không tìm thấy trang trại" : "Farm not found"}
          error={detailError ? requestErrorMessage(detailError, t) : ""}
          hasData={false}
          isEmpty={!farm}
          loading={farmQuery.isFetching && !detailError}
          loadingLabel={vi ? "Đang tải trang trại" : "Loading farm"}
          retryLabel={vi ? "Thử lại" : "Try again"}
          onRetry={() => {
            if (access.error) retryFarmAccess(client);
            else void farmQuery.refetch();
          }}
        />
      ) : (
        <FarmSupplyForm
          locale={locale}
          draft={draft}
          onDraftChange={editDraft}
          products={products.error && !data ? undefined : data?.data}
          loading={products.isPending}
          refreshing={products.isFetching && !products.isPending}
          error={products.error ? requestErrorMessage(products.error, t) : undefined}
          onRetry={() => {
            void products.refetch();
          }}
          search={search}
          onSearch={(value) => {
            const normalized = normalizeFarmSupplySearch(value);
            if (normalized === search && page === 1) void products.refetch();
            else {
              setSearch(normalized);
              setPage(1);
            }
          }}
          pagination={
            data && {
              page,
              pageSize: data.meta.page_size,
              total: data.meta.total,
              onChange: setPage,
            }
          }
          locked={write.locked || reviewing}
          submitDisabled={
            write.blocked ||
            failure?.kind === "conflict" ||
            Boolean(products.error) ||
            products.isPending
          }
          cancelDisabled={write.locked}
          submitting={write.pending}
          errors={(failure && { ...failure.fieldErrors, items: itemErrors }) || undefined}
          review={recovery}
          onSubmit={(input) => {
            if (write.locked || write.blocked || failure?.kind === "conflict" || products.error)
              return;
            write.submit(input, saved);
          }}
          onCancel={cancel}
        />
      )}
      {confirmDiscard && usable && !accessCause && (
        <ConfirmationDialog
          title={vi ? "Bỏ bản nhập nguồn cung?" : "Discard supply draft?"}
          cancelLabel={vi ? "Tiếp tục chỉnh sửa" : "Keep editing"}
          confirmLabel={vi ? "Bỏ bản nhập" : "Discard draft"}
          busyLabel={vi ? "Đang hủy" : "Discarding"}
          busy={false}
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={discard}
        >
          <Text>
            {vi
              ? "Số lượng và thời gian chưa lưu sẽ bị xóa."
              : "Unsaved quantities and dates will be removed."}
          </Text>
        </ConfirmationDialog>
      )}
    </>
  );
}
