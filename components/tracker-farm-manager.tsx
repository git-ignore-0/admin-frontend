"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DragEvent,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ListState } from "@/components/list-state";
import { PageHeading } from "@/components/page-heading";
import { useToast } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { mediaUrlForWidth } from "@/lib/media";
import type { AdminDictionary } from "@/lib/admin-i18n";
import type { TrackerFarm } from "@/lib/types";

export function trackerMilestone(count: number) {
  if (count >= 30) return "communityLeader" as const;
  if (count >= 20) return "providingForFamily" as const;
  if (count >= 10) return "gettingStarted" as const;
  return "seedPlanted" as const;
}

function milestoneLabel(count: number, t: AdminDictionary) {
  return t.trackerFarms[trackerMilestone(count)];
}

function milestoneTreeIcon(count: number) {
  if (count >= 30) return "🌳 🌱";
  if (count >= 20) return "🌳";
  if (count >= 10) return "🌱";
  return "🌰";
}

function FarmThumbnail({ farm, name }: { farm: TrackerFarm; name: string }) {
  const primaryPhoto = farm.photos?.[0] ?? farm.image;
  if (primaryPhoto) {
    return (
      <Image
        alt={name}
        className="reward-thumbnail"
        height={56}
        src={mediaUrlForWidth(primaryPhoto, 144)}
        unoptimized
        width={72}
      />
    );
  }

  return (
    <span aria-label={name} className="reward-thumbnail tracker-farm-thumbnail-fallback" role="img">
      {milestoneTreeIcon(farm.signup_count)}
    </span>
  );
}
function sameOrder(current: TrackerFarm[], saved: TrackerFarm[]) {
  if (!Array.isArray(current) || !Array.isArray(saved)) return false;
  return (
    current.length === saved.length &&
    current.every(
      (farm, index) => farm.id === saved[index]?.id && farm.sort_order === saved[index]?.sort_order,
    )
  );
}

