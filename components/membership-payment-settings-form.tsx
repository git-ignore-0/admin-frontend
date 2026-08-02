"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";
import { useToast } from "@/components/toast-provider";
import { api } from "@/lib/client-api";
import { requestErrorMessage } from "@/lib/client-error";
import type { MembershipBankOption, MembershipPaymentSettings } from "@/lib/types";

type FormState = Pick<
  MembershipPaymentSettings,
  "direct_transfer_enabled" | "bank_bin" | "bank_name" | "account_number" | "account_name"
>;
type FieldName = "bank_bin" | "account_number" | "account_name";
type FieldErrors = Partial<Record<FieldName, string>>;

const emptyForm: FormState = {
  direct_transfer_enabled: false,
  bank_bin: "",
  bank_name: "",
  account_number: "",
  account_name: "",
};

export function MembershipPaymentSettingsForm() {
  const { t } = useAdminI18n();
  const toast = useToast();
  const savingRef = useRef(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [exists, setExists] = useState(false);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [banks, setBanks] = useState<MembershipBankOption[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [banksFailed, setBanksFailed] = useState(false);
  const [bankSearch, setBankSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    setError("");
    try {
      const current = await api<MembershipPaymentSettings | null>(
        "admin/membership-payment-settings",
      );
      setExists(Boolean(current));
      setForm(current ?? emptyForm);
      setVersion(current?.version ?? 0);
      setFieldErrors({});
    } catch (caught) {
      setLoadFailed(true);
      setError(requestErrorMessage(caught, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadBanks = useCallback(async () => {
    setBanksLoading(true);
    setBanksFailed(false);
    try {
      setBanks(await api<MembershipBankOption[]>("admin/membership-banks"));
    } catch {
      setBanks([]);
      setBanksFailed(true);
    } finally {
      setBanksLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadBanks();
  }, [load, loadBanks]);

  const filteredBanks = useMemo(() => {
    const query = bankSearch.trim().toLocaleLowerCase();
    if (!query) return banks;
    return banks.filter((bank) =>
      `${bank.name} ${bank.short_name} ${bank.code}`.toLocaleLowerCase().includes(query),
    );
  }, [bankSearch, banks]);

  function update(field: "account_number" | "account_name", value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validatePaymentDetails(current: FormState, required: boolean) {
    const errors: FieldErrors = {};
    const bankIsAvailable = banks.some((bank) => bank.bin === current.bank_bin);
    if (current.bank_bin) {
      if (banksLoading || banksFailed || !bankIsAvailable) {
        errors.bank_bin = t.membershipSettings.bankUnavailable;
      }
    } else if (required) {
      errors.bank_bin = banksFailed
        ? t.membershipSettings.bankUnavailable
        : t.membershipSettings.required;
    }

    if (current.account_number) {
      if (!/^\d{6,19}$/.test(current.account_number)) {
        errors.account_number = t.membershipSettings.accountNumberInvalid;
      }
    } else if (required) {
      errors.account_number = t.membershipSettings.required;
    }
    if (!current.account_name.trim() && required) {
      errors.account_name = t.membershipSettings.required;
    }
    return errors;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    const validationErrors = validatePaymentDetails(form, form.direct_transfer_enabled);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await api<MembershipPaymentSettings>("admin/membership-payment-settings", {
        method: exists ? "PATCH" : "PUT",
        body: JSON.stringify({
          direct_transfer_enabled: form.direct_transfer_enabled,
          bank_bin: form.bank_bin,
          account_number: form.account_number,
          account_name: form.account_name.trim(),
          version,
        }),
      });
      setExists(true);
      setForm(saved);
      setVersion(saved.version);
      toast(t.membershipSettings.saved);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === "payment_settings_conflict"
          ? t.membershipSettings.conflict
          : requestErrorMessage(caught, t, t.membershipSettings.fieldLabels),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loading) return <div className="panel">{t.membershipSettings.loading}</div>;
  if (loadFailed)
    return (
      <div className="panel load-error-state">
        <p className="error-box" role="alert">
          {error}
        </p>
        <button className="button secondary" onClick={() => void load()} type="button">
          {t.common.retry}
        </button>
      </div>
    );

  return (
    <form className="panel membership-settings-form" noValidate onSubmit={submit}>
      <div className="panel-head">
        <div>
          <h2>{t.membershipSettings.title}</h2>
          <p className="muted-copy">{t.membershipSettings.snapshotHelp}</p>
        </div>
      </div>
      {error ? (
        <div className="error-box retry-error" role="alert">
          <span>{error}</span>
          <button
            className="button secondary"
            disabled={saving}
            onClick={() => void load()}
            type="button"
          >
            {t.common.retry}
          </button>
        </div>
      ) : null}
      <div className="form-grid one">
        <label className="checkbox membership-payment-toggle">
          <input
            aria-label={t.membershipSettings.directTransferEnabled}
            checked={form.direct_transfer_enabled}
            disabled={saving || banksLoading || banksFailed}
            onChange={(event) => {
              if (!event.target.checked) {
                setForm((current) => ({ ...current, direct_transfer_enabled: false }));
                setFieldErrors({});
                return;
              }
              const validationErrors = validatePaymentDetails(form, true);
              setFieldErrors(validationErrors);
              if (Object.keys(validationErrors).length === 0) {
                setForm((current) => ({ ...current, direct_transfer_enabled: true }));
              }
            }}
            type="checkbox"
          />
          <span>
            <strong>{t.membershipSettings.directTransferEnabled}</strong>
            <small>
              {form.direct_transfer_enabled
                ? t.membershipSettings.enabledHelp
                : t.membershipSettings.disabledHelp}
            </small>
          </span>
        </label>

        <div className="field membership-bank-picker">
          <label htmlFor="membership-bank-search">{t.membershipSettings.bankSearch}</label>
          <input
            className="input"
            disabled={saving || banksLoading || banksFailed}
            id="membership-bank-search"
            onChange={(event) => setBankSearch(event.target.value)}
            type="search"
            value={bankSearch}
          />
          {banksLoading ? (
            <p className="muted-copy" aria-live="polite">
              {t.membershipSettings.banksLoading}
            </p>
          ) : banksFailed ? (
            <div className="bank-options-error">
              <p className="field-error" role="alert">
                {t.membershipSettings.bankLoadError}
              </p>
              <button
                className="button secondary"
                disabled={saving}
                onClick={() => void loadBanks()}
                type="button"
              >
                {t.common.retry}
              </button>
            </div>
          ) : (
            <>
              <label htmlFor="membership-bank">{t.membershipSettings.bankCode}</label>
              <select
                aria-invalid={Boolean(fieldErrors.bank_bin)}
                className="input"
                disabled={saving}
                id="membership-bank"
                onChange={(event) => {
                  const selected = banks.find((bank) => bank.bin === event.target.value);
                  setForm((current) => ({
                    ...current,
                    bank_bin: selected?.bin ?? "",
                    bank_name: selected?.name ?? "",
                  }));
                  setFieldErrors((current) => ({ ...current, bank_bin: undefined }));
                }}
                value={
                  filteredBanks.some((bank) => bank.bin === form.bank_bin) ? form.bank_bin : ""
                }
              >
                <option value="">{t.membershipSettings.bankPlaceholder}</option>
                {filteredBanks.map((bank) => (
                  <option key={bank.bin} value={bank.bin}>
                    {bank.short_name} — {bank.code}
                  </option>
                ))}
              </select>
              {filteredBanks.length === 0 ? (
                <p className="muted-copy">{t.membershipSettings.noBanks}</p>
              ) : null}
            </>
          )}
          {fieldErrors.bank_bin ? (
            <small className="field-error" role="alert">
              {fieldErrors.bank_bin}
            </small>
          ) : null}
        </div>

        <label className="field">
          <span>{t.membershipSettings.accountNumber}</span>
          <input
            aria-invalid={Boolean(fieldErrors.account_number)}
            aria-label={t.membershipSettings.accountNumber}
            className="input"
            disabled={saving}
            inputMode="numeric"
            maxLength={19}
            onChange={(event) =>
              update("account_number", event.target.value.replace(/\D/g, "").slice(0, 19))
            }
            value={form.account_number}
          />
          {fieldErrors.account_number ? (
            <small className="field-error" role="alert">
              {fieldErrors.account_number}
            </small>
          ) : null}
        </label>
        <label className="field">
          <span>{t.membershipSettings.accountName}</span>
          <input
            aria-invalid={Boolean(fieldErrors.account_name)}
            aria-label={t.membershipSettings.accountName}
            className="input"
            disabled={saving}
            maxLength={160}
            onChange={(event) => update("account_name", event.target.value)}
            value={form.account_name}
          />
          {fieldErrors.account_name ? (
            <small className="field-error" role="alert">
              {fieldErrors.account_name}
            </small>
          ) : null}
        </label>
      </div>
      <div className="form-actions">
        <button className="button" disabled={saving} type="submit">
          {saving ? t.membershipSettings.saving : t.membershipSettings.save}
        </button>
      </div>
    </form>
  );
}
