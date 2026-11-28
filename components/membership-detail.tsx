"use client";
import { DataState } from "@/components/nfv-controls";

import { Button, Table, Badge, Alert } from "@mantine/core";
import {
  FormInput,
  FormSelect,
  FormTextarea,
  Status as UiStatus,
  FormField,
} from "@/components/nfv-controls";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailBackLink } from "@/components/detail-back-link";
import { csaRoundsCopy } from "@/lib/csa-rounds-copy";
import { MembershipStatusBadge } from "@/components/membership-status-badge";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/components/toast-provider";
import { formatAdminDate, formatAdminDateTime, membershipLastReceiptDate } from "@/lib/admin-date";
import { useAdminMutationIntent } from "@/lib/admin-mutation-intent";
import { requirePaginatedList } from "@/lib/api-response";
import { api, apiEnvelope, apiFile } from "@/lib/client-api";
import {
  invalidApiResponse,
  isProtectedDataError,
  isUncertainMutationError,
  requestErrorMessage,
  type ClientApiError,
} from "@/lib/client-error";
import { formatMembershipMoney } from "@/lib/membership-format";
import {
  numericInputErrorMessage,
  MAX_POSITIVE_INTEGER,
  parsePositiveQuotaUnits,
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
type UsageIntent = {
  membership_id: string;
  idempotency_key: string;
  lines: Array<{ product_id: string; units: number }>;
  note: string;
};
type CycleQuantities = { granted: number; received: number; remaining: number };

function cycleQuantities(cycle: MembershipCycle): CycleQuantities | null {
  if (!cycle.quotas.length) return null;
  const quantities = cycle.quotas.reduce<CycleQuantities | null>(
    (total, quota) => {
      if (!total) return null;
      if (!Number.isSafeInteger(quota.granted_units)) return null;
      const values = [quota.granted_units, quota.remaining_units, quota.expired_units];
      if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
      const received =
        Math.round((quota.granted_units - quota.remaining_units - quota.expired_units) * 100) / 100;
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
    ![quantities.granted, quantities.received, quantities.remaining].every(Number.isFinite)
  ) {
    return null;
  }
  return quantities;
}

function quantity(value: number | undefined): string {
  return value === undefined ? "—" : String(Math.round(value * 100) / 100);
}

export function MembershipDetail({ membershipId }: { membershipId: string }) {
  return <MembershipDetailContent key={membershipId} membershipId={membershipId} />;
}

function MembershipDetailContent({ membershipId }: { membershipId: string }) {
  const { locale, t } = useAdminI18n();
  const toast = useToast();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const { intent, controls } = useAdminMutationIntent<UsageIntent, true>(
    "membership-usage",
    membershipId,
  );
  const replayUsage = intent?.phase === "unknown" ? intent.payload : null;
  const savingRef = useRef(false);
  const mounted = useRef(false);
  const accessRevision = useRef(0);
  const revoked = useRef(false);
  const reads = useRef(new Map<string, AbortController>());
  const objectUrls = useRef(new Map<string, number>());
  const [accessLost, setAccessLost] = useState(false);
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
  const [downloadingContracts, setDownloadingContracts] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [usageLines, setUsageLines] = useState<UsageLineForm[]>([]);
  const [usageUnitErrors, setUsageUnitErrors] = useState<Record<number, string>>({});
  const [usageNote, setUsageNote] = useState("");
  const [undoItem, setUndoItem] = useState<MembershipUsage | null>(null);
  const [undoReason, setUndoReason] = useState("");
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const busy = saving || intent?.phase === "pending";

  const cleanupReads = useCallback(() => {
    reads.current.forEach((controller) => controller.abort());
    reads.current.clear();
    objectUrls.current.forEach((timer, url) => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
    });
    objectUrls.current.clear();
  }, []);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      accessRevision.current += 1;
      cleanupReads();
    };
  }, [cleanupReads]);

  const ownsAccess = useCallback(
    (revision = accessRevision.current) =>
      mounted.current && isCurrent() && !revoked.current && revision === accessRevision.current,
    [isCurrent],
  );

  const retire = useCallback(
    (cause: unknown) => {
      revoked.current = true;
      accessRevision.current += 1;
      cleanupReads();
      controls.retire();
      setAccessLost(true);
      setItem(null);
      setHistory(null);
      setHistoryMeta(null);
      setContract(null);
      setCreateOpen(false);
      setUsageLines([]);
      setUsageNote("");
      setUndoItem(null);
      setUndoReason("");
      setRevokeOpen(false);
      setRevokeReason("");
      setDownloadingContracts(new Set());
      setLoading(false);
      setLoadError(() => cause);
    },
    [cleanupReads, controls],
  );

  const startRead = useCallback(
    (key: string) => {
      reads.current.get(key)?.abort();
      const controller = new AbortController();
      reads.current.set(key, controller);
      const revision = accessRevision.current;
      const current = () =>
        mounted.current &&
        isCurrent() &&
        revision === accessRevision.current &&
        !controller.signal.aborted;
      const finish = () => {
        if (reads.current.get(key) === controller) reads.current.delete(key);
      };
      return { signal: controller.signal, current, finish };
    },
    [isCurrent],
  );

  const loadMembership = useCallback(async () => {
    const read = startRead("membership");
    setLoading(true);
    try {
      const latest = await api<AdminMembership>(
        `admin/memberships/${membershipId}?locale=${locale}`,
        { signal: read.signal },
        { shouldRedirectToLogin: read.current },
      );
      if (!read.current()) return null;
      if (latest?.id !== membershipId) throw invalidApiResponse();
      if (revoked.current) {
        revoked.current = false;
        setAccessLost(false);
      }
      setItem(latest);
      setLoadError(null);
      return latest;
    } catch (caught) {
      if (read.current()) {
        if (isProtectedDataError(caught) || (caught as ClientApiError | null)?.status === 404)
          retire(caught);
        else setLoadError(() => caught);
      }
      return null;
    } finally {
      if (read.current()) setLoading(false);
      read.finish();
    }
  }, [locale, membershipId, retire, startRead]);

  const loadHistory = useCallback(async () => {
    if (!ownsAccess()) return;
    const read = startRead("history");
    setHistory(null);
    setHistoryError("");
    try {
      const payload = await apiEnvelope<MembershipUsage[], PaginationMeta>(
        `admin/memberships/${membershipId}/history?page=${historyPage}&locale=${locale}`,
        { signal: read.signal },
        { shouldRedirectToLogin: read.current },
      );
      if (!read.current()) return;
      const { data, meta } = requirePaginatedList(
        payload,
        (usage) => {
          if (usage?.membership_id !== membershipId || !usage.id || !Array.isArray(usage.lines))
            throw invalidApiResponse();
        },
        historyPage,
      );
      setHistory(data);
      setHistoryMeta(meta);
    } catch (caught) {
      if (!read.current()) return;
      if (isProtectedDataError(caught)) retire(caught);
      else setHistoryError(requestErrorMessage(caught, t));
    } finally {
      read.finish();
    }
  }, [historyPage, locale, membershipId, ownsAccess, retire, startRead, t]);

  const contractId = item?.contract?.id ?? "";
  const currentContractId = useRef("");
  currentContractId.current = contractId;
  const contractVersions: CSAContractVersion[] = [...(contract?.versions ?? [])].sort(
    (left, right) => left.version_number - right.version_number,
  );
  const loadContract = useCallback(async () => {
    const read = startRead("contract");
    setContractError("");
    setContractPdfError("");
    if (!contractId || !ownsAccess()) {
      setContract(null);
      setContractLoading(false);
      read.finish();
      return;
    }
    setContractLoading(true);
    try {
      const latest = await api<AdminCSAContract>(
        `admin/memberships/${membershipId}/contract`,
        { signal: read.signal },
        { shouldRedirectToLogin: read.current },
      );
      if (!read.current()) return;
      if (latest?.id !== contractId || !Array.isArray(latest.available_locales))
        throw invalidApiResponse();
      setContract(latest);
    } catch (caught) {
      if (!read.current()) return;
      if (isProtectedDataError(caught)) retire(caught);
      else {
        setContract(null);
        setContractError(t.memberships.contractUnavailable);
      }
    } finally {
      if (read.current()) setContractLoading(false);
      read.finish();
    }
  }, [contractId, membershipId, ownsAccess, retire, startRead, t.memberships.contractUnavailable]);

  useEffect(() => void loadMembership(), [loadMembership]);
  useEffect(() => {
    if (!accessLost) void loadHistory();
  }, [accessLost, loadHistory]);
  useEffect(() => void loadContract(), [loadContract]);
  useEffect(() => {
    if (intent?.phase !== "confirmed" || !item || !ownsAccess()) return;
    const revision = accessRevision.current;
    controls.clear();
    void Promise.all([loadMembership(), loadHistory()]).then(() => {
      if (ownsAccess(revision)) toast(t.memberships.usageCreated);
    });
  }, [
    controls,
    intent,
    item,
    loadHistory,
    loadMembership,
    ownsAccess,
    t.memberships.usageCreated,
    toast,
  ]);

  async function downloadContract(localeToDownload: "vi" | "en", versionId?: string) {
    const version = versionId ? contract?.versions?.find((entry) => entry.id === versionId) : null;
    const available = version
      ? version.available_locales.includes(localeToDownload)
      : !versionId && contract?.available_locales.includes(localeToDownload);
    const downloadKey = `${versionId ?? "current"}:${localeToDownload}`;
    const requestKey = `pdf:${downloadKey}`;
    if (
      !available ||
      !contractId ||
      contract?.id !== contractId ||
      !ownsAccess() ||
      reads.current.has(requestKey)
    )
      return;
    const read = startRead(requestKey);
    setDownloadingContracts((current) => new Set(current).add(downloadKey));
    setContractPdfError("");
    try {
      const file = await apiFile(
        `admin/memberships/${membershipId}/contract/pdf?locale=${localeToDownload}${versionId ? `&version_id=${encodeURIComponent(versionId)}` : ""}`,
        { signal: read.signal },
      );
      if (!read.current() || currentContractId.current !== contractId) return;
      if (!file.blob.size) throw invalidApiResponse();
      const objectUrl = URL.createObjectURL(file.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.filename;
      anchor.click();
      objectUrls.current.set(
        objectUrl,
        window.setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          objectUrls.current.delete(objectUrl);
        }, 1_000),
      );
    } catch (caught) {
      if (!read.current()) return;
      if (isProtectedDataError(caught)) retire(caught);
      else setContractPdfError(t.memberships.contractPdfUnavailable);
    } finally {
      if (read.current())
        setDownloadingContracts((current) => {
          const active = new Set(current);
          active.delete(downloadKey);
          return active;
        });
      read.finish();
    }
  }

  function openCreate() {
    if (!item || busy || !ownsAccess() || intent?.phase === "retired") return;
    const firstQuota = item.quota?.[0];
    if (replayUsage)
      setUsageLines(
        replayUsage.lines.map((line) => ({
          productId: line.product_id,
          units: String(line.units),
        })),
      );
    else if (firstQuota && item.status === "active")
      setUsageLines([{ productId: firstQuota.product_id, units: "1" }]);
    else return;
    setUsageUnitErrors({});
    setUsageNote(replayUsage?.note ?? "");
    setActionError(replayUsage ? t.memberships.usageUncertain : "");
    setCreateOpen(true);
  }

  function closeDialogs() {
    if (busy) return;
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
    if (!item || savingRef.current || !ownsAccess() || (!replayUsage && item.status !== "active"))
      return;
    if (replayUsage) return sendUsage();
    const productIds = usageLines.map((line) => line.productId);
    const validatedLines: Array<{ productId: string; units: number }> = [];
    const nextUnitErrors: Record<number, string> = {};
    usageLines.forEach((line, index) => {
      const parsed = parsePositiveQuotaUnits(line.units);
      if (parsed.error) {
        nextUnitErrors[index] = numericInputErrorMessage(
          parsed.error,
          { ...t.common.numericInput, decimalFormat: t.memberships.quotaUnitsFormat },
          MAX_POSITIVE_INTEGER,
        );
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
    return sendUsage({
      membership_id: item.id,
      idempotency_key: crypto.randomUUID(),
      lines: validatedLines.map((line) => ({ product_id: line.productId, units: line.units })),
      note: usageNote.trim(),
    });
  }

  async function sendUsage(payload?: UsageIntent) {
    const attempt = controls.begin(payload);
    if (!attempt) return;
    const revision = accessRevision.current;
    savingRef.current = true;
    setSaving(true);
    setActionError("");
    try {
      const usage = await api<MembershipUsage>(
        `admin/membership-usage?locale=${locale}`,
        {
          method: "POST",
          body: JSON.stringify(attempt.payload),
        },
        { shouldRedirectToLogin: () => ownsAccess(revision) },
      );
      if (
        !usage?.id ||
        usage.membership_id !== membershipId ||
        !["applied", "reversed"].includes(usage.status)
      )
        throw invalidApiResponse();
      if (
        !isCurrent() ||
        !controls.settle(
          attempt,
          ownsAccess(revision) ? null : { phase: "confirmed", receipt: true },
        ) ||
        !ownsAccess(revision)
      )
        return;
      await Promise.all([loadMembership(), loadHistory()]);
      if (!ownsAccess(revision)) return;
      setCreateOpen(false);
      toast(t.memberships.usageCreated);
    } catch (caught) {
      if (!isCurrent()) return;
      const denied = isProtectedDataError(caught);
      const unknown =
        isUncertainMutationError(caught) ||
        (replayUsage && (caught as ClientApiError | null)?.message === "csrf_rejected");
      if (
        !controls.settle(
          attempt,
          denied ? { phase: "retired" } : unknown ? { ...attempt, phase: "unknown" } : null,
        ) ||
        !ownsAccess(revision)
      )
        return;
      if (denied) retire(caught);
      else setActionError(unknown ? t.memberships.usageUncertain : requestErrorMessage(caught, t));
    } finally {
      savingRef.current = false;
      if (mounted.current && isCurrent()) setSaving(false);
    }
  }

  async function undoUsage() {
    if (!undoItem || busy || savingRef.current || !undoReason.trim() || !ownsAccess()) return;
    const revision = accessRevision.current;
    savingRef.current = true;
    setSaving(true);
    setActionError("");
    try {
      await api<MembershipUsage>(
        `admin/membership-usage/${undoItem.id}/undo?locale=${locale}`,
        {
          method: "POST",
          body: JSON.stringify({ reason: undoReason.trim() }),
        },
        { shouldRedirectToLogin: () => ownsAccess(revision) },
      );
      if (!ownsAccess(revision)) return;
      await Promise.all([loadMembership(), loadHistory()]);
      if (!ownsAccess(revision)) return;
      setUndoItem(null);
      setUndoReason("");
      toast(t.memberships.usageUndone);
    } catch (caught) {
      if (ownsAccess(revision)) {
        if (isProtectedDataError(caught)) retire(caught);
        else setActionError(requestErrorMessage(caught, t));
      }
    } finally {
      savingRef.current = false;
      if (mounted.current && isCurrent()) setSaving(false);
    }
  }

  async function revokeMembership() {
    if (!item || busy || savingRef.current || !revokeReason.trim() || !ownsAccess()) return;
    const revision = accessRevision.current;
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
        { shouldRedirectToLogin: () => ownsAccess(revision) },
      );
      if (!ownsAccess(revision)) return;
      if (revoked?.id !== membershipId) throw invalidApiResponse();
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
      if (!ownsAccess(revision)) return;
      setRevokeOpen(false);
      setRevokeReason("");
      toast(t.memberships.revokeSuccess);
    } catch (caught) {
      if (ownsAccess(revision)) {
        if (isProtectedDataError(caught)) retire(caught);
        else setActionError(requestErrorMessage(caught, t));
      }
    } finally {
      savingRef.current = false;
      if (mounted.current && isCurrent()) setSaving(false);
    }
  }

  if (loadError && !item)
    return (
      <div className="panel load-error-state">
        <Alert color="red" role="alert">
          {requestErrorMessage(loadError, t)}
        </Alert>
        <Button
          type="submit"
          variant="default"
          disabled={loading}
          onClick={() => void loadMembership()}
        >
          {t.common.retry}
        </Button>
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
    ].every(Number.isFinite)
      ? cycleTotalCandidate
      : null;

  return (
    <>
      <div className="detail-page-heading membership-detail-heading">
        <DetailBackLink href={`/csa-customers/${item.customer_id}`} label={t.csaCustomers.back} />
      </div>
      {loadError && (
        <div className="load-error-state">
          <Alert color="red" role="alert">
            {requestErrorMessage(loadError, t)}
          </Alert>
          <Button
            variant="default"
            disabled={loading}
            onClick={() => void loadMembership()}
            type="button"
          >
            {t.common.retry}
          </Button>
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
          {item.extension_end_date && (
            <p>
              {t.memberships.extensionEndDate}: {formatAdminDate(item.extension_end_date)}
            </p>
          )}
          {item.status === "frozen" && <p>{csaRoundsCopy(locale).frozenHint}</p>}
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
          {(item.status === "active" || replayUsage) && (
            <Button
              type="submit"

              disabled={
                busy || intent?.phase === "retired" || (!replayUsage && !item.quota?.length)
              }
              onClick={openCreate}
            >
              {replayUsage ? t.memberships.retryUsage : t.memberships.createUsage}
            </Button>
          )}
          {(item.status === "active" || item.status === "scheduled") && (
            <Button
              type="submit"
              color="red"
              disabled={busy}
              onClick={() => {
                setRevokeReason("");
                setActionError("");
                setRevokeOpen(true);
              }}
              ref={revokeButtonRef}
            >
              {t.memberships.revokeButton}
            </Button>
          )}
        </div>
      </section>
      {item.status === "scheduled" && <Alert color="yellow">{t.memberships.scheduledNotice}</Alert>}
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
              <Alert color="red" role="alert">
                {contractError}
              </Alert>
              <Button variant="default" onClick={() => void loadContract()} type="button">
                {t.common.retry}
              </Button>
            </div>
          ) : !contract ? (
            <DataState kind="empty" title={t.memberships.contractEmpty} compact />
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
                    <Button
                      variant="default"
                      disabled={downloadingContracts.has("current:vi")}
                      onClick={() => void downloadContract("vi")}
                      type="button"
                    >
                      {downloadingContracts.has("current:vi")
                        ? t.memberships.downloadingContract
                        : t.memberships.downloadContractVi}
                    </Button>
                  )}
                  {contract.available_locales.includes("en") && (
                    <Button
                      variant="default"
                      disabled={downloadingContracts.has("current:en")}
                      onClick={() => void downloadContract("en")}
                      type="button"
                    >
                      {downloadingContracts.has("current:en")
                        ? t.memberships.downloadingContract
                        : t.memberships.downloadContractEn}
                    </Button>
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
                              <Badge color="gray">{t.memberships.contractCurrentVersion}</Badge>
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
                                <Button
                                  variant="default"
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
                                </Button>
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
                <Alert color="red" role="alert">
                  {contractPdfError}
                </Alert>
              )}
            </>
          )}
        </section>
        <section className="panel membership-wide">
          <div className="panel-head">
            <h2>{t.memberships.cycles}</h2>
          </div>
          {!cycleRows.length ? (
            <DataState kind="empty" title={t.memberships.noCycles} compact />
          ) : (
            <Table.ScrollContainer type="native" minWidth={600} className="table-wrap">
              <Table aria-label={t.memberships.cycles} className="cycle-quota-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t.memberships.cycleReceipt}</Table.Th>
                    <Table.Th>{t.memberships.cycleRange}</Table.Th>
                    <Table.Th>{t.memberships.granted}</Table.Th>
                    <Table.Th>{t.memberships.received}</Table.Th>
                    <Table.Th>{t.memberships.remaining}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {cycleRows.map(({ cycle, quantities }) => (
                    <Table.Tr key={cycle.sequence}>
                      <Table.Td>
                        <strong>
                          {t.memberships.cycle.replace("{number}", String(cycle.sequence))}
                        </strong>
                      </Table.Td>
                      <Table.Td>
                        {formatAdminDate(cycle.start_date)} –{" "}
                        {formatAdminDate(membershipLastReceiptDate(cycle.end_date))}
                      </Table.Td>
                      <Table.Td>{quantity(quantities?.granted)}</Table.Td>
                      <Table.Td>{quantity(quantities?.received)}</Table.Td>
                      <Table.Td>
                        <strong>{quantity(quantities?.remaining)}</strong>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
                <Table.Tfoot>
                  <Table.Tr>
                    <Table.Th scope="row">{t.memberships.total}</Table.Th>
                    <Table.Td />
                    <Table.Td>{quantity(cycleTotal?.granted)}</Table.Td>
                    <Table.Td>{quantity(cycleTotal?.received)}</Table.Td>
                    <Table.Td>{quantity(cycleTotal?.remaining)}</Table.Td>
                  </Table.Tr>
                </Table.Tfoot>
              </Table>
            </Table.ScrollContainer>
          )}
        </section>
      </div>
      <section className="panel usage-history">
        <div className="panel-head">
          <h2>{t.memberships.usageHistory}</h2>
        </div>
        {historyError && (
          <Alert color="red" role="alert">
            {historyError}
          </Alert>
        )}
        {!history ? (
          historyError ? null : (
            <p>{t.memberships.loadingHistory}</p>
          )
        ) : !history.length ? (
          <DataState kind="empty" title={t.memberships.noUsage} compact />
        ) : (
          <div className="usage-list">
            {history.map((usage) => (
              <article className="usage-card" key={usage.id}>
                <div className="usage-card-head">
                  <div>
                    <UiStatus
                      domain="membership-usage"
                      status={usage.status}
                      label={t.memberships.usageStatuses[usage.status]}
                    />
                    <time>{formatAdminDateTime(usage.created_at)}</time>
                  </div>
                  {usage.order_id ? (
                    <Button
                      component={Link}
                      variant="default"
                      href={`/store-orders/${usage.order_id}`}
                    >
                      {csaRoundsCopy(locale).order}
                    </Button>
                  ) : (
                    usage.status === "applied" &&
                    item.status !== "revoked" && (
                      <Button
                        type="submit"
                        variant="default"
                        disabled={saving}
                        onClick={() => {
                          setUndoItem(usage);
                          setUndoReason("");
                          setActionError("");
                        }}
                      >
                        {t.memberships.undoUsage}
                      </Button>
                    )
                  )}
                </div>
                <ul>
                  {usage.lines.map((line) => (
                    <li key={line.product_id}>
                      <strong>{line.product_name}</strong>
                      {line.snapshot_complete === false && (
                        <Badge color="orange">{t.memberships.legacySnapshotWarning}</Badge>
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
          busy={busy}
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
                <FormField label={t.memberships.product + " *"} className="field">
                  <FormSelect
                    aria-label={`${t.memberships.product} ${index + 1}`}
                    disabled={busy || Boolean(replayUsage)}
                    onChange={(selectedValue) =>
                      updateUsageLine(index, { productId: selectedValue ?? "" })
                    }
                    value={line.productId}
                    data={[
                      ...(item.quota
                        ?.filter(
                          (quota) =>
                            !selected.has(quota.product_id) || quota.product_id === line.productId,
                        )
                        .map((quota) => ({
                          value: quota.product_id,
                          label:
                            quota.product_name +
                            "(" +
                            t.memberships.remaining +
                            ":" +
                            quota.remaining_units +
                            ")",
                        })) ?? []),
                    ]}
                  />
                </FormField>
                <label className="field">
                  <span>{t.memberships.units} *</span>
                  <FormInput
                    aria-label={`${t.memberships.units} ${index + 1}`}
                    aria-invalid={Boolean(usageUnitErrors[index])}

                    disabled={busy || Boolean(replayUsage)}
                    inputMode="decimal"
                    onChange={(event) => {
                      updateUsageLine(index, {
                        units: event.target.value.replace(/,/g, "."),
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
                <Button
                  variant="default"
                  disabled={busy || Boolean(replayUsage) || usageLines.length === 1}
                  onClick={() =>
                    setUsageLines((current) =>
                      current.filter((_, lineIndex) => lineIndex !== index),
                    )
                  }
                  type="button"
                >
                  {t.memberships.removeLine}
                </Button>
              </div>
            ))}
          </div>
          <Button
            className="add-usage-line"
            variant="default"
            disabled={busy || Boolean(replayUsage) || selected.size >= (item.quota?.length ?? 0)}
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
          </Button>
          <label className="field usage-note">
            <span>{t.memberships.note}</span>
            <FormTextarea
              disabled={busy || Boolean(replayUsage)}
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
            <FormTextarea
              autoFocus

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
            <FormTextarea
              autoFocus

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