export function TrackerFarmManager() {
  const { locale, t } = useAdminI18n();
  const router = useRouter();
  const toast = useToast();
  const [farms, setFarms] = useState<TrackerFarm[] | null>(null);
  const [savedFarms, setSavedFarms] = useState<TrackerFarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TrackerFarm | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [draggedId, setDraggedId] = useState("");
  const [reorderError, setReorderError] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState("");
  const deletingRef = useRef(false);
  const savingOrderRef = useRef(false);
  const dictionaryRef = useRef(t);
  dictionaryRef.current = t;
  const loadFarms = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setLoadError("");
    try {
      const latest = await api<TrackerFarm[]>("admin/tracker-farms");
      setFarms(latest);
      setSavedFarms(latest);
      return latest;
    } catch (caught) {
      setLoadError(requestErrorMessage(caught, dictionaryRef.current));
      return null;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadFarms();
  }, [loadFarms]);
  const orderDirty = useMemo(
    () => Boolean(farms && !sameOrder(farms, savedFarms)),
    [farms, savedFarms],
  );
  const orderLocked = savingOrder || deleting;
  const mutationLocked = orderDirty || orderLocked;
  function moveFarm(sourceId: string, targetIndex: number) {
    if (orderLocked) return;
    setFarms((current) => {
      if (!current) return current;
      const sourceIndex = current.findIndex((farm) => farm.id === sourceId);
      if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= current.length) return current;
      const reordered = [...current];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      return reordered.map((farm, index) => ({ ...farm, sort_order: index }));
    });
    setReorderError("");
  }
  function startDragging(event: DragEvent<HTMLButtonElement>, farmId: string) {
    if (orderLocked) {
      event.preventDefault();
      return;
    }
    setDraggedId(farmId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", farmId);
  }
  async function saveOrderChanges() {
    if (!farms || !orderDirty || savingOrderRef.current) return false;
    savingOrderRef.current = true;
    setSavingOrder(true);
    setReorderError("");
    try {
      const saved = await api<TrackerFarm[]>("admin/tracker-farms/reorder", {
        method: "PATCH",
        body: JSON.stringify({
          items: farms.map((farm, index) => ({
            id: farm.id,
            sort_order: index,
            version: farm.version,
          })),
        }),
      });
      setFarms(saved);
      setSavedFarms(saved);
      toast(t.trackerFarms.orderSaved);
      return true;
    } catch (caught) {
      const status = caught instanceof Error ? (caught as Error & { status?: number }).status : 0;
      if (status === 409) {
        if (await loadFarms(false)) setReorderError(t.trackerFarms.conflict);
        toast(t.trackerFarms.conflict, "error");
      } else setReorderError(requestErrorMessage(caught, t));
      return false;
    } finally {
      savingOrderRef.current = false;
      setSavingOrder(false);
      setDraggedId("");
    }
  }
  function guardNavigation(event: ReactMouseEvent<HTMLAnchorElement>, href: string) {
    if (!mutationLocked) return;
    event.preventDefault();
    if (orderDirty && !orderLocked) {
      setReorderError("");
      setPendingNavigation(href);
    }
  }
  async function saveOrderAndNavigate() {
    const href = pendingNavigation;
    if (!href || !(await saveOrderChanges())) return;
    setPendingNavigation("");
    router.push(href);
  }
  function discardOrderAndNavigate() {
    const href = pendingNavigation;
    if (!href) return;
    setFarms(savedFarms);
    setDraggedId("");
    setReorderError("");
    setPendingNavigation("");
    router.push(href);
  }
  async function confirmDelete() {
    if (!deleteTarget || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiEnvelope(`admin/farms/${deleteTarget.id}/growth-tracker`, { method: "DELETE" });
      setFarms((current) => current?.filter((farm) => farm.id !== deleteTarget.id) ?? []);
      setSavedFarms((current) => current.filter((farm) => farm.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast(t.trackerFarms.deleted);
    } catch (caught) {
      setDeleteError(requestErrorMessage(caught, t));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }
  return (
    <>
      <PageHeading
        action={
          <Link
            aria-haspopup={orderDirty ? "dialog" : undefined}
            className="button"
            href="/tracker-farms/new"
            onClick={(event) => guardNavigation(event, "/tracker-farms/new")}
          >
            {t.trackerFarms.create}
          </Link>
        }
        description={t.page.trackerFarmsDescription}
        title={t.common.trackerFarms}
      />
      <section
        aria-busy={loading || orderLocked}
        className="admin-list-section tracker-farm-section"
      >
        <ListState
          empty={t.trackerFarms.empty}
          error={loadError}
          hasData={farms !== null}
          isEmpty={farms?.length === 0}
          loading={loading}
          loadingLabel={t.trackerFarms.loading}
          onRetry={() => void loadFarms()}
          retryLabel={t.common.retry}
        />
        {farms && farms.length > 0 && (
          <>
            <div className="tracker-order-toolbar">
              <p className="muted-copy">{t.trackerFarms.reorderHelp}</p>
              {orderDirty && (
                <div className="tracker-order-actions">
                  <button
                    className="button secondary"
                    disabled={savingOrder}
                    onClick={() => {
                      setFarms(savedFarms);
                      setDraggedId("");
                      setReorderError("");
                    }}
                    type="button"
                  >
                    {t.trackerFarms.cancelOrder}
                  </button>
                  <button
                    className="button"
                    disabled={savingOrder}
                    onClick={() => void saveOrderChanges()}
                    type="button"
                  >
                    {savingOrder ? t.trackerFarms.savingOrder : t.trackerFarms.saveOrder}
                  </button>
                </div>
              )}
            </div>
            {reorderError && (
              <p className="error-box" role="alert">
                {reorderError}
              </p>
            )}
            <div className="table-wrap admin-list-wrap">
              <table className="table admin-list-table tracker-farm-table">
                <colgroup>
                  <col className="tracker-farm-order-column" />
                  <col className="tracker-farm-image-column" />
                  <col className="tracker-farm-details-column" />
                  <col className="tracker-farm-details-column" />
                  <col className="tracker-farm-signups-column" />
                  <col className="tracker-farm-milestone-column" />
                  <col className="tracker-farm-visibility-column" />
                  <col className="tracker-farm-actions-column" />
                </colgroup>
                <thead>
                  <tr>
                    <th aria-label={t.trackerFarms.order} scope="col" />
                    <th aria-label={t.trackerFarms.image} scope="col" />
                    <th scope="col">{t.trackerFarms.farmName}</th>
                    <th scope="col">{t.trackerFarms.location}</th>
                    <th scope="col">{t.trackerFarms.signups}</th>
                    <th scope="col">{t.trackerFarms.milestone}</th>
                    <th scope="col">{t.trackerFarms.visibility}</th>
                    <th scope="col">{t.trackerFarms.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {farms.map((farm, index) => {
                    const name = locale === "vi" ? farm.name_vi : farm.name_en;
                    const location = locale === "vi" ? farm.location_vi : farm.location_en;
                    const editLabel = t.trackerFarms.edit.replace("{name}", name);
                    const deleteLabel = t.trackerFarms.delete.replace("{name}", name);

                    return (
                      <tr
                        className={draggedId === farm.id ? "is-dragging" : undefined}
                        key={farm.id}
                        onDragOver={(event) => {
                          if (!orderLocked && draggedId && draggedId !== farm.id) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          moveFarm(draggedId || event.dataTransfer.getData("text/plain"), index);
                          setDraggedId("");
                        }}
                      >
                        <td data-label={t.trackerFarms.order}>
                          <div className="tracker-order-controls">
                            <button
                              aria-label={t.trackerFarms.drag.replace("{name}", name)}
                              className="tracker-drag-handle"
                              disabled={orderLocked}
                              draggable={!orderLocked}
                              onDragEnd={() => setDraggedId("")}
                              onDragStart={(event) => startDragging(event, farm.id)}
                              type="button"
                            >
                              <span aria-hidden="true">⠿</span>
                            </button>
                            <div className="tracker-order-buttons">
                              <button
                                aria-label={t.trackerFarms.moveUp.replace("{name}", name)}
                                disabled={orderLocked || index === 0}
                                onClick={() => moveFarm(farm.id, index - 1)}
                                type="button"
                              >
                                ↑
                              </button>
                              <button
                                aria-label={t.trackerFarms.moveDown.replace("{name}", name)}
                                disabled={orderLocked || index === farms.length - 1}
                                onClick={() => moveFarm(farm.id, index + 1)}
                                type="button"
                              >
                                ↓
                              </button>
                            </div>
                          </div>
                        </td>
                        <td
                          className="tracker-farm-thumbnail-cell"
                          data-label={t.trackerFarms.image}
                        >
                          <FarmThumbnail farm={farm} name={name} />
                        </td>
                        <td data-label={t.trackerFarms.farmName}>
                          <strong lang={locale}>{name}</strong>
                        </td>
                        <td data-label={t.trackerFarms.location}>
                          <span lang={locale}>{location}</span>
                        </td>
                        <td data-label={t.trackerFarms.signups}>
                          <strong>{farm.signup_count}</strong>
                        </td>
                        <td data-label={t.trackerFarms.milestone}>
                          {milestoneLabel(farm.signup_count, t)}
                        </td>
                        <td data-label={t.trackerFarms.visibility}>
                          <span className={`badge ${farm.is_visible ? "" : "warm"}`}>
                            {farm.is_visible ? t.trackerFarms.visible : t.trackerFarms.hidden}
                          </span>
                        </td>
                        <td data-label={t.trackerFarms.actions}>
                          <div className="tracker-row-actions">
                            <Link
                              aria-label={editLabel}
                              aria-haspopup={orderDirty ? "dialog" : undefined}
                              className="button secondary icon-only-action"
                              href={`/tracker-farms/${farm.id}`}
                              onClick={(event) =>
                                guardNavigation(event, `/tracker-farms/${farm.id}`)
                              }
                              title={editLabel}
                            >
                              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                                <path
                                  d="M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3Z"
                                  stroke="currentColor"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="1.8"
                                />
                                <path
                                  d="m13.5 8.5 3 3"
                                  stroke="currentColor"
                                  strokeLinecap="round"
                                  strokeWidth="1.8"
                                />
                              </svg>
                            </Link>
                            <button
                              aria-label={deleteLabel}
                              className="button danger icon-only-action"
                              disabled={mutationLocked}
                              onClick={() => {
                                setDeleteError("");
                                setDeleteTarget(farm);
                              }}
                              title={deleteLabel}
                              type="button"
                            >
                              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                                <path
                                  d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"
                                  stroke="currentColor"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="1.8"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      {deleteTarget && (
        <ConfirmationDialog
          busy={deleting}
          busyLabel={t.trackerFarms.deleting}
          cancelLabel={t.trackerFarms.cancel}
          confirmLabel={t.trackerFarms.confirmDelete}
          danger
          error={deleteError}
          onCancel={() => !deleting && setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
          title={t.trackerFarms.deleteTitle}
        >
          <p>
            {t.trackerFarms.deleteBody.replace(
              "{name}",
              locale === "vi" ? deleteTarget.name_vi : deleteTarget.name_en,
            )}
          </p>
        </ConfirmationDialog>
      )}
      {pendingNavigation && (
        <ConfirmationDialog
          alternateLabel={t.trackerFarms.discardOrder}
          busy={savingOrder}
          busyLabel={t.trackerFarms.savingOrder}
          cancelLabel={t.trackerFarms.stayOnList}
          confirmLabel={t.trackerFarms.saveOrder}
          error={reorderError}
          onAlternate={discardOrderAndNavigate}
          onCancel={() => !savingOrder && setPendingNavigation("")}
          onConfirm={() => void saveOrderAndNavigate()}
          title={t.trackerFarms.unsavedOrderTitle}
        >
          <p>{t.trackerFarms.unsavedOrderBody}</p>
        </ConfirmationDialog>
      )}
    </>
  );
}
