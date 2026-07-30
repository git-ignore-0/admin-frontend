"use client";

import Image from "next/image";
import Link from "next/link";
import { DragEvent, useCallback, useEffect, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { Pagination } from "@/components/pagination";
import { apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import type { PaginationMeta, Reward } from "@/lib/types";

export function RewardList() {
  const { locale, t } = useAdminI18n();
  const [items, setItems] = useState<Reward[] | null>(null);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [reorderError, setReorderError] = useState("");
  const [reordering, setReordering] = useState(false);
  const [draggedId, setDraggedId] = useState("");

  const load = useCallback(() => {
    setItems(null);
    setLoadError("");
    setReorderError("");
    apiEnvelope<Reward[], PaginationMeta>(`admin/rewards?page=${page}`)
      .then((payload) => {
        setItems(payload.data);
        setMeta(payload.meta ?? null);
      })
      .catch((caught) => setLoadError(requestErrorMessage(caught, t)));
  }, [page, t]);

  useEffect(load, [load]);

  async function moveReward(sourceId: string, targetId?: string) {
    if (!items || !targetId || reordering || sourceId === targetId) return;
    const sourceIndex = items.findIndex((item) => item.id === sourceId);
    const targetIndex = items.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const previous = items;
    const ordered = [...items];
    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved);
    setItems(ordered);
    setReorderError("");
    setReordering(true);
    try {
      const payload = await apiEnvelope<Reward[], PaginationMeta>("admin/rewards/reorder", {
        method: "POST",
        body: JSON.stringify({ page, reward_ids: ordered.map((item) => item.id) }),
      });
      setItems(payload.data);
      setMeta(payload.meta ?? null);
    } catch (caught) {
      setItems(previous);
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
    if (reordering) {
      event.preventDefault();
      return;
    }
    setDraggedId(rewardId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", rewardId);
  }

  if (loadError)
    return (
      <p className="error-box" role="alert">
        {loadError}
      </p>
    );
  if (!items) return <div className="panel">{t.rewards.loading}</div>;
  if (!items.length)
    return (
      <div className="empty">
        <p>{t.rewards.empty}</p>
        <Link className="button" href="/rewards/new">
          {t.rewards.createFirst}
        </Link>
      </div>
    );

  return (
    <section>
      <div className="reward-order-note">
        <p className="muted-copy">{t.rewards.reorderHelp}</p>
        {reordering && (
          <span aria-live="polite" className="reward-order-saving">
            {t.rewards.reordering}
          </span>
        )}
      </div>
      {reorderError && (
        <p className="error-box" role="alert">
          {reorderError}
        </p>
      )}
      <div className="table-wrap">
        <table className="table reward-table">
          <thead>
            <tr>
              <th aria-label={t.rewards.order} />
              <th>{t.rewards.reward}</th>
              <th>{t.rewards.pointCost}</th>
              <th>{t.rewards.statusLabel}</th>
              <th />
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
                    if (draggedId && draggedId !== reward.id) {
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
                  <td>
                    <div className="reward-order-controls">
                      <button
                        aria-label={t.rewards.drag.replace("{name}", name)}
                        className="reward-drag-handle"
                        disabled={reordering}
                        draggable={!reordering}
                        onDragEnd={() => setDraggedId("")}
                        onDragStart={(event) => startDragging(event, reward.id)}
                        type="button"
                      >
                        <span aria-hidden="true">⠿</span>
                      </button>
                      <div className="reward-order-buttons">
                        <button
                          aria-label={t.rewards.moveUp.replace("{name}", name)}
                          disabled={reordering || index === 0}
                          onClick={() => void moveReward(reward.id, items[index - 1]?.id)}
                          type="button"
                        >
                          <span aria-hidden="true">↑</span>
                        </button>
                        <button
                          aria-label={t.rewards.moveDown.replace("{name}", name)}
                          disabled={reordering || index === items.length - 1}
                          onClick={() => void moveReward(reward.id, items[index + 1]?.id)}
                          type="button"
                        >
                          <span aria-hidden="true">↓</span>
                        </button>
                      </div>
                    </div>
                  </td>
                  <td>
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
                        <Link className="user-name-link" href={`/rewards/${reward.id}`}>
                          {name}
                        </Link>
                        <small className="table-secondary">
                          {translation?.short_description || t.rewards.noDescription}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong>{reward.point_cost}</strong>
                  </td>
                  <td>
                    <span className={`badge ${reward.is_active ? "" : "warm"}`}>
                      {reward.is_active ? t.rewards.active : t.rewards.inactive}
                    </span>
                  </td>
                  <td>
                    <Link className="button secondary" href={`/rewards/${reward.id}`}>
                      {t.rewards.edit}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {meta && (
        <Pagination
          nextLabel={t.common.next}
          onPage={(nextPage) => {
            if (!reordering) setPage(nextPage);
          }}
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
