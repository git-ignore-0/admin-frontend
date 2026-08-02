"use client";

import Image from "next/image";
import Link from "next/link";
import { DragEvent, useCallback, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ListState } from "@/components/list-state";
import { ListResultSummary } from "@/components/list-toolbar";
import { Pagination } from "@/components/pagination";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import type { PaginationMeta, Reward } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

export function RewardList() {
  const { locale, t } = useAdminI18n();
  const [reorderError, setReorderError] = useState("");
  const [reordering, setReordering] = useState(false);
  const [draggedId, setDraggedId] = useState("");
  const fetchPage = useCallback(
    (page: number) => apiEnvelope<Reward[], PaginationMeta>(`admin/rewards?page=${page}`),
    [],
  );
  const getErrorMessage = useCallback((caught: unknown) => requestErrorMessage(caught, t), [t]);
  const { error, items, loading, meta, page, reload, replaceData, setPage } = usePaginatedList({
    fetchPage,
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
      replaceData(payload.data, payload.meta ?? null);
    } catch (caught) {
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
            <p className="error-box" role="alert">
              {reorderError}
            </p>
          )}
          <div className="table-wrap admin-list-wrap">
            <table className="table admin-list-table reward-list-table">
              <thead>
                <tr>
                  <th aria-label={t.rewards.order} />
                  <th>{t.rewards.reward}</th>
                  <th>{t.rewards.pointCost}</th>
                  <th>{t.rewards.statusLabel}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((reward, index) => {
                  const translation =
                    reward.translations.find((item) => item.locale === locale) ??
                    reward.translations[0];
                  const name = translation?.name || t.rewards.untitled;
                  return (
                    <tr
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
                      <td data-label={t.rewards.order}>
                        <div className="reward-order-controls">
                          <button
                            aria-label={t.rewards.drag.replace("{name}", name)}
                            className="reward-drag-handle"
                            disabled={busy}
                            draggable={!busy}
                            onDragEnd={() => setDraggedId("")}
                            onDragStart={(event) => startDragging(event, reward.id)}
                            type="button"
                          >
                            <span aria-hidden="true">⠿</span>
                          </button>
                          <div className="reward-order-buttons">
                            <button
                              aria-label={t.rewards.moveUp.replace("{name}", name)}
                              disabled={busy || index === 0}
                              onClick={() => void moveReward(reward.id, items[index - 1]?.id)}
                              type="button"
                            >
                              <span aria-hidden="true">↑</span>
                            </button>
                            <button
                              aria-label={t.rewards.moveDown.replace("{name}", name)}
                              disabled={busy || index === items.length - 1}
                              onClick={() => void moveReward(reward.id, items[index + 1]?.id)}
                              type="button"
                            >
                              <span aria-hidden="true">↓</span>
                            </button>
                          </div>
                        </div>
                      </td>
                      <td data-label={t.rewards.reward}>
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
                            <Link
                              aria-label={`${t.rewards.edit}: ${name}`}
                              className="admin-list-primary-link"
                              href={`/rewards/${reward.id}`}
                            >
                              {name}
                            </Link>
                            <small className="table-secondary">
                              {translation?.short_description || t.rewards.noDescription}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td data-label={t.rewards.pointCost}>
                        <strong>{reward.point_cost}</strong>
                      </td>
                      <td data-label={t.rewards.statusLabel}>
                        <span className={`badge ${reward.is_active ? "" : "warm"}`}>
                          {reward.is_active ? t.rewards.active : t.rewards.inactive}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
