"use client";

import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { api } from "@/lib/client-api";
import {
  couponDateTimeInput,
  couponDateTimeToApi,
  couponErrorMessage,
  type AdminCoupon,
  type CouponDiscountType,
} from "@/lib/csa-coupons";
import { PageHeading } from "@/components/page-heading";
import { parsePositiveInteger } from "@/lib/numeric-input";

type Draft = {
  code: string;
  discount_type: CouponDiscountType;
  discount_value: string;
  maximum_discount_amount: string;
  usage_limit: string;
  starts_at: string;
  expires_at: string;
  minimum_amount: string;
};

const emptyDraft: Draft = {
  code: "",
  discount_type: "percent",
  discount_value: "",
  maximum_discount_amount: "",
  usage_limit: "1",
  starts_at: "",
  expires_at: "",
  minimum_amount: "",
};

function draftFromCoupon(coupon: AdminCoupon): Draft {
  return {
    code: coupon.code,
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value.replace(/\.0+$/u, ""),
    maximum_discount_amount: coupon.maximum_discount_amount ?? "",
    usage_limit: String(coupon.usage_limit),
    starts_at: couponDateTimeInput(coupon.starts_at),
    expires_at: couponDateTimeInput(coupon.expires_at, { end: true }),
    minimum_amount: coupon.minimum_amount ?? "",
  };
}

function preventInvalidNumericCharacter(
  event: KeyboardEvent<HTMLInputElement>,
  allowDecimal: boolean,
) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
  if (!/^[0-9]$/u.test(event.key) && !(allowDecimal && event.key === ".")) event.preventDefault();
}

function normalizeMoneyInput(raw: string): string | null {
  if (/^\d*$/u.test(raw)) return raw;
  if (/^\d{1,3}(?:[.,]\d{3})+$/u.test(raw)) return raw.replace(/[.,]/gu, "");
  return null;
}

function parsePercentHundredths(value: string): bigint | null {
  const match = /^(\d*)(?:\.(\d{0,2}))?$/u.exec(value);
  if (!match) return null;
  const whole = match[1] ? BigInt(match[1]) : 0n;
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return whole * 100n + fraction;
}

function restoreRejectedInput(input: HTMLInputElement, value: string) {
  const start = Math.min(input.selectionStart ?? value.length, value.length);
  const end = Math.min(input.selectionEnd ?? start, value.length);
  input.value = value;
  input.setSelectionRange(start, end);
}

function formatMoneyInput(value: string, locale: "vi" | "en"): string {
  if (!/^\d+$/u.test(value)) return value;
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(BigInt(value));
}

function timestampForPayload(value: string, previous?: string, end = false) {
  if (previous && value === couponDateTimeInput(previous, { end })) return previous;
  return couponDateTimeToApi(value);
}

