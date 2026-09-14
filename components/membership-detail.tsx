"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailBackLink } from "@/components/detail-back-link";
import { MembershipStatusBadge } from "@/components/membership-status-badge";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/components/toast-provider";
import { formatAdminDate, formatAdminDateTime, membershipLastReceiptDate } from "@/lib/admin-date";
import { api, apiEnvelope, apiFile } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import { formatMembershipMoney } from "@/lib/membership-format";
import {
  numericInputErrorMessage,
  parsePositiveInteger,
  sanitizeIntegerInput,
} from "@/lib/numeric-input";
import type {
  AdminCSAContract,
  AdminMembership,
  CSAContractVersion,
  MembershipCycle,
  MembershipUsage,
  PaginationMeta,
} from "@/lib/types";

type UsageLineForm = { productId: string; units: string };
type CycleQuantities = { granted: number; received: number; remaining: number };

function cycleQuantities(cycle: MembershipCycle): CycleQuantities | null {
  if (!cycle.quotas.length) return null;
  const quantities = cycle.quotas.reduce<CycleQuantities | null>(
    (total, quota) => {
      if (!total) return null;
      const values = [quota.granted_units, quota.remaining_units, quota.expired_units];
      if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) return null;
      const received = quota.granted_units - quota.remaining_units - quota.expired_units;
      if (received < 0) return null;
      return {
        granted: total.granted + quota.granted_units,
        received: total.received + received,
        remaining: total.remaining + quota.remaining_units,
      };
    },
    { granted: 0, received: 0, remaining: 0 },
  );
  if (
    !quantities ||
    ![quantities.granted, quantities.received, quantities.remaining].every(Number.isSafeInteger)
  ) {
    return null;
  }
  return quantities;
}

function quantity(value: number | undefined): string {
  return value === undefined ? "—" : String(value);
}

