"use client";

import { useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { api } from "@/lib/client-api";
import { formatMembershipMoney } from "@/lib/membership-format";
import type { AdminMembershipPaymentPlan, MembershipPackagePriceOption } from "@/lib/types";

type Draft = {
  id?: string;
  name: string;
  payment_type: "full" | "installment";
  total_amount: string;
  installments: Array<{ amount: string; cycle_count: string }>;
};

type PaymentPlanCopy = ReturnType<typeof useAdminI18n>["t"]["membershipCatalog"]["paymentPlans"];

const paymentPlanErrors: Record<string, { message: keyof PaymentPlanCopy; field?: string }> = {
  payment_plan_name_invalid: { message: "error" },
  payment_plan_type_invalid: { message: "typeInvalid", field: "payment_type" },
  payment_plan_installment_not_allowed: { message: "oneMonthOnly", field: "payment_type" },
  payment_plan_duration_invalid: { message: "durationInvalid" },
  payment_plan_total_invalid: { message: "totalInvalid", field: "total_amount" },
  payment_plan_amount_invalid: { message: "amountInvalid", field: "installments" },
  payment_plan_amount_total_mismatch: { message: "amountMismatch", field: "total_amount" },
  payment_plan_cycle_count_invalid: { message: "cycleInvalid", field: "installments" },
  payment_plan_cycle_total_mismatch: { message: "cycleMismatch", field: "installments" },
  payment_plan_installments_required: { message: "countInvalid", field: "installments" },
  payment_plan_installment_count_invalid: { message: "countInvalid", field: "installment_count" },
  payment_plan_installment_count_mismatch: { message: "countInvalid", field: "installment_count" },
  payment_plan_sequence_invalid: { message: "sequenceInvalid", field: "sequence" },
  payment_plan_sequence_duplicate: { message: "sequenceInvalid", field: "sequence" },
  payment_plan_sequence_gap: { message: "sequenceInvalid", field: "sequence" },
  payment_plan_in_use: { message: "inUseError" },
  payment_plan_deactivate_before_edit: { message: "deactivateFirst" },
  payment_plan_deactivate_before_delete: { message: "deactivateFirst" },
  payment_plan_unavailable: { message: "unavailable" },
  payment_plan_active_duplicate: { message: "activeDuplicate" },
  payment_plan_conflict: { message: "conflict" },
};

function firstFieldPath(value: unknown, path: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      const found = firstFieldPath(
        entry,
        typeof entry === "object" ? [...path, String(index)] : path,
      );
      if (found) return found;
    }
    return path.length ? path.join(".") : null;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const found = firstFieldPath(entry, [...path, key]);
      if (found) return found;
    }
    return path.length ? path.join(".") : null;
  }
  return path.length ? path.join(".") : null;
}

function mappedPaymentPlanError(caught: unknown, copy: PaymentPlanCopy) {
  const error = caught as {
    message?: unknown;
    payload?: { errors?: Array<{ code?: unknown; fields?: unknown }> };
  };
  const entry = error?.payload?.errors?.[0];
  const code = typeof entry?.code === "string" ? entry.code : error?.message;
  const mapped = typeof code === "string" ? paymentPlanErrors[code] : undefined;
  const field = firstFieldPath(entry?.fields) ?? mapped?.field;
  const fieldCopy: Record<string, keyof PaymentPlanCopy> = {
    payment_type: "typeInvalid",
    total_amount: "totalInvalid",
    installment_count: "countInvalid",
    installments: "countInvalid",
    amount: "amountInvalid",
    cycle_count: "cycleInvalid",
    sequence: "sequenceInvalid",
  };
  const leaf = field?.split(".").at(-1) ?? "";
  const messageKey = mapped?.message ?? fieldCopy[leaf];
  const recognizedField =
    field &&
    (fieldCopy[field] ||
      /^installments\.\d+\.(amount|cycle_count)$/u.test(field) ||
      field === "sequence")
      ? field
      : null;
  return { field: recognizedField, message: messageKey ? copy[messageKey] : copy.error };
}

const integer = (value: string) => {
  if (!/^[1-9]\d*$/u.test(value)) return null;
  const parsed = BigInt(value);
  return parsed <= 9223372036854775807n ? parsed : null;
};
const digits = (value: string) => value.replace(/\D/gu, "");

