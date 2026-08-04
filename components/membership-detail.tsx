"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { MembershipStatusBadge } from "@/components/membership-status-badge";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/components/toast-provider";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin-date";
import { api, apiEnvelope } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { formatMembershipMoney, formatMembershipUnits } from "@/lib/membership-format";
import {
  numericInputErrorMessage,
  parsePositiveInteger,
  sanitizeIntegerInput,
} from "@/lib/numeric-input";
import type { AdminMembership, MembershipUsage, PaginationMeta } from "@/lib/types";

type UsageLineForm = { productId: string; units: string };

export function MembershipDetail({ membershipId }: { membershipId: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const savingRef = useRef(false);
  const attemptedUsageRef = useRef("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [item, setItem] = useState<AdminMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [history, setHistory] = useState<MembershipUsage[] | null>(null);
  const [historyMeta, setHistoryMeta] = useState<PaginationMeta | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyError, setHistoryError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [usageLines, setUsageLines] = useState<UsageLineForm[]>([]);
  const [usageUnitErrors, setUsageUnitErrors] = useState<Record<number, string>>({});
  const [usageNote, setUsageNote] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [undoItem, setUndoItem] = useState<MembershipUsage | null>(null);
  const [undoReason, setUndoReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const loadMembership = useCallback(async () => {
    setLoading(true);
    try {
      const latest = await api<AdminMembership>(
        `admin/memberships/${membershipId}?locale=${locale}`,
      );
      setItem(latest);
      setLoadError(null);
      return latest;
    } catch (caught) {
      setLoadError(() => caught);
      return null;
    } finally {
      setLoading(false);
    }
  }, [locale, membershipId]);

  const loadHistory = useCallback(async () => {
    setHistory(null);
    setHistoryError("");
    try {
      const payload = await apiEnvelope<MembershipUsage[], PaginationMeta>(
        `admin/memberships/${membershipId}/history?page=${historyPage}&locale=${locale}`,
      );
      setHistory(payload.data);
      setHistoryMeta(payload.meta ?? null);
    } catch (caught) {
      setHistoryError(requestErrorMessage(caught, t));
    }
  }, [historyPage, locale, membershipId, t]);

  useEffect(() => void loadMembership(), [loadMembership]);
  useEffect(() => void loadHistory(), [loadHistory]);

  function openCreate() {
    if (!item?.quota?.length || item.status !== "active" || saving) return;
    setUsageLines([{ productId: item.quota[0].product_id, units: "1" }]);
    setUsageUnitErrors({});
    setUsageNote("");
    setIdempotencyKey(crypto.randomUUID());
    attemptedUsageRef.current = "";
    setActionError("");
    setCreateOpen(true);
  }

  function closeDialogs() {
    if (saving) return;
    setCreateOpen(false);
    setUndoItem(null);
    setActionError("");
    setUndoReason("");
    setUsageUnitErrors({});
  }

  function updateUsageLine(index: number, patch: Partial<UsageLineForm>) {
    setUsageLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  }

  async function createUsage() {
    if (!item || savingRef.current || item.status !== "active") return;
    const productIds = usageLines.map((line) => line.productId);
    const validatedLines: Array<{ productId: string; units: number }> = [];
    const nextUnitErrors: Record<number, string> = {};
    usageLines.forEach((line, index) => {
      const parsed = parsePositiveInteger(line.units);
      if (parsed.error) {
        nextUnitErrors[index] = numericInputErrorMessage(parsed.error, t.common.numericInput);
      } else {
        validatedLines[index] = { productId: line.productId, units: parsed.value };
      }
    });
    setUsageUnitErrors(nextUnitErrors);
    if (
      !usageLines.length ||
      productIds.some((id) => !id) ||
      new Set(productIds).size !== productIds.length ||
      Object.keys(nextUnitErrors).length
    ) {
      if (!Object.keys(nextUnitErrors).length) setActionError(t.memberships.usageValidation);
      return;
    }
    const signature = JSON.stringify({ lines: validatedLines, note: usageNote.trim() });
    const requestKey =
      attemptedUsageRef.current && attemptedUsageRef.current !== signature
        ? crypto.randomUUID()
        : idempotencyKey;
    if (requestKey !== idempotencyKey) setIdempotencyKey(requestKey);
    attemptedUsageRef.current = signature;
    savingRef.current = true;
    setSaving(true);
    setActionError("");
    try {
      await api<MembershipUsage>(`admin/membership-usage?locale=${locale}`, {
        method: "POST",
        body: JSON.stringify({
          membership_id: item.id,
          idempotency_key: requestKey,
          lines: validatedLines.map((line) => ({
            product_id: line.productId,
            units: line.units,
          })),
          note: usageNote.trim(),
        }),
      });
      await Promise.all([loadMembership(), loadHistory()]);
      setCreateOpen(false);
      attemptedUsageRef.current = "";
      toast(t.memberships.usageCreated);
    } catch (caught) {
      setActionError(requestErrorMessage(caught, t));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function undoUsage() {
    if (!undoItem || savingRef.current || !undoReason.trim()) return;
    savingRef.current = true;
    setSaving(true);
    setActionError("");
    try {
      await api<MembershipUsage>(`admin/membership-usage/${undoItem.id}/undo?locale=${locale}`, {
        method: "POST",
        body: JSON.stringify({ reason: undoReason.trim() }),
      });
      await Promise.all([loadMembership(), loadHistory()]);
      setUndoItem(null);
      setUndoReason("");
      toast(t.memberships.usageUndone);
    } catch (caught) {
      setActionError(requestErrorMessage(caught, t));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loadError && !item)
    return (
      <div className="panel load-error-state">
        <p className="error-box" role="alert">
          {requestErrorMessage(loadError, t)}
        </p>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => void loadMembership()}
        >
          {t.common.retry}
        </button>
      </div>
    );
  if (!item) return <div className="panel">{t.memberships.loadingDetail}</div>;
  const selected = new Set(usageLines.map((line) => line.productId).filter(Boolean));

  return (
    <>
      <DetailPageHeading
        backHref="/memberships"
        backLabel={t.memberships.backLabel}
        description={`${item.user.name} · ${item.package_name}`}
        title={t.memberships.detailTitle}
      />
      {loadError && (
        <p className="error-box" role="alert">
          {requestErrorMessage(loadError, t)}
        </p>
      )}
      <section className="membership-hero">
        <div>
          <MembershipStatusBadge status={item.status} />
          <h2 ref={headingRef} tabIndex={-1}>
            {item.package_name}
          </h2>
          {item.snapshot_complete === false && (
            <span className="badge warm">{t.memberships.legacySnapshotWarning}</span>
          )}
          <p>
            {formatAdminDate(item.start_date)} – {formatAdminDate(item.end_date)}
          </p>
        </div>
        {item.status === "active" && (
          <button className="button" disabled={saving || !item.quota?.length} onClick={openCreate}>
            {t.memberships.createUsage}
          </button>
        )}
      </section>
      {item.status === "scheduled" && <p className="notice-box">{t.memberships.scheduledNotice}</p>}
      <div className="membership-detail-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>{t.memberships.customer}</h2>
          </div>
          <dl className="detail-list">
            <DetailRow label={t.users.name} value={item.user.name} />
            <DetailRow label={t.users.email} value={item.user.email} />
            <DetailRow label={t.users.phone} value={item.user.phone || "—"} />
          </dl>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>{t.memberships.packageSnapshot}</h2>
          </div>
          <dl className="detail-list">
            <DetailRow label={t.memberships.package} value={item.package_name} />
            <DetailRow
              label={t.memberships.monthlyPrice}
              value={formatMembershipMoney(item.monthly_price_vnd, locale)}
            />
            <DetailRow
              label={t.memberships.totalPrice}
              value={formatMembershipMoney(item.total_price_vnd, locale)}
            />
            <DetailRow label={t.memberships.duration} value={String(item.duration_months)} />
            <DetailRow
              label={t.memberships.farmbriteReference}
              value={item.farmbrite_order_reference}
            />
            <DetailRow
              label={t.memberships.policy}
              value={
                item.quota_policy === "expire"
                  ? t.membershipCatalog.expire
                  : t.membershipCatalog.rollover
              }
            />
            <DetailRow label={t.memberships.startDate} value={formatAdminDate(item.start_date)} />
            <DetailRow label={t.memberships.endDate} value={formatAdminDate(item.end_date)} />
          </dl>
          {item.package_description && (
            <p className="snapshot-description">{item.package_description}</p>
          )}
        </section>
        <section className="panel membership-wide">
          <div className="panel-head">
            <h2>{t.memberships.quota}</h2>
          </div>
          {!item.quota?.length ? (
            <div className="empty compact">{t.memberships.noQuota}</div>
          ) : (
            <div className="table-wrap">
              <table className="table quota-table">
                <thead>
                  <tr>
                    <th>{t.memberships.product}</th>
                    <th>{t.memberships.quotaPerCycle}</th>
                    <th>{t.memberships.remaining}</th>
                    <th>{t.memberships.displayAmount}</th>
                  </tr>
                </thead>
                <tbody>
                  {item.quota.map((quota) => (
                    <tr key={quota.product_id}>
                      <td>
                        {quota.product_name}
                        {quota.snapshot_complete === false && (
                          <span className="badge warm">{t.memberships.legacySnapshotWarning}</span>
                        )}
                      </td>
                      <td>{quota.quota_units_per_cycle}</td>
                      <td>
                        <strong>{quota.remaining_units}</strong>
                      </td>
                      <td>
                        {formatMembershipUnits(quota.unit_size, quota.remaining_units, locale)}{" "}
                        {locale === "vi" ? quota.unit_label_vi : quota.unit_label_en}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel membership-wide">
          <div className="panel-head">
            <h2>{t.memberships.cycles}</h2>
          </div>
          {!item.cycles?.length ? (
            <div className="empty compact">{t.memberships.noCycles}</div>
          ) : (
            <div className="cycle-grid">
              {item.cycles.map((cycle) => (
                <article className="cycle-card" key={cycle.sequence}>
                  <div>
                    <strong>
                      {t.memberships.cycle.replace("{number}", String(cycle.sequence))}
                    </strong>
                    <span>
                      {formatAdminDate(cycle.start_date)} – {formatAdminDate(cycle.end_date)}
                    </span>
                  </div>
                  <ul>
                    {cycle.quotas.map((quota) => (
                      <li key={quota.product_id}>
                        <span>{quota.product_name}</span>
                        {quota.snapshot_complete === false && (
                          <span className="badge warm">{t.memberships.legacySnapshotWarning}</span>
                        )}
                        <span>
                          {t.memberships.cycleBalance
                            .replace("{remaining}", String(quota.remaining_units))
                            .replace("{granted}", String(quota.granted_units))
                            .replace("{expired}", String(quota.expired_units))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="panel usage-history">
        <div className="panel-head">
          <h2>{t.memberships.usageHistory}</h2>
        </div>
        {historyError && (
          <p className="error-box" role="alert">
            {historyError}
          </p>
        )}
        {!history ? (
          historyError ? null : (
            <p>{t.memberships.loadingHistory}</p>
          )
        ) : !history.length ? (
          <div className="empty compact">{t.memberships.noUsage}</div>
        ) : (
          <div className="usage-list">
            {history.map((usage) => (
              <article className="usage-card" key={usage.id}>
                <div className="usage-card-head">
                  <div>
                    <span className={`badge membership-status ${usage.status}`}>
                      {t.memberships.usageStatuses[usage.status]}
                    </span>
                    <time>{formatAdminDateTime(usage.created_at)}</time>
                  </div>
                  {usage.status === "applied" && (
                    <button
                      className="button secondary"
                      disabled={saving}
                      onClick={() => {
                        setUndoItem(usage);
                        setUndoReason("");
                        setActionError("");
                      }}
                    >
                      {t.memberships.undoUsage}
                    </button>
                  )}
                </div>
                <ul>
                  {usage.lines.map((line) => (
                    <li key={line.product_id}>
                      <strong>{line.product_name}</strong>
                      {line.snapshot_complete === false && (
                        <span className="badge warm">{t.memberships.legacySnapshotWarning}</span>
                      )}
                      <span>
                        {line.units} {t.memberships.units}
                      </span>
                      {line.allocations?.length ? (
                        <small>
                          {line.allocations
                            .map((allocation) =>
                              t.memberships.allocation
                                .replace("{cycle}", String(allocation.cycle))
                                .replace("{units}", String(allocation.units)),
                            )
                            .join(" · ")}
                        </small>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {usage.note && (
                  <p>
                    {t.memberships.note}: {usage.note}
                  </p>
                )}
                {usage.reversal && (
                  <p className="reversal-note">
                    {t.memberships.reversalReason}: {usage.reversal.reason}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
        {historyMeta && (
          <Pagination
            nextLabel={t.common.next}
            onPage={setHistoryPage}
            page={historyMeta.page}
            pageSize={historyMeta.page_size}
            previousLabel={t.common.previous}
            summary={t.common.pagination}
            total={historyMeta.total}
          />
        )}
      </section>
      {createOpen && (
        <ConfirmationDialog
          busy={saving}
          busyLabel={t.memberships.creatingUsage}
          cancelLabel={t.memberships.cancel}
          confirmLabel={t.memberships.confirmUsage}
          error={actionError}
          fallbackFocusRef={headingRef}
          onCancel={closeDialogs}
          onConfirm={createUsage}
          title={t.memberships.createUsageTitle}
        >
          <p>{t.memberships.createUsageBody}</p>
          <div className="usage-lines">
            {usageLines.map((line, index) => (
              <div className="usage-line" key={index}>
                <label className="field">
                  <span>{t.memberships.product} *</span>
                  <select
                    aria-label={`${t.memberships.product} ${index + 1}`}
                    className="input"
                    disabled={saving}
                    onChange={(event) => updateUsageLine(index, { productId: event.target.value })}
                    value={line.productId}
                  >
                    {item.quota
                      ?.filter(
                        (quota) =>
                          !selected.has(quota.product_id) || quota.product_id === line.productId,
                      )
                      .map((quota) => (
                        <option key={quota.product_id} value={quota.product_id}>
                          {quota.product_name} ({t.memberships.remaining}: {quota.remaining_units})
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t.memberships.units} *</span>
                  <input
                    aria-label={`${t.memberships.units} ${index + 1}`}
                    aria-invalid={Boolean(usageUnitErrors[index])}
                    className="input"
                    disabled={saving}
                    inputMode="numeric"
                    onChange={(event) => {
                      updateUsageLine(index, {
                        units: sanitizeIntegerInput(event.target.value),
                      });
                      setUsageUnitErrors((current) => ({ ...current, [index]: "" }));
                    }}
                    type="text"
                    value={line.units}
                  />
                  {usageUnitErrors[index] ? (
                    <small className="field-error" role="alert">
                      {usageUnitErrors[index]}
                    </small>
                  ) : null}
                </label>
                <button
                  className="button secondary"
                  disabled={saving || usageLines.length === 1}
                  onClick={() =>
                    setUsageLines((current) =>
                      current.filter((_, lineIndex) => lineIndex !== index),
                    )
                  }
                  type="button"
                >
                  {t.memberships.removeLine}
                </button>
              </div>
            ))}
          </div>
          <button
            className="button secondary add-usage-line"
            disabled={saving || selected.size >= (item.quota?.length ?? 0)}
            onClick={() => {
              const next = item.quota?.find((quota) => !selected.has(quota.product_id));
              if (next)
                setUsageLines((current) => [
                  ...current,
                  { productId: next.product_id, units: "1" },
                ]);
            }}
            type="button"
          >
            {t.memberships.addLine}
          </button>
          <label className="field usage-note">
            <span>{t.memberships.note}</span>
            <textarea
              className="textarea"
              disabled={saving}
              maxLength={500}
              onChange={(event) => setUsageNote(event.target.value)}
              value={usageNote}
            />
          </label>
        </ConfirmationDialog>
      )}
      {undoItem && (
        <ConfirmationDialog
          busy={saving}
          busyLabel={t.memberships.undoingUsage}
          cancelLabel={t.memberships.cancel}
          confirmDisabled={!undoReason.trim()}
          confirmLabel={t.memberships.confirmUndo}
          danger
          error={actionError}
          fallbackFocusRef={headingRef}
          onCancel={closeDialogs}
          onConfirm={undoUsage}
          title={t.memberships.undoTitle}
        >
          <p>{t.memberships.undoBody}</p>
          <label className="field">
            <span>{t.memberships.reason} *</span>
            <textarea
              autoFocus
              className="textarea"
              disabled={saving}
              maxLength={1000}
              onChange={(event) => setUndoReason(event.target.value)}
              value={undoReason}
            />
          </label>
        </ConfirmationDialog>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
