"use client";

import { Status } from "@/components/nfv-controls";

import { Button, Table, Alert } from "@mantine/core";

import Image from "next/image";
import Link from "next/link";
import { DragEvent, useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DataListRecordLink } from "@/components/data-list-record-link";
import { requirePaginatedList } from "@/lib/api-response";
import { ListState } from "@/components/list-state";
import { ListResultSummary } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { apiEnvelope } from "@/lib/client-api";
import { isProtectedDataError, requestErrorMessage } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import { requireReward } from "@/lib/rewards";
import type { PaginationMeta, Reward } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

export function RewardList() {
  const { locale, t } = useAdminI18n();
  const [reorderError, setReorderError] = useState("");
  const [reordering, setReordering] = useState(false);
  const [draggedId, setDraggedId] = useState("");
  const fetchPage = useCallback(
    (page: number, signal: AbortSignal) =>
      apiEnvelope<Reward[], PaginationMeta>(`admin/rewards?page=${page}`, { signal }),
    [],
  );
  const getErrorMessage = useCallback((caught: unknown) => requestErrorMessage(caught, t), [t]);
  const { error, items, loading, meta, page, reload, replaceData, retire, setPage } =
    usePaginatedList({
      fetchPage,
      validateRecord: requireReward,
      getErrorMessage,
    });
  const busy = loading || reordering;

  async function moveReward(sourceId: string, targetId?: string) {
    if (!items || !targetId || busy || sourceId === targetId) return;
    const sourceIndex = items.findIndex((item) => item.id === sourceId);
    const targetIndex = items.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const previous = items;
    const ordered = [...items];
    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved);
    replaceData(ordered);
    setReorderError("");
    setReordering(true);
    try {
      const payload = await apiEnvelope<Reward[], PaginationMeta>("admin/rewards/reorder", {
        method: "POST",
        body: JSON.stringify({ page, reward_ids: ordered.map((item) => item.id) }),
      });
      const { data, meta } = requirePaginatedList(payload, requireReward, page);
      replaceData(data, meta);
    } catch (caught) {
      if (isProtectedDataError(caught)) {
        retire(caught);
        return;
      }
      replaceData(previous);
      setReorderError(
        caught instanceof Error && caught.message === "reward_reorder_conflict"
          ? t.rewards.reorderConflict
          : requestErrorMessage(caught, t),
      );
    } finally {
      setDraggedId("");
      setReordering(false);
    }
  }

  function startDragging(event: DragEvent<HTMLButtonElement>, rewardId: string) {
    if (busy) {
      event.preventDefault();
      return;
    }
    setDraggedId(rewardId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", rewardId);
  }

  function changePage(nextPage: number) {
    if (busy) return;
    setDraggedId("");
    setReorderError("");
    setPage(nextPage);
  }

  function retry() {
    setReorderError("");
    reload();
  }

  return (
    <section aria-busy={busy} className="admin-list-section">
      {meta && (
        <div className="list-toolbar-row list-toolbar-summary-only">
          <ListResultSummary
            count={meta.total}
            label={t.common.resultCount}
            singularLabel={t.common.resultCountSingular}
          />
        </div>
      )}
      <ListState
        empty={t.rewards.empty}
        error={error}
        hasData={items !== null}
        isEmpty={items?.length === 0}
        loading={loading}
        loadingLabel={t.rewards.loading}
        onRetry={retry}
        retryLabel={t.common.retry}
      />
      {items && items.length > 0 && (
        <>
          <div className="reward-order-note">
            <p className="muted-copy">{t.rewards.reorderHelp}</p>
            {reordering && (
              <span aria-live="polite" className="reward-order-saving" role="status">
                {t.rewards.reordering}
              </span>
            )}
          </div>
          {reorderError && (
            <Alert color="red" role="alert">
              {reorderError}
            </Alert>
          )}
          <Table.ScrollContainer type="native" minWidth={0} className="table-wrap admin-list-wrap">
            <Table role="table" className="admin-list-table reward-list-table">
              <Table.Thead role="rowgroup">
                <Table.Tr role="row">
                  <Table.Th role="columnheader" aria-label={t.rewards.order} />
                  <Table.Th role="columnheader">{t.rewards.reward}</Table.Th>
                  <Table.Th role="columnheader">{t.rewards.pointCost}</Table.Th>
                  <Table.Th role="columnheader">{t.rewards.statusLabel}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody role="rowgroup">
                {items.map((reward, index) => {
                  const translation =
                    reward.translations.find((item) => item.locale === locale) ??
                    reward.translations[0];
                  const name = translation?.name || t.rewards.untitled;
                  return (
                    <Table.Tr
                      role="row"
                      className={draggedId === reward.id ? "is-dragging" : undefined}
                      key={reward.id}
                      onDragOver={(event) => {
                        if (!busy && draggedId && draggedId !== reward.id) {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceId = draggedId || event.dataTransfer.getData("text/plain");
                        void moveReward(sourceId, reward.id);
                      }}
                    >
                      <Table.Td role="cell" data-label={t.rewards.order}>
                        <div className="reward-order-controls">
                          <Button
                            variant="default"
                            aria-label={t.rewards.drag.replace("{name}", name)}
                            className="reward-drag-handle"
                            disabled={busy}
                            draggable={!busy}
                            onDragEnd={() => setDraggedId("")}
                            onDragStart={(event) => startDragging(event, reward.id)}
                            type="button"
                          >
                            <span aria-hidden="true">⠿</span>
                          </Button>
                          <div className="reward-order-buttons">
                            <Button
                              variant="default"
                              aria-label={t.rewards.moveUp.replace("{name}", name)}
                              disabled={busy || index === 0}
                              onClick={() => void moveReward(reward.id, items[index - 1]?.id)}
                              type="button"
                            >
                              <span aria-hidden="true">↑</span>
                            </Button>
                            <Button
                              variant="default"
                              aria-label={t.rewards.moveDown.replace("{name}", name)}
                              disabled={busy || index === items.length - 1}
                              onClick={() => void moveReward(reward.id, items[index + 1]?.id)}
                              type="button"
                            >
                              <span aria-hidden="true">↓</span>
                            </Button>
                          </div>
                        </div>
                      </Table.Td>
                      <Table.Td role="cell" data-label={t.rewards.reward}>
                        <div className="reward-cell">
                          <Image
                            alt=""
                            className="reward-thumbnail"
                            height={56}
                            src={mediaUrlForWidth(reward.image, 144)}
                            unoptimized
                            width={72}
                          />
                          <div>
                            <DataListRecordLink
                              component={Link}
                              aria-label={`${t.rewards.edit}: ${name}`}
                              href={`/rewards/${reward.id}`}
                            >
                              {name}
                            </DataListRecordLink>
                            <small className="table-secondary">
                              {translation?.short_description || t.rewards.noDescription}
                            </small>
                          </div>
                        </div>
                      </Table.Td>
                      <Table.Td role="cell" data-label={t.rewards.pointCost}>
                        <strong>{reward.point_cost}</strong>
                      </Table.Td>
                      <Table.Td role="cell" data-label={t.rewards.statusLabel}>
                        <Status
                          domain="availability"
                          status={reward.is_active ? "active" : "inactive"}
                          label={reward.is_active ? t.rewards.active : t.rewards.inactive}
                        />
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}
      {meta && (
        <Pagination
          disabled={busy}
          nextLabel={t.common.next}
          onPage={changePage}
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