export function paymentPlanDisplayName(plan: AdminMembershipPaymentPlan, copy: PaymentPlanCopy) {
  return plan.payment_type === "full"
    ? copy.autoNameFull
    : copy.autoNameInstallment.replace("{count}", String(plan.installment_count));
}

function draftFor(option: MembershipPackagePriceOption, plan?: AdminMembershipPaymentPlan): Draft {
  const durationMonths = option.duration_months;
  const defaultTotal = option.total_price_vnd;
  if (durationMonths === 1) {
    return {
      ...(plan ? { id: plan.id } : {}),
      name: plan?.name ?? "",
      payment_type: "full",
      total_amount: plan?.total_amount ?? defaultTotal,
      installments: [{ amount: plan?.total_amount ?? defaultTotal, cycle_count: "1" }],
    };
  }
  return plan
    ? {
        id: plan.id,
        name: plan.name,
        payment_type: plan.payment_type,
        total_amount: plan.total_amount,
        installments:
          plan.payment_type === "full"
            ? [
                {
                  amount: plan.installments[0]?.amount ?? "",
                  cycle_count: String(durationMonths),
                },
              ]
            : plan.installments.map((row) => ({
                amount: row.amount,
                cycle_count: String(row.cycle_count),
              })),
      }
    : {
        name: "",
        payment_type: "full",
        total_amount: defaultTotal,
        installments: [{ amount: defaultTotal, cycle_count: String(durationMonths) }],
      };
}

function distributeMonths(
  installments: Draft["installments"],
  durationMonths: number,
  installmentCount: number,
): Draft["installments"] {
  const base = Math.floor(durationMonths / installmentCount);
  const remainder = durationMonths % installmentCount;
  return Array.from({ length: installmentCount }, (_, index) => ({
    amount: installments[index]?.amount ?? "",
    cycle_count: String(base + (index === installmentCount - 1 ? remainder : 0)),
  }));
}

function draftPreview(draft: Draft, durationMonths: number) {
  const total = integer(draft.total_amount);
  const amounts = draft.installments.map((row) => integer(row.amount));
  const cycles = draft.installments.map((row) => integer(row.cycle_count));
  const missingRows =
    amounts.some((amount) => amount === null) || cycles.some((count) => count === null);
  const amountSum = amounts.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n);
  const cycleSum = cycles.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n);
  const count = draft.installments.length;
  const countInvalid =
    draft.payment_type === "full" ? count !== 1 : count < 2 || count > durationMonths;
  const singleMonthInvalid =
    durationMonths === 1 && (draft.payment_type !== "full" || count !== 1 || cycles[0] !== 1n);
  const amountMismatch = total !== null && amountSum !== total;
  const cycleMismatch = cycleSum !== BigInt(durationMonths);
  return {
    amountSum,
    cycleSum,
    missingRows,
    amountMismatch,
    cycleMismatch,
    countInvalid,
    singleMonthInvalid,
    valid:
      total !== null &&
      !missingRows &&
      !amountMismatch &&
      !cycleMismatch &&
      !countInvalid &&
      !singleMonthInvalid,
  };
}

function savingsPreview(
  option: Pick<MembershipPackagePriceOption, "monthly_price_vnd" | "duration_months">,
  total: string,
) {
  const monthly = integer(option.monthly_price_vnd);
  const amount = integer(total);
  const durationMonths = option.duration_months;
  if (durationMonths <= 1 || monthly === null || amount === null) return null;
  const regular = monthly * BigInt(durationMonths);
  if (regular <= 0n || amount >= regular) return null;
  const saved = regular - amount;
  const hundredths = (saved * 10000n + regular / 2n) / regular;
  return {
    regular,
    saved,
    percent: `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, "0")}`,
  };
}

function invalidOneMonthPlan(plan: AdminMembershipPaymentPlan, durationMonths: number) {
  const installment = plan.installments[0];
  return (
    durationMonths === 1 &&
    (plan.payment_type !== "full" ||
      plan.installment_count !== 1 ||
      plan.installments.length !== 1 ||
      installment?.cycle_count !== 1 ||
      installment?.amount !== plan.total_amount)
  );
}