export function CSACouponEditor({ couponId }: { couponId?: string }) {
  const router = useRouter();
  const { locale, t } = useAdminI18n();
  const [focusedMoney, setFocusedMoney] = useState<
    "discount_value" | "minimum_amount" | "maximum_discount_amount" | null
  >(null);
  const copy = t.csaCoupons;
  const busyRef = useRef(false);
  const initialLoadRef = useRef(false);
  const savedId = useRef<string | null>(couponId ?? null);
  const [coupon, setCoupon] = useState<AdminCoupon | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(Boolean(couponId));
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const reload = useCallback(async () => {
    setLoadError("");
    try {
      const latest = savedId.current
        ? await api<AdminCoupon>(`admin/csa-coupons/${savedId.current}`)
        : null;
      if (latest) {
        setCoupon(latest);
        setDraft(draftFromCoupon(latest));
      }
      setNeedsReload(false);
      setSubmitError("");
      if (!couponId && latest) router.replace(`/csa-coupons/${latest.id}`);
    } catch (error) {
      setLoadError(couponErrorMessage(error, t));
    } finally {
      setLoading(false);
    }
  }, [couponId, router, t]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void reload();
  }, [reload]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  }

  const used = Boolean(coupon?.used_count);

  function getValidationErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/u.test(draft.code.trim().toUpperCase()))
      errors.code = copy.errors.coupon_invalid;
    if (draft.discount_type === "percent") {
      const scaled = parsePercentHundredths(draft.discount_value);
      if (scaled === null || scaled === 0n || scaled > 10000n)
        errors.discount_value = copy.valueInvalid;
    } else if (!/^[1-9]\d*$/u.test(draft.discount_value)) {
      errors.discount_value = copy.valueInvalid;
    }
    if (parsePositiveInteger(draft.usage_limit).error) errors.usage_limit = copy.numberInvalid;
    else if (used && Number(draft.usage_limit) < (coupon?.used_count ?? 0))
      errors.usage_limit = copy.usageLimitBelowUsed;
    if (draft.minimum_amount && !/^[1-9]\d*$/u.test(draft.minimum_amount))
      errors.minimum_amount = copy.numberInvalid;
    if (draft.maximum_discount_amount && !/^[1-9]\d*$/u.test(draft.maximum_discount_amount))
      errors.maximum_discount_amount = copy.numberInvalid;
    if (draft.discount_type !== "percent" && draft.maximum_discount_amount)
      errors.maximum_discount_amount = copy.valueInvalid;
    const start = timestampForPayload(draft.starts_at, coupon?.starts_at);
    const end = timestampForPayload(draft.expires_at, coupon?.expires_at, true);
    if (!start) errors.starts_at = copy.dateInvalid;
    if (!end) errors.expires_at = copy.dateInvalid;
    const startDate = draft.starts_at.slice(0, 10);
    const endDate = draft.expires_at.slice(0, 10);
    if (startDate && endDate && endDate < startDate) errors.expires_at = copy.dateOrderInvalid;
    else if (start && end && Date.parse(end) <= Date.parse(start))
      errors.expires_at = copy.dateRangeInvalid;
    return errors;
  }

  const validationErrors = getValidationErrors();
  const formIsValid = Object.keys(validationErrors).length === 0;
  const visibleEndError =
    fieldErrors.expires_at ||
    (timestampForPayload(draft.starts_at) && timestampForPayload(draft.expires_at)
      ? validationErrors.expires_at
      : "");
  const visibleUsageLimitError =
    fieldErrors.usage_limit || (used ? validationErrors.usage_limit : "");

  function focusFirstError(errors: Record<string, string>) {
    const first = Object.keys(errors)[0];
    const targetId = {
      code: "coupon-code",
      discount_value: "coupon-value",
      usage_limit: "coupon-limit",
      maximum_discount_amount: "coupon-maximum-discount",
      starts_at: "coupon-start",
      expires_at: "coupon-end",
    }[first];
    if (targetId) document.getElementById(targetId)?.focus();
  }

  function payload() {
    return {
      code: draft.code.trim().toUpperCase(),
      discount_type: draft.discount_type,
      discount_value: draft.discount_value,
      usage_limit: Number(draft.usage_limit),
      starts_at: timestampForPayload(draft.starts_at, coupon?.starts_at),
      expires_at: timestampForPayload(draft.expires_at, coupon?.expires_at, true),
      minimum_amount: draft.minimum_amount || null,
      maximum_discount_amount:
        draft.discount_type === "percent" ? draft.maximum_discount_amount || null : null,
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = getValidationErrors();
    setFieldErrors(errors);
    if (busyRef.current || Object.keys(errors).length) {
      focusFirstError(errors);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setSubmitError("");
    try {
      const saved = await api<AdminCoupon>(
        savedId.current ? `admin/csa-coupons/${savedId.current}` : "admin/csa-coupons",
        {
          method: savedId.current ? "PATCH" : "POST",
          body: JSON.stringify(used ? { usage_limit: Number(draft.usage_limit) } : payload()),
        },
      );
      savedId.current = saved.id;
      setNeedsReload(true);
      try {
        const latest = await api<AdminCoupon>(`admin/csa-coupons/${saved.id}`);
        setCoupon(latest);
        setDraft(draftFromCoupon(latest));
        setNeedsReload(false);
        if (!couponId) router.replace(`/csa-coupons/${saved.id}`);
      } catch {
        setSubmitError(copy.reloadFailed);
      }
    } catch (error) {
      setSubmitError(couponErrorMessage(error, t));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!coupon || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await api<AdminCoupon>(`admin/csa-coupons/${coupon.id}/deactivate`, {
        method: "POST",
        body: "{}",
      });
      setConfirmDeactivate(false);
      setNeedsReload(true);
      try {
        const latest = await api<AdminCoupon>(`admin/csa-coupons/${coupon.id}`);
        setCoupon(latest);
        setDraft(draftFromCoupon(latest));
        setNeedsReload(false);
      } catch {
        setSubmitError(copy.reloadFailed);
      }
    } catch (error) {
      setSubmitError(couponErrorMessage(error, t));
      setConfirmDeactivate(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function activate() {
    if (!coupon || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await api<AdminCoupon>(`admin/csa-coupons/${coupon.id}/activate`, {
        method: "POST",
        body: "{}",
      });
      setNeedsReload(true);
      await reload();
    } catch (error) {
      setSubmitError(couponErrorMessage(error, t));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const headingTitle = couponId ? copy.editTitle : copy.createTitle;
  const headingDescription = couponId ? copy.editDescription : copy.createDescription;
  const headingAction = coupon ? (
    <div className="csa-coupon-heading-meta">
      <strong className="csa-coupon-code">{coupon.code}</strong>
      <span className={`badge csa-coupon-status ${coupon.status}`}>
        {copy.statuses[coupon.status]}
      </span>
    </div>
  ) : null;
  const header = (
    <PageHeading
      action={headingAction}
      backHref="/csa-coupons"
      backLabel={copy.back}
      description={headingDescription}
      title={headingTitle}
    />
  );

  if (loading)
    return (
      <>
        {header}
        <p className="panel" role="status">
          {copy.loading}
        </p>
      </>
    );
  if (couponId && !coupon && loadError)
    return (
      <>
        {header}
        <div className="error-box" role="alert">
          <p>{loadError}</p>
          <button className="button secondary" onClick={() => void reload()} type="button">
            {copy.retry}
          </button>
        </div>
      </>
    );

  return (
    <>
      {header}
      <div className="csa-coupon-editor">
        {used && <p className="field-help csa-coupon-read-only">{copy.readOnly}</p>}
        {needsReload && (
          <div className="error-box csa-coupon-global-error" role="alert">
            <p>{copy.reloadFailed}</p>
            <button className="button secondary" onClick={() => void reload()} type="button">
              {copy.retry}
            </button>
          </div>
        )}
        {loadError && !needsReload && (
          <p className="error-box csa-coupon-global-error" role="alert">
            {loadError}
          </p>
        )}
        {submitError && !needsReload && (
          <p className="error-box csa-coupon-global-error" role="alert">
            {submitError}
          </p>
        )}

        <form aria-busy={busy || loading} className="csa-coupon-form" noValidate onSubmit={submit}>
          <div className="csa-coupon-form-fields">
            <div className="field csa-coupon-form-row">
              <label htmlFor="coupon-code">{copy.code} *</label>
              <div className="csa-coupon-row-control">
                <input
                  aria-describedby={fieldErrors.code ? "coupon-code-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.code)}
                  className="input"
                  disabled={busy}
                  id="coupon-code"
                  onChange={(event) => update("code", event.target.value.toUpperCase())}
                  readOnly={used}
                  type="text"
                  value={draft.code}
                />
                {fieldErrors.code && (
                  <small className="field-error" id="coupon-code-error" role="alert">
                    {fieldErrors.code}
                  </small>
                )}
              </div>
            </div>

            <div className="field csa-coupon-form-row">
              <label htmlFor="coupon-type">{copy.discountType} *</label>
              <div className="csa-coupon-row-control">
                <select
                  className="input"
                  disabled={used || busy}
                  id="coupon-type"
                  onChange={(event) => {
                    update("discount_type", event.target.value as CouponDiscountType);
                    update("discount_value", "");
                    update("maximum_discount_amount", "");
                    setFocusedMoney(null);
                  }}
                  value={draft.discount_type}
                >
                  <option value="percent">{copy.types.percent}</option>
                  <option value="fixed">{copy.types.fixed}</option>
                </select>
              </div>
            </div>
            <div className="csa-coupon-offer-rows">
              <div className="field csa-coupon-form-row">
                <label htmlFor="coupon-value">{copy.discountValue} *</label>
                <div className="csa-coupon-offer-control">
                  <div className="csa-coupon-number-wrap">
                    <input
                      aria-describedby={
                        fieldErrors.discount_value ? "coupon-value-error" : undefined
                      }
                      aria-invalid={Boolean(fieldErrors.discount_value)}
                      className="input"
                      disabled={used || busy}
                      id="coupon-value"
                      inputMode={draft.discount_type === "percent" ? "decimal" : "numeric"}
                      onBlur={() => setFocusedMoney(null)}
                      onChange={(event) => {
                        const input = event.currentTarget;
                        const raw = input.value;
                        const percent = draft.discount_type === "percent";
                        const value = percent
                          ? parsePercentHundredths(raw) !== null
                            ? raw
                            : null
                          : normalizeMoneyInput(raw);
                        if (value === null) {
                          restoreRejectedInput(input, draft.discount_value);
                          return;
                        }
                        update("discount_value", value);
                        const scaled = percent ? parsePercentHundredths(value) : null;
                        if (scaled !== null && scaled > 10000n)
                          setFieldErrors((current) => ({
                            ...current,
                            discount_value: copy.valueInvalid,
                          }));
                      }}
                      onFocus={() => setFocusedMoney("discount_value")}
                      onKeyDown={(event) =>
                        preventInvalidNumericCharacter(event, draft.discount_type === "percent")
                      }
                      type="text"
                      value={
                        draft.discount_type === "fixed" && focusedMoney !== "discount_value"
                          ? formatMoneyInput(draft.discount_value, locale)
                          : draft.discount_value
                      }
                    />
                    <span aria-hidden="true">{draft.discount_type === "percent" ? "%" : "₫"}</span>
                  </div>
                  {fieldErrors.discount_value && (
                    <small className="field-error" id="coupon-value-error" role="alert">
                      {fieldErrors.discount_value}
                    </small>
                  )}
                </div>
              </div>
              {draft.discount_type === "percent" && (
                <div className="field csa-coupon-form-row">
                  <label htmlFor="coupon-maximum-discount">{copy.maximumDiscountAmount}</label>
                  <div className="csa-coupon-offer-control">
                    <div className="csa-coupon-number-wrap">
                      <input
                        aria-describedby={
                          fieldErrors.maximum_discount_amount
                            ? "coupon-maximum-discount-error"
                            : undefined
                        }
                        aria-invalid={Boolean(fieldErrors.maximum_discount_amount)}
                        className="input"
                        disabled={used || busy}
                        id="coupon-maximum-discount"
                        inputMode="numeric"
                        onBlur={() => setFocusedMoney(null)}
                        onChange={(event) => {
                          const value = normalizeMoneyInput(event.currentTarget.value);
                          if (value !== null) update("maximum_discount_amount", value);
                        }}
                        onFocus={() => setFocusedMoney("maximum_discount_amount")}
                        onKeyDown={(event) => preventInvalidNumericCharacter(event, false)}
                        type="text"
                        value={
                          focusedMoney === "maximum_discount_amount"
                            ? draft.maximum_discount_amount
                            : formatMoneyInput(draft.maximum_discount_amount, locale)
                        }
                      />
                      <span aria-hidden="true">₫</span>
                    </div>
                    {fieldErrors.maximum_discount_amount && (
                      <small
                        className="field-error"
                        id="coupon-maximum-discount-error"
                        role="alert"
                      >
                        {fieldErrors.maximum_discount_amount}
                      </small>
                    )}
                  </div>
                </div>
              )}
              <div className="field csa-coupon-form-row">
                <label htmlFor="coupon-limit">{copy.usageLimit} *</label>
                <div className="csa-coupon-offer-control">
                  <input
                    aria-describedby={visibleUsageLimitError ? "coupon-limit-error" : undefined}
                    aria-invalid={Boolean(visibleUsageLimitError)}
                    className="input"
                    disabled={busy}
                    id="coupon-limit"
                    inputMode="numeric"
                    onChange={(event) => {
                      const raw = event.currentTarget.value;
                      if (/^\d*$/u.test(raw)) update("usage_limit", raw);
                    }}
                    onKeyDown={(event) => preventInvalidNumericCharacter(event, false)}
                    type="text"
                    value={draft.usage_limit}
                  />
                  {visibleUsageLimitError && (
                    <small className="field-error" id="coupon-limit-error" role="alert">
                      {visibleUsageLimitError}
                    </small>
                  )}
                </div>
              </div>
              <div className="field csa-coupon-form-row">
                <label htmlFor="coupon-minimum">{copy.minimumAmount}</label>
                <div className="csa-coupon-offer-control">
                  <div className="csa-coupon-number-wrap">
                    <input
                      aria-describedby={
                        fieldErrors.minimum_amount ? "coupon-minimum-error" : undefined
                      }
                      aria-invalid={Boolean(fieldErrors.minimum_amount)}
                      className="input"
                      disabled={used || busy}
                      id="coupon-minimum"
                      inputMode="numeric"
                      onBlur={() => setFocusedMoney(null)}
                      onChange={(event) => {
                        const value = normalizeMoneyInput(event.currentTarget.value);
                        if (value !== null) update("minimum_amount", value);
                      }}
                      onFocus={() => setFocusedMoney("minimum_amount")}
                      onKeyDown={(event) => preventInvalidNumericCharacter(event, false)}
                      type="text"
                      value={
                        focusedMoney === "minimum_amount"
                          ? draft.minimum_amount
                          : formatMoneyInput(draft.minimum_amount, locale)
                      }
                    />
                    <span aria-hidden="true">₫</span>
                  </div>
                  {fieldErrors.minimum_amount && (
                    <small className="field-error" id="coupon-minimum-error" role="alert">
                      {fieldErrors.minimum_amount}
                    </small>
                  )}
                </div>
              </div>
            </div>

            <div className="csa-coupon-date-grid">
              <div className="field">
                <label htmlFor="coupon-start">{copy.startsAt} *</label>
                <input
                  aria-describedby={fieldErrors.starts_at ? "coupon-start-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.starts_at)}
                  className="input"
                  disabled={used || busy}
                  id="coupon-start"
                  lang={locale}
                  onChange={(event) => update("starts_at", event.target.value)}
                  step={60}
                  type="datetime-local"
                  value={draft.starts_at}
                />
                {fieldErrors.starts_at && (
                  <small className="field-error" id="coupon-start-error" role="alert">
                    {fieldErrors.starts_at}
                  </small>
                )}
              </div>
              <div className="field">
                <label htmlFor="coupon-end">{copy.expiresAt} *</label>
                <input
                  aria-describedby={visibleEndError ? "coupon-end-error" : undefined}
                  aria-invalid={Boolean(visibleEndError)}
                  className="input"
                  disabled={used || busy}
                  id="coupon-end"
                  lang={locale}
                  min={draft.starts_at || undefined}
                  onChange={(event) => update("expires_at", event.target.value)}
                  step={60}
                  type="datetime-local"
                  value={draft.expires_at}
                />
                {visibleEndError && (
                  <small className="field-error" id="coupon-end-error" role="alert">
                    {visibleEndError}
                  </small>
                )}
              </div>
            </div>
            <p className="field-help">{copy.timeZone}</p>
          </div>

          <div className="csa-coupon-form-actions">
            <button
              className="button"
              disabled={busy || needsReload || loading || !formIsValid}
              type="submit"
            >
              {busy ? copy.saving : coupon ? copy.saveChanges : copy.save}
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => router.push("/csa-coupons")}
              type="button"
            >
              {copy.cancel}
            </button>
            {coupon &&
              (coupon.is_active ? (
                <button
                  className="button danger"
                  disabled={busy || needsReload}
                  onClick={() => setConfirmDeactivate(true)}
                  type="button"
                >
                  {copy.deactivate}
                </button>
              ) : (
                <button
                  className="button secondary"
                  disabled={busy || needsReload}
                  onClick={() => void activate()}
                  type="button"
                >
                  {copy.activate}
                </button>
              ))}
          </div>
        </form>
        {confirmDeactivate && (
          <ConfirmationDialog
            busy={busy}
            busyLabel={copy.saving}
            cancelLabel={copy.cancel}
            confirmLabel={copy.deactivate}
            danger
            onCancel={() => setConfirmDeactivate(false)}
            onConfirm={() => void deactivate()}
            title={copy.deactivate}
          >
            <p>{copy.confirmDeactivate}</p>
          </ConfirmationDialog>
        )}
      </div>
    </>
  );
}
