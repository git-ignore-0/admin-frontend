"use client";

import {
  ClipboardEvent,
  DragEvent,
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
import type { AdminDictionary } from "@/lib/admin-i18n";
import type { TrackerFarm } from "@/lib/types";

type FarmDraft = {
  id?: string;
  version?: number;
  name_en: string;
  name_vi: string;
  location_en: string;
  location_vi: string;
  signup_count: string;
  is_visible: boolean;
};

type FarmField = "name_en" | "name_vi" | "location_en" | "location_vi" | "signup_count";
type FarmErrors = Partial<Record<FarmField, string>>;

const emptyDraft: FarmDraft = {
  name_en: "",
  name_vi: "",
  location_en: "",
  location_vi: "",
  signup_count: "0",
  is_visible: true,
};

export function trackerMilestone(signupCount: number) {
  if (signupCount >= 30) return "communityLeader" as const;
  if (signupCount >= 20) return "providingForFamily" as const;
  if (signupCount >= 10) return "gettingStarted" as const;
  return "seedPlanted" as const;
}

function milestoneLabel(signupCount: number, t: AdminDictionary) {
  return t.trackerFarms[trackerMilestone(signupCount)];
}

function draftForFarm(farm: TrackerFarm): FarmDraft {
  return {
    id: farm.id,
    version: farm.version,
    name_en: farm.name_en,
    name_vi: farm.name_vi,
    location_en: farm.location_en,
    location_vi: farm.location_vi,
    signup_count: String(farm.signup_count),
    is_visible: farm.is_visible,
  };
}

function validateDraft(draft: FarmDraft, t: AdminDictionary) {
  const errors: FarmErrors = {};
  for (const field of ["name_en", "name_vi", "location_en", "location_vi"] as const) {
    if (!draft[field].trim()) errors[field] = t.trackerFarms.required;
  }
  const signupCountError = getSignupCountError(draft.signup_count, t);
  if (signupCountError) errors.signup_count = signupCountError;
  return errors;
}

function getSignupCountError(value: string, t: AdminDictionary) {
  if (!value) return t.trackerFarms.required;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    return t.trackerFarms.signupInvalid;
  }
  return null;
}

function sameOrder(current: TrackerFarm[], saved: TrackerFarm[]) {
  return (
    current.length === saved.length &&
    current.every(
      (farm, index) => farm.id === saved[index]?.id && farm.sort_order === saved[index]?.sort_order,
    )
  );
}