export function MembershipPaymentPlanManager({
  option,
  onReload,
}: {
  option: MembershipPackagePriceOption;
  onReload: () => Promise<void>;
}) {
  const { locale, t } = useAdminI18n();
  const copy = t.membershipCatalog.paymentPlans;
  const busyRef = useRef(false);
  const closeDraftAfterReloadRef = useRef(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [needsReload, setNeedsReload] = useState(false);
  const [deleting, setDeleting] = useState<AdminMembershipPaymentPlan | null>(null);
  const plans = option.payment_plans ?? [];
  const base = `admin/membership-price-options/${option.id}/payment-plans`;
  const fieldId = (suffix: string) => `payment-plan-${option.id}-${suffix}`;
  const preview = draft ? draftPreview(draft, option.duration_months) : null;
  const comparison = draft ? savingsPreview(option, draft.total_amount) : null;
  const totalError =
    fieldErrors.total_amount ||
    (draft && integer(draft.total_amount) === null
      ? copy.totalInvalid
      : preview?.amountMismatch
        ? copy.amountMismatch
        : "");
  const scheduleMonthsError =
    preview?.cycleMismatch && draft?.installments.every((row) => integer(row.cycle_count) !== null)
      ? copy.cycleMismatch
      : "";
  const scheduleError = preview?.countInvalid ? copy.countInvalid : scheduleMonthsError;

  async function perform(path: string, method: "POST" | "PATCH" | "DELETE", body?: object) {
    if (busyRef.current || needsReload) return "failed" as const;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      await api(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      try {
        await onReload();
      } catch {
        setNeedsReload(true);
        setError(copy.reloadError);
        return "reload-failed" as const;
      }
      return "complete" as const;
    } catch (caught) {
      const mapped = mappedPaymentPlanError(caught, copy);
      if (draft && mapped.field) setFieldErrors({ [mapped.field]: mapped.message });
      else setError(mapped.message);
      return "failed" as const;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function retryReload() {
    if (busyRef.current || !needsReload) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onReload();
      setNeedsReload(false);
      setError("");
      if (closeDraftAfterReloadRef.current) {
        closeDraftAfterReloadRef.current = false;
        setDraft(null);
      }
    } catch {
      setError(copy.reloadError);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function save() {
    if (!draft || !preview?.valid) return;
    const payload = {
      name:
        draft.name.trim() ||
        (draft.payment_type === "full"
          ? copy.autoNameFull
          : copy.autoNameInstallment.replace("{count}", String(draft.installments.length))),
      payment_type: draft.payment_type,
      total_amount: draft.total_amount,
      installment_count: draft.installments.length,
      installments: draft.installments.map((row, index) => ({
        sequence: index + 1,
        amount: row.amount,
        cycle_count: Number(row.cycle_count),
      })),
    };
    const saved = await perform(
      draft.id ? `${base}/${draft.id}` : base,
      draft.id ? "PATCH" : "POST",
      payload,
    );
    if (saved === "complete") setDraft(null);
    if (saved === "reload-failed") closeDraftAfterReloadRef.current = true;
  }

  function updateRow(index: number, field: "amount" | "cycle_count", value: string) {
    if (field === "cycle_count" && draft?.payment_type === "full") return;
    setFieldErrors({});
    setError("");
    setDraft((current) =>
      current
        ? {
            ...current,
            installments: current.installments.map((row, rowIndex) =>
              rowIndex === index
                ? {
                    ...row,
                    [field]: field === "cycle_count" && value.includes("-") ? "" : digits(value),
                  }
                : row,
            ),
          }
        : current,
    );
  }

  function addInstallment() {
    setDraft((current) => {
      if (
        !current ||
        current.payment_type !== "installment" ||
        current.installments.length >= option.duration_months
      )
        return current;
      return {
        ...current,
        installments: distributeMonths(
          current.installments,
          option.duration_months,
          current.installments.length + 1,
        ),
      };
    });
    setFieldErrors({});
  }

  function selectPaymentType(paymentType: Draft["payment_type"]) {
    if (!draft || busy || needsReload || draft.payment_type === paymentType) return;
    setFieldErrors({});
    setError("");
    setDraft({
      ...draft,
      payment_type: paymentType,
      installments:
        paymentType === "full"
          ? distributeMonths(draft.installments, option.duration_months, 1)
          : distributeMonths(
              draft.installments,
              option.duration_months,
              Math.min(Math.max(draft.installments.length, 2), option.duration_months),
            ),
    });
  }

  return (
    <div className="payment-plan-manager">
      <div className="panel-head">
        <h5>{copy.title}</h5>
        {!draft ? (
          <button
            className="button secondary"
            disabled={busy || needsReload}
            onClick={() => {
              setFieldErrors({});
              setError("");
              setDraft(draftFor(option));
            }}
            type="button"
          >
            {copy.add}
          </button>
        ) : null}
      </div>
      {plans.length === 0 && !draft ? <p>{copy.empty}</p> : null}
      <ul className="payment-plan-list">
        {plans.map((plan) => (
          <li key={plan.id}>
            <div>
              <strong>{paymentPlanDisplayName(plan, copy)}</strong>{" "}
              <span className={`badge ${plan.is_active ? "" : "warm"}`}>
                {plan.is_active ? copy.active : copy.inactive}
              </span>
              {plan.in_use ? <small>{copy.inUse}</small> : null}
              {invalidOneMonthPlan(plan, option.duration_months) ? (
                <p className="field-error" role="alert">
                  {copy.legacyOneMonthWarning}
                </p>
              ) : null}
              <p>
                {plan.payment_type === "full" ? copy.full : copy.installment} · {copy.count}:{" "}
                {plan.installment_count} · {copy.total}:{" "}
                {formatMembershipMoney(plan.total_amount, locale)}
              </p>
            </div>
            <div className="row-actions">
              {!plan.is_active && !plan.in_use ? (
                <button
                  className="button secondary"
                  disabled={busy || needsReload}
                  onClick={() => {
                    setFieldErrors({});
                    setError("");
                    setDraft(draftFor(option, plan));
                  }}
                  type="button"
                >
                  {copy.edit}
                </button>
              ) : null}
              <button
                className="button secondary"
                disabled={
                  busy ||
                  needsReload ||
                  (!plan.is_active && invalidOneMonthPlan(plan, option.duration_months))
                }
                onClick={() =>
                  void perform(
                    `${base}/${plan.id}/${plan.is_active ? "deactivate" : "activate"}`,
                    "POST",
                  )
                }
                type="button"
              >
                {plan.is_active ? copy.deactivate : copy.activate}
              </button>
              {!plan.is_active && !plan.in_use ? (
                <button
                  className="button danger"
                  disabled={busy || needsReload}
                  onClick={() => setDeleting(plan)}
                  type="button"
                >
                  {copy.delete}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {draft ? (
        <div className="payment-plan-editor">
          <div className="payment-plan-type-row">
            <div className="label" id={fieldId("type-label")}>
              {copy.type}
            </div>
            <div
              aria-describedby={fieldErrors.payment_type ? fieldId("type-error") : undefined}
              aria-invalid={Boolean(fieldErrors.payment_type)}
              aria-labelledby={fieldId("type-label")}
              className="payment-plan-type-choices"
              role="radiogroup"
            >
              {(["full", "installment"] as const)
                .filter((paymentType) => paymentType === "full" || option.duration_months > 1)
                .map((paymentType) => (
                  <label
                    className={`payment-plan-type-option${draft.payment_type === paymentType ? " selected" : ""}`}
                    key={paymentType}
                  >
                    <input
                      aria-checked={draft.payment_type === paymentType}
                      checked={draft.payment_type === paymentType}
                      disabled={busy || needsReload}
                      name={fieldId("type")}
                      onChange={() => selectPaymentType(paymentType)}
                      type="radio"
                      value={paymentType}
                    />
                    <span>{paymentType === "full" ? copy.full : copy.installment}</span>
                  </label>
                ))}
            </div>
            {fieldErrors.payment_type ? (
              <span className="field-error" id={fieldId("type-error")} role="alert">
                {fieldErrors.payment_type}
              </span>
            ) : null}
          </div>
          <div className="payment-plan-total-row">
            <label className="field payment-plan-total-field">
              <span>{copy.total}</span>
              <input
                className="input"
                disabled={busy || needsReload}
                inputMode="numeric"
                maxLength={19}
                aria-invalid={Boolean(totalError)}
                aria-describedby={totalError ? fieldId("total-error") : undefined}
                onChange={(event) => {
                  setFieldErrors({});
                  setError("");
                  const value = digits(event.target.value);
                  setDraft({
                    ...draft,
                    total_amount: value,
                    installments:
                      option.duration_months === 1
                        ? [{ amount: value, cycle_count: "1" }]
                        : draft.installments,
                  });
                }}
                value={draft.total_amount}
              />
              {totalError ? (
                <span className="field-error" id={fieldId("total-error")} role="alert">
                  {totalError}
                </span>
              ) : null}
            </label>
            <span className="payment-plan-unit">VND</span>
          </div>
          <h6>{copy.schedule}</h6>
          <div className="payment-plan-schedule-head" aria-hidden="true">
            <span>{copy.paymentNumber}</span>
            <span>{copy.amount}</span>
            <span>{copy.cycleCount}</span>
            <span>{copy.totalAllocated}</span>
          </div>
          {draft.installments.map((row, index) => (
            <div className="payment-plan-schedule-row" key={index}>
              <strong>{copy.sequence.replace("{number}", String(index + 1))}</strong>
              <label className="field payment-plan-amount-field">
                <span className="payment-plan-schedule-field-label">{copy.amount}</span>
                <input
                  className="input"
                  disabled={busy || needsReload}
                  inputMode="numeric"
                  maxLength={19}
                  readOnly={option.duration_months === 1}
                  aria-invalid={Boolean(
                    fieldErrors[`installments.${index}.amount`] ||
                    (option.duration_months > 1 && integer(row.amount) === null),
                  )}
                  aria-describedby={
                    fieldErrors[`installments.${index}.amount`] ||
                    (option.duration_months > 1 && integer(row.amount) === null)
                      ? fieldId(`amount-${index}-error`)
                      : undefined
                  }
                  onChange={(event) => updateRow(index, "amount", event.target.value)}
                  value={row.amount}
                />
                {fieldErrors[`installments.${index}.amount`] ||
                (option.duration_months > 1 && integer(row.amount) === null) ? (
                  <span className="field-error" id={fieldId(`amount-${index}-error`)} role="alert">
                    {fieldErrors[`installments.${index}.amount`] || copy.amountInvalid}
                  </span>
                ) : null}
              </label>
              <label className="field payment-plan-months-field">
                <span className="payment-plan-schedule-field-label">{copy.cycleCount}</span>
                <input
                  className="input"
                  disabled={busy || needsReload}
                  inputMode="numeric"
                  maxLength={3}
                  readOnly={draft.payment_type === "full"}
                  aria-invalid={Boolean(
                    fieldErrors[`installments.${index}.cycle_count`] ||
                    integer(row.cycle_count) === null ||
                    scheduleMonthsError,
                  )}
                  aria-describedby={
                    fieldErrors[`installments.${index}.cycle_count`] ||
                    integer(row.cycle_count) === null
                      ? fieldId(`cycle-${index}-error`)
                      : scheduleMonthsError
                        ? fieldId("schedule-error")
                        : undefined
                  }
                  onChange={(event) => updateRow(index, "cycle_count", event.target.value)}
                  value={row.cycle_count}
                />
                {fieldErrors[`installments.${index}.cycle_count`] ||
                integer(row.cycle_count) === null ? (
                  <span className="field-error" id={fieldId(`cycle-${index}-error`)} role="alert">
                    {fieldErrors[`installments.${index}.cycle_count`] || copy.cycleInvalid}
                  </span>
                ) : null}
              </label>
              <span className="payment-plan-row-total">
                {integer(row.amount) !== null ? formatMembershipMoney(row.amount, locale) : "—"}
              </span>
              {draft.payment_type === "installment" && draft.installments.length > 2 ? (
                <button
                  aria-label={copy.removePayment.replace("{number}", String(index + 1))}
                  className="button danger icon-only-action payment-plan-remove-payment"
                  disabled={busy || needsReload}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      installments: distributeMonths(
                        draft.installments.filter((_, rowIndex) => rowIndex !== index),
                        option.duration_months,
                        draft.installments.length - 1,
                      ),
                    })
                  }
                  title={copy.removePayment.replace("{number}", String(index + 1))}
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
              ) : null}
            </div>
          ))}
          {fieldErrors.installments || fieldErrors.installment_count || fieldErrors.sequence ? (
            <p className="field-error" role="alert">
              {fieldErrors.installments || fieldErrors.installment_count || fieldErrors.sequence}
            </p>
          ) : null}
          {scheduleError ? (
            <p className="field-error" id={fieldId("schedule-error")} role="alert">
              {scheduleError}
            </p>
          ) : null}
          {draft.payment_type === "installment" ? (
            <button
              className="button secondary"
              disabled={busy || needsReload || draft.installments.length >= option.duration_months}
              onClick={addInstallment}
              type="button"
            >
              {copy.addInstallment}
            </button>
          ) : null}
          <div className="payment-plan-preview" aria-live="polite">
            <h6>{copy.preview}</h6>
            <p>
              {copy.previewSummary
                .replace("{months}", String(option.duration_months))
                .replace("{type}", draft.payment_type === "full" ? copy.full : copy.installment)}
              {" · "}
              {draft.installments.length === 1
                ? copy.previewCountOne
                : copy.previewCountMany.replace("{count}", String(draft.installments.length))}
            </p>
            <p className={preview?.valid ? "payment-plan-valid" : "field-error"}>
              {preview?.valid
                ? copy.validPreview
                : preview?.singleMonthInvalid
                  ? copy.oneMonthOnly
                  : preview?.countInvalid
                    ? copy.countInvalid
                    : preview?.missingRows
                      ? copy.rowsMissing
                      : preview?.amountMismatch
                        ? copy.amountMismatch
                        : preview?.cycleMismatch
                          ? copy.cycleMismatch
                          : copy.invalid}
            </p>
            <ol>
              {draft.installments.map((row, index) => (
                <li key={index}>
                  {copy.sequence.replace("{number}", String(index + 1))}:{" "}
                  {integer(row.amount) !== null ? formatMembershipMoney(row.amount, locale) : "—"} ·{" "}
                  {row.cycle_count || "—"} {copy.cyclesUnit}
                </li>
              ))}
            </ol>
            <dl className="detail-list">
              <div>
                <dt>{copy.total}</dt>
                <dd>
                  {integer(draft.total_amount) !== null
                    ? formatMembershipMoney(draft.total_amount, locale)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>{copy.totalAllocated}</dt>
                <dd>{formatMembershipMoney(preview?.amountSum.toString() ?? "0", locale)}</dd>
              </div>
              <div>
                <dt>{copy.cycles}</dt>
                <dd>
                  {preview?.cycleSum?.toString() ?? "—"} / {option.duration_months}
                </dd>
              </div>
              <div>
                <dt>{copy.first}</dt>
                <dd>
                  {integer(draft.installments[0]?.amount ?? "") !== null
                    ? formatMembershipMoney(draft.installments[0].amount, locale)
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
          {option.duration_months > 1 ? (
            <div className="payment-plan-comparison">
              <h6>{copy.comparison}</h6>
              {comparison ? (
                <dl className="detail-list">
                  <div>
                    <dt>{copy.monthlyBaseline}</dt>
                    <dd>{formatMembershipMoney(comparison.regular.toString(), locale)}</dd>
                  </div>
                  <div>
                    <dt>{copy.total}</dt>
                    <dd>{formatMembershipMoney(draft.total_amount, locale)}</dd>
                  </div>
                  <div>
                    <dt>{copy.saving}</dt>
                    <dd>
                      {formatMembershipMoney(comparison.saved.toString(), locale)} ·{" "}
                      {comparison.percent.replace(".", locale === "vi" ? "," : ".")}%
                    </dd>
                  </div>
                </dl>
              ) : (
                <p>{copy.noComparison}</p>
              )}
            </div>
          ) : null}
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="row-actions">
            <button
              className="button secondary"
              disabled={busy || needsReload}
              onClick={() => setDraft(null)}
              type="button"
            >
              {copy.cancel}
            </button>
            <button
              className="button"
              disabled={busy || needsReload || !preview?.valid}
              onClick={() => void save()}
              type="button"
            >
              {copy.save}
            </button>
          </div>
        </div>
      ) : null}
      {error && !draft ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {needsReload ? (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void retryReload()}
          type="button"
        >
          {copy.retryReload}
        </button>
      ) : null}
      {deleting ? (
        <ConfirmationDialog
          busy={busy}
          busyLabel={t.membershipCatalog.deleting}
          cancelLabel={copy.cancel}
          confirmLabel={copy.delete}
          danger
          error={error}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            void perform(`${base}/${deleting.id}`, "DELETE").then((removed) => {
              if (removed !== "failed") setDeleting(null);
            })
          }
          title={copy.confirmDelete}
        >
          <p>{paymentPlanDisplayName(deleting, copy)}</p>
        </ConfirmationDialog>
      ) : null}
    </div>
  );
}