export function MembershipDetail({ membershipId }: { membershipId: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const savingRef = useRef(false);
  const attemptedUsageRef = useRef("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const revokeButtonRef = useRef<HTMLButtonElement>(null);
  const [item, setItem] = useState<AdminMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [history, setHistory] = useState<MembershipUsage[] | null>(null);
  const [historyMeta, setHistoryMeta] = useState<PaginationMeta | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyError, setHistoryError] = useState("");
  const [contract, setContract] = useState<AdminCSAContract | null>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [contractError, setContractError] = useState("");
  const [contractPdfError, setContractPdfError] = useState("");
  const downloadingContractRef = useRef(new Set<string>());
  const [downloadingContracts, setDownloadingContracts] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [usageLines, setUsageLines] = useState<UsageLineForm[]>([]);
  const [usageUnitErrors, setUsageUnitErrors] = useState<Record<number, string>>({});
  const [usageNote, setUsageNote] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [undoItem, setUndoItem] = useState<MembershipUsage | null>(null);
  const [undoReason, setUndoReason] = useState("");
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
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

  const contractId = item?.contract?.id ?? "";
  const contractVersions: CSAContractVersion[] = [...(contract?.versions ?? [])].sort(
    (left, right) => left.version_number - right.version_number,
  );
  const loadContract = useCallback(async () => {
    setContractError("");
    setContractPdfError("");
    if (!contractId) {
      setContract(null);
      setContractLoading(false);
      return;
    }
    setContractLoading(true);
    try {
      setContract(await api<AdminCSAContract>(`admin/memberships/${membershipId}/contract`));
    } catch {
      setContract(null);
      setContractError(t.memberships.contractUnavailable);
    } finally {
      setContractLoading(false);
    }
  }, [contractId, membershipId, t.memberships.contractUnavailable]);

  useEffect(() => void loadMembership(), [loadMembership]);
  useEffect(() => void loadHistory(), [loadHistory]);
  useEffect(() => void loadContract(), [loadContract]);

  async function downloadContract(localeToDownload: "vi" | "en", versionId?: string) {
    const version = versionId ? contract?.versions?.find((entry) => entry.id === versionId) : null;
    const available = version
      ? version.available_locales.includes(localeToDownload)
      : !versionId && contract?.available_locales.includes(localeToDownload);
    const downloadKey = `${versionId ?? "current"}:${localeToDownload}`;
    if (!available || downloadingContractRef.current.has(downloadKey)) return;
    downloadingContractRef.current.add(downloadKey);
    setDownloadingContracts(new Set(downloadingContractRef.current));
    setContractPdfError("");
    try {
      const file = await apiFile(
        `admin/memberships/${membershipId}/contract/pdf?locale=${localeToDownload}${versionId ? `&version_id=${encodeURIComponent(versionId)}` : ""}`,
      );
      const objectUrl = URL.createObjectURL(file.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch {
      setContractPdfError(t.memberships.contractPdfUnavailable);
    } finally {
      downloadingContractRef.current.delete(downloadKey);
      setDownloadingContracts(new Set(downloadingContractRef.current));
    }
  }

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
    setRevokeOpen(false);
    setActionError("");
    setUndoReason("");
    setRevokeReason("");
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

  async function revokeMembership() {
    if (!item || savingRef.current || !revokeReason.trim()) return;
    savingRef.current = true;
    setSaving(true);
    setActionError("");
    try {
      const revoked = await api<AdminMembership>(
        `admin/memberships/${membershipId}/revoke?locale=${locale}`,
        {
          method: "POST",
          body: JSON.stringify({ reason: revokeReason.trim() }),
        },
      );
      setItem((current) =>
        current
          ? {
              ...current,
              ...revoked,
              quota: revoked.quota ?? current.quota,
              cycles: revoked.cycles ?? current.cycles,
            }
          : revoked,
      );
      await Promise.all([loadMembership(), loadContract()]);
      setRevokeOpen(false);
      setRevokeReason("");
      toast(t.memberships.revokeSuccess);
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
  const revokedActor = item.revoked_by
    ? [item.revoked_by.name, item.revoked_by.email].filter(Boolean).join(" · ")
    : "";
  const cycleRows = (item.cycles ?? []).map((cycle) => ({
    cycle,
    quantities: cycleQuantities(cycle),
  }));
  const cycleTotalCandidate = cycleRows.reduce<CycleQuantities | null>(
    (total, row) => {
      if (!total || !row.quantities) return null;
      return {
        granted: total.granted + row.quantities.granted,
        received: total.received + row.quantities.received,
        remaining: total.remaining + row.quantities.remaining,
      };
    },
    cycleRows.length ? { granted: 0, received: 0, remaining: 0 } : null,
  );
  const cycleTotal =
    cycleTotalCandidate &&
    [
      cycleTotalCandidate.granted,
      cycleTotalCandidate.received,
      cycleTotalCandidate.remaining,
    ].every(Number.isSafeInteger)
      ? cycleTotalCandidate
      : null;

  return (
    <>
      <div className="detail-page-heading membership-detail-heading">
        <DetailBackLink href={`/csa-customers/${item.customer_id}`} label={t.csaCustomers.back} />
      </div>
      {loadError && (
        <div className="load-error-state">
          <p className="error-box" role="alert">
            {requestErrorMessage(loadError, t)}
          </p>
          <button
            className="button secondary"
            disabled={loading}
            onClick={() => void loadMembership()}
            type="button"
          >
            {t.common.retry}
          </button>
        </div>
      )}
      <section className="membership-hero" aria-labelledby="membership-summary-title">
        <div className="membership-hero-summary">
          <div className="membership-hero-title-row">
            <h1 id="membership-summary-title" ref={headingRef} tabIndex={-1}>
              {item.package_name}
            </h1>
            <MembershipStatusBadge status={item.status} />
          </div>
          <p className="membership-hero-metadata">
            {formatAdminDate(item.start_date)} –{" "}
            {formatAdminDate(membershipLastReceiptDate(item.end_date))}
          </p>
          {item.snapshot_complete === false && (
            <p className="membership-snapshot-warning">
              <span aria-hidden="true">⚠</span>
              <span>{t.memberships.legacySnapshotWarning}</span>
            </p>
          )}
          {item.status === "revoked" && (
            <section
              className="membership-revoke-audit"
              aria-label={t.memberships.revokeAuditLabel}
            >
              <p className="membership-revoke-summary">
                <span>
                  {t.memberships.revokeAuditTime.replace(
                    "{time}",
                    formatAdminDateTime(item.revoked_at),
                  )}
                </span>
                <span>
                  {t.memberships.revokeAuditActor.replace(
                    "{actor}",
                    revokedActor || t.memberships.revokeAuditActorFallback,
                  )}
                </span>
              </p>
              <p className="membership-revoke-reason">
                <strong>{t.memberships.revokeAuditReason}</strong>
                <span>{item.revoke_reason || "—"}</span>
              </p>
            </section>
          )}
        </div>
        <div className="membership-hero-actions">
          {item.status === "active" && (
            <button
              className="button"
              disabled={saving || !item.quota?.length}
              onClick={openCreate}
            >
              {t.memberships.createUsage}
            </button>
          )}
          {(item.status === "active" || item.status === "scheduled") && (
            <button
              className="button danger"
              disabled={saving}
              onClick={() => {
                setRevokeReason("");
                setActionError("");
                setRevokeOpen(true);
              }}
              ref={revokeButtonRef}
            >
              {t.memberships.revokeButton}
            </button>
          )}
        </div>
      </section>
      {item.status === "scheduled" && <p className="notice-box">{t.memberships.scheduledNotice}</p>}
      <div className="membership-detail-grid">
        <section className="panel membership-wide">
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
            <DetailRow
              label={t.memberships.lastReceiptDate}
              value={formatAdminDate(membershipLastReceiptDate(item.end_date))}
            />
          </dl>
          {item.package_description && (
            <p className="snapshot-description">{item.package_description}</p>
          )}
        </section>
        <section className="panel membership-wide" aria-labelledby="membership-contract-title">
          <div className="panel-head">
            <h2 id="membership-contract-title">{t.memberships.contractTitle}</h2>
          </div>
          {contractLoading ? (
            <p>{t.memberships.contractLoading}</p>
          ) : contractError ? (
            <div className="load-error-state">
              <p className="error-box" role="alert">
                {contractError}
              </p>
              <button
                className="button secondary"
                onClick={() => void loadContract()}
                type="button"
              >
                {t.common.retry}
              </button>
            </div>
          ) : !contract ? (
            <div className="empty compact">{t.memberships.contractEmpty}</div>
          ) : (
            <>
              <dl className="detail-list">
                <DetailRow label={t.memberships.contractCode} value={contract.reference_code} />
                <DetailRow
                  label={t.memberships.contractStatus}
                  value={
                    contract.status === "active"
                      ? t.memberships.contractActive
                      : t.memberships.contractRevoked
                  }
                />
              </dl>
              {!contract.current_version && !contract.versions?.length ? (
                <div className="membership-contract-actions">
                  {contract.available_locales.includes("vi") && (
                    <button
                      className="button secondary"
                      disabled={downloadingContracts.has("current:vi")}
                      onClick={() => void downloadContract("vi")}
                      type="button"
                    >
                      {downloadingContracts.has("current:vi")
                        ? t.memberships.downloadingContract
                        : t.memberships.downloadContractVi}
                    </button>
                  )}
                  {contract.available_locales.includes("en") && (
                    <button
                      className="button secondary"
                      disabled={downloadingContracts.has("current:en")}
                      onClick={() => void downloadContract("en")}
                      type="button"
                    >
                      {downloadingContracts.has("current:en")
                        ? t.memberships.downloadingContract
                        : t.memberships.downloadContractEn}
                    </button>
                  )}
                </div>
              ) : null}
              <div className="membership-contract-versions">
                <h3>{t.memberships.contractVersionHistory}</h3>
                {contractVersions.length === 0 ? (
                  <p className="muted-copy">{t.memberships.contractNoVersions}</p>
                ) : (
                  <ol className="membership-contract-version-list">
                    {contractVersions.map((version) => {
                      const current = version.id === contract.current_version?.id;
                      return (
                        <li className="membership-contract-version" key={version.id}>
                          <div className="membership-contract-version-head">
                            <h4>
                              {t.memberships.contractVersion} {version.version_number}
                            </h4>
                            {current && (
                              <span className="badge">{t.memberships.contractCurrentVersion}</span>
                            )}
                          </div>
                          <dl className="membership-contract-version-meta">
                            <DetailRow
                              label={t.memberships.contractVersionReason}
                              value={t.memberships.contractVersionReasons[version.version_reason]}
                            />
                            <DetailRow
                              label={t.memberships.contractStatus}
                              value={
                                version.contract_status === "active"
                                  ? t.memberships.contractActive
                                  : t.memberships.contractRevoked
                              }
                            />
                            <DetailRow
                              label={t.memberships.contractVersionCreated}
                              value={formatAdminDateTime(version.created_at)}
                            />
                            {version.paid_amount !== undefined && (
                              <DetailRow
                                label={t.memberships.contractPaidAmount}
                                value={formatMembershipMoney(version.paid_amount, locale)}
                              />
                            )}
                            {version.remaining_amount !== undefined && (
                              <DetailRow
                                label={t.memberships.contractRemainingAmount}
                                value={formatMembershipMoney(version.remaining_amount, locale)}
                              />
                            )}
                            <DetailRow
                              label={t.memberships.contractPdfLocales}
                              value={
                                version.available_locales.length
                                  ? version.available_locales.join(", ").toUpperCase()
                                  : "—"
                              }
                            />
                          </dl>
                          <div className="membership-contract-actions">
                            {version.available_locales.map((pdfLocale) => {
                              const key = `${version.id}:${pdfLocale}`;
                              return (
                                <button
                                  className="button secondary"
                                  disabled={downloadingContracts.has(key)}
                                  key={pdfLocale}
                                  onClick={() => void downloadContract(pdfLocale, version.id)}
                                  type="button"
                                >
                                  {downloadingContracts.has(key)
                                    ? t.memberships.downloadingContract
                                    : pdfLocale === "vi"
                                      ? t.memberships.downloadContractVi
                                      : t.memberships.downloadContractEn}
                                </button>
                              );
                            })}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
              {contractPdfError && (
                <p className="error-box" role="alert">
                  {contractPdfError}
                </p>
              )}
            </>
          )}
        </section>
        <section className="panel membership-wide">
          <div className="panel-head">
            <h2>{t.memberships.cycles}</h2>
          </div>
          {!cycleRows.length ? (
            <div className="empty compact">{t.memberships.noCycles}</div>
          ) : (
            <div className="table-wrap">
              <table aria-label={t.memberships.cycles} className="table cycle-quota-table">
                <thead>
                  <tr>
                    <th>{t.memberships.cycleReceipt}</th>
                    <th>{t.memberships.cycleRange}</th>
                    <th>{t.memberships.granted}</th>
                    <th>{t.memberships.received}</th>
                    <th>{t.memberships.remaining}</th>
                  </tr>
                </thead>
                <tbody>
                  {cycleRows.map(({ cycle, quantities }) => (
                    <tr key={cycle.sequence}>
                      <td>
                        <strong>
                          {t.memberships.cycle.replace("{number}", String(cycle.sequence))}
                        </strong>
                      </td>
                      <td>
                        {formatAdminDate(cycle.start_date)} –{" "}
                        {formatAdminDate(membershipLastReceiptDate(cycle.end_date))}
                      </td>
                      <td>{quantity(quantities?.granted)}</td>
                      <td>{quantity(quantities?.received)}</td>
                      <td>
                        <strong>{quantity(quantities?.remaining)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">{t.memberships.total}</th>
                    <td />
                    <td>{quantity(cycleTotal?.granted)}</td>
                    <td>{quantity(cycleTotal?.received)}</td>
                    <td>{quantity(cycleTotal?.remaining)}</td>
                  </tr>
                </tfoot>
              </table>
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
                  {usage.status === "applied" && item.status !== "revoked" && (
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
      {revokeOpen && (
        <ConfirmationDialog
          busy={saving}
          busyLabel={t.memberships.revoking}
          cancelLabel={t.memberships.cancel}
          confirmDisabled={!revokeReason.trim()}
          confirmLabel={t.memberships.confirmRevoke}
          danger
          error={actionError}
          fallbackFocusRef={headingRef}
          returnFocusRef={revokeButtonRef}
          onCancel={closeDialogs}
          onConfirm={revokeMembership}
          title={t.memberships.revokeTitle}
        >
          <p>{t.memberships.revokeBody.replace("{package}", item.package_name)}</p>
          <label className="field">
            <span>{t.memberships.revokeReason}</span>
            <textarea
              autoFocus
              className="textarea"
              disabled={saving}
              maxLength={500}
              onChange={(event) => setRevokeReason(event.target.value)}
              required
              value={revokeReason}
            />
            {!revokeReason.trim() && actionError && (
              <small className="field-error" role="alert">
                {t.memberships.revokeReasonRequired}
              </small>
            )}
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