export function TrackerFarmManager() {
  const { t } = useAdminI18n();
  const toast = useToast();
  const [farms, setFarms] = useState<TrackerFarm[] | null>(null);
  const [savedFarms, setSavedFarms] = useState<TrackerFarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<FarmDraft | null>(null);
  const [formErrors, setFormErrors] = useState<FarmErrors>({});
  const [formError, setFormError] = useState("");
  const [savingFarm, setSavingFarm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TrackerFarm | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [draggedId, setDraggedId] = useState("");
  const [reorderError, setReorderError] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);
  const savingFarmRef = useRef(false);
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
  const orderLocked = savingOrder || savingFarm || deleting;
  const mutationLocked = orderDirty || orderLocked;

  function openCreate() {
    if (mutationLocked) return;
    setFormErrors({});
    setFormError("");
    setDraft({ ...emptyDraft });
  }

  function openEdit(farm: TrackerFarm) {
    if (mutationLocked) return;
    setFormErrors({});
    setFormError("");
    setDraft(draftForFarm(farm));
  }

  function updateDraft(field: keyof FarmDraft, value: string | boolean) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
    if (field in formErrors) {
      setFormErrors((current) => ({ ...current, [field]: undefined }));
    }
    setFormError("");
  }

  function updateSignupCount(value: string) {
    const error = getSignupCountError(value, t);
    if (error && value) {
      setFormErrors((current) => ({ ...current, signup_count: error }));
      setFormError("");
      return;
    }
    updateDraft("signup_count", value);
    if (error) setFormErrors((current) => ({ ...current, signup_count: error }));
  }

  function rejectInvalidSignupPaste(event: ClipboardEvent<HTMLInputElement>) {
    if (/^\d+$/.test(event.clipboardData.getData("text"))) return;
    event.preventDefault();
    setFormErrors((current) => ({ ...current, signup_count: t.trackerFarms.signupInvalid }));
    setFormError("");
  }

  async function saveFarm() {
    if (!draft || savingFarmRef.current) return;
    const errors = {
      ...validateDraft(draft, t),
      ...(formErrors.signup_count ? { signup_count: formErrors.signup_count } : {}),
    };
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload = {
      name_en: draft.name_en.trim(),
      name_vi: draft.name_vi.trim(),
      location_en: draft.location_en.trim(),
      location_vi: draft.location_vi.trim(),
      signup_count: Number(draft.signup_count),
      is_visible: draft.is_visible,
    };
    savingFarmRef.current = true;
    setSavingFarm(true);
    setFormError("");
    try {
      if (draft.id) {
        const updated = await api<TrackerFarm>(`admin/tracker-farms/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...payload, version: draft.version }),
        });
        setFarms(
          (current) => current?.map((farm) => (farm.id === updated.id ? updated : farm)) ?? [],
        );
        setSavedFarms((current) =>
          current.map((farm) => (farm.id === updated.id ? updated : farm)),
        );
        setDraft(null);
        toast(t.trackerFarms.updated);
      } else {
        await api<TrackerFarm>("admin/tracker-farms", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setDraft(null);
        toast(t.trackerFarms.created);
        await loadFarms(false);
      }
    } catch (caught) {
      const status = caught instanceof Error ? (caught as Error & { status?: number }).status : 0;
      if (status === 409 && draft.id) {
        setFormError(t.trackerFarms.conflict);
        toast(t.trackerFarms.conflict, "error");
        const latest = await loadFarms(false);
        const refreshed = latest?.find((farm) => farm.id === draft.id);
        if (refreshed) setDraft(draftForFarm(refreshed));
      } else {
        setFormError(
          requestErrorMessage(caught, t, {
            name_en: t.trackerFarms.nameEn,
            name_vi: t.trackerFarms.nameVi,
            location_en: t.trackerFarms.locationEn,
            location_vi: t.trackerFarms.locationVi,
            signup_count: t.trackerFarms.totalSignups,
          }),
        );
      }
    } finally {
      savingFarmRef.current = false;
      setSavingFarm(false);
    }
  }

  function requestDelete(farm: TrackerFarm) {
    if (mutationLocked) return;
    setDeleteError("");
    setDeleteTarget(farm);
  }

  async function confirmDelete() {
    if (!deleteTarget || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiEnvelope(`admin/tracker-farms/${deleteTarget.id}`, { method: "DELETE" });
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

  function cancelOrder() {
    if (savingOrder) return;
    setFarms(savedFarms);
    setDraggedId("");
    setReorderError("");
  }

  async function saveOrderChanges() {
    if (!farms || !orderDirty || savingOrderRef.current) return;
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
    } catch (caught) {
      const status = caught instanceof Error ? (caught as Error & { status?: number }).status : 0;
      if (status === 409) {
        const latest = await loadFarms(false);
        if (latest) setReorderError(t.trackerFarms.conflict);
        toast(t.trackerFarms.conflict, "error");
      } else {
        setReorderError(requestErrorMessage(caught, t));
      }
    } finally {
      savingOrderRef.current = false;
      setSavingOrder(false);
      setDraggedId("");
    }
  }

  const parsedSignupCount =
    draft && /^\d+$/.test(draft.signup_count) ? Number(draft.signup_count) : null;

  return (
    <>
      <PageHeading
        action={
          <button className="button" disabled={mutationLocked} onClick={openCreate} type="button">
            {t.trackerFarms.create}
          </button>
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
                    onClick={cancelOrder}
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
                <thead>
                  <tr>
                    <th aria-label={t.trackerFarms.order} />
                    <th>{t.trackerFarms.nameEn}</th>
                    <th>{t.trackerFarms.locationEn}</th>
                    <th>{t.trackerFarms.signups}</th>
                    <th>{t.trackerFarms.milestone}</th>
                    <th>{t.trackerFarms.visibility}</th>
                    <th>{t.trackerFarms.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {farms.map((farm, index) => (
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
                        const sourceId = draggedId || event.dataTransfer.getData("text/plain");
                        moveFarm(sourceId, index);
                        setDraggedId("");
                      }}
                    >
                      <td data-label={t.trackerFarms.order}>
                        <div className="tracker-order-controls">
                          <button
                            aria-label={t.trackerFarms.drag.replace("{name}", farm.name_en)}
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
                              aria-label={t.trackerFarms.moveUp.replace("{name}", farm.name_en)}
                              disabled={orderLocked || index === 0}
                              onClick={() => moveFarm(farm.id, index - 1)}
                              type="button"
                            >
                              <span aria-hidden="true">↑</span>
                            </button>
                            <button
                              aria-label={t.trackerFarms.moveDown.replace("{name}", farm.name_en)}
                              disabled={orderLocked || index === farms.length - 1}
                              onClick={() => moveFarm(farm.id, index + 1)}
                              type="button"
                            >
                              <span aria-hidden="true">↓</span>
                            </button>
                          </div>
                        </div>
                      </td>
                      <td data-label={t.trackerFarms.nameEn}>
                        <strong lang="en">{farm.name_en}</strong>
                        <span className="table-secondary" lang="vi">
                          VI · {farm.name_vi}
                        </span>
                      </td>
                      <td data-label={t.trackerFarms.locationEn}>
                        <span lang="en">{farm.location_en}</span>
                        <span className="table-secondary" lang="vi">
                          VI · {farm.location_vi}
                        </span>
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
                          <button
                            aria-label={t.trackerFarms.edit.replace("{name}", farm.name_en)}
                            className="button secondary"
                            disabled={mutationLocked}
                            onClick={() => openEdit(farm)}
                            type="button"
                          >
                            {t.trackerFarms.edit.replace(" {name}", "")}
                          </button>
                          <button
                            aria-label={t.trackerFarms.delete.replace("{name}", farm.name_en)}
                            className="button danger"
                            disabled={mutationLocked}
                            onClick={() => requestDelete(farm)}
                            type="button"
                          >
                            {t.trackerFarms.delete.replace(" {name}", "")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {draft && (
        <ConfirmationDialog
          busy={savingFarm}
          busyLabel={t.trackerFarms.saving}
          cancelLabel={t.trackerFarms.cancel}
          confirmLabel={draft.id ? t.trackerFarms.saveAction : t.trackerFarms.createAction}
          error={formError}
          onCancel={() => !savingFarm && setDraft(null)}
          onConfirm={() => void saveFarm()}
          title={draft.id ? t.trackerFarms.editTitle : t.trackerFarms.createTitle}
        >
          <div className="form-grid tracker-farm-form">
            {(
              [
                ["name_en", t.trackerFarms.nameEn, "en"],
                ["name_vi", t.trackerFarms.nameVi, "vi"],
                ["location_en", t.trackerFarms.locationEn, "en"],
                ["location_vi", t.trackerFarms.locationVi, "vi"],
              ] as const
            ).map(([field, label, language]) => {
              const errorId = `${field}-error`;
              return (
                <div className="field" key={field}>
                  <label htmlFor={`tracker-${field}`}>{label} *</label>
                  <input
                    aria-describedby={formErrors[field] ? errorId : undefined}
                    aria-invalid={Boolean(formErrors[field])}
                    className="input"
                    disabled={savingFarm}
                    id={`tracker-${field}`}
                    lang={language}
                    onChange={(event) => updateDraft(field, event.target.value)}
                    value={draft[field]}
                  />
                  {formErrors[field] && (
                    <p className="field-error" id={errorId}>
                      {formErrors[field]}
                    </p>
                  )}
                </div>
              );
            })}
            <div className="field">
              <label htmlFor="tracker-signup-count">{t.trackerFarms.totalSignups} *</label>
              <input
                aria-describedby={formErrors.signup_count ? "signup-count-error" : undefined}
                aria-invalid={Boolean(formErrors.signup_count)}
                className="input"
                disabled={savingFarm}
                id="tracker-signup-count"
                inputMode="numeric"
                onChange={(event) => updateSignupCount(event.target.value)}
                onPaste={rejectInvalidSignupPaste}
                type="text"
                value={draft.signup_count}
              />
              {formErrors.signup_count && (
                <p className="field-error" id="signup-count-error">
                  {formErrors.signup_count}
                </p>
              )}
            </div>
            <div className="tracker-milestone-preview" role="status">
              {parsedSignupCount !== null && Number.isSafeInteger(parsedSignupCount)
                ? t.trackerFarms.milestonePreview.replace(
                    "{milestone}",
                    milestoneLabel(parsedSignupCount, t),
                  )
                : t.trackerFarms.signupInvalid}
            </div>
            <label className="checkbox tracker-visibility-field">
              <input
                checked={draft.is_visible}
                disabled={savingFarm}
                onChange={(event) => updateDraft("is_visible", event.target.checked)}
                type="checkbox"
              />
              {t.trackerFarms.visibleToggle}
            </label>
          </div>
        </ConfirmationDialog>
      )}

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
          <p>{t.trackerFarms.deleteBody.replace("{name}", deleteTarget.name_en)}</p>
        </ConfirmationDialog>
      )}
    </>
  );
}
